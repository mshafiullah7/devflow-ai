import { escHtml, injectCss } from '../../shared/helpers.js';
import { applyStoredTheme }   from '../../shared/theme-manager.js';

// ── Helpers ───────────────────────────────────────────────────────
// pattern: 'dot-test' → name.test.ext  (JS/TS default)
//          'spec'     → name.spec.ext  (Angular, Vue)
//          'underscore'→ name_test.ext (Flutter, Go)
//          'prefix'   → test_name.ext  (Python/pytest)
//          'suffix'   → nameTests.ext  (.NET)
const TEST_NAMING = {
  flutter:    { ext: 'dart', pattern: 'underscore' },
  python:     { ext: 'py',   pattern: 'prefix'     },
  go:         { ext: 'go',   pattern: 'underscore' },
  ruby:       { ext: 'rb',   pattern: 'spec'       },
  angular:    { ext: 'ts',   pattern: 'spec'       },
  vue:        { ext: 'ts',   pattern: 'spec'       },
  dotnet:     { ext: 'cs',   pattern: 'suffix'     },
  typescript: { ext: 'ts',   pattern: 'dot-test'   },
  default:    { ext: 'js',   pattern: 'dot-test'   },
};

function inferTestNaming(setupInstructions) {
  const s = (setupInstructions || '').toLowerCase();
  if (s.includes('flutter') || s.includes('dart'))                       return TEST_NAMING.flutter;
  if (s.includes('python') || s.includes('pytest') || s.includes('pip')) return TEST_NAMING.python;
  if (s.includes('golang') || /\bgo\b/.test(s))                          return TEST_NAMING.go;
  if (s.includes('ruby') || s.includes('rspec') || s.includes('rails'))  return TEST_NAMING.ruby;
  if (s.includes('.net') || s.includes('c#') || s.includes('dotnet'))    return TEST_NAMING.dotnet;
  if (s.includes('angular'))                                              return TEST_NAMING.angular;
  if (s.includes('vue') || s.includes('vuejs'))                          return TEST_NAMING.vue;
  if (s.includes('typescript') || s.includes('.ts'))                     return TEST_NAMING.typescript;
  return TEST_NAMING.default;
}

function inferE2eFramework(setupInstructions) {
  const s = (setupInstructions || '').toLowerCase();
  return s.includes('cypress') ? 'Cypress' : 'Playwright';
}

function computeUnitTestPath(relPath, testFolder, naming) {
  const rel       = relPath.replace(/\\/g, '/');
  const lastSlash = rel.lastIndexOf('/');
  const dir       = lastSlash >= 0 ? rel.slice(0, lastSlash) : '';
  const fileName  = lastSlash >= 0 ? rel.slice(lastSlash + 1) : rel;
  const baseName  = fileName.replace(/\.[^/.]+$/, '');

  let testFileName;
  switch (naming.pattern) {
    case 'prefix':      testFileName = 'test_'   + baseName + '.' + naming.ext; break;
    case 'underscore':  testFileName = baseName  + '_test.'  + naming.ext; break;
    case 'spec':        testFileName = baseName  + '.spec.'  + naming.ext; break;
    case 'suffix':      testFileName = baseName  + 'Tests.'  + naming.ext; break;
    default:            testFileName = baseName  + '.test.'  + naming.ext; break;
  }

  const testRel = dir ? dir + '/' + testFileName : testFileName;
  return testFolder.replace(/\\/g, '/') + '/' + testRel;
}

function computeE2eTestPath(title, testFolder, ext) {
  const slug = (title || 'mockup')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return testFolder.replace(/\\/g, '/') + '/' + slug + '.e2e.spec.' + ext;
}

function stripHtmlText(html, maxLen = 800) {
  const text = (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

function stripCodeFences(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  const firstNewline = trimmed.indexOf('\n');
  if (firstNewline === -1) return trimmed;
  const inner = trimmed.slice(firstNewline + 1);
  return inner.endsWith('```') ? inner.slice(0, -3).trimEnd() : inner;
}

// ─────────────────────────────────────────────────────────────────
export class TestGenerationPage {
  constructor(container) {
    this.container = container;

    this._mode       = 'unit';   // 'unit' | 'e2e'
    this._layer      = null;
    this._testFolder = '';
    this._modelCfg   = null;
    this._naming     = TEST_NAMING.default;
    this._flowDesc   = '';

    this._progress    = [];   // [{label, relPath?, mockup?, status, outPath, errMsg}]
    this._selectedIdx = null;
    this._running     = false;
    this._aborted     = false;
    this._liveCode    = '';
    this._currentIdx  = null;
    this._timerInt    = null;
    this._startTime   = null;
  }

  mount() {
    injectCss('pages/test-generation/test-generation-page.css');
    applyStoredTheme();

    this.container.innerHTML = this._waitingTemplate();
    window.app.testGenerationWindow.onInit(data => this._onInit(data));
  }

  // ─── Init ──────────────────────────────────────────────────────
  _onInit(data) {
    this._mode       = data.mode || 'unit';
    this._layer      = data.layer;
    this._testFolder = data.testFolder || '';
    this._modelCfg   = data.modelCfg;
    this._naming     = inferTestNaming(data.layer?.setup_instructions);
    this._flowDesc   = data.flowDesc || '';

    if (this._mode === 'unit') {
      this._progress = (data.files || []).map(relPath => ({
        label: relPath.replace(/\\/g, '/').split('/').pop(),
        relPath,
        status: 'pending', outPath: '', errMsg: '',
      }));
    } else {
      this._progress = (data.mockups || []).map(mockup => ({
        label:  mockup.title || `Mockup ${mockup.id}`,
        mockup,
        status: 'pending', outPath: '', errMsg: '',
      }));
    }

    this._selectedIdx = this._progress.length > 0 ? 0 : null;
    this._running     = false;
    this._aborted     = false;
    this._liveCode    = '';
    this._currentIdx  = null;
    this._clearTimer();

    this.container.innerHTML = this._template();
    this._bindEvents();
  }

  // ─── Templates ─────────────────────────────────────────────────
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
    const name      = this._layer?.name ?? 'Layer';
    const modeLabel = this._mode === 'e2e' ? 'E2E' : 'Unit';
    const sidebarHd = this._mode === 'e2e' ? 'Mockups' : 'Source Files';
    const total     = this._progress.length;

    return `
      <div class="tgw-page">
        <header class="tgw-header">
          <div class="tgw-header-info">
            <div class="tgw-title">${modeLabel} Tests · ${escHtml(name)}</div>
            <div class="tgw-subtitle">${escHtml(this._testFolder)}</div>
          </div>
          <div class="tgw-header-actions">
            <button class="tgw-btn tgw-btn--outline" id="tgwBtnRunSelected"
              ${this._selectedIdx === null ? 'disabled' : ''}>▶ Run Selected</button>
            <button class="tgw-btn tgw-btn--primary" id="tgwBtnRunAll"
              ${total === 0 ? 'disabled' : ''}>▶ Run All</button>
            <button class="tgw-btn tgw-btn--stop" id="tgwBtnStop" hidden>■ Stop</button>
          </div>
        </header>

        <div class="tgw-body">
          <aside class="tgw-sidebar">
            <div class="tgw-sidebar-hd">${sidebarHd}</div>
            <div class="tgw-item-list" id="tgwItemList">${this._itemListHtml()}</div>
          </aside>

          <section class="tgw-output-panel">
            <div class="tgw-output-header">
              <span class="tgw-output-item-name" id="tgwCurrentName">—</span>
              <span class="tgw-output-elapsed"   id="tgwElapsed"></span>
            </div>
            <div class="tgw-code-wrap" id="tgwCodeWrap">
              <pre class="tgw-code" id="tgwCode"></pre>
            </div>
          </section>
        </div>

        <footer class="tgw-footer">
          <span class="tgw-footer-status" id="tgwStatus">
            Ready — ${total} ${this._mode === 'e2e' ? 'mockup' : 'file'}${total !== 1 ? 's' : ''} selected
          </span>
          <span class="tgw-progress-pill" id="tgwPill">0 / ${total}</span>
        </footer>
      </div>`;
  }

  _itemListHtml() {
    const CHIP = {
      pending:    'Pending',
      generating: 'Generating',
      saved:      'Saved',
      error:      'Error',
    };
    return this._progress.map((item, i) => {
      const active = i === this._selectedIdx ? 'tgw-item-row--active' : '';
      return `
        <div class="tgw-item-row tgw-item-row--${item.status} ${active}" data-idx="${i}">
          <span class="tgw-status-chip tgw-status--${item.status}">${CHIP[item.status] ?? item.status}</span>
          <span class="tgw-item-name" title="${escHtml(item.relPath || item.label || '')}">${escHtml(item.label)}</span>
        </div>`;
    }).join('');
  }

  // ─── Event binding ──────────────────────────────────────────────
  _bindEvents() {
    this.container.querySelector('#tgwBtnRunAll')
      ?.addEventListener('click', () => this._runAll());
    this.container.querySelector('#tgwBtnRunSelected')
      ?.addEventListener('click', () => this._runSelected());
    this.container.querySelector('#tgwBtnStop')
      ?.addEventListener('click', () => this._stop());

    this.container.querySelector('#tgwItemList')
      ?.addEventListener('click', e => {
        if (this._running) return;
        const row = e.target.closest('[data-idx]');
        if (!row) return;
        this._selectedIdx = parseInt(row.dataset.idx, 10);
        this._refreshItemList();
        this._updateToolbar();
      });
  }

  // ─── Run All ────────────────────────────────────────────────────
  async _runAll() {
    if (this._running || !this._progress.length) return;
    this._running = true;
    this._aborted = false;
    this._updateToolbar();

    for (let i = 0; i < this._progress.length; i++) {
      if (this._aborted) break;
      if (this._progress[i].status !== 'pending') continue;
      await this._runItem(i);
    }

    this._running    = false;
    this._currentIdx = null;
    this._clearTimer();
    this._updateToolbar();
    this._showDoneSummary();
  }

  // ─── Run Selected ───────────────────────────────────────────────
  async _runSelected() {
    if (this._running || this._selectedIdx === null) return;
    const item = this._progress[this._selectedIdx];
    if (!item) return;
    if (item.status === 'saved') {
      this._updateStatus('Already saved.');
      return;
    }
    if (item.status === 'error') {
      item.status = 'pending';
    }
    this._running = true;
    this._aborted = false;
    this._updateToolbar();

    await this._runItem(this._selectedIdx);

    this._running    = false;
    this._currentIdx = null;
    this._clearTimer();
    this._updateToolbar();
    this._showDoneSummary();
  }

  // ─── Core item runner ───────────────────────────────────────────
  async _runItem(i) {
    this._currentIdx = i;
    this._liveCode   = '';
    this._setItemStatus(i, 'generating');
    this._updateCurrentItem(this._progress[i].label);
    this._updateStatus(`Generating ${i + 1} of ${this._progress.length}…`);
    this._startTimer();

    const pre = this.container.querySelector('#tgwCode');
    if (pre) pre.textContent = '';

    try {
      let prompt, outPath;

      if (this._mode === 'unit') {
        const absPath = `${this._layer.folder_path}/${this._progress[i].relPath}`;
        let src = await window.shell.readFile(absPath);
        if (src === null) {
          this._setItemStatus(i, 'error', '', 'Could not read file');
          return;
        }
        if (src.length > 8000) src = src.slice(0, 8000) + '\n// [truncated]';
        prompt  = this._buildUnitPrompt(this._progress[i].relPath, src);
        outPath = computeUnitTestPath(this._progress[i].relPath, this._testFolder, this._naming);
      } else {
        prompt  = this._buildE2ePrompt(this._progress[i].mockup);
        outPath = computeE2eTestPath(this._progress[i].mockup.title, this._testFolder, this._naming.ext);
      }

      const raw  = await this._streamItem(prompt);
      const code = stripCodeFences(raw);

      if (this._aborted) {
        this._setItemStatus(i, 'pending');
        return;
      }

      const ok = await window.shell.writeFile(outPath, code);
      if (ok) window.shell.notifyTestFileSaved();
      this._setItemStatus(i, ok ? 'saved' : 'error', outPath, ok ? '' : 'Write failed — check permissions');
    } catch (err) {
      this._setItemStatus(i, this._aborted ? 'pending' : 'error', '', err.message || 'Generation failed');
    }

    this._clearTimer();
  }

  // ─── Stop ───────────────────────────────────────────────────────
  _stop() {
    if (!this._running) return;
    this._aborted = true;
    this._running = false;
    window.app.testGenChat.cancel();
    window.app.testGenChat.offAll();
    this._progress.forEach(item => {
      if (item.status === 'generating') item.status = 'pending';
    });
    this._currentIdx = null;
    this._clearTimer();
    this._refreshItemList();
    this._updateToolbar();
    this._updateCurrentItem(null);
    this._updateStatus('Cancelled.');
  }

  // ─── Prompt builders ───────────────────────────────────────────
  _buildUnitPrompt(relPath, content) {
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

  _buildE2ePrompt(mockup) {
    const l         = this._layer;
    const framework = inferE2eFramework(l.setup_instructions);
    const mockupText = stripHtmlText(mockup.html_content || '', 800);
    return `You are an expert QA engineer writing end-to-end tests.

## Tech Stack & Layer Context
${l.setup_instructions || '(no setup instructions provided)'}

## Layer: ${l.name}

## UI Mockup: ${mockup.title || `Mockup ${mockup.id}`}
${mockupText}

## User Flow Description
${this._flowDesc || '(none provided — infer flows from the mockup above)'}

## Task
Generate ${framework} end-to-end tests for the screen shown in the mockup above.
- Use ${framework} syntax and best practices
- One describe() block for this screen
- Use accessible role selectors, data-testid, or text selectors
- Include: navigation flows, form submissions, error states, success confirmations
- Tests should be independent — no shared state between tests

Output ONLY the test file content. No explanation. Start directly with import statements.`;
  }

  // ─── Streaming ─────────────────────────────────────────────────
  _streamItem(prompt) {
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

  // ─── DOM helpers ───────────────────────────────────────────────
  _setItemStatus(index, status, outPath = '', errMsg = '') {
    if (!this._progress[index]) return;
    this._progress[index] = { ...this._progress[index], status, outPath, errMsg };
    this._refreshItemList();
  }

  _refreshItemList() {
    const el = this.container.querySelector('#tgwItemList');
    if (el) el.innerHTML = this._itemListHtml();

    const saved = this._progress.filter(p => p.status === 'saved').length;
    const pill  = this.container.querySelector('#tgwPill');
    if (pill) pill.textContent = `${saved} / ${this._progress.length}`;
  }

  _updateToolbar() {
    const runAll  = this.container.querySelector('#tgwBtnRunAll');
    const runSel  = this.container.querySelector('#tgwBtnRunSelected');
    const stop    = this.container.querySelector('#tgwBtnStop');

    if (this._running) {
      if (runAll)  { runAll.hidden  = true;  runAll.disabled  = true; }
      if (runSel)  { runSel.hidden  = true;  runSel.disabled  = true; }
      if (stop)    { stop.hidden    = false; }
    } else {
      if (runAll)  { runAll.hidden  = false; runAll.disabled  = this._progress.length === 0; }
      if (runSel)  { runSel.hidden  = false; runSel.disabled  = this._selectedIdx === null; }
      if (stop)    { stop.hidden    = true; }
    }
  }

  _updateCurrentItem(label) {
    const el = this.container.querySelector('#tgwCurrentName');
    if (el) el.textContent = label || '—';
    if (!label) {
      const elapsed = this.container.querySelector('#tgwElapsed');
      if (elapsed) elapsed.textContent = '';
    }
  }

  _updateStatus(text, variant = '') {
    const el = this.container.querySelector('#tgwStatus');
    if (!el) return;
    el.textContent = text;
    el.className   = `tgw-footer-status${variant ? ' tgw-footer-status--' + variant : ''}`;
  }

  _showDoneSummary() {
    const total  = this._progress.length;
    const saved  = this._progress.filter(p => p.status === 'saved').length;
    const errors = this._progress.filter(p => p.status === 'error').length;
    const pill   = this.container.querySelector('#tgwPill');

    if (pill) {
      pill.textContent = `${saved} / ${total}`;
      if (errors === 0 && saved > 0) pill.classList.add('tgw-progress-pill--done');
    }

    if (this._aborted) {
      this._updateStatus('Cancelled.', 'error');
    } else if (errors > 0) {
      this._updateStatus(`Done — ${saved} saved, ${errors} error${errors > 1 ? 's' : ''}.`, 'error');
    } else {
      const noun = this._mode === 'e2e' ? 'spec file' : 'test file';
      this._updateStatus(`All ${saved} ${noun}${saved !== 1 ? 's' : ''} saved successfully.`, 'done');
    }
  }

  // ─── Timer ─────────────────────────────────────────────────────
  _startTimer() {
    this._clearTimer();
    this._startTime = Date.now();
    this._timerInt  = setInterval(() => {
      const elapsed = this.container.querySelector('#tgwElapsed');
      if (elapsed && this._startTime) {
        elapsed.textContent = this._fmt(Date.now() - this._startTime);
      }
    }, 500);
  }

  _clearTimer() {
    if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
    this._startTime = null;
  }

  _fmt(ms) {
    const s = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  }
}
