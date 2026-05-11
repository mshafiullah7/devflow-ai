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
    this._activeIdx      = 0;
    this._consoleRunning = false;
    this._qcmdModal      = null;
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
    await this._loadStatus();
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
          <button class="git-page__refresh" id="gitPageRefresh" title="Refresh">
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
          <aside class="git-page__files" id="gitFileList">
            <div class="git-page__files-loading">Loading changes…</div>
          </aside>

          <div class="git-page__diff-wrap">
            <div class="git-diff-view" id="gitDiffView">
              <div class="git-diff-loading">Select a file to view its diff.</div>
            </div>
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
                <button class="git-page__console-btn" id="gitConsoleClear" title="Clear">
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

    this.container.querySelector('#gitPageRefresh')
      .addEventListener('click', () => this._loadStatus());

    this.container.querySelector('#gitPageQcmd')
      .addEventListener('click', () => this._qcmdModal.show());

    this._bindConsole();
    this._bindConsoleDivider();
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
  // Resizable divider between diff and console
  // ----------------------------------------------------------------
  _bindConsoleDivider() {
    const divider     = this.container.querySelector('#gitConsoleDivider');
    const consoleEl   = this.container.querySelector('#gitConsole');
    const diffWrap    = this.container.querySelector('.git-page__diff-wrap');
    if (!divider || !consoleEl || !diffWrap) return;

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
  // Git status
  // ----------------------------------------------------------------
  async _loadStatus() {
    const cwd = this._project?.project_path || '';
    const label = this.container.querySelector('#gitStatusLabel');
    const fileList = this.container.querySelector('#gitFileList');

    if (!cwd) {
      if (label) label.textContent = 'No folder selected';
      if (fileList) fileList.innerHTML = `
        <div class="git-page__empty">
          <p>No project folder selected.</p>
          <p>Select a folder from the header to enable Git tracking.</p>
        </div>`;
      return;
    }

    try {
      const [result, ignorePatterns] = await Promise.all([
        window.db.terminal.exec({ command: 'git status --short 2>&1', cwd }),
        this._fetchGitignorePatterns(cwd),
      ]);
      this._files = this._parseGitStatus(result.stdout || '')
        .filter(f => !this._matchesGitignore(f.file, ignorePatterns));

      if (label) {
        label.textContent = this._files.length === 0
          ? 'No changes'
          : `${this._files.length} changed file${this._files.length !== 1 ? 's' : ''}`;
      }

      this._renderFileList();

      if (this._files.length > 0) {
        this._activeIdx = 0;
        await this._loadDiff(this._files[0]);
      } else {
        const view = this.container.querySelector('#gitDiffView');
        if (view) view.innerHTML = '<div class="git-diff-empty">Working tree is clean.</div>';
      }
    } catch {
      if (label) label.textContent = 'Not a git repository';
      if (fileList) fileList.innerHTML = `
        <div class="git-page__empty">
          <p>Not a git repository.</p>
          <p>Initialise git in the selected folder to track changes.</p>
        </div>`;
    }
  }

  _renderFileList() {
    const fileList = this.container.querySelector('#gitFileList');
    if (!fileList) return;

    if (this._files.length === 0) {
      fileList.innerHTML = '<div class="git-page__empty">No changed files.</div>';
      return;
    }

    fileList.innerHTML = this._files.map((f, i) => `
      <div class="git-diff-file${i === this._activeIdx ? ' git-diff-file--active' : ''}"
           data-idx="${i}">
        <span class="git-diff-file__status git-diff-file__status--${f.statusType}">
          ${f.statusType}
        </span>
        <span class="git-diff-file__name" title="${escHtml(f.file)}">${escHtml(f.file)}</span>
      </div>
    `).join('');

    fileList.querySelectorAll('.git-diff-file').forEach(el => {
      el.addEventListener('click', async () => {
        const idx = parseInt(el.dataset.idx);
        this._activeIdx = idx;
        fileList.querySelectorAll('.git-diff-file')
          .forEach(f => f.classList.remove('git-diff-file--active'));
        el.classList.add('git-diff-file--active');
        await this._loadDiff(this._files[idx]);
      });
    });
  }

  // ----------------------------------------------------------------
  // Diff loading
  // ----------------------------------------------------------------
  async _loadDiff(fileInfo) {
    const view = this.container.querySelector('#gitDiffView');
    if (!view) return;
    view.innerHTML = '<div class="git-diff-loading">Loading diff…</div>';

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
      view.innerHTML = this._renderDiff(diffText, fileInfo.file);
    } catch {
      view.innerHTML = '<div class="git-diff-error">Failed to load diff.</div>';
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

  _renderDiff(diffText, filename) {
    const esc  = escHtml;
    let html   = `<div class="git-diff-filename">${esc(filename)}</div>`;

    if (!diffText || !diffText.trim()) {
      return html + '<div class="git-diff-empty">No diff available.</div>';
    }

    html += '<table class="git-diff-table"><tbody>';

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
