// Single myeongha Worker: static assets, existing web Member Auth and
// separately governed subject-scoped Auth/DB/Saju API adapters.
// No API Worker-to-Worker hop and no implicit Vercel proxy.
import sealedRuntime from './preview-worker.mjs';
import {isOwnerPortOneSdkRequestV1,serveOwnerPortOneSdkV1} from './owner-portone-sdk-proxy.mjs';
import {SEYEON_SECURITY_S0_PRODUCTION_V1,
  SEYEON_SECURITY_S0_GOVERNOR_APPROVAL_V1} from '../apps/api/src/seyeon-security-s0-production-policy-v1.js';
import apiRuntime, {cloudflareEmergencyHoldEnabledV1} from '../workers/cloudflare-static-preview.mjs';
import { isSeyeonCloudflareProtectedIngressAliasV1 } from '../apps/api/src/seyeon-cloudflare-ops-router-handoff-offline-v1.js';
import { cloudflareAuthRoute, handleCloudflareAuthRequest, rateLimitCloudflareRequestV1 } from './member-auth-worker.mjs';
import {approvedCloudflareAuthOriginV1} from '../workers/cloudflare-auth-db-api.mjs';
import { matchCloudflareApiRoute } from '../workers/cloudflare-api-router.mjs';
import { executeSecurityObservedRequestV1 } from '../apps/api/src/security-observability.ts';

const HEALTH_HEADERS = Object.freeze({
  'Cache-Control':'no-store',
  'Content-Security-Policy':"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'",
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
  'X-Robots-Tag':'noindex, nofollow, noarchive',
});

function withWorkerVersion(response,env){
  const version = env?.CF_VERSION_METADATA?.id;
  if (typeof version !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(version)) return response;
  const headers = new Headers(response.headers);
  headers.set('X-Myeongha-Worker-Version', version);
  return new Response(response.body, {
    status: response.status, statusText: response.statusText, headers,
  });
}

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
    if(approvedCloudflareAuthOriginV1(request,env)!==null && request.method==='POST' && url.search==='' && SEYEON_SECURITY_S0_PRODUCTION_V1.receiptAndWithdrawalEnabled &&
       (receiptRoute||revokeRoute||(firstReplyRoute&&SEYEON_SECURITY_S0_PRODUCTION_V1.modelUseEnabled&&
       !cloudflareEmergencyHoldEnabledV1(env)))){
      // Import inside the request: DB pools/credentials never become isolate
      // global state. Every alias/history/replay still reaches the sealed router.
      const response=await executeSecurityObservedRequestV1({request,
        routeId:receiptRoute?'api.chat.delivery-receipt':revokeRoute?'api.memories.seyeon.revoke':'rewrite.chat.turns',
        execute:async()=>{
      let runtime;
      try{
        const rejected=await rateLimitCloudflareRequestV1(request,env,
          receiptRoute?'seyeon-receipt':revokeRoute?'seyeon-withdrawal':'seyeon-turn');
        if(rejected)return rejected;
        const {createCloudflareSeyeonFirstMemoryRuntimeV1}=await import(
          '../workers/cloudflare-seyeon-first-memory-runtime.mjs');
        runtime=createCloudflareSeyeonFirstMemoryRuntimeV1({
          env,approvedPersonalRecordModelUse:()=>SEYEON_SECURITY_S0_PRODUCTION_V1.receiptAndWithdrawalEnabled,
          governorApproval:SEYEON_SECURITY_S0_GOVERNOR_APPROVAL_V1,
        });
        // The general paid rail remains sealed until atomic reservation and
        // delivery-receipt settlement are actually mounted. The sole DB-bound
        // Owner Admin may test the existing governed, G1/G2/G3-protected AI.
        // Even a server-side account lookup failure must not admit a model.
        if(firstReplyRoute && !(await runtime.verifyOwnerCreditExemption(request))){
          return Response.json({ok:false,error:{code:'CREDIT_AUTHORITY_UNAVAILABLE',retryable:false}},
            {status:503,headers:HEALTH_HEADERS});
        }
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
      return withWorkerVersion(response,env);
    }
    // Allow only exact room creation and owner-scoped thread re-read through
    // the existing authenticated API. This does not open model turns, Reveal,
    // consent history, replay, or any client-controlled legacy routing alias.
    const canonicalOpen = request.method === 'POST' &&
      url.pathname === '/api/chat' && url.search === '';
    const readKeys = [...url.searchParams.keys()];
    const canonicalRoomRead = request.method === 'GET' &&
      /^\/api\/chat\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu.test(url.pathname) &&
      readKeys.every(key => key === 'afterSequenceNo' || key === 'pageSize') &&
      readKeys.length === new Set(readKeys).size;
    if ((canonicalOpen || canonicalRoomRead) &&
        !malformedApiRoot(url.pathname) &&
        !readKeys.some(key => key.toLowerCase().includes('myeongha_chat_'))) {
      return withWorkerVersion(await apiRuntime.fetch(request, env, ctx), env);
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
      return withWorkerVersion(response,env);
    }
    // Only this exact read-only path may relay the fixed official PortOne
    // SDK. No arbitrary URLs, request credentials or checkout data cross it.
    if (isOwnerPortOneSdkRequestV1(request,url)) {
      return withWorkerVersion(await serveOwnerPortOneSdkV1(),env);
    }
    // This owner-only *test console* static HTML can load the official KCP
    // SDK without relaxing the production SPA's strict CSP. All sensitive
    // operations independently require DB-verified Owner Admin and sandbox.
    if (url.pathname === '/owner-portone-sandbox.html' && url.search === '' &&
        (request.method === 'GET' || request.method === 'HEAD')) {
      const response = await sealedRuntime.fetch(request, env, ctx);
      if (response.status !== 200) return withWorkerVersion(response, env);
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy',
        "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; "+
        "script-src 'self' https://cdn.portone.io; style-src 'self'; "+
        "connect-src 'self' https://*.portone.io https://*.kcp.co.kr; "+
        "img-src 'self' data: https:; font-src 'self'; "+
        "frame-src https:; form-action 'self' https:");
      headers.set('Cache-Control','no-store');
      headers.set('Referrer-Policy','no-referrer');
      headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
      return withWorkerVersion(new Response(response.body,{
        status:response.status,statusText:response.statusText,headers,
      }),env);
    }
    if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
      const index = new URL(url);
      index.pathname = '/index.html';
      return sealedRuntime.fetch(new Request(index, request), env, ctx);
    }
    return sealedRuntime.fetch(request, env, ctx);
  },
};
