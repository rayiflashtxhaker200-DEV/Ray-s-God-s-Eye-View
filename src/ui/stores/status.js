import { defineStore } from 'pinia';

export const useStatusStore = defineStore('gev-status', {
  state: () => ({
    cctv: null,
    loading: null,
    notice: null,
    traffic: null,
  }),
  actions: {
    publishCctv(chip) {
      this.cctv = chip ?? null;
    },
    publishLoading(status) {
      this.loading = status ?? null;
    },
    publishNotice(notice) {
      this.notice = notice ?? null;
    },
    publishTraffic(chip) {
      this.traffic = chip ?? null;
    },
  },
});
