import { describe, expect, it } from 'vitest';
import {
  quoteSeyeonCostGovernorMaximumV1,
  validateSeyeonCostGovernorModelPolicyV1,
  type SeyeonCostGovernorModelPolicyV1,
  type SeyeonCostGovernorBoundedRequestV1,
} from '../apps/api/src/seyeon-cost-governor-server-policy-v1.js';

const policy: SeyeonCostGovernorModelPolicyV1 = {
  policyVersion: 'offline-policy-v1',
  providerKey: 'openai-responses',
  modelKey: 'synthetic-test-model',
  priceQuote: {
    priceVersion: 'offline-rate-v1',
    providerKey: 'openai-responses',
    modelKey: 'synthetic-test-model',
    inputMicroUsdPerMillion: 1_000_000,
    cachedInputMicroUsdPerMillion: 250_000,
    outputMicroUsdPerMillion: 4_000_000,
  },
  allowedPurposes: ['dialogue_render', 'event_extraction'],
  contextWindowTokens: 2000,
  maximumInputTokens: 1200,
  maximumOutputTokens: 800,
  maximumSerializedRequestBytes: 20000,
};
const request: SeyeonCostGovernorBoundedRequestV1 = {
  purpose: 'dialogue_render',
  providerKey: 'openai-responses',
  modelKey: 'synthetic-test-model',
  verifiedInputTokenUpperBound: 500,
  serializedRequestBytes: 2500,
  enforcedOutputTokenLimit: 800,
};
const quote = (
  p: SeyeonCostGovernorModelPolicyV1 = policy,
  r: SeyeonCostGovernorBoundedRequestV1 = request,
) => quoteSeyeonCostGovernorMaximumV1({ policy: p, request: r });

describe('Se-yeon PR-04A server policy cost ceilings (offline)', () => {
  it('generates a conservative price-versioned quote without private request material', () => {
    expect(quote()).toEqual({
      policyVersion: 'offline-policy-v1',
      rateCardVersion: 'offline-rate-v1',
      providerKey: 'openai-responses',
      modelKey: 'synthetic-test-model',
      purpose: 'dialogue_render',
      inputCeilingTokens: 500,
      outputCeilingTokens: 800,
      ceilingMicroUsd: 3700,
    });
    expect(JSON.stringify(quote())).not.toContain('serializedRequestBytes');
    expect(quote().ceilingMicroUsd).toBeGreaterThan(0);
    expect(Object.isFrozen(quote())).toBe(true);
  });

  it('requires a real provider-enforced output cap; null and smaller caps do not pass', () => {
    for (const enforcedOutputTokenLimit of [null, 0, 1, 512, 801, 800.5, Number.NaN]) {
      expect(() => quote(policy, { ...request, enforcedOutputTokenLimit }))
        .toThrow();
    }
  });

  it('rejects missing, untrusted or out-of-range input-bound numbers', () => {
    for (const verifiedInputTokenUpperBound of [null, -1, 0, 1201, 1.4, Infinity, Number.NaN]) {
      expect(() => quote(policy, { ...request, verifiedInputTokenUpperBound }))
        .toThrow();
    }
  });

  it('rejects missing or excessive measured request byte counts', () => {
    for (const serializedRequestBytes of [null, 0, -1, 20001, 1.2, Infinity]) {
      expect(() => quote(policy, { ...request, serializedRequestBytes })).toThrow();
    }
  });

  it('enforces both per-model max input and context window', () => {
    expect(() => quote({
      ...policy, maximumInputTokens: 1400, maximumOutputTokens: 800,
    }, { ...request, verifiedInputTokenUpperBound: 1300 }))
      .toThrow('context window');
    expect(() => quote(policy, {
      ...request, verifiedInputTokenUpperBound: 1201,
    })).toThrow('input ceiling');
  });

  it('requires approved stage, provider and model', () => {
    expect(() => quote(policy, { ...request, purpose: 'semantic_review' }))
      .toThrow('purpose');
    expect(() => quote(policy, { ...request, providerKey: 'unknown' }))
      .toThrow('provider/model');
    expect(() => quote(policy, { ...request, modelKey: 'other' }))
      .toThrow('provider/model');
    expect(quote(policy, { ...request, purpose: 'event_extraction' }).purpose)
      .toBe('event_extraction');
  });

  it('rejects a rate card for another provider or model', () => {
    expect(() => quote({ ...policy, priceQuote: {
      ...policy.priceQuote, modelKey: 'different',
    } })).toThrow('rate card');
  });

  it('requires explicit positive input/output rates; no silent free quota', () => {
    expect(() => quote({ ...policy, priceQuote: {
      ...policy.priceQuote, inputMicroUsdPerMillion: 0,
    } })).toThrow('billable');
    expect(() => quote({ ...policy, priceQuote: {
      ...policy.priceQuote, outputMicroUsdPerMillion: 0,
    } })).toThrow('billable');
    expect(() => quote({ ...policy, priceQuote: {
      ...policy.priceQuote, inputMicroUsdPerMillion: -1,
    } })).toThrow('input rate');
  });

  it('never assumes cached pricing is cheaper than uncached pricing', () => {
    const highCached = { ...policy, priceQuote: {
      ...policy.priceQuote, cachedInputMicroUsdPerMillion: 3_000_000,
    } };
    expect(quote(highCached).ceilingMicroUsd).toBe(4700);
    expect(quote(policy).ceilingMicroUsd).toBe(3700);
  });

  it('rounds up fractional microUSD instead of using an underquote', () => {
    const tiny: SeyeonCostGovernorModelPolicyV1 = {
      ...policy,
      priceQuote: {
        ...policy.priceQuote,
        inputMicroUsdPerMillion: 1,
        cachedInputMicroUsdPerMillion: 0,
        outputMicroUsdPerMillion: 1,
      },
    };
    expect(quote(tiny).ceilingMicroUsd).toBe(1);
  });

  it('rejects unsafe integer policy ceilings and quote arithmetic overflow', () => {
    expect(() => validateSeyeonCostGovernorModelPolicyV1({
      ...policy, maximumInputTokens: Number.MAX_SAFE_INTEGER + 1,
    })).toThrow('input ceiling');
    const huge: SeyeonCostGovernorModelPolicyV1 = {
      ...policy,
      contextWindowTokens: Number.MAX_SAFE_INTEGER,
      maximumInputTokens: 4_000_000_000,
      maximumOutputTokens: 4_000_000_000,
      priceQuote: {
        ...policy.priceQuote,
        inputMicroUsdPerMillion: Number.MAX_SAFE_INTEGER,
        cachedInputMicroUsdPerMillion: 0,
        outputMicroUsdPerMillion: Number.MAX_SAFE_INTEGER,
      },
    };
    expect(() => quote(huge, {
      ...request,
      verifiedInputTokenUpperBound: 4_000_000_000,
      enforcedOutputTokenLimit: 4_000_000_000,
    })).toThrow('safe integer');
  });

  it('rejects duplicate/unknown purpose entries and absent policies', () => {
    expect(() => validateSeyeonCostGovernorModelPolicyV1({
      ...policy, allowedPurposes: ['dialogue_render', 'dialogue_render'],
    })).toThrow('allowed purposes');
    expect(() => validateSeyeonCostGovernorModelPolicyV1({
      ...policy, allowedPurposes: [],
    })).toThrow('allowed purposes');
    expect(() => validateSeyeonCostGovernorModelPolicyV1({
      ...policy, policyVersion: '',
    })).toThrow('policy version');
  });
});
