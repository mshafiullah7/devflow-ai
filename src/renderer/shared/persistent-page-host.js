/**
 * Keeps a handful of "background-capable" pages (Workflow Runner, Terminal)
 * alive across normal router navigation. Unlike Router, activate() never
 * destroys a page on re-entry — it only hides/shows its container — so a
 * running PTY/xterm session survives the user switching to other tabs.
 *
 * Pages hosted here must implement mount()/onResume()/onPause()/destroy()
 * (onResume/onPause are optional).
 */
export class PersistentPageHost {
  constructor(root) {
    this.root  = root; // container that wraps all persistent-page containers
    this._entries = new Map(); // key -> { container, page }
  }

  _containerFor(key) {
    let container = this.root.querySelector(`[data-host-key="${key}"]`);
    if (!container) {
      container = document.createElement('div');
      container.dataset.hostKey = key;
      container.style.cssText = 'position:absolute;inset:0;display:none;';
      this.root.appendChild(container);
    }
    return container;
  }

  hasActive(key) {
    return this._entries.has(key);
  }

  async activate(key, PageClassOrLoader, params, router) {
    this.root.style.display = '';
    for (const [k, entry] of this._entries) {
      if (k !== key) entry.container.style.display = 'none';
    }

    const container = this._containerFor(key);
    container.style.display = 'block';

    let entry = this._entries.get(key);
    if (entry) {
      entry.page.onResume?.(params);
      return entry.page;
    }

    const PageClass = PageClassOrLoader.prototype ? PageClassOrLoader : await PageClassOrLoader();
    const page = new PageClass(container, params, router);
    page.mount();
    entry = { container, page };
    this._entries.set(key, entry);
    return page;
  }

  deactivateAll() {
    this.root.style.display = 'none';
    for (const entry of this._entries.values()) {
      entry.container.style.display = 'none';
      entry.page.onPause?.();
    }
  }

  /** Fully tears down a persistent page (explicit stop/close, not a tab switch). */
  close(key) {
    const entry = this._entries.get(key);
    if (!entry) return;
    entry.page.destroy?.() ?? entry.page.unmount?.();
    entry.container.remove();
    this._entries.delete(key);
  }
}
