import * as Cesium from 'cesium';

const SOURCE_ID = 's2-ghostmaps';

export function createGhostMapsLayer({ source, overlayHost } = {}) {
  if (typeof source?.getCatalog !== 'function' || typeof source?.getFile !== 'function') {
    throw new TypeError('GhostMaps layer requires getCatalog and getFile source methods');
  }

  let _viewer = null;
  let _enabled = false;
  let _request = null;
  let _count = 0;
  let _lastUpdate = null;
  let _lastError = null;
  const _dataSources = new Map();

  return {
    id: SOURCE_ID,
    name: 'S2 GhostMaps',
    icon: '◈',
    source: 'S2 Underground',
    updateInterval: 60_000,

    init(viewer) {
      _viewer = viewer;
      overlayHost?.setVisible?.(SOURCE_ID, false);
    },

    enable() {
      _enabled = true;
      for (const ds of _dataSources.values()) ds.show = true;
      overlayHost?.setVisible?.(SOURCE_ID, true);
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      for (const ds of _dataSources.values()) ds.show = false;
      overlayHost?.clearSource?.(SOURCE_ID);
      overlayHost?.setVisible?.(SOURCE_ID, false);
    },

    async update() {
      if (!_enabled || !_viewer) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const catalog = await source.getCatalog({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled) return false;
        const products = Array.isArray(catalog?.products) ? catalog.products : [];
        const active = products.filter((product) => product.defaultOn);
        for (const product of active) {
          if (_dataSources.has(product.id)) continue;
          const bytes = await source.getFile(product.id, product.version, { signal: request.signal });
          if (request.signal.aborted || _request !== request || !_enabled) return false;
          const blob = new Blob([bytes], { type: 'application/vnd.google-earth.kmz' });
          const ds = await Cesium.KmlDataSource.load(blob, {
            camera: _viewer.scene?.camera,
            canvas: _viewer.scene?.canvas,
          });
          if (!_enabled || _viewer.isDestroyed?.()) break;
          ds.show = true;
          await _viewer.dataSources.add(ds);
          _dataSources.set(product.id, ds);
        }
        _count = _dataSources.size;
        _lastUpdate = Date.now();
        _lastError = catalog?.error || null;
        _viewer.scene?.requestRender?.();
        return true;
      } catch (error) {
        if (request.signal.aborted || _request !== request) return false;
        _lastError = error?.message || 'GhostMaps unavailable';
        return false;
      } finally {
        if (_request === request) _request = null;
      }
    },

    destroy() {
      _request?.abort();
      _request = null;
      _enabled = false;
      overlayHost?.clearSource?.(SOURCE_ID);
      overlayHost?.setVisible?.(SOURCE_ID, false);
      for (const ds of _dataSources.values()) {
        if (_viewer && !_viewer.isDestroyed?.()) {
          _viewer.dataSources.remove(ds, true);
        }
      }
      _dataSources.clear();
      _viewer = null;
      _count = 0;
      _lastUpdate = null;
      _lastError = null;
    },

    getStats() {
      return {
        count: _count,
        lastUpdate: _lastUpdate,
        error: _lastError,
      };
    },
  };
}
