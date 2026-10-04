import { ApiCommandError } from './api-error.js';
import {
  AuthenticatedJsonRequestBodyTooLargeV1,
  readAuthenticatedJsonRequestBodyV1,
} from './authenticated-json-request-resource.js';
import {
  registerDeviceInstallation,
  type DeviceInstallationRegistrationIdPortV1,
  type DeviceInstallationTokenProtectionPortV1,
  type RegisterDeviceInstallationResponseV1,
} from './device-installation-register-command.js';
import {
  revokeDeviceInstallation,
  type RevokeDeviceInstallationResponseV1,
} from './device-installation-revoke-command.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import { PostgresDeviceInstallationAuthorityPortV1 } from './postgres-device-installation-authority.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';

const API_CONTRACT_VERSION = 'v0.9' as const;
const NO_STORE = 'no-store' as const;
const REGISTER_ROUTE = '/api/device-installations/register' as const;
const REVOKE_PREFIX = '/api/device-installations/' as const;
const REVOKE_SUFFIX = '/revoke' as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const DEVICE_INSTALLATION_HTTP_BINDINGS_V1 = Object.freeze({
  registerMethod: 'POST',
  registerRoute: REGISTER_ROUTE,
  revokeMethod: 'POST',
  revokeRouteTemplate: '/api/device-installations/:id/revoke',
  apiContractVersion: API_CONTRACT_VERSION,
} as const);

export interface HandleDeviceInstallationRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
  readonly idPort: DeviceInstallationRegistrationIdPortV1;
  readonly tokenProtectionPort: DeviceInstallationTokenProtectionPortV1;
}

function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Device Installation HTTP ${name} is invalid.`);
  }
  return value;
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
      headers: { 'Cache-Control': NO_STORE },
    },
  );
}

function success(data: unknown, requestId: string, serverTime: string): Response {
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
    { status: 200, headers: { 'Cache-Control': NO_STORE } },
  );
}

function resolveRoute(
  request: Request,
):
  | Readonly<{ kind: 'register' }>
  | Readonly<{ kind: 'revoke'; installationId: string }>
  | null {
  const url = new URL(request.url);
  if (url.search !== '' || url.hash !== '') return null;
  if (url.pathname === REGISTER_ROUTE) return Object.freeze({ kind: 'register' });

  if (
    !url.pathname.startsWith(REVOKE_PREFIX) ||
    !url.pathname.endsWith(REVOKE_SUFFIX)
  ) {
    return null;
  }

  const encoded = url.pathname.slice(
    REVOKE_PREFIX.length,
    -REVOKE_SUFFIX.length,
  );
  if (encoded.length === 0 || encoded.includes('/')) return null;

  try {
    const installationId = decodeURIComponent(encoded);
    if (!UUID_PATTERN.test(installationId)) return null;
    return Object.freeze({ kind: 'revoke', installationId });
  } catch {
    return null;
  }
}

function apiErrorResponse(error: ApiCommandError, requestId: string): Response {
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
        messageKey: 'request.invalid',
        retryable: false,
        requestId,
      });
    case 'NOT_FOUND':
      return jsonError({
        status: 404,
        code: error.code,
        messageKey: 'device_installation.unavailable',
        retryable: false,
        requestId,
      });
    case 'IDEMPOTENCY_CONFLICT':
      return jsonError({
        status: 409,
        code: error.code,
        messageKey: 'device_installation.conflict',
        retryable: false,
        requestId,
      });
    default:
      throw error;
  }
}

export async function handleDeviceInstallationRequestV1(
  input: HandleDeviceInstallationRequestInputV1,
): Promise<Response> {
  const route = resolveRoute(input.request);
  if (route === null) {
    return new Response(null, {
      status: 404,
      headers: { 'Cache-Control': NO_STORE },
    });
  }
  if (input.request.method !== 'POST') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': NO_STORE },
    });
  }

  const requestId = requireNonEmptyString('request id', input.requestId);
  const serverTime = requireNonEmptyString('server time', input.serverTime);
  if (Number.isNaN(Date.parse(serverTime))) {
    throw new Error('Device Installation HTTP server time is not a timestamp.');
  }

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

  let requestBody: unknown = undefined;
  if (route.kind === 'register') {
    try {
      requestBody = await readAuthenticatedJsonRequestBodyV1(input.request);
    } catch (error) {
      if (error instanceof AuthenticatedJsonRequestBodyTooLargeV1) {
        return jsonError({
          status: 413,
          code: 'REQUEST_TOO_LARGE',
          messageKey: 'request.too_large',
          retryable: false,
          requestId,
        });
      }
      return jsonError({
        status: 400,
        code: 'INVALID_REQUEST',
        messageKey: 'request.invalid',
        retryable: false,
        requestId,
      });
    }
  }

  try {
    const data = await executePostgresSubjectTransactionV1<
      RegisterDeviceInstallationResponseV1 | RevokeDeviceInstallationResponseV1
    >({
      pool: input.pool,
      verifiedEvidence,
      execute: ({ resolvedSubject, client }) => {
        const authorityPort =
          new PostgresDeviceInstallationAuthorityPortV1(client);
        if (route.kind === 'register') {
          return registerDeviceInstallation({
            resolvedSubjectId: resolvedSubject.subjectId,
            request: requestBody,
            idPort: input.idPort,
            tokenProtectionPort: input.tokenProtectionPort,
            authorityPort,
          });
        }
        return revokeDeviceInstallation({
          resolvedSubjectId: resolvedSubject.subjectId,
          installationId: route.installationId,
          authorityPort,
        });
      },
    });
    return success(data, requestId, serverTime);
  } catch (error) {
    if (error instanceof ApiCommandError) {
      return apiErrorResponse(error, requestId);
    }
    throw error;
  }
}
