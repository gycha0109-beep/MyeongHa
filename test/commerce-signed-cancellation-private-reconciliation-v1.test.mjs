import {createHmac} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import {authenticatePortOneV2CancellationWebhookCandidateV1 as authenticate}
 from '../apps/api/src/portone-v2-cancellation-webhook-candidate-v1.js';
import {inspectPortOneV2CancellationViaGetCandidateV1 as inspect}
 from '../apps/api/src/portone-v2-cancellation-readback-get-v1.js';
import {
 COMMERCE_SIGNED_CANCELLATION_PRIVATE_RECONCILIATION_V1 as CONFIG,
 reconcileSignedCancellationPrivateV1 as reconcile,
} from '../scripts/operations/commerce-signed-cancellation-private-reconciliation-v1.mjs';
import {COMMERCE_CANCELLATION_PAYMENT_RECEIPT_LINK_SQL_V1 as LOOKUP}
 from '../scripts/operations/commerce-cancellation-payment-receipt-link-v1.mjs';
import {COMMERCE_CANCELLATION_EXACT_EVENT_READINESS_SQL_V1 as EVENT_AUDIT}
 from '../scripts/operations/commerce-cancellation-exact-event-readiness-v1.mjs';

const NOW=new Date('2026-10-30T05:00:00.000Z');
const TS=String(Math.floor(NOW.getTime()/1000));
const SECRET_BYTES=Buffer.from('0123456789abcdef0123456789abcdef');
const SECRET='whsec_'+SECRET_BYTES.toString('base64');
const webhookConfig=Object.freeze({
 environment:'production',webhookSecrets:[SECRET],now:()=>NOW,
});
const PAYMENT_ID='payment-1',TX='tx-1',CANCEL='cancel-1';
const ROW=Object.freeze({
 paymentAttemptId:'00000000-0000-4000-8000-000000000001',
 verifiedReceiptId:'00000000-0000-4000-8000-000000000002',
 purchaseIntentId:'00000000-0000-4000-8000-000000000003',
 subjectId:'00000000-0000-4000-8000-000000000004',
 readerCharacterId:'seyeon',
 verifiedTransactionId:TX,verifiedAmountMinor:'8900',verifiedCurrency:'KRW',
});
const PAID=Object.freeze({
 id:PAYMENT_ID,transactionId:TX,status:'CANCELLED',
 version:'V2',currency:'KRW',channel:{type:'LIVE'},
 amount:{paid:8900,cancelled:8900},
 cancellations:[{id:CANCEL,status:'SUCCEEDED',totalAmount:8900}],
});
function signedRequest(type='Transaction.Cancelled',data={
 paymentId:PAYMENT_ID,transactionId:TX,cancellationId:CANCEL,
}) {
 const rawBody=JSON.stringify({type,timestamp:'2026-10-30T04:59:59.000Z',data});
 const sig=createHmac('sha256',SECRET_BYTES)
  .update('msg_1').update('.').update(TS).update('.')
  .update(rawBody).digest('base64');
 return {rawBody,headers:{
  'content-type':'application/json','webhook-id':'msg_1',
  'webhook-timestamp':TS,'webhook-signature':'v1,'+sig,
 }};
}
function fakeDb({rows=[ROW],eventRows=[],authority={readOnly:true,completeVisibility:true},error}={}){
 return {query:vi.fn(async (sql,args)=>{
  if(sql.includes('pg_catalog.pg_roles'))return {rows:[authority]};
  if(sql===LOOKUP){
   if(error)throw error;
   expect(args).toEqual([PAYMENT_ID,TX]);
   return {rows};
  }
  if(sql===EVENT_AUDIT){
   expect(args).toEqual(['msg_1','Transaction.Cancelled']);
   return {rows:eventRows};
  }
  if(sql.toLowerCase().includes('insert')||
     sql.toLowerCase().includes('update')||
     sql.toLowerCase().includes('delete')) throw Error('SQL mutation forbidden');
  return {rows:[]};
 })};
}
function fakeFetch(payment=PAID,status=200){
 return vi.fn(async (url,init)=>{
  expect(url).toBe('https://api.portone.io/payments/payment-1');
  expect(init.method).toBe('GET');
  expect(init.redirect).toBe('manual');
  return new Response(JSON.stringify(payment),{
   status,headers:{'content-type':'application/json'},
  });
 });
}
const executor=(dbClient,fetchImpl,override={})=>reconcile({
 dbClient,fetchImpl,
 request:signedRequest(),webhookConfig,
 apiSecret:'local-only-secret-with-at-least-16-characters',
 authenticator:authenticate,
 readbackInspector:inspect,
 ...override,
});

describe('signed cancellation -> original verified Reading -> GET -> review-only',()=>{
 it('remains unmounted, never customer acknowledgement, never PSP POST/revoke',()=>{
  expect(CONFIG).toEqual({
   schemaVersion:'commerce-signed-cancellation-private-reconciliation-v1',
   publicRouteMounted:false,entitlementMutationEnabled:false,
   providerCancelPostEnabled:false,customerResponseGenerated:false,
  });
 });
 it('composes real signature, owned Receipt, fixed GET and full cancel triage without granting effects',async()=>{
  const db=fakeDb(),http=fakeFetch();
  const r=await executor(db,http);
  expect(r).toMatchObject({
   kind:'full_cancel_review_candidate',
   exactProductionReceiptLinked:true,providerGetObserved:true,
   fullCancelShapeObserved:true,partialCancelShapeObserved:false,
   canonicalProviderEventStatus:'canonical_event_missing',
   canonicalProviderEventReady:false,
   exactEventGrantRevocationObserved:false,
   fullRefundExecutionAuthorized:false,grantRevocationAuthorized:false,
   entitlementEffectEligible:false,writesPerformed:false,
  });
  expect(JSON.stringify(r)).not.toContain('seyeon');
  expect(JSON.stringify(r)).not.toContain('payment-1');
  expect(JSON.stringify(r)).not.toContain('tx-1');
  expect(db.query.mock.calls.at(-1)[0]).toBe('rollback');
  expect(db.query.mock.calls.some(([sql])=>sql===LOOKUP)).toBe(true);
  expect(http).toHaveBeenCalledTimes(1);
 });
 it('partial cancellation remains a separate review-only result',async()=>{
  const http=fakeFetch({
   ...PAID,status:'PARTIAL_CANCELLED',
   amount:{paid:8900,cancelled:3000},
   cancellations:[{id:CANCEL,status:'SUCCEEDED',totalAmount:3000}],
  });
  const r=await executor(fakeDb(),http);
  expect(r).toMatchObject({
   kind:'partial_cancel_review_candidate',partialCancelShapeObserved:true,
   grantRevocationAuthorized:false,entitlementEffectEligible:false,
  });
 });
 it('pending cancellation never becomes a Grant revocation',async()=>{
  const http=fakeFetch({
   ...PAID,status:'PAID',
   amount:{paid:8900,cancelled:0},
   cancellations:[{id:CANCEL,status:'REQUESTED',totalAmount:8900}],
  });
  const r=await executor(fakeDb(),http);
  expect(r).toMatchObject({
   kind:'pending_cancel_review_candidate',entitlementEffectEligible:false,
  });
 });
 it('invalid signature is denied before DB and network',async()=>{
  const db=fakeDb(),http=fakeFetch();
  const request=signedRequest();
  const r=await executor(db,http,{request:{
   ...request,rawBody:request.rawBody.replace('payment-1','attacker'),
  }});
  expect(r.kind).toBe('authentication_rejected');
  expect(db.query).not.toHaveBeenCalled();
  expect(http).not.toHaveBeenCalled();
 });
 it('signed Paid notification never executes cancellation inquiry',async()=>{
  const db=fakeDb(),http=fakeFetch();
  const r=await executor(db,http,{request:signedRequest('Transaction.Paid')});
  expect(r.kind).toBe('not_cancellation_event');
  expect(db.query).not.toHaveBeenCalled();
  expect(http).not.toHaveBeenCalled();
 });
 it('does not perform receipt or provider lookup for sandbox signed event',async()=>{
  const db=fakeDb(),http=fakeFetch();
  const r=await executor(db,http,{webhookConfig:{...webhookConfig,environment:'sandbox'}});
  expect(r.kind).toBe('production_only_hold');
  expect(db.query).not.toHaveBeenCalled();
  expect(http).not.toHaveBeenCalled();
 });
 it('missing verified purchase never reaches PortOne GET',async()=>{
  const db=fakeDb({rows:[]}),http=fakeFetch();
  const r=await executor(db,http);
  expect(r.kind).toBe('no_verified_original_reading_receipt');
  expect(db.query.mock.calls.at(-1)[0]).toBe('rollback');
  expect(http).not.toHaveBeenCalled();
 });
 it('underprivileged filtered RLS client never reaches PortOne GET',async()=>{
  const db=fakeDb({authority:{readOnly:true,completeVisibility:false}});
  const http=fakeFetch();
  const r=await executor(db,http);
  expect(r.kind).toBe('original_purchase_evidence_unavailable');
  expect(db.query.mock.calls.some(([sql])=>sql===LOOKUP)).toBe(false);
  expect(http).not.toHaveBeenCalled();
 });
 it('invalid original paid amount refuses readback and cannot authorize refunds',async()=>{
  const db=fakeDb({rows:[{...ROW,verifiedAmountMinor:'abc'}]}),http=fakeFetch();
  const r=await executor(db,http);
  expect(r).toMatchObject({
   kind:'original_purchase_evidence_unavailable',
   fullRefundExecutionAuthorized:false,grantRevocationAuthorized:false,
  });
  expect(http).not.toHaveBeenCalled();
 });
 it('a different provider transaction ID fails closed after GET',async()=>{
  const http=fakeFetch({...PAID,transactionId:'different'});
  const r=await executor(fakeDb(),http);
  expect(r.kind).toBe('inconsistent_provider_readback');
  expect(r.grantRevocationAuthorized).toBe(false);
 });
 it('provider HTTP failure never maps to settlement and never revokes',async()=>{
  const http=fakeFetch({private:'upstream'},500);
  const r=await executor(fakeDb(),http);
  expect(r.kind).toBe('provider_readback_unavailable');
  expect(r.grantRevocationAuthorized).toBe(false);
 });
 it('does not accept fake classifier result as trusted GET readback',async()=>{
  const db=fakeDb(),http=fakeFetch();
  const r=await executor(db,http,{readbackInspector:vi.fn(async()=>({
    kind:'full_cancel_shape_observed',
    shapeConsistent:true,originalPaymentMatched:true,
    providerReadbackFromAuthenticatedGet:false,
    refundExecutionAuthorized:false,entitlementRevocationAuthorized:false,
  }))});
  expect(r.kind).toBe('inconsistent_provider_readback');
  expect(http).not.toHaveBeenCalled();
 });
});

describe('signed PortOne cancellation and persisted event readiness bridge',()=>{
 const eventRow=Object.freeze({
  providerEventId:'00000000-0000-4000-8000-000000000011',
  eventType:'Transaction.Cancelled',eventStatus:'verified',
  resolutionSourceType:'receipt',providerOrderingKey:'ordering-1',
  eventTransactionId:TX,eventOriginalTransactionId:null,
  receiptId:ROW.verifiedReceiptId,receiptStatus:'verified',
  receiptTransactionId:TX,receiptAmountMinor:'8900',receiptCurrency:'KRW',
  receiptSubjectId:ROW.subjectId,
  purchaseGrantCount:'1',exactEventRevocationCount:'0',
 });
 it('exposes only safe canonical event readiness after signed webhook + PSP GET',async()=>{
  const db=fakeDb({eventRows:[eventRow]});
  const result=await executor(db,fakeFetch());
  expect(result).toMatchObject({
   kind:'full_cancel_review_candidate',
   canonicalProviderEventStatus:'verified_event_review_candidate',
   canonicalProviderEventReady:true,
   exactEventGrantRevocationObserved:false,
   entitlementEffectEligible:false,
   grantRevocationAuthorized:false,writesPerformed:false,
  });
  expect(db.query.mock.calls.some(([sql])=>sql===EVENT_AUDIT)).toBe(true);
  expect(JSON.stringify(result)).not.toContain(TX);
  expect(JSON.stringify(result)).not.toContain('msg_1');
  expect(JSON.stringify(result)).not.toContain(ROW.subjectId);
 });
 it('detects already-recorded same-provider-event revocation without repeating it',async()=>{
  const result=await executor(fakeDb({
   eventRows:[{...eventRow,exactEventRevocationCount:'1'}],
  }),fakeFetch());
  expect(result).toMatchObject({
   canonicalProviderEventStatus:'exact_event_revocation_observed',
   canonicalProviderEventReady:true,
   exactEventGrantRevocationObserved:true,
   grantRevocationAuthorized:false,writesPerformed:false,
  });
 });
 it('does not audit canonical event if PortOne GET is untrusted',async()=>{
  const db=fakeDb({eventRows:[eventRow]});
  const result=await executor(db,fakeFetch({...PAID,transactionId:'wrong'}));
  expect(result.kind).toBe('inconsistent_provider_readback');
  expect(db.query.mock.calls.some(([sql])=>sql===EVENT_AUDIT)).toBe(false);
 });
 it('fails closed when exact event audit cannot access canonical records',async()=>{
  const db=fakeDb({eventRows:[eventRow]});
  const result=await executor(db,fakeFetch(),{
   providerEventReadinessInspector:async()=>{throw Error('database unavailable')},
  });
  expect(result.kind).toBe('canonical_provider_event_audit_unavailable');
  expect(result.grantRevocationAuthorized).toBe(false);
 });
 it('ignores a forged audit result that claims authority to revoke',async()=>{
  const db=fakeDb();
  const result=await executor(db,fakeFetch(),{
   providerEventReadinessInspector:async()=>({
    kind:'verified_event_review_candidate',sourceEventReady:true,
    exactPurchaseGrantRevoked:false,grantRevocationAuthorized:true,
    providerRefundAuthorized:false,writesPerformed:false,
   }),
  });
  expect(result.kind).toBe('canonical_provider_event_audit_inconsistent');
  expect(result.grantRevocationAuthorized).toBe(false);
 });
});
