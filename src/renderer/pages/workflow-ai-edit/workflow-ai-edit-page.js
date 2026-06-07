import { escHtml, injectCss } from '../../shared/helpers.js';
import { applyStoredTheme }   from '../../shared/theme-manager.js';
import { Dialog }             from '../../components/dialog/dialog.js';
import { ModelPicker }        from '../../components/model-picker/model-picker.js';

export class WorkflowAiEditPage {
  constructor(container) {
    this.container        = container;
    this._projectId       = null;
    this._layerId         = null;
    this._layerName       = '';
    this._layerPrompt     = '';
    this._cwd             = null;
    this._modelConfig     = null;
    this._files           = [];       // flat list of relative file paths from cwd
    this._dropdownIdx     = -1;       // keyboard-selected item in dropdown
    this._dropdownVisible = false;
    this._picker          = null;
  }

  mount() {
    injectCss('pages/workflow-ai-edit/workflow-ai-edit-page.css');
    applyStoredTheme();
    this.container.innerHTML = this._template();
    this._bindEvents();
    window.app.workflowAiEditWindow.onInit(data => this._init(data));
  }

  async _init({ projectId, layerId, layerName, layerPrompt, cwd, modelConfig }) {
    this._projectId   = projectId;
    this._layerId     = layerId;
    this._layerName   = layerName;
    this._layerPrompt = layerPrompt;
    this._cwd         = cwd;
    this._modelConfig = modelConfig;

    this.container.querySelector('#waeLayerChip').textContent = layerName;

    const cwdBar = this.container.querySelector('#waeCwdBar');
    if (cwd) {
      this.container.querySelector('#waeCwdText').textContent = cwd;
      cwdBar.hidden = false;
    }

    // Model picker — pre-select the model passed from the workflows page
    this._picker = new ModelPicker({
      anchor:    this.container.querySelector('#waeModelPickerAnchor'),
      initialId: modelConfig?.id ?? null,
      onSelect:  (model) => { this._modelConfig = model; },
    });
    await this._picker.reload();

    // Load file list for @ mentions
    if (cwd) {
      const exts = ['.dart','.yaml','.yml','.json','.toml','.gradle','.xml',
                    '.md','.txt','.kt','.swift','.ts','.js','.py','.go','.rs'];
      this._files = (await window.shell.listFiles(cwd, exts)) || [];
    }

    const messagesEl = this.container.querySelector('#waeMessages');
    const chatInput  = this.container.querySelector('#waeInput');
    await this._loadHistory(messagesEl, chatInput);
    chatInput.focus();
  }

  _template() {
    return `
      <div class="wae-root">
        <div class="wae-header" style="-webkit-app-region:drag;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
            style="-webkit-app-region:no-drag;">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          <span style="-webkit-app-region:no-drag;">AI Edit</span>
          <span class="wae-layer-chip" id="waeLayerChip" style="-webkit-app-region:no-drag;">—</span>
          <span class="wae-cwd-bar" id="waeCwdBar" hidden style="-webkit-app-region:no-drag;">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;">
              <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.879a1.5 1.5 0 0 1 1.06.44l.122.12A1.5 1.5 0 0 0 8.62 3H13.5A1.5 1.5 0 0 1 15 4.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z"
                stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
            </svg>
            <span id="waeCwdText"></span>
          </span>
          <span id="waeModelPickerAnchor" class="wae-model-picker-anchor" style="-webkit-app-region:no-drag;margin-left:auto;"></span>
        </div>

        <div class="wae-body">
          <div class="wae-messages" id="waeMessages">
            <div class="wae-empty">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" style="opacity:.35;margin-bottom:8px;">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Describe the design changes you need.<br>
              <span style="opacity:.6;font-size:11px;">Press Enter or click Send to preview the prompt.</span>
            </div>
          </div>
        </div>

        <div class="wae-footer">
          <textarea class="wae-textarea" id="waeInput"
            placeholder="Describe the changes… type @ to reference a file"
            rows="2"></textarea>
          <button class="wae-send-btn" id="waeSend">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Send
          </button>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    const input      = this.container.querySelector('#waeInput');
    const sendBtn    = this.container.querySelector('#waeSend');
    const messagesEl = this.container.querySelector('#waeMessages');

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 160) + 'px';
      this._handleAtMention(input);
    });

    input.addEventListener('keydown', e => {
      if (this._dropdownVisible) {
        if (e.key === 'ArrowDown') { e.preventDefault(); this._moveDdItem(1); return; }
        if (e.key === 'ArrowUp')   { e.preventDefault(); this._moveDdItem(-1); return; }
        if (e.key === 'Enter')     { e.preventDefault(); this._selectDdItem(input); return; }
        if (e.key === 'Escape')    { this._hideDropdown(); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._run(input, messagesEl); }
    });

    sendBtn.addEventListener('click', () => this._run(input, messagesEl));

    // Close dropdown when clicking outside
    document.addEventListener('click', e => {
      if (!e.target.closest('#waeFileDropdown') && !e.target.closest('#waeInput')) {
        this._hideDropdown();
      }
    });
  }

  // ----------------------------------------------------------------
  // @ mention autocomplete
  // ----------------------------------------------------------------
  _handleAtMention(input) {
    const val    = input.value;
    const pos    = input.selectionStart;
    const before = val.slice(0, pos);
    const match  = before.match(/@([\w.\-/\\]*)$/);
    if (!match) { this._hideDropdown(); return; }
    const query   = match[1].toLowerCase();
    const results = this._files.filter(f => f.toLowerCase().includes(query)).slice(0, 10);
    if (!results.length) { this._hideDropdown(); return; }
    this._showDropdown(results, input);
  }

  _showDropdown(files, input) {
    let dd = this.container.querySelector('#waeFileDropdown');
    if (!dd) {
      dd = document.createElement('div');
      dd.id = 'waeFileDropdown';
      dd.className = 'wae-file-dropdown';
      this.container.querySelector('.wae-footer').appendChild(dd);
    }

    dd.innerHTML = files.map((f, i) => `
      <div class="wae-file-item" data-path="${escHtml(f)}" data-idx="${i}">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;opacity:.6;">
          <path d="M3 2h6l4 4v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"
            stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          <path d="M9 2v4h4" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
        </svg>
        <span>${escHtml(f)}</span>
      </div>
    `).join('');

    dd.querySelectorAll('.wae-file-item').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        this._insertFileRef(el.dataset.path, input);
      });
    });

    this._dropdownVisible = true;
    this._dropdownIdx = -1;
    this._updateDdHighlight();
  }

  _hideDropdown() {
    const dd = this.container.querySelector('#waeFileDropdown');
    if (dd) dd.remove();
    this._dropdownVisible = false;
    this._dropdownIdx = -1;
  }

  _moveDdItem(dir) {
    const dd    = this.container.querySelector('#waeFileDropdown');
    if (!dd) return;
    const items = dd.querySelectorAll('.wae-file-item');
    this._dropdownIdx = Math.max(0, Math.min(items.length - 1, this._dropdownIdx + dir));
    this._updateDdHighlight();
    items[this._dropdownIdx]?.scrollIntoView({ block: 'nearest' });
  }

  _updateDdHighlight() {
    const dd = this.container.querySelector('#waeFileDropdown');
    if (!dd) return;
    dd.querySelectorAll('.wae-file-item').forEach((el, i) => {
      el.classList.toggle('active', i === this._dropdownIdx);
    });
  }

  _selectDdItem(input) {
    const dd = this.container.querySelector('#waeFileDropdown');
    if (!dd) return;
    const active = dd.querySelector('.wae-file-item.active') || dd.querySelector('.wae-file-item');
    if (active) this._insertFileRef(active.dataset.path, input);
  }

  _insertFileRef(filePath, input) {
    const val    = input.value;
    const pos    = input.selectionStart;
    const before = val.slice(0, pos);
    const after  = val.slice(pos);
    const match  = before.match(/@([\w.\-/\\]*)$/);
    if (!match) return;
    const newBefore = before.slice(0, before.length - match[0].length) + `@${filePath} `;
    input.value = newBefore + after;
    input.selectionStart = input.selectionEnd = newBefore.length;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    this._hideDropdown();
    input.focus();
  }

  // ----------------------------------------------------------------
  // Expand @file references → inline content in prompt
  // ----------------------------------------------------------------
  async _expandFileRefs(text) {
    if (!this._cwd) return text;
    const refs = [...new Set([...text.matchAll(/@([\w.\-/\\]+)/g)].map(m => m[1]))];
    if (!refs.length) return text;

    const sections = [];
    for (const ref of refs) {
      const abs     = this._cwd.replace(/\\/g, '/') + '/' + ref.replace(/\\/g, '/');
      const content = await window.shell.readFile(abs)
                   ?? await window.shell.readFile(abs.replace(/\//g, '\\'));
      if (content != null) {
        sections.push(`=== ${ref} ===\n${content}`);
      }
    }

    if (!sections.length) return text;
    return text + '\n\n---\nReferenced file contents:\n\n' + sections.join('\n\n');
  }

  // ----------------------------------------------------------------
  // Prompt history
  // ----------------------------------------------------------------
  async _loadHistory(messagesEl, chatInput) {
    if (!this._layerId) return;

    const items = await window.db.workflowLayerPromptHistory.list({
      project_id: this._projectId,
      layer_id:   this._layerId,
    });

    messagesEl.querySelector('.wae-history-group')?.remove();
    if (!items.length) return;

    const recent   = items.slice(0, 6);
    const group    = document.createElement('div');
    group.className = 'wae-history-group';

    const listHtml = recent.map((item, i) => `
      <div class="wae-history-item" data-idx="${i}" data-id="${item.id}">
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/>
          <path d="M7 4v3.5l2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="wae-history-item__text">${escHtml(item.prompt.slice(0, 100))}</span>
        <button class="wae-history-item__del" data-id="${item.id}" title="Remove">&times;</button>
      </div>
    `).join('');

    group.innerHTML = `
      <div class="wae-history-header">
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/>
          <path d="M7 4v3.5l2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Recent prompts
        <button class="wae-history-delete-all" title="Clear all recent prompts">
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
            <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8M5.5 6v4M8.5 6v4"
              stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      ${listHtml}
    `;

    group.querySelectorAll('.wae-history-item').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('.wae-history-item__del')) return;
        chatInput.value = recent[Number(el.dataset.idx)].prompt;
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
        chatInput.focus();
      });
    });

    group.querySelectorAll('.wae-history-item__del').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        await window.db.workflowLayerPromptHistory.delete(+btn.dataset.id);
        await this._loadHistory(messagesEl, chatInput);
      });
    });

    group.querySelector('.wae-history-delete-all').addEventListener('click', async () => {
      await window.db.workflowLayerPromptHistory.deleteAll({
        project_id: this._projectId,
        layer_id:   this._layerId,
      });
      await this._loadHistory(messagesEl, chatInput);
    });

    const emptyEl = messagesEl.querySelector('.wae-empty');
    if (emptyEl) emptyEl.remove();
    messagesEl.insertBefore(group, messagesEl.firstChild);
  }

  async _saveHistory(prompt) {
    if (!prompt || !this._layerId) return;
    const existing = await window.db.workflowLayerPromptHistory.list({
      project_id: this._projectId,
      layer_id:   this._layerId,
    });
    if (existing.some(e => e.prompt === prompt)) return;
    await window.db.workflowLayerPromptHistory.create({
      project_id: this._projectId,
      layer_id:   this._layerId,
      prompt,
    });
  }

  // ----------------------------------------------------------------
  // Step 1 — generate a plan (no file writes)
  // ----------------------------------------------------------------
  async _run(chatInput, messagesEl) {
    const desc = chatInput.value.trim();
    if (!desc) { chatInput.focus(); return; }

    if (!this._modelConfig) {
      await Dialog.alert('No AI model configured. Please select a model on the Workflows page first.');
      return;
    }

    chatInput.value = '';
    chatInput.style.height = 'auto';
    this._hideDropdown();

    messagesEl.querySelector('.wae-history-group')?.remove();
    messagesEl.querySelector('.wae-empty')?.remove();

    // User bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'wae-msg wae-msg--user';
    userBubble.textContent = desc;
    messagesEl.appendChild(userBubble);

    // Expand any @file references before building prompts
    const expandedDesc = await this._expandFileRefs(desc);

    // Plan bubble — streams Step 1 response
    const planBubble = document.createElement('div');
    planBubble.className = 'wae-msg wae-msg--plan';
    planBubble.innerHTML = `
      <div class="wae-generating">
        <span class="wae-stream-dot"></span>
        <span class="wae-gen-label">Confirming understanding… 0s</span>
        <button class="wae-cancel-btn">Cancel</button>
      </div>
      <pre class="wae-stream-pre"></pre>
    `;
    messagesEl.appendChild(planBubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // layerPrompt is the stable layer context — passed as systemPrompt so the
    // API can cache it across both steps and across repeated sends in a session.
    const systemPrompt = this._layerPrompt || undefined;

    const planPrompt =
      `---\nDesign request:\n${expandedDesc}\n\n` +
      `---\nConfirm your understanding of this request in 2-3 sentences.\n` +
      `Describe what will change visually and what the intended result looks like.\n` +
      `No code, no file paths, no implementation details.`;

    const applyPrompt = `---\nAdditional design requirements:\n${expandedDesc}`;

    const genStart = Date.now();
    const genTimer = setInterval(() => {
      const el = planBubble.querySelector('.wae-gen-label');
      if (!el) { clearInterval(genTimer); return; }
      const s = Math.floor((Date.now() - genStart) / 1000);
      el.textContent = `Confirming understanding… ${s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`}`;
    }, 1000);

    window.app.wfAiEditChat.offAll();

    window.app.wfAiEditChat.onToken(({ text }) => {
      const pre = planBubble.querySelector('.wae-stream-pre');
      if (pre) { pre.textContent += text; messagesEl.scrollTop = messagesEl.scrollHeight; }
    });

    window.app.wfAiEditChat.onDone(({ raw, error }) => {
      clearInterval(genTimer);
      window.app.wfAiEditChat.offAll();

      if (error) {
        planBubble.innerHTML = `
          <div class="wae-response wae-response--err">
            <div class="wae-bubble-header">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 13H2L8 2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                <path d="M8 7v3M8 11.5v.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              </svg>
              ${escHtml(error)}
            </div>
            <pre class="wae-stream-pre">${escHtml(raw || '(no output)')}</pre>
          </div>
        `;
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return;
      }

      const planText = raw || '';
      planBubble.innerHTML = `
        <div class="wae-bubble-header">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          Understanding
        </div>
        <pre class="wae-plan-pre">${escHtml(planText)}</pre>
        <div class="wae-bubble-actions">
          <button class="wae-apply-btn">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.3"/>
              <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Apply Changes
          </button>
          <button class="wae-cancel-plan-btn">Cancel</button>
        </div>
      `;
      messagesEl.scrollTop = messagesEl.scrollHeight;

      planBubble.querySelector('.wae-cancel-plan-btn').addEventListener('click', () => {
        planBubble.querySelector('.wae-bubble-actions').remove();
        const note = document.createElement('div');
        note.className = 'wae-cancelled';
        note.textContent = 'Cancelled';
        planBubble.appendChild(note);
      });

      planBubble.querySelector('.wae-apply-btn').addEventListener('click', () => {
        planBubble.querySelector('.wae-bubble-actions').remove();
        this._saveHistory(desc);
        this._applyChanges(applyPrompt, systemPrompt, messagesEl);
      });
    });

    planBubble.querySelector('.wae-cancel-btn').addEventListener('click', () => {
      clearInterval(genTimer);
      window.app.wfAiEditChat.cancel();
      window.app.wfAiEditChat.offAll();
      planBubble.innerHTML = `<div class="wae-cancelled">Cancelled</div>`;
    });

    // Step 1: cwd set so @file refs resolve; systemPrompt cached so layer context isn't re-tokenized
    window.app.wfAiEditChat.generate({ prompt: planPrompt, systemPrompt, model: this._modelConfig, cwd: this._cwd });
  }

  // ----------------------------------------------------------------
  // Step 2 — apply changes (CLI runs in project folder)
  // ----------------------------------------------------------------
  _applyChanges(applyPrompt, systemPrompt, messagesEl) {
    const applyBubble = document.createElement('div');
    applyBubble.className = 'wae-msg wae-msg--applying';
    applyBubble.innerHTML = `
      <div class="wae-generating">
        <span class="wae-stream-dot"></span>
        <span class="wae-gen-label">Applying changes… 0s</span>
        <button class="wae-cancel-btn">Cancel</button>
      </div>
      <pre class="wae-stream-pre"></pre>
    `;
    messagesEl.appendChild(applyBubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    const genStart = Date.now();
    const genTimer = setInterval(() => {
      const el = applyBubble.querySelector('.wae-gen-label');
      if (!el) { clearInterval(genTimer); return; }
      const s = Math.floor((Date.now() - genStart) / 1000);
      el.textContent = `Applying changes… ${s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`}`;
    }, 1000);

    window.app.wfAiEditChat.offAll();

    window.app.wfAiEditChat.onToken(({ text }) => {
      const pre = applyBubble.querySelector('.wae-stream-pre');
      if (pre) { pre.textContent += text; messagesEl.scrollTop = messagesEl.scrollHeight; }
    });

    window.app.wfAiEditChat.onDone(({ raw, error }) => {
      clearInterval(genTimer);
      window.app.wfAiEditChat.offAll();
      const rawText = raw || '';

      if (!error) {
        applyBubble.innerHTML = `
          <div class="wae-response wae-response--ok">
            <div class="wae-bubble-header">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.3"/>
                <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Changes applied
            </div>
            <pre class="wae-stream-pre">${escHtml(rawText)}</pre>
          </div>
        `;
      } else {
        applyBubble.innerHTML = `
          <div class="wae-response wae-response--err">
            <div class="wae-bubble-header">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 13H2L8 2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                <path d="M8 7v3M8 11.5v.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              </svg>
              ${escHtml(error || 'Error')}
            </div>
            <pre class="wae-stream-pre">${escHtml(rawText || '(no output)')}</pre>
          </div>
        `;
      }
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });

    applyBubble.querySelector('.wae-cancel-btn').addEventListener('click', () => {
      clearInterval(genTimer);
      window.app.wfAiEditChat.cancel();
      window.app.wfAiEditChat.offAll();
      applyBubble.innerHTML = `<div class="wae-cancelled">Cancelled</div>`;
    });

    // Step 2: systemPrompt cache hit saves layer context tokens on Apply
    window.app.wfAiEditChat.generate({ prompt: applyPrompt, systemPrompt, model: this._modelConfig, cwd: this._cwd });
  }
}
