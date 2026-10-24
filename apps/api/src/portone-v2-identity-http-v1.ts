import { ApiCommandError } from './api-error.js';
import { AuthenticatedJsonRequestBodyTooLargeV1 } from './authenticated-json-request-resource.js';
import { readChatOpenJsonRequestBodyV1 } from './chat-open-request-body.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import { IngressRequestBodyCompletionDeadlineExceededV1 } from './ingress-request-body-deadline.js';
import { finalizePortOneV2IdentityAgeV1 } from './portone-v2-identity-age-finalization-v1.js';
import type { PortOneV2IdentityLookupAdapterV1 } from './portone-v2-identity-verification-lookup-v1.js';
import { createPostgresPortOneIdentityAgeAuthorityV1 } from './postgres-portone-identity-age-authority-v1.js';
import { executePostgresSubjectTransactionV1, type PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

export const PORTONE_V2_IDENTITY_HTTP_BINDINGS_V1 = Object.freeze({
  issueRoute: '/api/identity-verifications/attempts',
  completeRoute: '/api/identity-verifications/complete',
  method: 'POST',
  routeRegistered: true,
  active: false,
} as const);

export interface PortOneV2IdentityHttpInputV1 {
  readonly request: Request;
  readonly requestId: string;
  /** These dependencies are supplied only by a future approved production composition. */
  readonly serverTime?: string;
  readonly identityEvidenceVerifier?: IdentityEvidenceVerificationPortV1;
  readonly pool?: PostgresSubjectPoolV1;
  readonly lookup?: PortOneV2IdentityLookupAdapterV1;
  /** Internal tests only. */
  readonly testOnlyActivation?: true;
  /** Set only by the production composition after ALL operator approval gates. */
  readonly productionActivationApproved?: true;
}

function failure(status: number, code: string, requestId: string): Response {
  return Response.json({ ok: false, error: { code, retryable: status >= 500 }, meta: { requestId } },
    { status, headers: { 'Cache-Control': 'no-store' } });
}
function success(data: unknown, requestId: string): Response {
  return Response.json({ ok: true, data, meta: { requestId } },
    { headers: { 'Cache-Control': 'no-store' } });
}
function onlyId(value: unknown): value is { identityVerificationId: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return Object.keys(obj).length === 1 &&
    typeof obj.identityVerificationId === 'string' &&
    /^iv_[a-f0-9]{32}$/u.test(obj.identityVerificationId);
}
async function handle(input: PortOneV2IdentityHttpInputV1, action: 'issue' | 'complete'): Promise<Response> {
  // This remains inert without explicit test injection OR separately approved
  // production composition. Browser-controlled fields cannot set either flag.
  if (input.testOnlyActivation !== true && input.productionActivationApproved !== true) {
    return failure(503, 'IDENTITY_VERIFICATION_DISABLED', input.requestId);
  }
  if (!input.identityEvidenceVerifier || !input.pool || !input.lookup || !input.serverTime) {
    return failure(503, 'IDENTITY_VERIFICATION_UNAVAILABLE', input.requestId);
  }
  const route = action === 'issue'
    ? PORTONE_V2_IDENTITY_HTTP_BINDINGS_V1.issueRoute
    : PORTONE_V2_IDENTITY_HTTP_BINDINGS_V1.completeRoute;
  if (new URL(input.request.url).pathname !== route) return failure(404, 'NOT_FOUND', input.requestId);
  if (input.request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  }
  try {
    const verifiedEvidence = await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
    if (verifiedEvidence === null) return failure(401, 'AUTH_REQUIRED', input.requestId);
    const body = await readChatOpenJsonRequestBodyV1(input.request);
    const authority = createPostgresPortOneIdentityAgeAuthorityV1({
      pool: input.pool, verifiedEvidence,
    });
    if (action === 'issue') {
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0) {
        return failure(400, 'INVALID_REQUEST', input.requestId);
      }
      return success(await authority.issueIdentityAttempt(), input.requestId);
    }
    if (!onlyId(body)) return failure(400, 'INVALID_REQUEST', input.requestId);
    const subjectId = await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence,
      execute: ({ resolvedSubject }) => resolvedSubject.subjectId,
    });
    const result = await finalizePortOneV2IdentityAgeV1({
      subjectId, identityVerificationId: body.identityVerificationId,
      serverTime: input.serverTime, authority, lookup: input.lookup,
    });
    if (result.kind !== 'granted') return failure(403, 'IDENTITY_VERIFICATION_NOT_ACCEPTED', input.requestId);
    return success({ ageBand: result.ageBand }, input.requestId);
  } catch (error) {
    if (error instanceof AuthenticatedJsonRequestBodyTooLargeV1) {
      return failure(413, 'REQUEST_TOO_LARGE', input.requestId);
    }
    if (error instanceof IngressRequestBodyCompletionDeadlineExceededV1) {
      return failure(408, 'REQUEST_BODY_TIMEOUT', input.requestId);
    }
    if (error instanceof SyntaxError) return failure(400, 'INVALID_REQUEST', input.requestId);
    if (error instanceof ApiCommandError && error.code === 'AUTH_REQUIRED') {
      return failure(401, 'AUTH_REQUIRED', input.requestId);
    }
    return failure(503, 'IDENTITY_VERIFICATION_UNAVAILABLE', input.requestId);
  }
}
export function handlePortOneV2IdentityIssueRequestV1(input: PortOneV2IdentityHttpInputV1): Promise<Response> {
  return handle(input, 'issue');
}
export function handlePortOneV2IdentityCompleteRequestV1(input: PortOneV2IdentityHttpInputV1): Promise<Response> {
  return handle(input, 'complete');
}
