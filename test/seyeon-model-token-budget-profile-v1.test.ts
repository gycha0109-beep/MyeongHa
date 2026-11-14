import { describe, expect, it, vi } from 'vitest';

import {
  certifyModelTokenBudgetV1,
} from '../packages/domain/src/model-token-budget-profile-v1.js';
import {
  buildSeyeonGovernedStartCallFromModelTokenBudgetReceiptV1,
  createSeyeonOpenAiModelTokenBudgetBindingV1,
  quoteSeyeonCostGovernorFromModelTokenBudgetReceiptV1,
  SEYEON_OPENAI_RESPONSES_TEXT_JSON_SCHEMA_REQUEST_FORMAT_V1,
} from '../apps/api/src/seyeon-model-token-budget-profile-v1.js';
import type {
  SeyeonCostGovernorModelPolicyV1,
} from '../apps/api/src/seyeon-cost-governor-server-policy-v1.js';
import type {
  SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';

const policy: SeyeonCostGovernorModelPolicyV1 = {
  policyVersion: 'synthetic-policy-v1',
  providerKey: 'openai-responses',
  modelKey: 'synthetic-model',
  allowedPurposes: ['dialogue_render'],
  priceQuote: {
    priceVersion: 'synthetic-price-v1',
    providerKey: 'openai-responses',
    modelKey: 'synthetic-model',
    inputMicroUsdPerMillion: 1000000,
    cachedInputMicroUsdPerMillion: 250000,
    outputMicroUsdPerMillion: 4000000,
  },
  contextWindowTokens: 2000,
  maximumInputTokens: 1200,
  maximumOutputTokens: 800,
  maximumSerializedRequestBytes: 20000,
};

const request: SeyeonStructuredProviderRequestV2 = {
  contractVersion: 'seyeon-structured-provider-v2',
  purpose: 'dialogue_render',
  instructions: 'Synthetic instructions',
  input: { note: 'Synthetic 한글' },
  responseSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok'],
    properties: { ok: { type: 'boolean' } },
  },
};

describe('Se-yeon OpenAI model token budget binding (offline)', () => {
  it('binds the official exact Responses counter to one model, price version, format, and headroom', async () => {
    const countFetch = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.openai.com/v1/responses/input_tokens');
      const body = JSON.parse(String(init.body));
      expect(body).toEqual({
        model: 'synthetic-model',
        instructions: 'Synthetic instructions',
        input: [{ role: 'user', content: [{ type: 'input_text', text: 'Synthetic 한글' }] }],
        text: {
          format: {
            type: 'json_schema',
            schema: request.responseSchema,
          },
        },
      });
      return Response.json({
        object: 'response.input_tokens',
        input_tokens: 100,
      });
    });

    const binding = createSeyeonOpenAiModelTokenBudgetBindingV1({
      apiKey: 'sk-synthetic-count-only-placeholder',
      model: 'synthetic-model',
      policy,
      reservedHeadroomTokens: 64,
      fetchImpl: countFetch,
    });
    const body = JSON.stringify({
      model: 'synthetic-model',
      store: false,
      max_output_tokens: 800,
      instructions: 'Synthetic instructions',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'Synthetic 한글' }] }],
      text: {
        format: {
          type: 'json_schema',
          schema: request.responseSchema,
        },
      },
    });

    const receipt = await certifyModelTokenBudgetV1({
      profile: binding.profile,
      adapter: binding.counter,
      request,
      requestFormat: SEYEON_OPENAI_RESPONSES_TEXT_JSON_SCHEMA_REQUEST_FORMAT_V1,
      serializedRequestBody: body,
      serializedRequestBodyBytes: new TextEncoder().encode(body).byteLength,
      enforcedOutputTokenLimit: 800,
    });

    expect(receipt).toMatchObject({
      providerKey: 'openai-responses',
      modelKey: 'synthetic-model',
      pricingVersion: 'synthetic-price-v1',
      tokenCounterAdapterId: 'seyeon-openai-input-token-count-v1',
      certifiedInputTokenUpperBound: 164,
      reservedHeadroomTokens: 64,
      outputTokenLimit: 800,
    });
    const quote = quoteSeyeonCostGovernorFromModelTokenBudgetReceiptV1({
      policy,
      purpose: 'dialogue_render',
      receipt,
    });
    const governedStart = buildSeyeonGovernedStartCallFromModelTokenBudgetReceiptV1({
      policy,
      purpose: 'dialogue_render',
      call: {
        callId: '44444444-4444-4444-8444-444444444444',
        purpose: 'dialogue_render',
        providerKey: 'openai-responses',
        modelKey: 'synthetic-model',
      },
      receipt,
    });
    expect(governedStart).toMatchObject({
      callId: '44444444-4444-4444-8444-444444444444',
      requestBodyBytes: receipt.serializedRequestBodyBytes,
      quote: {
        policyVersion: 'synthetic-policy-v1',
        rateCardVersion: 'synthetic-price-v1',
        ceilingMicroUsd: 3364,
      },
    });
    expect(() => buildSeyeonGovernedStartCallFromModelTokenBudgetReceiptV1({
      policy,
      purpose: 'dialogue_render',
      call: {
        callId: '44444444-4444-4444-8444-444444444444',
        purpose: 'dialogue_render',
        providerKey: 'openai-responses',
        modelKey: 'other-model',
      },
      receipt,
    })).toThrow(/does not match the certified token budget receipt/);
    expect(quote).toMatchObject({
      policyVersion: 'synthetic-policy-v1',
      rateCardVersion: 'synthetic-price-v1',
      providerKey: 'openai-responses',
      modelKey: 'synthetic-model',
      inputCeilingTokens: 164,
      outputCeilingTokens: 800,
      ceilingMicroUsd: 3364,
    });
    expect(() => quoteSeyeonCostGovernorFromModelTokenBudgetReceiptV1({
      policy: {
        ...policy,
        priceQuote: { ...policy.priceQuote, priceVersion: 'different-price-v1' },
      },
      purpose: 'dialogue_render',
      receipt,
    })).toThrow(/does not match the exact model, policy, price, or token ceilings/);
    expect(countFetch).toHaveBeenCalledOnce();
    expect(JSON.stringify(receipt)).not.toContain('Synthetic 한글');
  });

  it('creates a binding without making a network request', () => {
    const countFetch = vi.fn(async () =>
      Response.json({ object: 'response.input_tokens', input_tokens: 100 }),
    );
    createSeyeonOpenAiModelTokenBudgetBindingV1({
      apiKey: 'sk-synthetic-count-only-placeholder',
      model: 'synthetic-model',
      policy,
      reservedHeadroomTokens: 64,
      fetchImpl: countFetch,
    });
    expect(countFetch).not.toHaveBeenCalled();
  });
});
