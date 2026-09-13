import { ApiCommandError } from './api-error.js';
import type { CommercePaymentVerificationContextV1 } from './commerce-payment-verification-execution.js';
import type { PostgresCommerceInternalExecutionScopeV1 } from './postgres-commerce-internal-execution.js';

export const COMMERCE_PROVIDER_PAYMENT_VERIFICATION_CONTEXT_QUERY_V1 =
  'public.qry_commerce_provider_payment_verification_context_v1' as const;

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;
const CURRENCY = /^[A-Z]{3}$/u;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/u;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

type EnvironmentV1 = CommercePaymentVerificationContextV1['environment'];

interface ProviderVerificationContextRowV1 {
  readonly paymentAttemptId?: unknown;
  readonly resolvedSubjectId?: unknown;
  readonly purchaseIntentId?: unknown;
  readonly provider?: unknown;
  readonly platform?: unknown;
  readonly environment?: unknown;
  readonly providerRequestId?: unknown;
  readonly expectedProviderTransactionId?: unknown;
  readonly expectedExternalProductId?: unknown;
  readonly expectedAmountMinor?: unknown;
  readonly expectedCurrency?: unknown;
}

export interface CommerceProviderPaymentVerificationResolutionV1 {
  readonly paymentAttemptId: string;
  readonly resolvedSubjectId: string;
  readonly verificationContext: CommercePaymentVerificationContextV1;
}

const READ_CONTEXT_SQL = `
select
  payment_attempt_id::text as "paymentAttemptId",
  resolved_subject_id::text as "resolvedSubjectId",
  purchase_intent_id::text as "purchaseIntentId",
  provider,
  platform,
  environment,
  provider_request_id as "providerRequestId",
  expected_provider_transaction_id as "expectedProviderTransactionId",
  expected_external_product_id as "expectedExternalProductId",
  expected_amount_minor::text as "expectedAmountMinor",
  expected_currency as "expectedCurrency"
from public.qry_commerce_provider_payment_verification_context_v1(
  $1::text,
  $2::text,
  $3::text,
  $4::text
)
`.trim();

function requireInputString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', `${name} is required.`);
  }
  return value.trim();
}

function optionalInputString(name: string, value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', `${name} cannot be blank.`);
  }
  return value.trim();
}

function requireEnvironmentInput(value: unknown): EnvironmentV1 {
  if (value === 'sandbox' || value === 'production') return value;
  throw new ApiCommandError(
    'INVALID_REQUEST',
    'environment must be sandbox or production.',
  );
}

function requireStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `Commerce provider payment verification authority returned an invalid ${name}.`,
    );
  }
  return value.trim();
}

function requireStoredUuid(name: string, value: unknown): string {
  const candidate = requireStoredString(name, value).toLowerCase();
  if (!UUID.test(candidate)) {
    throw new Error(
      `Commerce provider payment verification authority returned a malformed ${name}.`,
    );
  }
  return candidate;
}

function requireOptionalStoredString(name: string, value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return requireStoredString(name, value);
}

function requirePlatform(value: unknown): CommercePaymentVerificationContextV1['platform'] {
  switch (value) {
    case 'web':
    case 'ios':
    case 'android':
      return value;
    default:
      throw new Error(
        'Commerce provider payment verification authority returned an invalid platform.',
      );
  }
}

function requireStoredEnvironment(value: unknown): EnvironmentV1 {
  switch (value) {
    case 'sandbox':
    case 'production':
      return value;
    default:
      throw new Error(
        'Commerce provider payment verification authority returned an invalid environment.',
      );
  }
}

function requireExpectedAmountMinor(value: unknown): number {
  if (typeof value !== 'string' || !POSITIVE_INTEGER.test(value)) {
    throw new Error(
      'Commerce provider payment verification authority returned an invalid expected amount.',
    );
  }

  const parsed = BigInt(value);
  if (parsed > MAX_SAFE_INTEGER) {
    throw new Error(
      'Commerce provider payment verification authority returned an unsafe expected amount.',
    );
  }
  return Number(parsed);
}

function postgresConstraint(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : undefined;
}

function mapAuthorityError(error: unknown): never {
  switch (postgresConstraint(error)) {
    case 'qry_commerce_provider_payment_verification_context_unavailable':
    case 'qry_commerce_provider_payment_verification_context_state_ineligible':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Provider payment verification context is unavailable.',
      );
    case 'qry_commerce_provider_payment_verification_context_provider_required':
    case 'qry_commerce_provider_payment_verification_context_environment_invalid':
    case 'qry_commerce_provider_payment_verification_context_request_invalid':
    case 'qry_commerce_provider_payment_verification_context_transaction_invalid':
    case 'qry_commerce_provider_payment_verification_context_identity_required':
      throw new ApiCommandError(
        'INVALID_REQUEST',
        'Provider payment verification identifiers are invalid.',
      );
    default:
      throw error;
  }
}

function projectResolution(input: {
  readonly rows: readonly ProviderVerificationContextRowV1[];
  readonly provider: string;
  readonly environment: EnvironmentV1;
  readonly providerRequestId?: string;
  readonly providerTransactionId?: string;
}): CommerceProviderPaymentVerificationResolutionV1 {
  const row = input.rows[0];
  if (input.rows.length !== 1 || row === undefined) {
    throw new Error(
      'Commerce provider payment verification authority did not return exactly one context row.',
    );
  }

  const paymentAttemptId = requireStoredUuid('payment-attempt identity', row.paymentAttemptId);
  const resolvedSubjectId = requireStoredUuid('resolved subject identity', row.resolvedSubjectId);
  const purchaseIntentId = requireStoredUuid('Purchase Intent identity', row.purchaseIntentId);
  const provider = requireStoredString('provider', row.provider);
  const environment = requireStoredEnvironment(row.environment);
  const providerRequestId = requireStoredString(
    'provider request identity',
    row.providerRequestId,
  );
  const expectedProviderTransactionId = requireOptionalStoredString(
    'expected provider transaction identity',
    row.expectedProviderTransactionId,
  );

  if (provider !== input.provider || environment !== input.environment) {
    throw new Error(
      'Commerce provider payment verification authority returned different provider identity.',
    );
  }
  if (
    input.providerRequestId !== undefined &&
    providerRequestId !== input.providerRequestId
  ) {
    throw new Error(
      'Commerce provider payment verification authority returned a different provider request identity.',
    );
  }
  if (
    input.providerTransactionId !== undefined &&
    expectedProviderTransactionId !== input.providerTransactionId
  ) {
    throw new Error(
      'Commerce provider payment verification authority returned a different provider transaction identity.',
    );
  }

  const expectedCurrency = requireStoredString('expected currency', row.expectedCurrency);
  if (!CURRENCY.test(expectedCurrency)) {
    throw new Error(
      'Commerce provider payment verification authority returned a malformed expected currency.',
    );
  }

  return Object.freeze({
    paymentAttemptId,
    resolvedSubjectId,
    verificationContext: Object.freeze({
      provider,
      platform: requirePlatform(row.platform),
      environment,
      providerRequestId,
      ...(expectedProviderTransactionId === undefined
        ? {}
        : { expectedProviderTransactionId }),
      purchaseIntentId,
      expectedExternalProductId: requireStoredString(
        'expected external product identity',
        row.expectedExternalProductId,
      ),
      expectedAmountMinor: requireExpectedAmountMinor(row.expectedAmountMinor),
      expectedCurrency,
    }),
  });
}

/**
 * Resolves provider-originated Commerce handoff identity to existing verification
 * authority. The caller never supplies a subject id; subject lineage is returned only
 * after DB resolution and is not injected into PostgreSQL subject context.
 */
export async function loadCommerceProviderPaymentVerificationContextV1(input: {
  readonly scope: PostgresCommerceInternalExecutionScopeV1;
  readonly provider: unknown;
  readonly environment: unknown;
  readonly providerRequestId?: unknown;
  readonly providerTransactionId?: unknown;
}): Promise<CommerceProviderPaymentVerificationResolutionV1> {
  const provider = requireInputString('provider', input.provider);
  const environment = requireEnvironmentInput(input.environment);
  const providerRequestId = optionalInputString(
    'providerRequestId',
    input.providerRequestId,
  );
  const providerTransactionId = optionalInputString(
    'providerTransactionId',
    input.providerTransactionId,
  );

  if (providerRequestId === undefined && providerTransactionId === undefined) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'providerRequestId or providerTransactionId is required.',
    );
  }

  try {
    const result = await input.scope.client.query<ProviderVerificationContextRowV1>(
      READ_CONTEXT_SQL,
      [
        provider,
        environment,
        providerRequestId ?? null,
        providerTransactionId ?? null,
      ],
    );
    return projectResolution({
      rows: result.rows,
      provider,
      environment,
      ...(providerRequestId === undefined ? {} : { providerRequestId }),
      ...(providerTransactionId === undefined ? {} : { providerTransactionId }),
    });
  } catch (error) {
    return mapAuthorityError(error);
  }
}
