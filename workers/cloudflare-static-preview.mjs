import { matchCloudflareApiRoute } from './cloudflare-api-router.mjs';
import { isSeyeonCloudflareProtectedIngressAliasV1 } from '../apps/api/src/seyeon-cloudflare-ops-router-handoff-offline-v1.ts';
import {
  tryHandleCloudflareSeyeonSecurityV1,
  fenceCloudflareSeyeonBeforeFetchReturnV1,
} from './cloudflare-seyeon-security.mjs';
import { tryHandleCloudflareApprovedAuthV1 } from './cloudflare-auth-db-api.mjs';
import { tryHandleCloudflareApprovedSajuCalculationV1 } from './cloudflare-saju-calculation.mjs';

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

// Adapter exceptions must never reach the Cloudflare HTML 500 fallback.
/**
 * Emergency HOLD is the request-path fail-safe for an Auth/DB/OAuth outage
 * or a Preview stop. Absence means existing admission rules apply; any
 * explicitly supplied non-"false" value blocks positive protected APIs.
 * Never read credentials or instantiate a DB pool while HOLD is active.
 */
export function cloudflareEmergencyHoldEnabledV1(bindings) {
  try {
    const value = bindings?.MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD;
    return value !== undefined && value !== 'false';
  } catch {
    return true; // A malformed/inaccessible binding must also fail closed.
  }
}

export function sealCloudflareUnexpectedApiFailureV1(route) {
  const isSaju = route?.id === 'api.me.saju.calculation';
  return Response.json({
    ok: false,
    error: isSaju
      ? { code: 'SAJU_SERVICE_UNAVAILABLE', messageKey: 'saju.service_unavailable', retryable: true }
      : { code: 'AUTH_UPSTREAM_UNAVAILABLE', messageKey: 'auth.auth_upstream_unavailable', retryable: true },
  }, { status: 503, headers: BASE_HEADERS });
}

export function isCloudflareStaticPreviewApiPath(pathname) {
  if (typeof pathname !== 'string') return true;
  let path = pathname;
  // Classification is deny-only: decode aliases to keep a forged API path
  // away from Static Assets. Never dispatch a decoded path as an approved API.
  for (let depth = 0; depth < 12; depth += 1) {
    if (/^\/api(?:$|[\/\\.;\u0000%])/iu.test(path)) return true;
    if (!path.includes('%')) return false;
    try {
      const next = decodeURIComponent(path);
      if (next === path) return false;
      path = next;
    } catch {
      return /^\/api/iu.test(path);
    }
  }
  return path.includes('%') || /^\/api(?:$|[\/\\.;\u0000%])/iu.test(path);
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

// Eleven explicit public HTML entries are the only valid HTML assets in
// this Preview. A generic 200 HTML fallback is never a static route grant.
// Keep this inventory in sync with verify-cloudflare-static.mjs.
export const CLOUDFLARE_PUBLIC_HTML_PATHS_V1 = Object.freeze([
  '/', '/index.html', '/hall.html', '/auth.html', '/birth.html',
  '/chat-hub.html', '/chat.html', '/my.html', '/reading.html',
  '/face-reading.html', '/reading-detail.html', '/records.html',
]);

/**
 * S-CF2 final Static Assets boundary, independent of Chat ingress.
 * ASSETS must never supply an unexpected HTML fallback, redirect, cookie,
 * CORS grant or error body. No buffering or reading asset body content.
 * This does NOT authorize any API path to reach Static Assets.
 */
export function fenceCloudflareStaticPreviewAssetResponseV1(candidate, request) {
  const denied = () => new Response(null, { status: 404, headers: BASE_HEADERS });
  try {
    if (!(candidate instanceof Response)) return denied();
    if (![200, 206, 304].includes(candidate.status)) return denied();
    const headers = new Headers(candidate.headers);
    if (headers.has('set-cookie') || headers.has('location')) return denied();
    for (const key of headers.keys()) {
      if (key.toLowerCase().startsWith('access-control-')) return denied();
    }

    const path = new URL(request.url).pathname;
    const expectedHtml = CLOUDFLARE_PUBLIC_HTML_PATHS_V1.includes(path);
    const media = (headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const isHtml = media === 'text/html' || media === 'application/xhtml+xml';
    if (expectedHtml !== isHtml || (expectedHtml && candidate.status !== 200)) {
      return denied();
    }
    if (expectedHtml) {
      for (const [key, value] of Object.entries(BASE_HEADERS)) headers.set(key, value);
    } else {
      // Preserve existing static-cache semantics for JS/CSS/media; never
      // weaken cross-resource sniffing or allow indexing via a bad ASSETS header.
      headers.set('X-Content-Type-Options', BASE_HEADERS['X-Content-Type-Options']);
      headers.set('X-Robots-Tag', BASE_HEADERS['X-Robots-Tag']);
    }
    return new Response(candidate.body, {
      status: candidate.status, statusText: candidate.statusText, headers,
    });
  } catch {
    return denied();
  }
}

export default {
  async fetch(request, bindings) {
    const url = new URL(request.url);
    const route = matchCloudflareApiRoute(url.pathname);
    // One emergency flag disables Auth/DB/Saju without contacting a provider
    // or acquiring a connection. Chat stays behind its independent 503 fence.
    const emergencyHold = cloudflareEmergencyHoldEnabledV1(bindings);
    // S-CF2: every /api/chat request is consumed here, before any other API
    // adapter. Neither another Character nor an unknown thread can accidentally
    // fall through to a future positive handler, HTML or Vercel rewrites.
    if (isSeyeonCloudflareProtectedIngressAliasV1(request)) {
      try {
        // WHATWG URL normalization leaves encoded route aliases outside the
        // exact Ops router. Never let them reach Auth/Saju/API or Static Assets:
        // all such aliases return the SAME sealed protected 503, no DB.
        const canonicalChatPath = url.pathname === '/api/chat' ||
          url.pathname.startsWith('/api/chat/');
        if (emergencyHold || !canonicalChatPath) {
          const sealed = fenceCloudflareSeyeonBeforeFetchReturnV1(null, crypto.randomUUID());
          const headers = new Headers(sealed.headers);
          for (const [key, value] of Object.entries(BASE_HEADERS)) headers.set(key, value);
          return new Response(sealed.body, { status: sealed.status, headers });
        }
        const chatResponse = await tryHandleCloudflareSeyeonSecurityV1(request, bindings, route);
        if (chatResponse !== null) return chatResponse;
        // A DB-confirmed non-SeYeon thread is NOT an admission token: the
        // separately authorized generic Chat API is not ported. Deny-first.
        return new Response(null, { status: 404, headers: BASE_HEADERS });
      } catch {
        // Independent final boundary in the actual Worker fetch handler.
        // Do not let a runtime/cleanup/serialization exception return a
        // platform-generated HTML 500 or surface a protected body.
        const sealed = fenceCloudflareSeyeonBeforeFetchReturnV1(
          null, crypto.randomUUID(),
        );
        const headers = new Headers(sealed.headers);
        for (const [key, value] of Object.entries(BASE_HEADERS)) headers.set(key, value);
        return new Response(sealed.body, { status: sealed.status, headers });
      }
    }
    // Worker-first Static Assets are necessary to apply the same deny-only
    // Chat marker/encoded alias guard to /index.html, / and other non-API
    // paths. Only after that security check may a real Static Asset be served.
    // Never forward any API path or unsafe method to ASSETS, and never proxy
    // to Vercel or a dynamic upstream. Absence/error is a fixed empty 404.
    if (!isCloudflareStaticPreviewApiPath(url.pathname)) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(null, { status: 404, headers: BASE_HEADERS });
      }
      try {
        if (typeof bindings?.ASSETS?.fetch !== 'function') {
          return new Response(null, { status: 404, headers: BASE_HEADERS });
        }
        return fenceCloudflareStaticPreviewAssetResponseV1(
          await bindings.ASSETS.fetch(request), request,
        );
      } catch {
        return new Response(null, { status: 404, headers: BASE_HEADERS });
      }
    }
    if (emergencyHold) {
      // Health 200 survives; protected API routes fall back to the existing
      // 404/503 deny-only dispatcher. No Worker API becomes HTML.
      return handleCloudflareStaticPreviewRequest(request);
    }
    try {
      const approvedAuthResponse = await tryHandleCloudflareApprovedAuthV1(request, bindings, route);
      if (approvedAuthResponse !== null) return approvedAuthResponse;
      const approvedCalculationResponse = await tryHandleCloudflareApprovedSajuCalculationV1(request, bindings, route);
      if (approvedCalculationResponse !== null) return approvedCalculationResponse;
      return handleCloudflareStaticPreviewRequest(request);
    } catch {
      // Auth/DB or calculation adapters can fail outside their own try/catch.
      // Keep a fixed no-store error code; never emit platform HTML/errors.
      return sealCloudflareUnexpectedApiFailureV1(route);
    }
  },
};
