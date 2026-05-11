import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme }              from '../../shared/theme-manager.js';
import { ModelConfigsModal }             from '../../components/model-configs/model-configs-modal.js';
import { ModelPicker }                   from '../../components/model-picker/model-picker.js';
import { GitController }                 from '../../components/git/git-controller.js';

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
// TemplatePicker — same visual pattern as ModelPicker
// ----------------------------------------------------------------
class TemplatePicker {
  constructor({ anchor, templates, onSelect } = {}) {
    this._anchor    = anchor;
    this._templates = templates;
    this._onSelect  = onSelect || null;
    this._open      = false;
    this._handleOutside = this._handleOutside.bind(this);
  }

  mount()   { this._render(); }
  unmount() {
    document.removeEventListener('click', this._handleOutside, true);
    this._anchor.innerHTML = '';
  }

  _render() {
    this._anchor.innerHTML = `
      <div class="mp-wrap">
        <button class="mp-trigger" type="button" aria-haspopup="listbox" aria-expanded="${this._open}">
          <svg class="mp-trigger__icon" width="13" height="13" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="8" y1="13" x2="16" y2="13"/>
            <line x1="8" y1="17" x2="12" y2="17"/>
          </svg>
          <span class="mp-trigger__label">Templates…</span>
          <svg class="mp-trigger__caret${this._open ? ' mp-trigger__caret--open' : ''}"
               width="10" height="10" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        ${this._open ? `
          <div class="mp-menu" role="listbox">
            ${this._templates.map(t => `
              <button class="mp-menu__item" data-tpl-id="${t.id}" role="option" type="button">
                <svg class="mp-menu__check" width="12" height="12" viewBox="0 0 24 24"
                     fill="none" stroke="currentColor" stroke-width="2.5"
                     stroke-linecap="round" stroke-linejoin="round"></svg>
                <span class="mp-menu__label">${escHtml(t.label)}</span>
              </button>`).join('')}
          </div>` : ''}
      </div>`;

    this._anchor.querySelector('.mp-trigger')
      .addEventListener('click', e => { e.stopPropagation(); this._toggleMenu(); });

    if (this._open) {
      this._anchor.querySelectorAll('.mp-menu__item[data-tpl-id]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const tpl = this._templates.find(t => t.id === btn.dataset.tplId);
          if (!tpl) return;
          this._open = false;
          document.removeEventListener('click', this._handleOutside, true);
          this._render();
          if (this._onSelect) this._onSelect(tpl);
        });
      });
    }
  }

  _toggleMenu() {
    this._open = !this._open;
    if (this._open) document.addEventListener('click', this._handleOutside, true);
    else            document.removeEventListener('click', this._handleOutside, true);
    this._render();
  }

  _handleOutside(e) {
    if (!this._anchor.contains(e.target)) {
      this._open = false;
      document.removeEventListener('click', this._handleOutside, true);
      this._render();
    }
  }
}

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

function escapeHtml(raw) {
  return (raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
    this._isGenerating   = false;
    this._streamingEl    = null;   // current AI bubble DOM node
    this._streamingText  = '';     // accumulated text during streaming
    this._builtContext   = '';     // assembled context string
    this._messages       = [];     // conversation history [{role, content}]

    // Project data (loaded once on mount)
    this._project   = null;
    this._features  = [];
    this._stories   = [];
    this._issues    = [];
    this._documents = [];
  }

  get _selectedModel() { return this._picker?.selectedModel ?? null; }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  async mount() {
    injectCss('pages/ai-console/ai-console-page.css');
    applyStoredTheme();

    this._project = await window.db.projects.get(this.projectId);

    this.container.innerHTML = this._template();

    this._modelConfigsModal = new ModelConfigsModal({
      onConfigsChanged: () => this._picker?.reload(),
    });
    this._modelConfigsModal.mount();

    this._picker = new ModelPicker({
      anchor:   this.container.querySelector('#aicModelPicker'),
      onSelect: () => {},
    });

    this._tplPicker = new TemplatePicker({
      anchor:    this.container.querySelector('#aicTplPicker'),
      templates: TEMPLATES,
      onSelect:  (tpl) => {
        if (!tpl.prompt) return;
        const ta = this.container.querySelector('#aicInput');
        if (ta && !ta.value.trim()) {
          ta.value = tpl.prompt;
          ta.focus();
        }
      },
    });
    this._tplPicker.mount();

    this._git = new GitController({
      getTermCwd: () => this._project?.project_path || '',
      gitBtnId:   'aicBtnGit',
      gitBadgeId: 'aicGitBadge',
    });
    this._git.mount();

    this._bindEvents();
    await this._picker.reload();

    if (this._project?.project_path) {
      this._setHeaderFolderPath(this._project.project_path);
      this._git.refreshStatus();
      this._git.startPoll();
    }

    await this._loadData();
  }

  unmount() {
    window.app.chat.offAll();
    this._picker?.unmount();
    this._tplPicker?.unmount();
    this._git?.stopPoll();
    removeCss('pages/ai-console/ai-console-page.css');
  }

  // ----------------------------------------------------------------
  // Data loading
  // ----------------------------------------------------------------
  async _loadData() {
    try {
      const [features, stories, allIssues, documents] = await Promise.all([
        window.db.features.list(this.projectId),
        window.db.userStories.list({ project_id: this.projectId }),
        window.db.issues.list({ project_id: this.projectId }),
        window.db.documents.list(this.projectId),
      ]);

      this._features  = features || [];
      this._stories   = stories  || [];
      this._issues    = (allIssues || []).filter(i => i.status === 'open');
      this._documents = documents || [];

      this._updateContextCounts();
      this._enableUi();
      this._renderWelcome();
    } catch (err) {
      console.error('[AI Console] load error:', err);
      this._showThreadError('Failed to load project data. Please go back and reopen this page.');
    }
  }

  _updateContextCounts() {
    const set = (id, text) => { const el = this.container.querySelector(id); if (el) el.textContent = text; };

    set('#aicCtxFeatures', `${this._features.length} feature${this._features.length !== 1 ? 's' : ''}`);
    set('#aicCtxStories',  `${this._stories.length} stor${this._stories.length !== 1 ? 'ies' : 'y'}`);
    set('#aicCtxIssues',   `${this._issues.length} open`);

    this._renderDocumentSlices();
  }

  _renderDocumentSlices() {
    const container = this.container.querySelector('#aicDocsSlices');
    if (!container) return;

    if (this._documents.length === 0) {
      container.innerHTML = '<span class="aic-slice__meta" style="padding:4px 8px;display:block;">No documents</span>';
      return;
    }

    container.innerHTML = this._documents.map(d => `
      <label class="aic-slice aic-slice--doc">
        <input type="checkbox" class="aic-doc-check" data-doc-id="${d.id}" disabled>
        <div class="aic-slice__info">
          <span class="aic-slice__name">${escHtml(d.title)}</span>
        </div>
      </label>
    `).join('');

    container.querySelectorAll('.aic-doc-check').forEach(cb =>
      cb.addEventListener('change', () => this._updateTokenEstimate())
    );
  }

  _enableUi() {
    // Template select
    const tplSel = this.container.querySelector('#aicTemplateSelect');
    if (tplSel) { tplSel.disabled = false; tplSel.removeAttribute('title'); }

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
    this.container.querySelectorAll('.aic-slice__check, .aic-doc-check')
      .forEach(cb => { cb.disabled = false; });
  }

  _renderWelcome() {
    const thread = this.container.querySelector('#aicThread');
    if (!thread) return;

    const name = this._project?.name || 'your project';
    thread.innerHTML = `<p class="aic-thread__loading">
      Ready to help with <strong>${escHtml(name)}</strong>. ${this._features.length} features, ${this._stories.length} stories, ${this._issues.length} open issues. Select context slices on the right, then send a message.
    </p>`;
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

          <div class="aic-header__title-group">
            <div class="aic-header__title">${escHtml(this._project?.name ?? 'Project')}</div>
            <div class="aic-header__subtitle">AI Chat</div>
          </div>

          <div class="project-page__folder-display" id="aicHeaderFolderDisplay" title="Select folder" style="-webkit-app-region:no-drag;">
            <div class="project-page__folder-pill">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                  stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              </svg>
              <span class="project-page__folder-text" id="aicHeaderFolderText">Select folder</span>
            </div>
          </div>

          <!-- Template picker -->
          <div id="aicTplPicker" style="-webkit-app-region:no-drag;"></div>

          <div class="project-page__model-group" style="-webkit-app-region:no-drag;">
            <div id="aicModelPicker"></div>
            <button class="project-page__model-cfg-btn" id="aicBtnModelConfigs" title="Configure AI models">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <button class="project-page__git-btn" id="aicBtnGit" title="Git changes" style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
              <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span class="project-page__git-badge" id="aicGitBadge" hidden></span>
          </button>
        </header>

        <!-- Body: chat + context panel -->
        <div class="aic-body">

          <!-- Chat column -->
          <div class="aic-chat" id="aicChat">

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
                  <button class="aic-btn-ghost" id="aicBtnClear" disabled title="Clear conversation">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <path d="M2 13h12M10.5 3L5 8.5l-2 4.5 4.5-2 5.5-5.5-2-2z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <button class="aic-btn-send" id="aicBtnSend" disabled title="Send (Enter)">
                    <svg id="aicIconSend" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M3 2l11 6-11 6V9.5l8-1.5-8-1.5V2z"/>
                    </svg>
                    <svg id="aicIconStop" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

          </div>

          <!-- Draggable divider -->
          <div class="aic-divider" id="aicDivider"></div>

          <!-- Context panel -->
          <aside class="aic-context" id="aicContext">
            <div class="aic-context__heading">Context</div>
            <p class="aic-context__desc">Choose what project data is injected into the AI prompt.</p>

            <div class="aic-context__slices">

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

            </div>

            <!-- Documents — per-document selection -->
            <div class="aic-context__heading" style="margin-top:10px;">Documents</div>
            <div class="aic-docs-slices" id="aicDocsSlices">
              <span class="aic-slice__meta" style="padding:4px 8px;display:block;">Loading…</span>
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

            <!-- Context preview — shows full generated prompt text -->
            <div id="aicCtxPreviewWrap" class="aic-ctx-preview-wrap" style="display:none">
              <div class="aic-ctx-preview__header">
                <span class="aic-context__heading" style="margin:0">Generated context</span>
                <button class="aic-ctx-preview__copy" id="aicBtnCopyCtx" title="Copy to clipboard">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  Copy
                </button>
              </div>
              <pre id="aicCtxPreview" class="aic-ctx-preview__pre"></pre>
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
    const isAi     = msg.role === 'assistant' || msg.role === 'ai';
    const bodyHtml = isAi ? this._renderMarkdown(msg.text || '') : escapeHtml(msg.text || '');
    const cursor   = streaming ? '<span class="aic-cursor">▋</span>' : '';

    return `
      <div class="aic-msg aic-msg--${msg.role}${streaming ? ' aic-msg--streaming' : ''}">
        <div class="aic-msg__bubble">${bodyHtml}${cursor}</div>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // Markdown renderer (mirrors Prompt Queue implementation)
  // ----------------------------------------------------------------
  _renderMarkdown(text) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = text.split('\n');
    const out = [];
    let inCode = false, codeLines = [], inUl = false, inOl = false, lastBlock = '';
    let inTable = false, tableLines = [];
    let inSvg = false, svgLines = [];

    const closeList = () => {
      if (inUl) { out.push('</ul>'); inUl = false; lastBlock = 'list'; }
      if (inOl) { out.push('</ol>'); inOl = false; lastBlock = 'list'; }
    };
    const flushTable = () => {
      if (!inTable) return;
      inTable = false;
      if (tableLines.length < 2) {
        tableLines.forEach(l => out.push(`<p>${this._inlineMarkdown(esc(l))}</p>`));
        tableLines = []; lastBlock = 'p'; return;
      }
      const parseRow = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const isSep = r => /^\|?[\s\-|:]+\|?$/.test(r) && r.includes('-');
      const sepIdx = tableLines.findIndex(isSep);
      const headRows = sepIdx > 0 ? tableLines.slice(0, sepIdx) : [];
      const bodyRows = tableLines.slice(sepIdx + 1);
      let html = '<table class="md-table">';
      if (headRows.length) {
        html += '<thead>';
        headRows.forEach(r => { html += '<tr>' + parseRow(r).map(c => `<th>${this._inlineMarkdown(esc(c))}</th>`).join('') + '</tr>'; });
        html += '</thead>';
      }
      if (bodyRows.length) {
        html += '<tbody>';
        bodyRows.forEach(r => { html += '<tr>' + parseRow(r).map(c => `<td>${this._inlineMarkdown(esc(c))}</td>`).join('') + '</tr>'; });
        html += '</tbody>';
      }
      html += '</table>';
      out.push(html); tableLines = []; lastBlock = 'table';
    };

    for (const line of lines) {
      if (!inCode && !inSvg && line.trimStart().toLowerCase().startsWith('<svg')) {
        closeList(); inSvg = true; svgLines = [line];
        if (line.includes('</svg>')) { out.push(`<div class="md-svg">${svgLines.join('\n')}</div>`); svgLines = []; inSvg = false; lastBlock = 'svg'; }
        continue;
      }
      if (inSvg) {
        svgLines.push(line);
        if (line.includes('</svg>')) { out.push(`<div class="md-svg">${svgLines.join('\n')}</div>`); svgLines = []; inSvg = false; lastBlock = 'svg'; }
        continue;
      }
      if (line.trimStart().startsWith('```')) {
        closeList();
        if (inCode) { out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`); codeLines = []; inCode = false; lastBlock = 'code'; }
        else { inCode = true; }
        continue;
      }
      if (inCode) { codeLines.push(esc(line)); continue; }
      const hm = line.match(/^(#{1,6})\s+(.*)/);
      if (hm) { closeList(); out.push(`<h${hm[1].length}>${esc(hm[2])}</h${hm[1].length}>`); lastBlock = 'heading'; continue; }
      if (/^[-*_]{3,}\s*$/.test(line)) { closeList(); out.push('<hr>'); lastBlock = 'hr'; continue; }
      const ulm = line.match(/^[-*+]\s+(.*)/);
      if (ulm) { if (inOl) { out.push('</ol>'); inOl = false; } if (!inUl) { out.push('<ul>'); inUl = true; } out.push(`<li>${this._inlineMarkdown(esc(ulm[1]))}</li>`); lastBlock = 'list'; continue; }
      const olm = line.match(/^\d+\.\s+(.*)/);
      if (olm) { if (inUl) { out.push('</ul>'); inUl = false; } if (!inOl) { out.push('<ol>'); inOl = true; } out.push(`<li>${this._inlineMarkdown(esc(olm[1]))}</li>`); lastBlock = 'list'; continue; }
      const bqm = line.match(/^>\s?(.*)/);
      if (bqm) { closeList(); out.push(`<blockquote>${this._inlineMarkdown(esc(bqm[1]))}</blockquote>`); lastBlock = 'blockquote'; continue; }
      if (line.trim().startsWith('|')) { closeList(); inTable = true; tableLines.push(line.trim()); continue; }
      if (inTable) flushTable();
      if (line.trim() === '') { closeList(); if (lastBlock === 'p') { out.push('<br>'); lastBlock = 'br'; } continue; }
      closeList();
      out.push(`<p>${this._inlineMarkdown(esc(line))}</p>`); lastBlock = 'p';
    }
    closeList();
    if (inTable) flushTable();
    if (inCode) out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
    return out.join('');
  }

  _inlineMarkdown(s) {
    return s
      .replace(/`([^`]+)`/g,          '<code>$1</code>')
      .replace(/\*\*\*(.+?)\*\*\*/g,  '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g,      '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,          '<em>$1</em>')
      .replace(/~~(.+?)~~/g,          '<del>$1</del>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  }

  // ----------------------------------------------------------------
  // Event binding
  // ----------------------------------------------------------------
  _bindEvents() {
    const q = (id) => this.container.querySelector(id);

    // Back
    q('#aicBtnBack').addEventListener('click', () =>
      this.router.navigate('project-home', { projectId: this.projectId }));

    // Model config button
    q('#aicBtnModelConfigs').addEventListener('click', () =>
      this._modelConfigsModal?.open());

    // Git button
    q('#aicBtnGit').addEventListener('click', () =>
      this.router.navigate('git-changes', { projectId: this.projectId, from: 'ai-console' }));

    // Folder display — open folder picker
    q('#aicHeaderFolderDisplay').addEventListener('click', async () => {
      const folderPath = await window.db.dialog.openFolder();
      if (!folderPath) return;
      await window.db.projects.setPath({ id: this.projectId, project_path: folderPath });
      if (this._project) this._project.project_path = folderPath;
      this._setHeaderFolderPath(folderPath);
      this._git.refreshStatus();
      this._git.startPoll();
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

    // Copy context to clipboard
    this.container.addEventListener('click', (e) => {
      if (!e.target.closest('#aicBtnCopyCtx')) return;
      if (!this._builtContext) return;
      navigator.clipboard.writeText(this._builtContext).then(() => {
        const btn = this.container.querySelector('#aicBtnCopyCtx');
        if (!btn) return;
        const orig = btn.innerHTML;
        btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied`;
        setTimeout(() => { btn.innerHTML = orig; }, 1800);
      });
    });

    // Context checkboxes → update token estimate live
    this.container.querySelectorAll('.aic-slice__check')
      .forEach(cb => cb.addEventListener('change', () => this._updateTokenEstimate()));

    // Prompt disclosure toggle — event delegation on thread
    this.container.querySelector('#aicThread')
      .addEventListener('click', (e) => {
        const toggle = e.target.closest('.aic-prompt-disc__toggle');
        if (!toggle) return;
        const disc = toggle.closest('.aic-prompt-disc');
        if (!disc) return;
        const isOpen = disc.dataset.open === 'true';
        disc.dataset.open = isOpen ? 'false' : 'true';
        const body = disc.querySelector('.aic-prompt-disc__body');
        if (body) body.style.display = isOpen ? 'none' : 'block';
        const chevron = disc.querySelector('.aic-prompt-disc__chevron');
        if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
      });

    // Draggable divider between chat and context panel
    this._initDividerDrag();

    // Auto-resize textarea
    const ta = q('#aicInput');
    if (ta) {
      const resize = () => {
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
      };
      ta.addEventListener('input', resize);
    }
  }

  _initDividerDrag() {
    const divider     = this.container.querySelector('#aicDivider');
    const contextPane = this.container.querySelector('#aicContext');
    const bodyEl      = this.container.querySelector('.aic-body');
    if (!divider || !contextPane || !bodyEl) return;

    divider.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startX      = e.clientX;
      const startWidth  = contextPane.getBoundingClientRect().width;
      const totalWidth  = bodyEl.getBoundingClientRect().width;
      const minW        = 200;
      const maxW        = totalWidth - 400;

      document.body.style.cursor     = 'col-resize';
      document.body.style.userSelect = 'none';
      divider.classList.add('aic-divider--dragging');

      const onMove = (mv) => {
        const newWidth = Math.min(Math.max(startWidth - (mv.clientX - startX), minW), maxW);
        contextPane.style.flex = `0 0 ${newWidth}px`;
      };

      const onUp = () => {
        document.body.style.cursor     = '';
        document.body.style.userSelect = '';
        divider.classList.remove('aic-divider--dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
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

    const isFirst = this._messages.length === 0;

    // On the first message of a session, (re)build context from checked slices
    // and prepend it so the model has full project data for the whole thread.
    // Follow-up messages skip this — the model already has it in history.
    let autoBuilt = false;
    if (isFirst) {
      this._buildContext();
      const anyChecked = [...this.container.querySelectorAll('.aic-slice__check, .aic-doc-check')]
        .some(cb => cb.checked);
      autoBuilt = anyChecked && !!this._builtContext;
    }

    const content = isFirst && this._builtContext
      ? `${this._builtContext}\n\n---\n\n${userText}`
      : userText;

    this._messages.push({ role: 'user', content });

    // Clear textarea
    if (ta) ta.value = '';
    ta.style.height = '';

    // 1. User bubble — what they typed
    this._appendBubble({ role: 'user', text: userText });

    // 2. Prompt disclosure — full prompt sent to model
    this._appendPromptDisclosure(content, this._selectedModel, autoBuilt);

    // 3. Start streaming AI bubble
    this._startStreaming();

    // Wire up streaming callbacks
    window.app.chat.offAll();
    window.app.chat.onToken((p) => this._onToken(p));
    window.app.chat.onDone((p)  => this._onDone(p));

    // Fire with full conversation history
    window.app.chat.generate({ messages: this._messages, model: this._selectedModel });

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
    this._messages     = [];
    this._updateTokenEstimate();
    this._updateContextPreview();
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
      bubble.innerHTML = this._renderMarkdown(this._streamingText) + '<span class="aic-cursor">▋</span>';
    }
    this._scrollThread();
  }

  _onDone(payload) {
    const raw   = stripAnsi(payload.raw || this._streamingText || '').trim();
    const final = raw || '[No response received]';

    this._finalizeStream(final);
    this._setGenerating(false);

    // Append assistant reply to history so follow-up questions have full context
    if (raw) this._messages.push({ role: 'assistant', content: raw });

    if (payload.error && !raw) {
      this._showThreadError(`AI error: ${payload.error}`);
    }
  }

  _finalizeStream(text) {
    if (!this._streamingEl) return;

    this._streamingEl.classList.remove('aic-msg--streaming');
    const bubble = this._streamingEl.querySelector('.aic-msg__bubble');
    if (bubble) bubble.innerHTML = this._renderMarkdown(text);

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

    // ── Features ────────────────────────────────────────────────────
    // DB column is `name` (not `title`); status comes from `status_name` join
    if (slices.features && this._features.length > 0) {
      const list = this._features.map(f => {
        let line = `  [Feature] ${f.name}`;                      // f.name — correct column
        if (f.description) line += `\n    Description: ${f.description}`;
        if (f.status_name)  line += `\n    Status: ${f.status_name}`;
        return line;
      }).join('\n\n');
      parts.push(`FEATURES (${this._features.length}):\n\n${list}`);
    }

    // ── User stories ─────────────────────────────────────────────────
    // DB returns: title, description, acceptance_criteria, status_name (join), feature_id
    if (slices.stories && this._stories.length > 0) {
      const list = this._stories.map(s => {
        let block = `  [Story] ${s.title}`;
        block += `\n    Status: ${s.status_name || 'Backlog'}`;   // status_name — correct column
        if (s.description)          block += `\n    Description: ${s.description}`;
        if (s.acceptance_criteria)  block += `\n    Acceptance Criteria:\n${
          s.acceptance_criteria.split('\n').map(l => `      ${l}`).join('\n')
        }`;
        return block;
      }).join('\n\n');
      parts.push(`USER STORIES (${this._stories.length}):\n\n${list}`);
    }

    // ── Open issues ──────────────────────────────────────────────────
    // DB returns: title, severity, status, description, story_title, feature_name (joins)
    if (slices.issues && this._issues.length > 0) {
      const list = this._issues.map(i => {
        let block = `  [Issue] ${i.title}`;
        block += `\n    Severity: ${i.severity || 'medium'} | Status: ${i.status || 'open'}`;
        if (i.feature_name)  block += `\n    Feature: ${i.feature_name}`;
        if (i.story_title)   block += `\n    Story: ${i.story_title}`;
        if (i.description)   block += `\n    Description: ${i.description}`;
        if (i.steps_to_reproduce) block += `\n    Steps: ${i.steps_to_reproduce}`;
        return block;
      }).join('\n\n');
      parts.push(`OPEN ISSUES (${this._issues.length}):\n\n${list}`);
    }

    // ── Documents (individually selected) ───────────────────────────
    const selectedDocIds = new Set(
      [...this.container.querySelectorAll('.aic-doc-check:checked')]
        .map(cb => parseInt(cb.dataset.docId, 10))
    );
    const selectedDocs = this._documents.filter(d => selectedDocIds.has(d.id));
    if (selectedDocs.length > 0) {
      const list = selectedDocs.map(d => {
        let block = `  [Document] ${d.title}`;
        if (d.content) block += `\n${d.content.split('\n').map(l => `    ${l}`).join('\n')}`;
        return block;
      }).join('\n\n---\n\n');
      parts.push(`DOCUMENTS (${selectedDocs.length}):\n\n${list}`);
    }

    this._builtContext = parts.length > 0
      ? `You are an AI assistant for the following software project.\nUse this context accurately when answering. Do not invent details not present below.\n\n${parts.join('\n\n══════════════════════════════════════\n\n')}`
      : '';

    this._updateTokenEstimate();
    this._updateContextPreview();
    this._flashBuildButton();
  }

  _updateContextPreview() {
    const preview = this.container.querySelector('#aicCtxPreview');
    const previewWrap = this.container.querySelector('#aicCtxPreviewWrap');
    if (!preview || !previewWrap) return;

    if (this._builtContext) {
      preview.textContent = this._builtContext;
      previewWrap.style.display = 'block';
    } else {
      previewWrap.style.display = 'none';
    }
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
  _setHeaderFolderPath(folderPath) {
    const text    = this.container.querySelector('#aicHeaderFolderText');
    const display = this.container.querySelector('#aicHeaderFolderDisplay');
    if (!text || !display) return;
    text.textContent = folderPath;
    display.classList.add('project-page__folder-display--active');
  }

  _setGenerating(on) {
    this._isGenerating = on;

    const btnSend  = this.container.querySelector('#aicBtnSend');
    const iconSend = this.container.querySelector('#aicIconSend');
    const iconStop = this.container.querySelector('#aicIconStop');
    const ta       = this.container.querySelector('#aicInput');
    const btnClear = this.container.querySelector('#aicBtnClear');

    if (on) {
      if (iconSend) iconSend.style.display = 'none';
      if (iconStop) iconStop.style.display = '';
      if (btnSend)  { btnSend.classList.add('aic-btn-send--stop'); btnSend.title = 'Stop'; }
      if (ta)       ta.disabled            = true;
      if (btnClear) btnClear.disabled      = true;
    } else {
      if (iconSend) iconSend.style.display = '';
      if (iconStop) iconStop.style.display = 'none';
      if (btnSend)  { btnSend.classList.remove('aic-btn-send--stop'); btnSend.title = 'Send (Enter)'; }
      if (ta)       { ta.disabled = false; ta.focus(); }
      if (btnClear) btnClear.disabled = false;
    }
  }

  // ----------------------------------------------------------------
  // Prompt disclosure — shows the full prompt sent to the model
  // ----------------------------------------------------------------
  _appendPromptDisclosure(fullPrompt, model, autoBuilt = false) {
    const thread = this.container.querySelector('#aicThread');
    if (!thread) return;
    const div = document.createElement('div');
    div.innerHTML = this._promptDisclosureHtml(fullPrompt, model, autoBuilt);
    thread.appendChild(div.firstElementChild);
    this._scrollThread();
  }

  _promptDisclosureHtml(fullPrompt, model, autoBuilt = false) {
    const tokens     = estimateTokens(fullPrompt);
    const modelLabel = model ? `${model.label} · ${model.type.toUpperCase()}` : 'model';
    const hasCtx     = this._builtContext && fullPrompt.startsWith(this._builtContext);

    // Split prompt into context block and user message for display
    const contextBlock = hasCtx ? this._builtContext : '';
    const userBlock    = hasCtx
      ? fullPrompt.slice(this._builtContext.length).replace(/^\n+---\n+/, '').trim()
      : fullPrompt;

    const autoBadge = autoBuilt
      ? `<span class="aic-prompt-disc__auto-badge">auto-context</span>`
      : '';

    const noContextNote = !contextBlock ? `
      <div class="aic-prompt-disc__no-ctx">
        No context slices selected — only the message was sent.
        Check slices on the right to include project data.
      </div>` : '';

    const contextSection = contextBlock ? `
      <div class="aic-prompt-disc__section">
        <div class="aic-prompt-disc__section-label">
          <span class="aic-prompt-disc__tag aic-prompt-disc__tag--ctx">CONTEXT</span>
          <span class="aic-prompt-disc__section-meta">${estimateTokens(contextBlock).toLocaleString()} tokens</span>
        </div>
        <pre class="aic-prompt-disc__pre">${escapeHtml(contextBlock)}</pre>
      </div>` : '';

    const userSection = `
      <div class="aic-prompt-disc__section">
        <div class="aic-prompt-disc__section-label">
          <span class="aic-prompt-disc__tag aic-prompt-disc__tag--msg">MESSAGE</span>
          <span class="aic-prompt-disc__section-meta">${estimateTokens(userBlock).toLocaleString()} tokens</span>
        </div>
        <pre class="aic-prompt-disc__pre">${escapeHtml(userBlock)}</pre>
      </div>`;

    return `
      <div class="aic-prompt-disc" data-open="false">
        <button class="aic-prompt-disc__toggle">
          <svg class="aic-prompt-disc__chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
          </svg>
          <span class="aic-prompt-disc__label">
            Prompt sent to <strong>${escapeHtml(modelLabel)}</strong>
          </span>
          ${autoBadge}
          <span class="aic-prompt-disc__meta">~${tokens.toLocaleString()} tokens${contextBlock ? ' · with context' : ' · no context'}</span>
        </button>
        <div class="aic-prompt-disc__body" style="display:none">
          ${noContextNote}
          ${contextSection}
          ${userSection}
        </div>
      </div>
    `;
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
