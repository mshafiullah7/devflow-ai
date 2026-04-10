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

  register(name, PageClass) {
    this.routes[name] = PageClass;
  }

  navigate(name, params = {}) {
    if (this.currentPage && typeof this.currentPage.unmount === 'function') {
      this.currentPage.unmount();
    }
    this.container.innerHTML = '';

    const PageClass = this.routes[name];
    if (!PageClass) throw new Error(`Route "${name}" is not registered.`);

    this.currentPage = new PageClass(this.container, params, this);
    this.currentPage.mount();
  }
}
