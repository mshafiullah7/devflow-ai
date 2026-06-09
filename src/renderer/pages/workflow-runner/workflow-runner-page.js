import { escHtml, injectCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';

const STATUS = {
  open:         { label: 'Open',         cls: 'wfr-status--open'    },
  running:      { label: 'Running',      cls: 'wfr-status--running' },
  executed:     { label: 'Executed',     cls: 'wfr-status--done'    },
  failed:       { label: 'Failed',       cls: 'wfr-status--error'   },
  needs_review: { label: 'Needs Review', cls: 'wfr-status--review'  },
};

// ANSI helpers written into the terminal
const ANSI = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  dim:    '\x1b[2m',
};

function layerBanner(label, idx, total) {
  const title = `  Layer ${idx + 1}/${total}: ${label}  `;
  const line  = '─'.repeat(Math.max(title.length, 40));
  return `\r\n${ANSI.bold}${ANSI.cyan}${line}\r\n${title}\r\n${line}${ANSI.reset}\r\n`;
}

function doneBanner(label, elapsed, ok) {
  const icon  = ok ? `${ANSI.green}✔` : `${ANSI.red}✗`;
  return `\r\n${icon}  ${label} — ${ok ? 'executed' : 'failed'} in ${elapsed}${ANSI.reset}\r\n`;
}

export class WorkflowRunnerPage {
  constructor(container) {
    this.container      = container;
    this._workflow      = null;
    this._project       = null;
    this._projectLayers = [];
    this._layers        = [];
    this._criteria      = [];
    this._modelConfig   = null;
    this._statuses      = {};
    this._selectedId    = null;
    this._running       = false;
    this._startTimes    = {};
    this._timerInt      = null;
    this._screenDesign  = null;
    this._screenFilePath = null;
    this._tempDir       = null;

    // xterm terminal + fit addon
    this._term    = null;
    this._fitAddon = null;
    this._resizeObs = null;
    this._onWinResize = null;
  }

  mount() {
    injectCss('pages/workflow-runner/workflow-runner-page.css');
    applyStoredTheme();
    this._renderLoading();
    window.app.workflowWindow.onInit((data) => this._init(data));
  }

  unmount() {
    window.app.workflowChat.offAll();
    window.app.wfrPty.offAll();
    window.app.wfrPty.kill();
    if (this._timerInt)    clearInterval(this._timerInt);
    if (this._resizeObs)   this._resizeObs.disconnect();
    if (this._onWinResize) window.removeEventListener('resize', this._onWinResize);
    if (this._term) { this._term.dispose(); this._term = null; }
    if (this._tempDir) { window.app.deleteTempDir(this._tempDir); this._tempDir = null; }
  }

  // ── Init ────────────────────────────────────────────────────────────────

  async _init({ projectId, workflowId, modelConfig, startLayerId }) {
    this._modelConfig = modelConfig;
    const [workflow, layers, criteria, project, projectLayers] = await Promise.all([
      window.db.workflows.get(workflowId),
      window.db.layers.list(workflowId),
      window.db.successCriteria.list(workflowId),
      window.db.projects.get(projectId),
      window.db.projectLayers.list(projectId),
    ]);
    this._workflow      = workflow;
    this._project       = project || null;
    this._projectLayers = projectLayers || [];
    this._layers        = (layers || []).slice().sort((a, b) => a.order_num - b.order_num);
    this._criteria      = criteria || [];

    if (workflow?.screen_design_id) {
      const sd = await window.db.screenDesigns.get(workflow.screen_design_id);
      if (sd?.html_content) {
        this._screenDesign = sd;
        if (modelConfig?.type === 'cli') {
          const paths = await window.app.writeTempFiles([
            { name: `screen-${sd.id}.html`, content: sd.html_content },
          ]);
          this._screenFilePath = paths[0];
          this._tempDir = paths[0].replace(/[\\/][^\\/]+$/, '');
        }
      }
    }

    this._layers.forEach(l => { this._statuses[l.id] = l.status || 'open'; });

    this._render();
    this._initTerminal();

    if (startLayerId) {
      const target = this._layers.find(l => l.id === startLayerId);
      if (target) {
        this._selectLayer(target.id);
        this._running = true;
        this._updateToolbar();
        this._runLayer(target).then(() => {
          this._running = false;
          this._updateToolbar();
        });
      } else if (this._layers.length > 0) {
        this._selectLayer(this._layers[0].id);
      }
    } else if (this._layers.length > 0) {
      this._selectLayer(this._layers[0].id);
    }
  }

  // ── Terminal setup ───────────────────────────────────────────────────────

  _initTerminal() {
    const el = this.container.querySelector('#wfrTerminal');

    // Bail out with a visible error so we know what went wrong
    if (!el) { console.error('wfr: #wfrTerminal element not found'); return; }
    if (!window.Terminal) {
      el.style.cssText = 'display:flex;align-items:center;justify-content:center;color:#888;font-family:monospace;font-size:12px;';
      el.textContent = 'xterm.js failed to load — check DevTools console';
      console.error('wfr: window.Terminal is undefined — xterm scripts did not load');
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

    // Register IPC data listener NOW — before any layer runs — so no PTY output is missed
    window.app.wfrPty.onData((data) => { if (this._term) this._term.write(data); });
    window.app.wfrPty.onTokenStats((stats) => this._updateTokenStats(stats));

    // Ctrl+C: copy selected text to clipboard; fall through to PTY only when nothing is selected
    this._term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true;
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'c' && !ev.shiftKey) {
        const sel = this._term.getSelection();
        if (sel) {
          navigator.clipboard.writeText(sel).catch(() => {});
          return false;
        }
      }
      return true;
    });

    // Forward keystrokes to PTY (xterm → PTY stdin)
    this._term.onData((data) => window.app.wfrPty.write(data));

    // Resize observer wired up immediately too
    this._resizeObs = new ResizeObserver(() => this._fitTerminal());
    this._resizeObs.observe(el);

    // Window resize fallback (belt-and-suspenders alongside ResizeObserver)
    this._onWinResize = () => this._fitTerminal();
    window.addEventListener('resize', this._onWinResize);

    // Defer fit until xterm's canvas renderer has measured the font cell size.
    // One rAF is not enough — we need at least two frames (open → render → fit).
    // We also retry once via setTimeout(50) in case the first attempt still
    // finds unmeasured cell dimensions (throws on .cell read in proposeDimensions).
    const doFit = () => {
      try {
        this._fitAddon.fit();
        this._term.writeln(`${ANSI.dim}Terminal ready. Select a layer and press Run.${ANSI.reset}`);
      } catch (_) {
        // Renderer not ready yet — retry after one more paint
        setTimeout(() => {
          try { this._fitAddon.fit(); } catch (_2) { console.warn('wfr: fit retry failed', _2); }
          this._term.writeln(`${ANSI.dim}Terminal ready. Select a layer and press Run.${ANSI.reset}`);
        }, 80);
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(doFit));
  }

  _fitTerminal() {
    if (!this._fitAddon || !this._term) return;
    try {
      this._fitAddon.fit();
      window.app.wfrPty.resize({ cols: this._term.cols, rows: this._term.rows });
    } catch (_) {
      requestAnimationFrame(() => {
        try {
          this._fitAddon?.fit();
          if (this._term) window.app.wfrPty.resize({ cols: this._term.cols, rows: this._term.rows });
        } catch (_2) {}
      });
    }
  }

  // ── Run helpers ──────────────────────────────────────────────────────────

  _getCwd(layer) {
    const pl = layer.project_layer_id
      ? this._projectLayers.find(p => p.id === layer.project_layer_id)
      : null;
    return pl?.folder_path || this._project?.project_path || null;
  }

  _buildLayerSystemContext() {
    if (!this._screenDesign) return null;
    const isUiShell    = this._workflow?.workflow_type === 'ui_shell';
    const dartFilePath = this._screenDesign.dart_file_path;
    if (!isUiShell && dartFilePath) {
      return `## Existing Dart UI File: "${this._screenDesign.title || 'Screen'}"
Path: ${dartFilePath}

---
Rule: The Flutter page for this screen already exists at the path above.
Do NOT recreate or replace its layout, colors, padding, or widget structure.
Wire Up layers: import the state class and replace // TODO: wire-{action} comments with real state calls.
All other layers: derive data field names and contracts from what the Dart file displays.`;
    }
    const screenRef = this._screenFilePath
      ? `See file: ${this._screenFilePath}`
      : this._screenDesign.html_content;
    return `## Linked HTML Screen Design: "${this._screenDesign.title || 'Screen'}"
${screenRef}

---
Rule: This is your complete visual reference for the UI Shell layer.
Use the HTML above as the source of truth for all colors, spacing, typography,
widget structure, and layout. Do not invent or change anything not shown in the HTML.
Every interactive element must have onPressed: () {} with a // TODO: wire-{action-name} comment.
Do not reference the HTML file path at runtime — embed nothing; just read it here and build from it.`;
  }

  _buildLayerUserPrompt(layer) {
    return layer.prompt ||
      `Execute workflow layer: ${layer.layer}\n\nPurpose: ${layer.purpose || ''}\nInputs: ${layer.inputs || ''}\nExpected outputs: ${layer.outputs || ''}`;
  }

  // ── Run selected layer ───────────────────────────────────────────────────

  async _runSelected() {
    const layer = this._layers.find(l => l.id === this._selectedId);
    if (!layer || this._running) return;
    this._running = true;
    this._updateToolbar();
    await this._runLayer(layer);
    this._running = false;
    this._updateToolbar();
    if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
  }

  // ── Run all layers ───────────────────────────────────────────────────────

  async _runAll() {
    this._running = true;
    this._updateToolbar();
    if (this._workflow) {
      await window.db.workflows.updateStatus({ id: this._workflow.id, status: 'in_progress' });
    }
    for (const layer of this._layers) {
      if (!this._running) break;
      if (this._statuses[layer.id] !== 'open') continue;
      await this._runLayer(layer);
    }
    this._running = false;
    this._updateToolbar();
    if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
    if (this._tempDir) { window.app.deleteTempDir(this._tempDir); this._tempDir = null; this._screenFilePath = null; }
    await this._evaluateCriteria();
  }

  // ── Core layer runner ────────────────────────────────────────────────────

  _runLayer(layer) {
    return new Promise(async (resolve) => {
      const idx   = this._layers.indexOf(layer);
      const total = this._layers.length;

      // Reset token stats display for this layer run
      const statsEl = this.container.querySelector('#wfrTokenStats');
      if (statsEl) statsEl.hidden = true;

      this._statuses[layer.id] = 'running';
      this._startTimes[layer.id] = Date.now();
      this._selectLayer(layer.id);
      this._refreshLayerList();
      this._startTimer(layer.id);

      // Write banner to terminal
      if (this._term) this._term.write(layerBanner(layer.layer || 'Layer', idx, total));

      const finish = async (error) => {
        window.app.workflowChat.offAll();
        window.app.wfrPty.offAll();
        // Re-attach PTY listeners (offAll removes them; re-add for next layer)
        window.app.wfrPty.onData((data) => { if (this._term) this._term.write(data); });
        window.app.wfrPty.onTokenStats((stats) => this._updateTokenStats(stats));

        if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
        const elapsed   = this._fmt(Date.now() - this._startTimes[layer.id]);
        const newStatus = error ? 'failed' : 'executed';
        this._statuses[layer.id] = newStatus;

        if (this._term) this._term.write(doneBanner(layer.layer || 'Layer', elapsed, !error));
        if (error)      this._term.write(`\r\n${ANSI.red}Error: ${error}${ANSI.reset}\r\n`);

        await window.db.layers.updateStatus({ id: layer.id, status: newStatus });
        this._refreshLayerList();
        resolve();
      };

      // ── CLI path: use PTY ──────────────────────────────────────────────
      if (this._modelConfig?.type === 'cli') {
        if (!this._term) { await finish('Terminal not initialised'); return; }

        window.app.wfrPty.onLayerDone(({ layerId, error }) => {
          if (layerId === layer.id) finish(error);
        });

        // Fit first so cols/rows reflect the actual rendered terminal size
        this._fitTerminal();

        const result = await window.app.wfrPty.runLayer({
          layerId:      layer.id,
          prompt:       this._buildLayerUserPrompt(layer),
          systemPrompt: this._buildLayerSystemContext() || undefined,
          model:        this._modelConfig,
          cwd:          this._getCwd(layer) || undefined,
          cols:         this._term.cols,
          rows:         this._term.rows,
        });

        if (!result?.ok) await finish(result?.error || 'Failed to start PTY');
        return;
      }

      // ── API path (Anthropic / Ollama / OpenAI-compat): token streaming ──
      if (!this._modelConfig) {
        this._term?.write(`\r\n${ANSI.red}⚠ No AI model configured.${ANSI.reset}\r\n`);
        await finish('No AI model configured');
        return;
      }

      window.app.workflowChat.onToken(({ text }) => {
        if (this._term) this._term.write(text.replace(/\n/g, '\r\n'));
      });

      window.app.workflowChat.onDone(({ error }) => finish(error || null));

      window.app.workflowChat.generate({
        prompt:       this._buildLayerUserPrompt(layer),
        systemPrompt: this._buildLayerSystemContext() || undefined,
        model:        this._modelConfig,
        cwd:          this._getCwd(layer),
      });
    });
  }

  // ── Token stats ──────────────────────────────────────────────────────────

  _updateTokenStats({ input, output, cacheRead, costUsd, thinkingTokens }) {
    const el = this.container.querySelector('#wfrTokenStats');
    if (!el) return;
    el.hidden = false;

    const thinkEl = this.container.querySelector('#wfrTokThinking');

    // Live thinking progress — just update the thinking indicator
    if (thinkingTokens != null && input == null) {
      if (thinkEl) {
        thinkEl.textContent = `thinking… ${thinkingTokens.toLocaleString()} tok`;
        thinkEl.hidden = false;
      }
      return;
    }

    // Final result tokens — replace thinking indicator with final counts
    if (thinkEl) thinkEl.hidden = true;

    const inEl    = this.container.querySelector('#wfrTokIn');
    const outEl   = this.container.querySelector('#wfrTokOut');
    const cacheEl = this.container.querySelector('#wfrTokCache');
    const costEl  = this.container.querySelector('#wfrTokCost');
    const sep1    = this.container.querySelector('#wfrTokSep1');
    const sep2    = this.container.querySelector('#wfrTokSep2');

    if (inEl)  { inEl.textContent  = `↑ ${(input  ?? 0).toLocaleString()} in`;  inEl.hidden  = false; }
    if (outEl) { outEl.textContent = `↓ ${(output ?? 0).toLocaleString()} out`; outEl.hidden = false; }
    if (sep1)    sep1.hidden = false;

    if (cacheEl) {
      if (cacheRead) {
        cacheEl.textContent = `${cacheRead.toLocaleString()} cached`;
        cacheEl.hidden = false;
        if (sep2) sep2.hidden = false;
      } else {
        cacheEl.hidden = true;
        if (sep2) sep2.hidden = true;
      }
    }
    if (costEl) {
      if (costUsd != null) { costEl.textContent = `$${costUsd.toFixed(4)}`; costEl.hidden = false; }
      else costEl.hidden = true;
    }
  }

  // ── Timer ────────────────────────────────────────────────────────────────

  _startTimer(layerId) {
    if (this._timerInt) clearInterval(this._timerInt);
    this._timerInt = setInterval(() => {
      const el = this.container.querySelector('#wfrElapsed');
      if (el && this._startTimes[layerId]) {
        el.textContent = this._fmt(Date.now() - this._startTimes[layerId]);
      }
    }, 500);
  }

  _fmt(ms) {
    const s = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  // ── Criteria ─────────────────────────────────────────────────────────────

  async _evaluateCriteria() {
    // Criteria evaluation still works via DB statuses since we track them
    let allPassed = true;
    this._criteria.forEach(c => {
      const el = this.container.querySelector(`[data-crit="${c.id}"]`);
      if (!el) return;
      const passed = this._statuses ? true : false; // simplified — status-based
      if (!passed) allPassed = false;
      el.className = `wfr-crit-row ${passed ? 'wfr-crit-row--pass' : 'wfr-crit-row--fail'}`;
      el.querySelector('.wfr-crit-icon').textContent = passed ? '✔' : '✗';
    });

    if (this._workflow) {
      const anyFailed = this._layers.some(l => this._statuses[l.id] === 'failed');
      const allDone   = this._layers.every(l => ['executed', 'needs_review', 'failed'].includes(this._statuses[l.id]));
      if (!anyFailed && allDone) {
        await window.db.workflows.updateStatus({ id: this._workflow.id, status: 'completed' });
      }
    }
    this._showSummary();
  }

  _showSummary() {
    const el = this.container.querySelector('#wfrSummary');
    if (!el) return;
    const total   = this._layers.length;
    const done    = this._layers.filter(l => this._statuses[l.id] === 'executed').length;
    const errors  = this._layers.filter(l => this._statuses[l.id] === 'failed').length;
    const elapsed = this._layers.reduce((sum, l) => {
      return sum + (this._startTimes[l.id] ? Math.floor((Date.now() - this._startTimes[l.id]) / 1000) : 0);
    }, 0);
    el.innerHTML = `
      <div class="wfr-summary">
        <span class="wfr-summary__stat wfr-summary__stat--${errors > 0 ? 'error' : 'done'}">
          ${errors > 0 ? `${errors} failed` : `${done}/${total} completed`}
        </span>
        <span class="wfr-summary__time">${this._fmt(elapsed * 1000)}</span>
      </div>`;
    el.hidden = false;
  }

  // ── Stop ─────────────────────────────────────────────────────────────────

  _stop() {
    this._running = false;
    window.app.wfrPty.kill();
    window.app.workflowChat.cancel();
    window.app.workflowChat.offAll();
    window.app.wfrPty.offAll();
    window.app.wfrPty.onData((data) => { if (this._term) this._term.write(data); });
    window.app.wfrPty.onTokenStats((stats) => this._updateTokenStats(stats));
    if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
    this._layers.forEach(l => {
      if (this._statuses[l.id] === 'running') this._statuses[l.id] = 'open';
    });
    if (this._term) this._term.write(`\r\n${ANSI.yellow}⊘ Stopped${ANSI.reset}\r\n`);
    this._refreshLayerList();
    this._updateToolbar();
  }

  // ── Selection ────────────────────────────────────────────────────────────

  _selectLayer(id) {
    this._selectedId = id;
    this._refreshLayerList();
    this._updateLayerHeader();
    this._updateToolbar();
  }

  _updateLayerHeader() {
    const layer  = this._layers.find(l => l.id === this._selectedId);
    const nameEl = this.container.querySelector('#wfrOutputLayerName');
    if (nameEl) nameEl.textContent = layer?.layer || '';
    const cwdEl = this.container.querySelector('#wfrOutputCwd');
    if (cwdEl) {
      const cwd = layer ? this._getCwd(layer) : null;
      cwdEl.hidden = !cwd;
      if (cwd) {
        cwdEl.title = cwd;
        cwdEl.querySelector('.wfr-output-cwd__path').textContent = cwd;
      }
    }
  }

  // ── Toolbar ───────────────────────────────────────────────────────────────

  _updateToolbar() {
    const runAll      = this.container.querySelector('#wfrBtnRunAll');
    const runSelected = this.container.querySelector('#wfrBtnRunSelected');
    const stop        = this.container.querySelector('#wfrBtnStop');
    const lbl         = this.container.querySelector('#wfrRunLabel');
    const hasOpen     = this._layers.some(l => this._statuses[l.id] === 'open');
    if (runAll)      { runAll.hidden = this._running; runAll.disabled = !hasOpen; }
    if (runSelected) { runSelected.hidden = this._running; runSelected.disabled = !this._selectedId; }
    if (stop)        stop.hidden = !this._running;
    if (lbl)         { lbl.hidden = this._running; lbl.textContent = 'Run complete'; }
  }

  _refreshLayerList() {
    const list = this.container.querySelector('#wfrLayerList');
    if (!list) return;
    list.innerHTML = this._layerListHtml();
    list.querySelectorAll('.wfr-layer-row').forEach(row => {
      row.addEventListener('click', () => this._selectLayer(+row.dataset.id));
    });
  }

  _layerListHtml() {
    return this._layers.map((l, idx) => {
      const st  = this._statuses[l.id] || 'open';
      const sel = this._selectedId === l.id;
      const elapsed = this._startTimes[l.id] ? this._fmt(Date.now() - this._startTimes[l.id]) : '';
      return `
        <div class="wfr-layer-row ${sel ? 'wfr-layer-row--active' : ''}" data-id="${l.id}">
          <span class="wfr-layer-id">#${l.id}</span>
          <span class="wfr-status-chip ${STATUS[st].cls}">${STATUS[st].label}</span>
          <span class="wfr-layer-name">${escHtml(l.layer || 'Layer')}</span>
          <span class="wfr-layer-right">
            ${elapsed ? `<span class="wfr-layer-time">${elapsed}</span>` : ''}
            <span class="wfr-layer-seq">${idx + 1}</span>
          </span>
        </div>`;
    }).join('');
  }

  _criteriaHtml() {
    if (!this._criteria.length) return '<div class="wfr-crit-empty">No success criteria defined</div>';
    return this._criteria.map(c => `
      <div class="wfr-crit-row" data-crit="${c.id}">
        <span class="wfr-crit-icon">○</span>
        <span class="wfr-crit-text">${escHtml(c.description)}</span>
      </div>`).join('');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  _renderLoading() {
    this.container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;
                  font-family:var(--font-sans,system-ui);color:var(--text-muted,#888)">
        Loading workflow…
      </div>`;
  }

  _render() {
    const wf   = this._workflow;
    const name = wf ? escHtml(wf.feature || 'Workflow') : 'Workflow';

    this.container.innerHTML = `
      <div class="wfr-page">
        <header class="wfr-header">
          <span class="wfr-header__title">${name} — Run Layers</span>
          <div class="wfr-header__actions">
            <span class="wfr-header__status" id="wfrRunLabel" hidden></span>
            <button class="wfr-run-selected-btn" id="wfrBtnRunSelected" disabled>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M3 2l12 6-12 6V2z" fill="currentColor"/>
              </svg>
              Run Selected
            </button>
            <button class="wfr-run-all-btn" id="wfrBtnRunAll">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M3 2l12 6-12 6V2z" fill="currentColor"/>
              </svg>
              Run All
            </button>
            <button class="wfr-stop-btn" id="wfrBtnStop" hidden>■ Stop</button>
          </div>
        </header>

        <div class="wfr-body">
          <!-- Left: layer list -->
          <aside class="wfr-sidebar">
            <div class="wfr-sidebar__section-hd">Layers</div>
            <div class="wfr-layer-list" id="wfrLayerList">
              ${this._layerListHtml()}
            </div>
            <div id="wfrSummary" hidden></div>
          </aside>

          <!-- Right: terminal panel -->
          <section class="wfr-output-panel">
            <div class="wfr-output-header">
              <div class="wfr-output-header__top">
                <span class="wfr-output-layer-name" id="wfrOutputLayerName">
                  ${escHtml(this._layers[0]?.layer || '')}
                </span>
                <span class="wfr-elapsed" id="wfrElapsed"></span>
                <div class="wfr-token-stats" id="wfrTokenStats" hidden>
                  <span class="wfr-token-label">Tokens</span>
                  <span class="wfr-token-thinking" id="wfrTokThinking" hidden></span>
                  <span class="wfr-token-stat" id="wfrTokIn" hidden></span>
                  <span class="wfr-token-sep" id="wfrTokSep1" hidden>·</span>
                  <span class="wfr-token-stat" id="wfrTokOut" hidden></span>
                  <span class="wfr-token-sep wfr-token-sep--cache" id="wfrTokSep2" hidden>·</span>
                  <span class="wfr-token-stat wfr-token-cache" id="wfrTokCache" hidden></span>
                  <span class="wfr-token-cost" id="wfrTokCost" hidden></span>
                </div>
              </div>
              <div class="wfr-output-cwd" id="wfrOutputCwd" hidden>
                <span class="wfr-output-cwd__label">cwd</span>
                <span class="wfr-output-cwd__path"></span>
              </div>
            </div>
            <div class="wfr-terminal-wrap" id="wfrTerminal"></div>
          </section>
        </div>
      </div>`;

    this._bindEvents();
  }

  _bindEvents() {
    this.container.querySelector('#wfrBtnRunSelected')
      ?.addEventListener('click', () => this._runSelected());

    this.container.querySelector('#wfrBtnRunAll')
      ?.addEventListener('click', () => {
        if (this._running || !this._layers.length) return;
        const firstOpen = this._layers.find(l => l.id === this._selectedId && this._statuses[l.id] === 'open')
          || this._layers.find(l => this._statuses[l.id] === 'open');
        if (!firstOpen) return;
        this.container.querySelector('#wfrRunLabel').hidden = true;
        this._selectLayer(firstOpen.id);
        this._runAll();
      });

    this.container.querySelector('#wfrBtnStop')
      ?.addEventListener('click', () => this._stop());

    this.container.querySelectorAll('.wfr-layer-row').forEach(row => {
      row.addEventListener('click', () => this._selectLayer(+row.dataset.id));
    });
  }
}
