function extractPolygons(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

export function normalizeDroneAirspaceSnapshot(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  const rows = [];
  for (let i = 0; i < features.length; i += 1) {
    const feature = features[i];
    const props = feature?.properties || {};
    const polygons = extractPolygons(feature?.geometry);
    if (!polygons.length) continue;
    const rawId = props.OBJECTID ?? props.id ?? i + 1;
    const stableId = String(rawId);
    rows.push({
      stableId,
      id: stableId,
      name: typeof props.NAME === 'string' && props.NAME.trim() ? props.NAME.trim() : `SUA ${stableId}`,
      typeCode: typeof props.TYPE_CODE === 'string' ? props.TYPE_CODE.trim() : '',
      upperVal: props.UPPER_VAL ?? null,
      upperUom: props.UPPER_UOM ?? null,
      upperCode: props.UPPER_CODE ?? props.UPPER_DESC ?? null,
      lowerVal: props.LOWER_VAL ?? null,
      lowerUom: props.LOWER_UOM ?? null,
      lowerCode: props.LOWER_CODE ?? null,
      timesOfUse: props.TIMESOFUSE ?? null,
      contAgent: props.CONT_AGENT ?? null,
      city: props.CITY ?? null,
      state: props.STATE ?? null,
      polygons,
    });
  }
  return rows;
}
