import { injectCss } from '../../shared/helpers.js';

export class GitController {
  constructor({ getTermCwd, getLayers, gitBtnId = 'btnConsoleGit', gitBadgeId = 'gitBadge', controlBtnVisibility = true }) {
    this._getTermCwd           = getTermCwd;
    this._getLayers            = getLayers || null;
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
    if (!badge) return;
    if (!btn && this._controlBtnVisibility) return;
    const countLines = stdout => (stdout || '').split('\n').filter(l => /^[ MADRCU?!]{2} .+/.test(l)).length;

    try {
      let count = 0;

      if (this._getLayers) {
        const layers = this._getLayers().filter(l => l.folder_path);
        const counts = await Promise.all(layers.map(async l => {
          try {
            const r = await window.db.terminal.exec({
              command: 'git status --short -uall -- . 2>&1',
              cwd: l.folder_path,
            });
            return countLines(r.stdout);
          } catch { return 0; }
        }));
        count = counts.reduce((a, b) => a + b, 0);
      } else {
        const cwd = this._getTermCwd();
        const r   = await window.db.terminal.exec({ command: 'git status --short -uall 2>&1', cwd });
        count = countLines(r.stdout);
      }

      if (this._controlBtnVisibility && btn) btn.hidden = false;
      badge.textContent = count > 0 ? String(count) : '';
      badge.hidden = count === 0;
    } catch {
      if (this._controlBtnVisibility && btn) btn.hidden = true;
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
