/**
 * Scene Sharing UI Dialog and Toolbar
 */

export function createSceneDialog(title, onClose) {
  const status = { textContent: '' };
  return {
    status,
    text(msg) {},
    close() {
      onClose?.();
    },
    destroy() {},
  };
}

export function mountSceneSharing({ edit, share } = {}) {
  return () => {};
}
