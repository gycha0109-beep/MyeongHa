// Cloudflare direct Auth/DB adapter. Activated only after an explicit exact
// origin + secret policy binding; missing bindings leave preview APIs at 404.
// Never proxy to Vercel or promote Seyeon, Commerce, or records.
// Watchtower-Track: ops
import { createProductionMemberAuthHttpRuntimeV1 } from '../apps/api/src/production-member-auth-http-runtime.ts';
import { MYEONGHA_PRODUCTION_SUPABASE_ORIGIN, parseProductionUserDataRuntimeConfigV1 } from '../apps/api/src/production-user-data-runtime-config.ts';
import { parseProductionMemberAuthRateLimitConfigV1 } from '../apps/api/src/production-member-auth-rate-limit-config.ts';
import { handleSupabaseAuthRequestV1 } from '../apps/api/src/supabase-auth-http.ts';
import { createProductionGuestBootstrapHttpRuntimeV1 } from '../apps/api/src/production-guest-bootstrap-http-runtime.ts';
import { createProductionCurrentSubjectProfileRuntimeV1 } from '../apps/api/src/production-current-subject-profile-runtime.ts';
import { createProductionBirthProfileReadRuntimeV1 } from '../apps/api/src/production-birth-profile-read-runtime.ts';
import { createProductionBirthProfileCreateRuntimeV1 } from '../apps/api/src/production-birth-profile-create-runtime.ts';
import { createProductionGuestPromotionRuntimeV1 } from '../apps/api/src/production-guest-promotion-runtime.ts';
import { createProductionCurrentSubjectBirthProfileRuntimeV1 } from '../apps/api/src/production-current-subject-birth-profile-runtime.ts';
import { handleSocialAuthStartRequestV1 } from '../apps/api/src/social-auth-start-http.ts';
import { handleNaverOAuthBridgeRequestV1 } from '../apps/api/src/naver-oauth-bridge-http.ts';

const EXACT_MODE = 'approved-auth-db-v1';
const EXACT_DB_TLS_RLS_APPROVAL = 'approved-isolated-tls-rls-v1';
const AUTH_ACTIONS = Object.freeze({
  'api.auth.sign-in': 'sign-in',
  'api.auth.sign-up': 'sign-up',
  'api.auth.refresh': 'refresh',
  'api.auth.sign-out': 'sign-out',
});

const NAVER_ACTIONS = Object.freeze({
  'rewrite.naver.authorize': 'authorize',
  'rewrite.naver.callback': 'callback',
  'rewrite.naver.token': 'token',
  'rewrite.naver.userinfo': 'userinfo',
});

export const CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1 = Object.freeze({
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
  }, { status: 503, headers: CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1 });
}

/**
 * Stage 5 Auth/OAuth egress is closed even if a trusted handler regresses:
 * no HTML/streaming payloads, accidental open redirects, CORS or caching.
 * Only the original Naver authorization and Supabase callback redirects are
 * allowed; host matching is exact and comes from governed source constants.
 */
// Provider egress is limited to the exact two Naver bridge redirect forms.
// Neither arbitrary query fields nor a second callback URL may be released.
// Existing Naver AES-GCM and PKCE handler remains authoritative for state.
export function approvedCloudflareNaverRedirectV1(destination, route, approvedOrigin) {
  if (typeof approvedOrigin !== 'string' || !approvedOrigin.startsWith('https://')) return false;
  const naver = route?.id === 'rewrite.naver.authorize' &&
    destination.origin === 'https://nid.naver.com' &&
    destination.pathname === '/oauth2.0/authorize';
  const supabase = route?.id === 'rewrite.naver.callback' &&
    destination.origin === MYEONGHA_PRODUCTION_SUPABASE_ORIGIN &&
    destination.pathname === '/auth/v1/callback';
  if (!naver && !supabase) return false;
  const seen = new Set();
  for (const [key, value] of destination.searchParams) {
    if (seen.has(key) || value.length === 0 || value.length > 8192) return false;
    seen.add(key);
  }
  if (naver) {
    return seen.size === 4 &&
      ['response_type', 'client_id', 'redirect_uri', 'state'].every(k => seen.has(k)) &&
      destination.searchParams.get('response_type') === 'code' &&
      destination.searchParams.get('redirect_uri') ===
        approvedOrigin + '/api/auth/social/naver/callback' &&
      destination.searchParams.get('client_id').length <= 128 &&
      /^[A-Za-z0-9_-]{40,8192}$/.test(destination.searchParams.get('state'));
  }
  if (!seen.has('state')) return false;
  if (seen.has('code')) {
    return seen.size === 2 &&
      /^[A-Za-z0-9_-]{40,8192}$/.test(destination.searchParams.get('code'));
  }
  return seen.size === 2 && seen.has('error') &&
    destination.searchParams.get('error') === 'access_denied';
}

export function fenceCloudflareApprovedAuthResponseV1(candidate, route, approvedOrigin) {
  if (!(candidate instanceof Response)) return unavailable();

  const location = candidate.headers.get('location');
  const isRedirect = candidate.status >= 300 && candidate.status < 400;
  if (isRedirect || location !== null) {
    if (candidate.status !== 302 || location === null ||
        candidate.headers.has('set-cookie')) return unavailable();
    let destination;
    try { destination = new URL(location); } catch { return unavailable(); }
    if (destination.username !== '' || destination.password !== '' ||
        destination.protocol !== 'https:' || destination.hash !== '') return unavailable();
    if (!approvedCloudflareNaverRedirectV1(destination, route, approvedOrigin)) return unavailable();
    if (candidate.body !== null) return unavailable();
  } else if (candidate.body !== null) {
    const contentType = candidate.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    // Permit JSON and structured +json only; block HTML, plain text and SSE.
    const jsonMedia = contentType === 'application/json' ||
      (contentType.startsWith('application/') && contentType.endsWith('+json'));
    if (!jsonMedia) return unavailable();
  }

  const headers = new Headers(candidate.headers);
  for (const key of [...headers.keys()]) {
    if (key.toLowerCase().startsWith('access-control-')) headers.delete(key);
  }
  for (const [key, value] of Object.entries(CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1)) {
    headers.set(key, value);
  }
  // Naver's established OAuth policy is stricter than the generic web
  // referrer baseline. Never weaken it while copying platform headers.
  if (isRedirect) {
    // Both redirect forms carry state or sealed codes, never downgrade this.
    headers.set('Referrer-Policy', 'no-referrer');
  }
  return new Response(candidate.body, {
    status: candidate.status,
    statusText: candidate.statusText,
    headers,
  });
}

function methodNotAllowed() {
  return new Response(null, { status: 405, headers: { ...CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1, Allow: 'POST' } });
}

function denied() {
  return new Response(null, { status: 404, headers: CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1 });
}

export function approvedCloudflareSameOriginPostV1(request, origin) {
  const requestOrigin = request.headers.get('origin');
  if (requestOrigin !== null && requestOrigin !== origin) return false;
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite !== null && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
  // Unsafe requests carrying host-only browser cookies must present a real
  // same-origin signal; an absent Origin plus absent Fetch Metadata is not
  // enough to authorize a cookie-authenticated mutation.
  if (request.headers.has('cookie') &&
      requestOrigin !== origin && fetchSite !== 'same-origin') return false;
  if (request.headers.get('x-myeongha-auth-transport') === 'web-cookie-v1') {
    // Cookies are host-only and SameSite Strict; require same-origin browser
    // provenance, not an arbitrary header on a cross-site form.
    if (requestOrigin !== origin && fetchSite !== 'same-origin') return false;
  }
  return true;
}

// Shape-only OAuth ingress filter. The existing provider handler remains
// authority for state/PKCE, redirect target, token and callback validation.
// Reject ambiguous selectors before reading any secret or opening a DB lease.
export function allowedCloudflareNaverQueryV1(url, action) {
  const allowed = action === 'authorize'
    ? new Set(['client_id', 'redirect_uri', 'response_type', 'state', 'code_challenge', 'code_challenge_method'])
    : action === 'callback'
      ? new Set(['state', 'code', 'error', 'error_description'])
      : new Set();
  const seen = new Set();
  for (const [key, value] of url.searchParams) {
    if (!allowed.has(key) || seen.has(key) || value.length > 8192) return false;
    seen.add(key);
  }
  // A callback cannot be both provider success and provider error.
  if (action === 'callback' && seen.has('code') && seen.has('error')) return false;
  return true;
}

// DB TLS/RLS owner and OAuth callback registration are separate authorities.
// Absent or mismatched admission must not read a DB credential or contact a provider.
export function approvedCloudflareStage5HandoffV1(bindings, origin, needsOAuth) {
  if (bindings?.MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL !== EXACT_DB_TLS_RLS_APPROVAL) return false;
  if (needsOAuth &&
      bindings?.MYEONGHA_CLOUDFLARE_OAUTH_CALLBACK_ORIGIN !== origin) return false;
  return true;
}

export function approvedCloudflareAuthOriginV1(request, bindings) {
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
  const isGuestPromotion = route?.id === 'api.auth.promote-guest';
  const isCurrentBirth = route?.id === 'api.me.birth-profile';
  const isSocialStart = route?.id === 'rewrite.social.start';
  const naverAction = Object.hasOwn(NAVER_ACTIONS, route?.id) ? NAVER_ACTIONS[route.id] : null;
  if (action === null && !isGuestBootstrap && !isMemberProfile && !isBirthCreate && !isBirthRead &&
      !isGuestPromotion && !isCurrentBirth && !isSocialStart && naverAction === null) return null;
  const origin = approvedCloudflareAuthOriginV1(request, bindings);
  if (origin === null) return null;
  const url = new URL(request.url);
  // Only the verified social-complete exchange and the provider's Naver
  // endpoints may carry query parameters. No other rewrite marker is trusted.
  const socialCompleteValues = url.searchParams.getAll('__myeongha_social_complete');
  const isSocialComplete =
    route?.id === 'api.auth.refresh' &&
    socialCompleteValues.length === 1 &&
    socialCompleteValues[0] === '1' &&
    [...url.searchParams.keys()].every(key => key === '__myeongha_social_complete');
  if (url.hash !== '') return denied();
  if (naverAction !== null && !allowedCloudflareNaverQueryV1(url, naverAction)) return denied();
  if (url.search !== '' && naverAction === null && !isSocialComplete) return denied();
  // Provider callback registration and Worker→DB TLS/RLS acceptance are
  // separately signed, not inferred from the Auth host or provider flags.
  if (!approvedCloudflareStage5HandoffV1(
    bindings, origin, isSocialStart || isSocialComplete || naverAction !== null,
  )) return null;
  const expectedMethod = (isMemberProfile || isBirthRead || isCurrentBirth ||
    (naverAction !== null && naverAction !== 'token')) ? 'GET' : 'POST';
  if (request.method !== expectedMethod) {
    return new Response(null, {
      status: 405,
      headers: { ...CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1, Allow: expectedMethod },
    });
  }
  // OAuth GET callbacks originate at the provider. Only unsafe POST methods
  // require browser same-origin provenance; the Naver callback validates
  // its sealed state and PKCE in the existing handler.
  if (request.method === 'POST' && !approvedCloudflareSameOriginPostV1(request, origin)) return denied();

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
    } else if (isGuestPromotion) {
      runtime = createProductionGuestPromotionRuntimeV1({ env: bindings });
      result = await runtime.handleRequest({
        request,
        requestId: crypto.randomUUID(),
        serverTime: new Date().toISOString(),
      });
    } else if (isCurrentBirth) {
      runtime = createProductionCurrentSubjectBirthProfileRuntimeV1({ env: bindings });
      result = await runtime.handleRequest({
        request,
        requestId: crypto.randomUUID(),
        serverTime: new Date().toISOString(),
      });
    } else if (isSocialStart) {
      result = await handleSocialAuthStartRequestV1({
        request,
        env: bindings,
        webOrigin: origin,
      });
    } else if (naverAction !== null) {
      result = await handleNaverOAuthBridgeRequestV1({
        request,
        action: naverAction,
        env: bindings,
        webOrigin: origin,
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
      result = await runtime.handleRequest(isSocialComplete
        ? { request, action: 'refresh', authAction: 'social-complete' }
        : { request, action });
    }
  } catch {
    result = unavailable();
  }
  try {
    await runtime?.close();
  } catch {
    return unavailable();
  }

  // Final boundary applies to all approved Auth, Guest, Naver and profile
  // responses. Never forward an unexpected HTML 500, stream or redirect.
  return fenceCloudflareApprovedAuthResponseV1(result, route, origin);
}
