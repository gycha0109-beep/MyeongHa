// Single myeongha Worker: static assets, existing web Member Auth and
// separately governed subject-scoped Auth/DB/Saju API adapters.
// No API Worker-to-Worker hop and no implicit Vercel proxy.
import sealedRuntime from './preview-worker.mjs';
import {SEYEON_SECURITY_S0_PRODUCTION_V1,
  SEYEON_SECURITY_S0_GOVERNOR_APPROVAL_V1} from '../apps/api/src/seyeon-security-s0-production-policy-v1.js';
import apiRuntime, {cloudflareEmergencyHoldEnabledV1} from '../workers/cloudflare-static-preview.mjs';
import { isSeyeonCloudflareProtectedIngressAliasV1 } from '../apps/api/src/seyeon-cloudflare-ops-router-handoff-offline-v1.js';
import { cloudflareAuthRoute, handleCloudflareAuthRequest, rateLimitCloudflareRequestV1 } from './member-auth-worker.mjs';
import { matchCloudflareApiRoute } from '../workers/cloudflare-api-router.mjs';
import { executeSecurityObservedRequestV1 } from '../apps/api/src/security-observability.ts';

const HEALTH_HEADERS = Object.freeze({
  'Cache-Control':'no-store',
  'Content-Security-Policy':"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'",
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
  'X-Robots-Tag':'noindex, nofollow, noarchive',
});

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
    const receiptRoute=/^\/api\/chat\/delivery-receipts\/[a-f0-9-]+$/u.test(url.pathname);
    const revokeRoute=/^\/api\/memories\/[a-f0-9-]+\/grants\/seyeon\/revoke$/u.test(url.pathname);
    const firstReplyRoute=/^\/api\/chat\/[a-f0-9-]+\/turns$/u.test(url.pathname);
    if(request.method==='POST' && url.search==='' && SEYEON_SECURITY_S0_PRODUCTION_V1.receiptAndWithdrawalEnabled &&
       (receiptRoute||revokeRoute||(firstReplyRoute&&SEYEON_SECURITY_S0_PRODUCTION_V1.modelUseEnabled&&!cloudflareEmergencyHoldEnabledV1(env)))){
      // Import inside the request: DB pools/credentials never become isolate
      // global state. Every alias/history/replay still reaches the sealed router.
      return executeSecurityObservedRequestV1({request,
        routeId:receiptRoute?'api.chat.delivery-receipt':revokeRoute?'api.memories.seyeon.revoke':'rewrite.chat.turns',
        execute:async()=>{
      let runtime;
      try{
        const rejected=await rateLimitCloudflareRequestV1(request,env,
          receiptRoute?'seyeon-receipt':revokeRoute?'seyeon-withdrawal':'seyeon-turn');
        if(rejected)return rejected;
        const {createProductionSeyeonFirstMemoryFetchRuntimeV1}=await import(
          '../apps/api/src/production-seyeon-first-memory-fetch-runtime-v1.js');
        runtime=createProductionSeyeonFirstMemoryFetchRuntimeV1({
          env,approvedPersonalRecordModelUse:()=>SEYEON_SECURITY_S0_PRODUCTION_V1.receiptAndWithdrawalEnabled,
          governorApproval:SEYEON_SECURITY_S0_GOVERNOR_APPROVAL_V1,
        });
        const response=await runtime.handleRequest(request);
        const headers=new Headers(response.headers);
        for(const [key,value] of Object.entries(HEALTH_HEADERS))headers.set(key,value);
        if(firstReplyRoute&&response.status===200){
          headers.set('Cache-Control','no-store, no-transform');
          headers.set('Content-Encoding','identity');
        }
        return new Response(response.body,{status:response.status,headers});
      }catch{
        return Response.json({ok:false,error:{code:'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',retryable:false}},
          {status:503,headers:HEALTH_HEADERS});
      }finally{try{await runtime?.close();}catch{ /* never replace a committed response with private diagnostics */ }}
      }});
    }
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
      const response = cloudflareAuthRoute(request, env) !== null && route !== null
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
