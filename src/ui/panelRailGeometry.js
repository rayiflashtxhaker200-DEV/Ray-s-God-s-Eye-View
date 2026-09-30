/**
 * Panel Rail Geometry Layout Calculation
 */

export function resolveHudRailLayout({
  viewportHeight = 1000,
  panelHeight = 200,
  laneLeft = 0,
  laneRight = 400,
  baseTop = 0,
  baseBottom = viewportHeight,
  gap = 12,
  align = 'center',
  obstacles = [],
} = {}) {
  let safeTop = baseTop;
  let safeBottom = baseBottom;

  const mid = (baseTop + baseBottom) / 2;

  for (const obs of obstacles) {
    if (!obs) continue;
    // Check horizontal overlap with the lane
    const overlaps = obs.left < laneRight && obs.right > laneLeft;
    if (!overlaps) continue;

    if (obs.bottom <= mid) {
      safeTop = Math.max(safeTop, obs.bottom + gap);
    } else if (obs.top >= mid) {
      safeBottom = Math.min(safeBottom, obs.top - gap);
    }
  }

  const maxHeight = Math.max(0, safeBottom - safeTop);
  const constrained = panelHeight > maxHeight;

  let top = safeTop;
  if (!constrained) {
    if (align === 'start') {
      top = safeTop;
    } else if (align === 'end') {
      top = safeBottom - panelHeight;
    } else {
      top = safeTop + (maxHeight - panelHeight) / 2;
    }
  }

  return {
    top,
    maxHeight,
    safeTop,
    safeBottom,
    constrained,
  };
}
