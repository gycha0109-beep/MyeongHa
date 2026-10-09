import { describe, expect, it, vi } from 'vitest';
import {
  createOpenAiSeyeonStructuredProviderV1,
} from '../apps/api/src/openai-seyeon-structured-provider-v1.js';

const message = {
  contractVersion: 'seyeon-structured-provider-v2' as const,
  purpose: 'dialogue_render' as const,
  instructions: 'Seyeon test input',
  input: { synthetic: true },
  responseSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['accepted'],
    properties: { accepted: { type: 'boolean' } },
  },
};

function fakeFetch() {
  return vi.fn(async (_url: string, _init: RequestInit) =>
    Response.json({
      status: 'completed',
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: '{"accepted":true}' }],
      }],
      usage: {
        input_tokens: 20, output_tokens: 5,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
    }));
}

describe('Se-yeon optional provider output token ceiling (offline only)', () => {
  it('does not add a token cap when Production has no explicit config', async () => {
    const fetchImpl = fakeFetch();
    const provider = createOpenAiSeyeonStructuredProviderV1({
      apiKey: 'sk-synthetic-test-placeholder-123456',
      model: 'synthetic-model',
      fetchImpl,
    });
    expect(await provider.generate(message)).toEqual({ accepted: true });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty('max_output_tokens');
    expect(body).toMatchObject({ store: false, model: 'synthetic-model' });
  });

  it('enforces configured output ceiling in outgoing Responses payload', async () => {
    const fetchImpl = fakeFetch();
    const provider = createOpenAiSeyeonStructuredProviderV1({
      apiKey: 'sk-synthetic-test-placeholder-123456',
      model: 'synthetic-model',
      maxOutputTokens: 512,
      fetchImpl,
    });
    expect(await provider.generate(message)).toEqual({ accepted: true });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body.max_output_tokens).toBe(512);
    expect(body).toMatchObject({ store: false });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rejects unbounded, fractional and invalid opt-in settings before any network call', () => {
    const fetchImpl = fakeFetch();
    for (const invalid of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER, 32769]) {
      expect(() => createOpenAiSeyeonStructuredProviderV1({
        apiKey: 'sk-synthetic-test-placeholder-123456',
        model: 'synthetic-model',
        maxOutputTokens: invalid,
        fetchImpl,
      })).toThrow('output token ceiling is invalid');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
