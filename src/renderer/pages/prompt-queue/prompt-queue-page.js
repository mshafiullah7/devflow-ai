import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme }              from '../../shared/theme-manager.js';
import { ModelPicker }                   from '../../components/model-picker/model-picker.js';

const ANSI = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  dim:    '\x1b[2m',
};

const STATUS_ICONS = {
  pending: `<svg class="pq-icon" width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4"/></svg>`,
  running: `<svg class="pq-icon pq-icon--spin" width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="20 14" stroke-linecap="round"/></svg>`,
  done:    `<svg class="pq-icon pq-icon--done" width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2.5 8.5l3.5 3.5 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  failed:  `<svg class="pq-icon pq-icon--failed" width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  skipped: `<svg class="pq-icon pq-icon--skipped" width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 8h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
};

export class PromptQueuePage {
  constructor(container, params, router) {
    this.container   = container;
    this.router      = router;
    this.projectId   = params.projectId;
    this._from       = params.from || 'project-home';
    this._project    = null;
    this._queue        = [];
    this._selectedId   = null;
    this._selectedItem = null;
    this._isRunning    = false;
    this._runAll     = false;
    this._modelCfg   = null;

    // xterm terminal
    this._term        = null;
    this._fitAddon    = null;
    this._resizeObs   = null;
    this._onWinResize = null;
    this._lastCols    = 0;
    this._lastRows    = 0;

    // Run state
    this._activeItemId = null;
    this._termBuf      = {};    // { [itemId]: string } — raw output for persistence

    // Elapsed timer per item
    this._startTimes = {};      // { [itemId]: Date.now() }
    this._timerInt   = null;

    // Skip permissions toggle
    this._skipPermissions = true;

    // Git panel
    this._gitPanelVisible  = false;
    this._gitFiles         = [];
    this._gitPollInterval  = null;
    this._gitExpandedFiles = new Set();
  }

  async mount() {
    injectCss('pages/prompt-queue/prompt-queue-page.css');
    injectCss('components/git/git-diff.css');
    applyStoredTheme();

    let _mapping;
    [this._project, this._queue, _mapping] = await Promise.all([
      window.db.projects.get(this.projectId),
      window.db.promptQueue.list({ project_id: this.projectId }),
      window.db.modelMapping.get('prompt-queue'),
    ]);

    this.container.innerHTML = this._template();

    this._picker = new ModelPicker({
      anchor:    this.container.querySelector('#pqModelPicker'),
      onSelect:  model => { this._modelCfg = model; },
      initialId: _mapping?.model_config_id ?? null,
    });
    await this._picker.reload();

    this._initTerminal();
    this._startGitPolling();
    this._renderList();
    this._bindEvents();

    if (this._queue.length > 0) this._selectItem(this._queue[0]);
  }

  unmount() {
    removeCss('pages/prompt-queue/prompt-queue-page.css');
    removeCss('components/git/git-diff.css');
    this._picker?.unmount();
    if (this._isRunning) window.app.wfrPty.kill();
    window.app.wfrPty.offAll();
    this._stopElapsedTimer();
    this._stopGitPolling();
    if (this._resizeObs)   { this._resizeObs.disconnect(); this._resizeObs = null; }
    if (this._onWinResize) { window.removeEventListener('resize', this._onWinResize); this._onWinResize = null; }
    if (this._term)        { this._term.dispose(); this._term = null; }
    this._runAll    = false;
    this._isRunning = false;
  }

  // ── Terminal ─────────────────────────────────────────────────────────

  _initTerminal() {
    const el = this.container.querySelector('#pqTerminal');
    this._lastCols = 0;
    this._lastRows = 0;

    if (!el) { console.error('pq: #pqTerminal not found'); return; }
    if (!window.Terminal) {
      el.style.cssText = 'display:flex;align-items:center;justify-content:center;color:#888;font-family:monospace;font-size:12px;';
      el.textContent = 'xterm.js failed to load — check DevTools console';
      return;
    }

    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

    this._fitAddon = new window.FitAddon.FitAddon();
    this._term = new window.Terminal({
      fontFamily:      'Consolas, "Cascadia Code", "Courier New", monospace',
      fontSize:        12,
      lineHeight:      1.4,
      theme: {
        background:          css('--console-bg')     || '#0d0d0d',
        foreground:          css('--console-output') || '#d4d4d4',
        cursor:              css('--console-caret')  || '#c0c0c0',
        selectionBackground: 'rgba(255,255,255,0.18)',
        black:   '#1e1e1e', brightBlack:   '#555',
        red:     '#f44747', brightRed:     '#f44747',
        green:   '#6a9955', brightGreen:   '#b5cea8',
        yellow:  '#dcdcaa', brightYellow:  '#dcdcaa',
        blue:    '#569cd6', brightBlue:    '#9cdcfe',
        magenta: '#c586c0', brightMagenta: '#c586c0',
        cyan:    '#4ec9b0', brightCyan:    '#4ec9b0',
        white:   '#d4d4d4', brightWhite:   '#ffffff',
      },
      scrollback:      5000,
      convertEol:      false,
      cursorBlink:     true,
      allowProposedApi: true,
    });
    this._term.loadAddon(this._fitAddon);
    this._term.open(el);

    // Capture-phase paste handler covers Ctrl+V before xterm's own paste listener fires.
    // Without this, both our handler and xterm's built-in one write to the PTY — double paste.
    // For large pastes (>10 lines or >2000 chars), write to a temp file and send a prompt to
    // the CLI asking it to read and execute the file — avoids console input-buffer issues.
    el.addEventListener('paste', async (e) => {
      e.preventDefault();
      e.stopPropagation(); // prevent xterm's textarea listener from also firing → no double paste
      // clipboardData.getData can return empty in Electron; fall back to navigator.clipboard
      const text = e.clipboardData?.getData('text/plain')
        || await navigator.clipboard.readText().catch(() => '');
      if (text) window.app.wfrPty.write(text);
    }, true);

    // Right-click: paste clipboard into PTY (contextmenu doesn't fire a paste event)
    el.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      try {
        const text = await navigator.clipboard.readText();
        if (text) window.app.wfrPty.write(text);
      } catch (_) {}
    });

    this._term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true;
      // Ctrl+C with selection → copy; otherwise fall through to PTY (SIGINT)
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'c' && !ev.shiftKey) {
        const sel = this._term.getSelection();
        if (sel) { navigator.clipboard.writeText(sel).catch(() => {}); return false; }
      }
      // Ctrl+V is handled by the capture-phase paste listener; suppress the raw \x16 keydown
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'v' && !ev.shiftKey) return false;
      return true;
    });

    // Forward keystrokes → PTY stdin; detect "exit\r" to close the window
    let _inputBuf = '';
    this._term.onData(data => {
      window.app.wfrPty.write(data);
      if (data === '\r' || data === '\n') {
        if (_inputBuf.trim() === 'exit') window.close();
        _inputBuf = '';
      } else if (data === '\x7f' || data === '\b') {
        _inputBuf = _inputBuf.slice(0, -1);
      } else if (data >= ' ') {
        _inputBuf += data;
      }
    });

    // Permanent PTY data listener — writes to terminal AND buffers during active runs
    this._reattachPtyListeners();

    // Resize observer + window resize fallback
    this._resizeObs = new ResizeObserver(() => this._fitTerminal());
    this._resizeObs.observe(el);
    this._onWinResize = () => this._fitTerminal();
    window.addEventListener('resize', this._onWinResize);

    // Deferred fit — two rAFs so xterm's renderer has measured cell sizes
    const doFit = () => {
      try {
        this._fitAddon.fit();
        this._spawnShell();
      } catch (_) {
        setTimeout(() => {
          try { this._fitAddon.fit(); } catch (_2) {}
          this._spawnShell();
        }, 80);
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(doFit));
  }

  _reattachPtyListeners() {
    window.app.wfrPty.onData(data => {
      if (this._term) this._term.write(data);
      if (this._activeItemId != null) {
        this._termBuf[this._activeItemId] = (this._termBuf[this._activeItemId] || '') + data;
      }
    });
  }

  async _spawnShell() {
    if (!this._term) return;
    if (this._modelCfg?.type !== 'cli') return;

    // Resolve CWD from the currently selected item's layer path,
    // falling back to project root if no item is selected or layer has no folder.
    let cwd = this._project?.project_path || null;
    if (this._selectedId) {
      const item = this._queue.find(q => q.id === this._selectedId);
      if (item) {
        const resolved = await this._resolveItemCwd(item);
        if (!resolved.error && resolved.cwd) cwd = resolved.cwd;
      }
    }

    await window.app.wfrPty.spawnShell({ cwd, cols: this._term.cols, rows: this._term.rows });
  }

  _fitTerminal() {
    if (!this._fitAddon || !this._term) return;
    try {
      this._fitAddon.fit();
      const { cols, rows } = this._term;
      if (cols === this._lastCols && rows === this._lastRows) return;
      this._lastCols = cols; this._lastRows = rows;
      window.app.wfrPty.resize({ cols, rows });
    } catch (_) {
      requestAnimationFrame(() => {
        try {
          this._fitAddon?.fit();
          if (this._term) {
            const { cols, rows } = this._term;
            if (cols === this._lastCols && rows === this._lastRows) return;
            this._lastCols = cols; this._lastRows = rows;
            window.app.wfrPty.resize({ cols, rows });
          }
        } catch (_2) {}
      });
    }
  }

  // ── Template ─────────────────────────────────────────────────────────

  _template() {
    return `
      <div class="pq-page">
        <header class="pq-header">
          <button class="pq-header__back" id="pqBtnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <span class="pq-header__title">Tasks Queue</span>

          <button class="pq-perm-btn pq-perm-btn--on" id="pqBtnSkipPerms" aria-pressed="true"
            title="Skip Permissions: when ON passes --dangerously-skip-permissions to Claude.&#10;Note: shares PTY with Workflow Runner — do not run both simultaneously.">
            Skip Permissions: <span id="pqSkipPermsLabel">ON</span>
          </button>

          <div class="project-page__model-group pq-header__model" style="-webkit-app-region:no-drag;">
            <div id="pqModelPicker"></div>
            <button class="project-page__model-cfg-btn" id="pqBtnModelConfigs" title="Configure AI models">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <button class="pq-git-toggle-btn" id="pqBtnGitToggle" title="Toggle Git Changes">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="5" cy="4" r="1.5" stroke="currentColor" stroke-width="1.4"/>
              <circle cx="11" cy="12" r="1.5" stroke="currentColor" stroke-width="1.4"/>
              <circle cx="11" cy="4" r="1.5" stroke="currentColor" stroke-width="1.4"/>
              <path d="M5 5.5v5a1.5 1.5 0 001.5 1.5H11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <path d="M11 5.5V9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            Git <span class="pq-git-badge" id="pqGitBadge" hidden></span>
          </button>
        </header>

        <div class="pq-toolbar">
          <span class="pq-toolbar__summary" id="pqSummary"></span>
          <div class="pq-toolbar__actions">
            <button class="pq-toolbar__btn pq-toolbar__btn--primary" id="pqBtnRunThis" hidden title="Run selected item">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M4 3l9 5-9 5V3z" fill="currentColor"/></svg>
              Run Selected
            </button>
            <button class="pq-toolbar__btn pq-toolbar__btn--primary" id="pqBtnRunAll" title="Run All (Ctrl+Enter)">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 3l5 5-5 5V3zM9 3l5 5-5 5V3z" fill="currentColor"/></svg>
              Run All
            </button>
            <button class="pq-toolbar__btn pq-toolbar__btn--stop" id="pqBtnStop" hidden title="Stop (Escape)">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor"/></svg>
              Stop
            </button>
            <button class="pq-toolbar__btn" id="pqBtnClearDone" title="Clear Done (Ctrl+D)">
              Clear Done
            </button>
          </div>
        </div>

        <div class="pq-layout">
          <div class="pq-list-panel" id="pqListPanel"></div>

          <div class="pq-detail-panel" id="pqDetailPanel">
            <!-- Thin info bar: shown only for pending/skipped items -->
            <div class="pq-term-strip" id="pqTermStrip" hidden></div>

            <!-- xterm.js terminal — always present, fills remaining height -->
            <div class="pq-terminal-wrap" id="pqTerminal"></div>

            <!-- Git diff panel — absolute overlay from the right -->
            <div class="pq-git-panel" id="pqGitPanel" hidden>
              <div class="pq-git-panel__header">
                <span class="pq-git-panel__title">Git Changes</span>
                <span class="pq-git-panel__badge" id="pqGitPanelBadge" hidden></span>
                <div class="pq-git-panel__actions">
                  <button class="pq-git-panel__icon-btn" id="pqBtnGitExpandAll" title="Expand all">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <path d="M2 5l6 6 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <button class="pq-git-panel__icon-btn" id="pqBtnGitCollapseAll" title="Collapse all">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <path d="M2 11l6-6 6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <button class="pq-git-panel__icon-btn" id="pqBtnGitRefresh" title="Refresh">↺</button>
                  <button class="pq-git-panel__icon-btn" id="pqBtnGitClose" title="Close">✕</button>
                </div>
              </div>
              <div class="pq-git-commit-bar">
                <input class="pq-git-commit-msg" id="pqGitCommitMsg" type="text"
                  spellcheck="false" placeholder="Commit message…">
                <button class="pq-git-commit-btn" id="pqBtnGitCommit" disabled>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l4 4 6-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Commit
                </button>
              </div>
              <div class="pq-git-panel__body" id="pqGitAccordion">
                <div class="git-diff-empty">No changes yet.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ── List rendering ───────────────────────────────────────────────────

  _renderList() {
    const panel = this.container.querySelector('#pqListPanel');
    if (!panel) return;

    if (this._queue.length === 0) {
      panel.innerHTML = `<div class="pq-list-empty">No prompts queued yet.<br>Use the queue button on prompts in User Stories.</div>`;
      this._updateSummary();
      return;
    }

    panel.innerHTML = this._queue.map(item => this._itemHtml(item)).join('');

    panel.querySelectorAll('.pq-item').forEach(el => {
      el.addEventListener('click', () => {
        const id   = parseInt(el.dataset.id);
        const item = this._queue.find(q => q.id === id);
        if (item) this._selectItem(item);
      });
      el.querySelector('.pq-item__retry')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id   = parseInt(el.dataset.id);
        const item = this._queue.find(q => q.id === id);
        if (!item || item.status !== 'failed') return;
        await window.db.promptQueue.update({ id, status: 'pending' });
        item.status = 'pending';
        this._refreshItemEl(id);
        this._updateSummary();
        if (this._selectedId === id) { this._updateStrip(item); this._showItemBanner(item); }
      });
      el.querySelector('.pq-item__skip')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id   = parseInt(el.dataset.id);
        const item = this._queue.find(q => q.id === id);
        if (!item || item.status !== 'pending') return;
        await window.db.promptQueue.update({ id, status: 'skipped' });
        item.status = 'skipped';
        this._refreshItemEl(id);
        this._updateSummary();
        if (this._selectedId === id) this._updateStrip(item);
      });
      el.querySelector('.pq-item__delete')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(el.dataset.id);
        if (this._isRunning && this._selectedId === id) return;
        await window.db.promptQueue.delete(id);
        this._queue = this._queue.filter(q => q.id !== id);
        el.remove();
        if (this._queue.length === 0) {
          panel.innerHTML = `<div class="pq-list-empty">No prompts queued yet.<br>Use the queue button on prompts in User Stories.</div>`;
        }
        if (this._selectedId === id) {
          this._selectedId = null;
          this.container.querySelector('#pqTermStrip')?.setAttribute('hidden', '');
          if (this._term) { this._term.reset(); this._term.writeln(`${ANSI.dim}(no item selected)${ANSI.reset}`); }
        }
        this._updateSummary();
      });
    });

    if (this._selectedId) {
      const el = panel.querySelector(`[data-id="${this._selectedId}"]`);
      if (el) el.classList.add('pq-item--selected');
    }

    this._updateSummary();
  }

  _itemHtml(item) {
    const icon       = STATUS_ICONS[item.status] || STATUS_ICONS.pending;
    const label      = item.tag || item.story_title || `Item ${item.id}`;
    const snippet    = (item.prompt_text || '').split('\n')[0].slice(0, 60);
    const canSkip    = item.status === 'pending';
    const canRetry   = item.status === 'failed';
    const canDel     = item.status !== 'running';
    const isRunning  = item.status === 'running';
    const layerBadge = item.layer_name
      ? `<span class="pq-item__layer-badge" title="Layer: ${escHtml(item.layer_name)}">${escHtml(item.layer_name)}</span>`
      : '';
    const elapsedText = isRunning && this._startTimes[item.id]
      ? this._fmt(Date.now() - this._startTimes[item.id])
      : '';

    return `
      <div class="pq-item pq-item--${item.status}${this._selectedId === item.id ? ' pq-item--selected' : ''}" data-id="${item.id}">
        <span class="pq-item__icon">${icon}</span>
        <div class="pq-item__body">
          <div class="pq-item__label">${escHtml(label)}${layerBadge}</div>
          <div class="pq-item__snippet">${escHtml(snippet)}</div>
        </div>
        <div class="pq-item__actions">
          <span class="pq-item__elapsed">${elapsedText}</span>
          ${canRetry ? `<button class="pq-item__retry" title="Re-enable for re-run">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M13.5 2.5A6.5 6.5 0 1 0 14 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10 2.5h3.5V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>` : ''}
          ${canSkip ? `<button class="pq-item__skip" title="Skip">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4 8h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </button>` : ''}
          ${canDel ? `<button class="pq-item__delete" title="Remove">
            <svg width="10" height="10" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>` : ''}
        </div>
      </div>`;
  }

  _refreshItemEl(id) {
    const item = this._queue.find(q => q.id === id);
    if (!item) return;
    const panel = this.container.querySelector('#pqListPanel');
    const el    = panel?.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    const selected = el.classList.contains('pq-item--selected');
    el.outerHTML = this._itemHtml(item);
    const newEl  = panel.querySelector(`[data-id="${id}"]`);
    if (!newEl) return;
    if (selected) newEl.classList.add('pq-item--selected');
    newEl.addEventListener('click', () => {
      const i = this._queue.find(q => q.id === id);
      if (i) this._selectItem(i);
    });
    newEl.querySelector('.pq-item__retry')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const i = this._queue.find(q => q.id === id);
      if (!i || i.status !== 'failed') return;
      await window.db.promptQueue.update({ id, status: 'pending' });
      i.status = 'pending';
      this._refreshItemEl(id);
      this._updateSummary();
      if (this._selectedId === id) { this._updateStrip(i); this._showItemBanner(i); }
    });
    newEl.querySelector('.pq-item__skip')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const i = this._queue.find(q => q.id === id);
      if (!i || i.status !== 'pending') return;
      await window.db.promptQueue.update({ id, status: 'skipped' });
      i.status = 'skipped';
      this._refreshItemEl(id);
      this._updateSummary();
      if (this._selectedId === id) this._updateStrip(i);
    });
    newEl.querySelector('.pq-item__delete')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (this._isRunning && this._selectedId === id) return;
      await window.db.promptQueue.delete(id);
      this._queue = this._queue.filter(q => q.id !== id);
      newEl.remove();
      if (this._selectedId === id) {
        this._selectedId = null;
        this.container.querySelector('#pqTermStrip')?.setAttribute('hidden', '');
        if (this._term) { this._term.reset(); this._term.writeln(`${ANSI.dim}(no item selected)${ANSI.reset}`); }
      }
      this._updateSummary();
    });
  }

  _selectItem(item) {
    this._selectedId   = item.id;
    this._selectedItem = item;
    const panel = this.container.querySelector('#pqListPanel');
    panel?.querySelectorAll('.pq-item').forEach(el => el.classList.remove('pq-item--selected'));
    panel?.querySelector(`[data-id="${item.id}"]`)?.classList.add('pq-item--selected');

    this._updateStrip(item);
    this._updateCommitMsg(item);

    if (item.status === 'done' || item.status === 'failed') {
      this._replayOutput(item);
    } else if (item.status === 'pending' || item.status === 'skipped') {
      this._cdToItemPath(item);
    }
    // Running: terminal already shows live output — do nothing
  }

  async _cdToItemPath(item) {
    if (this._activeItemId != null) return; // don't interrupt a live run
    if (!this._term) return;
    const { cwd, error } = await this._resolveItemCwd(item);
    if (error || !cwd) return;
    // Change directory in the running shell — no kill/respawn
    window.app.wfrPty.write(`cd "${cwd}"\r`);
  }

  // ── Strip + terminal helpers ─────────────────────────────────────────

  _updateStrip(item) {
    const strip      = this.container.querySelector('#pqTermStrip');
    const runThisBtn = this.container.querySelector('#pqBtnRunThis');
    if (!strip) return;

    const isPending = item.status === 'pending';
    const isSkipped = item.status === 'skipped';
    strip.hidden = !(isPending || isSkipped);

    // Show/hide toolbar Run Selected based on whether selected item is pending
    if (runThisBtn) runThisBtn.hidden = !isPending;

    if (!isPending && !isSkipped) return;

    strip.innerHTML = `
      <div class="pq-strip__meta">
        <span class="pq-detail__status pq-detail__status--${item.status}">${item.status}</span>
        ${item.story_title ? `<span class="pq-strip__title">${escHtml(item.story_title)}</span>` : ''}
        ${item.tag ? `<span class="pq-strip__tag">${escHtml(item.tag)}</span>` : ''}
      </div>`;
  }

  _showItemBanner(item) {
    if (!this._term) return;
    this._term.reset();
    const label = item.story_title || item.tag || `#${item.id}`;
    this._term.writeln(`${ANSI.dim}── ${label} ──${ANSI.reset}`);
    this._term.writeln(`${ANSI.dim}Status: ${item.status}. Click "Run Selected" to execute.${ANSI.reset}`);
  }

  _replayOutput(item) {
    if (!this._term) return;
    this._term.reset();
    const label = item.story_title || item.tag || `#${item.id}`;
    const color = item.status === 'done' ? ANSI.green : ANSI.red;
    this._term.writeln(`${ANSI.dim}── Output for: ${ANSI.reset}${color}${label}${ANSI.reset}${ANSI.dim} ──${ANSI.reset}`);
    if (item.output) {
      this._term.write(item.output);
    } else {
      this._term.writeln(`${ANSI.dim}(no output recorded)${ANSI.reset}`);
    }
  }

  _writeItemBanner(item) {
    if (!this._term) return;
    const label = item.story_title || item.tag || `#${item.id}`;
    const line  = '─'.repeat(Math.max(label.length + 4, 40));
    this._term.write(`\r\n${ANSI.bold}${ANSI.cyan}${line}\r\n  ${label}\r\n${line}${ANSI.reset}\r\n`);
  }

  // ── Run logic ────────────────────────────────────────────────────────

  async _runItem(item, { interactive = true, skipPermissions = null } = {}) {
    if (this._isRunning) return;

    const { cwd, error: cwdError } = await this._resolveItemCwd(item);
    if (cwdError) {
      if (this._term) {
        this._term.reset();
        this._term.writeln(`${ANSI.red}CWD Error: ${cwdError}${ANSI.reset}`);
      }
      return;
    }

    const effectiveSkipPerms = skipPermissions ?? this._skipPermissions;

    this._isRunning    = true;
    this._activeItemId = item.id;
    this._termBuf[item.id] = '';

    item.status = 'running';
    const ranAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
    item.ran_at = ranAt;
    await window.db.promptQueue.update({ id: item.id, status: 'running', ran_at: ranAt });

    this._refreshItemEl(item.id);
    this._updateSummary();
    this._updateToolbarRunState(true);
    this._updateStrip(item); // hides strip (status = running)

    this._startTimes[item.id] = Date.now();
    this._startElapsedTimer(item.id);

    this._term?.reset();
    this._writeItemBanner(item);

    // Register per-run layerDone listener
    window.app.wfrPty.onLayerDone(async ({ layerId, error: runError }) => {
      if (layerId !== item.id) return;

      // Detach all listeners, re-attach permanent onData
      window.app.wfrPty.offAll();
      this._reattachPtyListeners();

      this._stopElapsedTimer();
      const elapsed   = this._fmt(Date.now() - this._startTimes[item.id]);
      const succeeded = !runError;

      item.status = succeeded ? 'done' : 'failed';
      item.output = this._termBuf[item.id] || '';

      const icon  = succeeded ? `${ANSI.green}✔` : `${ANSI.red}✗`;
      const label = item.story_title || item.tag || `#${item.id}`;
      this._term?.write(`\r\n${icon}  ${label} — ${succeeded ? 'done' : 'failed'} in ${elapsed}${ANSI.reset}\r\n`);
      if (runError) this._term?.write(`${ANSI.red}Error: ${runError}${ANSI.reset}\r\n`);

      await window.db.promptQueue.update({
        id:     item.id,
        status: item.status,
        output: item.output,
      });

      this._activeItemId = null;
      this._isRunning    = false;

      this._refreshItemEl(item.id);
      this._updateSummary();
      this._updateToolbarRunState(false);
      if (this._selectedId === item.id) this._updateStrip(item);
      this._refreshGitPanel();

      // Run All: advance to next pending item
      if (this._runAll && succeeded) {
        const next = this._queue.find(q => q.status === 'pending');
        if (next) {
          setTimeout(() => {
            this._selectItem(next);
            this._runItem(next, { interactive: false, skipPermissions: true });
          }, 200);
        } else {
          this._runAll = false;
          this._updateToolbarRunAllState(false);
        }
      } else if (this._runAll) {
        this._runAll = false;
        this._updateToolbarRunAllState(false);
      }
    });

    this._fitTerminal();
    this._term?.focus();

    const result = await window.app.wfrPty.runInShell({
      layerId:         String(item.id),
      prompt:          item.prompt_text,
      model:           this._modelCfg,
      cwd,
      skipPermissions: effectiveSkipPerms,
      interactive,
    });

    if (!result?.ok) {
      window.app.wfrPty.offAll();
      this._reattachPtyListeners();
      this._stopElapsedTimer();
      this._term?.write(`${ANSI.red}Failed to start: ${result?.error || 'unknown'}${ANSI.reset}\r\n`);
      item.status    = 'failed';
      this._isRunning    = false;
      this._activeItemId = null;
      await window.db.promptQueue.update({ id: item.id, status: 'failed' });
      this._refreshItemEl(item.id);
      this._updateSummary();
      this._updateToolbarRunState(false);
      if (this._selectedId === item.id) this._updateStrip(item);
    }
  }

  // ── Elapsed timer ────────────────────────────────────────────────────

  _startElapsedTimer(itemId) {
    this._stopElapsedTimer();
    this._timerInt = setInterval(() => {
      const start = this._startTimes[itemId];
      if (!start) return;
      const el = this.container.querySelector(`[data-id="${itemId}"] .pq-item__elapsed`);
      if (el) el.textContent = this._fmt(Date.now() - start);
    }, 500);
  }

  _stopElapsedTimer() {
    if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
  }

  _fmt(ms) {
    const s = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  // ── Resolve CWD ──────────────────────────────────────────────────────

  async _resolveItemCwd(item) {
    if (item.layer_id) {
      const layer = await window.db.projectLayers.get(item.layer_id);
      if (layer?.folder_path?.trim()) {
        return { cwd: layer.folder_path.trim(), error: null };
      }
      const layerName = layer?.name || item.layer_name || `#${item.layer_id}`;
      return {
        cwd:   null,
        error: `Layer "${layerName}" has no folder path set.\nConfigure it in Layers before running this task.`,
      };
    }
    const cwd = this._project?.project_path?.trim() || null;
    if (!cwd) return { cwd: null, error: 'No project folder selected. Open the project folder first.' };
    return { cwd, error: null };
  }

  // ── Commit ───────────────────────────────────────────────────────────

  _updateCommitMsg(item) {
    const input = this.container.querySelector('#pqGitCommitMsg');
    if (!input) return;
    const title = item.story_title || item.tag || 'Task';
    input.value = `#${item.id} - ${title}`;
  }

  async _commitChanges() {
    const msgEl = this.container.querySelector('#pqGitCommitMsg');
    const btn   = this.container.querySelector('#pqBtnGitCommit');
    const cwd   = this._getGitCwd();
    if (!cwd || !msgEl) return;

    const msg = msgEl.value.trim();
    if (!msg || this._gitFiles.length === 0) return;

    btn?.classList.add('pq-git-commit-btn--busy');
    if (btn) btn.disabled = true;

    try {
      const safeMsg = msg.replace(/'/g, "''");
      const r = await window.db.terminal.exec({
        command: `git add -A 2>&1; git commit -m '${safeMsg}' 2>&1`,
        cwd,
      });
      if (r.exitCode === 0 || (r.stdout || '').includes('master') || (r.stdout || '').includes('main') || (r.stdout || '').includes('HEAD')) {
        this._gitExpandedFiles.clear();
      }
      await this._refreshGitPanel();
    } catch {
      await this._refreshGitPanel();
    } finally {
      btn?.classList.remove('pq-git-commit-btn--busy');
    }
  }

  // ── Toolbar helpers ──────────────────────────────────────────────────

  _updateToolbarRunState(running) {
    const stop   = this.container.querySelector('#pqBtnStop');
    const runAll = this.container.querySelector('#pqBtnRunAll');
    if (stop)   stop.hidden   = !running;
    if (runAll) runAll.hidden = running || this._runAll;
  }

  _updateToolbarRunAllState(active) {
    const runAll = this.container.querySelector('#pqBtnRunAll');
    const stop   = this.container.querySelector('#pqBtnStop');
    if (runAll) runAll.hidden = active;
    if (stop)   stop.hidden  = !active && !this._isRunning;
  }

  _updateSummary() {
    const el = this.container.querySelector('#pqSummary');
    if (!el) return;
    const pending = this._queue.filter(q => q.status === 'pending').length;
    const done    = this._queue.filter(q => q.status === 'done').length;
    const failed  = this._queue.filter(q => q.status === 'failed').length;
    const parts   = [`${pending} pending`, `${done} done`];
    if (failed > 0) parts.push(`${failed} failed`);
    el.textContent = parts.join(' · ');
  }

  // ── Git panel ────────────────────────────────────────────────────────

  _getGitCwd() {
    return this._project?.project_path || null;
  }

  _parseGitStatus(output) {
    return output.split('\n')
      .filter(l => /^[ MADRCU?!]{2} .+/.test(l))
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

  _renderDiffBody(diffText) {
    const esc = escHtml;
    if (!diffText || !diffText.trim()) return '<div class="git-diff-empty">No diff available.</div>';
    let html = '<table class="git-diff-table"><tbody>';
    let oldLine = 0, newLine = 0;
    for (const raw of diffText.split('\n')) {
      if (/^(diff --git|index |--- |\+\+\+ |Binary |new file|deleted file|old mode|new mode|rename )/.test(raw)) continue;
      if (raw.startsWith('@@')) {
        const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
        if (m) {
          oldLine = parseInt(m[1]); newLine = parseInt(m[2]);
          const hunkHeader = raw.match(/@@ [^@]+ @@/)?.[0] || raw;
          const ctx = m[3] ? esc(m[3].trim()) : '';
          html += `<tr class="gd-row gd-row--hunk"><td class="gd-ln"></td><td class="gd-ln"></td><td class="gd-code">${esc(hunkHeader)}${ctx ? ` <span class="gd-hunk-ctx">${ctx}</span>` : ''}</td></tr>`;
        }
        continue;
      }
      if (raw.startsWith('-')) {
        html += `<tr class="gd-row gd-row--del"><td class="gd-ln gd-ln--del">${oldLine++}</td><td class="gd-ln"></td><td class="gd-code gd-code--del"><span class="gd-sign">&#x2212;</span>${esc(raw.slice(1))}</td></tr>`;
      } else if (raw.startsWith('+')) {
        html += `<tr class="gd-row gd-row--add"><td class="gd-ln"></td><td class="gd-ln gd-ln--add">${newLine++}</td><td class="gd-code gd-code--add"><span class="gd-sign">+</span>${esc(raw.slice(1))}</td></tr>`;
      } else if (raw.startsWith(' ')) {
        html += `<tr class="gd-row gd-row--ctx"><td class="gd-ln">${oldLine++}</td><td class="gd-ln">${newLine++}</td><td class="gd-code">${esc(raw.slice(1))}</td></tr>`;
      } else if (raw.startsWith('\\')) {
        html += `<tr class="gd-row gd-row--meta"><td class="gd-ln"></td><td class="gd-ln"></td><td class="gd-code gd-code--meta">${esc(raw)}</td></tr>`;
      }
    }
    html += '</tbody></table>';
    return html;
  }

  async _refreshGitPanel() {
    const cwd         = this._getGitCwd();
    const wrap        = this.container.querySelector('#pqGitAccordion');
    const headerBadge = this.container.querySelector('#pqGitBadge');
    const panelBadge  = this.container.querySelector('#pqGitPanelBadge');
    const commitBtn   = this.container.querySelector('#pqBtnGitCommit');
    if (!cwd || !wrap) return;

    const _updateBadges = (count) => {
      if (headerBadge) { headerBadge.textContent = String(count); headerBadge.hidden = count === 0; }
      if (panelBadge)  { panelBadge.textContent  = String(count); panelBadge.hidden  = count === 0; }
      if (commitBtn && !commitBtn.classList.contains('pq-git-commit-btn--busy')) {
        commitBtn.disabled = count === 0;
      }
    };

    try {
      const r     = await window.db.terminal.exec({ command: 'git status --short -uall 2>&1', cwd });
      const files = this._parseGitStatus(r.stdout || '');

      const noChange = files.length === this._gitFiles.length &&
        files.every((f, i) => f.file === this._gitFiles[i]?.file && f.statusType === this._gitFiles[i]?.statusType);

      if (noChange && wrap.querySelector('.git-accordion__item')) {
        _updateBadges(files.length);
        return;
      }

      this._gitFiles = files;
      _updateBadges(files.length);
      if (this._gitPanelVisible) await this._renderGitAccordion(files, cwd);
    } catch {
      if (wrap) wrap.innerHTML = '<div class="git-diff-empty">Not a git repository.</div>';
    }
  }

  async _renderGitAccordion(files, cwd) {
    const wrap = this.container.querySelector('#pqGitAccordion');
    if (!wrap) return;
    if (files.length === 0) {
      wrap.innerHTML = '<div class="git-diff-empty">Working tree is clean.</div>';
      return;
    }

    wrap.innerHTML = files.map((f, i) => {
      const expanded = this._gitExpandedFiles.has(f.file);
      return `
        <div class="git-accordion__item${expanded ? '' : ' git-accordion__item--collapsed'}" data-idx="${i}">
          <button class="git-accordion__header" data-idx="${i}" aria-expanded="${expanded}" data-file="${escHtml(f.file)}">
            <span class="git-diff-file__status git-diff-file__status--${f.statusType}">${f.statusType}</span>
            <span class="git-accordion__filename">${escHtml(f.file)}</span>
            <svg class="git-accordion__chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="git-accordion__body" id="pqGdBody${i}" data-loaded="false">
            ${expanded ? '<div class="git-diff-empty" style="padding:8px 14px">Loading diff…</div>' : ''}
          </div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('.git-accordion__header').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx      = parseInt(btn.dataset.idx);
        const file     = btn.dataset.file;
        const body     = wrap.querySelector(`#pqGdBody${idx}`);
        const item     = wrap.querySelector(`.git-accordion__item[data-idx="${idx}"]`);
        const expanded = btn.getAttribute('aria-expanded') === 'true';

        btn.setAttribute('aria-expanded', String(!expanded));
        item.classList.toggle('git-accordion__item--collapsed', expanded);

        if (!expanded) {
          this._gitExpandedFiles.add(file);
          if (body && body.dataset.loaded !== 'true') {
            body.innerHTML = '<div class="git-diff-empty" style="padding:8px 14px">Loading diff…</div>';
            const fileInfo = files[idx];
            if (fileInfo) this._loadGitDiffInto(fileInfo, idx, cwd);
          }
        } else {
          this._gitExpandedFiles.delete(file);
        }
      });
    });

    const toLoad = files.map((f, i) => ({ f, i })).filter(({ f }) => this._gitExpandedFiles.has(f.file));
    if (toLoad.length > 0) {
      await Promise.all(toLoad.map(({ f, i }) => this._loadGitDiffInto(f, i, cwd)));
    }
  }

  async _loadGitDiffInto(fileInfo, idx, cwd) {
    const body = this.container.querySelector(`#pqGdBody${idx}`);
    if (!body) return;
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
        const r1 = await window.db.terminal.exec({ command: `git diff HEAD -- "${fileInfo.file}" 2>&1`, cwd });
        diffText = (r1.stdout || '').trim();
        if (!diffText) {
          const r2 = await window.db.terminal.exec({ command: `git diff --cached -- "${fileInfo.file}" 2>&1`, cwd });
          diffText = (r2.stdout || '').trim();
        }
      }
      body.innerHTML = this._renderDiffBody(diffText);
      body.dataset.loaded = 'true';
    } catch {
      body.innerHTML = '<div class="git-diff-error">Failed to load diff.</div>';
    }
  }

  _expandCollapseAll(expand) {
    const cwd  = this._getGitCwd();
    const wrap = this.container.querySelector('#pqGitAccordion');
    if (!wrap || !cwd) return;
    wrap.querySelectorAll('.git-accordion__item').forEach((item, idx) => {
      const btn  = item.querySelector('.git-accordion__header');
      const body = item.querySelector('.git-accordion__body');
      const file = btn?.dataset.file;
      if (!btn || !body || !file) return;
      btn.setAttribute('aria-expanded', String(expand));
      item.classList.toggle('git-accordion__item--collapsed', !expand);
      if (expand) {
        this._gitExpandedFiles.add(file);
        if (body.dataset.loaded !== 'true') {
          body.innerHTML = '<div class="git-diff-empty" style="padding:8px 14px">Loading diff…</div>';
          const fileInfo = this._gitFiles[idx];
          if (fileInfo) this._loadGitDiffInto(fileInfo, idx, cwd);
        }
      } else {
        this._gitExpandedFiles.delete(file);
      }
    });
  }

  _startGitPolling() {
    this._stopGitPolling();
    this._refreshGitPanel();
    this._gitPollInterval = setInterval(() => this._refreshGitPanel(), 5000);
  }

  _stopGitPolling() {
    if (this._gitPollInterval) { clearInterval(this._gitPollInterval); this._gitPollInterval = null; }
  }

  // ── Model dropdown ───────────────────────────────────────────────────

  async _reloadModelDropdown() {
    if (this._picker) await this._picker.reload();
  }

  // ── Events ───────────────────────────────────────────────────────────

  _bindEvents() {
    this.container.querySelector('#pqBtnBack')
      .addEventListener('click', () => this.router.navigate(this._from, { projectId: this.projectId }));

    this.container.querySelector('#pqBtnModelConfigs')
      .addEventListener('click', () => this.router.navigate('settings', { from: 'prompt-queue', fromParams: { projectId: this.projectId } }));

    // Skip Permissions toggle
    this.container.querySelector('#pqBtnSkipPerms')
      ?.addEventListener('click', () => {
        this._skipPermissions = !this._skipPermissions;
        const btn   = this.container.querySelector('#pqBtnSkipPerms');
        const label = this.container.querySelector('#pqSkipPermsLabel');
        if (btn)   btn.setAttribute('aria-pressed', String(this._skipPermissions));
        if (btn)   btn.classList.toggle('pq-perm-btn--on', this._skipPermissions);
        if (label) label.textContent = this._skipPermissions ? 'ON' : 'OFF';
      });

    // Git panel toggle
    this.container.querySelector('#pqBtnGitToggle')
      ?.addEventListener('click', () => {
        this._gitPanelVisible = !this._gitPanelVisible;
        const panel = this.container.querySelector('#pqGitPanel');
        panel?.toggleAttribute('hidden', !this._gitPanelVisible);
        this.container.querySelector('#pqBtnGitToggle')
          ?.classList.toggle('pq-git-toggle-btn--active', this._gitPanelVisible);
        if (this._gitPanelVisible) this._refreshGitPanel();
      });

    this.container.querySelector('#pqBtnGitClose')
      ?.addEventListener('click', () => {
        this._gitPanelVisible = false;
        this.container.querySelector('#pqGitPanel')?.setAttribute('hidden', '');
        this.container.querySelector('#pqBtnGitToggle')
          ?.classList.remove('pq-git-toggle-btn--active');
      });

    this.container.querySelector('#pqBtnGitCommit')
      ?.addEventListener('click', () => this._commitChanges());

    this.container.querySelector('#pqBtnGitRefresh')
      ?.addEventListener('click', () => this._refreshGitPanel());
    this.container.querySelector('#pqBtnGitExpandAll')
      ?.addEventListener('click', () => this._expandCollapseAll(true));
    this.container.querySelector('#pqBtnGitCollapseAll')
      ?.addEventListener('click', () => this._expandCollapseAll(false));

    // Run Selected — runs the currently selected pending item
    this.container.querySelector('#pqBtnRunThis')
      ?.addEventListener('click', () => {
        if (!this._isRunning && this._selectedItem) this._runItem(this._selectedItem);
      });

    // Run All — non-interactive batch, always skips permissions
    this.container.querySelector('#pqBtnRunAll')
      .addEventListener('click', () => {
        if (this._isRunning) return;
        const next = this._queue.find(q => q.status === 'pending');
        if (!next) return;
        this._runAll = true;
        this._updateToolbarRunAllState(true);
        this._selectItem(next);
        this._runItem(next, { interactive: false, skipPermissions: true });
      });

    // Stop
    this.container.querySelector('#pqBtnStop')
      .addEventListener('click', () => {
        this._runAll = false;
        window.app.wfrPty.kill();
        this._updateToolbarRunState(false);
        this._updateToolbarRunAllState(false);
      });

    // Clear Done
    this.container.querySelector('#pqBtnClearDone')
      .addEventListener('click', async () => {
        await window.db.promptQueue.clearDone(this.projectId);
        this._queue = this._queue.filter(q => !['done', 'failed', 'skipped'].includes(q.status));
        if (this._selectedId) {
          const stillExists = this._queue.find(q => q.id === this._selectedId);
          if (!stillExists) {
            this._selectedId = null;
            this.container.querySelector('#pqTermStrip')?.setAttribute('hidden', '');
            if (this._term) { this._term.reset(); this._term.writeln(`${ANSI.dim}(no item selected)${ANSI.reset}`); }
          }
        }
        this._renderList();
      });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, select, [contenteditable]')) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === 'Enter') {
        e.preventDefault();
        this.container.querySelector('#pqBtnRunAll')?.click();
      }
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey) {
        const stop = this.container.querySelector('#pqBtnStop');
        if (stop && !stop.hidden) { e.preventDefault(); stop.click(); }
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        this.container.querySelector('#pqBtnClearDone')?.click();
      }
    });
  }
}
