import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  PortOneV2PaymentVerificationAdapterErrorV1,
  type PortOneV2PaymentHttpFetchV1,
} from '../apps/api/src/portone-v2-payment-verification-adapter.js';
import { createPortOneV2WebhookRuntimeV1 } from '../apps/api/src/portone-v2-webhook-runtime.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const NOW = new Date('2026-09-14T07:10:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1_000);
const WEBHOOK_SECRET_BYTES = Buffer.from('0123456789abcdef0123456789abcdef');
const WEBHOOK_SECRET = `whsec_${WEBHOOK_SECRET_BYTES.toString('base64')}`;
const API_SECRET = 'portone-server-api-secret';
const EVIDENCE_HMAC_SECRET = 'commerce-evidence-hmac-secret-0123456789abcdef';
const ROUTE = 'https://myeongha.test/api/commerce/webhooks/portone-v2';
const PAYMENT_ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const PURCHASE_INTENT_ID = '33333333-3333-4333-8333-333333333333';
const RECEIPT_ID = '44444444-4444-4444-8444-444444444444';
const PROVIDER_EVENT_ID = '55555555-5555-4555-8555-555555555555';

function sign(rawBody: string, timestamp = NOW_SECONDS): string {
  return `v1,${createHmac('sha256', WEBHOOK_SECRET_BYTES)
    .update('msg_1')
    .update('.')
    .update(String(timestamp))
    .update('.')
    .update(Buffer.from(rawBody, 'utf8'))
    .digest('base64')}`;
}

function payload(type: string): string {
  return JSON.stringify({
    type,
    timestamp: '2026-09-14T07:09:59.000Z',
    data: {
      paymentId: 'payment-1',
      transactionId: 'transaction-1',
      environment: 'production',
      subjectId: 'attacker-subject',
      amount: 999999,
      currency: 'USD',
      productId: 'attacker-product',
    },
  });
}

function webhookRequest(rawBody: string): Request {
  return new Request(ROUTE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': 'msg_1',
      'webhook-timestamp': String(NOW_SECONDS),
      'webhook-signature': sign(rawBody),
    },
    body: rawBody,
  });
}

function harness() {
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
              replayed: false,
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

function paymentFetch() {
  const payment = JSON.stringify({
    status: 'PAID',
    id: 'payment-1',
    transactionId: 'transaction-1',
    products: [{ id: 'external-product-1' }],
    selectedChannel: { type: 'TEST' },
    currency: 'KRW',
    amount: { total: 1000 },
    paidAt: '2026-09-14T07:09:59.000Z',
  });

  const fetchImpl = vi.fn<PortOneV2PaymentHttpFetchV1>(async () => ({
    status: 200,
    headers: {
      get(name: string) {
        if (name.toLowerCase() === 'content-type') return 'application/json';
        if (name.toLowerCase() === 'content-length') {
          return String(Buffer.byteLength(payment, 'utf8'));
        }
        return null;
      },
    },
    body: null,
    text: async () => payment,
  }));

  return fetchImpl;
}

function runtimeInput(input?: {
  readonly webhookSecrets?: readonly string[];
  readonly fetchImpl?: PortOneV2PaymentHttpFetchV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly apiSecret?: string;
  readonly evidenceHmacSecret?: string;
}) {
  const h = harness();
  return {
    harness: h,
    input: {
      pool: input?.pool ?? h.pool,
      config: {
        environment: 'sandbox' as const,
        webhookSecrets: input?.webhookSecrets ?? [WEBHOOK_SECRET],
        apiSecret: input?.apiSecret ?? API_SECRET,
        evidenceHmacSecret: input?.evidenceHmacSecret ?? EVIDENCE_HMAC_SECRET,
        paymentTimeoutMs: 1234,
        paymentFetchImpl: input?.fetchImpl ?? paymentFetch(),
        now: () => NOW,
      },
    },
  };
}

describe('PortOne V2 webhook runtime composition', () => {
  it('returns an immutable handler and snapshots webhook secrets at construction', async () => {
    const mutableSecrets = [WEBHOOK_SECRET];
    const fetchImpl = paymentFetch();
    const h = harness();
    const runtime = createPortOneV2WebhookRuntimeV1({
      pool: h.pool,
      config: {
        environment: 'sandbox',
        webhookSecrets: mutableSecrets,
        apiSecret: API_SECRET,
        evidenceHmacSecret: EVIDENCE_HMAC_SECRET,
        paymentFetchImpl: fetchImpl,
        now: () => NOW,
      },
    });

    mutableSecrets[0] = `whsec_${Buffer.alloc(32, 7).toString('base64')}`;
    expect(Object.isFrozen(runtime)).toBe(true);

    const response = await runtime.handleRequest(webhookRequest(payload('Future.NewEvent')));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(h.connect).not.toHaveBeenCalled();
  });

  it('completes a signed paid webhook through DB context, PortOne lookup, and evidence persistence', async () => {
    const fetchImpl = paymentFetch();
    const h = harness();
    const runtime = createPortOneV2WebhookRuntimeV1({
      pool: h.pool,
      config: {
        environment: 'sandbox',
        webhookSecrets: [WEBHOOK_SECRET],
        apiSecret: API_SECRET,
        evidenceHmacSecret: EVIDENCE_HMAC_SECRET,
        paymentTimeoutMs: 1234,
        paymentFetchImpl: fetchImpl,
        now: () => NOW,
      },
    });

    const response = await runtime.handleRequest(webhookRequest(payload('Transaction.Paid')));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(h.connect).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://api.portone.io/payments/payment-1');
    expect(init).toMatchObject({
      method: 'GET',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        Authorization: `PortOne ${API_SECRET}`,
      },
    });
  });

  it('keeps request-supplied authority fields subordinate to server and provider facts', async () => {
    const fetchImpl = paymentFetch();
    const h = harness();
    const runtime = createPortOneV2WebhookRuntimeV1({
      pool: h.pool,
      config: {
        environment: 'sandbox',
        webhookSecrets: [WEBHOOK_SECRET],
        apiSecret: API_SECRET,
        evidenceHmacSecret: EVIDENCE_HMAC_SECRET,
        paymentFetchImpl: fetchImpl,
        now: () => NOW,
      },
    });

    const response = await runtime.handleRequest(webhookRequest(payload('Transaction.Paid')));
    expect(response.status).toBe(204);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(h.connect).toHaveBeenCalledTimes(2);
  });

  it('fails closed during construction for invalid API or evidence configuration', () => {
    const invalidApi = runtimeInput({ apiSecret: '' });
    expect(() => createPortOneV2WebhookRuntimeV1(invalidApi.input)).toThrowError(
      expect.objectContaining({
        name: 'PortOneV2PaymentVerificationAdapterErrorV1',
        code: 'INVALID_CONFIGURATION',
      }),
    );

    const invalidEvidence = runtimeInput({ evidenceHmacSecret: 'too-short' });
    expect(() => createPortOneV2WebhookRuntimeV1(invalidEvidence.input)).toThrowError(
      expect.objectContaining({
        name: 'PortOneV2PaymentVerificationAdapterErrorV1',
        code: 'INVALID_CONFIGURATION',
      }),
    );
  });

  it('keeps invalid webhook configuration on the existing safe HTTP failure path', async () => {
    const h = harness();
    const runtime = createPortOneV2WebhookRuntimeV1({
      pool: h.pool,
      config: {
        environment: 'sandbox',
        webhookSecrets: [],
        apiSecret: API_SECRET,
        evidenceHmacSecret: EVIDENCE_HMAC_SECRET,
        paymentFetchImpl: paymentFetch(),
        now: () => NOW,
      },
    });

    const response = await runtime.handleRequest(webhookRequest(payload('Future.NewEvent')));
    expect(response.status).toBe(503);
    const serialized = await response.text();
    expect(serialized).toContain('TEMPORARILY_UNAVAILABLE');
    expect(serialized).not.toContain(API_SECRET);
    expect(serialized).not.toContain(EVIDENCE_HMAC_SECRET);
    expect(serialized).not.toContain(WEBHOOK_SECRET);
  });

  it('uses the existing typed construction error class', () => {
    expect(
      new PortOneV2PaymentVerificationAdapterErrorV1(
        'INVALID_CONFIGURATION',
        'test',
      ).code,
    ).toBe('INVALID_CONFIGURATION');
  });
});
