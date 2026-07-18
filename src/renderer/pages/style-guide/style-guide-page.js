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
                  <button class="scr-ds-theme-btn scr-ds-theme-btn--active" data-preview-theme="light">Light</button>
                  <button class="scr-ds-theme-btn" data-preview-theme="dark">Dark</button>
                </div>
                <div class="scr-ds-theme-btns" id="sgLayoutBtns" style="${(this._project?.target_platform || 'web') !== 'web' ? 'display:none' : ''}">
                  <button class="scr-ds-theme-btn" data-layout="dashboard">Dashboard</button>
                  <button class="scr-ds-theme-btn scr-ds-theme-btn--active" data-layout="landing">Landing</button>
                </div>
                <div class="sg-preview-actions">
                  <button class="scr-btn scr-btn--sm" id="sgRefreshBtn" title="Refresh preview">
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                      <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                      <path d="M13.5 2.5v2.7H10.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Refresh
                  </button>
                  <button class="scr-btn scr-btn--sm" id="sgExpandBtn" title="Focus preview — hide editor &amp; AI pane">
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                      <path d="M10 2h4v4M6 14H2v-4M14 2l-5 5M2 14l5-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>
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

    const syncThemeToggle = () => {
      const wrap = this.container.querySelector('#sgThemeBtns');
      if (!wrap) return;
      wrap.querySelectorAll('.scr-ds-theme-btn').forEach(b =>
        b.classList.toggle('scr-ds-theme-btn--active', b.dataset.previewTheme === activeTheme));
      setActiveCol();
    };

    const getActivePlatform = () => this.container.querySelector('#sgPlatformSelect')?.value || 'web';

    let activeLayout = 'landing';

    const renderPreview = () => {
      const lightText = this.container.querySelector('#sgTplLight').value;
      const darkText = this.container.querySelector('#sgTplDark').value;
      const lightV = this._parseDesignTemplate(lightText, 'light');
      const darkV = this._parseDesignTemplate(darkText, 'dark');

      frame.srcdoc = (lightText.trim() || darkText.trim())
        ? this._buildPreviewHtml(lightV, darkV, activeTheme, getActivePlatform(), activeLayout)
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
        activeTheme = btn.dataset.previewTheme;
        syncThemeToggle();
        renderPreview();
      });
    });

    /* ---- Layout toggle buttons (web only) ---- */
    this.container.querySelectorAll('#sgLayoutBtns .scr-ds-theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeLayout = btn.dataset.layout;
        this.container.querySelectorAll('#sgLayoutBtns .scr-ds-theme-btn').forEach(b =>
          b.classList.toggle('scr-ds-theme-btn--active', b.dataset.layout === activeLayout));
        renderPreview();
      });
    });

    /* ---- Expand / focus toggle ---- */
    const editor    = this.container.querySelector('.sg-page__editor');
    const expandBtn = this.container.querySelector('#sgExpandBtn');
    let   expanded  = false;

    const expandIcons = {
      expand:   `<path d="M10 2h4v4M6 14H2v-4M14 2l-5 5M2 14l5-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`,
      collapse: `<path d="M14 6h-4V2M2 10h4v4M10 6l-5 5M14 10l-5-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`,
    };

    expandBtn.addEventListener('click', () => {
      expanded = !expanded;
      editor.classList.toggle('sg-page__editor--expanded', expanded);
      expandBtn.querySelector('svg').innerHTML = expandIcons[expanded ? 'collapse' : 'expand'];
      expandBtn.title = expanded ? 'Restore editor panels' : 'Focus preview — hide editor & AI pane';
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

      const layoutBtns = this.container.querySelector('#sgLayoutBtns');
      if (layoutBtns) layoutBtns.style.display = target_platform === 'web' ? '' : 'none';

      renderPreview();
      this._renderThemePicker();

      await window.db.projects.update({ id: this._projectId, target_platform });
      if (this._project) this._project.target_platform = target_platform;
    });

    /* ---- Initial render ---- */
    syncThemeToggle();
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

  _buildPreviewHtml(lightV, darkV, contextTheme = 'dark', platform = 'web', layout = 'dashboard', widthMode = 'full') {
    const activeV = contextTheme === 'light' ? lightV : darkV;
    if (platform === 'flutter' || platform === 'android') {
      return this._buildPhonePreviewHtml(activeV, contextTheme, platform, widthMode);
    }
    if (layout === 'landing') {
      return this._buildLandingPreviewHtml(lightV, darkV, contextTheme);
    }

    const toRgb = hex => {
      const h    = hex.replace('#', '');
      const full = h.length <= 4 ? h.split('').map(c => c + c).join('') : h;
      return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)).join(',');
    };

    const adjustColor = (hex, percent) => {
      const num = parseInt(hex.replace('#',''), 16);
      const amt = Math.round(2.55 * percent);
      const R = (num >> 16) + amt;
      const G = (num >> 8 & 0x00FF) + amt;
      const B = (num & 0x0000FF) + amt;
      return '#' + (0x1000000 + (R<255?R<0?0:R:255)*0x10000 + (G<255?G<0?0:G:255)*0x100 + (B<255?B<0?0:B:255)).toString(16).slice(1);
    };

    const getContrastColor = hex => {
      const rgb = toRgb(hex).split(',').map(Number);
      const yiq = ((rgb[0] * 299) + (rgb[1] * 587) + (rgb[2] * 114)) / 1000;
      return (yiq >= 150) ? '#0f172a' : '#ffffff';
    };

    const safeToRgb = hex => {
      if (!hex || !hex.startsWith('#')) return '99,102,241';
      return toRgb(hex);
    };
    const safeAdjustColor = (hex, percent) => {
      if (!hex || !hex.startsWith('#')) return percent < 0 ? '#1e1b4b' : '#a5b4fc';
      return adjustColor(hex, percent);
    };
    const safeGetContrastColor = hex => {
      if (!hex || !hex.startsWith('#')) return '#ffffff';
      return getContrastColor(hex);
    };

    return `<!DOCTYPE html>
<html lang="en" class="${contextTheme === 'dark' ? 'dark' : ''}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sample App — Dashboard</title>
<style>
  :root {
    --primary: ${lightV.primary};
    --text-on-primary: ${safeGetContrastColor(lightV.primary)};
    --bg: ${lightV.background};
    --surface: ${lightV.surface};
    --text-primary: ${lightV.textPrimary};
    --text-secondary: ${lightV.textSecondary};
    --border: ${lightV.border};
    --danger: ${lightV.danger};
    --chip-bg: rgba(${safeToRgb(lightV.primary)}, 0.12);
    --input-bg: ${safeAdjustColor(lightV.background, -3)};
    --shadow: 0 1px 3px rgba(15,23,42,0.06);
    --shadow-md: 0 4px 16px rgba(15,23,42,0.08);
    --radius: ${lightV.borderRadius};
    --font: ${lightV.fontFamily};
  }
  html.dark {
    --primary: ${darkV.primary};
    --text-on-primary: ${safeGetContrastColor(darkV.primary)};
    --bg: ${darkV.background};
    --surface: ${darkV.surface};
    --text-primary: ${darkV.textPrimary};
    --text-secondary: ${darkV.textSecondary};
    --border: ${darkV.border};
    --danger: ${darkV.danger};
    --chip-bg: rgba(${safeToRgb(darkV.primary)}, 0.18);
    --input-bg: rgba(255,255,255,0.05);
    --shadow: 0 1px 3px rgba(0,0,0,0.3);
    --shadow-md: 0 4px 20px rgba(0,0,0,0.4);
    --radius: ${darkV.borderRadius};
    --font: ${darkV.fontFamily};
  }
  *,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--font); font-size: 13px; line-height: 1.5; background: var(--bg); color: var(--text-primary); min-height: 100vh; display: flex; flex-direction: column; }

  /* ── App shell ── */
  .app { display: flex; flex: 1; min-height: 0; }

  /* ── Sidebar ── */
  .sidebar { width: 200px; flex-shrink: 0; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 0; }
  .sidebar-logo { display: flex; align-items: center; gap: 9px; padding: 16px 14px 14px; border-bottom: 1px solid var(--border); }
  .sidebar-logo .mark { width: 28px; height: 28px; border-radius: calc(var(--radius) * 0.75); background: var(--primary); display: flex; align-items: center; justify-content: center; color: var(--text-on-primary); font-size: 13px; font-weight: 700; flex-shrink: 0; }
  .sidebar-logo .name { font-size: 14px; font-weight: 700; color: var(--text-primary); }
  .sidebar-logo .version { font-size: 10px; color: var(--text-secondary); }
  .sidebar-nav { flex: 1; padding: 10px 8px; display: flex; flex-direction: column; gap: 2px; }
  .nav-item { display: flex; align-items: center; gap: 9px; padding: 7px 10px; border-radius: var(--radius); font-size: 13px; color: var(--text-secondary); cursor: pointer; transition: background 0.15s, color 0.15s; text-decoration: none; }
  .nav-item:hover { background: var(--bg); color: var(--text-primary); }
  .nav-item.active { background: var(--chip-bg); color: var(--primary); font-weight: 600; }
  .nav-item svg { flex-shrink: 0; opacity: 0.8; }
  .nav-section { font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--text-secondary); padding: 12px 10px 4px; opacity: 0.6; }
  .sidebar-footer { padding: 10px 8px 14px; border-top: 1px solid var(--border); }
  .user-row { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: var(--radius); }
  .avatar { width: 26px; height: 26px; border-radius: 50%; background: var(--primary); color: var(--text-on-primary); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
  .user-info .uname { font-size: 12px; font-weight: 600; color: var(--text-primary); }
  .user-info .urole { font-size: 10px; color: var(--text-secondary); }

  /* ── Main ── */
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }

  /* ── Top bar ── */
  .topbar { flex-shrink: 0; height: 52px; background: var(--surface); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; gap: 12px; }
  .topbar-left { display: flex; align-items: center; gap: 12px; }
  .topbar h1 { font-size: 16px; font-weight: 700; color: var(--text-primary); }
  .breadcrumb { font-size: 12px; color: var(--text-secondary); }
  .topbar-right { display: flex; align-items: center; gap: 8px; }
  .search-box { display: flex; align-items: center; gap: 6px; background: var(--input-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 5px 10px; font-size: 12px; color: var(--text-secondary); min-width: 160px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: var(--radius); font-size: 12px; font-weight: 600; cursor: pointer; border: none; transition: filter 0.15s, transform 0.1s; }
  .btn-primary { background: var(--primary); color: var(--text-on-primary); }
  .btn-primary:hover { filter: brightness(1.08); }
  .btn-ghost { background: transparent; border: 1px solid var(--border); color: var(--text-primary); }
  .btn-ghost:hover { border-color: var(--primary); color: var(--primary); }
  .icon-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius); background: transparent; border: 1px solid var(--border); color: var(--text-secondary); cursor: pointer; }
  .icon-btn:hover { color: var(--text-primary); background: var(--bg); }

  /* ── Page content ── */
  .content { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 18px; }

  /* ── Stat tiles ── */
  .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); }
  .stat-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-secondary); margin-bottom: 6px; }
  .stat-value { font-size: 24px; font-weight: 800; color: var(--text-primary); margin-bottom: 4px; }
  .stat-delta { font-size: 11px; color: var(--text-secondary); }
  .stat-delta.up { color: #16a34a; }
  .stat-delta.down { color: var(--danger); }
  .stat-bar { height: 4px; border-radius: 2px; background: var(--border); margin-top: 10px; overflow: hidden; }
  .stat-bar-fill { height: 100%; background: var(--primary); border-radius: 2px; }

  /* ── Two-col layout ── */
  .two-col { display: grid; grid-template-columns: 1fr 340px; gap: 12px; min-height: 0; }

  /* ── Table card ── */
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
  .card-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--border); }
  .card-title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
  .card-sub { font-size: 11px; color: var(--text-secondary); margin-top: 1px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 9px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-secondary); border-bottom: 1px solid var(--border); background: rgba(${safeToRgb(lightV.primary)}, 0.04); }
  html.dark th { background: rgba(${safeToRgb(darkV.primary)}, 0.07); }
  td { padding: 10px 16px; font-size: 12px; color: var(--text-primary); border-bottom: 1px solid var(--border); }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--chip-bg); }
  .badge { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 999px; }
  .badge-success { background: rgba(22,163,74,0.12); color: #16a34a; }
  .badge-warn    { background: rgba(245,158,11,0.12); color: #b45309; }
  .badge-danger  { background: rgba(239,68,68,0.12);  color: var(--danger); }
  .badge-info    { background: var(--chip-bg); color: var(--primary); }
  .row-name { font-weight: 600; }
  .row-sub  { font-size: 11px; color: var(--text-secondary); }

  /* ── Right panel ── */
  .right-col { display: flex; flex-direction: column; gap: 12px; }

  /* ── Form card ── */
  .form-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .field label { font-size: 11px; font-weight: 600; color: var(--text-secondary); }
  .field input, .field select, .field textarea { background: var(--input-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 7px 10px; font-size: 12px; font-family: var(--font); color: var(--text-primary); outline: none; width: 100%; transition: border-color 0.15s; }
  .field input:focus, .field select:focus, .field textarea:focus { border-color: var(--primary); }
  .field textarea { resize: none; height: 64px; }
  .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .form-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border); }

  /* ── Activity card ── */
  .activity-list { padding: 8px 0; }
  .activity-item { display: flex; align-items: flex-start; gap: 10px; padding: 9px 16px; }
  .activity-item:hover { background: var(--chip-bg); }
  .act-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--primary); flex-shrink: 0; margin-top: 4px; }
  .act-dot.warn   { background: #f59e0b; }
  .act-dot.danger { background: var(--danger); }
  .act-text { font-size: 12px; color: var(--text-primary); flex: 1; }
  .act-text span { color: var(--text-secondary); }
  .act-time { font-size: 10px; color: var(--text-secondary); flex-shrink: 0; margin-top: 1px; }

  /* ── Bottom bar ── */
  .bottombar { flex-shrink: 0; height: 36px; background: var(--surface); border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; }
  .bottombar span { font-size: 11px; color: var(--text-secondary); }

  /* ── Theme toggle ── */
  #themeToggle { position: fixed; bottom: 46px; right: 12px; z-index: 999; width: 28px; height: 28px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 13px; }
  #themeToggle:hover { color: var(--text-primary); }
</style>
</head>
<body>

<div class="app">

  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-logo">
      <div class="mark">S</div>
      <div><div class="name">Sample App</div><div class="version">v2.4.1</div></div>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-section">Main</div>
      <a class="nav-item active" href="#">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        Dashboard
      </a>
      <a class="nav-item" href="#">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        Projects
      </a>
      <a class="nav-item" href="#">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Team
      </a>
      <div class="nav-section">Analytics</div>
      <a class="nav-item" href="#">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        Reports
      </a>
      <a class="nav-item" href="#">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
        Integrations
      </a>
      <div class="nav-section">System</div>
      <a class="nav-item" href="#">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2"/></svg>
        Settings
      </a>
    </nav>
    <div class="sidebar-footer">
      <div class="user-row">
        <div class="avatar">JD</div>
        <div class="user-info"><div class="uname">Jane Doe</div><div class="urole">Admin</div></div>
      </div>
    </div>
  </aside>

  <!-- Main area -->
  <div class="main">

    <!-- Top bar -->
    <div class="topbar">
      <div class="topbar-left">
        <div>
          <div class="breadcrumb">Sample App / Dashboard</div>
          <h1>Overview</h1>
        </div>
      </div>
      <div class="topbar-right">
        <div class="search-box">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Search…
        </div>
        <div class="icon-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        </div>
        <button class="btn btn-primary">+ New project</button>
      </div>
    </div>

    <!-- Page content -->
    <div class="content">

      <!-- Stat tiles -->
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-label">Total projects</div>
          <div class="stat-value">24</div>
          <div class="stat-delta up">↑ 4 this month</div>
          <div class="stat-bar"><div class="stat-bar-fill" style="width:60%"></div></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Active tasks</div>
          <div class="stat-value">138</div>
          <div class="stat-delta up">↑ 12 this week</div>
          <div class="stat-bar"><div class="stat-bar-fill" style="width:78%"></div></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Team members</div>
          <div class="stat-value">12</div>
          <div class="stat-delta">2 pending invite</div>
          <div class="stat-bar"><div class="stat-bar-fill" style="width:40%"></div></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Completion</div>
          <div class="stat-value">68%</div>
          <div class="stat-delta down">↓ 3% vs last sprint</div>
          <div class="stat-bar"><div class="stat-bar-fill" style="width:68%"></div></div>
        </div>
      </div>

      <!-- Two-column body -->
      <div class="two-col">

        <!-- Recent projects table -->
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Recent projects</div>
              <div class="card-sub">Last updated today</div>
            </div>
            <button class="btn btn-ghost">View all</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><div class="row-name">Design System v2</div><div class="row-sub">UI / Components</div></td>
                <td>Jane D.</td>
                <td><span class="badge badge-success">Active</span></td>
                <td>Aug 12</td>
              </tr>
              <tr>
                <td><div class="row-name">API Gateway Refactor</div><div class="row-sub">Backend</div></td>
                <td>Mark T.</td>
                <td><span class="badge badge-warn">In review</span></td>
                <td>Aug 18</td>
              </tr>
              <tr>
                <td><div class="row-name">Mobile Onboarding</div><div class="row-sub">Flutter · iOS</div></td>
                <td>Sara K.</td>
                <td><span class="badge badge-info">Planning</span></td>
                <td>Sep 01</td>
              </tr>
              <tr>
                <td><div class="row-name">Analytics Dashboard</div><div class="row-sub">Data · Viz</div></td>
                <td>Tom L.</td>
                <td><span class="badge badge-danger">Blocked</span></td>
                <td>Jul 30</td>
              </tr>
              <tr>
                <td><div class="row-name">Auth Service</div><div class="row-sub">Security</div></td>
                <td>Jane D.</td>
                <td><span class="badge badge-success">Active</span></td>
                <td>Aug 25</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Right column -->
        <div class="right-col">

          <!-- Create task form -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">Create task</div>
            </div>
            <div class="form-body">
              <div class="field">
                <label>Task name</label>
                <input type="text" placeholder="e.g. Update landing page copy" />
              </div>
              <div class="field-row">
                <div class="field">
                  <label>Priority</label>
                  <select>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                </div>
                <div class="field">
                  <label>Assignee</label>
                  <select>
                    <option>Jane D.</option>
                    <option>Mark T.</option>
                    <option>Sara K.</option>
                  </select>
                </div>
              </div>
              <div class="field">
                <label>Notes</label>
                <textarea placeholder="Optional context…"></textarea>
              </div>
            </div>
            <div class="form-actions">
              <button class="btn btn-ghost">Cancel</button>
              <button class="btn btn-primary">Create task</button>
            </div>
          </div>

          <!-- Activity feed -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">Activity</div>
            </div>
            <div class="activity-list">
              <div class="activity-item">
                <div class="act-dot"></div>
                <div class="act-text">Design System v2 <span>moved to Active</span></div>
                <div class="act-time">2m ago</div>
              </div>
              <div class="activity-item">
                <div class="act-dot warn"></div>
                <div class="act-text">Analytics Dashboard <span>status changed to Blocked</span></div>
                <div class="act-time">1h ago</div>
              </div>
              <div class="activity-item">
                <div class="act-dot"></div>
                <div class="act-text">Sara K. <span>joined Mobile Onboarding</span></div>
                <div class="act-time">3h ago</div>
              </div>
              <div class="activity-item">
                <div class="act-dot danger"></div>
                <div class="act-text">API Gateway deadline <span>is overdue</span></div>
                <div class="act-time">Yesterday</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>

    <!-- Bottom bar -->
    <div class="bottombar">
      <span>Sample App · Web preview</span>
      <span>v2.4.1 · Connected</span>
    </div>
  </div>
</div>

<button id="themeToggle" title="Toggle theme">☀</button>

<script>
(function(){
  var root = document.documentElement;
  var btn  = document.getElementById('themeToggle');
  function apply(dark){ if(dark){ root.classList.add('dark'); btn.textContent='☀'; } else { root.classList.remove('dark'); btn.textContent='☾'; } }
  apply(root.classList.contains('dark'));
  btn.addEventListener('click', function(){ apply(!root.classList.contains('dark')); });
})();
</script>
</body>
</html>`;
  }

  _buildPhonePreviewHtml(v, contextTheme, platform, widthMode = 'full') {
    const scheme  = contextTheme === 'light' ? 'light' : 'dark';
    const stageBg = contextTheme === 'light' ? '#e2dfd9' : '#07090d';
    const cr      = Math.max(parseInt(v.borderRadius, 10) || 8, 12) + 'px';
    const label   = platform === 'flutter' ? 'Flutter · Material 3' : 'Android · Material Design';

    const toRgb = hex => {
      const h = hex.replace('#', '');
      const f = h.length <= 4 ? h.split('').map(c => c+c).join('') : h;
      return [0,2,4].map(i => parseInt(f.slice(i,i+2),16)).join(',');
    };
    const safeRgb   = hex => (!hex || !hex.startsWith('#')) ? '99,102,241' : toRgb(hex);
    const contrast  = hex => {
      const rgb = toRgb(hex).split(',').map(Number);
      return ((rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000 >= 150) ? '#0f172a' : '#ffffff';
    };
    const onPrimary = contrast(v.primary);
    const pRgb      = safeRgb(v.primary);
    const tRgb      = safeRgb(v.textPrimary);

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="${scheme}">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:${stageBg};font-family:${v.fontFamily};min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:20px;gap:10px;color-scheme:${scheme}}
.stage-label{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:${v.textSecondary};opacity:.7}
.phone{width:min(400px,100%);min-height:580px;border-radius:24px;border:1px solid ${v.border};background:${v.background};overflow:hidden;display:flex;flex-direction:column;position:relative;box-shadow:0 8px 32px rgba(0,0,0,.2)}
/* Status bar */
.statusbar{flex:none;height:22px;background:${v.surface};display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-size:9px;font-weight:700;color:${v.textPrimary}}
.sb-icons{display:flex;align-items:center;gap:4px}
.sb-icon{width:10px;height:6px;border-radius:1px;background:${v.textPrimary};opacity:.6}
.sb-icon.signal{width:6px;height:8px;clip-path:polygon(0 100%,100% 0,100% 100%)}
.sb-battery{width:16px;height:8px;border:1.5px solid ${v.textPrimary};border-radius:2px;opacity:.7;position:relative;display:flex;align-items:center;padding:1px}
.sb-battery::after{content:'';position:absolute;right:-4px;top:50%;transform:translateY(-50%);width:2px;height:4px;background:${v.textPrimary};border-radius:0 1px 1px 0;opacity:.7}
.sb-batt-fill{flex:1;background:${v.textPrimary};border-radius:1px;height:100%}
/* AppBar */
.appbar{flex:none;height:54px;background:${v.surface};display:flex;align-items:center;padding:0 14px;gap:10px;border-bottom:1px solid ${v.border}}
.appbar-nav{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:${v.textPrimary};font-size:15px;flex-shrink:0}
.appbar-title{flex:1;font-size:17px;font-weight:700;color:${v.textPrimary};letter-spacing:-.01em}
.appbar-action{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:${v.textSecondary};font-size:17px;flex-shrink:0}
/* Scrollable body */
.body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px;padding-bottom:88px}
/* Hero card */
.hero-card{background:${v.primary};border-radius:${cr};padding:18px;color:${onPrimary}}
.hero-eyebrow{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;opacity:.75;margin-bottom:6px}
.hero-title{font-size:20px;font-weight:800;letter-spacing:-.01em;margin-bottom:4px}
.hero-sub{font-size:12.5px;opacity:.8;margin-bottom:14px}
.progress-row{display:flex;align-items:center;gap:10px}
.progress-track{flex:1;height:5px;background:rgba(${contrast(v.primary)==='#ffffff'?'255,255,255':'0,0,0'},.25);border-radius:3px;overflow:hidden}
.progress-fill{height:100%;background:${onPrimary};border-radius:3px}
.progress-pct{font-size:11px;font-weight:700;opacity:.9;flex-shrink:0}
/* Chip row */
.chip-row{display:flex;gap:8px;flex-wrap:wrap}
.chip{font-size:11.5px;padding:5px 14px;border-radius:999px;font-weight:600}
.chip.filled{background:${v.primary};color:${onPrimary}}
.chip.outline{border:1.5px solid ${v.primary};color:${v.primary}}
.chip.tonal{background:rgba(${pRgb},.13);color:${v.primary}}
/* Material text field — filled style */
.field-wrap{background:${v.surface};border-radius:${cr} ${cr} 0 0;padding:8px 14px 0;border-bottom:2px solid ${v.primary}}
.field-label{font-size:10.5px;font-weight:600;color:${v.primary};margin-bottom:2px}
.field-value{font-size:13px;color:${v.textSecondary};padding-bottom:8px}
/* Section heading */
.section-head{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${v.textSecondary};padding:0 2px}
/* List card */
.list-card{background:${v.surface};border-radius:${cr};overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.12)}
.list-item{display:flex;align-items:center;gap:12px;padding:11px 14px}
.divider{height:1px;background:${v.border};margin:0 14px}
.avatar{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;color:${onPrimary}}
.av1{background:${v.primary}}
.av2{background:rgba(${pRgb},.65)}
.av3{background:rgba(${pRgb},.38)}
.item-text{flex:1;min-width:0}
.item-name{font-size:13px;font-weight:600;color:${v.textPrimary};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item-sub{font-size:11px;color:${v.textSecondary};margin-top:1px}
/* Snackbar */
.snackbar{position:absolute;bottom:68px;left:12px;right:72px;background:${v.textPrimary};color:${v.background};border-radius:999px;padding:9px 16px;font-size:11.5px;display:flex;align-items:center;justify-content:space-between;z-index:4;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.snackbar-action{font-weight:700;color:rgba(${pRgb},.9);font-size:11.5px;background:rgba(${pRgb},.15);padding:2px 8px;border-radius:4px}
/* FAB — Material 3 medium shape */
.fab{position:absolute;right:14px;bottom:70px;width:50px;height:50px;border-radius:16px;background:${v.primary};color:${onPrimary};display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;box-shadow:0 4px 12px rgba(${pRgb},.45);z-index:5}
/* Bottom navbar */
.navbar{flex:none;height:62px;background:${v.surface};border-top:1px solid ${v.border};display:flex;align-items:center;justify-content:space-around;padding:0 4px;z-index:2}
.nav-item{display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;padding:6px 0;cursor:pointer}
.nav-pill{height:28px;display:flex;align-items:center;justify-content:center;border-radius:999px;min-width:56px}
.nav-item.active .nav-pill{background:rgba(${pRgb},.15)}
.nav-icon-dot{width:7px;height:7px;border-radius:50%}
.nav-item.active .nav-icon-dot{background:${v.primary}}
.nav-item:not(.active) .nav-icon-dot{background:${v.textSecondary};opacity:.45}
.nav-label{font-size:10.5px;font-weight:600}
.nav-item.active .nav-label{color:${v.primary}}
.nav-item:not(.active) .nav-label{color:${v.textSecondary};opacity:.6}
</style></head><body>
<div class="stage-label">${label}</div>
<div class="phone">
  <div class="statusbar">
    <span>9:41</span>
    <div class="sb-icons">
      <div class="sb-icon signal"></div>
      <div class="sb-icon" style="width:12px;height:6px;border-radius:2px"></div>
      <div class="sb-battery"><div class="sb-batt-fill" style="width:70%"></div></div>
    </div>
  </div>
  <div class="appbar">
    <div class="appbar-nav">&#8592;</div>
    <span class="appbar-title">Overview</span>
    <div class="appbar-action">&#8942;</div>
  </div>
  <div class="body">
    <div class="hero-card">
      <div class="hero-eyebrow">Welcome back</div>
      <div class="hero-title">My Dashboard</div>
      <div class="hero-sub">3 tasks due today</div>
      <div class="progress-row">
        <div class="progress-track"><div class="progress-fill" style="width:68%"></div></div>
        <span class="progress-pct">68%</span>
      </div>
    </div>
    <div class="chip-row">
      <span class="chip filled">Active</span>
      <span class="chip outline">Pending</span>
      <span class="chip tonal">Archived</span>
    </div>
    <div class="field-wrap">
      <div class="field-label">Search projects</div>
      <div class="field-value">e.g. Design System…</div>
    </div>
    <div class="section-head">Recent</div>
    <div class="list-card">
      <div class="list-item">
        <div class="avatar av1">JD</div>
        <div class="item-text">
          <div class="item-name">Design System v2</div>
          <div class="item-sub">Updated 2h ago</div>
        </div>
        <span class="chip filled" style="font-size:10px;padding:3px 10px">Active</span>
      </div>
      <div class="divider"></div>
      <div class="list-item">
        <div class="avatar av2">MT</div>
        <div class="item-text">
          <div class="item-name">API Gateway</div>
          <div class="item-sub">Updated yesterday</div>
        </div>
        <span class="chip outline" style="font-size:10px;padding:3px 10px">Review</span>
      </div>
      <div class="divider"></div>
      <div class="list-item">
        <div class="avatar av3">SK</div>
        <div class="item-text">
          <div class="item-name">Mobile Onboarding</div>
          <div class="item-sub">Updated 3 days ago</div>
        </div>
        <span class="chip tonal" style="font-size:10px;padding:3px 10px">Draft</span>
      </div>
    </div>
  </div>
  <div class="snackbar">3 tasks due today<span class="snackbar-action">View</span></div>
  <div class="fab">+</div>
  <div class="navbar">
    <div class="nav-item active">
      <div class="nav-pill"><div class="nav-icon-dot"></div></div>
      <span class="nav-label">Home</span>
    </div>
    <div class="nav-item">
      <div class="nav-pill"><div class="nav-icon-dot"></div></div>
      <span class="nav-label">Projects</span>
    </div>
    <div class="nav-item">
      <div class="nav-pill"><div class="nav-icon-dot"></div></div>
      <span class="nav-label">Team</span>
    </div>
    <div class="nav-item">
      <div class="nav-pill"><div class="nav-icon-dot"></div></div>
      <span class="nav-label">Settings</span>
    </div>
  </div>
</div>
</body></html>`;
  }

  _buildLandingPreviewHtml(lightV, darkV, contextTheme = 'dark') {
    const toRgb = hex => {
      const h    = hex.replace('#', '');
      const full = h.length <= 4 ? h.split('').map(c => c + c).join('') : h;
      return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)).join(',');
    };
    const adjustColor = (hex, percent) => {
      const num = parseInt(hex.replace('#',''), 16);
      const amt = Math.round(2.55 * percent);
      const R = (num >> 16) + amt;
      const G = (num >> 8 & 0x00FF) + amt;
      const B = (num & 0x0000FF) + amt;
      return '#' + (0x1000000 + (R<255?R<0?0:R:255)*0x10000 + (G<255?G<0?0:G:255)*0x100 + (B<255?B<0?0:B:255)).toString(16).slice(1);
    };
    const getContrastColor = hex => {
      const rgb = toRgb(hex).split(',').map(Number);
      const yiq = ((rgb[0]*299)+(rgb[1]*587)+(rgb[2]*114))/1000;
      return yiq >= 150 ? '#0f172a' : '#ffffff';
    };
    const safe = {
      rgb:      hex => (!hex || !hex.startsWith('#')) ? '99,102,241' : toRgb(hex),
      adjust:   (hex, p) => (!hex || !hex.startsWith('#')) ? (p < 0 ? '#1e1b4b' : '#a5b4fc') : adjustColor(hex, p),
      contrast: hex => (!hex || !hex.startsWith('#')) ? '#ffffff' : getContrastColor(hex),
    };

    const lv = lightV, dv = darkV;
    const isDark = contextTheme === 'dark';

    return `<!DOCTYPE html>
<html lang="en" class="${isDark ? 'dark' : ''}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sample Corp — Home</title>
<style>
  :root {
    --primary: ${lv.primary};
    --on-primary: ${safe.contrast(lv.primary)};
    --bg: ${lv.background};
    --surface: ${lv.surface};
    --text: ${lv.textPrimary};
    --text-sub: ${lv.textSecondary};
    --border: ${lv.border};
    --danger: ${lv.danger};
    --chip-bg: rgba(${safe.rgb(lv.primary)}, 0.12);
    --hero-gradient: linear-gradient(135deg, ${safe.adjust(lv.primary, -30)} 0%, ${lv.primary} 55%, ${safe.adjust(lv.primary, 15)} 100%);
    --shadow: 0 1px 4px rgba(15,23,42,.07);
    --shadow-md: 0 6px 20px rgba(15,23,42,.09);
    --radius: ${lv.borderRadius};
    --font: ${lv.fontFamily};
  }
  html.dark {
    --primary: ${dv.primary};
    --on-primary: ${safe.contrast(dv.primary)};
    --bg: ${dv.background};
    --surface: ${dv.surface};
    --text: ${dv.textPrimary};
    --text-sub: ${dv.textSecondary};
    --border: ${dv.border};
    --danger: ${dv.danger};
    --chip-bg: rgba(${safe.rgb(dv.primary)}, 0.18);
    --hero-gradient: linear-gradient(135deg, ${safe.adjust(dv.primary, -30)} 0%, ${dv.primary} 55%, ${safe.adjust(dv.primary, 15)} 100%);
    --shadow: 0 1px 4px rgba(0,0,0,.3);
    --shadow-md: 0 6px 24px rgba(0,0,0,.4);
    --radius: ${dv.borderRadius};
    --font: ${dv.fontFamily};
  }
  *,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--font); font-size: 14px; line-height: 1.6; background: var(--bg); color: var(--text); }
  a { color: inherit; text-decoration: none; }

  /* Nav */
  nav { position: sticky; top: 0; z-index: 100; background: var(--bg); border-bottom: 1px solid var(--border); }
  .nav-inner { max-width: 1100px; margin: 0 auto; padding: 0 24px; height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
  .nav-brand { display: flex; align-items: center; gap: 9px; font-size: 17px; font-weight: 800; color: var(--text); }
  .nav-mark { width: 30px; height: 30px; border-radius: calc(var(--radius) * 0.8); background: var(--primary); color: var(--on-primary); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; flex-shrink: 0; }
  .nav-links { display: flex; gap: 24px; align-items: center; }
  .nav-links a { font-size: 13.5px; font-weight: 500; color: var(--text-sub); transition: color .15s; }
  .nav-links a:hover { color: var(--primary); }
  .nav-actions { display: flex; gap: 8px; align-items: center; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; border-radius: var(--radius); font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: filter .15s, transform .1s; }
  .btn-primary { background: var(--primary); color: var(--on-primary); }
  .btn-primary:hover { filter: brightness(1.08); transform: translateY(-1px); }
  .btn-ghost { background: transparent; border: 1px solid var(--border); color: var(--text); }
  .btn-ghost:hover { border-color: var(--primary); color: var(--primary); }

  /* Hero */
  .hero { background: var(--hero-gradient); color: #fff; padding: 80px 24px 96px; position: relative; overflow: hidden; }
  .hero::after { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 75% 30%, rgba(255,255,255,.1), transparent 60%); pointer-events: none; }
  .hero-inner { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; position: relative; z-index: 1; }
  .hero-eyebrow { display: inline-flex; align-items: center; gap: 7px; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.25); padding: 5px 13px; border-radius: 999px; font-size: 12px; font-weight: 700; margin-bottom: 18px; }
  .hero h1 { font-size: 40px; font-weight: 800; line-height: 1.12; letter-spacing: -.02em; margin-bottom: 16px; }
  .hero p { font-size: 15px; color: rgba(255,255,255,.88); max-width: 440px; margin-bottom: 28px; }
  .hero-btns { display: flex; gap: 10px; flex-wrap: wrap; }
  .hero .btn-primary { background: #fff; color: var(--primary); }
  .hero .btn-ghost { border-color: rgba(255,255,255,.4); color: #fff; }
  .hero .btn-ghost:hover { background: rgba(255,255,255,.1); border-color: #fff; }
  .hero-stats { display: flex; gap: 28px; margin-top: 36px; flex-wrap: wrap; }
  .hero-stats div strong { display: block; font-size: 22px; font-weight: 800; }
  .hero-stats div span { font-size: 12px; color: rgba(255,255,255,.7); }
  .hero-visual { background: var(--surface); border: 1px solid rgba(255,255,255,.18); border-radius: 14px; padding: 14px; box-shadow: var(--shadow-md); color: var(--text); }
  .mock-bar-top { display: flex; gap: 5px; padding: 8px 10px; background: var(--bg); border-radius: calc(var(--radius)*0.8); border: 1px solid var(--border); margin-bottom: 10px; align-items: center; }
  .mock-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border); }
  .mock-url { flex: 1; height: 7px; background: var(--border); border-radius: 3px; opacity: .6; }
  .mock-lines { display: flex; flex-direction: column; gap: 6px; padding: 4px 0; }
  .mock-line { height: 7px; background: var(--border); border-radius: 3px; opacity: .45; }
  .mock-line.accent { background: var(--primary); opacity: .5; width: 55%; }
  .mock-line.w70 { width: 70%; }
  .mock-line.w85 { width: 85%; }
  .mock-line.w50 { width: 50%; }
  .mock-btn-row { display: flex; gap: 6px; margin-top: 8px; }
  .mock-btn { height: 22px; border-radius: calc(var(--radius)*.75); background: var(--primary); opacity: .55; width: 60px; }
  .mock-btn.ghost { background: transparent; border: 1px solid var(--border); opacity: .8; width: 48px; }

  /* Logos / trust bar */
  .trust { border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); background: var(--surface); padding: 20px 24px; }
  .trust-inner { max-width: 1100px; margin: 0 auto; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .trust-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: var(--text-sub); flex-shrink: 0; }
  .trust-logos { display: flex; gap: 20px; flex-wrap: wrap; }
  .trust-logo { font-size: 12px; font-weight: 700; color: var(--text-sub); opacity: .55; letter-spacing: .03em; }

  /* Features */
  .features { max-width: 1100px; margin: 0 auto; padding: 72px 24px; }
  .section-head { text-align: center; margin-bottom: 44px; }
  .eyebrow { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--primary); display: block; margin-bottom: 10px; }
  .section-head h2 { font-size: 30px; font-weight: 800; letter-spacing: -.02em; margin-bottom: 10px; }
  .section-head p { font-size: 14px; color: var(--text-sub); max-width: 500px; margin: 0 auto; }
  .feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px; box-shadow: var(--shadow); transition: transform .2s, box-shadow .2s; }
  .card:hover { transform: translateY(-3px); box-shadow: var(--shadow-md); }
  .card-icon { width: 38px; height: 38px; border-radius: calc(var(--radius)*.8); background: var(--chip-bg); color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 18px; margin-bottom: 14px; }
  .card h3 { font-size: 15px; font-weight: 700; margin-bottom: 7px; }
  .card p { font-size: 13px; color: var(--text-sub); }

  /* CTA band */
  .cta { max-width: 1100px; margin: 0 auto 72px; padding: 0 24px; }
  .cta-inner { background: var(--hero-gradient); border-radius: 16px; padding: 52px 40px; text-align: center; color: #fff; }
  .cta-inner h2 { font-size: 26px; font-weight: 800; margin-bottom: 10px; }
  .cta-inner p { color: rgba(255,255,255,.85); margin-bottom: 24px; font-size: 14px; }
  .cta-inner .btn-primary { background: #fff; color: var(--primary); }
  .cta-inner .btn-ghost { border-color: rgba(255,255,255,.4); color: #fff; }
  .cta-actions { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }

  /* Footer */
  footer { border-top: 1px solid var(--border); background: var(--surface); }
  .footer-inner { max-width: 1100px; margin: 0 auto; padding: 40px 24px 28px; display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 32px; }
  .footer-brand p { font-size: 12.5px; color: var(--text-sub); margin-top: 10px; max-width: 220px; line-height: 1.6; }
  .footer-col h4 { font-size: 12px; font-weight: 700; margin-bottom: 12px; color: var(--text); }
  .footer-col a { display: block; font-size: 12.5px; color: var(--text-sub); margin-bottom: 8px; transition: color .15s; }
  .footer-col a:hover { color: var(--primary); }
  .footer-bottom { max-width: 1100px; margin: 0 auto; padding: 16px 24px 24px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--text-sub); }
  .chip { background: var(--chip-bg); color: var(--primary); font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; }

  /* Theme toggle */
  #themeToggle { position: fixed; bottom: 16px; right: 14px; z-index: 999; width: 28px; height: 28px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text-sub); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 13px; }

  @media (max-width: 760px) {
    .hero-inner { grid-template-columns: 1fr; }
    .hero h1 { font-size: 28px; }
    .feature-grid { grid-template-columns: 1fr; }
    .footer-inner { grid-template-columns: 1fr 1fr; }
    .nav-links { display: none; }
  }
</style>
</head>
<body>

<nav>
  <div class="nav-inner">
    <div class="nav-brand">
      <div class="nav-mark">S</div>
      SampleCorp
    </div>
    <div class="nav-links">
      <a href="#">Product</a>
      <a href="#">Solutions</a>
      <a href="#">Pricing</a>
      <a href="#">Docs</a>
      <a href="#">Blog</a>
    </div>
    <div class="nav-actions">
      <a href="#" class="btn btn-ghost">Sign in</a>
      <a href="#" class="btn btn-primary">Get started free</a>
    </div>
  </div>
</nav>

<section class="hero">
  <div class="hero-inner">
    <div>
      <div class="hero-eyebrow">✦ Now in public beta</div>
      <h1>Build better products, ship with confidence</h1>
      <p>SampleCorp gives your team one place to plan, design, and deliver — from first sketch to production release.</p>
      <div class="hero-btns">
        <a href="#" class="btn btn-primary">Start for free</a>
        <a href="#" class="btn btn-ghost">Watch demo →</a>
      </div>
      <div class="hero-stats">
        <div><strong>12k+</strong><span>Teams</span></div>
        <div><strong>99.9%</strong><span>Uptime</span></div>
        <div><strong>4.9★</strong><span>Rating</span></div>
      </div>
    </div>
    <div class="hero-visual">
      <div class="mock-bar-top">
        <div class="mock-dot"></div><div class="mock-dot"></div><div class="mock-dot"></div>
        <div class="mock-url"></div>
      </div>
      <div class="mock-lines">
        <div class="mock-line accent"></div>
        <div class="mock-line w85"></div>
        <div class="mock-line w70"></div>
        <div class="mock-line w50"></div>
        <div class="mock-line w85"></div>
        <div class="mock-line w70"></div>
      </div>
      <div class="mock-btn-row">
        <div class="mock-btn"></div>
        <div class="mock-btn ghost"></div>
      </div>
    </div>
  </div>
</section>

<div class="trust">
  <div class="trust-inner">
    <span class="trust-label">Trusted by teams at</span>
    <div class="trust-logos">
      <span class="trust-logo">ACME Inc.</span>
      <span class="trust-logo">Verge Systems</span>
      <span class="trust-logo">Nordly</span>
      <span class="trust-logo">Dataflow Co.</span>
      <span class="trust-logo">Brightline</span>
    </div>
  </div>
</div>

<div class="features">
  <div class="section-head">
    <span class="eyebrow">Features</span>
    <h2>Everything your team needs</h2>
    <p>From requirements to release — one connected workflow for modern product teams.</p>
  </div>
  <div class="feature-grid">
    <div class="card">
      <div class="card-icon">◈</div>
      <h3>Design system</h3>
      <p>Define tokens once, apply them everywhere. Keep design and code in sync automatically.</p>
    </div>
    <div class="card">
      <div class="card-icon">⚡</div>
      <h3>Sprint planning</h3>
      <p>Drag-and-drop backlogs, automatic velocity tracking, and retrospective templates built in.</p>
    </div>
    <div class="card">
      <div class="card-icon">◎</div>
      <h3>Analytics</h3>
      <p>Real-time dashboards show deployment frequency, lead time, and bug escape rates at a glance.</p>
    </div>
    <div class="card">
      <div class="card-icon">⊞</div>
      <h3>Integrations</h3>
      <p>Connect GitHub, Jira, Figma, and 40+ tools. Your workflow, your way.</p>
    </div>
    <div class="card">
      <div class="card-icon">☁</div>
      <h3>Cloud or self-hosted</h3>
      <p>Deploy on our managed cloud or run on your own infrastructure with full data control.</p>
    </div>
    <div class="card">
      <div class="card-icon">🛡</div>
      <h3>Enterprise security</h3>
      <p>SSO, RBAC, audit logs, and SOC 2 Type II compliance out of the box.</p>
    </div>
  </div>
</div>

<div class="cta">
  <div class="cta-inner">
    <h2>Ready to move faster?</h2>
    <p>Join 12,000+ teams already shipping with SampleCorp. Free for up to 5 members.</p>
    <div class="cta-actions">
      <a href="#" class="btn btn-primary">Start for free</a>
      <a href="#" class="btn btn-ghost">Talk to sales</a>
    </div>
  </div>
</div>

<footer>
  <div class="footer-inner">
    <div class="footer-brand">
      <div class="nav-brand"><div class="nav-mark">S</div> SampleCorp</div>
      <p>The modern platform for product teams — plan, design, and ship in one place.</p>
    </div>
    <div class="footer-col">
      <h4>Product</h4>
      <a href="#">Features</a>
      <a href="#">Pricing</a>
      <a href="#">Changelog</a>
      <a href="#">Roadmap</a>
    </div>
    <div class="footer-col">
      <h4>Developers</h4>
      <a href="#">Docs</a>
      <a href="#">API reference</a>
      <a href="#">SDKs</a>
      <a href="#">Status</a>
    </div>
    <div class="footer-col">
      <h4>Company</h4>
      <a href="#">About</a>
      <a href="#">Blog</a>
      <a href="#">Careers</a>
      <a href="#">Legal</a>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© 2026 SampleCorp. All rights reserved.</span>
    <div style="display:flex;gap:8px">
      <span class="chip">SOC 2</span>
      <span class="chip">GDPR</span>
      <span class="chip">ISO 27001</span>
    </div>
  </div>
</footer>

<button id="themeToggle" title="Toggle theme">☀</button>
<script>
(function(){
  var root=document.documentElement, btn=document.getElementById('themeToggle');
  function apply(d){ if(d){root.classList.add('dark');btn.textContent='☀';}else{root.classList.remove('dark');btn.textContent='☾';} }
  apply(root.classList.contains('dark'));
  btn.addEventListener('click',function(){ apply(!root.classList.contains('dark')); });
})();
</script>
</body>
</html>`;
  }
}
