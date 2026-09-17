import { createHash } from 'node:crypto';
import { ApiCommandError } from './api-error.js';

export const PAYMENT_ATTEMPT_CREATE_AUTHORITY_BINDING_V1 =
  'public.cmd_create_payment_attempt_v1' as const;

export type PaymentAttemptEnvironmentV1 = 'sandbox' | 'production';
export type PaymentAttemptStatusV1 =
  | 'created'
  | 'handed_off'
  | 'response_received'
  | 'failed'
  | 'cancelled';

type Awaitable<T> = T | Promise<T>;

export interface PaymentAttemptCreateRequestV1 {
  readonly purchaseIntentId: string;
  readonly idempotencyKey: string;
}

export interface PaymentAttemptCreateAuthorityRowV1 {
  readonly paymentAttemptId: string;
  readonly purchaseIntentId: string;
  readonly productOfferId: string;
  readonly attemptNo: number;
  readonly provider: string;
  readonly environment: string;
  readonly providerRequestId: string;
  readonly providerTransactionId: string | null;
  readonly status: string;
  readonly replayed: boolean;
}

export type PaymentAttemptCreateAuthorityFailureCodeV1 =
  | 'INTENT_NOT_FOUND'
  | 'INTENT_TERMINAL'
  | 'IDEMPOTENCY_CONFLICT'
  | 'TRUSTED_INPUT_REJECTED'
  | 'TRUSTED_AUTHORITY_UNAVAILABLE'
  | 'SERVER_ID_CONFLICT';

export class PaymentAttemptCreateAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: PaymentAttemptCreateAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentAttemptCreateAuthorityPortErrorV1';
  }
}

export interface PaymentAttemptCreateAuthorityPortV1 {
  createPaymentAttempt(input: {
    readonly subjectId: string;
    readonly paymentAttemptId: string;
    readonly purchaseIntentId: string;
    readonly environment: PaymentAttemptEnvironmentV1;
    readonly idempotencyKey: string;
    readonly providerRequestId: string;
  }): Awaitable<readonly PaymentAttemptCreateAuthorityRowV1[]>;
}

/** Server-owned identities. Neither value may be accepted from the HTTP request. */
export interface PaymentAttemptServerIdentityPortV1 {
  nextPaymentAttemptId(): Awaitable<string>;
  providerRequestIdFor(input: {
    readonly purchaseIntentId: string;
    readonly idempotencyKey: string;
  }): Awaitable<string>;
}

export interface CreatePaymentAttemptInputV1 {
  readonly resolvedSubjectId?: string;
  readonly request: unknown;
  readonly environment: PaymentAttemptEnvironmentV1;
  readonly identityPort: PaymentAttemptServerIdentityPortV1;
  readonly authorityPort: PaymentAttemptCreateAuthorityPortV1;
}

export interface CreatePaymentAttemptResponseV1 {
  readonly paymentAttemptId: string;
  readonly status: PaymentAttemptStatusV1;
}

function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Payment Attempt ${name} is invalid.`);
  }
  return value;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

export function requirePaymentAttemptEnvironmentV1(
  value: unknown,
): PaymentAttemptEnvironmentV1 {
  if (value === 'sandbox' || value === 'production') return value;
  throw new Error('Payment Attempt server environment is invalid.');
}

function parseRequest(value: unknown): PaymentAttemptCreateRequestV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiCommandError('INVALID_REQUEST', 'Payment Attempt request must be an object.');
  }
  const request = value as Record<string, unknown>;
  const keys = Object.keys(request);
  if (
    keys.length !== 2 ||
    !Object.prototype.hasOwnProperty.call(request, 'purchaseIntentId') ||
    !Object.prototype.hasOwnProperty.call(request, 'idempotencyKey')
  ) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Payment Attempt request contains unsupported fields.',
    );
  }
  if (
    typeof request.purchaseIntentId !== 'string' ||
    request.purchaseIntentId.trim().length === 0 ||
    typeof request.idempotencyKey !== 'string' ||
    request.idempotencyKey.trim().length === 0
  ) {
    throw new ApiCommandError('INVALID_REQUEST', 'Payment Attempt request is invalid.');
  }
  return Object.freeze({
    purchaseIntentId: request.purchaseIntentId,
    idempotencyKey: request.idempotencyKey,
  });
}

function requireStatus(value: unknown): PaymentAttemptStatusV1 {
  switch (value) {
    case 'created':
    case 'handed_off':
    case 'response_received':
    case 'failed':
    case 'cancelled':
      return value;
    default:
      throw new Error('Payment Attempt authority returned an invalid status.');
  }
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof PaymentAttemptCreateAuthorityPortErrorV1)) throw error;
  switch (error.code) {
    case 'INTENT_NOT_FOUND':
      throw new ApiCommandError('NOT_FOUND', 'Owner-matched Purchase Intent was not found.');
    case 'INTENT_TERMINAL':
      throw new ApiCommandError('INVALID_REQUEST', 'Purchase Intent cannot accept a new Payment Attempt.');
    case 'IDEMPOTENCY_CONFLICT':
      throw new ApiCommandError(
        'IDEMPOTENCY_CONFLICT',
        'idempotencyKey already represents a different Payment Attempt request.',
      );
    case 'TRUSTED_INPUT_REJECTED':
    case 'TRUSTED_AUTHORITY_UNAVAILABLE':
    case 'SERVER_ID_CONFLICT':
      throw new Error('Payment Attempt authority rejected trusted server-owned command data.');
  }
}

function assembleResponse(
  rows: readonly PaymentAttemptCreateAuthorityRowV1[],
  request: PaymentAttemptCreateRequestV1,
  environment: PaymentAttemptEnvironmentV1,
  proposedPaymentAttemptId: string,
  providerRequestId: string,
): CreatePaymentAttemptResponseV1 {
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new Error('Payment Attempt authority did not return exactly one row.');
  }
  const paymentAttemptId = requireNonEmptyString(
    'authority Payment Attempt id',
    row.paymentAttemptId,
  );
  if (row.purchaseIntentId !== request.purchaseIntentId) {
    throw new Error('Payment Attempt authority returned a different Purchase Intent id.');
  }
  requireNonEmptyString('authority Product Offer id', row.productOfferId);
  if (!Number.isSafeInteger(row.attemptNo) || row.attemptNo <= 0) {
    throw new Error('Payment Attempt authority returned an invalid attempt number.');
  }
  requireNonEmptyString('authority provider', row.provider);
  if (row.environment !== environment) {
    throw new Error('Payment Attempt authority returned a different environment.');
  }
  if (row.providerRequestId !== providerRequestId) {
    throw new Error('Payment Attempt authority returned a different provider request identity.');
  }
  if (row.providerTransactionId !== null) {
    requireNonEmptyString('authority provider transaction id', row.providerTransactionId);
  }
  if (typeof row.replayed !== 'boolean') {
    throw new Error('Payment Attempt authority returned an invalid replay marker.');
  }
  if (!row.replayed && paymentAttemptId !== proposedPaymentAttemptId) {
    throw new Error('Payment Attempt authority returned a different server-owned id.');
  }
  return Object.freeze({
    paymentAttemptId,
    status: requireStatus(row.status),
  });
}

/**
 * Stable merchant request identity for one logical Payment Attempt command.
 * Raw idempotency material is never exposed in the identifier.
 */
export function derivePaymentAttemptProviderRequestIdV1(input: {
  readonly purchaseIntentId: string;
  readonly idempotencyKey: string;
}): string {
  const purchaseIntentId = requireNonEmptyString('Purchase Intent id', input.purchaseIntentId);
  const idempotencyKey = requireNonEmptyString('idempotency key', input.idempotencyKey);
  const digest = createHash('sha256')
    .update('myeongha:payment-attempt-provider-request:v1\0')
    .update(purchaseIntentId)
    .update('\0')
    .update(idempotencyKey)
    .digest('hex');
  return `mha_pa_${digest}`;
}

export async function createPaymentAttemptV1(
  input: CreatePaymentAttemptInputV1,
): Promise<CreatePaymentAttemptResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const request = parseRequest(input.request);
  const environment = requirePaymentAttemptEnvironmentV1(input.environment);
  const paymentAttemptId = requireNonEmptyString(
    'server Payment Attempt id',
    await input.identityPort.nextPaymentAttemptId(),
  );
  const providerRequestId = requireNonEmptyString(
    'server provider request id',
    await input.identityPort.providerRequestIdFor({
      purchaseIntentId: request.purchaseIntentId,
      idempotencyKey: request.idempotencyKey,
    }),
  );

  let rows: readonly PaymentAttemptCreateAuthorityRowV1[];
  try {
    rows = await input.authorityPort.createPaymentAttempt({
      subjectId,
      paymentAttemptId,
      purchaseIntentId: request.purchaseIntentId,
      environment,
      idempotencyKey: request.idempotencyKey,
      providerRequestId,
    });
  } catch (error) {
    return mapAuthorityError(error);
  }

  return assembleResponse(
    rows,
    request,
    environment,
    paymentAttemptId,
    providerRequestId,
  );
}
