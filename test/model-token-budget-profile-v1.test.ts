import { describe, expect, it, vi } from 'vitest';

import {
  MODEL_TOKEN_BUDGET_INPUT_BOUND_SEMANTICS_V1,
  MODEL_TOKEN_BUDGET_PROFILE_SCHEMA_VERSION_V1,
  ModelTokenBudgetErrorV1,
  certifyModelTokenBudgetV1,
  validateModelTokenBudgetProfileV1,
  type ModelTokenBudgetProfileV1,
  type ModelTokenCountAdapterV1,
} from '../packages/domain/src/model-token-budget-profile-v1.js';

const requestFormat = 'synthetic-text-json-v1';

function profile(
  overrides: Partial<ModelTokenBudgetProfileV1> = {},
): ModelTokenBudgetProfileV1 {
  return {
    schemaVersion: MODEL_TOKEN_BUDGET_PROFILE_SCHEMA_VERSION_V1,
    profileId: 'synthetic-profile-v1',
    policyVersion: 'synthetic-policy-v1',
    providerKey: 'synthetic-provider',
    modelKey: 'synthetic-model',
    pricingVersion: 'synthetic-price-v1',
    contextWindowTokens: 1000,
    maximumInputTokens: 500,
    maximumOutputTokens: 200,
    reservedHeadroomTokens: 64,
    maximumSerializedRequestBytes: 10000,
    tokenCounter: {
      adapterId: 'synthetic-counter',
      adapterVersion: 'synthetic-counter-v1',
      supportedRequestFormat: requestFormat,
      inputBoundSemantics: MODEL_TOKEN_BUDGET_INPUT_BOUND_SEMANTICS_V1,
    },
    ...overrides,
  };
}

function adapter(
  count: number | null | Promise<number | null> = 164,
): ModelTokenCountAdapterV1<{ readonly marker: string }> {
  return {
    adapterId: 'synthetic-counter',
    adapterVersion: 'synthetic-counter-v1',
    providerKey: 'synthetic-provider',
    modelKey: 'synthetic-model',
    supportedRequestFormat: requestFormat,
    reservedHeadroomTokens: 64,
    inputBoundSemantics: MODEL_TOKEN_BUDGET_INPUT_BOUND_SEMANTICS_V1,
    countExactRequest: vi.fn(async () => await count),
  };
}

function input(overrides: Record<string, unknown> = {}) {
  const body = '{"input":"한글 exact request"}';
  return {
    profile: profile(),
    adapter: adapter(),
    request: { marker: 'synthetic' },
    requestFormat,
    serializedRequestBody: body,
    serializedRequestBodyBytes: new TextEncoder().encode(body).byteLength,
    enforcedOutputTokenLimit: 200,
    ...overrides,
  };
}

function expectBudgetError(promise: Promise<unknown>, code: string) {
  return expect(promise).rejects.toMatchObject({
    name: 'ModelTokenBudgetErrorV1',
    code,
  });
}

describe('provider-neutral Model Token Budget profile v1', () => {
  it('counts the exact UTF-8 request and returns a redacted receipt bound to model and pricing versions', async () => {
    const count = vi.fn(async (value: {
      serializedRequestBody: string;
      serializedRequestBodyBytes: number;
    }) => {
      expect(value.serializedRequestBody).toBe('{"input":"한글 exact request"}');
      expect(value.serializedRequestBodyBytes).toBe(
        new TextEncoder().encode(value.serializedRequestBody).byteLength,
      );
      return 164;
    });
    const counter = { ...adapter(), countExactRequest: count };

    const result = await certifyModelTokenBudgetV1(input({ adapter: counter }));

    expect(result).toMatchObject({
      schemaVersion: 'model-token-budget-receipt-v1',
      profileId: 'synthetic-profile-v1',
      policyVersion: 'synthetic-policy-v1',
      pricingVersion: 'synthetic-price-v1',
      providerKey: 'synthetic-provider',
      modelKey: 'synthetic-model',
      requestFormat,
      serializedRequestBodyBytes: new TextEncoder().encode('{"input":"한글 exact request"}').byteLength,
      certifiedInputTokenUpperBound: 164,
      reservedHeadroomTokens: 64,
      outputTokenLimit: 200,
      availableInputTokens: 500,
      remainingInputTokens: 336,
    });
    expect(JSON.stringify(result)).not.toContain('한글 exact request');
    expect(count).toHaveBeenCalledOnce();
  });

  it('rejects mismatched UTF-8 byte counts before calling the counter', async () => {
    const counter = adapter();
    await expectBudgetError(
      certifyModelTokenBudgetV1(input({
        adapter: counter,
        serializedRequestBodyBytes: 1,
      })),
      'REQUEST_BODY_BYTES_MISMATCH',
    );
    expect(counter.countExactRequest).not.toHaveBeenCalled();
  });

  it('rejects unsupported request formats before counting', async () => {
    const counter = adapter();
    await expectBudgetError(
      certifyModelTokenBudgetV1(input({
        adapter: counter,
        requestFormat: 'provider-gateway-with-tools-v1',
      })),
      'UNSUPPORTED_REQUEST_FORMAT',
    );
    expect(counter.countExactRequest).not.toHaveBeenCalled();
  });

  it('requires the exact provider-enforced output cap before counting', async () => {
    const counter = adapter();
    await expectBudgetError(
      certifyModelTokenBudgetV1(input({
        adapter: counter,
        enforcedOutputTokenLimit: 199,
      })),
      'OUTPUT_CAP_MISMATCH',
    );
    expect(counter.countExactRequest).not.toHaveBeenCalled();
  });

  it('rejects adapter, model, and reserved-headroom drift before counting', async () => {
    const counter = {
      ...adapter(),
      modelKey: 'another-model',
    };
    await expectBudgetError(
      certifyModelTokenBudgetV1(input({ adapter: counter })),
      'COUNTER_PROFILE_MISMATCH',
    );

    const headroomDrift = {
      ...adapter(),
      reservedHeadroomTokens: 32,
    };
    await expectBudgetError(
      certifyModelTokenBudgetV1(input({ adapter: headroomDrift })),
      'COUNTER_PROFILE_MISMATCH',
    );
  });

  it('rejects oversized requests before calling the counter', async () => {
    const counter = adapter();
    const body = 'x'.repeat(10001);
    await expectBudgetError(
      certifyModelTokenBudgetV1(input({
        adapter: counter,
        serializedRequestBody: body,
        serializedRequestBodyBytes: new TextEncoder().encode(body).byteLength,
      })),
      'REQUEST_BODY_TOO_LARGE',
    );
    expect(counter.countExactRequest).not.toHaveBeenCalled();
  });

  it('fails closed when count is unavailable, malformed, or exceeds the input ceiling', async () => {
    await expectBudgetError(
      certifyModelTokenBudgetV1(input({ adapter: adapter(null) })),
      'TOKEN_COUNT_UNAVAILABLE',
    );
    await expectBudgetError(
      certifyModelTokenBudgetV1(input({ adapter: adapter(501) })),
      'INPUT_BUDGET_EXCEEDED',
    );
    await expectBudgetError(
      certifyModelTokenBudgetV1(input({ adapter: adapter(63) })),
      'TOKEN_COUNT_INVALID',
    );
  });

  it('hides raw adapter failures behind a fixed fail-closed error', async () => {
    const counter = {
      ...adapter(),
      countExactRequest: vi.fn(async () => {
        throw new Error('private prompt and provider key must not escape');
      }),
    };
    await expectBudgetError(
      certifyModelTokenBudgetV1(input({ adapter: counter })),
      'TOKEN_COUNT_FAILED',
    );
  });

  it('rejects profiles that overcommit the context window or headroom', () => {
    expect(() => validateModelTokenBudgetProfileV1(profile({
      maximumInputTokens: 900,
      maximumOutputTokens: 200,
    }))).toThrowError(expect.objectContaining({
      code: 'INVALID_PROFILE',
    }));
    expect(() => validateModelTokenBudgetProfileV1(profile({
      reservedHeadroomTokens: 500,
    }))).toThrowError(expect.objectContaining({
      code: 'INVALID_PROFILE',
    }));
  });

  it('exposes a typed error for callers without revealing request content', () => {
    const error = new ModelTokenBudgetErrorV1('INPUT_BUDGET_EXCEEDED', 'bounded');
    expect(error.code).toBe('INPUT_BUDGET_EXCEEDED');
    expect(error.message).toBe('bounded');
  });
});
