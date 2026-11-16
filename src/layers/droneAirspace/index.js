import * as Cesium from 'cesium';

const SOURCE_ID = 'drone-airspace';

export function createDroneAirspaceLayer({ source, overlayHost } = {}) {
  if (typeof source?.getSnapshot !== 'function') {
    throw new TypeError('Drone airspace requires a snapshot source');
  }

  let _viewer = null;
  let _dataSource = null;
  let _enabled = false;
  let _request = null;
  let _count = 0;
  let _lastUpdate = null;
  let _lastError = null;

  return {
    id: SOURCE_ID,
    name: 'Restricted Airspace',
    icon: '⬡',
    source: 'FAA SUA',
    updateInterval: 3_600_000,

    init(viewer) {
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource(SOURCE_ID);
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      overlayHost?.setVisible?.(SOURCE_ID, false);
    },

    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      overlayHost?.setVisible?.(SOURCE_ID, true);
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      if (_dataSource) _dataSource.show = false;
      overlayHost?.clearSource?.(SOURCE_ID);
      overlayHost?.setVisible?.(SOURCE_ID, false);
    },

    async update() {
      if (!_enabled || !_dataSource) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const snapshot = await source.getSnapshot({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled) return false;
        const rows = Array.isArray(snapshot?.rows)
          ? snapshot.rows
          : Array.isArray(snapshot)
            ? snapshot
            : [];
        _dataSource.entities.removeAll();
        for (const row of rows) {
          const ring = row.polygons?.[0]?.[0];
          if (!Array.isArray(ring) || ring.length < 3) continue;
          const color = row.typeCode === 'P'
            ? Cesium.Color.fromCssColorString('#ff4d4d')
            : Cesium.Color.fromCssColorString('#ffa94d');
          _dataSource.entities.add(
            new Cesium.Entity({
              id: `drone-airspace:${row.stableId}`,
              polygon: {
                hierarchy: Cesium.Cartesian3.fromDegreesArray(ring.flat()),
                material: color.withAlpha(0.22),
                outline: true,
                outlineColor: color.withAlpha(0.85),
                classificationType: Cesium.ClassificationType.BOTH,
              },
            }),
          );
        }
        _count = rows.length;
        _lastUpdate = Date.now();
        _lastError = null;
        _viewer?.scene?.requestRender?.();
        return true;
      } catch (error) {
        if (request.signal.aborted || _request !== request) return false;
        _lastError = error?.message || 'Drone airspace unavailable';
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
      };
    },
  };
}
