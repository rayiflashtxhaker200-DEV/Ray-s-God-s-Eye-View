export function createWorkTrace() {
  return {
    callerStart: null,
    status: 'pending',
    rendererStatus: null,
    samplerStatus: null,
    completedAt: null,
    slices: [],
  };
}

export function recordWorkSlice(
  trace,
  name,
  startMs,
  endMs = typeof performance !== 'undefined' ? performance.now() : Date.now(),
) {
  if (!trace || !Array.isArray(trace.slices) || !Number.isFinite(startMs)) return;
  trace.slices.push({
    name,
    startMs,
    endMs,
    durationMs: Math.max(0, endMs - startMs),
  });
}

export function phaseTiming(_phase, _startMs, _detail = {}, _channel = 'annotations') {
  // Structured timing hook for development telemetry.
}
