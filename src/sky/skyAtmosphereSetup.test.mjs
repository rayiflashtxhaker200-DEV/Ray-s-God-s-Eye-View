import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  applySkyAtmosphereDefaults,
  computeCycleAtmosphereState,
  computeWorldLightDirection,
} from './skyAtmosphereSetup.js';

test('applySkyAtmosphereDefaults configures Sun, Moon, SkyAtmosphere, Globe atmosphere, and Fog respecting hardware profile', () => {
  const viewer = {
    scene: {
      sun: { show: false, glowFactor: 0.2 },
      moon: { show: false },
      skyBox: { show: false },
      skyAtmosphere: {
        show: false,
        atmosphereLightIntensity: 10,
        saturationShift: 0,
        brightnessShift: 0,
        hueShift: 0.2,
        atmosphereRayleighScaleHeight: 5000,
        atmosphereMieScaleHeight: 1000,
        atmosphereMieAnisotropy: 0.5,
        perFragmentAtmosphere: false,
      },
      globe: {
        showGroundAtmosphere: false,
        atmosphereLightIntensity: 5,
        atmosphereRayleighScaleHeight: 5000,
        atmosphereMieScaleHeight: 1000,
        atmosphereMieAnisotropy: 0.5,
        dynamicAtmosphereLighting: false,
        dynamicAtmosphereLightingFromSun: true,
        lightingFadeOutDistance: 1,
        lightingFadeInDistance: 1,
        nightFadeOutDistance: 1,
        nightFadeInDistance: 1,
      },
      fog: {
        enabled: false,
        density: 0.001,
        minimumBrightness: 0.01,
      },
    },
  };

  applySkyAtmosphereDefaults(viewer, {
    isLowSpec: false,
    groundAtmosphereEnabled: true,
    fogDensity: 0.00018,
  });

  assert.equal(viewer.scene.sun.show, true);
  assert.equal(viewer.scene.sun.glowFactor, 1.0);
  assert.equal(viewer.scene.moon.show, true);
  assert.equal(viewer.scene.skyBox.show, true);
  assert.equal(viewer.scene.skyAtmosphere.show, true);
  assert.equal(viewer.scene.skyAtmosphere.atmosphereLightIntensity, 32.0);
  assert.equal(viewer.scene.skyAtmosphere.perFragmentAtmosphere, true);
  assert.equal(viewer.scene.globe.showGroundAtmosphere, true);
  assert.equal(viewer.scene.globe.dynamicAtmosphereLighting, true);
  assert.equal(viewer.scene.globe.dynamicAtmosphereLightingFromSun, true);
  assert.equal(viewer.scene.globe.lightingFadeOutDistance, 20000000.0);
  assert.equal(viewer.scene.fog.enabled, true);
  assert.equal(viewer.scene.fog.density, 0.00018);

  // Low-spec profile disables per-fragment atmosphere & ground atmosphere
  applySkyAtmosphereDefaults(viewer, {
    isLowSpec: true,
    groundAtmosphereEnabled: false,
    fogDensity: 0.00028,
  });
  assert.equal(viewer.scene.skyAtmosphere.perFragmentAtmosphere, false);
  assert.equal(viewer.scene.globe.showGroundAtmosphere, false);
  assert.equal(viewer.scene.fog.density, 0.00028);
});

test('computeCycleAtmosphereState produces distinct Day, Dusk, Night, and Dawn states and computeWorldLightDirection normalizes ECEF vector', () => {
  const noon = computeCycleAtmosphereState(Math.PI / 2);
  assert.equal(noon.phaseLabel, 'DAY');
  assert.equal(noon.nightWeight, 0);
  assert.equal(noon.imageryBrightness, 1);

  const dusk = computeCycleAtmosphereState(Math.PI);
  assert.equal(dusk.phaseLabel, 'DUSK');
  assert.ok(dusk.twilightWeight > 0.8);
  assert.ok(dusk.skyHueShift < -0.05);

  const midnight = computeCycleAtmosphereState((Math.PI * 3) / 2);
  assert.equal(midnight.phaseLabel, 'NIGHT');
  assert.equal(midnight.nightWeight, 1);
  assert.ok(Math.abs(midnight.skyBrightnessShift - -0.58) < 1e-6);
  assert.ok(midnight.localLightVector[2] >= 0.1);

  const dawn = computeCycleAtmosphereState(0);
  assert.equal(dawn.phaseLabel, 'DAWN');
  assert.ok(dawn.twilightWeight > 0.8);

  const pos = Cesium.Cartesian3.fromDegrees(-74.006, 40.7128, 100);
  const worldVec = computeWorldLightDirection(pos, noon.localLightVector, Cesium);
  assert.ok(worldVec);
  const mag = Cesium.Cartesian3.magnitude(worldVec);
  assert.ok(Math.abs(mag - 1.0) < 1e-6);
});
