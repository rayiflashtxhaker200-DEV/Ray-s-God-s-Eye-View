import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeRemoteCommand,
  sendRemoteCommand,
} from './mobileRemoteController.js';
import { createProviderCommands } from './voice/providerCommands.js';
import { createTextChat } from './voice/textChat.js';

test('sendRemoteCommand explains when the configured server responds with HTML', async () => {
  await assert.rejects(
    sendRemoteCommand({
      serverUrl: 'https://static.example.test',
      command: { action: 'zoom_to_globe', args: {} },
      fetchImpl: async () =>
        new Response('<!doctype html><title>Not found</title>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    }),
    /contenido no JSON \(text\/html\).*servidor activo de Ray's Eye View/,
  );
});

test('executeRemoteCommand resolves layer aliases like vessels -> ais-live-vessels', () => {
  const enabledCalls = [];
  const dataManager = {
    layers: new Map([['ais-live-vessels', { enabled: false }]]),
    setEnabled(id, enabled, opts) {
      enabledCalls.push({ id, enabled, opts });
    },
  };
  const ok = executeRemoteCommand(
    {
      action: 'set_layer_visibility',
      args: { layer: 'vessels', enabled: true },
    },
    { dataManager },
  );
  assert.equal(ok, true);
  assert.deepEqual(enabledCalls, [
    { id: 'ais-live-vessels', enabled: true, opts: { origin: 'user' } },
  ]);
});

test('executeRemoteCommand delegates named fly_to_location and extended Gemini tools to voiceCommands.runner', () => {
  const executed = [];
  const voiceCommands = {
    async runner(name, args) {
      executed.push({ name, args });
      return { ok: true };
    },
  };

  assert.equal(
    executeRemoteCommand(
      { action: 'fly_to_location', args: { query: 'Tokio' } },
      { voiceCommands },
    ),
    true,
  );
  assert.equal(
    executeRemoteCommand(
      { action: 'set_visual_style', args: { style: 'thermal' } },
      { voiceCommands },
    ),
    true,
  );
  assert.equal(
    executeRemoteCommand(
      { action: 'analyst_query', args: { layerId: 'flights', count: true } },
      { voiceCommands },
    ),
    true,
  );
  assert.equal(
    executeRemoteCommand(
      { action: 'unknown_tool_xyz', args: {} },
      { voiceCommands },
    ),
    false,
  );

  assert.deepEqual(executed, [
    { name: 'fly_to_location', args: { query: 'Tokio' } },
    { name: 'set_visual_style', args: { style: 'thermal' } },
    { name: 'analyst_query', args: { layerId: 'flights', count: true } },
  ]);
});

test('createProviderCommands selects gemini by default when supported', () => {
  let bound = null;
  const geminiFactory = () => ({});
  const openaiFactory = () => ({});
  createProviderCommands(
    { supportedProviders: ['gemini', 'openai'] },
    {
      factories: { gemini: geminiFactory, openai: openaiFactory },
      bind(settings) {
        bound = settings;
        return settings;
      },
    },
  );
  assert.equal(bound.initialProvider, 'gemini');
  assert.equal(bound.createSession, geminiFactory);
  assert.deepEqual(bound.supportedProviders, ['gemini', 'openai']);
});

test('createTextChat injects live scene telemetry from readContext into /api/gemini/chat', async () => {
  const requests = [];
  const chat = createTextChat({
    provider: 'gemini',
    endpoint: '/api/gemini/chat',
    readContext: () => ({
      camera: { lat: 35.6762, lon: 139.6503, altitudeM: 4200 },
      visualStyle: 'thermal',
      enabledLayers: ['flights'],
      locale: 'es',
    }),
    fetchImpl: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return Response.json({
        content: {
          role: 'model',
          parts: [{ text: 'Ves Tokio en modo térmico.' }],
        },
      });
    },
  });

  chat.start();
  assert.equal(chat.sendText('¿Qué estoy viendo?'), true);
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/gemini/chat');
  assert.equal(requests[0].body.provider, 'gemini');
  assert.equal(requests[0].body.context.visualStyle, 'thermal');
  assert.equal(requests[0].body.context.camera.lat, 35.6762);
  chat.stop();
});
