import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme }              from '../../shared/theme-manager.js';
import { ModelPicker }                   from '../../components/model-picker/model-picker.js';

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function stripAnsi(str) {
  return (str || '')
    .replace(/\x1B\[[0-9;]*[mGKHFJA-Za-z]/g, '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '');
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

    this._isGenerating  = false;
    this._streamingEl   = null;
    this._streamingText = '';
    this._messages      = [];
    this._project       = null;
  }

  get _selectedModel() { return this._picker?.selectedModel ?? null; }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  async mount() {
    injectCss('pages/ai-console/ai-console-page.css');
    applyStoredTheme();

    let _mapping;
    [this._project, _mapping] = await Promise.all([
      window.db.projects.get(this.projectId),
      window.db.modelMapping.get('ai-console'),
    ]);

    this.container.innerHTML = this._template();

    this._picker = new ModelPicker({
      anchor:    this.container.querySelector('#aicModelPicker'),
      onSelect:  () => {},
      initialId: _mapping?.model_config_id ?? null,
    });

    this._bindEvents();
    await this._picker.reload();
    this._enableUi();
    this._renderWelcome();
  }

  unmount() {
    window.app.chat.offAll();
    this._picker?.unmount();
    removeCss('pages/ai-console/ai-console-page.css');
  }

  // ----------------------------------------------------------------
  // UI ready state
  // ----------------------------------------------------------------
  _enableUi() {
    const ta = this.container.querySelector('#aicInput');
    if (ta) {
      ta.disabled    = false;
      ta.placeholder = 'Type a message… (Enter to send, Shift+Enter for new line)';
    }
    ['#aicBtnSend', '#aicBtnClear'].forEach(id => {
      const el = this.container.querySelector(id);
      if (el) el.disabled = false;
    });
  }

  _renderWelcome() {
    const thread = this.container.querySelector('#aicThread');
    if (!thread) return;
    const name = this._project?.name || 'your project';
    thread.innerHTML = `<p class="aic-thread__loading">
      Ready to help with <strong>${escHtml(name)}</strong>.
      Ask anything — I'll search your project data automatically.
    </p>`;
  }

  // ----------------------------------------------------------------
  // Intent routing — maps question keywords to data categories
  // ----------------------------------------------------------------
  _routeQuestion(question) {
    const q = question.toLowerCase();
    const tables = new Set();
    if (/\b(issue|bug|error|problem|fix|broken|fail|crash|defect|ticket|resolve|severity|critical|blocker|regression)\b/.test(q))
      tables.add('issues');
    if (/\b(workflow|feature|flow|story|requirement|use.?case|scenario|ui|ux|screen|frontend)\b/.test(q))
      tables.add('workflows');
    if (/\b(layer|architect|backend|service|api|module|tech|stack|infrastructure|setup|folder|repo|codebase)\b/.test(q))
      tables.add('layers');
    if (/\b(document|doc|spec|readme|guide|note|overview|summary|plan|roadmap)\b/.test(q))
      tables.add('documents');
    return tables.size > 0 ? [...tables] : ['issues', 'workflows', 'layers', 'documents'];
  }

  // ----------------------------------------------------------------
  // Fetch data — all queries stay on-device, model never sees schema
  // ----------------------------------------------------------------
  async _fetchData(tables) {
    const pid  = this.projectId;
    const data = {};
    await Promise.all([
      tables.includes('issues')    && window.db.issues.list({ project_id: pid }).then(r         => { data.issues    = r || []; }),
      tables.includes('workflows') && window.db.workflows.list(pid).then(r                      => { data.workflows = (r || []).filter(w => w.is_active !== 0); }),
      tables.includes('layers')    && window.db.projectLayers.list(pid).then(r                  => { data.layers    = r || []; }),
      tables.includes('documents') && window.db.documents.list(pid).then(r                      => { data.documents = r || []; }),
    ].filter(Boolean));
    return data;
  }

  // ----------------------------------------------------------------
  // Format fetched data as clean readable text — this is what the
  // model receives. No table names, no column names, no IDs.
  // ----------------------------------------------------------------
  _formatContext(data) {
    const { issues = [], workflows = [], layers = [], documents = [] } = data;
    const projectName = this._project?.name || '';
    const sep = '══════════════════════════════════════';
    const parts = [];

    if (issues.length) {
      const lines = issues.map(i => {
        let s = `• [${(i.severity || 'medium').toUpperCase()}] ${i.title}`;
        s += `\n  Status: ${i.status || 'open'}`;
        if (i.description)        s += `\n  Description: ${i.description}`;
        if (i.steps_to_reproduce) s += `\n  Steps: ${i.steps_to_reproduce}`;
        if (i.expected_behavior)  s += `\n  Expected: ${i.expected_behavior}`;
        if (i.actual_behavior)    s += `\n  Actual: ${i.actual_behavior}`;
        return s;
      });
      parts.push(`ISSUES (${issues.length}):\n\n${lines.join('\n\n')}`);
    }

    if (workflows.length) {
      const lines = workflows.map(w => {
        let s = `• ${w.feature}`;
        s += `\n  Status: ${w.status || 'open'} | Type: ${w.workflow_type || 'feature'}`;
        if (w.description) s += `\n  Description: ${w.description}`;
        return s;
      });
      parts.push(`WORKFLOWS (${workflows.length}):\n\n${lines.join('\n\n')}`);
    }

    if (layers.length) {
      const lines = layers.map(l => {
        let s = `• ${l.name}`;
        if (l.description)  s += `\n  Description: ${l.description}`;
        if (l.folder_path)  s += `\n  Path: ${l.folder_path}`;
        return s;
      });
      parts.push(`PROJECT LAYERS (${layers.length}):\n\n${lines.join('\n\n')}`);
    }

    if (documents.length) {
      const lines = documents.map(d => {
        let s = `• ${d.title}`;
        if (d.content) s += `\n${d.content.split('\n').slice(0, 20).map(l => `  ${l}`).join('\n')}`;
        return s;
      });
      parts.push(`DOCUMENTS (${documents.length}):\n\n${lines.join('\n\n---\n\n')}`);
    }

    if (!parts.length) return '';

    return `PROJECT: ${projectName}\n\n` +
      `You are an AI assistant. Answer using only the data below. Do not invent details.\n\n` +
      `${sep}\n\n` +
      parts.join(`\n\n${sep}\n\n`);
  }

  // ----------------------------------------------------------------
  // Smart Context panel — show status + formatted context preview
  // ----------------------------------------------------------------
  _setCtxStatus(state, text) {
    const el = this.container.querySelector('#aicCtxStatus');
    if (!el) return;
    el.className = `aic-query-status aic-qs--${state}`;
    el.innerHTML = state === 'searching'
      ? `<span class="aic-auto-ctx-spinner"></span>${escHtml(text)}`
      : escHtml(text);
  }

  _renderCtxPanel(data, formattedText) {
    // Summary tags
    const summary = this.container.querySelector('#aicCtxSummary');
    if (summary) {
      const tags = [
        data.issues?.length    && `<span class="aic-ctx-tag aic-ctx-tag--issues">Issues <b>${data.issues.length}</b></span>`,
        data.workflows?.length && `<span class="aic-ctx-tag aic-ctx-tag--workflows">Workflows <b>${data.workflows.length}</b></span>`,
        data.layers?.length    && `<span class="aic-ctx-tag aic-ctx-tag--layers">Layers <b>${data.layers.length}</b></span>`,
        data.documents?.length && `<span class="aic-ctx-tag aic-ctx-tag--docs">Documents <b>${data.documents.length}</b></span>`,
      ].filter(Boolean);
      summary.innerHTML = tags.length ? tags.join('') : '<span class="aic-ctx-empty">No matching data found</span>';
    }

    // Formatted context preview
    const wrap = this.container.querySelector('#aicCtxPreviewWrap');
    const pre  = this.container.querySelector('#aicCtxPreviewText');
    if (wrap && pre) {
      if (formattedText) {
        pre.textContent       = formattedText;
        wrap.style.display    = 'block';
        // Collapse on each new message
        pre.style.display     = 'none';
        wrap.dataset.expanded = 'false';
        const chevron = wrap.querySelector('.aic-ctx-chevron');
        if (chevron) chevron.style.transform = '';
      } else {
        wrap.style.display = 'none';
      }
    }
  }

  // ----------------------------------------------------------------
  // HTML template
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

          <div class="project-page__model-group" style="-webkit-app-region:no-drag;">
            <div id="aicModelPicker"></div>
          </div>
        </header>

        <!-- Body: context panel + chat -->
        <div class="aic-body">

          <!-- Context panel (left) -->
          <aside class="aic-context" id="aicContext">
            <div class="aic-panel-header">
              <span class="aic-panel-header__title">Smart Context</span>
            </div>
            <p class="aic-context__desc">Project data is fetched on-device and sent to the model as readable text. No schema is exposed.</p>

            <div id="aicCtxStatus" class="aic-query-status aic-qs--idle">
              Send a message — I'll fetch your project data automatically.
            </div>

            <div id="aicCtxSummary" class="aic-ctx-summary"></div>

            <!-- Formatted context preview -->
            <div id="aicCtxPreviewWrap" class="aic-ctx-preview-wrap" style="display:none">
              <button class="aic-ctx-preview-toggle" id="aicCtxPreviewToggle">
                <svg class="aic-ctx-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
                <span>Context sent to model</span>
              </button>
              <pre id="aicCtxPreviewText" class="aic-ctx-preview-pre" style="display:none"></pre>
            </div>

            <!-- Request sent to API -->
            <div id="aicRequestWrap" class="aic-ctx-preview-wrap" style="display:none">
              <button class="aic-ctx-preview-toggle aic-ctx-preview-toggle--request" id="aicRequestToggle">
                <svg class="aic-ctx-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
                <span>Request sent to API</span>
              </button>
              <pre id="aicRequestText" class="aic-ctx-preview-pre" style="display:none"></pre>
            </div>

            <!-- Response from model -->
            <div id="aicResponseWrap" class="aic-ctx-preview-wrap" style="display:none">
              <button class="aic-ctx-preview-toggle aic-ctx-preview-toggle--response" id="aicResponseToggle">
                <svg class="aic-ctx-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
                <span>Response from model</span>
              </button>
              <pre id="aicResponseText" class="aic-ctx-preview-pre" style="display:none"></pre>
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

          <!-- Chat column (right) -->
          <div class="aic-chat" id="aicChat">
            <div class="aic-panel-header">
              <span class="aic-panel-header__title">Chat</span>
            </div>

            <!-- Thread -->
            <div class="aic-thread" id="aicThread">
              <div class="aic-thread__loading">Loading…</div>
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
  // Markdown renderer
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

    q('#aicBtnBack').addEventListener('click', () =>
      this.router.navigate('project-home', { projectId: this.projectId }));

    q('#aicBtnSend').addEventListener('click', () => {
      if (this._isGenerating) this._handleStop();
      else this._handleSend();
    });

    q('#aicInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!this._isGenerating) this._handleSend();
      }
    });

    q('#aicBtnClear').addEventListener('click', () => this._handleClear());

    // Generic collapsible toggle for all inspector panels
    const bindToggle = (toggleId, wrapId, preId) => {
      const btn = q(toggleId);
      if (!btn) return;
      btn.addEventListener('click', () => {
        const wrap    = this.container.querySelector(wrapId);
        const pre     = this.container.querySelector(preId);
        const chevron = btn.querySelector('.aic-ctx-chevron');
        if (!pre) return;
        const expanded = wrap.dataset.expanded === 'true';
        pre.style.display     = expanded ? 'none' : 'block';
        wrap.dataset.expanded = expanded ? 'false' : 'true';
        if (chevron) chevron.style.transform = expanded ? '' : 'rotate(180deg)';
      });
    };

    bindToggle('#aicCtxPreviewToggle', '#aicCtxPreviewWrap', '#aicCtxPreviewText');
    bindToggle('#aicRequestToggle',    '#aicRequestWrap',    '#aicRequestText');
    bindToggle('#aicResponseToggle',   '#aicResponseWrap',   '#aicResponseText');

    // Prompt disclosure toggle — event delegation on thread
    this.container.querySelector('#aicThread').addEventListener('click', (e) => {
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


    // Auto-resize textarea
    const ta = q('#aicInput');
    if (ta) {
      ta.addEventListener('input', () => {
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
      });
    }
  }


  // ----------------------------------------------------------------
  // Show request / response in the inspection panels
  // ----------------------------------------------------------------
  _showInspectorPanel(wrapId, textId, content) {
    const wrap    = this.container.querySelector(wrapId);
    const pre     = this.container.querySelector(textId);
    const chevron = wrap?.querySelector('.aic-ctx-chevron');
    if (!wrap || !pre) return;
    pre.textContent       = content;
    wrap.style.display    = 'block';
    pre.style.display     = 'none';
    wrap.dataset.expanded = 'false';
    if (chevron) chevron.style.transform = '';
  }

  _clearInspectorPanels() {
    ['#aicRequestWrap', '#aicResponseWrap'].forEach(id => {
      const el = this.container.querySelector(id);
      if (el) el.style.display = 'none';
    });
  }

  // ----------------------------------------------------------------
  // Send — fetch → format → display context → stream answer
  // ----------------------------------------------------------------
  async _handleSend() {
    const ta       = this.container.querySelector('#aicInput');
    const userText = (ta?.value || '').trim();
    if (!userText) return;

    if (!this._selectedModel) {
      this._showThreadError('Please select a model first.');
      return;
    }

    this._setGenerating(true);
    if (ta) { ta.value = ''; ta.style.height = ''; }

    this._appendBubble({ role: 'user', text: userText });
    this._startStreaming();

    // 1. Detect intent — on-device, no model call
    this._setCtxStatus('searching', 'Fetching project data…');
    const tables = this._routeQuestion(userText);

    // 2. Fetch data — schema stays on-device
    let data = {};
    try {
      data = await this._fetchData(tables);
    } catch (err) {
      console.error('[AI Chat] fetch error:', err);
    }

    // 3. Format as readable text — what the model will receive
    const formattedContext = this._formatContext(data);

    // 4. Display the formatted context in the Smart Context panel
    const hasData = !!formattedContext;
    this._setCtxStatus('done', hasData ? 'Context ready — sent to model' : 'No matching data — sending question only');
    this._renderCtxPanel(data, formattedContext);

    // 5. Build prompt: formatted context + user question (no schema, no SQL)
    const userContent = hasData
      ? `${formattedContext}\n\n---\n\nQuestion: ${userText}`
      : userText;

    this._messages.push({ role: 'user', content: userContent });

    // 6. Show the full request payload for inspection
    this._showInspectorPanel('#aicRequestWrap', '#aicRequestText', userContent);

    // 6. Stream the answer
    window.app.chat.offAll();
    window.app.chat.onToken(p => this._onToken(p));
    window.app.chat.onDone(p  => this._onDone(p));
    window.app.chat.generate({ messages: this._messages, model: this._selectedModel });
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
    this._messages = [];
    this._setCtxStatus('idle', 'Send a message — I\'ll fetch your project data automatically.');
    const summary = this.container.querySelector('#aicCtxSummary');
    if (summary) summary.innerHTML = '';
    const wrap = this.container.querySelector('#aicCtxPreviewWrap');
    if (wrap) wrap.style.display = 'none';
    this._clearInspectorPanels();
    this._renderWelcome();
  }

  // ----------------------------------------------------------------
  // Streaming handlers
  // ----------------------------------------------------------------
  _startStreaming() {
    this._streamingText = '';
    const thread = this.container.querySelector('#aicThread');
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
    if (raw) {
      this._messages.push({ role: 'assistant', content: raw });
      this._showInspectorPanel('#aicResponseWrap', '#aicResponseText', raw);
    }
    if (payload.error && !raw) this._showThreadError(`AI error: ${payload.error}`);
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
  // UI helpers
  // ----------------------------------------------------------------
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
      if (ta)       ta.disabled       = true;
      if (btnClear) btnClear.disabled = true;
    } else {
      if (iconSend) iconSend.style.display = '';
      if (iconStop) iconStop.style.display = 'none';
      if (btnSend)  { btnSend.classList.remove('aic-btn-send--stop'); btnSend.title = 'Send (Enter)'; }
      if (ta)       { ta.disabled = false; ta.focus(); }
      if (btnClear) btnClear.disabled = false;
    }
  }

  // ----------------------------------------------------------------
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
