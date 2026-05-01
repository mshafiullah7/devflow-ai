import { injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';

export class ExtractUserStoriesPage {
  constructor(container, params, router) {
    this.container  = container;
    this.router     = router;
    this._projectId = params.projectId;
  }

  async mount() {
    injectCss('pages/user-stories/user-stories.css');
    injectCss('pages/extract-user-stories/extract-user-stories-page.css');
    applyStoredTheme();
    this.container.innerHTML = this._template();
    this._bindEvents();
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
  }
}
