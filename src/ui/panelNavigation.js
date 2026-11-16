import { usePanelStore } from './stores/panels.js';
import { applicationPinia } from './vueRuntime.js';

function readStackPanels(stack) {
  if (!stack) return [];
  return [...stack.querySelectorAll(':scope > [data-panel-id]')].map((el) => {
    const id = el.dataset.panelId || el.id;
    const title =
      el
        .querySelector('.panel-title, .pp-header-label')
        ?.textContent?.trim() || id;
    return {
      id,
      available: !el.hidden,
      collapsed: el.classList.contains('collapsed'),
      title,
    };
  });
}

/** Synchronize side panel rails with the panel Pinia store. */
export class PanelNavigation {
  constructor({ ui, stacks = {}, setPanelCollapsed } = {}) {
    this._ui = ui;
    this._stacks = stacks;
    this._setPanelCollapsed = setPanelCollapsed;
    this._pinia = ui?.pinia ?? applicationPinia();
    this._store = usePanelStore(this._pinia);
    this._observers = [];
    this._destroyed = false;
  }

  init() {
    if (this._destroyed) return;
    this._syncAll();
    this._store.connect({
      select: (side, panelId) => this._selectPanel(side, panelId),
    });
    if (typeof MutationObserver === 'function') {
      for (const side of ['left', 'right']) {
        const stack = this._stacks[side];
        if (!stack) continue;
        const observer = new MutationObserver(() => this._syncSide(side));
        observer.observe(stack, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['class', 'hidden'],
        });
        this._observers.push(observer);
      }
    }
  }

  _syncAll() {
    this._syncSide('left');
    this._syncSide('right');
  }

  _syncSide(side) {
    if (this._destroyed) return;
    const panels = readStackPanels(this._stacks[side]);
    this._store.syncSide(side, panels);
  }

  _selectPanel(side, panelId) {
    if (this._destroyed || !panelId) return;
    const stack = this._stacks[side];
    const el = stack?.querySelector?.(`[data-panel-id="${panelId}"]`);
    const isOpen = el ? !el.classList.contains('collapsed') : false;
    this._setPanelCollapsed?.(panelId, isOpen, { explicit: true });
    this._syncSide(side);
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    for (const observer of this._observers) observer.disconnect();
    this._observers = [];
    this._store.connect(null);
  }
}
