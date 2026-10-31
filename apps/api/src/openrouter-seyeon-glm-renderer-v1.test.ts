import { describe, it, expect, vi } from 'vitest';
import {
  createSeyeonGlmRendererV1,
  SEYEON_GLM_RENDERER_MODEL_V1,
  SEYEON_GLM_RENDERER_ENDPOINT_V1,
} from './openrouter-seyeon-glm-renderer-v1.js';

const key = 'sk-or-test-this-is-a-synthetic-key';
const req = {
  contractVersion: 'seyeon-structured-provider-v2' as const,
  purpose: 'dialogue_render' as const,
  instructions: 'You are Se-yeon. Speak naturally in Korean.',
  input: { recentConversation: [{ role: 'user', text: '안녕, 세연!' }] },
  responseSchema: {
    type: 'object', additionalProperties: false,
    properties: { utterance: { type: 'string' } },
    required: ['utterance'],
  },
};

const mockResponse = (value: unknown): Response =>
  new Response(JSON.stringify(value), {status: 200,
    headers: {'content-type': 'application/json'}});

describe('active Se-yeon GLM renderer transport', () => {
  it('uses GLM-5.3-Flash on OpenRouter for dialogue_render, without native OpenAI fallback', async () => {
    const calls: {url: string; body: any; key: string}[] = [];
    const beforeDispatch = vi.fn(async () => {});
    const afterOutcome = vi.fn(async () => {});
    const provider = createSeyeonGlmRendererV1({
      apiKey: key, beforeDispatch, afterOutcome,
      fetchImpl: async (url, init) => {
        calls.push({
          url: String(url), body: JSON.parse(String(init?.body)),
          key: new Headers(init?.headers).get('Authorization') ?? '',
        });
        return mockResponse({
          model: SEYEON_GLM_RENDERER_MODEL_V1,
          choices: [{finish_reason: 'stop', message: {
            role: 'assistant', content: JSON.stringify({utterance: '어, 왔어?'})}}],
          usage: {prompt_tokens: 220, completion_tokens: 35},
        });
      },
    });
    expect(await provider.generate(req)).toEqual({utterance: '어, 왔어?'});
    expect(provider.modelKey).toBe('z-ai/glm-5.3-flash');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(SEYEON_GLM_RENDERER_ENDPOINT_V1);
    expect(calls[0]!.body.model).toBe(SEYEON_GLM_RENDERER_MODEL_V1);
    expect(calls[0]!.body.response_format.type).toBe('json_schema');
    expect(calls[0]!.body.messages[1].content).toContain('안녕, 세연!');
    expect(calls[0]!.key).toBe('Bearer ' + key);
    expect(beforeDispatch).toHaveBeenCalledOnce();
    expect(afterOutcome).toHaveBeenCalledOnce();
    expect((afterOutcome.mock.calls as unknown[][])[0]?.[0]).toMatchObject({
      purpose: 'dialogue_render', providerKey: 'openrouter-chat',
      modelKey: 'z-ai/glm-5.3-flash', outcome: 'response_received',
      inputTokens: 220, outputTokens: 35,
    });
  });

  it('never dispatches if the cost ledger start rejects', async () => {
    const fetchImpl = vi.fn(async () => mockResponse({}));
    const provider = createSeyeonGlmRendererV1({
      apiKey: key,
      beforeDispatch: async () => {throw Error('ledger unavailable');},
      fetchImpl,
    });
    await expect(provider.generate(req)).rejects.toThrow('ledger unavailable');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects wrong purpose and absent credentials', async () => {
    expect(() => createSeyeonGlmRendererV1({apiKey: ''})).toThrow();
    const fetchImpl = vi.fn(async () => mockResponse({}));
    const provider = createSeyeonGlmRendererV1({apiKey: key, fetchImpl});
    await expect(provider.generate({...req, purpose: 'turn_interpretation'} as any))
      .rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses malformed, incomplete or non-JSON model results', async () => {
    for (const payload of [
      {choices:[{finish_reason:'length',message:{role:'assistant',content:'{}'}}]},
      {choices:[{finish_reason:'stop',message:{role:'assistant',content:'not-json'}}]},
      {choices:[]},
    ]) {
      const provider = createSeyeonGlmRendererV1({
        apiKey:key, fetchImpl: async () => mockResponse(payload),
      });
      await expect(provider.generate(req)).rejects.toThrow();
    }
  });

  it('accepts a bounded, context-rich Se-yeon turn larger than the synthetic evaluation cap', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = String(init?.body);
      expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(24_576);
      expect(JSON.parse(body).messages[1].content).toContain('이전 대화');
      return mockResponse({
        model: SEYEON_GLM_RENDERER_MODEL_V1,
        choices: [{finish_reason:'stop',message:{role:'assistant',content:'{"utterance":"기억하고 있어요."}'}}],
        usage:{prompt_tokens:10500,completion_tokens:60},
      });
    });
    const provider = createSeyeonGlmRendererV1({apiKey:key,fetchImpl});
    expect(await provider.generate({
      ...req, input:{...req.input, recentConversation:'이전 대화'.repeat(4_000)},
    })).toEqual({utterance:'기억하고 있어요.'});
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('never admits substituted models, missing usage or impossible token counts', async () => {
    const invalid = [
      {model:'other-provider/other-model',usage:{prompt_tokens:200,completion_tokens:35}},
      {usage:{prompt_tokens:200,completion_tokens:35}},
      {model:SEYEON_GLM_RENDERER_MODEL_V1},
      {model:SEYEON_GLM_RENDERER_MODEL_V1,usage:{prompt_tokens:200,completion_tokens:0}},
      {model:SEYEON_GLM_RENDERER_MODEL_V1,usage:{prompt_tokens:200,completion_tokens:1600}},
      {model:SEYEON_GLM_RENDERER_MODEL_V1,usage:{prompt_tokens:200,completion_tokens:35,
        prompt_tokens_details:{cached_tokens:201}}},
    ];
    for (const fields of invalid) {
      const afterOutcome = vi.fn(async () => {});
      const provider = createSeyeonGlmRendererV1({
        apiKey:key,afterOutcome,
        fetchImpl:async () => mockResponse({
          choices:[{finish_reason:'stop',message:{role:'assistant',content:'{"utterance":"안녕"}'}}],
          ...fields,
        }),
      });
      await expect(provider.generate(req)).rejects.toThrow();
      expect((afterOutcome.mock.calls as unknown[][])[0]?.[0])
        .toMatchObject({outcome:'invalid_response'});
    }
  });

  it('does not retry or silently fall back to OpenAI after a provider failure', async () => {
    const fetchImpl = vi.fn(async () => new Response('unavailable',{status:503}));
    const afterOutcome = vi.fn(async () => {});
    const provider = createSeyeonGlmRendererV1({apiKey:key,fetchImpl,afterOutcome});
    await expect(provider.generate(req)).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect((afterOutcome.mock.calls as unknown[][])[0]?.[0]).toMatchObject({outcome:'http_failure',httpStatus:503});
  });
});
