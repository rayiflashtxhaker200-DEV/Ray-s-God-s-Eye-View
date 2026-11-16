export function validTileBounds(box) {
  if (!box || typeof box !== 'object') return false;
  const { west, south, east, north } = box;
  return (
    [west, south, east, north].every(Number.isFinite) &&
    south >= -90 &&
    north <= 90 &&
    south < north &&
    west >= -180 &&
    east <= 180 &&
    west < east
  );
}

export function createVectorTileSource({
  tileJsonUrl,
  allowedOrigin,
  decode,
  fetchImpl = (...args) => globalThis.fetch(...args),
  maxTiles = 12,
} = {}) {
  let metadataPromise = null;

  async function loadMetadata(signal) {
    if (!tileJsonUrl) return null;
    metadataPromise ??= fetchImpl(tileJsonUrl, { signal }).then((res) =>
      res?.ok ? res.json() : null,
    );
    return metadataPromise;
  }

  return {
    tileJsonUrl,
    allowedOrigin,
    maxTiles,
    async fetchTiles(box, { zoom = 12, signal } = {}) {
      if (!validTileBounds(box)) return [];
      const meta = await loadMetadata(signal);
      if (!meta || !Array.isArray(meta.tiles) || !meta.tiles.length) return [];
      const records = [];
      void zoom;
      void decode;
      return records;
    },
  };
}
