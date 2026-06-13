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

function stripCodeFences(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  const firstNewline = trimmed.indexOf('\n');
  if (firstNewline === -1) return trimmed;
  const inner = trimmed.slice(firstNewline + 1);
  return inner.endsWith('```') ? inner.slice(0, -3).trimEnd() : inner;
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

    // Inline generation state
    this._genProgress      = [];
    this._genSelIdx        = null;
    this._genRunning       = false;
    this._genAborted       = false;
    this._genCurrentIdx    = null;
    this._genTimerInt      = null;
    this._genStartTime     = null;
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
    this._genClearTimer();
    if (this._genRunning) {
      window.app.testGenChat.cancel();
      window.app.testGenChat.offAll();
    }
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
    const selectedCount   = this._unitSelected.size;
    const totalCount      = this._unitFiles.length;
    const folderHintClass = this._unitTestFolder ? 'tg-folder-hint' : 'tg-folder-hint tg-folder-hint--warn';
    const folderHintText  = this._unitTestFolder ? '' : 'No test folder — click Browse or type a path.';

    return `
      <div class="tg-split" id="tgUnitSection">

        <!-- LEFT: file tree + folder picker -->
        <div class="tg-split-left">
          <div class="tg-file-picker-toolbar">
            <button class="tg-btn tg-btn--sm" id="tgUnitSelectAll">All</button>
            <button class="tg-btn tg-btn--sm" id="tgUnitClear">Clear</button>
            <button class="tg-btn tg-btn--sm" id="tgUnitToggleTree">${this._treeAllExpanded ? 'Collapse' : 'Expand'}</button>
            <span class="tg-file-count" id="tgUnitFileCount">${selectedCount} / ${totalCount}</span>
          </div>
          <div class="tg-file-list" id="tgUnitFileList">${this._unitFilesListHtml()}</div>
          <div class="tg-folder-strip">
            <input class="tg-filename-input" id="tgUnitTestFolder"
                   value="${escHtml(this._unitTestFolder)}"
                   placeholder="Test output folder…" spellcheck="false"/>
            <button class="tg-btn tg-btn--sm" id="tgBrowseTestFolder">Browse…</button>
          </div>
          <p class="${folderHintClass}" id="tgFolderHint">${folderHintText}</p>
        </div>

        <!-- RIGHT: selected files + live code output -->
        <div class="tg-split-right">
          <div class="tg-gen-header">
            <div class="tg-gen-controls">
              <button class="tg-btn tg-btn--sm tg-btn--primary" id="tgGenRunAll">▶ Run</button>
              <button class="tg-btn tg-btn--sm tg-btn--stop"    id="tgGenStop" hidden>■ Stop</button>
              <button class="tg-btn tg-btn--sm"                 id="tgExecuteTests">Execute Tests</button>
            </div>
          </div>
          <div class="tg-gen-items" id="tgGenItems">${this._genFilesHtml()}</div>
          <div class="tg-gen-output">
            <div class="tg-gen-output-hd">
              <span class="tg-gen-output-name" id="tgGenCurFile">—</span>
              <span class="tg-gen-elapsed"     id="tgGenElapsed"></span>
            </div>
            <div class="tg-gen-code-wrap" id="tgGenCodeWrap">
              <pre class="tg-gen-code" id="tgGenCode"></pre>
            </div>
          </div>
          <div class="tg-gen-footer">
            <span class="tg-gen-status" id="tgGenStatus">${selectedCount > 0 ? `${selectedCount} file${selectedCount !== 1 ? 's' : ''} ready` : 'Select files from the tree'}</span>
            <span class="tg-gen-pill"   id="tgGenPill"></span>
          </div>
        </div>

      </div>`;
  }

  _genFilesHtml() {
    // During / after generation: show progress with status chips
    if (this._genProgress.length > 0) {
      const CHIP = { pending: 'Pending', generating: 'Generating', saved: 'Saved', error: 'Error' };
      return this._genProgress.map((item, i) => {
        const active = i === this._genSelIdx ? 'tg-gen-item--active' : '';
        return `
          <div class="tg-gen-item tg-gen-item--${item.status} ${active}" data-gen-idx="${i}">
            <span class="tg-gen-chip tg-gen-chip--${item.status}">${CHIP[item.status] ?? item.status}</span>
            <span class="tg-gen-item-name" title="${escHtml(item.relPath)}">${escHtml(item.label)}</span>
          </div>`;
      }).join('');
    }

    // Idle: mirror current selection
    if (!this._unitSelected.size) {
      return `<div class="tg-gen-empty">Select files from the tree to begin</div>`;
    }
    return [...this._unitSelected].map((relPath, i) => {
      const label  = relPath.replace(/\\/g, '/').split('/').pop();
      const active = i === this._genSelIdx ? 'tg-gen-item--active' : '';
      return `
        <div class="tg-gen-item ${active}" data-gen-idx="${i}">
          <span class="tg-gen-chip tg-gen-chip--pending">Ready</span>
          <span class="tg-gen-item-name" title="${escHtml(relPath)}">${escHtml(label)}</span>
        </div>`;
    }).join('');
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
        e.target.textContent = this._treeAllExpanded ? 'Collapse' : 'Expand';
        this._rerenderFileList();
        return;
      }
      if (e.target.id === 'tgGenRunAll')        { this._genRunAll();        return; }
      if (e.target.id === 'tgGenStop')          { this._genStop();          return; }
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
    if (!this._genRunning) this._genProgress = [];
    this._genSyncRight();
  }

  _updateUnitFileCount() {
    const el = this.container.querySelector('#tgUnitFileCount');
    if (el) el.textContent = `${this._unitSelected.size} / ${Math.min(this._unitFiles.length, 200)}`;
  }

  // ─── Right-panel sync ─────────────────────────────────────────
  _genSyncRight() {
    this._genRefreshFiles();
    this._genSyncControls();
    const statusEl = this.container.querySelector('#tgGenStatus');
    if (statusEl && !this._genRunning && !this._genProgress.length) {
      const n = this._unitSelected.size;
      statusEl.textContent = n > 0 ? `${n} file${n !== 1 ? 's' : ''} ready` : 'Select files from the tree';
      statusEl.className   = 'tg-gen-status';
    }
  }

  _genSyncControls() {
    if (this._genRunning) return; // toolbar managed by run/stop methods
    const can    = this._unitSelected.size > 0 && !!this._modelCfg && !!this._unitTestFolder.trim();
    const runAll = this.container.querySelector('#tgGenRunAll');
    const stop   = this.container.querySelector('#tgGenStop');
    if (runAll) runAll.disabled = !can;
    if (stop)   stop.hidden     = true;
    if (!this._modelCfg && runAll) runAll.title = 'Select a model first';
    else if (!this._unitTestFolder.trim() && runAll) runAll.title = 'Set a test output folder first';
    else if (!this._unitSelected.size && runAll) runAll.title = 'Select at least one file';
    else if (runAll) runAll.title = '';
  }

  // kept for model-picker callback compat
  _syncGenerateBtns() { this._genSyncControls(); }

  // ─── Run logic ────────────────────────────────────────────────
  _buildGenProgress() {
    this._genProgress = [...this._unitSelected].map(relPath => ({
      label:  relPath.replace(/\\/g, '/').split('/').pop(),
      relPath,
      status: 'pending', outPath: '', errMsg: '',
    }));
    this._genSelIdx = this._genProgress.length > 0 ? 0 : null;
  }

  _setRunningUI(running) {
    this._genRunning = running;
    const runAll = this.container.querySelector('#tgGenRunAll');
    const runSel = this.container.querySelector('#tgGenRunSel');
    const stop   = this.container.querySelector('#tgGenStop');
    const tree   = this.container.querySelector('#tgUnitFileList');
    if (running) {
      if (runAll) { runAll.hidden = true;  runAll.disabled = true; }
      if (stop)     stop.hidden  = false;
      if (tree)     tree.style.pointerEvents = 'none';
    } else {
      if (runAll) { runAll.hidden = false; }
      if (stop)     stop.hidden  = true;
      if (tree)     tree.style.pointerEvents = '';
      this._genSyncControls();
    }
  }

  async _genRunAll() {
    if (this._genRunning || !this._unitSelected.size) return;
    if (!this._unitTestFolder.trim()) { this._showFolderError(); return; }
    this._buildGenProgress();
    this._genAborted = false;
    this._setRunningUI(true);
    this._genRefreshFiles();
    for (let i = 0; i < this._genProgress.length; i++) {
      if (this._genAborted) break;
      if (this._genProgress[i].status !== 'pending') continue;
      await this._genRunItem(i);
    }
    this._genCurrentIdx = null;
    this._genClearTimer();
    this._setRunningUI(false);
    this._genShowDone();
  }

  async _genRunSelected() {
    if (this._genRunning) return;
    if (!this._unitTestFolder.trim()) { this._showFolderError(); return; }
    // Build progress if not already built, or if selection changed
    if (!this._genProgress.length) this._buildGenProgress();
    const idx  = this._genSelIdx ?? 0;
    const item = this._genProgress[idx];
    if (!item || item.status === 'saved') return;
    if (item.status === 'error') item.status = 'pending';
    this._genAborted = false;
    this._setRunningUI(true);
    this._genRefreshFiles();
    await this._genRunItem(idx);
    this._genCurrentIdx = null;
    this._genClearTimer();
    this._setRunningUI(false);
    this._genShowDone();
  }

  _showFolderError() {
    const hint = this.container.querySelector('#tgFolderHint');
    if (hint) {
      hint.className   = 'tg-folder-hint tg-folder-hint--error';
      hint.textContent = 'Set a test output folder before generating.';
      setTimeout(() => {
        hint.className   = 'tg-folder-hint tg-folder-hint--warn';
        hint.textContent = 'No test folder — click Browse or type a path.';
      }, 3500);
    }
  }

  async _genRunItem(i) {
    this._genCurrentIdx = i;
    this._genSetStatus(i, 'generating');
    this._genUpdateCurFile(this._genProgress[i].label);
    this._genUpdateStatus(`Generating ${i + 1} of ${this._genProgress.length}…`);
    this._genStartTimer();

    const codeEl = this.container.querySelector('#tgGenCode');
    if (codeEl) codeEl.textContent = '';

    try {
      const item    = this._genProgress[i];
      const absPath = `${this._activeLayer.folder_path}/${item.relPath}`;
      let src = await window.shell.readFile(absPath);
      if (src === null) { this._genSetStatus(i, 'error', '', 'Could not read file'); return; }
      if (src.length > 8000) src = src.slice(0, 8000) + '\n// [truncated]';

      const prompt  = this._buildUnitPrompt(item.relPath, src);
      const outPath = this._computeTestPath(item.relPath);
      if (!outPath) { this._genSetStatus(i, 'error', '', 'No test folder set'); return; }

      const raw  = await this._streamGenItem(prompt);
      const code = stripCodeFences(raw);

      if (this._genAborted) { this._genSetStatus(i, 'pending'); return; }

      const ok = await window.shell.writeFile(outPath, code);
      if (ok) window.shell.notifyTestFileSaved();
      this._genSetStatus(i, ok ? 'saved' : 'error', outPath, ok ? '' : 'Write failed');
    } catch (err) {
      this._genSetStatus(i, this._genAborted ? 'pending' : 'error', '', err.message || 'Failed');
    }
    this._genClearTimer();
  }

  _genStop() {
    if (!this._genRunning) return;
    this._genAborted = true;
    window.app.testGenChat.cancel();
    window.app.testGenChat.offAll();
    this._genProgress.forEach(p => { if (p.status === 'generating') p.status = 'pending'; });
    this._genCurrentIdx = null;
    this._genClearTimer();
    this._setRunningUI(false);
    this._genRefreshFiles();
    this._genUpdateCurFile(null);
    this._genUpdateStatus('Cancelled.');
  }

  _streamGenItem(prompt) {
    return new Promise((resolve, reject) => {
      let code = '';
      window.app.testGenChat.offAll();
      window.app.testGenChat.onToken(({ text }) => {
        code += text;
        const pre  = this.container.querySelector('#tgGenCode');
        const wrap = this.container.querySelector('#tgGenCodeWrap');
        if (pre)  pre.textContent = code;
        if (wrap) wrap.scrollTop  = wrap.scrollHeight;
      });
      window.app.testGenChat.onDone(({ error }) => {
        window.app.testGenChat.offAll();
        if (error) reject(new Error(error));
        else resolve(code);
      });
      window.app.testGenChat.generate({ prompt, model: this._modelCfg });
    });
  }

  _buildUnitPrompt(relPath, content) {
    const l = this._activeLayer;
    return `You are an expert software engineer writing unit tests.

## Tech Stack & Layer Context
${l.setup_instructions || '(no setup instructions provided)'}

## Layer: ${l.name}
Folder: ${l.folder_path}

## Source File: ${relPath}
${content}

## Task
Generate comprehensive unit tests using the testing framework implied by the tech stack above.
- Cover: happy paths, edge cases, error conditions, boundary values
- Use describe() blocks to group related tests
- Each test should have a clear descriptive name
- Mock external dependencies (DB, HTTP, filesystem) where appropriate
- Do not test implementation details — test observable behaviour and contracts

Output ONLY the test file content. No explanation text. Start directly with import or require statements.`;
  }

  // ─── Generate view DOM helpers ────────────────────────────────
  _genSetStatus(i, status, outPath = '', errMsg = '') {
    if (!this._genProgress[i]) return;
    this._genProgress[i] = { ...this._genProgress[i], status, outPath, errMsg };
    this._genRefreshFiles();
  }

  _genRefreshFiles() {
    const el = this.container.querySelector('#tgGenItems');
    if (el) el.innerHTML = this._genFilesHtml();
    const saved = this._genProgress.filter(p => p.status === 'saved').length;
    const pill  = this.container.querySelector('#tgGenPill');
    if (pill) pill.textContent = this._genProgress.length ? `${saved} / ${this._genProgress.length}` : '';
  }

  _genUpdateCurFile(label) {
    const el = this.container.querySelector('#tgGenCurFile');
    if (el) el.textContent = label || '—';
    if (!label) {
      const elapsed = this.container.querySelector('#tgGenElapsed');
      if (elapsed) elapsed.textContent = '';
    }
  }

  _genUpdateStatus(text, variant = '') {
    const el = this.container.querySelector('#tgGenStatus');
    if (!el) return;
    el.textContent = text;
    el.className   = `tg-gen-status${variant ? ' tg-gen-status--' + variant : ''}`;
  }

  _genShowDone() {
    const total  = this._genProgress.length;
    const saved  = this._genProgress.filter(p => p.status === 'saved').length;
    const errors = this._genProgress.filter(p => p.status === 'error').length;
    const pill   = this.container.querySelector('#tgGenPill');
    if (pill) {
      pill.textContent = `${saved} / ${total}`;
      if (!errors && saved > 0) pill.classList.add('tg-gen-pill--done');
    }
    if (this._genAborted) {
      this._genUpdateStatus('Cancelled.', 'error');
    } else if (errors > 0) {
      this._genUpdateStatus(`Done — ${saved} saved, ${errors} error${errors > 1 ? 's' : ''}.`, 'error');
    } else {
      this._genUpdateStatus(`All ${saved} test file${saved !== 1 ? 's' : ''} saved.`, 'done');
    }
  }

  _genStartTimer() {
    this._genClearTimer();
    this._genStartTime = Date.now();
    this._genTimerInt  = setInterval(() => {
      const el = this.container.querySelector('#tgGenElapsed');
      if (el && this._genStartTime) el.textContent = this._genFmt(Date.now() - this._genStartTime);
    }, 500);
  }

  _genClearTimer() {
    if (this._genTimerInt) { clearInterval(this._genTimerInt); this._genTimerInt = null; }
    this._genStartTime = null;
  }

  _genFmt(ms) {
    const s = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
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
