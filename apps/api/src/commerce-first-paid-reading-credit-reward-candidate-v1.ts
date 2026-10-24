import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export const FIRST_PAID_READING_CREDIT_REWARD_CANDIDATE_V1 = Object.freeze({
  bonusCredits: 150,
  expiresAfterDays: 90,
  productionMounted: false,
} as const);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SQL = `
select lot_id::text as "lotId", outcome,
       available_credits::text as "availableCredits",
       total_credits::text as "totalCredits"
from public.internal_cmd_chat_first_paid_reading_reward_v1(
  $1::uuid,$2::uuid,$3::uuid
)
`.trim();

function uuid(label: string, value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new Error('Invalid Reading reward '+label);
  }
  return value.toLowerCase();
}
function integer(label: string,value: unknown): number {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error('Invalid Reading reward '+label);
  }
  const n=Number(value);
  if (!Number.isSafeInteger(n)) throw new Error('Reading reward balance overflow');
  return n;
}

export type ReadingCreditRewardCandidateResultV1 =
  | Readonly<{kind:'not_activated'}>
  | Readonly<{
      kind:'issued' | 'already_awarded';
      lotId: string;
      creditQuantity: 150;
      availableCredits: number;
      totalCredits: number;
    }>;

/**
 * Candidate only: purchase eligibility is the approved SERVER Offer, not the
 * front-end's choice, and must refer to an already persisted verified Receipt.
 * SQL independently checks Provider/Amount/Reading Capability/Owner under lock.
 * The first successfully qualified Receipt awards once per owner; later receipts
 * return already_awarded without creating any second 150-credit lot.
 */
export async function fulfillFirstPaidReadingCreditRewardCandidateV1(input: Readonly<{
  client: PostgresTransactionQueryV1;
  canonicalSubjectId: string;
  verifiedReadingReceiptId: string;
  approvedEligibleReadingOfferId: string | null;
}>): Promise<ReadingCreditRewardCandidateResultV1> {
  if (input.approvedEligibleReadingOfferId === null) return Object.freeze({kind:'not_activated'});
  const subjectId=uuid('Subject',input.canonicalSubjectId);
  const receiptId=uuid('Receipt',input.verifiedReadingReceiptId);
  const offerId=uuid('approved Offer',input.approvedEligibleReadingOfferId);
  const rows=await input.client.query<{
    lotId:unknown; outcome:unknown; availableCredits:unknown; totalCredits:unknown;
  }>(SQL,[subjectId,receiptId,offerId]);
  const row=rows.rows[0];
  if(rows.rows.length!==1 || !row ||
     (row.outcome!=='issued' && row.outcome!=='already_awarded')) {
    throw new Error('First Reading reward authority returned invalid outcome');
  }
  const lotId=uuid('lot',row.lotId);
  const availableCredits=integer('available',row.availableCredits);
  const totalCredits=integer('total',row.totalCredits);
  if(availableCredits>totalCredits) {
    throw new Error('Reading reward available balance exceeds total');
  }
  return Object.freeze({
    kind:row.outcome,lotId,creditQuantity:150,
    availableCredits,totalCredits,
  });
}
