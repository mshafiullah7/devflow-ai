import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { QuickCommandsModal } from '../../components/quick-commands/quick-commands-modal.js';

export class GitChangesPage {
  constructor(container, params, router) {
    this.container       = container;
    this.router          = router;
    this._projectId      = params.projectId;
    this._from           = params.from || 'project-home';
    this._project        = null;
    this._files          = [];
    this._consoleRunning = false;
    this._qcmdModal      = null;
    this._pendingCommits = 0;
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  async mount() {
    injectCss('components/git/git-diff.css');
    injectCss('pages/git-changes/git-changes-page.css');
    applyStoredTheme();

    this._project = await window.db.projects.get(this._projectId);
    this.container.innerHTML = this._template();

    this._qcmdModal = new QuickCommandsModal({ onRunCommand: () => this.router.navigate('user-stories', { projectId: this._projectId }) });
    this._qcmdModal.mount();

    this._bindEvents();
    if (this._project?.project_path) {
      this._setHeaderFolderPath(this._project.project_path);
    }
    await this._loadStatus();
    if (this._project?.project_path) {
      this._consoleRun('git status');
    }
  }

  unmount() {
    removeCss('pages/git-changes/git-changes-page.css');
    removeCss('components/git/git-diff.css');
    window.db.terminal.removeListeners();
  }

  // ----------------------------------------------------------------
  // Template
  // ----------------------------------------------------------------
  _template() {
    const name = this._project ? escHtml(this._project.name) : 'Project';
    return `
      <div class="git-page">
        <header class="git-page__header">
          <button class="git-page__back" id="gitPageBack" aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="git-page__title-group">
            <h1 class="git-page__title">${name}</h1>
            <p class="git-page__subtitle">Git Changes</p>
          </div>
          <div class="git-page__center">
            <div class="git-page__status-label" id="gitStatusLabel">Loading…</div>
          </div>
          <div class="git-page__folder-display" id="gitHeaderFolderDisplay" title="Select folder">
            <div class="git-page__folder-pill">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                  stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              </svg>
              <span class="git-page__folder-text" id="gitHeaderFolderText">Select folder</span>
            </div>
          </div>
          <button class="git-page__refresh" id="gitPageVSCode" title="Open in VS Code"
            ${this._project?.project_path ? '' : 'disabled'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 2H8a2 2 0 00-2 2v16a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2z"/>
              <path d="M9 9l3 3-3 3"/>
            </svg>
          </button>
          <button class="git-page__refresh" id="gitPageRefresh" title="Refresh (Ctrl+R)">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M4 4a8 8 0 1 1 0 12" stroke="currentColor" stroke-width="1.6"
                stroke-linecap="round"/>
              <path d="M4 2v4h4" stroke="currentColor" stroke-width="1.6"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="git-page__refresh" id="gitPageQcmd" title="Quick Commands">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="4" cy="6"  r="1.5" fill="currentColor"/>
              <circle cx="4" cy="10" r="1.5" fill="currentColor"/>
              <circle cx="4" cy="14" r="1.5" fill="currentColor"/>
              <path d="M8 6h8M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </header>

        <div class="git-page__body">
          <div class="git-page__accordion-wrap" id="gitAccordionWrap">
            <div class="git-diff-loading">Loading changes…</div>
          </div>

          <div class="git-page__console-divider" id="gitConsoleDivider"></div>

          <div class="git-page__console" id="gitConsole">
            <div class="git-page__console-header">
              <span class="git-page__console-title">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M4 6l3 3-3 3M8 12h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Console
              </span>
              <div class="git-page__console-actions">
                <button class="git-page__console-btn" id="gitConsoleKill" title="Stop" disabled>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor"/>
                  </svg>
                </button>
                <button class="git-page__console-btn" id="gitConsoleClear" title="Clear (Ctrl+L)">
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 10L10 2M2 2l8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="git-page__console-output" id="gitConsoleOutput">
              <span class="git-page__console-hint">Run git commands or any shell command here.</span>
            </div>
            <div class="git-page__console-compose">
              <span class="git-page__console-prompt">$</span>
              <input class="git-page__console-input" id="gitConsoleInput"
                placeholder="git status, git log --oneline, …"
                autocomplete="off" spellcheck="false"/>
              <button class="git-page__console-run" id="gitConsoleRun">Run</button>
              <div class="git-page__qcmd-picker" id="gitQcmdPicker">
                <button class="git-page__qcmd-picker-btn" id="gitQcmdPickerBtn" title="Quick Commands">
                  <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
                    <circle cx="4" cy="6"  r="1.5" fill="currentColor"/>
                    <circle cx="4" cy="10" r="1.5" fill="currentColor"/>
                    <circle cx="4" cy="14" r="1.5" fill="currentColor"/>
                    <path d="M8 6h8M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </button>
                <div class="git-page__qcmd-menu" id="gitQcmdMenu" hidden></div>
              </div>
            </div>
            <div class="git-page__quick-actions">
              <button class="git-page__qa-btn git-page__qa-btn--commit" id="gitQaCommit" title="git add -A && git commit -m &quot;…&quot;">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M8 1v4M8 11v4M1 8h4M11 8h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
                Commit
                <span class="git-page__commit-badge" id="gitCommitBadge" hidden></span>
              </button>
              <button class="git-page__qa-btn git-page__qa-btn--push" id="gitQaPush" title="git push">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M8 11V3M4 6l4-4 4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M2 13h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
                Push
                <span class="git-page__push-badge" id="gitPushBadge" hidden></span>
              </button>
              <button class="git-page__qa-btn" id="gitQaStatus" title="git status">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M8 7v4M8 5v1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
                Status
              </button>
              <button class="git-page__qa-btn" id="gitQaLog" title="git log --oneline -10">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
                Log
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------
  _bindEvents() {
    this.container.querySelector('#gitPageBack')
      .addEventListener('click', () =>
        this.router.navigate(this._from, { projectId: this._projectId }));

    this.container.querySelector('#gitPageVSCode')
      .addEventListener('click', () => {
        const path = this._project?.project_path;
        if (path) window.shell.openVSCode(path);
      });

    this.container.querySelector('#gitPageRefresh')
      .addEventListener('click', () => this._loadStatus());

    this.container.querySelector('#gitPageQcmd')
      .addEventListener('click', () => this._qcmdModal.show());

    this.container.querySelector('#gitHeaderFolderDisplay')
      .addEventListener('click', async () => {
        const folderPath = await window.db.dialog.openFolder();
        if (!folderPath) return;
        await window.db.projects.setPath({ id: this._projectId, project_path: folderPath });
        if (this._project) this._project.project_path = folderPath;
        this._setHeaderFolderPath(folderPath);
        await this._loadStatus();
        this._consoleRun('git status');
      });

    this._bindConsole();
    this._bindConsoleDivider();

    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, select, [contenteditable]')) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        this.container.querySelector('#gitPageRefresh')?.click();
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        this.container.querySelector('#gitConsoleClear')?.click();
      }
    });
  }

  // ----------------------------------------------------------------
  // Console panel
  // ----------------------------------------------------------------
  _bindConsole() {
    const input   = this.container.querySelector('#gitConsoleInput');
    const runBtn  = this.container.querySelector('#gitConsoleRun');
    const killBtn = this.container.querySelector('#gitConsoleKill');
    const clearBtn = this.container.querySelector('#gitConsoleClear');

    const clearOutput = () => {
      const out = this.container.querySelector('#gitConsoleOutput');
      if (out) out.innerHTML = '';
    };

    const run = () => {
      const cmd = input.value.trim();
      if (!cmd || this._consoleRunning) return;
      input.value = '';
      if (cmd === 'clear' || cmd === 'cls') { clearOutput(); return; }
      this._consoleRun(cmd);
    };

    runBtn.addEventListener('click', run);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
    killBtn.addEventListener('click', () => window.db.terminal.killActive());
    clearBtn.addEventListener('click', () => {
      const out = this.container.querySelector('#gitConsoleOutput');
      if (out) out.innerHTML = '';
    });

    this._bindQcmdPicker(input, run);
    this._bindQuickActions(input, run);
  }

  _bindQcmdPicker(input, run) {
    const pickerBtn = this.container.querySelector('#gitQcmdPickerBtn');
    const menu      = this.container.querySelector('#gitQcmdMenu');
    if (!pickerBtn || !menu) return;

    const closeMenu = () => { menu.hidden = true; };

    pickerBtn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!menu.hidden) { closeMenu(); return; }

      menu.innerHTML = '<div class="git-page__qcmd-menu-loading">Loading…</div>';
      menu.hidden = false;

      const cmds = await window.db.quickCommands.list().catch(() => []);
      if (cmds.length === 0) {
        menu.innerHTML = '<div class="git-page__qcmd-menu-empty">No quick commands saved</div>';
        return;
      }

      menu.innerHTML = cmds.map(c => `
        <button class="git-page__qcmd-menu-item" data-cmd="${escHtml(c.command)}">
          <span class="git-page__qcmd-menu-cmd">${escHtml(c.command)}</span>
          ${c.description ? `<span class="git-page__qcmd-menu-desc">${escHtml(c.description)}</span>` : ''}
        </button>
      `).join('');

      menu.querySelectorAll('.git-page__qcmd-menu-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const cmd = btn.dataset.cmd;
          closeMenu();
          if (cmd.includes('{{input}}')) {
            this._showInputPrompt(cmd, resolved => {
              input.value = resolved;
              run();
            });
          } else {
            input.value = cmd;
            run();
          }
        });
      });
    });

    document.addEventListener('click', closeMenu);
  }

  // ----------------------------------------------------------------
  // Quick action buttons
  // ----------------------------------------------------------------
  _bindQuickActions(input, run) {
    const setCmd = cmd => { input.value = cmd; run(); };

    this.container.querySelector('#gitQaCommit')?.addEventListener('click', () => {
      this._showInputPrompt('git add -A; git commit -m "{{input}}"', resolved => {
        input.value = resolved;
        run();
      });
    });

    this.container.querySelector('#gitQaPush')?.addEventListener('click', () =>
      setCmd('git push'));

    this.container.querySelector('#gitQaStatus')?.addEventListener('click', () =>
      setCmd('git status'));

    this.container.querySelector('#gitQaLog')?.addEventListener('click', () =>
      setCmd('git log --oneline -10'));
  }

  // ----------------------------------------------------------------
  // {{input}} prompt popup
  // ----------------------------------------------------------------
  _showInputPrompt(cmdTemplate, onConfirm) {
    document.querySelector('.git-input-prompt-overlay')?.remove();

    const label = cmdTemplate.replace(/\{\{input\}\}/g, '<mark class="git-input-prompt__mark">{{input}}</mark>');

    const overlay = document.createElement('div');
    overlay.className = 'git-input-prompt-overlay';
    overlay.innerHTML = `
      <div class="git-input-prompt">
        <div class="git-input-prompt__header">Fill in value</div>
        <div class="git-input-prompt__cmd">${label}</div>
        <input class="git-input-prompt__input" id="gitInputPromptVal"
          placeholder="Enter value…" autocomplete="off" spellcheck="false"/>
        <div class="git-input-prompt__actions">
          <button class="git-input-prompt__btn git-input-prompt__btn--cancel" id="gitInputPromptCancel">Cancel</button>
          <button class="git-input-prompt__btn git-input-prompt__btn--run" id="gitInputPromptRun">Run</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const valInput = overlay.querySelector('#gitInputPromptVal');
    const close = () => overlay.remove();

    const confirm = () => {
      const val = valInput.value.trim();
      close();
      onConfirm(cmdTemplate.replace(/\{\{input\}\}/g, val));
    };

    overlay.querySelector('#gitInputPromptRun').addEventListener('click', confirm);
    overlay.querySelector('#gitInputPromptCancel').addEventListener('click', close);
    valInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirm();
      if (e.key === 'Escape') close();
    });

    requestAnimationFrame(() => valInput.focus());
  }

  _consoleAppend(text, type = 'out') {
    const out = this.container.querySelector('#gitConsoleOutput');
    if (!out) return;
    out.querySelector('.git-page__console-hint')?.remove();
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const el = document.createElement('div');
      el.className = `git-page__console-line git-page__console-line--${type}`;
      el.textContent = line;
      out.appendChild(el);
    }
    out.scrollTop = out.scrollHeight;
  }

  async _consoleRun(cmd) {
    const cwd     = this._project?.project_path || '';
    const runBtn  = this.container.querySelector('#gitConsoleRun');
    const killBtn = this.container.querySelector('#gitConsoleKill');
    const input   = this.container.querySelector('#gitConsoleInput');

    this._consoleAppend(`$ ${cmd}`, 'cmd');
    this._consoleRunning = true;
    if (runBtn)  { runBtn.disabled = true; runBtn.textContent = '…'; }
    if (killBtn) killBtn.disabled = false;
    if (input)   input.disabled = true;

    window.db.terminal.removeListeners();
    window.db.terminal.onData(({ text }) => this._consoleAppend(text, 'out'));
    window.db.terminal.onDone(({ exitCode }) => {
      window.db.terminal.removeListeners();
      if (exitCode !== 0) {
        this._consoleAppend(`[exited with code ${exitCode}]`, 'err');
      }
      this._consoleRunning = false;
      if (runBtn)  { runBtn.disabled = false; runBtn.textContent = 'Run'; }
      if (killBtn) killBtn.disabled = true;
      if (input)   { input.disabled = false; input.focus(); }
      // Refresh status + counts after commit or push
      if (/\bgit\b.*\bcommit\b|\bgit\b.*\bpush\b/.test(cmd)) {
        if (/\bgit\b.*\bcommit\b/.test(cmd)) {
          this._loadStatus();   // reloads file list → updates commit badge
        }
        this._loadPendingCommits();
      }
    });

    try {
      await window.db.terminal.execStart({ command: cmd, cwd });
    } catch (err) {
      window.db.terminal.removeListeners();
      this._consoleAppend(`Error: ${err.message}`, 'err');
      this._consoleRunning = false;
      if (runBtn)  { runBtn.disabled = false; runBtn.textContent = 'Run'; }
      if (killBtn) killBtn.disabled = true;
      if (input)   { input.disabled = false; input.focus(); }
    }
  }

  // ----------------------------------------------------------------
  // Resizable divider between accordion and console
  // ----------------------------------------------------------------
  _bindConsoleDivider() {
    const divider     = this.container.querySelector('#gitConsoleDivider');
    const consoleEl   = this.container.querySelector('#gitConsole');
    const accordionWrap = this.container.querySelector('#gitAccordionWrap');
    if (!divider || !consoleEl || !accordionWrap) return;

    const onMouseMove = e => {
      const bodyRect = this.container.querySelector('.git-page__body').getBoundingClientRect();
      let w = bodyRect.right - e.clientX;
      w = Math.max(220, Math.min(w, bodyRect.width - 300));
      consoleEl.style.flex = `0 0 ${w}px`;
    };
    const onMouseUp = () => {
      divider.classList.remove('git-page__console-divider--dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    divider.addEventListener('mousedown', e => {
      e.preventDefault();
      divider.classList.add('git-page__console-divider--dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // ----------------------------------------------------------------
  // Folder display
  // ----------------------------------------------------------------
  _setHeaderFolderPath(folderPath) {
    const text    = this.container.querySelector('#gitHeaderFolderText');
    const display = this.container.querySelector('#gitHeaderFolderDisplay');
    const vsCode  = this.container.querySelector('#gitPageVSCode');
    if (text)    text.textContent = folderPath;
    if (display) display.classList.add('git-page__folder-display--active');
    if (vsCode)  vsCode.disabled = false;
  }

  // ----------------------------------------------------------------
  // Uncommitted files badge
  // ----------------------------------------------------------------
  _updateCommitBadge() {
    const badge = this.container.querySelector('#gitCommitBadge');
    if (!badge) return;
    const count = this._files.length;
    if (count > 0) {
      badge.textContent = count;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  // ----------------------------------------------------------------
  // Pending (unpushed) commits count
  // ----------------------------------------------------------------
  async _loadPendingCommits() {
    const cwd   = this._project?.project_path || '';
    const badge = this.container.querySelector('#gitPushBadge');
    if (!cwd || !badge) return;
    try {
      const r = await window.db.terminal.exec({
        command: 'git rev-list --count @{u}..HEAD 2>&1',
        cwd,
      });
      const raw   = (r.stdout || '').trim();
      const count = parseInt(raw, 10);
      if (!isNaN(count) && count > 0) {
        const prev = this._pendingCommits;
        this._pendingCommits = count;
        badge.textContent = count;
        badge.hidden = false;
        // Flash the badge green when the count increases (new commit)
        if (count > prev && prev !== 0) {
          badge.classList.add('git-page__push-badge--new');
          setTimeout(() => badge.classList.remove('git-page__push-badge--new'), 1200);
        }
      } else {
        this._pendingCommits = 0;
        badge.hidden = true;
      }
    } catch {
      this._pendingCommits = 0;
      if (badge) badge.hidden = true;
    }
  }

  // ----------------------------------------------------------------
  // Git status
  // ----------------------------------------------------------------
  async _loadStatus() {
    const cwd = this._project?.project_path || '';
    const label = this.container.querySelector('#gitStatusLabel');
    const wrap  = this.container.querySelector('#gitAccordionWrap');

    if (!cwd) {
      if (label) label.textContent = 'No folder selected';
      if (wrap) wrap.innerHTML = `
        <div class="git-page__empty">
          <p>No project folder selected.</p>
          <p>Select a folder from the header to enable Git tracking.</p>
        </div>`;
      return;
    }

    if (wrap) wrap.innerHTML = '<div class="git-diff-loading">Loading changes…</div>';

    try {
      const [result, ignorePatterns] = await Promise.all([
        window.db.terminal.exec({ command: 'git status --short 2>&1', cwd }),
        this._fetchGitignorePatterns(cwd),
      ]);
      this._files = this._parseGitStatus(result.stdout || '')
        .filter(f => !this._matchesGitignore(f.file, ignorePatterns));

      if (label) {
        label.textContent = this._files.length === 0
          ? ''
          : `${this._files.length} changed file${this._files.length !== 1 ? 's' : ''}`;
      }

      this._updateCommitBadge();

      if (this._files.length === 0) {
        if (wrap) wrap.innerHTML = '<div class="git-diff-empty">Working tree is clean.</div>';
        this._loadPendingCommits();
        return;
      }

      await this._renderAccordion();
      this._loadPendingCommits();
    } catch {
      if (label) label.textContent = 'Not a git repository';
      if (wrap) wrap.innerHTML = `
        <div class="git-page__empty">
          <p>Not a git repository.</p>
          <p>Initialise git in the selected folder to track changes.</p>
        </div>`;
    }
  }

  // ----------------------------------------------------------------
  // Accordion rendering
  // ----------------------------------------------------------------
  async _renderAccordion() {
    const wrap = this.container.querySelector('#gitAccordionWrap');
    if (!wrap) return;

    // Build skeleton first so user sees file list immediately
    wrap.innerHTML = this._files.map((f, i) => `
      <div class="git-accordion__item" data-idx="${i}">
        <button class="git-accordion__header" data-idx="${i}" aria-expanded="true">
          <span class="git-diff-file__status git-diff-file__status--${f.statusType}">${f.statusType}</span>
          <span class="git-accordion__filename">${escHtml(f.file)}</span>
          <svg class="git-accordion__chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="git-accordion__body" id="gitAccBody${i}">
          <div class="git-diff-loading">Loading diff…</div>
        </div>
      </div>
    `).join('');

    // Bind toggle clicks
    wrap.querySelectorAll('.git-accordion__header').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx  = btn.dataset.idx;
        const body = wrap.querySelector(`#gitAccBody${idx}`);
        const item = wrap.querySelector(`.git-accordion__item[data-idx="${idx}"]`);
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        item.classList.toggle('git-accordion__item--collapsed', expanded);
      });
    });

    // Load all diffs in parallel
    await Promise.all(this._files.map((f, i) => this._loadDiffInto(f, i)));
  }

  // ----------------------------------------------------------------
  // Diff loading into an accordion body
  // ----------------------------------------------------------------
  async _loadDiffInto(fileInfo, idx) {
    const body = this.container.querySelector(`#gitAccBody${idx}`);
    if (!body) return;

    const cwd = this._project?.project_path || '';
    try {
      let diffText = '';
      if (fileInfo.statusType === 'U') {
        const r = await window.db.terminal.exec({
          command: `Get-Content -Raw -Encoding UTF8 "${fileInfo.file}" 2>&1`,
          cwd,
        });
        const content    = (r.stdout || '').replace(/\r\n/g, '\n');
        const addedLines = content.split('\n').map(l => `+${l}`).join('\n');
        diffText = `@@ -0,0 +1 @@\n${addedLines}`;
      } else {
        const r1 = await window.db.terminal.exec({
          command: `git diff HEAD -- "${fileInfo.file}" 2>&1`,
          cwd,
        });
        diffText = (r1.stdout || '').trim();
        if (!diffText) {
          const r2 = await window.db.terminal.exec({
            command: `git diff --cached -- "${fileInfo.file}" 2>&1`,
            cwd,
          });
          diffText = (r2.stdout || '').trim();
        }
      }
      body.innerHTML = this._renderDiffBody(diffText);
    } catch {
      body.innerHTML = '<div class="git-diff-error">Failed to load diff.</div>';
    }
  }

  // ----------------------------------------------------------------
  // .gitignore helpers
  // ----------------------------------------------------------------
  async _fetchGitignorePatterns(cwd) {
    try {
      const r = await window.db.terminal.exec({
        command: `if (Test-Path ".gitignore") { Get-Content -Raw ".gitignore" } else { "" }`,
        cwd,
      });
      return (r.stdout || '').split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
    } catch {
      return [];
    }
  }

  _matchesGitignore(file, patterns) {
    const norm = file.replace(/\\/g, '/');
    return patterns.some(pattern => {
      const negated = pattern.startsWith('!');
      const p       = negated ? pattern.slice(1) : pattern;
      const dirOnly = p.endsWith('/');
      const clean   = dirOnly ? p.slice(0, -1) : p;
      const anchored = clean.startsWith('/');
      const base     = anchored ? clean.slice(1) : clean;
      const regexStr = base
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\x00')
        .replace(/\*/g, '[^/]*')
        .replace(/\x00/g, '.*')
        .replace(/\?/g, '[^/]');
      try {
        const re = anchored
          ? new RegExp(`^${regexStr}(/.*)?$`)
          : new RegExp(`(^|/)${regexStr}(/.*)?$`);
        const matched = re.test(norm);
        return negated ? !matched : matched;
      } catch {
        return false;
      }
    });
  }

  // ----------------------------------------------------------------
  // Parsing & rendering
  // ----------------------------------------------------------------
  _parseGitStatus(output) {
    return output.split('\n')
      .filter(l => l.trim())
      .map(line => {
        const xy   = line.substring(0, 2);
        const file = line.substring(3).trim().replace(/^"(.*)"$/, '$1');
        let statusType;
        if (xy.includes('?'))      statusType = 'U';
        else if (xy.includes('A')) statusType = 'A';
        else if (xy.includes('D')) statusType = 'D';
        else if (xy.includes('R')) statusType = 'R';
        else                       statusType = 'M';
        return { xy, statusType, file };
      });
  }

  /** Renders just the diff table (no filename bar — shown in accordion header) */
  _renderDiffBody(diffText) {
    const esc = escHtml;

    if (!diffText || !diffText.trim()) {
      return '<div class="git-diff-empty">No diff available.</div>';
    }

    let html = '<table class="git-diff-table"><tbody>';

    let oldLine = 0, newLine = 0;
    for (const raw of diffText.split('\n')) {
      if (/^(diff --git|index |--- |\+\+\+ |Binary |new file|deleted file|old mode|new mode|rename )/.test(raw)) continue;

      if (raw.startsWith('@@')) {
        const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
        if (m) {
          oldLine = parseInt(m[1]);
          newLine = parseInt(m[2]);
          const ctx = m[3] ? esc(m[3].trim()) : '';
          html += `<tr class="gd-row gd-row--hunk">
            <td class="gd-ln"></td><td class="gd-ln"></td>
            <td class="gd-code">${esc(raw)}${ctx ? ` <span class="gd-hunk-ctx">${ctx}</span>` : ''}</td>
          </tr>`;
        }
        continue;
      }

      if (raw.startsWith('-')) {
        html += `<tr class="gd-row gd-row--del">
          <td class="gd-ln gd-ln--del">${oldLine++}</td><td class="gd-ln"></td>
          <td class="gd-code gd-code--del"><span class="gd-sign">&#x2212;</span>${esc(raw.slice(1))}</td>
        </tr>`;
      } else if (raw.startsWith('+')) {
        html += `<tr class="gd-row gd-row--add">
          <td class="gd-ln"></td><td class="gd-ln gd-ln--add">${newLine++}</td>
          <td class="gd-code gd-code--add"><span class="gd-sign">+</span>${esc(raw.slice(1))}</td>
        </tr>`;
      } else if (raw.startsWith(' ')) {
        html += `<tr class="gd-row gd-row--ctx">
          <td class="gd-ln">${oldLine++}</td><td class="gd-ln">${newLine++}</td>
          <td class="gd-code">${esc(raw.slice(1))}</td>
        </tr>`;
      } else if (raw.startsWith('\\')) {
        html += `<tr class="gd-row gd-row--meta">
          <td class="gd-ln"></td><td class="gd-ln"></td>
          <td class="gd-code gd-code--meta">${esc(raw)}</td>
        </tr>`;
      }
    }

    html += '</tbody></table>';
    return html;
  }
}
