import { DocumentsModal } from '../project/components/documents/documents-modal.js';
import { ScreensModal } from '../project/components/screens/screens-modal.js';
import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';

export class ProjectHomePage {
  constructor(container, params, router) {
    this.container = container;
    this.router    = router;
    this.projectId = params.projectId;
    this._project  = null;
  }

  async mount() {
    injectCss('pages/project-home/project-home.css');
    applyStoredTheme();

    this._project = await window.db.projects.get(this.projectId);
    this.container.innerHTML = this._template();

    this._docsModal = new DocumentsModal({ projectId: this.projectId });
    this._docsModal.mount();

    this._screensModal = new ScreensModal({
      projectId:  this.projectId,
      getProject: () => this._project,
    });
    this._screensModal.mount();

    this._bindEvents();
  }

  unmount() {
    removeCss('pages/project-home/project-home.css');
    this._docsModal?.unmount?.();
    this._screensModal?.unmount?.();
  }

  _template() {
    const name = this._project?.name ?? 'Project';
    return `
      <div class="project-home">
        <header class="project-home__header">
          <button class="project-home__back" id="btnBack" aria-label="Back to projects">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div class="project-home__title-group">
            <div class="project-home__title">${escHtml(name)}</div>
            <div class="project-home__subtitle">Project Overview</div>
          </div>
        </header>

        <div class="project-home__body">
          <div class="project-home__section-label">Project Areas</div>
          <div class="project-home__cards">

            <button class="ph-card" id="cardMockups">
              <div class="ph-card__icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/>
                  <path d="M8 21h8M12 17v4"/>
                </svg>
              </div>
              <div class="ph-card__body">
                <div class="ph-card__name">Project Mockups</div>
                <div class="ph-card__desc">UI screen designs and wireframes for this project.</div>
              </div>
              <svg class="ph-card__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>

            <button class="ph-card" id="cardDocuments">
              <div class="ph-card__icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </div>
              <div class="ph-card__body">
                <div class="ph-card__name">Project Documents</div>
                <div class="ph-card__desc">Requirements, notes, and reference documents.</div>
              </div>
              <svg class="ph-card__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>

            <button class="ph-card" id="cardUserStories">
              <div class="ph-card__icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 11l3 3L22 4"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
              </div>
              <div class="ph-card__body">
                <div class="ph-card__name">User Stories</div>
                <div class="ph-card__desc">Features, stories, prompts, and development tasks.</div>
              </div>
              <svg class="ph-card__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>

          </div>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    this.container.querySelector('#btnBack')
      .addEventListener('click', () => this.router.navigate('launcher'));

    this.container.querySelector('#cardMockups')
      .addEventListener('click', () => this._screensModal.show());

    this.container.querySelector('#cardDocuments')
      .addEventListener('click', () => this._docsModal.show());

    this.container.querySelector('#cardUserStories')
      .addEventListener('click', () => this.router.navigate('project', { projectId: this.projectId }));
  }
}
