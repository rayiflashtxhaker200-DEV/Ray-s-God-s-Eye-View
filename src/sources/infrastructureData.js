const DATASETS = Object.freeze({
  'local-datacenters': new URL(
    '../data/local_data/datacenters/datacenters.geojsonl',
    import.meta.url,
  ).href,
  'local-dams': new URL(
    '../data/local_data/dams/dams.geojsonl',
    import.meta.url,
  ).href,
});

function parseGeoJsonLines(text, layerId) {
  const rows = [];
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const feature = JSON.parse(line);
      const coords = feature?.geometry?.coordinates;
      const lon = Number(coords?.[0]);
      const lat = Number(coords?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const props = feature?.properties || {};
      rows.push({
        id: feature.id ?? props.id ?? null,
        layerId,
        name: props.name || props['name:en'] || null,
        operator: props.operator || null,
        capacity: props.capacity || null,
        river: props.river || props.waterway || null,
        output: props.output || props['plant:output:electricity'] || null,
        lat,
        lon,
      });
    } catch {
      /* skip malformed line */
    }
  }
  return rows;
}

export function createInfrastructureSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  const cache = new Map();
  return {
    async getRecords(layerId, { signal } = {}) {
      const url = DATASETS[layerId];
      if (!url) return [];
      if (cache.has(layerId)) return cache.get(layerId);
      const response = await fetchImpl(url, { signal });
      if (!response?.ok) return [];
      const text = await response.text();
      const rows = parseGeoJsonLines(text, layerId);
      cache.set(layerId, rows);
      return rows;
    },
  };
}
