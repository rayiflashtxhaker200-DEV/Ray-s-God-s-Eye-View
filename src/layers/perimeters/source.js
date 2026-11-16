export function createWfigsPerimeterSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  async function getSnapshotDetail({ signal } = {}) {
    const response = await fetchImpl('/api/fire-perimeters', {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Fire perimeters HTTP ${response.status}`);
    }
    const payload = await response.json();
    return {
      fetchedAt: payload?.fetchedAt ?? null,
      stale: payload?.stale === true,
      rows: Array.isArray(payload?.rows) ? payload.rows : [],
    };
  }

  return {
    label: 'NIFC WFIGS',
    getSnapshotDetail,
    async getSnapshot({ signal } = {}) {
      const detail = await getSnapshotDetail({ signal });
      return detail.rows;
    },
  };
}
