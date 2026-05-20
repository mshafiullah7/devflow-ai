import { escHtml, injectCss } from '../../shared/helpers.js';

const IS_STATUS = {
  open:        { label: 'Open',        cls: 'rs-badge--open'        },
  in_progress: { label: 'In Progress', cls: 'rs-badge--in-progress' },
  resolved:    { label: 'Resolved',    cls: 'rs-badge--resolved'    },
  closed:      { label: 'Closed',      cls: 'rs-badge--closed'      },
  wont_fix:    { label: "Won't Fix",   cls: 'rs-badge--wont-fix'    },
};

const IS_SEVERITY = {
  critical: { label: 'Critical', cls: 'rs-severity--critical' },
  high:     { label: 'High',     cls: 'rs-severity--high'     },
  medium:   { label: 'Medium',   cls: 'rs-severity--medium'   },
  low:      { label: 'Low',      cls: 'rs-severity--low'      },
};

export class UserStoryDetail {
  constructor({ detailEl, projectId, getModel, onRunCommandExternal, onPrintOutput, onStoryUpdated, onCancelled, headerActionsEl, onExport, onDelete }) {
    this._detailEl               = detailEl;
    this._headerActionsEl        = headerActionsEl || null;
    this._projectId              = projectId;
    this._getModel               = getModel || (() => null);
    this._onRunCommandExternal   = onRunCommandExternal || (() => {});
    this._onPrintOutput          = onPrintOutput || (() => {});
    this._onStoryUpdated         = onStoryUpdated || (() => {});
    this._onCancelled            = onCancelled || (() => {});
    this._onExport               = onExport || null;
    this._onDelete               = onDelete || null;
    this._featureId              = null;
    this._statuses               = [];
    this._ctrlSHandler           = null;
    this._currentStory           = null;
    this._activeTab              = 'description';
    this._titleEl                = null;
    this._descEl                 = null;
    this._priorityEl             = null;
    this._targetDateEl           = null;
    this._estHoursEl             = null;
    this._remHoursEl             = null;
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------
  async mount() {
    injectCss('components/user-story-detail/user-story-detail.css');
  }

  /** Update context when a new feature is selected */
  setContext(featureId, statuses) {
    this._featureId = featureId;
    this._statuses  = statuses || [];
  }

  /** Save the currently open edit form silently (used before navigation) */
  async save() {
    if (!this._currentStory || !this._titleEl) return;
    const title = this._titleEl.value.trim();
    if (!title) return;
    try {
      await window.db.userStories.update({
        id:                  this._currentStory.id,
        title,
        description:         this._descEl?.value.trim()      || null,
        priority:            this._priorityEl?.value         || 'medium',
        target_date:         this._targetDateEl?.value       || null,
        estimated_hours:     this._estHoursEl?.value !== '' && this._estHoursEl?.value != null
                               ? parseFloat(this._estHoursEl.value) : null,
        remaining_hours:     this._remHoursEl?.value !== '' && this._remHoursEl?.value != null
                               ? parseFloat(this._remHoursEl.value) : null,
      });
      this._onStoryUpdated();
    } catch { /* silent */ }
  }

  /** Show placeholder when no story is selected */
  showEmpty() {
    if (!this._detailEl) return;
    this._currentStory = null;
    this._titleEl      = null;
    this._descEl       = null;
    this._priorityEl   = null;
    this._targetDateEl = null;
    this._estHoursEl   = null;
    this._remHoursEl   = null;
    const headerActions = this._headerActionsEl || document.getElementById('storyDetailHeaderActions');
    if (headerActions) headerActions.innerHTML = '';
    this._detailEl.innerHTML = `
      <div class="usl-detail-empty">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="12" stroke="#4b5563" stroke-width="1.4"/>
          <path d="M16 11v5l3 3" stroke="#4b5563" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p>Select a user story</p>
      </div>
    `;
  }

  /** Render inline add form inside the detail panel */
  showAddForm() {
    if (!this._detailEl) return;
    this._currentStory = null;
    this._titleEl      = null;
    this._descEl       = null;
    this._priorityEl   = null;
    this._targetDateEl = null;
    this._estHoursEl   = null;
    this._remHoursEl   = null;
    const headerActions = this._headerActionsEl || document.getElementById('storyDetailHeaderActions');
    if (headerActions) headerActions.innerHTML = '';

    const backlog       = this._statuses.find(s => s.name === 'Backlog');
    const defaultStatus = backlog ? backlog.id : '';

    this._detailEl.innerHTML = `
      <div class="usl-add-form">
        <div class="usl-add-form__header">
          <h2 class="usl-add-form__title">Add User Story</h2>
          <div class="usl-view-toggle" id="uslAddDetailTabs">
            <button class="usl-view-toggle__btn usl-view-toggle__btn--active" data-tab="description">Description</button>
            <button class="usl-view-toggle__btn" data-tab="criterias">Criteria's</button>
            <button class="usl-view-toggle__btn" data-tab="tasks">Tasks</button>
            <button class="usl-view-toggle__btn" data-tab="issues">Issues</button>
          </div>
        </div>
        <div class="usl-add-form__body">

          <div class="usl-tab-content" data-tab-content="description">
            <div class="usl-add-form__field">
              <label class="usl-add-form__label" for="uslAddTitle">
                Title <span class="usl-add-form__required">*</span>
              </label>
              <input
                class="usl-add-form__input"
                id="uslAddTitle"
                type="text"
                placeholder="As a user, I want to…"
                maxlength="200"
                autocomplete="off"
              />
            </div>

            <div class="usl-add-form__field usl-add-form__field--desc">
              <div class="usl-add-form__label-row">
                <label class="usl-add-form__label" for="uslAddDesc">Description</label>
                <button class="usl-add-form__expand" type="button" data-expand="uslAddDesc" title="Expand" aria-label="Expand Description">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 10v4h-4M2 6V2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
              </div>
              <textarea class="usl-add-form__textarea" id="uslAddDesc" placeholder="Describe the story…" rows="6"></textarea>
            </div>

            <div class="usl-add-form__planning-grid">
              <div class="usl-add-form__planning-cell">
                <label class="usl-add-form__label" for="uslAddPriority">Priority</label>
                <select class="usl-add-form__select usl-priority-select" id="uslAddPriority" data-priority="medium">
                  <option value="low">Low</option>
                  <option value="medium" selected>Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div class="usl-add-form__planning-cell">
                <label class="usl-add-form__label" for="uslAddTargetDate">Target Date</label>
                <input class="usl-add-form__input" id="uslAddTargetDate" type="date" />
              </div>
              <div class="usl-add-form__planning-cell">
                <label class="usl-add-form__label" for="uslAddEstHours">Est. Hours</label>
                <input class="usl-add-form__input" id="uslAddEstHours" type="number" min="0" step="0.5" placeholder="—" />
              </div>
              <div class="usl-add-form__planning-cell">
                <label class="usl-add-form__label" for="uslAddRemHours">Rem. Hours</label>
                <input class="usl-add-form__input" id="uslAddRemHours" type="number" min="0" step="0.5" placeholder="—" />
              </div>
            </div>

            <div class="usl-add-form__field">
              <label class="usl-add-form__label" for="uslAddStatus">Status</label>
              <select class="usl-add-form__select" id="uslAddStatus">
                <option value="">— none —</option>
                ${this._statuses.map(st =>
                  `<option value="${st.id}"${st.id === defaultStatus ? ' selected' : ''}>${escHtml(st.name)}</option>`
                ).join('')}
              </select>
            </div>
          </div>

          <div class="usl-tab-content" data-tab-content="criterias">
            <div class="usl-prompts-section">
              <div class="usl-prompts-section__header">
                <span class="usl-prompts-section__title">Acceptance Criteria</span>
                <button class="usl-prompts-section__add-btn" id="uslAddCriteriaBtn" type="button" title="Add criterion">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                  Add
                </button>
              </div>
              <div class="usl-prompts-list" id="uslAddCriteriaList"></div>
            </div>
          </div>

          <div class="usl-tab-content" data-tab-content="tasks">
            <div class="usl-prompts-section">
              <div class="usl-prompts-section__header">
                <span class="usl-prompts-section__title">Tasks</span>
                <button class="usl-prompts-section__add-btn" id="uslAddPromptBtn" type="button" title="Add task">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                  Add
                </button>
              </div>
              <div class="usl-prompts-list" id="uslAddPromptsList"></div>
            </div>
          </div>

          <div class="usl-tab-content" data-tab-content="issues">
            <div class="usl-issues-tab" id="uslIssuesList">
              <div class="project-related__empty">Save the story first to see issues</div>
            </div>
          </div>

        </div>
        <div class="usl-add-form__footer">
          <button class="usl-add-form__btn usl-add-form__btn--save">Add User Story</button>
        </div>
      </div>
    `;

    const titleEl      = this._detailEl.querySelector('#uslAddTitle');
    const descEl       = this._detailEl.querySelector('#uslAddDesc');
    const statusEl     = this._detailEl.querySelector('#uslAddStatus');
    const priorityEl   = this._detailEl.querySelector('#uslAddPriority');
    const targetDateEl = this._detailEl.querySelector('#uslAddTargetDate');
    const estHoursEl   = this._detailEl.querySelector('#uslAddEstHours');
    const remHoursEl   = this._detailEl.querySelector('#uslAddRemHours');
    const saveBtn      = this._detailEl.querySelector('.usl-add-form__btn--save');

    priorityEl.addEventListener('change', () => { priorityEl.dataset.priority = priorityEl.value; });

    this._bindTabToggle(this._detailEl, null);
    this._bindPromptsSection(this._detailEl, null);
    this._bindCriteriaSection(this._detailEl, null);
    titleEl.focus();
    this._bindExpandBtns(this._detailEl);

    const save = async () => {
      const title = titleEl.value.trim();
      if (!title) {
        titleEl.classList.add('usl-add-form__input--error');
        titleEl.focus();
        return;
      }
      titleEl.classList.remove('usl-add-form__input--error');
      saveBtn.disabled    = true;
      saveBtn.textContent = 'Adding…';

      try {
        const newStory = await window.db.userStories.create({
          feature_id:      this._featureId,
          project_id:      this._projectId,
          title,
          description:     descEl.value.trim()        || null,
          status_id:       statusEl.value ? parseInt(statusEl.value, 10) : null,
          priority:        priorityEl.value            || 'medium',
          target_date:     targetDateEl.value          || null,
          estimated_hours: estHoursEl.value !== ''     ? parseFloat(estHoursEl.value)  : null,
          remaining_hours: remHoursEl.value !== ''     ? parseFloat(remHoursEl.value)  : null,
        });
        // Flush any pending criteria rows added before save
        const criteriaListEl = this._detailEl.querySelector('#uslAddCriteriaList');
        if (criteriaListEl && newStory?.id) {
          for (const row of criteriaListEl.querySelectorAll('.usl-pl-item')) {
            const desc = row.querySelector('.usl-pl-item__textarea')?.value.trim();
            if (desc && !row.dataset.rowId) {
              const created = await window.db.acceptanceCriteria.create({ user_story_id: newStory.id, description: desc });
              row.dataset.rowId = created.id;
            }
          }
        }
        this.showEmpty();
        this._onStoryUpdated();
      } catch {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Add User Story';
      }
    };

    saveBtn.addEventListener('click', save);
    titleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    this._bindCtrlS(save);
  }

  /** Render inline edit form inside the detail panel */
  showEditForm(story) {
    if (!this._detailEl) return;
    const headerActions = this._headerActionsEl || document.getElementById('storyDetailHeaderActions');
    if (headerActions) headerActions.innerHTML = '';

    const defaultStatus = story.status_id ?? '';

    this._detailEl.innerHTML = `
      <div class="usl-add-form">
        <div class="usl-add-form__header">
          <h2 class="usl-add-form__title">User Story</h2>
          <div class="usl-view-toggle" id="uslEditDetailTabs">
            <button class="usl-view-toggle__btn usl-view-toggle__btn--active" data-tab="description">Description</button>
            <button class="usl-view-toggle__btn" data-tab="criterias">Criteria's</button>
            <button class="usl-view-toggle__btn" data-tab="tasks">Tasks</button>
            <button class="usl-view-toggle__btn" data-tab="issues">Issues</button>
          </div>
          <select class="usl-add-form__status-select" id="uslEditStatus">
            <option value="">— none —</option>
            ${this._statuses.map(st =>
              `<option value="${st.id}"${st.id === defaultStatus ? ' selected' : ''}>${escHtml(st.name)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="usl-add-form__body">

          <div class="usl-tab-content" data-tab-content="description">
            <div class="usl-add-form__field">
              <label class="usl-add-form__label" for="uslEditTitle">
                Title <span class="usl-add-form__required">*</span>
              </label>
              <input
                class="usl-add-form__input"
                id="uslEditTitle"
                type="text"
                placeholder="As a user, I want to…"
                maxlength="200"
                autocomplete="off"
                value="${escHtml(story.title)}"
              />
            </div>

            <div class="usl-add-form__field usl-add-form__field--desc">
              <div class="usl-add-form__label-row">
                <label class="usl-add-form__label" for="uslEditDesc">Description</label>
                <button class="usl-add-form__expand" type="button" data-expand="uslEditDesc" title="Expand" aria-label="Expand Description">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 10v4h-4M2 6V2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
              </div>
              <textarea class="usl-add-form__textarea" id="uslEditDesc" placeholder="Describe the story…" rows="6">${escHtml(story.description || '')}</textarea>
            </div>

            <div class="usl-add-form__planning-grid">
              <div class="usl-add-form__planning-cell">
                <label class="usl-add-form__label" for="uslEditPriority">Priority</label>
                <select class="usl-add-form__select usl-priority-select" id="uslEditPriority" data-priority="${escHtml(story.priority || 'medium')}">
                  <option value="low"${(story.priority || 'medium') === 'low' ? ' selected' : ''}>Low</option>
                  <option value="medium"${(!story.priority || story.priority === 'medium') ? ' selected' : ''}>Medium</option>
                  <option value="high"${story.priority === 'high' ? ' selected' : ''}>High</option>
                  <option value="critical"${story.priority === 'critical' ? ' selected' : ''}>Critical</option>
                </select>
              </div>
              <div class="usl-add-form__planning-cell">
                <label class="usl-add-form__label" for="uslEditTargetDate">Target Date</label>
                <input class="usl-add-form__input" id="uslEditTargetDate" type="date" value="${escHtml(story.target_date || '')}" />
              </div>
              <div class="usl-add-form__planning-cell">
                <label class="usl-add-form__label" for="uslEditEstHours">Est. Hours</label>
                <input class="usl-add-form__input" id="uslEditEstHours" type="number" min="0" step="0.5" placeholder="—" value="${story.estimated_hours ?? ''}" />
              </div>
              <div class="usl-add-form__planning-cell">
                <label class="usl-add-form__label" for="uslEditRemHours">Rem. Hours</label>
                <input class="usl-add-form__input" id="uslEditRemHours" type="number" min="0" step="0.5" placeholder="—" value="${story.remaining_hours ?? ''}" />
              </div>
            </div>
          </div>

          <div class="usl-tab-content" data-tab-content="criterias">
            <div class="usl-prompts-section">
              <div class="usl-prompts-section__header">
                <span class="usl-prompts-section__title">Acceptance Criteria</span>
                <button class="usl-prompts-section__add-btn" id="uslEditCriteriaBtn" type="button" title="Add criterion">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                  Add
                </button>
              </div>
              <div class="usl-prompts-list" id="uslEditCriteriaList"></div>
            </div>
          </div>

          <div class="usl-tab-content" data-tab-content="tasks">
            <div class="usl-prompts-section">
              <div class="usl-prompts-section__header">
                <span class="usl-prompts-section__title">Tasks</span>
                <button class="usl-prompts-section__add-btn" id="uslEditPromptBtn" type="button" title="Add task">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                  Add
                </button>
              </div>
              <div class="usl-prompts-list" id="uslEditPromptsList"></div>
            </div>
          </div>

          <div class="usl-tab-content" data-tab-content="issues">
            <div class="usl-issues-tab" id="uslIssuesList">
              <div class="project-related__empty">Loading…</div>
            </div>
          </div>

        </div>
      </div>
    `;

    const titleEl      = this._detailEl.querySelector('#uslEditTitle');
    const descEl       = this._detailEl.querySelector('#uslEditDesc');
    const statusEl     = this._detailEl.querySelector('#uslEditStatus');
    const priorityEl   = this._detailEl.querySelector('#uslEditPriority');
    const targetDateEl = this._detailEl.querySelector('#uslEditTargetDate');
    const estHoursEl   = this._detailEl.querySelector('#uslEditEstHours');
    const remHoursEl   = this._detailEl.querySelector('#uslEditRemHours');

    this._currentStory = story;
    this._titleEl      = titleEl;
    this._descEl       = descEl;
    this._priorityEl   = priorityEl;
    this._targetDateEl = targetDateEl;
    this._estHoursEl   = estHoursEl;
    this._remHoursEl   = remHoursEl;

    priorityEl.addEventListener('change', () => { priorityEl.dataset.priority = priorityEl.value; });

    if (headerActions && this._onExport) {
      const exportBtn = document.createElement('button');
      exportBtn.className = 'usl-detail-hdr-btn';
      exportBtn.title = 'Export story';
      exportBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>`;
      exportBtn.addEventListener('click', () => this._onExport(story));
      headerActions.appendChild(exportBtn);
    }

    if (headerActions && this._onDelete) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'usl-detail-hdr-btn usl-detail-hdr-btn--danger';
      deleteBtn.title = 'Delete story';
      deleteBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <path d="M3 4h10M6 4V3h4v1M4 4l1 9h6l1-9M6 7v4M10 7v4"
          stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
      deleteBtn.addEventListener('click', () => this._onDelete(story));
      headerActions.appendChild(deleteBtn);
    }

    const saveBtn = document.createElement('button');
    saveBtn.className   = 'usl-add-form__btn usl-add-form__btn--save';
    saveBtn.textContent = 'Save Changes';
    if (headerActions) headerActions.appendChild(saveBtn);

    // Auto-save status immediately on change; clear is_extracted so the
    // AI badge is removed once the user has reviewed the story.
    statusEl.addEventListener('change', async () => {
      try {
        const payload = {
          id:        story.id,
          status_id: statusEl.value ? parseInt(statusEl.value, 10) : null,
        };
        if (story.is_extracted) {
          payload.is_extracted = 0;
          story.is_extracted   = 0;   // keep local copy in sync
        }
        await window.db.userStories.update(payload);
        this._onStoryUpdated();
      } catch { /* silent */ }
    });

    const save = async () => {
      const title = titleEl.value.trim();
      if (!title) {
        titleEl.classList.add('usl-add-form__input--error');
        titleEl.focus();
        return;
      }
      titleEl.classList.remove('usl-add-form__input--error');
      saveBtn.disabled    = true;
      saveBtn.textContent = 'Saving…';

      try {
        const payload = {
          id:              story.id,
          title,
          description:     descEl.value.trim()        || null,
          status_id:       statusEl.value ? parseInt(statusEl.value, 10) : null,
          priority:        priorityEl.value            || 'medium',
          target_date:     targetDateEl.value          || null,
          estimated_hours: estHoursEl.value !== ''     ? parseFloat(estHoursEl.value)  : null,
          remaining_hours: remHoursEl.value !== ''     ? parseFloat(remHoursEl.value)  : null,
        };
        if (story.is_extracted) {
          payload.is_extracted = 0;
          story.is_extracted   = 0;   // keep local copy in sync
        }
        await window.db.userStories.update(payload);
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Save Changes';
        this._onStoryUpdated();
      } catch {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Save Changes';
      }
    };

    this._bindTabToggle(this._detailEl, story.id);
    this._bindPromptsSection(this._detailEl, story.id);
    this._loadPrompts(story.id);
    this._bindCriteriaSection(this._detailEl, story.id);
    this._loadCriteria(story.id);
    // Eagerly fetch issue count so the tab label is visible before the tab is opened
    window.db.issues.list({ project_id: this._projectId, user_story_id: story.id })
      .then(issues => this._refreshIssuesTabLabel(issues.length))
      .catch(() => {});
    saveBtn.addEventListener('click', save);
    this._bindCtrlS(save);
    this._bindExpandBtns(this._detailEl, save);

  }

  // ----------------------------------------------------------------
  // Tab toggle
  // ----------------------------------------------------------------
  _bindTabToggle(container, storyId) {
    const tabs  = container.querySelectorAll('[data-tab]');
    const panes = container.querySelectorAll('[data-tab-content]');

    const activate = (name) => {
      this._activeTab = name;
      tabs.forEach(t  => t.classList.toggle('usl-view-toggle__btn--active', t.dataset.tab === name));
      panes.forEach(p => p.classList.toggle('usl-tab-content--active', p.dataset.tabContent === name));
      if (name === 'issues' && storyId) this._loadIssuesTab(container, storyId);
    };

    tabs.forEach(t => t.addEventListener('click', () => activate(t.dataset.tab)));
    activate(this._activeTab);
  }

  _refreshIssuesTabLabel(count) {
    if (!this._detailEl) return;
    const tab = this._detailEl.querySelector('[data-tab="issues"]');
    if (!tab) return;
    tab.textContent = count > 0 ? `Issues (${count})` : 'Issues';
  }

  async _loadIssuesTab(container, storyId) {
    const el = container.querySelector('#uslIssuesList');
    if (!el) return;
    el.innerHTML = '<div class="project-related__empty">Loading…</div>';
    try {
      const issues = await window.db.issues.list({ project_id: this._projectId, user_story_id: storyId });
      this._refreshIssuesTabLabel(issues.length);
      if (issues.length === 0) {
        el.innerHTML = '<div class="project-related__empty">No issues for this story</div>';
        return;
      }
      el.innerHTML = issues.map((issue, i) => {
        const sm = IS_STATUS[issue.status]     || IS_STATUS.open;
        const sv = IS_SEVERITY[issue.severity] || IS_SEVERITY.medium;
        return `
          <div class="related-item" data-id="${issue.id}">
            <div class="related-item__header">
              <span class="related-item__seq">#${i + 1}</span>
              <span class="related-item__title">${escHtml(issue.title)}</span>
            </div>
            <div class="related-item__footer">
              <span class="rs-badge ${sm.cls}">${sm.label}</span>
              <span class="rs-badge ${sv.cls}">${sv.label}</span>
            </div>
          </div>`;
      }).join('');
    } catch {
      el.innerHTML = '<div class="project-related__empty">Failed to load issues</div>';
    }
  }

  _refreshTasksTabLabel() {
    if (!this._detailEl) return;
    const tab    = this._detailEl.querySelector('[data-tab="tasks"]');
    const listEl = this._detailEl.querySelector('#uslEditPromptsList, #uslAddPromptsList');
    if (!tab || !listEl) return;
    const total = listEl.querySelectorAll('.usl-pl-item').length;
    const done  = listEl.querySelectorAll('.usl-pl-status--executed').length;
    tab.textContent = total === 0 ? 'Tasks' : `Tasks (${done}/${total})`;
  }

  _refreshCriteriaTabLabel() {
    if (!this._detailEl) return;
    const tab    = this._detailEl.querySelector('[data-tab="criterias"]');
    const listEl = this._detailEl.querySelector('#uslEditCriteriaList, #uslAddCriteriaList');
    if (!tab || !listEl) return;
    const total = listEl.querySelectorAll('.usl-pl-item').length;
    tab.textContent = total === 0 ? "Criteria's" : `Criteria's (${total})`;
  }

  // ----------------------------------------------------------------
  // Acceptance Criteria CRUD section
  // ----------------------------------------------------------------
  _bindCriteriaSection(container, userStoryId) {
    const addBtn = container.querySelector('#uslAddCriteriaBtn, #uslEditCriteriaBtn');
    if (!addBtn) return;
    addBtn.addEventListener('click', () => {
      const listEl = container.querySelector('#uslEditCriteriaList, #uslAddCriteriaList');
      if (!listEl) return;
      this._addCriteriaRow(listEl, userStoryId, null);
      this._refreshCriteriaTabLabel();
    });
  }

  async _loadCriteria(userStoryId) {
    if (!userStoryId) return;
    const list   = await window.db.acceptanceCriteria.list(userStoryId);
    const listEl = this._detailEl?.querySelector('#uslEditCriteriaList, #uslAddCriteriaList');
    if (!listEl) return;
    listEl.innerHTML = '';
    list.forEach(ac => this._addCriteriaRow(listEl, userStoryId, ac));
    this._refreshCriteriaTabLabel();
  }

  _addCriteriaRow(listEl, userStoryId, existing) {
    const itemCount = listEl.querySelectorAll('.usl-pl-item').length;

    const _buildLabel = (text) => {
      const first = (text || '').split('\n')[0].trim();
      if (!first) return `Criteria ${itemCount + 1}`;
      return first.length > 60 ? first.slice(0, 60) + '…' : first;
    };

    const item = document.createElement('div');
    item.className     = 'usl-pl-item';
    item.dataset.rowId = existing?.id ?? '';

    item.innerHTML = `
      <div class="usl-pl-item__header">
        <span class="usl-pl-item__status usl-pl-status--pending" title="Pending">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4"/></svg>
        </span>
        <span class="usl-pl-item__label">${escHtml(_buildLabel(existing?.description || ''))}</span>
        <div class="usl-pl-item__actions">
          <button class="usl-pl-item__btn usl-pl-item__btn--expand" type="button" title="Expand to full editor">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 10v4h-4M2 6V2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Expand
          </button>
          <button class="usl-pl-item__btn usl-pl-item__btn--delete" type="button" title="Delete criterion">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8M5.5 6v4M8.5 6v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <svg class="usl-pl-item__chevron" width="10" height="10" viewBox="0 0 16 16" fill="none">
          <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="usl-pl-item__body" hidden>
        <div class="usl-pl-item__preview usl-expand-preview"></div>
        <textarea class="usl-pl-item__textarea" hidden placeholder="Given… When… Then…">${escHtml(existing?.description || '')}</textarea>
      </div>
    `;

    listEl.appendChild(item);

    const headerEl  = item.querySelector('.usl-pl-item__header');
    const bodyEl    = item.querySelector('.usl-pl-item__body');
    const labelEl   = item.querySelector('.usl-pl-item__label');
    const taEl      = item.querySelector('.usl-pl-item__textarea');
    const previewEl = item.querySelector('.usl-pl-item__preview');

    const renderPreview = () => {
      const text = taEl.value.trim();
      previewEl.innerHTML = text
        ? this._renderMarkdown(text)
        : '<p class="usl-pl-preview--empty">No content · click &#x2922; to edit</p>';
    };
    renderPreview();

    const save = async () => {
      const description = taEl.value.trim();
      if (!description) return;
      if (item.dataset.rowId) {
        await window.db.acceptanceCriteria.update({ id: parseInt(item.dataset.rowId), description });
      } else if (userStoryId) {
        const created = await window.db.acceptanceCriteria.create({ user_story_id: userStoryId, description });
        item.dataset.rowId = created.id;
      }
    };

    taEl.addEventListener('blur', save);
    taEl.addEventListener('input', () => { labelEl.textContent = _buildLabel(taEl.value); });

    // Open new (unsaved) rows immediately in expand overlay
    if (!existing) {
      item.classList.add('usl-pl-item--open');
      bodyEl.hidden = false;
      setTimeout(() => {
        this._openExpandOverlay(taEl, 'Criterion', async () => { renderPreview(); await save(); }, false);
      }, 0);
    }

    // Accordion toggle
    headerEl.addEventListener('click', () => {
      const isOpen = item.classList.contains('usl-pl-item--open');
      listEl.querySelectorAll('.usl-pl-item').forEach(el => {
        el.classList.remove('usl-pl-item--open');
        el.querySelector('.usl-pl-item__body').hidden = true;
      });
      if (!isOpen) {
        item.classList.add('usl-pl-item--open');
        bodyEl.hidden = false;
      }
    });

    // Expand overlay
    item.querySelector('.usl-pl-item__btn--expand').addEventListener('click', async (e) => {
      e.stopPropagation();
      await save();
      this._openExpandOverlay(taEl, 'Criterion', async () => { renderPreview(); await save(); }, false);
    });

    // Delete
    item.querySelector('.usl-pl-item__btn--delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await this._showConfirm('Delete this criterion?', 'Delete');
      if (!confirmed) return;
      if (item.dataset.rowId) await window.db.acceptanceCriteria.delete(parseInt(item.dataset.rowId));
      item.remove();
      this._refreshCriteriaTabLabel();
      // Re-number remaining items with default labels
      listEl.querySelectorAll('.usl-pl-item').forEach((el, i) => {
        const ta = el.querySelector('.usl-pl-item__textarea');
        const li = el.querySelector('.usl-pl-item__label');
        if (li) {
          const first = (ta?.value || '').split('\n')[0].trim();
          li.textContent = first
            ? (first.length > 60 ? first.slice(0, 60) + '…' : first)
            : `Criteria ${i + 1}`;
        }
      });
    });
  }

  // ----------------------------------------------------------------
  // Additional prompts CRUD section
  // ----------------------------------------------------------------
  _bindPromptsSection(container, userStoryId) {
    const addBtn = container.querySelector('#uslAddPromptBtn, #uslEditPromptBtn');
    if (!addBtn) return;
    addBtn.addEventListener('click', () => {
      const listEl = container.querySelector('#uslEditPromptsList, #uslAddPromptsList');
      if (!listEl) return;
      // New items start expanded so user can type immediately
      this._addPromptRow(listEl, userStoryId, null);
      this._refreshTasksTabLabel();
    });
  }

  async _loadPrompts(userStoryId) {
    if (!userStoryId) return;
    const list = await window.db.prompts.list(userStoryId);
    const container = this._detailEl;
    const listEl = container.querySelector('#uslEditPromptsList, #uslAddPromptsList');
    if (!listEl) return;
    listEl.innerHTML = '';
    list.forEach(p => this._addPromptRow(listEl, userStoryId, p));
    this._refreshTasksTabLabel();
  }

  _showConfirm(message, confirmLabel = 'Delete') {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'usl-confirm-overlay';
      overlay.innerHTML = `
        <div class="usl-confirm-dialog">
          <p class="usl-confirm-msg">${escHtml(message)}</p>
          <div class="usl-confirm-btns">
            <button class="usl-confirm-btn usl-confirm-btn--cancel">Cancel</button>
            <button class="usl-confirm-btn usl-confirm-btn--ok">${escHtml(confirmLabel)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const cleanup = (result) => { overlay.remove(); resolve(result); };
      overlay.querySelector('.usl-confirm-btn--cancel').addEventListener('click', () => cleanup(false));
      overlay.querySelector('.usl-confirm-btn--ok').addEventListener('click', () => cleanup(true));
    });
  }

  _showRunDirModal(cmd) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'usl-confirm-overlay';
      overlay.innerHTML = `
        <div class="usl-confirm-dialog">
          <p class="usl-confirm-title">Run Prompt</p>
          <p class="usl-confirm-msg">Choose the directory to execute this prompt in:</p>
          <div class="usl-confirm-btns">
            <button class="usl-confirm-btn usl-confirm-btn--cancel">Cancel</button>
            <button class="usl-confirm-btn usl-confirm-btn--secondary" data-action="current">Current Directory</button>
            <button class="usl-confirm-btn usl-confirm-btn--ok" data-action="choose">Choose Folder…</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const cleanup = () => overlay.remove();

      overlay.querySelector('[data-action="current"]').addEventListener('click', () => {
        cleanup();
        this._onRunCommandExternal(cmd);
        resolve();
      });

      overlay.querySelector('[data-action="choose"]').addEventListener('click', async () => {
        cleanup();
        const folderPath = await window.db.dialog.openFolder();
        if (folderPath) {
          window.db.terminal.openExternal({ command: cmd, cwd: folderPath });
        }
        resolve();
      });

      overlay.querySelector('.usl-confirm-btn--cancel').addEventListener('click', () => { cleanup(); resolve(); });
    });
  }

  _addPromptRow(listEl, userStoryId, existing) {
    const tag      = existing?.tag?.trim() || '';
    const itemCount = listEl.querySelectorAll('.usl-pl-item').length;
    const isExecuted = !!existing?.is_executed;

    const _buildLabel = (tagVal, promptText) => {
      const t = tagVal?.trim() || `Prompt ${itemCount + 1}`;
      const firstLine = (promptText || '').split('\n')[0].trim();
      const snippet = firstLine.length > 50 ? firstLine.slice(0, 50) + '…' : firstLine;
      return snippet ? `${t} — ${snippet}` : t;
    };
    const label = _buildLabel(tag, existing?.prompt || '');

    const item = document.createElement('div');
    item.className     = 'usl-pl-item';
    item.dataset.rowId = existing?.id ?? '';

    const statusIconExecuted = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2.5 8.5l3.5 3.5 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const statusIconPending  = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4"/></svg>`;

    item.innerHTML = `
      <div class="usl-pl-item__header">
        <span class="usl-pl-item__status ${isExecuted ? 'usl-pl-status--executed' : 'usl-pl-status--pending'}" title="${isExecuted ? 'Executed' : 'Not executed'}">
          ${isExecuted ? statusIconExecuted : statusIconPending}
        </span>
        <span class="usl-pl-item__label">${escHtml(label)}</span>
        <div class="usl-pl-item__actions">
          <button class="usl-pl-item__btn usl-pl-item__btn--mark-executed${isExecuted ? ' is-executed' : ''}" type="button" title="${isExecuted ? 'Executed' : 'Mark as Executed'}">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2.5 8.5l3.5 3.5 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Done
          </button>
          <button class="usl-pl-item__btn usl-pl-item__btn--queue" type="button" title="Add to prompt queue"${!userStoryId ? ' disabled' : ''}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 4h7M2 8h5M2 12h3M11 6v6M8 9h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            Add to Queue
          </button>
          <button class="usl-pl-item__btn usl-pl-item__btn--expand" type="button" title="Expand to full editor">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 10v4h-4M2 6V2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Expand
          </button>
          <button class="usl-pl-item__btn usl-pl-item__btn--delete" type="button" title="Delete prompt">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8M5.5 6v4M8.5 6v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <svg class="usl-pl-item__chevron" width="10" height="10" viewBox="0 0 16 16" fill="none">
          <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="usl-pl-item__body" hidden>
        <input class="usl-pl-item__tag-input" type="text" placeholder="Label (optional)" value="${escHtml(tag)}" autocomplete="off"/>
        <div class="usl-pl-item__preview usl-expand-preview"></div>
        <textarea class="usl-pl-item__textarea" hidden>${escHtml(existing?.prompt || '')}</textarea>
      </div>
    `;

    listEl.appendChild(item);

    const headerEl   = item.querySelector('.usl-pl-item__header');
    const bodyEl     = item.querySelector('.usl-pl-item__body');
    const statusEl   = item.querySelector('.usl-pl-item__status');
    const labelEl    = item.querySelector('.usl-pl-item__label');
    const tagInput   = item.querySelector('.usl-pl-item__tag-input');
    const taEl       = item.querySelector('.usl-pl-item__textarea');
    const previewEl  = item.querySelector('.usl-pl-item__preview');
    const markExecBtn = item.querySelector('.usl-pl-item__btn--mark-executed');

    const renderPreview = () => {
      const text = taEl.value.trim();
      previewEl.innerHTML = text
        ? this._renderMarkdown(text)
        : '<p class="usl-pl-preview--empty">No content · click &#x2922; to edit</p>';
    };
    renderPreview();

    // Open new (unsaved) items immediately and launch edit overlay
    if (!existing) {
      item.classList.add('usl-pl-item--open');
      bodyEl.hidden = false;
      setTimeout(() => {
        this._openExpandOverlay(taEl, 'Prompt', async () => { renderPreview(); await save(); }, true);
      }, 0);
    }

    // Toggle open/close on header click — accordion: only one item open at a time
    headerEl.addEventListener('click', () => {
      const isOpen = item.classList.contains('usl-pl-item--open');
      listEl.querySelectorAll('.usl-pl-item').forEach(el => {
        el.classList.remove('usl-pl-item--open');
        el.querySelector('.usl-pl-item__body').hidden = true;
      });
      if (!isOpen) {
        item.classList.add('usl-pl-item--open');
        bodyEl.hidden = false;
      }
    });

    // Live-update label when tag or prompt changes
    const refreshLabel = () => {
      labelEl.textContent = _buildLabel(tagInput.value, taEl.value);
    };
    tagInput.addEventListener('input', refreshLabel);
    taEl.addEventListener('input', refreshLabel);

    // Auto-save on blur
    const save = async () => {
      const prompt = taEl.value.trim();
      const tagVal = tagInput.value.trim() || null;
      if (!prompt) return;
      if (item.dataset.rowId) {
        await window.db.prompts.update({ id: parseInt(item.dataset.rowId), tag: tagVal, prompt });
      } else if (userStoryId) {
        const created = await window.db.prompts.create({ user_story_id: userStoryId, tag: tagVal, prompt });
        item.dataset.rowId = created.id;
      }
    };
    tagInput.addEventListener('blur', save);
    taEl.addEventListener('blur', save);

    // Add to prompt queue
    const queueBtn = item.querySelector('.usl-pl-item__btn--queue');
    if (queueBtn && userStoryId) {
      queueBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await save();
        const prompt = taEl.value.trim();
        if (!prompt) return;
        let storyTitle = null;
        try {
          const story = await window.db.userStories.get(userStoryId);
          storyTitle = story?.title || null;
        } catch (_) {}
        const model      = this._getModel();
        const modelLabel = (typeof model === 'string' ? model : model?.label) || null;
        await window.db.promptQueue.add({
          project_id:    this._projectId,
          user_story_id: userStoryId,
          story_title:   storyTitle,
          prompt_id:     item.dataset.rowId ? parseInt(item.dataset.rowId) : null,
          tag:           tagInput.value.trim() || null,
          prompt_text:   prompt,
          model_label:   modelLabel,
        });
        const origHTML    = queueBtn.innerHTML;
        queueBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2.5 8.5l3.5 3.5 7-7" stroke="#22c55e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        queueBtn.disabled  = true;
        setTimeout(() => { queueBtn.innerHTML = origHTML; queueBtn.disabled = false; }, 1500);
      });
    }

    // Mark as executed
    markExecBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const nowExecuted = !markExecBtn.classList.contains('is-executed');
      markExecBtn.classList.toggle('is-executed', nowExecuted);
      markExecBtn.title = nowExecuted ? 'Executed' : 'Mark as Executed';
      statusEl.className = `usl-pl-item__status ${nowExecuted ? 'usl-pl-status--executed' : 'usl-pl-status--pending'}`;
      statusEl.title     = nowExecuted ? 'Executed' : 'Not executed';
      statusEl.innerHTML = nowExecuted ? statusIconExecuted : statusIconPending;
      if (item.dataset.rowId) {
        await window.db.prompts.update({ id: parseInt(item.dataset.rowId), is_executed: nowExecuted ? 1 : 0 });
      }
      this._refreshTasksTabLabel();
    });

    // Expand overlay
    item.querySelector('.usl-pl-item__btn--expand').addEventListener('click', async (e) => {
      e.stopPropagation();
      await save();
      this._openExpandOverlay(taEl, tagInput.value.trim() || 'Prompt', async () => { renderPreview(); await save(); }, true);
    });

    // Delete
    item.querySelector('.usl-pl-item__btn--delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await this._showConfirm('Delete this prompt?', 'Delete');
      if (!confirmed) return;
      if (item.dataset.rowId) await window.db.prompts.delete(parseInt(item.dataset.rowId));
      item.remove();
      this._refreshTasksTabLabel();
      // Re-number remaining items that still have default labels
      listEl.querySelectorAll('.usl-pl-item').forEach((el, i) => {
        const ti = el.querySelector('.usl-pl-item__tag-input');
        const ta = el.querySelector('.usl-pl-item__textarea');
        const li = el.querySelector('.usl-pl-item__label');
        if (ti && li) {
          const t = ti.value.trim() || `Prompt ${i + 1}`;
          const firstLine = (ta?.value || '').split('\n')[0].trim();
          const snippet = firstLine.length > 50 ? firstLine.slice(0, 50) + '…' : firstLine;
          li.textContent = snippet ? `${t} — ${snippet}` : t;
        }
      });
    });
  }

  // ----------------------------------------------------------------
  // Ctrl+S binding
  // ----------------------------------------------------------------
  _bindCtrlS(handler) {
    if (this._ctrlSHandler) {
      this._detailEl.removeEventListener('keydown', this._ctrlSHandler);
    }
    this._ctrlSHandler = (e) => {
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); handler(); }
    };
    this._detailEl.addEventListener('keydown', this._ctrlSHandler);
  }

  // ----------------------------------------------------------------
  // Expand helper — wires expand buttons in a container
  // ----------------------------------------------------------------
  _bindExpandBtns(container, onDone) {
    container.querySelectorAll('.usl-add-form__expand').forEach(btn => {
      btn.addEventListener('click', () => {
        const textarea  = container.querySelector('#' + btn.dataset.expand);
        const row       = btn.closest('.usl-add-form__label-row');
        const labelEl   = row ? row.querySelector('.usl-add-form__label') : null;
        const labelText = labelEl ? labelEl.textContent.trim() : '';
        const isPrompt  = btn.dataset.expand.toLowerCase().includes('prompt');
        this._openExpandOverlay(textarea, labelText, onDone, isPrompt);
      });
    });
  }

  // ----------------------------------------------------------------
  // Run button helpers
  // ----------------------------------------------------------------

  _resolvedConfig() {
    const cfg = this._getModel();
    if (!cfg) return { type: 'cli', executable: 'claude', flags: '--dangerously-skip-permissions --print', input_mode: 'pipe' };
    if (typeof cfg === 'string') {
      const exe = cfg === 'gemini-cli' ? 'gemini' : 'claude';
      const flags = cfg === 'gemini-cli' ? '' : '--dangerously-skip-permissions --print';
      return { type: 'cli', executable: exe, flags, input_mode: 'pipe' };
    }
    return cfg;
  }

  _buildExternalCmd(prompt) {
    const cfg = this._resolvedConfig();
    if (cfg.type === 'api') return null;
    const exe = cfg.executable || 'claude';
    return `$p = @'\n${prompt}\n'@\n${exe} $p`;
  }

  async _runApiPrompt(prompt, userStoryId) {
    const cfg = this._resolvedConfig();
    const baseUrl = (cfg.base_url || '').replace(/\/$/, '');
    if (!baseUrl) {
      this._onPrintOutput('API model error: base_url is not configured.', { label: cfg.label || 'API', isError: true });
      return;
    }

    const label = cfg.label || cfg.model_name || 'API';
    this._onPrintOutput('', { label: `▶ ${label}` });

    const body = {
      model: cfg.model_name || 'default',
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    };
    if (cfg.max_tokens) body.max_tokens = cfg.max_tokens;

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (cfg.api_key) headers['Authorization'] = `Bearer ${cfg.api_key}`;

      const res = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const errText = await res.text();
        this._onPrintOutput(`HTTP ${res.status}: ${errText}`, { isError: true });
        return;
      }
      const json = await res.json();
      const text = json.choices?.[0]?.message?.content ?? JSON.stringify(json, null, 2);
      this._onPrintOutput(text);
    } catch (err) {
      this._onPrintOutput(`API call failed: ${err.message}`, { isError: true });
    }
  }

  // ----------------------------------------------------------------
  // Full-screen expand overlay for a textarea
  // ----------------------------------------------------------------
  _openExpandOverlay(textarea, label, onDone, isPrompt = false) {
    const overlay = document.createElement('div');
    overlay.className = 'usl-expand-overlay';
    overlay.innerHTML = `
      <div class="usl-expand-dialog">
        <div class="usl-expand-header">
          <span class="usl-expand-title">${escHtml(label)}</span>
          ${isPrompt ? `
          <div class="usl-expand-tabs">
            <button class="usl-expand-tab usl-expand-tab--active" data-tab="edit">Edit</button>
            <button class="usl-expand-tab" data-tab="preview">Preview</button>
          </div>` : ''}
          <button class="usl-expand-close" aria-label="Close">&times;</button>
        </div>
        ${isPrompt ? `
        <div class="usl-prompt-expand-wrap" data-pane="edit">
          <div class="usl-prompt-expand-bd" aria-hidden="true"></div>
          <textarea class="usl-expand-textarea usl-prompt-expand-ta" placeholder="${escHtml(textarea.placeholder || '')}">${escHtml(textarea.value)}</textarea>
        </div>
        <div class="usl-expand-preview" data-pane="preview" hidden></div>` : `
        <textarea class="usl-expand-textarea" placeholder="${escHtml(textarea.placeholder || '')}">${escHtml(textarea.value)}</textarea>`}
        <div class="usl-expand-footer">
          <button class="usl-expand-btn usl-expand-btn--done">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const expandTA = overlay.querySelector('.usl-expand-textarea');
    expandTA.focus();
    expandTA.setSelectionRange(expandTA.value.length, expandTA.value.length);

    if (isPrompt) {
      const bd         = overlay.querySelector('.usl-prompt-expand-bd');
      const editPane   = overlay.querySelector('[data-pane="edit"]');
      const previewPane = overlay.querySelector('[data-pane="preview"]');
      const tabs       = overlay.querySelectorAll('.usl-expand-tab');

      const syncBd = () => {
        bd.innerHTML = expandTA.value
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/^(#{5} .+)$/gm, '<span class="usl-hl-h5">$1</span>')
          .replace(/^(#{4} .+)$/gm, '<span class="usl-hl-h4">$1</span>')
          .replace(/^(#{3} .+)$/gm, '<span class="usl-hl-h3">$1</span>')
          .replace(/^(#{2} .+)$/gm, '<span class="usl-hl-h2">$1</span>')
          .replace(/^(# .+)$/gm,    '<span class="usl-hl-h1">$1</span>') + '\n';
        bd.scrollTop = expandTA.scrollTop;
      };
      expandTA.addEventListener('input', syncBd);
      expandTA.addEventListener('scroll', () => { bd.scrollTop = expandTA.scrollTop; });
      syncBd();

      // Default to Edit tab on open
      editPane.hidden    = false;
      previewPane.hidden = true;
      expandTA.focus();

      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          tabs.forEach(t => t.classList.remove('usl-expand-tab--active'));
          tab.classList.add('usl-expand-tab--active');
          if (tab.dataset.tab === 'preview') {
            previewPane.innerHTML = this._renderMarkdown(expandTA.value);
            editPane.hidden    = true;
            previewPane.hidden = false;
          } else {
            editPane.hidden   = false;
            previewPane.hidden = true;
            expandTA.focus();
          }
        });
      });
    }

    const done = async () => {
      textarea.value = expandTA.value;
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
      if (onDone) await onDone();
    };

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        textarea.value = expandTA.value;
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };

    overlay.querySelector('.usl-expand-btn--done').addEventListener('click', done);
    overlay.querySelector('.usl-expand-close').addEventListener('click', () => {
      textarea.value = expandTA.value;
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    });
    document.addEventListener('keydown', escHandler);
  }

  // ----------------------------------------------------------------
  // Inline markdown renderer (no external deps)
  // ----------------------------------------------------------------
  _renderMarkdown(text) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const lines    = text.split('\n');
    const out      = [];
    let inCode     = false;
    let codeLines  = [];
    let inUl       = false;
    let inOl       = false;
    let lastBlock  = '';

    const closeList = () => {
      if (inUl) { out.push('</ul>'); inUl = false; lastBlock = 'list'; }
      if (inOl) { out.push('</ol>'); inOl = false; lastBlock = 'list'; }
    };

    let inTable     = false;
    let tableLines  = [];

    const flushTable = () => {
      if (!inTable) return;
      inTable = false;
      if (tableLines.length < 2) {
        tableLines.forEach(l => out.push(`<p>${this._inlineMarkdown(esc(l))}</p>`));
        tableLines = [];
        lastBlock = 'p';
        return;
      }
      const parseRow = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const isSep    = r => /^\|?[\s\-|:]+\|?$/.test(r) && r.includes('-');
      const sepIdx   = tableLines.findIndex(isSep);
      const headRows = sepIdx > 0 ? tableLines.slice(0, sepIdx) : [];
      const bodyRows = tableLines.slice(sepIdx + 1);

      let html = '<table class="md-table">';
      if (headRows.length) {
        html += '<thead>';
        headRows.forEach(r => {
          html += '<tr>' + parseRow(r).map(c => `<th>${this._inlineMarkdown(esc(c))}</th>`).join('') + '</tr>';
        });
        html += '</thead>';
      }
      if (bodyRows.length) {
        html += '<tbody>';
        bodyRows.forEach(r => {
          html += '<tr>' + parseRow(r).map(c => `<td>${this._inlineMarkdown(esc(c))}</td>`).join('') + '</tr>';
        });
        html += '</tbody>';
      }
      html += '</table>';
      out.push(html);
      tableLines = [];
      lastBlock = 'table';
    };

    let inSvg    = false;
    let svgLines = [];

    for (const line of lines) {
      if (!inCode && !inSvg && line.trimStart().toLowerCase().startsWith('<svg')) {
        closeList();
        inSvg    = true;
        svgLines = [line];
        if (line.includes('</svg>')) {
          out.push(`<div class="md-svg">${svgLines.join('\n')}</div>`);
          svgLines = []; inSvg = false; lastBlock = 'svg';
        }
        continue;
      }
      if (inSvg) {
        svgLines.push(line);
        if (line.includes('</svg>')) {
          out.push(`<div class="md-svg">${svgLines.join('\n')}</div>`);
          svgLines = []; inSvg = false; lastBlock = 'svg';
        }
        continue;
      }

      if (line.trimStart().startsWith('```')) {
        closeList();
        if (inCode) {
          out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
          codeLines = [];
          inCode    = false;
          lastBlock = 'code';
        } else {
          inCode = true;
        }
        continue;
      }
      if (inCode) { codeLines.push(esc(line)); continue; }

      const hm = line.match(/^(#{1,6})\s+(.*)/);
      if (hm) {
        closeList();
        const lvl = hm[1].length;
        out.push(`<h${lvl}>${esc(hm[2])}</h${lvl}>`);
        lastBlock = 'heading';
        continue;
      }

      if (/^[-*_]{3,}\s*$/.test(line)) {
        closeList();
        out.push('<hr>');
        lastBlock = 'hr';
        continue;
      }

      const ulm = line.match(/^[-*+]\s+(.*)/);
      if (ulm) {
        if (inOl) { out.push('</ol>'); inOl = false; }
        if (!inUl) { out.push('<ul>'); inUl = true; }
        out.push(`<li>${this._inlineMarkdown(esc(ulm[1]))}</li>`);
        lastBlock = 'list';
        continue;
      }

      const olm = line.match(/^\d+\.\s+(.*)/);
      if (olm) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (!inOl) { out.push('<ol>'); inOl = true; }
        out.push(`<li>${this._inlineMarkdown(esc(olm[1]))}</li>`);
        lastBlock = 'list';
        continue;
      }

      const bqm = line.match(/^>\s?(.*)/);
      if (bqm) {
        closeList();
        out.push(`<blockquote>${this._inlineMarkdown(esc(bqm[1]))}</blockquote>`);
        lastBlock = 'blockquote';
        continue;
      }

      if (line.trim().startsWith('|')) {
        closeList();
        inTable = true;
        tableLines.push(line.trim());
        continue;
      }

      if (inTable) flushTable();

      if (line.trim() === '') {
        closeList();
        if (lastBlock === 'p') { out.push('<br>'); lastBlock = 'br'; }
        continue;
      }

      closeList();
      out.push(`<p>${this._inlineMarkdown(esc(line))}</p>`);
      lastBlock = 'p';
    }

    closeList();
    if (inTable) flushTable();
    if (inCode) out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
    return out.join('');
  }

  _inlineMarkdown(s) {
    return s
      .replace(/`([^`]+)`/g,          '<code>$1</code>')
      .replace(/\*\*\*(.+?)\*\*\*/g,  '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g,      '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,          '<em>$1</em>')
      .replace(/~~(.+?)~~/g,          '<del>$1</del>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  }
}
