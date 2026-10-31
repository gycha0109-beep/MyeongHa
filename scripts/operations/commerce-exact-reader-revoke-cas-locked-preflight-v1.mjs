// Commerce Payment P4: private Provider Event -> exact Reader Grant lock/CAS
// rehearsal only. NO Entitlement Effect, T2, refund or consumer HTTP route.
import {COMMERCE_EXACT_READER_REVOCATION_ORDER_SQL_V1}
 from './commerce-exact-reader-revocation-order-preflight-v1.mjs';

export const COMMERCE_READER_REVOKE_LOCK_CAS_PREFLIGHT_V1=Object.freeze({
 schemaVersion:'commerce-exact-reader-revoke-lock-cas-preflight-v1',
 productionMounted:false,publicRouteMounted:false,
 grantMutationEnabled:false,entitlementEffectEnabled:false,
 refundExecutionEnabled:false,readerT2LinearizationBound:false,
 providerOrderingComparatorBound:false,
});

export const COMMERCE_REVOKE_SOURCE_EVENT_LOCK_SQL_V1=`
select
 e.id::text as "providerEventId",
 e.resolved_receipt_id::text as "receiptId",
 e.resolved_subject_id::text as "subjectId",
 r.purchase_intent_id::text as "purchaseIntentId"
from public.commerce_provider_events e
join public.commerce_receipts r
 on r.id=e.resolved_receipt_id and r.subject_id=e.resolved_subject_id
 and r.provider=e.provider and r.environment=e.environment
 and r.verification_status in ('verified','revoked')
 and r.external_transaction_id=e.external_transaction_id
 and r.external_transaction_id=e.external_original_transaction_id
where e.id=$1::uuid
 and e.provider='portone_v2' and e.environment='production'
 and e.status in ('verified','processed')
 and e.resolution_source_type='receipt'
 and e.event_type in ('Transaction.Cancelled','Transaction.PartialCancelled')
for update of e
`.trim();

export const COMMERCE_REVOKE_EXACT_READER_GRANT_LOCK_SQL_V1=`
select
 g.id::text as "grantId",
 g.revision::text as "grantRevision",
 g.last_provider_ordering_key as "lastProviderOrderingKey",
 g.status as "grantStatus"
from public.entitlement_grants g
join public.standard_reading_reader_access_grants access
 on access.entitlement_grant_id=g.id and access.subject_id=g.subject_id
 and access.purchase_intent_id=$4::uuid
where g.id=$1::uuid
 and g.source_receipt_id=$2::uuid
 and g.subject_id=$3::uuid
 and g.grant_source_type='purchase'
for update of g
`.trim();

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DEC=/^(0|[1-9][0-9]*)$/u;
const ORDER=/^[^\u0000-\u001f\u007f]{1,512}$/u;
const inputValid=(v)=>typeof v==='string'&&UUID.test(v);
const revisionValid=v=>typeof v==='string'&&DEC.test(v);
const keyValid=v=>v===null||(typeof v==='string'&&ORDER.test(v)&&v.trim()===v);

const hold=(kind,more={})=>Object.freeze({
 schemaVersion:COMMERCE_READER_REVOKE_LOCK_CAS_PREFLIGHT_V1.schemaVersion,
 kind,sourceEventLocked:false,exactReaderGrantLocked:false,
 revisionProven:false,providerOrderingComparable:false,
 readerT2LockHeld:false,refundFinalityProven:false,
 legalRevocationAuthorized:false,grantRevocationAuthorized:false,
 entitlementEffectInvoked:false,writesPerformed:false,
 ...more,
});

/**
 * Serializes an exact existing Provider Event then its exact Reader Grant,
 * in the same relative row-lock order used by internal_apply_entitlement_effect_v1.
 * Locks and CAS are bounded to one SERIALIZABLE transaction and rolled back.
 *
 * No caller-supplied Subject/Receipt/Reader can redirect the locked Grant.
 * The actual apply function is never invoked because its provider-order
 * comparator, legal/delivery evidence and Reader R2/T2 lock are not admitted.
 */
export async function inspectLockedReaderRevokeCasPreflightV1(client,{
 providerEventId,entitlementGrantId,
 expectedGrantRevision,expectedLastProviderOrderingKey,
}){
 if(!inputValid(providerEventId)||!inputValid(entitlementGrantId)||
    !revisionValid(expectedGrantRevision)||!keyValid(expectedLastProviderOrderingKey))
  throw Error('INVALID_READER_REVOKE_CAS_PREFLIGHT_INPUT');
 let began=false;
 try{
  await client.query('begin isolation level serializable');
  began=true;
  await client.query("set local statement_timeout='10000ms'");
  await client.query("set local lock_timeout='3000ms'");
  const auth=await client.query(`select
    current_setting('transaction_read_only')='off' as "writable",
    (rolsuper or rolbypassrls) as "completeVisibility",
    current_user as "currentUser"
    from pg_catalog.pg_roles where rolname=current_user`);
  if(auth.rows.length!==1||auth.rows[0].writable!==true||
     auth.rows[0].completeVisibility!==true||
     ['anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_worker_runtime','myeongha_commerce_internal_executor'
     ].includes(auth.rows[0].currentUser))
   throw Error('PRIVATE_READER_REVOKE_CAS_AUTHORITY_REQUIRED');

  const source=await client.query(COMMERCE_REVOKE_SOURCE_EVENT_LOCK_SQL_V1,
   [providerEventId]);
  if(source.rows.length===0)return hold('exact_cancellation_event_not_found');
  if(source.rows.length!==1)throw Error('REVOKE_SOURCE_EVENT_AMBIGUOUS');
  const e=source.rows[0];
  if(e.providerEventId!==providerEventId||
     !inputValid(e.receiptId)||!inputValid(e.subjectId)||
     !inputValid(e.purchaseIntentId))
   throw Error('INVALID_REVOKE_SOURCE_EVENT_EVIDENCE');
  const sourceLocked={sourceEventLocked:true};

  // The original paid receipt/Subject/Purchase Intent come from the locked
  // Provider Event's exact DB lineage, never from an external input.
  const exact=await client.query(COMMERCE_REVOKE_EXACT_READER_GRANT_LOCK_SQL_V1,[
   entitlementGrantId,e.receiptId,e.subjectId,e.purchaseIntentId,
  ]);
  if(exact.rows.length===0)
   return hold('exact_reader_grant_not_found',sourceLocked);
  if(exact.rows.length!==1)throw Error('REVOKE_GRANT_LOCK_AMBIGUOUS');
  const g=exact.rows[0];
  if(g.grantId!==entitlementGrantId||
     !revisionValid(g.grantRevision)||!keyValid(g.lastProviderOrderingKey)||
     !['active','revoked','expired'].includes(g.grantStatus))
   throw Error('INVALID_REVOKE_GRANT_LOCK_EVIDENCE');
  const linked={...sourceLocked,exactReaderGrantLocked:true};

  // CAS check must be made inside the locks, not from a previous HTTP or
  // standalone READ ONLY preflight. A changed revision requires a new review.
  if(g.grantRevision!==expectedGrantRevision||
     g.lastProviderOrderingKey!==expectedLastProviderOrderingKey)
   return hold('grant_cas_snapshot_changed',linked);

  const report=await client.query(
   COMMERCE_EXACT_READER_REVOCATION_ORDER_SQL_V1,
   [providerEventId,entitlementGrantId],
  );
  if(report.rows.length!==1)
   throw Error('LOCKED_READER_SOURCE_RECHECK_INCONSISTENT');
  const r=report.rows[0];
  if(r.providerEventId!==providerEventId||
     r.grantId!==entitlementGrantId||
     r.receiptId!==e.receiptId||
     r.receiptSubjectId!==e.subjectId||
     r.receiptId!==r.grantSourceReceiptId||
     r.grantSubjectId!==e.subjectId||
     r.grantRevision!==g.grantRevision||
     r.grantLastProviderOrderingKey!==g.lastProviderOrderingKey||
     r.grantStatus!==g.grantStatus)
   throw Error('LOCKED_READER_LINEAGE_CHANGED');

  const pinned={...linked,revisionProven:true};
  const seen=BigInt(r.sameEventEffectCount||'-1');
  const revoked=BigInt(r.sameEventRevokedCount||'-1');
  if(seen<0n||revoked<0n||seen>1n||revoked>seen)
   return hold('exact_event_effect_conflict',pinned);
  if(seen===1n&&revoked===1n&&g.grantStatus==='revoked')
   return hold('exact_event_revoke_replay_observed',pinned);
  if(seen!==0n)
   return hold('exact_event_effect_conflict',pinned);
  if(g.grantStatus!=='active')
   return hold('grant_not_active',pinned);
  if(r.providerEventType!=='Transaction.Cancelled')
   return hold('partial_cancellation_review_required',pinned);
  if(r.cancelEvidenceSchema!=='commerce-portone-cancellation-source-v2'||
     r.cancelEvidenceStatus!=='SUCCEEDED'||
     !/^hmac-sha256:k1:[0-9a-f]{64}$/u.test(r.cancelEvidenceIdHmac??'')||
     !revisionValid(r.receiptPaidMinor)||
     !revisionValid(r.exactSucceededCancellationAmountMinor)||
     !revisionValid(r.observedCumulativeCancelledAmountMinor)||
     r.receiptPaidMinor==='0'||
     r.cancelEvidenceOriginalPaidAmountMinor!==r.receiptPaidMinor||
     r.cancelEvidenceCurrency!==r.receiptCurrency)
   return hold('exact_refund_amount_evidence_missing',pinned);
  const paid=BigInt(r.receiptPaidMinor);
  const exactMinor=BigInt(r.exactSucceededCancellationAmountMinor);
  const total=BigInt(r.observedCumulativeCancelledAmountMinor);
  if(exactMinor!==paid||total!==paid)
   return hold('single_cancel_does_not_cover_full_reader_purchase',pinned);
  if(r.eventProviderOrderingKey===null)
   return hold('trusted_provider_order_missing',pinned);

  // Even a nonempty string is not proof of NEWER. Only an approved provider
  // comparator could make that decision; no such comparator is bound yet.
  return hold('provider_order_comparator_unavailable',pinned);
 }finally{
  if(began)await client.query('rollback');
 }
}
