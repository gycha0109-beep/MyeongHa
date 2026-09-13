import { ApiCommandError } from './api-error.js';
import {
  loadCommerceProviderPaymentVerificationContextV1,
  type CommerceProviderPaymentVerificationResolutionV1,
} from './commerce-provider-payment-verification-context-read.js';
import {
  executeCommercePaymentVerificationV1,
  type CommercePaymentVerificationAdapterV1,
} from './commerce-payment-verification-execution.js';
import {
  persistVerifiedPaymentEvidenceV1,
  type PersistedVerifiedPaymentEvidenceV1,
} from './commerce-verified-payment-evidence-persistence.js';
import { executePostgresCommerceInternalTransactionV1 } from './postgres-commerce-internal-execution.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

export interface AuthenticatedCommerceProviderIngressV1 {
  readonly provider: string;
  readonly environment: 'sandbox' | 'production';
  readonly providerRequestId?: string;
  readonly providerTransactionId?: string;
}

export interface CommerceProviderIngressAuthenticatorV1 {
  authenticate(ingress: unknown): Promise<unknown>;
}

export interface AuthenticatedCommerceProviderPaymentCompletionV1 {
  readonly paymentAttemptId: string;
  readonly receiptId: string;
  readonly providerEventId: string;
  readonly replayed: boolean;
}

const AUTHENTICATED_INGRESS_KEYS = new Set([
  'provider',
  'environment',
  'providerRequestId',
  'providerTransactionId',
] as const);

function failAuthentication(): never {
  throw new ApiCommandError(
    'AUTH_REQUIRED',
    'Provider ingress authentication failed.',
  );
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return failAuthentication();
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return failAuthentication();
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(record: Record<string, unknown>): void {
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !AUTHENTICATED_INGRESS_KEYS.has(key)) {
      failAuthentication();
    }
  }
}

function nonEmptyString(
  record: Record<string, unknown>,
  key: string,
  required: boolean,
): string | undefined {
  const value = record[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    return failAuthentication();
  }
  return value.trim();
}

function requireAuthenticatedIngress(
  value: unknown,
): AuthenticatedCommerceProviderIngressV1 {
  const record = plainRecord(value);
  rejectUnknownKeys(record);

  const provider = nonEmptyString(record, 'provider', true);
  if (provider === undefined) return failAuthentication();

  const environment = record.environment;
  if (environment !== 'sandbox' && environment !== 'production') {
    return failAuthentication();
  }

  const providerRequestId = nonEmptyString(
    record,
    'providerRequestId',
    false,
  );
  const providerTransactionId = nonEmptyString(
    record,
    'providerTransactionId',
    false,
  );
  if (providerRequestId === undefined && providerTransactionId === undefined) {
    return failAuthentication();
  }

  return Object.freeze({
    provider,
    environment,
    ...(providerRequestId === undefined ? {} : { providerRequestId }),
    ...(providerTransactionId === undefined ? {} : { providerTransactionId }),
  });
}

async function authenticateProviderIngress(input: {
  readonly ingress: unknown;
  readonly authenticator: CommerceProviderIngressAuthenticatorV1;
}): Promise<AuthenticatedCommerceProviderIngressV1> {
  if (
    typeof input.authenticator !== 'object' ||
    input.authenticator === null ||
    typeof input.authenticator.authenticate !== 'function'
  ) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Provider ingress authenticator is invalid.',
    );
  }

  let authenticated: unknown;
  try {
    authenticated = await input.authenticator.authenticate(input.ingress);
  } catch {
    return failAuthentication();
  }
  return requireAuthenticatedIngress(authenticated);
}

async function resolveVerificationContext(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly authenticatedIngress: AuthenticatedCommerceProviderIngressV1;
}): Promise<CommerceProviderPaymentVerificationResolutionV1> {
  return executePostgresCommerceInternalTransactionV1({
    pool: input.pool,
    execute: async (scope) =>
      loadCommerceProviderPaymentVerificationContextV1({
        scope,
        provider: input.authenticatedIngress.provider,
        environment: input.authenticatedIngress.environment,
        providerRequestId: input.authenticatedIngress.providerRequestId,
        providerTransactionId: input.authenticatedIngress.providerTransactionId,
      }),
  });
}

async function persistVerificationResult(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly paymentAttemptId: string;
  readonly evidence: unknown;
}): Promise<PersistedVerifiedPaymentEvidenceV1> {
  return executePostgresCommerceInternalTransactionV1({
    pool: input.pool,
    execute: async (scope) =>
      persistVerifiedPaymentEvidenceV1({
        scope,
        paymentAttemptId: input.paymentAttemptId,
        evidence: input.evidence,
      }),
  });
}

export async function executeAuthenticatedCommerceProviderPaymentCompletionV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly ingress: unknown;
  readonly authenticator: CommerceProviderIngressAuthenticatorV1;
  readonly verificationAdapter: CommercePaymentVerificationAdapterV1;
}): Promise<AuthenticatedCommerceProviderPaymentCompletionV1> {
  const authenticatedIngress = await authenticateProviderIngress({
    ingress: input.ingress,
    authenticator: input.authenticator,
  });

  const resolution = await resolveVerificationContext({
    pool: input.pool,
    authenticatedIngress,
  });

  const evidence = await executeCommercePaymentVerificationV1({
    context: resolution.verificationContext,
    adapter: input.verificationAdapter,
  });

  const persisted = await persistVerificationResult({
    pool: input.pool,
    paymentAttemptId: resolution.paymentAttemptId,
    evidence,
  });

  return Object.freeze({
    paymentAttemptId: resolution.paymentAttemptId,
    receiptId: persisted.receiptId,
    providerEventId: persisted.providerEventId,
    replayed: persisted.replayed,
  });
}
