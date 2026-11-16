import * as satellite from 'satellite.js';

export function lookAnglesAt(satrec, atMs, latDeg, lonDeg, heightKm = 0) {
  if (!satrec || !Number.isFinite(atMs)) return null;
  try {
    const date = new Date(atMs);
    const propagated = satellite.propagate(satrec, date);
    if (!propagated?.position || typeof propagated.position === 'boolean') {
      return null;
    }
    const gmst = satellite.gstime(date);
    const observerGd = {
      longitude: satellite.degreesToRadians(lonDeg),
      latitude: satellite.degreesToRadians(latDeg),
      height: heightKm,
    };
    const ecf = satellite.eciToEcf(propagated.position, gmst);
    const look = satellite.ecfToLookAngles(observerGd, ecf);
    return {
      azDeg: ((satellite.radiansToDegrees(look.azimuth) % 360) + 360) % 360,
      elevDeg: satellite.radiansToDegrees(look.elevation),
      rangeKm: look.rangeSat,
    };
  } catch {
    return null;
  }
}

export function findNextSatellitePass({
  satrec,
  latDeg,
  lonDeg,
  fromMs = Date.now(),
  minElevDeg = 10,
  horizonHours = 24,
} = {}) {
  if (!satrec) return null;
  const endMs = fromMs + Math.max(1, horizonHours) * 3_600_000;
  const stepMs = 30_000;
  let inPass = false;
  let riseMs = null;
  let riseAzDeg = 0;
  let maxElevDeg = -90;
  let maxElevMs = fromMs;

  for (let t = fromMs; t <= endMs; t += stepMs) {
    const look = lookAnglesAt(satrec, t, latDeg, lonDeg);
    if (!look) continue;
    if (look.elevDeg >= minElevDeg) {
      if (!inPass) {
        inPass = true;
        riseMs = t;
        riseAzDeg = look.azDeg;
        maxElevDeg = look.elevDeg;
        maxElevMs = t;
      } else if (look.elevDeg > maxElevDeg) {
        maxElevDeg = look.elevDeg;
        maxElevMs = t;
      }
    } else if (inPass) {
      return {
        riseMs,
        maxElevMs,
        setMs: t,
        maxElevDeg,
        riseAzDeg,
        visible: false,
      };
    }
  }
  if (inPass) {
    return {
      riseMs,
      maxElevMs,
      setMs: endMs,
      maxElevDeg,
      riseAzDeg,
      visible: false,
    };
  }
  return null;
}
