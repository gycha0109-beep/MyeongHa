import { createCloudflareSubjectPoolV1 } from './cloudflare-hyperdrive-subject-pool.mjs';
// Ops stage 4 / S-CF2: mount existing Security-owned fail-closed boundaries.
// Server-owned DB participant scope is mandatory before distinguishing SeYeon
// from other Characters. Never authorize a positive protected response here.
// No Provider, protected DB Commit, replay or history runtime is connected.
// Watchtower-Track: ops
import {
  approvedCloudflareAuthOriginV1,
  approvedCloudflareSameOriginPostV1,
  approvedCloudflareStage5HandoffV1,
  approvedCloudflarePostgresTargetV1,
  CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1,
} from './cloudflare-auth-db-api.mjs';
import {
  classifySeyeonCloudflareChatRouteV1,
} from '../apps/api/src/seyeon-cloudflare-protected-chat-route-guard-v1.ts';
import {
  scopeSeyeonCloudflareOwnedChatRequestV1,
} from '../apps/api/src/seyeon-cloudflare-owned-thread-scope-v1.ts';
import {
  denySeyeonCloudflareFirstRevealBeforeProviderV1,
  enforceSeyeonCloudflareOfflineFetchEgressFenceV1,
} from '../apps/api/src/seyeon-cloudflare-offline-reveal-fence-v1.ts';
import { parseProductionUserDataRuntimeConfigV1 } from '../apps/api/src/production-user-data-runtime-config.ts';
import { createProductionRequestIdentityVerifierV1 } from '../apps/api/src/production-request-identity-verifier.ts';
import { buildProductionNodePostgresPoolConfigV1 } from '../apps/api/src/node-postgres-subject-pool.ts';
import { CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1 } from '../apps/api/src/cloudflare-direct-postgres-candidate.ts';

export const CLOUDFLARE_SEYEON_EGRESS_STAGES_V1 = Object.freeze([
  'first_reveal', 'committed_replay', 'history',
]);

/** The public request cannot distinguish first-send from committed replay.
 * Only a future DB-authoritative server operation may make that distinction. */
export function classifyCloudflareChatIngressV1(request) {
  let url;
  try { url = new URL(request.url); } catch { return null; }
  const path = url.pathname;
  if (path !== '/api/chat' && !path.startsWith('/api/chat/')) return null;
  const route = classifySeyeonCloudflareChatRouteV1(
    new Request(url.origin + path),
  );
  if (route.kind === 'turn_send') return Object.freeze({
    kind: 'first_post_or_committed_replay', threadId: route.threadId,
  });
  if (route.kind === 'thread_read') return Object.freeze({
    kind: 'history', threadId: route.threadId,
  });
  if (route.kind === 'chat_open') return Object.freeze({ kind: 'chat_open' });
  return Object.freeze({ kind: 'malformed_or_unknown_chat' });
}

/** Security ingress hook. Does not accept a next()/Provider continuation. */
export function holdCloudflareSeyeonBeforeProviderV1(requestId) {
  return denySeyeonCloudflareFirstRevealBeforeProviderV1(requestId);
}

/** Security egress hook. Rejects unregistered 4xx, successful JSON, SSE,
 * redirects, forged 503, and protected Replay/History from any caller. */
export function fenceCloudflareSeyeonBeforeFetchReturnV1(candidate, requestId) {
  return enforceSeyeonCloudflareOfflineFetchEgressFenceV1(candidate, requestId);
}

function enforceHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1)) {
    headers.set(key, value);
  }
  headers.delete('Access-Control-Allow-Origin');
  headers.delete('Access-Control-Allow-Credentials');
  return new Response(response.body, {
    status: response.status, statusText: response.statusText, headers,
  });
}

function held(requestId) {
  return enforceHeaders(fenceCloudflareSeyeonBeforeFetchReturnV1(null, requestId));
}

// Reject-only shape check before even constructing a PostgreSQL lease.
 // Security-owned scope repeats the authoritative query admission inside its
 // verified identity+thread-bound transaction. This check grants nothing.
function validHistoryQueryShape(url) {
  for (const key of url.searchParams.keys()) {
    if (key !== 'afterSequenceNo' && key !== 'pageSize') return false;
  }
  const cursors = url.searchParams.getAll('afterSequenceNo');
  const sizes = url.searchParams.getAll('pageSize');
  if (cursors.length > 1 || sizes.length > 1) return false;
  if (cursors.length === 1) {
    const s = cursors[0];
    if (!/^(0|[1-9][0-9]*)$/.test(s) || !Number.isSafeInteger(Number(s))) return false;
  }
  if (sizes.length === 1) {
    const s = sizes[0];
    if (!/^[1-9][0-9]*$/.test(s) ||
        !Number.isSafeInteger(Number(s)) || Number(s) > 50) return false;
  }
  return true;
}

function isExplicitChatRoute(route, pathname) {
  return route?.id === 'rewrite.chat.open' ||
    route?.id === 'rewrite.chat.thread' ||
    route?.id === 'rewrite.chat.turns' ||
    pathname === '/api/chat' || pathname.startsWith('/api/chat/');
}

function createDefaultSubjectScope(bindings) {
  const config = parseProductionUserDataRuntimeConfigV1(bindings);
  // Create the verifier BEFORE the PostgreSQL lease. If its configuration
  // fails, no pool has been allocated and nothing can remain unclosed.
  if(!approvedCloudflarePostgresTargetV1(config,bindings)) throw Error('Unapproved scoped chat DB host');
  const strict=buildProductionNodePostgresPoolConfigV1(
    config,CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1,
  );
  if(strict.max!==1||typeof strict.ssl!=='object'||strict.ssl===null||
     strict.ssl.rejectUnauthorized!==true) throw Error('Unapproved scoped chat TLS');
  const identityEvidenceVerifier = createProductionRequestIdentityVerifierV1({ config });
  const pool=createCloudflareSubjectPoolV1(config,bindings, CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1);
  return { pool, identityEvidenceVerifier, close: () => pool.close() };
}

/**
 * @returns {Promise<Response|null>}
 * null only for a non-chat API or a DB-confirmed unrelated Character thread.
 * Such a thread receives NO reply or admission token from this adapter. The
 * independent generic Chat handler must reauthorize it; today's fallback is 404.
 *
 * Dependencies are server-side only (used by isolated offline regression
 * tests). Client headers, body, query markers and Worker env cannot supply a
 * scope verdict or grant protected response authority.
 */
export async function tryHandleCloudflareSeyeonSecurityV1(
  request, bindings, route, dependencies = {},
) {
  const url = new URL(request.url);
  if (!isExplicitChatRoute(route, url.pathname)) return null;
  const ingress = classifyCloudflareChatIngressV1(request);
  const requestId = crypto.randomUUID();
  if (ingress === null) return held(requestId);

  // Malformed, unsupported and method-confused /api/chat requests must never
  // touch DB, Auth, Provider or Static Assets. No client rewrite markers.
  const expectedMethod = ingress.kind === 'history' ? 'GET' : 'POST';
  if (ingress.kind === 'malformed_or_unknown_chat' ||
      request.method !== expectedMethod ||
      (ingress.kind !== 'history' && url.search !== '') ||
      (ingress.kind === 'history' && !validHistoryQueryShape(url))) {
    return held(requestId);
  }

  // Chat open contains a client characterId, not a trusted DB participant.
  // It stays in the independent generic Chat boundary, which is still HOLD.
  if (ingress.kind === 'chat_open') return null;

  const origin = approvedCloudflareAuthOriginV1(request, bindings);
  if (origin === null ||
      !approvedCloudflareStage5HandoffV1(bindings,origin,false)) return held(requestId);
  // An eventually approved Cookie/Bearer Chat POST must pass the same
  // browser-origin admission as the existing Auth/DB adapter. Fail closed
  // before verifying identity or touching the owner-scoped PostgreSQL pool.
  if (request.method === 'POST' &&
      !approvedCloudflareSameOriginPostV1(request, origin)) {
    return held(requestId);
  }
  // Never interpret request-supplied Character/Grant/replay/permission flags.
  let resources;
  let verdict;
  try {
    resources = (dependencies.createSubjectScope ?? createDefaultSubjectScope)(bindings);
    verdict = await (dependencies.scope ?? scopeSeyeonCloudflareOwnedChatRequestV1)({
      request,
      requestId,
      identityEvidenceVerifier: resources.identityEvidenceVerifier,
      pool: resources.pool,
    });
  } catch {
    return held(requestId);
  } finally {
    // Never cache a DB pool/verifier/scope verdict across Worker requests.
    try {
      await resources?.close();
    } catch {
      return held(requestId);
    }
  }
  if ((verdict?.kind === 'unrelated_thread_requires_ops_reauthorization' ||
       ((verdict?.kind === 'seyeon_empty_thread_requires_ops_reauthorization' ||
         verdict?.kind === 'seyeon_existing_thread_shell_requires_ops_reauthorization') &&
        ingress.kind === 'history')) &&
      verdict.threadId === ingress.threadId) {
    // No positive response crosses this fence. The independent generic Chat
    // reader must authenticate again, verify DB ownership and the present
    // absence of every Se-yeon message before any empty shell is returned.
    return null;
  }
  // Historical message content, mixed rooms, pagination and uncertain verdicts remain held.
  // Even a malicious injected success or forged 4xx cannot cross this fence.
  return enforceHeaders(fenceCloudflareSeyeonBeforeFetchReturnV1(
    verdict?.kind === 'seyeon_protected_held' || verdict?.kind === 'denied'
      ? verdict.response
      : null,
    requestId,
  ));
}
