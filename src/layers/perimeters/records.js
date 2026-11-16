function extractPolygons(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeFirePerimeterSnapshot(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  const rows = [];
  for (let i = 0; i < features.length; i += 1) {
    const feature = features[i];
    const props = feature?.properties || {};
    const polygons = extractPolygons(feature?.geometry);
    if (!polygons.length) continue;
    const rawId =
      props.attr_UniqueFireIdentifier ||
      props.poly_IncidentName ||
      feature?.id ||
      `fire-${i + 1}`;
    const stableId = String(rawId);
    rows.push({
      stableId,
      id: stableId,
      name:
        (typeof props.poly_IncidentName === 'string' && props.poly_IncidentName.trim()) ||
        stableId,
      acres: finiteNumber(props.attr_IncidentSize),
      containedPct: finiteNumber(props.attr_PercentContained),
      state: props.attr_POOState ?? null,
      county: props.attr_POOCounty ?? null,
      category: props.attr_IncidentTypeCategory ?? null,
      cause: props.attr_FireCause ?? null,
      behavior: props.attr_FireBehaviorGeneral ?? null,
      personnel: finiteNumber(props.attr_TotalIncidentPersonnel),
      costToDate: finiteNumber(props.attr_EstimatedCostToDate),
      complexity: props.attr_IncidentComplexityLevel ?? null,
      discoveredTime: finiteNumber(props.attr_FireDiscoveryDateTime),
      updatedTime: finiteNumber(props.poly_DateCurrent),
      polygons,
    });
  }
  return rows;
}
