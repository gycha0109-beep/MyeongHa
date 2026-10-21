import { matchCloudflareApiRoute } from './cloudflare-api-router.mjs';

// Cloudflare static preview: explicitly NOT the production API runtime.
// Every /api request goes through this deny-only Worker; Static Assets serve
// known files directly. Do not connect Supabase, OpenAI, Saju or PortOne here.
// Watchtower-Track: ops

const BASE_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'",
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
});

const FIRST_REVEAL_ERROR = Object.freeze({
  ok: false,
  error: {
    code: 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',
    messageKey: 'chat.secure_reveal_unavailable',
    retryable: false,
  },
  meta: { apiContractVersion: 'v0.9' },
});

export function isCloudflareStaticPreviewApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export function isSeyeonTurnSendPath(pathname) {
  return /^\/api\/chat\/[^/]+\/turns$/.test(pathname);
}

export function handleCloudflareStaticPreviewRequest(request) {
  const url = new URL(request.url);
  const route = matchCloudflareApiRoute(url.pathname);

  // This is the only positive API route. It is a constant liveness signal
  // with no DB/TLS readiness, auth, upstream calls, cookies, or sensitive data.
  // Reject all query strings to avoid marker-param confusion.
  if (route?.id === 'api.health' && url.search === '') {
    if (request.method !== 'GET') {
      return new Response(null, {
        status: 405,
        headers: { ...BASE_HEADERS, Allow: 'GET' },
      });
    }
    return Response.json({ status: 'ok' }, { status: 200, headers: BASE_HEADERS });
  }

  if (
    request.method === 'POST' &&
    route?.id === 'rewrite.chat.turns'
  ) {
    // Preserve the positive first-reveal HOLD. Never forward or stream.
    return Response.json(FIRST_REVEAL_ERROR, {
      status: 503,
      headers: BASE_HEADERS,
    });
  }

  // All other APIs (including /api/readiness and the private TLS canary),
  // unknown paths, rewritten paths, and method mismatches remain closed.
  // Never translate a rewrite marker into a trusted handler or Vercel proxy.
  return new Response(null, {
    status: 404,
    headers: BASE_HEADERS,
  });
}

export default {
  fetch(request) {
    return handleCloudflareStaticPreviewRequest(request);
  },
};
