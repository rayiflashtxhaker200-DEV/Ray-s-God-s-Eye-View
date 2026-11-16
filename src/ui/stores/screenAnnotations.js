import { defineStore } from 'pinia';

export const useScreenAnnotationsStore = defineStore('gev-screen-annotations', {
  state: () => ({
    board: null,
    controls: null,
  }),
  actions: {
    publish(board) {
      this.board = board ?? null;
    },
    connect(controls) {
      this.controls = controls ?? null;
    },
  },
});
