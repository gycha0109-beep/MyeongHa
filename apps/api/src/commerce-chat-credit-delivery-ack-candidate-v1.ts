import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

/**
 * Candidate-only atomic acknowledgement of the ACTUAL committed assistant reply:
 * exact Member Subject/Thread/ClientTurn/Reservation/ChatTurn/AssistantMessage,
 * original committed-at state and PostgreSQL authority. The SQL both persists
 * delivery and settles the existing 10-credit reservation in ONE transaction.
 * Requires an independently authenticated member HTTP ACK contract from Chat/UI.
 * NOT a public route, production migration, or consumer-provided billing flag.
 */
export const CHAT_CREDIT_DELIVERY_ACK_CANDIDATE_V1 = Object.freeze({
  productionMounted: false,
  deliveredReplyCredits: 10,
  actualDeliveryAcknowledgementRequired: true,
} as const);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SQL = `
select public.internal_cmd_chat_credit_ack_delivered_proven_v2(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid
) as "state"
`.trim();

function uuid(label: string, value: unknown): string {
  if (typeof value!=='string' || !UUID.test(value)) {
    throw new Error('Invalid server-verified chat credit '+label);
  }
  return value.toLowerCase();
}

export async function acknowledgeDeliveredChatCreditCandidateV1(input: Readonly<{
  client: PostgresTransactionQueryV1;
  canonicalSubjectId: string;
  canonicalSubjectKind: 'member' | 'guest';
  threadId: string;
  clientTurnId: string;
  creditReservationId: string;
  committedTurnId: string;
  committedAssistantMessageId: string;
}>): Promise<Readonly<{kind:'settled'; creditsCharged:10}>> {
  if (input.canonicalSubjectKind !== 'member') {
    throw new Error('Chat credit delivery acknowledgement requires Member');
  }
  const params=[
    uuid('Subject',input.canonicalSubjectId),
    uuid('Thread',input.threadId),
    uuid('ClientTurn',input.clientTurnId),
    uuid('reservation',input.creditReservationId),
    uuid('committed turn',input.committedTurnId),
    uuid('assistant message',input.committedAssistantMessageId),
  ] as const;
  const result=await input.client.query<{state:unknown}>(SQL,params);
  if (result.rows.length!==1 || result.rows[0]?.state!=='settled') {
    throw new Error('Chat credit delivery acknowledgement is not settled');
  }
  return Object.freeze({kind:'settled',creditsCharged:10});
}
