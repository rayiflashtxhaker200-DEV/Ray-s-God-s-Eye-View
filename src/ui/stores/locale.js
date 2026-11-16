import { defineStore } from 'pinia';

export const useLocaleStore = defineStore('gev-locale', {
  state: () => ({
    picker: null,
  }),
  actions: {
    publishPicker(picker) {
      this.picker = picker ?? null;
    },
  },
});
