// Watchtower-Track: security
// S-CF2 handoff contract ONLY; not a Cloudflare Worker entrypoint.
// Ops owns the real Worker API router, raw-path admission and thread scope.
// No public mount, Provider, DB connection, Replay, History or positive response.
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  classifySeyeonCloudflareChatRouteV1,
  holdSeyeonCloudflareProtectedChatRouteV1,
} from './seyeon-cloudflare-protected-chat-route-guard-v1.js';
import {
  denySeyeonCloudflareFirstRevealBeforeProviderV1,
  enforceSeyeonCloudflareOfflineFetchEgressFenceV1,
} from './seyeon-cloudflare-offline-reveal-fence-v1.js';

export const SEYEON_CLOUDFLARE_OPS_ROUTER_HANDOFF_OFFLINE_V1 = Object.freeze({
  schemaVersion: 'seyeon-cloudflare-ops-router-handoff-offline-v1',
  publicRouteMounted: false,
  opsWorkerRouterPresent: false,
  opsSignedThreadScopeAvailable: false,
  actualEdgeSendProven: false,
  positiveRevealPermitted: false,
  mayServeStaticAssetsForApi: false,
} as const);

/**
 * Ops must derive this from its own exact route matcher and authoritative
 * lineage/participant scope. Never accept it from a query, header, cookie,
 * client Character ID or rewrite marker. "other_api" is NOT permission to
 * reveal any SeYeon-derived personal record in that handler.
 */
export type SeyeonCloudflareOpsRouteDispositionOfflineV1 =
  | 'protected_chat'
  | 'other_api'
  | 'static_asset'
  | 'unresolved_shared_lineage';

function apiOrChatAlias(request: Request): Readonly<{
  api: boolean;
  chatAlias: boolean;
}> {
  try {
    const { pathname } = new URL(request.url);
    const api = pathname === '/api' || pathname.startsWith('/api/');
    if (!api) return { api: false, chatAlias: false };
    const segment = pathname.split('/')[2] ?? '';
    // Exact chat classifier handles canonical /api/chat*. This closes
    // percent-encoded path-segment aliases BEFORE a mock Ops asset fallback.
    // WHATWG URL normalization may ALREADY have erased raw dot-segments;
    // Ops must reject those at the actual ingress boundary separately.
    let decoded: string;
    try { decoded = decodeURIComponent(segment); }
    catch { return { api: true, chatAlias: true }; }
    const folded = decoded.toLowerCase();
    return {
      api: true,
      chatAlias: /^chat(?:$|[\/\\.;\u0000])/u.test(folded),
    };
  } catch {
    return { api: true, chatAlias: true };
  }
}

function sealedDenial(requestId: string): Response {
  return enforceSeyeonCloudflareOfflineFetchEgressFenceV1(
    denySeyeonCloudflareFirstRevealBeforeProviderV1(requestId), requestId,
  );
}

/**
 * Unmounted handoff intended to sit AFTER Ops route classification and BEFORE
 * its asset/API dispatch. Returns null only where this Security module makes
 * NO claim: other explicitly routed non-chat API or non-API static assets.
 *
 * For every chat/ambiguous protected URL, the actual protected handler,
 * static fetch, generic API dispatch and post-guard mutation are impossible:
 * this adapter accepts NO continuation and always returns a sealed denial.
 */
export async function holdSeyeonCloudflareOpsRouterHandoffOfflineV1(input: Readonly<{
  request: Request;
  requestId: string;
  opsRouteDisposition: SeyeonCloudflareOpsRouteDispositionOfflineV1;
  identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
}>): Promise<Response | null> {
  const route = classifySeyeonCloudflareChatRouteV1(input.request);
  const path = apiOrChatAlias(input.request);
  const protectedOrAmbiguous = route.kind !== 'not_chat' || path.chatAlias;

  if (protectedOrAmbiguous) {
    // The exact canonical chat route may take the existing, independently
    // fail-closed preflight; a router mismatch is always a hard 503.
    if (input.opsRouteDisposition === 'protected_chat' &&
        route.kind !== 'not_chat') {
      try {
        const held = await holdSeyeonCloudflareProtectedChatRouteV1(input);
        return enforceSeyeonCloudflareOfflineFetchEgressFenceV1(
          held, input.requestId,
        );
      } catch {
        return sealedDenial(input.requestId);
      }
    }
    return sealedDenial(input.requestId);
  }

  // No API route may silently fall through to Cloudflare Static Assets.
  // Unknown/mixed shared personal lineage may never be treated as unrelated.
  if (input.opsRouteDisposition === 'protected_chat' ||
      input.opsRouteDisposition === 'unresolved_shared_lineage' ||
      (path.api && input.opsRouteDisposition === 'static_asset')) {
    return sealedDenial(input.requestId);
  }

  // Does not issue any privilege, DB/thread scope, model-source admission, or
  // positive output permission to the OTHER explicitly owned Ops router.
  return null;
}
