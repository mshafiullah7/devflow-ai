import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelPicker }       from '../../components/model-picker/model-picker.js';

const STATUS_META = {
  open:        { label: 'Open',        cls: 'is-status--open'        },
  in_progress: { label: 'In Progress', cls: 'is-status--in-progress' },
  resolved:    { label: 'Resolved',    cls: 'is-status--resolved'    },
  closed:      { label: 'Closed',      cls: 'is-status--closed'      },
  wont_fix:    { label: "Won't Fix",   cls: 'is-status--wont-fix'    },
};

const PRIORITY_META = {
  critical: { label: 'Critical', cls: 'is-severity--critical' },
  high:     { label: 'High',     cls: 'is-severity--high'     },
  medium:   { label: 'Medium',   cls: 'is-severity--medium'   },
  low:      { label: 'Low',      cls: 'is-severity--low'      },
};

export class IssuesPage {
  constructor(container, params, router) {
    this.container      = container;
    this.router         = router;
    this._projectId     = params.projectId;
    this._project       = null;
    this._issues        = [];
    this._activeId      = null;
    this._filterStatus  = 'open_and_in_progress';
    this._aiModelConfig = null;
    this._deepItemId          = params.itemId ?? null;
    this._pendingSave         = null;
    this._formAbortController = null;
    this._layers              = [];
  }

  async mount() {
    injectCss('pages/user-stories/user-stories.css');
    injectCss('pages/extract-user-stories/extract-user-stories-page.css');
    injectCss('pages/issues/issues-page.css');
    applyStoredTheme();

    let _mapping;
    [this._project, _mapping, this._layers] = await Promise.all([
      window.db.projects.get(this._projectId),
      window.db.modelMapping.get('issues'),
      window.db.projectLayers.list(this._projectId),
    ]);
    this.container.innerHTML = this._template();

    this._picker = new ModelPicker({
      anchor:    this.container.querySelector('#isModelPicker'),
      onSelect:  model => { this._aiModelConfig = model; },
      initialId: _mapping?.model_config_id ?? null,
    });
    await this._picker.reload();

    this._bindHeaderEvents();
    this._initResizable();
    await this._loadIssues();

    // Refresh list whenever the main window regains focus so that status
    // changes made in Issue Runner (a separate BrowserWindow) are reflected
    // without needing to navigate away and back.
    this._lastLoadTime = Date.now();
    this._onWindowFocus = () => {
      if (Date.now() - this._lastLoadTime > 2000) this._loadIssues();
    };
    window.addEventListener('focus', this._onWindowFocus);
  }

  unmount() {
    const fn = this._pendingSave;
    this._pendingSave = null;
    if (fn) fn();
    if (this._onWindowFocus) {
      window.removeEventListener('focus', this._onWindowFocus);
      this._onWindowFocus = null;
    }
    removeCss('pages/issues/issues-page.css');
    removeCss('pages/extract-user-stories/extract-user-stories-page.css');
    this._picker?.unmount();
    removeCss('pages/user-stories/user-stories.css');
  }

  // ----------------------------------------------------------------
  // Template — 2-panel layout: List | Detail
  // ----------------------------------------------------------------
  _template() {
    const name = this._project ? escHtml(this._project.name) : 'Project';
    return `
      <div class="project-page">

        <header class="project-page__header">
          <button class="project-page__back" id="isBtnBack" aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="project-page__title-group">
            <h1 class="project-page__title">${name}</h1>
            <p class="project-page__desc">Issues</p>
          </div>
          <div class="project-page__header-actions" style="-webkit-app-region:no-drag;">
            <div class="project-page__model-group">
              <div id="isModelPicker"></div>
            </div>
            <button class="project-page__git-btn is-queue-btn--labeled" id="isBtnRunner" title="Open Issue Runner">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <path d="M5 4l11 6-11 6V4z" fill="currentColor"/>
              </svg>
              <span class="is-queue-btn__label">Run Issues</span>
            </button>
          </div>
        </header>

        <div class="project-page__workspace">

          <!-- Panel 1: List -->
          <aside class="project-panel" id="isPanelIssuesList">
            <div class="project-related__section-hd">
              <span class="project-related__section-label">Issues</span>
              <span class="project-related__section-count" id="isIssueCount">0</span>
              <select class="is-header-select is-section-filter" id="isStatusFilter" title="Filter by status">
                <option value="open_and_in_progress" selected>Open &amp; In Progress</option>
                <option value="">All</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
                <option value="wont_fix">Won't Fix</option>
              </select>
              <button class="is-add-btn is-add-btn--text" id="isBtnAddIssue" title="Add bug" aria-label="Add bug">+ Bug</button>
            </div>
            <div class="project-related__section-body" id="isIssuesList">
              <div class="project-related__empty">No items</div>
            </div>
          </aside>

          <div class="project-panel__resize" data-resize="is-issues"></div>

          <!-- Panel 2: Detail -->
          <section class="project-panel project-panel--detail" id="isPanelDetail">
            <div class="project-panel__header">
              <span class="project-panel__title">Detail</span>
              <div class="project-panel__header-actions" id="isDetailHeaderActions"></div>
            </div>
            <div class="project-panel__content" id="isIssueDetail">
              <div class="project-panel__empty">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p>Select an item or add a new one</p>
              </div>
            </div>
          </section>

        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // Header events
  // ----------------------------------------------------------------
  async _reloadModelDropdown() {
    if (this._picker) await this._picker.reload();
  }

  _bindHeaderEvents() {
    this.container.querySelector('#isBtnBack')
      .addEventListener('click', () => this.router.navigate('project-home', { projectId: this._projectId }));

    this.container.querySelector('#isBtnRunner')
      .addEventListener('click', () => {
        window.app.openIssueRunnerWindow(this._projectId);
      });

    this.container.querySelector('#isBtnAddIssue')
      .addEventListener('click', () => this._showAddForm('issue'));

    this.container.querySelector('#isStatusFilter')
      .addEventListener('change', async (e) => {
        this._filterStatus = e.target.value;
        await this._loadIssues();
      });
  }

  // ----------------------------------------------------------------
  // Issues list panel
  // ----------------------------------------------------------------
  async _loadIssues() {
    this._lastLoadTime = Date.now();
    const filters = { project_id: this._projectId };
    const isCombined = this._filterStatus === 'open_and_in_progress';
    if (this._filterStatus && !isCombined) filters.status = this._filterStatus;

    let issues = (await window.db.issues.list(filters)).filter(i => (i.type || 'issue') !== 'task');
    if (isCombined) issues = issues.filter(i => i.status === 'open' || i.status === 'in_progress');
    this._issues = issues;
    this._renderIssues();

    if (this._activeId && !this._issues.find(i => i.id === this._activeId)) {
      this._activeId = null;
      this._showEmptyDetail();
    }

    if (this._deepItemId) {
      const issue = this._issues.find(i => i.id === this._deepItemId);
      if (issue) { this._deepItemId = null; this._selectIssue(issue.id); return; }
    }

    if (!this._activeId && this._issues.length > 0) {
      this._selectIssue(this._issues[0].id);
    }
  }

  _renderIssues() {
    const listEl  = this.container.querySelector('#isIssuesList');
    const countEl = this.container.querySelector('#isIssueCount');
    if (!listEl) return;
    if (countEl) countEl.textContent = this._issues.length;

    if (this._issues.length === 0) {
      listEl.innerHTML = `<div class="project-related__empty">No items</div>`;
      return;
    }

    listEl.innerHTML = this._issues.map(issue => this._issueItemHtml(issue)).join('');

    listEl.querySelectorAll('.eus-src-item').forEach(item => {
      const id = parseInt(item.dataset.id);
      item.addEventListener('click', () => this._selectIssue(id));
    });
  }

  _issueItemHtml(issue) {
    const pv        = PRIORITY_META[issue.severity] || PRIORITY_META.medium;
    const desc      = issue.description ? escHtml(issue.description) : '';
    const status    = issue.status || 'open';
    const statusLabel = STATUS_META[status]?.label ?? status;
    return `
      <div class="eus-src-item is-list-item${issue.id === this._activeId ? ' eus-src-item--active' : ''}" data-id="${issue.id}">
        <span class="is-sev-dot is-sev-dot--${issue.severity || 'medium'}" title="${pv.label}"></span>
        <div class="eus-src-item__info is-item-info">
          <div class="is-item-title-row">
            <span class="eus-src-item__id">#${issue.id}</span>
            <span class="eus-src-item__title">${escHtml(issue.title)}</span>
          </div>
          <div class="is-item-meta-row">
            <span class="is-item-desc">${desc}</span>
          </div>
        </div>
        <span class="is-status-chip is-status-chip--${status}">${statusLabel}</span>
      </div>
    `;
  }

  async _autoSave() {
    const fn = this._pendingSave;
    this._pendingSave = null;
    if (fn) await fn();
  }

  async _selectIssue(id) {
    await this._autoSave();
    this._activeId = id;
    this.container.querySelectorAll('#isIssuesList .eus-src-item').forEach(c =>
      c.classList.toggle('eus-src-item--active', parseInt(c.dataset.id) === id)
    );
    const issue = this._issues.find(i => i.id === id);
    if (issue) this._showEditForm(issue);
  }

  async _deleteIssue(id) {
    const ok = await this._showConfirm('Delete this item?', 'Delete');
    if (!ok) return;
    await window.db.issues.delete(id);
    if (this._activeId === id) { this._activeId = null; this._showEmptyDetail(); }
    await this._loadIssues();
  }

  // ----------------------------------------------------------------
  // Detail panel
  // ----------------------------------------------------------------
  _showEmptyDetail() {
    this._pendingSave = null;
    const el = this.container.querySelector('#isIssueDetail');
    if (!el) return;
    el.innerHTML = `
      <div class="project-panel__empty">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>Select an item or add a new one</p>
      </div>
    `;
    const headerActions = this.container.querySelector('#isDetailHeaderActions');
    if (headerActions) headerActions.innerHTML = '';
  }

  async _showAddForm(type = 'issue') {
    await this._autoSave();
    this._activeId = null;
    this.container.querySelectorAll('#isIssuesList .eus-src-item').forEach(c => c.classList.remove('eus-src-item--active'));
    const el     = this.container.querySelector('#isIssueDetail');
    const layers = await window.db.projectLayers.list(this._projectId) ?? [];
    el.innerHTML = this._formHtml(null, layers, type);
    const headerActions = this.container.querySelector('#isDetailHeaderActions');
    const label = type === 'task' ? 'Add Task' : 'Add Bug';
    if (headerActions) headerActions.innerHTML = `<button class="is-form__btn" id="isFormSave">${label}</button>`;
    await this._bindFormEvents(el, null, type);
    el.querySelector('#isFormTitle')?.focus();
  }

  async _showEditForm(issue) {
    const el     = this.container.querySelector('#isIssueDetail');
    const layers = await window.db.projectLayers.list(this._projectId) ?? [];
    const type   = issue.type || 'issue';
    el.innerHTML = this._formHtml(issue, layers, type);
    const headerActions = this.container.querySelector('#isDetailHeaderActions');
    if (headerActions) headerActions.innerHTML = `
      <button class="is-form__btn" id="isFormSave">Save Changes</button>
      <button class="is-form__btn is-form__btn--danger" id="isFormDelete">Delete</button>
    `;
    await this._bindFormEvents(el, issue, type);
  }

  // ----------------------------------------------------------------
  // Form
  // ----------------------------------------------------------------
  _formHtml(issue, layers = [], type = 'issue') {
    const isEdit    = !!issue;
    const isTask    = type === 'task';
    const heading   = isEdit ? (isTask ? 'Edit Task' : 'Edit Bug') : (isTask ? 'Add Task' : 'Add Bug');
    const priorityLabel = isTask ? 'Priority' : 'Severity';

    const statusOptions = Object.entries(STATUS_META).map(([val, m]) =>
      `<option value="${val}"${(issue?.status ?? 'open') === val ? ' selected' : ''}>${m.label}</option>`
    ).join('');
    const severityOptions = Object.entries(PRIORITY_META).map(([val, m]) =>
      `<option value="${val}"${(issue?.severity ?? 'medium') === val ? ' selected' : ''}>${m.label}</option>`
    ).join('');
    const layerOptions = layers.map(l =>
      `<option value="${l.id}"${issue?.layer_id === l.id ? ' selected' : ''}>${escHtml(l.name)}</option>`
    ).join('');

    const descLabel     = isTask ? 'Description' : 'Bug Details';
    const descPlaceholder = isTask ? 'What needs to be done?' : 'What is the bug about?';

    return `
      <div class="is-form">
        <div class="is-form__header">
          <h2 class="is-form__heading">${heading}</h2>
          <select class="is-header-select" id="isFormStatus">${statusOptions}</select>
        </div>

        <div class="is-form__body">

          <div class="is-form__field">
            <label class="is-form__label" for="isFormTitle">Title <span class="is-form__required">*</span></label>
            <input class="is-form__input" id="isFormTitle" type="text" maxlength="200"
              placeholder="${isTask ? 'Describe the task…' : 'Describe the issue…'}" autocomplete="off" value="${escHtml(issue?.title || '')}"/>
          </div>

          <div class="is-form__row">
            <div class="is-form__field">
              <label class="is-form__label" for="isFormSeverity">${priorityLabel}</label>
              <select class="is-form__select" id="isFormSeverity">${severityOptions}</select>
            </div>
            <div class="is-form__field">
              <label class="is-form__label" for="isFormLayer">Layer <span class="is-form__required">*</span></label>
              <select class="is-form__select" id="isFormLayer">
                <option value="">— select layer —</option>
                ${layerOptions}
              </select>
            </div>
          </div>

          <div class="is-form__field">
            <div class="is-desc-label-row">
              <label class="is-form__label" for="isFormDesc">${descLabel}</label>
              <div class="is-desc-actions">
                <button class="is-desc-btn" id="isDescExpandBtn" type="button" title="Expand to full editor">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M9 2h5v5M7 9L14 2M2 7v7h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Expand
                </button>
              </div>
            </div>
            <textarea class="is-form__textarea" id="isFormDesc" rows="11"
              placeholder="${descPlaceholder}">${escHtml(issue?.description || '')}</textarea>
          </div>

          ${!isTask ? `
          <div class="is-form__field">
            <label class="is-form__label" for="isFormSteps">Steps to Reproduce</label>
            <textarea class="is-form__textarea is-form__textarea--steps" id="isFormSteps" rows="4"
              placeholder="1. Navigate to…&#10;2. Click…&#10;3. Observe…">${escHtml(issue?.steps_to_reproduce || '')}</textarea>
          </div>

          <div class="is-form__field">
            <label class="is-form__label" for="isFormExpected">Expected Behavior</label>
            <textarea class="is-form__textarea" id="isFormExpected" rows="3"
              placeholder="The system should…">${escHtml(issue?.expected_behavior || '')}</textarea>
          </div>

          <div class="is-form__field">
            <label class="is-form__label is-form__label--actual" for="isFormActual">
              Actual Behavior
              <span class="is-form__label-hint">(what actually happens)</span>
            </label>
            <textarea class="is-form__textarea" id="isFormActual" rows="3"
              placeholder="What actually happened…">${escHtml(issue?.actual_behavior || '')}</textarea>
          </div>
          ` : ''}

        </div>
      </div>
    `;
  }

  async _bindFormEvents(el, issue, type = 'issue') {
    this._formAbortController?.abort();
    this._formAbortController = new AbortController();
    const { signal } = this._formAbortController;
    const isTask      = type === 'task';
    const titleEl     = el.querySelector('#isFormTitle');
    const severityEl  = el.querySelector('#isFormSeverity');
    const statusEl    = el.querySelector('#isFormStatus');
    const layerEl     = el.querySelector('#isFormLayer');
    const descEl      = el.querySelector('#isFormDesc');
    const stepsEl     = el.querySelector('#isFormSteps');
    const expectedEl  = el.querySelector('#isFormExpected');
    const actualEl    = el.querySelector('#isFormActual');
    const saveBtn     = this.container.querySelector('#isFormSave');
    const deleteBtn   = this.container.querySelector('#isFormDelete');

    if (deleteBtn && issue) {
      deleteBtn.addEventListener('click', () => this._deleteIssue(issue.id), { signal });
    }

    if (issue) {
      statusEl.addEventListener('change', async () => {
        await window.db.issues.update({ id: issue.id, status: statusEl.value });
        this._refreshCardBadges(issue.id, statusEl.value, severityEl.value);
      });
    }

    const save = async (silent = false) => {
      const title   = titleEl.value.trim();
      const layerId = parseInt(layerEl.value) || null;
      if (!title) { if (!silent) { titleEl.classList.add('is-form__input--error'); titleEl.focus(); } return; }
      titleEl.classList.remove('is-form__input--error');
      if (!layerId) {
        if (!silent) { layerEl.classList.add('is-form__input--error'); layerEl.focus(); }
        return;
      }
      layerEl.classList.remove('is-form__input--error');
      this._pendingSave   = null;
      saveBtn.disabled    = true;
      saveBtn.textContent = issue ? 'Saving…' : (isTask ? 'Adding…' : 'Adding…');

      const payload = {
        project_id:         this._projectId,
        layer_id:           layerId,
        title,
        description:        descEl.value.trim()                    || null,
        steps_to_reproduce: stepsEl    ? stepsEl.value.trim()    || null : null,
        expected_behavior:  expectedEl ? expectedEl.value.trim() || null : null,
        actual_behavior:    actualEl   ? actualEl.value.trim()   || null : null,
        status:             statusEl.value,
        severity:           severityEl.value,
        type,
      };

      try {
        if (issue) {
          const updated = await window.db.issues.update({ id: issue.id, ...payload });
          const idx = this._issues.findIndex(i => i.id === issue.id);
          if (idx !== -1) this._issues[idx] = updated;
          this._renderIssues();
          this._selectIssue(issue.id);
        } else {
          const created = await window.db.issues.create(payload);
          this._issues.unshift(created);
          this._renderIssues();

          // Keep Layer & Priority, clear everything else, focus Title for next entry
          titleEl.value = '';
          descEl.value  = '';
          if (stepsEl)    stepsEl.value    = '';
          if (expectedEl) expectedEl.value = '';
          if (actualEl)   actualEl.value   = '';
          titleEl.classList.remove('is-form__input--error');
          layerEl.classList.remove('is-form__input--error');
          saveBtn.disabled    = false;
          saveBtn.textContent = isTask ? 'Add Task' : 'Add Bug';
          this._pendingSave   = null;
          titleEl.focus();
        }
      } catch {
        saveBtn.disabled    = false;
        saveBtn.textContent = issue ? 'Save Changes' : (isTask ? 'Add Task' : 'Add Bug');
      }
    };

    this._pendingSave = () => save(true);

    saveBtn.addEventListener('click', () => save());
    el.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 's') { e.preventDefault(); save(); } }, { signal });

    el.querySelector('#isDescExpandBtn')?.addEventListener('click', () => {
      this._openDescExpand(descEl, isTask ? 'Description' : 'Bug Details');
    });
  }

  _refreshCardBadges(id, status, severity) {
    const idx = this._issues.findIndex(i => i.id === id);
    if (idx !== -1) {
      this._issues[idx].status   = status;
      this._issues[idx].severity = severity;
    }
    const itemEl = this.container.querySelector(`#isIssuesList .eus-src-item[data-id="${id}"]`);
    if (!itemEl) return;
    const dot = itemEl.querySelector('.is-sev-dot');
    if (dot) {
      dot.className = `is-sev-dot is-sev-dot--${severity || 'medium'}`;
      dot.title     = (PRIORITY_META[severity] || PRIORITY_META.medium).label;
    }
  }

  // ----------------------------------------------------------------
  // Resizable panels
  // ----------------------------------------------------------------
  _initResizable() {
    const PANEL_MAP = {
      'is-issues': { elId: 'isPanelIssuesList', min: 180, dir: 1 },
    };

    this.container.querySelectorAll('.project-panel__resize').forEach(handle => {
      const entry = PANEL_MAP[handle.dataset.resize];
      if (!entry) return;

      handle.addEventListener('mousedown', (e) => {
        const panelEl     = this.container.querySelector(`#${entry.elId}`);
        e.preventDefault();
        const startX      = e.clientX;
        const startWidth  = panelEl.getBoundingClientRect().width;
        const parentWidth = panelEl.parentElement.getBoundingClientRect().width;

        document.body.style.userSelect = 'none';
        document.body.style.cursor     = 'col-resize';

        const onMove = (ev) => {
          const delta = (ev.clientX - startX) * entry.dir;
          const newPx = Math.max(entry.min, startWidth + delta);
          panelEl.style.flex = `0 0 ${(newPx / parentWidth) * 100}%`;
        };
        const onUp = () => {
          document.body.style.userSelect = '';
          document.body.style.cursor     = '';
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup',   onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
      });
    });
  }

  // ----------------------------------------------------------------
  // Expand overlay
  // ----------------------------------------------------------------
  _openDescExpand(textarea, title = 'Details') {
    const overlay = document.createElement('div');
    overlay.className = 'is-expand-overlay';
    overlay.innerHTML = `
      <div class="is-expand-dialog">
        <div class="is-expand-header">
          <span class="is-expand-title">${escHtml(title)}</span>
          <button class="is-expand-close" id="isExpandClose" type="button">✕</button>
        </div>
        <textarea class="is-expand-textarea" id="isExpandTa" spellcheck="true">${escHtml(textarea.value)}</textarea>
        <div class="is-expand-footer">
          <button class="is-expand-btn is-expand-btn--done" id="isExpandDone" type="button">Done</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const ta = overlay.querySelector('#isExpandTa');
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    const close = () => document.body.removeChild(overlay);
    const done  = () => { textarea.value = ta.value; close(); };
    overlay.querySelector('#isExpandDone').addEventListener('click', done);
    overlay.querySelector('#isExpandClose').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  }

  // ----------------------------------------------------------------
  // Confirm dialog
  // ----------------------------------------------------------------
  _showConfirm(message, confirmLabel = 'Delete') {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'is-confirm-overlay';
      overlay.innerHTML = `
        <div class="is-confirm-dialog">
          <p class="is-confirm-msg">${escHtml(message)}</p>
          <div class="is-confirm-btns">
            <button class="is-confirm-btn is-confirm-btn--cancel">Cancel</button>
            <button class="is-confirm-btn is-confirm-btn--ok">${escHtml(confirmLabel)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const cleanup = (r) => { overlay.remove(); resolve(r); };
      overlay.querySelector('.is-confirm-btn--cancel').addEventListener('click', () => cleanup(false));
      overlay.querySelector('.is-confirm-btn--ok').addEventListener('click',    () => cleanup(true));
    });
  }
}
