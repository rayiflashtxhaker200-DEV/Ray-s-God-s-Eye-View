import * as Cesium from 'cesium';
import { t } from '../../i18n/index.js';
import { resolveImageryHost } from './imageryHost.js';

const LAYER_SPECS = Object.freeze({
  'weather-radar': {
    product: 'radar',
    name: 'Weather Radar',
    icon: '🌧',
    intervalMs: 120_000,
    maxGapMinutes: 30,
  },
  'weather-satellite': {
    product: 'clouds',
    name: 'Satellite Clouds',
    icon: '☁',
    intervalMs: 600_000,
    maxGapMinutes: 120,
  },
  'weather-lightning': {
    product: 'lightning',
    name: 'Lightning Density',
    icon: '⚡',
    intervalMs: 180_000,
    maxGapMinutes: 30,
  },
});

export function createWeatherLayer({
  feed,
  id = 'weather-radar',
  clock = null,
} = {}) {
  if (typeof feed?.getSnapshot !== 'function') {
    throw new TypeError('Weather layer requires a feed with getSnapshot');
  }
  const spec = LAYER_SPECS[id] || LAYER_SPECS['weather-radar'];

  let _viewer = null;
  let _enabled = false;
  let _request = null;
  let _manifest = null;
  let _imageryLayer = null;
  let _hostCollection = null;
  let _lastUpdate = null;
  let _lastError = null;
  let _rowControlsListener = null;

  const notify = () => {
    try {
      _rowControlsListener?.();
    } catch {
      /* best effort */
    }
  };

  function clearImagery() {
    if (_imageryLayer && _hostCollection && !_hostCollection.isDestroyed?.()) {
      try {
        _hostCollection.remove(_imageryLayer, true);
      } catch {
        /* already removed */
      }
    }
    _imageryLayer = null;
    _hostCollection = null;
  }

  function applyImagery(manifest) {
    clearImagery();
    if (!_enabled || !_viewer || !manifest?.tileTemplate) return;
    const { collection } = resolveImageryHost({ viewer: _viewer });
    if (!collection) return;
    const bounds = manifest.bounds;
    const rectangle = bounds
      ? Cesium.Rectangle.fromDegrees(bounds.west, bounds.south, bounds.east, bounds.north)
      : Cesium.Rectangle.MAX_VALUE;
    const provider = new Cesium.UrlTemplateImageryProvider({
      url: manifest.tileTemplate,
      tilingScheme: new Cesium.GeographicTilingScheme({
        numberOfLevelZeroTilesX: 2,
        numberOfLevelZeroTilesY: 1,
      }),
      tileWidth: manifest.tileSize || 256,
      tileHeight: manifest.tileSize || 256,
      maximumLevel: manifest.maxLevel || 6,
      rectangle,
    });
    _imageryLayer = collection.addImageryProvider(provider);
    _imageryLayer.alpha = 0.72;
    _hostCollection = collection;
    _viewer.scene?.requestRender?.();
  }

  return {
    id,
    name: spec.name,
    icon: spec.icon,
    source: 'NOAA nowCOAST',
    updateInterval: spec.intervalMs,

    init(viewer) {
      _viewer = viewer;
    },

    enable() {
      _enabled = true;
      notify();
    },

    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      clearImagery();
      clock?.registerProduct?.(id, null);
      notify();
    },

    async update() {
      if (!_enabled || !_viewer) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const manifest = await feed.getSnapshot({
          product: spec.product,
          signal: request.signal,
        });
        if (request.signal.aborted || _request !== request || !_enabled) return false;
        _manifest = manifest;
        _lastUpdate = Date.now();
        _lastError = manifest?.unavailable ? manifest?.reason || 'Weather imagery unavailable' : null;
        if (!manifest?.unavailable) {
          applyImagery(manifest);
          clock?.registerProduct?.(id, {
            times: manifest.times || [],
            shown: manifest.latest || null,
            maxGapMinutes: spec.maxGapMinutes,
          });
        }
        notify();
        return !manifest?.unavailable;
      } catch (error) {
        if (request.signal.aborted || _request !== request) return false;
        _lastError = error?.message || 'Weather imagery unavailable';
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
      clearImagery();
      clock?.registerProduct?.(id, null);
      _viewer = null;
      _manifest = null;
      _lastUpdate = null;
      _lastError = null;
      _rowControlsListener = null;
    },

    getRowControls() {
      return {
        readout: true,
        summary: {
          label: t(_manifest?.title || spec.name),
          coverage: t(_manifest?.coverage || 'NOAA nowCOAST'),
          shownTime: _manifest?.latest || null,
          maxGapMinutes: spec.maxGapMinutes,
          detail: _manifest?.description || spec.name,
          status: _lastError || (_manifest?.latest ? t('Live') : t('Loading…')),
        },
      };
    },

    setRowControlsListener(listener) {
      _rowControlsListener = typeof listener === 'function' ? listener : null;
    },

    getStats() {
      return {
        count: _manifest?.latest ? 1 : 0,
        lastUpdate: _lastUpdate,
        error: _lastError,
        stale: _manifest?.stale === true,
      };
    },
  };
}
