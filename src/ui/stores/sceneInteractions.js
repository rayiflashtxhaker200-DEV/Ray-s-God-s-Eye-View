import { defineStore } from 'pinia';

export const useSceneInteractionsStore = defineStore('gev-scene-interactions', {
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
