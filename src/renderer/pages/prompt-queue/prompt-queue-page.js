import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme }              from '../../shared/theme-manager.js';
import { ModelConfigsModal }            from '../../components/model-configs/model-configs-modal.js';

const STATUS_ICONS = {
  pending: `<svg class="pq-icon" width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4"/></svg>`,
  running: `<svg class="pq-icon pq-icon--spin" width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="20 14" stroke-linecap="round"/></svg>`,
  done:    `<svg class="pq-icon pq-icon--done" width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2.5 8.5l3.5 3.5 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  failed:  `<svg class="pq-icon pq-icon--failed" width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  skipped: `<svg class="pq-icon pq-icon--skipped" width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 8h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
};

export class PromptQueuePage {
  constructor(container, params, router) {
    this.container   = container;
    this.router      = router;
    this.projectId   = params.projectId;
    this._from       = params.from || 'project-home';
    this._project    = null;
    this._queue      = [];
    this._selectedId = null;
    this._outputBuf  = {};
    this._isRunning  = false;
    this._runAll     = false;
    this._modelCfg   = null;
  }

  async mount() {
    injectCss('pages/prompt-queue/prompt-queue-page.css');
    applyStoredTheme();

    [this._project, this._queue] = await Promise.all([
      window.db.projects.get(this.projectId),
      window.db.promptQueue.list({ project_id: this.projectId }),
    ]);

    this.container.innerHTML = this._template();

    this._modelConfigsModal = new ModelConfigsModal({ onConfigsChanged: () => this._reloadModelDropdown() });
    this._modelConfigsModal.mount();
    await this._reloadModelDropdown();

    this._renderList();
    this._bindEvents();

    if (this._queue.length > 0) this._selectItem(this._queue[0]);
  }

  unmount() {
    removeCss('pages/prompt-queue/prompt-queue-page.css');
    if (this._isRunning) window.db.promptQueue.kill();
    window.db.promptQueue.removeListeners();
    this._runAll    = false;
    this._isRunning = false;
  }

  // ----------------------------------------------------------------
  // Template
  // ----------------------------------------------------------------
  _template() {
    return `
      <div class="pq-page">
        <header class="pq-header">
          <button class="pq-header__back" id="pqBtnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <span class="pq-header__title">Prompt Queue</span>
          <div class="project-page__model-group pq-header__model" style="-webkit-app-region:no-drag;">
            <svg class="project-page__model-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <select class="project-page__model-select" id="pqModelSelect" title="AI Model">
              <option value="">Loading…</option>
            </select>
            <button class="project-page__model-cfg-btn" id="pqBtnModelConfigs" title="Configure AI models">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </header>

        <div class="pq-toolbar">
          <span class="pq-toolbar__summary" id="pqSummary"></span>
          <div class="pq-toolbar__actions">
            <button class="pq-toolbar__btn pq-toolbar__btn--primary" id="pqBtnRunNext">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M4 3l9 5-9 5V3z" fill="currentColor"/></svg>
              Run Next
            </button>
            <button class="pq-toolbar__btn pq-toolbar__btn--primary" id="pqBtnRunAll">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 3l5 5-5 5V3zM9 3l5 5-5 5V3z" fill="currentColor"/></svg>
              Run All
            </button>
            <button class="pq-toolbar__btn pq-toolbar__btn--stop" id="pqBtnStop" hidden>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor"/></svg>
              Stop
            </button>
            <button class="pq-toolbar__btn" id="pqBtnClearDone">
              Clear Done
            </button>
          </div>
        </div>

        <div class="pq-layout">
          <div class="pq-list-panel" id="pqListPanel"></div>
          <div class="pq-detail-panel" id="pqDetailPanel">
            <div class="pq-detail-empty">Select an item to view details</div>
          </div>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // List rendering
  // ----------------------------------------------------------------
  _renderList() {
    const panel = this.container.querySelector('#pqListPanel');
    if (!panel) return;

    if (this._queue.length === 0) {
      panel.innerHTML = `<div class="pq-list-empty">No prompts queued yet.<br>Use the queue button on prompts in User Stories.</div>`;
      this._updateSummary();
      return;
    }

    panel.innerHTML = this._queue.map(item => this._itemHtml(item)).join('');

    panel.querySelectorAll('.pq-item').forEach(el => {
      el.addEventListener('click', () => {
        const id   = parseInt(el.dataset.id);
        const item = this._queue.find(q => q.id === id);
        if (item) this._selectItem(item);
      });
      el.querySelector('.pq-item__skip')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id   = parseInt(el.dataset.id);
        const item = this._queue.find(q => q.id === id);
        if (!item || item.status !== 'pending') return;
        await window.db.promptQueue.update({ id, status: 'skipped' });
        item.status = 'skipped';
        this._refreshItemEl(id);
        this._updateSummary();
        if (this._selectedId === id) this._renderDetail(item);
      });
      el.querySelector('.pq-item__delete')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(el.dataset.id);
        if (this._isRunning && this._selectedId === id) return;
        await window.db.promptQueue.delete(id);
        this._queue = this._queue.filter(q => q.id !== id);
        el.remove();
        if (this._queue.length === 0) {
          panel.innerHTML = `<div class="pq-list-empty">No prompts queued yet.<br>Use the queue button on prompts in User Stories.</div>`;
        }
        if (this._selectedId === id) {
          this._selectedId = null;
          const detailPanel = this.container.querySelector('#pqDetailPanel');
          if (detailPanel) detailPanel.innerHTML = `<div class="pq-detail-empty">Select an item to view details</div>`;
        }
        this._updateSummary();
      });
    });

    if (this._selectedId) {
      const el = panel.querySelector(`[data-id="${this._selectedId}"]`);
      if (el) el.classList.add('pq-item--selected');
    }

    this._updateSummary();
  }

  _itemHtml(item) {
    const icon    = STATUS_ICONS[item.status] || STATUS_ICONS.pending;
    const label   = item.tag || item.story_title || `Item ${item.id}`;
    const snippet = (item.prompt_text || '').split('\n')[0].slice(0, 60);
    const canSkip = item.status === 'pending';
    const canDel  = item.status !== 'running';

    return `
      <div class="pq-item pq-item--${item.status}${this._selectedId === item.id ? ' pq-item--selected' : ''}" data-id="${item.id}">
        <span class="pq-item__icon">${icon}</span>
        <div class="pq-item__body">
          <div class="pq-item__label">${escHtml(label)}</div>
          <div class="pq-item__snippet">${escHtml(snippet)}</div>
        </div>
        <div class="pq-item__actions">
          ${canSkip ? `<button class="pq-item__skip" title="Skip">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4 8h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </button>` : ''}
          ${canDel ? `<button class="pq-item__delete" title="Remove">
            <svg width="10" height="10" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>` : ''}
        </div>
      </div>`;
  }

  _refreshItemEl(id) {
    const item = this._queue.find(q => q.id === id);
    if (!item) return;
    const panel = this.container.querySelector('#pqListPanel');
    const el    = panel?.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    const selected = el.classList.contains('pq-item--selected');
    el.outerHTML = this._itemHtml(item);
    const newEl  = panel.querySelector(`[data-id="${id}"]`);
    if (!newEl) return;
    if (selected) newEl.classList.add('pq-item--selected');
    newEl.addEventListener('click', () => {
      const i = this._queue.find(q => q.id === id);
      if (i) this._selectItem(i);
    });
    newEl.querySelector('.pq-item__skip')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const i = this._queue.find(q => q.id === id);
      if (!i || i.status !== 'pending') return;
      await window.db.promptQueue.update({ id, status: 'skipped' });
      i.status = 'skipped';
      this._refreshItemEl(id);
      this._updateSummary();
      if (this._selectedId === id) this._renderDetail(i);
    });
    newEl.querySelector('.pq-item__delete')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (this._isRunning && this._selectedId === id) return;
      await window.db.promptQueue.delete(id);
      this._queue = this._queue.filter(q => q.id !== id);
      newEl.remove();
      if (this._selectedId === id) {
        this._selectedId = null;
        const detailPanel = this.container.querySelector('#pqDetailPanel');
        if (detailPanel) detailPanel.innerHTML = `<div class="pq-detail-empty">Select an item to view details</div>`;
      }
      this._updateSummary();
    });
  }

  _selectItem(item) {
    this._selectedId = item.id;
    const panel = this.container.querySelector('#pqListPanel');
    panel?.querySelectorAll('.pq-item').forEach(el => el.classList.remove('pq-item--selected'));
    panel?.querySelector(`[data-id="${item.id}"]`)?.classList.add('pq-item--selected');
    this._renderDetail(item);
  }

  // ----------------------------------------------------------------
  // Detail panel
  // ----------------------------------------------------------------
  _renderDetail(item) {
    const panel = this.container.querySelector('#pqDetailPanel');
    if (!panel) return;

    if (item.status === 'pending' || item.status === 'skipped') {
      panel.innerHTML = `
        <div class="pq-detail">
          <div class="pq-detail__meta">
            <span class="pq-detail__status pq-detail__status--${item.status}">${item.status}</span>
            ${item.story_title ? `<span class="pq-detail__story">${escHtml(item.story_title)}</span>` : ''}
            ${item.tag ? `<span class="pq-detail__tag">${escHtml(item.tag)}</span>` : ''}
            ${item.model_label ? `<span class="pq-detail__model">${escHtml(item.model_label)}</span>` : ''}
          </div>
          <div class="pq-detail__prompt-wrap">
            <div class="pq-detail__prompt">${this._renderMarkdown(item.prompt_text || '')}</div>
          </div>
          ${item.status === 'pending' ? `
          <div class="pq-detail__run-bar">
            <button class="pq-toolbar__btn pq-toolbar__btn--primary" id="pqBtnRunThis">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M4 3l9 5-9 5V3z" fill="currentColor"/></svg>
              Run This
            </button>
          </div>` : ''}
        </div>`;
      panel.querySelector('#pqBtnRunThis')?.addEventListener('click', () => {
        if (!this._isRunning) this._runItem(item);
      });
    } else {
      const output = this._outputBuf[item.id] || item.output || '';
      panel.innerHTML = `
        <div class="pq-detail">
          <div class="pq-detail__meta">
            <span class="pq-detail__status pq-detail__status--${item.status}">${item.status}</span>
            ${item.story_title ? `<span class="pq-detail__story">${escHtml(item.story_title)}</span>` : ''}
            ${item.tag ? `<span class="pq-detail__tag">${escHtml(item.tag)}</span>` : ''}
            ${item.ran_at ? `<span class="pq-detail__time">${new Date(item.ran_at + (item.ran_at.endsWith('Z') ? '' : 'Z')).toLocaleString()}</span>` : ''}
          </div>
          <pre class="pq-detail__output" id="pqOutputEl">${escHtml(output)}</pre>
        </div>`;
    }
  }

  _appendOutput(id, text) {
    this._outputBuf[id] = (this._outputBuf[id] || '') + text;
    if (this._selectedId === id) {
      const el = this.container.querySelector('#pqOutputEl');
      if (el) {
        el.textContent += text;
        el.scrollTop    = el.scrollHeight;
      }
    }
  }

  // ----------------------------------------------------------------
  // Run logic
  // ----------------------------------------------------------------
  async _runItem(item) {
    if (this._isRunning) return;
    this._isRunning = true;
    this._outputBuf[item.id] = '';

    item.status = 'running';
    const ranAt  = new Date().toISOString().replace('T', ' ').slice(0, 19);
    item.ran_at  = ranAt;
    await window.db.promptQueue.update({ id: item.id, status: 'running', ran_at: ranAt });

    this._refreshItemEl(item.id);
    this._updateSummary();
    this._updateToolbarRunState(true);
    if (this._selectedId === item.id) this._renderDetail(item);

    window.db.promptQueue.removeListeners();
    window.db.promptQueue.onData(({ text }) => this._appendOutput(item.id, text));
    window.db.promptQueue.onDone(async ({ exitCode }) => {
      window.db.promptQueue.removeListeners();
      this._isRunning = false;

      const succeeded = exitCode === 0;
      item.status     = succeeded ? 'done' : 'failed';
      item.exit_code  = exitCode;
      item.output     = this._outputBuf[item.id] || '';

      await window.db.promptQueue.update({
        id:        item.id,
        status:    item.status,
        output:    item.output,
        exit_code: exitCode,
      });

      this._refreshItemEl(item.id);
      this._updateSummary();
      this._updateToolbarRunState(false);
      if (this._selectedId === item.id) this._renderDetail(item);

      if (this._runAll && succeeded) {
        const next = this._queue.find(q => q.status === 'pending');
        if (next) {
          setTimeout(() => this._runItem(next), 200);
        } else {
          this._runAll = false;
          this._updateToolbarRunAllState(false);
        }
      } else if (this._runAll) {
        this._runAll = false;
        this._updateToolbarRunAllState(false);
      }
    });

    const cfg = this._modelCfg || {};
    window.db.promptQueue.run({
      promptText:  item.prompt_text,
      modelConfig: cfg,
      cwd:         this._project?.project_path || null,
    });
  }

  _updateToolbarRunState(running) {
    const stop    = this.container.querySelector('#pqBtnStop');
    const runNext = this.container.querySelector('#pqBtnRunNext');
    const runAll  = this.container.querySelector('#pqBtnRunAll');
    if (stop)    stop.hidden    = !running;
    if (runNext) runNext.hidden = running;
    if (runAll)  runAll.hidden  = running || this._runAll;
  }

  _updateToolbarRunAllState(active) {
    const runAll = this.container.querySelector('#pqBtnRunAll');
    const stop   = this.container.querySelector('#pqBtnStop');
    if (runAll) runAll.hidden = active;
    if (stop)   stop.hidden  = !active && !this._isRunning;
  }

  _updateSummary() {
    const el      = this.container.querySelector('#pqSummary');
    if (!el) return;
    const pending = this._queue.filter(q => q.status === 'pending').length;
    const done    = this._queue.filter(q => q.status === 'done').length;
    const failed  = this._queue.filter(q => q.status === 'failed').length;
    const parts   = [`${pending} pending`, `${done} done`];
    if (failed > 0) parts.push(`${failed} failed`);
    el.textContent = parts.join(' · ');
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
  // Model dropdown
  // ----------------------------------------------------------------
  async _reloadModelDropdown() {
    const select = this.container.querySelector('#pqModelSelect');
    if (!select) return;
    const configs  = await window.db.modelConfigs.list();
    const storedId = Number(localStorage.getItem('devflow-selected-model')) || null;
    const prevId   = storedId || (select.value ? Number(select.value) : null);
    select.innerHTML = configs.length === 0
      ? `<option value="">No models configured</option>`
      : configs.map(c => `<option value="${c.id}">${escHtml(c.label)} [${c.type.toUpperCase()}]</option>`).join('');
    const def    = configs.find(c => c.is_default) || configs[0];
    const target = configs.find(c => c.id === prevId) || def;
    if (target) { select.value = target.id; this._modelCfg = target; }
  }

  // ----------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------
  _bindEvents() {
    this.container.querySelector('#pqBtnBack')
      .addEventListener('click', () => this.router.navigate(this._from, { projectId: this.projectId }));

    this.container.querySelector('#pqBtnModelConfigs')
      .addEventListener('click', () => this._modelConfigsModal.show());

    this.container.querySelector('#pqModelSelect')
      .addEventListener('change', (e) => {
        const id = Number(e.target.value);
        localStorage.setItem('devflow-selected-model', id);
        window.db.modelConfigs.get(id).then(cfg => { this._modelCfg = cfg; });
      });

    this.container.querySelector('#pqBtnRunNext')
      .addEventListener('click', () => {
        if (this._isRunning) return;
        const next = this._queue.find(q => q.status === 'pending');
        if (next) this._runItem(next);
      });

    this.container.querySelector('#pqBtnRunAll')
      .addEventListener('click', () => {
        if (this._isRunning) return;
        const next = this._queue.find(q => q.status === 'pending');
        if (!next) return;
        this._runAll = true;
        this._updateToolbarRunAllState(true);
        this._selectItem(next);
        this._runItem(next);
      });

    this.container.querySelector('#pqBtnStop')
      .addEventListener('click', () => {
        this._runAll = false;
        window.db.promptQueue.kill();
        this._updateToolbarRunState(false);
        this._updateToolbarRunAllState(false);
      });

    this.container.querySelector('#pqBtnClearDone')
      .addEventListener('click', async () => {
        await window.db.promptQueue.clearDone(this.projectId);
        this._queue = this._queue.filter(q => !['done', 'failed', 'skipped'].includes(q.status));
        if (this._selectedId) {
          const stillExists = this._queue.find(q => q.id === this._selectedId);
          if (!stillExists) {
            this._selectedId = null;
            const detailPanel = this.container.querySelector('#pqDetailPanel');
            if (detailPanel) detailPanel.innerHTML = `<div class="pq-detail-empty">Select an item to view details</div>`;
          }
        }
        this._renderList();
      });
  }
}
