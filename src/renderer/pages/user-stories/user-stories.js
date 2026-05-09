import { FeatureList } from '../../components/feature-list/feature-list.js';
import { UserStoryList } from '../../components/user-story-list/user-story-list.js';
import { GitController } from '../../components/git/git-controller.js';
import { QuickCommandsModal } from '../../components/quick-commands/quick-commands-modal.js';
import { ModelConfigsModal } from '../../components/model-configs/model-configs-modal.js';
import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';

const IS_STATUS = {
  open:        { label: 'Open',        cls: 'rs-badge--open'        },
  in_progress: { label: 'In Progress', cls: 'rs-badge--in-progress' },
  resolved:    { label: 'Resolved',    cls: 'rs-badge--resolved'    },
  closed:      { label: 'Closed',      cls: 'rs-badge--closed'      },
  wont_fix:    { label: "Won't Fix",   cls: 'rs-badge--wont-fix'    },
};

const IS_SEVERITY = {
  critical: { label: 'Critical', cls: 'rs-severity--critical' },
  high:     { label: 'High',     cls: 'rs-severity--high'     },
  medium:   { label: 'Medium',   cls: 'rs-severity--medium'   },
  low:      { label: 'Low',      cls: 'rs-severity--low'      },
};

export class ProjectPage {
  constructor(container, params, router) {
    this.container = container;
    this.router    = router;
    this.projectId = params.projectId;
    this._project       = null;
    this._aiModelConfig = null;
    this._activeStoryId = null;
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  async mount() {
    injectCss('pages/user-stories/user-stories.css');
    applyStoredTheme();

    this._project = await window.db.projects.get(this.projectId);
    this.container.innerHTML = this._template();

    this._git = new GitController({ getTermCwd: () => this._project?.project_path || '' });
    this._git.mount();

    if (this._project?.project_path) {
      this._git.refreshStatus();
      this._git.startPoll();
      this._setHeaderFolderPath(this._project.project_path);
    }

    this._qcmdModal = new QuickCommandsModal({ onRunCommand: () => {} });
    this._qcmdModal.mount();

    this._modelConfigsModal = new ModelConfigsModal({
      onConfigsChanged: () => this._reloadModelDropdown(),
    });
    this._modelConfigsModal.mount();

    await this._reloadModelDropdown();
    this._bindEvents();
    this._initResizable();
    this._initFeatureToggle();
    this._initRelatedToggle();
    await this._mountComponents();
  }

  unmount() {
    removeCss('pages/user-stories/user-stories.css');
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
            <p class="project-page__desc">User Stories</p>
          </div>
          <div class="project-page__folder-display" id="headerFolderDisplay" title="Select folder">
            <div class="project-page__folder-pill">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                  stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              </svg>
              <span class="project-page__folder-text" id="headerFolderText">Select folder</span>
            </div>
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
          <button class="project-page__git-btn" id="btnConsoleGit" title="Git changes" hidden style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
              <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span class="project-page__git-badge" id="gitBadge" hidden></span>
          </button>
          <button class="project-page__qcmd-btn" id="btnExportProject" title="Export all features &amp; stories" style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
            </svg>
          </button>
          <button class="project-page__qcmd-btn" id="btnHeaderQcmd" title="Quick Commands" style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="4" cy="6"  r="1.5" fill="currentColor"/>
              <circle cx="4" cy="10" r="1.5" fill="currentColor"/>
              <circle cx="4" cy="14" r="1.5" fill="currentColor"/>
              <path d="M8 6h8M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </header>

        <!-- ── Body (columns + related panel) ──────────────────────── -->
        <div class="project-page__body">

          <!-- ── Three-column workspace ───────────────────────────── -->
          <div class="project-page__workspace">

            <!-- 1. Features column -->
            <aside class="project-panel" id="panelFeatures">
              <div class="project-panel__header">
                <span class="project-panel__title">Features</span>
                <div class="project-panel__actions">
                  <button class="project-panel__add" id="btnImportFeature" aria-label="Import feature from JSON" title="Import from JSON">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M8 10V2M5 5l3-3 3 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                    </svg>
                  </button>
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
                  <button class="project-panel__add" id="btnImportStory" aria-label="Import user story from JSON" title="Import from JSON">
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
                <div class="project-panel__header-actions" id="storyDetailHeaderActions"></div>
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

          <!-- resize handle for related panel -->
          <div class="project-panel__resize" data-resize="related"></div>

          <!-- 4. Related panel (test cases top, issues bottom) -->
          <div class="project-related" id="projectRelated">
            <div class="project-related__titlebar">
              <div class="project-related__title">
                <button class="project-related__collapse-btn" id="btnRelatedToggle"
                  aria-label="Collapse panel" title="Collapse panel">
                  <svg class="related-toggle-icon" width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M6.5 8a2.5 2.5 0 0 1 2.5-2.5H12A2.5 2.5 0 1 1 12 11H9A2.5 2.5 0 0 1 6.5 8z" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M9.5 8a2.5 2.5 0 0 1-2.5 2.5H4A2.5 2.5 0 1 1 4 5h3A2.5 2.5 0 0 1 9.5 8z" stroke="currentColor" stroke-width="1.4"/>
                </svg>
                <span class="project-related__title-text">Related</span>
              </div>
            </div>

            <!-- Issues -->
            <div class="project-related__section" id="relatedIssuesSection">
              <div class="project-related__section-hd">
                <span class="project-related__section-label">Issues</span>
                <span class="project-related__section-count" id="relatedIssuesCount" hidden></span>
              </div>
              <div class="project-related__section-body" id="relatedIssuesList">
                <div class="project-related__empty">Select a story</div>
              </div>
            </div>
          </div><!-- /.project-related -->

        </div><!-- /.project-page__body -->
      </div><!-- /.project-page -->
    `;
  }

  // ----------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------
  _bindEvents() {
    document.getElementById('btnBack')
      .addEventListener('click', () => this.router.navigate('project-home', { projectId: this.projectId }));

    document.getElementById('headerFolderDisplay')
      .addEventListener('click', async () => {
        const folderPath = await window.db.dialog.openFolder();
        if (!folderPath) return;
        await window.db.projects.setPath({ id: this.projectId, project_path: folderPath });
        if (this._project) this._project.project_path = folderPath;
        this._git.refreshStatus();
        this._git.startPoll();
        this._setHeaderFolderPath(folderPath);
      });

    document.getElementById('aiModelSelect')
      .addEventListener('change', (e) => {
        const id = Number(e.target.value);
        localStorage.setItem('devflow-selected-model', id);
        window.db.modelConfigs.get(id).then(cfg => { this._aiModelConfig = cfg; });
      });

    document.getElementById('btnModelConfigs')
      .addEventListener('click', () => this._modelConfigsModal.show());

    document.getElementById('btnExportProject')
      .addEventListener('click', () => this._exportProject());

    document.getElementById('btnHeaderQcmd')
      .addEventListener('click', () => this._qcmdModal.show());

    document.getElementById('btnConsoleGit')
      .addEventListener('click', () =>
        this.router.navigate('git-changes', { projectId: this.projectId, from: 'user-stories' }));
  }

  // ----------------------------------------------------------------
  // Components
  // ----------------------------------------------------------------
  async _mountComponents() {
    this._storyList = new UserStoryList({
      listEl:               document.getElementById('storyList'),
      addBtn:               document.getElementById('btnAddStory'),
      importBtn:            document.getElementById('btnImportStory'),
      detailEl:             document.getElementById('storyDetail'),
      projectId:            this.projectId,
      getModel:             () => this._aiModelConfig,
      onSelect:             (story) => { this._refreshRelated(story?.id || null); },
      onExport:             (story) => this._exportStory(story),
      onRunCommand:         (cmd) => {
        if (!this._project?.project_path) return;
        window.db.terminal.openExternal({ command: cmd, cwd: this._project.project_path });
      },
      onRunCommandExternal: (cmd) => {
        if (!this._project?.project_path) return;
        window.db.terminal.openExternal({ command: cmd, cwd: this._project.project_path });
      },
      onPrintOutput: () => {},
    });
    await this._storyList.mount();

    this._featureList = new FeatureList({
      listEl:    document.getElementById('featureList'),
      addBtn:    document.getElementById('btnAddFeature'),
      importBtn: document.getElementById('btnImportFeature'),
      projectId: this.projectId,
      onSelect:  (feature) => this._storyList.load(feature.id),
      onExport:  (feature) => this._exportFeature(feature),
    });
    await this._featureList.mount();
  }

  // ----------------------------------------------------------------
  // Related panel — data loading
  // ----------------------------------------------------------------
  async _refreshRelated(storyId) {
    this._activeStoryId = storyId || null;

    const issuesEl      = document.getElementById('relatedIssuesList');
    const issuesCountEl = document.getElementById('relatedIssuesCount');
    if (!issuesEl) return;

    if (!storyId) {
      issuesEl.innerHTML   = '<div class="project-related__empty">Select a story</div>';
      issuesCountEl.hidden = true;
      return;
    }

    const issues = await window.db.issues.list({ project_id: this.projectId, user_story_id: storyId });

    this._renderRelatedIssues(issues);

    issuesCountEl.textContent = issues.length;
    issuesCountEl.hidden      = issues.length === 0;
  }

  _renderRelatedIssues(items) {
    const el = document.getElementById('relatedIssuesList');
    if (!el) return;

    if (items.length === 0) {
      el.innerHTML = '<div class="project-related__empty">No issues for this story</div>';
      return;
    }

    el.innerHTML = items.map((issue, i) => {
      const sm = IS_STATUS[issue.status]     || IS_STATUS.open;
      const sv = IS_SEVERITY[issue.severity] || IS_SEVERITY.medium;
      return `
        <div class="related-item" data-id="${issue.id}"
          data-story="${issue.user_story_id}" data-feature="${issue.feature_id || ''}">
          <div class="related-item__header">
            <span class="related-item__seq">#${i + 1}</span>
            <span class="related-item__title">${escHtml(issue.title)}</span>
          </div>
          <div class="related-item__footer">
            <span class="rs-badge ${sm.cls}">${sm.label}</span>
            <span class="rs-badge ${sv.cls}">${sv.label}</span>
          </div>
        </div>`;
    }).join('');

    el.querySelectorAll('.related-item').forEach(item => {
      item.addEventListener('click', () => {
        this.router.navigate('issues', {
          projectId: this.projectId,
          featureId: parseInt(item.dataset.feature) || undefined,
          storyId:   parseInt(item.dataset.story),
          itemId:    parseInt(item.dataset.id),
        });
      });
    });
  }

  // ----------------------------------------------------------------
  // Related panel — collapse/expand
  // ----------------------------------------------------------------
  _initRelatedToggle() {
    const panel        = document.getElementById('projectRelated');
    const resizeHandle = document.querySelector('.project-panel__resize[data-resize="related"]');
    const toggleBtn    = document.getElementById('btnRelatedToggle');
    const icon         = toggleBtn.querySelector('.related-toggle-icon');

    let savedFlex = panel.style.flex || '0 0 22%';

    toggleBtn.addEventListener('click', () => {
      const isCollapsed = panel.classList.toggle('project-related--collapsed');

      if (isCollapsed) {
        savedFlex = panel.style.flex || '0 0 22%';
        resizeHandle.style.display = 'none';
        toggleBtn.title = 'Expand panel';
        toggleBtn.setAttribute('aria-label', 'Expand panel');
        icon.innerHTML = '<path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
      } else {
        panel.style.flex = savedFlex;
        resizeHandle.style.display = '';
        toggleBtn.title = 'Collapse panel';
        toggleBtn.setAttribute('aria-label', 'Collapse panel');
        icon.innerHTML = '<path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
      }
    });
  }

  // ----------------------------------------------------------------
  // Header folder path display
  // ----------------------------------------------------------------
  _setHeaderFolderPath(folderPath) {
    const text    = document.getElementById('headerFolderText');
    const display = document.getElementById('headerFolderDisplay');
    if (!text || !display) return;
    text.textContent = folderPath;
    display.classList.add('project-page__folder-display--active');
  }

  // ----------------------------------------------------------------
  // Model dropdown helpers
  // ----------------------------------------------------------------
  async _reloadModelDropdown() {
    const select = document.getElementById('aiModelSelect');
    if (!select) return;

    const configs = await window.db.modelConfigs.list();
    const storedId   = Number(localStorage.getItem('devflow-selected-model')) || null;
    const prevId     = storedId || (select.value ? Number(select.value) : null);

    select.innerHTML = configs.length === 0
      ? `<option value="">No models configured</option>`
      : configs.map(c =>
          `<option value="${c.id}">${escHtml(c.label)} [${c.type.toUpperCase()}]</option>`
        ).join('');

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
  // Export helpers
  // ----------------------------------------------------------------
  async _buildStoryExport(s) {
    const prompts = await window.db.prompts.list(s.id);
    return {
      title: s.title,
      description: s.description || null,
      acceptance_criteria: s.acceptance_criteria || null,
      status: s.status_name || null,
      prompts: prompts.map(p => ({
        tag: p.tag || null,
        prompt: p.prompt || null,
        is_executed: !!p.is_executed,
      })),
    };
  }

  async _exportProject() {
    const features = await window.db.features.list(this.projectId);
    const result = [];
    for (const f of features) {
      const stories = await window.db.userStories.list({ feature_id: f.id });
      const storyExports = [];
      for (const s of stories) {
        storyExports.push(await this._buildStoryExport(s));
      }
      result.push({
        feature: f.name,
        description: f.description || null,
        status: f.status_name || null,
        user_stories: storyExports,
      });
    }
    const projectName = this._project?.name || 'project';
    const res = await window.db.dialog.saveJsonFile({
      data: result,
      filename: `${projectName}-all-stories`,
    });
    if (res?.success) this._showExportToast('Project exported successfully.');
  }

  async _exportFeature(feature) {
    const stories = await window.db.userStories.list({ feature_id: feature.id });
    const storyExports = [];
    for (const s of stories) {
      storyExports.push(await this._buildStoryExport(s));
    }
    const result = {
      feature: feature.name,
      description: feature.description || null,
      status: feature.status_name || null,
      user_stories: storyExports,
    };
    const res = await window.db.dialog.saveJsonFile({
      data: result,
      filename: `feature-${feature.name}`,
    });
    if (res?.success) this._showExportToast('Feature exported successfully.');
  }

  async _exportStory(story) {
    const result = await this._buildStoryExport(story);
    const res = await window.db.dialog.saveJsonFile({
      data: result,
      filename: `story-${story.title}`,
    });
    if (res?.success) this._showExportToast('User story exported successfully.');
  }

  _showExportToast(message) {
    document.querySelector('.usl-import-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'usl-import-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('usl-import-toast--visible'));
    setTimeout(() => {
      toast.classList.remove('usl-import-toast--visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ----------------------------------------------------------------
  // Resizable panels
  // ----------------------------------------------------------------
  _initResizable() {
    const PANEL_MAP = {
      features: { el: document.getElementById('panelFeatures'),  min: 120, dir:  1 },
      stories:  { el: document.getElementById('panelStories'),   min: 120, dir:  1 },
      related:  { el: document.getElementById('projectRelated'), min: 160, dir: -1 },
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
