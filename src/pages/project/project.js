import { FeatureList } from './components/feature-list.js';
import { UserStoryList } from './components/user-story-list.js';
import { escHtml } from '../../shared/helpers.js';

export class ProjectPage {
  constructor(container, params, router) {
    this.container = container;
    this.router    = router;
    this.projectId = params.projectId;
    this._project  = null;
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  async mount() {
    this._injectCss();
    // Persist theme across page navigation
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.dataset.theme = savedTheme;
    this._project = await window.db.projects.get(this.projectId);
    this._termCwd = await window.db.terminal.homedir();
    this._folderSelected = false;
    this._currentStreamDiv = null;
    this._gitPollInterval = null;
    this._aiModel = 'claude-cli';
    this.container.innerHTML = this._template();
    this._bindEvents();
    this._initTerminal();
    await this._mountComponents();
  }

  unmount() {
    const link = document.getElementById('project-css');
    if (link) link.remove();
    window.db.terminal.removeListeners();
    this._stopGitPoll();
  }

  // ----------------------------------------------------------------
  // CSS injection
  // ----------------------------------------------------------------
  _injectCss() {
    if (!document.getElementById('project-css')) {
      const link = document.createElement('link');
      link.id   = 'project-css';
      link.rel  = 'stylesheet';
      link.href = 'pages/project/project.css';
      document.head.appendChild(link);
    }
  }

  // ----------------------------------------------------------------
  // Template
  // ----------------------------------------------------------------
  _template() {
    const name = this._project ? this._project.name : 'Project';
    const desc = this._project ? this._project.description : '';

    return `
      <div class="project-page">

        <!-- ── Top header bar ──────────────────────────────────────── -->
        <header class="project-page__header">
          <button class="project-page__back" id="btnBack" aria-label="Back to launcher">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M12 4l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="project-page__title-group">
            <h1 class="project-page__title">${name}</h1>
            ${desc ? `<p class="project-page__desc">${desc}</p>` : ''}
          </div>
          <button class="project-page__stats-btn" id="btnStatistics" title="View statistics">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="8" width="3" height="7" rx="1" stroke="currentColor" stroke-width="1.3"/>
              <rect x="6" y="4" width="3" height="11" rx="1" stroke="currentColor" stroke-width="1.3"/>
              <rect x="11" y="1" width="3" height="14" rx="1" stroke="currentColor" stroke-width="1.3"/>
            </svg>
            Statistics
          </button>
          <div class="project-page__header-actions">
            <button class="project-page__console-toggle" id="btnConsoleToggle" aria-label="Toggle console" title="Toggle Console">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <rect x="2" y="4" width="16" height="12" rx="3" stroke="currentColor" stroke-width="1.6"/>
                <path d="M6 8l3 2-3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M11 12h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              </svg>
              Console
            </button>
          </div>
        </header>

        <!-- ── Body (columns + console) ────────────────────────────── -->
        <div class="project-page__body">

          <!-- ── Three-column workspace ───────────────────────────── -->
          <div class="project-page__workspace">

            <!-- 1. Features column -->
            <aside class="project-panel" id="panelFeatures">
              <div class="project-panel__header">
                <span class="project-panel__title">Features</span>
                <div class="project-panel__actions">
                  <button class="project-panel__add" id="btnAddFeature" aria-label="Add feature" title="Add feature">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                  </button>
                  <button class="project-panel__add project-panel__toggle" id="btnToggleFeatures" aria-label="Collapse features" title="Collapse features">
                    <svg class="toggle-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="project-panel__list" id="featureList"></div>
            </aside>

            <!-- resize handle -->
            <div class="project-panel__resize" data-resize="features"></div>

            <!-- 2. User Stories column -->
            <aside class="project-panel" id="panelStories">
              <div class="project-panel__header">
                <span class="project-panel__title">User Stories</span>
                <div class="project-panel__actions">
                  <button class="project-panel__add" id="btnImportStories" aria-label="Import user stories from JSON" title="Import from JSON">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M8 10V2M5 5l3-3 3 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                    </svg>
                  </button>
                  <button class="project-panel__add" id="btnAddStory" aria-label="Add user story" title="Add user story">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="project-panel__list" id="storyList"></div>
            </aside>

            <!-- resize handle -->
            <div class="project-panel__resize" data-resize="stories"></div>

            <!-- 3. User Story Detail column -->
            <section class="project-panel project-panel--detail" id="panelDetail">
              <div class="project-panel__header">
                <span class="project-panel__title">Story Detail</span>
              </div>
              <div class="project-panel__content" id="storyDetail">
                <div class="project-panel__empty">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="12" stroke="#4b5563" stroke-width="1.4"/>
                    <path d="M16 11v5l3 3" stroke="#4b5563" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <p>Select a user story</p>
                </div>
              </div>
            </section>

          </div><!-- /.project-page__workspace -->

          <!-- resize handle for console -->
          <div class="project-panel__resize" data-resize="console"></div>

          <!-- 4. Console (collapsible) -->
          <div class="project-console" id="projectConsole">
            <div class="project-console__titlebar">
              <div class="project-console__title">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="2" width="14" height="12" rx="3" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M4 6l3 2-3 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M9 10h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                </svg>
                Console
              </div>
              <div class="project-console__actions">
                <button class="project-console__folder" id="btnConsoleFolder" title="Select folder">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                    <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
                  </svg>
                </button>
                <select class="project-console__model-select" id="aiModelSelect" title="AI Model">
                  <option value="claude-cli">Claude CLI</option>
                  <option value="gemini-cli">Gemini CLI</option>
                  <option value="claude-api" disabled>Claude API</option>
                  <option value="gemini-api" disabled>Gemini API</option>
                  <option value="chatgpt-api" disabled>ChatGPT API</option>
                </select>
                <button class="project-console__commands" id="btnConsoleCommands" title="Quick commands">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                    <path d="M5 2h7l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                    <path d="M12 2v4h4" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                    <path d="M7 9h6M7 12h6M7 15h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </button>
                <button class="project-console__git" id="btnConsoleGit" title="Git status / diff" hidden>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                    <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
                    <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
                    <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                  <span class="project-console__git-badge" id="gitBadge" hidden></span>
                </button>
                <button class="project-console__clear" id="btnConsoleClear" title="Clear console">Clear</button>
                <button class="project-console__close" id="btnConsoleClose" aria-label="Close console">&times;</button>
              </div>
            </div>
            <div class="project-console__output" id="consoleOutput">
              <span class="project-console__hint">Select a folder or type a command to start…</span>
            </div>
            <div class="project-console__input-row">
              <span class="project-console__ps-label" id="consolePromptLabel">PS ~&gt;</span>
              <div class="project-console__input-wrap">
                <textarea class="project-console__input" id="consoleInput" rows="1"
                  spellcheck="false" autocomplete="off" autocorrect="off"
                  placeholder="Enter command… (Shift+Enter for new line)"></textarea>
                <button class="project-console__cmd-picker-btn" id="btnCmdPicker" title="Pick a saved command">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    <path d="M11 10l2 2 2-2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <div class="project-console__cmd-dropdown" id="cmdPickerDropdown" hidden></div>
              </div>
              <button class="project-console__stop" id="btnConsoleStop" title="Stop running command" hidden>&#9632; Stop</button>
            </div>
          </div><!-- /.project-console -->

        </div><!-- /.project-page__body -->
      </div><!-- /.project-page -->
    `;
  }

  // ----------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------
  _bindEvents() {
    document.getElementById('btnBack')
      .addEventListener('click', () => this.router.navigate('launcher'));

    const console_ = document.getElementById('projectConsole');
    document.getElementById('btnConsoleToggle')
      .addEventListener('click', () => { console_.hidden = !console_.hidden; });
    document.getElementById('btnConsoleClose')
      .addEventListener('click', () => { console_.hidden = true; });
    document.getElementById('btnConsoleClear')
      .addEventListener('click', () => {
        const out = document.getElementById('consoleOutput');
        out.innerHTML = '<span class="project-console__hint">Select a folder or type a command to start…</span>';
      });

    document.getElementById('btnConsoleFolder')
      .addEventListener('click', async () => {
        const folderPath = await window.db.dialog.openFolder();
        if (!folderPath) return;
        this._folderSelected = true;
        document.getElementById('projectConsole').hidden = false;
        await this._runCommand(`cd "${folderPath}"`);
        document.getElementById('consoleInput').focus();
        await this._refreshGitStatus();
        this._startGitPoll();
      });

    document.getElementById('aiModelSelect')
      .addEventListener('change', (e) => { this._aiModel = e.target.value; });

    document.getElementById('btnStatistics')
      .addEventListener('click', () => this._showStatisticsModal());

    document.getElementById('btnConsoleCommands')
      .addEventListener('click', () => this._showQuickCommandsModal());

    document.getElementById('btnCmdPicker')
      .addEventListener('click', (e) => { e.stopPropagation(); this._toggleCmdPickerDropdown(); });

    document.addEventListener('click', () => {
      const dd = document.getElementById('cmdPickerDropdown');
      if (dd) dd.hidden = true;
    });

    document.getElementById('btnConsoleGit')
      .addEventListener('click', async () => {
        await this._showGitDiffModal();
      });

    const consoleInput = document.getElementById('consoleInput');

    const autoResize = (el) => {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 100) + 'px';
    };
    consoleInput.addEventListener('input', () => autoResize(consoleInput));

    consoleInput.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return; // Shift+Enter → newline
      e.preventDefault();
      const cmd = consoleInput.value.trim();
      if (!cmd) return;
      consoleInput.value = '';
      consoleInput.style.height = 'auto';
      await this._runCommand(cmd);
    });

    document.getElementById('btnConsoleStop')
      .addEventListener('click', async () => {
        await window.db.terminal.killActive();
      });

    this._initResizable();
    this._initFeatureToggle();
  }

  // ----------------------------------------------------------------
  // Components
  // ----------------------------------------------------------------
  async _mountComponents() {
    this._storyList = new UserStoryList({
      listEl:                  document.getElementById('storyList'),
      addBtn:                  document.getElementById('btnAddStory'),
      importBtn:               document.getElementById('btnImportStories'),
      detailEl:                document.getElementById('storyDetail'),
      projectId:               this.projectId,
      getModel:                () => this._aiModel,
      onSelect:                (_story) => {},
      onRunCommand:            (cmd) => {
        document.getElementById('projectConsole').hidden = false;
        if (!this._folderSelected) { this._warnNoFolder(); return; }
        this._runCommand(cmd);
      },
      onRunCommandExternal:    (cmd) => {
        if (!this._folderSelected) {
          document.getElementById('projectConsole').hidden = false;
          this._warnNoFolder();
          return;
        }
        window.db.terminal.openExternal({ command: cmd, cwd: this._termCwd });
      },
    });
    await this._storyList.mount();

    this._featureList = new FeatureList({
      listEl:    document.getElementById('featureList'),
      addBtn:    document.getElementById('btnAddFeature'),
      projectId: this.projectId,
      onSelect:  (feature) => {
        this._storyList.load(feature.id);
      },
    });
    await this._featureList.mount();
  }

  // ----------------------------------------------------------------
  // Terminal helpers
  // ----------------------------------------------------------------
  _stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  }

  _updatePromptLabel() {
    const label = document.getElementById('consolePromptLabel');
    if (label) label.textContent = `PS ${this._termCwd}>`;
  }

  _warnNoFolder() {
    const out = document.getElementById('consoleOutput');
    if (!out) return;
    const hint = out.querySelector('.project-console__hint');
    if (hint) hint.remove();
    const div = document.createElement('div');
    div.className = 'project-console__line project-console__line--warn';
    div.innerHTML =
      `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;margin-top:1px">` +
      `<path d="M8 2L14 13H2L8 2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<path d="M8 6v3M8 11v.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>` +
      `</svg>` +
      `<span>No project folder selected. Click the <strong>folder icon</strong> in the console toolbar to select a folder first.</span>`;
    out.appendChild(div);
    out.scrollTop = out.scrollHeight;
  }

  // ----------------------------------------------------------------
  // Statistics modal
  // ----------------------------------------------------------------
  async _showStatisticsModal() {
    document.querySelector('.stats-overlay')?.remove();

    const [stories, features, statuses] = await Promise.all([
      window.db.userStories.list({ project_id: this.projectId }),
      window.db.features.list(this.projectId),
      window.db.status.list(),
    ]);

    const totalStories  = stories.length;
    const totalFeatures = features.length;

    const overlay = document.createElement('div');
    overlay.className = 'stats-overlay';
    overlay.innerHTML = `
      <div class="stats-modal">
        <div class="stats-modal__header">
          <span class="stats-modal__title">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="8" width="3" height="7" rx="1" stroke="currentColor" stroke-width="1.3"/>
              <rect x="6" y="4" width="3" height="11" rx="1" stroke="currentColor" stroke-width="1.3"/>
              <rect x="11" y="1" width="3" height="14" rx="1" stroke="currentColor" stroke-width="1.3"/>
            </svg>
            Statistics
          </span>
          <button class="stats-modal__close" id="btnStatsClose">&times;</button>
        </div>
        <div class="stats-modal__body">

          <!-- User Stories section -->
          <div class="stats-section">
            <div class="stats-section__header">
              <span class="stats-section__label">User Stories</span>
              <span class="stats-section__count">${totalStories}</span>
            </div>
            ${totalStories === 0
              ? `<div class="stats-empty">No user stories yet.</div>`
              : `<canvas id="statsChartStories" class="stats-chart"></canvas>`
            }
          </div>

          <!-- Features section -->
          <div class="stats-section">
            <div class="stats-section__header">
              <span class="stats-section__label">Features</span>
              <span class="stats-section__count">${totalFeatures}</span>
            </div>
            ${totalFeatures === 0
              ? `<div class="stats-empty">No features yet.</div>`
              : `<canvas id="statsChartFeatures" class="stats-chart"></canvas>`
            }
          </div>

        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#btnStatsClose').addEventListener('click', () => overlay.remove());

    if (totalStories  > 0) this._drawStatsChart('statsChartStories',  stories,  statuses);
    if (totalFeatures > 0) this._drawStatsChart('statsChartFeatures', features, statuses);
  }

  _drawStatsChart(canvasId, stories, statuses) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Count items per status
    const counts = {};
    for (const s of stories) {
      const label = s.status_name || 'No Status';
      counts[label] = (counts[label] || 0) + 1;
    }

    // Order by statuses list, then any unlisted
    const ordered = [];
    for (const st of statuses) {
      if (counts[st.name] !== undefined) ordered.push({ label: st.name, count: counts[st.name] });
    }
    if (counts['No Status']) ordered.push({ label: 'No Status', count: counts['No Status'] });
    if (ordered.length === 0) return;

    // Canvas sizing
    const DPR = window.devicePixelRatio || 1;
    const W   = canvas.offsetWidth  || 480;
    const H   = canvas.offsetHeight || 220;
    canvas.width  = W * DPR;
    canvas.height = H * DPR;
    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);

    const PAD    = { top: 24, right: 16, bottom: 48, left: 40 };
    const cw     = W - PAD.left - PAD.right;
    const ch     = H - PAD.top  - PAD.bottom;
    const n      = ordered.length;
    const maxY   = Math.max(...ordered.map(p => p.count), 1);
    const slot   = cw / n;
    const BAR_W  = Math.max(8, Math.min(48, slot * 0.55));
    const yOf    = (v) => PAD.top + ch - (v / maxY) * ch;
    const barX   = (i) => PAD.left + slot * i + (slot - BAR_W) / 2;

    // Horizontal grid + Y labels
    const yTicks = Math.min(maxY, 4);
    for (let t = 0; t <= yTicks; t++) {
      const v = Math.round((maxY / yTicks) * t);
      const y = yOf(v);
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cw, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 0.5; ctx.stroke();
      ctx.fillStyle   = 'rgba(255,255,255,0.35)';
      ctx.font        = '10px system-ui,sans-serif';
      ctx.textAlign   = 'right';
      ctx.fillText(v, PAD.left - 6, y + 3);
    }

    // Bars
    for (let i = 0; i < n; i++) {
      const { label, count } = ordered[i];
      const x    = barX(i);
      const barH = (count / maxY) * ch;
      const y    = PAD.top + ch - barH;
      const cx   = x + BAR_W / 2; // center of bar for labels

      // Bar with rounded top
      const r = Math.min(4, BAR_W / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + BAR_W - r, y);
      ctx.quadraticCurveTo(x + BAR_W, y, x + BAR_W, y + r);
      ctx.lineTo(x + BAR_W, y + barH);
      ctx.lineTo(x,         y + barH);
      ctx.lineTo(x,         y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();

      // Gradient fill
      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      grad.addColorStop(0, '#f97316');
      grad.addColorStop(1, 'rgba(249,115,22,0.3)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Count label above bar
      ctx.fillStyle = '#f97316';
      ctx.font      = 'bold 11px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(count, cx, y - 6);

      // Status label on X axis (two lines if needed)
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font      = '10px system-ui,sans-serif';
      const words = label.split(' ');
      let line1 = '', line2 = '';
      for (const w of words) {
        if ((line1 + ' ' + w).trim().length <= 10) line1 = (line1 + ' ' + w).trim();
        else line2 = (line2 + ' ' + w).trim();
      }
      ctx.fillText(line1, cx, H - PAD.bottom + 14);
      if (line2) ctx.fillText(line2, cx, H - PAD.bottom + 25);
    }
  }

  // ----------------------------------------------------------------
  // Command picker dropdown (inline in input row)
  // ----------------------------------------------------------------
  async _toggleCmdPickerDropdown() {
    const dd = document.getElementById('cmdPickerDropdown');
    if (!dd) return;

    if (!dd.hidden) { dd.hidden = true; return; }

    const commands = await window.db.quickCommands.list();
    if (commands.length === 0) {
      dd.innerHTML = `<div class="cmd-picker__empty">No saved commands. Use the commands toolbar button to add some.</div>`;
    } else {
      dd.innerHTML = commands.map(c => `
        <div class="cmd-picker__item" data-cmd="${escHtml(c.command)}">
          <span class="cmd-picker__cmd">${escHtml(c.command)}</span>
          ${c.description ? `<span class="cmd-picker__desc">${escHtml(c.description)}</span>` : ''}
        </div>
      `).join('');

      dd.querySelectorAll('.cmd-picker__item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          dd.hidden = true;
          this._applyQuickCommand(item.dataset.cmd);
        });
      });
    }

    dd.hidden = false;
  }

  // ----------------------------------------------------------------
  // Quick command helpers
  // ----------------------------------------------------------------

  /** Shows a small centered input dialog; resolves with the typed string or null if cancelled. */
  _promptInlineInput() {
    return new Promise((resolve) => {
      document.querySelector('.qcmd-inline-prompt')?.remove();

      const prompt = document.createElement('div');
      prompt.className = 'qcmd-inline-prompt';
      prompt.innerHTML = `
        <div class="qcmd-inline-prompt__box">
          <div class="qcmd-inline-prompt__label">Enter value for <code>{{input}}</code></div>
          <div class="qcmd-inline-prompt__row">
            <input class="qcmd-inline-prompt__input" type="text" placeholder="Type value…" autocomplete="off"/>
            <button class="qcmd-inline-prompt__ok">Run</button>
            <button class="qcmd-inline-prompt__cancel">✕</button>
          </div>
        </div>
      `;
      document.body.appendChild(prompt);

      const input = prompt.querySelector('.qcmd-inline-prompt__input');
      input.focus();

      const finish = (val) => { prompt.remove(); resolve(val); };

      prompt.querySelector('.qcmd-inline-prompt__ok').addEventListener('click', () => finish(input.value));
      prompt.querySelector('.qcmd-inline-prompt__cancel').addEventListener('click', () => finish(null));
      prompt.addEventListener('click', (e) => { if (e.target === prompt) finish(null); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finish(input.value);
        if (e.key === 'Escape') finish(null);
      });
    });
  }

  /** Resolves {{input}} placeholders (prompts user if needed), sets consoleInput, and executes. */
  async _applyQuickCommand(rawCmd) {
    let cmd = rawCmd;
    if (rawCmd.includes('{{input}}')) {
      const value = await this._promptInlineInput();
      if (value === null) return; // user cancelled
      cmd = rawCmd.replaceAll('{{input}}', value);
    }
    const consoleInput = document.getElementById('consoleInput');
    if (consoleInput) {
      consoleInput.value = cmd;
      consoleInput.dispatchEvent(new Event('input'));
    }
    await this._runCommand(cmd);
    if (consoleInput) {
      consoleInput.value = '';
      consoleInput.style.height = 'auto';
    }
  }

  // ----------------------------------------------------------------
  // Quick commands modal
  // ----------------------------------------------------------------
  async _showQuickCommandsModal() {
    document.querySelector('.qcmd-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'qcmd-overlay';
    overlay.innerHTML = `
      <div class="qcmd-modal">
        <div class="qcmd-header">
          <div class="qcmd-header__title">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <circle cx="4" cy="6"  r="1.5" fill="currentColor"/>
              <circle cx="4" cy="10" r="1.5" fill="currentColor"/>
              <circle cx="4" cy="14" r="1.5" fill="currentColor"/>
              <path d="M8 6h8M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            Quick Commands
          </div>
          <div class="qcmd-header__actions">
            <button class="qcmd-add-btn" id="btnQcmdAdd">+ Add</button>
            <button class="qcmd-close" aria-label="Close">&times;</button>
          </div>
        </div>
        <div class="qcmd-body" id="qcmdBody"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => { overlay.remove(); };
    overlay.querySelector('.qcmd-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    const escFn = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escFn); } };
    document.addEventListener('keydown', escFn);

    const body = overlay.querySelector('#qcmdBody');
    overlay.querySelector('#btnQcmdAdd').addEventListener('click', () => this._renderQcmdForm(overlay, body, null));

    await this._renderQcmdList(overlay, body);
  }

  async _renderQcmdList(overlay, body) {
    const commands = await window.db.quickCommands.list();
    if (commands.length === 0) {
      body.innerHTML = `<div class="qcmd-empty">No commands yet. Click <strong>+ Add</strong> to create one.</div>`;
      return;
    }
    body.innerHTML = `
      <div class="qcmd-list">
        ${commands.map(c => `
          <div class="qcmd-item" data-id="${c.id}">
            <div class="qcmd-item__main">
              <span class="qcmd-item__cmd">${escHtml(c.command)}</span>
              ${c.description ? `<span class="qcmd-item__desc">${escHtml(c.description)}</span>` : ''}
            </div>
            <div class="qcmd-item__actions">
              <button class="qcmd-item__btn qcmd-item__btn--copy" data-cmd="${escHtml(c.command)}" title="Copy to clipboard">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <rect x="5" y="5" width="9" height="10" rx="2" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M11 5V3a2 2 0 00-2-2H3a2 2 0 00-2 2v6a2 2 0 002 2h2" stroke="currentColor" stroke-width="1.4"/>
                </svg>
              </button>
              <button class="qcmd-item__btn qcmd-item__btn--edit" data-id="${c.id}" title="Edit">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                </svg>
              </button>
              <button class="qcmd-item__btn qcmd-item__btn--delete" data-id="${c.id}" title="Delete">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8M5.5 6v4M8.5 6v4"
                    stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Run command (copy to console input + execute)
    body.querySelectorAll('.qcmd-item__btn--copy').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cmd = btn.dataset.cmd;
        // Close the modal so the console is visible while command runs
        const modalOverlay = btn.closest('.qcmd-overlay');
        if (modalOverlay) modalOverlay.remove();
        await this._applyQuickCommand(cmd);
      });
    });

    // Edit
    body.querySelectorAll('.qcmd-item__btn--edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id  = parseInt(btn.dataset.id, 10);
        const cmd = commands.find(c => c.id === id);
        if (cmd) this._renderQcmdForm(overlay, body, cmd);
      });
    });

    // Delete
    body.querySelectorAll('.qcmd-item__btn--delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        await window.db.quickCommands.delete(parseInt(btn.dataset.id, 10));
        await this._renderQcmdList(overlay, body);
      });
    });
  }

  _renderQcmdForm(overlay, body, cmd) {
    const isEdit = !!cmd;
    body.innerHTML = `
      <div class="qcmd-form">
        <div class="qcmd-form__field">
          <label class="qcmd-form__label">Command <span style="color:#ef4444">*</span></label>
          <input class="qcmd-form__input" id="qcmdInputCmd" type="text"
            placeholder="e.g. tree src /f" autocomplete="off"
            value="${isEdit ? escHtml(cmd.command) : ''}"/>
        </div>
        <div class="qcmd-form__field">
          <label class="qcmd-form__label">Description</label>
          <input class="qcmd-form__input" id="qcmdInputDesc" type="text"
            placeholder="e.g. List all files in src folder" autocomplete="off"
            value="${isEdit ? escHtml(cmd.description || '') : ''}"/>
        </div>
        <div class="qcmd-form__actions">
          <button class="qcmd-form__btn qcmd-form__btn--cancel">Cancel</button>
          <button class="qcmd-form__btn qcmd-form__btn--save">${isEdit ? 'Save' : 'Add Command'}</button>
        </div>
      </div>
    `;

    const cmdInput  = body.querySelector('#qcmdInputCmd');
    const descInput = body.querySelector('#qcmdInputDesc');
    const saveBtn   = body.querySelector('.qcmd-form__btn--save');
    cmdInput.focus();

    body.querySelector('.qcmd-form__btn--cancel')
      .addEventListener('click', () => this._renderQcmdList(overlay, body));

    const save = async () => {
      const command = cmdInput.value.trim();
      if (!command) { cmdInput.style.outline = '1px solid #ef4444'; cmdInput.focus(); return; }
      cmdInput.style.outline = '';
      saveBtn.disabled = true;
      if (isEdit) {
        await window.db.quickCommands.update({ id: cmd.id, command, description: descInput.value.trim() || null });
      } else {
        await window.db.quickCommands.create({ command, description: descInput.value.trim() || null });
      }
      await this._renderQcmdList(overlay, body);
    };

    saveBtn.addEventListener('click', save);
    [cmdInput, descInput].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') save(); }));
  }

  // ----------------------------------------------------------------
  // Git diff modal
  // ----------------------------------------------------------------
  async _showGitDiffModal() {
    let statusResult;
    try {
      statusResult = await window.db.terminal.exec({
        command: 'git status --short 2>&1',
        cwd: this._termCwd,
      });
    } catch { return; }

    const files = this._parseGitStatus(statusResult.stdout || '');
    if (files.length === 0) return;

    // Remove existing modal if any
    document.querySelector('.git-diff-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'git-diff-overlay';
    overlay.innerHTML = `
      <div class="git-diff-modal">
        <div class="git-diff-header">
          <div class="git-diff-header__title">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <circle cx="5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="15" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="5" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
              <path d="M5 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M15 7c0 4-4 6-10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            Git Changes
            <span class="git-diff-header__count">${files.length}</span>
          </div>
          <button class="git-diff-close" aria-label="Close">&times;</button>
        </div>
        <div class="git-diff-body">
          <div class="git-diff-files" id="gitDiffFiles">
            ${files.map((f, i) => `
              <div class="git-diff-file${i === 0 ? ' git-diff-file--active' : ''}" data-idx="${i}">
                <span class="git-diff-file__status git-diff-file__status--${f.statusType}">${f.statusType}</span>
                <span class="git-diff-file__name" title="${escHtml(f.file)}">${escHtml(f.file)}</span>
              </div>
            `).join('')}
          </div>
          <div class="git-diff-view" id="gitDiffView">
            <div class="git-diff-loading">Loading…</div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.git-diff-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    const escHandler = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);

    overlay.querySelectorAll('.git-diff-file').forEach(el => {
      el.addEventListener('click', async () => {
        overlay.querySelectorAll('.git-diff-file').forEach(f => f.classList.remove('git-diff-file--active'));
        el.classList.add('git-diff-file--active');
        await this._loadFileDiff(overlay, files[parseInt(el.dataset.idx)]);
      });
    });

    await this._loadFileDiff(overlay, files[0]);
  }

  _parseGitStatus(output) {
    return output.split('\n')
      .filter(l => l.trim())
      .map(line => {
        const xy   = line.substring(0, 2);
        const file = line.substring(3).trim().replace(/^"(.*)"$/, '$1'); // unquote git-quoted paths
        let statusType;
        if (xy.includes('?'))      statusType = 'U'; // untracked
        else if (xy.includes('A')) statusType = 'A'; // added
        else if (xy.includes('D')) statusType = 'D'; // deleted
        else if (xy.includes('R')) statusType = 'R'; // renamed
        else                       statusType = 'M'; // modified
        return { xy, statusType, file };
      });
  }

  async _loadFileDiff(overlay, fileInfo) {
    const view = overlay.querySelector('#gitDiffView');
    view.innerHTML = '<div class="git-diff-loading">Loading…</div>';
    try {
      let diffText = '';
      if (fileInfo.statusType === 'U') {
        // Untracked — show full file content as all-added
        const r = await window.db.terminal.exec({
          command: `Get-Content -Raw -Encoding UTF8 "${fileInfo.file}" 2>&1`,
          cwd: this._termCwd,
        });
        const content = (r.stdout || '').replace(/\r\n/g, '\n');
        const addedLines = content.split('\n').map((l, i) => `+${l}`).join('\n');
        diffText = `@@ -0,0 +1 @@\n${addedLines}`;
      } else {
        // Try unstaged diff first, then staged
        const r1 = await window.db.terminal.exec({
          command: `git diff HEAD -- "${fileInfo.file}" 2>&1`,
          cwd: this._termCwd,
        });
        diffText = (r1.stdout || '').trim();
        if (!diffText) {
          const r2 = await window.db.terminal.exec({
            command: `git diff --cached -- "${fileInfo.file}" 2>&1`,
            cwd: this._termCwd,
          });
          diffText = (r2.stdout || '').trim();
        }
      }
      view.innerHTML = this._renderDiff(diffText, fileInfo.file);
    } catch {
      view.innerHTML = '<div class="git-diff-error">Failed to load diff.</div>';
    }
  }

  _renderDiff(diffText, filename) {
    const esc = escHtml;
    let html = `<div class="git-diff-filename">${esc(filename)}</div>`;

    if (!diffText || !diffText.trim()) {
      return html + '<div class="git-diff-empty">No diff available.</div>';
    }

    html += '<table class="git-diff-table"><tbody>';

    let oldLine = 0, newLine = 0;
    for (const raw of diffText.split('\n')) {
      // Skip standard unified diff header lines
      if (/^(diff --git|index |--- |\+\+\+ |Binary |new file|deleted file|old mode|new mode|rename )/.test(raw)) continue;

      if (raw.startsWith('@@')) {
        const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
        if (m) {
          oldLine = parseInt(m[1]);
          newLine = parseInt(m[2]);
          const ctx = m[3] ? esc(m[3].trim()) : '';
          html += `<tr class="gd-row gd-row--hunk">
            <td class="gd-ln"></td><td class="gd-ln"></td>
            <td class="gd-code">${esc(raw)}${ctx ? ` <span class="gd-hunk-ctx">${ctx}</span>` : ''}</td>
          </tr>`;
        }
        continue;
      }

      if (raw.startsWith('-')) {
        html += `<tr class="gd-row gd-row--del">
          <td class="gd-ln gd-ln--del">${oldLine++}</td><td class="gd-ln"></td>
          <td class="gd-code gd-code--del"><span class="gd-sign">−</span>${esc(raw.slice(1))}</td>
        </tr>`;
      } else if (raw.startsWith('+')) {
        html += `<tr class="gd-row gd-row--add">
          <td class="gd-ln"></td><td class="gd-ln gd-ln--add">${newLine++}</td>
          <td class="gd-code gd-code--add"><span class="gd-sign">+</span>${esc(raw.slice(1))}</td>
        </tr>`;
      } else if (raw.startsWith(' ')) {
        html += `<tr class="gd-row gd-row--ctx">
          <td class="gd-ln">${oldLine++}</td><td class="gd-ln">${newLine++}</td>
          <td class="gd-code">${esc(raw.slice(1))}</td>
        </tr>`;
      } else if (raw.startsWith('\\')) {
        html += `<tr class="gd-row gd-row--meta">
          <td class="gd-ln"></td><td class="gd-ln"></td>
          <td class="gd-code gd-code--meta">${esc(raw)}</td>
        </tr>`;
      }
    }

    html += '</tbody></table>';
    return html;
  }

  _startGitPoll() {
    this._stopGitPoll();
    this._gitPollInterval = setInterval(() => this._refreshGitStatus(), 10000);
  }

  _stopGitPoll() {
    if (this._gitPollInterval) {
      clearInterval(this._gitPollInterval);
      this._gitPollInterval = null;
    }
  }

  async _refreshGitStatus() {
    const btn   = document.getElementById('btnConsoleGit');
    const badge = document.getElementById('gitBadge');
    if (!btn || !badge) return;
    try {
      const result = await window.db.terminal.exec({
        command: 'git status --short 2>&1',
        cwd: this._termCwd,
      });
      const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim());
      btn.hidden = false;
      if (lines.length > 0) {
        badge.textContent = lines.length;
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    } catch {
      btn.hidden = true;
    }
  }

  _setRunning(running) {
    const input   = document.getElementById('consoleInput');
    const stopBtn = document.getElementById('btnConsoleStop');
    const label   = document.getElementById('consolePromptLabel');
    if (running) {
      input.disabled = true;
      input.placeholder = 'Running…';
      if (stopBtn) stopBtn.hidden = false;
      if (label)   label.textContent = '…';
    } else {
      input.disabled = false;
      input.style.height = 'auto';
      input.placeholder = 'Enter command… (Shift+Enter for new line)';
      if (stopBtn) stopBtn.hidden = true;
      this._updatePromptLabel();
      input.focus();
    }
  }

  _appendPromptLine(cmd) {
    const out = document.getElementById('consoleOutput');
    const hint = out.querySelector('.project-console__hint');
    if (hint) hint.remove();
    const div = document.createElement('div');
    div.className = 'project-console__line project-console__line--prompt';
    div.innerHTML =
      `<span class="project-console__ps-prompt">PS ${this._termCwd}&gt;</span>` +
      `<span class="project-console__ps-cmd"> ${cmd}</span>`;
    out.appendChild(div);
    out.scrollTop = out.scrollHeight;
    return out;
  }

  _initTerminal() {
    this._outputBuffer  = [];
    this._rafPending    = false;

    const flushBuffer = () => {
      this._rafPending = false;
      if (!this._outputBuffer.length) return;
      const items    = this._outputBuffer.splice(0);
      const target   = this._currentStreamDiv;
      if (!target) return;
      const fragment = document.createDocumentFragment();
      for (const { text, isErr } of items) {
        const span = document.createElement('span');
        if (isErr) span.className = 'project-console__stderr';
        span.textContent = text;
        fragment.appendChild(span);
      }
      target.appendChild(fragment);
      const out = document.getElementById('consoleOutput');
      if (out) out.scrollTop = out.scrollHeight;
    };

    window.db.terminal.onData(({ text, stream }) => {
      if (!this._currentStreamDiv) return;
      if (this._spinnerEl) { this._spinnerEl.remove(); this._spinnerEl = null; }
      const clean = this._stripAnsi(text);
      if (!clean) return;
      this._outputBuffer.push({ text: clean, isErr: stream === 'stderr' });
      if (!this._rafPending) {
        this._rafPending = true;
        requestAnimationFrame(flushBuffer);
      }
    });

    window.db.terminal.onDone(() => {
      flushBuffer(); // flush anything still in the buffer
      if (this._spinnerEl) { this._spinnerEl.remove(); this._spinnerEl = null; }
      this._currentStreamDiv = null;
      this._setRunning(false);
      if (this._folderSelected) this._refreshGitStatus();
    });
  }

  async _runCommand(cmd) {
    const out = this._appendPromptLine(cmd);

    // Handle `cd` locally — quick path resolution, no streaming needed
    if (/^cd(\s|$)/i.test(cmd.trim())) {
      const target = cmd.trim().replace(/^cd\s*/i, '').replace(/^["']|["']$/g, '');
      if (!target) return;
      const result = await window.db.terminal.exec({
        command: `Set-Location "${target}"; (Get-Location).Path`,
        cwd: this._termCwd,
      });
      if (result.exitCode === 0 && result.stdout.trim()) {
        this._termCwd = result.stdout.trim();
        this._updatePromptLabel();
      } else {
        const errDiv = document.createElement('div');
        errDiv.className = 'project-console__line project-console__line--error';
        errDiv.textContent = this._stripAnsi(result.stderr || `cd: cannot find path '${target}'`);
        out.appendChild(errDiv);
        out.scrollTop = out.scrollHeight;
      }
      return;
    }

    // All other commands — streaming, no timeout
    const streamDiv = document.createElement('div');
    streamDiv.className = 'project-console__stream-block';
    out.appendChild(streamDiv);

    // Spinner shown until first output chunk arrives
    const spinner = document.createElement('span');
    spinner.className = 'project-console__spinner';
    streamDiv.appendChild(spinner);
    this._spinnerEl = spinner;
    this._currentStreamDiv = streamDiv;

    out.scrollTop = out.scrollHeight;
    this._setRunning(true);
    await window.db.terminal.execStart({ command: cmd, cwd: this._termCwd });
    // output arrives via onData / onDone listeners set up in _initTerminal
  }

  // ----------------------------------------------------------------
  // ----------------------------------------------------------------
  // Features panel collapse/expand toggle
  // ----------------------------------------------------------------
  _initFeatureToggle() {
    const panel       = document.getElementById('panelFeatures');
    const toggleBtn   = document.getElementById('btnToggleFeatures');
    const resizeHandle = panel.nextElementSibling; // the drag handle after the panel
    const icon        = toggleBtn.querySelector('.toggle-icon');

    let savedFlex = panel.style.flex || '0 0 18%';

    toggleBtn.addEventListener('click', () => {
      const isCollapsed = panel.classList.toggle('project-panel--collapsed');

      if (isCollapsed) {
        savedFlex = panel.style.flex || '0 0 18%';
        panel.style.flex = '0 0 32px';
        resizeHandle.style.display = 'none';
        toggleBtn.title = 'Expand features';
        toggleBtn.setAttribute('aria-label', 'Expand features');
        // Point chevron right (expand direction)
        icon.innerHTML = '<path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
      } else {
        panel.style.flex = savedFlex;
        resizeHandle.style.display = '';
        toggleBtn.title = 'Collapse features';
        toggleBtn.setAttribute('aria-label', 'Collapse features');
        // Point chevron left (collapse direction)
        icon.innerHTML = '<path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
      }
    });
  }

  // ----------------------------------------------------------------
  // Resizable panels
  // ----------------------------------------------------------------
  _initResizable() {
    const PANEL_MAP = {
      features: { el: document.getElementById('panelFeatures'),  min: 120, dir:  1 },
      stories:  { el: document.getElementById('panelStories'),   min: 120, dir:  1 },
      console:  { el: document.getElementById('projectConsole'), min: 180, dir: -1 },
    };

    document.querySelectorAll('.project-panel__resize').forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        const entry = PANEL_MAP[handle.dataset.resize];
        if (!entry) return;

        e.preventDefault();
        const startX      = e.clientX;
        const startWidth  = entry.el.getBoundingClientRect().width;
        // Capture parent width once at drag-start so the % reference is stable
        const parentWidth = entry.el.parentElement.getBoundingClientRect().width;

        document.body.style.userSelect = 'none';
        document.body.style.cursor     = 'col-resize';

        const onMove = (ev) => {
          const delta    = (ev.clientX - startX) * entry.dir;
          const newPx    = Math.max(entry.min, startWidth + delta);
          // Store as % of parent so the ratio is maintained on window resize
          entry.el.style.flex = `0 0 ${(newPx / parentWidth) * 100}%`;
        };

        const onUp = () => {
          document.body.style.userSelect = '';
          document.body.style.cursor     = '';
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup',   onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
      });
    });
  }
}
