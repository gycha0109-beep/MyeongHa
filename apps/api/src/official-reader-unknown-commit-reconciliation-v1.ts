import type { PrivateOfficialReaderRecoveryTransactionPortV1 } from './official-reader-private-replay-recovery-v1.js';

const RECEIPT_UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;
const BIND_VERSION = 'standard-reading-access-bind-v2';
const HASH = /^sha256:v1:[0-9a-f]{64}$/u;

/**
 * One read-only snapshot per invocation. All outcomes remain HOLD: an absent
 * visible Grant after a lost COMMIT acknowledgement is NOT permission to retry.
 */
const UNKNOWN_COMMIT_READ_SQL = `select
 cr.id::text as "receiptId",
 cr.subject_id::text as "subjectId",
 cr.purchase_intent_id::text as "intentId",
 pci.item_key as "itemKey",
 eg.id::text as "grantId",
 eg.status as "grantStatus",
 (eg.status='active' and eg.valid_from<=transaction_timestamp()
  and (eg.valid_until is null or eg.valid_until>transaction_timestamp()))
  as "grantActiveAtDb",
 eg.valid_from::text as "grantValidFrom",
 eg.valid_until::text as "grantValidUntil",
 ee.id::text as "eventId",
 ee.event_dedupe_key as "eventDedupeKey",
 ee.effective_at::text as "eventEffectiveAt",
 ee.target_valid_from::text as "eventValidFrom",
 ee.target_valid_until::text as "eventValidUntil",
 ee.target_status as "eventTargetStatus",
 a.entitlement_grant_id::text as "accessGrantId",
 a.official_reading_id::text as "readingId",
 a.reader_character_id as "accessReaderId",
 sel.reader_character_id as "selectedReaderId",
 a.reader_content_bundle_id::text as "accessBundleId",
 sel.reader_content_bundle_id::text as "selectedBundleId",
 a.request_hash as "requestHash",
 a.request_contract_version as "requestContractVersion",
 o.reading_session_id::text as "readingSessionId",
 count(*) over ()::integer as "rowCount",
 (select count(*)::integer from public.entitlement_grants g
  where g.source_receipt_id=cr.id) as "grantCount",
 (select count(*)::integer from public.entitlement_events e
  where e.source_type='receipt' and e.source_receipt_id=cr.id
    and e.event_type='granted') as "eventCount",
 (select count(*)::integer from public.entitlement_events e
  join public.entitlement_grants g on g.id=e.grant_id
  where g.source_receipt_id=cr.id and e.source_type='provider_event')
  as "providerEffectCount",
 (select count(*)::integer from public.standard_reading_reader_access_grants ag
  where ag.purchase_intent_id=cr.purchase_intent_id) as "accessCount",
 (select count(*)::integer from public.outbox_events ob
  join public.entitlement_events ev on ev.event_dedupe_key=ob.dedupe_key
  where ev.source_type='receipt' and ev.source_receipt_id=cr.id
   and ob.aggregate_type='entitlement') as "outboxCount"
from public.commerce_receipts cr
join public.purchase_intents pi on pi.id=cr.purchase_intent_id
 and pi.subject_id=cr.subject_id and pi.product_offer_id=cr.product_offer_id
 and pi.status='verified'
join public.product_offers po on po.id=cr.product_offer_id
join public.product_capability_sets pcs on pcs.id=pi.capability_set_id
 and pcs.product_id=po.product_id
join public.product_capability_items pci on pci.capability_set_id=pcs.id
left join public.purchase_intent_reader_selections sel
 on sel.purchase_intent_id=pi.id and sel.product_id=po.product_id
left join public.entitlement_grants eg on eg.source_receipt_id=cr.id
 and eg.subject_id=cr.subject_id and eg.grant_source_type='purchase'
 and eg.entitlement_key=pci.entitlement_key
 and eg.scope_key_norm=case when pci.scope_mode='global'
 then '__GLOBAL__' else pci.fixed_scope_key end
left join public.entitlement_events ee on ee.grant_id=eg.id
 and ee.source_type='receipt' and ee.source_receipt_id=cr.id
 and ee.event_type='granted'
left join public.standard_reading_reader_access_grants a
 on a.purchase_intent_id=cr.purchase_intent_id
 and a.subject_id=cr.subject_id and a.entitlement_grant_id=eg.id
left join public.standard_reading_official_bindings o
 on o.reading_id=a.official_reading_id and o.subject_id=cr.subject_id
where cr.id=$1::uuid and cr.verification_status='verified'
 and cr.environment='production'
 and pi.capability_snapshot_hash is not null
 and pi.capability_snapshot_jsonb=pg_catalog.jsonb_build_object(
 'capabilitySetId',pcs.id::text,
 'definitionVersion',pcs.definition_version,
 'definitionHash',pcs.definition_hash)
order by pci.item_key`.trim();

export type UnknownCommitReconciliationOutcomeV1 = Readonly<{
  readonly status: 'held';
  readonly reason:
    | 'SOURCE_UNAVAILABLE'
    | 'NO_COMMITTED_EFFECT_VISIBLE'
    | 'COMMITTED_COMPLETE_REQUIRES_PRIVATE_REPLAY'
    | 'INCOMPLETE_OR_CONFLICTING_AUTHORITY';
  readonly automaticRetryAuthorized: false;
  readonly publicDisclosureAuthorized: false;
}>;

type EvidenceRow = Readonly<Record<string, unknown>>;

function uuid(value: unknown): value is string {
  return typeof value === 'string' && RECEIPT_UUID.test(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function optionalTimestamp(value: unknown): boolean {
  return value === null || timestamp(value);
}

function present(event: EvidenceRow): boolean {
  return uuid(event.grantId) && event.grantStatus === 'active' && event.grantActiveAtDb === true &&
    timestamp(event.grantValidFrom) &&
    optionalTimestamp(event.grantValidUntil) &&
    uuid(event.eventId) && typeof event.eventDedupeKey === 'string' &&
    event.eventDedupeKey.length > 0 && timestamp(event.eventEffectiveAt) &&
    event.eventTargetStatus === 'active' &&
    event.eventValidFrom === event.grantValidFrom &&
    event.eventValidUntil === event.grantValidUntil &&
    event.accessGrantId === event.grantId &&
    uuid(event.readingId) && uuid(event.readingSessionId) &&
    event.accessReaderId === event.selectedReaderId &&
    typeof event.accessReaderId === 'string' &&
    event.accessReaderId.length > 0 &&
    event.accessBundleId === event.selectedBundleId &&
    uuid(event.accessBundleId) &&
    event.requestContractVersion === BIND_VERSION &&
    typeof event.requestHash === 'string' && HASH.test(event.requestHash);
}

function held(reason: UnknownCommitReconciliationOutcomeV1['reason']):
  UnknownCommitReconciliationOutcomeV1 {
  return Object.freeze({
    status: 'held',
    reason,
    automaticRetryAuthorized: false,
    publicDisclosureAuthorized: false,
  });
}

/**
 * A single SQL statement gives a coherent PostgreSQL MVCC view. Missing rows
 * cannot exclude concurrent uncommitted effects; the caller must never infer
 * "safe to issue" from an absent Grant. This function has no Writer port.
 */
export async function reconcileOfficialReaderUnknownCommitV1(input: Readonly<{
  readonly transaction: PrivateOfficialReaderRecoveryTransactionPortV1;
  readonly receiptId: unknown;
}>): Promise<UnknownCommitReconciliationOutcomeV1> {
  if (!uuid(input.receiptId)) {
    return held('SOURCE_UNAVAILABLE');
  }

  try {
    return await input.transaction.execute(async (client) => {
      const result = await client.query<EvidenceRow>(
        UNKNOWN_COMMIT_READ_SQL, [input.receiptId],
      );

      if (result.rows.length === 0) return held('SOURCE_UNAVAILABLE');
      const row = result.rows[0];
      if (result.rows.length !== 1 || row === undefined ||
          row.receiptId !== input.receiptId ||
          !uuid(row.subjectId) || !uuid(row.intentId) ||
          typeof row.itemKey !== 'string' || !row.itemKey ||
          row.rowCount !== 1) {
        return held('INCOMPLETE_OR_CONFLICTING_AUTHORITY');
      }

      if (row.grantCount === 0 && row.eventCount === 0 &&
          row.accessCount === 0 && row.outboxCount === 0 &&
          row.providerEffectCount === 0) {
        return held('NO_COMMITTED_EFFECT_VISIBLE');
      }

      if (row.grantCount === 1 && row.eventCount === 1 &&
          row.accessCount === 1 && row.providerEffectCount === 0 &&
          (row.outboxCount === 0 || row.outboxCount === 1) &&
          present(row)) {
        return held('COMMITTED_COMPLETE_REQUIRES_PRIVATE_REPLAY');
      }

      return held('INCOMPLETE_OR_CONFLICTING_AUTHORITY');
    });
  } catch {
    return held('SOURCE_UNAVAILABLE');
  }
}
