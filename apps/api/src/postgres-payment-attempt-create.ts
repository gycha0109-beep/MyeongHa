import {
  PAYMENT_ATTEMPT_CREATE_AUTHORITY_BINDING_V1,
  PaymentAttemptCreateAuthorityPortErrorV1,
  type PaymentAttemptCreateAuthorityPortV1,
  type PaymentAttemptCreateAuthorityRowV1,
} from './payment-attempt-create-command.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export const POSTGRES_PAYMENT_ATTEMPT_CREATE_AUTHORITY_BINDING_V1 =
  PAYMENT_ATTEMPT_CREATE_AUTHORITY_BINDING_V1;

type AuthorityQueryRowV1 = Readonly<{
  paymentAttemptId: unknown;
  purchaseIntentId: unknown;
  productOfferId: unknown;
  attemptNo: unknown;
  provider: unknown;
  environment: unknown;
  providerRequestId: unknown;
  providerTransactionId: unknown;
  status: unknown;
  replayed: unknown;
}>;

const CREATE_SQL = `
select
  payment_attempt_id::text as "paymentAttemptId",
  purchase_intent_id::text as "purchaseIntentId",
  product_offer_id::text as "productOfferId",
  attempt_no as "attemptNo",
  provider as "provider",
  environment as "environment",
  provider_request_id as "providerRequestId",
  provider_transaction_id as "providerTransactionId",
  status as "status",
  replayed
from public.cmd_create_payment_attempt_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::text,
  $5::text,
  $6::text
)
`.trim();

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Payment Attempt PostgreSQL ${name} is invalid.`);
  }
  return value;
}

function requireNullableString(name: string, value: unknown): string | null {
  return value === null ? null : requireString(name, value);
}

function requireAttemptNo(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Payment Attempt PostgreSQL attempt number is invalid.');
  }
  return value;
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Payment Attempt PostgreSQL ${name} is invalid.`);
  }
  return value;
}

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === 'string' ? value : null;
}

function postgresCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { code?: unknown }).code;
  return typeof value === 'string' ? value : null;
}

function mapAuthorityError(error: unknown): never {
  const constraint = postgresConstraint(error);
  const mapped = (
    code: ConstructorParameters<typeof PaymentAttemptCreateAuthorityPortErrorV1>[0],
    message: string,
  ): never => {
    throw new PaymentAttemptCreateAuthorityPortErrorV1(code, message);
  };

  switch (constraint) {
    case 'cmd_payment_attempt_v1_intent_not_found':
      return mapped('INTENT_NOT_FOUND', 'Owner-matched Purchase Intent was not found.');
    case 'cmd_payment_attempt_v1_intent_terminal':
      return mapped('INTENT_TERMINAL', 'Purchase Intent cannot accept a new Payment Attempt.');
    case 'cmd_payment_attempt_v1_idempotency_conflict':
      return mapped('IDEMPOTENCY_CONFLICT', 'Payment Attempt idempotency identity conflicts.');
    case 'cmd_payment_attempt_v1_charge_terms_missing':
    case 'cmd_payment_attempt_v1_provider_missing':
      return mapped(
        'TRUSTED_AUTHORITY_UNAVAILABLE',
        'Purchase Intent payment authority is incomplete.',
      );
    case 'cmd_payment_attempt_v1_ids_required':
    case 'cmd_payment_attempt_v1_environment':
    case 'cmd_payment_attempt_v1_idempotency_required':
    case 'cmd_payment_attempt_v1_provider_request_required':
      return mapped('TRUSTED_INPUT_REJECTED', 'Server-owned Payment Attempt input was rejected.');
    case 'commerce_payment_attempts_pkey':
    case 'commerce_payment_attempts_provider_request_unique':
      return mapped('SERVER_ID_CONFLICT', 'Server-owned Payment Attempt identity conflicted.');
    default:
      if (postgresCode(error) === '23505') {
        return mapped('SERVER_ID_CONFLICT', 'Server-owned Payment Attempt identity conflicted.');
      }
      throw error;
  }
}

function mapAuthorityRows(
  rows: readonly AuthorityQueryRowV1[],
): readonly PaymentAttemptCreateAuthorityRowV1[] {
  return Object.freeze(rows.map((row) => Object.freeze({
    paymentAttemptId: requireString('authority Payment Attempt id', row.paymentAttemptId),
    purchaseIntentId: requireString('authority Purchase Intent id', row.purchaseIntentId),
    productOfferId: requireString('authority Product Offer id', row.productOfferId),
    attemptNo: requireAttemptNo(row.attemptNo),
    provider: requireString('authority provider', row.provider),
    environment: requireString('authority environment', row.environment),
    providerRequestId: requireString('authority provider request id', row.providerRequestId),
    providerTransactionId: requireNullableString(
      'authority provider transaction id',
      row.providerTransactionId,
    ),
    status: requireString('authority status', row.status),
    replayed: requireBoolean('authority replay marker', row.replayed),
  })));
}

class PostgresPaymentAttemptCreateAuthorityPortV1
implements PaymentAttemptCreateAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async createPaymentAttempt(
    input: Parameters<PaymentAttemptCreateAuthorityPortV1['createPaymentAttempt']>[0],
  ): Promise<readonly PaymentAttemptCreateAuthorityRowV1[]> {
    try {
      const result = await this.client.query<AuthorityQueryRowV1>(CREATE_SQL, [
        input.subjectId,
        input.paymentAttemptId,
        input.purchaseIntentId,
        input.environment,
        input.idempotencyKey,
        input.providerRequestId,
      ]);
      return mapAuthorityRows(result.rows);
    } catch (error) {
      return mapAuthorityError(error);
    }
  }
}

export function createPostgresPaymentAttemptCreateAuthorityPortV1(
  client: PostgresTransactionQueryV1,
): PaymentAttemptCreateAuthorityPortV1 {
  return new PostgresPaymentAttemptCreateAuthorityPortV1(client);
}
