export class LayerStateCoordinator {
  constructor(
    dataManager,
    shareLinkManager,
    { onDurableStateChange, onTrackingRestoreStatus } = {},
  ) {
    this._dataManager = dataManager;
    this._shareLinkManager = shareLinkManager;
    this._onDurableStateChange = onDurableStateChange;
    this._onTrackingRestoreStatus = onTrackingRestoreStatus;
    this._destroyed = false;
    this._pendingTracking = null;
    this._durableState = { enabledLayerIds: [], options: {} };
  }

  getDurableState() {
    return this._durableState;
  }

  async start({ shareLayerState = null } = {}) {
    if (this._destroyed) return [];
    if (shareLayerState) {
      return this.applyShareLayerState({ shareLayerState });
    }
    return [];
  }

  async applyShareLayerState({ shareLayerState = null } = {}) {
    if (this._destroyed || !shareLayerState || !this._dataManager) return [];
    const wanted = new Set(shareLayerState.enabledLayerIds || []);
    const applied = [];
    for (const layer of this._dataManager.getAll?.() || []) {
      const shouldEnable = wanted.has(layer.id);
      if (Boolean(layer.enabled) !== shouldEnable) {
        this._dataManager.setEnabled?.(layer.id, shouldEnable);
        applied.push({ id: layer.id, enabled: shouldEnable });
      }
    }
    this._durableState = {
      enabledLayerIds: [...wanted],
      options: shareLayerState.options || {},
    };
    this._onDurableStateChange?.(this._durableState);
    return applied;
  }

  async restoreShareTrackingSelection() {
    return { status: 'none', restored: false };
  }

  cancelPendingShareTracking() {
    const hadPending = Boolean(this._pendingTracking);
    this._pendingTracking = null;
    return hadPending;
  }

  destroy() {
    this._destroyed = true;
    this._pendingTracking = null;
  }
}
