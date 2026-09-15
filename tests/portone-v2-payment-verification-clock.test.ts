import { describe, expect, it } from 'vitest';
import type { CommercePaymentVerificationAdapterRequestV1 } from '../apps/api/src/commerce-payment-verification-execution.js';
import {
  PortOneV2PaymentVerificationAdapterErrorV1,
  createPortOneV2PaymentVerificationAdapterV1,
  type PortOneV2PaymentHttpFetchV1,
  type PortOneV2PaymentHttpResponseV1,
} from '../apps/api/src/portone-v2-payment-verification-adapter.js';

const request: CommercePaymentVerificationAdapterRequestV1 = Object.freeze({
  provider: 'portone_v2',
  platform: 'web',
  environment: 'sandbox',
  providerRequestId: 'payment-1',
  purchaseIntentId: 'purchase-intent-1',
  expectedExternalProductId: 'product-1',
  expectedAmountMinor: 1000,
  expectedCurrency: 'KRW',
});

function paidResponse(): PortOneV2PaymentHttpResponseV1 {
  const rawText = JSON.stringify({
    status: 'PAID',
    id: 'payment-1',
    transactionId: 'transaction-1',
    currency: 'KRW',
    amount: { total: 1000 },
    products: [{ id: 'product-1' }],
    channel: { type: 'TEST' },
    paidAt: '2026-09-15T06:00:00.000Z',
  });
  const bytes = new TextEncoder().encode(rawText);
  let sent = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!sent) {
        sent = true;
        controller.enqueue(bytes);
      }
      controller.close();
    },
  });

  return {
    status: 200,
    headers: {
      get(name: string): string | null {
        if (name.toLowerCase() === 'content-type') {
          return 'application/json; charset=utf-8';
        }
        return null;
      },
    },
    body,
    async text(): Promise<string> {
      throw new Error('whole-body fallback must not run');
    },
  };
}

function createAdapter(now: () => Date) {
  const fetchImpl: PortOneV2PaymentHttpFetchV1 = async () => paidResponse();
  return createPortOneV2PaymentVerificationAdapterV1({
    apiSecret: 'test-portone-api-secret',
    evidenceHmacSecret: 'h'.repeat(32),
    fetchImpl,
    now,
  });
}

async function expectInvalidClock(now: () => Date, rawMarker: string): Promise<void> {
  try {
    await createAdapter(now).verify(request);
    throw new Error('expected PortOne verification clock failure');
  } catch (error) {
    expect(error).toBeInstanceOf(PortOneV2PaymentVerificationAdapterErrorV1);
    expect(error).toMatchObject({
      name: 'PortOneV2PaymentVerificationAdapterErrorV1',
      code: 'INVALID_CONFIGURATION',
      httpStatus: null,
      message: 'PortOne V2 verification clock is invalid.',
    });
    expect((error as Error).message).not.toContain(rawMarker);
  }
}

describe('PortOne V2 payment verification clock boundary', () => {
  it('maps a throwing injected verification clock to the existing INVALID_CONFIGURATION boundary', async () => {
    await expectInvalidClock(() => {
      throw new Error('raw-clock-invocation-secret');
    }, 'raw-clock-invocation-secret');
  });

  it('maps a throwing Date getTime operation to the existing INVALID_CONFIGURATION boundary', async () => {
    await expectInvalidClock(() => {
      const value = new Date('2026-09-15T06:01:02.003Z');
      value.getTime = () => {
        throw new Error('raw-clock-get-time-secret');
      };
      return value;
    }, 'raw-clock-get-time-secret');
  });

  it('maps a throwing Date toISOString operation to the existing INVALID_CONFIGURATION boundary', async () => {
    await expectInvalidClock(() => {
      const value = new Date('2026-09-15T06:01:02.003Z');
      value.toISOString = () => {
        throw new Error('raw-clock-iso-secret');
      };
      return value;
    }, 'raw-clock-iso-secret');
  });
});
