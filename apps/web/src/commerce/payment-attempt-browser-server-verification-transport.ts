export const PAYMENT_ATTEMPT_SERVER_VERIFICATION_HTTP_CONTRACT_VERSION_V1 =
  'v0.9' as const;

export const PAYMENT_ATTEMPT_BROWSER_SERVER_VERIFICATION_TRANSPORT_V1 =
  Object.freeze({
    active: false,
    publicRoute: null,
    globalFetchDependency: false,
    sdkDependency: false,
    sdkResultAuthority: false,
    entitlementAuthority: false,
    serverVerificationRequired: true,
  } as const);

export type PaymentAttemptBrowserServerVerificationTransportErrorCodeV1 =
  | 'INVALID_REQUEST'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'IDEMPOTENCY_CONFLICT'
  | 'CAPABILITY_UNAVAILABLE'
  | 'UPSTREAM_FAILURE'
  | 'TRANSPORT_FAILURE'
  | 'INVALID_RESPONSE';

export class PaymentAttemptBrowserServerVerificationTransportErrorV1 extends Error {
  override readonly name =
    'PaymentAttemptBrowserServerVerificationTransportErrorV1';
  readonly code: PaymentAttemptBrowserServerVerificationTransportErrorCodeV1;
  readonly httpStatus: number | null;
  readonly retryable: boolean;

  constructor(input: {
    readonly code: PaymentAttemptBrowserServerVerificationTransportErrorCodeV1;
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

export interface PaymentAttemptServerVerificationFetchRequestV1 {
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface PaymentAttemptServerVerificationFetchResponseV1 {
  readonly status: number;
  text(): Promise<string>;
}

/**
 * Authentication and route binding are deliberately injected. The server HTTP
 * boundary is still unmounted, so this transport does not invent a URL and does
 * not depend on global fetch.
 */
export interface PaymentAttemptServerVerificationFetchPortV1 {
  fetch(
    request: PaymentAttemptServerVerificationFetchRequestV1,
  ): Promise<PaymentAttemptServerVerificationFetchResponseV1>;
}

export interface PaymentAttemptServerVerificationReceiptV1 {
  readonly paymentAttemptId: string;
  readonly receiptId: string;
  readonly replayed: boolean;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function fail(input: {
  readonly code: PaymentAttemptBrowserServerVerificationTransportErrorCodeV1;
  readonly message: string;
  readonly httpStatus?: number;
  readonly retryable?: boolean;
}): never {
  throw new PaymentAttemptBrowserServerVerificationTransportErrorV1(input);
}

function invalidResponse(message: string, httpStatus?: number): never {
  return fail({
    code: 'INVALID_RESPONSE',
    message,
    ...(httpStatus === undefined ? {} : { httpStatus }),
  });
}

function requirePaymentAttemptId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value.trim())) {
    return fail({
      code: 'INVALID_REQUEST',
      message:
        'Payment Attempt browser server verification paymentAttemptId is invalid.',
    });
  }
  return value.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function requireCanonicalString(
  name: string,
  value: unknown,
  httpStatus?: number,
): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    return invalidResponse(
      `Payment Attempt browser server verification response ${name} is invalid.`,
      httpStatus,
    );
  }
  return value;
}

function requireUuid(
  name: string,
  value: unknown,
  httpStatus?: number,
): string {
  const candidate = requireCanonicalString(name, value, httpStatus);
  if (!UUID.test(candidate)) {
    return invalidResponse(
      `Payment Attempt browser server verification response ${name} is invalid.`,
      httpStatus,
    );
  }
  return candidate.toLowerCase();
}

function requireMetaV1(
  value: unknown,
  expectedKeys: readonly string[],
  httpStatus?: number,
): Record<string, unknown> {
  if (!isRecord(value) || !hasExactKeys(value, expectedKeys)) {
    return invalidResponse(
      'Payment Attempt browser server verification metadata is invalid.',
      httpStatus,
    );
  }
  if (
    value.apiContractVersion !==
    PAYMENT_ATTEMPT_SERVER_VERIFICATION_HTTP_CONTRACT_VERSION_V1
  ) {
    return invalidResponse(
      'Payment Attempt browser server verification API contract version is incompatible.',
      httpStatus,
    );
  }
  requireCanonicalString('requestId', value.requestId, httpStatus);
  return value;
}

function parseSuccessEnvelope(
  value: unknown,
  expectedPaymentAttemptId: string,
): PaymentAttemptServerVerificationReceiptV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['ok', 'data', 'meta']) ||
    value.ok !== true
  ) {
    return invalidResponse(
      'Payment Attempt browser server verification success envelope is invalid.',
      200,
    );
  }
  if (
    !isRecord(value.data) ||
    !hasExactKeys(value.data, ['paymentAttemptId', 'receiptId', 'replayed'])
  ) {
    return invalidResponse(
      'Payment Attempt browser server verification success data is invalid.',
      200,
    );
  }

  const meta = requireMetaV1(
    value.meta,
    ['apiContractVersion', 'requestId', 'serverTime'],
    200,
  );
  const serverTime = requireCanonicalString('serverTime', meta.serverTime, 200);
  if (!Number.isFinite(Date.parse(serverTime))) {
    return invalidResponse(
      'Payment Attempt browser server verification response serverTime is invalid.',
      200,
    );
  }

  const paymentAttemptId = requireUuid(
    'paymentAttemptId',
    value.data.paymentAttemptId,
    200,
  );
  if (paymentAttemptId !== expectedPaymentAttemptId) {
    return invalidResponse(
      'Payment Attempt browser server verification paymentAttemptId does not match the request.',
      200,
    );
  }

  const receiptId = requireUuid('receiptId', value.data.receiptId, 200);
  if (typeof value.data.replayed !== 'boolean') {
    return invalidResponse(
      'Payment Attempt browser server verification response replayed is invalid.',
      200,
    );
  }

  return Object.freeze({
    paymentAttemptId: expectedPaymentAttemptId,
    receiptId,
    replayed: value.data.replayed,
  });
}

function parseCapabilityUnavailableEnvelope(
  value: unknown,
): never {
  const httpStatus = 503;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['ok', 'error', 'meta']) ||
    value.ok !== false
  ) {
    return invalidResponse(
      'Payment Attempt browser server verification failure envelope is invalid.',
      httpStatus,
    );
  }
  if (
    !isRecord(value.error) ||
    !hasExactKeys(value.error, ['code', 'messageKey', 'retryable']) ||
    value.error.code !== 'CAPABILITY_UNAVAILABLE' ||
    value.error.messageKey !== 'payment_attempt.verification_unavailable' ||
    typeof value.error.retryable !== 'boolean'
  ) {
    return invalidResponse(
      'Payment Attempt browser server verification failure data is invalid.',
      httpStatus,
    );
  }

  requireMetaV1(
    value.meta,
    ['apiContractVersion', 'requestId'],
    httpStatus,
  );

  return fail({
    code: 'CAPABILITY_UNAVAILABLE',
    message: 'Payment Attempt server verification capability is unavailable.',
    httpStatus,
    retryable: value.error.retryable,
  });
}

function normalizeHttpFailure(status: number): never {
  switch (status) {
    case 400:
      return fail({
        code: 'INVALID_REQUEST',
        message: 'Payment Attempt server verification request was rejected.',
        httpStatus: status,
      });
    case 401:
      return fail({
        code: 'AUTH_REQUIRED',
        message: 'Payment Attempt server verification authentication is required.',
        httpStatus: status,
      });
    case 403:
      return fail({
        code: 'FORBIDDEN',
        message: 'Payment Attempt server verification is forbidden.',
        httpStatus: status,
      });
    case 404:
      return fail({
        code: 'NOT_FOUND',
        message: 'Payment Attempt server verification target was not found.',
        httpStatus: status,
      });
    case 409:
      return fail({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Payment Attempt server verification conflicted with canonical state.',
        httpStatus: status,
      });
    default:
      if (status >= 500 && status <= 599) {
        return fail({
          code: 'UPSTREAM_FAILURE',
          message: 'Payment Attempt server verification upstream failed.',
          httpStatus: status,
          retryable: true,
        });
      }
      return invalidResponse(
        'Payment Attempt server verification returned an unexpected HTTP status.',
        status,
      );
  }
}

async function readResponseBody(
  response: PaymentAttemptServerVerificationFetchResponseV1,
): Promise<unknown> {
  let rawBody: unknown;
  try {
    rawBody = await response.text();
  } catch {
    return fail({
      code: 'TRANSPORT_FAILURE',
      message:
        'Payment Attempt server verification response body could not be read.',
      retryable: true,
    });
  }
  if (typeof rawBody !== 'string') {
    return invalidResponse(
      'Payment Attempt server verification response body is invalid.',
    );
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return invalidResponse(
      'Payment Attempt server verification response JSON is malformed.',
    );
  }
}

export async function fetchPaymentAttemptServerVerificationV1(input: {
  readonly paymentAttemptId: unknown;
  readonly fetchPort: PaymentAttemptServerVerificationFetchPortV1;
}): Promise<PaymentAttemptServerVerificationReceiptV1> {
  const paymentAttemptId = requirePaymentAttemptId(input.paymentAttemptId);
  const request: PaymentAttemptServerVerificationFetchRequestV1 = Object.freeze({
    method: 'POST',
    headers: Object.freeze({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ paymentAttemptId }),
  });

  let response: PaymentAttemptServerVerificationFetchResponseV1;
  try {
    response = await input.fetchPort.fetch(request);
  } catch {
    return fail({
      code: 'TRANSPORT_FAILURE',
      message: 'Payment Attempt server verification transport failed.',
      retryable: true,
    });
  }

  let status: unknown;
  try {
    status = response.status;
  } catch {
    return fail({
      code: 'TRANSPORT_FAILURE',
      message: 'Payment Attempt server verification transport failed.',
      retryable: true,
    });
  }

  if (typeof status !== 'number' || !Number.isSafeInteger(status)) {
    return invalidResponse(
      'Payment Attempt server verification response status is invalid.',
    );
  }

  if (status === 200) {
    return parseSuccessEnvelope(
      await readResponseBody(response),
      paymentAttemptId,
    );
  }

  if (status === 503) {
    return parseCapabilityUnavailableEnvelope(
      await readResponseBody(response),
    );
  }

  return normalizeHttpFailure(status);
}
