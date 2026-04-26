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

    const [project, stories, features, statuses, documents, mockups] = await Promise.all([
      window.db.projects.get(this.projectId),
      window.db.userStories.list({ project_id: this.projectId }),
      window.db.features.list(this.projectId),
      window.db.status.list(),
      window.db.documents.list(this.projectId),
      window.db.screenDesigns.list(this.projectId),
    ]);

    this._project   = project;
    this._stories   = stories;
    this._features  = features;
    this._statuses  = statuses;
    this._documents = documents;
    this._mockups   = mockups;

    this.container.innerHTML = this._template();
    this._bindEvents();
  }

  unmount() {
    removeCss('pages/project-home/project-home.css');
  }

  _statsHtml() {
    const stories  = this._stories  || [];
    const features = this._features || [];
    const statuses = this._statuses || [];

    const storyCounts = {};
    for (const s of stories) {
      const label = s.status_name || 'No Status';
      storyCounts[label] = (storyCounts[label] || 0) + 1;
    }

    const statusPills = [];
    for (const st of statuses) {
      if (storyCounts[st.name] !== undefined) {
        statusPills.push({ label: st.name, count: storyCounts[st.name] });
      }
    }
    if (storyCounts['No Status']) {
      statusPills.push({ label: 'No Status', count: storyCounts['No Status'] });
    }

    const pillsHtml = statusPills.length
      ? statusPills.map(p => `
          <span class="ph-stat-pill">
            <span class="ph-stat-pill__label">${escHtml(p.label)}</span>
            <span class="ph-stat-pill__count">${p.count}</span>
          </span>`).join('')
      : `<span class="ph-stat-empty">No stories yet</span>`;

    return `
      <div class="project-home__stats">
        <div class="ph-stat-card">
          <div class="ph-stat-card__value">${stories.length}</div>
          <div class="ph-stat-card__label">User Stories</div>
        </div>
        <div class="ph-stat-card">
          <div class="ph-stat-card__value">${features.length}</div>
          <div class="ph-stat-card__label">Features</div>
        </div>
        <div class="ph-stat-card ph-stat-card--wide">
          <div class="ph-stat-card__label ph-stat-card__label--top">Stories by Status</div>
          <div class="ph-stat-pills">${pillsHtml}</div>
        </div>
      </div>`;
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
          <div class="project-home__section-label">Overview</div>
          ${this._statsHtml()}
          <div class="project-home__section-label" style="margin-top:2rem;">Project Areas</div>
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
              <div class="ph-card__footer">
                <span class="ph-card__count">${this._mockups.length}</span>
                <svg class="ph-card__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </div>
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
              <div class="ph-card__footer">
                <span class="ph-card__count">${this._documents.length}</span>
                <svg class="ph-card__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </div>
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
              <div class="ph-card__footer">
                <span class="ph-card__count">${this._stories.length}</span>
                <svg class="ph-card__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </div>
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
      .addEventListener('click', () => this.router.navigate('mockups', { projectId: this.projectId }));

    this.container.querySelector('#cardDocuments')
      .addEventListener('click', () => this.router.navigate('documents', { projectId: this.projectId }));

    this.container.querySelector('#cardUserStories')
      .addEventListener('click', () => this.router.navigate('project', { projectId: this.projectId }));
  }
}
