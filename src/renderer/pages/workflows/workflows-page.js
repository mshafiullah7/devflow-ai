import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme }              from '../../shared/theme-manager.js';
import { ModelPicker }                   from '../../components/model-picker/model-picker.js';

export class WorkflowsPage {
  constructor(container, params, router) {
    this.container      = container;
    this.router         = router;
    this._projectId     = params.projectId;
    this._project       = null;
    this._workflows     = [];
    this._activeId      = null;
    this._layers        = [];
    this._criteria      = [];
    this._activeTab     = 'layers';
    this._addingWorkflow = false; // true when the inline add-workflow form is open
    this._editingId     = null;   // layer id being inline-edited (null = none)
    this._addingLayer   = false;  // true when the "new layer" form is open
    this._addingCrit    = false;
    this._editingCritId = null;
    this._editingWf     = false;  // workflow header edit mode
    this._runMode       = null;   // null | 'drawer' | 'panel'
    this._runLayerId    = null;
    this._running       = false;
    this._outputBuf     = '';
    this._aiModelConfig = null;
    this._startTime     = null;
    this._timerInt      = null;
    this._pendingSave   = null;
    this._dragSrcId     = null;
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  async mount() {
    injectCss('pages/user-stories/user-stories.css');
    injectCss('pages/extract-user-stories/extract-user-stories-page.css');
    injectCss('pages/issues/issues-page.css');
    injectCss('pages/workflows/workflows-page.css');
    applyStoredTheme();

    const [project, _mapping] = await Promise.all([
      window.db.projects.get(this._projectId),
      window.db.modelMapping.get('workflows'),
    ]);
    this._project = project;

    this.container.innerHTML = this._template();

    this._picker = new ModelPicker({
      anchor:    this.container.querySelector('#wfModelPicker'),
      onSelect:  model => { this._aiModelConfig = model; },
      initialId: _mapping?.model_config_id ?? null,
    });
    await this._picker.reload();

    this._bindHeaderEvents();
    this._initResizable();
    await this._loadWorkflows();
  }

  unmount() {
    if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
    window.app.chat.offAll();
    removeCss('pages/workflows/workflows-page.css');
    removeCss('pages/issues/issues-page.css');
    removeCss('pages/extract-user-stories/extract-user-stories-page.css');
    removeCss('pages/user-stories/user-stories.css');
    this._picker?.unmount();
  }

  // ----------------------------------------------------------------
  // Data loading
  // ----------------------------------------------------------------
  async _loadWorkflows() {
    this._workflows = (await window.db.workflows.list(this._projectId)) || [];
    this._renderList();
    if (this._workflows.length > 0) {
      await this._selectWorkflow(this._workflows[0].id);
    } else {
      this._renderDetail();
    }
  }

  async _selectWorkflow(id) {
    this._activeId   = id;
    this._activeTab  = 'layers';
    this._addingWorkflow = false;
    this._editingId  = null;
    this._addingLayer = false;
    this._addingCrit  = false;
    this._editingCritId = null;
    this._editingWf  = false;
    this._runMode    = null;
    if (this._running) this._cancelRun();

    const [layers, criteria] = await Promise.all([
      window.db.layers.list(id),
      window.db.successCriteria.list(id),
    ]);
    this._layers   = (layers   || []).slice().sort((a, b) => a.order_num - b.order_num);
    this._criteria = criteria  || [];

    this._renderList();
    this._renderDetail();
  }

  get _activeWorkflow() {
    return this._workflows.find(w => w.id === this._activeId) ?? null;
  }

  // ----------------------------------------------------------------
  // Top-level template
  // ----------------------------------------------------------------
  _template() {
    const name = this._project?.name ?? 'Project';
    return `
      <div class="project-page">
        <header class="project-page__header">
          <button class="project-page__back" id="wfBtnBack" aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="project-page__title-group">
            <h1 class="project-page__title">${escHtml(name)}</h1>
            <p class="project-page__desc">Workflows</p>
          </div>
          <div class="project-page__header-actions" style="-webkit-app-region:no-drag;">
            <div class="project-page__model-group">
              <div id="wfModelPicker"></div>
              <button class="project-page__model-cfg-btn" id="wfBtnModelConfigs" title="Configure AI models">
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
                    stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          </div>
        </header>

        <div class="project-page__workspace">
          <aside class="project-panel" id="wfPanelList">
            <div class="project-related__section-hd">
              <span class="project-related__section-label">Workflows</span>
              <div class="wf-list-hd-right">
                <span class="project-related__section-count" id="wfCount">0</span>
                <button class="is-add-btn" id="wfBtnAdd" title="Add workflow" aria-label="Add workflow">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="project-related__section-body" id="wfList"></div>
          </aside>

          <div class="project-panel__resize" data-resize="wf-list"></div>

          <section class="project-panel project-panel--detail" id="wfPanelDetail">
            <div id="wfDetailRoot"></div>
          </section>
        </div>
      </div>

      <!-- Navigation guard overlay -->
      <div class="wf-guard-overlay" id="wfGuard" hidden>
        <div class="wf-guard-card">
          <p class="wf-guard-msg">⚠ A layer is still running. Navigating away will cancel it.</p>
          <div class="wf-guard-actions">
            <button class="wf-guard-btn wf-guard-btn--keep" id="wfGuardKeep">Keep Running</button>
            <button class="wf-guard-btn wf-guard-btn--cancel" id="wfGuardCancel">Cancel Run &amp; Go Back</button>
          </div>
        </div>
      </div>`;
  }

  // ----------------------------------------------------------------
  // Workflow list rendering
  // ----------------------------------------------------------------
  _renderList() {
    const el    = this.container.querySelector('#wfList');
    const count = this.container.querySelector('#wfCount');
    if (!el) return;
    if (count) count.textContent = this._workflows.length;

    if (!this._workflows.length) {
      el.innerHTML = '<div class="project-related__empty">No workflows — click + to add one</div>';
      return;
    }

    el.innerHTML = this._workflows.map(w => `
      <div class="eus-src-item${w.id === this._activeId ? ' eus-src-item--active' : ''}"
           data-wf="${w.id}">
        <div class="eus-src-item__info pl-list-info">
          <div class="pl-list-title-row">
            <span class="eus-src-item__id">#${w.id}</span>
            <span class="eus-src-item__title">${escHtml(w.feature || 'Untitled')}</span>
          </div>
          ${w.description
            ? `<span class="pl-list-path" title="${escHtml(w.description)}">${escHtml(w.description.slice(0, 60))}</span>`
            : `<span class="pl-list-path pl-list-path--empty">No description</span>`}
        </div>
        <div class="eus-src-item__actions">
          <button class="eus-story-action eus-story-action--delete wf-list-del"
            data-wf-del="${w.id}" title="Delete workflow" aria-label="Delete">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8M5.5 6v4M8.5 6v4"
                stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>`).join('');

    el.querySelectorAll('[data-wf]').forEach(item => {
      item.addEventListener('click', () => this._selectWorkflow(+item.dataset.wf));
    });
    el.querySelectorAll('[data-wf-del]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this._deleteWorkflow(+btn.dataset.wfDel);
      });
    });
  }

  // ----------------------------------------------------------------
  // Detail panel — router
  // ----------------------------------------------------------------
  _renderDetail() {
    const root = this.container.querySelector('#wfDetailRoot');
    if (!root) return;

    if (!this._activeWorkflow) {
      root.innerHTML = `
        <div class="project-panel__empty">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <span>Select a workflow or click + to create one</span>
        </div>`;
      return;
    }

    if (this._runMode === 'panel') {
      root.innerHTML = this._runPanelHtml();
      this._bindRunPanelEvents();
      return;
    }

    root.innerHTML = this._detailHtml();
    this._bindDetailEvents();

    if (this._runMode === 'drawer') {
      this._showDrawer(this._runLayerId);
    }
  }

  // ----------------------------------------------------------------
  // Detail view HTML
  // ----------------------------------------------------------------
  _detailHtml() {
    const wf = this._activeWorkflow;
    if (!wf) return '';
    return `
      <div class="project-panel__header">
        ${this._editingWf ? this._wfEditFormHtml(wf) : this._wfHeaderHtml(wf)}
      </div>

      <div class="wf-tabs" id="wfTabs">
        <button class="wf-tab ${this._activeTab === 'layers'   ? 'wf-tab--active' : ''}" data-tab="layers">
          Layers <span class="wf-tab-count">${this._layers.length}</span>
        </button>
        <button class="wf-tab ${this._activeTab === 'criteria' ? 'wf-tab--active' : ''}" data-tab="criteria">
          Success Criteria <span class="wf-tab-count">${this._criteria.length}</span>
        </button>
      </div>

      <div class="project-panel__content wf-tab-body" id="wfTabBody">
        ${this._activeTab === 'layers' ? this._layersTabHtml() : this._criteriaTabHtml()}
      </div>`;
  }

  _wfHeaderHtml(wf) {
    return `
      <div class="wf-detail-header">
        <div class="wf-detail-title-block">
          <span class="project-panel__title">${escHtml(wf.feature || 'Untitled')}</span>
          <span class="wf-detail-desc">${escHtml(wf.description || '')}</span>
        </div>
        <div class="project-panel__header-actions">
          <button class="is-edit-btn" id="wfBtnEditWf" title="Edit workflow">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.4"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="is-del-btn" id="wfBtnDeleteWf" title="Delete workflow">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"
                stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>`;
  }

  _wfEditFormHtml(wf) {
    return `
      <div class="wf-edit-form" id="wfEditForm">
        <div class="wf-field">
          <label class="wf-label">Feature / Name</label>
          <input class="wf-input" id="wfEFeature" value="${escHtml(wf.feature || '')}" placeholder="e.g. Code Review">
        </div>
        <div class="wf-field">
          <label class="wf-label">Description</label>
          <textarea class="wf-textarea" id="wfEDesc" rows="2">${escHtml(wf.description || '')}</textarea>
        </div>
        <div class="wf-form-actions">
          <button class="wf-btn-cancel" id="wfBtnCancelEditWf">Cancel</button>
          <button class="wf-btn-save" id="wfBtnSaveWf">Save</button>
        </div>
      </div>`;
  }

  // ----------------------------------------------------------------
  // Layers tab
  // ----------------------------------------------------------------
  _layersTabHtml() {
    return `
      <div class="wf-layers-toolbar">
        <button class="wf-run-all-btn" id="wfBtnRunAll"
          ${!this._layers.length ? 'disabled' : ''}
          title="Run all layers in a separate window">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <path d="M3 2l12 6-12 6V2z" fill="currentColor"/>
          </svg>
          Run All →
        </button>
        <button class="is-add-btn" id="wfBtnAddLayer" title="Add layer" style="margin-left:auto">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="wf-layers-list" id="wfLayersList">
        ${this._layersListHtml()}
        ${this._addingLayer ? this._newLayerFormHtml() : ''}
      </div>`;
  }

  _layersListHtml() {
    if (!this._layers.length && !this._addingLayer) {
      return '<div class="project-related__empty" style="padding:24px 0">No layers yet — click + to add one</div>';
    }
    return this._layers.map(l => this._editingId === l.id
      ? this._layerEditFormHtml(l)
      : this._layerRowHtml(l)
    ).join('');
  }

  _layerRowHtml(l) {
    return `
      <div class="wf-layer-row" data-lid="${l.id}" draggable="true">
        <span class="wf-drag-handle" title="Drag to reorder">⠿</span>
        <span class="wf-layer-order">${l.order_num}</span>
        <div class="wf-layer-info">
          <span class="wf-layer-name">${escHtml(l.layer || 'Layer')}</span>
          <div class="wf-layer-meta">
            ${l.purpose  ? `<span class="wf-meta-row"><b>Purpose:</b> ${escHtml(l.purpose)}</span>`  : ''}
            ${l.inputs   ? `<span class="wf-meta-row"><b>Inputs:</b>  ${escHtml(l.inputs)}</span>`   : ''}
            ${l.outputs  ? `<span class="wf-meta-row"><b>Outputs:</b> ${escHtml(l.outputs)}</span>`  : ''}
          </div>
        </div>
        <div class="wf-layer-actions">
          <button class="wf-icon-btn wf-run-btn" data-lid="${l.id}" title="Run this layer">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M3 2l12 6-12 6V2z" fill="currentColor"/>
            </svg>
          </button>
          <button class="wf-icon-btn wf-edit-btn" data-lid="${l.id}" title="Edit layer">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.4"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="wf-icon-btn wf-del-btn" data-lid="${l.id}" title="Delete layer">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"
                stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>`;
  }

  _layerEditFormHtml(l) {
    const v = l || {};
    return `
      <div class="wf-layer-edit-form" data-lid="${v.id || ''}">
        <div class="wf-field-row">
          <div class="wf-field wf-field--grow">
            <label class="wf-label">Name</label>
            <input class="wf-input" data-f="layer" value="${escHtml(v.layer || '')}" placeholder="e.g. Fetch PR Data">
          </div>
          <div class="wf-field wf-field--sm">
            <label class="wf-label">Order</label>
            <input class="wf-input" type="number" data-f="order_num" value="${v.order_num ?? (this._layers.length + 1)}" min="1">
          </div>
        </div>
        <div class="wf-field">
          <label class="wf-label">Purpose</label>
          <input class="wf-input" data-f="purpose" value="${escHtml(v.purpose || '')}" placeholder="What does this layer do?">
        </div>
        <div class="wf-field-row">
          <div class="wf-field wf-field--grow">
            <label class="wf-label">Inputs</label>
            <input class="wf-input" data-f="inputs" value="${escHtml(v.inputs || '')}" placeholder="What goes in?">
          </div>
          <div class="wf-field wf-field--grow">
            <label class="wf-label">Outputs</label>
            <input class="wf-input" data-f="outputs" value="${escHtml(v.outputs || '')}" placeholder="What comes out?">
          </div>
        </div>
        <div class="wf-field">
          <label class="wf-label">Prompt</label>
          <textarea class="wf-textarea wf-textarea--tall" data-f="prompt" placeholder="AI instructions for this layer…">${escHtml(v.prompt || '')}</textarea>
        </div>
        <div class="wf-form-actions">
          <button class="wf-btn-cancel" data-action="cancel-layer">Cancel</button>
          <button class="wf-btn-save"   data-action="save-layer">Save Layer</button>
        </div>
      </div>`;
  }

  _newLayerFormHtml() {
    const nextOrder = this._layers.length + 1;
    return `
      <div class="wf-layer-edit-form wf-layer-edit-form--new" id="wfNewLayerForm">
        <div class="wf-field-row">
          <div class="wf-field wf-field--grow">
            <label class="wf-label">Name</label>
            <input class="wf-input" id="wfNLName" placeholder="e.g. Fetch PR Data">
          </div>
          <div class="wf-field wf-field--sm">
            <label class="wf-label">Order</label>
            <input class="wf-input" type="number" id="wfNLOrder" value="${nextOrder}" min="1">
          </div>
        </div>
        <div class="wf-field">
          <label class="wf-label">Purpose</label>
          <input class="wf-input" id="wfNLPurpose" placeholder="What does this layer do?">
        </div>
        <div class="wf-field-row">
          <div class="wf-field wf-field--grow">
            <label class="wf-label">Inputs</label>
            <input class="wf-input" id="wfNLInputs" placeholder="What goes in?">
          </div>
          <div class="wf-field wf-field--grow">
            <label class="wf-label">Outputs</label>
            <input class="wf-input" id="wfNLOutputs" placeholder="What comes out?">
          </div>
        </div>
        <div class="wf-field">
          <label class="wf-label">Prompt</label>
          <textarea class="wf-textarea wf-textarea--tall" id="wfNLPrompt" placeholder="AI instructions for this layer…"></textarea>
        </div>
        <div class="wf-form-actions">
          <button class="wf-btn-cancel" id="wfBtnCancelNewLayer">Cancel</button>
          <button class="wf-btn-save"   id="wfBtnSaveNewLayer">Add Layer</button>
        </div>
      </div>`;
  }

  // ----------------------------------------------------------------
  // Success Criteria tab
  // ----------------------------------------------------------------
  _criteriaTabHtml() {
    return `
      <div class="wf-criteria-section">
        <div class="wf-criteria-list" id="wfCriteriaList">
          ${this._criteriaListHtml()}
        </div>
        ${this._addingCrit ? this._newCritFormHtml() : `
          <button class="wf-add-crit-btn" id="wfBtnAddCrit">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
            Add criterion…
          </button>`}
      </div>`;
  }

  _criteriaListHtml() {
    if (!this._criteria.length && !this._addingCrit) {
      return '<div class="project-related__empty" style="padding:16px 0">No success criteria yet</div>';
    }
    return this._criteria.map(c => this._editingCritId === c.id
      ? this._critEditFormHtml(c)
      : this._critRowHtml(c)
    ).join('');
  }

  _critRowHtml(c) {
    return `
      <div class="wf-crit-row" data-cid="${c.id}">
        <svg class="wf-crit-check" width="14" height="14" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" stroke-width="1.4"/>
          <path d="M4 8l3 3 5-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="wf-crit-text">${escHtml(c.description)}</span>
        <button class="wf-icon-btn wf-edit-btn" data-cid="${c.id}" title="Edit">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.4"
              stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="wf-icon-btn wf-del-btn" data-cid="${c.id}" title="Delete">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"
              stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>`;
  }

  _critEditFormHtml(c) {
    return `
      <div class="wf-crit-edit-form" data-cid="${c.id}">
        <input class="wf-input" data-cf="desc" value="${escHtml(c.description)}" placeholder="Success criterion…">
        <div class="wf-form-actions wf-form-actions--inline">
          <button class="wf-btn-cancel" data-action="cancel-crit">Cancel</button>
          <button class="wf-btn-save"   data-action="save-crit">Save</button>
        </div>
      </div>`;
  }

  _newCritFormHtml() {
    return `
      <div class="wf-crit-edit-form wf-crit-edit-form--new" id="wfNewCritForm">
        <input class="wf-input" id="wfNCDesc" placeholder="e.g. All findings include file and line number…" autofocus>
        <div class="wf-form-actions wf-form-actions--inline">
          <button class="wf-btn-cancel" id="wfBtnCancelNewCrit">Cancel</button>
          <button class="wf-btn-save"   id="wfBtnSaveNewCrit">Add</button>
        </div>
      </div>`;
  }

  // ----------------------------------------------------------------
  // Run drawer (slides over the detail panel)
  // ----------------------------------------------------------------
  _showDrawer(layerId) {
    const layer = this._layers.find(l => l.id === layerId);
    if (!layer) return;

    const existing = this.container.querySelector('#wfRunDrawer');
    if (existing) existing.remove();

    const panel = this.container.querySelector('#wfPanelDetail');
    const drawer = document.createElement('div');
    drawer.id = 'wfRunDrawer';
    drawer.className = 'wf-drawer';
    drawer.innerHTML = `
      <div class="wf-drawer__header">
        <span class="wf-drawer__title">Run Layer</span>
        <button class="wf-drawer__close" id="wfDrawerClose">×</button>
      </div>
      <div class="wf-drawer__body">
        <div class="wf-drawer__section-hd">Layer</div>
        <div class="wf-drawer__layer-name">${escHtml(layer.layer || 'Layer')}</div>

        ${layer.purpose ? `
          <div class="wf-drawer__section-hd">Purpose</div>
          <div class="wf-drawer__text">${escHtml(layer.purpose)}</div>` : ''}

        ${layer.inputs ? `
          <div class="wf-drawer__section-hd">Expected Inputs</div>
          <div class="wf-drawer__text">${escHtml(layer.inputs)}</div>` : ''}

        ${layer.outputs ? `
          <div class="wf-drawer__section-hd">Expected Outputs</div>
          <div class="wf-drawer__text">${escHtml(layer.outputs)}</div>` : ''}

        ${layer.prompt ? `
          <div class="wf-drawer__section-hd">Prompt preview</div>
          <pre class="wf-drawer__prompt-preview">${escHtml(layer.prompt.slice(0, 300))}${layer.prompt.length > 300 ? '…' : ''}</pre>` : ''}
      </div>
      <div class="wf-drawer__footer">
        <button class="wf-btn-cancel" id="wfDrawerCancelRun">Cancel</button>
        <button class="wf-btn-run" id="wfDrawerConfirmRun">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <path d="M3 2l12 6-12 6V2z" fill="currentColor"/>
          </svg>
          Run Layer
        </button>
      </div>`;

    panel.appendChild(drawer);

    drawer.querySelector('#wfDrawerClose').addEventListener('click', () => this._closeDrawer());
    drawer.querySelector('#wfDrawerCancelRun').addEventListener('click', () => this._closeDrawer());
    drawer.querySelector('#wfDrawerConfirmRun').addEventListener('click', () => this._startLayerRun(layerId));
  }

  _closeDrawer() {
    this._runMode    = null;
    this._runLayerId = null;
    this.container.querySelector('#wfRunDrawer')?.remove();
  }

  // ----------------------------------------------------------------
  // Run panel (replaces detail content while a layer is running)
  // ----------------------------------------------------------------
  _runPanelHtml() {
    const layer = this._layers.find(l => l.id === this._runLayerId);
    const name  = layer ? escHtml(layer.layer || 'Layer') : 'Layer';
    return `
      <div class="wf-run-panel">
        <div class="wf-run-panel__header">
          <div class="wf-run-panel__title">
            ${this._running
              ? `<span class="wf-run-status wf-run-status--running">Running</span>`
              : `<span class="wf-run-status wf-run-status--done">Done</span>`}
            ${name}
          </div>
          <span class="wf-run-elapsed" id="wfRunElapsed"></span>
          ${this._running
            ? `<button class="wf-stop-btn" id="wfBtnStop">■ Stop</button>`
            : ''}
        </div>
        <pre class="wf-run-output" id="wfRunOutput"></pre>
        <div class="wf-run-footer" id="wfRunFooter" hidden></div>
        <div class="wf-run-panel__back-row">
          <button class="wf-back-detail-btn" id="wfBtnBackDetail">← Back to Detail</button>
          ${!this._running && this._nextLayer() ? `
            <button class="wf-btn-run" id="wfBtnRunNext">
              Run ${escHtml(this._nextLayer().layer || 'Next Layer')} →
            </button>` : ''}
        </div>
      </div>`;
  }

  _nextLayer() {
    if (!this._runLayerId) return null;
    const idx = this._layers.findIndex(l => l.id === this._runLayerId);
    return idx >= 0 && idx < this._layers.length - 1 ? this._layers[idx + 1] : null;
  }

  // ----------------------------------------------------------------
  // Run a single layer
  // ----------------------------------------------------------------
  _startLayerRun(layerId) {
    this._closeDrawer();
    this._runLayerId = layerId;
    this._runMode    = 'panel';
    this._running    = true;
    this._outputBuf  = '';
    this._startTime  = Date.now();
    this._renderDetail();

    const layer = this._layers.find(l => l.id === layerId);
    if (!layer) { this._finishRun('No layer found'); return; }

    if (!this._aiModelConfig) {
      this._finishRun('No AI model configured. Select a model in the header before running.');
      return;
    }

    this._startTimer();

    window.app.chat.onToken(({ text }) => {
      this._outputBuf += text;
      const pre = this.container.querySelector('#wfRunOutput');
      if (pre) { pre.textContent += text; pre.scrollTop = pre.scrollHeight; }
    });

    window.app.chat.onDone(({ raw, error }) => {
      window.app.chat.offAll();
      this._finishRun(error || null);
    });

    window.app.chat.generate({
      prompt: layer.prompt ||
        `Execute workflow layer: ${layer.layer}\n\nPurpose: ${layer.purpose || ''}\nInputs: ${layer.inputs || ''}\nExpected outputs: ${layer.outputs || ''}`,
      model: this._aiModelConfig,
    });
  }

  _finishRun(error) {
    this._running = false;
    if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
    const elapsed = this._startTime ? Math.floor((Date.now() - this._startTime) / 1000) : 0;
    const elapsedStr = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed/60)}m ${elapsed%60}s`;

    const btn = this.container.querySelector('#wfBtnStop');
    if (btn) btn.remove();

    const statusEl = this.container.querySelector('.wf-run-status');
    if (statusEl) {
      statusEl.className = `wf-run-status ${error ? 'wf-run-status--error' : 'wf-run-status--done'}`;
      statusEl.textContent = error ? 'Error' : 'Done';
    }

    const footer = this.container.querySelector('#wfRunFooter');
    if (footer) {
      footer.innerHTML = error
        ? `<span class="wf-footer-error">✗ ${escHtml(error)}</span>`
        : `<span class="wf-footer-done">✔ Completed in ${elapsedStr}</span>`;
      footer.hidden = false;
    }

    // Add "Run Next" button if available
    const backRow = this.container.querySelector('.wf-run-panel__back-row');
    if (backRow && !error && this._nextLayer()) {
      const next = this._nextLayer();
      const existing = backRow.querySelector('#wfBtnRunNext');
      if (!existing) {
        const btn2 = document.createElement('button');
        btn2.className = 'wf-btn-run';
        btn2.id = 'wfBtnRunNext';
        btn2.textContent = `Run ${next.layer || 'Next Layer'} →`;
        btn2.addEventListener('click', () => this._openDrawer(next.id));
        backRow.appendChild(btn2);
      }
    }
  }

  _cancelRun() {
    window.app.chat.cancel();
    window.app.chat.offAll();
    this._running = false;
    if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
  }

  _startTimer() {
    if (this._timerInt) clearInterval(this._timerInt);
    this._timerInt = setInterval(() => {
      const el = this.container.querySelector('#wfRunElapsed');
      if (el && this._startTime) {
        const s = Math.floor((Date.now() - this._startTime) / 1000);
        el.textContent = s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`;
      }
    }, 500);
  }

  // ----------------------------------------------------------------
  // Open drawer for a layer (before running)
  // ----------------------------------------------------------------
  _openDrawer(layerId) {
    this._runMode    = 'drawer';
    this._runLayerId = layerId;
    this._renderDetail();
  }

  // ----------------------------------------------------------------
  // CRUD — Workflows
  // ----------------------------------------------------------------
  _addWorkflow() {
    document.querySelector('.wf-add-modal-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'wf-add-modal-overlay';
    overlay.innerHTML = `
      <div class="wf-add-modal">
        <div class="wf-add-modal__header">
          <span class="wf-add-modal__title">New Workflow</span>
          <button class="wf-add-modal__close" id="wfModalClose">×</button>
        </div>
        <div class="wf-add-modal__body">
          <div class="wf-field">
            <label class="wf-label">Feature / Name <span class="wf-label-required">*</span></label>
            <input class="wf-input" id="wfModalFeature" placeholder="e.g. Code Review" autocomplete="off">
          </div>
          <div class="wf-field">
            <label class="wf-label">Description</label>
            <textarea class="wf-textarea" id="wfModalDesc" rows="3"
              placeholder="What does this workflow accomplish?"></textarea>
          </div>
        </div>
        <div class="wf-add-modal__footer">
          <button class="wf-btn-cancel" id="wfModalCancel">Cancel</button>
          <button class="wf-btn-save"   id="wfModalConfirm">Add Workflow</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => { overlay.remove(); document.removeEventListener('keydown', escFn); };
    const escFn = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escFn);

    overlay.querySelector('#wfModalClose').addEventListener('click', close);
    overlay.querySelector('#wfModalCancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const confirm = async () => {
      const featureEl = overlay.querySelector('#wfModalFeature');
      const feature   = featureEl.value.trim();
      if (!feature) { featureEl.focus(); featureEl.classList.add('wf-input--error'); return; }
      const description = overlay.querySelector('#wfModalDesc').value.trim() || null;
      close();
      const wf = await window.db.workflows.create({ project_id: this._projectId, feature, description });
      this._workflows.push(wf);
      this._renderList();
      await this._selectWorkflow(wf.id);
    };

    overlay.querySelector('#wfModalConfirm').addEventListener('click', confirm);
    overlay.querySelector('#wfModalFeature').addEventListener('keydown', e => {
      if (e.key === 'Enter') confirm();
    });

    setTimeout(() => overlay.querySelector('#wfModalFeature')?.focus(), 50);
  }

  async _saveWorkflow() {
    const wf = this._activeWorkflow;
    if (!wf) return;
    const feature = this.container.querySelector('#wfEFeature')?.value.trim();
    const desc    = this.container.querySelector('#wfEDesc')?.value.trim();
    if (!feature) return;
    await window.db.workflows.update({ id: wf.id, feature, description: desc });
    const idx = this._workflows.findIndex(w => w.id === wf.id);
    if (idx >= 0) { this._workflows[idx].feature = feature; this._workflows[idx].description = desc; }
    this._editingWf = false;
    this._renderList();
    this._renderDetail();
  }

  async _deleteWorkflow(id = this._activeId) {
    const wf = this._workflows.find(w => w.id === id);
    if (!wf) return;
    if (!confirm(`Delete workflow "${wf.feature}"? This also deletes all its layers and criteria.`)) return;
    await window.db.workflows.delete(wf.id);
    this._workflows = this._workflows.filter(w => w.id !== wf.id);
    if (this._activeId === wf.id) {
      this._activeId = null;
      this._layers   = [];
      this._criteria = [];
    }
    this._renderList();
    this._renderDetail();
  }

  // ----------------------------------------------------------------
  // CRUD — Layers
  // ----------------------------------------------------------------
  async _saveEditedLayer(form) {
    const id       = +form.dataset.lid;
    const existing = this._layers.find(l => l.id === id);
    if (!existing) return;
    const data = {
      id,
      layer:     form.querySelector('[data-f="layer"]')?.value.trim()    || existing.layer,
      order_num: +form.querySelector('[data-f="order_num"]')?.value      || existing.order_num,
      purpose:   form.querySelector('[data-f="purpose"]')?.value.trim()  ?? existing.purpose,
      inputs:    form.querySelector('[data-f="inputs"]')?.value.trim()   ?? existing.inputs,
      outputs:   form.querySelector('[data-f="outputs"]')?.value.trim()  ?? existing.outputs,
      prompt:    form.querySelector('[data-f="prompt"]')?.value.trim()   ?? existing.prompt,
    };
    await window.db.layers.update(data);
    Object.assign(existing, data);
    this._layers.sort((a, b) => a.order_num - b.order_num);
    this._editingId = null;
    this._refreshLayersTab();
  }

  async _saveNewLayer() {
    const name   = this.container.querySelector('#wfNLName')?.value.trim();
    const order  = +(this.container.querySelector('#wfNLOrder')?.value) || (this._layers.length + 1);
    if (!name) return;
    const layer = await window.db.layers.create({
      workflow_id: this._activeId,
      layer:       name,
      order_num:   order,
      purpose:     this.container.querySelector('#wfNLPurpose')?.value.trim() || '',
      inputs:      this.container.querySelector('#wfNLInputs')?.value.trim()  || '',
      outputs:     this.container.querySelector('#wfNLOutputs')?.value.trim() || '',
      prompt:      this.container.querySelector('#wfNLPrompt')?.value.trim()  || '',
    });
    this._layers.push(layer);
    this._layers.sort((a, b) => a.order_num - b.order_num);
    this._addingLayer = false;
    this._refreshLayersTab();
  }

  async _deleteLayer(id) {
    const l = this._layers.find(x => x.id === id);
    if (!l || !confirm(`Delete layer "${l.layer}"?`)) return;
    await window.db.layers.delete(id);
    this._layers = this._layers.filter(x => x.id !== id);
    if (this._editingId === id) this._editingId = null;
    this._refreshLayersTab();
  }

  // ----------------------------------------------------------------
  // CRUD — Success Criteria
  // ----------------------------------------------------------------
  async _saveNewCrit() {
    const desc = this.container.querySelector('#wfNCDesc')?.value.trim();
    if (!desc) return;
    const c = await window.db.successCriteria.create({ workflow_id: this._activeId, description: desc });
    this._criteria.push(c);
    this._addingCrit = false;
    this._refreshCriteriaTab();
  }

  async _saveEditedCrit(form) {
    const id       = +form.dataset.cid;
    const existing = this._criteria.find(c => c.id === id);
    if (!existing) return;
    const desc = form.querySelector('[data-cf="desc"]')?.value.trim();
    if (!desc) return;
    await window.db.successCriteria.update({ id, description: desc });
    existing.description = desc;
    this._editingCritId  = null;
    this._refreshCriteriaTab();
  }

  async _deleteCrit(id) {
    const c = this._criteria.find(x => x.id === id);
    if (!c || !confirm(`Delete this criterion?`)) return;
    await window.db.successCriteria.delete(id);
    this._criteria = this._criteria.filter(x => x.id !== id);
    if (this._editingCritId === id) this._editingCritId = null;
    this._refreshCriteriaTab();
  }

  // ----------------------------------------------------------------
  // Partial re-render helpers
  // ----------------------------------------------------------------
  _refreshLayersTab() {
    const body = this.container.querySelector('#wfTabBody');
    if (!body || this._activeTab !== 'layers') return;
    body.innerHTML = this._layersTabHtml();
    this._bindLayerTabEvents();
  }

  _refreshCriteriaTab() {
    const body = this.container.querySelector('#wfTabBody');
    if (!body || this._activeTab !== 'criteria') return;
    body.innerHTML = this._criteriaTabHtml();
    this._bindCriteriaTabEvents();
  }

  // ----------------------------------------------------------------
  // Drag & drop reorder
  // ----------------------------------------------------------------
  _bindDrag(list) {
    list.querySelectorAll('[draggable="true"]').forEach(row => {
      row.addEventListener('dragstart', e => {
        this._dragSrcId = +row.dataset.lid;
        e.dataTransfer.effectAllowed = 'move';
        row.classList.add('wf-layer-row--dragging');
      });
      row.addEventListener('dragend', () => row.classList.remove('wf-layer-row--dragging'));
      row.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      row.addEventListener('drop', async e => {
        e.preventDefault();
        const targetId = +row.dataset.lid;
        if (targetId === this._dragSrcId) return;
        const srcIdx = this._layers.findIndex(l => l.id === this._dragSrcId);
        const tgtIdx = this._layers.findIndex(l => l.id === targetId);
        if (srcIdx < 0 || tgtIdx < 0) return;
        const [moved] = this._layers.splice(srcIdx, 1);
        this._layers.splice(tgtIdx, 0, moved);
        this._layers.forEach((l, i) => { l.order_num = i + 1; });
        await Promise.all(this._layers.map(l => window.db.layers.update({ id: l.id, order_num: l.order_num })));
        this._refreshLayersTab();
      });
    });
  }

  // ----------------------------------------------------------------
  // Event binding
  // ----------------------------------------------------------------
  _bindHeaderEvents() {
    this.container.querySelector('#wfBtnBack')
      ?.addEventListener('click', () => {
        if (this._running) { this._showGuard('back'); return; }
        this.router.navigate('project-home', { projectId: this._projectId });
      });

    this.container.querySelector('#wfBtnAdd')
      ?.addEventListener('click', () => this._addWorkflow());

    this.container.querySelector('#wfBtnModelConfigs')
      ?.addEventListener('click', () =>
        this.router.navigate('settings', { from: 'workflows', fromParams: { projectId: this._projectId } }));

    // Guard actions
    this.container.querySelector('#wfGuardKeep')
      ?.addEventListener('click', () => this._hideGuard());
    this.container.querySelector('#wfGuardCancel')
      ?.addEventListener('click', () => {
        this._hideGuard();
        this._cancelRun();
        this.router.navigate('project-home', { projectId: this._projectId });
      });
  }

  _bindDetailEvents() {
    const root = this.container.querySelector('#wfDetailRoot');
    if (!root) return;

    // Workflow header edit / delete
    root.querySelector('#wfBtnEditWf')
      ?.addEventListener('click', () => { this._editingWf = true; this._renderDetail(); });
    root.querySelector('#wfBtnDeleteWf')
      ?.addEventListener('click', () => this._deleteWorkflow());
    root.querySelector('#wfBtnSaveWf')
      ?.addEventListener('click', () => this._saveWorkflow());
    root.querySelector('#wfBtnCancelEditWf')
      ?.addEventListener('click', () => { this._editingWf = false; this._renderDetail(); });

    // Tabs
    root.querySelectorAll('.wf-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeTab     = btn.dataset.tab;
        this._editingId     = null;
        this._addingLayer   = false;
        this._editingCritId = null;
        this._addingCrit    = false;
        this._renderDetail();
      });
    });

    if (this._activeTab === 'layers')   this._bindLayerTabEvents();
    if (this._activeTab === 'criteria') this._bindCriteriaTabEvents();
  }

  _bindLayerTabEvents() {
    const body = this.container.querySelector('#wfTabBody');
    if (!body) return;

    body.querySelector('#wfBtnRunAll')
      ?.addEventListener('click', () => this._launchRunAll());

    body.querySelector('#wfBtnAddLayer')
      ?.addEventListener('click', () => {
        this._addingLayer = true;
        this._editingId   = null;
        this._refreshLayersTab();
        setTimeout(() => this.container.querySelector('#wfNLName')?.focus(), 50);
      });

    body.querySelector('#wfBtnCancelNewLayer')
      ?.addEventListener('click', () => { this._addingLayer = false; this._refreshLayersTab(); });
    body.querySelector('#wfBtnSaveNewLayer')
      ?.addEventListener('click', () => this._saveNewLayer());

    const list = body.querySelector('#wfLayersList');
    if (list) {
      list.querySelectorAll('.wf-run-btn').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); this._openDrawer(+btn.dataset.lid); });
      });
      list.querySelectorAll('.wf-edit-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          this._editingId   = +btn.dataset.lid;
          this._addingLayer = false;
          this._refreshLayersTab();
        });
      });
      list.querySelectorAll('.wf-del-btn').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); this._deleteLayer(+btn.dataset.lid); });
      });
      list.querySelectorAll('[data-action="cancel-layer"]').forEach(btn => {
        btn.addEventListener('click', () => { this._editingId = null; this._refreshLayersTab(); });
      });
      list.querySelectorAll('[data-action="save-layer"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const form = btn.closest('.wf-layer-edit-form');
          if (form) this._saveEditedLayer(form);
        });
      });
      this._bindDrag(list);
    }
  }

  _bindCriteriaTabEvents() {
    const body = this.container.querySelector('#wfTabBody');
    if (!body) return;

    body.querySelector('#wfBtnAddCrit')
      ?.addEventListener('click', () => {
        this._addingCrit    = true;
        this._editingCritId = null;
        this._refreshCriteriaTab();
        setTimeout(() => this.container.querySelector('#wfNCDesc')?.focus(), 50);
      });

    body.querySelector('#wfBtnCancelNewCrit')
      ?.addEventListener('click', () => { this._addingCrit = false; this._refreshCriteriaTab(); });
    body.querySelector('#wfBtnSaveNewCrit')
      ?.addEventListener('click', () => this._saveNewCrit());

    const list = body.querySelector('#wfCriteriaList');
    if (list) {
      list.querySelectorAll('.wf-edit-btn[data-cid]').forEach(btn => {
        btn.addEventListener('click', () => {
          this._editingCritId = +btn.dataset.cid;
          this._addingCrit    = false;
          this._refreshCriteriaTab();
        });
      });
      list.querySelectorAll('.wf-del-btn[data-cid]').forEach(btn => {
        btn.addEventListener('click', () => this._deleteCrit(+btn.dataset.cid));
      });
      list.querySelectorAll('[data-action="cancel-crit"]').forEach(btn => {
        btn.addEventListener('click', () => { this._editingCritId = null; this._refreshCriteriaTab(); });
      });
      list.querySelectorAll('[data-action="save-crit"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const form = btn.closest('.wf-crit-edit-form');
          if (form) this._saveEditedCrit(form);
        });
      });
    }
  }

  _bindRunPanelEvents() {
    this.container.querySelector('#wfBtnStop')
      ?.addEventListener('click', () => {
        this._cancelRun();
        this._finishRun('Stopped by user');
      });

    this.container.querySelector('#wfBtnBackDetail')
      ?.addEventListener('click', () => {
        if (this._running) { this._showGuard('detail'); return; }
        this._runMode = null;
        this._renderDetail();
      });

    this.container.querySelector('#wfBtnRunNext')
      ?.addEventListener('click', () => {
        const next = this._nextLayer();
        if (next) this._openDrawer(next.id);
      });
  }

  // ----------------------------------------------------------------
  // Navigation guard
  // ----------------------------------------------------------------
  _showGuard(target) {
    this._guardTarget = target;
    const el = this.container.querySelector('#wfGuard');
    if (el) el.hidden = false;
  }
  _hideGuard() {
    const el = this.container.querySelector('#wfGuard');
    if (el) el.hidden = true;
  }

  // ----------------------------------------------------------------
  // Launch Run All → detached window
  // ----------------------------------------------------------------
  _launchRunAll() {
    if (!this._activeId) return;
    window.app.openWorkflowWindow({
      projectId:   this._projectId,
      workflowId:  this._activeId,
      modelConfig: this._aiModelConfig,
    });
  }

  // ----------------------------------------------------------------
  // Resizable panels
  // ----------------------------------------------------------------
  _initResizable() {
    const handle = this.container.querySelector('[data-resize="wf-list"]');
    const list   = this.container.querySelector('#wfPanelList');
    if (!handle || !list) return;

    let startX, startW;
    const onMove = e => {
      const w = Math.max(160, Math.min(startW + e.clientX - startX, 480));
      list.style.flex = `0 0 ${w}px`;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    handle.addEventListener('mousedown', e => {
      startX = e.clientX;
      startW = list.getBoundingClientRect().width;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
}
