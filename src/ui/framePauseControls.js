import { t } from '../i18n/index.js';

const pausedViewers = new WeakSet();

/** Return true while frame rendering is explicitly paused for `viewer`. */
export function isFramesPausedForViewer(viewer) {
  return Boolean(viewer && typeof viewer === 'object' && pausedViewers.has(viewer));
}

/**
 * Coordinates the top-bar Pause/Resume Frames toggle so the user can freeze
 * Cesium rendering, simulation clock advancement, post-process shader timers,
 * and cockpit cloud passes to inspect a single frame without churn.
 */
export function createFramePauseControls({
  viewer,
  button = null,
  visualEffects = null,
  cockpitCloudEffects = null,
  requestRender = null,
  isHidden = null,
  showToast = () => {},
  documentRef = globalThis.document,
} = {}) {
  let paused = false;
  let destroyed = false;
  let savedShouldAnimate = null;
  let cloudEffects = cockpitCloudEffects;

  function syncButton() {
    if (!button) return;
    button.classList?.toggle('active', paused);
    button.setAttribute?.('aria-pressed', String(paused));
    const label = paused ? t('Resume frames') : t('Pause frames');
    const title = paused
      ? t('Resume frames')
      : t('Pause rendering to inspect current frame');
    button.setAttribute?.('aria-label', label);
    button.setAttribute?.('title', title);
    const icon = button.querySelector?.('.material-symbols-outlined');
    if (icon) {
      icon.textContent = paused ? 'play_arrow' : 'pause';
    }
  }

  function readHidden() {
    if (typeof isHidden === 'function') return Boolean(isHidden());
    return Boolean(documentRef?.hidden);
  }

  function setPaused(nextPaused, { silent = false } = {}) {
    if (destroyed) return paused;
    const target = Boolean(nextPaused);
    if (target === paused) {
      syncButton();
      return paused;
    }

    paused = target;

    if (target) {
      if (viewer && typeof viewer === 'object') {
        pausedViewers.add(viewer);
        if (viewer.clock && typeof viewer.clock.shouldAnimate === 'boolean') {
          savedShouldAnimate = viewer.clock.shouldAnimate;
          viewer.clock.shouldAnimate = false;
        }
        viewer.useDefaultRenderLoop = false;
      }
      visualEffects?.setPaused?.(true);
      cloudEffects?.setSuspended?.(true);
      documentRef?.body?.classList?.add('frames-paused');
      syncButton();
      if (!silent) showToast(t('Frames paused'));
      return paused;
    }

    if (viewer && typeof viewer === 'object') {
      pausedViewers.delete(viewer);
      if (viewer.clock && savedShouldAnimate !== null) {
        viewer.clock.shouldAnimate = savedShouldAnimate;
      }
    }
    savedShouldAnimate = null;

    const hidden = readHidden();
    if (viewer && typeof viewer === 'object' && !hidden) {
      viewer.useDefaultRenderLoop = true;
    }
    cloudEffects?.setSuspended?.(hidden);
    visualEffects?.setPaused?.(false);
    documentRef?.body?.classList?.remove('frames-paused');
    syncButton();

    if (!hidden) {
      requestRender?.('frames-resume');
      viewer?.scene?.requestRender?.();
    }
    if (!silent) showToast(t('Frames resumed'));
    return paused;
  }

  function toggle() {
    return setPaused(!paused);
  }

  function onButtonClick() {
    toggle();
  }

  if (button?.addEventListener) {
    button.addEventListener('click', onButtonClick);
  }
  syncButton();

  return {
    isPaused: () => paused,
    setPaused,
    toggle,
    attachCloudEffects(nextCloudEffects) {
      cloudEffects = nextCloudEffects || null;
      if (paused) {
        cloudEffects?.setSuspended?.(true);
      }
    },
    syncButton,
    dispose() {
      if (destroyed) return;
      if (paused) {
        setPaused(false, { silent: true });
      }
      destroyed = true;
      button?.removeEventListener?.('click', onButtonClick);
      if (viewer && typeof viewer === 'object') {
        pausedViewers.delete(viewer);
      }
      documentRef?.body?.classList?.remove('frames-paused');
    },
  };
}
