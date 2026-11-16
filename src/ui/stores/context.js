import { defineStore } from 'pinia';

export const useContextStore = defineStore('gev-context', {
  state: () => ({
    view: null,
    awareness: null,
    awarenessControls: null,
    missions: null,
    missionsControls: null,
  }),
  actions: {
    publish(view) {
      this.view = view ?? null;
    },
    connectAwareness(controls) {
      this.awarenessControls = controls ?? null;
    },
    publishAwareness(view) {
      this.awareness = view ?? null;
    },
    connectMissions(controls) {
      this.missionsControls = controls ?? null;
    },
    publishMissions(view) {
      this.missions = view ?? null;
    },
  },
});
