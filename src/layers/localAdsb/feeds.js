export function createLocalReceiverFeeds({
  fetchImpl = (...args) => globalThis.fetch(...args),
  pollIntervalMs = 2_000,
} = {}) {
  let state = {
    configured: false,
    polling: false,
    feeds: [],
    records: [],
    generatedAt: null,
    error: null,
  };
  let timer = null;
  let controller = null;
  const listeners = new Set();

  const notify = () => {
    for (const listener of listeners) {
      try {
        listener(state);
      } catch {
        /* listener best effort */
      }
    }
  };

  async function refresh() {
    controller?.abort();
    const current = new AbortController();
    controller = current;
    try {
      const response = await fetchImpl('/api/local-receivers/aircraft', {
        signal: current.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Local receivers HTTP ${response.status}`);
      const payload = await response.json();
      if (current.signal.aborted || controller !== current) return state;
      state = {
        ...state,
        configured: payload?.configured === true,
        feeds: Array.isArray(payload?.feeds) ? payload.feeds : [],
        records: Array.isArray(payload?.records) ? payload.records : [],
        generatedAt: payload?.generatedAt ?? Date.now(),
        error: null,
      };
      notify();
      return state;
    } catch (error) {
      if (current.signal.aborted || controller !== current) return state;
      state = {
        ...state,
        error: error?.message || 'Local receiver feeds unavailable',
      };
      notify();
      return state;
    }
  }

  function start() {
    if (state.polling) return;
    state = { ...state, polling: true };
    notify();
    void refresh();
    timer = setInterval(() => void refresh(), pollIntervalMs);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    controller?.abort();
    controller = null;
    if (state.polling) {
      state = { ...state, polling: false };
      notify();
    }
  }

  return {
    start,
    stop,
    refresh,
    getState: () => ({ ...state, feeds: [...state.feeds], records: [...state.records] }),
    getSnapshot: () => ({ ...state, feeds: [...state.feeds], records: [...state.records] }),
    subscribe(listener) {
      if (typeof listener === 'function') listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
