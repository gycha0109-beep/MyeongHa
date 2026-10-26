// Watchtower-Track: commerce-payment
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';
import type {VerifiedSubjectIdentityEvidenceV1} from './subject-identity-resolver.js';
import {readOwnerAdminAccessV1} from './myeongha-owner-admin-access-v1.js';
import {reserveChatReplyCreditsV1,type ChatCreditAtomicReservationPortV1} from './commerce-chat-credit-gate-v1.js';

/** Customer credits only. All paid provider, memory and receipt guards remain mandatory. */
export async function admitOwnerAwareChatCreditsV1(input:Readonly<{
 pool:PostgresSubjectPoolV1;
 verifiedEvidence:VerifiedSubjectIdentityEvidenceV1;
 verifiedSubjectId:string;
 threadId:string;
 clientTurnId:string;
 reservationPort:ChatCreditAtomicReservationPortV1;
}>) {
 const owner=await readOwnerAdminAccessV1(input.pool,input.verifiedEvidence);
 if(owner.verifiedSubjectId!==input.verifiedSubjectId)
   throw Error('Credit admission subject identity mismatch');
 if(owner.chatCreditExempt)
   return Object.freeze({kind:'owner_admin_exempt' as const,requiredCredits:0 as const});
 return reserveChatReplyCreditsV1({
   verifiedSubjectId:input.verifiedSubjectId,
   threadId:input.threadId,
   clientTurnId:input.clientTurnId,
   port:input.reservationPort,
 });
}
