import * as Cesium from 'cesium';
import { t, tn } from '../../i18n/index.js';

function createDefaultRendering() {
  let dataSource = null;
  let viewerRef = null;
  const pickMap = new Map();

  return {
    async setSnapshot(viewer, snapshot) {
      viewerRef = viewer;
      if (!dataSource) {
        dataSource = new Cesium.CustomDataSource('weather-cyclones');
        viewer.dataSources.add(dataSource);
      }
      dataSource.entities.removeAll();
      pickMap.clear();
      const storms = Array.isArray(snapshot?.storms) ? snapshot.storms : [];
      for (const storm of storms) {
        const lat = storm?.position?.latitude;
        const lon = storm?.position?.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const id = `cyclone:${storm.id}`;
        pickMap.set(id, storm);
        dataSource.entities.add(
          new Cesium.Entity({
            id,
            position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
            point: {
              pixelSize: 12,
              color: Cesium.Color.fromCssColorString('#ff7b54'),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          }),
        );
      }
      viewer?.scene?.requestRender?.();
      return true;
    },
    setSelection() {},
    clear() {
      dataSource?.entities.removeAll();
      pickMap.clear();
      viewerRef?.scene?.requestRender?.();
    },
    destroy() {
      if (dataSource && viewerRef && !viewerRef.isDestroyed?.()) {
        viewerRef.dataSources.remove(dataSource, true);
      }
      dataSource = null;
      viewerRef = null;
      pickMap.clear();
    },
    pickStorm(picked) {
      const id = picked?.id?.id ?? picked?.id;
      return typeof id === 'string' ? pickMap.get(id) || null : null;
    },
    ownsPickId(id) {
      return typeof id === 'string' && id.startsWith('cyclone:');
    },
    getDiagnostics() {
      return { count: pickMap.size };
    },
  };
}

export function createCyclonesLayer({
  feed,
  cesium = Cesium,
  createRendering = createDefaultRendering,
} = {}) {
  if (typeof feed?.getSnapshot !== 'function') {
    throw new TypeError('Cyclones layer requires a feed with getSnapshot');
  }

  let _viewer = null;
  let _enabled = false;
  let _snapshot = null;
  let _count = 0;
  let _lastUpdate = null;
  let _lastError = null;
  let _request = null;
  let _rendering = null;
  let _clickHandler = null;
  let _rowControlsListener = null;

  const notify = () => {
    try {
      _rowControlsListener?.();
    } catch {
      /* best effort */
    }
  };

  return {
    id: 'weather-cyclones',
    name: 'Tropical Cyclones',
    icon: '🌀',
    source: 'NOAA NHC / CPHC',
    updateInterval: 300_000,

    init(viewer) {
      _viewer = viewer;
      _rendering = createRendering(viewer, cesium);
      if (viewer?.scene?.canvas && cesium?.ScreenSpaceEventHandler) {
        _clickHandler = new cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      }
    },

    enable() {
      _enabled = true;
      notify();
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      _rendering?.clear();
      notify();
    },

    async update() {
      if (!_enabled || !_viewer) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const snapshot = await feed.getSnapshot({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled) {
          return false;
        }
        _snapshot = snapshot;
        const storms = Array.isArray(snapshot?.storms) ? snapshot.storms : [];
        _count = storms.length;
        _lastUpdate = Date.now();
        _lastError = snapshot?.unavailable ? snapshot?.reason || 'Cyclone data unavailable' : null;
        await _rendering?.setSnapshot(_viewer, snapshot);
        notify();
        return !snapshot?.unavailable;
      } catch (error) {
        if (request.signal.aborted || _request !== request) return false;
        _lastError = error?.message || 'Cyclone data unavailable';
        notify();
        return false;
      } finally {
        if (_request === request) _request = null;
      }
    },

    destroy() {
      _request?.abort();
      _request = null;
      _enabled = false;
      if (_clickHandler && !_clickHandler.isDestroyed?.()) {
        _clickHandler.destroy();
      }
      _clickHandler = null;
      _rendering?.destroy();
      _rendering = null;
      _viewer = null;
      _snapshot = null;
      _count = 0;
      _lastUpdate = null;
      _lastError = null;
      _rowControlsListener = null;
    },

    getAnalystRecords(maxCount = 500) {
      if (!_enabled || !_snapshot?.storms?.length) return [];
      const limit = Number.isFinite(maxCount) ? Math.max(1, Math.floor(maxCount)) : 500;
      return _snapshot.storms.slice(0, limit).map((storm) => ({
        id: storm.name,
        name: storm.name,
        classification: storm.classification ?? null,
        basin: storm.basin ?? null,
        lat: storm.position?.latitude ?? null,
        lon: storm.position?.longitude ?? null,
        windKt: storm.windKt ?? null,
        pressureHpa: storm.pressureHpa ?? null,
      }));
    },

    getRowControls() {
      const storms = Array.isArray(_snapshot?.storms) ? _snapshot.storms : [];
      return {
        readout: true,
        summary: {
          label: t('Tropical Cyclones'),
          coverage: t(_snapshot?.coverage || 'Atlantic and eastern/central North Pacific'),
          status: _lastError
            ? _lastError
            : tn(storms.length, '{count} active cyclone', '{count} active cyclones'),
        },
        list: {
          ariaLabel: t('Active tropical cyclones'),
          items: storms.map((storm, index) => ({
            id: storm.id || String(index),
            ordinal: index + 1,
            lead: storm.classification || '',
            text: `${storm.name}${Number.isFinite(storm.windKt) ? ` · ${storm.windKt} kt` : ''}`,
          })),
        },
      };
    },

    setRowControlsListener(listener) {
      _rowControlsListener = typeof listener === 'function' ? listener : null;
    },

    getStats() {
      return {
        count: _count,
        lastUpdate: _lastUpdate,
        error: _lastError,
        stale: _snapshot?.stale === true,
      };
    },
  };
}
