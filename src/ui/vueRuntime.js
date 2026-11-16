import { createApp } from 'vue';
import { createPinia } from 'pinia';

let sharedPinia = null;

/** Return the shared Pinia instance for the browser application. */
export function applicationPinia() {
  if (!sharedPinia) sharedPinia = createPinia();
  return sharedPinia;
}

/** Track mounted Vue surfaces for clean application teardown. */
export function createUiRuntime({ pinia = applicationPinia() } = {}) {
  const active = new Map();
  let destroyed = false;

  return {
    pinia,
    mount(component, host, props = undefined) {
      if (destroyed || !host || !component) return null;
      const existing = active.get(host);
      if (existing) {
        try {
          existing.unmount();
        } catch {
          // Ignore unmount errors from already detached nodes.
        }
        active.delete(host);
      }
      const app = createApp(component, props);
      app.use(pinia);
      app.mount(host);
      const handle = {
        app,
        unmount() {
          if (active.get(host) === handle) active.delete(host);
          app.unmount();
        },
      };
      active.set(host, handle);
      return handle;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const handle of [...active.values()]) {
        try {
          handle.app.unmount();
        } catch {
          // Ignore unmount errors during shutdown.
        }
      }
      active.clear();
    },
  };
}
