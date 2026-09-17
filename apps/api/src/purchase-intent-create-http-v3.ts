import { ApiCommandError } from './api-error.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  createPostgresPurchaseIntentRuntimePortsV3,
  POSTGRES_PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V3,
  POSTGRES_PURCHASE_INTENT_RUNTIME_SNAPSHOT_BINDING_V3,
} from './postgres-purchase-intent-create-v3.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import {
  createPurchaseIntentV3,
  type CreatePurchaseIntentResponseV3,
} from './purchase-intent-create-command-v3.js';
import type { PurchaseIntentIdPortV1 } from './purchase-intent-create-command.js';

const POST_METHOD = 'POST' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;

export const PURCHASE_INTENT_CREATE_HTTP_BINDINGS_V3 = Object.freeze({
  method: POST_METHOD,
  publicRoute: null,
  snapshotAuthority: POSTGRES_PURCHASE_INTENT_RUNTIME_SNAPSHOT_BINDING_V3,
  createAuthority: POSTGRES_PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V3,
  apiContractVersion: API_CONTRACT_VERSION,
  successStatus: 200,
} as const);

export interface HandlePurchaseIntentCreateRequestInputV3 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
  readonly idPort: PurchaseIntentIdPortV1;
}

function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Purchase Intent HTTP ${name} is invalid.`);
  }
  return value;
}

function requireServerTime(value: unknown): string {
  const serverTime = requireNonEmptyString('server time', value);
  if (!Number.isFinite(Date.parse(serverTime))) {
    throw new Error('Purchase Intent HTTP server time is not a timestamp.');
  }
  return serverTime;
}

function parsePublicRequestBody(value: unknown): Readonly<{ productOfferId: string; idempotencyKey: string }> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (
    keys.length !== 2 ||
    !Object.prototype.hasOwnProperty.call(body, 'productOfferId') ||
    !Object.prototype.hasOwnProperty.call(body, 'idempotencyKey') ||
    typeof body.productOfferId !== 'string' || body.productOfferId.trim().length === 0 ||
    typeof body.idempotencyKey !== 'string' || body.idempotencyKey.trim().length === 0
  ) return null;
  return Object.freeze({
    productOfferId: body.productOfferId,
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

function successResponse(data: CreatePurchaseIntentResponseV3, requestId: string, serverTime: string): Response {
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

export async function handlePurchaseIntentCreateRequestV3(
  input: HandlePurchaseIntentCreateRequestInputV3,
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
      execute: ({ resolvedSubject, client }) => {
        const ports = createPostgresPurchaseIntentRuntimePortsV3(client);
        return createPurchaseIntentV3({
          resolvedSubjectId: resolvedSubject.subjectId,
          request: requestBody,
          offerSnapshotPort: ports.offerSnapshotPort,
          capabilitySnapshotPort: ports.capabilitySnapshotPort,
          idPort: input.idPort,
          authorityPort: ports.authorityPort,
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
      return jsonError({ status: 400, code: error.code, messageKey: 'request.invalid', retryable: false, requestId });
    }
    if (error.code === 'FORBIDDEN') {
      return jsonError({ status: 403, code: error.code, messageKey: 'purchase_intent.forbidden', retryable: false, requestId });
    }
    if (error.code === 'NOT_FOUND') {
      return jsonError({ status: 404, code: error.code, messageKey: 'purchase_intent.offer_unavailable', retryable: false, requestId });
    }
    if (error.code === 'IDEMPOTENCY_CONFLICT') {
      return jsonError({ status: 409, code: error.code, messageKey: 'purchase_intent.idempotency_conflict', retryable: false, requestId });
    }
    throw error;
  }
}
