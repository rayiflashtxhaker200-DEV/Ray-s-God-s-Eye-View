import { defineStore } from 'pinia';

const defaultUtilityLayout = () => ({
  top: null,
  maxHeight: null,
  expandedMaxHeight: null,
  primaryOnly: false,
  hideCollapsed: false,
});

export const useCockpitStore = defineStore('gev-cockpit', {
  state: () => ({
    presence: null,
    brief: null,
    context: null,
    instruments: null,
    route: null,
    vision: null,
    signals: [],
    utilityLayout: defaultUtilityLayout(),
  }),
  actions: {
    publishPresence(view) {
      this.presence = view ?? null;
    },
    publishBrief(view) {
      this.brief = view ?? null;
    },
    publishContext(view) {
      this.context = view ?? null;
    },
    publishInstruments(view) {
      this.instruments = view ?? null;
    },
    publishRoute(view) {
      this.route = view ?? null;
    },
    publishVision(view) {
      this.vision = view ?? null;
    },
    publishSignals(rows) {
      this.signals = Array.isArray(rows) ? rows : [];
    },
    publishUtilityLayout(layout) {
      this.utilityLayout = layout ?? defaultUtilityLayout();
    },
  },
});
