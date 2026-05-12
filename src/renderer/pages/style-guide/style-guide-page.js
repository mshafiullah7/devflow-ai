import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelConfigsModal } from '../../components/model-configs/model-configs-modal.js';
import { ModelPicker }       from '../../components/model-picker/model-picker.js';

/* ------------------------------------------------------------------ */
/* Built-in preset examples (shipped with the app)                     */
/* ------------------------------------------------------------------ */
const BUILTIN_PRESETS = [
  {
    label: 'DevFlow Default',
    light:
`Color Palette:
- Primary: #1e3a5f
- Background: #fdf8f0
- Surface: #fffdf7
- Text primary: #0a0804
- Text secondary: #2a2218
- Border: #4a3f2f
- Danger: #ef4444

Typography:
- Font family: 'Segoe UI', system-ui, sans-serif
- Heading: font-weight 600, font-size 24px
- Body: font-weight 400, font-size 14px, line-height 1.5

Components:
- Buttons: border-radius 8px, padding 8px 18px, font-weight 500
- Cards: border-radius 12px, border 1px solid #4a3f2f, background #fffdf7
- Inputs: border-radius 8px, background #fdf8f0, border 1px solid #4a3f2f`,
    dark:
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
- Inputs: border-radius 8px, background #1a1d27, border 1px solid #2a2d3e`,
  },
  {
    label: 'Ocean Blue',
    light:
`Color Palette:
- Primary: #0284c7
- Background: #f0f9ff
- Surface: #e0f2fe
- Text primary: #0c4a6e
- Text secondary: #0369a1
- Border: #7dd3fc
- Danger: #ef4444

Typography:
- Font family: 'Inter', system-ui, sans-serif
- Heading: font-weight 700, font-size 22px
- Body: font-weight 400, font-size 14px, line-height 1.6

Components:
- Buttons: border-radius 6px, padding 8px 16px, font-weight 600
- Cards: border-radius 10px, border 1px solid #7dd3fc, background #e0f2fe
- Inputs: border-radius 6px, background #f0f9ff, border 1px solid #7dd3fc`,
    dark:
`Color Palette:
- Primary: #38bdf8
- Background: #0c1a2e
- Surface: #0f2a47
- Text primary: #e0f2fe
- Text secondary: #7dd3fc
- Border: #1e3a5f
- Danger: #f87171

Typography:
- Font family: 'Inter', system-ui, sans-serif
- Heading: font-weight 700, font-size 22px
- Body: font-weight 400, font-size 14px, line-height 1.6

Components:
- Buttons: border-radius 6px, padding 8px 16px, font-weight 600
- Cards: border-radius 10px, border 1px solid #1e3a5f, background #0f2a47
- Inputs: border-radius 6px, background #0c1a2e, border 1px solid #1e3a5f`,
  },
  {
    label: 'Forest Green',
    light:
`Color Palette:
- Primary: #16a34a
- Background: #f0fdf4
- Surface: #dcfce7
- Text primary: #14532d
- Text secondary: #15803d
- Border: #86efac
- Danger: #ef4444

Typography:
- Font family: 'Georgia', serif
- Heading: font-weight 700, font-size 22px
- Body: font-weight 400, font-size 14px, line-height 1.7

Components:
- Buttons: border-radius 4px, padding 8px 18px, font-weight 600
- Cards: border-radius 8px, border 1px solid #86efac, background #dcfce7
- Inputs: border-radius 4px, background #f0fdf4, border 1px solid #86efac`,
    dark:
`Color Palette:
- Primary: #4ade80
- Background: #0a1a0f
- Surface: #0f2a1a
- Text primary: #dcfce7
- Text secondary: #86efac
- Border: #166534
- Danger: #f87171

Typography:
- Font family: 'Georgia', serif
- Heading: font-weight 700, font-size 22px
- Body: font-weight 400, font-size 14px, line-height 1.7

Components:
- Buttons: border-radius 4px, padding 8px 18px, font-weight 600
- Cards: border-radius 8px, border 1px solid #166534, background #0f2a1a
- Inputs: border-radius 4px, background #0a1a0f, border 1px solid #166534`,
  },
  {
    label: 'Minimal Mono',
    light:
`Color Palette:
- Primary: #18181b
- Background: #ffffff
- Surface: #f4f4f5
- Text primary: #09090b
- Text secondary: #71717a
- Border: #d4d4d8
- Danger: #ef4444

Typography:
- Font family: 'DM Mono', 'Courier New', monospace
- Heading: font-weight 600, font-size 20px
- Body: font-weight 400, font-size 13px, line-height 1.6

Components:
- Buttons: border-radius 2px, padding 7px 16px, font-weight 500
- Cards: border-radius 4px, border 1px solid #d4d4d8, background #f4f4f5
- Inputs: border-radius 2px, background #ffffff, border 1px solid #d4d4d8`,
    dark:
`Color Palette:
- Primary: #e4e4e7
- Background: #09090b
- Surface: #18181b
- Text primary: #fafafa
- Text secondary: #a1a1aa
- Border: #27272a
- Danger: #f87171

Typography:
- Font family: 'DM Mono', 'Courier New', monospace
- Heading: font-weight 600, font-size 20px
- Body: font-weight 400, font-size 13px, line-height 1.6

Components:
- Buttons: border-radius 2px, padding 7px 16px, font-weight 500
- Cards: border-radius 4px, border 1px solid #27272a, background #18181b
- Inputs: border-radius 2px, background #09090b, border 1px solid #27272a`,
  },
];

export class StyleGuidePage {
  constructor(container, params, router) {
    this.container      = container;
    this.router         = router;
    this._projectId     = params.projectId;
    this._from          = params.from || 'project-home';
    this._project       = null;
    this._aiModelConfig = null;
    this._libraryThemes = [];
    this._generating    = false;
  }

  async mount() {
    injectCss('styles/screens.css');
    injectCss('pages/mockups/mockups-page.css');
    injectCss('pages/style-guide/style-guide-page.css');
    applyStoredTheme();

    this._project = await window.db.projects.get(this._projectId);
    this.container.innerHTML = this._template();

    this._modelConfigsModal = new ModelConfigsModal({ onConfigsChanged: () => this._picker.reload() });
    this._modelConfigsModal.mount();
    this._picker = new ModelPicker({
      anchor:   this.container.querySelector('#sgModelPicker'),
      onSelect: model => { this._aiModelConfig = model; },
    });
    await this._picker.reload();

    this._bindEvents();
    await this._seedBuiltinThemes();
    await this._loadThemeDropdown();
  }

  unmount() {
    window.app.chat.offAll();
    removeCss('pages/style-guide/style-guide-page.css');
    removeCss('pages/mockups/mockups-page.css');
    this._picker?.unmount();
    removeCss('styles/screens.css');
  }

  _getTemplateParts() {
    try {
      const p = JSON.parse(this._project?.design_template || '');
      if (p && typeof p === 'object') return { light: p.light || '', dark: p.dark || '' };
    } catch {}
    return { light: '', dark: this._project?.design_template || '' };
  }

  _hasAnyTemplate() {
    const p = this._getTemplateParts();
    return !!(p.light || p.dark);
  }

  _template() {
    const name   = escHtml(this._project?.name ?? 'Project');
    const parts  = this._getTemplateParts();
    const hasAny = this._hasAnyTemplate();

    return `
      <div class="sg-page">
        <header class="sg-page__header">
          <button class="sg-page__back" id="sgBtnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div class="sg-page__title-group">
            <div class="sg-page__title">${name}</div>
            <div class="sg-page__subtitle">Project Style Guide</div>
          </div>
          <div class="project-page__model-group" style="-webkit-app-region:no-drag;">
            <div id="sgModelPicker"></div>
            <button class="project-page__model-cfg-btn" id="sgBtnModelConfigs" title="Configure AI models">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <button class="project-page__git-btn" id="sgBtnGit" title="Git (opens User Stories)" style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
              <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
          <span class="sg-page__badge${hasAny ? ' sg-page__badge--active' : ''}">
            ${hasAny ? 'Active — applied to all screens' : 'Not set'}
          </span>
        </header>

        <div class="sg-page__body">
          <p class="sg-page__hint">
            Define colours, typography, spacing, and component styles for light and dark themes.
            Both are injected into every screen generation prompt.
          </p>

          <div class="sg-page__editor">

            <div class="scr-ds-templates">
              <div class="scr-ds-tpl-col" id="sgTplColLight">
                <div class="scr-ds-tpl-label scr-ds-tpl-label--light">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <circle cx="12" cy="12" r="5"/>
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                  </svg>
                  Light Theme
                </div>
                <textarea class="scr-form__textarea sg-page__textarea" id="sgTplLight"
                  placeholder="Paste light theme design tokens here…">${escHtml(parts.light)}</textarea>
              </div>
              <div class="scr-ds-tpl-col" id="sgTplColDark">
                <div class="scr-ds-tpl-label scr-ds-tpl-label--dark">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                  Dark Theme
                </div>
                <textarea class="scr-form__textarea sg-page__textarea" id="sgTplDark"
                  placeholder="Paste dark theme design tokens here…">${escHtml(parts.dark)}</textarea>
              </div>
            </div>

            <div class="scr-ds-preview-panel sg-page__preview">
              <div class="scr-ds-preview-bar">
                <span class="scr-ds-preview-label">Preview</span>
                <div class="scr-ds-theme-btns">
                  <button class="scr-ds-theme-btn" data-theme="light">Light</button>
                  <button class="scr-ds-theme-btn scr-ds-theme-btn--active" data-theme="dark">Dark</button>
                </div>
                <button class="scr-btn scr-btn--sm" id="sgRefreshBtn" title="Refresh preview">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                    <path d="M13.5 2.5v2.7H10.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Refresh
                </button>
              </div>
              <iframe class="scr-ds-preview-frame" id="sgPreviewFrame" sandbox="allow-scripts"></iframe>
            </div>

            <div class="sg-ai-card" id="sgAiCard">
              <div class="sg-ai-card__header">
                <span class="sg-ai-card__title">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1v3M8 12v3M1 8h3M12 8h3M3.05 3.05l2.12 2.12M10.83 10.83l2.12 2.12M3.05 12.95l2.12-2.12M10.83 5.17l2.12-2.12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                    <circle cx="8" cy="8" r="2" fill="currentColor"/>
                  </svg>
                  AI Edits
                </span>
                <button class="sg-ai-card__icon-btn" id="sgAiClear" title="Clear conversation">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M2 13h12M10.5 3L5 8.5l-2 4.5 4.5-2 5.5-5.5-2-2z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
              <div class="sg-ai-card__messages" id="sgAiMessages">
                <p class="sg-ai-card__welcome">Describe your aesthetic or request changes — e.g. "warm earth tones", "make it more minimal", "swap to purple accents".</p>
              </div>
              <div class="sg-ai-card__compose">
                <textarea class="sg-ai-card__input" id="sgAiInput" rows="2" maxlength="4000"
                  placeholder="e.g. minimal dark with purple accents…"></textarea>
                <button class="sg-ai-card__send" id="sgAiSend" title="Send (Enter) — Alt+Enter for new line">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M14 2L2 8l4 2 2 4 6-12z" fill="currentColor"/>
                  </svg>
                </button>
              </div>
            </div>

          </div>

          <!-- Actions bar -->
          <div class="sg-page__actions">
            <div class="sg-page__actions-left">
              <select class="sg-page__theme-select" id="sgThemeSelect">
                <option value="">— Select a theme —</option>
              </select>
              <button class="scr-btn scr-btn--sm" id="sgNewBtn">New</button>
            </div>
            <div class="sg-page__actions-right">
              <button class="scr-btn scr-btn--sm scr-btn--accent" id="sgSaveToLibraryBtn">Save to Library</button>
              <button class="scr-btn scr-btn--primary" id="sgSaveBtn">Save</button>
            </div>
          </div>

          <!-- Save to Library inline form (hidden by default) -->
          <div class="sg-page__lib-save-form" id="sgLibSaveForm" style="display:none">
            <input
              type="text"
              class="form-input sg-page__lib-name-input"
              id="sgLibNameInput"
              placeholder="Theme name (e.g. My Dark Indigo)…"
              maxlength="60"
            />
            <button class="scr-btn scr-btn--primary scr-btn--sm" id="sgLibSaveConfirm">Save</button>
            <button class="scr-btn scr-btn--sm" id="sgLibSaveCancel">Cancel</button>
          </div>

        </div>
      </div>
    `;
  }

  _bindEvents() {
    /* ---- Navigation ---- */
    this.container.querySelector('#sgBtnBack')
      .addEventListener('click', () => this.router.navigate(this._from, { projectId: this._projectId }));

    this.container.querySelector('#sgBtnModelConfigs')
      .addEventListener('click', () => this._modelConfigsModal.show());

    this.container.querySelector('#sgBtnGit')
      .addEventListener('click', () => this.router.navigate(this._from, { projectId: this._projectId }));

    /* ---- Preview state ---- */
    let activeTheme = 'dark';

    const frame = this.container.querySelector('#sgPreviewFrame');

    const blankHtml = theme => {
      const bg = { dark: '#0f1117', light: '#f0ece6' }[theme] || '#0f1117';
      return `<html><body style="margin:0;height:100vh;background:${bg};display:flex;align-items:center;justify-content:center;font-family:system-ui"><p style="color:#6b7280;font-size:12px;text-align:center">No ${theme} template yet.<br>Add one on the left to see the preview.</p></body></html>`;
    };

    const getActiveTpl = () => (activeTheme === 'light'
      ? this.container.querySelector('#sgTplLight')
      : this.container.querySelector('#sgTplDark')
    ).value.trim();

    const setActiveCol = () => {
      this.container.querySelector('#sgTplColLight').classList.toggle('scr-ds-tpl-col--active', activeTheme === 'light');
      this.container.querySelector('#sgTplColDark').classList.toggle('scr-ds-tpl-col--active',  activeTheme === 'dark');
    };

    const renderPreview = () => {
      const tpl = getActiveTpl();
      frame.srcdoc = tpl
        ? this._buildPreviewHtml(this._parseDesignTemplate(tpl), activeTheme)
        : blankHtml(activeTheme);
    };

    /* ---- Theme dropdown ---- */
    this.container.querySelector('#sgThemeSelect').addEventListener('change', e => {
      const id = Number(e.target.value);
      if (!id) return;
      const theme = this._libraryThemes.find(t => t.id === id);
      if (!theme) return;
      this.container.querySelector('#sgTplLight').value = theme.light || '';
      this.container.querySelector('#sgTplDark').value  = theme.dark  || '';
      renderPreview();
    });

    /* ---- New button ---- */
    this.container.querySelector('#sgNewBtn').addEventListener('click', () => {
      this.container.querySelector('#sgTplLight').value = '';
      this.container.querySelector('#sgTplDark').value  = '';
      this.container.querySelector('#sgThemeSelect').value = '';
      renderPreview();
    });

    /* ---- Textarea live preview ---- */
    this.container.querySelector('#sgTplLight').addEventListener('input', () => { if (activeTheme === 'light') renderPreview(); });
    this.container.querySelector('#sgTplDark').addEventListener('input',  () => { if (activeTheme === 'dark')  renderPreview(); });
    this.container.querySelector('#sgRefreshBtn').addEventListener('click', renderPreview);

    /* ---- Theme toggle buttons ---- */
    this.container.querySelectorAll('.scr-ds-theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.scr-ds-theme-btn').forEach(b => b.classList.remove('scr-ds-theme-btn--active'));
        btn.classList.add('scr-ds-theme-btn--active');
        activeTheme = btn.dataset.theme;
        setActiveCol();
        renderPreview();
      });
    });

    /* ---- Save Style Guide ---- */
    this.container.querySelector('#sgSaveBtn').addEventListener('click', async () => {
      const saveBtn  = this.container.querySelector('#sgSaveBtn');
      const tplLight = this.container.querySelector('#sgTplLight').value.trim();
      const tplDark  = this.container.querySelector('#sgTplDark').value.trim();
      const tpl      = JSON.stringify({ light: tplLight, dark: tplDark });
      saveBtn.disabled    = true;
      saveBtn.textContent = 'Saving…';
      await window.db.projects.update({ id: this._projectId, design_template: tpl });
      if (this._project) this._project.design_template = tpl;
      const badge = this.container.querySelector('.sg-page__badge');
      if (badge) {
        badge.classList.add('sg-page__badge--active');
        badge.textContent = 'Active — applied to all screens';
      }
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save';
    });

    this._renderPreview = renderPreview;

    /* ---- Save to Library ---- */
    const saveToLibBtn   = this.container.querySelector('#sgSaveToLibraryBtn');
    const libSaveForm    = this.container.querySelector('#sgLibSaveForm');
    const libNameInput   = this.container.querySelector('#sgLibNameInput');
    const libSaveConfirm = this.container.querySelector('#sgLibSaveConfirm');
    const libSaveCancel  = this.container.querySelector('#sgLibSaveCancel');

    saveToLibBtn.addEventListener('click', () => {
      libSaveForm.style.display = '';
      libNameInput.value = '';
      libNameInput.focus();
    });

    libSaveCancel.addEventListener('click', () => {
      libSaveForm.style.display = 'none';
    });

    libSaveConfirm.addEventListener('click', async () => {
      const name  = libNameInput.value.trim();
      if (!name) { libNameInput.focus(); return; }
      const light = this.container.querySelector('#sgTplLight').value.trim();
      const dark  = this.container.querySelector('#sgTplDark').value.trim();
      libSaveConfirm.disabled    = true;
      libSaveConfirm.textContent = 'Saving…';
      await window.db.savedThemes.create({ name, light, dark });
      libSaveConfirm.disabled    = false;
      libSaveConfirm.textContent = 'Save';
      libSaveForm.style.display  = 'none';
      await this._loadThemeDropdown();
    });

    libNameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') libSaveConfirm.click();
      if (e.key === 'Escape') libSaveCancel.click();
    });

    this._bindAiPane();

    /* ---- Initial render ---- */
    setActiveCol();
    renderPreview();
  }

  /* ------------------------------------------------------------------ */
  /* AI Edits chat pane                                                  */
  /* ------------------------------------------------------------------ */
  _bindAiPane() {
    const card    = this.container.querySelector('#sgAiCard');
    const inputEl = card.querySelector('#sgAiInput');
    const msgsEl  = card.querySelector('#sgAiMessages');
    const sendBtn = card.querySelector('#sgAiSend');
    const lightTa = this.container.querySelector('#sgTplLight');
    const darkTa  = this.container.querySelector('#sgTplDark');

    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      const capped = Math.min(inputEl.scrollHeight, 160);
      inputEl.style.height = capped + 'px';
      inputEl.style.overflowY = inputEl.scrollHeight > 160 ? 'auto' : 'hidden';
    });

    card.querySelector('#sgAiClear').addEventListener('click', () => {
      msgsEl.innerHTML = '<p class="sg-ai-card__welcome">Conversation cleared.</p>';
    });

    const submit = () => {
      const instruction = inputEl.value.trim();
      if (!instruction) { inputEl.focus(); return; }
      this._runAiEdit(instruction, { msgsEl, sendBtn, inputEl, lightTa, darkTa });
      inputEl.value = '';
      inputEl.style.height = '';
      inputEl.style.overflowY = '';
    };

    card.querySelector('#sgAiSend').addEventListener('click', submit);
    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.altKey) { e.preventDefault(); submit(); }
    });
  }

  _appendChatMsg(msgsEl, role, text, isError = false) {
    msgsEl.querySelector('.sg-ai-card__welcome')?.remove();
    const el = document.createElement('div');
    el.className = `sg-ai-msg sg-ai-msg--${role}`;
    el.innerHTML = `<div class="sg-ai-msg__bubble${isError ? ' sg-ai-msg__bubble--error' : ''}">${escHtml(text)}</div>`;
    msgsEl.appendChild(el);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return el;
  }

  _updateChatMsg(msgEl, text, state = '') {
    const bubble = msgEl?.querySelector('.sg-ai-msg__bubble');
    if (!bubble) return;
    bubble.textContent = text;
    bubble.className = 'sg-ai-msg__bubble' + (state ? ` sg-ai-msg__bubble--${state}` : '');
    msgEl.closest('.sg-ai-card__messages')?.scrollTo({ top: 99999, behavior: 'smooth' });
  }

  _setChatMsgApplied(msgEl, light, dark, prevLight, prevDark, lightTa, darkTa) {
    const bubble = msgEl?.querySelector('.sg-ai-msg__bubble');
    if (!bubble) return;
    const previewSrc = (light || dark).trim().split('\n').filter(l => l.trim()).slice(0, 3).join('\n');
    const preview = previewSrc.length > 200 ? previewSrc.slice(0, 200) + '…' : previewSrc;
    bubble.className = 'sg-ai-msg__bubble sg-ai-msg__bubble--success';
    bubble.innerHTML = `<span class="sg-ai-msg__preview">${escHtml(preview)}</span><div class="sg-ai-msg__status-row"><span class="sg-ai-msg__applied">✓ Applied — review and save</span><button class="sg-ai-msg__revert-btn" title="Revert"><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2 9a6 6 0 1 0 1-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M2 4v4h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`;
    bubble.querySelector('.sg-ai-msg__revert-btn').addEventListener('click', () => {
      lightTa.value = prevLight;
      darkTa.value  = prevDark;
      this._renderPreview?.();
      const row = bubble.querySelector('.sg-ai-msg__status-row');
      if (row) row.innerHTML = '<span class="sg-ai-msg__reverted">↩ Reverted</span>';
    });
    msgEl.closest('.sg-ai-card__messages')?.scrollTo({ top: 99999, behavior: 'smooth' });
  }

  _runAiEdit(instruction, { msgsEl, sendBtn, inputEl, lightTa, darkTa }) {
    const cfg = this._aiModelConfig;
    this._appendChatMsg(msgsEl, 'user', instruction);

    if (!cfg) {
      this._appendChatMsg(msgsEl, 'ai', 'No model selected — choose one in the header.', true);
      return;
    }

    const existingLight = lightTa.value.trim();
    const existingDark  = darkTa.value.trim();
    const prompt        = this._buildGenerationPrompt(instruction, existingLight, existingDark);

    const aiMsgEl = this._appendChatMsg(msgsEl, 'ai', 'Generating…');
    this._updateChatMsg(aiMsgEl, 'Generating…', 'thinking');

    sendBtn.disabled = true;
    inputEl.disabled = true;

    let rawResponse = '';
    let charCount   = 0;

    window.app.chat.offAll();

    window.app.chat.onToken(({ text }) => {
      rawResponse += text;
      charCount   += text.length;
      this._updateChatMsg(aiMsgEl, `Generating… ${charCount} chars`, 'thinking');
    });

    window.app.chat.onDone(({ raw, error }) => {
      window.app.chat.offAll();
      sendBtn.disabled = false;
      inputEl.disabled = false;
      inputEl.focus();

      const finalText = raw || rawResponse;
      if (!finalText && error) {
        this._updateChatMsg(aiMsgEl, `Error: ${error}`, 'error');
        return;
      }

      const { light, dark } = this._splitThemeResponse(finalText);

      if (light) lightTa.value = light;
      if (dark)  darkTa.value  = dark;

      if (light || dark) {
        this._renderPreview?.();
        this._setChatMsgApplied(aiMsgEl, light, dark, existingLight, existingDark, lightTa, darkTa);
      } else {
        this._updateChatMsg(aiMsgEl, 'No theme content returned. Try rephrasing.', 'error');
      }
    });

    window.app.chat.generate({ prompt, model: cfg });
  }

  _buildGenerationPrompt(userInput, existingLight = '', existingDark = '') {
    const hasExisting = existingLight || existingDark;

    if (hasExisting) {
      // Refine mode: keep exact structure, only swap hex color values
      return `You are a UI/UX design expert. The user wants to adjust their existing theme colors.

User's request: "${userInput}"

Below are the current light and dark theme definitions. Your ONLY job is to replace the hex color values (#xxxxxx) to match the requested aesthetic. Every other character — labels, typography, font sizes, font weights, border-radius values, padding, spacing, line-height, and all non-color text — must remain EXACTLY as it is, word for word.

--- EXISTING LIGHT THEME ---
${existingLight || '(empty)'}

--- EXISTING DARK THEME ---
${existingDark || '(empty)'}

Output the updated themes using EXACTLY the same structure and text as above, with ONLY hex color codes changed. Use these exact section headers and nothing else outside them:

--- LIGHT THEME ---
[full light theme text with only hex colors updated]

--- DARK THEME ---
[full dark theme text with only hex colors updated]

Rules:
- Replace ONLY lines that contain a hex color code (#xxxxxx). Do not touch any other lines.
- Use only real hex codes (e.g. #1e3a5f). No color names, no CSS variables.
- Do not add, remove, or reword any labels, sections, or non-color values.
- Output nothing outside the two theme blocks.`;
    }

    // Fresh generation mode: no existing theme to reference
    return `You are a UI/UX design expert specializing in desktop application themes. Generate a complete style guide for a desktop app.

User's aesthetic request: "${userInput}"

Output EXACTLY in this format — no extra commentary, no markdown fences, no preamble:

--- LIGHT THEME ---
Color Palette:
- Primary: #hex
- Background: #hex
- Surface: #hex
- Text primary: #hex
- Text secondary: #hex
- Border: #hex
- Danger: #ef4444

Typography:
- Font family: 'Font Name', system-ui, sans-serif
- Heading: font-weight 600, font-size 24px
- Body: font-weight 400, font-size 14px, line-height 1.5

Components:
- Buttons: border-radius 8px, padding 8px 18px, font-weight 500
- Cards: border-radius 12px, border 1px solid [border-hex], background [surface-hex]
- Inputs: border-radius 8px, background [background-hex], border 1px solid [border-hex]

--- DARK THEME ---
Color Palette:
- Primary: #hex
- Background: #hex
- Surface: #hex
- Text primary: #hex
- Text secondary: #hex
- Border: #hex
- Danger: #ef4444

Typography:
- Font family: 'Font Name', system-ui, sans-serif
- Heading: font-weight 600, font-size 24px
- Body: font-weight 400, font-size 14px, line-height 1.5

Components:
- Buttons: border-radius 8px, padding 8px 18px, font-weight 500
- Cards: border-radius 12px, border 1px solid [border-hex], background [surface-hex]
- Inputs: border-radius 8px, background [background-hex], border 1px solid [border-hex]

Rules:
- Use only real hex color codes (e.g. #1e3a5f, not "navy" or "var(--something)")
- Keep the exact section headers "--- LIGHT THEME ---" and "--- DARK THEME ---"
- Do not add any text outside the two theme blocks`;
  }

  _splitThemeResponse(raw) {
    if (!raw) return { light: '', dark: '' };

    const darkMarkerRe  = /---\s*DARK\s*THEME\s*---/i;
    const lightMarkerRe = /---\s*LIGHT\s*THEME\s*---/i;

    const darkIdx  = raw.search(darkMarkerRe);
    const lightIdx = raw.search(lightMarkerRe);

    let light = '';
    let dark  = '';

    if (darkIdx !== -1) {
      // Everything between LIGHT marker (or start) and DARK marker
      const lightEnd = darkIdx;
      const rawLight = lightIdx !== -1 ? raw.slice(lightIdx, lightEnd) : raw.slice(0, lightEnd);
      // Strip the LIGHT header line itself
      light = rawLight.replace(lightMarkerRe, '').trim();
      // Everything after the DARK marker header line
      const afterDark = raw.slice(darkIdx);
      dark = afterDark.replace(darkMarkerRe, '').trim();
    } else {
      // No DARK marker found — put everything in dark (fallback)
      dark = raw.replace(lightMarkerRe, '').trim();
    }

    return { light, dark };
  }

  /* ------------------------------------------------------------------ */
  /* Theme Library                                                       */
  /* ------------------------------------------------------------------ */
  async _seedBuiltinThemes() {
    const existing = await window.db.savedThemes.list();
    if (existing.length === 0) {
      for (const preset of BUILTIN_PRESETS) {
        await window.db.savedThemes.create({ name: preset.label, light: preset.light, dark: preset.dark });
      }
    }
  }

  async _loadThemeDropdown() {
    const select = this.container.querySelector('#sgThemeSelect');
    if (!select) return;
    this._libraryThemes = await window.db.savedThemes.list();
    const current = select.value;
    select.innerHTML = '<option value="">— Select a theme —</option>' +
      this._libraryThemes.map(t => `<option value="${t.id}">${escHtml(t.name)}</option>`).join('');
    if (current && this._libraryThemes.some(t => String(t.id) === current)) select.value = current;
  }

  /* ------------------------------------------------------------------ */
  /* Preview rendering                                                   */
  /* ------------------------------------------------------------------ */
  _parseDesignTemplate(text) {
    const lines = text.split('\n');
    const hexRe = /#[0-9a-fA-F]{6,8}\b|#[0-9a-fA-F]{3,4}\b/;
    const r = {
      primary: null, background: null, surface: null,
      textPrimary: null, textSecondary: null,
      border: null, danger: null, fontFamily: null, borderRadius: null,
    };
    for (const line of lines) {
      const low = line.toLowerCase().replace(/[_\-]/g, ' ');
      const hex = line.match(hexRe)?.[0];
      if (!r.primary    && hex && /\bprimary\b/.test(low) && !/text|on |background|container/.test(low)) r.primary = hex;
      if (!r.background && hex && /background|\bbg\b/.test(low) && !/surface|card|container/.test(low))  r.background = hex;
      if (!r.surface    && hex && /\bsurface\b|\bcard\b/.test(low) && !/variant|hover|secondary/.test(low)) r.surface = hex;
      if (!r.textPrimary   && hex && /text primary|on background|onbackground|on surface(?! variant)/.test(low)) r.textPrimary = hex;
      if (!r.textSecondary && hex && /text secondary|text muted|onsurface|on surface/.test(low)) r.textSecondary = hex;
      if (!r.border && hex && /\bborder\b|\boutline\b/.test(low) && !/radius/.test(low)) r.border = hex;
      if (!r.danger && hex && /\bdanger\b|\berror\b/.test(low)) r.danger = hex;
      if (!r.fontFamily) {
        const m = line.match(/font[- ]family\s*[: ]+(.+)/i);
        if (m) r.fontFamily = m[1].split(',')[0].trim().replace(/^['"]|['"]$/g, '') + ', system-ui, sans-serif';
      }
      if (!r.borderRadius && /button|card|input|border.?radius|borderradius/i.test(low)) {
        const rx = line.match(/(\d+)\s*(?:px|dp)\b/);
        if (rx) r.borderRadius = `${rx[1]}px`;
      }
    }
    return {
      primary:       r.primary       || '#6366f1',
      background:    r.background    || '#0f1117',
      surface:       r.surface       || '#1a1d27',
      textPrimary:   r.textPrimary   || '#f1f5f9',
      textSecondary: r.textSecondary || '#94a3b8',
      border:        r.border        || '#2a2d3e',
      danger:        r.danger        || '#ef4444',
      fontFamily:    r.fontFamily    || "'Segoe UI', system-ui, sans-serif",
      borderRadius:  r.borderRadius  || '8px',
    };
  }

  _buildPreviewHtml(v, contextTheme = 'dark') {
    const toRgb = hex => {
      const h    = hex.replace('#', '');
      const full = h.length <= 4 ? h.split('').map(c => c + c).join('') : h;
      return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)).join(',');
    };
    const primaryRgb = toRgb(v.primary);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:${v.background};color:${v.textPrimary};font-family:${v.fontFamily};font-size:13px;padding:16px;display:flex;flex-direction:column;gap:12px;min-height:100vh}
.card{background:${v.surface};border:1px solid ${v.border};border-radius:${v.borderRadius};padding:14px}
h3{font-size:14px;font-weight:600;margin-bottom:5px}
p{color:${v.textSecondary};font-size:12px;line-height:1.6;margin-bottom:10px}
.btn-row{display:flex;gap:7px;flex-wrap:wrap}
button{display:inline-flex;align-items:center;padding:6px 13px;font-size:12px;font-weight:500;border-radius:${v.borderRadius};border:none;cursor:pointer;font-family:inherit}
.btn-primary{background:${v.primary};color:#fff}
.btn-outline{background:transparent;color:${v.primary};border:1px solid ${v.primary}}
.btn-muted{background:transparent;color:${v.textSecondary};border:1px solid ${v.border}}
.btn-danger{background:${v.danger};color:#fff}
input{display:block;width:100%;padding:6px 9px;margin-bottom:9px;background:${v.background};border:1px solid ${v.border};border-radius:${v.borderRadius};color:${v.textPrimary};font-size:12px;font-family:inherit;outline:none}
.badge{display:inline-flex;align-items:center;font-size:11px;padding:2px 8px;border-radius:999px;background:rgba(${primaryRgb},.12);color:${v.primary};border:1px solid rgba(${primaryRgb},.3);margin-bottom:10px}
.swatches{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.sw{display:flex;flex-direction:column;align-items:center;gap:3px}
.sw-dot{width:28px;height:28px;border-radius:6px;border:1px solid ${v.border}}
.sw-lbl{font-size:9px;color:${v.textSecondary}}
</style></head><body>
<div class="card"><h3>Color Palette</h3><p>Extracted from your style guide.</p>
<div class="swatches">
<div class="sw"><div class="sw-dot" style="background:${v.primary}"></div><div class="sw-lbl">Primary</div></div>
<div class="sw"><div class="sw-dot" style="background:${v.background}"></div><div class="sw-lbl">BG</div></div>
<div class="sw"><div class="sw-dot" style="background:${v.surface}"></div><div class="sw-lbl">Surface</div></div>
<div class="sw"><div class="sw-dot" style="background:${v.textPrimary}"></div><div class="sw-lbl">Text</div></div>
<div class="sw"><div class="sw-dot" style="background:${v.textSecondary}"></div><div class="sw-lbl">Muted</div></div>
<div class="sw"><div class="sw-dot" style="background:${v.danger}"></div><div class="sw-lbl">Danger</div></div>
</div></div>
<div class="card"><h3>Typography</h3><p>Font: ${v.fontFamily.split(',')[0]} · Border radius: ${v.borderRadius}</p><span class="badge">Active</span></div>
<div class="card"><h3>Form Elements</h3>
<input type="text" placeholder="Sample input field…"/>
<div class="btn-row">
<button class="btn-primary">Primary</button>
<button class="btn-outline">Outline</button>
<button class="btn-muted">Muted</button>
<button class="btn-danger">Danger</button>
</div></div>
</body></html>`;
  }
}
