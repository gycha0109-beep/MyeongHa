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
 attempt.provider_request_id as "providerPaymentId",
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
left join public.commerce_payment_attempts attempt
 on attempt.purchase_intent_id=intent.id
 and attempt.subject_id=intent.subject_id
 and attempt.product_offer_id=intent.product_offer_id
 and attempt.provider=event.provider
 and attempt.environment=event.environment
 and attempt.provider_transaction_id=receipt.external_transaction_id
 and attempt.status='response_received'
where event.resolved_receipt_id=$1::uuid
 and event.event_type in ('Transaction.Cancelled','Transaction.PartialCancelled')
limit 257
`.trim();

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAC=/^hmac-sha256:k1:[0-9a-f]{64}$/u;
const DEC=/^[1-9][0-9]*$/u;
const ZERO_DEC=/^(0|[1-9][0-9]*)$/u;
const CURRENCY=/^[A-Z]{3}$/u;
const ID=/^[^\u0000-\u001f\u007f]{1,512}$/u;
const MAX=BigInt(Number.MAX_SAFE_INTEGER);
const no=(kind,extra={})=>Object.freeze({
 schemaVersion:COMMERCE_PORTONE_CANCEL_SET_AUDIT_V1.schemaVersion,
 kind,readOnly:true,recordedSetSelfConsistent:false,
 authenticatedProviderGetObserved:false,observedProviderSetMatched:false,
 postGetDbSnapshotStable:false,
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
    r.providerPaymentId!==head.providerPaymentId||
    typeof r.providerPaymentId!=='string'||!ID.test(r.providerPaymentId)||
    r.providerPaymentId.trim()!==r.providerPaymentId||
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
const PRIVATE_SET_AUDIT=Symbol('internal cancellation-set snapshot only');
export async function auditPortOneCancellationSetForReceiptV1(
 client,{receiptId},internalToken=undefined,
){
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
  const summary=no(sum===paid?'recorded_full_amount_set_consistent':
   'recorded_partial_amount_set_consistent',{
    recordedSetSelfConsistent:true,
    distinctRecordedCancellationItems:result.rows.length,
    recordedItemAmountMinor:sum.toString(),
    originalReceiptPaidMinor:paid.toString(),
   });
  return internalToken===PRIVATE_SET_AUDIT?
   {summary,privateRows:result.rows}:summary;
 }finally{
  if(begun)await client.query('rollback');
 }
}

/**
 * A current Provider GET may show cancellations missing from the persisted
 * ledger. Compare the COMPLETE successful item set in memory, not a sampled
 * single item. Both complete-visibility DB snapshots must stay byte-equal
 * despite the external GET. This is observation-only, never provider order,
 * legal refund, atomic Reader T2, customer ACK or permission to revoke.
 */
export async function reconcileStoredPortOneCancellationSetWithGetPrivateV1({
 dbClient,receiptId,sourceHmacSecret,apiSecret,fetchImpl,providerInspector,
}){
 if(typeof receiptId!=='string'||!UUID.test(receiptId))
  throw Error('INVALID_CANCELLATION_SET_RECONCILIATION_RECEIPT');
 const first=await auditPortOneCancellationSetForReceiptV1(
  dbClient,{receiptId},PRIVATE_SET_AUDIT,
 );
 if(!first.privateRows)return no('stored_cancellation_set_not_ready');
 const before=first.privateRows;
 if(before.length>64)
  return no('provider_get_set_capacity_exceeded');
 const head=before[0];
 let inspect=providerInspector;
 if(!inspect){
  ({inspectPortOneV2CancellationSetViaGetCandidateV1:inspect}=
    await import('../../dist/apps/api/src/portone-v2-cancellation-set-get-v1.js'));
 }
 let current;
 try{
  current=await inspect({
   providerPaymentId:head.providerPaymentId,
   originalTransactionId:head.receiptTransactionId,
   originalVerifiedPaidAmountMinor:Number(head.receiptPaidMinor),
   originalCurrency:head.receiptCurrency,
   environment:'production',sourceHmacSecret,apiSecret,fetchImpl,
  });
 }catch{
  return no('current_provider_cancel_set_get_unavailable');
 }
 if(current?.providerReadbackFromAuthenticatedGet!==true||
    current.originalPaymentMatched!==true||
    current.providerShapeConsistent!==true||
    current.providerOrderingProven!==false||
    current.legalRefundAuthority!==false||
    current.grantRevocationAuthorized!==false||
    current.writesPerformed!==false||
    current.unresolvedItemsObserved!==false||
    !Array.isArray(current.successfulItems)||
    current.successfulItems.length!==before.length||
    !Number.isSafeInteger(current.observedCancelledTotalMinor)||
    current.observedCancelledTotalMinor<0||
    current.observedCancelledTotalMinor>Number(head.receiptPaidMinor))
  return no('current_provider_cancel_set_shape_or_count_conflict');
 if((first.summary.kind==='recorded_full_amount_set_consistent'&&
     current.kind!=='full_cancel_shape_observed')||
    (first.summary.kind==='recorded_partial_amount_set_consistent'&&
     current.kind!=='partial_cancel_shape_observed')||
    current.observedCancelledTotalMinor!==Number(first.summary.recordedItemAmountMinor))
  return no('current_provider_cancel_set_total_or_status_conflict');
 const saved=new Map(before.map(r=>[
  r.cancellationIdHmac,r.exactAmountMinor,
 ]));
 const seen=new Set();
 for(const item of current.successfulItems){
  if(!item||typeof item!=='object'||
     typeof item.cancellationIdHmac!=='string'||
     !MAC.test(item.cancellationIdHmac)||
     !Number.isSafeInteger(item.exactSucceededAmountMinor)||
     item.exactSucceededAmountMinor<=0||
     seen.has(item.cancellationIdHmac)||
     saved.get(item.cancellationIdHmac)!==
       String(item.exactSucceededAmountMinor))
   return no('current_provider_cancel_item_missing_changed_or_duplicate');
  seen.add(item.cancellationIdHmac);
 }
 if(seen.size!==saved.size)
  return no('current_provider_cancel_item_missing_changed_or_duplicate');
 // The GET did not hold a DB lock: repeat complete set validation, then
 // compare every returned DB field by exact event ID without ordering rows.
 const second=await auditPortOneCancellationSetForReceiptV1(
  dbClient,{receiptId},PRIVATE_SET_AUDIT,
 );
 if(!second.privateRows||second.privateRows.length!==before.length||
    second.summary.kind!==first.summary.kind)
  return no('stored_cancel_set_changed_during_provider_get');
 const byId=new Map(second.privateRows.map(r=>[r.providerEventId,r]));
 if(byId.size!==before.length||
    before.some(row=>{
     const next=byId.get(row.providerEventId);
     return !next||
       Object.keys(next).length!==Object.keys(row).length||
       Object.keys(row).some(key=>next[key]!==row[key]);
    }))
  return no('stored_cancel_set_changed_during_provider_get');
 return no('authenticated_current_cancel_set_matches_recorded',{
  recordedSetSelfConsistent:true,
  authenticatedProviderGetObserved:true,observedProviderSetMatched:true,
  postGetDbSnapshotStable:true,
  matchedCancellationItems:before.length,
  matchedCancellationAmountMinor:first.summary.recordedItemAmountMinor,
 });
}
