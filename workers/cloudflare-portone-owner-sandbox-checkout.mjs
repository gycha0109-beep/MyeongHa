// Watchtower-Track: commerce-payment
// Owner-only PortOne V2 sandbox handoff: read-only, DB-owned Payment Attempt.
// Never supplies API Secret, never starts a charge and never mints credit.
import {createCloudflareSubjectPoolV1} from './cloudflare-hyperdrive-subject-pool.mjs';
import {
  approvedCloudflareAuthOriginV1,approvedCloudflareSameOriginPostV1,
  approvedCloudflareStage5HandoffV1,approvedCloudflarePostgresTargetV1,
  CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1,
} from './cloudflare-auth-db-api.mjs';
import {parseProductionUserDataRuntimeConfigV1}
 from '../apps/api/src/production-user-data-runtime-config.js';
import {createProductionRequestIdentityVerifierV1}
 from '../apps/api/src/production-request-identity-verifier.js';
import {CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1}
 from '../apps/api/src/cloudflare-direct-postgres-candidate.js';
import {loadCloudflarePortOneOwnerSandboxCheckoutHandoffV1}
 from '../apps/api/src/cloudflare-portone-owner-sandbox-checkout-handoff-v1.js';
import {commitCloudflareOwnerPortOneSandboxHandoffV1}
 from '../apps/api/src/cloudflare-owner-portone-sandbox-handoff-commit-v1.js';

const HEADERS=CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1;
const PATH='/api/me/credits/portone/test-checkout';
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const MAX_BODY_BYTES=256;
const error=(status,code)=>Response.json({
  ok:false,error:{code,retryable:false},
},{status,headers:HEADERS});
function requireBodyShape(value){
  if(value===null||typeof value!=='object'||Array.isArray(value))return null;
  if(Object.keys(value).length!==1||!Object.hasOwn(value,'paymentAttemptId')||
     typeof value.paymentAttemptId!=='string'||!UUID.test(value.paymentAttemptId))return null;
  return {paymentAttemptId:value.paymentAttemptId.toLowerCase()};
}
async function boundedJson(request){
  const type=request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if(type!=='application/json')return null;
  const size=request.headers.get('content-length');
  if(size!==null&&(!/^[0-9]{1,8}$/.test(size)||Number(size)>MAX_BODY_BYTES))return null;
  if(!request.body)return null;
  const reader=request.body.getReader();
  let bytes=0;
  const chunks=[];
  try{
    while(true){
      const next=await reader.read();
      if(next.done)break;
      bytes+=next.value.byteLength;
      if(bytes>MAX_BODY_BYTES)return null;
      chunks.push(next.value);
    }
  }finally{
    try{await reader.cancel();}catch{}
  }
  if(bytes===0)return null;
  const joined=new Uint8Array(bytes);
  let offset=0;
  for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
  let json;
  try{json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));}
  catch{return null;}
  return requireBodyShape(json);
}

/** Only previously DB-issued sandbox attempt; no creation or public Offer activation. */
export async function tryHandleCloudflareOwnerPortOneSandboxCheckoutV1(request,bindings,route){
  if(route?.id!=='rewrite.commerce.owner-sandbox-checkout')return null;
  const url=new URL(request.url);
  if(url.pathname!==PATH||url.search!==''||url.hash!=='')return error(404,'NOT_FOUND');
  if(request.method!=='POST')return new Response(null,{status:405,headers:{...HEADERS,Allow:'POST'}});
  const origin=approvedCloudflareAuthOriginV1(request,bindings);
  if(origin===null||!approvedCloudflareStage5HandoffV1(bindings,origin,false))
    return error(503,'SANDBOX_CHECKOUT_UNAVAILABLE');
  if(!approvedCloudflareSameOriginPostV1(request,origin))
    return error(403,'CROSS_ORIGIN_DENIED');
  const body=await boundedJson(request);
  if(body===null)return error(400,'INVALID_REQUEST');
  let pool;
  try{
    const config=parseProductionUserDataRuntimeConfigV1(bindings);
    if(!approvedCloudflarePostgresTargetV1(config,bindings))
      return error(503,'SANDBOX_CHECKOUT_UNAVAILABLE');
    const verifier=createProductionRequestIdentityVerifierV1({config});
    const evidence=await verifier.verifyRequestIdentity(request);
    if(evidence===null)return error(401,'AUTH_REQUIRED');
    if(evidence.kind!=='member')return error(403,'MEMBER_REQUIRED');
    pool=createCloudflareSubjectPoolV1(config,bindings,CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1);
    const checkout=await loadCloudflarePortOneOwnerSandboxCheckoutHandoffV1({
      env:bindings,pool,verifiedEvidence:evidence,
      paymentAttemptId:body.paymentAttemptId,
    });
    // Durable state transition precedes the browser response. A failed DB
    // transition never releases SDK material; no browser callback is trusted.
    await commitCloudflareOwnerPortOneSandboxHandoffV1({
      pool,verifiedEvidence:evidence,
      paymentAttemptId:body.paymentAttemptId,
      providerRequestId:checkout.paymentId,
    });
    // Deliberate SDK handoff only, not proof of payment or credit entitlement.
    return Response.json({ok:true,data:{
      paymentAttemptId:body.paymentAttemptId,
      environment:'sandbox',
      checkout,
    }},{status:200,headers:HEADERS});
  }catch{
    // Do not leak Owner identity/DB/PortOne credentials in responses.
    return error(503,'SANDBOX_CHECKOUT_UNAVAILABLE');
  }finally{try{await pool?.close();}catch{}}
}
