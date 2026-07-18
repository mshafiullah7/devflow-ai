import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelPicker }       from '../../components/model-picker/model-picker.js';
import { Dialog }            from '../../components/dialog/dialog.js';
import { ProjectSidebar }    from '../../components/project-sidebar/project-sidebar.js';

const AI_MODE_HINTS = {
  ask:  { placeholder: 'Ask a question about the document…', welcome: 'Ask a question about the document, or switch to Edit mode to make AI-driven changes.' },
  edit: { placeholder: 'e.g. Add a deployment section based on the architecture diagram', welcome: 'Describe what changes to make. The AI has full context of the document and any attached diagrams.' },
};

export class DocumentsPage {
  constructor(container, params, router) {
    this.container      = container;
    this.router         = router;
    this._projectId     = params.projectId;
    this._docTitle      = params.docTitle || null;
    this._project       = null;
    this._docs          = [];
    this._activeId      = null;
    this._dirty         = false;
    this._attachments   = [];
    this._drawioFiles   = new Map();
    this._aiModelConfig = null;
    this._layers        = [];
    this._chatHistory   = [];
    this._aiRunning     = false;
    this._aiAbortController = null;
    this._aiIsCli       = false;
  }

  async mount() {
    injectCss('pages/documents/documents-page.css');
    injectCss('components/project-sidebar/project-sidebar.css');
    applyStoredTheme();

    let _mapping;
    [this._project, this._docs, _mapping, this._layers] = await Promise.all([
      window.db.projects.get(this._projectId),
      window.db.documents.list(this._projectId),
      window.db.modelMapping.get('documents'),
      window.db.projectLayers.list(this._projectId),
    ]);

    if (this._docTitle) {
      const match = this._docs.find(d => d.title.toLowerCase() === this._docTitle.toLowerCase());
      if (match) {
        this._activeId = match.id;
      } else {
        const templates = await window.db.documentTemplates.list();
        const tpl = templates.find(t => t.name.toLowerCase() === this._docTitle.toLowerCase());
        const content = tpl ? tpl.template_text : '';
        const created = await window.db.documents.create({ project_id: this._projectId, title: this._docTitle, content });
        this._docs.push(created);
        this._activeId = created.id;
      }
    } else {
      this._activeId = this._docs[0]?.id ?? null;
    }

    this.container.innerHTML = this._pageTemplate();

    this._picker = new ModelPicker({
      anchor:    this.container.querySelector('#docModelPicker'),
      onSelect:  model => {
        const prevType = this._aiModelConfig?.type;
        this._aiModelConfig = model;
        // Different provider families don't share prompt/response conventions —
        // start the thread over rather than feeding one provider's history to another.
        if (prevType && model?.type && model.type !== prevType && this._chatHistory.length > 0) {
          this._resetAiChat();
        }
      },
      initialId: _mapping?.model_config_id ?? null,
    });
    await this._picker.reload();


    this._bindShellEvents();
    this._sidebar.bindEvents(this.container);
    this._sidebar.loadCounts(this.container, { documents: this._docs, layers: this._layers });

    this.router.setNavigationGuard(() => this._confirmLeaveIfBusy());

    if (this._activeId) this._selectDoc(this._activeId, false);
    else                this._showEmpty();
  }

  unmount() {
    this.router.clearNavigationGuard();
    removeCss('pages/documents/documents-page.css');
    removeCss('components/project-sidebar/project-sidebar.css');
    this._picker?.unmount();
    document.querySelector('.doc-attach-form-overlay')?.remove();
  }

  // ----------------------------------------------------------------
  // AI-busy guard — blocks document switches, tab switches, page
  // navigation, and app close while a request is streaming.
  // ----------------------------------------------------------------
  async _confirmLeaveIfBusy() {
    if (!this._aiRunning) return true;
    const ok = await Dialog.confirm(
      'AI Assist is still generating a response for this document. Leaving now will cancel the generation and it cannot be resumed.',
      { title: 'AI Assist is running', confirmText: 'Leave Anyway', danger: true }
    );
    if (ok) this._cancelAiRequest();
    return ok;
  }

  _cancelAiRequest() {
    this._aiAbortController?.abort();
    if (this._aiIsCli) window.db.terminal.killActive();
    this._aiRunning = false;
  }

  // ----------------------------------------------------------------
  // Page shell
  // ----------------------------------------------------------------
  _pageTemplate() {
    const name    = this._project?.name ?? 'Project';
    const initial = name.trim()[0]?.toUpperCase() ?? '?';
    this._sidebar = new ProjectSidebar({ projectId: this._projectId, router: this.router, activeRoute: 'documents' });
    return `
      <div class="ph-project-shell">

        <header class="project-home__header">
          <button class="project-home__back" id="btnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div class="project-home__badge">
            <div class="project-home__badge-initial">${escHtml(initial)}</div>
            <span class="project-home__badge-name">${escHtml(name)}</span>
          </div>
          <span class="ph-header-page-chip">Documents</span>
          <div class="ph-header-actions">
            <div id="docModelPicker"></div>
          </div>
        </header>

        <div class="ph-page-with-nav">
          ${this._sidebar.html()}
          <div class="documents-page">
            <div class="documents-page__body">
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
        </div>

      </div>
    `;
  }

  async _reloadModelDropdown() {
    if (this._picker) await this._picker.reload();
  }

  _bindShellEvents() {
    this.container.querySelector('#btnBack')
      .addEventListener('click', async () => {
        await this._saveActive();
        this.router.navigate('project-home', { projectId: this._projectId });
      });


    this.container.querySelector('#docAddBtn')
      .addEventListener('click', () => this._addDoc());

    this.container.querySelector('#docList')
      .addEventListener('click', async e => {
        const delBtn = e.target.closest('[data-del]');
        if (delBtn) { e.stopPropagation(); this._deleteDoc(Number(delBtn.dataset.del)); return; }
        const item = e.target.closest('[data-id]');
        if (!item) return;
        const id = Number(item.dataset.id);
        if (id === this._activeId) return;
        if (!(await this._confirmLeaveIfBusy())) return;
        this._selectDoc(id);
      });
  }

  // ----------------------------------------------------------------
  // Sidebar list
  // ----------------------------------------------------------------
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

  _refreshList() {
    const listEl = this.container.querySelector('#docList');
    if (!listEl) return;
    listEl.innerHTML = this._renderList();
  }

  // ----------------------------------------------------------------
  // Empty state
  // ----------------------------------------------------------------
  _showEmpty() {
    const panel = this.container.querySelector('#docPanel');
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

  async _saveActive() {
    if (!this._dirty || !this._activeId) return;
    const panel = this.container.querySelector('#docPanel');
    if (!panel) return;
    const title   = panel.querySelector('#docTitleInput')?.value.trim();
    const content = panel.querySelector('#docContentTA')?.value ?? '';
    if (!title) return;
    await window.db.documents.update({ id: this._activeId, title, content });
    const idx = this._docs.findIndex(d => d.id === this._activeId);
    if (idx !== -1) { this._docs[idx].title = title; this._docs[idx].content = content; }
    this._dirty = false;
    this._refreshList();
  }

  // ----------------------------------------------------------------
  // Editor
  // ----------------------------------------------------------------
  async _selectDoc(id, switchToEdit = false) {
    if (id !== this._activeId) { await this._saveActive(); this._chatHistory = []; }
    this._activeId = id;
    const doc = this._docs.find(d => d.id === id);
    if (!doc) return;

    this.container.querySelectorAll('.doc-sidebar__item').forEach(el => {
      el.classList.toggle('doc-sidebar__item--active', Number(el.dataset.id) === id);
    });

    this._attachments = await window.db.attachments.list(id);
    const attachMap   = await this._getAttachmentContentMap();

    const panel      = this.container.querySelector('#docPanel');
    const initialTab = switchToEdit ? 'edit' : 'preview';

    panel.innerHTML = `
      <div class="doc-editor-wrap">
        <div class="doc-editor">
          <div class="doc-editor__toolbar">
            <input class="doc-editor__title-input" id="docTitleInput"
              value="${escHtml(doc.title)}" placeholder="Document title" maxlength="200" autocomplete="off"/>
            <div class="doc-editor__tabs">
              <button class="doc-editor__tab${initialTab === 'edit' ? ' doc-editor__tab--active' : ''}" data-tab="edit">Edit</button>
              <button class="doc-editor__tab${initialTab === 'preview' ? ' doc-editor__tab--active' : ''}" data-tab="preview">Preview</button>
            </div>
            <button class="doc-editor__export-pdf-btn" id="docExportPdfBtn" title="Export to PDF">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M9 2v4h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M6 10h4M6 12.5h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
              Export PDF
            </button>
            <button class="doc-editor__save" id="docSaveBtn"${initialTab === 'preview' ? ' disabled' : ''}>Save</button>
          </div>

          <div class="doc-editor__pane doc-editor__pane--edit${initialTab === 'edit' ? '' : ' doc-editor__pane--hidden'}" data-pane="edit">
            <textarea class="doc-editor__textarea" id="docContentTA"
              placeholder="Write your document in Markdown…\n\nReference attachments with: [My Diagram](attach:ID)">${escHtml(doc.content || '')}</textarea>
          </div>
          <div class="doc-editor__pane doc-editor__pane--preview${initialTab === 'preview' ? '' : ' doc-editor__pane--hidden'}" data-pane="preview">
            ${this._renderMarkdown(doc.content || '', attachMap)}
          </div>

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
                ${this._renderAttachList(initialTab === 'preview')}
              </div>
              <div class="doc-attach-actions" id="docAttachActions"${initialTab === 'preview' ? ' hidden' : ''}>
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
      </div>

      <div class="doc-divider" id="docDivider"></div>

      <div class="doc-ai-card" id="docAiCard">
        <div class="doc-ai-card__header">
          <span class="doc-ai-card__title">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M8 1v3M8 12v3M1 8h3M12 8h3M3.05 3.05l2.12 2.12M10.83 10.83l2.12 2.12M3.05 12.95l2.12-2.12M10.83 5.17l2.12-2.12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <circle cx="8" cy="8" r="2" fill="currentColor"/>
            </svg>
            AI Assist
          </span>
          <div class="doc-ai-card__mode-toggle" id="docAiModeToggle">
            <button class="doc-ai-card__mode-btn doc-ai-card__mode-btn--active" data-mode="ask">Ask</button>
            <button class="doc-ai-card__mode-btn" data-mode="edit">Edit</button>
          </div>
          <div class="doc-ai-card__header-actions">
            <button class="doc-ai-card__icon-btn" id="docAiClear" title="Clear conversation">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M2 13h12M10.5 3L5 8.5l-2 4.5 4.5-2 5.5-5.5-2-2z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="doc-ai-card__messages" id="docAiMessages">
          <p class="doc-ai-card__welcome">Ask a question about the document, or switch to Edit mode to make AI-driven changes.</p>
        </div>
        <div class="doc-ai-card__compose">
          <textarea class="doc-ai-card__input" id="docAiInput" rows="2" maxlength="4000"
            placeholder="Ask a question about the document…"></textarea>
          <button class="doc-ai-card__send" id="docAiSend" title="Send (Enter) — Alt+Enter for new line">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M14 2L2 8l4 2 2 4 6-12z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    this._dirty = false;
    this._bindEditorEvents(doc);
    this._bindAttachEvents(doc);
    this._bindAiPane(doc);
    this._bindDivider();
    if (initialTab === 'preview') this._bindAttachLinks(panel);
  }

  _renderAttachList(isPreview = false) {
    if (this._attachments.length === 0) {
      return isPreview
        ? '<span class="doc-attach-empty">No attachments — add from Edit mode</span>'
        : '<span class="doc-attach-empty">No attachments yet — add SVG or draw.io files below</span>';
    }
    return this._attachments.map(a => `
      <div class="doc-attach-item" data-attach-id="${a.id}">
        <span class="doc-attach-item__type doc-attach-item__type--${a.type}">${a.type === 'drawio' ? 'draw.io' : 'SVG'}</span>
        <span class="doc-attach-item__name">${escHtml(a.name)}</span>
        <span class="doc-attach-item__ref">attach:${a.id}</span>
        <div class="doc-attach-item__actions">
          ${a.type === 'svg' ? `
          <button class="doc-attach-item__btn" data-view="${a.id}" title="View">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.4"/>
              <circle cx="8" cy="8" r="2" fill="currentColor"/>
            </svg>
          </button>
          <button class="doc-attach-item__btn" data-replace-svg="${a.id}" title="Replace from file">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M2 9a6 6 0 1 0 1-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <path d="M2 4v4h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>` : `
          <button class="doc-attach-item__btn" data-drawio="${a.id}" title="Open in draw.io">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M7 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1V9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <path d="M10 2h4v4M14 2L8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="doc-attach-item__btn" data-sync="${a.id}" title="Sync changes from draw.io">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M2 8a6 6 0 0110.5-4M14 8a6 6 0 01-10.5 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <path d="M12 2v3h3M1 11v3h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>`}
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
    const panel       = this.container.querySelector('#docPanel');
    const titleInput  = panel.querySelector('#docTitleInput');
    const contentTA   = panel.querySelector('#docContentTA');
    const saveBtn     = panel.querySelector('#docSaveBtn');
    const tabs        = panel.querySelectorAll('.doc-editor__tab');
    const editPane    = panel.querySelector('[data-pane="edit"]');
    const previewPane = panel.querySelector('[data-pane="preview"]');

    titleInput.addEventListener('input', () => { this._dirty = true; });
    contentTA.addEventListener('input',  () => { this._dirty = true; });

    const save = async () => {
      const title   = titleInput.value.trim();
      const content = contentTA.value;
      if (!title) { titleInput.focus(); return false; }
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
      try {
        await window.db.documents.update({ id: doc.id, title, content });
        const idx = this._docs.findIndex(d => d.id === doc.id);
        if (idx !== -1) { this._docs[idx].title = title; this._docs[idx].content = content; }
        this._dirty = false;
        this._refreshList();
        return true;
      } finally { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    };

    tabs.forEach(tab => {
      tab.addEventListener('click', async () => {
        if (tab.classList.contains('doc-editor__tab--active')) return;
        if (!(await this._confirmLeaveIfBusy())) return;
        tabs.forEach(t => t.classList.remove('doc-editor__tab--active'));
        tab.classList.add('doc-editor__tab--active');
        const attachActions = panel.querySelector('#docAttachActions');
        const attachList    = panel.querySelector('#docAttachList');
        if (tab.dataset.tab === 'preview') {
          if (this._dirty) await save();
          const attachMap = await this._getAttachmentContentMap();
          previewPane.innerHTML = this._renderMarkdown(contentTA.value, attachMap);
          editPane.classList.add('doc-editor__pane--hidden');
          previewPane.classList.remove('doc-editor__pane--hidden');
          this._bindAttachLinks(panel);
          saveBtn.disabled = true;
          if (attachActions) attachActions.hidden = true;
          if (attachList) attachList.innerHTML = this._renderAttachList(true);
          this._bindAttachListEvents(panel, doc.id);
        } else {
          previewPane.classList.add('doc-editor__pane--hidden');
          editPane.classList.remove('doc-editor__pane--hidden');
          saveBtn.disabled = false;
          if (attachActions) attachActions.hidden = false;
          if (attachList) attachList.innerHTML = this._renderAttachList(false);
          this._bindAttachListEvents(panel, doc.id);
          contentTA.focus();
        }
      });
    });

    panel.querySelector('#docAttachToggle').addEventListener('click', () => {
      panel.querySelector('#docAttachBody').classList.toggle('doc-attach-bar__body--open');
      panel.querySelector('.doc-attach-bar__chevron').classList.toggle('doc-attach-bar__chevron--open');
    });

    const exportPdfBtn = panel.querySelector('#docExportPdfBtn');
    exportPdfBtn.addEventListener('click', async () => {
      const title   = titleInput.value.trim() || 'document';
      const origHtml = exportPdfBtn.innerHTML;
      exportPdfBtn.disabled = true;
      exportPdfBtn.textContent = 'Exporting…';
      try {
        const attachMap = await this._getAttachmentContentMap();
        await window.app.exportPdf({ html: this._buildPdfHtml(title, contentTA.value, attachMap), filename: title });
      } finally {
        exportPdfBtn.disabled = false;
        exportPdfBtn.innerHTML = origHtml;
      }
    });

    saveBtn.addEventListener('click', save);
    panel.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 's') { e.preventDefault(); save(); } });
  }

  // ----------------------------------------------------------------
  // Attachment events
  // ----------------------------------------------------------------
  _bindAttachEvents(doc) {
    const panel = this.container.querySelector('#docPanel');
    panel.querySelector('#docAddSvg').addEventListener('click',    () => this._showAttachForm(doc.id, 'svg'));
    panel.querySelector('#docAddDrawio').addEventListener('click', () => this._showAttachForm(doc.id, 'drawio'));
    this._bindAttachListEvents(panel, doc.id);
  }

  _bindAttachListEvents(panel, docId) {
    const list = panel.querySelector('#docAttachList');
    if (!list) return;

    if (this._attachListHandler) list.removeEventListener('click', this._attachListHandler);
    this._attachListHandler = async e => {
      const viewBtn = e.target.closest('[data-view]');
      if (viewBtn) {
        const att = await window.db.attachments.getContent(Number(viewBtn.dataset.view));
        if (att) this._showAttachLightbox(att);
        return;
      }
      const drawioBtn = e.target.closest('[data-drawio]');
      if (drawioBtn) {
        const id  = Number(drawioBtn.dataset.drawio);
        const att = await window.db.attachments.getContent(id);
        if (!att) return;
        const result = await window.shell.openDrawio({ id, name: att.name, content: att.content });
        if (result.error) {
          this._showToast('No app found for .drawio files — install draw.io desktop');
        } else {
          this._drawioFiles.set(id, result.file);
        }
        return;
      }
      const syncBtn = e.target.closest('[data-sync]');
      if (syncBtn) {
        const id       = Number(syncBtn.dataset.sync);
        const filepath = this._drawioFiles.get(id);
        if (!filepath) { this._showToast('Open in draw.io first, then click Sync to save your edits'); return; }
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
      const replaceSvgBtn = e.target.closest('[data-replace-svg]');
      if (replaceSvgBtn) {
        const id     = Number(replaceSvgBtn.dataset.replaceSvg);
        const picker = document.createElement('input');
        picker.type   = 'file';
        picker.accept = '.svg,image/svg+xml';
        picker.addEventListener('change', async () => {
          const file = picker.files[0];
          if (!file) return;
          const content = await file.text();
          const att = this._attachments.find(a => a.id === id);
          await window.db.attachments.update({ id, name: att?.name, content });
          this._showToast('✓ SVG replaced from file');
        });
        picker.click();
        return;
      }
      const delBtn = e.target.closest('[data-del-attach]');
      if (delBtn) {
        const id         = Number(delBtn.dataset.delAttach);
        const attachItem = delBtn.closest('.doc-attach-item');
        const actionsEl  = attachItem?.querySelector('.doc-attach-item__actions');
        if (!actionsEl) return;

        // Inline confirm — avoids window.confirm() which breaks Electron keyboard focus
        const origHtml = actionsEl.innerHTML;
        actionsEl.innerHTML = `
          <span class="doc-attach-confirm__label">Delete?</span>
          <button class="doc-attach-confirm__btn doc-attach-confirm__btn--yes" data-confirm-yes>Yes</button>
          <button class="doc-attach-confirm__btn doc-attach-confirm__btn--no"  data-confirm-no>No</button>
        `;
        actionsEl.querySelector('[data-confirm-no]').addEventListener('click', () => {
          actionsEl.innerHTML = origHtml;
          this._bindAttachListEvents(panel, docId);
        });
        actionsEl.querySelector('[data-confirm-yes]').addEventListener('click', async () => {
          await window.db.attachments.delete(id);
          this._attachments = this._attachments.filter(a => a.id !== id);
          this._refreshAttachList(panel);
        });
      }
    };
    list.addEventListener('click', this._attachListHandler);
  }

  _refreshAttachList(panel) {
    const list       = panel.querySelector('#docAttachList');
    const count      = panel.querySelector('#docAttachCount');
    const isPreview  = !panel.querySelector('[data-pane="edit"]') ||
                       panel.querySelector('[data-pane="edit"]').classList.contains('doc-editor__pane--hidden');
    if (list)  list.innerHTML = this._renderAttachList(isPreview);
    if (count) count.textContent = this._attachments.length;
    if (list) this._bindAttachListEvents(panel, this._activeId);
  }

  // ----------------------------------------------------------------
  // Add attachment form
  // ----------------------------------------------------------------
  _showAttachForm(docId, type) {
    document.querySelector('.doc-attach-form-overlay')?.remove();

    const label = type === 'svg' ? 'SVG' : 'draw.io';
    const ph    = type === 'svg'
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">\n  <!-- paste your SVG code here -->\n</svg>'
      : '<!-- Paste your draw.io XML here -->\n<mxfile ...>';

    const accept = type === 'svg' ? '.svg,image/svg+xml' : '.drawio,.xml';

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
          <div class="doc-attach-form__label-row" style="margin-top:10px">
            <label class="doc-attach-form__label" style="margin:0">${label} Code</label>
            <button class="doc-attach-form__file-btn" id="attachFileBrowse" type="button">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M2 6a2 2 0 012-2h3l2 2h5a1 1 0 011 1v5a1 1 0 01-1 1H4a2 2 0 01-2-2V6z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
              </svg>
              Browse file
            </button>
            <input type="file" id="attachFilePicker" accept="${accept}" style="display:none"/>
          </div>
          <textarea class="doc-attach-form__textarea" id="attachContent" placeholder="${escHtml(ph)}" spellcheck="false"></textarea>
          ${type === 'svg'
            ? '<p class="doc-attach-form__hint">Paste SVG code, or drag &amp; drop / browse a .svg file.</p>'
            : '<p class="doc-attach-form__hint">Paste draw.io XML, or drag &amp; drop / browse a .drawio or .xml file.</p>'}
        </div>
        <div class="doc-attach-form__footer">
          <button class="doc-attach-form__btn doc-attach-form__btn--cancel" id="attachFormCancel">Cancel</button>
          <button class="doc-attach-form__btn doc-attach-form__btn--save" id="attachFormSave">Add ${label}</button>
        </div>
      </div>
    `;

    document.body.appendChild(formEl);

    const nameInput    = formEl.querySelector('#attachName');
    const contentInput = formEl.querySelector('#attachContent');
    const filePicker   = formEl.querySelector('#attachFilePicker');
    const close        = () => formEl.remove();

    const loadFile = file => {
      const reader = new FileReader();
      reader.onload = e => {
        contentInput.value = e.target.result;
        if (!nameInput.value.trim()) {
          nameInput.value = file.name.replace(/\.[^.]+$/, '');
        }
      };
      reader.readAsText(file);
    };

    formEl.querySelector('#attachFileBrowse').addEventListener('click', () => filePicker.click());
    filePicker.addEventListener('change', () => { if (filePicker.files[0]) loadFile(filePicker.files[0]); });

    contentInput.addEventListener('dragover', e => {
      e.preventDefault();
      contentInput.classList.add('doc-attach-form__textarea--drag-over');
    });
    contentInput.addEventListener('dragleave', () => {
      contentInput.classList.remove('doc-attach-form__textarea--drag-over');
    });
    contentInput.addEventListener('drop', e => {
      e.preventDefault();
      contentInput.classList.remove('doc-attach-form__textarea--drag-over');
      const file = e.dataTransfer.files[0];
      if (file) loadFile(file);
    });

    formEl.querySelector('#attachFormClose').addEventListener('click', close);
    formEl.querySelector('#attachFormCancel').addEventListener('click', close);

    formEl.querySelector('#attachFormSave').addEventListener('click', async () => {
      const name    = nameInput.value.trim();
      const content = contentInput.value.trim();
      if (!name)    { nameInput.focus(); return; }
      if (!content) { contentInput.focus(); return; }

      const att = await window.db.attachments.create({ document_id: docId, name, type, content });
      this._attachments.push(att);
      const panel = this.container.querySelector('#docPanel');
      this._refreshAttachList(panel);
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
    document.querySelector('.doc-lightbox')?.remove();

    const lb = document.createElement('div');
    lb.className = 'doc-lightbox';

    let svgSource  = null;
    let openDrawioId = null;
    let bodyHtml   = '';

    if (att.type === 'svg') {
      svgSource = att.content;
    } else {
      const m = att.content.match(/<svg[\s\S]*?<\/svg>/i);
      if (m) svgSource = m[0];
    }

    if (svgSource) {
      const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgSource)}`;
      bodyHtml = `<img class="doc-lightbox__svg-img" src="${dataUri}" alt="${escHtml(att.name)}"/>`;
    } else if (att.type === 'drawio') {
      openDrawioId = att.id;
      bodyHtml = `
        <div class="doc-lightbox__drawio-info">
          <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
            <rect x="3" y="5" width="26" height="22" rx="2" stroke="#94a3b8" stroke-width="1.4"/>
            <path d="M10 13l4 4-4 4M16 21h6" stroke="#94a3b8" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <p class="doc-lightbox__drawio-name">${escHtml(att.name)}</p>
          <p style="font-size:12px;color:#94a3b8">draw.io diagrams can’t be previewed inline.<br>Open in draw.io desktop to view or edit.</p>
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

    const openBtn = lb.querySelector('.doc-lightbox__open-drawio-btn');
    if (openBtn && openDrawioId != null) {
      openBtn.addEventListener('click', async () => {
        const full = await window.db.attachments.getContent(openDrawioId);
        if (!full) return;
        const result = await window.shell.openDrawio({ id: full.id ?? openDrawioId, name: full.name, content: full.content });
        if (result.error) {
          this._showToast('No app found for .drawio files — install draw.io desktop');
        } else {
          this._drawioFiles.set(openDrawioId, result.file);
          lb.remove();
          document.removeEventListener('keydown', escH);
        }
      });
    }
  }

  // ----------------------------------------------------------------
  // Attach links in preview
  // ----------------------------------------------------------------
  _bindAttachLinks(panel) {
    panel.querySelectorAll('a[data-attach-id]').forEach(a => {
      a.addEventListener('click', async e => {
        e.preventDefault();
        const att = await window.db.attachments.getContent(Number(a.dataset.attachId));
        if (att) this._showAttachLightbox(att);
      });
    });
    panel.querySelectorAll('img.md-attach-inline[data-attach-id]').forEach(img => {
      img.style.cursor = 'pointer';
      img.addEventListener('click', async e => {
        e.preventDefault();
        const att = await window.db.attachments.getContent(Number(img.dataset.attachId));
        if (att) this._showAttachLightbox(att);
      });
    });
    panel.querySelectorAll('a[data-drawio-open]').forEach(a => {
      a.addEventListener('click', async e => {
        e.preventDefault();
        const id  = Number(a.dataset.drawioOpen);
        const att = await window.db.attachments.getContent(id);
        if (!att) return;
        const result = await window.shell.openDrawio({ id, name: att.name, content: att.content });
        if (result.error) {
          this._showToast('No app found for .drawio files — install draw.io desktop');
        } else {
          this._drawioFiles.set(id, result.file);
        }
      });
    });
  }

  // ----------------------------------------------------------------
  // Add document (template picker)
  // ----------------------------------------------------------------
  async _addDoc() {
    const templates = await window.db.documentTemplates.list();
    this._showTemplatePicker(templates);
  }

  _showTemplatePicker(templates) {
    this.container.querySelector('.doc-tpl-picker')?.remove();
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
    this.container.querySelector('.documents-page').appendChild(picker);
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
        const ti = this.container.querySelector('#docTitleInput');
        if (ti) { ti.focus(); ti.select(); }
      });
    });
  }

  async _deleteDoc(id) {
    if (!await Dialog.confirm('Delete this document?', { confirmText: 'Delete', danger: true })) return;
    await window.db.documents.delete(id);
    this._docs = this._docs.filter(d => d.id !== id);
    if (this._activeId === id) this._activeId = this._docs[0]?.id ?? null;
    this._refreshList();
    if (this._activeId) await this._selectDoc(this._activeId);
    else                this._showEmpty();
  }

  // ----------------------------------------------------------------
  // AI Assist pane (right panel)
  // ----------------------------------------------------------------
  _resetAiChat() {
    this._chatHistory = [];
    const card   = this.container.querySelector('#docAiCard');
    const msgsEl = card?.querySelector('#docAiMessages');
    if (!msgsEl) return;
    const mode = card.querySelector('.doc-ai-card__mode-btn--active')?.dataset.mode ?? 'ask';
    msgsEl.innerHTML = `<p class="doc-ai-card__welcome">${AI_MODE_HINTS[mode].welcome}</p>`;
  }

  _bindAiPane(doc) {
    const card    = this.container.querySelector('#docAiCard');
    const inputEl = card.querySelector('#docAiInput');
    const msgsEl  = card.querySelector('#docAiMessages');

    // Mode toggle
    const modeBtns = card.querySelectorAll('.doc-ai-card__mode-btn');
    const getMode  = () => card.querySelector('.doc-ai-card__mode-btn--active')?.dataset.mode ?? 'ask';
    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('doc-ai-card__mode-btn--active'));
        btn.classList.add('doc-ai-card__mode-btn--active');
        const hint = AI_MODE_HINTS[btn.dataset.mode];
        inputEl.placeholder = hint.placeholder;
        if (msgsEl.querySelector('.doc-ai-card__welcome')) {
          msgsEl.querySelector('.doc-ai-card__welcome').textContent = hint.welcome;
        }
      });
    });

    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      const capped = Math.min(inputEl.scrollHeight, 160);
      inputEl.style.height = capped + 'px';
      inputEl.style.overflowY = inputEl.scrollHeight > 160 ? 'auto' : 'hidden';
    });

    card.querySelector('#docAiClear').addEventListener('click', () => this._resetAiChat());

    const submit = () => {
      const instruction = inputEl.value.trim();
      if (!instruction) { inputEl.focus(); return; }
      if (getMode() === 'edit') {
        this._runAiEdit(doc, instruction, card);
      } else {
        this._runAiAsk(doc, instruction, card);
      }
      inputEl.value = '';
      inputEl.style.height = '';
      inputEl.style.overflowY = '';
    };

    card.querySelector('#docAiSend').addEventListener('click', submit);
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.altKey) {
        e.preventDefault();
        const start = inputEl.selectionStart;
        const end = inputEl.selectionEnd;
        inputEl.value = inputEl.value.slice(0, start) + '\n' + inputEl.value.slice(end);
        inputEl.selectionStart = inputEl.selectionEnd = start + 1;
        inputEl.dispatchEvent(new Event('input'));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
  }

  // ----------------------------------------------------------------
  // Resizable divider between editor and AI pane
  // ----------------------------------------------------------------
  _bindDivider() {
    const divider  = this.container.querySelector('#docDivider');
    const panel    = this.container.querySelector('#docPanel');
    const editorWrap = panel.querySelector('.doc-editor-wrap');
    const aiCard   = panel.querySelector('#docAiCard');
    if (!divider || !editorWrap || !aiCard) return;

    const onMouseMove = e => {
      const panelRect = panel.getBoundingClientRect();
      const totalW    = panelRect.width;
      let aiW = panelRect.right - e.clientX;
      aiW = Math.max(200, Math.min(aiW, totalW - 200));
      aiCard.style.flex = `0 0 ${aiW}px`;
      editorWrap.style.flex = '1';
    };
    const onMouseUp = () => {
      divider.classList.remove('doc-divider--dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    divider.addEventListener('mousedown', e => {
      e.preventDefault();
      divider.classList.add('doc-divider--dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  _appendChatMsg(msgsEl, role, text, isError = false) {
    msgsEl.querySelector('.doc-ai-card__welcome')?.remove();
    const el = document.createElement('div');
    el.className = `doc-ai-msg doc-ai-msg--${role}`;
    el.innerHTML = `<div class="doc-ai-msg__bubble${isError ? ' doc-ai-msg__bubble--error' : ''}">${escHtml(text)}</div>`;
    msgsEl.appendChild(el);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return el;
  }

  _updateChatMsg(msgEl, text, state = '') {
    const bubble = msgEl?.querySelector('.doc-ai-msg__bubble');
    if (!bubble) return;
    bubble.textContent = text;
    bubble.className = 'doc-ai-msg__bubble' + (state ? ` doc-ai-msg__bubble--${state}` : '');
    msgEl.closest('.doc-ai-card__messages')?.scrollTo({ top: 99999, behavior: 'smooth' });
  }

  _setChatMsgApplied(msgEl, fullText, prevContent) {
    const bubble = msgEl?.querySelector('.doc-ai-msg__bubble');
    if (!bubble) return;
    const previewLines = fullText.trim()
      .split('\n').map(l => l.trim()).filter(l => l.length > 0).slice(0, 3);
    let preview = previewLines.join('\n');
    if (preview.length > 200) preview = preview.slice(0, 200) + '…';
    bubble.className = 'doc-ai-msg__bubble doc-ai-msg__bubble--success';
    bubble.innerHTML = `<span class="doc-ai-msg__preview">${escHtml(preview)}</span><div class="doc-ai-msg__status-row"><span class="doc-ai-msg__applied">✓ Applied — saved</span><button class="doc-ai-msg__revert-btn" title="Revert to previous content"><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2 9a6 6 0 1 0 1-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M2 4v4h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`;
    bubble.querySelector('.doc-ai-msg__revert-btn').addEventListener('click', () => {
      const contentTA = this.container.querySelector('#docContentTA');
      if (contentTA) {
        contentTA.value = prevContent;
        this._dirty = true;
        const activeDoc = this._docs.find(d => d.id === this._activeId);
        if (activeDoc) activeDoc.content = prevContent;
        this._refreshPreviewIfActive();
      }
      const row = bubble.querySelector('.doc-ai-msg__status-row');
      if (row) row.innerHTML = '<span class="doc-ai-msg__reverted">↩ Reverted — review and save</span>';
    });
    msgEl.closest('.doc-ai-card__messages')?.scrollTo({ top: 99999, behavior: 'smooth' });
  }

  async _runAiAsk(doc, instruction, card) {
    const cfg     = this._aiModelConfig;
    const msgsEl  = card.querySelector('#docAiMessages');
    const sendBtn = card.querySelector('#docAiSend');
    const inputEl = card.querySelector('#docAiInput');

    this._appendChatMsg(msgsEl, 'user', instruction);

    if (!cfg) {
      this._appendChatMsg(msgsEl, 'ai', 'No model selected — choose one in the header.', true);
      return;
    }

    sendBtn.disabled = true;
    inputEl.disabled = true;
    this._aiRunning  = true;
    this._aiIsCli    = cfg.type !== 'ollama' && cfg.type !== 'api' && cfg.type !== 'anthropic';
    this._aiAbortController = this._aiIsCli ? null : new AbortController();

    const contentTA      = this.container.querySelector('#docContentTA');
    const currentContent = contentTA?.value ?? doc.content ?? '';

    const aiMsgEl = this._appendChatMsg(msgsEl, 'ai', 'Thinking…');

    const attachContextParts = [];
    if (this._attachments.length > 0) {
      for (const att of this._attachments) {
        try {
          const full = await window.db.attachments.getContent(att.id);
          if (full?.content) {
            const typeLabel = att.type === 'drawio' ? 'draw.io XML' : 'SVG';
            attachContextParts.push(`### ${att.name} (${typeLabel})\n${full.content}`);
          }
        } catch { /* skip */ }
      }
    }

    const contextParts = [
      'You are a helpful assistant answering questions about a technical document.',
      'Answer concisely and accurately based on the document content and any attached diagrams.',
      'Do NOT rewrite or modify the document.',
      '',
      '## Document title',
      doc.title,
      '',
      '## Document content',
      currentContent || '(empty)',
    ];

    if (attachContextParts.length > 0) {
      contextParts.push('', '## Diagram attachments (read for context only)', ...attachContextParts);
    }

    const tailParts  = ['', '## Question', instruction];
    const fullPrompt = [...contextParts, ...tailParts].join('\n');

    // First turn sends full context; follow-ups send only the new question (history carries context)
    const isFirstTurn = this._chatHistory.length === 0;
    const userMessage = isFirstTurn ? fullPrompt : instruction;
    const messages    = [...this._chatHistory, { role: 'user', content: userMessage }];

    try {
      if (cfg.type === 'ollama') {
        const reply = await this._runAiAskOllama(cfg, messages, aiMsgEl);
        if (reply) this._chatHistory.push({ role: 'user', content: userMessage }, { role: 'assistant', content: reply });
      } else if (cfg.type === 'api') {
        const reply = await this._runAiAskApi(cfg, messages, aiMsgEl);
        if (reply) this._chatHistory.push({ role: 'user', content: userMessage }, { role: 'assistant', content: reply });
      } else if (cfg.type === 'anthropic') {
        const reply = await this._runAiAskAnthropic(cfg, contextParts.join('\n'), instruction, aiMsgEl);
        if (reply) this._chatHistory.push({ role: 'user', content: instruction }, { role: 'assistant', content: reply });
      } else {
        await this._runAiAskCli(cfg, contextParts.join('\n'), tailParts.join('\n'), aiMsgEl);
      }
    } finally {
      sendBtn.disabled = false;
      inputEl.disabled = false;
      inputEl.focus();
      this._aiRunning  = false;
      this._aiAbortController = null;
    }
  }

  async _runAiAskOllama(cfg, messages, aiMsgEl) {
    const baseUrl = (cfg.base_url || 'http://localhost:11434').replace(/\/$/, '');
    const body    = JSON.stringify({ model: cfg.model_name || '', messages, stream: true });

    let res;
    try {
      res = await fetch(`${baseUrl}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: this._aiAbortController?.signal });
    } catch (err) {
      if (err.name === 'AbortError') return null;
      this._updateChatMsg(aiMsgEl, `Ollama request failed: ${err.message}`, 'error');
      return null;
    }
    if (!res.ok) {
      this._updateChatMsg(aiMsgEl, `Ollama HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, 'error');
      return null;
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', fullText = '';
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data  = JSON.parse(line);
            const delta = data.message?.content || '';
            if (delta) { fullText += delta; this._updateChatMsg(aiMsgEl, fullText); }
            if (data.done) {
              usage.input_tokens  = data.prompt_eval_count || 0;
              usage.output_tokens = data.eval_count        || 0;
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return null;
      throw err;
    }
    if (!fullText.trim()) { this._updateChatMsg(aiMsgEl, 'No response from Ollama.', 'error'); return null; }
    this._appendTokenUsage(aiMsgEl, usage);
    return fullText;
  }

  async _runAiAskApi(cfg, messages, aiMsgEl) {
    const baseUrl = (cfg.base_url || '').replace(/\/$/, '');
    if (!baseUrl) { this._updateChatMsg(aiMsgEl, 'base_url not configured.', 'error'); return null; }

    const headers = { 'Content-Type': 'application/json' };
    if (cfg.api_key) headers['Authorization'] = `Bearer ${cfg.api_key}`;
    const body = { model: cfg.model_name || 'default', messages, stream: true };
    if (cfg.max_tokens) body.max_tokens = cfg.max_tokens;

    let res;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: this._aiAbortController?.signal });
    } catch (err) {
      if (err.name === 'AbortError') return null;
      this._updateChatMsg(aiMsgEl, `Request failed: ${err.message}`, 'error');
      return null;
    }
    if (!res.ok) {
      this._updateChatMsg(aiMsgEl, `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, 'error');
      return null;
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', fullText = '';
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) { fullText += delta; this._updateChatMsg(aiMsgEl, fullText); }
            if (chunk.usage) {
              usage.input_tokens  = chunk.usage.prompt_tokens     || 0;
              usage.output_tokens = chunk.usage.completion_tokens || 0;
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return null;
      throw err;
    }
    if (!fullText.trim()) { this._updateChatMsg(aiMsgEl, 'No response from model.', 'error'); return null; }
    this._appendTokenUsage(aiMsgEl, usage);
    return fullText;
  }

  async _runAiAskAnthropic(cfg, systemContext, instruction, aiMsgEl) {
    const apiKey = cfg.api_key || '';
    if (!apiKey) { this._updateChatMsg(aiMsgEl, 'api_key not configured for this Anthropic model.', 'error'); return null; }

    // Document context in system with cache_control — large enough to cross the 2048-token cache threshold
    const systemArr = [{ type: 'text', text: systemContext, cache_control: { type: 'ephemeral' } }];
    const messages  = [...this._chatHistory, { role: 'user', content: instruction }];
    const body = JSON.stringify({
      model:      cfg.model_name || 'claude-haiku-4-5',
      max_tokens: cfg.max_tokens || 8096,
      stream:     true,
      system:     systemArr,
      messages,
    });

    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta':    'prompt-caching-2024-07-31',
        },
        body,
        signal: this._aiAbortController?.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') return null;
      this._updateChatMsg(aiMsgEl, `Request failed: ${err.message}`, 'error');
      return null;
    }

    if (!res.ok) {
      this._updateChatMsg(aiMsgEl, `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, 'error');
      return null;
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', fullText = '';
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const chunk = JSON.parse(data);
            if (chunk.type === 'message_start') {
              const u = chunk.message?.usage || {};
              usage.input_tokens              = u.input_tokens              || 0;
              usage.cache_read_input_tokens   = u.cache_read_input_tokens   || 0;
              usage.cache_creation_input_tokens = u.cache_creation_input_tokens || 0;
            }
            if (chunk.type === 'message_delta') {
              usage.output_tokens = chunk.usage?.output_tokens || 0;
            }
            if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
              fullText += chunk.delta.text;
              this._updateChatMsg(aiMsgEl, fullText);
            }
          } catch { /* skip malformed SSE chunk */ }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return null;
      throw err;
    }

    if (!fullText.trim()) { this._updateChatMsg(aiMsgEl, 'No response from Anthropic.', 'error'); return null; }
    this._appendTokenUsage(aiMsgEl, usage);
    return fullText;
  }

  _appendTokenUsage(msgEl, usage) {
    if (!msgEl || !usage) return;
    const { input_tokens = 0, output_tokens = 0, cache_read_input_tokens = 0, cache_creation_input_tokens = 0 } = usage;
    const parts = [
      `in: ${input_tokens.toLocaleString()}`,
      `out: ${output_tokens.toLocaleString()}`,
    ];
    if (cache_read_input_tokens > 0)     parts.push(`${cache_read_input_tokens.toLocaleString()} cached`);
    if (cache_creation_input_tokens > 0) parts.push(`${cache_creation_input_tokens.toLocaleString()} cache write`);
    const el = document.createElement('div');
    el.className = 'doc-ai-msg__usage';
    el.textContent = parts.join(' · ');
    msgEl.insertAdjacentElement('afterend', el);
  }

  _appendCliPromptPreview(shortPrompt, label = 'Prompt sent to CLI') {
    const msgsEl = this.container.querySelector('#docAiMessages');
    if (!msgsEl) return;
    const el = document.createElement('div');
    el.className = 'doc-ai-msg doc-ai-msg--prompt-preview';
    el.innerHTML = `
      <details class="doc-ai-prompt-details">
        <summary class="doc-ai-prompt-details__summary">${escHtml(label)}</summary>
        <pre class="doc-ai-prompt-details__pre">${escHtml(shortPrompt)}</pre>
      </details>`;
    msgsEl.appendChild(el);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  async _runAiAskCli(cfg, contextContent, instructionContent, aiMsgEl) {
    const exe       = cfg.executable || 'claude';
    const flags     = cfg.flags ? ` ${cfg.flags}` : '';
    const modelFlag = cfg.model_name ? ` --model ${cfg.model_name}` : '';

    let contextFilePath;
    try {
      const paths    = await window.app.writeTempFiles([{ name: 'doc-context.txt', content: contextContent }]);
      contextFilePath = paths[0];
    } catch (err) {
      this._updateChatMsg(aiMsgEl, `Failed to write context file: ${err.message}`, 'error');
      return;
    }

    const cwd = contextFilePath.replace(/[\\/][^\\/]+$/, '');

    const shortPrompt = `The document context (title, content, and any diagram attachments) is saved in the file below. Read it for context, then answer the question.\n\nContext file: ${contextFilePath}\n\n${instructionContent}`;
    this._appendCliPromptPreview(shortPrompt);
    const safePrompt  = shortPrompt.replace(/'/g, "''");
    const command     = cfg.input_mode === 'heredoc'
      ? `$p = @'\n${safePrompt}\n'@\n${exe}${flags}${modelFlag} $p`
      : `$p = @'\n${safePrompt}\n'@\nWrite-Output $p | ${exe}${flags}${modelFlag}`;

    return new Promise(resolve => {
      let fullOutput = '';
      window.db.terminal.removeListeners();
      window.db.terminal.onData(({ text }) => {
        fullOutput += text;
        this._updateChatMsg(aiMsgEl, fullOutput);
      });
      window.db.terminal.onDone(({ exitCode }) => {
        window.db.terminal.removeListeners();
        window.app.deleteTempDir(cwd);
        if (exitCode !== 0 || !fullOutput.trim()) {
          this._updateChatMsg(aiMsgEl, `Failed — exit code ${exitCode}`, 'error');
        }
        resolve();
      });
      window.db.terminal.execStart({ command, cwd }).catch(err => {
        window.db.terminal.removeListeners();
        window.app.deleteTempDir(cwd);
        this._updateChatMsg(aiMsgEl, `CLI error: ${err.message}`, 'error');
        resolve();
      });
    });
  }

  async _runAiEdit(doc, instruction, card) {
    const cfg     = this._aiModelConfig;
    const msgsEl  = card.querySelector('#docAiMessages');
    const sendBtn = card.querySelector('#docAiSend');
    const inputEl = card.querySelector('#docAiInput');

    this._appendChatMsg(msgsEl, 'user', instruction);

    if (!cfg) {
      this._appendChatMsg(msgsEl, 'ai', 'No model selected — choose one in the header.', true);
      return;
    }

    sendBtn.disabled = true;
    inputEl.disabled = true;
    this._aiRunning  = true;
    this._aiIsCli    = cfg.type !== 'ollama' && cfg.type !== 'api' && cfg.type !== 'anthropic';
    this._aiAbortController = this._aiIsCli ? null : new AbortController();

    const contentTA      = this.container.querySelector('#docContentTA');
    const currentContent = contentTA?.value ?? doc.content ?? '';

    const aiMsgEl = this._appendChatMsg(msgsEl, 'ai', 'Reading attachments…');

    // Fetch attachment contents so the AI can read diagrams for context
    const attachContextParts = [];
    if (this._attachments.length > 0) {
      for (const att of this._attachments) {
        try {
          const full = await window.db.attachments.getContent(att.id);
          if (full?.content) {
            const typeLabel = att.type === 'drawio' ? 'draw.io XML' : 'SVG';
            attachContextParts.push(`### ${att.name} (${typeLabel})\n${full.content}`);
          }
        } catch { /* skip */ }
      }
    }

    this._updateChatMsg(aiMsgEl, 'Generating…', 'thinking');

    const contextParts = [
      'You are a technical document writer. Update the document based on the user\'s instruction.',
      'Diagram attachments (SVG or draw.io XML) are provided below as read-only context.',
      'Extract technical information from them — component names, relationships, data flows, entities, architecture patterns — and use that information to write accurate document content.',
      'Do NOT reproduce or reference the raw XML/SVG in the output.',
      '',
      '## Document title',
      doc.title,
      '',
      '## Current document content',
      currentContent || '(empty)',
    ];

    if (attachContextParts.length > 0) {
      contextParts.push('', '## Diagram attachments (read for context only)', ...attachContextParts);
    }

    const tailParts = [
      '',
      '## User instruction',
      instruction,
      '',
      'Return ONLY the updated document content in Markdown. No explanations, no preamble, no code fences wrapping the entire output.',
    ];

    const prompt      = [...contextParts, ...tailParts].join('\n');
    const prevContent = contentTA?.value ?? '';

    try {
      if (cfg.type === 'ollama') {
        await this._runAiEditOllama(cfg, prompt, aiMsgEl, contentTA, prevContent);
      } else if (cfg.type === 'api') {
        await this._runAiEditApi(cfg, prompt, aiMsgEl, contentTA, prevContent);
      } else if (cfg.type === 'anthropic') {
        await this._runAiEditAnthropic(cfg, contextParts.join('\n'), tailParts.join('\n'), aiMsgEl, contentTA, prevContent);
      } else {
        await this._runAiEditCli(cfg, contextParts.join('\n'), tailParts.join('\n'), aiMsgEl, contentTA, prevContent);
      }
      if (this._dirty) {
        const panel      = this.container.querySelector('#docPanel');
        const titleInput = panel?.querySelector('#docTitleInput');
        const saveBtn    = panel?.querySelector('#docSaveBtn');
        const title      = titleInput?.value.trim();
        const content    = contentTA?.value ?? '';
        if (title) {
          if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
          try {
            await window.db.documents.update({ id: doc.id, title, content });
            const idx = this._docs.findIndex(d => d.id === doc.id);
            if (idx !== -1) { this._docs[idx].title = title; this._docs[idx].content = content; }
            this._dirty = false;
            this._refreshList();
          } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
          }
        }
      }
    } finally {
      sendBtn.disabled = false;
      inputEl.disabled = false;
      inputEl.focus();
      this._aiRunning  = false;
      this._aiAbortController = null;
    }
  }

  async _runAiEditOllama(cfg, prompt, aiMsgEl, contentTA, prevContent) {
    const baseUrl = (cfg.base_url || 'http://localhost:11434').replace(/\/$/, '');
    const body    = JSON.stringify({
      model:    cfg.model_name || '',
      messages: [{ role: 'user', content: prompt }],
      stream:   true,
    });

    let res;
    try {
      res = await fetch(`${baseUrl}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: this._aiAbortController?.signal });
    } catch (err) {
      if (err.name === 'AbortError') return;
      this._updateChatMsg(aiMsgEl, `Ollama request failed: ${err.message}`, 'error');
      return;
    }

    if (!res.ok) {
      const errText = await res.text();
      this._updateChatMsg(aiMsgEl, `Ollama HTTP ${res.status}: ${errText.slice(0, 200)}`, 'error');
      return;
    }

    const reader   = res.body.getReader();
    const decoder  = new TextDecoder();
    let buffer     = '';
    let fullText   = '';
    let charCount  = 0;
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data  = JSON.parse(line);
            const delta = data.message?.content || '';
            if (delta) {
              fullText  += delta;
              charCount += delta.length;
              this._updateChatMsg(aiMsgEl, `Generating… ${charCount} chars`, 'thinking');
            }
            if (data.done) {
              usage.input_tokens  = data.prompt_eval_count || 0;
              usage.output_tokens = data.eval_count        || 0;
            }
          } catch { /* skip malformed NDJSON line */ }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      throw err;
    }

    if (fullText.trim()) {
      if (contentTA) { contentTA.value = fullText.trim(); this._dirty = true; }
      const activeDoc = this._docs.find(d => d.id === this._activeId);
      if (activeDoc) activeDoc.content = fullText.trim();
      this._refreshPreviewIfActive();
      this._setChatMsgApplied(aiMsgEl, fullText, prevContent);
      this._appendTokenUsage(aiMsgEl, usage);
    } else {
      this._updateChatMsg(aiMsgEl, 'No content returned by Ollama.', 'error');
    }
  }

  async _runAiEditApi(cfg, prompt, aiMsgEl, contentTA, prevContent) {
    const baseUrl = (cfg.base_url || '').replace(/\/$/, '');
    if (!baseUrl) {
      this._updateChatMsg(aiMsgEl, 'base_url not configured for this model.', 'error');
      return;
    }

    const body = { model: cfg.model_name || 'default', messages: [{ role: 'user', content: prompt }], stream: true };
    if (cfg.max_tokens) body.max_tokens = cfg.max_tokens;

    const headers = { 'Content-Type': 'application/json' };
    if (cfg.api_key) headers['Authorization'] = `Bearer ${cfg.api_key}`;

    let res;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: this._aiAbortController?.signal });
    } catch (err) {
      if (err.name === 'AbortError') return;
      this._updateChatMsg(aiMsgEl, `Request failed: ${err.message}`, 'error');
      return;
    }

    if (!res.ok) {
      const errText = await res.text();
      this._updateChatMsg(aiMsgEl, `HTTP ${res.status}: ${errText.slice(0, 200)}`, 'error');
      return;
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';
    let fullText  = '';
    let charCount = 0;
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              fullText  += delta;
              charCount += delta.length;
              this._updateChatMsg(aiMsgEl, `Generating… ${charCount} chars`, 'thinking');
            }
            if (chunk.usage) {
              usage.input_tokens  = chunk.usage.prompt_tokens     || 0;
              usage.output_tokens = chunk.usage.completion_tokens || 0;
            }
          } catch { /* skip malformed SSE chunk */ }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      throw err;
    }

    if (fullText.trim()) {
      if (contentTA) { contentTA.value = fullText.trim(); this._dirty = true; }
      const activeDoc = this._docs.find(d => d.id === this._activeId);
      if (activeDoc) activeDoc.content = fullText.trim();
      this._refreshPreviewIfActive();
      this._setChatMsgApplied(aiMsgEl, fullText, prevContent);
      this._appendTokenUsage(aiMsgEl, usage);
    } else {
      this._updateChatMsg(aiMsgEl, 'No content returned by model.', 'error');
    }
  }

  async _runAiEditAnthropic(cfg, systemContext, instructionText, aiMsgEl, contentTA, prevContent) {
    const apiKey = cfg.api_key || '';
    if (!apiKey) {
      this._updateChatMsg(aiMsgEl, 'api_key not configured for this Anthropic model.', 'error');
      return;
    }

    this._appendCliPromptPreview(instructionText, `Prompt sent to Anthropic API  ·  ${cfg.model_name || 'claude-haiku-4-5'}`);

    // Document context in system with cache_control — large enough to cross the 2048-token cache threshold
    const systemArr = [{ type: 'text', text: systemContext, cache_control: { type: 'ephemeral' } }];
    const body = JSON.stringify({
      model:      cfg.model_name || 'claude-haiku-4-5',
      max_tokens: cfg.max_tokens || 8096,
      stream:     true,
      system:     systemArr,
      messages:   [{ role: 'user', content: instructionText }],
    });

    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta':    'prompt-caching-2024-07-31',
        },
        body,
        signal: this._aiAbortController?.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') return;
      this._updateChatMsg(aiMsgEl, `Request failed: ${err.message}`, 'error');
      return;
    }

    if (!res.ok) {
      const errText = await res.text();
      this._updateChatMsg(aiMsgEl, `HTTP ${res.status}: ${errText.slice(0, 200)}`, 'error');
      return;
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';
    let fullText  = '';
    let charCount = 0;
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const chunk = JSON.parse(data);
            if (chunk.type === 'message_start') {
              const u = chunk.message?.usage || {};
              usage.input_tokens                = u.input_tokens                || 0;
              usage.cache_read_input_tokens     = u.cache_read_input_tokens     || 0;
              usage.cache_creation_input_tokens = u.cache_creation_input_tokens || 0;
            }
            if (chunk.type === 'message_delta') {
              usage.output_tokens = chunk.usage?.output_tokens || 0;
            }
            if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
              fullText  += chunk.delta.text;
              charCount += chunk.delta.text.length;
              this._updateChatMsg(aiMsgEl, `Generating… ${charCount} chars`, 'thinking');
            }
          } catch { /* skip malformed SSE chunk */ }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      throw err;
    }

    if (fullText.trim()) {
      if (contentTA) { contentTA.value = fullText.trim(); this._dirty = true; }
      const activeDoc = this._docs.find(d => d.id === this._activeId);
      if (activeDoc) activeDoc.content = fullText.trim();
      this._refreshPreviewIfActive();
      this._setChatMsgApplied(aiMsgEl, fullText, prevContent);
      this._appendTokenUsage(aiMsgEl, usage);
    } else {
      this._updateChatMsg(aiMsgEl, 'No content returned by Anthropic.', 'error');
    }
  }

  async _runAiEditCli(cfg, contextContent, instructionContent, aiMsgEl, contentTA, prevContent) {
    const exe       = cfg.executable || 'claude';
    const flags     = cfg.flags ? ` ${cfg.flags}` : '';
    const modelFlag = cfg.model_name ? ` --model ${cfg.model_name}` : '';

    let contextFilePath;
    try {
      const paths    = await window.app.writeTempFiles([{ name: 'doc-context.txt', content: contextContent }]);
      contextFilePath = paths[0];
    } catch (err) {
      this._updateChatMsg(aiMsgEl, `Failed to write context file: ${err.message}`, 'error');
      return;
    }

    const cwd = contextFilePath.replace(/[\\/][^\\/]+$/, '');

    const shortPrompt = `The document context (title, current content, and any diagram attachments) is saved in the file below. Read it for context, then complete the editing task.\n\nContext file: ${contextFilePath}\n\n${instructionContent}`;
    this._appendCliPromptPreview(shortPrompt);
    const safePrompt  = shortPrompt.replace(/'/g, "''");
    const command     = cfg.input_mode === 'heredoc'
      ? `$p = @'\n${safePrompt}\n'@\n${exe}${flags}${modelFlag} $p`
      : `$p = @'\n${safePrompt}\n'@\nWrite-Output $p | ${exe}${flags}${modelFlag}`;

    return new Promise(resolve => {
      let fullOutput = '';

      window.db.terminal.removeListeners();
      window.db.terminal.onData(({ text }) => {
        fullOutput += text;
        this._updateChatMsg(aiMsgEl, `Generating… ${fullOutput.length} chars`, 'thinking');
      });
      window.db.terminal.onDone(({ exitCode }) => {
        window.db.terminal.removeListeners();
        window.app.deleteTempDir(cwd);
        if (exitCode === 0 && fullOutput.trim()) {
          if (contentTA) { contentTA.value = fullOutput.trim(); this._dirty = true; }
          const activeDoc = this._docs.find(d => d.id === this._activeId);
          if (activeDoc) activeDoc.content = fullOutput.trim();
          this._refreshPreviewIfActive();
          this._setChatMsgApplied(aiMsgEl, fullOutput, prevContent);
        } else {
          this._updateChatMsg(aiMsgEl, `Failed — exit code ${exitCode}`, 'error');
        }
        resolve();
      });

      window.db.terminal.execStart({ command, cwd }).catch(err => {
        window.db.terminal.removeListeners();
        window.app.deleteTempDir(cwd);
        this._updateChatMsg(aiMsgEl, `CLI error: ${err.message}`, 'error');
        resolve();
      });
    });
  }

  // ----------------------------------------------------------------
  // Preview refresh (called after AI applies content)
  // ----------------------------------------------------------------
  async _refreshPreviewIfActive() {
    const panel = this.container.querySelector('#docPanel');
    if (!panel) return;
    const previewPane = panel.querySelector('[data-pane="preview"]');
    const contentTA   = panel.querySelector('#docContentTA');
    if (!previewPane || !contentTA) return;
    if (!previewPane.classList.contains('doc-editor__pane--hidden')) {
      const attachMap = await this._getAttachmentContentMap();
      previewPane.innerHTML = this._renderMarkdown(contentTA.value, attachMap);
      this._bindAttachLinks(panel);
      const saveBtn = panel.querySelector('#docSaveBtn');
      if (saveBtn) saveBtn.disabled = false;
    }
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
  // PDF export
  // ----------------------------------------------------------------
  _buildPdfHtml(title, content, attachMap) {
    const esc  = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const body = this._renderMarkdown(content, attachMap);
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 13px; line-height: 1.65; color: #1e293b; margin: 0; padding: 48px 56px; }
.doc-pdf-title { font-size: 22px; font-weight: 700; margin: 0 0 24px; padding-bottom: 12px; border-bottom: 2px solid #e2e8f0; color: #0f172a; }
h1 { font-size: 1.6em; margin: 1.2em 0 0.5em; }
h2 { font-size: 1.35em; margin: 1em 0 0.4em; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.2em; }
h3 { font-size: 1.15em; margin: 0.9em 0 0.3em; }
h4, h5, h6 { font-size: 1em; margin: 0.8em 0 0.3em; }
p { margin: 0.45em 0; }
code { background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-size: 0.87em; font-family: 'Courier New', Consolas, monospace; color: #334155; }
pre { background: #f1f5f9; padding: 12px 14px; border-radius: 6px; margin: 0.7em 0; }
pre code { background: none; padding: 0; font-size: 0.85em; }
blockquote { border-left: 3px solid #94a3b8; margin: 0.7em 0; padding: 2px 0 2px 14px; color: #64748b; }
ul, ol { padding-left: 1.6em; margin: 0.4em 0; }
li { margin: 0.2em 0; }
hr { border: none; border-top: 1px solid #e2e8f0; margin: 1em 0; }
.md-table { border-collapse: collapse; width: 100%; margin: 0.8em 0; font-size: 0.92em; }
.md-table th, .md-table td { border: 1px solid #e2e8f0; padding: 6px 12px; text-align: left; }
.md-table th { background: #f8fafc; font-weight: 600; }
.md-table tr:nth-child(even) td { background: #fafafa; }
.md-svg-img { max-width: 100%; height: auto; display: block; margin: 0.8em 0; }
.doc-attach-link { color: #6366f1; text-decoration: underline; }
.doc-attach-link--drawio { display: inline-flex; align-items: center; padding: 3px 10px; background: #f1f5f9; border-radius: 4px; text-decoration: none; font-size: 0.92em; }
a { color: #2563eb; }
strong { font-weight: 600; }
del { color: #94a3b8; text-decoration: line-through; }
</style>
</head>
<body>
<div class="doc-pdf-title">${esc(title)}</div>
${body}
</body>
</html>`;
  }

  async _getAttachmentContentMap() {
    const map = new Map();
    for (const att of this._attachments) {
      try {
        const full = await window.db.attachments.getContent(att.id);
        if (full) map.set(String(att.id), { type: full.type, content: full.content, name: full.name });
      } catch { /* skip */ }
    }
    return map;
  }

  // ----------------------------------------------------------------
  // Markdown renderer (identical to DocumentsModal)
  // ----------------------------------------------------------------
  _renderMarkdown(text, attachMap) {
    if (!text || !text.trim()) return '<p class="doc-preview__hint">Nothing to preview yet.</p>';
    const esc   = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = text.split('\n');
    const out   = [];
    let inCode   = false, codeLines  = [];
    let inUl     = false, inOl       = false;
    let inSvg    = false, svgLines   = [];
    let inTable  = false, tableLines = [];
    let lastBlock = '';

    const closeList  = () => {
      if (inUl) { out.push('</ul>'); inUl = false; lastBlock = 'list'; }
      if (inOl) { out.push('</ol>'); inOl = false; lastBlock = 'list'; }
    };
    const flushTable = () => {
      if (!inTable) return;
      out.push(this._renderTable(tableLines, attachMap));
      tableLines = []; inTable = false; lastBlock = 'table';
    };

    for (const line of lines) {
      if (!inCode && !inSvg && line.trimStart().toLowerCase().startsWith('<svg')) {
        closeList(); flushTable(); inSvg = true; svgLines = [line];
        if (line.includes('</svg>')) {
          out.push(`<img class="md-svg-img" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgLines.join('\n'))}" alt="diagram"/>`);
          svgLines = []; inSvg = false; lastBlock = 'svg';
        }
        continue;
      }
      if (inSvg) {
        svgLines.push(line);
        if (line.includes('</svg>')) {
          out.push(`<img class="md-svg-img" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgLines.join('\n'))}" alt="diagram"/>`);
          svgLines = []; inSvg = false; lastBlock = 'svg';
        }
        continue;
      }
      if (line.trimStart().startsWith('```')) {
        closeList(); flushTable();
        if (inCode) { out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`); codeLines = []; inCode = false; lastBlock = 'code'; }
        else        { inCode = true; }
        continue;
      }
      if (inCode) { codeLines.push(esc(line)); continue; }

      // Table rows
      if (line.trimStart().startsWith('|')) {
        closeList();
        if (!inTable) inTable = true;
        tableLines.push(line);
        continue;
      }
      if (inTable) flushTable();

      const hm = line.match(/^(#{1,6})\s+(.*)/);
      if (hm) { closeList(); out.push(`<h${hm[1].length}>${this._inlineMd(esc(hm[2]), attachMap)}</h${hm[1].length}>`); lastBlock = 'heading'; continue; }
      if (/^[-*_]{3,}\s*$/.test(line)) { closeList(); out.push('<hr>'); lastBlock = 'hr'; continue; }
      const ulm = line.match(/^[-*+]\s+(.*)/);
      if (ulm) {
        if (inOl) { out.push('</ol>'); inOl = false; }
        if (!inUl) { out.push('<ul>'); inUl = true; }
        const taskMatch = ulm[1].match(/^\[([ xX])\]\s+(.*)/);
        if (taskMatch) {
          const checked = taskMatch[1].toLowerCase() === 'x';
          out.push(`<li class="md-task-item"><input type="checkbox" class="md-task-checkbox"${checked ? ' checked' : ''} disabled> ${this._inlineMd(esc(taskMatch[2]), attachMap)}</li>`);
        } else {
          out.push(`<li>${this._inlineMd(esc(ulm[1]), attachMap)}</li>`);
        }
        lastBlock = 'list'; continue;
      }
      const olm = line.match(/^\d+\.\s+(.*)/);
      if (olm) { if (inUl) { out.push('</ul>'); inUl = false; } if (!inOl) { out.push('<ol>'); inOl = true; } out.push(`<li>${this._inlineMd(esc(olm[1]), attachMap)}</li>`); lastBlock = 'list'; continue; }
      const bqm = line.match(/^>\s?(.*)/);
      if (bqm) { closeList(); out.push(`<blockquote>${this._inlineMd(esc(bqm[1]), attachMap)}</blockquote>`); lastBlock = 'blockquote'; continue; }
      if (line.trim() === '') { closeList(); if (lastBlock === 'p') { out.push('<br>'); lastBlock = 'br'; } continue; }
      closeList();
      out.push(`<p>${this._inlineMd(esc(line), attachMap)}</p>`);
      lastBlock = 'p';
    }

    closeList();
    flushTable();
    if (inCode) out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
    return out.join('');
  }

  _renderTable(lines, attachMap) {
    const esc      = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const parseRow = line => line.split('|').slice(1, -1).map(c => this._inlineMd(esc(c.trim()), attachMap));
    const isSep    = line => /^\|[\s|:-]+\|$/.test(line.trim());

    const rows = lines.filter(l => !isSep(l));
    if (rows.length === 0) return '';

    const [headerRow, ...bodyRows] = rows;
    const headers = parseRow(headerRow);
    const th = headers.map(h => `<th>${h}</th>`).join('');
    const tbody = bodyRows.map(r => {
      const cells = parseRow(r);
      return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    }).join('');

    return `<table class="md-table"><thead><tr>${th}</tr></thead><tbody>${tbody}</tbody></table>`;
  }

  _inlineMd(s, attachMap) {
    let result = s
      .replace(/`([^`]+)`/g,           '<code>$1</code>')
      .replace(/\*\*\*(.+?)\*\*\*/g,   '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g,       '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,           '<em>$1</em>')
      .replace(/~~(.+?)~~/g,           '<del>$1</del>');

    result = result.replace(/\[([^\]]+)\]\(attach:(\d+)\)/g, (_match, label, id) => {
      const att = attachMap && attachMap.get(id);
      if (att && att.type === 'svg') {
        const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(att.content)}`;
        return `<img class="md-svg-img md-attach-inline" data-attach-id="${id}" src="${dataUri}" alt="${label}" title="${label} — click to enlarge"/>`;
      }
      if (att && att.type === 'drawio') {
        return `<a class="doc-attach-link doc-attach-link--drawio" data-drawio-open="${id}" href="#">`
          + `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="vertical-align:-2px;margin-right:4px">`
          + `<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" stroke-width="1.2"/>`
          + `<path d="M5 7l3 3-3 3M8 10h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`
          + `</svg>${label}</a>`;
      }
      return `<a class="doc-attach-link" data-attach-id="${id}" href="#">${label}</a>`;
    });

    result = result.replace(/\[([^\]]+)\]\((?!attach:)([^)]+)\)/g,
      '<a href="$2" target="_blank">$1</a>');

    return result;
  }
}
