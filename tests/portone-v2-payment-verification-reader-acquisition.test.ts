import { describe, expect, it, vi } from 'vitest';
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
  providerRequestId: 'payment-reader-acquisition-1',
  purchaseIntentId: 'purchase-intent-reader-acquisition-1',
  expectedExternalProductId: 'product-1',
  expectedAmountMinor: 1000,
  expectedCurrency: 'KRW',
});

function throwingReaderResponse(
  cancelImpl: () => Promise<void>,
): Readonly<{
  response: PortOneV2PaymentHttpResponseV1;
  cancel: ReturnType<typeof vi.fn>;
  getReader: ReturnType<typeof vi.fn>;
  text: ReturnType<typeof vi.fn>;
}> {
  const acquisitionError = new Error('reader-acquisition-internal-detail');
  const cancel = vi.fn(cancelImpl);
  const getReader = vi.fn(() => {
    throw acquisitionError;
  });
  const text = vi.fn(async () => '{"must":"not-read"}');
  const body = { cancel, getReader };

  return Object.freeze({
    response: {
      status: 200,
      headers: {
        get(name: string) {
          return name.toLowerCase() === 'content-type'
            ? 'application/json; charset=utf-8'
            : null;
        },
      },
      body: body as PortOneV2PaymentHttpResponseV1['body'],
      text,
    },
    cancel,
    getReader,
    text,
  });
}

function createAdapter(response: PortOneV2PaymentHttpResponseV1) {
  const fetchImpl: PortOneV2PaymentHttpFetchV1 = async () => response;
  return createPortOneV2PaymentVerificationAdapterV1({
    apiSecret: 'test-portone-provider-key',
    evidenceHmacSecret: 'h'.repeat(32),
    fetchImpl,
  });
}

async function expectGovernedReaderAcquisitionFailure(
  cancelImpl: () => Promise<void>,
): Promise<void> {
  const { response, cancel, getReader, text } = throwingReaderResponse(cancelImpl);
  const adapter = createAdapter(response);
  const verification = adapter.verify(request);

  await expect(verification).rejects.toMatchObject({
    name: 'PortOneV2PaymentVerificationAdapterErrorV1',
    code: 'NETWORK_FAILURE',
    message: 'PortOne V2 payment response body could not be read.',
    httpStatus: 200,
  });
  await expect(verification).rejects.not.toThrow(/reader-acquisition-internal-detail/u);
  expect(getReader).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(text).not.toHaveBeenCalled();
}

describe('PortOne V2 payment response reader acquisition', () => {
  it('preserves the governed transport error when best-effort cleanup rejects', async () => {
    await expectGovernedReaderAcquisitionFailure(() =>
      Promise.reject(new Error('cleanup-rejection-internal-detail')),
    );
  });

  it('does not await best-effort cleanup that never settles', async () => {
    await expectGovernedReaderAcquisitionFailure(
      () => new Promise<void>(() => undefined),
    );
  });
});
