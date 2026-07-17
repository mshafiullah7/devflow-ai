import { Router } from './router.js';
import { PersistentPageHost } from './persistent-page-host.js';

const PERSISTENT_ROUTES = new Set(['workflow-runner', 'terminal', 'generate-workflows']);

export const router = new Router(document.getElementById('app'));

const hostRoot = document.getElementById('bgTools');
export const persistentHost = new PersistentPageHost(hostRoot);

/**
 * Use instead of router.navigate() everywhere a page/component needs to open
 * Workflow Runner or Terminal as an in-app tab. Falls through to a normal
 * router.navigate() for every other route.
 */
export async function navigateTo(name, params = {}) {
  if (PERSISTENT_ROUTES.has(name)) {
    if (!(await router.canLeave())) return;
    router.container.style.display = 'none';
    const loader = router.routes[name];
    if (!loader) throw new Error(`Route "${name}" is not registered.`);
    await persistentHost.activate(name, loader, params, router);
    return;
  }

  persistentHost.deactivateAll();
  router.container.style.display = '';
  await router.navigate(name, params);
}

/** True while a persistent page has a live (not-yet-closed) instance. */
export function isPersistentRouteActive(name) {
  return persistentHost.hasActive(name);
}

/** Fully stops/kills a persistent page's underlying session. */
export function closePersistentRoute(name) {
  persistentHost.close(name);
}

// Attach the helpers to the router instance so any page/component that
// already holds a `router`/`this.router` reference (the existing convention
// across pages) can call `this.router.navigateTo(...)` etc. without a
// separate import — importing app-nav.js from a page module that's also used
// by the standalone pop-out windows (workflow-runner.html/terminal.html,
// which have no #bgTools element) would break those entry points.
router.navigateTo             = navigateTo;
router.closePersistentRoute   = closePersistentRoute;
router.isPersistentRouteActive = isPersistentRouteActive;
