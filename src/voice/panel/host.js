import { createPanelActionObserver } from './actionObserver.js';

/**
 * Coordinates the optional Voice Settings/Preview panel host lifecycle and action observations.
 */
export function createVoicePanelHost({
  storage = null,
  clock = () => Date.now(),
  readCockpitState = () => null,
} = {}) {
  void storage;
  void clock;
  let observer = null;
  let destroyed = false;

  return {
    wrapAction({ runAction, onObservation, signal }) {
      observer?.dispose?.();
      observer = createPanelActionObserver({
        runAction,
        onObservation,
        signal,
      });
      return observer.runAction;
    },
    captureOperation() {
      return {
        pendingCount: observer?.pendingCount ?? 0,
        cockpit: readCockpitState?.() || null,
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.dispose?.();
      observer = null;
    },
  };
}
