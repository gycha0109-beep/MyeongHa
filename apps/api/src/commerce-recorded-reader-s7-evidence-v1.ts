import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

/** Internal owner-only read, never a legal consumer-delivery assertion. */
export const RECORDED_READER_S7_CLAIM_EVIDENCE_V1=Object.freeze({
  publicRouteMounted:false,ownerOnly:true,readOnly:true,
  legalDeliveryProven:false,providerRefundAuthorized:false,
  entitlementMutationEnabled:false,
} as const);

/**
 * The immutable Claim supplied the Subject, Purchase and checkout unit.
 * The original verified Receipt, paid purchase Grant and S5 body must be
 * joined again by the DB. No client-supplied body or Grant is trusted.
 * Retained S7 journal data is independently transport-only evidence.
 */
export const RECORDED_READER_S7_EXACT_PURCHASE_SQL_V1=`
select
 b.id::text as "bodyId",
 b.committed_at::text as "s5CommittedAt",
 count(d.id)::text as "retainedPreparedCount",
 count(d.client_acknowledged_at)::text as "retainedAcknowledgedCount",
 min(d.response_prepared_at)::text as "firstPreparedAt",
 min(d.client_acknowledged_at)::text as "firstAcknowledgedAt"
from public.purchase_intents pi
join public.product_offers offer on offer.id=pi.product_offer_id
join public.standard_reading_product_specs spec
 on spec.product_id=offer.product_id
 and spec.purchase_unit_mode='topic_reader_reading'
join public.purchase_intent_reader_selections selection
 on selection.purchase_intent_id=pi.id
 and selection.product_id=offer.product_id
join public.digital_reading_checkout_notice_presentations_v1 presentation
 on presentation.purchase_intent_id=pi.id
 and presentation.subject_id=pi.subject_id
 and presentation.product_id=offer.product_id
 and presentation.product_spec_version=spec.spec_version
 and presentation.reader_character_id=selection.reader_character_id
 and presentation.reader_content_bundle_id=selection.reader_content_bundle_id
join public.commerce_receipts receipt
 on receipt.purchase_intent_id=pi.id
 and receipt.subject_id=pi.subject_id
 and receipt.product_offer_id=pi.product_offer_id
 and receipt.provider='portone_v2'
 and receipt.environment='production'
 and receipt.platform='web'
 and receipt.verification_status in ('verified','revoked')
 and receipt.verified_at>presentation.server_presented_at
 and receipt.verified_amount_minor=pi.expected_amount_minor
 and receipt.verified_currency=pi.expected_currency
join public.entitlement_grants grant_row
 on grant_row.source_receipt_id=receipt.id
 and grant_row.subject_id=pi.subject_id
 and grant_row.grant_source_type='purchase'
join public.standard_reading_reader_access_grants access
 on access.entitlement_grant_id=grant_row.id
 and access.subject_id=grant_row.subject_id
 and access.purchase_intent_id=pi.id
 and access.reader_character_id=selection.reader_character_id
 and access.reader_content_bundle_id=selection.reader_content_bundle_id
join public.official_reader_paid_answer_bodies b
 on b.subject_id=pi.subject_id
 and b.originating_entitlement_grant_id=grant_row.id
 and b.product_id=offer.product_id
 and b.committed_at>=receipt.verified_at
 and b.official_reading_id=access.official_reading_id
 and b.reader_character_id=access.reader_character_id
 and b.reader_content_bundle_id=access.reader_content_bundle_id
 and b.product_spec_version=spec.spec_version
left join public.official_reader_paid_delivery_attempts_v1 d
 on d.subject_id=b.subject_id and d.body_id=b.id
 and d.thread_id=b.thread_id and d.safe_message_id=b.safe_message_id
 and d.retention_until>pg_catalog.clock_timestamp()
where pi.id=$1::uuid and pi.subject_id=$2::uuid
 and presentation.unit_id=$3::uuid
 and pi.status='verified' and pi.expected_amount_minor>0
group by b.id,b.committed_at
limit 2
`.trim();

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const COUNT=/^(0|[1-9][0-9]*)$/u;
type Row=Readonly<{bodyId:unknown;s5CommittedAt:unknown;
 retainedPreparedCount:unknown;retainedAcknowledgedCount:unknown;
 firstPreparedAt:unknown;firstAcknowledgedAt:unknown}>;

export type RecordedReaderS7ClaimTimelineV1=Readonly<{
 kind:'s5_committed_no_retained_s7'
  |'s7_response_prepared_without_ack'
  |'s7_client_ack_retained_delivery_unproven';
 s5CommittedAt:string;
 firstPreparedAt:string|null;firstAcknowledgedAt:string|null;
 retainedPreparedCount:number;retainedAcknowledgedCount:number;
 consumerDeliveryProven:false;legallyProvenDeliveredAt:null;
 providerRefundAuthorized:false;grantMutationAuthorized:false;
}>;
function count(value:unknown):number{
 if(typeof value!=='string'||!COUNT.test(value))throw Error('PRIVATE_S7_COUNT_INVALID');
 const parsed=Number(value);
 if(!Number.isSafeInteger(parsed))throw Error('PRIVATE_S7_COUNT_INVALID');
 return parsed;
}
function time(value:unknown):string{
 if(typeof value!=='string'||value.length<20||value.length>64||
    !Number.isFinite(Date.parse(value)))throw Error('PRIVATE_S7_TIME_INVALID');
 return new Date(value).toISOString();
}
function maybeTime(value:unknown):string|null{return value===null?null:time(value);}

/** Must be called inside the owner review's already authorized READ ONLY snapshot. */
export async function readRecordedReaderS7ClaimTimelineV1(
 client:PostgresTransactionQueryV1,
 input:Readonly<{subjectId:string;purchaseIntentId:string;unitId:string}>,
):Promise<RecordedReaderS7ClaimTimelineV1|null>{
 if(!UUID.test(input.subjectId)||!UUID.test(input.purchaseIntentId)||
    !UUID.test(input.unitId))throw Error('PRIVATE_S7_CLAIM_INVALID');
 const result=await client.query<Row>(RECORDED_READER_S7_EXACT_PURCHASE_SQL_V1,[
  input.purchaseIntentId,input.subjectId,input.unitId,
 ]);
 // A missing S5 body or ambiguous multiple bodies cannot be evidence
 // that no content was ever transmitted. Never select a sibling body.
 if(result.rows.length!==1)return null;
 const r=result.rows[0]!;
 if(typeof r.bodyId!=='string'||!UUID.test(r.bodyId))
  throw Error('PRIVATE_S7_BODY_INVALID');
 const s5CommittedAt=time(r.s5CommittedAt);
 const firstPreparedAt=maybeTime(r.firstPreparedAt);
 const firstAcknowledgedAt=maybeTime(r.firstAcknowledgedAt);
 const retainedPreparedCount=count(r.retainedPreparedCount);
 const retainedAcknowledgedCount=count(r.retainedAcknowledgedCount);
 if(retainedAcknowledgedCount>retainedPreparedCount||
    (retainedPreparedCount===0)!==(firstPreparedAt===null)||
    (retainedAcknowledgedCount===0)!==(firstAcknowledgedAt===null)||
    (firstPreparedAt!==null&&firstPreparedAt<s5CommittedAt)||
    (firstAcknowledgedAt!==null&&
      (firstPreparedAt===null||firstAcknowledgedAt<firstPreparedAt)))
  throw Error('PRIVATE_S7_TIMELINE_INCONSISTENT');
 return Object.freeze({
  kind:retainedPreparedCount===0?'s5_committed_no_retained_s7'
   :retainedAcknowledgedCount===0?'s7_response_prepared_without_ack'
    :'s7_client_ack_retained_delivery_unproven',
  s5CommittedAt,firstPreparedAt,firstAcknowledgedAt,
  retainedPreparedCount,retainedAcknowledgedCount,
  consumerDeliveryProven:false,legallyProvenDeliveredAt:null,
  providerRefundAuthorized:false,grantMutationAuthorized:false,
 });
}
