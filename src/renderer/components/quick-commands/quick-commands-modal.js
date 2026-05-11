import { escHtml, injectCss } from '../../shared/helpers.js';

export class QuickCommandsModal {
  constructor({ onRunCommand }) {
    this._onRunCommand = onRunCommand;
  }

  // ----------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------
  mount() {
    injectCss('components/quick-commands/quick-commands.css');
  }

  // ----------------------------------------------------------------
  // Show modal
  // ----------------------------------------------------------------
  async show() {
    document.querySelector('.qcmd-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'qcmd-overlay';
    overlay.innerHTML = `
      <div class="qcmd-modal">
        <div class="qcmd-header">
          <div class="qcmd-header__title">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <circle cx="4" cy="6"  r="1.5" fill="currentColor"/>
              <circle cx="4" cy="10" r="1.5" fill="currentColor"/>
              <circle cx="4" cy="14" r="1.5" fill="currentColor"/>
              <path d="M8 6h8M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            Quick Commands
          </div>
          <div class="qcmd-header__actions">
            <button class="qcmd-add-btn" id="btnQcmdAdd">+ Add</button>
            <button class="qcmd-close" aria-label="Close">&times;</button>
          </div>
        </div>
        <div class="qcmd-body" id="qcmdBody"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.qcmd-close').addEventListener('click', close);
    const escFn = (e) => {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escFn); }
    };
    document.addEventListener('keydown', escFn);

    const body = overlay.querySelector('#qcmdBody');
    overlay.querySelector('#btnQcmdAdd').addEventListener('click', () => this._renderForm(overlay, body, null));

    await this._renderList(overlay, body);
  }

  // ----------------------------------------------------------------
  // List view
  // ----------------------------------------------------------------
  async _renderList(overlay, body) {
    const commands = await window.db.quickCommands.list();
    if (commands.length === 0) {
      body.innerHTML = `<div class="qcmd-empty">No commands yet. Click <strong>+ Add</strong> to create one.</div>`;
      return;
    }

    body.innerHTML = `
      <div class="qcmd-list">
        ${commands.map(c => `
          <div class="qcmd-item" data-id="${c.id}">
            <div class="qcmd-item__main">
              <span class="qcmd-item__cmd">${escHtml(c.command)}</span>
              ${c.description ? `<span class="qcmd-item__desc">${escHtml(c.description)}</span>` : ''}
            </div>
            <div class="qcmd-item__actions">
              <button class="qcmd-item__btn qcmd-item__btn--copy" data-cmd="${escHtml(c.command)}" title="Run command">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <rect x="5" y="5" width="9" height="10" rx="2" stroke="currentColor" stroke-width="1.4"/>
                  <path d="M11 5V3a2 2 0 00-2-2H3a2 2 0 00-2 2v6a2 2 0 002 2h2" stroke="currentColor" stroke-width="1.4"/>
                </svg>
              </button>
              <button class="qcmd-item__btn qcmd-item__btn--edit" data-id="${c.id}" title="Edit">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                </svg>
              </button>
              <button class="qcmd-item__btn qcmd-item__btn--delete" data-id="${c.id}" title="Delete">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8M5.5 6v4M8.5 6v4"
                    stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    body.querySelectorAll('.qcmd-item__btn--copy').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cmd = btn.dataset.cmd;
        overlay.remove();
        await this._onRunCommand(cmd);
      });
    });

    body.querySelectorAll('.qcmd-item__btn--edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id  = parseInt(btn.dataset.id, 10);
        const cmd = commands.find(c => c.id === id);
        if (cmd) this._renderForm(overlay, body, cmd);
      });
    });

    body.querySelectorAll('.qcmd-item__btn--delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        await window.db.quickCommands.delete(parseInt(btn.dataset.id, 10));
        await this._renderList(overlay, body);
      });
    });
  }

  // ----------------------------------------------------------------
  // Add / edit form
  // ----------------------------------------------------------------
  _renderForm(overlay, body, cmd) {
    const isEdit = !!cmd;
    body.innerHTML = `
      <div class="qcmd-form">
        <div class="qcmd-form__field">
          <label class="qcmd-form__label">Command <span style="color:#ef4444">*</span></label>
          <input class="qcmd-form__input" id="qcmdInputCmd" type="text"
            placeholder="e.g. tree src /f" autocomplete="off"
            value="${isEdit ? escHtml(cmd.command) : ''}"/>
        </div>
        <div class="qcmd-form__field">
          <label class="qcmd-form__label">Description</label>
          <input class="qcmd-form__input" id="qcmdInputDesc" type="text"
            placeholder="e.g. List all files in src folder" autocomplete="off"
            value="${isEdit ? escHtml(cmd.description || '') : ''}"/>
        </div>
        <div class="qcmd-form__actions">
          <button class="qcmd-form__btn qcmd-form__btn--cancel">Cancel</button>
          <button class="qcmd-form__btn qcmd-form__btn--save">${isEdit ? 'Save' : 'Add Command'}</button>
        </div>
      </div>
    `;

    const cmdInput  = body.querySelector('#qcmdInputCmd');
    const descInput = body.querySelector('#qcmdInputDesc');
    const saveBtn   = body.querySelector('.qcmd-form__btn--save');
    cmdInput.focus();

    body.querySelector('.qcmd-form__btn--cancel')
      .addEventListener('click', () => this._renderList(overlay, body));

    const save = async () => {
      const command = cmdInput.value.trim();
      if (!command) { cmdInput.style.outline = '1px solid #ef4444'; cmdInput.focus(); return; }
      cmdInput.style.outline = '';
      saveBtn.disabled = true;
      if (isEdit) {
        await window.db.quickCommands.update({ id: cmd.id, command, description: descInput.value.trim() || null });
      } else {
        await window.db.quickCommands.create({ command, description: descInput.value.trim() || null });
      }
      await this._renderList(overlay, body);
    };

    saveBtn.addEventListener('click', save);
    [cmdInput, descInput].forEach(el => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); }));
  }
}
