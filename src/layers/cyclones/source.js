export function createCycloneSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    label: 'NOAA NHC / CPHC',
    async getSnapshot({ signal } = {}) {
      const response = await fetchImpl('/api/cyclones', {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Cyclones HTTP ${response.status}`);
      }
      return response.json();
    },
  };
}
