import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  readChatCreditAvailabilityV1,
  reserveChatReplyCreditsV1,
  createChatCreditInsufficientResponseV1,
} from './commerce-chat-credit-gate-v1.js';
import { createPostgresChatCreditCandidatePortsV1 } from './postgres-chat-credit-candidate-v1.js';

export const CHAT_CREDIT_LEDGER_EXECUTION_CANDIDATE_V1 = Object.freeze({
  signupCreditQuantity: 50,
  signupValidityDays: 30,
  deliveredReplyCharge: 10,
  productionMounted: false,
} as const);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function uuid(label: string, value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new Error('Invalid canonical credit ' + label);
  }
  return value.toLowerCase();
}

const SIGNUP_SQL = `
select public.internal_cmd_chat_signup_credit_v1($1::uuid)::text as "lotId"
`.trim();

const DELIVERED_PROOF_SQL = `
select ct.id::text as "turnId"
from public.chat_credit_turn_reservations_v1 r
join public.chat_turns ct on ct.subject_id=r.subject_id
  and ct.thread_id=r.thread_id
  and ct.client_turn_id=r.client_turn_id::text
where r.id=$2::uuid and r.subject_id=$1::uuid
  and ct.id=$3::uuid
  and ct.state='delivered' and ct.delivered_at is not null
for share of ct
`.trim();

const FAILED_PROOF_SQL = `
select r.id::text as "reservationId"
from public.chat_credit_turn_reservations_v1 r
join public.chat_turns ct on ct.subject_id=r.subject_id
  and ct.thread_id=r.thread_id
  and ct.client_turn_id=r.client_turn_id::text
where r.id=$2::uuid and r.subject_id=$1::uuid
  and ct.state in ('failed_retryable','failed_final','abandoned')
  and ct.delivered_at is null and ct.committed_at is null
for share of ct
`.trim();

const FINALIZE_SQL = `
select public.internal_cmd_chat_credit_finalize_v1(
  $1::uuid,$2::uuid,$3::boolean,$4::uuid
) as "state"
`.trim();

/** Trusted, already resolved Member Subject. DB revalidates active Member and deduplicates signup. */
export async function issueMemberSignupCreditsCandidateV1(input: Readonly<{
  client: PostgresTransactionQueryV1;
  canonicalSubjectId: string;
  canonicalSubjectKind: 'member' | 'guest';
}>): Promise<Readonly<{lotId: string; availableCredits: number; totalCredits: number}>> {
  if (input.canonicalSubjectKind !== 'member') throw new Error('Signup credits require an active Member');
  const subjectId = uuid('Subject', input.canonicalSubjectId);
  const issued = await input.client.query<{lotId: unknown}>(SIGNUP_SQL, [subjectId]);
  const lotId = issued.rows[0]?.lotId;
  if (issued.rows.length !== 1) throw new Error('Signup credit source returned invalid rows');
  const resultId = uuid('signup lot', lotId);
  const { balance } = createPostgresChatCreditCandidatePortsV1({
    client: input.client, canonicalSubjectId: subjectId,
  });
  const availability = await readChatCreditAvailabilityV1({
    verifiedSubjectId: subjectId, balancePort: balance,
  });
  return Object.freeze({
    lotId: resultId, availableCredits: availability.availableCredits,
    totalCredits: availability.totalCredits,
  });
}

/** Use the existing atomic Subject/Thread/ClientTurn reservation authority. */
export async function reserveMemberChatCreditsCandidateV1(input: Readonly<{
  client: PostgresTransactionQueryV1;
  canonicalSubjectId: string;
  canonicalSubjectKind: 'member' | 'guest';
  threadId: string;
  clientTurnId: string;
  requestId: string;
}>): Promise<Readonly<{
  outcome: 'reserved' | 'committed_replay' | 'conflict';
  reservationId?: string;
  committedTurnId?: string;
}> | Response> {
  if (input.canonicalSubjectKind !== 'member') throw new Error('Paid Chat requires an active Member');
  const subjectId = uuid('Subject', input.canonicalSubjectId);
  const ports = createPostgresChatCreditCandidatePortsV1({
    client: input.client, canonicalSubjectId: subjectId,
  });
  const result = await reserveChatReplyCreditsV1({
    verifiedSubjectId: subjectId,
    threadId: input.threadId,
    clientTurnId: input.clientTurnId,
    port: ports.reservation,
  });
  if (result.kind === 'insufficient') {
    return createChatCreditInsufficientResponseV1({
      requestId: input.requestId,
      threadId: input.threadId,
      clientTurnId: input.clientTurnId,
      availableCredits: result.availableCredits,
      totalCredits: result.totalCredits,
    });
  }
  if (result.kind === 'reservation') return Object.freeze({
    outcome: 'reserved' as const, reservationId: result.reservationId,
  });
  if (result.kind === 'committed_replay') return Object.freeze({
    outcome: 'committed_replay' as const, committedTurnId: result.committedTurnId,
  });
  return Object.freeze({outcome: 'conflict' as const});
}

/**
 * Do not let a caller-supplied "delivered" boolean alone charge the wallet.
 * Verify the matching owned ChatTurn's authoritative delivered marker and
 * exact committed ID under a DB row lock before finalizing in this transaction.
 * The existing chat path currently commits before HTTP delivery, so this is
 * intentionally unmounted until the actual delivery acknowledgement is owned.
 */
export async function settleDeliveredChatCreditsCandidateV1(input: Readonly<{
  client: PostgresTransactionQueryV1;
  canonicalSubjectId: string;
  reservationId: string;
  deliveredTurnId: string;
}>): Promise<'settled'> {
  const subjectId = uuid('Subject', input.canonicalSubjectId);
  const reservationId = uuid('reservation', input.reservationId);
  const turnId = uuid('delivered turn', input.deliveredTurnId);
  const proof = await input.client.query<{turnId: unknown}>(DELIVERED_PROOF_SQL, [
    subjectId, reservationId, turnId,
  ]);
  if (proof.rows.length !== 1 || proof.rows[0]?.turnId !== turnId) {
    throw new Error('Matching persisted ChatTurn delivery proof is required');
  }
  const finalized = await input.client.query<{state: unknown}>(FINALIZE_SQL, [
    subjectId, reservationId, true, turnId,
  ]);
  if (finalized.rows.length !== 1 || finalized.rows[0]?.state !== 'settled') {
    throw new Error('Chat delivery credit settlement was not authoritative');
  }
  return 'settled';
}

/** Release only after DB proves that this request has definitively not delivered. */
export async function releaseFailedChatCreditsCandidateV1(input: Readonly<{
  client: PostgresTransactionQueryV1;
  canonicalSubjectId: string;
  reservationId: string;
}>): Promise<'released'> {
  const subjectId = uuid('Subject', input.canonicalSubjectId);
  const reservationId = uuid('reservation', input.reservationId);
  const proof = await input.client.query<{reservationId: unknown}>(FAILED_PROOF_SQL, [
    subjectId, reservationId,
  ]);
  if (proof.rows.length !== 1 || proof.rows[0]?.reservationId !== reservationId) {
    throw new Error('Matching definitive ChatTurn non-delivery proof is required');
  }
  const finalized = await input.client.query<{state: unknown}>(FINALIZE_SQL, [
    subjectId, reservationId, false, null,
  ]);
  if (finalized.rows.length !== 1 || finalized.rows[0]?.state !== 'released') {
    throw new Error('Chat failure credit release was not authoritative');
  }
  return 'released';
}
