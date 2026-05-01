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
          <div class="project-page__folder-display" id="headerFolderDisplay">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
            <span class="project-page__folder-text" id="headerFolderText"></span>
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
          <button class="project-page__folder-btn" id="btnConsoleFolder" title="Select folder" style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
          </button>
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

          <div class="project-panel__resize" data-resize="eus-review"></div>

          <!-- 4. Review panel -->
          <div class="project-related" id="eusReview">
            <div class="project-related__titlebar">
              <div class="project-related__title">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M9 11l3 3L22 4"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
                <span class="project-related__title-text">Review</span>
              </div>
            </div>

            <!-- Review section -->
            <div class="project-related__section" id="eusReviewSection">
              <div class="project-related__section-hd">
                <span class="project-related__section-label">Output</span>
                <span class="project-related__section-count" id="eusReviewCount">0</span>
              </div>
              <div class="project-related__section-body" id="eusReviewBody">
                <div class="project-related__empty">Nothing to review yet.</div>
              </div>
            </div>

          </div><!-- /#eusReview -->

        </div><!-- /.project-page__body -->
      </div>
    `;
  }

  async _reloadModelDropdown() {
    const select = this.container.querySelector('#aiModelSelect');
    if (!select) return;
    const configs  = await window.db.modelConfigs.list();
    const prevId   = select.value ? Number(select.value) : null;
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

    this.container.querySelector('#btnConsoleFolder')
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

    this.container.querySelector('#eusDocumentsList')
      .addEventListener('click', e => {
        const item = e.target.closest('.eus-src-item');
        if (!item) return;
        this._toggleDocument(Number(item.dataset.id));
      });
  }

  async _loadMockups() {
    this._mockups = await window.db.screenDesigns.list(this._projectId) ?? [];
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
    await this._loadExistingStories();
  }

  _highlightStory(clickedItem) {
    this.container.querySelectorAll('#eusExistingList .eus-src-item').forEach(el => {
      el.classList.toggle('eus-src-item--active', el === clickedItem);
    });
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
              <span class="eus-gen-pane-title">Generated Prompt</span>
            </div>
            <div class="eus-gen-prompt-body">
              <div class="eus-gen-pane-empty">Generated prompt will appear here…</div>
            </div>
          </div>
        </div>
        <div class="eus-gen-footer">
          <button class="eus-gen-btn eus-gen-btn--run">Run</button>
          <button class="eus-gen-btn eus-gen-btn--close">Close</button>
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

    overlay.querySelector('.eus-gen-btn--run')
      .addEventListener('click', () => this._handleRun(overlay, feature, mockup, docs));
  }

  async _handleRun(overlay, feature, mockup, docs) {
    const runBtn      = overlay.querySelector('.eus-gen-btn--run');
    const promptBody  = overlay.querySelector('.eus-gen-prompt-body');
    const isCli       = !this._aiModelConfig?.type || this._aiModelConfig.type === 'cli';

    runBtn.disabled    = true;
    runBtn.textContent = 'Generating…';

    const docsFull = await Promise.all(docs.map(d => window.db.documents.get(d.id)));

    let prompt;
    if (isCli) {
      const filesToWrite = [
        { name: 'mockup.html', content: mockup.html_content || '' },
        ...docsFull.map((d, i) => ({ name: `doc-${i}.md`, content: d?.content || '' })),
      ];
      const paths    = await window.app.writeTempFiles(filesToWrite);
      const [mockupPath, ...docPaths] = paths;
      const docRefs  = docsFull.map((d, i) => ({ title: d?.title || docs[i].title, path: docPaths[i] }));
      prompt = this._buildUserStoriesPrompt(feature, mockupPath, docRefs, true);
    } else {
      const docRefs = docsFull.map(d => ({ title: d?.title || '', content: d?.content || '' }));
      prompt = this._buildUserStoriesPrompt(feature, mockup.html_content || '', docRefs, false);
    }

    const preview = prompt.length > 400 ? prompt.slice(0, 400) + '…' : prompt;
    promptBody.innerHTML = `
      <div class="eus-gen-prompt-preview">${escHtml(preview)}</div>
      <div class="eus-gen-counter" id="eusGenCounter">Generating… (0 chars)</div>
    `;

    let charCount = 0;
    window.app.chat.offAll();
    window.app.chat.onToken(({ text }) => {
      charCount += text.length;
      const counter = overlay.querySelector('#eusGenCounter');
      if (counter) counter.textContent = `Generating… (${charCount} chars)`;
    });
    window.app.chat.onDone(({ raw, error }) => {
      window.app.chat.offAll();
      this._handleGenerateDone(overlay, runBtn, raw || '', error, feature.id);
    });

    window.app.chat.generate({ prompt, model: this._aiModelConfig });
  }

  async _handleGenerateDone(overlay, runBtn, raw, error, featureId) {
    const promptBody = overlay.querySelector('.eus-gen-prompt-body');

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    let parsed = null;
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch { /* handled below */ }
    }

    if (!parsed?.UserStories?.length) {
      promptBody.innerHTML = `
        <div class="eus-gen-error">${escHtml(error || 'Could not parse user stories from response.')}</div>
        <pre class="eus-gen-raw">${escHtml(raw)}</pre>
      `;
      runBtn.disabled    = false;
      runBtn.textContent = 'Retry';
      return;
    }

    let saved = 0;
    for (const s of parsed.UserStories) {
      try {
        const story = await window.db.userStories.create({
          feature_id:          featureId,
          project_id:          this._projectId,
          title:               s.userStoryName || 'Untitled Story',
          description:         s.description         || null,
          acceptance_criteria: s.acceptanceCriteria  || null,
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

    promptBody.innerHTML = `
      <div class="eus-gen-success-badge">&#10003; ${saved} user ${saved === 1 ? 'story' : 'stories'} saved</div>
      <pre class="eus-gen-raw">${escHtml(raw)}</pre>
    `;
    runBtn.disabled    = false;
    runBtn.textContent = 'Re-run';

    await this._loadExistingStories();
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
      "userStoryName": "short action-oriented title",
      "description": "As a user, I want to [action] so that [benefit].",
      "acceptanceCriteria": "Given [context]\\nWhen [action]\\nThen [outcome]",
      "prompts": [
        {
          "promptName": "descriptive name",
          "prompt": "detailed implementation prompt referencing exact UI details (colours, layout, components, spacing)",
          "tag": "UI | API | DB | Auth | Cache | or other single technical domain word"
        }
      ]
    }
  ]
}

Rules:
- featureId MUST be ${feature.id}
- Each story needs at least one prompt
- tag is a SINGLE word (UI, API, DB, Auth, Cache, Queue, Email…)
- acceptanceCriteria follows Given / When / Then on separate lines
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
