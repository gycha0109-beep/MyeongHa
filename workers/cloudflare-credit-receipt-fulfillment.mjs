// Watchtower-Track: commerce-payment
// Fulfill an already server-verified Production Receipt; never initiate a payment.
import {createCloudflareSubjectPoolV1} from './cloudflare-hyperdrive-subject-pool.mjs';
import {approvedCloudflareAuthOriginV1,approvedCloudflareStage5HandoffV1,
 approvedCloudflarePostgresTargetV1,approvedCloudflareSameOriginPostV1,
 CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1} from './cloudflare-auth-db-api.mjs';
import {parseProductionUserDataRuntimeConfigV1} from '../apps/api/src/production-user-data-runtime-config.js';
import {createProductionRequestIdentityVerifierV1} from '../apps/api/src/production-request-identity-verifier.js';
import {executePostgresSubjectTransactionV1} from '../apps/api/src/postgres-subject-execution.js';
import {fulfillCurrentMemberCreditReceiptV1} from '../apps/api/src/commerce-credit-receipt-fulfillment-v1.js';
import {CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1} from '../apps/api/src/cloudflare-direct-postgres-candidate.js';

const PATH='/api/me/credits/portone/fulfill';
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const HEADERS=CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1;
const fail=(status,code)=>Response.json({ok:false,error:{code,retryable:false}},{status,headers:HEADERS});
async function receiptBody(request){
 if(request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json'||!request.body)return null;
 const reader=request.body.getReader();let total=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;
  total+=value.byteLength;if(total>192)return null;chunks.push(value);
 }}finally{try{await reader.cancel();}catch{}try{reader.releaseLock();}catch{}}
 try{
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const x=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  return x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===1&&
   typeof x.receiptId==='string'&&UUID.test(x.receiptId)?x.receiptId.toLowerCase():null;
 }catch{return null;}
}
export async function tryHandleCloudflareCreditReceiptFulfillmentV1(request,bindings,route){
 if(route?.id!=='rewrite.commerce.credit-receipt-fulfill')return null;
 const url=new URL(request.url);
 if(url.pathname!==PATH||url.search!==''||url.hash!=='')return fail(404,'NOT_FOUND');
 if(request.method!=='POST')return new Response(null,{status:405,headers:{...HEADERS,Allow:'POST'}});
 const origin=approvedCloudflareAuthOriginV1(request,bindings);
 if(origin===null||!approvedCloudflareStage5HandoffV1(bindings,origin,false))return fail(503,'CREDIT_AUTHORITY_UNAVAILABLE');
 if(!approvedCloudflareSameOriginPostV1(request,origin))return fail(403,'CROSS_ORIGIN_DENIED');
 let pool;
 try{
  const receiptId=await receiptBody(request);if(receiptId===null)return fail(400,'INVALID_REQUEST');
  const config=parseProductionUserDataRuntimeConfigV1(bindings);
  if(!approvedCloudflarePostgresTargetV1(config,bindings))return fail(503,'CREDIT_AUTHORITY_UNAVAILABLE');
  const evidence=await createProductionRequestIdentityVerifierV1({config}).verifyRequestIdentity(request);
  if(evidence===null)return fail(401,'AUTH_REQUIRED');
  if(evidence.kind!=='member')return fail(403,'MEMBER_REQUIRED');
  pool=createCloudflareSubjectPoolV1(config,bindings,CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1);
  const data=await executePostgresSubjectTransactionV1({pool,verifiedEvidence:evidence,
   execute:scope=>fulfillCurrentMemberCreditReceiptV1({scope,receiptId})});
  return Response.json({ok:true,data},{status:200,headers:HEADERS});
 }catch{return fail(503,'CREDIT_AUTHORITY_UNAVAILABLE');}
 finally{try{await pool?.close();}catch{}}
}
