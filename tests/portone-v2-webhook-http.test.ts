import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1,
} from '../apps/api/src/portone-v2-webhook-payment-completion.js';
import {
  PORTONE_V2_WEBHOOK_HTTP_BINDINGS_V1,
  handlePortOneV2WebhookRequestV1,
} from '../apps/api/src/portone-v2-webhook-http.js';
import type {
  CommercePaymentVerificationAdapterV1,
  CommercePaymentVerificationContextV1,
} from '../apps/api/src/commerce-payment-verification-execution.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const NOW = new Date('2026-09-14T06:40:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1_000);
const SECRET_BYTES = Buffer.from('0123456789abcdef0123456789abcdef');
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;
const ROUTE = 'https://myeongha.test/api/commerce/webhooks/portone-v2';
const PAYMENT_ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const PURCHASE_INTENT_ID = '33333333-3333-4333-8333-333333333333';
const RECEIPT_ID = '44444444-4444-4444-8444-444444444444';
const PROVIDER_EVENT_ID = '55555555-5555-4555-8555-555555555555';

function sign(rawBody: string | Uint8Array, timestamp = NOW_SECONDS): string {
  return `v1,${createHmac('sha256', SECRET_BYTES)
    .update('msg_1')
    .update('.')
    .update(String(timestamp))
    .update('.')
    .update(typeof rawBody === 'string' ? Buffer.from(rawBody) : Buffer.from(rawBody))
    .digest('base64')}`;
}

function payload(type = 'Future.NewEvent'): string {
  return ` {\n  "type": "${type}",\n  "timestamp": "2026-09-14T06:39:59.000Z",\n  "data": {"paymentId":"payment-1","transactionId":"transaction-1","environment":"production","subjectId":"${SUBJECT_ID}","amount":999999,"currency":"USD","productId":"attacker-product"}\n } `;
}

function webhookRequest(input: {
  readonly rawBody?: string | Uint8Array;
  readonly url?: string;
  readonly method?: string;
  readonly timestamp?: number;
  readonly signature?: string;
  readonly extraHeaders?: Readonly<Record<string, string>>;
} = {}): Request {
  const rawBody = input.rawBody ?? payload();
  const timestamp = input.timestamp ?? NOW_SECONDS;
  return new Request(input.url ?? ROUTE, {
    method: input.method ?? 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': 'msg_1',
      'webhook-timestamp': String(timestamp),
      'webhook-signature': input.signature ?? sign(rawBody, timestamp),
      ...input.extraHeaders,
    },
    body: rawBody,
  });
}

function config(webhookSecrets: readonly string[] = [SECRET]) {
  return {
    environment: 'sandbox' as const,
    webhookSecrets,
    now: () => NOW,
  };
}

function rejectingPool(): PostgresSubjectPoolV1 {
  return {
    connect: vi.fn(async () => {
      throw new Error('DB_INTERNAL_SECRET');
    }),
  } as unknown as PostgresSubjectPoolV1;
}

function unusedAdapter(): CommercePaymentVerificationAdapterV1 {
  return {
    verify: vi.fn(async () => {
      throw new Error('PROVIDER_INTERNAL_SECRET');
    }),
  };
}

function harness(replayed = false) {
  const connect = vi.fn(async () => {
    const query = vi.fn(async (text: string) => {
      if (
        text === 'BEGIN' ||
        text === 'COMMIT' ||
        text === 'ROLLBACK' ||
        text === 'SET LOCAL ROLE myeongha_commerce_internal_executor'
      ) {
        return { rows: [] };
      }
      if (text.includes('qry_commerce_provider_payment_verification_context_v1')) {
        return {
          rows: [
            {
              paymentAttemptId: PAYMENT_ATTEMPT_ID,
              resolvedSubjectId: SUBJECT_ID,
              purchaseIntentId: PURCHASE_INTENT_ID,
              provider: 'portone_v2',
              platform: 'web',
              environment: 'sandbox',
              providerRequestId: 'payment-1',
              expectedProviderTransactionId: 'transaction-1',
              expectedExternalProductId: 'external-product-1',
              expectedAmountMinor: '1000',
              expectedCurrency: 'KRW',
            },
          ],
        };
      }
      if (text.includes('cmd_persist_verified_payment_evidence_v1')) {
        return {
          rows: [
            {
              receiptId: RECEIPT_ID,
              providerEventId: PROVIDER_EVENT_ID,
              replayed,
            },
          ],
        };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    });
    return { query, release: vi.fn() };
  });
  return {
    pool: { connect } as unknown as PostgresSubjectPoolV1,
    connect,
  };
}

function evidence() {
  return {
    schemaVersion: 'commerce-evidence-v2' as const,
    provider: 'portone_v2',
    platform: 'web',
    environment: 'sandbox' as const,
    externalTransactionId: 'transaction-1',
    externalProductId: 'external-product-1',
    currentState: 'active' as const,
    ownerBinding: {
      kind: 'purchase_intent' as const,
      purchaseIntentId: PURCHASE_INTENT_ID,
    },
    evidenceFingerprint: `hmac-sha256:k1:${'a'.repeat(64)}`,
    verifierRevision: 'test-v1',
    providerOccurredAt: '2026-09-14T06:39:59.000Z',
    verifiedAmountMinor: 1000,
    verifiedCurrency: 'KRW',
    verifiedAt: NOW.toISOString(),
  };
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('PortOne V2 webhook HTTP transport', () => {
  it('publishes only the repository route contract and no-store policy', () => {
    expect(PORTONE_V2_WEBHOOK_HTTP_BINDINGS_V1).toEqual({
      method: 'POST',
      route: '/api/commerce/webhooks/portone-v2',
      apiContractVersion: 'v0.9',
      maxBodyBytes: PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1,
    });
  });

  it('returns 404/405 before reading the request body or touching Commerce work', async () => {
    const wrongRoute = webhookRequest({ url: `${ROUTE}/wrong` });
    const wrongRouteRead = vi.spyOn(wrongRoute, 'arrayBuffer');
    const wrongRoutePool = rejectingPool();
    const wrongRouteAdapter = unusedAdapter();
    const notFound = await handlePortOneV2WebhookRequestV1({
      request: wrongRoute,
      pool: wrongRoutePool,
      config: config(),
      verificationAdapter: wrongRouteAdapter,
    });
    expect(notFound.status).toBe(404);
    expect(notFound.headers.get('cache-control')).toBe('no-store');
    expect(wrongRouteRead).not.toHaveBeenCalled();
    expect(wrongRoutePool.connect).not.toHaveBeenCalled();
    expect(wrongRouteAdapter.verify).not.toHaveBeenCalled();

    const wrongMethod = webhookRequest({ method: 'PUT' });
    const wrongMethodRead = vi.spyOn(wrongMethod, 'arrayBuffer');
    const methodPool = rejectingPool();
    const methodAdapter = unusedAdapter();
    const methodNotAllowed = await handlePortOneV2WebhookRequestV1({
      request: wrongMethod,
      pool: methodPool,
      config: config(),
      verificationAdapter: methodAdapter,
    });
    expect(methodNotAllowed.status).toBe(405);
    expect(methodNotAllowed.headers.get('allow')).toBe('POST');
    expect(wrongMethodRead).not.toHaveBeenCalled();
    expect(methodPool.connect).not.toHaveBeenCalled();
    expect(methodAdapter.verify).not.toHaveBeenCalled();
  });

  it('preserves exact raw bytes and returns an empty 204 for authenticated ignored events', async () => {
    const rawBody = payload('Future.NewEvent');
    const request = webhookRequest({ rawBody });
    const read = vi.spyOn(request, 'arrayBuffer');
    const pool = rejectingPool();
    const adapter = unusedAdapter();
    const response = await handlePortOneV2WebhookRequestV1({
      request,
      pool,
      config: config(),
      verificationAdapter: adapter,
    });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(read).toHaveBeenCalledTimes(1);
    expect(pool.connect).not.toHaveBeenCalled();
    expect(adapter.verify).not.toHaveBeenCalled();
  });

  it('fails closed on malformed Content-Length, unreadable, empty, and oversized bodies', async () => {
    const preflight = webhookRequest({
      extraHeaders: {
        'content-length': String(PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1 + 1),
      },
    });
    const preflightRead = vi.spyOn(preflight, 'arrayBuffer');
    expect((await handlePortOneV2WebhookRequestV1({
      request: preflight,
      pool: rejectingPool(),
      config: config(),
      verificationAdapter: unusedAdapter(),
    })).status).toBe(400);
    expect(preflightRead).not.toHaveBeenCalled();

    const malformedLength = webhookRequest({ extraHeaders: { 'content-length': '01' } });
    expect((await handlePortOneV2WebhookRequestV1({
      request: malformedLength,
      pool: rejectingPool(),
      config: config(),
      verificationAdapter: unusedAdapter(),
    })).status).toBe(400);

    const unreadable = webhookRequest();
    vi.spyOn(unreadable, 'arrayBuffer').mockRejectedValue(new Error('RAW_BODY_SECRET'));
    expect((await handlePortOneV2WebhookRequestV1({
      request: unreadable,
      pool: rejectingPool(),
      config: config(),
      verificationAdapter: unusedAdapter(),
    })).status).toBe(400);

    const oversized = 'x'.repeat(PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1 + 1);
    const oversizedRequest = webhookRequest({ rawBody: oversized });
    expect((await handlePortOneV2WebhookRequestV1({
      request: oversizedRequest,
      pool: rejectingPool(),
      config: config(),
      verificationAdapter: unusedAdapter(),
    })).status).toBe(400);

    const empty = new Request(ROUTE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '',
    });
    expect((await handlePortOneV2WebhookRequestV1({
      request: empty,
      pool: rejectingPool(),
      config: config(),
      verificationAdapter: unusedAdapter(),
    })).status).toBe(400);
  });

  it('maps signature, timestamp, and verified-webhook rejection to generic safe 400 responses', async () => {
    const rawBody = payload();
    const cases = [
      webhookRequest({ rawBody, signature: `v1,${Buffer.alloc(32).toString('base64')}` }),
      webhookRequest({ rawBody, timestamp: NOW_SECONDS - 301 }),
      webhookRequest({ rawBody: 'not-json' }),
    ];
    for (const request of cases) {
      const response = await handlePortOneV2WebhookRequestV1({
        request,
        pool: rejectingPool(),
        config: config(),
        verificationAdapter: unusedAdapter(),
      });
      expect(response.status).toBe(400);
      const serialized = JSON.stringify(await responseJson(response));
      expect(serialized).toContain('INVALID_WEBHOOK');
      expect(serialized).not.toContain(SECRET);
      expect(serialized).not.toContain(rawBody);
      expect(serialized).not.toContain('payment-1');
      expect(serialized).not.toContain('transaction-1');
    }
  });

  it('maps invalid server configuration and downstream failures to generic retryable 503', async () => {
    const ignored = await handlePortOneV2WebhookRequestV1({
      request: webhookRequest(),
      pool: rejectingPool(),
      config: config([]),
      verificationAdapter: unusedAdapter(),
    });
    expect(ignored.status).toBe(503);
    expect(await responseJson(ignored)).toMatchObject({
      error: { code: 'TEMPORARILY_UNAVAILABLE', retryable: true },
    });

    const paidBody = payload('Transaction.Paid');
    const failed = await handlePortOneV2WebhookRequestV1({
      request: webhookRequest({ rawBody: paidBody }),
      pool: rejectingPool(),
      config: config(),
      verificationAdapter: unusedAdapter(),
    });
    expect(failed.status).toBe(503);
    const serialized = JSON.stringify(await responseJson(failed));
    expect(serialized).toContain('TEMPORARILY_UNAVAILABLE');
    expect(serialized).not.toContain('DB_INTERNAL_SECRET');
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain('payment-1');
  });

  it.each([false, true])('returns identifier-free 204 for completed/replayed paid delivery (replayed=%s)', async (replayed) => {
    const h = harness(replayed);
    const verificationAdapter: CommercePaymentVerificationAdapterV1 = {
      verify: vi.fn(async (context: CommercePaymentVerificationContextV1) => {
        expect(context).toMatchObject({
          provider: 'portone_v2',
          environment: 'sandbox',
          providerRequestId: 'payment-1',
          expectedProviderTransactionId: 'transaction-1',
        });
        return {
          providerRequestId: 'payment-1',
          evidence: evidence(),
        };
      }),
    };
    const paidBody = payload('Transaction.Paid');
    const response = await handlePortOneV2WebhookRequestV1({
      request: webhookRequest({ rawBody: paidBody }),
      pool: h.pool,
      config: config(),
      verificationAdapter,
    });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(h.connect).toHaveBeenCalledTimes(2);
    expect(verificationAdapter.verify).toHaveBeenCalledTimes(1);
  });
});
