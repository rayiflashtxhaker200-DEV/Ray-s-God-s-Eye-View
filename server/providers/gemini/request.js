import { readRequestBody } from '../common/request.js';

function parseHostname(hostHeader) {
  const raw = String(hostHeader || '')
    .trim()
    .toLowerCase();
  if (!raw || /[\s/?#@\\]/.test(raw)) return '';
  if (raw.startsWith('[')) {
    const close = raw.indexOf(']');
    return close > 0 ? raw.slice(0, close + 1) : '';
  }
  const colon = raw.indexOf(':');
  return colon > 0 ? raw.slice(0, colon) : raw;
}

export function resolveAllowedHosts(configured) {
  const list = String(configured || '')
    .split(',')
    .map((h) => parseHostname(h))
    .filter(Boolean);
  return new Set(['localhost', '127.0.0.1', '[::1]', ...list]);
}

function isLocalOrPreviewHost(hostname) {
  if (!hostname) return false;
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '0.0.0.0'
  ) {
    return true;
  }
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (
    hostname.endsWith('.run.app') ||
    hostname.endsWith('.googleusercontent.com') ||
    hostname.endsWith('.aistudio.google.com')
  ) {
    return true;
  }
  return false;
}

export function isAllowedHost(host, allowedSet, extra = []) {
  const hostname = parseHostname(host);
  if (!hostname) return false;
  if (isLocalOrPreviewHost(hostname)) return true;
  if (allowedSet?.has?.(hostname)) return true;
  for (const item of extra) {
    const clean = parseHostname(item);
    if (clean && clean === hostname) return true;
  }
  try {
    const appHost = process.env.APP_URL
      ? parseHostname(new URL(process.env.APP_URL).host)
      : '';
    if (appHost && appHost === hostname) return true;
  } catch {
    // ignore malformed APP_URL
  }
  return false;
}

/** Use the app's Host and request policies, with a required browser Origin. */
export function isGeminiRequestOriginAllowed(
  req,
  configuredHost = '',
  configuredAllowedHosts,
) {
  const host = req.headers?.host;
  const origin = req.headers?.origin;
  if (
    typeof host !== 'string' ||
    typeof origin !== 'string' ||
    !host ||
    !origin ||
    /[\s/?#@\\]/.test(host)
  ) {
    return false;
  }
  const fetchSite = String(req.headers?.['sec-fetch-site'] || '')
    .trim()
    .toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return false;
  }
  const rawOrigin = origin.trim();
  if (rawOrigin === 'null') return false;
  let parsedOrigin;
  try {
    parsedOrigin = new URL(rawOrigin);
  } catch {
    return false;
  }
  if (parsedOrigin.protocol !== 'http:' && parsedOrigin.protocol !== 'https:') {
    return false;
  }
  const forwardedHost = String(req.headers?.['x-forwarded-host'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const effectiveHost = host.trim().toLowerCase();
  const originHost = parsedOrigin.host.toLowerCase();
  if (
    originHost !== effectiveHost &&
    (!forwardedHost || originHost !== forwardedHost)
  ) {
    return false;
  }
  const boundHost = String(configuredHost || '')
    .trim()
    .toLowerCase();
  return isAllowedHost(
    originHost,
    resolveAllowedHosts(configuredAllowedHosts),
    [boundHost],
  );
}

/** Admit only the existing input gesture; callers cannot supply model/setup. */
export async function readGeminiTokenRequest(req, signal, maxBytes = 1024) {
  const declared = Number(req.headers?.['content-length']);
  const fail = (code) =>
    Object.assign(new Error('Invalid token request'), { code });
  const body = await readRequestBody(
    req,
    maxBytes,
    Number.isFinite(declared) && declared > maxBytes
      ? AbortSignal.abort(fail('BODY_TOO_LARGE'))
      : signal,
  );
  if (!body.trim()) return 'open-mic';
  if (
    !/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type'] || '')
  )
    throw fail('BAD_CONTENT_TYPE');
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw fail('BAD_BODY');
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
    throw fail('BAD_BODY');
  const keys = Object.keys(parsed);
  if (!keys.length) return 'open-mic';
  if (
    keys.length === 1 &&
    keys[0] === 'inputMode' &&
    parsed.inputMode === 'push-to-talk'
  )
    return 'push-to-talk';
  throw fail('BAD_BODY');
}
