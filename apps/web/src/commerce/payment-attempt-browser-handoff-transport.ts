import {
  type PaymentAttemptBrowserHandoffContextV1,
  type PortOneV2ProviderSelectorV1,
} from './portone-v2-browser-handoff.js';
import {
  preparePortOneV2BrowserCheckoutV1,
} from './portone-v2-browser-checkout-preparation.js';
import type {
  PortOneV2BrowserPaymentRequestV1,
  PortOneV2DeferredActivationFieldsV1,
} from './portone-v2-browser-request-composer.js';

export const PAYMENT_ATTEMPT_HANDOFF_HTTP_CONTRACT_VERSION_V1 = 'v0.9' as const;

export const PAYMENT_ATTEMPT_BROWSER_HANDOFF_TRANSPORT_FOUNDATION_V1 = Object.freeze({
  active: false,
  publicRoute: null,
  globalFetchDependency: false,
  sdkDependency: false,
  sdkInvocationEnabled: false,
  liveCheckoutEnabled: false,
} as const);

export type PaymentAttemptBrowserHandoffTransportErrorCodeV1 =
  | 'INVALID_REQUEST'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'UPSTREAM_FAILURE'
  | 'TRANSPORT_FAILURE'
  | 'INVALID_RESPONSE';

export class PaymentAttemptBrowserHandoffTransportErrorV1 extends Error {
  override readonly name = 'PaymentAttemptBrowserHandoffTransportErrorV1';
  readonly code: PaymentAttemptBrowserHandoffTransportErrorCodeV1;
  readonly httpStatus: number | null;
  readonly retryable: boolean;

  constructor(input: {
    readonly code: PaymentAttemptBrowserHandoffTransportErrorCodeV1;
    readonly message: string;
    readonly httpStatus?: number;
    readonly retryable?: boolean;
  }) {
    super(input.message);
    this.code = input.code;
    this.httpStatus = input.httpStatus ?? null;
    this.retryable = input.retryable ?? false;
  }
}

export interface PaymentAttemptHandoffFetchRequestV1 {
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface PaymentAttemptHandoffFetchResponseV1 {
  readonly status: number;
  text(): Promise<string>;
}

/**
 * Route/authentication binding is deliberately injected. The current server
 * handoff boundary remains unmounted, so this foundation neither invents a
 * public URL nor depends on global fetch.
 */
export interface PaymentAttemptHandoffFetchPortV1 {
  fetch(request: PaymentAttemptHandoffFetchRequestV1): Promise<PaymentAttemptHandoffFetchResponseV1>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CURRENCY = /^[A-Z]{3}$/u;

function invalidResponse(message: string): never {
  throw new PaymentAttemptBrowserHandoffTransportErrorV1({
    code: 'INVALID_RESPONSE',
    message,
  });
}

function requirePaymentAttemptId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value.trim())) {
    throw new PaymentAttemptBrowserHandoffTransportErrorV1({
      code: 'INVALID_REQUEST',
      message: 'Payment Attempt browser handoff paymentAttemptId is invalid.',
    });
  }
  return value.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function requireCanonicalString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    return invalidResponse(`Payment Attempt browser handoff response ${name} is invalid.`);
  }
  return value;
}

function requireEnvironment(value: unknown): 'sandbox' | 'production' {
  if (value === 'sandbox' || value === 'production') return value;
  return invalidResponse('Payment Attempt browser handoff response environment is invalid.');
}

function requireAmountMinor(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return invalidResponse('Payment Attempt browser handoff response amountMinor is invalid.');
  }
  return value;
}

function requireCurrency(value: unknown): string {
  const currency = requireCanonicalString('currency', value);
  if (!CURRENCY.test(currency)) {
    return invalidResponse('Payment Attempt browser handoff response currency is invalid.');
  }
  return currency;
}

function requireStatus(value: unknown): 'created' {
  if (value !== 'created') {
    return invalidResponse('Payment Attempt browser handoff response status is invalid.');
  }
  return value;
}

function parseSuccessEnvelope(
  value: unknown,
  expectedPaymentAttemptId: string,
): PaymentAttemptBrowserHandoffContextV1 {
  if (!isRecord(value) || !hasExactKeys(value, ['ok', 'data', 'meta']) || value.ok !== true) {
    return invalidResponse('Payment Attempt browser handoff success envelope is invalid.');
  }
  if (!isRecord(value.data) || !hasExactKeys(value.data, [
    'paymentAttemptId',
    'provider',
    'environment',
    'providerRequestId',
    'amountMinor',
    'currency',
    'status',
  ])) {
    return invalidResponse('Payment Attempt browser handoff success data is invalid.');
  }
  if (!isRecord(value.meta) || !hasExactKeys(value.meta, [
    'apiContractVersion',
    'requestId',
    'serverTime',
  ])) {
    return invalidResponse('Payment Attempt browser handoff success metadata is invalid.');
  }
  if (value.meta.apiContractVersion !== PAYMENT_ATTEMPT_HANDOFF_HTTP_CONTRACT_VERSION_V1) {
    return invalidResponse('Payment Attempt browser handoff API contract version is incompatible.');
  }

  const paymentAttemptId = requireCanonicalString('paymentAttemptId', value.data.paymentAttemptId);
  if (!UUID.test(paymentAttemptId) || paymentAttemptId.toLowerCase() !== expectedPaymentAttemptId) {
    return invalidResponse('Payment Attempt browser handoff response paymentAttemptId does not match the request.');
  }

  requireCanonicalString('requestId', value.meta.requestId);
  const serverTime = requireCanonicalString('serverTime', value.meta.serverTime);
  if (!Number.isFinite(Date.parse(serverTime))) {
    return invalidResponse('Payment Attempt browser handoff response serverTime is invalid.');
  }

  return Object.freeze({
    paymentAttemptId: expectedPaymentAttemptId,
    provider: requireCanonicalString('provider', value.data.provider),
    environment: requireEnvironment(value.data.environment),
    providerRequestId: requireCanonicalString('providerRequestId', value.data.providerRequestId),
    amountMinor: requireAmountMinor(value.data.amountMinor),
    currency: requireCurrency(value.data.currency),
    status: requireStatus(value.data.status),
  });
}

function normalizeHttpFailure(status: number): never {
  switch (status) {
    case 400:
      throw new PaymentAttemptBrowserHandoffTransportErrorV1({
        code: 'INVALID_REQUEST',
        message: 'Payment Attempt browser handoff request was rejected.',
        httpStatus: status,
      });
    case 401:
      throw new PaymentAttemptBrowserHandoffTransportErrorV1({
        code: 'AUTH_REQUIRED',
        message: 'Payment Attempt browser handoff authentication is required.',
        httpStatus: status,
      });
    case 403:
      throw new PaymentAttemptBrowserHandoffTransportErrorV1({
        code: 'FORBIDDEN',
        message: 'Payment Attempt browser handoff is forbidden.',
        httpStatus: status,
      });
    case 404:
      throw new PaymentAttemptBrowserHandoffTransportErrorV1({
        code: 'NOT_FOUND',
        message: 'Payment Attempt browser handoff context was not found.',
        httpStatus: status,
      });
    default:
      if (status >= 500 && status <= 599) {
        throw new PaymentAttemptBrowserHandoffTransportErrorV1({
          code: 'UPSTREAM_FAILURE',
          message: 'Payment Attempt browser handoff server failed.',
          httpStatus: status,
          retryable: true,
        });
      }
      throw new PaymentAttemptBrowserHandoffTransportErrorV1({
        code: 'INVALID_RESPONSE',
        message: 'Payment Attempt browser handoff returned an unexpected HTTP status.',
        httpStatus: status,
      });
  }
}

export async function fetchPaymentAttemptBrowserHandoffContextV1(input: {
  readonly paymentAttemptId: unknown;
  readonly fetchPort: PaymentAttemptHandoffFetchPortV1;
}): Promise<PaymentAttemptBrowserHandoffContextV1> {
  const paymentAttemptId = requirePaymentAttemptId(input.paymentAttemptId);
  const request: PaymentAttemptHandoffFetchRequestV1 = Object.freeze({
    method: 'POST',
    headers: Object.freeze({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ paymentAttemptId }),
  });

  let response: PaymentAttemptHandoffFetchResponseV1;
  try {
    response = await input.fetchPort.fetch(request);
  } catch {
    throw new PaymentAttemptBrowserHandoffTransportErrorV1({
      code: 'TRANSPORT_FAILURE',
      message: 'Payment Attempt browser handoff transport failed.',
      retryable: true,
    });
  }

  let status: unknown;
  try {
    status = response.status;
  } catch {
    throw new PaymentAttemptBrowserHandoffTransportErrorV1({
      code: 'TRANSPORT_FAILURE',
      message: 'Payment Attempt browser handoff transport failed.',
      retryable: true,
    });
  }
  if (typeof status !== 'number' || !Number.isSafeInteger(status)) {
    return invalidResponse('Payment Attempt browser handoff response status is invalid.');
  }
  if (status !== 200) normalizeHttpFailure(status);

  let rawBody: unknown;
  try {
    rawBody = await response.text();
  } catch {
    throw new PaymentAttemptBrowserHandoffTransportErrorV1({
      code: 'TRANSPORT_FAILURE',
      message: 'Payment Attempt browser handoff response body could not be read.',
      retryable: true,
    });
  }
  if (typeof rawBody !== 'string') {
    return invalidResponse('Payment Attempt browser handoff response body is invalid.');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBody) as unknown;
  } catch {
    return invalidResponse('Payment Attempt browser handoff response JSON is malformed.');
  }

  return parseSuccessEnvelope(decoded, paymentAttemptId);
}

/**
 * Loads the Subject-owned handoff context through the injected transport and
 * then delegates to the existing inert #949 preparation pipeline. No browser
 * SDK execution capability is accepted or invoked here.
 */
export async function preparePortOneV2BrowserCheckoutFromPaymentAttemptV1(input: {
  readonly paymentAttemptId: unknown;
  readonly fetchPort: PaymentAttemptHandoffFetchPortV1;
  readonly providerSelector: PortOneV2ProviderSelectorV1;
  readonly activation: PortOneV2DeferredActivationFieldsV1;
}): Promise<PortOneV2BrowserPaymentRequestV1> {
  const context = await fetchPaymentAttemptBrowserHandoffContextV1({
    paymentAttemptId: input.paymentAttemptId,
    fetchPort: input.fetchPort,
  });

  return preparePortOneV2BrowserCheckoutV1({
    context,
    providerSelector: input.providerSelector,
    activation: input.activation,
  });
}
