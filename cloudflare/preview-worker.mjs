// Preview-only static delivery. Keep every unported API route fail-closed.
// S-CF2: use the existing Se-yeon final Fetch fence in the real Worker.
// This is deny-only routing, NOT G0-D04 transmission approval.
import {
  denySeyeonCloudflareFirstRevealBeforeProviderV1,
  enforceSeyeonCloudflareOfflineFetchEgressFenceV1,
} from '../apps/api/src/seyeon-cloudflare-offline-reveal-fence-v1.js';
import {
  holdSeyeonCloudflareOpsRouterHandoffOfflineV1,
} from '../apps/api/src/seyeon-cloudflare-ops-router-handoff-offline-v1.js';
import {
  SupabaseMemberIdentityEvidenceVerifierV1,
} from '../apps/api/src/supabase-member-identity-verifier.js';
import {
  MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
} from '../apps/api/src/production-user-data-runtime-config.js';

const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'no-store',
});

function protectedHeaders(extra = {}) {
  return { ...SECURITY_HEADERS, ...extra };
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const pathLower = pathname.toLowerCase();
    // This is the ACTUAL Cloudflare Preview fetch entrypoint. Se-yeon
    // first send, history and replay cannot proceed into any Provider,
    // database or static HTML fallback before G0-D04 is authorized.
    if (pathLower === '/api/chat' || pathLower.startsWith('/api/chat/')) {
      const requestId = crypto.randomUUID();
      const sealed = () => enforceSeyeonCloudflareOfflineFetchEgressFenceV1(
        denySeyeonCloudflareFirstRevealBeforeProviderV1(requestId),
        requestId,
      );
      // A preview with no approved Auth binding remains completely offline.
      // Reuse the existing Member verifier; never accept a client-supplied
      // Subject ID, supply a database client or invoke an AI Provider.
      if (env?.MYEONGHA_SUPABASE_URL !== MYEONGHA_PRODUCTION_SUPABASE_ORIGIN ||
          typeof env?.MYEONGHA_SUPABASE_API_KEY !== 'string') {
        return sealed();
      }
      try {
        const identityEvidenceVerifier = new SupabaseMemberIdentityEvidenceVerifierV1({
          supabaseOrigin: MYEONGHA_PRODUCTION_SUPABASE_ORIGIN,
          supabaseApiKey: env.MYEONGHA_SUPABASE_API_KEY,
        });
        const guarded = await holdSeyeonCloudflareOpsRouterHandoffOfflineV1({
          request,
          requestId,
          opsRouteDisposition: 'protected_chat',
          identityEvidenceVerifier,
        });
        // The last Fetch fence is unconditional even after trusted 4xx
        // preflight. Successful Member verification only reaches 503.
        return enforceSeyeonCloudflareOfflineFetchEgressFenceV1(
          guarded, requestId,
        );
      } catch {
        return sealed();
      }
    }
    // An encoded API root must not fall through to static assets. Ops owns
    // the eventual raw-path router; Preview deliberately has no positive API.
    const firstSegment = pathname.split('/')[1] ?? '';
    let decodedSegment = firstSegment;
    for (let index = 0; index < 2; index += 1) {
      try {
        const next = decodeURIComponent(decodedSegment);
        if (next === decodedSegment) break;
        decodedSegment = next;
      } catch {
        break;
      }
    }
    const encodedApiRoot = /^api(?:$|[/\\\\.;\u0000])/iu.test(decodedSegment);
    if (pathLower === '/api' || pathLower.startsWith('/api/') ||
        pathLower.startsWith('/api%2f') || encodedApiRoot) {
      return new Response(JSON.stringify({ error: 'API_NOT_ACTIVATED_ON_PREVIEW' }), {
        status: 503,
        headers: protectedHeaders({ 'Content-Type': 'application/json; charset=utf-8' }),
      });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: protectedHeaders({ Allow: 'GET, HEAD' }),
      });
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
