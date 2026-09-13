import { ApiCommandError } from './api-error.js';
import type { CommercePaymentVerificationContextV1 } from './commerce-payment-verification-execution.js';
import type { PostgresSubjectExecutionScopeV1 } from './postgres-subject-execution.js';

export const COMMERCE_PAYMENT_VERIFICATION_CONTEXT_QUERY_V1 =
  'public.qry_commerce_payment_verification_context_v1' as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CURRENCY = /^[A-Z]{3}$/u;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/u;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

interface VerificationContextRowV1 {
  readonly paymentAttemptId?: unknown;
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

const READ_CONTEXT_SQL = `
select
  payment_attempt_id::text as "paymentAttemptId",
  purchase_intent_id::text as "purchaseIntentId",
  provider,
  platform,
  environment,
  provider_request_id as "providerRequestId",
  expected_provider_transaction_id as "expectedProviderTransactionId",
  expected_external_product_id as "expectedExternalProductId",
  expected_amount_minor::text as "expectedAmountMinor",
  expected_currency as "expectedCurrency"
from public.qry_commerce_payment_verification_context_v1($1::uuid, $2::uuid)
`.trim();

function requirePaymentAttemptId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value.trim())) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'paymentAttemptId must be a canonical UUID.',
    );
  }
  return value.trim().toLowerCase();
}

function requireStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Commerce payment verification authority returned an invalid ${name}.`);
  }
  return value.trim();
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
      throw new Error('Commerce payment verification authority returned an invalid platform.');
  }
}

function requireEnvironment(
  value: unknown,
): CommercePaymentVerificationContextV1['environment'] {
  switch (value) {
    case 'sandbox':
    case 'production':
      return value;
    default:
      throw new Error('Commerce payment verification authority returned an invalid environment.');
  }
}

function requireExpectedAmountMinor(value: unknown): number {
  if (typeof value !== 'string' || !POSITIVE_INTEGER.test(value)) {
    throw new Error(
      'Commerce payment verification authority returned an invalid expected amount.',
    );
  }

  const parsed = BigInt(value);
  if (parsed > MAX_SAFE_INTEGER) {
    throw new Error(
      'Commerce payment verification authority returned an unsafe expected amount.',
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
    case 'qry_commerce_payment_verification_context_unavailable':
    case 'qry_commerce_payment_verification_context_state_ineligible':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Payment verification context is unavailable for the current subject.',
      );
    case 'qry_commerce_payment_verification_context_ids_required':
      throw new ApiCommandError('INVALID_REQUEST', 'Payment verification identifiers are required.');
    default:
      throw error;
  }
}

function projectContext(
  requestedPaymentAttemptId: string,
  rows: readonly VerificationContextRowV1[],
): CommercePaymentVerificationContextV1 {
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new Error(
      'Commerce payment verification authority did not return exactly one context row.',
    );
  }

  const paymentAttemptId = requireStoredString('payment-attempt identity', row.paymentAttemptId);
  if (paymentAttemptId.toLowerCase() !== requestedPaymentAttemptId) {
    throw new Error(
      'Commerce payment verification authority returned a different payment-attempt identity.',
    );
  }

  const expectedCurrency = requireStoredString('expected currency', row.expectedCurrency);
  if (!CURRENCY.test(expectedCurrency)) {
    throw new Error(
      'Commerce payment verification authority returned a malformed expected currency.',
    );
  }

  const expectedProviderTransactionId = requireOptionalStoredString(
    'expected provider transaction identity',
    row.expectedProviderTransactionId,
  );

  return Object.freeze({
    provider: requireStoredString('provider', row.provider),
    platform: requirePlatform(row.platform),
    environment: requireEnvironment(row.environment),
    providerRequestId: requireStoredString('provider request identity', row.providerRequestId),
    ...(expectedProviderTransactionId === undefined
      ? {}
      : { expectedProviderTransactionId }),
    purchaseIntentId: requireStoredString('Purchase Intent identity', row.purchaseIntentId),
    expectedExternalProductId: requireStoredString(
      'expected external product identity',
      row.expectedExternalProductId,
    ),
    expectedAmountMinor: requireExpectedAmountMinor(row.expectedAmountMinor),
    expectedCurrency,
  });
}

/**
 * Composes one provider-neutral verification context from persisted Commerce authority
 * inside an already resolved ordinary-subject PostgreSQL transaction.
 *
 * This boundary deliberately does not support provider webhooks/reconciliation. Those
 * callers need a separately governed subjectless execution identity rather than
 * impersonating an arbitrary customer subject.
 */
export async function loadCommercePaymentVerificationContextV1(input: {
  readonly scope: PostgresSubjectExecutionScopeV1;
  readonly paymentAttemptId: unknown;
}): Promise<CommercePaymentVerificationContextV1> {
  const paymentAttemptId = requirePaymentAttemptId(input.paymentAttemptId);

  try {
    const result = await input.scope.client.query<VerificationContextRowV1>(
      READ_CONTEXT_SQL,
      [input.scope.resolvedSubject.subjectId, paymentAttemptId],
    );
    return projectContext(paymentAttemptId, result.rows);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
