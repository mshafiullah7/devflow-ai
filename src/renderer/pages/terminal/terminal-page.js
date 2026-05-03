import { escHtml, injectCss, removeCss } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { TerminalController } from '../../components/terminal/terminal-controller.js';

export class TerminalPage {
  constructor(container, params, router) {
    this.container  = container;
    this.router     = router;
    this._projectId = params.projectId;
    this._project   = null;
    this._term      = null;
  }

  async mount() {
    injectCss('pages/terminal/terminal-page.css');
    applyStoredTheme();

    this._project = await window.db.projects.get(this._projectId);
    this.container.innerHTML = this._template();

    this._term = new TerminalController({ initialCwd: this._project?.project_path || '' });
    this._term.mount();
    this._term.folderSelected = !!this._project?.project_path;

    this._bindEvents();

    if (!this._project?.project_path) {
      this._term.warnNoFolder();
    }
  }

  unmount() {
    removeCss('pages/terminal/terminal-page.css');
    this._term?.unmount();
  }

  _template() {
    const name = this._project ? escHtml(this._project.name) : 'Project';
    const cwd  = this._project?.project_path || '';
    return `
      <div class="term-page">
        <header class="term-page__header">
          <button class="term-page__back" id="termPageBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div class="term-page__title-group">
            <div class="term-page__title">${name}</div>
            <div class="term-page__subtitle">Terminal</div>
          </div>
        </header>

        <div class="term-page__body">
          <div class="term-page__console">
            <div class="project-console__titlebar">
              <div class="project-console__title">
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                  <path d="M3 5l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M10 15h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                </svg>
                <span class="project-console__title-text">Console</span>
              </div>
              <div class="project-console__actions">
                <div class="project-console__menu-wrap">
                  <button class="project-console__menu-btn" id="termMenuBtn" title="Console options">
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="4"  r="1.3" fill="currentColor"/>
                      <circle cx="10" cy="10" r="1.3" fill="currentColor"/>
                      <circle cx="10" cy="16" r="1.3" fill="currentColor"/>
                    </svg>
                  </button>
                  <div class="project-console__menu-dropdown" id="termMenuDropdown" hidden>
                    <button class="console-menu__item" id="termClearBtn">
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                        <path d="M4 4l12 12M4 16L16 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                      </svg>
                      Clear output
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="project-console__output" id="consoleOutput">
              <div class="project-console__hint">Run commands in your project folder.</div>
            </div>

            <div class="project-console__input-row">
              <div class="project-console__ps-label" id="consolePromptLabel">PS ${escHtml(cwd)}></div>
              <div class="project-console__input-cmd-row">
                <div class="project-console__input-wrap">
                  <textarea
                    class="project-console__input"
                    id="consoleInput"
                    rows="1"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="Enter command… (Shift+Enter for new line)"
                  ></textarea>
                  <button class="project-console__cmd-picker-btn" id="btnCmdPicker" title="Quick commands">
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                      <path d="M4 7l6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                  <div class="project-console__cmd-dropdown" id="cmdPickerDropdown" hidden></div>
                </div>
                <button class="project-console__stop" id="btnConsoleStop" hidden>Stop</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    this.container.querySelector('#termPageBack')
      .addEventListener('click', () => this.router.navigate('project-home', { projectId: this._projectId }));

    const input = this.container.querySelector('#consoleInput');
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight}px`;
    });
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (this._term.isRunning) {
          await window.db.terminal.sendStdin(input.value + '\n');
          input.value = '';
          input.style.height = 'auto';
          return;
        }
        const cmd = input.value.trim();
        if (!cmd) return;
        input.value = '';
        input.style.height = 'auto';
        if (this._term.aiMode && !/^\/p\s/i.test(cmd)) {
          await this._term.runCommand(`/p ${cmd}`);
        } else {
          await this._term.runCommand(cmd);
        }
      }
    });

    this.container.querySelector('#btnConsoleStop')
      .addEventListener('click', () => window.db.terminal.kill());

    this.container.querySelector('#btnCmdPicker')
      .addEventListener('click', (e) => { e.stopPropagation(); this._term.toggleCmdPickerDropdown(); });

    document.addEventListener('click', () => {
      const dd = this.container.querySelector('#cmdPickerDropdown');
      if (dd) dd.hidden = true;
      const menuDd = this.container.querySelector('#termMenuDropdown');
      if (menuDd) menuDd.hidden = true;
    }, { capture: true });

    this.container.querySelector('#termMenuBtn')
      .addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = this.container.querySelector('#termMenuDropdown');
        dd.hidden = !dd.hidden;
      });

    this.container.querySelector('#termClearBtn')
      .addEventListener('click', () => {
        const out = this.container.querySelector('#consoleOutput');
        if (out) out.innerHTML = '';
        this.container.querySelector('#termMenuDropdown').hidden = true;
      });
  }
}
