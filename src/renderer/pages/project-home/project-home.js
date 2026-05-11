import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelConfigsModal } from '../../components/model-configs/model-configs-modal.js';
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

    const [project, stories, allStories, features, statuses, documents, mockups, issueCount, testRunHistory, queuePending] = await Promise.all([
      window.db.projects.get(this.projectId),
      window.db.userStories.list({ project_id: this.projectId }),
      window.db.userStories.list({ project_id: this.projectId, include_extracted: true }),
      window.db.features.list(this.projectId),
      window.db.status.list(),
      window.db.documents.list(this.projectId),
      window.db.screenDesigns.list(this.projectId),
      window.db.issues.count(this.projectId),
      window.db.testRunHistory.list(this.projectId),
      window.db.promptQueue.pendingCount(this.projectId),
    ]);

    this._project          = project;
    this._stories          = stories;
    this._extractedStories = allStories.filter(s => s.is_extracted);
    this._features         = features;
    this._statuses         = statuses;
    this._documents        = documents;
    this._mockups          = mockups;
    this._issueCount       = issueCount;
    this._testRunHistory   = testRunHistory;
    this._queuePending     = queuePending ?? 0;

    this.container.innerHTML = this._template();

    this._modelConfigsModal = new ModelConfigsModal({ onConfigsChanged: () => this._picker.reload() });
    this._modelConfigsModal.mount();
    this._picker = new ModelPicker({
      anchor:   this.container.querySelector('#phModelPicker'),
      onSelect: model => { this._aiModelConfig = model; },
    });
    await this._picker.reload();


    this._git = new GitController({
      getTermCwd:           () => this._project?.project_path || '',
      gitBtnId:             'phBtnGit',
      gitBadgeId:           'phGitBadge',
      controlBtnVisibility: false,
    });
    this._git.mount();

    this._bindEvents();

    if (this._project?.project_path) {
      this._setHeaderFolderPath(this._project.project_path);
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
    const stories  = this._stories  || [];
    const features = this._features || [];
    const openIssues  = this._issueCount?.open  ?? 0;
    const totalIssues = this._issueCount?.total ?? 0;

    const openStories  = stories.filter(s => s.status_name !== 'Done');
    const openFeatures = features.filter(f => f.status_name !== 'Done');

    return `
      <div class="ph-stats-strip">
        <div class="ph-stat-box ph-stat-box--accent">
          <div class="ph-stat-box__value">${openStories.length}</div>
          <div class="ph-stat-box__label">Open Stories</div>
          <div class="ph-stat-box__total">of ${stories.length} total</div>
        </div>
        <div class="ph-stat-box">
          <div class="ph-stat-box__value">${openFeatures.length}</div>
          <div class="ph-stat-box__label">Open Features</div>
          <div class="ph-stat-box__total">of ${features.length} total</div>
        </div>
        <div class="ph-stat-box ${openIssues > 0 ? 'ph-stat-box--danger' : ''}">
          <div class="ph-stat-box__value">${openIssues}</div>
          <div class="ph-stat-box__label">Open Issues</div>
          <div class="ph-stat-box__total">of ${totalIssues} total</div>
        </div>
      </div>`;
  }

  // ----------------------------------------------------------------
  // Status breakdown with progress bars
  // ----------------------------------------------------------------
  _statusBreakdownHtml() {
    const stories  = this._stories  || [];
    const statuses = this._statuses || [];
    const total    = stories.length;

    if (total === 0) {
      return `<p class="ph-status-empty">No stories yet</p>`;
    }

    const storyCounts = {};
    for (const s of stories) {
      const label = s.status_name || 'No Status';
      storyCounts[label] = (storyCounts[label] || 0) + 1;
    }

    const rows = [];
    for (const st of statuses) {
      if (storyCounts[st.name]) {
        rows.push({ label: st.name, count: storyCounts[st.name] });
      }
    }
    if (storyCounts['No Status']) {
      rows.push({ label: 'No Status', count: storyCounts['No Status'] });
    }

    return rows.map(r => {
      const pct = Math.round((r.count / total) * 100);
      return `
        <div class="ph-status-row">
          <span class="ph-status-dot"></span>
          <span class="ph-status-name">${escHtml(r.label)}</span>
          <div class="ph-status-bar-wrap">
            <div class="ph-status-bar" style="width:${pct}%"></div>
          </div>
          <span class="ph-status-count">${r.count}</span>
        </div>`;
    }).join('');
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
      {
        id:   'phlArchitecture',
        name: 'Architecture',
        has:  hasDoc('Architecture Overview'),
        icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7M17.5 14v7"/></svg>`,
      },
      {
        id:   'phlTechStack',
        name: 'Tech Stack',
        has:  hasDoc('Tech Stack'),
        icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
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
    const stories     = this._stories  || [];
    const features    = this._features || [];
    const mockups     = this._mockups  || [];
    const documents   = this._documents || [];
    const extracted   = this._extractedStories || [];
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

          <div class="project-page__folder-display" id="headerFolderDisplay" title="Select folder" style="-webkit-app-region:no-drag;">
            <div class="project-page__folder-pill">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                  stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              </svg>
              <span class="project-page__folder-text" id="headerFolderText">Select folder</span>
            </div>
          </div>

          <div class="project-page__model-group" style="-webkit-app-region:no-drag;">
            <div id="phModelPicker"></div>
            <button class="project-page__model-cfg-btn" id="phBtnModelConfigs" title="Configure AI models">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <button class="project-page__git-btn" id="phBtnGit" title="Git" style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
              <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span class="project-page__git-badge" id="phGitBadge" hidden></span>
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

            <button class="ph-nav-item" id="navExtractStories">
              <span class="ph-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                  <path d="M2 17l10 5 10-5"/>
                  <path d="M2 12l10 5 10-5"/>
                </svg>
              </span>
              <span class="ph-nav-item__label">Extract Stories</span>
              <span class="ph-nav-item__count">${extracted.length}</span>
            </button>

            <button class="ph-nav-item" id="navUserStories">
              <span class="ph-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 11l3 3L22 4"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
              </span>
              <span class="ph-nav-item__label">User Stories</span>
              <span class="ph-nav-item__count">${stories.length}</span>
            </button>

            <div class="ph-sidebar-section">Quality</div>
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

            <div class="ph-sidebar-section">Code</div>
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

            <button class="ph-nav-item" id="navOpenVSCode" ${!this._project?.project_path ? 'disabled title="Select a folder first"' : `title="${escHtml(this._project.project_path)}"`}>
              <span class="ph-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M16 3l5 5-11 11H5v-5L16 3z"/>
                  <path d="M14 5l5 5"/>
                </svg>
              </span>
              <span class="ph-nav-item__label">Open VS Code</span>
            </button>

            <div class="ph-sidebar-section">Tools</div>
            <button class="ph-nav-item" id="navPromptQueue">
              <span class="ph-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h13M3 12h10M3 18h7M18 9v9M15 15l3 3 3-3"/>
                </svg>
              </span>
              <span class="ph-nav-item__label">Prompt Queue</span>
              ${this._queuePending > 0 ? `<span class="ph-nav-item__count">${this._queuePending}</span>` : ''}
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

            ${this._chartsHtml()}
          </main>

        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // Metrics charts — burndown + priority distribution + hours bars
  // ----------------------------------------------------------------
  _chartsHtml() {
    const stories = this._stories || [];

    const PRIOS  = ['critical', 'high', 'medium', 'low'];
    const COLORS = { critical: '#f87171', high: '#fb923c', medium: '#fbbf24', low: '#60a5fa' };
    const LABELS = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    const est    = { critical: 0, high: 0, medium: 0, low: 0 };
    const rem    = { critical: 0, high: 0, medium: 0, low: 0 };

    for (const s of stories) {
      const p = PRIOS.includes(s.priority) ? s.priority : 'medium';
      counts[p]++;
      est[p] += (s.estimated_hours  || 0);
      rem[p] += (s.remaining_hours  || 0);
    }

    const total    = stories.length;
    const totalEst = PRIOS.reduce((a, p) => a + est[p], 0);
    const totalRem = PRIOS.reduce((a, p) => a + rem[p], 0);
    const burnPct  = totalEst > 0 ? Math.min(100, Math.round(((totalEst - totalRem) / totalEst) * 100)) : 0;

    // ── Donut SVG ──────────────────────────────────────────────────
    const cx = 60, cy = 60, R = 50, r = 32;
    const ptOuter = (deg) => {
      const rad = (deg - 90) * Math.PI / 180;
      return { x: +(cx + R * Math.cos(rad)).toFixed(3), y: +(cy + R * Math.sin(rad)).toFixed(3) };
    };
    const ptInner = (deg) => {
      const rad = (deg - 90) * Math.PI / 180;
      return { x: +(cx + r * Math.cos(rad)).toFixed(3), y: +(cy + r * Math.sin(rad)).toFixed(3) };
    };

    let cursor = 0;
    const donutPaths = total === 0
      ? `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="var(--border)" stroke-width="${R - r}"/>`
      : PRIOS.map(p => {
          if (!counts[p]) return '';
          const sweep = Math.min((counts[p] / total) * 360, 359.99);
          const end   = cursor + sweep;
          const large = sweep > 180 ? 1 : 0;
          const o1 = ptOuter(cursor), o2 = ptOuter(end);
          const i2 = ptInner(cursor), i1 = ptInner(end);
          const d  = `M${o1.x} ${o1.y} A${R} ${R} 0 ${large} 1 ${o2.x} ${o2.y} L${i1.x} ${i1.y} A${r} ${r} 0 ${large} 0 ${i2.x} ${i2.y}Z`;
          cursor   = end;
          return `<path d="${d}" fill="${COLORS[p]}"/>`;
        }).join('');

    const legend = PRIOS.map(p => `
      <div class="ph-dleg-item">
        <span class="ph-dleg-dot" style="background:${COLORS[p]}"></span>
        <span class="ph-dleg-name">${LABELS[p]}</span>
        <span class="ph-dleg-cnt">${counts[p]}</span>
      </div>`).join('');

    // ── Hours-by-priority bars ─────────────────────────────────────
    const maxEst = Math.max(...PRIOS.map(p => est[p]), 0.01);

    const burnRows = PRIOS.map(p => {
      const e  = est[p];
      const rr = rem[p];
      if (e === 0 && rr === 0) return `
        <div class="ph-hrow">
          <span class="ph-hrow-lbl ph-hrow-lbl--${p}">${LABELS[p]}</span>
          <div class="ph-hrow-bars"><span class="ph-hrow-none">—</span></div>
          <span class="ph-hrow-val">—</span>
        </div>`;
      const trackPct = Math.round((e / maxEst) * 100);
      const remPct   = e > 0 ? Math.round((rr / e) * 100) : 0;
      const donePct  = 100 - remPct;
      return `
        <div class="ph-hrow">
          <span class="ph-hrow-lbl ph-hrow-lbl--${p}">${LABELS[p]}</span>
          <div class="ph-hrow-bars">
            <div class="ph-hrow-track" style="width:${trackPct}%">
              <div class="ph-hrow-rem" style="width:${remPct}%;background:${COLORS[p]}"></div>
            </div>
            <span class="ph-hrow-pct">${donePct}%</span>
          </div>
          <span class="ph-hrow-val" style="color:${COLORS[p]}">${rr > 0 ? rr.toFixed(1) + 'h' : '0h'}</span>
        </div>`;
    }).join('');

    // ── Stories by status bars ─────────────────────────────────────
    const statuses  = this._statuses || [];
    const stCounts  = {};
    for (const s of stories) {
      const lbl = s.status_name || 'No Status';
      stCounts[lbl] = (stCounts[lbl] || 0) + 1;
    }
    const stRows = [
      ...statuses.filter(st => stCounts[st.name]).map(st => ({ label: st.name, count: stCounts[st.name] })),
      ...(stCounts['No Status'] ? [{ label: 'No Status', count: stCounts['No Status'] }] : []),
    ];
    const maxStCount = Math.max(...stRows.map(r => r.count), 1);
    const statusBars = stRows.length === 0
      ? `<span class="ph-hrow-none">No stories yet</span>`
      : stRows.map(r => {
          const barPct  = Math.round((r.count / maxStCount) * 100);
          const ofTotal = total > 0 ? Math.round((r.count / total) * 100) : 0;
          return `
            <div class="ph-hrow">
              <span class="ph-hrow-lbl ph-hrow-lbl--wide">${escHtml(r.label)}</span>
              <div class="ph-hrow-bars">
                <div class="ph-hrow-track ph-hrow-track--full" style="width:${barPct}%">
                  <div class="ph-hrow-rem ph-hrow-rem--status" style="width:100%"></div>
                </div>
                <span class="ph-hrow-pct">${ofTotal}%</span>
              </div>
              <span class="ph-hrow-val ph-hrow-val--neutral">${r.count}</span>
            </div>`;
        }).join('');

    const bdStatText = totalEst > 0
      ? `${totalRem.toFixed(1)}h remaining of ${totalEst.toFixed(1)}h estimated`
      : 'No hours tracked yet';

    return `
      <div class="ph-metrics-wrap">
        <div class="ph-section-label" style="margin-top:28px">Metrics</div>

        <div class="ph-bd-card">
          <div class="ph-bd-hdr">
            <span class="ph-bd-title">Burndown</span>
            <span class="ph-bd-stat">${bdStatText}</span>
            <span class="ph-bd-pct">${burnPct}%</span>
          </div>
          <div class="ph-bd-track">
            <div class="ph-bd-fill" style="width:${burnPct}%"></div>
          </div>
        </div>

        <div class="ph-mc-grid">
          <div class="ph-mc-card">
            <div class="ph-mc-title">Priority Distribution</div>
            <div class="ph-donut-layout">
              <svg viewBox="0 0 120 120" class="ph-donut-svg" xmlns="http://www.w3.org/2000/svg">
                ${donutPaths}
                <text x="60" y="55" class="ph-donut-num" text-anchor="middle" dominant-baseline="middle">${total}</text>
                <text x="60" y="70" class="ph-donut-sub" text-anchor="middle">stories</text>
              </svg>
              <div class="ph-donut-legend">${legend}</div>
            </div>
          </div>
          <div class="ph-mc-card">
            <div class="ph-mc-title">Hours by Priority</div>
            <div class="ph-hrows">${burnRows}</div>
          </div>
        </div>

        <div class="ph-mc-card ph-mc-card--full">
          <div class="ph-mc-title">Stories by Status</div>
          <div class="ph-hrows ph-hrows--grid">${statusBars}</div>
        </div>
      </div>`;
  }

  // ----------------------------------------------------------------
  // Model dropdown
  // ----------------------------------------------------------------
  async _reloadModelDropdown() {
    if (this._picker) await this._picker.reload();
  }

  _setHeaderFolderPath(folderPath) {
    const text    = this.container.querySelector('#headerFolderText');
    const display = this.container.querySelector('#headerFolderDisplay');
    if (!text || !display) return;
    text.textContent = folderPath;
    display.classList.add('project-page__folder-display--active');

    const vsCodeBtn = this.container.querySelector('#navOpenVSCode');
    if (vsCodeBtn) {
      vsCodeBtn.disabled = false;
      vsCodeBtn.title = folderPath;
    }
  }

  // ----------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------
  _bindEvents() {
    this.container.querySelector('#btnBack')
      .addEventListener('click', () => this.router.navigate('launcher'));

    this.container.querySelector('#phBtnModelConfigs')
      .addEventListener('click', () => this.router.navigate('settings', { from: 'project-home', fromParams: { projectId: this.projectId } }));


    this.container.querySelector('#headerFolderDisplay')
      .addEventListener('click', async () => {
        const folderPath = await window.db.dialog.openFolder();
        if (!folderPath) return;
        await window.db.projects.setPath({ id: this.projectId, project_path: folderPath });
        if (this._project) this._project.project_path = folderPath;
        this._setHeaderFolderPath(folderPath);
        this._git.refreshStatus();
        this._git.startPoll();
      });

    this.container.querySelector('#phBtnGit')
      .addEventListener('click', () =>
        this.router.navigate('git-changes', { projectId: this.projectId, from: 'project-home' }));

    // Sidebar navigation
    this.container.querySelector('#navMockups')
      .addEventListener('click', () => this.router.navigate('mockups', { projectId: this.projectId }));

    this.container.querySelector('#navDocuments')
      .addEventListener('click', () => this.router.navigate('documents', { projectId: this.projectId }));

    this.container.querySelector('#navExtractStories')
      .addEventListener('click', () => this.router.navigate('extract-user-stories', { projectId: this.projectId }));

    this.container.querySelector('#navUserStories')
      .addEventListener('click', () => this.router.navigate('user-stories', { projectId: this.projectId }));

    this.container.querySelector('#navTestRunner')
      .addEventListener('click', () => this.router.navigate('test-runner', { projectId: this.projectId }));

    this.container.querySelector('#navIssues')
      .addEventListener('click', () => this.router.navigate('issues', { projectId: this.projectId }));

    this.container.querySelector('#navPromptQueue')
      .addEventListener('click', () => this.router.navigate('prompt-queue', { projectId: this.projectId, from: 'project-home' }));

    this.container.querySelector('#navAiConsole')
      .addEventListener('click', () => this.router.navigate('ai-console', { projectId: this.projectId }));

    this.container.querySelector('#navGitChanges')
      .addEventListener('click', () => this.router.navigate('git-changes', { projectId: this.projectId, from: 'project-home' }));

    this.container.querySelector('#navOpenVSCode')
      .addEventListener('click', () => {
        const path = this._project?.project_path;
        if (path) window.shell.openVSCode(path);
      });

    this.container.querySelector('#navSettings')
      .addEventListener('click', () => this.router.navigate('settings', { from: 'project-home', fromParams: { projectId: this.projectId } }));

    // Quick links
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
