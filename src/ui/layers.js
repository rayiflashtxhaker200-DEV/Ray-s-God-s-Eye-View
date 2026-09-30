/**
 * Layer Panel UI Controller
 */

export { bindClearLayersControl } from './clearLayersControl.js';

export class LayerPanel {
  constructor(options = {}) {
    this.options = options;
    this.container = null;
  }

  mount(container) {
    this.container = container;
  }

  _refreshTogglePanel() {}

  destroy() {
    this.container = null;
  }
}
