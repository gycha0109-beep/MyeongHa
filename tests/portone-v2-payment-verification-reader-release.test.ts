import { describe, expect, it, vi } from 'vitest';
import type { CommercePaymentVerificationAdapterRequestV1 } from '../apps/api/src/commerce-payment-verification-execution.js';
import {
  PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1,
  createPortOneV2PaymentVerificationAdapterV1,
  type PortOneV2PaymentHttpFetchV1,
  type PortOneV2PaymentHttpResponseV1,
} from '../apps/api/src/portone-v2-payment-verification-adapter.js';

const request: CommercePaymentVerificationAdapterRequestV1 = Object.freeze({
  provider: 'portone_v2',
  platform: 'web',
  environment: 'sandbox',
  providerRequestId: 'payment-release-lock-1',
  purchaseIntentId: 'purchase-intent-release-lock-1',
  expectedExternalProductId: 'product-1',
  expectedAmountMinor: 1000,
  expectedCurrency: 'KRW',
});

type TestReader = Readonly<{
  read(): Promise<Readonly<{ done: boolean; value?: Uint8Array }>>;
  cancel(reason?: unknown): Promise<void>;
  releaseLock(): void;
}>;

function createHarness(reader: TestReader) {
  const bodyCancel = vi.fn(async () => undefined);
  const text = vi.fn(async () => '{"must":"not-read"}');
  const body = {
    cancel: bodyCancel,
    getReader: () => reader,
  };
  const response: PortOneV2PaymentHttpResponseV1 = {
    status: 200,
    headers: {
      get(name: string) {
        return name.toLowerCase() === 'content-type'
          ? 'application/json; charset=utf-8'
          : null;
      },
    },
    body: body as unknown as PortOneV2PaymentHttpResponseV1['body'],
    text,
  };
  const fetchImpl: PortOneV2PaymentHttpFetchV1 = async () => response;
  const adapter = createPortOneV2PaymentVerificationAdapterV1({
    apiSecret: 'test-portone-provider-key',
    evidenceHmacSecret: 'h'.repeat(32),
    fetchImpl,
    now: () => new Date('2026-09-15T00:00:00.000Z'),
  });

  return Object.freeze({ adapter, bodyCancel, text });
}

function throwingReleaseLock() {
  return vi.fn(() => {
    throw new Error('release-lock-internal-detail');
  });
}

describe('PortOne V2 payment response reader release cleanup', () => {
  it('does not let releaseLock failure replace the governed body-read NETWORK_FAILURE', async () => {
    const read = vi.fn(async () => {
      throw new Error('body-read-internal-detail');
    });
    const cancel = vi.fn(async () => undefined);
    const releaseLock = throwingReleaseLock();
    const { adapter, bodyCancel, text } = createHarness({ read, cancel, releaseLock });
    const verification = adapter.verify(request);

    await expect(verification).rejects.toMatchObject({
      name: 'PortOneV2PaymentVerificationAdapterErrorV1',
      code: 'NETWORK_FAILURE',
      message: 'PortOne V2 payment response body could not be read.',
      httpStatus: 200,
    });
    await expect(verification).rejects.not.toThrow(/release-lock-internal-detail/u);
    expect(read).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(bodyCancel).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
  });

  it('does not let releaseLock failure replace streamed RESPONSE_TOO_LARGE', async () => {
    const read = vi.fn(async () => ({
      done: false,
      value: new Uint8Array(PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1 + 1),
    }));
    const cancel = vi.fn(async () => undefined);
    const releaseLock = throwingReleaseLock();
    const { adapter, bodyCancel, text } = createHarness({ read, cancel, releaseLock });
    const verification = adapter.verify(request);

    await expect(verification).rejects.toMatchObject({
      name: 'PortOneV2PaymentVerificationAdapterErrorV1',
      code: 'RESPONSE_TOO_LARGE',
      message: 'PortOne V2 payment response body exceeded the configured bound.',
      httpStatus: 200,
    });
    await expect(verification).rejects.not.toThrow(/release-lock-internal-detail/u);
    expect(read).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(bodyCancel).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
  });

  it('keeps a successful parsed payment authoritative when releaseLock throws', async () => {
    const raw = JSON.stringify({
      status: 'PAID',
      id: 'payment-release-lock-1',
      transactionId: 'transaction-release-lock-1',
      currency: 'KRW',
      amount: { total: 1000 },
      products: [{ id: 'product-1', name: 'Deep Reading', quantity: 1, amount: 1000 }],
      selectedChannel: { type: 'TEST' },
      paidAt: '2026-09-14T23:59:00.000Z',
    });
    const chunks: Array<Readonly<{ done: boolean; value?: Uint8Array }>> = [
      { done: false, value: new TextEncoder().encode(raw) },
      { done: true },
    ];
    const read = vi.fn(async () => chunks.shift() ?? { done: true });
    const cancel = vi.fn(async () => undefined);
    const releaseLock = throwingReleaseLock();
    const { adapter, bodyCancel, text } = createHarness({ read, cancel, releaseLock });

    const result = await adapter.verify(request);

    expect(result.providerRequestId).toBe('payment-release-lock-1');
    expect(result.evidence.externalTransactionId).toBe('transaction-release-lock-1');
    expect(read).toHaveBeenCalledTimes(2);
    expect(cancel).not.toHaveBeenCalled();
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(bodyCancel).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
  });
});
