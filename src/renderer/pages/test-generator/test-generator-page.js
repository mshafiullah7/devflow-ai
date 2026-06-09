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
    this._modelCfg    = null;
    this._picker      = null;

    // Unit test state
    this._unitFiles        = [];
    this._unitSelected     = new Set();
    this._expandedDirs     = new Set();
    this._treeAllExpanded  = true;
    this._unitTestFolder   = '';
    this._testedFiles      = new Set();

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

    window.app.testGenerationWindow.onFileSaved(async () => {
      await this._checkExistingTests();
      this._rerenderFileList();
    });

    const firstLayer = this._layers.find(l => l.folder_path);
    if (firstLayer) this._selectLayer(firstLayer);
  }

  unmount() {
    this._git?.stopPoll();
    window.app.testGenerationWindow.offFileSaved();
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
            <p class="tg-subtitle">Unit Test Generator</p>
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
          <aside class="tg-sidebar">
            <div class="tg-sidebar__header">Layers</div>
            <div class="tg-sidebar__list" id="tgSidebar">${this._sidebarHtml()}</div>
          </aside>
          <div class="tg-main-wrap">
            <div class="tg-main__header">Source Files</div>
            <div class="tg-main" id="tgMain">
              ${this._mainHtml()}
            </div>
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
          <span class="tg-layer-item__name-row">
            <span class="tg-layer-item__id">#${l.id}</span>
            <span class="tg-layer-item__name">${escHtml(l.name)}</span>
          </span>
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

    return this._unitSectionHtml();
  }

  _unitSectionHtml() {
    const fileListContent = this._unitFilesListHtml();
    const selectedCount   = this._unitSelected.size;
    const totalCount      = this._unitFiles.length;
    const canGenerate     = selectedCount > 0 && !!this._modelCfg;
    const folderHintClass = this._unitTestFolder ? 'tg-folder-hint' : 'tg-folder-hint tg-folder-hint--warn';
    const folderHintText  = this._unitTestFolder ? '' : 'No test folder set — click Browse or type a path.';

    return `
      <div class="tg-section" id="tgUnitSection">

        <div class="tg-file-picker-wrap">
          <div class="tg-file-picker-toolbar">
            <button class="tg-btn tg-btn--sm" id="tgUnitSelectAll">Select All</button>
            <button class="tg-btn tg-btn--sm" id="tgUnitClear">Clear</button>
            <button class="tg-btn tg-btn--sm" id="tgUnitToggleTree">${this._treeAllExpanded ? 'Collapse All' : 'Expand All'}</button>
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
            Generate Unit Tests
          </button>
          <button class="tg-btn tg-btn--secondary" id="tgExecuteTests"
            title="Run tests for this layer">
            Execute Unit Tests
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
      const checked  = this._unitSelected.has(node.path);
      const hasDot   = this._testedFiles.has(node.path);
      const testedDot = hasDot
        ? `<span class="tg-tree-tested-dot" title="Test file already exists"></span>`
        : '';
      return `
        <label class="tg-tree-row tg-tree-row--file" style="padding-left:${base + 18}px">
          <input type="checkbox" data-file="${escHtml(node.path)}" ${checked ? 'checked' : ''}/>
          <svg class="tg-tree-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          <span class="tg-tree-name-wrap">
            <span class="tg-tree-name">${escHtml(node.name)}</span>${testedDot}
          </span>
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

    // Delegate all main-panel events to the stable container (attached once only)
    this.container.addEventListener('change', e => {
      if (!e.target.closest('#tgMain')) return;
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
      }
    });

    this.container.addEventListener('click', e => {
      if (!e.target.closest('#tgMain')) return;
      const dirRow = e.target.closest('.tg-tree-row--dir');
      if (dirRow && !e.target.matches('input')) {
        const dirEl    = dirRow.closest('.tg-tree-dir');
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
      if (e.target.id === 'tgUnitSelectAll')   { this._unitFiles.slice(0, 200).forEach(f => this._unitSelected.add(f)); this._rerenderFileList(); return; }
      if (e.target.id === 'tgUnitClear')        { this._unitSelected.clear(); this._rerenderFileList(); return; }
      if (e.target.id === 'tgUnitToggleTree') {
        this._treeAllExpanded = !this._treeAllExpanded;
        this._expandedDirs = this._treeAllExpanded
          ? this._getAllDirPaths(this._unitFiles.slice(0, 200))
          : new Set();
        e.target.textContent = this._treeAllExpanded ? 'Collapse All' : 'Expand All';
        this._rerenderFileList();
        return;
      }
      if (e.target.id === 'tgUnitGenerate')     { this._generateUnit();     return; }
      if (e.target.id === 'tgExecuteTests')     { this._executeTests();     return; }
      if (e.target.id === 'tgBrowseTestFolder') { this._browseTestFolder(); return; }
    });

    this.container.addEventListener('input', e => {
      if (!e.target.closest('#tgMain')) return;
      if (e.target.id === 'tgUnitTestFolder') {
        this._unitTestFolder = e.target.value;
        if (this._activeLayer) localStorage.setItem(`devflow_testfolder_${this._activeLayer.id}`, e.target.value);
      }
    });

    this.container.addEventListener('focusout', async e => {
      if (e.target.id === 'tgUnitTestFolder') {
        await this._checkExistingTests();
        this._rerenderFileList();
      }
    });
  }

  // ─── Tested-file detection ───────────────────────────────────
  _inferTestNaming() {
    const s = (this._activeLayer?.setup_instructions || '').toLowerCase();
    if (s.includes('flutter') || s.includes('dart'))                       return { ext: 'dart', pattern: 'underscore' };
    if (s.includes('python') || s.includes('pytest') || s.includes('pip')) return { ext: 'py',   pattern: 'prefix'     };
    if (s.includes('golang') || /\bgo\b/.test(s))                          return { ext: 'go',   pattern: 'underscore' };
    if (s.includes('ruby') || s.includes('rspec') || s.includes('rails'))  return { ext: 'rb',   pattern: 'spec'       };
    if (s.includes('.net') || s.includes('c#') || s.includes('dotnet'))    return { ext: 'cs',   pattern: 'suffix'     };
    if (s.includes('angular'))                                              return { ext: 'ts',   pattern: 'spec'       };
    if (s.includes('vue') || s.includes('vuejs'))                          return { ext: 'ts',   pattern: 'spec'       };
    if (s.includes('typescript') || s.includes('.ts'))                     return { ext: 'ts',   pattern: 'dot-test'   };
    return { ext: 'js', pattern: 'dot-test' };
  }

  _computeTestPath(relPath) {
    if (!this._unitTestFolder) return null;
    const naming    = this._inferTestNaming();
    const rel       = relPath.replace(/\\/g, '/');
    const lastSlash = rel.lastIndexOf('/');
    const dir       = lastSlash >= 0 ? rel.slice(0, lastSlash) : '';
    const fileName  = lastSlash >= 0 ? rel.slice(lastSlash + 1) : rel;
    const baseName  = fileName.replace(/\.[^/.]+$/, '');

    let testFileName;
    switch (naming.pattern) {
      case 'prefix':     testFileName = 'test_'  + baseName + '.' + naming.ext; break;
      case 'underscore': testFileName = baseName + '_test.'  + naming.ext; break;
      case 'spec':       testFileName = baseName + '.spec.'  + naming.ext; break;
      case 'suffix':     testFileName = baseName + 'Tests.'  + naming.ext; break;
      default:           testFileName = baseName + '.test.'  + naming.ext; break;
    }

    const testRel = dir ? dir + '/' + testFileName : testFileName;
    return this._unitTestFolder.replace(/\\/g, '/') + '/' + testRel;
  }

  async _checkExistingTests() {
    this._testedFiles = new Set();
    if (!this._unitTestFolder || !Array.isArray(this._unitFiles)) return;
    await Promise.all(
      this._unitFiles.slice(0, 200).map(async f => {
        const testPath = this._computeTestPath(f);
        if (!testPath) return;
        const stat = await window.shell.statFile(testPath).catch(() => null);
        if (stat) this._testedFiles.add(f);
      })
    );
  }

  // ─── Layer selection ─────────────────────────────────────────
  _getAllDirPaths(files) {
    const dirs = new Set();
    for (const f of files) {
      const parts = f.replace(/\\/g, '/').split('/');
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join('/'));
      }
    }
    return dirs;
  }

  async _selectLayer(layer) {
    this._activeLayer      = layer;
    this._unitFiles        = 'loading';
    this._unitSelected     = new Set();
    this._expandedDirs     = new Set();
    this._treeAllExpanded  = true;

    const savedFolder      = localStorage.getItem(`devflow_testfolder_${layer.id}`);
    this._unitTestFolder   = savedFolder || inferDefaultTestFolder(layer);

    this._rerenderSidebar();
    this.container.querySelector('#tgMain').innerHTML = this._mainHtml();

    const exts = inferExtensions(layer.setup_instructions);
    this._unitFiles    = await window.shell.listFiles(layer.folder_path, exts);
    this._expandedDirs = this._getAllDirPaths(this._unitFiles.slice(0, 200));
    await this._checkExistingTests();

    this.container.querySelector('#tgMain').innerHTML = this._mainHtml();
    this._applyIndeterminateStates();
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

  async _executeTests() {
    if (!this._activeLayer) return;
    await window.app.openTestRunnerWindow({
      projectId: this._projectId,
      layer:     this._activeLayer,
      modelCfg:  this._modelCfg,
    });
  }

  async _browseTestFolder() {
    const chosen = await window.db.dialog.openFolder();
    if (!chosen) return;
    this._unitTestFolder = chosen;
    if (this._activeLayer) localStorage.setItem(`devflow_testfolder_${this._activeLayer.id}`, chosen);
    const input = this.container.querySelector('#tgUnitTestFolder');
    if (input) input.value = chosen;
    const hint = this.container.querySelector('#tgFolderHint');
    if (hint) { hint.textContent = ''; hint.className = 'tg-folder-hint'; }
    await this._checkExistingTests();
    this._rerenderFileList();
  }


}
