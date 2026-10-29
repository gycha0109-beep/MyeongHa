// Watchtower-Track: commerce-payment
// Private Owner sandbox preparation and verified receipt endpoints. Each
// action is independently bound to the authenticated Member Subject and
// exact same-origin JSON; no Production checkout or credit issuance here.
import {createCloudflareSubjectPoolV1} from './cloudflare-hyperdrive-subject-pool.mjs';
import {
 approvedCloudflareAuthOriginV1,approvedCloudflareStage5HandoffV1,
 approvedCloudflarePostgresTargetV1,approvedCloudflareSameOriginPostV1,
 CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1,
} from './cloudflare-auth-db-api.mjs';
import {parseProductionUserDataRuntimeConfigV1}
 from '../apps/api/src/production-user-data-runtime-config.js';
import {createProductionRequestIdentityVerifierV1}
 from '../apps/api/src/production-request-identity-verifier.js';
import {CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1}
 from '../apps/api/src/cloudflare-direct-postgres-candidate.js';
import {prepareCloudflareOwnerKcpSandboxPurchaseV1}
 from '../apps/api/src/cloudflare-owner-kcp-sandbox-prepare-v1.js';
import {inspectCloudflareOwnerKcpSandboxPaymentV1}
 from '../apps/api/src/cloudflare-owner-portone-sandbox-readonly-verification-v1.js';
import {persistCloudflareOwnerKcpSignedSandboxReceiptV1}
 from '../apps/api/src/cloudflare-owner-kcp-signed-sandbox-receipt-v1.js';

const HEADERS=CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1;
const PREPARE='/api/me/credits/portone/test-prepare';
const VERIFY='/api/me/credits/portone/test-verify';
const PREPARE_ROUTE='rewrite.commerce.owner-sandbox-prepare';
const VERIFY_ROUTE='rewrite.commerce.owner-sandbox-verify';
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const TOKEN=/^[a-f0-9]{32}$/u;
const MAX_BYTES=192;
const err=(status,code)=>Response.json({ok:false,error:{code,retryable:false}},
  {status,headers:HEADERS});
async function parseActionBody(request,kind){
 if(request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json')
  return null;
 const len=request.headers.get('content-length');
 if(len!==null&&(!/^\d{1,6}$/.test(len)||Number(len)>MAX_BYTES))return null;
 if(!request.body)return null;
 const reader=request.body.getReader();
 let total=0;
 const pieces=[];
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   total+=value.byteLength;
   if(total>MAX_BYTES)return null;
   pieces.push(value);
  }
 }finally{try{await reader.cancel();}catch{}}
 if(!total)return null;
 const bytes=new Uint8Array(total);
 let offset=0;for(const p of pieces){bytes.set(p,offset);offset+=p.byteLength;}
 let obj;
 try{obj=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch{return null;}
 if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).length!==1)return null;
 if(kind==='prepare'&&
    Object.hasOwn(obj,'idempotencyToken')&&typeof obj.idempotencyToken==='string'&&
    TOKEN.test(obj.idempotencyToken))
    return {idempotencyToken:obj.idempotencyToken};
 if(kind==='verify'&&
    Object.hasOwn(obj,'paymentAttemptId')&&typeof obj.paymentAttemptId==='string'&&
    UUID.test(obj.paymentAttemptId))
    return {paymentAttemptId:obj.paymentAttemptId.toLowerCase()};
 return null;
}

/** No client-supplied product, amount, payment ID, Subject or PSP authority. */
export async function tryHandleCloudflareOwnerSandboxActionsV1(request,bindings,route){
 const kind=route?.id===PREPARE_ROUTE?'prepare':route?.id===VERIFY_ROUTE?'verify':null;
 if(kind===null)return null;
 const url=new URL(request.url);
 if(url.pathname!==(kind==='prepare'?PREPARE:VERIFY)||url.search!==''||url.hash!=='')
  return err(404,'NOT_FOUND');
 if(request.method!=='POST')return new Response(null,{status:405,headers:{...HEADERS,Allow:'POST'}});
 const origin=approvedCloudflareAuthOriginV1(request,bindings);
 if(origin===null||!approvedCloudflareStage5HandoffV1(bindings,origin,false))
  return err(503,'SANDBOX_AUTHORITY_UNAVAILABLE');
 if(!approvedCloudflareSameOriginPostV1(request,origin))
  return err(403,'CROSS_ORIGIN_DENIED');
 const body=await parseActionBody(request,kind);
 if(body===null)return err(400,'INVALID_REQUEST');
 let pool;
 try{
  const config=parseProductionUserDataRuntimeConfigV1(bindings);
  if(!approvedCloudflarePostgresTargetV1(config,bindings))
   return err(503,'SANDBOX_AUTHORITY_UNAVAILABLE');
  const evidence=await createProductionRequestIdentityVerifierV1({config})
    .verifyRequestIdentity(request);
  if(evidence===null)return err(401,'AUTH_REQUIRED');
  if(evidence.kind!=='member')return err(403,'MEMBER_REQUIRED');
  pool=createCloudflareSubjectPoolV1(config,bindings,CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1);
  if(kind==='prepare'){
   const data=await prepareCloudflareOwnerKcpSandboxPurchaseV1({
     pool,verifiedEvidence:evidence,idempotencyToken:body.idempotencyToken,
   });
   return Response.json({ok:true,data},{status:200,headers:HEADERS});
  }
  // Receipt writes require the *independent* K2 server attestation key
  // and a restricted SECURITY DEFINER RPC. Without K2 this remains a
  // read-only PSP inspection, never an implicit privileged DB escalation.
  const data=typeof bindings?.MYEONGHA_COMMERCE_SANDBOX_RECEIPT_HMAC_K2_SECRET==='string'
   ? await persistCloudflareOwnerKcpSignedSandboxReceiptV1({
      env:bindings,pool,verifiedEvidence:evidence,paymentAttemptId:body.paymentAttemptId,
     })
   : await inspectCloudflareOwnerKcpSandboxPaymentV1({
      env:bindings,pool,verifiedEvidence:evidence,paymentAttemptId:body.paymentAttemptId,
     });
  return Response.json({ok:true,data},{status:200,headers:HEADERS});
 }catch(error){
  // Only the exact PostgreSQL sandbox request-budget constraint is safe to
  // expose as a stable diagnostic. Other DB/identity failures stay sealed.
  if(kind==='prepare'&&error?.code==='P0001'&&
     error?.constraint==='owner_kcp_sandbox_daily_limit')
    return err(429,'SANDBOX_DAILY_LIMIT');
  // Do not reveal Supabase secrets, PSP receipts or identity error details.
  return err(503,'SANDBOX_AUTHORITY_UNAVAILABLE');
 }finally{try{await pool?.close();}catch{}}
}
