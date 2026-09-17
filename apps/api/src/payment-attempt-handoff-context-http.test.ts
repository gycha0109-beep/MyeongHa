import { describe, expect, it, vi } from 'vitest';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  handlePaymentAttemptHandoffContextRequestV1,
  PAYMENT_ATTEMPT_HANDOFF_CONTEXT_HTTP_BINDINGS_V1,
} from './payment-attempt-handoff-context-http.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const PAYMENT_ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const PROVIDER_REQUEST_ID = 'mha_pa_portone-payment-id';

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

function fakePool(input: {
  queriedSql?: string[];
  authorityConstraint?: string;
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
          if (text.includes('qry_commerce_payment_attempt_handoff_context_v1')) {
            expect(values).toEqual([SUBJECT_ID, PAYMENT_ATTEMPT_ID]);
            if (input.authorityConstraint !== undefined) {
              throw Object.assign(new Error('private database detail'), {
                constraint: input.authorityConstraint,
                code: 'P0001',
              });
            }
            return { rows: [{
              paymentAttemptId: PAYMENT_ATTEMPT_ID,
              provider: 'portone_v2',
              environment: 'sandbox',
              providerRequestId: PROVIDER_REQUEST_ID,
              expectedAmountMinor: '12900',
              expectedCurrency: 'KRW',
              status: 'created',
            } as Row] };
          }
          throw new Error(`Unexpected SQL in Payment Attempt handoff HTTP test: ${text}`);
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
} = {}) {
  return handlePaymentAttemptHandoffContextRequestV1({
    request: input.request ?? post({ paymentAttemptId: PAYMENT_ATTEMPT_ID }),
    requestId: 'req-payment-attempt-handoff-v1',
    serverTime: '2026-09-17T14:45:00.000Z',
    identityEvidenceVerifier: verifier(
      input.evidence === undefined
        ? { kind: 'member', verifiedAuthUserId: AUTH_USER_ID }
        : input.evidence,
    ),
    pool: input.pool ?? fakePool(),
  });
}

describe('Payment Attempt handoff context authenticated HTTP foundation', () => {
  it('remains intentionally unmounted', () => {
    expect(PAYMENT_ATTEMPT_HANDOFF_CONTEXT_HTTP_BINDINGS_V1.publicRoute).toBeNull();
  });

  it('requires verified identity before body parsing or PostgreSQL access', async () => {
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

  it('resolves the canonical Subject before parsing and validating the request body', async () => {
    const queriedSql: string[] = [];
    const response = await invoke({
      request: post({
        paymentAttemptId: PAYMENT_ATTEMPT_ID,
        subjectId: SUBJECT_ID,
        provider: 'caller-pay',
        environment: 'production',
        providerRequestId: 'caller-payment-id',
        providerTransactionId: 'caller-transaction-id',
        amountMinor: 1,
        currency: 'USD',
      }),
      pool: fakePool({ queriedSql }),
    });

    expect(response.status).toBe(400);
    expect(queriedSql.some((sql) => sql.includes('begin_member_subject_context_v1'))).toBe(true);
    expect(
      queriedSql.some((sql) => sql.includes('qry_commerce_payment_attempt_handoff_context_v1')),
    ).toBe(false);
  });

  it('returns only canonical DB-owned handoff context', async () => {
    const queriedSql: string[] = [];
    const response = await invoke({ pool: fakePool({ queriedSql }) });
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      provider: 'portone_v2',
      environment: 'sandbox',
      providerRequestId: PROVIDER_REQUEST_ID,
      amountMinor: 12900,
      currency: 'KRW',
      status: 'created',
    });
    expect(JSON.stringify(payload)).not.toContain(SUBJECT_ID);
    expect(JSON.stringify(payload)).not.toContain('providerTransactionId');
    expect(JSON.stringify(payload)).not.toContain('storeId');
    expect(JSON.stringify(payload)).not.toContain('channelKey');
    expect(queriedSql.filter((sql) => sql.includes('qry_commerce_payment_attempt_handoff_context_v1'))).toHaveLength(1);
    expect(queriedSql.some((sql) => /\b(insert|update|delete)\b/iu.test(sql))).toBe(false);
  });

  it('maps owner mismatch or unavailable context to NOT_FOUND without database detail', async () => {
    const response = await invoke({
      pool: fakePool({
        authorityConstraint: 'qry_commerce_payment_attempt_handoff_context_unavailable',
      }),
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(404);
    expect(payload.error.code).toBe('NOT_FOUND');
    expect(JSON.stringify(payload)).not.toContain('private database detail');
  });
});
