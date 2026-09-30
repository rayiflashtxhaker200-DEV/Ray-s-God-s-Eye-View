/**
 * World Focus Coordination
 */

export const WORLD_FOCUS_REQUEST_EVENT = 'gods-eye:world-focus-request';

export function requestWorldFocus(detail) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(WORLD_FOCUS_REQUEST_EVENT, { detail })
    );
  }
}
