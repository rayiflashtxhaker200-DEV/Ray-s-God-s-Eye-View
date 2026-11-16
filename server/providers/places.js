/** Place-search and route middleware for Node development servers. */
export { googlePlacesContextProxy } from './places/google.js';
export {
  googleServerApiKey,
  keylessGooglePlacesResponse,
} from './places/google-key.js';
export { installRouteMiddleware } from './places/routes.js';
export {
  makeRateLimiter,
  makeOptInRateLimiter,
  clientKey,
} from './common/rate-limit.js';
export { haversineKm } from './common/geo.js';

export function keylessGoogleGeocodeResponse(apiKey) {
  if (String(apiKey ?? '').trim()) return null;
  return {
    statusCode: 200,
    payload: { configured: false, status: 'REQUEST_DENIED', results: [], error: null },
  };
}

export function validateGeocodeAddress(raw) {
  const value = String(raw ?? '').trim();
  if (!value || value.length > 256) {
    return { ok: false, error: 'address must be 1-256 characters' };
  }
  return { ok: true, address: value };
}

export function geocodeBounds(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const parts = raw.split('|');
  if (parts.length !== 2) return null;
  const [sw, ne] = parts.map((p) => p.split(',').map(Number));
  if (
    sw.length !== 2 ||
    ne.length !== 2 ||
    sw.some((n) => !Number.isFinite(n)) ||
    ne.some((n) => !Number.isFinite(n))
  ) {
    return null;
  }
  return `${sw[0]},${sw[1]}|${ne[0]},${ne[1]}`;
}
