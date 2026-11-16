export const OSM_PLACES_LAYER_ID = 'osm-places';

export function mapOsmFeature(feature, preset = null) {
  if (!feature || typeof feature !== 'object') return null;
  const lat = Number(feature.lat ?? feature.center?.lat);
  const lon = Number(feature.lon ?? feature.center?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const tags = feature.tags || {};
  const id = String(feature.id ?? `${lat.toFixed(6)},${lon.toFixed(6)}`);
  return {
    id,
    name: tags.name || feature.name || null,
    kind: preset?.label || preset?.id || tags.amenity || tags.shop || tags.tourism || null,
    operator: tags.operator || null,
    emergency: tags.emergency || null,
    wheelchair: tags.wheelchair || null,
    openingHours: tags.opening_hours || tags.openingHours || null,
    city: tags['addr:city'] || tags.city || null,
    lat,
    lon,
  };
}

export function dedupeOsmRecords(records) {
  const list = Array.isArray(records) ? records : [];
  const seen = new Map();
  let merged = 0;
  for (const record of list) {
    if (!record) continue;
    const key = record.id || `${record.name || ''}:${record.lat.toFixed(5)}:${record.lon.toFixed(5)}`;
    if (seen.has(key)) {
      merged += 1;
      continue;
    }
    seen.set(key, record);
  }
  return {
    records: [...seen.values()],
    merged,
  };
}
