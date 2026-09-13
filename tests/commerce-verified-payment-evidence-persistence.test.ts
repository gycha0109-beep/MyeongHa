import { describe, expect, it, vi } from 'vitest';
import { ApiCommandError } from '../apps/api/src/api-error.js';
import { persistVerifiedPaymentEvidenceV1 } from '../apps/api/src/commerce-verified-payment-evidence-persistence.js';
import type { PostgresCommerceInternalExecutionScopeV1 } from '../apps/api/src/postgres-commerce-internal-execution.js';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const INTENT_ID = '22222222-2222-4222-8222-222222222222';
const RECEIPT_ID = '33333333-3333-4333-8333-333333333333';
const EVENT_ID = '44444444-4444-4444-8444-444444444444';
const FINGERPRINT = `hmac-sha256:k1:${'a'.repeat(64)}`;

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'commerce-evidence-v2',
    provider: 'testpay',
    platform: 'web',
    environment: 'sandbox',
    externalTransactionId: 'provider-tx-1',
    externalProductId: 'reading-once-v1',
    currentState: 'active',
    ownerBinding: {
      kind: 'purchase_intent',
      purchaseIntentId: INTENT_ID,
    },
    evidenceFingerprint: FINGERPRINT,
    verifierRevision: 'testpay-v1',
    verifiedAmountMinor: 12900,
    verifiedCurrency: 'KRW',
    verifiedAt: '2026-09-14T00:00:00.000Z',
    ...overrides,
  };
}

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

function resultRow(overrides: Record<string, unknown> = {}) {
  return {
    receiptId: RECEIPT_ID,
    providerEventId: EVENT_ID,
    replayed: false,
    ...overrides,
  };
}

describe('commerce verified payment evidence persistence', () => {
  it('projects canonical evidence into one narrow DB command with no subject parameter', async () => {
    const { scope, query } = makeScope({ rows: [resultRow()] });

    await expect(
      persistVerifiedPaymentEvidenceV1({
        scope,
        paymentAttemptId: ATTEMPT_ID,
        evidence: evidence({
          externalOriginalTransactionId: 'provider-original-1',
          externalEventId: 'provider-event-1',
          providerOccurredAt: '2026-09-13T23:59:58Z',
          providerOrderingKey: 'order-1',
          providerValidUntil: '2026-10-14T00:00:00Z',
        }),
      }),
    ).resolves.toEqual({
      receiptId: RECEIPT_ID,
      providerEventId: EVENT_ID,
      replayed: false,
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain(
      'public.cmd_persist_verified_payment_evidence_v1',
    );
    expect(query.mock.calls[0]?.[1]).toEqual([
      ATTEMPT_ID,
      INTENT_ID,
      'testpay',
      'web',
      'sandbox',
      'provider-tx-1',
      'provider-original-1',
      'provider-event-1',
      'reading-once-v1',
      'active',
      FINGERPRINT,
      'testpay-v1',
      12900,
      'KRW',
      '2026-09-14T00:00:00.000Z',
      '2026-09-13T23:59:58Z',
      'order-1',
      '2026-10-14T00:00:00Z',
    ]);
  });

  it('passes null for absent optional provider event facts so DB owns deterministic fallback', async () => {
    const { scope, query } = makeScope({ rows: [resultRow()] });

    await persistVerifiedPaymentEvidenceV1({
      scope,
      paymentAttemptId: ATTEMPT_ID,
      evidence: evidence(),
    });

    expect(query.mock.calls[0]?.[1]).toEqual([
      ATTEMPT_ID,
      INTENT_ID,
      'testpay',
      'web',
      'sandbox',
      'provider-tx-1',
      null,
      null,
      'reading-once-v1',
      'active',
      FINGERPRINT,
      'testpay-v1',
      12900,
      'KRW',
      '2026-09-14T00:00:00.000Z',
      null,
      null,
      null,
    ]);
  });

  it('rejects invalid UUIDs and invalid evidence before PostgreSQL', async () => {
    const first = makeScope({ rows: [resultRow()] });
    await expect(
      persistVerifiedPaymentEvidenceV1({
        scope: first.scope,
        paymentAttemptId: 'not-a-uuid',
        evidence: evidence(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(first.query).not.toHaveBeenCalled();

    const second = makeScope({ rows: [resultRow()] });
    await expect(
      persistVerifiedPaymentEvidenceV1({
        scope: second.scope,
        paymentAttemptId: ATTEMPT_ID,
        evidence: { ...evidence(), verifiedAmountMinor: 1.5 },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(second.query).not.toHaveBeenCalled();

    const third = makeScope({ rows: [resultRow()] });
    await expect(
      persistVerifiedPaymentEvidenceV1({
        scope: third.scope,
        paymentAttemptId: ATTEMPT_ID,
        evidence: evidence({
          ownerBinding: {
            kind: 'account_link',
            commerceAccountLinkId: INTENT_ID,
          },
        }),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(third.query).not.toHaveBeenCalled();
  });

  it('rejects non-active initial payment evidence before PostgreSQL', async () => {
    const { scope, query } = makeScope({ rows: [resultRow()] });
    await expect(
      persistVerifiedPaymentEvidenceV1({
        scope,
        paymentAttemptId: ATTEMPT_ID,
        evidence: evidence({ currentState: 'refunded' }),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(query).not.toHaveBeenCalled();
  });

  it('projects exact DB replay without allocating new identities', async () => {
    const { scope } = makeScope({ rows: [resultRow({ replayed: true })] });
    await expect(
      persistVerifiedPaymentEvidenceV1({
        scope,
        paymentAttemptId: ATTEMPT_ID,
        evidence: evidence(),
      }),
    ).resolves.toEqual({
      receiptId: RECEIPT_ID,
      providerEventId: EVENT_ID,
      replayed: true,
    });
  });

  it('maps command validation, authority absence, and immutable collision distinctly', async () => {
    const cases = [
      ['cmd_persist_verified_payment_evidence_v1_amount_invalid', 'INVALID_REQUEST'],
      ['cmd_persist_verified_payment_evidence_v1_attempt_unavailable', 'NOT_FOUND'],
      ['cmd_persist_verified_payment_evidence_v1_product_authority_mismatch', 'NOT_FOUND'],
      ['cmd_persist_verified_payment_evidence_v1_idempotency_conflict', 'IDEMPOTENCY_CONFLICT'],
      ['commerce_receipts_provider_transaction_unique', 'IDEMPOTENCY_CONFLICT'],
      ['commerce_provider_events_provider_external_unique', 'IDEMPOTENCY_CONFLICT'],
    ] as const;

    for (const [constraint, expectedCode] of cases) {
      const { scope } = makeScope({ error: { constraint } });
      try {
        await persistVerifiedPaymentEvidenceV1({
          scope,
          paymentAttemptId: ATTEMPT_ID,
          evidence: evidence(),
        });
        throw new Error('expected persistence to fail');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiCommandError);
        expect((error as ApiCommandError).code).toBe(expectedCode);
      }
    }
  });

  it('requires exactly one well-formed canonical result row', async () => {
    const empty = makeScope({ rows: [] }).scope;
    await expect(
      persistVerifiedPaymentEvidenceV1({
        scope: empty,
        paymentAttemptId: ATTEMPT_ID,
        evidence: evidence(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

    const multiple = makeScope({ rows: [resultRow(), resultRow()] }).scope;
    await expect(
      persistVerifiedPaymentEvidenceV1({
        scope: multiple,
        paymentAttemptId: ATTEMPT_ID,
        evidence: evidence(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

    const malformed = makeScope({
      rows: [resultRow({ receiptId: 'not-a-uuid' })],
    }).scope;
    await expect(
      persistVerifiedPaymentEvidenceV1({
        scope: malformed,
        paymentAttemptId: ATTEMPT_ID,
        evidence: evidence(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });
});
