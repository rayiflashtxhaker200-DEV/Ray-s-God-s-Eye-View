export const VIEW_STYLES = Object.freeze([
  'normal',
  'retro',
  'surveillance',
  'thermal',
  'anime',
  'noir',
]);

export const STYLE_URL_NAMES = Object.freeze({
  normal: 'normal',
  retro: 'retro',
  surveillance: 'nvg',
  thermal: 'flir',
  anime: 'cel',
  noir: 'noir',
});

export const VIEW_PROPERTIES = Object.freeze({
  camera: Object.freeze({
    type: 'object',
    properties: Object.freeze({
      lat: { type: 'number', minimum: -90, maximum: 90 },
      lon: { type: 'number', minimum: -180, maximum: 180 },
      altitude_m: { type: 'number', minimum: 10, maximum: 50_000_000 },
      heading_deg: { type: 'number', minimum: -360, maximum: 360 },
      pitch_deg: { type: 'number', minimum: -90, maximum: 90 },
      roll_deg: { type: 'number', minimum: -180, maximum: 180 },
    }),
    required: ['lat', 'lon'],
  }),
  layers: Object.freeze({
    type: 'array',
    items: { type: 'string' },
  }),
  style: Object.freeze({
    type: ['string', 'null'],
    enum: [...VIEW_STYLES, null],
  }),
  map: Object.freeze({
    type: ['string', 'null'],
  }),
  follow: Object.freeze({
    type: ['object', 'null'],
  }),
  annotations: Object.freeze({
    type: 'array',
  }),
});

export function createView(input = {}) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('View must be an object');
  }
  const cam = input.camera || {};
  const lat = Number(cam.lat);
  const lon = Number(cam.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError('View camera requires a finite latitude in [-90, 90]');
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new RangeError('View camera requires a finite longitude in [-180, 180]');
  }
  const altRaw = Number(cam.altitude_m);
  const headingRaw = Number(cam.heading_deg);
  const pitchRaw = Number(cam.pitch_deg);
  const rollRaw = Number(cam.roll_deg);

  const camera = {
    lat,
    lon,
    altitude_m: Number.isFinite(altRaw) && altRaw > 0 ? altRaw : 1500,
    heading_deg: Number.isFinite(headingRaw) ? headingRaw : 0,
    pitch_deg: Number.isFinite(pitchRaw) ? Math.max(-90, Math.min(90, pitchRaw)) : -45,
    roll_deg: Number.isFinite(rollRaw) ? rollRaw : 0,
  };

  const layers = Array.isArray(input.layers)
    ? [...new Set(input.layers.filter((id) => typeof id === 'string' && id.trim()))]
    : [];

  const style =
    typeof input.style === 'string' && VIEW_STYLES.includes(input.style)
      ? input.style
      : null;
  const map = typeof input.map === 'string' && input.map.trim() ? input.map.trim() : null;
  const follow =
    input.follow && typeof input.follow === 'object' && input.follow.kind && input.follow.id
      ? {
          kind: String(input.follow.kind),
          id: String(input.follow.id),
          cockpit: Boolean(input.follow.cockpit),
        }
      : null;
  const annotations = Array.isArray(input.annotations) ? [...input.annotations] : [];

  return {
    camera,
    layers,
    style,
    map,
    follow,
    annotations,
  };
}

export function viewUrl(baseUrl, view) {
  const url = new URL(baseUrl);
  const params = new URLSearchParams();
  params.set('lat', view.camera.lat.toFixed(5));
  params.set('lon', view.camera.lon.toFixed(5));
  params.set('alt', String(Math.round(view.camera.altitude_m)));
  params.set('heading', String(Math.round(view.camera.heading_deg)));
  params.set('pitch', String(Math.round(view.camera.pitch_deg)));
  if (view.style) {
    params.set('style', STYLE_URL_NAMES[view.style] || view.style);
  }
  if (view.map) {
    params.set('map', view.map);
  }
  if (view.layers?.length) {
    params.set('layers', view.layers.join(','));
  }
  if (view.annotations?.length) {
    try {
      params.set('annotations', JSON.stringify(view.annotations));
    } catch {
      /* ignore unserializable annotation entries */
    }
  }
  url.hash = params.toString();
  return url.href;
}

export function annotationsFromParams(params) {
  if (!params || typeof params.get !== 'function') return [];
  const raw = params.get('annotations');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
