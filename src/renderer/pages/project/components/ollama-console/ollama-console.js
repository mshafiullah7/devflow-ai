import { injectCss } from '../../../../shared/helpers.js';

// ----------------------------------------------------------------
// Tiny HTML-escape helper
// ----------------------------------------------------------------
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ----------------------------------------------------------------
// Session states
// ----------------------------------------------------------------
const S = {
  IDLE:     'idle',      // no session started
  LOADING:  'loading',   // fetching models
  READY:    'ready',     // session active, waiting for user input
  THINKING: 'thinking',  // streaming response from Ollama
};

// ----------------------------------------------------------------
// OllamaConsole
//
// Self-contained floating panel component.
// Uses window.db.ollama IPC to talk to the Ollama REST API via
// the main process — no TTY / CLI parsing needed.
//
// Conversation history is kept in this._history so every new
// message includes full context (multi-turn chat).
// ----------------------------------------------------------------
export class OllamaConsole {
  constructor() {
    this._state        = S.IDLE;
    this._host         = 'http://localhost:11434';
    this._model        = '';
    this._cwd          = '';        // working directory for --dir context
    this._agentCliPath = '';        // path to agent-cli/index.js
    this._streamEl     = null;      // <div> receiving current token stream
    this._streamText   = '';        // accumulated tokens for current turn
    this._rafId        = null;
    this._tokenQueue   = [];
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  mount() {
    injectCss('pages/project/components/ollama-console/ollama-console.css');
    this._injectPanel();
    this._bindEvents();
    this._registerIpcListeners();
  }

  unmount() {
    window.db.ollama.removeListeners();
    window.db.ollama.cancel();
    const el = document.getElementById('ollamaOverlay');
    if (el) el.remove();
  }

  show() {
    const overlay = document.getElementById('ollamaOverlay');
    if (!overlay) return;
    overlay.hidden = false;
    // Load models the first time the panel opens
    if (this._state === S.IDLE) this._loadModels();
    else document.getElementById('ollamaInput')?.focus();
  }

  hide() {
    const overlay = document.getElementById('ollamaOverlay');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.classList.remove('ola-overlay--expanded'); // reset to compact mode
  }

  /**
   * Called from the double-run button when an Ollama model is selected.
   * Opens the panel, selects the correct model, starts a session, and
   * auto-sends the prompt with the current working directory as context.
   *
   * @param {string}  prompt  - Text from the Prompt textarea
   * @param {object}  cfg     - Resolved model config ({ model_name, base_url, … })
   * @param {string}  cwd     - Current working directory from the terminal
   */
  async openWithPrompt({ prompt, cfg, cwd }) {
    // 1. Show panel in expanded (centered, 80%) mode
    const overlay = document.getElementById('ollamaOverlay');
    if (!overlay) return;
    overlay.classList.add('ola-overlay--expanded');
    overlay.hidden = false;
    if (this._state === S.IDLE) await this._loadModels();

    // 2. Store working directory — passed as --dir to agent-cli so it has
    //    full filesystem tool access (read_file, write_file, list_files, etc.)
    this._cwd = cwd || '';

    // 3. Switch to the correct Ollama model
    const model = cfg?.model_name || this._model;
    if (model) {
      const sel = document.getElementById('olaModelSelect');
      const opt = sel ? [...sel.options].find(o => o.value === model) : null;
      if (opt) { sel.value = model; this._model = model; }
    }

    // 4. Start a fresh session (clears chat DOM, sets state=READY)
    this._startSession();

    // 5. Fill input and auto-send after state settles
    await new Promise(r => setTimeout(r, 120));
    const input = document.getElementById('ollamaInput');
    if (input) {
      input.value = prompt;
      input.dispatchEvent(new Event('input')); // trigger auto-resize
    }
    this._send();
  }

  // ----------------------------------------------------------------
  // DOM injection
  // ----------------------------------------------------------------
  _injectPanel() {
    if (document.getElementById('ollamaOverlay')) return;
    const wrap = document.createElement('div');
    wrap.id        = 'ollamaOverlay';
    wrap.className = 'ola-overlay';
    wrap.hidden    = true;
    wrap.innerHTML = `
      <div class="ola-panel" role="dialog" aria-label="Ollama Console">

        <!-- Header -->
        <div class="ola-header">
          <div class="ola-header__brand">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/>
              <path d="M9 9c0-1.66 1.34-3 3-3s3 1.34 3 3c0 1.3-.84 2.4-2 2.82V15"
                stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              <circle cx="12" cy="18" r="1" fill="currentColor"/>
            </svg>
            <span class="ola-header__title">Ollama</span>
            <span class="ola-status-dot" id="olaStatusDot"></span>
          </div>
          <div class="ola-header__controls">
            <select class="ola-model-select" id="olaModelSelect" title="Select model">
              <option value="">Loading…</option>
            </select>
            <button class="ola-btn ola-btn--start" id="olaBtnStart" disabled>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M4 3l9 5-9 5V3z" fill="currentColor"/>
              </svg>
              Start
            </button>
            <button class="ola-btn ola-btn--stop" id="olaBtnStop" hidden>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor"/>
              </svg>
              Stop
            </button>
            <button class="ola-btn ola-btn--clear" id="olaBtnClear" title="Clear chat" hidden>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              </svg>
            </button>
            <button class="ola-close" id="olaBtnClose" aria-label="Close">✕</button>
          </div>
        </div>

        <!-- Chat area -->
        <div class="ola-chat" id="olaChat">
          <div class="ola-welcome">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="var(--accent)" stroke-width="1.2"/>
              <path d="M9 9c0-1.66 1.34-3 3-3s3 1.34 3 3c0 1.3-.84 2.4-2 2.82V15"
                stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round"/>
              <circle cx="12" cy="18" r="1" fill="var(--accent)"/>
            </svg>
            <p>Select a model and press <strong>Start</strong> to open a session.</p>
          </div>
        </div>

        <!-- Input row -->
        <div class="ola-input-row">
          <textarea
            id="ollamaInput"
            class="ola-input"
            rows="1"
            placeholder="Start a session first…"
            disabled
            spellcheck="false"
            autocomplete="off"
          ></textarea>
          <button class="ola-send" id="olaBtnSend" disabled title="Send (Enter)">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M3 10l14-7-7 14V10H3z" fill="currentColor"/>
            </svg>
          </button>
        </div>

      </div>
    `;
    document.body.appendChild(wrap);
  }

  // ----------------------------------------------------------------
  // Events
  // ----------------------------------------------------------------
  _bindEvents() {
    // Close
    document.getElementById('olaBtnClose')
      .addEventListener('click', () => this.hide());
    document.getElementById('ollamaOverlay')
      .addEventListener('click', (e) => { if (e.target.id === 'ollamaOverlay') this.hide(); });

    // Model select
    document.getElementById('olaModelSelect')
      .addEventListener('change', (e) => { this._model = e.target.value; });

    // Start / Stop / Clear
    document.getElementById('olaBtnStart')
      .addEventListener('click', () => this._startSession());
    document.getElementById('olaBtnStop')
      .addEventListener('click', () => this._endSession());
    document.getElementById('olaBtnClear')
      .addEventListener('click', () => this._clearChat());

    // Input auto-resize + send
    const input = document.getElementById('ollamaInput');
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 110) + 'px';
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send(); }
    });

    document.getElementById('olaBtnSend')
      .addEventListener('click', () => this._send());
  }

  // ----------------------------------------------------------------
  // IPC listeners (token stream)
  // ----------------------------------------------------------------
  _registerIpcListeners() {
    window.db.ollama.onToken(({ token }) => {
      if (this._state !== S.THINKING || !this._streamEl) return;
      this._tokenQueue.push(token);
      if (!this._rafId) this._rafId = requestAnimationFrame(() => this._flushTokens());
    });

    window.db.ollama.onDone(({ success, error }) => {
      // Flush remaining tokens
      if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
      this._flushTokens();

      if (!success && error) {
        this._appendError(`Stream error: ${error}`);
      }
      // Remove blinking cursor from last bubble
      if (this._streamEl) {
        const cursor = this._streamEl.parentNode?.querySelector('.ola-cursor');
        if (cursor) cursor.remove();
      }
      this._streamEl   = null;
      this._streamText = '';
      this._tokenQueue = [];
      this._setState(S.READY);
    });

    window.db.ollama.onError(({ message }) => {
      this._appendError(message);
      this._setState(S.READY);
    });
  }

  _flushTokens() {
    this._rafId = null;
    if (!this._tokenQueue.length || !this._streamEl) return;
    const chunk = this._tokenQueue.splice(0).join('');
    this._streamText += chunk;
    // Render as plain text (preserve whitespace via CSS)
    this._streamEl.textContent = this._streamText;
    // Remove the blinking cursor span while content is being added
    const cursor = this._streamEl.parentNode?.querySelector('.ola-cursor');
    if (cursor && this._streamText) cursor.style.display = 'none';
    const chat = document.getElementById('olaChat');
    if (chat) chat.scrollTop = chat.scrollHeight;
  }

  // ----------------------------------------------------------------
  // Session management
  // ----------------------------------------------------------------
  async _loadModels() {
    this._setState(S.LOADING);
    // Capture agent-cli path (set on window by project.js at mount time)
    this._agentCliPath = window._agentCliPath || 'agent-cli/index.js';

    const configs = await window.db.modelConfigs.list();
    // Prefer an Ollama-type config for host resolution
    const ollamaCfg = configs.find(c => c.type === 'ollama');
    if (ollamaCfg?.base_url) this._host = ollamaCfg.base_url;

    const models = await window.db.ollama.listModels({ host: this._host });
    const sel    = document.getElementById('olaModelSelect');

    if (!models.length) {
      sel.innerHTML = '<option value="">No models found</option>';
      this._appendStatus('⚠ No models found. Is Ollama running?', 'warn');
      this._setState(S.IDLE);
      return;
    }

    sel.innerHTML = models.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
    this._model   = models[0];
    this._setState(S.IDLE);

    // Enable Start
    document.getElementById('olaBtnStart').disabled = false;
    document.getElementById('ollamaInput')?.focus();
  }

  _startSession() {
    if (!this._model) return;
    this._clearChatDOM();
    this._appendStatus(`Session started · ${this._model}`, 'info');
    this._setState(S.READY);
  }

  _endSession() {
    window.db.ollama.cancel();
    this._streamEl   = null;
    this._streamText = '';
    this._tokenQueue = [];
    this._cwd        = '';
    this._appendStatus('Session ended.', 'info');
    this._setState(S.IDLE);
  }

  _clearChat() {
    this._clearChatDOM();
    this._appendStatus(`Session cleared · ${this._model}`, 'info');
  }

  // ----------------------------------------------------------------
  // Send a message
  // ----------------------------------------------------------------
  async _send() {
    if (this._state !== S.READY) return;
    const input = document.getElementById('ollamaInput');
    const text  = input.value.trim();
    if (!text) return;

    // Clear input
    input.value        = '';
    input.style.height = 'auto';

    // Append user bubble
    this._appendUserMsg(text);

    // Create AI response bubble (streaming target)
    this._streamEl   = this._appendAiMsg();
    this._streamText = '';
    this._tokenQueue = [];

    this._setState(S.THINKING);

    // Use the same agent-cli mechanism as "Run in console" — gives the model
    // full filesystem tools access when a working directory is set.
    await window.db.ollama.chat({
      agentCliPath: this._agentCliPath,
      model:        this._model,
      host:         this._host,
      dir:          this._cwd,   // empty string = no --dir (no file access)
      prompt:       text,
    });
  }

  // ----------------------------------------------------------------
  // State machine
  // ----------------------------------------------------------------
  _setState(state) {
    this._state = state;

    const startBtn  = document.getElementById('olaBtnStart');
    const stopBtn   = document.getElementById('olaBtnStop');
    const clearBtn  = document.getElementById('olaBtnClear');
    const input     = document.getElementById('ollamaInput');
    const sendBtn   = document.getElementById('olaBtnSend');
    const modelSel  = document.getElementById('olaModelSelect');
    const dot       = document.getElementById('olaStatusDot');

    const inSession = state === S.READY || state === S.THINKING;
    const canType   = state === S.READY;

    startBtn.hidden   = inSession;
    stopBtn.hidden    = !inSession;
    clearBtn.hidden   = !inSession;
    input.disabled    = !canType;
    sendBtn.disabled  = !canType;
    modelSel.disabled = inSession;

    // Status dot colour
    dot.className = 'ola-status-dot';
    if (state === S.READY)    dot.classList.add('ola-status-dot--ready');
    if (state === S.THINKING) dot.classList.add('ola-status-dot--thinking');
    if (state === S.LOADING)  dot.classList.add('ola-status-dot--loading');

    if (canType) {
      input.placeholder = 'Type a message… (Enter to send, Shift+Enter for new line)';
      input.focus();
    } else if (state === S.THINKING) {
      input.placeholder = 'Waiting for response…';
    } else {
      input.placeholder = 'Start a session first…';
    }
  }

  // ----------------------------------------------------------------
  // Chat DOM helpers
  // ----------------------------------------------------------------
  _clearChatDOM() {
    const chat = document.getElementById('olaChat');
    if (chat) chat.innerHTML = '';
  }

  _appendStatus(text, type = 'info') {
    const chat = document.getElementById('olaChat');
    if (!chat) return;
    const div = document.createElement('div');
    div.className = `ola-status ola-status--${type}`;
    div.textContent = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  _appendError(text) {
    const chat = document.getElementById('olaChat');
    if (!chat) return;
    const div = document.createElement('div');
    div.className = 'ola-status ola-status--error';
    div.textContent = `✗ ${text}`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  _appendUserMsg(text) {
    const chat = document.getElementById('olaChat');
    if (!chat) return;
    const row = document.createElement('div');
    row.className = 'ola-row ola-row--user';
    row.innerHTML = `<div class="ola-bubble ola-bubble--user">${esc(text)}</div>`;
    chat.appendChild(row);
    chat.scrollTop = chat.scrollHeight;
  }

  /** Returns the <div class="ola-text"> element that receives streaming tokens */
  _appendAiMsg() {
    const chat = document.getElementById('olaChat');
    if (!chat) return null;
    const row = document.createElement('div');
    row.className = 'ola-row ola-row--ai';
    row.innerHTML = `
      <div class="ola-avatar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/>
          <path d="M9 9c0-1.66 1.34-3 3-3s3 1.34 3 3c0 1.3-.84 2.4-2 2.82V15"
            stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="12" cy="18" r="1" fill="currentColor"/>
        </svg>
      </div>
      <div class="ola-bubble ola-bubble--ai">
        <div class="ola-text"></div>
        <span class="ola-cursor">▋</span>
      </div>
    `;
    chat.appendChild(row);
    chat.scrollTop = chat.scrollHeight;
    return row.querySelector('.ola-text');
  }
}
