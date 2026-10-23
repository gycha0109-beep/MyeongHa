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

export function registerSeyeonStaticPreflightDenialV1(
  response: Response,
): Response {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (
    response.status < 400 || response.status > 499 ||
    response.headers.get('cache-control') !== NO_STORE ||
    contentType.includes('text/event-stream')
  ) {
    throw new Error('Untrusted Se-yeon preflight denial cannot be registered.');
  }
  if (response.bodyUsed || response.body?.locked === true) {
    throw new Error('Consumed Se-yeon preflight denial cannot be registered.');
  }
  trustedDenials.set(response, {
    status: response.status,
    headers: [...response.headers.entries()],
  });
  return response;
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
