import { describe, expect, it, vi } from 'vitest';

import {
  OpenAiSeyeonStructuredProviderErrorV1,
  createOpenAiSeyeonStructuredProviderV1,
} from '../apps/api/src/openai-seyeon-structured-provider-v1.js';

function request() {
  return {
    contractVersion: 'seyeon-structured-provider-v2' as const,
    purpose: 'dialogue_render' as const,
    instructions: 'Return only schema-valid JSON.',
    input: { value: 1 },
    responseSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok'],
      properties: {
        ok: { type: 'boolean' },
      },
    },
  };
}

describe('OpenAI Se-yeon structured provider V1', () => {
  it('uses Responses strict JSON Schema with server-only non-stored execution', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, any>;
      expect(body.model).toBe('gpt-test');
      expect(body.store).toBe(false);
      expect(body.instructions).toBe(request().instructions);
      expect(body.text.format).toEqual({
        type: 'json_schema',
        name: 'myeongha_dialogue_render_v2',
        strict: true,
        schema: request().responseSchema,
      });
      expect(body.input).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify(request().input),
            },
          ],
        },
      ]);
      expect((init.headers as Record<string, string>).authorization)
        .toBe('Bearer test-api-key-1234567890');
      expect((init.headers as Record<string, string>)['x-client-request-id'])
        .toMatch(/^[0-9a-f-]{36}$/iu);

      return new Response(JSON.stringify({
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({ ok: true }),
              },
            ],
          },
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const provider = createOpenAiSeyeonStructuredProviderV1({
      apiKey: 'test-api-key-1234567890',
      model: 'gpt-test',
      fetchImpl,
    });

    await expect(provider.generate(request())).resolves.toEqual({ ok: true });
    expect(provider.providerKey).toBe('openai-responses');
    expect(provider.modelKey).toBe('gpt-test');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fails closed on refusal instead of turning refusal text into model output', async () => {
    const provider = createOpenAiSeyeonStructuredProviderV1({
      apiKey: 'test-api-key-1234567890',
      model: 'gpt-test',
      fetchImpl: async () => new Response(JSON.stringify({
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'refusal',
                refusal: 'cannot comply',
              },
            ],
          },
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    });

    await expect(provider.generate(request())).rejects.toMatchObject({
      code: 'MODEL_REFUSAL',
    });
  });

  it('does not retry provider failures implicitly', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'nope' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const provider = createOpenAiSeyeonStructuredProviderV1({
      apiKey: 'test-api-key-1234567890',
      model: 'gpt-test',
      fetchImpl,
    });

    await expect(provider.generate(request())).rejects.toBeInstanceOf(
      OpenAiSeyeonStructuredProviderErrorV1,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects non-HTTPS custom origins before any request', () => {
    expect(() => createOpenAiSeyeonStructuredProviderV1({
      apiKey: 'test-api-key-1234567890',
      model: 'gpt-test',
      origin: 'http://api.openai.com',
    })).toThrow(/HTTPS origin/i);
  });
});
