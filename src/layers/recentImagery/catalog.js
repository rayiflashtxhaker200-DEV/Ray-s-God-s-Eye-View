import { PRODUCTS, validateBox } from './model.js';

const CMR_STAC_URL = 'https://cmr.earthdata.nasa.gov/stac/LPCLOUD/search';
const SEARCH_DAYS = 30;
const DAY_MS = 86_400_000;

function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function candidateKey(product, day) {
  return `${product}:${day}`;
}

/** Build fallback daily VIIRS candidates for the trailing 30 days. */
export function buildViirsCandidates({ now = Date.now(), days = SEARCH_DAYS } = {}) {
  const list = [];
  for (let i = 0; i < days; i++) {
    const day = isoDay(now - i * DAY_MS);
    list.push({
      key: candidateKey('VIIRS', day),
      product: 'VIIRS',
      day,
      cloud: null,
      coverage: 'full',
      timeRange: { start: `${day}T12:00:00Z`, end: `${day}T12:00:00Z` },
      granules: [],
      availability: 'unknown',
    });
  }
  return list;
}

/**
 * Search NASA CMR LPCLOUD STAC for HLS S30/L30 acquisitions over `box` in the last 30 days,
 * falling back cleanly to VIIRS daily overview entries on partial/unavailable responses.
 */
export async function searchHls({
  box,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  signal,
  now = Date.now(),
} = {}) {
  const check = validateBox(box);
  if (!check.ok) throw new TypeError(check.message || 'Invalid imagery box');
  const endMs = now;
  const startMs = endMs - SEARCH_DAYS * DAY_MS;
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();

  const errors = [];
  const grouped = new Map();
  let truncated = false;

  if (typeof fetchImpl === 'function') {
    try {
      const response = await fetchImpl(CMR_STAC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collections: [PRODUCTS.S30.collection, PRODUCTS.L30.collection],
          bbox: [check.box.west, check.box.south, check.box.east, check.box.north],
          datetime: `${startIso}/${endIso}`,
          limit: 100,
        }),
        signal,
      });
      if (!response.ok) {
        errors.push({ product: 'HLS', message: `CMR STAC HTTP ${response.status}` });
      } else {
        const payload = await response.json();
        const features = Array.isArray(payload?.features) ? payload.features : [];
        if (features.length >= 100 || payload?.context?.matched > features.length) {
          truncated = true;
        }
        for (const feature of features) {
          const props = feature?.properties || {};
          const collection = String(feature?.collection || props.collection || '');
          const product = collection.includes('S30')
            ? 'S30'
            : collection.includes('L30')
              ? 'L30'
              : null;
          if (!product) continue;
          const dt = props.datetime || props.start_datetime || '';
          const day = dt ? String(dt).slice(0, 10) : '';
          if (!day) continue;
          const key = candidateKey(product, day);
          const cloud = Number(props['eo:cloud_cover']);
          let entry = grouped.get(key);
          if (!entry) {
            entry = {
              key,
              product,
              day,
              cloud: Number.isFinite(cloud) ? { min: cloud, max: cloud } : null,
              coverage: 'full',
              timeRange: { start: dt, end: dt },
              granules: [],
              availability: 'present',
            };
            grouped.set(key, entry);
          } else if (Number.isFinite(cloud)) {
            if (!entry.cloud) entry.cloud = { min: cloud, max: cloud };
            else {
              entry.cloud.min = Math.min(entry.cloud.min, cloud);
              entry.cloud.max = Math.max(entry.cloud.max, cloud);
            }
          }
          if (dt && (!entry.timeRange.start || dt < entry.timeRange.start))
            entry.timeRange.start = dt;
          if (dt && (!entry.timeRange.end || dt > entry.timeRange.end))
            entry.timeRange.end = dt;
          entry.granules.push({
            id: feature.id || key,
            product,
            timeStart: dt,
            cloud: Number.isFinite(cloud) ? cloud : null,
          });
        }
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      errors.push({ product: 'HLS', message: error?.message || 'HLS search failed' });
    }
  }

  const candidates = [
    ...grouped.values(),
    ...buildViirsCandidates({ now }),
  ].sort((a, b) => String(b.day).localeCompare(String(a.day)));

  return {
    candidates,
    truncated,
    errors,
  };
}
