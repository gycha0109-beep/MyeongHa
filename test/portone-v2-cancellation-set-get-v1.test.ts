import {createHmac} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {
 inspectPortOneV2CancellationSetViaGetCandidateV1 as run,
 PORTONE_V2_CANCELLATION_SET_GET_V1 as CONFIG,
} from '../apps/api/src/portone-v2-cancellation-set-get-v1.js';

const SECRET='private-source-hmac-secret-with-more-than-32-bytes';
const API='private-portone-api-secret-with-more-than-16-bytes';
const PAYMENT_ID='payment-exact-source';
const ORIGINAL_TX='transaction-original';
const A='cancellation-3000',B='cancellation-5900';
const H=(s:string)=>{
 return 'hmac-sha256:k1:'+createHmac('sha256',SECRET)
  .update(JSON.stringify(['portone-cancellation-item-v1',PAYMENT_ID,s]),'utf8')
  .digest('hex');
};
const INPUT={
 providerPaymentId:PAYMENT_ID,originalTransactionId:ORIGINAL_TX,
 originalVerifiedPaidAmountMinor:8900,originalCurrency:'KRW',
 environment:'production' as const,apiSecret:API,sourceHmacSecret:SECRET,
};
const PAYMENT={
 id:PAYMENT_ID,transactionId:ORIGINAL_TX,version:'V2',
 currency:'KRW',channel:{type:'LIVE'},status:'CANCELLED',
 amount:{paid:8900,cancelled:8900},
 cancellations:[
  {id:A,status:'SUCCEEDED',totalAmount:3000},
  {id:B,status:'SUCCEEDED',totalAmount:5900},
 ],
};
const f=(body:unknown=PAYMENT,status=200,headers={'content-type':'application/json'})=>
 vi.fn(async(_url:string,_init?:RequestInit)=>new Response(
  JSON.stringify(body),{status,headers},
 )) as typeof fetch & ReturnType<typeof vi.fn>;

describe('Authenticated PortOne V2 whole cancellation set HMAC projection',()=>{
 it('shares the bounded GET transport without returning raw cancellation IDs',async()=>{
  const fetchImpl=f();
  const r=await run({...INPUT,fetchImpl});
  expect(CONFIG).toMatchObject({
   productionMounted:false,publicRouteMounted:false,
   refundPostEnabled:false,entitlementEffectEnabled:false,
  });
  expect(r).toMatchObject({
   providerReadbackFromAuthenticatedGet:true,
   originalPaymentMatched:true,providerShapeConsistent:true,
   observedCancelledTotalMinor:8900,
   kind:'full_cancel_shape_observed',
   unresolvedItemsObserved:false,
   providerOrderingProven:false,legalRefundAuthority:false,
   grantRevocationAuthorized:false,writesPerformed:false,
  });
  expect(r.successfulItems).toEqual([
   {cancellationIdHmac:H(A),exactSucceededAmountMinor:3000},
   {cancellationIdHmac:H(B),exactSucceededAmountMinor:5900},
  ]);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl.mock.calls[0]?.[0]).toBe(
   'https://api.portone.io/payments/payment-exact-source'
  );
  expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
   method:'GET',redirect:'manual',
   headers:{accept:'application/json',authorization:'PortOne '+API},
  });
  for(const forbidden of [A,B,SECRET,API,PAYMENT_ID,ORIGINAL_TX])
   expect(JSON.stringify(r)).not.toContain(forbidden);
 });
 it('preserves unordered successful set despite GET cancellation ordering change',async()=>{
  const r=await run({...INPUT,fetchImpl:f({
   ...PAYMENT,cancellations:[PAYMENT.cancellations[1],PAYMENT.cancellations[0]],
  })});
  expect(new Set(r.successfulItems.map(x=>x.cancellationIdHmac)))
   .toEqual(new Set([H(A),H(B)]));
 });
 it('can represent one successful partial payment without claiming settlement or legal conclusion',async()=>{
  const r=await run({...INPUT,fetchImpl:f({
   ...PAYMENT,status:'PARTIAL_CANCELLED',
   amount:{paid:8900,cancelled:3000},
   cancellations:[PAYMENT.cancellations[0]],
  })});
  expect(r).toMatchObject({
   kind:'partial_cancel_shape_observed',
   observedCancelledTotalMinor:3000,
   grantRevocationAuthorized:false,
  });
  expect(r.successfulItems).toHaveLength(1);
 });
 it('does not treat pending or failed cancellation as a succeeded item',async()=>{
  const r=await run({...INPUT,fetchImpl:f({
   ...PAYMENT,status:'PARTIAL_CANCELLED',
   amount:{paid:8900,cancelled:3000},
   cancellations:[
    PAYMENT.cancellations[0],
    {id:B,status:'REQUESTED',totalAmount:5900},
   ],
  })});
  expect(r.unresolvedItemsObserved).toBe(true);
  expect(r.successfulItems).toHaveLength(1);
 });
 it.each([
  ['duplicate IDs',[PAYMENT.cancellations[0],PAYMENT.cancellations[0]]],
  ['amount inconsistent',[
   {id:A,status:'SUCCEEDED',totalAmount:4000},PAYMENT.cancellations[1],
  ]],
  ['unknown status',[
   {id:A,status:'NEW',totalAmount:3000},PAYMENT.cancellations[1],
  ]],
 ])('rejects %s from provider response',async(_label,cancellations)=>{
  await expect(run({...INPUT,fetchImpl:f({...PAYMENT,cancellations})}))
   .rejects.toThrow('readback unavailable');
 });
 it.each([
  ['wrong payment', {...PAYMENT,id:'other'}],
  ['wrong transaction', {...PAYMENT,transactionId:'other'}],
  ['wrong currency', {...PAYMENT,currency:'USD'}],
  ['sandbox channel', {...PAYMENT,channel:{type:'TEST'}}],
  ['wrong version', {...PAYMENT,version:'V1'}],
 ])('rejects %s rather than projecting any HMAC',async(_label,body)=>{
  await expect(run({...INPUT,fetchImpl:f(body)}))
   .rejects.toThrow('readback unavailable');
 });
 it('rejects non-200 or non-JSON provider GET',async()=>{
  await expect(run({...INPUT,fetchImpl:f(PAYMENT,401)}))
   .rejects.toThrow('readback unavailable');
  await expect(run({...INPUT,fetchImpl:f(PAYMENT,200,{'content-type':'text/html'})}))
   .rejects.toThrow('readback unavailable');
 });
 it('rejects unknown or weak configuration before fetch',async()=>{
  for(const change of [
   {sourceHmacSecret:'weak'},{providerPaymentId:'bad\nheader'},
   {apiSecret:'short'},{environment:'sandbox' as 'production'},
  ]){
   const fetchImpl=f();
   await expect(run({...INPUT,...change,fetchImpl})).rejects.toThrow();
   expect(fetchImpl).not.toHaveBeenCalled();
  }
 });
 it('denies more than the provider bounded 64 cancellation items',async()=>{
  const cancellations=Array.from({length:65},(_,i)=>({
   id:'cancel-'+i,status:'SUCCEEDED',totalAmount:1,
  }));
  await expect(run({...INPUT,fetchImpl:f({
   ...PAYMENT,status:'PARTIAL_CANCELLED',
   amount:{paid:8900,cancelled:65},cancellations,
  })})).rejects.toThrow('readback unavailable');
 });
});
