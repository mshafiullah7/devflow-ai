import { escHtml, injectCss } from '../../../../shared/helpers.js';

// Minimal ANSI SGR → HTML converter (supports standard 16 colors + bold/dim/reset)
const _ANSI_COLORS = [
  '#282828','#cc241d','#98971a','#d79921','#458588','#b16286','#689d6a','#a89984', // dark (0-7)
  '#928374','#fb4934','#b8bb26','#fabd2f','#83a598','#d3869b','#8ec07c','#ebdbb2', // bright (8-15)
];
function _ansiToHtml(text) {
  let out = '';
  let fgColor = null;
  let bgColor = null;
  let bold = false;
  let openSpan = false;

  const flushSpan = () => {
    if (openSpan) { out += '</span>'; openSpan = false; }
  };
  const openTag = () => {
    if (fgColor || bgColor || bold) {
      let style = '';
      if (fgColor) style += `color:${fgColor};`;
      if (bgColor) style += `background:${bgColor};`;
      if (bold)    style += 'font-weight:bold;';
      out += `<span style="${style}">`;
      openSpan = true;
    }
  };

  const parts = text.split(/(\x1b\[[0-9;]*m)/);
  for (const part of parts) {
    if (!part) continue;
    const m = part.match(/^\x1b\[([0-9;]*)m$/);
    if (!m) {
      // plain text — escape HTML
      const escaped = part.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      if (!openSpan && (fgColor || bgColor || bold)) openTag();
      out += escaped;
      continue;
    }
    // SGR sequence
    flushSpan();
    const codes = m[1] ? m[1].split(';').map(Number) : [0];
    let i = 0;
    while (i < codes.length) {
      const c = codes[i];
      if (c === 0)  { fgColor = null; bgColor = null; bold = false; }
      else if (c === 1) bold = true;
      else if (c === 22) bold = false;
      else if (c >= 30 && c <= 37) fgColor = _ANSI_COLORS[c - 30];
      else if (c === 39) fgColor = null;
      else if (c >= 40 && c <= 47) bgColor = _ANSI_COLORS[c - 40];
      else if (c === 49) bgColor = null;
      else if (c >= 90 && c <= 97) fgColor = _ANSI_COLORS[c - 90 + 8];
      else if (c >= 100 && c <= 107) bgColor = _ANSI_COLORS[c - 100 + 8];
      else if (c === 38 && codes[i+1] === 5) { fgColor = _ANSI_COLORS[codes[i+2]] ?? null; i += 2; }
      else if (c === 38 && codes[i+1] === 2) { fgColor = `rgb(${codes[i+2]},${codes[i+3]},${codes[i+4]})`; i += 4; }
      else if (c === 48 && codes[i+1] === 5) { bgColor = _ANSI_COLORS[codes[i+2]] ?? null; i += 2; }
      else if (c === 48 && codes[i+1] === 2) { bgColor = `rgb(${codes[i+2]},${codes[i+3]},${codes[i+4]})`; i += 4; }
      i++;
    }
  }
  flushSpan();
  return out;
}

export class TerminalController {
  constructor({ initialCwd }) {
    this._termCwd          = initialCwd;
    this._folderSelected   = false;
    this._currentStreamDiv = null;
    this._spinnerEl        = null;
    this._outputBuffer     = [];
    this._rafPending       = false;
    this._onCommandDone    = null;
  }

  // ----------------------------------------------------------------
  // Accessors
  // ----------------------------------------------------------------
  get cwd() { return this._termCwd; }
  get folderSelected() { return this._folderSelected; }
  set folderSelected(v) { this._folderSelected = v; }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  mount() {
    injectCss('pages/project/components/terminal/console.css');
    this._initListeners();
  }

  unmount() {
    window.db.terminal.removeListeners();
  }

  setCommandDoneCallback(cb) {
    this._onCommandDone = cb;
  }

  // ----------------------------------------------------------------
  // Output listeners
  // ----------------------------------------------------------------
  _initListeners() {
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
        span.innerHTML = _ansiToHtml(text);
        fragment.appendChild(span);
      }
      target.appendChild(fragment);
      const out = document.getElementById('consoleOutput');
      if (out) out.scrollTop = out.scrollHeight;
    };

    window.db.terminal.onData(({ text, stream }) => {
      if (!this._currentStreamDiv) return;
      if (this._spinnerEl) { this._spinnerEl.remove(); this._spinnerEl = null; }
      if (!text) return;
      this._outputBuffer.push({ text, isErr: stream === 'stderr' });
      if (!this._rafPending) {
        this._rafPending = true;
        requestAnimationFrame(flushBuffer);
      }
    });

    window.db.terminal.onDone(() => {
      flushBuffer();
      if (this._spinnerEl) { this._spinnerEl.remove(); this._spinnerEl = null; }
      this._currentStreamDiv = null;
      this._setRunning(false);
      if (this._onCommandDone) this._onCommandDone();
    });
  }

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------
  _stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  }

  _updatePromptLabel() {
    const label = document.getElementById('consolePromptLabel');
    if (label) label.textContent = `PS ${this._termCwd}>`;
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
    const out  = document.getElementById('consoleOutput');
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

  // ----------------------------------------------------------------
  // Public — no folder warning
  // ----------------------------------------------------------------
  warnNoFolder() {
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
  // Public — print text directly (API responses, info messages)
  // ----------------------------------------------------------------
  printOutput(text, { label = null, isError = false } = {}) {
    const out = document.getElementById('consoleOutput');
    if (!out) return;
    const hint = out.querySelector('.project-console__hint');
    if (hint) hint.remove();

    if (label) {
      const hdr = document.createElement('div');
      hdr.className = 'project-console__line project-console__line--prompt';
      hdr.innerHTML = `<span class="project-console__ps-prompt">${escHtml(label)}</span>`;
      out.appendChild(hdr);
    }

    const block = document.createElement('div');
    block.className = 'project-console__stream-block';
    const span = document.createElement('span');
    if (isError) span.className = 'project-console__stderr';
    span.textContent = text;
    block.appendChild(span);
    out.appendChild(block);
    out.scrollTop = out.scrollHeight;
  }

  // ----------------------------------------------------------------
  // Public — run a command
  // ----------------------------------------------------------------
  async runCommand(cmd) {
    const out = this._appendPromptLine(cmd);

    // Handle `clear` locally
    if (/^clear$/i.test(cmd.trim()) || /^cls$/i.test(cmd.trim())) {
      const out2 = document.getElementById('consoleOutput');
      if (out2) out2.innerHTML = '';
      return;
    }

    // Handle `cd` locally
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

    // Streaming command
    const streamDiv = document.createElement('div');
    streamDiv.className = 'project-console__stream-block';
    out.appendChild(streamDiv);

    const spinner = document.createElement('span');
    spinner.className = 'project-console__spinner';
    streamDiv.appendChild(spinner);
    this._spinnerEl        = spinner;
    this._currentStreamDiv = streamDiv;

    out.scrollTop = out.scrollHeight;
    this._setRunning(true);
    await window.db.terminal.execStart({ command: cmd, cwd: this._termCwd });
  }

  // ----------------------------------------------------------------
  // Public — command-picker dropdown
  // ----------------------------------------------------------------
  async toggleCmdPickerDropdown() {
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
          this.applyQuickCommand(item.dataset.cmd);
        });
      });
    }

    dd.hidden = false;
  }

  // ----------------------------------------------------------------
  // Public — inline input prompt
  // ----------------------------------------------------------------
  promptInlineInput() {
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
            <button class="qcmd-inline-prompt__cancel">&#x2715;</button>
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

  // ----------------------------------------------------------------
  // Public — apply quick command (resolves {{input}} if needed)
  // ----------------------------------------------------------------
  async applyQuickCommand(rawCmd) {
    let cmd = rawCmd;
    if (rawCmd.includes('{{input}}')) {
      const value = await this.promptInlineInput();
      if (value === null) return;
      cmd = rawCmd.replaceAll('{{input}}', value);
    }
    const consoleInput = document.getElementById('consoleInput');
    if (consoleInput) {
      consoleInput.value = cmd;
      consoleInput.dispatchEvent(new Event('input'));
    }
    await this.runCommand(cmd);
    if (consoleInput) {
      consoleInput.value = '';
      consoleInput.style.height = 'auto';
    }
  }
}
