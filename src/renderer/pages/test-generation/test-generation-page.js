import { escHtml, injectCss } from '../../shared/helpers.js';
import { applyStoredTheme }   from '../../shared/theme-manager.js';

// ── Helpers (duplicated from test-generator so the window is self-contained) ─
function inferTestFileExt(setupInstructions) {
  const s = (setupInstructions || '').toLowerCase();
  if (s.includes('flutter') || s.includes('dart'))   return 'dart';
  if (s.includes('python'))                           return 'py';
  if (s.includes('.net') || s.includes('c#'))        return 'cs';
  if (s.includes('typescript') || s.includes('.ts')) return 'ts';
  return 'js';
}

function computeTestFilePath(relPath, testFolder, ext) {
  const rel        = relPath.replace(/\\/g, '/');
  const withoutExt = rel.replace(/\.[^/.]+$/, '');
  return testFolder.replace(/\\/g, '/') + '/' + withoutExt + '.test.' + ext;
}

const STATUS_ICON = { pending: '○', generating: '…', saved: '✓', error: '✗' };

export class TestGenerationPage {
  constructor(container) {
    this.container = container;

    this._layer      = null;
    this._files      = [];
    this._testFolder = '';
    this._modelCfg   = null;
    this._ext        = 'js';

    this._progress   = [];   // [{relPath, status, outPath, errMsg}]
    this._running    = false;
    this._aborted    = false;
    this._liveCode   = '';
    this._currentIdx = -1;
  }

  mount() {
    injectCss('pages/test-generation/test-generation-page.css');
    applyStoredTheme();

    this.container.innerHTML = this._waitingTemplate();

    window.app.testGenerationWindow.onInit(data => this._onInit(data));
  }

  // ─── Init ─────────────────────────────────────────────────────
  _onInit({ layer, files, testFolder, modelCfg }) {
    this._layer      = layer;
    this._files      = files || [];
    this._testFolder = testFolder || '';
    this._modelCfg   = modelCfg;
    this._ext        = inferTestFileExt(layer?.setup_instructions);

    this._progress   = this._files.map(f => ({ relPath: f, status: 'pending', outPath: '', errMsg: '' }));
    this._running    = false;
    this._aborted    = false;
    this._liveCode   = '';
    this._currentIdx = -1;

    this.container.innerHTML = this._template();
    this._bindEvents();
  }

  // ─── Templates ────────────────────────────────────────────────
  _waitingTemplate() {
    return `
      <div class="tgw-waiting">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.2" opacity=".35">
          <path d="M9 3h6M9 3v9l-4 6h14l-4-6V3"/>
        </svg>
        <span>Waiting for test generation to start…</span>
      </div>`;
  }

  _template() {
    const name  = this._layer?.name ?? 'Layer';
    const total = this._files.length;
    return `
      <header class="tgw-header">
        <div class="tgw-header-info">
          <div class="tgw-title">Generating Unit Tests · ${escHtml(name)}</div>
          <div class="tgw-subtitle">${escHtml(this._testFolder)}</div>
        </div>
        <span class="tgw-progress-pill" id="tgwPill">0 / ${total}</span>
      </header>

      <div class="tgw-body">
        <div class="tgw-file-list" id="tgwFileList">
          ${this._fileListHtml()}
        </div>

        <div class="tgw-main">
          <div class="tgw-current-label">Currently generating</div>
          <div class="tgw-current-file" id="tgwCurrentFile">—</div>
          <div class="tgw-code-wrap" id="tgwCodeWrap">
            <pre class="tgw-code" id="tgwCode"></pre>
          </div>
        </div>
      </div>

      <footer class="tgw-footer">
        <span class="tgw-footer-status" id="tgwStatus">Ready — ${total} file${total !== 1 ? 's' : ''} selected</span>
        <button class="tgw-btn tgw-btn--primary" id="tgwStart">Start Generation</button>
        <button class="tgw-btn tgw-btn--danger" id="tgwCancel" style="display:none">Cancel</button>
      </footer>`;
  }

  _fileListHtml() {
    return this._progress.map((item, i) => {
      const icon   = STATUS_ICON[item.status] ?? '○';
      const active = i === this._currentIdx ? 'tgw-file-item--active' : '';
      const name   = item.relPath.split('/').pop();
      return `
        <div class="tgw-file-item tgw-file-item--${item.status} ${active}">
          <span class="tgw-file-icon tgw-file-icon--${item.status}">${icon}</span>
          <span class="tgw-file-name" title="${escHtml(item.relPath)}">${escHtml(name)}</span>
        </div>`;
    }).join('');
  }

  // ─── Event binding ─────────────────────────────────────────────
  _bindEvents() {
    this.container.querySelector('#tgwStart')
      ?.addEventListener('click', () => this._begin());
    this.container.querySelector('#tgwCancel')
      ?.addEventListener('click', () => this._cancel());
  }

  _begin() {
    const startBtn  = this.container.querySelector('#tgwStart');
    const cancelBtn = this.container.querySelector('#tgwCancel');
    if (startBtn)  startBtn.style.display  = 'none';
    if (cancelBtn) cancelBtn.style.display = '';
    this._startGeneration();
  }

  // ─── Generation loop ──────────────────────────────────────────
  async _startGeneration() {
    if (!this._files.length) {
      this._setDone(0, 0);
      return;
    }

    this._running = true;
    this._aborted = false;

    for (let i = 0; i < this._progress.length; i++) {
      if (this._aborted) break;

      this._currentIdx = i;
      this._liveCode   = '';
      this._setFileStatus(i, 'generating');
      this._setCurrentFile(this._progress[i].relPath);
      this._updateStatus(`Generating ${i + 1} of ${this._progress.length}…`);

      const absPath = `${this._layer.folder_path}/${this._progress[i].relPath}`;
      let content   = await window.shell.readFile(absPath);
      if (content === null) {
        this._setFileStatus(i, 'error', '', 'Could not read file');
        continue;
      }
      if (content.length > 8000) content = content.slice(0, 8000) + '\n// [truncated]';

      const prompt = this._buildPrompt(this._progress[i].relPath, content);

      let code;
      try {
        code = await this._streamFile(prompt);
      } catch (err) {
        this._setFileStatus(i, 'error', '', err.message || 'Generation failed');
        continue;
      }

      if (this._aborted) break;

      const outPath = computeTestFilePath(this._progress[i].relPath, this._testFolder, this._ext);
      const ok      = await window.shell.writeFile(outPath, code);
      this._setFileStatus(i, ok ? 'saved' : 'error', outPath, ok ? '' : 'Write failed — check permissions');
    }

    this._running    = false;
    this._currentIdx = -1;
    const saved  = this._progress.filter(p => p.status === 'saved').length;
    const errors = this._progress.filter(p => p.status === 'error').length;
    this._setDone(saved, errors);
  }

  _buildPrompt(relPath, content) {
    const l = this._layer;
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

  _streamFile(prompt) {
    return new Promise((resolve, reject) => {
      let code = '';
      window.app.testGenChat.offAll();
      window.app.testGenChat.onToken(({ text }) => {
        code += text;
        this._liveCode = code;
        const pre = this.container.querySelector('#tgwCode');
        if (pre) { pre.textContent = code; }
        const wrap = this.container.querySelector('#tgwCodeWrap');
        if (wrap) wrap.scrollTop = wrap.scrollHeight;
      });
      window.app.testGenChat.onDone(({ error }) => {
        window.app.testGenChat.offAll();
        if (error) reject(new Error(error));
        else resolve(code);
      });
      window.app.testGenChat.generate({ prompt, model: this._modelCfg });
    });
  }

  // ─── DOM helpers ──────────────────────────────────────────────
  _setFileStatus(index, status, outPath = '', errMsg = '') {
    if (!this._progress[index]) return;
    this._progress[index] = { ...this._progress[index], status, outPath, errMsg };

    const listEl = this.container.querySelector('#tgwFileList');
    if (listEl) listEl.innerHTML = this._fileListHtml();

    const saved = this._progress.filter(p => p.status === 'saved').length;
    const pill  = this.container.querySelector('#tgwPill');
    if (pill) pill.textContent = `${saved} / ${this._progress.length}`;
  }

  _setCurrentFile(relPath) {
    const el = this.container.querySelector('#tgwCurrentFile');
    if (el) el.textContent = relPath || '—';
    const pre = this.container.querySelector('#tgwCode');
    if (pre) pre.textContent = '';
  }

  _updateStatus(text) {
    const el = this.container.querySelector('#tgwStatus');
    if (el) { el.textContent = text; el.className = 'tgw-footer-status'; }
  }

  _setDone(saved, errors) {
    const total   = this._progress.length;
    const pill    = this.container.querySelector('#tgwPill');
    const status  = this.container.querySelector('#tgwStatus');
    const cancelBtn = this.container.querySelector('#tgwCancel');
    const current = this.container.querySelector('#tgwCurrentFile');

    if (pill)   { pill.textContent = `${saved} / ${total}`; pill.classList.add('tgw-progress-pill--done'); }
    if (current) current.textContent = '—';

    const aborted = this._aborted;
    if (status) {
      if (aborted) {
        status.textContent = 'Cancelled.';
        status.className   = 'tgw-footer-status tgw-footer-status--error';
      } else if (errors > 0) {
        status.textContent = `Done — ${saved} saved, ${errors} error${errors > 1 ? 's' : ''}.`;
        status.className   = 'tgw-footer-status tgw-footer-status--error';
      } else {
        status.textContent = `All ${saved} test file${saved !== 1 ? 's' : ''} saved successfully.`;
        status.className   = 'tgw-footer-status tgw-footer-status--done';
      }
    }
    if (cancelBtn) { cancelBtn.textContent = 'Close'; cancelBtn.className = 'tgw-btn'; }
  }

  // ─── Cancel ───────────────────────────────────────────────────
  _cancel() {
    if (!this._running) {
      window.close();
      return;
    }
    this._aborted = true;
    this._running = false;
    window.app.testGenChat.cancel();
    window.app.testGenChat.offAll();
  }
}
