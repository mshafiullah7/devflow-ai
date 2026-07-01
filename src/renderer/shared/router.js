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

  async navigate(name, params = {}) {
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
