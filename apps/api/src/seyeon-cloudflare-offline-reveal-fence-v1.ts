// Watchtower-Track: security
// S-CF1 OFFLINE ONLY. This module has no Cloudflare imports, Worker router,
// Provider or DB adapter. Vercel Production retains its own independent fence.
// The Cloudflare /api/* entrypoint is NOT mounted by this change.
import { SeyeonFirstHttpRevealHoldV1 } from './seyeon-first-http-reveal-hold-v1.js';

const NO_STORE = 'no-store' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;
const DENIAL_CODE = 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE' as const;
const DENIAL_MESSAGE_KEY = 'chat.secure_reveal_unavailable' as const;

// The caller cannot register an arbitrary Response as safe. Static preflight
// errors must be created HERE from an exact, reviewed allowlist. In particular,
// assistant text, external JSON, caller-provided code and streaming bodies
// cannot enter any pass-through response.
const STATIC_DENIALS = Object.freeze({
  invalid_request: { status: 400, code: 'INVALID_REQUEST', messageKey: 'request.invalid', retryable: false },
  auth_required: { status: 401, code: 'AUTH_REQUIRED', messageKey: 'auth.required', retryable: false },
  forbidden: { status: 403, code: 'FORBIDDEN', messageKey: 'chat.member_required', retryable: false },
  not_found: { status: 404, code: 'NOT_FOUND', messageKey: 'chat.not_found', retryable: false },
  method_not_allowed: { status: 405, code: 'METHOD_NOT_ALLOWED', messageKey: 'request.method_not_allowed', retryable: false },
  request_body_timeout: { status: 408, code: 'REQUEST_BODY_TIMEOUT', messageKey: 'auth.request_body_timeout', retryable: false },
  idempotency_conflict: { status: 409, code: 'IDEMPOTENCY_CONFLICT', messageKey: 'chat.idempotency_conflict', retryable: false },
  turn_in_flight: { status: 409, code: 'TURN_IN_FLIGHT', messageKey: 'chat.turn_in_flight', retryable: true },
  request_too_large: { status: 413, code: 'REQUEST_TOO_LARGE', messageKey: 'request.too_large', retryable: false },
  content_incompatible: { status: 422, code: 'CONTENT_INCOMPATIBLE', messageKey: 'chat.content_incompatible', retryable: false },
} as const);

export type SeyeonCloudflareStaticPreflightKindV1 = keyof typeof STATIC_DENIALS;

interface TrustedDenialSnapshot {
  readonly status: number;
  readonly headerEntries: readonly (readonly [string, string])[];
}
const trustedPreflight = new WeakMap<Response, TrustedDenialSnapshot>();

export const SEYEON_CLOUDFLARE_OFFLINE_REVEAL_FENCE_V1 = Object.freeze({
  schemaVersion: 'seyeon-cloudflare-offline-reveal-fence-v1',
  transport: 'cloudflare:fetch-response-candidate',
  publicRouteMounted: false,
  positiveFirstRevealPermitted: false,
  firstRevealBeforeProviderHeld: true,
  actualCloudflareEdgeSendProven: false,
  revokeSendAckContractApproved: false,
} as const);

function validServerRequestId(requestId: unknown): requestId is string {
  // The actual security observer issues crypto.randomUUID() values. A
  // merely bounded string could be caller-supplied sensitive text and MUST
  // NOT be copied into a public error's meta.requestId.
  return typeof requestId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(requestId);
}

function safeServerRequestId(requestId: unknown): string {
  return validServerRequestId(requestId) ? requestId : 'unavailable';
}

function errorResponse(input: Readonly<{
  status: number;
  code: string;
  messageKey: string;
  retryable: boolean;
  requestId: string;
}>): Response {
  return Response.json({
    ok: false,
    error: {
      code: input.code,
      messageKey: input.messageKey,
      retryable: input.retryable,
    },
    meta: { apiContractVersion: API_CONTRACT_VERSION, requestId: input.requestId },
  }, { status: input.status, headers: { 'Cache-Control': NO_STORE } });
}

function fixedRevealHold(requestId: unknown): Response {
  return errorResponse({
    status: 503,
    code: DENIAL_CODE,
    messageKey: DENIAL_MESSAGE_KEY,
    retryable: false,
    requestId: safeServerRequestId(requestId),
  });
}

/**
 * Pre-Provider G3 admission. No continuations are accepted and no Provider,
 * DB Commit or other protected handler is called, even if a future handler
 * can generate a successful candidate. First Reveal must remain 503 until
 * G0-D04 and the Cloudflare edge/DB contract are independently approved.
 *
 * Existing SeyeonFirstHttpRevealHoldV1 is intentionally reused as the
 * authority/error identifier, but is NOT assumed to authorize any output.
 */
export function denySeyeonCloudflareFirstRevealBeforeProviderV1(
  requestId: string,
): Response {
  const denial = new SeyeonFirstHttpRevealHoldV1();
  if (denial.code !== DENIAL_CODE) {
    throw new Error('SeYeon first Reveal authority contract changed.');
  }
  return fixedRevealHold(requestId);
}

/**
 * A composed first POST offline seam: even a supplied handler that would
 * perform expensive/unsafe work is NEVER evaluated. This is a separate
 * ingress HOLD, not the final egress fence or future positive admission.
 */
export async function executeSeyeonCloudflareOfflineFirstRevealV1(input: Readonly<{
  requestId: string;
  executeProtectedCandidate: () => Response | Promise<Response>;
}>): Promise<Response> {
  return denySeyeonCloudflareFirstRevealBeforeProviderV1(input.requestId);
}

/**
 * Only this factory can construct a trusted pass-through 4xx object.
 * A caller cannot register their own 4xx response, attach secret text,
 * select a custom code or inject extra headers.
 */
export function createSeyeonCloudflareStaticPreflightDenialV1(input: Readonly<{
  kind: SeyeonCloudflareStaticPreflightKindV1;
  requestId: string;
}>): Response {
  if (!validServerRequestId(input.requestId)) {
    throw new Error('Static SeYeon denial requires a safe server request ID.');
  }
  if (!Object.hasOwn(STATIC_DENIALS, input.kind)) {
    throw new Error('Unknown static SeYeon preflight denial kind.');
  }

  const spec = STATIC_DENIALS[input.kind];
  const response = input.kind === 'method_not_allowed'
    ? new Response(null, {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': NO_STORE },
    })
    : errorResponse({ ...spec, requestId: input.requestId });

  trustedPreflight.set(response, {
    status: response.status,
    headerEntries: [...response.headers.entries()],
  });
  return response;
}

function unchangedTrustedDenial(candidate: Response): boolean {
  const snapshot = trustedPreflight.get(candidate);
  if (!snapshot || candidate.status !== snapshot.status ||
      candidate.status < 400 || candidate.status > 499 ||
      candidate.headers.get('cache-control') !== NO_STORE ||
      candidate.bodyUsed || candidate.body?.locked === true) {
    return false;
  }
  const headers = [...candidate.headers.entries()];
  return headers.length === snapshot.headerEntries.length &&
    headers.every(([name, value], index) => {
      const original = snapshot.headerEntries[index];
      return original !== undefined && name === original[0] && value === original[1];
    });
}

function discardProtectedBodyBestEffort(candidate: Response): void {
  try {
    if (candidate.body !== null && !candidate.bodyUsed && !candidate.body.locked) {
      void candidate.body.cancel().catch(() => undefined);
    }
  } catch {
    // Cancellation cannot decide whether protected output becomes visible.
  }
}

/**
 * Last outbound Fetch fence for ANY possibly protected assistant response.
 * Returning Response / resolving a stream is NOT an actual Edge/proxy/client
 * send ACK or permission to reveal. All untrusted bodies are abandoned.
 */
export function enforceSeyeonCloudflareOfflineFetchEgressFenceV1(
  candidate: unknown,
  requestId: string,
): Response {
  if (candidate instanceof Response) {
    try {
      if (unchangedTrustedDenial(candidate)) return candidate;
    } catch {
      // Malformed response objects never become an authorization bypass.
    }
    discardProtectedBodyBestEffort(candidate);
  }
  return fixedRevealHold(requestId);
}

/**
 * Offline API-adapter test seam for throws, timeouts and async handler results.
 * This is an EGRESS interlock, NOT a substitute for the independent,
 * non-optional pre-Provider first Reveal admission above.
 */
export async function executeSeyeonCloudflareOfflineEgressFenceV1(input: Readonly<{
  requestId: string;
  executeCandidate: () => Response | Promise<Response>;
}>): Promise<Response> {
  let candidate: unknown;
  try {
    candidate = await input.executeCandidate();
  } catch {
    return fixedRevealHold(input.requestId);
  }
  return enforceSeyeonCloudflareOfflineFetchEgressFenceV1(candidate, input.requestId);
}
