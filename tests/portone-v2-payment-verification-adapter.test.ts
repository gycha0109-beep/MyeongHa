import { describe, expect, it, vi } from 'vitest';
import {
  executeCommercePaymentVerificationV1,
  type CommercePaymentVerificationAdapterRequestV1,
} from '../apps/api/src/commerce-payment-verification-execution.js';
import {
  PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1,
  PortOneV2PaymentVerificationAdapterErrorV1,
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

function paidPayment(overrides: Record<string, unknown> = {}) {
  return {
    status: 'PAID',
    id: 'payment-1',
    transactionId: 'transaction-1',
    currency: 'KRW',
    amount: { total: 1000, taxFree: 0, vat: 91 },
    products: [{ id: 'product-1', name: 'Deep Reading', quantity: 1, amount: 1000 }],
    selectedChannel: { type: 'TEST', id: 'channel-id', key: 'channel-key' },
    paidAt: '2026-09-14T05:00:00.000Z',
    customer: { id: 'customer-must-not-leak', email: 'private@example.com' },
    method: { type: 'CARD', approvalNumber: 'must-not-leak' },
    ...overrides,
  };
}

function responseFor(
  payload: unknown,
  options: {
    readonly status?: number;
    readonly contentType?: string | null;
    readonly contentLength?: string | null;
    readonly rawText?: string;
  } = {},
): PortOneV2PaymentHttpResponseV1 & { readonly text: ReturnType<typeof vi.fn> } {
  const rawText = options.rawText ?? JSON.stringify(payload);
  const text = vi.fn(async () => rawText);
  const cancel = vi.fn(async () => undefined);
  const headers = new Map<string, string>();
  if (options.contentType !== null) {
    headers.set('content-type', options.contentType ?? 'application/json; charset=utf-8');
  }
  if (options.contentLength !== undefined && options.contentLength !== null) {
    headers.set('content-length', options.contentLength);
  }

  const bytes = new TextEncoder().encode(rawText);
  let sent = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (!sent) {
          sent = true;
          if (bytes.byteLength > 0) controller.enqueue(bytes);
        }
        controller.close();
      },
      cancel,
    },
    { highWaterMark: 0 },
  );

  return {
    status: options.status ?? 200,
    headers: {
      get(name: string) {
        return headers.get(name.toLowerCase()) ?? null;
      },
    },
    body,
    text,
  };
}

function createWithResponse(
  payload: unknown,
  options: Parameters<typeof responseFor>[1] = {},
  now: () => Date = () => new Date('2026-09-14T05:01:02.003Z'),
) {
  const response = responseFor(payload, options);
  const fetchImpl = vi.fn(async () => response) as unknown as PortOneV2PaymentHttpFetchV1;
  const adapter = createPortOneV2PaymentVerificationAdapterV1({
    apiSecret: API_SECRET,
    evidenceHmacSecret: EVIDENCE_HMAC_SECRET,
    fetchImpl,
    now,
  });
  return { adapter, fetchImpl, response };
}

async function expectAdapterCode(
  promise: Promise<unknown>,
  code: PortOneV2PaymentVerificationAdapterErrorV1['code'],
) {
  await expect(promise).rejects.toMatchObject({
    name: 'PortOneV2PaymentVerificationAdapterErrorV1',
    code,
  });
}

describe('PortOne V2 server payment verification adapter', () => {
  it('performs canonical payment lookup and emits only allowlisted verified evidence', async () => {
    let capturedUrl = '';
    let capturedInit: Parameters<PortOneV2PaymentHttpFetchV1>[1] | undefined;
    const response = responseFor(paidPayment());
    const fetchImpl: PortOneV2PaymentHttpFetchV1 = async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return response;
    };
    const adapter = createPortOneV2PaymentVerificationAdapterV1({
      apiSecret: API_SECRET,
      evidenceHmacSecret: EVIDENCE_HMAC_SECRET,
      fetchImpl,
      now: () => new Date('2026-09-14T05:01:02.003Z'),
    });

    const result = await adapter.verify(request);

    expect(capturedUrl).toBe('https://api.portone.io/payments/payment-1');
    expect(capturedInit).toMatchObject({
      method: 'GET',
      redirect: 'error',
      headers: {
        accept: 'application/json',
        authorization: `PortOne ${API_SECRET}`,
      },
    });
    expect(result.providerRequestId).toBe('payment-1');
    expect(result.evidence).toEqual({
      schemaVersion: 'commerce-evidence-v2',
      provider: 'portone_v2',
      platform: 'web',
      environment: 'sandbox',
      externalTransactionId: 'transaction-1',
      externalProductId: 'product-1',
      providerOccurredAt: '2026-09-14T05:00:00.000Z',
      currentState: 'active',
      ownerBinding: {
        kind: 'purchase_intent',
        purchaseIntentId: 'purchase-intent-1',
      },
      evidenceFingerprint: expect.stringMatching(/^hmac-sha256:k1:[0-9a-f]{64}$/u),
      verifierRevision: 'portone-v2-payment-lookup-v1',
      verifiedAmountMinor: 1000,
      verifiedCurrency: 'KRW',
      verifiedAt: '2026-09-14T05:01:02.003Z',
    });

    const serializedEvidence = JSON.stringify(result.evidence);
    expect(serializedEvidence).not.toContain(API_SECRET);
    expect(serializedEvidence).not.toContain('customer-must-not-leak');
    expect(serializedEvidence).not.toContain('private@example.com');
    expect(serializedEvidence).not.toContain('must-not-leak');
  });

  it('URL-encodes the exact provider request identity', async () => {
    let capturedUrl = '';
    const fetchImpl: PortOneV2PaymentHttpFetchV1 = async (url) => {
      capturedUrl = url;
      return responseFor(paidPayment({ id: 'pay/id:1' }));
    };
    const adapter = createPortOneV2PaymentVerificationAdapterV1({
      apiSecret: API_SECRET,
      evidenceHmacSecret: EVIDENCE_HMAC_SECRET,
      fetchImpl,
    });

    await adapter.verify({ ...request, providerRequestId: 'pay/id:1' });
    expect(capturedUrl).toBe('https://api.portone.io/payments/pay%2Fid%3A1');
  });

  it('maps provider-owned LIVE and TEST channel type without trusting request origin', async () => {
    const sandbox = await createWithResponse(paidPayment()).adapter.verify(request);
    expect((sandbox.evidence as { environment: string }).environment).toBe('sandbox');

    const production = await createWithResponse(
      paidPayment({ selectedChannel: { type: 'LIVE' } }),
    ).adapter.verify({ ...request, environment: 'production' });
    expect((production.evidence as { environment: string }).environment).toBe('production');
  });

  it.each([
    'READY',
    'PENDING',
    'VIRTUAL_ACCOUNT_ISSUED',
    'PAY_PENDING',
    'FAILED',
    'PARTIAL_CANCELLED',
    'CANCELLED',
    'NEW_PROVIDER_STATE',
  ])('fails closed for non-PAID provider state %s', async (status) => {
    const { adapter } = createWithResponse(paidPayment({ status }));
    await expectAdapterCode(adapter.verify(request), 'INVALID_PAYMENT');
  });

  it('requires exact payment identity and a provider transaction identity', async () => {
    await expectAdapterCode(
      createWithResponse(paidPayment({ id: 'payment-other' })).adapter.verify(request),
      'INVALID_PAYMENT',
    );
    await expectAdapterCode(
      createWithResponse(paidPayment({ transactionId: '' })).adapter.verify(request),
      'INVALID_PAYMENT',
    );
  });

  it('requires provider-owned environment and exactly one authoritative product', async () => {
    await expectAdapterCode(
      createWithResponse(paidPayment({ selectedChannel: { type: 'UNKNOWN' } })).adapter.verify(request),
      'INVALID_PAYMENT',
    );
    await expectAdapterCode(
      createWithResponse(paidPayment({ products: [] })).adapter.verify(request),
      'INVALID_PAYMENT',
    );
    await expectAdapterCode(
      createWithResponse(
        paidPayment({ products: [{ id: 'product-1' }, { id: 'product-2' }] }),
      ).adapter.verify(request),
      'INVALID_PAYMENT',
    );
  });

  it('extracts exact minor-unit money and rejects malformed money facts', async () => {
    const usd = await createWithResponse(
      paidPayment({ currency: 'USD', amount: { total: 600 } }),
    ).adapter.verify({ ...request, expectedCurrency: 'USD', expectedAmountMinor: 600 });
    expect((usd.evidence as { verifiedAmountMinor: number }).verifiedAmountMinor).toBe(600);
    expect((usd.evidence as { verifiedCurrency: string }).verifiedCurrency).toBe('USD');

    await expectAdapterCode(
      createWithResponse(paidPayment({ currency: 'usd' })).adapter.verify(request),
      'INVALID_PAYMENT',
    );
    await expectAdapterCode(
      createWithResponse(paidPayment({ amount: { total: 1.5 } })).adapter.verify(request),
      'INVALID_PAYMENT',
    );
  });

  it('keeps the fingerprint deterministic across different server verification times', async () => {
    const first = await createWithResponse(
      paidPayment(),
      {},
      () => new Date('2026-09-14T05:01:02.003Z'),
    ).adapter.verify(request);
    const second = await createWithResponse(
      paidPayment(),
      {},
      () => new Date('2026-09-14T06:02:03.004Z'),
    ).adapter.verify(request);

    expect((first.evidence as { evidenceFingerprint: string }).evidenceFingerprint).toBe(
      (second.evidence as { evidenceFingerprint: string }).evidenceFingerprint,
    );
    expect((first.evidence as { verifiedAt: string }).verifiedAt).not.toBe(
      (second.evidence as { verifiedAt: string }).verifiedAt,
    );
  });

  it('rejects non-success HTTP responses without reading or exposing provider error bodies', async () => {
    const rawBody = 'provider-secret-error-body';
    const { adapter, response } = createWithResponse({}, {
      status: 401,
      rawText: rawBody,
    });
    const promise = adapter.verify(request);

    await expectAdapterCode(promise, 'HTTP_4XX');
    await expect(promise).rejects.not.toThrow(new RegExp(rawBody, 'u'));
    expect(response.text).not.toHaveBeenCalled();
  });

  it('requires JSON and rejects malformed JSON', async () => {
    await expectAdapterCode(
      createWithResponse({}, { contentType: 'text/html' }).adapter.verify(request),
      'INVALID_CONTENT_TYPE',
    );
    await expectAdapterCode(
      createWithResponse({}, { rawText: '{not-json' }).adapter.verify(request),
      'INVALID_JSON',
    );
  });

  it('rejects declared oversized bodies before reading them', async () => {
    const { adapter, response } = createWithResponse(paidPayment(), {
      contentLength: String(PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1 + 1),
    });

    await expectAdapterCode(adapter.verify(request), 'RESPONSE_TOO_LARGE');
    expect(response.text).not.toHaveBeenCalled();
  });

  it('rejects actual oversized bodies before JSON parsing', async () => {
    const oversized = 'x'.repeat(PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1 + 1);
    await expectAdapterCode(
      createWithResponse({}, { rawText: oversized }).adapter.verify(request),
      'RESPONSE_TOO_LARGE',
    );
  });

  it('fails closed without whole-body fallback when an injected response has no reader', async () => {
    const rawText = JSON.stringify(paidPayment());
    const text = vi.fn(async () => rawText);
    const cancel = vi.fn(async () => undefined);
    const response: PortOneV2PaymentHttpResponseV1 = {
      status: 200,
      headers: {
        get(name: string) {
          return name.toLowerCase() === 'content-type'
            ? 'application/json; charset=utf-8'
            : null;
        },
      },
      body: { cancel },
      text,
    };
    const fetchImpl: PortOneV2PaymentHttpFetchV1 = async () => response;
    const adapter = createPortOneV2PaymentVerificationAdapterV1({
      apiSecret: API_SECRET,
      evidenceHmacSecret: EVIDENCE_HMAC_SECRET,
      fetchImpl,
    });

    await expectAdapterCode(adapter.verify(request), 'NETWORK_FAILURE');
    expect(text).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('times out and aborts provider I/O', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const fetchImpl: PortOneV2PaymentHttpFetchV1 = async (_url, init) => {
        signal = init.signal;
        return new Promise<PortOneV2PaymentHttpResponseV1>(() => undefined);
      };
      const adapter = createPortOneV2PaymentVerificationAdapterV1({
        apiSecret: API_SECRET,
        evidenceHmacSecret: EVIDENCE_HMAC_SECRET,
        fetchImpl,
        timeoutMs: 10,
      });
      const promise = adapter.verify(request);
      const assertion = expectAdapterCode(promise, 'TIMEOUT');

      await vi.advanceTimersByTimeAsync(11);
      await assertion;
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets the provider-neutral execution boundary reject context parity drift', async () => {
    const adapter = createWithResponse(
      paidPayment({ amount: { total: 1001 } }),
    ).adapter;

    await expect(
      executeCommercePaymentVerificationV1({ context: request, adapter }),
    ).rejects.toMatchObject({
      name: 'CommercePaymentVerificationErrorV1',
      code: 'AMOUNT_MISMATCH',
    });
  });

  it('sanitizes API secret configuration failures and never reuses the API secret as evidence key', () => {
    expect(() =>
      createPortOneV2PaymentVerificationAdapterV1({
        apiSecret: '',
        evidenceHmacSecret: EVIDENCE_HMAC_SECRET,
      }),
    ).toThrow(/API credential is invalid/u);

    expect(() =>
      createPortOneV2PaymentVerificationAdapterV1({
        apiSecret: API_SECRET,
        evidenceHmacSecret: 'short',
      }),
    ).toThrow(/fingerprint credential is invalid/u);
  });
});
