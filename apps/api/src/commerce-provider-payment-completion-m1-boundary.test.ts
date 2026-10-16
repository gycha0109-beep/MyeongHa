import { describe, expect, it, vi } from 'vitest';
import {
  executeAuthenticatedCommerceProviderPaymentCompletionV1,
  type CommerceProviderIngressAuthenticatorV1,
} from './commerce-provider-payment-completion-orchestration.js';
import type {
  CommercePaymentVerificationAdapterV1,
  CommercePaymentVerificationContextV1,
} from './commerce-payment-verification-execution.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedCommerceEvidenceV2 } from './verified-commerce-evidence.js';

// M1-01: integration boundary of the *actual* provider completion caller.
// This deliberately does not synthesize a paid Reader Grant or invoke the
// private D2 SQL functions. D2's runtime EXECUTE/cutover remains HOLD.
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const INTENT_ID = '33333333-3333-4333-8333-333333333333';
const RECEIPT_ID = '44444444-4444-4444-8444-444444444444';
const EVENT_ID = '55555555-5555-4555-8555-555555555555';
const PAYMENT_ID = 'm1-01-merchant-payment-id';
const TRANSACTION_ID = 'm1-01-provider-transaction-id';
const PRODUCT_ID = 'm1-01-synthetic-external-product';

const EVIDENCE: VerifiedCommerceEvidenceV2 = Object.freeze({
  schemaVersion: 'commerce-evidence-v2',
  provider: 'portone_v2',
  platform: 'web',
  environment: 'sandbox',
  externalTransactionId: TRANSACTION_ID,
  externalProductId: PRODUCT_ID,
  currentState: 'active',
  ownerBinding: Object.freeze({
    kind: 'purchase_intent',
    purchaseIntentId: INTENT_ID,
  }),
  evidenceFingerprint: 'hmac-sha256:k1:' + 'a'.repeat(64),
  verifierRevision: 'm1-01-synthetic-verifier',
  verifiedAmountMinor: 6543,
  verifiedCurrency: 'KRW',
  verifiedAt: '2026-10-16T00:00:01.000Z',
});

interface Trace {
  readonly steps: string[];
  readonly values: (readonly unknown[] | undefined)[];
  releases: number;
}

function recordingPool(input: {
  trace: Trace;
  replayed?: boolean;
  rejectPersistence?: boolean;
}): PostgresSubjectPoolV1 {
  return {
    async connect(): Promise<PostgresSubjectConnectionV1> {
      return {
        async query<Row = Record<string, unknown>>(
          sql: string,
          params?: readonly unknown[],
        ): Promise<{ rows: readonly Row[] }> {
          input.trace.steps.push(sql);
          input.trace.values.push(params);
          if (
            sql === 'BEGIN' ||
            sql === 'COMMIT' ||
            sql === 'ROLLBACK' ||
            sql === 'SET LOCAL ROLE myeongha_commerce_internal_executor'
          ) {
            return { rows: [] };
          }

          if (sql.includes('qry_commerce_provider_payment_verification_context_v1')) {
            expect(params).toEqual(['portone_v2', 'sandbox', PAYMENT_ID, null]);
            return { rows: [{
              paymentAttemptId: ATTEMPT_ID,
              resolvedSubjectId: SUBJECT_ID,
              purchaseIntentId: INTENT_ID,
              provider: 'portone_v2',
              platform: 'web',
              environment: 'sandbox',
              providerRequestId: PAYMENT_ID,
              expectedProviderTransactionId: null,
              expectedExternalProductId: PRODUCT_ID,
              expectedAmountMinor: '6543',
              expectedCurrency: 'KRW',
            } as Row] };
          }

          if (sql.includes('cmd_persist_verified_payment_evidence_v1')) {
            expect(params?.[0]).toBe(ATTEMPT_ID);
            expect(params?.[1]).toBe(INTENT_ID);
            expect(params?.[5]).toBe(TRANSACTION_ID);
            expect(params?.[8]).toBe(PRODUCT_ID);
            expect(params?.[12]).toBe(6543);
            if (input.rejectPersistence) {
              throw Object.assign(new Error('synthetic persistence conflict'), {
                constraint: 'cmd_persist_verified_payment_evidence_v1_idempotency_conflict',
              });
            }
            return { rows: [{
              receiptId: RECEIPT_ID,
              providerEventId: EVENT_ID,
              replayed: input.replayed ?? false,
            } as Row] };
          }

          // A surprise entitlement/bind invocation fails the test immediately.
          throw new Error('Unexpected SQL in M1-01 payment completion: ' + sql);
        },
        release() {
          input.trace.releases += 1;
        },
      };
    },
  };
}

function newTrace(): Trace {
  return { steps: [], values: [], releases: 0 };
}

function authenticatedIngress(): CommerceProviderIngressAuthenticatorV1 {
  return {
    authenticate: vi.fn(async () => ({
      provider: 'portone_v2',
      environment: 'sandbox',
      providerRequestId: PAYMENT_ID,
    })),
  };
}

function verifier(
  trace: Trace,
  result: { providerRequestId: string; evidence: unknown } = {
    providerRequestId: PAYMENT_ID,
    evidence: EVIDENCE,
  },
): CommercePaymentVerificationAdapterV1 {
  return {
    verify: vi.fn(async (context: CommercePaymentVerificationContextV1) => {
      trace.steps.push('PROVIDER_LOOKUP');
      expect(context).toEqual({
        provider: 'portone_v2',
        platform: 'web',
        environment: 'sandbox',
        providerRequestId: PAYMENT_ID,
        purchaseIntentId: INTENT_ID,
        expectedExternalProductId: PRODUCT_ID,
        expectedAmountMinor: 6543,
        expectedCurrency: 'KRW',
      });
      return result;
    }),
  };
}

function sqlCalls(trace: Trace): string[] {
  return trace.steps.filter((step) =>
    step.includes('qry_commerce_provider_payment_verification_context_v1') ||
    step.includes('cmd_persist_verified_payment_evidence_v1'),
  );
}

function assertNoFulfillment(trace: Trace): void {
  const forbidden = [
    'internal_apply_verified_receipt_capability_effects_v1',
    'internal_apply_official_reader_unified_receipt_v1',
    'internal_cmd_bind_official_reader_unified_v1',
    'cmd_bind_standard_reading_access_v2',
    'internal_apply_entitlement_effect_v1',
  ];
  expect(trace.steps.filter((step) =>
    forbidden.some((name) => step.includes(name)),
  )).toEqual([]);
}

describe('M1-01 provider payment completion to Reader fulfillment boundary', () => {
  it('uses two separate internal-role transactions around server verification; persists evidence only', async () => {
    const trace = newTrace();
    const result = await executeAuthenticatedCommerceProviderPaymentCompletionV1({
      pool: recordingPool({ trace }),
      ingress: Object.freeze({ transportHint: PAYMENT_ID }),
      authenticator: authenticatedIngress(),
      verificationAdapter: verifier(trace),
    });

    expect(result).toEqual({
      paymentAttemptId: ATTEMPT_ID,
      receiptId: RECEIPT_ID,
      providerEventId: EVENT_ID,
      replayed: false,
    });
    expect(trace.steps.filter((step) => step === 'BEGIN')).toHaveLength(2);
    expect(trace.steps.filter((step) => step === 'COMMIT')).toHaveLength(2);
    expect(trace.steps.filter((step) =>
      step === 'SET LOCAL ROLE myeongha_commerce_internal_executor',
    )).toHaveLength(2);
    expect(trace.releases).toBe(2);
    const verificationIndex = trace.steps.indexOf('PROVIDER_LOOKUP');
    const firstCommitIndex = trace.steps.indexOf('COMMIT');
    const secondBeginIndex = trace.steps.indexOf('BEGIN', firstCommitIndex + 1);
    expect(firstCommitIndex).toBeLessThan(verificationIndex);
    expect(verificationIndex).toBeLessThan(secondBeginIndex);
    expect(sqlCalls(trace)).toHaveLength(2);
    assertNoFulfillment(trace);
  });

  it('returns a replayed verified Receipt without treating replay as a Grant', async () => {
    const trace = newTrace();
    await expect(executeAuthenticatedCommerceProviderPaymentCompletionV1({
      pool: recordingPool({ trace, replayed: true }),
      ingress: PAYMENT_ID,
      authenticator: authenticatedIngress(),
      verificationAdapter: verifier(trace),
    })).resolves.toMatchObject({ receiptId: RECEIPT_ID, replayed: true });
    expect(sqlCalls(trace)).toHaveLength(2);
    assertNoFulfillment(trace);
  });

  it('rejects unauthenticated ingress before any DB transaction or provider lookup', async () => {
    const trace = newTrace();
    const verify = vi.fn();
    await expect(executeAuthenticatedCommerceProviderPaymentCompletionV1({
      pool: recordingPool({ trace }),
      ingress: PAYMENT_ID,
      authenticator: { authenticate: async () => { throw new Error('invalid signature'); } },
      verificationAdapter: { verify },
    })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(trace.steps).toEqual([]);
    expect(trace.releases).toBe(0);
    expect(verify).not.toHaveBeenCalled();
  });

  it('rejects mismatched provider lookup identity before receipt persistence', async () => {
    const trace = newTrace();
    await expect(executeAuthenticatedCommerceProviderPaymentCompletionV1({
      pool: recordingPool({ trace }),
      ingress: PAYMENT_ID,
      authenticator: authenticatedIngress(),
      verificationAdapter: verifier(trace, {
        providerRequestId: 'different-provider-request',
        evidence: EVIDENCE,
      }),
    })).rejects.toMatchObject({ code: 'REQUEST_ID_MISMATCH' });
    expect(sqlCalls(trace)).toHaveLength(1);
    assertNoFulfillment(trace);
  });

  it('rolls back failed Receipt persistence and never enters Reader issuance', async () => {
    const trace = newTrace();
    await expect(executeAuthenticatedCommerceProviderPaymentCompletionV1({
      pool: recordingPool({ trace, rejectPersistence: true }),
      ingress: PAYMENT_ID,
      authenticator: authenticatedIngress(),
      verificationAdapter: verifier(trace),
    })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(trace.steps.filter((step) => step === 'COMMIT')).toHaveLength(1);
    expect(trace.steps.filter((step) => step === 'ROLLBACK')).toHaveLength(1);
    expect(trace.releases).toBe(2);
    assertNoFulfillment(trace);
  });
});
