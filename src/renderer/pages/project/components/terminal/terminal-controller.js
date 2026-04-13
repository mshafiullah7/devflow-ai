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
    this._running          = false;
    this._aiMode           = false;   // /p prefix toggle
  }

  // ----------------------------------------------------------------
  // Accessors
  // ----------------------------------------------------------------
  get cwd() { return this._termCwd; }
  get folderSelected() { return this._folderSelected; }
  set folderSelected(v) { this._folderSelected = v; }
  get isRunning() { return this._running; }
  get aiMode()    { return this._aiMode; }

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

  async _buildAiPromptCmd(prompt) {
    const configs = await window.db.modelConfigs.list();
    const cfg = configs.find(c => c.is_default) || configs[0];
    if (!cfg) {
      this.printOutput('No AI model configured. Add one in Settings.', { isError: true });
      return null;
    }
    if (cfg.type === 'api') {
      this.printOutput(`API model "${cfg.label || cfg.model_name}" is not supported in the terminal. Use a CLI or Ollama model.`, { isError: true });
      return null;
    }
    if (cfg.type === 'ollama') {
      // Spawn node directly (not via PowerShell) so the stdin pipe stays open
      // for follow-up messages. PowerShell closes its own stdin after launch,
      // which sends EOF to the child and kills the readline REPL loop.
      const agentPath = window._agentCliPath || 'agent-cli/index.js';
      const model     = cfg.model_name || 'phi4-mini:latest';
      const host      = cfg.base_url   || 'http://localhost:11434';
      const dir       = this._termCwd  || '.';
      return { repl: true, agentPath, model, host, dir, initialPrompt: prompt };
    }
    // CLI type (claude, gemini, mistral, etc.) — single-shot via heredoc pipe
    const safePrompt = prompt.replace(/'/g, "''");
    const exe   = cfg.executable || 'claude';
    const flags = cfg.flags ? ` ${cfg.flags}` : '';
    if (cfg.input_mode === 'heredoc') {
      return { cmd: `$p = @'\n${safePrompt}\n'@\n${exe}${flags} $p` };
    }
    return { cmd: `$p = @'\n${safePrompt}\n'@\nWrite-Output $p | ${exe}${flags}` };
  }

  _updatePromptLabel() {
    const label = document.getElementById('consolePromptLabel');
    if (label) label.textContent = `PS ${this._termCwd}>`;
  }

  _setRunning(running) {
    this._running = running;
    const input   = document.getElementById('consoleInput');
    const stopBtn = document.getElementById('btnConsoleStop');
    const label   = document.getElementById('consolePromptLabel');
    if (running) {
      input.disabled = false; // keep enabled — Enter will forward to stdin
      input.placeholder = 'Type input for running process… (Enter to send)';
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

  printUserEcho(text) {
    const out = document.getElementById('consoleOutput');
    if (!out) return;
    const line = document.createElement('div');
    line.className = 'project-console__user-echo';
    line.textContent = `You: ${text}`;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }

  clearConversationHint() {
    const out = document.getElementById('consoleOutput');
    if (!out) return;
    const hint = out.querySelector('.project-console__conv-hint');
    if (hint) hint.remove();
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

    // Handle `/p <prompt>` — run inline prompt with the selected AI model
    if (/^\/p\s+/i.test(cmd.trim())) {
      const prompt = cmd.trim().replace(/^\/p\s+/i, '').replace(/^["']|["']$/g, '');
      if (!prompt) return;
      const result = await this._buildAiPromptCmd(prompt);
      if (!result) return;
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
      if (result.repl) {
        // Ollama REPL: spawn node directly to keep stdin pipe open
        await window.db.terminal.replStart(result);
        const hint = document.createElement('div');
        hint.className = 'project-console__conv-hint';
        hint.textContent = 'Conversation active — type /q to end';
        out.appendChild(hint);
        out.scrollTop = out.scrollHeight;
      } else {
        const { cmd: builtCmd, initialStdin } = result;
        await window.db.terminal.execStart({ command: builtCmd, cwd: this._termCwd, initialStdin });
      }
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

    const switchHtml = `
      <div class="cmd-picker__ai-toggle" id="cmdPickerAiToggle">
        <span class="cmd-picker__ai-label">AI prompt (/p)</span>
        <label class="cmd-picker__switch">
          <input type="checkbox" id="cmdPickerAiSwitch" ${this._aiMode ? 'checked' : ''}>
          <span class="cmd-picker__switch-track"></span>
        </label>
      </div>
    `;

    if (commands.length === 0) {
      dd.innerHTML = switchHtml + `<div class="cmd-picker__empty">No saved commands. Use the commands toolbar button to add some.</div>`;
    } else {
      dd.innerHTML = switchHtml + commands.map(c => `
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

    dd.querySelector('#cmdPickerAiSwitch').addEventListener('change', (e) => {
      e.stopPropagation();
      this._aiMode = e.target.checked;
      this._updateAiModeIndicator();
    });

    dd.hidden = false;
  }

  _updateAiModeIndicator() {
    const btn = document.getElementById('btnCmdPicker');
    if (btn) btn.style.color = this._aiMode ? 'var(--console-prompt)' : '';
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
    if (this._aiMode && !/^\/p\s/i.test(cmd.trim())) {
      cmd = `/p ${cmd}`;
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
