import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelConfigsModal } from '../../components/model-configs/model-configs-modal.js';
import { ModelPicker }       from '../../components/model-picker/model-picker.js';
import { GitController } from '../../components/git/git-controller.js';

const STATUS_META = {
  open:        { label: 'Open',        cls: 'is-status--open'        },
  in_progress: { label: 'In Progress', cls: 'is-status--in-progress' },
  resolved:    { label: 'Resolved',    cls: 'is-status--resolved'    },
  closed:      { label: 'Closed',      cls: 'is-status--closed'      },
  wont_fix:    { label: "Won't Fix",   cls: 'is-status--wont-fix'    },
};

const SEVERITY_META = {
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
    this._filterStatus  = '';
    this._aiModelConfig = null;
    this._deepItemId         = params.itemId ?? null;
    this._collapsedStatuses  = new Set(['resolved', 'closed', 'wont_fix']);
  }

  async mount() {
    injectCss('pages/user-stories/user-stories.css');
    injectCss('pages/extract-user-stories/extract-user-stories-page.css');
    injectCss('pages/issues/issues-page.css');
    applyStoredTheme();

    this._project = await window.db.projects.get(this._projectId);
    this.container.innerHTML = this._template();

    this._modelConfigsModal = new ModelConfigsModal({ onConfigsChanged: () => this._picker.reload() });
    this._modelConfigsModal.mount();
    this._picker = new ModelPicker({
      anchor:   this.container.querySelector('#isModelPicker'),
      onSelect: model => { this._aiModelConfig = model; },
    });
    await this._picker.reload();


    this._git = new GitController({
      getTermCwd:           () => this._project?.project_path || '',
      gitBtnId:             'isBtnGit',
      gitBadgeId:           'isGitBadge',
      controlBtnVisibility: false,
    });
    this._git.mount();

    this._bindHeaderEvents();
    if (this._project?.project_path) {
      this._setHeaderFolderPath(this._project.project_path);
      this._git.refreshStatus();
      this._git.startPoll();
    }
    this._initResizable();
    await this._loadIssues();
  }

  unmount() {
    removeCss('pages/issues/issues-page.css');
    removeCss('pages/extract-user-stories/extract-user-stories-page.css');
    this._picker?.unmount();
    removeCss('pages/user-stories/user-stories.css');
    this._git?.stopPoll();
  }

  // ----------------------------------------------------------------
  // Template — 4-panel layout
  // Features 15% | Stories 20% | Issues List 25% | Detail flex:1
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
          <div class="project-page__folder-display" id="headerFolderDisplay" title="Select folder">
            <div class="project-page__folder-pill">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                  stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              </svg>
              <span class="project-page__folder-text" id="headerFolderText">Select folder</span>
            </div>
          </div>
          <div class="project-page__header-actions" style="-webkit-app-region:no-drag;">
            <div class="project-page__model-group">
              <div id="isModelPicker"></div>
              <button class="project-page__model-cfg-btn" id="isBtnModelConfigs" title="Configure AI models">
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
                    stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <button class="project-page__git-btn" id="isBtnGit" title="Git (opens User Stories)">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
                <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <span class="project-page__git-badge" id="isGitBadge" hidden></span>
            </button>
          </div>
        </header>

        <div class="project-page__workspace">

          <!-- Panel 1: Issues list -->
          <aside class="project-panel" id="isPanelIssuesList">
            <div class="project-related__section-hd">
              <span class="project-related__section-label">Issues</span>
              <span class="project-related__section-count" id="isIssueCount">0</span>
              <select class="is-header-select is-section-filter" id="isStatusFilter" title="Filter by status">
                <option value="">All</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
                <option value="wont_fix">Won't Fix</option>
              </select>
              <button class="is-add-btn" id="isBtnAdd" title="Add issue" aria-label="Add issue">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <div class="project-related__section-body" id="isIssuesList">
              <div class="project-related__empty">No issues</div>
            </div>
          </aside>

          <div class="project-panel__resize" data-resize="is-issues"></div>

          <!-- Panel 4: Issue detail — flex:1 -->
          <section class="project-panel project-panel--detail" id="isPanelDetail">
            <div class="project-panel__header">
              <span class="project-panel__title">Issue Detail</span>
              <div class="project-panel__header-actions" id="isDetailHeaderActions"></div>
            </div>
            <div class="project-panel__content" id="isIssueDetail">
              <div class="project-panel__empty">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p>Select an issue or add a new one</p>
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

  _setHeaderFolderPath(folderPath) {
    const text    = this.container.querySelector('#headerFolderText');
    const display = this.container.querySelector('#headerFolderDisplay');
    if (!text || !display) return;
    text.textContent = folderPath;
    display.classList.add('project-page__folder-display--active');
  }

  _bindHeaderEvents() {
    this.container.querySelector('#isBtnBack')
      .addEventListener('click', () => this.router.navigate('project-home', { projectId: this._projectId }));

    this.container.querySelector('#isBtnModelConfigs')
      .addEventListener('click', () => this._modelConfigsModal.show());


    this.container.querySelector('#headerFolderDisplay')
      .addEventListener('click', async () => {
        const folderPath = await window.db.dialog.openFolder();
        if (!folderPath) return;
        await window.db.projects.setPath({ id: this._projectId, project_path: folderPath });
        if (this._project) this._project.project_path = folderPath;
        this._setHeaderFolderPath(folderPath);
        this._git.refreshStatus();
        this._git.startPoll();
      });

    this.container.querySelector('#isBtnGit')
      .addEventListener('click', () =>
        this.router.navigate('git-changes', { projectId: this._projectId, from: 'issues' }));

    this.container.querySelector('#isBtnAdd')
      .addEventListener('click', () => this._showAddForm());

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
    const filters = { project_id: this._projectId };
    if (this._filterStatus) filters.status = this._filterStatus;

    this._issues = await window.db.issues.list(filters);
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
      listEl.innerHTML = `<div class="project-related__empty">No issues</div>`;
      return;
    }

    // Group by status (preserving STATUS_META order)
    const groups = {};
    for (const key of Object.keys(STATUS_META)) groups[key] = [];
    for (const issue of this._issues) {
      const k = issue.status || 'open';
      (groups[k] ?? (groups['open'] ??= [])).push(issue);
    }

    // Ensure active issue's group is never collapsed
    if (this._activeId) {
      const active = this._issues.find(i => i.id === this._activeId);
      if (active) this._collapsedStatuses.delete(active.status || 'open');
    }

    const chevron = (open) => `
      <svg class="is-acc__chevron${open ? ' is-acc__chevron--open' : ''}"
           width="10" height="10" viewBox="0 0 12 12" fill="none">
        <path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.6"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;

    listEl.innerHTML = Object.entries(STATUS_META).map(([status, meta]) => {
      const items = groups[status];
      if (!items?.length) return '';
      const open = !this._collapsedStatuses.has(status);
      return `
        <div class="is-acc" data-status="${status}">
          <button class="is-acc__hd" data-status="${status}">
            ${chevron(open)}
            <span class="is-acc__label">${meta.label}</span>
            <span class="is-acc__count">${items.length}</span>
          </button>
          <div class="is-acc__body${open ? '' : ' is-acc__body--collapsed'}">
            ${items.map(issue => this._issueItemHtml(issue)).join('')}
          </div>
        </div>`;
    }).join('');

    // Accordion toggles
    listEl.querySelectorAll('.is-acc__hd').forEach(hd => {
      hd.addEventListener('click', () => {
        const status  = hd.dataset.status;
        const body    = hd.nextElementSibling;
        const ch      = hd.querySelector('.is-acc__chevron');
        const open    = !this._collapsedStatuses.has(status);
        if (open) {
          this._collapsedStatuses.add(status);
          body.classList.add('is-acc__body--collapsed');
          ch.classList.remove('is-acc__chevron--open');
        } else {
          this._collapsedStatuses.delete(status);
          body.classList.remove('is-acc__body--collapsed');
          ch.classList.add('is-acc__chevron--open');
        }
      });
    });

    // Issue item events
    listEl.querySelectorAll('.eus-src-item').forEach(item => {
      const id = parseInt(item.dataset.id);
      item.addEventListener('click', () => this._selectIssue(id));
      item.querySelector('.eus-story-action--delete')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this._deleteIssue(id);
      });
    });
  }

  _issueItemHtml(issue) {
    const sv = SEVERITY_META[issue.severity] || SEVERITY_META.medium;
    return `
      <div class="eus-src-item${issue.id === this._activeId ? ' eus-src-item--active' : ''}" data-id="${issue.id}">
        <span class="is-sev-dot is-sev-dot--${issue.severity || 'medium'}" title="${sv.label}"></span>
        <div class="eus-src-item__info">
          <span class="eus-src-item__id">#${issue.id}</span>
          <span class="eus-src-item__title">${escHtml(issue.title)}</span>
        </div>
        <div class="eus-src-item__actions">
          <button class="eus-story-action eus-story-action--delete" title="Delete" aria-label="Delete">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8M5.5 6v4M8.5 6v4"
                stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  _selectIssue(id) {
    this._activeId = id;
    this.container.querySelectorAll('#isIssuesList .eus-src-item').forEach(c =>
      c.classList.toggle('eus-src-item--active', parseInt(c.dataset.id) === id)
    );
    const issue = this._issues.find(i => i.id === id);
    if (issue) this._showEditForm(issue);
  }

  async _deleteIssue(id) {
    const ok = await this._showConfirm('Delete this issue?', 'Delete');
    if (!ok) return;
    await window.db.issues.delete(id);
    if (this._activeId === id) { this._activeId = null; this._showEmptyDetail(); }
    await this._loadIssues();
  }

  // ----------------------------------------------------------------
  // Detail panel (Panel 4)
  // ----------------------------------------------------------------
  _showEmptyDetail() {
    const el = this.container.querySelector('#isIssueDetail');
    if (!el) return;
    el.innerHTML = `
      <div class="project-panel__empty">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>Select an issue or add a new one</p>
      </div>
    `;
    const headerActions = this.container.querySelector('#isDetailHeaderActions');
    if (headerActions) headerActions.innerHTML = '';
  }

  async _showAddForm() {
    this._activeId = null;
    this.container.querySelectorAll('#isIssuesList .eus-src-item').forEach(c => c.classList.remove('eus-src-item--active'));
    const el       = this.container.querySelector('#isIssueDetail');
    const features = await window.db.features.list(this._projectId) ?? [];
    el.innerHTML   = this._formHtml(null, features);
    const headerActions = this.container.querySelector('#isDetailHeaderActions');
    if (headerActions) headerActions.innerHTML = '<button class="is-form__btn" id="isFormSave">Add Issue</button>';
    await this._bindFormEvents(el, null);
    el.querySelector('#isFormTitle')?.focus();
  }

  async _showEditForm(issue) {
    const el       = this.container.querySelector('#isIssueDetail');
    const features = await window.db.features.list(this._projectId) ?? [];
    el.innerHTML   = this._formHtml(issue, features);
    const headerActions = this.container.querySelector('#isDetailHeaderActions');
    if (headerActions) headerActions.innerHTML = '<button class="is-form__btn" id="isFormSave">Save Changes</button>';
    await this._bindFormEvents(el, issue);
  }

  // ----------------------------------------------------------------
  // Form
  // ----------------------------------------------------------------
  _formHtml(issue, features = []) {
    const isEdit = !!issue;
    const statusOptions = Object.entries(STATUS_META).map(([val, m]) =>
      `<option value="${val}"${(issue?.status ?? 'open') === val ? ' selected' : ''}>${m.label}</option>`
    ).join('');
    const severityOptions = Object.entries(SEVERITY_META).map(([val, m]) =>
      `<option value="${val}"${(issue?.severity ?? 'medium') === val ? ' selected' : ''}>${m.label}</option>`
    ).join('');
    const featureOptions = features.map(f =>
      `<option value="${f.id}"${issue?.feature_id === f.id ? ' selected' : ''}>${escHtml(f.name)}</option>`
    ).join('');

    return `
      <div class="is-form">
        <div class="is-form__header">
          <h2 class="is-form__heading">${isEdit ? 'Edit Issue' : 'Add Issue'}</h2>
          <select class="is-header-select" id="isFormStatus">${statusOptions}</select>
        </div>

        <div class="is-form__body">

          <div class="is-form__field">
            <label class="is-form__label" for="isFormTitle">Title <span class="is-form__required">*</span></label>
            <input class="is-form__input" id="isFormTitle" type="text" maxlength="200"
              placeholder="Describe the issue…" autocomplete="off" value="${escHtml(issue?.title || '')}"/>
          </div>

          <div class="is-form__field">
            <label class="is-form__label" for="isFormSeverity">Severity</label>
            <select class="is-form__select" id="isFormSeverity">${severityOptions}</select>
          </div>

          <div class="is-form__row">
            <div class="is-form__field">
              <label class="is-form__label" for="isFormFeature">Feature <span class="is-form__label-opt">(optional)</span></label>
              <select class="is-form__select" id="isFormFeature">
                <option value="">— none —</option>
                ${featureOptions}
              </select>
            </div>
            <div class="is-form__field">
              <label class="is-form__label" for="isFormStoryLink">User Story <span class="is-form__label-opt">(optional)</span></label>
              <select class="is-form__select" id="isFormStoryLink" ${issue?.feature_id ? '' : 'disabled'}>
                <option value="">— select feature first —</option>
              </select>
            </div>
          </div>

          <div class="is-form__field">
            <label class="is-form__label" for="isFormDesc">Description</label>
            <textarea class="is-form__textarea" id="isFormDesc" rows="5"
              placeholder="What is the issue about?">${escHtml(issue?.description || '')}</textarea>
          </div>

          <div class="is-form__field">
            <label class="is-form__label" for="isFormSteps">Steps to Reproduce</label>
            <textarea class="is-form__textarea is-form__textarea--steps" id="isFormSteps" rows="8"
              placeholder="1. Navigate to…&#10;2. Click…&#10;3. Observe…">${escHtml(issue?.steps_to_reproduce || '')}</textarea>
          </div>

          <div class="is-form__field">
            <label class="is-form__label" for="isFormExpected">Expected Behavior</label>
            <textarea class="is-form__textarea" id="isFormExpected" rows="6"
              placeholder="The system should…">${escHtml(issue?.expected_behavior || '')}</textarea>
          </div>

          <div class="is-form__field">
            <label class="is-form__label is-form__label--actual" for="isFormActual">
              Actual Behavior
              <span class="is-form__label-hint">(what actually happens)</span>
            </label>
            <textarea class="is-form__textarea" id="isFormActual" rows="6"
              placeholder="What actually happened…">${escHtml(issue?.actual_behavior || '')}</textarea>
          </div>

        </div>
      </div>
    `;
  }

  async _bindFormEvents(el, issue) {
    const titleEl    = el.querySelector('#isFormTitle');
    const severityEl = el.querySelector('#isFormSeverity');
    const statusEl   = el.querySelector('#isFormStatus');
    const featureEl  = el.querySelector('#isFormFeature');
    const storyEl    = el.querySelector('#isFormStoryLink');
    const descEl     = el.querySelector('#isFormDesc');
    const stepsEl    = el.querySelector('#isFormSteps');
    const expectedEl = el.querySelector('#isFormExpected');
    const actualEl   = el.querySelector('#isFormActual');
    const saveBtn    = this.container.querySelector('#isFormSave');

    if (issue) {
      statusEl.addEventListener('change', async () => {
        await window.db.issues.update({ id: issue.id, status: statusEl.value });
        this._refreshCardBadges(issue.id, statusEl.value, severityEl.value);
      });
    }

    const loadStories = async (featureId, preselectId = null) => {
      if (!featureId) {
        storyEl.innerHTML = '<option value="">— none —</option>';
        storyEl.disabled  = true;
        return;
      }
      const stories = await window.db.userStories.list({ feature_id: featureId }) ?? [];
      storyEl.innerHTML = '<option value="">— none —</option>' +
        stories.map(s =>
          `<option value="${s.id}"${s.id === preselectId ? ' selected' : ''}>${escHtml(s.title)}</option>`
        ).join('');
      storyEl.disabled = stories.length === 0;
    };

    featureEl.addEventListener('change', () => loadStories(parseInt(featureEl.value) || null));

    if (issue?.feature_id) {
      await loadStories(issue.feature_id, issue.user_story_id ?? null);
    }

    const save = async () => {
      const title = titleEl.value.trim();
      if (!title) { titleEl.classList.add('is-form__input--error'); titleEl.focus(); return; }
      titleEl.classList.remove('is-form__input--error');
      saveBtn.disabled    = true;
      saveBtn.textContent = issue ? 'Saving…' : 'Adding…';

      const payload = {
        project_id:         this._projectId,
        feature_id:         parseInt(featureEl.value)  || null,
        user_story_id:      parseInt(storyEl.value)    || null,
        title,
        description:        descEl.value.trim()        || null,
        steps_to_reproduce: stepsEl.value.trim()       || null,
        expected_behavior:  expectedEl.value.trim()    || null,
        actual_behavior:    actualEl.value.trim()       || null,
        status:             statusEl.value,
        severity:           severityEl.value,
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
          this._selectIssue(created.id);
        }
      } catch {
        saveBtn.disabled    = false;
        saveBtn.textContent = issue ? 'Save Changes' : 'Add Issue';
      }
    };

    saveBtn.addEventListener('click', save);
    el.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 's') { e.preventDefault(); save(); } });
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
      dot.title     = (SEVERITY_META[severity] || SEVERITY_META.medium).label;
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
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
    });
  }
}
