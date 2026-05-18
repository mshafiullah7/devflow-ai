import { escHtml, injectCss } from '../../shared/helpers.js';

const KNOWN_CLI_MODELS = {
  claude: [
    'claude-haiku-4-5',
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-6',
    'claude-opus-4-5',
  ],
  gemini: [
    'gemini-2.5-flash-preview-05-20',
    'gemini-2.5-pro-preview-05-06',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ],
  aider: [
    'gpt-4o',
    'gpt-4-turbo',
    'claude-sonnet-4-6',
    'claude-opus-4-5',
    'deepseek/deepseek-coder',
  ],
};

export class ModelConfigsModal {
  constructor({ onConfigsChanged }) {
    this._onConfigsChanged = onConfigsChanged || (() => {});
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  mount() {
    injectCss('components/model-configs/model-configs-modal.css');
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
    const escFn = (e) => {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escFn); }
    };
    document.addEventListener('keydown', escFn);

    const body = overlay.querySelector('#mcfgBody');
    overlay.querySelector('#btnMcfgAdd').addEventListener('click', () => this._renderForm(overlay, body, null));

    await this._renderList(overlay, body);
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------
  _setAddBtn(overlay, visible) {
    const btn = overlay.querySelector('#btnMcfgAdd');
    if (btn) btn.style.display = visible ? '' : 'none';
  }

  // ----------------------------------------------------------------
  // List view
  // ----------------------------------------------------------------
  async _renderList(overlay, body) {
    this._setAddBtn(overlay, true);
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
                  : c.type === 'anthropic'
                    ? escHtml(c.model_name || 'claude-sonnet-4-6')
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
    const isEdit = !!config;
    this._setAddBtn(overlay, false);

    body.innerHTML = `
      <form class="mcfg-form" id="mcfgForm" autocomplete="off">
        <div class="mcfg-form__row">
          <label class="mcfg-form__label">Label *</label>
          <input class="mcfg-form__input" id="mcfgLabel" type="text" placeholder="e.g. Claude CLI, Gemini CLI…" value="${escHtml(config?.label || '')}" required/>
        </div>

        <div class="mcfg-form__row">
          <label class="mcfg-form__label">Type</label>
          <div class="mcfg-form__type-toggle">
            <button type="button" class="mcfg-type-btn ${(!config || config.type === 'cli') ? 'active' : ''}" data-type="cli">CLI</button>
            <button type="button" class="mcfg-type-btn ${config?.type === 'anthropic' ? 'active' : ''}" data-type="anthropic">Anthropic API</button>
          </div>
          <input type="hidden" id="mcfgType" value="${config?.type || 'cli'}"/>
        </div>

        <!-- CLI fields -->
        <div class="mcfg-fields-cli" id="mcfgFieldsCli">
          <div class="mcfg-form__row">
            <label class="mcfg-form__label">Executable *</label>
            <input class="mcfg-form__input" id="mcfgExecutable" type="text" placeholder="claude" value="${escHtml(config?.executable || '')}"/>
            <span class="mcfg-form__hint">Binary name available in PATH (e.g. claude, gemini, aider)</span>
          </div>
          <div class="mcfg-form__row">
            <label class="mcfg-form__label">Model *</label>
            <div class="mcfg-form__input-row">
              <input class="mcfg-form__input" id="mcfgCliModel" type="text" list="mcfgCliModelList"
                placeholder="e.g. claude-haiku-4-5, gemini-2.0-flash"
                value="${escHtml(config?.type === 'cli' ? (config?.model_name || '') : '')}"
                autocomplete="off"/>
              <datalist id="mcfgCliModelList"></datalist>
              <button type="button" class="mcfg-btn mcfg-fetch-btn" id="btnFetchModels" style="display:none" title="Fetch installed Ollama models">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M13 8A5 5 0 1 1 8 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M13 3v5h-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Fetch
              </button>
            </div>
            <span class="mcfg-form__hint" id="mcfgCliModelHint">Passed as --model &lt;value&gt; to the CLI</span>
            <span class="mcfg-form__error" id="mcfgCliModelError" style="display:none">Model name is required</span>
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

        <!-- Anthropic API fields -->
        <div class="mcfg-fields-api" id="mcfgFieldsApi" style="display:none">
          <div class="mcfg-form__row">
            <label class="mcfg-form__label">Model name *</label>
            <input class="mcfg-form__input" id="mcfgModelName" type="text" placeholder="claude-sonnet-4-6" value="${escHtml(config?.type === 'anthropic' ? (config?.model_name || '') : '')}"/>
            <span class="mcfg-form__hint">e.g. claude-sonnet-4-6, claude-opus-4-7, claude-haiku-4-5-20251001</span>
          </div>
          <div class="mcfg-form__row">
            <label class="mcfg-form__label">API Key *</label>
            <input class="mcfg-form__input" id="mcfgApiKey" type="password" placeholder="sk-ant-…" value="${escHtml(config?.type === 'anthropic' ? (config?.api_key || '') : '')}"/>
            <span class="mcfg-form__hint">Your Anthropic API key from console.anthropic.com</span>
          </div>
          <div class="mcfg-form__row">
            <label class="mcfg-form__label">Max tokens</label>
            <input class="mcfg-form__input mcfg-form__input--short" id="mcfgMaxTokens" type="number" min="1" max="128000" placeholder="8192" value="${config?.type === 'anthropic' ? (config?.max_tokens || '') : ''}"/>
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

    body.querySelector('#btnMcfgCancel').addEventListener('click', () => this._renderList(overlay, body));

    const applyType = (type) => {
      body.querySelector('#mcfgFieldsCli').style.display = type === 'cli'        ? '' : 'none';
      body.querySelector('#mcfgFieldsApi').style.display = type === 'anthropic'  ? '' : 'none';
    };

    applyType(config?.type || 'cli');

    // Type toggle
    body.querySelectorAll('.mcfg-type-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        body.querySelectorAll('.mcfg-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const type = btn.dataset.type;
        body.querySelector('#mcfgType').value = type;
        applyType(type);
      });
    });

    // Model suggestions — populate datalist based on executable name
    const exeInput    = body.querySelector('#mcfgExecutable');
    const modelInput  = body.querySelector('#mcfgCliModel');
    const modelList   = body.querySelector('#mcfgCliModelList');
    const fetchBtn    = body.querySelector('#btnFetchModels');
    const modelHint   = body.querySelector('#mcfgCliModelHint');
    const modelError  = body.querySelector('#mcfgCliModelError');

    const updateModelSuggestions = (exe) => {
      const name = (exe || '').toLowerCase().trim();
      modelList.innerHTML = '';
      fetchBtn.style.display = 'none';
      if (KNOWN_CLI_MODELS[name]) {
        KNOWN_CLI_MODELS[name].forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          modelList.appendChild(opt);
        });
        modelHint.textContent = `${KNOWN_CLI_MODELS[name].length} known ${name} models available as suggestions`;
      } else if (name === 'ollama') {
        fetchBtn.style.display = '';
        modelHint.textContent = 'Click Fetch to load your installed Ollama models';
      } else {
        modelHint.textContent = 'Passed as --model <value> to the CLI';
      }
    };

    if (exeInput) {
      exeInput.addEventListener('input', () => updateModelSuggestions(exeInput.value));
      updateModelSuggestions(config?.executable || '');
    }

    fetchBtn?.addEventListener('click', async () => {
      const orig = fetchBtn.innerHTML;
      fetchBtn.textContent = '…';
      fetchBtn.disabled = true;
      try {
        const res  = await fetch('http://localhost:11434/api/tags');
        const data = await res.json();
        modelList.innerHTML = '';
        (data.models || []).forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.name;
          modelList.appendChild(opt);
        });
        modelHint.textContent = `${data.models?.length || 0} Ollama models loaded — click the field to pick one`;
      } catch {
        modelHint.textContent = 'Could not reach Ollama at localhost:11434 — is it running?';
      } finally {
        fetchBtn.innerHTML  = orig;
        fetchBtn.disabled   = false;
      }
    });

    if (modelInput) {
      modelInput.addEventListener('input', () => { modelError.style.display = 'none'; });
    }

    body.querySelector('#mcfgForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const type      = body.querySelector('#mcfgType').value;
      const label     = body.querySelector('#mcfgLabel').value.trim();
      const isDefault = body.querySelector('#mcfgIsDefault').checked;

      if (!label) return;

      let data = { label, type, is_default: isDefault, input_mode: 'pipe' };

      if (type === 'cli') {
        const cliModel = body.querySelector('#mcfgCliModel')?.value.trim() || '';
        if (!cliModel) {
          body.querySelector('#mcfgCliModelError').style.display = '';
          body.querySelector('#mcfgCliModel').focus();
          return;
        }
        data.executable  = body.querySelector('#mcfgExecutable')?.value.trim() || null;
        data.model_name  = cliModel;
        data.flags       = body.querySelector('#mcfgFlags')?.value.trim() || null;
        data.input_mode  = body.querySelector('#mcfgInputMode')?.value || 'pipe';
      } else if (type === 'anthropic') {
        data.model_name = body.querySelector('#mcfgModelName')?.value.trim() || 'claude-sonnet-4-6';
        data.api_key    = body.querySelector('#mcfgApiKey')?.value || null;
        data.max_tokens = body.querySelector('#mcfgMaxTokens')?.value
                            ? Number(body.querySelector('#mcfgMaxTokens').value) : null;
      }

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
