/** Create a transient status toast controller backed by #toast. */
export function createToast({
  durationMs = 2000,
  documentRef = globalThis.document,
} = {}) {
  let timer = null;

  function hide() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const el = documentRef?.getElementById?.('toast');
    el?.classList?.remove('visible');
  }

  return {
    show(message) {
      const el = documentRef?.getElementById?.('toast');
      if (!el) return;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      el.textContent = String(message ?? '');
      el.classList.add('visible');
      timer = setTimeout(() => {
        timer = null;
        el.classList.remove('visible');
      }, durationMs);
    },
    cancel: hide,
    destroy: hide,
  };
}
