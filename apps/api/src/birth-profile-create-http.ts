import { ApiCommandError } from './api-error.js';
import {
  createBirthProfile,
  type BirthInputFingerprintPortV1,
  type BirthProfileCreateIdPortV1,
} from './birth-profile-create-command.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import { createPostgresBirthProfileCreateAuthorityPortV1 } from './postgres-birth-profile-create-authority.js';

const POST_METHOD = 'POST' as const;
const ROUTE = '/api/birth-profiles' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;
const BIRTH_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

export const BIRTH_PROFILE_CREATE_HTTP_BINDINGS_V1 = Object.freeze({
  method: POST_METHOD,
  route: ROUTE,
  createAuthority: 'public.cmd_create_birth_profile_runtime_v1',
  apiContractVersion: API_CONTRACT_VERSION,
} as const);

export interface HandleBirthProfileCreateRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
  readonly idPort: BirthProfileCreateIdPortV1;
  readonly fingerprintPort: BirthInputFingerprintPortV1;
}

function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Birth Profile create HTTP ${name} is invalid.`);
  }
  return value;
}

function requireServerTime(value: unknown): string {
  const serverTime = requireNonEmptyString('server time', value);
  if (!Number.isFinite(Date.parse(serverTime))) {
    throw new Error('Birth Profile create HTTP server time is not a timestamp.');
  }
  return serverTime;
}

function matchesRoute(request: Request): boolean {
  const url = new URL(request.url);
  return url.pathname === ROUTE && url.search === '' && url.hash === '';
}

function hasSupportedBirthDate(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  if (typeof request.input !== 'object' || request.input === null || Array.isArray(request.input)) return false;
  const input = request.input as Record<string, unknown>;
  if (typeof input.birthDate !== 'string') return false;
  const match = BIRTH_DATE_PATTERN.exec(input.birthDate);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return Number.isInteger(year) && year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
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
  data: Awaited<ReturnType<typeof createBirthProfile>>,
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
      status: 201,
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

export async function handleBirthProfileCreateRequestV1(
  input: HandleBirthProfileCreateRequestInputV1,
): Promise<Response> {
  if (!matchesRoute(input.request)) return routeNotFound();
  if (input.request.method !== POST_METHOD) return methodNotAllowed();

  const requestId = requireNonEmptyString('request id', input.requestId);
  const serverTime = requireServerTime(input.serverTime);

  const verifiedEvidence = await input.identityEvidenceVerifier.verifyRequestIdentity(
    input.request,
  );
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

  if (!hasSupportedBirthDate(requestBody)) {
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
        createBirthProfile({
          resolvedSubjectId: resolvedSubject.subjectId,
          request: requestBody,
          idPort: input.idPort,
          fingerprintPort: input.fingerprintPort,
          authorityPort: createPostgresBirthProfileCreateAuthorityPortV1(client),
        }),
    });

    return successResponse(data, requestId, serverTime);
  } catch (error) {
    if (!(error instanceof ApiCommandError)) throw error;

    if (error.code === 'AUTH_REQUIRED') {
      return jsonError({
        status: 401,
        code: 'AUTH_REQUIRED',
        messageKey: 'auth.required',
        retryable: false,
        requestId,
      });
    }
    if (error.code === 'INVALID_REQUEST') {
      return jsonError({
        status: 400,
        code: 'INVALID_REQUEST',
        messageKey: 'request.invalid',
        retryable: false,
        requestId,
      });
    }
    if (error.code === 'NOT_FOUND') {
      return jsonError({
        status: 404,
        code: 'NOT_FOUND',
        messageKey: 'birth_profile.not_found',
        retryable: false,
        requestId,
      });
    }

    throw error;
  }
}
