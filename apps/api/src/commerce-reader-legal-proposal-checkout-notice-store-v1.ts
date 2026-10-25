import type {
  PostgresSubjectExecutionScopeV1,
} from './postgres-subject-execution.js';
import type {
  CommerceReaderImmutableCheckoutNoticeStoreV1,
} from './commerce-reader-postgres-checkout-notice-authority-v1.js';

/**
 * S7 adapter for the existing Legal/Commerce 1743 PROPOSED checkout evidence
 * schema. Not registered in any Production route, Worker or payment executor.
 *
 * This is only an original-Purchase-Intent + pinned-Capability-Item evidence
 * reader. The calling Commerce Owner adapter must FIRST independently bind
 * the original S5 body -> Receipt -> Grant -> Capability Item under S1.
 *
 * The proposed legal table is NOT deployed or approved. If absent/ungranted,
 * fail closed to missing evidence/manual review; never fabricate a notice or
 * interpret an ACK, checkout view, or payment retry as lawful delivery.
 */
export const COMMERCE_READER_LEGAL_CHECKOUT_NOTICE_PROPOSAL_V1 =
  'commerce-reader-legal-checkout-notice-proposal-v1' as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ITEM = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;

/**
 * Parameterized, read-only relational contract against proposed 1743.
 * Important: legal notice.unit_id is PRE-GRANT "standard-reading:{reader}",
 * never the UUID of a subsequently minted Grant or Receipt.
 *
 * The original Receipt->Grant->Capability Item match is checked by the
 * separate 2250 + ORIGINAL_CHECKOUT_UNIT_SQL_V1 upstream gate.
 */
export const READER_LEGAL_PROPOSED_CHECKOUT_NOTICE_SQL_V1 = `
select
  purchase.id::text as "purchaseIntentId",
  item.item_key as "pinnedCapabilityItemKey",
  notice.product_spec_version as "productSpecVersion",
  notice.notice_revision as "noticeRevision",
  notice.preview_or_information_revision as "previewOrInformationRevision",
  notice.displayed_at::text as "snapshotRecordedAt",
  notice.safeguard_provided_at::text as "noticePresentedAt",
  notice.acknowledged_at::text as "acknowledgedAt"
from public.purchase_intents purchase
join public.purchase_intent_reader_selections selection
  on selection.purchase_intent_id=purchase.id
join public.product_offers offer
  on offer.id=purchase.product_offer_id
 and offer.product_id=selection.product_id
join public.standard_reading_product_specs spec
  on spec.product_id=selection.product_id
join public.product_capability_items item
  on item.capability_set_id=purchase.capability_set_id
 and item.item_key=$3::text
join public.legal_digital_reading_checkout_evidence_v1 notice
  on notice.purchase_intent_id=purchase.id
 and notice.unit_id='standard-reading:' || selection.reader_character_id
 and notice.product_spec_version=spec.spec_version
where purchase.id=$2::uuid and purchase.subject_id=$1::uuid
  and notice.product_spec_version=$4::text
  and notice.acknowledged_at is not null
  and notice.displayed_at<=notice.safeguard_provided_at
  and notice.safeguard_provided_at<=notice.acknowledged_at
  and notice.acknowledged_at IS NOT NULL
`;

type NoticeRowV1 = Readonly<{
  purchaseIntentId: unknown;
  pinnedCapabilityItemKey: unknown;
  productSpecVersion: unknown;
  noticeRevision: unknown;
  previewOrInformationRevision: unknown;
  snapshotRecordedAt: unknown;
  noticePresentedAt: unknown;
  acknowledgedAt: unknown;
}>;

function value(v: unknown): v is string {
  return typeof v === 'string' && v.trim() === v
    && v.length > 0 && v.length <= 256;
}

function instant(v: unknown): string | null {
  if (!(v instanceof Date) && typeof v !== 'string') return null;
  const parsed = new Date(v);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

/**
 * Use solely inside the same authenticated, already owner-scoped transaction
 * as reviewOfficialReaderWithdrawalFromOriginalLedgerV1. No table is created,
 * no DB role is granted, and this factory cannot turn on any public route.
 */
export function createCommerceReaderLegalProposalCheckoutNoticeStoreV1(input: Readonly<{
  scope: PostgresSubjectExecutionScopeV1;
}>): CommerceReaderImmutableCheckoutNoticeStoreV1 {
  return Object.freeze({
    async readOriginalNotice(unit) {
      try {
        const subject = input.scope?.resolvedSubject;
        const client = input.scope?.client;
        if (!client || subject?.subjectKind !== 'member'
          || !UUID.test(subject.subjectId)
          || !UUID.test(unit.purchaseIntentId)
          || !ITEM.test(unit.pinnedCapabilityItemKey)
          || !value(unit.productSpecVersion)) return null;

        const rows = (await client.query<NoticeRowV1>(
          READER_LEGAL_PROPOSED_CHECKOUT_NOTICE_SQL_V1,
          [subject.subjectId, unit.purchaseIntentId,
            unit.pinnedCapabilityItemKey, unit.productSpecVersion],
        )).rows;
        if (rows.length !== 1 || !rows[0]) return null;
        const row = rows[0];
        const snapshot = instant(row.snapshotRecordedAt);
        const presented = instant(row.noticePresentedAt);
        const acknowledged = instant(row.acknowledgedAt);
        if (row.purchaseIntentId !== unit.purchaseIntentId
          || row.pinnedCapabilityItemKey !== unit.pinnedCapabilityItemKey
          || row.productSpecVersion !== unit.productSpecVersion
          || !value(row.noticeRevision)
          || !value(row.previewOrInformationRevision)
          || snapshot === null || presented === null || acknowledged === null
          || !(snapshot <= presented && presented <= acknowledged)) {
          return null;
        }
        // This is a proposed pre-checkout fact ONLY. The upstream original
        // Receipt/Grant and FIRST payment-attempt comparison is mandatory
        // before it becomes even manual-review evidence.
        return Object.freeze({
          authority: 'checkout_owner_immutable_prepayment_record_v1' as const,
          purchaseIntentId: unit.purchaseIntentId,
          pinnedCapabilityItemKey: unit.pinnedCapabilityItemKey,
          productSpecVersion: unit.productSpecVersion,
          noticeRevision: row.noticeRevision,
          previewOrInformationRevision: row.previewOrInformationRevision,
          snapshotRecordedAt: snapshot,
          noticePresentedAt: presented,
          acknowledgedAt: acknowledged,
          acknowledged: true as const,
        });
      } catch {
        // Missing / ungranted proposed table, corruption or stale migration:
        // absence of evidence, NEVER an implied checkout acceptance.
        return null;
      }
    },
  });
}
