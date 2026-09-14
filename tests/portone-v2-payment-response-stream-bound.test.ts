import { describe, expect, it } from 'vitest';
import type { CommercePaymentVerificationAdapterRequestV1 } from '../apps/api/src/commerce-payment-verification-execution.js';
import {
  PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1,
  createPortOneV2PaymentVerificationAdapterV1,
  type PortOneV2PaymentHttpFetchV1,
  type PortOneV2PaymentHttpResponseV1,
} from '../apps/api/src/portone-v2-payment-verification-adapter.js';

const API_SECRET = 'test-portone-api-secret';
const EVIDENCE_HMAC_SECRET = 'h'.repeat(32);

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

function paidPayment() {
  return {
    status: 'PAID',
    id: 'payment-1',
    transactionId: 'transaction-1',
    currency: 'KRW',
    amount: { total: 1000 },
    products: [{ id: 'product-1', name: 'Deep Reading', quantity: 1, amount: 1000 }],
    selectedChannel: { type: 'TEST' },
    paidAt: '2026-09-14T05:00:00.000Z',
  };
}

function adapterFor(response: Response) {
  const fetchImpl: PortOneV2PaymentHttpFetchV1 = async () =>
    response as unknown as PortOneV2PaymentHttpResponseV1;
  return createPortOneV2PaymentVerificationAdapterV1({
    apiSecret: API_SECRET,
    evidenceHmacSecret: EVIDENCE_HMAC_SECRET,
    fetchImpl,
    now: () => new Date('2026-09-14T05:01:02.003Z'),
  });
}

function jsonResponse(body: ReadableStream<Uint8Array>, headers: HeadersInit = {}) {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

async function expectResponseTooLarge(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({
    name: 'PortOneV2PaymentVerificationAdapterErrorV1',
    code: 'RESPONSE_TOO_LARGE',
  });
}

describe('PortOne V2 payment response streaming bound', () => {
  it('stops reading after a no-Content-Length stream crosses the existing byte bound', async () => {
    let pullCalls = 0;
    let cancelCalls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pullCalls += 1;
          if (pullCalls === 1) {
            controller.enqueue(
              new Uint8Array(PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1),
            );
            return;
          }
          if (pullCalls === 2) {
            controller.enqueue(new Uint8Array([0]));
            return;
          }
          throw new Error('reader consumed bytes after oversize was already proven');
        },
        cancel() {
          cancelCalls += 1;
          return new Promise<void>(() => undefined);
        },
      },
      { highWaterMark: 0 },
    );

    await expectResponseTooLarge(adapterFor(jsonResponse(stream)).verify(request));

    expect(pullCalls).toBe(2);
    expect(cancelCalls).toBe(1);
    expect(stream.locked).toBe(false);
  });

  it('does not let streamed-oversize cancellation rejection replace the size result', async () => {
    let pullCalls = 0;
    let cancelCalls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pullCalls += 1;
          if (pullCalls === 1) {
            controller.enqueue(
              new Uint8Array(PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1),
            );
            return;
          }
          controller.enqueue(new Uint8Array([0]));
        },
        cancel() {
          cancelCalls += 1;
          return Promise.reject(new Error('synthetic cancellation failure'));
        },
      },
      { highWaterMark: 0 },
    );

    await expectResponseTooLarge(adapterFor(jsonResponse(stream)).verify(request));
    await Promise.resolve();

    expect(pullCalls).toBe(2);
    expect(cancelCalls).toBe(1);
    expect(stream.locked).toBe(false);
  });

  it('rejects declared oversize before reading and does not await disposal settlement', async () => {
    let pullCalls = 0;
    let cancelCalls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pullCalls += 1;
          controller.enqueue(new Uint8Array([1]));
        },
        cancel() {
          cancelCalls += 1;
          return new Promise<void>(() => undefined);
        },
      },
      { highWaterMark: 0 },
    );
    const response = jsonResponse(stream, {
      'content-length': String(PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1 + 1),
    });

    await expectResponseTooLarge(adapterFor(response).verify(request));

    expect(pullCalls).toBe(0);
    expect(cancelCalls).toBe(1);
    expect(stream.locked).toBe(false);
  });

  it('accepts a valid response whose transport bytes equal the existing bound', async () => {
    const json = JSON.stringify(paidPayment());
    const jsonBytes = Buffer.byteLength(json, 'utf8');
    expect(jsonBytes).toBeLessThan(PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1);
    const raw = `${json}${' '.repeat(
      PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1 - jsonBytes,
    )}`;
    const bytes = new TextEncoder().encode(raw);
    expect(bytes.byteLength).toBe(PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1);

    let pullCalls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pullCalls += 1;
          if (pullCalls === 1) {
            controller.enqueue(bytes);
            return;
          }
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );

    const result = await adapterFor(jsonResponse(stream)).verify(request);

    expect(result.providerRequestId).toBe('payment-1');
    expect(pullCalls).toBe(2);
    expect(stream.locked).toBe(false);
  });
});
