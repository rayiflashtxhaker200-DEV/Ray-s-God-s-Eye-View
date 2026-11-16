import { msg, t } from '../../i18n/index.js';

export const WIND_UPSTREAM_UNAVAILABLE = msg('Wind upstream unavailable');

export function createWindLayer({ feed } = {}) {
  if (typeof feed?.getSnapshot !== 'function') {
    throw new TypeError('Wind layer requires a feed with getSnapshot');
  }

  let _viewer = null;
  let _enabled = false;
  let _request = null;
  let _snapshot = null;
  let _lastUpdate = null;
  let _lastError = null;
  let _params = { model: 'gfs', units: 'mps', inspect: false };
  let _rowControlsListener = null;

  const notify = () => {
    try {
      _rowControlsListener?.();
    } catch {
      /* best effort */
    }
  };

  return {
    id: 'wind',
    name: 'Global Wind',
    icon: '💨',
    source: 'NOAA GFS / ECMWF IFS',
    updateInterval: 3_600_000,

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
      _params = { ..._params, inspect: false };
      notify();
    },

    async update() {
      if (!_enabled || !_viewer) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const snapshot = await feed.getSnapshot({
          model: _params.model,
          signal: request.signal,
        });
        if (request.signal.aborted || _request !== request || !_enabled) return false;
        _snapshot = snapshot;
        _lastUpdate = Date.now();
        _lastError = snapshot?.unavailable ? snapshot?.reason || WIND_UPSTREAM_UNAVAILABLE : null;
        notify();
        return !snapshot?.unavailable;
      } catch (error) {
        if (request.signal.aborted || _request !== request) return false;
        _lastError = error?.message || WIND_UPSTREAM_UNAVAILABLE;
        notify();
        return false;
      } finally {
        if (_request === request) _request = null;
      }
    },

    setParams(next = {}) {
      if (!next || typeof next !== 'object') return false;
      _params = { ..._params, ...next };
      notify();
      return true;
    },

    getParams() {
      return { ..._params };
    },

    getRowControls() {
      const cycle = _snapshot?.cycle;
      const validTime = cycle?.date ? `${cycle.date}T${String(cycle.hour ?? '00').padStart(2, '0')}:00:00Z` : null;
      return {
        readout: true,
        summary: {
          label: t('Global Wind'),
          coverage: t('Global'),
          validTime,
          issuedTime: validTime,
          status: _lastError ? t(_lastError) : _snapshot ? t('10 m above ground') : t('Loading…'),
          actions: [
            {
              id: 'read-wind',
              label: t('Read wind at map center'),
              params: { inspect: true },
              disabled: !_enabled || !_snapshot || _snapshot.unavailable === true,
            },
          ],
        },
      };
    },

    setRowControlsListener(listener) {
      _rowControlsListener = typeof listener === 'function' ? listener : null;
    },

    destroy() {
      _request?.abort();
      _request = null;
      _enabled = false;
      _viewer = null;
      _snapshot = null;
      _lastUpdate = null;
      _lastError = null;
      _rowControlsListener = null;
    },

    getStats() {
      return {
        count: _snapshot && !_snapshot.unavailable ? 1 : 0,
        lastUpdate: _lastUpdate,
        error: _lastError,
        stale: _snapshot?.stale === true,
      };
    },
  };
}
