// Watchtower-Track: security
// The deployed /api/me dispatch returns a Web Fetch Response. Vercel's
// HTTP/proxy send boundary is outside this process, so NEVER return protected
// Se-yeon assistant payloads here until the G0/G3 transport contract is signed.
const NO_STORE = 'no-store' as const;

// A caller-controlled 4xx status/Cache-Control header is NOT enough to prove
// that the response body is a safe preflight denial. Only the tightly scoped
// chat-turn handler's own static error constructors register the exact object.
interface TrustedPreflightSnapshotV1 {
  readonly status: number;
  readonly headers: readonly (readonly [string, string])[];
}
const trustedDenials = new WeakMap<Response, TrustedPreflightSnapshotV1>();

function unchangedTrustedDenial(response: Response): boolean {
  const snapshot = trustedDenials.get(response);
  if (snapshot === undefined ||
      response.status !== snapshot.status ||
      response.status < 400 || response.status > 499 ||
      response.headers.get('cache-control') !== NO_STORE ||
      response.bodyUsed || response.body?.locked === true) {
    return false;
  }
  const entries = [...response.headers.entries()];
  return entries.length === snapshot.headers.length &&
    entries.every(([key, value], index) =>
      snapshot.headers[index]?.[0] === key &&
      snapshot.headers[index]?.[1] === value);
}

// Only these static error tuples may be exposed as a 4xx. An arbitrary
// Response, caller-owned body or extra JSON field cannot be registered.
const STATIC_JSON_DENIALS_V1 = Object.freeze([
  [400, 'INVALID_REQUEST', 'request.invalid', false],
  [401, 'AUTH_REQUIRED', 'auth.required', false],
  [403, 'FORBIDDEN', 'chat.member_required', false],
  [404, 'NOT_FOUND', 'chat.not_found', false],
  [408, 'REQUEST_BODY_TIMEOUT', 'auth.request_body_timeout', false],
  [409, 'IDEMPOTENCY_CONFLICT', 'chat.idempotency_conflict', false],
  [409, 'TURN_IN_FLIGHT', 'chat.turn_in_flight', true],
  [409, 'TURN_IN_FLIGHT', 'chat.pending_turn_must_be_retried', true],
  [409, 'CONTENT_INCOMPATIBLE', 'chat.content_incompatible', false],
  [413, 'REQUEST_TOO_LARGE', 'request.too_large', false],
  [422, 'CONTENT_INCOMPATIBLE', 'chat.content_incompatible', false],
] as const);

export type SeyeonVercelStaticPreflightDenialInputV1 = Readonly<{
  status: number;
  code: string;
  messageKey: string;
  retryable: boolean;
  requestId: string;
}>;

function trustConstructedStaticDenial(response: Response): Response {
  trustedDenials.set(response, {
    status: response.status,
    headers: [...response.headers.entries()],
  });
  return response;
}

/**
 * Server-controlled immutable 4xx construction only. The caller cannot
 * submit a Response or an arbitrary JSON body to the final Fetch fence.
 */
export function createSeyeonVercelStaticPreflightDenialV1(
  input: SeyeonVercelStaticPreflightDenialInputV1,
): Response {
  const allowed = STATIC_JSON_DENIALS_V1.some(([status, code, messageKey, retryable]) =>
    input.status === status &&
    input.code === code &&
    input.messageKey === messageKey &&
    input.retryable === retryable);
  if (!allowed) {
    throw new Error('Unapproved Se-yeon static preflight denial tuple.');
  }
  return trustConstructedStaticDenial(Response.json({
    ok: false,
    error: {
      code: input.code,
      messageKey: input.messageKey,
      retryable: input.retryable,
    },
    meta: { apiContractVersion: 'v0.9', requestId: input.requestId },
  }, { status: input.status, headers: { 'Cache-Control': NO_STORE } }));
}

export function createSeyeonVercelEmptyPreflightDenialV1(
  kind: 'not_found' | 'method_not_allowed',
): Response {
  return trustConstructedStaticDenial(new Response(null, {
    status: kind === 'not_found' ? 404 : 405,
    headers: kind === 'not_found'
      ? { 'Cache-Control': NO_STORE }
      : { Allow: 'POST', 'Cache-Control': NO_STORE },
  }));
}

export const SEYEON_VERCEL_FETCH_REVEAL_FENCE_V1 = Object.freeze({
  schemaVersion: 'seyeon-vercel-fetch-first-reveal-fence-v1',
  transport: 'vercel:web-fetch-response',
  positiveFirstRevealPermitted: false,
  routeMounted: true,
  nodeOwnedSocketHandoffProven: false,
  proxyHandoffProven: false,
} as const);

/**
 * Outer HTTP dispatch interlock; intentionally INDEPENDENT of the inner
 * pre-provider HOLD. It prevents accidental 200/streaming/5xx assistant
 * payloads being serialized by Vercel after a future handler refactor.
 *
 * The only pass-through is existing, non-streaming 4xx preflight denials,
 * which the current chat-turn handler builds before any assistant execution.
 * All other result bodies are discarded and replaced with a fixed 503.
 *
 * This guard is not authorization and cannot make Fetch Response S/R-atomic.
 */
export function enforceSeyeonVercelFetchRevealFenceV1(
  candidate: Response,
  requestId: string,
): Response {
  // A registered 4xx must remain the exact, unread HTTP response
  // constructed by the server's preflight handler. A later header rewrite
  // or premature body consumption cannot silently become Reveal authority.
  if (unchangedTrustedDenial(candidate)) return candidate;

  // Explicitly dispose of the old response without reading or copying a
  // possible protected body, even when it was a 503 error.
  if (candidate.body !== null && !candidate.bodyUsed) {
    try {
      void candidate.body.cancel().catch(() => undefined);
    } catch {
      // Cancellation must not determine whether the hard 503 is sent.
    }
  }

  return Response.json({
    ok: false,
    error: {
      code: 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',
      messageKey: 'chat.secure_reveal_unavailable',
      retryable: false,
    },
    meta: { apiContractVersion: 'v0.9', requestId },
  }, { status: 503, headers: { 'Cache-Control': NO_STORE } });
}
