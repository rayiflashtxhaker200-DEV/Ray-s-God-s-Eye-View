export function createNominatimOutlineClient({
  fetchImpl = (...args) => globalThis.fetch(...args),
  endpoint = '/api/nominatim/outline',
} = {}) {
  return {
    async lookup(params = {}, { signal } = {}) {
      signal?.throwIfAborted?.();
      const query = new URLSearchParams();
      if (params.query) query.set('q', String(params.query));
      if (params.kind) query.set('kind', String(params.kind));
      if (Number.isFinite(params.lat)) query.set('lat', String(params.lat));
      if (Number.isFinite(params.lon)) query.set('lon', String(params.lon));
      try {
        const response = await fetchImpl(`${endpoint}?${query.toString()}`, {
          signal,
        });
        if (!response || response.status === 404) return null;
        if (response.status === 429) {
          const retryAfter = Number(response.headers?.get?.('Retry-After'));
          return {
            rateLimited: true,
            retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : 5000,
          };
        }
        if (!response.ok) return undefined;
        const data = await response.json();
        return data && Array.isArray(data.polygons) ? data : null;
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        return undefined;
      }
    },
  };
}
