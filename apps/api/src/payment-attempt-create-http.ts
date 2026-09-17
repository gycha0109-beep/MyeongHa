import { ApiCommandError } from './api-error.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  createPaymentAttemptV1,
  PAYMENT_ATTEMPT_CREATE_AUTHORITY_BINDING_V1,
  requirePaymentAttemptEnvironmentV1,
  type CreatePaymentAttemptResponseV1,
  type PaymentAttemptEnvironmentV1,
  type PaymentAttemptServerIdentityPortV1,
} from './payment-attempt-create-command.js';
import { createPostgresPaymentAttemptCreateAuthorityPortV1 } from './postgres-payment-attempt-create.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';

const POST_METHOD = 'POST' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;

export const PAYMENT_ATTEMPT_CREATE_HTTP_BINDINGS_V1 = Object.freeze({
  method: POST_METHOD,
  publicRoute: null,
  createAuthority: PAYMENT_ATTEMPT_CREATE_AUTHORITY_BINDING_V1,
  apiContractVersion: API_CONTRACT_VERSION,
  successStatus: 200,
} as const);

export interface HandlePaymentAttemptCreateRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly environment: PaymentAttemptEnvironmentV1;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
  readonly identityPort: PaymentAttemptServerIdentityPortV1;
}

function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Payment Attempt HTTP ${name} is invalid.`);
  }
  return value;
}

function requireServerTime(value: unknown): string {
  const serverTime = requireNonEmptyString('server time', value);
  if (!Number.isFinite(Date.parse(serverTime))) {
    throw new Error('Payment Attempt HTTP server time is not a timestamp.');
  }
  return serverTime;
}

function parsePublicRequestBody(
  value: unknown,
): Readonly<{ purchaseIntentId: string; idempotencyKey: string }> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (
    keys.length !== 2 ||
    !Object.prototype.hasOwnProperty.call(body, 'purchaseIntentId') ||
    !Object.prototype.hasOwnProperty.call(body, 'idempotencyKey') ||
    typeof body.purchaseIntentId !== 'string' ||
    body.purchaseIntentId.trim().length === 0 ||
    typeof body.idempotencyKey !== 'string' ||
    body.idempotencyKey.trim().length === 0
  ) return null;
  return Object.freeze({
    purchaseIntentId: body.purchaseIntentId,
    idempotencyKey: body.idempotencyKey,
  });
}

function jsonError(input: {
  readonly status: number;
  readonly code: string;
  readonly messageKey: string;
  readonly retryable: boolean;
  readonly requestId: string;
}): Response {
  return Response.json({
    ok: false,
    error: {
      code: input.code,
      messageKey: input.messageKey,
      retryable: input.retryable,
    },
    meta: {
      apiContractVersion: API_CONTRACT_VERSION,
      requestId: input.requestId,
    },
  }, {
    status: input.status,
    headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
  });
}

function successResponse(
  data: CreatePaymentAttemptResponseV1,
  requestId: string,
  serverTime: string,
): Response {
  return Response.json({
    ok: true,
    data,
    meta: {
      apiContractVersion: API_CONTRACT_VERSION,
      requestId,
      serverTime,
    },
  }, {
    status: 200,
    headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
  });
}

function methodNotAllowed(): Response {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: POST_METHOD,
      'Cache-Control': NO_STORE_CACHE_CONTROL,
    },
  });
}

export async function handlePaymentAttemptCreateRequestV1(
  input: HandlePaymentAttemptCreateRequestInputV1,
): Promise<Response> {
  if (input.request.method !== POST_METHOD) return methodNotAllowed();

  const requestId = requireNonEmptyString('request id', input.requestId);
  const serverTime = requireServerTime(input.serverTime);
  const environment = requirePaymentAttemptEnvironmentV1(input.environment);
  const verifiedEvidence = await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
  if (verifiedEvidence === null) {
    return jsonError({
      status: 401,
      code: 'AUTH_REQUIRED',
      messageKey: 'auth.required',
      retryable: false,
      requestId,
    });
  }

  let rawBody: unknown;
  try {
    rawBody = await input.request.json();
  } catch {
    return jsonError({
      status: 400,
      code: 'INVALID_REQUEST',
      messageKey: 'request.invalid',
      retryable: false,
      requestId,
    });
  }
  const requestBody = parsePublicRequestBody(rawBody);
  if (requestBody === null) {
    return jsonError({
      status: 400,
      code: 'INVALID_REQUEST',
      messageKey: 'request.invalid',
      retryable: false,
      requestId,
    });
  }

  try {
    const data = await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence,
      execute: ({ resolvedSubject, client }) =>
        createPaymentAttemptV1({
          resolvedSubjectId: resolvedSubject.subjectId,
          request: requestBody,
          environment,
          identityPort: input.identityPort,
          authorityPort: createPostgresPaymentAttemptCreateAuthorityPortV1(client),
        }),
    });
    return successResponse(data, requestId, serverTime);
  } catch (error) {
    if (!(error instanceof ApiCommandError)) throw error;
    if (error.code === 'AUTH_REQUIRED') {
      return jsonError({ status: 401, code: error.code, messageKey: 'auth.required', retryable: false, requestId });
    }
    if (error.code === 'INVALID_REQUEST') {
      return jsonError({ status: 400, code: error.code, messageKey: 'payment_attempt.invalid', retryable: false, requestId });
    }
    if (error.code === 'FORBIDDEN') {
      return jsonError({ status: 403, code: error.code, messageKey: 'payment_attempt.forbidden', retryable: false, requestId });
    }
    if (error.code === 'NOT_FOUND') {
      return jsonError({ status: 404, code: error.code, messageKey: 'payment_attempt.purchase_intent_not_found', retryable: false, requestId });
    }
    if (error.code === 'IDEMPOTENCY_CONFLICT') {
      return jsonError({ status: 409, code: error.code, messageKey: 'payment_attempt.idempotency_conflict', retryable: false, requestId });
    }
    throw error;
  }
}
