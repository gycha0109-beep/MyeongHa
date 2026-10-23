import { describe, expect, it, vi } from 'vitest';
import {
  OPENAI_SEYEON_STRUCTURED_PROVIDER_MAX_RESPONSE_BYTES_V1,
  createOpenAiSeyeonStructuredProviderV1,
} from '../apps/api/src/openai-seyeon-structured-provider-v1.js';

const request = {
  contractVersion: 'seyeon-structured-provider-v2',
  purpose: 'turn_interpretation',
  instructions: 'Fixed server-owned test instructions',
  input: { userMessage: 'synthetic test only' },
  responseSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['accepted'],
    properties: { accepted: { type: 'boolean' } },
  },
} as const;

function provider(
  fetchImpl: (_url: string, init: RequestInit) => Promise<Response>,
  timeoutMs = 2000,
) {
  return createOpenAiSeyeonStructuredProviderV1({
    apiKey: 'sk-test-fake-resource-canary-1234567890',
    model: 'gpt-5.6-terra',
    timeoutMs,
    fetchImpl,
  });
}

function successfulBody() {
  return {
    status: 'completed',
    output: [{
      type: 'message',
      content: [{ type: 'output_text', text: '{"accepted":true}' }],
    }],
  };
}

describe('Se-yeon structured provider response resource containment', () => {
  it('accepts a valid bounded success response', async () => {
    const result = await provider(async () => Response.json(successfulBody())).generate(request);
    expect(result).toEqual({ accepted: true });
  });

  it('rejects a response exceeding the governed byte ceiling without parsing the full JSON', async () => {
    const oversized = Response.json({
      ...successfulBody(),
      padding: 'PRIVATE_CANARY_DO_NOT_REFLECT'.repeat(30_000),
    });
    const result = provider(async () => oversized).generate(request);
    await expect(result).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects chunked over-limit responses even with a false small Content-Length', async () => {
    let cancelCount = 0;
    const first = new Uint8Array(OPENAI_SEYEON_STRUCTURED_PROVIDER_MAX_RESPONSE_BYTES_V1);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(first);
        controller.enqueue(new TextEncoder().encode('a'));
      },
      cancel() {
        cancelCount += 1;
      },
    });
    const response = new Response(body, {
      headers: { 'content-type': 'application/json', 'content-length': '1' },
    });
    await expect(provider(async () => response).generate(request))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(cancelCount).toBe(1);
    expect(body.locked).toBe(false);
  });

  it('holds a stalled response body to the same request deadline and releases its reader', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const response = new Response(body, {
      headers: { 'content-type': 'application/json' },
    });
    await expect(provider(async () => response, 40).generate(request))
      .rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(cancelled).toBe(true);
    expect(body.locked).toBe(false);
  });

  it('rejects ignored fetch abort at the paid Provider header deadline and records timeout once', async () => {
    let observedSignal: AbortSignal | undefined;
    const observeMetric = vi.fn();
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
      observedSignal = init.signal as AbortSignal;
      return new Promise<Response>(() => undefined);
    });
    const client = createOpenAiSeyeonStructuredProviderV1({
      apiKey: 'sk-test-fake-resource-canary-1234567890',
      model: 'gpt-5.6-terra',
      timeoutMs: 40,
      fetchImpl,
      observeMetric,
    });
    await expect(client.generate(request)).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(observedSignal?.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(observeMetric).toHaveBeenCalledOnce();
    expect(observeMetric.mock.calls[0]?.[0]).toMatchObject({ outcome: 'timeout' });
  });

  it('discards successful Provider headers arriving after the governed deadline', async () => {
    let release: ((response: Response) => void) | undefined;
    let cancelled = false;
    const fetchImpl = vi.fn((_url: string, _init: RequestInit) =>
      new Promise<Response>(resolve => { release = resolve; })
    );
    const call = provider(fetchImpl, 40).generate(request);
    await expect(call).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(release).toBeDefined();
    release?.(new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(successfulBody())));
      },
      cancel() { cancelled = true; },
    }), { headers: { 'content-type': 'application/json' } }));
    await Promise.resolve();
    await Promise.resolve();
    expect(cancelled).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rejects malformed under-limit JSON with a governed error code', async () => {
    const response = new Response('{"status":', {
      headers: { 'content-type': 'application/json' },
    });
    await expect(provider(async () => response).generate(request))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
