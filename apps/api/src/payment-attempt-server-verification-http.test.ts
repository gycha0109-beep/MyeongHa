import { describe, expect, it, vi } from 'vitest';
import type { CommercePaymentVerificationAdapterV1 } from './commerce-payment-verification-execution.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  handlePaymentAttemptServerVerificationRequestV1,
  PAYMENT_ATTEMPT_SERVER_VERIFICATION_HTTP_BINDINGS_V1,
} from './payment-attempt-server-verification-http.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import type { VerifiedCommerceEvidenceV2 } from './verified-commerce-evidence.js';

const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const PURCHASE_INTENT_ID = '33333333-3333-4333-8333-333333333333';
const PAYMENT_ATTEMPT_ID = '44444444-4444-4444-8444-444444444444';
const RECEIPT_ID = '55555555-5555-4555-8555-555555555555';
const PROVIDER_EVENT_ID = '66666666-6666-4666-8666-666666666666';
const PROVIDER_REQUEST_ID = 'server-owned-portone-payment-id';
const PRODUCT_ID = 'server-owned-product';
const TRANSACTION_ID = 'server-verified-portone-transaction';
const AMOUNT_MINOR = 4900;

const EVIDENCE: VerifiedCommerceEvidenceV2 = Object.freeze({
  schemaVersion: 'commerce-evidence-v2',
  provider: 'portone_v2',
  platform: 'web',
  environment: 'sandbox',
  externalTransactionId: TRANSACTION_ID,
  externalProductId: PRODUCT_ID,
  providerOccurredAt: '2026-09-18T00:00:00.000Z',
  currentState: 'active',
  ownerBinding: Object.freeze({
    kind: 'purchase_intent',
    purchaseIntentId: PURCHASE_INTENT_ID,
  }),
  evidenceFingerprint: `hmac-sha256:k1:${'a'.repeat(64)}`,
  verifierRevision: 'test-server-verifier-v1',
  verifiedAmountMinor: AMOUNT_MINOR,
  verifiedCurrency: 'KRW',
  verifiedAt: '2026-09-18T00:00:01.000Z',
});

function post(body: unknown): Request {
  return new Request('https://myeongha.internal/internal-not-publicly-mounted', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer member-secret',
    },
    body: JSON.stringify(body),
  });
}

function verifier(
  evidence: VerifiedSubjectIdentityEvidenceV1 | null,
): IdentityEvidenceVerificationPortV1 {
  return {
    verifyRequestIdentity: vi.fn(async () => evidence),
  };
}

function adapter(
  verify = vi.fn(async () => ({
    providerRequestId: PROVIDER_REQUEST_ID,
    evidence: EVIDENCE,
  })),
): CommercePaymentVerificationAdapterV1 & { verify: typeof verify } {
  return { verify } as CommercePaymentVerificationAdapterV1 & { verify: typeof verify };
}

function fakePool(input: {
  queriedSql?: string[];
  contextConstraint?: string;
  persistConstraint?: string;
  replayed?: boolean;
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
            return {
              rows: [{ subjectId: SUBJECT_ID, subjectKind: 'member' } as Row],
            };
          }

          if (text.includes('qry_commerce_payment_verification_context_v1')) {
            expect(values).toEqual([SUBJECT_ID, PAYMENT_ATTEMPT_ID]);
            if (input.contextConstraint !== undefined) {
              throw Object.assign(new Error('private context detail'), {
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
                expectedExternalProductId: PRODUCT_ID,
                expectedAmountMinor: String(AMOUNT_MINOR),
                expectedCurrency: 'KRW',
              } as Row],
            };
          }

          if (text.includes('cmd_persist_verified_payment_evidence_v1')) {
            if (input.persistConstraint !== undefined) {
              throw Object.assign(new Error('private persistence detail'), {
                constraint: input.persistConstraint,
              });
            }
            return {
              rows: [{
                receiptId: RECEIPT_ID,
                providerEventId: PROVIDER_EVENT_ID,
                replayed: input.replayed ?? false,
              } as Row],
            };
          }

          throw new Error(`Unexpected SQL in payment verification HTTP test: ${text}`);
        },
        release: vi.fn(),
      };
    },
  };
}

function invoke(input: {
  request?: Request;
  evidence?: VerifiedSubjectIdentityEvidenceV1 | null;
  pool?: PostgresSubjectPoolV1;
  verificationAdapter?: CommercePaymentVerificationAdapterV1;
} = {}) {
  return handlePaymentAttemptServerVerificationRequestV1({
    request: input.request ?? post({ paymentAttemptId: PAYMENT_ATTEMPT_ID }),
    requestId: 'req-payment-verification-v1',
    serverTime: '2026-09-18T00:10:00.000Z',
    identityEvidenceVerifier: verifier(
      input.evidence === undefined
        ? { kind: 'member', verifiedAuthUserId: AUTH_USER_ID }
        : input.evidence,
    ),
    pool: input.pool ?? fakePool(),
    verificationAdapter: input.verificationAdapter ?? adapter(),
  });
}

describe('Payment Attempt server verification HTTP foundation', () => {
  it('rejects unsupported methods without touching identity or Commerce authority', async () => {
    const verifyRequestIdentity = vi.fn(async () => {
      throw new Error('must not verify');
    });
    const connect = vi.fn(async () => {
      throw new Error('must not connect');
    });
    const response = await handlePaymentAttemptServerVerificationRequestV1({
      request: new Request('https://myeongha.internal/internal-not-publicly-mounted', {
        method: 'GET',
      }),
      requestId: 'req-payment-verification-v1',
      serverTime: '2026-09-18T00:10:00.000Z',
      identityEvidenceVerifier: { verifyRequestIdentity },
      pool: { connect },
      verificationAdapter: adapter(),
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(verifyRequestIdentity).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it('requires verified identity before parsing the body or opening PostgreSQL', async () => {
    const connect = vi.fn(async () => {
      throw new Error('must not connect');
    });
    const request = new Request('https://myeongha.internal/internal-not-publicly-mounted', {
      method: 'POST',
      body: '{not-json',
    });

    const response = await invoke({
      request,
      evidence: null,
      pool: { connect },
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(401);
    expect(payload.error).toEqual({
      code: 'AUTH_REQUIRED',
      messageKey: 'auth.required',
      retryable: false,
    });
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects browser/provider authority extras before DB or provider verification', async () => {
    const connect = vi.fn(async () => {
      throw new Error('must not connect');
    });
    const verificationAdapter = adapter();

    const response = await invoke({
      request: post({
        paymentAttemptId: PAYMENT_ATTEMPT_ID,
        paymentId: 'caller-payment',
        sdkAttemptId: 'caller-sdk-attempt',
        providerTransactionId: 'caller-transaction',
        amountMinor: 1,
        currency: 'USD',
        status: 'PAID',
      }),
      pool: { connect },
      verificationAdapter,
    });

    expect(response.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
    expect(verificationAdapter.verify).not.toHaveBeenCalled();
  });

  it('returns only minimal canonical server completion data after verified persistence', async () => {
    const verificationAdapter = adapter();
    const response = await invoke({ verificationAdapter });
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(payload).toEqual({
      ok: true,
      data: {
        paymentAttemptId: PAYMENT_ATTEMPT_ID,
        receiptId: RECEIPT_ID,
        replayed: false,
      },
      meta: {
        apiContractVersion: 'v0.9',
        requestId: 'req-payment-verification-v1',
        serverTime: '2026-09-18T00:10:00.000Z',
      },
    });
    expect(verificationAdapter.verify).toHaveBeenCalledWith({
      provider: 'portone_v2',
      platform: 'web',
      environment: 'sandbox',
      providerRequestId: PROVIDER_REQUEST_ID,
      purchaseIntentId: PURCHASE_INTENT_ID,
      expectedExternalProductId: PRODUCT_ID,
      expectedAmountMinor: AMOUNT_MINOR,
      expectedCurrency: 'KRW',
    });
    expect(JSON.stringify(payload)).not.toContain(PROVIDER_EVENT_ID);
    expect(JSON.stringify(payload)).not.toContain(TRANSACTION_ID);
    expect(JSON.stringify(payload)).not.toContain(PROVIDER_REQUEST_ID);
    expect(JSON.stringify(payload)).not.toContain('amountMinor');
    expect(JSON.stringify(payload)).not.toContain('currency');
  });

  it('maps unavailable or cross-owner verification context to not found without provider verification', async () => {
    const verificationAdapter = adapter();
    const response = await invoke({
      pool: fakePool({
        contextConstraint: 'qry_commerce_payment_verification_context_unavailable',
      }),
      verificationAdapter,
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe('NOT_FOUND');
    expect(JSON.stringify(payload)).not.toContain('private context detail');
    expect(verificationAdapter.verify).not.toHaveBeenCalled();
  });

  it('collapses a provider request mismatch to non-retryable capability unavailable', async () => {
    const response = await invoke({
      verificationAdapter: adapter(
        vi.fn(async () => ({
          providerRequestId: 'different-provider-request',
          evidence: EVIDENCE,
        })),
      ),
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(503);
    expect(payload.error).toEqual({
      code: 'CAPABILITY_UNAVAILABLE',
      messageKey: 'payment_attempt.verification_unavailable',
      retryable: false,
    });
    expect(JSON.stringify(payload)).not.toContain('REQUEST_ID_MISMATCH');
  });

  it('marks generic provider-adapter execution failure retryable without reflecting provider detail', async () => {
    const response = await invoke({
      verificationAdapter: adapter(
        vi.fn(async () => {
          throw new Error('private provider outage');
        }),
      ),
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(503);
    expect(payload.error).toEqual({
      code: 'CAPABILITY_UNAVAILABLE',
      messageKey: 'payment_attempt.verification_unavailable',
      retryable: true,
    });
    expect(JSON.stringify(payload)).not.toContain('private provider outage');
  });

  it('maps persistence idempotency conflicts without leaking database detail', async () => {
    const response = await invoke({
      pool: fakePool({
        persistConstraint: 'cmd_persist_verified_payment_evidence_v1_idempotency_conflict',
      }),
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(409);
    expect(payload.error).toEqual({
      code: 'IDEMPOTENCY_CONFLICT',
      messageKey: 'payment_attempt.verification_conflict',
      retryable: false,
    });
    expect(JSON.stringify(payload)).not.toContain('private persistence detail');
  });

  it('preserves replay metadata from the canonical persistence authority', async () => {
    const response = await invoke({
      pool: fakePool({ replayed: true }),
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      receiptId: RECEIPT_ID,
      replayed: true,
    });
  });

  it('remains unmounted and gives browser results no authority', () => {
    expect(PAYMENT_ATTEMPT_SERVER_VERIFICATION_HTTP_BINDINGS_V1).toEqual({
      method: 'POST',
      publicRoute: null,
      apiContractVersion: 'v0.9',
      successStatus: 200,
      serverVerificationRequired: true,
      browserResultAuthority: false,
    });
  });
});
