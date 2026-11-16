import { GoogleGenAI } from '@google/genai';
import { createGeminiTokenHandler } from './gemini/realtime.js';
import { createGeminiChatHandler } from './gemini/chat.js';
import {
  GEMINI_LIVE_MODEL_DEFAULT,
  normalizeGeminiModel,
} from './gemini/config.js';
import { GEV_REALTIME_TOOLS, offeredTools } from './openai/tools.js';
import { resolveOverpassUpstreams } from './overpass/constants.js';
import { clientKey, makeCostRateLimiter } from './common/rate-limit.js';
import { isGeminiRequestOriginAllowed } from './gemini/request.js';

export const GEMINI_VOICE_MODEL_DEFAULT = 'gemini-4-hydrogen';

function formatVoiceContext(context, localeHint = '') {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return localeHint ? `Idioma preferido / Locale: ${localeHint}` : '';
  }
  const lines = [];
  const locale = String(context.locale || localeHint || '').trim();
  if (locale) lines.push(`Idioma / Locale: ${locale.slice(0, 16)}`);
  if (context.source)
    lines.push(
      `Origen del comando / Source: ${String(context.source).slice(0, 32)}`,
    );
  if (context.camera && typeof context.camera === 'object') {
    const lat = Number(context.camera.lat ?? context.camera.latitude);
    const lon = Number(context.camera.lon ?? context.camera.longitude);
    const alt = Number(context.camera.altitudeM ?? context.camera.height);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      lines.push(
        `Cámara actual / Camera: lat ${lat.toFixed(4)}, lon ${lon.toFixed(4)}` +
          (Number.isFinite(alt) ? `, altitud ${Math.round(alt)} m` : ''),
      );
    }
  }
  if (context.visualStyle) {
    lines.push(
      `Filtro visual activo / Visual style: ${String(context.visualStyle).slice(0, 32)}`,
    );
  }
  if (Array.isArray(context.enabledLayers)) {
    const active = context.enabledLayers
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    lines.push(
      `Capas activas / Enabled layers: ${active.length ? active.join(', ') : 'ninguna'}`,
    );
  }
  if (context.trackedEntity) {
    lines.push(
      `Entidad seguida / Tracked entity: ${String(context.trackedEntity).slice(0, 120)}`,
    );
  }
  return lines.length
    ? `\n\nTELEMETRÍA EN VIVO DEL GLOBO 3D:\n${lines.join('\n')}`
    : '';
}

function buildVoiceSystemInstruction(context, localeHint) {
  const telemetry = formatVoiceContext(context, localeHint);
  return (
    `Eres el asistente de voz y control inteligente de "Ray's Eye View", una consola geoespacial 3D en tiempo real sobre el planeta Tierra (Cesium 3D).\n` +
    `Recibes comandos de voz transcritos o mensajes de texto en español o inglés y respondes de forma dinámica, natural, precisa y breve (1-3 frases claras para lectura o síntesis de voz).\n` +
    `REGLAS IMPORTANTES:\n` +
    `1. Cuando el usuario pida una acción sobre el mapa (volar a un lugar, hacer zoom, cambiar vista global, activar/desactivar capas, cambiar estilo visual, mover/orbitar cámara, HUD, radio, seguimiento, anotaciones, consultar vista), INVOCA SIEMPRE las herramientas (function calls) correspondientes.\n` +
    `2. Para navegar a lugares ("vuela a París", "llévame a Tokio", "fly to NYC", "ir a Caracas"), llama a \`fly_to_location\` pasando \`query\` (o \`locationId\` si coincide con austin, sf, nyc, tokyo, london, paris, dubai, dc, o \`latitude\`/\`longitude\`).\n` +
    `3. Para vista global ("planeta completo", "vista global", "globe view"), llama a \`zoom_to_globe\`. Para acercar o alejar ("acerca", "zoom out"), llama a \`adjust_camera_zoom\` con \`direction\` ('in'|'out') y \`amount\` ('little'|'medium'|'lot').\n` +
    `4. Para capas ("activa vuelos", "muestra barcos", "enciende satélites", "apaga incendios", "terremotos", "cámaras", "radio", "tráfico"), llama a \`set_layer_visibility\` usando los IDs exactos: "flights", "vessels" (o "ais-live-vessels"), "satellites", "cctv", "firms", "earthquakes", "traffic", "radio", "military", "local-datacenters", "local-dams".\n` +
    `5. Para estilos visuales ("modo térmico", "FLIR", "visión nocturna", "retro", "noir", "anime", "normal"), llama a \`set_visual_style\` con \`style\`: "normal", "retro", "surveillance", "thermal", "anime", "noir".\n` +
    `6. Para preguntas informativas o conversacionales ("¿qué estoy viendo?", "¿qué sabes de este lugar?", "resumen de capas activas", "¿qué puedo preguntarte?"), responde dinámicamente usando la telemetría en vivo del globo sin inventar datos.\n` +
    `7. Responde SIEMPRE en el idioma del usuario (español si habla/escribe en español, inglés si habla/escribe en inglés).` +
    telemetry
  );
}

export function describeGeminiVoiceActions(functionCalls = [], locale = 'es') {
  if (!Array.isArray(functionCalls) || !functionCalls.length) return '';
  const isSpanish = !String(locale || 'es')
    .toLowerCase()
    .startsWith('en');
  const summaries = functionCalls.map(({ name, args = {} }) => {
    switch (name) {
      case 'fly_to_location': {
        const place =
          args.query ||
          args.locationId ||
          (args.latitude != null ? `${args.latitude}, ${args.longitude}` : '');
        return isSpanish
          ? `Volando hacia ${place || 'el destino'}`
          : `Flying to ${place || 'destination'}`;
      }
      case 'zoom_to_globe':
        return isSpanish
          ? 'Mostrando vista global del planeta'
          : 'Zooming to full globe view';
      case 'adjust_camera_zoom':
        return isSpanish
          ? args.direction === 'out'
            ? 'Alejando la cámara'
            : 'Acercando la cámara'
          : args.direction === 'out'
            ? 'Zooming camera out'
            : 'Zooming camera in';
      case 'set_layer_visibility':
        return isSpanish
          ? `${args.enabled === false ? 'Desactivando' : 'Activando'} capa ${args.layerId || ''}`.trim()
          : `${args.enabled === false ? 'Disabling' : 'Enabling'} ${args.layerId || ''} layer`.trim();
      case 'set_visual_style':
        return isSpanish
          ? `Aplicando estilo visual ${args.style || ''}`.trim()
          : `Applying ${args.style || ''} visual style`.trim();
      case 'move_camera':
        return isSpanish
          ? args.motion === 'stop'
            ? 'Deteniendo movimiento de cámara'
            : `Ejecutando movimiento de cámara (${args.motion || ''})`
          : args.motion === 'stop'
            ? 'Stopping camera motion'
            : `Moving camera (${args.motion || ''})`;
      case 'stop_tracking':
        return isSpanish ? 'Seguimiento detenido' : 'Tracking stopped';
      case 'clear_annotations':
        return isSpanish
          ? 'Anotaciones limpiadas del mapa'
          : 'Cleared map annotations';
      default:
        return isSpanish
          ? `Acción ${name.replace(/_/g, ' ')} ejecutada`
          : `Executed ${name.replace(/_/g, ' ')}`;
    }
  });
  return `${summaries.join('. ')}.`;
}

function normalizeHistoryContents(history, prompt) {
  const contents = [];
  if (Array.isArray(history)) {
    for (const turn of history.slice(-10)) {
      if (!turn || typeof turn !== 'object') continue;
      const role =
        turn.role === 'model' || turn.role === 'assistant' ? 'model' : 'user';
      const text = String(turn.text || '').trim();
      if (!text) continue;
      contents.push({ role, parts: [{ text: text.slice(0, 2000) }] });
    }
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] });
  return contents;
}

function resolveUpstreamStatus(err) {
  const status = Number(err?.status || err?.statusCode || err?.cause?.status);
  if (status === 401 || status === 403) return 503;
  if (status === 429) return 429;
  if (status === 400 || status === 404) return 502;
  return 502;
}

function readJsonBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(
          Object.assign(new Error('Request body too large'), {
            statusCode: 413,
          }),
        );
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw.trim() ? JSON.parse(raw) : {});
      } catch {
        reject(
          Object.assign(new Error('Invalid JSON payload'), { statusCode: 400 }),
        );
      }
    });
    req.on('error', reject);
  });
}

export function geminiVoiceProxy({
  tools = GEV_REALTIME_TOOLS,
  overpassConfigured = () => resolveOverpassUpstreams().length > 0,
  resolveApiKey = () => process.env.GEMINI_API_KEY,
  resolveModel = () =>
    process.env.GEMINI_VOICE_MODEL || GEMINI_VOICE_MODEL_DEFAULT,
  resolveHost = () => process.env.HOST,
  resolveAllowedHosts = () => process.env.GEV_ALLOWED_HOSTS,
  resolveRateLimit = () => process.env.GEV_RATELIMIT_GEMINI_PER_MIN,
  createAiClient = (apiKey) =>
    new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    }),
} = {}) {
  let limiter;
  const sendJson = (res, statusCode, payload) => {
    res.statusCode = statusCode;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
  };

  const handler = async (req, res) => {
    if (req.method === 'OPTIONS') {
      if (
        !isGeminiRequestOriginAllowed(req, resolveHost(), resolveAllowedHosts())
      )
        return sendJson(res, 403, {
          ok: false,
          error: 'Gemini voice requires a same-origin app request',
        });
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Vary', 'Origin');
      res.statusCode = 204;
      return res.end();
    }

    const apiKey = String(resolveApiKey() || '').trim();
    const model =
      normalizeGeminiModel(resolveModel()) || GEMINI_VOICE_MODEL_DEFAULT;

    if (req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        available: Boolean(apiKey),
        liveAvailable: Boolean(apiKey),
        provider: 'gemini',
        model,
        liveModel: GEMINI_LIVE_MODEL_DEFAULT,
      });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    }

    try {
      if (
        !isGeminiRequestOriginAllowed(req, resolveHost(), resolveAllowedHosts())
      )
        return sendJson(res, 403, {
          ok: false,
          error: 'Gemini voice requires a same-origin app request',
        });
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Vary', 'Origin');
      if (limiter === undefined)
        limiter = makeCostRateLimiter(resolveRateLimit(), 30);
      if (limiter && !limiter(clientKey(req))) {
        res.setHeader('Retry-After', '60');
        return sendJson(res, 429, {
          ok: false,
          error: 'Gemini voice is starting too often. Try again shortly.',
        });
      }

      const payload = await readJsonBody(req);
      const prompt = String(
        payload.prompt || payload.text || payload.audioText || '',
      ).trim();

      if (!apiKey) {
        return sendJson(res, 503, {
          ok: false,
          code: 'API_KEY_MISSING',
          error:
            'GEMINI_API_KEY no está configurada en el entorno del servidor (Settings > Secrets).',
        });
      }

      if (!prompt) {
        return sendJson(res, 400, {
          ok: false,
          code: 'EMPTY_PROMPT',
          error: 'No se recibió ninguna instrucción de voz o texto.',
        });
      }

      const overpass = overpassConfigured();
      const functionDeclarations = offeredTools(tools, { overpass }).map(
        ({ name, description, parameters }) => ({
          name,
          description,
          parametersJsonSchema: structuredClone(parameters),
        }),
      );

      const ai = createAiClient(apiKey);
      const response = await ai.models.generateContent({
        model,
        contents: normalizeHistoryContents(payload.history, prompt),
        config: {
          systemInstruction: buildVoiceSystemInstruction(
            payload.context,
            payload.locale,
          ),
          tools: [{ functionDeclarations }],
        },
      });

      const functionCalls = Array.isArray(response?.functionCalls)
        ? response.functionCalls.map((call) => ({
            name: call.name,
            args: call.args && typeof call.args === 'object' ? call.args : {},
          }))
        : [];

      let replyText = String(response?.text || '').trim();
      if (!replyText && functionCalls.length > 0) {
        replyText = describeGeminiVoiceActions(
          functionCalls,
          payload.locale || payload.context?.locale || 'es',
        );
      } else if (!replyText) {
        replyText = 'Comando procesado.';
      }

      return sendJson(res, 200, {
        ok: true,
        provider: 'gemini',
        model,
        text: replyText,
        functionCalls,
      });
    } catch (err) {
      const status = err?.statusCode || resolveUpstreamStatus(err);
      const rawMessage = String(
        err?.message || 'Error procesando comando con Gemini.',
      );
      const safeMessage = apiKey
        ? rawMessage.replaceAll(apiKey, '[redacted]')
        : rawMessage;
      return sendJson(res, status, {
        ok: false,
        error: safeMessage,
      });
    }
  };

  return {
    name: 'gemini-voice-proxy',
    configureServer(server) {
      server.middlewares.use('/api/gemini/voice', handler);
      server.middlewares.use('/api/gemini/status', handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/gemini/voice', handler);
      server.middlewares.use('/api/gemini/status', handler);
    },
  };
}

export function geminiLiveProxy({ realtime = {} } = {}) {
  const tokenHandler = createGeminiTokenHandler(realtime);
  const chatHandler = createGeminiChatHandler(realtime);

  return {
    name: 'gemini-live-proxy',
    configureServer(server) {
      server.middlewares.use('/api/gemini/token', tokenHandler);
      server.middlewares.use('/api/gemini/chat', chatHandler);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/gemini/token', tokenHandler);
      server.middlewares.use('/api/gemini/chat', chatHandler);
    },
  };
}
