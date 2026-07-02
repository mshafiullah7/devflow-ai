import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme }              from '../../shared/theme-manager.js';
import { ModelPicker }                   from '../../components/model-picker/model-picker.js';
import { Dialog }                        from '../../components/dialog/dialog.js';

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
    this._viewingId     = null;   // layer id being viewed (null = none)
    this._aiModelConfig = null;
    this._pendingSave   = null;
    this._dragSrcId     = null;
    this._screenDesign  = null;
    this._screenFilePath = null;
    this._tempDir       = null;
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

    const [project, _mapping, pages, projectLayers] = await Promise.all([
      window.db.projects.get(this._projectId),
      window.db.modelMapping.get('workflows'),
      window.db.screenDesigns.list(this._projectId),
      window.db.projectLayers.list(this._projectId),
    ]);
    this._project       = project;
    this._pages         = pages || [];
    this._projectLayers = projectLayers || [];

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
    this._subscribeToRunnerEvents();
  }

  unmount() {
    window.app.workflowEvents.offAll();
    if (this._tempDir) { window.app.deleteTempDir(this._tempDir); this._tempDir = null; }
    removeCss('pages/workflows/workflows-page.css');
    removeCss('pages/issues/issues-page.css');
    removeCss('pages/extract-user-stories/extract-user-stories-page.css');
    removeCss('pages/user-stories/user-stories.css');
    this._picker?.unmount();
  }

  // ----------------------------------------------------------------
  // Cross-window event subscriptions (Workflow Runner / Generate Workflows)
  // ----------------------------------------------------------------
  _subscribeToRunnerEvents() {
    window.app.workflowEvents.onLayerStatusChanged(({ layerId, workflowId, status }) => {
      // Update in-memory layer if it belongs to the currently selected workflow
      if (workflowId === this._activeId) {
        const layer = this._layers.find(l => l.id === layerId);
        if (layer) {
          layer.status = status;
          this._refreshLayersTab();
        }
      }
      // Re-fetch the workflow so the status badge reflects any auto-recalculated status
      window.db.workflows.get(workflowId).then(wf => {
        if (!wf) return;
        const idx = this._workflows.findIndex(w => w.id === wf.id);
        if (idx >= 0) {
          this._workflows[idx].status = wf.status;
          this._renderList();
          // Also refresh the detail header badge when this is the active workflow
          if (wf.id === this._activeId) this._renderDetail();
        }
      });
    });

    window.app.workflowEvents.onWorkflowsChanged(({ projectId }) => {
      if (projectId !== this._projectId) return;
      // Re-fetch the full workflow list and re-render, keeping active selection if possible
      const previousActiveId = this._activeId;
      window.db.workflows.list(this._projectId).then(async workflows => {
        this._workflows = workflows || [];
        this._renderList();
        // If current selection still exists keep it, otherwise reselect first
        const stillActive = this._workflows.find(w => w.id === previousActiveId);
        if (stillActive) {
          // Refresh layers/criteria for current workflow in case they changed
          const [layers, criteria] = await Promise.all([
            window.db.layers.list(this._activeId),
            window.db.successCriteria.list(this._activeId),
          ]);
          this._layers   = (layers   || []).slice().sort((a, b) => a.order_num - b.order_num);
          this._criteria = criteria  || [];
          this._renderDetail();
        } else if (this._workflows.length > 0) {
          await this._selectWorkflow(this._workflows[0].id);
        } else {
          this._activeId = null;
          this._layers   = [];
          this._criteria = [];
          this._renderDetail();
        }
      });
    });
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
    this._viewingId  = null;
    this._addingLayer = false;
    this._addingCrit  = false;
    this._editingCritId = null;
    this._editingWf  = false;

    // Clean up any previous screen temp file
    if (this._tempDir) { window.app.deleteTempDir(this._tempDir); this._tempDir = null; }
    this._screenDesign   = null;
    this._screenFilePath = null;

    const wf = this._workflows.find(w => w.id === id);

    const [layers, criteria, screenDesign] = await Promise.all([
      window.db.layers.list(id),
      window.db.successCriteria.list(id),
      wf?.screen_design_id ? window.db.screenDesigns.get(wf.screen_design_id) : Promise.resolve(null),
    ]);
    this._layers   = (layers   || []).slice().sort((a, b) => a.order_num - b.order_num);
    this._criteria = criteria  || [];

    if (screenDesign?.html_content) {
      this._screenDesign = screenDesign;
      // For CLI mode write once now; API mode embeds inline at run time
      if (this._aiModelConfig?.type === 'cli') {
        const paths = await window.app.writeTempFiles([
          { name: `screen-${screenDesign.id}.html`, content: screenDesign.html_content },
        ]);
        this._screenFilePath = paths[0];
        this._tempDir = paths[0].replace(/[\\/][^\\/]+$/, '');
      }
    }

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
            <button class="gw-open-btn" id="wfBtnGenerate" title="Generate workflows with AI">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
              </svg>
              Generate Workflows
            </button>
            <div class="project-page__model-group">
              <div id="wfModelPicker"></div>
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

      `;
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

    const itemHtml = w => `
      <div class="eus-src-item${w.id === this._activeId ? ' eus-src-item--active' : ''}"
           data-wf="${w.id}">
        <div class="eus-src-item__info pl-list-info">
          <div class="pl-list-title-row">
            <span class="eus-src-item__id">#${w.id}</span>
            <span class="eus-src-item__title">${escHtml(w.feature || 'Untitled')}</span>
          </div>
          ${w.description
            ? `<span class="pl-list-path" title="${escHtml(w.description)}">${escHtml(w.description)}</span>`
            : `<span class="pl-list-path pl-list-path--empty">No description</span>`}
        </div>
        <div class="eus-src-item__actions wf-item-right">
          ${this._wfStatusBadgeHtml(w.status || 'open')}
          <button class="eus-story-action eus-story-action--delete wf-list-del"
            data-wf-del="${w.id}" title="Delete workflow" aria-label="Delete">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8M5.5 6v4M8.5 6v4"
                stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>`;

    // Split into paged (linked to a screen design) and ungrouped
    const grouped = new Map(); // screen_design_id → [workflow, ...]
    const ungrouped = [];
    for (const w of this._workflows) {
      if (w.screen_design_id) {
        if (!grouped.has(w.screen_design_id)) grouped.set(w.screen_design_id, []);
        grouped.get(w.screen_design_id).push(w);
      } else {
        ungrouped.push(w);
      }
    }

    // Capture which groups the user has manually expanded before wiping the DOM
    const expandedGroups = new Set();
    el.querySelectorAll('.wf-group:not(.wf-group--collapsed)[data-group-id]').forEach(g => {
      expandedGroups.add(g.dataset.groupId);
    });

    const parts = [];
    for (const [pageId, workflows] of grouped) {
      const page = (this._pages || []).find(p => p.id === pageId);
      const pageTitle = page?.title || 'Page';
      const allDone = workflows.every(w => (w.status || 'open') === 'completed' || w.status === 'differed');
      // Collapse by default only when all done AND the user hasn't explicitly expanded it
      const collapsed = allDone && !expandedGroups.has(String(pageId));
      parts.push(`
        <div class="wf-group${collapsed ? ' wf-group--collapsed' : ''}" data-group-id="${pageId}">
          <div class="wf-group-header">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
            </svg>
            <button class="wf-group-page-link" data-page-id="${pageId}" title="Open mockup preview">${escHtml(pageTitle)}</button>
            <svg class="wf-group-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="wf-group-items">${workflows.map(itemHtml).join('')}</div>
        </div>`);
    }
    for (const w of ungrouped) {
      parts.push(itemHtml(w));
    }

    el.innerHTML = parts.join('');

    el.querySelectorAll('.wf-group-header').forEach(header => {
      header.addEventListener('click', e => {
        if (e.target.closest('.wf-group-page-link')) return;
        header.closest('.wf-group').classList.toggle('wf-group--collapsed');
      });
    });
    el.querySelectorAll('.wf-group-page-link').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this._openMockupPreview(+btn.dataset.pageId);
      });
    });
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

    root.innerHTML = this._detailHtml();
    this._bindDetailEvents();
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
          Workflow Layers <span class="wf-tab-count">${this._layers.length}</span>
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
          <div class="wf-detail-title-row">
            <span class="project-panel__title">${escHtml(wf.feature || 'Untitled')}</span>
            ${this._wfStatusBadgeHtml(wf.status || 'open')}
          </div>
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
    const pagesOptions = this._pages.map(p =>
      `<option value="${p.id}" ${wf.screen_design_id === p.id ? 'selected' : ''}>${escHtml(p.title || 'Untitled')}</option>`
    ).join('');
    const currentStatus = wf.status || 'open';
    return `
      <div class="wf-edit-form" id="wfEditForm">
        <div class="wf-field">
          <label class="wf-label">Workflow Name</label>
          <input class="wf-input" id="wfEFeature" value="${escHtml(wf.feature || '')}" placeholder="e.g. Code Review">
        </div>
        <div class="wf-field">
          <label class="wf-label">Description</label>
          <textarea class="wf-textarea" id="wfEDesc" rows="2">${escHtml(wf.description || '')}</textarea>
        </div>
        ${this._pages.length ? `
        <div class="wf-field">
          <label class="wf-label">Page <span class="wf-label-optional">(optional)</span></label>
          <select class="wf-input wf-select" id="wfEPage">
            <option value="">— None —</option>
            ${pagesOptions}
          </select>
        </div>` : ''}
        <div class="wf-field">
          <label class="wf-label">Status</label>
          <select class="wf-input wf-select" id="wfEStatus">
            <option value="open"        ${currentStatus === 'open'        ? 'selected' : ''}>Open</option>
            <option value="in_progress" ${currentStatus === 'in_progress' ? 'selected' : ''}>In Progress</option>
            <option value="completed"   ${currentStatus === 'completed'   ? 'selected' : ''}>Completed</option>
            <option value="differed"    ${currentStatus === 'differed'    ? 'selected' : ''}>Differed</option>
          </select>
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
          title="Open the layer runner window">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <path d="M3 2l12 6-12 6V2z" fill="currentColor"/>
          </svg>
          Run Layers →
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
    return this._layers.map(l => {
      if (this._editingId === l.id)  return this._layerEditFormHtml(l);
      if (this._viewingId === l.id)  return this._layerViewHtml(l);
      return this._layerRowHtml(l);
    }).join('');
  }

  // ----------------------------------------------------------------
  // Status badge helpers
  // ----------------------------------------------------------------
  _layerStatusBadgeHtml(status) {
    const cfg = {
      open:         { label: 'Open',         cls: 'wf-layer-status--open'    },
      executed:     { label: 'Executed',     cls: 'wf-layer-status--done'    },
      failed:       { label: 'Failed',       cls: 'wf-layer-status--error'   },
      needs_review: { label: 'Needs Review', cls: 'wf-layer-status--review'  },
    };
    const s = cfg[status] || cfg.open;
    return `<span class="wf-layer-status-badge ${s.cls}">${s.label}</span>`;
  }

  _wfStatusBadgeHtml(status) {
    const cfg = {
      open:        { label: 'Open',        cls: 'wf-wfstatus--open'     },
      in_progress: { label: 'In Progress', cls: 'wf-wfstatus--progress' },
      completed:   { label: 'Completed',   cls: 'wf-wfstatus--done'     },
      differed:    { label: 'Differed',    cls: 'wf-wfstatus--differed' },
    };
    const s = cfg[status] || cfg.open;
    return `<span class="wf-workflow-status ${s.cls}">${s.label}</span>`;
  }

  _layerRowHtml(l) {
    const fmtArr = v => { try { const a = JSON.parse(v); return Array.isArray(a) ? a.join(' · ') : v; } catch { return v; } };
    return `
      <div class="wf-layer-row wf-layer-row--clickable" data-lid="${l.id}" data-action="view-layer" draggable="true">
        <span class="wf-drag-handle" title="Drag to reorder">⠿</span>
        <span class="wf-layer-order">${l.order_num}</span>
        <div class="wf-layer-info">
          <div class="wf-layer-name-row">
            <span class="wf-layer-name">${escHtml(l.layer || 'Layer')}</span>
            ${this._layerStatusBadgeHtml(l.status || 'open')}
          </div>
          <div class="wf-layer-meta">
            ${l.purpose ? `<span class="wf-meta-row"><b>Purpose:</b> ${escHtml(l.purpose)}</span>` : ''}
            ${l.inputs  ? `<span class="wf-meta-row"><b>Inputs:</b>  ${escHtml(fmtArr(l.inputs))}</span>`  : ''}
            ${l.outputs ? `<span class="wf-meta-row"><b>Outputs:</b> ${escHtml(fmtArr(l.outputs))}</span>` : ''}
          </div>
        </div>
        <div class="wf-layer-actions">
          <button class="wf-icon-btn wf-copy-btn" data-lid="${l.id}" title="Copy Purpose / Inputs / Outputs / Prompt">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <rect x="5" y="4" width="8" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
              <path d="M3 11V2.5A1.5 1.5 0 0 1 4.5 1H11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
          </button>
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

  _layerViewHtml(l) {
    const fmtArr = v => { try { const a = JSON.parse(v); return Array.isArray(a) ? a.join(', ') : v; } catch { return v; } };
    const projectLayer = l.project_layer_id
      ? this._projectLayers.find(pl => pl.id === l.project_layer_id)
      : null;
    const cwd = projectLayer?.folder_path || this._project?.project_path || null;
    return `
      <div class="wf-layer-view" data-lid="${l.id}">
        <div class="wf-layer-view__header" data-action="view-layer" data-lid="${l.id}">
          <span class="wf-layer-order">${l.order_num}</span>
          <div class="wf-layer-info">
            <div class="wf-layer-name-row">
              <span class="wf-layer-name">${escHtml(l.layer || 'Layer')}</span>
              ${this._layerStatusBadgeHtml(l.status || 'open')}
            </div>
            ${cwd ? `<div class="wf-layer-cwd" title="${escHtml(cwd)}"><span class="wf-layer-cwd__label">cwd</span><span class="wf-layer-cwd__path">${escHtml(cwd)}</span></div>` : ''}
          </div>
          <div class="wf-layer-actions wf-layer-actions--visible">
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
            <button class="wf-icon-btn wf-collapse-btn" data-lid="${l.id}" title="Collapse">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M3 10l5-5 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="wf-layer-view__body">
          ${l.purpose ? `
            <div class="wf-view-field">
              <span class="wf-view-label">Purpose</span>
              <span class="wf-view-value">${escHtml(l.purpose)}</span>
            </div>` : ''}
          ${l.inputs ? `
            <div class="wf-view-field">
              <span class="wf-view-label">Inputs</span>
              <span class="wf-view-value">${escHtml(fmtArr(l.inputs))}</span>
            </div>` : ''}
          ${l.outputs ? `
            <div class="wf-view-field">
              <span class="wf-view-label">Outputs</span>
              <span class="wf-view-value">${escHtml(fmtArr(l.outputs))}</span>
            </div>` : ''}
          ${l.prompt || this._screenDesign ? `
            <div class="wf-view-field">
              <span class="wf-view-label">Prompt</span>
              <pre class="wf-view-prompt">${escHtml(this._getDisplayPrompt(l))}</pre>
            </div>` : ''}
          ${!l.purpose && !l.inputs && !l.outputs && !l.prompt
            ? '<span class="wf-view-empty">No details added yet — click edit to fill in.</span>' : ''}
        </div>
      </div>`;
  }

  _layerEditFormHtml(l) {
    const v = l || {};
    const plOpts = this._projectLayers.map(pl =>
      `<option value="${pl.id}" ${v.project_layer_id === pl.id ? 'selected' : ''}>${escHtml(pl.name)}</option>`
    ).join('');
    const layerField = this._projectLayers.length
      ? `<select class="wf-input wf-select" data-f="project_layer_id">
           <option value="">— Select layer —</option>
           ${plOpts}
         </select>`
      : `<input class="wf-input" data-f="layer" value="${escHtml(v.layer || '')}" placeholder="e.g. Fetch PR Data">`;
    const currentStatus = v.status || 'open';
    const statusOpts = [
      ['open',         'Open'],
      ['executed',     'Executed'],
      ['failed',       'Failed'],
      ['needs_review', 'Needs Review'],
    ].map(([val, lbl]) =>
      `<option value="${val}" ${currentStatus === val ? 'selected' : ''}>${lbl}</option>`
    ).join('');
    return `
      <div class="wf-layer-edit-form" data-lid="${v.id || ''}">
        <div class="wf-field-row">
          <div class="wf-field wf-field--grow">
            <label class="wf-label">Layer</label>
            ${layerField}
          </div>
          <div class="wf-field wf-field--sm">
            <label class="wf-label">Order</label>
            <input class="wf-input" type="number" data-f="order_num" value="${v.order_num ?? (this._layers.length + 1)}" min="1">
          </div>
          <div class="wf-field wf-field--status">
            <label class="wf-label">Status</label>
            <select class="wf-input wf-select" data-f="status">${statusOpts}</select>
          </div>
        </div>
        <div class="wf-field">
          <label class="wf-label">Purpose</label>
          <input class="wf-input" data-f="purpose" value="${escHtml(v.purpose || '')}" placeholder="What does this layer do?">
        </div>
        <div class="wf-field-row">
          <div class="wf-field wf-field--grow">
            <label class="wf-label">Inputs <span class="wf-label-optional">one per line</span></label>
            <textarea class="wf-textarea wf-textarea--sm" data-f="inputs" placeholder="What goes in?">${escHtml(this._displayArrayField(v.inputs))}</textarea>
          </div>
          <div class="wf-field wf-field--grow">
            <label class="wf-label">Outputs <span class="wf-label-optional">one per line</span></label>
            <textarea class="wf-textarea wf-textarea--sm" data-f="outputs" placeholder="What comes out?">${escHtml(this._displayArrayField(v.outputs))}</textarea>
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
    const plOpts = this._projectLayers.map(pl =>
      `<option value="${pl.id}">${escHtml(pl.name)}</option>`
    ).join('');
    const layerField = this._projectLayers.length
      ? `<select class="wf-input wf-select" id="wfNLLayer">
           <option value="">— Select layer —</option>
           ${plOpts}
         </select>`
      : `<input class="wf-input" id="wfNLName" placeholder="e.g. Fetch PR Data">`;
    return `
      <div class="wf-layer-edit-form wf-layer-edit-form--new" id="wfNewLayerForm">
        <div class="wf-field-row">
          <div class="wf-field wf-field--grow">
            <label class="wf-label">Layer</label>
            ${layerField}
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
            <label class="wf-label">Inputs <span class="wf-label-optional">one per line</span></label>
            <textarea class="wf-textarea wf-textarea--sm" id="wfNLInputs" placeholder="What goes in?"></textarea>
          </div>
          <div class="wf-field wf-field--grow">
            <label class="wf-label">Outputs <span class="wf-label-optional">one per line</span></label>
            <textarea class="wf-textarea wf-textarea--sm" id="wfNLOutputs" placeholder="What comes out?"></textarea>
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
  // Prompt builders — screen design injected for all layers
  // ----------------------------------------------------------------
  _screenRule() {
    return `Rule: This screen is the UI reference for this workflow. Use it to understand the feature's data requirements, user interactions, and visual expectations. For UI layers, match the layout, components, and styles shown. For other layers, derive the data contracts and API shapes from what the screen displays and the interactions it supports.`;
  }

  // Full prompt sent to the AI (actual HTML or file path)
  _buildLayerPrompt(layer) {
    const base = layer.prompt ||
      `Execute workflow layer: ${layer.layer}\n\nPurpose: ${layer.purpose || ''}\nInputs: ${layer.inputs || ''}\nExpected outputs: ${layer.outputs || ''}`;

    const isUiShellFirstLayer =
      this._activeWorkflow?.workflow_type === 'ui_shell' &&
      this._layers[0]?.id === layer.id;

    if (!this._screenDesign || !isUiShellFirstLayer) return base;

    const screenRef = this._screenFilePath
      ? `See file: ${this._screenFilePath}`
      : this._screenDesign.html_content;

    return `## Linked Screen Design: "${this._screenDesign.title || 'Screen'}"
${screenRef}

---
${this._screenRule()}

---

${base}`;
  }

  // Display prompt shown in the UI (abbreviates inline HTML to a char count)
  _getDisplayPrompt(layer) {
    const base = layer.prompt || `Execute workflow layer: ${layer.layer}\n\nPurpose: ${layer.purpose || ''}\nInputs: ${layer.inputs || ''}\nExpected outputs: ${layer.outputs || ''}`;

    const isUiShellFirstLayer =
      this._activeWorkflow?.workflow_type === 'ui_shell' &&
      this._layers[0]?.id === layer.id;

    if (!this._screenDesign || !isUiShellFirstLayer) return base;

    const screenRef = this._screenFilePath
      ? `See file: ${this._screenFilePath}`
      : `[HTML content — ${(this._screenDesign.html_content || '').length.toLocaleString()} chars, sent inline]`;

    return `## Linked Screen Design: "${this._screenDesign.title || 'Screen'}"
${screenRef}

---
${this._screenRule()}

---

${base}`;
  }

  // ----------------------------------------------------------------
  // Run a single layer
  // ----------------------------------------------------------------
  async _startLayerRun(layerId) {
    const layer = this._layers.find(l => l.id === layerId);
    if (!layer) return;

    if (!this._aiModelConfig) {
      await Dialog.alert('No AI model configured. Select a model in the header before running.');
      return;
    }

    const projectLayer = layer.project_layer_id
      ? this._projectLayers.find(pl => pl.id === layer.project_layer_id)
      : null;

    // CLI runs inside a folder — block if no folder path is configured.
    const isCli = !['anthropic', 'ollama', 'api'].includes(this._aiModelConfig?.type);
    if (isCli) {
      if (!projectLayer) {
        await Dialog.alert(
          `"${layer.layer}" is not linked to a Project Layer.\n\n` +
          `Go to Project Home → Layers, link this workflow layer to a Project Layer, ` +
          `and set its Folder Path so the CLI knows which directory to run in.`
        );
        return;
      }
      if (!projectLayer.folder_path) {
        await Dialog.alert(
          `No folder path is set for the "${projectLayer.name}" Project Layer.\n\n` +
          `Go to Project Home → Layers, select "${projectLayer.name}", ` +
          `and set the Folder Path so the CLI knows which directory to run in.`
        );
        return;
      }
    }

    const cwd = projectLayer?.folder_path || this._project?.project_path || null;

    window.app.openWorkflowWindow({
      projectId:    this._projectId,
      workflowId:   this._activeId,
      modelConfig:  this._aiModelConfig,
      startLayerId: layerId,
      cwd,
    });
  }

  // ----------------------------------------------------------------
  // CRUD — Workflows
  // ----------------------------------------------------------------
  _addWorkflow() {
    document.querySelector('.wf-add-modal-overlay')?.remove();

    const pagesOptions = this._pages.map(p =>
      `<option value="${p.id}">${escHtml(p.title || 'Untitled')}</option>`
    ).join('');

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
          ${this._pages.length ? `
          <div class="wf-field">
            <label class="wf-label">Page <span class="wf-label-optional">(optional)</span></label>
            <select class="wf-input wf-select" id="wfModalPage">
              <option value="">— None —</option>
              ${pagesOptions}
            </select>
          </div>` : ''}
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
      const description      = overlay.querySelector('#wfModalDesc')?.value.trim() || null;
      const pageVal          = overlay.querySelector('#wfModalPage')?.value;
      const screen_design_id = pageVal ? +pageVal : null;
      close();
      const wf = await window.db.workflows.create({ project_id: this._projectId, feature, description, screen_design_id });
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
    const feature  = this.container.querySelector('#wfEFeature')?.value.trim();
    const desc     = this.container.querySelector('#wfEDesc')?.value.trim();
    if (!feature) return;
    const pageVal          = this.container.querySelector('#wfEPage')?.value;
    const screen_design_id = pageVal ? +pageVal : null;
    const status           = this.container.querySelector('#wfEStatus')?.value || 'open';
    await window.db.workflows.update({ id: wf.id, feature, description: desc, screen_design_id });
    if (status !== (wf.status || 'open')) {
      await window.db.workflows.updateStatus({ id: wf.id, status });
    }
    const idx = this._workflows.findIndex(w => w.id === wf.id);
    if (idx >= 0) {
      this._workflows[idx].feature          = feature;
      this._workflows[idx].description      = desc;
      this._workflows[idx].screen_design_id = screen_design_id;
      this._workflows[idx].status           = status;
    }
    this._editingWf = false;
    this._renderList();
    this._renderDetail();
  }

  async _deleteWorkflow(id = this._activeId) {
    const wf = this._workflows.find(w => w.id === id);
    if (!wf) return;
    if (!await Dialog.confirm(`Delete workflow "${wf.feature}"? This also deletes all its layers and criteria.`, { confirmText: 'Delete', danger: true })) return;
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
  // Array field helpers (inputs / outputs stored as JSON arrays)
  // ----------------------------------------------------------------
  _parseArrayField(str) {
    if (!str) return [];
    return str.split('\n').map(s => s.trim()).filter(Boolean);
  }

  _displayArrayField(val) {
    if (!val) return '';
    try {
      const arr = JSON.parse(val);
      return Array.isArray(arr) ? arr.join('\n') : String(arr);
    } catch {
      return String(val);
    }
  }

  // ----------------------------------------------------------------
  // CRUD — Layers
  // ----------------------------------------------------------------
  async _saveEditedLayer(form) {
    const id       = +form.dataset.lid;
    const existing = this._layers.find(l => l.id === id);
    if (!existing) return;

    const plSelect = form.querySelector('[data-f="project_layer_id"]');
    const project_layer_id = plSelect ? (+plSelect.value || null) : undefined;
    const layerName = plSelect
      ? (this._projectLayers.find(pl => pl.id === project_layer_id)?.name || existing.layer)
      : (form.querySelector('[data-f="layer"]')?.value.trim() || existing.layer);

    const data = {
      id,
      layer:     layerName,
      order_num: +form.querySelector('[data-f="order_num"]')?.value || existing.order_num,
      purpose:   form.querySelector('[data-f="purpose"]')?.value.trim()  ?? existing.purpose,
      inputs:    this._parseArrayField(form.querySelector('[data-f="inputs"]')?.value),
      outputs:   this._parseArrayField(form.querySelector('[data-f="outputs"]')?.value),
      prompt:    form.querySelector('[data-f="prompt"]')?.value.trim()   ?? existing.prompt,
      status:    form.querySelector('[data-f="status"]')?.value          ?? existing.status,
    };
    if (plSelect) data.project_layer_id = project_layer_id;

    await window.db.layers.update(data);
    Object.assign(existing, data);
    this._layers.sort((a, b) => a.order_num - b.order_num);
    this._editingId = null;
    this._refreshLayersTab();
  }

  async _saveNewLayer() {
    const isDropdown   = !!this._projectLayers.length;
    const plSelect     = this.container.querySelector('#wfNLLayer');
    const project_layer_id = isDropdown ? (+plSelect?.value || null) : null;
    const layerName    = isDropdown
      ? (this._projectLayers.find(pl => pl.id === project_layer_id)?.name || '')
      : (this.container.querySelector('#wfNLName')?.value.trim() || '');
    if (!layerName) return;

    const order = +(this.container.querySelector('#wfNLOrder')?.value) || (this._layers.length + 1);
    const layer = await window.db.layers.create({
      workflow_id:      this._activeId,
      project_layer_id,
      layer:            layerName,
      order_num:        order,
      purpose:          this.container.querySelector('#wfNLPurpose')?.value.trim() || '',
      inputs:           this._parseArrayField(this.container.querySelector('#wfNLInputs')?.value),
      outputs:          this._parseArrayField(this.container.querySelector('#wfNLOutputs')?.value),
      prompt:           this.container.querySelector('#wfNLPrompt')?.value.trim()  || '',
    });
    this._layers.push(layer);
    this._layers.sort((a, b) => a.order_num - b.order_num);
    this._addingLayer = false;

    const wf = this._workflows.find(w => w.id === this._activeId);
    if (wf && (wf.status || 'open') === 'completed') {
      await window.db.workflows.updateStatus({ id: wf.id, status: 'in_progress' });
      wf.status = 'in_progress';
      this._renderList();
    }

    this._refreshLayersTab();
  }

  async _deleteLayer(id) {
    const l = this._layers.find(x => x.id === id);
    if (!l || !await Dialog.confirm(`Delete layer "${l.layer}"?`, { confirmText: 'Delete', danger: true })) return;
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
    if (!c || !await Dialog.confirm(`Delete this criterion?`, { confirmText: 'Delete', danger: true })) return;
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
        this.router.navigate('project-home', { projectId: this._projectId });
      });

    this.container.querySelector('#wfBtnAdd')
      ?.addEventListener('click', () => this._addWorkflow());

    this.container.querySelector('#wfBtnGenerate')
      ?.addEventListener('click', () => {
        this.router.navigate('generate-workflows', {
          projectId:   this._projectId,
          modelConfig: this._aiModelConfig,
        });
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
        this._viewingId     = null;
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
      list.querySelectorAll('[data-action="view-layer"]').forEach(el => {
        el.addEventListener('click', e => {
          if (e.target.closest('button')) return;
          const id = +el.dataset.lid;
          this._viewingId   = this._viewingId === id ? null : id;
          this._editingId   = null;
          this._addingLayer = false;
          this._refreshLayersTab();
        });
      });
      list.querySelectorAll('.wf-run-btn').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); this._startLayerRun(+btn.dataset.lid); });
      });
      list.querySelectorAll('.wf-edit-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          this._editingId   = +btn.dataset.lid;
          this._viewingId   = null;
          this._addingLayer = false;
          this._refreshLayersTab();
        });
      });
      list.querySelectorAll('.wf-del-btn').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); this._deleteLayer(+btn.dataset.lid); });
      });
      list.querySelectorAll('.wf-copy-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const layer = this._layers.find(l => l.id === +btn.dataset.lid);
          if (!layer) return;
          const fmtArr = v => { try { const a = JSON.parse(v); return Array.isArray(a) ? a.join('\n') : v; } catch { return v || ''; } };
          const text = [
            `Purpose:\n${layer.purpose || ''}`,
            `Inputs:\n${fmtArr(layer.inputs)}`,
            `Outputs:\n${fmtArr(layer.outputs)}`,
            `Prompt:\n${layer.prompt || ''}`,
          ].join('\n\n');
          const clipIcon = btn.innerHTML;
          navigator.clipboard.writeText(text).then(() => {
            btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <polyline points="2 8 6 12 14 4" stroke="currentColor" stroke-width="1.8"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`;
            btn.classList.add('wf-copy-btn--copied');
            btn.title = 'Copied!';
            setTimeout(() => {
              btn.innerHTML = clipIcon;
              btn.classList.remove('wf-copy-btn--copied');
              btn.title = 'Copy Purpose / Inputs / Outputs / Prompt';
            }, 1500);
          });
        });
      });
      list.querySelectorAll('.wf-collapse-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          this._viewingId   = null;
          this._editingId   = null;
          this._refreshLayersTab();
        });
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

  // ----------------------------------------------------------------
  // Mockup preview window
  // ----------------------------------------------------------------
  async _openMockupPreview(pageId) {
    const page = (this._pages || []).find(p => p.id === pageId);
    if (!page) return;
    const screen = await window.db.screenDesigns.get(pageId);
    if (!screen?.html_content) {
      await Dialog.alert(`No mockup has been generated for "${page.title || 'this page'}" yet.`);
      return;
    }
    window.app.openMockupPreview({ title: page.title || 'Mockup', htmlContent: screen.html_content });
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
