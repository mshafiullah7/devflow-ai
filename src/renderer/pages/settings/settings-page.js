import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ProjectSidebar } from '../../components/project-sidebar/project-sidebar.js';

const ANTHROPIC_MODELS = [
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-5',
  'claude-opus-4-8',
];

const KNOWN_CLI_MODELS = {
  claude: [
    'claude-haiku-4-5',
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-6',
    'claude-opus-4-5',
    'claude-opus-4-8',
  ],
  agy: [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
  ],
  aider: [
    'gpt-4o',
    'gpt-4-turbo',
    'claude-sonnet-4-6',
    'claude-opus-4-5',
    'deepseek/deepseek-coder',
  ],
  copilot: [
    'gpt-4o',
    'gpt-4.1',
    'claude-sonnet-4-5',
    'o3-mini',
  ],
};

const KNOWN_CLI_FLAGS = {
  claude:  "--model {{model}} '@{{prompt}}'",
  agy:     "--model {{model}} -p '{{prompt}}'",
  aider:   "--model {{model}} --message '{{prompt}}' --no-auto-commits --yes",
  copilot: "--model {{model}} -p '{{prompt}}'",
};

const KNOWN_CLI_BATCH_FLAGS = {
  claude:  '--print -c',
  agy:     '',
  aider:   '',
  copilot: '',
};

const KNOWN_CLI_SKIP_PERMS_FLAGS = {
  claude:  '--dangerously-skip-permissions',
  agy:     '--dangerously-skip-permissions',
  aider:   '',
  copilot: '',
};

export class SettingsPage {
  constructor(container, params, router) {
    this.container   = container;
    this.router      = router;
    this._from       = params.from || 'launcher';
    this._fromParams = params.fromParams || {};
  }

  async mount() {
    injectCss('pages/settings/settings-page.css');
    injectCss('components/project-sidebar/project-sidebar.css');
    applyStoredTheme();
    this.container.innerHTML = this._template();
    this._bindEvents();
    if (this._sidebar) {
      this._sidebar.bindEvents(this.container);
      this._sidebar.loadCounts(this.container);
    }
    await this._renderModelList();
  }

  unmount() {
    removeCss('pages/settings/settings-page.css');
    removeCss('components/project-sidebar/project-sidebar.css');
    document.querySelector('.st-overlay')?.remove();
  }

  // ----------------------------------------------------------------
  // Page shell
  // ----------------------------------------------------------------
  _template() {
    const projectId = this._fromParams?.projectId ?? null;
    this._sidebar = projectId
      ? new ProjectSidebar({ projectId, router: this.router, activeRoute: 'settings' })
      : null;
    return `
      <div class="ph-project-shell">
        <header class="project-home__header">
          <button class="project-home__back" id="stBtnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <span class="ph-header-page-chip">Settings</span>
        </header>

        <div class="ph-page-with-nav">
          ${this._sidebar ? this._sidebar.html() : ''}
          <div class="settings-page">
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
            <div class="st-sidebar-section">Notifications</div>
            <button class="st-nav-item" id="stNavTelegram">
              <span class="st-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </span>
              <span class="st-nav-item__label">Telegram</span>
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
            <div class="st-sidebar-section">Templates</div>
            <button class="st-nav-item" id="stNavTemplates">
              <span class="st-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><path d="M13 17h8M17 13v8"/>
                </svg>
              </span>
              <span class="st-nav-item__label">Mockups</span>
            </button>
            <button class="st-nav-item" id="stNavDocTemplates">
              <span class="st-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                </svg>
              </span>
              <span class="st-nav-item__label">Documents</span>
            </button>
            <div class="st-sidebar-section">Backup &amp; Restore</div>
            <button class="st-nav-item" id="stNavBackupConfig">
              <span class="st-nav-item__icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </svg>
              </span>
              <span class="st-nav-item__label">Manage</span>
            </button>
          </nav>

          <main class="settings-page__content" id="stMainContent"></main>
        </div>
          </div>
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

    this.container.querySelector('#stNavTelegram')
      .addEventListener('click', () => {
        this._setActiveNav('stNavTelegram');
        this._renderNotifications();
      });

    this.container.querySelector('#stNavCloudSync')
      .addEventListener('click', () => {
        this._setActiveNav('stNavCloudSync');
        this._renderCloudSync();
      });

    this.container.querySelector('#stNavTemplates')
      .addEventListener('click', () => {
        this._setActiveNav('stNavTemplates');
        this._renderTemplates();
      });

    this.container.querySelector('#stNavDocTemplates')
      .addEventListener('click', () => {
        this._setActiveNav('stNavDocTemplates');
        this._renderDocumentTemplates();
      });

    this.container.querySelector('#stNavBackupConfig')
      .addEventListener('click', () => {
        this._setActiveNav('stNavBackupConfig');
        this._renderBackupConfig(); // async, fire-and-forget is fine
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
                  <span class="st-model-item__badge st-model-item__badge--${c.type}">${c.type === 'cli' ? 'CLI' : c.type === 'ollama' ? 'Ollama' : c.type === 'anthropic' ? 'Anthropic' : 'API'}</span>
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
  // Model Mapping
  // ----------------------------------------------------------------
  async _renderModelMapping() {
    const main = this.container.querySelector('#stMainContent');

    const PAGE_KEYS = ['mockups', 'documents', 'workflows', 'generate-workflows', 'project-layers', 'issues', 'test-generator', 'git-changes', 'ai-console'];

    const [configs, ...mappings] = await Promise.all([
      window.db.modelConfigs.list(),
      ...PAGE_KEYS.map(k => window.db.modelMapping.get(k)),
    ]);

    const mapped = {};
    PAGE_KEYS.forEach((k, i) => { mapped[k] = mappings[i]?.model_config_id ?? null; });

    const modelOptions = (key, f = {}) => {
      const allowed = configs.filter(c => !(f.excludeTypes || []).includes(c.type));
      if (configs.length === 0) return `<option value="">No models configured</option>`;
      if (allowed.length === 0) return `<option value="" disabled selected>No CLI models configured</option>`;
      const cur = mapped[key] != null ? String(mapped[key]) : '';
      return `<option value=""${cur === '' ? ' selected' : ''}>Use default</option>` +
        allowed.map(c => `<option value="${c.id}"${String(c.id) === cur ? ' selected' : ''}>${escHtml(c.label)}</option>`).join('');
    };

    const sections = [
      {
        label: 'Pages',
        features: [
          { key: 'mockups',         icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,                                                                               name: 'Mockups' },
          { key: 'documents',       icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,                                                  name: 'Documents' },
          { key: 'workflows',       icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,                                                                name: 'Workflows' },
          { key: 'generate-workflows', icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>`, name: 'Generate Workflows' },
          { key: 'project-layers',   icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,                                       name: 'Layers' },
        ],
      },
      {
        label: 'Quality',
        features: [
          { key: 'issues',          icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,                                          name: 'Issues' },
          { key: 'test-generator',  icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`, name: 'Unit Test Generator' },
        ],
      },
      {
        label: 'Git',
        features: [
          { key: 'git-changes',     icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 9v3a6 6 0 0 0 6 6h3"/></svg>`,                                                            name: 'Git Changes', disabled: true, note: 'Feature will be enabled soon...' },
        ],
      },
      {
        label: 'Tools',
        features: [
          { key: 'ai-console',      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,                                                                                name: 'AI Chat' },
        ],
      },
    ];

    main.innerHTML = `
      <div class="st-content-title">Model Mapping</div>
      <div class="st-content-sub">Assign a specific AI model to each feature — overrides the global default</div>

      ${sections.map(s => `
        <div class="st-mapping-section">
          <div class="st-section-label">${s.label}</div>
          <div class="st-mapping-list">
            ${s.features.map(f => `
              <div class="st-mapping-row">
                <span class="st-mapping-row__icon">${f.icon}</span>
                <span class="st-mapping-row__name">${escHtml(f.name)}${f.note ? ` <span class="st-form__hint">(${escHtml(f.note)})</span>` : ''}</span>
                <select class="st-form__select st-mapping-row__select" data-key="${f.key}"${(configs.length === 0 || f.disabled || (f.excludeTypes && configs.length > 0 && configs.filter(c => !(f.excludeTypes).includes(c.type)).length === 0)) ? ' disabled' : ''}>
                  ${modelOptions(f.key, f)}
                </select>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    `;

    main.querySelectorAll('.st-mapping-row__select').forEach(sel => {
      sel.addEventListener('change', () => {
        window.db.modelMapping.set(sel.dataset.key, Number(sel.value) || null);
      });
    });
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
  // Notifications — Telegram
  // ----------------------------------------------------------------
  async _renderNotifications() {
    const main   = this.container.querySelector('#stMainContent');
    const saved  = await window.app.telegram.get();

    main.innerHTML = `
      <div class="st-content-title">Notifications</div>
      <div class="st-content-sub">Send alerts and updates to a Telegram chat when events occur in your projects</div>

      <div class="st-section-header">
        <div class="st-section-label">Telegram Bot</div>
      </div>
      <div class="st-cloud-form">
        <div class="st-form__row">
          <label class="st-form__label">Bot Token</label>
          <input class="st-form__input" id="tgBotToken" type="password"
            placeholder="${saved.botToken_enc ? '••••••••  (saved)' : '1234567890:ABCDefgh…'}"
            autocomplete="new-password"/>
          <span class="st-form__hint">
            Create a bot via <strong>@BotFather</strong> on Telegram and paste the token here.
            Stored encrypted on this device.
          </span>
        </div>
        <div class="st-form__row">
          <label class="st-form__label">Chat ID</label>
          <input class="st-form__input" id="tgChatId" type="text"
            placeholder="-100123456789"
            value="${escHtml(saved.chatId || '')}"/>
          <span class="st-form__hint">
            Your personal chat ID or a group/channel ID the bot has been added to.
          </span>
        </div>
        <div class="st-cloud-actions">
          <button class="st-add-btn" id="tgBtnTest">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Send Test Message
          </button>
          <button class="st-add-btn st-add-btn--primary" id="tgBtnSave">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            Save
          </button>
        </div>
        <span class="st-form__hint" id="tgHint" style="margin-top:6px;display:block"></span>
      </div>

      <div class="st-section-header" style="margin-top:28px">
        <div class="st-section-label">Active Triggers</div>
      </div>
      <div class="st-placeholder-sections">
        <div class="st-placeholder-card">
          <div class="st-placeholder-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
          <div class="st-placeholder-card__body">
            <div class="st-placeholder-card__title">Prompt Queue — Job Started</div>
            <div class="st-placeholder-card__desc">Sent when a queue item begins execution.</div>
          </div>
        </div>
        <div class="st-placeholder-card">
          <div class="st-placeholder-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <div class="st-placeholder-card__body">
            <div class="st-placeholder-card__title">Prompt Queue — Job Completed</div>
            <div class="st-placeholder-card__desc">Sent on successful completion with duration.</div>
          </div>
        </div>
        <div class="st-placeholder-card">
          <div class="st-placeholder-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div class="st-placeholder-card__body">
            <div class="st-placeholder-card__title">Prompt Queue — Job Failed</div>
            <div class="st-placeholder-card__desc">Sent when a queue item exits with an error.</div>
          </div>
        </div>
        <div class="st-placeholder-card">
          <div class="st-placeholder-card__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 3v8L4.5 17A2 2 0 0 0 6.4 20h11.2a2 2 0 0 0 1.9-3L16 11V3"/><line x1="8" y1="3" x2="16" y2="3"/><line x1="6" y1="15" x2="18" y2="15"/>
            </svg>
          </div>
          <div class="st-placeholder-card__body">
            <div class="st-placeholder-card__title">Test Runner — Run Finished</div>
            <div class="st-placeholder-card__desc">Sent after a test run with pass/fail counts and duration.</div>
          </div>
        </div>
      </div>
    `;

    const hint = main.querySelector('#tgHint');

    main.querySelector('#tgBtnSave').addEventListener('click', async () => {
      const botToken = main.querySelector('#tgBotToken').value.trim();
      const chatId   = main.querySelector('#tgChatId').value.trim();
      await window.app.telegram.set({ botToken, chatId });
      hint.textContent = 'Saved';
      hint.style.color = '';
      setTimeout(() => { hint.textContent = ''; }, 1500);
    });

    main.querySelector('#tgBtnTest').addEventListener('click', async () => {
      hint.textContent = 'Sending…';
      hint.style.color = '';
      const result = await window.app.telegram.test();
      if (result.ok) {
        hint.textContent = 'Message sent successfully';
        hint.style.color = 'var(--color-success, #4caf50)';
      } else {
        hint.textContent = result.error || 'Failed to send message';
        hint.style.color = 'var(--color-danger, #e53935)';
      }
      setTimeout(() => { hint.textContent = ''; hint.style.color = ''; }, 4000);
    });
  }

  // ----------------------------------------------------------------
  // Cloud Sync (placeholder)
  // ----------------------------------------------------------------
  async _renderCloudSync() {
    const main   = this.container.querySelector('#stMainContent');
    const saved  = await window.app.cloudSync.get();
    const prov   = saved.provider || 'neon';

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
            <option value="neon"      ${prov === 'neon'      ? 'selected' : ''}>Neon (Serverless PostgreSQL)</option>
            <option value="postgres"  ${prov === 'postgres'  ? 'selected' : ''}>PostgreSQL (self-hosted / on-premises)</option>
          </select>
          <span class="st-form__hint">
            Neon is a serverless PostgreSQL with a generous free tier. Self-hosted PostgreSQL is also supported.
            <a class="st-hint-link" id="csLearnMore" href="#">Open Neon docs</a>
          </span>
        </div>

        <!-- Neon fields -->
        <div id="csFieldsNeon">
          <div class="st-form__row">
            <label class="st-form__label">Connection String</label>
            <input class="st-form__input" id="csNeonConnStr" type="text"
              placeholder="postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require"
              value="${escHtml(saved.connectionString || '')}"/>
            <span class="st-form__hint">
              Copy from Neon Console → your project → Connection Details → Connection string.
              Password is extracted and stored encrypted on this device.
            </span>
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
      main.querySelector('#csFieldsNeon').style.display     = p === 'neon'     ? '' : 'none';
      main.querySelector('#csFieldsPostgres').style.display = p === 'postgres' ? '' : 'none';
    };

    applyProvider(prov);

    main.querySelector('#csProvider').addEventListener('change', e => applyProvider(e.target.value));

    main.querySelector('#csLearnMore').addEventListener('click', e => {
      e.preventDefault();
      window.shell?.openExternal?.('https://neon.tech/docs/connect/connect-from-any-app');
    });

    main.querySelector('#csBtnSave').addEventListener('click', async () => {
      const provider = main.querySelector('#csProvider').value;
      const hint     = main.querySelector('#csSaveHint');

      const data = { provider };

      if (provider === 'neon') {
        const raw = main.querySelector('#csNeonConnStr').value.trim();
        try {
          const u       = new URL(raw.replace(/^postgresql/, 'http'));
          data.host     = u.hostname;
          data.port     = u.port ? Number(u.port) : 5432;
          data.database = u.pathname.replace('/', '');
          data.username = u.username;
          data.ssl      = true;
          if (u.password) data.password = decodeURIComponent(u.password);
        } catch { /* malformed string — save raw and let user fix it */ }
        // store the string with credentials redacted so it can repopulate the field
        data.connectionString = raw.replace(/:\/\/([^:]+):[^@]+@/, '://$1:••••@');
      } else {
        const password = main.querySelector('#csPassword').value;
        data.host     = main.querySelector('#csPgHost').value.trim();
        data.port     = Number(main.querySelector('#csPgPort').value) || 5432;
        data.database = main.querySelector('#csPgDatabase').value.trim();
        data.username = main.querySelector('#csPgUsername').value.trim();
        data.ssl      = main.querySelector('#csPgSsl').checked;
        if (password) data.password = password;
      }

      await window.app.cloudSync.set(data);
      hint.textContent = 'Saved';
      setTimeout(() => { hint.textContent = ''; }, 1500);
    });
  }

  // ----------------------------------------------------------------
  // Templates (Mockup Screen Templates)
  // ----------------------------------------------------------------
  async _renderTemplates() {
    const main = this.container.querySelector('#stMainContent');
    const templates = await window.db.screenTemplates.list();

    const groups = {};
    templates.forEach(t => {
      const g = t.group_name || 'General';
      if (!groups[g]) groups[g] = [];
      groups[g].push(t);
    });

    const rows = templates.length === 0
      ? `<div class="st-model-empty">No templates yet. Click <strong>Add Template</strong> to create one.</div>`
      : Object.entries(groups).map(([g, items]) => `
          <div class="st-section-header" style="margin-top:16px">
            <div class="st-section-label">${escHtml(g)}</div>
          </div>
          <div class="st-model-list">
            ${items.map(t => `
              <div class="st-model-item st-model-item--clickable" data-tpl-id="${t.id}">
                <div class="st-model-item__info">
                  <div class="st-model-item__top">
                    <span class="st-model-item__label">${escHtml(t.name)}</span>
                  </div>
                  <div class="st-model-item__sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${escHtml((t.description || '').split('\n')[0])}
                  </div>
                </div>
                <div class="st-model-item__actions">
                  <button class="st-btn" data-tpl-action="edit" data-tpl-id="${t.id}" title="Edit">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M11 2l3 3-9 9H2v-3l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <button class="st-btn st-btn--delete" data-tpl-action="delete" data-tpl-id="${t.id}" title="Delete">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                      <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `).join('');

    main.innerHTML = `
      <div class="st-content-title">Screen Templates</div>
      <div class="st-content-sub">Manage templates used in the Mockups "New Screen" dialog</div>
      <div class="st-section-header">
        <div class="st-section-label">Templates</div>
        <button class="st-add-btn" id="stBtnAddTemplate">
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M7 1v12M1 7h12"/>
          </svg>
          Add Template
        </button>
      </div>
      ${rows}
    `;

    main.querySelector('#stBtnAddTemplate').addEventListener('click', () => this._openTemplateModal(null));

    main.querySelectorAll('.st-model-item--clickable[data-tpl-id]').forEach(card => {
      card.addEventListener('click', async () => {
        const t = await window.db.screenTemplates.get(Number(card.dataset.tplId));
        this._openTemplateModal(t);
      });
    });

    main.querySelectorAll('[data-tpl-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id     = Number(btn.dataset.tplId);
        const action = btn.dataset.tplAction;
        if (action === 'edit') {
          const t = await window.db.screenTemplates.get(id);
          this._openTemplateModal(t);
        } else if (action === 'delete') {
          await window.db.screenTemplates.delete(id);
          this._renderTemplates();
        }
      });
    });
  }

  _openTemplateModal(template) {
    document.querySelector('.st-overlay')?.remove();

    const isEdit = !!template;
    const overlay = document.createElement('div');
    overlay.className = 'st-overlay';
    overlay.innerHTML = `
      <div class="st-modal" style="max-width:680px;width:95vw;">
        <div class="st-modal__header">
          <span class="st-modal__title">${isEdit ? 'Edit Template' : 'Add Template'}</span>
          <button class="st-modal__close" id="stTplClose">&times;</button>
        </div>
        <div class="st-modal__body">
          <form id="stTplForm" autocomplete="off">
            <div class="st-form__row">
              <label class="st-form__label">Group *</label>
              <input class="st-form__input" id="stTplGroup" type="text"
                placeholder="e.g. Authentication, Dashboard &amp; Navigation…"
                value="${escHtml(template?.group_name || '')}"/>
            </div>
            <div class="st-form__row">
              <label class="st-form__label">Name *</label>
              <input class="st-form__input" id="stTplName" type="text"
                placeholder="e.g. Login / Sign In"
                value="${escHtml(template?.name || '')}"/>
            </div>
            <div class="st-form__row">
              <label class="st-form__label">Description <span style="font-weight:400;opacity:.6">(used as AI prompt)</span></label>
              <textarea class="st-form__input" id="stTplDesc" rows="14"
                style="resize:vertical;min-height:200px;font-family:monospace;font-size:12px;"
                placeholder="Describe the screen layout, components, and style…">${escHtml(template?.description || '')}</textarea>
            </div>
          </form>
        </div>
        <div class="st-modal__body" style="padding-top:0;padding-bottom:16px;">
          <div class="st-form__footer">
            <button type="button" class="st-form__cancel-btn" id="stTplCancel">Cancel</button>
            <button type="button" class="st-form__save-btn"   id="stTplSave">${isEdit ? 'Save changes' : 'Create'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('#stTplName').focus();

    const close = () => overlay.remove();
    overlay.querySelector('#stTplClose').addEventListener('click', close);
    overlay.querySelector('#stTplCancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('#stTplSave').addEventListener('click', async () => {
      const group_name  = overlay.querySelector('#stTplGroup').value.trim() || 'General';
      const name        = overlay.querySelector('#stTplName').value.trim();
      const description = overlay.querySelector('#stTplDesc').value;

      if (!name) { overlay.querySelector('#stTplName').focus(); return; }

      if (isEdit) {
        await window.db.screenTemplates.update({ id: template.id, group_name, name, description });
      } else {
        await window.db.screenTemplates.create({ group_name, name, description });
      }

      close();
      this._renderTemplates();
    });
  }

  // ----------------------------------------------------------------
  // Document Templates
  // ----------------------------------------------------------------
  async _renderDocumentTemplates() {
    const main = this.container.querySelector('#stMainContent');
    const templates = await window.db.documentTemplates.list();

    const groups = {};
    templates.forEach(t => {
      const g = t.group_name || 'General';
      if (!groups[g]) groups[g] = [];
      groups[g].push(t);
    });

    const rows = templates.length === 0
      ? `<div class="st-model-empty">No document templates yet. Click <strong>Add Template</strong> to create one.</div>`
      : Object.entries(groups).map(([g, items]) => `
          <div class="st-section-header" style="margin-top:16px">
            <div class="st-section-label">${escHtml(g)}</div>
          </div>
          <div class="st-model-list">
            ${items.map(t => `
              <div class="st-model-item st-model-item--clickable" data-dtpl-id="${t.id}">
                <div class="st-model-item__info">
                  <div class="st-model-item__top">
                    <span class="st-model-item__label">${escHtml(t.name)}</span>
                  </div>
                  <div class="st-model-item__sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${escHtml((t.description || '').split('\n')[0])}
                  </div>
                </div>
                <div class="st-model-item__actions">
                  <button class="st-btn" data-dtpl-action="edit" data-dtpl-id="${t.id}" title="Edit">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M11 2l3 3-9 9H2v-3l9-9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <button class="st-btn st-btn--delete" data-dtpl-action="delete" data-dtpl-id="${t.id}" title="Delete">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                      <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `).join('');

    main.innerHTML = `
      <div class="st-content-title">Document Templates</div>
      <div class="st-content-sub">Manage templates used when creating new project documents</div>
      <div class="st-section-header">
        <div class="st-section-label">Templates</div>
        <button class="st-add-btn" id="stBtnAddDocTemplate">
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M7 1v12M1 7h12"/>
          </svg>
          Add Template
        </button>
      </div>
      ${rows}
    `;

    main.querySelector('#stBtnAddDocTemplate').addEventListener('click', () => this._openDocumentTemplateModal(null));

    main.querySelectorAll('.st-model-item--clickable[data-dtpl-id]').forEach(card => {
      card.addEventListener('click', async () => {
        const t = await window.db.documentTemplates.get(Number(card.dataset.dtplId));
        this._openDocumentTemplateModal(t);
      });
    });

    main.querySelectorAll('[data-dtpl-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id     = Number(btn.dataset.dtplId);
        const action = btn.dataset.dtplAction;
        if (action === 'edit') {
          const t = await window.db.documentTemplates.get(id);
          this._openDocumentTemplateModal(t);
        } else if (action === 'delete') {
          await window.db.documentTemplates.delete(id);
          this._renderDocumentTemplates();
        }
      });
    });
  }

  _openDocumentTemplateModal(template) {
    document.querySelector('.st-overlay')?.remove();

    const isEdit = !!template;
    const overlay = document.createElement('div');
    overlay.className = 'st-overlay';
    overlay.innerHTML = `
      <div class="st-modal" style="max-width:680px;width:95vw;">
        <div class="st-modal__header">
          <span class="st-modal__title">${isEdit ? 'Edit Document Template' : 'Add Document Template'}</span>
          <button class="st-modal__close" id="stDtplClose">&times;</button>
        </div>
        <div class="st-modal__body">
          <form id="stDtplForm" autocomplete="off">
            <div class="st-form__row">
              <label class="st-form__label">Group *</label>
              <input class="st-form__input" id="stDtplGroup" type="text"
                placeholder="e.g. Technical, Business, Planning…"
                value="${escHtml(template?.group_name || '')}"/>
            </div>
            <div class="st-form__row">
              <label class="st-form__label">Name *</label>
              <input class="st-form__input" id="stDtplName" type="text"
                placeholder="e.g. Product Requirements Document"
                value="${escHtml(template?.name || '')}"/>
            </div>
            <div class="st-form__row">
              <label class="st-form__label">Description</label>
              <input class="st-form__input" id="stDtplDesc" type="text"
                placeholder="Brief description of this template's purpose"
                value="${escHtml(template?.description || '')}"/>
            </div>
            <div class="st-form__row">
              <label class="st-form__label">Template Content <span style="font-weight:400;opacity:.6">(pre-filled document body)</span></label>
              <textarea class="st-form__input" id="stDtplText" rows="14"
                style="resize:vertical;min-height:200px;font-family:monospace;font-size:12px;"
                placeholder="Enter the default document content (supports Markdown)…">${escHtml(template?.template_text || '')}</textarea>
            </div>
          </form>
        </div>
        <div class="st-modal__body" style="padding-top:0;padding-bottom:16px;">
          <div class="st-form__footer">
            <button type="button" class="st-form__cancel-btn" id="stDtplCancel">Cancel</button>
            <button type="button" class="st-form__save-btn" id="stDtplSave">${isEdit ? 'Save changes' : 'Create'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('#stDtplName').focus();

    const close = () => overlay.remove();
    overlay.querySelector('#stDtplClose').addEventListener('click', close);
    overlay.querySelector('#stDtplCancel').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('#stDtplSave').addEventListener('click', async () => {
      const group_name   = overlay.querySelector('#stDtplGroup').value.trim() || 'General';
      const name         = overlay.querySelector('#stDtplName').value.trim();
      const description  = overlay.querySelector('#stDtplDesc').value.trim();
      const template_text = overlay.querySelector('#stDtplText').value;

      if (!name) { overlay.querySelector('#stDtplName').focus(); return; }

      if (isEdit) {
        await window.db.documentTemplates.update({ id: template.id, group_name, name, description, template_text });
      } else {
        await window.db.documentTemplates.create({ group_name, name, description, template_text });
      }

      close();
      this._renderDocumentTemplates();
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
                ? `<div class="st-type-readonly">${config.type === 'cli' ? 'CLI' : config.type === 'ollama' ? 'Ollama' : config.type === 'anthropic' ? 'Anthropic' : 'API'}</div>`
                : `<div class="st-form__type-toggle">
                    <button type="button" class="st-type-btn active" data-type="cli">CLI</button>
                    <button type="button" class="st-type-btn" data-type="ollama">Ollama</button>
                    <button type="button" class="st-type-btn" data-type="api">API</button>
                    <button type="button" class="st-type-btn" data-type="anthropic">Anthropic</button>
                  </div>`
              }
              <input type="hidden" id="stFType" value="${config?.type || 'cli'}"/>
              <span class="st-type-hint" id="stFTypeHint"></span>
            </div>

            <div id="stFFieldsCli">
              <div class="st-form__row">
                <label class="st-form__label">Executable *</label>
                <input class="st-form__input" id="stFExecutable" type="text"
                  placeholder="claude"
                  value="${escHtml(config?.executable || '')}"/>
                <span class="st-form__hint">Binary name in PATH — known: claude, agy, aider, copilot</span>
              </div>
              <div class="st-form__row">
                <label class="st-form__label">Model *</label>
                <div class="st-input-row">
                  <input class="st-form__input" id="stFCliModel" type="text" list="stFCliModelList"
                    placeholder="e.g. claude-haiku-4-5, gemini-2.0-flash"
                    value="${escHtml(config?.type === 'cli' ? (config?.model_name || '') : '')}" autocomplete="off"/>
                  <datalist id="stFCliModelList"></datalist>
                  <button type="button" class="st-detect-btn" id="stFBtnFetchCliModels" style="display:none" title="Fetch installed Ollama models">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                    </svg>
                  </button>
                </div>
                <span class="st-form__hint" id="stFCliModelHint">Passed as --model &lt;value&gt; to the CLI</span>
                <span class="st-form__error" id="stFCliModelError" style="display:none">Model name is required</span>
              </div>
              <div class="st-form__row">
                <label class="st-form__label">CLI Command</label>
                <textarea class="st-form__input st-form__textarea" id="stFFlags"
                  placeholder="--model {{model}} '@{{prompt}}'"
                  rows="3"
                  spellcheck="false">${escHtml(config?.flags || '')}</textarea>
                <span class="st-form__hint" id="stFFlagsHint">Use <code>{{model}}</code> for model name, <code>{{prompt}}</code> for the prompt file path.</span>
              </div>
              <div class="st-form__row st-form__row--inline">
                <div>
                  <label class="st-form__label">Batch Flags</label>
                  <input class="st-form__input" id="stFBatchFlags" type="text"
                    placeholder="--print -c"
                    value="${escHtml(config?.batch_flags || '')}"
                    spellcheck="false"/>
                  <span class="st-form__hint">Prepended only for Run All (non-interactive)</span>
                </div>
                <div>
                  <label class="st-form__label">Skip Permissions Flag</label>
                  <input class="st-form__input" id="stFSkipPermsFlag" type="text"
                    placeholder="--dangerously-skip-permissions"
                    value="${escHtml(config?.skip_perms_flag || '')}"
                    spellcheck="false"/>
                  <span class="st-form__hint">Prepended when Skip Permissions is enabled</span>
                </div>
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

              <div class="st-form__row" style="margin-top:4px">
                <label class="st-form__check-label">
                  <input type="checkbox" id="stFUseDevflow" ${config?.use_devflow_agent ? 'checked' : ''}/>
                  Use Devflow Agent loop (agentic mode)
                </label>
                <span class="st-form__hint">Runs an autonomous coding loop instead of a single prompt.</span>
              </div>
            </div>

            <div id="stFFieldsApi" style="display:none">
              <div class="st-form__row">
                <label class="st-form__label">Base URL *</label>
                <input class="st-form__input" id="stFApiBaseUrl" type="text"
                  placeholder="https://api.openai.com/v1"
                  value="${escHtml(config?.type === 'api' ? (config?.base_url || '') : '')}"/>
                <span class="st-form__hint">OpenAI-compatible endpoint (e.g. OpenAI, Groq, Together, Azure OpenAI, Ollama /v1)</span>
              </div>
              <div class="st-form__row">
                <label class="st-form__label">API Key</label>
                <input class="st-form__input" id="stFApiKey" type="password"
                  placeholder="${config?.type === 'api' && config?.api_key ? '••••••••  (saved)' : 'sk-…'}"
                  autocomplete="new-password"/>
                <span class="st-form__hint">Stored as-is in the local database. Leave blank to keep existing key when editing.</span>
              </div>
              <div class="st-form__row">
                <label class="st-form__label">Model *</label>
                <input class="st-form__input" id="stFApiModel" type="text"
                  placeholder="e.g. gpt-4o, mistral-large-latest, llama-3.1-70b"
                  value="${escHtml(config?.type === 'api' ? (config?.model_name || '') : '')}"/>
                <span class="st-form__error" id="stFApiModelError" style="display:none">Model name is required</span>
              </div>
              <div class="st-form__row">
                <label class="st-form__label">Max Tokens</label>
                <input class="st-form__input" id="stFApiMaxTokens" type="number"
                  placeholder="4096"
                  value="${escHtml(config?.type === 'api' ? String(config?.max_tokens || '') : '')}"/>
                <span class="st-form__hint">Optional — leave blank for provider default</span>
              </div>
              <div class="st-form__row" style="margin-top:4px">
                <label class="st-form__check-label">
                  <input type="checkbox" id="stFUseDevflow" ${config?.use_devflow_agent ? 'checked' : ''}/>
                  Use Devflow Agent loop (agentic mode)
                </label>
                <span class="st-form__hint">Runs an autonomous coding loop instead of a single prompt.</span>
              </div>
            </div>

            <div id="stFFieldsAnthropic" style="display:none">
              <div class="st-form__row">
                <label class="st-form__label">API Key *</label>
                <input class="st-form__input" id="stFAnthropicKey" type="password"
                  placeholder="${config?.type === 'anthropic' && config?.api_key ? '••••••••  (saved)' : 'sk-ant-…'}"
                  autocomplete="new-password"/>
                <span class="st-form__hint">Your Anthropic API key. Stored locally in the database.</span>
              </div>
              <div class="st-form__row">
                <label class="st-form__label">Model *</label>
                <input class="st-form__input" id="stFAnthropicModel" type="text" list="stFAnthropicModelList"
                  placeholder="e.g. claude-sonnet-4-6, claude-haiku-4-5"
                  value="${escHtml(config?.type === 'anthropic' ? (config?.model_name || '') : '')}"
                  autocomplete="off"/>
                <datalist id="stFAnthropicModelList">
                  ${ANTHROPIC_MODELS.map(m => `<option value="${escHtml(m)}">`).join('')}
                </datalist>
                <span class="st-form__error" id="stFAnthropicModelError" style="display:none">Model name is required</span>
              </div>
              <div class="st-form__row">
                <label class="st-form__label">Max Tokens</label>
                <input class="st-form__input" id="stFAnthropicMaxTokens" type="number"
                  placeholder="8096"
                  value="${escHtml(config?.type === 'anthropic' ? String(config?.max_tokens || '') : '')}"/>
                <span class="st-form__hint">Optional — defaults to 8096 if blank</span>
              </div>
              <div class="st-form__row" style="margin-top:4px">
                <label class="st-form__check-label">
                  <input type="checkbox" id="stFUseDevflow" ${config?.use_devflow_agent ? 'checked' : ''}/>
                  Use Devflow Agent loop (agentic mode)
                </label>
                <span class="st-form__hint">Runs an autonomous coding loop instead of a single prompt.</span>
              </div>
            </div>

            <div id="stDevflowInstallRow" class="st-form__row" style="display:none; margin-top:4px">
              <div class="st-devflow-install">
                <span id="stDevflowInstallStatus" class="st-form__hint">Checking devflow command…</span>
                <button type="button" id="stDevflowInstallBtn" class="st-detect-btn" style="display:none; margin-left:8px">Install</button>
              </div>
              <pre id="stDevflowInstallLog" class="st-devflow-log" style="display:none"></pre>
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

    const TYPE_HINTS = {
      cli:        'Make sure to provide the Model and effort level correctly — wrong values will fall back to default models and burn tokens unexpectedly.',
      ollama:     'For effective responses use 70B+ models (e.g. llama3.3:70b, qwen2.5-coder:72b). Smaller models may produce incomplete or low-quality output.',
      api:        'Only OpenAI-compatible providers are supported: OpenAI, Groq, Mistral AI, Together AI, DeepSeek, Fireworks AI, OpenRouter, LM Studio, and others that expose a /chat/completions endpoint.',
      anthropic:  'Direct Anthropic API — no CLI overhead, supports prompt caching. Best for AI Edit confirm step, Generate Workflows, and other lightweight tasks.',
    };

    const applyType = type => {
      overlay.querySelector('#stFFieldsCli').style.display        = type === 'cli'        ? '' : 'none';
      overlay.querySelector('#stFFieldsOllama').style.display     = type === 'ollama'     ? '' : 'none';
      overlay.querySelector('#stFFieldsApi').style.display        = type === 'api'        ? '' : 'none';
      overlay.querySelector('#stFFieldsAnthropic').style.display  = type === 'anthropic'  ? '' : 'none';
      const hintEl = overlay.querySelector('#stFTypeHint');
      if (hintEl) {
        hintEl.textContent = TYPE_HINTS[type] || '';
        hintEl.className = `st-type-hint st-type-hint--${type}`;
      }
      if (type === 'ollama') loadOllamaModels();
    };

    applyType(config?.type || 'cli');

    const devflowCheckbox    = overlay.querySelector('#stFUseDevflow');
    const devflowInstallRow  = overlay.querySelector('#stDevflowInstallRow');
    const devflowInstallSt   = overlay.querySelector('#stDevflowInstallStatus');
    const devflowInstallBtn  = overlay.querySelector('#stDevflowInstallBtn');
    const devflowInstallLog  = overlay.querySelector('#stDevflowInstallLog');

    const checkDevflowInstall = async () => {
      if (!devflowInstallRow) return;
      devflowInstallSt.textContent = 'Checking devflow command…';
      devflowInstallBtn.style.display = 'none';
      devflowInstallLog.style.display = 'none';
      devflowInstallLog.textContent   = '';
      try {
        const { installed } = await window.agent.checkInstalled();
        if (installed) {
          devflowInstallSt.textContent = '✓ devflow command registered — usable in any terminal';
          devflowInstallSt.style.color = 'var(--color-success, #4caf50)';
          devflowInstallBtn.style.display = 'none';
        } else {
          devflowInstallSt.textContent = 'devflow command not found — app still works, but you can\'t run it from a terminal directly';
          devflowInstallSt.style.color = '';
          devflowInstallBtn.style.display = '';
        }
      } catch {
        devflowInstallSt.textContent = 'Could not check devflow status';
        devflowInstallSt.style.color = '';
      }
    };

    const toggleDevflowInstallRow = () => {
      const show = devflowCheckbox?.checked;
      if (devflowInstallRow) devflowInstallRow.style.display = show ? '' : 'none';
      if (show) checkDevflowInstall();
    };

    devflowCheckbox?.addEventListener('change', toggleDevflowInstallRow);
    toggleDevflowInstallRow(); // run once on modal open

    devflowInstallBtn?.addEventListener('click', async () => {
      devflowInstallBtn.disabled      = true;
      devflowInstallBtn.textContent   = 'Installing…';
      devflowInstallLog.style.display = '';
      devflowInstallLog.textContent   = '';
      window.agent.onInstallLog(({ text }) => {
        devflowInstallLog.textContent += text;
        devflowInstallLog.scrollTop    = devflowInstallLog.scrollHeight;
      });
      try {
        const { success } = await window.agent.install();
        if (success) {
          await checkDevflowInstall();
        } else {
          devflowInstallSt.textContent = 'Install failed — see log above';
          devflowInstallSt.style.color = 'var(--color-error, #f44336)';
        }
      } finally {
        window.agent.offInstallLog();
        devflowInstallBtn.disabled    = false;
        devflowInstallBtn.textContent = 'Install';
      }
    });

    overlay.querySelector('#stBtnDetect')?.addEventListener('click', loadOllamaModels);

    // CLI model suggestions — populate datalist based on executable
    const cliExeInput   = overlay.querySelector('#stFExecutable');
    const cliModelInput = overlay.querySelector('#stFCliModel');
    const cliModelList  = overlay.querySelector('#stFCliModelList');
    const cliModelHint  = overlay.querySelector('#stFCliModelHint');
    const cliModelError = overlay.querySelector('#stFCliModelError');
    const cliFetchBtn   = overlay.querySelector('#stFBtnFetchCliModels');
    const cliFlagsInput     = overlay.querySelector('#stFFlags');
    const cliBatchInput     = overlay.querySelector('#stFBatchFlags');
    const cliSkipPermsInput = overlay.querySelector('#stFSkipPermsFlag');

    const updateCliDefaults = (exe) => {
      const name = (exe || '').toLowerCase().trim();

      // Model suggestions
      if (cliModelList) cliModelList.innerHTML = '';
      if (cliFetchBtn)  cliFetchBtn.style.display = 'none';
      if (cliModelHint) {
        if (KNOWN_CLI_MODELS[name]) {
          KNOWN_CLI_MODELS[name].forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            cliModelList.appendChild(opt);
          });
          cliModelHint.textContent = `${KNOWN_CLI_MODELS[name].length} known ${name} models available as suggestions`;
        } else if (name === 'ollama') {
          cliFetchBtn.style.display = '';
          cliModelHint.textContent  = 'Click the refresh button to load your installed Ollama models';
        } else {
          cliModelHint.textContent = 'Passed as --model <value> to the CLI';
        }
      }

      const allKnownFlags      = Object.values(KNOWN_CLI_FLAGS);
      const allKnownBatch      = Object.values(KNOWN_CLI_BATCH_FLAGS);
      const allKnownSkipPerms  = Object.values(KNOWN_CLI_SKIP_PERMS_FLAGS);

      // Auto-fill CLI Command — only when empty or still holds a known default
      if (cliFlagsInput && KNOWN_CLI_FLAGS[name] !== undefined) {
        const cur = (cliFlagsInput.value || '').trim();
        if (!cur || allKnownFlags.includes(cur)) cliFlagsInput.value = KNOWN_CLI_FLAGS[name];
      }

      // Auto-fill Batch Flags
      if (cliBatchInput && KNOWN_CLI_BATCH_FLAGS[name] !== undefined) {
        const cur = (cliBatchInput.value || '').trim();
        if (!cur || allKnownBatch.includes(cur)) cliBatchInput.value = KNOWN_CLI_BATCH_FLAGS[name];
      }

      // Auto-fill Skip Permissions Flag
      if (cliSkipPermsInput && KNOWN_CLI_SKIP_PERMS_FLAGS[name] !== undefined) {
        const cur = (cliSkipPermsInput.value || '').trim();
        if (!cur || allKnownSkipPerms.includes(cur)) cliSkipPermsInput.value = KNOWN_CLI_SKIP_PERMS_FLAGS[name];
      }
    };

    if (cliExeInput) {
      cliExeInput.addEventListener('input', () => updateCliDefaults(cliExeInput.value));
      updateCliDefaults(config?.executable || '');
    }

    cliFetchBtn?.addEventListener('click', async () => {
      const orig = cliFetchBtn.innerHTML;
      cliFetchBtn.disabled = true;
      try {
        const models = await window.ollama.listModels('http://localhost:11434');
        if (cliModelList) cliModelList.innerHTML = '';
        (models || []).forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          cliModelList.appendChild(opt);
        });
        cliModelHint.textContent = `${models?.length || 0} Ollama models loaded — click the field to pick one`;
      } catch {
        cliModelHint.textContent = 'Could not reach Ollama at localhost:11434 — is it running?';
      } finally {
        cliFetchBtn.innerHTML  = orig;
        cliFetchBtn.disabled   = false;
      }
    });

    if (cliModelInput) {
      cliModelInput.addEventListener('input', () => { if (cliModelError) cliModelError.style.display = 'none'; });
    }

    overlay.querySelector('#stFAnthropicModel')
      ?.addEventListener('input', () => {
        overlay.querySelector('#stFAnthropicModelError').style.display = 'none';
      });

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
        const cliModel = overlay.querySelector('#stFCliModel')?.value.trim() || '';
        if (!cliModel) {
          const err = overlay.querySelector('#stFCliModelError');
          if (err) err.style.display = '';
          overlay.querySelector('#stFCliModel')?.focus();
          return;
        }
        data.executable      = overlay.querySelector('#stFExecutable')?.value.trim() || null;
        data.model_name      = cliModel;
        data.flags           = overlay.querySelector('#stFFlags')?.value.trim() || null;
        data.batch_flags     = overlay.querySelector('#stFBatchFlags')?.value.trim() || null;
        data.skip_perms_flag = overlay.querySelector('#stFSkipPermsFlag')?.value.trim() || null;
      } else if (type === 'ollama') {
        const manual = overlay.querySelector('#stFOllamaModelManual');
        const select = overlay.querySelector('#stFOllamaModelSelect');
        data.base_url            = overlay.querySelector('#stFBaseUrl')?.value.trim() || 'http://localhost:11434';
        data.model_name          = (manual.style.display !== 'none' ? manual.value.trim() : select.value) || null;
        data.use_devflow_agent   = overlay.querySelector('#stFUseDevflow')?.checked ? 1 : 0;
      } else if (type === 'api') {
        const apiModel = overlay.querySelector('#stFApiModel')?.value.trim() || '';
        if (!apiModel) {
          const err = overlay.querySelector('#stFApiModelError');
          if (err) err.style.display = '';
          overlay.querySelector('#stFApiModel')?.focus();
          return;
        }
        data.base_url          = overlay.querySelector('#stFApiBaseUrl')?.value.trim() || null;
        data.model_name        = apiModel;
        const rawKey           = overlay.querySelector('#stFApiKey')?.value.trim();
        if (rawKey) data.api_key = rawKey;
        const maxTok           = overlay.querySelector('#stFApiMaxTokens')?.value.trim();
        if (maxTok) data.max_tokens = Number(maxTok);
        data.use_devflow_agent = overlay.querySelector('#stFUseDevflow')?.checked ? 1 : 0;
      } else if (type === 'anthropic') {
        const anthModel = overlay.querySelector('#stFAnthropicModel')?.value.trim() || '';
        if (!anthModel) {
          const err = overlay.querySelector('#stFAnthropicModelError');
          if (err) err.style.display = '';
          overlay.querySelector('#stFAnthropicModel')?.focus();
          return;
        }
        data.model_name        = anthModel;
        const rawKey           = overlay.querySelector('#stFAnthropicKey')?.value.trim();
        if (rawKey) data.api_key = rawKey;
        const maxTok           = overlay.querySelector('#stFAnthropicMaxTokens')?.value.trim();
        if (maxTok) data.max_tokens = Number(maxTok);
        data.use_devflow_agent = overlay.querySelector('#stFUseDevflow')?.checked ? 1 : 0;
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
