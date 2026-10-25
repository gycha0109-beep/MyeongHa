// Single production Cloudflare Worker: web assets and explicit API boundary.
// Reuse the existing preview ingress/egress security fences for every API route
// until its native Workers implementation has been separately verified.
// Never proxy an API request to this Worker itself or to an unapproved origin.
import sealedRuntime from './preview-worker.mjs';
import {SEYEON_SECURITY_S0_PRODUCTION_V1,
  SEYEON_SECURITY_S0_GOVERNOR_APPROVAL_V1} from '../apps/api/src/seyeon-security-s0-production-policy-v1.js';

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
    const receiptRoute=/^\/api\/chat\/delivery-receipts\/[a-f0-9-]+$/u.test(url.pathname);
    const revokeRoute=/^\/api\/memories\/[a-f0-9-]+\/grants\/seyeon\/revoke$/u.test(url.pathname);
    const firstReplyRoute=/^\/api\/chat\/[a-f0-9-]+\/turns$/u.test(url.pathname);
    if(url.search==='' && SEYEON_SECURITY_S0_PRODUCTION_V1.receiptAndWithdrawalEnabled &&
       (receiptRoute||revokeRoute||(firstReplyRoute&&SEYEON_SECURITY_S0_PRODUCTION_V1.modelUseEnabled))){
      // Import inside the request: DB pools/credentials never become isolate
      // global state. Every alias/history/replay still reaches the sealed router.
      let runtime;
      try{
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
    }
    return sealedRuntime.fetch(request, env, ctx);
  },
};
