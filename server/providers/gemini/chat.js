import { createTextChatHandler } from '../common/textChat.js';
import { invalidCalls } from '../common/textTools.js';
import { textInstructions } from '../common/textInstructions.js';
import { GEV_REALTIME_TOOLS, offeredTools } from '../openai/tools.js';
import { resolveOverpassUpstreams } from '../overpass/constants.js';
import { normalizeGeminiModel } from './config.js';

// The Gemini token route's throttle default (GEV_RATELIMIT_GEMINI_PER_MIN).
export const GEMINI_DEFAULT_PER_MIN = 30;

const object = (value) =>
  value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) =>
  Object.keys(value).every((key) => allowed.includes(key));

// Only text and function exchanges may cross this route, never media or config.
export function validChatContents(contents, names) {
  return (
    Array.isArray(contents) &&
    contents.length > 0 &&
    contents.length <= 96 &&
    contents.every(
      (content) =>
        object(content) &&
        keys(content, ['role', 'parts']) &&
        ['user', 'model'].includes(content.role) &&
        Array.isArray(content.parts) &&
        content.parts.length > 0 &&
        content.parts.length <= 32 &&
        content.parts.every((part) => {
          if (
            !object(part) ||
            !keys(part, [
              'text',
              'functionCall',
              'functionResponse',
              'thoughtSignature',
            ])
          )
            return false;
          if (
            part.thoughtSignature !== undefined &&
            (typeof part.thoughtSignature !== 'string' ||
              part.thoughtSignature.length > 32000 ||
              content.role !== 'model')
          )
            return false;
          if (Object.hasOwn(part, 'text'))
            return (
              keys(part, ['text', 'thoughtSignature']) &&
              typeof part.text === 'string'
            );
          const call = part.functionCall ?? part.functionResponse;
          if (
            !object(call) ||
            typeof call.name !== 'string' ||
            call.name.length > 128 ||
            (names && !names.has(call.name)) ||
            (call.id !== undefined &&
              (typeof call.id !== 'string' || call.id.length > 1024))
          )
            return false;
          if (part.functionCall)
            return (
              content.role === 'model' &&
              keys(part, ['functionCall', 'thoughtSignature']) &&
              keys(call, ['name', 'args', 'id']) &&
              (call.args === null || object(call.args ?? {}))
            );
          return (
            content.role === 'user' &&
            keys(part, ['functionResponse']) &&
            keys(call, ['name', 'response', 'id']) &&
            object(call.response)
          );
        }),
    )
  );
}

function formatChatContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context))
    return '';
  const parts = [];
  if (typeof context.locale === 'string' && context.locale.trim()) {
    parts.push(`User locale: ${context.locale.trim().slice(0, 16)}`);
  }
  if (context.camera && typeof context.camera === 'object') {
    const lat = Number(context.camera.lat ?? context.camera.latitude);
    const lon = Number(context.camera.lon ?? context.camera.longitude);
    const alt = Number(context.camera.altitudeM ?? context.camera.height);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      parts.push(
        `Camera target: ${lat.toFixed(4)}, ${lon.toFixed(4)}` +
          (Number.isFinite(alt) ? ` at ${Math.round(alt)} m altitude` : ''),
      );
    }
  }
  if (typeof context.visualStyle === 'string' && context.visualStyle.trim()) {
    parts.push(
      `Active visual style: ${context.visualStyle.trim().slice(0, 32)}`,
    );
  }
  if (Array.isArray(context.enabledLayers)) {
    const layers = context.enabledLayers
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 24);
    parts.push(
      layers.length
        ? `Enabled data layers: ${layers.join(', ')}`
        : 'Enabled data layers: none',
    );
  }
  if (
    typeof context.trackedEntity === 'string' &&
    context.trackedEntity.trim()
  ) {
    parts.push(`Tracked entity: ${context.trackedEntity.trim().slice(0, 120)}`);
  }
  return parts.length
    ? `\n\nLIVE SCENE TELEMETRY (use to give dynamic, context-aware answers):\n${parts.join('\n')}`
    : '';
}

export function createGeminiChatHandler({
  annotationGuidance,
  tools = GEV_REALTIME_TOOLS,
  // osm_query is offered, and the prompt names it, only with Overpass, as
  // for voice.
  overpassConfigured = () => resolveOverpassUpstreams().length > 0,
  resolveChatModel = () => process.env.GEMINI_CHAT_MODEL || 'gemini-4-hydrogen',
  resolveApiKey = () => process.env.GEMINI_API_KEY,
  resolveProviderRateLimit = () => process.env.GEV_RATELIMIT_GEMINI_PER_MIN,
  ...options
} = {}) {
  return createTextChatHandler({
    ...options,
    provider: 'gemini',
    resolveApiKey,
    resolveProviderRateLimit,
    providerPerMin: GEMINI_DEFAULT_PER_MIN,
    prepare(input) {
      const model = normalizeGeminiModel(resolveChatModel());
      if (!model || /live|audio|tts/i.test(model)) return { errorStatus: 503 };
      if (
        !object(input) ||
        !keys(input, ['provider', 'contents', 'context']) ||
        (input.provider !== undefined && input.provider !== 'gemini') ||
        (input.context !== undefined &&
          input.context !== null &&
          !object(input.context)) ||
        !validChatContents(input.contents, null)
      )
        return null;
      if (!pairedContents(input.contents)) return null;
      const overpass = overpassConfigured();
      const sceneContextBlock = formatChatContext(input.context);
      return {
        endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        headers: (key) => ({
          'x-goog-api-key': key,
          'User-Agent': 'aistudio-build',
        }),
        body: {
          contents: input.contents,
          systemInstruction: {
            parts: [
              {
                text: `${textInstructions(annotationGuidance, { overpass })}${sceneContextBlock}`,
              },
            ],
          },
          tools: [
            {
              functionDeclarations: offeredTools(tools, { overpass }).map(
                ({ name, description, parameters }) => ({
                  name,
                  description,
                  parametersJsonSchema: parameters,
                }),
              ),
            },
          ],
          generationConfig: {
            maxOutputTokens: 4096,
            thinkingConfig: { thinkingLevel: 'LOW' },
          },
        },
      };
    },
    parse(data) {
      const candidate = data?.candidates?.[0];
      const content = candidate?.content;
      if (
        !content ||
        !validChatContents([content], null) ||
        content.role !== 'model'
      )
        return null;
      const calls = content.parts
        .filter((part) => part.functionCall)
        .map((part) => part.functionCall);
      return {
        content,
        finishReason: candidate.finishReason,
        invalidCalls: invalidCalls(
          calls,
          offeredTools(tools, { overpass: overpassConfigured() }),
        ),
      };
    },
  });
}

// Never forward an orphan result or an unfinished batch in browser history.
function pairedContents(contents) {
  let pending = [];
  for (const content of contents) {
    const calls = content.parts
      .filter((part) => part.functionCall)
      .map((part) => part.functionCall);
    const results = content.parts
      .filter((part) => part.functionResponse)
      .map((part) => part.functionResponse);
    if (pending.length) {
      if (
        calls.length ||
        results.length !== pending.length ||
        results.some(
          (result, i) =>
            result.name !== pending[i].name || result.id !== pending[i].id,
        )
      )
        return false;
      pending = [];
    } else if (results.length) return false;
    if (calls.length) pending = calls;
  }
  return !pending.length;
}
