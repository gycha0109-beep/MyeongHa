// Single production Cloudflare Worker: web assets and explicit API boundary.
// Reuse the existing preview ingress/egress security fences for every API route
// until its native Workers implementation has been separately verified.
// Never proxy an API request to this Worker itself or to an unapproved origin.
import sealedRuntime from './preview-worker.mjs';

const HEALTH_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // The public liveness route has no credentials, DB access or side effects.
    // Only the exact, query-free route bypasses the sealed API dispatcher:
    // encoded/legacy protected aliases must still fail closed.
    if (url.pathname === '/api/health' && url.search === '') {
      if (request.method !== 'GET') {
        return new Response(null, {
          status: 405,
          headers: { ...HEALTH_HEADERS, Allow: 'GET' },
        });
      }
      return Response.json({ status: 'ok' }, { headers: HEALTH_HEADERS });
    }
    return sealedRuntime.fetch(request, env, ctx);
  },
};
