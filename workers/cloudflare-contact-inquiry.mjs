// Cloudflare native contact delivery. No Vercel proxy, extra Worker or ticket database.
// Watchtower-Track: frontend-integration
import { handleContactInquiryRequestV1 } from '../apps/api/src/contact-inquiry-http.ts';
import { approvedCloudflareAuthOriginV1, approvedCloudflareStage5HandoffV1,
  approvedCloudflareSameOriginPostV1, CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1
} from './cloudflare-auth-db-api.mjs';
import { tryHandleCloudflareApprovedAuthV1 } from './cloudflare-auth-db-api.mjs';
import { rateLimitCloudflareRequestV1 } from '../cloudflare/member-auth-worker.mjs';

const HEADERS = CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1;
const PROFILE_ROUTE = Object.freeze({ id: 'api.me', kind: 'direct', params: Object.freeze({}) });

function reject(status, code, allow) {
  const headers = { ...HEADERS, ...(allow ? { Allow: allow } : {}) };
  return Response.json({ ok: false, code }, { status, headers });
}

function seal(response) {
  if (!(response instanceof Response) || response.headers.has('set-cookie') ||
      response.headers.has('location') || (response.status >= 300 && response.status < 400)) {
    return reject(503, 'CONTACT_UNAVAILABLE');
  }
  if (response.body !== null &&
      response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return reject(503, 'CONTACT_UNAVAILABLE');
  }
  const headers = new Headers(response.headers);
  for (const key of [...headers.keys()]) {
    if (key.toLowerCase().startsWith('access-control-')) headers.delete(key);
  }
  for (const [key, value] of Object.entries(HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

async function verifyCloudflareContactSessionV1(authorization, origin, env) {
  // Reuse the already-governed GET /api/me: verified Supabase Member or Guest
  // credentials, canonical subject/RLS enforcement, and per-request pool close.
  const probe = new Request(origin + '/api/me', {
    method: 'GET', headers: { Authorization: authorization, Accept: 'application/json' },
  });
  const response = await tryHandleCloudflareApprovedAuthV1(probe, env, PROFILE_ROUTE);
  if (response === null || response.status >= 500) throw Error('PROFILE_UNAVAILABLE');
  if (response.status === 401 || response.status === 403) return false;
  if (response.status !== 200) throw Error('PROFILE_INVALID');
  const body = await response.json();
  if (body?.ok !== true || !['member','guest'].includes(body?.data?.subjectKind) ||
      !['active','deletion_pending'].includes(body?.data?.subjectStatus)) {
    throw Error('PROFILE_INVALID');
  }
  return body.data.subjectStatus === 'active';
}

/** Returns null only when no approved Cloudflare operating environment exists. */
export async function tryHandleCloudflareContactInquiryV1(request, env, route, deps = {}) {
  if (route?.id !== 'rewrite.contact.inquiry') return null;
  const origin = approvedCloudflareAuthOriginV1(request, env);
  if (origin === null || !approvedCloudflareStage5HandoffV1(env, origin, false)) return null;
  const url = new URL(request.url);
  if (url.search !== '' || url.hash !== '') return reject(404, 'NOT_FOUND');
  if (request.method !== 'POST') return reject(405, 'METHOD_NOT_ALLOWED', 'POST');
  if (!approvedCloudflareSameOriginPostV1(request, origin)) return reject(403, 'ORIGIN_FORBIDDEN');
  if (!/^Bearer [^\s]+$/u.test(request.headers.get('authorization') ?? '')) {
    return reject(401, 'SESSION_REQUIRED');
  }
  try {
    const limiter = deps.rateLimit ?? rateLimitCloudflareRequestV1;
    const limited = await limiter(request, env, 'contact-inquiry');
    if (limited !== null) return seal(limited);
    const check = deps.verifySession ?? verifyCloudflareContactSessionV1;
    const result = await handleContactInquiryRequestV1({
      request, env,
      verifySession: authorization => check(authorization, origin, env),
      ...(deps.sendFetch ? { sendFetch: deps.sendFetch } : {}),
    });
    return seal(result);
  } catch {
    return reject(503, 'CONTACT_UNAVAILABLE');
  }
}
