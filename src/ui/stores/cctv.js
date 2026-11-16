import { defineStore } from 'pinia';

export const useCctvStore = defineStore('gev-cctv', {
  state: () => ({
    view: null,
    picker: null,
    calEdit: null,
    frame: null,
    sourceBadge: { label: '', state: 'idle' },
    summary: '',
    live: false,
  }),
  actions: {
    publish(view) {
      this.view = view ?? null;
    },
    setPicker(picker) {
      this.picker = picker ?? null;
    },
    setCalEdit(edit) {
      this.calEdit = edit ?? null;
    },
    setFrame(frame) {
      this.frame = frame ?? null;
    },
    setSourceBadge(badge) {
      this.sourceBadge = badge ?? { label: '', state: 'idle' };
    },
    setSummary(text) {
      this.summary = text ?? '';
    },
    setLive(live) {
      this.live = Boolean(live);
    },
  },
});
