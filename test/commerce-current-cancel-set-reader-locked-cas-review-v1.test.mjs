import {createHmac} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {inspectPortOneV2CancellationSetViaGetCandidateV1 as inspectCurrentSet}
 from '../apps/api/src/portone-v2-cancellation-set-get-v1.js';
import {
 COMMERCE_CURRENT_CANCEL_SET_READER_LOCKED_CAS_V1 as CONFIG,
 inspectCurrentCancelSetExactReaderLockedCasReviewV1 as inspect,
} from '../scripts/operations/commerce-current-cancel-set-reader-locked-cas-review-v1.mjs';
import {
 COMMERCE_PORTONE_CANCEL_SET_AUDIT_SQL_V1 as SET_SQL,
} from '../scripts/operations/commerce-portone-cancellation-set-ledger-audit-v1.mjs';
import {
 COMMERCE_REVOKE_SOURCE_EVENT_LOCK_SQL_V1 as EVENT_SQL,
 COMMERCE_REVOKE_EXACT_READER_GRANT_LOCK_SQL_V1 as GRANT_SQL,
} from '../scripts/operations/commerce-exact-reader-revoke-cas-locked-preflight-v1.mjs';
import {
 COMMERCE_EXACT_READER_REVOCATION_ORDER_SQL_V1 as ORDER_SQL,
} from '../scripts/operations/commerce-exact-reader-revocation-order-preflight-v1.mjs';

const RECEIPT='00000000-0000-4000-8000-000000000006';
const EVENT='00000000-0000-4000-8000-000000000091';
const GRANT='00000000-0000-4000-8000-000000000002';
const SUBJECT='00000000-0000-4000-8000-000000000004';
const INTENT='00000000-0000-4000-8000-000000000005';
const P='payment-exact-source',T='transaction-original',C='cancel-8900';
const SECRET='private-source-hmac-secret-with-more-than-32-bytes';
const API='private-portone-api-secret-with-more-than-16-bytes';
const H=(id)=>'hmac-sha256:k1:'+createHmac('sha256',SECRET).update(
 JSON.stringify(['portone-cancellation-item-v1',P,id]),'utf8',
).digest('hex');
const MAC=x=>'hmac-sha256:k1:'+x.repeat(64);
const INPUT={
 receiptId:RECEIPT,providerEventId:EVENT,entitlementGrantId:GRANT,
 expectedGrantRevision:'3',expectedLastProviderOrderingKey:null,
 sourceHmacSecret:SECRET,apiSecret:API,
};
const DB_ROW={
 receiptId:RECEIPT,receiptSubjectId:SUBJECT,receiptTransactionId:T,
 receiptProvider:'portone_v2',receiptEnvironment:'production',
 receiptStatus:'verified',receiptPaidMinor:'8900',receiptCurrency:'KRW',
 providerPaymentId:P,providerEventId:EVENT,
 eventType:'Transaction.Cancelled',eventStatus:'verified',
 eventProvider:'portone_v2',eventEnvironment:'production',
 eventSubjectId:SUBJECT,eventResolutionSource:'receipt',
 eventTransactionId:T,eventOriginalTransactionId:T,
 signedEventHmac:MAC('a'),providerOrderingKey:null,
 verifierRevision:'portone-cancel-readback-v2',
 sourceSchema:'commerce-portone-cancellation-source-v2',
 sourceEventType:'Transaction.Cancelled',
 sourceSignedHmac:MAC('a'),sourceReadbackHmac:MAC('b'),
 cancellationIdHmac:H(C),cancellationStatus:'SUCCEEDED',
 exactAmountMinor:'8900',firstObservedCumulativeMinor:'8900',
 sourcePaidMinor:'8900',sourceCurrency:'KRW',orderingProven:'false',
 refundExecutionAuthorized:'false',revocationAuthorized:'false',
};
const PAYMENT={
 id:P,transactionId:T,version:'V2',currency:'KRW',
 channel:{type:'LIVE'},status:'CANCELLED',
 amount:{paid:8900,cancelled:8900},
 cancellations:[{id:C,status:'SUCCEEDED',totalAmount:8900}],
};
const EVIDENCE={
 providerEventId:EVENT,receiptId:RECEIPT,receiptSubjectId:SUBJECT,
 grantId:GRANT,grantSourceReceiptId:RECEIPT,grantSubjectId:SUBJECT,
 grantRevision:'3',grantLastProviderOrderingKey:null,grantStatus:'active',
 sameEventEffectCount:'0',sameEventRevokedCount:'0',
 providerEventType:'Transaction.Cancelled',
 cancelEvidenceSchema:'commerce-portone-cancellation-source-v2',
 cancelEvidenceStatus:'SUCCEEDED',cancelEvidenceIdHmac:H(C),
 receiptPaidMinor:'8900',receiptCurrency:'KRW',
 exactSucceededCancellationAmountMinor:'8900',
 observedCumulativeCancelledAmountMinor:'8900',
 cancelEvidenceOriginalPaidAmountMinor:'8900',cancelEvidenceCurrency:'KRW',
 eventProviderOrderingKey:null,
};
const get=()=>vi.fn(async()=>new Response(JSON.stringify(PAYMENT),{
 status:200,headers:{'content-type':'application/json'},
}));
function db({setRows=[DB_ROW],setAfter=null,eventRows=[
 {providerEventId:EVENT,receiptId:RECEIPT,subjectId:SUBJECT,purchaseIntentId:INTENT},
],grantRows=[
 {grantId:GRANT,grantRevision:'3',lastProviderOrderingKey:null,grantStatus:'active'},
],evidenceRows=[EVIDENCE],roleChange=false}={}){
 const calls=[];let setReads=0,mode='read';
 const query=vi.fn(async(sql,args)=>{
  calls.push({sql,args});
  if(sql==='begin isolation level serializable'){mode='write';return {rows:[]};}
  if(sql==='begin isolation level repeatable read read only'){mode='read';return {rows:[]};}
  if(sql.includes('pg_catalog.pg_roles'))return {rows:[mode==='write'?
   {writable:true,completeVisibility:true,currentUser:'postgres'}:
   {readOnly:true,completeVisibility:!roleChange||setReads===0,currentUser:'postgres'}]};
  if(sql===SET_SQL){
   setReads++;
   expect(args).toEqual([RECEIPT]);
   return {rows:setReads===2&&setAfter!==null?setAfter:setRows};
  }
  if(sql===EVENT_SQL){
   expect(args).toEqual([EVENT]);
   return {rows:eventRows};
  }
  if(sql===GRANT_SQL){
   expect(args).toEqual([GRANT,RECEIPT,SUBJECT,INTENT]);
   return {rows:grantRows};
  }
  if(sql===ORDER_SQL){
   expect(args).toEqual([EVENT,GRANT]);
   return {rows:evidenceRows};
  }
  if(sql==='rollback'||sql.startsWith('set local '))return {rows:[]};
  throw Error('UNEXPECTED_DB_COMMAND');
 });
 return {calls,query};
}
const run=(client,overrides={})=>inspect({
 dbClient:client,...INPUT,fetchImpl:get(),
 providerInspector:inspectCurrentSet,...overrides,
});
const expectedNoEffect=result=>{
 expect(result).toMatchObject({
  providerOrderingProven:false,
  currentProviderFinalityProven:false,legalRefundAuthority:false,
  readerT2LockHeld:false,grantRevocationAuthorized:false,
  refundExecutionAuthorized:false,
  entitlementEffectInvoked:false,writesPerformed:false,
 });
 for(const secret of [SUBJECT,P,T,C,RECEIPT,EVENT,GRANT,SECRET,API,H(C)])
  expect(JSON.stringify(result)).not.toContain(secret);
};

describe('P4 authenticated entire cancellation set -> exact Reader Event/Grant locked CAS HOLD',()=>{
 it('combines real GET verification, Event membership and locked exact Grant CAS but NEVER performs an effect',async()=>{
  const c=db(),fetchImpl=get();
  const result=await run(c,{fetchImpl});
  expect(CONFIG).toMatchObject({
   productionMounted:false,publicRouteMounted:false,
   providerRefundEnabled:false,entitlementEffectEnabled:false,
   providerOrderingComparatorBound:false,readerT2LinearizationBound:false,
  });
  expect(result).toMatchObject({
   kind:'exact_reader_locked_cas_consistent_but_authority_held',
   exactProviderEventInStoredSet:true,
   authenticatedProviderSetMatched:true,
   postGetDbSnapshotStable:true,
   exactReaderGrantLockedAndCasChecked:true,
   sourceOrderClassification:'INCOMPARABLE',
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(c.calls.filter(x=>x.sql===SET_SQL)).toHaveLength(2);
  expect(c.calls.filter(x=>x.sql==='rollback')).toHaveLength(3);
  expect(c.calls.filter(x=>x.sql===EVENT_SQL)).toHaveLength(1);
  expect(c.calls.filter(x=>x.sql===GRANT_SQL)).toHaveLength(1);
  expect(c.calls.findIndex(x=>x.sql===GRANT_SQL))
   .toBeGreaterThan(c.calls.findIndex(x=>x.sql===EVENT_SQL));
  expect(c.calls.findIndex(x=>x.sql===EVENT_SQL))
   .toBeGreaterThan(c.calls.map(x=>x.sql).lastIndexOf(SET_SQL));
  expect(c.calls.map(x=>x.sql)).not.toContain('commit');
  expectedNoEffect(result);
 });
 it('rejects a candidate event missing from the recorded successful set BEFORE GET or locks',async()=>{
  const c=db({setRows:[{...DB_ROW,providerEventId:'00000000-0000-4000-8000-000000000099'}]});
  const fetchImpl=get();
  const result=await run(c,{fetchImpl});
  expect(result.kind).toBe('current_cancel_set_or_exact_event_not_ready');
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(c.calls.some(x=>x.sql===EVENT_SQL)).toBe(false);
  expectedNoEffect(result);
 });
 it('rejects unrelated cancelled receipt after locking source Event, before locking another Reader Grant',async()=>{
  const c=db({eventRows:[{
   providerEventId:EVENT,receiptId:'00000000-0000-4000-8000-000000000099',
   subjectId:SUBJECT,purchaseIntentId:INTENT,
  }]});
  const result=await run(c);
  expect(result.kind).toBe('exact_reader_locked_cas_or_source_changed');
  expect(c.calls.some(x=>x.sql===GRANT_SQL)).toBe(false);
  expect(c.calls.filter(x=>x.sql==='rollback')).toHaveLength(3);
  expectedNoEffect(result);
 });
 it('rechecks live grant revision inside locks, not an earlier GET snapshot',async()=>{
  const c=db({grantRows:[{
   grantId:GRANT,grantRevision:'4',lastProviderOrderingKey:null,grantStatus:'active',
  }]});
  const result=await run(c);
  expect(result.kind).toBe('exact_reader_locked_cas_or_source_changed');
  expect(result.exactReaderGrantLockedAndCasChecked).toBe(false);
  expect(c.calls.some(x=>x.sql===ORDER_SQL)).toBe(false);
  expectedNoEffect(result);
 });
 it('requires exact Reader Grant; never substitutes another paid Reader Grant',async()=>{
  const c=db({grantRows:[]});
  const result=await run(c);
  expect(result.kind).toBe('exact_reader_locked_cas_or_source_changed');
  expect(result.exactReaderGrantLockedAndCasChecked).toBe(false);
  expectedNoEffect(result);
 });
 it('does not allow cumulative full payment from a partial exact cancel item to revoke',async()=>{
  const c=db({evidenceRows:[{...EVIDENCE,
   exactSucceededCancellationAmountMinor:'3000',
   providerEventType:'Transaction.PartialCancelled',
  }]});
  const result=await run(c);
  expect(result).toMatchObject({
   kind:'exact_reader_locked_cas_consistent_but_authority_held',
   exactReaderGrantLockedAndCasChecked:true,
   sourceOrderClassification:'INCOMPARABLE',
   grantRevocationAuthorized:false,
  });
  expectedNoEffect(result);
 });
 it('even non-null Provider ordering key lacks an approved semantic comparator',async()=>{
  const c=db({evidenceRows:[{...EVIDENCE,
   eventProviderOrderingKey:'opaque-key-from-provider',
  }]});
  const result=await run(c);
  expect(result.kind).toBe('exact_reader_locked_cas_consistent_but_authority_held');
  expect(result.sourceOrderClassification).toBe('INCOMPARABLE');
  expectedNoEffect(result);
 });
 it('SAME replay is observed only via an actual same-event revoked Entitlement Effect',async()=>{
  const c=db({grantRows:[{
   grantId:GRANT,grantRevision:'3',lastProviderOrderingKey:null,grantStatus:'revoked',
  }],evidenceRows:[{...EVIDENCE,grantStatus:'revoked',
   sameEventEffectCount:'1',sameEventRevokedCount:'1',
  }]});
  const result=await run(c);
  expect(result.kind).toBe('existing_exact_event_revoke_replay_observed');
  expect(result.sourceOrderClassification).toBe('SAME');
  expect(result.grantRevocationAuthorized).toBe(false);
  expectedNoEffect(result);
 });
 it('must not execute DB locks when authentication GET returns an error',async()=>{
  const c=db(),fetchImpl=vi.fn(async()=>new Response('unavailable',{status:503}));
  const result=await run(c,{fetchImpl});
  expect(result.kind).toBe('current_cancel_set_or_exact_event_not_ready');
  expect(c.calls.some(x=>x.sql===EVENT_SQL)).toBe(false);
  expectedNoEffect(result);
 });
 it('rejects elevation attempts from a forged stored-set result',async()=>{
  const c=db(),lockedCasInspector=vi.fn();
  const result=await run(c,{
   storedSetInspector:async()=>({
    kind:'authenticated_current_cancel_set_matches_recorded',
    recordedSetSelfConsistent:true,authenticatedProviderGetObserved:true,
    observedProviderSetMatched:true,postGetDbSnapshotStable:true,
    exactProviderEventIncluded:true,providerOrderingProven:true,
    currentProviderStateVerified:true,grantRevocationAuthorized:true,
    providerRefundAuthorized:true,writesPerformed:true,
   }),
   lockedCasInspector,
  });
  expect(result.kind).toBe('current_cancel_set_or_exact_event_not_ready');
  expect(lockedCasInspector).not.toHaveBeenCalled();
  expectedNoEffect(result);
 });
 it('rejects an elevated locked CAS result even when source set appeared valid',async()=>{
  const c=db();
  await expect(run(c,{lockedCasInspector:async()=>({
   kind:'trusted_provider_order_missing',sourceEventLocked:true,
   exactReaderGrantLocked:true,revisionProven:true,
   grantRevocationAuthorized:true,entitlementEffectInvoked:true,
   writesPerformed:true,readerT2LockHeld:true,providerOrderingComparable:true,
   legalRevocationAuthorized:true,refundFinalityProven:true,
  })})).rejects.toThrow('UNSAFE_READER_LOCK_PREFLIGHT_AUTHORITY_RESULT');
 });
 it('rejects invalid IDs, mismatched revision and opaque bad ordering key before DB',async()=>{
  for(const overrides of [
   {receiptId:'bad'}, {providerEventId:'bad'},
   {entitlementGrantId:'bad'}, {expectedGrantRevision:'-1'},
   {expectedLastProviderOrderingKey:'newline\ninjection'},
  ]){
   const c=db();
   await expect(run(c,overrides)).rejects.toThrow('INVALID');
   expect(c.query).not.toHaveBeenCalled();
  }
 });
});
