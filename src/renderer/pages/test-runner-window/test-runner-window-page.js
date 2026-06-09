import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { GitController } from '../../components/git/git-controller.js';
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

  const flutterAll  = text.match(/\+(\d+):\s*All tests passed/i);
  const flutterFail = text.match(/\+(\d+)\s+-(\d+):/);
  if (flutterAll)  { results.passed = parseInt(flutterAll[1]); results.failed = 0; return results; }
  if (flutterFail) { results.passed = parseInt(flutterFail[1]); results.failed = parseInt(flutterFail[2]); return results; }

  const pwPass = text.match(/(\d+)\s+passed\s+\(([^)]+)\)/i);
  const pwFail = text.match(/(\d+)\s+failed/i);
  if (pwPass) {
    results.passed  = parseInt(pwPass[1]);
    results.failed  = pwFail ? parseInt(pwFail[1]) : 0;
    results.duration = pwPass[2];
    return results;
  }

  const karmaPass = text.match(/Executed\s+(\d+)\s+of\s+\d+\s+SUCCESS/i);
  const karmaFail = text.match(/(\d+)\s+FAILED/i);
  if (karmaPass) {
    results.passed = parseInt(karmaPass[1]);
    results.failed = karmaFail ? parseInt(karmaFail[1]) : 0;
    return results;
  }

  return results;
}

export class TestRunnerWindowPage {
  constructor(container) {
    this.container       = container;
    this._projectId      = null;
    this._project        = null;
    this._layers         = [];
    this._activeLayerId  = null;
    this._activeCwd      = null;
    this._commands       = [];
    this._running        = false;
    this._outputText     = '';
    this._activeEntry    = null;
    this._initLayer      = null;
    this._history        = [];
    this._lastRunId      = null;
    this._modelCfg       = null;
    this._picker         = null;
    this._modelConfigsModal = null;
  }

  mount() {
    injectCss('pages/user-stories/user-stories.css');
    injectCss('pages/test-runner/test-runner-page.css');
    applyStoredTheme();

    this.container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;opacity:.5;font-size:14px;">
        Loading…
      </div>`;

    window.app.testRunnerWindow.onInit(data => this._initialize(data));
  }

  async _initialize(data) {
    this._projectId  = data.projectId;
    this._modelCfg   = data.modelCfg ?? null;
    this._initLayer  = data.layer    ?? null;

    this._project   = await window.db.projects.get(this._projectId);
    this._activeCwd = this._project?.project_path || null;

    const _mapping = await window.db.modelMapping.get('test-runner');
    this.container.innerHTML = this._template();

    this._picker = new ModelPicker({
      anchor:    this.container.querySelector('#trModelPicker'),
      onSelect:  model => { this._modelCfg = model; },
      initialId: data.modelCfg?.id ?? _mapping?.model_config_id ?? null,
    });
    await this._picker.reload();

    this._modelConfigsModal = new ModelConfigsModal({
      onConfigsChanged: () => this._picker?.reload(),
    });
    this._modelConfigsModal.mount();

    this._git = new GitController({
      getTermCwd:           () => this._project?.project_path || '',
      getLayers:            () => this._layers,
      gitBtnId:             'trBtnGit',
      gitBadgeId:           'trGitBadge',
      controlBtnVisibility: false,
    });
    this._git.mount();

    this._bindHeaderEvents();

    this._history = await window.db.testRunHistory.list(this._projectId);
    this._renderHistory();

    // Use the layer passed in directly — no sidebar to render
    if (data.layer?.folder_path) {
      this._activeLayerId = data.layer.id;
      this._activeCwd     = data.layer.folder_path;
    }

    if (this._activeCwd) {
      this._git.refreshStatus();
      this._git.startPoll();
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
    this._git?.stopPoll();
    this._picker?.unmount();
    window.db.testRunner.removeListeners();
    window.db.promptQueue.removeListeners();
    if (this._running) window.db.testRunner.kill();
  }

  // ----------------------------------------------------------------
  // Template
  // ----------------------------------------------------------------
  _template() {
    const name      = this._project ? escHtml(this._project.name) : 'Project';
    const layerName = this._initLayer?.name ? ` · ${escHtml(this._initLayer.name)}` : '';
    return `
      <div class="project-page">

        <header class="project-page__header">
          <button class="project-page__back" id="trBtnBack" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="project-page__title-group">
            <h1 class="project-page__title">${name}</h1>
            <p class="project-page__desc">Test Runner${layerName}</p>
          </div>
          <div class="project-page__model-group tr-header__model" style="-webkit-app-region:no-drag;">
            <div id="trModelPicker"></div>
          </div>
          <div class="project-page__header-actions" style="-webkit-app-region:no-drag;">
            <button class="project-page__git-btn" id="trBtnGit" title="Git changes">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
                <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <span class="project-page__git-badge project-page__git-badge--dot" id="trGitBadge" hidden></span>
            </button>
          </div>
        </header>

        <div class="tr-body">

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
              <button class="tr-fix-issue-btn" id="trFixIssueBtn">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M13 2l1 1-2 2-1-1 2-2zM2 14l3-1-2-2-1 3zM4 10l6-6 2 2-6 6-2-2z" fill="currentColor"/>
                </svg>
                Add to Queue
              </button>
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
              <div class="tr-last-run-section" id="trLastRunSection">
                <div class="tr-history-empty">No runs yet</div>
              </div>
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
          this._confirmCancelAndClose();
        } else {
          window.close();
        }
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

  _confirmCancelAndClose() {
    const overlay = document.createElement('div');
    overlay.className = 'tr-modal-overlay';
    overlay.innerHTML = `
      <div class="tr-modal tr-modal--sm">
        <div class="tr-modal__header">
          <h2 class="tr-modal__title">Tests Running</h2>
        </div>
        <div class="tr-modal__body">
          <p class="tr-fc-summary">Closing will cancel the current test run.</p>
          <p class="tr-fc-hint">Any results collected so far will be lost.</p>
        </div>
        <div class="tr-modal__footer">
          <button class="tr-modal__btn tr-modal__btn--cancel" id="trCancelNavStay">Stay</button>
          <button class="tr-modal__btn tr-modal__btn--save tr-modal__btn--danger-solid" id="trCancelNavGo">Cancel &amp; Close</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector('#trCancelNavStay').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#trCancelNavGo').addEventListener('click', () => {
      overlay.remove();
      window.close();
    });
  }

  // ----------------------------------------------------------------
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

    const fixBtn = this.container.querySelector('#trFixIssueBtn');
    if (fixBtn) {
      fixBtn.onclick = () => this._fixIssues(this._outputText, exitCode, this._lastRunId);
    }

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
    const lines = output.split('\n');
    const errorLines = [];
    let capturing = false;
    for (const line of lines) {
      if (/FAIL |● |Error:|FAILED|AssertionError|at Object\.|expected|received/i.test(line)) {
        capturing = true;
      }
      if (capturing) errorLines.push(line);
      if (errorLines.length >= 30) break;
    }
    const snippet = (errorLines.length ? errorLines : lines.slice(0, 30)).join('\n').trim();
    return snippet.length > 1200 ? snippet.slice(0, 1200) + '\n…' : snippet;
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
  // Fix Issues
  // ----------------------------------------------------------------
  _parseTasksJson(raw) {
    if (!raw) return null;

    const text = raw
      .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
      .replace(/\x1B\][^\x07]*\x07/g, '')
      .trim();

    if (text.startsWith('[')) {
      try {
        const r = JSON.parse(text);
        if (Array.isArray(r) && r.length > 0) return r;
      } catch (_) {}
    }

    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
    if (fenceMatch) {
      try {
        const r = JSON.parse(fenceMatch[1].trim());
        if (Array.isArray(r) && r.length > 0) return r;
      } catch (_) {}
    }

    let best   = null;
    let depth  = 0;
    let start  = -1;
    let inStr  = false;
    let escape = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];

      if (escape)              { escape = false; continue; }
      if (c === '\\' && inStr) { escape = true;  continue; }
      if (c === '"')           { inStr = !inStr;  continue; }
      if (inStr)               continue;

      if (c === '[') {
        if (depth === 0) start = i;
        depth++;
      } else if (c === ']') {
        depth--;
        if (depth === 0 && start !== -1) {
          try {
            const candidate = text.slice(start, i + 1);
            const parsed    = JSON.parse(candidate);
            if (Array.isArray(parsed) && parsed.length > 0) best = parsed;
          } catch (_) {}
          start = -1;
        }
      }
    }

    return best;
  }

  _fixQueueKey(runId) {
    return `devflow-tr-fix-queued-${this._projectId}-${runId}`;
  }

  async _fixIssues(outputText, exitCode, runId) {
    if (runId && localStorage.getItem(this._fixQueueKey(runId))) {
      this._showAlreadyQueuedModal();
      return;
    }

    const src = (outputText || '').trim();
    if (!src) {
      this._showFixFeedback('No test output to analyze.', false);
      return;
    }

    this._showAddToQueueModal(src, runId);
  }

  async _fetchGitContext() {
    const cwd = this._project?.project_path;
    if (!cwd) return { summary: '', badge: '' };
    try {
      const [statusRes, diffRes, logRes] = await Promise.all([
        window.db.terminal.exec({ command: 'git status --short 2>&1',             cwd }).catch(() => ({ stdout: '' })),
        window.db.terminal.exec({ command: 'git diff --name-status HEAD 2>&1',    cwd }).catch(() => ({ stdout: '' })),
        window.db.terminal.exec({ command: 'git log --diff-filter=D --name-only --oneline -n 10 2>&1', cwd }).catch(() => ({ stdout: '' })),
      ]);

      const statusOut = (statusRes.stdout || '').trim();
      const diffOut   = (diffRes.stdout   || '').trim();
      const logOut    = (logRes.stdout    || '').trim();

      const deletedUncommitted = [
        ...statusOut.split('\n')
          .filter(l => /^D[ D]|^ D/.test(l))
          .map(l => l.replace(/^.{2}\s+/, '').trim()),
        ...diffOut.split('\n')
          .filter(l => /^D\t/.test(l))
          .map(l => l.slice(2).trim()),
      ];

      const deletedCommitted = logOut.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.match(/^[0-9a-f]{5,}\s/i) && /\.\w+$/.test(l));

      const allDeleted = [...new Set([...deletedUncommitted, ...deletedCommitted])]
        .filter(Boolean);

      const parts = [];
      if (allDeleted.length) {
        parts.push(`Deleted files (git):\n${allDeleted.map(f => `  - ${f}`).join('\n')}`);
      }
      if (statusOut) {
        parts.push(`Git working-tree status:\n${statusOut}`);
      }

      let badge = '';
      if (allDeleted.length) {
        badge = `📂 ${allDeleted.length} deleted file${allDeleted.length > 1 ? 's' : ''} in git`;
      } else if (statusOut) {
        badge = `📂 Git: ${statusOut.split('\n').filter(Boolean).length} change${statusOut.split('\n').filter(Boolean).length > 1 ? 's' : ''}`;
      } else if (logOut) {
        badge = '📂 Git: clean working tree';
      } else {
        badge = '📂 Git: not available';
      }

      return { summary: parts.join('\n\n'), badge };
    } catch {
      return { summary: '', badge: '📂 Git: not available' };
    }
  }

  async _showAddToQueueModal(rawOutput, runId) {
    const overlay = document.createElement('div');
    overlay.className = 'tr-modal-overlay';
    overlay.innerHTML = `
      <div class="tr-modal tr-modal--aq">
        <div class="tr-modal__header">
          <h2 class="tr-modal__title">Add to Queue</h2>
          <span id="trAqStatus" class="tr-aq-status"></span>
          <button class="tr-modal__close" id="trAqClose" aria-label="Close">&times;</button>
        </div>
        <div class="tr-modal__body tr-aq-body">
          <textarea class="tr-aq-textarea" id="trAqText" spellcheck="false"></textarea>
        </div>
        <div class="tr-modal__footer">
          <span class="tr-aq-tokens" id="trAqTokens"></span>
          <button class="tr-modal__btn tr-modal__btn--cancel"         id="trAqCancel">Cancel</button>
          <button class="tr-modal__btn tr-modal__btn--extract-direct" id="trAqExtractDirect">Extract (No AI)</button>
          <button class="tr-modal__btn tr-modal__btn--extract"        id="trAqExtract">Extract (AI)</button>
          <button class="tr-modal__btn tr-modal__btn--save"           id="trAqSend" disabled>Send to Tasks</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const textEl           = overlay.querySelector('#trAqText');
    const statusEl         = overlay.querySelector('#trAqStatus');
    const extractBtn       = overlay.querySelector('#trAqExtract');
    const extractDirectBtn = overlay.querySelector('#trAqExtractDirect');
    const sendBtn          = overlay.querySelector('#trAqSend');
    const tokensEl         = overlay.querySelector('#trAqTokens');

    const _updateTokens = (text) => {
      if (!tokensEl) return;
      const n = this._estimateTokens(text);
      tokensEl.textContent = `~${n.toLocaleString()} tokens`;
    };
    textEl.addEventListener('input', () => _updateTokens(textEl.value));

    const _initialFailures = this._extractTestFailures(rawOutput);
    const _rawSections     = this._extractRawSections(rawOutput);
    const _filteredText    = _rawSections
      || (_initialFailures.length
        ? _initialFailures.map((f, i) => `[${i + 1}] ${f.name}\n${f.body}`).join('\n\n')
        : rawOutput.slice(-4000));

    const _buildPrompt = (failures) => {
      return `You are a test failure analyst for a software project queue system.

Below are pre-extracted test failure entries. Group them by their source file and output in exactly this format:

---
Test cases failed in - {relative/path/to/file.spec.js}
Analyze for the failed test cases and check if functionality is removed then delete the test case else fix the test cases

[1]
e2e test case: {test name}
Failed test case details:

{full error output, unchanged}

[2]
e2e test case: {test name}
Failed test case details:

{full error output, unchanged}

---
Test cases failed in - {next file if any}
Analyze for the failed test cases and check if functionality is removed then delete the test case else fix the test cases
...

Rules:
- Do not modify or clean the error content — copy it verbatim
- Use a line containing exactly "---" to separate file groups
- Number test cases within each group starting at [1]
- If the file path cannot be determined, use "unknown"
- Always include the instruction line immediately after each "Test cases failed in" line

Failures to process:
${failures}`;
    };

    textEl.value = _buildPrompt(_filteredText);
    _updateTokens(textEl.value);

    const _showGrouped = (grouped) => {
      textEl.value = grouped.map(g => {
        const header = `---\nTest cases failed in - ${g._file}\nAnalyze for the failed test cases and check if functionality is removed then delete the test case else fix the test cases`;
        return `${header}\n\n${g.body}`;
      }).join('\n\n') + '\n\n---';
      textEl.scrollTop = 0;
      _updateTokens(textEl.value);
    };

    const close = () => overlay.remove();
    overlay.querySelector('#trAqClose').addEventListener('click', close);
    overlay.querySelector('#trAqCancel').addEventListener('click', close);

    let extractedFailures = null;

    extractBtn.addEventListener('click', () => {
      const cfg = this._modelCfg;

      if (!cfg) {
        if (!_initialFailures.length) {
          statusEl.textContent = '✗ No failures detected — check the output or select a model';
          statusEl.className   = 'tr-aq-status tr-aq-status--err';
          return;
        }
        const grouped    = this._groupFailuresByFile(_initialFailures);
        extractedFailures = grouped;
        _showGrouped(grouped);
        const totalTests = _initialFailures.length;
        const totalFiles = grouped.length;
        statusEl.textContent = totalFiles === 1
          ? `✓ ${totalTests} failure${totalTests > 1 ? 's' : ''} in 1 file`
          : `✓ ${totalTests} failures across ${totalFiles} files`;
        statusEl.className  = 'tr-aq-status tr-aq-status--ok';
        sendBtn.disabled    = false;
        sendBtn.textContent = `Send ${totalFiles} task${totalFiles > 1 ? 's' : ''} to Queue`;
        return;
      }

      extractBtn.disabled    = true;
      extractBtn.textContent = 'Analyzing…';
      statusEl.textContent   = '⏳ Analyzing with AI…';
      statusEl.className     = 'tr-aq-status';

      const fullPrompt = textEl.value;
      textEl.value     = '';

      let aiOutput = '';
      window.app.chat.offAll();
      window.app.chat.onToken(({ text }) => {
        aiOutput     += text;
        textEl.value  = aiOutput;
        textEl.scrollTop = textEl.scrollHeight;
        _updateTokens(aiOutput);
      });
      window.app.chat.onDone(() => {
        window.app.chat.offAll();
        extractBtn.disabled    = false;
        extractBtn.textContent = 'Extract (AI)';

        const fileBlocks = aiOutput
          .split(/\n?---\n?/)
          .map(s => s.trim())
          .filter(s => s && /^Test cases failed in\s*-\s*/i.test(s));

        if (!fileBlocks.length) {
          statusEl.textContent = '✗ No failures detected in the output';
          statusEl.className   = 'tr-aq-status tr-aq-status--err';
          return;
        }

        extractedFailures = fileBlocks.map(block => {
          const fileMatch = block.match(/^Test cases failed in\s*-\s*(.+)/i);
          const file      = fileMatch ? fileMatch[1].trim() : 'unknown';
          const shortName = file.split(/[/\\]/).pop();
          const count     = (block.match(/^\[\d+\]/gm) || []).length || 1;
          return {
            name:    `Fix failing tests — ${shortName}`,
            body:    block,
            _file:   file,
            _count:  count,
            _intent: 'FIX',
            _reason: '',
          };
        });

        const totalFiles = extractedFailures.length;
        const totalTests = extractedFailures.reduce((s, g) => s + g._count, 0);
        statusEl.textContent = totalFiles === 1
          ? `✓ ${totalTests} failure${totalTests > 1 ? 's' : ''} in 1 file`
          : `✓ ${totalTests} failures across ${totalFiles} files`;
        statusEl.className  = 'tr-aq-status tr-aq-status--ok';
        sendBtn.disabled    = false;
        sendBtn.textContent = `Send ${totalFiles} task${totalFiles > 1 ? 's' : ''} to Queue`;
      });

      window.app.chat.generate({ prompt: fullPrompt, model: cfg });
    });

    extractDirectBtn.addEventListener('click', () => {
      if (!_initialFailures.length) {
        statusEl.textContent = '✗ No failures detected in the output';
        statusEl.className   = 'tr-aq-status tr-aq-status--err';
        return;
      }

      let failures = _initialFailures;

      if (_rawSections) {
        const rawBlocks = _rawSections
          .split(/\n(?=\[\d+\]\n)/)
          .map(s => s.trim())
          .filter(s => s);

        if (rawBlocks.length === _initialFailures.length) {
          failures = _initialFailures.map((f, i) => ({
            name: f.name,
            body: rawBlocks[i].replace(/^\[\d+\]\s*\n?/, '').trim(),
          }));
        }
      }

      const grouped     = this._groupFailuresByFile(failures);
      extractedFailures = grouped;
      _showGrouped(grouped);
      const totalTests = _initialFailures.length;
      const totalFiles = grouped.length;
      statusEl.textContent = totalFiles === 1
        ? `✓ ${totalTests} failure${totalTests > 1 ? 's' : ''} in 1 file`
        : `✓ ${totalTests} failures across ${totalFiles} files`;
      statusEl.className  = 'tr-aq-status tr-aq-status--ok';
      sendBtn.disabled    = false;
      sendBtn.textContent = `Send ${totalFiles} task${totalFiles > 1 ? 's' : ''} to Queue`;
    });

    sendBtn.addEventListener('click', async () => {
      if (!extractedFailures || !extractedFailures.length) return;
      sendBtn.disabled    = true;
      sendBtn.textContent = 'Adding…';

      let created = 0;
      let removedCount = 0;
      for (const f of extractedFailures) {
        const isRemove   = f._intent === 'REMOVE';
        const tag        = isRemove ? 'Remove Test' : 'Test Fix';
        const fileHeader = `Test cases failed in - ${f._file}\nAnalyze for the failed test cases and check if functionality is removed then delete the test case else fix the test cases`;
        const promptText = isRemove
          ? `${fileHeader}\n\nThe page or feature covered by this spec file has been removed. Delete the following obsolete test cases from the test file.\n\n${f.body}`
          : `${fileHeader}\n\n${f.body}`;

        await window.db.promptQueue.add({
          project_id:    this._projectId,
          user_story_id: null,
          story_title:   f.name,
          prompt_id:     null,
          tag,
          prompt_text:   promptText,
          layer_id:      null,
        });
        created++;
        if (isRemove) removedCount++;
      }

      if (runId) localStorage.setItem(this._fixQueueKey(runId), '1');
      close();

      if (created > 0) {
        const fixCount = created - removedCount;
        const parts = [];
        if (fixCount    > 0) parts.push(`${fixCount} fix task${fixCount > 1 ? 's' : ''}`);
        if (removedCount > 0) parts.push(`${removedCount} remove task${removedCount > 1 ? 's' : ''}`);
        this._showFixFeedback(`${parts.join(' + ')} added to Tasks Queue ✓`, true);
      }
    });
  }

  _estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  _groupFailuresByFile(rawFailures) {
    const getFile = ({ name, body }) => {
      const text = `${name}\n${body}`;
      const fm = body.match(/^File:\s+([\S]+)/m);
      if (fm) return fm[1].replace(/:\d+.*$/, '').trim();
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
        `[${i + 1}]\ne2e test case: ${f.name}\nFailed test case details:\n\n${f.body}`
      ).join('\n\n');

      return { name: title, body, _file: file, _count: failures.length, _intent, _reason };
    });
  }

  _extractRawSections(raw) {
    if (!raw) return '';

    const text = raw
      .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
      .replace(/\x1B\][^\x07]*\x07/g, '');

    const _sectionText = (sec, i) => {
      const lines = sec.replace(/\r/g, '').split('\n');
      return `[${i + 1}]\n${lines.slice(0, 28).join('\n').trim()}`;
    };

    const pwSections = text.split(/\n(?=\s{0,6}\d+\)\s+\S)/);
    const pwFailures = pwSections.filter(s => /^\s{0,6}\d+\)\s+/.test(s));
    if (pwFailures.length > 0) {
      return pwFailures.map(_sectionText).join('\n\n');
    }

    const jestSections = text.split(/\n(?=\s*●\s+)/);
    const jestFailures = jestSections.filter(s => /^\s*●\s+/.test(s));
    if (jestFailures.length > 0) {
      return jestFailures.map(_sectionText).join('\n\n');
    }

    const cypSections = text.split(/\n(?=\s{2,6}\d+\)\s+)/);
    const cypFailures = cypSections.filter(s => /^\s{2,6}\d+\)\s+/.test(s));
    if (cypFailures.length > 0) {
      return cypFailures.map(_sectionText).join('\n\n');
    }

    const flutterSections = text.split(/\n(?=\d{2}:\d{2}[\s+\d-]+:\s)/);
    const flutterFailures = flutterSections.filter(s => /\[E\]/.test(s.split('\n')[0]));
    if (flutterFailures.length > 0) {
      return flutterFailures.map(_sectionText).join('\n\n');
    }

    return '';
  }

  _extractTestFailures(raw) {
    if (!raw) return [];

    const text = raw
      .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
      .replace(/\x1B\][^\x07]*\x07/g, '');

    const failures = [];

    // Playwright
    const pwSections = text.split(/\n(?=\s{0,6}\d+\)\s+\S)/);
    for (const sec of pwSections) {
      const hdr = sec.match(/^\s{0,6}(\d+)\)\s+(.+?):(\d+)(?::\d+)?\s+›\s+(.+?)(?:\s*─+)?\s*$/m);
      if (!hdr) continue;

      const [, , filePath, line, testName] = hdr;

      const errorMsg  = (sec.match(/^\s+Error:\s+(.+)/m)   || [])[1]?.trim() || '';
      const locator   = (sec.match(/^\s+Locator:\s+(.+)/m) || [])[1]?.trim() || '';
      const expected  = (sec.match(/^\s+Expected:\s+(.+)/m)|| [])[1]?.trim() || '';
      const received  = (sec.match(/^\s+Received:\s+(.+)/m)|| [])[1]?.trim() || '';
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

    // Jest
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

    // Cypress
    const cypSections = text.split(/\n(?=\s+\d+\)\s+)/);
    for (const sec of cypSections) {
      const hdr = sec.match(/^\s+(\d+)\)\s+(.+)/);
      if (!hdr) continue;

      const testName = hdr[2].trim();
      const errorMsg = (sec.match(/AssertionError[:\s]+(.+)/m)||[])[1]?.trim() ||
                       (sec.match(/Error[:\s]+(.+)/m)          ||[])[1]?.trim() || '';
      const fileLineMatch = sec.match(/at .+\((.+\.(?:js|ts)):(\d+):\d+\)/);
      const fileLine = fileLineMatch ? `${fileLineMatch[1]}:${fileLineMatch[2]}` : '';

      const parts = [
        fileLine  && `File:  ${fileLine}`,
        errorMsg  && `Error: ${errorMsg}`,
      ].filter(Boolean);

      if (!parts.length) continue;
      failures.push({ name: testName, body: parts.join('\n') });
    }

    if (failures.length) return failures;

    // Flutter
    const flutterSections = text.split(/\n(?=\d{2}:\d{2}[\s+\d-]+:\s)/);
    for (const sec of flutterSections) {
      const hdr = sec.match(/^\d{2}:\d{2}[\s+\d-]+:\s+(.+?)\s+\[E\]/);
      if (!hdr) continue;

      const testName = hdr[1].trim();

      const expected = (sec.match(/Expected:\s*<?(.+?)>?\s*$/m) || [])[1]?.trim() || '';
      const actual   = (sec.match(/Actual:\s*<?(.+?)>?\s*$/m)   || [])[1]?.trim() || '';
      const which    = (sec.match(/Which:\s*(.+)/m)             || [])[1]?.trim() || '';
      const errorMsg = (sec.match(/(?:The following \S+(?: \S+)* (?:was thrown|exception)[:\s]+)(.+)/m) || [])[1]?.trim()
                    || (sec.match(/^Error:\s*(.+)/m) || [])[1]?.trim()
                    || '';

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

  _showAlreadyQueuedModal() {
    const overlay = document.createElement('div');
    overlay.className = 'tr-modal-overlay';
    overlay.innerHTML = `
      <div class="tr-modal tr-modal--sm">
        <div class="tr-modal__header">
          <h2 class="tr-modal__title">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style="flex-shrink:0">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.5"/>
              <path d="M8 5v4M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            Already Queued
          </h2>
          <button class="tr-modal__close" id="trAqClose" aria-label="Close">&times;</button>
        </div>
        <div class="tr-modal__body">
          <p class="tr-fc-summary">
            Fix tasks for this test run have already been added to <strong>Tasks Queue</strong>.
          </p>
          <p class="tr-fc-hint">
            To generate new fix tasks, run the tests again first — each fresh test run
            gets its own set of tasks.
          </p>
        </div>
        <div class="tr-modal__footer">
          <button class="tr-modal__btn tr-modal__btn--save" id="trAqOk">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#trAqClose').addEventListener('click', close);
    overlay.querySelector('#trAqOk').addEventListener('click', close);

    const escFn = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escFn); } };
    document.addEventListener('keydown', escFn);
  }

  _showFixFeedback(message, success) {
    document.querySelectorAll('.tr-fix-feedback').forEach(el => el.remove());

    const bar       = this.container.querySelector('#trResultsBar');
    const actionsEl = this.container.querySelector('#trResultsActions');
    const parent    = (bar && !bar.hidden) ? bar : this.container.querySelector('.tr-last-run-header');
    if (!parent) return;

    const el = document.createElement('span');
    el.className   = `tr-fix-feedback tr-result tr-result--${success ? 'pass' : 'fail'}`;
    el.textContent = message;

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
    const histFixBtn = lastRunEl.querySelector('#trLastRunFixBtn');
    if (histFixBtn) {
      histFixBtn.addEventListener('click', () => this._fixIssues(last.output || '', last.exit_code, last.id));
    }
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
           <button class="tr-fix-issue-btn tr-fix-issue-btn--sm" id="trLastRunFixBtn" title="Add fix tasks to queue">
             <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
               <path d="M13 2l1 1-2 2-1-1 2-2zM2 14l3-1-2-2-1 3zM4 10l6-6 2 2-6 6-2-2z" fill="currentColor"/>
             </svg>
             Add to Queue
           </button>
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
