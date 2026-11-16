/**
 * Pointer tracking and turn-level deixis snapshots for voice and chat ("this", "here").
 */

export const POINTER_OPEN_MIC_RECENT_MS = 4000;

export function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function cameraPoseKey(viewer) {
  const cam = viewer?.camera;
  if (!cam?.positionWC) return null;
  const p = cam.positionWC;
  const x = Math.round(Number(p.x) || 0);
  const y = Math.round(Number(p.y) || 0);
  const z = Math.round(Number(p.z) || 0);
  const h = Number(cam.heading || 0).toFixed(2);
  const pitch = Number(cam.pitch || 0).toFixed(2);
  return `${x},${y},${z}:${h}:${pitch}`;
}

export function buildPointerSnapshot(
  pickResult,
  {
    at = Date.now(),
    now = Date.now(),
    recentMs = POINTER_OPEN_MIC_RECENT_MS,
    cameraKey = null,
    held = false,
  } = {},
) {
  if (!pickResult) return null;
  const lat = finiteOrNull(pickResult.lat);
  const lon = finiteOrNull(pickResult.lon);
  if (lat === null || lon === null) return null;
  const age = Math.max(0, now - at);
  const fresh = Boolean(held || age <= recentMs);
  return {
    fresh,
    held: Boolean(held),
    at,
    lat,
    lon,
    label: pickResult.label || pickResult.entity?.label || null,
    entity: pickResult.entity || null,
    radiusKm: finiteOrNull(pickResult.radiusKm),
    cameraKey: cameraKey || pickResult.cameraKey || null,
  };
}

export function pointerTurnEvent(snapshot, gesture = false) {
  const visible = Boolean(gesture && snapshot?.fresh);
  const announced = visible ? snapshot : null;
  const label =
    snapshot?.entity?.label ||
    snapshot?.label ||
    (snapshot?.fresh
      ? `${snapshot.lat.toFixed(4)}, ${snapshot.lon.toFixed(4)}`
      : '');
  return {
    announced,
    pointer: {
      visible,
      kind: snapshot?.entity ? 'entity' : 'place',
      text: visible ? label : '',
    },
  };
}

export function pointerTurnContext(
  snapshot,
  { at = 'turn', gesture = false, sentKey = null } = {},
) {
  if (!snapshot?.fresh) return null;
  const lat = snapshot.lat.toFixed(5);
  const lon = snapshot.lon.toFixed(5);
  const entityKey = snapshot.entity
    ? `${snapshot.entity.layerId || ''}:${snapshot.entity.id || ''}`
    : '';
  const key = `${lat},${lon}|${entityKey}|${snapshot.cameraKey || ''}`;
  if (sentKey && sentKey === key) return null;
  return {
    key,
    item: {
      type: 'pointer_context',
      at,
      gesture: Boolean(gesture),
      lat: snapshot.lat,
      lon: snapshot.lon,
      ...(snapshot.entity ? { entity: snapshot.entity } : {}),
      ...(snapshot.label ? { label: snapshot.label } : {}),
    },
  };
}

export function pointerAnnouncement(snapshot, previous = null) {
  if (!snapshot?.fresh) return null;
  if (
    previous &&
    previous.lat === snapshot.lat &&
    previous.lon === snapshot.lon &&
    previous.entity?.id === snapshot.entity?.id
  ) {
    return null;
  }
  const label =
    snapshot.entity?.label ||
    snapshot.label ||
    `${snapshot.lat.toFixed(4)}, ${snapshot.lon.toFixed(4)}`;
  return {
    visible: true,
    kind: snapshot.entity ? 'entity' : 'place',
    text: label,
  };
}

export function createPointerTracker({
  element = null,
  cameraKey = () => null,
  pick = () => null,
  now = () => Date.now(),
} = {}) {
  let latest = null;
  let latestAt = 0;
  let heldSnapshot = null;
  let active = null;
  const listeners = [];

  const updateFromEvent = (event) => {
    if (!element || typeof pick !== 'function') return;
    const rect = element.getBoundingClientRect?.();
    if (!rect) return;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
    const result = pick(x, y, { rect });
    if (result) {
      latest = { ...result, cameraKey: cameraKey?.() || null };
      latestAt = now();
    }
  };

  const onLeave = () => {
    latest = null;
    latestAt = 0;
  };

  if (element?.addEventListener) {
    const move = (e) => updateFromEvent(e);
    element.addEventListener('pointermove', move, { passive: true });
    element.addEventListener('pointerdown', move, { passive: true });
    element.addEventListener('pointerleave', onLeave, { passive: true });
    listeners.push(
      ['pointermove', move],
      ['pointerdown', move],
      ['pointerleave', onLeave],
    );
  }

  return {
    hold(at = 'keydown') {
      void at;
      heldSnapshot = buildPointerSnapshot(latest, {
        at: latestAt,
        now: now(),
        cameraKey: cameraKey?.() || null,
        held: true,
      });
      active = heldSnapshot;
      return heldSnapshot;
    },
    releaseHold() {
      heldSnapshot = null;
    },
    isHeld() {
      return Boolean(heldSnapshot);
    },
    beginTurn(at = 'turn', { capturedSnapshot, recentMs = POINTER_OPEN_MIC_RECENT_MS } = {}) {
      void at;
      if (capturedSnapshot !== undefined) {
        active = capturedSnapshot;
        return active;
      }
      if (heldSnapshot) {
        active = heldSnapshot;
        return active;
      }
      active = buildPointerSnapshot(latest, {
        at: latestAt,
        now: now(),
        recentMs,
        cameraKey: cameraKey?.() || null,
      });
      return active;
    },
    activeSnapshot() {
      return active;
    },
    clear({ keepHold = false } = {}) {
      active = null;
      if (!keepHold) heldSnapshot = null;
    },
    destroy() {
      for (const [type, fn] of listeners.splice(0)) {
        element?.removeEventListener?.(type, fn);
      }
      latest = null;
      heldSnapshot = null;
      active = null;
    },
  };
}
