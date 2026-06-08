import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelPicker } from '../../components/model-picker/model-picker.js';
import { GitController } from '../../components/git/git-controller.js';

const FILE_EXTENSIONS = {
  flutter: ['.dart'],
  python:  ['.py'],
  dotnet:  ['.cs'],
  java:    ['.java', '.kt'],
  go:      ['.go'],
  ruby:    ['.rb'],
  default: ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'],
};

// Specific framework/platform names that confirm a layer has a UI component
const UI_FRAMEWORKS = [
  // JS frameworks
  'react', 'angular', 'angularjs', 'vue', 'vuejs', 'svelte', 'preact', 'solidjs',
  'nextjs', 'next.js', 'nuxt', 'gatsby', 'remix', 'ember', 'backbone',
  // .NET web
  'asp.net', 'aspnet', 'blazor', 'razor', 'signalr',
  // Java/Kotlin web
  'spring mvc', 'thymeleaf', 'vaadin', 'jsf',
  // Mobile
  'flutter', 'react native', 'xamarin', 'ionic', 'capacitor',
  'swiftui', 'uikit', 'jetpack compose',
  // Desktop UI
  'electron', 'tauri',
  // CSS frameworks (strong UI indicator)
  'tailwind', 'bootstrap', 'material-ui', 'chakra-ui', 'shadcn',
  // Explicit labels
  'frontend', 'front-end', 'front end',
  // Mobile platforms
  'ios', 'android', 'swift',
];


function inferExtensions(setupInstructions) {
  const s = (setupInstructions || '').toLowerCase();
  if (s.includes('flutter') || s.includes('dart'))                          return FILE_EXTENSIONS.flutter;
  if (s.includes('python') || s.includes('pytest') || s.includes('pip'))    return FILE_EXTENSIONS.python;
  if (s.includes('.net') || s.includes('c#') || s.includes('dotnet'))       return FILE_EXTENSIONS.dotnet;
  if ((s.includes('java') || s.includes('kotlin')) && !s.includes('javascript') && !s.includes('typescript')) return FILE_EXTENSIONS.java;
  if (s.includes('golang') || /\bgo\b/.test(s))                             return FILE_EXTENSIONS.go;
  if (s.includes('ruby') || s.includes('rspec') || s.includes('rails'))     return FILE_EXTENSIONS.ruby;
  return FILE_EXTENSIONS.default;
}

function inferDefaultTestFolder(layer) {
  const s = (layer.setup_instructions || '').toLowerCase();
  const isNonJs = s.includes('.net') || s.includes('c#') || s.includes('dotnet')
    || (s.includes('java') && !s.includes('javascript'))
    || (s.includes('kotlin'))
    || s.includes('python') || s.includes('flutter') || s.includes('ruby') || s.includes('golang');
  if (!isNonJs && layer.folder_path) return layer.folder_path + '/__tests__';
  return '';
}


function buildFileTree(files) {
  const root = { name: '', path: '', type: 'dir', children: {} };
  for (const filePath of files) {
    const parts = filePath.replace(/\\/g, '/').split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const name   = parts[i];
      const path   = parts.slice(0, i + 1).join('/');
      const isFile = i === parts.length - 1;
      if (!node.children[name]) {
        node.children[name] = isFile
          ? { name, path, type: 'file',  children: null }
          : { name, path, type: 'dir',   children: {} };
      }
      node = node.children[name];
    }
  }
  return root;
}

export class TestGeneratorPage {
  constructor(container, params, router) {
    this.container    = container;
    this.router       = router;
    this._projectId   = params.projectId;
    this._project     = null;
    this._layers      = [];
    this._activeLayer = null;
    this._isUiLayer   = false;
    this._modelCfg    = null;
    this._picker      = null;
    this._e2eEnabled  = false;
    this._activeTab   = 'unit';   // 'unit' | 'e2e'

    // Unit test state
    this._unitFiles      = [];
    this._unitSelected   = new Set();
    this._expandedDirs   = new Set();
    this._unitTestFolder = '';

    // E2E test state
    this._mockups     = [];
    this._e2eSelected = new Set();
    this._e2eFlowDesc = '';
  }

  async mount() {
    injectCss('pages/project-home/project-home.css');
    injectCss('pages/test-generator/test-generator-page.css');
    applyStoredTheme();

    const [project, layers, _mapping] = await Promise.all([
      window.db.projects.get(this._projectId),
      window.db.projectLayers.list(this._projectId),
      window.db.modelMapping.get('test-generator'),
    ]);
    this._project = project;
    this._layers  = layers ?? [];

    this.container.innerHTML = this._template();

    this._picker = new ModelPicker({
      anchor:    this.container.querySelector('#tgModelPicker'),
      onSelect:  model => { this._modelCfg = model; this._syncGenerateBtns(); },
      initialId: _mapping?.model_config_id ?? null,
    });
    await this._picker.reload();

    this._git = new GitController({
      getTermCwd:           () => this._project?.project_path || '',
      getLayers:            () => this._layers,
      gitBtnId:             'tgBtnGit',
      gitBadgeId:           'tgGitBadge',
      controlBtnVisibility: false,
    });
    this._git.mount();

    if (this._project?.project_path) {
      this._git.refreshStatus();
      this._git.startPoll();
    }

    this._bindEvents();

    const firstLayer = this._layers.find(l => l.folder_path);
    if (firstLayer) this._selectLayer(firstLayer);
  }

  unmount() {
    this._git?.stopPoll();
    removeCss('pages/project-home/project-home.css');
    removeCss('pages/test-generator/test-generator-page.css');
    this._picker?.unmount();
  }

  // ─── Template ────────────────────────────────────────────────
  _template() {
    const name = this._project?.name ?? 'Project';
    return `
      <div class="project-home">
        <header class="project-home__header">
          <button class="project-home__back" id="tgBtnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div class="tg-title-group">
            <h1 class="tg-title">${escHtml(name)}</h1>
            <p class="tg-subtitle">Test Generator</p>
          </div>
          <div id="tgModelPicker" style="-webkit-app-region:no-drag;"></div>
          <button class="project-page__git-btn" id="tgBtnGit" title="Git changes" style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
              <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span class="project-page__git-badge project-page__git-badge--dot" id="tgGitBadge" hidden></span>
          </button>
        </header>

        <div class="tg-body">
          <aside class="tg-sidebar" id="tgSidebar">
            ${this._sidebarHtml()}
          </aside>
          <div class="tg-main" id="tgMain">
            ${this._mainHtml()}
          </div>
        </div>
      </div>`;
  }

  _sidebarHtml() {
    if (!this._layers.length) {
      return `<div class="tg-sidebar-empty">No layers configured.<br>Add layers in Project Layers.</div>`;
    }
    return this._layers.map(l => {
      const active   = this._activeLayer?.id === l.id ? 'tg-layer-item--active' : '';
      const disabled = !l.folder_path ? 'tg-layer-item--disabled' : '';
      const path     = l.folder_path
        ? `<span class="tg-layer-item__path">${escHtml(l.folder_path)}</span>`
        : `<span class="tg-layer-item__path tg-layer-item__path--empty">No folder set</span>`;
      return `
        <div class="tg-layer-item ${active} ${disabled}" data-layer-id="${l.id}">
          <span class="tg-layer-item__name">${escHtml(l.name)}</span>
          ${path}
        </div>`;
    }).join('');
  }

  _rerenderSidebar() {
    const sidebar = this.container.querySelector('#tgSidebar');
    if (sidebar) sidebar.innerHTML = this._sidebarHtml();
  }

  _mainHtml() {
    if (!this._activeLayer) {
      return `
        <div class="tg-empty-state">
          <span class="tg-empty-state__icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity=".4">
              <path d="M9 3h6M9 3v9l-4 6h14l-4-6V3"/>
            </svg>
          </span>
          <span>Select a layer from the left panel to begin generating tests.</span>
        </div>`;
    }

    const unitActive = this._activeTab === 'unit';
    return `
      <div class="tg-tabs">
        <button class="tg-tab ${unitActive ? 'tg-tab--active' : ''}" data-tab="unit">Unit Tests</button>
        <button class="tg-tab ${!unitActive ? 'tg-tab--active' : ''}" data-tab="e2e">E2E Tests</button>
      </div>
      <div id="tgTabContent">
        ${unitActive ? this._unitSectionHtml() : this._e2eSectionHtml()}
      </div>
    `;
  }

  _unitSectionHtml() {
    const l             = this._activeLayer;
    const fileListContent = this._unitFilesListHtml();
    const selectedCount   = this._unitSelected.size;
    const totalCount      = this._unitFiles.length;
    const canGenerate     = selectedCount > 0 && !!this._modelCfg;
    const folderHintClass = this._unitTestFolder ? 'tg-folder-hint' : 'tg-folder-hint tg-folder-hint--warn';
    const folderHintText  = this._unitTestFolder ? '' : 'No test folder set — click Browse or type a path.';

    return `
      <div class="tg-section" id="tgUnitSection">

        <p class="tg-sub-label">Source Files</p>
        <div class="tg-file-picker-wrap">
          <div class="tg-file-picker-toolbar">
            <button class="tg-btn tg-btn--sm" id="tgUnitSelectAll">Select All</button>
            <button class="tg-btn tg-btn--sm" id="tgUnitClear">Clear</button>
            <span class="tg-file-count" id="tgUnitFileCount">${selectedCount} / ${totalCount} selected</span>
          </div>
          <div class="tg-file-list" id="tgUnitFileList">${fileListContent}</div>
        </div>

        <p class="tg-sub-label">Test Output Folder</p>
        <div class="tg-folder-row">
          <input class="tg-filename-input tg-folder-input" id="tgUnitTestFolder"
                 value="${escHtml(this._unitTestFolder)}"
                 placeholder="Browse or type an absolute folder path…" spellcheck="false"/>
          <button class="tg-btn tg-btn--sm" id="tgBrowseTestFolder">Browse…</button>
        </div>
        <p class="${folderHintClass}" id="tgFolderHint">${folderHintText}</p>

        <div class="tg-generate-bar">
          <button class="tg-btn tg-btn--primary" id="tgUnitGenerate" ${canGenerate ? '' : 'disabled'}
            title="${!this._modelCfg ? 'Select a model first' : selectedCount === 0 ? 'Select at least one file' : ''}">
            Generate &amp; Save Tests
          </button>
        </div>
      </div>`;
  }

  _e2eSectionHtml() {
    const autoDetected = this._isUiLayer;

    // ── Disabled state ─────────────────────────────────────────
    if (!this._e2eEnabled) {
      return `
        <div class="tg-section tg-section--e2e" id="tgE2eSection">
          <div class="tg-section__header">
            <button class="tg-btn tg-btn--sm tg-btn--primary" id="tgE2eToggle">Enable E2E Tests</button>
          </div>
          <div class="tg-e2e-disabled">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".35">
              <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <p class="tg-e2e-disabled__text">
              E2E tests are for layers with a user interface.
            </p>
            <p class="tg-e2e-disabled__hint">
              Frameworks: React, Angular, Vue, ASP.NET, Blazor, Flutter, SwiftUI, Electron…
            </p>
          </div>
        </div>`;
    }

    // ── Enabled state ───────────────────────────────────────────
    const canGenerate = this._e2eSelected.size > 0 && !!this._modelCfg;

    const mockupsHtml = this._mockups.length
      ? this._mockups.map(m => `
          <label class="tg-mockup-item">
            <input type="checkbox" data-mockup-id="${m.id}" ${this._e2eSelected.has(m.id) ? 'checked' : ''}/>
            ${escHtml(m.title || `Mockup ${m.id}`)}
          </label>`).join('')
      : `<div class="tg-mockup-list--empty">No mockups found — create mockups in the Mockups page first.</div>`;

    return `
      <div class="tg-section tg-section--e2e" id="tgE2eSection">
        <div class="tg-section__header">
          ${autoDetected ? '<span class="tg-section__badge">UI Layer</span>' : ''}
          <button class="tg-btn tg-btn--sm tg-e2e-disable-btn" id="tgE2eToggle" title="Disable E2E tests for this layer">Disable</button>
        </div>

        <p class="tg-sub-label">Select Mockups</p>
        <div class="tg-mockup-list" id="tgMockupList">${mockupsHtml}</div>

        <label class="tg-flow-label">User Flow Description <span style="font-weight:400;opacity:.6">(optional)</span></label>
        <textarea class="tg-flow-textarea" id="tgFlowDesc" placeholder="Describe the user flows to test, e.g. 'User logs in, navigates to dashboard, creates a new item…'">${escHtml(this._e2eFlowDesc)}</textarea>

        <div class="tg-generate-bar">
          <button class="tg-btn tg-btn--primary" id="tgE2eGenerate" ${canGenerate ? '' : 'disabled'}
            title="${!this._modelCfg ? 'Select a model first' : this._e2eSelected.size === 0 ? 'Select at least one mockup' : ''}">
            Generate E2E Tests
          </button>
        </div>
      </div>`;
  }

  _unitFilesListHtml() {
    if (this._unitFiles === null)      return `<div class="tg-file-list--error">Folder not accessible.</div>`;
    if (this._unitFiles === 'loading') return `<div class="tg-file-list--loading">Loading files…</div>`;
    if (!this._unitFiles.length)       return `<div class="tg-file-list--empty">No source files found in this folder.</div>`;

    const capped = this._unitFiles.slice(0, 200);
    const tree   = buildFileTree(capped);
    const html   = this._renderTreeChildren(tree.children, 0);
    const extra  = this._unitFiles.length - capped.length;
    const notice = extra > 0
      ? `<div class="tg-file-list--notice">Showing first 200 files. Narrow the layer's folder to reduce results.</div>`
      : '';
    return `<div class="tg-tree">${html}</div>${notice}`;
  }

  _renderTreeChildren(children, depth) {
    return Object.values(children)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map(n => this._renderTreeNode(n, depth))
      .join('');
  }

  _renderTreeNode(node, depth) {
    const base = 8 + depth * 16;

    if (node.type === 'file') {
      const checked = this._unitSelected.has(node.path);
      return `
        <label class="tg-tree-row tg-tree-row--file" style="padding-left:${base + 18}px">
          <input type="checkbox" data-file="${escHtml(node.path)}" ${checked ? 'checked' : ''}/>
          <svg class="tg-tree-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          <span class="tg-tree-name">${escHtml(node.name)}</span>
        </label>`;
    }

    const descFiles = this._getFilesUnderPath(node.path);
    const selCount  = descFiles.filter(f => this._unitSelected.has(f)).length;
    const allSel    = descFiles.length > 0 && selCount === descFiles.length;
    const someSel   = selCount > 0 && selCount < descFiles.length;
    const open      = this._expandedDirs.has(node.path);

    return `
      <div class="tg-tree-dir" data-dir-path="${escHtml(node.path)}">
        <div class="tg-tree-row tg-tree-row--dir" style="padding-left:${base}px">
          <span class="tg-tree-arrow ${open ? 'tg-tree-arrow--open' : ''}">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l8 7-8 7z"/></svg>
          </span>
          <input type="checkbox" data-folder="${escHtml(node.path)}"
                 ${allSel ? 'checked' : ''} ${someSel ? 'data-indeterminate' : ''}/>
          <svg class="tg-tree-icon tg-tree-icon--dir" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="tg-tree-name">${escHtml(node.name)}</span>
          <span class="tg-tree-badge">${descFiles.length}</span>
        </div>
        <div class="tg-tree-children ${open ? '' : 'tg-tree-children--collapsed'}">
          ${this._renderTreeChildren(node.children, depth + 1)}
        </div>
      </div>`;
  }

  _getFilesUnderPath(folderPath) {
    if (!Array.isArray(this._unitFiles)) return [];
    const prefix = folderPath + '/';
    return this._unitFiles.filter(f => f.startsWith(prefix));
  }

  _applyIndeterminateStates() {
    const list = this.container.querySelector('#tgUnitFileList');
    if (!list) return;
    list.querySelectorAll('input[data-indeterminate]').forEach(cb => {
      cb.indeterminate = true;
    });
  }

  _updateAncestorFolderCheckboxes(changedPath) {
    const list = this.container.querySelector('#tgUnitFileList');
    if (!list) return;
    const parts = changedPath.split('/');
    for (let i = 1; i < parts.length; i++) {
      const fp    = parts.slice(0, i).join('/');
      const cb    = list.querySelector(`input[data-folder="${CSS.escape(fp)}"]`);
      if (!cb) continue;
      const files = this._getFilesUnderPath(fp);
      const sel   = files.filter(f => this._unitSelected.has(f)).length;
      cb.checked       = files.length > 0 && sel === files.length;
      cb.indeterminate = sel > 0 && sel < files.length;
    }
  }

  _updateSubtreeCheckboxes(folderPath, checked) {
    const list = this.container.querySelector('#tgUnitFileList');
    if (!list) return;
    const prefix = folderPath + '/';
    this._unitFiles.filter(f => f.startsWith(prefix)).forEach(f => {
      const cb = list.querySelector(`input[data-file="${CSS.escape(f)}"]`);
      if (cb) cb.checked = checked;
    });
    list.querySelectorAll('input[data-folder]').forEach(cb => {
      if (cb.dataset.folder.startsWith(prefix)) {
        cb.checked = checked;
        cb.indeterminate = false;
      }
    });
  }

  // ─── Events ──────────────────────────────────────────────────
  _bindEvents() {
    this.container.querySelector('#tgBtnBack')
      .addEventListener('click', () => this.router.navigate('project-home', { projectId: this._projectId }));

    this.container.querySelector('#tgBtnGit')
      ?.addEventListener('click', () =>
        this.router.navigate('git-changes', { projectId: this._projectId, from: 'test-generator' }));

    this.container.querySelector('#tgSidebar')
      ?.addEventListener('click', e => {
        const item = e.target.closest('.tg-layer-item');
        if (!item || item.classList.contains('tg-layer-item--disabled')) return;
        const id    = parseInt(item.dataset.layerId, 10);
        const layer = this._layers.find(l => l.id === id);
        if (layer) this._selectLayer(layer);
      });

    this._bindMainEvents();
  }

  _bindMainEvents() {
    const main = this.container.querySelector('#tgMain');
    if (!main) return;

    // Unit file / folder / mockup checkboxes
    main.addEventListener('change', e => {
      if (e.target.dataset.file !== undefined) {
        const f = e.target.dataset.file;
        e.target.checked ? this._unitSelected.add(f) : this._unitSelected.delete(f);
        this._updateAncestorFolderCheckboxes(f);
        this._updateUnitFileCount();
        this._syncGenerateBtns();
        return;
      }
      if (e.target.dataset.folder !== undefined) {
        const fp    = e.target.dataset.folder;
        const files = this._getFilesUnderPath(fp);
        files.forEach(f => e.target.checked ? this._unitSelected.add(f) : this._unitSelected.delete(f));
        this._updateSubtreeCheckboxes(fp, e.target.checked);
        this._updateAncestorFolderCheckboxes(fp);
        this._updateUnitFileCount();
        this._syncGenerateBtns();
        return;
      }
      if (e.target.dataset.mockupId !== undefined) {
        const id = parseInt(e.target.dataset.mockupId, 10);
        e.target.checked ? this._e2eSelected.add(id) : this._e2eSelected.delete(id);
        this._syncGenerateBtns();
      }
    });

    // Tab switching
    this.container.querySelector('.tg-tabs')
      ?.addEventListener('click', e => {
        const tabBtn = e.target.closest('[data-tab]');
        if (!tabBtn) return;
        const tab = tabBtn.dataset.tab;
        if (tab === this._activeTab) return;
        this._activeTab = tab;
        // Swap active class on tab buttons
        this.container.querySelectorAll('.tg-tab').forEach(btn => {
          btn.classList.toggle('tg-tab--active', btn.dataset.tab === tab);
        });
        // Re-render tab content
        const content = this.container.querySelector('#tgTabContent');
        if (content) {
          content.innerHTML = tab === 'unit' ? this._unitSectionHtml() : this._e2eSectionHtml();
          this._bindMainEvents();
          if (tab === 'unit') this._applyIndeterminateStates();
        }
      });

    // Select All / Clear unit files; dir expand/collapse
    main.addEventListener('click', e => {
      // Folder row: toggle expand/collapse (ignore clicks on the checkbox itself)
      const dirRow = e.target.closest('.tg-tree-row--dir');
      if (dirRow && !e.target.matches('input')) {
        const dirEl   = dirRow.closest('.tg-tree-dir');
        const children = dirEl?.querySelector('.tg-tree-children');
        const arrow    = dirRow.querySelector('.tg-tree-arrow');
        const dirPath  = dirEl?.dataset.dirPath ?? '';
        if (children) {
          const nowCollapsed = children.classList.toggle('tg-tree-children--collapsed');
          arrow?.classList.toggle('tg-tree-arrow--open', !nowCollapsed);
          if (nowCollapsed) this._expandedDirs.delete(dirPath);
          else              this._expandedDirs.add(dirPath);
        }
        return;
      }
      if (e.target.id === 'tgUnitSelectAll') {
        this._unitFiles.slice(0, 200).forEach(f => this._unitSelected.add(f));
        this._rerenderFileList(); return;
      }
      if (e.target.id === 'tgUnitClear') {
        this._unitSelected.clear();
        this._rerenderFileList(); return;
      }
      if (e.target.id === 'tgE2eToggle') {
        this._e2eEnabled = !this._e2eEnabled;
        const content = this.container.querySelector('#tgTabContent');
        if (content) { content.innerHTML = this._e2eSectionHtml(); this._bindMainEvents(); }
        return;
      }
      if (e.target.id === 'tgUnitGenerate')    { this._generateUnit();     return; }
      if (e.target.id === 'tgE2eGenerate')     { this._generateE2e();      return; }
      if (e.target.id === 'tgBrowseTestFolder'){ this._browseTestFolder(); return; }
    });

    // Sync flow textarea and test folder input
    main.addEventListener('input', e => {
      if (e.target.id === 'tgFlowDesc')      this._e2eFlowDesc    = e.target.value;
      if (e.target.id === 'tgUnitTestFolder') this._unitTestFolder = e.target.value;
    });
  }

  // ─── Layer selection ─────────────────────────────────────────
  async _selectLayer(layer) {
    this._activeLayer    = layer;
    this._isUiLayer      = this._detectUiLayer(layer);
    this._e2eEnabled     = this._isUiLayer;
    this._unitFiles      = 'loading';
    this._unitSelected   = new Set();
    this._expandedDirs   = new Set();
    this._unitTestFolder = inferDefaultTestFolder(layer);
    this._mockups        = [];
    this._e2eSelected    = new Set();
    this._e2eFlowDesc    = '';

    // Update context bar path and re-render main panel
    this._rerenderSidebar();
    this.container.querySelector('#tgMain').innerHTML = this._mainHtml();
    this._bindMainEvents();

    // Load files and mockups in parallel
    const exts = inferExtensions(layer.setup_instructions);
    const [files, mockups] = await Promise.all([
      window.shell.listFiles(layer.folder_path, exts),
      this._isUiLayer ? window.db.screenDesigns.list(this._projectId) : Promise.resolve([]),
    ]);

    this._unitFiles = files;
    this._mockups   = mockups ?? [];

    this.container.querySelector('#tgMain').innerHTML = this._mainHtml();
    this._bindMainEvents();
    this._applyIndeterminateStates();
  }

  _detectUiLayer(layer) {
    const text = [layer.name, layer.description, layer.setup_instructions].join(' ').toLowerCase();
    return UI_FRAMEWORKS.some(k => text.includes(k));
  }

  // ─── File list helpers ────────────────────────────────────────
  _rerenderFileList() {
    const list = this.container.querySelector('#tgUnitFileList');
    if (list) {
      list.innerHTML = this._unitFilesListHtml();
      this._applyIndeterminateStates();
    }
    this._updateUnitFileCount();
    this._syncGenerateBtns();
  }

  _updateUnitFileCount() {
    const el = this.container.querySelector('#tgUnitFileCount');
    if (el) el.textContent = `${this._unitSelected.size} / ${Math.min(this._unitFiles.length, 200)} selected`;
  }

  _syncGenerateBtns() {
    const unitBtn = this.container.querySelector('#tgUnitGenerate');
    if (unitBtn) {
      const can = this._unitSelected.size > 0 && !!this._modelCfg;
      unitBtn.disabled = !can;
      if (!this._modelCfg) unitBtn.title = 'Select a model first';
      else if (this._unitSelected.size === 0) unitBtn.title = 'Select at least one file';
      else unitBtn.title = '';
    }
    const e2eBtn = this.container.querySelector('#tgE2eGenerate');
    if (e2eBtn) {
      const can = this._e2eSelected.size > 0 && !!this._modelCfg;
      e2eBtn.disabled = !can;
    }
  }

  // ─── AI generation — opens a dedicated window ────────────────
  async _generateUnit() {
    if (!this._activeLayer) return;

    const testFolder = this._unitTestFolder.trim();
    if (!testFolder) {
      const hint = this.container.querySelector('#tgFolderHint');
      if (hint) {
        hint.className   = 'tg-folder-hint tg-folder-hint--error';
        hint.textContent = 'Set a test output folder before generating.';
        setTimeout(() => {
          hint.className   = 'tg-folder-hint tg-folder-hint--warn';
          hint.textContent = 'No test folder set — click Browse or type a path.';
        }, 4000);
      }
      return;
    }

    if (!this._unitSelected.size) return;

    await window.app.openTestGenerationWindow({
      mode:       'unit',
      layer:      this._activeLayer,
      files:      [...this._unitSelected],
      testFolder,
      modelCfg:   this._modelCfg,
    });
  }

  async _browseTestFolder() {
    const chosen = await window.db.dialog.openFolder();
    if (!chosen) return;
    this._unitTestFolder = chosen;
    const input = this.container.querySelector('#tgUnitTestFolder');
    if (input) input.value = chosen;
    const hint = this.container.querySelector('#tgFolderHint');
    if (hint) { hint.textContent = ''; hint.className = 'tg-folder-hint'; }
  }

  async _generateE2e() {
    if (!this._activeLayer) return;

    const selectedMockups = this._mockups.filter(m => this._e2eSelected.has(m.id));
    if (!selectedMockups.length) return;

    const testFolder = inferDefaultTestFolder(this._activeLayer)
      || (this._activeLayer.folder_path ? this._activeLayer.folder_path + '/__tests__' : '');

    await window.app.openTestGenerationWindow({
      mode:      'e2e',
      layer:     this._activeLayer,
      mockups:   selectedMockups,
      flowDesc:  this._e2eFlowDesc,
      testFolder,
      modelCfg:  this._modelCfg,
    });
  }

}
