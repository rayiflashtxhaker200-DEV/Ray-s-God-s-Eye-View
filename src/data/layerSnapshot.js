export const SNAPSHOT_FEED_STATES = Object.freeze([
  'nominal',
  'loading',
  'partial',
  'stale',
  'degraded',
  'fallback',
  'unavailable',
]);

const STATE_SEVERITY = new Map([
  ['unavailable', 6],
  ['loading', 5],
  ['partial', 4],
  ['stale', 3],
  ['degraded', 2],
  ['fallback', 1],
  ['nominal', 0],
]);

function inferFeedState(layer, now) {
  if (
    typeof layer?.feedState === 'string' &&
    STATE_SEVERITY.has(layer.feedState)
  ) {
    return layer.feedState;
  }
  const stats = layer?.stats || {};
  if (stats.loading) return 'loading';
  if (stats.unavailable) return 'unavailable';
  if (stats.partial) return 'partial';
  if (stats.stale) return 'stale';
  if (stats.fallback) return 'fallback';
  if (stats.degraded || stats.error) return 'degraded';
  if (
    Number.isFinite(stats.staleAfterMs) &&
    Number.isFinite(stats.lastUpdate) &&
    now - stats.lastUpdate > stats.staleAfterMs
  ) {
    return 'stale';
  }
  return 'nominal';
}

export function layerSnapshot(layer = {}, { now = Date.now() } = {}) {
  const stats = layer?.stats || {};
  return {
    id: layer?.id ?? null,
    name: layer?.name ?? null,
    enabled: Boolean(layer?.enabled),
    feedState: inferFeedState(layer, now),
    source: stats.source ?? layer?.source ?? null,
    count: Number.isFinite(stats.count)
      ? stats.count
      : Number.isFinite(layer?.count)
        ? layer.count
        : 0,
    lastUpdate: stats.lastUpdate ?? layer?.lastUpdate ?? null,
    error: stats.error ?? layer?.error ?? null,
  };
}

export function layerSnapshots(layers = [], options = {}) {
  if (!Array.isArray(layers)) return [];
  return layers.map((layer) => layerSnapshot(layer, options));
}

export function feedProvenanceEnvelope(snapshots = [], options = {}) {
  const list = Array.isArray(snapshots)
    ? snapshots.map((item) =>
        item && 'feedState' in item ? item : layerSnapshot(item, options),
      )
    : [];
  if (!list.length) {
    return { overall: null, layers: [] };
  }
  let overall = 'nominal';
  let bestScore = 0;
  for (const item of list) {
    const score = STATE_SEVERITY.get(item.feedState) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      overall = item.feedState;
    }
  }
  return {
    overall,
    layers: list.map((item) => ({
      id: item.id,
      name: item.name,
      feedState: item.feedState,
      source: item.source,
      count: item.count,
      lastUpdate: item.lastUpdate,
    })),
  };
}

export function provenanceTag(feedProvenance) {
  const overall = feedProvenance?.overall;
  if (!overall || overall === 'nominal') return null;
  const layers = Array.isArray(feedProvenance?.layers)
    ? feedProvenance.layers
    : [];
  const matching = layers.filter((layer) => layer.feedState === overall);
  const sourceList = matching.length
    ? matching
    : layers.filter((layer) => layer.feedState && layer.feedState !== 'nominal');
  const names = sourceList
    .map((layer) => layer.name || layer.id)
    .filter(Boolean);
  return { state: overall, names };
}

export function provenanceLine(
  text,
  provenance,
  formatState = (state) => String(state || '').toUpperCase(),
  formatName = (name) => String(name || ''),
) {
  const tag =
    provenance && typeof provenance === 'object' && 'state' in provenance
      ? provenance
      : provenanceTag(provenance);
  const base = String(text || '').trim();
  if (!tag || !tag.state || tag.state === 'nominal') return base;
  const stateLabel = formatState(tag.state);
  const names = Array.isArray(tag.names)
    ? tag.names.map(formatName).filter(Boolean)
    : [];
  const suffix = names.length ? `${stateLabel} (${names.join(', ')})` : stateLabel;
  return base ? `${base} · ${suffix}` : suffix;
}

export function hudSummaryMatchesProvenance(data, feedProvenance) {
  const overall = feedProvenance?.overall ?? null;
  if (!overall) return true;
  if (overall === 'nominal') {
    return data?.feedState == null || data.feedState === 'nominal';
  }
  return data?.feedState === overall;
}
