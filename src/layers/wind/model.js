export function windSpeed(u, v) {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return 0;
  return Math.hypot(u, v);
}

export function sampleWind(grid, lon, lat) {
  const { nx, ny, lo1 = 0, la1 = 90, dx = 1, dy = 1, u, v } = grid || {};
  if (!nx || !ny || !u || !v) return { u: 0, v: 0 };

  const wrappedLon = (((lon - lo1) % 360) + 360) % 360;
  const fi = wrappedLon / dx;
  const fj = Math.max(0, Math.min(ny - 1, (la1 - lat) / dy));

  const i0 = Math.floor(fi) % nx;
  const i1 = (i0 + 1) % nx;
  const j0 = Math.min(ny - 1, Math.floor(fj));
  const j1 = Math.min(ny - 1, j0 + 1);

  const tx = fi - Math.floor(fi);
  const ty = fj - j0;

  const idx00 = j0 * nx + i0;
  const idx10 = j0 * nx + i1;
  const idx01 = j1 * nx + i0;
  const idx11 = j1 * nx + i1;

  const interp = (arr) =>
    (1 - tx) * (1 - ty) * (arr[idx00] || 0) +
    tx * (1 - ty) * (arr[idx10] || 0) +
    (1 - tx) * ty * (arr[idx01] || 0) +
    tx * ty * (arr[idx11] || 0);

  return {
    u: interp(u),
    v: interp(v),
  };
}
