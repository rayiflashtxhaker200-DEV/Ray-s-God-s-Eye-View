import { watch } from 'vue';
import { t } from '../i18n/index.js';
import { useVoiceStore } from '../ui/stores/voice.js';
import { applicationPinia } from '../ui/vueRuntime.js';

const QUICK_COMMANDS = [
  { label: 'Vuela a Tokio', prompt: 'Vuela a Tokio y acércate a la torre' },
  { label: 'Activa vuelos', prompt: 'Activa la capa de vuelos en vivo' },
  { label: 'Modo térmico', prompt: 'Cambia al estilo visual térmico FLIR' },
  {
    label: '¿Qué estoy viendo?',
    prompt: '¿Qué lugar y capas estoy viendo ahora mismo?',
  },
  { label: 'Vista global', prompt: 'Aléjate para mostrar el globo completo' },
];

function createEl(doc, tag, attrs = {}, children = []) {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'className') el.className = String(v);
    else if (k === 'text') el.appendChild(doc.createTextNode(String(v)));
    else if (k === 'dataset' && typeof v === 'object') {
      for (const [dk, dv] of Object.entries(v)) {
        if (dv !== undefined && dv !== null) el.dataset[dk] = String(dv);
      }
    } else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const child of children) {
    if (child) el.appendChild(child);
  }
  return el;
}

function setTextSafe(el, value) {
  if (!el) return;
  const text = String(value ?? '');
  if (
    el.firstChild &&
    el.childNodes.length === 1 &&
    el.firstChild.nodeType === 3
  ) {
    if (el.firstChild.nodeValue !== text) el.firstChild.nodeValue = text;
    return;
  }
  el.replaceChildren(el.ownerDocument.createTextNode(text));
}

function describeToolCallEs(name, args = {}) {
  switch (name) {
    case 'fly_to_location':
      return args?.query || args?.locationId
        ? `Volando a ${args.query || args.locationId}`
        : 'Moviendo cámara a ubicación';
    case 'zoom_to_globe':
      return 'Vista global del planeta';
    case 'set_layer_visibility':
      return `${args?.enabled === false ? 'Desactivando' : 'Activando'} capa ${args?.layerId || args?.layer || ''}`.trim();
    case 'set_visual_style':
      return `Estilo visual: ${args?.style || 'normal'}`;
    case 'set_hud':
      return args?.visible === false ? 'Ocultando HUD' : 'Mostrando HUD';
    case 'analyst_query':
      return `Analizando ${args?.layerId || 'capas activas'}`;
    case 'osm_query':
      return `Buscando ${args?.what || 'elementos'} en el mapa`;
    case 'track_entity':
      return `Siguiendo ${args?.query || 'objetivo'}`;
    case 'stop_tracking':
      return 'Seguimiento detenido';
    default:
      return String(name || 'Acción en mapa').replace(/_/g, ' ');
  }
}

function defaultReplyForTools(calls = [], results = []) {
  const okCount = results.filter((r) => r?.ok !== false).length;
  if (!calls.length) return 'Comando procesado.';
  if (calls.length === 1) {
    const first = results[0];
    if (first?.say) return String(first.say);
    if (first?.error) return `No se pudo completar: ${first.error}`;
    return `${describeToolCallEs(calls[0].name, calls[0].args)} completado.`;
  }
  return `Listo: se ejecutaron ${okCount} de ${calls.length} acciones en el mapa.`;
}

function speakText(text, lang = 'es-ES') {
  const synth = globalThis.speechSynthesis;
  const clean = String(text || '').trim();
  if (
    !synth ||
    !clean ||
    typeof globalThis.SpeechSynthesisUtterance !== 'function'
  ) {
    return;
  }
  try {
    synth.cancel();
    const utterance = new globalThis.SpeechSynthesisUtterance(clean);
    utterance.lang = lang;
    utterance.rate = 1.03;
    synth.speak(utterance);
  } catch {
    /* ignore speech synthesis errors */
  }
}

/**
 * Minimalist adaptive Voice & Gemini AI Assistant dock mounted inside `#command-dock`.
 * Reads reactive state from Pinia (`useVoiceStore`) and supports:
 * - Native Gemini Live audio session (`ui` + `session`)
 * - Browser SpeechRecognition -> POST /api/gemini/voice hybrid dictation
 * - Collapsible floating Chat IA drawer (`POST /api/gemini/chat`)
 * - Spoken dynamic responses via SpeechSynthesis
 */
export function mountVoiceDockUi({
  ui,
  session,
  runner,
  readContext = null,
  dataManager = null,
  signal = null,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  documentRef = globalThis.document,
} = {}) {
  const doc = documentRef;
  const dock = doc?.getElementById?.('command-dock');
  if (!doc || !dock || !ui) return { destroy() {} };

  const store = useVoiceStore(applicationPinia());
  const existing = doc.getElementById('gev-voice-control');
  if (existing && existing.parentElement === dock) {
    existing.remove();
  }

  let disposed = false;
  let ttsEnabled = false;
  let recognition = null;
  let dictating = false;
  let dictatingTarget = null;
  let dictationHistory = [];
  let transientCard = null;
  let messagesPinnedBottom = true;

  // Build Root `#gev-voice-control`
  const root = createEl(doc, 'section', {
    id: 'gev-voice-control',
    className: 'gev-voice-control',
    'aria-label': 'Control de voz y asistente Gemini IA',
  });

  // 1. Primary Voice Button
  const micIcon = createEl(doc, 'span', {
    className: 'material-symbols-outlined',
    'aria-hidden': 'true',
    text: 'mic',
  });
  const micOrbit = createEl(doc, 'span', { className: 'gev-mic-orbit' }, [
    micIcon,
  ]);
  const micLabel = createEl(doc, 'span', {
    className: 'gev-mic-label',
    text: 'LIVE',
  });
  const voiceButton = createEl(
    doc,
    'button',
    {
      id: 'gev-voice-button',
      type: 'button',
      'aria-pressed': 'false',
    },
    [micOrbit, micLabel],
  );

  // 2. Heading (kicker + status + quick action strip)
  const kicker = createEl(doc, 'span', {
    className: 'gev-voice-kicker',
    text: "RAY'S EYE AI",
  });
  const statusEl = createEl(doc, 'span', {
    id: 'gev-voice-status',
    text: 'INACTIVO',
  });

  const dictateIcon = createEl(doc, 'span', {
    className: 'material-symbols-outlined',
    'aria-hidden': 'true',
    text: 'auto_awesome',
  });
  const dictateBtn = createEl(
    doc,
    'button',
    {
      id: 'gev-voice-dictate-btn',
      type: 'button',
      className: 'gev-voice-mini-btn',
      title: 'Dictar comando rápido por voz a Gemini',
      'aria-label': 'Dictar comando rápido por voz',
      'aria-pressed': 'false',
    },
    [dictateIcon],
  );

  const chatIcon = createEl(doc, 'span', {
    className: 'material-symbols-outlined',
    'aria-hidden': 'true',
    text: 'chat',
  });
  const chatButton = createEl(
    doc,
    'button',
    {
      id: 'gev-chat-button',
      type: 'button',
      className: 'gev-voice-mini-btn',
      title: 'Abrir chat dinámico Gemini',
      'aria-label': 'Chat asistente Gemini',
      'aria-expanded': 'false',
    },
    [chatIcon],
  );

  const ttsIcon = createEl(doc, 'span', {
    className: 'material-symbols-outlined',
    'aria-hidden': 'true',
    text: 'volume_off',
  });
  const ttsButton = createEl(
    doc,
    'button',
    {
      id: 'gev-voice-tts-btn',
      type: 'button',
      className: 'gev-voice-mini-btn',
      title: 'Activar o silenciar respuestas habladas',
      'aria-label': 'Respuestas habladas',
      'aria-pressed': 'false',
    },
    [ttsIcon],
  );

  const headingActions = createEl(
    doc,
    'span',
    { className: 'gev-voice-dock-actions' },
    [dictateBtn, chatButton, ttsButton],
  );

  const heading = createEl(doc, 'div', { className: 'gev-voice-heading' }, [
    kicker,
    statusEl,
    headingActions,
  ]);

  // 3. Visualizer bars
  const barSpans = Array.from({ length: 15 }, (_, idx) =>
    createEl(doc, 'span', {
      dataset: { barIndex: idx },
    }),
  );
  const visualizer = createEl(
    doc,
    'div',
    { className: 'gev-voice-visualizer', 'aria-hidden': 'true' },
    barSpans,
  );

  // 4. Detail readout & hover help
  const detailEl = createEl(doc, 'div', {
    id: 'gev-voice-detail',
    text: 'VOZ EN ESPERA',
  });
  const readoutWrap = createEl(doc, 'div', { className: 'gev-voice-readout' }, [
    detailEl,
  ]);

  const helpKicker = createEl(doc, 'div', {
    className: 'gev-voice-help-kicker',
    text: 'GEMINI VOZ + IA DINÁMICA',
  });
  const helpDetail = createEl(doc, 'div', {
    className: 'gev-voice-help-detail',
    text: 'Pulsa LIVE para audio bidireccional, Dictado IA para comando por voz, o Chat para conversar.',
  });
  const helpTray = createEl(doc, 'div', { className: 'gev-voice-help-tray' }, [
    helpKicker,
    helpDetail,
  ]);

  // 5. Provider bar + Settings button
  const providerSelect = createEl(doc, 'select', {
    id: 'gev-voice-provider',
    'aria-label': 'Proveedor de voz IA',
  });
  const providerField = createEl(
    doc,
    'label',
    { className: 'gev-voice-provider-field', hidden: true },
    [createEl(doc, 'span', { text: 'Proveedor' }), providerSelect],
  );
  const settingsBtn = createEl(
    doc,
    'button',
    {
      id: 'gev-voice-settings-button',
      type: 'button',
      className: 'gev-voice-settings-button',
      'aria-label': 'Ajustes de voz',
      'aria-expanded': 'false',
      title: 'Ajustes de voz IA',
    },
    [
      createEl(doc, 'span', {
        className: 'material-symbols-outlined gev-voice-settings-icon',
        'aria-hidden': 'true',
        text: 'settings',
      }),
    ],
  );

  // 6. Error Tray with Dictation/Chat fallback button
  const errorDismiss = createEl(doc, 'button', {
    type: 'button',
    className: 'gev-voice-error-dismiss',
    text: 'Cerrar',
  });
  const errorHeader = createEl(
    doc,
    'div',
    { className: 'gev-voice-error-header' },
    [createEl(doc, 'span', { text: 'ESTADO DE VOZ' }), errorDismiss],
  );
  const errorDetail = createEl(doc, 'div', {
    id: 'gev-voice-error-detail',
    className: 'gev-voice-error-detail',
  });
  const errorFallbackBtn = createEl(doc, 'button', {
    id: 'gev-voice-fallback-chat',
    type: 'button',
    className: 'gev-voice-error-fallback',
    text: 'Usar Dictado / Chat Gemini',
  });
  const errorTray = createEl(
    doc,
    'div',
    { className: 'gev-voice-error-tray' },
    [errorHeader, errorDetail, errorFallbackBtn],
  );

  // 7. Voice Card (captions + steps + results)
  const cardPhase = createEl(doc, 'span', {
    className: 'gev-voice-card-phase',
  });
  const cardDismiss = createEl(doc, 'button', {
    type: 'button',
    className: 'gev-voice-card-dismiss',
    'aria-label': 'Cerrar tarjeta de respuesta',
    text: '×',
  });
  const cardHeader = createEl(
    doc,
    'div',
    { className: 'gev-voice-card-header' },
    [
      createEl(doc, 'span', {
        className: 'gev-voice-card-kicker',
        text: 'GEMINI AI',
      }),
      cardPhase,
      cardDismiss,
    ],
  );
  const cardUserText = createEl(doc, 'span', {
    className: 'gev-voice-card-text',
  });
  const cardUserRow = createEl(
    doc,
    'p',
    {
      className: 'gev-voice-card-caption',
      dataset: { role: 'user' },
      hidden: true,
    },
    [
      createEl(doc, 'span', { className: 'gev-voice-card-who', text: 'TÚ' }),
      cardUserText,
    ],
  );
  const cardPointerLabel = createEl(doc, 'span', {
    className: 'gev-voice-card-pointer-label',
  });
  const cardPointerRow = createEl(
    doc,
    'p',
    { className: 'gev-voice-card-pointer', hidden: true },
    [
      createEl(doc, 'span', { className: 'gev-voice-card-who', text: 'ESTO' }),
      cardPointerLabel,
    ],
  );
  const cardAssistantText = createEl(doc, 'span', {
    className: 'gev-voice-card-text',
  });
  const cardAssistantRow = createEl(
    doc,
    'p',
    {
      className: 'gev-voice-card-caption',
      dataset: { role: 'assistant' },
      hidden: true,
    },
    [
      createEl(doc, 'span', { className: 'gev-voice-card-who', text: 'IA' }),
      cardAssistantText,
    ],
  );
  const cardPlanList = createEl(doc, 'ul', {
    className: 'gev-voice-card-plan',
    hidden: true,
  });
  const cardResultTitle = createEl(doc, 'div', {
    className: 'gev-voice-card-result-title',
  });
  const cardResultChips = createEl(doc, 'div', {
    className: 'gev-voice-card-chips',
  });
  const cardResultLines = createEl(doc, 'ul', {
    className: 'gev-voice-card-lines',
  });
  const cardResultBox = createEl(
    doc,
    'div',
    { className: 'gev-voice-card-result', hidden: true },
    [cardResultTitle, cardResultChips, cardResultLines],
  );
  const cardEl = createEl(
    doc,
    'div',
    {
      id: 'gev-voice-card',
      className: 'gev-voice-card',
      hidden: true,
      role: 'region',
      'aria-live': 'polite',
    },
    [
      cardHeader,
      cardUserRow,
      cardPointerRow,
      cardAssistantRow,
      cardPlanList,
      cardResultBox,
    ],
  );

  // 8. Chat Panel (`#gev-chat-panel`)
  const chatPhaseEl = createEl(doc, 'span', {
    id: 'gev-assistant-phase',
    className: 'gev-chat-phase',
    'aria-live': 'off',
  });
  const chatBackBtn = createEl(doc, 'button', {
    id: 'gev-chat-back',
    type: 'button',
    className: 'gev-chat-hdr-btn',
    hidden: true,
    'aria-label': 'Volver al chat',
    text: '←',
  });
  const chatMinBtn = createEl(
    doc,
    'button',
    {
      id: 'gev-chat-minimize',
      type: 'button',
      className: 'gev-chat-hdr-btn',
      title: 'Minimizar chat',
      'aria-label': 'Minimizar chat',
    },
    [
      createEl(doc, 'span', {
        className: 'material-symbols-outlined',
        'aria-hidden': 'true',
        text: 'expand_more',
      }),
    ],
  );
  const chatCloseBtn = createEl(
    doc,
    'button',
    {
      id: 'gev-chat-close',
      type: 'button',
      className: 'gev-chat-hdr-btn',
      title: 'Cerrar chat',
      'aria-label': 'Cerrar chat',
    },
    [
      createEl(doc, 'span', {
        className: 'material-symbols-outlined',
        'aria-hidden': 'true',
        text: 'close',
      }),
    ],
  );
  const chatHeader = createEl(doc, 'div', { className: 'gev-chat-header' }, [
    chatBackBtn,
    createEl(doc, 'span', {
      className: 'gev-chat-title',
      text: 'Asistente Gemini AI',
    }),
    chatPhaseEl,
    createEl(doc, 'div', { className: 'gev-chat-hdr-actions' }, [
      chatMinBtn,
      chatCloseBtn,
    ]),
  ]);

  const chatStatusEl = createEl(doc, 'div', {
    id: 'gev-chat-status',
    className: 'gev-chat-status',
    text: 'Chat silencioso · micrófono apagado',
  });

  const chatQuickChips = createEl(
    doc,
    'div',
    { className: 'gev-chat-chips' },
    QUICK_COMMANDS.map((item) => {
      const chip = createEl(doc, 'button', {
        type: 'button',
        className: 'gev-chat-chip',
        text: item.label,
      });
      chip.addEventListener('click', () => {
        if (chatInput) {
          chatInput.value = item.prompt;
          ui.emit('chat-input', item.prompt);
          ui.emit('chat-submit');
        }
      });
      return chip;
    }),
  );

  const chatMessagesEl = createEl(doc, 'div', {
    id: 'gev-chat-messages',
    className: 'gev-chat-messages',
    role: 'log',
    'aria-live': 'polite',
    'aria-busy': 'false',
  });
  chatMessagesEl.addEventListener('scroll', () => {
    const distance =
      chatMessagesEl.scrollHeight -
      chatMessagesEl.scrollTop -
      chatMessagesEl.clientHeight;
    messagesPinnedBottom = distance < 28;
  });

  const chatAttachBtn = createEl(doc, 'button', {
    id: 'gev-chat-attach',
    type: 'button',
    className: 'gev-chat-attach-btn',
    hidden: true,
    text: '+ Capa',
  });
  const chatLayerSelect = createEl(doc, 'select', {
    id: 'gev-chat-layer',
    className: 'gev-chat-layer-select',
    hidden: true,
    'aria-label': 'Adjuntar capa al mensaje',
  });

  const chatInput = createEl(doc, 'textarea', {
    id: 'gev-chat-input',
    className: 'gev-chat-input',
    rows: '2',
    placeholder:
      'Ordena volar a un lugar, activar capas o preguntar sobre la vista…',
    'aria-label': 'Mensaje para Gemini AI',
  });
  const chatDictateBtn = createEl(
    doc,
    'button',
    {
      id: 'gev-chat-dictate',
      type: 'button',
      className: 'gev-chat-icon-btn',
      title: 'Dictar por micrófono',
      'aria-label': 'Dictar comando por voz',
    },
    [
      createEl(doc, 'span', {
        className: 'material-symbols-outlined',
        'aria-hidden': 'true',
        text: 'mic',
      }),
    ],
  );
  const chatStopBtn = createEl(
    doc,
    'button',
    {
      id: 'gev-chat-stop',
      type: 'button',
      className: 'gev-chat-icon-btn gev-chat-stop-btn',
      hidden: true,
      title: 'Detener respuesta',
      'aria-label': 'Detener respuesta',
    },
    [
      createEl(doc, 'span', {
        className: 'material-symbols-outlined',
        'aria-hidden': 'true',
        text: 'stop',
      }),
    ],
  );
  const chatSendBtn = createEl(
    doc,
    'button',
    {
      id: 'gev-chat-send',
      type: 'button',
      className: 'gev-chat-send-btn',
      title: 'Enviar comando a Gemini',
      'aria-label': 'Enviar comando',
    },
    [
      createEl(doc, 'span', {
        className: 'material-symbols-outlined',
        'aria-hidden': 'true',
        text: 'send',
      }),
    ],
  );
  const chatComposer = createEl(
    doc,
    'div',
    { className: 'gev-chat-composer' },
    [
      chatAttachBtn,
      chatLayerSelect,
      chatInput,
      chatDictateBtn,
      chatStopBtn,
      chatSendBtn,
    ],
  );

  const chatMiniReplyEl = createEl(doc, 'button', {
    id: 'gev-chat-mini-reply',
    type: 'button',
    className: 'gev-chat-mini-reply',
    hidden: true,
  });

  const chatPanel = createEl(
    doc,
    'div',
    {
      id: 'gev-chat-panel',
      className: 'gev-chat-panel',
      hidden: true,
      role: 'dialog',
      'aria-label': 'Asistente conversacional Gemini AI',
    },
    [chatHeader, chatStatusEl, chatQuickChips, chatMessagesEl, chatComposer],
  );

  // 9. Settings & Preview Panel (`#gev-voice-panel`)
  const settingsCloseBtn = createEl(doc, 'button', {
    id: 'gev-voice-settings-close',
    type: 'button',
    'aria-label': 'Cerrar ajustes de voz',
    text: '×',
  });
  const previewTab = createEl(doc, 'button', {
    id: 'gev-voice-preview-tab',
    type: 'button',
    role: 'tab',
    className: 'gev-voice-panel-tab',
    'aria-selected': 'true',
    text: 'Vista',
  });
  const settingsTab = createEl(doc, 'button', {
    id: 'gev-voice-settings-tab',
    type: 'button',
    role: 'tab',
    className: 'gev-voice-panel-tab',
    'aria-selected': 'false',
    text: 'Ajustes',
  });
  const panelHeader = createEl(
    doc,
    'div',
    { className: 'gev-voice-panel-header' },
    [
      createEl(doc, 'span', {
        className: 'gev-voice-panel-title',
        text: 'CONFIGURACIÓN VOZ',
      }),
      createEl(
        doc,
        'div',
        { className: 'gev-voice-panel-tabs', role: 'tablist' },
        [previewTab, settingsTab],
      ),
      settingsCloseBtn,
    ],
  );
  const previewCheckbox = createEl(doc, 'input', {
    id: 'gev-voice-preview-toggle',
    type: 'checkbox',
    checked: true,
  });
  const timeoutSelect = createEl(
    doc,
    'select',
    { id: 'gev-voice-timeout-select', 'aria-label': 'Tiempo de inactividad' },
    [
      createEl(doc, 'option', { value: '2', text: '2 minutos' }),
      createEl(doc, 'option', { value: '5', text: '5 minutos' }),
      createEl(doc, 'option', { value: '10', text: '10 minutos' }),
      createEl(doc, 'option', { value: 'off', text: 'Sin límite' }),
    ],
  );
  const timeoutNote = createEl(doc, 'div', {
    className: 'gev-voice-settings-note',
    text: 'Las preferencias se guardan en este navegador.',
  });
  const settingsBody = createEl(
    doc,
    'div',
    { id: 'gev-voice-settings-panel', className: 'gev-voice-panel-body' },
    [
      createEl(
        doc,
        'label',
        { className: 'gev-voice-preference gev-voice-preference-toggle' },
        [
          previewCheckbox,
          createEl(doc, 'span', {
            text: 'Mostrar tarjeta de respuestas en vivo',
          }),
        ],
      ),
      createEl(doc, 'div', { className: 'gev-voice-timeout-group' }, [
        createEl(doc, 'div', {
          className: 'gev-voice-setting-title',
          text: 'Cierre automático por silencio',
        }),
        createEl(doc, 'div', { className: 'gev-voice-timeout-controls' }, [
          timeoutSelect,
        ]),
        timeoutNote,
      ]),
    ],
  );
  const previewBody = createEl(
    doc,
    'div',
    { id: 'gev-voice-preview-panel', className: 'gev-voice-panel-body' },
    [
      createEl(doc, 'p', {
        className: 'gev-voice-settings-note',
        text: 'Las respuestas y acciones recientes aparecen en esta tarjeta cuando hablas con Gemini.',
      }),
    ],
  );
  const voicePanel = createEl(
    doc,
    'div',
    {
      id: 'gev-voice-panel',
      className: 'gev-voice-panel',
      hidden: true,
    },
    [panelHeader, previewBody, settingsBody],
  );

  root.append(
    voiceButton,
    heading,
    visualizer,
    readoutWrap,
    helpTray,
    providerField,
    settingsBtn,
    errorTray,
    cardEl,
    chatMiniReplyEl,
    chatPanel,
    voicePanel,
  );

  const controlPanelNode = dock.querySelector('#control-panel');
  if (controlPanelNode) dock.insertBefore(root, controlPanelNode);
  else dock.appendChild(root);

  // Hybrid SpeechRecognition -> /api/gemini/voice command execution
  function stopDictation() {
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
      recognition = null;
    }
    dictating = false;
    dictatingTarget = null;
    dictateBtn.classList.remove('is-listening');
    dictateBtn.setAttribute('aria-pressed', 'false');
    chatDictateBtn.classList.remove('is-listening');
    setTextSafe(dictateIcon, 'auto_awesome');
  }

  async function executeGeminiVoiceCommand(transcript) {
    const clean = String(transcript || '').trim();
    if (!clean || disposed || !fetchImpl) return;

    const lang = doc.documentElement?.lang || 'es';
    transientCard = {
      visible: true,
      phase: t('THINKING') || 'PROCESANDO',
      user: clean,
      assistant: '',
      steps: [],
      resultTitle: '',
    };
    renderView(store.view);

    let liveContext = null;
    if (typeof readContext === 'function') {
      try {
        liveContext = readContext();
      } catch {
        liveContext = null;
      }
    }

    try {
      const res = await fetchImpl('/api/gemini/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: clean,
          context: {
            ...(liveContext || {}),
            locale: lang,
            source: 'desktop-voice',
          },
          history: dictationHistory.slice(-6),
        }),
        signal,
      });
      let payload = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }
      if (!res.ok) {
        throw new Error(payload?.error || `Error Gemini HTTP ${res.status}`);
      }

      const calls = Array.isArray(payload?.functionCalls)
        ? payload.functionCalls
        : [];
      const steps = calls.map((c) => ({
        label: describeToolCallEs(c.name, c.args),
        status: 'pending',
      }));
      transientCard = {
        ...transientCard,
        phase: calls.length ? 'EJECUTANDO' : 'LISTO',
        steps,
      };
      renderView(store.view);

      const results = [];
      for (let i = 0; i < calls.length; i++) {
        if (disposed) return;
        const call = calls[i];
        steps[i].status = 'running';
        renderView(store.view);
        try {
          const out = runner
            ? await runner(call.name, call.args || {}, { signal })
            : { ok: false, error: 'Runner no disponible' };
          steps[i].status = out?.ok === false ? 'failed' : 'done';
          results.push(out);
        } catch (err) {
          steps[i].status = 'failed';
          results.push({
            ok: false,
            error: err?.message || 'Error al ejecutar acción',
          });
        }
        renderView(store.view);
      }

      const replyText =
        String(payload?.text || '').trim() ||
        defaultReplyForTools(calls, results);

      dictationHistory = [
        ...dictationHistory,
        { role: 'user', text: clean },
        { role: 'model', text: replyText },
      ].slice(-10);

      transientCard = {
        visible: true,
        phase: 'LISTO',
        user: clean,
        assistant: replyText,
        steps,
        resultTitle:
          results.find((r) => r?.display?.title)?.display?.title || '',
      };
      renderView(store.view);

      // Sync into chat message log as well so user has seamless conversation continuity
      const existingMsgs = Array.isArray(store.chatMessages)
        ? store.chatMessages
        : [];
      ui.setChatMessages(
        [
          ...existingMsgs,
          { id: Date.now(), role: 'user', text: clean },
          { id: Date.now() + 1, role: 'assistant', text: replyText },
        ].slice(-60),
      );

      if (ttsEnabled) {
        speakText(replyText, lang.startsWith('en') ? 'en-US' : 'es-ES');
      }
    } catch (err) {
      transientCard = {
        visible: true,
        phase: 'ERROR',
        user: clean,
        assistant: err?.message || 'No se pudo procesar el comando con Gemini.',
        steps: [],
        resultTitle: '',
      };
      renderView(store.view);
    }
  }

  function startDictation(target = 'voice') {
    const Recognition =
      globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!Recognition) {
      ui.update('error', {
        text: 'Tu navegador no soporta dictado directo; usa el Chat IA de Gemini.',
        typed: true,
      });
      ui.emit('chat-restore');
      return;
    }
    if (dictating && dictatingTarget === target) {
      stopDictation();
      return;
    }
    stopDictation();
    if (session?.isActive?.()) session.stop();

    const rec = new Recognition();
    recognition = rec;
    dictating = true;
    dictatingTarget = target;
    const lang = doc.documentElement?.lang || 'es';
    rec.lang = lang.startsWith('en') ? 'en-US' : 'es-ES';
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    dictateBtn.classList.add('is-listening');
    dictateBtn.setAttribute('aria-pressed', 'true');
    chatDictateBtn.classList.add('is-listening');
    setTextSafe(dictateIcon, 'mic');

    let finalTranscript = '';

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i]?.[0]?.transcript || '';
        if (event.results[i].isFinal) finalTranscript += `${chunk} `;
        else interim += chunk;
      }
      const preview = (finalTranscript || interim).trim();
      if (target === 'chat' && preview) {
        chatInput.value = preview;
        ui.emit('chat-input', preview);
      } else if (preview) {
        transientCard = {
          visible: true,
          phase: 'ESCUCHANDO',
          user: preview,
          assistant: '',
          steps: [],
          resultTitle: '',
        };
        renderView(store.view);
      }
    };

    rec.onerror = (event) => {
      stopDictation();
      if (
        event?.error &&
        event.error !== 'aborted' &&
        event.error !== 'no-speech'
      ) {
        transientCard = {
          visible: true,
          phase: 'MICRÓFONO',
          user: '',
          assistant: `No se pudo captar audio (${event.error}). Puedes escribir en el Chat IA.`,
          steps: [],
          resultTitle: '',
        };
        renderView(store.view);
      }
    };

    rec.onend = () => {
      const committed = finalTranscript.trim();
      stopDictation();
      if (!committed) return;
      if (target === 'chat') {
        chatInput.value = committed;
        ui.emit('chat-input', committed);
        ui.emit('chat-submit');
      } else {
        void executeGeminiVoiceCommand(committed);
      }
    };

    try {
      rec.start();
    } catch {
      stopDictation();
    }
  }

  // Event bindings -> ui emitter
  voiceButton.addEventListener('click', () => {
    stopDictation();
    transientCard = null;
    ui.emit('button');
  });
  dictateBtn.addEventListener('click', () => startDictation('voice'));
  chatDictateBtn.addEventListener('click', () => startDictation('chat'));
  chatButton.addEventListener('click', () => ui.emit('chat-button'));
  ttsButton.addEventListener('click', () => {
    ttsEnabled = !ttsEnabled;
    ttsButton.setAttribute('aria-pressed', ttsEnabled ? 'true' : 'false');
    ttsButton.classList.toggle('is-active', ttsEnabled);
    setTextSafe(ttsIcon, ttsEnabled ? 'volume_up' : 'volume_off');
    if (!ttsEnabled) globalThis.speechSynthesis?.cancel?.();
  });
  providerSelect.addEventListener('change', () => {
    ui.emit('provider-change', providerSelect.value);
  });
  settingsBtn.addEventListener('click', () => ui.emit('settings-button'));
  settingsCloseBtn.addEventListener('click', () => ui.emit('settings-close'));
  previewTab.addEventListener('click', () => ui.emit('tab', 'preview'));
  settingsTab.addEventListener('click', () => ui.emit('tab', 'settings'));
  previewCheckbox.addEventListener('change', () => {
    ui.emit('preview-change', previewCheckbox.checked);
  });
  timeoutSelect.addEventListener('change', () => {
    ui.emit('timeout-select', timeoutSelect.value);
  });
  errorDismiss.addEventListener('click', () => ui.dismissError());
  errorFallbackBtn.addEventListener('click', () => {
    ui.dismissError();
    ui.emit('chat-restore');
  });
  cardDismiss.addEventListener('click', () => {
    transientCard = null;
    ui.emit('card-dismiss');
    renderView(store.view);
  });
  chatCloseBtn.addEventListener('click', () => ui.emit('chat-close'));
  chatMinBtn.addEventListener('click', () => ui.emit('chat-minimize'));
  chatBackBtn.addEventListener('click', () => ui.emit('chat-back'));
  chatMiniReplyEl.addEventListener('click', () => ui.emit('chat-restore'));
  chatInput.addEventListener('input', () =>
    ui.emit('chat-input', chatInput.value),
  );
  chatInput.addEventListener('keydown', (e) => ui.emit('chat-keydown', e));
  chatSendBtn.addEventListener('click', () => ui.emit('chat-submit'));
  chatStopBtn.addEventListener('click', () => ui.emit('chat-stop'));
  chatAttachBtn.addEventListener('click', () => ui.emit('chat-attach-toggle'));
  chatLayerSelect.addEventListener('change', () => {
    if (chatLayerSelect.value) {
      ui.emit('chat-layer', chatLayerSelect.value);
      chatLayerSelect.value = '';
    }
  });

  // Render reactive state from store.view
  function renderView(view) {
    if (disposed || !view) return;
    const r = view.root || {};
    root.dataset.status = r.status || 'idle';
    root.dataset.speaker = r.speaker || 'idle';
    root.dataset.assistantMode = r.assistantMode || 'idle';
    root.dataset.providerChoice = r.providerChoice ? 'true' : 'false';
    if (r.provider) root.dataset.provider = r.provider;
    root.classList.toggle('error-dismissed', Boolean(r.errorDismissed));

    const activeVoice = !['idle', 'error'].includes(r.status);
    voiceButton.setAttribute('aria-pressed', activeVoice ? 'true' : 'false');
    if (view.button?.label)
      voiceButton.setAttribute('aria-label', view.button.label);
    setTextSafe(micIcon, activeVoice || dictating ? 'mic' : 'mic_off');
    setTextSafe(micLabel, view.mic?.text || 'LIVE');
    setTextSafe(statusEl, view.status?.text || 'INACTIVO');
    setTextSafe(detailEl, view.detail?.text || 'VOZ EN ESPERA');

    // Provider select sync
    const prov = view.provider || {};
    providerField.hidden = Boolean(prov.hidden);
    if (Array.isArray(prov.options) && prov.options.length) {
      const currentKey = [...providerSelect.options]
        .map((o) => o.value)
        .join(',');
      const nextKey = prov.options.map((o) => o.value).join(',');
      if (currentKey !== nextKey) {
        providerSelect.replaceChildren(
          ...prov.options.map((opt) =>
            createEl(doc, 'option', {
              value: opt.value,
              text: opt.label || opt.value,
            }),
          ),
        );
      }
      if (prov.value && providerSelect.value !== prov.value) {
        providerSelect.value = prov.value;
      }
    }

    // Error tray
    setTextSafe(errorDetail, view.error?.text || '');

    // Card (either owner view.card or transient Gemini dictation card)
    const c = transientCard || view.card || {};
    const showTransient = Boolean(transientCard?.visible);
    const showStoreCard = !showTransient && Boolean(c.visible);
    cardEl.hidden = !(showTransient || showStoreCard);
    if (!cardEl.hidden) {
      if (showTransient) {
        setTextSafe(cardPhase, transientCard.phase || '');
        cardUserRow.hidden = !transientCard.user;
        setTextSafe(cardUserText, transientCard.user || '');
        cardPointerRow.hidden = true;
        cardAssistantRow.hidden = !transientCard.assistant;
        setTextSafe(cardAssistantText, transientCard.assistant || '');
        cardPlanList.hidden = !transientCard.steps?.length;
        cardPlanList.replaceChildren(
          ...(transientCard.steps || []).map((st) =>
            createEl(doc, 'li', {
              className: 'gev-voice-card-step',
              dataset: { status: st.status },
              text: st.label,
            }),
          ),
        );
        cardResultBox.hidden = !transientCard.resultTitle;
        setTextSafe(cardResultTitle, transientCard.resultTitle || '');
        cardResultChips.replaceChildren();
        cardResultLines.replaceChildren();
      } else {
        setTextSafe(cardPhase, c.phase || '');
        cardUserRow.hidden = !c.user?.visible;
        setTextSafe(cardUserText, c.user?.text || '');
        cardPointerRow.hidden = !c.pointer?.visible;
        setTextSafe(cardPointerLabel, c.pointer?.text || '');
        cardAssistantRow.hidden = !c.assistant?.visible;
        setTextSafe(cardAssistantText, c.assistant?.text || '');
        const steps = Array.isArray(c.steps) ? c.steps : [];
        cardPlanList.hidden = steps.length === 0;
        cardPlanList.replaceChildren(
          ...steps.map((st) =>
            createEl(doc, 'li', {
              className: 'gev-voice-card-step',
              dataset: { status: st.status || 'pending' },
              text: st.label || st.name || '',
            }),
          ),
        );
        const res = c.result || {};
        cardResultBox.hidden = !res.visible;
        setTextSafe(cardResultTitle, res.title || '');
        cardResultChips.replaceChildren(
          ...(res.chips || []).map((ch) =>
            createEl(doc, 'span', {
              className: 'gev-voice-card-chip',
              dataset: ch.tone ? { tone: ch.tone } : {},
              text: ch.label || ch,
            }),
          ),
        );
        cardResultLines.replaceChildren(
          ...(res.lines || []).map((ln) => createEl(doc, 'li', { text: ln })),
        );
      }
    }

    // Chat drawer
    const chat = view.chat || {};
    const chatVisible = Boolean(chat.open && !chat.minimized);
    chatPanel.hidden = !chatVisible;
    chatButton.setAttribute('aria-expanded', chatVisible ? 'true' : 'false');
    chatButton.classList.toggle('is-active', Boolean(chat.open));
    chatMiniReplyEl.hidden = !(chat.open && chat.minimized && chat.miniReply);
    if (!chatMiniReplyEl.hidden) setTextSafe(chatMiniReplyEl, chat.miniReply);

    setTextSafe(chatStatusEl, chat.status || '');
    setTextSafe(chatPhaseEl, view.phase?.text || '');
    chatPhaseEl.setAttribute('aria-live', chatVisible ? 'off' : 'polite');
    chatPhaseEl.setAttribute('aria-hidden', chatVisible ? 'true' : 'false');

    chatBackBtn.hidden = !chat.backVisible;
    chatStopBtn.hidden = !chat.busy;
    chatSendBtn.disabled = Boolean(chat.sendDisabled);
    chatMessagesEl.setAttribute(
      'aria-busy',
      chat.busy || chat.revealing ? 'true' : 'false',
    );
    if (typeof chat.draft === 'string' && chatInput.value !== chat.draft) {
      chatInput.value = chat.draft;
    }

    // Populate attach layers if dataManager exists
    const layers = Array.isArray(chat.layers) ? chat.layers : [];
    chatAttachBtn.hidden = layers.length === 0;
    chatLayerSelect.hidden = !chat.attachMenuOpen || layers.length === 0;
    if (layers.length) {
      const opts = [
        createEl(doc, 'option', { value: '', text: 'Elegir capa…' }),
        ...layers.map((l) =>
          createEl(doc, 'option', {
            value: l.id,
            text: l.label || l.id,
          }),
        ),
      ];
      chatLayerSelect.replaceChildren(...opts);
    }

    // Settings panel
    const vp = view.voicePanel || {};
    voicePanel.hidden = Boolean(vp.hidden);
    settingsBtn.setAttribute('aria-expanded', vp.hidden ? 'false' : 'true');
    const selectedTab = vp.selected || 'preview';
    previewTab.setAttribute(
      'aria-selected',
      selectedTab === 'preview' ? 'true' : 'false',
    );
    settingsTab.setAttribute(
      'aria-selected',
      selectedTab === 'settings' ? 'true' : 'false',
    );
    previewBody.hidden = selectedTab !== 'preview';
    settingsBody.hidden = selectedTab !== 'settings';
    if (view.preferences) {
      previewCheckbox.checked = Boolean(view.preferences.previewChecked);
      if (view.preferences.timeoutChoice) {
        timeoutSelect.value = view.preferences.timeoutChoice;
      }
    }
  }

  function renderBars(bars) {
    if (disposed) return;
    if (!Array.isArray(bars) || !bars.length) {
      for (const span of barSpans) {
        span.style.removeProperty('--audio-level');
        span.style.removeProperty('--audio-opacity');
      }
      return;
    }
    barSpans.forEach((span, idx) => {
      const b = bars[idx] || bars[idx % bars.length];
      if (b) {
        span.style.setProperty('--audio-level', b.level);
        span.style.setProperty('--audio-opacity', b.opacity);
      }
    });
  }

  function renderMessages(list) {
    if (disposed) return;
    const msgs = Array.isArray(list) ? list : [];
    if (!msgs.length) {
      chatMessagesEl.replaceChildren(
        createEl(doc, 'div', {
          className: 'gev-chat-empty',
          text: 'Pregúntale a Gemini por ubicaciones, capas en tiempo real, análisis de aeronaves/buques o controla la cámara.',
        }),
      );
      return;
    }
    chatMessagesEl.replaceChildren(
      ...msgs.map((msg) =>
        createEl(
          doc,
          'div',
          {
            className: 'gev-chat-msg',
            dataset: { role: msg.role || 'assistant' },
          },
          [
            createEl(doc, 'span', {
              className: 'gev-chat-msg-role',
              text: msg.role === 'user' ? 'TÚ' : 'GEMINI',
            }),
            createEl(doc, 'div', {
              className: 'gev-chat-msg-text',
              text: msg.text || '',
            }),
          ],
        ),
      ),
    );
    if (messagesPinnedBottom) {
      chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }
  }

  // Subscribe to Pinia voice store
  const stopWatchView = watch(
    () => store.view,
    (v) => renderView(v),
    { immediate: true },
  );
  const stopWatchBars = watch(
    () => store.bars,
    (b) => renderBars(b),
    { immediate: true },
  );
  const stopWatchChat = watch(
    () => store.chatMessages,
    (m) => renderMessages(m),
    { immediate: true, deep: true },
  );

  // Also speak final typed-chat assistant transcripts if TTS toggle is ON
  const unsubSession = session?.subscribe?.((event) => {
    if (disposed || !ttsEnabled) return;
    const isTextOnly = Boolean(session?.adapter?.getStartOptions?.().textOnly);
    if (
      isTextOnly &&
      event?.type === 'transcript' &&
      event.role === 'assistant' &&
      event.final &&
      event.text
    ) {
      const lang = doc.documentElement?.lang || 'es';
      speakText(event.text, lang.startsWith('en') ? 'en-US' : 'es-ES');
    }
  });

  // Expose minimal dataManager check so unused-param lint is happy
  void dataManager;

  const destroy = () => {
    if (disposed) return;
    disposed = true;
    stopDictation();
    stopWatchView?.();
    stopWatchBars?.();
    stopWatchChat?.();
    unsubSession?.();
    root.remove();
  };

  if (signal) {
    signal.addEventListener('abort', destroy, { once: true });
    if (signal.aborted) destroy();
  }

  return { root, destroy };
}
