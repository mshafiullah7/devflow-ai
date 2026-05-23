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
    this._lastRunId     = null; // DB id of the most recent test run (for dedup)
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

  /**
   * Robustly extract a JSON array of tasks from whatever the model returned.
   * Handles: clean JSON, markdown code fences, JSON buried inside prose,
   * ANSI escape codes from CLI models, and multiple candidate arrays
   * (returns the last non-empty one).
   */
  _parseTasksJson(raw) {
    if (!raw) return null;

    // 1. Strip ANSI escape codes that CLI tools may emit
    const text = raw
      .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
      .replace(/\x1B\][^\x07]*\x07/g, '')
      .trim();

    // 2. Direct parse — model obeyed the instruction perfectly
    if (text.startsWith('[')) {
      try {
        const r = JSON.parse(text);
        if (Array.isArray(r) && r.length > 0) return r;
      } catch (_) {}
    }

    // 3. Markdown code fence: ```json … ``` or ``` … ```
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
    if (fenceMatch) {
      try {
        const r = JSON.parse(fenceMatch[1].trim());
        if (Array.isArray(r) && r.length > 0) return r;
      } catch (_) {}
    }

    // 4. Balanced-bracket scan — find every top-level [ … ] in the text and
    //    return the last valid array with at least one entry.
    //    This handles models that prepend/append explanatory prose.
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
    // ── Guard: already queued for this run ──────────────────────────
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

  // ----------------------------------------------------------------
  // Fetch git context for the project folder.
  // Returns a concise summary string (deleted files + full status)
  // that is injected into the AI prompt so the model can distinguish
  // "page was deleted → remove the test" from "code is broken → fix it".
  // ----------------------------------------------------------------
  async _fetchGitContext() {
    const cwd = this._project?.project_path;
    if (!cwd) return '';
    try {
      // Run both commands in parallel; ignore errors (repo may not exist)
      const [statusRes, nameStatusRes] = await Promise.all([
        window.db.terminal.exec({ command: 'git status --short 2>&1', cwd }).catch(() => ({ stdout: '' })),
        window.db.terminal.exec({ command: 'git diff --name-status HEAD 2>&1', cwd }).catch(() => ({ stdout: '' })),
      ]);

      const statusOut     = (statusRes.stdout     || '').trim();
      const nameStatusOut = (nameStatusRes.stdout  || '').trim();

      // Extract deleted entries from both sources so we catch staged,
      // unstaged, and committed-but-not-yet-pushed deletions
      const deletedFromStatus = statusOut.split('\n')
        .filter(l => /^D[ D]|^ D/.test(l))           // "D " staged, " D" unstaged
        .map(l => l.replace(/^.{2}\s+/, '').trim())
        .filter(Boolean);

      const deletedFromDiff = nameStatusOut.split('\n')
        .filter(l => l.startsWith('D\t'))
        .map(l => l.replace(/^D\t/, '').trim())
        .filter(Boolean);

      // Merge + deduplicate
      const allDeleted = [...new Set([...deletedFromStatus, ...deletedFromDiff])];

      const parts = [];
      if (allDeleted.length) {
        parts.push(`Deleted files:\n${allDeleted.map(f => `  - ${f}`).join('\n')}`);
      }
      if (statusOut) {
        parts.push(`Full git status:\n${statusOut}`);
      }

      return parts.join('\n\n');
    } catch {
      return '';
    }
  }

  // ----------------------------------------------------------------
  // Add to Queue — extract failures from raw output, no model call
  // ----------------------------------------------------------------
  async _showAddToQueueModal(rawOutput, runId) {
    // Fetch git context before building the modal so it can be embedded
    // in the prompt. Done once here; referenced in the _buildPrompt closure.
    const gitContext = await this._fetchGitContext();
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
          <button class="tr-modal__btn tr-modal__btn--cancel"  id="trAqCancel">Cancel</button>
          <button class="tr-modal__btn tr-modal__btn--extract" id="trAqExtract">Extract</button>
          <button class="tr-modal__btn tr-modal__btn--save"    id="trAqSend" disabled>Send to Tasks</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const textEl     = overlay.querySelector('#trAqText');
    const statusEl   = overlay.querySelector('#trAqStatus');
    const extractBtn = overlay.querySelector('#trAqExtract');
    const sendBtn    = overlay.querySelector('#trAqSend');
    const tokensEl   = overlay.querySelector('#trAqTokens');

    // Live token estimator — ~4 chars/token is a reliable approximation for
    // mixed code/prose. No AI call needed; updates on every textarea change.
    const _updateTokens = (text) => {
      if (!tokensEl) return;
      const n = this._estimateTokens(text);
      tokensEl.textContent = `~${n.toLocaleString()} tokens`;
    };
    textEl.addEventListener('input', () => _updateTokens(textEl.value));

    // ── Build prompt on open so the user can review / edit it ───────────
    // Pre-filter: extract only error sections, drop the rest of the console output
    const _initialFailures = this._extractTestFailures(rawOutput);
    const _filteredText    = _initialFailures.length
      ? _initialFailures.map((f, i) => `[${i + 1}] ${f.name}\n${f.body}`).join('\n\n')
      : rawOutput.slice(-4000);

    const _buildPrompt = (failures) => {
      // ── Git context block ────────────────────────────────────────────
      // This is actual git output from the project folder fetched moments
      // ago. Use it as the primary signal for REMOVE classification.
      const gitBlock = gitContext ? `
## Git changes in this project (fetched now from the project folder)

${gitContext}

Classification rule from git:
- If a failing test's target page, component, or route is listed under "Deleted files" above → classify as REMOVE
- If only modified (M) or renamed (R) files are present → lean towards FIX unless error signals say otherwise
- If the spec file itself is listed as deleted → REMOVE all failures from that file

` : '';

      return `You are a test failure analyst for a software project queue system.

Below are pre-extracted test failure entries. Each has a name, file location, error details, and context already identified.
${gitBlock}
For each failure you must do two things:

1. CLASSIFY the action needed — choose exactly one:
   - REMOVE  → the test must be deleted because the feature/page/route it tests no longer exists.
               Primary signal: the deleted files list above. Secondary signals: navigation failures
               (net::ERR_ABORTED, ERR_CONNECTION_REFUSED), HTTP 404, missing routes,
               "Cannot find module" for a deleted file, locator matched 0 elements consistently,
               page.goto() timeout on a route that was intentionally removed.
   - FIX     → the feature still exists but the code or test has a bug that needs fixing.
               Signals: assertion mismatch (expected X received Y), wrong values, logic errors,
               element present but in wrong state, intermittent timeout on something that should exist.

2. CLEAN the error details — remove raw stack frames and repeated boilerplate, but keep everything
   a developer needs to understand what failed (file:line, error message, expected vs received,
   assertion line, relevant locators/selectors/timeouts).

Output rules:
- Separate each failure with a line containing exactly "---" on its own line
- Line 1: test name (strip any leading index like "1)" or "[1]")
- Line 2: Action: FIX   or   Action: REMOVE
- Line 3: Reason: <one concise sentence explaining why you chose that action — mention the deleted file if applicable>
- Remaining lines: cleaned error details (file:line, error, expected/received, assertion, context)

Failures to process:
${failures}`;
    };

    textEl.value = _buildPrompt(_filteredText);
    _updateTokens(textEl.value);

    // Helper: render grouped results into the textarea and refresh token count
    const _showGrouped = (grouped) => {
      textEl.value = grouped.map(g => {
        const intentLabel = g._intent === 'REMOVE'
          ? '⚠  ACTION: REMOVE TESTS'
          : '🔧  ACTION: FIX CODE';
        const reasonLine  = g._reason ? `Reason : ${g._reason}` : '';
        const header = [
          `════ ${g._file}  [${g._count} failure${g._count > 1 ? 's' : ''}] ════`,
          intentLabel,
          reasonLine,
        ].filter(Boolean).join('\n');
        return `${header}\n\n${g.body}`;
      }).join('\n\n' + '─'.repeat(60) + '\n\n');
      textEl.scrollTop = 0;
      _updateTokens(textEl.value);
    };

    const close = () => overlay.remove();
    overlay.querySelector('#trAqClose').addEventListener('click', close);
    overlay.querySelector('#trAqCancel').addEventListener('click', close);

    let extractedFailures = null;

    // ── Extract — AI-assisted (streams into textarea) or regex fallback ──
    extractBtn.addEventListener('click', () => {
      const cfg = this._modelCfg;

      // ── Fallback: no model selected → group and display ──────────────
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

      // ── AI-based extraction ───────────────────────────────────────────
      extractBtn.disabled    = true;
      extractBtn.textContent = 'Analyzing…';
      statusEl.textContent   = '⏳ Analyzing with AI…';
      statusEl.className     = 'tr-aq-status';

      // Send whatever is in the textarea — the user may have edited the prompt
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
        extractBtn.textContent = 'Extract';

        // Parse: split on "---" separators → one { name, body } per failure
        const sections = aiOutput
          .split(/\n---\n/)
          .map(s => s.trim())
          .filter(Boolean);

        if (!sections.length) {
          statusEl.textContent = '✗ No failures detected in the output';
          statusEl.className   = 'tr-aq-status tr-aq-status--err';
          return;
        }

        const rawFailures = sections.map(sec => {
          const lines = sec.split('\n');
          const name  = lines[0].replace(/^\[?\d+[\].)]\s*/, '').trim();

          // Parse AI-provided classification (Action: FIX | REMOVE)
          const actionMatch = sec.match(/^Action:\s*(FIX|REMOVE)\s*$/im);
          const reasonMatch = sec.match(/^Reason:\s*(.+)$/im);
          const intent = actionMatch ? actionMatch[1].toUpperCase() : 'FIX';
          const reason = reasonMatch ? reasonMatch[1].trim() : '';

          // Strip the Action/Reason lines from body — they go into metadata, not the task text
          const body = lines.slice(1)
            .filter(l => !/^Action:\s*(FIX|REMOVE)/i.test(l.trim()) && !/^Reason:\s*/i.test(l.trim()))
            .join('\n').trim();

          return { name, body, intent, reason };
        });

        // Group by file and update textarea so the user sees the final grouped result
        const grouped    = this._groupFailuresByFile(rawFailures);
        extractedFailures = grouped;
        _showGrouped(grouped);

        const totalTests = rawFailures.length;
        const totalFiles = grouped.length;
        statusEl.textContent = totalFiles === 1
          ? `✓ ${totalTests} failure${totalTests > 1 ? 's' : ''} in 1 file`
          : `✓ ${totalTests} failures across ${totalFiles} files`;
        statusEl.className  = 'tr-aq-status tr-aq-status--ok';
        sendBtn.disabled    = false;
        sendBtn.textContent = `Send ${totalFiles} task${totalFiles > 1 ? 's' : ''} to Queue`;
      });

      window.app.chat.generate({ prompt: fullPrompt, model: cfg });
    });

    // ── Send to Tasks ─────────────────────────────────────────────────
    sendBtn.addEventListener('click', async () => {
      if (!extractedFailures || !extractedFailures.length) return;
      sendBtn.disabled    = true;
      sendBtn.textContent = 'Adding…';

      let created = 0;
      let removedCount = 0;
      for (const f of extractedFailures) {
        const isRemove   = f._intent === 'REMOVE';
        const tag        = isRemove ? 'Remove Test' : 'Test Fix';
        const promptText = isRemove
          ? `The page or feature covered by this spec file has been removed. Delete the following obsolete test cases from the test file.\n\n${f.body}`
          : f.body;

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

  // ----------------------------------------------------------------
  // Rough token estimator — no AI call required.
  // Uses the standard ~4 chars/token heuristic which holds well for
  // mixed English prose + code (Anthropic models use cl100k-style BPE).
  // ----------------------------------------------------------------
  _estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  // ----------------------------------------------------------------
  // Group flat failures by source file → one queue task per file
  // Input:  [{ name, body }]  (raw per-test failures)
  // Output: [{ name, body, _file, _count }]  (one entry per file)
  // ----------------------------------------------------------------
  _groupFailuresByFile(rawFailures) {
    const getFile = ({ name, body }) => {
      const text = `${name}\n${body}`;
      // "File:  path/to/foo.spec.js:42" (regex extractor format)
      const fm = body.match(/^File:\s+([\S]+)/m);
      if (fm) return fm[1].replace(/:\d+.*$/, '').trim();
      // Bare path on its own line: tests\e2e\foo.spec.js:356:1
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

      // If any failure in the group is classified REMOVE, treat the whole group as REMOVE.
      // Rationale: when a page is deleted, every test in its spec file fails — a single
      // REMOVE signal is enough to flag the entire file for deletion.
      const _intent = failures.some(f => f.intent === 'REMOVE') ? 'REMOVE' : 'FIX';

      // Surface the first REMOVE reason (most informative) as the group reason
      const _reason = (failures.find(f => f.intent === 'REMOVE' && f.reason) || failures.find(f => f.reason) || {}).reason || '';

      const title = _intent === 'REMOVE'
        ? `Remove obsolete tests — ${shortName}`
        : `Fix failing tests — ${shortName}`;

      const body = [
        `File: ${file}`,
        '',
        ...failures.map((f, i) => `[${i + 1}] ${f.name}\n${f.body}`),
      ].join('\n\n');

      return { name: title, body, _file: file, _count: failures.length, _intent, _reason };
    });
  }

  // ----------------------------------------------------------------
  // Test failure parser — Playwright, Jest, Cypress
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

    return failures;
  }

  // ----------------------------------------------------------------
  // Fix Issues — "already queued" modal
  // ----------------------------------------------------------------
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
