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
  providerRequestId: 'payment-paid-at-canonicalization-1',
  purchaseIntentId: 'purchase-intent-paid-at-canonicalization-1',
  expectedExternalProductId: 'product-1',
  expectedAmountMinor: 1000,
  expectedCurrency: 'KRW',
});

function paidPayment(paidAt: string) {
  return {
    status: 'PAID',
    id: 'payment-paid-at-canonicalization-1',
    transactionId: 'transaction-paid-at-canonicalization-1',
    currency: 'KRW',
    amount: { total: 1000 },
    products: [{ id: 'product-1', name: 'Deep Reading', quantity: 1, amount: 1000 }],
    selectedChannel: { type: 'TEST' },
    paidAt,
  };
}

function responseFor(paidAt: string): PortOneV2PaymentHttpResponseV1 {
  const raw = JSON.stringify(paidPayment(paidAt));
  const bytes = new TextEncoder().encode(raw);
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
      return raw;
    },
  };
}

async function verifyPaidAt(paidAt: string) {
  const fetchImpl: PortOneV2PaymentHttpFetchV1 = async () => responseFor(paidAt);
  const adapter = createPortOneV2PaymentVerificationAdapterV1({
    apiSecret: 'test-portone-api-secret',
    evidenceHmacSecret: 'h'.repeat(32),
    fetchImpl,
    now: () => new Date('2026-09-15T00:00:00.000Z'),
  });
  return adapter.verify(request);
}

describe('PortOne V2 paidAt canonicalization', () => {
  it('collapses equivalent RFC 3339 instant representations before persistence evidence fingerprinting', async () => {
    const variants = [
      '2026-09-14T05:00:00Z',
      '2026-09-14T14:00:00+09:00',
      '2026-09-14T05:00:00.000Z',
    ];

    const results = [];
    for (const paidAt of variants) {
      results.push(await verifyPaidAt(paidAt));
    }

    expect(
      results.map((result) => result.evidence.providerOccurredAt),
    ).toEqual([
      '2026-09-14T05:00:00.000Z',
      '2026-09-14T05:00:00.000Z',
      '2026-09-14T05:00:00.000Z',
    ]);
    expect(
      new Set(results.map((result) => result.evidence.evidenceFingerprint)).size,
    ).toBe(1);
  });
});