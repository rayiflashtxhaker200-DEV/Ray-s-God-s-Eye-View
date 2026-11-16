import { createVoiceCommands as bindVoiceCommands } from './sessionCommands.js';
import { createRealtimeSession } from './realtimeSession.js';
import { createGeminiSession } from './geminiSession.js';
import { createProviderCommands } from './providerCommands.js';
import { createVoicePanelHost } from './panel/host.js';
import { mountVoiceDockUi } from './dockUi.js';

/** Default composition; callers may supply another session adapter factory. */
export function createVoiceCommands(options = {}) {
  const panelHost =
    options.panel === true
      ? createVoicePanelHost({
          storage: options.panelStorage,
          clock: options.panelClock,
          readCockpitState: options.styleManager?.getCockpitState
            ? () => options.styleManager.getCockpitState()
            : undefined,
        })
      : null;
  const bind = (settings) =>
    bindVoiceCommands({
      ...settings,
      ...(panelHost
        ? {
            panelHost,
            nativePanelProvider: settings.createController
              ? null
              : settings.createSession === createRealtimeSession
                ? 'openai'
                : settings.createSession === createGeminiSession
                  ? 'gemini'
                  : null,
          }
        : {}),
    });
  let commands;
  let activeSettings = options;
  const factories = {
    openai: createRealtimeSession,
    gemini: createGeminiSession,
  };
  // Generic hosts retain the existing default; standalone opts in explicitly.
  if (!options.createSession && options.supportedProviders !== undefined) {
    commands = createProviderCommands(options, {
      bind: (merged) => {
        activeSettings = merged;
        return bind(merged);
      },
      factories,
    });
  } else {
    commands = bind({ createSession: createRealtimeSession, ...options });
  }

  const ui = commands.ui;
  const cleanupListeners = [];

  if (ui) {
    const supported = Array.isArray(activeSettings.supportedProviders)
      ? activeSettings.supportedProviders
      : [];
    let currentProvider =
      activeSettings.initialProvider ||
      (supported.includes('gemini') ? 'gemini' : supported[0] || 'gemini');

    if (supported.length) {
      ui.update('root', {
        provider: currentProvider,
        providerChoice: supported.length > 1,
      });
      ui.update('provider', {
        hidden: supported.length <= 1,
        options: supported.map((id) => ({
          value: id,
          label:
            id === 'gemini' ? 'Gemini AI' : id === 'openai' ? 'OpenAI' : id,
        })),
        value: currentProvider,
      });
    }

    if (supported.length > 1 && activeSettings.providerFactories) {
      cleanupListeners.push(
        ui.on('provider-change', (nextProvider) => {
          const factory = activeSettings.providerFactories[nextProvider];
          if (!factory || nextProvider === currentProvider) return;
          const wasVoiceActive =
            commands.session.isActive() &&
            !commands.session.adapter?.getStartOptions?.().textOnly;
          commands.session.stop();
          currentProvider = nextProvider;
          commands.session.setAdapterFactory?.((hooks) =>
            factory({
              ...hooks,
              readContext: options.readContext,
              dataManager: options.dataManager,
              viewer: options.viewer,
            }),
          );
          ui.update('root', { provider: currentProvider });
          ui.update('provider', { value: currentProvider });
          if (wasVoiceActive) void commands.start();
        }),
      );
    }

    if (ui.panel) {
      cleanupListeners.push(
        ui.on('settings-button', () => {
          const nextHidden = !ui.state.voicePanel.hidden;
          ui.update('voicePanel', {
            hidden: nextHidden,
            view: nextHidden ? null : ui.state.voicePanel.selected || 'preview',
          });
        }),
        ui.on('settings-close', () => {
          ui.update('voicePanel', { hidden: true, view: null });
        }),
        ui.on('tab', (tab) => {
          ui.update('voicePanel', {
            selected: tab === 'settings' ? 'settings' : 'preview',
            view: tab === 'settings' ? 'settings' : 'preview',
            previewHidden: tab === 'settings',
            settingsHidden: tab !== 'settings',
          });
        }),
        ui.on('preview-change', (checked) => {
          ui.update('preferences', {
            previewChecked: Boolean(checked),
            revision: (ui.state.preferences.revision || 0) + 1,
          });
        }),
        ui.on('timeout-select', (choice) => {
          ui.update('preferences', {
            timeoutChoice: String(choice),
            timeoutMinutes: choice === 'off' ? '' : String(choice),
            revision: (ui.state.preferences.revision || 0) + 1,
          });
        }),
        ui.on('card-dismiss', () => {
          ui.update('card', { visible: false });
        }),
      );

      // Mirror live voice session events into the floating Voice Card when preview is enabled
      if (commands.session?.subscribe) {
        cleanupListeners.push(
          commands.session.subscribe((event) => {
            if (!ui.state.preferences?.previewChecked) return;
            const isTextOnly = Boolean(
              commands.session.adapter?.getStartOptions?.().textOnly,
            );
            if (isTextOnly) return;
            if (event.type === 'transcript' && event.text) {
              const isUser = event.role === 'user';
              ui.update('card', {
                visible: true,
                phase: isUser ? 'TÚ' : 'GEMINI LIVE',
                ...(isUser
                  ? { user: { visible: true, text: event.text, label: 'TÚ' } }
                  : { assistant: { visible: true, text: event.text } }),
              });
            } else if (event.type === 'action-call') {
              const prevSteps = Array.isArray(ui.state.card?.steps)
                ? ui.state.card.steps
                : [];
              ui.update('card', {
                visible: true,
                busy: true,
                phase: 'EJECUTANDO',
                steps: [
                  ...prevSteps.slice(-4),
                  {
                    id: event.callId || event.name,
                    label: String(event.name || '').replace(/_/g, ' '),
                    status: 'running',
                  },
                ],
              });
            } else if (event.type === 'action-result') {
              const prevSteps = Array.isArray(ui.state.card?.steps)
                ? ui.state.card.steps
                : [];
              const nextSteps = prevSteps.map((s) =>
                s.id === (event.callId || event.name)
                  ? {
                      ...s,
                      status: event.result?.ok === false ? 'failed' : 'done',
                    }
                  : s,
              );
              const disp = event.result?.display;
              ui.update('card', {
                visible: true,
                busy: false,
                steps: nextSteps,
                ...(disp
                  ? {
                      result: {
                        visible: true,
                        title: disp.title || '',
                        chips: disp.chips || [],
                        lines: disp.lines || [],
                        referents: disp.referents || [],
                        notes: disp.notes || [],
                      },
                    }
                  : {}),
              });
            }
          }),
        );
      }
    }
  }

  let dockUi = null;
  if (
    options.panel === true &&
    globalThis.document?.getElementById?.('command-dock')
  ) {
    dockUi = mountVoiceDockUi({
      ui,
      session: commands.session,
      runner: commands.runner,
      readContext: options.readContext,
      dataManager: options.dataManager,
      signal: commands.signal ?? commands.session?.signal,
    });
  }

  const origDestroy = commands.destroy;
  commands.destroy = () => {
    for (const off of cleanupListeners) {
      try {
        off?.();
      } catch {
        /* ignore */
      }
    }
    cleanupListeners.length = 0;
    dockUi?.destroy?.();
    dockUi = null;
    origDestroy?.();
  };

  if (panelHost) {
    const lifetime = commands.signal ?? commands.session?.signal;
    lifetime?.addEventListener('abort', () => panelHost.destroy(), {
      once: true,
    });
    if (lifetime?.aborted) panelHost.destroy();
  }
  return commands;
}
