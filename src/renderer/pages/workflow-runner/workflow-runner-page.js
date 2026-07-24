import { escHtml, injectCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelPicker } from '../../components/model-picker/model-picker.js';
import { ProjectSidebar } from '../../components/project-sidebar/project-sidebar.js';
import { Dialog } from '../../components/dialog/dialog.js';

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
  constructor(container, params = null, router = null) {
    this.container      = container;
    this.router         = router;
    this._embedded      = !!router;
    this._initParams    = params;
    this._returnRoute   = 'workflows';
    this._workflow      = null;
    this._project       = null;
    this._projectLayers = [];
    this._layers        = [];
    this._criteria      = [];
    this._modelConfig   = null;
    this._statuses      = {};
    this._selectedId    = null;
    this._running          = false;
    this._skipPermissions  = true;
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

    // Responsive layout
    this._layoutObs  = null;
    this._isWideMode = false;
  }

  mount() {
    injectCss('pages/workflow-runner/workflow-runner-page.css');
    injectCss('components/git/git-diff.css');
    if (this._embedded) injectCss('components/project-sidebar/project-sidebar.css');
    applyStoredTheme();
    this._renderLoading();
    if (this._embedded) {
      this._init(this._initParams);
    } else {
      window.app.workflowWindow.onInit((data) => this._init(data));
    }
  }

  /**
   * Called by the persistent-page host when this route is activated again.
   * Mirrors the pop-out window's behavior: opening the runner for a
   * different workflow re-inits in place; just re-showing the same tab only
   * needs a terminal refit.
   */
  onResume(params) {
    // Defensive: re-inject in case another page's unmount() stripped this
    // shared stylesheet while this tab sat hidden in the background — injectCss
    // is a no-op if the <link> is already present.
    injectCss('components/git/git-diff.css');
    // Reclaim the router's single nav-guard slot — while this tab sat hidden,
    // whatever page was in the foreground may have set (and cleared) its own
    // guard there, leaving ours unset even though a layer may still be running.
    this.router?.setNavigationGuard(() => this._confirmLeaveIfBusy());
    if (params && params.workflowId !== this._workflow?.id) {
      this._init(params);
      return;
    }
    if (this._fitAddon) {
      try { this._fitAddon.fit(); } catch (_) {}
    }
  }

  async _handleClose() {
    if (!(await this._confirmLeaveIfBusy())) return;
    if (this._embedded) {
      this.router?.closePersistentRoute?.('workflow-runner');
      this.router?.navigateTo?.(this._returnRoute, { projectId: this._project?.id });
    } else {
      window.close();
    }
  }

  // Blocks navigation/close while a layer (or Run All) is in execution.
  // Confirming kills the running CLI process and lets the transition proceed.
  async _confirmLeaveIfBusy() {
    if (!this._running) return true;
    const ok = await Dialog.confirm(
      'A layer is still running. Leaving now will stop the current run — it cannot be resumed from where it left off.',
      { title: 'Layer running', confirmText: 'Leave Anyway', danger: true }
    );
    if (ok) {
      window.app.wfrPty.kill();
      this._running = false;
      this._runningAll = false;
      this._updateToolbar();
    }
    return ok;
  }

  unmount() {
    this.router?.clearNavigationGuard();
    this._picker?.unmount();
    window.app.workflowChat.offAll();
    window.app.wfrPty.offAll();
    window.app.wfrPty.kill();
    if (this._timerInt)       clearInterval(this._timerInt);
    if (this._gitPollInterval) clearInterval(this._gitPollInterval);
    if (this._resizeObs)   this._resizeObs.disconnect();
    if (this._onWinResize) window.removeEventListener('resize', this._onWinResize);
    if (this._layoutObs)   { this._layoutObs.disconnect(); this._layoutObs = null; }
    if (this._term) { this._term.dispose(); this._term = null; }
    if (this._tempDir) { window.app.deleteTempDir(this._tempDir); this._tempDir = null; }
  }

  // ── Init ────────────────────────────────────────────────────────────────

  async _init({ projectId, workflowId, modelConfig, startLayerId }) {
    this._modelConfig = modelConfig;
    const [workflow, layers, criteria, project, projectLayers, mapping] = await Promise.all([
      window.db.workflows.get(workflowId),
      window.db.layers.list(workflowId),
      window.db.successCriteria.list(workflowId),
      window.db.projects.get(projectId),
      window.db.projectLayers.list(projectId),
      window.db.modelMapping.get('workflow-runner'),
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

    this._picker = new ModelPicker({
      anchor:    this.container.querySelector('#wfrModelPicker'),
      onSelect:  model => { this._modelConfig = model; },
      initialId: modelConfig?.id ?? mapping?.model_config_id ?? null,
    });
    await this._picker.reload();

    this._initTerminal();
    this._startGitPolling();
    this._initLayoutObserver();

    if (this._embedded) this.router.setNavigationGuard(() => this._confirmLeaveIfBusy());

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

    // Right-click: paste clipboard text into PTY (contextmenu doesn't fire a paste event)
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
    if (this._modelConfig?.type !== 'cli') return; // Only spawn/reuse PTY shell for local CLI models
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
    const isUiShell = this._workflow?.workflow_type === 'ui_shell';

    if (!isUiShell) {
      const dartFilePath = this._screenDesign.dart_file_path;
      if (!dartFilePath) return null;
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
    const ok = await Dialog.confirm(
      'Run All executes every open layer back-to-back in non-interactive mode (cold start, then continued sessions). ' +
      'This can consume noticeably more tokens than running layers one at a time — make sure your 5-hour usage window has enough headroom before continuing.',
      { title: 'Run all layers?', confirmText: 'Run All', cancelText: 'Cancel' }
    );
    if (!ok) return;

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
    this._notifyRunAllDone();
  }

  // Fires a native OS notification so the user knows Run All finished even
  // if the app window is minimized or in the background.
  _notifyRunAllDone() {
    const failed    = this._layers.filter(l => this._statuses[l.id] === 'failed').length;
    const executed  = this._layers.filter(l => this._statuses[l.id] === 'executed').length;
    const wfName    = this._workflow?.feature || 'Workflow';
    const body      = failed > 0
      ? `${executed} layer(s) completed, ${failed} failed.`
      : `All ${executed} layer(s) completed successfully.`;
    window.app.showNotification({
      title: `Run All finished — ${wfName}`,
      body,
    });
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
    // Criteria pass/fail is now a manual, persisted toggle (see _toggleCriterion)
    // — this no longer auto-marks criteria on run completion.
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
    if (nameEl) {
      nameEl.textContent = layer
        ? (layer.purpose ? `${layer.layer} - Purpose: ${layer.purpose}` : layer.layer)
        : '';
      nameEl.title = layer?.purpose ? `${layer.layer} - Purpose: ${layer.purpose}` : '';
    }
    const titleEl = this.container.querySelector('#wfrHeaderTitle');
    if (titleEl) titleEl.textContent = this._headerTitleText();
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
          ${this._layerSecondLine(l)}
        </div>`;
    }).join('');
  }

  _layerSecondLine(l) {
    const purpose = (l.purpose || '').trim();
    const MIN_LEN = 60;
    let text = purpose;
    if (purpose.length < MIN_LEN && l.prompt) {
      const promptText = l.prompt.trim().replace(/\s+/g, ' ');
      if (promptText) {
        const budget = Math.max(140 - purpose.length, 40);
        const snippet = promptText.slice(0, budget);
        const ellipsis = promptText.length > snippet.length ? '…' : '';
        text = purpose ? `${purpose} — ${snippet}${ellipsis}` : `${snippet}${ellipsis}`;
      }
    }
    return text ? `<div class="wfr-layer-purpose">${escHtml(text)}</div>` : '';
  }

  _criteriaHtml() {
    if (!this._criteria.length) return '<div class="wfr-crit-empty">No success criteria defined</div>';
    return this._criteria.map(c => `
      <div class="wfr-crit-row${c.passed ? ' wfr-crit-row--pass' : ''}" data-crit="${c.id}" title="Mark as success">
        <span class="wfr-crit-icon">${c.passed ? '✔' : '○'}</span>
        <span class="wfr-crit-text">${escHtml(c.description)}</span>
      </div>`).join('');
  }

  async _toggleCriterion(id) {
    const c = this._criteria.find(x => x.id === id);
    if (!c) return;
    const passed = c.passed ? 0 : 1;
    await window.db.successCriteria.setPassed({ id, passed });
    c.passed = passed;
    this._refreshCriteriaSection();
  }

  _refreshCriteriaSection() {
    const list = this.container.querySelector('.wfr-criteria-list');
    if (!list) return;
    list.innerHTML = this._criteriaHtml();
    this._bindCriteriaEvents();
  }

  _bindCriteriaEvents() {
    this.container.querySelectorAll('.wfr-crit-row[data-crit]').forEach(row => {
      row.addEventListener('click', () => this._toggleCriterion(+row.dataset.crit));
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  _renderLoading() {
    this.container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;
                  font-family:var(--font-sans,system-ui);color:var(--text-muted,#888)">
        Loading workflow…
      </div>`;
  }

  _renderShellHeader() {
    const name    = this._project?.name || 'Project';
    const initial = name.trim()[0]?.toUpperCase() || '?';
    return `
      <header class="project-home__header">
        <button class="project-home__back" id="wfrBtnBack" aria-label="Back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <div class="project-home__badge">
          <div class="project-home__badge-initial">${escHtml(initial)}</div>
          <span class="project-home__badge-name">${escHtml(name)}</span>
        </div>
        <span class="ph-header-page-chip">Workflow Runner</span>
      </header>`;
  }

  /** Raw (unescaped) text — callers must escHtml() it for innerHTML use. */
  _headerTitleText() {
    const wf    = this._workflow;
    const title = wf?.feature || 'Workflow';
    return `Workflow: ${title}`;
  }

  _render() {
    const wf     = this._workflow;
    const wfId   = wf?.id   || '';
    const wfName = wf?.feature || 'Workflow';

    const closeBtnHtml = this._embedded ? `
          <button class="wfr-back-btn" id="wfrBtnClose" aria-label="Back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>` : `
          <button class="wfr-back-btn" id="wfrBtnClose" aria-label="Close window">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>`;

    const body = `
      <div class="wfr-page">
        <header class="wfr-header">
          ${closeBtnHtml}
          <span class="wfr-header__title" id="wfrHeaderTitle">${escHtml(this._headerTitleText())}</span>
          <div class="wfr-header__actions">
            <button class="wfr-perm-btn wfr-perm-btn--on" id="wfrBtnSkipPerms" aria-pressed="true" title="When ON: skips all tool permission prompts (--dangerously-skip-permissions). When OFF: Claude asks before each tool use.">
              Skip Permissions: <span id="wfrSkipPermsLabel">ON</span>
            </button>
            <div class="project-page__model-group wfr-header__model" style="-webkit-app-region:no-drag;">
              <div id="wfrModelPicker"></div>
            </div>
<button class="wfr-git-toggle-btn${this._gitPanelVisible ? ' wfr-git-toggle-btn--active' : ''}" id="wfrBtnGitToggle" title="Toggle Git Changes">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <circle cx="5" cy="4" r="1.5" stroke="currentColor" stroke-width="1.4"/>
                <circle cx="11" cy="12" r="1.5" stroke="currentColor" stroke-width="1.4"/>
                <circle cx="11" cy="4" r="1.5" stroke="currentColor" stroke-width="1.4"/>
                <path d="M5 5.5v5a1.5 1.5 0 001.5 1.5H11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                <path d="M11 5.5V9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
              Git <span class="wfr-git-badge" id="wfrGitBadge" hidden></span>
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

          <!-- Right: terminal panel + git overlay -->
          <section class="wfr-output-panel">
            <div class="wfr-output-header">
              <div class="wfr-output-header__top">
                <span class="wfr-output-layer-name" id="wfrOutputLayerName">
                  ${escHtml(this._layers[0]?.layer || '')}
                </span>
                <span class="wfr-elapsed" id="wfrElapsed"></span>
                <div class="wfr-output-actions" id="wfrOutputActions">
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
              </div>
              <div class="wfr-output-cwd" id="wfrOutputCwd" hidden>
                <span class="wfr-output-cwd__label">cwd</span>
                <span class="wfr-output-cwd__path"></span>
              </div>
            </div>
            <div class="wfr-terminal-wrap" id="wfrTerminal"></div>

            <!-- Git diff overlay — absolute, slides in from the right -->
            <aside class="wfr-git-panel" id="wfrGitPanel"${this._gitPanelVisible ? '' : ' hidden'}>
              <div class="wfr-git-panel__header">
                <span class="wfr-git-panel__title">Git Changes</span>
                <span class="wfr-git-panel__badge" id="wfrGitPanelBadge" hidden></span>
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
                  <button class="wfr-git-panel__icon-btn" id="wfrBtnGitClose" title="Close">✕</button>
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
              <div class="wfr-git-panel__criteria">
                <div class="wfr-git-panel__criteria-hd">Success Criteria</div>
                <div class="wfr-criteria-list">${this._criteriaHtml()}</div>
              </div>
            </aside>
          </section>
        </div>
      </div>`;

    if (this._embedded) {
      this._sidebar = new ProjectSidebar({ projectId: this._project?.id, router: this.router, activeRoute: 'workflows' });
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
      this.container.querySelector('#wfrBtnBack')
        ?.addEventListener('click', () => this._handleClose());
    } else {
      this.container.innerHTML = body;
    }

    this._bindEvents();
  }

  _bindEvents() {
    this.container.querySelector('#wfrBtnClose')
      ?.addEventListener('click', () => this._handleClose());

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

    this.container.querySelector('#wfrBtnGitToggle')
      ?.addEventListener('click', () => this._toggleGitPanel());

    this.container.querySelector('#wfrBtnGitClose')
      ?.addEventListener('click', () => {
        this._gitPanelVisible = false;
        this.container.querySelector('#wfrGitPanel')?.setAttribute('hidden', '');
        this.container.querySelector('#wfrBtnGitToggle')?.classList.remove('wfr-git-toggle-btn--active');
      });

    this.container.querySelector('#wfrBtnGitRefresh')
      ?.addEventListener('click', () => this._refreshGitPanel());
    this.container.querySelector('#wfrBtnGitExpandAll')
      ?.addEventListener('click', () => this._expandCollapseAll(true));
    this.container.querySelector('#wfrBtnGitCollapseAll')
      ?.addEventListener('click', () => this._expandCollapseAll(false));
    this.container.querySelector('#wfrBtnGitCommit')
      ?.addEventListener('click', () => this._commitChanges());

    this._bindCriteriaEvents();
  }

  // ── Git diff panel ───────────────────────────────────────────────────────

  _toggleGitPanel() {
    this._gitPanelVisible = !this._gitPanelVisible;
    const panel = this.container.querySelector('#wfrGitPanel');
    const btn   = this.container.querySelector('#wfrBtnGitToggle');
    if (panel) panel.toggleAttribute('hidden', !this._gitPanelVisible);
    if (btn)   btn.classList.toggle('wfr-git-toggle-btn--active', this._gitPanelVisible);
    if (this._gitPanelVisible) {
      const wrap = this.container.querySelector('#wfrGitAccordion');
      if (wrap) wrap.innerHTML = '';
      this._refreshGitPanel();
    }
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
    const cwd        = this._getGitCwd();
    const wrap       = this.container.querySelector('#wfrGitAccordion');
    const headerBadge = this.container.querySelector('#wfrGitBadge');
    const panelBadge  = this.container.querySelector('#wfrGitPanelBadge');
    const commitBtn   = this.container.querySelector('#wfrBtnGitCommit');
    if (!cwd || !wrap) return;

    const _updateBadges = (count) => {
      if (headerBadge) { headerBadge.textContent = String(count); headerBadge.hidden = count === 0; }
      if (panelBadge)  { panelBadge.textContent  = String(count); panelBadge.hidden  = count === 0; }
      if (commitBtn && !commitBtn.classList.contains('wfr-git-commit-btn--busy')) {
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

  // ── Responsive layout ────────────────────────────────────────────────

  _initLayoutObserver() {
    const layout = this.container.querySelector('.wfr-body');
    if (!layout) return;
    this._layoutObs = new ResizeObserver(entries => {
      this._applyWidthMode(entries[0].contentRect.width);
    });
    this._layoutObs.observe(layout);
  }

  _applyWidthMode(width) {
    const layout = this.container.querySelector('.wfr-body');
    if (!layout) return;
    const isWide = width >= 1100;
    if (isWide === this._isWideMode) return;
    this._isWideMode = isWide;
    layout.classList.toggle('wfr-body--wide', isWide);
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
