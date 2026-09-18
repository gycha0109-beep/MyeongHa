import { ApiCommandError } from './api-error.js';
import {
  CommercePaymentVerificationErrorV1,
  type CommercePaymentVerificationAdapterV1,
} from './commerce-payment-verification-execution.js';
import {
  executeSubjectOwnedCommercePaymentCompletionV1,
  type SubjectOwnedCommercePaymentCompletionV1,
} from './commerce-subject-payment-completion-orchestration.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const POST_METHOD = 'POST' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;

export const PAYMENT_ATTEMPT_SERVER_VERIFICATION_HTTP_BINDINGS_V1 = Object.freeze({
  method: POST_METHOD,
  publicRoute: null,
  apiContractVersion: API_CONTRACT_VERSION,
  successStatus: 200,
  serverVerificationRequired: true,
  browserResultAuthority: false,
} as const);

export interface HandlePaymentAttemptServerVerificationRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
  readonly verificationAdapter: CommercePaymentVerificationAdapterV1;
}

type PaymentAttemptServerVerificationResponseV1 = Readonly<
  Pick<
    SubjectOwnedCommercePaymentCompletionV1,
    'paymentAttemptId' | 'receiptId' | 'replayed'
  >
>;

function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Payment Attempt server verification HTTP ${name} is invalid.`);
  }
  return value;
}

function requireServerTime(value: unknown): string {
  const serverTime = requireNonEmptyString('server time', value);
  if (!Number.isFinite(Date.parse(serverTime))) {
    throw new Error(
      'Payment Attempt server verification HTTP server time is not a timestamp.',
    );
  }
  return serverTime;
}

function parsePublicRequestBody(
  value: unknown,
): Readonly<{ paymentAttemptId: string }> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (
    keys.length !== 1 ||
    !Object.prototype.hasOwnProperty.call(body, 'paymentAttemptId') ||
    typeof body.paymentAttemptId !== 'string' ||
    body.paymentAttemptId.trim().length === 0
  ) {
    return null;
  }
  return Object.freeze({ paymentAttemptId: body.paymentAttemptId });
}

function jsonError(input: {
  readonly status: number;
  readonly code: string;
  readonly messageKey: string;
  readonly retryable: boolean;
  readonly requestId: string;
}): Response {
  return Response.json(
    {
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
    },
    {
      status: input.status,
      headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
    },
  );
}

function successResponse(
  result: SubjectOwnedCommercePaymentCompletionV1,
  requestId: string,
  serverTime: string,
): Response {
  const data: PaymentAttemptServerVerificationResponseV1 = Object.freeze({
    paymentAttemptId: result.paymentAttemptId,
    receiptId: result.receiptId,
    replayed: result.replayed,
  });

  return Response.json(
    {
      ok: true,
      data,
      meta: {
        apiContractVersion: API_CONTRACT_VERSION,
        requestId,
        serverTime,
      },
    },
    {
      status: 200,
      headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
    },
  );
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

function mapApiCommandError(error: ApiCommandError, requestId: string): Response {
  switch (error.code) {
    case 'AUTH_REQUIRED':
      return jsonError({
        status: 401,
        code: error.code,
        messageKey: 'auth.required',
        retryable: false,
        requestId,
      });
    case 'INVALID_REQUEST':
      return jsonError({
        status: 400,
        code: error.code,
        messageKey: 'payment_attempt.verification_invalid',
        retryable: false,
        requestId,
      });
    case 'FORBIDDEN':
      return jsonError({
        status: 403,
        code: error.code,
        messageKey: 'payment_attempt.verification_forbidden',
        retryable: false,
        requestId,
      });
    case 'NOT_FOUND':
      return jsonError({
        status: 404,
        code: error.code,
        messageKey: 'payment_attempt.verification_not_found',
        retryable: false,
        requestId,
      });
    case 'IDEMPOTENCY_CONFLICT':
      return jsonError({
        status: 409,
        code: error.code,
        messageKey: 'payment_attempt.verification_conflict',
        retryable: false,
        requestId,
      });
    default:
      throw error;
  }
}

function verificationUnavailableResponse(
  error: CommercePaymentVerificationErrorV1,
  requestId: string,
): Response {
  return jsonError({
    status: 503,
    code: 'CAPABILITY_UNAVAILABLE',
    messageKey: 'payment_attempt.verification_unavailable',
    retryable: error.code === 'ADAPTER_FAILED',
    requestId,
  });
}

/**
 * Authenticated but intentionally unmounted server-verification boundary.
 *
 * The caller can name only one Payment Attempt. Browser SDK output is deliberately
 * absent from this contract; provider/payment/product/value authority is recovered
 * from the owned server context and verified by the server-side provider adapter.
 */
export async function handlePaymentAttemptServerVerificationRequestV1(
  input: HandlePaymentAttemptServerVerificationRequestInputV1,
): Promise<Response> {
  if (input.request.method !== POST_METHOD) return methodNotAllowed();

  const requestId = requireNonEmptyString('request id', input.requestId);
  const serverTime = requireServerTime(input.serverTime);

  const verifiedEvidence =
    await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
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
      messageKey: 'payment_attempt.verification_invalid',
      retryable: false,
      requestId,
    });
  }

  const requestBody = parsePublicRequestBody(rawBody);
  if (requestBody === null) {
    return jsonError({
      status: 400,
      code: 'INVALID_REQUEST',
      messageKey: 'payment_attempt.verification_invalid',
      retryable: false,
      requestId,
    });
  }

  try {
    const result = await executeSubjectOwnedCommercePaymentCompletionV1({
      pool: input.pool,
      verifiedEvidence,
      paymentAttemptId: requestBody.paymentAttemptId,
      verificationAdapter: input.verificationAdapter,
    });
    return successResponse(result, requestId, serverTime);
  } catch (error) {
    if (error instanceof ApiCommandError) {
      return mapApiCommandError(error, requestId);
    }
    if (error instanceof CommercePaymentVerificationErrorV1) {
      return verificationUnavailableResponse(error, requestId);
    }
    throw error;
  }
}
