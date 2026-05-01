import { injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';

export class ExtractUserStoriesPage {
  constructor(container, params, router) {
    this.container  = container;
    this.router     = router;
    this._projectId = params.projectId;
  }

  async mount() {
    injectCss('pages/extract-user-stories/extract-user-stories-page.css');
    applyStoredTheme();
    this.container.innerHTML = this._template();
    this._bindEvents();
  }

  unmount() {
    removeCss('pages/extract-user-stories/extract-user-stories-page.css');
  }

  _template() {
    return `
      <div class="eus-page">
        <div class="eus-header">
          <button class="eus-back-btn" id="eusBtnBack">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back
          </button>
          <h1 class="eus-title">Extract User Stories</h1>
        </div>
        <div class="eus-body">
          <p class="eus-placeholder">Extract User Stories page — coming soon.</p>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    this.container.querySelector('#eusBtnBack')
      .addEventListener('click', () => this.router.navigate('project-home', { projectId: this._projectId }));
  }
}
