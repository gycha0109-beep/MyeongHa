// Owner-scoped target-person reads use the existing Vercel runtime
// and PostgreSQL subject/RLS authority. No Vercel proxy or mutation.
// Watchtower-Track: ops
import {
  approvedCloudflareAuthOriginV1,
  approvedCloudflareStage5HandoffV1,
  approvedCloudflarePostgresTargetV1,
  CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1,
} from './cloudflare-auth-db-api.mjs';
import { createProductionTargetPersonReadRuntimeV1 } from '../apps/api/src/production-target-person-read-runtime.ts';
import { parseProductionUserDataRuntimeConfigV1 } from '../apps/api/src/production-user-data-runtime-config.ts';
import {
  buildProductionNodePostgresPoolConfigV1,
  createNodePostgresSubjectPoolV1,
} from '../apps/api/src/node-postgres-subject-pool.ts';
import { CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1 } from '../apps/api/src/cloudflare-direct-postgres-candidate.ts';

const ROUTE_IDS = new Set(['rewrite.target-persons', 'rewrite.target-person.id']);
const HEADERS = CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function deny() { return new Response(null, { status: 404, headers: HEADERS }); }
function unavailable() {
  return Response.json({
    ok: false,
    error: { code: 'AUTH_UPSTREAM_UNAVAILABLE', messageKey: 'auth.auth_upstream_unavailable', retryable: true },
  }, { status: 503, headers: HEADERS });
}

export function allowedCloudflareTargetPersonReadPathV1(route, url) {
  if (!ROUTE_IDS.has(route?.id) || url.search !== '' || url.hash !== '') return false;
  if (route.id === 'rewrite.target-persons') return url.pathname === '/api/target-persons';
  const encoded = route.params?.id;
  if (typeof encoded !== 'string' || encoded.includes('%') || !UUID.test(encoded)) return false;
  return url.pathname === '/api/target-persons/' + encoded;
}

export function fenceCloudflareTargetPersonReadResponseV1(candidate) {
  if (!(candidate instanceof Response) ||
      (candidate.status >= 300 && candidate.status < 400) ||
      candidate.headers.has('location') || candidate.headers.has('set-cookie') ||
      (candidate.status >= 200 && candidate.status < 300 && candidate.body === null)) return unavailable();
  if (candidate.body !== null) {
    const media = candidate.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    if (media !== 'application/json' && !(media.startsWith('application/') && media.endsWith('+json'))) return unavailable();
  }
  const headers = new Headers(candidate.headers);
  for (const key of [...headers.keys()]) {
    if (key.toLowerCase().startsWith('access-control-')) headers.delete(key);
  }
  for (const [key, value] of Object.entries(HEADERS)) headers.set(key, value);
  return new Response(candidate.body, {
    status: candidate.status, statusText: candidate.statusText, headers,
  });
}

export async function tryHandleCloudflareApprovedTargetPersonReadV1(request, bindings, route) {
  if (!ROUTE_IDS.has(route?.id)) return null;
  const origin = approvedCloudflareAuthOriginV1(request, bindings);
  if (origin === null || !approvedCloudflareStage5HandoffV1(bindings, origin, false)) return null;
  if (!allowedCloudflareTargetPersonReadPathV1(route, new URL(request.url))) return deny();
  if (request.method !== 'GET') {
    return new Response(null, { status: 405, headers: { ...HEADERS, Allow: 'GET' } });
  }
  let config;
  try {
    config = parseProductionUserDataRuntimeConfigV1(bindings);
    if (!approvedCloudflarePostgresTargetV1(config, bindings)) return unavailable();
    const tls = buildProductionNodePostgresPoolConfigV1(config, CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1);
    if (tls.max !== 1 || !tls.ssl || typeof tls.ssl !== 'object' || tls.ssl.rejectUnauthorized !== true) return unavailable();
  } catch {
    return unavailable();
  }

  let pool, runtime, result;
  try {
    pool = createNodePostgresSubjectPoolV1(config, CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1);
    runtime = createProductionTargetPersonReadRuntimeV1({ env: bindings, pool });
    result = await runtime.handleRequest({
      request, requestId: crypto.randomUUID(), serverTime: new Date().toISOString(),
    });
  } catch {
    result = unavailable();
  }
  let closed = true;
  try { await runtime?.close(); } catch { closed = false; }
  try { await pool?.close(); } catch { closed = false; }
  return closed ? fenceCloudflareTargetPersonReadResponseV1(result) : unavailable();
}
