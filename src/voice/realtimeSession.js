import { RealtimeInput } from './realtimeInput.js';
import { createTextChat } from './textChat.js';
import { t } from '../i18n/index.js';

/**
 * Default OpenAI Realtime / Text chat session adapter matching the shared adapter contract.
 */
export function createRealtimeSession(options = {}) {
  const { emit = () => {}, ui = null } = options;
  let status = 'idle';
  let textOnly = false;
  const input = new RealtimeInput({
    readUi: () => ui,
    readStatus: () => status,
    operations: {
      isActive: () => !['idle', 'error'].includes(status),
    },
  });
  const chat = createTextChat({
    ...options,
    provider: 'openai',
    endpoint: '/api/openai/chat',
    emit: (event) => {
      if (event.type === 'state') status = event.state;
      emit(event);
    },
  });

  return {
    controller: { input },
    capabilities: {
      costControls: true,
      pushToTalk: true,
      advisoryLimit: null,
    },
    async start(settings = {}) {
      textOnly = Boolean(settings.textOnly);
      if (textOnly) {
        status = 'listening';
        return chat.start(settings);
      }
      status = 'connecting';
      emit({ type: 'state', state: 'connecting', detail: t('Requesting session') });
      try {
        const fetchFn = options.fetchImpl || globalThis.fetch?.bind(globalThis);
        if (typeof fetchFn !== 'function') throw new Error('Fetch unavailable');
        const res = await fetchFn('/api/realtime/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pushToTalk: Boolean(settings.pushToTalk) }),
          signal: options.signal,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || `Realtime token HTTP ${res.status}`);
        }
        status = 'listening';
        emit({ type: 'state', state: 'listening', detail: t('Ask or command') });
      } catch (error) {
        status = 'error';
        emit({
          type: 'state',
          state: 'error',
          detail: error?.message || t('Voice session failed to start'),
        });
      }
    },
    getStartOptions: () => ({
      pushToTalk: Boolean(input.pushToTalkMode),
      ...(textOnly ? { textOnly: true } : {}),
    }),
    stop(settings = {}) {
      chat.stop({ ...settings, preserveStatus: true });
      status = 'idle';
      if (!settings.preserveStatus) {
        emit({ type: 'state', state: 'idle', detail: t('Voice off') });
      }
    },
    cancelTurn: () => (textOnly ? chat.cancelTurn() : false),
    sendText: (text) => (textOnly ? chat.sendText(text) : false),
    sendMapEvent: () => false,
    ignoreButtonClick: () => Boolean(input.spaceKeyHeld),
    bindControls: () => input.bindPushToTalkShortcut(),
  };
}
