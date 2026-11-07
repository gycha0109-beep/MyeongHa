// Watchtower-Track: security
// Reuse canonical config, approved target and Hyperdrive pool authority.
import {parseProductionUserDataRuntimeConfigV1,parseProductionPostgresRuntimeConfigV1} from '../apps/api/src/production-user-data-runtime-config.js';
import {approvedCloudflarePostgresTargetV1} from './cloudflare-auth-db-api.mjs';
import {
  createCloudflareSeyeonSubjectPoolV1,
  createCloudflareSeyeonGovernedPoolV1,
  createCloudflareSeyeonReceiptWithdrawalSubjectPoolV1,
  createCloudflareSeyeonG5PrivateCommercePoolV1,
} from './cloudflare-hyperdrive-subject-pool.mjs';
import {createProductionSeyeonFirstMemoryFetchRuntimeV1} from '../apps/api/src/production-seyeon-first-memory-fetch-runtime-v1.js';
import {createProductionRequestIdentityVerifierV1} from '../apps/api/src/production-request-identity-verifier.js';
import {readOwnerAdminAccessV1} from '../apps/api/src/myeongha-owner-admin-access-v1.js';
import {handleSeyeonReceiptWithdrawalFetchV1} from '../apps/api/src/seyeon-receipt-withdrawal-fetch-v1.js';
import {handleSeyeonPositiveReplyReceiptV1} from '../apps/api/src/seyeon-first-positive-memory-fetch-delivery-v1.js';
import {handleSeyeonPositiveReceiptAndCreditCandidateV1} from '../apps/api/src/seyeon-g4-positive-receipt-credit-bridge-candidate-v1.js';
const limits=Object.freeze({maxConnectionsPerRuntime:1,connectionTimeoutMs:5000,idleTimeoutMs:1000,statementTimeoutMs:5000});
export function createCloudflareSeyeonFirstMemoryRuntimeV1(input){
 const config=parseProductionUserDataRuntimeConfigV1(input.env);
 if(!approvedCloudflarePostgresTargetV1(config,input.env)){
   throw Error('Cloudflare requires explicitly verified Hyperdrive origin');
 }
 // Create the third, dedicated Commerce connection only when the
 // server-owned production mount is enabled. Missing binding fails closed.
 const privateCreditPool=input.creditBillingProductionMounted===true
   ?createCloudflareSeyeonG5PrivateCommercePoolV1(input.env,limits)
   :undefined;
 const pool=createCloudflareSeyeonSubjectPoolV1(input.env,limits);
 const governedCostPool=createCloudflareSeyeonGovernedPoolV1(input.env,limits);
 const runtime=createProductionSeyeonFirstMemoryFetchRuntimeV1({
   ...input,pool,governedCostPool,
   ...(privateCreditPool===undefined?{}:{privateCreditPool}),
 });
 return Object.freeze({
  handleRequest:request=>runtime.handleRequest(request),
  async verifyOwnerCreditExemption(request){
    // One server-verified Member and DB-owned canonical Subject; never accept
    // email, role, session metadata or a browser claim as administrator proof.
    try {
      const verifier=createProductionRequestIdentityVerifierV1({config});
      const evidence=await verifier.verifyRequestIdentity(request);
      if(evidence?.kind!=='member')return false;
      const owner=await readOwnerAdminAccessV1(pool,evidence);
      return owner.isOwnerAdmin===true&&owner.chatCreditExempt===true;
    }catch{return false;}
  },
  async close(){
   try{await runtime.close();}finally{
    try{await pool.close();}finally{
     try{await governedCostPool.close();}finally{await privateCreditPool?.close();}
    }
   }
 }});
}

/**
 * Separate privacy-only runtime. A missing cost ledger, disabled model or
 * unprovisioned governed Hyperdrive must not strand an already-issued receipt
 * or make an original Memory withdrawal depend on the paid AI rail.
 */
export function createCloudflareSeyeonReceiptWithdrawalRuntimeV1(input){
  const config=parseProductionUserDataRuntimeConfigV1(input.env);
  if(!approvedCloudflarePostgresTargetV1(config,input.env)){
    throw Error('Cloudflare requires explicitly verified Hyperdrive origin');
  }
  const identityEvidenceVerifier=createProductionRequestIdentityVerifierV1({config});
  const pool=createCloudflareSeyeonReceiptWithdrawalSubjectPoolV1(input.env,limits);
  return Object.freeze({
    async handleRequest(request){
      const result=await handleSeyeonReceiptWithdrawalFetchV1({
        request,requestId:crypto.randomUUID(),serverTime:new Date().toISOString(),
        identityEvidenceVerifier,pool,
        approvedWithdrawalWriteAdmission:input.approvedWithdrawalWriteAdmission,
      });
      if(result===null){
        return Response.json({ok:false,error:{code:'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',retryable:false}},
          {status:503,headers:{'Cache-Control':'no-store'}});
      }
      return result;
    },
    close(){return pool.close();},
  });
}


/**
 * Issued-reply receipt is a proof-only capability, not a Member request.
 * Do not parse Supabase Auth API keys, create a Member verifier, or construct
 * a governed cost pool before acknowledging an already-issued response.
 * The S0 Subject DB checks the exact one-time attempt/proof pair.
 */
export function createCloudflareSeyeonIssuedReplyReceiptRuntimeV1(input){
  const config=parseProductionPostgresRuntimeConfigV1(input.env);
  if(!approvedCloudflarePostgresTargetV1(config,input.env)){
    throw Error('Cloudflare requires explicitly verified receipt DB origin');
  }
  // A Commerce outage must not prevent an already-issued 256-bit receipt from
  // being ACKed by the original Subject authority. Successful *settlement*
  // still requires the dedicated, separately preflighted Commerce LOGIN.
  const creditSettlementEnabled=input.creditSettlementEnabled===true;
  const pool=createCloudflareSeyeonReceiptWithdrawalSubjectPoolV1(input.env,limits);
  let privateCreditPool;
  if(creditSettlementEnabled){
    try{privateCreditPool=createCloudflareSeyeonG5PrivateCommercePoolV1(input.env,limits);}
    catch{/* Keep the original receipt ACK available; do not claim credit settlement. */}
  }
  return Object.freeze({
    async handleRequest(request){
      const requestId=crypto.randomUUID();
      if(!creditSettlementEnabled){
        return handleSeyeonPositiveReplyReceiptV1({request,pool,requestId});
      }
      if(privateCreditPool===undefined){
        // ACK the exact original proof first. The existing G5 received-credit
        // recovery can settle its durable reservation once Commerce returns.
        const receipt=await handleSeyeonPositiveReplyReceiptV1({request,pool,requestId});
        if(!receipt.ok)return receipt;
        return Response.json({ok:false,
          error:{code:'SEYEON_CREDIT_RECEIPT_SETTLEMENT_UNAVAILABLE',retryable:true}},
          {status:503,headers:{'Cache-Control':'no-store'}});
      }
      return handleSeyeonPositiveReceiptAndCreditCandidateV1({
        request,receiptPool:pool,privateCreditPool,requestId,
      });
    },
    async close(){
      try{await pool.close();}finally{await privateCreditPool?.close();}
    },
  });
}
