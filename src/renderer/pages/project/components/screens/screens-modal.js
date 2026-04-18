import { escHtml, injectCss, timeAgo } from '../../../../shared/helpers.js';

const TECH_STACKS = [
  { value: 'html',           label: 'Plain HTML / CSS',     mobile: false },
  { value: 'react-tailwind', label: 'React + Tailwind CSS', mobile: false },
  { value: 'vue-tailwind',   label: 'Vue 3 + Tailwind CSS', mobile: false },
  { value: 'flutter',        label: 'Flutter (Dart)',        mobile: true  },
  { value: 'react-native',   label: 'React Native',          mobile: true  },
];

const TECH_LABELS = Object.fromEntries(TECH_STACKS.map(t => [t.value, t.label]));

function techLabel(value) { return TECH_LABELS[value] || value; }
function isMobile(value)  { return TECH_STACKS.find(t => t.value === value)?.mobile ?? false; }

// ----------------------------------------------------------------
// Prompt builders
// ----------------------------------------------------------------
function buildScreenPrompt(description, techStack, projectDescription, outputFile, designTemplate) {
  const tech   = TECH_LABELS[techStack] || techStack;
  const mobile = isMobile(techStack);
  const ctx    = projectDescription ? `\nProject context: ${projectDescription}` : '';
  const save   = outputFile ? `\nWhen done, save the complete output to: ${outputFile}` : '';
  const design = designTemplate
    ? `\n\nDESIGN SYSTEM — you MUST follow this for every element (colours, fonts, spacing, components):\n${designTemplate}`
    : '';

  if (mobile) {
    return `You are an expert mobile UI developer. Generate complete, production-quality ${tech} code for the screen described below. Output ONLY the code — no explanation, no markdown fences.${ctx}${design}${save}\n\nScreen to design:\n${description}`;
  }

  return `You are an expert UI/UX developer. Generate a complete, self-contained HTML file for the screen described below using ${tech}.
Rules:
- Output ONLY valid HTML starting with <!DOCTYPE html>
- All CSS goes inside a <style> tag; CDN links (e.g. Tailwind CDN) are allowed
- Visually polished, modern design with realistic placeholder content
- Fully responsive
- No explanation, no markdown — raw HTML only${ctx}${design}${save}

Screen to design:
${description}`;
}

function buildExtractPrompt(techStack, screenTitle, htmlFilePath, outputFile) {
  const tech = TECH_LABELS[techStack] || techStack;
  const save = outputFile ? `\nWhen done, write the complete JSON array to: ${outputFile}` : '';
  return `You are an expert product manager and UI developer. Analyze the ${tech} UI screen design provided below and extract user stories.

Screen: "${screenTitle}"
Tech stack: ${tech}

Screen content at: ${htmlFilePath}
${save}
Extract every distinct user action, form, state, or interaction visible in this screen as a separate user story.

IMPORTANT: Output ONLY a raw JSON array — no markdown fences, no explanation, no extra text. Start with [ and end with ].

Each object MUST use EXACTLY these four field names — no other field names are accepted:
- "title": short action-oriented title (string)
- "description": "As a user, I want to [action] so that [benefit]." (string)
- "acceptance_criteria": all criteria as ONE string, each criterion on its own line starting with "- " (string, NOT an array)
- "prompt": detailed implementation prompt referencing exact design details from the UI — colours, typography, spacing, layout, component styles (string)

Example:
[
  {
    "title": "User clicks Get Started button",
    "description": "As a user, I want to click the Get Started button so that I can begin using the app.",
    "acceptance_criteria": "- Button is visible and labelled 'Get Started'\\n- Button triggers navigation to the next screen\\n- Hover and active states are visually distinct",
    "prompt": "Implement a pill-shaped button labelled 'Get Started' using ${tech}. Style: background linear-gradient(135deg,#11998e,#38ef7d), color white, border-radius 50px, padding 14px 36px, font-size 16px, font-weight 600. Add hover (translateY(-2px), deeper shadow) and active (translateY(0)) transitions."
  }
]`;
}

// Passes the prompt as an argument so the CLI opens its own TTY (required by Ink).
// The file path reference is embedded inside the prompt text.
function buildExtractPsCommand(instruction, model) {
  const exe      = model.executable || 'claude';
  const safeInst = instruction.replace(/'/g, "''");
  return `$p = @'\n${safeInst}\n'@\n${exe} $p`;
}

// ----------------------------------------------------------------
// Build the PowerShell command for a CLI model
// ----------------------------------------------------------------
function buildPsCommand(prompt, model) {
  const exe  = model.executable || 'claude';
  const safe = prompt.replace(/'/g, "''");
  // Pass prompt as argument (not piped) so Claude opens its interactive TUI
  return `$p = @'\n${safe}\n'@\n${exe} $p`;
}

// ----------------------------------------------------------------
// ScreensModal
// ----------------------------------------------------------------
export class ScreensModal {
  constructor({ projectId, getProject }) {
    this._projectId       = projectId;
    this._getProject      = getProject;
    this._overlay         = null;
    this._screens         = [];
    this._activeId        = null;
    this._activeTab       = 'preview';
    this._modelConfigs    = [];
    this._selectedModelId = null;
    this._designTemplate  = '';
  }

  mount() {
    injectCss('pages/project/components/screens/screens-modal.css?v=3');
  }

  _getSelectedModel() {
    if (this._selectedModelId) {
      const m = this._modelConfigs.find(c => c.id === this._selectedModelId);
      if (m) return m;
    }
    return this._modelConfigs.find(c => c.is_default) || this._modelConfigs[0] || null;
  }

  async show() {
    this._overlay?.remove();
    [this._screens, this._modelConfigs] = await Promise.all([
      window.db.screenDesigns.list(this._projectId),
      window.db.modelConfigs.list(),
    ]);
    this._designTemplate = this._getProject()?.design_template || '';
    this._activeId  = this._screens[0]?.id ?? null;
    this._activeTab = 'preview';
    // Default to first CLI model
    const defCli = this._modelConfigs.find(c => c.is_default && c.type !== 'anthropic')
                || this._modelConfigs.find(c => c.type !== 'anthropic')
                || this._modelConfigs[0];
    this._selectedModelId = defCli?.id ?? null;

    this._overlay = document.createElement('div');
    this._overlay.className = 'scr-overlay';
    this._overlay.innerHTML = this._shellTemplate();
    document.body.appendChild(this._overlay);

    this._bindShellEvents();

    if (this._activeId) this._selectScreen(this._activeId);
    else                this._showNewForm();
  }

  // ----------------------------------------------------------------
  // Shell
  // ----------------------------------------------------------------
  _shellTemplate() {
    return `
      <div class="scr-dialog">
        <div class="scr-dialog__header">
          <span class="scr-dialog__title">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.4"/>
              <path d="M4 6h5M4 9h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              <circle cx="12" cy="6" r="1.5" fill="currentColor" opacity=".5"/>
            </svg>
            Screen Designs
          </span>
          <button class="scr-dialog__close" id="scrClose" aria-label="Close">&times;</button>
        </div>
        <div class="scr-dialog__body">
          <aside class="scr-sidebar">
            <div class="scr-sidebar__toolbar">
              <button class="scr-sidebar__add" id="scrNewBtn">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
                New Screen
              </button>
            </div>
            <div class="scr-sidebar__list" id="scrList">${this._renderList()}</div>
          </aside>
          <div class="scr-main" id="scrMain"></div>
        </div>
      </div>
    `;
  }

  _renderList() {
    if (this._screens.length === 0) return '<p class="scr-sidebar__empty">No screens yet</p>';
    return this._screens.map(s => `
      <div class="scr-sidebar__item${s.id === this._activeId ? ' scr-sidebar__item--active' : ''}" data-id="${s.id}">
        <svg class="scr-sidebar__icon" width="11" height="11" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
        </svg>
        <div class="scr-sidebar__item-info">
          <span class="scr-sidebar__item-title">${escHtml(s.title)}</span>
          <span class="scr-sidebar__item-tech">${escHtml(techLabel(s.tech_stack))}</span>
        </div>
      </div>
    `).join('');
  }

  _refreshSidebar() {
    const list = this._overlay?.querySelector('#scrList');
    if (list) list.innerHTML = this._renderList();
    this._bindSidebarItems();
  }

  _bindSidebarItems() {
    this._overlay?.querySelectorAll('.scr-sidebar__item').forEach(el => {
      el.addEventListener('click', () => this._selectScreen(Number(el.dataset.id)));
    });
  }

  _bindShellEvents() {
    this._overlay.querySelector('#scrClose').addEventListener('click', () => this._tryClose());
    this._overlay.querySelector('#scrNewBtn').addEventListener('click', () => this._showNewForm());
    this._bindSidebarItems();
    this._escFn = (e) => {
      if (e.key === 'Escape') this._tryClose();
    };
    document.addEventListener('keydown', this._escFn);
  }

  _tryClose() {
    if (this._activeId === null && this._newFormHasData()) {
      this._showUnsavedDialog();
    } else {
      this._closeModal();
    }
  }

  _closeModal() {
    document.removeEventListener('keydown', this._escFn);
    this._overlay?.remove();
  }

  _newFormHasData() {
    const main = this._overlay?.querySelector('#scrMain');
    if (!main) return false;
    const title = main.querySelector('#scrTitle')?.value.trim() || '';
    const desc  = main.querySelector('#scrDescription')?.value.trim() || '';
    return title.length > 0 || desc.length > 0;
  }

  _showUnsavedDialog() {
    const existing = this._overlay.querySelector('.scr-unsaved-overlay');
    if (existing) return;

    const dlg = document.createElement('div');
    dlg.className = 'scr-unsaved-overlay';
    dlg.innerHTML = `
      <div class="scr-unsaved-dialog">
        <div class="scr-unsaved-dialog__icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 9v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
        </div>
        <h3 class="scr-unsaved-dialog__title">Unsaved Screen Design</h3>
        <p class="scr-unsaved-dialog__body">
          You have unsaved changes. What would you like to do?
        </p>
        <div class="scr-unsaved-dialog__actions">
          <button class="scr-btn scr-btn--primary" id="unsavedDraft">Save as Draft</button>
          <button class="scr-btn scr-btn--danger"   id="unsavedDiscard">Discard</button>
          <button class="scr-btn scr-btn--secondary" id="unsavedCancel">Cancel</button>
        </div>
      </div>
    `;

    this._overlay.appendChild(dlg);

    dlg.querySelector('#unsavedCancel').addEventListener('click',  () => dlg.remove());
    dlg.querySelector('#unsavedDiscard').addEventListener('click', () => { dlg.remove(); this._closeModal(); });
    dlg.querySelector('#unsavedDraft').addEventListener('click',   () => this._saveAsDraft(dlg));
  }

  // Saves form data (create or update), returns the screen record or null if validation fails.
  async _saveForm() {
    const main  = this._overlay?.querySelector('#scrMain');
    const title = main?.querySelector('#scrTitle')?.value.trim() || '';
    const desc  = main?.querySelector('#scrDescription')?.value.trim() || '';
    const stack = main?.querySelector('#scrTechStack')?.value || 'html';

    if (!title) { main?.querySelector('#scrTitle')?.focus(); return null; }

    if (this._editingId) {
      return window.db.screenDesigns.update({
        id:          this._editingId,
        title,
        description: desc,
        tech_stack:  stack,
        prompt_used: desc,
        model_used:  this._getSelectedModel()?.label || '',
      });
    }

    const screen = await window.db.screenDesigns.create({
      project_id:   this._projectId,
      title,
      description:  desc,
      tech_stack:   stack,
      html_content: '',
      prompt_used:  desc,
      model_used:   this._getSelectedModel()?.label || '',
    });
    this._editingId = screen.id;
    return screen;
  }

  // Save then navigate to viewer.
  async _saveAndView() {
    const screen = await this._saveForm();
    if (!screen) return;
    this._screens  = await window.db.screenDesigns.list(this._projectId);
    this._activeId = screen.id;
    this._refreshSidebar();
    this._showScreenViewer(screen);
  }

  async _saveAsDraft(dlg) {
    const btn = dlg.querySelector('#unsavedDraft');
    btn.disabled    = true;
    btn.textContent = 'Saving…';
    await this._saveForm();
    dlg.remove();
    this._closeModal();
  }

  // ----------------------------------------------------------------
  // New Screen form
  // ----------------------------------------------------------------
  _showNewForm(prefill = {}) {
    this._activeId  = null;
    this._editingId = prefill.editId ?? null;
    this._setActiveItem(null);

    const main = this._overlay.querySelector('#scrMain');
    main.innerHTML = `
      <div class="scr-form">
        <h2 class="scr-form__heading">${this._editingId ? 'Edit Screen Design' : 'New Screen Design'}</h2>

        <div class="scr-form__row">
          <label class="scr-form__label">Title *</label>
          <input class="scr-form__input" id="scrTitle" type="text"
            placeholder="e.g. Login Screen, Dashboard, Product List…"
            value="${escHtml(prefill.title || '')}" autocomplete="off"/>
        </div>

        <div class="scr-form__row">
          <label class="scr-form__label">Tech Stack</label>
          <select class="scr-form__select" id="scrTechStack">
            ${TECH_STACKS.map(t => `<option value="${t.value}"${prefill.tech_stack === t.value ? ' selected' : ''}>${t.label}</option>`).join('')}
          </select>
        </div>

        <div class="scr-form__row scr-form__row--grow">
          <label class="scr-form__label">Describe the screen *</label>
          <textarea class="scr-form__textarea" id="scrDescription"
            placeholder="Describe what this screen should contain: purpose, sections, components, user actions, visual style, etc.&#10;&#10;Example: A login screen with email and password fields, a Remember me checkbox, a Sign In button, and a Forgot password? link. Clean white card on a light gray background.">${escHtml(prefill.description || '')}</textarea>
        </div>

        <div class="scr-form__actions">
          <button class="scr-btn scr-btn--sm${this._designTemplate ? ' scr-btn--ds-active' : ''}" id="scrDesignBtnForm" title="Edit project design system">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/>
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            Design System
          </button>
          <select class="scr-model-select" id="scrModelSelect">
            ${this._modelConfigs.length === 0
              ? `<option value="">No models configured</option>`
              : this._modelConfigs.map(c =>
                  `<option value="${c.id}"${c.id === this._selectedModelId ? ' selected' : ''}>${escHtml(c.label)} [${c.type.toUpperCase()}]</option>`
                ).join('')
            }
          </select>
          <div class="scr-form__btns">
            <button class="scr-btn scr-btn--accent" id="scrSaveBtn">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M3 3h8l2 2v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                <rect x="5.5" y="3" width="4" height="3" rx=".5" stroke="currentColor" stroke-width="1.2"/>
                <rect x="4.5" y="9" width="7" height="4" rx=".5" stroke="currentColor" stroke-width="1.2"/>
              </svg>
              Save
            </button>
            <button class="scr-btn scr-btn--primary" id="scrRunBtn">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
                <path d="M5 6l3 2-3 2V6z" fill="currentColor"/>
                <path d="M10 7h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              </svg>
              Run in Terminal
            </button>
            <button class="scr-btn scr-btn--secondary" id="scrChooseFileBtn">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M2 4a1 1 0 011-1h3l1.5 2H13a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
              </svg>
              Choose File
            </button>
          </div>
        </div>

        <div class="scr-cmd-preview" id="scrCmdPreview" hidden>
          <div class="scr-cmd-preview__label">Command sent to terminal:</div>
          <pre class="scr-cmd-preview__code" id="scrCmdCode"></pre>
        </div>

        <div class="scr-ph-container" id="scrPromptHistory"></div>
      </div>
    `;

    main.querySelector('#scrModelSelect')?.addEventListener('change', (e) => {
      this._selectedModelId = Number(e.target.value) || null;
    });
    main.querySelector('#scrDesignBtnForm').addEventListener('click', () => {
      this._showDesignSystemPanel(() => this._showNewForm());
    });
    main.querySelector('#scrSaveBtn').addEventListener('click', () => this._saveAndView());
    main.querySelector('#scrRunBtn').addEventListener('click', () => this._runInTerminal());
    main.querySelector('#scrChooseFileBtn').addEventListener('click', () => this._chooseFile());
    this._loadPromptHistory();
  }

  async _saveToHistory(prompt) {
    if (!prompt) return;
    const existing = await window.db.screenPromptHistory.list(this._projectId);
    if (existing.some(e => e.prompt === prompt)) return;
    await window.db.screenPromptHistory.create({ project_id: this._projectId, prompt });
    this._loadPromptHistory();
  }

  async _loadPromptHistory() {
    const container = this._overlay?.querySelector('#scrPromptHistory');
    if (!container) return;
    const items = await window.db.screenPromptHistory.list(this._projectId);
    if (items.length === 0) { container.innerHTML = ''; return; }

    const descEl = () => this._overlay?.querySelector('#scrDescription');

    container.innerHTML = `
      <div class="scr-ph-header">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/>
          <path d="M8 5v3.5l2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Recent prompts
        <button class="scr-ph-delete-all" title="Clear all recent prompts" aria-label="Clear all">
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
            <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8M5.5 6v4M8.5 6v4"
              stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <div class="scr-ph-list">
        ${items.map(h => `
          <div class="scr-ph-item" data-id="${h.id}" title="${escHtml(h.prompt)}">
            <svg class="scr-ph-item__icon" width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M4 3l9 5-9 5V3z" fill="currentColor" opacity="0.6"/>
            </svg>
            <span class="scr-ph-item__text">${escHtml(h.prompt.length > 80 ? h.prompt.slice(0, 80) + '…' : h.prompt)}</span>
            <span class="scr-ph-item__time">${timeAgo(h.executed_at)}</span>
            <button class="scr-ph-item__delete" data-id="${h.id}" title="Remove" aria-label="Remove">
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8"
                  stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        `).join('')}
      </div>
    `;

    container.querySelectorAll('.scr-ph-item').forEach((el, i) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.scr-ph-item__delete')) return;
        const ta = descEl();
        if (ta) { ta.value = items[i].prompt; ta.focus(); }
      });
    });

    container.querySelectorAll('.scr-ph-item__delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.db.screenPromptHistory.delete(Number(btn.dataset.id));
        this._loadPromptHistory();
      });
    });

    container.querySelector('.scr-ph-delete-all').addEventListener('click', async () => {
      await window.db.screenPromptHistory.deleteAll(this._projectId);
      this._loadPromptHistory();
    });
  }

  async _runInTerminal() {
    const main  = this._overlay.querySelector('#scrMain');
    const title = main.querySelector('#scrTitle').value.trim();
    const desc  = main.querySelector('#scrDescription').value.trim();
    const stack = main.querySelector('#scrTechStack').value;

    if (!title) { main.querySelector('#scrTitle').focus(); return; }
    if (!desc)  { main.querySelector('#scrDescription').focus(); return; }

    const model = this._getSelectedModel();
    if (!model || model.type === 'anthropic' || !model.executable) {
      alert('Please select a CLI model (Claude CLI or Gemini CLI) from the model dropdown.');
      return;
    }

    // Save the record first so it exists in the sidebar before the terminal opens.
    await this._saveForm();
    this._screens = await window.db.screenDesigns.list(this._projectId);
    this._refreshSidebar();

    const project    = this._getProject();
    const screensDir = await window.app.screensDir(project?.name);
    const safeTitle  = title.replace(/[^a-z0-9_\-]/gi, '_');
    const outputFile = `${screensDir}\\${safeTitle}.html`;
    const prompt     = buildScreenPrompt(desc, stack, project?.description || '', outputFile, this._designTemplate);
    const cmd        = buildPsCommand(prompt, model);

    const cwd = project?.project_path || undefined;
    await window.db.terminal.openExternal({ command: cmd, cwd });
    await this._saveToHistory(desc);
  }

  async _chooseFile() {
    // Ensure a DB record exists before picking the file.
    if (!this._editingId) {
      const saved = await this._saveForm();
      if (!saved) return;
    }

    const result = await window.db.dialog.openFile({
      title:      'Choose Generated Screen File',
      extensions: ['html', 'htm', 'dart', 'js', 'jsx', 'tsx', '*'],
    });
    if (!result) return;

    const screen = await window.db.screenDesigns.update({
      id:           this._editingId,
      html_content: result.content,
    });
    this._editingId = null;

    this._screens  = await window.db.screenDesigns.list(this._projectId);
    this._activeId = screen.id;
    this._refreshSidebar();
    this._showScreenViewer(screen);
  }

  // ----------------------------------------------------------------
  // Screen viewer
  // ----------------------------------------------------------------
  async _selectScreen(id) {
    this._activeId  = id;
    this._activeTab = 'preview';
    this._setActiveItem(id);
    const screen = await window.db.screenDesigns.get(id);
    if (screen) this._showScreenViewer(screen);
  }

  _setActiveItem(id) {
    this._overlay?.querySelectorAll('.scr-sidebar__item').forEach(el => {
      el.classList.toggle('scr-sidebar__item--active', Number(el.dataset.id) === id);
    });
  }

  _showScreenViewer(screen) {
    const main   = this._overlay.querySelector('#scrMain');
    const mobile = isMobile(screen.tech_stack);

    main.innerHTML = `
      <div class="scr-viewer">
        <div class="scr-viewer__toolbar">
          <div class="scr-viewer__meta">
            <span class="scr-viewer__title">${escHtml(screen.title)}</span>
            <span class="scr-viewer__tech-badge">${escHtml(techLabel(screen.tech_stack))}</span>
          </div>
          <div class="scr-viewer__actions">
            <button class="scr-btn scr-btn--sm${this._designTemplate ? ' scr-btn--ds-active' : ''}" id="scrDesignBtn" title="Edit project design system">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/>
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
              Design System
            </button>
            ${!mobile ? `
            <div class="scr-viewer__tabs">
              <button class="scr-viewer__tab${this._activeTab === 'preview' ? ' scr-viewer__tab--active' : ''}" data-tab="preview">Preview</button>
              <button class="scr-viewer__tab${this._activeTab === 'code'    ? ' scr-viewer__tab--active' : ''}" data-tab="code">Code</button>
            </div>` : ''}
            <button class="scr-btn scr-btn--sm" id="scrRegenBtn">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 2.5a1.414 1.414 0 012 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Edit
            </button>
            <button class="scr-btn scr-btn--sm scr-btn--accent" id="scrExtractBtn">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M3 4h10M3 8h7M3 12h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                <path d="M12 10l2 2-2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Extract Stories
            </button>
            <button class="scr-btn scr-btn--sm scr-btn--danger" id="scrDeleteBtn" title="Delete screen">
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="scr-viewer__content" id="scrViewerContent">
          ${mobile
            ? `<pre class="scr-viewer__code-block"><code>${escHtml(screen.html_content)}</code></pre>`
            : `<iframe class="scr-viewer__iframe" id="scrPreviewFrame" sandbox="allow-scripts allow-same-origin"></iframe>`
          }
        </div>
      </div>
    `;

    if (!mobile) this._loadPreview(screen.html_content);
    this._bindViewerEvents(screen);
  }

  _loadPreview(html) {
    const frame = this._overlay?.querySelector('#scrPreviewFrame');
    if (!frame) return;
    frame.srcdoc = html;
  }

  _bindViewerEvents(screen) {
    const main = this._overlay.querySelector('#scrMain');

    // Tab switching
    main.querySelectorAll('.scr-viewer__tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this._activeTab = tab.dataset.tab;
        main.querySelectorAll('.scr-viewer__tab').forEach(t => t.classList.remove('scr-viewer__tab--active'));
        tab.classList.add('scr-viewer__tab--active');
        const content = main.querySelector('#scrViewerContent');
        if (this._activeTab === 'preview') {
          content.innerHTML = `<iframe class="scr-viewer__iframe" id="scrPreviewFrame" sandbox="allow-scripts allow-same-origin"></iframe>`;
          this._loadPreview(screen.html_content);
        } else {
          content.innerHTML = `<pre class="scr-viewer__code-block"><code>${escHtml(screen.html_content)}</code></pre>`;
        }
      });
    });

    // Edit — go back to form pre-filled with existing values, overwrite on save
    main.querySelector('#scrRegenBtn').addEventListener('click', () => {
      this._showNewForm({ title: screen.title, tech_stack: screen.tech_stack, description: screen.description || screen.prompt_used || '', editId: screen.id });
    });

    // Extract stories
    main.querySelector('#scrExtractBtn').addEventListener('click', () => this._showExtractDialog(screen));

    // Design System
    main.querySelector('#scrDesignBtn').addEventListener('click', () => {
      this._showDesignSystemPanel(() => this._showScreenViewer(screen));
    });

    // Delete
    main.querySelector('#scrDeleteBtn').addEventListener('click', async () => {
      if (!confirm(`Delete "${screen.title}"?`)) return;
      await window.db.screenDesigns.delete(screen.id);
      this._screens  = await window.db.screenDesigns.list(this._projectId);
      this._activeId = this._screens[0]?.id ?? null;
      this._refreshSidebar();
      if (this._activeId) this._selectScreen(this._activeId);
      else                this._showNewForm();
    });
  }

  // ----------------------------------------------------------------
  // Design System panel
  // ----------------------------------------------------------------
  _showDesignSystemPanel(onBack) {
    const EXAMPLES = [
      {
        label: 'Dark Web (HTML/CSS)',
        template:
`Color Palette:
- Primary: #6366f1
- Background: #0f1117
- Surface: #1a1d27
- Text primary: #f1f5f9
- Text secondary: #94a3b8
- Border: #2a2d3e
- Danger: #ef4444

Typography:
- Font family: 'Segoe UI', system-ui, sans-serif
- Heading: font-weight 600, font-size 24px
- Body: font-weight 400, font-size 14px, line-height 1.5

Components:
- Buttons: border-radius 8px, padding 8px 18px, font-weight 500
- Cards: border-radius 12px, border 1px solid #2a2d3e, background #1a1d27
- Inputs: border-radius 8px, background #1a1d27, border 1px solid #2a2d3e, color #f1f5f9
- Modals: border-radius 12px, background #1a1d27, box-shadow 0 4px 24px rgba(0,0,0,0.4)

Spacing:
- Base unit: 4px
- Common gaps: 8px, 12px, 16px, 24px
- Standard padding: 16px 20px`,
      },
      {
        label: 'Flutter / Material 3',
        template:
`Framework: Flutter (Dart) — Material Design 3

─── Color Scheme ───────────────────────────────────────
Primary:            #6366F1
PrimaryContainer:   #E0E7FF
Secondary:          #10B981
SecondaryContainer: #D1FAE5
Background:         #0F1117
Surface:            #1A1D27
SurfaceVariant:     #21253A
OnPrimary:          #FFFFFF
OnBackground:       #F1F5F9
OnSurface:          #94A3B8
Error:              #EF4444
OnError:            #FFFFFF
Outline:            #2A2D3E

─── Typography (TextTheme) ─────────────────────────────
Font family: 'Inter' with fallback to system-ui
displayLarge:   size 57, weight 400, letterSpacing -0.25
headlineLarge:  size 32, weight 600
headlineMedium: size 28, weight 600
headlineSmall:  size 24, weight 600
titleLarge:     size 22, weight 500
titleMedium:    size 16, weight 500, letterSpacing 0.15
titleSmall:     size 14, weight 500, letterSpacing 0.1
bodyLarge:      size 16, weight 400, letterSpacing 0.5
bodyMedium:     size 14, weight 400, letterSpacing 0.25
bodySmall:      size 12, weight 400, letterSpacing 0.4
labelLarge:     size 14, weight 500, letterSpacing 1.25

─── Spacing & Layout ───────────────────────────────────
Base unit: 4dp
xs: 4dp | sm: 8dp | md: 16dp | lg: 24dp | xl: 32dp | 2xl: 48dp
Screen horizontal padding: 16dp
Card internal padding: 16dp
Section gap: 24dp
List item height: 56dp

─── Shape (BorderRadius) ───────────────────────────────
ExtraSmall: 4dp | Small: 8dp | Medium: 12dp
Large: 16dp | ExtraLarge: 28dp | Full: 999dp

─── Elevation & Shadows ────────────────────────────────
Level 1: BoxShadow(0 1dp 2dp rgba(0,0,0,0.3))
Level 2: BoxShadow(0 2dp 6dp rgba(0,0,0,0.3))
Level 3: BoxShadow(0 4dp 8dp rgba(0,0,0,0.3))

─── Components ─────────────────────────────────────────
AppBar: height 64dp, background Surface, title titleLarge OnSurface, elevation Level 0
FilledButton: height 40dp, borderRadius Full, background Primary, text OnPrimary, padding horizontal 24dp
OutlinedButton: height 40dp, borderRadius Full, border 1dp Primary, text Primary
FAB: size 56dp, borderRadius Large, background PrimaryContainer, icon Primary 24dp, elevation Level 3
Card: background SurfaceVariant, borderRadius Medium, elevation Level 1, padding 16dp
BottomNavigationBar: height 80dp, background Surface, border-top 1dp Outline, selectedColor Primary, unselectedColor OnSurface
TextField: filled true, fillColor SurfaceVariant, borderRadius Small, focusedBorder 2dp Primary, contentPadding 12dp 16dp
Chip: height 32dp, borderRadius Full, background SurfaceVariant, border Outline
ListTile: minHeight 56dp, padding horizontal 16dp, title bodyLarge, subtitle bodyMedium opacity 0.7
Divider: height 1dp, color Outline, indent 16dp

─── Icons ──────────────────────────────────────────────
Package: Material Icons (Icons.*)
Default size: 24dp, color match context

─── Animation & Motion ─────────────────────────────────
Page transition: MaterialPageRoute (slide right)
Duration: short 150ms | medium 300ms | long 500ms
Curve: Curves.easeInOut`,
      },
    ];

    const main = this._overlay.querySelector('#scrMain');
    main.innerHTML = `
      <div class="scr-form">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
          <h2 class="scr-form__heading">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="margin-right:6px;vertical-align:-2px">
              <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/>
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            Design System
          </h2>
          <span class="scr-ds-badge${this._designTemplate ? ' scr-ds-badge--set' : ''}">
            ${this._designTemplate ? 'Active — applied to all screens' : 'Not set'}
          </span>
        </div>
        <p class="scr-form__hint" style="margin-top:-8px">
          Define colours, typography, spacing and component styles once. This is injected into every screen generation prompt so all pages share the same visual identity.
        </p>
        <div class="scr-form__row scr-form__row--grow">
          <label class="scr-form__label">Design Template</label>
          <textarea class="scr-form__textarea" id="scrDsTpl" placeholder="Paste your design system here…">${escHtml(this._designTemplate || '')}</textarea>
        </div>
        <div class="scr-form__actions">
          <button class="scr-btn scr-btn--sm" id="scrDsDefault">Example: ${EXAMPLES[0].label} ↻</button>
          <div class="scr-form__btns">
            <button class="scr-btn scr-btn--secondary" id="scrDsCancel">Cancel</button>
            <button class="scr-btn scr-btn--primary" id="scrDsSave">Save Design System</button>
          </div>
        </div>
      </div>
    `;

    let exampleIdx = 0;
    const cycleBtn = main.querySelector('#scrDsDefault');
    cycleBtn.addEventListener('click', () => {
      exampleIdx = (exampleIdx + 1) % EXAMPLES.length;
      main.querySelector('#scrDsTpl').value = EXAMPLES[exampleIdx].template;
      cycleBtn.textContent = `Example: ${EXAMPLES[exampleIdx].label} \u21bb`;
    });

    main.querySelector('#scrDsCancel').addEventListener('click', () => onBack());

    main.querySelector('#scrDsSave').addEventListener('click', async () => {
      const tpl     = main.querySelector('#scrDsTpl').value.trim();
      const project = this._getProject();
      await window.db.projects.update({ id: project.id, design_template: tpl });
      this._designTemplate = tpl;
      // Patch the in-memory project object so getProject() returns updated value
      if (project) project.design_template = tpl;
      onBack();
    });
  }

  // ----------------------------------------------------------------
  // Extract Stories dialog
  // ----------------------------------------------------------------
  async _showExtractDialog(screen) {
    const features = await window.db.features.list(this._projectId);

    const dlg = document.createElement('div');
    dlg.className = 'scr-extract-overlay';
    dlg.innerHTML = `
      <div class="scr-extract-dialog">
        <div class="scr-extract-dialog__header">
          <span>Extract User Stories — ${escHtml(screen.title)}</span>
          <button class="scr-extract-dialog__close">&times;</button>
        </div>
        <div class="scr-extract-dialog__body">

          ${features.length === 0
            ? `<p class="scr-extract-dialog__warn">No features found. Create a feature in the project panel first.</p>`
            : `<div class="scr-form__row">
                <label class="scr-form__label">Target Feature *</label>
                <select class="scr-form__select" id="extFeatureSelect">
                  ${features.map(f => `<option value="${f.id}">${escHtml(f.name)}</option>`).join('')}
                </select>
               </div>`
          }

          <div class="scr-form__row" style="margin-top:12px">
            <label class="scr-form__label">Step 1 — Run the extraction prompt in the terminal</label>
            <select class="scr-model-select" id="extModelSelect" style="margin-bottom:6px">
              ${this._modelConfigs.map(c =>
                `<option value="${c.id}"${c.id === this._selectedModelId ? ' selected' : ''}>${escHtml(c.label)} [${c.type.toUpperCase()}]</option>`
              ).join('')}
            </select>
            <button class="scr-btn scr-btn--primary" id="extRunBtn" ${features.length === 0 ? 'disabled' : ''}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
                <path d="M5 6l3 2-3 2V6z" fill="currentColor"/>
              </svg>
              Run in Terminal
            </button>
            <span class="scr-form__hint">This opens a terminal window. The AI will output a JSON array — save it to a .json file.</span>
          </div>

          <div class="scr-cmd-preview" id="extCmdPreview" hidden>
            <div class="scr-cmd-preview__label">Command:</div>
            <pre class="scr-cmd-preview__code" id="extCmdCode"></pre>
          </div>

          <div class="scr-form__row" style="margin-top:12px">
            <label class="scr-form__label">Step 2 — Load the generated JSON file</label>
            <button class="scr-btn scr-btn--secondary" id="extLoadBtn" ${features.length === 0 ? 'disabled' : ''}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M2 4a1 1 0 011-1h3l1.5 2H13a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
              </svg>
              Choose JSON File
            </button>
          </div>
        </div>
        <div class="scr-extract-dialog__footer">
          <button class="scr-btn scr-btn--secondary" id="extCancelBtn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(dlg);
    dlg.querySelector('.scr-extract-dialog__close').addEventListener('click', () => dlg.remove());
    dlg.querySelector('#extCancelBtn').addEventListener('click',            () => dlg.remove());

    const runBtn  = dlg.querySelector('#extRunBtn');
    const loadBtn = dlg.querySelector('#extLoadBtn');

    if (runBtn) {
      runBtn.addEventListener('click', async () => {
        const selId = Number(dlg.querySelector('#extModelSelect')?.value) || this._selectedModelId;
        const m = this._modelConfigs.find(c => c.id === selId) || this._getSelectedModel();
        if (!m || m.type === 'anthropic' || !m.executable) {
          alert('Please select a CLI model from the dropdown.');
          return;
        }
        const project    = this._getProject();
        const screensDir = await window.app.screensDir(project?.name);
        const safeTitle  = screen.title.replace(/[^a-z0-9_\-]/gi, '_');
        const outputFile = `${screensDir}\\${safeTitle}_stories.json`;

        // Resolve HTML file path — canonical if saved to disk, temp otherwise.
        const htmlFilePath = await window.app.prepareScreenRef({
          screensDir,
          safeTitle,
          htmlContent: screen.html_content,
        });

        const instruction = buildExtractPrompt(screen.tech_stack, screen.title, htmlFilePath, outputFile);
        const cmd         = buildExtractPsCommand(instruction, m);

        dlg.querySelector('#extCmdCode').textContent = cmd;
        dlg.querySelector('#extCmdPreview').hidden = false;

        await window.db.terminal.openExternal({ command: cmd, cwd: project?.project_path || undefined });
      });
    }

    if (loadBtn) {
      loadBtn.addEventListener('click', async () => {
        const featureSelect = dlg.querySelector('#extFeatureSelect');
        const featureId     = featureSelect ? Number(featureSelect.value) : null;
        if (!featureId) { alert('Please select a feature first.'); return; }

        const result = await window.db.dialog.openFile({ title: 'Choose Stories JSON File', extensions: ['json'] });
        if (!result) return;

        let stories;
        try {
          let text = result.content.trim();
          const md = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (md) text = md[1].trim();
          stories = JSON.parse(text);
        } catch (err) {
          alert(`Could not parse JSON file: ${err.message}\n\nMake sure the file contains a valid JSON array of stories.`);
          return;
        }

        loadBtn.disabled    = true;
        loadBtn.textContent = 'Creating…';

        let created = 0;
        for (const story of stories) {
          // acceptance_criteria may come as array (old format) or string (new format)
          const ac = Array.isArray(story.acceptance_criteria)
            ? story.acceptance_criteria.map(c => `- ${c}`).join('\n')
            : (story.acceptance_criteria || '');

          await window.db.userStories.create({
            feature_id:          featureId,
            project_id:          this._projectId,
            title:               story.title || 'Untitled',
            description:         story.description || story.story || '',
            acceptance_criteria: ac,
            prompt:              story.prompt || story.implementation_prompt || '',
          });
          created++;
        }

        dlg.remove();
        alert(`${created} user ${created === 1 ? 'story' : 'stories'} created successfully.`);
      });
    }
  }
}
