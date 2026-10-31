// Commerce P4: Exact cancellation Event -> Reader purchased-unit notice/delivery
// evidence HOLD. Internal operations read-only. NOT a legal disposition,
// customer claim, refund, approved delivery source or Entitlement Effect.
import {inspectCurrentCancelSetExactReaderLockedCasReviewV1} from
 './commerce-current-cancel-set-reader-locked-cas-review-v1.mjs';

export const COMMERCE_EXACT_READER_WITHDRAWAL_EVIDENCE_HOLD_V1=Object.freeze({
 schemaVersion:'commerce-exact-reader-withdrawal-evidence-hold-v1',
 productionMounted:false,publicRouteMounted:false,
 requestPersistenceEnabled:false,providerRefundEnabled:false,
 entitlementEffectEnabled:false,deliveryAuthorityAvailable:false,
 legalDecisionAuthorityAvailable:false,readerT2LinearizationBound:false,
});

export const COMMERCE_EXACT_READER_PURCHASED_UNIT_SQL_V1=`
select
 event.id::text as "providerEventId",
 receipt.id::text as "receiptId",
 receipt.subject_id::text as "subjectId",
 receipt.purchase_intent_id::text as "purchaseIntentId",
 egrant.id::text as "grantId",
 egrant.revision::text as "grantRevision",
 egrant.last_provider_ordering_key as "lastProviderOrderingKey",
 egrant.status as "grantStatus",
 access.official_reading_id::text as "officialReadingId",
 access.reader_character_id as "readerCharacterId",
 notice.unit_id::text as "unitId"
from public.commerce_provider_events event
join public.commerce_receipts receipt
 on receipt.id=event.resolved_receipt_id
 and receipt.subject_id=event.resolved_subject_id
 and receipt.provider=event.provider
 and receipt.environment=event.environment
 and receipt.external_transaction_id=event.external_transaction_id
 and receipt.external_transaction_id=event.external_original_transaction_id
 and receipt.verification_status in ('verified','revoked')
join public.purchase_intents intent
 on intent.id=receipt.purchase_intent_id
 and intent.subject_id=receipt.subject_id
 and intent.product_offer_id=receipt.product_offer_id
 and intent.status='verified'
 and intent.expected_amount_minor=receipt.verified_amount_minor
 and intent.expected_currency=receipt.verified_currency
join public.entitlement_grants egrant
 on egrant.id=$2::uuid and egrant.subject_id=receipt.subject_id
 and egrant.source_receipt_id=receipt.id and egrant.grant_source_type='purchase'
join public.standard_reading_reader_access_grants access
 on access.entitlement_grant_id=egrant.id
 and access.subject_id=egrant.subject_id
 and access.purchase_intent_id=intent.id
join public.purchase_intent_reader_selections selection
 on selection.purchase_intent_id=intent.id
 and selection.reader_character_id=access.reader_character_id
 and selection.reader_content_bundle_id=access.reader_content_bundle_id
left join public.digital_reading_checkout_notice_presentations_v1 notice
 on notice.purchase_intent_id=intent.id
 and notice.subject_id=intent.subject_id
 and notice.reader_character_id=selection.reader_character_id
 and notice.reader_content_bundle_id=selection.reader_content_bundle_id
where event.id=$1::uuid
 and receipt.id=$3::uuid
 and event.provider='portone_v2'
 and event.environment='production'
 and event.status in ('verified','processed')
 and event.resolution_source_type='receipt'
 and event.event_type in ('Transaction.Cancelled','Transaction.PartialCancelled')
limit 2
`.trim();

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REV=/^(0|[1-9][0-9]*)$/u;
const ORDER=/^[^\u0000-\u001f\u007f]{1,512}$/u;
const REASONS=new Set([
 'change_of_mind','not_provided','delivery_failed','not_as_described',
 'defect','duplicate_charge','unprovided_separable_part','other',
]);
const no=(kind,extra={})=>Object.freeze({
 schemaVersion:COMMERCE_EXACT_READER_WITHDRAWAL_EVIDENCE_HOLD_V1.schemaVersion,
 kind,exactReaderLockedCasPreviouslyObserved:false,
 exactPurchasedUnitBound:false,checkoutNoticeEvidenceAvailable:false,
 durableConsumerDeliveryProven:false,legalDecisionAuthorized:false,
 providerOrderingProven:false,readerT2LockHeld:false,
 providerRefundAuthorized:false,grantRevocationAuthorized:false,
 requestRecorded:false,entitlementEffectInvoked:false,writesPerformed:false,
 ...extra,
});

async function inspectExactPaidUnit(dbClient,{
 providerEventId,entitlementGrantId,receiptId,expectedGrantRevision,
 expectedLastProviderOrderingKey,withdrawalReason,reviewer,
}){
 let began=false;
 try{
  await dbClient.query('begin isolation level repeatable read read only');
  began=true;
  await dbClient.query("set local statement_timeout='10000ms'");
  const auth=await dbClient.query(`select
    current_setting('transaction_read_only')='on' as "readOnly",
    (rolsuper or rolbypassrls) as "completeVisibility",
    current_user as "currentUser"
    from pg_catalog.pg_roles where rolname=current_user`);
  if(auth.rows.length!==1||auth.rows[0].readOnly!==true||
     auth.rows[0].completeVisibility!==true||
     ['anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_worker_runtime','myeongha_commerce_internal_executor'
     ].includes(auth.rows[0].currentUser))
   throw Error('EXACT_READER_WITHDRAWAL_PRIVATE_VISIBILITY_REQUIRED');

  const data=await dbClient.query(COMMERCE_EXACT_READER_PURCHASED_UNIT_SQL_V1,[
   providerEventId,entitlementGrantId,receiptId,
  ]);
  if(data.rows.length!==1)
   return no('exact_purchased_reader_unit_not_proven');
  const r=data.rows[0];
  if(r.providerEventId!==providerEventId||
     r.receiptId!==receiptId||
     r.grantId!==entitlementGrantId||
     typeof r.subjectId!=='string'||!UUID.test(r.subjectId)||
     typeof r.purchaseIntentId!=='string'||!UUID.test(r.purchaseIntentId)||
     typeof r.officialReadingId!=='string'||!UUID.test(r.officialReadingId)||
     typeof r.readerCharacterId!=='string'||!r.readerCharacterId.trim()||
     r.readerCharacterId.trim()!==r.readerCharacterId||
     r.grantRevision!==expectedGrantRevision||
     r.lastProviderOrderingKey!==expectedLastProviderOrderingKey||
     !['active','revoked','expired'].includes(r.grantStatus))
   return no('exact_reader_purchase_or_cas_changed_after_lock');

  const exact={exactReaderLockedCasPreviouslyObserved:true,exactPurchasedUnitBound:true};
  if(typeof r.unitId!=='string'||!UUID.test(r.unitId))
   return no('exact_unit_checkout_presentation_missing',exact);

  // The existing private legal triage is fed exclusively from trusted DB
  // lineage; a caller cannot choose a different Subject, Intent or unit.
  const result=await reviewer(dbClient,{
   subjectId:r.subjectId,purchaseIntentId:r.purchaseIntentId,
   unitId:r.unitId,reason:withdrawalReason,
  });
  if(!result||!['not_admitted','manual_review_candidate'].includes(result.kind)||
     result.requestRecorded!==false||
     result.providerRefundAuthorized!==false||
     result.entitlementMutationAuthorized!==false)
   throw Error('UNSAFE_WITHDRAWAL_REVIEW_AUTHORITY_RESULT');
  if(result.kind==='not_admitted')
   return no('exact_unit_notice_or_purchase_authority_missing',exact);
  const decision=result.review;
  if(!decision||typeof decision.classification!=='string'||
     ![
      'restriction_review_candidate','statutory_exception_review',
      'not_proven_delivered','separable_part_review','evidence_review_required',
     ].includes(decision.classification)||
     decision.automaticDenialAuthorized!==false||
     decision.providerRefundAuthorized!==false||
     decision.entitlementMutationAuthorized!==false||
     (result.noticeEvidenceObserved!==undefined&&
      typeof result.noticeEvidenceObserved!=='boolean'))
   throw Error('UNSAFE_WITHDRAWAL_REVIEW_CLASSIFICATION');
  // No durable server delivery authority exists for this source. A
  // delivered/restriction classification is impossible from the approved
  // private port and is not accepted from injected alternate reviewers.
  if(decision.classification==='restriction_review_candidate')
   return no('delivery_provenance_not_available',exact);
  return no('exact_reader_statutory_review_only',{
   ...exact,
   reviewClassification:decision.classification,
   checkoutNoticeEvidenceAvailable:result.noticeEvidenceObserved===true,
  });
 }catch{
  throw Error('EXACT_READER_PRIVATE_WITHDRAWAL_EVIDENCE_UNAVAILABLE');
 }finally{
  if(began)await dbClient.query('rollback');
 }
}

/**
 * Orchestrates existing authenticated cancellation-set GET / 2 DB snapshots
 * / serialized exact Event->Reader Grant CAS, then rereads exact paid-unit
 * checkout evidence under a fresh READ ONLY snapshot. No locks are retained,
 * no delivery system has been approved, and the outcome ALWAYS remains HOLD.
 */
export async function inspectExactReaderWithdrawalEvidenceHoldV1({
 dbClient,receiptId,providerEventId,entitlementGrantId,
 expectedGrantRevision,expectedLastProviderOrderingKey,
 sourceHmacSecret,apiSecret,withdrawalReason,fetchImpl,
 providerInspector,currentSetLockedInspector,withdrawalReviewer,
}){
 if(!dbClient||typeof dbClient.query!=='function'||
    ![receiptId,providerEventId,entitlementGrantId].every(
     x=>typeof x==='string'&&UUID.test(x),
    )||typeof expectedGrantRevision!=='string'||!REV.test(expectedGrantRevision)||
    !(expectedLastProviderOrderingKey===null||
      (typeof expectedLastProviderOrderingKey==='string'&&
       ORDER.test(expectedLastProviderOrderingKey)&&
       expectedLastProviderOrderingKey.trim()===expectedLastProviderOrderingKey))||
    !REASONS.has(withdrawalReason))
  throw Error('INVALID_EXACT_READER_WITHDRAWAL_HOLD_INPUT');

 const verified=await (currentSetLockedInspector??
  inspectCurrentCancelSetExactReaderLockedCasReviewV1)({
  dbClient,receiptId,providerEventId,entitlementGrantId,
  expectedGrantRevision,expectedLastProviderOrderingKey,
  sourceHmacSecret,apiSecret,fetchImpl,providerInspector,
 });
 if(!verified||typeof verified.kind!=='string'||
    verified.grantRevocationAuthorized!==false||
    verified.refundExecutionAuthorized!==false||
    verified.entitlementEffectInvoked!==false||
    verified.writesPerformed!==false||
    verified.readerT2LockHeld!==false||
    verified.legalRefundAuthority!==false||
    verified.providerOrderingProven!==false)
  throw Error('UNSAFE_CURRENT_SET_LOCK_REVIEW_RESULT');
 if(verified.kind!=='exact_reader_locked_cas_consistent_but_authority_held'||
    verified.exactProviderEventInStoredSet!==true||
    verified.authenticatedProviderSetMatched!==true||
    verified.postGetDbSnapshotStable!==true||
    verified.exactReaderGrantLockedAndCasChecked!==true)
  return no('current_provider_or_exact_reader_lock_not_ready');

 let reviewer=withdrawalReviewer;
 if(!reviewer){
  const [{prepareDigitalReadingWithdrawalReviewV1},
         {createPostgresDigitalReadingWithdrawalEvidencePrivateV1}]=
    await Promise.all([
     import('../../dist/apps/api/src/commerce-digital-reading-withdrawal-review-preflight-v1.js'),
     import('../../dist/apps/api/src/postgres-digital-reading-withdrawal-evidence-private-v1.js'),
    ]);
  reviewer=async(client,identity)=>{
   const port=createPostgresDigitalReadingWithdrawalEvidencePrivateV1(client);
   let noticeEvidenceObserved=false;
   const result=await prepareDigitalReadingWithdrawalReviewV1({
    resolvedSubjectId:identity.subjectId,
    request:{
     purchaseIntentId:identity.purchaseIntentId,
     unitId:identity.unitId,reason:identity.reason,
    },
    evidencePort:{
     readOwnedVerifiedPurchase:input=>port.readOwnedVerifiedPurchase(input),
     readCheckoutNotice:async(purchase)=>{
      const notice=await port.readCheckoutNotice(purchase);
      noticeEvidenceObserved=notice!==null&&
       notice.authority==='server_checkout_snapshot'&&
       notice.acknowledged===true&&
       notice.purchaseIntentId===purchase.purchaseIntentId&&
       notice.unitId===purchase.unitId&&
       notice.productSpecVersion===purchase.productSpecVersion;
      return notice;
     },
     // Current private evidence source returns no durable delivery record.
     readDeliveryEvidence:purchase=>port.readDeliveryEvidence(purchase),
    },
   });
   return {...result,noticeEvidenceObserved};
  };
 }
 const inspected=await inspectExactPaidUnit(dbClient,{
  providerEventId,entitlementGrantId,receiptId,expectedGrantRevision,
  expectedLastProviderOrderingKey,withdrawalReason,reviewer,
 });
 return inspected;
}
