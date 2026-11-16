import { readAdsbVerticalRateFpm } from './adsbFields.js';

export const LOCAL_ADSB_POSITION_MARGIN_M = 5_000;
export const LOCAL_ADSB_REANCHOR_AFTER = 3;
export const LOCAL_ADSB_REFERENCE_MAX_AGE_MS = 10 * 60_000;

const KT_TO_MPS = 1_852 / 3_600;
const EARTH_RADIUS_M = 6_371_000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function localAdsbSpeedLimitKt({ groundSpeedKt, category } = {}) {
  if (Number.isFinite(groundSpeedKt) && groundSpeedKt >= 0) {
    return Math.max(groundSpeedKt * 1.5, 120);
  }
  if (category === 'A7') return 300;
  return 700;
}

export function localAdsbFixIsPlausible(prev, next, options = {}) {
  if (
    !prev ||
    !next ||
    !Number.isFinite(prev.lat) ||
    !Number.isFinite(prev.lon) ||
    !Number.isFinite(next.lat) ||
    !Number.isFinite(next.lon) ||
    !Number.isFinite(prev.at) ||
    !Number.isFinite(next.at)
  ) {
    return false;
  }
  const dtSeconds = Math.max(0, (next.at - prev.at) / 1_000);
  const limitKt = localAdsbSpeedLimitKt(options);
  const maxMeters =
    LOCAL_ADSB_POSITION_MARGIN_M + (dtSeconds + 1) * limitKt * KT_TO_MPS;
  return distanceMeters(prev.lat, prev.lon, next.lat, next.lon) <= maxMeters;
}

export function recordFromDecoderTrack(track) {
  if (!track?.icao) return null;
  const hasPosition =
    Number.isFinite(track.latitude) && Number.isFinite(track.longitude);
  return {
    id: track.icao,
    icao: track.icao,
    callsign: track.callsign || null,
    category: track.category || null,
    lat: hasPosition ? track.latitude : null,
    lon: hasPosition ? track.longitude : null,
    altitudeFt: track.onGround ? null : (track.altitudeFt ?? null),
    speedKt: track.speedKt ?? null,
    headingDeg: track.headingDeg ?? null,
    verticalRateFpm: track.verticalRateFpm ?? null,
    onGround: Boolean(track.onGround),
    messages: track.messages || 0,
    lastSeen: track.lastSeen || 0,
    lastPositionAt: track.lastPositionAt ?? null,
    source: 'rtl-sdr',
  };
}

export function normalizeDump1090Aircraft(
  payload,
  observedAtMs = Date.now(),
  { band = '1090' } = {},
) {
  const rows = Array.isArray(payload?.aircraft) ? payload.aircraft : [];
  const records = [];
  for (const row of rows) {
    const icao = String(row?.hex || row?.icao || '')
      .trim()
      .replace(/^~/, '')
      .toUpperCase();
    if (!icao) continue;
    const lat = Number(row?.lat);
    const lon = Number(row?.lon);
    const hasPosition = Number.isFinite(lat) && Number.isFinite(lon);
    const onGround = row?.alt_baro === 'ground';
    const altRaw = onGround ? null : Number(row?.alt_baro ?? row?.alt_geom);
    const altitudeFt = Number.isFinite(altRaw) ? altRaw : null;
    const gsRaw = Number(row?.gs);
    const speedKt = Number.isFinite(gsRaw) ? gsRaw : null;
    const trkRaw = Number(row?.track);
    const headingDeg = Number.isFinite(trkRaw) ? trkRaw : null;
    const seenS = Number(row?.seen);
    const seenPosS = Number(row?.seen_pos ?? row?.seen);
    records.push({
      id: icao,
      icao,
      callsign: String(row?.flight || row?.r || '').trim() || null,
      category: row?.category || null,
      lat: hasPosition ? lat : null,
      lon: hasPosition ? lon : null,
      altitudeFt,
      speedKt,
      headingDeg,
      verticalRateFpm: readAdsbVerticalRateFpm(row),
      onGround,
      messages: Number(row?.messages) || 0,
      lastSeen: Number.isFinite(seenS)
        ? Math.max(0, observedAtMs - seenS * 1_000)
        : observedAtMs,
      lastPositionAt:
        hasPosition && Number.isFinite(seenPosS)
          ? Math.max(0, observedAtMs - seenPosS * 1_000)
          : hasPosition
            ? observedAtMs
            : null,
      band,
      source: 'local-receiver',
    });
  }
  return records;
}

export function summarizeLocalAdsb(aircraft = []) {
  const list = Array.isArray(aircraft) ? aircraft : [];
  let positioned = 0;
  for (const entry of list) {
    if (Number.isFinite(entry?.lat) && Number.isFinite(entry?.lon)) {
      positioned += 1;
    }
  }
  return { heard: list.length, positioned };
}
