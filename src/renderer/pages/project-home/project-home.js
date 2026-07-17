import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { GitController } from '../../components/git/git-controller.js';
import { ProjectSidebar } from '../../components/project-sidebar/project-sidebar.js';

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
      gitBadgeId:           'psnGitBadge',
      controlBtnVisibility: false,
    });
    this._git.mount();

    this._bindEvents();
    this._sidebar.bindEvents(this.container);
    this._sidebar.loadCounts(this.container, {
      documents:  this._documents,
      layers:     this._layers,
      mockups:    this._mockups,
      workflows:  this._workflows,
      issueCount: this._issueCount,
    });

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
    const name    = this._project?.name ?? 'Project';
    const initial = name.trim()[0]?.toUpperCase() ?? '?';

    this._sidebar = new ProjectSidebar({
      projectId:   this.projectId,
      router:      this.router,
      activeRoute: 'project-home',
    });

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

          ${this._sidebar.html()}

          <!-- Main content -->
          <main class="project-home__content">
            <div class="ph-content-title">Dashboard</div>
            <div class="ph-content-sub">${escHtml(name)}</div>

            ${this._statsHtml()}

            ${this._timelineHtml()}

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
  // Project timeline card — date range vs. layer completion
  // ----------------------------------------------------------------
  _timelineHtml() {
    const startDate = this._project?.start_date;
    const endDate    = this._project?.end_date;

    // Aggregate layer completion across every project layer's workflow stats
    const rows       = this._layerStats || [];
    const totalUnits  = rows.reduce((sum, r) => sum + (r.total    ?? 0), 0);
    const doneUnits   = rows.reduce((sum, r) => sum + (r.executed ?? 0), 0);
    const completedPct = totalUnits > 0 ? Math.round((doneUnits / totalUnits) * 100) : 0;

    if (!startDate || !endDate) {
      return `
        <div class="ph-section-label">Project Timeline</div>
        <div class="ph-timeline-card" style="margin-bottom:28px">
          <div class="ph-timeline-empty">
            No start/end date set for this project. Edit the project from the Home screen to track progress against a timeline.
          </div>
        </div>`;
    }

    const start = new Date(startDate);
    const end   = new Date(endDate);
    const today = new Date(new Date().toDateString());

    const totalDays   = Math.max(1, Math.round((end - start) / 86400000));
    const elapsedDays = Math.round((today - start) / 86400000);
    const elapsedPct  = Math.max(0, Math.min(100, Math.round((elapsedDays / totalDays) * 100)));

    const notStarted = today < start;
    const overdue     = today > end && completedPct < 100;

    let statusCls, statusLabel;
    if (completedPct >= 100) {
      statusCls = 'done'; statusLabel = 'Completed';
    } else if (notStarted) {
      statusCls = 'open'; statusLabel = 'Not Started';
    } else if (overdue) {
      statusCls = 'failed'; statusLabel = 'Overdue';
    } else if (completedPct >= elapsedPct - 5) {
      statusCls = 'done'; statusLabel = 'On Track';
    } else {
      statusCls = 'failed'; statusLabel = 'Behind Schedule';
    }

    const fmt = d => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    return `
      <div class="ph-section-label">Project Timeline</div>
      <div class="ph-timeline-card" style="margin-bottom:28px">
        <div class="ph-timeline-head">
          <div class="ph-timeline-dates">${fmt(start)} &ndash; ${fmt(end)}</div>
          <span class="ph-wf-pill ph-wf-pill--${statusCls}">${statusLabel}</span>
        </div>
        <div class="ph-timeline-bar-wrap">
          <div class="ph-timeline-bar">
            <div class="ph-timeline-bar__fill" style="width:${completedPct}%"></div>
            <div class="ph-timeline-bar__marker" style="left:${elapsedPct}%" title="${elapsedPct}% of timeline elapsed"></div>
          </div>
        </div>
        <div class="ph-timeline-foot">
          <span><b>${completedPct}%</b> complete</span>
          <span>${elapsedPct}% of timeline elapsed</span>
        </div>
      </div>`;
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

    // Quick links
    this.container.querySelector('#phlOverview')
      .addEventListener('click', () => this.router.navigate('documents', { projectId: this.projectId, docTitle: 'Project Overview' }));

    this.container.querySelector('#phlStyleGuide')
      .addEventListener('click', () => this.router.navigate('style-guide', { projectId: this.projectId, from: 'project-home' }));
  }
}
