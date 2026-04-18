import { escHtml, injectCss } from '../../../../shared/helpers.js';

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
function buildScreenPrompt(description, techStack, projectDescription) {
  const tech   = TECH_LABELS[techStack] || techStack;
  const mobile = isMobile(techStack);
  const ctx    = projectDescription ? `\nProject context: ${projectDescription}` : '';

  if (mobile) {
    return `You are an expert mobile UI developer. Generate complete, production-quality ${tech} code for the screen described below. Output ONLY the code — no explanation, no markdown fences.${ctx}\n\nScreen to design:\n${description}`;
  }

  return `You are an expert UI/UX developer. Generate a complete, self-contained HTML file for the screen described below using ${tech}.
Rules:
- Output ONLY valid HTML starting with <!DOCTYPE html>
- All CSS goes inside a <style> tag; CDN links (e.g. Tailwind CDN) are allowed
- Visually polished, modern design with realistic placeholder content
- Fully responsive
- No explanation, no markdown — raw HTML only${ctx}

Screen to design:
${description}`;
}

function buildExtractPrompt(htmlContent, techStack, screenTitle) {
  const tech = TECH_LABELS[techStack] || techStack;
  return `You are an expert product manager. Analyze the following UI screen design and extract user stories.

Screen: "${screenTitle}"
Tech stack: ${tech}

UI code:
\`\`\`
${htmlContent.slice(0, 8000)}
\`\`\`

Extract every distinct user action, form, state, or interaction visible in this screen as a separate user story.

Output ONLY a valid JSON array — no markdown, no explanation:
[
  {
    "title": "Short action-oriented title",
    "description": "As a user, I want to [action] so that [benefit].",
    "acceptance_criteria": "- Criterion 1\\n- Criterion 2\\n- Criterion 3\\n- Criterion 4",
    "prompts": [
      { "tag": "implementation", "prompt": "Implement [specific component] using ${tech}..." },
      { "tag": "test", "prompt": "Write tests for [story]: test [case 1], test [case 2]..." }
    ]
  }
]`;
}

// ----------------------------------------------------------------
// Build the PowerShell command for a CLI model
// ----------------------------------------------------------------
function buildPsCommand(prompt, model, outputFile) {
  const exe    = model.executable || 'claude';
  const flags  = model.flags ? ` ${model.flags}` : '';
  // Escape single-quotes in the prompt for PS here-string
  const safe   = prompt.replace(/'/g, "''");
  const outPart = outputFile ? ` | Tee-Object -FilePath "${outputFile}"` : '';

  if (model.input_mode === 'heredoc') {
    return `$p = @'\n${safe}\n'@\n${exe}${flags} $p${outPart}`;
  }
  return `$p = @'\n${safe}\n'@\nWrite-Output $p | ${exe}${flags}${outPart}`;
}

// ----------------------------------------------------------------
// ScreensModal
// ----------------------------------------------------------------
export class ScreensModal {
  constructor({ projectId, getProject }) {
    this._projectId      = projectId;
    this._getProject     = getProject;
    this._overlay        = null;
    this._screens        = [];
    this._activeId       = null;
    this._activeTab      = 'preview';
    this._modelConfigs   = [];
    this._selectedModelId = null;
  }

  mount() {
    injectCss('pages/project/components/screens/screens-modal.css');
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
    this._overlay.querySelector('#scrClose').addEventListener('click', () => this._overlay.remove());
    this._overlay.querySelector('#scrNewBtn').addEventListener('click', () => this._showNewForm());
    this._bindSidebarItems();
    const escFn = (e) => {
      if (e.key === 'Escape') { this._overlay?.remove(); document.removeEventListener('keydown', escFn); }
    };
    document.addEventListener('keydown', escFn);
  }

  // ----------------------------------------------------------------
  // New Screen form
  // ----------------------------------------------------------------
  _showNewForm(prefill = {}) {
    this._activeId = null;
    this._setActiveItem(null);
    const model = this._getModel();

    const main = this._overlay.querySelector('#scrMain');
    main.innerHTML = `
      <div class="scr-form">
        <h2 class="scr-form__heading">New Screen Design</h2>

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
          <select class="scr-model-select" id="scrModelSelect">
            ${this._modelConfigs.length === 0
              ? `<option value="">No models configured</option>`
              : this._modelConfigs.map(c =>
                  `<option value="${c.id}"${c.id === this._selectedModelId ? ' selected' : ''}>${escHtml(c.label)} [${c.type.toUpperCase()}]</option>`
                ).join('')
            }
          </select>
          <div class="scr-form__btns">
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
      </div>
    `;

    main.querySelector('#scrModelSelect')?.addEventListener('change', (e) => {
      this._selectedModelId = Number(e.target.value) || null;
    });
    main.querySelector('#scrRunBtn').addEventListener('click', () => this._runInTerminal());
    main.querySelector('#scrChooseFileBtn').addEventListener('click', () => this._chooseFile());
  }

  async _runInTerminal() {
    const main   = this._overlay.querySelector('#scrMain');
    const title  = main.querySelector('#scrTitle').value.trim();
    const desc   = main.querySelector('#scrDescription').value.trim();
    const stack  = main.querySelector('#scrTechStack').value;

    if (!title) { main.querySelector('#scrTitle').focus(); return; }
    if (!desc)  { main.querySelector('#scrDescription').focus(); return; }

    const model = this._getSelectedModel();
    if (!model || model.type === 'anthropic' || !model.executable) {
      alert('Please select a CLI model (Claude CLI or Gemini CLI) from the model dropdown.');
      return;
    }

    const project    = this._getProject();
    const screensDir = await window.app.screensDir();
    const safeTitle  = title.replace(/[^a-z0-9_\-]/gi, '_');
    const outputFile = `${screensDir}\\${safeTitle}.html`;
    const prompt     = buildScreenPrompt(desc, stack, project?.description || '');
    const cmd        = buildPsCommand(prompt, model, outputFile);

    // Show the command preview
    const preview = main.querySelector('#scrCmdPreview');
    main.querySelector('#scrCmdCode').textContent = cmd;
    preview.hidden = false;

    const cwd = project?.project_path || undefined;
    await window.db.terminal.openExternal({ command: cmd, cwd });
  }

  async _chooseFile() {
    const main  = this._overlay.querySelector('#scrMain');
    const title = main.querySelector('#scrTitle')?.value.trim() || 'Untitled Screen';
    const stack = main.querySelector('#scrTechStack')?.value || 'html';
    const desc  = main.querySelector('#scrDescription')?.value.trim() || '';

    const result = await window.db.dialog.openFile({
      title:      'Choose Generated Screen File',
      extensions: ['html', 'htm', 'dart', 'js', 'jsx', 'tsx', '*'],
    });
    if (!result) return;

    const screen = await window.db.screenDesigns.create({
      project_id:   this._projectId,
      title,
      description:  desc,
      tech_stack:   stack,
      html_content: result.content,
      prompt_used:  desc,
      model_used:   this._getSelectedModel()?.label || '',
    });

    this._screens = await window.db.screenDesigns.list(this._projectId);
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
            ${!mobile ? `
            <div class="scr-viewer__tabs">
              <button class="scr-viewer__tab${this._activeTab === 'preview' ? ' scr-viewer__tab--active' : ''}" data-tab="preview">Preview</button>
              <button class="scr-viewer__tab${this._activeTab === 'code'    ? ' scr-viewer__tab--active' : ''}" data-tab="code">Code</button>
            </div>` : ''}
            <button class="scr-btn scr-btn--sm" id="scrRegenBtn">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M2 8a6 6 0 1110.4-4H10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M10 4l2.5 0 0 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Regenerate
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

    // Regenerate — go back to form pre-filled with existing values
    main.querySelector('#scrRegenBtn').addEventListener('click', () => {
      this._showNewForm({ title: screen.title, tech_stack: screen.tech_stack, description: screen.description || screen.prompt_used || '' });
    });

    // Extract stories
    main.querySelector('#scrExtractBtn').addEventListener('click', () => this._showExtractDialog(screen));

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
        const screensDir = await window.app.screensDir();
        const safeTitle  = screen.title.replace(/[^a-z0-9_\-]/gi, '_');
        const outputFile = `${screensDir}\\${safeTitle}_stories.json`;
        const prompt = buildExtractPrompt(screen.html_content, screen.tech_stack, screen.title);
        const cmd    = buildPsCommand(prompt, m, outputFile);

        dlg.querySelector('#extCmdCode').textContent = cmd;
        dlg.querySelector('#extCmdPreview').hidden = false;

        const project = this._getProject();
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
          const newStory = await window.db.userStories.create({
            feature_id:          featureId,
            project_id:          this._projectId,
            title:               story.title || 'Untitled',
            description:         story.description || '',
            acceptance_criteria: story.acceptance_criteria || '',
            prompt:              story.prompts?.[0]?.prompt || '',
          });
          for (const p of (story.prompts || [])) {
            await window.db.prompts.create({ user_story_id: newStory.id, tag: p.tag, prompt: p.prompt });
          }
          created++;
        }

        dlg.remove();
        alert(`${created} user ${created === 1 ? 'story' : 'stories'} created successfully.`);
      });
    }
  }
}
