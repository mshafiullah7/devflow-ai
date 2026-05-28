import { escHtml, injectCss, removeCss, timeAgo, renderMarkdown } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelPicker }       from '../../components/model-picker/model-picker.js';
import { GitController } from '../../components/git/git-controller.js';

const TECH = 'Plain HTML / CSS';

function buildScreenPrompt(description, projectDescription, outputFile, designTemplate) {
  const ctx    = projectDescription ? `\nProject context: ${projectDescription}` : '';
  const save   = outputFile
    ? `\nWhen done, save the complete output to: ${outputFile}`
    : `\nDo NOT use any tools, write any files, or save anything — print the raw HTML directly to stdout.`;
  const design = designTemplate
    ? `\n\nDESIGN SYSTEM — you MUST follow this for every element (colours, fonts, spacing, components):\n${designTemplate}`
    : '';

  return `You are an expert UI/UX developer. Generate a complete, self-contained HTML file for the screen described below using ${TECH}.
Rules:
- Output ONLY valid HTML starting with <!DOCTYPE html>
- All CSS goes inside a <style> tag; CDN links (e.g. Tailwind CDN) are allowed
- Visually polished, modern design with realistic placeholder content
- Fully responsive
- No explanation, no markdown — raw HTML only
- REQUIRED: Include a light/dark theme toggle button fixed in the top-right corner (position:fixed; top:1rem; right:1rem; z-index:9999). The button must toggle a "dark" class on <html> or <body> and switch all colours accordingly using CSS variables or a [data-theme] attribute. Default to light theme. The toggle must work standalone with no external dependencies.${ctx}${design}${save}

Screen to design:
${description}`;
}

function buildExtractPrompt(screenTitle, htmlFilePath, outputFile) {
  const save = outputFile ? `\nWhen done, write the complete JSON array to: ${outputFile}` : '';
  return `You are an expert product manager and UI developer. Analyze the ${TECH} UI screen design provided below and extract user stories.

Screen: ${screenTitle}
Tech stack: ${TECH}

Screen content at: ${htmlFilePath}
${save}
Extract every distinct user action, form, state, or interaction visible in this screen as a separate user story.

IMPORTANT: Output ONLY a raw JSON array — no markdown fences, no explanation, no extra text. Start with [ and end with ].

Each object MUST use EXACTLY these five field names — no other field names are accepted:
- title: short action-oriented title (string)
- description: As a user, I want to [action] so that [benefit]. (string)
- acceptance_criteria: all criteria as ONE string, each criterion on its own line starting with -  (string, NOT an array)
- prompt: detailed implementation prompt referencing exact design details from the UI — colours, typography, spacing, layout, component styles. Do NOT include E2E test generation here. (string)
- e2e_tests: ONE string containing the prompt to generate the Playwright/Cypress E2E test file for this user story interaction. All test names must be prefixed with US-{{US_ID}}. Empty string "" for non-UI stories. (string)`;
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

function buildExtractPsCommand(instruction, model) {
  const exe       = model.executable || 'claude';
  const flags     = model.flags ? ` ${model.flags}` : '';
  const modelFlag = model.model_name ? ` --model ${model.model_name}` : '';
  const safeInst  = instruction.replace(/'/g, "''");
  return `$p = @'\n${safeInst}\n'@\n${exe}${flags}${modelFlag} $p`;
}

function buildPsCommand(prompt, model) {
  const exe       = model.executable || 'claude';
  const flags     = model.flags ? ` ${model.flags}` : '';
  const modelFlag = model.model_name ? ` --model ${model.model_name}` : '';
  const safe      = prompt.replace(/'/g, "''");
  return `$p = @'\n${safe}\n'@\n${exe}${flags}${modelFlag} $p`;
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
  }

  async mount() {
    injectCss('styles/screens.css');
    injectCss('pages/mockups/mockups-page.css');
    applyStoredTheme();

    let _mapping;
    [this._project, this._screens, this._modelConfigs, _mapping] = await Promise.all([
      window.db.projects.get(this._projectId),
      window.db.screenDesigns.list(this._projectId),
      window.db.modelConfigs.list(),
      window.db.modelMapping.get('mockups'),
    ]);
    const _mappedId = _mapping?.model_config_id ?? null;

    this._designTemplate = this._project?.design_template || '';
    this._activeTab      = 'preview';



    this._git = new GitController({
      getTermCwd: () => this._project?.project_path || '',
      gitBtnId:   'mockupsBtnGit',
      gitBadgeId: 'mockupsGitBadge',
    });
    this._git.mount();

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
        this._updateMockupBtns?.();
      },
      initialId: _mappedId,
    });
    this._bindShellEvents();
    await this._picker.reload();

    if (this._project?.project_path) {
      this._setHeaderFolderPath(this._project.project_path);
      this._git.refreshStatus();
      this._git.startPoll();
    }

    if (this._activeId) this._selectScreen(this._activeId);
    else                this._showEmptyState();
  }

  unmount() {
    removeCss('pages/mockups/mockups-page.css');
    removeCss('styles/screens.css');
    this._picker?.unmount();
    this._git?.stopPoll();
    window.app.chat.offAll();
    window.app.chat.cancel();
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
    const name = this._project?.name ?? 'Project';
    return `
      <div class="mockups-page">
        <header class="mockups-page__header">
          <button class="mockups-page__back" id="btnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div class="mockups-page__title-group">
            <div class="mockups-page__title">${escHtml(name)}</div>
            <div class="mockups-page__subtitle">Project Mockups</div>
          </div>
          <div class="project-page__folder-display" id="headerFolderDisplay" title="Select folder">
            <div class="project-page__folder-pill">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                  stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              </svg>
              <span class="project-page__folder-text" id="headerFolderText">Select folder</span>
            </div>
          </div>
          <div class="project-page__model-group" style="-webkit-app-region:no-drag;">
            <div id="mockupsModelPicker"></div>
            <button class="project-page__model-cfg-btn" id="mockupsBtnModelConfigs" title="Configure AI models">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <button class="project-page__git-btn" id="mockupsBtnGit" title="Git changes" style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
              <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span class="project-page__git-badge" id="mockupsGitBadge" hidden></span>
          </button>
          <button class="mockups-page__style-btn scr-btn scr-btn--sm${this._hasAnyTemplate() ? ' scr-btn--ds-active' : ''}" id="scrStyleGuideBtn" title="Open Project Style Guide page">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/>
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            Styles
            <span class="scr-style-dot${this._hasAnyTemplate() ? ' scr-style-dot--active' : ''}"></span>
          </button>
        </header>

        <div class="mockups-page__body">
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
    return this._screens.map(s => {
      const canQueue = !s.executed && s.description;
      const isQueued = !!s.queued;
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
          ${canQueue ? `
            <button class="scr-sidebar__queue-btn${isQueued ? ' scr-sidebar__queue-btn--active' : ''}"
              data-queue-id="${s.id}" data-queued="${isQueued ? '1' : '0'}"
              title="${isQueued ? 'Remove from queue' : 'Add to queue'}">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M2 8h9M2 12h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              </svg>
            </button>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  _refreshSidebar() {
    const list = this.container.querySelector('#scrList');
    if (list) list.innerHTML = this._renderList();
    this._bindSidebarItems();
  }

  _bindSidebarItems() {
    this.container.querySelectorAll('.scr-sidebar__item').forEach(el => {
      el.addEventListener('click', () => this._selectScreen(Number(el.dataset.id)));
    });

    this.container.querySelectorAll('.scr-sidebar__queue-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id       = Number(btn.dataset.queueId);
        const queued   = btn.dataset.queued === '1' ? 0 : 1;
        await window.db.screenDesigns.update({ id, queued });
        const screen = this._screens.find(s => s.id === id);
        if (screen) screen.queued = queued;
        btn.dataset.queued = queued;
        btn.title = queued ? 'Remove from queue' : 'Add to queue';
        btn.classList.toggle('scr-sidebar__queue-btn--active', !!queued);
        // Refresh badges and re-render any open queue panel
        const all = await window.db.screenDesigns.list(this._projectId);
        const remaining = all.filter(s => s.queued && s.is_active !== 0).length;

        const viewerBadge = this.container.querySelector('#scrQueueCount');
        if (viewerBadge) {
          viewerBadge.textContent = remaining;
          this.container.querySelector('#scrQueueBtn')
            ?.classList.toggle('scr-queue-btn--has-items', remaining > 0);
        }
        const descBadge = this.container.querySelector('#scrDescQueueCount');
        if (descBadge) {
          descBadge.textContent = remaining;
          this.container.querySelector('#scrDescQueueBtn')
            ?.classList.toggle('scr-queue-btn--has-items', remaining > 0);
        }

        // Re-render whichever queue panel is currently open
        const viewerPanel = this.container.querySelector('#scrQueuePanel');
        if (viewerPanel && !viewerPanel.hidden) this._renderQueuePanel(viewerPanel);
        const descPanel = this.container.querySelector('#scrDescQueuePanel');
        if (descPanel && !descPanel.hidden) this._renderQueuePanel(descPanel);
      });
    });
  }

  async _reloadModelDropdown() {
    if (this._picker) await this._picker.reload();
  }

  _setHeaderFolderPath(folderPath) {
    const text    = this.container.querySelector('#headerFolderText');
    const display = this.container.querySelector('#headerFolderDisplay');
    if (!text || !display) return;
    text.textContent = folderPath;
    display.classList.add('project-page__folder-display--active');
  }

  _bindShellEvents() {
    this.container.querySelector('#btnBack')
      .addEventListener('click', () => this._goBack());

    this.container.querySelector('#scrNewBtn')
      .addEventListener('click', () => this._showNewScreenModal());

    this.container.querySelector('#scrStyleGuideBtn')
      .addEventListener('click', () => {
        this.router.navigate('style-guide', { projectId: this._projectId, from: 'mockups' });
      });

    this.container.querySelector('#mockupsBtnModelConfigs')
      .addEventListener('click', () => this.router.navigate('settings', { from: 'mockups', fromParams: { projectId: this._projectId } }));


    this.container.querySelector('#headerFolderDisplay')
      .addEventListener('click', async () => {
        const folderPath = await window.db.dialog.openFolder();
        if (!folderPath) return;
        await window.db.projects.setPath({ id: this._projectId, project_path: folderPath });
        if (this._project) this._project.project_path = folderPath;
        this._setHeaderFolderPath(folderPath);
        this._git.refreshStatus();
        this._git.startPoll();
      });

    this.container.querySelector('#mockupsBtnGit')
      .addEventListener('click', () =>
        this.router.navigate('git-changes', { projectId: this._projectId, from: 'mockups' }));

    this._bindSidebarItems();
  }

  _updateMockupBtns() {
    const model = this._getSelectedModel();
    const isCli = model?.type === 'cli';
    const runBtn  = this.container.querySelector('#scrRunBtn');
    const editBtn = this.container.querySelector('#scrEditBtn');
    if (runBtn)  runBtn.hidden = !isCli;
    if (editBtn) editBtn.hidden = !isCli;
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
    const dlg = document.createElement('div');
    dlg.className = 'scr-overlay';
    dlg.innerHTML = `
      <div class="scr-ns-dialog scr-ns-dialog--compact">
        <div class="scr-ns-dialog__header">
          <span class="scr-ns-dialog__title">New Screen</span>
          <button class="scr-dialog__close" id="scrNsClose">&times;</button>
        </div>
        <div class="scr-ns-dialog__body">
          <div class="scr-form__row">
            <label class="scr-form__label">Title *</label>
            <input class="scr-form__input" id="scrNsTitle" type="text"
              placeholder="e.g. Login Screen, Dashboard, Product List…" autocomplete="off"/>
          </div>
        </div>
        <div class="scr-ns-dialog__footer">
          <button class="scr-btn scr-btn--secondary" id="scrNsCancel">Cancel</button>
          <button class="scr-btn scr-btn--primary" id="scrNsSave" title="Save (Enter)">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(dlg);
    dlg.querySelector('#scrNsTitle').focus();

    const close = () => dlg.remove();
    dlg.querySelector('#scrNsClose').addEventListener('click', close);
    dlg.querySelector('#scrNsCancel').addEventListener('click', close);

    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        dlg.querySelector('#scrNsSave')?.click();
      }
      if (e.key === 'Escape') close();
    });

    dlg.querySelector('#scrNsSave').addEventListener('click', async () => {
      const title = dlg.querySelector('#scrNsTitle').value.trim();
      if (!title) { dlg.querySelector('#scrNsTitle').focus(); return; }

      const screen = await window.db.screenDesigns.create({
        project_id:   this._projectId,
        title,
        tech_stack:   'html',
        html_content: '',
      });

      close();
      this._screens  = await window.db.screenDesigns.list(this._projectId);
      this._activeId = screen.id;
      this._refreshSidebar();
      this._showDescriptionEditor(screen);
    });
  }

  _runChatGeneration(screen, chatInput, main) {
    const desc = chatInput.value.trim();
    if (!desc) { chatInput.focus(); return; }

    const model = this._getSelectedModel();
    if (!model) { alert('No model selected.'); return; }

    chatInput.value = '';
    chatInput.style.height = 'auto';

    const project = this._getProject();
    const hasHtml = !!screen.html_content;

    // For edit: pass structured payload so main process can write HTML to temp file (CLI)
    // or embed inline (API/Ollama). For create: full prompt string as before.
    let generateArg;
    let previewText;

    if (hasHtml) {
      const isCli = !model.type || model.type === 'cli';
      generateArg = {
        editPayload: {
          instruction:        desc,
          htmlContent:        screen.html_content,
          projectDescription: project?.description || '',
        },
        model,
      };
      if (isCli) {
        previewText = `[Edit via temp file — HTML will be written to a temp file on disk]\n\nInstruction:\n${desc}\n\nExisting HTML: ${screen.html_content.length} chars (passed via temp file)`;
      } else {
        // For API/Ollama show the inline prompt for transparency
        previewText = buildEditPromptInline(desc, screen.html_content, project?.description || '');
      }
    } else {
      const prompt = buildScreenPrompt(desc, project?.description || '', '', this._getDesignTemplateForPrompt());
      generateArg  = { prompt, model };
      previewText  = prompt;
    }

    const messagesEl = main.querySelector('#scrChatMessages');
    messagesEl.querySelector('.scr-chat-empty')?.remove();
    messagesEl.querySelector('.scr-chat-history-group--initial')?.remove();

    // User bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'scr-chat-msg scr-chat-msg--user';
    userBubble.innerHTML = `<div class="scr-chat-msg__text">${escHtml(desc)}</div>`;
    messagesEl.appendChild(userBubble);

    // Prompt preview bubble
    const previewBubble = document.createElement('div');
    previewBubble.className = 'scr-chat-msg scr-chat-msg--assistant';
    previewBubble.innerHTML = `
      <div class="scr-chat-prompt-bubble">
        <div class="scr-chat-prompt-bubble__header">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
            <path d="M4 6h5M4 9h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          <span>${hasHtml ? 'Edit Prompt' : 'Create Prompt'}</span>
        </div>
        <pre class="scr-chat-prompt-bubble__pre">${escHtml(previewText)}</pre>
        <div class="scr-chat-prompt-bubble__actions">
          <button class="scr-chat-approve-btn">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.3"/>
              <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Run
          </button>
          <button class="scr-chat-dismiss-btn">Dismiss</button>
        </div>
      </div>
    `;
    messagesEl.appendChild(previewBubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    previewBubble.querySelector('.scr-chat-dismiss-btn').addEventListener('click', () => previewBubble.remove());

    previewBubble.querySelector('.scr-chat-approve-btn').addEventListener('click', () => {
      this._saveToHistory(desc);
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
      messagesEl.scrollTop = messagesEl.scrollHeight;

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

      window.app.chat.onDone(async ({ html, raw, error }) => {
        clearInterval(genTimer);
        window.app.chat.offAll();
        const rawText    = raw || '';
        const previousHtml = screen.html_content;  // capture before overwrite

        if (html && !error) {
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
        previewBubble.innerHTML = `<div class="scr-chat-msg__cancelled">Cancelled</div>`;
      });

      window.app.chat.generate(generateArg);
    });
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
      <div class="scr-ns-dialog scr-ns-dialog--compact">
        <div class="scr-ns-dialog__header">
          <span class="scr-ns-dialog__title">Edit Screen</span>
          <button class="scr-dialog__close" id="scrEditClose">&times;</button>
        </div>
        <div class="scr-ns-dialog__body">
          <div class="scr-form__row">
            <label class="scr-form__label">Title *</label>
            <input class="scr-form__input" id="scrEditTitle" type="text"
              value="${escHtml(screen.title)}" autocomplete="off"/>
          </div>
        </div>
        <div class="scr-ns-dialog__footer">
          <button class="scr-btn scr-btn--secondary" id="scrEditCancel">Cancel</button>
          <button class="scr-btn scr-btn--primary" id="scrEditSave" title="Save (Enter)">Save</button>
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

      await window.db.screenDesigns.update({ id: screen.id, title });
      screen.title = title;

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
      if (e.key === 'Enter' && !e.shiftKey) {
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

  async _runInTerminal() {
    const main  = this.container.querySelector('#scrMain');
    const title = main.querySelector('#scrTitle').value.trim();
    const desc  = main.querySelector('#scrDescription').value.trim();
    if (!title) { main.querySelector('#scrTitle').focus(); return; }
    if (!desc)  { main.querySelector('#scrDescription').focus(); return; }

    const model = this._getSelectedModel();
    if (!model || model.type === 'anthropic' || !model.executable) {
      alert('Please select a CLI model (Claude CLI or Gemini CLI) from the model dropdown.');
      return;
    }

    await this._saveForm();
    this._screens = await window.db.screenDesigns.list(this._projectId);
    this._refreshSidebar();

    const project    = this._getProject();
    const screensDir = await window.app.screensDir(project?.name);
    const safeTitle  = title.replace(/[^a-z0-9_\-]/gi, '_');
    const outputFile = `${screensDir}\\${safeTitle}.html`;
    const prompt     = buildScreenPrompt(desc, project?.description || '', outputFile, this._getDesignTemplateForPrompt());
    const cmd        = buildPsCommand(prompt, model);

    this._showPromptPreviewModal(prompt, async () => {
      await window.db.terminal.openExternal({ command: cmd, cwd: screensDir });
      await this._saveToHistory(desc);
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

  // ----------------------------------------------------------------
  // Description editor (shown when screen.executed === 0)
  // ----------------------------------------------------------------
  _showDescriptionEditor(screen) {
    const main = this.container.querySelector('#scrMain');
    main.innerHTML = `
      <div class="scr-desc-editor">
        <div class="scr-desc-editor__toolbar">
          <div class="scr-viewer__meta">
            <span class="scr-viewer__title">${escHtml(screen.title)}</span>
            <span class="scr-viewer__tech-badge">${TECH}</span>
            <button class="scr-btn scr-btn--sm" id="scrDescEditDetailsBtn" title="Rename screen">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
          <div class="scr-desc-editor__tabs">
            <button class="scr-desc-tab-btn scr-desc-tab-btn--active" id="scrDescTabEdit">Edit</button>
            <button class="scr-desc-tab-btn" id="scrDescTabPreview">Preview</button>
          </div>
          <button class="scr-btn scr-btn--sm scr-btn--secondary scr-queue-btn" id="scrDescQueueBtn" title="Generation queue">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M2 8h9M2 12h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            Queue
            <span class="scr-queue-btn__badge" id="scrDescQueueCount">…</span>
          </button>
        </div>
        <div class="scr-viewer__queue-panel" id="scrDescQueuePanel" hidden></div>
        <div class="scr-desc-editor__body" id="scrDescEditorBody">
          <textarea class="scr-desc-editor__textarea" id="scrDescTextarea" placeholder="Describe this screen… (supports Markdown)">${escHtml(screen.description || '')}</textarea>
          <div class="scr-desc-editor__preview scr-md-preview" id="scrDescPreview" hidden></div>
        </div>
        <div class="scr-desc-editor__footer">
          <button class="scr-btn scr-btn--sm scr-btn--danger" id="scrDescDeleteBtn">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Delete
          </button>
          <button class="scr-btn scr-btn--primary" id="scrDescSaveBtn">Save Description</button>
        </div>
      </div>
    `;

    const textarea  = main.querySelector('#scrDescTextarea');
    const preview   = main.querySelector('#scrDescPreview');
    const tabEdit   = main.querySelector('#scrDescTabEdit');
    const tabPrev   = main.querySelector('#scrDescTabPreview');

    const showTab = (mode) => {
      const isEdit = mode === 'edit';
      textarea.hidden = !isEdit;
      preview.hidden  = isEdit;
      tabEdit.classList.toggle('scr-desc-tab-btn--active', isEdit);
      tabPrev.classList.toggle('scr-desc-tab-btn--active', !isEdit);
      if (!isEdit) {
        const text = textarea.value.trim();
        preview.innerHTML = text
          ? renderMarkdown(text)
          : '<p class="scr-md-preview__empty">Nothing to preview yet.</p>';
      }
    };

    tabEdit.addEventListener('click', () => showTab('edit'));
    tabPrev.addEventListener('click', () => showTab('preview'));

    main.querySelector('#scrDescSaveBtn').addEventListener('click', async () => {
      const desc = textarea.value.trim();
      await window.db.screenDesigns.update({ id: screen.id, description: desc });
      screen.description = desc;
      this._refreshSidebar();
    });

    main.querySelector('#scrDescDeleteBtn').addEventListener('click', () => {
      this._showDeleteConfirmDialog(screen, async () => {
        await window.db.screenDesigns.delete(screen.id);
        this._screens = await window.db.screenDesigns.list(this._projectId);
        this._activeId = null;
        this._refreshSidebar();
        if (this._screens.length > 0) {
          this._selectScreen(this._screens[0].id);
        } else {
          this._showEmptyState();
        }
      });
    });

    main.querySelector('#scrDescEditDetailsBtn').addEventListener('click', () => {
      this._showEditScreenModal(screen);
    });

    const queueBtn      = main.querySelector('#scrDescQueueBtn');
    const queueCountEl  = main.querySelector('#scrDescQueueCount');
    const queuePanel    = main.querySelector('#scrDescQueuePanel');
    const editorBody    = main.querySelector('#scrDescEditorBody');
    const footer        = main.querySelector('.scr-desc-editor__footer');
    const tabsEl        = main.querySelector('.scr-desc-editor__tabs');

    const refreshDescQueueCount = async () => {
      const all = await window.db.screenDesigns.list(this._projectId);
      const remaining = all.filter(s => s.queued && s.is_active !== 0).length;
      queueCountEl.textContent = remaining;
      queueBtn.classList.toggle('scr-queue-btn--has-items', remaining > 0);
    };
    refreshDescQueueCount();

    let queueOpen = false;
    queueBtn.addEventListener('click', () => {
      queueOpen = !queueOpen;
      queueBtn.classList.toggle('scr-queue-btn--active', queueOpen);
      queuePanel.hidden  = !queueOpen;
      editorBody.hidden  = queueOpen;
      footer.hidden      = queueOpen;
      tabsEl.hidden      = queueOpen;
      if (queueOpen) this._renderQueuePanel(queuePanel).then(refreshDescQueueCount);
    });
  }

  // ----------------------------------------------------------------
  // Queue panel
  // ----------------------------------------------------------------
  async _renderQueuePanel(panel) {
    const allScreens = await window.db.screenDesigns.list(this._projectId);
    const queued     = allScreens.filter(s => s.queued && s.is_active !== 0);

    panel.innerHTML = `
      <div class="scr-queue-panel">
        <div class="scr-queue-panel__header">
          <span class="scr-queue-panel__title">Queue</span>
          <span class="scr-queue-panel__count">${queued.length} screen${queued.length !== 1 ? 's' : ''}</span>
          <div style="flex:1"></div>
          <button class="scr-btn scr-btn--sm scr-btn--danger" id="scrQueueStopBtn" hidden>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor"/>
            </svg>
            Stop
          </button>
          <button class="scr-btn scr-btn--sm scr-btn--secondary" id="scrQueueClearBtn" hidden>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <path d="M4 8h8M8 4l4 4-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Clear completed
          </button>
          <button class="scr-btn scr-btn--primary scr-btn--sm" id="scrQueueRunBtn" ${queued.length === 0 ? 'disabled' : ''}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <path d="M4 3l9 5-9 5V3z" fill="currentColor"/>
            </svg>
            Run All
          </button>
        </div>
        <div class="scr-queue-panel__list" id="scrQueueList">
          ${queued.length === 0
            ? '<p class="scr-queue-panel__empty">No screens are queued. Set <strong>queued = 1</strong> on screens to add them here.</p>'
            : queued.map(s => `
              <div class="scr-queue-item" data-id="${s.id}">
                <div class="scr-queue-item__row">
                  <svg class="scr-queue-item__icon" width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
                  </svg>
                  <span class="scr-queue-item__title">${escHtml(s.title)}</span>
                  ${s.description ? '' : '<span class="scr-queue-item__no-desc" title="No description — will be skipped">No description</span>'}
                  ${s.description ? `<button class="scr-queue-item__prompt-btn" data-prompt-id="${s.id}" title="Show prompt">
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
                      <path d="M8 7v4M8 5.5v.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                    </svg>
                  </button>` : ''}
                  <span class="scr-queue-item__status scr-queue-item__status--pending" id="scrQueueStatus-${s.id}">Pending</span>
                </div>
                ${s.description ? `<pre class="scr-queue-item__prompt-pre" id="scrQueuePrompt-${s.id}" hidden></pre>` : ''}
              </div>
            `).join('')}
        </div>
      </div>
    `;

    if (queued.length === 0) return;

    const runBtn   = panel.querySelector('#scrQueueRunBtn');
    const stopBtn  = panel.querySelector('#scrQueueStopBtn');
    const clearBtn = panel.querySelector('#scrQueueClearBtn');

    const refreshBadges = async () => {
      const all = await window.db.screenDesigns.list(this._projectId);
      const remaining = all.filter(s => s.queued && s.is_active !== 0).length;
      const badge = this.container.querySelector('#scrQueueCount');
      if (badge) badge.textContent = remaining;
      const qBtn = this.container.querySelector('#scrQueueBtn');
      if (qBtn) qBtn.classList.toggle('scr-queue-btn--has-items', remaining > 0);
      const descBadge = this.container.querySelector('#scrDescQueueCount');
      if (descBadge) descBadge.textContent = remaining;
      const descQBtn = this.container.querySelector('#scrDescQueueBtn');
      if (descQBtn) descQBtn.classList.toggle('scr-queue-btn--has-items', remaining > 0);
    };

    runBtn.addEventListener('click', () => {
      runBtn.hidden  = true;
      stopBtn.hidden = false;
      this._runQueue(queued, panel, () => {
        runBtn.hidden  = false;
        stopBtn.hidden = true;
        clearBtn.hidden = false;
        refreshBadges();
      });
    });

    stopBtn.addEventListener('click', () => {
      this._queueStopped = true;
      window.app.chat.cancel();
      window.app.chat.offAll();
      stopBtn.hidden  = true;
      runBtn.hidden   = false;
      clearBtn.hidden = false;
    });

    clearBtn.addEventListener('click', async () => {
      // Re-render panel — done items already have queued=0 in DB so they disappear naturally
      await this._renderQueuePanel(panel);
      this._refreshSidebar();
      refreshBadges();
    });

    // Prompt preview toggles
    panel.querySelectorAll('.scr-queue-item__prompt-btn').forEach(btn => {
      const id      = Number(btn.dataset.promptId);
      const screen  = queued.find(s => s.id === id);
      const pre     = panel.querySelector(`#scrQueuePrompt-${id}`);
      if (!screen || !pre) return;
      btn.addEventListener('click', () => {
        const open = !pre.hidden;
        if (open) {
          pre.hidden = true;
          btn.classList.remove('scr-queue-item__prompt-btn--active');
        } else {
          if (!pre.dataset.built) {
            pre.textContent = buildScreenPrompt(
              screen.description,
              this._project?.description || '',
              '',
              this._getDesignTemplateForPrompt()
            );
            pre.dataset.built = '1';
          }
          pre.hidden = false;
          btn.classList.add('scr-queue-item__prompt-btn--active');
        }
      });
    });
  }

  _tgNotify(text) {
    window.app.telegram.send(text).catch(() => {});
  }

  async _runQueue(screens, panel, onFinish) {
    this._queueStopped = false;
    const model = this._getSelectedModel();
    if (!model) { alert('No model selected.'); onFinish(); return; }

    const projectName = this._project?.name || 'project';
    let doneCount  = 0;
    let errorCount = 0;

    for (const screen of screens) {
      if (this._queueStopped) break;

      const statusEl = panel.querySelector(`#scrQueueStatus-${screen.id}`);
      if (!screen.description) {
        if (statusEl) {
          statusEl.textContent = 'Skipped';
          statusEl.className   = 'scr-queue-item__status scr-queue-item__status--skipped';
        }
        continue;
      }

      if (statusEl) {
        statusEl.textContent = 'Running…';
        statusEl.className   = 'scr-queue-item__status scr-queue-item__status--running';
      }

      const prompt = buildScreenPrompt(
        screen.description,
        this._project?.description || '',
        '',
        this._getDesignTemplateForPrompt()
      );

      const result = await new Promise(resolve => {
        window.app.chat.offAll();
        window.app.chat.onDone(resolve);
        window.app.chat.generate({ prompt, model });
      });

      if (this._queueStopped) break;

      if (result.html && !result.error) {
        await window.db.screenDesigns.update({
          id:           screen.id,
          html_content: result.html,
          executed:     1,
          queued:       0,
        });
        screen.html_content = result.html;
        screen.executed     = 1;
        screen.queued       = 0;
        doneCount++;
        if (statusEl) {
          statusEl.textContent = 'Done';
          statusEl.className   = 'scr-queue-item__status scr-queue-item__status--done';
        }
        this._tgNotify(`✅ *${screen.title}* generated successfully\n_Project: ${projectName}_`);
      } else {
        errorCount++;
        const errMsg = result.error || 'Unknown error';
        if (statusEl) {
          statusEl.textContent = errMsg;
          statusEl.className   = 'scr-queue-item__status scr-queue-item__status--error';
        }
        this._tgNotify(`❌ *${screen.title}* failed\n\`${errMsg}\`\n_Project: ${projectName}_`);
      }
    }

    window.app.chat.offAll();

    if (this._queueStopped) {
      this._tgNotify(`⏹ Queue stopped — ${doneCount} done, ${errorCount} error${errorCount !== 1 ? 's' : ''}\n_Project: ${projectName}_`);
    } else {
      this._tgNotify(`🏁 Queue finished — ${doneCount} done, ${errorCount} error${errorCount !== 1 ? 's' : ''}\n_Project: ${projectName}_`);
    }

    onFinish();
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
    if (screen.executed) {
      this._showScreenViewer(screen);
    } else {
      this._showDescriptionEditor(screen);
    }
  }

  _setActiveItem(id) {
    this.container.querySelectorAll('.scr-sidebar__item').forEach(el => {
      el.classList.toggle('scr-sidebar__item--active', Number(el.dataset.id) === id);
    });
  }

  _showScreenViewer(screen) {
    const main   = this.container.querySelector('#scrMain');

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
            </button>
          </div>
          <div class="scr-preview-tabs">
            <button class="scr-preview-tab scr-preview-tab--active" id="scrTabPreview">Preview</button>
            <button class="scr-preview-tab" id="scrTabDescription">Description</button>
          </div>
          <div class="scr-viewer__actions">
            <button class="scr-btn scr-btn--sm scr-btn--secondary scr-queue-btn" id="scrQueueBtn" title="Generation queue">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M2 8h9M2 12h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              Queue
              <span class="scr-queue-btn__badge" id="scrQueueCount">…</span>
            </button>
            <div class="scr-actions-menu" id="scrActionsMenu">
              <button class="scr-btn scr-btn--sm scr-btn--secondary" id="scrActionsMenuTrigger" title="Actions">
                Actions
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                  <path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <div class="scr-actions-dropdown" id="scrActionsDropdown" hidden>
                <button class="scr-actions-dropdown__item" id="scrExportHtmlBtn">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M2 10v3a1 1 0 001 1h10a1 1 0 001-1v-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                    <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Export HTML
                </button>
                <button class="scr-actions-dropdown__item" id="scrRunBtn">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
                    <path d="M5 6l3 2-3 2V6z" fill="currentColor"/>
                    <path d="M10 7h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                  </svg>
                  Run in Terminal
                </button>
                <button class="scr-actions-dropdown__item" id="scrEditBtn">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                  </svg>
                  Edit Mockup in Terminal
                </button>
                <button class="scr-actions-dropdown__item" id="scrChooseFileBtn">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M2 4a1 1 0 011-1h3l1.5 2H13a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                  </svg>
                  Choose File
                </button>
              </div>
            </div>

            <button class="scr-btn scr-btn--sm scr-btn--danger" id="scrDeleteBtn" title="Delete screen">
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="scr-viewer__desc-panel scr-md-preview" id="scrDescPanel" hidden></div>
        <div class="scr-viewer__queue-panel" id="scrQueuePanel" hidden></div>

        <div class="scr-viewer__split" id="scrSplit">
          <div class="scr-viewer__preview-pane" id="scrPreviewPane">
            <div class="scr-viewer__preview-bar">
              <span class="scr-viewer__preview-label">Preview <span id="scrPreviewPct" class="scr-split-pct"></span></span>
              <button class="scr-btn scr-btn--sm" id="scrViewportToggle"></button>
              <button class="scr-btn scr-btn--sm" id="scrRefreshBtn" title="Refresh preview (R)">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                  <path d="M13.5 2.5v2.7H10.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span><u>R</u>efresh</span>
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
              <div class="scr-chat-composer">
                <textarea class="scr-chat-input" id="scrDescription"
                  placeholder="Describe the screen… (Alt+Enter for new line)"></textarea>
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
    // link-navigation action is cancelled.
    const guard = `<script>
(function(){
  document.addEventListener('click', function(e){
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

    const VIEWPORT_KEY  = 'mockups_preview_mode';
    const mobileIcon   = `<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="4.5" y="1" width="7" height="14" rx="1.5" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="12.5" r=".7" fill="currentColor"/></svg> Desktop`;
    const desktopIcon  = `<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5 14h6M8 12v2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg> <span><u>M</u>obile</span>`;
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

    const tabPreview     = main.querySelector('#scrTabPreview');
    const tabDescription = main.querySelector('#scrTabDescription');
    const split          = main.querySelector('#scrSplit');
    const descPanel      = main.querySelector('#scrDescPanel');
    const queuePanel     = main.querySelector('#scrQueuePanel');
    const queueBtn       = main.querySelector('#scrQueueBtn');
    const queueCountEl   = main.querySelector('#scrQueueCount');

    // Load and display queue count
    const refreshQueueCount = async () => {
      const all = await window.db.screenDesigns.list(this._projectId);
      const remaining = all.filter(s => s.queued && s.is_active !== 0).length;
      if (queueCountEl) queueCountEl.textContent = remaining;
      if (queueBtn) queueBtn.classList.toggle('scr-queue-btn--has-items', remaining > 0);
    };
    refreshQueueCount();

    let queueOpen = false;
    let lastActiveTab = tabPreview;

    const switchTab = (active) => {
      lastActiveTab = active;
      [tabPreview, tabDescription].forEach(t => t.classList.toggle('scr-preview-tab--active', t === active));
      split.hidden     = active !== tabPreview;
      descPanel.hidden = active !== tabDescription;
      if (queueOpen) {
        queueOpen = false;
        queuePanel.hidden = true;
        queueBtn.classList.remove('scr-queue-btn--active');
        split.hidden     = active !== tabPreview;
        descPanel.hidden = active !== tabDescription;
      }
    };

    tabPreview.addEventListener('click', () => switchTab(tabPreview));

    tabDescription.addEventListener('click', () => {
      switchTab(tabDescription);
      const text = screen.description || '';
      descPanel.innerHTML = text
        ? renderMarkdown(text)
        : '<p class="scr-md-preview__empty">No description added yet.</p>';
    });

    queueBtn.addEventListener('click', () => {
      queueOpen = !queueOpen;
      queueBtn.classList.toggle('scr-queue-btn--active', queueOpen);
      if (queueOpen) {
        split.hidden     = true;
        descPanel.hidden = true;
        queuePanel.hidden = false;
        this._renderQueuePanel(queuePanel).then(refreshQueueCount);
      } else {
        queuePanel.hidden = true;
        split.hidden     = lastActiveTab !== tabPreview;
        descPanel.hidden = lastActiveTab !== tabDescription;
      }
    });

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
        window.db.screenDesigns.update({ id: screen.id, html_content: fileContent });
        screen.html_content = fileContent;
        this._loadPreview(fileContent);
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
    const actionsMenuEl = main.querySelector('#scrActionsMenu');
    const dropdownEl    = main.querySelector('#scrActionsDropdown');
    main.querySelector('#scrActionsMenuTrigger').addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownEl.hidden = !dropdownEl.hidden;
    });
    dropdownEl.addEventListener('click', () => { dropdownEl.hidden = true; });
    document.addEventListener('click', (e) => {
      if (!actionsMenuEl.contains(e.target)) dropdownEl.hidden = true;
    }, { capture: false });

    main.querySelector('#scrExportHtmlBtn').addEventListener('click', async () => {
      const fresh = await window.db.screenDesigns.get(screen.id);
      const html  = fresh?.html_content || screen.html_content || '';
      if (!html) {
        alert('No HTML content to export. Generate a mockup first.');
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

    main.querySelector('#scrRunBtn').addEventListener('click', async () => {
      const model = this._getSelectedModel();
      if (!model || model.type === 'anthropic' || !model.executable) {
        alert('Please select a CLI model (Claude CLI or Gemini CLI) from the model dropdown.');
        return;
      }

      const desc = screen.description || '';
      if (!desc) {
        alert('No description saved for this screen. Edit the screen details and add a description first.');
        return;
      }

      const project    = this._getProject();
      const screensDir = await window.app.screensDir(project?.name);
      const safeTitle  = screen.title.replace(/[^a-z0-9_\-]/gi, '_');
      const outputFile = `${screensDir}\\${safeTitle}.html`;
      const prompt     = buildScreenPrompt(desc, project?.description || '', outputFile, this._getDesignTemplateForPrompt());
      const cmd        = buildPsCommand(prompt, model);
      this._showPromptPreviewModal(cmd, async () => {
        await window.db.terminal.openExternal({ command: cmd, cwd: screensDir });
        await this._saveToHistory(desc);
      });
    });

    main.querySelector('#scrEditBtn').addEventListener('click', () => this._openEdits(screen.title, screen.id));

    main.querySelector('#scrChooseFileBtn').addEventListener('click', async () => {
      const result = await window.db.dialog.openFile({
        title:      'Choose Generated Screen File',
        extensions: ['html', 'htm', 'dart', 'js', 'jsx', 'tsx', '*'],
      });
      if (!result) return;

      await window.db.screenDesigns.update({ id: screen.id, html_content: result.content });
      screen.html_content = result.content;
      this._loadPreview(result.content);
    });

    main.querySelector('#scrExtractBtn')?.addEventListener('click', () => this._showExtractDialog(screen));

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
    this._updateMockupBtns();
  }

  // ----------------------------------------------------------------
  // Design template parser + preview builder
  // ----------------------------------------------------------------
  _parseDesignTemplate(text) {
    const lines  = text.split('\n');
    const hexRe  = /#[0-9a-fA-F]{6,8}\b|#[0-9a-fA-F]{3,4}\b/;
    const r = {
      primary: null, background: null, surface: null,
      textPrimary: null, textSecondary: null,
      border: null, danger: null, fontFamily: null, borderRadius: null,
    };

    for (const line of lines) {
      const low = line.toLowerCase().replace(/[_\-]/g, ' ');
      const hex = line.match(hexRe)?.[0];

      if (!r.primary && hex && /\bprimary\b/.test(low) && !/text|on |background|container/.test(low))
        r.primary = hex;
      if (!r.background && hex && /background|\bbg\b/.test(low) && !/surface|card|container/.test(low))
        r.background = hex;
      if (!r.surface && hex && /\bsurface\b|\bcard\b/.test(low) && !/variant|hover|secondary/.test(low))
        r.surface = hex;
      if (!r.textPrimary && hex && /text primary|on background|onbackground|on surface(?! variant)/.test(low))
        r.textPrimary = hex;
      if (!r.textSecondary && hex && /text secondary|text muted|onsurface|on surface/.test(low))
        r.textSecondary = hex;
      if (!r.border && hex && /\bborder\b|\boutline\b/.test(low) && !/radius/.test(low))
        r.border = hex;
      if (!r.danger && hex && /\bdanger\b|\berror\b/.test(low))
        r.danger = hex;
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
      const h = hex.replace('#', '');
      const full = h.length <= 4 ? h.split('').map(c => c + c).join('') : h;
      return [0,2,4].map(i => parseInt(full.slice(i, i+2), 16)).join(',');
    };
    const primaryRgb = toRgb(v.primary);

    const ctxBg = { dark: '#0f1117', light: '#f0ece6', midnight: '#08080f' }[contextTheme] || '#0f1117';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: ${ctxBg};
    color: ${v.textPrimary};
    font-family: ${v.fontFamily};
    font-size: 13px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 100vh;
  }
  .card {
    background: ${v.surface};
    border: 1px solid ${v.border};
    border-radius: ${v.borderRadius};
    padding: 14px;
  }
  h3 { font-size: 14px; font-weight: 600; margin-bottom: 5px; }
  p  { color: ${v.textSecondary}; font-size: 12px; line-height: 1.6; margin-bottom: 10px; }
  .btn-row { display: flex; gap: 7px; flex-wrap: wrap; }
  button {
    display: inline-flex; align-items: center;
    padding: 6px 13px; font-size: 12px; font-weight: 500;
    border-radius: ${v.borderRadius}; border: none; cursor: pointer;
    font-family: inherit;
  }
  .btn-primary { background: ${v.primary}; color: #fff; }
  .btn-outline { background: transparent; color: ${v.primary}; border: 1px solid ${v.primary}; }
  .btn-muted   { background: transparent; color: ${v.textSecondary}; border: 1px solid ${v.border}; }
  .btn-danger  { background: ${v.danger}; color: #fff; }
  input {
    display: block; width: 100%;
    padding: 6px 9px; margin-bottom: 9px;
    background: ${v.background}; border: 1px solid ${v.border};
    border-radius: ${v.borderRadius}; color: ${v.textPrimary};
    font-size: 12px; font-family: inherit; outline: none;
  }
  .badge {
    display: inline-flex; align-items: center;
    font-size: 11px; padding: 2px 8px; border-radius: 999px;
    background: rgba(${primaryRgb},.12); color: ${v.primary};
    border: 1px solid rgba(${primaryRgb},.3);
    margin-bottom: 10px;
  }
  .swatches { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  .sw { display:flex; flex-direction:column; align-items:center; gap:3px; }
  .sw-dot { width:28px; height:28px; border-radius:6px; border:1px solid ${v.border}; }
  .sw-lbl { font-size:9px; color:${v.textSecondary}; }
</style>
</head>
<body>
  <div class="card">
    <h3>Color Palette</h3>
    <p>Extracted from your style guide.</p>
    <div class="swatches">
      <div class="sw"><div class="sw-dot" style="background:${v.primary}"></div><div class="sw-lbl">Primary</div></div>
      <div class="sw"><div class="sw-dot" style="background:${v.background}"></div><div class="sw-lbl">BG</div></div>
      <div class="sw"><div class="sw-dot" style="background:${v.surface}"></div><div class="sw-lbl">Surface</div></div>
      <div class="sw"><div class="sw-dot" style="background:${v.textPrimary}"></div><div class="sw-lbl">Text</div></div>
      <div class="sw"><div class="sw-dot" style="background:${v.textSecondary}"></div><div class="sw-lbl">Muted</div></div>
      <div class="sw"><div class="sw-dot" style="background:${v.danger}"></div><div class="sw-lbl">Danger</div></div>
    </div>
  </div>

  <div class="card">
    <h3>Typography</h3>
    <p>Font: ${v.fontFamily.split(',')[0]} · Border radius: ${v.borderRadius}</p>
    <span class="badge">Active</span>
  </div>

  <div class="card">
    <h3>Form Elements</h3>
    <input type="text" placeholder="Sample input field…" />
    <div class="btn-row">
      <button class="btn-primary">Primary</button>
      <button class="btn-outline">Outline</button>
      <button class="btn-muted">Muted</button>
      <button class="btn-danger">Danger</button>
    </div>
  </div>
</body>
</html>`;
  }

  // ----------------------------------------------------------------
  // Design System panel
  // ----------------------------------------------------------------
  _showDesignSystemPanel(onBack) {
    const EXAMPLES = [
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
      {
        label: 'Flutter — Material 3',
        light:
`Framework: Flutter — Material Design 3

Color Scheme:
- Primary: #6750A4
- Background: #FFFBFE
- Surface: #FFFBFE
- Surface Variant: #E7E0EC
- Text primary (OnBackground): #1C1B1F
- Text secondary (OnSurface): #49454F
- Border (Outline): #79747E
- Error (Danger): #B3261E
- PrimaryContainer: #EADDFF

Typography (TextTheme):
- Font family: 'Roboto', sans-serif
- displayLarge: size 57dp, weight 400
- headlineMedium: size 28dp, weight 400
- titleLarge: size 22dp, weight 400
- bodyLarge: size 16dp, weight 400
- labelLarge: size 14dp, weight 500

Components:
- Cards: border-radius 12dp, elevation 1, background SurfaceVariant
- FilledButton: border-radius 100dp, height 40dp, background Primary
- OutlinedButton: border-radius 100dp, height 40dp, border Outline
- TextField: border-radius 4dp, filled style, fillColor SurfaceVariant
- NavigationBar: height 80dp, background Surface
- Chip: border-radius 8dp, height 32dp

Spacing:
- Base unit: 4dp
- Common gaps: 8dp, 16dp, 24dp, 32dp
- Screen padding: 16dp`,
        dark:
`Framework: Flutter — Material Design 3

Color Scheme:
- Primary: #D0BCFF
- Background: #1C1B1F
- Surface: #1C1B1F
- Surface Variant: #49454F
- Text primary (OnBackground): #E6E1E5
- Text secondary (OnSurface): #CAC4D0
- Border (Outline): #938F99
- Error (Danger): #F2B8B5
- PrimaryContainer: #4F378B

Typography (TextTheme):
- Font family: 'Roboto', sans-serif
- displayLarge: size 57dp, weight 400
- headlineMedium: size 28dp, weight 400
- titleLarge: size 22dp, weight 400
- bodyLarge: size 16dp, weight 400
- labelLarge: size 14dp, weight 500

Components:
- Cards: border-radius 12dp, elevation 2 tonal, background SurfaceVariant
- FilledButton: border-radius 100dp, height 40dp, background Primary
- OutlinedButton: border-radius 100dp, height 40dp, border Outline
- TextField: border-radius 4dp, filled style, fillColor SurfaceVariant
- NavigationBar: height 80dp, background Surface
- Chip: border-radius 8dp, height 32dp

Spacing:
- Base unit: 4dp
- Common gaps: 8dp, 16dp, 24dp, 32dp
- Screen padding: 16dp`,
      },
      {
        label: 'Flutter — Cupertino (iOS)',
        light:
`Framework: Flutter — Cupertino iOS Style

Color Palette:
- Primary: #007AFF
- Background: #F2F2F7
- Surface: #FFFFFF
- Text primary: #000000
- Text secondary: #3C3C43
- Border: #C6C6C8
- Danger: #FF3B30

Typography:
- Font family: '.SF Pro Text', 'Helvetica Neue', sans-serif
- Large Title: size 34dp, weight 700, letterSpacing 0.37
- Title 1: size 28dp, weight 700
- Body: size 17dp, weight 400, letterSpacing -0.41
- Footnote: size 13dp, weight 400
- Caption: size 12dp, weight 400

Components:
- Cards: border-radius 10dp, background white, shadow 0 1dp 3dp rgba(0,0,0,0.12)
- Buttons: border-radius 10dp, height 44dp, font-weight 400
- Inputs: border-radius 10dp, background white, border 1dp solid #C6C6C8
- NavigationBar: height 44dp, background blur, border-bottom 1dp #C6C6C8
- TabBar: height 49dp, background blur

Spacing:
- Base unit: 4dp
- Standard padding: 16dp
- List row height: 44dp
- Section header height: 28dp`,
        dark:
`Framework: Flutter — Cupertino iOS Style

Color Palette:
- Primary: #0A84FF
- Background: #000000
- Surface: #1C1C1E
- Text primary: #FFFFFF
- Text secondary: #EBEBF5
- Border: #38383A
- Danger: #FF453A

Typography:
- Font family: '.SF Pro Text', 'Helvetica Neue', sans-serif
- Large Title: size 34dp, weight 700, letterSpacing 0.37
- Title 1: size 28dp, weight 700
- Body: size 17dp, weight 400, letterSpacing -0.41
- Footnote: size 13dp, weight 400
- Caption: size 12dp, weight 400

Components:
- Cards: border-radius 10dp, background #1C1C1E, shadow none
- Buttons: border-radius 10dp, height 44dp, font-weight 400
- Inputs: border-radius 10dp, background #2C2C2E, border 1dp solid #38383A
- NavigationBar: height 44dp, background blur dark, border-bottom 1dp #38383A
- TabBar: height 49dp, background blur dark

Spacing:
- Base unit: 4dp
- Standard padding: 16dp
- List row height: 44dp
- Section header height: 28dp`,
      },
    ];

    const parts = this._getTemplateParts();
    const hasAny = this._hasAnyTemplate();

    const main = this.container.querySelector('#scrMain');
    main.innerHTML = `
      <div class="scr-form">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
          <h2 class="scr-form__heading">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="margin-right:6px;vertical-align:-2px">
              <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/>
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            Project style guide
          </h2>
          <span class="scr-ds-badge${hasAny ? ' scr-ds-badge--set' : ''}">
            ${hasAny ? 'Active — applied to all screens' : 'Not set'}
          </span>
        </div>
        <p class="scr-form__hint" style="margin-top:-8px">
          Define colours, typography, spacing and component styles for light and dark themes. Both are injected into every screen generation prompt.
        </p>
        <div class="scr-form__row scr-form__row--grow">
          <div class="scr-ds-editor" id="scrDsEditor">

            <div class="scr-ds-templates">
              <div class="scr-ds-tpl-col" id="scrDsTplColLight">
                <div class="scr-ds-tpl-label scr-ds-tpl-label--light">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <circle cx="12" cy="12" r="5"/>
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                  </svg>
                  Light Theme
                </div>
                <textarea class="scr-form__textarea" id="scrDsTplLight" placeholder="Paste light theme design here…">${escHtml(parts.light)}</textarea>
              </div>
              <div class="scr-ds-tpl-col" id="scrDsTplColDark">
                <div class="scr-ds-tpl-label scr-ds-tpl-label--dark">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                  Dark Theme
                </div>
                <textarea class="scr-form__textarea" id="scrDsTplDark" placeholder="Paste dark theme design here…">${escHtml(parts.dark)}</textarea>
              </div>
            </div>

            <div class="scr-ds-preview-panel">
              <div class="scr-ds-preview-bar">
                <span class="scr-ds-preview-label">Preview</span>
                <div class="scr-ds-theme-btns">
                  <button class="scr-ds-theme-btn" data-theme="light">Light</button>
                  <button class="scr-ds-theme-btn scr-ds-theme-btn--active" data-theme="dark">Dark</button>
                </div>
                <button class="scr-btn scr-btn--sm" id="scrDsRefreshBtn" title="Refresh preview">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                    <path d="M13.5 2.5v2.7H10.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Refresh
                </button>
              </div>
              <iframe class="scr-ds-preview-frame" id="scrDsPreviewFrame" sandbox="allow-scripts"></iframe>
            </div>

          </div>
        </div>
        <div class="scr-form__actions">
          <button class="scr-btn scr-btn--sm" id="scrDsDefault">Example: ${EXAMPLES[0].label} ↻</button>
          <div class="scr-form__btns">
            <button class="scr-btn scr-btn--secondary" id="scrDsCancel">Cancel</button>
            <button class="scr-btn scr-btn--primary" id="scrDsSave">Save Style Guide</button>
          </div>
        </div>
      </div>
    `;

    let exampleIdx  = -1;
    let activeTheme = 'dark';

    const blankHtml = theme => {
      const bg = { dark: '#0f1117', light: '#f0ece6' }[theme] || '#0f1117';
      return `<html><body style="margin:0;height:100vh;background:${bg};display:flex;align-items:center;justify-content:center;font-family:system-ui"><p style="color:#6b7280;font-size:12px;text-align:center">No ${theme} template yet.<br>Add one on the left to see the preview.</p></body></html>`;
    };

    const getActiveTpl = () => (activeTheme === 'light'
      ? main.querySelector('#scrDsTplLight')
      : main.querySelector('#scrDsTplDark')
    ).value.trim();

    const setActiveCol = () => {
      main.querySelector('#scrDsTplColLight').classList.toggle('scr-ds-tpl-col--active', activeTheme === 'light');
      main.querySelector('#scrDsTplColDark').classList.toggle('scr-ds-tpl-col--active',  activeTheme === 'dark');
    };

    const renderPreview = () => {
      const tpl   = getActiveTpl();
      const frame = main.querySelector('#scrDsPreviewFrame');
      frame.srcdoc = tpl
        ? this._buildPreviewHtml(this._parseDesignTemplate(tpl), activeTheme)
        : blankHtml(activeTheme);
    };

    const cycleBtn = main.querySelector('#scrDsDefault');
    cycleBtn.addEventListener('click', () => {
      exampleIdx = (exampleIdx + 1) % EXAMPLES.length;
      const ex   = EXAMPLES[exampleIdx];
      const next = EXAMPLES[(exampleIdx + 1) % EXAMPLES.length];
      main.querySelector('#scrDsTplLight').value = ex.light;
      main.querySelector('#scrDsTplDark').value  = ex.dark;
      cycleBtn.textContent = `Example: ${ex.label} — Next: ${next.label} ↻`;
      renderPreview();
    });

    main.querySelector('#scrDsTplLight').addEventListener('input', () => { if (activeTheme === 'light') renderPreview(); });
    main.querySelector('#scrDsTplDark').addEventListener('input',  () => { if (activeTheme === 'dark')  renderPreview(); });

    main.querySelector('#scrDsRefreshBtn').addEventListener('click', renderPreview);

    main.querySelectorAll('.scr-ds-theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        main.querySelectorAll('.scr-ds-theme-btn').forEach(b => b.classList.remove('scr-ds-theme-btn--active'));
        btn.classList.add('scr-ds-theme-btn--active');
        activeTheme = btn.dataset.theme;
        setActiveCol();
        renderPreview();
      });
    });

    setActiveCol();
    renderPreview();

    main.querySelector('#scrDsCancel').addEventListener('click', () => onBack());

    main.querySelector('#scrDsSave').addEventListener('click', async () => {
      const tplLight = main.querySelector('#scrDsTplLight').value.trim();
      const tplDark  = main.querySelector('#scrDsTplDark').value.trim();
      const tpl      = JSON.stringify({ light: tplLight, dark: tplDark });
      const project  = this._getProject();
      await window.db.projects.update({ id: project.id, design_template: tpl });
      this._designTemplate = tpl;
      if (project) project.design_template = tpl;
      onBack();
    });
  }

  // ----------------------------------------------------------------
  // Edits — open the selected CLI with the screen file as context
  // ----------------------------------------------------------------
  async _openEdits(titleOverride, screenId) {
    const main  = this.container.querySelector('#scrMain');
    const title = titleOverride || main?.querySelector('#scrTitle')?.value.trim() || '';

    if (!title) {
      alert('Save the screen first so a file exists to edit.');
      return;
    }

    const model = this._getSelectedModel();
    if (!model || model.type === 'anthropic' || !model.executable) {
      alert('Please select a CLI model (Claude CLI or Gemini CLI) from the model dropdown.');
      return;
    }

    const safeTitle   = title.replace(/[^a-z0-9_\-]/gi, '_');
    const projectName = this._project?.name;
    const safeProject = (projectName || '').replace(/[^a-z0-9_\-]/gi, '_');
    const rootDir     = await window.app.screensDir();
    const screensDir  = safeProject ? `${rootDir}\\${safeProject}` : rootDir;
    const filePath    = `${screensDir}\\${safeTitle}.html`;

    const existing = await window.shell.readFile(filePath);
    if (!existing && screenId) {
      const screen = await window.db.screenDesigns.get(screenId);
      if (screen?.html_content) {
        await window.shell.writeFile(filePath, screen.html_content);
      }
    }

    const flags     = model.flags ? ` ${model.flags}` : '';
    const modelFlag = model.model_name ? ` --model ${model.model_name}` : '';
    const cmd = `${model.executable}${flags}${modelFlag} "${filePath}"`;
    this._showPromptPreviewModal(cmd, async () => {
      await window.db.terminal.openExternal({ command: cmd, cwd: screensDir });
    });
  }

  // ----------------------------------------------------------------
  // Prompt Preview modal
  // ----------------------------------------------------------------
  _showPromptPreviewModal(prompt, onRun) {
    const dlg = document.createElement('div');
    dlg.className = 'scr-extract-overlay';
    dlg.innerHTML = `
      <div class="scr-prompt-preview-dialog">
        <div class="scr-extract-dialog__header">
          <span>Prompt Preview</span>
          <button class="scr-extract-dialog__close">&times;</button>
        </div>
        <div class="scr-prompt-preview-dialog__body">
          <pre class="scr-prompt-preview-dialog__pre">${escHtml(prompt)}</pre>
        </div>
        <div class="scr-extract-dialog__footer">
          <button class="scr-btn scr-btn--secondary" id="promptPreviewClose">Close</button>
          <button class="scr-btn scr-btn--primary"   id="promptPreviewRun">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
              <path d="M5 6l3 2-3 2V6z" fill="currentColor"/>
            </svg>
            Run
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(dlg);
    const close = () => dlg.remove();
    dlg.querySelector('.scr-extract-dialog__close').addEventListener('click', close);
    dlg.querySelector('#promptPreviewClose').addEventListener('click', close);
    dlg.querySelector('#promptPreviewRun').addEventListener('click', () => { close(); onRun(); });
  }

  // ----------------------------------------------------------------
  // Extract Stories dialog
  // ----------------------------------------------------------------
  async _showExtractDialog(screen) {
    let m = this._getSelectedModel();
    if (!m || m.type === 'anthropic' || !m.executable) {
      m = (this._picker?.models || this._modelConfigs || []).find(c => c.type !== 'anthropic' && c.executable);
    }
    if (!m) {
      alert('No CLI model configured. Add a CLI model in Model Settings first.');
      return;
    }

    const project    = this._getProject();
    const screensDir = await window.app.screensDir(project?.name);
    const safeTitle  = screen.title.replace(/[^a-z0-9_\-]/gi, '_');
    const outputFile = `${screensDir}\\${safeTitle}_stories.json`;

    const htmlFilePath = await window.app.prepareScreenRef({
      screensDir,
      safeTitle,
      htmlContent: screen.html_content,
    });

    const instruction = buildExtractPrompt(screen.title, htmlFilePath, outputFile);
    const cmd         = buildExtractPsCommand(instruction, m);

    const dlg = document.createElement('div');
    dlg.className = 'scr-extract-overlay';
    dlg.innerHTML = `
      <div class="scr-extract-dialog">
        <div class="scr-extract-dialog__header">
          <span>Extract User Stories — ${escHtml(screen.title)}</span>
          <button class="scr-extract-dialog__close">&times;</button>
        </div>
        <div class="scr-extract-dialog__body">
          <div class="scr-cmd-preview">
            <div class="scr-cmd-preview__label">Command:</div>
            <pre class="scr-cmd-preview__code">${escHtml(cmd)}</pre>
          </div>
          <div class="scr-form__row" style="margin-top:12px">
            <button class="scr-btn scr-btn--primary" id="extRunBtn">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
                <path d="M5 6l3 2-3 2V6z" fill="currentColor"/>
              </svg>
              Run in Terminal
            </button>
            <span class="scr-form__hint">Opens a terminal window. The AI will write the stories JSON to the output path shown above.</span>
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

    dlg.querySelector('#extRunBtn').addEventListener('click', async () => {
      await window.db.terminal.openExternal({ command: cmd, cwd: project?.project_path || undefined });
    });
  }
}
