/**
 * Common realtime voice/chat controller mediating between a provider session adapter,
 * action runner, UI store, and subscribers.
 */
export class GevRealtimeController {
  constructor({
    runner,
    createAdapter,
    ui = null,
    signal = null,
    onStop = null,
  } = {}) {
    this.runner = runner;
    this.ui = ui;
    this.signal = signal;
    this.onStop = onStop;
    this.state = 'idle';
    this.destroyed = false;
    this._listeners = new Set();
    this._retainedImageFrame = null;

    const emit = (event) => this._emit(event);
    const runAction = (name, args, options) =>
      this.runner?.(name, args, options);

    this._createHooks = { emit, runAction, ui, signal };
    this.adapter =
      typeof createAdapter === 'function'
        ? createAdapter(this._createHooks)
        : null;

    if (signal) {
      this._onAbort = () => this.destroy();
      signal.addEventListener('abort', this._onAbort, { once: true });
      if (signal.aborted) this.destroy();
    }
  }

  setAdapterFactory(createAdapter) {
    if (this.destroyed || typeof createAdapter !== 'function') return false;
    try {
      this.adapter?.stop?.({ preserveStatus: false });
    } catch {
      /* ignore */
    }
    this.adapter = createAdapter(this._createHooks);
    return true;
  }

  _emit(event) {
    if (!event || typeof event !== 'object') return;
    if (event.type === 'state' && event.state) {
      this.state = event.state;
      this.ui?.update?.('root', { status: event.state });
    }
    if (event.type === 'pointer' && this.ui?.update) {
      this.ui.update('card', { pointer: event.pointer });
    }
    for (const fn of [...this._listeners]) {
      try {
        fn(event);
      } catch {
        /* ignore subscriber fault */
      }
    }
  }

  isActive() {
    return !this.destroyed && !['idle', 'error'].includes(this.state);
  }

  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  async start(options = {}) {
    if (this.destroyed || !this.adapter?.start) return;
    return this.adapter.start(options);
  }

  stop(options = {}) {
    if (this.destroyed) return;
    this.adapter?.stop?.(options);
    this.runner?.resetConversation?.();
    this.onStop?.(options);
    if (!options.preserveStatus) {
      this._emit({ type: 'state', state: 'idle' });
    }
  }

  cancelTurn() {
    return this.adapter?.cancelTurn?.() || false;
  }

  sendText(text) {
    if (this.destroyed) return false;
    return this.adapter?.sendText?.(text) ?? false;
  }

  sendMapEvent(event) {
    if (this.destroyed) return false;
    return this.adapter?.sendMapEvent?.(event) ?? false;
  }

  retainedImageFrame() {
    return this._retainedImageFrame;
  }

  setRetainedImageFrame(frame) {
    this._retainedImageFrame = frame || null;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      this.adapter?.stop?.({ removeUi: true });
    } catch {
      /* ignore */
    }
    this.runner?.dispose?.();
    if (this.signal && this._onAbort) {
      this.signal.removeEventListener('abort', this._onAbort);
    }
    this._listeners.clear();
  }
}

export function createRealtimeController(options) {
  return new GevRealtimeController(options);
}
