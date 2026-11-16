import * as Cesium from 'cesium';
import { GNSS_WINDOW_MS } from './records.js';

export function createGnssIntegrityLayer({
  source,
  windowMs = GNSS_WINDOW_MS,
} = {}) {
  if (typeof source?.getSnapshot !== 'function') {
    throw new TypeError('GNSS integrity requires a snapshot source');
  }

  let _viewer = null;
  let _dataSource = null;
  let _enabled = false;
  let _request = null;
  let _count = 0;
  let _lastUpdate = null;
  let _lastError = null;
  let _stale = false;

  return {
    id: 'gnss-integrity',
    name: 'GNSS Integrity',
    icon: '◎',
    source: 'adsb.lol',
    updateInterval: 60_000,
    windowMs,

    init(viewer) {
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource('gnss-integrity');
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
    },

    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      if (_dataSource) _dataSource.show = false;
    },

    async update() {
      if (!_enabled || !_dataSource || !_viewer) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const snapshot = await source.getSnapshot({
          viewer: _viewer,
          signal: request.signal,
        });
        if (request.signal.aborted || _request !== request || !_enabled) return false;
        const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
        _dataSource.entities.removeAll();
        let degradedCount = 0;
        for (const row of rows) {
          if (!Number.isFinite(row?.lat) || !Number.isFinite(row?.lon)) continue;
          if (!row.degraded) continue;
          degradedCount += 1;
          _dataSource.entities.add(
            new Cesium.Entity({
              position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat, 0),
              point: {
                pixelSize: 8,
                color: Cesium.Color.fromCssColorString('#ff4d4d'),
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              },
            }),
          );
        }
        _count = degradedCount;
        _lastUpdate = Date.now();
        _lastError = null;
        _stale = snapshot?.stale === true;
        _viewer.scene?.requestRender?.();
        return true;
      } catch (error) {
        if (request.signal.aborted || _request !== request) return false;
        _lastError = error?.message || 'GNSS integrity unavailable';
        return false;
      } finally {
        if (_request === request) _request = null;
      }
    },

    destroy() {
      _request?.abort();
      _request = null;
      _enabled = false;
      if (_dataSource && _viewer && !_viewer.isDestroyed?.()) {
        _viewer.dataSources.remove(_dataSource, true);
      }
      _dataSource = null;
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
        stale: _stale,
      };
    },
  };
}
