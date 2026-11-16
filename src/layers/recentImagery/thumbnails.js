/** Loads and caches thumbnail object URLs for candidate imagery days. */
export function createThumbnailLoader({ requestThumbnail } = {}) {
  const controllers = new Set();
  const urls = new Set();

  return {
    async load(candidate, box, signal) {
      if (!candidate || !box || typeof requestThumbnail !== 'function') {
        return { status: 'error', objectUrl: null };
      }
      const ac = new AbortController();
      controllers.add(ac);
      const onAbort = () => ac.abort();
      signal?.addEventListener?.('abort', onAbort, { once: true });
      try {
        const result = await requestThumbnail({
          product: candidate.product,
          day: candidate.day,
          box,
          width: 240,
          height: 160,
          signal: ac.signal,
        });
        if (!result?.bytes?.byteLength) return { status: 'empty', objectUrl: null };
        const blob = new Blob([result.bytes], {
          type: result.contentType || 'image/png',
        });
        const objectUrl =
          typeof URL?.createObjectURL === 'function'
            ? URL.createObjectURL(blob)
            : null;
        if (objectUrl) urls.add(objectUrl);
        return {
          status: 'present',
          objectUrl,
          acquisitionTime: candidate.timeRange?.start || null,
        };
      } catch (error) {
        if (error?.name === 'AbortError') return { status: 'aborted', objectUrl: null };
        return { status: 'error', objectUrl: null };
      } finally {
        signal?.removeEventListener?.('abort', onAbort);
        controllers.delete(ac);
      }
    },
    cancelAll() {
      for (const ac of controllers) ac.abort();
      controllers.clear();
    },
    destroy() {
      this.cancelAll();
      if (typeof URL?.revokeObjectURL === 'function') {
        for (const url of urls) URL.revokeObjectURL(url);
      }
      urls.clear();
    },
  };
}
