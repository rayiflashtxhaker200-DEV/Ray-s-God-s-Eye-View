import { defineStore } from 'pinia';

export const useLocationStore = defineStore('gev-location', {
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
