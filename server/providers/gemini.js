import { GoogleGenAI } from '@google/genai';

const GEV_GEMINI_TOOLS = [
  {
    name: 'fly_to_location',
    description: 'Fly the 3D globe camera to a specific city, country, landmark, ocean, or coordinates.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Name of the city, country, place or coordinates (e.g. "Paris", "Tokyo", "Caracas", "Gibraltar", "Area 51")',
        },
        locationId: {
          type: 'STRING',
          description: 'Optional standard shortcut: austin, sf, nyc, tokyo, london, paris, dubai, dc',
        },
        latitude: {
          type: 'NUMBER',
          description: 'Target latitude in degrees (-90 to 90)',
        },
        longitude: {
          type: 'NUMBER',
          description: 'Target longitude in degrees (-180 to 180)',
        },
        rangeM: {
          type: 'NUMBER',
          description: 'Camera altitude/range in meters (e.g. 5000 for city view, 20000 for overview)',
        },
      },
    },
  },
  {
    name: 'zoom_to_globe',
    description: 'Reset the camera to show the whole planet Earth / global overview view.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'adjust_camera_zoom',
    description: 'Zoom the camera in closer or out farther.',
    parameters: {
      type: 'OBJECT',
      properties: {
        direction: {
          type: 'STRING',
          description: '"in" to zoom in closer, "out" to zoom out farther',
        },
      },
      required: ['direction'],
    },
  },
  {
    name: 'set_layer_visibility',
    description: 'Turn a data layer on or off (flights, vessels, satellites, cctv, firms, earthquakes, traffic, radio).',
    parameters: {
      type: 'OBJECT',
      properties: {
        layerId: {
          type: 'STRING',
          description: 'The layer identifier: "flights" (aircraft), "vessels" (ships/AIS), "satellites", "cctv" (cameras), "firms" (wildfires), "earthquakes", "traffic", "radio"',
        },
        enabled: {
          type: 'BOOLEAN',
          description: 'true to show/enable, false to hide/disable',
        },
      },
      required: ['layerId', 'enabled'],
    },
  },
  {
    name: 'apply_visual_style',
    description: 'Change the visual sensor style or color grading shader on the 3D globe.',
    parameters: {
      type: 'OBJECT',
      properties: {
        style: {
          type: 'STRING',
          description: 'Visual style: "normal", "surveillance", "thermal" (FLIR), "retro", "noir", "anime", "snow"',
        },
      },
      required: ['style'],
    },
  },
  {
    name: 'select_nearest_aircraft',
    description: 'Track and zoom into the nearest aircraft or flight.',
    parameters: {
      type: 'OBJECT',
      properties: {
        layerId: {
          type: 'STRING',
          description: '"flights" or "military"',
        },
      },
      required: ['layerId'],
    },
  },
  {
    name: 'stop_all_motion',
    description: 'Stop any current camera flights, cinematic tours, or tracking.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
];

const SYSTEM_INSTRUCTION = `You are the voice AI agent for "God's Eye View", an advanced tactical geospatial intelligence console for planet Earth.
You receive real-time voice instructions from the user (in English or Spanish) and control the 3D globe by triggering function calls.
Rules:
1. Always call the corresponding tool when the user requests an action (e.g. fly somewhere, zoom, toggle layers, change visual style, stop).
2. For location requests like "vuela a París", "take me to Tokyo", "enséñame Madrid", call fly_to_location with query="Paris" or the requested location.
3. For layer toggles like "activa vuelos", "show ships", "apaga satélites", call set_layer_visibility.
4. For styles like "modo térmico", "visión nocturna", "estilo retro", call apply_visual_style with "thermal", "surveillance", "retro", etc.
5. Provide a crisp, tactical spoken response (1-2 sentences maximum, military intelligence tone). If user speaks Spanish, reply in Spanish. If in English, reply in English.`;

export function geminiVoiceProxy() {
  const handler = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }

    // Status check
    if (req.method === 'GET') {
      const apiKey = process.env.GEMINI_API_KEY || '';
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        ok: true,
        available: Boolean(apiKey),
        provider: 'gemini',
        model: 'gemini-2.5-flash',
      }));
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const prompt = String(payload.prompt || payload.text || payload.audioText || '').trim();
          const userKey = payload.apiKey || payload.userKey;
          const apiKey = userKey || process.env.GEMINI_API_KEY;

          if (!apiKey) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              ok: false,
              error: 'Falta la GEMINI_API_KEY. Por favor introduce tu API Key de Google Gemini.',
            }));
          }

          if (!prompt) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              ok: false,
              error: 'No se recibió ninguna instrucción de voz.',
            }));
          }

          const ai = new GoogleGenAI({ apiKey });
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              tools: [{ functionDeclarations: GEV_GEMINI_TOOLS }],
            },
          });

          const functionCalls = [];
          if (response.functionCalls && Array.isArray(response.functionCalls)) {
            for (const call of response.functionCalls) {
              functionCalls.push({
                name: call.name,
                args: call.args || {},
              });
            }
          }

          const replyText = response.text || (functionCalls.length > 0 ? 'Entendido. Ejecutando maniobra.' : 'Comando recibido.');

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({
            ok: true,
            text: replyText,
            functionCalls,
          }));
        } catch (err) {
          console.error('[GeminiVoice] Error:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({
            ok: false,
            error: err.message || 'Error procesando comando de voz con Gemini',
          }));
        }
      });
      return;
    }

    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
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
