import { ApiCommandError } from './api-error.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  loadPaymentAttemptHandoffContextV1,
  PAYMENT_ATTEMPT_HANDOFF_CONTEXT_QUERY_V1,
  type PaymentAttemptHandoffContextV1,
} from './payment-attempt-handoff-context-read.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';

const POST_METHOD = 'POST' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;

export const PAYMENT_ATTEMPT_HANDOFF_CONTEXT_HTTP_BINDINGS_V1 = Object.freeze({
  method: POST_METHOD,
  publicRoute: null,
  readAuthority: PAYMENT_ATTEMPT_HANDOFF_CONTEXT_QUERY_V1,
  apiContractVersion: API_CONTRACT_VERSION,
  successStatus: 200,
} as const);

export interface HandlePaymentAttemptHandoffContextRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
}

function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Payment Attempt handoff HTTP ${name} is invalid.`);
  }
  return value;
}

function requireServerTime(value: unknown): string {
  const serverTime = requireNonEmptyString('server time', value);
  if (!Number.isFinite(Date.parse(serverTime))) {
    throw new Error('Payment Attempt handoff HTTP server time is not a timestamp.');
  }
  return serverTime;
}

function parsePublicRequestBody(value: unknown): Readonly<{ paymentAttemptId: string }> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (
    keys.length !== 1 ||
    !Object.prototype.hasOwnProperty.call(body, 'paymentAttemptId') ||
    typeof body.paymentAttemptId !== 'string' ||
    body.paymentAttemptId.trim().length === 0
  ) return null;
  return Object.freeze({ paymentAttemptId: body.paymentAttemptId });
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
  data: PaymentAttemptHandoffContextV1,
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

async function readBodyAfterSubjectResolution(request: Request): Promise<{ paymentAttemptId: string }> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw new ApiCommandError('INVALID_REQUEST', 'Payment Attempt handoff request is invalid.');
  }

  const requestBody = parsePublicRequestBody(rawBody);
  if (requestBody === null) {
    throw new ApiCommandError('INVALID_REQUEST', 'Payment Attempt handoff request is invalid.');
  }
  return requestBody;
}

/**
 * Authenticated but intentionally unmounted handoff-context boundary.
 *
 * Ordering is deliberate: verify request identity, resolve/bind the canonical Subject,
 * then parse the caller body, then execute the owner-scoped handoff read.
 */
export async function handlePaymentAttemptHandoffContextRequestV1(
  input: HandlePaymentAttemptHandoffContextRequestInputV1,
): Promise<Response> {
  if (input.request.method !== POST_METHOD) return methodNotAllowed();

  const requestId = requireNonEmptyString('request id', input.requestId);
  const serverTime = requireServerTime(input.serverTime);
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

  try {
    const data = await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence,
      execute: async (scope) => {
        const requestBody = await readBodyAfterSubjectResolution(input.request);
        return loadPaymentAttemptHandoffContextV1({
          scope,
          paymentAttemptId: requestBody.paymentAttemptId,
        });
      },
    });
    return successResponse(data, requestId, serverTime);
  } catch (error) {
    if (!(error instanceof ApiCommandError)) throw error;
    if (error.code === 'AUTH_REQUIRED') {
      return jsonError({ status: 401, code: error.code, messageKey: 'auth.required', retryable: false, requestId });
    }
    if (error.code === 'INVALID_REQUEST') {
      return jsonError({ status: 400, code: error.code, messageKey: 'payment_attempt.handoff_invalid', retryable: false, requestId });
    }
    if (error.code === 'FORBIDDEN') {
      return jsonError({ status: 403, code: error.code, messageKey: 'payment_attempt.handoff_forbidden', retryable: false, requestId });
    }
    if (error.code === 'NOT_FOUND') {
      return jsonError({ status: 404, code: error.code, messageKey: 'payment_attempt.handoff_not_found', retryable: false, requestId });
    }
    throw error;
  }
}
