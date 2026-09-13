import {
  requireVerifiedCommerceEvidenceV2,
  type VerifiedCommerceEnvironmentV2,
  type VerifiedCommerceEvidenceV2,
  type VerifiedCommercePlatformV2,
} from './verified-commerce-evidence.js';

export type CommercePaymentVerificationErrorCodeV1 =
  | 'INVALID_CONTEXT'
  | 'ADAPTER_FAILED'
  | 'INVALID_ADAPTER_RESULT'
  | 'REQUEST_ID_MISMATCH'
  | 'INVALID_EVIDENCE'
  | 'PROVIDER_MISMATCH'
  | 'PLATFORM_MISMATCH'
  | 'ENVIRONMENT_MISMATCH'
  | 'TRANSACTION_MISMATCH'
  | 'OWNER_MISMATCH'
  | 'PRODUCT_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'CURRENCY_MISMATCH';

export class CommercePaymentVerificationErrorV1 extends Error {
  readonly code: CommercePaymentVerificationErrorCodeV1;

  constructor(
    code: CommercePaymentVerificationErrorCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'CommercePaymentVerificationErrorV1';
    this.code = code;
  }
}

export interface CommercePaymentVerificationContextV1 {
  readonly provider: string;
  readonly platform: VerifiedCommercePlatformV2;
  readonly environment: VerifiedCommerceEnvironmentV2;
  readonly providerRequestId: string;
  readonly expectedProviderTransactionId?: string;
  readonly purchaseIntentId: string;
  readonly expectedExternalProductId: string;
  readonly expectedAmountMinor: number;
  readonly expectedCurrency: string;
}

export interface CommercePaymentVerificationAdapterRequestV1
  extends CommercePaymentVerificationContextV1 {}

export interface CommercePaymentVerificationAdapterResultV1 {
  readonly providerRequestId: string;
  readonly evidence: unknown;
}

export interface CommercePaymentVerificationAdapterV1 {
  verify(
    request: CommercePaymentVerificationAdapterRequestV1,
  ): Promise<CommercePaymentVerificationAdapterResultV1>;
}

const CONTEXT_KEYS = new Set([
  'provider',
  'platform',
  'environment',
  'providerRequestId',
  'expectedProviderTransactionId',
  'purchaseIntentId',
  'expectedExternalProductId',
  'expectedAmountMinor',
  'expectedCurrency',
] as const);

const ADAPTER_RESULT_KEYS = new Set(['providerRequestId', 'evidence'] as const);
const CURRENCY = /^[A-Z]{3}$/u;

function fail(
  code: CommercePaymentVerificationErrorCodeV1,
  message: string,
): never {
  throw new CommercePaymentVerificationErrorV1(code, message);
}

function plainRecord(
  value: unknown,
  code: CommercePaymentVerificationErrorCodeV1,
  label: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(code, `${label} must be a plain object.`);
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return fail(code, `${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  code: CommercePaymentVerificationErrorCodeV1,
  label: string,
): void {
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      fail(code, `${label} contains unsupported fields.`);
    }
  }
}

function nonEmptyString(
  record: Record<string, unknown>,
  key: string,
  code: CommercePaymentVerificationErrorCodeV1,
  label: string,
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(code, `${label} ${key} must be a non-empty string.`);
  }
  return value;
}

function optionalNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  code: CommercePaymentVerificationErrorCodeV1,
  label: string,
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return undefined;
  }
  return nonEmptyString(record, key, code, label);
}

function requirePlatform(value: unknown): VerifiedCommercePlatformV2 {
  switch (value) {
    case 'web':
    case 'ios':
    case 'android':
      return value;
    default:
      return fail('INVALID_CONTEXT', 'Commerce verification platform is invalid.');
  }
}

function requireEnvironment(value: unknown): VerifiedCommerceEnvironmentV2 {
  switch (value) {
    case 'sandbox':
    case 'production':
      return value;
    default:
      return fail('INVALID_CONTEXT', 'Commerce verification environment is invalid.');
  }
}

function requireContext(value: unknown): CommercePaymentVerificationContextV1 {
  const record = plainRecord(
    value,
    'INVALID_CONTEXT',
    'Commerce payment verification context',
  );
  rejectUnknownKeys(
    record,
    CONTEXT_KEYS,
    'INVALID_CONTEXT',
    'Commerce payment verification context',
  );

  const provider = nonEmptyString(
    record,
    'provider',
    'INVALID_CONTEXT',
    'Commerce payment verification context',
  );
  const platform = requirePlatform(record.platform);
  const environment = requireEnvironment(record.environment);
  const providerRequestId = nonEmptyString(
    record,
    'providerRequestId',
    'INVALID_CONTEXT',
    'Commerce payment verification context',
  );
  const expectedProviderTransactionId = optionalNonEmptyString(
    record,
    'expectedProviderTransactionId',
    'INVALID_CONTEXT',
    'Commerce payment verification context',
  );
  const purchaseIntentId = nonEmptyString(
    record,
    'purchaseIntentId',
    'INVALID_CONTEXT',
    'Commerce payment verification context',
  );
  const expectedExternalProductId = nonEmptyString(
    record,
    'expectedExternalProductId',
    'INVALID_CONTEXT',
    'Commerce payment verification context',
  );
  const expectedAmountMinor = record.expectedAmountMinor;
  if (
    typeof expectedAmountMinor !== 'number' ||
    !Number.isSafeInteger(expectedAmountMinor) ||
    expectedAmountMinor <= 0
  ) {
    return fail(
      'INVALID_CONTEXT',
      'Commerce payment verification expectedAmountMinor must be a positive safe integer.',
    );
  }
  const expectedCurrency = nonEmptyString(
    record,
    'expectedCurrency',
    'INVALID_CONTEXT',
    'Commerce payment verification context',
  );
  if (!CURRENCY.test(expectedCurrency)) {
    return fail(
      'INVALID_CONTEXT',
      'Commerce payment verification expectedCurrency must be exactly three uppercase ASCII letters.',
    );
  }

  return Object.freeze({
    provider,
    platform,
    environment,
    providerRequestId,
    ...(expectedProviderTransactionId === undefined
      ? {}
      : { expectedProviderTransactionId }),
    purchaseIntentId,
    expectedExternalProductId,
    expectedAmountMinor,
    expectedCurrency,
  });
}

function requireAdapterResult(
  value: unknown,
): CommercePaymentVerificationAdapterResultV1 {
  const record = plainRecord(
    value,
    'INVALID_ADAPTER_RESULT',
    'Commerce payment verification adapter result',
  );
  rejectUnknownKeys(
    record,
    ADAPTER_RESULT_KEYS,
    'INVALID_ADAPTER_RESULT',
    'Commerce payment verification adapter result',
  );
  if (!Object.prototype.hasOwnProperty.call(record, 'evidence')) {
    return fail(
      'INVALID_ADAPTER_RESULT',
      'Commerce payment verification adapter result evidence is required.',
    );
  }
  const providerRequestId = nonEmptyString(
    record,
    'providerRequestId',
    'INVALID_ADAPTER_RESULT',
    'Commerce payment verification adapter result',
  );
  return Object.freeze({ providerRequestId, evidence: record.evidence });
}

function requireEvidence(value: unknown): VerifiedCommerceEvidenceV2 {
  try {
    return requireVerifiedCommerceEvidenceV2(value);
  } catch {
    return fail(
      'INVALID_EVIDENCE',
      'Commerce payment verification adapter returned invalid verified evidence.',
    );
  }
}

export async function executeCommercePaymentVerificationV1(input: {
  readonly context: CommercePaymentVerificationContextV1;
  readonly adapter: CommercePaymentVerificationAdapterV1;
}): Promise<VerifiedCommerceEvidenceV2> {
  const context = requireContext(input.context);
  if (
    typeof input.adapter !== 'object' ||
    input.adapter === null ||
    typeof input.adapter.verify !== 'function'
  ) {
    return fail(
      'INVALID_CONTEXT',
      'Commerce payment verification adapter is invalid.',
    );
  }

  let rawResult: unknown;
  try {
    rawResult = await input.adapter.verify(context);
  } catch {
    return fail(
      'ADAPTER_FAILED',
      'Commerce payment verification adapter failed.',
    );
  }

  const result = requireAdapterResult(rawResult);
  if (result.providerRequestId !== context.providerRequestId) {
    return fail(
      'REQUEST_ID_MISMATCH',
      'Commerce payment verification provider request identity mismatch.',
    );
  }

  const evidence = requireEvidence(result.evidence);
  if (evidence.provider !== context.provider) {
    return fail('PROVIDER_MISMATCH', 'Commerce payment verification provider mismatch.');
  }
  if (evidence.platform !== context.platform) {
    return fail('PLATFORM_MISMATCH', 'Commerce payment verification platform mismatch.');
  }
  if (evidence.environment !== context.environment) {
    return fail(
      'ENVIRONMENT_MISMATCH',
      'Commerce payment verification environment mismatch.',
    );
  }
  if (
    context.expectedProviderTransactionId !== undefined &&
    evidence.externalTransactionId !== context.expectedProviderTransactionId
  ) {
    return fail(
      'TRANSACTION_MISMATCH',
      'Commerce payment verification transaction identity mismatch.',
    );
  }
  if (
    evidence.ownerBinding.kind !== 'purchase_intent' ||
    evidence.ownerBinding.purchaseIntentId !== context.purchaseIntentId
  ) {
    return fail('OWNER_MISMATCH', 'Commerce payment verification owner mismatch.');
  }
  if (evidence.externalProductId !== context.expectedExternalProductId) {
    return fail('PRODUCT_MISMATCH', 'Commerce payment verification product mismatch.');
  }
  if (evidence.verifiedAmountMinor !== context.expectedAmountMinor) {
    return fail('AMOUNT_MISMATCH', 'Commerce payment verification amount mismatch.');
  }
  if (evidence.verifiedCurrency !== context.expectedCurrency) {
    return fail('CURRENCY_MISMATCH', 'Commerce payment verification currency mismatch.');
  }

  return evidence;
}
