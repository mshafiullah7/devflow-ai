import { escHtml, injectCss } from '../../shared/helpers.js';
import { applyStoredTheme }   from '../../shared/theme-manager.js';

const PROMPT_TEMPLATE = (screenSection, docsSection) => `You are an AI architect generating implementation workflows for AI-assisted development.

A workflow represents ONE feature implemented end-to-end across all relevant system layers.
Each workflow layer gets its own prompt that will be passed to an AI code generator.

## Inputs you are given:
- UI/UX mockup (HTML) — shows the screens and interactions
- Project manifest (YAML) — system layers, tech stack, conventions
- Architecture overview — how layers connect and why

${screenSection}

${docsSection}

## Your output format (JSON):

\`\`\`json
[{
  "workflow_id": "kebab-case-feature-name",
  "feature": "Human readable feature name",
  "screenId": "id for the selected screen",
  "description": "What this feature does in one sentence",
  "success_criteria": ["observable outcome 1", "observable outcome 2"],
  "layers": [
    {
      "layer": "layer name from manifest",
      "order": 1,
      "purpose": "what this layer does for this feature",
      "inputs": ["what it receives — from prior layer or user"],
      "outputs": ["what it produces — schema or contract"],
      "prompt": "Full AI codegen prompt for this layer. Must reference concrete inputs/outputs. Must be self-contained enough for an AI generator to act on without reading other layers."
    }
  ]
}]
\`\`\`

## Rules:
- Order layers by dependency (DB schema before service, service before gateway, gateway before UI)
- Only include layers the feature actually touches
- Each layer's prompt must cite the outputs of the previous layer explicitly
- success_criteria must be testable — no vague statements like "works correctly"
- Extract the API contract (routes, request/response shapes) from the UI interactions shown in the mockup
- One workflow per discrete feature — if the mockup shows two independent features, output two workflows
- Do not create unit tests or e2e tests. This will be generated in separate process`;

function extractTextPreview(html) {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stripAnsi(str) {
  return str
    .replace(/\x1B\[[0-9;]*[mGKHFJA-Za-z]/g, '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '');
}

function parseWorkflowJson(text) {
  const clean = stripAnsi(text);
  let candidate = null;

  // Try fenced code block first
  const fenced = clean.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) candidate = fenced[1].trim();

  // Fallback: find outermost [ ... ]
  if (!candidate) {
    const start = clean.indexOf('[');
    const end   = clean.lastIndexOf(']');
    if (start >= 0 && end > start) candidate = clean.slice(start, end + 1);
  }

  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0].feature === 'string') {
      return parsed;
    }
  } catch (_) { /* ignore */ }
  return null;
}

export class GenerateWorkflowsPage {
  constructor(container) {
    this.container         = container;
    this._projectId        = null;
    this._modelConfig      = null;
    this._screens          = [];
    this._documents        = [];
    this._selectedScreenId = null;
    this._selectedDocIds   = new Set();
    this._generating       = false;
    this._outputBuf        = '';
    this._parsedWorkflows  = null;
    this._startTime        = null;
    this._timerInt         = null;
    this._lastPrompt       = '';
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  mount() {
    injectCss('pages/generate-workflows/generate-workflows-page.css');
    applyStoredTheme();
    this.container.innerHTML = '<div class="gw-loading">Loading…</div>';
    window.app.genWorkflowsWindow.onInit(data => this._init(data));
  }

  unmount() {
    if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
    window.app.genWorkflowChat.offAll();
  }

  // ----------------------------------------------------------------
  // Initialise from IPC
  // ----------------------------------------------------------------
  async _init({ projectId, modelConfig }) {
    window.app.genWorkflowChat.offAll();
    if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }

    this._projectId        = projectId;
    this._modelConfig      = modelConfig;
    this._selectedScreenId = null;
    this._selectedDocIds   = new Set();
    this._generating       = false;
    this._outputBuf        = '';
    this._parsedWorkflows  = null;
    this._lastPrompt       = '';

    const [screens, documents] = await Promise.all([
      window.db.screenDesigns.list(projectId),
      window.db.documents.list(projectId),
    ]);
    this._screens   = screens   || [];
    this._documents = documents || [];

    this._render();

    // Auto-select first screen
    if (this._screens.length > 0) {
      this._onScreenSelect(this._screens[0].id);
    }
  }

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------
  _render() {
    this.container.innerHTML = this._template();
    this._bindEvents();
    this._refreshGenerateBtn();
  }

  _template() {
    return `
      <div class="gw-page">
        <header class="gw-header">
          <svg class="gw-header__icon" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
          </svg>
          <span class="gw-header__title">Generate Workflows</span>
        </header>

        <div class="gw-body">
          <!-- ── Sidebar ── -->
          <aside class="gw-sidebar">
            <!-- Screens -->
            <div class="gw-sidebar__section" style="flex: 0 0 auto; max-height: 50%;">
              <div class="gw-sidebar__section-hd">
                <span class="gw-sidebar__section-label">Screens</span>
                <span class="gw-sidebar__section-count">${this._screens.length}</span>
              </div>
              <div class="gw-sidebar__list" id="gwScreensList">
                ${this._screensListHtml()}
              </div>
            </div>

            <!-- Documents -->
            <div class="gw-sidebar__section">
              <div class="gw-sidebar__section-hd">
                <span class="gw-sidebar__section-label">Documents</span>
                <span class="gw-sidebar__section-count">${this._documents.length}</span>
              </div>
              <div class="gw-sidebar__list" id="gwDocsList">
                ${this._docsListHtml()}
              </div>
            </div>

            <div class="gw-sidebar__footer">
              <button class="gw-generate-btn" id="gwBtnGenerate" disabled>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M3 2l12 6-12 6V2z" fill="currentColor"/>
                </svg>
                Generate
              </button>
            </div>
          </aside>

          <!-- ── Main panel ── -->
          <main class="gw-main">
            <!-- Prompt area (shown first) -->
            <div id="gwPromptArea">
              <div class="gw-panel-hd">
                <span class="gw-panel-hd__label">Prompt</span>
                <span class="gw-panel-hd__hint">Editable — select a screen to populate</span>
              </div>
              ${this._screens.length === 0
                ? '<div class="gw-prompt-empty">No screens found for this project.</div>'
                : `<textarea class="gw-prompt-textarea" id="gwPromptTextarea"
                     placeholder="Select a screen to populate the prompt…" spellcheck="false"></textarea>`}
            </div>

            <!-- Output area (shown while generating) -->
            <div id="gwOutputArea" hidden>
              <div class="gw-output-hd">
                <span class="gw-output-status gw-output-status--running" id="gwOutputStatus">Running</span>
                <span class="gw-output-label">AI Output</span>
                <span class="gw-elapsed" id="gwElapsed"></span>
                <button class="gw-stop-btn" id="gwBtnStop">■ Stop</button>
              </div>
              <pre class="gw-output-pre" id="gwOutputPre"></pre>
              <div class="gw-output-footer" id="gwOutputFooter" hidden></div>
            </div>

            <!-- Preview area (shown after successful parse) -->
            <div id="gwPreviewArea" hidden>
              <div class="gw-preview-hd">
                <span class="gw-preview-title" id="gwPreviewTitle">Generated Workflows</span>
                <button class="gw-approve-btn" id="gwBtnApprove">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l4 4 6-6" stroke="currentColor" stroke-width="1.5"
                      stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Approve &amp; Add to Workflows
                </button>
              </div>
              <div class="gw-preview-body" id="gwPreviewBody"></div>
            </div>
          </main>
        </div>
      </div>`;
  }

  _screensListHtml() {
    if (!this._screens.length) {
      return '<div class="gw-sidebar__empty">No screens in this project.</div>';
    }
    return this._screens.map(s => `
      <div class="gw-item${s.id === this._selectedScreenId ? ' gw-item--selected' : ''}"
           data-screen-id="${s.id}">
        <div class="gw-item__indicator"></div>
        <div class="gw-item__text">
          <div class="gw-item__label">${escHtml(s.title)}</div>
          ${(s.description || s.html_content)
            ? `<div class="gw-item__desc">${escHtml(s.description || extractTextPreview(s.html_content))}</div>`
            : ''}
        </div>
      </div>`).join('');
  }

  _docsListHtml() {
    if (!this._documents.length) {
      return '<div class="gw-sidebar__empty">No documents in this project.</div>';
    }
    return this._documents.map(d => `
      <div class="gw-item${this._selectedDocIds.has(d.id) ? ' gw-item--checked' : ''}"
           data-doc-id="${d.id}">
        <div class="gw-item__check">
          <svg class="gw-item__check-mark" width="9" height="9" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5 4-4" stroke="currentColor" stroke-width="1.5"
              stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="gw-item__text">
          <div class="gw-item__label">${escHtml(d.title)}</div>
        </div>
      </div>`).join('');
  }

  // ----------------------------------------------------------------
  // Event binding
  // ----------------------------------------------------------------
  _bindEvents() {
    // Screen selection
    this.container.querySelectorAll('[data-screen-id]').forEach(el => {
      el.addEventListener('click', () => this._onScreenSelect(+el.dataset.screenId));
    });

    // Document toggling
    this.container.querySelectorAll('[data-doc-id]').forEach(el => {
      el.addEventListener('click', () => this._onDocToggle(+el.dataset.docId));
    });

    // Generate button
    this.container.querySelector('#gwBtnGenerate')
      ?.addEventListener('click', () => this._generate());

    // Stop button (wired after output shown)
    this.container.querySelector('#gwBtnStop')
      ?.addEventListener('click', () => this._stop());

    // Approve button
    this.container.querySelector('#gwBtnApprove')
      ?.addEventListener('click', () => this._approve());
  }

  // ----------------------------------------------------------------
  // Screen / doc selection
  // ----------------------------------------------------------------
  _onScreenSelect(id) {
    this._selectedScreenId = id;
    // Update UI highlights
    this.container.querySelectorAll('[data-screen-id]').forEach(el => {
      el.classList.toggle('gw-item--selected', +el.dataset.screenId === id);
    });
    this._buildPrompt();
    this._refreshGenerateBtn();
  }

  _onDocToggle(id) {
    if (this._selectedDocIds.has(id)) {
      this._selectedDocIds.delete(id);
    } else {
      this._selectedDocIds.add(id);
    }
    // Update UI
    this.container.querySelectorAll('[data-doc-id]').forEach(el => {
      el.classList.toggle('gw-item--checked', this._selectedDocIds.has(+el.dataset.docId));
    });
    this._buildPrompt();
    this._refreshGenerateBtn();
  }

  _refreshGenerateBtn() {
    const btn = this.container.querySelector('#gwBtnGenerate');
    if (!btn) return;
    const ok = this._selectedScreenId !== null && this._selectedDocIds.size > 0;
    btn.disabled = !ok || this._generating;
  }

  // ----------------------------------------------------------------
  // Prompt construction
  // ----------------------------------------------------------------
  async _buildPrompt() {
    const textarea = this.container.querySelector('#gwPromptTextarea');
    if (!textarea) return;

    if (!this._selectedScreenId) {
      textarea.value = '';
      return;
    }

    const screen = this._screens.find(s => s.id === this._selectedScreenId);
    if (!screen) return;

    const selectedDocs = this._documents.filter(d => this._selectedDocIds.has(d.id));
    const isCli = this._modelConfig?.type === 'cli';

    let screenSection = '';
    let docsSection   = '';

    if (isCli) {
      // Write content to temp files; embed file paths in prompt
      const files = [
        { name: `screen-${screen.id}.html`, content: screen.html_content || '' },
        ...selectedDocs.map(d => ({ name: `doc-${d.id}-${d.title.replace(/[^a-z0-9]/gi, '_').slice(0, 40)}.txt`, content: d.content || '' })),
      ];
      const paths = await window.app.writeTempFiles(files);
      screenSection = `## UI/UX Mockup (Screen: "${screen.title}"):\nSee file: ${paths[0]}`;
      if (selectedDocs.length > 0) {
        const docLines = selectedDocs.map((d, i) => `### ${d.title}\nSee file: ${paths[i + 1]}`).join('\n\n');
        docsSection = `## Documents:\n${docLines}`;
      } else {
        docsSection = `## Documents:\n(none selected)`;
      }
    } else {
      // Embed content directly
      screenSection = `## UI/UX Mockup (Screen: "${screen.title}"):\n${screen.html_content || '(no HTML content)'}`;
      if (selectedDocs.length > 0) {
        const docLines = selectedDocs.map(d => `### ${d.title}\n${d.content || '(empty)'}`).join('\n\n');
        docsSection = `## Documents:\n${docLines}`;
      } else {
        docsSection = `## Documents:\n(none selected)`;
      }
    }

    const prompt = PROMPT_TEMPLATE(screenSection, docsSection);
    textarea.value = prompt;
  }

  // ----------------------------------------------------------------
  // Generate
  // ----------------------------------------------------------------
  async _generate() {
    const textarea = this.container.querySelector('#gwPromptTextarea');
    const prompt   = textarea?.value?.trim();

    if (!this._selectedScreenId) {
      this._showError('Select a screen before generating.');
      return;
    }
    if (!this._modelConfig) {
      this._showError('No AI model selected. Please select a model in the Workflows page before opening this window.');
      return;
    }
    if (!prompt) {
      this._showError('Prompt is empty. Select a screen and at least one document.');
      return;
    }

    this._lastPrompt   = prompt;
    this._generating   = true;
    this._outputBuf    = '';
    this._parsedWorkflows = null;

    // Show output panel
    this._showPanel('output');
    this.container.querySelector('#gwOutputPre').textContent = '';
    const footer = this.container.querySelector('#gwOutputFooter');
    if (footer) footer.hidden = true;
    this._setStatus('running', 'Running');
    this._refreshGenerateBtn();
    this._startTimer();

    window.app.genWorkflowChat.onToken(({ text }) => {
      this._outputBuf += text;
      const pre = this.container.querySelector('#gwOutputPre');
      if (pre) { pre.textContent += text; pre.scrollTop = pre.scrollHeight; }
    });

    window.app.genWorkflowChat.onDone(({ raw, error }) => {
      this._onDone(raw, error);
    });

    window.app.genWorkflowChat.generate({ prompt, model: this._modelConfig });
  }

  _onDone(raw, error) {
    window.app.genWorkflowChat.offAll();
    this._generating = false;
    this._stopTimer();

    const elapsed = this._startTime
      ? Math.floor((Date.now() - this._startTime) / 1000)
      : 0;
    const elapsedStr = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

    this.container.querySelector('#gwBtnStop')?.remove();
    this._refreshGenerateBtn();

    if (error) {
      this._setStatus('error', 'Error');
      this._showOutputFooter(`✗ ${error}`, false);
      this._addRetryBtn();
      return;
    }

    this._setStatus('done', 'Done');
    this._showOutputFooter(`✔ Completed in ${elapsedStr}`, true);

    const parsed = parseWorkflowJson(raw || this._outputBuf);
    if (!parsed) {
      this._showOutputFooter(`✔ Done — but could not parse JSON from output. Check the output above.`, false);
      this._addRetryBtn();
      return;
    }

    this._parsedWorkflows = parsed;
    this._renderPreview(parsed);
    this._showPanel('preview');
  }

  _stop() {
    window.app.genWorkflowChat.cancel();
    window.app.genWorkflowChat.offAll();
    this._generating = false;
    this._stopTimer();
    this.container.querySelector('#gwBtnStop')?.remove();
    this._setStatus('error', 'Stopped');
    this._showOutputFooter('Stopped by user.', false);
    this._addRetryBtn();
    this._refreshGenerateBtn();
  }

  // ----------------------------------------------------------------
  // Preview
  // ----------------------------------------------------------------
  _renderPreview(workflows) {
    const title = this.container.querySelector('#gwPreviewTitle');
    if (title) title.textContent = `${workflows.length} workflow${workflows.length !== 1 ? 's' : ''} generated`;

    const body = this.container.querySelector('#gwPreviewBody');
    if (!body) return;

    body.innerHTML = workflows.map(w => {
      const layers = Array.isArray(w.layers) ? [...w.layers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [];
      const criteria = Array.isArray(w.success_criteria) ? w.success_criteria : [];

      const layerPills = layers.map(l => `
        <span class="gw-layer-pill">
          <span class="gw-layer-pill__order">${l.order ?? '?'}.</span>${escHtml(l.layer || 'Layer')}
        </span>`).join('');

      const criteriaRows = criteria.map(c => `
        <div class="gw-criterion">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" stroke-width="1.4"/>
            <path d="M4 8l3 3 5-5" stroke="currentColor" stroke-width="1.4"
              stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          ${escHtml(c)}
        </div>`).join('');

      return `
        <div class="gw-wf-card">
          <div class="gw-wf-card__header">
            <div class="gw-wf-card__feature">${escHtml(w.feature || 'Untitled')}</div>
            ${w.description ? `<div class="gw-wf-card__desc">${escHtml(w.description)}</div>` : ''}
          </div>
          <div class="gw-wf-card__body">
            ${layers.length ? `
              <div>
                <div class="gw-wf-card__section-label">Layers (${layers.length})</div>
                <div class="gw-layer-pills">${layerPills}</div>
              </div>` : ''}
            ${criteria.length ? `
              <div>
                <div class="gw-wf-card__section-label">Success Criteria (${criteria.length})</div>
                <div class="gw-criteria-list">${criteriaRows}</div>
              </div>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  // ----------------------------------------------------------------
  // Approve
  // ----------------------------------------------------------------
  async _approve() {
    if (!this._parsedWorkflows?.length) return;

    const btn = this.container.querySelector('#gwBtnApprove');
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }

    let added = 0;
    const errors = [];

    for (const w of this._parsedWorkflows) {
      try {
        const wf = await window.db.workflows.create({
          project_id:       this._projectId,
          feature:          w.feature || 'Untitled',
          description:      w.description || null,
          screen_design_id: this._selectedScreenId,
        });

        const criteria = Array.isArray(w.success_criteria) ? w.success_criteria : [];
        for (const c of criteria) {
          await window.db.successCriteria.create({ workflow_id: wf.id, description: c });
        }

        const layers = Array.isArray(w.layers) ? [...w.layers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [];
        for (const l of layers) {
          await window.db.layers.create({
            workflow_id: wf.id,
            layer:       l.layer || 'Layer',
            order_num:   l.order ?? 1,
            purpose:     l.purpose || '',
            inputs:      Array.isArray(l.inputs)  ? l.inputs  : [],
            outputs:     Array.isArray(l.outputs) ? l.outputs : [],
            prompt:      l.prompt || '',
          });
        }
        added++;
      } catch (err) {
        errors.push(`"${w.feature}": ${err.message}`);
      }
    }

    // Show success state
    const preview = this.container.querySelector('#gwPreviewArea');
    if (preview) {
      const errHtml = errors.length
        ? `<p style="color:#dc2626;font-size:12px;margin-top:8px">${errors.map(escHtml).join('<br>')}</p>`
        : '';
      preview.innerHTML = `
        <div class="gw-success">
          <svg class="gw-success__icon" width="40" height="40" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 12l3 3 5-5"/>
          </svg>
          <div class="gw-success__title">${added} workflow${added !== 1 ? 's' : ''} added successfully</div>
          <div class="gw-success__msg">Return to the Workflows page to view and run the generated workflows.</div>
          ${errHtml}
          <button class="gw-close-btn" id="gwBtnClose">Close Window</button>
        </div>`;
      preview.querySelector('#gwBtnClose')
        ?.addEventListener('click', () => window.close());
    }
  }

  // ----------------------------------------------------------------
  // Panel switching helpers
  // ----------------------------------------------------------------
  _showPanel(which) {
    const panels = { prompt: '#gwPromptArea', output: '#gwOutputArea', preview: '#gwPreviewArea' };
    for (const [key, sel] of Object.entries(panels)) {
      const el = this.container.querySelector(sel);
      if (el) el.hidden = key !== which;
    }
  }

  _setStatus(type, text) {
    const el = this.container.querySelector('#gwOutputStatus');
    if (!el) return;
    el.className = `gw-output-status gw-output-status--${type}`;
    el.textContent = text;
  }

  _showOutputFooter(msg, success) {
    const footer = this.container.querySelector('#gwOutputFooter');
    if (!footer) return;
    footer.innerHTML = `<span class="${success ? 'gw-footer-done' : 'gw-footer-error'}">${escHtml(msg)}</span>`;
    footer.hidden = false;
  }

  _addRetryBtn() {
    const footer = this.container.querySelector('#gwOutputFooter');
    if (!footer) return;
    const btn = document.createElement('button');
    btn.className   = 'gw-retry-btn';
    btn.textContent = 'Edit Prompt & Retry';
    btn.addEventListener('click', () => {
      this._showPanel('prompt');
      const ta = this.container.querySelector('#gwPromptTextarea');
      if (ta && this._lastPrompt) ta.value = this._lastPrompt;
      this._refreshGenerateBtn();
    });
    footer.appendChild(btn);
  }

  _showError(msg) {
    const existing = this.container.querySelector('.gw-error-banner');
    if (existing) existing.remove();
    const banner = document.createElement('div');
    banner.className   = 'gw-error-banner';
    banner.textContent = msg;
    const main = this.container.querySelector('.gw-main');
    if (main) main.prepend(banner);
    setTimeout(() => banner.remove(), 5000);
  }

  // ----------------------------------------------------------------
  // Timer
  // ----------------------------------------------------------------
  _startTimer() {
    this._startTime = Date.now();
    if (this._timerInt) clearInterval(this._timerInt);
    this._timerInt = setInterval(() => {
      const el = this.container.querySelector('#gwElapsed');
      if (el && this._startTime) {
        const s = Math.floor((Date.now() - this._startTime) / 1000);
        el.textContent = s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
      }
    }, 500);
  }

  _stopTimer() {
    if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
  }
}
