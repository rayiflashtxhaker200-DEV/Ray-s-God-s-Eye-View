/**
 * Hardware Profile & Low-Specification Optimizer for Ray's Eye View
 *
 * Tuned specifically against legacy dual-core APU/laptop hardware specs:
 * - AMD E-350 APU (Zacate/Bobcat, Q1/2011): 2 cores / 2 threads @ 1.60 GHz (no Turbo, no SMT),
 *   1 MB L3 cache, 18 W TDP, 1-channel DDR3-1066 shared memory.
 * - Integrated AMD Radeon HD 6310: 490 MHz (no GPU Turbo), 1 Execution Unit,
 *   80 Shaders, 79 GFLOPS FP32, 1 GB Max Shared GPU Memory.
 * - Legacy 1st-Gen mobile CPUs (e.g. Intel Core i5 M 450, AMD E-450 / HD 6320) & 5400 RPM HDDs.
 *
 * Optimizations applied in "Ahorro (30 FPS)" / low-spec mode:
 * 1. Zero MSAA (msaaSamples: 1) + FXAA & HDR off: eliminates 4x ROP/fillrate amplification on 80 shaders.
 * 2. 30 FPS cap + 0.75x resolutionScale + browser-recommended DPR: cuts pixel shading by ~44% and keeps
 *    the 18 W dual-core 1.60 GHz CPU below thermal/thread saturation.
 * 3. Tight 160 MB 3D Tile Cache (+ 64 MB overflow ceiling = 224 MB max vs 2.5 GB default): stays
 *    comfortably within Radeon HD 6310's 1 GB shared GPU memory and single-channel DDR3-1066 bus.
 * 4. Aggressive LOD & horizon culling (SSE 32, skipLevels: 2, dynamicSSEFactor: 12, moving-pan culling,
 *    distance fog culling): sharply cuts vertex count, texture uploads, and network decode stalls.
 * 5. Adaptive remote polling intervals to relieve CPU & memory bandwidth when idle or backgrounded.
 */

export const STORAGE_HARDWARE_MODE_KEY = 'gev_hardware_mode';

const VALID_MODES = new Set(['low', 'auto', 'high']);

/**
 * Read persisted hardware mode ('low' | 'auto' | 'high').
 * @returns {'low' | 'auto' | 'high'}
 */
export function getHardwareMode() {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = window.localStorage?.getItem?.(STORAGE_HARDWARE_MODE_KEY);
    return VALID_MODES.has(raw) ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Persist hardware mode ('low' | 'auto' | 'high').
 * @param {'low' | 'auto' | 'high'} mode
 * @returns {'low' | 'auto' | 'high'}
 */
export function setHardwareMode(mode) {
  const normalized = VALID_MODES.has(mode) ? mode : 'auto';
  if (typeof window !== 'undefined') {
    try {
      window.localStorage?.setItem?.(STORAGE_HARDWARE_MODE_KEY, normalized);
    } catch {
      /* ignore storage errors in private contexts */
    }
  }
  return normalized;
}

/**
 * Check if the current device has low/legacy specifications.
 * @returns {boolean}
 */
export function isLowSpecDevice() {
  if (typeof window === 'undefined') return true;

  // Check manual user preference
  const manual = getHardwareMode();
  if (manual === 'low') return true;
  if (manual === 'high') return false;

  // Auto-detect based on CPU concurrency (<= 4 threads: AMD E-350 2C/2T, E-450, Core i5 M 450)
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) {
    return true;
  }

  // Auto-detect based on device memory (<= 8 GB RAM / single-channel DDR3 systems)
  if (navigator.deviceMemory && navigator.deviceMemory <= 8) {
    return true;
  }

  // Auto-detect legacy GPU renderer via WebGL unmasked vendor/renderer
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = String(
          gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '',
        ).toLowerCase();
        const legacyGpuPatterns = [
          'radeon hd 6310',
          'radeon hd 6320',
          'radeon hd 5',
          'radeon hd 6',
          'radeon mobility',
          'mobility radeon',
          'zacate',
          'bobcat',
          'wrestler',
          'loveland',
          'e-450',
          'e-350',
          'e-300',
          'intel hd',
          'intel(r) hd',
          'ironlake',
          'gma',
          'llvmpipe',
          'swiftshader',
          'geforce 9',
          'geforce 8',
          'geforce 2',
          'geforce 3',
          'geforce 4',
          'mesa',
        ];
        if (legacyGpuPatterns.some((pattern) => renderer.includes(pattern))) {
          return true;
        }
      }
    }
  } catch {
    // If WebGL check fails, assume safe low-spec
    return true;
  }

  return false;
}

/**
 * Get recommended performance settings based on hardware profile.
 */
export function getOptimalPerformanceProfile() {
  const mode = getHardwareMode();
  const lowSpec = isLowSpecDevice();

  return {
    mode,
    isLowSpec: lowSpec,
    profileTier: lowSpec ? 'low' : 'high',
    // MSAA: 1 (off) on low-spec eliminates 4x ROP/fillrate cost on Radeon HD 6310 (80 shaders)
    msaaSamples: lowSpec ? 1 : 2,
    // Post-process antialiasing & HDR: disable on 79 GFLOPS iGPU to save full-screen shader passes & VRAM
    fxaaEnabled: !lowSpec,
    hdrEnabled: !lowSpec,
    shadowsEnabled: false,
    // Target frame rate: 30 FPS keeps dual-core 1.60 GHz (no turbo, 18 W TDP) from pinning at 100%
    targetFrameRate: lowSpec ? 30 : 60,
    // Resolution scale: 0.75 cuts fragment shading load by 43.75% (0.75^2 = 0.5625) on Radeon HD 6310
    resolutionScale: lowSpec ? 0.75 : 1.0,
    // Avoid oversampling HiDPI canvases on low-spec hardware
    useBrowserRecommendedResolution: lowSpec,
    // 3D Tile Cache: 160 MB + 64 MB overflow (224 MB ceiling) fits 1 GB max shared VRAM + 1-ch DDR3-1066
    tileCacheBytes: lowSpec ? 160 * 1024 * 1024 : 1024 * 1024 * 1024,
    maximumCacheOverflowBytes: lowSpec ? 64 * 1024 * 1024 : 512 * 1024 * 1024,
    // Screen space error & dynamic LOD: cuts draw calls, triangles, and DDR3 texture uploads sharply
    maximumScreenSpaceError: lowSpec ? 32 : 16,
    dynamicScreenSpaceError: true,
    dynamicScreenSpaceErrorDensity: lowSpec ? 0.00278 : 0.0002,
    dynamicScreenSpaceErrorFactor: lowSpec ? 12.0 : 4.0,
    dynamicScreenSpaceErrorHeightFalloff: 0.25,
    skipLevelOfDetail: lowSpec,
    baseScreenSpaceError: 1024,
    skipScreenSpaceErrorFactor: lowSpec ? 24 : 16,
    skipLevels: lowSpec ? 2 : 0,
    cullRequestsWhileMoving: true,
    cullRequestsWhileMovingMultiplier: lowSpec ? 60.0 : 40.0,
    preloadWhenHidden: false,
    preloadFlightDestinations: !lowSpec,
    // Globe fallback tile & shader settings
    globeTileCacheSize: lowSpec ? 24 : 100,
    globeMaximumScreenSpaceError: lowSpec ? 3.0 : 1.5,
    groundAtmosphereEnabled: !lowSpec,
    waterEffectEnabled: !lowSpec,
    perFragmentAtmosphere: !lowSpec,
    // Distance fog culling to avoid fetching distant horizon tiles on 1-ch DDR3-1066
    fogDensity: lowSpec ? 0.00045 : 0.0001,
    fogScreenSpaceErrorFactor: lowSpec ? 4.0 : 2.0,
    // Network polling intervals (ms)
    pollIntervalIdle: lowSpec ? 3000 : 1500,
    pollIntervalActive: lowSpec ? 1200 : 1000,
    pollIntervalBackground: lowSpec ? 6000 : 5000,
  };
}

/**
 * Constructor options for Cesium3DTileset / OSM Buildings aligned to active hardware profile.
 * @param {ReturnType<typeof getOptimalPerformanceProfile>} [profile]
 */
export function getTilesetHardwareOptions(
  profile = getOptimalPerformanceProfile(),
) {
  return {
    cacheBytes: profile.tileCacheBytes,
    maximumCacheOverflowBytes: profile.maximumCacheOverflowBytes,
    maximumScreenSpaceError: profile.maximumScreenSpaceError,
    dynamicScreenSpaceError: profile.dynamicScreenSpaceError,
    dynamicScreenSpaceErrorDensity: profile.dynamicScreenSpaceErrorDensity,
    dynamicScreenSpaceErrorFactor: profile.dynamicScreenSpaceErrorFactor,
    dynamicScreenSpaceErrorHeightFalloff:
      profile.dynamicScreenSpaceErrorHeightFalloff,
    skipLevelOfDetail: profile.skipLevelOfDetail,
    baseScreenSpaceError: profile.baseScreenSpaceError,
    skipScreenSpaceErrorFactor: profile.skipScreenSpaceErrorFactor,
    skipLevels: profile.skipLevels,
    immediatelyLoadDesiredLevelOfDetail: false,
    loadSiblings: false,
    preloadWhenHidden: profile.preloadWhenHidden,
    preloadFlightDestinations: profile.preloadFlightDestinations,
    cullWithChildrenBounds: true,
    cullRequestsWhileMoving: profile.cullRequestsWhileMoving,
    cullRequestsWhileMovingMultiplier:
      profile.cullRequestsWhileMovingMultiplier,
  };
}

function isTilesetLikePrimitive(primitive) {
  if (!primitive || typeof primitive !== 'object') return false;
  if (typeof primitive.isDestroyed === 'function' && primitive.isDestroyed()) {
    return false;
  }
  return (
    'maximumScreenSpaceError' in primitive ||
    'cacheBytes' in primitive ||
    'skipLevelOfDetail' in primitive
  );
}

/**
 * Apply hardware profile limits directly to a Cesium3DTileset (Google 3D or OSM Buildings).
 * @param {object|null|undefined} tileset
 * @param {ReturnType<typeof getOptimalPerformanceProfile>} [profile]
 */
export function applyTilesetHardwareOptimizations(
  tileset,
  profile = getOptimalPerformanceProfile(),
) {
  if (!tileset || typeof tileset !== 'object') return false;
  if (typeof tileset.isDestroyed === 'function' && tileset.isDestroyed()) {
    return false;
  }

  const opts = getTilesetHardwareOptions(profile);
  const keys = Object.keys(opts);
  for (const key of keys) {
    try {
      tileset[key] = opts[key];
    } catch {
      /* ignore read-only or mock-omitted properties */
    }
  }
  return true;
}

/**
 * Apply hardware profile optimizations to Cesium Viewer, scene passes, and all active 3D Tilesets.
 */
export function applyHardwareOptimizations(viewer, tileset = null) {
  const profile = getOptimalPerformanceProfile();
  if (!viewer?.scene) return profile;

  try {
    viewer.targetFrameRate = profile.targetFrameRate;
    viewer.resolutionScale = profile.resolutionScale;
    if ('useBrowserRecommendedResolution' in viewer) {
      viewer.useBrowserRecommendedResolution =
        profile.useBrowserRecommendedResolution;
    }
    if ('shadows' in viewer) {
      viewer.shadows = profile.shadowsEnabled;
    }

    const scene = viewer.scene;

    if ('msaaSamples' in scene) {
      scene.msaaSamples = profile.msaaSamples;
    }
    if ('highDynamicRange' in scene) {
      scene.highDynamicRange = profile.hdrEnabled;
    }
    if ('sunBloom' in scene && profile.isLowSpec) {
      scene.sunBloom = false;
    }

    if (scene.postProcessStages?.fxaa) {
      scene.postProcessStages.fxaa.enabled = profile.fxaaEnabled;
    }

    if (scene.skyAtmosphere) {
      if ('perFragmentAtmosphere' in scene.skyAtmosphere) {
        scene.skyAtmosphere.perFragmentAtmosphere =
          profile.perFragmentAtmosphere;
      }
    }

    // Optimize globe rendering
    if (scene.globe) {
      scene.globe.tileCacheSize = profile.globeTileCacheSize;
      scene.globe.maximumScreenSpaceError =
        profile.globeMaximumScreenSpaceError;
      scene.globe.showWaterEffect = profile.waterEffectEnabled;
      if ('showGroundAtmosphere' in scene.globe) {
        scene.globe.showGroundAtmosphere = profile.groundAtmosphereEnabled;
      }
      if ('loadingDescendantLimit' in scene.globe) {
        scene.globe.loadingDescendantLimit = profile.isLowSpec ? 10 : 20;
      }
      scene.globe.enableLighting = false;
    }

    // Enable distance fog to cull far-away tiles from downloading & rendering
    if (scene.fog) {
      scene.fog.enabled = true;
      scene.fog.density = profile.fogDensity;
      scene.fog.screenSpaceErrorFactor = profile.fogScreenSpaceErrorFactor;
    }

    // Propagate limits to explicit tileset + any active Cesium3DTileset in scene primitives
    const updatedTilesets = new Set();
    if (tileset && applyTilesetHardwareOptimizations(tileset, profile)) {
      updatedTilesets.add(tileset);
    }

    const primitives = scene.primitives;
    if (
      primitives &&
      typeof primitives.length === 'number' &&
      typeof primitives.get === 'function'
    ) {
      for (let i = 0; i < primitives.length; i += 1) {
        const prim = primitives.get(i);
        if (
          prim &&
          !updatedTilesets.has(prim) &&
          isTilesetLikePrimitive(prim)
        ) {
          if (applyTilesetHardwareOptimizations(prim, profile)) {
            updatedTilesets.add(prim);
          }
        }
      }
    }

    if (typeof scene.requestRender === 'function') {
      scene.requestRender();
    }

    if (
      typeof window !== 'undefined' &&
      typeof window.dispatchEvent === 'function' &&
      typeof CustomEvent === 'function'
    ) {
      window.dispatchEvent(
        new CustomEvent('gev:hardware-profile-changed', { detail: profile }),
      );
    }

    console.info(
      `[HardwareProfile] Applied (${profile.profileTier}): fps=${profile.targetFrameRate}, res=${profile.resolutionScale}, msaa=${profile.msaaSamples}, fxaa=${profile.fxaaEnabled}, tileCache=${Math.round(profile.tileCacheBytes / 1024 / 1024)}MB (+${Math.round(profile.maximumCacheOverflowBytes / 1024 / 1024)}MB), sse=${profile.maximumScreenSpaceError}, tilesets=${updatedTilesets.size}`,
    );
  } catch (err) {
    console.warn('[HardwareProfile] Failed to apply optimizations:', err);
  }

  return profile;
}
