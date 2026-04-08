import { FeatureList } from './components/feature-list.js';

export class ProjectPage {
  constructor(container, params, router) {
    this.container = container;
    this.router    = router;
    this.projectId = params.projectId;
    this._project  = null;
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  async mount() {
    this._injectCss();
    this._project = await window.db.projects.get(this.projectId);
    this.container.innerHTML = this._template();
    this._bindEvents();
    await this._mountComponents();
  }

  unmount() {
    const link = document.getElementById('project-css');
    if (link) link.remove();
  }

  // ----------------------------------------------------------------
  // CSS injection
  // ----------------------------------------------------------------
  _injectCss() {
    if (!document.getElementById('project-css')) {
      const link = document.createElement('link');
      link.id   = 'project-css';
      link.rel  = 'stylesheet';
      link.href = 'pages/project/project.css';
      document.head.appendChild(link);
    }
  }

  // ----------------------------------------------------------------
  // Template
  // ----------------------------------------------------------------
  _template() {
    const name = this._project ? this._project.name : 'Project';
    const desc = this._project ? this._project.description : '';

    return `
      <div class="project-page">

        <!-- ── Top header bar ──────────────────────────────────────── -->
        <header class="project-page__header">
          <button class="project-page__back" id="btnBack" aria-label="Back to launcher">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="project-page__title-group">
            <h1 class="project-page__title">${name}</h1>
            ${desc ? `<p class="project-page__desc">${desc}</p>` : ''}
          </div>
          <div class="project-page__header-actions">
            <button class="project-page__console-toggle" id="btnConsoleToggle" aria-label="Toggle console" title="Toggle Console">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <rect x="2" y="4" width="16" height="12" rx="3" stroke="currentColor" stroke-width="1.6"/>
                <path d="M6 8l3 2-3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M11 12h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              </svg>
              Console
            </button>
          </div>
        </header>

        <!-- ── Body (columns + console) ────────────────────────────── -->
        <div class="project-page__body">

          <!-- ── Three-column workspace ───────────────────────────── -->
          <div class="project-page__workspace">

            <!-- 1. Features column -->
            <aside class="project-panel" id="panelFeatures">
              <div class="project-panel__header">
                <span class="project-panel__title">Features</span>
                <button class="project-panel__add" id="btnAddFeature" aria-label="Add feature" title="Add feature">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
              <div class="project-panel__list" id="featureList"></div>
            </aside>

            <!-- resize handle -->
            <div class="project-panel__resize" data-resize="features"></div>

            <!-- 2. User Stories column -->
            <aside class="project-panel" id="panelStories">
              <div class="project-panel__header">
                <span class="project-panel__title">User Stories</span>
                <button class="project-panel__add" aria-label="Add user story" title="Add user story">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
              <div class="project-panel__list" id="storyList">
                <div class="project-panel__empty">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <rect x="4" y="6" width="24" height="20" rx="4" stroke="#4b5563" stroke-width="1.4"/>
                    <path d="M9 13h14M9 18h10M9 23h6" stroke="#4b5563" stroke-width="1.4" stroke-linecap="round"/>
                  </svg>
                  <p>No user stories yet</p>
                </div>
              </div>
            </aside>

            <!-- resize handle -->
            <div class="project-panel__resize" data-resize="stories"></div>

            <!-- 3. User Story Detail column -->
            <section class="project-panel project-panel--detail" id="panelDetail">
              <div class="project-panel__header">
                <span class="project-panel__title">Story Detail</span>
              </div>
              <div class="project-panel__content" id="storyDetail">
                <div class="project-panel__empty">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="12" stroke="#4b5563" stroke-width="1.4"/>
                    <path d="M16 11v5l3 3" stroke="#4b5563" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <p>Select a user story</p>
                </div>
              </div>
            </section>

          </div><!-- /.project-page__workspace -->

          <!-- resize handle for console -->
          <div class="project-panel__resize" data-resize="console"></div>

          <!-- 4. Console (collapsible) -->
          <div class="project-console" id="projectConsole" hidden>
            <div class="project-console__titlebar">
              <div class="project-console__title">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="2" width="14" height="12" rx="3" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M4 6l3 2-3 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M9 10h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
                Console
              </div>
              <div class="project-console__actions">
                <button class="project-console__clear" id="btnConsoleClear" title="Clear console">Clear</button>
                <button class="project-console__close" id="btnConsoleClose" aria-label="Close console">&times;</button>
              </div>
            </div>
            <div class="project-console__output" id="consoleOutput">
              <span class="project-console__hint">Console output will appear here…</span>
            </div>
          </div><!-- /.project-console -->

        </div><!-- /.project-page__body -->
      </div><!-- /.project-page -->
    `;
  }

  // ----------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------
  _bindEvents() {
    document.getElementById('btnBack')
      .addEventListener('click', () => this.router.navigate('launcher'));

    const console_ = document.getElementById('projectConsole');
    document.getElementById('btnConsoleToggle')
      .addEventListener('click', () => { console_.hidden = !console_.hidden; });
    document.getElementById('btnConsoleClose')
      .addEventListener('click', () => { console_.hidden = true; });
    document.getElementById('btnConsoleClear')
      .addEventListener('click', () => {
        const out = document.getElementById('consoleOutput');
        out.innerHTML = '<span class="project-console__hint">Console output will appear here…</span>';
      });

    this._initResizable();
  }

  // ----------------------------------------------------------------
  // Components
  // ----------------------------------------------------------------
  async _mountComponents() {
    this._featureList = new FeatureList({
      listEl:    document.getElementById('featureList'),
      addBtn:    document.getElementById('btnAddFeature'),
      projectId: this.projectId,
      onSelect:  (feature) => {
        // TODO: load user stories for selected feature
        console.log('Feature selected:', feature);
      },
    });
    await this._featureList.mount();
  }

  // ----------------------------------------------------------------
  // Resizable panels
  // ----------------------------------------------------------------
  _initResizable() {
    const PANEL_MAP = {
      features: { el: document.getElementById('panelFeatures'),  min: 120, dir:  1 },
      stories:  { el: document.getElementById('panelStories'),   min: 120, dir:  1 },
      console:  { el: document.getElementById('projectConsole'), min: 180, dir: -1 },
    };

    document.querySelectorAll('.project-panel__resize').forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        const entry = PANEL_MAP[handle.dataset.resize];
        if (!entry) return;

        e.preventDefault();
        const startX      = e.clientX;
        const startWidth  = entry.el.getBoundingClientRect().width;
        // Capture parent width once at drag-start so the % reference is stable
        const parentWidth = entry.el.parentElement.getBoundingClientRect().width;

        document.body.style.userSelect = 'none';
        document.body.style.cursor     = 'col-resize';

        const onMove = (ev) => {
          const delta    = (ev.clientX - startX) * entry.dir;
          const newPx    = Math.max(entry.min, startWidth + delta);
          // Store as % of parent so the ratio is maintained on window resize
          entry.el.style.flex = `0 0 ${(newPx / parentWidth) * 100}%`;
        };

        const onUp = () => {
          document.body.style.userSelect = '';
          document.body.style.cursor     = '';
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup',   onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
      });
    });
  }
}
