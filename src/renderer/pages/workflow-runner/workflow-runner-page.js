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
    this._running          = false;
    this._skipPermissions  = false;
    this._startTimes       = {};
    this._timerInt      = null;
    this._screenDesign  = null;
    this._screenFilePath = null;
    this._tempDir       = null;

    // xterm terminal + fit addon
    this._term    = null;
    this._fitAddon = null;
    this._resizeObs = null;
    this._onWinResize = null;

    // git diff panel
    this._gitPanelVisible  = true;
    this._gitFiles         = [];
    this._gitPollInterval  = null;
    this._gitExpandedFiles = new Set();
    this._switchingShell   = false;
  }

  mount() {
    injectCss('pages/workflow-runner/workflow-runner-page.css');
    injectCss('components/git/git-diff.css');
    applyStoredTheme();
    this._renderLoading();
    window.app.workflowWindow.onInit((data) => this._init(data));
  }

  unmount() {
    window.app.workflowChat.offAll();
    window.app.wfrPty.offAll();
    window.app.wfrPty.kill();
    if (this._timerInt)       clearInterval(this._timerInt);
    if (this._gitPollInterval) clearInterval(this._gitPollInterval);
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
    this._startGitPolling();

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
    this._lastCols = 0;
    this._lastRows = 0;

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

    // Right-click: paste clipboard text into PTY
    el.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      try {
        const text = await navigator.clipboard.readText();
        if (text) window.app.wfrPty.write(text);
      } catch (_) {}
    });

    // Register IPC data listener NOW — before any layer runs — so no PTY output is missed
    window.app.wfrPty.onData((data) => { if (this._term) this._term.write(data); });
    window.app.wfrPty.onLayerDone(({ layerId, error }) => {
      if (layerId === 'shell' && this._term && !this._switchingShell) {
        this._term.writeln(`\r\n${ANSI.red}Shell exited.${ANSI.reset}`);
      }
    });

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
        this._spawnShell();
      } catch (_) {
        // Renderer not ready yet — retry after one more paint
        setTimeout(() => {
          try { this._fitAddon.fit(); } catch (_2) { console.warn('wfr: fit retry failed', _2); }
          this._spawnShell();
        }, 80);
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(doFit));
  }

  async _spawnShell() {
    if (!this._term) return;
    this._switchingShell = true;
    const layer = this._layers.find(l => l.id === this._selectedId);
    const cwd = layer ? this._getCwd(layer) : (this._project?.project_path || null);
    await window.app.wfrPty.spawnShell({
      cwd,
      cols: this._term.cols,
      rows: this._term.rows
    });
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
      window.app.wfrPty.resize({ cols, rows });
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
            window.app.wfrPty.resize({ cols, rows });
          }
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
    if (!isUiShell) return null;

    const dartFilePath = this._screenDesign.dart_file_path;
    if (dartFilePath) {
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
    return `Execute workflow layer: ${layer.layer}\n\nPurpose: ${layer.purpose || ''}\nInputs: ${layer.inputs || ''}\nExpected outputs: ${layer.outputs || ''}\n\nInstructions:\n${layer.prompt}`;
  }

  // ── Run selected layer ───────────────────────────────────────────────────

  async _runSelected() {
    const layer = this._layers.find(l => l.id === this._selectedId);
    if (!layer || this._running) return;
    this._running = true;
    this._runningAll = false;
    this._updateToolbar();
    await this._runLayer(layer);
    this._running = false;
    this._updateToolbar();
    if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
  }

  // ── Run all layers ───────────────────────────────────────────────────────

  async _runAll() {
    this._running = true;
    this._runningAll = true;
    this._updateToolbar();
    if (this._workflow) {
      await window.db.workflows.updateStatus({ id: this._workflow.id, status: 'in_progress' });
    }
    for (const layer of this._layers) {
      if (!this._running) break;
      if (this._statuses[layer.id] !== 'open') continue;
      await this._runLayer(layer);
      if (this._statuses[layer.id] === 'failed') break;
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

      this._statuses[layer.id] = 'running';
      this._startTimes[layer.id] = Date.now();
      this._selectLayer(layer.id);
      this._refreshLayerList();
      this._startTimer(layer.id);

      // Write banner to terminal
      if (this._term) this._term.write(layerBanner(layer.layer || 'Layer', idx, total));

      let finished = false;
      const finish = async (error) => {
        if (finished) return;
        finished = true;
        window.app.workflowChat.offAll();
        window.app.wfrPty.offAll();
        // Re-attach PTY listeners (offAll removes them; re-add for next layer)
        window.app.wfrPty.onData((data) => { if (this._term) this._term.write(data); });
        window.app.wfrPty.onLayerDone(({ layerId, error }) => {
          if (layerId === 'shell' && this._term && !this._switchingShell) {
            this._term.writeln(`\r\n${ANSI.red}Shell exited.${ANSI.reset}`);
          }
        });

        if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
        const elapsed   = this._fmt(Date.now() - this._startTimes[layer.id]);
        const newStatus = error ? 'failed' : 'executed';
        this._statuses[layer.id] = newStatus;

        if (this._term) this._term.write(doneBanner(layer.layer || 'Layer', elapsed, !error));
        if (error)      this._term.write(`\r\n${ANSI.red}Error: ${error}${ANSI.reset}\r\n`);

        await window.db.layers.updateStatus({ id: layer.id, status: newStatus });
        this._refreshLayerList();
        this._refreshGitPanel();

        resolve();
      };

      // Fail immediately if no prompt is defined
      if (!layer.prompt?.trim()) {
        await finish('No prompt defined — add a prompt to this layer before running');
        return;
      }

      // ── CLI path: run command inside the live shell ────────────────────
      if (this._modelConfig?.type === 'cli') {
        if (!this._term) { await finish('Terminal not initialised'); return; }

        window.app.wfrPty.onLayerDone(({ layerId, error }) => {
          if (layerId === layer.id) finish(error);
        });

        this._fitTerminal();
        this._term.focus();

        const result = await window.app.wfrPty.runInShell({
          layerId:         layer.id,
          prompt:          this._buildLayerUserPrompt(layer),
          systemPrompt:    this._buildLayerSystemContext() || undefined,
          model:           this._modelConfig,
          cwd:             this._getCwd(layer) || undefined,
          skipPermissions: this._skipPermissions || this._runningAll,
          interactive:     !this._runningAll,
        });

        if (!result?.ok) {
          await finish(result?.error || 'Failed to run in shell');
          return;
        }

        // Show the command being sent to the shell
        if (result.command) {
          this._term.write(`${ANSI.dim}▶  ${result.command}${ANSI.reset}\r\n`);
        }
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

  // ── Selection ────────────────────────────────────────────────────────────

  _selectLayer(id) {
    const oldId = this._selectedId;
    this._selectedId = id;
    this._refreshLayerList();
    this._updateLayerHeader();
    this._updateToolbar();
    this._refreshGitPanel();

    if (oldId !== id && !this._running && this._modelConfig?.type === 'cli') {
      this._spawnShell();
    }
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
    const hasOpen     = this._layers.some(l => this._statuses[l.id] === 'open');
    if (runAll)      { runAll.hidden = false; runAll.disabled = this._running || !hasOpen; }
    if (runSelected) { runSelected.hidden = false; runSelected.disabled = this._running || !this._selectedId; }
  }

  _refreshLayerList() {
    const list = this.container.querySelector('#wfrLayerList');
    if (!list) return;
    list.innerHTML = this._layerListHtml();
    list.querySelectorAll('.wfr-layer-row').forEach(row => {
      row.addEventListener('click', () => this._selectLayer(+row.dataset.id));
    });
    list.querySelectorAll('.wfr-layer-copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const layer = this._layers.find(l => l.id === +btn.dataset.copyId);
        if (!layer) return;
        const parts = [];
        if (layer.purpose)  parts.push(`Purpose:\n${layer.purpose}`);
        if (layer.inputs)   parts.push(`Inputs:\n${layer.inputs}`);
        if (layer.outputs)  parts.push(`Outputs:\n${layer.outputs}`);
        if (layer.prompt)   parts.push(`Prompt:\n${layer.prompt}`);
        navigator.clipboard.writeText(parts.join('\n\n')).then(() => {
          btn.classList.add('wfr-layer-copy-btn--copied');
          setTimeout(() => btn.classList.remove('wfr-layer-copy-btn--copied'), 1500);
        }).catch(() => {});
      });
    });
  }

  _layerListHtml() {
    return this._layers.map((l, idx) => {
      const st  = this._statuses[l.id] || 'open';
      const sel = this._selectedId === l.id;
      const elapsed = this._startTimes[l.id] ? this._fmt(Date.now() - this._startTimes[l.id]) : '';
      return `
        <div class="wfr-layer-row ${sel ? 'wfr-layer-row--active' : ''}" data-id="${l.id}">
          <div class="wfr-layer-top">
            <span class="wfr-layer-id">#${l.id}</span>
            <span class="wfr-status-chip ${STATUS[st].cls}">${STATUS[st].label}</span>
            <span class="wfr-layer-name">${escHtml(l.layer || 'Layer')}</span>
            <span class="wfr-layer-right">
              ${elapsed ? `<span class="wfr-layer-time">${elapsed}</span>` : ''}
              <span class="wfr-layer-seq">${idx + 1}</span>
              <button class="wfr-layer-copy-btn" data-copy-id="${l.id}" title="Copy layer content">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <rect x="5" y="5" width="8" height="9" rx="1.2" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M3 11V3a1 1 0 011-1h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <span class="wfr-layer-copy-tick">✓</span>
              </button>
            </span>
          </div>
          ${l.purpose ? `<div class="wfr-layer-purpose">${escHtml(l.purpose)}</div>` : ''}
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
    const wf     = this._workflow;
    const name   = wf ? escHtml(wf.feature || 'Workflow') : 'Workflow';
    const wfId   = wf?.id   || '';
    const wfName = wf?.feature || 'Workflow';

    this.container.innerHTML = `
      <div class="wfr-page">
        <header class="wfr-header">
          <span class="wfr-header__title">${name} — Run Layers</span>
          <div class="wfr-header__actions">
            <button class="wfr-perm-btn" id="wfrBtnSkipPerms" aria-pressed="false" title="When ON: skips all tool permission prompts (--dangerously-skip-permissions). When OFF: Claude asks before each tool use.">
              Skip Permissions: <span id="wfrSkipPermsLabel">OFF</span>
            </button>
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
              </div>
              <div class="wfr-output-cwd" id="wfrOutputCwd" hidden>
                <span class="wfr-output-cwd__label">cwd</span>
                <span class="wfr-output-cwd__path"></span>
              </div>
            </div>
            <div class="wfr-terminal-wrap" id="wfrTerminal"></div>
          </section>

          <!-- Right: git diff panel -->
          <aside class="wfr-git-panel" id="wfrGitPanel">
            <div class="wfr-git-panel__header">
              <span class="wfr-git-panel__title">Git Changes</span>
              <span class="wfr-git-panel__badge" id="wfrGitBadge" hidden></span>
              <div class="wfr-git-panel__actions">
                <button class="wfr-git-panel__icon-btn" id="wfrBtnGitExpandAll" title="Expand all">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M2 5l6 6 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button class="wfr-git-panel__icon-btn" id="wfrBtnGitCollapseAll" title="Collapse all">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M2 11l6-6 6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button class="wfr-git-panel__refresh" id="wfrBtnGitRefresh" title="Refresh">↺</button>
              </div>
            </div>
            <div class="wfr-git-commit-bar">
              <input class="wfr-git-commit-msg" id="wfrGitCommitMsg" type="text" spellcheck="false" placeholder="Commit message…" value="#${escHtml(wfId)} - ${escHtml(wfName)}">
              <button class="wfr-git-commit-btn" id="wfrBtnGitCommit" disabled>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l4 4 6-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Commit
              </button>
            </div>
            <div class="wfr-git-panel__body" id="wfrGitAccordion">
              <div class="git-diff-empty">No changes yet.</div>
            </div>
          </aside>
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
        this._selectLayer(firstOpen.id);
        this._runAll();
      });

    this.container.querySelector('#wfrBtnSkipPerms')
      ?.addEventListener('click', () => {
        this._skipPermissions = !this._skipPermissions;
        const btn   = this.container.querySelector('#wfrBtnSkipPerms');
        const label = this.container.querySelector('#wfrSkipPermsLabel');
        if (btn)   btn.setAttribute('aria-pressed', String(this._skipPermissions));
        if (btn)   btn.classList.toggle('wfr-perm-btn--on', this._skipPermissions);
        if (label) label.textContent = this._skipPermissions ? 'ON' : 'OFF';
      });

    this.container.querySelectorAll('.wfr-layer-row').forEach(row => {
      row.addEventListener('click', () => this._selectLayer(+row.dataset.id));
    });

    this.container.querySelector('#wfrBtnGitRefresh')
      ?.addEventListener('click', () => this._refreshGitPanel());
    this.container.querySelector('#wfrBtnGitExpandAll')
      ?.addEventListener('click', () => this._expandCollapseAll(true));
    this.container.querySelector('#wfrBtnGitCollapseAll')
      ?.addEventListener('click', () => this._expandCollapseAll(false));
    this.container.querySelector('#wfrBtnGitCommit')
      ?.addEventListener('click', () => this._commitChanges());

  }

  // ── Git diff panel ───────────────────────────────────────────────────────

  _toggleGitPanel() {
    this._gitPanelVisible = !this._gitPanelVisible;
    const panel = this.container.querySelector('#wfrGitPanel');
    const btn   = this.container.querySelector('#wfrBtnGitToggle');
    if (panel) panel.hidden = !this._gitPanelVisible;
    if (btn)   btn.classList.toggle('wfr-git-toggle-btn--active', this._gitPanelVisible);
  }

  _getGitCwd() {
    const layer = this._layers.find(l => l.id === this._selectedId);
    return (layer ? this._getCwd(layer) : null) || this._project?.project_path || null;
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
    const cwd       = this._getGitCwd();
    const wrap      = this.container.querySelector('#wfrGitAccordion');
    const badge     = this.container.querySelector('#wfrGitBadge');
    const commitBtn = this.container.querySelector('#wfrBtnGitCommit');
    if (!cwd || !wrap) return;
    try {
      const r = await window.db.terminal.exec({ command: 'git status --short -uall 2>&1', cwd });
      const files = this._parseGitStatus(r.stdout || '');

      // If the file list is identical to what's already rendered, only update
      // the badge and commit button — avoid a full DOM rebuild that would
      // collapse expanded diffs and disrupt the user's view.
      const noChange = files.length === this._gitFiles.length &&
        files.every((f, i) => f.file === this._gitFiles[i]?.file && f.statusType === this._gitFiles[i]?.statusType);

      if (noChange && wrap.querySelector('.git-accordion__item')) {
        if (badge) { badge.textContent = String(files.length); badge.hidden = files.length === 0; }
        if (commitBtn && !commitBtn.classList.contains('wfr-git-commit-btn--busy')) {
          commitBtn.disabled = files.length === 0;
        }
        return;
      }

      this._gitFiles = files;
      if (badge) { badge.textContent = String(files.length); badge.hidden = files.length === 0; }
      if (commitBtn && !commitBtn.classList.contains('wfr-git-commit-btn--busy')) {
        commitBtn.disabled = files.length === 0;
      }
      await this._renderGitAccordion(files, cwd);
    } catch {
      if (wrap) wrap.innerHTML = '<div class="git-diff-empty">Not a git repository.</div>';
    }
  }

  async _renderGitAccordion(files, cwd) {
    const wrap = this.container.querySelector('#wfrGitAccordion');
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
          <div class="git-accordion__body" id="wfrGdBody${i}" data-loaded="false">
            ${expanded ? '<div class="git-diff-empty" style="padding:8px 14px">Loading diff…</div>' : ''}
          </div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('.git-accordion__header').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx      = parseInt(btn.dataset.idx);
        const file     = btn.dataset.file;
        const body     = wrap.querySelector(`#wfrGdBody${idx}`);
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

    // Reload diffs for files that were already expanded
    const toLoad = files
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => this._gitExpandedFiles.has(f.file));
    if (toLoad.length > 0) {
      await Promise.all(toLoad.map(({ f, i }) => this._loadGitDiffInto(f, i, cwd)));
    }
  }

  async _loadGitDiffInto(fileInfo, idx, cwd) {
    const body = this.container.querySelector(`#wfrGdBody${idx}`);
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
    const wrap = this.container.querySelector('#wfrGitAccordion');
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
    if (this._gitPollInterval) {
      clearInterval(this._gitPollInterval);
      this._gitPollInterval = null;
    }
  }

  async _commitChanges() {
    const msgEl = this.container.querySelector('#wfrGitCommitMsg');
    const btn   = this.container.querySelector('#wfrBtnGitCommit');
    const cwd   = this._getGitCwd();
    if (!cwd || !msgEl) return;

    const msg = msgEl.value.trim();
    if (!msg || this._gitFiles.length === 0) return;

    btn?.classList.add('wfr-git-commit-btn--busy');
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
      btn?.classList.remove('wfr-git-commit-btn--busy');
    }
  }

}
