import { injectCss, removeCss, escHtml } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { UserStoryDetail } from '../../components/user-story-detail/user-story-detail.js';
import { GitController } from '../../components/git/git-controller.js';
import { QuickCommandsModal } from '../../components/quick-commands/quick-commands-modal.js';
import { ModelConfigsModal } from '../../components/model-configs/model-configs-modal.js';

export class ExtractUserStoriesPage {
  constructor(container, params, router) {
    this.container          = container;
    this.router             = router;
    this._projectId         = params.projectId;
    this._mockups           = [];
    this._selectedMockupId  = null;
    this._features           = [];
    this._selectedFeatureId  = null;
    this._documents           = [];
    this._selectedDocumentIds = new Set();
    this._existingStories     = [];
    this._extractedStories    = [];
    this._statuses            = [];
    this._detail              = null;
    this._project             = null;
    this._aiModelConfig       = null;
    this._git                 = null;
    this._modelConfigsModal   = null;
    this._qcmdModal           = null;
  }

  async mount() {
    injectCss('pages/user-stories/user-stories.css');
    injectCss('pages/extract-user-stories/extract-user-stories-page.css');
    applyStoredTheme();

    this._project = await window.db.projects.get(this._projectId);
    this.container.innerHTML = this._template();

    this._git = new GitController({ getTermCwd: () => this._project?.project_path || '' });
    this._git.mount();
    if (this._project?.project_path) {
      this._git.refreshStatus();
      this._git.startPoll();
      this._setHeaderFolderPath(this._project.project_path);
    }

    this._modelConfigsModal = new ModelConfigsModal({
      onConfigsChanged: () => this._reloadModelDropdown(),
    });
    this._modelConfigsModal.mount();
    await this._reloadModelDropdown();

    this._qcmdModal = new QuickCommandsModal({ onRunCommand: () => {} });
    this._qcmdModal.mount();

    this._detail = new UserStoryDetail({
      detailEl:        this.container.querySelector('#eusDetailContent'),
      headerActionsEl: this.container.querySelector('#eusDetailActions'),
      projectId:       this._projectId,
    });
    await this._detail.mount();
    this._detail.showEmpty();

    this._statuses = await window.db.status.list();
    this._bindEvents();
    await Promise.all([this._loadMockups(), this._loadFeatures(), this._loadDocuments()]);
  }

  unmount() {
    removeCss('pages/extract-user-stories/extract-user-stories-page.css');
    removeCss('pages/user-stories/user-stories.css');
    this._git?.stopPoll();
  }

  _template() {
    return `
      <div class="project-page">

        <!-- Header -->
        <header class="project-page__header">
          <button class="project-page__back" id="eusBtnBack" aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="project-page__title-group">
            <h1 class="project-page__title">Extract User Stories</h1>
            <p class="project-page__desc">Generate user stories from project documents</p>
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
          <button class="eus-generate-btn" id="eusBtnGenerate" style="-webkit-app-region:no-drag;">
            Generate User Stories
          </button>
          <div class="project-page__model-group">
            <select class="project-page__model-select" id="aiModelSelect" title="AI Model">
              <option value="">Loading…</option>
            </select>
            <button class="project-page__model-cfg-btn" id="btnModelConfigs" title="Configure AI models">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <button class="project-page__git-btn" id="btnConsoleGit" title="Git changes" hidden style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
              <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span class="project-page__git-badge" id="gitBadge" hidden></span>
          </button>
          <button class="project-page__qcmd-btn" id="btnHeaderQcmd" title="Quick Commands" style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="4" cy="6"  r="1.5" fill="currentColor"/>
              <circle cx="4" cy="10" r="1.5" fill="currentColor"/>
              <circle cx="4" cy="14" r="1.5" fill="currentColor"/>
              <path d="M8 6h8M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </header>

        <!-- Body -->
        <div class="project-page__body">

          <!-- Workspace: 3 resizable columns -->
          <div class="project-page__workspace">

            <!-- 1. Documents (3 sub-sections: Mockups, Features, Documents) -->
            <aside class="project-panel eus-sources-panel" id="eusDocuments">
              <div class="project-panel__header">
                <span class="project-panel__title">Sources</span>
                <div class="project-panel__actions"></div>
              </div>

              <!-- 1a. Features -->
              <div class="project-related__section" id="eusFeaturesSection">
                <div class="project-related__section-hd">
                  <span class="project-related__section-label">Features</span>
                  <span class="project-related__section-count" id="eusFeaturesCount">0</span>
                </div>
                <div class="project-related__section-body" id="eusFeaturesList">
                  <div class="project-related__empty">No features</div>
                </div>
              </div>

              <div class="project-related__inner-resize"></div>

              <!-- 1b. Mockups -->
              <div class="project-related__section" id="eusMockupsSection">
                <div class="project-related__section-hd">
                  <span class="project-related__section-label">Mockups</span>
                  <span class="project-related__section-count" id="eusMockupsCount">0</span>
                </div>
                <div class="project-related__section-body" id="eusMockupsList">
                  <div class="project-related__empty">No mockups</div>
                </div>
              </div>

              <div class="project-related__inner-resize"></div>

              <!-- 1c. Documents -->
              <div class="project-related__section" id="eusDocumentsSection">
                <div class="project-related__section-hd">
                  <span class="project-related__section-label">Documents</span>
                  <span class="project-related__section-count" id="eusDocumentsCount">0</span>
                </div>
                <div class="project-related__section-body" id="eusDocumentsList">
                  <div class="project-related__empty">No documents</div>
                </div>
              </div>

            </aside>

            <div class="project-panel__resize" data-resize="eus-documents"></div>

            <!-- 2. Stories (Existing + Extracted) -->
            <aside class="project-panel eus-stories-panel" id="eusExtracted">
              <div class="project-panel__header">
                <span class="project-panel__title">User Stories</span>
                <div class="project-panel__actions"></div>
              </div>

              <!-- 2a. Existing User Stories -->
              <div class="project-related__section" id="eusExistingSection">
                <div class="project-related__section-hd">
                  <span class="project-related__section-label">Existing User Stories</span>
                  <span class="project-related__section-count" id="eusExistingCount">0</span>
                </div>
                <div class="project-related__section-body" id="eusExistingList">
                  <div class="project-related__empty">No user stories</div>
                </div>
              </div>

              <div class="project-related__inner-resize"></div>

              <!-- 2b. Extracted User Stories -->
              <div class="project-related__section" id="eusExtractedSection">
                <div class="project-related__section-hd">
                  <span class="project-related__section-label">Extracted User Stories</span>
                  <span class="project-related__section-count" id="eusExtractedCount">0</span>
                </div>
                <div class="project-related__section-body" id="eusExtractedList">
                  <div class="project-related__empty">No stories extracted yet</div>
                </div>
              </div>

            </aside>

            <div class="project-panel__resize" data-resize="eus-extracted"></div>

            <!-- 3. Story Detail -->
            <section class="project-panel project-panel--detail" id="eusDetail">
              <div class="project-panel__header">
                <span class="project-panel__title">Story Detail</span>
                <div class="project-panel__actions" id="eusDetailActions"></div>
              </div>
              <div class="project-panel__content" id="eusDetailContent">
                <div class="project-panel__empty">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="12" stroke="#4b5563" stroke-width="1.4"/>
                    <path d="M16 11v5l3 3" stroke="#4b5563" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <p>Select a story to view details</p>
                </div>
              </div>
            </section>

          </div><!-- /.project-page__workspace -->


        </div><!-- /.project-page__body -->
      </div>
    `;
  }

  async _reloadModelDropdown() {
    const select = this.container.querySelector('#aiModelSelect');
    if (!select) return;
    const configs  = await window.db.modelConfigs.list();
    const storedId   = Number(localStorage.getItem('devflow-selected-model')) || null;
    const prevId     = storedId || (select.value ? Number(select.value) : null);
    select.innerHTML = configs.length === 0
      ? `<option value="">No models configured</option>`
      : configs.map(c =>
          `<option value="${c.id}">${escHtml(c.label)} [${c.type.toUpperCase()}]</option>`
        ).join('');
    const defaultCfg = configs.find(c => c.is_default) || configs[0];
    const target     = configs.find(c => c.id === prevId) || defaultCfg;
    if (target) {
      select.value        = target.id;
      this._aiModelConfig = target;
    }
  }

  _setHeaderFolderPath(folderPath) {
    const text    = this.container.querySelector('#headerFolderText');
    const display = this.container.querySelector('#headerFolderDisplay');
    if (!text || !display) return;
    text.textContent = folderPath;
    display.classList.add('project-page__folder-display--active');
  }

  _bindEvents() {
    this.container.querySelector('#eusBtnBack')
      .addEventListener('click', () => this.router.navigate('project-home', { projectId: this._projectId }));

    this.container.querySelector('#headerFolderDisplay')
      .addEventListener('click', async () => {
        const folderPath = await window.db.dialog.openFolder();
        if (!folderPath) return;
        await window.db.projects.setPath({ id: this._projectId, project_path: folderPath });
        if (this._project) this._project.project_path = folderPath;
        this._git.refreshStatus();
        this._git.startPoll();
        this._setHeaderFolderPath(folderPath);
      });

    this.container.querySelector('#btnModelConfigs')
      .addEventListener('click', () => this._modelConfigsModal.show());

    this.container.querySelector('#aiModelSelect')
      .addEventListener('change', e => {
        const id = Number(e.target.value);
        localStorage.setItem('devflow-selected-model', id);
        window.db.modelConfigs.get(id).then(cfg => { this._aiModelConfig = cfg; });
      });

    this.container.querySelector('#btnConsoleGit')
      .addEventListener('click', () =>
        this.router.navigate('git-changes', { projectId: this._projectId, from: 'extract-user-stories' }));

    this.container.querySelector('#btnHeaderQcmd')
      .addEventListener('click', () => this._qcmdModal.show());

    this.container.querySelector('#eusBtnGenerate')
      .addEventListener('click', () => this._handleGenerate());

    this.container.querySelector('#eusMockupsList')
      .addEventListener('click', e => {
        const item = e.target.closest('.eus-src-item');
        if (!item) return;
        this._selectMockup(Number(item.dataset.id));
      });

    this.container.querySelector('#eusFeaturesList')
      .addEventListener('click', e => {
        const item = e.target.closest('.eus-src-item');
        if (!item) return;
        this._selectFeature(Number(item.dataset.id));
      });

    this.container.querySelector('#eusExistingList')
      .addEventListener('click', e => {
        const item = e.target.closest('.eus-src-item');
        if (!item) return;
        const story = this._existingStories.find(s => s.id === Number(item.dataset.id));
        if (!story) return;
        this._highlightStory(item);
        this._detail.showEditForm(story);
      });

    this.container.querySelector('#eusExtractedList')
      .addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (btn) {
          const id = Number(btn.closest('.eus-src-item')?.dataset.id);
          if (!id) return;
          if (btn.dataset.action === 'delete')  this._deleteExtractedStory(id);
          if (btn.dataset.action === 'promote') this._promoteToUserStory(id);
          return;
        }
        const item = e.target.closest('.eus-src-item');
        if (!item) return;
        const story = this._extractedStories.find(s => s.id === Number(item.dataset.id));
        if (!story) return;
        this._highlightStory(item);
        this._detail.showEditForm(story);
      });

    this.container.querySelector('#eusDocumentsList')
      .addEventListener('click', e => {
        const item = e.target.closest('.eus-src-item');
        if (!item) return;
        this._toggleDocument(Number(item.dataset.id));
      });
  }

  async _loadMockups() {
    this._mockups = await window.db.screenDesigns.list(this._projectId) ?? [];
    if (this._mockups.length && !this._selectedMockupId) {
      this._selectedMockupId = this._mockups[0].id;
    }
    this._renderMockups();
  }

  _renderMockups() {
    const list = this.container.querySelector('#eusMockupsList');
    const count = this.container.querySelector('#eusMockupsCount');
    count.textContent = this._mockups.length;

    if (!this._mockups.length) {
      list.innerHTML = '<div class="project-related__empty">No mockups</div>';
      return;
    }

    list.innerHTML = this._mockups.map(m => `
      <div class="eus-src-item${m.id === this._selectedMockupId ? ' eus-src-item--active' : ''}" data-id="${m.id}">
        <svg class="eus-src-item__icon" width="11" height="11" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
        </svg>
        <div class="eus-src-item__info">
          <span class="eus-src-item__id">#${m.id}</span>
          <span class="eus-src-item__title">${escHtml(m.title)}</span>
        </div>
      </div>
    `).join('');
  }

  _selectMockup(id) {
    this._selectedMockupId = this._selectedMockupId === id ? null : id;
    this._renderMockups();
  }

  async _loadFeatures() {
    this._features = await window.db.features.list(this._projectId) ?? [];
    this._renderFeatures();
    if (this._features.length && !this._selectedFeatureId) {
      await this._selectFeature(this._features[0].id);
    }
  }

  _renderFeatures() {
    const list = this.container.querySelector('#eusFeaturesList');
    const count = this.container.querySelector('#eusFeaturesCount');
    count.textContent = this._features.length;

    if (!this._features.length) {
      list.innerHTML = '<div class="project-related__empty">No features</div>';
      return;
    }

    list.innerHTML = this._features.map(f => `
      <div class="eus-src-item${f.id === this._selectedFeatureId ? ' eus-src-item--active' : ''}" data-id="${f.id}">
        <svg class="eus-src-item__icon" width="11" height="11" viewBox="0 0 16 16" fill="none">
          <path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <div class="eus-src-item__info">
          <span class="eus-src-item__id">#${f.id}</span>
          <span class="eus-src-item__title">${escHtml(f.name)}</span>
        </div>
      </div>
    `).join('');
  }

  async _selectFeature(id) {
    this._selectedFeatureId = this._selectedFeatureId === id ? null : id;
    this._renderFeatures();
    this._detail.setContext(this._selectedFeatureId, this._statuses);
    this._detail.showEmpty();
    await Promise.all([this._loadExistingStories(), this._loadExtractedStories()]);

    if (this._existingStories.length) {
      const first = this._existingStories[0];
      const item  = this.container.querySelector(`#eusExistingList [data-id="${first.id}"]`);
      if (item) this._highlightStory(item);
      this._detail.showEditForm(first);
    }
  }

  _highlightStory(clickedItem) {
    this.container.querySelectorAll('#eusExistingList .eus-src-item, #eusExtractedList .eus-src-item')
      .forEach(el => el.classList.remove('eus-src-item--active'));
    clickedItem.classList.add('eus-src-item--active');
  }

  async _loadDocuments() {
    this._documents = await window.db.documents.list(this._projectId) ?? [];
    const defaultTitles = new Set(['Project Overview', 'Architecture Overview', 'Tech Stack']);
    this._documents.forEach(d => {
      if (defaultTitles.has(d.title)) this._selectedDocumentIds.add(d.id);
    });
    this._renderDocuments();
  }

  _renderDocuments() {
    const list = this.container.querySelector('#eusDocumentsList');
    const count = this.container.querySelector('#eusDocumentsCount');
    count.textContent = this._documents.length;

    if (!this._documents.length) {
      list.innerHTML = '<div class="project-related__empty">No documents</div>';
      return;
    }

    list.innerHTML = this._documents.map(d => {
      const checked = this._selectedDocumentIds.has(d.id);
      return `
        <div class="eus-src-item${checked ? ' eus-src-item--active' : ''}" data-id="${d.id}">
          <span class="eus-src-checkbox${checked ? ' eus-src-checkbox--checked' : ''}">
            ${checked ? `<svg width="9" height="9" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>` : ''}
          </span>
          <div class="eus-src-item__info">
            <span class="eus-src-item__title">${escHtml(d.title)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  _toggleDocument(id) {
    if (this._selectedDocumentIds.has(id)) {
      this._selectedDocumentIds.delete(id);
    } else {
      this._selectedDocumentIds.add(id);
    }
    this._renderDocuments();
  }

  async _loadExistingStories() {
    const list = this.container.querySelector('#eusExistingList');
    const count = this.container.querySelector('#eusExistingCount');

    if (!this._selectedFeatureId) {
      this._existingStories = [];
      count.textContent = '0';
      list.innerHTML = '<div class="project-related__empty">Select a feature</div>';
      return;
    }

    this._existingStories = await window.db.userStories.list({ feature_id: this._selectedFeatureId }) ?? [];
    count.textContent = this._existingStories.length;

    if (!this._existingStories.length) {
      list.innerHTML = '<div class="project-related__empty">No user stories</div>';
      return;
    }

    list.innerHTML = this._existingStories.map(s => `
      <div class="eus-src-item" data-id="${s.id}">
        <div class="eus-src-item__info">
          <span class="eus-src-item__id">#${s.id}</span>
          <span class="eus-src-item__title">${escHtml(s.title)}</span>
        </div>
      </div>
    `).join('');
  }

  async _loadExtractedStories() {
    const list = this.container.querySelector('#eusExtractedList');
    const count = this.container.querySelector('#eusExtractedCount');

    if (!this._selectedFeatureId) {
      this._extractedStories = [];
      count.textContent = '0';
      list.innerHTML = '<div class="project-related__empty">Select a feature</div>';
      return;
    }

    const all = await window.db.userStories.list({ feature_id: this._selectedFeatureId, include_extracted: true }) ?? [];
    this._extractedStories = all.filter(s => s.is_extracted);
    count.textContent = this._extractedStories.length;

    if (!this._extractedStories.length) {
      list.innerHTML = '<div class="project-related__empty">No stories extracted yet</div>';
      return;
    }

    list.innerHTML = this._extractedStories.map(s => `
      <div class="eus-src-item" data-id="${s.id}">
        <div class="eus-src-item__info">
          <span class="eus-src-item__id">#${s.id}</span>
          <span class="eus-src-item__title">${escHtml(s.title)}</span>
        </div>
        <div class="eus-src-item__actions">
          <button class="eus-story-action eus-story-action--promote" data-action="promote" title="Move to User Stories">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M8 12V4M4 8l4-4 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="eus-story-action eus-story-action--delete" data-action="delete" title="Delete">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');
  }

  async _deleteExtractedStory(id) {
    const ok = await this._confirmDialog('Delete this extracted user story and all its prompts? This cannot be undone.', 'Delete', true);
    if (!ok) return;
    const prompts = await window.db.prompts.list(id);
    await Promise.all((prompts || []).map(p => window.db.prompts.delete(p.id)));
    await window.db.userStories.delete(id);
    this._detail.showEmpty();
    await this._loadExtractedStories();
  }

  async _promoteToUserStory(id) {
    await window.db.userStories.update({ id, is_extracted: 0 });
    await Promise.all([this._loadExistingStories(), this._loadExtractedStories()]);
    const story = this._existingStories.find(s => s.id === id);
    if (!story) return;
    const item = this.container.querySelector(`#eusExistingList [data-id="${id}"]`);
    if (item) this._highlightStory(item);
    this._detail.showEditForm(story);
  }

  _confirmDialog(message, confirmLabel = 'OK', isDanger = false) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'usl-confirm-overlay';
      overlay.innerHTML = `
        <div class="usl-confirm-dialog">
          <p class="usl-confirm-msg">${escHtml(message)}</p>
          <div class="usl-confirm-btns">
            <button class="usl-confirm-btn usl-confirm-btn--cancel">Cancel</button>
            <button class="usl-confirm-btn ${isDanger ? 'usl-confirm-btn--danger' : 'usl-confirm-btn--ok'}">${escHtml(confirmLabel)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const close = (val) => { overlay.remove(); resolve(val); };
      overlay.querySelector('.usl-confirm-btn--cancel').addEventListener('click', () => close(false));
      overlay.querySelector(isDanger ? '.usl-confirm-btn--danger' : '.usl-confirm-btn--ok').addEventListener('click', () => close(true));
      overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    });
  }

  async _handleGenerate() {
    const missing = [];
    if (!this._selectedFeatureId)        missing.push('Feature');
    if (!this._selectedMockupId)         missing.push('Mockup');
    if (!this._selectedDocumentIds.size) missing.push('Document');

    if (missing.length) {
      this._showGenerateError(missing);
    } else {
      await this._showGenerateModal();
    }
  }

  _showGenerateError(missing) {
    const overlay = document.createElement('div');
    overlay.className = 'usl-confirm-overlay';
    overlay.innerHTML = `
      <div class="usl-confirm-dialog">
        <p class="usl-confirm-msg">
          Please select at least one <strong>${missing.join('</strong>, <strong>')}</strong> before generating.
        </p>
        <div class="usl-confirm-btns">
          <button class="usl-confirm-btn usl-confirm-btn--ok">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.usl-confirm-btn--ok').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  }

  async _showGenerateModal() {
    const feature = this._features.find(f => f.id === this._selectedFeatureId);
    const mockup  = await window.db.screenDesigns.get(this._selectedMockupId);
    const docs    = this._documents.filter(d => this._selectedDocumentIds.has(d.id));

    const overlay = document.createElement('div');
    overlay.className = 'eus-gen-overlay';
    overlay.innerHTML = `
      <div class="eus-gen-dialog">
        <div class="eus-gen-header">
          <span class="eus-gen-title">Generate User Stories</span>
          <button class="eus-gen-close" aria-label="Close">&times;</button>
        </div>
        <div class="eus-gen-sources">
          <div class="eus-gen-source-row">
            <span class="eus-gen-source-label">Feature</span>
            <span class="eus-gen-source-value">${escHtml(feature?.name || '')}</span>
          </div>
          <div class="eus-gen-source-row">
            <span class="eus-gen-source-label">Mockup</span>
            <span class="eus-gen-source-value">${escHtml(mockup?.title || '')}</span>
          </div>
          <div class="eus-gen-source-row">
            <span class="eus-gen-source-label">Documents</span>
            <span class="eus-gen-source-value">${docs.map(d => escHtml(d.title)).join(', ')}</span>
          </div>
        </div>
        <div class="eus-gen-body">
          <div class="eus-gen-mockup-pane">
            <div class="eus-gen-pane-header">
              <span class="eus-gen-pane-title">Mockup</span>
            </div>
            <div class="eus-gen-mockup-wrap">
              ${mockup?.html_content
                ? `<iframe class="eus-gen-mockup-frame" title="${escHtml(mockup.title)}"></iframe>`
                : `<div class="eus-gen-pane-empty">No mockup content</div>`}
            </div>
          </div>
          <div class="eus-gen-prompt-pane">
            <div class="eus-gen-pane-header">
              <span class="eus-gen-pane-title">Prompt</span>
              <span class="eus-gen-pane-hint">Review and edit before running</span>
            </div>
            <div class="eus-gen-prompt-body">
              <div class="eus-gen-pane-empty">Building prompt…</div>
            </div>
          </div>
        </div>
        <div class="eus-gen-footer">
          <div class="eus-gen-footer-left">
            <button class="eus-gen-btn eus-gen-btn--load-json" id="eusLoadJsonBtn">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Load JSON from Disk
            </button>
            <button class="eus-gen-btn eus-gen-btn--terminal" id="eusTerminalBtn" disabled>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.4"/>
                <path d="M4 6l3 3-3 3M8 12h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Run in Terminal
            </button>
          </div>
          <div class="eus-gen-footer-right">
            <button class="eus-gen-btn eus-gen-btn--run" disabled>Run</button>
            <button class="eus-gen-btn eus-gen-btn--cancel" id="eusGenCancelBtn" hidden>Cancel</button>
            <button class="eus-gen-btn eus-gen-btn--load-db" id="eusLoadToDbBtn" disabled>Load to DB</button>
            <button class="eus-gen-btn eus-gen-btn--close">Close</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    if (mockup?.html_content) {
      this._loadMockupPreview(overlay.querySelector('.eus-gen-mockup-frame'), mockup.html_content);
    }

    const close = () => {
      window.app.chat.offAll();
      overlay.remove();
    };
    overlay.querySelector('.eus-gen-close').addEventListener('click', close);
    overlay.querySelector('.eus-gen-btn--close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const runBtn      = overlay.querySelector('.eus-gen-btn--run');
    const terminalBtn = overlay.querySelector('#eusTerminalBtn');
    const loadJsonBtn = overlay.querySelector('#eusLoadJsonBtn');
    const loadToDbBtn = overlay.querySelector('#eusLoadToDbBtn');
    const promptBody  = overlay.querySelector('.eus-gen-prompt-body');

    const isCli = !this._aiModelConfig?.type || this._aiModelConfig.type === 'cli';
    if (!isCli) terminalBtn.hidden = true;

    loadJsonBtn.disabled = false;

    // Load JSON from Disk — defaults to terminal output file when available
    loadJsonBtn.addEventListener('click', async () => {
      const opts = { title: 'Load User Stories JSON', extensions: ['json'] };
      if (overlay._terminalOutputPath) opts.defaultPath = overlay._terminalOutputPath;
      const result = await window.db.dialog.openFile(opts);
      if (!result?.content) return;
      const content = result.content;
      overlay._rawJson = content;
      this._showRawResult(overlay, content, null);
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      let parsed = null;
      if (jsonMatch) { try { parsed = JSON.parse(jsonMatch[0]); } catch { /* fallthrough */ } }
      loadToDbBtn.disabled = !parsed?.UserStories?.length;
    });

    // Load to DB — saves whatever raw JSON is currently stored
    loadToDbBtn.addEventListener('click', () => this._saveStoriesToDb(overlay, loadToDbBtn, feature.id));

    // Build prompt and populate textarea
    try {
      const prompt = await this._buildPromptForModal(feature, mockup, docs);
      promptBody.innerHTML = `<textarea class="eus-gen-prompt-ta" id="eusGenPromptTa" spellcheck="false">${escHtml(prompt)}</textarea>`;
      runBtn.disabled = false;
      if (isCli) {
        terminalBtn.disabled = false;
        terminalBtn.addEventListener('click', () => this._handleRunInTerminal(overlay));
      }
      runBtn.addEventListener('click', () => this._handleRun(overlay, feature.id));
    } catch (err) {
      promptBody.innerHTML = `<div class="eus-gen-error">Failed to build prompt: ${escHtml(String(err))}</div>`;
    }
  }

  async _buildPromptForModal(feature, mockup, docs) {
    const isCli    = !this._aiModelConfig?.type || this._aiModelConfig.type === 'cli';
    const docsFull = await Promise.all(docs.map(d => window.db.documents.get(d.id)));

    if (isCli) {
      const filesToWrite = [
        { name: 'mockup.html', content: mockup.html_content || '' },
        ...docsFull.map((d, i) => ({ name: `doc-${i}.md`, content: d?.content || '' })),
      ];
      const paths = await window.app.writeTempFiles(filesToWrite);
      const [mockupPath, ...docPaths] = paths;
      const docRefs = docsFull.map((d, i) => ({ title: d?.title || docs[i].title, path: docPaths[i] }));
      return this._buildUserStoriesPrompt(feature, mockupPath, docRefs, true);
    }

    const docRefs = docsFull.map(d => ({ title: d?.title || '', content: d?.content || '' }));
    return this._buildUserStoriesPrompt(feature, mockup.html_content || '', docRefs, false);
  }

  async _handleRun(overlay, featureId) {
    const runBtn    = overlay.querySelector('.eus-gen-btn--run');
    const promptTa  = overlay.querySelector('#eusGenPromptTa');
    const prompt    = promptTa?.value?.trim();
    if (!prompt) return;

    const cancelBtn = overlay.querySelector('#eusGenCancelBtn');

    runBtn.disabled    = true;
    runBtn.textContent = 'Generating…';
    promptTa.disabled  = true;
    cancelBtn.hidden   = false;

    const counter = document.createElement('div');
    counter.className = 'eus-gen-counter';
    counter.id        = 'eusGenCounter';
    counter.innerHTML = `
      <span class="eus-gen-counter__chars">Generating… (0 chars)</span>
      <span class="eus-gen-counter__hint">This may take up to 5 minutes or more depending on the model and content size.</span>
    `;
    promptTa.after(counter);

    const resetRunState = () => {
      runBtn.disabled    = false;
      runBtn.textContent = 'Re-run';
      cancelBtn.hidden   = true;
      promptTa.disabled  = false;
      overlay.querySelector('#eusGenCounter')?.remove();
    };

    cancelBtn.onclick = () => {
      window.app.chat.cancel();
      window.app.chat.offAll();
      resetRunState();
    };

    let charCount = 0;
    window.app.chat.offAll();
    window.app.chat.onToken(({ text }) => {
      charCount += text.length;
      const c = overlay.querySelector('.eus-gen-counter__chars');
      if (c) c.textContent = `Generating… (${charCount} chars)`;
    });
    window.app.chat.onDone(({ raw, error }) => {
      window.app.chat.offAll();
      cancelBtn.hidden = true;
      this._handleGenerateDone(overlay, runBtn, promptTa, raw || '', error, featureId);
    });

    window.app.chat.generate({ prompt, model: this._aiModelConfig });
  }

  async _handleRunInTerminal(overlay) {
    const promptTa = overlay.querySelector('#eusGenPromptTa');
    const prompt   = promptTa?.value?.trim();
    if (!prompt) return;

    const cfg = this._aiModelConfig;
    const exe = cfg?.executable || 'claude';

    // Create the output file in the temp dir to get its path
    const [outputPath] = await window.app.writeTempFiles([
      { name: 'eus-output.json', content: '' },
    ]);

    overlay._terminalOutputPath = outputPath;

    // Swap the "do not write files" rule for a "write to this file" rule
    const terminalPrompt = prompt.replace(
      /- Do NOT write files[^\n]*/,
      `- Write the raw JSON output to this file: ${outputPath}.json`
    );

    // Same command style as Mockups: here-string, no stdout piping — Claude writes the file
    const safe = terminalPrompt.replace(/'/g, "''");
    const cmd  = `$p = @'\n${safe}\n'@\n${exe} $p`;

    await window.db.terminal.openExternal({ command: cmd, cwd: this._project?.project_path || undefined });
  }

  async _handleGenerateDone(overlay, runBtn, promptTa, raw, error, featureId) {
    overlay.querySelector('#eusGenCounter')?.remove();
    promptTa.disabled = false;

    overlay._rawJson = raw;
    this._showRawResult(overlay, raw, error);

    const loadToDbBtn = overlay.querySelector('#eusLoadToDbBtn');
    const jsonMatch   = raw.match(/\{[\s\S]*\}/);
    let parsed = null;
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch { /* fallthrough */ }
    }
    if (parsed?.UserStories?.length) loadToDbBtn.disabled = false;

    runBtn.disabled    = false;
    runBtn.textContent = 'Re-run';
  }

  _showRawResult(overlay, raw, error) {
    const promptTa   = overlay.querySelector('#eusGenPromptTa');
    const promptBody = overlay.querySelector('.eus-gen-prompt-body');
    overlay.querySelector('.eus-gen-result')?.remove();

    const resultEl = document.createElement('div');
    resultEl.className = 'eus-gen-result';

    const formatHint = `<div class="eus-gen-format-hint">
  <span class="eus-gen-format-hint__label">JSON must follow this structure:</span>
  <pre class="eus-gen-raw">${escHtml(`{
  "UserStories": [
    {
      "featureId": 1,
      "userStoryName": "...",
      "description": "...",
      "acceptanceCriteria": "...",
      "prompts": [
        { "tag": "UI", "prompt": "..." }
      ]
    }
  ]
}`)}</pre>
</div>`;

    if (error && !raw) {
      resultEl.innerHTML = `<div class="eus-gen-error">${escHtml(error)}</div>${formatHint}`;
    } else {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      let parsed = null;
      let parseError = null;
      if (jsonMatch) { try { parsed = JSON.parse(jsonMatch[0]); } catch (e) { parseError = e.message; } }

      if (parsed?.UserStories?.length) {
        resultEl.innerHTML = `<div class="eus-gen-parse-ok">&#10003; ${parsed.UserStories.length} user ${parsed.UserStories.length === 1 ? 'story' : 'stories'} parsed — click <strong>Load to DB</strong> to save</div><pre class="eus-gen-raw">${escHtml(raw)}</pre>`;
      } else {
        const reason = !jsonMatch
          ? 'No JSON object found in the response.'
          : parseError
            ? `JSON parse error: ${parseError}`
            : 'Parsed JSON is missing a "UserStories" array.';
        resultEl.innerHTML = `<div class="eus-gen-error">${escHtml(reason)}</div>${formatHint}${raw ? `<pre class="eus-gen-raw">${escHtml(raw)}</pre>` : ''}`;
      }
    }

    if (promptTa) promptTa.after(resultEl);
    else promptBody.appendChild(resultEl);

    setTimeout(() => { promptBody.scrollTop = promptBody.scrollHeight; }, 30);
  }

  async _saveStoriesToDb(overlay, loadToDbBtn, featureId) {
    const raw = overlay._rawJson;
    if (!raw) return;

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    let parsed = null;
    if (jsonMatch) { try { parsed = JSON.parse(jsonMatch[0]); } catch { /* fallthrough */ } }

    if (!parsed?.UserStories?.length) {
      this._showRawResult(overlay, raw, 'Could not parse UserStories from the JSON.');
      return;
    }

    loadToDbBtn.disabled    = true;
    loadToDbBtn.textContent = 'Saving…';

    let saved = 0;
    for (const s of parsed.UserStories) {
      try {
        const story = await window.db.userStories.create({
          feature_id:          featureId,
          project_id:          this._projectId,
          title:               s.userStoryName || 'Untitled Story',
          description:         s.description        || null,
          acceptance_criteria: s.acceptanceCriteria || null,
          is_extracted:        1,
        });
        if (Array.isArray(s.prompts)) {
          for (const p of s.prompts) {
            await window.db.prompts.create({
              user_story_id: story.id,
              tag:           p.tag    || null,
              prompt:        p.prompt || '',
            });
          }
        }
        saved++;
      } catch { /* skip bad entries */ }
    }

    // Replace result hint with success badge, keep raw
    const hintEl = overlay.querySelector('.eus-gen-parse-ok, .eus-gen-error');
    if (hintEl) {
      hintEl.className = 'eus-gen-success-badge';
      hintEl.innerHTML = `&#10003; ${saved} user ${saved === 1 ? 'story' : 'stories'} saved to DB`;
    }
    loadToDbBtn.disabled    = true;
    loadToDbBtn.textContent = 'Saved';

    await this._loadExtractedStories();
  }

  _buildUserStoriesPrompt(feature, mockupRef, docRefs, isCli) {
    const featureCtx = feature.description
      ? `Feature Description: ${feature.description}\n`
      : '';

    const mockupSection = isCli
      ? `UI Mockup HTML file: ${mockupRef}`
      : `UI Mockup HTML:\n${mockupRef}`;

    const docsSection = isCli
      ? docRefs.map(d => `- ${d.title}: ${d.path}`).join('\n')
      : docRefs.map(d => `### ${d.title}\n${d.content}`).join('\n\n');

    return `You are an expert product manager and software architect. Analyze the UI mockup and reference documents to extract user stories for the feature below.

Feature: ${feature.name}
${featureCtx}
${mockupSection}

Reference Documents:
${docsSection}

Extract ALL distinct user stories visible in the mockup for this feature.

IMPORTANT: Output ONLY a raw JSON object — no markdown fences, no explanation. Start with { and end with }.

Use EXACTLY this structure:
{
  "UserStories": [
    {
      "featureId": ${feature.id},
      "userStoryName": 'short action-oriented title',
      "description": 'As a user, I want to [action] so that [benefit].',
      "acceptanceCriteria": 'Given [context]\nWhen [action]\nThen [outcome]',
      "prompts": [
        {
          "promptName": 'descriptive name',
          "prompt": 'detailed implementation prompt referencing exact UI details (colours, layout, components, spacing)',
          "tag": 'UI or API or DB or Auth or Cache or other single technical domain word'
        }
      ]
    }
  ]
}

userStoryName: short action-oriented title
description: 
- Along with user story name, include some description about the user story (simple description, do not go technical level)
acceptanceCriteria: 
- Include at functional level, do not include color validations and technical validations.
- Follows Given / When / Then on separate lines. Cover all the positive, negative and exceptional cases.

promptName: descriptive name
prompt:
- The purpose of the prompt is to provide instructions to LLM to implement the production ready code for the user story. 
- Include design elements which needs to tell the prompt for the designing of the page. This should exactly match the mockup.
- Include plain instructions (no code unless needed)
- Need instructions to cover end to end development. It should exactly work as if it is calling APIs. Mock all the data in the data layer or services which calls the API (positive & negative cases). And should be able to replace that code by actual call later. 
- Include unit test prompts for API/DB/Auth stories, and E2E test prompts for UI stories.

tag: Is a SINGLE word (UI, API, DB, Auth, Cache, Queue, Email)

Rules:
- featureId MUST be ${feature.id}
- Each story needs at least one prompt
- Each prompt value MUST be written in Markdown
- Do NOT write files — print the raw JSON directly to stdout`;
  }

  _loadMockupPreview(frame, html) {
    const guard = `<script>
(function(){
  document.addEventListener('click', function(e){
    var a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    var href = (a.getAttribute('href') || '').trim();
    if (href.startsWith('#') && href.length > 1) {
      var el = document.getElementById(href.slice(1)) || document.querySelector('[name="' + href.slice(1) + '"]');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  }, true);
})();
<\/script>`;
    const guarded = html.includes('</head>')
      ? html.replace('</head>', guard + '</head>')
      : guard + html;
    frame.srcdoc = guarded;
  }
}
