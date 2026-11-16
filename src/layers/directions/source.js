export function createDirectionsSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    label: 'OSM routing',
    async getRoute({ profile = 'car', coords, steps = true, signal } = {}) {
      if (!coords) throw new TypeError('Route coords are required');
      const query = new URLSearchParams({
        profile: String(profile),
        coords: String(coords),
        steps: steps ? '1' : '0',
      });
      const response = await fetchImpl(`/api/route?${query.toString()}`, {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Route HTTP ${response.status}`);
      }
      return response.json();
    },
  };
}
