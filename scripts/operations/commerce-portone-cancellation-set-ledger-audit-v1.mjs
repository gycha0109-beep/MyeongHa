// Commerce P4: per-Receipt canonical cancellation collection audit.
// Operations-only, complete-visibility READ ONLY. This cannot prove
// provider semantic NEWER/STALE, statutory refund, Reader T2 or Grant revoke.
export const COMMERCE_PORTONE_CANCEL_SET_AUDIT_V1=Object.freeze({
 schemaVersion:'commerce-portone-cancellation-set-ledger-audit-v1',
 productionMounted:false,publicRouteMounted:false,readOnly:true,
 providerOrderingProven:false,legalRefundAuthority:false,
 readerT2LockHeld:false,entitlementEffectEnabled:false,providerRefundEnabled:false,
 maximumEvents:256,
});

export const COMMERCE_PORTONE_CANCEL_SET_AUDIT_SQL_V1=`
select
 receipt.id::text as "receiptId",
 receipt.subject_id::text as "receiptSubjectId",
 receipt.external_transaction_id as "receiptTransactionId",
 receipt.provider as "receiptProvider",
 receipt.environment as "receiptEnvironment",
 receipt.verification_status as "receiptStatus",
 receipt.verified_amount_minor::text as "receiptPaidMinor",
 receipt.verified_currency as "receiptCurrency",
 event.id::text as "providerEventId",
 event.event_type as "eventType",
 event.status as "eventStatus",
 event.provider as "eventProvider",
 event.environment as "eventEnvironment",
 event.resolved_subject_id::text as "eventSubjectId",
 event.resolution_source_type as "eventResolutionSource",
 event.external_transaction_id as "eventTransactionId",
 event.external_original_transaction_id as "eventOriginalTransactionId",
 event.payload_fingerprint as "signedEventHmac",
 event.provider_ordering_key as "providerOrderingKey",
 event.verifier_revision as "verifierRevision",
 event.verified_payload_jsonb->>'schemaVersion' as "sourceSchema",
 event.verified_payload_jsonb->>'eventType' as "sourceEventType",
 event.verified_payload_jsonb->>'signedPayloadHmac' as "sourceSignedHmac",
 event.verified_payload_jsonb->>'providerReadbackHmac' as "sourceReadbackHmac",
 event.verified_payload_jsonb->>'cancellationIdHmac' as "cancellationIdHmac",
 event.verified_payload_jsonb->>'matchingCancellationStatus' as "cancellationStatus",
 event.verified_payload_jsonb->>'exactSucceededCancellationAmountMinor' as "exactAmountMinor",
 event.verified_payload_jsonb->>'observedCumulativeCancelledAmountMinor' as "firstObservedCumulativeMinor",
 event.verified_payload_jsonb->>'originalReceiptPaidAmountMinor' as "sourcePaidMinor",
 event.verified_payload_jsonb->>'currency' as "sourceCurrency",
 event.verified_payload_jsonb->>'orderingProven' as "orderingProven",
 event.verified_payload_jsonb->>'refundExecutionAuthorized' as "refundExecutionAuthorized",
 event.verified_payload_jsonb->>'entitlementRevocationAuthorized' as "revocationAuthorized"
from public.commerce_provider_events event
join public.commerce_receipts receipt
 on receipt.id=event.resolved_receipt_id
join public.purchase_intents intent
 on intent.id=receipt.purchase_intent_id and intent.subject_id=receipt.subject_id
 and intent.product_offer_id=receipt.product_offer_id
 and intent.status='verified'
 and intent.expected_amount_minor=receipt.verified_amount_minor
 and intent.expected_currency=receipt.verified_currency
join public.product_offers offer on offer.id=intent.product_offer_id
join public.products product
 on product.id=offer.product_id and product.product_type='reading'
join public.standard_reading_product_specs spec
 on spec.product_id=product.id and spec.purchase_unit_mode='topic_reader_reading'
join public.purchase_intent_reader_selections selection
 on selection.purchase_intent_id=intent.id and selection.product_id=product.id
where event.resolved_receipt_id=$1::uuid
 and event.event_type in ('Transaction.Cancelled','Transaction.PartialCancelled')
limit 257
`.trim();

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAC=/^hmac-sha256:k1:[0-9a-f]{64}$/u;
const DEC=/^[1-9][0-9]*$/u;
const ZERO_DEC=/^(0|[1-9][0-9]*)$/u;
const CURRENCY=/^[A-Z]{3}$/u;
const MAX=BigInt(Number.MAX_SAFE_INTEGER);
const no=(kind,extra={})=>Object.freeze({
 schemaVersion:COMMERCE_PORTONE_CANCEL_SET_AUDIT_V1.schemaVersion,
 kind,readOnly:true,recordedSetSelfConsistent:false,
 providerOrderingProven:false,currentProviderStateVerified:false,
 latestRefundFinalityProven:false,legalRefundAuthority:false,
 readerT2LockHeld:false,grantRevocationAuthorized:false,
 providerRefundAuthorized:false,writesPerformed:false,
 ...extra,
});

function validRow(r,receiptId,head){
 if(r.receiptId!==receiptId||r.receiptId!==head.receiptId||
    r.receiptSubjectId!==head.receiptSubjectId||
    r.receiptTransactionId!==head.receiptTransactionId||
    r.receiptPaidMinor!==head.receiptPaidMinor||
    r.receiptCurrency!==head.receiptCurrency||
    r.receiptStatus!==head.receiptStatus||
    !['verified','revoked'].includes(r.receiptStatus)||
    !['verified','revoked'].includes(head.receiptStatus)||
    r.receiptProvider!=='portone_v2'||r.receiptEnvironment!=='production'||
    r.eventProvider!=='portone_v2'||r.eventEnvironment!=='production'||
    r.eventSubjectId!==r.receiptSubjectId||
    r.eventResolutionSource!=='receipt'||
    r.eventTransactionId!==r.receiptTransactionId||
    r.eventOriginalTransactionId!==r.receiptTransactionId||
    !UUID.test(r.providerEventId)||
    !['Transaction.Cancelled','Transaction.PartialCancelled'].includes(r.eventType)||
    !['verified','processed'].includes(r.eventStatus)||
    r.verifierRevision!=='portone-cancel-readback-v2'||
    r.sourceSchema!=='commerce-portone-cancellation-source-v2'||
    r.sourceEventType!==r.eventType||
    !MAC.test(r.signedEventHmac)||r.sourceSignedHmac!==r.signedEventHmac||
    !MAC.test(r.sourceReadbackHmac)||!MAC.test(r.cancellationIdHmac)||
    r.cancellationStatus!=='SUCCEEDED'||
    r.providerOrderingKey!==null||
    r.orderingProven!=='false'||r.refundExecutionAuthorized!=='false'||
    r.revocationAuthorized!=='false'||
    !DEC.test(r.receiptPaidMinor)||!DEC.test(r.exactAmountMinor)||
    !ZERO_DEC.test(r.firstObservedCumulativeMinor)||
    r.sourcePaidMinor!==r.receiptPaidMinor||
    !CURRENCY.test(r.receiptCurrency)||r.sourceCurrency!==r.receiptCurrency)
   return false;
 const paid=BigInt(r.receiptPaidMinor),item=BigInt(r.exactAmountMinor);
 const aggregate=BigInt(r.firstObservedCumulativeMinor);
 return paid<=MAX&&item<=aggregate&&aggregate<=paid&&
   (r.eventType!=='Transaction.Cancelled'||aggregate===paid)&&
   (r.eventType!=='Transaction.PartialCancelled'||item<paid);
}

/**
 * This audits only the set of canonical, already-stored successful items.
 * A highest recorded cumulative observation is NOT a provider ordering
 * comparator and cannot establish current payment state or grant authority.
 */
export async function auditPortOneCancellationSetForReceiptV1(client,{receiptId}){
 if(typeof receiptId!=='string'||!UUID.test(receiptId))
  throw Error('INVALID_CANCELLATION_SET_AUDIT_RECEIPT');
 let begun=false;
 try{
  await client.query('begin isolation level repeatable read read only');
  begun=true;
  await client.query("set local statement_timeout='10000ms'");
  const role=await client.query(`select
   current_setting('transaction_read_only')='on' as "readOnly",
   (rolsuper or rolbypassrls) as "completeVisibility",
   current_user as "currentUser"
   from pg_catalog.pg_roles where rolname=current_user`);
  if(role.rows.length!==1||role.rows[0].readOnly!==true||
     role.rows[0].completeVisibility!==true||
     ['anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_worker_runtime','myeongha_commerce_internal_executor'
     ].includes(role.rows[0].currentUser))
   throw Error('CANCELLATION_SET_COMPLETE_VISIBILITY_AUTHORITY_REQUIRED');
  const result=await client.query(COMMERCE_PORTONE_CANCEL_SET_AUDIT_SQL_V1,[receiptId]);
  if(result.rows.length===0)return no('no_recorded_cancellation_items');
  if(result.rows.length>COMMERCE_PORTONE_CANCEL_SET_AUDIT_V1.maximumEvents)
   return no('cancellation_set_capacity_exceeded');
  const head=result.rows[0];
  const seenIds=new Set(),seenHmacs=new Set();
  let sum=0n,highest=0n,paid=0n;
  for(const row of result.rows){
   if(!validRow(row,receiptId,head))
    return no('cancellation_source_or_receipt_inconsistent');
   if(seenIds.has(row.providerEventId))
    return no('ambiguous_canonical_event_join');
   if(seenHmacs.has(row.cancellationIdHmac))
    return no('duplicate_cancellation_item_fingerprint');
   seenIds.add(row.providerEventId);
   seenHmacs.add(row.cancellationIdHmac);
   paid=BigInt(row.receiptPaidMinor);
   sum+=BigInt(row.exactAmountMinor);
   const observed=BigInt(row.firstObservedCumulativeMinor);
   if(observed>highest)highest=observed;
   if(sum>paid)return no('recorded_item_sum_exceeds_paid_receipt');
  }
  if(sum!==highest)
   return no('recorded_set_vs_first_observations_conflict');
  return no(sum===paid?'recorded_full_amount_set_consistent':
   'recorded_partial_amount_set_consistent',{
    recordedSetSelfConsistent:true,
    distinctRecordedCancellationItems:result.rows.length,
    recordedItemAmountMinor:sum.toString(),
    originalReceiptPaidMinor:paid.toString(),
   });
 }finally{
  if(begun)await client.query('rollback');
 }
}
