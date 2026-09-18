import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchPaymentAttemptServerVerificationV1,
  PAYMENT_ATTEMPT_BROWSER_SERVER_VERIFICATION_TRANSPORT_V1,
  type PaymentAttemptServerVerificationFetchPortV1,
} from './payment-attempt-browser-server-verification-transport.js';

const PAYMENT_ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const RECEIPT_ID = '22222222-2222-4222-8222-222222222222';

function successEnvelope(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    ok: true,
    data: {
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      receiptId: RECEIPT_ID,
      replayed: false,
    },
    meta: {
      apiContractVersion: 'v0.9',
      requestId: 'req-payment-verification-v1',
      serverTime: '2026-09-18T00:20:00.000Z',
    },
    ...overrides,
  };
}

function capabilityUnavailableEnvelope(
  retryable: boolean,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    ok: false,
    error: {
      code: 'CAPABILITY_UNAVAILABLE',
      messageKey: 'payment_attempt.verification_unavailable',
      retryable,
    },
    meta: {
      apiContractVersion: 'v0.9',
      requestId: 'req-payment-verification-v1',
    },
    ...overrides,
  };
}

function fetchPort(input: {
  status?: number;
  body?: unknown;
  throwError?: Error;
  textError?: Error;
  inspectRequest?: (
    request: Readonly<{
      method: 'POST';
      headers: Readonly<Record<string, string>>;
      body: string;
    }>,
  ) => void;
} = {}): PaymentAttemptServerVerificationFetchPortV1 {
  return {
    fetch: vi.fn(async (request) => {
      input.inspectRequest?.(request);
      if (input.throwError !== undefined) throw input.throwError;
      return {
        status: input.status ?? 200,
        async text() {
          if (input.textError !== undefined) throw input.textError;
          const body = input.body ?? successEnvelope();
          return typeof body === 'string' ? body : JSON.stringify(body);
        },
      };
    }),
  };
}

describe('Payment Attempt browser-to-server verification transport foundation', () => {
  it('sends exactly paymentAttemptId and accepts only canonical server completion data', async () => {
    const transport = fetchPort({
      inspectRequest(request) {
        expect(request).toEqual({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentAttemptId: PAYMENT_ATTEMPT_ID }),
        });
      },
    });

    await expect(fetchPaymentAttemptServerVerificationV1({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      fetchPort: transport,
    })).resolves.toEqual({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      receiptId: RECEIPT_ID,
      replayed: false,
    });
  });

  it('ignores caller-shaped browser/provider authority extras because they are outside the request contract', async () => {
    const transport = fetchPort({
      inspectRequest(request) {
        expect(JSON.parse(request.body)).toEqual({
          paymentAttemptId: PAYMENT_ATTEMPT_ID,
        });
        expect(request.body).not.toContain('sdkAttemptId');
        expect(request.body).not.toContain('providerTransactionId');
        expect(request.body).not.toContain('amountMinor');
        expect(request.body).not.toContain('currency');
        expect(request.body).not.toContain('status');
      },
    });

    const input = {
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      fetchPort: transport,
      paymentId: 'browser-payment-id',
      sdkAttemptId: 'browser-sdk-attempt',
      providerTransactionId: 'browser-transaction',
      amountMinor: 1,
      currency: 'USD',
      status: 'PAID',
    };

    await expect(fetchPaymentAttemptServerVerificationV1(input)).resolves.toEqual({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      receiptId: RECEIPT_ID,
      replayed: false,
    });
  });

  it('canonicalizes a valid requested UUID while correlating the server response', async () => {
    const mixedCase = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
    const transport = fetchPort({
      body: {
        ...successEnvelope(),
        data: {
          paymentAttemptId: mixedCase,
          receiptId: RECEIPT_ID,
          replayed: true,
        },
      },
      inspectRequest(request) {
        expect(request.body).toBe(JSON.stringify({
          paymentAttemptId: mixedCase.toLowerCase(),
        }));
      },
    });

    await expect(fetchPaymentAttemptServerVerificationV1({
      paymentAttemptId: mixedCase,
      fetchPort: transport,
    })).resolves.toEqual({
      paymentAttemptId: mixedCase.toLowerCase(),
      receiptId: RECEIPT_ID,
      replayed: true,
    });
  });

  it('fails closed when returned paymentAttemptId does not match the request', async () => {
    await expect(fetchPaymentAttemptServerVerificationV1({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      fetchPort: fetchPort({
        body: {
          ...successEnvelope(),
          data: {
            paymentAttemptId: '33333333-3333-4333-8333-333333333333',
            receiptId: RECEIPT_ID,
            replayed: false,
          },
        },
      }),
    })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      httpStatus: 200,
      retryable: false,
    });
  });

  it.each([
    ['top-level extra field', {
      ...successEnvelope(),
      extra: true,
    }],
    ['missing receipt id', {
      ...successEnvelope(),
      data: {
        paymentAttemptId: PAYMENT_ATTEMPT_ID,
        replayed: false,
      },
    }],
    ['malformed receipt id', {
      ...successEnvelope(),
      data: {
        paymentAttemptId: PAYMENT_ATTEMPT_ID,
        receiptId: 'not-a-uuid',
        replayed: false,
      },
    }],
    ['malformed replay flag', {
      ...successEnvelope(),
      data: {
        paymentAttemptId: PAYMENT_ATTEMPT_ID,
        receiptId: RECEIPT_ID,
        replayed: 'false',
      },
    }],
    ['incompatible contract version', {
      ...successEnvelope(),
      meta: {
        apiContractVersion: 'v9.9',
        requestId: 'req-payment-verification-v1',
        serverTime: '2026-09-18T00:20:00.000Z',
      },
    }],
    ['invalid server time', {
      ...successEnvelope(),
      meta: {
        apiContractVersion: 'v0.9',
        requestId: 'req-payment-verification-v1',
        serverTime: 'not-a-time',
      },
    }],
    ['metadata extra field', {
      ...successEnvelope(),
      meta: {
        apiContractVersion: 'v0.9',
        requestId: 'req-payment-verification-v1',
        serverTime: '2026-09-18T00:20:00.000Z',
        extra: true,
      },
    }],
  ] as const)('rejects malformed success response: %s', async (_label, body) => {
    await expect(fetchPaymentAttemptServerVerificationV1({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      fetchPort: fetchPort({ body }),
    })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it.each([
    [400, 'INVALID_REQUEST'],
    [401, 'AUTH_REQUIRED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'IDEMPOTENCY_CONFLICT'],
  ] as const)('normalizes HTTP %i to %s without trusting a response body', async (status, code) => {
    await expect(fetchPaymentAttemptServerVerificationV1({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      fetchPort: fetchPort({
        status,
        body: {
          privateProviderDetail: 'must-not-be-trusted',
          retryable: true,
        },
      }),
    })).rejects.toMatchObject({
      code,
      httpStatus: status,
      retryable: false,
    });
  });

  it.each([
    [true],
    [false],
  ] as const)('strictly preserves server 503 retryability=%s', async (retryable) => {
    await expect(fetchPaymentAttemptServerVerificationV1({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      fetchPort: fetchPort({
        status: 503,
        body: capabilityUnavailableEnvelope(retryable),
      }),
    })).rejects.toMatchObject({
      code: 'CAPABILITY_UNAVAILABLE',
      httpStatus: 503,
      retryable,
    });
  });

  it.each([
    ['wrong capability code', {
      ...capabilityUnavailableEnvelope(true),
      error: {
        code: 'SOMETHING_ELSE',
        messageKey: 'payment_attempt.verification_unavailable',
        retryable: true,
      },
    }],
    ['extra failure field', {
      ...capabilityUnavailableEnvelope(true),
      error: {
        code: 'CAPABILITY_UNAVAILABLE',
        messageKey: 'payment_attempt.verification_unavailable',
        retryable: true,
        providerCode: 'private-provider-code',
      },
    }],
    ['bad metadata', {
      ...capabilityUnavailableEnvelope(true),
      meta: {
        apiContractVersion: 'v0.8',
        requestId: 'req-payment-verification-v1',
      },
    }],
  ] as const)('rejects malformed 503 body instead of trusting it: %s', async (_label, body) => {
    await expect(fetchPaymentAttemptServerVerificationV1({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      fetchPort: fetchPort({ status: 503, body }),
    })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      httpStatus: 503,
      retryable: false,
    });
  });

  it('normalizes an unexpected 5xx without reading or reflecting arbitrary body data', async () => {
    await expect(fetchPaymentAttemptServerVerificationV1({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      fetchPort: fetchPort({
        status: 502,
        body: { privateDetail: 'must not be reflected' },
      }),
    })).rejects.toMatchObject({
      code: 'UPSTREAM_FAILURE',
      httpStatus: 502,
      retryable: true,
    });
  });

  it('normalizes transport failure without reflecting the raw error', async () => {
    let error: unknown;
    try {
      await fetchPaymentAttemptServerVerificationV1({
        paymentAttemptId: PAYMENT_ATTEMPT_ID,
        fetchPort: fetchPort({
          throwError: new Error('secret bearer / provider detail'),
        }),
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      code: 'TRANSPORT_FAILURE',
      httpStatus: null,
      retryable: true,
    });
    expect(String(error)).not.toContain('secret bearer');
  });

  it('normalizes a success-body read failure without reflecting the raw error', async () => {
    let error: unknown;
    try {
      await fetchPaymentAttemptServerVerificationV1({
        paymentAttemptId: PAYMENT_ATTEMPT_ID,
        fetchPort: fetchPort({
          textError: new Error('private body reader detail'),
        }),
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      code: 'TRANSPORT_FAILURE',
      retryable: true,
    });
    expect(String(error)).not.toContain('private body reader detail');
  });

  it.each([
    '',
    'not-a-uuid',
    '11111111-1111-6111-8111-111111111111',
  ])('rejects invalid request paymentAttemptId %j before transport', async (paymentAttemptId) => {
    const transport = fetchPort();
    await expect(fetchPaymentAttemptServerVerificationV1({
      paymentAttemptId,
      fetchPort: transport,
    })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(transport.fetch).not.toHaveBeenCalled();
  });

  it('remains unmounted, global-fetch-free, SDK-free, and entitlement-free', () => {
    expect(PAYMENT_ATTEMPT_BROWSER_SERVER_VERIFICATION_TRANSPORT_V1).toEqual({
      active: false,
      publicRoute: null,
      globalFetchDependency: false,
      sdkDependency: false,
      sdkResultAuthority: false,
      entitlementAuthority: false,
      serverVerificationRequired: true,
    });

    const source = readFileSync(
      new URL('./payment-attempt-browser-server-verification-transport.ts', import.meta.url),
      'utf8',
    );
    const rootPackage = readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8');
    const webPackage = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');

    expect(source).not.toContain('globalThis.fetch');
    expect(source).not.toContain('window.fetch');
    expect(source).not.toContain('PortOne.requestPayment(');
    expect(source).not.toContain('.requestPayment(');
    expect(source).not.toContain('grantEntitlement(');
    expect(source).not.toContain('activateEntitlement(');
    expect(source).not.toContain('sdkAttemptId');
    expect(source).not.toContain('providerTransactionId');
    expect(rootPackage).not.toContain('@portone/browser-sdk');
    expect(webPackage).not.toContain('@portone/browser-sdk');
  });
});
