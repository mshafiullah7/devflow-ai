import { FeatureList } from '../../components/feature-list/feature-list.js';
import { UserStoryList } from '../../components/user-story-list/user-story-list.js';
import { GitController } from '../../components/git/git-controller.js';
import { ModelPicker }       from '../../components/model-picker/model-picker.js';
import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';

export class ProjectPage {
  constructor(container, params, router) {
    this.container = container;
    this.router    = router;
    this.projectId = params.projectId;
    this._project             = null;
    this._usMapping           = null;
    this._aiModelConfig       = null;
    this._activeStoryId       = null;
    this._selectedFeatureId   = null;
    this._relatedMockups          = [];
    this._selectedRelatedMockupId = null;
    this._relatedDocuments        = [];
    this._selectedRelatedDocIds   = new Set();
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  async mount() {
    injectCss('pages/user-stories/user-stories.css');
    injectCss('pages/extract-user-stories/extract-user-stories-page.css');
    applyStoredTheme();

    [this._project, this._usMapping] = await Promise.all([
      window.db.projects.get(this.projectId),
      window.db.modelMapping.get('user-stories'),
    ]);
    this.container.innerHTML = this._template();

    this._git = new GitController({ getTermCwd: () => this._project?.project_path || '' });
    this._git.mount();

    if (this._project?.project_path) {
      this._git.refreshStatus();
      this._git.startPoll();
      this._setHeaderFolderPath(this._project.project_path);
    }


    this._picker = new ModelPicker({
      anchor:    this.container.querySelector('#usModelPicker'),
      onSelect:  model => { this._aiModelConfig = model; },
      initialId: this._usMapping?.model_config_id ?? null,
    });
    await this._picker.reload();
    this._bindEvents();
    this._initResizable();
    this._initFeatureToggle();
    this._initRelatedToggle();
    await this._mountComponents();
    await this._loadRelatedSources();
  }

  unmount() {
    removeCss('pages/user-stories/user-stories.css');
    removeCss('pages/extract-user-stories/extract-user-stories-page.css');
    this._picker?.unmount();
    this._git?.stopPoll();
  }

  // ----------------------------------------------------------------
  // Template
  // ----------------------------------------------------------------
  _template() {
    const name = this._project ? escHtml(this._project.name) : 'Project';
    const desc = this._project ? escHtml(this._project.description || '') : '';

    return `
      <div class="project-page">

        <!-- ── Top header bar ──────────────────────────────────────── -->
        <header class="project-page__header">
          <button class="project-page__back" id="btnBack" aria-label="Back to launcher">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="project-page__title-group">
            <h1 class="project-page__title">${name}</h1>
            <p class="project-page__desc">User Stories</p>
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
          <div class="project-page__model-group">
            <div id="usModelPicker"></div>
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
          <button class="project-page__qcmd-btn" id="btnExportProject" title="Export all features &amp; stories" style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            </svg>
          </button>
        </header>

        <!-- ── Body (columns + related panel) ──────────────────────── -->
        <div class="project-page__body">

          <!-- ── Three-column workspace ───────────────────────────── -->
          <div class="project-page__workspace">

            <!-- 1. Features column -->
            <aside class="project-panel" id="panelFeatures">
              <div class="project-panel__header">
                <span class="project-panel__title">Features</span>
                <div class="project-panel__actions">
                  <button class="project-panel__add" id="btnImportFeature" aria-label="Import feature from JSON" title="Import from JSON">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M8 10V2M5 5l3-3 3 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                    </svg>
                  </button>
                  <button class="project-panel__add" id="btnAddFeature" aria-label="Add feature" title="Add feature (Ctrl+Shift+N)">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                  </button>
                  <button class="project-panel__add project-panel__toggle" id="btnToggleFeatures" aria-label="Collapse features" title="Collapse features">
                    <svg class="toggle-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="project-panel__list" id="featureList"></div>
            </aside>

            <!-- resize handle -->
            <div class="project-panel__resize" data-resize="features"></div>

            <!-- 2. User Stories column -->
            <aside class="project-panel" id="panelStories">
              <div class="project-panel__header">
                <span class="project-panel__title">User Stories</span>
                <div class="project-panel__actions">
                  <button class="project-panel__add" id="btnImportStory" aria-label="Import user story from JSON" title="Import from JSON">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M8 10V2M5 5l3-3 3 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                    </svg>
                  </button>
                  <button class="project-panel__add" id="btnAddStory" aria-label="Add user story" title="Add user story (Ctrl+N)">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="project-panel__list" id="storyList"></div>
            </aside>

            <!-- resize handle -->
            <div class="project-panel__resize" data-resize="stories"></div>

            <!-- 3. User Story Detail column -->
            <section class="project-panel project-panel--detail" id="panelDetail">
              <div class="project-panel__header">
                <span class="project-panel__title">Story Detail</span>
                <div class="project-panel__header-actions" id="storyDetailHeaderActions"></div>
              </div>
              <div class="project-panel__content" id="storyDetail">
                <div class="project-panel__empty">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="12" stroke="#4b5563" stroke-width="1.4"/>
                    <path d="M16 11v5l3 3" stroke="#4b5563" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <p>Select a user story</p>
                </div>
              </div>
            </section>

          </div><!-- /.project-page__workspace -->

          <!-- resize handle for related panel -->
          <div class="project-panel__resize" data-resize="related"></div>

          <!-- 4. Extract User Stories panel -->
          <div class="project-related" id="projectRelated">
            <div class="project-related__titlebar">
              <div class="project-related__title">
                <button class="project-related__collapse-btn" id="btnRelatedToggle"
                  aria-label="Collapse panel" title="Collapse panel">
                  <svg class="related-toggle-icon" width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M5 7h6M5 10h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg>
                <span class="project-related__title-text">Extract User Stories</span>
              </div>
              <button class="eus-generate-btn eus-generate-btn--sm" id="btnRelatedGenerate"
                title="Generate User Stories" style="-webkit-app-region:no-drag;">
                Generate
              </button>
            </div>

            <!-- Mockups -->
            <div class="project-related__section" id="relatedMockupsSection">
              <div class="project-related__section-hd">
                <span class="project-related__section-label">Mockups</span>
                <span class="project-related__section-count" id="relatedMockupsCount" hidden></span>
              </div>
              <div class="project-related__section-body" id="relatedMockupsList">
                <div class="project-related__empty">No mockups</div>
              </div>
            </div>

            <div class="project-related__inner-resize"></div>

            <!-- Documents -->
            <div class="project-related__section" id="relatedDocumentsSection">
              <div class="project-related__section-hd">
                <span class="project-related__section-label">Documents</span>
                <span class="project-related__section-count" id="relatedDocumentsCount" hidden></span>
              </div>
              <div class="project-related__section-body" id="relatedDocumentsList">
                <div class="project-related__empty">No documents</div>
              </div>
            </div>
          </div><!-- /.project-related -->

        </div><!-- /.project-page__body -->
      </div><!-- /.project-page -->
    `;
  }

  // ----------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------
  _bindEvents() {
    document.getElementById('btnBack')
      .addEventListener('click', async () => {
        await this._storyList?.save();
        this.router.navigate('project-home', { projectId: this.projectId });
      });

    document.getElementById('headerFolderDisplay')
      .addEventListener('click', async () => {
        const folderPath = await window.db.dialog.openFolder();
        if (!folderPath) return;
        await window.db.projects.setPath({ id: this.projectId, project_path: folderPath });
        if (this._project) this._project.project_path = folderPath;
        this._git.refreshStatus();
        this._git.startPoll();
        this._setHeaderFolderPath(folderPath);
      });


    document.getElementById('btnModelConfigs')
      .addEventListener('click', () => this.router.navigate('settings', { from: 'user-stories', fromParams: { projectId: this.projectId } }));

    document.getElementById('btnExportProject')
      .addEventListener('click', () => this._exportProject());

    document.getElementById('btnConsoleGit')
      .addEventListener('click', () =>
        this.router.navigate('git-changes', { projectId: this.projectId, from: 'user-stories' }));

    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, select, [contenteditable]')) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'n' || e.key === 'N')) {
        if (e.shiftKey) {
          e.preventDefault();
          document.getElementById('btnAddFeature')?.click();
        } else {
          e.preventDefault();
          document.getElementById('btnAddStory')?.click();
        }
      }
    });

    document.getElementById('btnRelatedGenerate')
      .addEventListener('click', () => this._handleRelatedGenerate());

    document.getElementById('relatedMockupsList')
      .addEventListener('click', (e) => {
        const item = e.target.closest('.eus-src-item');
        if (item) this._selectRelatedMockup(parseInt(item.dataset.id));
      });

    document.getElementById('relatedDocumentsList')
      .addEventListener('click', (e) => {
        const item = e.target.closest('.eus-src-item');
        if (item) this._toggleRelatedDocument(parseInt(item.dataset.id));
      });
  }

  // ----------------------------------------------------------------
  // Components
  // ----------------------------------------------------------------
  async _mountComponents() {
    this._storyList = new UserStoryList({
      listEl:               document.getElementById('storyList'),
      addBtn:               document.getElementById('btnAddStory'),
      importBtn:            document.getElementById('btnImportStory'),
      detailEl:             document.getElementById('storyDetail'),
      projectId:            this.projectId,
      getModel:             () => this._aiModelConfig,
      onSelect:             (story) => { this._refreshRelated(story?.id || null); },
      onExport:             (story) => this._exportStory(story),
      onRunCommand:         (cmd) => {
        if (!this._project?.project_path) return;
        window.db.terminal.openExternal({ command: cmd, cwd: this._project.project_path });
      },
      onRunCommandExternal: (cmd) => {
        if (!this._project?.project_path) return;
        window.db.terminal.openExternal({ command: cmd, cwd: this._project.project_path });
      },
      onPrintOutput: () => {},
    });
    await this._storyList.mount();

    this._featureList = new FeatureList({
      listEl:    document.getElementById('featureList'),
      addBtn:    document.getElementById('btnAddFeature'),
      importBtn: document.getElementById('btnImportFeature'),
      projectId: this.projectId,
      onSelect:  (feature) => {
        this._selectedFeatureId = feature?.id ?? null;
        this._storyList.load(feature.id);
      },
      onExport:  (feature) => this._exportFeature(feature),
    });
    await this._featureList.mount();
  }

  // ----------------------------------------------------------------
  // Related panel — data loading
  // ----------------------------------------------------------------
  async _refreshRelated(storyId) {
    this._activeStoryId = storyId || null;
  }

  async _loadRelatedSources() {
    const [mockups, docs] = await Promise.all([
      window.db.screenDesigns.list(this.projectId),
      window.db.documents.list(this.projectId),
    ]);
    this._relatedMockups = mockups ?? [];
    if (this._relatedMockups.length && !this._selectedRelatedMockupId) {
      this._selectedRelatedMockupId = this._relatedMockups[0].id;
    }
    this._relatedDocuments = docs ?? [];
    const defaultTitles = new Set(['Project Overview', 'Architecture Overview', 'Tech Stack']);
    this._relatedDocuments.forEach(d => {
      if (defaultTitles.has(d.title)) this._selectedRelatedDocIds.add(d.id);
    });
    this._renderRelatedMockups();
    this._renderRelatedDocuments();
  }

  _renderRelatedMockups() {
    const listEl  = document.getElementById('relatedMockupsList');
    const countEl = document.getElementById('relatedMockupsCount');
    if (!listEl) return;

    countEl.textContent = this._relatedMockups.length;
    countEl.hidden      = this._relatedMockups.length === 0;

    if (!this._relatedMockups.length) {
      listEl.innerHTML = '<div class="project-related__empty">No mockups</div>';
      return;
    }

    listEl.innerHTML = this._relatedMockups.map(m => `
      <div class="eus-src-item${m.id === this._selectedRelatedMockupId ? ' eus-src-item--active' : ''}" data-id="${m.id}">
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

  _selectRelatedMockup(id) {
    this._selectedRelatedMockupId = this._selectedRelatedMockupId === id ? null : id;
    this._renderRelatedMockups();
  }

  _renderRelatedDocuments() {
    const listEl  = document.getElementById('relatedDocumentsList');
    const countEl = document.getElementById('relatedDocumentsCount');
    if (!listEl) return;

    countEl.textContent = this._relatedDocuments.length;
    countEl.hidden      = this._relatedDocuments.length === 0;

    if (!this._relatedDocuments.length) {
      listEl.innerHTML = '<div class="project-related__empty">No documents</div>';
      return;
    }

    listEl.innerHTML = this._relatedDocuments.map(d => {
      const checked = this._selectedRelatedDocIds.has(d.id);
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

  _toggleRelatedDocument(id) {
    if (this._selectedRelatedDocIds.has(id)) {
      this._selectedRelatedDocIds.delete(id);
    } else {
      this._selectedRelatedDocIds.add(id);
    }
    this._renderRelatedDocuments();
  }

  // ----------------------------------------------------------------
  // Related panel — Generate User Stories
  // ----------------------------------------------------------------
  async _handleRelatedGenerate() {
    const missing = [];
    if (!this._selectedFeatureId)           missing.push('Feature');
    if (!this._selectedRelatedMockupId)     missing.push('Mockup');
    if (!this._selectedRelatedDocIds.size)  missing.push('Document');

    if (missing.length) {
      this._showGenerateError(missing);
    } else {
      await this._showRelatedGenerateModal();
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
    overlay.querySelector('.usl-confirm-btn--ok').addEventListener('click', () => overlay.remove());
  }

  async _showRelatedGenerateModal() {
    const feature = await window.db.features.get(this._selectedFeatureId);
    const mockup  = await window.db.screenDesigns.get(this._selectedRelatedMockupId);
    const docs    = this._relatedDocuments.filter(d => this._selectedRelatedDocIds.has(d.id));

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

    const runBtn      = overlay.querySelector('.eus-gen-btn--run');
    const terminalBtn = overlay.querySelector('#eusTerminalBtn');
    const loadJsonBtn = overlay.querySelector('#eusLoadJsonBtn');
    const loadToDbBtn = overlay.querySelector('#eusLoadToDbBtn');
    const promptBody  = overlay.querySelector('.eus-gen-prompt-body');

    const isCli = !this._aiModelConfig?.type || this._aiModelConfig.type === 'cli';
    if (!isCli) terminalBtn.hidden = true;

    loadJsonBtn.disabled = false;

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

    loadToDbBtn.addEventListener('click', () => this._saveRelatedStoriesToDb(overlay, loadToDbBtn, feature.id));

    try {
      const prompt = await this._buildRelatedPromptForModal(feature, mockup, docs);
      promptBody.innerHTML = `<textarea class="eus-gen-prompt-ta" id="eusGenPromptTa" spellcheck="false">${escHtml(prompt)}</textarea>`;
      runBtn.disabled = false;
      if (isCli) {
        terminalBtn.disabled = false;
        terminalBtn.addEventListener('click', () => this._handleRelatedRunInTerminal(overlay));
      }
      runBtn.addEventListener('click', () => this._handleRelatedRun(overlay, feature.id));
    } catch (err) {
      promptBody.innerHTML = `<div class="eus-gen-error">Failed to build prompt: ${escHtml(String(err))}</div>`;
    }
  }

  async _buildRelatedPromptForModal(feature, mockup, docs) {
    const isCli    = !this._aiModelConfig?.type || this._aiModelConfig.type === 'cli';
    const [docsFull, layers] = await Promise.all([
      Promise.all(docs.map(d => window.db.documents.get(d.id))),
      window.db.projectLayers.list(this.projectId).catch(() => []),
    ]);

    if (isCli) {
      const filesToWrite = [
        { name: 'mockup.html', content: mockup.html_content || '' },
        ...docsFull.map((d, i) => ({ name: `doc-${i}.md`, content: d?.content || '' })),
      ];
      const paths = await window.app.writeTempFiles(filesToWrite);
      const [mockupPath, ...docPaths] = paths;
      const docRefs = docsFull.map((d, i) => ({ title: d?.title || docs[i].title, path: docPaths[i] }));
      return this._buildUserStoriesPrompt(feature, mockupPath, docRefs, true, layers);
    }

    const docRefs = docsFull.map(d => ({ title: d?.title || '', content: d?.content || '' }));
    return this._buildUserStoriesPrompt(feature, mockup.html_content || '', docRefs, false, layers);
  }

  async _handleRelatedRun(overlay, featureId) {
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
      this._handleRelatedGenerateDone(overlay, runBtn, promptTa, raw || '', error, featureId);
    });

    window.app.chat.generate({ prompt, model: this._aiModelConfig });
  }

  async _handleRelatedRunInTerminal(overlay) {
    const promptTa = overlay.querySelector('#eusGenPromptTa');
    const prompt   = promptTa?.value?.trim();
    if (!prompt) return;

    const cfg       = this._aiModelConfig;
    const exe       = cfg?.executable || 'claude';
    const flags     = cfg?.flags ? ` ${cfg.flags}` : '';
    const modelFlag = cfg?.model_name ? ` --model ${cfg.model_name}` : '';

    const [outputPath] = await window.app.writeTempFiles([
      { name: 'eus-output.json', content: '' },
    ]);

    overlay._terminalOutputPath = outputPath;

    const terminalPrompt = prompt.replace(
      /- Do NOT write files[^\n]*/,
      `- Write the raw JSON output to this file: ${outputPath}.json`
    );

    const safe = terminalPrompt.replace(/'/g, "''");
    const cmd  = `$p = @'\n${safe}\n'@\n${exe}${flags}${modelFlag} $p`;

    await window.db.terminal.openExternal({ command: cmd, cwd: this._project?.project_path || undefined });
  }

  async _handleRelatedGenerateDone(overlay, runBtn, promptTa, raw, error, featureId) {
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
      "acceptanceCriteria": [
        { "criteria": "Given ... When ... Then ..." }
      ],
      "prompts": [
        { "prompt": "..." }
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

  async _saveRelatedStoriesToDb(overlay, loadToDbBtn, featureId) {
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
          feature_id:   featureId,
          project_id:   this.projectId,
          title:        s.userStoryName || 'Untitled Story',
          description:  s.description  || null,
          is_extracted: 1,
        });
        // Save each acceptance criterion as a separate row
        if (Array.isArray(s.acceptanceCriteria)) {
          for (const ac of s.acceptanceCriteria) {
            const text = (typeof ac === 'string' ? ac : ac?.criteria) || '';
            if (text.trim()) {
              await window.db.acceptanceCriteria.create({ user_story_id: story.id, description: text.trim() });
            }
          }
        } else if (typeof s.acceptanceCriteria === 'string' && s.acceptanceCriteria.trim()) {
          // Fallback: plain string from older model responses
          await window.db.acceptanceCriteria.create({ user_story_id: story.id, description: s.acceptanceCriteria.trim() });
        }
        if (Array.isArray(s.prompts)) {
          for (const p of s.prompts) {
            await window.db.prompts.create({
              user_story_id: story.id,
              layer_id:      (p.layerId != null && p.layerId !== '') ? parseInt(p.layerId, 10) : null,
              prompt:        (p.prompt || '').replaceAll('{{US_ID}}', story.id),
            });
          }
        }
        if (Array.isArray(s.e2e_tests)) {
          for (const t of s.e2e_tests) {
            const prompt = (t.prompt || '').replaceAll('{{US_ID}}', story.id);
            if (prompt.trim()) {
              await window.db.prompts.create({
                user_story_id: story.id,
                tag:           'e2e',
                prompt,
              });
            }
          }
        }
        saved++;
      } catch { /* skip bad entries */ }
    }

    const hintEl = overlay.querySelector('.eus-gen-parse-ok, .eus-gen-error');
    if (hintEl) {
      hintEl.className = 'eus-gen-success-badge';
      hintEl.innerHTML = `&#10003; ${saved} user ${saved === 1 ? 'story' : 'stories'} saved to DB`;
    }
    loadToDbBtn.disabled    = true;
    loadToDbBtn.textContent = 'Saved';

    // Refresh the story list for the current feature
    if (this._selectedFeatureId) {
      await this._storyList.load(this._selectedFeatureId);
    }
  }

  _buildUserStoriesPrompt(feature, mockupRef, docRefs, isCli, layers = []) {
    const featureCtx = feature.description
      ? `Feature Description: ${feature.description}\n`
      : '';

    const layersSection = layers.length > 0
      ? `\nProject Layers (architectural sub-folders; assign each prompt to the most relevant layer):\n` +
        layers.map(l => `- id:${l.id}  name:"${l.name}"${l.description ? `  (${l.description})` : ''}`).join('\n') +
        '\n'
      : '';

    const mockupSection = isCli
      ? `UI Mockup HTML file: ${mockupRef}`
      : `UI Mockup HTML:\n${mockupRef}`;

    const docsSection = isCli
      ? docRefs.map(d => `- ${d.title}: ${d.path}`).join('\n')
      : docRefs.map(d => `### ${d.title}\n${d.content}`).join('\n\n');

    return `You are an expert product manager and software architect. Analyze the UI mockup and reference documents to extract user stories for the feature below.

Feature: ${feature.name}
${featureCtx}${layersSection}
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
      "acceptanceCriteria": [
        { "criteria": 'Given [context]\nWhen [action]\nThen [outcome]' },
        { "criteria": 'Given [another context]\nWhen [another action]\nThen [another outcome]' }
      ],
      "prompts": [
        {
          "promptName": 'descriptive name',
          "prompt": 'detailed implementation prompt referencing exact UI details (colours, layout, components, spacing)',
          "layerId": <integer id from Project Layers list above, or null if no layers or none clearly applies>
        }
      ],
      "e2e_tests": [
        {
          "promptName": 'descriptive E2E test name',
          "prompt": 'detailed prompt to generate the E2E test file (Playwright/Cypress) for this user story'
        }
      ]
    }
  ]
}

userStoryName: short action-oriented title
description:
- Along with user story name, include some description about the user story (simple description, do not go technical level)
acceptanceCriteria: MUST be an array of objects, each with a "criteria" string field.
- Each object represents one acceptance criterion.
- Each criterion follows Given / When / Then format on separate lines.
- Include all positive, negative and exceptional cases — each as its own separate object in the array.
- Include at functional level only, do not include color validations or technical validations.

prompts — implementation tasks only (NO test generation here):
- The purpose of the prompt is to provide instructions to LLM to implement the production ready code for the user story.
- Include design elements which needs to tell the prompt for the designing of the page. This should exactly match the mockup.
- Include plain instructions (no code unless needed)
- Need instructions to cover end to end development. It should exactly work as if it is calling APIs. Mock all the data in the data layer or services which calls the API (positive & negative cases). And should be able to replace that code by actual call later.
- For API/DB/Auth stories: include unit test generation as part of the implementation prompt.
- Do NOT include E2E test generation here — put those in e2e_tests instead.

layerId: The integer id from the Project Layers list above that best matches this prompt's technical domain. Use null if no layers are listed or none clearly applies.

e2e_tests — E2E test generation prompts (UI stories only):
- Generate one or more prompts that instruct the LLM to create E2E test files using Playwright or Cypress.
- Each prompt covers the full test scenario for the user story (happy path + edge cases).
- ALL test function/case/suite names MUST be prefixed with \`US-{{US_ID}}\` (e.g. \`describe('US-{{US_ID}} Login Flow', ...)\`, \`test('US-{{US_ID}}_submits_form', ...)\`). Use the exact literal placeholder \`{{US_ID}}\` — it will be substituted with the real user story ID automatically.
- For API/DB/Auth-only stories that have no UI, set e2e_tests to an empty array [].

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

  // ----------------------------------------------------------------
  // Related panel — collapse/expand
  // ----------------------------------------------------------------
  _initRelatedToggle() {
    const panel        = document.getElementById('projectRelated');
    const resizeHandle = document.querySelector('.project-panel__resize[data-resize="related"]');
    const toggleBtn    = document.getElementById('btnRelatedToggle');
    const icon         = toggleBtn.querySelector('.related-toggle-icon');

    let savedFlex = '0 0 22%';

    const collapse = () => {
      savedFlex = panel.style.flex || savedFlex;
      panel.classList.add('project-related--collapsed');
      resizeHandle.style.display = 'none';
      toggleBtn.title = 'Expand panel';
      toggleBtn.setAttribute('aria-label', 'Expand panel');
      icon.innerHTML = '<path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
    };

    const expand = () => {
      panel.classList.remove('project-related--collapsed');
      panel.style.flex = savedFlex;
      resizeHandle.style.display = '';
      toggleBtn.title = 'Collapse panel';
      toggleBtn.setAttribute('aria-label', 'Collapse panel');
      icon.innerHTML = '<path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
    };

    collapse();

    toggleBtn.addEventListener('click', () => {
      if (panel.classList.contains('project-related--collapsed')) expand();
      else collapse();
    });
  }

  // ----------------------------------------------------------------
  // Header folder path display
  // ----------------------------------------------------------------
  _setHeaderFolderPath(folderPath) {
    const text    = document.getElementById('headerFolderText');
    const display = document.getElementById('headerFolderDisplay');
    if (!text || !display) return;
    text.textContent = folderPath;
    display.classList.add('project-page__folder-display--active');
  }

  // ----------------------------------------------------------------
  // Model dropdown helpers
  // ----------------------------------------------------------------
  async _reloadModelDropdown() {
    if (this._picker) await this._picker.reload();
  }

  // ----------------------------------------------------------------
  // Feature panel collapse/expand
  // ----------------------------------------------------------------
  _initFeatureToggle() {
    const panel        = document.getElementById('panelFeatures');
    const storiesPanel = document.getElementById('panelStories');
    const toggleBtn    = document.getElementById('btnToggleFeatures');
    const resizeHandle = panel.nextElementSibling;
    const icon         = toggleBtn.querySelector('.toggle-icon');

    let savedFlex        = panel.style.flex        || '0 0 18%';
    let savedStoriesFlex = storiesPanel.style.flex || '0 0 20%';

    toggleBtn.addEventListener('click', () => {
      const isCollapsed = panel.classList.toggle('project-panel--collapsed');

      if (isCollapsed) {
        savedFlex        = panel.style.flex        || '0 0 18%';
        savedStoriesFlex = storiesPanel.style.flex || '0 0 20%';
        panel.style.flex = '0 0 32px';
        const currentBasis = parseFloat(savedStoriesFlex.split(' ')[2]) || 20;
        storiesPanel.style.flex = `0 0 ${currentBasis * 1.5}%`;
        resizeHandle.style.display = 'none';
        toggleBtn.title = 'Expand features';
        toggleBtn.setAttribute('aria-label', 'Expand features');
        icon.innerHTML = '<path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
      } else {
        panel.style.flex        = savedFlex;
        storiesPanel.style.flex = savedStoriesFlex;
        resizeHandle.style.display = '';
        toggleBtn.title = 'Collapse features';
        toggleBtn.setAttribute('aria-label', 'Collapse features');
        icon.innerHTML = '<path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
      }
    });
  }

  // ----------------------------------------------------------------
  // Export helpers
  // ----------------------------------------------------------------
  async _buildStoryExport(s) {
    const [prompts, e2eTests] = await Promise.all([
      window.db.prompts.list(s.id),
      window.db.prompts.listByTag(s.id, 'e2e'),
    ]);
    return {
      title: s.title,
      description: s.description || null,
      acceptance_criteria: s.acceptance_criteria || null,
      status: s.status_name || null,
      prompts: prompts.map(p => ({
        tag: p.tag || null,
        prompt: p.prompt || null,
        is_executed: !!p.is_executed,
      })),
      e2e_tests: e2eTests.map(p => ({
        prompt: p.prompt || null,
        is_executed: !!p.is_executed,
      })),
    };
  }

  async _exportProject() {
    const features = await window.db.features.list(this.projectId);
    const result = [];
    for (const f of features) {
      const stories = await window.db.userStories.list({ feature_id: f.id });
      const storyExports = [];
      for (const s of stories) {
        storyExports.push(await this._buildStoryExport(s));
      }
      result.push({
        feature: f.name,
        description: f.description || null,
        status: f.status_name || null,
        user_stories: storyExports,
      });
    }
    const projectName = this._project?.name || 'project';
    const res = await window.db.dialog.saveJsonFile({
      data: result,
      filename: `${projectName}-all-stories`,
    });
    if (res?.success) this._showExportToast('Project exported successfully.');
  }

  async _exportFeature(feature) {
    const stories = await window.db.userStories.list({ feature_id: feature.id });
    const storyExports = [];
    for (const s of stories) {
      storyExports.push(await this._buildStoryExport(s));
    }
    const result = {
      feature: feature.name,
      description: feature.description || null,
      status: feature.status_name || null,
      user_stories: storyExports,
    };
    const res = await window.db.dialog.saveJsonFile({
      data: result,
      filename: `feature-${feature.name}`,
    });
    if (res?.success) this._showExportToast('Feature exported successfully.');
  }

  async _exportStory(story) {
    const result = await this._buildStoryExport(story);
    const res = await window.db.dialog.saveJsonFile({
      data: result,
      filename: `story-${story.title}`,
    });
    if (res?.success) this._showExportToast('User story exported successfully.');
  }

  _showExportToast(message) {
    document.querySelector('.usl-import-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'usl-import-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('usl-import-toast--visible'));
    setTimeout(() => {
      toast.classList.remove('usl-import-toast--visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ----------------------------------------------------------------
  // Resizable panels
  // ----------------------------------------------------------------
  _initResizable() {
    const PANEL_MAP = {
      features: { el: document.getElementById('panelFeatures'),  min: 120, dir:  1 },
      stories:  { el: document.getElementById('panelStories'),   min: 120, dir:  1 },
      related:  { el: document.getElementById('projectRelated'), min: 160, dir: -1 },
    };

    document.querySelectorAll('.project-panel__resize').forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        const entry = PANEL_MAP[handle.dataset.resize];
        if (!entry) return;

        e.preventDefault();
        const startX      = e.clientX;
        const startWidth  = entry.el.getBoundingClientRect().width;
        const parentWidth = entry.el.parentElement.getBoundingClientRect().width;

        document.body.style.userSelect = 'none';
        document.body.style.cursor     = 'col-resize';

        const onMove = (ev) => {
          const delta = (ev.clientX - startX) * entry.dir;
          const newPx = Math.max(entry.min, startWidth + delta);
          entry.el.style.flex = `0 0 ${(newPx / parentWidth) * 100}%`;
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
}
