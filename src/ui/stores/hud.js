import { defineStore } from 'pinia';

export const useHudStore = defineStore('gev-hud', {
  state: () => ({
    view: null,
  }),
  actions: {
    publish(view) {
      this.view = view ?? null;
    },
  },
});
