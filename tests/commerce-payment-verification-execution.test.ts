import { describe, expect, it, vi } from 'vitest';
import {
  CommercePaymentVerificationErrorV1,
  executeCommercePaymentVerificationV1,
  type CommercePaymentVerificationAdapterV1,
  type CommercePaymentVerificationContextV1,
} from '../apps/api/src/commerce-payment-verification-execution.js';

const context: CommercePaymentVerificationContextV1 = Object.freeze({
  provider: 'provider-test',
  platform: 'web',
  environment: 'sandbox',
  providerRequestId: 'request-1',
  purchaseIntentId: 'purchase-intent-1',
  expectedExternalProductId: 'external-product-1',
  expectedAmountMinor: 1000,
  expectedCurrency: 'KRW',
});

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'commerce-evidence-v2',
    provider: 'provider-test',
    platform: 'web',
    environment: 'sandbox',
    externalTransactionId: 'transaction-1',
    externalProductId: 'external-product-1',
    currentState: 'active',
    ownerBinding: {
      kind: 'purchase_intent',
      purchaseIntentId: 'purchase-intent-1',
    },
    evidenceFingerprint: `hmac-sha256:k1:${'a'.repeat(64)}`,
    verifierRevision: 'test-verifier-v1',
    verifiedAmountMinor: 1000,
    verifiedCurrency: 'KRW',
    verifiedAt: '2026-09-13T00:00:00.000Z',
    ...overrides,
  };
}

function adapterFor(
  result: unknown,
): CommercePaymentVerificationAdapterV1 {
  return {
    verify: vi.fn(async () => result) as CommercePaymentVerificationAdapterV1['verify'],
  };
}

async function expectCode(
  promise: Promise<unknown>,
  code: CommercePaymentVerificationErrorV1['code'],
) {
  await expect(promise).rejects.toMatchObject({
    name: 'CommercePaymentVerificationErrorV1',
    code,
  });
}

describe('provider-neutral Commerce payment verification execution', () => {
  it('validates and returns exact provider-neutral verified evidence', async () => {
    const adapter: CommercePaymentVerificationAdapterV1 = {
      verify: vi.fn(async (request) => {
        expect(Object.isFrozen(request)).toBe(true);
        expect(request).toEqual(context);
        return {
          providerRequestId: 'request-1',
          evidence: evidence(),
        };
      }),
    };

    const result = await executeCommercePaymentVerificationV1({ context, adapter });

    expect(result.externalTransactionId).toBe('transaction-1');
    expect(result.verifiedAmountMinor).toBe(1000);
    expect(result.verifiedCurrency).toBe('KRW');
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('allows first authoritative provider transaction identity when the attempt has none yet', async () => {
    const result = await executeCommercePaymentVerificationV1({
      context,
      adapter: adapterFor({
        providerRequestId: 'request-1',
        evidence: evidence({ externalTransactionId: 'first-provider-transaction' }),
      }),
    });

    expect(result.externalTransactionId).toBe('first-provider-transaction');
  });

  it('requires a previously recorded provider transaction identity to match exactly', async () => {
    await expectCode(
      executeCommercePaymentVerificationV1({
        context: {
          ...context,
          expectedProviderTransactionId: 'transaction-expected',
        },
        adapter: adapterFor({
          providerRequestId: 'request-1',
          evidence: evidence({ externalTransactionId: 'transaction-other' }),
        }),
      }),
      'TRANSACTION_MISMATCH',
    );
  });

  it('fails before invoking the adapter when authoritative context is malformed', async () => {
    const adapter = adapterFor({
      providerRequestId: 'request-1',
      evidence: evidence(),
    });

    await expectCode(
      executeCommercePaymentVerificationV1({
        context: {
          ...context,
          expectedCurrency: 'krw',
        },
        adapter,
      }),
      'INVALID_CONTEXT',
    );

    expect(adapter.verify).not.toHaveBeenCalled();
  });

  it('sanitizes adapter failures without leaking provider error text', async () => {
    const adapter: CommercePaymentVerificationAdapterV1 = {
      verify: vi.fn(async () => {
        throw new Error('provider secret response body');
      }),
    };

    const promise = executeCommercePaymentVerificationV1({ context, adapter });
    await expectCode(promise, 'ADAPTER_FAILED');
    await expect(promise).rejects.not.toThrow(/provider secret response body/u);
  });

  it('rejects malformed adapter result shape', async () => {
    await expectCode(
      executeCommercePaymentVerificationV1({
        context,
        adapter: adapterFor({ providerRequestId: 'request-1' }),
      }),
      'INVALID_ADAPTER_RESULT',
    );
  });

  it('rejects provider request identity mismatch', async () => {
    await expectCode(
      executeCommercePaymentVerificationV1({
        context,
        adapter: adapterFor({
          providerRequestId: 'request-other',
          evidence: evidence(),
        }),
      }),
      'REQUEST_ID_MISMATCH',
    );
  });

  it('rejects evidence that fails the canonical V2 schema validator', async () => {
    await expectCode(
      executeCommercePaymentVerificationV1({
        context,
        adapter: adapterFor({
          providerRequestId: 'request-1',
          evidence: evidence({ schemaVersion: 'commerce-evidence-v1' }),
        }),
      }),
      'INVALID_EVIDENCE',
    );
  });

  it.each([
    ['PROVIDER_MISMATCH', { provider: 'provider-other' }],
    ['PLATFORM_MISMATCH', { platform: 'ios' }],
    ['ENVIRONMENT_MISMATCH', { environment: 'production' }],
    [
      'OWNER_MISMATCH',
      {
        ownerBinding: {
          kind: 'purchase_intent',
          purchaseIntentId: 'purchase-intent-other',
        },
      },
    ],
    ['PRODUCT_MISMATCH', { externalProductId: 'external-product-other' }],
    ['AMOUNT_MISMATCH', { verifiedAmountMinor: 1001 }],
    ['CURRENCY_MISMATCH', { verifiedCurrency: 'USD' }],
  ] as const)(
    'rejects authoritative parity violation %s',
    async (code, overrides) => {
      await expectCode(
        executeCommercePaymentVerificationV1({
          context,
          adapter: adapterFor({
            providerRequestId: 'request-1',
            evidence: evidence(overrides),
          }),
        }),
        code,
      );
    },
  );
});
