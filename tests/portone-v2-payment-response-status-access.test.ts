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
  providerRequestId: 'payment-status-access',
  purchaseIntentId: 'purchase-intent-status-access',
  expectedExternalProductId: 'product-status-access',
  expectedAmountMinor: 1_000,
  expectedCurrency: 'KRW',
});

describe('PortOne V2 payment response status access boundary', () => {
  it('maps a throwing status accessor to NETWORK_FAILURE before downstream response processing', async () => {
    const observed = {
      statusReads: 0,
      headerReads: 0,
      bodyCancelCalls: 0,
      bodyReaderCalls: 0,
      verifiedClockCalls: 0,
    };

    const fetchImpl: PortOneV2PaymentHttpFetchV1 = async () =>
      ({
        get status(): number {
          observed.statusReads += 1;
          throw new Error('raw-status-accessor-internal-detail');
        },
        headers: {
          get(): string | null {
            observed.headerReads += 1;
            return 'application/json';
          },
        },
        body: {
          cancel(): Promise<void> {
            observed.bodyCancelCalls += 1;
            return Promise.reject(new Error('cleanup-rejection-internal-detail'));
          },
          getReader(): never {
            observed.bodyReaderCalls += 1;
            throw new Error('body parsing must not start');
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
        return new Date('2026-09-15T06:30:00.000Z');
      },
    });

    const verification = adapter.verify(request);

    await expect(verification).rejects.toMatchObject({
      name: 'PortOneV2PaymentVerificationAdapterErrorV1',
      code: 'NETWORK_FAILURE',
      message: 'PortOne V2 payment response status could not be read.',
      httpStatus: null,
    });
    await expect(verification).rejects.not.toThrow(
      /raw-status-accessor-internal-detail/u,
    );

    expect(observed.statusReads).toBe(1);
    expect(observed.bodyCancelCalls).toBe(1);
    expect(observed.headerReads).toBe(0);
    expect(observed.bodyReaderCalls).toBe(0);
    expect(observed.verifiedClockCalls).toBe(0);
  });
});
