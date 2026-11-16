export async function readWindBody(response, maxBytes = 8 * 1024 * 1024, signal) {
  signal?.throwIfAborted?.();
  const declared = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel?.();
    throw Object.assign(new Error('Response body exceeds limit'), {
      code: 'BODY_TOO_LARGE',
    });
  }

  if (!response?.body?.getReader) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    signal?.throwIfAborted?.();
    if (buffer.byteLength > maxBytes) {
      throw Object.assign(new Error('Response body exceeds limit'), {
        code: 'BODY_TOO_LARGE',
      });
    }
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      signal?.throwIfAborted?.();
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw Object.assign(new Error('Response body exceeds limit'), {
          code: 'BODY_TOO_LARGE',
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
