import { escHtml, injectCss } from '../../../../shared/helpers.js';

export class DocumentsModal {
  constructor({ projectId }) {
    this._projectId    = projectId;
    this._overlay      = null;
    this._docs         = [];
    this._activeId     = null;
    this._dirty        = false;
    this._attachments  = [];  // cached for current doc
    this._drawioFiles  = new Map(); // attachId -> temp filepath (set after Open in draw.io)
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
          <aside class="doc-sidebar">
            <div class="doc-sidebar__toolbar">
              <button class="doc-sidebar__add" id="docAddBtn" title="New document">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
                New
              </button>
            </div>
            <div class="doc-sidebar__list" id="docList">${this._renderList()}</div>
          </aside>
          <div class="doc-panel" id="docPanel"></div>
        </div>
      </div>
    `;
  }

  _renderList() {
    if (this._docs.length === 0) return '<p class="doc-sidebar__empty">No documents yet</p>';
    return this._docs.map(d => `
      <div class="doc-sidebar__item${d.id === this._activeId ? ' doc-sidebar__item--active' : ''}" data-id="${d.id}">
        <svg class="doc-sidebar__item-icon" width="11" height="11" viewBox="0 0 16 16" fill="none">
          <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
          <path d="M10 2v3h3" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
        </svg>
        <span class="doc-sidebar__item-title">${escHtml(d.title)}</span>
        <button class="doc-sidebar__item-del" data-del="${d.id}" title="Delete" aria-label="Delete">
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
            <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    `).join('');
  }

  _showEmpty() {
    const panel = this._overlay.querySelector('#docPanel');
    panel.innerHTML = `
      <div class="doc-panel__empty">
        <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
          <path d="M8 4h10l6 6v18a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z" stroke="#4b5563" stroke-width="1.4" stroke-linejoin="round"/>
          <path d="M18 4v6h6" stroke="#4b5563" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
        <p>Select or create a document</p>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // Right panel: editor
  // ----------------------------------------------------------------
  async _selectDoc(id, switchToEdit = false) {
    this._activeId = id;
    const doc = this._docs.find(d => d.id === id);
    if (!doc) return;

    this._overlay.querySelectorAll('.doc-sidebar__item').forEach(el => {
      el.classList.toggle('doc-sidebar__item--active', Number(el.dataset.id) === id);
    });

    // Load attachments for this document
    this._attachments = await window.db.attachments.list(id);

    const panel      = this._overlay.querySelector('#docPanel');
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
            placeholder="Write your document in Markdown…\n\nReference attachments with: [My Diagram](attach:ID)">${escHtml(doc.content || '')}</textarea>
        </div>
        <div class="doc-editor__pane doc-editor__pane--preview${initialTab === 'preview' ? '' : ' doc-editor__pane--hidden'}" data-pane="preview">
          ${this._renderMarkdown(doc.content || '')}
        </div>

        <!-- Attachments bar -->
        <div class="doc-attach-bar">
          <div class="doc-attach-bar__header" id="docAttachToggle">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M13.5 8.5l-5.5 5.5a4 4 0 01-5.66-5.66l6-6a2.5 2.5 0 013.54 3.54l-6.01 6a1 1 0 01-1.41-1.42l5.5-5.5"
                stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Attachments</span>
            <span class="doc-attach-bar__count" id="docAttachCount">${this._attachments.length}</span>
            <svg class="doc-attach-bar__chevron" width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="doc-attach-bar__body" id="docAttachBody">
            <div class="doc-attach-list" id="docAttachList">
              ${this._renderAttachList()}
            </div>
            <div class="doc-attach-actions">
              <button class="doc-attach-add-btn" id="docAddSvg">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
                Add SVG
              </button>
              <button class="doc-attach-add-btn" id="docAddDrawio">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
                Add draw.io
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this._dirty = false;
    this._bindEditorEvents(doc);
    this._bindAttachEvents(doc);

    // Bind attachment links in preview
    if (initialTab === 'preview') this._bindAttachLinks(panel);
  }

  _renderAttachList() {
    if (this._attachments.length === 0) {
      return '<span class="doc-attach-empty">No attachments yet — add SVG or draw.io files below</span>';
    }
    return this._attachments.map(a => `
      <div class="doc-attach-item" data-attach-id="${a.id}">
        <span class="doc-attach-item__type doc-attach-item__type--${a.type}">${a.type === 'drawio' ? 'draw.io' : 'SVG'}</span>
        <span class="doc-attach-item__name">${escHtml(a.name)}</span>
        <span class="doc-attach-item__ref">attach:${a.id}</span>
        <div class="doc-attach-item__actions">
          <button class="doc-attach-item__btn" data-view="${a.id}" title="View">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.4"/>
              <circle cx="8" cy="8" r="2" fill="currentColor"/>
            </svg>
          </button>
          ${a.type === 'drawio' ? `
          <button class="doc-attach-item__btn" data-drawio="${a.id}" title="Open in draw.io">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <path d="M10 2h4v4M14 2L8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="doc-attach-item__btn" data-sync="${a.id}" title="Sync changes from draw.io back into the document">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M2 8a6 6 0 0110.5-4M14 8a6 6 0 01-10.5 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <path d="M12 2v3h3M1 11v3h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>` : ''}
          <button class="doc-attach-item__btn doc-attach-item__btn--del" data-del-attach="${a.id}" title="Delete">
            <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');
  }

  // ----------------------------------------------------------------
  // Editor events
  // ----------------------------------------------------------------
  _bindEditorEvents(doc) {
    const panel       = this._overlay.querySelector('#docPanel');
    const titleInput  = panel.querySelector('#docTitleInput');
    const contentTA   = panel.querySelector('#docContentTA');
    const saveBtn     = panel.querySelector('#docSaveBtn');
    const tabs        = panel.querySelectorAll('.doc-editor__tab');
    const editPane    = panel.querySelector('[data-pane="edit"]');
    const previewPane = panel.querySelector('[data-pane="preview"]');

    titleInput.addEventListener('input', () => { this._dirty = true; });
    contentTA.addEventListener('input',  () => { this._dirty = true; });

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('doc-editor__tab--active'));
        tab.classList.add('doc-editor__tab--active');
        if (tab.dataset.tab === 'preview') {
          previewPane.innerHTML = this._renderMarkdown(contentTA.value);
          editPane.classList.add('doc-editor__pane--hidden');
          previewPane.classList.remove('doc-editor__pane--hidden');
          this._bindAttachLinks(panel);
        } else {
          previewPane.classList.add('doc-editor__pane--hidden');
          editPane.classList.remove('doc-editor__pane--hidden');
          contentTA.focus();
        }
      });
    });

    // Attachment toggle
    panel.querySelector('#docAttachToggle').addEventListener('click', () => {
      panel.querySelector('#docAttachBody').classList.toggle('doc-attach-bar__body--open');
      panel.querySelector('.doc-attach-bar__chevron').classList.toggle('doc-attach-bar__chevron--open');
    });

    const save = async () => {
      const title   = titleInput.value.trim();
      const content = contentTA.value;
      if (!title) { titleInput.focus(); return; }
      saveBtn.disabled = true; saveBtn.textContent = 'Saving\u2026';
      try {
        await window.db.documents.update({ id: doc.id, title, content });
        const idx = this._docs.findIndex(d => d.id === doc.id);
        if (idx !== -1) { this._docs[idx].title = title; this._docs[idx].content = content; }
        this._dirty = false;
        this._refreshList();
      } finally { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    };

    saveBtn.addEventListener('click', save);
    panel.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 's') { e.preventDefault(); save(); } });
  }

  // ----------------------------------------------------------------
  // Attachment events
  // ----------------------------------------------------------------
  _bindAttachEvents(doc) {
    const panel = this._overlay.querySelector('#docPanel');

    panel.querySelector('#docAddSvg').addEventListener('click', () => {
      this._showAttachForm(doc.id, 'svg');
    });
    panel.querySelector('#docAddDrawio').addEventListener('click', () => {
      this._showAttachForm(doc.id, 'drawio');
    });

    this._bindAttachListEvents(panel, doc.id);
  }

  _bindAttachListEvents(panel, docId) {
    const list = panel.querySelector('#docAttachList');
    if (!list) return;

    list.addEventListener('click', async e => {
      // View
      const viewBtn = e.target.closest('[data-view]');
      if (viewBtn) {
        const id = Number(viewBtn.dataset.view);
        const att = await window.db.attachments.getContent(id);
        if (att) this._showAttachLightbox(att);
        return;
      }
      // Open in draw.io
      const drawioBtn = e.target.closest('[data-drawio]');
      if (drawioBtn) {
        const id  = Number(drawioBtn.dataset.drawio);
        const att = await window.db.attachments.getContent(id);
        if (!att) return;
        const filepath = await window.shell.openDrawio({ id, name: att.name, content: att.content });
        // Remember the temp filepath so Sync can read it back
        this._drawioFiles.set(id, filepath);
        return;
      }
      // Sync from draw.io
      const syncBtn = e.target.closest('[data-sync]');
      if (syncBtn) {
        const id = Number(syncBtn.dataset.sync);
        const filepath = this._drawioFiles.get(id);
        if (!filepath) {
          this._showToast('Open in draw.io first, then click Sync to save your edits');
          return;
        }
        const content = await window.shell.readFile(filepath);
        if (content) {
          const att = this._attachments.find(a => a.id === id);
          await window.db.attachments.update({ id, name: att?.name, content });
          this._showToast('✓ Synced from draw.io');
        } else {
          this._showToast('Could not read file — make sure draw.io has saved it');
        }
        return;
      }
      // Delete
      const delBtn = e.target.closest('[data-del-attach]');
      if (delBtn) {
        const id = Number(delBtn.dataset.delAttach);
        if (!confirm('Delete this attachment?')) return;
        await window.db.attachments.delete(id);
        this._attachments = this._attachments.filter(a => a.id !== id);
        this._refreshAttachList(panel);
      }
    });
  }

  _refreshAttachList(panel) {
    const list  = panel.querySelector('#docAttachList');
    const count = panel.querySelector('#docAttachCount');
    if (list)  list.innerHTML = this._renderAttachList();
    if (count) count.textContent = this._attachments.length;
    // Re-bind since list was replaced
    const docId = this._activeId;
    if (list) this._bindAttachListEvents(panel, docId);
  }

  // ----------------------------------------------------------------
  // Add attachment form
  // ----------------------------------------------------------------
  _showAttachForm(docId, type) {
    this._overlay.querySelector('.doc-attach-form-overlay')?.remove();

    const label    = type === 'svg' ? 'SVG' : 'draw.io';
    const ph       = type === 'svg'
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">\n  <!-- paste your SVG code here -->\n</svg>'
      : '<!-- Paste your draw.io XML here -->\n<mxfile ...>';

    const formEl = document.createElement('div');
    formEl.className = 'doc-attach-form-overlay';
    formEl.innerHTML = `
      <div class="doc-attach-form">
        <div class="doc-attach-form__header">
          <span>Add ${label} Attachment</span>
          <button class="doc-tpl-close" id="attachFormClose">&times;</button>
        </div>
        <div class="doc-attach-form__body">
          <label class="doc-attach-form__label">Name</label>
          <input class="doc-attach-form__input" id="attachName" placeholder="e.g. Architecture Diagram" autocomplete="off"/>
          <label class="doc-attach-form__label" style="margin-top:10px">${label} Code</label>
          <textarea class="doc-attach-form__textarea" id="attachContent" placeholder="${escHtml(ph)}" spellcheck="false"></textarea>
          ${type === 'svg' ? '<p class="doc-attach-form__hint">Paste SVG code from Figma, draw.io export, Excalidraw, or hand-written SVG.</p>' :
            '<p class="doc-attach-form__hint">Paste draw.io XML. Use File \u2192 Export \u2192 XML in draw.io desktop, or copy from a .drawio file.</p>'}
        </div>
        <div class="doc-attach-form__footer">
          <button class="doc-attach-form__btn doc-attach-form__btn--cancel" id="attachFormCancel">Cancel</button>
          <button class="doc-attach-form__btn doc-attach-form__btn--save" id="attachFormSave">Add ${label}</button>
        </div>
      </div>
    `;

    this._overlay.querySelector('.doc-dialog').appendChild(formEl);

    const nameInput    = formEl.querySelector('#attachName');
    const contentInput = formEl.querySelector('#attachContent');
    const close        = () => formEl.remove();

    formEl.querySelector('#attachFormClose').addEventListener('click', close);
    formEl.querySelector('#attachFormCancel').addEventListener('click', close);

    formEl.querySelector('#attachFormSave').addEventListener('click', async () => {
      const name    = nameInput.value.trim();
      const content = contentInput.value.trim();
      if (!name)    { nameInput.focus(); return; }
      if (!content) { contentInput.focus(); return; }

      const att = await window.db.attachments.create({ document_id: docId, name, type, content });
      this._attachments.push(att);
      const panel = this._overlay.querySelector('#docPanel');
      this._refreshAttachList(panel);
      // Auto-open attachment bar
      const body = panel.querySelector('#docAttachBody');
      const chev = panel.querySelector('.doc-attach-bar__chevron');
      if (body && !body.classList.contains('doc-attach-bar__body--open')) {
        body.classList.add('doc-attach-bar__body--open');
        chev?.classList.add('doc-attach-bar__chevron--open');
      }
      close();
    });

    nameInput.focus();
  }

  // ----------------------------------------------------------------
  // Lightbox
  // ----------------------------------------------------------------
  _showAttachLightbox(att) {
    const existing = document.querySelector('.doc-lightbox');
    if (existing) existing.remove();

    const lb = document.createElement('div');
    lb.className = 'doc-lightbox';

    // Resolve SVG source — for draw.io extract the embedded <svg> if present
    let svgSource = null;
    if (att.type === 'svg') {
      svgSource = att.content;
    } else {
      const m = att.content.match(/<svg[\s\S]*?<\/svg>/i);
      if (m) svgSource = m[0];
    }

    let bodyHtml = '';
    let openDrawioId = null;
    if (svgSource) {
      // Render as <img> with data URI — fully isolated from page CSS cascade
      const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgSource)}`;
      bodyHtml = `<img class="doc-lightbox__svg-img" src="${dataUri}" alt="${escHtml(att.name)}"/>`;
    } else if (att.type === 'drawio') {
      // draw.io XML — can't render inline; show info + open button
      openDrawioId = att.id;
      bodyHtml = `
        <div class="doc-lightbox__drawio-info">
          <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
            <rect x="3" y="5" width="26" height="22" rx="2" stroke="#94a3b8" stroke-width="1.4"/>
            <path d="M10 13l4 4-4 4M16 21h6" stroke="#94a3b8" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p class="doc-lightbox__drawio-name">${escHtml(att.name)}</p>
          <p style="font-size:12px;color:#94a3b8">draw.io diagrams can\u2019t be previewed inline.<br>Open in draw.io desktop to view or edit.</p>
          <button class="doc-lightbox__open-drawio-btn" style="margin-top:8px;padding:7px 18px;background:#6366f1;border:none;border-radius:6px;color:#fff;font-size:12px;font-family:inherit;font-weight:500;cursor:pointer;">
            Open in draw.io
          </button>
        </div>`;
    } else {
      bodyHtml = `<p style="color:#94a3b8;font-size:13px;">Cannot preview this attachment.</p>`;
    }

    lb.innerHTML = `
      <div class="doc-lightbox__dialog">
        <div class="doc-lightbox__header">
          <span class="doc-lightbox__title">${escHtml(att.name)}</span>
          <button class="doc-lightbox__close">&times;</button>
        </div>
        <div class="doc-lightbox__body">${bodyHtml}</div>
      </div>
    `;

    document.body.appendChild(lb);
    lb.querySelector('.doc-lightbox__close').addEventListener('click', () => lb.remove());
    const escH = e => { if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', escH); } };
    document.addEventListener('keydown', escH);

    // "Open in draw.io" button inside the lightbox
    const openBtn = lb.querySelector('.doc-lightbox__open-drawio-btn');
    if (openBtn && openDrawioId != null) {
      openBtn.addEventListener('click', async () => {
        const full = await window.db.attachments.getContent(openDrawioId);
        if (!full) return;
        const filepath = await window.shell.openDrawio({ id: full.id ?? openDrawioId, name: full.name, content: full.content });
        this._drawioFiles.set(openDrawioId, filepath);
        lb.remove();
        document.removeEventListener('keydown', escH);
      });
    }
  }

  // ----------------------------------------------------------------
  // Bind attach:ID links in preview pane
  // ----------------------------------------------------------------
  _bindAttachLinks(panel) {
    panel.querySelectorAll('a[data-attach-id]').forEach(a => {
      a.addEventListener('click', async e => {
        e.preventDefault();
        const id  = Number(a.dataset.attachId);
        const att = await window.db.attachments.getContent(id);
        if (att) this._showAttachLightbox(att);
      });
    });
  }

  // ----------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------
  _bindEvents() {
    this._overlay.querySelector('#docClose').addEventListener('click', () => this._close());
    this._escHandler = e => { if (e.key === 'Escape') this._close(); };
    document.addEventListener('keydown', this._escHandler);
    this._overlay.querySelector('#docAddBtn').addEventListener('click', () => this._addDoc());
    this._overlay.querySelector('#docList').addEventListener('click', e => {
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
    if (!listEl) return;
    listEl.innerHTML = this._renderList();
    listEl.addEventListener('click', e => {
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
    this._overlay.querySelector('.doc-tpl-picker')?.remove();
    const picker = document.createElement('div');
    picker.className = 'doc-tpl-picker';
    picker.innerHTML = `
      <div class="doc-tpl-dialog">
        <div class="doc-tpl-header">
          <span class="doc-tpl-title">Choose a Template</span>
          <button class="doc-tpl-close">&times;</button>
        </div>
        <div class="doc-tpl-list">
          ${templates.map(t => `
            <button class="doc-tpl-item" data-name="${escHtml(t.name)}" data-text="${escHtml(t.template_text)}">
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
        await this._selectDoc(doc.id, true);
        const ti = this._overlay.querySelector('#docTitleInput');
        if (ti) { ti.focus(); ti.select(); }
      });
    });
  }

  async _deleteDoc(id) {
    if (!confirm('Delete this document?')) return;
    await window.db.documents.delete(id);
    this._docs = this._docs.filter(d => d.id !== id);
    if (this._activeId === id) this._activeId = this._docs[0]?.id ?? null;
    this._refreshList();
    if (this._activeId) await this._selectDoc(this._activeId);
    else                this._showEmpty();
  }

  // ----------------------------------------------------------------
  // Toast
  // ----------------------------------------------------------------
  _showToast(msg) {
    const t = document.createElement('div');
    t.className = 'doc-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }

  // ----------------------------------------------------------------
  // Markdown renderer
  // ----------------------------------------------------------------
  _renderMarkdown(text) {
    if (!text || !text.trim()) return '<p class="doc-preview__hint">Nothing to preview yet.</p>';
    const esc   = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = text.split('\n');
    const out   = [];
    let inCode  = false, codeLines = [];
    let inUl    = false, inOl = false;
    let inSvg   = false, svgLines = [];
    let lastBlock = '';

    const closeList = () => {
      if (inUl) { out.push('</ul>'); inUl = false; lastBlock = 'list'; }
      if (inOl) { out.push('</ol>'); inOl = false; lastBlock = 'list'; }
    };

    for (const line of lines) {
      // SVG passthrough
      if (!inCode && !inSvg && line.trimStart().toLowerCase().startsWith('<svg')) {
        closeList();
        inSvg = true; svgLines = [line];
        if (line.includes('</svg>')) {
          const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgLines.join('\n'))}`;
          out.push(`<img class="md-svg-img" src="${uri}" alt="diagram"/>`);
          svgLines = []; inSvg = false; lastBlock = 'svg';
        }
        continue;
      }
      if (inSvg) {
        svgLines.push(line);
        if (line.includes('</svg>')) {
          const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgLines.join('\n'))}`;
          out.push(`<img class="md-svg-img" src="${uri}" alt="diagram"/>`);
          svgLines = []; inSvg = false; lastBlock = 'svg';
        }
        continue;
      }
      // Code blocks
      if (line.trimStart().startsWith('```')) {
        closeList();
        if (inCode) { out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`); codeLines = []; inCode = false; lastBlock = 'code'; }
        else        { inCode = true; }
        continue;
      }
      if (inCode) { codeLines.push(esc(line)); continue; }
      // Headings
      const hm = line.match(/^(#{1,6})\s+(.*)/);
      if (hm) { closeList(); out.push(`<h${hm[1].length}>${esc(hm[2])}</h${hm[1].length}>`); lastBlock = 'heading'; continue; }
      // HR
      if (/^[-*_]{3,}\s*$/.test(line)) { closeList(); out.push('<hr>'); lastBlock = 'hr'; continue; }
      // UL
      const ulm = line.match(/^[-*+]\s+(.*)/);
      if (ulm) { if (inOl) { out.push('</ol>'); inOl = false; } if (!inUl) { out.push('<ul>'); inUl = true; } out.push(`<li>${this._inlineMd(esc(ulm[1]))}</li>`); lastBlock = 'list'; continue; }
      // OL
      const olm = line.match(/^\d+\.\s+(.*)/);
      if (olm) { if (inUl) { out.push('</ul>'); inUl = false; } if (!inOl) { out.push('<ol>'); inOl = true; } out.push(`<li>${this._inlineMd(esc(olm[1]))}</li>`); lastBlock = 'list'; continue; }
      // Blockquote
      const bqm = line.match(/^>\s?(.*)/);
      if (bqm) { closeList(); out.push(`<blockquote>${this._inlineMd(esc(bqm[1]))}</blockquote>`); lastBlock = 'blockquote'; continue; }
      // Blank
      if (line.trim() === '') { closeList(); if (lastBlock === 'p') { out.push('<br>'); lastBlock = 'br'; } continue; }
      // Paragraph
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
      .replace(/`([^`]+)`/g,           '<code>$1</code>')
      .replace(/\*\*\*(.+?)\*\*\*/g,   '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g,       '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,           '<em>$1</em>')
      .replace(/~~(.+?)~~/g,           '<del>$1</del>')
      // attach:ID links — rendered as clickable badge
      .replace(/\[([^\]]+)\]\(attach:(\d+)\)/g,
        '<a class="doc-attach-link" data-attach-id="$2" href="#">$1</a>')
      // regular links
      .replace(/\[([^\]]+)\]\((?!attach:)([^)]+)\)/g,
        '<a href="$2" target="_blank">$1</a>');
  }
}
