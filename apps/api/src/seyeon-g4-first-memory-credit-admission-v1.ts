// Watchtower-Track: security
// G4 candidate: private Member credit admission before any positive model call.
// No production route, credit settlement or paid activation.
import {executePostgresSubjectTransactionV1,type PostgresSubjectPoolV1} from './postgres-subject-execution.js';
import type {VerifiedSubjectIdentityEvidenceV1} from './subject-identity-resolver.js';
import {createPostgresChatCreditCandidatePortsV1} from './postgres-chat-credit-candidate-v1.js';
import {reserveChatReplyCreditsV1} from './commerce-chat-credit-gate-v1.js';

export const SEYEON_G4_FIRST_MEMORY_CREDIT_ADMISSION_V1=Object.freeze({
  productionMounted:false, requiredCredits:10,
  settlementRequiresVerifiedDelivery:true,
} as const);

export class SeyeonG4FirstMemoryCreditHoldV1 extends Error {
  readonly code='SEYEON_G4_CREDIT_ADMISSION_HOLD' as const;
  constructor(){
    super('Original first Memory reply requires verified credit admission.');
    this.name='SeyeonG4FirstMemoryCreditHoldV1';
  }
}

type OwnerRow=Readonly<{
  isOwnerAdmin:unknown; chatCreditExempt:unknown; sandboxCheckoutAllowed:unknown;
}>;

export async function admitSeyeonG4FirstMemoryCreditsV1(input:Readonly<{
  pool:PostgresSubjectPoolV1;
  verifiedEvidence:VerifiedSubjectIdentityEvidenceV1;
  threadId:string;
  clientTurnId:string;
}>):Promise<Readonly<
  | {kind:'reserved';canonicalSubjectId:string;threadId:string;clientTurnId:string;reservationId:string;requiredCredits:10}
  | {kind:'owner_admin_exempt';canonicalSubjectId:string;requiredCredits:0}
>> {
  if(input.verifiedEvidence?.kind!=='member'){
    throw new SeyeonG4FirstMemoryCreditHoldV1();
  }
  return executePostgresSubjectTransactionV1({
    pool:input.pool,verifiedEvidence:input.verifiedEvidence,
    execute:async({client,resolvedSubject})=>{
      if(resolvedSubject.subjectKind!=='member')
        throw new SeyeonG4FirstMemoryCreditHoldV1();
      const owner=await client.query<OwnerRow>(
        'select is_owner_admin as "isOwnerAdmin", chat_credit_exempt as "chatCreditExempt", sandbox_checkout_allowed as "sandboxCheckoutAllowed" from public.qry_myeongha_owner_admin_access_v1($1::uuid)',
        [resolvedSubject.subjectId],
      );
      const row=owner.rows[0];
      if(owner.rows.length!==1||!row||
          typeof row.isOwnerAdmin!=='boolean'||
          typeof row.chatCreditExempt!=='boolean'||
          typeof row.sandboxCheckoutAllowed!=='boolean'||
          ((row.chatCreditExempt||row.sandboxCheckoutAllowed)&&!row.isOwnerAdmin)){
        throw new SeyeonG4FirstMemoryCreditHoldV1();
      }
      if(row.chatCreditExempt){
        return Object.freeze({
          kind:'owner_admin_exempt' as const,
          canonicalSubjectId:resolvedSubject.subjectId,requiredCredits:0 as const,
        });
      }
      const ports=createPostgresChatCreditCandidatePortsV1({
        client,canonicalSubjectId:resolvedSubject.subjectId,
      });
      let freshReservation=false;
      const result=await reserveChatReplyCreditsV1({
        verifiedSubjectId:resolvedSubject.subjectId,
        threadId:input.threadId,clientTurnId:input.clientTurnId,
        port:{reserveForReply:async request=>{
          const outcome=await ports.reservation.reserveForReply(request);
          freshReservation=outcome.kind==='reserved';
          return outcome;
        }},
      });
      // Existing reservation means an earlier model call may still be running.
      // Do not dispatch a second paid inference merely because its credit
      // reservation is idempotent; only a FRESH reserve admits a model call.
      if(result.kind!=='reservation'||!freshReservation)
        throw new SeyeonG4FirstMemoryCreditHoldV1();
      return Object.freeze({
        kind:'reserved' as const,canonicalSubjectId:resolvedSubject.subjectId,
        threadId:input.threadId.toLowerCase(),clientTurnId:input.clientTurnId.toLowerCase(),
        reservationId:result.reservationId,requiredCredits:result.requiredCredits,
      });
    },
  });
}
