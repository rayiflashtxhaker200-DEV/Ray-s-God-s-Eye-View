import { defineStore } from 'pinia';

export const useDisplayStore = defineStore('gev-display', {
  state: () => ({
    activeStyle: null,
    parameters: null,
    models3d: null,
    mapSource: null,
    mapSourceControls: null,
    phoneShell: null,
    cockpitPortal: null,
    draw: null,
    geoImport: null,
    controlOwners: new Map(),
  }),
  actions: {
    publishStyle(view) {
      this.activeStyle = view ?? null;
    },
    publishParameters(view) {
      this.parameters = view ?? null;
    },
    publishModels3d(view) {
      this.models3d = view ?? null;
    },
    publishMapSource(view) {
      this.mapSource = view ?? null;
    },
    connectMapSource(controls) {
      this.mapSourceControls = controls ?? null;
    },
    publishPhoneShell(view) {
      this.phoneShell = view ?? null;
    },
    publishCockpitPortal(slots) {
      this.cockpitPortal = slots ?? null;
    },
    publishDraw(view) {
      this.draw = view ?? null;
    },
    publishGeoImport(view) {
      this.geoImport = view ?? null;
    },
    connect(actions) {
      const token = Symbol('display-actions');
      if (actions && typeof actions === 'object') {
        this.controlOwners.set(token, actions);
      }
      return token;
    },
    detach(token) {
      if (token) this.controlOwners.delete(token);
    },
    act(name, ...args) {
      for (const actions of [...this.controlOwners.values()].reverse()) {
        if (typeof actions?.[name] === 'function') {
          return actions[name](...args);
        }
      }
      if (
        name === 'selectMapSource' &&
        typeof this.mapSourceControls?.select === 'function'
      ) {
        return this.mapSourceControls.select(...args);
      }
      return undefined;
    },
  },
});
