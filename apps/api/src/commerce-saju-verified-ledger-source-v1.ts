import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  quoteSajuUpgradeFromVerifiedLedgerV1,
  type SajuFieldV1,
  type SajuProductKeyV1,
  type SajuPurchaseLedgerRowV1,
  type SajuUpgradeQuoteV1,
} from './commerce-saju-upgrade-pricing-v1.js';

/**
 * STAGED candidate for a trusted internal single-snapshot transaction ONLY.
 * Requires the private candidate schema in docs/operations/candidates/
 * commerce_saju_record_verified_purchase_ledger_v1.sql.
 * Its tables are intentionally NOT deployed and no API route can invoke this.
 */
export const COMMERCE_SAJU_VERIFIED_LEDGER_SOURCE_V1 =
  'commerce-saju-private-ledger-snapshot-candidate-v1' as const;

// All prices are original verified charges, not an upgrade's nominal bundle
// price. The revision ID and intent/receipt/provenance are selected server-side.
// Unsettled provider cancellation is counted, never treated as zero refund.
export const COMMERCE_SAJU_VERIFIED_LEDGER_SQL_V1 = `
select
  o.purchase_intent_id::text as "purchaseIntentId",
  o.subject_id::text as "subjectId",
  o.saju_record_id::text as "sajuRecordId",
  o.birth_revision_id::text as "natalVersion",
  o.purchase_kind as "purchaseKind",
  pi.status as "intentStatus",
  cr.id::text as "receiptId",
  cr.subject_id::text as "receiptSubjectId",
  cr.purchase_intent_id::text as "receiptIntentId",
  cr.product_offer_id::text as "receiptOfferId",
  cr.verification_status as "receiptStatus",
  cr.environment as "receiptEnvironment",
  cr.verified_amount_minor::text as "verifiedPaidMinor",
  cr.verified_currency as "currency",
  po.id::text as "intentOfferId",
  p.product_key as "productKey",
  coalesce(refunds.refunded_minor, 0)::text as "refundedMinor",
  coalesce(parents.source_receipt_ids, array[]::text[]) as "upgradeFromReceiptIds",
  coalesce(cancellations.unsettled_count, 0)::text as "unsettledCancellationCount"
from public.commerce_saju_purchase_origins_v1 o
join public.purchase_intents pi
  on pi.id=o.purchase_intent_id and pi.subject_id=o.subject_id
join public.product_offers po on po.id=pi.product_offer_id
join public.products p on p.id=po.product_id
left join public.commerce_receipts cr
  on cr.purchase_intent_id=pi.id
left join lateral (
  select sum(r.refunded_minor) as refunded_minor
  from public.commerce_saju_verified_refund_effects_v1 r
  where r.receipt_id=cr.id and r.subject_id=o.subject_id
) refunds on true
left join lateral (
  select array_agg(l.source_receipt_id::text order by l.source_receipt_id::text)
    as source_receipt_ids
  from public.commerce_saju_upgrade_receipt_links_v1 l
  where l.child_purchase_intent_id=o.purchase_intent_id
) parents on true
left join lateral (
  select count(*) as unsettled_count
  from public.commerce_provider_events e
  where e.resolved_receipt_id=cr.id
    and e.event_type in ('Transaction.Cancelled', 'Transaction.PartialCancelled')
    and e.status in ('received','verified','processed','unresolved')
    and not exists (
      select 1 from public.commerce_saju_verified_refund_effects_v1 r
      where r.provider_event_id=e.id and r.receipt_id=cr.id
    )
) cancellations on true
where o.subject_id=$1::uuid
  and o.saju_record_id=$2::uuid
order by pi.created_at, pi.id, cr.id
`.trim();

export const COMMERCE_SAJU_VERIFIED_RECORD_SQL_V1 = `
select
  id::text as "recordId",
  subject_id::text as "subjectId",
  birth_revision_id::text as "birthRevisionId"
from public.commerce_saju_records_v1
where id=$1::uuid and subject_id=$2::uuid
`.trim();

type DbRow = Readonly<{
  purchaseIntentId: unknown;
  subjectId: unknown;
  sajuRecordId: unknown;
  natalVersion: unknown;
  purchaseKind: unknown;
  intentStatus: unknown;
  receiptId: unknown;
  receiptSubjectId: unknown;
  receiptIntentId: unknown;
  receiptOfferId: unknown;
  receiptStatus: unknown;
  receiptEnvironment: unknown;
  verifiedPaidMinor: unknown;
  currency: unknown;
  intentOfferId: unknown;
  productKey: unknown;
  refundedMinor: unknown;
  upgradeFromReceiptIds: unknown;
  unsettledCancellationCount: unknown;
}>;
type DbRecordRow = Readonly<{
  recordId: unknown;
  subjectId: unknown;
  birthRevisionId: unknown;
}>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
function uid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw Error('SAJU_LEDGER_SOURCE_ID_INVALID');
  return value.toLowerCase();
}
function amount(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+$/u.test(value)
      || !Number.isSafeInteger(Number(value))) throw Error('SAJU_LEDGER_SOURCE_AMOUNT_INVALID');
  return Number(value);
}
function hold(reason: string): never {
  throw Error(`SAJU_LEDGER_SOURCE_HOLD_${reason}`);
}

export interface SajuVerifiedLedgerOwnedFieldsProofV1 {
  readonly authority: 'record_scoped_current_effective_entitlements';
  readonly subjectId: string;
  readonly sajuRecordId: string;
  readonly natalVersion: string;
  readonly fields: readonly SajuFieldV1[];
}

/** DB rows are read by the privileged candidate owner (not API executor). */
export async function quoteSajuFromPostgresVerifiedLedgerV1(input: {
  readonly client: PostgresTransactionQueryV1;
  readonly subjectId: string;
  readonly sajuRecordId: string;
  readonly natalVersion: string;
  readonly targetProductKey: SajuProductKeyV1;
  /** Must be constructed by the same DB snapshot's future record-Grant reader. */
  readonly verifiedOwnedFields: SajuVerifiedLedgerOwnedFieldsProofV1;
}): Promise<SajuUpgradeQuoteV1> {
  const subjectId = uid(input.subjectId);
  const sajuRecordId = uid(input.sajuRecordId);
  const natalVersion = uid(input.natalVersion);
  const fields = input.verifiedOwnedFields;
  if (fields.authority !== 'record_scoped_current_effective_entitlements'
      || uid(fields.subjectId) !== subjectId
      || uid(fields.sajuRecordId) !== sajuRecordId
      || uid(fields.natalVersion) !== natalVersion
      || !Array.isArray(fields.fields)) hold('OWNED_FIELDS_UNPROVEN');

  const recordRows = (await input.client.query<DbRecordRow>(
    COMMERCE_SAJU_VERIFIED_RECORD_SQL_V1, [sajuRecordId, subjectId],
  )).rows;
  if (recordRows.length !== 1
      || uid(recordRows[0]?.recordId) !== sajuRecordId
      || uid(recordRows[0]?.subjectId) !== subjectId
      || uid(recordRows[0]?.birthRevisionId) !== natalVersion) {
    hold('RECORD_REVISION_MISMATCH');
  }

  const rawRows = (await input.client.query<DbRow>(
    COMMERCE_SAJU_VERIFIED_LEDGER_SQL_V1, [subjectId, sajuRecordId],
  )).rows;
  const transactions: SajuPurchaseLedgerRowV1[] = [];
  const pendingPurchases: { sajuRecordId: string; natalVersion: string; productKey: SajuProductKeyV1 }[] = [];
  const seenIntents = new Set<string>();
  for (const row of rawRows) {
    if (uid(row.subjectId) !== subjectId
        || uid(row.sajuRecordId) !== sajuRecordId
        || uid(row.natalVersion) !== natalVersion) hold('SOURCE_SCOPE_MISMATCH');
    const intentId = uid(row.purchaseIntentId);
    if (seenIntents.has(intentId)) hold('DUPLICATE_INTENT_OR_RECEIPT');
    seenIntents.add(intentId);
    const productKey = row.productKey as SajuProductKeyV1;
    if (row.intentStatus === 'failed' || row.intentStatus === 'cancelled') {
      // A failed Intent never freezes a Birth record or produces a credit.
      if (row.receiptId !== null) hold('FAILED_INTENT_HAS_RECEIPT');
      continue;
    }
    if (row.intentStatus === 'created' || row.intentStatus === 'pending') {
      if (row.receiptId !== null) hold('UNVERIFIED_RECEIPT');
      pendingPurchases.push({ sajuRecordId, natalVersion, productKey });
      continue;
    }
    if (row.intentStatus !== 'verified' || row.receiptId === null) {
      hold('INTENT_RECEIPT_MISMATCH');
    }
    const receiptId = uid(row.receiptId);
    if (uid(row.receiptSubjectId) !== subjectId
        || uid(row.receiptIntentId) !== intentId
        || uid(row.receiptOfferId) !== uid(row.intentOfferId)
        || row.receiptEnvironment !== 'production'
        || (row.receiptStatus !== 'verified' && row.receiptStatus !== 'revoked')
        || row.currency !== 'KRW') hold('VERIFIED_RECEIPT_PROVENANCE_MISMATCH');
    if (amount(row.unsettledCancellationCount) !== 0) hold('UNSETTLED_CANCELLATION');
    const paid = amount(row.verifiedPaidMinor);
    const refunded = amount(row.refundedMinor);
    if (paid <= 0 || refunded > paid
        || (row.receiptStatus === 'revoked' && refunded !== paid)) {
      hold('REFUND_NOT_FULLY_RECONCILED');
    }
    if (!Array.isArray(row.upgradeFromReceiptIds)) hold('UPGRADE_PARENT_INVALID');
    const parents = row.upgradeFromReceiptIds.map(uid);
    if (new Set(parents).size !== parents.length) hold('UPGRADE_PARENT_DUPLICATE');
    transactions.push({
      source: 'verified_receipt', receiptId, purchaseIntentId: intentId,
      subjectId, sajuRecordId, natalVersion, productKey,
      purchaseKind: row.purchaseKind as 'original' | 'upgrade',
      upgradeFromReceiptIds: parents, currency: 'KRW',
      verifiedPaidMinor: paid, refundedMinor: refunded,
      refundState: refunded === 0 ? 'none' : refunded === paid ? 'full' : 'partial',
    });
  }
  return quoteSajuUpgradeFromVerifiedLedgerV1({
    subjectId, sajuRecordId, natalVersion, targetProductKey: input.targetProductKey,
    ownedFields: fields.fields,
    transactions, pendingPurchases,
  });
}
