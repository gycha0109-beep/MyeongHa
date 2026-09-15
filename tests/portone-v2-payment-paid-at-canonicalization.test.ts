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

  it('preserves meaningful provider precision beyond milliseconds while removing redundant zeros', async () => {
    const first = await verifyPaidAt('2026-09-14T05:00:00.0001000Z');
    const equivalent = await verifyPaidAt('2026-09-14T14:00:00.0001+09:00');
    const distinct = await verifyPaidAt('2026-09-14T05:00:00.0002Z');

    expect(first.evidence.providerOccurredAt).toBe('2026-09-14T05:00:00.0001Z');
    expect(equivalent.evidence.providerOccurredAt).toBe(
      '2026-09-14T05:00:00.0001Z',
    );
    expect(first.evidence.evidenceFingerprint).toBe(
      equivalent.evidence.evidenceFingerprint,
    );
    expect(distinct.evidence.providerOccurredAt).toBe('2026-09-14T05:00:00.0002Z');
    expect(distinct.evidence.evidenceFingerprint).not.toBe(
      first.evidence.evidenceFingerprint,
    );
  });

  it('rejects JavaScript date-parser extensions outside the PortOne RFC 3339 date-time schema', async () => {
    const invalidValues = [
      '2026-09-14',
      '09/14/2026',
      '2026-09-14 05:00:00Z',
      '2026-09-14T05:00:00',
      '2026-02-30T05:00:00Z',
      '2026-09-14T24:00:00Z',
      '2026-09-14T05:00:00+24:00',
      '2026-09-14T05:00:00+09:60',
      '2026-09-14T05:00:60Z',
    ];

    for (const paidAt of invalidValues) {
      await expect(verifyPaidAt(paidAt)).rejects.toMatchObject({
        name: 'PortOneV2PaymentVerificationAdapterErrorV1',
        code: 'INVALID_PAYMENT',
      });
    }
  });

  it('preserves valid RFC 3339 leap-second precision at the UTC boundary', async () => {
    const direct = await verifyPaidAt('2016-12-31T23:59:60.123400Z');
    const offset = await verifyPaidAt('2017-01-01T08:59:60.1234+09:00');

    expect(direct.evidence.providerOccurredAt).toBe(
      '2016-12-31T23:59:60.1234Z',
    );
    expect(offset.evidence.providerOccurredAt).toBe(
      '2016-12-31T23:59:60.1234Z',
    );
    expect(direct.evidence.evidenceFingerprint).toBe(
      offset.evidence.evidenceFingerprint,
    );
  });
});
