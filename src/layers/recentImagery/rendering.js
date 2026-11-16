/**
 * Manages draped imagery overlays (slots A and B, plus preview) on Cesium scenes/tilesets.
 */
import * as Cesium from 'cesium';

export function createRecentImageryRenderer({
  requestRender = () => {},
  tileTemplate = null,
  credit = 'NASA GIBS',
} = {}) {
  let viewer = null;
  let tileset = null;
  let alpha = 1;
  const active = new Map();

  function applyAlpha() {
    for (const entry of active.values()) {
      if (entry.layer) entry.layer.alpha = alpha;
    }
    requestRender();
  }

  return {
    attachViewer(nextViewer) {
      viewer = nextViewer || null;
    },
    attachTileset(nextTileset) {
      tileset = nextTileset || null;
      void tileset;
    },
    show({ slot = 'a', candidate, box, alpha: nextAlpha } = {}) {
      if (!candidate || !box) return false;
      if (Number.isFinite(nextAlpha)) alpha = nextAlpha;
      this.clear(slot);

      let layer = null;
      if (viewer?.imageryLayers && typeof tileTemplate === 'function') {
        try {
          const url = tileTemplate({ product: candidate.product, day: candidate.day });
          if (url) {
            const provider = new Cesium.UrlTemplateImageryProvider({
              url,
              credit: String(credit || 'NASA GIBS'),
              rectangle: Cesium.Rectangle.fromDegrees(
                box.west,
                box.south,
                box.east,
                box.north,
              ),
              maximumLevel: candidate.product === 'VIIRS' ? 9 : 14,
            });
            layer = viewer.imageryLayers.addImageryProvider(provider);
            layer.alpha = alpha;
          }
        } catch {
          layer = null;
        }
      }
      active.set(slot, { key: candidate.key, layer, box });
      requestRender();
      return true;
    },
    clear(slot) {
      if (slot == null) {
        for (const s of [...active.keys()]) this.clear(s);
        return;
      }
      const existing = active.get(slot);
      if (existing?.layer && viewer?.imageryLayers) {
        try {
          viewer.imageryLayers.remove(existing.layer, true);
        } catch {
          /* ignore */
        }
      }
      active.delete(slot);
      requestRender();
    },
    setAlpha(nextAlpha) {
      if (!Number.isFinite(nextAlpha)) return;
      alpha = Math.max(0, Math.min(1, Number(nextAlpha)));
      applyAlpha();
    },
    getShown(slot) {
      return active.get(slot)?.key || null;
    },
    destroy() {
      this.clear();
      viewer = null;
      tileset = null;
    },
  };
}
