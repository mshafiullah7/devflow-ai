import { escHtml, injectCss } from '../../../../shared/helpers.js';

export class ModelConfigsModal {
  constructor({ onConfigsChanged }) {
    this._onConfigsChanged = onConfigsChanged || (() => {});
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  mount() {
    injectCss('pages/project/components/model-configs/model-configs-modal.css');
  }

  // ----------------------------------------------------------------
  // Show modal
  // ----------------------------------------------------------------
  async show() {
    document.querySelector('.mcfg-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'mcfg-overlay';
    overlay.innerHTML = `
      <div class="mcfg-modal">
        <div class="mcfg-header">
          <div class="mcfg-header__title">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
              <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            AI Model Configurations
          </div>
          <div class="mcfg-header__actions">
            <button class="mcfg-add-btn" id="btnMcfgAdd">+ Add Model</button>
            <button class="mcfg-close" aria-label="Close">&times;</button>
          </div>
        </div>
        <div class="mcfg-body" id="mcfgBody"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.mcfg-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    const escFn = (e) => {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escFn); }
    };
    document.addEventListener('keydown', escFn);

    const body = overlay.querySelector('#mcfgBody');
    overlay.querySelector('#btnMcfgAdd').addEventListener('click', () => this._renderForm(overlay, body, null));

    await this._renderList(overlay, body);
  }

  // ----------------------------------------------------------------
  // List view
  // ----------------------------------------------------------------
  async _renderList(overlay, body) {
    const configs = await window.db.modelConfigs.list();
    if (configs.length === 0) {
      body.innerHTML = `<div class="mcfg-empty">No model configurations yet. Click <strong>+ Add Model</strong> to create one.</div>`;
      return;
    }

    body.innerHTML = `
      <div class="mcfg-list">
        ${configs.map(c => `
          <div class="mcfg-item" data-id="${c.id}">
            <div class="mcfg-item__info">
              <div class="mcfg-item__top">
                <span class="mcfg-item__label">${escHtml(c.label)}</span>
                <span class="mcfg-item__badge mcfg-item__badge--${c.type}">${c.type === 'cli' ? 'CLI' : 'API'}</span>
                ${c.is_default ? `<span class="mcfg-item__badge mcfg-item__badge--default">default</span>` : ''}
              </div>
              <div class="mcfg-item__sub">
                ${c.type === 'cli'
                  ? escHtml(c.executable || '') + (c.flags ? ` <span class="mcfg-item__flags">${escHtml(c.flags)}</span>` : '')
                  : escHtml(c.base_url || '') + (c.model_name ? ` · ${escHtml(c.model_name)}` : '')}
              </div>
            </div>
            <div class="mcfg-item__actions">
              ${!c.is_default ? `<button class="mcfg-btn mcfg-btn--default" data-action="default" data-id="${c.id}" title="Set as default">★</button>` : ''}
              <button class="mcfg-btn mcfg-btn--edit" data-action="edit" data-id="${c.id}" title="Edit">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M11 2l3 3-9 9H2v-3l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                </svg>
              </button>
              <button class="mcfg-btn mcfg-btn--delete" data-action="delete" data-id="${c.id}" title="Delete">
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                  <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    body.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id     = Number(btn.dataset.id);
        const action = btn.dataset.action;
        if (action === 'edit') {
          const cfg = await window.db.modelConfigs.get(id);
          this._renderForm(overlay, body, cfg);
        } else if (action === 'delete') {
          await window.db.modelConfigs.delete(id);
          this._onConfigsChanged();
          await this._renderList(overlay, body);
        } else if (action === 'default') {
          await window.db.modelConfigs.setDefault(id);
          this._onConfigsChanged();
          await this._renderList(overlay, body);
        }
      });
    });
  }

  // ----------------------------------------------------------------
  // Add / Edit form
  // ----------------------------------------------------------------
  _renderForm(overlay, body, config) {
    const isEdit  = !!config;
    const isCli   = !config || config.type === 'cli';

    body.innerHTML = `
      <form class="mcfg-form" id="mcfgForm" autocomplete="off">
        <div class="mcfg-form__row">
          <label class="mcfg-form__label">Label *</label>
          <input class="mcfg-form__input" id="mcfgLabel" type="text" placeholder="e.g. Claude CLI, Mistral API…" value="${escHtml(config?.label || '')}" required/>
        </div>

        <div class="mcfg-form__row">
          <label class="mcfg-form__label">Type *</label>
          <div class="mcfg-form__type-toggle">
            <button type="button" class="mcfg-type-btn ${isCli ? 'active' : ''}" data-type="cli">CLI</button>
            <button type="button" class="mcfg-type-btn ${!isCli ? 'active' : ''}" data-type="api">API</button>
          </div>
          <input type="hidden" id="mcfgType" value="${config?.type || 'cli'}"/>
        </div>

        <!-- CLI fields -->
        <div class="mcfg-fields-cli" id="mcfgFieldsCli" ${!isCli ? 'style="display:none"' : ''}>
          <div class="mcfg-form__row">
            <label class="mcfg-form__label">Executable *</label>
            <input class="mcfg-form__input" id="mcfgExecutable" type="text" placeholder="claude" value="${escHtml(config?.executable || '')}"/>
            <span class="mcfg-form__hint">Binary name available in PATH (e.g. claude, gemini, aider)</span>
          </div>
          <div class="mcfg-form__row">
            <label class="mcfg-form__label">Flags</label>
            <input class="mcfg-form__input" id="mcfgFlags" type="text" placeholder="--dangerously-skip-permissions --print" value="${escHtml(config?.flags || '')}"/>
            <span class="mcfg-form__hint">Flags appended when running inline in the console</span>
          </div>
          <div class="mcfg-form__row">
            <label class="mcfg-form__label">Input mode</label>
            <select class="mcfg-form__select" id="mcfgInputMode">
              <option value="pipe" ${(!config || config.input_mode === 'pipe') ? 'selected' : ''}>Pipe (Write-Output $p | exe)</option>
              <option value="heredoc" ${config?.input_mode === 'heredoc' ? 'selected' : ''}>Heredoc ($p = @'…'@; exe $p)</option>
            </select>
          </div>
        </div>

        <!-- API fields -->
        <div class="mcfg-fields-api" id="mcfgFieldsApi" ${isCli ? 'style="display:none"' : ''}>
          <div class="mcfg-form__row">
            <label class="mcfg-form__label">Base URL *</label>
            <input class="mcfg-form__input" id="mcfgBaseUrl" type="text" placeholder="https://api.mistral.ai/v1  or  http://localhost:11434/v1" value="${escHtml(config?.base_url || '')}"/>
            <span class="mcfg-form__hint">OpenAI-compatible /v1/chat/completions endpoint</span>
          </div>
          <div class="mcfg-form__row">
            <label class="mcfg-form__label">Model name *</label>
            <input class="mcfg-form__input" id="mcfgModelName" type="text" placeholder="mistral-large-latest, phi4-mini, gpt-4o…" value="${escHtml(config?.model_name || '')}"/>
          </div>
          <div class="mcfg-form__row">
            <label class="mcfg-form__label">API Key</label>
            <input class="mcfg-form__input" id="mcfgApiKey" type="password" placeholder="Leave blank for local models" value="${escHtml(config?.api_key || '')}"/>
          </div>
          <div class="mcfg-form__row">
            <label class="mcfg-form__label">Max tokens</label>
            <input class="mcfg-form__input mcfg-form__input--short" id="mcfgMaxTokens" type="number" min="1" max="128000" placeholder="4096" value="${config?.max_tokens || ''}"/>
          </div>
        </div>

        <div class="mcfg-form__row mcfg-form__row--check">
          <label class="mcfg-form__check-label">
            <input type="checkbox" id="mcfgIsDefault" ${config?.is_default ? 'checked' : ''}/>
            Set as default model
          </label>
        </div>

        <div class="mcfg-form__footer">
          <button type="button" class="mcfg-btn mcfg-btn--cancel" id="btnMcfgCancel">Cancel</button>
          <button type="submit" class="mcfg-btn mcfg-btn--save">${isEdit ? 'Save changes' : 'Add model'}</button>
        </div>
      </form>
    `;

    // Type toggle
    body.querySelectorAll('.mcfg-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.type;
        body.querySelectorAll('.mcfg-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === t));
        body.querySelector('#mcfgType').value = t;
        body.querySelector('#mcfgFieldsCli').style.display = t === 'cli' ? '' : 'none';
        body.querySelector('#mcfgFieldsApi').style.display = t === 'api' ? '' : 'none';
      });
    });

    body.querySelector('#btnMcfgCancel').addEventListener('click', () => this._renderList(overlay, body));

    body.querySelector('#mcfgForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const type      = body.querySelector('#mcfgType').value;
      const label     = body.querySelector('#mcfgLabel').value.trim();
      const isDefault = body.querySelector('#mcfgIsDefault').checked;

      if (!label) return;

      const data = {
        label,
        type,
        is_default: isDefault,
        // CLI
        executable: body.querySelector('#mcfgExecutable')?.value.trim() || null,
        flags:      body.querySelector('#mcfgFlags')?.value.trim() || null,
        input_mode: body.querySelector('#mcfgInputMode')?.value || 'pipe',
        // API
        base_url:   body.querySelector('#mcfgBaseUrl')?.value.trim() || null,
        model_name: body.querySelector('#mcfgModelName')?.value.trim() || null,
        api_key:    body.querySelector('#mcfgApiKey')?.value || null,
        max_tokens: body.querySelector('#mcfgMaxTokens')?.value
                      ? Number(body.querySelector('#mcfgMaxTokens').value) : null,
      };

      if (isEdit) {
        await window.db.modelConfigs.update({ id: config.id, ...data });
      } else {
        await window.db.modelConfigs.create(data);
      }

      this._onConfigsChanged();
      await this._renderList(overlay, body);
    });
  }
}
