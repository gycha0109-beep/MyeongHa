// Single myeongha Worker: static assets, existing web Member Auth and
// separately governed subject-scoped Auth/DB/Saju API adapters.
// No API Worker-to-Worker hop and no implicit Vercel proxy.
import sealedRuntime from './preview-worker.mjs';
import apiRuntime from '../workers/cloudflare-static-preview.mjs';
import { isSeyeonCloudflareProtectedIngressAliasV1 } from '../apps/api/src/seyeon-cloudflare-ops-router-handoff-offline-v1.js';
import { cloudflareAuthRoute, handleCloudflareAuthRequest } from './member-auth-worker.mjs';
import { matchCloudflareApiRoute } from '../workers/cloudflare-api-router.mjs';
import { executeSecurityObservedRequestV1 } from '../apps/api/src/security-observability.ts';

function malformedApiRoot(pathname) {
  if (pathname === '/api' || pathname.startsWith('/api/')) return false;
  let segment = pathname.split('/')[1] ?? '';
  for (let depth = 0; depth < 12; depth++) {
    if (/^api(?:$|[\/\\.;\u0000%])/iu.test(segment)) return true;
    if (!segment.includes('%')) break;
    try {
      const decoded = decodeURIComponent(segment);
      if (decoded === segment) break;
      segment = decoded;
    } catch { return true; }
  }
  return /^api(?:$|[\/\\.;\u0000%])/iu.test(segment);
}

export default {
  async fetch(request, env, ctx) {
    let url;
    try { url = new URL(request.url); }
    catch { return sealedRuntime.fetch(request, env, ctx); }
    // Security holds encoded, aliased and legacy-marker protected Chat
    // before any Auth, DB, provider or asset call.
    if (isSeyeonCloudflareProtectedIngressAliasV1(request) ||
        malformedApiRoot(url.pathname)) {
      return sealedRuntime.fetch(request, env, ctx);
    }
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      // Preserve native Member Auth/Rate Limiter priority and single event
      // coverage before governed Ops API fallthrough.
      const route = matchCloudflareApiRoute(url.pathname);
      const response = cloudflareAuthRoute(request) !== null && route !== null
        ? await executeSecurityObservedRequestV1({
            request, routeId: route.id,
            execute: () => handleCloudflareAuthRequest(request, env),
          })
        : await apiRuntime.fetch(request, env, ctx);
      const version = env?.CF_VERSION_METADATA?.id;
      if (typeof version !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(version)) return response;
      const headers = new Headers(response.headers);
      headers.set('X-Myeongha-Worker-Version', version);
      return new Response(response.body, {
        status: response.status, statusText: response.statusText, headers,
      });
    }
    if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
      const index = new URL(url);
      index.pathname = '/index.html';
      return sealedRuntime.fetch(new Request(index, request), env, ctx);
    }
    return sealedRuntime.fetch(request, env, ctx);
  },
};
