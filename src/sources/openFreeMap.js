export function createOpenFreeMapSource({
  selectDecoded = (decoded) => decoded,
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    selectDecoded,
    async fetchBounds() {
      return { tiles: [], partial: false, loadedTiles: [] };
    },
    fetchImpl,
  };
}
