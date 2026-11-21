import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { createScene3dControls } from './scene3dControls.js';

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
    removeAttribute(name) {
      attrs.delete(name);
    },
  };
}

function fakeViewer(initialMode = Cesium.SceneMode.SCENE3D) {
  const morphListeners = new Set();
  const addedPrimitives = [];
  let cancelCount = 0;
  let renderRequests = 0;
  const scene = {
    mode: initialMode,
    globe: {
      depthTestAgainstTerrain: false,
    },
    morphTo2D() {
      scene.mode = Cesium.SceneMode.SCENE2D;
    },
    morphTo3D() {
      scene.mode = Cesium.SceneMode.SCENE3D;
    },
    morphComplete: {
      addEventListener(fn) {
        morphListeners.add(fn);
        return () => morphListeners.delete(fn);
      },
    },
    primitives: {
      add(item) {
        addedPrimitives.push(item);
      },
      remove(item) {
        const idx = addedPrimitives.indexOf(item);
        if (idx !== -1) addedPrimitives.splice(idx, 1);
      },
    },
    requestRender() {
      renderRequests += 1;
    },
  };
  return {
    scene,
    camera: {
      cancelFlight() {
        cancelCount += 1;
      },
    },
    addedPrimitives,
    getCancelCount: () => cancelCount,
    getRenderRequests: () => renderRequests,
    emitMorphComplete() {
      for (const fn of morphListeners) fn();
    },
  };
}

test('createScene3dControls toggles 3D <-> 2D and falls back/restores photoreal stack cleanly', async () => {
  const viewer = fakeViewer();
  const globeButton = fakeButton();
  const buildingsButton = fakeButton();
  const stackCalls = [];
  const toasts = [];
  let activeId = 'photoreal';

  const mapStackController = {
    cesiumToken: 'tok-123',
    getActiveId: () => activeId,
    isStackAvailable: (id) =>
      id === 'photoreal' || id === 'esri-imagery' || id === 'osm',
  };

  const controls = createScene3dControls({
    viewer,
    mapStackController,
    setMapStack: async (stackId) => {
      stackCalls.push(stackId);
      activeId = stackId;
    },
    globeButton,
    buildingsButton,
    showToast: (msg) => toasts.push(msg),
  });

  assert.equal(controls.getState().globe3d, true);
  assert.equal(globeButton.attrs.get('aria-pressed'), 'true');
  assert.equal(globeButton.classes.has('active'), true);

  await controls.toggleGlobe3d();
  assert.equal(viewer.scene.mode, Cesium.SceneMode.SCENE2D);
  assert.deepEqual(stackCalls, ['esri-imagery']);
  assert.equal(globeButton.attrs.get('aria-pressed'), 'false');
  assert.equal(globeButton.classes.has('active'), false);
  assert.equal(viewer.getCancelCount(), 1);

  await controls.toggleGlobe3d();
  assert.equal(viewer.scene.mode, Cesium.SceneMode.SCENE3D);
  assert.deepEqual(stackCalls, ['esri-imagery', 'photoreal']);
  assert.equal(globeButton.attrs.get('aria-pressed'), 'true');
  assert.equal(globeButton.classes.has('active'), true);
  assert.equal(toasts.length, 2);

  controls.dispose();
});

test('createScene3dControls loads OSM 3D buildings, sets depthTestAgainstTerrain, hides in 2D, and restores photoreal when toggled off', async () => {
  const viewer = fakeViewer();
  const globeButton = fakeButton();
  const buildingsButton = fakeButton();
  let createCount = 0;
  let activeId = 'photoreal';
  const stackCalls = [];
  const fakeTileset = {
    show: true,
    destroyed: false,
    allTilesLoaded: {
      addEventListener() {
        return () => {};
      },
    },
    isDestroyed() {
      return this.destroyed;
    },
    destroy() {
      this.destroyed = true;
    },
  };

  const controls = createScene3dControls({
    viewer,
    mapStackController: {
      cesiumToken: 'tok-abc',
      getActiveId: () => activeId,
      isStackAvailable: (id) =>
        id === 'photoreal' || id === 'bing-aerial' || id === 'esri-imagery',
    },
    setMapStack: async (stackId) => {
      stackCalls.push(stackId);
      activeId = stackId;
    },
    globeButton,
    buildingsButton,
    createOsmBuildings: async ({ token }) => {
      createCount += 1;
      assert.equal(token, 'tok-abc');
      return fakeTileset;
    },
  });

  await controls.toggleBuildings3d();
  assert.equal(createCount, 1);
  assert.equal(controls.getState().buildings3d, true);
  assert.equal(fakeTileset.show, true);
  assert.equal(viewer.scene.globe.depthTestAgainstTerrain, true);
  assert.deepEqual(stackCalls, ['bing-aerial']);
  assert.equal(viewer.addedPrimitives.includes(fakeTileset), true);
  assert.equal(buildingsButton.attrs.get('aria-pressed'), 'true');

  // Switching to 2D hides buildings tileset and restores depthTestAgainstTerrain without destroying it
  await controls.setGlobe3dEnabled(false, { silent: true });
  assert.equal(fakeTileset.show, false);
  assert.equal(viewer.scene.globe.depthTestAgainstTerrain, false);

  // Returning to 3D restores buildings tileset and depthTestAgainstTerrain without re-creating it
  await controls.setGlobe3dEnabled(true, { silent: true });
  assert.equal(fakeTileset.show, true);
  assert.equal(viewer.scene.globe.depthTestAgainstTerrain, true);
  assert.equal(createCount, 1);

  // Turning buildings off restores Photoreal stack and depthTestAgainstTerrain
  await controls.toggleBuildings3d();
  assert.equal(controls.getState().buildings3d, false);
  assert.equal(fakeTileset.show, false);
  assert.equal(viewer.scene.globe.depthTestAgainstTerrain, false);
  assert.deepEqual(stackCalls, ['bing-aerial', 'photoreal']);

  controls.dispose();
  assert.equal(fakeTileset.destroyed, true);
});

test('createScene3dControls reports missing token cleanly when OSM buildings fail without token', async () => {
  const viewer = fakeViewer();
  const buildingsButton = fakeButton();
  const toasts = [];

  const controls = createScene3dControls({
    viewer,
    mapStackController: {
      cesiumToken: '',
      getActiveId: () => 'osm',
      isStackAvailable: () => false,
    },
    buildingsButton,
    showToast: (msg) => toasts.push(msg),
    createOsmBuildings: async () => {
      throw new Error('Missing Cesium ion token');
    },
  });

  await controls.toggleBuildings3d();
  assert.equal(controls.getState().buildings3d, false);
  assert.equal(controls.getState().loadingBuildings, false);
  assert.equal(buildingsButton.attrs.get('aria-pressed'), 'false');
  assert.equal(toasts.length, 2);

  controls.dispose();
});
