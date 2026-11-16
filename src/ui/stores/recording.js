import { defineStore } from 'pinia';

export const useRecordingStore = defineStore('gev-recording', {
  state: () => ({
    safeFrame: null,
  }),
  actions: {
    publishSafeFrame(frame) {
      this.safeFrame = frame ?? null;
    },
  },
});
