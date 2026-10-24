// Main-branch public web edge. This Worker owns UI assets only.
// The existing "myeongha" Worker keeps exclusive Auth/DB/Saju/API authority.
const HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
});

function withHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(HEADERS)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function apiDisposition(pathname) {
  const firstSegment = pathname.split('/')[1] ?? '';
  let decoded = firstSegment;
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return 'reject';
    }
  }
  if (/^api(?:$|[\/\\.;\u0000])/iu.test(decoded) || /^api$/iu.test(decoded)) {
    // All encoded, mixed-case and ambiguous API paths are denied before static lookup.
    return (pathname === '/api' || pathname.startsWith('/api/')) ? 'proxy' : 'reject';
  }
  return 'asset';
}

function unavailable(status = 503) {
  return withHeaders(Response.json({ error: 'CLOUDFLARE_AUTHORITY_API_UNAVAILABLE' }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  }));
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    const disposition = apiDisposition(pathname);
    if (disposition === 'reject') return unavailable(404);
    if (disposition === 'proxy') {
      if (typeof env?.AUTHORITY_API?.fetch !== 'function') return unavailable();
      try {
        // Request including method, credentials, headers and body goes straight to
        // the unmodified authoritative Worker through a private Service Binding.
        return withHeaders(await env.AUTHORITY_API.fetch(request));
      } catch {
        return unavailable();
      }
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return withHeaders(new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' },
      }));
    }
    if (typeof env?.ASSETS?.fetch !== 'function') return unavailable();
    try {
      const response = await env.ASSETS.fetch(request);
      return withHeaders(response);
    } catch {
      return unavailable();
    }
  },
};
