import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { GitController } from '../../components/git/git-controller.js';

export class ProjectHomePage {
  constructor(container, params, router) {
    this.container      = container;
    this.router         = router;
    this.projectId      = params.projectId;
    this._project       = null;
  }

  async mount() {
    await injectCss('pages/project-home/project-home.css');
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

    this._project        = project;
    this._workflows      = workflows ?? [];
    this._documents      = documents;
    this._mockups        = mockups;
    this._issueCount     = issueCount;
    this._testRunHistory = testRunHistory;
    this._layers         = layers ?? [];
    this._layerStats     = layerStats ?? [];

    this.container.innerHTML = this._template();


    this._git = new GitController({
      getTermCwd:           () => this._project?.project_path || '',
      getLayers:            () => this._layers,
      gitBadgeId:           'navGitBadge',
      controlBtnVisibility: false,
    });
    this._git.mount();

    this._bindEvents();

    if (this._project?.project_path || this._layers.some(l => l.folder_path)) {
      this._git.refreshStatus();
      this._git.startPoll();
    }
  }

  unmount() {
    removeCss('pages/project-home/project-home.css');
    this._git?.stopPoll();
  }

  // ----------------------------------------------------------------
  // Stats: KPI row + workflow/issue status donuts
  // ----------------------------------------------------------------
  _statsHtml() {
    const workflows         = this._workflows || [];
    const openIssues        = this._issueCount?.open        ?? 0;
    const inProgressIssues  = this._issueCount?.in_progress  ?? 0;
    const resolvedIssues    = this._issueCount?.resolved     ?? 0;
    const totalIssues       = this._issueCount?.total        ?? 0;

    const wfOpen      = workflows.filter(w => !w.status || w.status === 'open').length;
    const wfInProg    = workflows.filter(w => w.status === 'in_progress').length;
    const wfCompleted = workflows.filter(w => w.status === 'completed').length;
    const wfDiffered  = workflows.filter(w => w.status === 'differed').length;
    const wfTotal     = workflows.length;
    const wfCompPct   = wfTotal ? Math.round((wfCompleted / wfTotal) * 100) : 0;

    const kpi = (value, label, cls = '') => `
      <div class="ph-stat-box ${cls}">
        <div class="ph-stat-box__value">${value}</div>
        <div class="ph-stat-box__label">${label}</div>
      </div>`;

    const workflowDonut = this._donutCard('Workflow Status', wfTotal, [
      { label: 'Completed',   count: wfCompleted, color: '#16a34a' },
      { label: 'In Progress', count: wfInProg,    color: 'var(--accent)' },
      { label: 'Open',        count: wfOpen,      color: 'var(--border)' },
      { label: 'Differed',    count: wfDiffered,  color: '#9333ea' },
    ]);

    const issueDonut = this._donutCard('Issue Status', totalIssues, [
      { label: 'Open',        count: openIssues,       color: 'var(--danger)' },
      { label: 'In Progress', count: inProgressIssues, color: 'var(--accent)' },
      { label: 'Resolved',    count: resolvedIssues,   color: '#16a34a' },
    ]);

    return `
      <div class="ph-stats-strip ph-stats-strip--3">
        ${kpi(wfTotal, 'Workflows Total')}
        ${kpi(openIssues, 'Open Issues', openIssues > 0 ? 'ph-stat-box--danger' : '')}
        ${kpi(wfTotal ? wfCompPct + '%' : '—', 'Workflows Complete')}
      </div>
      <div class="ph-mc-grid" style="margin-bottom:28px">
        ${workflowDonut}
        ${issueDonut}
      </div>`;
  }

  // ----------------------------------------------------------------
  // Donut chart card (title + ring + legend), used by _statsHtml
  // ----------------------------------------------------------------
  _donutCard(title, total, segments) {
    const active         = segments.filter(s => s.count > 0);
    const r               = 40;
    const cx = 50, cy = 50;
    const circumference   = 2 * Math.PI * r;
    let acc = 0;

    const arcs = total > 0
      ? active.map(s => {
          const dash   = (s.count / total) * circumference;
          const offset = -acc;
          acc += dash;
          return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="14"
            style="stroke:${s.color}" stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}"
            stroke-dashoffset="${offset.toFixed(2)}"/>`;
        }).join('')
      : '';

    const legend = active.length
      ? active.map(s => `
          <div class="ph-dleg-item">
            <span class="ph-dleg-dot" style="background:${s.color}"></span>
            <span class="ph-dleg-name">${escHtml(s.label)}</span>
            <span class="ph-dleg-cnt">${s.count}</span>
          </div>`).join('')
      : `<div class="ph-status-empty">No data yet</div>`;

    return `
      <div class="ph-mc-card">
        <div class="ph-mc-title">${escHtml(title)}</div>
        <div class="ph-donut-layout">
          <svg class="ph-donut-svg" viewBox="0 0 100 100">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface-hover)" stroke-width="14"/>
            <g transform="rotate(-90 ${cx} ${cy})">${arcs}</g>
            <text x="${cx}" y="47" text-anchor="middle" class="ph-donut-num">${total}</text>
            <text x="${cx}" y="61" text-anchor="middle" class="ph-donut-sub">total</text>
          </svg>
          <div class="ph-donut-legend">${legend}</div>
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
    const issueOpen   = (this._issueCount?.open ?? 0) + (this._issueCount?.in_progress ?? 0);

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
              <span class="ph-nav-item__label">Project Layers</span>
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
              <span class="ph-nav-item__label">Unit Tests</span>
            </button>

            <button class="ph-nav-item ph-nav-item--disabled" id="navE2eTests" disabled title="Coming soon">
              <span class="ph-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              </span>
              <span class="ph-nav-item__label">E2E Tests</span>
              <span class="ph-nav-item__badge--soon">Soon</span>
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
              ${issueOpen > 0 ? `<span class="ph-nav-item__count ph-nav-item__count--danger">${issueOpen}</span>` : ''}
            </button>

            <div class="ph-sidebar-section">Tools</div>
            <button class="ph-nav-item" id="navTerminal">
              <span class="ph-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="4 17 10 11 4 5"/>
                  <line x1="12" y1="19" x2="20" y2="19"/>
                </svg>
              </span>
              <span class="ph-nav-item__label">Terminal</span>
            </button>

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
              <span class="ph-nav-item__count ph-nav-item__count--danger" id="navGitBadge" hidden></span>
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

    const seg = (count, cls, label) => count > 0
      ? `<div class="ph-lr-seg ph-lr-seg--${cls}" style="flex:${count}" title="${count} ${label}"></div>`
      : '';

    const pill = (count, cls, label) => count > 0
      ? `<span class="ph-wf-pill ph-wf-pill--${cls}">${label} <b>${count}</b></span>`
      : '';

    const cardsHtml = rows.map(r => {
      const total       = r.total        ?? 0;
      const executed    = r.executed     ?? 0;
      const failed      = r.failed       ?? 0;
      const needsReview = r.needs_review ?? 0;
      const running     = r.running      ?? 0;
      const open        = r.open         ?? 0;
      const allDone     = total > 0 && executed === total;
      const pct         = total > 0 ? Math.round((executed / total) * 100) : 0;

      const boxCls = allDone    ? 'ph-lr-card--done'
                   : failed > 0 ? 'ph-stat-box--danger'
                   : 'ph-stat-box--accent';

      const barHtml = total > 0 ? `
        <div class="ph-lr-bar" style="margin-top:10px">
          ${seg(executed,    'done',    'Executed')}
          ${seg(running,     'running', 'Running')}
          ${seg(needsReview, 'review',  'Review')}
          ${seg(failed,      'failed',  'Failed')}
          ${seg(open,        'open',    'Open')}
        </div>` : `<div class="ph-lr-bar ph-lr-bar--empty" style="margin-top:10px"></div>`;

      const pillsHtml = !total
        ? '<span class="ph-wf-pill ph-wf-pill--open">No layers yet</span>'
        : [
            pill(executed,    'done',   'Done'),
            pill(open,        'open',   'Open'),
            pill(running,     'inprog', 'Running'),
            pill(needsReview, 'review', 'Review'),
            pill(failed,      'failed', 'Failed'),
          ].join('');

      return `
        <div class="ph-stat-box ${boxCls}">
          <div class="ph-stat-box__value">${total > 0 ? pct + '%' : '—'}</div>
          <div class="ph-stat-box__label">${escHtml(r.name)}</div>
          <div class="ph-stat-box__status-pills">${pillsHtml}</div>
          ${barHtml}
        </div>`;
    }).join('');

    return `
      <div class="ph-section-label">Layer Progress</div>
      <div class="ph-stats-strip">${cardsHtml}</div>`;
  }

  // ----------------------------------------------------------------
  // Metrics charts — placeholder until workflow screens are built
  // ----------------------------------------------------------------
  _chartsHtml() {
    return '';
  }

  // ----------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------
  _bindEvents() {
    this.container.querySelector('#btnBack')
      .addEventListener('click', () => this.router.navigate('launcher'));


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

    this.container.querySelector('#navE2eTests')
      .addEventListener('click', () => this.router.navigate('test-generation', { mode: 'e2e', projectId: this.projectId }));

    this.container.querySelector('#navIssues')
      .addEventListener('click', () => this.router.navigate('issues', { projectId: this.projectId }));

    this.container.querySelector('#navAiConsole')
      .addEventListener('click', () => this.router.navigate('ai-console', { projectId: this.projectId }));

    this.container.querySelector('#navTerminal')
      .addEventListener('click', () => window.app.openTerminalWindow(this.projectId));

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
