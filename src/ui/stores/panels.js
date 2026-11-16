import { defineStore } from 'pinia';

export const usePanelStore = defineStore('gev-panels', {
  state: () => ({
    sides: {
      left: [],
      right: [],
    },
    controls: null,
  }),
  actions: {
    openPanelId(side) {
      const list = this.sides[side];
      if (!Array.isArray(list)) return null;
      const open = list.find((panel) => panel.available && !panel.collapsed);
      return open ? open.id : null;
    },
    syncSide(side, panels) {
      if (side !== 'left' && side !== 'right') return;
      this.sides[side] = Array.isArray(panels) ? panels : [];
    },
    connect(controls) {
      this.controls = controls ?? null;
    },
  },
});
