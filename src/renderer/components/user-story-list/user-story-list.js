import { escHtml, injectCss, formatDate } from '../../shared/helpers.js';
import { UserStoryDetail } from '../user-story-detail/user-story-detail.js';

/**
 * UserStoryList — manages the story card list panel.
 *
 * Detail panel rendering is delegated to UserStoryDetail.
 *
 * Usage:
 *   const usl = new UserStoryList({ listEl, addBtn, detailEl, projectId, onSelect });
 *   await usl.mount();
 *   // when a feature is clicked:
 *   await usl.load(featureId);
 */
export class UserStoryList {
  constructor({ listEl, addBtn, importBtn, detailEl, projectId, getModel, onSelect, onExport, onRunCommand, onRunCommandExternal, onPrintOutput }) {
    this._listEl    = listEl;
    this._addBtn    = addBtn;
    this._importBtn = importBtn;
    this._projectId = projectId;
    this._featureId = null;
    this._onSelect  = onSelect || (() => {});
    this._onExport  = onExport || (() => {});
    this._activeId  = null;
    this._statuses  = [];
    this._confirmModal = null;

    this._detail = new UserStoryDetail({
      detailEl,
      projectId,
      getModel,
      onRunCommand,
      onRunCommandExternal,
      onPrintOutput,
      onStoryUpdated: () => this._load(),
      onCancelled:    () => {
        this._activeId = null;
        this._listEl.querySelectorAll('.usl-card')
          .forEach(el => el.classList.remove('usl-card--active'));
      },
      onExport: (story) => this._onExport(story),
      onDelete: (story) => this._openConfirm(story),
    });
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------
  async mount() {
    injectCss('components/user-story-list/user-story-list.css');
    await this._detail.mount();

    this._statuses = await window.db.status.list();

    this._addBtn.addEventListener('click', () => {
      if (!this._featureId) return;
      this._detail.showAddForm();
    });
    if (this._importBtn) {
      this._importBtn.addEventListener('click', () => {
        if (!this._featureId) return;
        this._importFromJson();
      });
    }
    this._renderEmpty('Select a feature');
    this._detail.showEmpty();
  }

  /** Load stories for the given featureId */
  async load(featureId) {
    await this._detail.save();
    this._featureId = featureId;
    this._activeId  = null;
    this._detail.setContext(featureId, this._statuses);
    this._detail.showEmpty();
    await this._load();
  }

  async save() {
    await this._detail.save();
  }

  async refresh() {
    if (this._featureId) await this._load();
  }

  // ----------------------------------------------------------------
  // JSON import (single story with prompts)
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
      if (!record || typeof record !== 'object' || !record.title) {
        throw new Error('Expected a JSON object with a "title" field');
      }
    } catch (err) {
      this._showImportToast(`Invalid JSON file: ${err.message}`);
      return;
    }

    const existing = await window.db.userStories.list({ feature_id: this._featureId });
    const match = existing.find(s => s.title.trim().toLowerCase() === record.title.trim().toLowerCase());

    if (match) {
      this._openReplaceConfirm(record, match);
    } else {
      await this._createStoryFromImport(record);
    }
  }

  async _createStoryFromImport(record) {
    const statusMatch = record.status
      ? this._statuses.find(s => s.name.toLowerCase() === record.status.toLowerCase())
      : null;
    const backlog  = this._statuses.find(s => s.name === 'Backlog');
    const statusId = statusMatch ? statusMatch.id : (backlog ? backlog.id : null);

    try {
      const story = await window.db.userStories.create({
        feature_id:          this._featureId,
        project_id:          this._projectId,
        title:               record.title,
        description:         record.description || null,
        acceptance_criteria: record.acceptance_criteria || null,
        status_id:           statusId,
      });
      if (Array.isArray(record.prompts)) {
        for (const p of record.prompts) {
          await window.db.prompts.create({
            user_story_id: story.id,
            tag:           p.tag || null,
            prompt:        p.prompt || null,
          });
        }
      }
      await this._load();
      this._showImportToast('User story imported successfully.');
    } catch {
      this._showImportToast('Failed to import user story.');
    }
  }

  async _replaceStoryFromImport(record, existingStory) {
    const statusMatch = record.status
      ? this._statuses.find(s => s.name.toLowerCase() === record.status.toLowerCase())
      : null;
    const statusId = statusMatch ? statusMatch.id : existingStory.status_id;

    try {
      await window.db.userStories.update({
        id:                  existingStory.id,
        title:               record.title,
        description:         record.description || null,
        acceptance_criteria: record.acceptance_criteria || null,
        status_id:           statusId,
      });
      const oldPrompts = await window.db.prompts.list(existingStory.id);
      for (const p of oldPrompts) {
        await window.db.prompts.delete(p.id);
      }
      if (Array.isArray(record.prompts)) {
        for (const p of record.prompts) {
          await window.db.prompts.create({
            user_story_id: existingStory.id,
            tag:           p.tag || null,
            prompt:        p.prompt || null,
          });
        }
      }
      await this._load();
      this._showImportToast('User story replaced successfully.');
    } catch {
      this._showImportToast('Failed to replace user story.');
    }
  }

  _openReplaceConfirm(record, existingStory) {
    this._closeConfirm();

    const overlay = document.createElement('div');
    overlay.className = 'usl-modal-overlay';
    overlay.innerHTML = `
      <div class="usl-modal usl-modal--sm" role="alertdialog" aria-modal="true">
        <div class="usl-modal__header">
          <h2 class="usl-modal__title">Replace Existing Story?</h2>
        </div>
        <div class="usl-modal__body">
          <p class="usl-confirm__msg">
            A user story named <strong>${escHtml(existingStory.title)}</strong> already exists.
            Do you want to replace it with the imported data?
          </p>
        </div>
        <div class="usl-modal__footer">
          <button class="usl-modal__btn usl-modal__btn--cancel">Cancel</button>
          <button class="usl-modal__btn usl-modal__btn--save">Replace</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this._confirmModal = overlay;

    const close = () => this._closeConfirm();
    overlay.querySelector('.usl-modal__btn--cancel').addEventListener('click', close);

    const escHandler = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escHandler);
    overlay._removeEsc = () => document.removeEventListener('keydown', escHandler);

    const replaceBtn = overlay.querySelector('.usl-modal__btn--save');
    replaceBtn.addEventListener('click', async () => {
      replaceBtn.disabled    = true;
      replaceBtn.textContent = 'Replacing…';
      this._closeConfirm();
      await this._replaceStoryFromImport(record, existingStory);
    });
  }

  _showImportToast(message) {
    document.querySelector('.usl-import-toast')?.remove();
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
      const created = formatDate(s.created_at);

      const card = document.createElement('div');
      card.className = 'usl-card' + (s.id === this._activeId ? ' usl-card--active' : '');
      card.dataset.id = s.id;
      card.innerHTML = `
        <div class="usl-card__header">
          <span class="usl-card__id">#${s.id}</span>
          <span class="usl-card__title">${escHtml(s.title)}</span>
        </div>
        ${s.description ? `<p class="usl-card__desc">${escHtml(s.description)}</p>` : ''}
        <div class="usl-card__footer">
          <span class="usl-card__date">${escHtml(created)}</span>
          ${s.status_name ? `<span class="usl-card__status">${escHtml(s.status_name)}</span>` : ''}
        </div>
      `;

      card.addEventListener('click', async () => {
        if (this._activeId === s.id) return;
        await this._detail.save();
        this._activeId = s.id;
        this._listEl.querySelectorAll('.usl-card')
          .forEach(el => el.classList.remove('usl-card--active'));
        card.classList.add('usl-card--active');
        const fresh = await window.db.userStories.get(s.id);
        this._detail.showEditForm(fresh || s);
        this._onSelect(fresh || s);
      });

      this._listEl.appendChild(card);
    });

    if (this._activeId === null && stories.length > 0) {
      this._listEl.querySelector('.usl-card')?.click();
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
}
