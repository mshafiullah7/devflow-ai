import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelPicker } from '../../components/model-picker/model-picker.js';
import { ModelConfigsModal } from '../../components/model-configs/model-configs-modal.js';

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '').replace(/\x1B\][^\x07]*\x07/g, '');
}

function relativeTime(isoString) {
  const diff = Math.floor((Date.now() - new Date(isoString + 'Z').getTime()) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function parseResults(text) {
  const results = { passed: null, failed: null, skipped: null, duration: null };

  // Cypress: "42 passing (3s)" / "2 failing" / "1 pending"
  const cyPass = text.match(/(\d+)\s+passing/i);
  const cyFail = text.match(/(\d+)\s+failing/i);
  const cyPend = text.match(/(\d+)\s+pending/i);
  const cyDur  = text.match(/(\d+)\s+passing\s+\(([^)]+)\)/i);
  if (cyPass) {
    results.passed  = parseInt(cyPass[1]);
    results.failed  = cyFail ? parseInt(cyFail[1]) : 0;
    results.skipped = cyPend ? parseInt(cyPend[1]) : 0;
    if (cyDur) results.duration = cyDur[2];
    return results;
  }

  // Jest: "Tests: 42 passed, 1 failed, 43 total"
  const jestLine = text.match(/Tests:\s*([\d\s\w,]+)/i);
  if (jestLine) {
    const p = jestLine[0].match(/(\d+)\s+passed/);
    const f = jestLine[0].match(/(\d+)\s+failed/);
    const s = jestLine[0].match(/(\d+)\s+skipped/);
    const d = text.match(/Time:\s+([\d.]+\s*s)/i);
    if (p || f) {
      results.passed  = p ? parseInt(p[1]) : 0;
      results.failed  = f ? parseInt(f[1]) : 0;
      results.skipped = s ? parseInt(s[1]) : 0;
      if (d) results.duration = d[1];
      return results;
    }
  }

  // Flutter: "+42: All tests passed!" or "+40 -2: X tests failed"
  const flutterAll  = text.match(/\+(\d+):\s*All tests passed/i);
  const flutterFail = text.match(/\+(\d+)\s+-(\d+):/);
  if (flutterAll) { results.passed = parseInt(flutterAll[1]); results.failed = 0; return results; }
  if (flutterFail) { results.passed = parseInt(flutterFail[1]); results.failed = parseInt(flutterFail[2]); return results; }

  // Playwright: "X passed (Xs)"
  const pwPass = text.match(/(\d+)\s+passed\s+\(([^)]+)\)/i);
  const pwFail = text.match(/(\d+)\s+failed/i);
  if (pwPass) {
    results.passed  = parseInt(pwPass[1]);
    results.failed  = pwFail ? parseInt(pwFail[1]) : 0;
    results.duration = pwPass[2];
    return results;
  }

  // Angular/Karma: "Executed 42 of 42 SUCCESS"
  const karmaPass = text.match(/Executed\s+(\d+)\s+of\s+\d+\s+SUCCESS/i);
  const karmaFail = text.match(/(\d+)\s+FAILED/i);
  if (karmaPass) {
    results.passed = parseInt(karmaPass[1]);
    results.failed = karmaFail ? parseInt(karmaFail[1]) : 0;
    return results;
  }

  return results;
}

export class TestRunnerPage {
  constructor(container, params, router) {
    this.container      = container;
    this.router         = router;
    this._projectId     = params.projectId;
    this._project       = null;
    this._layers        = [];
    this._activeLayerId = null; // 'root' or numeric layer id
    this._commands      = [];
    this._running       = false;
    this._outputText    = '';
    this._activeEntry   = null; // command entry currently running
    this._history       = [];
    this._lastRunId     = null; // DB id of the most recent test run (for dedup)
    this._modelCfg      = null;
    this._picker        = null;
    this._modelConfigsModal = null;
  }

  async mount() {
    injectCss('pages/user-stories/user-stories.css');
    injectCss('pages/test-runner/test-runner-page.css');
    applyStoredTheme();

    this._project    = await window.db.projects.get(this._projectId);
    this._activeCwd = this._project?.project_path || null;
    const _mapping = await window.db.modelMapping.get('test-runner');
    this.container.innerHTML = this._template();

    // Model picker — initialId comes from Settings model mapping for 'test-runner'
    this._picker = new ModelPicker({
      anchor:    this.container.querySelector('#trModelPicker'),
      onSelect:  model => { this._modelCfg = model; },
      initialId: _mapping?.model_config_id ?? null,
    });
    await this._picker.reload();

    // Model configs modal
    this._modelConfigsModal = new ModelConfigsModal({
      onConfigsChanged: () => this._picker?.reload(),
    });
    this._modelConfigsModal.mount();

    this._bindHeaderEvents();

    // Load history first so the panel is populated immediately
    this._history = await window.db.testRunHistory.list(this._projectId);
    this._renderHistory();

    // Load layers and render the sidebar
    const allLayers = await window.db.projectLayers.list(this._projectId);
    this._layers = allLayers.filter(l => l.folder_path);
    this._renderLayerSidebar();

    // Auto-select: first layer with a folder, or project root
    const firstLayer = this._layers[0];
    if (firstLayer) {
      this._activeLayerId = firstLayer.id;
      this._activeCwd = firstLayer.folder_path;
      this._renderLayerSidebar();
    }

    if (this._activeCwd) {
      await this._detectFrameworks(this._activeCwd);
    } else {
      this._showNoFolder();
    }

    window.db.testRunner.onData(({ text }) => this._appendOutput(text));
    window.db.testRunner.onDone(({ exitCode }) => this._onRunDone(exitCode));
  }

  unmount() {
    removeCss('pages/test-runner/test-runner-page.css');
    removeCss('pages/user-stories/user-stories.css');
    this._picker?.unmount();
    window.db.testRunner.removeListeners();
    window.db.promptQueue.removeListeners();
    if (this._running) window.db.testRunner.kill();
  }

  // ----------------------------------------------------------------
  // Template
  // ----------------------------------------------------------------
  _template() {
    const name = this._project ? escHtml(this._project.name) : 'Project';
    return `
      <div class="project-page">

        <header class="project-page__header">
          <button class="project-page__back" id="trBtnBack" aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="project-page__title-group">
            <h1 class="project-page__title">${name}</h1>
            <p class="project-page__desc">Test Runner</p>
          </div>
          <div class="project-page__model-group tr-header__model" style="-webkit-app-region:no-drag;">
            <div id="trModelPicker"></div>
          </div>
        </header>

        <div class="tr-body">

          <!-- Layer sidebar -->
          <aside class="tr-sidebar" id="trSidebar"></aside>

          <div class="tr-main-content">

          <!-- Command bar -->
          <div class="tr-command-bar">
            <div class="tr-framework-badge" id="trFrameworkBadge" hidden></div>
            <select class="tr-command-select" id="trCommandSelect" hidden>
              <option value="">Select a command…</option>
            </select>
            <div class="tr-run-controls">
              <button class="tr-run-btn" id="trRunBtn" disabled title="Run Tests (Ctrl+Enter)">
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                  <polygon points="4 3 18 10 4 17" fill="currentColor"/>
                </svg>
                Run Tests
              </button>
              <button class="tr-stop-btn" id="trStopBtn" hidden title="Stop (Escape)">
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                  <rect x="2" y="2" width="10" height="10" rx="1" fill="currentColor"/>
                </svg>
                Stop
              </button>
            </div>
          </div>

          <!-- Results summary (shown after run) -->
          <div class="tr-results-bar" id="trResultsBar" hidden>
            <span class="tr-result tr-result--pass" id="trPassResult" hidden>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M3 8l3.5 3.5L13 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span id="trPassCount">0</span> passed
            </span>
            <span class="tr-result tr-result--fail" id="trFailResult" hidden>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              <span id="trFailCount">0</span> failed
            </span>
            <span class="tr-result tr-result--skip" id="trSkipResult" hidden>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M8 5v3M8 11h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <span id="trSkipCount">0</span> skipped
            </span>
            <span class="tr-result tr-result--duration" id="trDuration" hidden></span>
            <span class="tr-result tr-result--exit" id="trExitCode" hidden></span>
            <div class="tr-results-actions" id="trResultsActions" hidden>
              <button class="tr-log-issue-btn" id="trLogIssueBtn">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.6"/>
                  <path d="M8 5v3M8 11h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                </svg>
                Log as Issue
              </button>
            </div>
          </div>

          <!-- Console + History split -->
          <div class="tr-panels">

            <!-- 70% — live console output -->
            <div class="tr-output-wrap" id="trOutputWrap">
              <div class="tr-output-empty" id="trOutputEmpty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                <p id="trOutputEmptyMsg">Select a project folder to detect test commands</p>
              </div>
              <pre class="tr-output" id="trOutput" hidden></pre>
            </div>

            <!-- Divider -->
            <div class="tr-panels__divider"></div>

            <!-- 30% — run history -->
            <div class="tr-history-panel">
              <div class="tr-history-header">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M8 5v3.5l2 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Last Runs
              </div>
              <!-- Last run: fills remaining panel height; pre scrolls inside it -->
              <div class="tr-last-run-section" id="trLastRunSection">
                <div class="tr-history-empty">No runs yet</div>
              </div>
              <!-- Previous runs: capped height, independently scrollable -->
              <div class="tr-prev-runs-section" id="trPrevRunsSection" hidden></div>
            </div>

          </div>

          </div><!-- /.tr-main-content -->
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // Header events
  // ----------------------------------------------------------------
  _bindHeaderEvents() {
    this.container.querySelector('#trBtnBack')
      .addEventListener('click', () => {
        if (this._running) {
          this._confirmCancelAndNavigate();
        } else {
          this.router.navigate('project-home', { projectId: this._projectId });
        }
      });

    this.container.querySelector('#trSidebar')
      ?.addEventListener('click', e => {
        const item = e.target.closest('.tr-layer-item');
        if (!item) return;
        const layerId = item.dataset.layerId;
        this._selectSidebarLayer(layerId);
      });

    this.container.querySelector('#trRunBtn')
      .addEventListener('click', () => this._runTests());

    this.container.querySelector('#trStopBtn')
      .addEventListener('click', () => this._stopTests());

    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, select, [contenteditable]')) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === 'Enter') {
        e.preventDefault();
        const runBtn = this.container.querySelector('#trRunBtn');
        if (runBtn && !runBtn.hidden && !runBtn.disabled) runBtn.click();
      }
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey) {
        const stopBtn = this.container.querySelector('#trStopBtn');
        if (stopBtn && !stopBtn.hidden) { e.preventDefault(); stopBtn.click(); }
      }
    });
  }

  _confirmCancelAndNavigate() {
    const overlay = document.createElement('div');
    overlay.className = 'tr-modal-overlay';
    overlay.innerHTML = `
      <div class="tr-modal tr-modal--sm">
        <div class="tr-modal__header">
          <h2 class="tr-modal__title">Tests Running</h2>
        </div>
        <div class="tr-modal__body">
          <p class="tr-fc-summary">Navigating back will cancel the current test run.</p>
          <p class="tr-fc-hint">Any results collected so far will be lost.</p>
        </div>
        <div class="tr-modal__footer">
          <button class="tr-modal__btn tr-modal__btn--cancel" id="trCancelNavStay">Stay</button>
          <button class="tr-modal__btn tr-modal__btn--save tr-modal__btn--danger-solid" id="trCancelNavGo">Cancel &amp; Go Back</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector('#trCancelNavStay').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#trCancelNavGo').addEventListener('click', () => {
      overlay.remove();
      this.router.navigate('project-home', { projectId: this._projectId });
    });
  }

  // ----------------------------------------------------------------
  // Layer sidebar
  // ----------------------------------------------------------------
  _renderLayerSidebar() {
    const sidebar = this.container.querySelector('#trSidebar');
    if (!sidebar) return;

    const hasProjectRoot = !!this._project?.project_path;
    const items = [];

    if (hasProjectRoot) {
      const isActive = this._activeLayerId === 'root';
      items.push(`
        <div class="tr-layer-item ${isActive ? 'tr-layer-item--active' : ''}" data-layer-id="root">
          <span class="tr-layer-item__name">${escHtml(this._project.name)}</span>
          <span class="tr-layer-item__path">${escHtml(this._project.project_path)}</span>
        </div>`);
    }

    for (const l of this._layers) {
      const isActive = this._activeLayerId === l.id;
      items.push(`
        <div class="tr-layer-item ${isActive ? 'tr-layer-item--active' : ''}" data-layer-id="${l.id}">
          <span class="tr-layer-item__name">${escHtml(l.name)}</span>
          <span class="tr-layer-item__path">${escHtml(l.folder_path)}</span>
        </div>`);
    }

    if (!items.length) {
      sidebar.innerHTML = `<div class="tr-sidebar-empty">No layers configured.<br>Add layers in Project Layers.</div>`;
    } else {
      sidebar.innerHTML = items.join('');
    }
  }

  async _selectSidebarLayer(layerId) {
    if (layerId === 'root') {
      this._activeLayerId = 'root';
      this._activeCwd = this._project?.project_path || null;
    } else {
      const id    = parseInt(layerId, 10);
      const layer = this._layers.find(l => l.id === id);
      if (!layer) return;
      this._activeLayerId = layer.id;
      this._activeCwd = layer.folder_path;
    }
    this._renderLayerSidebar();
    if (this._activeCwd) await this._detectFrameworks(this._activeCwd);
  }

  // ----------------------------------------------------------------
  // Framework detection
  // ----------------------------------------------------------------
  async _detectFrameworks(projectPath) {
    this._commands = await window.db.testRunner.detect(projectPath);

    const badge   = this.container.querySelector('#trFrameworkBadge');
    const select  = this.container.querySelector('#trCommandSelect');
    const runBtn  = this.container.querySelector('#trRunBtn');
    const msg     = this.container.querySelector('#trOutputEmptyMsg');
    const empty   = this.container.querySelector('#trOutputEmpty');

    if (this._commands.length === 0) {
      badge.hidden    = true;
      select.hidden   = true;
      runBtn.disabled = true;
      if (msg) msg.textContent = 'No test framework detected. Ensure the folder contains package.json (Angular/Cypress/Jest/Playwright) or pubspec.yaml (Flutter).';
      return;
    }

    const frameworks = [...new Set(this._commands.map(c => c.framework))];
    badge.textContent = frameworks.join(' · ');
    badge.hidden  = false;

    select.innerHTML = this._commands
      .map(c => `<option value="${escHtml(c.id)}">${escHtml(c.label)}</option>`)
      .join('');
    select.hidden   = false;
    runBtn.disabled = false;

    if (msg) msg.textContent = 'Press Run Tests to start.';
    if (empty) empty.style.display = '';
  }

  _showNoFolder() {
    const msg = this.container.querySelector('#trOutputEmptyMsg');
    if (msg) msg.textContent = 'Select a project folder to detect test commands.';
  }

  // ----------------------------------------------------------------
  // Run / Stop
  // ----------------------------------------------------------------
  async _runTests() {
    const select = this.container.querySelector('#trCommandSelect');
    const cmdId  = select?.value;
    const entry  = this._commands.find(c => c.id === cmdId) || this._commands[0];
    if (!entry) return;

    this._running      = true;
    this._outputText   = '';
    this._activeEntry  = entry;

    const output  = this.container.querySelector('#trOutput');
    const empty   = this.container.querySelector('#trOutputEmpty');
    const results = this.container.querySelector('#trResultsBar');
    const runBtn  = this.container.querySelector('#trRunBtn');
    const stopBtn = this.container.querySelector('#trStopBtn');

    output.textContent = `> ${entry.cmd}\n\n`;
    output.hidden = false;
    if (empty)   empty.style.display = 'none';
    if (results) results.hidden = true;

    runBtn.hidden  = true;
    stopBtn.hidden = false;

    await window.db.testRunner.run({
      command: entry.cmd,
      cwd:     this._activeCwd || this._project?.project_path || undefined,
    });
  }

  _stopTests() {
    window.db.testRunner.kill();
    this._setRunIdle();
    this._appendOutput('\n[Stopped by user]\n');
  }

  _setRunIdle() {
    const runBtn  = this.container.querySelector('#trRunBtn');
    const stopBtn = this.container.querySelector('#trStopBtn');
    if (runBtn)  { runBtn.hidden = false; runBtn.disabled = false; }
    if (stopBtn)   stopBtn.hidden = true;
    this._running = false;
  }

  // ----------------------------------------------------------------
  // Output streaming
  // ----------------------------------------------------------------
  _appendOutput(rawText) {
    const clean = stripAnsi(rawText);
    this._outputText += clean;
    const output = this.container.querySelector('#trOutput');
    if (!output) return;
    output.textContent += clean;
    output.scrollTop = output.scrollHeight;
  }

  async _onRunDone(exitCode) {
    this._setRunIdle();
    const results = parseResults(this._outputText);
    this._showResults(exitCode, results);
    await this._saveRun(exitCode, results);
    this._notifyTelegram(exitCode, results);
    await this._autoQueueFailures(exitCode);
  }

  _notifyTelegram(exitCode, results) {
    const projectName = this._project?.name || 'Unknown Project';
    const command     = this._activeEntry?.cmd || '';
    const passed      = results.passed  ?? 0;
    const failed      = results.failed  ?? 0;
    const icon        = (failed > 0 || exitCode !== 0) ? '❌' : '✅';
    const status      = (failed > 0 || exitCode !== 0) ? 'Tests Failed' : 'Tests Passed';
    const lines = [
      `${icon} *DevFlow: ${status}*`,
      `Project: \`${projectName}\``,
      `Command: \`${command}\``,
      `Tests: ${passed} passed, ${failed} failed`,
    ];
    if (results.duration) lines.push(`Duration: ${results.duration}`);
    window.app.telegram.send(lines.join('\n'));
  }

  // ----------------------------------------------------------------
  // Results summary bar
  // ----------------------------------------------------------------
  _showResults(exitCode, results) {
    const bar = this.container.querySelector('#trResultsBar');
    if (!bar) return;

    const setResult = (id, value, show) => {
      const el = this.container.querySelector(`#${id}`);
      if (!el) return;
      el.hidden = !show;
      const countEl = el.querySelector('span[id]');
      if (countEl && value !== null) countEl.textContent = value;
    };

    setResult('trPassResult', results.passed,  results.passed  !== null);
    setResult('trFailResult', results.failed,  results.failed  !== null);
    setResult('trSkipResult', results.skipped, results.skipped !== null && results.skipped > 0);

    const durEl  = this.container.querySelector('#trDuration');
    const exitEl = this.container.querySelector('#trExitCode');

    if (durEl) {
      durEl.hidden      = !results.duration;
      durEl.textContent = results.duration ? `Duration: ${results.duration}` : '';
    }

    const showExit = results.passed === null && results.failed === null;
    if (exitEl) {
      exitEl.hidden      = !showExit;
      exitEl.textContent = showExit ? `Exit code: ${exitCode}` : '';
      exitEl.className   = `tr-result ${exitCode === 0 ? 'tr-result--pass' : 'tr-result--fail'}`;
    }

    const hasFailed = (results.failed !== null && results.failed > 0) || exitCode !== 0;
    const actionsEl = this.container.querySelector('#trResultsActions');
    if (actionsEl) actionsEl.hidden = !hasFailed;

    const logBtn = this.container.querySelector('#trLogIssueBtn');
    if (logBtn) {
      logBtn.onclick = () => this._showLogIssueModal(results, exitCode);
    }

    bar.hidden = false;
  }

  // ----------------------------------------------------------------
  // Log as Issue modal
  // ----------------------------------------------------------------
  _buildActualText(results, exitCode) {
    const parts = [];
    if (results.failed  !== null && results.failed  > 0) parts.push(`${results.failed} failed`);
    if (results.passed  !== null && results.passed  > 0) parts.push(`${results.passed} passed`);
    if (results.skipped !== null && results.skipped > 0) parts.push(`${results.skipped} skipped`);
    if (results.duration) parts.push(`duration: ${results.duration}`);
    const summary = parts.length ? parts.join(', ') : `exit code ${exitCode}`;
    return `Test run finished with failures (${summary}).`;
  }

  _extractErrorSnippet(output) {
    if (!output) return '';
    const initialFailures = this._extractTestFailures(output);
    if (!initialFailures.length) return output.trim();

    let failures = initialFailures;
    const rawSections = this._extractRawSections(output);
    if (rawSections) {
      const rawBlocks = rawSections
        .split(/\n(?=\[\d+\]\n)/)
        .map(s => s.trim())
        .filter(s => s);
      if (rawBlocks.length === initialFailures.length) {
        failures = initialFailures.map((f, i) => ({
          name: f.name,
          body: rawBlocks[i].replace(/^\[\d+\]\s*\n?/, '').trim(),
        }));
      }
    }

    const grouped = this._groupFailuresByFile(failures);
    return grouped.map(g => `--- ${g._file}\n\n${g.body}`).join('\n\n');
  }

  async _showLogIssueModal(results, exitCode, overrides = {}) {
    const framework = overrides.framework ?? (this._activeEntry?.framework ?? '');
    const command   = overrides.command   ?? (this._activeEntry?.cmd        ?? '');
    const outputSrc = overrides.output    ?? this._outputText;

    const title    = framework ? `${framework} test failure` : 'Test failure';
    const steps    = command   ? `$ ${command}` : '';
    const expected = 'All tests should pass.';
    const actual   = this._buildActualText(results, exitCode);
    const snippet  = this._extractErrorSnippet(outputSrc);

    const overlay = document.createElement('div');
    overlay.className = 'tr-modal-overlay';
    overlay.innerHTML = `
      <div class="tr-modal">
        <div class="tr-modal__header">
          <h2 class="tr-modal__title">Log as Issue</h2>
          <button class="tr-modal__close" id="trModalClose" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <div class="tr-modal__body">

          <div class="tr-modal__row tr-modal__row--2col">
            <div class="tr-modal__field">
              <label class="tr-modal__label" for="trMSeverity">Severity</label>
              <select class="tr-modal__select" id="trMSeverity">
                <option value="critical">Critical</option>
                <option value="high" selected>High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div class="tr-modal__field">
              <label class="tr-modal__label" for="trMStatus">Status</label>
              <select class="tr-modal__select" id="trMStatus">
                <option value="open" selected>Open</option>
                <option value="in_progress">In Progress</option>
              </select>
            </div>
          </div>

          <div class="tr-modal__field">
            <label class="tr-modal__label" for="trMTitle">Title <span class="tr-modal__required">*</span></label>
            <input class="tr-modal__input" id="trMTitle" type="text" maxlength="200"
              value="${escHtml(title)}" autocomplete="off"/>
          </div>

          <div class="tr-modal__field">
            <label class="tr-modal__label" for="trMSteps">Steps to Reproduce</label>
            <textarea class="tr-modal__textarea tr-modal__textarea--sm" id="trMSteps">${escHtml(steps)}</textarea>
          </div>

          <div class="tr-modal__row tr-modal__row--2col">
            <div class="tr-modal__field">
              <label class="tr-modal__label" for="trMExpected">Expected Behavior</label>
              <textarea class="tr-modal__textarea tr-modal__textarea--sm" id="trMExpected">${escHtml(expected)}</textarea>
            </div>
            <div class="tr-modal__field">
              <label class="tr-modal__label" for="trMActual">Actual Behavior</label>
              <textarea class="tr-modal__textarea tr-modal__textarea--sm" id="trMActual">${escHtml(actual)}</textarea>
            </div>
          </div>

          <div class="tr-modal__field">
            <label class="tr-modal__label" for="trMDesc">
              Error Snippet
              <span class="tr-modal__hint">(from console output)</span>
            </label>
            <textarea class="tr-modal__textarea tr-modal__textarea--code" id="trMDesc">${escHtml(snippet)}</textarea>
          </div>

        </div>

        <div class="tr-modal__footer">
          <button class="tr-modal__btn tr-modal__btn--cancel" id="trModalCancel">Cancel</button>
          <button class="tr-modal__btn tr-modal__btn--save"   id="trModalSave">Log Issue</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const titleEl    = overlay.querySelector('#trMTitle');
    const severityEl = overlay.querySelector('#trMSeverity');
    const statusEl   = overlay.querySelector('#trMStatus');
    const stepsEl    = overlay.querySelector('#trMSteps');
    const expectedEl = overlay.querySelector('#trMExpected');
    const actualEl   = overlay.querySelector('#trMActual');
    const descEl     = overlay.querySelector('#trMDesc');
    const saveBtn    = overlay.querySelector('#trModalSave');

    const close = () => overlay.remove();

    overlay.querySelector('#trModalClose').addEventListener('click', close);
    overlay.querySelector('#trModalCancel').addEventListener('click', close);

    saveBtn.addEventListener('click', async () => {
      const t = titleEl.value.trim();
      if (!t) { titleEl.classList.add('tr-modal__input--error'); titleEl.focus(); return; }
      titleEl.classList.remove('tr-modal__input--error');

      saveBtn.disabled    = true;
      saveBtn.textContent = 'Logging…';

      try {
        await window.db.issues.create({
          project_id:         this._projectId,
          title:              t,
          description:        descEl.value.trim()     || null,
          steps_to_reproduce: stepsEl.value.trim()    || null,
          expected_behavior:  expectedEl.value.trim() || null,
          actual_behavior:    actualEl.value.trim()   || null,
          severity:           severityEl.value,
          status:             statusEl.value,
        });
        close();
      } catch {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Log Issue';
      }
    });

    titleEl.focus();
    titleEl.select();
  }

  // ----------------------------------------------------------------
  // Auto-queue failures after run
  // ----------------------------------------------------------------
  async _autoQueueFailures(exitCode) {
    const initialFailures = this._extractTestFailures(this._outputText);
    if (!initialFailures.length) return;

    let failures = initialFailures;
    const rawSections = this._extractRawSections(this._outputText);
    if (rawSections) {
      const rawBlocks = rawSections
        .split(/\n(?=\[\d+\]\n)/)
        .map(s => s.trim())
        .filter(s => s);
      if (rawBlocks.length === initialFailures.length) {
        failures = initialFailures.map((f, i) => ({
          name: f.name,
          body: rawBlocks[i].replace(/^\[\d+\]\s*\n?/, '').trim(),
        }));
      }
    }

    const grouped = this._groupFailuresByFile(failures);
    for (const f of grouped) {
      await window.db.promptQueue.add({
        project_id:    this._projectId,
        user_story_id: null,
        story_title:   f.name,
        prompt_id:     null,
        tag:           'Test Fix',
        prompt_text:   `--- ${f._file}\n\n${f.body}`,
        layer_id:      null,
      });
    }

    if (grouped.length > 0) {
      this._showFixFeedback(
        `${grouped.length} fix task${grouped.length > 1 ? 's' : ''} added to Tasks Queue ✓`,
        true
      );
    }
  }

  // ----------------------------------------------------------------
  // Group flat failures by source file → one queue task per file
  // Input:  [{ name, body }]  (raw per-test failures)
  // Output: [{ name, body, _file, _count }]  (one entry per file)
  // ----------------------------------------------------------------
  _groupFailuresByFile(rawFailures) {
    const getFile = ({ name, body }) => {
      const text = `${name}\n${body}`;
      // Structured extractor format: "File:  path/to/foo.spec.js:42"
      const fm = body.match(/^File:\s+([\S]+)/m);
      if (fm) return fm[1].replace(/:\d+.*$/, '').trim();
      // Flutter: "test/foo_test.dart:42" or "test/foo_test.dart 42:5"
      const dartM = text.match(/((?:[\w.-]+[/\\])*[\w.-]+_test\.dart)/i);
      if (dartM) return dartM[1].trim();
      // JS/TS: tests\e2e\foo.spec.js:356:1
      const pm = text.match(/((?:[\w.-]+[/\\])*[\w.-]+\.(?:spec|test)\.\w+)/i);
      if (pm) return pm[1].replace(/:\d+.*$/, '').trim();
      return '__unknown__';
    };

    const fileMap = new Map();
    for (const f of rawFailures) {
      const file = getFile(f);
      if (!fileMap.has(file)) fileMap.set(file, { file, failures: [] });
      fileMap.get(file).failures.push(f);
    }

    return [...fileMap.values()].map(({ file, failures }) => {
      const shortName = file === '__unknown__' ? 'unknown file' : file.split(/[/\\]/).pop();

      const _intent = 'FIX';
      const _reason = '';
      const title   = `Fix failing tests — ${shortName}`;

      const body = failures.map((f, i) =>
        `[${i + 1}]\ntest case: ${f.name}\nFailed test case details:\n\n${f.body}`
      ).join('\n\n');

      return { name: title, body, _file: file, _count: failures.length, _intent, _reason };
    });
  }

  // ----------------------------------------------------------------
  // ----------------------------------------------------------------
  // Raw failure section extractor — Playwright, Jest, Cypress
  //
  // Returns the raw console output for each failure block (up to 28 lines
  // each) as a single string, numbered [1]…[N].
  //
  // Why raw instead of pre-cleaned fields?
  //   The field-level extractor (below) uses single-line regexes that miss
  //   multi-line errors. Playwright timeout errors look like:
  //     "locator.click: Timeout 30000ms exceeded." — no "Error:" prefix
  //   so errorMsg always comes back empty. The model needs the full block to
  //   classify FIX vs REMOVE correctly.
  // ----------------------------------------------------------------
  _extractRawSections(raw) {
    if (!raw) return '';

    const text = raw
      .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
      .replace(/\x1B\][^\x07]*\x07/g, '');

    const _sectionText = (sec, i) => {
      const lines = sec.replace(/\r/g, '').split('\n');
      // 28 lines captures: header, error, call log, code snippet, locator
      return `[${i + 1}]\n${lines.slice(0, 28).join('\n').trim()}`;
    };

    // ── Playwright: "  N) file:line:col › Test name ─────" ───────────
    const pwSections = text.split(/\n(?=\s{0,6}\d+\)\s+\S)/);
    const pwFailures = pwSections.filter(s => /^\s{0,6}\d+\)\s+/.test(s));
    if (pwFailures.length > 0) {
      return pwFailures.map(_sectionText).join('\n\n');
    }

    // ── Jest: "● Suite > test name" ──────────────────────────────────
    const jestSections = text.split(/\n(?=\s*●\s+)/);
    const jestFailures = jestSections.filter(s => /^\s*●\s+/.test(s));
    if (jestFailures.length > 0) {
      return jestFailures.map(_sectionText).join('\n\n');
    }

    // ── Cypress: "  N) Suite: test" ──────────────────────────────────
    const cypSections = text.split(/\n(?=\s{2,6}\d+\)\s+)/);
    const cypFailures = cypSections.filter(s => /^\s{2,6}\d+\)\s+/.test(s));
    if (cypFailures.length > 0) {
      return cypFailures.map(_sectionText).join('\n\n');
    }

    // ── Flutter: "MM:SS +N -M: Test name [E]" ────────────────────────
    const flutterSections = text.split(/\n(?=\d{2}:\d{2}[\s+\d-]+:\s)/);
    const flutterFailures = flutterSections.filter(s => /\[E\]/.test(s.split('\n')[0]));
    if (flutterFailures.length > 0) {
      return flutterFailures.map(_sectionText).join('\n\n');
    }

    return ''; // Unknown format — caller falls back to pre-extracted fields
  }

  // ----------------------------------------------------------------
  // Test failure parser — Playwright, Jest, Cypress, Flutter
  // Returns [{ name, body }] — one entry per failed test
  // ----------------------------------------------------------------
  _extractTestFailures(raw) {
    if (!raw) return [];

    // Strip ANSI escape codes
    const text = raw
      .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
      .replace(/\x1B\][^\x07]*\x07/g, '');

    const failures = [];

    // ── Playwright ────────────────────────────────────────────────────
    // Header line: "  N) path/file.js:line:col › Test name ──────"
    const pwSections = text.split(/\n(?=\s{0,6}\d+\)\s+\S)/);
    for (const sec of pwSections) {
      const hdr = sec.match(/^\s{0,6}(\d+)\)\s+(.+?):(\d+)(?::\d+)?\s+›\s+(.+?)(?:\s*─+)?\s*$/m);
      if (!hdr) continue;

      const [, , filePath, line, testName] = hdr;

      const errorMsg  = (sec.match(/^\s+Error:\s+(.+)/m)  || [])[1]?.trim() || '';
      const locator   = (sec.match(/^\s+Locator:\s+(.+)/m)|| [])[1]?.trim() || '';
      const expected  = (sec.match(/^\s+Expected:\s+(.+)/m)||[])[1]?.trim() || '';
      const received  = (sec.match(/^\s+Received:\s+(.+)/m)||[])[1]?.trim() || '';
      // The assertion line marked with ">"
      const codeLine  = (sec.match(/^\s*>\s+\d+\s+\|\s+(.+)/m)||[])[1]?.trim() || '';

      const parts = [
        `File:     ${filePath}:${line}`,
        errorMsg  && `Error:    ${errorMsg}`,
        locator   && `Locator:  ${locator}`,
        expected  && `Expected: ${expected}`,
        received  && `Received: ${received}`,
        codeLine  && `Line:     ${codeLine}`,
      ].filter(Boolean);

      failures.push({ name: testName.trim(), body: parts.join('\n') });
    }

    if (failures.length) return failures;

    // ── Jest ──────────────────────────────────────────────────────────
    // Header line: "● Test suite name > test name"  or  "● test name"
    const jestSections = text.split(/\n(?=\s*●\s+)/);
    for (const sec of jestSections) {
      const hdr = sec.match(/^\s*●\s+(.+)/);
      if (!hdr) continue;

      const testName  = hdr[1].trim();
      const errorMsg  = (sec.match(/^\s+(expect\(.+\)|Error:.+|Received:.+)/m)||[])[1]?.trim() || '';
      const expected  = (sec.match(/Expected[:\s]+(.+)/m)||[])[1]?.trim() || '';
      const received  = (sec.match(/Received[:\s]+(.+)/m)||[])[1]?.trim() || '';
      const fileMatch = sec.match(/at .+\((.+\.(?:js|ts|jsx|tsx)):(\d+):\d+\)/);
      const fileLine  = fileMatch ? `${fileMatch[1]}:${fileMatch[2]}` : '';
      const codeLine  = (sec.match(/^\s*>\s+\d+\s+\|\s+(.+)/m)||[])[1]?.trim() || '';

      const parts = [
        fileLine  && `File:     ${fileLine}`,
        errorMsg  && `Error:    ${errorMsg}`,
        expected  && `Expected: ${expected}`,
        received  && `Received: ${received}`,
        codeLine  && `Line:     ${codeLine}`,
      ].filter(Boolean);

      if (!parts.length) continue;
      failures.push({ name: testName, body: parts.join('\n') });
    }

    if (failures.length) return failures;

    // ── Cypress ───────────────────────────────────────────────────────
    // Header: "  N) Suite: test name"
    const cypSections = text.split(/\n(?=\s+\d+\)\s+)/);
    for (const sec of cypSections) {
      const hdr = sec.match(/^\s+(\d+)\)\s+(.+)/);
      if (!hdr) continue;

      const testName = hdr[2].trim();
      const errorMsg = (sec.match(/AssertionError[:\s]+(.+)/m)||[])[1]?.trim() ||
                       (sec.match(/Error[:\s]+(.+)/m)          ||[])[1]?.trim() || '';
      const fileLine = (sec.match(/at .+\((.+\.(?:js|ts)):(\d+):\d+\)/)||[])[1]
                     ? `${(sec.match(/at .+\((.+\.(?:js|ts)):(\d+):\d+\)/)||[])[1]}:${(sec.match(/at .+\((.+\.(?:js|ts)):(\d+):\d+\)/)||[])[2]}`
                     : '';

      const parts = [
        fileLine  && `File:  ${fileLine}`,
        errorMsg  && `Error: ${errorMsg}`,
      ].filter(Boolean);

      if (!parts.length) continue;
      failures.push({ name: testName, body: parts.join('\n') });
    }

    if (failures.length) return failures;

    // ── Flutter ───────────────────────────────────────────────────────
    // Default reporter header: "MM:SS +N -M: Test name [E]"
    // Each failure block ends at the next timestamp line or end of output.
    const flutterSections = text.split(/\n(?=\d{2}:\d{2}[\s+\d-]+:\s)/);
    for (const sec of flutterSections) {
      const hdr = sec.match(/^\d{2}:\d{2}[\s+\d-]+:\s+(.+?)\s+\[E\]/);
      if (!hdr) continue;

      const testName = hdr[1].trim();

      // "Expected: <value>" — strip angle brackets from matcher output
      const expected = (sec.match(/Expected:\s*<?(.+?)>?\s*$/m) || [])[1]?.trim() || '';
      const actual   = (sec.match(/Actual:\s*<?(.+?)>?\s*$/m)   || [])[1]?.trim() || '';
      const which    = (sec.match(/Which:\s*(.+)/m)             || [])[1]?.trim() || '';
      // Assertion thrown message: "The following assertion was thrown …: <msg>"
      const errorMsg = (sec.match(/(?:The following \S+(?: \S+)* (?:was thrown|exception)[:\s]+)(.+)/m) || [])[1]?.trim()
                    || (sec.match(/^Error:\s*(.+)/m) || [])[1]?.trim()
                    || '';

      // Flutter stack lines: "test/foo_test.dart 25:5" (space-delimited)
      // or "test/foo_test.dart:25:5" (colon-delimited, some reporters)
      const fileMatch = sec.match(/((?:[\w.-]+[/\\])*[\w.-]+_test\.dart)[:\s]+(\d+)/);
      const fileLine  = fileMatch ? `${fileMatch[1]}:${fileMatch[2]}` : '';

      const parts = [
        fileLine  && `File:     ${fileLine}`,
        errorMsg  && `Error:    ${errorMsg}`,
        expected  && `Expected: ${expected}`,
        actual    && `Actual:   ${actual}`,
        which     && `Which:    ${which}`,
      ].filter(Boolean);

      if (!parts.length) continue;
      failures.push({ name: testName, body: parts.join('\n') });
    }

    return failures;
  }

  _showFixFeedback(message, success) {
    // Remove any old feedback
    document.querySelectorAll('.tr-fix-feedback').forEach(el => el.remove());

    // Try to show inside the results bar; fall back to the last-run header
    const bar      = this.container.querySelector('#trResultsBar');
    const actionsEl = this.container.querySelector('#trResultsActions');
    const parent   = (bar && !bar.hidden) ? bar : this.container.querySelector('.tr-last-run-header');
    if (!parent) return;

    const el = document.createElement('span');
    el.className  = `tr-fix-feedback tr-result tr-result--${success ? 'pass' : 'fail'}`;
    el.textContent = message;

    // Insert before the actions group in the bar, or append elsewhere
    if (actionsEl && parent === bar) {
      bar.insertBefore(el, actionsEl);
    } else {
      parent.appendChild(el);
    }

    setTimeout(() => el.remove(), 5000);
  }

  // ----------------------------------------------------------------
  // History — save & render
  // ----------------------------------------------------------------
  async _saveRun(exitCode, results) {
    if (!this._activeEntry) return;
    const run = await window.db.testRunHistory.create({
      project_id: this._projectId,
      framework:  this._activeEntry.framework ?? null,
      command:    this._activeEntry.cmd,
      passed:     results.passed   ?? null,
      failed:     results.failed   ?? null,
      skipped:    results.skipped  ?? null,
      duration:   results.duration ?? null,
      output:     this._outputText || null,
      exit_code:  exitCode,
    });
    this._lastRunId = run?.id ?? null;
    this._history = await window.db.testRunHistory.list(this._projectId);
    this._renderHistory();
  }

  _renderHistory() {
    const lastRunEl  = this.container.querySelector('#trLastRunSection');
    const prevRunsEl = this.container.querySelector('#trPrevRunsSection');
    if (!lastRunEl || !prevRunsEl) return;

    if (this._history.length === 0) {
      lastRunEl.innerHTML = `<div class="tr-history-empty">No runs yet</div>`;
      prevRunsEl.hidden = true;
      return;
    }

    const [last, ...older] = this._history;

    lastRunEl.innerHTML = this._lastRunSectionHtml(last);
    const histIssueBtn = lastRunEl.querySelector('#trLastRunIssueBtn');
    if (histIssueBtn) {
      histIssueBtn.addEventListener('click', () => this._showLogIssueModalFromHistory(last));
    }

    if (older.length > 0) {
      prevRunsEl.innerHTML =
        `<div class="tr-history-section-label">Previous Runs</div>` +
        older.map(r => this._historyCardHtml(r)).join('');
      prevRunsEl.hidden = false;
    } else {
      prevRunsEl.hidden = true;
    }
  }

  _lastRunSectionHtml(r) {
    const failed   = r.failed ?? null;
    const isFailed = r.exit_code !== 0 || (failed !== null && failed > 0);
    const outputText = r.output ? escHtml(r.output) : '<span class="tr-output-none">No output captured</span>';
    const histBtns = isFailed
      ? `<div class="tr-last-run-actions">
           <button class="tr-log-issue-btn" id="trLastRunIssueBtn" title="Log as issue">
             <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
               <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/>
               <path d="M8 5v4M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
             </svg>
             Log Issue
           </button>
         </div>`
      : '';
    return `
      <div class="tr-last-run-header">
        <div class="tr-history-section-label">Last Run</div>
        ${histBtns}
      </div>
      ${this._historyCardHtml(r)}
      <div class="tr-last-run-output">
        <div class="tr-last-run-output__label">Output</div>
        <pre class="tr-last-run-output__pre">${outputText}</pre>
      </div>
    `;
  }

  _showLogIssueModalFromHistory(r) {
    const results = {
      failed:   r.failed   ?? null,
      passed:   r.passed   ?? null,
      skipped:  r.skipped  ?? null,
      duration: r.duration ?? null,
    };
    this._showLogIssueModal(results, r.exit_code, {
      framework: r.framework ?? '',
      command:   r.command   ?? '',
      output:    r.output    ?? '',
    });
  }

  _historyCardHtml(r) {
    const passed  = r.passed  ?? null;
    const failed  = r.failed  ?? null;
    const success = r.exit_code === 0 && (failed === null || failed === 0);

    const statusIcon = success
      ? `<svg class="tr-hcard__icon tr-hcard__icon--pass" width="14" height="14" viewBox="0 0 16 16" fill="none">
           <path d="M3 8l3.5 3.5L13 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
         </svg>`
      : `<svg class="tr-hcard__icon tr-hcard__icon--fail" width="14" height="14" viewBox="0 0 16 16" fill="none">
           <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
         </svg>`;

    const statsHtml = (() => {
      const parts = [];
      if (passed  !== null) parts.push(`<span class="tr-hcard__stat tr-hcard__stat--pass">${passed} passed</span>`);
      if (failed  !== null && failed > 0) parts.push(`<span class="tr-hcard__stat tr-hcard__stat--fail">${failed} failed</span>`);
      if (r.skipped > 0)   parts.push(`<span class="tr-hcard__stat tr-hcard__stat--skip">${r.skipped} skipped</span>`);
      if (!parts.length)   parts.push(`<span class="tr-hcard__stat">exit ${r.exit_code}</span>`);
      if (r.duration)      parts.push(`<span class="tr-hcard__stat tr-hcard__stat--dur">${escHtml(r.duration)}</span>`);
      return parts.join('');
    })();

    return `
      <div class="tr-hcard${success ? '' : ' tr-hcard--fail'}">
        <div class="tr-hcard__top">
          ${statusIcon}
          <span class="tr-hcard__cmd" title="${escHtml(r.command)}">${escHtml(r.command)}</span>
        </div>
        <div class="tr-hcard__meta">
          ${r.framework ? `<span class="tr-hcard__fw">${escHtml(r.framework)}</span>` : ''}
          <span class="tr-hcard__stats">${statsHtml}</span>
          <span class="tr-hcard__time">${relativeTime(r.ran_at)}</span>
        </div>
      </div>
    `;
  }
}
