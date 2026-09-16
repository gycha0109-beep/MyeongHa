import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { PortOneV2PaymentHttpFetchV1 } from '../apps/api/src/portone-v2-payment-verification-adapter.js';
import {
  createPortOneV2WebhookRuntimeV1,
  type PortOneV2WebhookRuntimeConfigV1,
} from '../apps/api/src/portone-v2-webhook-runtime.js';
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

function sign(rawBody: string): string {
  return `v1,${createHmac('sha256', WEBHOOK_SECRET_BYTES)
    .update('msg_runtime_snapshot')
    .update('.')
    .update(String(NOW_SECONDS))
    .update('.')
    .update(Buffer.from(rawBody, 'utf8'))
    .digest('base64')}`;
}

function paidWebhookRequest(): Request {
  const rawBody = JSON.stringify({
    type: 'Transaction.Paid',
    data: {
      paymentId: 'payment-1',
      transactionId: 'transaction-1',
    },
  });
  return new Request(ROUTE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': 'msg_runtime_snapshot',
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

function paymentFetch(): PortOneV2PaymentHttpFetchV1 {
  const payment = JSON.stringify({
    status: 'PAID',
    id: 'payment-1',
    transactionId: 'transaction-1',
    products: [{ id: 'external-product-1' }],
    channel: { type: 'TEST' },
    currency: 'KRW',
    amount: { total: 1000 },
    paidAt: '2026-09-14T07:09:59.000Z',
  });
  const paymentBytes = new TextEncoder().encode(payment);

  return vi.fn<PortOneV2PaymentHttpFetchV1>(async () => ({
    status: 200,
    headers: {
      get(name: string) {
        if (name.toLowerCase() === 'content-type') return 'application/json';
        if (name.toLowerCase() === 'content-length') {
          return String(paymentBytes.byteLength);
        }
        return null;
      },
    },
    body: new ReadableStream<Uint8Array>(
      {
        start(controller) {
          controller.enqueue(paymentBytes);
          controller.close();
        },
      },
      { highWaterMark: 0 },
    ),
    text: async () => payment,
  }));
}

function statefulConfig(input: {
  readonly fetchImpl: PortOneV2PaymentHttpFetchV1;
  readonly now: () => Date;
  readonly reads: Map<string, number>;
}): PortOneV2WebhookRuntimeConfigV1 {
  function once<T>(name: string, value: T): T {
    const count = (input.reads.get(name) ?? 0) + 1;
    input.reads.set(name, count);
    if (count > 1) throw new Error(`unexpected second ${name} accessor read`);
    return value;
  }

  return Object.defineProperties({}, {
    environment: { enumerable: true, get: () => once('environment', 'sandbox' as const) },
    webhookSecrets: { enumerable: true, get: () => once('webhookSecrets', [WEBHOOK_SECRET]) },
    apiSecret: { enumerable: true, get: () => once('apiSecret', API_SECRET) },
    evidenceHmacSecret: {
      enumerable: true,
      get: () => once('evidenceHmacSecret', EVIDENCE_HMAC_SECRET),
    },
    paymentTimeoutMs: { enumerable: true, get: () => once('paymentTimeoutMs', 1234) },
    paymentFetchImpl: {
      enumerable: true,
      get: () => once('paymentFetchImpl', input.fetchImpl),
    },
    now: { enumerable: true, get: () => once('now', input.now) },
  }) as unknown as PortOneV2WebhookRuntimeConfigV1;
}

describe('PortOne V2 webhook runtime config snapshot', () => {
  it('reads every composition field once and reuses one clock for webhook and payment verification', async () => {
    const h = harness();
    const fetchImpl = paymentFetch();
    const sharedNow = vi.fn(() => NOW);
    const reads = new Map<string, number>();

    const runtime = createPortOneV2WebhookRuntimeV1({
      pool: h.pool,
      config: statefulConfig({ fetchImpl, now: sharedNow, reads }),
    });

    for (const name of [
      'environment',
      'webhookSecrets',
      'apiSecret',
      'evidenceHmacSecret',
      'paymentTimeoutMs',
      'paymentFetchImpl',
      'now',
    ]) {
      expect(reads.get(name)).toBe(1);
    }

    const response = await runtime.handleRequest(paidWebhookRequest());
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(sharedNow).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(h.connect).toHaveBeenCalledTimes(2);

    for (const name of reads.keys()) {
      expect(reads.get(name)).toBe(1);
    }
  });
});
