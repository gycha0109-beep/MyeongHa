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
  it('maps throwing status access to NETWORK_FAILURE before headers, body parsing, or evidence promotion', async () => {
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
          throw new Error('raw status accessor failure');
        },
        headers: {
          get(): string | null {
            observed.headerReads += 1;
            throw new Error('headers must not be read after status access failure');
          },
        },
        body: {
          async cancel(): Promise<void> {
            observed.bodyCancelCalls += 1;
          },
          getReader(): never {
            observed.bodyReaderCalls += 1;
            throw new Error('body parsing must not start after status access failure');
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

    await expect(adapter.verify(request)).rejects.toMatchObject({
      name: 'PortOneV2PaymentVerificationAdapterErrorV1',
      code: 'NETWORK_FAILURE',
      httpStatus: null,
      message: 'PortOne V2 payment response status could not be read.',
    });

    expect(observed.statusReads).toBe(1);
    expect(observed.headerReads).toBe(0);
    expect(observed.bodyCancelCalls).toBe(1);
    expect(observed.bodyReaderCalls).toBe(0);
    expect(observed.verifiedClockCalls).toBe(0);
  });

  it('reuses the accepted status snapshot for later failure metadata', async () => {
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
          if (observed.statusReads === 1) return 200;
          throw new Error('status must not be re-read after acceptance');
        },
        headers: {
          get(): string | null {
            observed.headerReads += 1;
            throw new Error('raw header accessor failure');
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
        return new Date('2026-09-15T06:30:00.000Z');
      },
    });

    await expect(adapter.verify(request)).rejects.toMatchObject({
      name: 'PortOneV2PaymentVerificationAdapterErrorV1',
      code: 'NETWORK_FAILURE',
      httpStatus: 200,
      message: 'PortOne V2 payment response headers could not be read.',
    });

    expect(observed.statusReads).toBe(1);
    expect(observed.headerReads).toBe(1);
    expect(observed.bodyCancelCalls).toBe(1);
    expect(observed.bodyReaderCalls).toBe(0);
    expect(observed.verifiedClockCalls).toBe(0);
  });
});
