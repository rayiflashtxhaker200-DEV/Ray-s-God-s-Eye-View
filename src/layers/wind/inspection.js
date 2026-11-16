const COMPASS_16 = [
  'N', 'NNE', 'NE', 'ENE',
  'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW',
  'W', 'WNW', 'NW', 'NNW',
];

export function windFrom(u, v) {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return 'Calm';
  if (Math.hypot(u, v) < 0.3) return 'Calm';
  // Wind vector (u, v) points WITH the wind; meteorological "from" adds 180 deg.
  const deg = ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360;
  return COMPASS_16[Math.round(deg / 22.5) % 16];
}
