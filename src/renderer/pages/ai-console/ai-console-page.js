import { injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme }    from '../../shared/theme-manager.js';

const TEMPLATES = [
  { id: 'refine-stories',  label: 'Refine user stories',    desc: 'Tighten acceptance criteria and surface missing edge cases for selected stories.' },
  { id: 'triage-issues',   label: 'Triage open issues',     desc: 'Given open issues and stories, suggest priority order and story linkage.' },
  { id: 'gen-test-cases',  label: 'Generate test cases',    desc: 'Produce test_steps and expected_result rows ready to save for a story.' },
  { id: 'review-prompts',  label: 'Review impl. prompts',   desc: 'Given a story and its prompts, suggest improvements to the implementation guidance.' },
  { id: 'update-tech-spec',label: 'Update tech spec',       desc: 'Draft updated document sections based on the current tech spec and recent story changes.' },
  { id: 'custom',          label: 'Custom prompt…',         desc: 'Write your own system instruction.' },
];

// Placeholder chat thread shown before wiring up real AI
const PLACEHOLDER_THREAD = [
  {
    role: 'assistant',
    text: 'Hello! I have access to your project context — features, user stories, open issues, and documents. What would you like to work on?',
    actions: [],
  },
  {
    role: 'user',
    text: 'Refine the acceptance criteria for the mockup generation stories and flag any gaps.',
  },
  {
    role: 'assistant',
    text: 'Based on the 3 mockup-related user stories I can see in context, here are the refined acceptance criteria and gaps I found:\n\n**Story: Generate screen from prompt**\n— Added: "The model label used must be persisted on the screen_design record."\n— Gap: No criteria for what happens when the AI returns invalid HTML.\n\n**Story: Edit screen with inline prompt**\n— Added: "The previous HTML version must be recoverable if the edit is rejected."\n\n**Story: Export screen as PDF**\n— Looks complete. No gaps found.',
    actions: ['Update story', 'Create issue', 'Save to doc'],
  },
  {
    role: 'user',
    text: 'Create issues for the two gaps you found.',
  },
  {
    role: 'assistant',
    text: 'Ready to create 2 issues:\n\n1. **Handle invalid HTML from AI** — severity: high, linked to "Generate screen from prompt"\n2. **Screen version recovery on rejected edit** — severity: medium, linked to "Edit screen with inline prompt"\n\nClick "Create issues" to add them to the issue tracker.',
    actions: ['Create issues', 'Queue as prompt'],
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

        <!-- Header -->
        <header class="aic-header">
          <button class="aic-header__back" id="aicBtnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <span class="aic-header__title">AI Console</span>

          <div class="aic-header__controls">
            <!-- Model selector -->
            <div class="aic-header__model-wrap">
              <svg class="aic-header__ctrl-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
              <select class="aic-select" id="aicModelSelect" disabled title="Model selection — coming soon">
                <option>Select model…</option>
              </select>
            </div>

            <!-- Template picker -->
            <div class="aic-header__tpl-wrap">
              <svg class="aic-header__ctrl-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/>
              </svg>
              <select class="aic-select" id="aicTemplateSelect" disabled title="Prompt templates — coming soon">
                <option value="">Templates…</option>
                ${TEMPLATES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
              </select>
            </div>

            <span class="aic-coming-soon-pill">Coming Soon</span>
          </div>
        </header>

        <!-- Body: chat + context panel -->
        <div class="aic-body">

          <!-- Chat column -->
          <div class="aic-chat">

            <!-- Thread -->
            <div class="aic-thread" id="aicThread">
              ${PLACEHOLDER_THREAD.map(m => this._messageBubble(m)).join('')}
            </div>

            <!-- Input bar -->
            <div class="aic-input-bar">
              <div class="aic-input-bar__inner">
                <textarea
                  class="aic-input-bar__textarea"
                  id="aicInput"
                  placeholder="Select context and a model above, then type a message…"
                  rows="2"
                  disabled
                ></textarea>
                <div class="aic-input-bar__actions">
                  <button class="aic-btn-ghost" id="aicBtnClear" disabled>Clear</button>
                  <button class="aic-btn-send" id="aicBtnSend" disabled>
                    Send
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                  </button>
                </div>
              </div>
              <p class="aic-input-bar__hint">AI responses are placeholder — wire up <code>window.app.chat</code> to enable live chat.</p>
            </div>

          </div>

          <!-- Context panel -->
          <aside class="aic-context">
            <div class="aic-context__heading">Context</div>
            <p class="aic-context__desc">Choose what project data is injected into the model's system prompt.</p>

            <div class="aic-context__slices">

              <label class="aic-slice">
                <input type="checkbox" class="aic-slice__check" disabled>
                <div class="aic-slice__info">
                  <span class="aic-slice__name">Project summary</span>
                  <span class="aic-slice__meta">Name, description, design template</span>
                </div>
              </label>

              <label class="aic-slice">
                <input type="checkbox" class="aic-slice__check" disabled>
                <div class="aic-slice__info">
                  <span class="aic-slice__name">Features</span>
                  <span class="aic-slice__meta aic-slice__meta--count" id="aicCtxFeatures">– features</span>
                </div>
              </label>

              <label class="aic-slice">
                <input type="checkbox" class="aic-slice__check" disabled>
                <div class="aic-slice__info">
                  <span class="aic-slice__name">User stories</span>
                  <span class="aic-slice__meta aic-slice__meta--count" id="aicCtxStories">– stories</span>
                </div>
              </label>

              <label class="aic-slice">
                <input type="checkbox" class="aic-slice__check" disabled>
                <div class="aic-slice__info">
                  <span class="aic-slice__name">Open issues</span>
                  <span class="aic-slice__meta aic-slice__meta--count" id="aicCtxIssues">– open</span>
                </div>
              </label>

              <label class="aic-slice">
                <input type="checkbox" class="aic-slice__check" disabled>
                <div class="aic-slice__info">
                  <span class="aic-slice__name">Last test run</span>
                  <span class="aic-slice__meta" id="aicCtxTests">passed / failed / skipped</span>
                </div>
              </label>

              <label class="aic-slice">
                <input type="checkbox" class="aic-slice__check" disabled>
                <div class="aic-slice__info">
                  <span class="aic-slice__name">Document</span>
                  <span class="aic-slice__meta" id="aicCtxDoc">Pick a document…</span>
                </div>
              </label>

            </div>

            <button class="aic-btn-build-ctx" disabled>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
              </svg>
              Build Context
            </button>

            <div class="aic-context__tokens">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span id="aicTokenCount">~0 tokens estimated</span>
            </div>

            <!-- Apply actions legend -->
            <div class="aic-context__heading" style="margin-top:20px;">Apply actions</div>
            <p class="aic-context__desc">After a response, inline buttons let you write AI output back to the project.</p>
            <div class="aic-actions-legend">
              <span class="aic-action-chip aic-action-chip--preview">Save to doc</span>
              <span class="aic-action-chip aic-action-chip--preview">Create issue</span>
              <span class="aic-action-chip aic-action-chip--preview">Update story</span>
              <span class="aic-action-chip aic-action-chip--preview">Queue prompt</span>
            </div>
          </aside>

        </div>
      </div>
    `;
  }

  _messageBubble(msg) {
    const isUser = msg.role === 'user';

    const actionsHtml = msg.actions && msg.actions.length
      ? `<div class="aic-msg__actions">${msg.actions.map(a =>
          `<button class="aic-action-chip" disabled>${a}</button>`
        ).join('')}</div>`
      : '';

    // Convert newlines and basic **bold** markdown for the preview text
    const formatted = msg.text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    return `
      <div class="aic-msg aic-msg--${msg.role}">
        <div class="aic-msg__avatar ${isUser ? 'aic-msg__avatar--user' : 'aic-msg__avatar--ai'}">
          ${isUser
            ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
            : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`
          }
        </div>
        <div class="aic-msg__body">
          <div class="aic-msg__bubble">${formatted}</div>
          ${actionsHtml}
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
  }
}
