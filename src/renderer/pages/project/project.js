import { FeatureList } from './components/feature-list/feature-list.js';
import { UserStoryList } from './components/user-story-list/user-story-list.js';
import { TerminalController } from './components/terminal/terminal-controller.js';
import { GitController } from './components/git/git-controller.js';
import { StatsModal } from './components/stats/stats-modal.js';
import { QuickCommandsModal } from './components/quick-commands/quick-commands-modal.js';
import { DocumentsModal } from './components/documents/documents-modal.js';
import { ModelConfigsModal } from './components/model-configs/model-configs-modal.js';
import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';

export class ProjectPage {
  constructor(container, params, router) {
    this.container = container;
    this.router    = router;
    this.projectId = params.projectId;
    this._project       = null;
    this._aiModelConfig = null;  // full model_configs row
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  async mount() {
    injectCss('pages/project/project.css');
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.dataset.theme = savedTheme;

    this._project = await window.db.projects.get(this.projectId);
    this.container.innerHTML = this._template();

    // Init controllers
    const initialCwd = await window.db.terminal.homedir();
    this._terminal = new TerminalController({ initialCwd });
    this._terminal.mount();

    this._git = new GitController({ getTermCwd: () => this._terminal.cwd });
    this._git.mount();

    this._terminal.setCommandDoneCallback(() => {
      if (this._terminal.folderSelected) this._git.refreshStatus();
    });

    this._statsModal = new StatsModal({ projectId: this.projectId });
    this._statsModal.mount();

    this._docsModal = new DocumentsModal({ projectId: this.projectId });
    this._docsModal.mount();

    this._qcmdModal = new QuickCommandsModal({
      onRunCommand: (cmd) => this._terminal.applyQuickCommand(cmd),
    });
    this._qcmdModal.mount();

    this._modelConfigsModal = new ModelConfigsModal({
      onConfigsChanged: () => this._reloadModelDropdown(),
    });
    this._modelConfigsModal.mount();

    await this._reloadModelDropdown();
    this._bindEvents();
    this._initResizable();
    this._initFeatureToggle();
    await this._mountComponents();
  }

  unmount() {
    removeCss('pages/project/project.css');
    this._terminal?.unmount();
    this._git?.stopPoll();
  }

  // ----------------------------------------------------------------
  // Template
  // ----------------------------------------------------------------
  _template() {
    const name = this._project ? escHtml(this._project.name) : 'Project';
    const desc = this._project ? escHtml(this._project.description || '') : '';

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
          <div class="project-page__model-group">
            <select class="project-page__model-select" id="aiModelSelect" title="AI Model">
              <option value="">Loading…</option>
            </select>
            <button class="project-page__model-cfg-btn" id="btnModelConfigs" title="Configure AI models">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <div class="project-page__header-actions">
            <button class="project-page__docs-btn" id="btnDocuments" title="Project documents">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M4 2h5l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"
                  stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                <path d="M9 2v3h3" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                <path d="M5.5 7.5h5M5.5 10h5M5.5 12.5h3"
                  stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              </svg>
              Documents
            </button>
            <button class="project-page__stats-btn" id="btnStatistics" title="View statistics">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="8" width="3" height="7" rx="1" stroke="currentColor" stroke-width="1.3"/>
                <rect x="6" y="4" width="3" height="11" rx="1" stroke="currentColor" stroke-width="1.3"/>
                <rect x="11" y="1" width="3" height="14" rx="1" stroke="currentColor" stroke-width="1.3"/>
              </svg>
              Statistics
            </button>
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
                <div class="project-panel__actions">
                  <button class="project-panel__add" id="btnAddFeature" aria-label="Add feature" title="Add feature">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                  </button>
                  <button class="project-panel__add project-panel__toggle" id="btnToggleFeatures" aria-label="Collapse features" title="Collapse features">
                    <svg class="toggle-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="project-panel__list" id="featureList"></div>
            </aside>

            <!-- resize handle -->
            <div class="project-panel__resize" data-resize="features"></div>

            <!-- 2. User Stories column -->
            <aside class="project-panel" id="panelStories">
              <div class="project-panel__header">
                <span class="project-panel__title">User Stories</span>
                <div class="project-panel__actions">
                  <button class="project-panel__add" id="btnImportStories" aria-label="Import user stories from JSON" title="Import from JSON">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M8 10V2M5 5l3-3 3 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                    </svg>
                  </button>
                  <button class="project-panel__add" id="btnAddStory" aria-label="Add user story" title="Add user story">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="project-panel__list" id="storyList"></div>
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
          <div class="project-console" id="projectConsole">
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
                <button class="project-console__folder" id="btnConsoleFolder" title="Select folder">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                    <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button class="project-console__git" id="btnConsoleGit" title="Git status / diff" hidden>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                    <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
                    <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
                    <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                  <span class="project-console__git-badge" id="gitBadge" hidden></span>
                </button>
                <div class="project-console__menu-wrap">
                  <button class="project-console__menu-btn" id="btnConsoleMenu" title="More options">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="3" r="1.2" fill="currentColor"/>
                      <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
                      <circle cx="8" cy="13" r="1.2" fill="currentColor"/>
                    </svg>
                  </button>
                  <div class="project-console__menu-dropdown" id="consoleMenuDropdown" hidden>
                    <button class="console-menu__item" id="menuQuickCommands">
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                        <path d="M5 2h7l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                        <path d="M12 2v4h4" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                        <path d="M7 9h6M7 12h6M7 15h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                      </svg>
                      Quick Commands
                    </button>
                    <button class="console-menu__item" id="menuClearConsole">
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                      </svg>
                      Clear Console
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="project-console__output" id="consoleOutput">
              <span class="project-console__hint">Select a folder or type a command to start…</span>
            </div>
            <div class="project-console__input-row">
              <span class="project-console__ps-label" id="consolePromptLabel">PS ~&gt;</span>
              <div class="project-console__input-cmd-row">
                <div class="project-console__input-wrap">
                  <textarea class="project-console__input" id="consoleInput" rows="1"
                    spellcheck="false" autocomplete="off" autocorrect="off"
                    placeholder="Enter command… (Shift+Enter for new line)"></textarea>
                  <button class="project-console__cmd-picker-btn" id="btnCmdPicker" title="Pick a saved command">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                      <path d="M11 10l2 2 2-2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <div class="project-console__cmd-dropdown" id="cmdPickerDropdown" hidden></div>
                </div>
                <button class="project-console__stop" id="btnConsoleStop" title="Stop running command" hidden>&#9632; Stop</button>
              </div>
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

    const consoleEl = document.getElementById('projectConsole');
    document.getElementById('btnConsoleToggle')
      .addEventListener('click', () => { consoleEl.hidden = !consoleEl.hidden; });

    document.getElementById('menuClearConsole')
      .addEventListener('click', () => {
        document.getElementById('consoleMenuDropdown').hidden = true;
        const out = document.getElementById('consoleOutput');
        out.innerHTML = '<span class="project-console__hint">Select a folder or type a command to start…</span>';
      });

    document.getElementById('btnConsoleFolder')
      .addEventListener('click', async () => {
        const folderPath = await window.db.dialog.openFolder();
        if (!folderPath) return;
        this._terminal.folderSelected = true;
        consoleEl.hidden = false;
        await this._terminal.runCommand(`cd "${folderPath}"`);
        document.getElementById('consoleInput').focus();
        await this._git.refreshStatus();
        this._git.startPoll();
      });

    document.getElementById('aiModelSelect')
      .addEventListener('change', (e) => {
        const id = Number(e.target.value);
        window.db.modelConfigs.get(id).then(cfg => { this._aiModelConfig = cfg; });
      });

    document.getElementById('btnModelConfigs')
      .addEventListener('click', () => this._modelConfigsModal.show());

    document.getElementById('btnStatistics')
      .addEventListener('click', () => this._statsModal.show());

    document.getElementById('btnDocuments')
      .addEventListener('click', () => this._docsModal.show());

    document.getElementById('btnConsoleMenu')
      .addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = document.getElementById('consoleMenuDropdown');
        if (dd) dd.hidden = !dd.hidden;
      });

    document.getElementById('menuQuickCommands')
      .addEventListener('click', () => {
        document.getElementById('consoleMenuDropdown').hidden = true;
        this._qcmdModal.show();
      });

    document.getElementById('btnCmdPicker')
      .addEventListener('click', (e) => { e.stopPropagation(); this._terminal.toggleCmdPickerDropdown(); });

    document.addEventListener('click', () => {
      const dd = document.getElementById('cmdPickerDropdown');
      if (dd) dd.hidden = true;
      const md = document.getElementById('consoleMenuDropdown');
      if (md) md.hidden = true;
    });

    document.getElementById('btnConsoleGit')
      .addEventListener('click', () => this._git.showDiffModal());

    const consoleInput = document.getElementById('consoleInput');
    const autoResize = (el) => {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 100) + 'px';
    };
    consoleInput.addEventListener('input', () => autoResize(consoleInput));
    consoleInput.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      const cmd = consoleInput.value.trim();
      if (!cmd) return;
      consoleInput.value = '';
      consoleInput.style.height = 'auto';
      await this._terminal.runCommand(cmd);
    });

    document.getElementById('btnConsoleStop')
      .addEventListener('click', () => window.db.terminal.killActive());
  }

  // ----------------------------------------------------------------
  // Components
  // ----------------------------------------------------------------
  async _mountComponents() {
    this._storyList = new UserStoryList({
      listEl:               document.getElementById('storyList'),
      addBtn:               document.getElementById('btnAddStory'),
      importBtn:            document.getElementById('btnImportStories'),
      detailEl:             document.getElementById('storyDetail'),
      projectId:            this.projectId,
      getModel:             () => this._aiModelConfig,
      onSelect:             (_story) => {},
      onRunCommand:         (cmd) => {
        document.getElementById('projectConsole').hidden = false;
        if (!this._terminal.folderSelected) { this._terminal.warnNoFolder(); return; }
        this._terminal.runCommand(cmd);
      },
      onRunCommandExternal: (cmd) => {
        if (!this._terminal.folderSelected) {
          document.getElementById('projectConsole').hidden = false;
          this._terminal.warnNoFolder();
          return;
        }
        window.db.terminal.openExternal({ command: cmd, cwd: this._terminal.cwd });
      },
      onPrintOutput: (text, opts) => {
        document.getElementById('projectConsole').hidden = false;
        this._terminal.printOutput(text, opts);
      },
    });
    await this._storyList.mount();

    this._featureList = new FeatureList({
      listEl:    document.getElementById('featureList'),
      addBtn:    document.getElementById('btnAddFeature'),
      projectId: this.projectId,
      onSelect:  (feature) => this._storyList.load(feature.id),
    });
    await this._featureList.mount();
  }

  // ----------------------------------------------------------------
  // Model dropdown helpers
  // ----------------------------------------------------------------
  async _reloadModelDropdown() {
    const select  = document.getElementById('aiModelSelect');
    if (!select) return;

    const configs = await window.db.modelConfigs.list();
    const prevId  = select.value ? Number(select.value) : null;

    select.innerHTML = configs.length === 0
      ? `<option value="">No models configured</option>`
      : configs.map(c =>
          `<option value="${c.id}">${escHtml(c.label)} [${c.type.toUpperCase()}]</option>`
        ).join('');

    // Restore previous selection, or pick default, or pick first
    const defaultCfg = configs.find(c => c.is_default) || configs[0];
    const target     = configs.find(c => c.id === prevId) || defaultCfg;
    if (target) {
      select.value        = target.id;
      this._aiModelConfig = target;
    }
  }

  // ----------------------------------------------------------------
  // Feature panel collapse/expand
  // ----------------------------------------------------------------
  _initFeatureToggle() {
    const panel        = document.getElementById('panelFeatures');
    const storiesPanel = document.getElementById('panelStories');
    const toggleBtn    = document.getElementById('btnToggleFeatures');
    const resizeHandle = panel.nextElementSibling;
    const icon         = toggleBtn.querySelector('.toggle-icon');

    let savedFlex        = panel.style.flex        || '0 0 18%';
    let savedStoriesFlex = storiesPanel.style.flex || '0 0 20%';

    toggleBtn.addEventListener('click', () => {
      const isCollapsed = panel.classList.toggle('project-panel--collapsed');

      if (isCollapsed) {
        savedFlex        = panel.style.flex        || '0 0 18%';
        savedStoriesFlex = storiesPanel.style.flex || '0 0 20%';
        panel.style.flex = '0 0 32px';
        const currentBasis = parseFloat(savedStoriesFlex.split(' ')[2]) || 20;
        storiesPanel.style.flex = `0 0 ${currentBasis * 1.5}%`;
        resizeHandle.style.display = 'none';
        toggleBtn.title = 'Expand features';
        toggleBtn.setAttribute('aria-label', 'Expand features');
        icon.innerHTML = '<path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
      } else {
        panel.style.flex        = savedFlex;
        storiesPanel.style.flex = savedStoriesFlex;
        resizeHandle.style.display = '';
        toggleBtn.title = 'Collapse features';
        toggleBtn.setAttribute('aria-label', 'Collapse features');
        icon.innerHTML = '<path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
      }
    });
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
        const parentWidth = entry.el.parentElement.getBoundingClientRect().width;

        document.body.style.userSelect = 'none';
        document.body.style.cursor     = 'col-resize';

        const onMove = (ev) => {
          const delta = (ev.clientX - startX) * entry.dir;
          const newPx = Math.max(entry.min, startWidth + delta);
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
