import { defineStore } from 'pinia';

export const useProviderSettingsStore = defineStore('gev-provider-settings', {
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
