import { escHtml, timeAgo, initial } from '../../shared/helpers.js';

export class LauncherPage {
  constructor(container, params, router) {
    this.container = container;
    this.router    = router;
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  mount() {
    this._injectCss();
    this.container.innerHTML = this._template();
    this._bindRefs();
    this._bindEvents();
    this._loadRecent();
  }

  unmount() {
    const link = document.getElementById('launcher-css');
    if (link) link.remove();
  }

  // ----------------------------------------------------------------
  // CSS injection
  // ----------------------------------------------------------------
  _injectCss() {
    if (!document.getElementById('launcher-css')) {
      const link = document.createElement('link');
      link.id   = 'launcher-css';
      link.rel  = 'stylesheet';
      link.href = 'pages/launcher/launcher.css';
      document.head.appendChild(link);
    }
  }

  // ----------------------------------------------------------------
  // Template
  // ----------------------------------------------------------------
  _template() {
    return `
      <div class="launcher">
        <header class="launcher__header">
          <div class="launcher__logo">
            <svg width="32" height="32" viewBox="0 0 36 36" fill="none">
              <rect width="36" height="36" rx="10" fill="#6366f1"/>
              <path d="M10 18h16M18 10v16" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
              <circle cx="18" cy="18" r="4" fill="#fff" fill-opacity="0.25"/>
            </svg>
            <span class="launcher__app-name">AI SDLC</span>
          </div>
        </header>

        <main class="launcher__main">
          <h1 class="launcher__title">Welcome back</h1>
          <p class="launcher__subtitle">Select a recent project or start a new one</p>

          <button class="btn-new-project" id="btnNewProject">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            New Project
          </button>

          <section class="recent-section">
            <h2 class="recent-section__heading">Recent Projects</h2>
            <div class="project-list" id="projectList">
              <div class="project-list__empty" id="emptyState">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <rect x="6" y="8" width="28" height="24" rx="4" stroke="#94a3b8" stroke-width="1.5"/>
                  <path d="M13 16h14M13 22h8" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <p>No recent projects yet</p>
              </div>
            </div>
          </section>
        </main>
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
    this._projectList  = document.getElementById('projectList');
    this._emptyState   = document.getElementById('emptyState');
    this._modalOverlay = document.getElementById('modalOverlay');
    this._inputName    = document.getElementById('inputName');
    this._inputDesc    = document.getElementById('inputDesc');
    this._formError    = document.getElementById('formError');
    this._btnCreate    = document.getElementById('btnCreate');
  }

  // ----------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------
  _bindEvents() {
    document.getElementById('btnNewProject')
      .addEventListener('click', () => this._openModal());
    document.getElementById('btnModalClose')
      .addEventListener('click', () => this._closeModal());
    document.getElementById('btnCancel')
      .addEventListener('click', () => this._closeModal());
    document.getElementById('btnCreate')
      .addEventListener('click', () => this._createProject());

    this._inputName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._createProject();
    });
    this._modalOverlay.addEventListener('click', (e) => {
      if (e.target === this._modalOverlay) this._closeModal();
    });
  }

  // ----------------------------------------------------------------
  // Data
  // ----------------------------------------------------------------
  async _loadRecent() {
    const projects = await window.db.projects.recent();

    this._projectList.querySelectorAll('.project-card').forEach(el => el.remove());

    if (projects.length === 0) {
      this._emptyState.hidden = false;
      return;
    }

    this._emptyState.hidden = true;
    projects.forEach(p => {
      const card = document.createElement('button');
      card.className = 'project-card';
      card.innerHTML = `
        <div class="project-card__icon">${escHtml(initial(p.name))}</div>
        <div class="project-card__info">
          <div class="project-card__name">${escHtml(p.name)}</div>
          ${p.description ? `<div class="project-card__desc">${escHtml(p.description)}</div>` : ''}
        </div>
        <div class="project-card__meta">${timeAgo(p.last_opened_at)}</div>
      `;
      card.addEventListener('click', () => this._openProject(p.id));
      this._projectList.appendChild(card);
    });
  }

  async _openProject(id) {
    await window.db.projects.open(id);
    // TODO: this.router.navigate('dashboard', { projectId: id });
    await this._loadRecent();
  }

  // ----------------------------------------------------------------
  // Modal
  // ----------------------------------------------------------------
  _openModal() {
    this._inputName.value    = '';
    this._inputDesc.value    = '';
    this._formError.hidden   = true;
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
      this._formError.hidden = false;
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
      this._formError.hidden = false;
    } finally {
      this._btnCreate.disabled    = false;
      this._btnCreate.textContent = 'Create Project';
    }
  }
}
