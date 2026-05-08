import { escHtml, injectCss, formatDate } from '../../shared/helpers.js';

/**
 * FeatureList — self-contained component that manages the Features panel.
 *
 * Usage:
 *   const fl = new FeatureList({ listEl, addBtn, projectId, onSelect });
 *   await fl.mount();
 */
export class FeatureList {
  constructor({ listEl, addBtn, importBtn, projectId, onSelect, onExport }) {
    this._listEl       = listEl;
    this._addBtn       = addBtn;
    this._importBtn    = importBtn;
    this._projectId    = projectId;
    this._onSelect     = onSelect || (() => {});
    this._onExport     = onExport || (() => {});
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
    if (this._importBtn) {
      this._importBtn.addEventListener('click', () => this._importFromJson());
    }
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
          <span class="fl-card__id">#${f.id}</span>
          <span class="fl-card__name">${escHtml(f.name)}</span>
          <div class="fl-card__actions">
            <button class="fl-card__action fl-card__action--export" title="Export feature" aria-label="Export feature">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
            </button>
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

      card.querySelector('.fl-card__action--export').addEventListener('click', (e) => {
        e.stopPropagation();
        this._onExport(f);
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

    if (this._activeId === null && features.length > 0) {
      this._listEl.querySelector('.fl-card')?.click();
    }
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

  // ----------------------------------------------------------------
  // JSON import (feature with user stories + prompts)
  // ----------------------------------------------------------------
  async _importFromJson() {
    let raw;
    try {
      raw = await window.db.dialog.openJsonFile();
    } catch {
      return;
    }
    if (!raw) return;

    let record;
    try {
      record = JSON.parse(raw);
      if (!record || typeof record !== 'object' || !record.feature) {
        throw new Error('Expected a JSON object with a "feature" field');
      }
    } catch (err) {
      this._showImportToast(`Invalid JSON file: ${err.message}`);
      return;
    }

    const features = await window.db.features.list(this._projectId);
    const match = features.find(f => f.name.trim().toLowerCase() === record.feature.trim().toLowerCase());

    if (match) {
      this._openReplaceConfirm(record, match);
    } else {
      await this._createFeatureFromImport(record);
    }
  }

  async _createFeatureFromImport(record) {
    const statusMatch = record.status
      ? this._statuses.find(s => s.name.toLowerCase() === record.status.toLowerCase())
      : null;
    const backlog  = this._statuses.find(s => s.name === 'Backlog');
    const statusId = statusMatch ? statusMatch.id : (backlog ? backlog.id : null);

    try {
      const feature = await window.db.features.create({
        project_id:  this._projectId,
        name:        record.feature,
        description: record.description || null,
        status_id:   statusId,
      });
      await this._importStories(feature.id, record.user_stories || []);
      await this._load();
      this._showImportToast('Feature imported successfully.');
    } catch {
      this._showImportToast('Failed to import feature.');
    }
  }

  async _replaceFeatureFromImport(record, existingFeature) {
    const statusMatch = record.status
      ? this._statuses.find(s => s.name.toLowerCase() === record.status.toLowerCase())
      : null;
    const statusId = statusMatch ? statusMatch.id : existingFeature.status_id;

    try {
      await window.db.features.update({
        id:          existingFeature.id,
        name:        record.feature,
        description: record.description || null,
        status_id:   statusId,
      });

      const oldStories = await window.db.userStories.list({ feature_id: existingFeature.id });
      for (const s of oldStories) {
        const oldPrompts = await window.db.prompts.list(s.id);
        for (const p of oldPrompts) {
          await window.db.prompts.delete(p.id);
        }
        await window.db.userStories.delete(s.id);
      }

      await this._importStories(existingFeature.id, record.user_stories || []);
      await this._load();
      this._showImportToast('Feature replaced successfully.');
    } catch {
      this._showImportToast('Failed to replace feature.');
    }
  }

  async _importStories(featureId, stories) {
    const backlog  = this._statuses.find(s => s.name === 'Backlog');
    for (const item of stories) {
      const statusMatch = item.status
        ? this._statuses.find(s => s.name.toLowerCase() === item.status.toLowerCase())
        : null;
      const statusId = statusMatch ? statusMatch.id : (backlog ? backlog.id : null);

      const story = await window.db.userStories.create({
        feature_id:          featureId,
        project_id:          this._projectId,
        title:               item.title || '',
        description:         item.description || null,
        acceptance_criteria: item.acceptance_criteria || null,
        status_id:           statusId,
      });

      if (Array.isArray(item.prompts)) {
        for (const p of item.prompts) {
          await window.db.prompts.create({
            user_story_id: story.id,
            tag:           p.tag || null,
            prompt:        p.prompt || null,
          });
        }
      }
    }
  }

  _openReplaceConfirm(record, existingFeature) {
    this._closeConfirm();

    const storyCount = Array.isArray(record.user_stories) ? record.user_stories.length : 0;
    const overlay = document.createElement('div');
    overlay.className = 'fl-modal-overlay';
    overlay.innerHTML = `
      <div class="fl-modal fl-modal--sm" role="alertdialog" aria-modal="true">
        <div class="fl-modal__header">
          <h2 class="fl-modal__title">Replace Existing Feature?</h2>
        </div>
        <div class="fl-modal__body">
          <p class="fl-confirm__msg">
            A feature named <strong>${escHtml(existingFeature.name)}</strong> already exists.
            Replacing it will remove all its current user stories and prompts,
            then import ${storyCount} user ${storyCount === 1 ? 'story' : 'stories'} from the file.
          </p>
        </div>
        <div class="fl-modal__footer">
          <button class="fl-modal__btn fl-modal__btn--cancel">Cancel</button>
          <button class="fl-modal__btn fl-modal__btn--save">Replace</button>
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

    const replaceBtn = overlay.querySelector('.fl-modal__btn--save');
    replaceBtn.addEventListener('click', async () => {
      replaceBtn.disabled    = true;
      replaceBtn.textContent = 'Replacing…';
      this._closeConfirm();
      await this._replaceFeatureFromImport(record, existingFeature);
    });
  }

  _showImportToast(message) {
    document.querySelector('.fl-import-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'usl-import-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('usl-import-toast--visible'));
    setTimeout(() => {
      toast.classList.remove('usl-import-toast--visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}
