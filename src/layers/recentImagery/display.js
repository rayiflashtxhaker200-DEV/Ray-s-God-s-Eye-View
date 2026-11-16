/** Formatting helpers for Recent Imagery panel UI readouts. */

export const READOUT_WORDS = Object.freeze({
  clear: 'clear',
  cloudy: 'cloudy',
  partial: 'partial',
  overview: 'overview',
});

/** Format a `YYYY-MM-DD` day string cleanly for display. */
export function displayDay(day) {
  if (!day || typeof day !== 'string') return '';
  return day.slice(0, 10);
}

/** Format sensor resolution in metres (`30 m`, `250 m`). */
export function displayMetres(metres) {
  const n = Number(metres);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${Math.round(n)} m`;
}
