import * as Cesium from 'cesium';
import { OSM_PLACES_LAYER_ID } from './model.js';

export function createOsmPlacesLayer({ overlayHost } = {}) {
  let _viewer = null;
  let _dataSource = null;
  let _enabled = false;
  let _records = [];
  let _meta = null;
  let _lastUpdate = null;

  const syncGraphics = () => {
    if (!_dataSource) return;
    _dataSource.entities.removeAll();
    const overlayEntries = [];
    for (const record of _records) {
      if (!Number.isFinite(record?.lat) || !Number.isFinite(record?.lon)) continue;
      const position = Cesium.Cartesian3.fromDegrees(record.lon, record.lat, 0);
      _dataSource.entities.add(
        new Cesium.Entity({
          id: `osm-place:${record.id}`,
          position,
          point: {
            pixelSize: 9,
            color: Cesium.Color.fromCssColorString('#66d9ef'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      );
      if (record.name) {
        overlayEntries.push({
          id: `osm-place-${record.id}`,
          position,
          title: record.name,
          subtitle: _meta?.label || record.kind || 'Place',
          accent: '#66d9ef',
        });
      }
    }
    if (_enabled) {
      overlayHost?.setEntries?.(OSM_PLACES_LAYER_ID, overlayEntries, {
        cohortLimit: 18,
        collisionCapacity: 12,
        moving: false,
      });
    }
    _viewer?.scene?.requestRender?.();
  };

  return {
    id: OSM_PLACES_LAYER_ID,
    name: 'OSM Places',
    icon: '📍',
    source: 'OpenStreetMap',
    updateInterval: 0,

    init(viewer) {
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource(OSM_PLACES_LAYER_ID);
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
      overlayHost?.setVisible?.(OSM_PLACES_LAYER_ID, false);
    },

    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      overlayHost?.setVisible?.(OSM_PLACES_LAYER_ID, true);
      syncGraphics();
    },

    disable() {
      _enabled = false;
      if (_dataSource) _dataSource.show = false;
      overlayHost?.clearSource?.(OSM_PLACES_LAYER_ID);
      overlayHost?.setVisible?.(OSM_PLACES_LAYER_ID, false);
    },

    async update() {
      return true;
    },

    setResults(records, meta = null) {
      _records = Array.isArray(records) ? [...records] : [];
      _meta = meta;
      _lastUpdate = Date.now();
      syncGraphics();
    },

    getAnalystRecords(maxCount = 500) {
      if (!_enabled || !_records.length) return [];
      const limit = Number.isFinite(maxCount) ? Math.max(1, Math.floor(maxCount)) : 500;
      return _records.slice(0, limit).map((r) => ({ ...r }));
    },

    destroy() {
      _enabled = false;
      overlayHost?.clearSource?.(OSM_PLACES_LAYER_ID);
      overlayHost?.setVisible?.(OSM_PLACES_LAYER_ID, false);
      if (_dataSource && _viewer && !_viewer.isDestroyed?.()) {
        _viewer.dataSources.remove(_dataSource, true);
      }
      _dataSource = null;
      _viewer = null;
      _records = [];
      _meta = null;
      _lastUpdate = null;
    },

    getStats() {
      return {
        count: _records.length,
        lastUpdate: _lastUpdate,
        error: null,
      };
    },
  };
}
