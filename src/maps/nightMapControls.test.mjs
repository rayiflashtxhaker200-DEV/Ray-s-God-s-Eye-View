import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createNightMapControls } from './nightMapControls.js';
import {
  NIGHT_COLOR_FILTER_SHADER,
  NIGHT_TILESET_FRAGMENT_SHADER,
  createNightTilesetCustomShader,
} from '../styles/nightMap.js';

function fakeButton() {
  const attrs = new Map();
  const classes = new Set();
  return {
    attrs,
    classes,
    classList: {
      toggle(name, force) {
        if (force === undefined) {
          if (classes.has(name)) classes.delete(name);
          else classes.add(name);
        } else if (force) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
      },
    },
    setAttribute(name, val) {
      attrs.set(name, String(val));
    },
  };
}

function fakeViewer() {
  const stages = [];
  const primitivesList = [];
  const imageryList = [];
  const primitiveAddedListeners = new Set();
  const layerAddedListeners = new Set();
  const renderReasons = [];
  const initialFogColor = { css: '#dbe4f0', clone() { return { ...this }; } };

  const scene = {
    skyAtmosphere: {
      show: true,
      brightnessShift: 0.05,
      saturationShift: 0.1,
      atmosphereLightIntensity: 18,
    },
    fog: {
      enabled: true,
      density: 0.0002,
      minimumBrightness: 0.03,
      color: initialFogColor,
    },
    globe: {
      enableLighting: false,
      dynamicAtmosphereLighting: false,
      dynamicAtmosphereLightingFromSun: true,
      lightingFadeOutDistance: 1000000,
      lightingFadeInDistance: 500000,
      nightFadeOutDistance: 1000000,
      nightFadeInDistance: 500000,
    },
    primitives: {
      get length() {
        return primitivesList.length;
      },
      get(i) {
        return primitivesList[i];
      },
      add(p) {
        primitivesList.push(p);
        for (const fn of primitiveAddedListeners) fn(p);
        return p;
      },
      primitiveAdded: {
        addEventListener(fn) {
          primitiveAddedListeners.add(fn);
          return () => primitiveAddedListeners.delete(fn);
        },
      },
    },
    imageryLayers: {
      get length() {
        return imageryList.length;
      },
      get(i) {
        return imageryList[i];
      },
      add(l) {
        imageryList.push(l);
        for (const fn of layerAddedListeners) fn(l);
        return l;
      },
      layerAdded: {
        addEventListener(fn) {
          layerAddedListeners.add(fn);
          return () => layerAddedListeners.delete(fn);
        },
      },
    },
    postProcessStages: {
      bloom: {
        enabled: true,
        uniforms: { contrast: 256 },
      },
      add(stage) {
        stages.push(stage);
        return stage;
      },
      remove(stage) {
        const idx = stages.indexOf(stage);
        if (idx !== -1) stages.splice(idx, 1);
        return true;
      },
    },
    requestRender(reason) {
      renderReasons.push(reason);
    },
  };

  return {
    shadows: true,
    scene,
    stages,
    renderReasons,
    initialFogColor,
  };
}

test('NIGHT_TILESET_FRAGMENT_SHADER and NIGHT_COLOR_FILTER_SHADER build valid Cesium UNLIT CustomShader and color filter stage', () => {
  assert.match(NIGHT_TILESET_FRAGMENT_SHADER, /void\s+fragmentMain\s*\(/);
  assert.match(NIGHT_TILESET_FRAGMENT_SHADER, /u_nightExposure/);
  assert.match(NIGHT_TILESET_FRAGMENT_SHADER, /u_windowThreshold/);
  assert.match(NIGHT_TILESET_FRAGMENT_SHADER, /u_windowGlow/);

  const customShader = createNightTilesetCustomShader(Cesium);
  assert.ok(customShader instanceof Cesium.CustomShader);
  assert.equal(customShader.lightingModel, Cesium.LightingModel.UNLIT);

  assert.match(NIGHT_COLOR_FILTER_SHADER, /uniform\s+float\s+colorFilterIntensity\s*;/);
  assert.doesNotMatch(NIGHT_COLOR_FILTER_SHADER, /depthTexture/);
  assert.match(NIGHT_COLOR_FILTER_SHADER, /out_FragColor\s*=/);
});

test('createNightMapControls applies CustomShader to 3D Tilesets, dims imagery & atmosphere, and restores everything cleanly', () => {
  const viewer = fakeViewer();
  const nightMapButton = fakeButton();
  const colorFilterButton = fakeButton();
  const previousShader = { tag: 'original-shader' };
  const photorealTileset = { isCesium3DTileset: true, customShader: previousShader };
  const basemapLayer = { brightness: 1.0, contrast: 1.0, gamma: 1.0 };
  viewer.scene.primitives.add(photorealTileset);
  viewer.scene.imageryLayers.add(basemapLayer);

  const stackListeners = new Set();
  const mapStackController = {
    getImageryHostTileset: () => photorealTileset,
    subscribe(fn) {
      stackListeners.add(fn);
      return () => stackListeners.delete(fn);
    },
  };

  const toasts = [];
  const controls = createNightMapControls({
    viewer,
    mapStackController,
    requestRender: (reason) => viewer.renderReasons.push(reason),
    nightMapButton,
    colorFilterButton,
    showToast: (msg) => toasts.push(msg),
    createStage(options) {
      return { ...options, enabled: false };
    },
  });

  // Enable Night Map
  controls.toggleNightMap();
  assert.equal(viewer.stages.length, 0); // Color filter stage stays unmounted until toggled on
  assert.notEqual(photorealTileset.customShader, previousShader);
  assert.equal(photorealTileset.customShader.lightingModel, Cesium.LightingModel.UNLIT);
  assert.equal(photorealTileset.customShader.uniforms.u_nightIntensity.value, 1.0);
  assert.equal(basemapLayer.brightness, 0.42);
  assert.equal(viewer.shadows, false);
  assert.equal(viewer.scene.postProcessStages.bloom.uniforms.contrast, 32.0);
  assert.equal(viewer.scene.skyAtmosphere.brightnessShift, -0.58);
  assert.equal(viewer.scene.fog.minimumBrightness, 0.08);
  assert.equal(viewer.scene.globe.dynamicAtmosphereLighting, true);
  assert.equal(viewer.scene.globe.dynamicAtmosphereLightingFromSun, false);
  assert.equal(nightMapButton.classes.has('active'), true);
  assert.equal(nightMapButton.attrs.get('aria-pressed'), 'true');
  assert.equal(toasts.length, 1);

  // Dynamically added OSM 3D Buildings tileset inherits the night CustomShader automatically
  const osmBuildingsTileset = { isCesium3DTileset: true };
  viewer.scene.primitives.add(osmBuildingsTileset);
  assert.equal(osmBuildingsTileset.customShader, photorealTileset.customShader);

  // Disable Night Map restores tileset shaders, imagery, shadows, bloom, fog, and atmosphere
  controls.toggleNightMap();
  assert.equal(photorealTileset.customShader, previousShader);
  assert.equal(osmBuildingsTileset.customShader, undefined);
  assert.equal(basemapLayer.brightness, 1.0);
  assert.equal(viewer.shadows, true);
  assert.equal(viewer.scene.postProcessStages.bloom.uniforms.contrast, 256);
  assert.equal(viewer.scene.skyAtmosphere.brightnessShift, 0.05);
  assert.deepEqual(viewer.scene.fog.color, viewer.initialFogColor);
  assert.equal(viewer.scene.globe.dynamicAtmosphereLighting, false);
  assert.equal(viewer.scene.globe.dynamicAtmosphereLightingFromSun, true);
  assert.equal(nightMapButton.classes.has('active'), false);
  assert.equal(toasts.length, 2);

  controls.dispose();
});

test('createNightMapControls toggles tactical emerald-amber Color Filter independently and cleans up on dispose', () => {
  const viewer = fakeViewer();
  const nightMapButton = fakeButton();
  const colorFilterButton = fakeButton();
  const createdStages = [];

  const controls = createNightMapControls({
    viewer,
    requestRender: (reason) => viewer.renderReasons.push(reason),
    nightMapButton,
    colorFilterButton,
    createStage(options) {
      const stage = { ...options, enabled: false };
      createdStages.push(stage);
      return stage;
    },
  });

  // Color filter mounts lazily and leaves atmosphere untouched when Night Map is off
  controls.toggleColorFilter();
  assert.equal(createdStages.length, 1);
  const stage = createdStages[0];
  assert.equal(stage.name, 'godsEyeView_nightColorFilter');
  assert.equal(stage.enabled, true);
  assert.equal(stage.uniforms.colorFilterIntensity, 1.0);
  assert.equal(viewer.scene.skyAtmosphere.brightnessShift, 0.05);
  assert.equal(colorFilterButton.classes.has('active'), true);
  assert.equal(colorFilterButton.attrs.get('aria-pressed'), 'true');

  // Combining Night Map keeps Color Filter active alongside CustomShader
  const tileset = { isCesium3DTileset: true };
  viewer.scene.primitives.add(tileset);
  controls.setNightMapEnabled(true, { silent: true });
  assert.ok(tileset.customShader instanceof Cesium.CustomShader);
  assert.equal(stage.enabled, true);
  const combinedState = controls.getState();
  assert.equal(combinedState.nightMap, true);
  assert.equal(combinedState.colorFilter, true);
  assert.equal(combinedState.dayNightCycle, false);

  // Turning off Color Filter keeps Night Map active
  controls.setColorFilterEnabled(false, { silent: true });
  assert.equal(stage.enabled, false);
  assert.equal(stage.uniforms.colorFilterIntensity, 0.0);
  assert.equal(colorFilterButton.classes.has('active'), false);
  assert.equal(nightMapButton.classes.has('active'), true);

  // Dispose restores tilesets, scene environment, buttons, and removes stage
  controls.dispose();
  assert.equal(viewer.stages.length, 0);
  assert.equal(tileset.customShader, undefined);
  assert.equal(viewer.scene.skyAtmosphere.brightnessShift, 0.05);
  assert.equal(nightMapButton.classes.has('active'), false);
  assert.equal(colorFilterButton.classes.has('active'), false);
});

test('createNightMapControls drives animated Day-Night Cycle across dusk/night/day without mutating clock and hands off cleanly with Night Map', () => {
  const viewer = fakeViewer();
  viewer.camera = {
    positionWC: Cesium.Cartesian3.fromDegrees(-74.006, 40.7128, 500),
  };
  const nightMapButton = fakeButton();
  const colorFilterButton = fakeButton();
  const dayNightCycleButton = fakeButton();
  const tileset = { isCesium3DTileset: true };
  const basemapLayer = { brightness: 1.0, contrast: 1.0, gamma: 1.0 };
  viewer.scene.primitives.add(tileset);
  viewer.scene.imageryLayers.add(basemapLayer);

  let fakeNowMs = 1000;
  let queuedCallback = null;
  let cancelledCount = 0;

  const controls = createNightMapControls({
    viewer,
    requestRender: (reason) => viewer.renderReasons.push(reason),
    nightMapButton,
    colorFilterButton,
    dayNightCycleButton,
    now: () => fakeNowMs,
    requestFrame: (cb) => {
      queuedCallback = cb;
      return 42;
    },
    cancelFrame: () => {
      cancelledCount += 1;
      queuedCallback = null;
    },
  });

  // Start Day-Night Cycle
  const initialState = controls.toggleDayNightCycle();
  assert.equal(initialState.dayNightCycle, true);
  assert.equal(dayNightCycleButton.classes.has('active'), true);
  assert.equal(dayNightCycleButton.attrs.get('aria-pressed'), 'true');
  assert.ok(tileset.customShader instanceof Cesium.CustomShader);
  assert.ok(typeof queuedCallback === 'function');

  const phaseStart = initialState.cyclePhase;
  // Advance enough frames to progress from dusk into night
  for (let i = 0; i < 18; i++) {
    fakeNowMs += 200;
    const cb = queuedCallback;
    queuedCallback = null;
    cb(fakeNowMs);
  }
  const advancedState = controls.getState();
  assert.ok(advancedState.cyclePhase > phaseStart);
  assert.equal(advancedState.phaseLabel, 'NIGHT');
  assert.ok(tileset.customShader.uniforms.u_nightIntensity.value > 0.7);
  assert.ok(basemapLayer.brightness < 0.65);

  // Activating static Night Map hands off cleanly and stops the cycle loop
  controls.toggleNightMap();
  assert.equal(controls.getState().nightMap, true);
  assert.equal(controls.getState().dayNightCycle, false);
  assert.equal(dayNightCycleButton.classes.has('active'), false);
  assert.equal(nightMapButton.classes.has('active'), true);
  assert.ok(cancelledCount >= 1);

  // Re-enabling Day-Night Cycle turns off static Night Map lock and resumes cycle
  controls.toggleDayNightCycle();
  assert.equal(controls.getState().dayNightCycle, true);
  assert.equal(controls.getState().nightMap, false);
  assert.equal(dayNightCycleButton.classes.has('active'), true);
  assert.equal(nightMapButton.classes.has('active'), false);

  // Toggling Day-Night Cycle off restores tilesets, imagery, and atmosphere
  controls.toggleDayNightCycle();
  assert.equal(controls.getState().dayNightCycle, false);
  assert.equal(tileset.customShader, undefined);
  assert.equal(basemapLayer.brightness, 1.0);
  assert.equal(viewer.scene.skyAtmosphere.brightnessShift, 0.05);
  assert.equal(dayNightCycleButton.classes.has('active'), false);

  controls.dispose();
});
