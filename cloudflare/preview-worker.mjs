// Preview-only static delivery. Keep every unported API route fail-closed.
const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'no-store',
});

function protectedHeaders(extra = {}) {
  return { ...SECURITY_HEADERS, ...extra };
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (/^\\/api(?:\\/|%2f|$)/iu.test(pathname)) {
      return new Response(JSON.stringify({ error: 'API_NOT_ACTIVATED_ON_PREVIEW' }), {
        status: 503,
        headers: protectedHeaders({ 'Content-Type': 'application/json; charset=utf-8' }),
      });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: protectedHeaders({ Allow: 'GET, HEAD' }),
      });
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
