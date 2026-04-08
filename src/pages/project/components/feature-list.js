import { escHtml } from '../../../shared/helpers.js';

/**
 * FeatureList — self-contained component that manages the Features panel.
 *
 * Usage:
 *   const fl = new FeatureList({ listEl, addBtn, projectId, onSelect });
 *   await fl.mount();
 */
export class FeatureList {
  /**
   * @param {object}      opts
   * @param {HTMLElement} opts.listEl     — #featureList container
   * @param {HTMLElement} opts.addBtn     — the + button in the panel header
   * @param {number}      opts.projectId
   * @param {function}    opts.onSelect   — called with the feature object on row click
   */
  constructor({ listEl, addBtn, projectId, onSelect }) {
    this._listEl     = listEl;
    this._addBtn     = addBtn;
    this._projectId  = projectId;
    this._onSelect   = onSelect || (() => {});
    this._activeId   = null;
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------
  async mount() {
    this._injectCss();
    this._addBtn.addEventListener('click', () => this._startAdd());
    await this._load();
  }

  /** Re-render list without changing active selection */
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
  // Rendering
  // ----------------------------------------------------------------
  _render(features) {
    // Preserve any in-progress add-form so it isn't wiped on refresh
    const addForm = this._listEl.querySelector('.fl-add-form');

    // Clear all rendered feature rows and empty state
    this._listEl.querySelectorAll('.fl-item, .fl-empty').forEach(el => el.remove());

    if (features.length === 0 && !addForm) {
      this._listEl.insertAdjacentHTML('beforeend', `
        <div class="fl-empty">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect x="4" y="6" width="24" height="20" rx="4" stroke="#4b5563" stroke-width="1.4"/>
            <path d="M9 13h14M9 18h8" stroke="#4b5563" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
          <p>No features yet</p>
        </div>
      `);
      return;
    }

    features.forEach(f => {
      const item = document.createElement('button');
      item.className = 'fl-item' + (f.id === this._activeId ? ' fl-item--active' : '');
      item.dataset.id = f.id;
      item.innerHTML = `
        <span class="fl-item__name">${escHtml(f.name)}</span>
        ${f.description
          ? `<span class="fl-item__desc">${escHtml(f.description)}</span>`
          : ''}
      `;

      item.addEventListener('click', () => {
        this._activeId = f.id;
        this._listEl.querySelectorAll('.fl-item')
          .forEach(el => el.classList.remove('fl-item--active'));
        item.classList.add('fl-item--active');
        this._onSelect(f);
      });

      this._listEl.appendChild(item);
    });
  }

  // ----------------------------------------------------------------
  // Inline add form
  // ----------------------------------------------------------------
  _startAdd() {
    if (this._listEl.querySelector('.fl-add-form')) return; // already open

    const form = document.createElement('div');
    form.className = 'fl-add-form';
    form.innerHTML = `
      <input
        class="fl-add-form__input"
        type="text"
        placeholder="Feature name…"
        autocomplete="off"
        maxlength="120"
      />
      <div class="fl-add-form__actions">
        <button class="fl-add-form__save">Add</button>
        <button class="fl-add-form__cancel">Cancel</button>
      </div>
    `;

    // Insert at top, before any existing rows
    this._listEl.prepend(form);

    // Remove empty state if present (we're about to add something)
    this._listEl.querySelector('.fl-empty')?.remove();

    const input   = form.querySelector('.fl-add-form__input');
    const saveBtn = form.querySelector('.fl-add-form__save');

    input.focus();

    form.querySelector('.fl-add-form__cancel').addEventListener('click', async () => {
      form.remove();
      await this._load(); // re-render to restore empty state if list is empty
    });

    const save = async () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }

      saveBtn.disabled    = true;
      saveBtn.textContent = 'Adding…';

      try {
        await window.db.features.create({ project_id: this._projectId, name });
        form.remove();
        await this._load();
      } catch {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Add';
      }
    };

    saveBtn.addEventListener('click', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  save();
      if (e.key === 'Escape') form.querySelector('.fl-add-form__cancel').click();
    });
  }

  // ----------------------------------------------------------------
  // CSS injection
  // ----------------------------------------------------------------
  _injectCss() {
    if (!document.getElementById('feature-list-css')) {
      const link = document.createElement('link');
      link.id   = 'feature-list-css';
      link.rel  = 'stylesheet';
      link.href = 'pages/project/components/feature-list.css';
      document.head.appendChild(link);
    }
  }
}
