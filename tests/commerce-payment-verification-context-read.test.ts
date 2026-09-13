import { describe, expect, it, vi } from 'vitest';
import { ApiCommandError } from '../apps/api/src/api-error.js';
import { loadCommercePaymentVerificationContextV1 } from '../apps/api/src/commerce-payment-verification-context-read.js';
import type { PostgresSubjectExecutionScopeV1 } from '../apps/api/src/postgres-subject-execution.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';
const INTENT_ID = '33333333-3333-4333-8333-333333333333';

function makeScope(input: {
  rows?: readonly Record<string, unknown>[];
  error?: unknown;
}) {
  const query = vi.fn(async () => {
    if (input.error !== undefined) throw input.error;
    return { rows: input.rows ?? [] };
  });

  const scope = {
    resolvedSubject: { subjectId: SUBJECT_ID, subjectKind: 'member' },
    client: { query },
  } as unknown as PostgresSubjectExecutionScopeV1;

  return { scope, query };
}

function authorityRow(overrides: Record<string, unknown> = {}) {
  return {
    paymentAttemptId: ATTEMPT_ID,
    purchaseIntentId: INTENT_ID,
    provider: 'portone',
    platform: 'web',
    environment: 'sandbox',
    providerRequestId: 'myeongha-payment-1',
    expectedProviderTransactionId: null,
    expectedExternalProductId: 'reading-once-v1',
    expectedAmountMinor: '12900',
    expectedCurrency: 'KRW',
    ...overrides,
  };
}

describe('commerce payment verification context read', () => {
  it('projects persisted authority into the provider-neutral verification context', async () => {
    const { scope, query } = makeScope({ rows: [authorityRow()] });

    await expect(
      loadCommercePaymentVerificationContextV1({ scope, paymentAttemptId: ATTEMPT_ID }),
    ).resolves.toEqual({
      provider: 'portone',
      platform: 'web',
      environment: 'sandbox',
      providerRequestId: 'myeongha-payment-1',
      purchaseIntentId: INTENT_ID,
      expectedExternalProductId: 'reading-once-v1',
      expectedAmountMinor: 12900,
      expectedCurrency: 'KRW',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain(
      'public.qry_commerce_payment_verification_context_v1($1::uuid, $2::uuid)',
    );
    expect(query.mock.calls[0]?.[1]).toEqual([SUBJECT_ID, ATTEMPT_ID]);
  });

  it('preserves a provider transaction identity only when persisted', async () => {
    const { scope } = makeScope({
      rows: [authorityRow({ expectedProviderTransactionId: 'portone-tx-1' })],
    });

    const context = await loadCommercePaymentVerificationContextV1({
      scope,
      paymentAttemptId: ATTEMPT_ID,
    });

    expect(context.expectedProviderTransactionId).toBe('portone-tx-1');
  });

  it('fails closed on unsafe bigint projection before verification', async () => {
    const { scope } = makeScope({
      rows: [authorityRow({ expectedAmountMinor: '9007199254740992' })],
    });

    await expect(
      loadCommercePaymentVerificationContextV1({ scope, paymentAttemptId: ATTEMPT_ID }),
    ).rejects.toThrow('unsafe expected amount');
  });

  it('fails closed on malformed authority rows', async () => {
    const { scope } = makeScope({
      rows: [authorityRow({ platform: 'desktop' })],
    });

    await expect(
      loadCommercePaymentVerificationContextV1({ scope, paymentAttemptId: ATTEMPT_ID }),
    ).rejects.toThrow('invalid platform');
  });

  it('maps unavailable or ineligible attempts to a non-enumerating NOT_FOUND', async () => {
    for (const constraint of [
      'qry_commerce_payment_verification_context_unavailable',
      'qry_commerce_payment_verification_context_state_ineligible',
    ]) {
      const { scope } = makeScope({ error: { constraint } });
      try {
        await loadCommercePaymentVerificationContextV1({
          scope,
          paymentAttemptId: ATTEMPT_ID,
        });
        throw new Error('expected context read to fail');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiCommandError);
        expect((error as ApiCommandError).code).toBe('NOT_FOUND');
      }
    }
  });

  it('rejects invalid attempt identity before hitting PostgreSQL', async () => {
    const { scope, query } = makeScope({ rows: [authorityRow()] });

    await expect(
      loadCommercePaymentVerificationContextV1({
        scope,
        paymentAttemptId: 'not-a-uuid',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(query).not.toHaveBeenCalled();
  });
});
