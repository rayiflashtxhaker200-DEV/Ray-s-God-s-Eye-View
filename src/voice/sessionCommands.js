import { createVoiceControl } from './control.js';
import { bindChatControl } from './chatControl.js';
import { GevRealtimeController } from './realtimeController.js';

/**
 * Bind voice UI control, chat controller, and realtime session adapter together.
 */
export function createVoiceCommands({
  runner,
  createSession,
  createController = null,
  createControl = createVoiceControl,
  createCard = null,
  panelHost = null,
  nativePanelProvider = null,
  ui: suppliedUi = null,
  signal = null,
  dataManager = null,
  pointer = null,
  referents = null,
  viewer = null,
  styleManager = null,
  onStart = null,
  onStop = null,
} = {}) {
  void createCard;
  void nativePanelProvider;
  void viewer;
  void styleManager;

  const ui = suppliedUi || createControl({ panel: Boolean(panelHost) });

  const session =
    typeof createController === 'function'
      ? createController({
          runner,
          createSession,
          ui,
          signal,
        })
      : new GevRealtimeController({
          runner,
          ui,
          signal,
          onStop: () => {
            pointer?.clear?.();
            referents?.clear?.();
            onStop?.();
          },
          createAdapter: (hooks) => createSession?.(hooks),
        });

  const chatControl = ui?.panel
    ? bindChatControl({
        ui,
        session,
        dataManager,
        onOpen: () => onStart?.(),
      })
    : null;

  const offButton = ui?.on?.('button', () => {
    if (session.isActive()) session.stop();
    else void session.start();
  });

  const destroy = () => {
    offButton?.();
    chatControl?.destroy?.();
    session.destroy?.();
    panelHost?.destroy?.();
    ui?.remove?.();
  };

  if (signal) {
    signal.addEventListener('abort', destroy, { once: true });
    if (signal.aborted) destroy();
  }

  return {
    ui,
    session,
    runner,
    signal,
    start: (opts) => session.start(opts),
    stop: (opts) => session.stop(opts),
    sendText: (text) => session.sendText(text),
    sendMapEvent: (event) => session.sendMapEvent(event),
    captureVoicePanelOperation: () => panelHost?.captureOperation?.() || null,
    retainedImageFrame: () => session.retainedImageFrame?.() || null,
    announcePointer: () => session.adapter?.controller?.announcePointer?.() ?? false,
    destroy,
  };
}
