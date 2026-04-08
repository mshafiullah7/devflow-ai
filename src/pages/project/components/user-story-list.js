import { escHtml } from '../../../shared/helpers.js';

/**
 * UserStoryList — self-contained component for the User Stories panel.
 *
 * Usage:
 *   const usl = new UserStoryList({ listEl, addBtn, projectId, onSelect });
 *   await usl.mount();
 *   // when a feature is clicked:
 *   await usl.load(featureId);
 */
export class UserStoryList {
  constructor({ listEl, addBtn, detailEl, projectId, onSelect }) {
    this._listEl       = listEl;
    this._addBtn       = addBtn;
    this._detailEl     = detailEl;
    this._projectId    = projectId;
    this._featureId    = null;
    this._onSelect     = onSelect || (() => {});
    this._activeId     = null;
    this._statuses     = [];
    this._modal        = null;
    this._confirmModal = null;
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------
  async mount() {
    this._injectCss();
    this._statuses = await window.db.status.list();
    this._addBtn.addEventListener('click', () => {
      if (!this._featureId) return;
      this._showAddForm();
    });
    this._renderEmpty('Select a feature');
    this._renderDetailEmpty();
  }

  /** Load stories for the given featureId */
  async load(featureId) {
    this._featureId = featureId;
    this._activeId  = null;
    this._renderDetailEmpty();
    await this._load();
  }

  async refresh() {
    if (this._featureId) await this._load();
  }

  // ----------------------------------------------------------------
  // Data
  // ----------------------------------------------------------------
  async _load() {
    const stories = await window.db.userStories.list({ feature_id: this._featureId });
    this._render(stories);
  }

  // ----------------------------------------------------------------
  // Rendering — cards
  // ----------------------------------------------------------------
  _renderEmpty(msg) {
    this._listEl.innerHTML = `
      <div class="usl-empty">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect x="4" y="6" width="24" height="20" rx="4" stroke="#4b5563" stroke-width="1.4"/>
          <path d="M9 13h14M9 18h10M9 23h6" stroke="#4b5563" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <p>${escHtml(msg)}</p>
      </div>
    `;
  }

  _render(stories) {
    this._listEl.innerHTML = '';

    if (stories.length === 0) {
      this._renderEmpty('No user stories yet');
      return;
    }

    stories.forEach(s => {
      const created = s.created_at
        ? new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '';

      const card = document.createElement('div');
      card.className = 'usl-card' + (s.id === this._activeId ? ' usl-card--active' : '');
      card.dataset.id = s.id;
      card.innerHTML = `
        <div class="usl-card__header">
          <span class="usl-card__title">${escHtml(s.title)}</span>
          <div class="usl-card__actions">
            <button class="usl-card__action usl-card__action--edit" title="Edit story" aria-label="Edit story">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13l-3 1 1-3 8.5-8.5z"
                  stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="usl-card__action usl-card__action--delete" title="Delete story" aria-label="Delete story">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M3 4h10M6 4V3h4v1M4 4l1 9h6l1-9M6 7v4M10 7v4"
                  stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        ${s.description ? `<p class="usl-card__desc">${escHtml(s.description)}</p>` : ''}
        <div class="usl-card__footer">
          <span class="usl-card__date">${escHtml(created)}</span>
          ${s.status_name ? `<span class="usl-card__status">${escHtml(s.status_name)}</span>` : ''}
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.usl-card__actions')) return;
        this._activeId = s.id;
        this._listEl.querySelectorAll('.usl-card')
          .forEach(el => el.classList.remove('usl-card--active'));
        card.classList.add('usl-card--active');
        this._onSelect(s);
      });

      card.querySelector('.usl-card__action--edit').addEventListener('click', (e) => {
        e.stopPropagation();
        this._openModal(s);
      });

      card.querySelector('.usl-card__action--delete').addEventListener('click', (e) => {
        e.stopPropagation();
        this._openConfirm(s);
      });

      this._listEl.appendChild(card);
    });
  }

  // ----------------------------------------------------------------
  // Detail panel — empty state
  // ----------------------------------------------------------------
  _renderDetailEmpty() {
    if (!this._detailEl) return;
    this._detailEl.innerHTML = `
      <div class="usl-detail-empty">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="12" stroke="#4b5563" stroke-width="1.4"/>
          <path d="M16 11v5l3 3" stroke="#4b5563" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p>Select a user story</p>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // Inline add form — rendered inside the detail panel
  // ----------------------------------------------------------------
  _showAddForm() {
    if (!this._detailEl) return;

    const backlog       = this._statuses.find(s => s.name === 'Backlog');
    const defaultStatus = backlog ? backlog.id : '';

    this._detailEl.innerHTML = `
      <div class="usl-add-form">
        <div class="usl-add-form__header">
          <h2 class="usl-add-form__title">Add User Story</h2>
        </div>
        <div class="usl-add-form__body">

          <div class="usl-add-form__field">
            <label class="usl-add-form__label" for="uslAddTitle">
              Title <span class="usl-add-form__required">*</span>
            </label>
            <input
              class="usl-add-form__input"
              id="uslAddTitle"
              type="text"
              placeholder="As a user, I want to…"
              maxlength="200"
              autocomplete="off"
            />
          </div>

          <div class="usl-add-form__field">
            <label class="usl-add-form__label" for="uslAddDesc">Description</label>
            <textarea
              class="usl-add-form__textarea"
              id="uslAddDesc"
              placeholder="Describe the story…"
              rows="3"
            ></textarea>
          </div>

          <div class="usl-add-form__field">
            <label class="usl-add-form__label" for="uslAddAC">Acceptance Criteria</label>
            <textarea
              class="usl-add-form__textarea"
              id="uslAddAC"
              placeholder="Given… When… Then…"
              rows="3"
            ></textarea>
          </div>

          <div class="usl-add-form__field">
            <label class="usl-add-form__label" for="uslAddPrompt">Prompt</label>
            <textarea
              class="usl-add-form__textarea"
              id="uslAddPrompt"
              placeholder="AI prompt for this story…"
              rows="3"
            ></textarea>
          </div>

          <div class="usl-add-form__field">
            <label class="usl-add-form__label" for="uslAddStatus">Status</label>
            <select class="usl-add-form__select" id="uslAddStatus">
              <option value="">— none —</option>
              ${this._statuses.map(st =>
                `<option value="${st.id}"${st.id === defaultStatus ? ' selected' : ''}>${escHtml(st.name)}</option>`
              ).join('')}
            </select>
          </div>

        </div>
        <div class="usl-add-form__footer">
          <button class="usl-add-form__btn usl-add-form__btn--cancel">Cancel</button>
          <button class="usl-add-form__btn usl-add-form__btn--save">Add User Story</button>
        </div>
      </div>
    `;

    const titleEl  = this._detailEl.querySelector('#uslAddTitle');
    const descEl   = this._detailEl.querySelector('#uslAddDesc');
    const acEl     = this._detailEl.querySelector('#uslAddAC');
    const promptEl = this._detailEl.querySelector('#uslAddPrompt');
    const statusEl = this._detailEl.querySelector('#uslAddStatus');
    const saveBtn  = this._detailEl.querySelector('.usl-add-form__btn--save');

    titleEl.focus();

    this._detailEl.querySelector('.usl-add-form__btn--cancel')
      .addEventListener('click', () => this._renderDetailEmpty());

    const save = async () => {
      const title = titleEl.value.trim();
      if (!title) {
        titleEl.classList.add('usl-add-form__input--error');
        titleEl.focus();
        return;
      }
      titleEl.classList.remove('usl-add-form__input--error');
      saveBtn.disabled    = true;
      saveBtn.textContent = 'Adding…';

      try {
        await window.db.userStories.create({
          feature_id:          this._featureId,
          project_id:          this._projectId,
          title,
          description:         descEl.value.trim()   || null,
          acceptance_criteria: acEl.value.trim()     || null,
          prompt:              promptEl.value.trim() || null,
          status_id:           statusEl.value ? parseInt(statusEl.value, 10) : null,
        });
        this._renderDetailEmpty();
        await this._load();
      } catch {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Add User Story';
      }
    };

    saveBtn.addEventListener('click', save);
    titleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  }

  // ----------------------------------------------------------------
  // Modal — Edit only
  // ----------------------------------------------------------------
  _openModal(story) {
    this._closeModal();

    const defaultStatus = story.status_id ?? '';

    const overlay = document.createElement('div');
    overlay.className = 'usl-modal-overlay';
    overlay.innerHTML = `
      <div class="usl-modal" role="dialog" aria-modal="true">
        <div class="usl-modal__header">
          <h2 class="usl-modal__title">Edit User Story</h2>
          <button class="usl-modal__close" aria-label="Close">&times;</button>
        </div>
        <div class="usl-modal__body">

          <div class="usl-modal__field">
            <label class="usl-modal__label" for="uslModalTitle">
              Title <span class="usl-modal__required">*</span>
            </label>
            <input
              class="usl-modal__input"
              id="uslModalTitle"
              type="text"
              placeholder="As a user, I want to…"
              maxlength="200"
              autocomplete="off"
              value="${escHtml(story.title)}"
            />
          </div>

          <div class="usl-modal__field">
            <label class="usl-modal__label" for="uslModalDesc">Description</label>
            <textarea
              class="usl-modal__textarea"
              id="uslModalDesc"
              placeholder="Describe the story…"
              rows="3"
            >${escHtml(story.description || '')}</textarea>
          </div>

          <div class="usl-modal__field">
            <label class="usl-modal__label" for="uslModalAC">Acceptance Criteria</label>
            <textarea
              class="usl-modal__textarea"
              id="uslModalAC"
              placeholder="Given… When… Then…"
              rows="3"
            >${escHtml(story.acceptance_criteria || '')}</textarea>
          </div>

          <div class="usl-modal__field">
            <label class="usl-modal__label" for="uslModalPrompt">Prompt</label>
            <textarea
              class="usl-modal__textarea"
              id="uslModalPrompt"
              placeholder="AI prompt for this story…"
              rows="3"
            >${escHtml(story.prompt || '')}</textarea>
          </div>

          <div class="usl-modal__field">
            <label class="usl-modal__label" for="uslModalStatus">Status</label>
            <select class="usl-modal__select" id="uslModalStatus">
              <option value="">— none —</option>
              ${this._statuses.map(st =>
                `<option value="${st.id}"${st.id === defaultStatus ? ' selected' : ''}>${escHtml(st.name)}</option>`
              ).join('')}
            </select>
          </div>

        </div>
        <div class="usl-modal__footer">
          <button class="usl-modal__btn usl-modal__btn--cancel">Cancel</button>
          <button class="usl-modal__btn usl-modal__btn--save">Save Changes</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._modal = overlay;

    const titleEl  = overlay.querySelector('#uslModalTitle');
    const descEl   = overlay.querySelector('#uslModalDesc');
    const acEl     = overlay.querySelector('#uslModalAC');
    const promptEl = overlay.querySelector('#uslModalPrompt');
    const statusEl = overlay.querySelector('#uslModalStatus');
    const saveBtn  = overlay.querySelector('.usl-modal__btn--save');

    titleEl.focus();

    const close = () => this._closeModal();
    overlay.querySelector('.usl-modal__close').addEventListener('click', close);
    overlay.querySelector('.usl-modal__btn--cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const escHandler = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escHandler);
    overlay._removeEsc = () => document.removeEventListener('keydown', escHandler);

    const save = async () => {
      const title = titleEl.value.trim();
      if (!title) {
        titleEl.classList.add('usl-modal__input--error');
        titleEl.focus();
        return;
      }
      titleEl.classList.remove('usl-modal__input--error');
      saveBtn.disabled    = true;
      saveBtn.textContent = 'Saving…';

      try {
        await window.db.userStories.update({
          id:                  story.id,
          title,
          description:         descEl.value.trim()   || null,
          acceptance_criteria: acEl.value.trim()     || null,
          prompt:              promptEl.value.trim() || null,
          status_id:           statusEl.value ? parseInt(statusEl.value, 10) : null,
        });
        this._closeModal();
        await this._load();
      } catch {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Save Changes';
      }
    };

    saveBtn.addEventListener('click', save);
  }

  _closeModal() {
    if (this._modal) {
      if (this._modal._removeEsc) this._modal._removeEsc();
      this._modal.remove();
      this._modal = null;
    }
  }

  // ----------------------------------------------------------------
  // Confirm delete
  // ----------------------------------------------------------------
  _openConfirm(story) {
    this._closeConfirm();

    const overlay = document.createElement('div');
    overlay.className = 'usl-modal-overlay';
    overlay.innerHTML = `
      <div class="usl-modal usl-modal--sm" role="alertdialog" aria-modal="true">
        <div class="usl-modal__header">
          <h2 class="usl-modal__title">Delete Story?</h2>
        </div>
        <div class="usl-modal__body">
          <p class="usl-confirm__msg">
            <strong>${escHtml(story.title)}</strong> will be disabled and hidden from the list.
          </p>
        </div>
        <div class="usl-modal__footer">
          <button class="usl-modal__btn usl-modal__btn--cancel">Cancel</button>
          <button class="usl-modal__btn usl-modal__btn--danger">Delete</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._confirmModal = overlay;

    const close = () => this._closeConfirm();
    overlay.querySelector('.usl-modal__btn--cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const escHandler = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escHandler);
    overlay._removeEsc = () => document.removeEventListener('keydown', escHandler);

    const deleteBtn = overlay.querySelector('.usl-modal__btn--danger');
    deleteBtn.addEventListener('click', async () => {
      deleteBtn.disabled    = true;
      deleteBtn.textContent = 'Deleting…';
      try {
        await window.db.userStories.update({ id: story.id, is_active: 0 });
        if (this._activeId === story.id) this._activeId = null;
        this._closeConfirm();
        await this._load();
      } catch {
        deleteBtn.disabled    = false;
        deleteBtn.textContent = 'Delete';
      }
    });
  }

  _closeConfirm() {
    if (this._confirmModal) {
      if (this._confirmModal._removeEsc) this._confirmModal._removeEsc();
      this._confirmModal.remove();
      this._confirmModal = null;
    }
  }

  // ----------------------------------------------------------------
  // CSS injection
  // ----------------------------------------------------------------
  _injectCss() {
    if (!document.getElementById('user-story-list-css')) {
      const link = document.createElement('link');
      link.id   = 'user-story-list-css';
      link.rel  = 'stylesheet';
      link.href = 'pages/project/components/user-story-list.css';
      document.head.appendChild(link);
    }
  }
}
