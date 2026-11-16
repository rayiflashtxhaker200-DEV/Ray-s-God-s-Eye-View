export function createGhostMapsSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    label: 'S2 Underground GhostMaps',
    async getCatalog({ signal } = {}) {
      const response = await fetchImpl('/api/ghostmaps/catalog', {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`GhostMaps catalog HTTP ${response.status}`);
      }
      return response.json();
    },
    async getFile(id, version, { signal } = {}) {
      const qs = version ? `?v=${encodeURIComponent(version)}` : '';
      const response = await fetchImpl(`/api/ghostmaps/file/${encodeURIComponent(id)}${qs}`, {
        signal,
      });
      if (!response.ok) {
        throw new Error(`GhostMaps file HTTP ${response.status}`);
      }
      return response.arrayBuffer();
    },
  };
}
