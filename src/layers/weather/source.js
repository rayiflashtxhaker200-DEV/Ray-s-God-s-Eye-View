export function createWeatherSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    label: 'NOAA nowCOAST',
    async getSnapshot({ product = 'radar', signal } = {}) {
      const query = new URLSearchParams({ product: String(product) });
      const response = await fetchImpl(`/api/weather/manifest?${query.toString()}`, {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Weather HTTP ${response.status}`);
      }
      return response.json();
    },
    async getImage({ product, time, size, bbox, signal } = {}) {
      const params = new URLSearchParams({
        product: String(product),
        time: String(time),
      });
      if (size && typeof size === 'object') {
        params.set('size', `${size.width}x${size.height}`);
      } else if (typeof size === 'string') {
        params.set('size', size);
      }
      if (bbox && typeof bbox === 'object') {
        params.set('bbox', `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`);
      }
      const response = await fetchImpl(`/api/weather/image?${params.toString()}`, {
        signal,
      });
      if (!response.ok) {
        throw new Error(`Weather image HTTP ${response.status}`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const rawType = response.headers?.get?.('content-type') || 'image/png';
      return {
        contentType: rawType.split(';')[0].trim().toLowerCase(),
        bytes,
      };
    },
  };
}
