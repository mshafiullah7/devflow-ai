import { escHtml, injectCss } from '../../../../shared/helpers.js';

const TECH_STACKS = [
  { value: 'html',           label: 'Plain HTML / CSS',     mobile: false },
  { value: 'react-tailwind', label: 'React + Tailwind CSS', mobile: false },
  { value: 'vue-tailwind',   label: 'Vue 3 + Tailwind CSS', mobile: false },
  { value: 'flutter',        label: 'Flutter (Dart)',        mobile: true  },
  { value: 'react-native',   label: 'React Native',          mobile: true  },
];

function techLabel(value) {
  return TECH_STACKS.find(t => t.value === value)?.label || value;
}

function isMobile(value) {
  return TECH_STACKS.find(t => t.value === value)?.mobile ?? false;
}

export class ScreensModal {
  constructor({ projectId, getProject, getModel }) {
    this._projectId  = projectId;
    this._getProject = getProject;  // () => project row
    this._getModel   = getModel;    // () => model_configs row
    this._overlay    = null;
    this._screens    = [];
    this._activeId   = null;
    this._streamBuf  = '';
    this._generating = false;
    this._activeTab  = 'preview'; // 'preview' | 'code'
  }

  mount() {
    injectCss('pages/project/components/screens/screens-modal.css');
  }

  async show() {
    this._overlay?.remove();
    this._screens  = await window.db.screenDesigns.list(this._projectId);
    this._activeId = this._screens[0]?.id ?? null;
    this._activeTab = 'preview';

    this._overlay = document.createElement('div');
    this._overlay.className = 'scr-overlay';
    this._overlay.innerHTML = this._shellTemplate();
    document.body.appendChild(this._overlay);

    this._bindShellEvents();

    if (this._activeId) this._selectScreen(this._activeId);
    else                this._showNewForm();
  }

  // ----------------------------------------------------------------
  // Shell (sidebar + wrapper)
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
          <path d="M3 5h7M3 8h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
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
    this._overlay?.querySelectorAll('.scr-sidebar__item').forEach(el => {
      el.addEventListener('click', () => this._selectScreen(Number(el.dataset.id)));
    });
  }

  _bindShellEvents() {
    this._overlay.querySelector('#scrClose').addEventListener('click', () => this._close());
    this._overlay.querySelector('#scrNewBtn').addEventListener('click', () => this._showNewForm());
    this._overlay.querySelectorAll('.scr-sidebar__item').forEach(el => {
      el.addEventListener('click', () => this._selectScreen(Number(el.dataset.id)));
    });
    const escFn = (e) => {
      if (e.key === 'Escape' && !this._generating) {
        this._close();
        document.removeEventListener('keydown', escFn);
      }
    };
    document.addEventListener('keydown', escFn);
  }

  _close() {
    window.claude.removeListeners();
    this._overlay?.remove();
    this._overlay = null;
  }

  // ----------------------------------------------------------------
  // New Screen form
  // ----------------------------------------------------------------
  _showNewForm() {
    this._activeId = null;
    this._streamBuf = '';
    this._generateing = false;
    this._setActiveItem(null);

    const main = this._overlay.querySelector('#scrMain');
    main.innerHTML = `
      <div class="scr-form">
        <h2 class="scr-form__heading">New Screen Design</h2>

        <div class="scr-form__row">
          <label class="scr-form__label">Title *</label>
          <input class="scr-form__input" id="scrTitle" type="text" placeholder="e.g. Login Screen, Dashboard, Product List…" autocomplete="off"/>
        </div>

        <div class="scr-form__row">
          <label class="scr-form__label">Tech Stack</label>
          <select class="scr-form__select" id="scrTechStack">
            ${TECH_STACKS.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
          </select>
        </div>

        <div class="scr-form__row scr-form__row--grow">
          <label class="scr-form__label">Describe the screen *</label>
          <textarea class="scr-form__textarea" id="scrDescription"
            placeholder="Describe what this screen should contain: purpose, sections, components, user actions, visual style, etc.
Example: A login screen with an email and password field, a 'Remember me' checkbox, a Sign In button, and a 'Forgot password?' link. Use a clean white card on a light gray background."></textarea>
        </div>

        <div class="scr-form__actions">
          <div class="scr-form__model-hint" id="scrModelHint"></div>
          <button class="scr-form__generate-btn" id="scrGenerateBtn">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <path d="M10 2l2.4 5.4L18 8.6l-4 3.9.9 5.5L10 15.4l-4.9 2.6.9-5.5L2 8.6l5.6-1.2z"
                fill="currentColor" opacity=".9"/>
            </svg>
            Generate with AI
          </button>
        </div>

        <div class="scr-stream" id="scrStream" hidden>
          <div class="scr-stream__bar">
            <span class="scr-stream__dot"></span>
            <span class="scr-stream__label">Generating…</span>
            <button class="scr-stream__cancel" id="scrCancelBtn">Cancel</button>
          </div>
          <pre class="scr-stream__code" id="scrStreamCode"></pre>
        </div>
      </div>
    `;

    this._updateModelHint();
    main.querySelector('#scrGenerateBtn').addEventListener('click', () => this._startGenerate());
    main.querySelector('#scrCancelBtn')?.addEventListener('click', () => this._cancelGenerate());
  }

  _updateModelHint() {
    const hint = this._overlay?.querySelector('#scrModelHint');
    if (!hint) return;
    const model = this._getModel();
    if (!model) {
      hint.textContent = 'No model selected.';
      hint.className = 'scr-form__model-hint scr-form__model-hint--warn';
    } else if (model.type !== 'anthropic') {
      hint.innerHTML = `Using <strong>${escHtml(model.label)}</strong> — for AI generation, add a <em>Claude (Anthropic API)</em> model config.`;
      hint.className = 'scr-form__model-hint scr-form__model-hint--warn';
    } else {
      hint.innerHTML = `Using <strong>${escHtml(model.label)}</strong> (${escHtml(model.model_name || 'claude-sonnet-4-6')})`;
      hint.className = 'scr-form__model-hint';
    }
  }

  async _startGenerate() {
    const main        = this._overlay.querySelector('#scrMain');
    const titleEl     = main.querySelector('#scrTitle');
    const descEl      = main.querySelector('#scrDescription');
    const techEl      = main.querySelector('#scrTechStack');
    const streamEl    = main.querySelector('#scrStream');
    const streamCode  = main.querySelector('#scrStreamCode');
    const generateBtn = main.querySelector('#scrGenerateBtn');

    const title       = titleEl.value.trim();
    const description = descEl.value.trim();
    const tech_stack  = techEl.value;

    if (!title)       { titleEl.focus(); return; }
    if (!description) { descEl.focus(); return; }

    const model = this._getModel();
    if (!model || model.type !== 'anthropic') {
      alert('Please select a Claude (Anthropic API) model config first, or add one via the model settings button in the header.');
      return;
    }

    this._generating = true;
    this._streamBuf  = '';
    generateBtn.disabled = true;
    streamEl.hidden      = false;
    streamCode.textContent = '';

    window.claude.removeListeners();

    window.claude.onToken((token) => {
      this._streamBuf += token;
      streamCode.textContent = this._streamBuf;
      streamCode.scrollTop   = streamCode.scrollHeight;
    });

    window.claude.onDone(async () => {
      this._generating = false;
      generateBtn.disabled = false;
      streamEl.hidden = true;

      const project = this._getProject();
      const screen  = await window.db.screenDesigns.create({
        project_id:   this._projectId,
        title,
        description,
        tech_stack,
        html_content: this._streamBuf,
        prompt_used:  description,
        model_used:   model.model_name || 'claude-sonnet-4-6',
      });

      this._screens = await window.db.screenDesigns.list(this._projectId);
      this._activeId = screen.id;
      this._refreshSidebar();
      this._showScreenViewer(screen);
    });

    window.claude.onError((msg) => {
      this._generating = false;
      generateBtn.disabled = false;
      streamEl.hidden = true;
      streamCode.textContent = `Error: ${msg}`;
      streamEl.hidden = false;
    });

    const project = this._getProject();
    await window.claude.generateScreen({
      api_key:             model.api_key,
      model_name:          model.model_name || 'claude-sonnet-4-6',
      description,
      tech_stack,
      project_description: project?.description || '',
    });
  }

  _cancelGenerate() {
    window.claude.cancel();
    window.claude.removeListeners();
    this._generating = false;
    const streamEl = this._overlay?.querySelector('#scrStream');
    if (streamEl) streamEl.hidden = true;
    const btn = this._overlay?.querySelector('#scrGenerateBtn');
    if (btn) btn.disabled = false;
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
    const main = this._overlay.querySelector('#scrMain');
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
              <button class="scr-viewer__tab${this._activeTab === 'code' ? ' scr-viewer__tab--active' : ''}" data-tab="code">Code</button>
            </div>` : ''}
            <button class="scr-viewer__btn" id="scrRegenerateBtn" title="Regenerate">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M2 8a6 6 0 1110.4-4H10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M10 4l2.4 0 0 2.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Regenerate
            </button>
            <button class="scr-viewer__btn scr-viewer__btn--accent" id="scrExtractBtn" title="Extract user stories from this screen">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M3 4h10M3 8h7M3 12h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                <path d="M13 10l1.5 1.5L13 13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Extract Stories
            </button>
            <button class="scr-viewer__btn scr-viewer__btn--danger" id="scrDeleteBtn" title="Delete screen">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="scr-viewer__content" id="scrViewerContent">
          ${mobile
            ? `<pre class="scr-viewer__code-block"><code>${escHtml(screen.html_content)}</code></pre>`
            : this._activeTab === 'preview'
              ? `<iframe class="scr-viewer__iframe" id="scrPreviewFrame" sandbox="allow-scripts allow-same-origin"></iframe>`
              : `<pre class="scr-viewer__code-block"><code>${escHtml(screen.html_content)}</code></pre>`
          }
        </div>

        <div class="scr-regen" id="scrRegenPanel" hidden>
          <textarea class="scr-regen__input" id="scrRegenDesc" placeholder="Describe changes or leave blank to regenerate as-is…">${escHtml(screen.description || '')}</textarea>
          <div class="scr-regen__actions">
            <button class="scr-regen__cancel" id="scrRegenCancelBtn">Cancel</button>
            <button class="scr-regen__go" id="scrRegenGoBtn">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                <path d="M10 2l2.4 5.4L18 8.6l-4 3.9.9 5.5L10 15.4l-4.9 2.6.9-5.5L2 8.6l5.6-1.2z" fill="currentColor"/>
              </svg>
              Generate
            </button>
          </div>
          <div class="scr-stream scr-stream--inline" id="scrRegenStream" hidden>
            <div class="scr-stream__bar">
              <span class="scr-stream__dot"></span>
              <span class="scr-stream__label">Regenerating…</span>
              <button class="scr-stream__cancel" id="scrRegenCancelStreamBtn">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Load iframe preview
    if (!mobile && this._activeTab === 'preview') {
      this._loadPreview(screen.html_content);
    }

    this._bindViewerEvents(screen);
  }

  _loadPreview(html) {
    const frame = this._overlay?.querySelector('#scrPreviewFrame');
    if (!frame) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    frame.src  = url;
    frame.onload = () => URL.revokeObjectURL(url);
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

    // Regenerate
    main.querySelector('#scrRegenerateBtn').addEventListener('click', () => {
      const panel = main.querySelector('#scrRegenPanel');
      panel.hidden = !panel.hidden;
    });

    main.querySelector('#scrRegenCancelBtn').addEventListener('click', () => {
      main.querySelector('#scrRegenPanel').hidden = true;
    });

    main.querySelector('#scrRegenGoBtn').addEventListener('click', () => this._doRegenerate(screen));

    main.querySelector('#scrRegenCancelStreamBtn')?.addEventListener('click', () => {
      window.claude.cancel();
      window.claude.removeListeners();
      this._generating = false;
      main.querySelector('#scrRegenStream').hidden = true;
      main.querySelector('#scrRegenGoBtn').disabled = false;
    });

    // Extract stories
    main.querySelector('#scrExtractBtn').addEventListener('click', () => this._showExtractDialog(screen));

    // Delete
    main.querySelector('#scrDeleteBtn').addEventListener('click', async () => {
      if (!confirm(`Delete "${screen.title}"?`)) return;
      await window.db.screenDesigns.delete(screen.id);
      this._screens = await window.db.screenDesigns.list(this._projectId);
      this._activeId = this._screens[0]?.id ?? null;
      this._refreshSidebar();
      if (this._activeId) this._selectScreen(this._activeId);
      else                this._showNewForm();
    });
  }

  // ----------------------------------------------------------------
  // Regenerate
  // ----------------------------------------------------------------
  async _doRegenerate(screen) {
    const main    = this._overlay.querySelector('#scrMain');
    const descEl  = main.querySelector('#scrRegenDesc');
    const goBtn   = main.querySelector('#scrRegenGoBtn');
    const stream  = main.querySelector('#scrRegenStream');

    const model = this._getModel();
    if (!model || model.type !== 'anthropic') {
      alert('Please select a Claude (Anthropic API) model config first.');
      return;
    }

    const description = descEl.value.trim() || screen.description || screen.prompt_used || `Regenerate the ${screen.title} screen`;
    this._generating  = true;
    this._streamBuf   = '';
    goBtn.disabled    = true;
    stream.hidden     = false;

    window.claude.removeListeners();

    window.claude.onToken((token) => { this._streamBuf += token; });

    window.claude.onDone(async () => {
      this._generating = false;
      goBtn.disabled   = false;
      stream.hidden    = true;

      const updated = await window.db.screenDesigns.update({
        id:           screen.id,
        html_content: this._streamBuf,
        prompt_used:  description,
        model_used:   model.model_name,
        description:  descEl.value.trim() || undefined,
      });

      screen.html_content = this._streamBuf;
      main.querySelector('#scrRegenPanel').hidden = true;

      const content = main.querySelector('#scrViewerContent');
      if (this._activeTab === 'preview' && !isMobile(screen.tech_stack)) {
        content.innerHTML = `<iframe class="scr-viewer__iframe" id="scrPreviewFrame" sandbox="allow-scripts allow-same-origin"></iframe>`;
        this._loadPreview(this._streamBuf);
      } else {
        content.innerHTML = `<pre class="scr-viewer__code-block"><code>${escHtml(this._streamBuf)}</code></pre>`;
      }
    });

    window.claude.onError((msg) => {
      this._generating = false;
      goBtn.disabled   = false;
      stream.hidden    = true;
      alert(`Generation error: ${msg}`);
    });

    const project = this._getProject();
    await window.claude.generateScreen({
      api_key:             model.api_key,
      model_name:          model.model_name || 'claude-sonnet-4-6',
      description,
      tech_stack:          screen.tech_stack,
      project_description: project?.description || '',
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
          <span>Extract User Stories</span>
          <button class="scr-extract-dialog__close" id="scrExtractClose">&times;</button>
        </div>
        <div class="scr-extract-dialog__body">
          <p class="scr-extract-dialog__desc">
            Claude will analyze <strong>${escHtml(screen.title)}</strong> and generate user stories with implementation and test prompts.
          </p>
          <label class="scr-form__label">Target Feature *</label>
          ${features.length === 0
            ? `<p class="scr-extract-dialog__warn">No features found. Create a feature first in the project panel.</p>`
            : `<select class="scr-form__select" id="scrExtractFeature">
                ${features.map(f => `<option value="${f.id}" data-project="${f.project_id}">${escHtml(f.name)}</option>`).join('')}
               </select>`
          }
        </div>
        <div class="scr-extract-dialog__footer">
          <button class="scr-extract-dialog__cancel" id="scrExtractCancelBtn">Cancel</button>
          ${features.length > 0
            ? `<button class="scr-extract-dialog__confirm" id="scrExtractConfirmBtn">
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2l2.4 5.4L18 8.6l-4 3.9.9 5.5L10 15.4l-4.9 2.6.9-5.5L2 8.6l5.6-1.2z" fill="currentColor"/>
                </svg>
                Extract Stories
               </button>`
            : ''
          }
        </div>
      </div>
    `;

    document.body.appendChild(dlg);

    dlg.querySelector('#scrExtractClose').addEventListener('click', () => dlg.remove());
    dlg.querySelector('#scrExtractCancelBtn').addEventListener('click', () => dlg.remove());

    const confirmBtn = dlg.querySelector('#scrExtractConfirmBtn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        const featureSelect = dlg.querySelector('#scrExtractFeature');
        const featureId     = Number(featureSelect.value);
        confirmBtn.disabled      = true;
        confirmBtn.textContent   = 'Extracting…';

        const model = this._getModel();
        if (!model || model.type !== 'anthropic') {
          alert('Please select a Claude (Anthropic API) model config first.');
          confirmBtn.disabled    = false;
          confirmBtn.textContent = 'Extract Stories';
          return;
        }

        const result = await window.claude.extractStories({
          api_key:      model.api_key,
          model_name:   model.model_name || 'claude-sonnet-4-6',
          html_content: screen.html_content,
          tech_stack:   screen.tech_stack,
          screen_title: screen.title,
        });

        if (result.error) {
          alert(`Extraction failed: ${result.error}`);
          confirmBtn.disabled    = false;
          confirmBtn.textContent = 'Extract Stories';
          return;
        }

        let created = 0;
        for (const story of result.stories) {
          const newStory = await window.db.userStories.create({
            feature_id:          featureId,
            project_id:          this._projectId,
            title:               story.title,
            description:         story.description,
            acceptance_criteria: story.acceptance_criteria,
            prompt:              story.prompts?.[0]?.prompt || '',
          });

          for (const p of (story.prompts || [])) {
            await window.db.prompts.create({
              user_story_id: newStory.id,
              tag:           p.tag,
              prompt:        p.prompt,
            });
          }
          created++;
        }

        dlg.remove();
        alert(`${created} user ${created === 1 ? 'story' : 'stories'} created successfully.`);
      });
    }
  }
}
