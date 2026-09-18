import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  PortOneV2PaymentVerificationAdapterErrorV1,
  type PortOneV2PaymentHttpFetchV1,
} from './portone-v2-payment-verification-adapter.js';
import type {
  PostgresSubjectConnectionV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import {
  createProductionPaymentAttemptServerVerificationRuntimeV1,
  PRODUCTION_PAYMENT_ATTEMPT_SERVER_VERIFICATION_RUNTIME_BINDINGS_V1,
} from './production-payment-attempt-server-verification-runtime.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const PURCHASE_INTENT_ID = '22222222-2222-4222-8222-222222222222';
const PAYMENT_ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const RECEIPT_ID = '44444444-4444-4444-8444-444444444444';
const PROVIDER_EVENT_ID = '55555555-5555-4555-8555-555555555555';
const PROVIDER_REQUEST_ID = 'server-owned-portone-payment-id';
const EXTERNAL_PRODUCT_ID = 'server-owned-product';
const PROVIDER_TRANSACTION_ID = 'server-verified-portone-transaction';
const AMOUNT_MINOR = 4900;
const API_SECRET = 'server-side-portone-api-secret';
const EVIDENCE_SECRET = 'e'.repeat(32);
const GUEST_BEARER = `guest-runtime-${'x'.repeat(32)}`;

const ENV = Object.freeze({
  MYEONGHA_DATABASE_URL:
    'postgresql://myeongha_app:strong-password@db.example.com:5432/myeongha?sslmode=require',
  MYEONGHA_DATABASE_PRINCIPAL: 'myeongha_app',
  MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
  MYEONGHA_SUPABASE_API_KEY: 'supabase-server-key-123456789',
  MYEONGHA_GUEST_FINGERPRINT_SECRET: 'g'.repeat(32),
});

function fakePool(input: {
  queriedSql?: string[];
  connect?: PostgresSubjectPoolV1['connect'];
} = {}): PostgresSubjectPoolV1 {
  const connectImpl = async (): Promise<PostgresSubjectConnectionV1> => ({
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

      if (text.includes('begin_guest_subject_context_v1')) {
        expect(values).toHaveLength(1);
        expect(String(values?.[0])).toMatch(
          /^myeongha-guest-bearer-hmac-sha256-v1:[0-9a-f]{64}$/u,
        );
        return {
          rows: [{ subjectId: SUBJECT_ID, subjectKind: 'guest' } as Row],
        };
      }

      if (text.includes('qry_commerce_payment_verification_context_v1')) {
        expect(values).toEqual([SUBJECT_ID, PAYMENT_ATTEMPT_ID]);
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
            expectedCurrency: 'KRW',
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
        expect(values?.[13]).toBe('KRW');
        return {
          rows: [{
            receiptId: RECEIPT_ID,
            providerEventId: PROVIDER_EVENT_ID,
            replayed: false,
          } as Row],
        };
      }

      throw new Error(
        `Unexpected SQL in production payment verification runtime test: ${text}`,
      );
    },
    release: vi.fn(),
  });

  if (input.connect !== undefined) {
    return { connect: input.connect };
  }

  return { connect: vi.fn(connectImpl) };
}

function post(paymentAttemptId = PAYMENT_ATTEMPT_ID): Request {
  return new Request('https://myeongha.internal/internal-not-publicly-mounted', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GUEST_BEARER}`,
    },
    body: JSON.stringify({ paymentAttemptId }),
  });
}

function paidPaymentBody(): Record<string, unknown> {
  return {
    status: 'PAID',
    id: PROVIDER_REQUEST_ID,
    transactionId: PROVIDER_TRANSACTION_ID,
    products: [{ id: EXTERNAL_PRODUCT_ID }],
    channel: { type: 'TEST' },
    currency: 'KRW',
    amount: { total: AMOUNT_MINOR },
    paidAt: '2026-09-18T00:00:00.000Z',
  };
}

describe('production Payment Attempt server verification runtime', () => {
  it('composes production identity, owned context, PortOne verification, and persistence without a public route', async () => {
    const queriedSql: string[] = [];
    const providerCalls: Array<Readonly<{
      url: string;
      authorization: string | undefined;
    }>> = [];

    const fetchImpl: PortOneV2PaymentHttpFetchV1 = async (url, init) => {
      providerCalls.push({
        url,
        authorization: init.headers.authorization,
      });
      return new Response(JSON.stringify(paidPaymentBody()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const verificationConfig = {
      apiSecret: API_SECRET,
      evidenceHmacSecret: EVIDENCE_SECRET,
      fetchImpl,
      now: () => new Date('2026-09-18T00:00:01.000Z'),
    };

    const runtime = createProductionPaymentAttemptServerVerificationRuntimeV1({
      env: ENV,
      pool: fakePool({ queriedSql }),
      verificationConfig,
    });

    // Adapter configuration is snapshotted at runtime construction.
    verificationConfig.apiSecret = 'mutated-after-runtime-construction';

    const response = await runtime.handleRequest({
      request: post(),
      requestId: 'req-production-payment-verification-v1',
      serverTime: '2026-09-18T00:00:02.000Z',
    });
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      receiptId: RECEIPT_ID,
      replayed: false,
    });
    expect(providerCalls).toEqual([{
      url: `https://api.portone.io/payments/${encodeURIComponent(PROVIDER_REQUEST_ID)}`,
      authorization: `PortOne ${API_SECRET}`,
    }]);
    expect(
      queriedSql.filter((sql) =>
        sql.includes('qry_commerce_payment_verification_context_v1')),
    ).toHaveLength(1);
    expect(
      queriedSql.filter((sql) =>
        sql.includes('cmd_persist_verified_payment_evidence_v1')),
    ).toHaveLength(1);
    expect(JSON.stringify(payload)).not.toContain(PROVIDER_REQUEST_ID);
    expect(JSON.stringify(payload)).not.toContain(PROVIDER_TRANSACTION_ID);
    expect(JSON.stringify(payload)).not.toContain(API_SECRET);

    await runtime.close();
  });

  it('requires request identity before any DB or PortOne provider work', async () => {
    const connectCalls = vi.fn();
    const connect: PostgresSubjectPoolV1['connect'] = async () => {
      connectCalls();
      throw new Error('DB must not be reached');
    };
    let providerCalls = 0;
    const fetchImpl: PortOneV2PaymentHttpFetchV1 = async () => {
      providerCalls += 1;
      throw new Error('PortOne must not be reached');
    };

    const runtime = createProductionPaymentAttemptServerVerificationRuntimeV1({
      env: ENV,
      pool: fakePool({ connect }),
      verificationConfig: {
        apiSecret: API_SECRET,
        evidenceHmacSecret: EVIDENCE_SECRET,
        fetchImpl,
      },
    });

    const response = await runtime.handleRequest({
      request: new Request(
        'https://myeongha.internal/internal-not-publicly-mounted',
        {
          method: 'POST',
          body: '{not-json',
        },
      ),
      requestId: 'req-production-payment-verification-v1',
      serverTime: '2026-09-18T00:00:02.000Z',
    });

    expect(response.status).toBe(401);
    expect(connectCalls).not.toHaveBeenCalled();
    expect(providerCalls).toBe(0);

    await runtime.close();
  });

  it('fails closed during construction on invalid PortOne verification config', () => {
    const connectCalls = vi.fn();
    const connect: PostgresSubjectPoolV1['connect'] = async () => {
      connectCalls();
      throw new Error('must not connect');
    };

    expect(() =>
      createProductionPaymentAttemptServerVerificationRuntimeV1({
        env: ENV,
        pool: fakePool({ connect }),
        verificationConfig: {
          apiSecret: API_SECRET,
          evidenceHmacSecret: 'too-short',
        },
      }),
    ).toThrow(
      expect.objectContaining({
        name: 'PortOneV2PaymentVerificationAdapterErrorV1',
        code: 'INVALID_CONFIGURATION',
      } satisfies Partial<PortOneV2PaymentVerificationAdapterErrorV1>),
    );
    expect(connectCalls).not.toHaveBeenCalled();
  });

  it('defines no route or credential-env authority and contains no browser SDK activation', () => {
    expect(
      PRODUCTION_PAYMENT_ATTEMPT_SERVER_VERIFICATION_RUNTIME_BINDINGS_V1,
    ).toEqual({
      publicRoute: null,
      routeMounted: false,
      browserResultAuthority: false,
      serverVerificationRequired: true,
      credentialEnvAuthorityDefined: false,
    });

    const source = readFileSync(
      new URL(
        './production-payment-attempt-server-verification-runtime.ts',
        import.meta.url,
      ),
      'utf8',
    );

    expect(source).not.toContain('MYEONGHA_PORTONE');
    expect(source).not.toContain('PORTONE_API_SECRET');
    expect(source).not.toContain('PortOne.requestPayment(');
    expect(source).not.toContain('@portone/browser-sdk');
  });
});
