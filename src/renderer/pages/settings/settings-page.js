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
            <button class="st-nav-item" id="stNavModelMapping">
              <span class="st-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h13M3 12h10M3 18h7M18 9v9M15 15l3 3 3-3"/>
                </svg>
              </span>
              <span class="st-nav-item__label">Model Mapping</span>
            </button>
            <button class="st-nav-item" id="stNavPromptsTemplate">
              <span class="st-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                </svg>
              </span>
              <span class="st-nav-item__label">Prompts Template</span>
            </button>
            <div class="st-sidebar-section">Sync</div>
            <button class="st-nav-item" id="stNavCloudSync">
              <span class="st-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="16 17 21 12 16 7"/><path d="M21 12H9"/><path d="M3 12a9 9 0 0 1 9-9"/>
                </svg>
              </span>
              <span class="st-nav-item__label">Cloud Sync</span>
            </button>
            <div class="st-sidebar-section">Backup</div>
            <button class="st-nav-item" id="stNavBackupConfig">
              <span class="st-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </svg>
              </span>
              <span class="st-nav-item__label">Configuration</span>
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
      .addEventListener('click', () => {
        this._setActiveNav('stNavAiConfig');
        this._renderModelList();
      });

    this.container.querySelector('#stNavModelMapping')
      .addEventListener('click', () => {
        this._setActiveNav('stNavModelMapping');
        this._renderModelMapping();
      });

    this.container.querySelector('#stNavCloudSync')
      .addEventListener('click', () => {
        this._setActiveNav('stNavCloudSync');
        this._renderCloudSync();
      });

    this.container.querySelector('#stNavBackupConfig')
      .addEventListener('click', () => {
        this._setActiveNav('stNavBackupConfig');
        this._renderBackupConfig(); // async, fire-and-forget is fine
      });

    this.container.querySelector('#stNavPromptsTemplate')
      .addEventListener('click', () => {
        this._setActiveNav('stNavPromptsTemplate');
        this._renderPromptsTemplate();
      });
  }

  _setActiveNav(id) {
    this.container.querySelectorAll('.st-nav-item').forEach(el => el.classList.remove('active'));
    this.container.querySelector(`#${id}`)?.classList.add('active');
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
            <div class="st-model-item st-model-item--clickable" data-id="${c.id}">
              <div class="st-model-item__info">
                <div class="st-model-item__top">
                  <span class="st-model-item__label">${escHtml(c.label)}</span>
                  <span class="st-model-item__badge st-model-item__badge--${c.type}">${c.type === 'cli' ? 'CLI' : c.type === 'ollama' ? 'Ollama' : 'API'}</span>
                  ${c.is_default ? `<span class="st-model-item__badge st-model-item__badge--default">default</span>` : ''}
                </div>
                <div class="st-model-item__sub">
                  ${c.type === 'cli'
                    ? escHtml(c.executable || '') + (c.model_name ? ` · ${escHtml(c.model_name)}` : '') + (c.flags ? ` <span class="st-model-item__flags">${escHtml(c.flags)}</span>` : '')
                    : c.type === 'ollama'
                      ? escHtml(c.base_url || 'http://localhost:11434') + (c.model_name ? ` · ${escHtml(c.model_name)}` : '')
                      : escHtml(c.model_name || '')}
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

    // Card click → edit
    main.querySelectorAll('.st-model-item--clickable').forEach(card => {
      card.addEventListener('click', async () => {
        const cfg = await window.db.modelConfigs.get(Number(card.dataset.id));
        this._openModal(cfg);
      });
    });

    // Action buttons — stop click bubbling to the card
    main.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
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
  // ----------------------------------------------------------------
  // Model Mapping (placeholder)
  // ----------------------------------------------------------------
  async _renderModelMapping() {
    const main    = this.container.querySelector('#stMainContent');
    const configs = await window.db.modelConfigs.list();

    const modelOptions = configs.length === 0
      ? `<option value="">No models configured</option>`
      : `<option value="">Use default</option>` +
        configs.map(c => `<option value="${c.id}">${escHtml(c.label)}</option>`).join('');

    const sections = [
      {
        label: 'Pages',
        features: [
          { icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`, name: 'Documents' },
          { icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`, name: 'Mockups' },
          { icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`, name: 'User Stories' },
          { icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`, name: 'Extract Stories' },
        ],
      },
      {
        label: 'Quality',
        features: [
          { icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`, name: 'Test Runner' },
          { icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`, name: 'Issues' },
        ],
      },
      {
        label: 'Tools',
        features: [
          { icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h13M3 12h10M3 18h7M18 9v9M15 15l3 3 3-3"/></svg>`, name: 'Prompt Queue' },
        ],
      },
    ];

    main.innerHTML = `
      <div class="st-content-title">Model Mapping</div>
      <div class="st-content-sub">Assign a specific AI model to each feature — overrides the global default</div>

      <div class="st-coming-soon-banner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
        </svg>
        Coming Soon — this preview shows the planned layout. Selections are not saved yet.
      </div>

      ${sections.map(s => `
        <div class="st-mapping-section">
          <div class="st-section-label">${s.label}</div>
          <div class="st-mapping-list">
            ${s.features.map(f => `
              <div class="st-mapping-row">
                <span class="st-mapping-row__icon">${f.icon}</span>
                <span class="st-mapping-row__name">${escHtml(f.name)}</span>
                <select class="st-form__select st-mapping-row__select" disabled>
                  ${modelOptions}
                </select>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    `;
  }

  // ----------------------------------------------------------------
  // Backup Configuration
  // ----------------------------------------------------------------
  async _renderBackupConfig() {
    const main = this.container.querySelector('#stMainContent');
    const [saved, defaultPath] = await Promise.all([
      window.app.config.get('backupPath'),
      window.app.backupDefaultPath(),
    ]);
    main.innerHTML = `
      <div class="st-content-title">Backup</div>
      <div class="st-content-sub">Automatic daily backups run on launch. Export or restore a backup manually at any time.</div>

      <div class="st-section-header">
        <div class="st-section-label">Manual Backup</div>
      </div>
      <div class="st-backup-actions">
        <div class="st-backup-action-card">
          <div class="st-backup-action-card__icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
          <div class="st-backup-action-card__body">
            <div class="st-backup-action-card__title">Export Backup</div>
            <div class="st-backup-action-card__desc">Save a copy of the current database to any location.</div>
          </div>
          <button class="st-add-btn" id="stBtnExport">Export</button>
        </div>
        <div class="st-backup-action-card">
          <div class="st-backup-action-card__icon" style="color:var(--danger)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div class="st-backup-action-card__body">
            <div class="st-backup-action-card__title">Restore Backup</div>
            <div class="st-backup-action-card__desc">Replace current data with a previously exported <code>.db</code> file. The app will reload automatically.</div>
          </div>
          <button class="st-add-btn st-add-btn--danger" id="stBtnRestore">Restore</button>
        </div>
      </div>
      <span class="st-form__hint" id="stBackupActionHint" style="display:block;margin-top:8px"></span>

      <div class="st-section-header" style="margin-top:28px">
        <div class="st-section-label">Auto-Backup Path</div>
      </div>
      <div class="st-input-row">
        <input class="st-form__input" id="stBackupPathInput" type="text"
          placeholder="Select a folder…"
          value="${escHtml(saved || '')}"/>
        <button class="st-add-btn" id="stBtnBrowseBackup">Browse</button>
        <button class="st-add-btn" id="stBtnSaveBackup">Save</button>
      </div>
      <div class="st-backup-paths" id="stBackupPaths">
        <div class="st-backup-path-row">
          <span class="st-backup-path-label">Primary (always on)</span>
          <span class="st-backup-path-value">${escHtml(defaultPath)}</span>
        </div>
        <div class="st-backup-path-row">
          <span class="st-backup-path-label">Secondary (configured)</span>
          <span class="st-backup-path-value ${saved ? '' : 'st-backup-path-value--none'}" id="stSecondaryPathDisplay">
            ${saved ? escHtml(saved) : 'Not set'}
          </span>
        </div>
      </div>
      <span class="st-form__hint" id="stBackupHint"></span>
    `;

    const actionHint = main.querySelector('#stBackupActionHint');

    main.querySelector('#stBtnExport').addEventListener('click', async () => {
      actionHint.textContent = 'Exporting…';
      const result = await window.app.db.export();
      actionHint.textContent = result.success ? `Exported to ${result.filePath}` : 'Export cancelled.';
      setTimeout(() => { actionHint.textContent = ''; }, 4000);
    });

    main.querySelector('#stBtnRestore').addEventListener('click', async () => {
      actionHint.textContent = '';
      const result = await window.app.db.restore();
      if (!result.success) {
        if (result.reason === 'corrupt')  actionHint.textContent = 'Restore failed — selected file failed integrity check.';
        else if (result.reason === 'invalid') actionHint.textContent = 'Restore failed — file is not a valid SQLite database.';
        // cancelled: show nothing
      }
      // On success the window reloads automatically
    });

    main.querySelector('#stBtnBrowseBackup').addEventListener('click', async () => {
      const folder = await window.db.dialog.openFolder();
      if (folder) main.querySelector('#stBackupPathInput').value = folder;
    });

    main.querySelector('#stBtnSaveBackup').addEventListener('click', async () => {
      const val = main.querySelector('#stBackupPathInput').value.trim();
      await window.app.config.set('backupPath', val);

      const display = main.querySelector('#stSecondaryPathDisplay');
      display.textContent = val || 'Not set';
      display.className = `st-backup-path-value${val ? '' : ' st-backup-path-value--none'}`;

      const hint = main.querySelector('#stBackupHint');
      hint.textContent = 'Saved';
      setTimeout(() => { hint.textContent = ''; }, 1500);
    });
  }

  // ----------------------------------------------------------------
  // Prompts Template (placeholder)
  // ----------------------------------------------------------------
  _renderPromptsTemplate() {
    const main = this.container.querySelector('#stMainContent');
    main.innerHTML = `
      <div class="st-content-title">Prompts Template</div>
      <div class="st-content-sub">Manage reusable prompt templates for AI interactions across your projects</div>
      <div class="st-coming-soon-banner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
        </svg>
        Coming Soon — prompt template management will be available in a future update.
      </div>
      <div class="st-placeholder-sections">
        <div class="st-placeholder-card">
          <div class="st-placeholder-card__icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <div class="st-placeholder-card__body">
            <div class="st-placeholder-card__title">User Story Prompts</div>
            <div class="st-placeholder-card__desc">Templates for generating and refining user stories with contextual AI prompts.</div>
          </div>
          <button class="st-add-btn" disabled>Manage</button>
        </div>
        <div class="st-placeholder-card">
          <div class="st-placeholder-card__icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
            </svg>
          </div>
          <div class="st-placeholder-card__body">
            <div class="st-placeholder-card__title">Mockup Prompts</div>
            <div class="st-placeholder-card__desc">Templates for UI/UX generation prompts used in the Mockups page.</div>
          </div>
          <button class="st-add-btn" disabled>Manage</button>
        </div>
        <div class="st-placeholder-card">
          <div class="st-placeholder-card__icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <div class="st-placeholder-card__body">
            <div class="st-placeholder-card__title">Test Case Prompts</div>
            <div class="st-placeholder-card__desc">Templates for generating test cases and acceptance criteria from stories.</div>
          </div>
          <button class="st-add-btn" disabled>Manage</button>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // Cloud Sync (placeholder)
  // ----------------------------------------------------------------
  async _renderCloudSync() {
    const main   = this.container.querySelector('#stMainContent');
    const saved  = await window.app.cloudSync.get();
    const prov   = saved.provider || 'supabase';

    main.innerHTML = `
      <div class="st-content-title">Cloud Sync</div>
      <div class="st-content-sub">Connect to a cloud database to sync project data across devices</div>

      <div class="st-coming-soon-banner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
        </svg>
        Sync functionality coming soon — save your connection now and sync will activate when released.
      </div>

      <div class="st-section-header" style="margin-top:20px">
        <div class="st-section-label">Connection</div>
      </div>

      <div class="st-cloud-form">

        <div class="st-form__row">
          <label class="st-form__label">Provider</label>
          <select class="st-form__select" id="csProvider">
            <option value="supabase"  ${prov === 'supabase'  ? 'selected' : ''}>Supabase</option>
            <option value="postgres"  ${prov === 'postgres'  ? 'selected' : ''}>PostgreSQL (self-hosted / on-premises)</option>
          </select>
          <span class="st-form__hint">
            Both use the same PostgreSQL wire protocol — switching later only requires updating credentials.
            <a class="st-hint-link" id="csLearnMore" href="#">Learn more</a>
          </span>
        </div>

        <!-- Supabase fields -->
        <div id="csFieldsSupabase">
          <div class="st-form__row">
            <label class="st-form__label">Project URL</label>
            <input class="st-form__input" id="csSupabaseUrl" type="text"
              placeholder="https://xxxxxxxxxxxx.supabase.co"
              value="${escHtml(saved.supabaseUrl || '')}"/>
            <span class="st-form__hint">Found in your Supabase project → Settings → API</span>
          </div>
          <div class="st-form__row">
            <label class="st-form__label">Database Password</label>
            <input class="st-form__input" id="csPassword" type="password"
              placeholder="${saved.password_enc ? '••••••••  (saved)' : 'Enter database password'}"
              autocomplete="new-password"/>
            <span class="st-form__hint">Project database password — stored encrypted on this device</span>
          </div>
        </div>

        <!-- PostgreSQL fields -->
        <div id="csFieldsPostgres" style="display:none">
          <div class="st-form__row">
            <label class="st-form__label">Host</label>
            <input class="st-form__input" id="csPgHost" type="text"
              placeholder="192.168.1.10 or db.example.com"
              value="${escHtml(saved.host || '')}"/>
          </div>
          <div class="st-form__row st-form__row--inline">
            <div>
              <label class="st-form__label">Port</label>
              <input class="st-form__input" id="csPgPort" type="number"
                placeholder="5432"
                value="${escHtml(String(saved.port || '5432'))}"/>
            </div>
            <div>
              <label class="st-form__label">Database</label>
              <input class="st-form__input" id="csPgDatabase" type="text"
                placeholder="sdlc_db"
                value="${escHtml(saved.database || '')}"/>
            </div>
          </div>
          <div class="st-form__row">
            <label class="st-form__label">Username</label>
            <input class="st-form__input" id="csPgUsername" type="text"
              placeholder="postgres"
              value="${escHtml(saved.username || '')}"/>
          </div>
          <div class="st-form__row">
            <label class="st-form__label">Password</label>
            <input class="st-form__input" id="csPassword" type="password"
              placeholder="${saved.password_enc ? '••••••••  (saved)' : 'Enter password'}"
              autocomplete="new-password"/>
            <span class="st-form__hint">Stored encrypted on this device using OS credential storage</span>
          </div>
          <div class="st-form__row">
            <label class="st-form__check-label">
              <input type="checkbox" id="csPgSsl" ${saved.ssl !== false ? 'checked' : ''}/>
              Require SSL / TLS
            </label>
          </div>
        </div>

        <div class="st-cloud-actions">
          <button class="st-add-btn" id="csBtnTest" disabled title="Available when sync is released">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            Test Connection
          </button>
          <button class="st-add-btn st-add-btn--primary" id="csBtnSave">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            Save
          </button>
          <span class="st-form__hint" id="csSaveHint" style="line-height:30px"></span>
        </div>

      </div>

      <div class="st-section-header" style="margin-top:28px">
        <div class="st-section-label">Schema</div>
      </div>
      <div class="st-cloud-info-card">
        <div class="st-cloud-info-card__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
        </div>
        <div class="st-cloud-info-card__body">
          <div class="st-cloud-info-card__title">Initialize Cloud Schema</div>
          <div class="st-cloud-info-card__desc">
            When sync is available, this will create the required tables in your cloud database automatically,
            or provide a SQL script you can run manually. No manual setup needed.
          </div>
        </div>
        <button class="st-add-btn" disabled title="Available when sync is released">Initialize Schema</button>
      </div>

      <div class="st-section-header" style="margin-top:28px">
        <div class="st-section-label">Project Lock</div>
      </div>
      <div class="st-cloud-info-card">
        <div class="st-cloud-info-card__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <div class="st-cloud-info-card__body">
          <div class="st-cloud-info-card__title">Project-Level Locking</div>
          <div class="st-cloud-info-card__desc">
            When a user opens a project, it will be locked so others cannot edit it simultaneously.
            Locks expire automatically if the app is closed without releasing them.
          </div>
        </div>
      </div>
    `;

    const applyProvider = (p) => {
      main.querySelector('#csFieldsSupabase').style.display = p === 'supabase' ? '' : 'none';
      main.querySelector('#csFieldsPostgres').style.display = p === 'postgres' ? '' : 'none';
    };

    applyProvider(prov);

    main.querySelector('#csProvider').addEventListener('change', e => applyProvider(e.target.value));

    main.querySelector('#csLearnMore').addEventListener('click', e => {
      e.preventDefault();
      window.shell?.openExternal?.('https://supabase.com/docs/guides/database/connecting-to-postgres');
    });

    main.querySelector('#csBtnSave').addEventListener('click', async () => {
      const provider  = main.querySelector('#csProvider').value;
      const password  = main.querySelector('#csPassword').value;
      const hint      = main.querySelector('#csSaveHint');

      const data = { provider };

      if (provider === 'supabase') {
        data.supabaseUrl = main.querySelector('#csSupabaseUrl').value.trim();
        data.ssl         = true;
        data.host        = `db.${(data.supabaseUrl.match(/https:\/\/([^.]+)/) || [])[1] || ''}.supabase.co`;
        data.port        = 5432;
        data.database    = 'postgres';
        data.username    = 'postgres';
      } else {
        data.host     = main.querySelector('#csPgHost').value.trim();
        data.port     = Number(main.querySelector('#csPgPort').value) || 5432;
        data.database = main.querySelector('#csPgDatabase').value.trim();
        data.username = main.querySelector('#csPgUsername').value.trim();
        data.ssl      = main.querySelector('#csPgSsl').checked;
      }

      if (password) data.password = password;

      await window.app.cloudSync.set(data);
      hint.textContent = 'Saved';
      setTimeout(() => { hint.textContent = ''; }, 1500);
    });
  }

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
              ${isEdit
                ? `<div class="st-type-readonly">${config.type === 'cli' ? 'CLI' : config.type === 'ollama' ? 'Ollama' : 'API'}</div>`
                : `<div class="st-form__type-toggle">
                    <button type="button" class="st-type-btn active" data-type="cli">CLI</button>
                    <button type="button" class="st-type-btn" data-type="ollama">Ollama</button>
                    <button type="button" class="st-type-btn st-type-btn--disabled" disabled title="Coming soon">
                      API <span class="st-coming-soon">Soon</span>
                    </button>
                  </div>`
              }
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
                <label class="st-form__label">Model</label>
                <input class="st-form__input" id="stFCliModel" type="text"
                  placeholder="e.g. claude-sonnet-4-6, gemini-2.0-flash"
                  value="${escHtml(config?.type === 'cli' ? (config?.model_name || '') : '')}" autocomplete="off"/>
                <span class="st-form__hint">Passed as --model &lt;value&gt; to the CLI (optional)</span>
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

            <div id="stFFieldsOllama" style="display:none">
              <div class="st-form__row">
                <label class="st-form__label">Base URL *</label>
                <div class="st-input-row">
                  <input class="st-form__input" id="stFBaseUrl" type="text"
                    placeholder="http://localhost:11434"
                    value="${escHtml(config?.type === 'ollama' ? (config?.base_url || '') : '')}"/>
                  <button type="button" class="st-detect-btn" id="stBtnDetect" title="Detect installed models">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                  </button>
                </div>
                <span class="st-form__hint">Ollama server URL (default: http://localhost:11434)</span>
              </div>
              <div class="st-form__row">
                <label class="st-form__label">Model *</label>
                <select class="st-form__select" id="stFOllamaModelSelect">
                  <option value="">Detecting models…</option>
                </select>
                <input class="st-form__input" id="stFOllamaModelManual" type="text"
                  placeholder="e.g. llama3, mistral, codellama"
                  style="display:none; margin-top:6px"/>
                <span class="st-ollama-status" id="stOllamaStatus"></span>
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

    const escFn = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escFn); } };
    document.addEventListener('keydown', escFn);

    const loadOllamaModels = async () => {
      const baseUrl   = overlay.querySelector('#stFBaseUrl').value.trim() || 'http://localhost:11434';
      const select    = overlay.querySelector('#stFOllamaModelSelect');
      const manual    = overlay.querySelector('#stFOllamaModelManual');
      const status    = overlay.querySelector('#stOllamaStatus');
      const detectBtn = overlay.querySelector('#stBtnDetect');

      select.innerHTML     = '<option value="">Detecting…</option>';
      select.disabled      = true;
      status.textContent   = '';
      status.className     = 'st-ollama-status';
      if (detectBtn) detectBtn.disabled = true;

      try {
        const models = await window.ollama.listModels(baseUrl);

        if (models && models.length > 0) {
          const current = config?.type === 'ollama' ? config.model_name : null;
          select.innerHTML = models.map(m =>
            `<option value="${escHtml(m)}" ${m === current ? 'selected' : ''}>${escHtml(m)}</option>`
          ).join('');
          select.style.display = '';
          manual.style.display = 'none';
          status.textContent   = `${models.length} model${models.length === 1 ? '' : 's'} detected`;
          status.className     = 'st-ollama-status st-ollama-status--ok';
        } else {
          select.innerHTML     = '<option value="">No models installed</option>';
          select.style.display = '';
          manual.style.display = 'none';
          status.textContent   = 'No models found. Run: ollama pull &lt;model&gt;';
          status.className     = 'st-ollama-status st-ollama-status--warn';
        }
      } catch {
        select.style.display = 'none';
        manual.style.display = '';
        manual.value         = config?.type === 'ollama' ? (config.model_name || '') : '';
        status.textContent   = 'Could not reach Ollama — enter model name manually.';
        status.className     = 'st-ollama-status st-ollama-status--err';
      } finally {
        select.disabled = false;
        if (detectBtn) detectBtn.disabled = false;
      }
    };

    const applyType = type => {
      overlay.querySelector('#stFFieldsCli').style.display    = type === 'cli'    ? '' : 'none';
      overlay.querySelector('#stFFieldsOllama').style.display = type === 'ollama' ? '' : 'none';
      if (type === 'ollama') loadOllamaModels();
    };

    applyType(config?.type || 'cli');

    overlay.querySelector('#stBtnDetect')?.addEventListener('click', loadOllamaModels);

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
        data.executable  = overlay.querySelector('#stFExecutable')?.value.trim() || null;
        data.model_name  = overlay.querySelector('#stFCliModel')?.value.trim() || null;
        data.flags       = overlay.querySelector('#stFFlags')?.value.trim() || null;
        data.input_mode  = overlay.querySelector('#stFInputMode')?.value || 'pipe';
      } else if (type === 'ollama') {
        const manual = overlay.querySelector('#stFOllamaModelManual');
        const select = overlay.querySelector('#stFOllamaModelSelect');
        data.base_url   = overlay.querySelector('#stFBaseUrl')?.value.trim() || 'http://localhost:11434';
        data.model_name = (manual.style.display !== 'none' ? manual.value.trim() : select.value) || null;
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
