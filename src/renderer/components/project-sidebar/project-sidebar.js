/**
 * Shared project navigation sidebar.
 *
 * Usage:
 *   // 1. In _template(): create and embed HTML
 *   this._sidebar = new ProjectSidebar({ projectId, router, activeRoute: 'documents' });
 *   // include ${this._sidebar.html()} in template string
 *
 *   // 2. After container.innerHTML is set:
 *   this._sidebar.bindEvents(this.container);
 *   this._sidebar.loadCounts(this.container);          // async — updates badges
 *
 *   // Or pass already-loaded data to avoid extra DB calls (project-home uses this):
 *   this._sidebar.loadCounts(this.container, { documents, layers, mockups, workflows, issueCount });
 */
export class ProjectSidebar {
  constructor({ projectId, router, activeRoute }) {
    this.projectId   = projectId;
    this.router      = router;
    this.activeRoute = activeRoute;
  }

  // ----------------------------------------------------------------
  // HTML
  // ----------------------------------------------------------------
  html() {
    const a = route => this.activeRoute === route ? ' active' : '';
    return `
      <nav class="project-home__sidebar">

        <div class="ph-sidebar-section">Overview</div>
        <button class="ph-nav-item${a('project-home')}" id="psnDashboard">
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
        <button class="ph-nav-item${a('style-guide')}" id="psnStyles">
          <span class="ph-nav-item__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="13.5" cy="6.5" r=".5"/>
              <circle cx="17.5" cy="10.5" r=".5"/>
              <circle cx="8.5" cy="7.5" r=".5"/>
              <circle cx="6.5" cy="12.5" r=".5"/>
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
            </svg>
          </span>
          <span class="ph-nav-item__label">Styles</span>
        </button>

        <button class="ph-nav-item${a('documents')}" id="psnDocuments">
          <span class="ph-nav-item__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </span>
          <span class="ph-nav-item__label">Documents</span>
          <span class="ph-nav-item__count" id="psnDocCount" hidden></span>
        </button>

        <button class="ph-nav-item${a('project-layers')}" id="psnLayers">
          <span class="ph-nav-item__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
          </span>
          <span class="ph-nav-item__label">Project Layers</span>
          <span class="ph-nav-item__count" id="psnLayerCount" hidden></span>
        </button>

        <button class="ph-nav-item${a('mockups')}" id="psnMockups">
          <span class="ph-nav-item__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <path d="M8 21h8M12 17v4"/>
            </svg>
          </span>
          <span class="ph-nav-item__label">Mockups</span>
          <span class="ph-nav-item__count" id="psnMockupCount" hidden></span>
        </button>

        <button class="ph-nav-item${a('workflows')}" id="psnWorkflows">
          <span class="ph-nav-item__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </span>
          <span class="ph-nav-item__label">Workflows</span>
          <span class="ph-nav-item__count" id="psnWorkflowCount" hidden></span>
        </button>

        <div class="ph-sidebar-section">Quality</div>
        <button class="ph-nav-item${a('test-generator')}" id="psnTests">
          <span class="ph-nav-item__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 3h6M9 3v9l-4 6h14l-4-6V3"/>
            </svg>
          </span>
          <span class="ph-nav-item__label">Unit Tests</span>
        </button>

        <button class="ph-nav-item ph-nav-item--disabled" disabled title="Coming soon">
          <span class="ph-nav-item__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </span>
          <span class="ph-nav-item__label">E2E Tests</span>
          <span class="ph-nav-item__badge--soon">Soon</span>
        </button>

        <button class="ph-nav-item${a('security-scans')}" id="psnSecurityScans">
          <span class="ph-nav-item__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </span>
          <span class="ph-nav-item__label">Security Scans</span>
        </button>

        <button class="ph-nav-item${a('issues')}" id="psnIssues">
          <span class="ph-nav-item__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </span>
          <span class="ph-nav-item__label">Issues</span>
          <span class="ph-nav-item__count ph-nav-item__count--danger" id="psnIssueCount" hidden></span>
        </button>

        <div class="ph-sidebar-section">Tools</div>
        <button class="ph-nav-item${a('terminal')}" id="psnTerminal">
          <span class="ph-nav-item__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 17 10 11 4 5"/>
              <line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
          </span>
          <span class="ph-nav-item__label">Terminal</span>
        </button>

        <button class="ph-nav-item${a('git-changes')}" id="psnGitChanges">
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
          <span class="ph-nav-item__count ph-nav-item__count--danger" id="psnGitBadge" hidden></span>
        </button>

        <button class="ph-nav-item${a('ai-console')}" id="psnAiConsole">
          <span class="ph-nav-item__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </span>
          <span class="ph-nav-item__label">AI Chat</span>
        </button>

        <div class="ph-sidebar-section">System</div>
        <button class="ph-nav-item${a('settings')}" id="psnSettings">
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
    `;
  }

  // ----------------------------------------------------------------
  // Event binding — wire up all nav clicks
  // ----------------------------------------------------------------
  bindEvents(container) {
    const pid = this.projectId;
    const r   = this.router;

    container.querySelector('#psnDashboard')
      ?.addEventListener('click', () => r.navigateTo('project-home', { projectId: pid }));
    container.querySelector('#psnDocuments')
      ?.addEventListener('click', () => r.navigateTo('documents', { projectId: pid }));
    container.querySelector('#psnLayers')
      ?.addEventListener('click', () => r.navigateTo('project-layers', { projectId: pid }));
    container.querySelector('#psnMockups')
      ?.addEventListener('click', () => r.navigateTo('mockups', { projectId: pid }));
    container.querySelector('#psnWorkflows')
      ?.addEventListener('click', () => r.navigateTo('workflows', { projectId: pid }));
    container.querySelector('#psnStyles')
      ?.addEventListener('click', () => r.navigateTo('style-guide', { projectId: pid, from: this.activeRoute || 'project-home' }));
    container.querySelector('#psnTests')
      ?.addEventListener('click', () => r.navigateTo('test-generator', { projectId: pid }));
    container.querySelector('#psnSecurityScans')
      ?.addEventListener('click', () => r.navigateTo('security-scans', { projectId: pid }));
    container.querySelector('#psnIssues')
      ?.addEventListener('click', () => r.navigateTo('issues', { projectId: pid }));
    container.querySelector('#psnTerminal')
      ?.addEventListener('click', async () => {
        const mode = await window.app.config.get('terminalOpenMode');
        if (mode === 'window') {
          window.app.openTerminalWindow(pid);
        } else {
          r.navigateTo('terminal', { projectId: pid, returnRoute: this.activeRoute || 'project-home' });
        }
      });
    container.querySelector('#psnGitChanges')
      ?.addEventListener('click', () => r.navigateTo('git-changes', { projectId: pid, from: 'project-home' }));
    container.querySelector('#psnAiConsole')
      ?.addEventListener('click', () => r.navigateTo('ai-console', { projectId: pid }));
    container.querySelector('#psnSettings')
      ?.addEventListener('click', () => r.navigateTo('settings', { from: 'project-home', fromParams: { projectId: pid } }));
  }

  // ----------------------------------------------------------------
  // Count badges
  // Accepts optional pre-loaded data to avoid redundant DB calls.
  // Any omitted key is fetched from the DB.
  // ----------------------------------------------------------------
  async loadCounts(container, preloaded = {}) {
    try {
      const [documents, layers, mockups, workflows, issueCount] = await Promise.all([
        preloaded.documents  !== undefined ? preloaded.documents  : window.db.documents.list(this.projectId),
        preloaded.layers     !== undefined ? preloaded.layers     : window.db.projectLayers.list(this.projectId),
        preloaded.mockups    !== undefined ? preloaded.mockups    : window.db.screenDesigns.list(this.projectId),
        preloaded.workflows  !== undefined ? preloaded.workflows  : window.db.workflows.list(this.projectId),
        preloaded.issueCount !== undefined ? preloaded.issueCount : window.db.issues.count(this.projectId),
      ]);

      this._setCount(container, 'psnDocCount',      documents?.length  ?? 0);
      this._setCount(container, 'psnLayerCount',    layers?.length     ?? 0);
      this._setCount(container, 'psnMockupCount',   mockups?.length    ?? 0);
      this._setCount(container, 'psnWorkflowCount', workflows?.length  ?? 0);

      const openIssues = (issueCount?.open ?? 0) + (issueCount?.in_progress ?? 0);
      this._setCount(container, 'psnIssueCount', openIssues);
    } catch {
      // counts are non-critical — fail silently
    }
  }

  _setCount(container, id, count) {
    const el = container.querySelector(`#${id}`);
    if (!el) return;
    if (count > 0) {
      el.textContent = count;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }
}
