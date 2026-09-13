import { describe, expect, it, vi } from 'vitest';
import { ApiCommandError } from '../apps/api/src/api-error.js';
import { loadCommerceProviderPaymentVerificationContextV1 } from '../apps/api/src/commerce-provider-payment-verification-context-read.js';
import type { PostgresCommerceInternalExecutionScopeV1 } from '../apps/api/src/postgres-commerce-internal-execution.js';

const SUBJECT_ID = '11111111-1111-1111-1111-111111111111';
const ATTEMPT_ID = '22222222-2222-2222-2222-222222222222';
const INTENT_ID = '33333333-3333-3333-3333-333333333333';

function makeScope(input: {
  rows?: readonly Record<string, unknown>[];
  error?: unknown;
}) {
  const query = vi.fn(async () => {
    if (input.error !== undefined) throw input.error;
    return { rows: input.rows ?? [] };
  });

  const scope = { client: { query } } as unknown as PostgresCommerceInternalExecutionScopeV1;
  return { scope, query };
}

function authorityRow(overrides: Record<string, unknown> = {}) {
  return {
    paymentAttemptId: ATTEMPT_ID,
    resolvedSubjectId: SUBJECT_ID,
    purchaseIntentId: INTENT_ID,
    provider: 'testpay',
    platform: 'web',
    environment: 'sandbox',
    providerRequestId: 'merchant-order-1',
    expectedProviderTransactionId: 'provider-tx-1',
    expectedExternalProductId: 'reading-once-v1',
    expectedAmountMinor: '12900',
    expectedCurrency: 'KRW',
    ...overrides,
  };
}

describe('commerce provider payment verification context read', () => {
  it('resolves DB-owned subject lineage and projects existing verification context', async () => {
    const { scope, query } = makeScope({ rows: [authorityRow()] });

    await expect(
      loadCommerceProviderPaymentVerificationContextV1({
        scope,
        provider: 'testpay',
        environment: 'sandbox',
        providerRequestId: 'merchant-order-1',
      }),
    ).resolves.toEqual({
      paymentAttemptId: ATTEMPT_ID,
      resolvedSubjectId: SUBJECT_ID,
      verificationContext: {
        provider: 'testpay',
        platform: 'web',
        environment: 'sandbox',
        providerRequestId: 'merchant-order-1',
        expectedProviderTransactionId: 'provider-tx-1',
        purchaseIntentId: INTENT_ID,
        expectedExternalProductId: 'reading-once-v1',
        expectedAmountMinor: 12900,
        expectedCurrency: 'KRW',
      },
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain(
      'public.qry_commerce_provider_payment_verification_context_v1',
    );
    expect(query.mock.calls[0]?.[1]).toEqual([
      'testpay',
      'sandbox',
      'merchant-order-1',
      null,
    ]);
  });

  it('supports transaction-only lookup while preserving the canonical provider request id', async () => {
    const { scope, query } = makeScope({ rows: [authorityRow()] });

    const resolution = await loadCommerceProviderPaymentVerificationContextV1({
      scope,
      provider: 'testpay',
      environment: 'sandbox',
      providerTransactionId: 'provider-tx-1',
    });

    expect(resolution.verificationContext.providerRequestId).toBe('merchant-order-1');
    expect(query.mock.calls[0]?.[1]).toEqual([
      'testpay',
      'sandbox',
      null,
      'provider-tx-1',
    ]);
  });

  it('fails closed when returned request or transaction parity differs', async () => {
    const requestScope = makeScope({
      rows: [authorityRow({ providerRequestId: 'different-order' })],
    }).scope;
    await expect(
      loadCommerceProviderPaymentVerificationContextV1({
        scope: requestScope,
        provider: 'testpay',
        environment: 'sandbox',
        providerRequestId: 'merchant-order-1',
      }),
    ).rejects.toThrow('different provider request identity');

    const transactionScope = makeScope({
      rows: [authorityRow({ expectedProviderTransactionId: 'different-tx' })],
    }).scope;
    await expect(
      loadCommerceProviderPaymentVerificationContextV1({
        scope: transactionScope,
        provider: 'testpay',
        environment: 'sandbox',
        providerTransactionId: 'provider-tx-1',
      }),
    ).rejects.toThrow('different provider transaction identity');
  });

  it('fails closed on unsafe bigint projection and malformed authority', async () => {
    const unsafe = makeScope({
      rows: [authorityRow({ expectedAmountMinor: '9007199254740992' })],
    }).scope;
    await expect(
      loadCommerceProviderPaymentVerificationContextV1({
        scope: unsafe,
        provider: 'testpay',
        environment: 'sandbox',
        providerRequestId: 'merchant-order-1',
      }),
    ).rejects.toThrow('unsafe expected amount');

    const malformed = makeScope({ rows: [authorityRow({ platform: 'desktop' })] }).scope;
    await expect(
      loadCommerceProviderPaymentVerificationContextV1({
        scope: malformed,
        provider: 'testpay',
        environment: 'sandbox',
        providerRequestId: 'merchant-order-1',
      }),
    ).rejects.toThrow('invalid platform');
  });

  it('maps unavailable/ineligible authority to non-enumerating NOT_FOUND', async () => {
    for (const constraint of [
      'qry_commerce_provider_payment_verification_context_unavailable',
      'qry_commerce_provider_payment_verification_context_state_ineligible',
    ]) {
      const { scope } = makeScope({ error: { constraint } });
      try {
        await loadCommerceProviderPaymentVerificationContextV1({
          scope,
          provider: 'testpay',
          environment: 'sandbox',
          providerRequestId: 'merchant-order-1',
        });
        throw new Error('expected context read to fail');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiCommandError);
        expect((error as ApiCommandError).code).toBe('NOT_FOUND');
      }
    }
  });

  it('requires at least one provider-owned attempt identity before PostgreSQL', async () => {
    const { scope, query } = makeScope({ rows: [authorityRow()] });

    await expect(
      loadCommerceProviderPaymentVerificationContextV1({
        scope,
        provider: 'testpay',
        environment: 'sandbox',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(query).not.toHaveBeenCalled();
  });
});
