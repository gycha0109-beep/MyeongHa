import { describe, expect, it, vi } from 'vitest';
import {
  COMMERCE_SUBJECT_PAYMENT_COMPLETION_ORCHESTRATION_V1,
  executeSubjectOwnedCommercePaymentCompletionV1,
} from './commerce-subject-payment-completion-orchestration.js';
import type {
  CommercePaymentVerificationAdapterV1,
  CommercePaymentVerificationContextV1,
} from './commerce-payment-verification-execution.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedCommerceEvidenceV2 } from './verified-commerce-evidence.js';

const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const PURCHASE_INTENT_ID = '33333333-3333-4333-8333-333333333333';
const PAYMENT_ATTEMPT_ID = '44444444-4444-4444-8444-444444444444';
const RECEIPT_ID = '55555555-5555-4555-8555-555555555555';
const PROVIDER_EVENT_ID = '66666666-6666-4666-8666-666666666666';
const PROVIDER_REQUEST_ID = 'payment-request-server-owned';
const EXTERNAL_PRODUCT_ID = 'myeongha-product-server-owned';
const PROVIDER_TRANSACTION_ID = 'portone-transaction-server-verified';
const AMOUNT_MINOR = 4900;
const CURRENCY = 'KRW';

const VERIFIED_EVIDENCE: VerifiedCommerceEvidenceV2 = Object.freeze({
  schemaVersion: 'commerce-evidence-v2',
  provider: 'portone_v2',
  platform: 'web',
  environment: 'sandbox',
  externalTransactionId: PROVIDER_TRANSACTION_ID,
  externalProductId: EXTERNAL_PRODUCT_ID,
  providerOccurredAt: '2026-09-18T00:00:00.000Z',
  currentState: 'active',
  ownerBinding: Object.freeze({
    kind: 'purchase_intent',
    purchaseIntentId: PURCHASE_INTENT_ID,
  }),
  evidenceFingerprint: `hmac-sha256:k1:${'a'.repeat(64)}`,
  verifierRevision: 'test-server-verifier-v1',
  verifiedAmountMinor: AMOUNT_MINOR,
  verifiedCurrency: CURRENCY,
  verifiedAt: '2026-09-18T00:00:01.000Z',
});

function adapter(
  verify = vi.fn(async (request: CommercePaymentVerificationContextV1) => ({
    providerRequestId: request.providerRequestId,
    evidence: VERIFIED_EVIDENCE,
  })),
): CommercePaymentVerificationAdapterV1 & { verify: typeof verify } {
  return { verify } as CommercePaymentVerificationAdapterV1 & { verify: typeof verify };
}

function fakePool(input: {
  queriedSql?: string[];
  replayed?: boolean;
  contextConstraint?: string;
} = {}): PostgresSubjectPoolV1 {
  return {
    async connect(): Promise<PostgresSubjectConnectionV1> {
      return {
        async query<Row = Record<string, unknown>>(
          text: string,
          values?: readonly unknown[],
        ): Promise<{ rows: readonly Row[] }> {
          input.queriedSql?.push(text);

          if (
            text === 'BEGIN' ||
            text === 'COMMIT' ||
            text === 'ROLLBACK' ||
            text.startsWith('SET LOCAL ROLE') ||
            text.includes('assert_myeongha_subject_context_v1')
          ) {
            return { rows: [] };
          }

          if (text.includes('begin_member_subject_context_v1')) {
            expect(values).toEqual([AUTH_USER_ID]);
            return {
              rows: [{ subjectId: SUBJECT_ID, subjectKind: 'member' } as Row],
            };
          }

          if (text.includes('qry_commerce_payment_verification_context_v1')) {
            expect(values).toEqual([SUBJECT_ID, PAYMENT_ATTEMPT_ID]);
            if (input.contextConstraint !== undefined) {
              throw Object.assign(new Error('private verification-context detail'), {
                constraint: input.contextConstraint,
              });
            }
            return {
              rows: [{
                paymentAttemptId: PAYMENT_ATTEMPT_ID,
                purchaseIntentId: PURCHASE_INTENT_ID,
                provider: 'portone_v2',
                platform: 'web',
                environment: 'sandbox',
                providerRequestId: PROVIDER_REQUEST_ID,
                expectedProviderTransactionId: null,
                expectedExternalProductId: EXTERNAL_PRODUCT_ID,
                expectedAmountMinor: String(AMOUNT_MINOR),
                expectedCurrency: CURRENCY,
              } as Row],
            };
          }

          if (text.includes('cmd_persist_verified_payment_evidence_v1')) {
            expect(values?.[0]).toBe(PAYMENT_ATTEMPT_ID);
            expect(values?.[1]).toBe(PURCHASE_INTENT_ID);
            expect(values?.[2]).toBe('portone_v2');
            expect(values?.[3]).toBe('web');
            expect(values?.[4]).toBe('sandbox');
            expect(values?.[5]).toBe(PROVIDER_TRANSACTION_ID);
            expect(values?.[8]).toBe(EXTERNAL_PRODUCT_ID);
            expect(values?.[9]).toBe('active');
            expect(values?.[12]).toBe(AMOUNT_MINOR);
            expect(values?.[13]).toBe(CURRENCY);
            return {
              rows: [{
                receiptId: RECEIPT_ID,
                providerEventId: PROVIDER_EVENT_ID,
                replayed: input.replayed ?? false,
              } as Row],
            };
          }

          throw new Error(`Unexpected SQL in subject payment completion test: ${text}`);
        },
        release: vi.fn(),
      };
    },
  };
}

function invoke(input: {
  pool?: PostgresSubjectPoolV1;
  verificationAdapter?: CommercePaymentVerificationAdapterV1;
  paymentAttemptId?: unknown;
} = {}) {
  return executeSubjectOwnedCommercePaymentCompletionV1({
    pool: input.pool ?? fakePool(),
    verifiedEvidence: {
      kind: 'member',
      verifiedAuthUserId: AUTH_USER_ID,
    },
    paymentAttemptId: input.paymentAttemptId ?? PAYMENT_ATTEMPT_ID,
    verificationAdapter: input.verificationAdapter ?? adapter(),
  });
}

describe('subject-owned Commerce payment completion orchestration', () => {
  it('loads server-owned verification context, verifies provider-side, and persists only verified evidence', async () => {
    const queriedSql: string[] = [];
    const verificationAdapter = adapter();
    const result = await invoke({
      pool: fakePool({ queriedSql }),
      verificationAdapter,
    });

    expect(result).toEqual({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      receiptId: RECEIPT_ID,
      providerEventId: PROVIDER_EVENT_ID,
      replayed: false,
    });

    expect(verificationAdapter.verify).toHaveBeenCalledTimes(1);
    expect(verificationAdapter.verify).toHaveBeenCalledWith({
      provider: 'portone_v2',
      platform: 'web',
      environment: 'sandbox',
      providerRequestId: PROVIDER_REQUEST_ID,
      purchaseIntentId: PURCHASE_INTENT_ID,
      expectedExternalProductId: EXTERNAL_PRODUCT_ID,
      expectedAmountMinor: AMOUNT_MINOR,
      expectedCurrency: CURRENCY,
    });

    expect(
      queriedSql.filter((sql) => sql.includes('qry_commerce_payment_verification_context_v1')),
    ).toHaveLength(1);
    expect(
      queriedSql.filter((sql) => sql.includes('cmd_persist_verified_payment_evidence_v1')),
    ).toHaveLength(1);
    expect(queriedSql).toContain('SET LOCAL ROLE myeongha_api_executor');
    expect(queriedSql).toContain('SET LOCAL ROLE myeongha_commerce_internal_executor');
  });

  it('ignores caller-shaped browser/provider authority extras and verifies only persisted context', async () => {
    const verificationAdapter = adapter();
    const result = await executeSubjectOwnedCommercePaymentCompletionV1({
      pool: fakePool(),
      verifiedEvidence: {
        kind: 'member',
        verifiedAuthUserId: AUTH_USER_ID,
      },
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      verificationAdapter,
      provider: 'caller-provider',
      amountMinor: 1,
      currency: 'USD',
      paymentId: 'caller-payment-id',
      sdkAttemptId: 'caller-sdk-attempt',
      providerTransactionId: 'caller-transaction',
    } as unknown as Parameters<typeof executeSubjectOwnedCommercePaymentCompletionV1>[0]);

    expect(result.paymentAttemptId).toBe(PAYMENT_ATTEMPT_ID);
    expect(verificationAdapter.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'portone_v2',
        providerRequestId: PROVIDER_REQUEST_ID,
        expectedAmountMinor: AMOUNT_MINOR,
        expectedCurrency: CURRENCY,
      }),
    );
  });

  it('fails closed before provider verification when the owned verification context is unavailable', async () => {
    const verificationAdapter = adapter();
    const queriedSql: string[] = [];

    await expect(invoke({
      pool: fakePool({
        queriedSql,
        contextConstraint: 'qry_commerce_payment_verification_context_unavailable',
      }),
      verificationAdapter,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(verificationAdapter.verify).not.toHaveBeenCalled();
    expect(
      queriedSql.some((sql) => sql.includes('cmd_persist_verified_payment_evidence_v1')),
    ).toBe(false);
  });

  it('never persists when provider verification does not correlate to the server request identity', async () => {
    const queriedSql: string[] = [];
    const verificationAdapter = adapter(
      vi.fn(async () => ({
        providerRequestId: 'different-provider-request',
        evidence: VERIFIED_EVIDENCE,
      })),
    );

    await expect(invoke({
      pool: fakePool({ queriedSql }),
      verificationAdapter,
    })).rejects.toMatchObject({ code: 'REQUEST_ID_MISMATCH' });

    expect(
      queriedSql.some((sql) => sql.includes('cmd_persist_verified_payment_evidence_v1')),
    ).toBe(false);
  });

  it('returns canonical replay metadata from the persistence authority', async () => {
    await expect(invoke({
      pool: fakePool({ replayed: true }),
    })).resolves.toEqual({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      receiptId: RECEIPT_ID,
      providerEventId: PROVIDER_EVENT_ID,
      replayed: true,
    });
  });

  it('normalizes a validated caller Payment Attempt identity before persistence and response', async () => {
    await expect(invoke({
      paymentAttemptId: PAYMENT_ATTEMPT_ID.toUpperCase(),
    })).resolves.toMatchObject({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
    });
  });

  it('remains unmounted and grants no browser or entitlement authority', () => {
    expect(COMMERCE_SUBJECT_PAYMENT_COMPLETION_ORCHESTRATION_V1).toEqual({
      active: false,
      publicRoute: null,
      browserResultAuthority: false,
      serverVerificationRequired: true,
      entitlementAuthority: false,
    });
  });
});
