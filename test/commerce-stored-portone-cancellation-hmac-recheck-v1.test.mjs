import {createHmac} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {inspectPortOneV2CancellationViaGetCandidateV1 as inspect} from
 '../apps/api/src/portone-v2-cancellation-readback-get-v1.js';
import {
 COMMERCE_STORED_PORTONE_CANCEL_HMAC_RECHECK_V1 as CONFIG,
 COMMERCE_STORED_PORTONE_CANCEL_HMAC_SOURCE_SQL_V1 as SOURCE_SQL,
 recheckStoredPortOneCancellationByHmacPrivateV1 as recheck,
} from '../scripts/operations/commerce-stored-portone-cancellation-hmac-recheck-v1.mjs';

const EVENT='00000000-0000-4000-8000-000000000001';
const GRANT='00000000-0000-4000-8000-000000000002';
const SECRET='private-portone-cancellation-source-hmac-secret-tests';
const API_SECRET='private-portone-get-only-secret-token-tests';
const PAYMENT_ID='pmt-reader-a';
const TX='original-reader-a-transaction';
const CANCEL_A='cancel-a';
const CANCEL_B='cancel-b';
const H=(parts)=>'hmac-sha256:k1:'+
 createHmac('sha256',SECRET).update(JSON.stringify(parts),'utf8').digest('hex');
const row=Object.freeze({
 providerEventId:EVENT,eventType:'Transaction.PartialCancelled',
 eventStatus:'verified',eventProviderOrderingKey:null,
 receiptVerificationStatus:'verified',
 grantStatus:'active',grantRevision:'3',grantLastProviderOrderingKey:null,
 eventSignedHmac:H(['signed-original']),
 sourceSchema:'commerce-portone-cancellation-source-v2',
 sourceSignedHmac:H(['signed-original']),sourceReadbackHmac:H(['readback-original']),
 cancellationIdHmac:H(['portone-cancellation-item-v1',PAYMENT_ID,CANCEL_A]),
 sourceCancellationStatus:'SUCCEEDED',
 sourceExactAmountMinor:'3000',sourceInitialCumulativeMinor:'3000',
 sourcePaidMinor:'8900',sourceCurrency:'KRW',
 sourceOrderingProven:'false',sourceRefundAuthorized:'false',
 sourceRevokeAuthorized:'false',
 originalTransactionId:TX,receiptPaidMinor:'8900',receiptCurrency:'KRW',
 providerPaymentId:PAYMENT_ID,exactReaderGrantId:GRANT,
});
function mockDb({
 rows=[row],rowsAfterGet=null,
 authority={readOnly:true,completeVisibility:true},
 authorityAfterGet=null,error,errorAfterGet,
}={}){
 const calls=[];let inTx=false,sourceReads=0;
 return {calls,query:vi.fn(async(sql,args)=>{
  calls.push({sql,args});
  if(sql.startsWith('begin ')){inTx=true;return {rows:[]};}
  if(sql==='rollback'){inTx=false;return {rows:[]};}
  if(sql.includes('pg_catalog.pg_roles'))
   return {rows:[sourceReads===0?authority:(authorityAfterGet||authority)]};
  if(sql===SOURCE_SQL){
   sourceReads++;
   if(sourceReads===1&&error)throw error;
   if(sourceReads===2&&errorAfterGet)throw errorAfterGet;
   return {rows:sourceReads===2&&rowsAfterGet!==null?rowsAfterGet:rows};
  }
  if(sql.startsWith('set local statement_timeout'))return {rows:[]};
  throw Error('Unexpected DB command: '+sql);
 }),get inTransaction(){return inTx;}};
}
function payment({status='CANCELLED',total=8900,exactAmount=3000,
 cancellationStatus='SUCCEEDED',tx=TX,currency='KRW',
 originalPaid=8900,missing=false}={}){
 return {
  id:PAYMENT_ID,transactionId:tx,status,version:'V2',currency,
  channel:{type:'LIVE'},
  amount:{paid:originalPaid,cancelled:total},
  cancellations:missing?[{id:CANCEL_B,status:'SUCCEEDED',totalAmount:total}]:
   status==='PAID'&&total===0?[{id:CANCEL_A,status:cancellationStatus,totalAmount:exactAmount}]:
   total===exactAmount?[
    {id:CANCEL_A,status:cancellationStatus,totalAmount:exactAmount},
   ]:[
    {id:CANCEL_A,status:cancellationStatus,totalAmount:exactAmount},
    {id:CANCEL_B,status:'SUCCEEDED',totalAmount:total-exactAmount},
   ],
 };
}
function f(body=payment()){
 return vi.fn(async(_url,init)=>{
  expect(init.method).toBe('GET');
  expect(init.redirect).toBe('manual');
  return new Response(JSON.stringify(body),{
   status:200,headers:{'content-type':'application/json'},
  });
 });
}
function call(db,overrides={}){
 return recheck({
  dbClient:db,providerEventId:EVENT,entitlementGrantId:GRANT,
  sourceHmacSecret:SECRET,apiSecret:API_SECRET,
  providerInspector:inspect,fetchImpl:f(),
  ...overrides,
 });
}
describe('P4 stored canonical PortOne source-v2 -> authenticated HMAC re-GET',()=>{
 it('stays internal, read-only and never claims Legal, T2, refund or Grant authority',()=>{
  expect(CONFIG).toMatchObject({
   productionMounted:false,publicRouteMounted:false,readOnly:true,
   sourceOrderAuthority:false,legalRefundAuthority:false,
   entitlementEffectEnabled:false,readerT2LockHeld:false,
  });
  expect(SOURCE_SQL).toContain('from public.commerce_provider_events event');
  expect(SOURCE_SQL).toContain("event.provider='portone_v2'");
  expect(SOURCE_SQL).toContain("event.environment='production'");
  expect(SOURCE_SQL).toContain("event.verifier_revision='portone-cancel-readback-v2'");
  expect(SOURCE_SQL).toContain("and g.source_receipt_id=receipt.id");
  expect(SOURCE_SQL).toContain('on access.entitlement_grant_id=g.id');
  expect(SOURCE_SQL).toContain("and attempt.provider_transaction_id=receipt.external_transaction_id");
  expect(SOURCE_SQL).toContain('and attempt.status=\'response_received\'');
 });
 it('re-observes exact first SUCCEEDED partial after later aggregate full cancellation',async()=>{
  const db=mockDb(),fetchImpl=f();
  const r=await call(db,{fetchImpl});
  expect(r).toMatchObject({
   kind:'same_exact_cancellation_success_reobserved',
   originalReceiptBound:true,exactGrantBound:true,
   latestExactSuccessObserved:true,matchedCancellationAmountUnchanged:true,
   postGetDbSnapshotStable:true,
   refundExecutionAuthorized:false,grantRevocationAuthorized:false,
   readerT2LockHeld:false,providerOrderingProven:false,
   entitlementEffectInvoked:false,writesPerformed:false,
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(db.calls.map(c=>c.sql)).toEqual([
   'begin isolation level repeatable read read only',
   "set local statement_timeout='10000ms'",
   expect.stringContaining('pg_catalog.pg_roles'),
   SOURCE_SQL,'rollback',
   'begin isolation level repeatable read read only',
   "set local statement_timeout='10000ms'",
   expect.stringContaining('pg_catalog.pg_roles'),
   SOURCE_SQL,'rollback',
  ]);
  expect(db.calls.at(3).args).toEqual([EVENT,GRANT]);
  expect(db.inTransaction).toBe(false);
  expect(JSON.stringify(r)).not.toContain(PAYMENT_ID);
  expect(JSON.stringify(r)).not.toContain(TX);
  expect(JSON.stringify(r)).not.toContain(SECRET);
 });
 it('does not run provider GET on a missing or mismatched Reader Grant',async()=>{
  for(const rows of [[],[{...row,exactReaderGrantId:'00000000-0000-4000-8000-000000000098'}]]){
   const db=mockDb({rows}),fetchImpl=f();
   const r=await call(db,{fetchImpl});
   expect(r.latestExactSuccessObserved).toBe(false);
   expect(r.grantRevocationAuthorized).toBe(false);
   expect(fetchImpl).not.toHaveBeenCalled();
   expect(db.inTransaction).toBe(false);
  }
 });
 it('rejects ambiguous source lineage before external GET',async()=>{
  const db=mockDb({rows:[row,row]}),fetchImpl=f();
  await expect(call(db,{fetchImpl})).rejects.toThrow('AMBIGUOUS_STORED_PORTONE_CANCEL_SOURCE');
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(db.inTransaction).toBe(false);
 });
 it.each([
  ['bad signed fingerprint',{sourceSignedHmac:H(['altered'])}],
  ['wrong first original amount',{sourcePaidMinor:'8901'}],
  ['no exact SUCCEEDED',{sourceCancellationStatus:'REQUESTED'}],
  ['elevated revocation flag',{sourceRevokeAuthorized:'true'}],
  ['elevated refund flag',{sourceRefundAuthorized:'true'}],
  ['made-up ordering',{sourceOrderingProven:'true'}],
  ['wrong event state',{eventStatus:'pending'}],
  ['invalid currency',{sourceCurrency:'USD'}],
  ['invalid cumulative',{sourceInitialCumulativeMinor:'100'}],
  ['incorrect full event',{eventType:'Transaction.Cancelled'}],
 ])('rejects inconsistent stored lineage: %s',async(_name,overrides)=>{
  const db=mockDb({rows:[{...row,...overrides}]}),fetchImpl=f();
  const r=await call(db,{fetchImpl});
  expect(r.kind).toBe('stored_source_v2_provenance_inconsistent');
  expect(r.latestExactSuccessObserved).toBe(false);
  expect(fetchImpl).not.toHaveBeenCalled();
 });
 it('rejects unauthorized incomplete-visibility DB before querying identity',async()=>{
  const db=mockDb({authority:{readOnly:true,completeVisibility:false}}),fetchImpl=f();
  await expect(call(db,{fetchImpl})).rejects.toThrow('STORED_PORTONE_CANCEL_RECHECK_AUTHORITY_REQUIRED');
  expect(db.calls.some(c=>c.sql===SOURCE_SQL)).toBe(false);
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(db.calls.at(-1).sql).toBe('rollback');
 });
 it('always rolls back the read transaction when DB lookup throws',async()=>{
  const db=mockDb({error:new Error('DB unavailable')}),fetchImpl=f();
  await expect(call(db,{fetchImpl})).rejects.toThrow('DB unavailable');
  expect(db.inTransaction).toBe(false);
  expect(fetchImpl).not.toHaveBeenCalled();
 });
 it.each([
  ['exact cancel missing',payment({missing:true}),'current_provider_get_unavailable'],
  ['wrong original transaction',payment({tx:'another-transaction'}),'current_provider_shape_inconsistent'],
  ['same id amount altered',payment({exactAmount:4000}),'exact_stored_cancel_amount_conflict'],
  ['aggregated cancellation regressed',payment({status:'PARTIAL_CANCELLED',total:2000,exactAmount:2000}),'exact_stored_cancel_amount_conflict'],
  ['same item pending',payment({status:'PAID',total:0,exactAmount:3000,cancellationStatus:'REQUESTED'}),'exact_stored_cancel_no_longer_succeeded'],
  ['same item failed',payment({status:'PAID',total:0,exactAmount:3000,cancellationStatus:'FAILED'}),'exact_stored_cancel_no_longer_succeeded'],
 ])('holds changed provider state: %s',async(_name,readback,expected)=>{
  const db=mockDb();
  const r=await call(db,{fetchImpl:f(readback)});
  expect(r.kind).toBe(expected);
  expect(r.latestExactSuccessObserved).toBe(false);
  expect(r.grantRevocationAuthorized).toBe(false);
  expect(r.writesPerformed).toBe(false);
 });
 it('rejects invalid UUID before touching DB or provider',async()=>{
  const db=mockDb(),fetchImpl=f();
  await expect(call(db,{providerEventId:'invalid',fetchImpl})).rejects.toThrow('INVALID_STORED_PORTONE_CANCEL_RECHECK_INPUT');
  expect(db.query).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
 });
});

describe('P4 second DB snapshot after authenticated cancellation GET',()=>{
 it.each([
  ['Grant revision advanced',{grantRevision:'4'}],
  ['Grant revoked',{grantStatus:'revoked'}],
  ['Grant ordering key changed',{grantLastProviderOrderingKey:'untrusted-new-key'}],
  ['provider event order changed',{eventProviderOrderingKey:'provider-opaque'}],
  ['event processing status changed',{eventStatus:'processed'}],
  ['source signed evidence changed',{eventSignedHmac:H(['another-signature']),sourceSignedHmac:H(['another-signature'])}],
  ['original Receipt verification changed',{receiptVerificationStatus:'revoked'}],
  ['payment attempt id changed',{providerPaymentId:'another-payment-id'}],
  ['same event source amount changed',{sourceExactAmountMinor:'3100'}],
 ])('HOLD on intervening %s without a Grant mutation',async(_label,changes)=>{
  const db=mockDb({rowsAfterGet:[{...row,...changes}]}),fetchImpl=f();
  const result=await call(db,{fetchImpl});
  expect(result).toMatchObject({
   kind:'stored_source_or_grant_changed_during_provider_get',
   originalReceiptBound:true,exactGrantBound:true,
   postGetDbSnapshotStable:false,latestExactSuccessObserved:false,
   refundExecutionAuthorized:false,grantRevocationAuthorized:false,
   entitlementEffectInvoked:false,writesPerformed:false,
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(db.calls.filter(c=>c.sql===SOURCE_SQL)).toHaveLength(2);
  expect(db.calls.filter(c=>c.sql==='rollback')).toHaveLength(2);
  expect(db.inTransaction).toBe(false);
  expect(JSON.stringify(result)).not.toContain(PAYMENT_ID);
  expect(JSON.stringify(result)).not.toContain(SECRET);
 });
 it.each([
  ['missing source',[]],
  ['ambiguous source',[row,row]],
 ])('HOLD on %s in second DB read',async(_label,rowsAfterGet)=>{
  const db=mockDb({rowsAfterGet});
  const result=await call(db);
  expect(result.kind).toBe('stored_source_or_grant_changed_during_provider_get');
  expect(result.grantRevocationAuthorized).toBe(false);
  expect(db.inTransaction).toBe(false);
 });
 it('fails closed and releases the transaction if DB visibility changes after GET',async()=>{
  const db=mockDb({authorityAfterGet:{readOnly:true,completeVisibility:false}});
  await expect(call(db)).rejects.toThrow('STORED_PORTONE_CANCEL_RECHECK_AUTHORITY_REQUIRED');
  expect(db.calls.filter(c=>c.sql===SOURCE_SQL)).toHaveLength(1);
  expect(db.calls.filter(c=>c.sql==='rollback')).toHaveLength(2);
  expect(db.inTransaction).toBe(false);
 });
 it('fails closed and rolls back if the second DB query errors after GET',async()=>{
  const db=mockDb({errorAfterGet:new Error('second snapshot unavailable')});
  await expect(call(db)).rejects.toThrow('second snapshot unavailable');
  expect(db.calls.filter(c=>c.sql==='rollback')).toHaveLength(2);
  expect(db.inTransaction).toBe(false);
 });
 it('does not perform a second DB read when provider cancellation GET is invalid',async()=>{
  const db=mockDb();
  const result=await call(db,{fetchImpl:f(payment({missing:true}))});
  expect(result.latestExactSuccessObserved).toBe(false);
  expect(db.calls.filter(c=>c.sql===SOURCE_SQL)).toHaveLength(1);
  expect(db.calls.filter(c=>c.sql==='rollback')).toHaveLength(1);
 });
 it('never promotes current GET or stable DB snapshots into trusted NEWER ordering or T2 authority',async()=>{
  const db=mockDb();
  const result=await call(db);
  expect(result).toMatchObject({
   kind:'same_exact_cancellation_success_reobserved',
   postGetDbSnapshotStable:true,
   providerOrderingProven:false,readerT2LockHeld:false,
   grantRevocationAuthorized:false,writesPerformed:false,
  });
 });
});
