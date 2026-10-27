import { matchCloudflareApiRoute } from './cloudflare-api-router.mjs';
import { executeSecurityObservedRequestV1 } from '../apps/api/src/security-observability.ts';
import {
  tryHandleCloudflareSeyeonSecurityV1,
  fenceCloudflareSeyeonBeforeFetchReturnV1,
} from './cloudflare-seyeon-security.mjs';
import { tryHandleCloudflareApprovedAuthV1 } from './cloudflare-auth-db-api.mjs';
import { tryHandleCloudflareContactInquiryV1 } from './cloudflare-contact-inquiry.mjs';
import { tryHandleCloudflareApprovedSajuCalculationV1 } from './cloudflare-saju-calculation.mjs';
import { tryHandleCloudflareApprovedSajuPreviewReadingV1 } from './cloudflare-saju-preview-reading.mjs';
import { tryHandleCloudflareApprovedRecordsV1 } from './cloudflare-records-api.mjs';
import { tryHandleCloudflareApprovedTargetPersonReadV1 } from './cloudflare-target-person-read.mjs';
import { tryHandleCloudflareApprovedDeviceInstallationsV1 } from './cloudflare-device-installations.mjs';
import { tryHandleCloudflareReadinessV1 } from './cloudflare-readiness.mjs';
import { tryHandleCloudflareGenericChatReadV1 } from './cloudflare-chat-read.mjs';
import { tryHandleCloudflareChatCreditWalletV1 } from './cloudflare-chat-credit-wallet.mjs';
import { tryHandleCloudflareOwnerPortOneSandboxCheckoutV1 } from './cloudflare-portone-owner-sandbox-checkout.mjs';
import { tryHandleCloudflareOwnerSandboxActionsV1 } from './cloudflare-portone-owner-sandbox-actions.mjs';

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
  const isPreviewReading = route?.id === 'rewrite.saju.preview';
  return Response.json({
    ok: false,
    error: isPreviewReading
      ? { code: 'SAJU_PREVIEW_TEMPORARILY_UNAVAILABLE', messageKey: 'saju.preview_temporarily_unavailable', retryable: true }
      : isSaju
        ? { code: 'SAJU_SERVICE_UNAVAILABLE', messageKey: 'saju.service_unavailable', retryable: true }
        : { code: 'AUTH_UPSTREAM_UNAVAILABLE', messageKey: 'auth.auth_upstream_unavailable', retryable: true },
  }, { status: 503, headers: BASE_HEADERS });
}

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

const cloudflareRuntime = {
  async fetch(request, bindings, route) {
    const url = new URL(request.url);
    // One emergency flag disables Auth/DB/Saju without contacting a provider
    // or acquiring a connection. Chat stays behind its independent 503 fence.
    const emergencyHold = cloudflareEmergencyHoldEnabledV1(bindings);
    // S-CF2: every /api/chat request is consumed here, before any other API
    // adapter. Neither another Character nor an unknown thread can accidentally
    // fall through to a future positive handler, HTML or Vercel rewrites.
    if (url.pathname === '/api/chat' || url.pathname.startsWith('/api/chat/')) {
      try {
        if (emergencyHold) {
          const sealed = fenceCloudflareSeyeonBeforeFetchReturnV1(null, crypto.randomUUID());
          const headers = new Headers(sealed.headers);
          for (const [key, value] of Object.entries(BASE_HEADERS)) headers.set(key, value);
          return new Response(sealed.body, { status: sealed.status, headers });
        }
        const chatResponse = await tryHandleCloudflareSeyeonSecurityV1(request, bindings, route);
        if (chatResponse !== null) return chatResponse;
        // Security grants no permissions to a generic read/open. The distinct
        // chat runtime repeats verified owner and DB checks independently.
        const genericChatResponse = await tryHandleCloudflareGenericChatReadV1(request, bindings, route);
        if (genericChatResponse !== null) return genericChatResponse;
        // First Se-yeon Reveal and unported chat-turn writes remain held.
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
    if (emergencyHold) {
      // Health 200 survives; protected API routes fall back to the existing
      // 404/503 deny-only dispatcher. No Worker API becomes HTML.
      return handleCloudflareStaticPreviewRequest(request);
    }
    try {
      const contactResponse = await tryHandleCloudflareContactInquiryV1(request, bindings, route);
      if (contactResponse !== null) return contactResponse;
      const approvedAuthResponse = await tryHandleCloudflareApprovedAuthV1(request, bindings, route);
      if (approvedAuthResponse !== null) return approvedAuthResponse;
      const approvedCalculationResponse = await tryHandleCloudflareApprovedSajuCalculationV1(request, bindings, route);
      if (approvedCalculationResponse !== null) return approvedCalculationResponse;
      const approvedPreviewReadingResponse = await tryHandleCloudflareApprovedSajuPreviewReadingV1(request, bindings, route);
      if (approvedPreviewReadingResponse !== null) return approvedPreviewReadingResponse;
      const walletResponse = await tryHandleCloudflareChatCreditWalletV1(request, bindings, route);
      if (walletResponse !== null) return walletResponse;
      const sandboxCheckoutResponse = await tryHandleCloudflareOwnerPortOneSandboxCheckoutV1(request, bindings, route);
      if (sandboxCheckoutResponse !== null) return sandboxCheckoutResponse;
      const ownerSandboxActionResponse = await tryHandleCloudflareOwnerSandboxActionsV1(request, bindings, route);
      if (ownerSandboxActionResponse !== null) return ownerSandboxActionResponse;
      const recordsResponse = await tryHandleCloudflareApprovedRecordsV1(request, bindings, route);
      if (recordsResponse !== null) return recordsResponse;
      const targetPersonReadResponse = await tryHandleCloudflareApprovedTargetPersonReadV1(request, bindings, route);
      if (targetPersonReadResponse !== null) return targetPersonReadResponse;
      const deviceResponse = await tryHandleCloudflareApprovedDeviceInstallationsV1(request, bindings, route);
      if (deviceResponse !== null) return deviceResponse;
      const readinessResponse = await tryHandleCloudflareReadinessV1(request, bindings, route);
      if (readinessResponse !== null) return readinessResponse;
      return handleCloudflareStaticPreviewRequest(request);
    } catch {
      // Auth/DB or calculation adapters can fail outside their own try/catch.
      // Keep a fixed no-store error code; never emit platform HTML/errors.
      return sealCloudflareUnexpectedApiFailureV1(route);
    }
  },
};

export default {
  fetch(request, bindings) {
    const route = matchCloudflareApiRoute(new URL(request.url).pathname);
    if (route === null) return cloudflareRuntime.fetch(request, bindings, route);
    return executeSecurityObservedRequestV1({
      request,
      routeId: route.id,
      execute: () => cloudflareRuntime.fetch(request, bindings, route),
    });
  },
};
