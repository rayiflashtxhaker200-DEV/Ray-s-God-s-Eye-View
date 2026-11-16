import * as Cesium from 'cesium';

const SOURCE_ID = 'fire-perimeters';

export function createInciwebIndexSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    async getIndex({ signal } = {}) {
      const response = await fetchImpl('/api/fire-perimeters/inciweb/index', {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`InciWeb index HTTP ${response.status}`);
      return response.json();
    },
  };
}

export function createInciwebPublicationSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    async getPublication(id, { signal } = {}) {
      const response = await fetchImpl(
        `/api/fire-perimeters/inciweb/publication/${encodeURIComponent(id)}`,
        { signal, headers: { Accept: 'application/json' } },
      );
      if (!response.ok) throw new Error(`InciWeb publication HTTP ${response.status}`);
      return response.json();
    },
  };
}

function polygonCenter(polygons) {
  let lat = 0;
  let lon = 0;
  let count = 0;
  for (const poly of polygons || []) {
    for (const [x, y] of poly?.[0] || []) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      lon += x;
      lat += y;
      count += 1;
    }
  }
  return count ? { lat: lat / count, lon: lon / count } : { lat: null, lon: null };
}

export function createFirePerimetersLayer({ source, overlayHost } = {}) {
  if (typeof source?.getSnapshot !== 'function') {
    throw new TypeError('Fire perimeters require a snapshot source');
  }

  let _viewer = null;
  let _dataSource = null;
  let _enabled = false;
  let _request = null;
  let _rows = [];
  let _lastUpdate = null;
  let _lastError = null;
  let _stale = false;

  return {
    id: SOURCE_ID,
    name: 'Fire Perimeters',
    icon: '🔥',
    source: 'NIFC WFIGS',
    updateInterval: 300_000,

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
        const result = typeof source.getSnapshotDetail === 'function'
          ? await source.getSnapshotDetail({ signal: request.signal })
          : { rows: await source.getSnapshot({ signal: request.signal }), stale: false };
        if (request.signal.aborted || _request !== request || !_enabled) return false;
        const rows = Array.isArray(result?.rows)
          ? result.rows
          : Array.isArray(result)
            ? result
            : [];
        _rows = rows;
        _stale = result?.stale === true;
        _dataSource.entities.removeAll();
        const fill = Cesium.Color.fromCssColorString('#ff6b35').withAlpha(0.32);
        const outline = Cesium.Color.fromCssColorString('#ff9f1c');
        for (const fire of rows) {
          const ring = fire.polygons?.[0]?.[0];
          if (!Array.isArray(ring) || ring.length < 3) continue;
          _dataSource.entities.add(
            new Cesium.Entity({
              id: `fire-perimeter:${fire.stableId}`,
              polygon: {
                hierarchy: Cesium.Cartesian3.fromDegreesArray(ring.flat()),
                material: fill,
                outline: true,
                outlineColor: outline,
                classificationType: Cesium.ClassificationType.BOTH,
              },
            }),
          );
        }
        _lastUpdate = Date.now();
        _lastError = null;
        _viewer?.scene?.requestRender?.();
        return true;
      } catch (error) {
        if (request.signal.aborted || _request !== request) return false;
        _lastError = error?.message || 'Fire perimeters unavailable';
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
      _rows = [];
      _lastUpdate = null;
      _lastError = null;
    },

    getAnalystRecords(maxCount = 500) {
      if (!_enabled || !_rows.length) return [];
      const limit = Number.isFinite(maxCount) ? Math.max(1, Math.floor(maxCount)) : 500;
      return _rows.slice(0, limit).map((fire) => {
        const center = polygonCenter(fire.polygons);
        return {
          id: fire.stableId,
          name: fire.name,
          acres: fire.acres,
          containedPct: fire.containedPct,
          personnel: fire.personnel,
          costToDate: fire.costToDate,
          state: fire.state,
          county: fire.county,
          cause: fire.cause,
          behavior: fire.behavior,
          complexity: fire.complexity,
          discoveredTime: fire.discoveredTime,
          lat: center.lat,
          lon: center.lon,
        };
      });
    },

    getStats() {
      return {
        count: _rows.length,
        lastUpdate: _lastUpdate,
        error: _lastError,
        stale: _stale,
      };
    },
  };
}
