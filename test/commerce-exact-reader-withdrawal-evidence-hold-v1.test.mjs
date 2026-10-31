import {describe,it,expect,vi} from 'vitest';
import {
 COMMERCE_EXACT_READER_PURCHASED_UNIT_SQL_V1 as SCOPE_SQL,
 COMMERCE_EXACT_READER_NOTICE_RELATION_PROBE_SQL_V1 as NOTICE_PROBE_SQL,
 COMMERCE_EXACT_READER_STAGED_NOTICE_UNIT_SQL_V1 as NOTICE_UNIT_SQL,
 COMMERCE_EXACT_READER_WITHDRAWAL_EVIDENCE_HOLD_V1 as CONFIG,
 inspectExactReaderWithdrawalEvidenceHoldV1 as inspect,
} from '../scripts/operations/commerce-exact-reader-withdrawal-evidence-hold-v1.mjs';
import {prepareDigitalReadingWithdrawalReviewV1} from
 '../apps/api/src/commerce-digital-reading-withdrawal-review-preflight-v1.js';
import {createPostgresDigitalReadingWithdrawalEvidencePrivateV1} from
 '../apps/api/src/postgres-digital-reading-withdrawal-evidence-private-v1.js';

const RECEIPT='00000000-0000-4000-8000-000000000006';
const EVENT='00000000-0000-4000-8000-000000000091';
const GRANT='00000000-0000-4000-8000-000000000002';
const SUBJECT='00000000-0000-4000-8000-000000000004';
const INTENT='00000000-0000-4000-8000-000000000005';
const UNIT='00000000-0000-4000-8000-000000000008';
const OFFICIAL='00000000-0000-4000-8000-000000000007';
const BUNDLE='standard-reader-bundle-v1';
const BUNDLE_ID='00000000-0000-4000-8000-000000000055';
const SCOPE={
 providerEventId:EVENT,receiptId:RECEIPT,subjectId:SUBJECT,
 purchaseIntentId:INTENT,grantId:GRANT,grantRevision:'3',
 lastProviderOrderingKey:null,grantStatus:'active',
 officialReadingId:OFFICIAL,readerCharacterId:'seyeon',
 readerContentBundleId:BUNDLE_ID,
};
const UNIT_ROW={
 unitId:UNIT,purchaseIntentId:INTENT,subjectId:SUBJECT,
 readerCharacterId:'seyeon',readerContentBundleId:BUNDLE_ID,
};
const PURCHASE={
 subjectId:SUBJECT,purchaseIntentId:INTENT,unitId:UNIT,
 productSpecVersion:BUNDLE,
};
const NOTICE={
 purchaseIntentId:INTENT,unitId:UNIT,productSpecVersion:BUNDLE,
 noticeRevision:'legal-approved-v1',
 previewOrInformationRevision:'approved-preview-v1',
};
const INPUT={
 dbClient:null,receiptId:RECEIPT,providerEventId:EVENT,
 entitlementGrantId:GRANT,expectedGrantRevision:'3',
 expectedLastProviderOrderingKey:null,
 withdrawalReason:'change_of_mind',
};
const VERIFIED={
 kind:'exact_reader_locked_cas_consistent_but_authority_held',
 exactProviderEventInStoredSet:true,authenticatedProviderSetMatched:true,
 postGetDbSnapshotStable:true,exactReaderGrantLockedAndCasChecked:true,
 grantRevocationAuthorized:false,refundExecutionAuthorized:false,
 entitlementEffectInvoked:false,writesPerformed:false,
 readerT2LockHeld:false,legalRefundAuthority:false,
 providerOrderingProven:false,
};
function db({
 scope=[SCOPE],purchase=[PURCHASE],notice=[NOTICE],
 noticeInstalled=true,unitRows=[UNIT_ROW],role={
 readOnly:true,completeVisibility:true,currentUser:'postgres',
},errorSql=null}={}){
 const calls=[];
 const query=vi.fn(async(sql,params)=>{
  calls.push({sql,params});
  if(sql===errorSql)throw Error('PRIVATE_DB_SECRET_ERROR');
  if(sql==='begin isolation level repeatable read read only'||
     sql==="set local statement_timeout='10000ms'"||sql==='rollback')
   return {rows:[]};
  if(sql.includes('pg_catalog.pg_roles'))return {rows:[role]};
  if(sql===SCOPE_SQL){
   expect(params).toEqual([EVENT,GRANT,RECEIPT]);
   return {rows:scope};
  }
  if(sql===NOTICE_PROBE_SQL)
   return {rows:[{noticeInstalled}]};
  if(sql===NOTICE_UNIT_SQL){
   expect(params).toEqual([INTENT,SUBJECT,'seyeon',BUNDLE_ID]);
   return {rows:unitRows};
  }
  if(sql.includes('presentation.unit_id::text as "unitId"')){
   expect(params).toEqual([INTENT,SUBJECT,UNIT]);
   return {rows:purchase};
  }
  if(sql.includes('from public.digital_reading_checkout_notice_presentations_v1 p')){
   expect(params).toEqual([INTENT,SUBJECT,UNIT,BUNDLE]);
   return {rows:notice};
  }
  throw Error('UNEXPECTED_DB_SQL');
 });
 return {calls,query};
}
const actualReviewer=async(client,identity)=>{
 const port=createPostgresDigitalReadingWithdrawalEvidencePrivateV1(client);
 let noticeEvidenceObserved=false;
 const result=await prepareDigitalReadingWithdrawalReviewV1({
  resolvedSubjectId:identity.subjectId,
  request:{
   purchaseIntentId:identity.purchaseIntentId,unitId:identity.unitId,
   reason:identity.reason,
  },
  evidencePort:{
   readOwnedVerifiedPurchase:input=>port.readOwnedVerifiedPurchase(input),
   readCheckoutNotice:async(purchase)=>{
    const row=await port.readCheckoutNotice(purchase);
    noticeEvidenceObserved=!!row&&row.authority==='server_checkout_snapshot'&&
     row.acknowledged===true&&row.purchaseIntentId===purchase.purchaseIntentId&&
     row.unitId===purchase.unitId&&
     row.productSpecVersion===purchase.productSpecVersion;
    return row;
   },
   readDeliveryEvidence:purchase=>port.readDeliveryEvidence(purchase),
  },
 });
 return {...result,noticeEvidenceObserved};
};
const call=(client,extra={})=>inspect({
 ...INPUT,dbClient:client,
 currentSetLockedInspector:async()=>VERIFIED,
 withdrawalReviewer:actualReviewer,...extra,
});
function safe(v){
 expect(v).toMatchObject({
  durableConsumerDeliveryProven:false,legalDecisionAuthorized:false,
  providerOrderingProven:false,readerT2LockHeld:false,
  providerRefundAuthorized:false,grantRevocationAuthorized:false,
  requestRecorded:false,entitlementEffectInvoked:false,writesPerformed:false,
 });
 for(const id of [RECEIPT,EVENT,GRANT,SUBJECT,INTENT,UNIT,OFFICIAL]){
  expect(JSON.stringify(v)).not.toContain(id);
 }
}
describe('P4 exact purchased Reader withdrawal notice and delivery HOLD',()=>{
 it('is internal read-only and uses exact Event, Receipt and Reader Grant to resolve server-owned unit',()=>{
  expect(CONFIG).toMatchObject({
   productionMounted:false,publicRouteMounted:false,
   requestPersistenceEnabled:false,providerRefundEnabled:false,
   deliveryAuthorityAvailable:false,legalDecisionAuthorityAvailable:false,
  });
  expect(SCOPE_SQL).toContain('egrant.id=$2::uuid');
  expect(SCOPE_SQL).toContain('receipt.id=$3::uuid');
  expect(SCOPE_SQL).toContain('event.id=$1::uuid');
  expect(SCOPE_SQL).toContain('access.entitlement_grant_id=egrant.id');
  expect(SCOPE_SQL).not.toContain('digital_reading_checkout_notice_presentations_v1');
  expect(NOTICE_UNIT_SQL).toContain('presentation.unit_id::text as "unitId"');
  expect(NOTICE_PROBE_SQL).toContain('to_regclass(');
  expect(SCOPE_SQL).toContain('selection.reader_character_id=access.reader_character_id');
  expect(SCOPE_SQL).not.toMatch(/\b(insert|delete|update|commit)\s+(?:into\s+)?public\./iu);
 });
 it('observes exact verified purchase+acknowledged notice, but never invents durable delivery',async()=>{
  const client=db(),r=await call(client);
  expect(r).toMatchObject({
   kind:'exact_reader_statutory_review_only',
   exactReaderLockedCasPreviouslyObserved:true,
   exactPurchasedUnitBound:true,
   checkoutNoticeEvidenceAvailable:true,
   reviewClassification:'evidence_review_required',
  });
  expect(client.calls.filter(x=>x.sql==='rollback')).toHaveLength(1);
  expect(client.calls.find(x=>x.sql===SCOPE_SQL)).toBeDefined();
  expect(client.calls.map(x=>x.sql)).not.toContain('commit');
  safe(r);
 });
 it('uses the real TypeScript evidence adapter without requiring prebuilt dist files',async()=>{
  const client=db();
  const r=await call(client,{withdrawalReviewer:actualReviewer});
  expect(r.kind).toBe('exact_reader_statutory_review_only');
  expect(r.checkoutNoticeEvidenceAvailable).toBe(true);
  safe(r);
 });
 it.each([
  ['duplicate_charge','statutory_exception_review'],
  ['not_as_described','statutory_exception_review'],
  ['unprovided_separable_part','separable_part_review'],
  ['delivery_failed','statutory_exception_review'],
 ])('classifies %s as manual %s without refund authorization',async(reason,classification)=>{
  const r=await call(db(),{withdrawalReason:reason});
  expect(r.reviewClassification).toBe(classification);
  safe(r);
 });
 it('missing presentation is not considered proof of exact purchased unit',async()=>{
  const c=db({unitRows:[]}),reviewer=vi.fn();
  const r=await call(c,{withdrawalReviewer:reviewer});
  expect(r.kind).toBe('exact_unit_checkout_presentation_missing');
  expect(r.exactPurchasedUnitBound).toBe(false);
  expect(r.checkoutNoticeEvidenceAvailable).toBe(false);
  expect(reviewer).not.toHaveBeenCalled();
  safe(r);
 });
 it.each([
  ['different Event',{providerEventId:'00000000-0000-4000-8000-000000000099'}],
  ['different original Receipt',{receiptId:'00000000-0000-4000-8000-000000000099'}],
  ['different Reader Grant',{grantId:'00000000-0000-4000-8000-000000000099'}],
  ['changed Grant revision',{grantRevision:'4'}],
  ['different last provider ordering key',{lastProviderOrderingKey:'opaque-other'}],
  ['missing Official Reading',{officialReadingId:null}],
  ['bad Reader name',{readerCharacterId:' other '}],
 ])('rejects %s rather than reading unrelated notice authority',async(_label,override)=>{
  const client=db({scope:[{...SCOPE,...override}]}),reviewer=vi.fn();
  const r=await call(client,{withdrawalReviewer:reviewer});
  expect(r.kind).toBe('exact_reader_purchase_or_cas_changed_after_lock');
  expect(reviewer).not.toHaveBeenCalled();
  safe(r);
 });
 it('missing and ambiguous Reader grants are indistinguishable HOLDs',async()=>{
  for(const rows of [[],[SCOPE,SCOPE]]){
   const client=db({scope:rows}),reviewer=vi.fn();
   const r=await call(client,{withdrawalReviewer:reviewer});
   expect(r.kind).toBe('exact_purchased_reader_unit_not_proven');
   expect(reviewer).not.toHaveBeenCalled();
   expect(client.calls.at(-1).sql).toBe('rollback');
   safe(r);
  }
 });
 it('purchase without verified private checkout notice cannot assert it',async()=>{
  const client=db({notice:[]});
  const r=await call(client);
  expect(r).toMatchObject({
   kind:'exact_reader_statutory_review_only',
   checkoutNoticeEvidenceAvailable:false,
   durableConsumerDeliveryProven:false,
  });
  safe(r);
 });
 it('unverified purchase/other unit never reaches a legal review decision',async()=>{
  for(const purchase of [
   [],[{...PURCHASE,subjectId:'00000000-0000-4000-8000-000000000099'}],
  ]){
   const client=db({purchase});
   const r=await call(client);
   expect(r.kind).toBe('exact_unit_notice_or_purchase_authority_missing');
   safe(r);
  }
 });
 it('refuses to consult notice database if authenticated GET/Reader CAS is not established',async()=>{
  const c=db(),reviewer=vi.fn();
  const r=await call(c,{
   currentSetLockedInspector:async()=>({...VERIFIED,
    kind:'exact_reader_locked_cas_or_source_changed',
    exactReaderGrantLockedAndCasChecked:false}),
   withdrawalReviewer:reviewer,
  });
  expect(r.kind).toBe('current_provider_or_exact_reader_lock_not_ready');
  expect(c.query).not.toHaveBeenCalled();
  expect(reviewer).not.toHaveBeenCalled();
  safe(r);
 });
 it('a fake elevated legal/refund/grant input is rejected',async()=>{
  const c=db();
  await expect(call(c,{currentSetLockedInspector:async()=>({
   ...VERIFIED,grantRevocationAuthorized:true,
  })})).rejects.toThrow('UNSAFE_CURRENT_SET_LOCK_REVIEW_RESULT');
  expect(c.query).not.toHaveBeenCalled();
 });
 it('rejects a forged preflight refund approval and sanitizes raw review errors',async()=>{
  const c=db();
  await expect(call(c,{withdrawalReviewer:async()=>({
   kind:'manual_review_candidate',requestRecorded:true,
   providerRefundAuthorized:true,entitlementMutationAuthorized:true,
   review:{classification:'restriction_review_candidate'},
  })})).rejects.toThrow('EXACT_READER_PRIVATE_WITHDRAWAL_EVIDENCE_UNAVAILABLE');
  expect(c.calls.at(-1).sql).toBe('rollback');
 });
 it('never treats a claimed delivered notice as legally established without a durable delivery source',async()=>{
  const client=db();
  const r=await call(client,{withdrawalReviewer:async()=>({
   kind:'manual_review_candidate',requestRecorded:false,
   providerRefundAuthorized:false,entitlementMutationAuthorized:false,
   noticeEvidenceObserved:true,
   review:{classification:'restriction_review_candidate',
    automaticDenialAuthorized:false,providerRefundAuthorized:false,
    entitlementMutationAuthorized:false},
  })});
  expect(r.kind).toBe('delivery_provenance_not_available');
  expect(r.checkoutNoticeEvidenceAvailable).toBe(false);
  safe(r);
 });
 it('fails closed for incomplete operations visibility and never reads purchase SQL',async()=>{
  const c=db({role:{readOnly:true,completeVisibility:false,currentUser:'postgres'}});
  await expect(call(c)).rejects.toThrow('EXACT_READER_PRIVATE_WITHDRAWAL_EVIDENCE_UNAVAILABLE');
  expect(c.calls.some(x=>x.sql===SCOPE_SQL)).toBe(false);
  expect(c.calls.at(-1).sql).toBe('rollback');
 });
 it('fails closed and scrubs a failing private DB query',async()=>{
  const c=db({errorSql:SCOPE_SQL});
  await expect(call(c)).rejects.toThrow('EXACT_READER_PRIVATE_WITHDRAWAL_EVIDENCE_UNAVAILABLE');
  expect(c.calls.at(-1).sql).toBe('rollback');
 });
 it('rejects unknown reason, invalid ids or injection before querying anything',async()=>{
  for(const overrides of [
   {withdrawalReason:'immediate_refund'},
   {receiptId:'other'}, {providerEventId:'not-uuid'},
   {entitlementGrantId:'not-uuid'}, {expectedGrantRevision:'-3'},
   {expectedLastProviderOrderingKey:'foo\nbar'},
  ]){
   const c=db();
   await expect(call(c,overrides)).rejects.toThrow('INVALID');
   expect(c.query).not.toHaveBeenCalled();
  }
 });
});

describe('P4 historical PG17 fixture intentionally lacks staged notice tables',()=>{
 it('HOLDs exact paid Reader when staged checkout schema is absent; never accesses missing relation',async()=>{
  const client=db({noticeInstalled:false});
  const reviewer=vi.fn();
  const result=await call(client,{withdrawalReviewer:reviewer});
  expect(result).toMatchObject({
   kind:'exact_unit_checkout_presentation_schema_not_installed',
   exactReaderLockedCasPreviouslyObserved:true,
   exactPurchasedUnitBound:false,checkoutNoticeEvidenceAvailable:false,
   durableConsumerDeliveryProven:false,
   grantRevocationAuthorized:false,writesPerformed:false,
  });
  expect(client.calls.some(x=>x.sql===SCOPE_SQL)).toBe(true);
  expect(client.calls.some(x=>x.sql===NOTICE_PROBE_SQL)).toBe(true);
  expect(client.calls.some(x=>x.sql===NOTICE_UNIT_SQL)).toBe(false);
  expect(client.calls.filter(x=>x.sql==='rollback')).toHaveLength(1);
  expect(reviewer).not.toHaveBeenCalled();
  safe(result);
 });
 it('cannot treat missing, duplicate or cross-Reader staged presentations as purchased-unit evidence',async()=>{
  for(const units of [
   [],
   [UNIT_ROW,UNIT_ROW],
   [{...UNIT_ROW,subjectId:'00000000-0000-4000-8000-000000000099'}],
   [{...UNIT_ROW,readerCharacterId:'other'}],
   [{...UNIT_ROW,readerContentBundleId:'00000000-0000-4000-8000-000000000099'}],
   [{...UNIT_ROW,unitId:'not-a-uuid'}],
  ]){
   const client=db({unitRows:units}),reviewer=vi.fn();
   const result=await call(client,{withdrawalReviewer:reviewer});
   expect(result.exactPurchasedUnitBound).toBe(false);
   expect(result.checkoutNoticeEvidenceAvailable).toBe(false);
   expect(result.grantRevocationAuthorized).toBe(false);
   expect(reviewer).not.toHaveBeenCalled();
   expect(client.calls.filter(x=>x.sql==='rollback')).toHaveLength(1);
   safe(result);
  }
 });
 it('validates immutable Reader bundle identity before checking whether staging exists',async()=>{
  const client=db({
   scope:[{...SCOPE,readerContentBundleId:'not-uuid'}],
   noticeInstalled:false,
  });
  const result=await call(client);
  expect(result.kind).toBe('exact_reader_purchase_or_cas_changed_after_lock');
  expect(client.calls.some(x=>x.sql===NOTICE_PROBE_SQL)).toBe(false);
  expect(client.calls.some(x=>x.sql===NOTICE_UNIT_SQL)).toBe(false);
  safe(result);
 });
});
