import { escHtml, injectCss, removeCss, timeAgo, renderMarkdown } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelPicker }       from '../../components/model-picker/model-picker.js';
import { Dialog }            from '../../components/dialog/dialog.js';
import { ProjectSidebar }    from '../../components/project-sidebar/project-sidebar.js';
import { TECH, PLATFORM_GUIDES } from './data/platform-guides.js';
import { SCREEN_TEMPLATES, DEPRECATED_TEMPLATE_NAMES } from './data/screen-templates.js';


function buildScreenPrompt(description, projectDescription, outputFile, designTemplate, targetPlatform, referenceScreen) {
  const ctx      = projectDescription ? `\nProject context: ${projectDescription}` : '';
  const save     = outputFile
    ? `\nWhen done, save the complete output to: ${outputFile}`
    : `\nDo NOT use any tools, write any files, or save anything — print the raw HTML directly to stdout.`;
  const design   = designTemplate
    ? `\n\nDESIGN SYSTEM — you MUST follow this for every element (colours, fonts, spacing, components):\n${designTemplate}`
    : '';
  const reference = referenceScreen
    ? `\n\nREFERENCE SCREEN — "${referenceScreen.title}". Use it as a reference for visual style and structure (colours, typography, spacing, component patterns, layout conventions) and to stay consistent with related content already defined for this screen where relevant. Adapt these patterns to the new screen described below — do not just copy the reference verbatim:\n${referenceScreen.html_content || referenceScreen.description || ''}`
    : '';
  const platform = PLATFORM_GUIDES[targetPlatform] || '';

  return `You are an expert UI/UX developer. Generate a complete, self-contained HTML file for the screen described below using ${TECH}.
Rules:
- Output ONLY valid HTML starting with <!DOCTYPE html>
- All CSS goes inside a <style> tag; CDN links (e.g. Tailwind CDN) are allowed
- Visually polished, modern design with realistic placeholder content
- Fully responsive
- No explanation, no markdown — raw HTML only
- REQUIRED: Define both a light and a dark colour scheme, switched via a "dark" class on <html> or <body> (e.g. \`html.dark { ... }\` or CSS variables read via a [data-theme] attribute). Default to the light scheme when the class/attribute is absent. This is for theme switching driven externally later — do NOT render any visible toggle button, switch, or other UI control on the screen itself; do NOT include any toggle JavaScript.${ctx}${design}${reference}${platform}${save}

Screen to design:
${description}`;
}

function buildEditPromptInline(instruction, existingHtml, projectDescription) {
  const ctx = projectDescription ? `\nProject context: ${projectDescription}` : '';
  return `You are an expert UI/UX developer. Modify the existing HTML screen below based on the instruction provided.
Rules:
- Output ONLY the complete modified HTML starting with <!DOCTYPE html>
- All CSS goes inside a <style> tag
- Preserve the overall design language; only apply the requested changes
- No explanation, no markdown — raw HTML only
- Do NOT use any tools, write any files, or save anything — print the raw HTML directly to stdout${ctx}

Modification instruction:
${instruction}

Existing HTML:
${existingHtml}`;
}

// If the screen's HTML contains data-screen prototype navigation links, make
// sure a guidance comment is present so anything reading this HTML later (e.g.
// Generate Workflows converting the design to Flutter/Android/Web) knows these
// are DevFlow-only review links, not literal markup to reproduce. Idempotent —
// safe to call on every save.
const NAV_NOTE_MARKER = 'DevFlow prototype navigation markers';
function ensureNavNoteComment(html) {
  if (!html || html.includes(NAV_NOTE_MARKER) || !/data-screen\s*=\s*["']\d+["']/.test(html)) return html;
  const comment = `<!-- ${NAV_NOTE_MARKER}: elements with a data-screen="<id>" attribute are internal DevFlow links used to jump between mockup screens while reviewing this design — they are NOT part of the intended product UI. Example: <button data-screen="12">View Dashboard</button> jumps to the screen with id 12 inside DevFlow only. When converting this design to Flutter/Android/Web code, do NOT implement data-screen literally — instead wire up real navigation to whichever screen that id refers to. -->\n`;
  return html.includes('<head>')
    ? html.replace('<head>', `<head>\n${comment}`)
    : comment + html;
}

// ----------------------------------------------------------------
// MockupsPage — full-page version of ScreensModal
// ----------------------------------------------------------------
export class MockupsPage {
  constructor(container, params, router) {
    this.container        = container;
    this.router           = router;
    this._projectId       = params.projectId;
    this._screenTitle     = params.screenTitle || null;
    this._project         = null;
    this._screens         = [];
    this._activeId        = null;
    this._activeTab       = 'preview';
    this._modelConfigs    = [];
    this._selectedModelId = null;
    this._designTemplate  = '';
    this._editingId       = null;
    this._screenTemplates = [];
    this._aiRunning       = false;
    this._exportMenuOpen  = false;
    this._previewTheme    = 'light';
    this._handleExportMenuOutside = this._handleExportMenuOutside.bind(this);
    this._handleMockupNavMessage  = this._handleMockupNavMessage.bind(this);
  }

  async mount() {
    injectCss('styles/screens.css');
    injectCss('pages/mockups/mockups-page.css');
    injectCss('components/project-sidebar/project-sidebar.css');
    applyStoredTheme();

    let _mapping;
    [this._project, this._screens, this._modelConfigs, _mapping] = await Promise.all([
      window.db.projects.get(this._projectId),
      window.db.screenDesigns.list(this._projectId),
      window.db.modelConfigs.list(),
      window.db.modelMapping.get('mockups'),
    ]);

    // Load templates from DB — seed() is idempotent (INSERT OR IGNORE by unique
    // name), so calling it every mount picks up newly added built-ins without
    // duplicating or overwriting ones the user already has.
    this._screenTemplates = await window.db.screenTemplates.seed(SCREEN_TEMPLATES, DEPRECATED_TEMPLATE_NAMES);
    const _mappedId = _mapping?.model_config_id ?? null;

    this._designTemplate = this._project?.design_template || '';
    this._activeTab      = 'preview';



    if (this._screenTitle) {
      const needle = this._screenTitle.toLowerCase();
      const match  = this._screens.find(s => s.title.toLowerCase() === needle)
                  || this._screens.find(s => s.title.toLowerCase().includes(needle))
                  || this._screens.find(s => needle.includes(s.title.toLowerCase()));
      this._activeId = match?.id ?? null;
    } else {
      this._activeId = this._screens[0]?.id ?? null;
    }

    const defCli = this._modelConfigs.find(c => c.is_default && c.type !== 'anthropic')
                || this._modelConfigs.find(c => c.type !== 'anthropic')
                || this._modelConfigs[0];
    this._selectedModelId = _mappedId ?? defCli?.id ?? null;

    this.container.innerHTML = this._pageTemplate();
    this._picker = new ModelPicker({
      anchor:   this.container.querySelector('#mockupsModelPicker'),
      onSelect: model => {
        this._selectedModelId = model?.id ?? null;
        const nameEl = this.container.querySelector('#scrModelName');
        if (nameEl) nameEl.textContent = model?.label || 'No model selected';
      },
      initialId: _mappedId,
    });
    this._bindShellEvents();
    this._sidebar.bindEvents(this.container);
    this._sidebar.loadCounts(this.container, { mockups: this._screens });
    await this._picker.reload();

    this.router.setNavigationGuard(() => this._confirmLeaveIfBusy());
    window.addEventListener('message', this._handleMockupNavMessage);

    if (this._activeId) this._selectScreen(this._activeId);
    else                this._showEmptyState();
  }

  unmount() {
    this.router.clearNavigationGuard();
    document.removeEventListener('click', this._handleExportMenuOutside, true);
    window.removeEventListener('message', this._handleMockupNavMessage);
    removeCss('pages/mockups/mockups-page.css');
    removeCss('styles/screens.css');
    removeCss('components/project-sidebar/project-sidebar.css');
    this._picker?.unmount();
    window.app.chat.offAll();
    window.app.chat.cancel();
    this._aiRunning = false;
    if (this._ctrlSHandler) {
      document.removeEventListener('keydown', this._ctrlSHandler);
      this._ctrlSHandler = null;
    }
  }

  // ----------------------------------------------------------------
  // AI-busy guard — blocks screen switches, page navigation, and app
  // close while a chat generation is running. Confirming cancels it.
  // ----------------------------------------------------------------
  async _confirmLeaveIfBusy() {
    if (!this._aiRunning) return true;
    const ok = await Dialog.confirm(
      'A screen is still generating. Leaving now will cancel the generation and it cannot be resumed.',
      { title: 'Generation in progress', confirmText: 'Leave Anyway', danger: true }
    );
    if (ok) {
      window.app.chat.offAll();
      window.app.chat.cancel();
      this._aiRunning = false;
    }
    return ok;
  }

  _getProject()      { return this._project; }

  _getTemplateParts() {
    try {
      const p = JSON.parse(this._designTemplate);
      if (p && typeof p === 'object') return { light: p.light || '', dark: p.dark || '' };
    } catch {}
    return { light: '', dark: this._designTemplate || '' };
  }

  _hasAnyTemplate() {
    const p = this._getTemplateParts();
    return !!(p.light || p.dark);
  }

  _getDesignTemplateForPrompt() {
    const p = this._getTemplateParts();
    if (p.light && p.dark) return `Light theme:\n${p.light}\n\nDark theme:\n${p.dark}`;
    return p.dark || p.light || '';
  }

  _getSelectedModel() {
    if (this._picker) return this._picker.selectedModel;
    const m = this._modelConfigs?.find(c => c.id === this._selectedModelId);
    return m || this._modelConfigs?.find(c => c.is_default) || this._modelConfigs?.[0] || null;
  }

  // ----------------------------------------------------------------
  // Page shell
  // ----------------------------------------------------------------
  _pageTemplate() {
    const name    = this._project?.name ?? 'Project';
    const initial = name.trim()[0]?.toUpperCase() ?? '?';
    this._sidebar = new ProjectSidebar({ projectId: this._projectId, router: this.router, activeRoute: 'mockups' });
    return `
      <div class="ph-project-shell">

        <header class="project-home__header">
          <button class="project-home__back" id="btnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div class="project-home__badge">
            <div class="project-home__badge-initial">${escHtml(initial)}</div>
            <span class="project-home__badge-name">${escHtml(name)}</span>
          </div>
          <span class="ph-header-page-chip">Mockups</span>
          <div class="ph-header-actions">
            <button class="mockups-cwd-pill${this._project?.project_path ? '' : ' mockups-cwd-pill--empty'}"
              id="mockupsCwdBtn" type="button"
              title="${this._project?.project_path ? escHtml(this._project.project_path) + ' — click to change' : 'No project folder set — click to select one'}">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                  stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              </svg>
              <span id="mockupsCwdText">${this._project?.project_path ? escHtml(this._project.project_path) : 'Select project folder'}</span>
            </button>
            <div id="mockupsModelPicker"></div>
            <button class="mockups-page__style-btn scr-btn scr-btn--sm${this._hasAnyTemplate() ? ' scr-btn--ds-active' : ''}" id="scrStyleGuideBtn" title="Open Project Style Guide page">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/>
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
              Styles
              <span class="scr-style-dot${this._hasAnyTemplate() ? ' scr-style-dot--active' : ''}"></span>
            </button>
          </div>
        </header>

        <div class="ph-page-with-nav">
          ${this._sidebar.html()}
          <div class="mockups-page">
            <div class="mockups-page__body">
              <aside class="scr-sidebar">
                <div class="scr-sidebar__toolbar">
                  <button class="scr-sidebar__add scr-btn scr-btn--sm scr-btn--primary" id="scrNewBtn">
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                      <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                    New Screen
                  </button>
                  <div class="scr-export-picker" id="scrExportPickerAnchor"></div>
                </div>
                <div class="scr-sidebar__list" id="scrList">${this._renderList()}</div>
              </aside>
              <div class="scr-main" id="scrMain"></div>
            </div>
          </div>
        </div>

      </div>
    `;
  }

  _renderList() {
    if (this._screens.length === 0) return '<p class="scr-sidebar__empty">No screens yet</p>';
    return this._screens.map(s => {
      return `
        <div class="scr-sidebar__item${s.id === this._activeId ? ' scr-sidebar__item--active' : ''}" data-id="${s.id}">
          <svg class="scr-sidebar__icon" width="11" height="11" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
          </svg>
          <div class="scr-sidebar__item-info">
            <div class="scr-sidebar__item-row">
              <span class="scr-sidebar__item-id">#${s.id}</span>
              <span class="scr-sidebar__item-title">${escHtml(s.title)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  _refreshSidebar() {
    const list = this.container.querySelector('#scrList');
    if (list) list.innerHTML = this._renderList();
    this._bindSidebarItems();
  }

  // ----------------------------------------------------------------
  // Export dropdown — "Current Screen" / "All Screens" to PNG
  // ----------------------------------------------------------------
  _renderExportPicker() {
    const anchor = this.container.querySelector('#scrExportPickerAnchor');
    if (!anchor) return;

    const open = this._exportMenuOpen;
    anchor.innerHTML = `
      <div class="scr-export-picker__wrap">
        <button class="scr-export-picker__trigger scr-btn scr-btn--sm scr-btn--secondary" type="button" id="scrExportTrigger"
                aria-haspopup="listbox" aria-expanded="${open}">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <path d="M2 10v3a1 1 0 001 1h10a1 1 0 001-1v-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>Export</span>
          <svg class="scr-export-picker__caret${open ? ' scr-export-picker__caret--open' : ''}"
               width="10" height="10" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        ${open ? `
          <div class="scr-export-picker__menu" role="listbox">
            <button class="scr-export-picker__item" data-action="current" role="option" type="button">Current Screen (PNG)</button>
            <button class="scr-export-picker__item" data-action="all" role="option" type="button">All Screens (PNG)</button>
          </div>
        ` : ''}
      </div>
    `;

    anchor.querySelector('#scrExportTrigger').addEventListener('click', e => {
      e.stopPropagation();
      this._exportMenuOpen = !this._exportMenuOpen;
      if (this._exportMenuOpen) document.addEventListener('click', this._handleExportMenuOutside, true);
      else                      document.removeEventListener('click', this._handleExportMenuOutside, true);
      this._renderExportPicker();
    });

    if (open) {
      anchor.querySelectorAll('.scr-export-picker__item').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          this._closeExportMenu();
          if (btn.dataset.action === 'current') this._exportCurrentScreenPng();
          else                                   this._exportAllScreensPng();
        });
      });
    }
  }

  _handleExportMenuOutside(e) {
    const anchor = this.container.querySelector('#scrExportPickerAnchor');
    if (anchor && !anchor.contains(e.target)) this._closeExportMenu();
  }

  _closeExportMenu() {
    this._exportMenuOpen = false;
    document.removeEventListener('click', this._handleExportMenuOutside, true);
    this._renderExportPicker();
  }

  async _exportCurrentScreenPng() {
    if (!this._activeId) {
      await Dialog.alert('No screen selected.');
      return;
    }
    const screen = await window.db.screenDesigns.get(this._activeId);
    if (!screen?.html_content) {
      await Dialog.alert('No HTML content to export. Generate a mockup first.');
      return;
    }
    await this._withExportSpinner(async () => {
      const safe = (s) => (s || '').replace(/[^a-z0-9_\-]/gi, '_');
      await window.app.exportPng({
        html:     screen.html_content,
        filename: safe(screen.title || 'screen'),
        platform: this._project?.target_platform || 'web',
      });
    });
  }

  async _exportAllScreensPng() {
    const screens     = await window.db.screenDesigns.list(this._projectId);
    const withContent = screens
      .filter(s => s.html_content && s.html_content.trim())
      .sort((a, b) => a.id - b.id);
    if (!withContent.length) {
      await Dialog.alert('No generated screens to export. Generate at least one mockup first.');
      return;
    }
    await this._withExportSpinner(async () => {
      const safe = (s) => (s || '').replace(/[^a-z0-9_\-]/gi, '_');
      const usedNames = new Set();
      const pad = (n) => String(n).padStart(2, '0');
      const payload = withContent.map((s, i) => {
        let name = `${pad(i + 1)}_${safe(s.title || 'screen')}`;
        while (usedNames.has(name)) name = `${name}_${s.id}`;
        usedNames.add(name);
        return { html: s.html_content, filename: name };
      });
      await window.app.exportPngBatch({
        screens:  payload,
        platform: this._project?.target_platform || 'web',
      });
    });
  }

  async _withExportSpinner(fn) {
    const trigger = this.container.querySelector('#scrExportTrigger');
    const origHtml = trigger?.innerHTML;
    if (trigger) { trigger.disabled = true; trigger.textContent = 'Exporting…'; }
    try {
      await fn();
    } finally {
      if (trigger) { trigger.disabled = false; trigger.innerHTML = origHtml; }
    }
  }

  _bindSidebarItems() {
    this.container.querySelectorAll('.scr-sidebar__item').forEach(el => {
      el.addEventListener('click', async () => {
        if (!(await this._confirmLeaveIfBusy())) return;
        this._selectScreen(Number(el.dataset.id));
      });
    });

  }

  async _reloadModelDropdown() {
    if (this._picker) await this._picker.reload();
  }

  _bindShellEvents() {
    this.container.querySelector('#btnBack')
      .addEventListener('click', () => this._goBack());

    this.container.querySelector('#scrNewBtn')
      .addEventListener('click', () => this._showNewScreenModal());

    this._renderExportPicker();

    this.container.querySelector('#scrStyleGuideBtn')
      .addEventListener('click', () => {
        this.router.navigate('style-guide', { projectId: this._projectId, from: 'mockups' });
      });

    this.container.querySelector('#mockupsCwdBtn')
      ?.addEventListener('click', () => this._pickProjectFolder());

    this._bindSidebarItems();
  }

  // ----------------------------------------------------------------
  // Project folder — where the CLI runs for AI generation/edits.
  // Persisted on the project itself (projects.project_path) so it's shared
  // with other pages (Workflows, Terminal, Git Changes) that already fall
  // back to this same field.
  // ----------------------------------------------------------------
  async _pickProjectFolder() {
    const folderPath = await window.db.dialog.openFolder();
    if (!folderPath) return;
    await window.db.projects.setPath({ id: this._projectId, project_path: folderPath });
    if (this._project) this._project.project_path = folderPath;
    this._updateCwdPill();
  }

  _updateCwdPill() {
    const btn  = this.container.querySelector('#mockupsCwdBtn');
    const text = this.container.querySelector('#mockupsCwdText');
    if (!btn || !text) return;
    const path = this._project?.project_path || '';
    btn.classList.toggle('mockups-cwd-pill--empty', !path);
    btn.title = path ? `${path} — click to change` : 'No project folder set — click to select one';
    text.textContent = path || 'Select project folder';
  }

  _updateStyleGuideBtn() {
    const btn = this.container.querySelector('#scrStyleGuideBtn');
    if (!btn) return;
    const has = this._hasAnyTemplate();
    btn.classList.toggle('scr-btn--ds-active', has);
    const dot = btn.querySelector('.scr-style-dot');
    if (dot) dot.classList.toggle('scr-style-dot--active', has);
  }

  _goBack() {
    if (this._activeId === null && this._newFormHasData()) {
      this._showUnsavedDialog();
    } else {
      this.router.navigate('project-home', { projectId: this._projectId });
    }
  }

  _newFormHasData() {
    const main = this.container.querySelector('#scrMain');
    if (!main) return false;
    const title = main.querySelector('#scrTitle')?.value.trim() || '';
    const desc  = main.querySelector('#scrDescription')?.value.trim() || '';
    return title.length > 0 || desc.length > 0;
  }

  _showUnsavedDialog() {
    const existing = this.container.querySelector('.scr-unsaved-overlay');
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
        <p class="scr-unsaved-dialog__body">You have unsaved changes. What would you like to do?</p>
        <div class="scr-unsaved-dialog__actions">
          <button class="scr-btn scr-btn--primary" id="unsavedDraft">Save as Draft</button>
          <button class="scr-btn scr-btn--danger"   id="unsavedDiscard">Discard</button>
          <button class="scr-btn scr-btn--secondary" id="unsavedCancel">Cancel</button>
        </div>
      </div>
    `;

    this.container.querySelector('.mockups-page').appendChild(dlg);

    dlg.querySelector('#unsavedCancel').addEventListener('click', () => dlg.remove());
    dlg.querySelector('#unsavedDiscard').addEventListener('click', () => {
      dlg.remove();
      this.router.navigate('project-home', { projectId: this._projectId });
    });
    dlg.querySelector('#unsavedDraft').addEventListener('click', () => this._saveAsDraft(dlg));
  }

  _showDeleteConfirmDialog(screen, onConfirm) {
    const existing = this.container.querySelector('.scr-unsaved-overlay');
    if (existing) return;

    const dlg = document.createElement('div');
    dlg.className = 'scr-unsaved-overlay';
    dlg.innerHTML = `
      <div class="scr-unsaved-dialog">
        <div class="scr-unsaved-dialog__icon" style="color:#ef4444">
          <svg width="22" height="22" viewBox="0 0 14 14" fill="none">
            <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h3 class="scr-unsaved-dialog__title">Delete Screen</h3>
        <p class="scr-unsaved-dialog__body">Delete <strong>${escHtml(screen.title)}</strong>? This cannot be undone.</p>
        <div class="scr-unsaved-dialog__actions">
          <button class="scr-btn scr-btn--danger"    id="dlgDeleteConfirm">Delete</button>
          <button class="scr-btn scr-btn--secondary" id="dlgDeleteCancel">Cancel</button>
        </div>
      </div>
    `;

    this.container.querySelector('.mockups-page').appendChild(dlg);
    dlg.querySelector('#dlgDeleteCancel').addEventListener('click', () => dlg.remove());
    dlg.querySelector('#dlgDeleteConfirm').addEventListener('click', () => {
      dlg.remove();
      onConfirm();
    });
  }

  _showOverwriteConfirmDialog(fileName, onConfirm) {
    const existing = this.container.querySelector('.scr-unsaved-overlay');
    if (existing) return;

    const dlg = document.createElement('div');
    dlg.className = 'scr-unsaved-overlay';
    dlg.innerHTML = `
      <div class="scr-unsaved-dialog">
        <div class="scr-unsaved-dialog__icon" style="color:#f59e0b">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M12 9v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
        </div>
        <h3 class="scr-unsaved-dialog__title">File Already Exists</h3>
        <p class="scr-unsaved-dialog__body">
          <code style="display:inline-block;margin-bottom:6px;padding:4px 10px;background:var(--bg-secondary,rgba(0,0,0,.08));border-radius:4px;font-size:12px;word-break:break-all">${escHtml(fileName)}</code><br>
          already exists in the selected folder. Overwrite it?
        </p>
        <div class="scr-unsaved-dialog__actions">
          <button class="scr-btn scr-btn--danger"    id="overwriteConfirm">Overwrite</button>
          <button class="scr-btn scr-btn--secondary" id="overwriteCancel">Cancel</button>
        </div>
      </div>
    `;
    this.container.querySelector('.mockups-page').appendChild(dlg);
    dlg.querySelector('#overwriteCancel').addEventListener('click', () => dlg.remove());
    dlg.querySelector('#overwriteConfirm').addEventListener('click', () => {
      dlg.remove();
      onConfirm();
    });
  }

  _showConfirmDialog(title, body, confirmLabel, onConfirm) {
    const existing = this.container.querySelector('.scr-unsaved-overlay');
    if (existing) return;

    const dlg = document.createElement('div');
    dlg.className = 'scr-unsaved-overlay';
    dlg.innerHTML = `
      <div class="scr-unsaved-dialog">
        <div class="scr-unsaved-dialog__icon" style="color:#f59e0b">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M12 9v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
        </div>
        <h3 class="scr-unsaved-dialog__title">${escHtml(title)}</h3>
        <p class="scr-unsaved-dialog__body">${escHtml(body)}</p>
        <div class="scr-unsaved-dialog__actions">
          <button class="scr-btn scr-btn--danger"    id="confirmDlgOk">${escHtml(confirmLabel)}</button>
          <button class="scr-btn scr-btn--secondary" id="confirmDlgCancel">Cancel</button>
        </div>
      </div>
    `;
    this.container.querySelector('.mockups-page').appendChild(dlg);
    dlg.querySelector('#confirmDlgCancel').addEventListener('click', () => dlg.remove());
    dlg.querySelector('#confirmDlgOk').addEventListener('click', () => {
      dlg.remove();
      onConfirm();
    });
  }

  _showExportSuccessModal(fileName) {
    const dlg = document.createElement('div');
    dlg.className = 'scr-unsaved-overlay';
    dlg.innerHTML = `
      <div class="scr-unsaved-dialog">
        <div class="scr-unsaved-dialog__icon" style="color:#22c55e">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.6"/>
            <path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h3 class="scr-unsaved-dialog__title">Export Successful</h3>
        <p class="scr-unsaved-dialog__body">
          File saved as<br>
          <code style="display:inline-block;margin-top:6px;padding:4px 10px;background:var(--bg-secondary,rgba(0,0,0,.08));border-radius:4px;font-size:12px;word-break:break-all">${escHtml(fileName)}</code>
        </p>
        <div class="scr-unsaved-dialog__actions">
          <button class="scr-btn scr-btn--primary" id="exportSuccessOk">OK</button>
        </div>
      </div>
    `;
    this.container.querySelector('.mockups-page').appendChild(dlg);
    dlg.querySelector('#exportSuccessOk').addEventListener('click', () => dlg.remove());
  }

  async _saveForm() {
    const main  = this.container.querySelector('#scrMain');
    const title = main?.querySelector('#scrTitle')?.value.trim() || '';
    const desc  = main?.querySelector('#scrDescription')?.value.trim() || '';
    const stack = 'html';

    if (!title) { main?.querySelector('#scrTitle')?.focus(); return null; }

    if (this._editingId) {
      return window.db.screenDesigns.update({
        id:          this._editingId,
        title,
        description: desc,
        tech_stack:  stack,
      });
    }

    const screen = await window.db.screenDesigns.create({
      project_id:   this._projectId,
      title,
      description:  desc,
      tech_stack:   stack,
      html_content: '',
    });
    this._editingId = screen.id;
    return screen;
  }

  async _saveAsDraft(dlg) {
    const btn = dlg.querySelector('#unsavedDraft');
    btn.disabled    = true;
    btn.textContent = 'Saving…';
    await this._saveForm();
    dlg.remove();
    this.router.navigate('project-home', { projectId: this._projectId });
  }

  // ----------------------------------------------------------------
  // Empty state (no screens yet)
  // ----------------------------------------------------------------
  _showEmptyState() {
    this._activeId  = null;
    this._editingId = null;
    this._setActiveItem(null);
    const main = this.container.querySelector('#scrMain');
    main.innerHTML = `
      <div class="scr-empty-state">
        <svg width="48" height="48" viewBox="0 0 16 16" fill="none" opacity="0.25">
          <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.1"/>
          <path d="M4 6h8M4 9h5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
        <p class="scr-empty-state__title">No screens yet</p>
        <p class="scr-empty-state__sub">Click <strong>New Screen</strong> in the sidebar to create your first mockup.</p>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // New Screen modal
  // ----------------------------------------------------------------
  _showNewScreenModal() {
    // Build grouped <option> elements from DB templates
    const groups = {};
    this._screenTemplates.forEach(t => {
      const g = t.group_name || t.group || 'General';
      if (!groups[g]) groups[g] = [];
      groups[g].push(t);
    });
    const templateOptions = Object.entries(groups).map(([g, templates]) => `
      <optgroup label="${escHtml(g)}">
        ${templates.map(t => `<option value="${escHtml(String(t.id))}">${escHtml(t.name)}</option>`).join('')}
      </optgroup>
    `).join('');

    const dlg = document.createElement('div');
    dlg.className = 'scr-overlay';
    dlg.innerHTML = `
      <div class="scr-ns-dialog" style="width:800px;max-width:800px;height:80vh;display:flex;flex-direction:column;">
        <div class="scr-ns-dialog__header">
          <span class="scr-ns-dialog__title">New Screen</span>
          <button class="scr-dialog__close" id="scrNsClose">&times;</button>
        </div>
        <div class="scr-ns-dialog__body" style="display:flex;flex-direction:column;gap:14px;flex:1;overflow-y:auto;">
          <div class="scr-form__row">
            <label class="scr-form__label">Title *</label>
            <input class="scr-form__input" id="scrNsTitle" type="text"
              placeholder="e.g. Login Screen, Dashboard, Product List…" autocomplete="off"/>
          </div>
          <div class="scr-form__row">
            <label class="scr-form__label">Template <span style="font-weight:400;opacity:.6">(optional — auto-fills description)</span></label>
            <select class="scr-form__select" id="scrNsTemplate">
              <option value="">— No template —</option>
              ${templateOptions}
            </select>
          </div>
          <div class="scr-form__row">
            <label class="scr-form__label">Reference screen <span style="font-weight:400;opacity:.6">(optional — used as a design/content reference for the first generation only)</span></label>
            <select class="scr-form__select" id="scrNsReference">
              <option value="">— No reference —</option>
              ${this._screens.map(s => `<option value="${escHtml(String(s.id))}">${escHtml(s.title)}</option>`).join('')}
            </select>
          </div>
          <div class="scr-form__row scr-form__row--grow">
            <label class="scr-form__label">Description <span style="font-weight:400;opacity:.6">(used as AI prompt)</span></label>
            <textarea class="scr-form__textarea" id="scrNsDesc" rows="10"
              placeholder="Describe the screen sections, layout, components, and style…" style="resize:vertical;min-height:160px;"></textarea>
          </div>
        </div>
        <div class="scr-ns-dialog__footer">
          <button class="scr-btn scr-btn--secondary" id="scrNsCancel">Cancel</button>
          <button class="scr-btn scr-btn--primary" id="scrNsSave" title="Save (Ctrl+Enter)">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(dlg);
    dlg.querySelector('#scrNsTitle').focus();

    // Template selector → auto-fill title + description
    dlg.querySelector('#scrNsTemplate').addEventListener('change', (e) => {
      const tpl = this._screenTemplates.find(t => String(t.id) === e.target.value);
      if (!tpl) return;
      const titleEl = dlg.querySelector('#scrNsTitle');
      if (!titleEl.value.trim()) titleEl.value = tpl.name;
      dlg.querySelector('#scrNsDesc').value = tpl.description;
    });

    const close = () => dlg.remove();
    dlg.querySelector('#scrNsClose').addEventListener('click', close);
    dlg.querySelector('#scrNsCancel').addEventListener('click', close);

    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        dlg.querySelector('#scrNsSave')?.click();
      }
      if (e.key === 'Escape') close();
    });

    dlg.querySelector('#scrNsSave').addEventListener('click', async () => {
      const title = dlg.querySelector('#scrNsTitle').value.trim();
      if (!title) { dlg.querySelector('#scrNsTitle').focus(); return; }
      const description = dlg.querySelector('#scrNsDesc').value.trim();
      const referenceId = dlg.querySelector('#scrNsReference').value;
      const referenceScreen = referenceId ? this._screens.find(s => String(s.id) === referenceId) : null;

      const screen = await window.db.screenDesigns.create({
        project_id:   this._projectId,
        title,
        description,
        tech_stack:   'html',
        html_content: '',
      });

      close();
      this._screens  = await window.db.screenDesigns.list(this._projectId);
      this._activeId = screen.id;
      this._refreshSidebar();
      screen._referenceScreen = referenceScreen || null;
      this._showScreenViewer(screen);
    });
  }

  async _runChatGeneration(screen, chatInput, main) {
    const desc = chatInput.value.trim();
    if (!desc) { chatInput.focus(); return; }

    const model = this._getSelectedModel();
    if (!model) { await Dialog.alert('No model selected.'); return; }

    const project = this._getProject();

    // CLI models actually spawn a subprocess with a real working directory —
    // without a project folder there's nowhere for the CLI to run (and temp
    // files it's told to Read would fall outside whatever directory it
    // inherits by default). API/Ollama models embed content inline and don't
    // need this.
    if (model.type === 'cli' && !project?.project_path) {
      await Dialog.alert('No project folder set. Click the folder path in the header to select one before generating with a CLI model.');
      return;
    }

    chatInput.value = '';
    chatInput.style.height = 'auto';

    const hasHtml = !!screen.html_content;

    // For edit: pass structured payload so main process can write HTML to temp file (CLI)
    // or embed inline (API/Ollama). For create: full prompt string as before.
    let generateArg;

    if (hasHtml) {
      generateArg = {
        editPayload: {
          instruction:        desc,
          htmlContent:        screen.html_content,
          projectDescription: project?.description || '',
        },
        model,
        cwd: project?.project_path || undefined,
      };
    } else {
      const prompt = buildScreenPrompt(desc, project?.description || '', '', this._getDesignTemplateForPrompt(), project?.target_platform, screen._referenceScreen);
      generateArg  = { prompt, model, cwd: project?.project_path || undefined };
    }

    const messagesEl = main.querySelector('#scrChatMessages');
    messagesEl.querySelector('.scr-chat-empty')?.remove();
    messagesEl.querySelector('.scr-chat-history-group--initial')?.remove();

    // User bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'scr-chat-msg scr-chat-msg--user';
    userBubble.innerHTML = `<div class="scr-chat-msg__text">${escHtml(desc)}</div>`;
    messagesEl.appendChild(userBubble);

    // Generation bubble — runs immediately, no intermediate prompt-review step
    const previewBubble = document.createElement('div');
    previewBubble.className = 'scr-chat-msg scr-chat-msg--assistant';
    previewBubble.innerHTML = `
      <div class="scr-chat-msg__generating">
        <span class="scr-chat-stream-dot"></span>
        <div class="scr-chat-msg__gen-info">
          <span class="scr-chat-msg__gen-label">Generating… 0s</span>
        </div>
        <button class="scr-chat-cancel-btn">Cancel</button>
      </div>
      <pre class="scr-chat-stream-preview"></pre>
    `;
    messagesEl.appendChild(previewBubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    this._saveToHistory(desc);
    this._aiRunning = true;

    const genStart = Date.now();
    const genTimer = setInterval(() => {
      const labelEl = previewBubble.querySelector('.scr-chat-msg__gen-label');
      if (!labelEl) { clearInterval(genTimer); return; }
      const elapsed = Math.floor((Date.now() - genStart) / 1000);
      const display = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
      labelEl.textContent = `Generating… ${display}`;
    }, 1000);

    window.app.chat.offAll();

    window.app.chat.onToken(({ text }) => {
      const preview = previewBubble.querySelector('.scr-chat-stream-preview');
      if (preview) {
        preview.textContent += text;
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    });

    window.app.chat.onDone(async ({ html, raw, usage, error }) => {
      clearInterval(genTimer);
      window.app.chat.offAll();
      this._aiRunning = false;
      const rawText    = raw || '';
      const previousHtml = screen.html_content;  // capture before overwrite

      if (html && !error) {
        html = ensureNavNoteComment(html);
        await window.db.screenDesigns.update({ id: screen.id, html_content: html, executed: 1 });
        screen.html_content = html;
        screen.executed = 1;
        this._loadPreview(html);
        previewBubble.innerHTML = `
          <div class="scr-chat-response-bubble scr-chat-response-bubble--ok">
            <div class="scr-chat-response-bubble__header">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.3"/>
                <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Preview updated
              ${previousHtml ? `<button class="scr-chat-rollback-btn" title="Rollback to previous version">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M2 6h7a5 5 0 0 1 0 10H4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M5 3L2 6l3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Rollback
              </button>` : ''}
            </div>
            <pre class="scr-chat-response-bubble__pre">${escHtml(rawText)}</pre>
          </div>
        `;
        if (previousHtml) {
          previewBubble.querySelector('.scr-chat-rollback-btn')?.addEventListener('click', () => {
            this._showConfirmDialog(
              'Rollback changes?',
              'This will restore the previous version. Current changes will be lost.',
              'Rollback',
              async () => {
                await window.db.screenDesigns.update({ id: screen.id, html_content: previousHtml });
                screen.html_content = previousHtml;
                this._loadPreview(previousHtml);
                previewBubble.querySelector('.scr-chat-rollback-btn')?.remove();
              }
            );
          });
        }
        if (usage && (usage.input_tokens || usage.output_tokens)) {
          const parts = [
            `in: ${(usage.input_tokens || 0).toLocaleString()}`,
            `out: ${(usage.output_tokens || 0).toLocaleString()}`,
          ];
          if (usage.cache_read_input_tokens > 0)     parts.push(`${usage.cache_read_input_tokens.toLocaleString()} cached`);
          if (usage.cache_creation_input_tokens > 0) parts.push(`${usage.cache_creation_input_tokens.toLocaleString()} cache write`);
          const usageEl = document.createElement('div');
          usageEl.className = 'scr-chat-usage';
          usageEl.textContent = parts.join(' · ');
          previewBubble.appendChild(usageEl);
        }
      } else {
        previewBubble.innerHTML = `
          <div class="scr-chat-response-bubble scr-chat-response-bubble--err">
            <div class="scr-chat-response-bubble__header">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 13H2L8 2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                <path d="M8 7v3M8 11.5v.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              </svg>
              ${escHtml(error || 'No HTML in response')}
            </div>
            <pre class="scr-chat-response-bubble__pre">${escHtml(rawText || '(no output received)')}</pre>
          </div>
        `;
      }
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });

    previewBubble.querySelector('.scr-chat-cancel-btn').addEventListener('click', () => {
      clearInterval(genTimer);
      window.app.chat.cancel();
      window.app.chat.offAll();
      this._aiRunning = false;
      previewBubble.innerHTML = `<div class="scr-chat-msg__cancelled">Cancelled</div>`;
    });

    window.app.chat.generate(generateArg);
  }

  async _loadInitialHistory(screenId, main) {
    const items = await window.db.screenPromptHistory.list({
      project_id:       this._projectId,
      screen_design_id: screenId,
    });

    const recent     = items.slice(0, 3);
    const messagesEl = main.querySelector('#scrChatMessages');
    const chatInput  = main.querySelector('#scrDescription');
    const resize     = () => { chatInput.style.height = 'auto'; chatInput.style.height = chatInput.scrollHeight + 'px'; };

    const group = document.createElement('div');
    group.className = 'scr-chat-history-group scr-chat-history-group--initial';

    const listHtml = recent.length
      ? `<div class="scr-chat-history-list">
          ${recent.map((h, i) => `
            <div class="scr-chat-history-item" data-idx="${i}">
              <span class="scr-chat-history-item__text">${escHtml(h.prompt.length > 100 ? h.prompt.slice(0, 100) + '…' : h.prompt)}</span>
              <span class="scr-chat-history-item__time">${timeAgo(h.executed_at)}</span>
            </div>
          `).join('')}
        </div>`
      : `<p class="scr-chat-history-empty">No prompts run for this screen yet.</p>`;

    group.innerHTML = `
      <div class="scr-chat-history-label">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M8 5v3.5l2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        ${recent.length ? `Last ${recent.length} prompt${recent.length > 1 ? 's' : ''}` : 'Recent prompts'}
        <button class="scr-chat-history-dismiss" title="Hide">&times;</button>
      </div>
      ${listHtml}
    `;

    if (recent.length) {
      group.querySelectorAll('.scr-chat-history-item').forEach(el => {
        el.addEventListener('click', () => {
          chatInput.value = recent[Number(el.dataset.idx)].prompt;
          resize();
          chatInput.focus();
        });
      });
    }

    group.querySelector('.scr-chat-history-dismiss').addEventListener('click', () => group.remove());

    messagesEl.querySelector('.scr-chat-empty')?.remove();
    messagesEl.appendChild(group);
  }

  async _showHistoryInChat(main) {
    if (!this._activeId) return;
    const messagesEl = main.querySelector('#scrChatMessages');
    const chatInput  = main.querySelector('#scrDescription');
    const resize     = () => { chatInput.style.height = 'auto'; chatInput.style.height = chatInput.scrollHeight + 'px'; };

    const existing = messagesEl.querySelector('.scr-chat-history-group');

    // Expanded (full) group is showing → collapse back to 3
    if (existing && !existing.classList.contains('scr-chat-history-group--initial')) {
      existing.remove();
      await this._loadInitialHistory(this._activeId, main);
      return;
    }

    // Initial (3-item) group is showing → expand to full list
    if (existing) existing.remove();

    const items = await window.db.screenPromptHistory.list({
      project_id:       this._projectId,
      screen_design_id: this._activeId,
    });

    const group = document.createElement('div');
    group.className = 'scr-chat-history-group';

    if (!items.length) {
      group.innerHTML = `
        <div class="scr-chat-history-label">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
            <path d="M8 5v3.5l2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Recent prompts
        </div>
        <p class="scr-chat-history-empty">No prompts run for this screen yet.</p>
      `;
    } else {
      group.innerHTML = `
        <div class="scr-chat-history-label">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
            <path d="M8 5v3.5l2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          All ${items.length} prompt${items.length > 1 ? 's' : ''}
        </div>
        <div class="scr-chat-history-list">
          ${items.map((h, i) => `
            <div class="scr-chat-history-item" data-idx="${i}">
              <span class="scr-chat-history-item__text">${escHtml(h.prompt.length > 100 ? h.prompt.slice(0, 100) + '…' : h.prompt)}</span>
              <span class="scr-chat-history-item__time">${timeAgo(h.executed_at)}</span>
            </div>
          `).join('')}
        </div>
      `;
      group.querySelectorAll('.scr-chat-history-item').forEach(el => {
        el.addEventListener('click', () => {
          chatInput.value = items[Number(el.dataset.idx)].prompt;
          resize();
          chatInput.focus();
          group.remove();
        });
      });
    }

    messagesEl.querySelector('.scr-chat-empty')?.remove();
    messagesEl.appendChild(group);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  _showEditScreenModal(screen) {
    const dlg = document.createElement('div');
    dlg.className = 'scr-overlay';
    dlg.innerHTML = `
      <div class="scr-ns-dialog" style="width:80vw;max-width:80vw;height:80vh;display:flex;flex-direction:column;">
        <div class="scr-ns-dialog__header">
          <span class="scr-ns-dialog__title">Edit Screen</span>
          <button class="scr-dialog__close" id="scrEditClose">&times;</button>
        </div>
        <div class="scr-ns-dialog__body" style="display:flex;flex-direction:column;gap:14px;flex:1;overflow-y:auto;">
          <div class="scr-form__row">
            <label class="scr-form__label">Title *</label>
            <input class="scr-form__input" id="scrEditTitle" type="text"
              value="${escHtml(screen.title)}" autocomplete="off"/>
          </div>
          <div class="scr-form__row scr-form__row--grow">
            <label class="scr-form__label">Description <span style="font-weight:400;opacity:.6">(used as AI prompt)</span></label>
            <textarea class="scr-form__textarea" id="scrEditDesc" rows="10"
              placeholder="Describe the screen sections, layout, components, and style…" style="resize:vertical;min-height:160px;">${escHtml(screen.description || '')}</textarea>
          </div>
        </div>
        <div class="scr-ns-dialog__footer">
          <button class="scr-btn scr-btn--secondary" id="scrEditCancel">Cancel</button>
          <button class="scr-btn scr-btn--primary" id="scrEditSave" title="Save (Ctrl+Enter)">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(dlg);
    dlg.querySelector('#scrEditTitle').focus();

    const close = () => dlg.remove();
    dlg.querySelector('#scrEditClose').addEventListener('click', close);
    dlg.querySelector('#scrEditCancel').addEventListener('click', close);

    const doSave = async () => {
      const title = dlg.querySelector('#scrEditTitle').value.trim();
      if (!title) { dlg.querySelector('#scrEditTitle').focus(); return false; }
      const description = dlg.querySelector('#scrEditDesc').value.trim();

      await window.db.screenDesigns.update({ id: screen.id, title, description });
      screen.title       = title;
      screen.description = description;

      const titleEl = this.container.querySelector('.scr-viewer__title');
      if (titleEl) titleEl.textContent = title;

      this._screens = await window.db.screenDesigns.list(this._projectId);
      this._refreshSidebar();
      return true;
    };

    dlg.querySelector('#scrEditSave').addEventListener('click', async () => {
      if (await doSave()) close();
    });

    dlg.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        if (await doSave()) close();
      }
      if (e.key === 'Escape') close();
    });
  }

  async _saveToHistory(prompt) {
    if (!prompt || !this._activeId) return;
    const existing = await window.db.screenPromptHistory.list({ project_id: this._projectId, screen_design_id: this._activeId });
    if (existing.some(e => e.prompt === prompt)) return;
    await window.db.screenPromptHistory.create({ project_id: this._projectId, screen_design_id: this._activeId, prompt });
    this._loadPromptHistory();
  }

  async _loadPromptHistory() {
    const container = this.container.querySelector('#scrPromptHistory');
    if (!container) return;
    const items = await window.db.screenPromptHistory.list({ project_id: this._projectId, screen_design_id: this._activeId });
    if (items.length === 0) { container.innerHTML = ''; return; }

    const descEl = () => this.container.querySelector('#scrDescription');

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
      await window.db.screenPromptHistory.deleteAll({ project_id: this._projectId, screen_design_id: this._activeId });
      this._loadPromptHistory();
    });
  }

  async _chooseFile() {
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

  _tgNotify(text) {
    window.app.telegram.send(text).catch(() => {});
  }

  // ----------------------------------------------------------------
  // Screen viewer
  // ----------------------------------------------------------------
  async _selectScreen(id) {
    this._activeId  = id;
    this._activeTab = 'preview';
    this._setActiveItem(id);
    const screen = await window.db.screenDesigns.get(id);
    if (!screen) return;
    this._showScreenViewer(screen);
  }

  _setActiveItem(id) {
    this.container.querySelectorAll('.scr-sidebar__item').forEach(el => {
      el.classList.toggle('scr-sidebar__item--active', Number(el.dataset.id) === id);
    });
  }

  _showScreenViewer(screen) {
    const main   = this.container.querySelector('#scrMain');
    this._previewTheme = 'light';

    main.innerHTML = `
      <div class="scr-viewer">
        <div class="scr-viewer__toolbar">
          <div class="scr-viewer__meta">
            <span class="scr-viewer__title">${escHtml(screen.title)}</span>
            <span class="scr-viewer__tech-badge">${TECH}</span>
            <button class="scr-btn scr-btn--sm" id="scrEditDetailsBtn" title="Rename title (E)">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
              </svg>
              Edit
            </button>
          </div>
          <div class="scr-viewer__actions">
            <button class="scr-btn scr-btn--sm scr-btn--secondary" id="scrExportHtmlBtn">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M2 10v3a1 1 0 001 1h10a1 1 0 001-1v-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Export HTML
            </button>
            <button class="scr-btn scr-btn--sm scr-btn--secondary" id="scrChooseFileBtn">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M2 4a1 1 0 011-1h3l1.5 2H13a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
              </svg>
              Choose File
            </button>
            <button class="scr-btn scr-btn--sm scr-btn--danger" id="scrDeleteBtn" title="Delete screen">
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="scr-viewer__edit-panel" id="scrEditPanel" hidden>
          <textarea class="scr-desc-editor__textarea" id="scrViewerDescTextarea" placeholder="Describe this screen… (supports Markdown)"></textarea>
          <div class="scr-viewer__edit-footer">
            <button class="scr-btn scr-btn--sm scr-btn--danger" id="scrEditPanelDeleteBtn">
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Delete
            </button>
            <button class="scr-btn scr-btn--sm scr-btn--primary" id="scrViewerSaveBtn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              Save
            </button>
          </div>
        </div>

        <div class="scr-viewer__split" id="scrSplit">
          <div class="scr-viewer__preview-pane" id="scrPreviewPane">
            <div class="scr-viewer__preview-bar">
              <span class="scr-viewer__preview-label">Preview <span id="scrPreviewPct" class="scr-split-pct"></span></span>
              <button class="scr-btn scr-btn--sm scr-btn--icon" id="scrThemeToggle" title="Preview dark theme"></button>
              <button class="scr-btn scr-btn--sm scr-btn--icon" id="scrViewportToggle"></button>
              ${screen.html_content ? `
              <button class="scr-btn scr-btn--sm scr-btn--icon" id="scrOpenWindowBtn" title="Open preview in a separate window">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <rect x="1.5" y="3" width="10" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M7 1.5h7.5V9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M7 9l7-7.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg>
              </button>
              ` : ''}
              <button class="scr-btn scr-btn--sm scr-btn--icon" id="scrRefreshBtn" title="Refresh preview (R)">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                  <path d="M13.5 2.5v2.7H10.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
            <div class="scr-viewer__content" id="scrViewerContent">
              <iframe class="scr-viewer__iframe" id="scrPreviewFrame"></iframe>
            </div>
          </div>

          <div class="scr-viewer__divider" id="scrDivider"></div>

          <div class="scr-viewer__edit-pane" id="scrEditPane">
            <div class="scr-chat-pane">
              <div class="scr-chat-header">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M5.5 8.5l1.5 1.5L10.5 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="scr-chat-header-label">Chat <span id="scrEditPct" class="scr-split-pct"></span></span>
                <span class="scr-viewer__model-name" id="scrModelName">${escHtml(this._getSelectedModel()?.label || 'No model selected')}</span>
                <button class="scr-chat-load-desc" id="scrChatHistoryBtn" title="Recent prompts" style="margin-left:auto">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
                    <path d="M8 5v3.5l2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button class="scr-chat-load-desc" id="scrLoadDescBtn" title="Load saved description">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
                    <path d="M5 6h6M5 9h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
              <div class="scr-chat-messages" id="scrChatMessages">
                <div class="scr-chat-empty">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" opacity="0.25">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                  </svg>
                  <p>Describe what you'd like to build and click <strong>Create Mockup</strong>.</p>
                </div>
              </div>
              <p class="scr-form__hint scr-chat-nav-hint">Tip: to link screens together, ask the AI — e.g. "Add data-screen="12" to the View Dashboard button to link it to screen #12" (screen IDs are shown in the sidebar list).</p>
              <div class="scr-chat-composer">
                <textarea class="scr-chat-input" id="scrDescription"
                  placeholder="Describe the screen… (Alt+Enter for new line)">${!screen.html_content ? escHtml(screen.description || '') : ''}</textarea>
                <button class="scr-chat-send" id="scrSendBtn" title="Run (Enter)">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3 2l11 6-11 6V9.5l8-1.5-8-1.5V2z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this._loadPreview(screen.html_content);
    this._bindViewerEvents(screen);
  }

  _loadPreview(html) {
    const frame = this.container.querySelector('#scrPreviewFrame');
    if (!frame) return;
    // Inject a guard that prevents any anchor from navigating outside the iframe.
    // onclick handlers on the elements still fire normally — only the default
    // link-navigation action is cancelled. Elements marked data-screen="<id>"
    // are treated as prototype links to another mockup screen: instead of
    // navigating, they ask the parent app to switch the active screen.
    const guard = `<script>
(function(){
  document.addEventListener('click', function(e){
    var nav = e.target.closest('[data-screen]');
    if (nav) {
      e.preventDefault();
      var id = nav.getAttribute('data-screen');
      if (id) window.parent.postMessage({ source: 'devflow-mockup-nav', screenId: id }, '*');
      return;
    }
    var a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    var href = (a.getAttribute('href') || '').trim();
    if (href.startsWith('#') && href.length > 1) {
      var el = document.getElementById(href.slice(1)) || document.querySelector('[name="' + href.slice(1) + '"]');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  }, true);
})();
<\/script>`;
    const guarded = html.includes('</head>')
      ? html.replace('</head>', guard + '</head>')
      : guard + html;
    frame.srcdoc = guarded;
    frame.addEventListener('load', () => this._applyPreviewTheme(), { once: true });
  }

  // Toggles dark-mode preview by flipping a class on the iframe's own document —
  // the generated HTML only needs to define the `.dark` CSS, no JS toggle of its own.
  _applyPreviewTheme() {
    const frame = this.container.querySelector('#scrPreviewFrame');
    const doc   = frame?.contentDocument;
    if (!doc) return;
    doc.documentElement.classList.toggle('dark', this._previewTheme === 'dark');
  }

  // Handles data-screen prototype-link clicks posted up from the preview iframe's
  // guard script (see _loadPreview) and jumps to the referenced screen, if it exists.
  _handleMockupNavMessage(e) {
    const frame = this.container.querySelector('#scrPreviewFrame');
    if (!frame || e.source !== frame.contentWindow) return;
    if (!e.data || e.data.source !== 'devflow-mockup-nav') return;
    const id = Number(e.data.screenId);
    if (!id || !this._screens.some(s => s.id === id)) return;
    this._selectScreen(id);
  }

  _bindViewerEvents(screen) {
    const main = this.container.querySelector('#scrMain');

    // Auto-resize chat composer
    const chatInput = main.querySelector('#scrDescription');
    const resizeChatInput = () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = chatInput.scrollHeight + 'px';
    };
    chatInput.addEventListener('input', resizeChatInput);
    resizeChatInput();

    // Enter to run; Alt+Enter inserts newline
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.altKey) {
        e.preventDefault();
        const pos = chatInput.selectionStart;
        chatInput.value = chatInput.value.slice(0, pos) + '\n' + chatInput.value.slice(chatInput.selectionEnd);
        chatInput.selectionStart = chatInput.selectionEnd = pos + 1;
        resizeChatInput();
      } else if (e.key === 'Enter' && !e.altKey) {
        e.preventDefault();
        this._runChatGeneration(screen, chatInput, main);
      }
    });

    main.querySelector('#scrSendBtn').addEventListener('click', () => {
      this._runChatGeneration(screen, chatInput, main);
    });

    // Recent prompts history
    main.querySelector('#scrChatHistoryBtn').addEventListener('click', () => this._showHistoryInChat(main));

    // Load saved description into composer
    main.querySelector('#scrLoadDescBtn').addEventListener('click', () => {
      const saved = screen.description || '';
      if (!saved) return;
      chatInput.value = saved;
      resizeChatInput();
      chatInput.focus();
    });

    // Draggable divider
    const divider      = main.querySelector('#scrDivider');
    const splitEl      = main.querySelector('#scrSplit');
    const editPane     = main.querySelector('#scrEditPane');
    const previewPctEl = main.querySelector('#scrPreviewPct');
    const editPctEl    = main.querySelector('#scrEditPct');

    const updatePct = () => {
      const total = splitEl.getBoundingClientRect().width;
      if (!total) return;
      const editW   = editPane.getBoundingClientRect().width;
      const editPct = Math.round((editW / total) * 100);
      if (editPctEl)    editPctEl.textContent    = editPct + '%';
      if (previewPctEl) previewPctEl.textContent = (100 - editPct) + '%';
    };
    requestAnimationFrame(updatePct);

    divider.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startX            = e.clientX;
      const startEditWidth    = editPane.getBoundingClientRect().width;
      const startPreviewWidth = previewPane.getBoundingClientRect().width;
      const totalWidth        = splitEl.getBoundingClientRect().width;

      // Iframe captures mousemove once the cursor enters it — block it during drag
      const iframe = main.querySelector('#scrPreviewFrame');
      if (iframe) iframe.style.pointerEvents = 'none';
      document.body.style.cursor    = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (mv) => {
        const delta = mv.clientX - startX;
        const isMobile = (localStorage.getItem(VIEWPORT_KEY) || 'desktop') === 'mobile';
        if (isMobile) {
          // In mobile mode, preview is fixed and edit is flexible — resize the preview pane
          const newPreviewWidth = Math.min(Math.max(startPreviewWidth + delta, 200), totalWidth - 200);
          previewPane.style.flex = `0 0 ${newPreviewWidth}px`;
          const previewPct = Math.round((newPreviewWidth / totalWidth) * 100);
          if (previewPctEl) previewPctEl.textContent = previewPct + '%';
          if (editPctEl)    editPctEl.textContent    = (100 - previewPct) + '%';
        } else {
          // In desktop mode, edit is fixed and preview is flexible — resize the edit pane
          const newEditWidth = Math.min(Math.max(startEditWidth - delta, 200), totalWidth - 200);
          editPane.style.flex = `0 0 ${newEditWidth}px`;
          const editPct = Math.round((newEditWidth / totalWidth) * 100);
          if (editPctEl)    editPctEl.textContent    = editPct + '%';
          if (previewPctEl) previewPctEl.textContent = (100 - editPct) + '%';
        }
      };

      const onUp = () => {
        if (iframe) iframe.style.pointerEvents = '';
        document.body.style.cursor    = '';
        document.body.style.userSelect = '';
        divider.classList.remove('scr-viewer__divider--dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',  onUp);
      };

      divider.classList.add('scr-viewer__divider--dragging');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',  onUp);
    });

    const sunIcon  = `<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.3"/><path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1M12.7 12.7l-1.1-1.1M4.4 4.4L3.3 3.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
    const moonIcon = `<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M13.5 9.7A5.5 5.5 0 016.3 2.5a5.5 5.5 0 107.2 7.2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
    const themeToggleBtn = main.querySelector('#scrThemeToggle');

    const applyThemeBtn = () => {
      const isDark = this._previewTheme === 'dark';
      themeToggleBtn.innerHTML = isDark ? sunIcon : moonIcon;
      themeToggleBtn.title     = isDark ? 'Switch to light preview' : 'Preview dark theme';
    };
    applyThemeBtn();
    this._applyPreviewTheme();
    themeToggleBtn.addEventListener('click', () => {
      this._previewTheme = this._previewTheme === 'dark' ? 'light' : 'dark';
      applyThemeBtn();
      this._applyPreviewTheme();
    });

    const VIEWPORT_KEY  = 'mockups_preview_mode';
    const mobileIcon   = `<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="4.5" y="1" width="7" height="14" rx="1.5" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="12.5" r=".7" fill="currentColor"/></svg>`;
    const desktopIcon  = `<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5 14h6M8 12v2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
    const viewportBtn  = main.querySelector('#scrViewportToggle');
    const previewPane  = main.querySelector('#scrPreviewPane');

    const applyViewport = (mode) => {
      localStorage.setItem(VIEWPORT_KEY, mode);
      if (mode === 'mobile') {
        previewPane.style.flex = '0 0 500px';
        editPane.style.flex    = '1 1 0';
        viewportBtn.innerHTML  = mobileIcon;
        viewportBtn.title      = 'Switch to desktop preview (M)';
      } else {
        previewPane.style.flex = '';
        editPane.style.flex    = '0 0 25%';
        viewportBtn.innerHTML  = desktopIcon;
        viewportBtn.title      = 'Switch to mobile preview (M)';
      }
      requestAnimationFrame(updatePct);
    };

    applyViewport(localStorage.getItem(VIEWPORT_KEY) || 'desktop');
    viewportBtn.addEventListener('click', () => {
      applyViewport((localStorage.getItem(VIEWPORT_KEY) || 'desktop') === 'mobile' ? 'desktop' : 'mobile');
    });

    main.querySelector('#scrEditDetailsBtn').addEventListener('click', () => this._showEditScreenModal(screen));

    const split          = main.querySelector('#scrSplit');
    const editPanel      = main.querySelector('#scrEditPanel');

    // Always show preview/chat split; hide legacy edit panel
    split.hidden     = false;
    editPanel.hidden = true;

    // Edit panel — description textarea + save
    const viewerDescTextarea = main.querySelector('#scrViewerDescTextarea');
    viewerDescTextarea.value = screen.description || '';
    const viewerSaveBtn = main.querySelector('#scrViewerSaveBtn');

    const VIEWER_SAVE_DEFAULT = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      Save`;

    const doViewerDescSave = async () => {
      if (viewerSaveBtn.disabled) return;
      viewerSaveBtn.disabled = true;
      viewerSaveBtn.innerHTML = `<span class="scr-save-spinner"></span> Saving…`;
      try {
        const desc = viewerDescTextarea.value.trim();
        await window.db.screenDesigns.update({ id: screen.id, description: desc });
        screen.description = desc;
        this._refreshSidebar();
        viewerSaveBtn.textContent = '✓ Saved';
        setTimeout(() => {
          viewerSaveBtn.innerHTML = VIEWER_SAVE_DEFAULT;
          viewerSaveBtn.disabled = false;
        }, 1000);
      } catch {
        viewerSaveBtn.innerHTML = VIEWER_SAVE_DEFAULT;
        viewerSaveBtn.disabled = false;
      }
    };

    viewerSaveBtn.addEventListener('click', doViewerDescSave);

    main.querySelector('#scrEditPanelDeleteBtn').addEventListener('click', () => {
      this._showDeleteConfirmDialog(screen, async () => {
        await window.db.screenDesigns.delete(screen.id);
        this._screens  = await window.db.screenDesigns.list(this._projectId);
        this._activeId = this._screens[0]?.id ?? null;
        this._refreshSidebar();
        if (this._activeId) this._selectScreen(this._activeId);
        else                this._showEmptyState();
      });
    });

    if (this._ctrlSHandler) document.removeEventListener('keydown', this._ctrlSHandler);
    this._ctrlSHandler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        const ep = main.querySelector('#scrEditPanel');
        if (ep && !ep.hidden) { e.preventDefault(); doViewerDescSave(); }
      }
    };
    document.addEventListener('keydown', this._ctrlSHandler);

    main.querySelector('#scrRefreshBtn').addEventListener('click', async () => {
      const title       = screen.title;
      const safeTitle   = title.replace(/[^a-z0-9_\-]/gi, '_');
      const projectName = this._project?.name;
      const safeProject = (projectName || '').replace(/[^a-z0-9_\-]/gi, '_');
      const rootDir     = await window.app.screensDir();
      const screensDir  = safeProject ? `${rootDir}\\${safeProject}` : rootDir;
      const filePath    = `${screensDir}\\${safeTitle}.html`;

      const [fileContent, fileStat, fresh] = await Promise.all([
        window.shell.readFile(filePath),
        window.shell.statFile(filePath),
        window.db.screenDesigns.get(screen.id),
      ]);

      if (!fileContent) {
        if (fresh) {
          screen.html_content = fresh.html_content;
          this._loadPreview(fresh.html_content);
        }
        return;
      }

      // SQLite datetime('now') is UTC but lacks 'Z' — append it so Date parses correctly
      const dbUpdatedAt = fresh?.updated_at ? new Date(fresh.updated_at.replace(' ', 'T') + 'Z').getTime() : 0;
      const fileIsOlder = fileStat && fileStat.mtimeMs < dbUpdatedAt;

      const doRefresh = () => {
        const noted = ensureNavNoteComment(fileContent);
        window.db.screenDesigns.update({ id: screen.id, html_content: noted });
        screen.html_content = noted;
        this._loadPreview(noted);
      };

      if (fileIsOlder) {
        this._showConfirmDialog(
          'File is older than current version',
          'The file on disk was last modified before the latest database change. Overwriting will lose unsaved edits.',
          'Overwrite anyway',
          doRefresh
        );
      } else {
        doRefresh();
      }
    });

    // Actions dropdown toggle
    main.querySelector('#scrExportHtmlBtn').addEventListener('click', async () => {
      const fresh = await window.db.screenDesigns.get(screen.id);
      const html  = fresh?.html_content || screen.html_content || '';
      if (!html) {
        await Dialog.alert('No HTML content to export. Generate a mockup first.');
        return;
      }

      const folderPath = await window.db.dialog.openFolder();
      if (!folderPath) return;

      const safeTitle  = screen.title.replace(/[^a-z0-9_\-]/gi, '_');
      const fileName   = `${safeTitle}.html`;
      const filePath   = `${folderPath}\\${fileName}`;
      const existing = await window.shell.readFile(filePath);
      if (existing) {
        this._showOverwriteConfirmDialog(fileName, async () => {
          await window.shell.writeFile(filePath, html);
        });
      } else {
        await window.shell.writeFile(filePath, html);
        this._showExportSuccessModal(fileName);
      }
    });

    main.querySelector('#scrChooseFileBtn').addEventListener('click', async () => {
      const result = await window.db.dialog.openFile({
        title:      'Choose Generated Screen File',
        extensions: ['html', 'htm', 'dart', 'js', 'jsx', 'tsx', '*'],
      });
      if (!result) return;

      const content = ensureNavNoteComment(result.content);
      await window.db.screenDesigns.update({ id: screen.id, html_content: content });
      screen.html_content = content;
      this._loadPreview(content);
    });

    main.querySelector('#scrOpenWindowBtn')?.addEventListener('click', () => {
      window.app.openMockupPreview({ title: screen.title, htmlContent: screen.html_content });
    });

    main.querySelector('#scrDeleteBtn').addEventListener('click', () => {
      this._showDeleteConfirmDialog(screen, async () => {
        await window.db.screenDesigns.delete(screen.id);
        this._screens  = await window.db.screenDesigns.list(this._projectId);
        this._activeId = this._screens[0]?.id ?? null;
        this._refreshSidebar();
        if (this._activeId) this._selectScreen(this._activeId);
        else                this._showEmptyState();
      });
    });

    // Viewer keyboard shortcuts — skip when focus is in an input/textarea
    const viewerKeyHandler = (e) => {
      if (e.target.matches('input, textarea, select, [contenteditable]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        main.querySelector('#scrEditDetailsBtn')?.click();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        main.querySelector('#scrViewportToggle')?.click();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        main.querySelector('#scrRefreshBtn')?.click();
      }
    };
    document.addEventListener('keydown', viewerKeyHandler);
    // Clean up when this viewer is replaced
    const observer = new MutationObserver(() => {
      if (!document.contains(main)) {
        document.removeEventListener('keydown', viewerKeyHandler);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    this._loadInitialHistory(screen.id, main);
  }
}
