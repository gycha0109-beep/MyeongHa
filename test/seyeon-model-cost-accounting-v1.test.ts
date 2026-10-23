import { describe, expect, it } from 'vitest';
import {
  estimateSeyeonProviderCallCostV1,
  quoteSeyeonModelCallCeilingV1,
  resolveSeyeonProviderTokenUsageV1,
  sumSeyeonEstimatedCostMicroUsdV1,
  type SeyeonCostRateCardV1,
} from '../apps/api/src/seyeon-model-cost-accounting-v1.js';

const rateCard: SeyeonCostRateCardV1 = Object.freeze({
  version: 'synthetic-test-rates-2026-10-09',
  models: Object.freeze({
    'synthetic-terra': Object.freeze({
      inputMicroUsdPerMillionTokens: 2_000_000,
      cachedInputMicroUsdPerMillionTokens: 200_000,
      outputMicroUsdPerMillionTokens: 12_000_000,
    }),
  }),
});

function payload(inputTokens: number, cachedInputTokens: number, outputTokens: number, reasoningTokens = 0) {
  return {
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      input_tokens_details: { cached_tokens: cachedInputTokens },
      output_tokens_details: { reasoning_tokens: reasoningTokens },
    },
  };
}

describe('Seyeon model cost accounting v1 (offline, no provider calls)', () => {
  it('computes exact microUSD with cached and reasoning tokens counted only once', () => {
    const result = estimateSeyeonProviderCallCostV1({
      providerPayload: payload(1200, 300, 100, 20),
      modelKey: 'synthetic-terra',
      rateCard,
    });
    expect(result).toMatchObject({
      status: 'ESTIMATED',
      microUsd: 3060,
      usage: {
        inputTokens: 1200, cachedInputTokens: 300,
        outputTokens: 100, reasoningTokens: 20,
      },
      rateCardVersion: 'synthetic-test-rates-2026-10-09',
    });
  });

  it('treats missing usage, corrupt usage, or unpriced models as UNKNOWN costs, never zero', () => {
    expect(estimateSeyeonProviderCallCostV1({
      providerPayload: { status: 'completed' },
      modelKey: 'synthetic-terra', rateCard,
    })).toMatchObject({ status: 'USAGE_MISSING', microUsd: null });
    for (const broken of [
      { usage: {} },
      { usage: { input_tokens: -1, output_tokens: 0 } },
      { usage: { input_tokens: 1.5, output_tokens: 0 } },
      payload(100, 101, 10),
      payload(100, 0, 10, 11),
      { usage: { input_tokens: '100', output_tokens: 10 } },
    ]) {
      expect(estimateSeyeonProviderCallCostV1({
        providerPayload: broken,
        modelKey: 'synthetic-terra', rateCard,
      })).toMatchObject({ status: 'USAGE_INVALID', microUsd: null });
    }
    expect(estimateSeyeonProviderCallCostV1({
      providerPayload: payload(1200, 0, 100),
      modelKey: 'unregistered-model', rateCard,
    })).toMatchObject({ status: 'MODEL_UNPRICED', microUsd: null });
  });

  it('quotes a conservative no-cache upper bound when actual token caps are enforced elsewhere', () => {
    const q = quoteSeyeonModelCallCeilingV1({
      modelKey: 'synthetic-terra', rateCard,
      maxInputTokens: 1200, maxOutputTokens: 100,
    });
    expect(q.microUsd).toBe(3600);
    const measured = estimateSeyeonProviderCallCostV1({
      providerPayload: payload(1200, 300, 100),
      modelKey: 'synthetic-terra', rateCard,
    });
    expect(measured.status).toBe('ESTIMATED');
    if (measured.status === 'ESTIMATED') expect(measured.microUsd).toBeLessThanOrEqual(q.microUsd);
    expect(() => quoteSeyeonModelCallCeilingV1({
      modelKey: 'unregistered-model', rateCard, maxInputTokens: 1, maxOutputTokens: 1,
    })).toThrow('deny admission');
    expect(() => quoteSeyeonModelCallCeilingV1({
      modelKey: 'synthetic-terra', rateCard, maxInputTokens: 0, maxOutputTokens: 1,
    })).toThrow('enforceable positive token ceilings');
  });

  it('handles zero usage as priced zero, distinguishes it from absent usage', () => {
    expect(resolveSeyeonProviderTokenUsageV1(payload(0, 0, 0)).status).toBe('PRESENT');
    expect(estimateSeyeonProviderCallCostV1({
      providerPayload: payload(0, 0, 0),
      modelKey: 'synthetic-terra', rateCard,
    })).toMatchObject({ status: 'ESTIMATED', microUsd: 0 });
  });

  it('rounds conservatively to the nearest microUSD and checks overflow', () => {
    const tiny: SeyeonCostRateCardV1 = {
      version: 'tiny', models: {
        model: { inputMicroUsdPerMillionTokens: 1, cachedInputMicroUsdPerMillionTokens: 0,
          outputMicroUsdPerMillionTokens: 1 },
      },
    };
    expect(estimateSeyeonProviderCallCostV1({
      providerPayload: payload(1, 0, 1), modelKey: 'model', rateCard: tiny,
    })).toMatchObject({ status: 'ESTIMATED', microUsd: 1 });
    const extreme: SeyeonCostRateCardV1 = {
      version: 'extreme', models: {
        model: { inputMicroUsdPerMillionTokens: Number.MAX_SAFE_INTEGER,
          cachedInputMicroUsdPerMillionTokens: 0,
          outputMicroUsdPerMillionTokens: Number.MAX_SAFE_INTEGER },
      },
    };
    expect(estimateSeyeonProviderCallCostV1({
      providerPayload: payload(Number.MAX_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER),
      modelKey: 'model', rateCard: extreme,
    })).toMatchObject({ status: 'OVERFLOW', microUsd: null });
    expect(() => sumSeyeonEstimatedCostMicroUsdV1([Number.MAX_SAFE_INTEGER, 1]))
      .toThrow('overflow');
    expect(sumSeyeonEstimatedCostMicroUsdV1([1200, 400, 0])).toBe(1600);
    expect(() => sumSeyeonEstimatedCostMicroUsdV1([-1])).toThrow();
  });

  it('rejects invalid rate cards instead of calculating plausible false costs', () => {
    const broken = {
      version: 'bad', models: {
        'synthetic-terra': { inputMicroUsdPerMillionTokens: Number.NaN,
          cachedInputMicroUsdPerMillionTokens: 0, outputMicroUsdPerMillionTokens: 10 },
      },
    } as SeyeonCostRateCardV1;
    expect(() => estimateSeyeonProviderCallCostV1({
      providerPayload: payload(10, 0, 10), modelKey: 'synthetic-terra', rateCard: broken,
    })).toThrow('Invalid Se-yeon cost rate card');
  });
});
