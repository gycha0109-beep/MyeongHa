// Watchtower-Track: security
// G4 private reconciliation of ONE DB-reserved positive Memory reply.
// No HTTP route or production permission; Node socket 'finish' is not delivery ACK.
import {executePostgresSubjectTransactionV1,type PostgresSubjectPoolV1}
  from './postgres-subject-execution.js';
import type {VerifiedSubjectIdentityEvidenceV1}
  from './subject-identity-resolver.js';
import {acknowledgeDeliveredChatCreditCandidateV1}
  from './commerce-chat-credit-delivery-ack-candidate-v1.js';
import {releaseFailedChatCreditsCandidateV1}
  from './commerce-chat-credit-ledger-candidate-v1.js';

export const SEYEON_G4_FIRST_MEMORY_RECONCILIATION_V1=Object.freeze({
  productionMounted:false,
  chargeRequiresOriginalDeliveredDbProof:true,
  releaseRequiresFinalUndeliveredDbProof:true,
  socketFinishIsNotDeliveryReceipt:true,
} as const);

export class SeyeonG4FirstMemoryReconciliationHoldV1 extends Error {
  readonly code='SEYEON_G4_CREDIT_RECONCILIATION_HOLD' as const;
  constructor(){
    super('First Memory credit reconciliation lacks verified original delivery authority.');
    this.name='SeyeonG4FirstMemoryReconciliationHoldV1';
  }
}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const valid=(value:unknown):value is string=>
  typeof value==='string'&&UUID.test(value);

export type SeyeonG4ReservedReplyV1=Readonly<{
  kind:'reserved';
  canonicalSubjectId:string;
  threadId:string;
  clientTurnId:string;
  reservationId:string;
  requiredCredits:10;
}>;

type SeyeonG4FinalProofV1=
  | Readonly<{kind:'confirmed_delivered';committedTurnId:string;assistantMessageId:string}>
  | Readonly<{kind:'definitive_undelivered'}>;

/**
 * This method never infers actual client receipt from successful Node writes.
 * The private DB authority independently requires either:
 *   - exact committed+delivered Turn, assistant, and S0 positive ACK receipt
 *   - exact terminal failed/abandoned, never-committed, never-delivered Turn
 * Neither case can be decided by a browser boolean or provider outcome.
 */
export async function reconcileSeyeonG4FirstMemoryCreditsV1(input:Readonly<{
  pool:PostgresSubjectPoolV1;
  verifiedEvidence:VerifiedSubjectIdentityEvidenceV1;
  admission:SeyeonG4ReservedReplyV1;
  proof:SeyeonG4FinalProofV1;
}>):Promise<Readonly<{kind:'settled'|'released';creditsCharged:10|0}>> {
  const a=input.admission;
  if(input.verifiedEvidence?.kind!=='member'||a?.kind!=='reserved'||
      a.requiredCredits!==10||
      ![a.canonicalSubjectId,a.threadId,a.clientTurnId,a.reservationId].every(valid)||
      (input.proof?.kind!=='confirmed_delivered'&&
       input.proof?.kind!=='definitive_undelivered')||
      (input.proof.kind==='confirmed_delivered'&&
        (!valid(input.proof.committedTurnId)||!valid(input.proof.assistantMessageId)))){
    throw new SeyeonG4FirstMemoryReconciliationHoldV1();
  }
  return executePostgresSubjectTransactionV1({
    pool:input.pool,verifiedEvidence:input.verifiedEvidence,
    execute:async({client,resolvedSubject})=>{
      if(resolvedSubject.subjectKind!=='member'||
          resolvedSubject.subjectId.toLowerCase()!==a.canonicalSubjectId.toLowerCase()){
        throw new SeyeonG4FirstMemoryReconciliationHoldV1();
      }
      if(input.proof.kind==='confirmed_delivered'){
        const settled=await acknowledgeDeliveredChatCreditCandidateV1({
          client,canonicalSubjectId:resolvedSubject.subjectId,
          canonicalSubjectKind:'member',
          threadId:a.threadId,clientTurnId:a.clientTurnId,
          creditReservationId:a.reservationId,
          committedTurnId:input.proof.committedTurnId,
          committedAssistantMessageId:input.proof.assistantMessageId,
        });
        if(settled.kind!=='settled'||settled.creditsCharged!==10)
          throw new SeyeonG4FirstMemoryReconciliationHoldV1();
        return Object.freeze({kind:'settled' as const,creditsCharged:10 as const});
      }
      // Never release after an ordinary network error: the DB must prove
      // the original Turn terminally failed WITHOUT commit or delivery.
      const released=await releaseFailedChatCreditsCandidateV1({
        client,canonicalSubjectId:resolvedSubject.subjectId,
        reservationId:a.reservationId,
      });
      if(released!=='released')
        throw new SeyeonG4FirstMemoryReconciliationHoldV1();
      return Object.freeze({kind:'released' as const,creditsCharged:0 as const});
    },
  });
}
