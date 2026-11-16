import { searchHls as runSearchHls } from './catalog.js';
import { PRODUCTS, wvsSnapshotUrl } from './model.js';

const GIBS_MATRIX = {
  VIIRS: 'GoogleMapsCompatible_Level9',
  S30: 'GoogleMapsCompatible_Level12',
  L30: 'GoogleMapsCompatible_Level12',
};

/** Portable NASA GIBS / HLS acquisition source matching CATALOG_SOURCE_CONTRACTS['recent-imagery']. */
export function createRecentImagerySource({
  fetchImpl = globalThis.fetch?.bind(globalThis),
} = {}) {
  return {
    label: 'NASA GIBS / HLS',
    credit: 'NASA GIBS / Worldview',
    async searchHls({ box, signal } = {}) {
      return runSearchHls({ box, fetchImpl, signal });
    },
    async getThumbnail({
      product,
      day,
      box,
      width = 240,
      height = 160,
      signal,
    } = {}) {
      if (typeof fetchImpl !== 'function')
        throw new Error('Fetch implementation unavailable');
      const url = wvsSnapshotUrl({ product, day, box, width, height });
      const response = await fetchImpl(url, { signal });
      if (!response.ok) throw new Error(`Imagery HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const type = response.headers?.get?.('content-type') || 'image/png';
      return {
        contentType: type.split(';')[0].trim().toLowerCase(),
        bytes,
      };
    },
    getTileTemplate({ product, day } = {}) {
      const layer = PRODUCTS[product]?.layer || PRODUCTS.VIIRS.layer;
      const matrix = GIBS_MATRIX[product] || GIBS_MATRIX.VIIRS;
      const time = day || new Date().toISOString().slice(0, 10);
      return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${time}/${matrix}/{z}/{y}/{x}.png`;
    },
  };
}
