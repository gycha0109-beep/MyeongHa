// Single myeongha Worker: static assets, existing web Member Auth and
// separately governed subject-scoped Auth/DB/Saju API adapters.
// No API Worker-to-Worker hop and no implicit Vercel proxy.
import sealedRuntime from './preview-worker.mjs';
import { handleCloudflareAuthRequest } from './member-auth-worker.mjs';
import apiRuntime from '../workers/cloudflare-static-preview.mjs';
import { isSeyeonCloudflareProtectedIngressAliasV1 } from '../apps/api/src/seyeon-cloudflare-ops-router-handoff-offline-v1.js';

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
      // Preserve the currently deployed Member Auth/Rate Limiter contract
      // for its exact primary origin, before governed Ops API fallthrough.
      const memberAuth = await handleCloudflareAuthRequest(request, env);
      if (memberAuth !== null) return memberAuth;
      return apiRuntime.fetch(request, env, ctx);
    }
    if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
      const index = new URL(url);
      index.pathname = '/index.html';
      return sealedRuntime.fetch(new Request(index, request), env, ctx);
    }
    return sealedRuntime.fetch(request, env, ctx);
  },
};
