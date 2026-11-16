import * as Cesium from 'cesium';
import {
  SHARE_VIEW_ENTITY_KINDS,
  followOffsetFromEnu,
  followOffsetToEnu,
} from '../share/follow.js';

const KIND_BY_ID = new Map(SHARE_VIEW_ENTITY_KINDS.map((e) => [e.kind, e]));

function entityPosition(entity, julian = Cesium.JulianDate.now()) {
  return entity?.position?.getValue?.(julian) ?? null;
}

/** Read a shareable follow subject and offset from the live Cesium viewer. */
export function readShareFollowSubject({ viewer, nowMs = Date.now() } = {}) {
  const entity = viewer?.trackedEntity;
  if (!entity || !viewer?.camera) return null;
  const meta = entity.gevShareSubject || entity.properties?.gevShareSubject?.getValue?.();
  const kind = meta?.kind ?? entity.gevShareKind;
  const id = meta?.id ?? entity.gevShareId ?? entity.id;
  if (!kind || !id || !KIND_BY_ID.has(kind)) return null;

  const pos = entityPosition(entity);
  if (!pos) return null;

  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
  const inv = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
  const localCam = Cesium.Matrix4.multiplyByPoint(
    inv,
    viewer.camera.positionWC,
    new Cesium.Cartesian3(),
  );
  const offset = followOffsetFromEnu({
    east: localCam.x,
    north: localCam.y,
    up: localCam.z,
  });
  const cartographic = Cesium.Cartographic.fromCartesian(pos);
  const lastKnown = cartographic
    ? {
        lat: Cesium.Math.toDegrees(cartographic.latitude),
        lon: Cesium.Math.toDegrees(cartographic.longitude),
        alt: cartographic.height,
        observedAtMs: nowMs,
      }
    : null;

  return {
    kind,
    id: String(id),
    offset: offset ?? undefined,
    lastKnown,
  };
}

/** Position the camera at the shared ENU follow offset around an entity. */
export function applyShareFollowOffset(viewer, entity, offset) {
  if (!viewer?.camera || !entity || !offset) return false;
  const pos = entityPosition(entity);
  if (!pos) return false;

  const enu = followOffsetToEnu(offset);
  const frame = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
  const targetOffset = new Cesium.Cartesian3(enu.east, enu.north, enu.up);
  viewer.camera.lookAtTransform(frame, targetOffset);
  return true;
}
