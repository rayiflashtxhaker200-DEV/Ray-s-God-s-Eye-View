/**
 * Surface Keyboard Interaction Manager
 */

export function createSurfaceKeyboard({
  root,
  documentRef = typeof document !== 'undefined' ? document : null,
  isActive = () => true,
  onEscape,
} = {}) {
  const handler = (e) => {
    if (e.key === 'Escape' && isActive()) {
      onEscape?.();
    }
  };

  return {
    activate() {
      documentRef?.addEventListener?.('keydown', handler);
    },
    deactivate() {
      documentRef?.removeEventListener?.('keydown', handler);
    },
    destroy() {
      documentRef?.removeEventListener?.('keydown', handler);
    },
  };
}
