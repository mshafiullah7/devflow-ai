import { injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme }    from '../../shared/theme-manager.js';

const PROVIDERS = [
  {
    id: 'claude',
    name: 'Claude',
    vendor: 'Anthropic',
    description: 'Run Claude models (Opus, Sonnet, Haiku) via the Anthropic API or Claude Code CLI.',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
    badge: 'API',
    badgeClass: 'aic-badge--api',
    docsUrl: 'https://docs.anthropic.com',
    status: 'coming-soon',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    vendor: 'Microsoft',
    description: 'Integrate GitHub Copilot for AI-assisted code generation and review directly in the workflow.',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8.5 14.5s1 2 3.5 2 3.5-2 3.5-2"/><path d="M9 9h.01M15 9h.01"/></svg>`,
    badge: 'OAuth',
    badgeClass: 'aic-badge--oauth',
    docsUrl: 'https://docs.github.com/en/copilot',
    status: 'coming-soon',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    vendor: 'Ollama',
    description: 'Run local open-source models (Llama, Mistral, Gemma…) through Ollama with no data leaving your machine.',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8M12 8v8"/></svg>`,
    badge: 'Local',
    badgeClass: 'aic-badge--local',
    docsUrl: 'https://ollama.com/docs',
    status: 'coming-soon',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    vendor: 'OpenAI',
    description: 'Connect GPT-4o, o1, and other OpenAI models through the standard API.',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M12 8v8M8 12h8"/></svg>`,
    badge: 'API',
    badgeClass: 'aic-badge--api',
    docsUrl: 'https://platform.openai.com/docs',
    status: 'coming-soon',
  },
  {
    id: 'direct-api',
    name: 'Direct API',
    vendor: 'Custom',
    description: 'Call any OpenAI-compatible REST endpoint — Azure OpenAI, Groq, Together AI, LM Studio, and more.',
    icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
    badge: 'REST',
    badgeClass: 'aic-badge--rest',
    docsUrl: null,
    status: 'coming-soon',
  },
];

export class AiConsolePage {
  constructor(container, params, router) {
    this.container = container;
    this.router    = router;
    this.projectId = params.projectId;
  }

  async mount() {
    injectCss('pages/ai-console/ai-console-page.css');
    applyStoredTheme();
    this.container.innerHTML = this._template();
    this._bindEvents();
  }

  unmount() {
    removeCss('pages/ai-console/ai-console-page.css');
  }

  // ----------------------------------------------------------------
  // Template
  // ----------------------------------------------------------------
  _template() {
    return `
      <div class="aic-page">
        <header class="aic-header">
          <button class="aic-header__back" id="aicBtnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <span class="aic-header__title">AI Console</span>
        </header>

        <div class="aic-body">

          <div class="aic-hero">
            <div class="aic-hero__icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div>
              <h1 class="aic-hero__heading">AI Console</h1>
              <p class="aic-hero__sub">Run Claude, Copilot, Ollama, and custom APIs directly inside your project workflow. Choose a provider below to get started once this feature ships.</p>
            </div>
            <span class="aic-coming-soon-pill">Coming Soon</span>
          </div>

          <div class="aic-providers">
            ${PROVIDERS.map(p => this._providerCard(p)).join('')}
          </div>

          <div class="aic-footer-note">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Provider integrations are in development. Links open documentation in your browser.
          </div>

        </div>
      </div>
    `;
  }

  _providerCard(p) {
    const docsBtn = p.docsUrl
      ? `<button class="aic-card__docs-btn" data-url="${p.docsUrl}" title="Open documentation">
           Docs
           <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
         </button>`
      : '';

    return `
      <div class="aic-card">
        <div class="aic-card__icon">${p.icon}</div>
        <div class="aic-card__body">
          <div class="aic-card__top">
            <span class="aic-card__name">${p.name}</span>
            <span class="aic-badge ${p.badgeClass}">${p.badge}</span>
          </div>
          <span class="aic-card__vendor">${p.vendor}</span>
          <p class="aic-card__desc">${p.description}</p>
        </div>
        <div class="aic-card__actions">
          ${docsBtn}
          <button class="aic-card__connect-btn" disabled>Connect</button>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------
  _bindEvents() {
    this.container.querySelector('#aicBtnBack')
      .addEventListener('click', () => this.router.navigate('project-home', { projectId: this.projectId }));

    this.container.querySelectorAll('[data-url]').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        if (url) window.open(url, '_blank');
      });
    });
  }
}
