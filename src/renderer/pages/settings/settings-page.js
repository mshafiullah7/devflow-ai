import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';

export class SettingsPage {
  constructor(container, params, router) {
    this.container   = container;
    this.router      = router;
    this._from       = params.from || 'launcher';
    this._fromParams = params.fromParams || {};
  }

  async mount() {
    injectCss('pages/settings/settings-page.css');
    applyStoredTheme();
    this.container.innerHTML = this._template();
    this._bindEvents();
    await this._renderModelList();
  }

  unmount() {
    removeCss('pages/settings/settings-page.css');
    document.querySelector('.st-overlay')?.remove();
  }

  // ----------------------------------------------------------------
  // Page shell
  // ----------------------------------------------------------------
  _template() {
    return `
      <div class="settings-page">
        <header class="settings-page__header">
          <button class="settings-page__back" id="stBtnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <span class="settings-page__title">Settings</span>
        </header>

        <div class="settings-page__layout">
          <nav class="settings-page__sidebar">
            <div class="st-sidebar-section">Configuration</div>
            <button class="st-nav-item active" id="stNavAiConfig">
              <span class="st-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
                    stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
              </span>
              <span class="st-nav-item__label">AI Config</span>
            </button>
          </nav>

          <main class="settings-page__content" id="stMainContent"></main>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    this.container.querySelector('#stBtnBack')
      .addEventListener('click', () => this.router.navigate(this._from, this._fromParams));

    this.container.querySelector('#stNavAiConfig')
      .addEventListener('click', () => this._renderModelList());
  }

  // ----------------------------------------------------------------
  // Model list (inline in content area)
  // ----------------------------------------------------------------
  async _renderModelList() {
    const configs = await window.db.modelConfigs.list();
    const main = this.container.querySelector('#stMainContent');

    const rows = configs.length === 0
      ? `<div class="st-model-empty">No model configurations yet. Click <strong>Add Model</strong> to get started.</div>`
      : `<div class="st-model-list">
          ${configs.map(c => `
            <div class="st-model-item">
              <div class="st-model-item__info">
                <div class="st-model-item__top">
                  <span class="st-model-item__label">${escHtml(c.label)}</span>
                  <span class="st-model-item__badge st-model-item__badge--${c.type}">${c.type === 'cli' ? 'CLI' : 'API'}</span>
                  ${c.is_default ? `<span class="st-model-item__badge st-model-item__badge--default">default</span>` : ''}
                </div>
                <div class="st-model-item__sub">
                  ${c.type === 'cli'
                    ? escHtml(c.executable || '') + (c.flags ? ` <span class="st-model-item__flags">${escHtml(c.flags)}</span>` : '')
                    : escHtml(c.model_name || 'claude-sonnet-4-6')}
                </div>
              </div>
              <div class="st-model-item__actions">
                ${!c.is_default ? `<button class="st-btn st-btn--star" data-action="default" data-id="${c.id}" title="Set as default">★</button>` : ''}
                <button class="st-btn" data-action="edit" data-id="${c.id}" title="Edit">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M11 2l3 3-9 9H2v-3l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button class="st-btn st-btn--delete" data-action="delete" data-id="${c.id}" title="Delete">
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          `).join('')}
        </div>`;

    main.innerHTML = `
      <div class="st-content-title">AI Config</div>
      <div class="st-content-sub">Manage AI model configurations used across the app</div>
      <div class="st-section-header">
        <div class="st-section-label">Model Configurations</div>
        <button class="st-add-btn" id="stBtnAddModel">
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M7 1v12M1 7h12"/>
          </svg>
          Add Model
        </button>
      </div>
      ${rows}
    `;

    main.querySelector('#stBtnAddModel').addEventListener('click', () => this._openModal(null));

    main.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id     = Number(btn.dataset.id);
        const action = btn.dataset.action;
        if (action === 'edit') {
          const cfg = await window.db.modelConfigs.get(id);
          this._openModal(cfg);
        } else if (action === 'delete') {
          await window.db.modelConfigs.delete(id);
          this._renderModelList();
        } else if (action === 'default') {
          await window.db.modelConfigs.setDefault(id);
          this._renderModelList();
        }
      });
    });
  }

  // ----------------------------------------------------------------
  // Add / Edit modal popup
  // ----------------------------------------------------------------
  _openModal(config) {
    document.querySelector('.st-overlay')?.remove();

    const isEdit = !!config;
    const overlay = document.createElement('div');
    overlay.className = 'st-overlay';
    overlay.innerHTML = `
      <div class="st-modal">
        <div class="st-modal__header">
          <span class="st-modal__title">${isEdit ? 'Edit Model' : 'Add Model'}</span>
          <button class="st-modal__close" id="stModalClose">&times;</button>
        </div>
        <div class="st-modal__body">
          <form id="stModalForm" autocomplete="off">

            <div class="st-form__row">
              <label class="st-form__label">Label *</label>
              <input class="st-form__input" id="stFLabel" type="text"
                placeholder="e.g. Claude CLI, Gemini CLI…"
                value="${escHtml(config?.label || '')}" required/>
            </div>

            <div class="st-form__row">
              <label class="st-form__label">Type</label>
              <div class="st-form__type-toggle">
                <button type="button" class="st-type-btn ${(!config || config.type === 'cli') ? 'active' : ''}" data-type="cli">CLI</button>
                <button type="button" class="st-type-btn ${config?.type === 'anthropic' ? 'active' : ''}" data-type="anthropic">Anthropic API</button>
              </div>
              <input type="hidden" id="stFType" value="${config?.type || 'cli'}"/>
            </div>

            <div id="stFFieldsCli">
              <div class="st-form__row">
                <label class="st-form__label">Executable *</label>
                <input class="st-form__input" id="stFExecutable" type="text"
                  placeholder="claude"
                  value="${escHtml(config?.executable || '')}"/>
                <span class="st-form__hint">Binary name available in PATH (e.g. claude, gemini, aider)</span>
              </div>
              <div class="st-form__row">
                <label class="st-form__label">Flags</label>
                <input class="st-form__input" id="stFFlags" type="text"
                  placeholder="--dangerously-skip-permissions --print"
                  value="${escHtml(config?.flags || '')}"/>
                <span class="st-form__hint">Flags appended when running inline in the console</span>
              </div>
              <div class="st-form__row">
                <label class="st-form__label">Input mode</label>
                <select class="st-form__select" id="stFInputMode">
                  <option value="pipe"    ${(!config || config.input_mode === 'pipe')    ? 'selected' : ''}>Pipe (Write-Output $p | exe)</option>
                  <option value="heredoc" ${config?.input_mode === 'heredoc'             ? 'selected' : ''}>Heredoc ($p = @'…'@; exe $p)</option>
                </select>
              </div>
            </div>

            <div id="stFFieldsApi" style="display:none">
              <div class="st-form__row">
                <label class="st-form__label">Model name *</label>
                <input class="st-form__input" id="stFModelName" type="text"
                  placeholder="claude-sonnet-4-6"
                  value="${escHtml(config?.type === 'anthropic' ? (config?.model_name || '') : '')}"/>
                <span class="st-form__hint">e.g. claude-sonnet-4-6, claude-opus-4-7, claude-haiku-4-5-20251001</span>
              </div>
              <div class="st-form__row">
                <label class="st-form__label">API Key *</label>
                <input class="st-form__input" id="stFApiKey" type="password"
                  placeholder="sk-ant-…"
                  value="${escHtml(config?.type === 'anthropic' ? (config?.api_key || '') : '')}"/>
                <span class="st-form__hint">Your Anthropic API key from console.anthropic.com</span>
              </div>
              <div class="st-form__row">
                <label class="st-form__label">Max tokens</label>
                <input class="st-form__input st-form__input--short" id="stFMaxTokens" type="number"
                  min="1" max="128000" placeholder="8192"
                  value="${config?.type === 'anthropic' ? (config?.max_tokens || '') : ''}"/>
              </div>
            </div>

            <div class="st-form__row">
              <label class="st-form__check-label">
                <input type="checkbox" id="stFIsDefault" ${config?.is_default ? 'checked' : ''}/>
                Set as default model
              </label>
            </div>

            <div class="st-form__footer">
              <button type="button" class="st-form__cancel-btn" id="stFBtnCancel">Cancel</button>
              <button type="submit" class="st-form__save-btn">${isEdit ? 'Save changes' : 'Add model'}</button>
            </div>

          </form>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    overlay.querySelector('#stModalClose').addEventListener('click', close);
    overlay.querySelector('#stFBtnCancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const escFn = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escFn); } };
    document.addEventListener('keydown', escFn);

    const applyType = type => {
      overlay.querySelector('#stFFieldsCli').style.display = type === 'cli'       ? '' : 'none';
      overlay.querySelector('#stFFieldsApi').style.display = type === 'anthropic' ? '' : 'none';
    };

    applyType(config?.type || 'cli');

    overlay.querySelectorAll('.st-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.st-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        overlay.querySelector('#stFType').value = btn.dataset.type;
        applyType(btn.dataset.type);
      });
    });

    overlay.querySelector('#stModalForm').addEventListener('submit', async e => {
      e.preventDefault();
      const type      = overlay.querySelector('#stFType').value;
      const label     = overlay.querySelector('#stFLabel').value.trim();
      const isDefault = overlay.querySelector('#stFIsDefault').checked;
      if (!label) return;

      let data = { label, type, is_default: isDefault, input_mode: 'pipe' };

      if (type === 'cli') {
        data.executable = overlay.querySelector('#stFExecutable')?.value.trim() || null;
        data.flags      = overlay.querySelector('#stFFlags')?.value.trim() || null;
        data.input_mode = overlay.querySelector('#stFInputMode')?.value || 'pipe';
      } else if (type === 'anthropic') {
        data.model_name = overlay.querySelector('#stFModelName')?.value.trim() || 'claude-sonnet-4-6';
        data.api_key    = overlay.querySelector('#stFApiKey')?.value || null;
        data.max_tokens = overlay.querySelector('#stFMaxTokens')?.value
                            ? Number(overlay.querySelector('#stFMaxTokens').value) : null;
      }

      if (config) {
        await window.db.modelConfigs.update({ id: config.id, ...data });
      } else {
        await window.db.modelConfigs.create(data);
      }

      close();
      this._renderModelList();
    });
  }
}
