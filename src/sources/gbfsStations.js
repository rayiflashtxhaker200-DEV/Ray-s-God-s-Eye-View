export function parseStationInformation(payload) {
  const map = new Map();
  const stations = Array.isArray(payload?.data?.stations)
    ? payload.data.stations
    : Array.isArray(payload?.stations)
      ? payload.stations
      : [];
  for (const s of stations) {
    const stationId = s?.station_id != null ? String(s.station_id) : '';
    const lat = Number(s?.lat);
    const lon = Number(s?.lon);
    if (!stationId || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    map.set(stationId, {
      stationId,
      name: s.name || stationId,
      lat,
      lon,
      capacity: Number.isFinite(Number(s.capacity)) ? Number(s.capacity) : null,
      address: s.address || null,
    });
  }
  return map;
}

export function parseStationStatus(payload) {
  const map = new Map();
  const stations = Array.isArray(payload?.data?.stations)
    ? payload.data.stations
    : Array.isArray(payload?.stations)
      ? payload.stations
      : [];
  const lastUpdated = Number(payload?.last_updated);
  for (const s of stations) {
    const stationId = s?.station_id != null ? String(s.station_id) : '';
    if (!stationId) continue;
    const reported = Number(s.last_reported);
    const updatedS = Number.isFinite(reported)
      ? reported
      : Number.isFinite(lastUpdated)
        ? lastUpdated
        : null;
    map.set(stationId, {
      stationId,
      numBikesAvailable: Number(s.num_bikes_available) || 0,
      numDocksAvailable: Number(s.num_docks_available) || 0,
      isInstalled: s.is_installed !== 0 && s.is_installed !== false,
      isRenting: s.is_renting !== 0 && s.is_renting !== false,
      isReturning: s.is_returning !== 0 && s.is_returning !== false,
      lastReportedMs: updatedS != null ? updatedS * 1000 : null,
    });
  }
  return map;
}
