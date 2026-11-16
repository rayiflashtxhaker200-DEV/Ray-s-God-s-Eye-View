export function readAdsbVerticalRateFpm(aircraft) {
  if (!aircraft || typeof aircraft !== 'object') return null;
  for (const field of ['baro_rate', 'geom_rate', 'vert_rate']) {
    const raw = aircraft[field];
    if (raw === null || raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return null;
}
