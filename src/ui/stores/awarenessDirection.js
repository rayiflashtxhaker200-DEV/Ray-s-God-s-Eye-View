import { defineStore } from 'pinia';

export const useAwarenessDirectionStore = defineStore(
  'gev-awareness-direction',
  {
    state: () => ({
      view: null,
    }),
    actions: {
      publish(view) {
        this.view = view ?? null;
      },
    },
  },
);
