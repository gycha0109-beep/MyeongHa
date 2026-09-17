export const PORTONE_V2_BROWSER_PAYMENT_RESULT_NORMALIZER_V1 = Object.freeze({
  active: false,
  publicRoute: null,
  sdkDependency: false,
  sdkInvocationEnabled: false,
  authoritativePaymentState: false,
  entitlementAuthority: false,
  serverVerificationBoundaryRequired: true,
} as const);

export type PortOneV2BrowserPaymentResultNormalizationErrorCodeV1 =
  | 'INVALID_EXPECTED_PAYMENT_ID'
  | 'INVALID_RESPONSE'
  | 'PAYMENT_ID_MISMATCH';

export class PortOneV2BrowserPaymentResultNormalizationErrorV1 extends Error {
  readonly code: PortOneV2BrowserPaymentResultNormalizationErrorCodeV1;

  constructor(code: PortOneV2BrowserPaymentResultNormalizationErrorCodeV1) {
    super(`PortOne V2 browser payment result normalization rejected: ${code}.`);
    this.name = 'PortOneV2BrowserPaymentResultNormalizationErrorV1';
    this.code = code;
  }
}

export interface PortOneV2BrowserPaymentVerificationRequiredV1 {
  readonly kind: 'verification_required';
  readonly paymentId: string;
  readonly sdkAttemptId: string;
  readonly requiresServerVerification: true;
  readonly authoritativePaymentState: false;
}

export interface PortOneV2BrowserPaymentSdkErrorV1 {
  readonly kind: 'sdk_error';
  readonly paymentId: string;
  readonly sdkAttemptId: string;
  readonly code: string;
  readonly message?: string;
  readonly pgCode?: string;
  readonly pgMessage?: string;
  readonly requiresServerVerification: true;
  readonly authoritativePaymentState: false;
}

export type PortOneV2BrowserPaymentNormalizedResultV1 =
  | PortOneV2BrowserPaymentVerificationRequiredV1
  | PortOneV2BrowserPaymentSdkErrorV1;

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireCanonicalString(
  value: unknown,
  code: PortOneV2BrowserPaymentResultNormalizationErrorCodeV1,
): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new PortOneV2BrowserPaymentResultNormalizationErrorV1(code);
  }
  return value;
}

function optionalCanonicalString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new PortOneV2BrowserPaymentResultNormalizationErrorV1('INVALID_RESPONSE');
  }
  return value;
}

/**
 * Normalizes an SDK-shaped PortOne V2 PaymentResponse without treating browser
 * output as payment truth. A response without an error code becomes only a
 * server-verification hint; a response with an error code remains a
 * non-authoritative SDK error. This function imports no SDK and performs no
 * network, persistence, entitlement, or payment-state mutation.
 */
export function normalizePortOneV2BrowserPaymentResultV1(input: {
  readonly expectedPaymentId: string;
  readonly rawResult: unknown;
}): PortOneV2BrowserPaymentNormalizedResultV1 {
  const expectedPaymentId = requireCanonicalString(
    input.expectedPaymentId,
    'INVALID_EXPECTED_PAYMENT_ID',
  );

  if (!isRecord(input.rawResult)) {
    throw new PortOneV2BrowserPaymentResultNormalizationErrorV1('INVALID_RESPONSE');
  }

  if (input.rawResult.transactionType !== 'PAYMENT') {
    throw new PortOneV2BrowserPaymentResultNormalizationErrorV1('INVALID_RESPONSE');
  }

  const paymentId = requireCanonicalString(input.rawResult.paymentId, 'INVALID_RESPONSE');
  const sdkAttemptId = requireCanonicalString(input.rawResult.txId, 'INVALID_RESPONSE');

  if (paymentId !== expectedPaymentId) {
    throw new PortOneV2BrowserPaymentResultNormalizationErrorV1('PAYMENT_ID_MISMATCH');
  }

  const code = optionalCanonicalString(input.rawResult.code);
  const message = optionalCanonicalString(input.rawResult.message);
  const pgCode = optionalCanonicalString(input.rawResult.pgCode);
  const pgMessage = optionalCanonicalString(input.rawResult.pgMessage);

  if (code === undefined) {
    if (message !== undefined || pgCode !== undefined || pgMessage !== undefined) {
      throw new PortOneV2BrowserPaymentResultNormalizationErrorV1('INVALID_RESPONSE');
    }

    return Object.freeze({
      kind: 'verification_required',
      paymentId,
      sdkAttemptId,
      requiresServerVerification: true,
      authoritativePaymentState: false,
    });
  }

  return Object.freeze({
    kind: 'sdk_error',
    paymentId,
    sdkAttemptId,
    code,
    ...(message === undefined ? {} : { message }),
    ...(pgCode === undefined ? {} : { pgCode }),
    ...(pgMessage === undefined ? {} : { pgMessage }),
    requiresServerVerification: true,
    authoritativePaymentState: false,
  });
}
