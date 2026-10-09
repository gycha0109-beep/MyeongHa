import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOpenAiSeyeonStructuredProviderV1,
} from '../apps/api/src/openai-seyeon-structured-provider-v1.js';
import {
  createSeyeonAiCostEventV1,
  estimateSeyeonAiCallCostV1,
  summarizeSeyeonAiCostsV1,
  type SeyeonAiCostEventV1,
  type SeyeonAiPriceV1,
} from '../apps/api/src/seyeon-ai-usage-cost-v1.js';

const price: SeyeonAiPriceV1 = {
  priceVersion: 'test-price-v1',
  providerKey: 'openai-responses',
  modelKey: 'test-model',
  inputMicroUsdPerMillion: 1_000_000,
  cachedInputMicroUsdPerMillion: 250_000,
  outputMicroUsdPerMillion: 4_000_000,
};
const usage = {
  inputTokens: 100,
  cachedInputTokens: 20,
  outputTokens: 50,
  reasoningTokens: 10,
};
const request = {
  contractVersion: 'seyeon-structured-provider-v2' as const,
  purpose: 'dialogue_render' as const,
  instructions: 'Unit test only',
  input: { stub: 'no real model' },
  responseSchema: { type: 'object' },
};
const responseBody = {
  status: 'completed',
  usage: {
    input_tokens: 100,
    output_tokens: 50,
    input_tokens_details: { cached_tokens: 20 },
    output_tokens_details: { reasoning_tokens: 10 },
  },
  output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }],
};
const credential = 'sk-test-' + 'a'.repeat(30);
const makeEvent = (callId: string, purpose = 'dialogue_render') =>
  createSeyeonAiCostEventV1({
    callId, purpose,
    providerKey: 'openai-responses', modelKey: 'test-model',
    outcome: 'response_received', httpStatus: 200, elapsedMs: 25,
    usage, price,
  });

afterEach(() => vi.restoreAllMocks());

describe('Se-yeon AI usage and cost v1 (offline)', () => {
  it('charges cached input once and reasoning within output once', () => {
    const quote = estimateSeyeonAiCallCostV1({
      providerKey: 'openai-responses', modelKey: 'test-model', usage, price,
    });
    expect(quote).toEqual({
      priceVersion: 'test-price-v1',
      estimatedCostMicroUsd: 285,
      costStatus: 'estimated',
    });
  });

  it('never silently turns unpriced or incomplete usage into free traffic', () => {
    const missingPrice = estimateSeyeonAiCallCostV1({
      providerKey: 'openai-responses', modelKey: 'test-model', usage,
    });
    expect(missingPrice.estimatedCostMicroUsd).toBeNull();
    expect(missingPrice.costStatus).toBe('price_unknown');
    const missingCache = estimateSeyeonAiCallCostV1({
      providerKey: 'openai-responses', modelKey: 'test-model',
      usage: { ...usage, cachedInputTokens: null }, price,
    });
    expect(missingCache.estimatedCostMicroUsd).toBeNull();
    expect(missingCache.costStatus).toBe('usage_unknown');
  });

  it('rejects impossible token partitions or a cross-model price schedule', () => {
    expect(() => estimateSeyeonAiCallCostV1({
      providerKey: 'openai-responses', modelKey: 'test-model',
      usage: { ...usage, cachedInputTokens: 101 }, price,
    })).toThrow('Cached input');
    expect(() => estimateSeyeonAiCallCostV1({
      providerKey: 'openai-responses', modelKey: 'test-model',
      usage: { ...usage, reasoningTokens: 51 }, price,
    })).toThrow('Reasoning tokens');
    expect(() => estimateSeyeonAiCallCostV1({
      providerKey: 'openai-responses', modelKey: 'different-model',
      usage, price,
    })).toThrow('does not match');
  });

  it('keeps Post-turn usage, failed calls and retries as distinct expenses', () => {
    const first = makeEvent('call-1');
    const second = makeEvent('call-2', 'event_extraction');
    const failed = createSeyeonAiCostEventV1({
      callId: 'call-3',
      purpose: 'semantic_review',
      providerKey: 'openai-responses', modelKey: 'test-model',
      outcome: 'http_failure', httpStatus: 429, elapsedMs: 10,
      usage: {
        inputTokens: null, cachedInputTokens: null,
        outputTokens: null, reasoningTokens: null,
      },
      price,
    });
    expect(summarizeSeyeonAiCostsV1([first, second, failed])).toEqual({
      callCount: 3,
      postTurnCalls: 1,
      failedCalls: 1,
      knownCostMicroUsd: 570,
      unknownCostCalls: 1,
      totalEstimatedCostMicroUsd: null,
    });
    expect(() => summarizeSeyeonAiCostsV1([first, first])).toThrow('Duplicate AI call');
  });

  it('records a successful mock Response call with correlation ID and no private data', async () => {
    const metrics: SeyeonAiCostEventV1[] = [];
    const logger = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const provider = createOpenAiSeyeonStructuredProviderV1({
      apiKey: credential, model: 'test-model', priceQuote: price,
      observeMetric: (metric) => metrics.push(metric),
      fetchImpl: async (_url, init) => {
        const headers = new Headers(init.headers);
        expect(headers.get('x-client-request-id')).toMatch(/^[0-9a-f-]{36}$/iu);
        return new Response(JSON.stringify(responseBody), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      },
    });
    expect(await provider.generate(request)).toEqual({ ok: true });
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      purpose: 'dialogue_render', outcome: 'response_received',
      inputTokens: 100, cachedInputTokens: 20,
      outputTokens: 50, reasoningTokens: 10,
      estimatedCostMicroUsd: 285, invoiceReconciled: false,
    });
    const log = String(logger.mock.calls[0]?.[0]);
    expect(log).not.toContain('sk-test-');
    expect(log).not.toContain('Unit test only');
    expect(log).not.toContain('no real model');
  });

  it('records network failure without exposing error bodies or claiming zero cost', async () => {
    const metrics: SeyeonAiCostEventV1[] = [];
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const provider = createOpenAiSeyeonStructuredProviderV1({
      apiKey: credential, model: 'test-model', priceQuote: price,
      observeMetric: (metric) => metrics.push(metric),
      fetchImpl: async () => { throw new Error('secret user text'); },
    });
    await expect(provider.generate(request)).rejects.toMatchObject({
      code: 'NETWORK_FAILURE',
    });
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      outcome: 'network_failure',
      costStatus: 'usage_unknown',
      estimatedCostMicroUsd: null,
      httpStatus: null,
    });
    expect(JSON.stringify(metrics)).not.toContain('secret user text');
  });

  it('does not allow metric observer failures to trigger duplicate AI inference', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(responseBody), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const provider = createOpenAiSeyeonStructuredProviderV1({
      apiKey: credential, model: 'test-model', priceQuote: price,
      observeMetric: () => { throw new Error('observer unavailable'); },
      fetchImpl,
    });
    expect(await provider.generate(request)).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
