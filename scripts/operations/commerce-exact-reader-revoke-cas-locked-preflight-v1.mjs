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

export const COMMERCE_REVOKE_READER_S1_SCOPES_SQL_V1=`
select distinct
 a.subject_id::text as "subjectId",
 a.official_reading_id::text as "officialReadingId",
 a.reader_character_id as "readerCharacterId",
 e.resolved_receipt_id::text as "receiptId",
 receipt.purchase_intent_id::text as "purchaseIntentId"
from public.commerce_provider_events e
join public.commerce_receipts receipt
 on receipt.id=e.resolved_receipt_id
 and receipt.subject_id=e.resolved_subject_id
 and receipt.provider=e.provider and receipt.environment=e.environment
 and receipt.external_transaction_id=e.external_transaction_id
 and receipt.external_transaction_id=e.external_original_transaction_id
 and receipt.verification_status in ('verified','revoked')
join public.entitlement_grants g
 on g.id=$2::uuid
 and g.source_receipt_id=receipt.id
 and g.subject_id=receipt.subject_id
 and g.grant_source_type='purchase'
join public.standard_reading_reader_access_grants a
 on a.entitlement_grant_id=g.id
 and a.subject_id=g.subject_id
 and a.purchase_intent_id=receipt.purchase_intent_id
where e.id=$1::uuid and e.provider='portone_v2'
 and e.environment='production'
 and e.status in ('verified','processed')
 and e.resolution_source_type='receipt'
 and e.event_type in ('Transaction.Cancelled','Transaction.PartialCancelled')
 and a.official_reading_id is not null
 and a.reader_character_id is not null
order by a.subject_id,a.official_reading_id,a.reader_character_id,
 e.resolved_receipt_id,receipt.purchase_intent_id
limit 65
`.trim();

export const COMMERCE_ACQUIRE_READER_S1_SCOPE_SQL_V1=`
select public.internal_acquire_official_reader_scope_lock_v1(
 $1::uuid,$2::uuid,$3::text
)
`.trim();

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DEC=/^(0|[1-9][0-9]*)$/u;
const ORDER=/^[^\u0000-\u001f\u007f]{1,512}$/u;
const inputValid=(v)=>typeof v==='string'&&UUID.test(v);
const revisionValid=v=>typeof v==='string'&&DEC.test(v);
const keyValid=v=>v===null||(typeof v==='string'&&ORDER.test(v)&&v.trim()===v);
const readerValid=v=>typeof v==='string'&&v.length>0&&v.length<=256&&
 v.trim()===v&&!/[\\u0000-\\u001f\\u007f]/u.test(v);
function scopeIdentity(r){
 if(!inputValid(r.subjectId)||!inputValid(r.officialReadingId)||
    !inputValid(r.receiptId)||!inputValid(r.purchaseIntentId)||
    !readerValid(r.readerCharacterId))
  throw Error('INVALID_READER_S1_SCOPE_EVIDENCE');
 return JSON.stringify([r.subjectId,r.officialReadingId,r.readerCharacterId,
  r.receiptId,r.purchaseIntentId]);
}

const hold=(kind,more={})=>Object.freeze({
 schemaVersion:COMMERCE_READER_REVOKE_LOCK_CAS_PREFLIGHT_V1.schemaVersion,
 kind,readerS1ScopesLocked:false,sourceEventLocked:false,exactReaderGrantLocked:false,
 revisionProven:false,providerOrderingComparable:false,
 readerT2LockHeld:false,refundFinalityProven:false,
 legalRevocationAuthorized:false,grantRevocationAuthorized:false,
 entitlementEffectInvoked:false,writesPerformed:false,
 ...more,
});

/**
 * Acquire every existing Reader S1 advisory scope, in canonical sorted order,
 * BEFORE row-locking the exact Provider Event and its original Reader Grant.
 * READ COMMITTED is required by the existing S1/S2 Reader writers; a fresh
 * scope query after lock wait rejects scope insert/delete/rebind races.
 * All locks and CAS are bounded to one transaction and ROLLBACK.
 *
 * No caller-supplied Subject/Receipt/Reader can redirect the locked Grant.
 * The actual apply function is never invoked because its provider-order
 * comparator, legal/delivery evidence and Reader R2/T2 lock are not admitted.
 */
export async function inspectLockedReaderRevokeCasPreflightV1(client,{
 providerEventId,entitlementGrantId,expectedReceiptId,
 expectedGrantRevision,expectedLastProviderOrderingKey,
}){
 if(!inputValid(providerEventId)||!inputValid(entitlementGrantId)||
    (expectedReceiptId!==undefined&&!inputValid(expectedReceiptId))||
    !revisionValid(expectedGrantRevision)||!keyValid(expectedLastProviderOrderingKey))
  throw Error('INVALID_READER_REVOKE_CAS_PREFLIGHT_INPUT');
 let began=false;
 try{
  await client.query('begin isolation level read committed');
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

  // Discover scopes without row locks, then acquire the canonical S1 keys
  // BEFORE the existing Provider Event -> Grant row-lock order (S2/T2).
  const discover=await client.query(COMMERCE_REVOKE_READER_S1_SCOPES_SQL_V1,
   [providerEventId,entitlementGrantId]);
  if(discover.rows.length===0)return hold('exact_reader_scope_not_found');
  if(discover.rows.length>64)return hold('reader_s1_scope_limit_exceeded');
  const ordered=discover.rows.map(scopeIdentity);
  if(new Set(ordered).size!==ordered.length)
   throw Error('DUPLICATE_READER_S1_SCOPE_EVIDENCE');
  // SQL orders by the same database collation as the existing S2 dispatcher.
  // JavaScript lexical ordering is not a safe substitute for DB text collation.
  if(discover.rows.some(scope=>
    expectedReceiptId!==undefined&&scope.receiptId!==expectedReceiptId))
   return hold('reader_s1_scope_or_receipt_changed');
  const originalScope=discover.rows[0];
  if(discover.rows.some(scope=>
    scope.subjectId!==originalScope.subjectId||
    scope.receiptId!==originalScope.receiptId||
    scope.purchaseIntentId!==originalScope.purchaseIntentId))
   throw Error('AMBIGUOUS_READER_S1_PURCHASE_LINEAGE');

  for(const scope of discover.rows){
   await client.query(COMMERCE_ACQUIRE_READER_S1_SCOPE_SQL_V1,[
    scope.subjectId,scope.officialReadingId,scope.readerCharacterId,
   ]);
  }
  // A new Reader scope may have been inserted while we waited for S1.
  // We must not use the pre-wait READ COMMITTED snapshot after acquisition.
  const fresh=await client.query(COMMERCE_REVOKE_READER_S1_SCOPES_SQL_V1,
   [providerEventId,entitlementGrantId]);
  if(fresh.rows.length!==discover.rows.length||
     fresh.rows.some((scope,i)=>scopeIdentity(scope)!==ordered[i]))
   return hold('reader_s1_scopes_changed_during_lock');

  const s1Locked={readerS1ScopesLocked:true};
  const source=await client.query(COMMERCE_REVOKE_SOURCE_EVENT_LOCK_SQL_V1,
   [providerEventId]);
  if(source.rows.length===0)return hold('exact_cancellation_event_not_found');
  if(source.rows.length!==1)throw Error('REVOKE_SOURCE_EVENT_AMBIGUOUS');
  const e=source.rows[0];
  if(e.providerEventId!==providerEventId||
     !inputValid(e.receiptId)||!inputValid(e.subjectId)||
     !inputValid(e.purchaseIntentId))
   throw Error('INVALID_REVOKE_SOURCE_EVENT_EVIDENCE');
  const sourceLocked={...s1Locked,sourceEventLocked:true};
  if(expectedReceiptId!==undefined&&e.receiptId!==expectedReceiptId)
   return hold('exact_cancellation_receipt_scope_changed',sourceLocked);
  if(e.receiptId!==originalScope.receiptId||
     e.subjectId!==originalScope.subjectId||
     e.purchaseIntentId!==originalScope.purchaseIntentId)
   return hold('reader_s1_lineage_changed_under_lock',sourceLocked);

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
  // After the Event and exact Grant row locks, reject changed Reader binding.
  // In particular a concurrent direct writer that ignores S1 cannot silently
  // redirect the currently purchased Reader scope.
  const afterRows=await client.query(COMMERCE_REVOKE_READER_S1_SCOPES_SQL_V1,
   [providerEventId,entitlementGrantId]);
  if(afterRows.rows.length!==ordered.length||
     afterRows.rows.some((scope,i)=>scopeIdentity(scope)!==ordered[i]))
   return hold('reader_s1_scopes_changed_after_grant_lock',sourceLocked);
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
