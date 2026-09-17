import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  PAYMENT_ATTEMPT_BROWSER_HANDOFF_TRANSPORT_FOUNDATION_V1,
  PAYMENT_ATTEMPT_HANDOFF_HTTP_CONTRACT_VERSION_V1,
  PaymentAttemptBrowserHandoffTransportErrorV1,
  fetchPaymentAttemptBrowserHandoffContextV1,
  preparePortOneV2BrowserCheckoutFromPaymentAttemptV1,
  type PaymentAttemptHandoffFetchPortV1,
  type PaymentAttemptHandoffFetchRequestV1,
  type PaymentAttemptHandoffFetchResponseV1,
} from './payment-attempt-browser-handoff-transport.js';

const PAYMENT_ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';

const SUCCESS = Object.freeze({
  ok: true,
  data: Object.freeze({
    paymentAttemptId: PAYMENT_ATTEMPT_ID,
    provider: 'trusted-portone-provider',
    environment: 'sandbox',
    providerRequestId: 'payment-authority-123',
    amountMinor: 4900,
    currency: 'KRW',
    status: 'created',
  }),
  meta: Object.freeze({
    apiContractVersion: PAYMENT_ATTEMPT_HANDOFF_HTTP_CONTRACT_VERSION_V1,
    requestId: 'request-123',
    serverTime: '2026-09-18T00:00:00.000Z',
  }),
});

const SELECTOR = Object.freeze({
  accepts(provider: string) {
    return provider === 'trusted-portone-provider';
  },
});

const ACTIVATION = Object.freeze({
  storeId: 'store-future-authority',
  channelKey: 'channel-future-authority',
  orderName: 'future-authority-order-name',
  payMethod: 'FUTURE_POLICY_METHOD',
});

function response(status: number, body: string): PaymentAttemptHandoffFetchResponseV1 {
  return Object.freeze({
    status,
    async text() {
      return body;
    },
  });
}

function jsonResponse(status: number, payload: unknown): PaymentAttemptHandoffFetchResponseV1 {
  return response(status, JSON.stringify(payload));
}

function createPort(
  result: PaymentAttemptHandoffFetchResponseV1 = jsonResponse(200, SUCCESS),
): {
  readonly port: PaymentAttemptHandoffFetchPortV1;
  readonly fetch: ReturnType<typeof vi.fn<(request: PaymentAttemptHandoffFetchRequestV1) => Promise<PaymentAttemptHandoffFetchResponseV1>>>;
} {
  const fetch = vi.fn(async (_request: PaymentAttemptHandoffFetchRequestV1) => result);
  return { port: Object.freeze({ fetch }), fetch };
}

function withSuccessData(overrides: Readonly<Record<string, unknown>>): unknown {
  return {
    ...SUCCESS,
    data: {
      ...SUCCESS.data,
      ...overrides,
    },
  };
}

describe('Payment Attempt browser handoff transport foundation', () => {
  it('allows only paymentAttemptId to shape the handoff request and preserves all server-owned authority fields', async () => {
    const serverEnvelope = {
      ...SUCCESS,
      data: {
        ...SUCCESS.data,
        environment: 'production',
        provider: 'server-provider-authority',
        providerRequestId: 'server-payment-id',
        amountMinor: 7777,
        currency: 'USD',
        status: 'created',
      },
    };
    const { port, fetch } = createPort(jsonResponse(200, serverEnvelope));
    const input = {
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      fetchPort: port,
      provider: 'caller-provider-override',
      environment: 'sandbox',
      providerRequestId: 'caller-payment-id',
      amountMinor: 1,
      currency: 'KRW',
      status: 'created',
    } as Parameters<typeof fetchPaymentAttemptBrowserHandoffContextV1>[0] & Record<string, unknown>;

    const result = await fetchPaymentAttemptBrowserHandoffContextV1(input);

    expect(result).toEqual(serverEnvelope.data);
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = fetch.mock.calls[0]?.[0];
    expect(request?.method).toBe('POST');
    expect(request?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(request?.body ?? '')).toEqual({ paymentAttemptId: PAYMENT_ATTEMPT_ID });
  });

  it('feeds only the validated server handoff context into the existing #949 preparation path', async () => {
    const { port } = createPort();
    const result = await preparePortOneV2BrowserCheckoutFromPaymentAttemptV1({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      fetchPort: port,
      providerSelector: SELECTOR,
      activation: ACTIVATION,
    });

    expect(result).toEqual({
      storeId: 'store-future-authority',
      channelKey: 'channel-future-authority',
      paymentId: 'payment-authority-123',
      orderName: 'future-authority-order-name',
      totalAmount: 4900,
      currency: 'KRW',
      payMethod: 'FUTURE_POLICY_METHOD',
    });
  });

  it('cannot use caller provider, amount, currency, or providerTransactionId as browser payment authority', async () => {
    const { port } = createPort();
    const input = {
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      fetchPort: port,
      providerSelector: SELECTOR,
      activation: ACTIVATION,
      provider: 'caller-provider',
      amountMinor: 1,
      currency: 'USD',
      providerTransactionId: 'provider-issued-transaction-id',
    } as Parameters<typeof preparePortOneV2BrowserCheckoutFromPaymentAttemptV1>[0] & Record<string, unknown>;

    const result = await preparePortOneV2BrowserCheckoutFromPaymentAttemptV1(input);

    expect(result.paymentId).toBe('payment-authority-123');
    expect(result.totalAmount).toBe(4900);
    expect(result.currency).toBe('KRW');
    expect(result).not.toHaveProperty('providerTransactionId');
  });

  it('fails closed on malformed JSON', async () => {
    const { port } = createPort(response(200, '{not-json'));
    await expect(fetchPaymentAttemptBrowserHandoffContextV1({ paymentAttemptId: PAYMENT_ATTEMPT_ID, fetchPort: port }))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('fails closed on a malformed success envelope or extra response structure', async () => {
    const { port: malformed } = createPort(jsonResponse(200, { ok: false, data: SUCCESS.data, meta: SUCCESS.meta }));
    await expect(fetchPaymentAttemptBrowserHandoffContextV1({ paymentAttemptId: PAYMENT_ATTEMPT_ID, fetchPort: malformed }))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });

    const { port: extra } = createPort(jsonResponse(200, { ...SUCCESS, unexpected: true }));
    await expect(fetchPaymentAttemptBrowserHandoffContextV1({ paymentAttemptId: PAYMENT_ATTEMPT_ID, fetchPort: extra }))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('fails closed when a required server authority field is missing', async () => {
    const { providerRequestId: _omitted, ...data } = SUCCESS.data;
    const { port } = createPort(jsonResponse(200, { ...SUCCESS, data }));
    await expect(fetchPaymentAttemptBrowserHandoffContextV1({ paymentAttemptId: PAYMENT_ATTEMPT_ID, fetchPort: port }))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('fails closed on invalid amount authority', async () => {
    const { port } = createPort(jsonResponse(200, withSuccessData({ amountMinor: 0 })));
    await expect(fetchPaymentAttemptBrowserHandoffContextV1({ paymentAttemptId: PAYMENT_ATTEMPT_ID, fetchPort: port }))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('fails closed on invalid currency authority', async () => {
    const { port } = createPort(jsonResponse(200, withSuccessData({ currency: 'usd' })));
    await expect(fetchPaymentAttemptBrowserHandoffContextV1({ paymentAttemptId: PAYMENT_ATTEMPT_ID, fetchPort: port }))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('fails closed on invalid status authority', async () => {
    const { port } = createPort(jsonResponse(200, withSuccessData({ status: 'paid' })));
    await expect(fetchPaymentAttemptBrowserHandoffContextV1({ paymentAttemptId: PAYMENT_ATTEMPT_ID, fetchPort: port }))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('fails closed on an incompatible API contract version', async () => {
    const { port } = createPort(jsonResponse(200, {
      ...SUCCESS,
      meta: { ...SUCCESS.meta, apiContractVersion: 'v0.8' },
    }));
    await expect(fetchPaymentAttemptBrowserHandoffContextV1({ paymentAttemptId: PAYMENT_ATTEMPT_ID, fetchPort: port }))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('fails closed when the returned paymentAttemptId does not match the request', async () => {
    const { port } = createPort(jsonResponse(200, withSuccessData({
      paymentAttemptId: '22222222-2222-4222-8222-222222222222',
    })));
    await expect(fetchPaymentAttemptBrowserHandoffContextV1({ paymentAttemptId: PAYMENT_ATTEMPT_ID, fetchPort: port }))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it.each([
    [400, 'INVALID_REQUEST'],
    [401, 'AUTH_REQUIRED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
  ] as const)('normalizes HTTP %s to %s', async (status, code) => {
    const { port } = createPort(jsonResponse(status, { untrusted: 'error-envelope' }));
    await expect(fetchPaymentAttemptBrowserHandoffContextV1({ paymentAttemptId: PAYMENT_ATTEMPT_ID, fetchPort: port }))
      .rejects.toMatchObject({ code, httpStatus: status, retryable: false });
  });

  it('normalizes unexpected server failure without trusting its body', async () => {
    const { port } = createPort(response(503, 'not-json-and-untrusted'));
    await expect(fetchPaymentAttemptBrowserHandoffContextV1({ paymentAttemptId: PAYMENT_ATTEMPT_ID, fetchPort: port }))
      .rejects.toMatchObject({ code: 'UPSTREAM_FAILURE', httpStatus: 503, retryable: true });
  });

  it('normalizes transport failure without reflecting the raw error', async () => {
    const fetch = vi.fn(async (_request: PaymentAttemptHandoffFetchRequestV1): Promise<PaymentAttemptHandoffFetchResponseV1> => {
      throw new Error('secret transport implementation detail');
    });
    const port: PaymentAttemptHandoffFetchPortV1 = Object.freeze({ fetch });

    let caught: unknown;
    try {
      await fetchPaymentAttemptBrowserHandoffContextV1({ paymentAttemptId: PAYMENT_ATTEMPT_ID, fetchPort: port });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PaymentAttemptBrowserHandoffTransportErrorV1);
    expect(caught).toMatchObject({ code: 'TRANSPORT_FAILURE', httpStatus: null, retryable: true });
    expect((caught as Error).message).not.toContain('secret transport implementation detail');
  });

  it('remains inert, unmounted, global-fetch independent, and SDK-free', async () => {
    const requestPayment = vi.fn();
    const { port } = createPort();

    await preparePortOneV2BrowserCheckoutFromPaymentAttemptV1({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      fetchPort: port,
      providerSelector: SELECTOR,
      activation: ACTIVATION,
    });

    expect(requestPayment).not.toHaveBeenCalled();
    expect(PAYMENT_ATTEMPT_BROWSER_HANDOFF_TRANSPORT_FOUNDATION_V1).toEqual({
      active: false,
      publicRoute: null,
      globalFetchDependency: false,
      sdkDependency: false,
      sdkInvocationEnabled: false,
      liveCheckoutEnabled: false,
    });

    const rootPackage = readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8');
    const webPackage = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
    expect(rootPackage).not.toContain('@portone/browser-sdk');
    expect(webPackage).not.toContain('@portone/browser-sdk');
  });
});
