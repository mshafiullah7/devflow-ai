import { injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme }    from '../../shared/theme-manager.js';

// ----------------------------------------------------------------
// Templates — pre-built prompt starters
// ----------------------------------------------------------------
const TEMPLATES = [
  {
    id:     'refine-stories',
    label:  'Refine user stories',
    prompt: 'Review the user stories in context. Tighten acceptance criteria, surface missing edge cases, and flag any ambiguities that could block development.',
  },
  {
    id:     'triage-issues',
    label:  'Triage open issues',
    prompt: 'Given the open issues and user stories in context, suggest a priority order and recommend which stories each issue should be linked to.',
  },
  {
    id:     'gen-test-cases',
    label:  'Generate test cases',
    prompt: 'Generate detailed test cases for the user stories in context. Include clear test steps and expected results for each scenario.',
  },
  {
    id:     'review-prompts',
    label:  'Review impl. prompts',
    prompt: 'Review the implementation prompts attached to the user stories in context. Suggest improvements to make them clearer and more actionable for a developer.',
  },
  {
    id:     'update-tech-spec',
    label:  'Update tech spec',
    prompt: 'Based on the documents and user stories in context, draft updated sections for the technical specification that reflect current progress.',
  },
  {
    id:     'custom',
    label:  'Custom prompt…',
    prompt: '',
  },
];

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function stripAnsi(str) {
  return (str || '')
    .replace(/\x1B\[[0-9;]*[mGKHFJA-Za-z]/g, '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '');
}

function formatText(raw) {
  return (raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

// ----------------------------------------------------------------
// Page class
// ----------------------------------------------------------------
export class AiConsolePage {
  constructor(container, params, router) {
    this.container = container;
    this.router    = router;
    this.projectId = params.projectId;

    // Runtime state
    this._models         = [];
    this._selectedModel  = null;
    this._isGenerating   = false;
    this._streamingEl    = null;   // current AI bubble DOM node
    this._streamingText  = '';     // accumulated text during streaming
    this._builtContext   = '';     // assembled context string

    // Project data (loaded once on mount)
    this._project   = null;
    this._features  = [];
    this._stories   = [];
    this._issues    = [];
    this._documents = [];
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  async mount() {
    injectCss('pages/ai-console/ai-console-page.css');
    applyStoredTheme();
    this.container.innerHTML = this._template();
    this._bindEvents();
    await this._loadData();
  }

  unmount() {
    window.app.chat.offAll();
    removeCss('pages/ai-console/ai-console-page.css');
  }

  // ----------------------------------------------------------------
  // Data loading
  // ----------------------------------------------------------------
  async _loadData() {
    try {
      // Load project + supporting data in parallel
      const [project, models, features, stories, allIssues, documents] = await Promise.all([
        window.db.projects.get(this.projectId),
        window.db.modelConfigs.list(),
        window.db.features.list(this.projectId),
        window.db.userStories.list({ project_id: this.projectId }),
        window.db.issues.list({ project_id: this.projectId }),
        window.db.documents.list(this.projectId),
      ]);

      this._project   = project  || null;
      this._models    = models   || [];
      this._features  = features || [];
      this._stories   = stories  || [];
      this._issues    = (allIssues || []).filter(i => i.status === 'open');
      this._documents = documents || [];

      this._populateModelSelect();
      this._updateContextCounts();
      this._enableUi();
      this._renderWelcome();
    } catch (err) {
      console.error('[AI Console] load error:', err);
      this._showThreadError('Failed to load project data. Please go back and reopen this page.');
    }
  }

  _populateModelSelect() {
    const sel = this.container.querySelector('#aicModelSelect');
    if (!sel) return;

    if (this._models.length === 0) {
      sel.innerHTML = '<option value="">No models configured — go to Settings</option>';
      return;
    }

    sel.innerHTML = '<option value="">Select model…</option>';
    for (const m of this._models) {
      const opt = document.createElement('option');
      opt.value       = m.id;
      opt.textContent = `${m.label} (${m.type.toUpperCase()})`;
      if (m.is_default) {
        opt.selected        = true;
        this._selectedModel = m;
      }
      sel.appendChild(opt);
    }

    // Fall back to first model if no default set
    if (!this._selectedModel && this._models.length > 0) {
      sel.value           = this._models[0].id;
      this._selectedModel = this._models[0];
    }
  }

  _updateContextCounts() {
    const q = (id) => this.container.querySelector(id);
    const set = (id, text) => { const el = q(id); if (el) el.textContent = text; };

    set('#aicCtxFeatures', `${this._features.length} feature${this._features.length !== 1 ? 's' : ''}`);
    set('#aicCtxStories',  `${this._stories.length} stor${this._stories.length !== 1 ? 'ies' : 'y'}`);
    set('#aicCtxIssues',   `${this._issues.length} open`);
    set('#aicCtxDoc',      `${this._documents.length} document${this._documents.length !== 1 ? 's' : ''}`);
  }

  _enableUi() {
    // Model + template selects
    ['#aicModelSelect', '#aicTemplateSelect'].forEach(id => {
      const el = this.container.querySelector(id);
      if (el) { el.disabled = false; el.removeAttribute('title'); }
    });

    // Textarea
    const ta = this.container.querySelector('#aicInput');
    if (ta) {
      ta.disabled     = false;
      ta.placeholder  = 'Type a message… (Enter to send, Shift+Enter for new line)';
    }

    // Buttons
    ['#aicBtnSend', '#aicBtnClear', '#aicBtnBuildCtx'].forEach(id => {
      const el = this.container.querySelector(id);
      if (el) el.disabled = false;
    });

    // Context checkboxes
    this.container.querySelectorAll('.aic-slice__check')
      .forEach(cb => { cb.disabled = false; });
  }

  _renderWelcome() {
    const thread = this.container.querySelector('#aicThread');
    if (!thread) return;

    const name = this._project?.name || 'your project';
    const text = `Hello! I\'m ready to help with **${name}**. `
      + `I can see ${this._features.length} features, ${this._stories.length} user stories, and ${this._issues.length} open issues. `
      + `Select context slices on the right, pick a template, and ask me anything.`;

    thread.innerHTML = this._bubbleHtml({ role: 'assistant', text });
  }

  // ----------------------------------------------------------------
  // HTML template (static scaffold — data filled in after load)
  // ----------------------------------------------------------------
  _template() {
    return `
      <div class="aic-page">

        <!-- Header -->
        <header class="aic-header">
          <button class="aic-header__back" id="aicBtnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <span class="aic-header__title">AI Console</span>

          <div class="aic-header__controls">
            <!-- Model selector -->
            <div class="aic-header__model-wrap">
              <svg class="aic-header__ctrl-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
              <select class="aic-select" id="aicModelSelect" disabled>
                <option value="">Loading…</option>
              </select>
            </div>

            <!-- Template picker -->
            <div class="aic-header__tpl-wrap">
              <svg class="aic-header__ctrl-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="8" y1="13" x2="16" y2="13"/>
                <line x1="8" y1="17" x2="12" y2="17"/>
              </svg>
              <select class="aic-select" id="aicTemplateSelect" disabled>
                <option value="">Templates…</option>
                ${TEMPLATES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
              </select>
            </div>
          </div>
        </header>

        <!-- Body: chat + context panel -->
        <div class="aic-body">

          <!-- Chat column -->
          <div class="aic-chat">

            <!-- Thread -->
            <div class="aic-thread" id="aicThread">
              <div class="aic-thread__loading">Loading project data…</div>
            </div>

            <!-- Input bar -->
            <div class="aic-input-bar">
              <div class="aic-input-bar__inner">
                <textarea
                  class="aic-input-bar__textarea"
                  id="aicInput"
                  placeholder="Loading…"
                  rows="2"
                  disabled
                ></textarea>
                <div class="aic-input-bar__actions">
                  <button class="aic-btn-ghost" id="aicBtnClear" disabled>Clear</button>
                  <button class="aic-btn-send" id="aicBtnSend" disabled>
                    <span id="aicBtnSendLabel">Send</span>
                    <svg id="aicIconSend" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"/>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                    <svg id="aicIconStop" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

          </div>

          <!-- Context panel -->
          <aside class="aic-context">
            <div class="aic-context__heading">Context</div>
            <p class="aic-context__desc">Choose what project data is injected into the AI prompt.</p>

            <div class="aic-context__slices">

              <label class="aic-slice">
                <input type="checkbox" class="aic-slice__check" data-slice="project" disabled>
                <div class="aic-slice__info">
                  <span class="aic-slice__name">Project summary</span>
                  <span class="aic-slice__meta">Name, description</span>
                </div>
              </label>

              <label class="aic-slice">
                <input type="checkbox" class="aic-slice__check" data-slice="features" disabled>
                <div class="aic-slice__info">
                  <span class="aic-slice__name">Features</span>
                  <span class="aic-slice__meta aic-slice__meta--count" id="aicCtxFeatures">– features</span>
                </div>
              </label>

              <label class="aic-slice">
                <input type="checkbox" class="aic-slice__check" data-slice="stories" disabled>
                <div class="aic-slice__info">
                  <span class="aic-slice__name">User stories</span>
                  <span class="aic-slice__meta aic-slice__meta--count" id="aicCtxStories">– stories</span>
                </div>
              </label>

              <label class="aic-slice">
                <input type="checkbox" class="aic-slice__check" data-slice="issues" disabled>
                <div class="aic-slice__info">
                  <span class="aic-slice__name">Open issues</span>
                  <span class="aic-slice__meta aic-slice__meta--count" id="aicCtxIssues">– open</span>
                </div>
              </label>

              <label class="aic-slice">
                <input type="checkbox" class="aic-slice__check" data-slice="documents" disabled>
                <div class="aic-slice__info">
                  <span class="aic-slice__name">Documents</span>
                  <span class="aic-slice__meta" id="aicCtxDoc">– documents</span>
                </div>
              </label>

            </div>

            <button class="aic-btn-build-ctx" id="aicBtnBuildCtx" disabled>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
              </svg>
              Build Context
            </button>

            <div class="aic-context__tokens">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span id="aicTokenCount">~0 tokens estimated</span>
            </div>

            <!-- Apply actions legend -->
            <div class="aic-context__heading" style="margin-top:20px;">Apply actions</div>
            <p class="aic-context__desc">After a response, use the action chips to write AI output back to your project.</p>
            <div class="aic-actions-legend">
              <span class="aic-action-chip aic-action-chip--preview">Save to doc</span>
              <span class="aic-action-chip aic-action-chip--preview">Create issue</span>
              <span class="aic-action-chip aic-action-chip--preview">Update story</span>
              <span class="aic-action-chip aic-action-chip--preview">Queue prompt</span>
            </div>
          </aside>

        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // Message bubble renderer
  // ----------------------------------------------------------------
  _bubbleHtml(msg, streaming = false) {
    const isUser   = msg.role === 'user';
    const bodyHtml = formatText(msg.text || '');
    const cursor   = streaming ? '<span class="aic-cursor">▋</span>' : '';

    const userAvatar = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>`;

    const aiAvatar = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
    </svg>`;

    return `
      <div class="aic-msg aic-msg--${msg.role}${streaming ? ' aic-msg--streaming' : ''}">
        <div class="aic-msg__avatar ${isUser ? 'aic-msg__avatar--user' : 'aic-msg__avatar--ai'}">
          ${isUser ? userAvatar : aiAvatar}
        </div>
        <div class="aic-msg__body">
          <div class="aic-msg__bubble">${bodyHtml}${cursor}</div>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // Event binding
  // ----------------------------------------------------------------
  _bindEvents() {
    const q = (id) => this.container.querySelector(id);

    // Back
    q('#aicBtnBack').addEventListener('click', () =>
      this.router.navigate('project-home', { projectId: this.projectId }));

    // Model select
    q('#aicModelSelect').addEventListener('change', (e) => {
      const id = parseInt(e.target.value, 10);
      this._selectedModel = this._models.find(m => m.id === id) || null;
    });

    // Template select → pre-fill textarea
    q('#aicTemplateSelect').addEventListener('change', (e) => {
      const tpl = TEMPLATES.find(t => t.id === e.target.value);
      if (!tpl || tpl.id === 'custom') return;
      const ta = q('#aicInput');
      if (ta && !ta.value.trim()) {
        ta.value = tpl.prompt;
        ta.focus();
      }
    });

    // Send / Stop (same button, toggled)
    q('#aicBtnSend').addEventListener('click', () => {
      if (this._isGenerating) this._handleStop();
      else this._handleSend();
    });

    // Enter to send, Shift+Enter for newline
    q('#aicInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!this._isGenerating) this._handleSend();
      }
    });

    // Clear
    q('#aicBtnClear').addEventListener('click', () => this._handleClear());

    // Build Context
    q('#aicBtnBuildCtx').addEventListener('click', () => this._buildContext());

    // Context checkboxes → update token estimate live
    this.container.querySelectorAll('.aic-slice__check')
      .forEach(cb => cb.addEventListener('change', () => this._updateTokenEstimate()));
  }

  // ----------------------------------------------------------------
  // Send
  // ----------------------------------------------------------------
  _handleSend() {
    const ta       = this.container.querySelector('#aicInput');
    const userText = (ta?.value || '').trim();

    if (!userText) return;

    if (!this._selectedModel) {
      this._showThreadError('Please select a model first.');
      return;
    }

    // Build full prompt: optional context block + user message
    const prefix     = this._builtContext ? `${this._builtContext}\n\n---\n\n` : '';
    const fullPrompt = prefix + userText;

    // Clear textarea
    if (ta) ta.value = '';

    // Render user bubble
    this._appendBubble({ role: 'user', text: userText });

    // Start streaming AI bubble
    this._startStreaming();

    // Wire up streaming callbacks
    window.app.chat.offAll();
    window.app.chat.onToken((p) => this._onToken(p));
    window.app.chat.onDone((p)  => this._onDone(p));

    // Fire
    window.app.chat.generate({ prompt: fullPrompt, model: this._selectedModel });

    this._setGenerating(true);
  }

  // ----------------------------------------------------------------
  // Stop
  // ----------------------------------------------------------------
  _handleStop() {
    window.app.chat.cancel();
    this._finalizeStream(this._streamingText.trim() || '[stopped]');
    this._setGenerating(false);
  }

  // ----------------------------------------------------------------
  // Clear
  // ----------------------------------------------------------------
  _handleClear() {
    if (this._isGenerating) return;
    this._builtContext = '';
    this._updateTokenEstimate();
    const tplSel = this.container.querySelector('#aicTemplateSelect');
    if (tplSel) tplSel.value = '';
    this._renderWelcome();
  }

  // ----------------------------------------------------------------
  // Streaming handlers
  // ----------------------------------------------------------------
  _startStreaming() {
    this._streamingText = '';
    const thread        = this.container.querySelector('#aicThread');
    if (!thread) return;

    const div = document.createElement('div');
    div.innerHTML = this._bubbleHtml({ role: 'assistant', text: '' }, true);
    this._streamingEl = div.firstElementChild;
    thread.appendChild(this._streamingEl);
    this._scrollThread();
  }

  _onToken(payload) {
    if (!this._streamingEl) return;
    const token = stripAnsi(payload.text || '');
    this._streamingText += token;

    const bubble = this._streamingEl.querySelector('.aic-msg__bubble');
    if (bubble) {
      bubble.innerHTML = formatText(this._streamingText) + '<span class="aic-cursor">▋</span>';
    }
    this._scrollThread();
  }

  _onDone(payload) {
    // Use raw for general chat (html extraction is for mockups, not console)
    const raw   = stripAnsi(payload.raw || this._streamingText || '').trim();
    const final = raw || '[No response received]';

    this._finalizeStream(final);
    this._setGenerating(false);

    if (payload.error && !raw) {
      this._showThreadError(`AI error: ${payload.error}`);
    }
  }

  _finalizeStream(text) {
    if (!this._streamingEl) return;

    this._streamingEl.classList.remove('aic-msg--streaming');
    const bubble = this._streamingEl.querySelector('.aic-msg__bubble');
    if (bubble) bubble.innerHTML = formatText(text);

    this._streamingEl  = null;
    this._streamingText = '';
    this._scrollThread();
  }

  // ----------------------------------------------------------------
  // Context builder
  // ----------------------------------------------------------------
  _buildContext() {
    const slices = {};
    this.container.querySelectorAll('.aic-slice__check')
      .forEach(cb => { slices[cb.dataset.slice] = cb.checked; });

    const parts = [];

    if (slices.project && this._project) {
      const desc = this._project.description ? `\n${this._project.description}` : '';
      parts.push(`PROJECT: ${this._project.name}${desc}`);
    }

    if (slices.features && this._features.length > 0) {
      const list = this._features
        .map(f => `  - ${f.title}${f.description ? ': ' + f.description : ''}`)
        .join('\n');
      parts.push(`FEATURES (${this._features.length}):\n${list}`);
    }

    if (slices.stories && this._stories.length > 0) {
      const list = this._stories
        .map(s => {
          const ac = s.acceptance_criteria
            ? '\n    Acceptance: ' + s.acceptance_criteria.substring(0, 150)
            : '';
          return `  - [${s.status || 'Backlog'}] ${s.title}${ac}`;
        })
        .join('\n');
      parts.push(`USER STORIES (${this._stories.length}):\n${list}`);
    }

    if (slices.issues && this._issues.length > 0) {
      const list = this._issues
        .map(i => `  - [${i.severity || 'medium'}] ${i.title}`)
        .join('\n');
      parts.push(`OPEN ISSUES (${this._issues.length}):\n${list}`);
    }

    if (slices.documents && this._documents.length > 0) {
      const list = this._documents.map(d => `  - ${d.title}`).join('\n');
      parts.push(`DOCUMENTS (${this._documents.length}):\n${list}`);
    }

    this._builtContext = parts.length > 0
      ? `You are an AI assistant for the following software project. Use this context when answering.\n\n${parts.join('\n\n')}`
      : '';

    this._updateTokenEstimate();
    this._flashBuildButton();
  }

  _flashBuildButton() {
    const btn = this.container.querySelector('#aicBtnBuildCtx');
    if (!btn) return;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Context ready`;
    btn.classList.add('aic-btn-build-ctx--done');
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.classList.remove('aic-btn-build-ctx--done');
    }, 2000);
  }

  _updateTokenEstimate() {
    const tokens = estimateTokens(this._builtContext);
    const el = this.container.querySelector('#aicTokenCount');
    if (el) {
      el.textContent = tokens > 0
        ? `~${tokens.toLocaleString()} tokens in context`
        : '~0 tokens estimated';
    }
  }

  // ----------------------------------------------------------------
  // UI helpers
  // ----------------------------------------------------------------
  _setGenerating(on) {
    this._isGenerating = on;

    const btnSend  = this.container.querySelector('#aicBtnSend');
    const label    = this.container.querySelector('#aicBtnSendLabel');
    const iconSend = this.container.querySelector('#aicIconSend');
    const iconStop = this.container.querySelector('#aicIconStop');
    const ta       = this.container.querySelector('#aicInput');
    const btnClear = this.container.querySelector('#aicBtnClear');

    if (on) {
      if (label)    label.textContent     = 'Stop';
      if (iconSend) iconSend.style.display = 'none';
      if (iconStop) iconStop.style.display = '';
      if (btnSend)  btnSend.classList.add('aic-btn-send--stop');
      if (ta)       ta.disabled            = true;
      if (btnClear) btnClear.disabled      = true;
    } else {
      if (label)    label.textContent     = 'Send';
      if (iconSend) iconSend.style.display = '';
      if (iconStop) iconStop.style.display = 'none';
      if (btnSend)  btnSend.classList.remove('aic-btn-send--stop');
      if (ta)       { ta.disabled = false; ta.focus(); }
      if (btnClear) btnClear.disabled = false;
    }
  }

  _appendBubble(msg) {
    const thread = this.container.querySelector('#aicThread');
    if (!thread) return;
    const div = document.createElement('div');
    div.innerHTML = this._bubbleHtml(msg);
    thread.appendChild(div.firstElementChild);
    this._scrollThread();
  }

  _showThreadError(msg) {
    const thread = this.container.querySelector('#aicThread');
    if (!thread) return;
    const div = document.createElement('div');
    div.className   = 'aic-error-msg';
    div.textContent = msg;
    thread.appendChild(div);
    this._scrollThread();
  }

  _scrollThread() {
    const thread = this.container.querySelector('#aicThread');
    if (thread) thread.scrollTop = thread.scrollHeight;
  }
}
