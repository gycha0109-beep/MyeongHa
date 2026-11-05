import type {PostgresTransactionQueryV1} from './postgres-subject-execution.js';

/**
 * Source-only operations review for ONE immutable stored customer claim.
 * Called inside the claim review's existing complete-visibility READ ONLY
 * snapshot AFTER exact verified-purchase and notice checks.
 *
 * The source Event is NOT a provider current GET, NEWER/STALE comparator,
 * legally final refund, delivered content or Reader entitlement authority.
 */
export const RECORDED_READER_CANCEL_CLAIM_EVIDENCE_V1=Object.freeze({
 publicRouteMounted:false,readOnly:true,ownerOnly:true,
 currentProviderGetObserved:false,providerOrderingProven:false,
 refundApproved:false,grantRevocationAuthorized:false,
} as const);

export const RECORDED_READER_CANCEL_EXACT_CLAIM_SQL_V1=`
select
 receipt.id::text as "receiptId",
 receipt.verified_amount_minor::text as "paidMinor",
 receipt.verified_currency as "currency",
 receipt.external_transaction_id as "originalTransactionId",
 event.id::text as "eventId",
 event.event_type as "eventType",
 event.status as "eventStatus",
 event.provider as "eventProvider",
 event.environment as "eventEnvironment",
 event.resolution_source_type as "eventSourceType",
 event.resolved_subject_id::text as "eventSubjectId",
 event.resolved_receipt_id::text as "eventReceiptId",
 event.external_transaction_id as "eventTransactionId",
 event.external_original_transaction_id as "eventOriginalTransactionId",
 event.provider_ordering_key as "providerOrderingKey",
 event.verifier_revision as "verifierRevision",
 event.verified_payload_jsonb->>'schemaVersion' as "sourceSchema",
 event.verified_payload_jsonb->>'eventType' as "sourceEventType",
 event.verified_payload_jsonb->>'cancellationIdHmac' as "cancellationIdHmac",
 event.verified_payload_jsonb->>'matchingCancellationStatus' as "cancellationStatus",
 event.verified_payload_jsonb->>'exactSucceededCancellationAmountMinor' as "exactAmountMinor",
 event.verified_payload_jsonb->>'observedCumulativeCancelledAmountMinor' as "cumulativeAmountMinor",
 event.verified_payload_jsonb->>'originalReceiptPaidAmountMinor' as "originalPaidMinor",
 event.verified_payload_jsonb->>'currency' as "sourceCurrency",
 event.verified_payload_jsonb->>'orderingProven' as "orderingProven",
 event.verified_payload_jsonb->>'refundExecutionAuthorized' as "refundExecutionAuthorized",
 event.verified_payload_jsonb->>'entitlementRevocationAuthorized' as "entitlementRevocationAuthorized"
from public.purchase_intents pi
join public.product_offers offer on offer.id=pi.product_offer_id
join public.standard_reading_product_specs spec
 on spec.product_id=offer.product_id
 and spec.purchase_unit_mode='topic_reader_reading'
join public.purchase_intent_reader_selections selection
 on selection.purchase_intent_id=pi.id and selection.product_id=offer.product_id
join public.commerce_receipts receipt
 on receipt.purchase_intent_id=pi.id
 and receipt.subject_id=pi.subject_id
 and receipt.product_offer_id=pi.product_offer_id
 and receipt.provider='portone_v2' and receipt.platform='web'
 and receipt.environment='production'
 and receipt.verification_status in ('verified','revoked')
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
left join public.commerce_provider_events event
 on event.resolved_receipt_id=receipt.id
 and event.event_type in ('Transaction.Cancelled','Transaction.PartialCancelled')
where pi.id=$1::uuid and pi.subject_id=$2::uuid
 and pi.status='verified' and pi.expected_amount_minor>0
 and exists (
  select 1 from public.digital_reading_checkout_notice_presentations_v1 notice
  where notice.purchase_intent_id=pi.id and notice.subject_id=pi.subject_id
   and notice.unit_id=$3::uuid and notice.product_id=offer.product_id
   and notice.product_spec_version=spec.spec_version
   and notice.reader_character_id=selection.reader_character_id
   and notice.reader_content_bundle_id=selection.reader_content_bundle_id
   and receipt.verified_at>notice.server_presented_at
 )
order by event.id nulls first
limit 66
`.trim();

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const AMOUNT=/^(0|[1-9][0-9]*)$/u;
const MAC=/^hmac-sha256:k1:[0-9a-f]{64}$/u;
const MAX=BigInt(Number.MAX_SAFE_INTEGER);

type Row=Readonly<{
 receiptId:unknown;paidMinor:unknown;currency:unknown;
 originalTransactionId:unknown;eventId:unknown;eventType:unknown;
 eventStatus:unknown;eventProvider:unknown;eventEnvironment:unknown;
 eventSourceType:unknown;eventSubjectId:unknown;eventReceiptId:unknown;
 eventTransactionId:unknown;eventOriginalTransactionId:unknown;
 providerOrderingKey:unknown;verifierRevision:unknown;
 sourceSchema:unknown;sourceEventType:unknown;cancellationIdHmac:unknown;
 cancellationStatus:unknown;exactAmountMinor:unknown;
 cumulativeAmountMinor:unknown;originalPaidMinor:unknown;
 sourceCurrency:unknown;orderingProven:unknown;
 refundExecutionAuthorized:unknown;entitlementRevocationAuthorized:unknown;
}>;

export type RecordedReaderCancelClaimEvidenceV1=Readonly<{
 kind:'no_recorded_successful_cancellation'
  |'one_exact_full_cancel_recorded_only'
  |'partial_or_multiple_cancel_items_recorded'
  |'stored_cancel_source_untrusted';
 recordedSuccessfulItems:number;
 originalPaidMinor:string|null;
 currentProviderGetObserved:false;providerOrderingProven:false;
 refundFinalityProven:false;legalDecisionAutomatic:false;
 providerRefundAuthorized:false;entitlementMutationAuthorized:false;
}>;

function result(kind:RecordedReaderCancelClaimEvidenceV1['kind'],
 count:number,paid:string|null):RecordedReaderCancelClaimEvidenceV1{
 return Object.freeze({
  kind,recordedSuccessfulItems:count,originalPaidMinor:paid,
  currentProviderGetObserved:false,providerOrderingProven:false,
  refundFinalityProven:false,legalDecisionAutomatic:false,
  providerRefundAuthorized:false,entitlementMutationAuthorized:false,
 });
}
function amount(s:unknown):bigint|null{
 if(typeof s!=='string'||!AMOUNT.test(s))return null;
 const n=BigInt(s);return n<=MAX?n:null;
}

/** Never accepts Receipt, Event, Grant or Subject from a browser. */
export async function readRecordedReaderCancellationForClaimV1(
 client:PostgresTransactionQueryV1,
 input:Readonly<{subjectId:string;purchaseIntentId:string;unitId:string}>,
):Promise<RecordedReaderCancelClaimEvidenceV1>{
 if(!UUID.test(input.subjectId)||!UUID.test(input.purchaseIntentId)||
    !UUID.test(input.unitId))throw Error('RECORDED_READER_CANCEL_CLAIM_ID_INVALID');
 const res=await client.query<Row>(RECORDED_READER_CANCEL_EXACT_CLAIM_SQL_V1,[
  input.purchaseIntentId,input.subjectId,input.unitId,
 ]);
 const rows=res.rows;
 if(rows.length===0||rows.length>64)
  return result('stored_cancel_source_untrusted',0,null);
 const first=rows[0]!;
 const paid=amount(first.paidMinor);
 if(typeof first.receiptId!=='string'||!UUID.test(first.receiptId)||
    typeof first.originalTransactionId!=='string'||
    first.originalTransactionId.length===0||
    paid===null||paid===0n||
    typeof first.currency!=='string'||!/^[A-Z]{3}$/u.test(first.currency))
  return result('stored_cancel_source_untrusted',0,null);
 const originalPaid=first.paidMinor as string;
 let sum=0n;
 const uniqueEvents=new Set<string>();
 const uniqueItems=new Set<string>();
 for(const row of rows){
  if(row.receiptId!==first.receiptId||
     row.paidMinor!==first.paidMinor||
     row.currency!==first.currency||
     row.originalTransactionId!==first.originalTransactionId)
   return result('stored_cancel_source_untrusted',0,null);
  if(row.eventId===null){
   if(rows.length!==1)return result('stored_cancel_source_untrusted',0,null);
   return result('no_recorded_successful_cancellation',0,originalPaid);
  }
  const n=amount(row.exactAmountMinor);
  const cumulative=amount(row.cumulativeAmountMinor);
  if(typeof row.eventId!=='string'||!UUID.test(row.eventId)||
     uniqueEvents.has(row.eventId)||
     typeof row.cancellationIdHmac!=='string'||
     !MAC.test(row.cancellationIdHmac)||
     uniqueItems.has(row.cancellationIdHmac)||
     !['Transaction.Cancelled','Transaction.PartialCancelled'].includes(
      String(row.eventType))||
     !['verified','processed'].includes(String(row.eventStatus))||
     row.eventProvider!=='portone_v2'||row.eventEnvironment!=='production'||
     row.eventSourceType!=='receipt'||
     row.eventSubjectId!==input.subjectId||
     row.eventReceiptId!==first.receiptId||
     row.eventTransactionId!==first.originalTransactionId||
     row.eventOriginalTransactionId!==first.originalTransactionId||
     row.providerOrderingKey!==null||
     row.verifierRevision!=='portone-cancel-readback-v2'||
     row.sourceSchema!=='commerce-portone-cancellation-source-v2'||
     row.sourceEventType!==row.eventType||
     row.cancellationStatus!=='SUCCEEDED'||
     row.originalPaidMinor!==first.paidMinor||
     row.sourceCurrency!==first.currency||
     row.orderingProven!=='false'||
     row.refundExecutionAuthorized!=='false'||
     row.entitlementRevocationAuthorized!=='false'||
     n===null||n===0n||cumulative===null||
     cumulative<n||cumulative>paid||
     (row.eventType==='Transaction.Cancelled'&&cumulative!==paid)||
     (row.eventType==='Transaction.PartialCancelled'&&n>=paid))
   return result('stored_cancel_source_untrusted',0,null);
  uniqueEvents.add(row.eventId);
  uniqueItems.add(row.cancellationIdHmac);
  sum+=n;
  if(sum>paid)return result('stored_cancel_source_untrusted',0,null);
 }
 if(rows.length===1&&first.eventType==='Transaction.Cancelled'&&sum===paid)
  return result('one_exact_full_cancel_recorded_only',1,originalPaid);
 return result('partial_or_multiple_cancel_items_recorded',rows.length,originalPaid);
}
