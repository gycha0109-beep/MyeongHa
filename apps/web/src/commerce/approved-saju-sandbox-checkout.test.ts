import { expect, it, vi } from 'vitest';
import { APPROVED_SAJU_CATALOG_V1, type ApprovedSajuOfferV1 } from '../../../../packages/contracts/src/approved-saju-catalog.js';
import { requestApprovedSajuSandboxPaymentV1 } from './approved-saju-sandbox-checkout.js';
import type { PaymentAttemptHandoffFetchRequestV1 } from './payment-attempt-browser-handoff-transport.js';
import type { PaymentAttemptServerVerificationFetchRequestV1 } from './payment-attempt-browser-server-verification-transport.js';

const paymentAttemptId = '11111111-1111-4111-8111-111111111111';
const receiptId = '22222222-2222-4222-8222-222222222222';
const paymentId = 'sandbox-server-payment';

function success(data: object) {
  return Response.json({
    ok: true,
    data,
    meta: { apiContractVersion: 'v0.9', requestId: 'request-sandbox', serverTime: '2026-11-10T02:00:00Z' },
  });
}

function fixture(offer: ApprovedSajuOfferV1, overrides: object = {}) {
  return {
    approvedOfferId: offer.id,
    paymentAttemptId,
    channel: { environment: 'sandbox' as const, storeId: 'sandbox-store', channelKey: 'sandbox-channel' },
    handoff: {
      fetch: vi.fn(async (request: PaymentAttemptHandoffFetchRequestV1) => {
        expect(JSON.parse(request.body)).toEqual({ paymentAttemptId, approvedOfferId: offer.id });
        return success({
          paymentAttemptId, provider: 'portone_v2', environment: 'sandbox', providerRequestId: paymentId,
          amountMinor: offer.priceKrw, currency: 'KRW', status: 'created', ...overrides,
        });
      }),
    },
    verification: {
      fetch: vi.fn(async (request: PaymentAttemptServerVerificationFetchRequestV1) => {
        expect(JSON.parse(request.body)).toEqual({ paymentAttemptId });
        return success({ paymentAttemptId, receiptId, replayed: false });
      }),
    },
    sdk: { requestPayment: vi.fn(async () => ({ paymentId: 'untrusted-sdk-id' })) },
  };
}

it.each(APPROVED_SAJU_CATALOG_V1)('uses the server-owned payment for $id and returns only its verified receipt', async (offer) => {
  const input = fixture(offer);
  await expect(requestApprovedSajuSandboxPaymentV1(input)).resolves.toEqual({ paymentAttemptId, receiptId, replayed: false });
  expect(input.sdk.requestPayment).toHaveBeenCalledExactlyOnceWith({
    storeId: 'sandbox-store', channelKey: 'sandbox-channel', paymentId, orderName: offer.title,
    totalAmount: offer.priceKrw, currency: 'CURRENCY_KRW', payMethod: 'CARD',
  });
  expect(input.verification.fetch).toHaveBeenCalledOnce();
});

it.each([
  { amountMinor: 1 }, { currency: 'USD' }, { environment: 'production' }, { providerRequestId: 'x'.repeat(41) },
])(
  'keeps the SDK and verification closed for an ineligible handoff %j',
  async (override) => {
    const input = fixture(APPROVED_SAJU_CATALOG_V1[0]!, override);
    await expect(requestApprovedSajuSandboxPaymentV1(input)).rejects.toThrow();
    expect(input.sdk.requestPayment).not.toHaveBeenCalled();
    expect(input.verification.fetch).not.toHaveBeenCalled();
  },
);

it('keeps the original attempt when the SDK rejects', async () => {
  const input = fixture(APPROVED_SAJU_CATALOG_V1[0]!);
  input.sdk.requestPayment.mockRejectedValueOnce(new Error('SDK window closed'));
  await expect(requestApprovedSajuSandboxPaymentV1(input)).resolves.toMatchObject({ receiptId });
  expect(input.verification.fetch).toHaveBeenCalledOnce();
});
