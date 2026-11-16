export function createOsmFeatureSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
  endpoint = '/api/overpass/features',
} = {}) {
  return {
    async search({ preset, bbox, mode = 'features', limit = 500 }, { signal } = {}) {
      signal?.throwIfAborted?.();
      const params = new URLSearchParams({
        preset: String(preset || ''),
        bbox: Array.isArray(bbox) ? bbox.join(',') : String(bbox || ''),
        mode,
        limit: String(limit),
      });
      const response = await fetchImpl(`${endpoint}?${params.toString()}`, {
        signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          code: data?.code || null,
          error: data?.error || `HTTP ${response.status}`,
        };
      }
      return data || { ok: true, elements: [] };
    },
  };
}
