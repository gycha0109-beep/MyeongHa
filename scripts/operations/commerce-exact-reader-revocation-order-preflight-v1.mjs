// Watchtower-Track: commerce-payment
// Complete-visibility private, read-only EXACT Reader revocation preflight.
// This is not a T2 linearization point, provider ordering authority or
// permission to call internal_apply_entitlement_effect_v1.
export const COMMERCE_EXACT_READER_REVOCATION_ORDER_SQL_V1 = `
select
  event.id::text as "providerEventId",
  event.event_type as "providerEventType",
  event.status as "providerEventStatus",
  event.resolved_receipt_id::text as "resolvedReceiptId",
  event.resolved_subject_id::text as "resolvedSubjectId",
  event.external_transaction_id as "eventTransactionId",
  event.external_original_transaction_id as "eventOriginalTransactionId",
  event.provider_ordering_key as "eventProviderOrderingKey",
  receipt.id::text as "receiptId",
  receipt.subject_id::text as "receiptSubjectId",
  receipt.external_transaction_id as "receiptTransactionId",
  receipt.verified_amount_minor::text as "receiptPaidMinor",
  receipt.verified_currency as "receiptCurrency",
  event.verified_payload_jsonb->>'schemaVersion' as "cancelEvidenceSchema",
  event.verified_payload_jsonb->>'matchingCancellationStatus' as "cancelEvidenceStatus",
  event.verified_payload_jsonb->>'cancellationIdHmac' as "cancelEvidenceIdHmac",
  event.verified_payload_jsonb->>'exactSucceededCancellationAmountMinor'
    as "exactSucceededCancellationAmountMinor",
  event.verified_payload_jsonb->>'observedCumulativeCancelledAmountMinor'
    as "observedCumulativeCancelledAmountMinor",
  event.verified_payload_jsonb->>'originalReceiptPaidAmountMinor'
    as "cancelEvidenceOriginalPaidAmountMinor",
  event.verified_payload_jsonb->>'currency' as "cancelEvidenceCurrency",
  g.id::text as "grantId",
  g.subject_id::text as "grantSubjectId",
  g.source_receipt_id::text as "grantSourceReceiptId",
  g.status as "grantStatus",
  g.revision::text as "grantRevision",
  g.last_provider_ordering_key as "grantLastProviderOrderingKey",
  access.official_reading_id::text as "officialReadingId",
  access.reader_character_id as "readerCharacterId",
  (
    select count(*)::text
    from public.entitlement_events effect
    where effect.grant_id=g.id and effect.subject_id=g.subject_id
      and effect.source_type='provider_event'
      and effect.source_provider_event_id=event.id
  ) as "sameEventEffectCount",
  (
    select count(*)::text
    from public.entitlement_events effect
    where effect.grant_id=g.id and effect.subject_id=g.subject_id
      and effect.source_type='provider_event'
      and effect.source_provider_event_id=event.id
      and effect.event_type='revoked' and effect.target_status='revoked'
  ) as "sameEventRevokedCount",
  (
    select count(*)::text
    from public.standard_reading_reader_access_grants other_access
    join public.entitlement_grants other_g
      on other_g.id=other_access.entitlement_grant_id
     and other_g.subject_id=other_access.subject_id
    where other_access.official_reading_id=access.official_reading_id
      and other_access.subject_id=access.subject_id
      and other_access.entitlement_grant_id<>access.entitlement_grant_id
      and other_g.status='active'
  ) as "otherActiveReaderPurchaseGrants"
from public.commerce_provider_events event
join public.commerce_receipts receipt
  on receipt.id=event.resolved_receipt_id
 and receipt.subject_id=event.resolved_subject_id
 and receipt.provider=event.provider
 and receipt.environment=event.environment
 and receipt.verification_status in ('verified','revoked')
 and receipt.external_transaction_id=event.external_transaction_id
 and receipt.external_transaction_id=event.external_original_transaction_id
 and receipt.verified_amount_minor>0
 and receipt.verified_currency~'^[A-Z]{3}$'
join public.entitlement_grants g
  on g.id=$2::uuid
 and g.source_receipt_id=receipt.id
 and g.subject_id=receipt.subject_id
 and g.grant_source_type='purchase'
join public.standard_reading_reader_access_grants access
  on access.entitlement_grant_id=g.id
 and access.subject_id=g.subject_id
 and access.purchase_intent_id=receipt.purchase_intent_id
where event.id=$1::uuid
 and event.provider='portone_v2'
 and event.environment='production'
 and event.event_type in (
   'Transaction.Cancelled','Transaction.PartialCancelled',
   'Transaction.CancelPending'
 )
 and event.status in ('verified','processed')
 and event.resolution_source_type='receipt'
limit 2
`.trim();

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const COUNT=/^(0|[1-9][0-9]*)$/u;
const ORDER=/^[^\u0000-\u001f\u007f]{1,512}$/u;
const TYPES=new Set([
 'Transaction.Cancelled','Transaction.PartialCancelled',
 'Transaction.CancelPending',
]);

const hold=(kind,overrides={})=>Object.freeze({
 schemaVersion:'commerce-exact-reader-revocation-order-preflight-v1',
 kind,sourceOrderClassification:'INCOMPARABLE',
 readerPurchaseBound:false,sameEventReplayObserved:false,
 otherActiveReaderPurchaseGrants:null,
 refundFinalityProven:false,refundExecutionAuthorized:false,
 readerT2LockHeld:false,grantRevocationAuthorized:false,
 entitlementEffectInvoked:false,writesPerformed:false,
 ...overrides,
});
export const COMMERCE_EXACT_READER_REVOCATION_ORDER_PREFLIGHT_V1=Object.freeze({
 productionMounted:false,publicRouteMounted:false,readOnly:true,
 providerOrderComparatorBound:false,
 readerT2LinearizationBound:false,
 entitlementEffectEnabled:false,refundEnabled:false,
});

const validNullableOrder=v=>v===null||
 (typeof v==='string'&&ORDER.test(v)&&v.trim()===v);
const count=v=>typeof v==='string'&&COUNT.test(v);
const uuid=v=>typeof v==='string'&&UUID.test(v);

/**
 * Private operations inspection for one exact event+Grant pair.
 * No provider-order token is trusted as a business sequence merely because
 * it is a non-empty string. A SAME replay requires an *actual same-source*
 * Entitlement Effect and a revoked Grant, not equal string ordering keys.
 * No NEWER/STALE claim exists until the independent verified provider adapter
 * and Reader T2 locking/Legal outcome contract are implemented.
 */
export async function inspectExactReaderRevocationOrderPreflightV1(
 client,{providerEventId,entitlementGrantId},
){
 if(!uuid(providerEventId)||!uuid(entitlementGrantId))
  throw Error('INVALID_EXACT_READER_REVOCATION_PREFLIGHT_INPUT');
 let begun=false;
 try{
  await client.query('begin isolation level repeatable read read only');
  begun=true;
  await client.query("set local statement_timeout='10000ms'");
  const authority=await client.query(`select
   current_setting('transaction_read_only')='on' as "readOnly",
   (rolsuper or rolbypassrls) as "completeVisibility"
   from pg_catalog.pg_roles where rolname=current_user`);
  if(authority.rows.length!==1||
     authority.rows[0].readOnly!==true||
     authority.rows[0].completeVisibility!==true)
   throw Error('EXACT_READER_REVOCATION_PREFLIGHT_AUTHORITY_REQUIRED');
  const result=await client.query(COMMERCE_EXACT_READER_REVOCATION_ORDER_SQL_V1,
   [providerEventId,entitlementGrantId]);
  if(result.rows.length===0)return hold('exact_reader_purchase_not_found');
  if(result.rows.length!==1)throw Error('AMBIGUOUS_EXACT_READER_REVOCATION');
  const r=result.rows[0];
  if(r.providerEventId!==providerEventId||
     r.grantId!==entitlementGrantId||
     !uuid(r.resolvedReceiptId)||!uuid(r.resolvedSubjectId)||
     !uuid(r.receiptId)||!uuid(r.receiptSubjectId)||
     !uuid(r.grantSubjectId)||!uuid(r.grantSourceReceiptId)||
     r.resolvedReceiptId!==r.receiptId||
     r.resolvedSubjectId!==r.receiptSubjectId||
     r.receiptSubjectId!==r.grantSubjectId||
     r.receiptId!==r.grantSourceReceiptId||
     typeof r.receiptTransactionId!=='string'||
     !ORDER.test(r.receiptTransactionId)||
     r.eventTransactionId!==r.receiptTransactionId||
     r.eventOriginalTransactionId!==r.receiptTransactionId||
     !TYPES.has(r.providerEventType)||
     !['verified','processed'].includes(r.providerEventStatus)||
     !['active','revoked','expired'].includes(r.grantStatus)||
     !count(r.grantRevision)||
     !count(r.receiptPaidMinor)||r.receiptPaidMinor==='0'||
     typeof r.receiptCurrency!=='string'||
     !/^[A-Z]{3}$/u.test(r.receiptCurrency)||
     !uuid(r.officialReadingId)||
     typeof r.readerCharacterId!=='string'||
     r.readerCharacterId.length===0||
     r.readerCharacterId.trim()!==r.readerCharacterId||
     !validNullableOrder(r.eventProviderOrderingKey)||
     !validNullableOrder(r.grantLastProviderOrderingKey)||
     !count(r.sameEventEffectCount)||
     !count(r.sameEventRevokedCount)||
     !count(r.otherActiveReaderPurchaseGrants))
   throw Error('INVALID_EXACT_READER_REVOCATION_EVIDENCE');

  const effects=BigInt(r.sameEventEffectCount);
  const revokes=BigInt(r.sameEventRevokedCount);
  if(effects>1n||revokes>effects)
   return hold('same_event_effect_provenance_conflict',{
    readerPurchaseBound:true,
    otherActiveReaderPurchaseGrants:r.otherActiveReaderPurchaseGrants,
   });

  const linked={
   readerPurchaseBound:true,
   otherActiveReaderPurchaseGrants:r.otherActiveReaderPurchaseGrants,
  };
  if(effects===1n){
   if(revokes===1n&&r.grantStatus==='revoked')
    return hold('exact_event_revocation_replay_observed',{
     ...linked,sourceOrderClassification:'SAME',
     sameEventReplayObserved:true,
    });
   return hold('same_event_effect_provenance_conflict',linked);
  }
  if(r.grantStatus==='revoked'||r.grantStatus==='expired')
   return hold('grant_not_active_for_revocation',linked);
  if(r.providerEventType==='Transaction.CancelPending')
   return hold('provider_cancellation_pending',linked);
  if(r.providerEventType==='Transaction.PartialCancelled')
   return hold('partial_cancellation_scope_review_required',linked);
  // A cumulative CANCELLED payment can contain multiple separate partial
  // cancellation items. Only the exact item amount (NOT the aggregate) may
  // enter an eventual Reader revoke review. Nothing authorizes a revoke here.
  if(r.cancelEvidenceSchema!=='commerce-portone-cancellation-source-v2'||
     r.cancelEvidenceStatus!=='SUCCEEDED'||
     typeof r.cancelEvidenceIdHmac!=='string'||
     !/^hmac-sha256:k1:[0-9a-f]{64}$/u.test(r.cancelEvidenceIdHmac)||
     !count(r.exactSucceededCancellationAmountMinor)||
     !count(r.observedCumulativeCancelledAmountMinor)||
     r.cancelEvidenceOriginalPaidAmountMinor!==r.receiptPaidMinor||
     r.cancelEvidenceCurrency!==r.receiptCurrency)
   return hold('exact_cancellation_amount_evidence_missing',linked);
  const paid=BigInt(r.receiptPaidMinor);
  const individual=BigInt(r.exactSucceededCancellationAmountMinor);
  const cumulative=BigInt(r.observedCumulativeCancelledAmountMinor);
  if(individual===0n||individual>cumulative||cumulative>paid||
     (r.providerEventType==='Transaction.Cancelled'&&cumulative!==paid))
   return hold('exact_cancellation_amount_evidence_inconsistent',linked);
  if(individual!==paid)
   return hold('cumulative_payment_cancel_does_not_prove_single_item_full',linked);
  if(r.eventProviderOrderingKey===null)
   return hold('provider_order_provenance_missing',linked);
  // The mere presence/equality of lexical keys does not compare provider time.
  return hold('provider_order_incomparable',linked);
 }finally{
  if(begun)await client.query('rollback');
 }
}
