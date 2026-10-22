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
/**
 * RFC 9110 single-range egress consistency (deny-only). A 206 must match
 * the caller's single requested byte interval and the advertised resource
 * size. No multipart or non-byte range is admitted, and no body is read.
 */
export function isCloudflareStaticSingleByteRangeBoundV1(request, response) {
  try {
    const incoming = request.headers.get('range');
    const outgoing = response.headers.get('content-range');
    if (!incoming || !outgoing) return false;
    const stated = /^bytes (0|[1-9][0-9]*)-(0|[1-9][0-9]*)\/([1-9][0-9]*)$/u.exec(outgoing);
    if (!stated) return false;
    const start = Number(stated[1]);
    const end = Number(stated[2]);
    const total = Number(stated[3]);
    if (![start, end, total].every(Number.isSafeInteger) ||
        start > end || end >= total) return false;

    const explicit = /^bytes=(0|[1-9][0-9]*)-(0|[1-9][0-9]*)?$/u.exec(incoming);
    const suffix = /^bytes=-(0|[1-9][0-9]*)$/u.exec(incoming);
    let expectedStart;
    let expectedEnd;
    if (explicit) {
      const first = Number(explicit[1]);
      const last = explicit[2] === undefined ? total - 1 : Number(explicit[2]);
      if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) ||
          first >= total || last < first) return false;
      expectedStart = first;
      expectedEnd = Math.min(last, total - 1);
    } else if (suffix) {
      const count = Number(suffix[1]);
      if (!Number.isSafeInteger(count) || count === 0) return false;
      expectedStart = Math.max(0, total - count);
      expectedEnd = total - 1;
    } else {
      return false;
    }
    if (start !== expectedStart || end !== expectedEnd) return false;
    // A Content-Length mismatch can make a partial asset appear complete.
    const length = response.headers.get('content-length');
    if (length !== null) {
      if (!/^(0|[1-9][0-9]*)$/u.test(length) ||
          !Number.isSafeInteger(Number(length)) ||
          Number(length) !== end - start + 1) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// RFC 9110 entity tags: opaque, case-sensitive bytes; commas inside quotes
// are part of a tag, not list separators. Parsing is deny-only and bounded.
const CLOUDFLARE_ENTITY_TAG_PATTERN_V1 = /^(?:W\/)?"[\x21\x23-\x7E]*"$/u;

function parseCloudflareIfNoneMatchV1(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return null;
  if (value.trim() === '*') return ['*'];
  const tags = [];
  let quoted = false;
  let from = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '"') quoted = !quoted;
    if (value[i] !== ',' || quoted) continue;
    tags.push(value.slice(from, i).trim());
    if (tags.length > 32) return null;
    from = i + 1;
  }
  if (quoted) return null;
  tags.push(value.slice(from).trim());
  if (tags.length > 32 ||
      !tags.every(tag => CLOUDFLARE_ENTITY_TAG_PATTERN_V1.test(tag))) return null;
  return tags;
}

function parseCloudflareHttpDateV1(value) {
  if (typeof value !== 'string' ||
      !/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-3][0-9] (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-2][0-9]:[0-5][0-9]:[0-5][0-9] GMT$/u.test(value)) {
    return null;
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toUTCString() !== value) return null;
  return time;
}

/**
 * A 304 is only meaningful for a previously cached *non-HTML* representation
 * that matches a bounded conditional validator from this same request.
 * An ETag takes precedence over If-Modified-Since (RFC 9110 §13.1.3).
 * We intentionally reject validator-free 304, missing response validators,
 * synthetic bodies and transfer/range metadata; never grant an asset path.
 */
export function isCloudflareStaticNotModifiedBoundV1(request, response) {
  try {
    if (!(response instanceof Response) || response.status !== 304 ||
        response.body !== null) return false;
    if (response.headers.has('content-range') ||
        response.headers.has('content-length') ||
        response.headers.has('transfer-encoding') ||
        request.headers.has('if-match') ||
        request.headers.has('if-unmodified-since') ||
        request.headers.has('if-range')) return false;

    for (const field of ['date', 'last-modified']) {
      const raw = response.headers.get(field);
      if (raw !== null && parseCloudflareHttpDateV1(raw) === null) return false;
    }
    const requestedTags = request.headers.get('if-none-match');
    if (requestedTags !== null) {
      const tags = parseCloudflareIfNoneMatchV1(requestedTags);
      const responseTag = response.headers.get('etag');
      if (!tags || responseTag === null ||
          !CLOUDFLARE_ENTITY_TAG_PATTERN_V1.test(responseTag)) return false;
      // GET/HEAD If-None-Match uses weak entity-tag comparison.
      const opaque = responseTag.startsWith('W/') ? responseTag.slice(2) : responseTag;
      return tags.some(tag => tag === '*' ||
        (tag.startsWith('W/') ? tag.slice(2) : tag) === opaque);
    }

    const condition = parseCloudflareHttpDateV1(request.headers.get('if-modified-since'));
    const modified = parseCloudflareHttpDateV1(response.headers.get('last-modified'));
    return condition !== null && modified !== null && modified <= condition;
  } catch {
    return false;
  }
}

export function fenceCloudflareStaticPreviewAssetResponseV1(candidate, request) {
  const denied = () => new Response(null, { status: 404, headers: BASE_HEADERS });
  try {
    if (!(candidate instanceof Response)) return denied();
    if (![200, 206, 304].includes(candidate.status)) return denied();
    // Partial and not-modified representations require a client-side range or
    // conditional request respectively; neither is a generic 200 fallback.
    // Never trust a 206 body without its bounded Content-Range metadata.
    if (candidate.status === 206 &&
        !isCloudflareStaticSingleByteRangeBoundV1(request, candidate)) {
      return denied();
    }
    if (candidate.status === 304 &&
        !isCloudflareStaticNotModifiedBoundV1(request, candidate)) {
      return denied();
    }
    const headers = new Headers(candidate.headers);
    if (headers.has('set-cookie') || headers.has('location')) return denied();
    for (const key of headers.keys()) {
      if (key.toLowerCase().startsWith('access-control-')) return denied();
    }

    const path = new URL(request.url).pathname;
    const expectedHtml = CLOUDFLARE_PUBLIC_HTML_PATHS_V1.includes(path);
    const media = (headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const isHtml = media === 'text/html' || media === 'application/xhtml+xml';
    // No HTML or SSE/streaming response may be smuggled as a non-HTML asset.
    // A missing/unknown media type is not a grant to serve an arbitrary body.
    const safeStaticMedia = candidate.status === 304 && media === '' ||
      media === 'text/javascript' ||
      media === 'application/javascript' || media === 'text/css' ||
      media === 'application/json' || media === 'text/plain' ||
      media === 'application/wasm' || media === 'application/octet-stream' ||
      media === 'application/pdf' || media.startsWith('image/') ||
      media.startsWith('font/') || media.startsWith('audio/') ||
      media.startsWith('video/');
    if (expectedHtml !== isHtml || (expectedHtml && candidate.status !== 200) ||
        (!expectedHtml && !safeStaticMedia)) {
      return denied();
    }
    if (expectedHtml) {
      for (const [key, value] of Object.entries(BASE_HEADERS)) headers.set(key, value);
    } else {
      // Preserve existing static-cache semantics for JS/CSS/media, while
      // forcing the same CSP/anti-sniffing/anti-indexing response policy.
      for (const [key, value] of Object.entries(BASE_HEADERS)) {
        if (key !== 'Cache-Control') headers.set(key, value);
      }
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
