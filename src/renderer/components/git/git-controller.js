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
      const cwd = this._getTermCwd();
      const [result, ignorePatterns] = await Promise.all([
        window.db.terminal.exec({ command: 'git status --short 2>&1', cwd }),
        this._fetchGitignorePatterns(cwd),
      ]);
      const lines = (result.stdout || '').trim().split('\n')
        .filter(l => l.trim())
        .filter(l => {
          const file = l.substring(3).trim().replace(/^"(.*)"$/, '$1');
          return !this._matchesGitignore(file, ignorePatterns);
        });
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

  async _fetchGitignorePatterns(cwd) {
    try {
      const r = await window.db.terminal.exec({
        command: `if (Test-Path ".gitignore") { Get-Content -Raw ".gitignore" } else { "" }`,
        cwd,
      });
      return (r.stdout || '').split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
    } catch {
      return [];
    }
  }

  _matchesGitignore(file, patterns) {
    const norm = file.replace(/\\/g, '/');
    return patterns.some(pattern => {
      const negated  = pattern.startsWith('!');
      const p        = negated ? pattern.slice(1) : pattern;
      const dirOnly  = p.endsWith('/');
      const clean    = dirOnly ? p.slice(0, -1) : p;
      const anchored = clean.startsWith('/');
      const base     = anchored ? clean.slice(1) : clean;
      const regexStr = base
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\x00')
        .replace(/\*/g, '[^/]*')
        .replace(/\x00/g, '.*')
        .replace(/\?/g, '[^/]');
      try {
        const re      = anchored
          ? new RegExp(`^${regexStr}(/.*)?$`)
          : new RegExp(`(^|/)${regexStr}(/.*)?$`);
        const matched = re.test(norm);
        return negated ? !matched : matched;
      } catch {
        return false;
      }
    });
  }

}
