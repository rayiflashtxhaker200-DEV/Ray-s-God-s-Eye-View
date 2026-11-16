/**
 * Domain model helpers for NASA GIBS / HLS / VIIRS recent satellite imagery.
 */

const EARTH_RADIUS_KM = 6371.0088;
const MAX_SIDE_KM = 1000;
const MAX_LATITUDE = 85;

export const PRODUCTS = Object.freeze({
  S30: Object.freeze({
    id: 'S30',
    collection: 'HLSS30.v2.0',
    layer: 'HLS_S30_Nadir_BRDF_Adjusted_Reflectance',
    name: 'Sentinel-2',
    resolutionM: 30,
    overview: false,
  }),
  L30: Object.freeze({
    id: 'L30',
    collection: 'HLSL30.v2.0',
    layer: 'HLS_L30_Nadir_BRDF_Adjusted_Reflectance',
    name: 'Landsat 8/9',
    resolutionM: 30,
    overview: false,
  }),
  VIIRS: Object.freeze({
    id: 'VIIRS',
    collection: 'VIIRS_SNPP',
    layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    name: 'VIIRS',
    resolutionM: 250,
    overview: true,
  }),
});

/** Extract `HH:MM` UTC from an ISO timestamp string. */
export function hhmm(iso) {
  if (typeof iso !== 'string' || !iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** Build a NASA Worldview Snapshot URL for a box and UTC day. */
export function wvsSnapshotUrl({
  product,
  day,
  box,
  width = 512,
  height = 512,
} = {}) {
  const layer = PRODUCTS[product]?.layer || product || PRODUCTS.VIIRS.layer;
  const w = Number(box?.west);
  const s = Number(box?.south);
  const e = Number(box?.east);
  const n = Number(box?.north);
  const params = new URLSearchParams({
    REQUEST: 'GetSnapshot',
    LAYERS: layer,
    CRS: 'EPSG:4326',
    TIME: String(day || ''),
    BBOX: `${s},${w},${n},${e}`,
    FORMAT: 'image/png',
    WIDTH: String(Math.max(1, Math.round(Number(width) || 512))),
    HEIGHT: String(Math.max(1, Math.round(Number(height) || 512))),
  });
  return `https://wvs.earthdata.nasa.gov/api/v1/snapshot?${params.toString()}`;
}

/** Approximate box width and height in kilometres. */
export function boxDimensionsKm(box) {
  if (!box) return { width: 0, height: 0 };
  const midLatRad = (((Number(box.south) || 0) + (Number(box.north) || 0)) / 2) * (Math.PI / 180);
  const height = Math.abs((Number(box.north) - Number(box.south)) * (Math.PI / 180) * EARTH_RADIUS_KM);
  const width =
    Math.abs((Number(box.east) - Number(box.west)) * (Math.PI / 180) * EARTH_RADIUS_KM) *
    Math.max(0.01, Math.cos(midLatRad));
  return { width, height };
}

/** Validate a geographic bounding box for recent imagery queries. */
export function validateBox(box) {
  if (!box || typeof box !== 'object')
    return { ok: false, reason: 'degenerate', message: 'Select a valid box' };
  const west = Number(box.west);
  const south = Number(box.south);
  const east = Number(box.east);
  const north = Number(box.north);
  if (
    !Number.isFinite(west) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(north)
  ) {
    return { ok: false, reason: 'degenerate', message: 'Box coordinates must be finite' };
  }
  if (west > east) {
    return {
      ok: false,
      reason: 'antimeridian',
      message: 'The area must not cross the antimeridian',
    };
  }
  if (Math.abs(south) > MAX_LATITUDE || Math.abs(north) > MAX_LATITUDE) {
    return {
      ok: false,
      reason: 'polar',
      message: `Imagery stops at ±${MAX_LATITUDE.toFixed(2)}° latitude`,
    };
  }
  if (east - west < 0.0005 || north - south < 0.0005) {
    return { ok: false, reason: 'degenerate', message: 'Box is too small' };
  }
  const size = boxDimensionsKm({ west, south, east, north });
  const maxSpan = Math.max(size.width, size.height);
  if (maxSpan > MAX_SIDE_KM) {
    const rounded = Math.round(maxSpan).toLocaleString('en-US');
    return {
      ok: false,
      reason: 'too-large',
      message: `Box is ${rounded} km wide · limit ${MAX_SIDE_KM.toLocaleString('en-US')} km`,
    };
  }
  return {
    ok: true,
    box: { west, south, east, north },
    sizeKm: size,
  };
}

/** Pick the best recent candidate (clear 30m -> cloudy 30m -> partial 30m -> VIIRS overview). */
export function rankLatest(
  candidates = [],
  { maxCloud = null, truncated = false } = {},
) {
  const usable = (candidates || []).filter((c) => {
    if (!c || c.availability === 'empty' || c.thumbnail?.status === 'empty')
      return false;
    if (
      maxCloud != null &&
      !PRODUCTS[c.product]?.overview &&
      c.cloud &&
      Number.isFinite(c.cloud.max) &&
      c.cloud.max > maxCloud
    ) {
      return false;
    }
    return true;
  });

  const sorted = [...usable].sort((a, b) => {
    const dayCmp = String(b.day || '').localeCompare(String(a.day || ''));
    if (dayCmp !== 0) return dayCmp;
    const aOverview = Boolean(PRODUCTS[a.product]?.overview);
    const bOverview = Boolean(PRODUCTS[b.product]?.overview);
    if (aOverview !== bOverview) return aOverview ? 1 : -1;
    const aCloud = Number.isFinite(a.cloud?.max) ? a.cloud.max : 100;
    const bCloud = Number.isFinite(b.cloud?.max) ? b.cloud.max : 100;
    return aCloud - bCloud;
  });

  const fine = sorted.filter((c) => !PRODUCTS[c.product]?.overview);
  const fullFine = fine.filter((c) => c.coverage !== 'partial');
  const clearFull = fullFine.find(
    (c) => c.cloud && Number.isFinite(c.cloud.max) && c.cloud.max <= 20,
  );
  if (clearFull)
    return { candidate: clearFull, reason: 'clear', truncated: Boolean(truncated) };
  if (fullFine.length)
    return { candidate: fullFine[0], reason: 'cloudy', truncated: Boolean(truncated) };
  if (fine.length)
    return { candidate: fine[0], reason: 'partial', truncated: Boolean(truncated) };
  const overview = sorted[0] || null;
  if (overview)
    return { candidate: overview, reason: 'overview', truncated: Boolean(truncated) };
  return { candidate: null, reason: null, truncated: Boolean(truncated) };
}
