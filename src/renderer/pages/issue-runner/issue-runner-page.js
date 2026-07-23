import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme }              from '../../shared/theme-manager.js';
import { ModelPicker }                   from '../../components/model-picker/model-picker.js';
import { ProjectSidebar }                from '../../components/project-sidebar/project-sidebar.js';

const STATUS_META = {
  open:        { label: 'Open'        },
  in_progress: { label: 'In Progress' },
  resolved:    { label: 'Resolved'    },
  closed:      { label: 'Closed'      },
  wont_fix:    { label: "Won't Fix"   },
};

const TYPE_META = {
  issue:   { label: 'Bug',     cls: 'is-type-badge--bug'     },
  feature: { label: 'Feature', cls: 'is-type-badge--feature' },
  change:  { label: 'Change',  cls: 'is-type-badge--change'  },
};

const ANSI = {
  reset: '\x1b[0m',
  bold:  '\x1b[1m',
  cyan:  '\x1b[36m',
  green: '\x1b[32m',
  red:   '\x1b[31m',
  dim:   '\x1b[2m',
};

export class IssueRunnerPage {
  constructor(container, params, router) {
    this.container  = container;
    this.router     = router;
    this._embedded  = !!router;
    this._returnRoute = 'issues';
    this._projectId = params.projectId;
    this._passedModelConfig = params.modelConfig || null;
    this._project   = null;
    this._issues    = [];
    this._selectedId    = null;
    this._selectedIssue = null;
    this._isRunning     = false;
    this._doRunAll      = false;
    this._modelCfg      = null;
    this._skipPermissions = true;
    this._filterStatus  = 'open_and_in_progress';

    // Session-level run state (not persisted to DB until complete)
    this._runState   = {};  // { [id]: 'idle'|'running'|'done'|'failed' }
    this._termBuf    = {};  // { [id]: string }
    this._activeId   = null;
    this._startTimes = {};
    this._timerInt   = null;

    // Terminal
    this._term        = null;
    this._fitAddon    = null;
    this._resizeObs   = null;
    this._onWinResize = null;
    this._lastCols    = 0;
    this._lastRows    = 0;

    // Git panel
    this._gitPanelVisible  = false;
    this._gitFiles         = [];
    this._gitPollInterval  = null;
    this._gitExpandedFiles = new Set();
    this._projectLayers    = [];
    this._layoutObs        = null;
    this._isWideMode       = false;
  }

  async mount() {
    injectCss('pages/issue-runner/issue-runner-page.css');
    injectCss('components/git/git-diff.css');
    injectCss('pages/issues/issues-page.css');
    if (this._embedded) injectCss('components/project-sidebar/project-sidebar.css');
    applyStoredTheme();
    await this._loadAndRender();
  }

  /**
   * Called by the persistent-page host when this route is activated again.
   * Mirrors the pop-out window's behavior: opening the runner for a
   * different project re-loads in place; just re-showing the same tab only
   * needs a terminal refit.
   */
  onResume(params) {
    // Defensive: re-inject in case another page's unmount() stripped this
    // shared stylesheet while this tab sat hidden in the background — injectCss
    // is a no-op if the <link> is already present.
    injectCss('components/git/git-diff.css');
    if (params && params.projectId !== this._projectId) {
      this._projectId = params.projectId;
      this._passedModelConfig = params.modelConfig || null;
      this._loadAndRender();
      return;
    }
    if (this._fitAddon) {
      try { this._fitAddon.fit(); } catch (_) {}
    }
  }

  _handleClose() {
    if (this._embedded) {
      this.router?.closePersistentRoute?.('issue-runner');
      this.router?.navigateTo?.(this._returnRoute, { projectId: this._projectId });
    } else {
      window.close();
    }
  }

  async _loadAndRender() {
    let _mapping;
    [this._project, this._projectLayers, _mapping] = await Promise.all([
      window.db.projects.get(this._projectId),
      window.db.projectLayers.list(this._projectId),
      window.db.modelMapping.get('issue-runner'),
    ]);

    this._render();

    this._picker = new ModelPicker({
      anchor:    this.container.querySelector('#irModelPicker'),
      onSelect:  model => { this._modelCfg = model; },
      initialId: this._passedModelConfig?.id ?? _mapping?.model_config_id ?? null,
    });
    await this._picker.reload();

    this._initTerminal();
    this._startGitPolling();
    this._initLayoutObserver();
    this._bindEvents();

    await this._loadIssues();
  }

  _render() {
    const body = this._template();
    if (this._embedded) {
      this._sidebar = new ProjectSidebar({ projectId: this._project?.id, router: this.router, activeRoute: 'issues' });
      this.container.innerHTML = `
        <div class="ph-project-shell">
          ${this._renderShellHeader()}
          <div class="ph-page-with-nav">
            ${this._sidebar.html()}
            ${body}
          </div>
        </div>`;
      this._sidebar.bindEvents(this.container);
      this._sidebar.loadCounts(this.container);
      this.container.querySelector('#irBtnShellBack')
        ?.addEventListener('click', () => this._handleClose());
    } else {
      this.container.innerHTML = body;
    }
  }

  _renderShellHeader() {
    const name    = this._project?.name || 'Project';
    const initial = name.trim()[0]?.toUpperCase() || '?';
    return `
      <header class="project-home__header">
        <button class="project-home__back" id="irBtnShellBack" aria-label="Back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <div class="project-home__badge">
          <div class="project-home__badge-initial">${escHtml(initial)}</div>
          <span class="project-home__badge-name">${escHtml(name)}</span>
        </div>
        <span class="ph-header-page-chip">Issue Runner</span>
      </header>`;
  }

  unmount() {
    removeCss('pages/issue-runner/issue-runner-page.css');
    removeCss('pages/issues/issues-page.css');
    // components/git/git-diff.css and project-sidebar.css are shared with other
    // persistent tabs (Workflow Runner, Terminal, etc.) that may still be alive
    // in the background — removing them here would strip their styling too.
    // Treat them as loaded once for the app's lifetime, same as those pages do.
    this._picker?.unmount();
    if (this._isRunning) window.app.irPty.kill();
    window.app.irPty.offAll();
    this._stopElapsedTimer();
    this._stopGitPolling();
    if (this._resizeObs)   { this._resizeObs.disconnect();   this._resizeObs   = null; }
    if (this._onWinResize) { window.removeEventListener('resize', this._onWinResize); this._onWinResize = null; }
    if (this._layoutObs)   { this._layoutObs.disconnect();   this._layoutObs   = null; }
    if (this._term)        { this._term.dispose();           this._term        = null; }
    this._doRunAll  = false;
    this._isRunning = false;
  }

  // ── Template ─────────────────────────────────────────────────────────

  _template() {
    const name = this._project ? escHtml(this._project.name) : 'Project';
    return `
      <div class="ir-page">
        <header class="ir-header">
          <button class="ir-header__back" id="irBtnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <span class="ir-header__title">Issue Runner</span>
          <span class="ir-header__project">${name}</span>

          <button class="ir-perm-btn ir-perm-btn--on" id="irBtnSkipPerms" aria-pressed="true"
            title="Skip Permissions: passes --dangerously-skip-permissions to Claude when ON.">
            Skip Permissions: <span id="irSkipPermsLabel">ON</span>
          </button>

          <div class="project-page__model-group ir-header__model" style="-webkit-app-region:no-drag;">
            <div id="irModelPicker"></div>
          </div>

          <button class="ir-git-toggle-btn" id="irBtnGitToggle" title="Toggle Git Changes">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="5" cy="4" r="1.5" stroke="currentColor" stroke-width="1.4"/>
              <circle cx="11" cy="12" r="1.5" stroke="currentColor" stroke-width="1.4"/>
              <circle cx="11" cy="4" r="1.5" stroke="currentColor" stroke-width="1.4"/>
              <path d="M5 5.5v5a1.5 1.5 0 001.5 1.5H11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <path d="M11 5.5V9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            Git <span class="ir-git-badge" id="irGitBadge" hidden></span>
          </button>
        </header>

        <div class="ir-toolbar">
          <span class="ir-toolbar__summary" id="irSummary"></span>
          <div class="ir-toolbar__filter">
            <select class="ir-filter-select" id="irStatusFilter" title="Filter issues">
              <option value="open_and_in_progress" selected>Open &amp; In Progress</option>
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div class="ir-toolbar__actions">
            <button class="ir-toolbar__btn ir-toolbar__btn--primary" id="irBtnRunThis" disabled title="Run selected issue (Ctrl+Enter)">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M4 3l9 5-9 5V3z" fill="currentColor"/></svg>
              Run Selected
            </button>
            <button class="ir-toolbar__btn ir-toolbar__btn--primary" id="irBtnRunAll" disabled title="Run all open issues">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 3l5 5-5 5V3zM9 3l5 5-5 5V3z" fill="currentColor"/></svg>
              Run All
            </button>
            <button class="ir-toolbar__btn ir-toolbar__btn--stop" id="irBtnStop" hidden title="Stop (Escape)">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor"/></svg>
              Stop
            </button>
          </div>
        </div>

        <div class="ir-layout">
          <div class="ir-list-col">
            <div class="ir-list-label">Issues</div>
            <div class="ir-list-panel" id="irListPanel"></div>
          </div>

          <div class="ir-detail-panel" id="irDetailPanel">
            <!-- Info strip — shown when item is selected and not running -->
            <div class="ir-term-strip" id="irTermStrip" hidden></div>

            <!-- xterm.js terminal -->
            <div class="ir-terminal-wrap" id="irTerminal"></div>

            <!-- Git diff overlay -->
            <div class="ir-git-panel" id="irGitPanel" hidden>
              <div class="ir-git-panel__header">
                <span class="ir-git-panel__title">Git Changes</span>
                <span class="ir-git-panel__badge" id="irGitPanelBadge" hidden></span>
                <div class="ir-git-panel__actions">
                  <button class="ir-git-panel__icon-btn" id="irBtnGitExpandAll" title="Expand all">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <path d="M2 5l6 6 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <button class="ir-git-panel__icon-btn" id="irBtnGitCollapseAll" title="Collapse all">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <path d="M2 11l6-6 6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <button class="ir-git-panel__icon-btn" id="irBtnGitRefresh" title="Refresh">↺</button>
                  <button class="ir-git-panel__icon-btn" id="irBtnGitClose" title="Close">✕</button>
                </div>
              </div>
              <div class="ir-git-commit-bar">
                <input class="ir-git-commit-msg" id="irGitCommitMsg" type="text"
                  spellcheck="false" placeholder="Commit message…">
                <button class="ir-git-commit-btn" id="irBtnGitCommit" disabled>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l4 4 6-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Commit
                </button>
              </div>
              <div class="ir-git-panel__body" id="irGitAccordion">
                <div class="git-diff-empty">No changes yet.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ── Issues list ───────────────────────────────────────────────────────

  async _loadIssues() {
    const filters    = { project_id: this._projectId };
    const isCombined = this._filterStatus === 'open_and_in_progress';
    if (this._filterStatus && !isCombined) filters.status = this._filterStatus;

    let issues = await window.db.issues.list(filters);
    if (isCombined) issues = issues.filter(i => i.status === 'open' || i.status === 'in_progress');
    this._issues = issues;
    this._renderList();
    this._updateSummary();

    if (this._issues.length > 0) {
      const sel = this._issues.find(i => i.id === this._selectedId) ?? this._issues[0];
      this._selectIssue(sel);
    }
  }

  _renderList() {
    const panel = this.container.querySelector('#irListPanel');
    if (!panel) return;

    if (this._issues.length === 0) {
      panel.innerHTML = `<div class="ir-list-empty">No issues found.</div>`;
      return;
    }

    panel.innerHTML = this._issues.map(i => this._itemHtml(i)).join('');

    panel.querySelectorAll('.ir-item').forEach(el => {
      el.addEventListener('click', () => {
        const id    = parseInt(el.dataset.id);
        const issue = this._issues.find(i => i.id === id);
        if (issue) this._selectIssue(issue);
      });
    });

    if (this._selectedId) {
      panel.querySelector(`[data-id="${this._selectedId}"]`)?.classList.add('ir-item--selected');
    }
  }

  _itemHtml(issue) {
    const runState  = this._runState[issue.id] || 'idle';
    const status    = issue.status || 'open';
    const sm        = STATUS_META[status] || STATUS_META.open;
    const isRunning = runState === 'running';
    const elapsed   = isRunning && this._startTimes[issue.id]
      ? this._fmt(Date.now() - this._startTimes[issue.id]) : '';

    let icon = '';
    if (runState === 'running') {
      icon = `<svg class="ir-run-icon ir-run-icon--spin" width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4" stroke-dasharray="20 14" stroke-linecap="round"/></svg>`;
    } else if (runState === 'done') {
      icon = `<svg class="ir-run-icon ir-run-icon--done" width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2.5 8.5l3.5 3.5 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    } else if (runState === 'failed') {
      icon = `<svg class="ir-run-icon ir-run-icon--failed" width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    } else {
      icon = `<span class="is-sev-dot is-sev-dot--${issue.severity || 'medium'}" title="${issue.severity || 'medium'}"></span>`;
    }

    const typeKey  = issue.type || 'issue';
    const typeMeta = TYPE_META[typeKey];
    const typeBadge = typeMeta
      ? `<span class="is-type-badge ${typeMeta.cls}">${typeMeta.label}</span>`
      : '';
    return `
      <div class="ir-item ir-item--${runState}${this._selectedId === issue.id ? ' ir-item--selected' : ''}" data-id="${issue.id}">
        <span class="ir-item__icon">${icon}</span>
        <div class="ir-item__body">
          <div class="ir-item__title-row">
            <span class="ir-item__id">#${issue.id}</span>
            ${typeBadge}
            <span class="ir-item__title">${escHtml(issue.title)}</span>
            <span class="is-status-chip is-status-chip--${status}">${sm.label}</span>
          </div>
          ${issue.description ? `<div class="ir-item__desc">${escHtml(issue.description)}</div>` : ''}
        </div>
        <div class="ir-item__right">
          <span class="ir-item__elapsed">${elapsed}</span>
        </div>
      </div>`;
  }

  _refreshItemEl(id) {
    const issue = this._issues.find(i => i.id === id);
    if (!issue) return;
    const panel = this.container.querySelector('#irListPanel');
    const el    = panel?.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    const selected = el.classList.contains('ir-item--selected');
    el.outerHTML = this._itemHtml(issue);
    const newEl = panel.querySelector(`[data-id="${id}"]`);
    if (!newEl) return;
    if (selected) newEl.classList.add('ir-item--selected');
    newEl.addEventListener('click', () => {
      const i = this._issues.find(x => x.id === id);
      if (i) this._selectIssue(i);
    });
  }

  _selectIssue(issue) {
    const prevLayerId   = this._selectedIssue?.layer_id ?? null;
    this._selectedId    = issue.id;
    this._selectedIssue = issue;
    const panel = this.container.querySelector('#irListPanel');
    panel?.querySelectorAll('.ir-item').forEach(el => el.classList.remove('ir-item--selected'));
    panel?.querySelector(`[data-id="${issue.id}"]`)?.classList.add('ir-item--selected');

    this._updateStrip(issue);
    this._updateCommitMsg(issue);
    this._syncButtonStates();

    if (issue.layer_id !== prevLayerId) this._refreshGitPanel();

    const runState = this._runState[issue.id] || 'idle';
    if (runState === 'done' || runState === 'failed') {
      this._replayOutput(issue);
    } else if (runState === 'idle') {
      this._cdToIssuePath(issue);
    }
    // running: terminal shows live output — do nothing
  }

  async _cdToIssuePath(issue) {
    if (this._activeId != null) return;
    if (!this._term) return;
    const { cwd, error } = await this._resolveIssueCwd(issue);
    if (error || !cwd) return;
    window.app.irPty.write(`cd "${cwd}"\r`);
  }

  // ── Strip ─────────────────────────────────────────────────────────────

  _updateStrip(issue) {
    const strip = this.container.querySelector('#irTermStrip');
    if (!strip) return;
    const runState  = this._runState[issue.id] || 'idle';
    const isRunning = runState === 'running';
    strip.hidden = isRunning;
    if (isRunning) return;

    const statusOptions = Object.entries(STATUS_META)
      .map(([val, m]) =>
        `<option value="${val}"${issue.status === val ? ' selected' : ''}>${m.label}</option>`)
      .join('');
    const typeLabel = issue.type === 'task' ? 'Task' : 'Bug';

    strip.innerHTML = `
      <div class="ir-strip__info">
        <span class="is-sev-dot is-sev-dot--${issue.severity || 'medium'}" title="${issue.severity || 'medium'}"></span>
        <span class="ir-strip__id">#${issue.id}</span>
        <span class="ir-strip__title">${escHtml(issue.title)}</span>
        <span class="ir-strip__type">${typeLabel}</span>
      </div>
      <div class="ir-strip__actions">
        <label class="ir-strip__status-label">Status</label>
        <select class="ir-status-picker" id="irStatusPicker">${statusOptions}</select>
        <button class="ir-strip__apply-btn" id="irBtnApplyStatus">Apply</button>
      </div>`;

    strip.querySelector('#irBtnApplyStatus')?.addEventListener('click', async () => {
      const sel       = strip.querySelector('#irStatusPicker');
      const newStatus = sel?.value;
      if (!newStatus) return;
      await window.db.issues.update({ id: issue.id, status: newStatus });
      issue.status = newStatus;
      this._refreshItemEl(issue.id);
      this._syncButtonStates();
      this._updateSummary();
      const btn = strip.querySelector('#irBtnApplyStatus');
      const orig = btn.textContent;
      btn.textContent = 'Saved!';
      btn.disabled    = true;
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1200);
    });
  }

  _replayOutput(issue) {
    if (!this._term) return;
    this._term.reset();
    const runState = this._runState[issue.id];
    const color    = runState === 'done' ? ANSI.green : ANSI.red;
    this._term.writeln(`${ANSI.dim}── Output for: ${ANSI.reset}${color}#${issue.id} ${issue.title}${ANSI.reset}${ANSI.dim} ──${ANSI.reset}`);
    if (this._termBuf[issue.id]) {
      this._term.write(this._termBuf[issue.id]);
    } else {
      this._term.writeln(`${ANSI.dim}(no output recorded)${ANSI.reset}`);
    }
  }

  _writeIssueBanner(issue) {
    if (!this._term) return;
    const label = `#${issue.id} — ${issue.title}`;
    const line  = '─'.repeat(Math.max(label.length + 4, 40));
    this._term.write(`\r\n${ANSI.bold}${ANSI.cyan}${line}\r\n  ${label}\r\n${line}${ANSI.reset}\r\n`);
  }

  // ── Run ───────────────────────────────────────────────────────────────

  _buildPromptText(issue) {
    const typeLabel = issue.type === 'task' ? 'Task' : 'Bug';
    const parts     = [`${typeLabel}: ${issue.title}`];
    if (issue.description)        parts.push('', `Description:\n${issue.description}`);
    if (issue.steps_to_reproduce) parts.push('', `Steps to Reproduce:\n${issue.steps_to_reproduce}`);
    if (issue.expected_behavior)  parts.push('', `Expected Behavior:\n${issue.expected_behavior}`);
    if (issue.actual_behavior)    parts.push('', `Actual Behavior:\n${issue.actual_behavior}`);
    return parts.join('\n');
  }

  async _resolveIssueCwd(issue) {
    if (issue.layer_id) {
      const layer = await window.db.projectLayers.get(issue.layer_id);
      if (layer?.folder_path?.trim()) return { cwd: layer.folder_path.trim(), error: null };
      const layerName = layer?.name || `#${issue.layer_id}`;
      return { cwd: null, error: `Layer "${layerName}" has no folder path set. Configure it in Layers first.` };
    }
    const cwd = this._project?.project_path?.trim() || null;
    if (!cwd) return { cwd: null, error: 'No project folder selected. Open the project folder first.' };
    return { cwd, error: null };
  }

  async _runIssue(issue, { interactive = true, skipPermissions = null } = {}) {
    if (this._isRunning) return;

    const { cwd, error: cwdError } = await this._resolveIssueCwd(issue);
    if (cwdError) {
      if (this._term) { this._term.reset(); this._term.writeln(`${ANSI.red}CWD Error: ${cwdError}${ANSI.reset}`); }
      return;
    }

    const effectiveSkipPerms = skipPermissions ?? this._skipPermissions;
    const promptText         = this._buildPromptText(issue);
    const layerId            = `ir_${issue.id}`;

    this._isRunning = true;
    this._activeId  = issue.id;
    this._runState[issue.id] = 'running';
    this._termBuf[issue.id]  = '';

    this._startTimes[issue.id] = Date.now();
    this._startElapsedTimer(issue.id);

    this._refreshItemEl(issue.id);
    this._updateSummary();
    this._updateToolbarRunState(true);
    this._updateStrip(issue); // hides strip while running

    this._term?.reset();
    this._writeIssueBanner(issue);

    window.app.irPty.onLayerDone(async ({ layerId: doneId, error: runError }) => {
      if (doneId !== layerId) return;

      window.app.irPty.offAll();
      this._reattachPtyListeners();
      this._stopElapsedTimer();

      const elapsed   = this._fmt(Date.now() - this._startTimes[issue.id]);
      const succeeded = !runError;

      this._runState[issue.id] = succeeded ? 'done' : 'failed';

      const icon = succeeded ? `${ANSI.green}✔` : `${ANSI.red}✗`;
      this._term?.write(`\r\n${icon}  #${issue.id} ${issue.title} — ${succeeded ? 'done' : 'failed'} in ${elapsed}${ANSI.reset}\r\n`);
      if (runError) this._term?.write(`${ANSI.red}Error: ${runError}${ANSI.reset}\r\n`);

      if (succeeded) {
        await window.db.issues.update({ id: issue.id, status: 'resolved' });
        issue.status = 'resolved';
      }

      this._activeId  = null;
      this._isRunning = false;
      this._refreshItemEl(issue.id);
      this._updateSummary();
      this._updateToolbarRunState(false);
      if (this._selectedId === issue.id) this._updateStrip(issue);
      this._refreshGitPanel();

      if (this._doRunAll && succeeded) {
        const next = this._issues.find(i =>
          (i.status === 'open' || i.status === 'in_progress') &&
          (!this._runState[i.id] || this._runState[i.id] === 'idle')
        );
        if (next) {
          setTimeout(() => {
            this._selectIssue(next);
            this._runIssue(next, { interactive: false, skipPermissions: true });
          }, 200);
        } else {
          this._doRunAll = false;
          this._updateToolbarRunAllState(false);
        }
      } else if (this._doRunAll) {
        this._doRunAll = false;
        this._updateToolbarRunAllState(false);
      }
    });

    this._fitTerminal();
    this._term?.focus();

    const result = await window.app.irPty.runInShell({
      layerId,
      prompt:          promptText,
      model:           this._modelCfg,
      cwd,
      skipPermissions: effectiveSkipPerms,
      interactive,
    });

    if (!result?.ok) {
      window.app.irPty.offAll();
      this._reattachPtyListeners();
      this._stopElapsedTimer();
      this._term?.write(`${ANSI.red}Failed to start: ${result?.error || 'unknown'}${ANSI.reset}\r\n`);
      this._runState[issue.id] = 'failed';
      this._isRunning = false;
      this._activeId  = null;
      this._refreshItemEl(issue.id);
      this._updateSummary();
      this._updateToolbarRunState(false);
      if (this._selectedId === issue.id) this._updateStrip(issue);
    }
  }

  // ── Elapsed timer ─────────────────────────────────────────────────────

  _startElapsedTimer(id) {
    this._stopElapsedTimer();
    this._timerInt = setInterval(() => {
      const start = this._startTimes[id];
      if (!start) return;
      const el = this.container.querySelector(`[data-id="${id}"] .ir-item__elapsed`);
      if (el) el.textContent = this._fmt(Date.now() - start);
    }, 500);
  }

  _stopElapsedTimer() {
    if (this._timerInt) { clearInterval(this._timerInt); this._timerInt = null; }
  }

  _fmt(ms) {
    const s = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  // ── Toolbar ───────────────────────────────────────────────────────────

  _updateSummary() {
    const el = this.container.querySelector('#irSummary');
    if (!el) return;
    const total   = this._issues.length;
    const open    = this._issues.filter(i => i.status === 'open' || i.status === 'in_progress').length;
    const done    = Object.values(this._runState).filter(s => s === 'done').length;
    const failed  = Object.values(this._runState).filter(s => s === 'failed').length;
    const parts   = [`${total} issues`, `${open} open`];
    if (done > 0)   parts.push(`${done} done`);
    if (failed > 0) parts.push(`${failed} failed`);
    el.textContent = parts.join(' · ');
    this._syncButtonStates();
  }

  _syncButtonStates() {
    const runAll  = this.container.querySelector('#irBtnRunAll');
    const runThis = this.container.querySelector('#irBtnRunThis');
    const runnable = this._issues.filter(i =>
      (i.status === 'open' || i.status === 'in_progress') &&
      (!this._runState[i.id] || this._runState[i.id] === 'idle')
    ).length;
    if (runAll) runAll.disabled = true;
    if (runThis) {
      const si = this._selectedIssue;
      const selRunnable = si &&
        (si.status === 'open' || si.status === 'in_progress') &&
        (!this._runState[si.id] || this._runState[si.id] === 'idle');
      runThis.disabled = !selRunnable || this._isRunning;
    }
  }

  _updateToolbarRunState(running) {
    const stop   = this.container.querySelector('#irBtnStop');
    const runAll = this.container.querySelector('#irBtnRunAll');
    if (stop)   stop.hidden   = !running;
    if (runAll) runAll.hidden = running || this._doRunAll;
    this._syncButtonStates();
  }

  _updateToolbarRunAllState(active) {
    const runAll = this.container.querySelector('#irBtnRunAll');
    const stop   = this.container.querySelector('#irBtnStop');
    if (runAll) runAll.hidden = active;
    if (stop)   stop.hidden  = !active && !this._isRunning;
    this._syncButtonStates();
  }

  _updateCommitMsg(issue) {
    const input = this.container.querySelector('#irGitCommitMsg');
    if (!input) return;
    input.value = `Fix #${issue.id} - ${issue.title}`;
  }

  // ── Terminal ──────────────────────────────────────────────────────────

  _initTerminal() {
    const el = this.container.querySelector('#irTerminal');
    this._lastCols = 0;
    this._lastRows = 0;
    if (!el) { console.error('ir: #irTerminal not found'); return; }
    if (!window.Terminal) {
      el.style.cssText = 'display:flex;align-items:center;justify-content:center;color:#888;font-family:monospace;font-size:12px;';
      el.textContent = 'xterm.js failed to load — check DevTools console';
      return;
    }
    const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    this._fitAddon = new window.FitAddon.FitAddon();
    this._term = new window.Terminal({
      fontFamily:       'Consolas, "Cascadia Code", "Courier New", monospace',
      fontSize:         12,
      lineHeight:       1.4,
      theme: {
        background:          css('--console-bg')     || '#0d0d0d',
        foreground:          css('--console-output') || '#d4d4d4',
        cursor:              css('--console-caret')  || '#c0c0c0',
        selectionBackground: 'rgba(255,255,255,0.18)',
        black:   '#1e1e1e', brightBlack:   '#555',
        red:     '#f44747', brightRed:     '#f44747',
        green:   '#6a9955', brightGreen:   '#b5cea8',
        yellow:  '#dcdcaa', brightYellow:  '#dcdcaa',
        blue:    '#569cd6', brightBlue:    '#9cdcfe',
        magenta: '#c586c0', brightMagenta: '#c586c0',
        cyan:    '#4ec9b0', brightCyan:    '#4ec9b0',
        white:   '#d4d4d4', brightWhite:   '#ffffff',
      },
      scrollback:       5000,
      convertEol:       false,
      cursorBlink:      true,
      allowProposedApi: true,
    });
    this._term.loadAddon(this._fitAddon);
    this._term.open(el);

    el.addEventListener('paste', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = e.clipboardData?.getData('text/plain')
        || await navigator.clipboard.readText().catch(() => '');
      if (text) window.app.irPty.write(text);
    }, true);

    el.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      try { const text = await navigator.clipboard.readText(); if (text) window.app.irPty.write(text); } catch (_) {}
    });

    this._term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true;
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'c' && !ev.shiftKey) {
        const sel = this._term.getSelection();
        if (sel) { navigator.clipboard.writeText(sel).catch(() => {}); return false; }
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'v' && !ev.shiftKey) return false;
      return true;
    });

    let _inputBuf = '';
    this._term.onData(data => {
      window.app.irPty.write(data);
      if (data === '\r' || data === '\n') {
        if (_inputBuf.trim() === 'exit') this._handleClose();
        _inputBuf = '';
      } else if (data === '\x7f' || data === '\b') {
        _inputBuf = _inputBuf.slice(0, -1);
      } else if (data >= ' ') {
        _inputBuf += data;
      }
    });

    this._reattachPtyListeners();

    this._resizeObs = new ResizeObserver(() => this._fitTerminal());
    this._resizeObs.observe(el);
    this._onWinResize = () => this._fitTerminal();
    window.addEventListener('resize', this._onWinResize);

    const doFit = () => {
      try {
        this._fitAddon.fit();
        this._spawnShell();
      } catch (_) {
        setTimeout(() => { try { this._fitAddon.fit(); } catch (_2) {} this._spawnShell(); }, 80);
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(doFit));
  }

  _reattachPtyListeners() {
    window.app.irPty.onData(data => {
      if (this._term) this._term.write(data);
      if (this._activeId != null) {
        this._termBuf[this._activeId] = (this._termBuf[this._activeId] || '') + data;
      }
    });
  }

  async _spawnShell() {
    if (!this._term) return;
    if (this._modelCfg?.type !== 'cli') return;
    let cwd = this._project?.project_path || null;
    if (this._selectedIssue) {
      const resolved = await this._resolveIssueCwd(this._selectedIssue);
      if (!resolved.error && resolved.cwd) cwd = resolved.cwd;
    }
    await window.app.irPty.spawnShell({ cwd, cols: this._term.cols, rows: this._term.rows });
  }

  _fitTerminal() {
    if (!this._fitAddon || !this._term) return;
    try {
      this._fitAddon.fit();
      const { cols, rows } = this._term;
      if (cols === this._lastCols && rows === this._lastRows) return;
      this._lastCols = cols; this._lastRows = rows;
      window.app.irPty.resize({ cols, rows });
    } catch (_) {
      requestAnimationFrame(() => {
        try {
          this._fitAddon?.fit();
          if (this._term) {
            const { cols, rows } = this._term;
            if (cols === this._lastCols && rows === this._lastRows) return;
            this._lastCols = cols; this._lastRows = rows;
            window.app.irPty.resize({ cols, rows });
          }
        } catch (_2) {}
      });
    }
  }

  // ── Git panel ─────────────────────────────────────────────────────────

  _getGitCwd() {
    if (this._selectedIssue?.layer_id) {
      const layer = this._projectLayers.find(l => l.id === this._selectedIssue.layer_id);
      if (layer?.folder_path?.trim()) return layer.folder_path.trim();
    }
    return this._project?.project_path || null;
  }

  _parseGitStatus(output) {
    return output.split('\n')
      .filter(l => /^[ MADRCU?!]{2} .+/.test(l))
      .map(line => {
        const xy   = line.substring(0, 2);
        const file = line.substring(3).trim().replace(/^"(.*)"$/, '$1');
        let statusType;
        if (xy.includes('?'))      statusType = 'U';
        else if (xy.includes('A')) statusType = 'A';
        else if (xy.includes('D')) statusType = 'D';
        else if (xy.includes('R')) statusType = 'R';
        else                       statusType = 'M';
        return { xy, statusType, file };
      });
  }

  _renderDiffBody(diffText) {
    const esc = escHtml;
    if (!diffText?.trim()) return '<div class="git-diff-empty">No diff available.</div>';
    let html = '<table class="git-diff-table"><tbody>';
    let oldLine = 0, newLine = 0;
    for (const raw of diffText.split('\n')) {
      if (/^(diff --git|index |--- |\+\+\+ |Binary |new file|deleted file|old mode|new mode|rename )/.test(raw)) continue;
      if (raw.startsWith('@@')) {
        const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
        if (m) {
          oldLine = parseInt(m[1]); newLine = parseInt(m[2]);
          const hunkHeader = raw.match(/@@ [^@]+ @@/)?.[0] || raw;
          const ctx = m[3] ? esc(m[3].trim()) : '';
          html += `<tr class="gd-row gd-row--hunk"><td class="gd-ln"></td><td class="gd-ln"></td><td class="gd-code">${esc(hunkHeader)}${ctx ? ` <span class="gd-hunk-ctx">${ctx}</span>` : ''}</td></tr>`;
        }
        continue;
      }
      if (raw.startsWith('-'))      html += `<tr class="gd-row gd-row--del"><td class="gd-ln gd-ln--del">${oldLine++}</td><td class="gd-ln"></td><td class="gd-code gd-code--del"><span class="gd-sign">&#x2212;</span>${esc(raw.slice(1))}</td></tr>`;
      else if (raw.startsWith('+')) html += `<tr class="gd-row gd-row--add"><td class="gd-ln"></td><td class="gd-ln gd-ln--add">${newLine++}</td><td class="gd-code gd-code--add"><span class="gd-sign">+</span>${esc(raw.slice(1))}</td></tr>`;
      else if (raw.startsWith(' ')) html += `<tr class="gd-row gd-row--ctx"><td class="gd-ln">${oldLine++}</td><td class="gd-ln">${newLine++}</td><td class="gd-code">${esc(raw.slice(1))}</td></tr>`;
      else if (raw.startsWith('\\')) html += `<tr class="gd-row gd-row--meta"><td class="gd-ln"></td><td class="gd-ln"></td><td class="gd-code gd-code--meta">${esc(raw)}</td></tr>`;
    }
    return html + '</tbody></table>';
  }

  async _refreshGitPanel() {
    const cwd         = this._getGitCwd();
    const wrap        = this.container.querySelector('#irGitAccordion');
    const headerBadge = this.container.querySelector('#irGitBadge');
    const panelBadge  = this.container.querySelector('#irGitPanelBadge');
    const commitBtn   = this.container.querySelector('#irBtnGitCommit');
    if (!cwd || !wrap) return;

    const _updateBadges = (count) => {
      if (headerBadge) { headerBadge.textContent = String(count); headerBadge.hidden = count === 0; }
      if (panelBadge)  { panelBadge.textContent  = String(count); panelBadge.hidden  = count === 0; }
      if (commitBtn && !commitBtn.classList.contains('ir-git-commit-btn--busy')) {
        commitBtn.disabled = count === 0;
      }
    };

    try {
      const r     = await window.db.terminal.exec({ command: 'git status --short -uall 2>&1', cwd });
      const files = this._parseGitStatus(r.stdout || '');
      const noChange = files.length === this._gitFiles.length &&
        files.every((f, i) => f.file === this._gitFiles[i]?.file && f.statusType === this._gitFiles[i]?.statusType);
      if (noChange && wrap.querySelector('.git-accordion__item')) {
        _updateBadges(files.length);
        if (this._gitPanelVisible && this._gitExpandedFiles.size > 0) {
          const toReload = files.map((f, i) => ({ f, i })).filter(({ f }) => this._gitExpandedFiles.has(f.file));
          await Promise.all(toReload.map(({ f, i }) => this._loadGitDiffInto(f, i, cwd)));
        }
        wrap.querySelectorAll('.git-accordion__body').forEach(b => { b.dataset.loaded = 'false'; });
        return;
      }
      this._gitFiles = files;
      _updateBadges(files.length);
      if (this._gitPanelVisible) await this._renderGitAccordion(files, cwd);
    } catch {
      if (wrap) wrap.innerHTML = '<div class="git-diff-empty">Not a git repository.</div>';
    }
  }

  async _renderGitAccordion(files, cwd) {
    const wrap = this.container.querySelector('#irGitAccordion');
    if (!wrap) return;
    if (files.length === 0) { wrap.innerHTML = '<div class="git-diff-empty">Working tree is clean.</div>'; return; }

    wrap.innerHTML = files.map((f, i) => {
      const expanded = this._gitExpandedFiles.has(f.file);
      return `
        <div class="git-accordion__item${expanded ? '' : ' git-accordion__item--collapsed'}" data-idx="${i}">
          <button class="git-accordion__header" data-idx="${i}" aria-expanded="${expanded}" data-file="${escHtml(f.file)}">
            <span class="git-diff-file__status git-diff-file__status--${f.statusType}">${f.statusType}</span>
            <span class="git-accordion__filename">${escHtml(f.file)}</span>
            <svg class="git-accordion__chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="git-accordion__body" id="irGdBody${i}" data-loaded="false">
            ${expanded ? '<div class="git-diff-empty" style="padding:8px 14px">Loading diff…</div>' : ''}
          </div>
        </div>`;
    }).join('');

    wrap.querySelectorAll('.git-accordion__header').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx      = parseInt(btn.dataset.idx);
        const file     = btn.dataset.file;
        const body     = wrap.querySelector(`#irGdBody${idx}`);
        const item     = wrap.querySelector(`.git-accordion__item[data-idx="${idx}"]`);
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        item.classList.toggle('git-accordion__item--collapsed', expanded);
        if (!expanded) {
          this._gitExpandedFiles.add(file);
          if (body && body.dataset.loaded !== 'true') {
            body.innerHTML = '<div class="git-diff-empty" style="padding:8px 14px">Loading diff…</div>';
            const fileInfo = files[idx];
            if (fileInfo) this._loadGitDiffInto(fileInfo, idx, cwd);
          }
        } else {
          this._gitExpandedFiles.delete(file);
        }
      });
    });

    const toLoad = files.map((f, i) => ({ f, i })).filter(({ f }) => this._gitExpandedFiles.has(f.file));
    if (toLoad.length > 0) {
      await Promise.all(toLoad.map(({ f, i }) => this._loadGitDiffInto(f, i, cwd)));
    }
  }

  async _loadGitDiffInto(fileInfo, idx, cwd) {
    const body = this.container.querySelector(`#irGdBody${idx}`);
    if (!body) return;
    try {
      let diffText = '';
      if (fileInfo.statusType === 'U') {
        const r = await window.db.terminal.exec({ command: `Get-Content -Raw -Encoding UTF8 "${fileInfo.file}" 2>&1`, cwd });
        const content    = (r.stdout || '').replace(/\r\n/g, '\n');
        const addedLines = content.split('\n').map(l => `+${l}`).join('\n');
        diffText = `@@ -0,0 +1 @@\n${addedLines}`;
      } else {
        const r1 = await window.db.terminal.exec({ command: `git diff HEAD -- "${fileInfo.file}" 2>&1`, cwd });
        diffText  = (r1.stdout || '').trim();
        if (!diffText || /^(fatal|error):/i.test(diffText)) {
          const r2 = await window.db.terminal.exec({ command: `git diff --cached -- "${fileInfo.file}" 2>&1`, cwd });
          diffText  = (r2.stdout || '').trim();
        }
      }
      body.innerHTML    = this._renderDiffBody(diffText);
      body.dataset.loaded = 'true';
    } catch {
      body.innerHTML = '<div class="git-diff-error">Failed to load diff.</div>';
    }
  }

  _expandCollapseAll(expand) {
    const cwd  = this._getGitCwd();
    const wrap = this.container.querySelector('#irGitAccordion');
    if (!wrap || !cwd) return;
    wrap.querySelectorAll('.git-accordion__item').forEach((item, idx) => {
      const btn  = item.querySelector('.git-accordion__header');
      const body = item.querySelector('.git-accordion__body');
      const file = btn?.dataset.file;
      if (!btn || !body || !file) return;
      btn.setAttribute('aria-expanded', String(expand));
      item.classList.toggle('git-accordion__item--collapsed', !expand);
      if (expand) {
        this._gitExpandedFiles.add(file);
        if (body.dataset.loaded !== 'true') {
          body.innerHTML = '<div class="git-diff-empty" style="padding:8px 14px">Loading diff…</div>';
          const fileInfo = this._gitFiles[idx];
          if (fileInfo) this._loadGitDiffInto(fileInfo, idx, cwd);
        }
      } else {
        this._gitExpandedFiles.delete(file);
      }
    });
  }

  _startGitPolling() {
    this._stopGitPolling();
    this._refreshGitPanel();
    this._gitPollInterval = setInterval(() => this._refreshGitPanel(), 5000);
  }

  _stopGitPolling() {
    if (this._gitPollInterval) { clearInterval(this._gitPollInterval); this._gitPollInterval = null; }
  }

  async _commitChanges() {
    const msgEl = this.container.querySelector('#irGitCommitMsg');
    const btn   = this.container.querySelector('#irBtnGitCommit');
    const cwd   = this._getGitCwd();
    if (!cwd || !msgEl) return;
    const msg = msgEl.value.trim();
    if (!msg || this._gitFiles.length === 0) return;
    btn?.classList.add('ir-git-commit-btn--busy');
    if (btn) btn.disabled = true;
    try {
      const safeMsg = msg.replace(/'/g, "''");
      await window.db.terminal.exec({
        command: `git add -A 2>&1; git commit -m '${safeMsg}' 2>&1`,
        cwd,
      });
      this._gitExpandedFiles.clear();
      await this._refreshGitPanel();
    } catch {
      await this._refreshGitPanel();
    } finally {
      btn?.classList.remove('ir-git-commit-btn--busy');
    }
  }

  // ── Responsive layout ─────────────────────────────────────────────────

  _initLayoutObserver() {
    const layout = this.container.querySelector('.ir-layout');
    if (!layout) return;
    this._layoutObs = new ResizeObserver(entries => {
      this._applyWidthMode(entries[0].contentRect.width);
    });
    this._layoutObs.observe(layout);
  }

  _applyWidthMode(width) {
    const layout = this.container.querySelector('.ir-layout');
    const panel  = this.container.querySelector('#irGitPanel');
    const toggle = this.container.querySelector('#irBtnGitToggle');
    if (!layout) return;
    const isWide = width >= 1100;
    if (isWide === this._isWideMode) return;
    this._isWideMode = isWide;
    layout.classList.toggle('ir-layout--wide', isWide);
    if (isWide) {
      panel?.removeAttribute('hidden');
      this._gitPanelVisible = true;
      toggle?.classList.add('ir-git-toggle-btn--active');
      this._refreshGitPanel();
    } else {
      if (!this._gitPanelVisible) panel?.setAttribute('hidden', '');
      toggle?.classList.toggle('ir-git-toggle-btn--active', this._gitPanelVisible);
    }
  }

  // ── Events ────────────────────────────────────────────────────────────

  _bindEvents() {
    this.container.querySelector('#irBtnBack')
      ?.addEventListener('click', () => this._handleClose());

    this.container.querySelector('#irBtnSkipPerms')
      ?.addEventListener('click', () => {
        this._skipPermissions = !this._skipPermissions;
        const btn   = this.container.querySelector('#irBtnSkipPerms');
        const label = this.container.querySelector('#irSkipPermsLabel');
        btn?.setAttribute('aria-pressed', String(this._skipPermissions));
        btn?.classList.toggle('ir-perm-btn--on', this._skipPermissions);
        if (label) label.textContent = this._skipPermissions ? 'ON' : 'OFF';
      });

    this.container.querySelector('#irStatusFilter')
      ?.addEventListener('change', async (e) => {
        this._filterStatus = e.target.value;
        await this._loadIssues();
      });

    this.container.querySelector('#irBtnGitToggle')
      ?.addEventListener('click', () => {
        this._gitPanelVisible = !this._gitPanelVisible;
        const panel = this.container.querySelector('#irGitPanel');
        panel?.toggleAttribute('hidden', !this._gitPanelVisible);
        this.container.querySelector('#irBtnGitToggle')
          ?.classList.toggle('ir-git-toggle-btn--active', this._gitPanelVisible);
        if (this._gitPanelVisible) this._refreshGitPanel();
      });

    this.container.querySelector('#irBtnGitClose')
      ?.addEventListener('click', () => {
        this._gitPanelVisible = false;
        this.container.querySelector('#irGitPanel')?.setAttribute('hidden', '');
        this.container.querySelector('#irBtnGitToggle')?.classList.remove('ir-git-toggle-btn--active');
      });

    this.container.querySelector('#irBtnGitCommit')
      ?.addEventListener('click', () => this._commitChanges());
    this.container.querySelector('#irBtnGitRefresh')
      ?.addEventListener('click', () => this._refreshGitPanel());
    this.container.querySelector('#irBtnGitExpandAll')
      ?.addEventListener('click', () => this._expandCollapseAll(true));
    this.container.querySelector('#irBtnGitCollapseAll')
      ?.addEventListener('click', () => this._expandCollapseAll(false));

    this.container.querySelector('#irBtnRunThis')
      ?.addEventListener('click', () => {
        if (!this._isRunning && this._selectedIssue) this._runIssue(this._selectedIssue);
      });

    this.container.querySelector('#irBtnRunAll')
      ?.addEventListener('click', () => {
        if (this._isRunning) return;
        const next = this._issues.find(i =>
          (i.status === 'open' || i.status === 'in_progress') &&
          (!this._runState[i.id] || this._runState[i.id] === 'idle')
        );
        if (!next) return;
        this._doRunAll = true;
        this._updateToolbarRunAllState(true);
        this._selectIssue(next);
        this._runIssue(next, { interactive: false, skipPermissions: true });
      });

    this.container.querySelector('#irBtnStop')
      ?.addEventListener('click', async () => {
        this._doRunAll = false;
        window.app.irPty.kill();
        this._updateToolbarRunState(false);
        this._updateToolbarRunAllState(false);
        const stoppedId = this._activeId;
        this._isRunning = false;
        this._activeId  = null;
        this._stopElapsedTimer();
        window.app.irPty.offAll();
        this._reattachPtyListeners();
        if (stoppedId != null) {
          delete this._runState[stoppedId];
          const issue = this._issues.find(i => i.id === stoppedId);
          if (issue) {
            this._refreshItemEl(stoppedId);
            this._updateSummary();
            if (this._selectedId === stoppedId) this._updateStrip(issue);
          }
        }
      });

    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, select, [contenteditable]')) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === 'Enter') {
        e.preventDefault();
        this.container.querySelector('#irBtnRunAll')?.click();
      }
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey) {
        const stop = this.container.querySelector('#irBtnStop');
        if (stop && !stop.hidden) { e.preventDefault(); stop.click(); }
      }
    });
  }
}
