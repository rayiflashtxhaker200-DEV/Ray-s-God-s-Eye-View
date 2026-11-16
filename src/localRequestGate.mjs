const PROXY_HEADER_NAMES = new Set([
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-forwarded-server',
  'x-real-ip',
  'cf-connecting-ip',
  'true-client-ip',
  'via',
]);

export function hasProxySignals(headers = {}) {
  if (!headers || typeof headers !== 'object') return false;
  for (const [key, value] of Object.entries(headers)) {
    if (!PROXY_HEADER_NAMES.has(String(key).toLowerCase())) continue;
    if (Array.isArray(value) ? value.some((v) => String(v ?? '').trim() !== '') : String(value ?? '').trim() !== '') {
      return true;
    }
  }
  return false;
}

export function admitSameSiteRequest({
  hostHeader,
  protocol = 'http:',
  origin,
  secFetchSite,
  proxyHeaders = {},
} = {}) {
  if (hasProxySignals(proxyHeaders)) {
    return {
      ok: false,
      status: 403,
      error: 'Proxied requests are refused',
    };
  }

  const fetchSite = String(secFetchSite || '')
    .trim()
    .toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return {
      ok: false,
      status: 403,
      error: 'Cross-site requests are refused',
    };
  }

  if (origin !== undefined && origin !== null && origin !== '') {
    const rawOrigin = String(origin).trim();
    if (rawOrigin === 'null') {
      return {
        ok: false,
        status: 403,
        error: 'Opaque origin requests are refused',
      };
    }
    const rawHost = String(hostHeader || '').trim();
    const scheme = String(protocol || 'http:').toLowerCase();
    if (!rawHost || /[\s/?#@\\]/.test(rawHost) || (scheme !== 'http:' && scheme !== 'https:')) {
      return {
        ok: false,
        status: 403,
        error: 'Invalid Host header',
      };
    }
    let expectedOrigin;
    let parsedOrigin;
    try {
      expectedOrigin = new URL(`${scheme}//${rawHost}`).origin;
      parsedOrigin = new URL(rawOrigin);
    } catch {
      return {
        ok: false,
        status: 403,
        error: 'Unrecognized Origin refused',
      };
    }
    if (parsedOrigin.origin !== expectedOrigin) {
      return {
        ok: false,
        status: 403,
        error: 'Cross-origin requests are refused',
      };
    }
  }

  return { ok: true };
}
