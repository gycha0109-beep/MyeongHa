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
  providerRequestId: 'payment-zero',
  purchaseIntentId: 'purchase-intent-zero',
  expectedExternalProductId: 'product-zero',
  expectedAmountMinor: 0,
  expectedCurrency: 'KRW',
});

function paidPayment(total: number) {
  return {
    status: 'PAID',
    id: 'payment-zero',
    transactionId: 'transaction-zero',
    currency: 'KRW',
    amount: { total },
    products: [{ id: 'product-zero' }],
    channel: { type: 'TEST' },
    paidAt: '2026-09-15T05:00:00.000Z',
  };
}

function adapterFor(total: number) {
  const fetchImpl: PortOneV2PaymentHttpFetchV1 = async () =>
    new Response(JSON.stringify(paidPayment(total)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }) as unknown as PortOneV2PaymentHttpResponseV1;

  return createPortOneV2PaymentVerificationAdapterV1({
    apiSecret: 'test-portone-api-secret',
    evidenceHmacSecret: 'h'.repeat(32),
    fetchImpl,
    now: () => new Date('2026-09-15T05:01:00.000Z'),
  });
}

describe('PortOne V2 non-negative amount authority', () => {
  it('accepts zero amount.total and preserves it as exact minor-unit evidence', async () => {
    const result = await adapterFor(0).verify(request);

    expect((result.evidence as { verifiedAmountMinor: number }).verifiedAmountMinor).toBe(0);
  });

  it('continues to reject negative amount.total', async () => {
    await expect(adapterFor(-1).verify(request)).rejects.toMatchObject({
      name: 'PortOneV2PaymentVerificationAdapterErrorV1',
      code: 'INVALID_PAYMENT',
    });
  });
});
