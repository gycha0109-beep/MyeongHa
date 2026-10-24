import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import type {
  ChatCreditAvailableBalancePortV1,
  ChatCreditAtomicReservationPortV1,
  ChatCreditAtomicReservationOutcomeV1,
} from './commerce-chat-credit-gate-v1.js';

/**
 * Private candidate adapter. Inject ONLY inside an already authenticated,
 * canonical Subject-bound DB transaction. The SQL implementation is currently
 * exclusive to test/db/candidates and NO runtime EXECUTE permission is granted.
 * In particular this never uses the Se-yeon AI call-cost ledger.
 */
export const CHAT_CREDIT_POSTGRES_CANDIDATE_FUNCTIONS_V1 = Object.freeze({
  balance: 'public.internal_qry_chat_credit_balance_v1(uuid)',
  reserve: 'public.internal_cmd_chat_credit_reserve_v1(uuid,uuid,uuid)',
  finalize: 'public.internal_cmd_chat_credit_finalize_v1(uuid,uuid,boolean,uuid)',
  productionMounted: false,
} as const);

interface BalanceRowV1 {
  readonly availableCredits: unknown;
  readonly totalCredits: unknown;
}
interface ReserveRowV1 extends BalanceRowV1 {
  readonly outcome: unknown;
  readonly reservationId: unknown;
  readonly committedTurnId: unknown;
}

const BALANCE_SQL = `
select available_credits::text as "availableCredits",
       total_credits::text as "totalCredits"
from public.internal_qry_chat_credit_balance_v1($1::uuid)
`.trim();
const RESERVE_SQL = `
select outcome, reservation_id::text as "reservationId",
       committed_turn_id::text as "committedTurnId",
       available_credits::text as "availableCredits",
       total_credits::text as "totalCredits"
from public.internal_cmd_chat_credit_reserve_v1($1::uuid,$2::uuid,$3::uuid)
`.trim();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
function safeCredits(value: unknown): number {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error('Credit DB returned invalid balance.');
  }
  const parsed=Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('Credit DB balance exceeds safe integer bounds.');
  }
  return parsed;
}
function single<Row>(rows: readonly Row[]): Row {
  if (rows.length!==1 || rows[0]===undefined) {
    throw new Error('Credit DB must return exactly one authoritative row.');
  }
  return rows[0];
}

/**
 * Bound to the transaction's verified resolved Subject, never to caller JSON.
 * POSITIVE admission from this port means reservation persisted atomically in
 * the same DB; the caller still owns delivered/released finalization.
 */
export function createPostgresChatCreditCandidatePortsV1(input: Readonly<{
  client: PostgresTransactionQueryV1;
  canonicalSubjectId: string;
}>): Readonly<{
  balance: ChatCreditAvailableBalancePortV1;
  reservation: ChatCreditAtomicReservationPortV1;
}> {
  if (!uuid(input.canonicalSubjectId)) {
    throw new Error('Canonical credit Subject is invalid.');
  }
  const subject=input.canonicalSubjectId.toLowerCase();
  function matchSubject(verifiedSubjectId: string): void {
    if (!uuid(verifiedSubjectId) || verifiedSubjectId.toLowerCase()!==subject) {
      throw new Error('Credit authority Subject mismatch.');
    }
  }
  return Object.freeze({
    balance: Object.freeze({
      async readCurrentSpendable({ verifiedSubjectId }: Parameters<ChatCreditAvailableBalancePortV1['readCurrentSpendable']>[0]) {
        matchSubject(verifiedSubjectId);
        const result=await input.client.query<BalanceRowV1>(BALANCE_SQL,[subject]);
        const row=single(result.rows);
        return {
          availableCredits:safeCredits(row.availableCredits),
          totalCredits:safeCredits(row.totalCredits),
        };
      },
    }),
    reservation: Object.freeze({
      async reserveForReply({ verifiedSubjectId,threadId,clientTurnId,requiredCredits }: Parameters<ChatCreditAtomicReservationPortV1['reserveForReply']>[0]): Promise<ChatCreditAtomicReservationOutcomeV1> {
        matchSubject(verifiedSubjectId);
        if (requiredCredits!==10 || !uuid(threadId) || !uuid(clientTurnId)) {
          throw new Error('Credit reservation scope/amount invalid.');
        }
        const result=await input.client.query<ReserveRowV1>(
          RESERVE_SQL,[subject,threadId.toLowerCase(),clientTurnId.toLowerCase()],
        );
        const row=single(result.rows);
        if (row.outcome==='insufficient') {
          return {
            kind:'insufficient',
            availableCredits:safeCredits(row.availableCredits),
            totalCredits:safeCredits(row.totalCredits),
          };
        }
        if (row.outcome==='reserved' || row.outcome==='already_reserved') {
          if (!uuid(row.reservationId)) throw new Error('Credit reservation ID missing.');
          return {kind:row.outcome,reservationId:row.reservationId};
        }
        if (row.outcome==='committed_replay') {
          if (!uuid(row.committedTurnId)) throw new Error('Credit committed replay Turn ID missing.');
          return {kind:'committed_replay',committedTurnId:row.committedTurnId};
        }
        if (row.outcome==='conflict') return {kind:'conflict'};
        throw new Error('Unknown credit reservation outcome.');
      },
    }),
  });
}
