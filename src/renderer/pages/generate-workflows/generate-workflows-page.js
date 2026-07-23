import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme }              from '../../shared/theme-manager.js';
import { ModelPicker }                   from '../../components/model-picker/model-picker.js';
import { ProjectSidebar }                from '../../components/project-sidebar/project-sidebar.js';

// ── Helper: derive a conventional Dart file path from a screen title ─────────
function toDartPath(screenTitle) {
  const slug = (screenTitle || 'screen')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return `lib/features/${slug}/presentation/pages/${slug}_page.dart`;
}

// ── Combined Prompt: UI Shell + All Feature Workflows in one pass ─────────────
// Generates everything for a screen in a single LLM call:
//   Workflow 1 (type "ui_shell"): static Dart page, no backend
//   Workflows 2+ (type "feature"): one per discrete feature, backend + Wire Up
const FULL_WORKFLOWS_PROMPT_TEMPLATE = (screenSection, docsSection, layersSection) => `You are an AI architect and Senior Flutter/backend developer generating a COMPLETE set of implementation workflows for AI-assisted development.

Output ALL workflows for this screen in ONE response — the UI Shell first, then one workflow per feature.

## Inputs:
- UI/UX Mockup (Functional description) — a model-generated bullet list of the screen's interactive elements and what each one does, with visually-identical controls disambiguated by context (full HTML is injected at runtime for the UI Shell layer)
- Project overview and manifest (YAML) — system layers, tech stack, conventions

${screenSection}

${docsSection}

════════════════════════════════════════════════════════════════
AVAILABLE PROJECT LAYERS  (use ONLY these exact names in every "layer" field)
════════════════════════════════════════════════════════════════
${layersSection}

Every "layer" field in every workflow object MUST exactly match one of these names.
Exception: Workflow 1 uses "UI"; every feature workflow ends with "Wire Up" then "Integration Build & Fix".
Where a layer lists a "Scaffold structure", every "inputs"/"outputs" file path for that layer MUST be placed inside one of those scaffold folders — do not invent new top-level folders when a matching scaffold folder already exists.

════════════════════════════════════════════════════════════════
UNIVERSAL RULES  (apply to every layer, every workflow)
════════════════════════════════════════════════════════════════
- Every "prompt" field MUST end with: "Run the build command and fix all compile errors before completing."
- Every "prompt" field MUST be ≤200 words — describe WHAT to build and WHICH files to touch.
  Never include: Dart code, class bodies, method implementations, numbered step-by-step code, or import statements.
- inputs: exact file paths from prior layers this layer depends on
- outputs: exact file paths this layer creates or modifies
- success_criteria must be testable AND written from a manual UI-verification standpoint — what a person can observe or do in the running app (e.g. "Tapping Sign In with valid credentials navigates to the Dashboard screen", "Entering an invalid email shows an inline error below the field"). No vague statements like "works correctly", and no implementation/technical checks (file exists, compiles, route registered) — those belong in the layer's own "prompt", not success_criteria.
- Do not generate unit tests or e2e tests
- Output the complete JSON array in one block — no prose between workflows

════════════════════════════════════════════════════════════════
WORKFLOW 1 — UI Shell  (workflow_type: "ui_shell")
════════════════════════════════════════════════════════════════
- Always the FIRST item in the output array
- Exactly ONE layer named "UI"
- Converts the HTML mockup to a complete static Flutter page — no state management, no backend, no real data
- Every interactive element: onPressed: () {} with a // TODO: wire-{action-name} comment

Dart file path convention:
  lib/features/{snake_case_screen_name}/presentation/pages/{snake_case_screen_name}_page.dart

UI layer "prompt" must also:
- State the exact target Dart file path using the convention above
- Reference the linked HTML screen design as the visual source — do NOT re-describe colors, padding, fonts, or widget layout (full HTML is auto-injected at runtime)
- List every interactive element and its exact // TODO: wire-{action-name} comment
- State the route path and that it must be registered in the app router
- Stay within 150 words

════════════════════════════════════════════════════════════════
WORKFLOWS 2+ — Feature Workflows  (workflow_type: "feature")
════════════════════════════════════════════════════════════════
- One workflow per discrete feature visible in the mockup
- No UI generation layer — Dart page is created by Workflow 1
- Layers ordered by dependency: Data Model → Repository → State Management → Wire Up
- SECOND-TO-LAST layer MUST be "Wire Up"
- LAST layer MUST be "Integration Build & Fix"

Wire Up layer "prompt" must also:
- Name the exact Dart page file to modify (the UI Shell output)
- Name the state class (BLoC / Cubit / Provider / Riverpod notifier) and its source file
- List each // TODO: wire-{action} comment to replace and the state event/method to call instead
- Specify how to handle loading, error, and success states (widget or navigation)
- State: do NOT change layout, colors, padding, or widget structure

Integration Build & Fix layer "prompt" must also:
- Describe running: flutter pub get, build_runner, flutter analyze, flutter build
- List specific things to verify: missing DI registrations, unresolved imports, env config
- State: do NOT change feature behaviour

Backend & Data layer "prompt" must also:
- Name exact files to create or modify
- Describe the Dart model: field names, types, serialization approach (json_serializable / freezed / manual)
- Describe the repository interface: method signatures as plain text (e.g. "Future<AppUser> signInWithGoogle()")
- State the storage contract: Firestore collection path + field names, or REST endpoint + shape, or local DB schema
- State the error/result type and how to register in DI (get_it / Riverpod / BLoC provider)

## Output format (JSON array — all workflows together):

\`\`\`json
[
  {
    "workflow_id": "ui-shell-{kebab-screen-name}",
    "workflow_type": "ui_shell",
    "feature": "{Screen Name} — UI Shell",
    "screenId": "{screen id}",
    "description": "Convert the HTML mockup to a complete static Flutter page with placeholder interactions",
    "success_criteria": [
      "Opening the screen shows every element from the mockup (fields, labels, buttons) with placeholder/static data",
      "Tapping each interactive element does nothing yet but does not crash or error",
      "Navigating to the screen's route from the app shows this page"
    ],
    "layers": [
      {
        "layer": "UI",
        "order": 1,
        "purpose": "Convert HTML mockup to a complete static Flutter Dart page",
        "inputs": ["HTML screen design", "project folder structure"],
        "outputs": ["lib/features/{name}/presentation/pages/{name}_page.dart"],
        "prompt": "..."
      }
    ]
  },
  {
    "workflow_id": "kebab-feature-name",
    "workflow_type": "feature",
    "feature": "Human readable feature name",
    "screenId": "{screen id}",
    "description": "What this feature does end-to-end",
    "success_criteria": ["what a person sees/can do in the app once this feature works", "another observable, manually-verifiable outcome"],
    "layers": [
      {
        "layer": "exact name from AVAILABLE PROJECT LAYERS above",
        "order": 1,
        "purpose": "...",
        "inputs": ["exact file paths from prior layers"],
        "outputs": ["exact file paths this layer creates or modifies"],
        "prompt": "..."
      }
    ]
  }
]
\`\`\`
`;


function extractTextPreview(html) {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Functional inventory: walk the mockup DOM and list interactive/semantic
// elements (tag, id/name, label, and action-relevant attributes) instead of
// flattening everything to prose. Plain text-stripping loses exactly the
// signal the LLM needs to plan workflows — whether something is a button vs
// a link vs a static label, what a field's type/placeholder is, form
// groupings, etc. This stays roughly as compact as the old stripped text but
// keeps that structure.
const FUNCTIONAL_TAGS = new Set([
  'button', 'a', 'input', 'select', 'textarea', 'option', 'form',
  'label', 'img', 'table', 'th', 'td',
]);

function elLabel(el) {
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (text) return text.slice(0, 80);
  return el.getAttribute('aria-label') || el.getAttribute('placeholder')
    || el.getAttribute('title') || el.getAttribute('alt') || '';
}

function elAttrs(el) {
  const tag = el.tagName.toLowerCase();
  const parts = [];
  const type = el.getAttribute('type');
  if (type) parts.push(`type=${type}`);
  if (tag === 'input' || tag === 'textarea') {
    const ph = el.getAttribute('placeholder');
    if (ph) parts.push(`placeholder="${ph}"`);
    if (el.hasAttribute('required')) parts.push('required');
    if (el.hasAttribute('disabled')) parts.push('disabled');
    if (el.hasAttribute('checked')) parts.push('checked');
  }
  if (tag === 'a') {
    const href = el.getAttribute('href');
    if (href) parts.push(`href=${href}`);
  }
  if (tag === 'button' && el.hasAttribute('disabled')) parts.push('disabled');
  const dataAttrs = Array.from(el.attributes)
    .filter(a => a.name.startsWith('data-'))
    .map(a => `${a.name}=${a.value}`);
  parts.push(...dataAttrs);
  return parts;
}

function extractFunctionalInventory(html) {
  if (!html) return '';

  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style, script').forEach(n => n.remove());

  const lines = [];
  const forms = new Map(); // form element -> index, for grouping labels

  const walk = (el, formCtx) => {
    const tag = el.tagName ? el.tagName.toLowerCase() : null;
    let nextFormCtx = formCtx;

    if (tag === 'form') {
      const idx = forms.size + 1;
      forms.set(el, idx);
      nextFormCtx = idx;
      const name = el.getAttribute('id') || el.getAttribute('name') || `form-${idx}`;
      lines.push(`- form#${name}${formCtx ? ` (nested in form-${formCtx})` : ''}`);
    } else if (FUNCTIONAL_TAGS.has(tag)) {
      const id = el.getAttribute('id') || el.getAttribute('name');
      const label = elLabel(el);
      const attrs = elAttrs(el);
      const idPart = id ? `#${id}` : '';
      const labelPart = label ? ` "${label}"` : '';
      const attrPart = attrs.length ? ` (${attrs.join(', ')})` : '';
      const ctxPart = formCtx ? ` [in form-${formCtx}]` : '';
      lines.push(`- ${tag}${idPart}${labelPart}${attrPart}${ctxPart}`);
    }

    // Skip descending into elements whose full text we already captured as a label
    // (e.g. don't re-list a <span> inside a <button>).
    if (tag === 'button' || tag === 'a' || tag === 'option' || tag === 'label') return;

    for (const child of el.children) walk(child, nextFormCtx);
  };

  const body = doc.body;
  if (body) {
    for (const child of body.children) walk(child, null);
  }

  return lines.join('\n');
}

// ── Model-based functional analysis ──────────────────────────────────────
// The DOM inventory above can't disambiguate visually-identical controls
// (e.g. a column of icon-only "edit" buttons in a list all render as
// `button "edit"`), because the semantics live in surrounding context a
// person would read, not in any attribute. A small model call reasons about
// the raw HTML instead and returns a plain bullet list distinguishing them.
const SCREEN_ANALYSIS_PROMPT_TEMPLATE = (html) => `You are analyzing a UI mockup screen (raw HTML below, including any <script>) to describe its functionality for a developer who will implement it.

Output ONLY a flat bullet list — no prose, no headers, no markdown fences. Cover BOTH of the following categories; do not limit yourself to clickable controls:

1. Interactive controls — every button, link, input, toggle, etc.
   - When multiple elements look identical (e.g. several icon-only "edit" or "delete" buttons in a list), disambiguate each one using its surrounding context — which row/item it belongs to, nearby text, position, or data attributes. Never output the same bare label twice without context.
   - Describe WHAT each element does functionally (e.g. "Edit button — opens edit form for the 'Groceries' expense row"), not just its visual label.
   - Note field types and constraints for inputs (e.g. required, placeholder, validation-looking patterns).
2. Non-interactive data displays that still need to be built — summary/total cards, charts/graphs, computed or aggregated values, badges, progress indicators. These often have empty containers in the static markup that get populated by inline <script> at runtime (e.g. a chart div filled in by a JS loop) — read the <script> to describe what data they render and how (e.g. "Daily Spending chart — bar chart of each day's total spend for the selected month, peak day highlighted with a tooltip showing its amount").

Only skip elements that are truly decorative with no data or meaning (backgrounds, spacer divs, dividers). A card or chart that shows real data is NOT decorative even if nothing on it is clickable.

Keep each bullet on one line, under ~30 words.

HTML:
${html}`;

function providerFamily(model) {
  const s = `${model?.executable || ''} ${model?.model_name || ''} ${model?.label || ''}`.toLowerCase();
  if (s.includes('claude') || s.includes('anthropic')) return 'anthropic';
  if (s.includes('gemini')) return 'gemini';
  if (s.includes('gpt') || s.includes('openai')) return 'openai';
  if (s.includes('grok')) return 'grok';
  if (s.includes('llama') || s.includes('ollama')) return 'ollama';
  return null;
}

// Picks a model for the screen-analysis call using the explicit effort/purpose
// fields set in Settings -> AI Configuration, rather than guessing tier/purpose
// from the label text (which broke once two config names shared a keyword —
// e.g. every seeded "Gemini Flash *" config matches "flash" regardless of tier).
// Prefers a 'low' effort match from the SAME provider family as the main
// selected model, then any 'low' effort match, then falls back to the main
// model itself if nothing low-effort is configured at all. Among candidates,
// prefers 'general' purpose over 'coding' — this is a read-only analysis call,
// it doesn't need Code's full file/tool access.
function pickLightModel(modelConfigs, fallback) {
  const low = (modelConfigs || []).filter(m => m.is_active !== 0 && m.effort === 'low');
  if (low.length === 0) return fallback || null;

  const fallbackFamily = providerFamily(fallback);
  const pool = fallbackFamily ? low.filter(m => providerFamily(m) === fallbackFamily) : [];
  const candidates = pool.length ? pool : low;

  return candidates.find(m => m.purpose !== 'coding') || candidates[0];
}

function stripAnsi(str) {
  return str
    .replace(/\x1B\[[0-9;]*[mGKHFJA-Za-z]/g, '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '');
}

function parseWorkflowJson(text) {
  const clean = stripAnsi(text);

  const tryParse = (str) => {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0].feature === 'string') {
        return parsed;
      }
    } catch (_) {}
    return null;
  };

  // ── Pass 1: single fenced ```json block (happy path) ────────────────────────
  // Non-greedy match — only works when there are no nested fences inside strings.
  const fenced = clean.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) {
    const result = tryParse(fenced[1].trim());
    if (result) return result;
  }

  // ── Pass 2: outermost [ ... ] (single contiguous block) ─────────────────────
  const start = clean.indexOf('[');
  const end   = clean.lastIndexOf(']');
  if (start >= 0 && end > start) {
    const result = tryParse(clean.slice(start, end + 1));
    if (result) return result;
  }

  // ── Pass 3: LLM split into multiple ```json blocks — collect all complete
  //    workflow objects { "feature": ... } and reassemble into one array ────────
  const objects = [];
  const blockRe = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
  let m;
  while ((m = blockRe.exec(clean)) !== null) {
    const fragment = m[1].trim();
    // Each block may be a full array, a single object, or a partial object/array.
    // Try full array first, then wrap as array.
    const asArray = tryParse(fragment);
    if (asArray) { objects.push(...asArray); continue; }
    const asObj = (() => {
      try {
        // Find outermost { ... } in the fragment
        const os = fragment.indexOf('{');
        const oe = fragment.lastIndexOf('}');
        if (os >= 0 && oe > os) {
          const parsed = JSON.parse(fragment.slice(os, oe + 1));
          if (parsed && typeof parsed.feature === 'string') return parsed;
        }
      } catch (_) {}
      return null;
    })();
    if (asObj) objects.push(asObj);
  }
  if (objects.length > 0) return objects;

  return null;
}

function extractJsonCandidate(text) {
  const clean = stripAnsi(text);
  const start = clean.indexOf('[');
  const end   = clean.lastIndexOf(']');
  if (start >= 0 && end > start) return clean.slice(start, end + 1);
  return clean;
}

export class GenerateWorkflowsPage {
  constructor(container, params, router) {
    this.container         = container;
    this._router           = router;
    this._params           = params ?? {};
    this._projectId        = null;
    this._project          = null;
    this._modelConfig      = null;
    this._picker           = null;
    this._screens          = [];
    this._documents        = [];
    this._projectLayers    = [];
    this._selectedScreenId = null;
    this._selectedDocIds   = new Set();
    this._generating       = false;
    this._outputBuf        = '';
    this._parsedWorkflows  = null;
    this._startTime        = null;
    this._timerInt         = null;
    this._lastPrompt       = '';
    // Cache of model-generated functional descriptions per screen, keyed by screen id.
    // Invalidated when the screen's html_content no longer matches what was analyzed.
    this._screenAnalysisCache = new Map();
    this._analyzing           = false;
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  async mount() {
    injectCss('pages/generate-workflows/generate-workflows-page.css');
    injectCss('components/project-sidebar/project-sidebar.css');
    applyStoredTheme();
    this.container.innerHTML = '<div class="gw-loading">Loading…</div>';
    await this._init(this._params);
  }

  /**
   * Called by the persistent-page host when this route is activated again.
   * Opening the generator for a different project re-inits in place;
   * re-showing the same project's session just leaves the in-progress
   * generation (or its result) exactly as it was.
   */
  onResume(params) {
    if (params && params.projectId !== this._projectId) {
      this._init(params);
    }
  }

  /** Fully stops the running generation and tears down the page (explicit close, not a tab switch). */
  unmount() {
    if (this._generating) window.app.genWorkflowChat.cancel();
    if (this._analyzing)  window.app.screenAnalysisChat.cancel();
    if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
    if (this._picker)   { this._picker.unmount(); this._picker = null; }
    window.app.genWorkflowChat.offAll();
    window.app.screenAnalysisChat.offAll();
    if (this._tempDir) { window.app.deleteTempDir(this._tempDir); this._tempDir = null; }
    removeCss('pages/generate-workflows/generate-workflows-page.css');
    removeCss('components/project-sidebar/project-sidebar.css');
  }

  _handleClose() {
    this._router?.closePersistentRoute?.('generate-workflows');
    this._router?.navigateTo?.('workflows', { projectId: this._projectId });
  }

  // ----------------------------------------------------------------
  // Initialise from IPC
  // ----------------------------------------------------------------
  async _init({ projectId, modelConfig }) {
    window.app.genWorkflowChat.offAll();
    window.app.screenAnalysisChat.offAll();
    if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
    if (this._picker)   { this._picker.unmount(); this._picker = null; }

    this._projectId        = projectId;
    this._modelConfig      = modelConfig;
    this._selectedScreenId = null;
    this._selectedDocIds   = new Set();
    this._generating       = false;
    this._outputBuf        = '';
    this._parsedWorkflows  = null;
    this._lastPrompt       = '';
    this._screenAnalysisCache = new Map();
    this._analyzing           = false;

    const [project, screens, documents, projectLayers, mapping] = await Promise.all([
      window.db.projects.get(projectId),
      window.db.screenDesigns.list(projectId),
      window.db.documents.list(projectId),
      window.db.projectLayers.list(projectId),
      window.db.modelMapping.get('generate-workflows'),
    ]);
    this._project        = project        || null;
    this._screens        = screens        || [];
    this._documents      = documents      || [];
    this._projectLayers  = projectLayers  || [];

    this._render();

    this._picker = new ModelPicker({
      anchor:    this.container.querySelector('#gwModelPicker'),
      onSelect:  model => {
        const prevIsCli = (this._modelConfig?.type ?? 'cli') === 'cli';
        const nextIsCli = (model?.type ?? 'cli') === 'cli';
        this._modelConfig = model;
        // Rebuild prompt when switching between CLI (file refs) and API (inline text)
        if (prevIsCli !== nextIsCli) this._buildPrompt();
      },
      initialId: mapping?.model_config_id ?? modelConfig?.id ?? null,
    });
    await this._picker.reload();
  }

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------
  _render() {
    this.container.innerHTML = this._template();
    this._sidebar.bindEvents(this.container);
    this._sidebar.loadCounts(this.container);
    this._bindEvents();
    this._refreshGenerateBtn();
  }

  _template() {
    const name    = this._project?.name ?? 'Project';
    const initial = this._project?.name?.trim()[0]?.toUpperCase() ?? '?';
    this._sidebar = new ProjectSidebar({ projectId: this._projectId, router: this._router, activeRoute: 'workflows' });
    return `
      <div class="ph-project-shell">
        <header class="project-home__header">
          <button class="project-home__back" id="gwBtnClose" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div class="project-home__badge">
            <div class="project-home__badge-initial">${initial}</div>
            <span class="project-home__badge-name">${escHtml(name)}</span>
          </div>
          <span class="ph-header-page-chip">Generate Workflows</span>
        </header>

        <div class="ph-page-with-nav">
          ${this._sidebar.html()}
          <div class="gw-page">
            <header class="gw-header">
              <button class="gw-back-btn" id="gwBtnBack" aria-label="Back">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 12H5M12 5l-7 7 7 7"/>
                </svg>
              </button>
              <span class="gw-header__title">Generate Workflows</span>
              <div class="gw-header__model">
                <div id="gwModelPicker"></div>
              </div>
            </header>
            <div class="gw-body">
          <!-- ── Sidebar ── -->
          <aside class="gw-sidebar">
            <!-- Screens -->
            <div class="gw-sidebar__section" style="flex: 0 0 auto; max-height: 50%;">
              <div class="gw-sidebar__section-hd">
                <span class="gw-sidebar__section-label">Screens</span>
                <span class="gw-sidebar__section-count">${this._screens.length}</span>
              </div>
              <div class="gw-sidebar__list" id="gwScreensList">
                ${this._screensListHtml()}
              </div>
            </div>

            <!-- Documents -->
            <div class="gw-sidebar__section">
              <div class="gw-sidebar__section-hd">
                <span class="gw-sidebar__section-label">Documents</span>
                <span class="gw-sidebar__section-count">${this._documents.length}</span>
              </div>
              <div class="gw-sidebar__list" id="gwDocsList">
                ${this._docsListHtml()}
              </div>
            </div>

            <div class="gw-sidebar__footer">
              <button class="gw-generate-btn" id="gwBtnGenerate" disabled>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M3 2l12 6-12 6V2z" fill="currentColor"/>
                </svg>
                Generate
              </button>
            </div>
          </aside>

          <!-- ── Main panel ── -->
          <main class="gw-main">
            <!-- Prompt area (shown first) -->
            <div id="gwPromptArea">
              <div class="gw-panel-hd">
                <span class="gw-panel-hd__label">Prompt</span>
                <span class="gw-panel-hd__hint">Editable — select a screen to populate</span>
              </div>
              <div class="gw-analysis-status" id="gwAnalysisStatus" hidden></div>
              ${this._screens.length === 0
                ? '<div class="gw-prompt-empty">No screens found for this project.</div>'
                : `<textarea class="gw-prompt-textarea" id="gwPromptTextarea"
                     placeholder="Select a screen to populate the prompt…" spellcheck="false"></textarea>`}
            </div>

            <!-- Output area (shown while generating) -->
            <div id="gwOutputArea" hidden>
              <div class="gw-output-hd">
                <span class="gw-output-status gw-output-status--running" id="gwOutputStatus">Running</span>
                <span class="gw-output-label">AI Output</span>
                <span class="gw-elapsed" id="gwElapsed"></span>
                <button class="gw-stop-btn" id="gwBtnStop" hidden>Cancel</button>
              </div>
              <pre class="gw-output-pre" id="gwOutputPre"></pre>
              <div class="gw-output-footer" id="gwOutputFooter" hidden></div>
            </div>

            <!-- Preview area (shown after successful parse) -->
            <div id="gwPreviewArea" hidden>
              <div class="gw-preview-hd">
                <span class="gw-preview-title" id="gwPreviewTitle">Generated Workflows</span>
                <span class="gw-preview-usage" id="gwPreviewUsage"></span>
                <button class="gw-approve-btn" id="gwBtnApprove">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l4 4 6-6" stroke="currentColor" stroke-width="1.5"
                      stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Approve &amp; Add to Workflows
                </button>
              </div>
              <div class="gw-preview-body" id="gwPreviewBody"></div>
            </div>

            <!-- Fix area (shown when JSON parse fails, lets user correct output manually) -->
            <div id="gwFixArea" hidden>
              <div class="gw-panel-hd">
                <span class="gw-panel-hd__label">Fix JSON</span>
                <span class="gw-panel-hd__hint">Edit the extracted JSON below, then click Parse</span>
              </div>
              <div class="gw-fix-error" id="gwFixError" hidden></div>
              <textarea class="gw-fix-textarea" id="gwFixTextarea" spellcheck="false"
                placeholder="Paste or edit the workflow JSON array here…"></textarea>
              <div class="gw-fix-footer">
                <button class="gw-retry-btn" id="gwBtnFixBack">← Back to output</button>
                <button class="gw-fix-parse-btn" id="gwBtnFixParse">Parse &amp; Continue →</button>
              </div>
            </div>
          </main>
            </div>
          </div>
        </div>
      </div>`;
  }

  _screensListHtml() {
    if (!this._screens.length) {
      return '<div class="gw-sidebar__empty">No screens in this project.</div>';
    }
    return this._screens.map(s => `
      <div class="gw-item${s.id === this._selectedScreenId ? ' gw-item--selected' : ''}"
           data-screen-id="${s.id}">
        <div class="gw-item__indicator"></div>
        <div class="gw-item__text">
          <div class="gw-item__label">${escHtml(s.title)}</div>
          ${(s.description || s.html_content)
            ? `<div class="gw-item__desc">${escHtml(s.description || extractTextPreview(s.html_content))}</div>`
            : ''}
        </div>
      </div>`).join('');
  }

  _docsListHtml() {
    if (!this._documents.length) {
      return '<div class="gw-sidebar__empty">No documents in this project.</div>';
    }
    return this._documents.map(d => `
      <div class="gw-item${this._selectedDocIds.has(d.id) ? ' gw-item--checked' : ''}"
           data-doc-id="${d.id}">
        <div class="gw-item__check">
          <svg class="gw-item__check-mark" width="9" height="9" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5 4-4" stroke="currentColor" stroke-width="1.5"
              stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="gw-item__text">
          <div class="gw-item__label">${escHtml(d.title)}</div>
        </div>
      </div>`).join('');
  }

  // ----------------------------------------------------------------
  // Event binding
  // ----------------------------------------------------------------
  _bindEvents() {
    this.container.querySelector('#gwBtnClose')
      ?.addEventListener('click', () => this._handleClose());

    this.container.querySelector('#gwBtnBack')
      ?.addEventListener('click', () => this._handleClose());

    // Screen selection
    this.container.querySelectorAll('[data-screen-id]').forEach(el => {
      el.addEventListener('click', () => this._onScreenSelect(+el.dataset.screenId));
    });

    // Document toggling
    this.container.querySelectorAll('[data-doc-id]').forEach(el => {
      el.addEventListener('click', () => this._onDocToggle(+el.dataset.docId));
    });

    // Generate button
    this.container.querySelector('#gwBtnGenerate')
      ?.addEventListener('click', () => this._generate());

    // Stop button (wired after output shown)
    this.container.querySelector('#gwBtnStop')
      ?.addEventListener('click', () => this._stop());

    // Approve button
    this.container.querySelector('#gwBtnApprove')
      ?.addEventListener('click', () => this._approve());

    // Fix panel buttons
    this.container.querySelector('#gwBtnFixBack')
      ?.addEventListener('click', () => this._showPanel('output'));
    this.container.querySelector('#gwBtnFixParse')
      ?.addEventListener('click', () => this._tryManualParse());
  }

  // ----------------------------------------------------------------
  // Screen / doc selection
  // ----------------------------------------------------------------
  _onScreenSelect(id) {
    this._selectedScreenId = id;
    // Update UI highlights
    this.container.querySelectorAll('[data-screen-id]').forEach(el => {
      el.classList.toggle('gw-item--selected', +el.dataset.screenId === id);
    });
    // _analyzeScreen runs synchronously up to its first await, which is enough to
    // set this._analyzing (or short-circuit on a cache hit) BEFORE _buildPrompt
    // reads that flag — so the raw DOM inventory never flashes on screen while
    // waiting; _buildPrompt shows a placeholder instead until analysis finishes.
    this._analyzeScreen(id);
    this._buildPrompt();
    this._refreshGenerateBtn();
  }

  _onDocToggle(id) {
    if (this._selectedDocIds.has(id)) {
      this._selectedDocIds.delete(id);
    } else {
      this._selectedDocIds.add(id);
    }
    // Update UI
    this.container.querySelectorAll('[data-doc-id]').forEach(el => {
      el.classList.toggle('gw-item--checked', this._selectedDocIds.has(+el.dataset.docId));
    });
    this._buildPrompt();
    this._refreshGenerateBtn();
  }

  _refreshGenerateBtn() {
    const btn = this.container.querySelector('#gwBtnGenerate');
    if (btn) {
      const ok = this._selectedScreenId !== null && this._selectedDocIds.size > 0;
      btn.disabled = !ok || this._generating || this._analyzing;
    }
    // Lock the prompt textarea while analysis is in flight so edits typed during
    // that window can't get silently overwritten when the result comes back.
    const textarea = this.container.querySelector('#gwPromptTextarea');
    if (textarea) {
      textarea.readOnly = this._analyzing;
      textarea.classList.toggle('gw-prompt-textarea--busy', this._analyzing);
    }
  }

  _setAnalysisStatus(text, isError = false) {
    const el = this.container.querySelector('#gwAnalysisStatus');
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
    el.classList.toggle('gw-analysis-status--error', !!isError);
  }

  // ----------------------------------------------------------------
  // Model-based functional analysis
  // ----------------------------------------------------------------
  async _analyzeScreen(id) {
    const screen = this._screens.find(s => s.id === id);
    if (!screen || !screen.html_content) return;

    const cached = this._screenAnalysisCache.get(id);
    if (cached && cached.html === screen.html_content) return; // already have a fresh result

    this._analyzing = true;
    this._setAnalysisStatus('Analyzing screen functionality…');
    this._refreshGenerateBtn();

    let modelConfigs = [];
    try {
      modelConfigs = await window.db.modelConfigs.list();
    } catch (_) { /* fall through to fallback model */ }
    const model = pickLightModel(modelConfigs, this._modelConfig);

    if (!model) {
      this._analyzing = false;
      this._setAnalysisStatus('');
      this._buildPrompt(); // falls back to the static DOM inventory
      this._refreshGenerateBtn();
      return;
    }

    // Clear any listener from a previous (possibly still in-flight) analysis call
    // before registering this one — avoids stacking listeners if the user
    // switches screens faster than an analysis completes.
    window.app.screenAnalysisChat.offAll();
    window.app.screenAnalysisChat.onDone(({ raw, error }) => {
      window.app.screenAnalysisChat.offAll();
      this._analyzing = false;

      // Stale guard — user may have selected a different screen while this ran.
      if (this._selectedScreenId !== id) { this._refreshGenerateBtn(); return; }

      if (error || !raw || !raw.trim()) {
        this._setAnalysisStatus('Automatic analysis failed — using basic extraction.', true);
        setTimeout(() => this._setAnalysisStatus(''), 4000);
      } else {
        this._screenAnalysisCache.set(id, { html: screen.html_content, text: raw.trim() });
        this._setAnalysisStatus('');
      }
      // Rebuild on both success (uses the fresh cache entry) and failure
      // (falls back to the static DOM inventory) — never leave stale text behind.
      this._buildPrompt();
      this._refreshGenerateBtn();
    });

    window.app.screenAnalysisChat.generate({
      prompt: SCREEN_ANALYSIS_PROMPT_TEMPLATE(screen.html_content),
      model,
    });
  }

  // ----------------------------------------------------------------
  // Prompt construction
  // ----------------------------------------------------------------
  async _buildPrompt() {
    const textarea = this.container.querySelector('#gwPromptTextarea');
    if (!textarea) return;

    if (!this._selectedScreenId) {
      textarea.value = '';
      return;
    }

    const screen = this._screens.find(s => s.id === this._selectedScreenId);
    if (!screen) return;

    const selectedDocs = this._documents.filter(d => this._selectedDocIds.has(d.id));

    let screenSection = '';
    let docsSection   = '';

    // Prefer the model-generated functional description (disambiguates repeated
    // controls like a column of icon-only "edit" buttons by context) when a fresh
    // one has been analyzed for this screen's current HTML. While analysis is still
    // running, show a placeholder rather than the raw DOM inventory — that inventory
    // is a last-resort fallback only, used when analysis has actually failed. Full
    // HTML is injected by the runner at execution time for the UI Shell layer.
    const cached = this._screenAnalysisCache.get(screen.id);
    let screenText;
    if (cached && cached.html === screen.html_content) {
      screenText = cached.text;
    } else if (this._analyzing) {
      screenText = '(Analyzing screen functionality — this will populate automatically once done…)';
    } else {
      screenText = extractFunctionalInventory(screen.html_content || '');
    }

    // Embed the inventory directly rather than writing it to a separate temp file
    // and pointing at it with "See file: <path>" — CLI configs for this page run
    // with Read (and other tools) disallowed, so the model has no way to open a
    // referenced file; the content has to already be inside the one prompt it's given.
    screenSection = `## UI/UX Mockup (Screen: "${screen.title}"):\n${screenText || '(no screen content)'}`;
    if (selectedDocs.length > 0) {
      const docLines = selectedDocs.map(d => `### ${d.title}\n${d.content || '(empty)'}`).join('\n\n');
      docsSection = `## Documents:\n${docLines}`;
    } else {
      docsSection = `## Documents:\n(none selected)`;
    }

    const layersSection = this._projectLayers.length > 0
      ? this._projectLayers
          .map(pl => {
            const parts = [`- ${pl.name}`];
            if (pl.description) parts.push(pl.description);
            if (pl.folder_path) parts.push(`(${pl.folder_path})`);
            const header = parts.join('  |  ');

            let scaffoldLines = [];
            if (pl.scaffold_structure) {
              try {
                const parsed = JSON.parse(pl.scaffold_structure);
                if (Array.isArray(parsed)) scaffoldLines = parsed;
              } catch { /* not JSON — ignore */ }
            }
            if (scaffoldLines.length === 0) return header;

            const scaffoldBlock = scaffoldLines.map(p => `    ${p}`).join('\n');
            return `${header}\n  Scaffold structure:\n${scaffoldBlock}`;
          })
          .join('\n')
      : '(no project layers defined — add layers in Project Layers before generating)';

    const prompt = FULL_WORKFLOWS_PROMPT_TEMPLATE(screenSection, docsSection, layersSection);
    textarea.value = prompt;
  }

  // ----------------------------------------------------------------
  // Generate
  // ----------------------------------------------------------------
  async _generate() {
    const textarea = this.container.querySelector('#gwPromptTextarea');
    const prompt   = textarea?.value?.trim();

    if (!this._selectedScreenId) {
      this._showError('Select a screen before generating.');
      return;
    }
    if (!this._modelConfig) {
      this._showError('No AI model selected. Please select a model in the Workflows page before opening this window.');
      return;
    }
    if (!prompt) {
      this._showError('Prompt is empty. Select a screen and at least one document.');
      return;
    }

    this._lastPrompt   = prompt;
    this._generating   = true;
    this._outputBuf    = '';
    this._parsedWorkflows = null;

    // Show output panel
    this._showPanel('output');
    this.container.querySelector('#gwOutputPre').textContent = '';
    const footer = this.container.querySelector('#gwOutputFooter');
    if (footer) footer.hidden = true;
    const stopBtn = this.container.querySelector('#gwBtnStop');
    if (stopBtn) stopBtn.hidden = false;
    this._setStatus('running', 'Running');
    this._refreshGenerateBtn();
    this._startTimer();

    window.app.genWorkflowChat.onToken(({ text }) => {
      this._outputBuf += text;
      const pre = this.container.querySelector('#gwOutputPre');
      if (pre) { pre.textContent += text; pre.scrollTop = pre.scrollHeight; }
    });

    window.app.genWorkflowChat.onDone(({ raw, usage, error }) => {
      this._onDone(raw, usage, error);
    });

    window.app.genWorkflowChat.generate({ prompt, model: this._modelConfig });
  }

  _onDone(raw, usage, error) {
    window.app.genWorkflowChat.offAll();
    this._generating = false;
    this._stopTimer();
    if (this._tempDir) { window.app.deleteTempDir(this._tempDir); this._tempDir = null; }

    const elapsed = this._startTime
      ? Math.floor((Date.now() - this._startTime) / 1000)
      : 0;
    const elapsedStr = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

    const stopBtn = this.container.querySelector('#gwBtnStop');
    if (stopBtn) stopBtn.hidden = true;
    this._refreshGenerateBtn();

    // 'Could not extract HTML from response' is expected here — this page returns JSON, not HTML.
    // Treat it as non-fatal and fall through to JSON parsing.
    if (error && error !== 'Could not extract HTML from response') {
      this._setStatus('error', 'Error');
      this._showOutputFooter(`✗ ${error}`, false);
      this._addRetryBtn();
      return;
    }

    this._setStatus('done', 'Done');
    this._showOutputFooter(`✔ Completed in ${elapsedStr}`, true, usage);

    const rawContent = raw || this._outputBuf;
    const parsed = parseWorkflowJson(rawContent);
    if (!parsed) {
      this._showOutputFooter('✔ Done — but could not parse JSON from output.', false);
      this._addRetryBtn();
      this._addFixBtn(rawContent);
      return;
    }

    this._parsedWorkflows = parsed;
    this._renderPreview(parsed);

    const usageEl = this.container.querySelector('#gwPreviewUsage');
    if (usageEl && usage && (usage.input_tokens || usage.output_tokens)) {
      const parts = [
        `in: ${(usage.input_tokens || 0).toLocaleString()}`,
        `out: ${(usage.output_tokens || 0).toLocaleString()}`,
      ];
      if (usage.cache_read_input_tokens > 0)     parts.push(`${usage.cache_read_input_tokens.toLocaleString()} cached`);
      if (usage.cache_creation_input_tokens > 0) parts.push(`${usage.cache_creation_input_tokens.toLocaleString()} cache write`);
      usageEl.textContent = parts.join(' · ');
    } else if (usageEl) {
      usageEl.textContent = '';
    }

    this._showPanel('preview');
  }

  _stop() {
    window.app.genWorkflowChat.cancel();
    window.app.genWorkflowChat.offAll();
    this._generating = false;
    this._stopTimer();
    if (this._tempDir) { window.app.deleteTempDir(this._tempDir); this._tempDir = null; }
    const stopBtn = this.container.querySelector('#gwBtnStop');
    if (stopBtn) stopBtn.hidden = true;
    this._setStatus('error', 'Stopped');
    this._showOutputFooter('Stopped by user.', false);
    this._addRetryBtn();
    this._refreshGenerateBtn();
  }

  // ----------------------------------------------------------------
  // Preview
  // ----------------------------------------------------------------
  _renderPreview(workflows) {
    const title = this.container.querySelector('#gwPreviewTitle');
    if (title) title.textContent = `${workflows.length} workflow${workflows.length !== 1 ? 's' : ''} generated — review JSON below`;

    const body = this.container.querySelector('#gwPreviewBody');
    if (!body) return;

    body.innerHTML = `<pre class="gw-json-pre">${escHtml(JSON.stringify(workflows, null, 2))}</pre>`;
  }

  // ----------------------------------------------------------------
  // Approve
  // ----------------------------------------------------------------
  async _approve() {
    if (!this._parsedWorkflows?.length) return;

    const btn = this.container.querySelector('#gwBtnApprove');
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }

    let added = 0;
    const errors = [];
    // Derive the conventional dart file path for this screen (used to store on UI Shell approval)
    const selectedScreen   = this._screens.find(s => s.id === this._selectedScreenId);
    const derivedDartPath  = selectedScreen ? toDartPath(selectedScreen.title) : null;

    for (const w of this._parsedWorkflows) {
      try {
        const workflowType = w.workflow_type === 'ui_shell' ? 'ui_shell' : 'feature';
        const wf = await window.db.workflows.create({
          project_id:       this._projectId,
          feature:          w.feature || 'Untitled',
          description:      w.description || null,
          screen_design_id: this._selectedScreenId,
          workflow_type:    workflowType,
        });

        // For the UI Shell workflow: save the dart_file_path to the screen design record
        // so the workflow runner knows to reference it for subsequent feature workflows.
        if (workflowType === 'ui_shell' && this._selectedScreenId && derivedDartPath) {
          try {
            await window.db.screenDesigns.setDartFilePath({
              id:             this._selectedScreenId,
              dart_file_path: derivedDartPath,
            });
            if (selectedScreen) selectedScreen.dart_file_path = derivedDartPath;
          } catch (_) { /* non-fatal */ }
        }

        const criteria = Array.isArray(w.success_criteria) ? w.success_criteria : [];
        for (const c of criteria) {
          await window.db.successCriteria.create({ workflow_id: wf.id, description: c });
        }

        const layers = Array.isArray(w.layers) ? [...w.layers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [];
        for (const l of layers) {
          const layerName = l.layer || 'Layer';
          const matched   = this._projectLayers.find(
            pl => pl.name.toLowerCase() === layerName.toLowerCase()
          );
          await window.db.layers.create({
            workflow_id:      wf.id,
            layer:            layerName,
            project_layer_id: matched?.id ?? null,
            order_num:        l.order ?? 1,
            purpose:          l.purpose || '',
            inputs:           Array.isArray(l.inputs)  ? l.inputs  : [],
            outputs:          Array.isArray(l.outputs) ? l.outputs : [],
            prompt:           l.prompt || '',
          });
        }
        added++;
      } catch (err) {
        errors.push(`"${w.feature}": ${err.message}`);
      }
    }

    // Show success state
    const preview = this.container.querySelector('#gwPreviewArea');
    if (preview) {
      const errHtml = errors.length
        ? `<p style="color:#dc2626;font-size:12px;margin-top:8px">${errors.map(escHtml).join('<br>')}</p>`
        : '';
      preview.innerHTML = `
        <div class="gw-success">
          <svg class="gw-success__icon" width="40" height="40" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 12l3 3 5-5"/>
          </svg>
          <div class="gw-success__title">${added} workflow${added !== 1 ? 's' : ''} added successfully</div>
          <div class="gw-success__msg">Return to the Workflows page to view and run the generated workflows.</div>
          ${errHtml}
          <button class="gw-close-btn" id="gwBtnClose">Close Window</button>
        </div>`;
      preview.querySelector('#gwBtnClose')
        ?.addEventListener('click', () => this._handleClose());
    }
  }

  // ----------------------------------------------------------------
  // Panel switching helpers
  // ----------------------------------------------------------------
  _showPanel(which) {
    const panels = { prompt: '#gwPromptArea', output: '#gwOutputArea', preview: '#gwPreviewArea', fix: '#gwFixArea' };
    for (const [key, sel] of Object.entries(panels)) {
      const el = this.container.querySelector(sel);
      if (el) el.hidden = key !== which;
    }
  }

  _setStatus(type, text) {
    const el = this.container.querySelector('#gwOutputStatus');
    if (!el) return;
    el.className = `gw-output-status gw-output-status--${type}`;
    el.textContent = text;
  }

  _showOutputFooter(msg, success, usage) {
    const footer = this.container.querySelector('#gwOutputFooter');
    if (!footer) return;
    let usageHtml = '';
    if (usage && (usage.input_tokens || usage.output_tokens)) {
      const parts = [
        `in: ${(usage.input_tokens || 0).toLocaleString()}`,
        `out: ${(usage.output_tokens || 0).toLocaleString()}`,
      ];
      if (usage.cache_read_input_tokens > 0)     parts.push(`${usage.cache_read_input_tokens.toLocaleString()} cached`);
      if (usage.cache_creation_input_tokens > 0) parts.push(`${usage.cache_creation_input_tokens.toLocaleString()} cache write`);
      usageHtml = `<span class="gw-footer-usage">${escHtml(parts.join(' · '))}</span>`;
    }
    footer.innerHTML = `<span class="${success ? 'gw-footer-done' : 'gw-footer-error'}">${escHtml(msg)}</span>${usageHtml}`;
    footer.hidden = false;
  }

  _addRetryBtn() {
    const footer = this.container.querySelector('#gwOutputFooter');
    if (!footer) return;
    const btn = document.createElement('button');
    btn.className   = 'gw-retry-btn';
    btn.textContent = 'Edit Prompt & Retry';
    btn.addEventListener('click', () => {
      this._showPanel('prompt');
      const ta = this.container.querySelector('#gwPromptTextarea');
      if (ta && this._lastPrompt) ta.value = this._lastPrompt;
      this._refreshGenerateBtn();
    });
    footer.appendChild(btn);
  }

  _addFixBtn(rawContent) {
    const footer = this.container.querySelector('#gwOutputFooter');
    if (!footer) return;
    const btn = document.createElement('button');
    btn.className   = 'gw-fix-parse-btn';
    btn.textContent = 'Fix JSON manually';
    btn.addEventListener('click', () => this._showFixPanel(rawContent));
    footer.appendChild(btn);
  }

  _showFixPanel(rawContent) {
    const ta = this.container.querySelector('#gwFixTextarea');
    if (ta) ta.value = extractJsonCandidate(rawContent);
    const err = this.container.querySelector('#gwFixError');
    if (err) { err.textContent = ''; err.hidden = true; }
    this._showPanel('fix');
  }

  _tryManualParse() {
    const ta  = this.container.querySelector('#gwFixTextarea');
    const err = this.container.querySelector('#gwFixError');
    const text = ta?.value?.trim() || '';

    let parsed = null;
    let parseError = null;
    try {
      const candidate = JSON.parse(text);
      if (Array.isArray(candidate) && candidate.length > 0 && typeof candidate[0].feature === 'string') {
        parsed = candidate;
      } else {
        parseError = 'Parsed OK but result is not a workflow array — must be [{feature: "...", layers: [...]}]';
      }
    } catch (e) {
      parseError = e.message;
    }

    if (!parsed) {
      if (err) { err.textContent = parseError || 'Invalid JSON'; err.hidden = false; }
      return;
    }

    if (err) err.hidden = true;
    this._parsedWorkflows = parsed;
    this._renderPreview(parsed);
    this._showPanel('preview');
  }

  _showError(msg) {
    const existing = this.container.querySelector('.gw-error-banner');
    if (existing) existing.remove();
    const banner = document.createElement('div');
    banner.className   = 'gw-error-banner';
    banner.textContent = msg;
    const main = this.container.querySelector('.gw-main');
    if (main) main.prepend(banner);
    setTimeout(() => banner.remove(), 5000);
  }

  // ----------------------------------------------------------------
  // Timer
  // ----------------------------------------------------------------
  _startTimer() {
    this._startTime = Date.now();
    if (this._timerInt) clearInterval(this._timerInt);
    this._timerInt = setInterval(() => {
      const el = this.container.querySelector('#gwElapsed');
      if (el && this._startTime) {
        const s = Math.floor((Date.now() - this._startTime) / 1000);
        el.textContent = s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
      }
    }, 500);
  }

  _stopTimer() {
    if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
  }
}
