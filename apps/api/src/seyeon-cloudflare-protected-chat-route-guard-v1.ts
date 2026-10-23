// Watchtower-Track: security
// S-CF1.6 OFFLINE ONLY. Security-owned route classifier/interlock, NOT the
// Cloudflare Ops Worker entrypoint. Must only be mounted under an explicit
// Ops-owned protected-chat boundary until current DB Thread participants
// can distinguish SeYeon from unrelated characters.
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import { handleSeyeonCloudflareOfflineChatTurnIngressV1 } from './seyeon-cloudflare-offline-chat-turn-ingress-v1.js';
import {
  denySeyeonCloudflareFirstRevealBeforeProviderV1,
  enforceSeyeonCloudflareOfflineFetchEgressFenceV1,
} from './seyeon-cloudflare-offline-reveal-fence-v1.js';

const CHAT = '/api/chat' as const;
const PREFIX = '/api/chat/' as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const SEYEON_CLOUDFLARE_PROTECTED_CHAT_ROUTE_GUARD_V1 = Object.freeze({
  schemaVersion: 'seyeon-cloudflare-protected-chat-route-guard-v1',
  publicRouteMounted: false,
  hostRouterOwnedBy: 'ops',
  noStaticAssetsFallbackForProtectedChat: true,
  threadOwnerVerificationImplemented: false,
  positiveHistoryOrReplayEnabled: false,
  positiveFirstRevealEnabled: false,
} as const);

export type SeyeonCloudflareChatRouteClassificationV1 =
  | Readonly<{ kind: 'not_chat' }>
  | Readonly<{ kind: 'chat_open' }>
  | Readonly<{ kind: 'thread_read'; threadId: string }>
  | Readonly<{ kind: 'turn_send'; threadId: string }>
  | Readonly<{ kind: 'malformed_or_unknown_chat' }>;

/**
 * Recognizes the Vercel rewrite surface without trusting Vercel's private
 * query markers, redirects, client-provided Character IDs, or legacy
 * /api/me dispatch. Unknown /api/chat/* is DENY, not static HTML fallback.
 *
 * The URL is already normalized by WHATWG Request; Ops still owns rejecting
 * incoming raw dot-segments/encoded traversal before its own SPA fallback.
 */
export function classifySeyeonCloudflareChatRouteV1(
  request: Request,
): SeyeonCloudflareChatRouteClassificationV1 {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return { kind: 'malformed_or_unknown_chat' };
  }

  const path = url.pathname;
  if (path !== CHAT && !path.startsWith(PREFIX)) return { kind: 'not_chat' };
  // Query parameters may contain rewrite markers, duplicate selectors,
  // stale page controls or forged path authority. None is granted here.
  if (url.search !== '' || url.hash !== '') return { kind: 'malformed_or_unknown_chat' };

  if (path === CHAT) return { kind: 'chat_open' };
  const parts = path.split('/');
  if ((parts.length !== 4 && parts.length !== 5) ||
      parts[0] !== '' || parts[1] !== 'api' || parts[2] !== 'chat' ||
      !UUID.test(parts[3] ?? '') || parts[3]?.includes('%')) {
    return { kind: 'malformed_or_unknown_chat' };
  }
  const threadId = parts[3]!;
  if (parts.length === 4) return { kind: 'thread_read', threadId };
  if (parts[4] === 'turns') return { kind: 'turn_send', threadId };
  return { kind: 'malformed_or_unknown_chat' };
}

/**
 * Unmounted, NON-positive interlock; protects SeYeon-scoped read/open/replay
 * routes before any DB/Provider/History handler. Returns null only for
 * routes outside /api/chat, which the independently owned Ops router handles.
 *
 * WARNING: /api/chat/:thread is shared with other characters. Without a
 * verified DB participant scope, this OFFLINE interlock must NOT be installed
 * globally over the live generic chat runtime. If Ops cannot establish the
 * scope safely, fail closed instead of returning unrelated chat data.
 */
export async function holdSeyeonCloudflareProtectedChatRouteV1(input: Readonly<{
  request: Request;
  requestId: string;
  identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
}>): Promise<Response | null> {
  const route = classifySeyeonCloudflareChatRouteV1(input.request);
  if (route.kind === 'not_chat') return null;
  if (route.kind === 'turn_send') {
    // Retains exact 4xx for malformed/auth failures and pre-Provider 503 for
    // the valid first POST, followed by a separate final Fetch egress guard.
    const response = await handleSeyeonCloudflareOfflineChatTurnIngressV1(input);
    return enforceSeyeonCloudflareOfflineFetchEgressFenceV1(response, input.requestId);
  }

  // chat_open, thread_read (incl. committed replay, history and future
  // projections) and every unknown/malformed chat path are hard stopped.
  // This never invokes a protected handler or resolves replay by stored text.
  const response = denySeyeonCloudflareFirstRevealBeforeProviderV1(input.requestId);
  return enforceSeyeonCloudflareOfflineFetchEgressFenceV1(response, input.requestId);
}
