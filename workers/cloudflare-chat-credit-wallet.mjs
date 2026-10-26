// Watchtower-Track: commerce-payment
// Member wallet and operator capability: strictly read-only, no payment writes.
import {createCloudflareSubjectPoolV1} from './cloudflare-hyperdrive-subject-pool.mjs';
import {
  approvedCloudflareAuthOriginV1,
  approvedCloudflareStage5HandoffV1,
  approvedCloudflarePostgresTargetV1,
  CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1,
} from './cloudflare-auth-db-api.mjs';
import {parseProductionUserDataRuntimeConfigV1}
  from '../apps/api/src/production-user-data-runtime-config.js';
import {createProductionChatCreditWalletRuntimeV1}
  from '../apps/api/src/production-chat-credit-wallet-runtime-v1.js';

function held(){
  return Response.json({ok:false,error:{code:'CREDIT_AUTHORITY_UNAVAILABLE',retryable:true}},
    {status:503,headers:CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1});
}

export async function tryHandleCloudflareMemberCreditWalletV1(request,bindings,route) {
  if(route?.id!=='rewrite.chat.credit-wallet') return null;
  const url=new URL(request.url);
  if(url.pathname!=='/api/me/credits'||url.search!==''||url.hash!=='') {
    return new Response(null,{status:404,headers:CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1});
  }
  if(request.method!=='GET'){
    return new Response(null,{status:405,headers:{
      ...CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1,Allow:'GET',
    }});
  }
  const origin=approvedCloudflareAuthOriginV1(request,bindings);
  if(origin===null||!approvedCloudflareStage5HandoffV1(bindings,origin,false)) return held();
  let pool,runtime;
  try{
    const config=parseProductionUserDataRuntimeConfigV1(bindings);
    if(!approvedCloudflarePostgresTargetV1(config,bindings)) return held();
    pool=createCloudflareSubjectPoolV1(config,bindings,{
      maxConnectionsPerRuntime:1,connectionTimeoutMs:5000,
      idleTimeoutMs:1000,statementTimeoutMs:5000,
    });
    runtime=createProductionChatCreditWalletRuntimeV1({env:bindings,pool});
    const result=await runtime.handleRequest({
      request,requestId:crypto.randomUUID(),serverTime:new Date().toISOString(),
    });
    if(result.status>=300&&result.status<400||
       result.headers.has('set-cookie')||
       !result.headers.get('content-type')?.startsWith('application/json')) return held();
    const headers=new Headers(result.headers);
    for(const [key,value] of Object.entries(CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1)){
      headers.set(key,value);
    }
    return new Response(result.body,{status:result.status,headers});
  }catch{
    return held();
  }finally{
    try{await runtime?.close();}catch{ /* transport closed */ }
    try{await pool?.close();}catch{ /* transport closed */ }
  }
}
