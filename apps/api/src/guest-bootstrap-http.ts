import { ApiCommandError } from './api-error.js';
import {
  bootstrapSession,
  type BootstrapSessionResponseV1,
  type GuestBootstrapAuthorityPortV1,
  type GuestBootstrapCredentialIssuerPortV1,
  type GuestBootstrapIdentityResolverPortV1,
  type GuestBootstrapTokenFingerprintPortV1,
} from './guest-bootstrap-command.js';

const POST_METHOD = 'POST' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;
const NO_STORE = 'no-store' as const;

export const GUEST_BOOTSTRAP_HTTP_BINDINGS_V1 = Object.freeze({
  method: POST_METHOD,
  route: '/api/session/bootstrap',
  apiContractVersion: API_CONTRACT_VERSION,
  cacheControl: NO_STORE,
} as const);

export interface HandleGuestBootstrapRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityResolverPort: GuestBootstrapIdentityResolverPortV1;
  readonly credentialIssuerPort: GuestBootstrapCredentialIssuerPortV1;
  readonly tokenFingerprintPort: GuestBootstrapTokenFingerprintPortV1;
  readonly authorityPort: GuestBootstrapAuthorityPortV1;
}

function requireTrustedString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Guest bootstrap HTTP ${name} is invalid.`);
  }
  return value;
}

function requireServerTime(value: unknown): string {
  const serverTime = requireTrustedString('server time', value);
  if (!Number.isFinite(Date.parse(serverTime))) {
    throw new Error('Guest bootstrap HTTP server time is not a timestamp.');
  }
  return serverTime;
}

function responseHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set('Cache-Control', NO_STORE);
  return headers;
}

function methodNotAllowed(): Response {
  return new Response(null, {
    status: 405,
    headers: responseHeaders({ Allow: POST_METHOD }),
  });
}

async function readRequestBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim().length === 0) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Session bootstrap request body must be empty or valid JSON.',
    );
  }
}

function errorResponse(input: {
  readonly status: number;
  readonly code: 'INVALID_REQUEST' | 'AUTH_REQUIRED';
  readonly messageKey: 'request.invalid' | 'auth.required';
  readonly requestId: string;
}): Response {
  return Response.json(
    {
      ok: false,
      error: {
        code: input.code,
        messageKey: input.messageKey,
        retryable: false,
      },
      meta: {
        apiContractVersion: API_CONTRACT_VERSION,
        requestId: input.requestId,
      },
    },
    {
      status: input.status,
      headers: responseHeaders(),
    },
  );
}

function successResponse(
  data: BootstrapSessionResponseV1,
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
      status: 200,
      headers: responseHeaders(),
    },
  );
}

/**
 * Source-safe HTTP boundary for POST /api/session/bootstrap.
 *
 * This module deliberately does not create a Vercel route. It accepts only an
 * empty request body (or an empty JSON object through the command boundary),
 * never accepts client-selected identity/token/expiry values, and marks every
 * response no-store because a fresh successful response can contain a bearer
 * credential exactly once.
 */
export async function handleGuestBootstrapRequestV1(
  input: HandleGuestBootstrapRequestInputV1,
): Promise<Response> {
  if (input.request.method !== POST_METHOD) {
    return methodNotAllowed();
  }

  const requestId = requireTrustedString('request id', input.requestId);
  const serverTime = requireServerTime(input.serverTime);

  try {
    const requestBody = await readRequestBody(input.request);
    const data = await bootstrapSession({
      request: requestBody,
      identityResolverPort: input.identityResolverPort,
      credentialIssuerPort: input.credentialIssuerPort,
      tokenFingerprintPort: input.tokenFingerprintPort,
      authorityPort: input.authorityPort,
    });
    return successResponse(data, requestId, serverTime);
  } catch (error) {
    if (error instanceof ApiCommandError) {
      if (error.code === 'INVALID_REQUEST') {
        return errorResponse({
          status: 400,
          code: 'INVALID_REQUEST',
          messageKey: 'request.invalid',
          requestId,
        });
      }
      if (error.code === 'AUTH_REQUIRED') {
        return errorResponse({
          status: 401,
          code: 'AUTH_REQUIRED',
          messageKey: 'auth.required',
          requestId,
        });
      }
    }
    throw error;
  }
}
