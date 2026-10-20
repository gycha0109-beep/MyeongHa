// Cloudflare static preview: explicitly NOT the production API runtime.
// Every /api request goes through this deny-only Worker; Static Assets serve
// known files directly. Do not connect Supabase, OpenAI, Saju or PortOne here.
// Watchtower-Track: ops

const BASE_HEADERS = Object.freeze({
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

  if (
    request.method === 'POST' &&
    isSeyeonTurnSendPath(url.pathname)
  ) {
    // Preserve the positive first-reveal HOLD. Never forward or stream.
    return Response.json(FIRST_REVEAL_ERROR, {
      status: 503,
      headers: BASE_HEADERS,
    });
  }

  // All other API requests, including unknown paths and wrong methods,
  // are deliberately NOT routed to a Vercel fallback or a placeholder 200.
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
