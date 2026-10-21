// Cloudflare direct Auth/DB adapter. Activated only after an explicit exact
// origin + secret policy binding; missing bindings leave preview APIs at 404.
// Never proxy to Vercel or promote Seyeon, Commerce, or records.
// Watchtower-Track: ops
import { createProductionMemberAuthHttpRuntimeV1 } from '../apps/api/src/production-member-auth-http-runtime.ts';
import { parseProductionUserDataRuntimeConfigV1 } from '../apps/api/src/production-user-data-runtime-config.ts';
import { parseProductionMemberAuthRateLimitConfigV1 } from '../apps/api/src/production-member-auth-rate-limit-config.ts';
import { handleSupabaseAuthRequestV1 } from '../apps/api/src/supabase-auth-http.ts';
import { createProductionGuestBootstrapHttpRuntimeV1 } from '../apps/api/src/production-guest-bootstrap-http-runtime.ts';
import { createProductionCurrentSubjectProfileRuntimeV1 } from '../apps/api/src/production-current-subject-profile-runtime.ts';
import { createProductionBirthProfileReadRuntimeV1 } from '../apps/api/src/production-birth-profile-read-runtime.ts';
import { createProductionBirthProfileCreateRuntimeV1 } from '../apps/api/src/production-birth-profile-create-runtime.ts';

const EXACT_MODE = 'approved-auth-db-v1';
const AUTH_ACTIONS = Object.freeze({
  'api.auth.sign-in': 'sign-in',
  'api.auth.sign-up': 'sign-up',
  'api.auth.refresh': 'refresh',
  'api.auth.sign-out': 'sign-out',
});

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
});

function unavailable() {
  return Response.json({
    ok: false,
    error: { code: 'AUTH_UPSTREAM_UNAVAILABLE', messageKey: 'auth.auth_upstream_unavailable', retryable: true },
  }, { status: 503, headers: SECURITY_HEADERS });
}

function methodNotAllowed() {
  return new Response(null, { status: 405, headers: { ...SECURITY_HEADERS, Allow: 'POST' } });
}

function denied() {
  return new Response(null, { status: 404, headers: SECURITY_HEADERS });
}

function sameOriginFormPost(request, origin) {
  const requestOrigin = request.headers.get('origin');
  if (requestOrigin !== null && requestOrigin !== origin) return false;
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite !== null && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
  if (request.headers.get('x-myeongha-auth-transport') === 'web-cookie-v1') {
    // Cookies are host-only and SameSite Strict; require same-origin browser
    // provenance, not an arbitrary header on a cross-site form.
    if (requestOrigin !== origin && fetchSite !== 'same-origin') return false;
  }
  return true;
}

function selectedOrigin(request, bindings) {
  if (bindings?.MYEONGHA_CLOUDFLARE_AUTH_DB_MODE !== EXACT_MODE) return null;
  const raw = bindings.MYEONGHA_CLOUDFLARE_AUTH_ORIGIN;
  if (typeof raw !== 'string') return null;
  let origin;
  try {
    origin = new URL(raw);
  } catch {
    return null;
  }
  if (origin.protocol !== 'https:' || origin.username !== '' ||
      origin.password !== '' || origin.pathname !== '/' ||
      origin.search !== '' || origin.hash !== '' || origin.origin !== raw ||
      origin.hostname.endsWith('.workers.dev') ||
      origin.hostname.endsWith('.vercel.app')) return null;
  if (new URL(request.url).origin !== raw) return null;
  return raw;
}

// Direct Auth, Guest, profile, and birth-profile endpoints. Every runtime is a
// per-fetch instance, never a module-global session or Postgres pool.
/** @returns {Promise<Response|null>} null means keep the existing deny-first 404. */
export async function tryHandleCloudflareApprovedAuthV1(request, bindings, route) {
  const action = Object.hasOwn(AUTH_ACTIONS, route?.id) ? AUTH_ACTIONS[route.id] : null;
  const isGuestBootstrap = route?.id === 'api.session.bootstrap';
  const isMemberProfile = route?.id === 'api.me';
  const isBirthCreate = route?.id === 'api.birth-profiles';
  const isBirthRead = route?.id === 'rewrite.birth-profile.id';
  if (action === null && !isGuestBootstrap && !isMemberProfile && !isBirthCreate && !isBirthRead) return null;
  const origin = selectedOrigin(request, bindings);
  if (origin === null) return null;
  const url = new URL(request.url);
  if (url.search !== '') return denied();
  const expectedMethod = (isMemberProfile || isBirthRead) ? 'GET' : 'POST';
  if (request.method !== expectedMethod) {
    return new Response(null, {
      status: 405,
      headers: { ...SECURITY_HEADERS, Allow: expectedMethod },
    });
  }
  if (!sameOriginFormPost(request, origin)) return denied();

  try {
    parseProductionUserDataRuntimeConfigV1(bindings);
    parseProductionMemberAuthRateLimitConfigV1(bindings);
  } catch {
    return unavailable();
  }

  let runtime;
  let result;
  try {
    if (isGuestBootstrap) {
      runtime = createProductionGuestBootstrapHttpRuntimeV1({ env: bindings });
      result = await runtime.handleRequest({
        request,
        requestId: crypto.randomUUID(),
        serverTime: new Date().toISOString(),
      });
    } else if (isMemberProfile) {
      runtime = createProductionCurrentSubjectProfileRuntimeV1({ env: bindings });
      result = await runtime.handleRequest({
        request,
        requestId: crypto.randomUUID(),
        serverTime: new Date().toISOString(),
      });
    } else if (isBirthCreate) {
      runtime = createProductionBirthProfileCreateRuntimeV1({ env: bindings });
      result = await runtime.handleRequest({
        request,
        requestId: crypto.randomUUID(),
        serverTime: new Date().toISOString(),
      });
    } else if (isBirthRead) {
      // Existing HTTP handler accepts the public /api/birth-profiles/:id
      // path directly; do not translate or trust Vercel rewrite markers.
      runtime = createProductionBirthProfileReadRuntimeV1({ env: bindings });
      result = await runtime.handleRequest({
        request,
        requestId: crypto.randomUUID(),
        serverTime: new Date().toISOString(),
      });
    } else if (action === 'sign-out') {
      result = await handleSupabaseAuthRequestV1({ request, env: bindings, action });
    } else {
      // Strictly request-scoped: never cache the runtime or its PostgreSQL
      // pool across Workers fetch events. Existing rate-limit DB authority,
      // nonprivileged TLS pool, and subject boundaries remain authoritative.
      runtime = createProductionMemberAuthHttpRuntimeV1({
        env: bindings,
        authHandler: (input) => handleSupabaseAuthRequestV1({
          ...input,
          webOrigin: origin,
        }),
      });
      result = await runtime.handleRequest({ request, action });
    }
  } catch {
    result = unavailable();
  }
  try {
    await runtime?.close();
  } catch {
    return unavailable();
  }

  // No CORS, redirects or access-control overrides. Preserve Set-Cookie,
  // status and body while requiring all HTTPS preview security headers.
  const headers = new Headers(result.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  return new Response(result.body, { status: result.status, statusText: result.statusText, headers });
}
