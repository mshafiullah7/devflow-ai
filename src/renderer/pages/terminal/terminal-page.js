import { escHtml, injectCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ProjectSidebar } from '../../components/project-sidebar/project-sidebar.js';

const ANSI = {
  reset: '\x1b[0m',
  red:   '\x1b[31m',
};

export class TerminalPage {
  constructor(container, params = null, router = null) {
    this.container      = container;
    this.router         = router;
    this._embedded      = !!router;
    this._initParams    = params;
    this._returnRoute   = params?.returnRoute || 'project-home';
    this._project       = null;
    this._projectLayers = [];
    this._selectedId    = null;

    this._term      = null;
    this._fitAddon  = null;
    this._resizeObs = null;
    this._onWinResize = null;
    this._lastCols  = 0;
    this._lastRows  = 0;
    this._switchingShell = false;

    this._sidebarCollapsed    = false;

    this._gitPanelVisible     = true;
    this._gitPanelCollapsed   = false;
    this._gitFiles         = [];
    this._gitPollInterval  = null;
    this._gitExpandedFiles = new Set();
  }

  mount() {
    injectCss('pages/terminal/terminal-page.css');
    injectCss('components/git/git-diff.css');
    if (this._embedded) injectCss('components/project-sidebar/project-sidebar.css');
    applyStoredTheme();
    this._renderLoading();
    if (this._embedded) {
      this._init(this._initParams);
    } else {
      // The pop-out window is reused (not recreated) when Terminal is opened
      // again while it's already up — main just re-sends terminal-win:init to
      // the same window/page instance, so this listener can fire more than
      // once. Route every firing through _reinit() rather than calling
      // _init() directly here.
      window.app.terminalWindow.onInit((data) => this._reinit(data));
    }
  }

  /**
   * Shared entry point for both the persistent-tab "activated again" path
   * (onResume, below) and the pop-out window's repeat terminal-win:init
   * events. Re-opening Terminal for the project that's already loaded used
   * to always re-run _init() — which spawns a fresh PTY and re-prints the
   * cwd banner — without ever killing the previous PTY first, so the old and
   * new shells both ended up writing into the same visible terminal (hence
   * the folder path showing up twice). Same project now just refits; a
   * different project properly tears down the old PTY/terminal before
   * spawning the new one.
   */
  _reinit(params) {
    if (params && params.projectId !== this._project?.id) {
      this._returnRoute = params.returnRoute || this._returnRoute;
      if (this._project) this._teardownTerminal();
      this._init(params);
      return;
    }
    if (this._fitAddon) {
      try { this._fitAddon.fit(); } catch (_) {}
    }
  }

  /** Called by the persistent-page host when this route is activated again. */
  onResume(params) {
    this._reinit(params);
  }

  _handleClose() {
    if (this._embedded) {
      const projectId = this._project?.id;
      this.router?.closePersistentRoute?.('terminal');
      this.router?.navigateTo?.(this._returnRoute, { projectId });
    } else {
      window.close();
    }
  }

  _teardownTerminal() {
    window.app.termPty.offAll();
    window.app.termPty.kill();
    if (this._gitPollInterval) { clearInterval(this._gitPollInterval); this._gitPollInterval = null; }
    if (this._resizeObs)      { this._resizeObs.disconnect(); this._resizeObs = null; }
    if (this._onWinResize)    { window.removeEventListener('resize', this._onWinResize); this._onWinResize = null; }
    if (this._term)           { this._term.dispose(); this._term = null; }
  }

  unmount() {
    this._teardownTerminal();
  }

  // ── Init ────────────────────────────────────────────────────────────────

  async _init({ projectId }) {
    const [project, projectLayers] = await Promise.all([
      window.db.projects.get(projectId),
      window.db.projectLayers.list(projectId),
    ]);
    this._project       = project || null;
    this._projectLayers = projectLayers || [];

    if (this._projectLayers.length > 0) {
      this._selectedId = this._projectLayers[0].id;
    }

    this._render();
    this._initTerminal();
    this._startGitPolling();
  }

  // ── Terminal setup ───────────────────────────────────────────────────────

  _initTerminal() {
    const el = this.container.querySelector('#termTerminal');
    if (!el) { console.error('terminal: #termTerminal element not found'); return; }
    if (!window.Terminal) {
      el.style.cssText = 'display:flex;align-items:center;justify-content:center;color:#888;font-family:monospace;font-size:12px;';
      el.textContent = 'xterm.js failed to load — check DevTools console';
      return;
    }

    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

    this._fitAddon = new window.FitAddon.FitAddon();
    this._term = new window.Terminal({
      fontFamily:       'Consolas, "Cascadia Code", "Courier New", monospace',
      fontSize:         12,
      lineHeight:       1.4,
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
      scrollback:       5000,
      convertEol:       false,
      cursorBlink:      true,
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
      if (text) window.app.termPty.write(text);
    }, true);

    // Right-click: paste clipboard text into PTY (contextmenu doesn't fire a paste event)
    el.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      try {
        const text = await navigator.clipboard.readText();
        if (text) window.app.termPty.write(text);
      } catch (_) {}
    });

    window.app.termPty.onData((data) => { if (this._term) this._term.write(data); });
    window.app.termPty.onLayerDone(({ layerId }) => {
      if (layerId === 'shell' && this._term && !this._switchingShell) {
        this._term.writeln(`\r\n${ANSI.red}Shell exited.${ANSI.reset}`);
      }
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

    this._term.onData((data) => window.app.termPty.write(data));

    this._resizeObs = new ResizeObserver(() => this._fitTerminal());
    this._resizeObs.observe(el);

    this._onWinResize = () => this._fitTerminal();
    window.addEventListener('resize', this._onWinResize);

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

  async _spawnShell() {
    if (!this._term) return;
    this._switchingShell = true;
    const cwd = this._getCwd();
    await window.app.termPty.spawnShell({ cwd, cols: this._term.cols, rows: this._term.rows });
    this._switchingShell = false;
  }

  _fitTerminal() {
    if (!this._fitAddon || !this._term) return;
    try {
      this._fitAddon.fit();
      const cols = this._term.cols;
      const rows = this._term.rows;
      if (cols === this._lastCols && rows === this._lastRows) return;
      this._lastCols = cols;
      this._lastRows = rows;
      window.app.termPty.resize({ cols, rows });
    } catch (_) {
      requestAnimationFrame(() => {
        try {
          this._fitAddon?.fit();
          if (this._term) {
            const cols = this._term.cols;
            const rows = this._term.rows;
            if (cols === this._lastCols && rows === this._lastRows) return;
            this._lastCols = cols;
            this._lastRows = rows;
            window.app.termPty.resize({ cols, rows });
          }
        } catch (_2) {}
      });
    }
  }

  // ── CWD helpers ──────────────────────────────────────────────────────────

  _getCwd() {
    const layer = this._projectLayers.find(l => l.id === this._selectedId);
    return layer?.folder_path || this._project?.project_path || null;
  }

  // ── Layer selection ──────────────────────────────────────────────────────

  _selectLayer(id) {
    const oldId = this._selectedId;
    this._selectedId = id;
    this._refreshLayerList();
    this._updateLayerHeader();
    this._refreshGitPanel();

    if (oldId !== id) {
      const layer = this._projectLayers.find(l => l.id === id);
      const newPath = layer?.folder_path || this._project?.project_path;
      if (newPath) {
        window.app.termPty.write(`Set-Location "${newPath}"; [System.IO.Directory]::SetCurrentDirectory($pwd)\r`);
      }
    }
  }

  _refreshLayerList() {
    const list = this.container.querySelector('#termLayerList');
    if (!list) return;
    list.innerHTML = this._layerListHtml();
    list.querySelectorAll('.term-layer-row').forEach(row => {
      row.addEventListener('click', () => this._selectLayer(+row.dataset.id));
    });
  }

  _layerListHtml() {
    if (!this._projectLayers.length) {
      return '<div class="term-crit-empty">No layers defined.</div>';
    }
    return this._projectLayers.map((l, idx) => {
      const sel = this._selectedId === l.id;
      return `
        <div class="term-layer-row ${sel ? 'term-layer-row--active' : ''}" data-id="${l.id}">
          <div class="term-layer-top">
            <span class="term-layer-seq">${idx + 1}</span>
            <span class="term-layer-name">${escHtml(l.name || 'Layer')}</span>
          </div>
          ${l.folder_path ? `<div class="term-layer-path">${escHtml(l.folder_path)}</div>` : ''}
        </div>`;
    }).join('');
  }

  _updateLayerHeader() {
    const layer  = this._projectLayers.find(l => l.id === this._selectedId);
    const nameEl = this.container.querySelector('#termOutputLayerName');
    if (nameEl) nameEl.textContent = layer?.name || '';
    const cwdEl = this.container.querySelector('#termOutputCwd');
    if (cwdEl) {
      const cwd = this._getCwd();
      cwdEl.hidden = !cwd;
      if (cwd) {
        cwdEl.title = cwd;
        cwdEl.querySelector('.term-output-cwd__path').textContent = cwd;
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  _renderLoading() {
    this.container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;
                  font-family:var(--font-sans,system-ui);color:var(--text-muted,#888)">
        Loading terminal…
      </div>`;
  }

  _renderShellHeader() {
    const name    = this._project?.name || 'Project';
    const initial = name.trim()[0]?.toUpperCase() || '?';
    return `
      <header class="project-home__header">
        <button class="project-home__back" id="termBtnBack" aria-label="Back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <div class="project-home__badge">
          <div class="project-home__badge-initial">${escHtml(initial)}</div>
          <span class="project-home__badge-name">${escHtml(name)}</span>
        </div>
        <span class="ph-header-page-chip">Terminal</span>
      </header>`;
  }

  _render() {
    const projectName = escHtml(this._project?.name || 'Project');

    const closeBtnHtml = this._embedded ? `
          <button class="term-back-btn" id="termBtnClose" aria-label="Back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>` : `
          <button class="term-back-btn" id="termBtnClose" aria-label="Close window">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>`;
    const headerTitle = this._embedded ? 'Terminal' : `Terminal — ${projectName}`;

    const body = `
      <div class="term-page">
        <header class="term-header">
          ${closeBtnHtml}
          <span class="term-header__title">${headerTitle}</span>
          <div class="term-header__actions">
            <button class="term-git-toggle-btn${this._gitPanelVisible ? ' term-git-toggle-btn--active' : ''}" id="termBtnGitToggle" title="Toggle Git Changes">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <circle cx="5" cy="4" r="1.5" stroke="currentColor" stroke-width="1.4"/>
                <circle cx="11" cy="12" r="1.5" stroke="currentColor" stroke-width="1.4"/>
                <circle cx="11" cy="4" r="1.5" stroke="currentColor" stroke-width="1.4"/>
                <path d="M5 5.5v5a1.5 1.5 0 001.5 1.5H11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                <path d="M11 5.5V9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
              Git <span class="term-git-badge" id="termGitBadge" hidden></span>
            </button>
          </div>
        </header>

        <div class="term-body">
          <!-- Left: project layer list -->
          <aside class="term-sidebar${this._sidebarCollapsed ? ' term-sidebar--collapsed' : ''}">
            <div class="term-sidebar__section-hd">
              <span class="term-sidebar__hd-label">Project Layers</span>
              <button class="term-sidebar__toggle" id="termSidebarToggle" aria-label="${this._sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M15 18l-6-6 6-6"/>
                </svg>
              </button>
            </div>
            <div class="term-layer-list" id="termLayerList">
              ${this._layerListHtml()}
            </div>
          </aside>

          <!-- Center: terminal panel -->
          <section class="term-output-panel">
            <div class="term-output-header">
              <div class="term-output-header__top">
                <span class="term-output-layer-name" id="termOutputLayerName">
                  ${escHtml(this._projectLayers[0]?.name || '')}
                </span>
              </div>
              <div class="term-output-cwd" id="termOutputCwd" hidden>
                <span class="term-output-cwd__label">cwd</span>
                <span class="term-output-cwd__path"></span>
              </div>
            </div>
            <div class="term-output-body">
              <div class="term-terminal-wrap" id="termTerminal"></div>

              <!-- Git panel — sibling of the terminal wrap only, so its width
                   is relative to the terminal area, not the whole page row -->
              <aside class="term-git-panel${this._gitPanelCollapsed ? ' term-git-panel--collapsed' : ''}${this._gitPanelVisible ? '' : ' term-git-panel--hidden'}" id="termGitPanel">
                <div class="term-git-panel__header">
                  <button class="term-git-panel__collapse-btn" id="termBtnGitCollapse" title="${this._gitPanelCollapsed ? 'Expand' : 'Collapse'}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  </button>
                  <span class="term-git-panel__title">Git Changes</span>
                  <span class="term-git-panel__badge" id="termGitPanelBadge" hidden></span>
                  <div class="term-git-panel__actions">
                    <button class="term-git-panel__icon-btn" id="termBtnGitExpandAll" title="Expand all">
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M2 5l6 6 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </button>
                    <button class="term-git-panel__icon-btn" id="termBtnGitCollapseAll" title="Collapse all">
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M2 11l6-6 6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </button>
                    <button class="term-git-panel__refresh" id="termBtnGitRefresh" title="Refresh">↺</button>
                    <button class="term-git-panel__icon-btn" id="termBtnGitClose" title="Close">✕</button>
                  </div>
                </div>
                <div class="term-git-commit-bar">
                  <input class="term-git-commit-msg" id="termGitCommitMsg" type="text" spellcheck="false" placeholder="Commit message…">
                  <button class="term-git-commit-btn" id="termBtnGitCommit" disabled>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8l4 4 6-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Commit
                  </button>
                </div>
                <div class="term-git-panel__body" id="termGitAccordion">
                  <div class="git-diff-empty">No changes yet.</div>
                </div>
              </aside>
            </div>
          </section>
        </div>
      </div>`;

    if (this._embedded) {
      this._sidebar = new ProjectSidebar({ projectId: this._project?.id, router: this.router, activeRoute: 'terminal' });
      this.container.innerHTML = `
        <div class="ph-project-shell">
          ${this._renderShellHeader()}
          <div class="ph-page-with-nav">
            ${this._sidebar.html()}
            ${body}
          </div>
        </div>`;
      this._sidebar.bindEvents(this.container);
      this._sidebar.loadCounts(this.container);
      this.container.querySelector('#termBtnBack')
        ?.addEventListener('click', () => this._handleClose());
    } else {
      this.container.innerHTML = body;
    }

    this._bindEvents();
    this._updateLayerHeader();
  }

  _bindEvents() {
    this.container.querySelector('#termBtnClose')
      ?.addEventListener('click', () => this._handleClose());

    this.container.querySelector('#termSidebarToggle')
      ?.addEventListener('click', () => this._toggleSidebar());

    this.container.querySelectorAll('.term-layer-row').forEach(row => {
      row.addEventListener('click', () => this._selectLayer(+row.dataset.id));
    });

    this.container.querySelector('#termBtnGitToggle')
      ?.addEventListener('click', () => this._toggleGitPanel());

    this.container.querySelector('#termBtnGitCollapse')
      ?.addEventListener('click', () => this._toggleGitPanelCollapse());

    this.container.querySelector('#termBtnGitClose')
      ?.addEventListener('click', () => {
        this._gitPanelVisible = false;
        this.container.querySelector('#termGitPanel')?.classList.add('term-git-panel--hidden');
        this.container.querySelector('#termBtnGitToggle')?.classList.remove('term-git-toggle-btn--active');
        setTimeout(() => this._fitTerminal(), 220);
      });

    this.container.querySelector('#termBtnGitRefresh')
      ?.addEventListener('click', () => this._refreshGitPanel());
    this.container.querySelector('#termBtnGitExpandAll')
      ?.addEventListener('click', () => this._expandCollapseAll(true));
    this.container.querySelector('#termBtnGitCollapseAll')
      ?.addEventListener('click', () => this._expandCollapseAll(false));
    this.container.querySelector('#termBtnGitCommit')
      ?.addEventListener('click', () => this._commitChanges());
  }

  // ── Sidebar collapse ─────────────────────────────────────────────────────

  _toggleSidebar() {
    this._sidebarCollapsed = !this._sidebarCollapsed;
    const sidebar = this.container.querySelector('.term-sidebar');
    const btn     = this.container.querySelector('#termSidebarToggle');
    sidebar?.classList.toggle('term-sidebar--collapsed', this._sidebarCollapsed);
    if (btn) btn.setAttribute('aria-label', this._sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
    // Sidebar width animates via CSS transition — refit once it settles so
    // xterm's column count matches the final size right away.
    setTimeout(() => this._fitTerminal(), 220);
  }

  _toggleGitPanelCollapse() {
    this._gitPanelCollapsed = !this._gitPanelCollapsed;
    const panel = this.container.querySelector('#termGitPanel');
    const btn   = this.container.querySelector('#termBtnGitCollapse');
    panel?.classList.toggle('term-git-panel--collapsed', this._gitPanelCollapsed);
    if (btn) btn.title = this._gitPanelCollapsed ? 'Expand' : 'Collapse';
    setTimeout(() => this._fitTerminal(), 220);
  }

  // ── Git diff panel ───────────────────────────────────────────────────────

  _toggleGitPanel() {
    this._gitPanelVisible = !this._gitPanelVisible;
    const panel = this.container.querySelector('#termGitPanel');
    const btn   = this.container.querySelector('#termBtnGitToggle');
    panel?.classList.toggle('term-git-panel--hidden', !this._gitPanelVisible);
    if (btn) btn.classList.toggle('term-git-toggle-btn--active', this._gitPanelVisible);
    if (this._gitPanelVisible) {
      const wrap = this.container.querySelector('#termGitAccordion');
      if (wrap) wrap.innerHTML = '';
      this._refreshGitPanel();
    }
    setTimeout(() => this._fitTerminal(), 220);
  }

  _getGitCwd() {
    return this._getCwd();
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
          const hunkHeader = raw.match(/@@ [^@]+ @@/)?.[0] || raw;
          const ctx = m[3] ? esc(m[3].trim()) : '';
          html += `<tr class="gd-row gd-row--hunk">
            <td class="gd-ln"></td><td class="gd-ln"></td>
            <td class="gd-code">${esc(hunkHeader)}${ctx ? ` <span class="gd-hunk-ctx">${ctx}</span>` : ''}</td>
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

  async _refreshGitPanel() {
    const cwd         = this._getGitCwd();
    const wrap        = this.container.querySelector('#termGitAccordion');
    const headerBadge = this.container.querySelector('#termGitBadge');
    const panelBadge  = this.container.querySelector('#termGitPanelBadge');
    const commitBtn   = this.container.querySelector('#termBtnGitCommit');
    if (!cwd || !wrap) return;

    const _updateBadges = (count) => {
      if (headerBadge) { headerBadge.textContent = String(count); headerBadge.hidden = count === 0; }
      if (panelBadge)  { panelBadge.textContent  = String(count); panelBadge.hidden  = count === 0; }
      if (commitBtn && !commitBtn.classList.contains('term-git-commit-btn--busy')) {
        commitBtn.disabled = count === 0;
      }
    };

    try {
      const r = await window.db.terminal.exec({ command: 'git status --short -uall 2>&1', cwd });
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
    const wrap = this.container.querySelector('#termGitAccordion');
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
          <div class="git-accordion__body" id="termGdBody${i}" data-loaded="false">
            ${expanded ? '<div class="git-diff-empty" style="padding:8px 14px">Loading diff…</div>' : ''}
          </div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('.git-accordion__header').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx      = parseInt(btn.dataset.idx);
        const file     = btn.dataset.file;
        const body     = wrap.querySelector(`#termGdBody${idx}`);
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

    const toLoad = files
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => this._gitExpandedFiles.has(f.file));
    if (toLoad.length > 0) {
      await Promise.all(toLoad.map(({ f, i }) => this._loadGitDiffInto(f, i, cwd)));
    }
  }

  async _loadGitDiffInto(fileInfo, idx, cwd) {
    const body = this.container.querySelector(`#termGdBody${idx}`);
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
      body.dataset.loaded = 'true';
    } catch {
      body.innerHTML = '<div class="git-diff-error">Failed to load diff.</div>';
    }
  }

  _expandCollapseAll(expand) {
    const cwd  = this._getGitCwd();
    const wrap = this.container.querySelector('#termGitAccordion');
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
    if (this._gitPollInterval) clearInterval(this._gitPollInterval);
    this._refreshGitPanel();
    this._gitPollInterval = setInterval(() => this._refreshGitPanel(), 5000);
  }

  async _commitChanges() {
    const msgEl = this.container.querySelector('#termGitCommitMsg');
    const btn   = this.container.querySelector('#termBtnGitCommit');
    const cwd   = this._getGitCwd();
    if (!cwd || !msgEl) return;

    const msg = msgEl.value.trim();
    if (!msg || this._gitFiles.length === 0) return;

    btn?.classList.add('term-git-commit-btn--busy');
    if (btn) btn.disabled = true;

    try {
      const safeMsg = msg.replace(/'/g, "''");
      const r = await window.db.terminal.exec({
        command: `git add -A 2>&1; git commit -m '${safeMsg}' 2>&1`,
        cwd,
      });
      if (r.exitCode === 0 || (r.stdout || '').includes('master') || (r.stdout || '').includes('main') || (r.stdout || '').includes('HEAD')) {
        this._gitExpandedFiles.clear();
        await this._refreshGitPanel();
      } else {
        await this._refreshGitPanel();
      }
    } catch {
      await this._refreshGitPanel();
    } finally {
      btn?.classList.remove('term-git-commit-btn--busy');
      if (btn) btn.disabled = false;
      if (msgEl) msgEl.value = '';
    }
  }
}
