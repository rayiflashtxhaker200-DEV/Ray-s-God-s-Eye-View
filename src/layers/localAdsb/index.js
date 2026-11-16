import * as Cesium from 'cesium';

export function createLocalAdsbLayer({ receiver, feeds } = {}) {
  let _viewer = null;
  let _dataSource = null;
  let _enabled = false;
  let _records = [];
  let _lastUpdate = null;
  let _lastError = null;
  let _unsubscribeFeeds = null;

  const syncGraphics = () => {
    if (!_dataSource) return;
    _dataSource.entities.removeAll();
    if (!_enabled) return;
    for (const ac of _records) {
      if (!Number.isFinite(ac?.lat) || !Number.isFinite(ac?.lon)) continue;
      _dataSource.entities.add(
        new Cesium.Entity({
          id: `local-adsb:${ac.icao24 || ac.id || `${ac.lat},${ac.lon}`}`,
          position: Cesium.Cartesian3.fromDegrees(
            ac.lon,
            ac.lat,
            Number.isFinite(ac.altitudeM) ? ac.altitudeM : 0,
          ),
          point: {
            pixelSize: 8,
            color: Cesium.Color.fromCssColorString('#ffd166'),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
          },
        }),
      );
    }
    _viewer?.scene?.requestRender?.();
  };

  return {
    id: 'local-adsb',
    name: 'Local ADS-B',
    icon: '📡',
    source: 'Local SDR / Decoder',
    updateInterval: 2_000,
    receiver,
    feeds,

    init(viewer) {
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource('local-adsb');
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
    },

    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
      _unsubscribeFeeds?.();
      _unsubscribeFeeds = feeds?.subscribe?.((snap) => {
        _records = Array.isArray(snap?.records) ? snap.records : [];
        _lastUpdate = snap?.generatedAt ?? Date.now();
        _lastError = snap?.error || null;
        syncGraphics();
      }) || null;
      feeds?.start?.();
    },

    disable() {
      _enabled = false;
      feeds?.stop?.();
      _unsubscribeFeeds?.();
      _unsubscribeFeeds = null;
      if (_dataSource) _dataSource.show = false;
      _dataSource?.entities.removeAll();
    },

    async update() {
      if (!_enabled) return false;
      const snap = await feeds?.refresh?.();
      _records = Array.isArray(snap?.records) ? snap.records : [];
      _lastUpdate = snap?.generatedAt ?? Date.now();
      _lastError = snap?.error || null;
      syncGraphics();
      return !_lastError;
    },

    destroy() {
      _enabled = false;
      feeds?.stop?.();
      _unsubscribeFeeds?.();
      _unsubscribeFeeds = null;
      if (_dataSource && _viewer && !_viewer.isDestroyed?.()) {
        _viewer.dataSources.remove(_dataSource, true);
      }
      _dataSource = null;
      _viewer = null;
      _records = [];
      _lastUpdate = null;
      _lastError = null;
    },

    getAnalystRecords(maxCount = 500) {
      if (!_enabled || !_records.length) return [];
      const limit = Number.isFinite(maxCount) ? Math.max(1, Math.floor(maxCount)) : 500;
      return _records.slice(0, limit).map((ac) => ({
        id: ac.callsign || ac.icao24 || ac.id || 'unknown',
        callsign: ac.callsign ?? null,
        icao24: ac.icao24 ?? null,
        altitudeM: ac.altitudeM ?? null,
        speedKts: ac.speedKts ?? null,
        heading: ac.heading ?? null,
        onGround: Boolean(ac.onGround),
        lat: ac.lat,
        lon: ac.lon,
      }));
    },

    getStats() {
      return {
        count: _records.length,
        lastUpdate: _lastUpdate,
        error: _lastError,
      };
    },
  };
}
