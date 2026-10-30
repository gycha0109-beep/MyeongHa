import { ApiCommandError } from './api-error.js';
import {
  AuthenticatedJsonRequestBodyTooLargeV1,
  readAuthenticatedJsonRequestBodyV1,
} from './authenticated-json-request-resource.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  createIngressRequestBodyCompletionDeadlineLeaseV1,
  IngressRequestBodyCompletionDeadlineExceededV1,
} from './ingress-request-body-deadline.js';
import {
  SeyeonC09PrivateOptinCommandHoldV1,
  type C09PrivateLearningUserActionShadowV1,
  createSeyeonC09PrivateLearningOptinCommandShadowV1,
} from './seyeon-c09-private-learning-optin-command-shadow-v1.js';

const ROUTE = '/api/chat/learning/private-optin';
const VERSION = 'v0.9';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const SEYEON_C09_PRIVATE_OPTIN_HTTP_SHADOW_V1 = Object.freeze({
  method: 'POST',
  route: ROUTE,
  state: 'unmounted_requires_topic_and_db_authority',
  publicActivation: false,
  requiredAction: 'approve_private_learning',
} as const);

export interface HandleSeyeonC09PrivateOptinHttpShadowInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly command: ReturnType<typeof createSeyeonC09PrivateLearningOptinCommandShadowV1>;
}

function responseError(status: number, code: string, messageKey: string, requestId: string): Response {
  return Response.json({
    ok: false,
    error: { code, messageKey, retryable: status === 503 },
    meta: { apiContractVersion: VERSION, requestId },
  }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function strictAction(value: unknown): C09PrivateLearningUserActionShadowV1 | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  if (keys.length !== 2 || keys[0] !== 'action' || keys[1] !== 'originalMessageId') return null;
  if (obj.action !== 'approve_private_learning' ||
      typeof obj.originalMessageId !== 'string' ||
      !UUID.test(obj.originalMessageId)) return null;
  return Object.freeze({
    action: 'approve_private_learning',
    originalMessageId: obj.originalMessageId,
  });
}

async function readBody(request: Request): Promise<unknown> {
  const lease = createIngressRequestBodyCompletionDeadlineLeaseV1();
  try {
    return await readAuthenticatedJsonRequestBodyV1(request, {
      waitForRead: pending => lease.waitFor(pending),
    });
  } finally {
    lease.release();
  }
}

/**
 * Authenticated HTTP adapter for the existing private opt-in command.
 * This adapter is deliberately NOT mounted in any public router until a
 * real server-owned Topic Authority, approved receipt schema and least-
 * privilege writer are operational. HTTP claims never become auth evidence.
 */
export async function handleSeyeonC09PrivateOptinHttpShadowV1(
  input: HandleSeyeonC09PrivateOptinHttpShadowInputV1,
): Promise<Response> {
  const url = new URL(input.request.url);
  if (url.pathname !== ROUTE || url.search || url.hash) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  if (input.request.method !== 'POST') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
    });
  }
  const requestId = input.requestId;
  if (typeof requestId !== 'string' || !requestId.trim() ||
      typeof input.serverTime !== 'string' ||
      !Number.isFinite(Date.parse(input.serverTime))) {
    throw new Error('C09 private opt-in HTTP runtime metadata is invalid.');
  }

  const evidence = await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
  if (evidence === null) return responseError(401, 'AUTH_REQUIRED', 'auth.required', requestId);
  if (evidence.kind !== 'member') {
    return responseError(403, 'FORBIDDEN', 'chat.member_required', requestId);
  }

  let raw: unknown;
  try {
    raw = await readBody(input.request);
  } catch (error) {
    if (error instanceof AuthenticatedJsonRequestBodyTooLargeV1) {
      return responseError(413, 'REQUEST_TOO_LARGE', 'request.too_large', requestId);
    }
    if (error instanceof IngressRequestBodyCompletionDeadlineExceededV1) {
      return responseError(408, 'REQUEST_BODY_TIMEOUT', 'auth.request_body_timeout', requestId);
    }
    return responseError(400, 'INVALID_REQUEST', 'request.invalid', requestId);
  }
  const action = strictAction(raw);
  if (action === null) return responseError(400, 'INVALID_REQUEST', 'request.invalid', requestId);

  try {
    const result = await input.command.submit({
      verifiedEvidence: evidence,
      userAction: action,
    });
    if (result.scope !== 'user_private' ||
        result.evidencePublished !== false || result.productionActivated !== false) {
      return responseError(503, 'CAPABILITY_UNAVAILABLE', 'chat.learning_unavailable', requestId);
    }
    return Response.json({
      ok: true,
      data: {
        accepted: true,
        scope: 'user_private',
        evidencePublished: false,
        productionActivated: false,
      },
      meta: { apiContractVersion: VERSION, requestId, serverTime: input.serverTime },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof ApiCommandError && error.code === 'AUTH_REQUIRED') {
      return responseError(401, 'AUTH_REQUIRED', 'auth.required', requestId);
    }
    // Schema, privileges, topic policy, revoked source or unexpected SQL error
    // must never turn into permission elevation or raw error disclosure.
    if (error instanceof SeyeonC09PrivateOptinCommandHoldV1 ||
        (typeof error === 'object' && error !== null)) {
      return responseError(503, 'CAPABILITY_UNAVAILABLE', 'chat.learning_unavailable', requestId);
    }
    return responseError(503, 'CAPABILITY_UNAVAILABLE', 'chat.learning_unavailable', requestId);
  }
}
