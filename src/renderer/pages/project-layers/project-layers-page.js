import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelPicker }      from '../../components/model-picker/model-picker.js';
import { ProjectSidebar }   from '../../components/project-sidebar/project-sidebar.js';
import { Dialog }           from '../../components/dialog/dialog.js';

// scaffold_structure is stored as a JSON array of folder paths; the edit form
// shows/accepts it as one path per line.
function scaffoldStructureToLines(scaffoldStructure) {
  if (!scaffoldStructure) return '';
  try {
    const parsed = JSON.parse(scaffoldStructure);
    if (Array.isArray(parsed)) return parsed.join('\n');
  } catch { /* not JSON — fall through and show as-is */ }
  return scaffoldStructure;
}

function linesToScaffoldStructure(text) {
  const paths = (text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  return paths.length ? JSON.stringify(paths) : null;
}

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
    this._detailKeyHandler = null;
    this._generating     = false;
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  async mount() {
    injectCss('shared/project-workspace.css');
    injectCss('pages/extract-user-stories/extract-user-stories-page.css');
    injectCss('pages/issues/issues-page.css');
    injectCss('pages/project-layers/project-layers-page.css');
    injectCss('components/project-sidebar/project-sidebar.css');
    applyStoredTheme();

    const [project, _mapping] = await Promise.all([
      window.db.projects.get(this._projectId),
      window.db.modelMapping.get('project-layers'),
    ]);
    this._project = project;

    this.container.innerHTML = this._template();

    this._picker = new ModelPicker({
      anchor:    this.container.querySelector('#plModelPicker'),
      onSelect:  model => {
        this._aiModelConfig = model;
      },
      initialId: _mapping?.model_config_id ?? null,
    });
    await this._picker.reload();

    this._bindHeaderEvents();
    this._sidebar.bindEvents(this.container);
    this._sidebar.loadCounts(this.container);
    this._initResizable();

    this.router.setNavigationGuard(() => this._canLeaveNow());

    await Promise.all([
      this._loadDocuments(),
      this._loadLayers(),
    ]);

  }

  unmount() {
    this.router.clearNavigationGuard();
    const fn = this._pendingSave;
    this._pendingSave = null;
    if (fn) fn();
    window.app.chat.offAll();
    window.app.plPty.offAll();
    window.app.plPty.kill();
    if (this._onKeyDown) document.removeEventListener('keydown', this._onKeyDown);
    removeCss('pages/project-layers/project-layers-page.css');
    removeCss('pages/issues/issues-page.css');
    removeCss('pages/extract-user-stories/extract-user-stories-page.css');
    removeCss('shared/project-workspace.css');
    removeCss('components/project-sidebar/project-sidebar.css');
    this._picker?.unmount();
  }

  // ----------------------------------------------------------------
  // Template — 30% list | resize | 70% detail (mirrors Issues page)
  // ----------------------------------------------------------------
  _template() {
    const name    = this._project ? escHtml(this._project.name) : 'Project';
    const initial = this._project?.name?.trim()[0]?.toUpperCase() ?? '?';
    this._sidebar = new ProjectSidebar({ projectId: this._projectId, router: this.router, activeRoute: 'project-layers' });
    return `
      <div class="ph-project-shell">

        <header class="project-home__header">
          <button class="project-home__back" id="plBtnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div class="project-home__badge">
            <div class="project-home__badge-initial">${initial}</div>
            <span class="project-home__badge-name">${name}</span>
          </div>
          <span class="ph-header-page-chip">Project Layers</span>
          <div class="ph-header-actions">
            <button class="pl-header-export-btn" id="plExportBtn" type="button" title="Export the Edit Layer data as Markdown">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M2 10v3a1 1 0 001 1h10a1 1 0 001-1v-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Export
            </button>
            <div id="plModelPicker"></div>
          </div>
        </header>

        <div class="ph-page-with-nav">
          ${this._sidebar.html()}
          <div class="project-page">

            <div class="project-page__workspace">

              <!-- Left 30%: Layers list -->
              <aside class="project-panel" id="plPanelList">
                <div class="project-related__section-hd">
                  <span class="project-related__section-label">Project Layers</span>
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
                  <span class="project-panel__title">Project Layer Detail</span>
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

    this.container.querySelector('#plBtnGenerate')
      .addEventListener('click', () => this._openGenerateModal());

    this.container.querySelector('#plBtnAdd')
      .addEventListener('click', () => this._showAddDetail());

    this.container.querySelector('#plExportBtn')
      .addEventListener('click', () => this._exportLayerMarkdown());

    document.addEventListener('keydown', this._onKeyDown = (e) => {
      if (e.target.matches('input, textarea, select, [contenteditable]')) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        this._showAddDetail();
      }
    });
  }

  // ----------------------------------------------------------------
  // Header — export the currently open Edit/New Layer form as Markdown
  // ----------------------------------------------------------------
  async _exportLayerMarkdown() {
    const nameEl     = this.container.querySelector('#plFormName');
    const descEl     = this.container.querySelector('#plFormDesc');
    const setupEl    = this.container.querySelector('#plFormSetup');
    const scaffoldEl = this.container.querySelector('#plFormScaffold');
    const folderEl   = this.container.querySelector('#plFolderValue');

    if (!nameEl) {
      await Dialog.alert('Open a layer (New Layer or an existing one) before exporting.');
      return;
    }

    const name        = nameEl.value.trim();
    const description = descEl?.value.trim()     || '';
    const setup       = setupEl?.value.trim()     || '';
    const scaffold    = scaffoldEl?.value.trim()  || '';
    const folderPath  = folderEl?.value.trim()    || '';

    if (!name) {
      await Dialog.alert('Enter a Layer Name before exporting.');
      return;
    }

    const md = `# ${name} — Layer Details\n\n`
      + `## Description\n\n${description || '_None_'}\n\n`
      + `## Project Setup Instructions\n\n\`\`\`\n${setup}\n\`\`\`\n\n`
      + `## Scaffold Structure\n\n\`\`\`\n${scaffold}\n\`\`\`\n\n`
      + `## Project Folder Path\n\n${folderPath || '_Not set_'}\n`;

    const folder = await window.db.dialog.openFolder();
    if (!folder) return;

    const safeName = name.replace(/[^a-z0-9_\-]/gi, '_');
    const fileName = `${safeName}_Layer.md`;
    const filePath = `${folder}\\${fileName}`;

    const existing = await window.shell.readFile(filePath);
    if (existing) {
      const overwrite = await Dialog.confirm(`${fileName} already exists. Overwrite it?`, { title: 'File Already Exists', confirmText: 'Overwrite', danger: true });
      if (!overwrite) return;
    }

    await window.shell.writeFile(filePath, md);
    await Dialog.alert(`File saved as ${fileName}`, { title: 'Export Successful' });
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
    if (el && this._detailKeyHandler) {
      el.removeEventListener('keydown', this._detailKeyHandler);
      this._detailKeyHandler = null;
    }
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
            <div class="pl-setup-label-row">
              <label class="is-form__label" for="plFormSetup">Project Setup Instructions</label>
              <button class="pl-run-setup-btn" id="plRunSetupBtn" type="button" title="Run these instructions in a terminal">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Run
              </button>
            </div>
            <textarea class="is-form__textarea" id="plFormSetup" rows="12"
              placeholder="Steps to set up this layer locally — install dependencies, environment variables, run commands…">${escHtml(layer?.setup_instructions || '')}</textarea>
          </div>

          <div class="is-form__field">
            <div class="pl-setup-label-row">
              <label class="is-form__label" for="plFormScaffold">Scaffold Structure</label>
              <button class="pl-run-setup-btn" id="plRunScaffoldBtn" type="button" title="Create these folders in a terminal">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Run
              </button>
            </div>
            <textarea class="is-form__textarea" id="plFormScaffold" rows="6"
              placeholder="One folder path per line — e.g. src/domain, src/application, src/infrastructure…">${escHtml(scaffoldStructureToLines(layer?.scaffold_structure))}</textarea>
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
    const scaffoldEl  = el.querySelector('#plFormScaffold');
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

    // Run setup instructions in an embedded terminal
    const runSetupBtn = el.querySelector('#plRunSetupBtn');
    runSetupBtn?.addEventListener('click', () => {
      if (this._aiModelConfig?.type !== 'cli') {
        window.showToast?.('Select a CLI model before running setup instructions.', 'warning');
        return;
      }
      if (!setupEl?.value?.trim()) {
        window.showToast?.('Setup instructions are empty — nothing to run.', 'warning');
        return;
      }
      this._openRunSetupPrepModal({
        layerId:     layer?.id ?? 'new',
        rootFolder:  folderInput?.value?.trim() || '',
        instructions: setupEl.value,
      });
    });

    // Run scaffold structure (create the folders) in an embedded terminal
    const runScaffoldBtn = el.querySelector('#plRunScaffoldBtn');
    runScaffoldBtn?.addEventListener('click', () => {
      if (this._aiModelConfig?.type !== 'cli') {
        window.showToast?.('Select a CLI model before running the scaffold structure.', 'warning');
        return;
      }
      const folders = (scaffoldEl?.value || '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      if (!folders.length) {
        window.showToast?.('Scaffold Structure is empty — nothing to run.', 'warning');
        return;
      }
      const instructions = [
        'Create the following project folder structure, relative to the current directory.',
        'Create each folder (and any missing parent folders) as an empty directory — do not create any files inside them.',
        '',
        ...folders,
      ].join('\n');
      this._openRunSetupPrepModal({
        layerId:      layer?.id ?? 'new',
        rootFolder:   folderInput?.value?.trim() || '',
        instructions,
      });
    });

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
        scaffold_structure: linesToScaffoldStructure(scaffoldEl.value),
        folder_path:        folderInput.value.trim() || null,
      };

      try {
        if (layer) {
          // Update in place — do NOT tear down/rebuild the form (that would
          // reset scroll position, cursor, and any edits made mid-save).
          const updated = await window.db.projectLayers.update({ id: layer.id, ...payload });
          layer = updated;
          const idx = this._layers.findIndex(l => l.id === layer.id);
          if (idx !== -1) this._layers[idx] = updated;
          this._renderList();
          if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
          this._pendingSave = () => save(true);
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

    // `el` (#plLayerDetail) is a persistent node whose innerHTML gets replaced
    // on re-render — it is NOT recreated. Without removing the previous
    // handler first, every re-bind stacks another keydown listener on it,
    // so a single Ctrl+S eventually fires many stale handlers at once.
    if (this._detailKeyHandler) el.removeEventListener('keydown', this._detailKeyHandler);
    this._detailKeyHandler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
    };
    el.addEventListener('keydown', this._detailKeyHandler);
  }

  // ----------------------------------------------------------------
  // Generate Layers — build prompt from selected documents
  // ----------------------------------------------------------------
  _buildGenerateLayersPrompt(docs) {
    const docsText = docs
      .map(d => `### ${d.title}\n\n${(d.content || '').trim() || '(no content)'}`)
      .join('\n\n---\n\n');

    return [
      'You are a software architect. Based on the following project documentation, produce the architectural layer entries for this system.',
      '',
      '🔒 STRICT RULE — you MUST follow this exactly:',
      '1. The project documentation contains a System Structure YAML block with a "layers:" section. Each item under "layers:" has a "name:" field.',
      'Step 1 — Read the YAML and count how many "- name:" entries exist under the "layers:" key.',
      'Step 2 — Use ONLY those names, in the order they appear, as the "name" field in your JSON output.',
      'Step 3 — Do NOT invent additional layers, merge layers, rename layers, or omit any layer. The number of JSON objects you return must equal the number of "- name:" entries in the YAML.',
      '',
      '2. Do not add any steps containing code or creation of files in the Scaffolds. It is pure project folder structure.',
      '',
      '---',
      '',
      'Use each name EXACTLY as written in the YAML (same casing, same underscores/spaces).',
      'Example: if the YAML has 3 entries named "layer_a", "layer_b", "layer_c" — your JSON must have exactly 3 objects with those exact names.',
      '',
      'For each layer also provide "scaffold_structure": a JSON array of the FULL nested project folder based on clean architecture paths for that layer (relative paths only, no file names). Do not stop at the top-level clean-architecture split — go at least one level deeper into each of those folders, and name the sub-folders after the ACTUAL entities, features, screens, and external services described in the project documentation below (not generic placeholders like "module1" or "feature_a"). For example, a "domain" folder should be broken down by real entities (e.g. models, repositories for the entities actually mentioned in the docs), an "application" folder by real services/use-cases, an "infrastructure" folder by the actual external services/integrations mentioned (e.g. a specific database, auth provider, or API), and a "presentation" folder by the actual screens/pages/views described. Derive the exact names and depth from the tech stack and documentation — the breakdown for a mobile app, a web frontend, and a backend API will each look different. Use folder names that a junior developer can immediately understand without prior architecture knowledge. Just Scaffolds no code blocks or file changes.',
      '',
      'For each layer provide "setup_instructions": a numbered, step-by-step guide that:',
      '  1. Creates the project with the appropriate scaffold command for the technology stack (e.g. "dotnet new webapi -n MyApi", "ng new my-app", "npx create-react-app my-app", "npm init -y").',
      '  2. Installs all required dependencies with the package manager install command (include the exact version for every package, e.g. npm install express@4.18.2). Also provide the full dependency block as a ready-to-paste snippet in the format native to the tech stack — every entry must include its pinned version number: for Node.js write the "dependencies" and "devDependencies" JSON blocks (e.g. "express": "4.18.2") to copy into package.json; for Flutter/Dart write the "dependencies" and "dev_dependencies" YAML block (e.g. http: ^1.2.0) to copy into pubspec.yaml; for .NET write the <PackageReference> XML lines with Version attribute to copy into the .csproj file; for Python write the requirements.txt lines (e.g. flask==3.0.2) or the [tool.poetry.dependencies] TOML block. For each snippet clearly state the exact file name and the section/line where it must be pasted.',
      '  3. Sets up environment variables — provide the path where to create the env file. And values need to included in it. And guide where to include the env variables in the file.',
      '  4. Runs the layer locally with the start/serve command.',
      '  5. Sets up any external dependent services or libraries the layer relies on (e.g. Firebase, Supabase, Auth0, Stripe)',
      'Keep the language plain and explicit — assume the reader has never set up this type of project before.',
      '',
      'Return ONLY a valid JSON array — no markdown, no explanation, nothing else.',
      'Format: [{"name":"layer_a","description":"Description of layer_a","scaffold_structure":["src/domain/models","src/domain/repositories","src/application/services","src/presentation/screens/login"],"setup_instructions":"1. Step one\\n2. Step two\\n3. Step three"},{"name":"layer_b","description":"Description of layer_b","scaffold_structure":["src/domain/models","src/application/services"],"setup_instructions":"1. Step one\\n2. Step two"}]',
      '',
      '--- PROJECT DOCUMENTS ---',
      docsText,
    ].join('\n');
  }

  // ----------------------------------------------------------------
  // Hard-blocks navigation/app-close while Generate Layers is running.
  // No confirm dialog — the modal's Cancel button is the intended way out.
  // ----------------------------------------------------------------
  _canLeaveNow() {
    if (!this._generating) return true;
    window.showToast?.('Cannot close the app while Generate is running — please wait…', 'warning');
    return false;
  }

  // ----------------------------------------------------------------
  // Run Setup — prep modal: pick/confirm the root folder and review/edit
  // the instructions before they're typed into the terminal.
  // ----------------------------------------------------------------
  _openRunSetupPrepModal({ layerId, rootFolder, instructions }) {
    const overlay = document.createElement('div');
    overlay.className = 'pl-modal-overlay';

    const hasPath = !!rootFolder;
    overlay.innerHTML = `
      <div class="pl-modal">
        <div class="pl-modal__header">
          <span class="pl-modal__title">Setup Project</span>
          <button class="pl-modal__close" id="plPrepModalClose">✕</button>
        </div>
        <div class="pl-modal__body">
          <div class="pl-modal-section">
            <div class="pl-modal-section-label">Root Folder</div>
            <div class="pl-folder-row">
              <div class="pl-folder-pill${hasPath ? ' pl-folder-pill--set' : ''}" id="plPrepFolderPill">
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                  <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                    stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                </svg>
                <span id="plPrepFolderText" class="${hasPath ? '' : 'pl-folder-text--empty'}"
                >${hasPath ? escHtml(rootFolder) : 'No folder selected'}</span>
              </div>
              <button class="pl-browse-btn" id="plPrepBrowseBtn" type="button">
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                  <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                    stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                </svg>
                Browse…
              </button>
            </div>
          </div>
          <div class="pl-modal-section">
            <div class="pl-modal-section-label">Setup Instructions</div>
            <textarea class="pl-modal-prompt-textarea" id="plPrepInstructions" rows="14">${escHtml(instructions || '')}</textarea>
          </div>
          <button class="pl-modal-generate-btn" id="plPrepSetupBtn" type="button">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Setup Project
          </button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    let folderValue = rootFolder || '';
    const folderPill = overlay.querySelector('#plPrepFolderPill');
    const folderText = overlay.querySelector('#plPrepFolderText');
    const instrEl    = overlay.querySelector('#plPrepInstructions');

    const pickFolder = async () => {
      const picked = await window.db.dialog.openFolder();
      if (!picked) return;
      folderValue = picked;
      folderText.textContent = picked;
      folderText.classList.remove('pl-folder-text--empty');
      folderPill.classList.add('pl-folder-pill--set');
    };
    overlay.querySelector('#plPrepBrowseBtn').addEventListener('click', pickFolder);
    folderPill.addEventListener('click', pickFolder);

    const close = () => overlay.remove();
    overlay.querySelector('#plPrepModalClose').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('#plPrepSetupBtn').addEventListener('click', () => {
      if (!folderValue) {
        window.showToast?.('Select a root folder before setting up the project.', 'warning');
        return;
      }
      const prompt = instrEl.value.trim();
      if (!prompt) {
        window.showToast?.('Setup instructions are empty — nothing to run.', 'warning');
        return;
      }
      close();
      this._openRunSetupModal({ layerId, cwd: folderValue, prompt });
    });
  }

  // ----------------------------------------------------------------
  // Run Setup Instructions — modal with an embedded interactive terminal.
  // Spawns a shell in `cwd`, then types the setup instructions in via a
  // temp file + the selected CLI model's --model/prompt flags (same
  // mechanism as Workflow Runner's runInShell), left running interactively.
  // ----------------------------------------------------------------
  _openRunSetupModal({ layerId, cwd, prompt }) {
    const overlay = document.createElement('div');
    overlay.className = 'pl-modal-overlay';
    overlay.innerHTML = `
      <div class="pl-modal pl-term-modal">
        <div class="pl-modal__header">
          <span class="pl-modal__title">Run Setup — ${escHtml(cwd)}</span>
          <button class="pl-modal__close" id="plTermModalClose" disabled title="Exit the CLI session to close">✕</button>
        </div>
        <div class="pl-term-modal__body" id="plTermModalBody"></div>
      </div>`;
    document.body.appendChild(overlay);

    let term, fitAddon, resizeObs, onWinResize, lastCols = 0, lastRows = 0;
    const runLayerId = `pl-setup-${layerId}`;
    let sessionDone = false;

    const fit = () => {
      if (!fitAddon || !term) return;
      try {
        fitAddon.fit();
        const cols = term.cols, rows = term.rows;
        if (cols === lastCols && rows === lastRows) return;
        lastCols = cols; lastRows = rows;
        window.app.plPty.resize({ cols, rows });
      } catch (_) {}
    };

    const closeBtn = overlay.querySelector('#plTermModalClose');

    const cleanup = () => {
      window.app.plPty.offAll();
      window.app.plPty.kill();
      if (resizeObs)   resizeObs.disconnect();
      if (onWinResize) window.removeEventListener('resize', onWinResize);
      if (term)        term.dispose();
      overlay.remove();
    };

    closeBtn.addEventListener('click', () => { if (sessionDone) cleanup(); });

    // Only the exit of the CLI session (its runInShell layerDone sentinel)
    // unlocks Close — clicking the backdrop or the X beforehand does nothing,
    // so an in-progress interactive session is never killed accidentally.
    window.app.plPty.onLayerDone(({ layerId: doneId }) => {
      if (doneId !== runLayerId) return;
      sessionDone = true;
      closeBtn.disabled = false;
      closeBtn.title = 'Close';
    });

    const mountEl = overlay.querySelector('#plTermModalBody');
    if (!window.Terminal) {
      mountEl.textContent = 'xterm.js failed to load — check DevTools console';
      return;
    }

    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    fitAddon = new window.FitAddon.FitAddon();
    term = new window.Terminal({
      fontFamily:  'Consolas, "Cascadia Code", "Courier New", monospace',
      fontSize:    12,
      lineHeight:  1.4,
      theme: {
        background:          css('--console-bg')     || '#0d0d0d',
        foreground:          css('--console-output') || '#d4d4d4',
        cursor:              css('--console-caret')  || '#c0c0c0',
        selectionBackground: 'rgba(255,255,255,0.18)',
      },
      scrollback:  5000,
      convertEol:  false,
      cursorBlink: true,
      allowProposedApi: true,
    });
    term.loadAddon(fitAddon);
    term.open(mountEl);
    term.onData((data) => window.app.plPty.write(data));

    resizeObs = new ResizeObserver(fit);
    resizeObs.observe(mountEl);
    onWinResize = fit;
    window.addEventListener('resize', onWinResize);

    window.app.plPty.onData((data) => { if (term) term.write(data); });

    requestAnimationFrame(() => requestAnimationFrame(async () => {
      fit();
      await window.app.plPty.spawnShell({ cwd, cols: term.cols, rows: term.rows });

      // Print the resolved cwd directly into the transcript so it's
      // unambiguous which folder the CLI is about to run in — spawnShell's
      // `cwd` should match the layer's own folder_path, not the DevFlow
      // app's own repo, unless that was deliberately chosen as the target.
      // Single-quoted so a literal '$' in the path isn't expanded by PowerShell.
      const safeCwdEcho = cwd.replace(/'/g, "''");
      window.app.plPty.write(`Write-Host ('==> Layer working directory: ' + '${safeCwdEcho}') -ForegroundColor Cyan\r`);

      // Run Setup needs real filesystem/shell access (mkdir, write, install
      // commands) to actually execute the instructions — strip any
      // --disallowedTools restriction the page's default model config carries
      // (e.g. the lean Haiku config used by Documents/AI Chat) just for this run.
      const runModel = this._aiModelConfig?.flags
        ? {
            ...this._aiModelConfig,
            flags: this._aiModelConfig.flags
              .replace(/--disallowedTools\s+(?:"[^"]*"|'[^']*'|\S+)/g, '')
              .replace(/\s{2,}/g, ' ')
              .trim(),
          }
        : this._aiModelConfig;

      window.app.plPty.runInShell({
        layerId: `pl-setup-${layerId}`,
        systemPrompt:
          'You are setting up this project. Execute the numbered setup instructions below yourself, ' +
          'step by step, in the current working directory — run the actual shell commands ' +
          '(scaffold, mkdir, dependency installs, writing config/env files, etc.) rather than just ' +
          'describing or summarizing them. Do not stop to ask what to do; start executing now. ' +
          'Only pause for input if a step truly requires a decision only the user can make (e.g. a ' +
          'missing secret value).',
        prompt,
        model: runModel,
        cwd,
        // Without this, Claude pauses for a y/n approval before every
        // Bash/Write/Edit tool call — easy to miss in this compact terminal,
        // so the session just sits there waiting forever, never reaching the
        // trailing Write-Host sentinel that unlocks Close.
        skipPermissions: true,
      });
    }));
  }

  // ----------------------------------------------------------------
  // Generate Layers — modal with document list + editable prompt
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
          <div class="pl-modal-section">
            <div class="pl-modal-section-label">Documents</div>
            <p class="pl-modal__hint">Select one or more documents. AI will analyse them and suggest the architectural layers (sub-projects) needed.</p>
            <div class="pl-modal-docs-list">${docsHtml}</div>
          </div>
          <div class="pl-modal-section">
            <div class="pl-modal-section-label">
              Prompt
              <span class="pl-modal-section-hint">Editable — select documents to populate</span>
            </div>
            <textarea class="pl-modal-prompt-textarea" id="plModalPrompt"
              placeholder="Select documents above to build the prompt…"
              spellcheck="false"></textarea>
          </div>
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
    this._generating = false;

    const selectedIds = new Set();

    const updatePrompt = () => {
      const selectedDocs = this._documents.filter(d => selectedIds.has(d.id));
      const ta = overlay.querySelector('#plModalPrompt');
      if (ta) ta.value = selectedDocs.length > 0 ? this._buildGenerateLayersPrompt(selectedDocs) : '';
    };

    // Document toggles
    overlay.querySelectorAll('.pl-modal-doc-item').forEach(item => {
      item.addEventListener('click', () => {
        if (this._generating) return;
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
        updatePrompt();
      });
    });

    const close = () => {
      window.app.chat.offAll();
      this._generating = false;
      overlay.remove();
    };

    overlay.querySelector('#plModalClose').addEventListener('click', () => {
      if (!this._generating) close();
    });
    overlay.querySelector('#plModalCancel').addEventListener('click', () => {
      if (this._generating) { window.app.chat.cancel(); window.app.chat.offAll(); }
      close();
    });
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape' && !this._generating) close(); });

    overlay.querySelector('#plModalGenerateBtn').addEventListener('click', async () => {
      if (this._generating) return;
      if (selectedIds.size === 0) {
        this._setModalStatus(overlay, 'warning', 'Select at least one document first.');
        return;
      }
      if (!this._aiModelConfig) {
        this._setModalStatus(overlay, 'warning', 'Pick an AI model in the header first.');
        return;
      }

      const prompt = overlay.querySelector('#plModalPrompt')?.value?.trim();
      if (!prompt) {
        this._setModalStatus(overlay, 'warning', 'Prompt is empty — select a document first.');
        return;
      }

      this._generating = true;
      const generateBtn = overlay.querySelector('#plModalGenerateBtn');
      const cancelBtn   = overlay.querySelector('#plModalCancel');

      const resetBtn = (label = 'Generate') => {
        this._generating = false;
        generateBtn.disabled = false;
        generateBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> ${label}`;
      };

      generateBtn.disabled  = true;
      generateBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10"/></svg> Generating…`;
      cancelBtn.textContent = 'Cancel';
      this._setModalStatus(overlay, 'running', 'Analysing documents…');

      const existingNames = new Set(this._layers.map(l => l.name.toLowerCase().trim()));

      let accumulated = '';
      window.app.chat.offAll();

      window.app.chat.onToken(({ text }) => {
        accumulated += text;
        const statusEl = overlay.querySelector('#plModalStatusText');
        if (statusEl) statusEl.textContent = `Generating… (${accumulated.length} chars)`;
      });

      window.app.chat.onDone(async ({ raw, usage }) => {
        window.app.chat.offAll();

        if (usage) {
          const parts = [`in: ${(usage.input_tokens || 0).toLocaleString()}`, `out: ${(usage.output_tokens || 0).toLocaleString()}`];
          if (usage.cache_read_input_tokens > 0) parts.push(`${usage.cache_read_input_tokens.toLocaleString()} cached`);
          const statusEl = overlay.querySelector('#plModalStatusText');
          if (statusEl) statusEl.textContent = parts.join(' · ');
        }

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
          const scaffoldStructure = Array.isArray(item.scaffold_structure)
            ? JSON.stringify(item.scaffold_structure)
            : (item.scaffold_structure || '').trim() || null;
          const layer = await window.db.projectLayers.create({
            project_id:         this._projectId,
            name:               item.name.trim(),
            description:        (item.description || '').trim() || null,
            setup_instructions: (item.setup_instructions || '').trim() || null,
            scaffold_structure: scaffoldStructure,
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

      window.app.chat.generate({ prompt, model: this._aiModelConfig, rawMode: true });
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
