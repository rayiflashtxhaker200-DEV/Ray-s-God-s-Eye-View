import { defineStore } from 'pinia';

export const useCelestialRingStore = defineStore('gev-celestial-ring', {
  state: () => ({
    ring: null,
    controls: null,
  }),
  actions: {
    publish(view) {
      this.ring = view ?? null;
    },
    connect(controls) {
      this.controls = controls ?? null;
    },
  },
});
