import { escHtml, injectCss, formatDate } from '../../shared/helpers.js';
import { UserStoryDetail } from '../../pages/user-stories/components/user-story-detail/user-story-detail.js';

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
  constructor({ listEl, addBtn, importBtn, detailEl, projectId, getModel, onSelect, onRunCommand, onRunCommandExternal, onPrintOutput }) {
    this._listEl    = listEl;
    this._addBtn    = addBtn;
    this._importBtn = importBtn;
    this._projectId = projectId;
    this._featureId = null;
    this._onSelect  = onSelect || (() => {});
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
    this._featureId = featureId;
    this._activeId  = null;
    this._detail.setContext(featureId, this._statuses);
    this._detail.showEmpty();
    await this._load();
  }

  async refresh() {
    if (this._featureId) await this._load();
  }

  // ----------------------------------------------------------------
  // JSON import
  // ----------------------------------------------------------------
  async _importFromJson() {
    let raw;
    try {
      raw = await window.db.dialog.openJsonFile();
    } catch {
      return;
    }
    if (!raw) return; // user cancelled

    let records;
    try {
      records = JSON.parse(raw);
      if (!Array.isArray(records)) throw new Error('Expected a JSON array');
    } catch (err) {
      this._showImportToast(`Invalid JSON file: ${err.message}`);
      return;
    }

    const backlog   = this._statuses.find(s => s.name === 'Backlog');
    const statusId  = backlog ? backlog.id : null;
    let imported    = 0;
    let skipped     = 0;

    for (const item of records) {
      try {
        await window.db.userStories.create({
          feature_id:          this._featureId,
          project_id:          this._projectId,
          title:               item.title               || '',
          description:         item.description         || null,
          acceptance_criteria: item.acceptance_criteria || null,
          prompt:              item.prompt              || null,
          status_id:           statusId,
        });
        imported++;
      } catch {
        skipped++;
      }
    }

    await this._load();

    const msg = skipped > 0
      ? `Imported ${imported} user ${imported === 1 ? 'story' : 'stories'}. ${skipped} skipped due to errors.`
      : `Imported ${imported} user ${imported === 1 ? 'story' : 'stories'} successfully.`;
    this._showImportToast(msg);
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
          <span class="usl-card__title">${escHtml(s.title)}</span>
          <div class="usl-card__actions">
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
        this._detail.showEditForm(s);
      });

      card.querySelector('.usl-card__action--delete').addEventListener('click', (e) => {
        e.stopPropagation();
        this._openConfirm(s);
      });

      this._listEl.appendChild(card);
    });
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
}
