import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPortOneV2WebhookRuntimeV1 } from '../apps/api/src/portone-v2-webhook-runtime.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const WEBHOOK_SECRET_BYTES = Buffer.from('0123456789abcdef0123456789abcdef');
const WEBHOOK_SECRET = 'whsec_' + WEBHOOK_SECRET_BYTES.toString('base64');
const RECEIPT = '11111111-1111-4111-8111-111111111111';
const PURCHASE = '22222222-2222-4222-8222-222222222222';
const PAYMENT_ATTEMPT = '33333333-3333-4333-8333-333333333333';
const EVENT = '44444444-4444-4444-8444-444444444444';
const READING = '55555555-5555-4555-8555-555555555555';
const GRANT = '66666666-6666-4666-8666-666666666666';
const SUBJECT = '77777777-7777-4777-8777-777777777777';
const TIME = new Date('2026-10-25T12:00:00.000Z');
const VERIFIED_AT = '2026-10-25T11:59:59.000Z';

function signedPaidWebhook(): Request {
  const raw = JSON.stringify({
    type: 'Transaction.Paid',
    data: { paymentId: 'owned-portone-payment-id', transactionId: 'owned-portone-tx-id' },
  });
  const time = String(Math.floor(TIME.getTime() / 1000));
  return new Request('https://myeongha.test/api/commerce/webhooks/portone-v2', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': 'msg_reader_live',
      'webhook-timestamp': time,
      'webhook-signature': 'v1,' + createHmac('sha256', WEBHOOK_SECRET_BYTES)
        .update('msg_reader_live.' + time + '.' + raw, 'utf8').digest('base64'),
    },
    body: raw,
  });
}

function providerResponse(channel: 'LIVE' | 'TEST' = 'LIVE') {
  return new Response(JSON.stringify({
    id: 'owned-portone-payment-id',
    status: 'PAID',
    transactionId: 'owned-portone-tx-id',
    products: [{ id: 'server-owned-reader-product' }],
    channel: { type: channel },
    currency: 'KRW',
    amount: { total: 4900 },
    paidAt: VERIFIED_AT,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function harness() {
  const executed: string[] = [];
  const bindArgs: unknown[][] = [];
  let issuedCount = 0;
  const connect = vi.fn(async () => ({
    query: vi.fn(async (sql: string, args?: readonly unknown[]) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' ||
          sql === 'SET LOCAL ROLE myeongha_commerce_internal_executor') {
        executed.push(sql);
        return { rows: [] };
      }
      if (sql.includes('qry_commerce_provider_payment_verification_context_v1')) {
        executed.push('resolve_payment');
        expect(args).toEqual([
          'portone_v2', 'production', 'owned-portone-payment-id', 'owned-portone-tx-id',
        ]);
        return { rows: [{
          paymentAttemptId: PAYMENT_ATTEMPT,
          resolvedSubjectId: SUBJECT,
          purchaseIntentId: PURCHASE,
          provider: 'portone_v2',
          platform: 'web',
          environment: 'production',
          providerRequestId: 'owned-portone-payment-id',
          expectedProviderTransactionId: 'owned-portone-tx-id',
          expectedExternalProductId: 'server-owned-reader-product',
          expectedAmountMinor: '4900',
          expectedCurrency: 'KRW',
        }] };
      }
      if (sql.includes('cmd_persist_verified_payment_evidence_v1')) {
        executed.push('persist_receipt');
        expect(args?.[0]).toBe(PAYMENT_ATTEMPT);
        expect(args?.[4]).toBe('production');
        expect(args?.[5]).toBe('owned-portone-tx-id');
        return { rows: [{
          receiptId: RECEIPT, providerEventId: EVENT, replayed: issuedCount > 0,
        }] };
      }
      if (sql.includes('internal_resolve_verified_reader_receipt_fulfillment_v1')) {
        executed.push('resolve_reader');
        expect(args).toEqual([RECEIPT]);
        return { rows: [{
          purchaseIntentId: PURCHASE,
          existingOfficialReadingId: READING,
          capabilityItemKey: 'standard-reading-access',
          validityMode: 'unbounded',
          purchaseRole: 'additional_reader_interpretation',
          preparedAt: VERIFIED_AT,
        }] };
      }
      if (sql.includes('cmd_apply_verified_reader_receipt_bind_internal_v1')) {
        executed.push('bind_reader');
        bindArgs.push([...(args ?? [])]);
        issuedCount += 1;
        return { rows: [{ result: {
          contractVersion: 'official-reader-s2-atomic-receipt-bind-v1',
          readerAccess: {
            purchase_intent_id: PURCHASE,
            entitlement_grant_id: GRANT,
            reader_character_id: 'seyeon',
            reading_id: READING,
            replayed: issuedCount > 1,
            official_reading_created: false,
            interpretation_created: issuedCount === 1,
          },
          capabilityEffects: [{}],
        } }] };
      }
      throw new Error('Unexpected S2 SQL: ' + sql);
    }),
    release: vi.fn(),
  }));
  return { pool: { connect } as unknown as PostgresSubjectPoolV1, connect, executed, bindArgs };
}

describe('real PortOne signed webhook -> verified Receipt -> internal S2 atomic Reader bind', () => {
  it('uses the authenticated production payment lineage for issuance and replays the same grant without public paid content', async () => {
    const h = harness();
    const provider = vi.fn(async () => providerResponse('LIVE'));
    const runtime = createPortOneV2WebhookRuntimeV1({
      pool: h.pool,
      config: {
        environment: 'production',
        webhookSecrets: [WEBHOOK_SECRET],
        apiSecret: 'portone-private-api-secret',
        evidenceHmacSecret: 'e'.repeat(32),
        paymentFetchImpl: provider,
        now: () => TIME,
        privateReaderReceiptFulfillmentEnabled: true,
      },
    });
    const first = await runtime.handleRequest(signedPaidWebhook());
    const repeated = await runtime.handleRequest(signedPaidWebhook());
    expect(first.status).toBe(204);
    expect(repeated.status).toBe(204);
    expect(await first.text()).toBe('');
    expect(await repeated.text()).toBe('');
    expect(provider).toHaveBeenCalledTimes(2);
    expect(h.executed.filter(x => x === 'resolve_payment')).toHaveLength(2);
    expect(h.executed.filter(x => x === 'persist_receipt')).toHaveLength(2);
    expect(h.executed.filter(x => x === 'resolve_reader')).toHaveLength(2);
    expect(h.executed.filter(x => x === 'bind_reader')).toHaveLength(2);
    expect(h.executed.filter(x => x === 'BEGIN')).toHaveLength(8);
    expect(h.executed.filter(x => x === 'COMMIT')).toHaveLength(8);
    expect(h.bindArgs[0]?.[0]).toBe(RECEIPT);
    expect(h.bindArgs[1]?.[0]).toBe(RECEIPT);
    expect(h.bindArgs[0]?.[1]).toBe(READING);
    expect(h.bindArgs[1]?.[1]).toBe(READING);
    expect(h.bindArgs[0]?.[3]).toEqual([VERIFIED_AT]);
    expect(h.bindArgs[1]?.[3]).toEqual([VERIFIED_AT]);
    expect(h.bindArgs[0]?.[9]).toBe(h.bindArgs[1]?.[9]);
  });

  it('denies a TEST-channel payment as a production Reader purchase before persisting any Receipt or issuing a Grant', async () => {
    const h = harness();
    const runtime = createPortOneV2WebhookRuntimeV1({
      pool: h.pool,
      config: {
        environment: 'production',
        webhookSecrets: [WEBHOOK_SECRET],
        apiSecret: 'portone-private-api-secret',
        evidenceHmacSecret: 'e'.repeat(32),
        paymentFetchImpl: async () => providerResponse('TEST'),
        now: () => TIME,
        privateReaderReceiptFulfillmentEnabled: true,
      },
    });
    const response = await runtime.handleRequest(signedPaidWebhook());
    expect(response.status).toBe(503);
    expect(h.executed).toContain('resolve_payment');
    expect(h.executed).not.toContain('persist_receipt');
    expect(h.executed).not.toContain('bind_reader');
    expect(h.executed).not.toContain('resolve_reader');
  });
});
