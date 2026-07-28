import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme }              from '../../shared/theme-manager.js';
import { ModelPicker }                   from '../../components/model-picker/model-picker.js';
import { ProjectSidebar }                from '../../components/project-sidebar/project-sidebar.js';
import { Dialog }                        from '../../components/dialog/dialog.js';

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

// Pulls table names out of a SELECT's FROM/JOIN clauses (dedup, order-preserving)
// so the query log can show "which tables" instead of raw SQL.
function extractTables(sql) {
  const tables = [];
  const re = /\b(?:from|join)\s+([a-zA-Z_][\w]*)/gi;
  let m;
  while ((m = re.exec(sql || ''))) {
    if (!tables.includes(m[1])) tables.push(m[1]);
  }
  return tables;
}

// Curated column allowlist per table — keeps the schema prompt minimal (no
// internal audit columns). PK/FK annotations are derived at runtime from
// window.db.aiSchema() so they always match the real DDL.
const SCHEMA_TABLE_COLUMNS = {
  projects:          ['id', 'name', 'description', 'project_path', 'is_active'],
  issues:            ['id', 'project_id', 'layer_id', 'title', 'severity', 'status', 'description', 'steps_to_reproduce', 'expected_behavior', 'actual_behavior'],
  workflows:         ['id', 'project_id', 'feature', 'description', 'status'],
  project_layers:    ['id', 'project_id', 'name', 'description', 'folder_path'],
  project_documents: ['id', 'project_id', 'title', 'content'],
  screen_designs:    ['id', 'project_id', 'title', 'description', 'tech_stack', 'queued', 'executed'],
};

// Table names shown to the user in the app don't always match the SQL table name —
// surface the app-facing name alongside the real one so the model still writes correct SQL.
const SCHEMA_TABLE_LABELS = {
  project_documents: 'Documents page',
  screen_designs:    'Mockups page',
};

// Cap how many prior exchanges get resent as context on each turn — keeps
// token usage bounded on long sessions. Full history still renders in the
// thread and stays in this._messages; only what's sent to the model is capped.
const MAX_HISTORY_TURNS = 10;

const SCHEMA_ENUM_NOTES = {
  projects:       { is_active: '1 = active project, 0 = archived/inactive' },
  issues:         { severity: 'critical | high | medium | low', status: 'open | in_progress | resolved | closed' },
  workflows:      { status: 'open | in_progress | completed | differed' },
  screen_designs: { queued: '0 | 1 (boolean)', executed: '0 | 1 (boolean)' },
};

// ----------------------------------------------------------------
// Session-only chat history, keyed by project id — a module-level Map so
// it survives navigating away and back (the page instance itself is torn
// down and recreated by the router on every navigation, see router.js).
// Cleared only by the Clear button or an app restart; never touches disk.
// ----------------------------------------------------------------
const _sessionHistory = new Map();

function _getSession(projectId) {
  let session = _sessionHistory.get(projectId);
  if (!session) {
    session = { messages: [], consentedModelId: null };
    _sessionHistory.set(projectId, session);
  }
  return session;
}

// ----------------------------------------------------------------
// Page class
// ----------------------------------------------------------------
export class AiConsolePage {
  constructor(container, params, router) {
    this.container = container;
    this.router    = router;
    this.projectId = params.projectId;

    this._isGenerating      = false;
    this._streamingEl       = null;
    this._streamingText     = '';
    this._session           = _getSession(this.projectId);
    this._messages          = this._session.messages;
    this._project           = null;
    this._loopAborted       = false;
    this._dbSchema          = null;
    this._consentedModelId  = this._session.consentedModelId;
  }

  get _selectedModel() { return this._picker?.selectedModel ?? null; }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  async mount() {
    injectCss('pages/ai-console/ai-console-page.css');
    injectCss('components/project-sidebar/project-sidebar.css');
    applyStoredTheme();

    let _mapping;
    [this._project, _mapping, this._dbSchema] = await Promise.all([
      window.db.projects.get(this.projectId),
      window.db.modelMapping.get('ai-console'),
      window.db.aiSchema(),
    ]);

    this.container.innerHTML = this._template();

    this._picker = new ModelPicker({
      anchor:    this.container.querySelector('#aicModelPicker'),
      onSelect:  () => this._updatePrivacyWarning(),
      initialId: _mapping?.model_config_id ?? null,
    });

    this._bindEvents();
    this._sidebar.bindEvents(this.container);
    this._sidebar.loadCounts(this.container);
    await this._picker.reload();
    this._updatePrivacyWarning();
    this._enableUi();

    if (this._messages.length) {
      this._renderExistingThread();
      const { omitted } = this._getTruncatedHistory();
      this._updateHistoryNotice(omitted);
    } else {
      this._renderWelcome();
    }
  }

  unmount() {
    window.app.chat.offAll();
    this._picker?.unmount();
    removeCss('pages/ai-console/ai-console-page.css');
    removeCss('components/project-sidebar/project-sidebar.css');
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

  // ----------------------------------------------------------------
  // Data-sharing warning — shown whenever the selected model isn't a
  // local Ollama model, since the schema + query results leave the device.
  // ----------------------------------------------------------------
  _updatePrivacyWarning() {
    const el = this.container.querySelector('#aicPrivacyWarning');
    if (!el) return;
    const model   = this._selectedModel;
    const isLocal = model?.type === 'ollama';
    el.hidden = !model || isLocal;
    if (model && !isLocal) {
      el.querySelector('.aic-privacy-warning__text').textContent =
        `Your message will be sent to "${model.label}" to answer this — only local Ollama models keep everything on-device.`;
    }
  }

  // ----------------------------------------------------------------
  // History-cap notice — shown once the conversation exceeds what's sent
  // to the model, so the truncation isn't silent.
  // ----------------------------------------------------------------
  _updateHistoryNotice(omitted) {
    const el = this.container.querySelector('#aicHistoryNotice');
    if (!el) return;
    el.hidden = omitted <= 0;
    if (omitted > 0) {
      el.querySelector('.aic-history-notice__text').textContent =
        `Only the last ${MAX_HISTORY_TURNS} exchanges are sent as context — ${omitted} earlier message${omitted === 1 ? '' : 's'} omitted.`;
    }
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

  // Rebuilds the thread from session-restored history (e.g. after navigating
  // back to this page) — mirrors the bubbles _appendBubble/_finalizeStream
  // would have produced live, just replayed in one pass.
  _renderExistingThread() {
    const thread = this.container.querySelector('#aicThread');
    if (!thread) return;
    thread.innerHTML = this._messages
      .map(m => this._bubbleHtml({ role: m.role, text: m.content }))
      .join('');
    this._scrollThread();
  }

  // ----------------------------------------------------------------
  // Minimal schema prompt — curated columns only, but PK/FK annotations
  // are pulled live from window.db.aiSchema() so they can't drift from
  // the real DDL (schema.js).
  // ----------------------------------------------------------------
  _buildSchemaPrompt() {
    const pid    = this.projectId;
    const name   = this._project?.name || 'this project';
    const schema = this._dbSchema || {};

    const tableBlocks = Object.keys(SCHEMA_TABLE_COLUMNS).map(table => {
      const allowedCols = SCHEMA_TABLE_COLUMNS[table];
      const def         = schema[table] || { columns: [], foreignKeys: [] };
      const pkNames     = new Set(def.columns.filter(c => c.pk).map(c => c.name));
      const fkByColumn  = new Map(
        def.foreignKeys
          // project_id already resolves to a known literal (${pid}) — never worth joining to "projects"
          .filter(fk => fk.refTable !== 'projects')
          .map(fk => [fk.column, fk])
      );

      const colList = allowedCols
        .map(col => pkNames.has(col) ? `${col} (PK)` : col)
        .join(', ');

      const notes = [];
      for (const col of allowedCols) {
        const enumVals = SCHEMA_ENUM_NOTES[table]?.[col];
        if (enumVals) notes.push(`                     ${col.padEnd(10)}: ${enumVals}`);
        const fk = fkByColumn.get(col);
        if (fk) notes.push(`                     ${col.padEnd(10)}: FK → ${fk.refTable}.${fk.refColumn}`);
      }

      const label = SCHEMA_TABLE_LABELS[table] ? `  -- ${SCHEMA_TABLE_LABELS[table]}` : '';
      return `  ${table.padEnd(18)}(${colList})${label}${notes.length ? '\n' + notes.join('\n') : ''}`;
    }).join('\n\n');

    return `You are a data assistant for the project "${name}".

Available tables — the "projects" table below describes the project itself and is filtered by
id = ${pid}. Every other table has its own "id" (PK) and a "project_id" column; filter those
directly with project_id = ${pid}. Never join to "projects" to look up project details — its
values (name, description, project_path) are already retrievable with a direct query if needed:

${tableBlocks}

Rules:
- For "projects", filter with id = ${pid}. For every other table, filter with project_id = ${pid}.
- Never join to "projects" — filter directly using the literal id above instead.
- Only join between the other tables listed above, using the FK column noted (e.g. issues.layer_id = project_layers.id).

When you need data reply with ONLY a SQL block — no other text:
\`\`\`sql
SELECT ...
\`\`\`
You may query up to 3 times. After receiving data give your final answer in plain text.`;
  }

  // ----------------------------------------------------------------
  // Keep only the last MAX_HISTORY_TURNS user/assistant pairs when building
  // the context sent to the model — this._messages (and the visible thread)
  // still hold the full conversation, only the outgoing payload is capped.
  // ----------------------------------------------------------------
  _getTruncatedHistory() {
    const maxMessages = MAX_HISTORY_TURNS * 2;
    const omitted = Math.max(0, this._messages.length - maxMessages);
    const history = omitted > 0 ? this._messages.slice(omitted) : this._messages;
    return { history, omitted };
  }

  // ----------------------------------------------------------------
  // Extract first ```sql … ``` block from a model response
  // ----------------------------------------------------------------
  _extractSql(text) {
    const m = text.match(/```sql\s*([\s\S]+?)```/i);
    return m ? m[1].trim() : null;
  }

  // ----------------------------------------------------------------
  // Silent model call — collects full response without streaming
  // ----------------------------------------------------------------
  _callSilent(messages) {
    return new Promise((resolve, reject) => {
      let collected = '';
      window.app.chat.offAll();
      window.app.chat.onToken(p => { collected += stripAnsi(p.text || ''); });
      window.app.chat.onDone(p => {
        const raw = stripAnsi(p.raw || collected).trim();
        if (p.error && !raw) reject(new Error(p.error));
        else resolve(raw);
      });
      window.app.chat.generate({ messages, model: this._selectedModel, cwd: this._project?.project_path || undefined });
    });
  }

  // ----------------------------------------------------------------
  // SQL loop — up to 3 silent rounds, then stream final answer
  // ----------------------------------------------------------------
  async _runSqlLoop(messages) {
    const MAX = 3;
    this._resetQueryLog();

    for (let round = 0; round < MAX; round++) {
      if (this._loopAborted) return false;

      this._setQueryStatus('searching', `Round ${round + 1} — waiting for model…`);

      let response;
      try { response = await this._callSilent(messages); }
      catch (err) { this._setQueryStatus('error', `Model error: ${err.message}`); return false; }

      if (this._loopAborted) return false;

      const sql = this._extractSql(response);

      if (!sql) {
        // Model answered directly — render as final answer
        this._setQueryStatus('done', `Done — ${round === 0 ? 'answered without querying' : `${round} quer${round === 1 ? 'y' : 'ies'} run`}`);
        this._finalizeStream(response || '[No response]');
        this._setGenerating(false);
        if (response) this._messages.push({ role: 'assistant', content: response });
        this._showInspectorPanel('#aicResponseWrap', '#aicResponseText', response);
        return true;
      }

      // Execute query on-device
      let rows = [], queryError;
      try { rows = await window.db.aiQuery(sql); }
      catch (err) { queryError = err.message; rows = []; }

      this._appendQueryEntry(sql, rows, queryError);

      const resultMsg = queryError
        ? `Query error: ${queryError}`
        : `Query result (${rows.length} row${rows.length !== 1 ? 's' : ''}):\n${JSON.stringify(rows, null, 2)}`;

      messages.push({ role: 'assistant', content: response });
      messages.push({ role: 'user',      content: resultMsg });
    }

    if (this._loopAborted) return false;

    this._setQueryStatus('done', `${MAX} queries run — generating answer…`);
    return false;
  }

  // ----------------------------------------------------------------
  // Query log panel
  // ----------------------------------------------------------------
  _resetQueryLog() {
    const log = this.container.querySelector('#aicQueryLog');
    if (log) log.innerHTML = '';
    this._setQueryStatus('idle', 'Querying project data…');
  }

  _setQueryStatus(state, text) {
    const el = this.container.querySelector('#aicQueryStatus');
    if (!el) return;
    el.className = `aic-query-status aic-qs--${state}`;
    el.innerHTML = state === 'searching'
      ? `<span class="aic-auto-ctx-spinner"></span>${escHtml(text)}`
      : escHtml(text);
  }

  _appendQueryEntry(sql, rows, error) {
    const log = this.container.querySelector('#aicQueryLog');
    if (!log) return;
    const tables = extractTables(sql);
    const tablesHtml = tables.length
      ? tables.map(t => `<span class="aic-query-entry__table">${escapeHtml(t)}</span>`).join('')
      : '<span class="aic-query-entry__table aic-query-entry__table--unknown">unknown table</span>';
    const entry = document.createElement('div');
    entry.className = 'aic-query-entry';
    entry.title = sql;
    entry.innerHTML = `
      <div class="aic-query-entry__tables">${tablesHtml}</div>
      <div class="aic-query-entry__meta ${error ? 'aic-query-entry__meta--error' : ''}">
        ${error ? `Error: ${escapeHtml(error)}` : `${rows.length} row${rows.length !== 1 ? 's' : ''} returned`}
      </div>`;
    log.appendChild(entry);
  }

  // ----------------------------------------------------------------
  // HTML template
  // ----------------------------------------------------------------
  _template() {
    const name    = this._project?.name ?? 'Project';
    const initial = this._project?.name?.trim()[0]?.toUpperCase() ?? '?';
    this._sidebar = new ProjectSidebar({ projectId: this.projectId, router: this.router, activeRoute: 'ai-console' });
    return `
      <div class="ph-project-shell">

        <!-- Header -->
        <header class="project-home__header">
          <button class="project-home__back" id="aicBtnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div class="project-home__badge">
            <div class="project-home__badge-initial">${initial}</div>
            <span class="project-home__badge-name">${escHtml(name)}</span>
          </div>
          <span class="ph-header-page-chip">AI Chat</span>
          <div class="ph-header-actions">
            <div class="project-page__model-group">
              <div id="aicModelPicker"></div>
            </div>
          </div>
        </header>

        <div class="ph-page-with-nav">
          ${this._sidebar.html()}
          <div class="aic-page">
            <!-- Body: context panel + chat -->
            <div class="aic-body">

          <!-- Context panel (left) -->
          <aside class="aic-context" id="aicContext">
            <div class="aic-panel-header">
              <span class="aic-panel-header__title">Smart Context</span>
            </div>
            <div id="aicPrivacyWarning" class="aic-privacy-warning" hidden>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span class="aic-privacy-warning__text"></span>
            </div>

            <div id="aicHistoryNotice" class="aic-history-notice" hidden>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span class="aic-history-notice__text"></span>
            </div>

            <div class="aic-info-card">
              <svg class="aic-info-card__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <span class="aic-info-card__text">Model writes SELECT queries; data is fetched on-device and returned to the model. Minimal schema only — no internal columns exposed.</span>
            </div>

            <div id="aicQueryStatus" class="aic-query-status aic-qs--idle">
              Send a message — queries will appear here.
            </div>

            <div id="aicQueryLog" class="aic-query-log"></div>

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

    bindToggle('#aicRequestToggle',  '#aicRequestWrap',  '#aicRequestText');
    bindToggle('#aicResponseToggle', '#aicResponseWrap', '#aicResponseText');

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
  // Send — SQL loop (schema prompt → model writes SQL → execute →
  //         repeat up to 3×) then stream final answer
  // ----------------------------------------------------------------
  async _handleSend() {
    const ta       = this.container.querySelector('#aicInput');
    const userText = (ta?.value || '').trim();
    if (!userText) return;

    if (!this._selectedModel) {
      this._showThreadError('Please select a model first.');
      return;
    }

    if (this._selectedModel.type !== 'ollama' && this._consentedModelId !== this._selectedModel.id) {
      const ok = await Dialog.confirm(
        `This will send your question to "${this._selectedModel.label}" to answer it. Only local Ollama models keep everything on-device.`,
        { title: 'Send data to external model?', confirmText: 'Continue', cancelText: 'Cancel' }
      );
      if (!ok) return;
      this._consentedModelId = this._selectedModel.id;
      this._session.consentedModelId = this._consentedModelId;
    }

    this._loopAborted = false;
    this._setGenerating(true);
    if (ta) { ta.value = ''; ta.style.height = ''; }

    this._appendBubble({ role: 'user', text: userText });
    this._startStreaming();
    this._clearInspectorPanels();

    // Build a per-turn message list: system schema + capped conversation history + new question
    const schemaPrompt = this._buildSchemaPrompt();
    const { history, omitted } = this._getTruncatedHistory();
    const loopMessages = [
      { role: 'user', content: schemaPrompt },
      ...history,
      { role: 'user', content: userText },
    ];
    this._updateHistoryNotice(omitted);

    // Show the initial request (schema + question) in the inspector
    this._showInspectorPanel('#aicRequestWrap', '#aicRequestText',
      `--- SCHEMA PROMPT ---\n${schemaPrompt}\n\n--- USER QUESTION ---\n${userText}`);

    // Track the user turn for conversation history
    this._messages.push({ role: 'user', content: userText });

    // Run SQL loop; returns true if it already rendered the answer
    const handled = await this._runSqlLoop(loopMessages);
    if (handled || this._loopAborted) return;

    // SQL loop exhausted rounds without answering directly — stream final answer
    window.app.chat.offAll();
    window.app.chat.onToken(p => this._onToken(p));
    window.app.chat.onDone(p  => this._onDone(p));
    window.app.chat.generate({ messages: loopMessages, model: this._selectedModel, cwd: this._project?.project_path || undefined });
  }

  // ----------------------------------------------------------------
  // Stop
  // ----------------------------------------------------------------
  _handleStop() {
    this._loopAborted = true;
    window.app.chat.cancel();
    this._finalizeStream(this._streamingText.trim() || '[stopped]');
    this._setGenerating(false);
    this._setQueryStatus('idle', 'Stopped.');
  }

  // ----------------------------------------------------------------
  // Clear
  // ----------------------------------------------------------------
  _handleClear() {
    if (this._isGenerating) return;
    this._messages = [];
    this._session.messages = this._messages;
    this._consentedModelId = null;
    this._session.consentedModelId = null;
    this._setQueryStatus('idle', 'Send a message — queries will appear here.');
    const log = this.container.querySelector('#aicQueryLog');
    if (log) log.innerHTML = '';
    this._clearInspectorPanels();
    this._updateHistoryNotice(0);
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
