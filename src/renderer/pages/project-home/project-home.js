import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelConfigsModal } from '../../components/model-configs/model-configs-modal.js';
import { QuickCommandsModal } from '../../components/quick-commands/quick-commands-modal.js';

export class ProjectHomePage {
  constructor(container, params, router) {
    this.container      = container;
    this.router         = router;
    this.projectId      = params.projectId;
    this._project       = null;
    this._aiModelConfig = null;
  }

  async mount() {
    injectCss('pages/project-home/project-home.css');
    applyStoredTheme();

    const [project, stories, features, statuses, documents, mockups, tcCoverage, issueCount] = await Promise.all([
      window.db.projects.get(this.projectId),
      window.db.userStories.list({ project_id: this.projectId }),
      window.db.features.list(this.projectId),
      window.db.status.list(),
      window.db.documents.list(this.projectId),
      window.db.screenDesigns.list(this.projectId),
      window.db.testCases.coverage(this.projectId),
      window.db.issues.count(this.projectId),
    ]);

    this._project    = project;
    this._stories    = stories;
    this._features   = features;
    this._statuses   = statuses;
    this._documents  = documents;
    this._mockups    = mockups;
    this._tcCoverage = tcCoverage;
    this._issueCount = issueCount;

    this.container.innerHTML = this._template();

    this._modelConfigsModal = new ModelConfigsModal({ onConfigsChanged: () => this._reloadModelDropdown() });
    this._modelConfigsModal.mount();
    await this._reloadModelDropdown();

    this._qcmdModal = new QuickCommandsModal({ onRunCommand: () => this.router.navigate('user-stories', { projectId: this.projectId }) });
    this._qcmdModal.mount();

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

  _quickLinksHtml() {
    const docs = this._documents || [];
    const hasDoc  = title => docs.some(d => d.title.toLowerCase() === title.toLowerCase());
    const hasStyle = !!((() => { try { const p = JSON.parse(this._project?.design_template || ''); return p?.light || p?.dark; } catch { return this._project?.design_template; } })());

    const links = [
      {
        id:   'phlOverview',
        name: 'Project Overview',
        desc: 'High-level project summary document',
        has:  hasDoc('Project Overview'),
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
      },
      {
        id:   'phlStyleGuide',
        name: 'Project Style Guide',
        desc: 'Design tokens, colours and components',
        has:  hasStyle,
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
      },
      {
        id:   'phlArchitecture',
        name: 'Architecture Overview',
        desc: 'System design and component structure',
        has:  hasDoc('Architecture Overview'),
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7M17.5 14v7"/></svg>`,
      },
      {
        id:   'phlTechStack',
        name: 'Tech Stack',
        desc: 'Languages, frameworks and tools used',
        has:  hasDoc('Tech Stack'),
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
      },
    ];

    return `
      <div class="project-home__stats">
        ${links.map(l => `
          <button class="ph-stat-card ph-stat-card--link" id="${l.id}">
            <div class="ph-qlink__top">
              <div class="ph-qlink__name">${escHtml(l.name)}</div>
              <span class="ph-qlink__badge ${l.has ? 'ph-qlink__badge--set' : ''}">
                ${l.has ? 'Set' : 'Not set'}
              </span>
            </div>
            <div class="ph-qlink__desc">${escHtml(l.desc)}</div>
          </button>
        `).join('')}
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
          <div class="project-page__model-group" style="-webkit-app-region:no-drag;">
            <select class="project-page__model-select" id="phModelSelect" title="AI Model">
              <option value="">Loading…</option>
            </select>
            <button class="project-page__model-cfg-btn" id="phBtnModelConfigs" title="Configure AI models">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <button class="project-page__git-btn" id="phBtnGit" title="Git (opens User Stories)" style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
              <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
          <button class="project-page__qcmd-btn" id="phBtnQcmd" title="Quick Commands" style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="4" cy="6"  r="1.5" fill="currentColor"/>
              <circle cx="4" cy="10" r="1.5" fill="currentColor"/>
              <circle cx="4" cy="14" r="1.5" fill="currentColor"/>
              <path d="M8 6h8M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </header>

        <div class="project-home__body">
          <div class="project-home__section-label">Overview</div>
          ${this._statsHtml()}

          <div class="project-home__section-label" style="margin-top:2rem;">Quick Links</div>
          ${this._quickLinksHtml()}

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

            <button class="ph-card" id="cardTestCases">
              <div class="ph-card__icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v11m0 0H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4m0-6h4m0 0h4m-4 0v6m0 0H9m4 0h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-4"/>
                </svg>
              </div>
              <div class="ph-card__body">
                <div class="ph-card__name">Test Cases</div>
                <div class="ph-card__desc">Test cases linked to stories with pass/fail tracking.</div>
              </div>
              <div class="ph-card__footer">
                <span class="ph-card__count">${this._tcCoverage?.total ?? 0}</span>
                <svg class="ph-card__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </div>
            </button>

            <button class="ph-card" id="cardIssues">
              <div class="ph-card__icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <div class="ph-card__body">
                <div class="ph-card__name">Issues</div>
                <div class="ph-card__desc">Track bugs and issues linked to user stories.</div>
              </div>
              <div class="ph-card__footer">
                <span class="ph-card__count">${this._issueCount?.total ?? 0}</span>
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

  async _reloadModelDropdown() {
    const select = this.container.querySelector('#phModelSelect');
    if (!select) return;
    const configs = await window.db.modelConfigs.list();
    const prevId  = select.value ? Number(select.value) : null;
    select.innerHTML = configs.length === 0
      ? `<option value="">No models configured</option>`
      : configs.map(c => `<option value="${c.id}">${escHtml(c.label)} [${c.type.toUpperCase()}]</option>`).join('');
    const def    = configs.find(c => c.is_default) || configs[0];
    const target = configs.find(c => c.id === prevId) || def;
    if (target) { select.value = target.id; this._aiModelConfig = target; }
  }

  _bindEvents() {
    this.container.querySelector('#btnBack')
      .addEventListener('click', () => this.router.navigate('launcher'));

    this.container.querySelector('#phBtnModelConfigs')
      .addEventListener('click', () => this._modelConfigsModal.show());

    this.container.querySelector('#phModelSelect')
      .addEventListener('change', (e) => {
        const id = Number(e.target.value);
        window.db.modelConfigs.get(id).then(cfg => { this._aiModelConfig = cfg; });
      });

    this.container.querySelector('#phBtnGit')
      .addEventListener('click', () => this.router.navigate('user-stories', { projectId: this.projectId }));

    this.container.querySelector('#phBtnQcmd')
      .addEventListener('click', () => this._qcmdModal.show());

    this.container.querySelector('#cardMockups')
      .addEventListener('click', () => this.router.navigate('mockups', { projectId: this.projectId }));

    this.container.querySelector('#cardDocuments')
      .addEventListener('click', () => this.router.navigate('documents', { projectId: this.projectId }));

    this.container.querySelector('#cardUserStories')
      .addEventListener('click', () => this.router.navigate('user-stories', { projectId: this.projectId }));

    this.container.querySelector('#cardTestCases')
      .addEventListener('click', () => this.router.navigate('test-cases', { projectId: this.projectId }));

    this.container.querySelector('#cardIssues')
      .addEventListener('click', () => this.router.navigate('issues', { projectId: this.projectId }));

    this.container.querySelector('#phlOverview')
      .addEventListener('click', () => this.router.navigate('documents', { projectId: this.projectId, docTitle: 'Project Overview' }));

    this.container.querySelector('#phlStyleGuide')
      .addEventListener('click', () => this.router.navigate('style-guide', { projectId: this.projectId, from: 'project-home' }));

    this.container.querySelector('#phlArchitecture')
      .addEventListener('click', () => this.router.navigate('documents', { projectId: this.projectId, docTitle: 'Architecture Overview' }));

    this.container.querySelector('#phlTechStack')
      .addEventListener('click', () => this.router.navigate('documents', { projectId: this.projectId, docTitle: 'Tech Stack' }));
  }
}
