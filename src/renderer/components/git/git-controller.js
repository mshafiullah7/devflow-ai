import { injectCss } from '../../shared/helpers.js';

export class GitController {
  constructor({ getTermCwd, gitBtnId = 'btnConsoleGit', gitBadgeId = 'gitBadge', controlBtnVisibility = true }) {
    this._getTermCwd           = getTermCwd;
    this._gitBtnId             = gitBtnId;
    this._gitBadgeId           = gitBadgeId;
    this._controlBtnVisibility = controlBtnVisibility;
    this._pollInterval         = null;
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  mount() {
    injectCss('components/git/git-diff.css');
  }

  startPoll() {
    this.stopPoll();
    this._pollInterval = setInterval(() => this.refreshStatus(), 10000);
  }

  stopPoll() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  // ----------------------------------------------------------------
  // Git status badge
  // ----------------------------------------------------------------
  async refreshStatus() {
    const btn   = document.getElementById(this._gitBtnId);
    const badge = document.getElementById(this._gitBadgeId);
    if (!btn || !badge) return;
    try {
      const result = await window.db.terminal.exec({
        command: 'git status --short 2>&1',
        cwd: this._getTermCwd(),
      });
      const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim());
      if (this._controlBtnVisibility) btn.hidden = false;
      if (lines.length > 0) {
        badge.textContent = lines.length;
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    } catch {
      if (this._controlBtnVisibility) btn.hidden = true;
      badge.hidden = true;
    }
  }

}
