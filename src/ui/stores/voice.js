import { defineStore } from 'pinia';

export const useVoiceStore = defineStore('gev-voice', {
  state: () => ({
    view: null,
    controls: null,
    bars: null,
    chatMessages: [],
  }),
  actions: {
    connect(controls) {
      this.controls = controls ?? null;
    },
    publish(view) {
      this.view = view ?? null;
    },
    publishBars(bars) {
      this.bars = bars ?? null;
    },
    publishChat(messages) {
      this.chatMessages = Array.isArray(messages) ? messages : [];
    },
  },
});
