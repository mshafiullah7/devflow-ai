import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelPicker }       from '../../components/model-picker/model-picker.js';
import { GitController } from '../../components/git/git-controller.js';

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

    const [project, workflows, documents, mockups, issueCount, testRunHistory, layers, layerStats] = await Promise.all([
      window.db.projects.get(this.projectId),
      window.db.workflows.list(this.projectId),
      window.db.documents.list(this.projectId),
      window.db.screenDesigns.list(this.projectId),
      window.db.issues.count(this.projectId),
      window.db.testRunHistory.list(this.projectId),
      window.db.projectLayers.list(this.projectId),
      window.db.layers.statsByProjectLayer(this.projectId),
    ]);

    this._project          = project;
    this._workflows        = workflows ?? [];
    this._documents        = documents;
    this._mockups          = mockups;
    this._issueCount       = issueCount;
    this._testRunHistory   = testRunHistory;
    this._layers           = layers ?? [];
    this._layerStats       = layerStats ?? [];

    this.container.innerHTML = this._template();

    this._picker = new ModelPicker({
      anchor:   this.container.querySelector('#phModelPicker'),
      onSelect: model => { this._aiModelConfig = model; },
    });
    await this._picker.reload();


    this._git = new GitController({
      getTermCwd:           () => this._project?.project_path || '',
      getLayers:            () => this._layers,
      gitBtnId:             'phBtnGit',
      gitBadgeId:           'phGitBadge',
      controlBtnVisibility: false,
    });
    this._git.mount();

    this._bindEvents();

    if (this._project?.project_path) {
      this._git.refreshStatus();
      this._git.startPoll();
    }
  }

  unmount() {
    removeCss('pages/project-home/project-home.css');
    this._picker?.unmount();
    this._git?.stopPoll();
  }

  // ----------------------------------------------------------------
  // Stats boxes (3-up: stories, features, issues)
  // ----------------------------------------------------------------
  _statsHtml() {
    const workflows   = this._workflows  || [];
    const openIssues  = this._issueCount?.open  ?? 0;
    const totalIssues = this._issueCount?.total ?? 0;

    const wfOpen      = workflows.filter(w => !w.status || w.status === 'open').length;
    const wfInProg    = workflows.filter(w => w.status === 'in_progress').length;
    const wfCompleted = workflows.filter(w => w.status === 'completed').length;

    const wfPills = `
      <div class="ph-stat-box__status-pills">
        ${wfOpen      > 0 ? `<span class="ph-wf-pill ph-wf-pill--open">Open <b>${wfOpen}</b></span>`           : ''}
        ${wfInProg    > 0 ? `<span class="ph-wf-pill ph-wf-pill--inprog">In Progress <b>${wfInProg}</b></span>` : ''}
        ${wfCompleted > 0 ? `<span class="ph-wf-pill ph-wf-pill--done">Completed <b>${wfCompleted}</b></span>` : ''}
        ${!workflows.length ? `<span class="ph-wf-pill ph-wf-pill--open">No workflows yet</span>` : ''}
      </div>`;

    return `
      <div class="ph-stats-strip">
        <div class="ph-stat-box ph-stat-box--accent">
          <div class="ph-stat-box__value">${workflows.length}</div>
          <div class="ph-stat-box__label">Workflows</div>
          ${wfPills}
        </div>
        <div class="ph-stat-box ${openIssues > 0 ? 'ph-stat-box--danger' : ''}">
          <div class="ph-stat-box__value">${openIssues}</div>
          <div class="ph-stat-box__label">Open Issues</div>
          <div class="ph-stat-box__total">of ${totalIssues} total</div>
        </div>
      </div>`;
  }


  // ----------------------------------------------------------------
  // Quick links
  // ----------------------------------------------------------------
  _quickLinksHtml() {
    const docs     = this._documents || [];
    const hasDoc   = title => docs.some(d => d.title.toLowerCase() === title.toLowerCase());
    const hasStyle = !!((() => { try { const p = JSON.parse(this._project?.design_template || ''); return p?.light || p?.dark; } catch { return this._project?.design_template; } })());

    const links = [
      {
        id:   'phlOverview',
        name: 'Project Overview',
        has:  hasDoc('Project Overview'),
        icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
      },
      {
        id:   'phlStyleGuide',
        name: 'Style Guide',
        has:  hasStyle,
        icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
      },
    ];

    return links.map(l => `
      <button class="ph-qlink" id="${l.id}">
        <span class="ph-qlink__icon">${l.icon}</span>
        <span class="ph-qlink__name">${escHtml(l.name)}</span>
        <span class="ph-qlink__badge ${l.has ? 'ph-qlink__badge--set' : 'ph-qlink__badge--unset'}">
          ${l.has ? 'Set' : 'Not set'}
        </span>
      </button>`).join('');
  }

  // ----------------------------------------------------------------
  // Template
  // ----------------------------------------------------------------
  _template() {
    const name        = this._project?.name ?? 'Project';
    const initial     = name.trim()[0]?.toUpperCase() ?? '?';
    const mockups     = this._mockups  || [];
    const documents   = this._documents || [];
    const failed      = this._testRunHistory[0]?.failed ?? 0;
    const issueTotal  = this._issueCount?.total ?? 0;

    return `
      <div class="project-home">

        <header class="project-home__header">
          <button class="project-home__back" id="btnBack" aria-label="Back to projects">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>

          <div class="project-home__badge">
            <div class="project-home__badge-initial">${escHtml(initial)}</div>
            <span class="project-home__badge-name">${escHtml(name)}</span>
          </div>

          <div class="project-page__model-group" style="-webkit-app-region:no-drag;">
            <div id="phModelPicker"></div>
          </div>

          <button class="project-page__git-btn" id="phBtnGit" title="Git" style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
              <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span class="project-page__git-badge project-page__git-badge--dot" id="phGitBadge" hidden></span>
          </button>
        </header>

        <div class="project-home__layout">

          <!-- Sidebar -->
          <nav class="project-home__sidebar">

            <div class="ph-sidebar-section">Overview</div>
            <button class="ph-nav-item active" id="navDashboard">
              <span class="ph-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <rect x="3" y="3" width="7" height="7" rx="1"/>
                  <rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/>
                  <rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
              </span>
              <span class="ph-nav-item__label">Dashboard</span>
            </button>

            <div class="ph-sidebar-section">Work</div>
            <button class="ph-nav-item" id="navDocuments">
              <span class="ph-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </span>
              <span class="ph-nav-item__label">Documents</span>
              <span class="ph-nav-item__count">${documents.length}</span>
            </button>

            <button class="ph-nav-item" id="navLayers">
              <span class="ph-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                  <polyline points="2 17 12 22 22 17"/>
                  <polyline points="2 12 12 17 22 12"/>
                </svg>
              </span>
              <span class="ph-nav-item__label">Layers</span>
              <span class="ph-nav-item__count">${this._layers.length}</span>
            </button>

            <button class="ph-nav-item" id="navMockups">
              <span class="ph-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2"/>
                  <path d="M8 21h8M12 17v4"/>
                </svg>
              </span>
              <span class="ph-nav-item__label">Mockups</span>
              <span class="ph-nav-item__count">${mockups.length}</span>
            </button>

            <button class="ph-nav-item" id="navWorkflows">
              <span class="ph-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1"/>
                  <rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/>
                  <rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
              </span>
              <span class="ph-nav-item__label">Workflows</span>
              <span class="ph-nav-item__count">${this._workflows.length}</span>
            </button>


            <div class="ph-sidebar-section">Quality</div>
            <button class="ph-nav-item" id="navTestGenerator">
              <span class="ph-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 3h6M9 3v9l-4 6h14l-4-6V3"/>
                </svg>
              </span>
              <span class="ph-nav-item__label">Test Generator</span>
            </button>
            <button class="ph-nav-item" id="navTestRunner">
              <span class="ph-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              </span>
              <span class="ph-nav-item__label">Test Runner</span>
              <span class="ph-nav-item__count ${failed > 0 ? 'ph-nav-item__count--danger' : ''}">${failed} failed</span>
            </button>

            <button class="ph-nav-item" id="navIssues">
              <span class="ph-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </span>
              <span class="ph-nav-item__label">Issues</span>
              <span class="ph-nav-item__count ${issueTotal > 0 ? 'ph-nav-item__count--danger' : ''}">${issueTotal}</span>
            </button>

            <div class="ph-sidebar-section">Tools</div>
            <button class="ph-nav-item" id="navGitChanges">
              <span class="ph-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
                  <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
                  <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </span>
              <span class="ph-nav-item__label">Git Changes</span>
            </button>

            <button class="ph-nav-item" id="navAiConsole">
              <span class="ph-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </span>
              <span class="ph-nav-item__label">AI Chat</span>
            </button>

            <div class="ph-sidebar-section">System</div>
            <button class="ph-nav-item" id="navSettings">
              <span class="ph-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
                    stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </span>
              <span class="ph-nav-item__label">Settings</span>
            </button>

          </nav>

          <!-- Main content -->
          <main class="project-home__content">
            <div class="ph-content-title">Dashboard</div>
            <div class="ph-content-sub">${escHtml(name)}</div>

            ${this._statsHtml()}

            <div class="ph-section-label">Quick Links</div>
            <div class="ph-qlinks-grid" style="margin-bottom:28px">
              ${this._quickLinksHtml()}
            </div>

            ${this._layerStatsHtml()}

            ${this._chartsHtml()}
          </main>

        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // Layer-by-layer progress section
  // ----------------------------------------------------------------
  _layerStatsHtml() {
    const rows = this._layerStats || [];
    if (!rows.length) return '';

    const cnt = (count, cls, label) => count > 0
      ? `<span class="ph-lr-cnt ph-lr-cnt--${cls}" style="flex:${count}" title="${count} ${label}">${count} ${label}</span>`
      : '';

    const rowsHtml = rows.map(r => {
      const total       = r.total        ?? 0;
      const executed    = r.executed     ?? 0;
      const failed      = r.failed       ?? 0;
      const needsReview = r.needs_review ?? 0;
      const running     = r.running      ?? 0;
      const open        = r.open         ?? 0;
      const allDone     = total > 0 && executed === total;

      const doneIcon = allDone
        ? `<svg class="ph-lr-done-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> `
        : '';

      return `
        <div class="ph-lr-row ${allDone ? 'ph-lr-row--done' : ''}">
          <div class="ph-lr-name">${doneIcon}${escHtml(r.name)}</div>
          <div class="ph-lr-counts">
            ${cnt(executed,    'done',    'Executed')}
            ${cnt(open,        'open',    'Open')}
            ${cnt(running,     'running', 'Running')}
            ${cnt(needsReview, 'review',  'Review')}
            ${cnt(failed,      'failed',  'Failed')}
            ${total === 0 ? '<span class="ph-lr-cnt ph-lr-cnt--empty">No items</span>' : ''}
          </div>
          <div class="ph-lr-total">${total} total</div>
        </div>`;
    }).join('');

    return `
      <div class="ph-section-label">Layer Progress</div>
      <div class="ph-lr-list">${rowsHtml}</div>`;
  }

  // ----------------------------------------------------------------
  // Metrics charts — placeholder until workflow screens are built
  // ----------------------------------------------------------------
  _chartsHtml() {
    return '';
  }

  // ----------------------------------------------------------------
  // Model dropdown
  // ----------------------------------------------------------------
  async _reloadModelDropdown() {
    if (this._picker) await this._picker.reload();
  }

  // ----------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------
  _bindEvents() {
    this.container.querySelector('#btnBack')
      .addEventListener('click', () => this.router.navigate('launcher'));


    this.container.querySelector('#phBtnGit')
      .addEventListener('click', () =>
        this.router.navigate('git-changes', { projectId: this.projectId, from: 'project-home' }));

    // Sidebar navigation
    this.container.querySelector('#navWorkflows')
      .addEventListener('click', () => this.router.navigate('workflows', { projectId: this.projectId }));

    this.container.querySelector('#navLayers')
      .addEventListener('click', () => this.router.navigate('project-layers', { projectId: this.projectId }));

    this.container.querySelector('#navMockups')
      .addEventListener('click', () => this.router.navigate('mockups', { projectId: this.projectId }));

    this.container.querySelector('#navDocuments')
      .addEventListener('click', () => this.router.navigate('documents', { projectId: this.projectId }));


    this.container.querySelector('#navTestGenerator')
      .addEventListener('click', () => this.router.navigate('test-generator', { projectId: this.projectId }));

    this.container.querySelector('#navTestRunner')
      .addEventListener('click', () => this.router.navigate('test-runner', { projectId: this.projectId }));

    this.container.querySelector('#navIssues')
      .addEventListener('click', () => this.router.navigate('issues', { projectId: this.projectId }));

    this.container.querySelector('#navAiConsole')
      .addEventListener('click', () => this.router.navigate('ai-console', { projectId: this.projectId }));

    this.container.querySelector('#navGitChanges')
      .addEventListener('click', () => this.router.navigate('git-changes', { projectId: this.projectId, from: 'project-home' }));

    this.container.querySelector('#navSettings')
      .addEventListener('click', () => this.router.navigate('settings', { from: 'project-home', fromParams: { projectId: this.projectId } }));

    // Quick links
    this.container.querySelector('#phlOverview')
      .addEventListener('click', () => this.router.navigate('documents', { projectId: this.projectId, docTitle: 'Project Overview' }));

    this.container.querySelector('#phlStyleGuide')
      .addEventListener('click', () => this.router.navigate('style-guide', { projectId: this.projectId, from: 'project-home' }));
  }
}
