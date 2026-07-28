import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelPicker } from '../../components/model-picker/model-picker.js';
import { ProjectSidebar } from '../../components/project-sidebar/project-sidebar.js';

const FILE_EXTENSIONS = {
  flutter: ['.dart'],
  python:  ['.py'],
  dotnet:  ['.cs', '.fs', '.vb'],
  java:    ['.java', '.kt'],
  go:      ['.go'],
  ruby:    ['.rb'],
  vue:     ['.vue', '.ts', '.js'],
  angular: ['.ts'],
  react:   ['.tsx', '.jsx', '.ts', '.js'],
  default: ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'],
};

// ── Business-logic file heuristic ─────────────────────────────────────────
// Cheap, language-agnostic signal for "this file is worth writing unit tests
// for" — no AST parsing, just path conventions + a branching-keyword count.
// Two passes: (1) exclude folders/files that are conventionally pure data or
// presentation/generated code across common stacks (backend, Flutter, Android,
// web frontend); (2) among what's left, flag files with enough branching
// constructs (if/switch/for/while/catch/etc.) to likely contain real logic.
const LOGIC_EXCLUDE_DIR_RE = /(^|\/)(models?|dtos?|entities|entity|types|interfaces|constants|generated|gen|__generated__|pages|screens|views|widgets|layouts|resources|assets|migrations|l10n|i18n|mocks?|fixtures?)(\/|$)/i;
const LOGIC_EXCLUDE_FILE_RE = /(\.g\.dart|\.freezed\.dart|\.pb\.(dart|go)|\.designer\.cs|\.min\.js|\.d\.ts|(^|\/)index\.\w+$|\.config\.\w+$|Binding\.(kt|java)$)$/i;
const LOGIC_BRANCH_RE = /\b(if|else\s+if|elif|switch|case|when|for|foreach|while|catch|except|try)\b|&&|\|\|/g;
const LOGIC_MIN_BRANCH_COUNT = 3;

function isLikelyDataOrPresentationFile(relPath) {
  const p = relPath.replace(/\\/g, '/');
  return LOGIC_EXCLUDE_DIR_RE.test(p) || LOGIC_EXCLUDE_FILE_RE.test(p);
}

async function detectProjectExtensions(folderPath) {
  const stat = f => window.shell.statFile(`${folderPath}/${f}`).catch(() => null);

  if (await stat('pubspec.yaml'))     return FILE_EXTENSIONS.flutter;
  if (await stat('go.mod'))           return FILE_EXTENSIONS.go;
  if (await stat('Gemfile'))          return FILE_EXTENSIONS.ruby;
  if (await stat('pom.xml'))          return FILE_EXTENSIONS.java;
  if (await stat('build.gradle'))     return FILE_EXTENSIONS.java;
  if (await stat('build.gradle.kts')) return FILE_EXTENSIONS.java;

  for (const f of ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile']) {
    if (await stat(f)) return FILE_EXTENSIONS.python;
  }

  const pkgRaw = await window.shell.readFile(`${folderPath}/package.json`).catch(() => null);
  if (pkgRaw) {
    try {
      const pkg  = JSON.parse(pkgRaw);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['vue'] || deps['@vue/cli-service'] || deps['@vitejs/plugin-vue']) return FILE_EXTENSIONS.vue;
      if (deps['@angular/core'])                                                  return FILE_EXTENSIONS.angular;
      if (deps['react'])                                                          return FILE_EXTENSIONS.react;
    } catch {}
    return FILE_EXTENSIONS.default;
  }

  // .NET: no fixed-name root marker — scan for project files
  const dotnetFiles = await window.shell.listFiles(folderPath, ['.csproj', '.fsproj', '.vbproj']).catch(() => []);
  if (dotnetFiles.length) return FILE_EXTENSIONS.dotnet;

  return null;
}

function inferExtensions(setupInstructions) {
  const s = (setupInstructions || '').toLowerCase();
  if (s.includes('flutter') || s.includes('dart'))                                                             return FILE_EXTENSIONS.flutter;
  if (s.includes('python') || s.includes('pytest') || s.includes('pip'))                                      return FILE_EXTENSIONS.python;
  if (s.includes('.net') || s.includes('c#') || s.includes('dotnet'))                                         return FILE_EXTENSIONS.dotnet;
  if ((s.includes('java') || s.includes('kotlin')) && !s.includes('javascript') && !s.includes('typescript')) return FILE_EXTENSIONS.java;
  if (s.includes('golang') || /\bgo\b/.test(s))                                                               return FILE_EXTENSIONS.go;
  if (s.includes('ruby') || s.includes('rspec') || s.includes('rails'))                                       return FILE_EXTENSIONS.ruby;
  if (s.includes('vue') || s.includes('vuejs'))                                                               return FILE_EXTENSIONS.vue;
  if (s.includes('angular'))                                                                                   return FILE_EXTENSIONS.angular;
  if (s.includes('react'))                                                                                     return FILE_EXTENSIONS.react;
  return FILE_EXTENSIONS.default;
}

function stripCodeFences(raw) {
  const trimmed = raw.trim();
  // Prefer an explicit fenced code block wherever it appears in the output —
  // agentic CLIs like agy print their own tool-call narration ("I will search
  // for...", "I will view...") to stdout ahead of the actual file content when
  // run non-interactively, so the response can't be assumed to start with the
  // code. Pick the largest fenced block found, in case narration itself echoes
  // a short inline snippet.
  const fenceRe = /```[^\n]*\n([\s\S]*?)```/g;
  let best = null;
  let match;
  while ((match = fenceRe.exec(trimmed)) !== null) {
    if (best === null || match[1].length > best.length) best = match[1];
  }
  if (best !== null) return best.trim();

  // No fence anywhere — fall back to the whole response (e.g. Claude, which
  // reliably follows the "no fences" instruction and returns bare code).
  return trimmed;
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


function stripAnsi(str) {
  return str
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1B\][^\x07]*\x07/g, '');
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

    // Sidebar
    this._sidebarCollapsed = false;
    this._projectCtxCache  = null;

    // Mode
    this._mode             = 'generate'; // 'generate' | 'execute'

    // Unit test state
    this._unitFiles      = [];
    this._unitSelected   = new Set();
    this._unitTestFolder = '';
    this._testedFiles    = new Set();
    this._staleFiles     = new Set();
    this._logicFiles     = new Set();

    // Execute-tab state — the REAL test files found on disk in the test folder,
    // not a guess derived from source file names (see _loadExecTestFiles).
    this._execTestFiles     = [];
    this._execTestSelected  = new Set();

    // Inline generation state
    this._genProgress      = [];
    this._genSelIdx        = null;
    this._genRunning       = false;
    this._genAborted       = false;
    this._genCurrentIdx    = null;
    this._genTimerInt      = null;
    this._genStartTime     = null;

    // Execute tab state
    this._execCommands     = [];
    this._execCmd          = null;
    this._execRunning      = false;
    this._execOutput       = '';
    this._execResult       = null; // { failed, passed } | null
    this._execDetecting    = false;
    this._execManualCmd    = '';

    // Git panel
    this._gitPanelVisible  = false;
    this._gitFiles         = [];
    this._gitPollInterval  = null;
    this._gitExpandedFiles = new Set();
  }

  async mount() {
    injectCss('pages/test-generator/test-generator-page.css');
    injectCss('components/git/git-diff.css');
    injectCss('components/project-sidebar/project-sidebar.css');
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

    this._bindEvents();
    this._sidebar.bindEvents(this.container);
    this._sidebar.loadCounts(this.container);
    this._startGitPolling();

    window.app.testGenerationWindow.onFileSaved(async () => {
      await this._checkExistingTests();
      this._rerenderFileList();
      if (this._mode === 'execute') {
        await this._loadExecTestFiles();
        this._rerenderExecTestList();
      }
    });

    const firstLayer = this._layers.find(l => l.folder_path);
    if (firstLayer) this._selectLayer(firstLayer);
  }

  unmount() {
    this._genClearTimer();
    if (this._genRunning) {
      window.app.testGenChat.cancel();
      window.app.testGenChat.offAll();
    }
    if (this._execRunning) window.db.testRunner.kill();
    window.db.testRunner.removeListeners();
    window.app.testGenerationWindow.offFileSaved();
    this._stopGitPolling();
    removeCss('pages/test-generator/test-generator-page.css');
    // components/git/git-diff.css and project-sidebar.css are shared with
    // persistent tabs (Workflow Runner, Issue Runner, Terminal) that may still
    // be alive in the background — removing them here strips their styling too.
    this._picker?.unmount();
  }

  // ─── Template ────────────────────────────────────────────────
  _template() {
    const name    = this._project?.name ?? 'Project';
    const initial = this._project?.name?.trim()[0]?.toUpperCase() ?? '?';
    this._sidebar = new ProjectSidebar({ projectId: this._projectId, router: this.router, activeRoute: 'test-generator' });
    return `
      <div class="ph-project-shell">
        <header class="project-home__header">
          <button class="project-home__back" id="tgBtnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div class="project-home__badge">
            <div class="project-home__badge-initial">${initial}</div>
            <span class="project-home__badge-name">${escHtml(name)}</span>
          </div>
          <span class="ph-header-page-chip">Unit Tests</span>
          <div class="ph-header-actions">
            <div class="tg-header-toggle">
              <button class="tg-mode-btn ${this._mode === 'generate' ? 'tg-mode-btn--active' : ''}" id="tgModeGenerate">Generate</button>
              <button class="tg-mode-btn ${this._mode === 'execute'  ? 'tg-mode-btn--active' : ''}" id="tgModeExecute">Execute</button>
            </div>
            <div id="tgModelPicker"></div>
            <button class="tg-git-toggle-btn" id="tgBtnGitToggle" title="Toggle Git Changes">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <circle cx="5" cy="4" r="1.5" stroke="currentColor" stroke-width="1.4"/>
                <circle cx="11" cy="12" r="1.5" stroke="currentColor" stroke-width="1.4"/>
                <circle cx="11" cy="4" r="1.5" stroke="currentColor" stroke-width="1.4"/>
                <path d="M5 5.5v5a1.5 1.5 0 001.5 1.5H11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                <path d="M11 5.5V9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
              Git <span class="tg-git-badge" id="tgGitBadge" hidden></span>
            </button>
          </div>
        </header>

        <div class="ph-page-with-nav">
          ${this._sidebar.html()}
          <div class="tg-body">
          <aside class="tg-sidebar${this._sidebarCollapsed ? ' tg-sidebar--collapsed' : ''}">
            <div class="tg-sidebar__header">
              <span class="tg-sidebar__header-label">Project Layers</span>
              <button class="tg-sidebar__toggle" id="tgSidebarToggle" aria-label="${this._sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M15 18l-6-6 6-6"/>
                </svg>
              </button>
            </div>
            <div class="tg-sidebar__list" id="tgSidebar">${this._sidebarHtml()}</div>
          </aside>
          <div class="tg-main-wrap">
            <div class="tg-main" id="tgMain">
              ${this._mainHtml()}
            </div>
            <div class="tg-git-panel" id="tgGitPanel" hidden>
              <div class="tg-git-panel__header">
                <span class="tg-git-panel__title">Git Changes</span>
                <span class="tg-git-panel__badge" id="tgGitPanelBadge" hidden></span>
                <div class="tg-git-panel__actions">
                  <button class="tg-git-panel__icon-btn" id="tgBtnGitExpandAll" title="Expand all">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <path d="M2 5l6 6 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <button class="tg-git-panel__icon-btn" id="tgBtnGitCollapseAll" title="Collapse all">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <path d="M2 11l6-6 6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <button class="tg-git-panel__icon-btn" id="tgBtnGitRefresh" title="Refresh">↺</button>
                  <button class="tg-git-panel__icon-btn" id="tgBtnGitClose" title="Close">✕</button>
                </div>
              </div>
              <div class="tg-git-commit-bar">
                <input class="tg-git-commit-msg" id="tgGitCommitMsg" type="text"
                  spellcheck="false" placeholder="Commit message…">
                <button class="tg-git-commit-btn" id="tgBtnGitCommit" disabled>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l4 4 6-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Commit
                </button>
              </div>
              <div class="tg-git-panel__body" id="tgGitAccordion">
                <div class="git-diff-empty">No changes yet.</div>
              </div>
            </div>
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
          <span>Select a layer from the left panel to begin.</span>
        </div>`;
    }
    return this._mode === 'execute' ? this._execSectionHtml() : this._unitSectionHtml();
  }

  _genRightHtml() {
    const selectedCount = this._unitSelected.size;
    const staleCount    = this._staleFiles.size;
    return `
      <div class="tg-gen-header">
        <span class="tg-gen-status" id="tgGenStatus">${selectedCount > 0 ? `${selectedCount} file${selectedCount !== 1 ? 's' : ''} ready` : 'Select files from the tree to begin'}</span>
        <div class="tg-gen-controls">
          ${staleCount > 0
            ? `<button class="tg-btn tg-btn--sm tg-btn--outline" id="tgGenRegenStale" title="Select and regenerate tests whose source file changed since last generation">↻ Regenerate outdated (${staleCount})</button>`
            : ''}
          <button class="tg-btn tg-btn--sm tg-btn--primary" id="tgGenRunAll">▶ Generate Unit Tests</button>
          <button class="tg-btn tg-btn--sm tg-btn--stop"    id="tgGenStop" hidden>■ Stop</button>
        </div>
      </div>
      <div class="tg-gen-items" id="tgGenItems">${this._genFilesHtml()}</div>
      <div class="tg-gen-output">
        <div class="tg-gen-output-hd" id="tgGenOutputHd" hidden>
          <span class="tg-gen-output-name" id="tgGenCurFile"></span>
          <span class="tg-gen-elapsed"     id="tgGenElapsed"></span>
        </div>
        <div class="tg-gen-code-wrap" id="tgGenCodeWrap">
          <pre class="tg-gen-code" id="tgGenCode"></pre>
        </div>
      </div>`;
  }

  // ─── Execute tab ──────────────────────────────────────────────
  // The Execute tab shows the REAL test files found on disk in the configured
  // test folder — not the source-file tree used for generation, and not a
  // guessed name derived from _computeTestPath(). A generated (or hand-written)
  // test's actual filename/location can differ from that guess, which would
  // otherwise point the test runner at a file that doesn't exist.
  _execSectionHtml() {
    const total         = Array.isArray(this._execTestFiles) ? this._execTestFiles.length : 0;
    const selectedCount = this._execTestSelected.size;

    return `
      <div class="tg-split" id="tgExecSplit">

        <!-- LEFT: real test files on disk -->
        <div class="tg-split-left">
          <div class="tg-file-picker-toolbar">
            <button class="tg-btn tg-btn--sm" id="tgExecTestSelectAll">All</button>
            <button class="tg-btn tg-btn--sm" id="tgExecTestClear">Clear</button>
            <button class="tg-btn tg-btn--sm" id="tgExecTestRefresh" title="Re-scan the test folder">⟳</button>
            <span class="tg-file-count" id="tgExecTestFileCount">${selectedCount} / ${Math.min(total, 200)}</span>
          </div>
          <div class="tg-file-list" id="tgExecTestFileList">${this._execTestFilesListHtml()}</div>
          <div class="tg-folder-strip">
            <span class="tg-filename-input tg-filename-input--readonly" title="${escHtml(this._unitTestFolder || '')}">
              ${escHtml(this._unitTestFolder || 'No test folder set — set one in the Generate tab')}
            </span>
          </div>
        </div>

        <!-- RIGHT: run controls -->
        <div class="tg-split-right" id="tgSplitRight">${this._execRightHtml()}</div>

      </div>`;
  }

  _execTestFilesListHtml() {
    if (!this._unitTestFolder)              return `<div class="tg-file-list--empty">Set a test output folder in the Generate tab first.</div>`;
    if (this._execTestFiles === 'loading')  return `<div class="tg-file-list--loading">Scanning test folder…</div>`;
    if (this._execTestFiles === null)       return `<div class="tg-file-list--error">Test folder not accessible.</div>`;
    if (!this._execTestFiles.length)        return `<div class="tg-file-list--empty">No test files found in this folder yet — generate some from the Generate tab.</div>`;

    const capped = this._execTestFiles.slice(0, 200);

    // Group files by immediate parent folder (mirrors _unitFilesListHtml)
    const groups = new Map();
    for (const filePath of capped) {
      const rel       = filePath.replace(/\\/g, '/');
      const lastSlash = rel.lastIndexOf('/');
      const dir       = lastSlash >= 0 ? rel.slice(0, lastSlash) : '';
      if (dir.split('/').some(seg => seg.startsWith('.'))) continue;
      if (!groups.has(dir)) groups.set(dir, []);
      groups.get(dir).push(filePath);
    }

    // Root first, then alphabetical
    const sorted = [...groups.entries()].sort((a, b) => {
      if (!a[0]) return -1;
      if (!b[0]) return 1;
      return a[0].localeCompare(b[0]);
    });

    const folderIcon = `<svg class="tg-group-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;

    const groupsHtml = sorted.map(([dir, files]) => {
      const allSel  = files.every(f => this._execTestSelected.has(f));
      const someSel = !allSel && files.some(f => this._execTestSelected.has(f));
      const label   = dir || '(root)';

      const filesHtml = files
        .slice().sort((a, b) => a.localeCompare(b))
        .map(filePath => {
          const fileName = filePath.replace(/\\/g, '/').split('/').pop();
          const checked  = this._execTestSelected.has(filePath);
          return `
            <label class="tg-flat-row">
              <input type="checkbox" data-exec-file="${escHtml(filePath)}" ${checked ? 'checked' : ''}/>
              <span class="tg-flat-name">${escHtml(fileName)}</span>
            </label>`;
        }).join('');

      return `
        <div class="tg-group">
          <div class="tg-group-header">
            <input type="checkbox" data-exec-folder="${escHtml(dir)}"
                   ${allSel ? 'checked' : ''} ${someSel ? 'data-indeterminate' : ''}/>
            ${folderIcon}
            <span class="tg-group-name" title="${escHtml(dir || '/')}">${escHtml(label)}</span>
            <span class="tg-group-count">${files.length}</span>
          </div>
          <div class="tg-group-files">${filesHtml}</div>
        </div>`;
    }).join('');

    const extra  = this._execTestFiles.length - capped.length;
    const notice = extra > 0
      ? `<div class="tg-file-list--notice">Showing first 200 files.</div>`
      : '';
    return groupsHtml + notice;
  }

  _getExecFilesInDir(dir) {
    if (!Array.isArray(this._execTestFiles)) return [];
    return this._execTestFiles.filter(f => {
      const rel       = f.replace(/\\/g, '/');
      const lastSlash = rel.lastIndexOf('/');
      const fileDir   = lastSlash >= 0 ? rel.slice(0, lastSlash) : '';
      return fileDir === dir;
    });
  }

  _updateExecGroupCheckbox(filePath) {
    const list = this.container.querySelector('#tgExecTestFileList');
    if (!list) return;
    const rel       = filePath.replace(/\\/g, '/');
    const lastSlash = rel.lastIndexOf('/');
    const dir       = lastSlash >= 0 ? rel.slice(0, lastSlash) : '';
    const cb        = list.querySelector(`input[data-exec-folder="${CSS.escape(dir)}"]`);
    if (!cb) return;
    const files = this._getExecFilesInDir(dir);
    const sel   = files.filter(f => this._execTestSelected.has(f)).length;
    cb.checked       = files.length > 0 && sel === files.length;
    cb.indeterminate = sel > 0 && sel < files.length;
  }

  async _loadExecTestFiles() {
    this._execTestFiles    = 'loading';
    this._execTestSelected = new Set();
    if (!this._unitTestFolder || !this._activeLayer) { this._execTestFiles = []; return; }
    try {
      const exts = (await detectProjectExtensions(this._activeLayer.folder_path)) ?? inferExtensions(this._activeLayer.setup_instructions);
      this._execTestFiles = await window.shell.listFiles(this._unitTestFolder, exts) ?? [];
    } catch {
      this._execTestFiles = null;
    }
  }

  _rerenderExecTestList() {
    const list = this.container.querySelector('#tgExecTestFileList');
    if (list) list.innerHTML = this._execTestFilesListHtml();
    list?.querySelectorAll('input[data-indeterminate]').forEach(cb => { cb.indeterminate = true; });
    this._updateExecTestFileCount();
    this._execUpdateSelBtn();
  }

  _updateExecTestFileCount() {
    const el = this.container.querySelector('#tgExecTestFileCount');
    const total = Array.isArray(this._execTestFiles) ? this._execTestFiles.length : 0;
    if (el) el.textContent = `${this._execTestSelected.size} / ${Math.min(total, 200)}`;
  }

  _execRightHtml() {
    const hasCmd    = this._execCommands.length > 0;
    const detecting = this._execDetecting;
    const selCount  = this._execTestSelected.size;
    const overLimit = selCount > 20;

    // Effective command: detected selection OR manual entry
    const effectiveCmd = hasCmd
      ? (this._execCmd?.cmd ?? '')
      : this._execManualCmd.trim();
    const canRun    = !!effectiveCmd && !this._execRunning;
    const canRunSel = selCount > 0 && !overLimit && canRun && !!this._unitTestFolder.trim();

    const cmdOptions = this._execCommands.map(c =>
      `<option value="${escHtml(c.id)}" ${this._execCmd?.id === c.id ? 'selected' : ''}>${escHtml(c.label)}</option>`
    ).join('');

    const fw = this._execCmd?.framework ?? this._execCommands[0]?.framework ?? '';

    const manualBlock = !hasCmd && !detecting ? `
      <div class="tg-exec-manual" id="tgExecManualWrap">
        <span class="tg-exec-manual-label">Enter test command manually:</span>
        <div class="tg-exec-manual-row">
          <input class="tg-exec-manual-input" id="tgExecManualInput"
                 value="${escHtml(this._execManualCmd)}"
                 placeholder="e.g. npx vitest run"
                 spellcheck="false"
                 ${this._execRunning ? 'disabled' : ''}/>
          <button class="tg-btn tg-btn--sm tg-btn--primary" id="tgExecRunManual"
            ${!this._execManualCmd.trim() || this._execRunning ? 'disabled' : ''}>▶ Run</button>
          <button class="tg-btn tg-btn--sm tg-btn--stop" id="tgExecStopManual"
            ${this._execRunning ? '' : 'hidden'}>■ Stop</button>
        </div>
        <p class="tg-exec-manual-hint">Could not auto-detect a test command for this project. Enter a command and click Run.</p>
      </div>` : '';

    return `
      <div class="tg-exec" id="tgExecSection">
        ${detecting ? `<div class="tg-exec-detecting"><span class="tg-exec-detecting-spinner"></span>Detecting test framework…</div>` : `
        <div class="tg-exec-bar">
          ${fw ? `<span class="tg-exec-fw">${escHtml(fw)}</span>` : ''}
          ${hasCmd ? `
          <select class="tg-exec-cmd-sel" id="tgExecCmdSel" ${this._execRunning ? 'disabled' : ''}>
            ${cmdOptions}
          </select>
          <button class="tg-btn tg-btn--sm tg-btn--primary" id="tgExecRun"
            ${this._execRunning ? 'disabled' : ''}>▶ Run All</button>
          <button class="tg-btn tg-btn--sm tg-btn--highlight" id="tgExecRunSel"
            ${!canRunSel ? 'disabled' : ''}
            title="${overLimit ? `Max 20 files — ${selCount} selected` : selCount === 0 ? 'Select files from the tree' : ''}">
            ▶ Run Selected${selCount > 0 ? ` (${selCount})` : ''}
          </button>
          <button class="tg-btn tg-btn--sm tg-btn--stop" id="tgExecStop"
            ${this._execRunning ? '' : 'hidden'}>■ Stop</button>
          ` : ''}
        </div>`}
        ${manualBlock}
        ${overLimit ? `<div class="tg-exec-limit-msg">Max 20 files for targeted run — ${selCount} selected. Deselect some or use Run All.</div>` : ''}
        <div class="tg-exec-output-wrap" id="tgExecOutputWrap">
          <pre class="tg-exec-output" id="tgExecOutput"></pre>
        </div>
        ${this._execBannerHtml()}
      </div>`;
  }

  _execBannerHtml() {
    if (!this._execResult) return '';
    if (this._execResult.failed === 0) {
      return `
        <div class="tg-exec-banner tg-exec-banner--pass">
          <span>✓ All tests passed${this._execResult.passed ? ` (${this._execResult.passed})` : ''}</span>
        </div>`;
    }
    return `
      <div class="tg-exec-banner tg-exec-banner--fail">
        <span>${this._execResult.failed} test${this._execResult.failed !== 1 ? 's' : ''} failed</span>
        <div class="tg-exec-banner__actions">
          <button class="tg-btn tg-btn--sm tg-btn--danger" id="tgExecCreateIssue">Create Issue</button>
          <button class="tg-btn tg-btn--sm" id="tgExecDismissBanner">Dismiss</button>
        </div>
      </div>`;
  }

  async _switchMode(mode) {
    if (this._mode === mode) return;
    this._mode = mode;
    this.container.querySelector('#tgModeGenerate')?.classList.toggle('tg-mode-btn--active', mode === 'generate');
    this.container.querySelector('#tgModeExecute')?.classList.toggle('tg-mode-btn--active',  mode === 'execute');

    // Execute has its own left panel (real test files on disk, not the source
    // tree), so the whole main area — not just the right split — needs to swap.
    const main = this.container.querySelector('#tgMain');
    if (mode === 'execute') {
      if (main) main.innerHTML = this._mainHtml();
      await this._loadExecTestFiles();
      if (main) main.innerHTML = this._mainHtml();
      this._execRestoreOutput();
      if (this._activeLayer && !this._execCommands.length && !this._execDetecting) this._loadExecCommands();
    } else {
      if (main) main.innerHTML = this._mainHtml();
      this._genSyncRight();
    }
  }

  _execRestoreOutput() {
    const out  = this.container.querySelector('#tgExecOutput');
    const wrap = this.container.querySelector('#tgExecOutputWrap');
    if (out && this._execOutput) out.textContent = this._execOutput;
    if (wrap && this._execOutput)  wrap.scrollTop = wrap.scrollHeight;
  }

  async _loadExecCommands() {
    if (!this._activeLayer?.folder_path) return;
    this._execDetecting = true;
    if (this._mode === 'execute') this._execRefreshRight();
    this._execCommands = await window.db.testRunner.detect(this._activeLayer.folder_path);
    this._execCmd      = this._execCommands[0] ?? null;
    this._execDetecting = false;
    if (this._mode === 'execute') this._execRefreshRight();
  }

  _execRefreshRight() {
    const right = this.container.querySelector('#tgSplitRight');
    if (right) {
      right.innerHTML = this._execRightHtml();
      this._execRestoreOutput();
    }
  }

  async _execStart(selectedOnly = false, overrideCmd = null) {
    if (this._execRunning || !this._activeLayer?.folder_path) return;
    let command;
    let framework = null;
    let coverageRequested = false;
    if (overrideCmd) {
      command = overrideCmd;
    } else if (selectedOnly) {
      if (!this._execCmd) return;
      command = this._buildSelectedFilesCmd();
      framework = this._execCmd.framework ?? null;
    } else {
      command   = this._execCmd?.cmd ?? this._execManualCmd.trim();
      framework = this._execCmd?.framework ?? null;
      if (framework) {
        const withCoverage = this._withCoverageFlag(command, framework);
        coverageRequested = withCoverage !== command;
        command = withCoverage;
      }
    }
    if (!command) return;
    this._execOutput          = '';
    this._execResult          = null;
    this._execRunFramework    = framework;
    this._execRunCommand      = command;
    this._execRunCoverageReq  = coverageRequested;
    this._execRunStartedAt    = Date.now();
    this._execSetRunning(true);
    const out = this.container.querySelector('#tgExecOutput');
    if (out) out.textContent = '';
    window.db.testRunner.removeListeners();
    window.db.testRunner.onData(({ text }) => this._execAppend(text));
    window.db.testRunner.onDone(({ exitCode }) => this._execDone(exitCode));
    await window.db.testRunner.run({ command, cwd: this._activeLayer.folder_path });
  }

  // Appends the coverage flag appropriate to a detected framework, only for
  // frameworks where the resulting output can actually be parsed back into a
  // number (see _parseCoverage / _readFlutterLcovCoverage). Frameworks whose
  // coverage requires project-side config (Angular/Karma reporters, .NET
  // XPlat/coverlet XML, RSpec's SimpleCov) are left untouched — the flag alone
  // wouldn't reliably produce something we can read back.
  _withCoverageFlag(cmd, framework) {
    if (/--coverage\b|--cov\b|-cover\b/i.test(cmd)) return cmd; // already requests coverage
    switch (framework) {
      case 'Flutter':          return `${cmd} --coverage`;
      case 'pytest':           return `${cmd} --cov --cov-report=term-missing`;
      case 'Go':               return cmd.replace(/\bgo test\b/, 'go test -cover');
      case 'Jest':             return `${cmd} --coverage`;
      case 'Vitest':
      case 'Nuxt / Vitest':    return `${cmd} --coverage`;
      default:                 return cmd;
    }
  }

  // Uses the REAL test file paths selected from disk (_execTestSelected) —
  // no naming-convention guessing, since a generated test's actual name/location
  // can differ from what _computeTestPath() would predict (custom naming, model
  // deviation, hand-written tests, etc.).
  _buildSelectedFilesCmd() {
    if (!this._unitTestFolder) return null;
    const root      = this._unitTestFolder.replace(/\\/g, '/');
    const testPaths = [...this._execTestSelected]
      .map(f => `${root}/${f}`.replace(/\\/g, '/'))
      .map(p => `"${p}"`);
    if (!testPaths.length) return null;
    const files = testPaths.join(' ');
    const fw    = this._execCmd.framework ?? '';
    const base  = this._execCmd.cmd;
    if (fw === 'Flutter') return `flutter test ${files}`;
    if (fw === '.NET') {
      const names  = testPaths.map(p => p.replace(/"/g, '').split('/').pop().replace(/\.[^.]+$/, ''));
      const filter = names.map(n => `FullyQualifiedName~${n}`).join('|');
      return `${base} --filter "${filter}"`;
    }
    // Jest / Node / Angular — append paths after existing flags
    return `${base} ${files}`;
  }

  _execStop() {
    if (!this._execRunning) return;
    window.db.testRunner.kill();
    window.db.testRunner.removeListeners();
    this._execSetRunning(false);
  }

  _execUpdateSelBtn() {
    if (this._mode !== 'execute') return;
    const btn = this.container.querySelector('#tgExecRunSel');
    if (!btn) return;
    const n        = this._execTestSelected.size;
    const over     = n > 20;
    const canRun   = n > 0 && !over && !!this._execCmd && !this._execRunning && !!this._unitTestFolder.trim();
    btn.disabled   = !canRun;
    btn.hidden     = false;
    btn.textContent = `▶ Run Selected${n > 0 ? ` (${n})` : ''}`;
    btn.title       = over ? `Max 20 files — ${n} selected` : n === 0 ? 'Select files from the tree' : '';

    const section = this.container.querySelector('#tgExecSection');
    if (!section) return;
    const msg = section.querySelector('.tg-exec-limit-msg');
    if (over && !msg) {
      section.querySelector('.tg-exec-output-wrap')
        ?.insertAdjacentHTML('beforebegin', `<div class="tg-exec-limit-msg">Max 20 files for targeted run — ${n} selected. Deselect some or use Run All.</div>`);
    } else if (!over && msg) {
      msg.remove();
    } else if (over && msg) {
      msg.textContent = `Max 20 files for targeted run — ${n} selected. Deselect some or use Run All.`;
    }
  }

  _execSetRunning(running) {
    this._execRunning = running;
    const run       = this.container.querySelector('#tgExecRun');
    const runSel    = this.container.querySelector('#tgExecRunSel');
    const stop      = this.container.querySelector('#tgExecStop');
    const sel       = this.container.querySelector('#tgExecCmdSel');
    const runManual = this.container.querySelector('#tgExecRunManual');
    const stopManual= this.container.querySelector('#tgExecStopManual');
    const manualIn  = this.container.querySelector('#tgExecManualInput');
    if (run)       { run.hidden    = running; run.disabled    = running; }
    if (runSel)    { runSel.hidden = running; runSel.disabled = running; }
    if (stop)        stop.hidden   = !running;
    if (sel)         sel.disabled  = running;
    if (runManual)   { runManual.hidden = running; runManual.disabled = running; }
    if (stopManual)    stopManual.hidden = !running;
    if (manualIn)    manualIn.disabled  = running;
  }

  _execAppend(text) {
    const clean = stripAnsi(text);
    this._execOutput += clean;
    const out  = this.container.querySelector('#tgExecOutput');
    const wrap = this.container.querySelector('#tgExecOutputWrap');
    if (out)  out.textContent += clean;
    if (wrap) wrap.scrollTop   = wrap.scrollHeight;
  }

  async _execDone(exitCode) {
    window.db.testRunner.removeListeners();
    this._execSetRunning(false);
    const parsed      = this._parseTestResult(this._execOutput);
    this._execResult  = parsed ?? { failed: exitCode !== 0 ? 1 : 0, passed: 0 };
    const section = this.container.querySelector('#tgExecSection');
    if (section) {
      section.querySelector('.tg-exec-banner')?.remove();
      section.insertAdjacentHTML('beforeend', this._execBannerHtml());
    }
    await this._saveTestRunHistory(exitCode, this._execResult);
  }

  async _saveTestRunHistory(exitCode, result) {
    if (!this._activeLayer) return;
    let coverage = this._parseCoverage(this._execOutput, this._execRunFramework);
    if (coverage == null && this._execRunFramework === 'Flutter' && this._execRunCoverageReq) {
      coverage = await this._readFlutterLcovCoverage();
    }
    const duration = this._execRunStartedAt ? this._genFmt(Date.now() - this._execRunStartedAt) : null;
    await window.db.testRunHistory.create({
      project_id: this._activeLayer.project_id,
      layer_id:   this._activeLayer.id,
      framework:  this._execRunFramework,
      command:    this._execRunCommand,
      passed:     result?.passed  ?? null,
      failed:     result?.failed  ?? null,
      skipped:    null,
      duration,
      output:     this._execOutput.length > 20000 ? this._execOutput.slice(-20000) : this._execOutput,
      exit_code:  exitCode,
      coverage,
    }).catch(() => {});
  }

  _parseTestResult(output) {
    // Jest: "Tests: 2 failed, 8 passed, 10 total"
    const jest = output.match(/Tests:\s+(?:(\d+)\s+failed[^,\n]*,?\s*)?(?:(\d+)\s+passed)/i);
    if (jest) return { failed: parseInt(jest[1] || 0), passed: parseInt(jest[2] || 0) };
    // Flutter: "+8 -2: ..."
    const flutter = output.match(/\+(\d+)\s+-(\d+):/);
    if (flutter) return { failed: parseInt(flutter[2]), passed: parseInt(flutter[1]) };
    // .NET: "Failed: 2, Passed: 8"
    const dotnet = output.match(/Failed:\s*(\d+).*?Passed:\s*(\d+)/is);
    if (dotnet) return { failed: parseInt(dotnet[1]), passed: parseInt(dotnet[2]) };
    // Angular/Karma: "X SUCCESS" or "FAILED"
    const karma = output.match(/Executed (\d+) of \d+ (SUCCESS|FAILED)/i);
    if (karma) return { failed: karma[2] === 'FAILED' ? 1 : 0, passed: parseInt(karma[1]) };
    return null;
  }

  // Overall coverage %, parsed from the console summary a framework's
  // coverage flag prints (see _withCoverageFlag). Frameworks whose coverage
  // isn't reliably console-parseable (Angular/Karma, .NET, RSpec) return null
  // here — the command was never modified to request coverage for them.
  _parseCoverage(output, framework) {
    if (!framework) return null;
    if (framework === 'Jest' || framework === 'Vitest' || framework === 'Nuxt / Vitest') {
      // Jest/Vitest coverage table: "All files |   82.35 |    66.67 | ..."
      const m = output.match(/All files\s*\|\s*([\d.]+)/i);
      return m ? parseFloat(m[1]) : null;
    }
    if (framework === 'pytest') {
      // pytest-cov term report: "TOTAL    120   20   83%"
      const m = output.match(/^TOTAL\s+.*?(\d+)%/im);
      return m ? parseFloat(m[1]) : null;
    }
    if (framework === 'Go') {
      // "ok  example.com/pkg  0.003s  coverage: 82.4% of statements" — one line per package
      const matches = [...output.matchAll(/coverage:\s*([\d.]+)%\s+of statements/g)];
      if (!matches.length) return null;
      const nums = matches.map(m => parseFloat(m[1]));
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    }
    return null;
  }

  // Flutter prints no coverage summary to console — `flutter test --coverage`
  // just writes coverage/lcov.info. Sum the LCOV LH:/LF: markers ourselves.
  async _readFlutterLcovCoverage() {
    try {
      const lcovPath = `${this._activeLayer.folder_path.replace(/\\/g, '/')}/coverage/lcov.info`;
      const content  = await window.shell.readFile(lcovPath);
      if (!content) return null;
      let hit = 0, found = 0;
      for (const line of content.split('\n')) {
        if (line.startsWith('LH:')) hit   += parseInt(line.slice(3), 10) || 0;
        if (line.startsWith('LF:')) found += parseInt(line.slice(3), 10) || 0;
      }
      return found > 0 ? (hit / found) * 100 : null;
    } catch {
      return null;
    }
  }

  _extractFailureSummary(output) {
    const lines = output.split('\n');
    return lines.slice(Math.max(0, lines.length - 60)).join('\n').trim();
  }

  async _execCreateIssue() {
    if (!this._execResult || this._execResult.failed === 0) return;
    const btn = this.container.querySelector('#tgExecCreateIssue');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
    await window.db.issues.create({
      project_id:  this._projectId,
      layer_id:    this._activeLayer?.id ?? null,
      title:       `Test failures — ${this._activeLayer?.name ?? 'Layer'}`,
      description: this._extractFailureSummary(this._execOutput),
      severity:    'high',
      status:      'open',
    });
    const banner = this.container.querySelector('.tg-exec-banner');
    if (banner) {
      banner.className  = 'tg-exec-banner tg-exec-banner--pass';
      banner.innerHTML  = '<span>✓ Issue created</span>';
    }
  }

  _execDismissBanner() {
    this._execResult = null;
    this.container.querySelector('.tg-exec-banner')?.remove();
  }

  _unitSectionHtml() {
    const selectedCount   = this._unitSelected.size;
    const totalCount      = this._unitFiles.length;
    const folderHintClass = this._unitTestFolder ? 'tg-folder-hint' : 'tg-folder-hint tg-folder-hint--warn';
    const folderHintText  = this._unitTestFolder ? '' : 'No test folder — click Browse or type a path.';

    return `
      <div class="tg-split" id="tgUnitSection">

        <!-- LEFT: always visible -->
        <div class="tg-split-left">
          <div class="tg-file-picker-toolbar">
            <button class="tg-btn tg-btn--sm" id="tgUnitSelectAll">All</button>
            <button class="tg-btn tg-btn--sm" id="tgUnitClear">Clear</button>
            ${this._logicFiles.size > 0
              ? `<button class="tg-btn tg-btn--sm tg-btn--outline" id="tgUnitSelectLogic" title="Select files likely containing business logic">★ Logic (${this._logicFiles.size})</button>`
              : ''}
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

        <!-- RIGHT: swaps on mode toggle -->
        <div class="tg-split-right" id="tgSplitRight">
          ${this._mode === 'execute' ? this._execRightHtml() : this._genRightHtml()}
        </div>

      </div>`;
  }

  _genFilesHtml() {
    // During / after generation: show progress with status chips
    if (this._genProgress.length > 0) {
      const CHIP = { pending: 'Pending', generating: 'Generating', saved: 'Saved', error: 'Error' };
      return this._genProgress.map((item, i) => {
        const active = i === this._genSelIdx ? 'tg-gen-item--active' : '';
        const elapsed = item.status === 'generating'
          ? `<span class="tg-gen-item-elapsed" id="tgGenItemElapsed"></span>`
          : '';
        return `
          <div class="tg-gen-item tg-gen-item--${item.status} ${active}" data-gen-idx="${i}">
            <span class="tg-gen-chip tg-gen-chip--${item.status}">${CHIP[item.status] ?? item.status}</span>
            <span class="tg-gen-item-name" title="${escHtml(item.relPath)}">${escHtml(item.label)}</span>
            ${elapsed}
          </div>`;
      }).join('');
    }

    // Idle: mirror current selection
    if (!this._unitSelected.size) return '';
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

    // Group files by immediate parent folder
    const groups = new Map();
    for (const filePath of capped) {
      const rel       = filePath.replace(/\\/g, '/');
      const lastSlash = rel.lastIndexOf('/');
      const dir       = lastSlash >= 0 ? rel.slice(0, lastSlash) : '';
      if (dir.split('/').some(seg => seg.startsWith('.'))) continue;
      if (!groups.has(dir)) groups.set(dir, []);
      groups.get(dir).push(filePath);
    }

    // Root first, then alphabetical
    const sorted = [...groups.entries()].sort((a, b) => {
      if (!a[0]) return -1;
      if (!b[0]) return 1;
      return a[0].localeCompare(b[0]);
    });

    const folderIcon = `<svg class="tg-group-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;

    const groupsHtml = sorted.map(([dir, files]) => {
      const allSel  = files.every(f => this._unitSelected.has(f));
      const someSel = !allSel && files.some(f => this._unitSelected.has(f));
      const label   = dir || '(root)';

      const filesHtml = files
        .slice().sort((a, b) => a.localeCompare(b))
        .map(filePath => {
          const fileName  = filePath.replace(/\\/g, '/').split('/').pop();
          const checked   = this._unitSelected.has(filePath);
          const isStale   = this._staleFiles.has(filePath);
          const testedDot = this._testedFiles.has(filePath)
            ? (isStale
                ? `<span class="tg-tree-tested-dot tg-tree-tested-dot--stale" title="Source changed since last test generation — regenerate to update"></span>`
                : `<span class="tg-tree-tested-dot" title="Test file exists"></span>`)
            : '';
          const logicBadge = this._logicFiles.has(filePath)
            ? `<span class="tg-tree-logic-badge" title="Likely contains business logic — good candidate for unit tests">★</span>`
            : '';
          return `
            <label class="tg-flat-row">
              <input type="checkbox" data-file="${escHtml(filePath)}" ${checked ? 'checked' : ''}/>
              <span class="tg-flat-name">${escHtml(fileName)}</span>
              ${logicBadge}
              ${testedDot}
            </label>`;
        }).join('');

      return `
        <div class="tg-group">
          <div class="tg-group-header">
            <input type="checkbox" data-folder="${escHtml(dir)}"
                   ${allSel ? 'checked' : ''} ${someSel ? 'data-indeterminate' : ''}/>
            ${folderIcon}
            <span class="tg-group-name" title="${escHtml(dir || '/')}">${escHtml(label)}</span>
            <span class="tg-group-count">${files.length}</span>
          </div>
          <div class="tg-group-files">${filesHtml}</div>
        </div>`;
    }).join('');

    const extra  = this._unitFiles.length - capped.length;
    const notice = extra > 0
      ? `<div class="tg-file-list--notice">Showing first 200 files. Narrow the layer's folder to reduce results.</div>`
      : '';
    return groupsHtml + notice;
  }

  _getFilesInDir(dir) {
    if (!Array.isArray(this._unitFiles)) return [];
    return this._unitFiles.filter(f => {
      const rel       = f.replace(/\\/g, '/');
      const lastSlash = rel.lastIndexOf('/');
      const fileDir   = lastSlash >= 0 ? rel.slice(0, lastSlash) : '';
      return fileDir === dir;
    });
  }

  _updateGroupCheckbox(filePath) {
    const list = this.container.querySelector('#tgUnitFileList');
    if (!list) return;
    const rel       = filePath.replace(/\\/g, '/');
    const lastSlash = rel.lastIndexOf('/');
    const dir       = lastSlash >= 0 ? rel.slice(0, lastSlash) : '';
    const cb        = list.querySelector(`input[data-folder="${CSS.escape(dir)}"]`);
    if (!cb) return;
    const files = this._getFilesInDir(dir);
    const sel   = files.filter(f => this._unitSelected.has(f)).length;
    cb.checked       = files.length > 0 && sel === files.length;
    cb.indeterminate = sel > 0 && sel < files.length;
  }

  _applyIndeterminateStates() {
    const list = this.container.querySelector('#tgUnitFileList');
    if (!list) return;
    list.querySelectorAll('input[data-indeterminate]').forEach(cb => {
      cb.indeterminate = true;
    });
  }


  // ─── Events ──────────────────────────────────────────────────
  _bindEvents() {
    this.container.querySelector('#tgBtnBack')
      .addEventListener('click', () => this.router.navigate('project-home', { projectId: this._projectId }));

    // Git panel toggle
    this.container.querySelector('#tgBtnGitToggle')
      ?.addEventListener('click', () => {
        this._gitPanelVisible = !this._gitPanelVisible;
        const panel = this.container.querySelector('#tgGitPanel');
        panel?.toggleAttribute('hidden', !this._gitPanelVisible);
        this.container.querySelector('#tgBtnGitToggle')
          ?.classList.toggle('tg-git-toggle-btn--active', this._gitPanelVisible);
        if (this._gitPanelVisible) this._refreshGitPanel();
      });

    this.container.querySelector('#tgBtnGitClose')
      ?.addEventListener('click', () => {
        this._gitPanelVisible = false;
        this.container.querySelector('#tgGitPanel')?.setAttribute('hidden', '');
        this.container.querySelector('#tgBtnGitToggle')?.classList.remove('tg-git-toggle-btn--active');
      });

    this.container.querySelector('#tgBtnGitCommit')
      ?.addEventListener('click', () => this._commitChanges());

    this.container.querySelector('#tgBtnGitRefresh')
      ?.addEventListener('click', () => this._refreshGitPanel());
    this.container.querySelector('#tgBtnGitExpandAll')
      ?.addEventListener('click', () => this._expandCollapseAll(true));
    this.container.querySelector('#tgBtnGitCollapseAll')
      ?.addEventListener('click', () => this._expandCollapseAll(false));

    this.container.querySelector('#tgSidebarToggle')
      ?.addEventListener('click', () => this._toggleSidebar());

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
      if (e.target.id === 'tgExecCmdSel') {
        this._execCmd = this._execCommands.find(c => c.id === e.target.value) ?? null;
        return;
      }
      if (e.target.dataset.execFile !== undefined) {
        const f = e.target.dataset.execFile;
        e.target.checked ? this._execTestSelected.add(f) : this._execTestSelected.delete(f);
        this._updateExecGroupCheckbox(f);
        this._updateExecTestFileCount();
        this._execUpdateSelBtn();
        return;
      }
      if (e.target.dataset.execFolder !== undefined) {
        const fp    = e.target.dataset.execFolder;
        const files = this._getExecFilesInDir(fp);
        files.forEach(f => e.target.checked ? this._execTestSelected.add(f) : this._execTestSelected.delete(f));
        const list  = this.container.querySelector('#tgExecTestFileList');
        if (list) files.forEach(f => {
          const cb = list.querySelector(`input[data-exec-file="${CSS.escape(f)}"]`);
          if (cb) cb.checked = e.target.checked;
        });
        this._updateExecTestFileCount();
        this._execUpdateSelBtn();
        return;
      }
      if (e.target.dataset.file !== undefined) {
        const f = e.target.dataset.file;
        e.target.checked ? this._unitSelected.add(f) : this._unitSelected.delete(f);
        this._updateGroupCheckbox(f);
        this._updateUnitFileCount();
        this._syncGenerateBtns();
        this._execUpdateSelBtn();
        return;
      }
      if (e.target.dataset.folder !== undefined) {
        const fp    = e.target.dataset.folder;
        const files = this._getFilesInDir(fp);
        files.forEach(f => e.target.checked ? this._unitSelected.add(f) : this._unitSelected.delete(f));
        const list  = this.container.querySelector('#tgUnitFileList');
        if (list) files.forEach(f => {
          const cb = list.querySelector(`input[data-file="${CSS.escape(f)}"]`);
          if (cb) cb.checked = e.target.checked;
        });
        this._updateUnitFileCount();
        this._syncGenerateBtns();
        this._execUpdateSelBtn();
      }
    });

    this.container.addEventListener('click', e => {
      // Header toggle — not inside #tgMain so must come first
      if (e.target.id === 'tgModeGenerate')      { this._switchMode('generate');   return; }
      if (e.target.id === 'tgModeExecute')        { this._switchMode('execute');    return; }

      if (!e.target.closest('#tgMain')) return;
      if (e.target.id === 'tgUnitSelectAll') { this._unitFiles.slice(0, 200).forEach(f => this._unitSelected.add(f)); this._rerenderFileList(); return; }
      if (e.target.id === 'tgUnitClear')     { this._unitSelected.clear(); this._rerenderFileList(); return; }
      if (e.target.id === 'tgUnitSelectLogic') { this._logicFiles.forEach(f => this._unitSelected.add(f)); this._rerenderFileList(); return; }
      if (e.target.id === 'tgExecTestSelectAll') {
        (Array.isArray(this._execTestFiles) ? this._execTestFiles : []).slice(0, 200).forEach(f => this._execTestSelected.add(f));
        this._rerenderExecTestList();
        return;
      }
      if (e.target.id === 'tgExecTestClear') { this._execTestSelected.clear(); this._rerenderExecTestList(); return; }
      if (e.target.id === 'tgExecTestRefresh') { this._loadExecTestFiles().then(() => this._rerenderExecTestList()); return; }
      if (e.target.id === 'tgGenRunAll')         { this._genRunAll();              return; }
      if (e.target.id === 'tgGenRegenStale')     { this._regenerateStale();        return; }
      if (e.target.id === 'tgGenStop')           { this._genStop();                return; }
      if (e.target.id === 'tgExecRun')           { this._execStart(false);                                      return; }
      if (e.target.id === 'tgExecRunSel')        { this._execStart(true);                                       return; }
      if (e.target.id === 'tgExecStop')          { this._execStop();                                            return; }
      if (e.target.id === 'tgExecRunManual')     { this._execStart(false, this._execManualCmd.trim());          return; }
      if (e.target.id === 'tgExecStopManual')    { this._execStop();                                            return; }
      if (e.target.id === 'tgExecCreateIssue')   { this._execCreateIssue();        return; }
      if (e.target.id === 'tgExecDismissBanner') { this._execDismissBanner();      return; }
      if (e.target.id === 'tgBrowseTestFolder')  { this._browseTestFolder();       return; }
    });

    this.container.addEventListener('input', e => {
      if (!e.target.closest('#tgMain')) return;
      if (e.target.id === 'tgUnitTestFolder') {
        this._unitTestFolder = e.target.value;
        if (this._activeLayer) localStorage.setItem(`devflow_testfolder_${this._activeLayer.id}`, e.target.value);
      }
      if (e.target.id === 'tgExecManualInput') {
        this._execManualCmd = e.target.value;
        if (this._activeLayer) localStorage.setItem(`devflow_execcmd_${this._activeLayer.id}`, e.target.value);
        const btn = this.container.querySelector('#tgExecRunManual');
        if (btn) btn.disabled = !e.target.value.trim() || this._execRunning;
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
    this._staleFiles  = new Set();
    if (!this._unitTestFolder || !Array.isArray(this._unitFiles)) return;

    const statusRows = this._activeLayer
      ? await window.db.testGenStatus.listByLayer(this._activeLayer.id).catch(() => [])
      : [];
    const statusByFile = new Map(statusRows.map(r => [r.file_path, r]));

    const filesToHash = [];
    await Promise.all(
      this._unitFiles.slice(0, 200).map(async f => {
        const testPath = this._computeTestPath(f);
        if (!testPath) return;
        const stat = await window.shell.statFile(testPath).catch(() => null);
        if (!stat) return;
        this._testedFiles.add(f);
        // Only worth re-hashing files that have a recorded baseline to compare against.
        if (statusByFile.get(f)?.source_hash) filesToHash.push(f);
      })
    );

    if (filesToHash.length) {
      const hashes = await this._gitHashObjectBatch(filesToHash);
      filesToHash.forEach((f, idx) => {
        const currentHash = hashes[idx];
        const storedHash  = statusByFile.get(f)?.source_hash;
        if (currentHash && storedHash && currentHash !== storedHash) this._staleFiles.add(f);
      });
    }
  }

  // Runs `git hash-object` once for a batch of files (one process spawn instead of
  // one per file) — output is one hash per line, in the same order as the input.
  async _gitHashObjectBatch(relPaths) {
    if (!relPaths.length || !this._activeLayer?.folder_path) return [];
    const cwd    = this._activeLayer.folder_path;
    const quoted = relPaths.map(p => `"${p.replace(/\\/g, '/')}"`).join(' ');
    try {
      const r = await window.db.terminal.exec({ command: `git hash-object -- ${quoted}`, cwd });
      return (r?.stdout || '').split('\n').map(l => l.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  // Scores each candidate file's content for branching constructs to flag
  // likely business logic — see LOGIC_* constants near the top of this file.
  async _detectLogicFiles() {
    this._logicFiles = new Set();
    if (!Array.isArray(this._unitFiles) || !this._activeLayer?.folder_path) return;

    const candidates = this._unitFiles.slice(0, 200).filter(f => !isLikelyDataOrPresentationFile(f));
    await Promise.all(
      candidates.map(async f => {
        const absPath = `${this._activeLayer.folder_path}/${f}`;
        const content = await window.shell.readFile(absPath).catch(() => null);
        if (!content) return;
        const matches = content.match(LOGIC_BRANCH_RE);
        if (matches && matches.length >= LOGIC_MIN_BRANCH_COUNT) this._logicFiles.add(f);
      })
    );
  }

  _toggleSidebar() {
    this._sidebarCollapsed = !this._sidebarCollapsed;
    const sidebar = this.container.querySelector('.tg-sidebar');
    const btn     = this.container.querySelector('#tgSidebarToggle');
    sidebar?.classList.toggle('tg-sidebar--collapsed', this._sidebarCollapsed);
    if (btn) btn.setAttribute('aria-label', this._sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
  }

  // ─── Layer selection ─────────────────────────────────────────
  async _selectLayer(layer) {
    this._activeLayer      = layer;
    this._unitFiles        = 'loading';
    this._unitSelected     = new Set();
    this._execCommands     = [];
    this._execCmd          = null;
    this._execOutput       = '';
    this._execResult       = null;
    this._execDetecting    = false;
    this._execManualCmd    = localStorage.getItem(`devflow_execcmd_${layer.id}`) || '';
    this._execTestFiles    = 'loading';
    this._execTestSelected = new Set();
    this._projectCtxCache  = null;

    const savedFolder      = localStorage.getItem(`devflow_testfolder_${layer.id}`);
    this._unitTestFolder   = savedFolder || inferDefaultTestFolder(layer);

    this._rerenderSidebar();
    this.container.querySelector('#tgMain').innerHTML = this._mainHtml();

    const exts = (await detectProjectExtensions(layer.folder_path)) ?? inferExtensions(layer.setup_instructions);
    this._unitFiles = await window.shell.listFiles(layer.folder_path, exts);
    const tasks = [this._checkExistingTests(), this._detectLogicFiles()];
    if (this._mode === 'execute') tasks.push(this._loadExecTestFiles());
    await Promise.all(tasks);

    this.container.querySelector('#tgMain').innerHTML = this._mainHtml();
    this._applyIndeterminateStates();
    this._loadExecCommands();
  }

  // ─── File list helpers ────────────────────────────────────────
  _rerenderFileList() {
    const list = this.container.querySelector('#tgUnitFileList');
    if (list) {
      list.innerHTML = this._unitFilesListHtml();
      this._applyIndeterminateStates();
    }
    this._updateUnitFileCount();
    if (this._mode === 'execute') {
      if (!this._execRunning) {
        const right = this.container.querySelector('#tgSplitRight');
        if (right) { right.innerHTML = this._execRightHtml(); this._execRestoreOutput(); }
      }
    } else {
      if (!this._genRunning) this._genProgress = [];
      this._genSyncRight();
    }
  }

  _updateUnitFileCount() {
    const el = this.container.querySelector('#tgUnitFileCount');
    if (el) el.textContent = `${this._unitSelected.size} / ${Math.min(this._unitFiles.length, 200)}`;
  }

  // ─── Right-panel sync ─────────────────────────────────────────
  _genSyncRight() {
    this._genRefreshFiles();
    this._genSyncControls();
    this._syncRegenStaleBtn();
    const statusEl = this.container.querySelector('#tgGenStatus');
    if (statusEl && !this._genRunning && !this._genProgress.length) {
      const n = this._unitSelected.size;
      statusEl.textContent = n > 0 ? `${n} file${n !== 1 ? 's' : ''} ready` : 'Select files from the tree to begin';
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

  _syncRegenStaleBtn() {
    const controls   = this.container.querySelector('.tg-gen-controls');
    if (!controls) return;
    let btn          = this.container.querySelector('#tgGenRegenStale');
    const staleCount = this._staleFiles.size;
    if (staleCount > 0) {
      if (!btn) {
        controls.insertAdjacentHTML('afterbegin',
          `<button class="tg-btn tg-btn--sm tg-btn--outline" id="tgGenRegenStale" title="Select and regenerate tests whose source file changed since last generation">↻ Regenerate outdated (${staleCount})</button>`);
      } else {
        btn.textContent = `↻ Regenerate outdated (${staleCount})`;
      }
    } else if (btn) {
      btn.remove();
    }
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
    const regen  = this.container.querySelector('#tgGenRegenStale');
    const tree   = this.container.querySelector('#tgUnitFileList');
    if (running) {
      if (runAll) { runAll.hidden = true;  runAll.disabled = true; }
      if (regen)    regen.disabled = true;
      if (stop)     stop.hidden  = false;
      if (tree)     tree.style.pointerEvents = 'none';
    } else {
      if (runAll) { runAll.hidden = false; }
      if (regen)    regen.disabled = false;
      if (stop)     stop.hidden  = true;
      if (tree)     tree.style.pointerEvents = '';
      this._genSyncControls();
      this._syncRegenStaleBtn();
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
    this._genUpdateCurFile(null);
    this._setRunningUI(false);
    this._genShowDone();
  }

  _regenerateStale() {
    if (this._genRunning || !this._staleFiles.size) return;
    this._unitSelected = new Set(this._staleFiles);
    this._rerenderFileList();
    this._genRunAll();
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
    this._genUpdateCurFile(null);
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
    this._genSelIdx = i;
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

      const outPath = this._computeTestPath(item.relPath);
      if (!outPath) { this._genSetStatus(i, 'error', '', 'No test folder set'); return; }

      // Gather project config context once per layer (cached)
      if (!this._projectCtxCache) this._projectCtxCache = await this._gatherProjectContext();

      const prompt = this._buildUnitPrompt(item.relPath, src, outPath, this._projectCtxCache);

      const raw  = await this._streamGenItem(prompt);
      const code = stripCodeFences(raw);

      if (this._genAborted) { this._genSetStatus(i, 'pending'); return; }

      const ok = await window.shell.writeFile(outPath, code);
      if (ok) {
        window.shell.notifyTestFileSaved();
        const [sourceHash] = await this._gitHashObjectBatch([item.relPath]);
        await window.db.testGenStatus.upsert({
          project_id:     this._activeLayer.project_id,
          layer_id:       this._activeLayer.id,
          file_path:      item.relPath,
          test_file_path: outPath,
          source_hash:    sourceHash || null,
        }).catch(() => {});
        this._testedFiles.add(item.relPath);
        this._staleFiles.delete(item.relPath);
      }
      this._genSetStatus(i, ok ? 'saved' : 'error', outPath, ok ? '' : 'Write failed');
    } catch (err) {
      this._genSetStatus(i, this._genAborted ? 'pending' : 'error', '', err.message || 'Failed');
    } finally {
      this._genClearTimer();
    }
  }

  async _gatherProjectContext() {
    const root    = this._activeLayer.folder_path.replace(/\\/g, '/');
    const tryRead = async (name) => {
      const raw = await window.shell.readFile(`${root}/${name}`).catch(() => null);
      if (!raw) return null;
      return { name, content: raw.length > 3000 ? raw.slice(0, 3000) + '\n// [truncated]' : raw };
    };

    const candidates = await Promise.all([
      tryRead('tsconfig.json'),
      tryRead('tsconfig.app.json'),
      tryRead('vitest.config.ts'),
      tryRead('vitest.config.js'),
      tryRead('vitest.config.mjs'),
      tryRead('jest.config.ts'),
      tryRead('jest.config.js'),
      tryRead('jest.config.cjs'),
      tryRead('nuxt.config.ts'),
      tryRead('nuxt.config.js'),
    ]);

    return candidates.filter(Boolean);
  }

  _relativeImportPath(fromAbsFile, toAbsFile) {
    const norm  = p => p.replace(/\\/g, '/');
    const from  = norm(fromAbsFile).split('/').slice(0, -1); // dir of test file
    const to    = norm(toAbsFile).split('/');

    let common = 0;
    while (common < from.length && common < to.length && from[common] === to[common]) common++;

    const ups  = from.length - common;
    const down = to.slice(common).join('/');
    const rel  = (ups === 0 ? './' : '../'.repeat(ups)) + down;
    return rel;
  }

  _extractImports(src) {
    const lines = [];
    const seen  = new Set();
    const push  = (line) => { if (!seen.has(line)) { seen.add(line); lines.push(line); } };

    // static import / export … from
    for (const m of src.matchAll(/^(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm))
      push(m[0].trim());
    // side-effect imports
    for (const m of src.matchAll(/^import\s+['"]([^'"]+)['"]/gm))
      push(m[0].trim());
    // require()
    for (const m of src.matchAll(/\brequire\(['"]([^'"]+)['"]\)/g))
      push(m[0].trim());
    // defineAsyncComponent / dynamic import()
    for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g))
      push(m[0].trim());

    return lines.slice(0, 40); // cap to avoid bloating the prompt
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
      window.app.testGenChat.generate({ prompt, model: this._modelCfg, cwd: this._activeLayer?.folder_path });
    });
  }

  _buildUnitPrompt(relPath, content, outPath, projectCtx = []) {
    const l       = this._activeLayer;
    const root    = l.folder_path.replace(/\\/g, '/');
    const srcAbs  = `${root}/${relPath.replace(/\\/g, '/')}`;
    const testAbs = (outPath || '').replace(/\\/g, '/');

    // Relative path from the test file to the source file (for the import statement)
    const relImport = testAbs ? this._relativeImportPath(testAbs, srcAbs) : `./${relPath.replace(/\\/g, '/')}`;

    // Extract what the source file already imports (so model knows what to mock)
    const srcImports = this._extractImports(content);
    const importsSection = srcImports.length
      ? `\n## Source File Imports (what the source already imports — mock these in tests)\n${srcImports.map(l => `  ${l}`).join('\n')}`
      : '';

    // Config files (tsconfig paths, vitest/jest setup, nuxt aliases)
    const configSection = projectCtx.length
      ? `\n## Project Config Files\n${projectCtx.map(c => `### ${c.name}\n\`\`\`\n${c.content}\n\`\`\``).join('\n\n')}`
      : '';

    return `You are an expert software engineer writing unit tests.

## Tech Stack & Layer Context
${l.setup_instructions || '(no setup instructions provided)'}

## Layer: ${l.name}
Project root: ${root}

## File Paths
- Source file (relative to project root): ${relPath.replace(/\\/g, '/')}
- Test file will be saved at: ${testAbs}
- Relative import from test file to source: \`${relImport}\`
${configSection}${importsSection}

## Source File: ${relPath.replace(/\\/g, '/')}
\`\`\`
${content}
\`\`\`

## Task
Generate comprehensive unit tests using the testing framework implied by the tech stack above.
- Cover: happy paths, edge cases, error conditions, boundary values
- Use describe() blocks to group related tests
- Each test should have a clear, descriptive name
- Mock external dependencies (DB, HTTP, filesystem, stores, composables) where appropriate
- Do not test implementation details — test observable behaviour and contracts
- CRITICAL: Import the source file with exactly this path: \`${relImport}\`
- CRITICAL: For all other imports, check the tsconfig/vitest config above for path aliases (e.g. \`@/\`, \`~/\`, \`#imports\`). Use aliases where the project uses them rather than long relative paths.
- CRITICAL: Do NOT invent module paths — if you are unsure of an import, mock it or use the alias from the config.
- CRITICAL: Every single test must be fully implemented — real setup, a real call into the source code, and real assertions (expect/assert) that check actual values. Never write a test whose body is empty, a comment, a TODO, or a description of what the test "should" do instead of doing it.
- CRITICAL: Do not use pending/skipped/todo test markers (it.todo, it.skip, xit, @Disabled, pytest.mark.skip, etc.) — every listed test case must be a complete, runnable test.
- If you are unsure how to exercise a particular branch without more context, still write your best real attempt at it rather than a placeholder — an imperfect concrete assertion is more useful than a stub.
- CRITICAL: Wrap the entire test file in a single fenced code block (triple backticks). Put NOTHING else outside that fence — no explanation, no preamble, no summary of what you did. If your tooling prints its own narration or tool-call log, that is fine as long as the complete, final file content is inside exactly one fenced code block somewhere in your output.

Output ONLY the fenced code block containing the test file content. Start the block directly with import or require statements.`;
  }

  // ─── Generate view DOM helpers ────────────────────────────────
  _genSetStatus(i, status, outPath = '', errMsg = '') {
    if (!this._genProgress[i]) return;
    this._genProgress[i] = { ...this._genProgress[i], status, outPath, errMsg };
    this._genRefreshFiles();
  }

  _genRefreshFiles() {
    const el = this.container.querySelector('#tgGenItems');
    if (!el) return;
    el.innerHTML = this._genFilesHtml();
    if (this._genRunning) {
      el.querySelector('.tg-gen-item--active')?.scrollIntoView({ block: 'nearest' });
    }
  }

  _genUpdateCurFile(label) {
    const hd      = this.container.querySelector('#tgGenOutputHd');
    const el      = this.container.querySelector('#tgGenCurFile');
    const elapsed = this.container.querySelector('#tgGenElapsed');
    if (hd) hd.hidden = !label;
    if (el) el.textContent = label || '';
    if (!label && elapsed) elapsed.textContent = '';
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
    const tick = () => {
      if (!this._genStartTime) return;
      const text = this._genFmt(Date.now() - this._genStartTime);
      const el = this.container.querySelector('#tgGenElapsed');
      if (el) el.textContent = text;
      const itemEl = this.container.querySelector('#tgGenItemElapsed');
      if (itemEl) itemEl.textContent = text;
    };
    tick();
    this._genTimerInt = setInterval(tick, 500);
  }

  _genClearTimer() {
    if (this._genTimerInt) { clearInterval(this._genTimerInt); this._genTimerInt = null; }
    this._genStartTime = null;
  }

  _genFmt(ms) {
    const s = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  async _browseTestFolder() {
    const chosen = await window.db.dialog.openFolder({ defaultPath: this._activeLayer?.folder_path });
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

  // ─── Git panel ────────────────────────────────────────────────

  _getGitCwd() {
    return this._project?.project_path || null;
  }

  _startGitPolling() {
    this._stopGitPolling();
    this._refreshGitPanel();
    this._gitPollInterval = setInterval(() => this._refreshGitPanel(), 5000);
  }

  _stopGitPolling() {
    if (this._gitPollInterval) { clearInterval(this._gitPollInterval); this._gitPollInterval = null; }
  }

  async _refreshGitPanel() {
    const cwd         = this._getGitCwd();
    const wrap        = this.container.querySelector('#tgGitAccordion');
    const headerBadge = this.container.querySelector('#tgGitBadge');
    const panelBadge  = this.container.querySelector('#tgGitPanelBadge');
    const commitBtn   = this.container.querySelector('#tgBtnGitCommit');
    if (!cwd || !wrap) return;

    const _updateBadges = (count) => {
      if (headerBadge) { headerBadge.textContent = String(count); headerBadge.hidden = count === 0; }
      if (panelBadge)  { panelBadge.textContent  = String(count); panelBadge.hidden  = count === 0; }
      if (commitBtn && !commitBtn.classList.contains('tg-git-commit-btn--busy')) {
        commitBtn.disabled = count === 0;
      }
    };

    try {
      const r     = await window.db.terminal.exec({ command: 'git status --short -uall 2>&1', cwd });
      const files = this._parseGitStatus(r.stdout || '');

      const noChange = files.length === this._gitFiles.length &&
        files.every((f, i) => f.file === this._gitFiles[i]?.file && f.statusType === this._gitFiles[i]?.statusType);

      if (noChange && wrap.querySelector('.git-accordion__item')) {
        _updateBadges(files.length);
        return;
      }

      this._gitFiles = files;
      _updateBadges(files.length);
      if (this._gitPanelVisible) await this._renderGitAccordion(files, cwd);
    } catch {
      if (wrap) wrap.innerHTML = '<div class="git-diff-empty">Not a git repository.</div>';
    }
  }

  async _renderGitAccordion(files, cwd) {
    const wrap = this.container.querySelector('#tgGitAccordion');
    if (!wrap) return;
    if (files.length === 0) {
      wrap.innerHTML = '<div class="git-diff-empty">Working tree is clean.</div>';
      return;
    }

    wrap.innerHTML = files.map((f, i) => {
      const expanded = this._gitExpandedFiles.has(f.file);
      return `
        <div class="git-accordion__item${expanded ? '' : ' git-accordion__item--collapsed'}" data-idx="${i}">
          <button class="git-accordion__header" data-idx="${i}" aria-expanded="${expanded}" data-file="${escHtml(f.file)}">
            <span class="git-diff-file__status git-diff-file__status--${f.statusType}">${f.statusType}</span>
            <span class="git-accordion__filename">${escHtml(f.file)}</span>
            <svg class="git-accordion__chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="git-accordion__body" id="tgGdBody${i}" data-loaded="false">
            ${expanded ? '<div class="git-diff-empty" style="padding:8px 14px">Loading diff…</div>' : ''}
          </div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('.git-accordion__header').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx      = parseInt(btn.dataset.idx);
        const file     = btn.dataset.file;
        const body     = wrap.querySelector(`#tgGdBody${idx}`);
        const item     = wrap.querySelector(`.git-accordion__item[data-idx="${idx}"]`);
        const expanded = btn.getAttribute('aria-expanded') === 'true';

        btn.setAttribute('aria-expanded', String(!expanded));
        item.classList.toggle('git-accordion__item--collapsed', expanded);

        if (!expanded) {
          this._gitExpandedFiles.add(file);
          if (body && body.dataset.loaded !== 'true') {
            body.innerHTML = '<div class="git-diff-empty" style="padding:8px 14px">Loading diff…</div>';
            const fileInfo = files[idx];
            if (fileInfo) this._loadGitDiffInto(fileInfo, idx, cwd);
          }
        } else {
          this._gitExpandedFiles.delete(file);
        }
      });
    });

    const toLoad = files.map((f, i) => ({ f, i })).filter(({ f }) => this._gitExpandedFiles.has(f.file));
    if (toLoad.length > 0) {
      await Promise.all(toLoad.map(({ f, i }) => this._loadGitDiffInto(f, i, cwd)));
    }
  }

  async _loadGitDiffInto(fileInfo, idx, cwd) {
    const body = this.container.querySelector(`#tgGdBody${idx}`);
    if (!body) return;
    try {
      let diffText = '';
      if (fileInfo.statusType === 'U') {
        const r = await window.db.terminal.exec({
          command: `Get-Content -Raw -Encoding UTF8 "${fileInfo.file}" 2>&1`,
          cwd,
        });
        const content    = (r.stdout || '').replace(/\r\n/g, '\n');
        const addedLines = content.split('\n').map(l => `+${l}`).join('\n');
        diffText = `@@ -0,0 +1 @@\n${addedLines}`;
      } else {
        const r1 = await window.db.terminal.exec({ command: `git diff HEAD -- "${fileInfo.file}" 2>&1`, cwd });
        diffText = (r1.stdout || '').trim();
        if (!diffText) {
          const r2 = await window.db.terminal.exec({ command: `git diff --cached -- "${fileInfo.file}" 2>&1`, cwd });
          diffText = (r2.stdout || '').trim();
        }
      }
      body.innerHTML = this._renderGitDiffBody(diffText);
      body.dataset.loaded = 'true';
    } catch {
      body.innerHTML = '<div class="git-diff-error">Failed to load diff.</div>';
    }
  }

  _expandCollapseAll(expand) {
    const cwd  = this._getGitCwd();
    const wrap = this.container.querySelector('#tgGitAccordion');
    if (!wrap || !cwd) return;
    wrap.querySelectorAll('.git-accordion__item').forEach((item, idx) => {
      const btn  = item.querySelector('.git-accordion__header');
      const body = item.querySelector('.git-accordion__body');
      const file = btn?.dataset.file;
      if (!btn || !body || !file) return;
      btn.setAttribute('aria-expanded', String(expand));
      item.classList.toggle('git-accordion__item--collapsed', !expand);
      if (expand) {
        this._gitExpandedFiles.add(file);
        if (body.dataset.loaded !== 'true') {
          body.innerHTML = '<div class="git-diff-empty" style="padding:8px 14px">Loading diff…</div>';
          const fileInfo = this._gitFiles[idx];
          if (fileInfo) this._loadGitDiffInto(fileInfo, idx, cwd);
        }
      } else {
        this._gitExpandedFiles.delete(file);
      }
    });
  }

  async _commitChanges() {
    const msgEl = this.container.querySelector('#tgGitCommitMsg');
    const btn   = this.container.querySelector('#tgBtnGitCommit');
    const cwd   = this._getGitCwd();
    if (!cwd || !msgEl) return;

    const msg = msgEl.value.trim();
    if (!msg || this._gitFiles.length === 0) return;

    btn?.classList.add('tg-git-commit-btn--busy');
    if (btn) btn.disabled = true;

    try {
      const safeMsg = msg.replace(/'/g, "''");
      const r = await window.db.terminal.exec({
        command: `git add -A 2>&1; git commit -m '${safeMsg}' 2>&1`,
        cwd,
      });
      if (r.exitCode === 0 || (r.stdout || '').includes('master') || (r.stdout || '').includes('main') || (r.stdout || '').includes('HEAD')) {
        this._gitExpandedFiles.clear();
        if (msgEl) msgEl.value = '';
      }
      await this._refreshGitPanel();
    } catch {
      await this._refreshGitPanel();
    } finally {
      btn?.classList.remove('tg-git-commit-btn--busy');
    }
  }

  _parseGitStatus(output) {
    return output.split('\n')
      .filter(l => /^[ MADRCU?!]{2} .+/.test(l))
      .map(line => {
        const xy   = line.substring(0, 2);
        const file = line.substring(3).trim().replace(/^"(.*)"$/, '$1');
        let statusType;
        if (xy.includes('?'))      statusType = 'U';
        else if (xy.includes('A')) statusType = 'A';
        else if (xy.includes('D')) statusType = 'D';
        else if (xy.includes('R')) statusType = 'R';
        else                       statusType = 'M';
        return { xy, statusType, file };
      });
  }

  _renderGitDiffBody(diffText) {
    const esc = escHtml;
    if (!diffText || !diffText.trim()) return '<div class="git-diff-empty">No diff available.</div>';

    let html = '<table class="git-diff-table"><tbody>';
    let oldLine = 0, newLine = 0;

    for (const raw of diffText.split('\n')) {
      if (/^(diff --git|index |--- |\+\+\+ |Binary |new file|deleted file|old mode|new mode|rename )/.test(raw)) continue;

      if (raw.startsWith('@@')) {
        const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
        if (m) {
          oldLine = parseInt(m[1]);
          newLine = parseInt(m[2]);
          const hunkHeader = raw.match(/@@ [^@]+ @@/)?.[0] || raw;
          const ctx = m[3] ? esc(m[3].trim()) : '';
          html += `<tr class="gd-row gd-row--hunk"><td class="gd-ln"></td><td class="gd-ln"></td><td class="gd-code">${esc(hunkHeader)}${ctx ? ` <span class="gd-hunk-ctx">${ctx}</span>` : ''}</td></tr>`;
        }
        continue;
      }

      if (raw.startsWith('-')) {
        html += `<tr class="gd-row gd-row--del"><td class="gd-ln gd-ln--del">${oldLine++}</td><td class="gd-ln"></td><td class="gd-code gd-code--del"><span class="gd-sign">&#x2212;</span>${esc(raw.slice(1))}</td></tr>`;
      } else if (raw.startsWith('+')) {
        html += `<tr class="gd-row gd-row--add"><td class="gd-ln"></td><td class="gd-ln gd-ln--add">${newLine++}</td><td class="gd-code gd-code--add"><span class="gd-sign">+</span>${esc(raw.slice(1))}</td></tr>`;
      } else if (raw.startsWith(' ')) {
        html += `<tr class="gd-row gd-row--ctx"><td class="gd-ln">${oldLine++}</td><td class="gd-ln">${newLine++}</td><td class="gd-code">${esc(raw.slice(1))}</td></tr>`;
      } else if (raw.startsWith('\\')) {
        html += `<tr class="gd-row gd-row--meta"><td class="gd-ln"></td><td class="gd-ln"></td><td class="gd-code gd-code--meta">${esc(raw)}</td></tr>`;
      }
    }

    html += '</tbody></table>';
    return html;
  }

}
