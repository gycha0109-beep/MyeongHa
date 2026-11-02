import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * Commerce credit payout eligibility ONLY, never an authority to create a
 * spendable Credit Lot. A saleable credit Offer/Product must first be admitted
 * by Product/Capability governance and the verified payment must be persisted
 * by the existing PortOne V2 server lookup/write path.
 *
 * The credit SKU exists in the canonical catalog, but its Product and Offer
 * remain disabled; this candidate does not activate them. Eligibility must
 * mirror the exact receipt/Intent/Capability predicates in the private mint RPC.
 */
export const CREDIT_TOPUP_RECEIPT_ELIGIBILITY_V1 = Object.freeze({
  schemaVersion: 'commerce-credit-verified-receipt-eligibility-v1',
  expectedProductKey: 'chat_credits_300_v1',
  expectedProductType: 'credit',
  verifiedProvider: 'portone_v2',
  verifiedPlatform: 'web',
  verifiedCurrency: 'KRW',
  verifiedAmountMinor: 1900,
  creditQuantity: 300,
  livePayoutMounted: false,
} as const);

const VERIFIED_RECEIPT_SQL = `
select cr.id::text as "receiptId"
from public.commerce_receipts cr
join public.purchase_intents pi
  on pi.id = cr.purchase_intent_id
  and pi.subject_id = cr.subject_id
  and pi.product_offer_id = cr.product_offer_id
join public.product_offers po
  on po.id = cr.product_offer_id
join public.products p
  on p.id = po.product_id
join public.product_capability_sets pcs
  on pcs.id = pi.capability_set_id
  and pcs.product_id = p.id
where cr.id = $1::uuid
  and cr.subject_id = $2::uuid
  and cr.product_offer_id = pi.product_offer_id
  and po.id = $3::uuid
  and cr.provider = 'portone_v2'
  and cr.platform = 'web'
  and cr.environment = 'production'
  and cr.verification_status = 'verified'
  and cr.verified_at is not null
  and cr.verified_amount_minor = 1900
  and cr.verified_currency = 'KRW'
  and cr.external_transaction_id <> ''
  and cr.receipt_fingerprint <> ''
  and pi.status = 'verified'
  and pi.expected_amount_minor = 1900
  and pi.expected_currency = 'KRW'
  and pi.capability_snapshot_hash is not null
  and pi.capability_snapshot_jsonb = pg_catalog.jsonb_build_object(
    'capabilitySetId', pcs.id::text,
    'definitionVersion', pcs.definition_version,
    'definitionHash', pcs.definition_hash
  )
  and po.provider = 'portone_v2'
  and po.platform = 'web'
  and po.enabled
  and po.retired_at is null
  and po.currency = 'KRW'
  and po.display_price_minor = 1900
  and p.enabled
  and p.retired_at is null
  and p.product_key = 'chat_credits_300_v1'
  and p.product_type = 'credit'
`.trim();

function canonicalUuid(label: string, input: unknown): string {
  if (typeof input !== 'string' || !UUID.test(input)) {
    throw new Error('Invalid server-controlled ' + label);
  }
  return input.toLowerCase();
}

export type VerifiedCreditTopUpEligibilityV1 =
  | Readonly<{ kind: 'eligible'; receiptId: string; creditQuantity: 300 }>
  | Readonly<{ kind: 'not_activated' }>
  | Readonly<{ kind: 'denied' }>;

/**
 * Never accept ProductOfferId from the customer: it must be injected by an
 * authorized server-side Commerce Product/Capability catalog binding.
 * The DB transaction must already have verified and bound canonical Subject.
 * A payout caller must separately use a UNIQUE(receipt_id) ledger mutation.
 */
export async function evaluateVerifiedCreditTopUpReceiptV1(input: Readonly<{
  client: PostgresTransactionQueryV1;
  canonicalSubjectId: string;
  verifiedReceiptId: string;
  approvedCreditProductOfferId: string | null;
}>): Promise<VerifiedCreditTopUpEligibilityV1> {
  const subjectId=canonicalUuid('Subject',input.canonicalSubjectId);
  const receiptId=canonicalUuid('verified Receipt',input.verifiedReceiptId);
  // No approved saleable SKU exists yet. Do not query or mint.
  if (input.approvedCreditProductOfferId===null) {
    return Object.freeze({kind:'not_activated'});
  }
  const offerId=canonicalUuid('approved Credit Product Offer',input.approvedCreditProductOfferId);
  const result=await input.client.query<{receiptId:unknown}>(VERIFIED_RECEIPT_SQL,[
    receiptId,subjectId,offerId,
  ]);
  if (result.rows.length===0) return Object.freeze({kind:'denied'});
  if (result.rows.length!==1 ||
      typeof result.rows[0]?.receiptId!=='string' ||
      result.rows[0].receiptId.toLowerCase()!==receiptId) {
    throw new Error('Commerce verified credit receipt authority returned invalid rows');
  }
  return Object.freeze({kind:'eligible',receiptId,creditQuantity:300});
}
