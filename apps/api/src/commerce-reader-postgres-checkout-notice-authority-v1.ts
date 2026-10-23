import type {
  PostgresSubjectExecutionScopeV1,
} from './postgres-subject-execution.js';
import {
  reviewOfficialReaderPrivateWithdrawalEvidenceV1,
  type CommerceReaderPrivateWithdrawalEvidenceV1,
  type CommerceReaderCheckoutNoticeAuthorityPortV1,
} from './commerce-reader-private-withdrawal-evidence-v1.js';
import {
  linkOriginalCheckoutNoticeToReaderGrantV1,
  type CommerceReaderOriginalCheckoutNoticeRecordV1,
} from './commerce-reader-checkout-notice-proof-v1.js';

/**
 * Private read-only bridge across the EXISTING Commerce ledger.
 *
 * The 2250 S7 query is the authorization gate: it acquires the S1 Reader
 * scope lock, verifies the original Receipt/Grant/body and, if revoked,
 * requires the independently verified provider cancellation. The following
 * joins then find the one immutable prepayment Capability Item belonging to
 * that original Grant. A later sibling Receipt/Grant cannot satisfy it.
 *
 * This query creates no checkout acknowledgement and has no SELECT on a
 * proposed or unapproved new notice table. The Checkout Owner must supply an
 * independently durable/approved original notice store to obtain any proof.
 */
/** Private SQL exported only to exercise exact relational joins on a disposable PostgreSQL ledger. */
export const ORIGINAL_CHECKOUT_UNIT_SQL_V1 = `
with authorized_original as materialized (
  select evidence.purchase_intent_id, evidence.unit_id, evidence.s5_committed_at
  from public.internal_qry_official_reader_withdrawal_delivery_state_v2(
    $1::uuid,$2::uuid,$3::uuid,$4::uuid
  ) evidence
)
select
  intent.id::text as "purchaseIntentId",
  grant_row.id::text as "originatingGrantId",
  capability_item.item_key as "pinnedCapabilityItemKey",
  first_attempt.created_at::text as "originalPaymentAttemptCreatedAt",
  intent.created_at::text as "originalPurchaseIntentCreatedAt",
  original.s5_committed_at::text as "s5CommittedAt"
from authorized_original original
join public.entitlement_grants grant_row
  on grant_row.id=original.unit_id
 and grant_row.id=$3::uuid
 and grant_row.subject_id=$1::uuid
 and grant_row.grant_source_type='purchase'
join public.commerce_receipts receipt
  on receipt.id=grant_row.source_receipt_id
 and receipt.subject_id=grant_row.subject_id
 and receipt.purchase_intent_id=original.purchase_intent_id
 and receipt.environment='production'
join public.purchase_intents intent
  on intent.id=original.purchase_intent_id
 and intent.id=$2::uuid
 and intent.subject_id=grant_row.subject_id
 and intent.product_offer_id=receipt.product_offer_id
join public.product_offers offer
  on offer.id=intent.product_offer_id
join public.product_capability_sets pinned_set
  on pinned_set.id=intent.capability_set_id
 and pinned_set.product_id=offer.product_id
join public.product_capability_items capability_item
  on capability_item.capability_set_id=pinned_set.id
 and capability_item.entitlement_key=grant_row.entitlement_key
 and coalesce(capability_item.fixed_scope_key,'__GLOBAL__')=grant_row.scope_key_norm
join public.commerce_payment_attempts first_attempt
  on first_attempt.purchase_intent_id=intent.id
 and first_attempt.subject_id=intent.subject_id
 and first_attempt.attempt_no=1
 and first_attempt.provider=receipt.provider
 and first_attempt.environment=receipt.environment
where intent.capability_snapshot_jsonb=pg_catalog.jsonb_build_object(
  'capabilitySetId',pinned_set.id::text,
  'definitionVersion',pinned_set.definition_version,
  'definitionHash',pinned_set.definition_hash
)
and grant_row.grant_key='receipt:' || receipt.id::text
and (select count(*) from public.product_capability_items all_items
  where all_items.capability_set_id=pinned_set.id
    and all_items.entitlement_key=grant_row.entitlement_key
    and coalesce(all_items.fixed_scope_key,'__GLOBAL__')=grant_row.scope_key_norm
)=1
and intent.created_at<=first_attempt.created_at
`;

type LineageRow = Readonly<{
  purchaseIntentId: unknown;
  originatingGrantId: unknown;
  pinnedCapabilityItemKey: unknown;
  originalPaymentAttemptCreatedAt: unknown;
  originalPurchaseIntentCreatedAt: unknown;
  s5CommittedAt: unknown;
}>;

type OriginalNoticeRecord = Readonly<{
  authority: 'checkout_owner_immutable_prepayment_record_v1';
  purchaseIntentId: string;
  pinnedCapabilityItemKey: string;
  productSpecVersion: string;
  noticeRevision: string;
  previewOrInformationRevision: string;
  snapshotRecordedAt: string;
  noticePresentedAt: string;
  acknowledgedAt: string;
  acknowledged: true;
}>;

/**
 * The real Checkout Owner implementation, subject to Commerce/Privacy/Legal
 * approval, must perform an exact server-side read of its immutable notice
 * snapshot. There is deliberately no default store or browser fallback.
 * Both record identity and revision/timestamp fields must be independently
 * persisted. Returning an arbitrary object does not establish authority.
 */
export interface CommerceReaderImmutableCheckoutNoticeStoreV1 {
  readOriginalNotice(input: Readonly<{
    purchaseIntentId: string;
    pinnedCapabilityItemKey: string;
    productSpecVersion: string;
  }>): Promise<OriginalNoticeRecord | null>;
}

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function item(value: unknown): value is string {
  return typeof value==='string' && value.trim()===value &&
    value.length>0 && value.length<=256;
}
function iso(value: unknown): string | null {
  if (typeof value!=='string' || !Number.isFinite(Date.parse(value))) return null;
  const isoValue=new Date(value).toISOString();
  return isoValue;
}
function noticeIsExact(
  value: unknown, purchaseIntentId: string, pinnedCapabilityItemKey: string,
  productSpecVersion: string,
): value is OriginalNoticeRecord {
  if (value===null || typeof value!=='object' || Array.isArray(value)) return false;
  const record=value as Record<string,unknown>;
  return record.authority==='checkout_owner_immutable_prepayment_record_v1' &&
    record.acknowledged===true &&
    record.purchaseIntentId===purchaseIntentId &&
    record.pinnedCapabilityItemKey===pinnedCapabilityItemKey &&
    record.productSpecVersion===productSpecVersion &&
    item(record.noticeRevision) && item(record.previewOrInformationRevision) &&
    iso(record.snapshotRecordedAt)!==null &&
    iso(record.noticePresentedAt)!==null &&
    iso(record.acknowledgedAt)!==null;
}

/**
 * Only a private, member-scoped, READ COMMITTED transaction may call this.
 * Missing store, missing original journal evidence, ambiguous Capability
 * Item, absent first payment attempt or mismatched source -> null.
 *
 * No payment/Refund/Grant mutation, public API, production notice store,
 * checkout page or authorization to deliver protected Reader content.
 */
export function createCommerceReaderPostgresCheckoutNoticeAuthorityV1(input: Readonly<{
  scope: PostgresSubjectExecutionScopeV1;
  bodyId: string;
  readonly immutableCheckoutNoticeStore?: CommerceReaderImmutableCheckoutNoticeStoreV1;
}>): CommerceReaderCheckoutNoticeAuthorityPortV1 {
  return Object.freeze({
    async readExactServerCheckoutNotice(
      unit: Parameters<CommerceReaderCheckoutNoticeAuthorityPortV1['readExactServerCheckoutNotice']>[0],
    ): Promise<CommerceReaderOriginalCheckoutNoticeRecordV1 | null> {
      try {
        const store=input.immutableCheckoutNoticeStore;
        const subject=input.scope?.resolvedSubject;
        if (!store?.readOriginalNotice || !input.scope?.client ||
            subject?.subjectKind!=='member' ||
            !UUID.test(subject.subjectId) || !UUID.test(input.bodyId) ||
            !UUID.test(unit.purchaseIntentId) || !UUID.test(unit.unitId) ||
            !item(unit.productSpecVersion)) return null;

        const rows=(await input.scope.client.query<LineageRow>(
          ORIGINAL_CHECKOUT_UNIT_SQL_V1,
          [subject.subjectId,unit.purchaseIntentId,unit.unitId,input.bodyId],
        )).rows;
        if (rows.length!==1 || !rows[0]) return null;
        const row=rows[0];
        if (row.purchaseIntentId!==unit.purchaseIntentId ||
            row.originatingGrantId!==unit.unitId ||
            !item(row.pinnedCapabilityItemKey)) return null;
        const paymentAt=iso(row.originalPaymentAttemptCreatedAt);
        const intentAt=iso(row.originalPurchaseIntentCreatedAt);
        const committedAt=iso(row.s5CommittedAt);
        if (paymentAt===null || intentAt===null || committedAt===null) return null;

        const pinnedCapabilityItemKey=row.pinnedCapabilityItemKey;
        const original=await store.readOriginalNotice({
          purchaseIntentId:unit.purchaseIntentId,
          pinnedCapabilityItemKey,
          productSpecVersion:unit.productSpecVersion,
        });
        if (!noticeIsExact(original,unit.purchaseIntentId,
          pinnedCapabilityItemKey,unit.productSpecVersion)) return null;

        const resolved: CommerceReaderOriginalCheckoutNoticeRecordV1 = Object.freeze({
          authority:'commerce_owner_immutable_checkout_notice_v1',
          purchaseIntentId:unit.purchaseIntentId,
          originatingGrantId:unit.unitId,
          productSpecVersion:unit.productSpecVersion,
          pinnedCapabilityItemKey,
          originalGrantItemBinding:'original_receipt_purchase_intent_capability_item',
          noticeRevision:original.noticeRevision,
          previewOrInformationRevision:original.previewOrInformationRevision,
          snapshotRecordedAt:original.snapshotRecordedAt,
          noticePresentedAt:original.noticePresentedAt,
          acknowledgedAt:original.acknowledgedAt,
          originalPaymentAttemptCreatedAt:paymentAt,
          originalPurchaseIntentCreatedAt:intentAt,
        });
        // The ledger adapter is itself an authority boundary. Never return an
        // apparently attested notice if its recorded consent followed payment
        // or the protected answer committed before the payment attempt.
        const proof=linkOriginalCheckoutNoticeToReaderGrantV1({
          record:resolved,unit,s5CommittedAt:committedAt,
        });
        return proof.notice===null ? null : resolved;
      } catch {
        // Do not expose Commerce tables, Receipt IDs, provider or Notice state.
        return null;
      }
    },
  });
}

/**
 * S7 single-transaction Commerce/Reader handoff: the original Receipt/Grant
 * evidence and the precheckout item lineage MUST be evaluated using exactly
 * the same previously authenticated, member-scoped READ COMMITTED client.
 * Never resolve Subject, Grant or S5 body from the consumer refund claim.
 *
 * An absent/unapproved immutable Checkout Owner store remains a manual-only
 * "missing_or_unverifiable" notice, not a fabricated affirmative consent.
 * This interface neither grants execute rights nor exposes an HTTP route.
 */
export async function reviewOfficialReaderWithdrawalFromOriginalLedgerV1(input: Readonly<{
  scope: PostgresSubjectExecutionScopeV1;
  purchaseIntentId: string;
  originatingGrantId: string;
  bodyId: string;
  claim: unknown;
  immutableCheckoutNoticeStore?: CommerceReaderImmutableCheckoutNoticeStoreV1;
}>): Promise<CommerceReaderPrivateWithdrawalEvidenceV1> {
  const authority = createCommerceReaderPostgresCheckoutNoticeAuthorityV1({
    scope: input.scope,
    bodyId: input.bodyId,
    ...(input.immutableCheckoutNoticeStore === undefined
      ? {} : { immutableCheckoutNoticeStore: input.immutableCheckoutNoticeStore }),
  });
  return reviewOfficialReaderPrivateWithdrawalEvidenceV1({
    scope: input.scope,
    purchaseIntentId: input.purchaseIntentId,
    originatingGrantId: input.originatingGrantId,
    bodyId: input.bodyId,
    claim: input.claim,
    checkoutNoticeAuthority: authority,
  });
}
