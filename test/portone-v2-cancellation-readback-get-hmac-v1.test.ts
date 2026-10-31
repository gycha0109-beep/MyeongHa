import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { inspectPortOneV2CancellationViaGetCandidateV1 as run } from
  '../apps/api/src/portone-v2-cancellation-readback-get-v1.js';

const SECRET='local-only-private-commerce-source-hmac-32bytes-minimum-1';
const PAYMENT_ID='payment-exact-source';
const TRANSACTION='transaction-original';
const CANCEL_A='cancellation-3000';
const CANCEL_B='cancellation-5900';

function fingerprint(cancelId:string,paymentId=PAYMENT_ID){
 return 'hmac-sha256:k1:'+createHmac('sha256',SECRET)
  .update(JSON.stringify(['portone-cancellation-item-v1',paymentId,cancelId]),'utf8')
  .digest('hex');
}
const ORIGINAL={
 providerPaymentId:PAYMENT_ID,originalTransactionId:TRANSACTION,
 originalVerifiedPaidAmountMinor:8900,originalCurrency:'KRW',
 environment:'production' as const,
 cancellationIdHmac:fingerprint(CANCEL_A),
 sourceHmacSecret:SECRET,
 apiSecret:'test-api-secret-no-production-credentials-123',
};
const PAYMENT={
 id:PAYMENT_ID,transactionId:TRANSACTION,version:'V2',status:'CANCELLED',
 currency:'KRW',channel:{type:'LIVE'},
 amount:{paid:8900,cancelled:8900},
 cancellations:[
  {id:CANCEL_A,status:'SUCCEEDED',totalAmount:3000},
  {id:CANCEL_B,status:'SUCCEEDED',totalAmount:5900},
 ],
};
const fake=(body:unknown=PAYMENT)=>{
 const fetchImpl=vi.fn(async(_url:string,_init?:RequestInit)=>new Response(JSON.stringify(body),{
  status:200,headers:{'content-type':'application/json'},
 }));
 return fetchImpl as typeof fetch & ReturnType<typeof vi.fn>;
};

describe('PortOne V2 private exact cancellation HMAC latest GET reconciliation',()=>{
 it('matches persisted v2 cancellation fingerprint after later full aggregate, without leaking raw ID',async()=>{
  const fetchImpl=fake();
  const result=await run({...ORIGINAL,fetchImpl});
  expect(result).toMatchObject({
   kind:'full_cancel_shape_observed',
   providerReadbackFromAuthenticatedGet:true,
   originalPaymentMatched:true,
   matchedCancellationIdObserved:true,
   observedCancelledTotalMinor:8900,
   observedMatchingSucceededCancellationMinor:3000,
   observedMatchingCancellationStatus:'SUCCEEDED',
   refundExecutionAuthorized:false,entitlementRevocationAuthorized:false,
  });
  expect(JSON.stringify(result)).not.toContain(CANCEL_A);
  expect(JSON.stringify(result)).not.toContain(SECRET);
  expect(JSON.stringify(result)).not.toContain(PAYMENT_ID);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const init=fetchImpl.mock.calls[0]?.[1] as unknown as RequestInit;
  expect(init.method).toBe('GET');
  expect(init.redirect).toBe('manual');
 });
 it('can independently match another individual cancellation of the same payment',async()=>{
  const result=await run({...ORIGINAL,cancellationIdHmac:fingerprint(CANCEL_B),fetchImpl:fake()});
  expect(result.observedMatchingSucceededCancellationMinor).toBe(5900);
  expect(result.observedCancelledTotalMinor).toBe(8900);
 });
 it('rejects missing or changed source HMAC without exposing original transaction',async()=>{
  for(const hmac of [
   fingerprint('unknown-cancel'),fingerprint(CANCEL_A,'different-payment'),
   'hmac-sha256:k1:'+('f'.repeat(64)),
  ]){
   const fetchImpl=fake();
   await expect(run({...ORIGINAL,cancellationIdHmac:hmac,fetchImpl}))
    .rejects.toThrow('readback unavailable');
   expect(fetchImpl).toHaveBeenCalledTimes(1);
  }
 });
 it('rejects a matched REQUESTED or FAILED item for a successful refund conclusion',async()=>{
  for(const status of ['REQUESTED','FAILED']){
   const result=await run({...ORIGINAL,fetchImpl:fake({
    ...PAYMENT,status:'PAID',amount:{paid:8900,cancelled:0},
    cancellations:[{id:CANCEL_A,status,totalAmount:3000}],
   })});
   expect(['cancellation_pending','not_cancelled']).toContain(result.kind);
   expect(result.observedMatchingSucceededCancellationMinor).toBeNull();
   expect(result.observedMatchingCancellationStatus).toBe(status);
   expect(result.entitlementRevocationAuthorized).toBe(false);
  }
 });
 it('rejects conflicting raw ID and HMAC selectors before any network call',async()=>{
  const fetchImpl=fake();
  await expect(run({...ORIGINAL,cancellationId:CANCEL_A,fetchImpl}))
   .rejects.toThrow('Invalid internal');
  expect(fetchImpl).not.toHaveBeenCalled();
 });
 it.each([
  {sourceHmacSecret:'short'},
  {sourceHmacSecret:undefined},
  {cancellationIdHmac:undefined},
  {cancellationIdHmac:'bad'},
  {sourceHmacSecret:'bad\ncredentials'.padEnd(40,'x')},
 ])('rejects invalid internal HMAC credentials before network access %j',async invalid=>{
  const fetchImpl=fake();
  await expect(run({...ORIGINAL,...invalid,fetchImpl}))
   .rejects.toThrow('Invalid internal');
  expect(fetchImpl).not.toHaveBeenCalled();
 });
 it('rejects duplicate exact IDs and any status/amount inconsistency even with matching HMAC',async()=>{
  await expect(run({...ORIGINAL,fetchImpl:fake({
   ...PAYMENT,cancellations:[
    {id:CANCEL_A,status:'SUCCEEDED',totalAmount:3000},
    {id:CANCEL_A,status:'SUCCEEDED',totalAmount:5900},
   ],
  })})).rejects.toThrow('readback unavailable');
 });
 it('does not infer a full refund from a partial payment even when the item matches',async()=>{
  const result=await run({...ORIGINAL,fetchImpl:fake({
   ...PAYMENT,status:'PARTIAL_CANCELLED',
   amount:{paid:8900,cancelled:3000},
   cancellations:[{id:CANCEL_A,status:'SUCCEEDED',totalAmount:3000}],
  })});
  expect(result.kind).toBe('partial_cancel_shape_observed');
  expect(result.observedMatchingSucceededCancellationMinor).toBe(3000);
  expect(result.entitlementRevocationAuthorized).toBe(false);
 });
});
