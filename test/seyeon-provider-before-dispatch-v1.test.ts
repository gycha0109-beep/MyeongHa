import { describe, expect, it, vi } from 'vitest';
import {
  createOpenAiSeyeonStructuredProviderV1,
} from '../apps/api/src/openai-seyeon-structured-provider-v1.js';

const request = {
  contractVersion: 'seyeon-structured-provider-v2',
  purpose: 'dialogue_render',
  instructions: 'Synthetic server instructions',
  input: { message: 'synthetic' },
  responseSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['accepted'],
    properties: { accepted: { type: 'boolean' } },
  },
} as const;

const success = () => Response.json({
  status: 'completed',
  output: [{ type: 'message', content: [
    { type: 'output_text', text: '{"accepted":true}' },
  ] }],
  usage: { input_tokens: 10, output_tokens: 3 },
});

describe('Se-yeon provider pre-dispatch admission (offline)', () => {
  it('awaits admission before fetch and uses the same call ID in the request header', async () => {
    const order: string[] = [];
    let admittedCallId: string | null = null;
    const beforeDispatch = vi.fn(async (call: {
      callId: string; purpose: string; providerKey: string; modelKey: string;
    }) => {
      order.push('before');
      admittedCallId = call.callId;
      expect(call).toMatchObject({
        purpose: 'dialogue_render',
        providerKey: 'openai-responses',
        modelKey: 'synthetic-model',
      });
      expect(call.callId).toMatch(/^[0-9a-f-]{36}$/u);
      await Promise.resolve();
      order.push('admitted');
    });
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      order.push('fetch');
      const headers = new Headers(init.headers);
      expect(headers.get('x-client-request-id')).toBe(admittedCallId);
      return success();
    });
    const provider = createOpenAiSeyeonStructuredProviderV1({
      apiKey: 'sk-test-fake-before-dispatch-1234567890',
      model: 'synthetic-model',
      beforeDispatch,
      fetchImpl,
    });
    await expect(provider.generate(request)).resolves.toEqual({ accepted: true });
    expect(order).toEqual(['before', 'admitted', 'fetch']);
    expect(beforeDispatch).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fails closed before any paid API dispatch if admission rejects', async () => {
    const fetchImpl = vi.fn(async () => success());
    const observeMetric = vi.fn();
    const provider = createOpenAiSeyeonStructuredProviderV1({
      apiKey: 'sk-test-fake-before-dispatch-1234567890',
      model: 'synthetic-model',
      beforeDispatch: async () => {
        throw new Error('PRIVATE_DB_DETAIL_DO_NOT_REFLECT');
      },
      observeMetric,
      fetchImpl,
    });
    try {
      await provider.generate(request);
      throw new Error('Expected provider call to be blocked');
    } catch (error) {
      expect(error).toMatchObject({ code: 'PRE_DISPATCH_REJECTED' });
      expect(String(error)).not.toContain('PRIVATE_DB_DETAIL_DO_NOT_REFLECT');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(observeMetric).not.toHaveBeenCalled();
  });

  it('continues to support provider use without an admission hook', async () => {
    const fetchImpl = vi.fn(async () => success());
    const provider = createOpenAiSeyeonStructuredProviderV1({
      apiKey: 'sk-test-fake-before-dispatch-1234567890',
      model: 'synthetic-model',
      fetchImpl,
    });
    await expect(provider.generate(request)).resolves.toEqual({ accepted: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
