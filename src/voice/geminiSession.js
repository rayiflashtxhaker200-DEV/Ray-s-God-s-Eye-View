/**
 * Real-time Gemini Voice Session Adapter for God's Eye View
 *
 * Replaces or supplements OpenAI Realtime with Google Gemini:
 * 1. Captures microphone speech using Web Speech API (SpeechRecognition) or AudioStream.
 * 2. Real-time visualizer bars on the HUD animate with audio input.
 * 3. Sends prompt to /api/gemini/voice.
 * 4. Executes function calls (fly_to_location, set_layer_visibility, zoom, styles) via runAction.
 * 5. Synthesizes tactical speech response back to the user.
 */

export const STORAGE_GEMINI_KEY = 'gev_gemini_api_key';

export function createGeminiSession({
  emit,
  runAction,
  ui,
  runner,
  signal,
}) {
  let active = false;
  let recognition = null;
  let audioContext = null;
  let analyser = null;
  let animFrameId = null;
  let mediaStream = null;
  let spaceKeyHeld = false;
  let processing = false;

  const SpeechRecognition =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  function updateVisualizer(level = 0) {
    if (!ui?.root) return;
    const bars = ui.root.querySelectorAll('.gev-voice-visualizer span');
    bars.forEach((bar, idx) => {
      const height = Math.max(4, Math.sin((idx + Date.now() / 150)) * level * 24 + level * 16);
      bar.style.height = `${Math.min(28, height)}px`;
    });
  }

  function startAudioMeter(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      audioContext = new AudioCtx();
      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      function tick() {
        if (!active) return;
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length / 255;
        updateVisualizer(avg);
        animFrameId = requestAnimationFrame(tick);
      }
      tick();
    } catch {
      // ignore
    }
  }

  function stopAudioMeter() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = null;
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(() => {});
    }
    audioContext = null;
    updateVisualizer(0);
  }

  function speakText(text) {
    if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 0.95;
      // Prefer Spanish voice if text is Spanish, else English
      const isSpanish = /[áéíóúñ¿¡]|(vuela|activo|cambio|modo|capa)/i.test(text);
      const voices = window.speechSynthesis.getVoices();
      const matched = voices.find((v) => (isSpanish ? v.lang.startsWith('es') : v.lang.startsWith('en')));
      if (matched) utterance.voice = matched;
      window.speechSynthesis.speak(utterance);
    } catch {
      // speech synthesis optional
    }
  }

  async function handleVoiceCommand(transcript) {
    if (!transcript || processing) return;
    processing = true;

    emit({ type: 'state', state: 'thinking', detail: `Procesando: "${transcript}"` });
    if (ui?.detail) ui.detail.textContent = `Gemini: "${transcript}"`;

    try {
      const storedKey = localStorage.getItem(STORAGE_GEMINI_KEY) || '';
      const response = await fetch('/api/gemini/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: transcript,
          apiKey: storedKey || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      // Execute function calls
      if (data.functionCalls?.length) {
        for (const call of data.functionCalls) {
          emit({ type: 'state', state: 'executing', detail: `Ejecutando: ${call.name}` });
          if (ui?.detail) ui.detail.textContent = `Ejecutando: ${call.name}`;
          await runAction(call.name, call.args || {});
        }
      }

      // Voice response back
      if (data.text) {
        speakText(data.text);
      }

      emit({ type: 'state', state: 'active', detail: data.text || 'Orden completada' });
      if (ui?.detail) ui.detail.textContent = data.text || 'Orden completada';
    } catch (err) {
      console.warn('[GeminiVoice] Command error:', err);
      emit({ type: 'state', state: 'error', detail: err.message });
      if (ui?.detail) ui.detail.textContent = `Error: ${err.message}`;
    } finally {
      processing = false;
    }
  }

  function promptForGeminiKeyIfNeeded() {
    const existing = localStorage.getItem(STORAGE_GEMINI_KEY);
    if (!existing) {
      const key = prompt(
        'Ingresa tu API Key de Google Gemini (puedes obtenerla gratis en aistudio.google.com):',
      );
      if (key && key.trim()) {
        localStorage.setItem(STORAGE_GEMINI_KEY, key.trim());
      }
    }
  }

  return {
    capabilities: { costControls: false, pushToTalk: true },
    isActive: () => active,

    async start({ pushToTalk = false } = {}) {
      if (active) return;
      promptForGeminiKeyIfNeeded();

      active = true;
      emit({ type: 'state', state: 'connecting', detail: 'Conectando micrófono a Gemini...' });

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        startAudioMeter(mediaStream);

        if (SpeechRecognition) {
          recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = navigator.language || 'es-ES';

          recognition.onresult = (event) => {
            let interim = '';
            let final = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                final += transcript;
              } else {
                interim += transcript;
              }
            }

            if (interim && ui?.detail) {
              ui.detail.textContent = `Escuchando: ${interim}`;
            }

            if (final.trim()) {
              handleVoiceCommand(final.trim());
            }
          };

          recognition.onerror = (e) => {
            if (e.error !== 'no-speech') {
              console.warn('[GeminiSpeech] Recognition error:', e.error);
            }
          };

          recognition.onend = () => {
            if (active && recognition) {
              try {
                recognition.start();
              } catch {
                // ignore
              }
            }
          };

          recognition.start();
        }

        emit({ type: 'state', state: 'active', detail: 'Micrófono activo. Habla a Gemini...' });
        if (ui?.detail) ui.detail.textContent = 'Gemini en línea. Habla o pide cualquier acción...';
      } catch (err) {
        active = false;
        stopAudioMeter();
        emit({ type: 'state', state: 'error', detail: `Permiso de micrófono denegado: ${err.message}` });
      }
    },

    stop() {
      active = false;
      if (recognition) {
        recognition.stop();
        recognition = null;
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
        mediaStream = null;
      }
      stopAudioMeter();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      emit({ type: 'state', state: 'idle', detail: 'Voz apagada' });
    },

    sendText(text) {
      return handleVoiceCommand(text);
    },

    sendMapEvent() {
      // Map events optional
    },

    ignoreButtonClick: () => Boolean(spaceKeyHeld),

    bindControls() {
      // Push-to-talk with Spacebar
      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !spaceKeyHeld && e.target === document.body) {
          spaceKeyHeld = true;
          this.start({ pushToTalk: true });
        }
      });

      window.addEventListener('keyup', (e) => {
        if (e.code === 'Space' && spaceKeyHeld) {
          spaceKeyHeld = false;
          // After holding space to speak, give 1.2s to finish recognizing then turn off if push-to-talk
          setTimeout(() => {
            if (!spaceKeyHeld && active) {
              this.stop();
            }
          }, 1200);
        }
      });
    },
  };
}
