// Watchtower-Track: security
// S-CF2 Security-owned OFFLINE contract. Ops owns Worker routing/mounting.
// This module never authorizes protected replies or general chat responses.
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  getChatThreadRuntimeBinding,
} from './chat-thread-runtime-binding-read.js';
import { createPostgresChatThreadRuntimeBindingAuthorityPortV1 } from './postgres-chat-thread-runtime-binding.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import {
  classifySeyeonCloudflareChatRouteV1,
  holdSeyeonCloudflareProtectedChatRouteV1,
} from './seyeon-cloudflare-protected-chat-route-guard-v1.js';
import { enforceSeyeonCloudflareOfflineFetchEgressFenceV1 } from './seyeon-cloudflare-offline-reveal-fence-v1.js';

export const SEYEON_CLOUDFLARE_OWNED_THREAD_SCOPE_V1 = Object.freeze({
  schemaVersion: 'seyeon-cloudflare-owned-thread-scope-v1',
  threadAuthority: 'public.qry_chat_thread_runtime_binding_v1',
  subjectAuthority: 'server-verified-evidence+transaction-local-canonical-subject:v1',
  publicRouteMounted: false,
  positiveRevealEnabled: false,
  unrelatedChatReplyAuthorized: false,
  workerEdgeSendProven: false,
} as const);

// Unrelated means ONLY "not SeYeon according to an active, owner-bound DB
// participant read". The Ops generic handler MUST independently authorize
// and re-read its source before ever returning a chat response.
export type SeyeonCloudflareThreadScopeDecisionV1 =
  | Readonly<{ kind: 'not_chat' }>
  | Readonly<{ kind: 'chat_open_requires_ops_authority' }>
  | Readonly<{ kind: 'unrelated_thread_requires_ops_reauthorization'; threadId: string }>
  | Readonly<{ kind: 'seyeon_protected_held'; threadId: string; response: Response }>
  | Readonly<{ kind: 'denied'; response: Response }>;

function held(requestId: string): Response {
  return enforceSeyeonCloudflareOfflineFetchEgressFenceV1(null, requestId);
}

// Chat history GET supports only the existing read controller's pagination
// keys; all other query, replay markers and duplicate controls deny before DB.
function validReadQuery(url: URL): boolean {
  const params = url.searchParams;
  for (const key of params.keys()) {
    if (key !== 'afterSequenceNo' && key !== 'pageSize') return false;
  }
  const cursor = params.getAll('afterSequenceNo');
  if (cursor.length > 1) return false;
  if (cursor.length === 1) {
    const value = cursor[0];
    if (value === undefined || !/^(0|[1-9][0-9]*)$/u.test(value) ||
        !Number.isSafeInteger(Number(value))) return false;
  }
  const sizes = params.getAll('pageSize');
  if (sizes.length > 1) return false;
  if (sizes.length === 1) {
    const value = sizes[0];
    if (value === undefined || !/^[1-9][0-9]*$/u.test(value)) return false;
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n > 50) return false;
  }
  return true;
}

/**
 * Offline route-scope decision for an explicit Ops /api/chat boundary.
 * Auth evidence is verified server-side and resolved inside the existing
 * least-privilege PostgreSQL subject transaction; original thread participants
 * come from the existing owner-scoped query. Never use client characterId,
 * a rewrite marker, a cached thread label or an unscoped SQL query.
 *
 * Protected/mixed SeYeon threads always run the independent first/History/
 * Replay HOLD. Unknown/bad DB state is a fixed 503/no-store, not an HTML
 * fallback. Unrelated threads receive NO response or admission token here.
 *
 * This contract alone is NOT a mounted Worker router or a transport G0-D04
 * proof. The Ops handler must independently reauthorize unrelated-thread
 * requests; a later participant change cannot be bypassed with this result.
 */
export async function scopeSeyeonCloudflareOwnedChatRequestV1(input: Readonly<{
  request: Request;
  requestId: string;
  identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  pool: PostgresSubjectPoolV1;
}>): Promise<SeyeonCloudflareThreadScopeDecisionV1> {
  let route: ReturnType<typeof classifySeyeonCloudflareChatRouteV1>;
  try {
    const url = new URL(input.request.url);
    if (url.hash !== '') return { kind: 'denied', response: held(input.requestId) };
    // Classification is pathname-based; validate query separately using
    // the existing API surface, never strip it from the actual downstream request.
    route = classifySeyeonCloudflareChatRouteV1(
      new Request(url.origin + url.pathname),
    );
    if (route.kind === 'malformed_or_unknown_chat' ||
        (route.kind === 'thread_read' && !validReadQuery(url)) ||
        (route.kind !== 'thread_read' && url.search !== '')) {
      return { kind: 'denied', response: held(input.requestId) };
    }
  } catch {
    return { kind: 'denied', response: held(input.requestId) };
  }

  if (route.kind === 'not_chat') return { kind: 'not_chat' };
  if (route.kind === 'chat_open') {
    // No Thread/Participant yet. This NEVER classifies user-supplied
    // characterId as an authorized unrelated-chat response.
    return { kind: 'chat_open_requires_ops_authority' };
  }
  // Every other classification was already rejected above.
  if (route.kind !== 'thread_read' && route.kind !== 'turn_send') {
    return { kind: 'denied', response: held(input.requestId) };
  }

  try {
    const evidence = await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
    if (evidence === null || evidence.kind !== 'member') {
      return { kind: 'denied', response: held(input.requestId) };
    }
    const binding = await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence: evidence,
      execute: ({ resolvedSubject, client }) =>
        getChatThreadRuntimeBinding({
          resolvedSubjectId: resolvedSubject.subjectId,
          threadId: route.threadId,
          authorityPort: createPostgresChatThreadRuntimeBindingAuthorityPortV1(client),
        }),
    });

    if (!binding.participantCharacterIds.includes('seyeon')) {
      return {
        kind: 'unrelated_thread_requires_ops_reauthorization',
        threadId: route.threadId,
      };
    }

    const response = await holdSeyeonCloudflareProtectedChatRouteV1({
      request: input.request,
      requestId: input.requestId,
      identityEvidenceVerifier: input.identityEvidenceVerifier,
    });
    return {
      kind: 'seyeon_protected_held',
      threadId: route.threadId,
      response: enforceSeyeonCloudflareOfflineFetchEgressFenceV1(response, input.requestId),
    };
  } catch {
    // Includes unknown DB state, fail/rollback/release, query row mismatch and
    // verifier failures. Never return a generic-handler pass-through on error.
    return { kind: 'denied', response: held(input.requestId) };
  }
}
