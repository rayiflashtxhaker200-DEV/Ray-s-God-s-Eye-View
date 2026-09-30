/**
 * UI Lifetime and Cleanup Registry
 */

export class UiLifetime {
  constructor() {
    this._cleanups = [];
  }

  add(fn) {
    if (typeof fn === 'function') {
      this._cleanups.push(fn);
    }
  }

  dispose() {
    while (this._cleanups.length) {
      try {
        this._cleanups.pop()();
      } catch (err) {
        console.warn('[UiLifetime] Cleanup error:', err);
      }
    }
  }
}
