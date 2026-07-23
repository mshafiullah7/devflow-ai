/**
 * Minimal page router.
 * Pages are plain classes with mount(container) and optional unmount().
 */
export class Router {
  constructor(container) {
    this.container   = container;
    this.routes      = {};
    this.currentPage = null;
  }

  register(name, pageLoader) {
    // pageLoader can be a class or an async function returning a class
    this.routes[name] = pageLoader;
  }

  /**
   * Lets the currently-mounted page block navigation/close while it's busy
   * (e.g. an in-flight AI request). `fn` is called with no args and may
   * return a boolean or a Promise<boolean> — false blocks the transition.
   * Only one guard is active at a time (the current page's).
   */
  setNavigationGuard(fn) {
    this._navGuard = fn;
  }

  clearNavigationGuard() {
    this._navGuard = null;
  }

  /** Resolves true if it's safe to navigate away / close the app right now. */
  async canLeave() {
    if (!this._navGuard) return true;
    return !!(await this._navGuard());
  }

  async navigate(name, params = {}) {
    if (!(await this.canLeave())) return;
    await this._doNavigate(name, params);
  }

  /**
   * Same as navigate() but skips the canLeave() check — for callers (like
   * app-nav.js's navigateTo()) that already checked canLeave() themselves
   * before doing other work (e.g. hiding a persistent tab) that shouldn't
   * happen if the guard blocks the transition.
   */
  async _doNavigate(name, params = {}) {
    if (this.currentPage && typeof this.currentPage.unmount === 'function') {
      this.currentPage.unmount();
    }
    this.container.innerHTML = '';

    const loader = this.routes[name];
    if (!loader) throw new Error(`Route "${name}" is not registered.`);

    // Support both plain classes and async loader functions
    const PageClass = loader.prototype ? loader : await loader();

    this.currentPage = new PageClass(this.container, params, this);
    await this.currentPage.mount();
  }
}
