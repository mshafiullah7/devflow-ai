import { escHtml, timeAgo, initial, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme, getTheme, setTheme } from '../../shared/theme-manager.js';

export class LauncherPage {
  constructor(container, params, router) {
    this.container = container;
    this.router    = router;
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  async mount() {
    await injectCss('pages/launcher/launcher.css');
    this.container.innerHTML = this._template();
    this._bindRefs();
    this._bindEvents();
    this._loadRecent();
    applyStoredTheme();
    this._syncThemeBtns();
  }

  unmount() {
    removeCss('pages/launcher/launcher.css');
  }

  // ----------------------------------------------------------------
  // Template
  // ----------------------------------------------------------------
  _template() {
    return `
      <div class="launcher">

        <header class="launcher__header">
          <div class="launcher__theme-control">
            <button class="launcher__theme-btn" data-select-theme="light">Light</button>
            <button class="launcher__theme-btn" data-select-theme="dark">Dark</button>
            <button class="launcher__theme-btn" data-select-theme="midnight">Midnight</button>
          </div>
        </header>

        <main class="launcher__main">

          <div class="launcher__mark" style="width:48px;height:48px;overflow:hidden;flex-shrink:0;">
            <img src="../../assets/icon.png" alt="" style="width:48px;height:48px;object-fit:cover;display:block;" onerror="this.style.display='none'"/>
          </div>
          <h1 class="launcher__title">Welcome back</h1>
          <p class="launcher__subtitle">Select a project or start a new one</p>

          <div class="launcher__card">

            <div class="launcher__new-row" id="btnNewProject" role="button" tabindex="0">
              <div class="launcher__new-plus">
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                  <path d="M10 4v12M4 10h12" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
                </svg>
              </div>
              <span class="launcher__new-label">New Project</span>
              <span class="launcher__new-hint">⌘ N</span>
            </div>

            <div class="launcher__divider">Recent</div>

            <div class="launcher__proj-scroll" id="projectList">
              <div class="launcher__empty" id="emptyState">
                <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
                  <rect x="6" y="8" width="28" height="24" rx="4" stroke="#94a3b8" stroke-width="1.5"/>
                  <path d="M13 16h14M13 22h8" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <p>No recent projects yet</p>
              </div>
            </div>

          </div>
        </main>
      </div>

      <div class="modal-overlay" id="confirmOverlay" hidden>
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
          <div class="modal__header">
            <h2 class="modal__title" id="confirmTitle">Remove Project</h2>
            <button class="modal__close" id="btnConfirmClose" aria-label="Close">&times;</button>
          </div>
          <div class="modal__body">
            <p style="font-size:14px;color:var(--text-secondary);margin:0">Are you sure you want to remove <strong id="confirmProjectName"></strong> from the list? You can restore it later.</p>
          </div>
          <div class="modal__footer">
            <button class="btn-secondary" id="btnConfirmCancel">Cancel</button>
            <button class="btn-danger" id="btnConfirmRemove">Remove</button>
          </div>
        </div>
      </div>

      <div class="modal-overlay" id="modalOverlay" hidden>
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
          <div class="modal__header">
            <h2 class="modal__title" id="modalTitle">New Project</h2>
            <button class="modal__close" id="btnModalClose" aria-label="Close">&times;</button>
          </div>
          <div class="modal__body">
            <div class="form-group">
              <label class="form-label" for="inputName">Project Name <span class="required">*</span></label>
              <input class="form-input" id="inputName" type="text" placeholder="e.g. Customer Portal" autocomplete="off" />
            </div>
            <div class="form-group">
              <label class="form-label" for="inputDesc">Description</label>
              <textarea class="form-textarea" id="inputDesc" rows="3" placeholder="Brief description of this project…"></textarea>
            </div>
            <p class="form-error" id="formError" hidden></p>
          </div>
          <div class="modal__footer">
            <button class="btn-secondary" id="btnCancel">Cancel</button>
            <button class="btn-primary" id="btnCreate">Create Project</button>
          </div>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // DOM references
  // ----------------------------------------------------------------
  _bindRefs() {
    this._projectList      = document.getElementById('projectList');
    this._emptyState       = document.getElementById('emptyState');
    this._modalOverlay     = document.getElementById('modalOverlay');
    this._confirmOverlay   = document.getElementById('confirmOverlay');
    this._confirmName      = document.getElementById('confirmProjectName');
    this._btnConfirmRemove = document.getElementById('btnConfirmRemove');
    this._inputName        = document.getElementById('inputName');
    this._inputDesc        = document.getElementById('inputDesc');
    this._formError        = document.getElementById('formError');
    this._btnCreate        = document.getElementById('btnCreate');
  }

  // ----------------------------------------------------------------
  // Sync active state on theme pill buttons
  // ----------------------------------------------------------------
  _syncThemeBtns() {
    const current = getTheme();
    document.querySelectorAll('.launcher__theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.selectTheme === current);
    });
  }

  // ----------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------
  _bindEvents() {
    // Theme pill buttons
    document.querySelectorAll('.launcher__theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setTheme(btn.dataset.selectTheme);
        this._syncThemeBtns();
      });
    });

    // New project
    document.getElementById('btnNewProject').addEventListener('click', () => this._openModal());
    document.getElementById('btnNewProject').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') this._openModal();
    });

    // New project modal
    document.getElementById('btnModalClose').addEventListener('click', () => this._closeModal());
    document.getElementById('btnCancel').addEventListener('click', () => this._closeModal());
    document.getElementById('btnCreate').addEventListener('click', () => this._createProject());
    this._inputName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._createProject();
    });
    this._modalOverlay.addEventListener('click', (e) => {
      if (e.target === this._modalOverlay) this._closeModal();
    });

    // Confirm remove modal
    document.getElementById('btnConfirmClose').addEventListener('click', () => this._closeConfirm());
    document.getElementById('btnConfirmCancel').addEventListener('click', () => this._closeConfirm());
    this._confirmOverlay.addEventListener('click', (e) => {
      if (e.target === this._confirmOverlay) this._closeConfirm();
    });
  }

  // ----------------------------------------------------------------
  // Data
  // ----------------------------------------------------------------
  async _loadRecent() {
    const projects = await window.db.projects.recent();
    this._projectList.querySelectorAll('.launcher__proj-row').forEach(el => el.remove());

    if (projects.length === 0) {
      this._emptyState.hidden = false;
      return;
    }

    this._emptyState.hidden = true;
    projects.forEach(p => {
      const row = document.createElement('div');
      row.className = 'launcher__proj-row';
      row.innerHTML = `
        <div class="launcher__proj-dot">${escHtml(initial(p.name))}</div>
        <div class="launcher__proj-info">
          <div class="launcher__proj-name">${escHtml(p.name)}</div>
          ${p.description ? `<div class="launcher__proj-desc">${escHtml(p.description)}</div>` : ''}
        </div>
        <div class="launcher__proj-time">${timeAgo(p.created_at)}</div>
        <div class="launcher__proj-actions">
          <button class="launcher__action-btn" aria-label="Edit project" title="Edit project">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
              <path d="M14.5 2.5a2.121 2.121 0 013 3L6 17H3v-3L14.5 2.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="launcher__action-btn" aria-label="Remove project" title="Remove from list">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      `;

      const [editBtn, deleteBtn] = row.querySelectorAll('.launcher__action-btn');

      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._openEditModal(p, row);
      });
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._confirmDisable(p.id, p.name, row);
      });
      row.addEventListener('click', () => this._openProject(p.id));

      this._projectList.appendChild(row);
    });
  }

  async _openProject(id) {
    await window.db.projects.open(id);
    await window.db.window.expand();
    this.router.navigate('project-home', { projectId: id });
  }

  _openEditModal(project, rowEl) {
    document.querySelector('.proj-edit-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'proj-edit-overlay';
    overlay.innerHTML = `
      <div class="proj-edit-dialog">
        <h3 class="proj-edit-title">Edit Project</h3>
        <div class="proj-edit-field">
          <label class="proj-edit-label">Name</label>
          <input class="proj-edit-input" id="projEditName" type="text" value="${escHtml(project.name)}" placeholder="Project name" autocomplete="off"/>
        </div>
        <div class="proj-edit-field">
          <label class="proj-edit-label">Description</label>
          <textarea class="proj-edit-textarea" id="projEditDesc" placeholder="Optional description" rows="3">${escHtml(project.description || '')}</textarea>
        </div>
        <div class="proj-edit-footer">
          <button class="proj-edit-btn proj-edit-btn--cancel">Cancel</button>
          <button class="proj-edit-btn proj-edit-btn--save">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const nameInput = overlay.querySelector('#projEditName');
    const descInput = overlay.querySelector('#projEditDesc');
    nameInput.focus();
    nameInput.select();

    const close = () => overlay.remove();

    overlay.querySelector('.proj-edit-btn--cancel').addEventListener('click', close);

    overlay.querySelector('.proj-edit-btn--save').addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      await window.db.projects.update({ id: project.id, name, description: descInput.value.trim() || null });

      // Update row in place
      rowEl.querySelector('.launcher__proj-dot').textContent  = name.trim()[0]?.toUpperCase() || '?';
      rowEl.querySelector('.launcher__proj-name').textContent = name;
      const descEl  = rowEl.querySelector('.launcher__proj-desc');
      const newDesc = descInput.value.trim();
      if (newDesc) {
        if (descEl) descEl.textContent = newDesc;
        else {
          const info = rowEl.querySelector('.launcher__proj-info');
          const d = document.createElement('div');
          d.className   = 'launcher__proj-desc';
          d.textContent = newDesc;
          info.appendChild(d);
        }
      } else if (descEl) {
        descEl.remove();
      }
      close();
    });
  }

  _confirmDisable(id, name, rowEl) {
    this._confirmName.textContent = name;
    this._confirmOverlay.hidden   = false;

    const oldBtn   = this._btnConfirmRemove;
    const freshBtn = oldBtn.cloneNode(true);
    oldBtn.replaceWith(freshBtn);
    this._btnConfirmRemove = freshBtn;

    freshBtn.addEventListener('click', async () => {
      this._closeConfirm();
      await this._disableProject(id, rowEl);
    });
  }

  _closeConfirm() {
    this._confirmOverlay.hidden = true;
  }

  async _disableProject(id, rowEl) {
    rowEl.style.pointerEvents = 'none';
    rowEl.style.opacity       = '0.5';
    try {
      await window.db.projects.update({ id, is_active: 0 });
      await this._loadRecent();
    } catch {
      rowEl.style.pointerEvents = '';
      rowEl.style.opacity       = '';
    }
  }

  // ----------------------------------------------------------------
  // Modal
  // ----------------------------------------------------------------
  _openModal() {
    this._inputName.value     = '';
    this._inputDesc.value     = '';
    this._formError.hidden    = true;
    this._modalOverlay.hidden = false;
    this._inputName.focus();
  }

  _closeModal() {
    this._modalOverlay.hidden = true;
  }

  async _createProject() {
    const name = this._inputName.value.trim();
    if (!name) {
      this._formError.textContent = 'Project name is required.';
      this._formError.hidden      = false;
      this._inputName.focus();
      return;
    }

    this._btnCreate.disabled    = true;
    this._btnCreate.textContent = 'Creating…';

    try {
      const project = await window.db.projects.create({
        name,
        description: this._inputDesc.value.trim() || null,
      });
      await window.db.projects.open(project.id);
      this._closeModal();
      await this._loadRecent();
    } catch (err) {
      this._formError.textContent = err.message || 'Failed to create project.';
      this._formError.hidden      = false;
    } finally {
      this._btnCreate.disabled    = false;
      this._btnCreate.textContent = 'Create Project';
    }
  }
}
