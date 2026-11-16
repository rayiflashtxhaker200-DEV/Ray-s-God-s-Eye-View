import { defineStore } from 'pinia';

export const useMissionReplayStore = defineStore('gev-mission-replay', {
  state: () => ({
    view: null,
  }),
  actions: {
    publish(view) {
      this.view = view ?? null;
    },
  },
});
