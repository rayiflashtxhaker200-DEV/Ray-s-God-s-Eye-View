import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { geminiVoiceProxy, describeGeminiVoiceActions } from './gemini.js';
import { createGeminiChatHandler } from './gemini/chat.js';
import { createGeminiTokenHandler } from './gemini/realtime.js';
import { isGeminiRequestOriginAllowed } from './gemini/request.js';

function mockReq(method, url, body = null, headers = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = {
    host: 'localhost:3000',
    origin: 'http://localhost:3000',
    ...headers,
  };
  req.socket = { remoteAddress: '127.0.0.1' };
  queueMicrotask(() => {
    if (body !== null) {
      req.emit(
        'data',
        Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
      );
    }
    req.emit('end');
  });
  return req;
}

function mockRes() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.body = '';
  res.destroyed = false;
  res.writableEnded = false;
  res.setHeader = function setHeader(k, v) {
    this.headers[k.toLowerCase()] = v;
  };
  res.end = function end(chunk = '') {
    this.body += chunk ? String(chunk) : '';
    this.writableEnded = true;
    this.emit('finish');
    this._resolve?.(this);
  };
  res.done = new Promise((r) => {
    res._resolve = r;
  });
  return res;
}

function mountProxy(plugin) {
  const routes = new Map();
  plugin.configureServer({
    middlewares: {
      use(route, fn) {
        routes.set(route, fn);
      },
    },
  });
  return routes;
}

test('isGeminiRequestOriginAllowed permits localhost & matching proxy origins while rejecting cross-site', () => {
  assert.equal(
    isGeminiRequestOriginAllowed({
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
      socket: { remoteAddress: '127.0.0.1' },
    }),
    true,
  );
  assert.equal(
    isGeminiRequestOriginAllowed({
      headers: {
        host: '127.0.0.1:3000',
        'x-forwarded-host': 'preview-app.us-west1.run.app',
        origin: 'https://preview-app.us-west1.run.app',
      },
    }),
    true,
  );
  assert.equal(
    isGeminiRequestOriginAllowed({
      headers: {
        host: 'localhost:3000',
        origin: 'https://evil.example',
      },
    }),
    false,
  );
  assert.equal(
    isGeminiRequestOriginAllowed({
      headers: {
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
        'sec-fetch-site': 'cross-site',
      },
    }),
    false,
  );
});

test('geminiVoiceProxy exposes GET /api/gemini/status and enforces missing GEMINI_API_KEY as 503', async () => {
  const routes = mountProxy(
    geminiVoiceProxy({
      resolveApiKey: () => '',
    }),
  );
  const statusHandler = routes.get('/api/gemini/status');
  const voiceHandler = routes.get('/api/gemini/voice');

  const resStatus = mockRes();
  await statusHandler(mockReq('GET', '/api/gemini/status'), resStatus);
  await resStatus.done;
  assert.equal(resStatus.statusCode, 200);
  const statusJson = JSON.parse(resStatus.body);
  assert.equal(statusJson.available, false);
  assert.equal(statusJson.model, 'gemini-4-hydrogen');

  const resVoice = mockRes();
  await voiceHandler(
    mockReq('POST', '/api/gemini/voice', { prompt: 'Vuela a Tokio' }),
    resVoice,
  );
  await resVoice.done;
  assert.equal(resVoice.statusCode, 503);
  assert.equal(JSON.parse(resVoice.body).code, 'API_KEY_MISSING');
});

test('geminiVoiceProxy rejects cross-origin commands without contacting Gemini', async () => {
  let contactedGemini = false;
  const routes = mountProxy(
    geminiVoiceProxy({
      resolveApiKey: () => 'test-key-123',
      createAiClient: () => {
        contactedGemini = true;
        throw new Error('Gemini must not be contacted');
      },
    }),
  );
  const res = mockRes();
  await routes.get('/api/gemini/voice')(
    mockReq(
      'POST',
      '/api/gemini/voice',
      { prompt: 'Vuela a Tokio' },
      { origin: 'https://evil.example' },
    ),
    res,
  );
  await res.done;
  assert.equal(res.statusCode, 403);
  assert.equal(contactedGemini, false);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('geminiVoiceProxy rate-limits same-origin model requests per client', async () => {
  let contactedGemini = 0;
  const routes = mountProxy(
    geminiVoiceProxy({
      resolveApiKey: () => 'test-key-123',
      resolveRateLimit: () => '1',
      createAiClient: () => ({
        models: {
          async generateContent() {
            contactedGemini++;
            return { text: 'Listo.' };
          },
        },
      }),
    }),
  );
  const handler = routes.get('/api/gemini/voice');
  const first = mockRes();
  await handler(
    mockReq('POST', '/api/gemini/voice', { prompt: 'Primera solicitud' }),
    first,
  );
  await first.done;
  assert.equal(first.statusCode, 200);

  const second = mockRes();
  await handler(
    mockReq('POST', '/api/gemini/voice', { prompt: 'Segunda solicitud' }),
    second,
  );
  await second.done;
  assert.equal(second.statusCode, 429);
  assert.equal(second.headers['retry-after'], '60');
  assert.equal(contactedGemini, 1);
});

test('geminiVoiceProxy executes gemini-4-hydrogen with live context, returns tool calls, and synthesizes dynamic summary', async () => {
  const calls = [];
  const routes = mountProxy(
    geminiVoiceProxy({
      resolveApiKey: () => 'test-key-123',
      overpassConfigured: () => false,
      createAiClient: () => ({
        models: {
          async generateContent(args) {
            calls.push(args);
            return {
              text: '',
              functionCalls: [
                { name: 'fly_to_location', args: { query: 'Tokio' } },
                {
                  name: 'set_layer_visibility',
                  args: { layerId: 'flights', enabled: true },
                },
              ],
            };
          },
        },
      }),
    }),
  );

  const handler = routes.get('/api/gemini/voice');
  const res = mockRes();
  await handler(
    mockReq('POST', '/api/gemini/voice', {
      prompt: 'Vuela a Tokio y activa vuelos',
      context: {
        camera: { lat: 40.4168, lon: -3.7038, altitudeM: 15000 },
        visualStyle: 'thermal',
        enabledLayers: ['earthquakes'],
        locale: 'es',
        source: 'mobile-remote',
      },
      history: [{ role: 'user', text: 'Hola' }],
    }),
    res,
  );
  await res.done;
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.model, 'gemini-4-hydrogen');
  assert.equal(payload.functionCalls.length, 2);
  assert.match(payload.text, /Volando hacia Tokio/);
  assert.match(payload.text, /Activando capa flights/);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'gemini-4-hydrogen');
  assert.equal(calls[0].contents.length, 2);
  assert.match(calls[0].config.systemInstruction, /lat 40\.4168, lon -3\.7038/);
  assert.match(calls[0].config.systemInstruction, /thermal/);
});

test('describeGeminiVoiceActions generates readable ES/EN summaries', () => {
  assert.match(
    describeGeminiVoiceActions([{ name: 'zoom_to_globe', args: {} }], 'es'),
    /vista global/i,
  );
  assert.match(
    describeGeminiVoiceActions([{ name: 'zoom_to_globe', args: {} }], 'en'),
    /globe view/i,
  );
});

test('createGeminiChatHandler validates provider/context and injects User-Agent and scene telemetry', async () => {
  const requests = [];
  const handler = createGeminiChatHandler({
    resolveApiKey: () => 'chat-test-key',
    fetchImpl: async (url, init) => {
      requests.push({ url, init, body: JSON.parse(init.body) });
      return Response.json({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'Ves Madrid con vuelos activos.' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 8,
          totalTokenCount: 18,
        },
      });
    },
  });

  const res = mockRes();
  await handler(
    mockReq(
      'POST',
      '/api/gemini/chat',
      {
        provider: 'gemini',
        contents: [{ role: 'user', parts: [{ text: '¿Qué estoy viendo?' }] }],
        context: {
          camera: { lat: 40.4168, lon: -3.7038, altitudeM: 9000 },
          visualStyle: 'normal',
          enabledLayers: ['flights'],
          locale: 'es',
        },
      },
      {
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
    ),
    res,
  );
  await res.done;
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.content.parts[0].text, 'Ves Madrid con vuelos activos.');
  assert.match(requests[0].url, /models\/gemini-4-hydrogen:generateContent/);
  assert.equal(requests[0].init.headers['User-Agent'], 'aistudio-build');
  assert.match(
    requests[0].body.systemInstruction.parts[0].text,
    /40\.4168, -3\.7038/,
  );
  assert.equal(requests[0].body.generationConfig.temperature, undefined);
});

test('createGeminiTokenHandler mints Live auth token for gemini-3.8-live with aistudio-build User-Agent', async () => {
  const requests = [];
  const handler = createGeminiTokenHandler({
    resolveApiKey: () => 'live-test-key',
    fetchImpl: async (url, init) => {
      requests.push({ url, init, body: JSON.parse(init.body) });
      return Response.json({
        name: 'auth_tokens/mock-123',
        expireTime: '2099-01-01T00:15:00Z',
        newSessionExpireTime: '2099-01-01T00:05:00Z',
      });
    },
  });

  const res = mockRes();
  await handler(
    mockReq('POST', '/api/gemini/token', '{}', {
      origin: 'http://localhost:3000',
      'content-type': 'application/json',
    }),
    res,
  );
  await res.done;
  assert.equal(res.statusCode, 200);
  const json = JSON.parse(res.body);
  assert.equal(json.token, 'auth_tokens/mock-123');
  assert.equal(requests[0].init.headers['User-Agent'], 'aistudio-build');
  assert.match(
    requests[0].body.bidiGenerateContentSetup.model,
    /gemini-3\.8-live/,
  );
});
