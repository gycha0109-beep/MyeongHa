import type {IdentityEvidenceVerificationPortV1} from './current-subject-profile-http.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import {
  readChatCreditAvailabilityV1,
  chatCreditTopUpOfferForUiV1,
} from './commerce-chat-credit-gate-v1.js';
import {createPostgresChatCreditCandidatePortsV1} from './postgres-chat-credit-candidate-v1.js';

export const CHAT_CREDIT_WALLET_HTTP_CANDIDATE_V1=Object.freeze({
  method:'GET',
  intendedRoute:'/api/me/credits',
  productionRouteMounted:false,
  apiContractVersion:'v0.9',
} as const);

function response(input: Readonly<{
  status: number;
  requestId: string;
  code: string;
  messageKey: string;
}>):Response {
  return Response.json({
    ok:false,
    error:{code:input.code,messageKey:input.messageKey,retryable:false},
    meta:{apiContractVersion:'v0.9',requestId:input.requestId},
  },{status:input.status,headers:{'Cache-Control':'no-store'}});
}

/**
 * A read-only candidate wallet endpoint. Access is bound to a freshly verified
 * Member identity and server-resolved canonical Subject transaction; it never
 * takes a Subject ID from the URL, headers, or JSON body.
 * A mounted production handler requires the approved private ledger schema
 * and narrowed database privileges, which do not exist yet.
 */
export async function handleMemberChatCreditWalletCandidateV1(input:Readonly<{
  request:Request;
  requestId:string;
  serverTime:string;
  identityEvidenceVerifier:IdentityEvidenceVerificationPortV1;
  pool:PostgresSubjectPoolV1;
}>):Promise<Response> {
  if(input.request.method!=='GET') {
    return new Response(null,{status:405,headers:{
      'Allow':'GET','Cache-Control':'no-store',
    }});
  }
  const identity=await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
  if(identity===null) {
    return response({status:401,requestId:input.requestId,
      code:'AUTH_REQUIRED',messageKey:'auth.required'});
  }
  if(identity.kind!=='member') {
    return response({status:403,requestId:input.requestId,
      code:'FORBIDDEN',messageKey:'chat.member_required'});
  }
  const state=await executePostgresSubjectTransactionV1({
    pool:input.pool,
    verifiedEvidence:identity,
    execute:async scope=>{
      if(scope.resolvedSubject.subjectKind!=='member') {
        throw new Error('Credit wallet requires a Member Subject');
      }
      const balance=createPostgresChatCreditCandidatePortsV1({
        client:scope.client,
        canonicalSubjectId:scope.resolvedSubject.subjectId,
      }).balance;
      return readChatCreditAvailabilityV1({
        verifiedSubjectId:scope.resolvedSubject.subjectId,
        balancePort:balance,
      });
    },
  });
  return Response.json({
    ok:true,
    data:{
      availableCredits:state.availableCredits,
      totalCredits:state.totalCredits,
      requiredCredits:state.requiredCredits,
      insufficient:state.insufficient,
      topUp:chatCreditTopUpOfferForUiV1(),
    },
    meta:{apiContractVersion:'v0.9',requestId:input.requestId,
      serverTime:input.serverTime},
  },{status:200,headers:{'Cache-Control':'no-store'}});
}
