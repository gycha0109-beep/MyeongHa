import type { PostgresSubjectPoolV1, PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  COMMERCE_SAJU_PRODUCTS_V1,
  type SajuFieldV1,
  type SajuProductKeyV1,
  type SajuUpgradeQuoteV1,
} from './commerce-saju-upgrade-pricing-v1.js';
import type { SajuVerifiedLedgerOwnedFieldsProofV1 }
  from './commerce-saju-verified-ledger-source-v1.js';
import {
  quoteSajuFromOnePrivateSnapshotV1,
  type SajuPrivateOwnedFieldSnapshotReaderV1,
} from './commerce-saju-single-snapshot-private-quote-v1.js';

/**
 * Private, read-only Record-scoped entitlement proof. No public route invokes it.
 *
 * Products define candidate field names only. A paid Product by itself NEVER
 * implies ownership: each field must be backed by the exact verified Receipt,
 * pinned Capability Item and opaque scope derived from this same Saju Record.
 * This remains quote evidence, not a public authorization or sale activation.
 */
export const SAJU_CURRENT_GRANT_FIELDS_SQL_V1 = `
select
  origin.subject_id::text as "subjectId",
  origin.saju_record_id::text as "sajuRecordId",
  origin.birth_revision_id::text as "natalVersion",
  receipt.id::text as "receiptId",
  receipt.product_offer_id::text as "receiptOfferId",
  offer.id::text as "intentOfferId",
  receipt.verification_status as "receiptStatus",
  receipt.environment as "receiptEnvironment",
  (receipt.verified_at is not null) as "receiptVerifiedAt",
  receipt.verified_amount_minor::text as "verifiedPaidMinor",
  intent.expected_amount_minor::text as "expectedPaidMinor",
  receipt.verified_currency as "currency",
  intent.expected_currency as "expectedCurrency",
  grant_row.id::text as "grantId",
  grant_row.grant_source_type as "grantSourceType",
  grant_row.grant_key as "grantKey",
  (capability.id is not null) as "capabilityBound",
  (effective.id is not null) as "effectiveCurrent",
  issuance.receipt_granted_events::text as "receiptGrantedEventCount",
  issuance.valid_receipt_granted_events::text as "validReceiptGrantedEventCount",
  issuance.provider_revocation_events::text as "providerRevocationEventCount",
  product.product_key as "productKey",
  item.item_key as "field",
  coalesce(refunds.refunded_minor,0)::text as "refundedMinor",
  coalesce(cancels.unsettled_count,0)::text as "unsettledCancellationCount"
from public.commerce_saju_purchase_origins_v1 origin
join public.commerce_saju_records_v1 record
  on record.id=origin.saju_record_id
 and record.subject_id=origin.subject_id
 and record.birth_revision_id=origin.birth_revision_id
join public.purchase_intents intent
  on intent.id=origin.purchase_intent_id
 and intent.subject_id=origin.subject_id
 and intent.status='verified'
join public.product_offers offer on offer.id=intent.product_offer_id
join public.products product on product.id=offer.product_id
left join public.product_capability_sets capability
  on capability.id=intent.capability_set_id
 and capability.id=offer.capability_set_id
 and capability.product_id=offer.product_id
 and intent.capability_snapshot_jsonb=pg_catalog.jsonb_build_object(
   'capabilitySetId',capability.id::text,
   'definitionVersion',capability.definition_version,
   'definitionHash',capability.definition_hash
 )
 and intent.capability_snapshot_hash is not null
 and intent.capability_snapshot_hash<>''
join public.commerce_receipts receipt
  on receipt.purchase_intent_id=intent.id
 and receipt.subject_id=intent.subject_id
 and receipt.product_offer_id=offer.id
join public.entitlement_grants grant_row
  on grant_row.source_receipt_id=receipt.id
 and grant_row.subject_id=receipt.subject_id
 and grant_row.status='active'
 and grant_row.valid_from<=pg_catalog.transaction_timestamp()
 and (grant_row.valid_until is null
      or grant_row.valid_until>pg_catalog.transaction_timestamp())
left join public.product_capability_items item
  on item.capability_set_id=capability.id
 and item.entitlement_key=grant_row.entitlement_key
 and item.scope_mode='saju_record'
 and item.fixed_scope_key is null
 and grant_row.scope_key =
     ('saju-record:'||record.entitlement_scope_id::text)
left join public.entitlements effective
  on effective.subject_id=grant_row.subject_id
 and effective.entitlement_key=grant_row.entitlement_key
 and effective.scope_key_norm=grant_row.scope_key_norm
 and effective.status='active'
 and effective.active_grant_count>0
 and (effective.effective_valid_until is null
      or effective.effective_valid_until>pg_catalog.transaction_timestamp())
-- A Grant row or active projection alone is NOT issuance evidence. A real
-- paid right must have exactly one 1080 receipt-issued Entitlement Event
-- attached to this original Receipt and exact Grant identity.
left join lateral (
  select
    count(*) filter (
      where event.source_type='receipt' and event.event_type='granted'
    ) as receipt_granted_events,
    count(*) filter (
      where event.source_type='receipt'
        and event.source_receipt_id=receipt.id
        and event.source_provider_event_id is null
        and event.event_type='granted'
        and event.event_schema_version='ent-event-v2'
        and event.product_id=offer.product_id
        and event.target_status='active'
    ) as valid_receipt_granted_events,
    count(*) filter (
      where event.source_type='provider_event'
        and event.event_type='revoked'
    ) as provider_revocation_events
  from public.entitlement_events event
  where event.grant_id=grant_row.id
    and event.subject_id=grant_row.subject_id
    and event.entitlement_key=grant_row.entitlement_key
    and event.scope_key_norm=grant_row.scope_key_norm
) issuance on true
left join lateral (
  select sum(effect.refunded_minor) as refunded_minor
  from public.commerce_saju_verified_refund_effects_v1 effect
  where effect.receipt_id=receipt.id and effect.subject_id=receipt.subject_id
) refunds on true
left join lateral (
  select count(*) as unsettled_count
  from public.commerce_provider_events event
  where event.resolved_receipt_id=receipt.id
    and event.event_type in ('Transaction.Cancelled','Transaction.PartialCancelled')
    and event.status in ('received','verified','processed','unresolved')
    and not exists (
      select 1
      from public.commerce_saju_verified_refund_effects_v1 settled
      where settled.provider_event_id=event.id
        and settled.receipt_id=receipt.id
    )
) cancels on true
where origin.subject_id=$1::uuid
  and origin.saju_record_id=$2::uuid
  and origin.birth_revision_id=$3::uuid
order by receipt.id,item.item_key,grant_row.id
`.trim();

type FieldEvidenceRow = Readonly<{
  subjectId: unknown; sajuRecordId: unknown; natalVersion: unknown;
  receiptId: unknown; receiptOfferId: unknown; intentOfferId: unknown;
  receiptStatus: unknown; receiptEnvironment: unknown;
  receiptVerifiedAt: unknown; verifiedPaidMinor: unknown;
  expectedPaidMinor: unknown; currency: unknown; expectedCurrency: unknown;
  grantId: unknown; grantSourceType: unknown; grantKey: unknown;
  capabilityBound: unknown; effectiveCurrent: unknown;
  receiptGrantedEventCount: unknown;
  validReceiptGrantedEventCount: unknown;
  providerRevocationEventCount: unknown;
  productKey: unknown; field: unknown; refundedMinor: unknown;
  unsettledCancellationCount: unknown;
}>;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;
const MONEY = /^(0|[1-9][0-9]*)$/u;
const ALL_PRODUCTS = new Set<string>(Object.keys(COMMERCE_SAJU_PRODUCTS_V1));

function uid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw Error('SAJU_CURRENT_GRANT_EVIDENCE_INVALID');
  }
  return value.toLowerCase();
}
function hold(): never {
  throw Error('SAJU_CURRENT_GRANT_EVIDENCE_UNPROVEN');
}

/** Same client and snapshot as the verified Receipt/refund quote reader. */
export const CURRENT_SAJU_OWNED_FIELDS_DB_READER_V1:
  SajuPrivateOwnedFieldSnapshotReaderV1 = Object.freeze({
    async readOwnedFields(input: {
      readonly client: PostgresTransactionQueryV1;
      readonly subjectId: string;
      readonly sajuRecordId: string;
      readonly natalVersion: string;
    }): Promise<SajuVerifiedLedgerOwnedFieldsProofV1> {
      const subjectId=uid(input.subjectId);
      const sajuRecordId=uid(input.sajuRecordId);
      const natalVersion=uid(input.natalVersion);
      const rows=(await input.client.query<FieldEvidenceRow>(
        SAJU_CURRENT_GRANT_FIELDS_SQL_V1,[subjectId,sajuRecordId,natalVersion],
      )).rows;
      const byGrant=new Set<string>();
      const byReceiptField=new Set<string>();
      const owned=new Set<SajuFieldV1>();
      for (const row of rows) {
        if (uid(row.subjectId)!==subjectId
            || uid(row.sajuRecordId)!==sajuRecordId
            || uid(row.natalVersion)!==natalVersion) hold();
        const receiptId=uid(row.receiptId);
        const grantId=uid(row.grantId);
        if (uid(row.receiptOfferId)!==uid(row.intentOfferId)
            || row.receiptStatus!=='verified'
            || row.receiptEnvironment!=='production'
            || row.receiptVerifiedAt!==true
            || row.currency!=='KRW' || row.expectedCurrency!=='KRW'
            || !MONEY.test(String(row.verifiedPaidMinor))
            || !MONEY.test(String(row.expectedPaidMinor))
            || row.verifiedPaidMinor!==row.expectedPaidMinor
            || row.grantSourceType!=='purchase'
            || row.grantKey!=='receipt:'+receiptId
            || row.capabilityBound!==true
            || row.effectiveCurrent!==true
            || row.receiptGrantedEventCount!=='1'
            || row.validReceiptGrantedEventCount!=='1'
            || row.providerRevocationEventCount!=='0') hold();
        if (!MONEY.test(String(row.refundedMinor))
            || !MONEY.test(String(row.unsettledCancellationCount))
            || row.refundedMinor!=='0'
            || row.unsettledCancellationCount!=='0') hold();
        if (typeof row.productKey!=='string'
            || !ALL_PRODUCTS.has(row.productKey)
            || typeof row.field!=='string') hold();
        const spec=COMMERCE_SAJU_PRODUCTS_V1[row.productKey as SajuProductKeyV1];
        if (!(spec.fields as readonly string[]).includes(row.field)) hold();
        const receiptField=receiptId+'/'+row.field;
        if (byGrant.has(grantId) || byReceiptField.has(receiptField)) hold();
        byGrant.add(grantId);
        byReceiptField.add(receiptField);
        owned.add(row.field as SajuFieldV1);
      }
      return Object.freeze({
        authority:'record_scoped_current_effective_entitlements' as const,
        subjectId,sajuRecordId,natalVersion,
        fields:Object.freeze([...owned].sort()),
      });
    },
  });

/**
 * First quote entrypoint that does not accept externally asserted ownedFields.
 * The database mapping is now Record-scoped, but no Product/Offer is seeded and
 * checkoutAuthorized remains false until a separate release decision.
 */
export async function quoteSajuWithStoredCurrentGrantsV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly subjectId: string;
  readonly sajuRecordId: string;
  readonly natalVersion: string;
  readonly targetProductKey: SajuProductKeyV1;
}): Promise<SajuUpgradeQuoteV1> {
  return quoteSajuFromOnePrivateSnapshotV1({
    ...input,ownedFieldsAuthority:CURRENT_SAJU_OWNED_FIELDS_DB_READER_V1,
  });
}
