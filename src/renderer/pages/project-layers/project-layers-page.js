import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelPicker }      from '../../components/model-picker/model-picker.js';

export class ProjectLayersPage {
  constructor(container, params, router) {
    this.container      = container;
    this.router         = router;
    this._projectId     = params.projectId;
    this._project       = null;
    this._documents     = [];
    this._layers        = [];
    this._activeId      = null;
    this._aiModelConfig = null;
    this._pendingSave   = null;
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  async mount() {
    injectCss('pages/user-stories/user-stories.css');
    injectCss('pages/extract-user-stories/extract-user-stories-page.css');
    injectCss('pages/issues/issues-page.css');
    injectCss('pages/project-layers/project-layers-page.css');
    applyStoredTheme();

    const [project, _mapping] = await Promise.all([
      window.db.projects.get(this._projectId),
      window.db.modelMapping.get('project-layers'),
    ]);
    this._project = project;

    this.container.innerHTML = this._template();

    this._picker = new ModelPicker({
      anchor:    this.container.querySelector('#plModelPicker'),
      onSelect:  model => { this._aiModelConfig = model; },
      initialId: _mapping?.model_config_id ?? null,
    });
    await this._picker.reload();

    this._bindHeaderEvents();
    this._initResizable();

    await Promise.all([
      this._loadDocuments(),
      this._loadLayers(),
    ]);

    this._refreshGitBadge();
  }

  unmount() {
    const fn = this._pendingSave;
    this._pendingSave = null;
    if (fn) fn();
    window.app.chat.offAll();
    if (this._onKeyDown) document.removeEventListener('keydown', this._onKeyDown);
    removeCss('pages/project-layers/project-layers-page.css');
    removeCss('pages/issues/issues-page.css');
    removeCss('pages/extract-user-stories/extract-user-stories-page.css');
    removeCss('pages/user-stories/user-stories.css');
    this._picker?.unmount();
  }

  // ----------------------------------------------------------------
  // Template — 30% list | resize | 70% detail (mirrors Issues page)
  // ----------------------------------------------------------------
  _template() {
    const name = this._project ? escHtml(this._project.name) : 'Project';
    return `
      <div class="project-page">

        <header class="project-page__header">
          <button class="project-page__back" id="plBtnBack" aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="project-page__title-group">
            <h1 class="project-page__title">${name}</h1>
            <p class="project-page__desc">Project Layers</p>
          </div>
          <div class="project-page__header-actions" style="-webkit-app-region:no-drag;">
            <div class="project-page__model-group">
              <div id="plModelPicker"></div>
            </div>
            <button class="project-page__git-btn" id="plBtnGit" title="Git Changes" style="-webkit-app-region:no-drag;">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
                <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <span class="project-page__git-badge" id="plGitBadge" hidden></span>
            </button>
          </div>
        </header>

        <div class="project-page__workspace">

          <!-- Left 30%: Layers list -->
          <aside class="project-panel" id="plPanelList">
            <div class="project-related__section-hd">
              <span class="project-related__section-label">Layers</span>
              <span class="project-related__section-count" id="plLayerCount">0</span>
              <button class="pl-generate-btn" id="plBtnGenerate" title="Generate layers from documents" style="-webkit-app-region:no-drag;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Generate
              </button>
              <button class="is-add-btn" id="plBtnAdd" title="Add layer (Ctrl+N)" aria-label="Add layer">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <div class="project-related__section-body" id="plLayersList">
              <div class="project-related__empty">No layers</div>
            </div>
          </aside>

          <div class="project-panel__resize" data-resize="pl-list"></div>

          <!-- Right 70%: Layer detail -->
          <section class="project-panel project-panel--detail" id="plPanelDetail">
            <div class="project-panel__header">
              <span class="project-panel__title">Layer Detail</span>
              <div class="project-panel__header-actions" id="plDetailHeaderActions"></div>
            </div>
            <div class="project-panel__content" id="plLayerDetail">
              <div class="project-panel__empty">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                  <polyline points="2 17 12 22 22 17"/>
                  <polyline points="2 12 12 17 22 12"/>
                </svg>
                <p>Select a layer or add a new one</p>
              </div>
            </div>
          </section>

        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  _bindHeaderEvents() {
    this.container.querySelector('#plBtnBack')
      .addEventListener('click', () => {
        const fn = this._pendingSave; this._pendingSave = null;
        if (fn) fn();
        this.router.navigate('project-home', { projectId: this._projectId });
      });

    this.container.querySelector('#plBtnGit')
      .addEventListener('click', () =>
        this.router.navigate('git-changes', { projectId: this._projectId, from: 'project-layers' }));


    this.container.querySelector('#plBtnGenerate')
      .addEventListener('click', () => this._openGenerateModal());

    this.container.querySelector('#plBtnAdd')
      .addEventListener('click', () => this._showAddDetail());

    document.addEventListener('keydown', this._onKeyDown = (e) => {
      if (e.target.matches('input, textarea, select, [contenteditable]')) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        this._showAddDetail();
      }
    });
  }

  // ----------------------------------------------------------------
  // Git badge — red dot if any uncommitted files in project
  // ----------------------------------------------------------------
  async _refreshGitBadge() {
    const badge = this.container.querySelector('#plGitBadge');
    if (!badge) return;
    const cwd = this._project?.project_path;
    if (!cwd) return;
    try {
      const r = await window.db.terminal.exec({ command: 'git status --short 2>&1', cwd });
      badge.hidden = !(r.stdout || '').trim().length;
    } catch {
      badge.hidden = true;
    }
  }

  // ----------------------------------------------------------------
  // Resizable panels — 30 / 70
  // ----------------------------------------------------------------
  _initResizable() {
    const handle  = this.container.querySelector('.project-panel__resize[data-resize="pl-list"]');
    const panelEl = this.container.querySelector('#plPanelList');
    if (!handle || !panelEl) return;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startX     = e.clientX;
      const startWidth = panelEl.getBoundingClientRect().width;
      const parentW    = panelEl.parentElement.getBoundingClientRect().width;

      document.body.style.userSelect = 'none';
      document.body.style.cursor     = 'col-resize';

      const onMove = (ev) => {
        const delta = ev.clientX - startX;
        const newPx = Math.max(180, startWidth + delta);
        panelEl.style.flex = `0 0 ${(newPx / parentW) * 100}%`;
      };
      const onUp = () => {
        document.body.style.userSelect = '';
        document.body.style.cursor     = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  // ----------------------------------------------------------------
  // Data
  // ----------------------------------------------------------------
  async _loadDocuments() {
    this._documents = await window.db.documents.list(this._projectId) ?? [];
  }

  async _loadLayers() {
    this._layers = await window.db.projectLayers.list(this._projectId) ?? [];
    this._renderList();

    if (this._activeId) {
      const still = this._layers.find(l => l.id === this._activeId);
      if (!still) { this._activeId = null; this._showEmptyDetail(); }
    }
    if (!this._activeId && this._layers.length > 0) {
      this._selectLayer(this._layers[0].id);
    }
  }

  // ----------------------------------------------------------------
  // Left panel — list
  // ----------------------------------------------------------------
  _renderList() {
    const listEl  = this.container.querySelector('#plLayersList');
    const countEl = this.container.querySelector('#plLayerCount');
    if (!listEl) return;
    if (countEl) countEl.textContent = this._layers.length;

    if (this._layers.length === 0) {
      listEl.innerHTML = `<div class="project-related__empty">No layers yet</div>`;
      return;
    }

    listEl.innerHTML = this._layers.map(layer => `
      <div class="eus-src-item${layer.id === this._activeId ? ' eus-src-item--active' : ''}"
           data-id="${layer.id}">
        <div class="eus-src-item__info pl-list-info">
          <div class="pl-list-title-row">
            <span class="eus-src-item__id">#${layer.id}</span>
            <span class="eus-src-item__title">${escHtml(layer.name)}</span>
          </div>
          ${layer.folder_path
            ? `<span class="pl-list-path" title="${escHtml(layer.folder_path)}">${escHtml(layer.folder_path)}</span>`
            : `<span class="pl-list-path pl-list-path--empty">No folder set</span>`}
        </div>
        <div class="eus-src-item__actions">
          <button class="eus-story-action eus-story-action--delete pl-list-delete"
            data-id="${layer.id}" title="Delete" aria-label="Delete">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8M5.5 6v4M8.5 6v4"
                stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>`).join('');

    listEl.querySelectorAll('.eus-src-item').forEach(item => {
      const id = parseInt(item.dataset.id);
      item.addEventListener('click', (e) => {
        if (e.target.closest('.pl-list-delete')) return;
        this._selectLayer(id);
      });
    });

    listEl.querySelectorAll('.pl-list-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this._deleteLayer(parseInt(btn.dataset.id));
      });
    });
  }

  async _selectLayer(id) {
    const fn = this._pendingSave; this._pendingSave = null;
    if (fn) await fn();

    this._activeId = id;
    this.container.querySelectorAll('#plLayersList .eus-src-item').forEach(el =>
      el.classList.toggle('eus-src-item--active', parseInt(el.dataset.id) === id)
    );
    const layer = this._layers.find(l => l.id === id);
    if (layer) this._showDetail(layer);
  }

  async _deleteLayer(id) {
    const ok = await this._showConfirm('Delete this layer?', 'Delete');
    if (!ok) return;
    await window.db.projectLayers.delete(id);
    if (this._activeId === id) { this._activeId = null; this._showEmptyDetail(); }
    this._layers = this._layers.filter(l => l.id !== id);
    this._renderList();
  }

  // ----------------------------------------------------------------
  // Right panel — empty state
  // ----------------------------------------------------------------
  _showEmptyDetail() {
    this._pendingSave = null;
    const el = this.container.querySelector('#plLayerDetail');
    if (el) el.innerHTML = `
      <div class="project-panel__empty">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/>
          <polyline points="2 17 12 22 22 17"/>
          <polyline points="2 12 12 17 22 12"/>
        </svg>
        <p>Select a layer or add a new one</p>
      </div>`;
    const actions = this.container.querySelector('#plDetailHeaderActions');
    if (actions) actions.innerHTML = '';
  }

  // ----------------------------------------------------------------
  // Right panel — Add new layer form
  // ----------------------------------------------------------------
  _showAddDetail() {
    const fn = this._pendingSave; this._pendingSave = null;
    if (fn) fn();

    this._activeId = null;
    this.container.querySelectorAll('#plLayersList .eus-src-item')
      .forEach(el => el.classList.remove('eus-src-item--active'));

    const el      = this.container.querySelector('#plLayerDetail');
    const actions = this.container.querySelector('#plDetailHeaderActions');
    if (!el) return;

    el.innerHTML = this._detailFormHtml(null);
    if (actions) actions.innerHTML = `<button class="is-form__btn" id="plFormSave">Add Layer</button>`;
    this._bindDetailFormEvents(el, null);
    el.querySelector('#plFormName')?.focus();
  }

  // ----------------------------------------------------------------
  // Right panel — Edit existing layer
  // ----------------------------------------------------------------
  _showDetail(layer) {
    const el      = this.container.querySelector('#plLayerDetail');
    const actions = this.container.querySelector('#plDetailHeaderActions');
    if (!el) return;

    el.innerHTML = this._detailFormHtml(layer);
    if (actions) actions.innerHTML = `<button class="is-form__btn" id="plFormSave">Save Changes</button>`;
    this._bindDetailFormEvents(el, layer);
  }

  // ----------------------------------------------------------------
  // Detail form HTML
  // ----------------------------------------------------------------
  _detailFormHtml(layer) {
    const folderPath = layer?.folder_path || '';
    const hasPath    = !!folderPath;
    return `
      <div class="is-form">
        <div class="is-form__header">
          <h2 class="is-form__heading">${layer ? 'Edit Layer' : 'New Layer'}</h2>
        </div>
        <div class="is-form__body">

          <div class="is-form__field">
            <label class="is-form__label" for="plFormName">
              Layer Name <span class="is-form__required">*</span>
            </label>
            <input class="is-form__input" id="plFormName" type="text" maxlength="120"
              placeholder="e.g. Frontend, Backend API, Database…"
              autocomplete="off" value="${escHtml(layer?.name || '')}"/>
          </div>

          <div class="is-form__field">
            <label class="is-form__label" for="plFormDesc">Description</label>
            <textarea class="is-form__textarea" id="plFormDesc" rows="4"
              placeholder="Describe what this layer contains or is responsible for…">${escHtml(layer?.description || '')}</textarea>
          </div>

          <div class="is-form__field">
            <label class="is-form__label" for="plFormSetup">Project Setup Instructions</label>
            <textarea class="is-form__textarea" id="plFormSetup" rows="6"
              placeholder="Steps to set up this layer locally — install dependencies, environment variables, run commands…">${escHtml(layer?.setup_instructions || '')}</textarea>
          </div>

          <div class="is-form__field">
            <label class="is-form__label">Project Folder Path</label>
            <div class="pl-folder-row">
              <div class="pl-folder-pill${hasPath ? ' pl-folder-pill--set' : ''}" id="plFolderPill">
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                  <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                    stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                </svg>
                <span id="plFolderText" class="${hasPath ? '' : 'pl-folder-text--empty'}"
                >${hasPath ? escHtml(folderPath) : 'No folder selected'}</span>
              </div>
              <button class="pl-browse-btn" id="plBrowseBtn" type="button">
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                  <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                    stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                </svg>
                Browse…
              </button>
            </div>
            <input type="hidden" id="plFolderValue" value="${escHtml(folderPath)}"/>
          </div>

        </div>
      </div>`;
  }

  // ----------------------------------------------------------------
  // Detail form events
  // ----------------------------------------------------------------
  _bindDetailFormEvents(el, layer) {
    const nameEl      = el.querySelector('#plFormName');
    const descEl      = el.querySelector('#plFormDesc');
    const setupEl     = el.querySelector('#plFormSetup');
    const folderInput = el.querySelector('#plFolderValue');
    const folderPill  = el.querySelector('#plFolderPill');
    const folderText  = el.querySelector('#plFolderText');
    const browseBtn   = el.querySelector('#plBrowseBtn');
    const saveBtn     = this.container.querySelector('#plFormSave');

    // Browse for folder
    const pickFolder = async () => {
      const folderPath = await window.db.dialog.openFolder();
      if (!folderPath) return;
      folderInput.value = folderPath;
      folderText.textContent = folderPath;
      folderText.classList.remove('pl-folder-text--empty');
      folderPill.classList.add('pl-folder-pill--set');
    };
    browseBtn?.addEventListener('click', pickFolder);
    folderPill?.addEventListener('click', pickFolder);

    // Save
    const save = async (silent = false) => {
      const name = nameEl.value.trim();
      if (!name) {
        if (!silent) { nameEl.classList.add('is-form__input--error'); nameEl.focus(); }
        return;
      }
      nameEl.classList.remove('is-form__input--error');
      this._pendingSave = null;
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = layer ? 'Saving…' : 'Adding…'; }

      const payload = {
        project_id:         this._projectId,
        name,
        description:        descEl.value.trim() || null,
        setup_instructions: setupEl.value.trim() || null,
        folder_path:        folderInput.value.trim() || null,
      };

      try {
        if (layer) {
          const updated = await window.db.projectLayers.update({ id: layer.id, ...payload });
          const idx = this._layers.findIndex(l => l.id === layer.id);
          if (idx !== -1) this._layers[idx] = updated;
          this._renderList();
          this._selectLayer(layer.id);
        } else {
          const created = await window.db.projectLayers.create({
            ...payload,
            sort_order: this._layers.length,
          });
          this._layers.push(created);
          this._renderList();
          this._selectLayer(created.id);
        }
      } catch {
        if (saveBtn) {
          saveBtn.disabled    = false;
          saveBtn.textContent = layer ? 'Save Changes' : 'Add Layer';
        }
      }
    };

    this._pendingSave = () => save(true);
    saveBtn?.addEventListener('click', () => save());
    el.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
    });
  }

  // ----------------------------------------------------------------
  // Generate Layers — modal with document list
  // ----------------------------------------------------------------
  _openGenerateModal() {
    const overlay = document.createElement('div');
    overlay.className = 'pl-modal-overlay';

    const docsHtml = this._documents.length === 0
      ? `<div class="pl-modal-empty-docs">
           <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
             <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
             <polyline points="14 2 14 8 20 8"/>
           </svg>
           <p>No documents in this project.<br>Add documents first, then generate layers.</p>
         </div>`
      : this._documents.map(doc => `
          <label class="pl-modal-doc-item" data-doc-id="${doc.id}">
            <span class="pl-modal-doc-check">
              <svg class="pl-check-off" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" stroke-width="1.5"/>
              </svg>
              <svg class="pl-check-on" viewBox="0 0 16 16" fill="none" style="display:none;">
                <rect x="1" y="1" width="14" height="14" rx="3" fill="var(--accent)" stroke="var(--accent)" stroke-width="1.5"/>
                <path d="M4.5 8l2.5 2.5 4.5-5" stroke="#fff" stroke-width="1.6"
                  stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="pl-modal-doc-title" title="${escHtml(doc.title)}">${escHtml(doc.title)}</span>
          </label>`).join('');

    overlay.innerHTML = `
      <div class="pl-modal">
        <div class="pl-modal__header">
          <span class="pl-modal__title">Generate Layers from Documents</span>
          <button class="pl-modal__close" id="plModalClose">✕</button>
        </div>
        <div class="pl-modal__body">
          <p class="pl-modal__hint">Select one or more documents. AI will analyse them and suggest the architectural layers (sub-projects) needed.</p>
          <div class="pl-modal-docs-list">${docsHtml}</div>
          <div class="pl-modal__status" id="plModalStatus" style="display:none;"></div>
        </div>
        <div class="pl-modal__footer">
          <button class="pl-modal-cancel-btn" id="plModalCancel">Cancel</button>
          <button class="pl-modal-generate-btn" id="plModalGenerateBtn"
            ${this._documents.length === 0 ? 'disabled' : ''}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Generate
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const selectedIds = new Set();
    let generating    = false;

    // Document toggles
    overlay.querySelectorAll('.pl-modal-doc-item').forEach(item => {
      item.addEventListener('click', () => {
        if (generating) return;
        const id = parseInt(item.dataset.docId);
        if (selectedIds.has(id)) {
          selectedIds.delete(id);
          item.classList.remove('pl-modal-doc-item--selected');
          item.querySelector('.pl-check-off').style.display = '';
          item.querySelector('.pl-check-on').style.display  = 'none';
        } else {
          selectedIds.add(id);
          item.classList.add('pl-modal-doc-item--selected');
          item.querySelector('.pl-check-off').style.display = 'none';
          item.querySelector('.pl-check-on').style.display  = '';
        }
      });
    });

    const close = () => {
      window.app.chat.offAll();
      generating = false;
      overlay.remove();
    };

    overlay.querySelector('#plModalClose').addEventListener('click', () => {
      if (!generating) close();
    });
    overlay.querySelector('#plModalCancel').addEventListener('click', () => {
      if (generating) { window.app.chat.cancel(); window.app.chat.offAll(); }
      close();
    });
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape' && !generating) close(); });

    overlay.querySelector('#plModalGenerateBtn').addEventListener('click', async () => {
      if (generating) return;
      if (selectedIds.size === 0) {
        this._setModalStatus(overlay, 'warning', 'Select at least one document first.');
        return;
      }
      if (!this._aiModelConfig) {
        this._setModalStatus(overlay, 'warning', 'Pick an AI model in the header first.');
        return;
      }

      generating = true;
      const generateBtn = overlay.querySelector('#plModalGenerateBtn');
      const cancelBtn   = overlay.querySelector('#plModalCancel');

      const resetBtn = (label = 'Generate') => {
        generating = false;
        generateBtn.disabled = false;
        generateBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> ${label}`;
      };

      generateBtn.disabled  = true;
      generateBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10"/></svg> Generating…`;
      cancelBtn.textContent = 'Cancel';
      this._setModalStatus(overlay, 'running', 'Analysing documents…');

      // Fetch document content
      const docs     = await Promise.all([...selectedIds].map(id => window.db.documents.get(id)));
      const docsText = docs.filter(Boolean)
        .map(d => `### ${d.title}\n\n${(d.content || '').trim() || '(no content)'}`)
        .join('\n\n---\n\n');

      const existingNames = new Set(this._layers.map(l => l.name.toLowerCase().trim()));

      const prompt = [
        'You are a software architect. Based on the following project documentation, identify the distinct architectural layers or sub-projects needed to build this system.',
        'Each layer is a separate codebase or deployment unit (e.g. "Frontend", "Backend API", "Database", "Mobile App", "Infrastructure").',
        '',
        'For each layer also provide "setup_instructions": a concise, step-by-step guide that starts with the project creation/scaffolding command for that technology (e.g. "dotnet new webapi -n MyApi", "ng new my-app", "npx create-react-app my-app", "npm init"), then covers prerequisites, dependency installation commands, environment variable setup, and how to run the layer locally.',
        '',
        'Return ONLY a valid JSON array — no markdown, no explanation, nothing else.',
        'Format: [{"name":"Frontend","description":"Angular web app","setup_instructions":"1. Install Node 18+\\n2. Install Angular CLI: npm install -g @angular/cli\\n3. Scaffold: ng new my-app --routing --style=scss\\n4. cd my-app && npm install\\n5. Copy .env.example to .env and fill in values\\n6. Run: ng serve"},{"name":"Backend API","description":".NET 8 Web API","setup_instructions":"1. Install .NET 8 SDK\\n2. Scaffold: dotnet new webapi -n MyApi\\n3. cd MyApi && dotnet restore\\n4. Set connection string in appsettings.json\\n5. Run: dotnet run"}]',
        '',
        '--- PROJECT DOCUMENTS ---',
        docsText,
      ].join('\n');

      let accumulated = '';
      window.app.chat.offAll();

      window.app.chat.onToken(({ text }) => {
        accumulated += text;
        const statusEl = overlay.querySelector('#plModalStatusText');
        if (statusEl) statusEl.textContent = `Generating… (${accumulated.length} chars)`;
      });

      window.app.chat.onDone(async ({ raw }) => {
        window.app.chat.offAll();

        // `error` is always set for non-HTML responses — use `raw` directly
        const responseText = raw || accumulated;

        if (!responseText?.trim()) {
          this._setModalStatus(overlay, 'error', 'AI returned an empty response. Check your model settings.');
          resetBtn('Generate');
          return;
        }

        const generated = this._parseLayersJson(responseText);
        if (!generated?.length) {
          this._setModalStatus(overlay, 'error', 'Could not parse a layer list from the response. Try again or use a more capable model.');
          resetBtn('Retry');
          return;
        }

        // Merge — skip names that already exist (case-insensitive)
        let added = 0;
        for (const item of generated) {
          const nameLower = (item.name || '').toLowerCase().trim();
          if (!nameLower || existingNames.has(nameLower)) continue;
          const layer = await window.db.projectLayers.create({
            project_id:         this._projectId,
            name:               item.name.trim(),
            description:        (item.description || '').trim() || null,
            setup_instructions: (item.setup_instructions || '').trim() || null,
            sort_order:         this._layers.length + added,
          });
          this._layers.push(layer);
          existingNames.add(nameLower);
          added++;
        }

        this._renderList();

        if (added === 0) {
          this._setModalStatus(overlay, 'info', `All ${generated.length} suggested layers already exist.`);
          cancelBtn.textContent = 'Close';
          resetBtn('Retry');
        } else {
          // Auto-select first new layer then close
          const firstNew = this._layers[this._layers.length - added];
          if (firstNew) this._selectLayer(firstNew.id);
          this._setModalStatus(overlay, 'success', `✓ Added ${added} layer${added > 1 ? 's' : ''}. Closing…`);
          generateBtn.innerHTML = '✓ Done';
          setTimeout(() => close(), 1000);
        }
      });

      window.app.chat.generate({ prompt, model: this._aiModelConfig });
    });
  }

  _parseLayersJson(raw) {
    try {
      const clean = raw.replace(/\x1B\[[0-9;]*[mGKHFJA-Za-z]/g, '').trim();
      const match = clean.match(/\[[\s\S]*\]/);
      if (!match) return null;
      const arr = JSON.parse(match[0]);
      return Array.isArray(arr)
        ? arr.filter(i => typeof i?.name === 'string' && i.name.trim())
        : null;
    } catch { return null; }
  }

  _setModalStatus(overlay, type, message) {
    const el = overlay.querySelector('#plModalStatus');
    if (!el) return;
    el.style.display = '';
    el.className = `pl-modal__status pl-modal__status--${type}`;
    el.innerHTML = `<span id="plModalStatusText">${escHtml(message)}</span>`;
  }

  // ----------------------------------------------------------------
  // Confirm dialog
  // ----------------------------------------------------------------
  _showConfirm(message, confirmLabel = 'Delete') {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'is-confirm-overlay';
      overlay.innerHTML = `
        <div class="is-confirm-dialog">
          <p class="is-confirm-msg">${escHtml(message)}</p>
          <div class="is-confirm-btns">
            <button class="is-confirm-btn is-confirm-btn--cancel">Cancel</button>
            <button class="is-confirm-btn is-confirm-btn--ok">${escHtml(confirmLabel)}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const done = (r) => { overlay.remove(); resolve(r); };
      overlay.querySelector('.is-confirm-btn--cancel').addEventListener('click', () => done(false));
      overlay.querySelector('.is-confirm-btn--ok').addEventListener('click',     () => done(true));
      overlay.addEventListener('keydown', e => { if (e.key === 'Escape') done(false); });
    });
  }
}
