import { defineStore } from 'pinia';

export const useBhoteKoshiPanelStore = defineStore('gev-bhote-koshi-panel', {
  state: () => ({
    panel: null,
    controls: null,
  }),
  actions: {
    publish(panel) {
      this.panel = panel ?? null;
    },
    connect(controls) {
      this.controls = controls ?? null;
    },
  },
});
