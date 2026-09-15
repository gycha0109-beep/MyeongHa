import { describe, expect, it } from 'vitest';
import type { CommercePaymentVerificationAdapterRequestV1 } from '../apps/api/src/commerce-payment-verification-execution.js';
import {
  createPortOneV2PaymentVerificationAdapterV1,
  type PortOneV2PaymentHttpFetchV1,
  type PortOneV2PaymentHttpResponseV1,
} from '../apps/api/src/portone-v2-payment-verification-adapter.js';

const request: CommercePaymentVerificationAdapterRequestV1 = Object.freeze({
  provider: 'portone_v2',
  platform: 'web',
  environment: 'sandbox',
  providerRequestId: 'payment-utf8-1',
  purchaseIntentId: 'purchase-intent-utf8-1',
  expectedExternalProductId: 'product-1',
  expectedAmountMinor: 1000,
  expectedCurrency: 'KRW',
});

function responseForBytes(bytes: Uint8Array): PortOneV2PaymentHttpResponseV1 {
  let sent = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(bytes);
          return;
        }
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );

  return {
    status: 200,
    headers: {
      get(name: string) {
        return name.toLowerCase() === 'content-type'
          ? 'application/json; charset=utf-8'
          : null;
      },
    },
    body,
    async text() {
      throw new Error('whole-body text fallback must not be used');
    },
  };
}

function validPayment(note: string) {
  return {
    note,
    status: 'PAID',
    id: 'payment-utf8-1',
    transactionId: 'transaction-utf8-1',
    currency: 'KRW',
    amount: { total: 1000 },
    products: [{ id: 'product-1', name: 'Deep Reading', quantity: 1, amount: 1000 }],
    channel: { type: 'TEST' },
    paidAt: '2026-09-14T05:00:00Z',
  };
}

async function verifyBytes(bytes: Uint8Array) {
  const fetchImpl: PortOneV2PaymentHttpFetchV1 = async () => responseForBytes(bytes);
  const adapter = createPortOneV2PaymentVerificationAdapterV1({
    apiSecret: 'test-portone-api-secret',
    evidenceHmacSecret: 'h'.repeat(32),
    fetchImpl,
    now: () => new Date('2026-09-15T00:00:00.000Z'),
  });
  return adapter.verify(request);
}

describe('PortOne V2 payment JSON UTF-8 boundary', () => {
  it('rejects malformed UTF-8 even when replacement decoding would leave parseable JSON', async () => {
    const prefix = new TextEncoder().encode('{"note":"');
    const malformed = Uint8Array.from([0xc3, 0x28]);
    const suffix = new TextEncoder().encode(
      '","status":"PAID","id":"payment-utf8-1","transactionId":"transaction-utf8-1","currency":"KRW","amount":{"total":1000},"products":[{"id":"product-1","name":"Deep Reading","quantity":1,"amount":1000}],"channel":{"type":"TEST"},"paidAt":"2026-09-14T05:00:00Z"}',
    );
    const bytes = new Uint8Array(prefix.length + malformed.length + suffix.length);
    bytes.set(prefix, 0);
    bytes.set(malformed, prefix.length);
    bytes.set(suffix, prefix.length + malformed.length);

    await expect(verifyBytes(bytes)).rejects.toMatchObject({
      name: 'PortOneV2PaymentVerificationAdapterErrorV1',
      code: 'INVALID_JSON',
      httpStatus: 200,
      message: 'PortOne V2 payment lookup returned malformed JSON.',
    });
  });

  it('accepts valid multibyte UTF-8 in ignored provider fields without changing authoritative evidence', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(validPayment('결제 완료')));
    const result = await verifyBytes(bytes);

    expect(result.providerRequestId).toBe('payment-utf8-1');
    expect(result.evidence).toMatchObject({
      provider: 'portone_v2',
      environment: 'sandbox',
      externalTransactionId: 'transaction-utf8-1',
      externalProductId: 'product-1',
      providerOccurredAt: '2026-09-14T05:00:00.000Z',
      verifiedAmountMinor: 1000,
      verifiedCurrency: 'KRW',
    });
  });
});
