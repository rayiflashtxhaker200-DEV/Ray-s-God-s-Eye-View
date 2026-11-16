import { defineStore } from 'pinia';

export const useWorldOverlayActionsStore = defineStore(
  'gev-world-overlay-actions',
  {
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
      activate(owner, key) {
        return this.controls?.activate?.(owner, key);
      },
    },
  },
);
