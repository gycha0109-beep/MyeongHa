import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1,
  PORTONE_V2_WEBHOOK_MAX_SIGNATURE_ENTRIES_V1,
  PORTONE_V2_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS_V1,
  authenticatePortOneV2WebhookPaymentCompletionV1,
  executePortOneV2WebhookPaymentCompletionV1,
} from '../apps/api/src/portone-v2-webhook-payment-completion.js';
import type {
  CommercePaymentVerificationAdapterV1,
  CommercePaymentVerificationContextV1,
} from '../apps/api/src/commerce-payment-verification-execution.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const NOW = new Date('2026-09-14T06:20:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1_000);
const SECRET_BYTES = Buffer.from('0123456789abcdef0123456789abcdef');
const OLD_SECRET_BYTES = Buffer.from('abcdef0123456789abcdef0123456789');
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;
const OLD_SECRET = `whsec_${OLD_SECRET_BYTES.toString('base64').replace(/=+$/u, '')}`;
const PAYMENT_ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const PURCHASE_INTENT_ID = '33333333-3333-4333-8333-333333333333';
const RECEIPT_ID = '44444444-4444-4444-8444-444444444444';
const PROVIDER_EVENT_ID = '55555555-5555-4555-8555-555555555555';

function body(type = 'Transaction.Paid', data?: unknown): string {
  return JSON.stringify({
    type,
    timestamp: '2026-09-14T06:19:59.000Z',
    data:
      data ??
      {
        paymentId: 'payment-1',
        transactionId: 'transaction-1',
        storeId: 'store-1',
        environment: 'production',
        subjectId: SUBJECT_ID,
        amount: 999999,
        currency: 'USD',
        productId: 'attacker-product',
        success: true,
      },
  });
}

function sign(rawBody: string | Uint8Array, secret = SECRET_BYTES, timestamp = NOW_SECONDS): string {
  return `v1,${createHmac('sha256', secret)
    .update('msg_1')
    .update('.')
    .update(String(timestamp))
    .update('.')
    .update(typeof rawBody === 'string' ? Buffer.from(rawBody) : Buffer.from(rawBody))
    .digest('base64')}`;
}

function request(input: {
  rawBody?: string | Uint8Array;
  timestamp?: number;
  signature?: string;
  headers?: Record<string, string | readonly string[] | undefined>;
} = {}) {
  const rawBody = input.rawBody ?? body();
  const timestamp = input.timestamp ?? NOW_SECONDS;
  return {
    rawBody,
    headers: {
      'content-type': 'application/json',
      'webhook-id': 'msg_1',
      'webhook-timestamp': String(timestamp),
      'webhook-signature': input.signature ?? sign(rawBody, SECRET_BYTES, timestamp),
      ...input.headers,
    },
  };
}

const config = (webhookSecrets: readonly string[] = [SECRET]) => ({
  environment: 'sandbox' as const,
  webhookSecrets,
  now: () => NOW,
});

function expectCode(run: () => unknown, code: string): void {
  try {
    run();
    throw new Error('expected failure');
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

function harness() {
  let connection = 0;
  const connect = vi.fn(async () => {
    connection += 1;
    const query = vi.fn(async (text: string) => {
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK' || text === 'SET LOCAL ROLE myeongha_commerce_internal_executor') return { rows: [] };
      if (text.includes('qry_commerce_provider_payment_verification_context_v1')) {
        return { rows: [{
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
        }] };
      }
      if (text.includes('cmd_persist_verified_payment_evidence_v1')) {
        return { rows: [{ receiptId: RECEIPT_ID, providerEventId: PROVIDER_EVENT_ID, replayed: false }] };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    });
    return { query, release: vi.fn() };
  });
  return { pool: { connect } as unknown as PostgresSubjectPoolV1, connect };
}

function evidence() {
  return {
    schemaVersion: 'commerce-evidence-v2',
    provider: 'portone_v2',
    platform: 'web',
    environment: 'sandbox',
    externalTransactionId: 'transaction-1',
    externalProductId: 'external-product-1',
    currentState: 'active',
    ownerBinding: { kind: 'purchase_intent', purchaseIntentId: PURCHASE_INTENT_ID },
    evidenceFingerprint: `hmac-sha256:k1:${'a'.repeat(64)}`,
    verifierRevision: 'test-v1',
    providerOccurredAt: '2026-09-14T06:19:59.000Z',
    verifiedAmountMinor: 1000,
    verifiedCurrency: 'KRW',
    verifiedAt: NOW.toISOString(),
  };
}

describe('PortOne V2 webhook payment completion authentication', () => {
  it('verifies raw bytes and projects only provider payment identities plus config-bound environment', () => {
    const rawBody = body();
    const result = authenticatePortOneV2WebhookPaymentCompletionV1({
      request: request({
        rawBody,
        headers: {
          'content-type': undefined,
          'webhook-id': undefined,
          'webhook-timestamp': undefined,
          'webhook-signature': undefined,
          'Content-Type': 'application/json; charset=utf-8',
          'Webhook-Id': 'msg_1',
          'Webhook-Timestamp': String(NOW_SECONDS),
          'Webhook-Signature': sign(rawBody),
        },
      }),
      config: config(),
    });
    expect(result).toEqual({
      kind: 'payment_completion',
      providerWebhookId: 'msg_1',
      authenticatedIngress: {
        provider: 'portone_v2',
        environment: 'sandbox',
        providerRequestId: 'payment-1',
        providerTransactionId: 'transaction-1',
      },
    });
    expect(JSON.stringify(result)).not.toContain(SUBJECT_ID);
    expect(JSON.stringify(result)).not.toContain('attacker-product');
  });

  it('accepts current/previous secret rotation, rejects tampering, and never leaks secret/body material', () => {
    const rawBody = body();
    const oldSignature = sign(rawBody, OLD_SECRET_BYTES);
    expect(
      authenticatePortOneV2WebhookPaymentCompletionV1({
        request: request({ signature: `v2,${Buffer.alloc(32).toString('base64')} ${oldSignature}` }),
        config: config([SECRET, OLD_SECRET]),
      }).kind,
    ).toBe('payment_completion');

    try {
      authenticatePortOneV2WebhookPaymentCompletionV1({
        request: request({ rawBody: `${rawBody} `, signature: sign(rawBody) }),
        config: config(),
      });
      throw new Error('expected invalid signature');
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_SIGNATURE' });
      expect(String(error)).not.toContain(SECRET.slice(0, 16));
      expect(String(error)).not.toContain(rawBody);
    }
  });

  it('enforces the five-minute replay window and bounded signature/body/config inputs', () => {
    const tolerance = PORTONE_V2_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS_V1;
    for (const timestamp of [NOW_SECONDS - tolerance, NOW_SECONDS + tolerance]) {
      expect(authenticatePortOneV2WebhookPaymentCompletionV1({ request: request({ timestamp }), config: config() }).kind).toBe('payment_completion');
    }
    for (const timestamp of [NOW_SECONDS - tolerance - 1, NOW_SECONDS + tolerance + 1]) {
      expectCode(() => authenticatePortOneV2WebhookPaymentCompletionV1({ request: request({ timestamp }), config: config() }), 'STALE_WEBHOOK');
    }
    expectCode(() => authenticatePortOneV2WebhookPaymentCompletionV1({ request: request({ rawBody: 'x'.repeat(PORTONE_V2_WEBHOOK_MAX_BODY_BYTES_V1 + 1) }), config: config() }), 'INVALID_REQUEST');
    expectCode(() => authenticatePortOneV2WebhookPaymentCompletionV1({ request: request({ signature: Array.from({ length: PORTONE_V2_WEBHOOK_MAX_SIGNATURE_ENTRIES_V1 + 1 }, () => sign(body())).join(' ') }), config: config() }), 'INVALID_SIGNATURE');
    expectCode(() => authenticatePortOneV2WebhookPaymentCompletionV1({ request: request(), config: config([]) }), 'INVALID_CONFIGURATION');
  });

  it('fails closed on malformed headers/content type and malformed paid identities', () => {
    expectCode(() => authenticatePortOneV2WebhookPaymentCompletionV1({ request: request({ headers: { 'webhook-id': '' } }), config: config() }), 'INVALID_SIGNATURE');
    expectCode(() => authenticatePortOneV2WebhookPaymentCompletionV1({ request: request({ headers: { 'content-type': 'text/plain' } }), config: config() }), 'INVALID_REQUEST');
    expectCode(() => authenticatePortOneV2WebhookPaymentCompletionV1({ request: request({ signature: 'v1,not-base64***' }), config: config() }), 'INVALID_SIGNATURE');
    for (const data of [{ paymentId: '', transactionId: 'transaction-1' }, { paymentId: 'payment-1' }]) {
      const rawBody = body('Transaction.Paid', data);
      expectCode(() => authenticatePortOneV2WebhookPaymentCompletionV1({ request: request({ rawBody }), config: config() }), 'INVALID_WEBHOOK');
    }
  });

  it('authenticates then ignores known non-paid and unknown future event types', () => {
    for (const type of ['Transaction.Cancelled', 'Future.NewEvent']) {
      const rawBody = body(type);
      expect(authenticatePortOneV2WebhookPaymentCompletionV1({ request: request({ rawBody }), config: config() })).toEqual({
        kind: 'ignored', providerWebhookId: 'msg_1', eventType: type,
      });
    }
  });

  it('terminates authenticated ignored events before DB/provider verification', async () => {
    const rawBody = body('Transaction.Failed');
    const connect = vi.fn(async () => { throw new Error('must not connect'); });
    const verificationAdapter: CommercePaymentVerificationAdapterV1 = { verify: vi.fn() };
    const result = await executePortOneV2WebhookPaymentCompletionV1({
      pool: { connect } as unknown as PostgresSubjectPoolV1,
      request: request({ rawBody }),
      config: config(),
      verificationAdapter,
    });
    expect(result).toEqual({ kind: 'ignored', providerWebhookId: 'msg_1', eventType: 'Transaction.Failed' });
    expect(connect).not.toHaveBeenCalled();
    expect(verificationAdapter.verify).not.toHaveBeenCalled();
  });

  it('feeds verified Transaction.Paid into the existing provider-neutral completion chain', async () => {
    const h = harness();
    const verificationAdapter: CommercePaymentVerificationAdapterV1 = {
      verify: vi.fn(async (context: CommercePaymentVerificationContextV1) => {
        expect(context).toMatchObject({ provider: 'portone_v2', environment: 'sandbox', providerRequestId: 'payment-1', expectedProviderTransactionId: 'transaction-1' });
        return { providerRequestId: 'payment-1', evidence: evidence() };
      }),
    };
    const result = await executePortOneV2WebhookPaymentCompletionV1({ pool: h.pool, request: request(), config: config(), verificationAdapter });
    expect(result).toEqual({
      kind: 'completed', providerWebhookId: 'msg_1', paymentAttemptId: PAYMENT_ATTEMPT_ID,
      receiptId: RECEIPT_ID, providerEventId: PROVIDER_EVENT_ID, replayed: false,
    });
    expect(h.connect).toHaveBeenCalledTimes(2);
    expect(verificationAdapter.verify).toHaveBeenCalledTimes(1);
  });
});
