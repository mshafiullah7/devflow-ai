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
  constructor({ detailEl, projectId, getModel, onRunCommand, onRunCommandExternal, onPrintOutput, onStoryUpdated, onCancelled, onOllamaPrompt }) {
    this._detailEl               = detailEl;
    this._projectId              = projectId;
    this._getModel               = getModel || (() => null);
    this._onRunCommand           = onRunCommand || (() => {});
    this._onRunCommandExternal   = onRunCommandExternal || (() => {});
    this._onPrintOutput          = onPrintOutput || (() => {});
    this._onStoryUpdated         = onStoryUpdated || (() => {});
    this._onCancelled            = onCancelled || (() => {});
    this._onOllamaPrompt         = onOllamaPrompt || (() => {});
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
          <div class="usl-view-toggle" id="uslAddViewToggle">
            <button class="usl-view-toggle__btn usl-view-toggle__btn--active" data-view="details">Details</button>
            <button class="usl-view-toggle__btn" data-view="prompts">Prompts</button>
            <button class="usl-view-toggle__btn" data-view="quickprompts">Quick Prompts</button>
          </div>
        </div>
        <div class="usl-add-form__body">

          <div class="usl-add-form__field" data-detail-field>
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

          <div class="usl-add-form__field usl-add-form__field--desc" data-detail-field>
            <div class="usl-add-form__label-row">
              <label class="usl-add-form__label" for="uslAddDesc">Description</label>
              <button class="usl-add-form__expand" type="button" data-expand="uslAddDesc" title="Expand" aria-label="Expand Description">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 10v4h-4M2 6V2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
            <textarea class="usl-add-form__textarea" id="uslAddDesc" placeholder="Describe the story…" rows="6"></textarea>
          </div>

          <div class="usl-add-form__field usl-add-form__field--ac" data-detail-field>
            <div class="usl-add-form__label-row">
              <label class="usl-add-form__label" for="uslAddAC">Acceptance Criteria</label>
              <button class="usl-add-form__expand" type="button" data-expand="uslAddAC" title="Expand" aria-label="Expand Acceptance Criteria">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 10v4h-4M2 6V2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
            <textarea class="usl-add-form__textarea" id="uslAddAC" placeholder="Given… When… Then…" rows="6"></textarea>
          </div>

          <div class="usl-add-form__field usl-add-form__field--prompt" data-prompt-field>
            <div class="usl-add-form__label-row">
              <label class="usl-add-form__label" for="uslAddPrompt">Prompt</label>
              <div class="usl-add-form__label-actions">
                <button class="usl-add-form__mark-executed" type="button" data-story-prompt title="Mark as Executed" aria-label="Mark as Executed">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2.5 8.5l3.5 3.5 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
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

          <div class="usl-prompts-section" data-prompt-field>
            <div class="usl-prompts-section__header">
              <span class="usl-prompts-section__title">Additional Prompts</span>
              <button class="usl-prompts-section__add-btn" id="uslAddPromptBtn" type="button" title="Add prompt">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                Add
              </button>
            </div>
            <div class="usl-prompts-list" id="uslAddPromptsList"></div>
          </div>

          <div class="usl-add-form__field usl-add-form__field--quickprompt" data-quickprompt-field>
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

          <div class="usl-add-form__field" data-detail-field>
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

    this._bindViewToggle(this._detailEl, 'details');
    this._bindPromptsSection(this._detailEl, null);
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
          <div class="usl-view-toggle" id="uslEditViewToggle">
            <button class="usl-view-toggle__btn usl-view-toggle__btn--active" data-view="details">Details</button>
            <button class="usl-view-toggle__btn" data-view="prompts">Prompts</button>
            <button class="usl-view-toggle__btn" data-view="quickprompts">Quick Prompts</button>
          </div>
          <select class="usl-add-form__status-select" id="uslEditStatus">
            <option value="">— none —</option>
            ${this._statuses.map(st =>
              `<option value="${st.id}"${st.id === defaultStatus ? ' selected' : ''}>${escHtml(st.name)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="usl-add-form__body">

          <div class="usl-add-form__field" data-detail-field>
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

          <div class="usl-add-form__field usl-add-form__field--desc" data-detail-field>
            <div class="usl-add-form__label-row">
              <label class="usl-add-form__label" for="uslEditDesc">Description</label>
              <button class="usl-add-form__expand" type="button" data-expand="uslEditDesc" title="Expand" aria-label="Expand Description">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 10v4h-4M2 6V2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
            <textarea class="usl-add-form__textarea" id="uslEditDesc" placeholder="Describe the story…" rows="6">${escHtml(story.description || '')}</textarea>
          </div>

          <div class="usl-add-form__field usl-add-form__field--ac" data-detail-field>
            <div class="usl-add-form__label-row">
              <label class="usl-add-form__label" for="uslEditAC">Acceptance Criteria</label>
              <button class="usl-add-form__expand" type="button" data-expand="uslEditAC" title="Expand" aria-label="Expand Acceptance Criteria">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 10v4h-4M2 6V2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
            <textarea class="usl-add-form__textarea" id="uslEditAC" placeholder="Given… When… Then…" rows="6">${escHtml(story.acceptance_criteria || '')}</textarea>
          </div>

          <div class="usl-add-form__field usl-add-form__field--prompt" data-prompt-field>
            <div class="usl-add-form__label-row">
              <label class="usl-add-form__label" for="uslEditPrompt">Prompt</label>
              <div class="usl-add-form__label-actions">
                <button class="usl-add-form__mark-executed${story.is_executed ? ' is-executed' : ''}" type="button" data-story-prompt title="${story.is_executed ? 'Executed' : 'Mark as Executed'}" aria-label="Mark as Executed">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2.5 8.5l3.5 3.5 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
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

          <div class="usl-prompts-section" data-prompt-field>
            <div class="usl-prompts-section__header">
              <span class="usl-prompts-section__title">Additional Prompts</span>
              <button class="usl-prompts-section__add-btn" id="uslEditPromptBtn" type="button" title="Add prompt">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                Add
              </button>
            </div>
            <div class="usl-prompts-list" id="uslEditPromptsList"></div>
          </div>

          <div class="usl-add-form__field usl-add-form__field--quickprompt" data-quickprompt-field>
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

    this._bindViewToggle(this._detailEl, 'details');
    this._bindPromptsSection(this._detailEl, story.id);
    this._loadPrompts(story.id);
    saveBtn.addEventListener('click', save);
    this._bindCtrlS(save);
    this._bindExpandBtns(this._detailEl, save);
    this._bindRunBtns(this._detailEl, story.id);
    this._bindQuickRunBtns(this._detailEl, story.id);
    this._bindMarkExecutedBtns(this._detailEl, story);
    this._loadPromptHistory(story.id);

    this._detailEl.querySelector('.usl-add-form__btn--cancel').addEventListener('click', () => {
      this._onCancelled();
      this.showEmpty();
    });
  }

  // ----------------------------------------------------------------
  // View toggle (Details / Prompts)
  // ----------------------------------------------------------------
  _bindViewToggle(container, defaultView = 'prompts') {
    const applyView = (view) => {
      container.querySelectorAll('[data-detail-field]').forEach(el => {
        el.style.display = view === 'details' ? '' : 'none';
      });
      container.querySelectorAll('[data-prompt-field]').forEach(el => {
        el.style.display = view === 'prompts' ? '' : 'none';
      });
      container.querySelectorAll('[data-quickprompt-field]').forEach(el => {
        el.style.display = view === 'quickprompts' ? '' : 'none';
      });
      container.querySelectorAll('.usl-view-toggle__btn').forEach(btn => {
        btn.classList.toggle('usl-view-toggle__btn--active', btn.dataset.view === view);
      });
      const footer = container.querySelector('.usl-add-form__footer');
      if (footer) {
        const isDetails = view === 'details';
        footer.querySelectorAll('button').forEach(btn => {
          btn.disabled = !isDetails;
        });
      }
    };

    container.querySelectorAll('.usl-view-toggle__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.view === 'quickprompts') {
          const consoleEl   = document.getElementById('projectConsole');
          const toggleBtn   = document.getElementById('btnConsoleToggle');
          const resizeHandle = document.querySelector('.project-panel__resize[data-resize="console"]');
          if (consoleEl?.classList.contains('project-console--collapsed')) {
            consoleEl.classList.remove('project-console--collapsed');
            consoleEl.style.flex = '0 0 25%';
            if (resizeHandle) resizeHandle.style.display = '';
            if (toggleBtn) {
              toggleBtn.title = 'Collapse console';
              toggleBtn.setAttribute('aria-label', 'Collapse console');
              const icon = toggleBtn.querySelector('.console-toggle-icon');
              if (icon) icon.innerHTML = '<path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
            }
          }
        }
        applyView(btn.dataset.view);
      });
    });

    applyView(defaultView);
  }

  // ----------------------------------------------------------------
  // Additional prompts CRUD section
  // ----------------------------------------------------------------
  _bindPromptsSection(container, userStoryId) {
    const addBtn = container.querySelector('#uslAddPromptBtn, #uslEditPromptBtn');
    if (!addBtn) return;
    addBtn.addEventListener('click', () => {
      const listEl = container.querySelector('#uslEditPromptsList, #uslAddPromptsList');
      if (!listEl) return;
      // New items start expanded so user can type immediately
      this._addPromptRow(listEl, userStoryId, null);
    });
  }

  async _loadPrompts(userStoryId) {
    if (!userStoryId) return;
    const list = await window.db.prompts.list(userStoryId);
    const container = this._detailEl;
    const listEl = container.querySelector('#uslEditPromptsList, #uslAddPromptsList');
    if (!listEl) return;
    listEl.innerHTML = '';
    list.forEach(p => this._addPromptRow(listEl, userStoryId, p));
  }

  _showConfirm(message, confirmLabel = 'Delete') {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'usl-confirm-overlay';
      overlay.innerHTML = `
        <div class="usl-confirm-dialog">
          <p class="usl-confirm-msg">${escHtml(message)}</p>
          <div class="usl-confirm-btns">
            <button class="usl-confirm-btn usl-confirm-btn--cancel">Cancel</button>
            <button class="usl-confirm-btn usl-confirm-btn--ok">${escHtml(confirmLabel)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const cleanup = (result) => { overlay.remove(); resolve(result); };
      overlay.querySelector('.usl-confirm-btn--cancel').addEventListener('click', () => cleanup(false));
      overlay.querySelector('.usl-confirm-btn--ok').addEventListener('click', () => cleanup(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
    });
  }

  _showRunDirModal(cmd) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'usl-confirm-overlay';
      overlay.innerHTML = `
        <div class="usl-confirm-dialog">
          <p class="usl-confirm-title">Run Prompt</p>
          <p class="usl-confirm-msg">Choose the directory to execute this prompt in:</p>
          <div class="usl-confirm-btns">
            <button class="usl-confirm-btn usl-confirm-btn--cancel">Cancel</button>
            <button class="usl-confirm-btn usl-confirm-btn--secondary" data-action="current">Current Directory</button>
            <button class="usl-confirm-btn usl-confirm-btn--ok" data-action="choose">Choose Folder…</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const cleanup = () => overlay.remove();

      overlay.querySelector('[data-action="current"]').addEventListener('click', () => {
        cleanup();
        this._onRunCommandExternal(cmd);
        resolve();
      });

      overlay.querySelector('[data-action="choose"]').addEventListener('click', async () => {
        cleanup();
        const folderPath = await window.db.dialog.openFolder();
        if (folderPath) {
          window.db.terminal.openExternal({ command: cmd, cwd: folderPath });
        }
        resolve();
      });

      overlay.querySelector('.usl-confirm-btn--cancel').addEventListener('click', () => { cleanup(); resolve(); });
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { cleanup(); resolve(); } });
    });
  }

  _getOrInitTabsContainer(listEl) {
    let bar = listEl.querySelector('.usl-ptabs__bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'usl-ptabs__bar';
      const contentEl = document.createElement('div');
      contentEl.className = 'usl-ptabs__content';
      listEl.appendChild(bar);
      listEl.appendChild(contentEl);
    }
    return {
      bar:     listEl.querySelector('.usl-ptabs__bar'),
      content: listEl.querySelector('.usl-ptabs__content'),
    };
  }

  _activateTab(tab, panel, bar, content) {
    bar.querySelectorAll('.usl-ptab').forEach(t => t.classList.remove('usl-ptab--active'));
    content.querySelectorAll('.usl-ptabs__panel').forEach(p => p.classList.remove('usl-ptabs__panel--active'));
    tab.classList.add('usl-ptab--active');
    panel.classList.add('usl-ptabs__panel--active');
  }

  _addPromptRow(listEl, userStoryId, existing) {
    const { bar, content } = this._getOrInitTabsContainer(listEl);

    const tag      = existing?.tag?.trim() || '';
    const tabCount = bar.querySelectorAll('.usl-ptab').length;
    const label    = tag || `Prompt ${tabCount + 1}`;

    // Panel
    const panel         = document.createElement('div');
    panel.className     = 'usl-ptabs__panel';
    panel.dataset.rowId = existing?.id ?? '';
    const isExecuted = !!existing?.is_executed;
    panel.innerHTML = `
      <div class="usl-ptabs__toolbar">
        <input class="usl-ptabs__tag-input" type="text" placeholder="Tab label (optional)" value="${escHtml(tag)}" autocomplete="off"/>
        <div class="usl-ptabs__actions">
          <button class="usl-ptabs__btn usl-ptabs__btn--mark-executed${isExecuted ? ' is-executed' : ''}" type="button" title="${isExecuted ? 'Executed' : 'Mark as Executed'}">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2.5 8.5l3.5 3.5 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="usl-ptabs__btn usl-ptabs__btn--run-ext" type="button" title="Run in external PowerShell window">
            <svg width="13" height="11" viewBox="0 0 20 16" fill="none"><path d="M2 3l7 5-7 5V3z" fill="currentColor"/><path d="M9 3l7 5-7 5V3z" fill="currentColor" opacity="0.5"/></svg>
          </button>
          <button class="usl-ptabs__btn usl-ptabs__btn--expand" type="button" title="Expand to full editor">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 10v4h-4M2 6V2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
      <textarea class="usl-ptabs__textarea" placeholder="Prompt text…">${escHtml(existing?.prompt || '')}</textarea>
    `;
    content.appendChild(panel);

    // Tab button
    const tab     = document.createElement('button');
    tab.className = 'usl-ptab';
    tab.type      = 'button';
    tab.innerHTML = `<span class="usl-ptab__label">${escHtml(label)}</span><span class="usl-ptab__close" title="Delete">×</span>`;
    bar.appendChild(tab);

    const tagInput = panel.querySelector('.usl-ptabs__tag-input');
    const taEl     = panel.querySelector('.usl-ptabs__textarea');
    const tabLabel = tab.querySelector('.usl-ptab__label');

    // Activate first tab automatically, or activate newly added tab
    this._activateTab(tab, panel, bar, content);
    if (!existing) taEl.focus();

    // Live-update tab label when tag changes
    tagInput.addEventListener('input', () => {
      const idx = Array.from(bar.querySelectorAll('.usl-ptab')).indexOf(tab);
      tabLabel.textContent = tagInput.value.trim() || `Prompt ${idx + 1}`;
    });

    // Tab click to switch
    tab.addEventListener('click', (e) => {
      if (e.target.closest('.usl-ptab__close')) return;
      this._activateTab(tab, panel, bar, content);
    });

    // Auto-save on blur
    const save = async () => {
      const prompt = taEl.value.trim();
      const tagVal = tagInput.value.trim() || null;
      if (!prompt) return;
      if (panel.dataset.rowId) {
        await window.db.prompts.update({ id: parseInt(panel.dataset.rowId), tag: tagVal, prompt });
      } else if (userStoryId) {
        const created = await window.db.prompts.create({ user_story_id: userStoryId, tag: tagVal, prompt });
        panel.dataset.rowId = created.id;
      }
    };
    tagInput.addEventListener('blur', save);
    taEl.addEventListener('blur', save);

    // Delete via × on tab
    tab.querySelector('.usl-ptab__close').addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await this._showConfirm('Delete this prompt tab?', 'Delete');
      if (!confirmed) return;
      if (panel.dataset.rowId) await window.db.prompts.delete(parseInt(panel.dataset.rowId));
      const wasActive = tab.classList.contains('usl-ptab--active');
      const allTabs   = Array.from(bar.querySelectorAll('.usl-ptab'));
      const idx       = allTabs.indexOf(tab);
      tab.remove();
      panel.remove();
      if (wasActive) {
        const remaining = bar.querySelectorAll('.usl-ptab');
        if (remaining.length > 0) {
          const newIdx   = Math.min(idx, remaining.length - 1);
          const newTab   = remaining[newIdx];
          const newPanel = content.querySelectorAll('.usl-ptabs__panel')[newIdx];
          this._activateTab(newTab, newPanel, bar, content);
        }
      }
    });

    // Mark as executed
    const markExecBtn = panel.querySelector('.usl-ptabs__btn--mark-executed');
    markExecBtn.addEventListener('click', async () => {
      const nowExecuted = !markExecBtn.classList.contains('is-executed');
      markExecBtn.classList.toggle('is-executed', nowExecuted);
      markExecBtn.title = nowExecuted ? 'Executed' : 'Mark as Executed';
      if (panel.dataset.rowId) {
        await window.db.prompts.update({ id: parseInt(panel.dataset.rowId), is_executed: nowExecuted ? 1 : 0 });
      }
    });

    // Run external
    panel.querySelector('.usl-ptabs__btn--run-ext').addEventListener('click', async () => {
      if (markExecBtn.classList.contains('is-executed')) {
        const ok = await this._showConfirm(
          'This prompt has already been marked as executed. Run again?', 'Run Again'
        );
        if (!ok) return;
      }
      await save();
      const prompt = taEl.value.trim();
      if (!prompt) return;
      const cfg = this._resolvedConfig();
      if (cfg.type === 'api') {
        this._runApiPrompt(prompt, userStoryId);
      } else if (cfg.type === 'ollama') {
        this._onRunCommand('/p ' + prompt);
      } else {
        const cmd = this._buildExternalCmd(prompt);
        if (cmd) await this._showRunDirModal(cmd);
      }
    });

    // Expand overlay
    panel.querySelector('.usl-ptabs__btn--expand').addEventListener('click', async () => {
      await save();
      this._openExpandOverlay(taEl, tagInput.value.trim() || 'Prompt', async () => { await save(); }, true);
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

  _ollamaCmd(agentPath, cfg) {
    const model = cfg.model_name || 'phi4-mini:latest';
    const host  = cfg.base_url  || 'http://localhost:11434';
    return `node "${agentPath}" --once --model ${model} --host ${host}`;
  }

  _buildExternalCmd(prompt) {
    const cfg = this._resolvedConfig();
    if (cfg.type === 'api') return null;
    if (cfg.type === 'ollama') {
      const agentPath = window._agentCliPath || 'agent-cli/index.js';
      return `$p = @'\n${prompt}\n'@\nWrite-Output $p | ${this._ollamaCmd(agentPath, cfg)}`;
    }
    const exe = cfg.executable || 'claude';
    return `$p = @'\n${prompt}\n'@\n${exe} $p`;
  }

  _buildQuickCmd(prompt) {
    const cfg = this._resolvedConfig();
    if (cfg.type === 'api') return null;
    if (cfg.type === 'ollama') {
      const agentPath = window._agentCliPath || 'agent-cli/index.js';
      return `$p = @'\n${prompt}\n'@\nWrite-Output $p | ${this._ollamaCmd(agentPath, cfg)}`;
    }
    const exe   = cfg.executable || 'claude';
    const flags = cfg.flags ? ` ${cfg.flags}` : '';
    if (cfg.input_mode === 'heredoc') {
      return `$p = @'\n${prompt}\n'@\n${exe}${flags} $p`;
    }
    return `$p = @'\n${prompt}\n'@\nWrite-Output $p | ${exe}${flags}`;
  }

  _quickCmdPreviewText(snippet) {
    const cfg = this._resolvedConfig();
    if (cfg.type === 'api') {
      const name = cfg.label || cfg.model_name || 'API';
      return `→ ${name} ("${snippet}")`;
    }
    if (cfg.type === 'ollama') {
      const model = cfg.model_name || 'phi4-mini:latest';
      return `→ ollama/${model} ("${snippet}")`;
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

    await this._saveToHistory(userStoryId, prompt);

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
        const markBtn = btn.closest('.usl-add-form__label-actions')
          ?.querySelector('.usl-add-form__mark-executed');
        const isExecuted = markBtn?.classList.contains('is-executed');
        if (isExecuted) {
          const ok = await this._showConfirm(
            'This prompt has already been marked as executed. Run again?', 'Run Again'
          );
          if (!ok) return;
        }
        const textarea = container.querySelector('#' + btn.dataset.prompt);
        const prompt   = textarea ? textarea.value.trim() : '';
        if (!prompt) return;
        const cfg = this._resolvedConfig();
        if (cfg.type === 'api') {
          this._runApiPrompt(prompt, userStoryId);
        } else if (cfg.type === 'ollama') {
          // Route through the console /p command — uses agent-cli with --dir
          this._onRunCommand('/p ' + prompt);
        } else {
          const cmd = this._buildExternalCmd(prompt);
          if (cmd) await this._showRunDirModal(cmd);
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
        } else if (cfg.type === 'ollama') {
          // Route through the console /p command — uses agent-cli with --dir
          await this._saveToHistory(userStoryId, prompt);
          this._onRunCommand('/p ' + prompt);
        } else {
          await this._saveToHistory(userStoryId, prompt);
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
  // Mark-executed button — main Prompt field (user story level)
  // ----------------------------------------------------------------
  _bindMarkExecutedBtns(container, story) {
    container.querySelectorAll('.usl-add-form__mark-executed[data-story-prompt]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const nowExecuted = !btn.classList.contains('is-executed');
        btn.classList.toggle('is-executed', nowExecuted);
        btn.title = nowExecuted ? 'Executed' : 'Mark as Executed';
        if (story?.id) {
          await window.db.userStories.update({ id: story.id, is_executed: nowExecuted ? 1 : 0 });
        }
      });
    });
  }

  // ----------------------------------------------------------------
  // Prompt history
  // ----------------------------------------------------------------
  async _saveToHistory(userStoryId, prompt) {
    if (!userStoryId) return;
    const existing = await window.db.promptHistory.list(userStoryId);
    const last = existing[existing.length - 1];
    if (last && last.prompt === prompt) return; // skip duplicate
    await window.db.promptHistory.create({ user_story_id: userStoryId, prompt });
    this._loadPromptHistory(userStoryId);
  }

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
