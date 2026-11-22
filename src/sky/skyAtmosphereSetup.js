import * as Cesium from 'cesium';
import { getOptimalPerformanceProfile } from '../hardwareProfile.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * clamp01(t);
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/**
 * Default Sandcastle-inspired Cesium Sky, Sun, Moon, Globe Atmosphere, and Fog
 * configuration tuned for Ray's Eye View and active hardware profile.
 */
export function applySkyAtmosphereDefaults(
  viewer,
  profile = getOptimalPerformanceProfile(),
) {
  const scene = viewer?.scene;
  if (!scene) return false;

  if (scene.sun && typeof scene.sun === 'object') {
    scene.sun.show = true;
    if ('glowFactor' in scene.sun) scene.sun.glowFactor = 1.0;
  }
  if (scene.moon && typeof scene.moon === 'object') {
    scene.moon.show = true;
  }
  if (scene.skyBox && typeof scene.skyBox === 'object') {
    scene.skyBox.show = true;
  }

  if (scene.skyAtmosphere) {
    const sky = scene.skyAtmosphere;
    sky.show = true;
    sky.atmosphereLightIntensity = 32.0;
    sky.saturationShift = 0.0;
    sky.brightnessShift = 0.0;
    if ('hueShift' in sky) sky.hueShift = 0.0;
    if ('atmosphereRayleighScaleHeight' in sky) {
      sky.atmosphereRayleighScaleHeight = 10000.0;
    }
    if ('atmosphereMieScaleHeight' in sky) {
      sky.atmosphereMieScaleHeight = 3200.0;
    }
    if ('atmosphereMieAnisotropy' in sky) {
      sky.atmosphereMieAnisotropy = 0.9;
    }
    if ('perFragmentAtmosphere' in sky) {
      sky.perFragmentAtmosphere = !profile.isLowSpec;
    }
  }

  if (scene.globe) {
    const globe = scene.globe;
    if ('showGroundAtmosphere' in globe) {
      globe.showGroundAtmosphere = profile.groundAtmosphereEnabled !== false;
    }
    if ('atmosphereLightIntensity' in globe) {
      globe.atmosphereLightIntensity = 14.0;
    }
    if ('atmosphereRayleighScaleHeight' in globe) {
      globe.atmosphereRayleighScaleHeight = 10000.0;
    }
    if ('atmosphereMieScaleHeight' in globe) {
      globe.atmosphereMieScaleHeight = 3200.0;
    }
    if ('atmosphereMieAnisotropy' in globe) {
      globe.atmosphereMieAnisotropy = 0.9;
    }
    if ('dynamicAtmosphereLighting' in globe) {
      globe.dynamicAtmosphereLighting = true;
    }
    if ('dynamicAtmosphereLightingFromSun' in globe) {
      globe.dynamicAtmosphereLightingFromSun = true;
    }
    if ('lightingFadeOutDistance' in globe) {
      globe.lightingFadeOutDistance = 20000000.0;
    }
    if ('lightingFadeInDistance' in globe) {
      globe.lightingFadeInDistance = 10000000.0;
    }
    if ('nightFadeOutDistance' in globe) {
      globe.nightFadeOutDistance = 20000000.0;
    }
    if ('nightFadeInDistance' in globe) {
      globe.nightFadeInDistance = 10000000.0;
    }
  }

  if (scene.fog) {
    scene.fog.enabled = true;
    if ('density' in scene.fog) {
      scene.fog.density = profile.fogDensity ?? 0.00018;
    }
    if ('minimumBrightness' in scene.fog) {
      scene.fog.minimumBrightness = 0.05;
    }
  }

  return true;
}

/**
 * Compute sky, fog, and night-shader blending parameters for a solar cycle phase
 * angle in radians (`0` = dawn horizon, `PI/2` = noon, `PI` = sunset, `3*PI/2` = midnight).
 */
export function computeCycleAtmosphereState(phaseRad) {
  const elevationSin = Math.sin(phaseRad); // +1 noon, 0 horizon, -1 midnight
  const nightWeight = smoothstep(0.22, -0.18, elevationSin);
  const twilightWeight = Math.exp(-Math.pow((elevationSin - 0.02) / 0.22, 2));

  const skyBrightnessShift =
    lerp(0.0, -0.58, nightWeight) - twilightWeight * 0.08;
  const skySaturationShift =
    lerp(0.0, -0.2, nightWeight) + twilightWeight * 0.34;
  const skyHueShift = -0.09 * twilightWeight;
  const skyLightIntensity =
    lerp(32.0, 6.5, nightWeight) - twilightWeight * 4.0;

  const fogMinimumBrightness = lerp(0.05, 0.08, nightWeight);
  const fogR = Math.round(
    lerp(lerp(202, 148, twilightWeight), 8, nightWeight),
  );
  const fogG = Math.round(
    lerp(lerp(218, 92, twilightWeight), 18, nightWeight),
  );
  const fogB = Math.round(
    lerp(lerp(236, 98, twilightWeight), 32, nightWeight),
  );
  const fogColorCss = `rgb(${fogR}, ${fogG}, ${fogB})`;

  const imageryBrightness = lerp(1.0, 0.42, nightWeight);

  // Light direction elevation in local ENU frame (keep >= 0.10 at night so globe terrain stays readable)
  const localEast = Math.cos(phaseRad);
  const localNorth = 0.34;
  const localUp = Math.max(0.1, elevationSin);
  const lightIntensity = lerp(1.6, 0.72, nightWeight);
  const lightColor = [
    lerp(lerp(1.0, 1.0, twilightWeight), 0.72, nightWeight),
    lerp(lerp(0.98, 0.76, twilightWeight), 0.82, nightWeight),
    lerp(lerp(0.95, 0.58, twilightWeight), 0.98, nightWeight),
  ];

  const phaseLabel =
    elevationSin > 0.24
      ? 'DAY'
      : elevationSin < -0.18
        ? 'NIGHT'
        : Math.cos(phaseRad) >= 0
          ? 'DAWN'
          : 'DUSK';

  return {
    elevationSin,
    nightWeight,
    twilightWeight,
    phaseLabel,
    skyBrightnessShift,
    skySaturationShift,
    skyHueShift,
    skyLightIntensity,
    fogMinimumBrightness,
    fogColorCss,
    imageryBrightness,
    localLightVector: [localEast, localNorth, localUp],
    lightIntensity,
    lightColor,
  };
}

/**
 * Transform a local East-North-Up (ENU) solar direction into world ECEF direction
 * relative to the camera's surface point (falling back safely if transforms are absent).
 */
export function computeWorldLightDirection(
  cameraPositionWC,
  [east, north, up],
  CesiumRef = Cesium,
) {
  const Cartesian3 = CesiumRef?.Cartesian3;
  const Transforms = CesiumRef?.Transforms;
  const Matrix4 = CesiumRef?.Matrix4;
  if (!Cartesian3) return null;

  const localDir = new Cartesian3(east, north, up);
  Cartesian3.normalize(localDir, localDir);

  if (
    cameraPositionWC &&
    Transforms?.eastNorthUpToFixedFrame &&
    Matrix4?.multiplyByPointAsVector
  ) {
    try {
      const enu = Transforms.eastNorthUpToFixedFrame(cameraPositionWC);
      const worldDir = Matrix4.multiplyByPointAsVector(
        enu,
        localDir,
        new Cartesian3(),
      );
      return Cartesian3.normalize(worldDir, worldDir);
    } catch {
      return localDir;
    }
  }
  return localDir;
}
