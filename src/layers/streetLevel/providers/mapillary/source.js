/** Portable Mapillary coverage source backed by `/api/mapillary/*`. */
export function createMapillarySource({
  token = '',
  fetchImpl = globalThis.fetch?.bind(globalThis),
} = {}) {
  let serverConfigured = null;

  return {
    label: 'Mapillary',
    hasLocalToken: () => Boolean(token),
    async checkStatus({ signal } = {}) {
      if (typeof fetchImpl !== 'function') return { configured: Boolean(token) };
      try {
        const res = await fetchImpl('/api/mapillary/status', { signal });
        if (!res.ok) return { configured: Boolean(token) };
        const data = await res.json();
        serverConfigured = Boolean(data?.configured || token);
        return { configured: serverConfigured };
      } catch {
        return { configured: Boolean(token) };
      }
    },
    isConfigured() {
      return serverConfigured ?? Boolean(token);
    },
    getCoverageTileUrl() {
      return '/api/mapillary/tiles/coverage/{z}/{x}/{y}';
    },
  };
}
