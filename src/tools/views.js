import { createView, viewUrl } from '../view/index.js';

export function cameraForArea(area = {}) {
  if (
    Number.isFinite(area.west) &&
    Number.isFinite(area.south) &&
    Number.isFinite(area.east) &&
    Number.isFinite(area.north)
  ) {
    const lat = (area.south + area.north) / 2;
    const lon = (area.west + area.east) / 2;
    const latSpanM = Math.abs(area.north - area.south) * 111_320;
    const lonSpanM =
      Math.abs(area.east - area.west) *
      111_320 *
      Math.max(0.15, Math.cos((lat * Math.PI) / 180));
    const spanM = Math.max(latSpanM, lonSpanM, 400);
    return {
      lat,
      lon,
      altitude_m: Math.min(20_000_000, Math.max(600, Math.round(spanM * 1.6))),
      heading_deg: 0,
      pitch_deg: -90,
    };
  }
  if (area.center && Number.isFinite(area.center.lat) && Number.isFinite(area.center.lon)) {
    const radiusKm = Number.isFinite(area.center.radiusKm) ? area.center.radiusKm : 5;
    return {
      lat: area.center.lat,
      lon: area.center.lon,
      altitude_m: Math.min(20_000_000, Math.max(600, Math.round(radiusKm * 3_000))),
      heading_deg: 0,
      pitch_deg: -90,
    };
  }
  return { lat: 0, lon: 0, altitude_m: 15_000_000, heading_deg: 0, pitch_deg: -90 };
}

export function cameraLookingAt(
  target = {},
  { altitudeM, headingDeg = 0, pitchDeg = -90 } = {},
) {
  return {
    lat: Number(target.lat) || 0,
    lon: Number(target.lon) || 0,
    altitude_m: Number.isFinite(altitudeM)
      ? altitudeM
      : Number.isFinite(target.altitude_m)
        ? target.altitude_m
        : 1_500,
    heading_deg: Number.isFinite(headingDeg) ? headingDeg : 0,
    pitch_deg: Number.isFinite(pitchDeg) ? pitchDeg : -90,
  };
}

export function suggestView(
  services,
  {
    area = null,
    point = null,
    altitudeM = null,
    headingDeg = 0,
    pitchDeg = -90,
    layers = [],
    style = null,
    map = null,
    follow = null,
    annotations = [],
  } = {},
) {
  let camera;
  if (area) {
    camera = cameraLookingAt(cameraForArea(area), {
      altitudeM: altitudeM ?? undefined,
      headingDeg,
      pitchDeg,
    });
  } else if (point) {
    camera = cameraLookingAt(point, {
      altitudeM: altitudeM ?? 20_000,
      headingDeg,
      pitchDeg,
    });
  } else {
    camera = { lat: 0, lon: 0, altitude_m: altitudeM ?? 20_000, heading_deg: headingDeg, pitch_deg: pitchDeg };
  }
  const view = createView({ camera, layers, style, map, follow, annotations });
  const baseUrl = services?.app?.baseUrl;
  if (typeof baseUrl === 'string' && baseUrl) {
    try {
      return { ...view, url: viewUrl(baseUrl, view) };
    } catch {
      /* ignore invalid baseUrl */
    }
  }
  return view;
}
