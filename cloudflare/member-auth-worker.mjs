import { handleSupabaseAuthRequestV1 } from '../apps/api/src/supabase-auth-http.js';
import { handleSocialAuthStartRequestV1 } from '../apps/api/src/social-auth-start-http.js';

const OWNED_ORIGINS = new Set([
  'https://myeongha.gycha0109.workers.dev',
  'https://myeongha-web.gycha0109.workers.dev',
]);
const AUTH_ROUTES = Object.freeze({
  '/api/auth/sign-in': 'sign-in',
  '/api/auth/sign-up': 'sign-up',
  '/api/auth/sign-out': 'sign-out',
  '/api/auth/refresh': 'refresh',
  '/api/auth/social/start': 'social-start',
});
const HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
});

function error(code, status, extra = {}) {
  return Response.json({
    ok: false,
    error: {
      code,
      messageKey: `auth.${code.toLowerCase()}`,
      retryable: status >= 500,
    },
  }, { status, headers: { ...HEADERS, ...extra } });
}

function seal(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(HEADERS)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function cloudflareAuthRoute(request) {
  const url = new URL(request.url);
  if (!OWNED_ORIGINS.has(url.origin)) return null;
  const action = AUTH_ROUTES[url.pathname];
  if (action === undefined) return null;
  if (action === 'refresh') {
    const markers = url.searchParams.getAll('__myeongha_social_complete');
    if (markers.length === 0 && url.search === '') return 'refresh';
    if (markers.length === 1 && markers[0] === '1' && [...url.searchParams.keys()].length === 1) {
      return 'social-complete';
    }
    return 'invalid-query';
  }
  return url.search === '' ? action : 'invalid-query';
}

export async function rateLimitCloudflareRequestV1(request, env, action) {
  const secret = env?.MYEONGHA_AUTH_RATE_LIMIT_SECRET;
  if (typeof secret !== 'string' || secret.length < 32 ||
      typeof env?.AUTH_RATE_LIMITER?.limit !== 'function') {
    return error('AUTH_RATE_LIMIT_UNAVAILABLE', 503);
  }
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const keyBytes = new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  const ipTag = Array.from(new Uint8Array(signed).slice(0, 12), b => b.toString(16).padStart(2, '0')).join('');
  const result = await env.AUTH_RATE_LIMITER.limit({ key: `${action}:${ipTag}` });
  return result?.success ? null : error('RATE_LIMITED', 429, { 'Retry-After': '60' });
}

export async function handleCloudflareAuthRequest(request, env) {
  const action = cloudflareAuthRoute(request);
  if (action === null) return null;
  if (request.method !== 'POST') return new Response(null, {
    status: 405, headers: { ...HEADERS, Allow: 'POST' },
  });
  if (action === 'invalid-query') return error('INVALID_REQUEST', 400);
  // Browsers cannot establish a Member session via another website's Origin.
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== new URL(request.url).origin) {
    return error('INVALID_REQUEST', 403);
  }
  try {
    const rejected = await rateLimitCloudflareRequestV1(request, env, action);
    if (rejected !== null) return rejected;
    const result = action === 'social-start'
      ? await handleSocialAuthStartRequestV1({ request, env })
      : await handleSupabaseAuthRequestV1({ request, env, action });
    return seal(result);
  } catch {
    return error('AUTH_UPSTREAM_UNAVAILABLE', 503);
  }
}
