import { injectCss, removeCss, escHtml } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';

export class ExtractUserStoriesPage {
  constructor(container, params, router) {
    this.container          = container;
    this.router             = router;
    this._projectId         = params.projectId;
    this._mockups           = [];
    this._selectedMockupId  = null;
    this._features           = [];
    this._selectedFeatureId  = null;
    this._documents          = [];
    this._selectedDocumentIds = new Set();
  }

  async mount() {
    injectCss('pages/user-stories/user-stories.css');
    injectCss('pages/extract-user-stories/extract-user-stories-page.css');
    applyStoredTheme();
    this.container.innerHTML = this._template();
    this._bindEvents();
    await Promise.all([this._loadMockups(), this._loadFeatures(), this._loadDocuments()]);
  }

  unmount() {
    removeCss('pages/extract-user-stories/extract-user-stories-page.css');
    removeCss('pages/user-stories/user-stories.css');
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

              <!-- 1a. Mockups -->
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

              <!-- 1b. Features -->
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

            <!-- 2. Extracted Stories -->
            <aside class="project-panel" id="eusExtracted">
              <div class="project-panel__header">
                <span class="project-panel__title">Extracted Stories</span>
                <div class="project-panel__actions"></div>
              </div>
              <div class="project-panel__list" id="eusStoryList">
                <div class="project-panel__empty">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
                    <path d="M9 11l3 3L22 4"/>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                  </svg>
                  <p>No stories extracted</p>
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

  _bindEvents() {
    this.container.querySelector('#eusBtnBack')
      .addEventListener('click', () => this.router.navigate('project-home', { projectId: this._projectId }));

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

  _selectFeature(id) {
    this._selectedFeatureId = this._selectedFeatureId === id ? null : id;
    this._renderFeatures();
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
}
