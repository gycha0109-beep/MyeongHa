import {describe,it,expect,vi} from 'vitest';
import {
 COMMERCE_PORTONE_CANCEL_SET_AUDIT_V1 as CONFIG,
 COMMERCE_PORTONE_CANCEL_SET_AUDIT_SQL_V1 as SQL,
 auditPortOneCancellationSetForReceiptV1 as audit,
} from '../scripts/operations/commerce-portone-cancellation-set-ledger-audit-v1.mjs';

const RECEIPT='00000000-0000-4000-8000-000000000006';
const SUBJECT='00000000-0000-4000-8000-000000000004';
const MAC=n=>'hmac-sha256:k1:'+n.repeat(64);
const ROW={
 receiptId:RECEIPT,receiptSubjectId:SUBJECT,receiptTransactionId:'tx-A',
 receiptProvider:'portone_v2',receiptEnvironment:'production',
 receiptStatus:'verified',receiptPaidMinor:'8900',receiptCurrency:'KRW',
 providerPaymentId:'payment-exact-source',
 providerEventId:'00000000-0000-4000-8000-000000000091',
 eventType:'Transaction.PartialCancelled',eventStatus:'verified',
 eventProvider:'portone_v2',eventEnvironment:'production',
 eventSubjectId:SUBJECT,eventResolutionSource:'receipt',
 eventTransactionId:'tx-A',eventOriginalTransactionId:'tx-A',
 signedEventHmac:MAC('a'),providerOrderingKey:null,
 verifierRevision:'portone-cancel-readback-v2',
 sourceSchema:'commerce-portone-cancellation-source-v2',
 sourceEventType:'Transaction.PartialCancelled',
 sourceSignedHmac:MAC('a'),sourceReadbackHmac:MAC('b'),
 cancellationIdHmac:MAC('c'),cancellationStatus:'SUCCEEDED',
 exactAmountMinor:'3000',firstObservedCumulativeMinor:'3000',
 sourcePaidMinor:'8900',sourceCurrency:'KRW',
 orderingProven:'false',refundExecutionAuthorized:'false',
 revocationAuthorized:'false',
};
const SECOND={...ROW,
 providerEventId:'00000000-0000-4000-8000-000000000092',
 eventType:'Transaction.Cancelled',
 sourceEventType:'Transaction.Cancelled',signedEventHmac:MAC('d'),
 sourceSignedHmac:MAC('d'),sourceReadbackHmac:MAC('e'),
 cancellationIdHmac:MAC('f'),exactAmountMinor:'5900',
 firstObservedCumulativeMinor:'8900',
};
const COMPLETE=[ROW,SECOND];
function db({rows=COMPLETE,role={
 readOnly:true,completeVisibility:true,currentUser:'postgres',
},failSql}={}){
 const calls=[];
 const query=vi.fn(async(sql,args)=>{
  calls.push({sql,args});
  if(sql===failSql)throw Error('SYNTHETIC_DB_FAILURE');
  if(sql.includes('pg_catalog.pg_roles'))return {rows:[role]};
  if(sql===SQL){
   expect(args).toEqual([RECEIPT]);
   return {rows};
  }
  if(!['begin isolation level repeatable read read only',
    "set local statement_timeout='10000ms'",'rollback'].includes(sql))
   throw Error('UNEXPECTED_DB_OPERATION');
  return {rows:[]};
 });
 return {calls,query};
}
const run=(client)=>audit(client,{receiptId:RECEIPT});
const safe=result=>{
 expect(result).toMatchObject({
  readOnly:true,providerOrderingProven:false,
  currentProviderStateVerified:false,latestRefundFinalityProven:false,
  legalRefundAuthority:false,readerT2LockHeld:false,
  grantRevocationAuthorized:false,providerRefundAuthorized:false,
  writesPerformed:false,
 });
 expect(JSON.stringify(result)).not.toContain(SUBJECT);
 expect(JSON.stringify(result)).not.toContain('tx-A');
 expect(JSON.stringify(result)).not.toContain(MAC('c'));
};
describe('P4 immutable per-Receipt cancelled item set audit without Provider ordering',()=>{
 it('only audits canonical source-v2 production Reader purchases, no mutations',()=>{
  expect(CONFIG).toMatchObject({
   readOnly:true,productionMounted:false,publicRouteMounted:false,
   entitlementEffectEnabled:false,providerRefundEnabled:false,
   maximumEvents:256,
  });
  expect(SQL).toContain('join public.purchase_intent_reader_selections selection');
  expect(SQL).toContain("product.product_type='reading'");
  expect(SQL).toContain('event.resolved_receipt_id=$1::uuid');
  expect(SQL).toContain('limit 257');
  expect(SQL).not.toMatch(/\bfor update\b|\b(insert|delete|update)\s+public\./iu);
 });
 it('recognizes two different successful 3000+5900 items but authorizes nothing',async()=>{
  const c=db(),r=await run(c);
  expect(r).toMatchObject({
   kind:'recorded_full_amount_set_consistent',
   recordedSetSelfConsistent:true,
   distinctRecordedCancellationItems:2,
   recordedItemAmountMinor:'8900',
   originalReceiptPaidMinor:'8900',
  });
  expect(c.calls.map(x=>x.sql)).toEqual([
   'begin isolation level repeatable read read only',
   "set local statement_timeout='10000ms'",
   expect.stringContaining('pg_catalog.pg_roles'),SQL,'rollback',
  ]);
  safe(r);
 });
 it('only reports partial stored amount when only first item is recorded',async()=>{
  const r=await run(db({rows:[ROW]}));
  expect(r.kind).toBe('recorded_partial_amount_set_consistent');
  expect(r.recordedItemAmountMinor).toBe('3000');
  safe(r);
 });
 it('does not infer that a single full event requires prior partial events',async()=>{
  const r=await run(db({rows:[{
   ...SECOND,exactAmountMinor:'8900',firstObservedCumulativeMinor:'8900',
  }]}));
  expect(r.kind).toBe('recorded_full_amount_set_consistent');
  expect(r.distinctRecordedCancellationItems).toBe(1);
  safe(r);
 });
 it('denies the same cancellation item HMAC supplied under two webhook IDs',async()=>{
  const r=await run(db({rows:[ROW,{...SECOND,cancellationIdHmac:MAC('c')}]}));
  expect(r.kind).toBe('duplicate_cancellation_item_fingerprint');
  safe(r);
 });
 it('denies duplicate event ID / ambiguous DB joins without double counting',async()=>{
  const r=await run(db({rows:[ROW,{...ROW}]}));
  expect(r.kind).toBe('ambiguous_canonical_event_join');
  safe(r);
 });
 it('denies two different cancellation IDs whose amounts exceed the Receipt',async()=>{
  const r=await run(db({rows:[ROW,{...SECOND,exactAmountMinor:'7000'}]}));
  expect(r.kind).toBe('recorded_item_sum_exceeds_paid_receipt');
  safe(r);
 });
 it('holds an incompletely captured earlier cumulative full amount',async()=>{
  const r=await run(db({rows:[{
   ...ROW,firstObservedCumulativeMinor:'8900',
  }]}));
  expect(r.kind).toBe('recorded_set_vs_first_observations_conflict');
  safe(r);
 });
 it('holds when distinct items sum beyond their greatest observed aggregate',async()=>{
  const r=await run(db({rows:[
   ROW,{...SECOND,eventType:'Transaction.PartialCancelled',
    sourceEventType:'Transaction.PartialCancelled',
    firstObservedCumulativeMinor:'8000'},
  ]}));
  expect(r.kind).toBe('recorded_set_vs_first_observations_conflict');
  safe(r);
 });
 it('no cancellation event cannot prove no actual refund',async()=>{
  const r=await run(db({rows:[]}));
  expect(r.kind).toBe('no_recorded_cancellation_items');
  safe(r);
 });
 it('refuses an unbounded collection and performs no additional query',async()=>{
  const r=await run(db({rows:Array.from({length:257},()=>ROW)}));
  expect(r.kind).toBe('cancellation_set_capacity_exceeded');
  safe(r);
 });
 it.each([
  ['unverified', {eventStatus:'received'}],
  ['wrong provider', {eventProvider:'other'}],
  ['cross-subject', {eventSubjectId:'00000000-0000-4000-8000-000000000099'}],
  ['wrong original transaction', {eventOriginalTransactionId:'other'}],
  ['missing verified payment handoff', {providerPaymentId:null}],
  ['different payment handoff', {providerPaymentId:'another-provider-payment'}],
  ['sandbox event', {eventEnvironment:'sandbox'}],
  ['other receipt', {receiptId:'00000000-0000-4000-8000-000000000099'}],
  ['malformed signed source', {signedEventHmac:MAC('e')}],
  ['changed event type', {sourceEventType:'Transaction.PartialCancelled'}],
  ['unverified cancellation', {cancellationStatus:'REQUESTED'}],
  ['wrong currency', {sourceCurrency:'USD'}],
  ['negative rights metadata', {revocationAuthorized:'true'}],
  ['fake provider order metadata', {orderingProven:'true'}],
  ['unknown provider revision', {verifierRevision:'other'}],
  ['stale source schema', {sourceSchema:'commerce-portone-cancellation-source-v1'}],
  ['string ordering guess', {providerOrderingKey:'2026-11-01T20:00:00'}],
  ['receipt currency mismatch',{receiptCurrency:'USD'}],
  ['partial item equals entire payment',{eventType:'Transaction.PartialCancelled',sourceEventType:'Transaction.PartialCancelled',exactAmountMinor:'8900'}],
  ['full event with partial aggregate',{firstObservedCumulativeMinor:'5000'}],
 ])('fails closed for %s',async(_reason,override)=>{
  const rows=[ROW,{...SECOND,...override}];
  const r=await run(db({rows}));
  expect(r.kind).toBe('cancellation_source_or_receipt_inconsistent');
  safe(r);
 });
 it('rejects unsupported client roles and incomplete database visibility',async()=>{
  for(const role of [
   {readOnly:true,completeVisibility:false,currentUser:'postgres'},
   {readOnly:false,completeVisibility:true,currentUser:'postgres'},
   {readOnly:true,completeVisibility:true,currentUser:'service_role'},
   {readOnly:true,completeVisibility:true,currentUser:'authenticated'},
  ]){
   const c=db({role});
   await expect(run(c)).rejects.toThrow('COMPLETE_VISIBILITY');
   expect(c.calls.at(-1).sql).toBe('rollback');
   expect(c.calls.some(x=>x.sql===SQL)).toBe(false);
  }
 });
 it('rejects bad receipt ID before touching DB',async()=>{
  const c=db();
  await expect(audit(c,{receiptId:'not-uuid'})).rejects.toThrow('INVALID_');
  expect(c.query).not.toHaveBeenCalled();
 });
 it('always rolls back when the canonical DB query fails',async()=>{
  const c=db({failSql:SQL});
  await expect(run(c)).rejects.toThrow('SYNTHETIC_DB_FAILURE');
  expect(c.calls.at(-1).sql).toBe('rollback');
 });
});
