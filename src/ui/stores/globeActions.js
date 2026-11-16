import { defineStore } from 'pinia';

export const useGlobeActionsStore = defineStore('gev-globe-actions', {
  state: () => ({
    camera: null,
    clearBusy: false,
    resetting: false,
    owners: new Map(),
  }),
  actions: {
    connect(actions) {
      const token = Symbol('globe-actions');
      if (actions && typeof actions === 'object') {
        const entry = new Map(Object.entries(actions));
        for (const [key, handler] of entry) {
          this.owners.set(key, { token, handler });
        }
      }
      return token;
    },
    detach(token) {
      if (!token) return;
      for (const [key, entry] of [...this.owners.entries()]) {
        if (entry.token === token) {
          this.owners.delete(key);
          if (key === 'clear') this.clearBusy = false;
          if (key === 'reset') this.resetting = false;
        }
      }
    },
    owns(token, actionName) {
      if (!token || !actionName) return false;
      return this.owners.get(actionName)?.token === token;
    },
    publishClearBusy(token, busy) {
      if (this.owns(token, 'clear')) {
        this.clearBusy = Boolean(busy);
      }
    },
    publishResetting(token, busy) {
      if (this.owns(token, 'reset')) {
        this.resetting = Boolean(busy);
      }
    },
    publishCamera(state) {
      this.camera = state ?? null;
    },
    invoke(actionName, ...args) {
      const handler = this.owners.get(actionName)?.handler;
      return typeof handler === 'function' ? handler(...args) : undefined;
    },
  },
});
