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
 and (
   receipt.verification_status='verified'
   or (
     receipt.verification_status='revoked'
     and grant_row.status='revoked'
     and exists (
       select 1
       from public.entitlement_events revoked
       join public.commerce_provider_events cancelled
         on cancelled.id=revoked.source_provider_event_id
        and cancelled.resolved_subject_id=revoked.subject_id
        and cancelled.resolved_receipt_id=receipt.id
        and cancelled.provider=receipt.provider
        and cancelled.environment=receipt.environment
       where revoked.grant_id=grant_row.id
         and revoked.subject_id=pi.subject_id
         and revoked.event_type='revoked'
         and revoked.source_type='provider_event'
         and cancelled.provider='portone_v2'
         and cancelled.environment='production'
         and cancelled.status in ('verified','processed')
         and cancelled.resolution_source_type='receipt'
         and cancelled.event_type='Transaction.Cancelled'
             and cancelled.provider_occurred_at is not null
             and cancelled.provider_occurred_at<=pg_catalog.clock_timestamp()
             -- The original verified FULL cancellation must be the CURRENT
             -- source of this Grant's revoked status, not merely one historic
             -- provider event for this Receipt.
             and grant_row.last_effective_at=revoked.effective_at
             and grant_row.last_provider_ordering_key is not distinct from
                 revoked.provider_ordering_key
             and revoked.effective_at=cancelled.provider_occurred_at
             and revoked.provider_ordering_key is not distinct from
                 cancelled.provider_ordering_key
             and cancelled.provider_ordering_key=(
               'portone-v2-fullcancel:'||pg_catalog.to_char(
                 cancelled.provider_occurred_at at time zone 'UTC',
                 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
               )
             )
             and receipt.provider='portone_v2'
             and receipt.verified_amount_minor>0
             and receipt.verified_currency ~ '^[A-Z]{3}
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

             and cancelled.external_transaction_id=
                 receipt.external_transaction_id
             and cancelled.external_event_id=(
               'myeongha:portone-v2:full-cancel:v1:'||
               (cancelled.verified_payload_jsonb->>'cancellationId')
             )
             and cancelled.payload_fingerprint ~
                 '^hmac-sha256:k1:[0-9a-f]{64}
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

             and cancelled.verified_payload_jsonb->>'schemaVersion'=
                 'portone-full-cancel-verified-v1'
             and cancelled.verified_payload_jsonb->>'transactionId'=
                 receipt.external_transaction_id
             and cancelled.verified_payload_jsonb->>'environment'='production'
             and cancelled.verified_payload_jsonb->>'verifiedAmountMinor'=
                 receipt.verified_amount_minor::text
             and cancelled.verified_payload_jsonb->>'verifiedCurrency'=
                 receipt.verified_currency
             and cancelled.verified_payload_jsonb->>'evidenceFingerprint'=
                 cancelled.payload_fingerprint
             and cancelled.verified_payload_jsonb->>'verifierRevision'=
                 cancelled.verifier_revision
             and (
               select count(*)
               from public.commerce_payment_attempts attempt
               where attempt.purchase_intent_id=receipt.purchase_intent_id
                 and attempt.subject_id=receipt.subject_id
                 and attempt.product_offer_id=receipt.product_offer_id
                 and attempt.provider=receipt.provider
                 and attempt.environment=receipt.environment
                 and attempt.provider_transaction_id=
                     receipt.external_transaction_id
                 and attempt.provider_request_id=
                     cancelled.verified_payload_jsonb->>'paymentId'
             )=1
     )
   )
 )
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
