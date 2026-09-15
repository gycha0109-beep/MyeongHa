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
  providerRequestId: 'payment-reader-result-access',
  purchaseIntentId: 'purchase-intent-reader-result-access',
  expectedExternalProductId: 'product-reader-result-access',
  expectedAmountMinor: 1_000,
  expectedCurrency: 'KRW',
});

type ThrowingAccessor = 'done' | 'value';

describe('PortOne V2 payment response reader result access boundary', () => {
  it.each<ThrowingAccessor>(['done', 'value'])(
    'maps throwing %s access to NETWORK_FAILURE and preserves reader cleanup',
    async (throwingAccessor) => {
      const observed = {
        headerReads: 0,
        responseCancelCalls: 0,
        readerReadCalls: 0,
        readerCancelCalls: 0,
        readerReleaseCalls: 0,
        textCalls: 0,
        verifiedClockCalls: 0,
      };

      const fetchImpl: PortOneV2PaymentHttpFetchV1 = async () =>
        ({
          status: 200,
          headers: {
            get(name: string): string | null {
              observed.headerReads += 1;
              if (name === 'content-type') return 'application/json';
              if (name === 'content-length') return null;
              throw new Error(`unexpected header read: ${name}`);
            },
          },
          body: {
            async cancel(): Promise<void> {
              observed.responseCancelCalls += 1;
            },
            getReader() {
              return {
                async read(): Promise<unknown> {
                  observed.readerReadCalls += 1;
                  if (observed.readerReadCalls !== 1) {
                    throw new Error('reader must stop after accessor failure');
                  }

                  if (throwingAccessor === 'done') {
                    return Object.defineProperty({}, 'done', {
                      configurable: true,
                      enumerable: true,
                      get(): boolean {
                        throw new Error('raw done accessor failure');
                      },
                    });
                  }

                  return {
                    done: false,
                    get value(): Uint8Array {
                      throw new Error('raw value accessor failure');
                    },
                  };
                },
                async cancel(): Promise<void> {
                  observed.readerCancelCalls += 1;
                },
                releaseLock(): void {
                  observed.readerReleaseCalls += 1;
                },
              };
            },
          },
          async text(): Promise<string> {
            observed.textCalls += 1;
            throw new Error('whole-body fallback must not run');
          },
        }) as unknown as PortOneV2PaymentHttpResponseV1;

      const adapter = createPortOneV2PaymentVerificationAdapterV1({
        apiSecret: 'test-portone-api-secret',
        evidenceHmacSecret: 'h'.repeat(32),
        fetchImpl,
        now: () => {
          observed.verifiedClockCalls += 1;
          return new Date('2026-09-15T12:17:00.000Z');
        },
      });

      await expect(adapter.verify(request)).rejects.toMatchObject({
        name: 'PortOneV2PaymentVerificationAdapterErrorV1',
        code: 'NETWORK_FAILURE',
        httpStatus: 200,
        message: 'PortOne V2 payment response body could not be read.',
      });

      expect(observed.headerReads).toBe(2);
      expect(observed.responseCancelCalls).toBe(0);
      expect(observed.readerReadCalls).toBe(1);
      expect(observed.readerCancelCalls).toBe(1);
      expect(observed.readerReleaseCalls).toBe(1);
      expect(observed.textCalls).toBe(0);
      expect(observed.verifiedClockCalls).toBe(0);
    },
  );
});
