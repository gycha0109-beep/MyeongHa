import {reconcileStoredPortOneCancellationSetWithGetPrivateV1} from
 './commerce-portone-cancellation-set-ledger-audit-v1.mjs';
import {inspectLockedReaderRevokeCasPreflightV1} from
 './commerce-exact-reader-revoke-cas-locked-preflight-v1.mjs';

// Internal staged review ONLY. No public route, refund POST, revoke writer,
// legal conclusion, provider comparator or shared Reader R2/T2 lock.
export const COMMERCE_CURRENT_CANCEL_SET_READER_LOCKED_CAS_V1=Object.freeze({
 schemaVersion:'commerce-current-cancel-set-reader-locked-cas-review-v1',
 productionMounted:false,publicRouteMounted:false,
 providerRefundEnabled:false,entitlementEffectEnabled:false,
 providerOrderingComparatorBound:false,readerT2LinearizationBound:false,
});

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REV=/^(0|[1-9][0-9]*)$/u;
const KEY=/^[^\u0000-\u001f\u007f]{1,512}$/u;
const validKey=v=>v===null||
 (typeof v==='string'&&KEY.test(v)&&v.trim()===v);

const hold=(kind,extra={})=>Object.freeze({
 schemaVersion:COMMERCE_CURRENT_CANCEL_SET_READER_LOCKED_CAS_V1.schemaVersion,
 kind,exactProviderEventInStoredSet:false,
 authenticatedProviderSetMatched:false,postGetDbSnapshotStable:false,
 exactReaderGrantLockedAndCasChecked:false,
 sourceOrderClassification:'INCOMPARABLE',
 providerOrderingProven:false,
 currentProviderFinalityProven:false,
 legalRefundAuthority:false,readerT2LockHeld:false,
 grantRevocationAuthorized:false,refundExecutionAuthorized:false,
 entitlementEffectInvoked:false,writesPerformed:false,
 ...extra,
});

/**
 * Order of operations:
 *  1. Internal complete-visibility, read-only snapshots around one
 *     authenticated current GET, WITH exact candidate Event membership.
 *  2. SERIALIZABLE Event->exact Reader Grant lock/CAS rehearsal with the
 *     same Receipt ID checked against the locked source Event lineage.
 *  3. ROLLBACK. No effect writer, GET during locks or capability escalation.
 *
 * Neither observation nor a held CAS lock creates provider NEWER/STALE
 * authority, legal refund authority or shared T2 linearization.
 */
export async function inspectCurrentCancelSetExactReaderLockedCasReviewV1({
 dbClient,receiptId,providerEventId,entitlementGrantId,
 expectedGrantRevision,expectedLastProviderOrderingKey,
 sourceHmacSecret,apiSecret,fetchImpl,
 providerInspector,storedSetInspector,lockedCasInspector,
}){
 if(!dbClient||typeof dbClient.query!=='function'||
    ![receiptId,providerEventId,entitlementGrantId].every(
     x=>typeof x==='string'&&UUID.test(x),
    )||typeof expectedGrantRevision!=='string'||!REV.test(expectedGrantRevision)||
    !validKey(expectedLastProviderOrderingKey))
  throw Error('INVALID_CURRENT_CANCEL_SET_READER_LOCK_REVIEW_INPUT');
 const setCheck=await (storedSetInspector??
  reconcileStoredPortOneCancellationSetWithGetPrivateV1)({
  dbClient,receiptId,expectedProviderEventId:providerEventId,
  sourceHmacSecret,apiSecret,fetchImpl,providerInspector,
 });
 if(setCheck.kind!=='authenticated_current_cancel_set_matches_recorded'||
    setCheck.recordedSetSelfConsistent!==true||
    setCheck.authenticatedProviderGetObserved!==true||
    setCheck.observedProviderSetMatched!==true||
    setCheck.postGetDbSnapshotStable!==true||
    setCheck.exactProviderEventIncluded!==true||
    setCheck.providerOrderingProven!==false||
    setCheck.currentProviderStateVerified!==false||
    setCheck.grantRevocationAuthorized!==false||
    setCheck.providerRefundAuthorized!==false||
    setCheck.writesPerformed!==false)
  return hold('current_cancel_set_or_exact_event_not_ready');

 const observed={
  exactProviderEventInStoredSet:true,
  authenticatedProviderSetMatched:true,
  postGetDbSnapshotStable:true,
 };
 const locked=await (lockedCasInspector??
  inspectLockedReaderRevokeCasPreflightV1)(dbClient,{
  providerEventId,entitlementGrantId,expectedReceiptId:receiptId,
  expectedGrantRevision,expectedLastProviderOrderingKey,
 });
 if(!locked||typeof locked.kind!=='string'||
    locked.grantRevocationAuthorized!==false||
    locked.entitlementEffectInvoked!==false||
    locked.writesPerformed!==false||
    locked.readerT2LockHeld!==false||
    locked.providerOrderingComparable!==false||
    locked.legalRevocationAuthorized!==false||
    locked.refundFinalityProven!==false)
  throw Error('UNSAFE_READER_LOCK_PREFLIGHT_AUTHORITY_RESULT');

 if(locked.kind==='exact_event_revoke_replay_observed'&&
    locked.sourceEventLocked===true&&
    locked.exactReaderGrantLocked===true&&locked.revisionProven===true)
  return hold('existing_exact_event_revoke_replay_observed',{
   ...observed,exactReaderGrantLockedAndCasChecked:true,
   sourceOrderClassification:'SAME',
  });

 if(locked.sourceEventLocked===true&&
    locked.exactReaderGrantLocked===true&&
    locked.revisionProven===true&&
    ['trusted_provider_order_missing','provider_order_comparator_unavailable',
     'partial_cancellation_review_required',
     'single_cancel_does_not_cover_full_reader_purchase',
     'exact_refund_amount_evidence_missing'].includes(locked.kind))
  return hold('exact_reader_locked_cas_consistent_but_authority_held',{
   ...observed,exactReaderGrantLockedAndCasChecked:true,
  });
 return hold('exact_reader_locked_cas_or_source_changed',observed);
}
