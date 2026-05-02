import { escHtml, injectCss } from '../../shared/helpers.js';

export class UserStoryDetail {
  constructor({ detailEl, projectId, getModel, onRunCommandExternal, onPrintOutput, onStoryUpdated, onCancelled, headerActionsEl }) {
    this._detailEl               = detailEl;
    this._headerActionsEl        = headerActionsEl || null;
    this._projectId              = projectId;
    this._getModel               = getModel || (() => null);
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
    injectCss('components/user-story-detail/user-story-detail.css');
  }

  /** Update context when a new feature is selected */
  setContext(featureId, statuses) {
    this._featureId = featureId;
    this._statuses  = statuses || [];
  }

  /** Show placeholder when no story is selected */
  showEmpty() {
    if (!this._detailEl) return;
    const headerActions = this._headerActionsEl || document.getElementById('storyDetailHeaderActions');
    if (headerActions) headerActions.innerHTML = '';
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
    const headerActions = this._headerActionsEl || document.getElementById('storyDetailHeaderActions');
    if (headerActions) headerActions.innerHTML = '';

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
            <textarea class="usl-add-form__textarea" id="uslAddDesc" placeholder="Describe the story…" rows="6"></textarea>
          </div>

          <div class="usl-add-form__field usl-add-form__field--ac">
            <div class="usl-add-form__label-row">
              <label class="usl-add-form__label" for="uslAddAC">Acceptance Criteria</label>
              <button class="usl-add-form__expand" type="button" data-expand="uslAddAC" title="Expand" aria-label="Expand Acceptance Criteria">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 10v4h-4M2 6V2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
            <textarea class="usl-add-form__textarea" id="uslAddAC" placeholder="Given… When… Then…" rows="6"></textarea>
          </div>

          <div class="usl-prompts-section">
            <div class="usl-prompts-section__header">
              <span class="usl-prompts-section__title">Prompts</span>
              <button class="usl-prompts-section__add-btn" id="uslAddPromptBtn" type="button" title="Add prompt">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                Add
              </button>
            </div>
            <div class="usl-prompts-list" id="uslAddPromptsList"></div>
          </div>

          <div class="usl-add-form__field" hidden>
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
          <button class="usl-add-form__btn usl-add-form__btn--save">Add User Story</button>
        </div>
      </div>
    `;

    const titleEl  = this._detailEl.querySelector('#uslAddTitle');
    const descEl   = this._detailEl.querySelector('#uslAddDesc');
    const acEl     = this._detailEl.querySelector('#uslAddAC');
    const statusEl = this._detailEl.querySelector('#uslAddStatus');
    const saveBtn  = this._detailEl.querySelector('.usl-add-form__btn--save');

    this._bindPromptsSection(this._detailEl, null);
    titleEl.focus();
    this._bindExpandBtns(this._detailEl);

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
    const headerActions = this._headerActionsEl || document.getElementById('storyDetailHeaderActions');
    if (headerActions) headerActions.innerHTML = '';

    const defaultStatus = story.status_id ?? '';

    this._detailEl.innerHTML = `
      <div class="usl-add-form">
        <div class="usl-add-form__header">
          <h2 class="usl-add-form__title">User Story</h2>
          <select class="usl-add-form__status-select" id="uslEditStatus" hidden>
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
            <textarea class="usl-add-form__textarea" id="uslEditDesc" placeholder="Describe the story…" rows="6">${escHtml(story.description || '')}</textarea>
          </div>

          <div class="usl-add-form__field usl-add-form__field--ac">
            <div class="usl-add-form__label-row">
              <label class="usl-add-form__label" for="uslEditAC">Acceptance Criteria</label>
              <button class="usl-add-form__expand" type="button" data-expand="uslEditAC" title="Expand" aria-label="Expand Acceptance Criteria">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 10v4h-4M2 6V2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
            <textarea class="usl-add-form__textarea" id="uslEditAC" placeholder="Given… When… Then…" rows="6">${escHtml(story.acceptance_criteria || '')}</textarea>
          </div>

          <div class="usl-prompts-section">
            <div class="usl-prompts-section__header">
              <span class="usl-prompts-section__title">Prompts</span>
              <button class="usl-prompts-section__add-btn" id="uslEditPromptBtn" type="button" title="Add prompt">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                Add
              </button>
            </div>
            <div class="usl-prompts-list" id="uslEditPromptsList"></div>
          </div>

        </div>
      </div>
    `;

    const titleEl  = this._detailEl.querySelector('#uslEditTitle');
    const descEl   = this._detailEl.querySelector('#uslEditDesc');
    const acEl     = this._detailEl.querySelector('#uslEditAC');
    const statusEl = this._detailEl.querySelector('#uslEditStatus');

    const saveBtn = document.createElement('button');
    saveBtn.className   = 'usl-add-form__btn usl-add-form__btn--save';
    saveBtn.textContent = 'Save Changes';
    if (headerActions) headerActions.appendChild(saveBtn);

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

    this._bindPromptsSection(this._detailEl, story.id);
    this._loadPrompts(story.id);
    saveBtn.addEventListener('click', save);
    this._bindCtrlS(save);
    this._bindExpandBtns(this._detailEl, save);

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
    const firstItem = listEl.querySelector('.usl-pl-item');
    if (firstItem) {
      firstItem.classList.add('usl-pl-item--open');
      firstItem.querySelector('.usl-pl-item__body').hidden = false;
    }
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

  _addPromptRow(listEl, userStoryId, existing) {
    const tag      = existing?.tag?.trim() || '';
    const itemCount = listEl.querySelectorAll('.usl-pl-item').length;
    const isExecuted = !!existing?.is_executed;

    const _buildLabel = (tagVal, promptText) => {
      const t = tagVal?.trim() || `Prompt ${itemCount + 1}`;
      const firstLine = (promptText || '').split('\n')[0].trim();
      const snippet = firstLine.length > 50 ? firstLine.slice(0, 50) + '…' : firstLine;
      return snippet ? `${t} — ${snippet}` : t;
    };
    const label = _buildLabel(tag, existing?.prompt || '');

    const item = document.createElement('div');
    item.className     = 'usl-pl-item';
    item.dataset.rowId = existing?.id ?? '';

    const statusIconExecuted = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2.5 8.5l3.5 3.5 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const statusIconPending  = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4"/></svg>`;

    item.innerHTML = `
      <div class="usl-pl-item__header">
        <span class="usl-pl-item__status ${isExecuted ? 'usl-pl-status--executed' : 'usl-pl-status--pending'}" title="${isExecuted ? 'Executed' : 'Not executed'}">
          ${isExecuted ? statusIconExecuted : statusIconPending}
        </span>
        <span class="usl-pl-item__label">${escHtml(label)}</span>
        <svg class="usl-pl-item__chevron" width="10" height="10" viewBox="0 0 16 16" fill="none">
          <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="usl-pl-item__body" hidden>
        <div class="usl-pl-item__toolbar">
          <input class="usl-pl-item__tag-input" type="text" placeholder="Label (optional)" value="${escHtml(tag)}" autocomplete="off"/>
          <div class="usl-pl-item__actions">
            <button class="usl-pl-item__btn usl-pl-item__btn--mark-executed${isExecuted ? ' is-executed' : ''}" type="button" title="${isExecuted ? 'Executed' : 'Mark as Executed'}">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2.5 8.5l3.5 3.5 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="usl-pl-item__btn usl-pl-item__btn--run-ext" type="button" title="Run in external PowerShell window">
              <svg width="13" height="11" viewBox="0 0 20 16" fill="none"><path d="M2 3l7 5-7 5V3z" fill="currentColor"/><path d="M9 3l7 5-7 5V3z" fill="currentColor" opacity="0.5"/></svg>
            </button>
            <button class="usl-pl-item__btn usl-pl-item__btn--expand" type="button" title="Expand to full editor">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M10 2h4v4M6 14H2v-4M14 10v4h-4M2 6V2h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="usl-pl-item__btn usl-pl-item__btn--delete" type="button" title="Delete prompt">
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8M5.5 6v4M8.5 6v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
        <textarea class="usl-pl-item__textarea" placeholder="Prompt text…">${escHtml(existing?.prompt || '')}</textarea>
      </div>
    `;

    listEl.appendChild(item);

    const headerEl   = item.querySelector('.usl-pl-item__header');
    const bodyEl     = item.querySelector('.usl-pl-item__body');
    const statusEl   = item.querySelector('.usl-pl-item__status');
    const labelEl    = item.querySelector('.usl-pl-item__label');
    const tagInput   = item.querySelector('.usl-pl-item__tag-input');
    const taEl       = item.querySelector('.usl-pl-item__textarea');
    const markExecBtn = item.querySelector('.usl-pl-item__btn--mark-executed');

    // Open new (unsaved) items immediately
    if (!existing) {
      item.classList.add('usl-pl-item--open');
      bodyEl.hidden = false;
      taEl.focus();
    }

    // Toggle open/close on header click — accordion: only one item open at a time
    headerEl.addEventListener('click', () => {
      const isOpen = item.classList.contains('usl-pl-item--open');
      listEl.querySelectorAll('.usl-pl-item').forEach(el => {
        el.classList.remove('usl-pl-item--open');
        el.querySelector('.usl-pl-item__body').hidden = true;
      });
      if (!isOpen) {
        item.classList.add('usl-pl-item--open');
        bodyEl.hidden = false;
      }
    });

    // Live-update label when tag or prompt changes
    const refreshLabel = () => {
      labelEl.textContent = _buildLabel(tagInput.value, taEl.value);
    };
    tagInput.addEventListener('input', refreshLabel);
    taEl.addEventListener('input', refreshLabel);

    // Auto-save on blur
    const save = async () => {
      const prompt = taEl.value.trim();
      const tagVal = tagInput.value.trim() || null;
      if (!prompt) return;
      if (item.dataset.rowId) {
        await window.db.prompts.update({ id: parseInt(item.dataset.rowId), tag: tagVal, prompt });
      } else if (userStoryId) {
        const created = await window.db.prompts.create({ user_story_id: userStoryId, tag: tagVal, prompt });
        item.dataset.rowId = created.id;
      }
    };
    tagInput.addEventListener('blur', save);
    taEl.addEventListener('blur', save);

    // Mark as executed
    markExecBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const nowExecuted = !markExecBtn.classList.contains('is-executed');
      markExecBtn.classList.toggle('is-executed', nowExecuted);
      markExecBtn.title = nowExecuted ? 'Executed' : 'Mark as Executed';
      statusEl.className = `usl-pl-item__status ${nowExecuted ? 'usl-pl-status--executed' : 'usl-pl-status--pending'}`;
      statusEl.title     = nowExecuted ? 'Executed' : 'Not executed';
      statusEl.innerHTML = nowExecuted ? statusIconExecuted : statusIconPending;
      if (item.dataset.rowId) {
        await window.db.prompts.update({ id: parseInt(item.dataset.rowId), is_executed: nowExecuted ? 1 : 0 });
      }
    });

    // Run external
    item.querySelector('.usl-pl-item__btn--run-ext').addEventListener('click', async (e) => {
      e.stopPropagation();
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
      } else {
        const cmd = this._buildExternalCmd(prompt);
        if (cmd) await this._showRunDirModal(cmd);
      }
    });

    // Expand overlay
    item.querySelector('.usl-pl-item__btn--expand').addEventListener('click', async (e) => {
      e.stopPropagation();
      await save();
      this._openExpandOverlay(taEl, tagInput.value.trim() || 'Prompt', async () => { await save(); }, true);
    });

    // Delete
    item.querySelector('.usl-pl-item__btn--delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await this._showConfirm('Delete this prompt?', 'Delete');
      if (!confirmed) return;
      if (item.dataset.rowId) await window.db.prompts.delete(parseInt(item.dataset.rowId));
      item.remove();
      // Re-number remaining items that still have default labels
      listEl.querySelectorAll('.usl-pl-item').forEach((el, i) => {
        const ti = el.querySelector('.usl-pl-item__tag-input');
        const ta = el.querySelector('.usl-pl-item__textarea');
        const li = el.querySelector('.usl-pl-item__label');
        if (ti && li) {
          const t = ti.value.trim() || `Prompt ${i + 1}`;
          const firstLine = (ta?.value || '').split('\n')[0].trim();
          const snippet = firstLine.length > 50 ? firstLine.slice(0, 50) + '…' : firstLine;
          li.textContent = snippet ? `${t} — ${snippet}` : t;
        }
      });
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

  _resolvedConfig() {
    const cfg = this._getModel();
    if (!cfg) return { type: 'cli', executable: 'claude', flags: '--dangerously-skip-permissions --print', input_mode: 'pipe' };
    if (typeof cfg === 'string') {
      const exe = cfg === 'gemini-cli' ? 'gemini' : 'claude';
      const flags = cfg === 'gemini-cli' ? '' : '--dangerously-skip-permissions --print';
      return { type: 'cli', executable: exe, flags, input_mode: 'pipe' };
    }
    return cfg;
  }

  _buildExternalCmd(prompt) {
    const cfg = this._resolvedConfig();
    if (cfg.type === 'api') return null;
    const exe = cfg.executable || 'claude';
    return `$p = @'\n${prompt}\n'@\n${exe} $p`;
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
            <button class="usl-expand-tab" data-tab="edit">Edit</button>
            <button class="usl-expand-tab usl-expand-tab--active" data-tab="preview">Preview</button>
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

      // Default to Preview tab on open
      previewPane.innerHTML = this._renderMarkdown(expandTA.value);
      editPane.hidden    = true;
      previewPane.hidden = false;

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
    let lastBlock  = '';

    const closeList = () => {
      if (inUl) { out.push('</ul>'); inUl = false; lastBlock = 'list'; }
      if (inOl) { out.push('</ol>'); inOl = false; lastBlock = 'list'; }
    };

    let inTable     = false;
    let tableLines  = [];

    const flushTable = () => {
      if (!inTable) return;
      inTable = false;
      if (tableLines.length < 2) {
        tableLines.forEach(l => out.push(`<p>${this._inlineMarkdown(esc(l))}</p>`));
        tableLines = [];
        lastBlock = 'p';
        return;
      }
      const parseRow = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const isSep    = r => /^\|?[\s\-|:]+\|?$/.test(r) && r.includes('-');
      const sepIdx   = tableLines.findIndex(isSep);
      const headRows = sepIdx > 0 ? tableLines.slice(0, sepIdx) : [];
      const bodyRows = tableLines.slice(sepIdx + 1);

      let html = '<table class="md-table">';
      if (headRows.length) {
        html += '<thead>';
        headRows.forEach(r => {
          html += '<tr>' + parseRow(r).map(c => `<th>${this._inlineMarkdown(esc(c))}</th>`).join('') + '</tr>';
        });
        html += '</thead>';
      }
      if (bodyRows.length) {
        html += '<tbody>';
        bodyRows.forEach(r => {
          html += '<tr>' + parseRow(r).map(c => `<td>${this._inlineMarkdown(esc(c))}</td>`).join('') + '</tr>';
        });
        html += '</tbody>';
      }
      html += '</table>';
      out.push(html);
      tableLines = [];
      lastBlock = 'table';
    };

    let inSvg    = false;
    let svgLines = [];

    for (const line of lines) {
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

      const hm = line.match(/^(#{1,6})\s+(.*)/);
      if (hm) {
        closeList();
        const lvl = hm[1].length;
        out.push(`<h${lvl}>${esc(hm[2])}</h${lvl}>`);
        lastBlock = 'heading';
        continue;
      }

      if (/^[-*_]{3,}\s*$/.test(line)) {
        closeList();
        out.push('<hr>');
        lastBlock = 'hr';
        continue;
      }

      const ulm = line.match(/^[-*+]\s+(.*)/);
      if (ulm) {
        if (inOl) { out.push('</ol>'); inOl = false; }
        if (!inUl) { out.push('<ul>'); inUl = true; }
        out.push(`<li>${this._inlineMarkdown(esc(ulm[1]))}</li>`);
        lastBlock = 'list';
        continue;
      }

      const olm = line.match(/^\d+\.\s+(.*)/);
      if (olm) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (!inOl) { out.push('<ol>'); inOl = true; }
        out.push(`<li>${this._inlineMarkdown(esc(olm[1]))}</li>`);
        lastBlock = 'list';
        continue;
      }

      const bqm = line.match(/^>\s?(.*)/);
      if (bqm) {
        closeList();
        out.push(`<blockquote>${this._inlineMarkdown(esc(bqm[1]))}</blockquote>`);
        lastBlock = 'blockquote';
        continue;
      }

      if (line.trim().startsWith('|')) {
        closeList();
        inTable = true;
        tableLines.push(line.trim());
        continue;
      }

      if (inTable) flushTable();

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
    if (inTable) flushTable();
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
