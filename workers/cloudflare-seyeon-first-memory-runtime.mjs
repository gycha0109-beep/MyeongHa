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
  // The G4 bridge is selected only by the server-owned mount state. When
  // enabled, the dedicated Commerce binding is mandatory and separately
  // preflighted; receipt-only privacy behavior remains independent otherwise.
  const creditSettlementEnabled=input.creditSettlementEnabled===true;
  const privateCreditPool=creditSettlementEnabled
    ?createCloudflareSeyeonG5PrivateCommercePoolV1(input.env,limits)
    :undefined;
  const pool=createCloudflareSeyeonReceiptWithdrawalSubjectPoolV1(input.env,limits);
  return Object.freeze({
    handleRequest(request){
      const requestId=crypto.randomUUID();
      return creditSettlementEnabled
        ?handleSeyeonPositiveReceiptAndCreditCandidateV1({
          request,pool,privateCreditPool,requestId,
        })
        :handleSeyeonPositiveReplyReceiptV1({request,pool,requestId});
    },
    async close(){
      try{await pool.close();}finally{await privateCreditPool?.close();}
    },
  });
}
