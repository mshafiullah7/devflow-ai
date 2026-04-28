import { escHtml, injectCss, formatDate } from '../../shared/helpers.js';

/**
 * FeatureList — self-contained component that manages the Features panel.
 *
 * Usage:
 *   const fl = new FeatureList({ listEl, addBtn, projectId, onSelect });
 *   await fl.mount();
 */
export class FeatureList {
  constructor({ listEl, addBtn, projectId, onSelect }) {
    this._listEl       = listEl;
    this._addBtn       = addBtn;
    this._projectId    = projectId;
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
    injectCss('components/feature-list/feature-list.css');
    this._statuses = await window.db.status.list();
    this._addBtn.addEventListener('click', () => this._openModal(null));
    await this._load();
  }

  async refresh() {
    await this._load();
  }

  // ----------------------------------------------------------------
  // Data
  // ----------------------------------------------------------------
  async _load() {
    const features = await window.db.features.list(this._projectId);
    this._render(features);
  }

  // ----------------------------------------------------------------
  // Rendering — cards
  // ----------------------------------------------------------------
  _render(features) {
    this._listEl.innerHTML = '';

    if (features.length === 0) {
      this._listEl.innerHTML = `
        <div class="fl-empty">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect x="4" y="6" width="24" height="20" rx="4" stroke="#4b5563" stroke-width="1.4"/>
            <path d="M9 13h14M9 18h8" stroke="#4b5563" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          <p>No features yet</p>
        </div>
      `;
      return;
    }

    features.forEach(f => {
      const created = formatDate(f.created_at);

      const card = document.createElement('div');
      card.className = 'fl-card' + (f.id === this._activeId ? ' fl-card--active' : '');
      card.dataset.id = f.id;
      card.innerHTML = `
        <div class="fl-card__header">
          <span class="fl-card__name">${escHtml(f.name)}</span>
          <div class="fl-card__actions">
            <button class="fl-card__action fl-card__action--edit" title="Edit feature" aria-label="Edit feature">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13l-3 1 1-3 8.5-8.5z"
                  stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="fl-card__action fl-card__action--delete" title="Delete feature" aria-label="Delete feature">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M3 4h10M6 4V3h4v1M4 4l1 9h6l1-9M6 7v4M10 7v4"
                  stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        ${f.description ? `<p class="fl-card__desc">${escHtml(f.description)}</p>` : ''}
        <div class="fl-card__footer">
          <span class="fl-card__date">${escHtml(created)}</span>
          ${f.status_name ? `<span class="fl-card__status">${escHtml(f.status_name)}</span>` : ''}
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.fl-card__actions')) return;
        this._activeId = f.id;
        this._listEl.querySelectorAll('.fl-card')
          .forEach(el => el.classList.remove('fl-card--active'));
        card.classList.add('fl-card--active');
        this._onSelect(f);
      });

      card.querySelector('.fl-card__action--edit').addEventListener('click', (e) => {
        e.stopPropagation();
        this._openModal(f);
      });

      card.querySelector('.fl-card__action--delete').addEventListener('click', (e) => {
        e.stopPropagation();
        this._openConfirm(f);
      });

      this._listEl.appendChild(card);
    });
  }

  // ----------------------------------------------------------------
  // Modal — Add / Edit
  // ----------------------------------------------------------------
  _openModal(feature) {
    this._closeModal();

    const isEdit        = feature !== null;
    const backlog       = this._statuses.find(s => s.name === 'Backlog');
    const defaultStatus = isEdit
      ? (feature.status_id ?? '')
      : (backlog ? backlog.id : '');

    const overlay = document.createElement('div');
    overlay.className = 'fl-modal-overlay';
    overlay.innerHTML = `
      <div class="fl-modal" role="dialog" aria-modal="true">
        <div class="fl-modal__header">
          <h2 class="fl-modal__title">${isEdit ? 'Edit Feature' : 'Add Feature'}</h2>
          <button class="fl-modal__close" aria-label="Close">&times;</button>
        </div>
        <div class="fl-modal__body">
          <div class="fl-modal__field">
            <label class="fl-modal__label" for="flModalName">
              Name <span class="fl-modal__required">*</span>
            </label>
            <input
              class="fl-modal__input"
              id="flModalName"
              type="text"
              placeholder="Feature name…"
              maxlength="120"
              autocomplete="off"
              value="${isEdit ? escHtml(feature.name) : ''}"
            />
          </div>
          <div class="fl-modal__field">
            <label class="fl-modal__label" for="flModalDesc">Description</label>
            <textarea
              class="fl-modal__textarea"
              id="flModalDesc"
              placeholder="Describe this feature…"
              rows="3"
            >${isEdit ? escHtml(feature.description || '') : ''}</textarea>
          </div>
          <div class="fl-modal__field">
            <label class="fl-modal__label" for="flModalStatus">Status</label>
            <select class="fl-modal__select" id="flModalStatus">
              <option value="">— none —</option>
              ${this._statuses.map(s =>
                `<option value="${s.id}"${s.id === defaultStatus ? ' selected' : ''}>${escHtml(s.name)}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="fl-modal__footer">
          <button class="fl-modal__btn fl-modal__btn--cancel">Cancel</button>
          <button class="fl-modal__btn fl-modal__btn--save">
            ${isEdit ? 'Save Changes' : 'Add Feature'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._modal = overlay;

    const nameEl   = overlay.querySelector('#flModalName');
    const descEl   = overlay.querySelector('#flModalDesc');
    const statusEl = overlay.querySelector('#flModalStatus');
    const saveBtn  = overlay.querySelector('.fl-modal__btn--save');

    nameEl.focus();

    const close = () => this._closeModal();
    overlay.querySelector('.fl-modal__close').addEventListener('click', close);
    overlay.querySelector('.fl-modal__btn--cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const escHandler = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escHandler);
    overlay._removeEsc = () => document.removeEventListener('keydown', escHandler);

    const save = async () => {
      const name = nameEl.value.trim();
      if (!name) {
        nameEl.classList.add('fl-modal__input--error');
        nameEl.focus();
        return;
      }
      nameEl.classList.remove('fl-modal__input--error');
      saveBtn.disabled    = true;
      saveBtn.textContent = isEdit ? 'Saving…' : 'Adding…';

      try {
        if (isEdit) {
          await window.db.features.update({
            id:          feature.id,
            name,
            description: descEl.value.trim() || null,
            status_id:   statusEl.value ? parseInt(statusEl.value, 10) : null,
          });
        } else {
          await window.db.features.create({
            project_id:  this._projectId,
            name,
            description: descEl.value.trim() || null,
            status_id:   statusEl.value ? parseInt(statusEl.value, 10) : null,
          });
        }
        this._closeModal();
        await this._load();
      } catch {
        saveBtn.disabled    = false;
        saveBtn.textContent = isEdit ? 'Save Changes' : 'Add Feature';
      }
    };

    saveBtn.addEventListener('click', save);
    nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
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
  _openConfirm(feature) {
    this._closeConfirm();

    const overlay = document.createElement('div');
    overlay.className = 'fl-modal-overlay';
    overlay.innerHTML = `
      <div class="fl-modal fl-modal--sm" role="alertdialog" aria-modal="true">
        <div class="fl-modal__header">
          <h2 class="fl-modal__title">Delete Feature?</h2>
        </div>
        <div class="fl-modal__body">
          <p class="fl-confirm__msg">
            <strong>${escHtml(feature.name)}</strong> will be disabled and hidden from the list.
          </p>
        </div>
        <div class="fl-modal__footer">
          <button class="fl-modal__btn fl-modal__btn--cancel">Cancel</button>
          <button class="fl-modal__btn fl-modal__btn--danger">Delete</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._confirmModal = overlay;

    const close = () => this._closeConfirm();
    overlay.querySelector('.fl-modal__btn--cancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const escHandler = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escHandler);
    overlay._removeEsc = () => document.removeEventListener('keydown', escHandler);

    const deleteBtn = overlay.querySelector('.fl-modal__btn--danger');
    deleteBtn.addEventListener('click', async () => {
      deleteBtn.disabled    = true;
      deleteBtn.textContent = 'Deleting…';
      try {
        await window.db.features.update({ id: feature.id, is_active: 0 });
        if (this._activeId === feature.id) this._activeId = null;
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
}
