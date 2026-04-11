import { escHtml, injectCss, timeAgo } from '../../../../shared/helpers.js';

/**
 * UserStoryDetail — renders the detail panel for a selected user story.
 *
 * Responsibilities:
 *   - Empty state placeholder
 *   - Inline Add form
 *   - Inline Edit form (with status select, prompt history, expand overlay, run buttons)
 *
 * Usage:
 *   const detail = new UserStoryDetail({ detailEl, projectId, getModel, onRunCommand, onRunCommandExternal, onStoryUpdated, onCancelled });
 *   await detail.mount();
 *   detail.setContext(featureId, statuses);
 *   detail.showEmpty();
 *   detail.showAddForm();
 *   detail.showEditForm(story);
 */
export class UserStoryDetail {
  constructor({ detailEl, projectId, getModel, onRunCommand, onRunCommandExternal, onPrintOutput, onStoryUpdated, onCancelled }) {
    this._detailEl               = detailEl;
    this._projectId              = projectId;
    this._getModel               = getModel || (() => null);
    this._onRunCommand           = onRunCommand || (() => {});
    this._onRunCommandExternal   = onRunCommandExternal || (() => {});
    this._onPrintOutput          = onPrintOutput || (() => {});
    this._onStoryUpdated         = onStoryUpdated || (() => {});
    this._onCancelled            = onCancelled || (() => {});
    this._featureId              = null;
    this._statuses               = [];
    this._ctrlSHandler           = null;
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------
  async mount() {
    injectCss('pages/project/components/user-story-detail/user-story-detail.css');
  }

  /** Update context when a new feature is selected */
  setContext(featureId, statuses) {
    this._featureId = featureId;
    this._statuses  = statuses || [];
  }

  /** Show placeholder when no story is selected */
  showEmpty() {
    if (!this._detailEl) return;
    this._detailEl.innerHTML = `
      <div class="usl-detail-empty">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="12" stroke="#4b5563" stroke-width="1.4"/>
          <path d="M16 11v5l3 3" stroke="#4b5563" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p>Select a user story</p>
      </div>
    `;
  }

  /** Render inline add form inside the detail panel */
  showAddForm() {
    if (!this._detailEl) return;

    const backlog       = this._statuses.find(s => s.name === 'Backlog');
    const defaultStatus = backlog ? backlog.id : '';

    this._detailEl.innerHTML = `
      <div class="usl-add-form">
        <div class="usl-add-form__header">
          <h2 class="usl-add-form__title">Add User Story</h2>
        </div>
        <div class="usl-add-form__body">

          <div class="usl-add-form__field">
            <label class="usl-add-form__label" for="uslAddTitle">
              Title <span class="usl-add-form__required">*</span>
            </label>
            <input
              class="usl-add-form__input"
              id="uslAddTitle"
              type="text"
              placeholder="As a user, I want to…"
              maxlength="200"
              autocomplete="off"
            />
          </div>

          <div class="usl-add-form__field usl-add-form__field--desc">
            <div class="usl-add-form__label-row">
              <label class="usl-add-form__label" for="uslAddDesc">Description</label>
              <button class="usl-add-form__expand" type="button" data-expand="uslAddDesc" title="Expand" aria-label="Expand Description">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 10v4h-4M2 6V2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
            <textarea class="usl-add-form__textarea" id="uslAddDesc" placeholder="Describe the story…" rows="3"></textarea>
          </div>

          <div class="usl-add-form__field usl-add-form__field--ac">
            <div class="usl-add-form__label-row">
              <label class="usl-add-form__label" for="uslAddAC">Acceptance Criteria</label>
              <button class="usl-add-form__expand" type="button" data-expand="uslAddAC" title="Expand" aria-label="Expand Acceptance Criteria">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 10v4h-4M2 6V2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
            <textarea class="usl-add-form__textarea" id="uslAddAC" placeholder="Given… When… Then…" rows="3"></textarea>
          </div>

          <div class="usl-add-form__field usl-add-form__field--prompt">
            <div class="usl-add-form__label-row">
              <label class="usl-add-form__label" for="uslAddPrompt">Prompt</label>
              <div class="usl-add-form__label-actions">
                <button class="usl-add-form__run usl-add-form__run--external" type="button" data-prompt="uslAddPrompt" title="Run in external PowerShell window" aria-label="Run in PowerShell">
                  <svg width="14" height="12" viewBox="0 0 20 16" fill="none"><path d="M2 3l7 5-7 5V3z" fill="currentColor"/><path d="M9 3l7 5-7 5V3z" fill="currentColor" opacity="0.5"/></svg>
                </button>
                <button class="usl-add-form__expand" type="button" data-expand="uslAddPrompt" title="Expand" aria-label="Expand Prompt">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 10v4h-4M2 6V2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
              </div>
            </div>
            <textarea class="usl-add-form__textarea" id="uslAddPrompt" placeholder="AI prompt for this story…" rows="6"></textarea>
          </div>

          <div class="usl-add-form__field usl-add-form__field--quickprompt">
            <div class="usl-add-form__label-row">
              <label class="usl-add-form__label" for="uslAddQuickPrompt">Quick Prompt</label>
              <div class="usl-add-form__label-actions">
                <button class="usl-add-form__run usl-add-form__run--quick" type="button" data-quickprompt="uslAddQuickPrompt" data-preview="uslAddQuickCmdPreview" title="Run in console (Ctrl+Q)" aria-label="Run quick prompt">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 3l9 5-9 5V3z" fill="currentColor"/></svg>
                </button>
              </div>
            </div>
            <div class="usl-quick-cmd-preview" id="uslAddQuickCmdPreview">$ claude --dangerously-skip-permissions --print ("…")</div>
            <textarea class="usl-add-form__textarea" id="uslAddQuickPrompt" placeholder="Quick prompt to run in console…" rows="3"></textarea>
          </div>

          <div class="usl-add-form__field">
            <label class="usl-add-form__label" for="uslAddStatus">Status</label>
            <select class="usl-add-form__select" id="uslAddStatus">
              <option value="">— none —</option>
              ${this._statuses.map(st =>
                `<option value="${st.id}"${st.id === defaultStatus ? ' selected' : ''}>${escHtml(st.name)}</option>`
              ).join('')}
            </select>
          </div>

        </div>
        <div class="usl-add-form__footer">
          <button class="usl-add-form__btn usl-add-form__btn--cancel">Cancel</button>
          <button class="usl-add-form__btn usl-add-form__btn--save">Add User Story</button>
        </div>
      </div>
    `;

    const titleEl  = this._detailEl.querySelector('#uslAddTitle');
    const descEl   = this._detailEl.querySelector('#uslAddDesc');
    const acEl     = this._detailEl.querySelector('#uslAddAC');
    const promptEl = this._detailEl.querySelector('#uslAddPrompt');
    const statusEl = this._detailEl.querySelector('#uslAddStatus');
    const saveBtn  = this._detailEl.querySelector('.usl-add-form__btn--save');

    titleEl.focus();
    this._bindExpandBtns(this._detailEl);
    this._bindRunBtns(this._detailEl);
    this._bindQuickRunBtns(this._detailEl);

    this._detailEl.querySelector('.usl-add-form__btn--cancel')
      .addEventListener('click', () => this.showEmpty());

    const save = async () => {
      const title = titleEl.value.trim();
      if (!title) {
        titleEl.classList.add('usl-add-form__input--error');
        titleEl.focus();
        return;
      }
      titleEl.classList.remove('usl-add-form__input--error');
      saveBtn.disabled    = true;
      saveBtn.textContent = 'Adding…';

      try {
        await window.db.userStories.create({
          feature_id:          this._featureId,
          project_id:          this._projectId,
          title,
          description:         descEl.value.trim()   || null,
          acceptance_criteria: acEl.value.trim()     || null,
          prompt:              promptEl.value.trim() || null,
          status_id:           statusEl.value ? parseInt(statusEl.value, 10) : null,
        });
        this.showEmpty();
        this._onStoryUpdated();
      } catch {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Add User Story';
      }
    };

    saveBtn.addEventListener('click', save);
    titleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    this._bindCtrlS(save);
  }

  /** Render inline edit form inside the detail panel */
  showEditForm(story) {
    if (!this._detailEl) return;

    const defaultStatus = story.status_id ?? '';

    this._detailEl.innerHTML = `
      <div class="usl-add-form">
        <div class="usl-add-form__header">
          <h2 class="usl-add-form__title">User Story</h2>
          <select class="usl-add-form__status-select" id="uslEditStatus">
            <option value="">— none —</option>
            ${this._statuses.map(st =>
              `<option value="${st.id}"${st.id === defaultStatus ? ' selected' : ''}>${escHtml(st.name)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="usl-add-form__body">

          <div class="usl-add-form__field">
            <label class="usl-add-form__label" for="uslEditTitle">
              Title <span class="usl-add-form__required">*</span>
            </label>
            <input
              class="usl-add-form__input"
              id="uslEditTitle"
              type="text"
              placeholder="As a user, I want to…"
              maxlength="200"
              autocomplete="off"
              value="${escHtml(story.title)}"
            />
          </div>

          <div class="usl-add-form__field usl-add-form__field--desc">
            <div class="usl-add-form__label-row">
              <label class="usl-add-form__label" for="uslEditDesc">Description</label>
              <button class="usl-add-form__expand" type="button" data-expand="uslEditDesc" title="Expand" aria-label="Expand Description">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 10v4h-4M2 6V2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
            <textarea class="usl-add-form__textarea" id="uslEditDesc" placeholder="Describe the story…" rows="3">${escHtml(story.description || '')}</textarea>
          </div>

          <div class="usl-add-form__field usl-add-form__field--ac">
            <div class="usl-add-form__label-row">
              <label class="usl-add-form__label" for="uslEditAC">Acceptance Criteria</label>
              <button class="usl-add-form__expand" type="button" data-expand="uslEditAC" title="Expand" aria-label="Expand Acceptance Criteria">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 10v4h-4M2 6V2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
            <textarea class="usl-add-form__textarea" id="uslEditAC" placeholder="Given… When… Then…" rows="3">${escHtml(story.acceptance_criteria || '')}</textarea>
          </div>

          <div class="usl-add-form__field usl-add-form__field--prompt">
            <div class="usl-add-form__label-row">
              <label class="usl-add-form__label" for="uslEditPrompt">Prompt</label>
              <div class="usl-add-form__label-actions">
                <button class="usl-add-form__run usl-add-form__run--external" type="button" data-prompt="uslEditPrompt" title="Run in external PowerShell window" aria-label="Run in PowerShell">
                  <svg width="14" height="12" viewBox="0 0 20 16" fill="none"><path d="M2 3l7 5-7 5V3z" fill="currentColor"/><path d="M9 3l7 5-7 5V3z" fill="currentColor" opacity="0.5"/></svg>
                </button>
                <button class="usl-add-form__expand" type="button" data-expand="uslEditPrompt" title="Expand" aria-label="Expand Prompt">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 10v4h-4M2 6V2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
              </div>
            </div>
            <textarea class="usl-add-form__textarea" id="uslEditPrompt" placeholder="AI prompt for this story…" rows="6">${escHtml(story.prompt || '')}</textarea>
          </div>

          <div class="usl-add-form__field usl-add-form__field--quickprompt">
            <div class="usl-add-form__label-row">
              <label class="usl-add-form__label" for="uslEditQuickPrompt">Quick Prompt</label>
              <div class="usl-add-form__label-actions">
                <button class="usl-add-form__run usl-add-form__run--quick" type="button" data-quickprompt="uslEditQuickPrompt" data-preview="uslEditQuickCmdPreview" title="Run in console (Ctrl+Q)" aria-label="Run quick prompt">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 3l9 5-9 5V3z" fill="currentColor"/></svg>
                </button>
              </div>
            </div>
            <div class="usl-quick-cmd-preview" id="uslEditQuickCmdPreview">$ claude --dangerously-skip-permissions --print ("…")</div>
            <textarea class="usl-add-form__textarea" id="uslEditQuickPrompt" placeholder="Quick prompt to run in console…" rows="3"></textarea>
            <div class="usl-prompt-history" id="uslPromptHistory"></div>
          </div>

        </div>
        <div class="usl-add-form__footer">
          <button class="usl-add-form__btn usl-add-form__btn--cancel">Cancel</button>
          <button class="usl-add-form__btn usl-add-form__btn--save">Save Changes</button>
        </div>
      </div>
    `;

    const titleEl  = this._detailEl.querySelector('#uslEditTitle');
    const descEl   = this._detailEl.querySelector('#uslEditDesc');
    const acEl     = this._detailEl.querySelector('#uslEditAC');
    const promptEl = this._detailEl.querySelector('#uslEditPrompt');
    const statusEl = this._detailEl.querySelector('#uslEditStatus');
    const saveBtn  = this._detailEl.querySelector('.usl-add-form__btn--save');

    // Normalise literal \n sequences to real newlines (e.g. from JSON import)
    if (promptEl.value.includes('\\n')) {
      promptEl.value = promptEl.value.replace(/\\n/g, '\n');
    }

    // Auto-save status immediately on change
    statusEl.addEventListener('change', async () => {
      try {
        await window.db.userStories.update({
          id:        story.id,
          status_id: statusEl.value ? parseInt(statusEl.value, 10) : null,
        });
        this._onStoryUpdated();
      } catch { /* silent */ }
    });

    const save = async () => {
      const title = titleEl.value.trim();
      if (!title) {
        titleEl.classList.add('usl-add-form__input--error');
        titleEl.focus();
        return;
      }
      titleEl.classList.remove('usl-add-form__input--error');
      saveBtn.disabled    = true;
      saveBtn.textContent = 'Saving…';

      try {
        await window.db.userStories.update({
          id:                  story.id,
          title,
          description:         descEl.value.trim()   || null,
          acceptance_criteria: acEl.value.trim()     || null,
          prompt:              promptEl.value.trim() || null,
          status_id:           statusEl.value ? parseInt(statusEl.value, 10) : null,
        });
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Save Changes';
        this._onStoryUpdated();
      } catch {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Save Changes';
      }
    };

    saveBtn.addEventListener('click', save);
    this._bindCtrlS(save);
    this._bindExpandBtns(this._detailEl, save);
    this._bindRunBtns(this._detailEl, story.id);
    this._bindQuickRunBtns(this._detailEl, story.id);
    this._loadPromptHistory(story.id);

    this._detailEl.querySelector('.usl-add-form__btn--cancel').addEventListener('click', () => {
      this._onCancelled();
      this.showEmpty();
    });
  }

  // ----------------------------------------------------------------
  // Ctrl+S binding
  // ----------------------------------------------------------------
  _bindCtrlS(handler) {
    if (this._ctrlSHandler) {
      this._detailEl.removeEventListener('keydown', this._ctrlSHandler);
    }
    this._ctrlSHandler = (e) => {
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); handler(); }
    };
    this._detailEl.addEventListener('keydown', this._ctrlSHandler);
  }

  // ----------------------------------------------------------------
  // Expand helper — wires expand buttons in a container
  // ----------------------------------------------------------------
  _bindExpandBtns(container, onDone) {
    container.querySelectorAll('.usl-add-form__expand').forEach(btn => {
      btn.addEventListener('click', () => {
        const textarea  = container.querySelector('#' + btn.dataset.expand);
        const row       = btn.closest('.usl-add-form__label-row');
        const labelEl   = row ? row.querySelector('.usl-add-form__label') : null;
        const labelText = labelEl ? labelEl.textContent.trim() : '';
        const isPrompt  = btn.dataset.expand.toLowerCase().includes('prompt');
        this._openExpandOverlay(textarea, labelText, onDone, isPrompt);
      });
    });
  }

  // ----------------------------------------------------------------
  // Run button helpers
  // ----------------------------------------------------------------

  // Returns a resolved config object, falling back to a legacy-compatible default.
  _resolvedConfig() {
    const cfg = this._getModel();
    if (!cfg) return { type: 'cli', executable: 'claude', flags: '--dangerously-skip-permissions --print', input_mode: 'pipe' };
    // Legacy: if a plain string was passed (shouldn't happen post-refactor but guard anyway)
    if (typeof cfg === 'string') {
      const exe = cfg === 'gemini-cli' ? 'gemini' : 'claude';
      const flags = cfg === 'gemini-cli' ? '' : '--dangerously-skip-permissions --print';
      return { type: 'cli', executable: exe, flags, input_mode: 'pipe' };
    }
    return cfg;
  }

  _buildExternalCmd(prompt) {
    const cfg = this._resolvedConfig();
    if (cfg.type === 'api') {
      // External window doesn't apply for API — fall back to a no-op placeholder
      return null;
    }
    const exe = cfg.executable || 'claude';
    // Always use heredoc for external (handles multiline prompts safely)
    return `$p = @'\n${prompt}\n'@\n${exe} $p`;
  }

  _buildQuickCmd(prompt) {
    const cfg = this._resolvedConfig();
    if (cfg.type === 'api') return null; // handled via _runApiPrompt
    const exe   = cfg.executable || 'claude';
    const flags = cfg.flags ? ` ${cfg.flags}` : '';
    if (cfg.input_mode === 'heredoc') {
      return `$p = @'\n${prompt}\n'@\n${exe}${flags} $p`;
    }
    // pipe mode
    return `$p = @'\n${prompt}\n'@\nWrite-Output $p | ${exe}${flags}`;
  }

  _quickCmdPreviewText(snippet) {
    const cfg = this._resolvedConfig();
    if (cfg.type === 'api') {
      const name = cfg.label || cfg.model_name || 'API';
      return `→ ${name} ("${snippet}")`;
    }
    const exe   = cfg.executable || 'claude';
    const flags = cfg.flags ? ` ${cfg.flags}` : '';
    return `$ ${exe}${flags} ("${snippet}")`;
  }

  async _runApiPrompt(prompt, userStoryId) {
    const cfg = this._resolvedConfig();
    const baseUrl = (cfg.base_url || '').replace(/\/$/, '');
    if (!baseUrl) {
      this._onPrintOutput('API model error: base_url is not configured.', { label: cfg.label || 'API', isError: true });
      return;
    }

    const label = cfg.label || cfg.model_name || 'API';
    this._onPrintOutput('', { label: `▶ ${label}` });

    if (userStoryId) {
      await window.db.promptHistory.create({ user_story_id: userStoryId, prompt });
      this._loadPromptHistory(userStoryId);
    }

    const body = {
      model: cfg.model_name || 'default',
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    };
    if (cfg.max_tokens) body.max_tokens = cfg.max_tokens;

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (cfg.api_key) headers['Authorization'] = `Bearer ${cfg.api_key}`;

      const res = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const errText = await res.text();
        this._onPrintOutput(`HTTP ${res.status}: ${errText}`, { isError: true });
        return;
      }
      const json = await res.json();
      const text = json.choices?.[0]?.message?.content ?? JSON.stringify(json, null, 2);
      this._onPrintOutput(text);
    } catch (err) {
      this._onPrintOutput(`API call failed: ${err.message}`, { isError: true });
    }
  }

  _bindRunBtns(container, userStoryId = null) {
    container.querySelectorAll('.usl-add-form__run--external').forEach(btn => {
      btn.addEventListener('click', async () => {
        const textarea = container.querySelector('#' + btn.dataset.prompt);
        const prompt   = textarea ? textarea.value.trim() : '';
        if (!prompt) return;
        const cfg = this._resolvedConfig();
        if (cfg.type === 'api') {
          this._runApiPrompt(prompt, userStoryId);
        } else {
          const cmd = this._buildExternalCmd(prompt);
          if (cmd) this._onRunCommandExternal(cmd);
        }
      });
    });
  }

  _bindQuickRunBtns(container, userStoryId = null) {
    container.querySelectorAll('.usl-add-form__run--quick').forEach(btn => {
      const taId      = btn.dataset.quickprompt;
      const prevId    = btn.dataset.preview;
      const textarea  = taId  ? container.querySelector('#' + taId)  : null;
      const previewEl = prevId ? container.querySelector('#' + prevId) : null;

      // Live command preview as user types
      if (textarea && previewEl) {
        const updatePreview = () => {
          const text    = textarea.value.trim();
          const isMulti = text.includes('\n');
          const snippet = isMulti
            ? text.split('\n')[0].trim() + ' …'
            : (text || '…');
          previewEl.textContent = this._quickCmdPreviewText(snippet);
        };
        textarea.addEventListener('input', updatePreview);
      }

      const run = async () => {
        const prompt = textarea ? textarea.value.trim() : '';
        if (!prompt) return;
        const cfg = this._resolvedConfig();
        if (cfg.type === 'api') {
          await this._runApiPrompt(prompt, userStoryId);
        } else {
          if (userStoryId) {
            await window.db.promptHistory.create({ user_story_id: userStoryId, prompt });
            this._loadPromptHistory(userStoryId);
          }
          const cmd = this._buildQuickCmd(prompt);
          if (cmd) this._onRunCommand(cmd);
        }
        // Clear after run
        if (textarea) {
          textarea.value = '';
          textarea.dispatchEvent(new Event('input')); // reset preview
        }
      };

      btn.addEventListener('click', run);

      // Ctrl+Q shortcut — fires run when Quick Prompt textarea is focused
      if (textarea) {
        textarea.addEventListener('keydown', (e) => {
          if (e.ctrlKey && e.key === 'q') {
            e.preventDefault();
            run();
          }
        });
      }
    });
  }

  // ----------------------------------------------------------------
  // Prompt history
  // ----------------------------------------------------------------
  async _loadPromptHistory(userStoryId) {
    const container = this._detailEl.querySelector('#uslPromptHistory');
    if (!container) return;
    const items = await window.db.promptHistory.list(userStoryId);
    if (items.length === 0) {
      container.innerHTML = '';
      return;
    }
    const quickPromptEl = this._detailEl.querySelector('#uslEditQuickPrompt');
    container.innerHTML = `
      <div class="usl-ph-header">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/>
          <path d="M8 5v3.5l2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Recent runs
        <button class="usl-ph-delete-all" title="Clear all recent runs" aria-label="Clear all">
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
            <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8M5.5 6v4M8.5 6v4"
              stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <div class="usl-ph-list">
        ${items.map(h => `
          <div class="usl-ph-item" data-id="${h.id}" title="${escHtml(h.prompt)}">
            <svg class="usl-ph-item__icon" width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M4 3l9 5-9 5V3z" fill="currentColor" opacity="0.6"/>
            </svg>
            <span class="usl-ph-item__text">${escHtml(h.prompt.length > 80 ? h.prompt.slice(0, 80) + '…' : h.prompt)}</span>
            <span class="usl-ph-item__time">${timeAgo(h.executed_at)}</span>
          </div>
        `).join('')}
      </div>
    `;
    container.querySelectorAll('.usl-ph-item').forEach((el, i) => {
      el.addEventListener('click', () => {
        if (quickPromptEl) {
          quickPromptEl.value = items[i].prompt;
          quickPromptEl.dispatchEvent(new Event('input'));
          quickPromptEl.focus();
        }
      });
    });
    container.querySelector('.usl-ph-delete-all').addEventListener('click', async () => {
      await window.db.promptHistory.deleteAll(userStoryId);
      this._loadPromptHistory(userStoryId);
    });
  }

  // ----------------------------------------------------------------
  // Full-screen expand overlay for a textarea
  // ----------------------------------------------------------------
  _openExpandOverlay(textarea, label, onDone, isPrompt = false) {
    const overlay = document.createElement('div');
    overlay.className = 'usl-expand-overlay';
    overlay.innerHTML = `
      <div class="usl-expand-dialog">
        <div class="usl-expand-header">
          <span class="usl-expand-title">${escHtml(label)}</span>
          ${isPrompt ? `
          <div class="usl-expand-tabs">
            <button class="usl-expand-tab usl-expand-tab--active" data-tab="edit">Edit</button>
            <button class="usl-expand-tab" data-tab="preview">Preview</button>
          </div>` : ''}
          <button class="usl-expand-close" aria-label="Close">&times;</button>
        </div>
        ${isPrompt ? `
        <div class="usl-prompt-expand-wrap" data-pane="edit">
          <div class="usl-prompt-expand-bd" aria-hidden="true"></div>
          <textarea class="usl-expand-textarea usl-prompt-expand-ta" placeholder="${escHtml(textarea.placeholder || '')}">${escHtml(textarea.value)}</textarea>
        </div>
        <div class="usl-expand-preview" data-pane="preview" hidden></div>` : `
        <textarea class="usl-expand-textarea" placeholder="${escHtml(textarea.placeholder || '')}">${escHtml(textarea.value)}</textarea>`}
        <div class="usl-expand-footer">
          <button class="usl-expand-btn usl-expand-btn--done">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const expandTA = overlay.querySelector('.usl-expand-textarea');
    expandTA.focus();
    expandTA.setSelectionRange(expandTA.value.length, expandTA.value.length);

    if (isPrompt) {
      const bd         = overlay.querySelector('.usl-prompt-expand-bd');
      const editPane   = overlay.querySelector('[data-pane="edit"]');
      const previewPane = overlay.querySelector('[data-pane="preview"]');
      const tabs       = overlay.querySelectorAll('.usl-expand-tab');

      const syncBd = () => {
        bd.innerHTML = expandTA.value
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/^(#{5} .+)$/gm, '<span class="usl-hl-h5">$1</span>')
          .replace(/^(#{4} .+)$/gm, '<span class="usl-hl-h4">$1</span>')
          .replace(/^(#{3} .+)$/gm, '<span class="usl-hl-h3">$1</span>')
          .replace(/^(#{2} .+)$/gm, '<span class="usl-hl-h2">$1</span>')
          .replace(/^(# .+)$/gm,    '<span class="usl-hl-h1">$1</span>') + '\n';
        bd.scrollTop = expandTA.scrollTop;
      };
      expandTA.addEventListener('input', syncBd);
      expandTA.addEventListener('scroll', () => { bd.scrollTop = expandTA.scrollTop; });
      syncBd();

      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          tabs.forEach(t => t.classList.remove('usl-expand-tab--active'));
          tab.classList.add('usl-expand-tab--active');
          if (tab.dataset.tab === 'preview') {
            previewPane.innerHTML = this._renderMarkdown(expandTA.value);
            editPane.hidden    = true;
            previewPane.hidden = false;
          } else {
            editPane.hidden   = false;
            previewPane.hidden = true;
            expandTA.focus();
          }
        });
      });
    }

    const done = async () => {
      textarea.value = expandTA.value;
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
      if (onDone) await onDone();
    };

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        textarea.value = expandTA.value;
        overlay.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };

    overlay.querySelector('.usl-expand-btn--done').addEventListener('click', done);
    overlay.querySelector('.usl-expand-close').addEventListener('click', () => {
      textarea.value = expandTA.value;
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    });
    document.addEventListener('keydown', escHandler);
  }

  // ----------------------------------------------------------------
  // Inline markdown renderer (no external deps)
  // ----------------------------------------------------------------
  _renderMarkdown(text) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const lines    = text.split('\n');
    const out      = [];
    let inCode     = false;
    let codeLines  = [];
    let inUl       = false;
    let inOl       = false;
    // track last pushed block type to suppress redundant <br>
    let lastBlock  = '';

    const closeList = () => {
      if (inUl) { out.push('</ul>'); inUl = false; lastBlock = 'list'; }
      if (inOl) { out.push('</ol>'); inOl = false; lastBlock = 'list'; }
    };

    let inSvg    = false;
    let svgLines = [];

    for (const line of lines) {
      // SVG passthrough — collect raw lines between <svg and </svg>
      if (!inCode && !inSvg && line.trimStart().toLowerCase().startsWith('<svg')) {
        closeList();
        inSvg    = true;
        svgLines = [line];
        if (line.includes('</svg>')) {
          out.push(`<div class="md-svg">${svgLines.join('\n')}</div>`);
          svgLines = []; inSvg = false; lastBlock = 'svg';
        }
        continue;
      }
      if (inSvg) {
        svgLines.push(line);
        if (line.includes('</svg>')) {
          out.push(`<div class="md-svg">${svgLines.join('\n')}</div>`);
          svgLines = []; inSvg = false; lastBlock = 'svg';
        }
        continue;
      }

      // Fenced code blocks
      if (line.trimStart().startsWith('```')) {
        closeList();
        if (inCode) {
          out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
          codeLines = [];
          inCode    = false;
          lastBlock = 'code';
        } else {
          inCode = true;
        }
        continue;
      }
      if (inCode) { codeLines.push(esc(line)); continue; }

      // Headings
      const hm = line.match(/^(#{1,6})\s+(.*)/);
      if (hm) {
        closeList();
        const lvl = hm[1].length;
        out.push(`<h${lvl}>${esc(hm[2])}</h${lvl}>`);
        lastBlock = 'heading';
        continue;
      }

      // Horizontal rule
      if (/^[-*_]{3,}\s*$/.test(line)) {
        closeList();
        out.push('<hr>');
        lastBlock = 'hr';
        continue;
      }

      // Unordered list
      const ulm = line.match(/^[-*+]\s+(.*)/);
      if (ulm) {
        if (inOl) { out.push('</ol>'); inOl = false; }
        if (!inUl) { out.push('<ul>'); inUl = true; }
        out.push(`<li>${this._inlineMarkdown(esc(ulm[1]))}</li>`);
        lastBlock = 'list';
        continue;
      }

      // Ordered list
      const olm = line.match(/^\d+\.\s+(.*)/);
      if (olm) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (!inOl) { out.push('<ol>'); inOl = true; }
        out.push(`<li>${this._inlineMarkdown(esc(olm[1]))}</li>`);
        lastBlock = 'list';
        continue;
      }

      // Blockquote
      const bqm = line.match(/^>\s?(.*)/);
      if (bqm) {
        closeList();
        out.push(`<blockquote>${this._inlineMarkdown(esc(bqm[1]))}</blockquote>`);
        lastBlock = 'blockquote';
        continue;
      }

      // Blank line — only emit a spacer after plain paragraphs
      if (line.trim() === '') {
        closeList();
        if (lastBlock === 'p') { out.push('<br>'); lastBlock = 'br'; }
        continue;
      }

      closeList();
      out.push(`<p>${this._inlineMarkdown(esc(line))}</p>`);
      lastBlock = 'p';
    }

    closeList();
    if (inCode) out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
    return out.join('');
  }

  _inlineMarkdown(s) {
    return s
      .replace(/`([^`]+)`/g,          '<code>$1</code>')
      .replace(/\*\*\*(.+?)\*\*\*/g,  '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g,      '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,          '<em>$1</em>')
      .replace(/~~(.+?)~~/g,          '<del>$1</del>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  }
}
