import { describe, expect, it, vi } from 'vitest';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  derivePaymentAttemptProviderRequestIdV1,
  type PaymentAttemptServerIdentityPortV1,
} from './payment-attempt-create-command.js';
import { handlePaymentAttemptCreateRequestV1 } from './payment-attempt-create-http.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const PURCHASE_INTENT_ID = '33333333-3333-4333-8333-333333333333';
const PAYMENT_ATTEMPT_ID = '44444444-4444-4444-8444-444444444444';
const OFFER_ID = '55555555-5555-4555-8555-555555555555';
const IDEMPOTENCY_KEY = 'payment-attempt-1';
const PROVIDER_REQUEST_ID = derivePaymentAttemptProviderRequestIdV1({
  purchaseIntentId: PURCHASE_INTENT_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
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
  return { verifyRequestIdentity: vi.fn(async () => evidence) };
}

function identityPort(): PaymentAttemptServerIdentityPortV1 {
  return {
    nextPaymentAttemptId: vi.fn(async () => PAYMENT_ATTEMPT_ID),
    providerRequestIdFor: vi.fn(async (input) =>
      derivePaymentAttemptProviderRequestIdV1(input)),
  };
}

function fakePool(input: {
  queriedSql?: string[];
  commandConstraint?: string;
  replayed?: boolean;
  returnedPaymentAttemptId?: string;
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
            text.startsWith('SET LOCAL ROLE') ||
            text === 'COMMIT' ||
            text === 'ROLLBACK' ||
            text.includes('assert_myeongha_subject_context_v1')
          ) return { rows: [] };
          if (text.includes('begin_member_subject_context_v1')) {
            return { rows: [{ subjectId: SUBJECT_ID, subjectKind: 'member' } as Row] };
          }
          if (text.includes('cmd_create_payment_attempt_v1')) {
            expect(values).toEqual([
              SUBJECT_ID,
              PAYMENT_ATTEMPT_ID,
              PURCHASE_INTENT_ID,
              'sandbox',
              IDEMPOTENCY_KEY,
              PROVIDER_REQUEST_ID,
            ]);
            if (input.commandConstraint !== undefined) {
              throw Object.assign(new Error('private database detail'), {
                constraint: input.commandConstraint,
                code: input.commandConstraint === 'cmd_payment_attempt_v1_intent_not_found'
                  ? 'P0001'
                  : '23505',
              });
            }
            return { rows: [{
              paymentAttemptId: input.returnedPaymentAttemptId ?? PAYMENT_ATTEMPT_ID,
              purchaseIntentId: PURCHASE_INTENT_ID,
              productOfferId: OFFER_ID,
              attemptNo: 1,
              provider: 'testpay',
              environment: 'sandbox',
              providerRequestId: PROVIDER_REQUEST_ID,
              providerTransactionId: null,
              status: 'created',
              replayed: input.replayed ?? false,
            } as Row] };
          }
          throw new Error(`Unexpected SQL in Payment Attempt HTTP test: ${text}`);
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
  serverIdentityPort?: PaymentAttemptServerIdentityPortV1;
} = {}) {
  return handlePaymentAttemptCreateRequestV1({
    request: input.request ?? post({
      purchaseIntentId: PURCHASE_INTENT_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
    }),
    requestId: 'req-payment-attempt-v1',
    serverTime: '2026-09-17T14:00:00.000Z',
    environment: 'sandbox',
    identityEvidenceVerifier: verifier(
      input.evidence === undefined
        ? { kind: 'member', verifiedAuthUserId: AUTH_USER_ID }
        : input.evidence,
    ),
    pool: input.pool ?? fakePool(),
    identityPort: input.serverIdentityPort ?? identityPort(),
  });
}

describe('Payment Attempt authenticated HTTP runtime foundation', () => {
  it('requires verified identity before parsing body or connecting PostgreSQL', async () => {
    const connect = vi.fn(async () => { throw new Error('must not connect'); });
    const request = new Request('https://myeongha.internal/internal-not-publicly-mounted', {
      method: 'POST',
      headers: { Authorization: 'Bearer bad' },
      body: '{not-json',
    });
    const response = await invoke({ request, evidence: null, pool: { connect } });
    expect(response.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects caller-owned commerce authority before opening PostgreSQL', async () => {
    const connect = vi.fn(async () => { throw new Error('must not connect'); });
    const response = await invoke({
      request: post({
        purchaseIntentId: PURCHASE_INTENT_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        subjectId: SUBJECT_ID,
        environment: 'production',
        provider: 'caller-pay',
        providerRequestId: 'caller-request',
        amountMinor: 1,
        currency: 'KRW',
      }),
      pool: { connect },
    });
    expect(response.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });

  it('uses transaction-local Subject and only the governed create command', async () => {
    const queriedSql: string[] = [];
    const response = await invoke({ pool: fakePool({ queriedSql }) });
    const payload = await response.json() as any;
    expect(response.status).toBe(200);
    expect(payload.data).toEqual({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      status: 'created',
    });
    expect(queriedSql.filter((sql) => sql.includes('cmd_create_payment_attempt_v1'))).toHaveLength(1);
    expect(queriedSql.some((sql) => /insert\s+into\s+public\.commerce_payment_attempts/iu.test(sql))).toBe(false);
    expect(JSON.stringify(payload)).not.toContain(SUBJECT_ID);
    expect(JSON.stringify(payload)).not.toContain(PROVIDER_REQUEST_ID);
    expect(JSON.stringify(payload)).not.toContain('testpay');
    expect(JSON.stringify(payload)).not.toContain('amountMinor');
    expect(JSON.stringify(payload)).not.toContain('currency');
  });

  it('derives a stable opaque provider request identity for exact replay', () => {
    const first = derivePaymentAttemptProviderRequestIdV1({
      purchaseIntentId: PURCHASE_INTENT_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
    });
    const second = derivePaymentAttemptProviderRequestIdV1({
      purchaseIntentId: PURCHASE_INTENT_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
    });
    expect(first).toBe(second);
    expect(first).not.toContain(IDEMPOTENCY_KEY);
    expect(first).not.toContain(PURCHASE_INTENT_ID);
  });

  it('accepts DB replay identity even when a fresh proposed Payment Attempt id differs', async () => {
    const historicalId = '66666666-6666-4666-8666-666666666666';
    const response = await invoke({
      pool: fakePool({ replayed: true, returnedPaymentAttemptId: historicalId }),
    });
    const payload = await response.json() as any;
    expect(response.status).toBe(200);
    expect(payload.data).toEqual({ paymentAttemptId: historicalId, status: 'created' });
  });

  it('maps idempotency conflicts without leaking PostgreSQL detail', async () => {
    const response = await invoke({
      pool: fakePool({ commandConstraint: 'cmd_payment_attempt_v1_idempotency_conflict' }),
    });
    const payload = await response.json() as any;
    expect(response.status).toBe(409);
    expect(payload.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(JSON.stringify(payload)).not.toContain('private database detail');
  });

  it('maps owner-mismatched or missing Purchase Intent to not found', async () => {
    const response = await invoke({
      pool: fakePool({ commandConstraint: 'cmd_payment_attempt_v1_intent_not_found' }),
    });
    const payload = await response.json() as any;
    expect(response.status).toBe(404);
    expect(payload.error.code).toBe('NOT_FOUND');
  });
});
