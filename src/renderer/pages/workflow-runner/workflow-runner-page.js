import { escHtml, injectCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';

const STATUS = {
  open:         { label: 'Open',         cls: 'wfr-status--open'    },
  running:      { label: 'Running',      cls: 'wfr-status--running' },
  executed:     { label: 'Executed',     cls: 'wfr-status--done'    },
  failed:       { label: 'Failed',       cls: 'wfr-status--error'   },
  needs_review: { label: 'Needs Review', cls: 'wfr-status--review'  },
};

export class WorkflowRunnerPage {
  constructor(container) {
    this.container    = container;
    this._workflow    = null;
    this._layers      = [];
    this._criteria    = [];
    this._modelConfig = null;
    this._statuses    = {};   // layerId → 'pending'|'running'|'done'|'error'
    this._outputs     = {};   // layerId → string
    this._selectedId  = null;
    this._running     = false;
    this._startTimes  = {};
    this._timerInt    = null;
    this._elapsed     = {};
    this._screenDesign   = null;
    this._screenFilePath = null;
    this._tempDir        = null;
  }

  mount() {
    injectCss('pages/workflow-runner/workflow-runner-page.css');
    applyStoredTheme();
    this._renderLoading();
    window.app.workflowWindow.onInit((data) => this._init(data));
  }

  unmount() {
    window.app.workflowChat.offAll();
    if (this._timerInt) clearInterval(this._timerInt);
    if (this._tempDir) { window.app.deleteTempDir(this._tempDir); this._tempDir = null; }
  }

  async _init({ projectId, workflowId, modelConfig }) {
    this._modelConfig = modelConfig;
    const [workflow, layers, criteria] = await Promise.all([
      window.db.workflows.get(workflowId),
      window.db.layers.list(workflowId),
      window.db.successCriteria.list(workflowId),
    ]);
    this._workflow = workflow;
    this._layers   = (layers || []).slice().sort((a, b) => a.order_num - b.order_num);
    this._criteria = criteria || [];

    // Load linked screen design (used to augment every layer prompt)
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

    this._layers.forEach(l => {
      this._statuses[l.id] = l.status || 'open';
      this._outputs[l.id]  = '';
    });

    this._render();
    if (this._layers.length > 0) {
      this._selectLayer(this._layers[0].id);
    }
  }

  // ----------------------------------------------------------------
  // Run all layers sequentially
  // ----------------------------------------------------------------
  async _runAll() {
    this._running = true;
    this._updateToolbar();

    // Persist workflow as in_progress for the duration of the run
    if (this._workflow) {
      await window.db.workflows.updateStatus({ id: this._workflow.id, status: 'in_progress' });
    }

    for (const layer of this._layers) {
      if (!this._running) break;
      await this._runLayer(layer);
    }

    this._running = false;
    this._updateToolbar();
    if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
    if (this._tempDir) { window.app.deleteTempDir(this._tempDir); this._tempDir = null; this._screenFilePath = null; }
    await this._evaluateCriteria();
  }

  // ----------------------------------------------------------------
  // Build prompt — injects linked screen design for all layers
  // ----------------------------------------------------------------
  _buildLayerPrompt(layer) {
    const base = layer.prompt ||
      `Execute workflow layer: ${layer.layer}\n\nPurpose: ${layer.purpose || ''}\nInputs: ${layer.inputs || ''}\nExpected outputs: ${layer.outputs || ''}`;

    if (!this._screenDesign) return base;

    const screenRef = this._screenFilePath
      ? `See file: ${this._screenFilePath}`
      : this._screenDesign.html_content;

    return `## Linked Screen Design: "${this._screenDesign.title || 'Screen'}"
${screenRef}

---
Rule: This screen is the UI reference for this workflow. Use it to understand the feature's data requirements, user interactions, and visual expectations. For UI layers, match the layout, components, and styles shown. For other layers, derive the data contracts and API shapes from what the screen displays and the interactions it supports.

---

${base}`;
  }

  _runLayer(layer) {
    return new Promise(async (resolve) => {
      this._statuses[layer.id] = 'running';
      this._outputs[layer.id]  = '';
      this._startTimes[layer.id] = Date.now();
      this._selectLayer(layer.id);
      this._refreshLayerList();
      this._startTimer(layer.id);

      const onToken = ({ text }) => {
        this._outputs[layer.id] += text;
        if (this._selectedId === layer.id) this._appendOutput(text);
      };

      const onDone = async ({ raw, error }) => {
        window.app.workflowChat.offAll();
        if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
        const newStatus = error ? 'failed' : 'executed';
        this._statuses[layer.id] = newStatus;
        if (error) this._outputs[layer.id] += `\n\n⚠ ${error}`;
        await window.db.layers.updateStatus({ id: layer.id, status: newStatus });
        this._refreshLayerList();
        this._updateOutputFooter(layer.id);
        resolve();
      };

      window.app.workflowChat.onToken(onToken);
      window.app.workflowChat.onDone(onDone);

      if (!this._modelConfig) {
        this._statuses[layer.id] = 'failed';
        this._outputs[layer.id]  = '⚠ No AI model configured. Set a model in the Workflows page before running.';
        window.app.workflowChat.offAll();
        await window.db.layers.updateStatus({ id: layer.id, status: 'failed' });
        this._refreshLayerList();
        resolve();
        return;
      }

      window.app.workflowChat.generate({
        prompt: this._buildLayerPrompt(layer),
        model:  this._modelConfig,
      });
    });
  }

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

  async _evaluateCriteria() {
    const allOutput = this._layers.map(l => this._outputs[l.id] || '').join('\n');
    let allPassed = true;
    this._criteria.forEach(c => {
      const el = this.container.querySelector(`[data-crit="${c.id}"]`);
      if (!el) return;
      const passed = allOutput.toLowerCase().includes(c.description.toLowerCase().slice(0, 30));
      if (!passed) allPassed = false;
      el.className = `wfr-crit-row ${passed ? 'wfr-crit-row--pass' : 'wfr-crit-row--fail'}`;
      el.querySelector('.wfr-crit-icon').textContent = passed ? '✔' : '✗';
    });

    // Persist final workflow / layer statuses
    if (this._workflow) {
      const anyFailed = this._layers.some(l => this._statuses[l.id] === 'failed');
      const allDone   = this._layers.every(l =>
        ['executed', 'needs_review', 'failed'].includes(this._statuses[l.id])
      );

      if (!anyFailed && allDone && (!this._criteria.length || allPassed)) {
        // All executed and criteria passed (or no criteria) → mark workflow completed
        await window.db.workflows.updateStatus({ id: this._workflow.id, status: 'completed' });
      } else if (this._criteria.length && !allPassed) {
        // Criteria check failed → mark all executed layers as needs_review
        for (const layer of this._layers) {
          if (this._statuses[layer.id] === 'executed') {
            this._statuses[layer.id] = 'needs_review';
            await window.db.layers.updateStatus({ id: layer.id, status: 'needs_review' });
          }
        }
        this._refreshLayerList();
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

  // ----------------------------------------------------------------
  // Selection & output
  // ----------------------------------------------------------------
  _selectLayer(id) {
    this._selectedId = id;
    this._refreshLayerList();
    this._renderOutput();
  }

  _appendOutput(text) {
    const pre = this.container.querySelector('#wfrOutput');
    if (!pre) return;
    pre.textContent += text;
    pre.scrollTop = pre.scrollHeight;
  }

  _renderOutput() {
    const pre = this.container.querySelector('#wfrOutput');
    if (!pre) return;
    const layer = this._layers.find(l => l.id === this._selectedId);
    if (!layer) { pre.textContent = ''; return; }
    pre.textContent = this._outputs[layer.id] || (this._statuses[layer.id] === 'open' ? 'Waiting to run…' : '');
    pre.scrollTop = pre.scrollHeight;
  }

  _updateOutputFooter(layerId) {
    const footer = this.container.querySelector('#wfrOutputFooter');
    if (!footer || this._selectedId !== layerId) return;
    const st = this._statuses[layerId];
    footer.innerHTML = st === 'executed'
      ? `<span class="wfr-footer-done">✔ Executed in ${this._fmt(Date.now() - this._startTimes[layerId])}</span>`
      : `<span class="wfr-footer-error">✗ Failed — see output above</span>`;
    footer.hidden = false;
  }

  // ----------------------------------------------------------------
  // Stop
  // ----------------------------------------------------------------
  _stop() {
    this._running = false;
    window.app.workflowChat.cancel();
    window.app.workflowChat.offAll();
    if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
    this._layers.forEach(l => {
      // Running layer was interrupted — revert to open (not yet completed)
      if (this._statuses[l.id] === 'running') this._statuses[l.id] = 'open';
    });
    this._refreshLayerList();
    this._updateToolbar();
  }

  // ----------------------------------------------------------------
  // Render helpers
  // ----------------------------------------------------------------
  _updateToolbar() {
    const runAll = this.container.querySelector('#wfrBtnRunAll');
    const stop   = this.container.querySelector('#wfrBtnStop');
    const lbl    = this.container.querySelector('#wfrRunLabel');
    if (runAll) runAll.hidden = this._running;
    if (stop)   stop.hidden   = !this._running;
    if (lbl) {
      lbl.hidden      = this._running;
      lbl.textContent = 'Run complete';
    }
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
    return this._layers.map(l => {
      const st  = this._statuses[l.id] || 'pending';
      const sel = this._selectedId === l.id;
      const elapsed = this._startTimes[l.id] ? this._fmt(Date.now() - this._startTimes[l.id]) : '';
      return `
        <div class="wfr-layer-row ${sel ? 'wfr-layer-row--active' : ''}" data-id="${l.id}">
          <span class="wfr-status-chip ${STATUS[st].cls}">${STATUS[st].label}</span>
          <span class="wfr-layer-name">${escHtml(l.layer || 'Layer')}</span>
          ${elapsed ? `<span class="wfr-layer-time">${elapsed}</span>` : ''}
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

  // ----------------------------------------------------------------
  // Templates
  // ----------------------------------------------------------------
  _renderLoading() {
    this.container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;
                  font-family:var(--font-sans,system-ui);color:var(--text-muted,#888)">
        Loading workflow…
      </div>`;
  }

  _render() {
    const wf = this._workflow;
    const name = wf ? escHtml(wf.feature || 'Workflow') : 'Workflow';

    this.container.innerHTML = `
      <div class="wfr-page">
        <header class="wfr-header">
          <span class="wfr-header__title">${name} — Run All Layers</span>
          <div class="wfr-header__actions">
            <span class="wfr-header__status" id="wfrRunLabel" hidden></span>
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
          <!-- Left: layer list + criteria -->
          <aside class="wfr-sidebar">
            <div class="wfr-sidebar__section-hd">Layers</div>
            <div class="wfr-layer-list" id="wfrLayerList">
              ${this._layerListHtml()}
            </div>

            ${this._criteria.length ? `
              <div class="wfr-sidebar__section-hd" style="margin-top:12px">Success Criteria</div>
              <div class="wfr-criteria-list" id="wfrCriteriaList">
                ${this._criteriaHtml()}
              </div>
            ` : ''}

            <div id="wfrSummary" hidden></div>
          </aside>

          <!-- Right: output panel -->
          <section class="wfr-output-panel">
            <div class="wfr-output-header" id="wfrOutputHeader">
              <span class="wfr-output-layer-name" id="wfrOutputLayerName">
                ${escHtml(this._layers[0]?.layer || '')}
              </span>
              <span class="wfr-elapsed" id="wfrElapsed"></span>
            </div>
            <pre class="wfr-output" id="wfrOutput"></pre>
            <div class="wfr-output-footer" id="wfrOutputFooter" hidden></div>
          </section>
        </div>
      </div>`;

    this._bindEvents();
  }

  _bindEvents() {
    this.container.querySelector('#wfrBtnRunAll')
      ?.addEventListener('click', () => {
        if (this._running || !this._layers.length) return;
        this._layers.forEach(l => { this._statuses[l.id] = 'open'; this._outputs[l.id] = ''; });
        this._startTimes = {};
        this._elapsed    = {};
        this.container.querySelector('#wfrRunLabel').hidden = true;
        this._refreshLayerList();
        this._selectLayer(this._layers[0].id);
        this._runAll();
      });

    this.container.querySelector('#wfrBtnStop')
      ?.addEventListener('click', () => this._stop());

    this.container.querySelectorAll('.wfr-layer-row').forEach(row => {
      row.addEventListener('click', () => this._selectLayer(+row.dataset.id));
    });
  }
}
