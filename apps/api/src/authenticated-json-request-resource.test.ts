import { describe, expect, it } from 'vitest';
import {
  AUTHENTICATED_JSON_REQUEST_MAXIMUM_BODY_BYTES_V1,
  AuthenticatedJsonRequestBodyTooLargeV1,
  readAuthenticatedJsonRequestBodyV1,
  serializePreparsedJsonBodyBoundedV1,
} from './authenticated-json-request-resource.js';

function streamRequest(
  chunks: readonly Uint8Array[],
  onCancel?: () => void,
  keepOpenAfterChunks = false,
): Request {
  let index = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[index];
        index += 1;
        if (chunk === undefined) {
          if (!keepOpenAfterChunks) controller.close();
          return;
        }
        controller.enqueue(chunk);
      },
      cancel() {
        onCancel?.();
      },
    },
    { highWaterMark: 0 },
  );

  return new Request('https://myeongha.internal/resource-test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('authenticated structured JSON request resource V1', () => {
  it('accepts a valid JSON body exactly at the 16 KiB byte ceiling', async () => {
    const content = 'a'.repeat(AUTHENTICATED_JSON_REQUEST_MAXIMUM_BODY_BYTES_V1 - 2);
    const encoded = new TextEncoder().encode(JSON.stringify(content));
    expect(encoded.byteLength).toBe(AUTHENTICATED_JSON_REQUEST_MAXIMUM_BODY_BYTES_V1);

    const request = streamRequest([encoded]);
    await expect(readAuthenticatedJsonRequestBodyV1(request)).resolves.toBe(content);
    expect(request.body?.locked).toBe(false);
  });

  it('rejects while reading the chunk that crosses the ceiling and releases the lock', async () => {
    const encoder = new TextEncoder();
    let cancelCalls = 0;
    const first = encoder.encode(' '.repeat(16_000));
    const crossing = encoder.encode(' '.repeat(500));
    const request = streamRequest([first, crossing], () => {
      cancelCalls += 1;
    }, true);

    await expect(readAuthenticatedJsonRequestBodyV1(request)).rejects.toBeInstanceOf(
      AuthenticatedJsonRequestBodyTooLargeV1,
    );
    expect(cancelCalls).toBe(1);
    expect(request.body?.locked).toBe(false);
  });

  it('uses consumed stream bytes as final authority instead of trusting Content-Length', async () => {
    const request = new Request('https://myeongha.internal/resource-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': '999999',
      },
      body: '{"ok":true}',
    });

    await expect(readAuthenticatedJsonRequestBodyV1(request)).resolves.toEqual({ ok: true });
  });

  it('bounds pre-parsed serialization before creating a full over-limit JSON copy', () => {
    let toJsonCalls = 0;
    const body = {
      toJSON() {
        toJsonCalls += 1;
        return { label: '가'.repeat(6_000) };
      },
    };

    expect(() => serializePreparsedJsonBodyBoundedV1(body)).toThrow(
      AuthenticatedJsonRequestBodyTooLargeV1,
    );
    expect(toJsonCalls).toBe(1);
  });

  it('serializes an under-limit pre-parsed body without changing its JSON shape', () => {
    const body = {
      label: '나의 명식록',
      input: { calendarType: 'solar', birthDate: '1990-01-02' },
    };

    expect(JSON.parse(serializePreparsedJsonBodyBoundedV1(body) ?? '')).toEqual(body);
  });
});
