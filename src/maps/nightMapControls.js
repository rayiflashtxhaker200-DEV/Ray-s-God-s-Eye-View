import * as Cesium from 'cesium';
import { t } from '../i18n/index.js';
import {
  NIGHT_COLOR_FILTER_SHADER,
  createNightTilesetCustomShader,
} from '../styles/nightMap.js';
import {
  computeCycleAtmosphereState,
  computeWorldLightDirection,
} from '../sky/skyAtmosphereSetup.js';
import { getOptimalPerformanceProfile } from '../hardwareProfile.js';

const CYCLE_RADIANS_PER_SECOND = (Math.PI * 2) / 28; // 28s per full 24h cycle
const INITIAL_CYCLE_PHASE_RAD = Math.PI * 0.85; // Start near golden sunset

function isCityTileset(primitive) {
  if (!primitive || typeof primitive !== 'object') return false;
  if (typeof primitive.isDestroyed === 'function' && primitive.isDestroyed()) {
    return false;
  }
  if (typeof Cesium.Cesium3DTileset === 'function') {
    if (primitive instanceof Cesium.Cesium3DTileset) return true;
  }
  return primitive.isCesium3DTileset === true;
}

/**
 * Coordinates the hybrid Night Map visualization, activatable tactical Color
 * Filter, and animated local Day-Night Sky Cycle:
 * - Attaches a native `Cesium.CustomShader` (`LightingModel.UNLIT`) to active
 *   3D Tilesets (Google Photorealistic 3D Tiles & OSM 3D Buildings).
 * - Configures Cesium `skyAtmosphere`, `fog`, `globe` atmosphere, `scene.light`,
 *   and `imageryLayers` brightness without mutating `viewer.clock.currentTime`
 *   (preserving real-time telemetry for flights, vessels, and satellites).
 * - Manages the independently toggleable emerald-amber `PostProcessStage` filter.
 */
export function createNightMapControls({
  viewer,
  mapStackController = null,
  requestRender = () => viewer?.scene?.requestRender?.(),
  nightMapButton = null,
  colorFilterButton = null,
  dayNightCycleButton = null,
  showToast = () => {},
  createStage = (options) => new Cesium.PostProcessStage(options),
  createTilesetShader = () => createNightTilesetCustomShader(Cesium),
  now = () =>
    typeof performance !== 'undefined' ? performance.now() : Date.now(),
  requestFrame =
    typeof requestAnimationFrame === 'function'
      ? (cb) => requestAnimationFrame(cb)
      : (cb) => setTimeout(() => cb(now()), 16),
  cancelFrame =
    typeof cancelAnimationFrame === 'function'
      ? (id) => cancelAnimationFrame(id)
      : (id) => clearTimeout(id),
} = {}) {
  let destroyed = false;
  let nightMapEnabled = false;
  let colorFilterEnabled = false;
  let dayNightCycleEnabled = false;
  let cyclePhase = INITIAL_CYCLE_PHASE_RAD;
  let currentNightWeight = 0.0;
  let currentPhaseLabel = 'DAY';

  let cycleFrameId = null;
  let lastFrameMs = null;
  let cycleDirectionLight = null;

  let colorFilterStage = null;
  let tilesetCustomShader = null;

  let sceneSnapshot = null;

  const savedTilesetShaders = new WeakMap();
  const managedTilesets = new Set();
  const savedImageryAdjustments = new WeakMap();
  const managedImageryLayers = new Set();

  function syncButton(btn, active) {
    if (!btn) return;
    btn.classList?.toggle('active', Boolean(active));
    btn.setAttribute?.('aria-pressed', String(Boolean(active)));
  }

  function syncButtons() {
    syncButton(nightMapButton, nightMapEnabled);
    syncButton(colorFilterButton, colorFilterEnabled);
    syncButton(dayNightCycleButton, dayNightCycleEnabled);
  }

  function ensureTilesetShader() {
    if (tilesetCustomShader || destroyed) return tilesetCustomShader;
    tilesetCustomShader = createTilesetShader();
    return tilesetCustomShader;
  }

  function setShaderNightIntensity(value) {
    const shader = tilesetCustomShader;
    if (!shader) return;
    if (typeof shader.setUniform === 'function') {
      shader.setUniform('u_nightIntensity', value);
    } else if (shader.uniforms?.u_nightIntensity) {
      shader.uniforms.u_nightIntensity.value = value;
    }
  }

  function applyShaderToTileset(tileset) {
    if (!isCityTileset(tileset)) return;
    const shader = ensureTilesetShader();
    if (!shader) return;

    if (!savedTilesetShaders.has(tileset)) {
      savedTilesetShaders.set(tileset, tileset.customShader ?? null);
    }
    managedTilesets.add(tileset);
    if (tileset.customShader !== shader) {
      tileset.customShader = shader;
    }
  }

  function restoreAllTilesets() {
    for (const tileset of managedTilesets) {
      if (typeof tileset.isDestroyed === 'function' && tileset.isDestroyed()) {
        continue;
      }
      if (tileset.customShader === tilesetCustomShader) {
        const previous = savedTilesetShaders.get(tileset) ?? undefined;
        tileset.customShader = previous;
      }
      savedTilesetShaders.delete(tileset);
    }
    managedTilesets.clear();
  }

  function syncTilesets(nightWeight) {
    const active = nightMapEnabled || dayNightCycleEnabled;
    if (!active) {
      setShaderNightIntensity(0.0);
      restoreAllTilesets();
      return;
    }

    const shader = ensureTilesetShader();
    if (!shader) return;

    setShaderNightIntensity(nightWeight);

    const primitives = viewer?.scene?.primitives;
    const count = primitives?.length ?? 0;
    for (let i = 0; i < count; i++) {
      const primitive =
        typeof primitives.get === 'function' ? primitives.get(i) : primitives[i];
      if (isCityTileset(primitive)) {
        applyShaderToTileset(primitive);
      }
    }

    const hostTileset = mapStackController?.getImageryHostTileset?.();
    if (isCityTileset(hostTileset)) {
      applyShaderToTileset(hostTileset);
    }
  }

  function applyNightToImageryLayer(layer, brightness) {
    if (!layer || typeof layer !== 'object') return;
    if (typeof layer.isDestroyed === 'function' && layer.isDestroyed()) return;
    if (typeof layer.brightness !== 'number') return;

    if (!savedImageryAdjustments.has(layer)) {
      savedImageryAdjustments.set(layer, {
        brightness: layer.brightness,
        contrast: layer.contrast,
        gamma: layer.gamma,
      });
    }
    managedImageryLayers.add(layer);
    layer.brightness = brightness;
    if (typeof layer.contrast === 'number') layer.contrast = 1.06;
    if (typeof layer.gamma === 'number') layer.gamma = 0.94;
  }

  function restoreAllImageryLayers() {
    for (const layer of managedImageryLayers) {
      if (typeof layer.isDestroyed === 'function' && layer.isDestroyed()) {
        continue;
      }
      const prev = savedImageryAdjustments.get(layer);
      if (prev) {
        layer.brightness = prev.brightness;
        if (typeof prev.contrast === 'number') layer.contrast = prev.contrast;
        if (typeof prev.gamma === 'number') layer.gamma = prev.gamma;
      }
      savedImageryAdjustments.delete(layer);
    }
    managedImageryLayers.clear();
  }

  function syncImageryLayers(brightness) {
    const active = nightMapEnabled || dayNightCycleEnabled;
    if (!active) {
      restoreAllImageryLayers();
      return;
    }
    const layers = viewer?.scene?.imageryLayers;
    const count = layers?.length ?? 0;
    for (let i = 0; i < count; i++) {
      const layer = typeof layers.get === 'function' ? layers.get(i) : layers[i];
      applyNightToImageryLayer(layer, brightness);
    }
  }

  function ensureColorFilterStage() {
    if (colorFilterStage || destroyed) return colorFilterStage;
    const stages = viewer?.scene?.postProcessStages;
    if (!stages || typeof stages.add !== 'function') return null;

    colorFilterStage = createStage({
      name: 'godsEyeView_nightColorFilter',
      fragmentShader: NIGHT_COLOR_FILTER_SHADER,
      uniforms: {
        colorFilterIntensity: 0.0,
      },
    });
    colorFilterStage.enabled = false;
    stages.add(colorFilterStage);
    return colorFilterStage;
  }

  function syncColorFilterStage() {
    if (!colorFilterEnabled && !colorFilterStage) return;

    const stage = ensureColorFilterStage();
    if (!stage) return;

    if (stage.uniforms) {
      stage.uniforms.colorFilterIntensity = colorFilterEnabled ? 1.0 : 0.0;
    }
    stage.enabled = colorFilterEnabled;
  }

  function captureSceneSnapshot() {
    if (sceneSnapshot) return;
    const scene = viewer?.scene;
    if (!scene) return;
    const bloom = scene.postProcessStages?.bloom;
    sceneSnapshot = {
      hadShadows: Boolean(viewer && 'shadows' in viewer),
      shadows: viewer?.shadows,
      atmosphere: scene.skyAtmosphere
        ? {
            show: scene.skyAtmosphere.show ?? true,
            brightnessShift: scene.skyAtmosphere.brightnessShift ?? 0,
            saturationShift: scene.skyAtmosphere.saturationShift ?? 0,
            hueShift: scene.skyAtmosphere.hueShift ?? 0,
            atmosphereLightIntensity:
              scene.skyAtmosphere.atmosphereLightIntensity ?? 10,
          }
        : null,
      fog: scene.fog
        ? {
            enabled: scene.fog.enabled ?? true,
            density: scene.fog.density ?? 0.0002,
            minimumBrightness: scene.fog.minimumBrightness ?? 0.03,
            color: scene.fog.color?.clone
              ? scene.fog.color.clone()
              : scene.fog.color,
          }
        : null,
      globe: scene.globe
        ? {
            enableLighting: scene.globe.enableLighting,
            dynamicAtmosphereLighting: scene.globe.dynamicAtmosphereLighting,
            dynamicAtmosphereLightingFromSun:
              scene.globe.dynamicAtmosphereLightingFromSun,
            lightingFadeOutDistance: scene.globe.lightingFadeOutDistance,
            lightingFadeInDistance: scene.globe.lightingFadeInDistance,
            nightFadeOutDistance: scene.globe.nightFadeOutDistance,
            nightFadeInDistance: scene.globe.nightFadeInDistance,
          }
        : null,
      hasLight: 'light' in scene,
      light: scene.light,
      bloomContrast:
        bloom?.uniforms && typeof bloom.uniforms.contrast === 'number'
          ? bloom.uniforms.contrast
          : null,
    };
  }

  function restoreSceneSnapshot() {
    if (!sceneSnapshot) return;
    const scene = viewer?.scene;
    if (!scene) {
      sceneSnapshot = null;
      return;
    }

    if (sceneSnapshot.hadShadows && viewer && 'shadows' in viewer) {
      viewer.shadows = sceneSnapshot.shadows;
    }
    if (scene.skyAtmosphere && sceneSnapshot.atmosphere) {
      const a = sceneSnapshot.atmosphere;
      scene.skyAtmosphere.show = a.show;
      scene.skyAtmosphere.brightnessShift = a.brightnessShift;
      scene.skyAtmosphere.saturationShift = a.saturationShift;
      if ('hueShift' in scene.skyAtmosphere) {
        scene.skyAtmosphere.hueShift = a.hueShift;
      }
      scene.skyAtmosphere.atmosphereLightIntensity = a.atmosphereLightIntensity;
    }
    if (scene.fog && sceneSnapshot.fog) {
      const f = sceneSnapshot.fog;
      scene.fog.enabled = f.enabled;
      if ('density' in scene.fog) scene.fog.density = f.density;
      if ('minimumBrightness' in scene.fog) {
        scene.fog.minimumBrightness = f.minimumBrightness;
      }
      if ('color' in scene.fog) scene.fog.color = f.color;
    }
    if (scene.globe && sceneSnapshot.globe) {
      for (const [prop, val] of Object.entries(sceneSnapshot.globe)) {
        if (val !== undefined && prop in scene.globe) {
          scene.globe[prop] = val;
        }
      }
    }
    if (sceneSnapshot.hasLight && 'light' in scene) {
      scene.light = sceneSnapshot.light;
    }
    const bloom = scene.postProcessStages?.bloom;
    if (
      bloom?.uniforms &&
      sceneSnapshot.bloomContrast !== null &&
      bloom.uniforms.contrast === 32.0
    ) {
      bloom.uniforms.contrast = sceneSnapshot.bloomContrast;
    }
    sceneSnapshot = null;
  }

  function applyStaticNightEnvironment() {
    const scene = viewer?.scene;
    if (!scene) return;
    captureSceneSnapshot();

    if (viewer && 'shadows' in viewer) viewer.shadows = false;
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.show = true;
      scene.skyAtmosphere.brightnessShift = -0.58;
      scene.skyAtmosphere.saturationShift = -0.2;
      if ('hueShift' in scene.skyAtmosphere) scene.skyAtmosphere.hueShift = 0.0;
      scene.skyAtmosphere.atmosphereLightIntensity = 6.5;
    }
    if (scene.fog) {
      scene.fog.enabled = true;
      if ('density' in scene.fog) scene.fog.density = 0.00018;
      if ('minimumBrightness' in scene.fog) scene.fog.minimumBrightness = 0.08;
      if ('color' in scene.fog && Cesium.Color?.fromCssColorString) {
        scene.fog.color = Cesium.Color.fromCssColorString('#081220');
      }
    }
    if (scene.globe) {
      if ('enableLighting' in scene.globe && sceneSnapshot?.globe) {
        scene.globe.enableLighting = sceneSnapshot.globe.enableLighting;
      }
      if ('dynamicAtmosphereLighting' in scene.globe) {
        scene.globe.dynamicAtmosphereLighting = true;
      }
      if ('dynamicAtmosphereLightingFromSun' in scene.globe) {
        scene.globe.dynamicAtmosphereLightingFromSun = false;
      }
      if ('lightingFadeOutDistance' in scene.globe) {
        scene.globe.lightingFadeOutDistance = 20000000.0;
      }
      if ('lightingFadeInDistance' in scene.globe) {
        scene.globe.lightingFadeInDistance = 10000000.0;
      }
      if ('nightFadeOutDistance' in scene.globe) {
        scene.globe.nightFadeOutDistance = 20000000.0;
      }
      if ('nightFadeInDistance' in scene.globe) {
        scene.globe.nightFadeInDistance = 10000000.0;
      }
    }
    if (sceneSnapshot?.hasLight && 'light' in scene) {
      scene.light = sceneSnapshot.light;
    }

    const bloom = scene.postProcessStages?.bloom;
    if (
      bloom?.uniforms &&
      typeof bloom.uniforms.contrast === 'number' &&
      bloom.uniforms.contrast > 36
    ) {
      bloom.uniforms.contrast = 32.0;
    }

    currentNightWeight = 1.0;
    currentPhaseLabel = 'NIGHT';
    syncTilesets(1.0);
    syncImageryLayers(0.42);
  }

  function applyCycleFrame(phaseRad) {
    const scene = viewer?.scene;
    if (!scene) return;
    captureSceneSnapshot();

    const state = computeCycleAtmosphereState(phaseRad);
    currentNightWeight = state.nightWeight;
    currentPhaseLabel = state.phaseLabel;

    if (viewer && 'shadows' in viewer) viewer.shadows = false;
    if (scene.skyAtmosphere) {
      scene.skyAtmosphere.show = true;
      scene.skyAtmosphere.brightnessShift = state.skyBrightnessShift;
      scene.skyAtmosphere.saturationShift = state.skySaturationShift;
      if ('hueShift' in scene.skyAtmosphere) {
        scene.skyAtmosphere.hueShift = state.skyHueShift;
      }
      scene.skyAtmosphere.atmosphereLightIntensity = state.skyLightIntensity;
    }
    if (scene.fog) {
      scene.fog.enabled = true;
      if ('density' in scene.fog) scene.fog.density = 0.00018;
      if ('minimumBrightness' in scene.fog) {
        scene.fog.minimumBrightness = state.fogMinimumBrightness;
      }
      if ('color' in scene.fog && Cesium.Color?.fromCssColorString) {
        scene.fog.color = Cesium.Color.fromCssColorString(state.fogColorCss);
      }
    }

    const profile = getOptimalPerformanceProfile();
    if (scene.globe) {
      if ('enableLighting' in scene.globe && !profile.isLowSpec) {
        scene.globe.enableLighting = true;
      }
      if ('dynamicAtmosphereLighting' in scene.globe) {
        scene.globe.dynamicAtmosphereLighting = true;
      }
      if ('dynamicAtmosphereLightingFromSun' in scene.globe) {
        scene.globe.dynamicAtmosphereLightingFromSun = false;
      }
      if ('lightingFadeOutDistance' in scene.globe) {
        scene.globe.lightingFadeOutDistance = 20000000.0;
      }
      if ('lightingFadeInDistance' in scene.globe) {
        scene.globe.lightingFadeInDistance = 10000000.0;
      }
      if ('nightFadeOutDistance' in scene.globe) {
        scene.globe.nightFadeOutDistance = 20000000.0;
      }
      if ('nightFadeInDistance' in scene.globe) {
        scene.globe.nightFadeInDistance = 10000000.0;
      }
    }

    if ('light' in scene && !profile.isLowSpec) {
      const worldDir = computeWorldLightDirection(
        viewer?.camera?.positionWC,
        state.localLightVector,
        Cesium,
      );
      if (
        worldDir &&
        typeof Cesium.DirectionalLight === 'function' &&
        Cesium.Color
      ) {
        try {
          if (!cycleDirectionLight) {
            cycleDirectionLight = new Cesium.DirectionalLight({
              direction: worldDir,
              color: new Cesium.Color(...state.lightColor, 1.0),
              intensity: state.lightIntensity,
            });
          } else {
            cycleDirectionLight.direction = worldDir;
            cycleDirectionLight.color = new Cesium.Color(
              ...state.lightColor,
              1.0,
            );
            cycleDirectionLight.intensity = state.lightIntensity;
          }
          scene.light = cycleDirectionLight;
        } catch {
          /* ignore mock light errors */
        }
      }
    }

    const bloom = scene.postProcessStages?.bloom;
    if (
      bloom?.uniforms &&
      typeof bloom.uniforms.contrast === 'number' &&
      bloom.uniforms.contrast > 36
    ) {
      bloom.uniforms.contrast = 32.0;
    }

    syncTilesets(state.nightWeight);
    syncImageryLayers(state.imageryBrightness);
  }

  function stopCycleLoop() {
    if (cycleFrameId !== null) {
      cancelFrame(cycleFrameId);
      cycleFrameId = null;
    }
    lastFrameMs = null;
  }

  function scheduleCycleLoop() {
    if (destroyed || !dayNightCycleEnabled || cycleFrameId !== null) return;
    lastFrameMs = now();
    const tick = (frameTime) => {
      cycleFrameId = null;
      if (destroyed || !dayNightCycleEnabled) return;
      const currentMs = typeof frameTime === 'number' ? frameTime : now();
      const elapsedMs = Math.max(0, currentMs - (lastFrameMs ?? currentMs));
      const minStepMs = getOptimalPerformanceProfile().isLowSpec ? 33 : 16;

      if (!globalThis.document?.hidden && elapsedMs >= minStepMs) {
        const dtSec = Math.min(elapsedMs / 1000, 0.25);
        cyclePhase = (cyclePhase + dtSec * CYCLE_RADIANS_PER_SECOND) % (Math.PI * 2);
        lastFrameMs = currentMs;
        applyCycleFrame(cyclePhase);
        requestRender('day-night-cycle');
      }

      if (dayNightCycleEnabled && !destroyed) {
        cycleFrameId = requestFrame(tick);
      }
    };
    cycleFrameId = requestFrame(tick);
  }

  const removePrimitiveAddedListener =
    viewer?.scene?.primitives?.primitiveAdded?.addEventListener?.(
      (primitive) => {
        if (destroyed || (!nightMapEnabled && !dayNightCycleEnabled)) return;
        if (isCityTileset(primitive)) {
          applyShaderToTileset(primitive);
          requestRender('night-map-tileset-added');
        }
      },
    );

  const removeLayerAddedListener =
    viewer?.scene?.imageryLayers?.layerAdded?.addEventListener?.((layer) => {
      if (destroyed || (!nightMapEnabled && !dayNightCycleEnabled)) return;
      const brightness = nightMapEnabled
        ? 0.42
        : computeCycleAtmosphereState(cyclePhase).imageryBrightness;
      applyNightToImageryLayer(layer, brightness);
      requestRender('night-map-layer-added');
    });

  const unsubscribeStack = mapStackController?.subscribe?.(() => {
    if (destroyed || (!nightMapEnabled && !dayNightCycleEnabled)) return;
    const brightness = nightMapEnabled
      ? 0.42
      : computeCycleAtmosphereState(cyclePhase).imageryBrightness;
    syncTilesets(currentNightWeight);
    syncImageryLayers(brightness);
    requestRender('night-map-stack-sync');
  });

  function setNightMapEnabled(enabled, { silent = false } = {}) {
    if (destroyed) return getState();
    const target = Boolean(enabled);
    if (target === nightMapEnabled && !(target && dayNightCycleEnabled)) {
      syncButtons();
      return getState();
    }

    if (target && dayNightCycleEnabled) {
      dayNightCycleEnabled = false;
      stopCycleLoop();
    }

    nightMapEnabled = target;
    if (target) {
      applyStaticNightEnvironment();
    } else if (!dayNightCycleEnabled) {
      currentNightWeight = 0.0;
      currentPhaseLabel = 'DAY';
      syncTilesets(0.0);
      syncImageryLayers(1.0);
      restoreSceneSnapshot();
    }

    syncButtons();
    requestRender(target ? 'night-map-on' : 'night-map-off');
    if (!silent) {
      showToast(t(target ? 'Night map enabled' : 'Night map disabled'));
    }
    return getState();
  }

  function setDayNightCycleEnabled(enabled, { silent = false } = {}) {
    if (destroyed) return getState();
    const target = Boolean(enabled);
    if (target === dayNightCycleEnabled) {
      syncButtons();
      return getState();
    }

    if (target && nightMapEnabled) {
      nightMapEnabled = false;
    }

    dayNightCycleEnabled = target;
    if (target) {
      cyclePhase = INITIAL_CYCLE_PHASE_RAD;
      applyCycleFrame(cyclePhase);
      scheduleCycleLoop();
    } else {
      stopCycleLoop();
      if (nightMapEnabled) {
        applyStaticNightEnvironment();
      } else {
        currentNightWeight = 0.0;
        currentPhaseLabel = 'DAY';
        syncTilesets(0.0);
        syncImageryLayers(1.0);
        restoreSceneSnapshot();
      }
    }

    syncButtons();
    requestRender(target ? 'day-night-cycle-on' : 'day-night-cycle-off');
    if (!silent) {
      showToast(
        t(target ? 'Day-night cycle enabled' : 'Day-night cycle disabled'),
      );
    }
    return getState();
  }

  function setColorFilterEnabled(enabled, { silent = false } = {}) {
    if (destroyed) return getState();
    const target = Boolean(enabled);
    if (target === colorFilterEnabled) {
      syncButtons();
      return getState();
    }
    colorFilterEnabled = target;
    syncColorFilterStage();
    syncButtons();
    requestRender(target ? 'night-color-filter-on' : 'night-color-filter-off');
    if (!silent) {
      showToast(
        t(target ? 'Night color filter enabled' : 'Night color filter disabled'),
      );
    }
    return getState();
  }

  function toggleNightMap() {
    return setNightMapEnabled(!nightMapEnabled);
  }

  function toggleColorFilter() {
    return setColorFilterEnabled(!colorFilterEnabled);
  }

  function toggleDayNightCycle() {
    return setDayNightCycleEnabled(!dayNightCycleEnabled);
  }

  function getState() {
    return {
      nightMap: nightMapEnabled,
      colorFilter: colorFilterEnabled,
      dayNightCycle: dayNightCycleEnabled,
      cyclePhase,
      phaseLabel: currentPhaseLabel,
    };
  }

  syncButtons();

  return {
    getState,
    setNightMapEnabled,
    setColorFilterEnabled,
    setDayNightCycleEnabled,
    toggleNightMap,
    toggleColorFilter,
    toggleDayNightCycle,
    syncButtons,
    dispose() {
      if (destroyed) return;
      destroyed = true;
      nightMapEnabled = false;
      colorFilterEnabled = false;
      dayNightCycleEnabled = false;
      currentNightWeight = 0.0;
      currentPhaseLabel = 'DAY';
      stopCycleLoop();
      if (typeof removePrimitiveAddedListener === 'function') {
        removePrimitiveAddedListener();
      }
      if (typeof removeLayerAddedListener === 'function') {
        removeLayerAddedListener();
      }
      if (typeof unsubscribeStack === 'function') {
        unsubscribeStack();
      }
      restoreAllTilesets();
      restoreAllImageryLayers();
      restoreSceneSnapshot();
      tilesetCustomShader = null;
      cycleDirectionLight = null;
      if (colorFilterStage) {
        colorFilterStage.enabled = false;
        try {
          viewer?.scene?.postProcessStages?.remove?.(colorFilterStage);
        } catch {
          /* stage already removed */
        }
        colorFilterStage = null;
      }
      syncButtons();
    },
  };
}
