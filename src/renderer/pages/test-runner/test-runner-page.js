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
    this._commands      = [];
    this._running       = false;
    this._outputText    = '';
    this._activeEntry   = null; // command entry currently running
    this._history       = [];
    this._modelCfg      = null;
    this._picker        = null;
    this._modelConfigsModal = null;
  }

  async mount() {
    injectCss('pages/user-stories/user-stories.css');
    injectCss('pages/test-runner/test-runner-page.css');
    applyStoredTheme();

    this._project = await window.db.projects.get(this._projectId);
    const _mapping = await window.db.modelMapping.get('test-runner');
    this.container.innerHTML = this._template();

    // Model picker
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
    this.container.querySelector('#trBtnModelConfigs')
      ?.addEventListener('click', () => this._modelConfigsModal.show());

    this._git = new GitController({
      getTermCwd:           () => this._project?.project_path || '',
      gitBtnId:             'trBtnGit',
      gitBadgeId:           'trGitBadge',
      controlBtnVisibility: false,
    });
    this._git.mount();

    this._bindHeaderEvents();

    // Load history first so the panel is populated immediately
    this._history = await window.db.testRunHistory.list(this._projectId);
    this._renderHistory();

    if (this._project?.project_path) {
      this._setHeaderFolderPath(this._project.project_path);
      this._git.refreshStatus();
      this._git.startPoll();
      await this._detectFrameworks(this._project.project_path);
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
          <div class="project-page__folder-display" id="headerFolderDisplay" title="Select folder">
            <div class="project-page__folder-pill">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                  stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              </svg>
              <span class="project-page__folder-text" id="headerFolderText">Select folder</span>
            </div>
          </div>
          <div class="project-page__model-group tr-header__model" style="-webkit-app-region:no-drag;">
            <div id="trModelPicker"></div>
            <button class="project-page__model-cfg-btn" id="trBtnModelConfigs" title="Configure AI models">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
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
              <span class="project-page__git-badge" id="trGitBadge" hidden></span>
            </button>
          </div>
        </header>

        <div class="tr-body">

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
                Fix Issues
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
              <!-- Last run: fills remaining panel height; pre scrolls inside it -->
              <div class="tr-last-run-section" id="trLastRunSection">
                <div class="tr-history-empty">No runs yet</div>
              </div>
              <!-- Previous runs: capped height, independently scrollable -->
              <div class="tr-prev-runs-section" id="trPrevRunsSection" hidden></div>
            </div>

          </div>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // Header events
  // ----------------------------------------------------------------
  _bindHeaderEvents() {
    this.container.querySelector('#trBtnBack')
      .addEventListener('click', () => this.router.navigate('project-home', { projectId: this._projectId }));

    this.container.querySelector('#headerFolderDisplay')
      .addEventListener('click', async () => {
        const folderPath = await window.db.dialog.openFolder();
        if (!folderPath) return;
        await window.db.projects.setPath({ id: this._projectId, project_path: folderPath });
        if (this._project) this._project.project_path = folderPath;
        this._setHeaderFolderPath(folderPath);
        this._git.refreshStatus();
        this._git.startPoll();
        await this._detectFrameworks(folderPath);
      });

    this.container.querySelector('#trBtnGit')
      .addEventListener('click', () =>
        this.router.navigate('git-changes', { projectId: this._projectId, from: 'test-runner' }));

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

  _setHeaderFolderPath(folderPath) {
    const text    = this.container.querySelector('#headerFolderText');
    const display = this.container.querySelector('#headerFolderDisplay');
    if (!text || !display) return;
    text.textContent = folderPath;
    display.classList.add('project-page__folder-display--active');
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
      cwd:     this._project?.project_path || undefined,
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
      fixBtn.onclick = () => this._fixIssues(this._outputText, exitCode);
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

    const features = await window.db.features.list(this._projectId);

    const featureOptions = features.map(f =>
      `<option value="${f.id}">${escHtml(f.name)}</option>`
    ).join('');

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
              <label class="tr-modal__label" for="trMFeature">Feature <span class="tr-modal__hint">(optional)</span></label>
              <select class="tr-modal__select" id="trMFeature">
                <option value="">— none —</option>
                ${featureOptions}
              </select>
            </div>
            <div class="tr-modal__field">
              <label class="tr-modal__label" for="trMStory">User Story <span class="tr-modal__hint">(optional)</span></label>
              <select class="tr-modal__select" id="trMStory" disabled>
                <option value="">— select feature first —</option>
              </select>
            </div>
          </div>

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

    const featureEl  = overlay.querySelector('#trMFeature');
    const storyEl    = overlay.querySelector('#trMStory');
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

    featureEl.addEventListener('change', async () => {
      const fid = parseInt(featureEl.value);
      if (!fid) {
        storyEl.innerHTML = '<option value="">— select feature first —</option>';
        storyEl.disabled = true;
        return;
      }
      const stories = await window.db.userStories.list({ feature_id: fid });
      storyEl.innerHTML = '<option value="">— none —</option>' +
        stories.map(s => `<option value="${s.id}">${escHtml(s.title)}</option>`).join('');
      storyEl.disabled = stories.length === 0;
    });

    saveBtn.addEventListener('click', async () => {
      const t = titleEl.value.trim();
      if (!t) { titleEl.classList.add('tr-modal__input--error'); titleEl.focus(); return; }
      titleEl.classList.remove('tr-modal__input--error');

      saveBtn.disabled    = true;
      saveBtn.textContent = 'Logging…';

      const featureId = parseInt(featureEl.value) || null;
      const storyId   = parseInt(storyEl.value)   || null;

      try {
        await window.db.issues.create({
          project_id:         this._projectId,
          feature_id:         featureId,
          user_story_id:      storyId,
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
  // Fix Issues — analyze console output with AI → Tasks Queue
  // ----------------------------------------------------------------
  async _fixIssues(outputText, exitCode) {
    if (!this._modelCfg) {
      this._showFixFeedback('Select a model from the header dropdown first.', false);
      return;
    }

    const src = (outputText || '').trim();
    if (!src) {
      this._showFixFeedback('No test output to analyze.', false);
      return;
    }

    // Find a button to show loading state (results bar or history btn)
    const fixBtnBar  = this.container.querySelector('#trFixIssueBtn');
    const fixBtnHist = this.container.querySelector('#trLastRunFixBtn');
    const allFixBtns = [fixBtnBar, fixBtnHist].filter(Boolean);

    const origInners = allFixBtns.map(b => b.innerHTML);
    allFixBtns.forEach(b => { b.disabled = true; b.textContent = 'Analyzing…'; });

    const restoreBtns = () => {
      allFixBtns.forEach((b, i) => { b.disabled = false; b.innerHTML = origInners[i]; });
    };

    // Write the full output to a temp file so there is no size limit.
    // CLI models (claude, gemini, etc.) are instructed to read the file directly.
    // API / Ollama models receive the full text inline — the model's own context
    // window is the only limit, not an artificial truncation on our end.
    const tmpPath = await window.db.testRunner.saveTempOutput(src);
    const isCli   = this._modelCfg?.type === 'cli';

    const outputSection = isCli
      ? `The full console output has been saved to this file — read it before answering:\n${tmpPath}`
      : `Console output:\n${src}`;

    const analysisPrompt =
`You are a senior software engineer reviewing a test run that produced failures.
Your job is to analyse each failed test and decide the correct remediation action,
then produce a task that tells an AI coding agent exactly what to do.

## Decision rules — apply in order

1. **Fix the code** — the test describes valid, still-intended behaviour but the
   implementation is broken or regressed. The agent should fix the production code
   so the test passes. Do NOT modify the test.

2. **Update the test** — the feature still exists but its contract or UI changed
   intentionally (e.g. a selector, route, prop name, or response shape changed).
   The agent should update the test to match the new behaviour. Do NOT change
   production code.

3. **Delete the test** — the feature or endpoint being tested has been removed
   entirely from the codebase. The agent should delete the test (and the spec file
   if it becomes empty). Do NOT add stubs or skips.

4. **Skip / flag only** — the failure looks environment-specific, timing-related,
   or intermittent (e.g. network timeout, port conflict). Mark the task title with
   "[FLAKY]" and instruct the agent to mark the test as skipped with a comment
   explaining why, rather than deleting or rewriting it.

## Output format

Output ONLY a raw JSON array — no explanation, no markdown, no code fences.
The array must start with [ and end with ].

Each item must have:
- "title": short task title, e.g. "Fix login redirect test" or "Delete removed-feature spec"
- "action": one of "fix_code" | "update_test" | "delete_test" | "skip_flaky"
- "prompt": a self-contained prompt for an AI coding agent that includes:
    • the exact test name and file path (if visible in the output)
    • the verbatim error message or assertion failure
    • which decision rule applies and why
    • precise instructions: what to change, where, and what the correct behaviour is
    • for "fix_code": describe the expected behaviour the test is asserting
    • for "update_test": describe the new behaviour the test should assert
    • for "delete_test": confirm the feature is gone and list files/blocks to remove
    • for "skip_flaky": explain the environmental cause and the skip annotation to add

${outputSection}`;

    let accumulated = '';

    const cleanup = () => {
      window.db.promptQueue.removeListeners();
      restoreBtns();
    };

    window.db.promptQueue.removeListeners();

    window.db.promptQueue.onData(({ text }) => { accumulated += text; });

    window.db.promptQueue.onDone(async ({ exitCode: code }) => {
      cleanup();

      // Extract JSON array from response
      let tasks = [];
      try {
        const match = accumulated.match(/\[[\s\S]*\]/);
        if (match) tasks = JSON.parse(match[0]);
      } catch (err) {
        console.error('[TestRunner] Failed to parse AI fix-tasks response:', err);
      }

      if (!Array.isArray(tasks) || tasks.length === 0) {
        this._showFixFeedback('AI could not identify fixable failures. Try again.', false);
        return;
      }

      const ACTION_TAG = {
        fix_code:    'Fix Code',
        update_test: 'Update Test',
        delete_test: 'Delete Test',
        skip_flaky:  'Flaky Test',
      };

      let created = 0;
      for (const task of tasks) {
        const promptText = (task.prompt || task.prompt_text || '').trim();
        const title      = (task.title || '').trim();
        if (!promptText) continue;
        const tag = ACTION_TAG[task.action] || 'Test Fix';
        await window.db.promptQueue.add({
          project_id:    this._projectId,
          user_story_id: null,
          story_title:   title || null,
          prompt_id:     null,
          tag,
          prompt_text:   promptText,
          layer_id:      null,
        });
        created++;
      }

      if (created > 0) {
        this._showFixFeedback(
          `${created} fix task${created > 1 ? 's' : ''} added to Tasks Queue ✓`,
          true,
        );
      } else {
        this._showFixFeedback('No actionable tasks found in AI response.', false);
      }
    });

    try {
      window.db.promptQueue.run({
        messages:    [{ role: 'user', content: analysisPrompt }],
        modelConfig: this._modelCfg,
        cwd:         this._project?.project_path || undefined,
        itemLabel:   'Test Analysis',
        projectName: this._project?.name || '',
      });
    } catch (err) {
      cleanup();
      this._showFixFeedback(`Failed to start analysis: ${err.message}`, false);
    }
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
    await window.db.testRunHistory.create({
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
      histFixBtn.addEventListener('click', () => this._fixIssues(last.output || '', last.exit_code));
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
           <button class="tr-fix-issue-btn tr-fix-issue-btn--sm" id="trLastRunFixBtn" title="Fix issues with AI">
             <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
               <path d="M13 2l1 1-2 2-1-1 2-2zM2 14l3-1-2-2-1 3zM4 10l6-6 2 2-6 6-2-2z" fill="currentColor"/>
             </svg>
             Fix Issues
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
