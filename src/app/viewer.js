import * as Cesium from 'cesium';
import { getOptimalPerformanceProfile, applyHardwareOptimizations } from '../hardwareProfile.js';

/** Create the standard globe viewer in caller-owned, visible containers. */
export function createApplicationViewer({ container, creditContainer }) {
  if (!container || !creditContainer)
    throw new TypeError('Viewer and credit containers are required');

  const profile = getOptimalPerformanceProfile();

  const viewer = new Cesium.Viewer(container, {
    timeline: false,
    animation: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    vrButton: false,
    selectionIndicator: false,
    infoBox: false,
    baseLayer: false,
    creditContainer,
    msaaSamples: profile.msaaSamples,
    contextOptions: { webgl: { preserveDrawingBuffer: true, powerPreference: 'low-power' } },
  });

  try {
    viewer.targetFrameRate = profile.targetFrameRate;
    viewer.resolutionScale = profile.resolutionScale;
    viewer.scene.globe.show = false;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.skyAtmosphere.atmosphereLightIntensity = 18;
    viewer.scene.skyAtmosphere.saturationShift = -0.12;
    viewer.scene.skyAtmosphere.brightnessShift = -0.08;

    applyHardwareOptimizations(viewer);
    return viewer;
  } catch (error) {
    viewer.destroy();
    throw error;
  }
}
