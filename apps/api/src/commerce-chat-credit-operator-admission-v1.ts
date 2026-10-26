import {
  reserveChatReplyCreditsV1,
  type ChatCreditAtomicReservationPortV1,
  type ChatCreditGateResultV1,
} from './commerce-chat-credit-gate-v1.js';
import {
  readOperatorChatCapabilityV1,
} from './commerce-operator-chat-capability-v1.js';
import type {PostgresTransactionQueryV1} from './postgres-subject-execution.js';

export type MemberChatAdmissionV1 =
  | Readonly<{kind:'operator_free'; creditsReserved:0}>
  | ChatCreditGateResultV1;

/** Invoke only after authoritative Member identity and ownership checks,
 * before ANY chargeable model dispatch. The operator capability is obtained
 * from PostgreSQL under the same canonical Subject transaction; a client
 * supplied email, role, claim or SDK receipt can never override the result.
 */
export async function reserveChatCreditsOrOperatorV1(input:Readonly<{
  client:PostgresTransactionQueryV1;
  verifiedSubjectId:string;
  verifiedSubjectKind:'member';
  threadId:string;
  clientTurnId:string;
  port:ChatCreditAtomicReservationPortV1;
}>):Promise<MemberChatAdmissionV1> {
  const capability=await readOperatorChatCapabilityV1(
    input.client,input.verifiedSubjectId);
  if(capability.freeChat) {
    return Object.freeze({kind:'operator_free',creditsReserved:0});
  }
  return reserveChatReplyCreditsV1({
    verifiedSubjectId:input.verifiedSubjectId,
    threadId:input.threadId,
    clientTurnId:input.clientTurnId,
    port:input.port,
  });
}
