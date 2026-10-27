import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  evaluateVerifiedCreditTopUpReceiptV1,
} from './commerce-credit-verified-receipt-eligibility-v1.js';

/**
 * Private candidate, not mounted on Production: the approved credit SKU,
 * expiry policy, refund rules, DB grants and payment channel remain HOLD.
 * Must run INSIDE a trusted Commerce transaction on the SAME DB connection
 * as receipt eligibility; the SQL RPC independently revalidates the receipt.
 */
export const VERIFIED_CREDIT_TOPUP_FULFILLMENT_CANDIDATE_V1 = Object.freeze({
  schemaVersion: 'verified-credit-topup-fulfillment-candidate-v1',
  databaseFunction: 'public.internal_cmd_chat_credit_verified_topup_v1',
  creditsPerReceipt: 300,
  productionMounted: false,
} as const);

export type ApprovedPaidCreditValidityV1 = Readonly<{ kind: 'never' }>;

export type VerifiedCreditTopUpFulfillmentResultV1 =
  | Readonly<{ kind: 'not_activated' }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{
      kind: 'issued' | 'replayed';
      receiptId: string;
      lotId: string;
      creditQuantity: 300;
      availableCredits: number;
      totalCredits: number;
    }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FULFILL_SQL = `
select lot_id::text as "lotId", issued,
       available_credits::text as "availableCredits",
       total_credits::text as "totalCredits"
from public.internal_cmd_chat_credit_verified_topup_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::text,$5::integer
)
`.trim();

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
function credits(value: unknown): number {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error('Paid credit fulfillment returned invalid balance.');
  }
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error('Paid credit balance overflow.');
  return n;
}
function validityParameters(policy: ApprovedPaidCreditValidityV1): readonly [string, number | null] {
  if (policy?.kind === 'never') return ['never', null] as const;
  throw new Error('Paid credit validity policy is not approved.');
}

/** Never pass browser Product/Subject/policy values into this boundary. */
export async function fulfillVerifiedCreditTopUpCandidateV1(input: Readonly<{
  client: PostgresTransactionQueryV1;
  canonicalSubjectId: string;
  verifiedReceiptId: string;
  approvedCreditProductOfferId: string | null;
  approvedPaidCreditValidity: ApprovedPaidCreditValidityV1 | null;
}>): Promise<VerifiedCreditTopUpFulfillmentResultV1> {
  if (input.approvedCreditProductOfferId === null ||
      input.approvedPaidCreditValidity === null) {
    return Object.freeze({kind:'not_activated'});
  }
  const [validityMode, validityDays] = validityParameters(input.approvedPaidCreditValidity);
  const eligibility = await evaluateVerifiedCreditTopUpReceiptV1({
    client: input.client,
    canonicalSubjectId: input.canonicalSubjectId,
    verifiedReceiptId: input.verifiedReceiptId,
    approvedCreditProductOfferId: input.approvedCreditProductOfferId,
  });
  if (eligibility.kind !== 'eligible') return Object.freeze({kind: eligibility.kind});

  const result = await input.client.query<{
    lotId: unknown;
    issued: unknown;
    availableCredits: unknown;
    totalCredits: unknown;
  }>(FULFILL_SQL, [
    input.canonicalSubjectId.toLowerCase(),
    eligibility.receiptId,
    input.approvedCreditProductOfferId.toLowerCase(),
    validityMode,
    validityDays,
  ]);
  const row = result.rows[0];
  if (result.rows.length !== 1 || !row || !validUuid(row.lotId) ||
      typeof row.issued !== 'boolean') {
    throw new Error('Paid credit issuance returned invalid authoritative row.');
  }
  const availableCredits = credits(row.availableCredits);
  const totalCredits = credits(row.totalCredits);
  if (availableCredits > totalCredits) {
    throw new Error('Paid credit issuance returned inconsistent balance.');
  }
  return Object.freeze({
    kind: row.issued ? 'issued' : 'replayed',
    receiptId: eligibility.receiptId,
    lotId: row.lotId.toLowerCase(),
    creditQuantity: 300,
    availableCredits,
    totalCredits,
  });
}
