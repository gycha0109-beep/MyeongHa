import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export interface PrivateOfficialReaderRecoveryTransactionPortV1 {
  execute<T>(callback: (client: PostgresTransactionQueryV1) => Promise<T>): Promise<T>;
}

export type PrivateOfficialReaderRecoveryResultV1 =
  | Readonly<{
      status: 'held';
      reason: 'UNFULFILLED_OR_UNAUTHORIZED';
      publicDisclosureAuthorized: false;
    }>
  | Readonly<{
      status: 'held';
      reason: 'PRIVATE_WRITER_NOT_AUTHORIZED';
      publicDisclosureAuthorized: false;
    }>;

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;
const REQUEST_HASH = /^sha256:v1:[0-9a-f]{64}$/u;
const BIND_VERSION = 'standard-reading-access-bind-v2';

const READ_SQL = `select
 cr.id::text as "receiptId",
 cr.subject_id::text as "subjectId",
 cr.purchase_intent_id::text as "intentId",
 pci.item_key as "itemKey",
 eg.id::text as "grantId",
 ee.id::text as "eventId",
 ee.effective_at::text as "effectiveAt",
 ee.target_valid_from::text as "validFrom",
 ee.target_valid_until::text as "validUntil",
 ee.reason_code as "reasonCode",
 a.official_reading_id::text as "readingId",
 o.reading_session_id::text as "sessionId",
 a.request_hash as "requestHash",
 a.request_contract_version as "contractVersion",
 count(*) over ()::integer as "rowCount"
from public.commerce_receipts cr
join public.purchase_intents pi on pi.id=cr.purchase_intent_id
 and pi.subject_id=cr.subject_id and pi.product_offer_id=cr.product_offer_id
 and pi.status='verified'
join public.product_offers po on po.id=cr.product_offer_id
join public.product_capability_sets pcs on pcs.id=pi.capability_set_id
 and pcs.product_id=po.product_id
join public.product_capability_items pci on pci.capability_set_id=pcs.id
left join public.entitlement_grants eg on eg.source_receipt_id=cr.id
 and eg.subject_id=cr.subject_id and eg.grant_source_type='purchase'
 and eg.entitlement_key=pci.entitlement_key
 and eg.scope_key_norm=case when pci.scope_mode='global'
   then '__GLOBAL__' else pci.fixed_scope_key end
 and eg.status='active'
 and eg.valid_from<=transaction_timestamp()
 and (eg.valid_until is null or eg.valid_until>transaction_timestamp())
left join public.entitlement_events ee on ee.grant_id=eg.id
 and ee.source_type='receipt' and ee.source_receipt_id=cr.id
 and ee.event_type='granted' and ee.target_status='active'
left join public.standard_reading_reader_access_grants a
 on a.purchase_intent_id=pi.id and a.subject_id=cr.subject_id
 and a.entitlement_grant_id=eg.id
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


interface AuthorityRowV1 {
  readonly receiptId?: unknown;
  readonly subjectId?: unknown;
  readonly intentId?: unknown;
  readonly itemKey?: unknown;
  readonly grantId?: unknown;
  readonly eventId?: unknown;
  readonly effectiveAt?: unknown;
  readonly validFrom?: unknown;
  readonly validUntil?: unknown;
  readonly reasonCode?: unknown;
  readonly readingId?: unknown;
  readonly sessionId?: unknown;
  readonly requestHash?: unknown;
  readonly contractVersion?: unknown;
  readonly rowCount?: unknown;
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 &&
    Number.isFinite(Date.parse(value));
}

function isReady(row: AuthorityRowV1): row is
  AuthorityRowV1 & {
    receiptId: string;
    subjectId: string;
    intentId: string;
    itemKey: string;
    grantId: string;
    eventId: string;
    effectiveAt: string;
    validFrom: string;
    readingId: string;
    sessionId: string;
    requestHash: string;
    contractVersion: typeof BIND_VERSION;
    rowCount: 1;
  } {
  return uuid(row.receiptId) && uuid(row.subjectId) && uuid(row.intentId) &&
    typeof row.itemKey === 'string' && row.itemKey.trim().length > 0 &&
    uuid(row.grantId) && uuid(row.eventId) &&
    timestamp(row.effectiveAt) && timestamp(row.validFrom) &&
    (row.validUntil === null || timestamp(row.validUntil)) &&
    (row.reasonCode === null ||
      (typeof row.reasonCode === 'string' && row.reasonCode.trim().length > 0)) &&
    uuid(row.readingId) && uuid(row.sessionId) &&
    typeof row.requestHash === 'string' && REQUEST_HASH.test(row.requestHash) &&
    row.contractVersion === BIND_VERSION && row.rowCount === 1;
}


/**
 * READ ONLY: inspect an already bound original receipt/effect/Reading.
 * This does not execute any private DB writer, create a Grant, resolve
 * credentials, or authorize paid disclosure. An unreviewed issuer remains HOLD.
 */
export async function preflightAlreadyBoundOfficialReaderReceiptV1(input: Readonly<{
  readonly transaction: PrivateOfficialReaderRecoveryTransactionPortV1;
  readonly receiptId: unknown;
}>): Promise<PrivateOfficialReaderRecoveryResultV1> {
  if (!uuid(input.receiptId)) {
    throw new Error('Private Official Reader preflight requires a valid Receipt UUID.');
  }

  return input.transaction.execute(async (client) => {
    const source = await client.query<AuthorityRowV1>(READ_SQL, [input.receiptId]);
    const original = source.rows[0];

    if (source.rows.length !== 1 || original === undefined ||
        !isReady(original) || original.receiptId !== input.receiptId) {
      return Object.freeze({
        status: 'held',
        reason: 'UNFULFILLED_OR_UNAUTHORIZED',
        publicDisclosureAuthorized: false,
      } as const);
    }

    return Object.freeze({
      status: 'held',
      reason: 'PRIVATE_WRITER_NOT_AUTHORIZED',
      publicDisclosureAuthorized: false,
    } as const);
  });
}
