import * as Cesium from 'cesium';
import { t } from '../i18n/index.js';

const OSM_BUILDINGS_ASSET_ID = 96188;

async function defaultCreateOsmBuildings({ token }) {
  if (!token) {
    throw new Error('Missing Cesium ion token');
  }
  if (!Cesium.Ion.defaultAccessToken) {
    Cesium.Ion.defaultAccessToken = token;
  }
  const resource = await Cesium.IonResource.fromAssetId(OSM_BUILDINGS_ASSET_ID, {
    accessToken: token,
  });
  return Cesium.Cesium3DTileset.fromUrl(resource);
}

/**
 * Coordinates 3D globe mode (SceneMode.SCENE3D vs SCENE2D) and Cesium OSM 3D Buildings
 * from the Visual Presets popover without interfering with aircraft 3D models.
 */
export function createScene3dControls({
  viewer,
  mapStackController = null,
  setMapStack = null,
  requestRender = () => viewer?.scene?.requestRender?.(),
  globeButton = null,
  buildingsButton = null,
  showToast = () => {},
  createOsmBuildings = defaultCreateOsmBuildings,
} = {}) {
  let destroyed = false;
  let globe3d = viewer?.scene?.mode !== Cesium.SceneMode.SCENE2D;
  let buildings3d = false;
  let loadingBuildings = false;
  let loadGeneration = 0;
  let buildingsTileset = null;
  let restorePhotorealAfter2d = false;

  const isPhotorealActive = () =>
    mapStackController?.getActiveId?.() === 'photoreal';

  function pickGlobeImageryFallback() {
    if (!mapStackController?.isStackAvailable) return 'esri-imagery';
    if (mapStackController.isStackAvailable('esri-imagery'))
      return 'esri-imagery';
    if (mapStackController.isStackAvailable('bing-aerial'))
      return 'bing-aerial';
    return 'osm';
  }

  function pickBuildingsImageryStack() {
    if (!mapStackController?.isStackAvailable) return 'esri-imagery';
    if (mapStackController.isStackAvailable('bing-aerial'))
      return 'bing-aerial';
    if (mapStackController.isStackAvailable('esri-imagery'))
      return 'esri-imagery';
    return 'osm';
  }

  function syncButton(btn, active, busy = false) {
    if (!btn) return;
    btn.classList?.toggle('active', Boolean(active));
    btn.classList?.toggle('is-loading', Boolean(busy));
    btn.setAttribute?.('aria-pressed', String(Boolean(active)));
    if (busy) {
      btn.setAttribute?.('aria-busy', 'true');
    } else {
      btn.removeAttribute?.('aria-busy');
    }
  }

  function syncButtons() {
    syncButton(globeButton, globe3d, false);
    syncButton(buildingsButton, buildings3d, loadingBuildings);
  }

  async function switchStack(stackId) {
    if (!stackId) return;
    if (typeof setMapStack === 'function') {
      await setMapStack(stackId, { syncShare: false });
      return;
    }
    if (typeof mapStackController?.setStack === 'function') {
      await mapStackController.setStack(stackId, { silent: false });
    }
  }

  function syncTilesetVisibility() {
    if (!buildingsTileset) return;
    buildingsTileset.show = Boolean(buildings3d && globe3d);
  }

  async function setGlobe3dEnabled(
    enabled,
    { restorePhotoreal = true, silent = false } = {},
  ) {
    if (destroyed) return getState();
    const target = Boolean(enabled);
    if (target === globe3d) {
      syncButtons();
      return getState();
    }
    globe3d = target;
    viewer?.camera?.cancelFlight?.();

    if (!target) {
      if (isPhotorealActive()) {
        restorePhotorealAfter2d = true;
        await switchStack(pickGlobeImageryFallback());
        if (destroyed || globe3d) return getState();
      }
      syncTilesetVisibility();
      viewer?.scene?.morphTo2D?.(0);
      syncButtons();
      requestRender('scene-mode-2d');
      if (!silent) showToast(t('2D flat map mode enabled'));
      return getState();
    }

    viewer?.scene?.morphTo3D?.(0);
    syncTilesetVisibility();
    if (
      restorePhotoreal &&
      restorePhotorealAfter2d &&
      !buildings3d &&
      mapStackController?.isStackAvailable?.('photoreal')
    ) {
      restorePhotorealAfter2d = false;
      await switchStack('photoreal');
    } else {
      restorePhotorealAfter2d = false;
    }
    syncButtons();
    requestRender('scene-mode-3d');
    if (!silent) showToast(t('3D globe mode enabled'));
    return getState();
  }

  async function setBuildings3dEnabled(enabled, { silent = false } = {}) {
    if (destroyed) return getState();
    const target = Boolean(enabled);

    if (!target) {
      loadGeneration++;
      buildings3d = false;
      loadingBuildings = false;
      syncTilesetVisibility();
      syncButtons();
      requestRender('buildings-3d-off');
      if (!silent) showToast(t('3D buildings disabled'));
      return getState();
    }

    if (buildings3d && buildingsTileset && !loadingBuildings) {
      if (!globe3d) {
        await setGlobe3dEnabled(true, { restorePhotoreal: false, silent: true });
      }
      syncTilesetVisibility();
      syncButtons();
      requestRender('buildings-3d-on');
      return getState();
    }

    const gen = ++loadGeneration;
    buildings3d = true;
    loadingBuildings = !buildingsTileset;
    syncButtons();

    if (!globe3d) {
      await setGlobe3dEnabled(true, { restorePhotoreal: false, silent: true });
      if (destroyed || gen !== loadGeneration || !buildings3d) {
        return getState();
      }
    }

    if (isPhotorealActive()) {
      restorePhotorealAfter2d = false;
      await switchStack(pickBuildingsImageryStack());
      if (destroyed || gen !== loadGeneration || !buildings3d) {
        return getState();
      }
    }

    if (buildingsTileset) {
      loadingBuildings = false;
      syncTilesetVisibility();
      syncButtons();
      requestRender('buildings-3d-on');
      if (!silent) showToast(t('3D buildings enabled'));
      return getState();
    }

    const token = String(
      mapStackController?.cesiumToken || Cesium.Ion.defaultAccessToken || '',
    ).trim();

    if (!silent) showToast(t('Loading 3D buildings…'));

    try {
      const tileset = await createOsmBuildings({ token });
      if (destroyed || gen !== loadGeneration || !buildings3d) {
        if (tileset && !tileset.isDestroyed?.()) {
          tileset.destroy?.();
        }
        return getState();
      }
      buildingsTileset = tileset;
      viewer?.scene?.primitives?.add?.(tileset);
      loadingBuildings = false;
      syncTilesetVisibility();
      syncButtons();
      requestRender('buildings-3d-on');
      if (!silent) showToast(t('3D buildings enabled'));
    } catch {
      if (destroyed || gen !== loadGeneration) return getState();
      buildings3d = false;
      loadingBuildings = false;
      syncButtons();
      if (!silent) {
        showToast(
          token
            ? t('Could not load 3D buildings')
            : t('3D buildings unavailable without a Cesium ion token'),
        );
      }
    }
    return getState();
  }

  function toggleGlobe3d() {
    return setGlobe3dEnabled(!globe3d);
  }

  function toggleBuildings3d() {
    return setBuildings3dEnabled(!buildings3d);
  }

  function getState() {
    return {
      globe3d,
      buildings3d,
      loadingBuildings,
    };
  }

  const removeMorphListener = viewer?.scene?.morphComplete?.addEventListener?.(
    () => {
      if (destroyed) return;
      globe3d = viewer?.scene?.mode !== Cesium.SceneMode.SCENE2D;
      syncTilesetVisibility();
      syncButtons();
    },
  );

  const unsubscribeStack = mapStackController?.subscribe?.((state) => {
    if (destroyed || !state) return;
    if (state.activeId === 'photoreal') {
      if (!globe3d) {
        void setGlobe3dEnabled(true, {
          restorePhotoreal: false,
          silent: true,
        });
      }
      if (buildings3d) {
        loadGeneration++;
        buildings3d = false;
        loadingBuildings = false;
        syncTilesetVisibility();
        syncButtons();
      }
    }
  });

  syncButtons();

  return {
    getState,
    setGlobe3dEnabled,
    setBuildings3dEnabled,
    toggleGlobe3d,
    toggleBuildings3d,
    syncButtons,
    dispose() {
      if (destroyed) return;
      destroyed = true;
      loadGeneration++;
      if (typeof removeMorphListener === 'function') {
        removeMorphListener();
      }
      if (typeof unsubscribeStack === 'function') {
        unsubscribeStack();
      }
      if (buildingsTileset) {
        try {
          viewer?.scene?.primitives?.remove?.(buildingsTileset);
        } catch {
          /* primitive already removed */
        }
        try {
          if (!buildingsTileset.isDestroyed?.()) {
            buildingsTileset.destroy?.();
          }
        } catch {
          /* tileset already destroyed */
        }
        buildingsTileset = null;
      }
    },
  };
}
