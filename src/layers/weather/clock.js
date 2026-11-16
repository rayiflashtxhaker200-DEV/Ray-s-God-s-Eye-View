export function createWeatherClock({ playIntervalMs = 1_500 } = {}) {
  let mode = 'latest';
  let target = null;
  let playing = false;
  let timer = null;
  const products = new Map();
  const listeners = new Set();

  function buildTimeline() {
    const ticks = new Set();
    for (const product of products.values()) {
      for (const time of product.times || []) {
        if (time) ticks.add(time);
      }
    }
    return [...ticks].sort();
  }

  function stateSnapshot() {
    const timeline = buildTimeline();
    const resolvedTarget = mode === 'latest'
      ? timeline.at(-1) || null
      : target || timeline.at(-1) || null;
    const productStates = [...products.entries()].map(([id, info]) => {
      const times = info.times || [];
      let selected = times.at(-1) || null;
      if (mode === 'history' && resolvedTarget) {
        const targetMs = Date.parse(resolvedTarget);
        const maxGapMs = (info.maxGapMinutes || 30) * 60_000;
        let best = null;
        let bestDiff = Infinity;
        for (const tick of times) {
          const diff = Math.abs(Date.parse(tick) - targetMs);
          if (diff <= maxGapMs && diff < bestDiff) {
            best = tick;
            bestDiff = diff;
          }
        }
        selected = best;
      }
      return {
        id,
        selected,
        shown: info.shown ?? selected,
      };
    });
    return {
      mode,
      target: resolvedTarget,
      playing,
      timeline,
      products: productStates,
    };
  }

  function emit() {
    for (const listener of listeners) {
      try {
        listener(stateSnapshot());
      } catch {
        /* listener best effort */
      }
    }
  }

  function stopPlay() {
    if (timer) clearInterval(timer);
    timer = null;
    playing = false;
  }

  function step(direction = 1) {
    const timeline = buildTimeline();
    if (!timeline.length) return;
    if (mode === 'latest') {
      mode = 'history';
      target = direction < 0 ? timeline[Math.max(0, timeline.length - 2)] : timeline.at(-1);
    } else {
      const idx = timeline.indexOf(target);
      const nextIdx = Math.max(0, Math.min(timeline.length - 1, (idx === -1 ? timeline.length - 1 : idx) + direction));
      target = timeline[nextIdx];
    }
    emit();
  }

  return {
    getState: stateSnapshot,
    subscribe(listener) {
      if (typeof listener === 'function') listeners.add(listener);
      return () => listeners.delete(listener);
    },
    registerProduct(id, info) {
      if (!info) products.delete(id);
      else products.set(id, info);
      emit();
    },
    setTarget(tick) {
      mode = 'history';
      target = tick;
      emit();
    },
    latest() {
      stopPlay();
      mode = 'latest';
      target = null;
      emit();
    },
    step,
    togglePlay() {
      if (playing) {
        stopPlay();
        emit();
        return;
      }
      const timeline = buildTimeline();
      if (timeline.length < 2) return;
      playing = true;
      if (mode === 'latest') {
        mode = 'history';
        target = timeline[0];
      }
      timer = setInterval(() => {
        const ticks = buildTimeline();
        if (!ticks.length) return;
        const idx = ticks.indexOf(target);
        const nextIdx = idx + 1 >= ticks.length ? 0 : idx + 1;
        target = ticks[nextIdx];
        emit();
      }, playIntervalMs);
      emit();
    },
    destroy() {
      stopPlay();
      products.clear();
      listeners.clear();
    },
  };
}
