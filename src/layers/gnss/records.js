export const GNSS_CLASSIFIER = Object.freeze({
  id: 'nic-nacp-v1',
  lowNicMax: 5,
  lowNacPMax: 7,
});

export const GNSS_WINDOW_MS = 180_000;

export function normalizeGnssAircraft(payload) {
  const list = Array.isArray(payload?.ac)
    ? payload.ac
    : Array.isArray(payload?.aircraft)
      ? payload.aircraft
      : null;
  if (!list) return null;

  const rows = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const nic = Number.isFinite(Number(item.nic)) ? Number(item.nic) : null;
    const nacP = Number.isFinite(Number(item.nac_p))
      ? Number(item.nac_p)
      : Number.isFinite(Number(item.nacP))
        ? Number(item.nacP)
        : null;
    if (nic === null && nacP === null) continue;
    const degraded =
      (nic !== null && nic <= GNSS_CLASSIFIER.lowNicMax) ||
      (nacP !== null && nacP <= GNSS_CLASSIFIER.lowNacPMax);
    rows.push({
      hex: typeof item.hex === 'string' ? item.hex.trim().toLowerCase() : null,
      lat,
      lon,
      nic,
      nacP,
      degraded,
      seen: Number.isFinite(Number(item.seen)) ? Number(item.seen) : null,
    });
  }
  return rows;
}
