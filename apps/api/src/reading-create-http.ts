import { ApiCommandError } from './api-error.js';
import {
  createDirectReading,
  type ReadingCreateIdPortV1,
} from './reading-create-command.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import { createPostgresReadingCreateAuthorityPortV1 } from './postgres-reading-create-authority.js';

const POST_METHOD = 'POST' as const;
const ROUTE = '/api/readings' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;

export const READING_CREATE_HTTP_BINDINGS_V1 = Object.freeze({
  method: POST_METHOD,
  route: ROUTE,
  createAuthority: 'public.cmd_create_reading_session_runtime_v1',
  apiContractVersion: API_CONTRACT_VERSION,
  successStatus: 202,
} as const);

export interface HandleReadingCreateRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
  readonly idPort: ReadingCreateIdPortV1;
}

function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Reading create HTTP ${name} is invalid.`);
  }
  return value;
}

function requireServerTime(value: unknown): string {
  const serverTime = requireNonEmptyString('server time', value);
  if (!Number.isFinite(Date.parse(serverTime))) {
    throw new Error('Reading create HTTP server time is not a timestamp.');
  }
  return serverTime;
}

function matchesRoute(request: Request): boolean {
  const url = new URL(request.url);
  return url.pathname === ROUTE && url.search === '' && url.hash === '';
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
  data: Awaited<ReturnType<typeof createDirectReading>>,
  requestId: string,
  serverTime: string,
): Response {
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
      status: 202,
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

function routeNotFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
  });
}

export async function handleReadingCreateRequestV1(
  input: HandleReadingCreateRequestInputV1,
): Promise<Response> {
  if (!matchesRoute(input.request)) return routeNotFound();
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

  let requestBody: unknown;
  try {
    requestBody = await input.request.json();
  } catch {
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
      execute: ({ resolvedSubject, client }) => createDirectReading({
        resolvedSubjectId: resolvedSubject.subjectId,
        request: requestBody,
        idPort: input.idPort,
        authorityPort: createPostgresReadingCreateAuthorityPortV1(client),
      }),
    });

    return successResponse(data, requestId, serverTime);
  } catch (error) {
    if (!(error instanceof ApiCommandError)) throw error;

    if (error.code === 'AUTH_REQUIRED') {
      return jsonError({
        status: 401,
        code: error.code,
        messageKey: 'auth.required',
        retryable: false,
        requestId,
      });
    }
    if (error.code === 'INVALID_REQUEST') {
      return jsonError({
        status: 400,
        code: error.code,
        messageKey: 'request.invalid',
        retryable: false,
        requestId,
      });
    }
    if (error.code === 'NOT_FOUND') {
      return jsonError({
        status: 404,
        code: error.code,
        messageKey: 'reading.source_profile_not_found',
        retryable: false,
        requestId,
      });
    }
    if (error.code === 'CAPABILITY_UNAVAILABLE') {
      return jsonError({
        status: 409,
        code: error.code,
        messageKey: 'reading.capability_unavailable',
        retryable: false,
        requestId,
      });
    }
    if (error.code === 'IDEMPOTENCY_CONFLICT') {
      return jsonError({
        status: 409,
        code: error.code,
        messageKey: 'reading.idempotency_conflict',
        retryable: false,
        requestId,
      });
    }

    throw error;
  }
}
