import { FeatureList } from '../../components/feature-list/feature-list.js';
import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelConfigsModal } from '../../components/model-configs/model-configs-modal.js';
import { QuickCommandsModal } from '../../components/quick-commands/quick-commands-modal.js';
import { GitController } from '../../components/git/git-controller.js';

const STATUS_META = {
  not_run: { label: 'Not Run',  cls: 'tc-status--not-run' },
  pass:    { label: 'Pass',     cls: 'tc-status--pass'    },
  fail:    { label: 'Fail',     cls: 'tc-status--fail'    },
  blocked: { label: 'Blocked',  cls: 'tc-status--blocked' },
};

const PRIORITY_META = {
  low:    { label: 'Low',    cls: 'tc-priority--low'    },
  medium: { label: 'Medium', cls: 'tc-priority--medium' },
  high:   { label: 'High',   cls: 'tc-priority--high'   },
};

export class TestCasesPage {
  constructor(container, params, router) {
    this.container       = container;
    this.router          = router;
    this._projectId      = params.projectId;
    this._project        = null;
    this._activeFeature  = null;
    this._stories        = [];
    this._activeStoryId  = null;
    this._testCases      = [];
    this._activeId       = null;
    this._filterStatus   = '';
    this._aiModelConfig  = null;
    // deep-link params: navigate directly to a specific item
    this._deepFeatureId  = params.featureId ?? null;
    this._deepStoryId    = params.storyId   ?? null;
    this._deepItemId     = params.itemId    ?? null;
  }

  async mount() {
    injectCss('pages/user-stories/user-stories.css');
    injectCss('components/feature-list/feature-list.css');
    injectCss('components/user-story-list/user-story-list.css');
    injectCss('pages/test-cases/test-cases-page.css');
    applyStoredTheme();

    this._project = await window.db.projects.get(this._projectId);
    this.container.innerHTML = this._template();

    this._modelConfigsModal = new ModelConfigsModal({ onConfigsChanged: () => this._reloadModelDropdown() });
    this._modelConfigsModal.mount();
    await this._reloadModelDropdown();

    this._qcmdModal = new QuickCommandsModal({ onRunCommand: () => this.router.navigate('user-stories', { projectId: this._projectId }) });
    this._qcmdModal.mount();

    this._git = new GitController({
      getTermCwd:           () => this._project?.project_path || '',
      gitBtnId:             'tcBtnGit',
      gitBadgeId:           'tcGitBadge',
      controlBtnVisibility: false,
    });
    this._git.mount();

    this._bindHeaderEvents();
    if (this._project?.project_path) {
      this._setHeaderFolderPath(this._project.project_path);
      this._git.refreshStatus();
      this._git.startPoll();
    }
    this._initFeatureToggle();
    this._initResizable();
    await this._mountFeatureList();
  }

  unmount() {
    removeCss('pages/test-cases/test-cases-page.css');
    removeCss('components/user-story-list/user-story-list.css');
    removeCss('components/feature-list/feature-list.css');
    removeCss('pages/user-stories/user-stories.css');
    this._git?.stopPoll();
  }

  // ----------------------------------------------------------------
  // Template — 4-panel layout
  // Features 15% | Stories 25% | TC List 25% | TC Detail flex:1
  // ----------------------------------------------------------------
  _template() {
    const name = this._project ? escHtml(this._project.name) : 'Project';
    return `
      <div class="project-page">

        <header class="project-page__header">
          <button class="project-page__back" id="tcBtnBack" aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="project-page__title-group">
            <h1 class="project-page__title">${name}</h1>
            <p class="project-page__desc">Test Cases</p>
          </div>
          <div class="project-page__header-actions" style="-webkit-app-region:no-drag;">
            <select class="tc-header-select" id="tcStatusFilter" title="Filter by status">
              <option value="">All Statuses</option>
              <option value="not_run">Not Run</option>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
              <option value="blocked">Blocked</option>
            </select>
            <div class="project-page__folder-display" id="headerFolderDisplay">
              <div class="project-page__folder-pill">
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                  <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                    stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                </svg>
                <span class="project-page__folder-text" id="headerFolderText">Select folder</span>
              </div>
            </div>
            <div class="project-page__model-group">
              <select class="project-page__model-select" id="tcModelSelect" title="AI Model">
                <option value="">Loading…</option>
              </select>
              <button class="project-page__model-cfg-btn" id="tcBtnModelConfigs" title="Configure AI models">
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
                    stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <button class="project-page__git-btn" id="tcBtnGit" title="Git (opens User Stories)">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
                <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <span class="project-page__git-badge" id="tcGitBadge" hidden></span>
            </button>
            <button class="project-page__qcmd-btn" id="tcBtnQcmd" title="Quick Commands">
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
          <aside class="project-panel" id="tcPanelFeatures">
            <div class="project-panel__header">
              <span class="project-panel__title">Features</span>
              <div class="project-panel__actions">
                <button class="project-panel__add project-panel__toggle" id="tcBtnToggleFeatures" title="Collapse features" aria-label="Collapse features">
                  <svg class="tc-toggle-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
            <button id="tcBtnAddFeature" style="display:none;" aria-hidden="true"></button>
            <div class="project-panel__list" id="tcFeatureList"></div>
          </aside>

          <div class="project-panel__resize" data-resize="tc-features"></div>

          <!-- Panel 2: User Stories — 25% -->
          <aside class="project-panel" id="tcPanelStories">
            <div class="project-panel__header">
              <span class="project-panel__title">User Stories</span>
            </div>
            <div class="project-panel__list" id="tcStoryList">
              <div class="project-panel__empty"><p>Select a feature</p></div>
            </div>
          </aside>

          <div class="project-panel__resize" data-resize="tc-stories"></div>

          <!-- Panel 3: Test Cases list — 25% -->
          <aside class="project-panel" id="tcPanelCasesList">
            <div class="project-panel__header">
              <span class="project-panel__title">Test Cases</span>
              <div class="project-panel__actions">
                <button class="project-panel__add" id="tcBtnAdd" title="Add test case" aria-label="Add test case">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="project-panel__list" id="tcCasesList">
              <div class="tc-empty">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
                <p>Select a user story</p>
              </div>
            </div>
          </aside>

          <div class="project-panel__resize" data-resize="tc-cases"></div>

          <!-- Panel 4: Test Case detail — flex:1 -->
          <section class="project-panel project-panel--detail" id="tcPanelDetail">
            <div class="project-panel__header">
              <span class="project-panel__title">Detail</span>
            </div>
            <div class="project-panel__content" id="tcCasesDetail">
              <div class="project-panel__empty">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
                <p>Select a test case or add a new one</p>
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
    const select = this.container.querySelector('#tcModelSelect');
    if (!select) return;
    const configs = await window.db.modelConfigs.list();
    const storedId = Number(localStorage.getItem('devflow-selected-model')) || null;
    const prevId   = storedId || (select.value ? Number(select.value) : null);
    select.innerHTML = configs.length === 0
      ? `<option value="">No models configured</option>`
      : configs.map(c => `<option value="${c.id}">${escHtml(c.label)} [${c.type.toUpperCase()}]</option>`).join('');
    const def    = configs.find(c => c.is_default) || configs[0];
    const target = configs.find(c => c.id === prevId) || def;
    if (target) { select.value = target.id; this._aiModelConfig = target; }
  }

  _setHeaderFolderPath(folderPath) {
    const text    = this.container.querySelector('#headerFolderText');
    const display = this.container.querySelector('#headerFolderDisplay');
    if (!text || !display) return;
    text.textContent = folderPath;
    display.classList.add('project-page__folder-display--active');
  }

  _bindHeaderEvents() {
    this.container.querySelector('#tcBtnBack')
      .addEventListener('click', () => this.router.navigate('project-home', { projectId: this._projectId }));

    this.container.querySelector('#tcBtnModelConfigs')
      .addEventListener('click', () => this._modelConfigsModal.show());

    this.container.querySelector('#tcModelSelect')
      .addEventListener('change', (e) => {
        const id = Number(e.target.value);
        localStorage.setItem('devflow-selected-model', id);
        window.db.modelConfigs.get(id).then(cfg => { this._aiModelConfig = cfg; });
      });

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

    this.container.querySelector('#tcBtnGit')
      .addEventListener('click', () =>
        this.router.navigate('git-changes', { projectId: this._projectId, from: 'test-cases' }));

    this.container.querySelector('#tcBtnQcmd')
      .addEventListener('click', () => this._qcmdModal.show());

    this.container.querySelector('#tcBtnAdd')
      .addEventListener('click', () => this._showAddForm());

    this.container.querySelector('#tcStatusFilter')
      .addEventListener('change', async (e) => {
        this._filterStatus = e.target.value;
        await this._loadTestCases();
      });
  }

  // ----------------------------------------------------------------
  // Feature panel collapse/expand
  // ----------------------------------------------------------------
  _initFeatureToggle() {
    const panel        = this.container.querySelector('#tcPanelFeatures');
    const toggleBtn    = this.container.querySelector('#tcBtnToggleFeatures');
    const resizeHandle = panel.nextElementSibling;
    const icon         = toggleBtn.querySelector('.tc-toggle-icon');

    let savedFlex = '0 0 15%';

    toggleBtn.addEventListener('click', () => {
      const isCollapsed = panel.classList.toggle('project-panel--collapsed');

      if (isCollapsed) {
        savedFlex              = panel.style.flex || '0 0 15%';
        panel.style.flex       = '0 0 32px';
        resizeHandle.style.display = 'none';
        toggleBtn.title = 'Expand features';
        toggleBtn.setAttribute('aria-label', 'Expand features');
        icon.innerHTML = '<path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
      } else {
        panel.style.flex       = savedFlex;
        resizeHandle.style.display = '';
        toggleBtn.title = 'Collapse features';
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
      listEl:    this.container.querySelector('#tcFeatureList'),
      addBtn:    this.container.querySelector('#tcBtnAddFeature'),
      projectId: this._projectId,
      onSelect:  (feature) => this._onFeatureSelected(feature),
    });
    await this._featureList.mount();

    if (this._deepFeatureId) {
      const card = this.container.querySelector(`#tcFeatureList .fl-card[data-id="${this._deepFeatureId}"]`);
      this._deepFeatureId = null;
      if (card) { card.click(); return; }
    }
    const firstCard = this.container.querySelector('#tcFeatureList .fl-card');
    if (firstCard) firstCard.click();
  }

  async _onFeatureSelected(feature) {
    this._activeFeature = feature;
    this._activeStoryId = null;
    this._activeId      = null;
    this._testCases     = [];
    this._renderTestCases();
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
      const deepId = this._deepStoryId;
      this._deepStoryId = null;
      const targetId = (deepId && this._stories.some(s => s.id === deepId))
        ? deepId
        : this._stories[0].id;
      await this._selectStory(targetId);
    }
  }

  _renderStories() {
    const listEl = this.container.querySelector('#tcStoryList');
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

    this.container.querySelectorAll('#tcStoryList .usl-card').forEach(c =>
      c.classList.toggle('usl-card--active', parseInt(c.dataset.story) === storyId)
    );

    this._showEmptyDetail();
    await this._loadTestCases();
  }

  // ----------------------------------------------------------------
  // Test cases list panel
  // ----------------------------------------------------------------
  async _loadTestCases() {
    if (!this._activeStoryId) {
      this._testCases = [];
      this._renderTestCases();
      return;
    }
    const filters = { project_id: this._projectId, user_story_id: this._activeStoryId };
    if (this._filterStatus) filters.status = this._filterStatus;
    this._testCases = await window.db.testCases.list(filters);
    this._renderTestCases();

    if (this._activeId && !this._testCases.find(tc => tc.id === this._activeId)) {
      this._activeId = null;
      this._showEmptyDetail();
    }

    if (this._deepItemId) {
      const tc = this._testCases.find(t => t.id === this._deepItemId);
      if (tc) { this._deepItemId = null; this._selectCase(tc.id); }
    }
  }

  _renderTestCases() {
    const listEl = this.container.querySelector('#tcCasesList');
    if (!listEl) return;

    if (this._testCases.length === 0) {
      listEl.innerHTML = `
        <div class="tc-empty">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <p>${this._activeStoryId ? 'No test cases for this story' : 'Select a user story'}</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = this._testCases.map(tc => this._cardHtml(tc)).join('');

    listEl.querySelectorAll('.tc-card').forEach(card => {
      const id = parseInt(card.dataset.id);
      card.addEventListener('click', () => this._selectCase(id));
      card.querySelector('.tc-card__del')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this._deleteCase(id);
      });
    });

    if (this._activeId) {
      this.container.querySelector(`.tc-card[data-id="${this._activeId}"]`)
        ?.classList.add('tc-card--active');
    }
  }

  _cardHtml(tc) {
    const sm = STATUS_META[tc.status]     || STATUS_META.not_run;
    const pm = PRIORITY_META[tc.priority] || PRIORITY_META.medium;
    return `
      <div class="tc-card${tc.id === this._activeId ? ' tc-card--active' : ''}" data-id="${tc.id}">
        <div class="tc-card__header">
          <span class="tc-card__title">${escHtml(tc.title)}</span>
          <button class="tc-card__del" title="Delete" aria-label="Delete">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8M5.5 6v4M8.5 6v4"
                stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <div class="tc-card__footer">
          <span class="tc-status-badge ${sm.cls}">${sm.label}</span>
          <span class="tc-priority-badge ${pm.cls}">${pm.label}</span>
        </div>
      </div>
    `;
  }

  _selectCase(id) {
    this._activeId = id;
    this.container.querySelectorAll('.tc-card').forEach(c =>
      c.classList.toggle('tc-card--active', parseInt(c.dataset.id) === id)
    );
    const tc = this._testCases.find(t => t.id === id);
    if (tc) this._showEditForm(tc);
  }

  async _deleteCase(id) {
    const ok = await this._showConfirm('Delete this test case?', 'Delete');
    if (!ok) return;
    await window.db.testCases.delete(id);
    if (this._activeId === id) { this._activeId = null; this._showEmptyDetail(); }
    await this._loadTestCases();
  }

  // ----------------------------------------------------------------
  // Detail panel (Panel 4)
  // ----------------------------------------------------------------
  _showEmptyDetail() {
    const el = this.container.querySelector('#tcCasesDetail');
    if (!el) return;
    el.innerHTML = `
      <div class="project-panel__empty">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        <p>Select a test case or add a new one</p>
      </div>
    `;
  }

  _showAddForm() {
    this._activeId = null;
    this.container.querySelectorAll('.tc-card').forEach(c => c.classList.remove('tc-card--active'));
    const el = this.container.querySelector('#tcCasesDetail');
    el.innerHTML = this._formHtml(null);
    this._bindFormEvents(el, null);
    el.querySelector('#tcFormTitle')?.focus();
  }

  _showEditForm(tc) {
    const el = this.container.querySelector('#tcCasesDetail');
    el.innerHTML = this._formHtml(tc);
    this._bindFormEvents(el, tc);
  }

  // ----------------------------------------------------------------
  // Form
  // ----------------------------------------------------------------
  _formHtml(tc) {
    const isEdit = !!tc;
    const statusOptions = Object.entries(STATUS_META).map(([val, m]) =>
      `<option value="${val}"${(tc?.status ?? 'not_run') === val ? ' selected' : ''}>${m.label}</option>`
    ).join('');
    const priorityOptions = Object.entries(PRIORITY_META).map(([val, m]) =>
      `<option value="${val}"${(tc?.priority ?? 'medium') === val ? ' selected' : ''}>${m.label}</option>`
    ).join('');

    return `
      <div class="tc-form">
        <div class="tc-form__header">
          <h2 class="tc-form__heading">${isEdit ? 'Edit Test Case' : 'Add Test Case'}</h2>
          <select class="tc-header-select" id="tcFormStatus">${statusOptions}</select>
        </div>

        <div class="tc-form__body">

          <div class="tc-form__field">
            <label class="tc-form__label" for="tcFormTitle">Title <span class="tc-form__required">*</span></label>
            <input class="tc-form__input" id="tcFormTitle" type="text" maxlength="200"
              placeholder="Verify that…" autocomplete="off" value="${escHtml(tc?.title || '')}"/>
          </div>

          <div class="tc-form__field">
            <label class="tc-form__label" for="tcFormPriority">Priority</label>
            <select class="tc-form__select" id="tcFormPriority">${priorityOptions}</select>
          </div>

          <div class="tc-form__field">
            <label class="tc-form__label" for="tcFormDesc">Description</label>
            <textarea class="tc-form__textarea" id="tcFormDesc" rows="2"
              placeholder="What does this test verify?">${escHtml(tc?.description || '')}</textarea>
          </div>

          <div class="tc-form__field">
            <label class="tc-form__label" for="tcFormSteps">Test Steps</label>
            <textarea class="tc-form__textarea tc-form__textarea--steps" id="tcFormSteps" rows="6"
              placeholder="1. Navigate to…&#10;2. Click…&#10;3. Enter…">${escHtml(tc?.test_steps || '')}</textarea>
          </div>

          <div class="tc-form__field">
            <label class="tc-form__label" for="tcFormExpected">Expected Result</label>
            <textarea class="tc-form__textarea" id="tcFormExpected" rows="4"
              placeholder="The system should…">${escHtml(tc?.expected_result || '')}</textarea>
          </div>

          <div class="tc-form__field">
            <label class="tc-form__label tc-form__label--actual" for="tcFormActual">
              Actual Result
              <span class="tc-form__label-hint">(fill in after running)</span>
            </label>
            <textarea class="tc-form__textarea" id="tcFormActual" rows="4"
              placeholder="What actually happened…">${escHtml(tc?.actual_result || '')}</textarea>
          </div>

        </div>

        <div class="tc-form__footer">
          <button class="tc-form__btn" id="tcFormSave">${isEdit ? 'Save Changes' : 'Add Test Case'}</button>
        </div>
      </div>
    `;
  }

  _bindFormEvents(el, tc) {
    const titleEl    = el.querySelector('#tcFormTitle');
    const priorityEl = el.querySelector('#tcFormPriority');
    const statusEl   = el.querySelector('#tcFormStatus');
    const descEl     = el.querySelector('#tcFormDesc');
    const stepsEl    = el.querySelector('#tcFormSteps');
    const expectedEl = el.querySelector('#tcFormExpected');
    const actualEl   = el.querySelector('#tcFormActual');
    const saveBtn    = el.querySelector('#tcFormSave');

    if (tc) {
      statusEl.addEventListener('change', async () => {
        await window.db.testCases.update({ id: tc.id, status: statusEl.value });
        this._refreshCardBadges(tc.id, statusEl.value, priorityEl.value);
      });
    }

    const save = async () => {
      const title = titleEl.value.trim();
      if (!title) { titleEl.classList.add('tc-form__input--error'); titleEl.focus(); return; }
      titleEl.classList.remove('tc-form__input--error');
      saveBtn.disabled    = true;
      saveBtn.textContent = tc ? 'Saving…' : 'Adding…';

      const payload = {
        project_id:      this._projectId,
        user_story_id:   this._activeStoryId ?? null,
        feature_id:      this._activeFeature?.id ?? null,
        title,
        description:     descEl.value.trim()     || null,
        test_steps:      stepsEl.value.trim()     || null,
        expected_result: expectedEl.value.trim()  || null,
        actual_result:   actualEl.value.trim()    || null,
        status:          statusEl.value,
        priority:        priorityEl.value,
      };

      try {
        if (tc) {
          const updated = await window.db.testCases.update({ id: tc.id, ...payload });
          const idx = this._testCases.findIndex(t => t.id === tc.id);
          if (idx !== -1) this._testCases[idx] = updated;
          this._renderTestCases();
          this._selectCase(tc.id);
        } else {
          const created = await window.db.testCases.create(payload);
          this._testCases.unshift(created);
          this._renderTestCases();
          this._selectCase(created.id);
        }
      } catch {
        saveBtn.disabled    = false;
        saveBtn.textContent = tc ? 'Save Changes' : 'Add Test Case';
      }
    };

    saveBtn.addEventListener('click', save);
    el.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 's') { e.preventDefault(); save(); } });
  }

  _refreshCardBadges(id, status, priority) {
    const cardEl = this.container.querySelector(`.tc-card[data-id="${id}"]`);
    if (!cardEl) return;
    const sm = STATUS_META[status]     || STATUS_META.not_run;
    const pm = PRIORITY_META[priority] || PRIORITY_META.medium;
    const sb = cardEl.querySelector('.tc-status-badge');
    const pb = cardEl.querySelector('.tc-priority-badge');
    if (sb) { sb.className = `tc-status-badge ${sm.cls}`; sb.textContent = sm.label; }
    if (pb) { pb.className = `tc-priority-badge ${pm.cls}`; pb.textContent = pm.label; }
    const idx = this._testCases.findIndex(t => t.id === id);
    if (idx !== -1) { this._testCases[idx].status = status; this._testCases[idx].priority = priority; }
  }

  // ----------------------------------------------------------------
  // Resizable panels
  // ----------------------------------------------------------------
  _initResizable() {
    const PANEL_MAP = {
      'tc-features': { elId: 'tcPanelFeatures',   min: 120, dir: 1 },
      'tc-stories':  { elId: 'tcPanelStories',     min: 140, dir: 1 },
      'tc-cases':    { elId: 'tcPanelCasesList',   min: 140, dir: 1 },
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
      overlay.className = 'tc-confirm-overlay';
      overlay.innerHTML = `
        <div class="tc-confirm-dialog">
          <p class="tc-confirm-msg">${escHtml(message)}</p>
          <div class="tc-confirm-btns">
            <button class="tc-confirm-btn tc-confirm-btn--cancel">Cancel</button>
            <button class="tc-confirm-btn tc-confirm-btn--ok">${escHtml(confirmLabel)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const cleanup = (r) => { overlay.remove(); resolve(r); };
      overlay.querySelector('.tc-confirm-btn--cancel').addEventListener('click', () => cleanup(false));
      overlay.querySelector('.tc-confirm-btn--ok').addEventListener('click',    () => cleanup(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
    });
  }
}
