import { ApiCommandError } from './api-error.js';
import type { PostgresSubjectExecutionScopeV1 } from './postgres-subject-execution.js';

export const PAYMENT_ATTEMPT_HANDOFF_CONTEXT_QUERY_V1 =
  'public.qry_commerce_payment_attempt_handoff_context_v1' as const;

export type PaymentAttemptHandoffEnvironmentV1 = 'sandbox' | 'production';
export type PaymentAttemptHandoffStatusV1 = 'created';

export interface PaymentAttemptHandoffContextV1 {
  readonly paymentAttemptId: string;
  readonly provider: string;
  readonly environment: PaymentAttemptHandoffEnvironmentV1;
  /** Canonical PSP request identity. For PortOne V2 this is the `paymentId`. */
  readonly providerRequestId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: PaymentAttemptHandoffStatusV1;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CURRENCY = /^[A-Z]{3}$/u;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/u;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

type HandoffContextRowV1 = Readonly<{
  paymentAttemptId?: unknown;
  provider?: unknown;
  environment?: unknown;
  providerRequestId?: unknown;
  expectedAmountMinor?: unknown;
  expectedCurrency?: unknown;
  status?: unknown;
}>;

const READ_CONTEXT_SQL = `
select
  payment_attempt_id::text as "paymentAttemptId",
  provider,
  environment,
  provider_request_id as "providerRequestId",
  expected_amount_minor::text as "expectedAmountMinor",
  expected_currency as "expectedCurrency",
  status
from public.qry_commerce_payment_attempt_handoff_context_v1($1::uuid, $2::uuid)
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
    throw new Error(`Payment Attempt handoff authority returned an invalid ${name}.`);
  }
  return value.trim();
}

function requireEnvironment(value: unknown): PaymentAttemptHandoffEnvironmentV1 {
  if (value === 'sandbox' || value === 'production') return value;
  throw new Error('Payment Attempt handoff authority returned an invalid environment.');
}

function requireAmountMinor(value: unknown): number {
  if (typeof value !== 'string' || !POSITIVE_INTEGER.test(value)) {
    throw new Error('Payment Attempt handoff authority returned an invalid amount.');
  }
  const parsed = BigInt(value);
  if (parsed > MAX_SAFE_INTEGER) {
    throw new Error('Payment Attempt handoff authority returned an unsafe amount.');
  }
  return Number(parsed);
}

function requireCurrency(value: unknown): string {
  const currency = requireStoredString('currency', value);
  if (!CURRENCY.test(currency)) {
    throw new Error('Payment Attempt handoff authority returned a malformed currency.');
  }
  return currency;
}

function requireStatus(value: unknown): PaymentAttemptHandoffStatusV1 {
  if (value !== 'created') {
    throw new Error('Payment Attempt handoff authority returned an ineligible status.');
  }
  return value;
}

function postgresConstraint(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : undefined;
}

function mapAuthorityError(error: unknown): never {
  switch (postgresConstraint(error)) {
    case 'qry_commerce_payment_attempt_handoff_context_unavailable':
    case 'qry_commerce_payment_attempt_handoff_context_state_ineligible':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Payment Attempt handoff context is unavailable for the current subject.',
      );
    case 'qry_commerce_payment_attempt_handoff_context_ids_required':
      throw new ApiCommandError('INVALID_REQUEST', 'Payment Attempt identity is required.');
    default:
      throw error;
  }
}

function projectContext(
  requestedPaymentAttemptId: string,
  rows: readonly HandoffContextRowV1[],
): PaymentAttemptHandoffContextV1 {
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new Error('Payment Attempt handoff authority did not return exactly one context row.');
  }

  const paymentAttemptId = requireStoredString('payment-attempt identity', row.paymentAttemptId);
  if (paymentAttemptId.toLowerCase() !== requestedPaymentAttemptId) {
    throw new Error('Payment Attempt handoff authority returned a different payment-attempt identity.');
  }

  return Object.freeze({
    paymentAttemptId: requestedPaymentAttemptId,
    provider: requireStoredString('provider', row.provider),
    environment: requireEnvironment(row.environment),
    providerRequestId: requireStoredString('provider request identity', row.providerRequestId),
    amountMinor: requireAmountMinor(row.expectedAmountMinor),
    currency: requireCurrency(row.expectedCurrency),
    status: requireStatus(row.status),
  });
}

/**
 * Reads one owned pre-browser Payment Attempt handoff context under an already bound
 * transaction-local canonical Subject. It performs no PSP I/O and mutates no state.
 */
export async function loadPaymentAttemptHandoffContextV1(input: {
  readonly scope: PostgresSubjectExecutionScopeV1;
  readonly paymentAttemptId: unknown;
}): Promise<PaymentAttemptHandoffContextV1> {
  const paymentAttemptId = requirePaymentAttemptId(input.paymentAttemptId);

  try {
    const result = await input.scope.client.query<HandoffContextRowV1>(
      READ_CONTEXT_SQL,
      [input.scope.resolvedSubject.subjectId, paymentAttemptId],
    );
    return projectContext(paymentAttemptId, result.rows);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
