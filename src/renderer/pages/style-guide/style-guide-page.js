import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelPicker }       from '../../components/model-picker/model-picker.js';
import { ProjectSidebar }    from '../../components/project-sidebar/project-sidebar.js';
import { Dialog }            from '../../components/dialog/dialog.js';

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

/* ------------------------------------------------------------------ */
/* Material mobile presets — Material 3 tone/shape language, meant     */
/* for Flutter/Android targets so there's no contradiction between the */
/* preset's own Components block and the appended Platform: guidance.  */
/* ------------------------------------------------------------------ */
const MATERIAL_PRESETS = [
  {
    label: 'Material Indigo',
    light:
`Color Palette:
- Primary: #6750a4
- Background: #fffbfe
- Surface: #f3edf7
- Text primary: #1c1b1f
- Text secondary: #49454f
- Border: #79747e
- Danger: #b3261e

Typography:
- Font family: 'Roboto', 'Segoe UI', sans-serif
- Heading: font-weight 500, font-size 22px
- Body: font-weight 400, font-size 14px, line-height 1.5

Components:
- Buttons: fully rounded (pill shape), padding 10px 24px, font-weight 500, tonal elevation shadow instead of a border
- Cards: border-radius 16px, elevation shadow instead of a border, background #f3edf7
- Inputs: filled Material style, border-radius 12px 12px 0 0, bottom-border 2px solid #6750a4, background #f3edf7`,
    dark:
`Color Palette:
- Primary: #d0bcff
- Background: #1c1b1f
- Surface: #2b2930
- Text primary: #e6e1e5
- Text secondary: #cac4d0
- Border: #938f99
- Danger: #f2b8b5

Typography:
- Font family: 'Roboto', 'Segoe UI', sans-serif
- Heading: font-weight 500, font-size 22px
- Body: font-weight 400, font-size 14px, line-height 1.5

Components:
- Buttons: fully rounded (pill shape), padding 10px 24px, font-weight 500, tonal elevation shadow instead of a border
- Cards: border-radius 16px, elevation shadow instead of a border, background #2b2930
- Inputs: filled Material style, border-radius 12px 12px 0 0, bottom-border 2px solid #d0bcff, background #2b2930`,
  },
  {
    label: 'Material Teal',
    light:
`Color Palette:
- Primary: #00897b
- Background: #f5fffd
- Surface: #e0f2f1
- Text primary: #062019
- Text secondary: #33564e
- Border: #7ba79e
- Danger: #ba1a1a

Typography:
- Font family: 'Roboto', 'Segoe UI', sans-serif
- Heading: font-weight 500, font-size 22px
- Body: font-weight 400, font-size 14px, line-height 1.5

Components:
- Buttons: fully rounded (pill shape), padding 10px 24px, font-weight 500, tonal elevation shadow instead of a border
- Cards: border-radius 16px, elevation shadow instead of a border, background #e0f2f1
- Inputs: filled Material style, border-radius 12px 12px 0 0, bottom-border 2px solid #00897b, background #e0f2f1`,
    dark:
`Color Palette:
- Primary: #4db6ac
- Background: #0a1f1b
- Surface: #123832
- Text primary: #d2f1ec
- Text secondary: #8fc6bd
- Border: #2e6259
- Danger: #ffb4ab

Typography:
- Font family: 'Roboto', 'Segoe UI', sans-serif
- Heading: font-weight 500, font-size 22px
- Body: font-weight 400, font-size 14px, line-height 1.5

Components:
- Buttons: fully rounded (pill shape), padding 10px 24px, font-weight 500, tonal elevation shadow instead of a border
- Cards: border-radius 16px, elevation shadow instead of a border, background #123832
- Inputs: filled Material style, border-radius 12px 12px 0 0, bottom-border 2px solid #4db6ac, background #123832`,
  },
  {
    label: 'Material Coral',
    light:
`Color Palette:
- Primary: #e64a45
- Background: #fffbff
- Surface: #ffedea
- Text primary: #2c1512
- Text secondary: #5e4038
- Border: #c0a099
- Danger: #ba1a1a

Typography:
- Font family: 'Roboto', 'Segoe UI', sans-serif
- Heading: font-weight 500, font-size 22px
- Body: font-weight 400, font-size 14px, line-height 1.5

Components:
- Buttons: fully rounded (pill shape), padding 10px 24px, font-weight 500, tonal elevation shadow instead of a border
- Cards: border-radius 16px, elevation shadow instead of a border, background #ffedea
- Inputs: filled Material style, border-radius 12px 12px 0 0, bottom-border 2px solid #e64a45, background #ffedea`,
    dark:
`Color Palette:
- Primary: #ffb4a9
- Background: #201a18
- Surface: #3b2b27
- Text primary: #ffede9
- Text secondary: #e8beb4
- Border: #8a6c64
- Danger: #ffb4ab

Typography:
- Font family: 'Roboto', 'Segoe UI', sans-serif
- Heading: font-weight 500, font-size 22px
- Body: font-weight 400, font-size 14px, line-height 1.5

Components:
- Buttons: fully rounded (pill shape), padding 10px 24px, font-weight 500, tonal elevation shadow instead of a border
- Cards: border-radius 16px, elevation shadow instead of a border, background #3b2b27
- Inputs: filled Material style, border-radius 12px 12px 0 0, bottom-border 2px solid #ffb4a9, background #3b2b27`,
  },
  {
    label: 'DebtLogic Green',
    light:
`Color Palette:
- Primary: #13ec5b
- Background: #ffffff
- Surface: #f8faf8
- Text primary: #0f172a
- Text secondary: #64748b
- Border: #e2e8f0
- Danger: #ef4444

Typography:
- Font family: 'Manrope', 'Segoe UI', sans-serif
- Heading: font-weight 800, font-size 24px
- Body: font-weight 400, font-size 14px, line-height 1.5

Components:
- Buttons: fully rounded (pill shape), padding 10px 20px, font-weight 700, elevation shadow instead of a border
- Cards: border-radius 12px, elevation shadow (soft, low-elevation) instead of a border, background #f8faf8
- Inputs: filled Material style, border-radius 12px, background #f1f5f9, no visible border, primary-coloured focus ring

Notes:
- Hero/AppBar gradient (brand accent, layer over Primary on header surfaces only): linear-gradient(160deg, #1b6b40, #236e47, #2d8a57)
- Icons: Material Symbols Outlined, variable FILL axis — FILL 0 (outline) default/inactive, FILL 1 (filled) active/selected
- Status colour keying: danger/red = overdue, #f59e0b (amber) = due-soon/warning, #8b5cf6 (violet) = AI insight, #3b82f6 (blue) = informational, primary = positive/progress`,
    dark:
`Color Palette:
- Primary: #13ec5b
- Background: #102216
- Surface: #1a2e22
- Text primary: #ffffff
- Text secondary: #94a3b8
- Border: #1e293b
- Danger: #ef4444

Typography:
- Font family: 'Manrope', 'Segoe UI', sans-serif
- Heading: font-weight 800, font-size 24px
- Body: font-weight 400, font-size 14px, line-height 1.5

Components:
- Buttons: fully rounded (pill shape), padding 10px 20px, font-weight 700, elevation shadow instead of a border
- Cards: border-radius 12px, elevation shadow (soft, low-elevation) instead of a border, background #1a2e22
- Inputs: filled Material style, border-radius 12px, background rgba(255,255,255,0.05), no visible border, primary-coloured focus ring

Notes:
- Hero/AppBar gradient (brand accent, layer over Primary on header surfaces only): linear-gradient(160deg, #1b6b40, #236e47, #2d8a57)
- Icons: Material Symbols Outlined, variable FILL axis — FILL 0 (outline) default/inactive, FILL 1 (filled) active/selected
- Status colour keying: danger/red = overdue, #f59e0b (amber) = due-soon/warning, #8b5cf6 (violet) = AI insight, #3b82f6 (blue) = informational, primary = positive/progress`,
  },
];

/* ------------------------------------------------------------------ */
/* Platform sections — appended to Light/Dark theme text when a       */
/* mobile target platform is selected, so the platform's component    */
/* language travels with the theme text itself into the AI prompt.    */
/* ------------------------------------------------------------------ */
const PLATFORM_TEXT_BLOCKS = {
  flutter:
`Platform: Flutter (Material 3) — mocked in HTML/CSS
- Frame: phone viewport, max-width ~420px, centered on the page (not desktop-wide)
- Buttons: fully rounded or 20px radius, tonal elevation shadow instead of a border (ElevatedButton/FilledButton style)
- Text fields: filled/outlined Material style with floating label, not plain bordered inputs
- Cards: 12–16px radius, soft elevation shadow (box-shadow), no 1px border
- FAB: 56px circle, bottom-right, elevation shadow, used for the primary add/action
- Navigation: Material top AppBar; BottomNavigationBar for tab navigation
- Colours: map Primary/Background/Surface above to Material roles (primary, onPrimary, surface, onSurface); use layered surface tones (elevation) instead of borders to separate cards from the background
- Touch targets: minimum 44px; single-column mobile-first layout; bottom sheets instead of desktop dropdowns/hover menus`,
  android:
`Platform: Android (Material Design) — mocked in HTML/CSS
- Frame: phone viewport, max-width ~420px, centered on the page (not desktop-wide)
- Buttons/cards/inputs: Material component shapes with ripple-style active states
- Cards & sheets: Material elevation shadows instead of borders to separate from the background; keep to an 8dp spacing grid (treat 1dp ≈ 1px in this HTML mock)
- Navigation: Material top app bar; bottom navigation bar or FAB for the primary action
- Feedback: Snackbars (bottom, pill-shaped) instead of toasts/alerts
- Colours: map Primary/Background/Surface above to Material roles (primary, onPrimary, surface, onSurface) rather than flat, borderless web colours
- Touch targets: minimum 48dp; single-column mobile-first layout; bottom sheets instead of desktop dropdowns/hover menus`,
};

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
    this._themeMenuOpen   = false;
    this._selectedThemeId = '';
    this._handleThemeMenuOutside = this._handleThemeMenuOutside.bind(this);
  }

  async mount() {
    injectCss('styles/screens.css');
    injectCss('pages/mockups/mockups-page.css');
    injectCss('pages/style-guide/style-guide-page.css');
    injectCss('components/project-sidebar/project-sidebar.css');
    applyStoredTheme();

    this._project = await window.db.projects.get(this._projectId);
    this.container.innerHTML = this._template();

    this._picker = new ModelPicker({
      anchor:   this.container.querySelector('#sgModelPicker'),
      onSelect: model => { this._aiModelConfig = model; },
    });
    await this._picker.reload();

    this._bindEvents();
    this._sidebar.bindEvents(this.container);
    this._sidebar.loadCounts(this.container);
    await this._seedBuiltinThemes();
    await this._loadThemeDropdown();
  }

  unmount() {
    window.app.chat.offAll();
    document.removeEventListener('click', this._handleThemeMenuOutside, true);
    removeCss('pages/style-guide/style-guide-page.css');
    removeCss('pages/mockups/mockups-page.css');
    removeCss('components/project-sidebar/project-sidebar.css');
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
    this._sidebar = new ProjectSidebar({ projectId: this._projectId, router: this.router, activeRoute: 'style-guide' });

    return `
      <div class="ph-project-shell">
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
          <span class="sg-page__badge${hasAny ? ' sg-page__badge--active' : ''}">
            ${hasAny ? 'Active — applied to all screens' : 'Not set'}
          </span>
        </header>

        <div class="ph-page-with-nav">
          ${this._sidebar.html()}
          <div class="sg-page">
        <div class="sg-page__body">
          <div class="sg-page__toolbar">
            <p class="sg-page__hint">
              Define colours, typography, spacing, and component styles for light and dark themes.
              Both are injected into every screen generation prompt.
            </p>
            <label class="sg-page__platform" for="sgPlatformSelect" style="display:flex;align-items:center;gap:6px;font-size:12px;opacity:.75;">
              Target platform
              <select class="scr-form__select" id="sgPlatformSelect" style="width:auto;">
                <option value="web"${(this._project?.target_platform || 'web') === 'web' ? ' selected' : ''}>Web</option>
                <option value="flutter"${this._project?.target_platform === 'flutter' ? ' selected' : ''}>Flutter (Material)</option>
                <option value="android"${this._project?.target_platform === 'android' ? ' selected' : ''}>Android (Material)</option>
              </select>
            </label>
            <div class="sg-theme-picker" id="sgThemePickerAnchor"></div>
          </div>

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
                <div class="scr-ds-theme-btns" id="sgThemeBtns">
                  <button class="scr-ds-theme-btn scr-ds-theme-btn--active" data-theme="light">Light</button>
                  <button class="scr-ds-theme-btn" data-theme="dark">Dark</button>
                </div>
                <div class="scr-ds-theme-btns" id="sgWidthBtns" hidden>
                  <button class="scr-ds-theme-btn" data-width="full">Full width</button>
                  <button class="scr-ds-theme-btn" data-width="mobile">Mobile width</button>
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
            <div class="sg-page__actions-right">
              <button class="scr-btn scr-btn--accent" id="sgSaveToLibraryBtn" type="button">Add to Library</button>
              <button class="scr-btn scr-btn--primary" id="sgSaveBtn">Apply</button>
            </div>
          </div>

        </div>
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
      .addEventListener('click', () => this.router.navigate('settings', { from: 'style-guide', fromParams: { projectId: this._projectId } }));

    /* ---- Preview state ---- */
    let activeTheme = 'light';

    const WIDTH_KEY = 'sg_preview_width_mode';
    let widthMode = localStorage.getItem(WIDTH_KEY) || 'full';

    const frame = this.container.querySelector('#sgPreviewFrame');

    const blankHtml = theme => {
      const bg = { dark: '#0f1117', light: '#f0ece6' }[theme] || '#0f1117';
      const scheme = theme === 'light' ? 'light' : 'dark';
      return `<html><head><meta name="color-scheme" content="${scheme}"><style>:root{color-scheme:${scheme}}</style></head><body style="margin:0;height:100vh;background:${bg};display:flex;align-items:center;justify-content:center;font-family:system-ui"><p style="color:#6b7280;font-size:12px;text-align:center">No ${theme} template yet.<br>Add one on the left to see the preview.</p></body></html>`;
    };

    const getActiveTpl = () => (activeTheme === 'light'
      ? this.container.querySelector('#sgTplLight')
      : this.container.querySelector('#sgTplDark')
    ).value.trim();

    const setActiveCol = () => {
      this.container.querySelector('#sgTplColLight').classList.toggle('scr-ds-tpl-col--active', activeTheme === 'light');
      this.container.querySelector('#sgTplColDark').classList.toggle('scr-ds-tpl-col--active',  activeTheme === 'dark');
    };

    const getActivePlatform = () => this.container.querySelector('#sgPlatformSelect')?.value || 'web';

    const getWidthMode = () => {
      const platform = getActivePlatform();
      return (platform === 'flutter' || platform === 'android') ? widthMode : 'full';
    };

    const syncWidthToggle = () => {
      const platform = getActivePlatform();
      const wrap = this.container.querySelector('#sgWidthBtns');
      if (!wrap) return;
      wrap.hidden = !(platform === 'flutter' || platform === 'android');
      wrap.querySelectorAll('.scr-ds-theme-btn').forEach(b =>
        b.classList.toggle('scr-ds-theme-btn--active', b.dataset.width === widthMode));
    };

    const renderPreview = () => {
      const tpl = getActiveTpl();
      frame.srcdoc = tpl
        ? this._buildPreviewHtml(this._parseDesignTemplate(tpl, activeTheme), activeTheme, getActivePlatform(), getWidthMode())
        : blankHtml(activeTheme);
    };

    /* ---- Theme dropdown (custom, matches AI Model picker) ---- */
    this._renderPreview = renderPreview;
    this._renderThemePicker();

    /* ---- Textarea live preview ---- */
    this.container.querySelector('#sgTplLight').addEventListener('input', () => { if (activeTheme === 'light') renderPreview(); });
    this.container.querySelector('#sgTplDark').addEventListener('input',  () => { if (activeTheme === 'dark')  renderPreview(); });
    this.container.querySelector('#sgRefreshBtn').addEventListener('click', renderPreview);

    /* ---- Theme toggle buttons ---- */
    this.container.querySelectorAll('#sgThemeBtns .scr-ds-theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('#sgThemeBtns .scr-ds-theme-btn').forEach(b => b.classList.remove('scr-ds-theme-btn--active'));
        btn.classList.add('scr-ds-theme-btn--active');
        activeTheme = btn.dataset.theme;
        setActiveCol();
        renderPreview();
      });
    });

    /* ---- Preview width toggle (Flutter/Android only) ---- */
    this.container.querySelectorAll('#sgWidthBtns .scr-ds-theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        widthMode = btn.dataset.width;
        localStorage.setItem(WIDTH_KEY, widthMode);
        syncWidthToggle();
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
      saveBtn.textContent = 'Applying…';
      await window.db.projects.update({ id: this._projectId, design_template: tpl });
      if (this._project) this._project.design_template = tpl;
      const badge = this.container.querySelector('.sg-page__badge');
      if (badge) {
        badge.classList.add('sg-page__badge--active');
        badge.textContent = 'Active — applied to all screens';
      }
      saveBtn.disabled    = false;
      saveBtn.textContent = '✓ Applied';
      saveBtn.classList.add('sg-page__save-btn--saved');
      setTimeout(() => {
        saveBtn.textContent = 'Apply';
        saveBtn.classList.remove('sg-page__save-btn--saved');
      }, 2000);
    });

    /* ---- Save to Library (centered modal, consistent with Project Layers) ---- */
    this.container.querySelector('#sgSaveToLibraryBtn').addEventListener('click', async () => {
      const name = await Dialog.prompt('Name this theme to save it to the shared library.', {
        title:       'Add to Library',
        placeholder: 'Theme name (e.g. My Dark Indigo)…',
        confirmText: 'Save',
        maxLength:   60,
      });
      if (!name) return;

      const light    = this.container.querySelector('#sgTplLight').value.trim();
      const dark     = this.container.querySelector('#sgTplDark').value.trim();
      const platform = this.container.querySelector('#sgPlatformSelect')?.value || 'web';
      const category = (platform === 'flutter' || platform === 'android') ? 'mobile' : 'web';
      await window.db.savedThemes.create({ name, light, dark, category });
      await this._loadThemeDropdown();
    });

    this._bindAiPane();

    /* ---- Target platform — bake platform component language into the theme text ---- */
    this.container.querySelector('#sgPlatformSelect').addEventListener('change', async (e) => {
      const target_platform = e.target.value;
      const block = PLATFORM_TEXT_BLOCKS[target_platform] || '';

      // The platform block is always appended last, so strip-to-end + re-append keeps this idempotent
      const applyBlock = ta => {
        const stripped = ta.value.replace(/\n{1,2}Platform:[\s\S]*$/, '').trimEnd();
        ta.value = block ? `${stripped}\n\n${block}` : stripped;
      };
      applyBlock(this.container.querySelector('#sgTplLight'));
      applyBlock(this.container.querySelector('#sgTplDark'));
      syncWidthToggle();
      renderPreview();
      this._renderThemePicker();

      await window.db.projects.update({ id: this._projectId, target_platform });
      if (this._project) this._project.target_platform = target_platform;
    });

    /* ---- Initial render ---- */
    setActiveCol();
    syncWidthToggle();
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
    const existingNames = new Set(existing.map(t => t.name));

    for (const preset of BUILTIN_PRESETS) {
      if (existingNames.has(preset.label)) continue;
      await window.db.savedThemes.create({ name: preset.label, light: preset.light, dark: preset.dark, category: 'web' });
    }
    for (const preset of MATERIAL_PRESETS) {
      if (existingNames.has(preset.label)) continue;
      await window.db.savedThemes.create({ name: preset.label, light: preset.light, dark: preset.dark, category: 'mobile' });
    }
  }

  async _loadThemeDropdown() {
    this._libraryThemes = await window.db.savedThemes.list();
    this._renderThemePicker();
  }

  /* ------------------------------------------------------------------ */
  /* Custom "Themes" dropdown — mirrors the AI Model picker so the       */
  /* expanded list renders with app colors instead of the native <select> */
  /* popup (which Chromium always paints with the OS light scheme).      */
  /* ------------------------------------------------------------------ */
  _renderThemePicker() {
    const anchor = this.container.querySelector('#sgThemePickerAnchor');
    if (!anchor) return;

    const open = this._themeMenuOpen;
    const selected = this._selectedThemeId === '__empty__'
      ? 'Empty Template'
      : this._libraryThemes.find(t => String(t.id) === String(this._selectedThemeId))?.name;

    const platform     = this.container.querySelector('#sgPlatformSelect')?.value || 'web';
    const wantCategory = (platform === 'flutter' || platform === 'android') ? 'mobile' : 'web';
    const visibleThemes = this._libraryThemes.filter(t => (t.category || 'web') === wantCategory);

    anchor.innerHTML = `
      <div class="sg-theme-picker__wrap">
        <button class="sg-theme-picker__trigger" type="button" id="sgThemeTrigger"
                aria-haspopup="listbox" aria-expanded="${open}">
          <span class="sg-theme-picker__label">${escHtml(selected || 'Themes')}</span>
          <svg class="sg-theme-picker__caret${open ? ' sg-theme-picker__caret--open' : ''}"
               width="10" height="10" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        ${open ? `
          <div class="sg-theme-picker__menu" role="listbox">
            <button class="sg-theme-picker__item${this._selectedThemeId === '__empty__' ? ' sg-theme-picker__item--active' : ''}"
                    data-id="__empty__" role="option" type="button">Empty Template</button>
            ${visibleThemes.map(t => `
              <button class="sg-theme-picker__item${String(this._selectedThemeId) === String(t.id) ? ' sg-theme-picker__item--active' : ''}"
                      data-id="${t.id}" role="option" type="button">${escHtml(t.name)}</button>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;

    anchor.querySelector('#sgThemeTrigger').addEventListener('click', e => {
      e.stopPropagation();
      this._themeMenuOpen = !this._themeMenuOpen;
      if (this._themeMenuOpen) document.addEventListener('click', this._handleThemeMenuOutside, true);
      else                     document.removeEventListener('click', this._handleThemeMenuOutside, true);
      this._renderThemePicker();
    });

    if (open) {
      anchor.querySelectorAll('.sg-theme-picker__item').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          this._pickTheme(btn.dataset.id);
        });
      });
    }
  }

  _pickTheme(id) {
    this._selectedThemeId = id;
    this._themeMenuOpen   = false;
    document.removeEventListener('click', this._handleThemeMenuOutside, true);

    if (id === '__empty__') {
      this.container.querySelector('#sgTplLight').value = '';
      this.container.querySelector('#sgTplDark').value  = '';
    } else {
      const theme = this._libraryThemes.find(t => String(t.id) === String(id));
      if (theme) {
        this.container.querySelector('#sgTplLight').value = theme.light || '';
        this.container.querySelector('#sgTplDark').value  = theme.dark  || '';
      }
    }

    // Re-apply the current target platform's component language, since the theme swap above just replaced the raw text
    const platform = this.container.querySelector('#sgPlatformSelect')?.value;
    const block = PLATFORM_TEXT_BLOCKS[platform] || '';
    if (block) {
      [this.container.querySelector('#sgTplLight'), this.container.querySelector('#sgTplDark')].forEach(ta => {
        const stripped = ta.value.replace(/\n{1,2}Platform:[\s\S]*$/, '').trimEnd();
        ta.value = `${stripped}\n\n${block}`;
      });
    }

    this._renderPreview?.();
    this._renderThemePicker();
  }

  _handleThemeMenuOutside(e) {
    const anchor = this.container.querySelector('#sgThemePickerAnchor');
    if (anchor && !anchor.contains(e.target)) {
      this._themeMenuOpen = false;
      document.removeEventListener('click', this._handleThemeMenuOutside, true);
      this._renderThemePicker();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Preview rendering                                                   */
  /* ------------------------------------------------------------------ */
  _parseDesignTemplate(text, theme = 'dark') {
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
    const fallback = theme === 'light'
      ? {
          primary:       '#6366f1',
          background:    '#ffffff',
          surface:       '#f4f4f5',
          textPrimary:   '#18181b',
          textSecondary: '#52525b',
          border:        '#d4d4d8',
          danger:        '#ef4444',
        }
      : {
          primary:       '#6366f1',
          background:    '#0f1117',
          surface:       '#1a1d27',
          textPrimary:   '#f1f5f9',
          textSecondary: '#94a3b8',
          border:        '#2a2d3e',
          danger:        '#ef4444',
        };

    return {
      primary:       r.primary       || fallback.primary,
      background:    r.background    || fallback.background,
      surface:       r.surface       || fallback.surface,
      textPrimary:   r.textPrimary   || fallback.textPrimary,
      textSecondary: r.textSecondary || fallback.textSecondary,
      border:        r.border        || fallback.border,
      danger:        r.danger        || fallback.danger,
      fontFamily:    r.fontFamily    || "'Segoe UI', system-ui, sans-serif",
      borderRadius:  r.borderRadius  || '8px',
    };
  }

  _buildPreviewHtml(v, contextTheme = 'dark', platform = 'web', widthMode = 'full') {
    if (platform === 'flutter' || platform === 'android') {
      return this._buildPhonePreviewHtml(v, contextTheme, platform, widthMode);
    }
    const toRgb = hex => {
      const h    = hex.replace('#', '');
      const full = h.length <= 4 ? h.split('').map(c => c + c).join('') : h;
      return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)).join(',');
    };
    const primaryRgb = toRgb(v.primary);
    const scheme = contextTheme === 'light' ? 'light' : 'dark';
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="${scheme}"><style>
:root{color-scheme:${scheme}}
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

  _buildPhonePreviewHtml(v, contextTheme, platform, widthMode = 'full') {
    const scheme     = contextTheme === 'light' ? 'light' : 'dark';
    const stageBg    = contextTheme === 'light' ? '#e8e5df' : '#05070a';
    const cardRadius = Math.max(parseInt(v.borderRadius, 10) || 8, 12) + 'px';
    const isFull      = widthMode === 'full';
    const label       = (platform === 'flutter' ? 'Flutter · Material 3' : 'Android · Material') + (isFull ? ' · Full width' : ' · Mobile');
    const phoneRule   = isFull
      ? `width:100%;min-height:520px;border-radius:${cardRadius};border:1px solid ${v.border};box-shadow:none;`
      : `width:240px;height:440px;border-radius:26px;border:6px solid ${v.border};box-shadow:0 12px 28px rgba(0,0,0,.35);`;

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="${scheme}"><style>
:root{color-scheme:${scheme}}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:${stageBg};font-family:${v.fontFamily};min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.stage{display:flex;flex-direction:column;align-items:center;gap:12px;width:${isFull ? '100%' : 'auto'}}
.stage-label{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${v.textSecondary}}
.phone{${phoneRule}background:${v.background};overflow:hidden;display:flex;flex-direction:column;position:relative}
.appbar{flex:none;height:44px;background:${v.surface};display:flex;align-items:center;padding:0 14px;box-shadow:0 1px 4px rgba(0,0,0,.2);z-index:2}
.appbar-title{font-size:13px;font-weight:600;color:${v.textPrimary}}
.body{flex:1;padding:12px;display:flex;flex-direction:column;gap:10px;overflow:hidden}
.card{background:${v.surface};border-radius:${cardRadius};padding:10px 12px;box-shadow:0 1px 4px rgba(0,0,0,.18)}
.line{height:6px;border-radius:3px;background:${v.textPrimary};margin-bottom:6px}
.line.sub{background:${v.textSecondary};height:5px}
.chip-row{display:flex;gap:6px;margin-top:6px}
.chip{font-size:9px;padding:4px 10px;border-radius:999px;font-weight:600}
.chip.filled{background:${v.primary};color:${v.background}}
.chip.outline{border:1px solid ${v.primary};color:${v.primary}}
.field{background:${v.background};border-radius:8px 8px 0 0;border-bottom:2px solid ${v.primary};padding:8px 10px;font-size:10px;color:${v.textSecondary}}
.row{display:flex;align-items:center;gap:8px}
.avatar{width:22px;height:22px;border-radius:50%;background:${v.primary};flex:none}
.fab{position:absolute;right:14px;bottom:66px;width:44px;height:44px;border-radius:50%;background:${v.primary};box-shadow:0 4px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:${v.background};font-size:20px;font-weight:700;z-index:3}
.navbar{flex:none;height:52px;background:${v.surface};border-top:1px solid ${v.border};display:flex;align-items:center;justify-content:space-around}
.navdot{width:18px;height:18px;border-radius:6px}
.navdot.active{background:${v.primary}}
.navdot.inactive{background:${v.textSecondary};opacity:.4}
</style></head><body>
<div class="stage">
<div class="stage-label">${label}</div>
<div class="phone">
<div class="appbar"><span class="appbar-title">Preview</span></div>
<div class="body">
<div class="card">
<div class="line" style="width:55%"></div>
<div class="line sub" style="width:85%"></div>
<div class="line sub" style="width:60%"></div>
<div class="chip-row"><span class="chip filled">Primary</span><span class="chip outline">Outline</span></div>
</div>
<div class="card"><div class="field">Sample input field…</div></div>
<div class="card row">
<div class="avatar"></div>
<div style="flex:1">
<div class="line" style="width:70%;margin-bottom:4px"></div>
<div class="line sub" style="width:40%;margin-bottom:0"></div>
</div>
</div>
</div>
<div class="fab">+</div>
<div class="navbar">
<div class="navdot active"></div>
<div class="navdot inactive"></div>
<div class="navdot inactive"></div>
<div class="navdot inactive"></div>
</div>
</div>
</div>
</body></html>`;
  }
}
