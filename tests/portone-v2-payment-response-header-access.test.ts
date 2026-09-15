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
  providerRequestId: 'payment-header-access',
  purchaseIntentId: 'purchase-intent-header-access',
  expectedExternalProductId: 'product-header-access',
  expectedAmountMinor: 1_000,
  expectedCurrency: 'KRW',
});

function createHarness(throwingHeader: 'content-type' | 'content-length') {
  const observed = {
    bodyCancelCalls: 0,
    bodyReaderCalls: 0,
    verifiedClockCalls: 0,
  };

  const fetchImpl: PortOneV2PaymentHttpFetchV1 = async () =>
    ({
      status: 200,
      headers: {
        get(name: string): string | null {
          if (name === throwingHeader) {
            throw new Error(`raw ${name} accessor failure`);
          }
          if (name === 'content-type') return 'application/json';
          if (name === 'content-length') return null;
          return null;
        },
      },
      body: {
        async cancel(): Promise<void> {
          observed.bodyCancelCalls += 1;
        },
        getReader(): never {
          observed.bodyReaderCalls += 1;
          throw new Error('body parsing must not start after header access failure');
        },
      },
      async text(): Promise<string> {
        throw new Error('whole-body fallback must not run');
      },
    }) as unknown as PortOneV2PaymentHttpResponseV1;

  const adapter = createPortOneV2PaymentVerificationAdapterV1({
    apiSecret: 'test-portone-api-secret',
    evidenceHmacSecret: 'h'.repeat(32),
    fetchImpl,
    now: () => {
      observed.verifiedClockCalls += 1;
      return new Date('2026-09-15T05:40:00.000Z');
    },
  });

  return { adapter, observed };
}

describe('PortOne V2 payment response header access boundary', () => {
  it.each(['content-type', 'content-length'] as const)(
    'maps throwing %s access to NETWORK_FAILURE before body parsing or evidence promotion',
    async (throwingHeader) => {
      const { adapter, observed } = createHarness(throwingHeader);

      await expect(adapter.verify(request)).rejects.toMatchObject({
        name: 'PortOneV2PaymentVerificationAdapterErrorV1',
        code: 'NETWORK_FAILURE',
        httpStatus: 200,
        message: 'PortOne V2 payment response headers could not be read.',
      });

      expect(observed.bodyCancelCalls).toBe(1);
      expect(observed.bodyReaderCalls).toBe(0);
      expect(observed.verifiedClockCalls).toBe(0);
    },
  );
});
