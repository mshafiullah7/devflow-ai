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
    this._applyTheme(localStorage.getItem('theme') || 'dark');
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
            <img src="../assets/icon.png" width="32" height="32" alt="DevFlow AI" style="border-radius:8px;display:block;"/>
            <span class="launcher__app-name">DevFlow AI</span>
          </div>
          <button class="launcher__theme-toggle" id="btnThemeToggle" title="Toggle light / dark theme" aria-label="Toggle theme">
            <svg class="theme-icon theme-icon--moon" width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M17.5 11.5A7.5 7.5 0 019 3a7.5 7.5 0 100 14 7.5 7.5 0 008.5-5.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
            <svg class="theme-icon theme-icon--sun" width="16" height="16" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="4" stroke="currentColor" stroke-width="1.6"/>
              <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
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
    this._projectList    = document.getElementById('projectList');
    this._emptyState     = document.getElementById('emptyState');
    this._modalOverlay   = document.getElementById('modalOverlay');
    this._confirmOverlay = document.getElementById('confirmOverlay');
    this._confirmName    = document.getElementById('confirmProjectName');
    this._btnConfirmRemove = document.getElementById('btnConfirmRemove');
    this._inputName    = document.getElementById('inputName');
    this._inputDesc    = document.getElementById('inputDesc');
    this._formError    = document.getElementById('formError');
    this._btnCreate    = document.getElementById('btnCreate');
  }

  // ----------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------
  _bindEvents() {
    document.getElementById('btnThemeToggle')
      .addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        this._applyTheme(next);
      });

    document.getElementById('btnNewProject')
      .addEventListener('click', () => this._openModal());
    document.getElementById('btnModalClose')
      .addEventListener('click', () => this._closeModal());
    document.getElementById('btnCancel')
      .addEventListener('click', () => this._closeModal());
    document.getElementById('btnCreate')
      .addEventListener('click', () => this._createProject());

    document.getElementById('btnConfirmClose')
      .addEventListener('click', () => this._closeConfirm());
    document.getElementById('btnConfirmCancel')
      .addEventListener('click', () => this._closeConfirm());
    this._confirmOverlay.addEventListener('click', (e) => {
      if (e.target === this._confirmOverlay) this._closeConfirm();
    });

    this._inputName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._createProject();
    });
    this._modalOverlay.addEventListener('click', (e) => {
      if (e.target === this._modalOverlay) this._closeModal();
    });
  }

  // ----------------------------------------------------------------
  // Theme
  // ----------------------------------------------------------------
  _applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
    const btn = document.getElementById('btnThemeToggle');
    if (btn) btn.dataset.theme = theme;
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
      const card = document.createElement('div');
      card.className = 'project-card';
      card.innerHTML = `
        <div class="project-card__icon">${escHtml(initial(p.name))}</div>
        <div class="project-card__info">
          <div class="project-card__name">${escHtml(p.name)}</div>
          ${p.description ? `<div class="project-card__desc">${escHtml(p.description)}</div>` : ''}
        </div>
        <div class="project-card__meta">${timeAgo(p.created_at)}</div>
        <button class="project-card__delete" aria-label="Remove project" title="Remove from list">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
        </button>
      `;
      card.querySelector('.project-card__delete').addEventListener('click', (e) => {
        e.stopPropagation();
        this._confirmDisable(p.id, p.name, card);
      });
      card.addEventListener('click', () => this._openProject(p.id));
      this._projectList.appendChild(card);
    });
  }

  async _openProject(id) {
    await window.db.projects.open(id);
    await window.db.window.expand();
    this.router.navigate('project', { projectId: id });
  }

  _confirmDisable(id, name, cardEl) {
    this._confirmName.textContent = name;
    this._confirmOverlay.hidden = false;

    // Replace listener to avoid stacking handlers
    const btn = this._btnConfirmRemove;
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    this._btnConfirmRemove = fresh;

    fresh.addEventListener('click', async () => {
      this._closeConfirm();
      await this._disableProject(id, cardEl);
    });
  }

  _closeConfirm() {
    this._confirmOverlay.hidden = true;
  }

  async _disableProject(id, cardEl) {
    cardEl.style.pointerEvents = 'none';
    cardEl.style.opacity = '0.5';
    try {
      await window.db.projects.update({ id, is_active: 0 });
      await this._loadRecent();
    } catch (err) {
      cardEl.style.pointerEvents = '';
      cardEl.style.opacity = '';
    }
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
