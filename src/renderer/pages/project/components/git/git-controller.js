import { escHtml, injectCss } from '../../../../shared/helpers.js';

export class GitController {
  constructor({ getTermCwd }) {
    this._getTermCwd    = getTermCwd;
    this._pollInterval  = null;
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  mount() {
    injectCss('pages/project/components/git/git-diff.css');
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
    const btn   = document.getElementById('btnConsoleGit');
    const badge = document.getElementById('gitBadge');
    if (!btn || !badge) return;
    try {
      const result = await window.db.terminal.exec({
        command: 'git status --short 2>&1',
        cwd: this._getTermCwd(),
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

  // ----------------------------------------------------------------
  // Diff modal
  // ----------------------------------------------------------------
  async showDiffModal() {
    let statusResult;
    try {
      statusResult = await window.db.terminal.exec({
        command: 'git status --short 2>&1',
        cwd: this._getTermCwd(),
      });
    } catch { return; }

    const files = this._parseGitStatus(statusResult.stdout || '');
    if (files.length === 0) return;

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
    const escHandler = (e) => {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
    };
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

  // ----------------------------------------------------------------
  // Diff helpers
  // ----------------------------------------------------------------
  _parseGitStatus(output) {
    return output.split('\n')
      .filter(l => l.trim())
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

  async _loadFileDiff(overlay, fileInfo) {
    const view = overlay.querySelector('#gitDiffView');
    view.innerHTML = '<div class="git-diff-loading">Loading…</div>';
    try {
      let diffText = '';
      if (fileInfo.statusType === 'U') {
        const r = await window.db.terminal.exec({
          command: `Get-Content -Raw -Encoding UTF8 "${fileInfo.file}" 2>&1`,
          cwd: this._getTermCwd(),
        });
        const content   = (r.stdout || '').replace(/\r\n/g, '\n');
        const addedLines = content.split('\n').map(l => `+${l}`).join('\n');
        diffText = `@@ -0,0 +1 @@\n${addedLines}`;
      } else {
        const r1 = await window.db.terminal.exec({
          command: `git diff HEAD -- "${fileInfo.file}" 2>&1`,
          cwd: this._getTermCwd(),
        });
        diffText = (r1.stdout || '').trim();
        if (!diffText) {
          const r2 = await window.db.terminal.exec({
            command: `git diff --cached -- "${fileInfo.file}" 2>&1`,
            cwd: this._getTermCwd(),
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
    const esc  = escHtml;
    let html   = `<div class="git-diff-filename">${esc(filename)}</div>`;

    if (!diffText || !diffText.trim()) {
      return html + '<div class="git-diff-empty">No diff available.</div>';
    }

    html += '<table class="git-diff-table"><tbody>';

    let oldLine = 0, newLine = 0;
    for (const raw of diffText.split('\n')) {
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
          <td class="gd-code gd-code--del"><span class="gd-sign">&#x2212;</span>${esc(raw.slice(1))}</td>
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
}
