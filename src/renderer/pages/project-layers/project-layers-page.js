import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelPicker }      from '../../components/model-picker/model-picker.js';

export class ProjectLayersPage {
  constructor(container, params, router) {
    this.container       = container;
    this.router          = router;
    this._projectId      = params.projectId;
    this._project        = null;
    this._documents      = [];
    this._layers         = [];
    this._aiModelConfig  = null;
    this._generating     = false;
    this._saveTimers     = {}; // layerId → debounce handle for desc auto-save
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  async mount() {
    injectCss('pages/user-stories/user-stories.css');
    injectCss('pages/extract-user-stories/extract-user-stories-page.css');
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

    if (this._project?.project_path) {
      this._setHeaderFolderPath(this._project.project_path);
    }

    await Promise.all([
      this._loadDocuments(),
      this._loadLayers(),
    ]);
  }

  unmount() {
    // Flush any pending desc saves
    for (const handle of Object.values(this._saveTimers)) clearTimeout(handle);
    this._saveTimers = {};
    window.app.chat.offAll();
    removeCss('pages/project-layers/project-layers-page.css');
    removeCss('pages/extract-user-stories/extract-user-stories-page.css');
    removeCss('pages/user-stories/user-stories.css');
    this._picker?.unmount();
  }

  // ----------------------------------------------------------------
  // Template — single full-width layers panel, no sidebar
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
          <div class="project-page__folder-display" id="plHeaderFolderDisplay" title="Select project folder">
            <div class="project-page__folder-pill">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                  stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              </svg>
              <span class="project-page__folder-text" id="plHeaderFolderText">Select folder</span>
            </div>
          </div>
          <div class="project-page__header-actions" style="-webkit-app-region:no-drag;">
            <div class="project-page__model-group">
              <div id="plModelPicker"></div>
              <button class="project-page__model-cfg-btn" id="plBtnModelConfigs" title="Configure AI models">
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
                    stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          </div>
        </header>

        <!-- Full-width layers panel -->
        <div class="pl-page-body">
          <div class="pl-panel-header">
            <span class="pl-panel-title">Project Layers</span>
            <span class="pl-panel-count" id="plLayerCount">0</span>
            <div class="pl-panel-actions">
              <button class="pl-add-btn" id="plBtnAdd" title="Add layer manually" aria-label="Add layer">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
                Add Layer
              </button>
              <button class="pl-generate-btn" id="plBtnGenerate">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Generate Layers
              </button>
            </div>
          </div>

          <div class="pl-layers-list" id="plLayersList">
            <div class="pl-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                <polyline points="2 17 12 22 22 17"/>
                <polyline points="2 12 12 17 22 12"/>
              </svg>
              <p>No layers yet.</p>
              <p class="pl-empty-sub">Click <strong>Generate Layers</strong> to use AI, or <strong>Add Layer</strong> to create one manually.</p>
            </div>
          </div>
        </div>

      </div>
    `;
  }

  // ----------------------------------------------------------------
  // Header
  // ----------------------------------------------------------------
  _setHeaderFolderPath(folderPath) {
    const text    = this.container.querySelector('#plHeaderFolderText');
    const display = this.container.querySelector('#plHeaderFolderDisplay');
    if (!text || !display) return;
    text.textContent = folderPath;
    display.classList.add('project-page__folder-display--active');
  }

  _bindHeaderEvents() {
    this.container.querySelector('#plBtnBack')
      .addEventListener('click', () => this.router.navigate('project-home', { projectId: this._projectId }));

    this.container.querySelector('#plBtnModelConfigs')
      .addEventListener('click', () =>
        this.router.navigate('settings', { from: 'project-layers', fromParams: { projectId: this._projectId } }));

    this.container.querySelector('#plHeaderFolderDisplay')
      .addEventListener('click', async () => {
        const folderPath = await window.db.dialog.openFolder();
        if (!folderPath) return;
        await window.db.projects.setPath({ id: this._projectId, project_path: folderPath });
        if (this._project) this._project.project_path = folderPath;
        this._setHeaderFolderPath(folderPath);
      });

    this.container.querySelector('#plBtnGenerate')
      .addEventListener('click', () => this._openGenerateModal());

    this.container.querySelector('#plBtnAdd')
      .addEventListener('click', () => this._showAddForm());
  }

  // ----------------------------------------------------------------
  // Data loading
  // ----------------------------------------------------------------
  async _loadDocuments() {
    this._documents = await window.db.documents.list(this._projectId) ?? [];
  }

  async _loadLayers() {
    this._layers = await window.db.projectLayers.list(this._projectId) ?? [];
    this._renderLayers();
  }

  // ----------------------------------------------------------------
  // Layers list rendering
  // ----------------------------------------------------------------
  _renderLayers() {
    const listEl  = this.container.querySelector('#plLayersList');
    const countEl = this.container.querySelector('#plLayerCount');
    if (!listEl) return;
    if (countEl) countEl.textContent = this._layers.length;

    if (this._layers.length === 0) {
      listEl.innerHTML = `
        <div class="pl-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
          <p>No layers yet.</p>
          <p class="pl-empty-sub">Click <strong>Generate Layers</strong> to use AI, or <strong>Add Layer</strong> to create one manually.</p>
        </div>`;
      return;
    }

    listEl.innerHTML = `<div class="pl-cards-grid">${this._layers.map(l => this._layerCardHtml(l)).join('')}</div>`;
    this._bindLayerCardEvents(listEl);
  }

  _layerCardHtml(layer) {
    const folderPath = layer.folder_path || '';
    const hasPath    = !!folderPath;
    return `
      <div class="pl-layer-card" data-layer-id="${layer.id}">
        <div class="pl-layer-card__header">
          <input class="pl-layer-name" type="text" value="${escHtml(layer.name)}"
            placeholder="Layer name" data-layer-id="${layer.id}" aria-label="Layer name"/>
          <button class="pl-layer-delete" data-layer-id="${layer.id}" title="Delete layer">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8M5.5 6v4M8.5 6v4"
                stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <textarea class="pl-layer-desc" placeholder="Description (optional)"
          data-layer-id="${layer.id}" rows="2">${escHtml(layer.description || '')}</textarea>

        <div class="pl-layer-folder">
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
            <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
              stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
          </svg>
          <span class="pl-layer-folder-path${hasPath ? '' : ' pl-layer-folder-path--empty'}"
            data-layer-id="${layer.id}"
            title="${hasPath ? escHtml(folderPath) : 'Click to select folder'}"
          >${hasPath ? escHtml(folderPath) : 'No folder — click Browse'}</span>
          <button class="pl-layer-browse-btn" data-layer-id="${layer.id}" title="Select folder">
            <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
              <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
            Browse
          </button>
        </div>
      </div>`;
  }

  _bindLayerCardEvents(listEl) {
    // Name — save on blur / Enter
    listEl.querySelectorAll('.pl-layer-name').forEach(input => {
      const id           = parseInt(input.dataset.layerId);
      const originalName = input.value;

      const save = async () => {
        const name = input.value.trim();
        if (!name) { input.value = originalName; return; }
        await window.db.projectLayers.update({ id, name });
        const idx = this._layers.findIndex(l => l.id === id);
        if (idx !== -1) this._layers[idx].name = name;
      };

      input.addEventListener('blur', save);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = originalName; input.blur(); }
      });
    });

    // Description — debounced auto-save
    listEl.querySelectorAll('.pl-layer-desc').forEach(textarea => {
      const id = parseInt(textarea.dataset.layerId);
      textarea.addEventListener('input', () => {
        clearTimeout(this._saveTimers[id]);
        this._saveTimers[id] = setTimeout(async () => {
          const description = textarea.value.trim() || null;
          await window.db.projectLayers.update({ id, description });
          const idx = this._layers.findIndex(l => l.id === id);
          if (idx !== -1) this._layers[idx].description = description;
        }, 800);
      });
    });

    // Folder path — click span to browse
    listEl.querySelectorAll('.pl-layer-folder-path').forEach(span => {
      span.addEventListener('click', () => this._browseLayerFolder(parseInt(span.dataset.layerId)));
    });

    // Browse button
    listEl.querySelectorAll('.pl-layer-browse-btn').forEach(btn => {
      btn.addEventListener('click', () => this._browseLayerFolder(parseInt(btn.dataset.layerId)));
    });

    // Delete
    listEl.querySelectorAll('.pl-layer-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.layerId);
        const ok = await this._showConfirm('Delete this layer?', 'Delete');
        if (!ok) return;
        await window.db.projectLayers.delete(id);
        this._layers = this._layers.filter(l => l.id !== id);
        this._renderLayers();
      });
    });
  }

  async _browseLayerFolder(layerId) {
    const folderPath = await window.db.dialog.openFolder();
    if (!folderPath) return;
    await window.db.projectLayers.update({ id: layerId, folder_path: folderPath });
    const idx = this._layers.findIndex(l => l.id === layerId);
    if (idx !== -1) this._layers[idx].folder_path = folderPath;
    // Update just the folder display without re-rendering the whole list
    const card = this.container.querySelector(`.pl-layer-card[data-layer-id="${layerId}"]`);
    if (card) {
      const span = card.querySelector('.pl-layer-folder-path');
      if (span) {
        span.textContent = folderPath;
        span.title = folderPath;
        span.classList.remove('pl-layer-folder-path--empty');
      }
    }
  }

  // ----------------------------------------------------------------
  // Manual Add Layer (inline form at top of list)
  // ----------------------------------------------------------------
  _showAddForm() {
    const listEl = this.container.querySelector('#plLayersList');
    if (!listEl) return;

    // Remove any existing inline form
    listEl.querySelector('.pl-new-layer-card')?.remove();

    // Make sure the grid exists if layers already present
    let grid = listEl.querySelector('.pl-cards-grid');
    if (!grid) {
      listEl.innerHTML = '<div class="pl-cards-grid"></div>';
      grid = listEl.querySelector('.pl-cards-grid');
    }

    const form = document.createElement('div');
    form.className = 'pl-new-layer-card';
    form.innerHTML = `
      <input type="text" class="pl-new-name-input" placeholder="Layer name (e.g. Frontend, Backend API…)"
        maxlength="120" autocomplete="off"/>
      <textarea class="pl-new-desc-input" placeholder="Description (optional)" rows="2"></textarea>
      <div class="pl-new-layer-actions">
        <button class="pl-new-cancel-btn" type="button">Cancel</button>
        <button class="pl-new-save-btn" type="button">Add Layer</button>
      </div>`;

    grid.insertBefore(form, grid.firstChild);

    const nameInput = form.querySelector('.pl-new-name-input');
    nameInput.focus();

    form.querySelector('.pl-new-cancel-btn').addEventListener('click', () => {
      form.remove();
      if (!listEl.querySelector('.pl-layer-card')) this._renderLayers();
    });

    const doSave = () => this._saveNewLayer(form, grid);
    form.querySelector('.pl-new-save-btn').addEventListener('click', doSave);
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSave(); }
      if (e.key === 'Escape') form.querySelector('.pl-new-cancel-btn').click();
    });
  }

  async _saveNewLayer(form, grid) {
    const nameEl = form.querySelector('.pl-new-name-input');
    const descEl = form.querySelector('.pl-new-desc-input');
    const name   = nameEl.value.trim();
    if (!name) { nameEl.focus(); nameEl.style.outline = '2px solid #ef4444'; return; }
    nameEl.style.outline = '';

    const saveBtn = form.querySelector('.pl-new-save-btn');
    saveBtn.disabled    = true;
    saveBtn.textContent = 'Adding…';

    const layer = await window.db.projectLayers.create({
      project_id:  this._projectId,
      name,
      description: descEl.value.trim() || null,
      sort_order:  this._layers.length,
    });

    this._layers.push(layer);
    form.remove();
    this._renderLayers();
  }

  // ----------------------------------------------------------------
  // Generate Layers — modal popup with document list
  // ----------------------------------------------------------------
  _openGenerateModal() {
    if (this._generating) return;

    const overlay = document.createElement('div');
    overlay.className = 'pl-modal-overlay';

    const noDocsHtml = this._documents.length === 0
      ? `<div class="pl-modal-empty-docs">
           <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
             <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
             <polyline points="14 2 14 8 20 8"/>
           </svg>
           <p>No documents found in this project.<br>Add documents first, then generate layers.</p>
         </div>`
      : '';

    const docsListHtml = this._documents.length > 0
      ? this._documents.map(doc => `
          <label class="pl-modal-doc-item" data-doc-id="${doc.id}">
            <span class="pl-modal-doc-check">
              <svg class="pl-check-icon pl-check-icon--off" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" stroke-width="1.5"/>
              </svg>
              <svg class="pl-check-icon pl-check-icon--on" viewBox="0 0 16 16" fill="none" style="display:none;">
                <rect x="1" y="1" width="14" height="14" rx="3" fill="var(--accent)" stroke="var(--accent)" stroke-width="1.5"/>
                <path d="M4.5 8l2.5 2.5 4.5-5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="pl-modal-doc-title" title="${escHtml(doc.title)}">${escHtml(doc.title)}</span>
          </label>`).join('')
      : '';

    overlay.innerHTML = `
      <div class="pl-modal">
        <div class="pl-modal__header">
          <span class="pl-modal__title">Generate Layers from Documents</span>
          <button class="pl-modal__close" id="plModalClose" aria-label="Close">✕</button>
        </div>

        <div class="pl-modal__body">
          <p class="pl-modal__hint">Select one or more documents. AI will analyse them and suggest the architectural layers needed for this project.</p>

          <div class="pl-modal-docs-list" id="plModalDocsList">
            ${noDocsHtml}${docsListHtml}
          </div>

          <div class="pl-modal__status" id="plModalStatus" style="display:none;"></div>
        </div>

        <div class="pl-modal__footer">
          <button class="pl-modal-cancel-btn" id="plModalCancel">Cancel</button>
          <button class="pl-modal-generate-btn" id="plModalGenerateBtn"
            ${this._documents.length === 0 ? 'disabled' : ''}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Generate
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    // Track selected doc IDs
    const selectedIds = new Set();

    overlay.querySelectorAll('.pl-modal-doc-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = parseInt(item.dataset.docId);
        const on  = selectedIds.has(id);
        if (on) {
          selectedIds.delete(id);
          item.classList.remove('pl-modal-doc-item--selected');
          item.querySelector('.pl-check-icon--off').style.display = '';
          item.querySelector('.pl-check-icon--on').style.display  = 'none';
        } else {
          selectedIds.add(id);
          item.classList.add('pl-modal-doc-item--selected');
          item.querySelector('.pl-check-icon--off').style.display = 'none';
          item.querySelector('.pl-check-icon--on').style.display  = '';
        }
      });
    });

    const close = () => {
      window.app.chat.offAll();
      overlay.remove();
      this._generating = false;
    };

    overlay.querySelector('#plModalClose').addEventListener('click', close);
    overlay.querySelector('#plModalCancel').addEventListener('click', () => {
      if (this._generating) {
        window.app.chat.cancel();
        window.app.chat.offAll();
        this._generating = false;
        close();
      } else {
        close();
      }
    });
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape' && !this._generating) close(); });

    overlay.querySelector('#plModalGenerateBtn').addEventListener('click', () =>
      this._runGeneration(overlay, selectedIds, close));
  }

  // ----------------------------------------------------------------
  // AI Generation (runs inside the modal)
  // ----------------------------------------------------------------
  async _runGeneration(overlay, selectedIds, closeModal) {
    if (this._generating) return;

    if (selectedIds.size === 0) {
      this._showModalStatus(overlay, 'warning', 'Please select at least one document.');
      return;
    }
    if (!this._aiModelConfig) {
      this._showModalStatus(overlay, 'warning', 'Please select an AI model in the header first.');
      return;
    }

    this._generating = true;

    const generateBtn = overlay.querySelector('#plModalGenerateBtn');
    const cancelBtn   = overlay.querySelector('#plModalCancel');

    const resetGenerateBtn = (label = 'Generate') => {
      generateBtn.disabled = false;
      generateBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> ${label}`;
    };

    generateBtn.disabled = true;
    generateBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10"/></svg> Generating…`;
    cancelBtn.textContent = 'Cancel';
    this._showModalStatus(overlay, 'running', 'Analysing documents…');

    // Fetch document content
    const docs = await Promise.all(
      [...selectedIds].map(id => window.db.documents.get(id))
    );
    const docsText = docs
      .filter(Boolean)
      .map(d => `### ${d.title}\n\n${(d.content || '').trim() || '(no content)'}`)
      .join('\n\n---\n\n');

    const existingNames = new Set(this._layers.map(l => l.name.toLowerCase().trim()));

    const prompt = [
      'You are a software architect. Based on the following project documentation, identify the distinct architectural layers or sub-projects needed to build this system.',
      'Each layer represents a separate codebase or deployment unit (e.g. "Frontend", "Backend API", "Database", "Mobile App", "Infrastructure").',
      '',
      'Return ONLY a valid JSON array — no markdown, no explanation, nothing else.',
      'Format exactly: [{"name":"Frontend","description":"React web app"},{"name":"Backend API","description":"Node.js REST API"}]',
      '',
      '--- PROJECT DOCUMENTS ---',
      docsText,
    ].join('\n');

    let accumulated = '';
    window.app.chat.offAll();

    window.app.chat.onToken(({ text }) => {
      accumulated += text;
      const charEl = overlay.querySelector('#plModalStatusText');
      if (charEl) charEl.textContent = `Generating… (${accumulated.length} chars)`;
    });

    window.app.chat.onDone(async ({ raw }) => {
      window.app.chat.offAll();
      this._generating = false;

      // Use `raw` — `error` is always set for non-HTML responses, ignore it
      const responseText = raw || accumulated;

      if (!responseText || !responseText.trim()) {
        this._showModalStatus(overlay, 'error', 'AI returned an empty response. Check your model configuration.');
        resetGenerateBtn('Generate');
        return;
      }

      const generated = this._parseLayersJson(responseText);
      if (!generated || generated.length === 0) {
        this._showModalStatus(overlay, 'error', 'Could not parse layers from AI response. Try again or use a more capable model.');
        resetGenerateBtn('Retry');
        return;
      }

      // Merge: skip layers whose name already exists
      let added = 0;
      for (const item of generated) {
        const nameLower = (item.name || '').toLowerCase().trim();
        if (!nameLower || existingNames.has(nameLower)) continue;
        const layer = await window.db.projectLayers.create({
          project_id:  this._projectId,
          name:        item.name.trim(),
          description: (item.description || '').trim() || null,
          sort_order:  this._layers.length + added,
        });
        this._layers.push(layer);
        existingNames.add(nameLower);
        added++;
      }

      this._renderLayers();

      if (added === 0) {
        // Nothing new — show info and let user close manually
        this._showModalStatus(overlay, 'info', `All ${generated.length} suggested layers already exist — nothing new to add.`);
        const genBtn = overlay.querySelector('#plModalGenerateBtn');
        if (genBtn) {
          genBtn.disabled = false;
          genBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> Retry`;
        }
        const cancelBtnEl = overlay.querySelector('#plModalCancel');
        if (cancelBtnEl) cancelBtnEl.textContent = 'Close';
      } else {
        // Success — show message briefly then auto-close
        this._showModalStatus(overlay, 'success', `✓ Added ${added} new layer${added > 1 ? 's' : ''}. Closing…`);
        const genBtn = overlay.querySelector('#plModalGenerateBtn');
        if (genBtn) {
          genBtn.disabled = true;
          genBtn.innerHTML = `✓ Done`;
        }
        setTimeout(() => closeModal(), 1200);
      }
    });

    window.app.chat.generate({ prompt, model: this._aiModelConfig });
  }

  _parseLayersJson(raw) {
    try {
      // Strip any ANSI codes and find the JSON array
      const clean = raw.replace(/\x1B\[[0-9;]*[mGKHFJA-Za-z]/g, '').trim();
      // Try to extract a JSON array from anywhere in the response
      const match = clean.match(/\[[\s\S]*?\]/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) return null;
      return parsed.filter(item => typeof item?.name === 'string' && item.name.trim());
    } catch {
      return null;
    }
  }

  _showModalStatus(overlay, type, message) {
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
      overlay.className = 'pl-confirm-overlay';
      overlay.innerHTML = `
        <div class="pl-confirm-dialog">
          <p class="pl-confirm-msg">${escHtml(message)}</p>
          <div class="pl-confirm-btns">
            <button class="pl-confirm-btn pl-confirm-btn--cancel">Cancel</button>
            <button class="pl-confirm-btn pl-confirm-btn--ok">${escHtml(confirmLabel)}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const cleanup = (r) => { overlay.remove(); resolve(r); };
      overlay.querySelector('.pl-confirm-btn--cancel').addEventListener('click', () => cleanup(false));
      overlay.querySelector('.pl-confirm-btn--ok').addEventListener('click',     () => cleanup(true));
      overlay.addEventListener('keydown', e => { if (e.key === 'Escape') cleanup(false); });
    });
  }
}
