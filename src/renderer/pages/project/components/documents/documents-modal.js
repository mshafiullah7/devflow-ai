import { escHtml, injectCss } from '../../../../shared/helpers.js';

/**
 * DocumentsModal — full-screen modal for project markdown documents.
 *
 * Layout:
 *   Left sidebar  — list of documents + add/delete controls
 *   Right panel   — Edit / Preview tabs for the selected document's content
 *
 * Default view: Preview mode.
 */
export class DocumentsModal {
  constructor({ projectId }) {
    this._projectId = projectId;
    this._overlay   = null;
    this._docs      = [];
    this._activeId  = null;
    this._dirty     = false;
  }

  mount() {
    injectCss('pages/project/components/documents/documents-modal.css');
  }

  async show() {
    this._overlay?.remove();
    this._docs     = await window.db.documents.list(this._projectId);
    this._activeId = this._docs[0]?.id ?? null;

    this._overlay = document.createElement('div');
    this._overlay.className = 'doc-overlay';
    this._overlay.innerHTML = this._template();
    document.body.appendChild(this._overlay);

    this._bindEvents();
    if (this._activeId) this._selectDoc(this._activeId, false);
    else                this._showEmpty();
  }

  // ----------------------------------------------------------------
  // Template
  // ----------------------------------------------------------------
  _template() {
    return `
      <div class="doc-dialog">
        <div class="doc-dialog__header">
          <span class="doc-dialog__title">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 2h5l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"
                stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
              <path d="M9 2v3h3" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
              <path d="M5.5 8h5M5.5 10.5h5M5.5 13h3"
                stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            Documents
          </span>
          <button class="doc-dialog__close" id="docClose" aria-label="Close">&times;</button>
        </div>

        <div class="doc-dialog__body">

          <!-- Left sidebar -->
          <aside class="doc-sidebar">
            <div class="doc-sidebar__toolbar">
              <button class="doc-sidebar__add" id="docAddBtn" title="New document">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
                New
              </button>
            </div>
            <div class="doc-sidebar__list" id="docList">
              ${this._renderList()}
            </div>
          </aside>

          <!-- Right editor/preview panel -->
          <div class="doc-panel" id="docPanel">
            <!-- filled by _selectDoc or _showEmpty -->
          </div>

        </div>
      </div>
    `;
  }

  _renderList() {
    if (this._docs.length === 0) {
      return '<p class="doc-sidebar__empty">No documents yet</p>';
    }
    return this._docs.map(d => `
      <div class="doc-sidebar__item${d.id === this._activeId ? ' doc-sidebar__item--active' : ''}"
           data-id="${d.id}">
        <svg class="doc-sidebar__item-icon" width="11" height="11" viewBox="0 0 16 16" fill="none">
          <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z"
            stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
          <path d="M10 2v3h3" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
        </svg>
        <span class="doc-sidebar__item-title">${escHtml(d.title)}</span>
        <button class="doc-sidebar__item-del" data-del="${d.id}" title="Delete document" aria-label="Delete">
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
            <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8"
              stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    `).join('');
  }

  // ----------------------------------------------------------------
  // Right panel: empty state
  // ----------------------------------------------------------------
  _showEmpty() {
    const panel = this._overlay.querySelector('#docPanel');
    panel.innerHTML = `
      <div class="doc-panel__empty">
        <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
          <path d="M8 4h10l6 6v18a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z"
            stroke="#4b5563" stroke-width="1.4" stroke-linejoin="round"/>
          <path d="M18 4v6h6" stroke="#4b5563" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
        <p>Select or create a document</p>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // Right panel: editor for a document
  // ----------------------------------------------------------------
  _selectDoc(id, switchToEdit = false) {
    this._activeId = id;
    const doc = this._docs.find(d => d.id === id);
    if (!doc) return;

    // Highlight active item in list
    this._overlay.querySelectorAll('.doc-sidebar__item').forEach(el => {
      el.classList.toggle('doc-sidebar__item--active', Number(el.dataset.id) === id);
    });

    const panel = this._overlay.querySelector('#docPanel');
    const initialTab = switchToEdit ? 'edit' : 'preview';

    panel.innerHTML = `
      <div class="doc-editor">
        <div class="doc-editor__toolbar">
          <input class="doc-editor__title-input" id="docTitleInput"
            value="${escHtml(doc.title)}" placeholder="Document title" maxlength="200" autocomplete="off"/>
          <div class="doc-editor__tabs">
            <button class="doc-editor__tab${initialTab === 'edit' ? ' doc-editor__tab--active' : ''}" data-tab="edit">Edit</button>
            <button class="doc-editor__tab${initialTab === 'preview' ? ' doc-editor__tab--active' : ''}" data-tab="preview">Preview</button>
          </div>
          <button class="doc-editor__save" id="docSaveBtn">Save</button>
        </div>

        <div class="doc-editor__pane doc-editor__pane--edit${initialTab === 'edit' ? '' : ' doc-editor__pane--hidden'}" data-pane="edit">
          <textarea class="doc-editor__textarea" id="docContentTA"
            placeholder="Write your document in Markdown…">${escHtml(doc.content || '')}</textarea>
        </div>
        <div class="doc-editor__pane doc-editor__pane--preview${initialTab === 'preview' ? '' : ' doc-editor__pane--hidden'}" data-pane="preview">
          ${this._renderMarkdown(doc.content || '')}
        </div>
      </div>
    `;

    this._dirty = false;
    this._bindEditorEvents(doc);
  }

  _bindEditorEvents(doc) {
    const panel      = this._overlay.querySelector('#docPanel');
    const titleInput = panel.querySelector('#docTitleInput');
    const contentTA  = panel.querySelector('#docContentTA');
    const saveBtn    = panel.querySelector('#docSaveBtn');
    const tabs       = panel.querySelectorAll('.doc-editor__tab');
    const editPane   = panel.querySelector('[data-pane="edit"]');
    const previewPane = panel.querySelector('[data-pane="preview"]');

    const markDirty = () => { this._dirty = true; };
    titleInput.addEventListener('input', markDirty);
    contentTA.addEventListener('input', markDirty);

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('doc-editor__tab--active'));
        tab.classList.add('doc-editor__tab--active');
        if (tab.dataset.tab === 'preview') {
          previewPane.innerHTML = this._renderMarkdown(contentTA.value);
          editPane.classList.add('doc-editor__pane--hidden');
          previewPane.classList.remove('doc-editor__pane--hidden');
        } else {
          previewPane.classList.add('doc-editor__pane--hidden');
          editPane.classList.remove('doc-editor__pane--hidden');
          contentTA.focus();
        }
      });
    });

    const save = async () => {
      const title   = titleInput.value.trim();
      const content = contentTA.value;
      if (!title) { titleInput.focus(); return; }

      saveBtn.disabled    = true;
      saveBtn.textContent = 'Saving…';
      try {
        await window.db.documents.update({ id: doc.id, title, content });
        // Update local cache
        const idx = this._docs.findIndex(d => d.id === doc.id);
        if (idx !== -1) {
          this._docs[idx].title   = title;
          this._docs[idx].content = content;
        }
        this._dirty = false;
        this._refreshList();
      } finally {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Save';
      }
    };

    saveBtn.addEventListener('click', save);
    panel.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); save(); }
    });
  }

  // ----------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------
  _bindEvents() {
    // Close button
    this._overlay.querySelector('#docClose').addEventListener('click', () => this._close());

    // Escape key
    this._escHandler = (e) => { if (e.key === 'Escape') this._close(); };
    document.addEventListener('keydown', this._escHandler);

    // New document
    this._overlay.querySelector('#docAddBtn').addEventListener('click', () => this._addDoc());

    // List item click + delete
    this._overlay.querySelector('#docList').addEventListener('click', (e) => {
      const delBtn = e.target.closest('[data-del]');
      if (delBtn) { e.stopPropagation(); this._deleteDoc(Number(delBtn.dataset.del)); return; }
      const item = e.target.closest('[data-id]');
      if (item) this._selectDoc(Number(item.dataset.id));
    });
  }

  _close() {
    document.removeEventListener('keydown', this._escHandler);
    this._overlay.remove();
    this._overlay = null;
  }

  _refreshList() {
    const listEl = this._overlay.querySelector('#docList');
    if (listEl) listEl.innerHTML = this._renderList();

    // Re-bind list clicks (list was replaced)
    listEl.addEventListener('click', (e) => {
      const delBtn = e.target.closest('[data-del]');
      if (delBtn) { e.stopPropagation(); this._deleteDoc(Number(delBtn.dataset.del)); return; }
      const item = e.target.closest('[data-id]');
      if (item) this._selectDoc(Number(item.dataset.id));
    });
  }

  async _addDoc() {
    const templates = await window.db.documentTemplates.list();
    this._showTemplatePicker(templates);
  }

  _showTemplatePicker(templates) {
    // Remove any existing picker
    this._overlay.querySelector('.doc-tpl-picker')?.remove();

    const picker = document.createElement('div');
    picker.className = 'doc-tpl-picker';
    picker.innerHTML = `
      <div class="doc-tpl-dialog">
        <div class="doc-tpl-header">
          <span class="doc-tpl-title">Choose a Template</span>
          <button class="doc-tpl-close" aria-label="Close">&times;</button>
        </div>
        <div class="doc-tpl-list">
          ${templates.map(t => `
            <button class="doc-tpl-item" data-id="${t.id}" data-name="${escHtml(t.name)}" data-text="${escHtml(t.template_text)}">
              <span class="doc-tpl-item__name">${escHtml(t.name)}</span>
              ${t.description ? `<span class="doc-tpl-item__desc">${escHtml(t.description)}</span>` : ''}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    this._overlay.querySelector('.doc-dialog').appendChild(picker);

    picker.querySelector('.doc-tpl-close').addEventListener('click', () => picker.remove());

    picker.querySelectorAll('.doc-tpl-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        picker.remove();
        const title   = btn.dataset.name === 'Empty Document' ? 'Untitled Document' : btn.dataset.name;
        const content = btn.dataset.text || '';
        const doc     = await window.db.documents.create({ project_id: this._projectId, title, content });
        this._docs.push(doc);
        this._activeId = doc.id;
        this._refreshList();
        this._selectDoc(doc.id, true);
        const ti = this._overlay.querySelector('#docTitleInput');
        if (ti) { ti.focus(); ti.select(); }
      });
    });
  }

  async _deleteDoc(id) {
    if (!confirm('Delete this document?')) return;
    await window.db.documents.delete(id);
    this._docs = this._docs.filter(d => d.id !== id);

    if (this._activeId === id) {
      this._activeId = this._docs[0]?.id ?? null;
    }
    this._refreshList();
    if (this._activeId) this._selectDoc(this._activeId);
    else                this._showEmpty();
  }

  // ----------------------------------------------------------------
  // Markdown renderer (same logic as user-story-detail)
  // ----------------------------------------------------------------
  _renderMarkdown(text) {
    if (!text || !text.trim()) {
      return '<p class="doc-preview__hint">Nothing to preview yet.</p>';
    }
    const esc      = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines    = text.split('\n');
    const out      = [];
    let inCode     = false;
    let codeLines  = [];
    let inUl       = false;
    let inOl       = false;
    let lastBlock  = '';

    const closeList = () => {
      if (inUl) { out.push('</ul>'); inUl = false; lastBlock = 'list'; }
      if (inOl) { out.push('</ol>'); inOl = false; lastBlock = 'list'; }
    };

    for (const line of lines) {
      if (line.trimStart().startsWith('```')) {
        closeList();
        if (inCode) {
          out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
          codeLines = [];
          inCode    = false;
          lastBlock = 'code';
        } else {
          inCode = true;
        }
        continue;
      }
      if (inCode) { codeLines.push(esc(line)); continue; }

      const hm = line.match(/^(#{1,6})\s+(.*)/);
      if (hm) {
        closeList();
        out.push(`<h${hm[1].length}>${esc(hm[2])}</h${hm[1].length}>`);
        lastBlock = 'heading';
        continue;
      }

      if (/^[-*_]{3,}\s*$/.test(line)) { closeList(); out.push('<hr>'); lastBlock = 'hr'; continue; }

      const ulm = line.match(/^[-*+]\s+(.*)/);
      if (ulm) {
        if (inOl) { out.push('</ol>'); inOl = false; }
        if (!inUl) { out.push('<ul>'); inUl = true; }
        out.push(`<li>${this._inlineMd(esc(ulm[1]))}</li>`);
        lastBlock = 'list';
        continue;
      }

      const olm = line.match(/^\d+\.\s+(.*)/);
      if (olm) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (!inOl) { out.push('<ol>'); inOl = true; }
        out.push(`<li>${this._inlineMd(esc(olm[1]))}</li>`);
        lastBlock = 'list';
        continue;
      }

      const bqm = line.match(/^>\s?(.*)/);
      if (bqm) {
        closeList();
        out.push(`<blockquote>${this._inlineMd(esc(bqm[1]))}</blockquote>`);
        lastBlock = 'blockquote';
        continue;
      }

      if (line.trim() === '') {
        closeList();
        if (lastBlock === 'p') { out.push('<br>'); lastBlock = 'br'; }
        continue;
      }

      closeList();
      out.push(`<p>${this._inlineMd(esc(line))}</p>`);
      lastBlock = 'p';
    }

    closeList();
    if (inCode) out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
    return out.join('');
  }

  _inlineMd(s) {
    return s
      .replace(/`([^`]+)`/g,          '<code>$1</code>')
      .replace(/\*\*\*(.+?)\*\*\*/g,  '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g,      '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,          '<em>$1</em>')
      .replace(/~~(.+?)~~/g,          '<del>$1</del>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  }
}
