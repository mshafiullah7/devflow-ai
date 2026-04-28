import { FeatureList } from '../../components/feature-list/feature-list.js';
import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelConfigsModal } from '../../components/model-configs/model-configs-modal.js';
import { QuickCommandsModal } from '../../components/quick-commands/quick-commands-modal.js';

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
    this._activeFeature = null;
    this._stories       = [];
    this._activeStoryId = null;
    this._issues        = [];
    this._activeId      = null;
    this._filterStatus  = '';
    this._aiModelConfig = null;
  }

  async mount() {
    injectCss('pages/user-stories/user-stories.css');
    injectCss('components/feature-list/feature-list.css');
    injectCss('components/user-story-list/user-story-list.css');
    injectCss('pages/issues/issues-page.css');
    applyStoredTheme();

    this._project = await window.db.projects.get(this._projectId);
    this.container.innerHTML = this._template();

    this._modelConfigsModal = new ModelConfigsModal({ onConfigsChanged: () => this._reloadModelDropdown() });
    this._modelConfigsModal.mount();
    await this._reloadModelDropdown();

    this._qcmdModal = new QuickCommandsModal({ onRunCommand: () => this.router.navigate('user-stories', { projectId: this._projectId }) });
    this._qcmdModal.mount();

    this._bindHeaderEvents();
    this._initFeatureToggle();
    this._initResizable();
    await this._mountFeatureList();
  }

  unmount() {
    removeCss('pages/issues/issues-page.css');
    removeCss('components/user-story-list/user-story-list.css');
    removeCss('components/feature-list/feature-list.css');
    removeCss('pages/user-stories/user-stories.css');
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
          <div class="project-page__header-actions" style="-webkit-app-region:no-drag;">
            <select class="is-header-select" id="isStatusFilter" title="Filter by status">
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
              <option value="wont_fix">Won't Fix</option>
            </select>
            <div class="project-page__model-group">
              <select class="project-page__model-select" id="isModelSelect" title="AI Model">
                <option value="">Loading…</option>
              </select>
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
            </button>
            <button class="project-page__qcmd-btn" id="isBtnQcmd" title="Quick Commands">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <circle cx="4" cy="6"  r="1.5" fill="currentColor"/>
                <circle cx="4" cy="10" r="1.5" fill="currentColor"/>
                <circle cx="4" cy="14" r="1.5" fill="currentColor"/>
                <path d="M8 6h8M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </header>

        <div class="project-page__workspace">

          <!-- Panel 1: Features — 15% -->
          <aside class="project-panel" id="isPanelFeatures">
            <div class="project-panel__header">
              <span class="project-panel__title">Features</span>
              <div class="project-panel__actions">
                <button class="project-panel__add project-panel__toggle" id="isBtnToggleFeatures" title="Collapse features" aria-label="Collapse features">
                  <svg class="is-toggle-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
            <button id="isBtnAddFeature" style="display:none;" aria-hidden="true"></button>
            <div class="project-panel__list" id="isFeatureList"></div>
          </aside>

          <div class="project-panel__resize" data-resize="is-features"></div>

          <!-- Panel 2: User Stories — 20% -->
          <aside class="project-panel" id="isPanelStories">
            <div class="project-panel__header">
              <span class="project-panel__title">User Stories</span>
            </div>
            <div class="project-panel__list" id="isStoryList">
              <div class="project-panel__empty"><p>Select a feature</p></div>
            </div>
          </aside>

          <div class="project-panel__resize" data-resize="is-stories"></div>

          <!-- Panel 3: Issues list — 25% -->
          <aside class="project-panel" id="isPanelIssuesList">
            <div class="project-panel__header">
              <span class="project-panel__title">Issues</span>
              <div class="project-panel__actions">
                <button class="project-panel__add" id="isBtnAdd" title="Add issue" aria-label="Add issue">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="project-panel__list" id="isIssuesList">
              <div class="is-empty">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p>Select a user story</p>
              </div>
            </div>
          </aside>

          <div class="project-panel__resize" data-resize="is-issues"></div>

          <!-- Panel 4: Issue detail — flex:1 -->
          <section class="project-panel project-panel--detail" id="isPanelDetail">
            <div class="project-panel__header">
              <span class="project-panel__title">Issue Detail</span>
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
    const select = this.container.querySelector('#isModelSelect');
    if (!select) return;
    const configs = await window.db.modelConfigs.list();
    const prevId  = select.value ? Number(select.value) : null;
    select.innerHTML = configs.length === 0
      ? `<option value="">No models configured</option>`
      : configs.map(c => `<option value="${c.id}">${escHtml(c.label)} [${c.type.toUpperCase()}]</option>`).join('');
    const def    = configs.find(c => c.is_default) || configs[0];
    const target = configs.find(c => c.id === prevId) || def;
    if (target) { select.value = target.id; this._aiModelConfig = target; }
  }

  _bindHeaderEvents() {
    this.container.querySelector('#isBtnBack')
      .addEventListener('click', () => this.router.navigate('project-home', { projectId: this._projectId }));

    this.container.querySelector('#isBtnModelConfigs')
      .addEventListener('click', () => this._modelConfigsModal.show());

    this.container.querySelector('#isModelSelect')
      .addEventListener('change', (e) => {
        const id = Number(e.target.value);
        window.db.modelConfigs.get(id).then(cfg => { this._aiModelConfig = cfg; });
      });

    this.container.querySelector('#isBtnGit')
      .addEventListener('click', () => this.router.navigate('user-stories', { projectId: this._projectId }));

    this.container.querySelector('#isBtnQcmd')
      .addEventListener('click', () => this._qcmdModal.show());

    this.container.querySelector('#isBtnAdd')
      .addEventListener('click', () => this._showAddForm());

    this.container.querySelector('#isStatusFilter')
      .addEventListener('change', async (e) => {
        this._filterStatus = e.target.value;
        await this._loadIssues();
      });
  }

  // ----------------------------------------------------------------
  // Feature panel collapse/expand
  // ----------------------------------------------------------------
  _initFeatureToggle() {
    const panel        = this.container.querySelector('#isPanelFeatures');
    const toggleBtn    = this.container.querySelector('#isBtnToggleFeatures');
    const resizeHandle = panel.nextElementSibling;
    const icon         = toggleBtn.querySelector('.is-toggle-icon');

    let savedFlex = '0 0 15%';

    toggleBtn.addEventListener('click', () => {
      const isCollapsed = panel.classList.toggle('project-panel--collapsed');

      if (isCollapsed) {
        savedFlex                  = panel.style.flex || '0 0 15%';
        panel.style.flex           = '0 0 32px';
        resizeHandle.style.display = 'none';
        toggleBtn.title            = 'Expand features';
        toggleBtn.setAttribute('aria-label', 'Expand features');
        icon.innerHTML = '<path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
      } else {
        panel.style.flex           = savedFlex;
        resizeHandle.style.display = '';
        toggleBtn.title            = 'Collapse features';
        toggleBtn.setAttribute('aria-label', 'Collapse features');
        icon.innerHTML = '<path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
      }
    });
  }

  // ----------------------------------------------------------------
  // FeatureList component
  // ----------------------------------------------------------------
  async _mountFeatureList() {
    this._featureList = new FeatureList({
      listEl:    this.container.querySelector('#isFeatureList'),
      addBtn:    this.container.querySelector('#isBtnAddFeature'),
      projectId: this._projectId,
      onSelect:  (feature) => this._onFeatureSelected(feature),
    });
    await this._featureList.mount();

    const firstCard = this.container.querySelector('#isFeatureList .fl-card');
    if (firstCard) firstCard.click();
  }

  async _onFeatureSelected(feature) {
    this._activeFeature = feature;
    this._activeStoryId = null;
    this._activeId      = null;
    this._issues        = [];
    this._renderIssues();
    this._showEmptyDetail();
    await this._loadStories(feature.id);
  }

  // ----------------------------------------------------------------
  // Story panel
  // ----------------------------------------------------------------
  async _loadStories(featureId) {
    this._stories = await window.db.userStories.list({ feature_id: featureId });
    this._renderStories();
    if (this._stories.length > 0) {
      await this._selectStory(this._stories[0].id);
    }
  }

  _renderStories() {
    const listEl = this.container.querySelector('#isStoryList');
    if (!listEl) return;

    if (this._stories.length === 0) {
      listEl.innerHTML = `<div class="project-panel__empty"><p>No stories in this feature</p></div>`;
      return;
    }

    listEl.innerHTML = this._stories.map(s => `
      <div class="usl-card${s.id === this._activeStoryId ? ' usl-card--active' : ''}" data-story="${s.id}">
        <div class="usl-card__header">
          <span class="usl-card__title">${escHtml(s.title)}</span>
        </div>
        ${s.status_name ? `
        <div class="usl-card__footer">
          <span class="usl-card__status">${escHtml(s.status_name)}</span>
        </div>` : ''}
      </div>
    `).join('');

    listEl.querySelectorAll('.usl-card').forEach(card => {
      card.addEventListener('click', () => this._selectStory(parseInt(card.dataset.story)));
    });
  }

  async _selectStory(storyId) {
    this._activeStoryId = storyId;
    this._activeId      = null;

    this.container.querySelectorAll('#isStoryList .usl-card').forEach(c =>
      c.classList.toggle('usl-card--active', parseInt(c.dataset.story) === storyId)
    );

    this._showEmptyDetail();
    await this._loadIssues();
  }

  // ----------------------------------------------------------------
  // Issues list panel
  // ----------------------------------------------------------------
  async _loadIssues() {
    if (!this._activeStoryId) {
      this._issues = [];
      this._renderIssues();
      return;
    }
    const filters = { project_id: this._projectId, user_story_id: this._activeStoryId };
    if (this._filterStatus) filters.status = this._filterStatus;
    this._issues = await window.db.issues.list(filters);
    this._renderIssues();

    if (this._activeId && !this._issues.find(i => i.id === this._activeId)) {
      this._activeId = null;
      this._showEmptyDetail();
    }
  }

  _renderIssues() {
    const listEl = this.container.querySelector('#isIssuesList');
    if (!listEl) return;

    if (this._issues.length === 0) {
      listEl.innerHTML = `
        <div class="is-empty">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p>${this._activeStoryId ? 'No issues for this story' : 'Select a user story'}</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = this._issues.map(issue => this._cardHtml(issue)).join('');

    listEl.querySelectorAll('.is-card').forEach(card => {
      const id = parseInt(card.dataset.id);
      card.addEventListener('click', () => this._selectIssue(id));
      card.querySelector('.is-card__del')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this._deleteIssue(id);
      });
    });

    if (this._activeId) {
      this.container.querySelector(`.is-card[data-id="${this._activeId}"]`)
        ?.classList.add('is-card--active');
    }
  }

  _cardHtml(issue) {
    const sm = STATUS_META[issue.status]     || STATUS_META.open;
    const sv = SEVERITY_META[issue.severity] || SEVERITY_META.medium;
    return `
      <div class="is-card${issue.id === this._activeId ? ' is-card--active' : ''}" data-id="${issue.id}">
        <div class="is-card__header">
          <span class="is-card__title">${escHtml(issue.title)}</span>
          <button class="is-card__del" title="Delete" aria-label="Delete">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8M5.5 6v4M8.5 6v4"
                stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div class="is-card__footer">
          <span class="is-status-badge ${sm.cls}">${sm.label}</span>
          <span class="is-severity-badge ${sv.cls}">${sv.label}</span>
        </div>
      </div>
    `;
  }

  _selectIssue(id) {
    this._activeId = id;
    this.container.querySelectorAll('.is-card').forEach(c =>
      c.classList.toggle('is-card--active', parseInt(c.dataset.id) === id)
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
  }

  _showAddForm() {
    this._activeId = null;
    this.container.querySelectorAll('.is-card').forEach(c => c.classList.remove('is-card--active'));
    const el = this.container.querySelector('#isIssueDetail');
    el.innerHTML = this._formHtml(null);
    this._bindFormEvents(el, null);
    el.querySelector('#isFormTitle')?.focus();
  }

  _showEditForm(issue) {
    const el = this.container.querySelector('#isIssueDetail');
    el.innerHTML = this._formHtml(issue);
    this._bindFormEvents(el, issue);
  }

  // ----------------------------------------------------------------
  // Form
  // ----------------------------------------------------------------
  _formHtml(issue) {
    const isEdit = !!issue;
    const statusOptions = Object.entries(STATUS_META).map(([val, m]) =>
      `<option value="${val}"${(issue?.status ?? 'open') === val ? ' selected' : ''}>${m.label}</option>`
    ).join('');
    const severityOptions = Object.entries(SEVERITY_META).map(([val, m]) =>
      `<option value="${val}"${(issue?.severity ?? 'medium') === val ? ' selected' : ''}>${m.label}</option>`
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

          <div class="is-form__field">
            <label class="is-form__label" for="isFormDesc">Description</label>
            <textarea class="is-form__textarea" id="isFormDesc" rows="2"
              placeholder="What is the issue about?">${escHtml(issue?.description || '')}</textarea>
          </div>

          <div class="is-form__field">
            <label class="is-form__label" for="isFormSteps">Steps to Reproduce</label>
            <textarea class="is-form__textarea is-form__textarea--steps" id="isFormSteps" rows="5"
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

        </div>

        <div class="is-form__footer">
          <button class="is-form__btn" id="isFormSave">${isEdit ? 'Save Changes' : 'Add Issue'}</button>
        </div>
      </div>
    `;
  }

  _bindFormEvents(el, issue) {
    const titleEl    = el.querySelector('#isFormTitle');
    const severityEl = el.querySelector('#isFormSeverity');
    const statusEl   = el.querySelector('#isFormStatus');
    const descEl     = el.querySelector('#isFormDesc');
    const stepsEl    = el.querySelector('#isFormSteps');
    const expectedEl = el.querySelector('#isFormExpected');
    const actualEl   = el.querySelector('#isFormActual');
    const saveBtn    = el.querySelector('#isFormSave');

    if (issue) {
      statusEl.addEventListener('change', async () => {
        await window.db.issues.update({ id: issue.id, status: statusEl.value });
        this._refreshCardBadges(issue.id, statusEl.value, severityEl.value);
      });
    }

    const save = async () => {
      const title = titleEl.value.trim();
      if (!title) { titleEl.classList.add('is-form__input--error'); titleEl.focus(); return; }
      titleEl.classList.remove('is-form__input--error');
      saveBtn.disabled    = true;
      saveBtn.textContent = issue ? 'Saving…' : 'Adding…';

      const payload = {
        project_id:         this._projectId,
        user_story_id:      this._activeStoryId ?? null,
        feature_id:         this._activeFeature?.id ?? null,
        title,
        description:        descEl.value.trim()     || null,
        steps_to_reproduce: stepsEl.value.trim()    || null,
        expected_behavior:  expectedEl.value.trim() || null,
        actual_behavior:    actualEl.value.trim()   || null,
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
    const cardEl = this.container.querySelector(`.is-card[data-id="${id}"]`);
    if (!cardEl) return;
    const sm = STATUS_META[status]     || STATUS_META.open;
    const sv = SEVERITY_META[severity] || SEVERITY_META.medium;
    const sb = cardEl.querySelector('.is-status-badge');
    const vb = cardEl.querySelector('.is-severity-badge');
    if (sb) { sb.className = `is-status-badge ${sm.cls}`; sb.textContent = sm.label; }
    if (vb) { vb.className = `is-severity-badge ${sv.cls}`; vb.textContent = sv.label; }
    const idx = this._issues.findIndex(i => i.id === id);
    if (idx !== -1) { this._issues[idx].status = status; this._issues[idx].severity = severity; }
  }

  // ----------------------------------------------------------------
  // Resizable panels
  // ----------------------------------------------------------------
  _initResizable() {
    const PANEL_MAP = {
      'is-features': { elId: 'isPanelFeatures',   min: 120, dir: 1 },
      'is-stories':  { elId: 'isPanelStories',     min: 140, dir: 1 },
      'is-issues':   { elId: 'isPanelIssuesList',  min: 140, dir: 1 },
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
