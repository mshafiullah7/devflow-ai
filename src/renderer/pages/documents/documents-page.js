import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelConfigsModal } from '../../components/model-configs/model-configs-modal.js';
import { QuickCommandsModal } from '../../components/quick-commands/quick-commands-modal.js';
import { GitController } from '../../components/git/git-controller.js';

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
  }

  async mount() {
    injectCss('pages/documents/documents-page.css');
    applyStoredTheme();

    [this._project, this._docs] = await Promise.all([
      window.db.projects.get(this._projectId),
      window.db.documents.list(this._projectId),
    ]);

    if (this._docTitle) {
      const match = this._docs.find(d => d.title.toLowerCase() === this._docTitle.toLowerCase());
      if (match) {
        this._activeId = match.id;
      } else {
        const created = await window.db.documents.create({ project_id: this._projectId, title: this._docTitle, content: '' });
        this._docs.push(created);
        this._activeId = created.id;
      }
    } else {
      this._activeId = this._docs[0]?.id ?? null;
    }

    this.container.innerHTML = this._pageTemplate();

    this._modelConfigsModal = new ModelConfigsModal({ onConfigsChanged: () => this._reloadModelDropdown() });
    this._modelConfigsModal.mount();
    await this._reloadModelDropdown();

    this._qcmdModal = new QuickCommandsModal({ onRunCommand: () => this.router.navigate('user-stories', { projectId: this._projectId }) });
    this._qcmdModal.mount();

    this._git = new GitController({
      getTermCwd: () => this._project?.project_path || '',
      gitBtnId:   'docBtnGit',
      gitBadgeId: 'docGitBadge',
    });
    this._git.mount();

    this._bindShellEvents();

    if (this._project?.project_path) {
      this._setHeaderFolderPath(this._project.project_path);
      this._git.refreshStatus();
      this._git.startPoll();
    }

    if (this._activeId) this._selectDoc(this._activeId, false);
    else                this._showEmpty();
  }

  unmount() {
    removeCss('pages/documents/documents-page.css');
    this._git?.stopPoll();
  }

  // ----------------------------------------------------------------
  // Page shell
  // ----------------------------------------------------------------
  _pageTemplate() {
    const name = this._project?.name ?? 'Project';
    return `
      <div class="documents-page">
        <header class="documents-page__header">
          <button class="documents-page__back" id="btnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div class="documents-page__title-group">
            <div class="documents-page__title">${escHtml(name)}</div>
            <div class="documents-page__subtitle">Project Documents</div>
          </div>
          <div class="project-page__folder-display" id="headerFolderDisplay">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
            <span class="project-page__folder-text" id="headerFolderText"></span>
          </div>
          <div class="project-page__model-group" style="-webkit-app-region:no-drag;">
            <select class="project-page__model-select" id="docModelSelect" title="AI Model">
              <option value="">Loading…</option>
            </select>
            <button class="project-page__model-cfg-btn" id="docBtnModelConfigs" title="Configure AI models">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <button class="project-page__folder-btn" id="docBtnFolder" title="Select folder" style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="project-page__git-btn" id="docBtnGit" title="Git (opens User Stories)" style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
              <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span class="project-page__git-badge" id="docGitBadge" hidden></span>
          </button>
          <button class="project-page__qcmd-btn" id="docBtnQcmd" title="Quick Commands" style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="4" cy="6"  r="1.5" fill="currentColor"/>
              <circle cx="4" cy="10" r="1.5" fill="currentColor"/>
              <circle cx="4" cy="14" r="1.5" fill="currentColor"/>
              <path d="M8 6h8M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </header>

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
    `;
  }

  async _reloadModelDropdown() {
    const select = this.container.querySelector('#docModelSelect');
    if (!select) return;
    const configs = await window.db.modelConfigs.list();
    const prevId  = select.value ? Number(select.value) : null;
    select.innerHTML = configs.length === 0
      ? `<option value="">No models configured</option>`
      : configs.map(c => `<option value="${c.id}">${escHtml(c.label)} [${c.type.toUpperCase()}]</option>`).join('');
    const def    = configs.find(c => c.is_default) || configs[0];
    const target = configs.find(c => c.id === prevId) || def;
    if (target) { select.value = target.id; this._aiModelConfig = target; }
  }

  _setHeaderFolderPath(folderPath) {
    const text    = this.container.querySelector('#headerFolderText');
    const display = this.container.querySelector('#headerFolderDisplay');
    if (!text || !display) return;
    text.textContent = folderPath;
    display.classList.add('project-page__folder-display--active');
  }

  _bindShellEvents() {
    this.container.querySelector('#btnBack')
      .addEventListener('click', () => this.router.navigate('project-home', { projectId: this._projectId }));

    this.container.querySelector('#docBtnModelConfigs')
      .addEventListener('click', () => this._modelConfigsModal.show());

    this.container.querySelector('#docModelSelect')
      .addEventListener('change', (e) => {
        const id = Number(e.target.value);
        window.db.modelConfigs.get(id).then(cfg => { this._aiModelConfig = cfg; });
      });

    this.container.querySelector('#docBtnFolder')
      .addEventListener('click', async () => {
        const folderPath = await window.db.dialog.openFolder();
        if (!folderPath) return;
        await window.db.projects.setPath({ id: this._projectId, project_path: folderPath });
        if (this._project) this._project.project_path = folderPath;
        this._setHeaderFolderPath(folderPath);
        this._git.refreshStatus();
        this._git.startPoll();
      });

    this.container.querySelector('#docBtnGit')
      .addEventListener('click', () =>
        this.router.navigate('git-changes', { projectId: this._projectId, from: 'documents' }));

    this.container.querySelector('#docBtnQcmd')
      .addEventListener('click', () => this._qcmdModal.show());

    this.container.querySelector('#docAddBtn')
      .addEventListener('click', () => this._addDoc());

    this.container.querySelector('#docList')
      .addEventListener('click', e => {
        const delBtn = e.target.closest('[data-del]');
        if (delBtn) { e.stopPropagation(); this._deleteDoc(Number(delBtn.dataset.del)); return; }
        const item = e.target.closest('[data-id]');
        if (item) this._selectDoc(Number(item.dataset.id));
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
    listEl.addEventListener('click', e => {
      const delBtn = e.target.closest('[data-del]');
      if (delBtn) { e.stopPropagation(); this._deleteDoc(Number(delBtn.dataset.del)); return; }
      const item = e.target.closest('[data-id]');
      if (item) this._selectDoc(Number(item.dataset.id));
    });
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

  // ----------------------------------------------------------------
  // Editor
  // ----------------------------------------------------------------
  async _selectDoc(id, switchToEdit = false) {
    this.container.querySelector('.doc-ai-card')?.remove();
    this._activeId = id;
    const doc = this._docs.find(d => d.id === id);
    if (!doc) return;

    this.container.querySelectorAll('.doc-sidebar__item').forEach(el => {
      el.classList.toggle('doc-sidebar__item--active', Number(el.dataset.id) === id);
    });

    this._attachments = await window.db.attachments.list(id);

    const panel      = this.container.querySelector('#docPanel');
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
          <button class="doc-editor__ai-btn" id="docAiBtn" title="AI Edit"${initialTab === 'preview' ? ' hidden' : ''}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M8 1v3M8 12v3M1 8h3M12 8h3M3.05 3.05l2.12 2.12M10.83 10.83l2.12 2.12M3.05 12.95l2.12-2.12M10.83 5.17l2.12-2.12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <circle cx="8" cy="8" r="2" fill="currentColor"/>
            </svg>
            AI
          </button>
          <button class="doc-editor__save" id="docSaveBtn"${initialTab === 'preview' ? ' disabled' : ''}>Save</button>
        </div>

        <div class="doc-editor__pane doc-editor__pane--edit${initialTab === 'edit' ? '' : ' doc-editor__pane--hidden'}" data-pane="edit">
          <textarea class="doc-editor__textarea" id="docContentTA"
            placeholder="Write your document in Markdown…\n\nReference attachments with: [My Diagram](attach:ID)">${escHtml(doc.content || '')}</textarea>
        </div>
        <div class="doc-editor__pane doc-editor__pane--preview${initialTab === 'preview' ? '' : ' doc-editor__pane--hidden'}" data-pane="preview">
          ${this._renderMarkdown(doc.content || '')}
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
          <button class="doc-attach-item__btn" data-sync="${a.id}" title="Sync changes from draw.io">
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
        tabs.forEach(t => t.classList.remove('doc-editor__tab--active'));
        tab.classList.add('doc-editor__tab--active');
        const aiBtn  = panel.querySelector('#docAiBtn');
        if (tab.dataset.tab === 'preview') {
          if (this._dirty) await save();
          previewPane.innerHTML = this._renderMarkdown(contentTA.value);
          editPane.classList.add('doc-editor__pane--hidden');
          previewPane.classList.remove('doc-editor__pane--hidden');
          this._bindAttachLinks(panel);
          saveBtn.disabled = true;
          if (aiBtn) aiBtn.hidden = true;
          const aiCard = this.container.querySelector('.doc-ai-card');
          if (aiCard) aiCard.hidden = true;
        } else {
          previewPane.classList.add('doc-editor__pane--hidden');
          editPane.classList.remove('doc-editor__pane--hidden');
          saveBtn.disabled = false;
          if (aiBtn) aiBtn.hidden = false;
          const existingCard = this.container.querySelector('.doc-ai-card');
          if (existingCard) existingCard.hidden = false;
          else this._showAiCard(doc);
          contentTA.focus();
        }
      });
    });

    panel.querySelector('#docAttachToggle').addEventListener('click', () => {
      panel.querySelector('#docAttachBody').classList.toggle('doc-attach-bar__body--open');
      panel.querySelector('.doc-attach-bar__chevron').classList.toggle('doc-attach-bar__chevron--open');
    });

    panel.querySelector('#docAiBtn').addEventListener('click', () => this._toggleAiCard(doc));

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

    list.addEventListener('click', async e => {
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
        const filepath = await window.shell.openDrawio({ id, name: att.name, content: att.content });
        this._drawioFiles.set(id, filepath);
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
    if (list) this._bindAttachListEvents(panel, this._activeId);
  }

  // ----------------------------------------------------------------
  // Add attachment form
  // ----------------------------------------------------------------
  _showAttachForm(docId, type) {
    this.container.querySelector('.doc-attach-form-overlay')?.remove();

    const label = type === 'svg' ? 'SVG' : 'draw.io';
    const ph    = type === 'svg'
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
          ${type === 'svg'
            ? '<p class="doc-attach-form__hint">Paste SVG code from Figma, draw.io export, Excalidraw, or hand-written SVG.</p>'
            : '<p class="doc-attach-form__hint">Paste draw.io XML. Use File → Export → XML in draw.io desktop, or copy from a .drawio file.</p>'}
        </div>
        <div class="doc-attach-form__footer">
          <button class="doc-attach-form__btn doc-attach-form__btn--cancel" id="attachFormCancel">Cancel</button>
          <button class="doc-attach-form__btn doc-attach-form__btn--save" id="attachFormSave">Add ${label}</button>
        </div>
      </div>
    `;

    this.container.querySelector('.documents-page__body').appendChild(formEl);

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
        const filepath = await window.shell.openDrawio({ id: full.id ?? openDrawioId, name: full.name, content: full.content });
        this._drawioFiles.set(openDrawioId, filepath);
        lb.remove();
        document.removeEventListener('keydown', escH);
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
    if (!confirm('Delete this document?')) return;
    await window.db.documents.delete(id);
    this._docs = this._docs.filter(d => d.id !== id);
    if (this._activeId === id) this._activeId = this._docs[0]?.id ?? null;
    this._refreshList();
    if (this._activeId) await this._selectDoc(this._activeId);
    else                this._showEmpty();
  }

  // ----------------------------------------------------------------
  // AI Edit card
  // ----------------------------------------------------------------
  _toggleAiCard(doc) {
    const existing = this.container.querySelector('.doc-ai-card');
    if (existing) { existing.remove(); return; }
    this._showAiCard(doc);
  }

  _showAiCard(doc) {
    const card = document.createElement('div');
    card.className = 'doc-ai-card';
    card.innerHTML = `
      <div class="doc-ai-card__header">
        <span class="doc-ai-card__title">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M8 1v3M8 12v3M1 8h3M12 8h3M3.05 3.05l2.12 2.12M10.83 10.83l2.12 2.12M3.05 12.95l2.12-2.12M10.83 5.17l2.12-2.12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            <circle cx="8" cy="8" r="2" fill="currentColor"/>
          </svg>
          AI Edit
        </span>
        <div class="doc-ai-card__header-actions">
          <button class="doc-ai-card__icon-btn" id="docAiClear" title="Clear conversation">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M2 13h12M10.5 3L5 8.5l-2 4.5 4.5-2 5.5-5.5-2-2z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="doc-ai-card__icon-btn" id="docAiClose" aria-label="Close">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="doc-ai-card__messages" id="docAiMessages">
        <p class="doc-ai-card__welcome">Describe what changes to make. The AI has full context of the document and any attached diagrams.</p>
      </div>
      <div class="doc-ai-card__compose">
        <textarea class="doc-ai-card__input" id="docAiInput" rows="2" maxlength="4000"
          placeholder="e.g. Add a deployment section based on the architecture diagram"></textarea>
        <button class="doc-ai-card__send" id="docAiSend" title="Send (Enter) — Alt+Enter for new line">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M14 2L2 8l4 2 2 4 6-12z" fill="currentColor"/>
          </svg>
        </button>
      </div>
    `;

    this.container.querySelector('.documents-page__body').appendChild(card);

    const inputEl = card.querySelector('#docAiInput');
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      const capped = Math.min(inputEl.scrollHeight, 160);
      inputEl.style.height = capped + 'px';
      inputEl.style.overflowY = inputEl.scrollHeight > 160 ? 'auto' : 'hidden';
    });

    card.querySelector('#docAiClose').addEventListener('click', () => card.remove());
    card.querySelector('#docAiClear').addEventListener('click', () => {
      card.querySelector('#docAiMessages').innerHTML =
        '<p class="doc-ai-card__welcome">Conversation cleared.</p>';
    });

    const submit = () => {
      const instruction = inputEl.value.trim();
      if (!instruction) { inputEl.focus(); return; }
      this._runAiEdit(doc, instruction, card);
      inputEl.value = '';
      inputEl.style.height = '';
      inputEl.style.overflowY = '';
    };

    card.querySelector('#docAiSend').addEventListener('click', submit);
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.altKey) { e.preventDefault(); submit(); }
    });

    inputEl.focus();
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
    bubble.innerHTML = `<span class="doc-ai-msg__preview">${escHtml(preview)}</span><div class="doc-ai-msg__status-row"><span class="doc-ai-msg__applied">✓ Applied — review and save</span><button class="doc-ai-msg__revert-btn" title="Revert to previous content"><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2 9a6 6 0 1 0 1-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M2 4v4h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`;
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

    const promptParts = [
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
      promptParts.push('', '## Diagram attachments (read for context only)', ...attachContextParts);
    }

    promptParts.push(
      '',
      '## User instruction',
      instruction,
      '',
      'Return ONLY the updated document content in Markdown. No explanations, no preamble, no code fences wrapping the entire output.',
    );

    const prompt = promptParts.join('\n');

    const prevContent = contentTA?.value ?? '';

    try {
      if (cfg.type === 'api') {
        await this._runAiEditApi(cfg, prompt, aiMsgEl, contentTA, prevContent);
      } else {
        await this._runAiEditCli(cfg, prompt, aiMsgEl, contentTA, prevContent);
      }
    } finally {
      sendBtn.disabled = false;
      inputEl.disabled = false;
      inputEl.focus();
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
      res = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (err) {
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
        } catch { /* skip malformed SSE chunk */ }
      }
    }

    if (fullText.trim()) {
      if (contentTA) { contentTA.value = fullText.trim(); this._dirty = true; }
      const activeDoc = this._docs.find(d => d.id === this._activeId);
      if (activeDoc) activeDoc.content = fullText.trim();
      this._refreshPreviewIfActive();
      this._setChatMsgApplied(aiMsgEl, fullText, prevContent);
    } else {
      this._updateChatMsg(aiMsgEl, 'No content returned by model.', 'error');
    }
  }

  async _runAiEditCli(cfg, prompt, aiMsgEl, contentTA, prevContent) {
    const exe        = cfg.executable || 'claude';
    const flags      = cfg.flags ? ` ${cfg.flags}` : '';
    const cwd        = this._project?.project_path || '';
    const safePrompt = prompt.replace(/'/g, "''");
    const command    = cfg.input_mode === 'heredoc'
      ? `$p = @'\n${safePrompt}\n'@\n${exe}${flags} $p`
      : `$p = @'\n${safePrompt}\n'@\nWrite-Output $p | ${exe}${flags}`;

    return new Promise(resolve => {
      let fullOutput = '';

      window.db.terminal.removeListeners();
      window.db.terminal.onData(({ text }) => {
        fullOutput += text;
        this._updateChatMsg(aiMsgEl, `Generating… ${fullOutput.length} chars`, 'thinking');
      });
      window.db.terminal.onDone(({ exitCode }) => {
        window.db.terminal.removeListeners();
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
        this._updateChatMsg(aiMsgEl, `CLI error: ${err.message}`, 'error');
        resolve();
      });
    });
  }

  // ----------------------------------------------------------------
  // Preview refresh (called after AI applies content)
  // ----------------------------------------------------------------
  _refreshPreviewIfActive() {
    const panel = this.container.querySelector('#docPanel');
    if (!panel) return;
    const previewPane = panel.querySelector('[data-pane="preview"]');
    const contentTA   = panel.querySelector('#docContentTA');
    if (!previewPane || !contentTA) return;
    if (!previewPane.classList.contains('doc-editor__pane--hidden')) {
      previewPane.innerHTML = this._renderMarkdown(contentTA.value);
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
  // Markdown renderer (identical to DocumentsModal)
  // ----------------------------------------------------------------
  _renderMarkdown(text) {
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
      out.push(this._renderTable(tableLines));
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
      if (hm) { closeList(); out.push(`<h${hm[1].length}>${this._inlineMd(esc(hm[2]))}</h${hm[1].length}>`); lastBlock = 'heading'; continue; }
      if (/^[-*_]{3,}\s*$/.test(line)) { closeList(); out.push('<hr>'); lastBlock = 'hr'; continue; }
      const ulm = line.match(/^[-*+]\s+(.*)/);
      if (ulm) { if (inOl) { out.push('</ol>'); inOl = false; } if (!inUl) { out.push('<ul>'); inUl = true; } out.push(`<li>${this._inlineMd(esc(ulm[1]))}</li>`); lastBlock = 'list'; continue; }
      const olm = line.match(/^\d+\.\s+(.*)/);
      if (olm) { if (inUl) { out.push('</ul>'); inUl = false; } if (!inOl) { out.push('<ol>'); inOl = true; } out.push(`<li>${this._inlineMd(esc(olm[1]))}</li>`); lastBlock = 'list'; continue; }
      const bqm = line.match(/^>\s?(.*)/);
      if (bqm) { closeList(); out.push(`<blockquote>${this._inlineMd(esc(bqm[1]))}</blockquote>`); lastBlock = 'blockquote'; continue; }
      if (line.trim() === '') { closeList(); if (lastBlock === 'p') { out.push('<br>'); lastBlock = 'br'; } continue; }
      closeList();
      out.push(`<p>${this._inlineMd(esc(line))}</p>`);
      lastBlock = 'p';
    }

    closeList();
    flushTable();
    if (inCode) out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
    return out.join('');
  }

  _renderTable(lines) {
    const esc      = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const parseRow = line => line.split('|').slice(1, -1).map(c => this._inlineMd(esc(c.trim())));
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

  _inlineMd(s) {
    return s
      .replace(/`([^`]+)`/g,           '<code>$1</code>')
      .replace(/\*\*\*(.+?)\*\*\*/g,   '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g,       '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,           '<em>$1</em>')
      .replace(/~~(.+?)~~/g,           '<del>$1</del>')
      .replace(/\[([^\]]+)\]\(attach:(\d+)\)/g,
        '<a class="doc-attach-link" data-attach-id="$2" href="#">$1</a>')
      .replace(/\[([^\]]+)\]\((?!attach:)([^)]+)\)/g,
        '<a href="$2" target="_blank">$1</a>');
  }
}
