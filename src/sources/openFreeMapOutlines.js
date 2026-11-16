export const OUTLINE_TILE_ZOOM = 14;
export const STREET_RADIUS_M = 250;
export const BUILDING_MAX_DISTANCE_M = 120;
export const GROUNDS_WORDS_RE =
  /\b(?:grounds|campus|complex|estate|premises|courtyard)\b/gi;

export function boxAround(lat, lon, radiusM) {
  const dLat = radiusM / 111_320;
  const cosLat = Math.max(0.15, Math.cos((lat * Math.PI) / 180));
  const dLon = radiusM / (111_320 * cosLat);
  return {
    west: Math.max(-180, lon - dLon),
    south: Math.max(-90, lat - dLat),
    east: Math.min(180, lon + dLon),
    north: Math.min(90, lat + dLat),
  };
}

export function groundsClassesFor(target = '') {
  const lower = String(target || '').toLowerCase();
  const classes = new Set(['park', 'campus', 'school', 'university', 'hospital']);
  if (/school|academy|college|university/.test(lower)) {
    classes.add('school');
    classes.add('university');
  }
  if (/hospital|medical/.test(lower)) classes.add('hospital');
  if (/park|garden|cemetery/.test(lower)) classes.add('park');
  return [...classes];
}

export function createOpenFreeMapOutlineSource() {
  return {
    async fetchBounds() {
      return { tiles: [], partial: false, loadedTiles: [] };
    },
  };
}

export function streetFromTiles() {
  return null;
}

export function buildingFromTiles() {
  return null;
}

export function enclosingAreaFromTiles() {
  return null;
}
