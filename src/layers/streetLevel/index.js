/**
 * Unified Street Level imagery layer managing Mapillary, Google Street View,
 * KartaView, and Panoramax provider states and viewer host lifecycle.
 */

export const STREET_LEVEL_LAYER_ID = 'street-level';
const NO_PROVIDERS_HINT = 'No street-level imagery providers configured';

export function createStreetLevelLayer({
  providers = [],
  services = {},
} = {}) {
  void services;
  const providerList = Array.isArray(providers) ? [...providers] : [];
  let viewer = null;
  let viewerHost = null;
  let navigation = null;
  let initialized = false;
  let enabled = false;
  let renderMode = 'letterbox';
  let filter = { pano: 'all', sinceDays: 0 };
  const activeProviders = Object.fromEntries(
    providerList.map((p, index) => [p.id, index === 0]),
  );
  const listeners = new Set();

  let streetState = {
    open: false,
    loading: false,
    imageId: null,
    error: null,
    renderMode,
    renderModes: true,
    isPano: false,
    bearing: null,
    capturedAt: null,
    capturedAtPrecision: 'day',
    title: '',
    creator: '',
    license: '',
    externalUrl: null,
    providerLabel: '',
  };

  function getUIState() {
    const mappedProviders = providerList.map((p) => ({
      id: p.id,
      name: p.name,
      label: p.label || p.name,
      color: p.color || null,
      on: Boolean(activeProviders[p.id]),
      loading: false,
      error: null,
      keyRequired: p.isKeyRequired ? Boolean(p.isKeyRequired()) : false,
      keyRejected: false,
      requiresKeyId: p.requiresKeyId || null,
      groundClick: Boolean(p.groundClick),
    }));

    const keyRequired =
      enabled &&
      mappedProviders.some((p) => p.on && p.keyRequired) &&
      !mappedProviders.some((p) => p.on && !p.keyRequired);

    const activeProvider = providerList.find((p) => activeProviders[p.id]) || null;

    return {
      enabled,
      keyRequired,
      keyRejected: false,
      keyAlternatives: mappedProviders
        .filter((p) => !p.keyRequired)
        .map((p) => p.name),
      providers: mappedProviders,
      coverage: {
        loading: false,
        count: 0,
        error: null,
        hint: providerList.length === 0 ? NO_PROVIDERS_HINT : '',
        label: activeProvider?.coverageLabel || null,
      },
      sequence: {
        selectedId: null,
        loading: false,
        images: 0,
        error: null,
      },
      street: {
        ...streetState,
        renderMode,
      },
      filter: { ...filter },
      filterControls: activeProvider?.filterControls || {
        pano: true,
        since: true,
      },
      sinceNote: null,
      groundClickReady: Boolean(viewer && enabled),
    };
  }

  function emit() {
    const state = getUIState();
    for (const fn of [...listeners]) {
      try {
        fn(state);
      } catch {
        /* ignore subscriber error */
      }
    }
  }

  return {
    id: STREET_LEVEL_LAYER_ID,
    name: 'Street Level',
    category: 'imagery',
    get providerIds() {
      return providerList.map((p) => p.id);
    },
    get initialized() {
      return initialized;
    },
    getSourceAvailability() {
      if (providerList.length === 0) {
        return {
          available: false,
          reason: NO_PROVIDERS_HINT,
        };
      }
      return { available: true, reason: null };
    },
    init(nextViewer) {
      if (providerList.length === 0) return false;
      viewer = nextViewer || null;
      initialized = true;
      return true;
    },
    async enable() {
      if (providerList.length === 0) return false;
      enabled = true;
      await Promise.allSettled(
        providerList.map((p) => p.checkKey?.()).filter(Boolean),
      );
      emit();
      return true;
    },
    disable() {
      enabled = false;
      streetState = { ...streetState, open: false, loading: false };
      emit();
    },
    destroy() {
      listeners.clear();
      viewerHost = null;
      viewer = null;
      navigation = null;
      initialized = false;
      enabled = false;
    },
    getStatus() {
      return {
        initialized,
        enabled,
        loading: false,
        count: 0,
        error: null,
      };
    },
    setParams(params = {}) {
      if (!params || typeof params !== 'object') return;
      for (const p of providerList) {
        if (typeof params[p.id] === 'boolean') {
          activeProviders[p.id] = params[p.id];
        }
      }
      if (typeof params.pano === 'string') filter.pano = params.pano;
      if (Number.isFinite(Number(params.sinceDays))) {
        filter.sinceDays = Math.max(0, Number(params.sinceDays));
      }
      emit();
    },
    attachNavigation(nav) {
      navigation = nav || null;
      void navigation;
    },
    attachViewerHost(el) {
      viewerHost = el || null;
      void viewerHost;
    },
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getUIState,
    async openNearest(position = null, options = {}) {
      void position;
      void options;
      if (!enabled || providerList.length === 0) return false;
      streetState = {
        ...streetState,
        open: false,
        loading: false,
        error: 'No nearby street-level imagery found at this location.',
      };
      emit();
      return false;
    },
    closeViewer() {
      if (!streetState.open && !streetState.error) return;
      streetState = {
        ...streetState,
        open: false,
        loading: false,
        imageId: null,
        error: null,
      };
      emit();
    },
    setViewerRenderMode(mode) {
      if (mode !== 'fill' && mode !== 'letterbox') return;
      renderMode = mode;
      streetState = { ...streetState, renderMode };
      emit();
    },
    resizeViewer() {
      /* layout hook for mounted viewer host */
    },
  };
}
