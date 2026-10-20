// Watchtower-Track: security
// S-CF1.5 OFFLINE ONLY. No Worker entrypoint, platform secrets, Provider,
// positive assistant response, DB Commit, deployment or public route.
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import { preflightSeyeonChatTurnSendCoreV1 } from './seyeon-chat-turn-send-preflight-core-v1.js';
import {
  createSeyeonCloudflareStaticPreflightDenialV1,
  denySeyeonCloudflareFirstRevealBeforeProviderV1,
  enforceSeyeonCloudflareOfflineFetchEgressFenceV1,
} from './seyeon-cloudflare-offline-reveal-fence-v1.js';

export const SEYEON_CLOUDFLARE_OFFLINE_CHAT_INGRESS_V1 = Object.freeze({
  schemaVersion: 'seyeon-cloudflare-offline-chat-turn-ingress-v1',
  route: '/api/chat/:threadId/turns',
  publicRouteMounted: false,
  supportedMethod: 'POST',
  positiveFirstRevealPermitted: false,
  modelProviderConnected: false,
  databaseWriteConnected: false,
  transportG0D04Approved: false,
} as const);

/**
 * Reuses the exact existing Vercel route/member/bounded JSON admission.
 * On authenticated valid first POST, the only possible result is 503 before
 * any chat Runtime/Provider/Grant positive work. The outer Fetch fence is an
 * independent, final fail-closed defense. This function has no next()
 * continuation and does not authorize even a zero-memory assistant body.
 *
 * Ops may eventually mount a route adapter after separately approving their
 * API router, but S-CF1.5 is NOT the positive Cloudflare chat handler.
 */
export async function handleSeyeonCloudflareOfflineChatTurnIngressV1(input: Readonly<{
  request: Request;
  requestId: string;
  identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
}>): Promise<Response> {
  try {
    const result = await preflightSeyeonChatTurnSendCoreV1({
      request: input.request,
      identityEvidenceVerifier: input.identityEvidenceVerifier,
    });

    const response = result.kind === 'denied'
      ? createSeyeonCloudflareStaticPreflightDenialV1({
        kind: result.reason,
        requestId: input.requestId,
      })
      : denySeyeonCloudflareFirstRevealBeforeProviderV1(input.requestId);

    return enforceSeyeonCloudflareOfflineFetchEgressFenceV1(response, input.requestId);
  } catch {
    // Unknown auth, parsing, injected verifier and serialization failures
    // cannot open a positive response or reflect an exception's content.
    return enforceSeyeonCloudflareOfflineFetchEgressFenceV1(null, input.requestId);
  }
}
