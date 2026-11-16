export function createEventPackSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    async getEvent(id, { signal } = {}) {
      if (id === 'bhote-koshi-2026') {
        const mod = await import('../data/bhoteKoshiEvent.js');
        if (typeof mod.getBhoteKoshiEventRecords === 'function') {
          return mod.getBhoteKoshiEventRecords();
        }
        return mod.BHOTE_KOSHI_EVIDENCE || [];
      }
      const response = await fetchImpl(`/api/events/${encodeURIComponent(id)}`, {
        signal,
      });
      if (!response?.ok) return [];
      return response.json();
    },
  };
}
