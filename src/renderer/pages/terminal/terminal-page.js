import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';

// Load xterm vendor bundle once, cached across page visits
let _xtermReady = null;

function _loadXterm() {
  if (_xtermReady) return _xtermReady;
  _xtermReady = new Promise((resolve, reject) => {
    injectCss('vendor/xterm.css');
    const load = (src) => new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
    load('vendor/xterm.js')
      .then(() => load('vendor/xterm-addon-fit.js'))
      .then(resolve)
      .catch(reject);
  });
  return _xtermReady;
}

export class TerminalPage {
  constructor(container, params, router) {
    this.container  = container;
    this.router     = router;
    this._projectId = params.projectId;
    this._project   = null;
    this._xterm     = null;
    this._fitAddon  = null;
    this._resizeObs = null;
  }

  async mount() {
    injectCss('pages/terminal/terminal-page.css');
    applyStoredTheme();

    [this._project] = await Promise.all([
      window.db.projects.get(this._projectId),
      _loadXterm(),
    ]);

    this.container.innerHTML = this._template();
    this._initXterm();
    this._bindEvents();
  }

  unmount() {
    removeCss('pages/terminal/terminal-page.css');
    this._resizeObs?.disconnect();
    this._resizeObs = null;
    this._xterm?.dispose();
    this._xterm = null;
    window.db.pty.destroy();
    window.db.pty.removeListeners();
  }

  _template() {
    const name = this._project ? escHtml(this._project.name) : 'Project';
    return `
      <div class="term-page">
        <header class="term-page__header">
          <button class="term-page__back" id="termBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div class="term-page__title-group">
            <div class="term-page__title">${name}</div>
            <div class="term-page__subtitle">Terminal</div>
          </div>
        </header>
        <div class="term-page__body">
          <div class="term-page__xterm" id="termContainer"></div>
        </div>
      </div>
    `;
  }

  _xtermTheme() {
    const s   = getComputedStyle(document.documentElement);
    const get = (v, fb) => s.getPropertyValue(v).trim() || fb;
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    return isDark
      ? {
          background:    get('--bg',            '#1e1e2e'),
          foreground:    '#cdd6f4',
          cursor:        get('--accent',        '#89b4fa'),
          cursorAccent:  get('--bg',            '#1e1e2e'),
          selectionBackground: 'rgba(137,180,250,0.3)',
          black:         '#45475a', red:          '#f38ba8',
          green:         '#a6e3a1', yellow:       '#f9e2af',
          blue:          '#89b4fa', magenta:      '#f5c2e7',
          cyan:          '#94e2d5', white:        '#bac2de',
          brightBlack:   '#585b70', brightRed:    '#f38ba8',
          brightGreen:   '#a6e3a1', brightYellow: '#f9e2af',
          brightBlue:    '#89b4fa', brightMagenta:'#f5c2e7',
          brightCyan:    '#94e2d5', brightWhite:  '#a6adc8',
        }
      : {
          background:    '#ffffff',
          foreground:    '#383a42',
          cursor:        '#526fff',
          cursorAccent:  '#ffffff',
          selectionBackground: 'rgba(82,111,255,0.2)',
          black:         '#383a42', red:          '#e45649',
          green:         '#50a14f', yellow:       '#c18401',
          blue:          '#0184bc', magenta:      '#a626a4',
          cyan:          '#0997b3', white:        '#a0a1a7',
          brightBlack:   '#696c77', brightRed:    '#e45649',
          brightGreen:   '#50a14f', brightYellow: '#c18401',
          brightBlue:    '#4078f2', brightMagenta:'#a626a4',
          brightCyan:    '#0997b3', brightWhite:  '#383a42',
        };
  }

  _initXterm() {
    const Terminal = window.Terminal;
    const FitAddon = window.FitAddon;

    if (!Terminal || !FitAddon) {
      const el = this.container.querySelector('#termContainer');
      if (el) el.innerHTML = `<div class="term-page__err">Terminal libraries failed to load.</div>`;
      return;
    }

    this._xterm = new Terminal({
      fontFamily: "'Cascadia Code', 'Cascadia Mono', 'Consolas', 'Menlo', monospace",
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
      theme: this._xtermTheme(),
    });

    this._fitAddon = new FitAddon();
    this._xterm.loadAddon(this._fitAddon);

    const el = this.container.querySelector('#termContainer');
    this._xterm.open(el);

    requestAnimationFrame(() => {
      this._fitAddon.fit();
      this._xterm?.focus();
    });

    // PTY → xterm
    window.db.pty.onData(data => this._xterm?.write(data));
    window.db.pty.onExit(({ exitCode }) => {
      if (!this._xterm) return;
      this._xterm.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}. Restarting…]\x1b[0m`);
      setTimeout(() => this._startPty(), 1500);
    });

    // xterm → PTY
    this._xterm.onData(data => window.db.pty.write(data));

    // Resize PTY when xterm dimensions change
    this._xterm.onResize(({ cols, rows }) => window.db.pty.resize({ cols, rows }));

    // Keep xterm fitted when the container resizes
    this._resizeObs = new ResizeObserver(() => this._fitAddon?.fit());
    this._resizeObs.observe(el);

    this._startPty();
  }

  async _startPty() {
    if (!this._xterm) return;
    try {
      const { cols, rows } = this._xterm;
      await window.db.pty.create({
        cwd:  this._project?.project_path || '',
        cols,
        rows,
      });
      this._xterm?.focus();
    } catch (err) {
      this._xterm?.writeln(`\r\n\x1b[31mFailed to start terminal: ${err.message}\x1b[0m`);
    }
  }

  _bindEvents() {
    this.container.querySelector('#termBack')
      .addEventListener('click', () =>
        this.router.navigate('project-home', { projectId: this._projectId }));
  }
}
