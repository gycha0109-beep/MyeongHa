// Watchtower-Track: security
// S-CF preflight extraction shared by Vercel and the unmounted Cloudflare
// deny-only adapter. This module deliberately has NO Vercel/Node/Provider/DB
// runtime imports, no Reveal admission and no candidate assistant response.
import {
  AuthenticatedJsonRequestBodyTooLargeV1,
  readAuthenticatedJsonRequestBodyV1,
} from './authenticated-json-request-resource.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import {
  createIngressRequestBodyCompletionDeadlineLeaseV1,
  IngressRequestBodyCompletionDeadlineExceededV1,
} from './ingress-request-body-deadline.js';

const ROUTE_PREFIX = '/api/chat/' as const;
const ROUTE_SUFFIX = '/turns' as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const SEYEON_CHAT_TURN_SEND_PREFLIGHT_CORE_V1 = Object.freeze({
  schemaVersion: 'seyeon-chat-turn-send-preflight-core-v1',
  method: 'POST',
  route: '/api/chat/:threadId/turns',
  maxTextCharacters: 8_000,
  protectedReplyPermitted: false,
  usesNodeRuntime: false,
} as const);

export type SeyeonChatTurnSendPreflightDenialReasonV1 =
  | 'not_found'
  | 'method_not_allowed'
  | 'auth_required'
  | 'forbidden'
  | 'request_too_large'
  | 'request_body_timeout'
  | 'invalid_request';

export type SeyeonChatTurnSendPreflightCoreResultV1 =
  | Readonly<{ kind: 'denied'; reason: SeyeonChatTurnSendPreflightDenialReasonV1 }>
  | Readonly<{
      kind: 'admitted';
      verifiedEvidence: Extract<VerifiedSubjectIdentityEvidenceV1, { kind: 'member' }>;
      threadId: string;
      clientTurnId: string;
      text: string;
    }>;

function parseRoute(request: Request): string | null {
  const url = new URL(request.url);
  if (url.search !== '' || url.hash !== '' ||
      !url.pathname.startsWith(ROUTE_PREFIX) ||
      !url.pathname.endsWith(ROUTE_SUFFIX)) return null;
  const raw = url.pathname.slice(ROUTE_PREFIX.length, -ROUTE_SUFFIX.length);
  if (raw === '' || raw.includes('/')) return null;
  try {
    const id = decodeURIComponent(raw);
    return UUID.test(id) ? id : null;
  } catch {
    return null;
  }
}

function parseBody(input: unknown): Readonly<{
  clientTurnId: string;
  text: string;
}> | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== 'clientTurnId' || keys[1] !== 'text') return null;
  if (typeof record.clientTurnId !== 'string' || !UUID.test(record.clientTurnId)) return null;
  if (typeof record.text !== 'string') return null;
  const text = record.text.trim();
  if (!text || text.length > SEYEON_CHAT_TURN_SEND_PREFLIGHT_CORE_V1.maxTextCharacters) return null;
  return Object.freeze({ clientTurnId: record.clientTurnId, text });
}

async function boundedBody(request: Request): Promise<unknown> {
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
 * Identical strict route/member/body decisions on both platforms, but returns
 * reasons rather than a runtime-owned Response. A verified member here does
 * NOT prove original Memory/Grant, Thread owner or G0-D04 Reveal authorization.
 *
 * The verifier is injected by each platform's Auth owner. No client-provided
 * Subject ID, Grant ID, positive context or conversation history is consumed.
 */
export async function preflightSeyeonChatTurnSendCoreV1(input: Readonly<{
  request: Request;
  identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
}>): Promise<SeyeonChatTurnSendPreflightCoreResultV1> {
  const threadId = parseRoute(input.request);
  if (threadId === null) return { kind: 'denied', reason: 'not_found' };
  if (input.request.method !== 'POST') return { kind: 'denied', reason: 'method_not_allowed' };

  const verifiedEvidence = await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
  if (verifiedEvidence === null) return { kind: 'denied', reason: 'auth_required' };
  if (verifiedEvidence.kind !== 'member') return { kind: 'denied', reason: 'forbidden' };

  let rawBody: unknown;
  try {
    rawBody = await boundedBody(input.request);
  } catch (error) {
    if (error instanceof AuthenticatedJsonRequestBodyTooLargeV1) {
      return { kind: 'denied', reason: 'request_too_large' };
    }
    if (error instanceof IngressRequestBodyCompletionDeadlineExceededV1) {
      return { kind: 'denied', reason: 'request_body_timeout' };
    }
    return { kind: 'denied', reason: 'invalid_request' };
  }
  const body = parseBody(rawBody);
  if (body === null) return { kind: 'denied', reason: 'invalid_request' };
  return Object.freeze({
    kind: 'admitted',
    verifiedEvidence,
    threadId,
    clientTurnId: body.clientTurnId,
    text: body.text,
  });
}
