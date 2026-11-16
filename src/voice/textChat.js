/**
 * Bounded multi-turn tool-calling text chat adapter for Gemini and OpenAI endpoints.
 */

const MAX_TOOL_TURNS = 8;
const MAX_TOOL_RESULT_BYTES = 12_000;

function truncateToolPayload(value) {
  if (!value || typeof value !== 'object') return value;
  const { image, images, media, dataUrl, ...rest } = value;
  void image;
  void images;
  void media;
  void dataUrl;
  const serialized = JSON.stringify(rest);
  if (new TextEncoder().encode(serialized).length <= MAX_TOOL_RESULT_BYTES) {
    return rest;
  }
  const compact = { ...rest, truncated: true };
  if (Array.isArray(compact.records)) {
    compact.records = [];
  }
  if (compact.data && typeof compact.data === 'object') {
    compact.data = { truncated: true };
  }
  const retry = JSON.stringify(compact);
  if (new TextEncoder().encode(retry).length <= MAX_TOOL_RESULT_BYTES) {
    return compact;
  }
  return {
    ok: compact.ok !== false,
    ...(compact.say ? { say: String(compact.say).slice(0, 500) } : {}),
    truncated: true,
  };
}

export function createTextChat({
  emit = () => {},
  runAction = async () => ({ ok: false, error: 'Unavailable' }),
  fetchImpl = globalThis.fetch?.bind(globalThis),
  signal = null,
  provider = 'gemini',
  endpoint = '/api/gemini/chat',
  maxTurns = MAX_TOOL_TURNS,
  readContext = null,
} = {}) {
  let active = false;
  let turnAbort = null;
  const contents = [];

  function abortCurrentTurn() {
    if (turnAbort) {
      turnAbort.abort();
      turnAbort = null;
    }
  }

  async function runConversationTurn(userText) {
    abortCurrentTurn();
    const ac = new AbortController();
    turnAbort = ac;
    const combinedSignal = signal
      ? AbortSignal.any([signal, ac.signal])
      : ac.signal;

    contents.push({
      role: 'user',
      parts: [{ text: String(userText) }],
    });

    const usage = {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      unknownRequests: 0,
    };

    try {
      for (let step = 0; step < maxTurns; step++) {
        if (!active || combinedSignal.aborted) return;
        let liveContext = null;
        if (typeof readContext === 'function') {
          try {
            liveContext = readContext();
          } catch {
            liveContext = null;
          }
        }
        const requestPayload = {
          provider,
          contents,
          ...(liveContext && typeof liveContext === 'object'
            ? { context: liveContext }
            : {}),
        };
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload),
          signal: combinedSignal,
        });
        if (!active || combinedSignal.aborted) return;
        let payload = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        if (!active || combinedSignal.aborted) return;

        usage.requests++;
        if (payload?.usage && typeof payload.usage === 'object') {
          usage.inputTokens += Number(payload.usage.inputTokens) || 0;
          usage.outputTokens += Number(payload.usage.outputTokens) || 0;
          usage.totalTokens += Number(payload.usage.totalTokens) || 0;
        } else {
          usage.unknownRequests++;
        }

        if (!response.ok) {
          throw new Error(payload?.error || `Chat HTTP ${response.status}`);
        }

        const modelContent = payload?.content;
        const parts = Array.isArray(modelContent?.parts)
          ? modelContent.parts
          : [];
        if (modelContent) {
          contents.push(modelContent);
        }

        const calls = parts.filter((part) => part?.functionCall);
        if (!calls.length) {
          const text = parts
            .map((p) => p?.text || '')
            .filter(Boolean)
            .join('\n');
          if (text) {
            emit({
              type: 'transcript',
              role: 'assistant',
              text,
              final: true,
            });
          }
          emit({
            type: 'completion',
            status: 'completed',
            usage,
          });
          return;
        }

        const responseParts = [];
        for (const part of calls) {
          if (!active || combinedSignal.aborted) return;
          const { name, args = {}, id } = part.functionCall;
          emit({
            type: 'action-call',
            name,
            callId: id,
            arguments: args,
          });
          const rawResult = await runAction(name, args, {
            signal: combinedSignal,
            callId: id,
          });
          if (!active || combinedSignal.aborted) return;
          emit({
            type: 'action-result',
            name,
            callId: id,
            result: rawResult,
          });
          responseParts.push({
            functionResponse: {
              ...(id !== undefined ? { id } : {}),
              name,
              response: truncateToolPayload(rawResult),
            },
          });
        }
        contents.push({ role: 'user', parts: responseParts });
      }

      emit({
        type: 'state',
        state: 'error',
        detail: 'Too many consecutive tool calls in chat turn.',
      });
    } catch (error) {
      if (error?.name === 'AbortError' || !active || combinedSignal.aborted) {
        return;
      }
      emit({
        type: 'state',
        state: 'error',
        detail: error?.message || 'Chat request failed',
      });
    } finally {
      if (turnAbort === ac) turnAbort = null;
    }
  }

  return {
    start() {
      active = true;
      emit({ type: 'state', state: 'listening' });
    },
    stop({ preserveStatus = false } = {}) {
      active = false;
      abortCurrentTurn();
      contents.length = 0;
      if (!preserveStatus) {
        emit({ type: 'state', state: 'idle' });
      }
    },
    cancelTurn() {
      if (!turnAbort) return false;
      abortCurrentTurn();
      emit({ type: 'completion', status: 'interrupted' });
      return true;
    },
    sendText(text) {
      const clean = String(text || '').trim();
      if (!active || !clean) return false;
      void runConversationTurn(clean);
      return true;
    },
    sendMapEvent() {
      return false;
    },
  };
}
