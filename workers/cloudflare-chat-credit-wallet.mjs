// Watchtower-Track: commerce-payment
// Current authenticated Member's private credit balance and Owner Admin flag.
// Read-only; checkout, charge, topup and assistant-send capabilities are absent.
import {createCloudflareSubjectPoolV1} from './cloudflare-hyperdrive-subject-pool.mjs';
import {approvedCloudflareAuthOriginV1,approvedCloudflareStage5HandoffV1,
 approvedCloudflarePostgresTargetV1,CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1}
 from './cloudflare-auth-db-api.mjs';
import {parseProductionUserDataRuntimeConfigV1}
 from '../apps/api/src/production-user-data-runtime-config.js';
import {createProductionRequestIdentityVerifierV1}
 from '../apps/api/src/production-request-identity-verifier.js';
import {executePostgresSubjectTransactionV1}
 from '../apps/api/src/postgres-subject-execution.js';
import {readOwnerAdminAccessV1}
 from '../apps/api/src/myeongha-owner-admin-access-v1.js';
import {chatCreditTopUpOfferForUiV1,COMMERCE_CHAT_CREDIT_POLICY_V1}
 from '../apps/api/src/commerce-chat-credit-gate-v1.js';
import {CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1}
 from '../apps/api/src/cloudflare-direct-postgres-candidate.js';

const HEADERS=CLOUDFLARE_APPROVED_RESPONSE_HEADERS_V1;
const error=(status,code)=>Response.json({ok:false,error:{code,retryable:false}},
 {status,headers:HEADERS});
const safeBalance=(value)=>{
 const n=typeof value==='string'&&/^\d{1,15}$/.test(value)?Number(value):value;
 if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid canonical credits');
 return n;
};
export async function tryHandleCloudflareChatCreditWalletV1(request,bindings,route){
 if(route?.id!=='rewrite.chat.credit-wallet')return null;
 const u=new URL(request.url);
 if(u.pathname!=='/api/me/credits'||u.search!==''||u.hash!=='')return error(404,'NOT_FOUND');
 if(request.method!=='GET')return new Response(null,{status:405,headers:{...HEADERS,Allow:'GET'}});
 const origin=approvedCloudflareAuthOriginV1(request,bindings);
 if(origin===null||!approvedCloudflareStage5HandoffV1(bindings,origin,false))
   return error(503,'CREDIT_AUTHORITY_UNAVAILABLE');
 let pool;
 try{
  const config=parseProductionUserDataRuntimeConfigV1(bindings);
  if(!approvedCloudflarePostgresTargetV1(config,bindings))
    return error(503,'CREDIT_AUTHORITY_UNAVAILABLE');
  pool=createCloudflareSubjectPoolV1(config,bindings,CLOUDFLARE_DIRECT_POSTGRES_CANDIDATE_LIMITS_V1);
  const verifier=createProductionRequestIdentityVerifierV1({config});
  const evidence=await verifier.verifyRequestIdentity(request);
  if(evidence===null)return error(401,'AUTH_REQUIRED');
  if(evidence.kind!=='member')return error(403,'MEMBER_REQUIRED');
  const owner=await readOwnerAdminAccessV1(pool,evidence);
  const result=await executePostgresSubjectTransactionV1({
   pool,verifiedEvidence:evidence,execute:async({client,resolvedSubject})=>{
    if(owner.verifiedSubjectId!==resolvedSubject.subjectId)
      throw Error('Credit owner Subject changed');
    if(owner.chatCreditExempt)return {availableCredits:null,totalCredits:null};
    const r=await client.query(`select available_credits as "availableCredits",
      total_credits as "totalCredits"
      from public.internal_qry_chat_credit_balance_v1($1::uuid)`,
      [resolvedSubject.subjectId]);
    if(r.rows.length!==1)throw Error('Canonical credit balance unavailable');
    return {availableCredits:safeBalance(r.rows[0].availableCredits),
      totalCredits:safeBalance(r.rows[0].totalCredits)};
   },
  });
  return Response.json({ok:true,data:{
   isOwnerAdmin:owner.isOwnerAdmin,
   creditExempt:owner.chatCreditExempt,
   ...result,
   requiredCredits:COMMERCE_CHAT_CREDIT_POLICY_V1.creditsPerDeliveredAiReply,
   topUp:chatCreditTopUpOfferForUiV1(),
  }},{headers:HEADERS});
 }catch{return error(503,'CREDIT_AUTHORITY_UNAVAILABLE');}
 finally{try{await pool?.close();}catch{}}
}
