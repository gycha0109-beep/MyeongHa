// One canonical Cloudflare Worker: web assets and the existing governed API.
// Non-chat API execution remains subject to its original Auth/DB/Saju gates.
// Se-yeon / encoded Chat aliases retain the newer hard HOLD before dispatch.
import sealedRuntime from './preview-worker.mjs';
import apiRuntime from '../workers/cloudflare-static-preview.mjs';
import { isSeyeonCloudflareProtectedIngressAliasV1 } from '../apps/api/src/seyeon-cloudflare-ops-router-handoff-offline-v1.js';

function malformedApiRoot(pathname) {
  if (pathname === '/api' || pathname.startsWith('/api/')) return false;
  let segment = pathname.split('/')[1] ?? '';
  for (let depth = 0; depth < 12; depth++) {
    if (/^api(?:$|[\\/\\.;\\u0000%])/iu.test(segment)) return true;
    if (!segment.includes('%')) break;
    try {
      const decoded = decodeURIComponent(segment);
      if (decoded === segment) break;
      segment = decoded;
    } catch { return true; }
  }
  return /^api(?:$|[\\/\\.;\\u0000%])/iu.test(segment);
}

export default {
  fetch(request, env, ctx) {
    let url;
    try { url = new URL(request.url); }
    catch { return sealedRuntime.fetch(request, env, ctx); }
    // Legacy markers and all Chat endpoints are guarded by the current
    // independent Security-owned pre-Provider and egress fences.
    if (isSeyeonCloudflareProtectedIngressAliasV1(request) ||
        malformedApiRoot(url.pathname)) {
      return sealedRuntime.fetch(request, env, ctx);
    }
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      // No Service Binding, external API proxy, or second Worker hop.
      return apiRuntime.fetch(request, env, ctx);
    }
    // Only the documented root resolves to index.html. Other missing pages
    // stay missing; no SPA fallback can turn an unknown API into an asset.
    if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
      const index = new URL(url);
      index.pathname = '/index.html';
      return sealedRuntime.fetch(new Request(index, request), env, ctx);
    }
    return sealedRuntime.fetch(request, env, ctx);
  },
};
