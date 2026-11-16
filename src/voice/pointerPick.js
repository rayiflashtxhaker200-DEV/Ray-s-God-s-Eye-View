import * as Cesium from 'cesium';

/**
 * Resolve screen coordinates on the Cesium canvas into globe coordinates and/or entity metadata.
 */
export function createPointerPicker({ viewer, dataManager } = {}) {
  void dataManager;
  return function pickPointer(x, y) {
    const scene = viewer?.scene;
    if (!scene || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const position = new Cesium.Cartesian2(x, y);
    let entity = null;
    try {
      const picked = scene.pick?.(position);
      const id = picked?.id;
      if (id && typeof id === 'object') {
        const layerId = id.properties?.layerId?.getValue?.() || id.layerId || null;
        const label =
          id.name ||
          id.properties?.name?.getValue?.() ||
          id.properties?.callsign?.getValue?.() ||
          null;
        if (layerId || label) {
          entity = {
            layerId,
            id: id.id || id.entityId || label || null,
            label,
          };
        }
      }
    } catch {
      entity = null;
    }

    try {
      const ellipsoid = scene.globe?.ellipsoid || Cesium.Ellipsoid.WGS84;
      const cartesian = viewer.camera?.pickEllipsoid?.(position, ellipsoid);
      if (!cartesian) return null;
      const carto = Cesium.Cartographic.fromCartesian(cartesian, ellipsoid);
      if (!carto) return null;
      return {
        lat: Cesium.Math.toDegrees(carto.latitude),
        lon: Cesium.Math.toDegrees(carto.longitude),
        label: entity?.label || null,
        entity,
      };
    } catch {
      return null;
    }
  };
}
