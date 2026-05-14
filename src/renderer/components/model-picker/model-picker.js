import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';

const STORAGE_KEY = 'devflow-selected-model';
const TYPE_LABEL  = { cli: 'CLI', api: 'API', ollama: 'LOCAL' };

export class ModelPicker {
  constructor({ anchor, onSelect, initialId } = {}) {
    this._anchor   = anchor;
    this._onSelect = onSelect || null;
    this._models   = [];
    this._selectedId = initialId ?? null;
    this._open     = false;
    this._handleOutside = this._handleOutside.bind(this);
    injectCss('components/model-picker/model-picker.css');
  }

  get selectedId()    { return this._selectedId; }
  get selectedModel() { return this._models.find(m => m.id === this._selectedId) || null; }
  get models()        { return this._models; }

  async reload() {
    this._models   = await window.db.modelConfigs.list();
    const storedId = Number(localStorage.getItem(STORAGE_KEY)) || null;
    const keep     = this._models.find(m => m.id === (this._selectedId || storedId));
    const fallback = this._models.find(m => m.is_default) || this._models[0] || null;
    const target   = keep || fallback;
    if (target) this._selectedId = target.id;
    this._render();
    if (target) this._notify(target);
  }

  unmount() {
    document.removeEventListener('click', this._handleOutside, true);
    removeCss('components/model-picker/model-picker.css');
    this._anchor.innerHTML = '';
  }

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------
  _render() {
    const m     = this.selectedModel;
    const label = m ? m.label : 'No model';
    const type  = m ? (TYPE_LABEL[m.type] || m.type.toUpperCase()) : '';

    this._anchor.innerHTML = `
      <div class="mp-wrap">
        <button class="mp-trigger" type="button"
                aria-haspopup="listbox" aria-expanded="${this._open}">
          <svg class="mp-trigger__icon" width="13" height="13" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          <span class="mp-trigger__label">${escHtml(label)}</span>
          ${m ? `<span class="mp-trigger__badge mp-badge--${m.type}">${type}</span>` : ''}
          <svg class="mp-trigger__caret${this._open ? ' mp-trigger__caret--open' : ''}"
               width="10" height="10" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        ${this._open ? `
          <div class="mp-menu" role="listbox">
            ${this._models.length === 0
              ? `<div class="mp-menu__empty">No models configured</div>`
              : this._models.map(c => {
                  const active = c.id === this._selectedId;
                  return `
                    <button class="mp-menu__item${active ? ' mp-menu__item--active' : ''}"
                            data-id="${c.id}" role="option" aria-selected="${active}" type="button">
                      <svg class="mp-menu__check" width="12" height="12" viewBox="0 0 24 24"
                           fill="none" stroke="currentColor" stroke-width="2.5"
                           stroke-linecap="round" stroke-linejoin="round">
                        ${active ? '<polyline points="20 6 9 17 4 12"/>' : ''}
                      </svg>
                      <span class="mp-menu__label">${escHtml(c.label)}</span>
                      <span class="mp-menu__badge mp-badge--${c.type}">${TYPE_LABEL[c.type] || c.type.toUpperCase()}</span>
                    </button>`;
                }).join('')
            }
          </div>
        ` : ''}
      </div>
    `;

    this._anchor.querySelector('.mp-trigger')
      .addEventListener('click', e => { e.stopPropagation(); this._toggleMenu(); });

    if (this._open) {
      this._anchor.querySelectorAll('.mp-menu__item[data-id]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          this._pick(Number(btn.dataset.id));
        });
      });
    }
  }

  // ----------------------------------------------------------------
  // Interactions
  // ----------------------------------------------------------------
  _toggleMenu() {
    this._open = !this._open;
    if (this._open) document.addEventListener('click', this._handleOutside, true);
    else            document.removeEventListener('click', this._handleOutside, true);
    this._render();
  }

  _pick(id) {
    const model = this._models.find(m => m.id === id);
    if (!model) return;
    this._selectedId = id;
    localStorage.setItem(STORAGE_KEY, id);
    this._open = false;
    document.removeEventListener('click', this._handleOutside, true);
    this._render();
    this._notify(model);
  }

  _handleOutside(e) {
    if (!this._anchor.contains(e.target)) {
      this._open = false;
      document.removeEventListener('click', this._handleOutside, true);
      this._render();
    }
  }

  _notify(model) {
    if (this._onSelect) this._onSelect(model);
  }
}
