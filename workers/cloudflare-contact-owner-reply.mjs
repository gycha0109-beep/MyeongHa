// Private owner reply. Mail egress remains disabled until explicit verified-domain activation.
// Watchtower-Track: frontend-integration
import { handleContactOwnerReplyRequestV1 } from '../apps/api/src/contact-owner-reply-http.ts';
import { createCloudflareSubjectPoolV1 } from './cloudflare-hyperdrive-subject-pool.mjs';
import {
  approvedCloudflareAuthOriginV1, approvedCloudflareStage5HandoffV1,
  approvedCloudflareSameOriginPostV1, approvedCloudflarePostgresTargetV1,
  CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1 as HEADERS,
} from './cloudflare-auth-db-api.mjs';
import { parseProductionUserDataRuntimeConfigV1 } from '../apps/api/src/production-user-data-runtime-config.ts';
import { createProductionRequestIdentityVerifierV1 } from '../apps/api/src/production-request-identity-verifier.ts';
import { readOwnerAdminAccessV1 } from '../apps/api/src/myeongha-owner-admin-access-v1.ts';
import { CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1 } from '../apps/api/src/cloudflare-direct-postgres-candidate.ts';
import { rateLimitCloudflareRequestV1 } from '../cloudflare/member-auth-worker.mjs';

const deny = (status, code, allow) => Response.json({ ok: false, code }, {
  status, headers: { ...HEADERS, ...(allow ? { Allow: allow } : {}) },
});
function seal(response) {
  if (!(response instanceof Response) || response.headers.has('set-cookie') ||
      response.headers.has('location') || response.redirected ||
      (response.status >= 300 && response.status < 400) ||
      (response.body !== null && response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')) {
    return deny(503, 'REPLY_UNAVAILABLE');
  }
  const headers = new Headers(response.headers);
  for (const k of [...headers.keys()]) if (k.toLowerCase().startsWith('access-control-')) headers.delete(k);
  for (const [k, v] of Object.entries(HEADERS)) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}
async function verifyOwner(authorization, origin, env) {
  let pool;
  try {
    const config = parseProductionUserDataRuntimeConfigV1(env);
    if (!approvedCloudflarePostgresTargetV1(config, env)) throw Error('INVALID_POSTGRES_AUTHORITY');
    pool = createCloudflareSubjectPoolV1(config, env, CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1);
    const request = new Request(origin + '/api/me', { headers: { Authorization: authorization } });
    const evidence = await createProductionRequestIdentityVerifierV1({ config }).verifyRequestIdentity(request);
    if (evidence === null || evidence.kind !== 'member') return false;
    const owner = await readOwnerAdminAccessV1(pool, evidence);
    return owner.isOwnerAdmin === true && owner.verifiedSubjectId !== null;
  } finally {
    try { await pool?.close(); } catch { /* fail closed on verification errors */ }
  }
}
export async function tryHandleCloudflareContactOwnerReplyV1(request, env, route, deps = {}) {
  if (route?.id !== 'rewrite.contact.owner-reply') return null;
  const url = new URL(request.url);
  if (url.pathname !== '/api/admin/contact/reply' || url.search || url.hash) return deny(404, 'NOT_FOUND');
  if (request.method !== 'POST') return deny(405, 'METHOD_NOT_ALLOWED', 'POST');
  const origin = approvedCloudflareAuthOriginV1(request, env);
  if (origin === null || !approvedCloudflareStage5HandoffV1(env, origin, false)) return deny(503, 'REPLY_UNAVAILABLE');
  if (!approvedCloudflareSameOriginPostV1(request, origin)) return deny(403, 'ORIGIN_FORBIDDEN');
  // No unverified-domain traffic may trigger a DB lookup or provider egress.
  if (env.CONTACT_REPLY_ENABLED !== 'enabled-with-verified-domain-v1') return deny(503, 'REPLY_NOT_ENABLED');
  if (!/^Bearer [^\s]+$/u.test(request.headers.get('authorization') ?? '')) return deny(401, 'SESSION_REQUIRED');
  try {
    const rateLimit = deps.rateLimit ?? rateLimitCloudflareRequestV1;
    const limit = await rateLimit(request, env, 'contact-owner-reply');
    if (limit !== null) return seal(limit);
    const result = await handleContactOwnerReplyRequestV1({
      request, env,
      verifyOwner: auth => (deps.verifyOwner ?? verifyOwner)(auth, origin, env),
      ...(deps.sendFetch ? { sendFetch: deps.sendFetch } : {}),
    });
    return seal(result);
  } catch { return deny(503, 'REPLY_UNAVAILABLE'); }
}
