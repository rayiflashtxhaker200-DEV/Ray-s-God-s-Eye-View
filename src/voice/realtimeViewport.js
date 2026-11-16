/**
 * Captures a downscaled JPEG data URL of the Cesium WebGL canvas for multimodal voice context.
 */
export async function captureViewportImage({
  viewer = null,
  canvas = viewer?.scene?.canvas || globalThis.document?.querySelector?.('canvas'),
  maxWidth = 1024,
  quality = 0.72,
} = {}) {
  if (!canvas || typeof canvas.width !== 'number' || !canvas.width || !canvas.height) {
    return null;
  }
  try {
    viewer?.scene?.render?.();
    const scale = Math.min(1, maxWidth / Math.max(1, canvas.width));
    const width = Math.max(1, Math.round(canvas.width * scale));
    const height = Math.max(1, Math.round(canvas.height * scale));
    const offscreen = globalThis.document?.createElement?.('canvas');
    if (!offscreen) return null;
    offscreen.width = width;
    offscreen.height = height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0, width, height);
    return offscreen.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}
