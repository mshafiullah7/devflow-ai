import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { GitController } from '../../components/git/git-controller.js';
import { QuickCommandsModal } from '../../components/quick-commands/quick-commands-modal.js';

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '').replace(/\x1B\][^\x07]*\x07/g, '');
}

export class CliRunnerPage {
  constructor(container, params, router) {
    this.container  = container;
    this.router     = router;
    this._projectId = params.projectId;
    this._project   = null;
    this._configs   = [];
    this._running   = false;
    this._outputText = '';
    this._sessions  = [];
    this._sessionId = 0;
  }

  async mount() {
    injectCss('pages/user-stories/user-stories.css');
    injectCss('pages/cli-runner/cli-runner-page.css');
    applyStoredTheme();

    this._project = await window.db.projects.get(this._projectId);
    this.container.innerHTML = this._template();

    this._qcmdModal = new QuickCommandsModal({ onRunCommand: () => {} });
    this._qcmdModal.mount();

    this._git = new GitController({
      getTermCwd:           () => this._project?.project_path || '',
      gitBtnId:             'crBtnGit',
      gitBadgeId:           'crGitBadge',
      controlBtnVisibility: false,
    });
    this._git.mount();

    this._bindHeaderEvents();
    this._bindInputEvents();

    if (this._project?.project_path) {
      this._setHeaderFolderPath(this._project.project_path);
      this._git.refreshStatus();
      this._git.startPoll();
    }

    await this._loadConfigs();

    window.db.cliRunner.onData(({ text }) => this._appendOutput(text));
    window.db.cliRunner.onDone(({ exitCode }) => this._onDone(exitCode));
  }

  unmount() {
    removeCss('pages/cli-runner/cli-runner-page.css');
    removeCss('pages/user-stories/user-stories.css');
    this._git?.stopPoll();
    window.db.cliRunner.removeListeners();
    if (this._running) window.db.cliRunner.kill();
  }

  // ----------------------------------------------------------------
  // Template
  // ----------------------------------------------------------------
  _template() {
    const name = this._project ? escHtml(this._project.name) : 'Project';
    return `
      <div class="project-page">

        <header class="project-page__header">
          <button class="project-page__back" id="crBtnBack" aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="project-page__title-group">
            <h1 class="project-page__title">${name}</h1>
            <p class="project-page__desc">CLI Runner</p>
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
          <div class="project-page__header-actions" style="-webkit-app-region:no-drag;">
            <button class="project-page__git-btn" id="crBtnGit" title="Git changes">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
                <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <span class="project-page__git-badge" id="crGitBadge" hidden></span>
            </button>
            <button class="project-page__qcmd-btn" id="crBtnQcmd" title="Quick Commands">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <circle cx="4" cy="6"  r="1.5" fill="currentColor"/>
                <circle cx="4" cy="10" r="1.5" fill="currentColor"/>
                <circle cx="4" cy="14" r="1.5" fill="currentColor"/>
                <path d="M8 6h8M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </header>

        <div class="cr-body">

          <!-- Command bar -->
          <div class="cr-command-bar">
            <select class="cr-config-select" id="crConfigSelect">
              <option value="">Loading…</option>
            </select>
            <input class="cr-command-input" id="crCommandInput"
              type="text" placeholder="Command…" autocomplete="off" spellcheck="false"/>
            <div class="cr-run-controls">
              <button class="tr-run-btn" id="crRunBtn" disabled>
                <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
                  <polygon points="4 3 18 10 4 17" fill="currentColor"/>
                </svg>
                Run
              </button>
              <button class="tr-stop-btn" id="crStopBtn" hidden>
                <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                  <rect x="2" y="2" width="10" height="10" rx="1" fill="currentColor"/>
                </svg>
                Stop
              </button>
            </div>
          </div>

          <!-- Output + session split -->
          <div class="tr-panels">

            <!-- Output console (70%) -->
            <div class="tr-output-wrap" id="crOutputWrap">
              <div class="tr-output-empty" id="crOutputEmpty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                  <polyline points="4 17 10 11 4 5"/>
                  <line x1="12" y1="19" x2="20" y2="19"/>
                </svg>
                <p>Select a CLI, type a prompt below, and click Run</p>
              </div>
              <pre class="tr-output" id="crOutput" hidden></pre>
            </div>

            <div class="tr-panels__divider"></div>

            <!-- Session history (30%) -->
            <div class="tr-history-panel">
              <div class="tr-history-header">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M8 5v3.5l2 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Session
              </div>
              <div class="tr-last-run-section" id="crSessionList">
                <div class="tr-history-empty">No runs yet</div>
              </div>
            </div>

          </div>

          <!-- Input bar -->
          <div class="cr-input-bar">
            <div class="cr-input-top">
              <span class="cr-input-status" id="crInputStatus">Ready</span>
              <button class="cr-clear-btn" id="crClearBtn" title="Clear output">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v6M10 7v6"
                    stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"
                    stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Clear
              </button>
            </div>
            <div class="cr-input-row">
              <textarea class="cr-input-textarea" id="crInputTextarea"
                placeholder="Type a prompt or stdin… (Ctrl+Enter to run)"
                rows="3" spellcheck="false"></textarea>
              <button class="cr-send-btn" id="crSendBtn" disabled>
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                  <polygon points="4 3 18 10 4 17" fill="currentColor"/>
                </svg>
                <span id="crSendLabel">Run</span>
              </button>
            </div>
            <div class="cr-input-hint">Ctrl+Enter to run · Enter for new line · while running, sends as stdin</div>
          </div>

        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // Load model configs (CLI type only)
  // ----------------------------------------------------------------
  async _loadConfigs() {
    const all = await window.db.modelConfigs.list();
    this._configs = all.filter(c => c.type === 'cli');

    const select  = this.container.querySelector('#crConfigSelect');
    const runBtn  = this.container.querySelector('#crRunBtn');
    const sendBtn = this.container.querySelector('#crSendBtn');

    select.innerHTML =
      `<option value="">Custom command…</option>` +
      this._configs.map(c => `<option value="${c.id}">${escHtml(c.label)}</option>`).join('');

    const def = this._configs.find(c => c.is_default) || this._configs[0];
    if (def) {
      select.value = String(def.id);
      this._applyConfig(def);
    }

    runBtn.disabled  = false;
    sendBtn.disabled = false;

    select.addEventListener('change', () => {
      const id  = Number(select.value);
      const cfg = this._configs.find(c => c.id === id) || null;
      this._applyConfig(cfg);
    });
  }

  _applyConfig(cfg) {
    const input = this.container.querySelector('#crCommandInput');
    if (!input) return;
    if (!cfg) { input.value = ''; input.placeholder = 'Enter command…'; return; }
    const parts = [cfg.executable];
    if (cfg.flags) parts.push(cfg.flags);
    input.value = parts.join(' ');
  }

  // ----------------------------------------------------------------
  // Header events
  // ----------------------------------------------------------------
  _bindHeaderEvents() {
    this.container.querySelector('#crBtnBack')
      .addEventListener('click', () =>
        this.router.navigate('project-home', { projectId: this._projectId }));

    this.container.querySelector('#headerFolderDisplay')
      .addEventListener('click', async () => {
        const folderPath = await window.db.dialog.openFolder();
        if (!folderPath) return;
        await window.db.projects.setPath({ id: this._projectId, project_path: folderPath });
        if (this._project) this._project.project_path = folderPath;
        this._setHeaderFolderPath(folderPath);
        this._git.refreshStatus();
        this._git.startPoll();
      });

    this.container.querySelector('#crBtnGit')
      .addEventListener('click', () =>
        this.router.navigate('git-changes', { projectId: this._projectId, from: 'cli-runner' }));

    this.container.querySelector('#crBtnQcmd')
      .addEventListener('click', () => this._qcmdModal.show());

    this.container.querySelector('#crRunBtn')
      .addEventListener('click', () => this._run());

    this.container.querySelector('#crStopBtn')
      .addEventListener('click', () => this._stop());
  }

  // ----------------------------------------------------------------
  // Input bar events
  // ----------------------------------------------------------------
  _bindInputEvents() {
    const textarea = this.container.querySelector('#crInputTextarea');
    const sendBtn  = this.container.querySelector('#crSendBtn');
    const clearBtn = this.container.querySelector('#crClearBtn');

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        if (this._running) this._sendStdin();
        else this._run();
      }
    });

    sendBtn.addEventListener('click', () => {
      if (this._running) this._sendStdin();
      else this._run();
    });

    clearBtn.addEventListener('click', () => {
      const output = this.container.querySelector('#crOutput');
      const empty  = this.container.querySelector('#crOutputEmpty');
      if (output) { output.textContent = ''; output.hidden = true; }
      if (empty)  empty.style.display = '';
      this._outputText = '';
    });
  }

  // ----------------------------------------------------------------
  // Run / Stop / Send stdin
  // ----------------------------------------------------------------
  async _run() {
    const cmdInput = this.container.querySelector('#crCommandInput');
    const command  = cmdInput?.value.trim();
    if (!command) { cmdInput?.focus(); return; }

    const textarea = this.container.querySelector('#crInputTextarea');
    const prompt   = textarea?.value.trim() || '';

    this._running    = true;
    this._outputText = '';
    this._sessionId++;
    const sid = this._sessionId;

    const output  = this.container.querySelector('#crOutput');
    const empty   = this.container.querySelector('#crOutputEmpty');
    const runBtn  = this.container.querySelector('#crRunBtn');
    const stopBtn = this.container.querySelector('#crStopBtn');
    const sendBtn = this.container.querySelector('#crSendBtn');
    const status  = this.container.querySelector('#crInputStatus');
    const label   = this.container.querySelector('#crSendLabel');

    if (output)  { output.textContent = `> ${command}\n\n`; output.hidden = false; }
    if (empty)   empty.style.display = 'none';
    if (runBtn)  runBtn.hidden  = true;
    if (stopBtn) stopBtn.hidden = false;
    if (sendBtn) sendBtn.disabled = false;
    if (status)  { status.textContent = 'Running…'; status.className = 'cr-input-status cr-input-status--running'; }
    if (label)   label.textContent = 'Send';

    this._sessions.unshift({ id: sid, command, prompt, outputText: '', exitCode: null, running: true });
    this._renderSessions();

    await window.db.cliRunner.run({
      command,
      prompt: prompt || null,
      cwd: this._project?.project_path || undefined,
    });
  }

  _sendStdin() {
    const textarea = this.container.querySelector('#crInputTextarea');
    const text = textarea?.value || '';
    if (!text.trim()) return;
    window.db.cliRunner.sendInput(text.endsWith('\n') ? text : text + '\n');
    this._appendOutput(`\n> [stdin] ${text}\n`);
    if (textarea) textarea.value = '';
  }

  _stop() {
    window.db.cliRunner.kill();
    this._setIdle();
    this._appendOutput('\n[Stopped by user]\n');
    this._finalizeSession(null);
  }

  _setIdle() {
    const runBtn  = this.container.querySelector('#crRunBtn');
    const stopBtn = this.container.querySelector('#crStopBtn');
    const label   = this.container.querySelector('#crSendLabel');
    if (runBtn)  { runBtn.hidden = false; runBtn.disabled = false; }
    if (stopBtn)   stopBtn.hidden = true;
    if (label)     label.textContent = 'Run';
    this._running = false;
  }

  // ----------------------------------------------------------------
  // Output streaming
  // ----------------------------------------------------------------
  _appendOutput(rawText) {
    const clean = stripAnsi(rawText);
    this._outputText += clean;
    const output = this.container.querySelector('#crOutput');
    if (!output) return;
    output.textContent += clean;
    output.scrollTop = output.scrollHeight;
  }

  _onDone(exitCode) {
    this._setIdle();
    this._finalizeSession(exitCode);
    const status = this.container.querySelector('#crInputStatus');
    if (status) {
      const ok = exitCode === 0;
      status.textContent = ok ? 'Done' : `Exit code: ${exitCode}`;
      status.className = `cr-input-status ${ok ? 'cr-input-status--ok' : 'cr-input-status--err'}`;
    }
  }

  // ----------------------------------------------------------------
  // Session history
  // ----------------------------------------------------------------
  _finalizeSession(exitCode) {
    const s = this._sessions.find(s => s.id === this._sessionId);
    if (s) { s.outputText = this._outputText; s.exitCode = exitCode; s.running = false; }
    this._renderSessions();
  }

  _renderSessions() {
    const list = this.container.querySelector('#crSessionList');
    if (!list) return;
    if (this._sessions.length === 0) {
      list.innerHTML = `<div class="tr-history-empty">No runs yet</div>`;
      return;
    }
    list.innerHTML = this._sessions.map(s => this._sessionCardHtml(s)).join('');
  }

  _sessionCardHtml(s) {
    const icon = s.running
      ? `<svg class="cr-scrd__spin" width="13" height="13" viewBox="0 0 16 16" fill="none">
           <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="10 6"/>
         </svg>`
      : s.exitCode === 0
        ? `<svg class="tr-hcard__icon tr-hcard__icon--pass" width="13" height="13" viewBox="0 0 16 16" fill="none">
             <path d="M3 8l3.5 3.5L13 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
           </svg>`
        : `<svg class="tr-hcard__icon tr-hcard__icon--fail" width="13" height="13" viewBox="0 0 16 16" fill="none">
             <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
           </svg>`;

    const exe   = s.command.split(' ')[0];
    const label = s.prompt
      ? `${escHtml(exe)} · ${escHtml(s.prompt.slice(0, 45))}${s.prompt.length > 45 ? '…' : ''}`
      : escHtml(s.command);

    const exitBadge = (!s.running && s.exitCode !== null)
      ? `<div class="tr-hcard__stats"><span class="tr-hcard__stat">exit ${s.exitCode}</span></div>`
      : '';

    return `
      <div class="tr-hcard${(!s.running && s.exitCode !== 0 && s.exitCode !== null) ? ' tr-hcard--fail' : ''}">
        <div class="tr-hcard__top">
          ${icon}
          <span class="tr-hcard__cmd" title="${escHtml(s.command)}">${label}</span>
        </div>
        ${exitBadge}
      </div>
    `;
  }

  _setHeaderFolderPath(folderPath) {
    const text    = this.container.querySelector('#headerFolderText');
    const display = this.container.querySelector('#headerFolderDisplay');
    if (!text || !display) return;
    text.textContent = folderPath;
    display.classList.add('project-page__folder-display--active');
  }
}
