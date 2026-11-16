import { makeRateLimiter } from '../../../src/sources/rateLimit.js';
export { makeRateLimiter } from '../../../src/sources/rateLimit.js';

/**
 * Opt-in per-IP rate limiter for the cost-bearing API proxies (OpenAI / Google).
 * DEFAULT IS UNLIMITED: when the env var is unset, `0`, or non-numeric, this
 * returns `null` and the caller skips the check entirely — a runtime no-op that
 * preserves the original behavior. Only a positive integer N enables a fixed
 * 60s window of N requests/IP (built lazily once, then reused so its per-IP
 * window state persists across requests). The global backstop is set to a
 * generous multiple of the per-IP cap so a single host can't starve the rest.
 *
 * @param {string|undefined} envValue - Raw env value (requests/min/IP).
 * @returns {((key:string)=>boolean)|null} An `allow(key)` fn, or null when unlimited.
 */
export function resolvePerMinuteCap(envValue, defaultPerMin = 30) {
  if (envValue === undefined || envValue === null) return defaultPerMin;
  const trimmed = String(envValue).trim();
  if (!trimmed) return defaultPerMin;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return defaultPerMin;
  if (parsed === 0) return 0;
  return Math.max(1, Math.floor(parsed));
}

export function makeCostRateLimiter(envValue, defaultPerMin = 30) {
  const cap = resolvePerMinuteCap(envValue, defaultPerMin);
  if (cap <= 0) return null;
  return makeRateLimiter({
    windowMs: 60_000,
    max: cap,
    globalMax: cap * 20,
  });
}

export function makeOptInRateLimiter(envValue) {
  const max = Number(envValue);
  if (!Number.isFinite(max) || max <= 0) return null; // unset/0/garbage -> unlimited
  return makeRateLimiter({
    windowMs: 60_000,
    max: Math.floor(max),
    globalMax: Math.floor(max) * 20,
  });
}

/**
 * Client key for rate limiting. Uses the real socket peer address only — we do
 * NOT trust X-Forwarded-For (client-controlled; a rotating value would mint fresh
 * quota and grow the limiter map). This is a localhost dev proxy, so the socket
 * address is the real client.
 */
export function clientKey(req) {
  return String(req.socket?.remoteAddress || 'local');
}
