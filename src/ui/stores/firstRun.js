import { defineStore } from 'pinia';

export const useFirstRunStore = defineStore('gev-first-run', {
  state: () => ({
    view: null,
    controls: null,
  }),
  actions: {
    publish(view) {
      this.view = view ?? null;
    },
    connect(controls) {
      this.controls = controls ?? null;
    },
  },
});
