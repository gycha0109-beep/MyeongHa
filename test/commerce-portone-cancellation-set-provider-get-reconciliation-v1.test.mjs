import {createHmac} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {
 COMMERCE_PORTONE_CANCEL_SET_AUDIT_SQL_V1 as SQL,
 reconcileStoredPortOneCancellationSetWithGetPrivateV1 as reconcile,
} from '../scripts/operations/commerce-portone-cancellation-set-ledger-audit-v1.mjs';
import {inspectPortOneV2CancellationSetViaGetCandidateV1 as inspect}
 from '../apps/api/src/portone-v2-cancellation-set-get-v1.js';

const SECRET='private-source-hmac-secret-with-more-than-32-bytes';
const API='private-portone-api-secret-with-more-than-16-bytes';
const P='payment-exact-source',T='transaction-original';
const R='00000000-0000-4000-8000-000000000006';
const S='00000000-0000-4000-8000-000000000004';
const A='cancellation-3000',B='cancellation-5900';
const MAC=n=>'hmac-sha256:k1:'+n.repeat(64);
const H=id=>'hmac-sha256:k1:'+createHmac('sha256',SECRET)
 .update(JSON.stringify(['portone-cancellation-item-v1',P,id]),'utf8')
 .digest('hex');
const FIRST={
 receiptId:R,receiptSubjectId:S,receiptTransactionId:T,
 receiptProvider:'portone_v2',receiptEnvironment:'production',
 receiptStatus:'verified',receiptPaidMinor:'8900',receiptCurrency:'KRW',
 providerPaymentId:P,
 providerEventId:'00000000-0000-4000-8000-000000000091',
 eventType:'Transaction.PartialCancelled',eventStatus:'verified',
 eventProvider:'portone_v2',eventEnvironment:'production',
 eventSubjectId:S,eventResolutionSource:'receipt',
 eventTransactionId:T,eventOriginalTransactionId:T,
 signedEventHmac:MAC('a'),providerOrderingKey:null,
 verifierRevision:'portone-cancel-readback-v2',
 sourceSchema:'commerce-portone-cancellation-source-v2',
 sourceEventType:'Transaction.PartialCancelled',
 sourceSignedHmac:MAC('a'),sourceReadbackHmac:MAC('b'),
 cancellationIdHmac:H(A),cancellationStatus:'SUCCEEDED',
 exactAmountMinor:'3000',firstObservedCumulativeMinor:'3000',
 sourcePaidMinor:'8900',sourceCurrency:'KRW',
 orderingProven:'false',refundExecutionAuthorized:'false',
 revocationAuthorized:'false',
};
const SECOND={
 ...FIRST,providerEventId:'00000000-0000-4000-8000-000000000092',
 eventType:'Transaction.Cancelled',sourceEventType:'Transaction.Cancelled',
 signedEventHmac:MAC('d'),sourceSignedHmac:MAC('d'),
 sourceReadbackHmac:MAC('e'),cancellationIdHmac:H(B),
 exactAmountMinor:'5900',firstObservedCumulativeMinor:'8900',
};
const RECORDS=[FIRST,SECOND];
const PAYMENT={
 id:P,transactionId:T,version:'V2',currency:'KRW',
 channel:{type:'LIVE'},status:'CANCELLED',
 amount:{paid:8900,cancelled:8900},
 cancellations:[
  {id:A,status:'SUCCEEDED',totalAmount:3000},
  {id:B,status:'SUCCEEDED',totalAmount:5900},
 ],
};
const fetchFor=(body=PAYMENT)=>vi.fn(async()=>new Response(
 JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}},
));
const db=({rows=RECORDS,rowsAfter=null,role={
 readOnly:true,completeVisibility:true,currentUser:'postgres',
},roleAfter=null,errorAfter=null}={})=>{
 const calls=[];let reads=0;
 const query=vi.fn(async(sql,args)=>{
  calls.push({sql,args});
  if(sql==='begin isolation level repeatable read read only'||
     sql==="set local statement_timeout='10000ms'"||sql==='rollback')
   return {rows:[]};
  if(sql.includes('pg_catalog.pg_roles'))
   return {rows:[reads>0&&roleAfter?roleAfter:role]};
  if(sql===SQL){
   reads++;
   if(reads===2&&errorAfter)throw errorAfter;
   expect(args).toEqual([R]);
   return {rows:reads===2&&rowsAfter!==null?rowsAfter:rows};
  }
  throw Error('UNEXPECTED_DB_COMMAND');
 });
 return {calls,query};
};
const run=(client,overrides={})=>reconcile({
 dbClient:client,receiptId:R,sourceHmacSecret:SECRET,
 apiSecret:API,providerInspector:inspect,fetchImpl:fetchFor(),
 ...overrides,
});
const safe=(r)=>{
 expect(r).toMatchObject({
  providerOrderingProven:false,currentProviderStateVerified:false,
  latestRefundFinalityProven:false,legalRefundAuthority:false,
  readerT2LockHeld:false,grantRevocationAuthorized:false,
  providerRefundAuthorized:false,writesPerformed:false,
 });
 for(const forbidden of [A,B,P,T,S,SECRET,API,H(A),H(B)])
  expect(JSON.stringify(r)).not.toContain(forbidden);
};

describe('P4 stored canonical set vs authenticated current PortOne cancellation set',()=>{
 it('matches 3000+5900 successful items in any order with two independent DB snapshots',async()=>{
  const client=db(),fetchImpl=fetchFor({
   ...PAYMENT,cancellations:[PAYMENT.cancellations[1],PAYMENT.cancellations[0]],
  });
  const result=await run(client,{fetchImpl});
  expect(result).toMatchObject({
   kind:'authenticated_current_cancel_set_matches_recorded',
   recordedSetSelfConsistent:true,authenticatedProviderGetObserved:true,
   observedProviderSetMatched:true,postGetDbSnapshotStable:true,
   matchedCancellationItems:2,matchedCancellationAmountMinor:'8900',
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(client.calls.filter(x=>x.sql===SQL)).toHaveLength(2);
  expect(client.calls.filter(x=>x.sql==='rollback')).toHaveLength(2);
  safe(result);
 });
 it('detects same aggregate but changed individual item amounts',async()=>{
  const result=await run(db(),{fetchImpl:fetchFor({
   ...PAYMENT,cancellations:[
    {id:A,status:'SUCCEEDED',totalAmount:3100},
    {id:B,status:'SUCCEEDED',totalAmount:5800},
   ],
  })});
  expect(result.kind).toBe('current_provider_cancel_item_missing_changed_or_duplicate');
  expect(result.observedProviderSetMatched).toBe(false);
  safe(result);
 });
 it('detects provider extra successful item despite identical aggregate',async()=>{
  const result=await run(db(),{fetchImpl:fetchFor({
   ...PAYMENT,cancellations:[
    {id:A,status:'SUCCEEDED',totalAmount:3000},
    {id:B,status:'SUCCEEDED',totalAmount:5800},
    {id:'third-item',status:'SUCCEEDED',totalAmount:100},
   ],
  })});
  expect(result.kind).toBe('current_provider_cancel_set_shape_or_count_conflict');
  safe(result);
 });
 it('detects missing recorded cancellation after payment regresses to partial',async()=>{
  const result=await run(db(),{fetchImpl:fetchFor({
   ...PAYMENT,status:'PARTIAL_CANCELLED',
   amount:{paid:8900,cancelled:3000},
   cancellations:[PAYMENT.cancellations[0]],
  })});
  expect(result.kind).toBe('current_provider_cancel_set_shape_or_count_conflict');
  safe(result);
 });
 it('holds provider pending cancellation alongside a succeeded partial',async()=>{
  const first={...FIRST};
  const result=await run(db({rows:[first]}),{fetchImpl:fetchFor({
   ...PAYMENT,status:'PARTIAL_CANCELLED',
   amount:{paid:8900,cancelled:3000},
   cancellations:[
    PAYMENT.cancellations[0],
    {id:B,status:'REQUESTED',totalAmount:5900},
   ],
  })});
  expect(result.kind).toBe('current_provider_cancel_set_shape_or_count_conflict');
  safe(result);
 });
 it('fails closed on wrong original provider payment, even if cancellation list matches',async()=>{
  const result=await run(db(),{fetchImpl:fetchFor({
   ...PAYMENT,transactionId:'different-transaction',
  })});
  expect(result.kind).toBe('current_provider_cancel_set_get_unavailable');
  safe(result);
 });
 it('does not call provider GET if canonical evidence has duplicate HMAC',async()=>{
  const client=db({rows:[FIRST,{...SECOND,cancellationIdHmac:H(A)}]});
  const fetchImpl=fetchFor();
  const result=await run(client,{fetchImpl});
  expect(result.kind).toBe('stored_cancellation_set_not_ready');
  expect(fetchImpl).not.toHaveBeenCalled();
  safe(result);
 });
 it('does not call provider GET with no stored cancellation source',async()=>{
  const fetchImpl=fetchFor(),client=db({rows:[]});
  const result=await run(client,{fetchImpl});
  expect(result.kind).toBe('stored_cancellation_set_not_ready');
  expect(fetchImpl).not.toHaveBeenCalled();
  safe(result);
 });
 it.each([
  ['changed Grant-independent event status',[FIRST,{...SECOND,eventStatus:'processed'}]],
  ['changed Receipt status',[FIRST,{...SECOND,receiptStatus:'revoked'}]],
  ['changed HMAC',[FIRST,{...SECOND,cancellationIdHmac:H('altered')}]],
  ['removed event',[FIRST]],
  ['added duplicated join',[FIRST,SECOND,SECOND]],
 ])('holds concurrent DB %s after successful GET',async(_label,rowsAfter)=>{
  const client=db({rowsAfter});
  const result=await run(client);
  expect(result.kind).toBe('stored_cancel_set_changed_during_provider_get');
  expect(result.observedProviderSetMatched).toBe(false);
  expect(client.calls.filter(x=>x.sql==='rollback')).toHaveLength(2);
  safe(result);
 });
 it('fails closed after GET if RLS/role complete visibility disappears',async()=>{
  const client=db({roleAfter:{
   readOnly:true,completeVisibility:false,currentUser:'postgres',
  }});
  await expect(run(client)).rejects.toThrow('COMPLETE_VISIBILITY');
  expect(client.calls.filter(x=>x.sql==='rollback')).toHaveLength(2);
 });
 it('rolls back second snapshot when database unavailable after provider GET',async()=>{
  const client=db({errorAfter:new Error('second query unavailable')});
  await expect(run(client)).rejects.toThrow('second query unavailable');
  expect(client.calls.filter(x=>x.sql==='rollback')).toHaveLength(2);
 });
 it('does not accept even full matched set as Provider order, legal refund or T2 grant authorization',async()=>{
  const r=await run(db());
  expect(r.observedProviderSetMatched).toBe(true);
  expect(r).toMatchObject({
   providerOrderingProven:false,latestRefundFinalityProven:false,
   legalRefundAuthority:false,readerT2LockHeld:false,
   grantRevocationAuthorized:false,writesPerformed:false,
  });
 });
});

describe('P4 exact Provider Event member of full current cancellation set',()=>{
 it('requires exact persisted candidate event to be in the verified set',async()=>{
  const client=db(),fetchImpl=fetchFor();
  const r=await run(client,{
   expectedProviderEventId:'00000000-0000-4000-8000-000000000099',
   fetchImpl,
  });
  expect(r.kind).toBe('exact_provider_event_not_in_verified_cancel_set');
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(client.calls.filter(x=>x.sql==='rollback')).toHaveLength(1);
  safe(r);
 });
 it('certifies specific source membership only when authenticated full GET and both DB snapshots agree',async()=>{
  const r=await run(db(),{
   expectedProviderEventId:SECOND.providerEventId,
  });
  expect(r).toMatchObject({
   kind:'authenticated_current_cancel_set_matches_recorded',
   exactProviderEventIncluded:true,
   observedProviderSetMatched:true,postGetDbSnapshotStable:true,
   providerOrderingProven:false,
  });
  safe(r);
 });
 it('does not promote the wrong event when it appears only after provider GET',async()=>{
  const client=db({rows:[FIRST],rowsAfter:RECORDS}),fetchImpl=fetchFor();
  const r=await run(client,{
   expectedProviderEventId:SECOND.providerEventId,
   fetchImpl,
  });
  expect(r.kind).toBe('exact_provider_event_not_in_verified_cancel_set');
  expect(fetchImpl).not.toHaveBeenCalled();
 });
 it('cannot certify event membership when it disappears after GET',async()=>{
  const client=db({rowsAfter:[FIRST]});
  const r=await run(client,{expectedProviderEventId:SECOND.providerEventId});
  expect(r.kind).toBe('stored_cancel_set_changed_during_provider_get');
  safe(r);
 });
 it('rejects invalid external event identity before beginning DB read',async()=>{
  const client=db();
  await expect(run(client,{expectedProviderEventId:'not-uuid'})).rejects.toThrow('INVALID');
  expect(client.query).not.toHaveBeenCalled();
 });
});
