import { escHtml, injectCss } from '../../shared/helpers.js';

export class Dialog {
  static _css() {
    injectCss('components/dialog/dialog.css');
  }

  static alert(message, { title = 'Notice' } = {}) {
    Dialog._css();
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'dlg-overlay';
      overlay.innerHTML = `
        <div class="dlg-modal" role="alertdialog" aria-modal="true">
          <div class="dlg-header"><span class="dlg-title">${escHtml(title)}</span></div>
          <div class="dlg-body"><p class="dlg-message">${escHtml(message)}</p></div>
          <div class="dlg-footer">
            <button class="dlg-btn dlg-btn--primary" data-ok>OK</button>
          </div>
        </div>`;
      const close = () => { overlay.remove(); resolve(); };
      overlay.querySelector('[data-ok]').addEventListener('click', close);
      overlay.addEventListener('keydown', e => {
        if (e.key === 'Escape' || e.key === 'Enter') close();
      });
      document.body.appendChild(overlay);
      overlay.querySelector('[data-ok]').focus();
    });
  }

  static confirm(message, { title = 'Confirm', confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
    Dialog._css();
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'dlg-overlay';
      overlay.innerHTML = `
        <div class="dlg-modal" role="alertdialog" aria-modal="true">
          <div class="dlg-header"><span class="dlg-title">${escHtml(title)}</span></div>
          <div class="dlg-body"><p class="dlg-message">${escHtml(message)}</p></div>
          <div class="dlg-footer">
            <button class="dlg-btn dlg-btn--ghost" data-cancel>${escHtml(cancelText)}</button>
            <button class="dlg-btn ${danger ? 'dlg-btn--danger' : 'dlg-btn--primary'}" data-confirm>${escHtml(confirmText)}</button>
          </div>
        </div>`;
      const close = val => { overlay.remove(); resolve(val); };
      overlay.querySelector('[data-cancel]').addEventListener('click', () => close(false));
      overlay.querySelector('[data-confirm]').addEventListener('click', () => close(true));
      overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(false); });
      document.body.appendChild(overlay);
      overlay.querySelector('[data-confirm]').focus();
    });
  }
}
