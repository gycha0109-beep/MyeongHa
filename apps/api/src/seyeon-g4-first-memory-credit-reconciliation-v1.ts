// Watchtower-Track: security
// G4 private reconciliation of ONE DB-reserved positive Memory reply.
// No HTTP route or production permission; Node socket 'finish' is not delivery ACK.
import {executePostgresSubjectTransactionV1,type PostgresSubjectPoolV1}
  from './postgres-subject-execution.js';
import type {VerifiedSubjectIdentityEvidenceV1}
  from './subject-identity-resolver.js';
import {acknowledgeDeliveredChatCreditCandidateV1}
  from './commerce-chat-credit-delivery-ack-candidate-v1.js';
import {executePostgresCommerceInternalTransactionV1}
  from './postgres-commerce-internal-execution.js';

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
  /** Dedicated internal Commerce role; never use the ordinary Member pool. */
  privateCreditPool:PostgresSubjectPoolV1;
  verifiedEvidence:VerifiedSubjectIdentityEvidenceV1;
  admission:SeyeonG4ReservedReplyV1;
  proof:SeyeonG4FinalProofV1;
}>):Promise<Readonly<{kind:'settled'|'released';creditsCharged:10|0}>> {
  const a=input.admission;
  if(input.verifiedEvidence?.kind!=='member'||
      !input.privateCreditPool||input.privateCreditPool===input.pool||
      a?.kind!=='reserved'||
      a.requiredCredits!==10||
      ![a.canonicalSubjectId,a.threadId,a.clientTurnId,a.reservationId].every(valid)||
      (input.proof?.kind!=='confirmed_delivered'&&
       input.proof?.kind!=='definitive_undelivered')||
      (input.proof.kind==='confirmed_delivered'&&
        (!valid(input.proof.committedTurnId)||!valid(input.proof.assistantMessageId)))){
    throw new SeyeonG4FirstMemoryReconciliationHoldV1();
  }
  // Resolve the verified Member under ordinary RLS but NEVER grant its
  // connection access to private settlement or wallet tables.
  const canonicalSubjectId=await executePostgresSubjectTransactionV1({
    pool:input.pool,verifiedEvidence:input.verifiedEvidence,
    execute:async({resolvedSubject})=>{
      if(resolvedSubject.subjectKind!=='member'||
          resolvedSubject.subjectId.toLowerCase()!==a.canonicalSubjectId.toLowerCase())
        throw new SeyeonG4FirstMemoryReconciliationHoldV1();
      return resolvedSubject.subjectId;
    },
  });
  return executePostgresCommerceInternalTransactionV1({
    pool:input.privateCreditPool,
    execute:async({client})=>{
      await client.query(
        "select pg_catalog.set_config('myeongha.subject_id',$1::text,true)",
        [canonicalSubjectId],
      );
      if(input.proof.kind==='confirmed_delivered'){
        const settled=await acknowledgeDeliveredChatCreditCandidateV1({
          client,canonicalSubjectId,
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
      // A private SECURITY DEFINER RPC proves original terminal failure and
      // owns the full Subject -> Reservation -> Turn -> finalize lock sequence.
      // This Commerce role never needs wallet-table SELECT or generic finalize.
      // Network disconnect and retryable failure cannot authorize a refund.
      const refund=await client.query<{state:unknown}>(
        'select public.internal_cmd_seyeon_g4_credit_refund_proven_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid) as "state"',
        [canonicalSubjectId,a.threadId,a.clientTurnId,a.reservationId],
      );
      if(refund.rows.length!==1||refund.rows[0]?.state!=='released')
        throw new SeyeonG4FirstMemoryReconciliationHoldV1();
      return Object.freeze({kind:'released' as const,creditsCharged:0 as const});
    },
  });
}
