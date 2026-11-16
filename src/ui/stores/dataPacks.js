import { defineStore } from 'pinia';

export const useDataPacksStore = defineStore('gev-data-packs', {
  state: () => ({
    panel: null,
    panels: new Map(),
  }),
  actions: {
    publish(ownerOrView, view) {
      if (arguments.length >= 2) {
        if (view) {
          this.panels.set(ownerOrView, view);
          this.panel = view;
        } else {
          this.panels.delete(ownerOrView);
          const next = [...this.panels.values()].at(-1) ?? null;
          this.panel = next;
        }
        return;
      }
      this.panel = ownerOrView ?? null;
    },
  },
});
