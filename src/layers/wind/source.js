export function createWindSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    label: 'NOAA GFS / ECMWF IFS',
    async getSnapshot({ model = 'gfs', overlay = 'none', signal } = {}) {
      const query = new URLSearchParams({
        model: String(model),
        ...(overlay && overlay !== 'none' ? { overlay: String(overlay) } : {}),
      });
      const manifestResponse = await fetchImpl(`/api/wind/manifest?${query.toString()}`, {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (!manifestResponse.ok) {
        throw new Error(`Wind manifest HTTP ${manifestResponse.status}`);
      }
      const manifest = await manifestResponse.json();
      if (manifest?.unavailable || !manifest?.gridUrl) {
        return manifest;
      }
      const gridResponse = await fetchImpl(manifest.gridUrl, { signal });
      if (!gridResponse.ok) {
        throw new Error(`Wind grid HTTP ${gridResponse.status}`);
      }
      const buffer = await gridResponse.arrayBuffer();
      const count = (manifest.grid?.nx || 0) * (manifest.grid?.ny || 0);
      if (!count || buffer.byteLength < count * 8) {
        throw new Error('Invalid wind grid payload');
      }
      const floats = new Float32Array(buffer);
      const u = floats.subarray(0, count);
      const v = floats.subarray(count, count * 2);
      const scalar =
        floats.length >= count * 3 ? floats.subarray(count * 2, count * 3) : null;
      return {
        ...manifest,
        u,
        v,
        ...(scalar ? { scalarData: scalar } : {}),
      };
    },
  };
}
