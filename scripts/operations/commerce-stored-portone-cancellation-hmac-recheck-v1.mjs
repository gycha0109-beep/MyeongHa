// Commerce P4: exact stored source-v2 cancellation -> authenticated PortOne GET.
// Operations-only, no public route, no refund POST and no Grant mutations.
export const COMMERCE_STORED_PORTONE_CANCEL_HMAC_RECHECK_V1=Object.freeze({
 schemaVersion:'commerce-stored-portone-cancellation-hmac-recheck-v1',
 productionMounted:false,publicRouteMounted:false,readOnly:true,
 sourceOrderAuthority:false,legalRefundAuthority:false,
 entitlementEffectEnabled:false,readerT2LockHeld:false,
});
export const COMMERCE_STORED_PORTONE_CANCEL_HMAC_SOURCE_SQL_V1=`
select
 event.id::text as "providerEventId",
 event.event_type as "eventType",
 event.status as "eventStatus",
 event.provider_ordering_key as "eventProviderOrderingKey",
 event.payload_fingerprint as "eventSignedHmac",
 event.verified_payload_jsonb->>'schemaVersion' as "sourceSchema",
 event.verified_payload_jsonb->>'signedPayloadHmac' as "sourceSignedHmac",
 event.verified_payload_jsonb->>'providerReadbackHmac' as "sourceReadbackHmac",
 event.verified_payload_jsonb->>'cancellationIdHmac' as "cancellationIdHmac",
 event.verified_payload_jsonb->>'matchingCancellationStatus' as "sourceCancellationStatus",
 event.verified_payload_jsonb->>'exactSucceededCancellationAmountMinor' as "sourceExactAmountMinor",
 event.verified_payload_jsonb->>'observedCumulativeCancelledAmountMinor' as "sourceInitialCumulativeMinor",
 event.verified_payload_jsonb->>'originalReceiptPaidAmountMinor' as "sourcePaidMinor",
 event.verified_payload_jsonb->>'currency' as "sourceCurrency",
 event.verified_payload_jsonb->>'orderingProven' as "sourceOrderingProven",
 event.verified_payload_jsonb->>'refundExecutionAuthorized' as "sourceRefundAuthorized",
 event.verified_payload_jsonb->>'entitlementRevocationAuthorized' as "sourceRevokeAuthorized",
 receipt.external_transaction_id as "originalTransactionId",
 receipt.verified_amount_minor::text as "receiptPaidMinor",
 receipt.verified_currency as "receiptCurrency",
 receipt.verification_status as "receiptVerificationStatus",
 attempt.provider_request_id as "providerPaymentId",
 g.id::text as "exactReaderGrantId",
 g.status as "grantStatus",
 g.revision::text as "grantRevision",
 g.last_provider_ordering_key as "grantLastProviderOrderingKey"
from public.commerce_provider_events event
join public.commerce_receipts receipt
 on receipt.id=event.resolved_receipt_id
 and receipt.subject_id=event.resolved_subject_id
 and receipt.provider=event.provider
 and receipt.environment=event.environment
 and receipt.external_transaction_id=event.external_transaction_id
 and receipt.external_transaction_id=event.external_original_transaction_id
 and receipt.verification_status in ('verified','revoked')
 and receipt.verified_at is not null
 and receipt.verified_amount_minor>0
join public.purchase_intents intent
 on intent.id=receipt.purchase_intent_id
 and intent.subject_id=receipt.subject_id
 and intent.product_offer_id=receipt.product_offer_id
 and intent.status='verified'
 and intent.expected_amount_minor=receipt.verified_amount_minor
 and intent.expected_currency=receipt.verified_currency
join public.product_offers offer
 on offer.id=intent.product_offer_id
join public.products product
 on product.id=offer.product_id
 and product.product_type='reading'
join public.standard_reading_product_specs spec
 on spec.product_id=product.id
 and spec.purchase_unit_mode='topic_reader_reading'
join public.purchase_intent_reader_selections selection
 on selection.purchase_intent_id=intent.id
 and selection.product_id=product.id
join public.commerce_payment_attempts attempt
 on attempt.purchase_intent_id=intent.id
 and attempt.subject_id=intent.subject_id
 and attempt.product_offer_id=intent.product_offer_id
 and attempt.provider=event.provider
 and attempt.environment=event.environment
 and attempt.provider_transaction_id=receipt.external_transaction_id
 and attempt.status='response_received'
join public.entitlement_grants g
 on g.id=$2::uuid
 and g.subject_id=receipt.subject_id
 and g.source_receipt_id=receipt.id
 and g.grant_source_type='purchase'
join public.standard_reading_reader_access_grants access
 on access.entitlement_grant_id=g.id
 and access.subject_id=g.subject_id
 and access.purchase_intent_id=intent.id
where event.id=$1::uuid
 and event.provider='portone_v2'
 and event.environment='production'
 and event.event_type in ('Transaction.Cancelled','Transaction.PartialCancelled')
 and event.status in ('verified','processed')
 and event.resolution_source_type='receipt'
 and event.verifier_revision='portone-cancel-readback-v2'
limit 2
`.trim();

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ID=/^[^\u0000-\u001f\u007f]{1,512}$/u;
const MAC=/^hmac-sha256:k1:[0-9a-f]{64}$/u;
const MONEY=/^[1-9][0-9]*$/u;
const CURRENCY=/^[A-Z]{3}$/u;
const REVISION=/^(0|[1-9][0-9]*)$/u;
const ORDER=/^[^\u0000-\u001f\u007f]{1,512}$/u;
const MAX=BigInt(Number.MAX_SAFE_INTEGER);
const no=(kind,more={})=>Object.freeze({
 schemaVersion:COMMERCE_STORED_PORTONE_CANCEL_HMAC_RECHECK_V1.schemaVersion,
 kind,originalReceiptBound:false,exactGrantBound:false,
 latestExactSuccessObserved:false,matchedCancellationAmountUnchanged:false,
 refundExecutionAuthorized:false,grantRevocationAuthorized:false,
 readerT2LockHeld:false,providerOrderingProven:false,
 postGetDbSnapshotStable:false,entitlementEffectInvoked:false,writesPerformed:false,
 ...more,
});
function validRow(row,providerEventId,entitlementGrantId){
 if(row.providerEventId!==providerEventId||
    row.exactReaderGrantId!==entitlementGrantId||
    !['Transaction.Cancelled','Transaction.PartialCancelled'].includes(row.eventType)||
    !['verified','processed'].includes(row.eventStatus)||
    row.sourceSchema!=='commerce-portone-cancellation-source-v2'||
    row.sourceCancellationStatus!=='SUCCEEDED'||
    !MAC.test(row.eventSignedHmac)||row.sourceSignedHmac!==row.eventSignedHmac||
    !MAC.test(row.sourceReadbackHmac)||
    !MAC.test(row.cancellationIdHmac)||
    !MONEY.test(row.sourceExactAmountMinor)||
    !MONEY.test(row.sourceInitialCumulativeMinor)||
    !MONEY.test(row.sourcePaidMinor)||!MONEY.test(row.receiptPaidMinor)||
    row.sourcePaidMinor!==row.receiptPaidMinor||
    !CURRENCY.test(row.receiptCurrency)||
    row.sourceCurrency!==row.receiptCurrency||
    !ID.test(row.providerPaymentId)||row.providerPaymentId.trim()!==row.providerPaymentId||
    !ID.test(row.originalTransactionId)||
    row.originalTransactionId.trim()!==row.originalTransactionId||
    row.sourceOrderingProven!=='false'||
    row.sourceRefundAuthorized!=='false'||
    row.sourceRevokeAuthorized!=='false'||
    !['verified','revoked'].includes(row.receiptVerificationStatus)||
    !['active','revoked','expired'].includes(row.grantStatus)||
    typeof row.grantRevision!=='string'||!REVISION.test(row.grantRevision)||
    (row.grantLastProviderOrderingKey!==null&&
      (typeof row.grantLastProviderOrderingKey!=='string'||
       !ORDER.test(row.grantLastProviderOrderingKey)||
       row.grantLastProviderOrderingKey.trim()!==row.grantLastProviderOrderingKey))||
    (row.eventProviderOrderingKey!==null&&
      (typeof row.eventProviderOrderingKey!=='string'||
       !ORDER.test(row.eventProviderOrderingKey)||
       row.eventProviderOrderingKey.trim()!==row.eventProviderOrderingKey))
   )return false;
 const paid=BigInt(row.receiptPaidMinor);
 const exact=BigInt(row.sourceExactAmountMinor);
 const cumulative=BigInt(row.sourceInitialCumulativeMinor);
 return paid<=MAX&&exact<=cumulative&&cumulative<=paid&&
  (row.eventType!=='Transaction.Cancelled'||cumulative===paid)&&
  (row.eventType!=='Transaction.PartialCancelled'||exact<paid);
}

/**
 * Read a consistent canonical source under independently verified operations
 * visibility. Reused before and after the external GET, never across the GET.
 */
async function readExactStoredSnapshot(dbClient,providerEventId,entitlementGrantId){
 let begun=false;
 try{
  await dbClient.query('begin isolation level repeatable read read only');
  begun=true;
  await dbClient.query("set local statement_timeout='10000ms'");
  const auth=await dbClient.query(`select
   current_setting('transaction_read_only')='on' as "readOnly",
   (rolsuper or rolbypassrls) as "completeVisibility"
   from pg_catalog.pg_roles where rolname=current_user`);
  if(auth.rows.length!==1||auth.rows[0].readOnly!==true||
     auth.rows[0].completeVisibility!==true)
   throw Error('STORED_PORTONE_CANCEL_RECHECK_AUTHORITY_REQUIRED');
  const result=await dbClient.query(COMMERCE_STORED_PORTONE_CANCEL_HMAC_SOURCE_SQL_V1,
   [providerEventId,entitlementGrantId]);
  return result.rows;
 }finally{
  if(begun)await dbClient.query('rollback');
 }
}

/**
 * Exact Event + Reader Grant read under complete-visibility read-only snapshot.
 * A new authenticated provider GET happens only AFTER DB ROLLBACK. Comparing
 * current ID, item status, amount and monotone aggregate is useful evidence,
 * but no ordering/Legal/T2 authority is minted from this GET.
 */
export async function recheckStoredPortOneCancellationByHmacPrivateV1({
 dbClient,providerEventId,entitlementGrantId,
 sourceHmacSecret,apiSecret,fetchImpl,providerInspector,
}){
 if(typeof providerEventId!=='string'||!UUID.test(providerEventId)||
    typeof entitlementGrantId!=='string'||!UUID.test(entitlementGrantId))
  throw Error('INVALID_STORED_PORTONE_CANCEL_RECHECK_INPUT');
 const rows=await readExactStoredSnapshot(dbClient,providerEventId,entitlementGrantId);
 if(rows.length===0)return no('exact_stored_event_reader_grant_not_found');
 if(rows.length!==1)throw Error('AMBIGUOUS_STORED_PORTONE_CANCEL_SOURCE');
 const row=rows[0];
 if(!validRow(row,providerEventId,entitlementGrantId))
  return no('stored_source_v2_provenance_inconsistent');
 const linked={originalReceiptBound:true,exactGrantBound:true};
 let inspect=providerInspector;
 if(!inspect){
  ({inspectPortOneV2CancellationViaGetCandidateV1:inspect}=
    await import('../../dist/apps/api/src/portone-v2-cancellation-readback-get-v1.js'));
 }
 let current;
 try{
  current=await inspect({
   providerPaymentId:row.providerPaymentId,
   originalTransactionId:row.originalTransactionId,
   originalVerifiedPaidAmountMinor:Number(row.receiptPaidMinor),
   originalCurrency:row.receiptCurrency,
   environment:'production',
   cancellationIdHmac:row.cancellationIdHmac,
   sourceHmacSecret,apiSecret,fetchImpl,
  });
 }catch{return no('current_provider_get_unavailable',linked);}
 if(!current||current.providerReadbackFromAuthenticatedGet!==true||
    current.originalPaymentMatched!==true||
    current.matchedCancellationIdObserved!==true||
    current.shapeConsistent!==true||
    current.refundExecutionAuthorized!==false||
    current.entitlementRevocationAuthorized!==false||
    !Number.isSafeInteger(current.observedCancelledTotalMinor)||
    current.observedCancelledTotalMinor<0||
    current.observedCancelledTotalMinor>Number(row.receiptPaidMinor))
  return no('current_provider_shape_inconsistent',linked);
 if(current.observedMatchingCancellationStatus!=='SUCCEEDED'||
    !Number.isSafeInteger(current.observedMatchingSucceededCancellationMinor)||
    current.observedMatchingSucceededCancellationMinor<=0)
  return no('exact_stored_cancel_no_longer_succeeded',linked);
 if(current.observedMatchingSucceededCancellationMinor!==
    Number(row.sourceExactAmountMinor))
  return no('exact_stored_cancel_amount_conflict',linked);
 if(current.observedCancelledTotalMinor<Number(row.sourceInitialCumulativeMinor))
  return no('provider_cumulative_cancel_regressed',linked);
 if(row.eventType==='Transaction.Cancelled'&&
    current.kind!=='full_cancel_shape_observed')
  return no('full_cancellation_no_longer_observed',linked);
 if(row.eventType==='Transaction.PartialCancelled'&&
    !['partial_cancel_shape_observed','full_cancel_shape_observed'].includes(current.kind))
  return no('partial_cancellation_no_longer_observed',linked);

 // An external GET does not freeze the local Reader Grant. Re-open a second
 // independent read-only snapshot after GET and reject ANY changed source,
 // Receipt, payment handoff or Grant revision/order/status before reporting
 // matching evidence. This is NOT an atomic T2 lock, comparator or revoke.
 const after=await readExactStoredSnapshot(dbClient,providerEventId,entitlementGrantId);
 if(after.length!==1||
    !validRow(after[0],providerEventId,entitlementGrantId)||
    Object.keys(row).length!==Object.keys(after[0]).length||
    Object.keys(row).some(key=>after[0][key]!==row[key]))
  return no('stored_source_or_grant_changed_during_provider_get',linked);
 return no('same_exact_cancellation_success_reobserved',{
  ...linked,latestExactSuccessObserved:true,
  matchedCancellationAmountUnchanged:true,postGetDbSnapshotStable:true,
 });
}
