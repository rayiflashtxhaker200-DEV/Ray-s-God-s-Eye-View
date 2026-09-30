/**
 * Context Mode Controls
 */

export class ContextControls {
  constructor(options = {}) {
    this.options = options;
    this._contextModeGeneration = 0;
  }

  stop() {
    this._contextModeGeneration++;
  }

  destroy() {
    this.stop();
  }
}
