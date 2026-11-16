export function normalizeHeading(degrees) {
  const value = Number(degrees);
  if (!Number.isFinite(value)) return 0;
  const wrapped = ((value % 360) + 360) % 360;
  return wrapped === 360 ? 0 : wrapped;
}

export function roundHeadingDegrees(degrees) {
  const rounded = Math.round(normalizeHeading(degrees));
  return rounded === 360 ? 0 : rounded;
}
