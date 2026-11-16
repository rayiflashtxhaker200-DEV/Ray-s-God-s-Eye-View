import * as Cesium from 'cesium';
import {
  boxDimensionsKm,
  PRODUCTS,
  rankLatest,
  validateBox,
} from './model.js';

export const RECENT_IMAGERY_LAYER_ID = 'recent-imagery';

/** Construct the Recent Imagery presentation layer. */
export function createRecentImageryLayer({
  catalog = null,
  renderer = null,
  thumbnails = null,
} = {}) {
  let viewer = null;
  let initialized = false;
  let enabled = false;
  let toolActive = false;
  let toolHandler = null;
  let searchController = null;
  let box = null;
  let boxSizeKm = null;
  let boxError = null;
  let zoomToFit = false;
  let searching = false;
  let error = null;
  let notice = '';
  let notes = [];
  let mode = 'image';
  let split = 0.5;
  let swapped = false;
  let alpha = 1;
  let sources = { hls: true, viirs: true };
  let showUnavailable = false;
  let allCandidates = [];
  let focusIndex = 0;
  let pins = { a: null, b: null };
  let previewKey = null;
  let previewPending = false;
  let searchSeq = 0;
  const listeners = new Set();

  function buildSnapshot() {
    const visibleCandidates = allCandidates
      .filter((c) => {
        const isOverview = Boolean(PRODUCTS[c.product]?.overview);
        if (isOverview && !sources.viirs) return false;
        if (!isOverview && !sources.hls) return false;
        if (!showUnavailable && c.thumbnail?.status === 'empty') return false;
        return true;
      })
      .map((c) => ({
        ...c,
        pinned: pins.a === c.key ? 'a' : pins.b === c.key ? 'b' : null,
        preview: previewKey === c.key,
        pending: false,
      }));

    const hiddenCount = allCandidates.filter(
      (c) => c.thumbnail?.status === 'empty',
    ).length;

    const clampedFocus = visibleCandidates.length
      ? Math.max(0, Math.min(visibleCandidates.length - 1, focusIndex))
      : 0;
    const focus = visibleCandidates[clampedFocus] || null;
    const ranked = rankLatest(visibleCandidates, {
      truncated: notes.some((n) => /truncated/i.test(n)),
    });
    const recommended = ranked.candidate
      ? { key: ranked.candidate.key, reason: ranked.reason }
      : null;

    const describeSlot = (slotKey) => {
      if (!slotKey) {
        return {
          key: null,
          label: null,
          candidate: null,
          drapable: false,
          sourceOff: false,
        };
      }
      const cand = allCandidates.find((c) => c.key === slotKey) || null;
      const isOverview = cand ? Boolean(PRODUCTS[cand.product]?.overview) : false;
      const sourceOff = cand
        ? isOverview
          ? !sources.viirs
          : !sources.hls
        : false;
      return {
        key: slotKey,
        label: cand ? `${cand.day} · ${PRODUCTS[cand.product]?.name || cand.product}` : slotKey,
        candidate: cand,
        drapable: Boolean(cand && renderer?.getShown?.('a') === slotKey || renderer?.getShown?.('b') === slotKey || cand),
        sourceOff,
      };
    };

    const shownA = renderer?.getShown?.('a') || pins.a || previewKey || null;
    const shownB = mode === 'ab' ? renderer?.getShown?.('b') || pins.b || null : null;
    const swipe =
      mode === 'basemap' && shownA
        ? 'basemap'
        : mode === 'ab' && shownA && shownB
          ? 'ab'
          : 'none';

    return {
      enabled,
      box,
      boxError,
      boxSizeKm,
      searching,
      candidates: visibleCandidates,
      focusIndex: clampedFocus,
      focus,
      recommended,
      mode,
      pins: {
        a: describeSlot(pins.a),
        b: describeSlot(pins.b),
      },
      preview: previewKey
        ? { slot: 'a', key: previewKey, pending: previewPending, label: describeSlot(previewKey).label }
        : { slot: null, key: null, pending: false, label: null },
      shown: { a: shownA, b: shownB, swipe },
      comparison: { active: swipe !== 'none' },
      split,
      swapped,
      alpha,
      sources: { ...sources },
      hiddenCount,
      showUnavailable,
      notes: [...notes],
      notice,
      error,
      zoomToFit,
      toolActive,
      borrowedEsri: false,
      borrowedEsriNote: '',
      readout: focus ? `${focus.day} · ${PRODUCTS[focus.product]?.name || focus.product}` : '',
    };
  }

  function emit(reason = 'state') {
    const snap = buildSnapshot();
    for (const fn of [...listeners]) {
      try {
        fn(snap, reason);
      } catch {
        /* ignore subscriber fault */
      }
    }
  }

  function syncRenderer() {
    if (!renderer || !box) return;
    const aKey = pins.a || previewKey;
    const bKey = mode === 'ab' ? pins.b : null;
    if (aKey) {
      const cand = allCandidates.find((c) => c.key === aKey);
      if (cand) renderer.show({ slot: 'a', candidate: cand, box, alpha });
    } else {
      renderer.clear('a');
    }
    if (bKey) {
      const cand = allCandidates.find((c) => c.key === bKey);
      if (cand) renderer.show({ slot: 'b', candidate: cand, box, alpha });
    } else {
      renderer.clear('b');
    }
  }

  async function runCatalogSearch() {
    if (!box || typeof catalog?.searchHls !== 'function') return;
    searchController?.abort();
    const ac = new AbortController();
    searchController = ac;
    const currentSeq = ++searchSeq;
    searching = true;
    error = null;
    notes = [];
    emit('search-start');
    try {
      const res = await catalog.searchHls({ box, signal: ac.signal });
      if (currentSeq !== searchSeq || ac.signal.aborted) return;
      allCandidates = Array.isArray(res?.candidates) ? res.candidates : [];
      if (res?.truncated) notes.push('Catalog results truncated at limit');
      if (res?.errors?.length) {
        notes.push(...res.errors.map((e) => e.message).filter(Boolean));
      }
      focusIndex = 0;
    } catch (err) {
      if (err?.name === 'AbortError' || currentSeq !== searchSeq) return;
      error = err?.message || 'Imagery search failed';
      allCandidates = [];
    } finally {
      if (currentSeq === searchSeq) {
        searching = false;
        emit('search-done');
      }
    }
  }

  function applyBox(nextBox, refusalOriginBox = null) {
    void refusalOriginBox;
    const check = validateBox(nextBox);
    if (!check.ok) {
      boxError = check.message || 'Invalid box';
      zoomToFit = check.reason === 'too-large';
      emit('box-error');
      return false;
    }
    box = check.box;
    boxSizeKm = check.sizeKm || boxDimensionsKm(check.box);
    boxError = null;
    zoomToFit = false;
    pins = { a: null, b: null };
    previewKey = null;
    renderer?.clear();
    void runCatalogSearch();
    emit('box');
    return true;
  }

  return {
    id: RECENT_IMAGERY_LAYER_ID,
    name: 'Recent Imagery',
    category: 'imagery',
    init(nextViewer) {
      viewer = nextViewer || null;
      renderer?.attachViewer?.(viewer);
      initialized = true;
    },
    async enable() {
      enabled = true;
      emit('enable');
    },
    disable() {
      enabled = false;
      searchController?.abort();
      renderer?.clear();
      emit('disable');
    },
    destroy() {
      searchController?.abort();
      thumbnails?.destroy?.();
      renderer?.destroy?.();
      listeners.clear();
      viewer = null;
      initialized = false;
      enabled = false;
    },
    attachTileset(tileset) {
      renderer?.attachTileset?.(tileset);
    },
    getStatus() {
      return {
        initialized,
        enabled,
        loading: searching,
        count: allCandidates.length,
        error,
      };
    },
    setParams(params = {}) {
      if (params.mode) mode = params.mode;
      if (params.sources) sources = { ...sources, ...params.sources };
      if (Number.isFinite(params.alpha)) {
        alpha = Math.max(0, Math.min(1, Number(params.alpha)));
        renderer?.setAlpha?.(alpha);
      }
      emit('params');
    },
    getSnapshot: buildSnapshot,
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setBox(nextBox) {
      return applyBox(nextBox);
    },
    boxFromPinAt(lon, lat) {
      const la = Number(lat);
      const lo = Number(lon);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        this.reportBoxRefusal('That point cannot anchor a box');
        return false;
      }
      const dLat = 5 / 111;
      const dLon = 5 / Math.max(10, 111 * Math.cos((la * Math.PI) / 180));
      return applyBox({
        west: lo - dLon,
        south: la - dLat,
        east: lo + dLon,
        north: la + dLat,
      });
    },
    useCurrentView(targetViewer = viewer) {
      const scene = targetViewer?.scene;
      const rect = targetViewer?.camera?.computeViewRectangle?.(
        scene?.globe?.ellipsoid,
      );
      if (!rect) {
        this.reportBoxRefusal('Point the camera at the ground to use the view');
        return false;
      }
      return applyBox({
        west: Cesium.Math.toDegrees(rect.west),
        south: Cesium.Math.toDegrees(rect.south),
        east: Cesium.Math.toDegrees(rect.east),
        north: Cesium.Math.toDegrees(rect.north),
      });
    },
    reportBoxRefusal(message, invalidBox = null) {
      boxError = String(message || 'Invalid box');
      zoomToFit = /km wide/i.test(boxError) && invalidBox != null;
      emit('box-error');
    },
    setToolActive(active) {
      toolActive = Boolean(active);
      emit('tool');
    },
    setToolHandler(fn) {
      toolHandler = typeof fn === 'function' ? fn : null;
    },
    clear() {
      searchController?.abort();
      searching = false;
      box = null;
      boxSizeKm = null;
      boxError = null;
      zoomToFit = false;
      allCandidates = [];
      pins = { a: null, b: null };
      previewKey = null;
      renderer?.clear();
      notice = 'Box and images cleared';
      emit('clear');
    },
    setSources(nextSources = {}) {
      sources = { ...sources, ...nextSources };
      emit('sources');
    },
    setMode(nextMode) {
      if (!['image', 'basemap', 'ab'].includes(nextMode)) return;
      mode = nextMode;
      syncRenderer();
      emit('mode');
    },
    preview(key) {
      previewKey = key || null;
      previewPending = false;
      const idx = allCandidates.findIndex((c) => c.key === key);
      if (idx >= 0) focusIndex = idx;
      syncRenderer();
      emit('preview');
    },
    clearPreview() {
      if (!previewKey) return false;
      previewKey = null;
      previewPending = false;
      syncRenderer();
      emit('preview');
      return true;
    },
    setAssignment(slotId, key) {
      if (slotId !== 'a' && slotId !== 'b') return false;
      pins[slotId] = key || null;
      if (key && previewKey === key) previewKey = null;
      syncRenderer();
      emit('assign');
      return Boolean(key);
    },
    toggleAssignment(slotId, key) {
      if (pins[slotId] === key) return this.setAssignment(slotId, null);
      return this.setAssignment(slotId, key);
    },
    swapSides() {
      swapped = !swapped;
      emit('swap');
    },
    setSplit(value) {
      const v = Number(value);
      if (!Number.isFinite(v)) return;
      split = Math.max(0, Math.min(1, v));
      emit('split');
    },
    setAlpha(value) {
      const v = Number(value);
      if (!Number.isFinite(v)) return;
      alpha = Math.max(0, Math.min(1, v));
      renderer?.setAlpha?.(alpha);
      emit('alpha');
    },
    focus(index) {
      focusIndex = Math.max(0, Number(index) || 0);
      emit('focus');
    },
    setVisibleRange(first, last) {
      void first;
      void last;
      if (!thumbnails || !box) return;
      // Optional lazy thumbnail fetch hook
    },
    setShowUnavailable(show) {
      showUnavailable = Boolean(show);
      emit('show-unavailable');
    },
    zoomToFit() {
      if (!box || !viewer?.camera) return;
      viewer.camera.flyTo({
        destination: Cesium.Rectangle.fromDegrees(
          box.west,
          box.south,
          box.east,
          box.north,
        ),
        duration: 1.0,
      });
    },
    cancelPendingSearch() {
      searchController?.abort();
      searching = false;
      emit('search-cancelled');
    },
    cancelTool() {
      toolHandler?.();
    },
  };
}
