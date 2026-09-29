import { getOptimalPerformanceProfile } from '../hardwareProfile.js';

function clean(value) {
  return typeof value === 'string' && value.trim().length ? value.trim() : null;
}

/** Route Google 3D tile loading based on provided credentials. */
export async function selectMapStartupRoute({
  googleApiKey,
  cesiumToken,
} = {}) {
  const googleKey = clean(googleApiKey);
  const ionToken = clean(cesiumToken);
  if (googleKey) return 'google-direct';
  if (ionToken) return 'google-ion';
  return 'osm';
}

/**
 * Load Google 3D Tiles, falling back from direct to Ion to OSM on failure.
 * Retains errors encountered along the way.
 */
export async function loadPhotorealisticTileset(
  Cesium,
  { googleApiKey, cesiumToken } = {},
) {
  const googleKey = clean(googleApiKey);
  const ionToken = clean(cesiumToken);
  const errors = [];

  const attempts = [];
  if (googleKey) attempts.push({ route: 'google-direct', googleKey });
  if (ionToken) attempts.push({ route: 'google-ion', googleKey: undefined });

  for (const attempt of attempts) {
    try {
      const tileset = attempt.googleKey
        ? await createGoogleDirectTileset(Cesium, attempt.googleKey)
        : await createGoogleIonTileset(Cesium, ionToken);
      return { tileset, route: attempt.route, errors };
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  return { tileset: null, route: 'osm', errors };
}

/** Pass credentials to the source with low-spec hardware optimization defaults. */
export function createGoogleDirectTileset(Cesium, key, options = {}) {
  key = clean(key);
  if (!key) throw new Error('Google 3D requires an explicit browser key');
  const profile = getOptimalPerformanceProfile();
  return Cesium.createGooglePhotorealistic3DTileset({
    key,
    onlyUsingWithGoogleGeocoder: true,
    cacheBytes: profile.tileCacheBytes,
    maximumCacheOverflowBytes: profile.maximumCacheOverflowBytes,
    maximumScreenSpaceError: profile.maximumScreenSpaceError,
    skipLevelOfDetail: profile.isLowSpec,
    cullWithChildrenBounds: profile.isLowSpec,
    ...options,
  });
}

export async function createGoogleIonTileset(
  Cesium,
  accessToken,
  { signal, ...options } = {},
) {
  accessToken = clean(accessToken);
  if (!accessToken)
    throw new Error('Google 3D through ion requires an explicit token');
  signal?.throwIfAborted();
  const resource = await Cesium.IonResource.fromAssetId(2275207, {
    accessToken,
  });
  signal?.throwIfAborted();
  const profile = getOptimalPerformanceProfile();
  return Cesium.Cesium3DTileset.fromUrl(resource, {
    cacheBytes: profile.tileCacheBytes,
    maximumCacheOverflowBytes: profile.maximumCacheOverflowBytes,
    maximumScreenSpaceError: profile.maximumScreenSpaceError,
    skipLevelOfDetail: profile.isLowSpec,
    cullWithChildrenBounds: profile.isLowSpec,
    enableCollision: true,
    ...options,
  });
}
