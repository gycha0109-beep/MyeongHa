import { describe,expect,it,vi } from 'vitest';
import {
  PORTONE_V2_CANCELLATION_READBACK_GET_V1 as config,
  inspectPortOneV2CancellationViaGetCandidateV1 as run,
} from '../apps/api/src/portone-v2-cancellation-readback-get-v1.js';

const ORIGINAL={
  providerPaymentId:'paid-order-1',
  originalTransactionId:'tx-1',
  originalVerifiedPaidAmountMinor:8900,
  originalCurrency:'KRW',
  environment:'production' as const,
  cancellationId:'cancel-1',
  apiSecret:'local-only-test-portone-secret-value',
};
const PAYMENT={
  id:'paid-order-1',transactionId:'tx-1',
  status:'CANCELLED',version:'V2',currency:'KRW',
  channel:{type:'LIVE'},amount:{paid:8900,cancelled:8900},
  cancellations:[{id:'cancel-1',status:'SUCCEEDED',totalAmount:8900}],
};
function fakeFetch(value:unknown=PAYMENT,status=200,contentType='application/json'){
 const fetchImpl=vi.fn(async (_url:string,_init?:RequestInit)=>
   new Response(JSON.stringify(value),{
     status,headers:{'content-type':contentType},
   }));
 return fetchImpl as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}
describe('PortOne V2 cancellation readback read-only GET candidate',()=>{
 it('is not mounted and never enables PG cancel or Grant revocation',()=>{
  expect(config).toEqual({
   productionMounted:false,externalCancellationPostEnabled:false,
   paymentLookupHttpMethod:'GET',
   endpoint:'https://api.portone.io',
   maxResponseBytes:262144,timeoutMilliseconds:10000,
   entitlementMutationEnabled:false,
  });
 });
 it('uses fixed PortOne origin with GET/redirect manual and no POST',async()=>{
  const fetchImpl=fakeFetch();
  const result=await run({...ORIGINAL,fetchImpl});
  expect(result).toMatchObject({
   kind:'full_cancel_shape_observed',
   providerReadbackFromAuthenticatedGet:true,
   sourceAuthenticityProven:false,
   originalReceiptProven:false,
   entitlementRevocationAuthorized:false,
   refundExecutionAuthorized:false,
  });
  const [url,init]=fetchImpl.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe('https://api.portone.io/payments/paid-order-1');
  expect(init.method).toBe('GET');
  expect(init.redirect).toBe('manual');
  expect(init.headers).toMatchObject({
    authorization:'PortOne local-only-test-portone-secret-value',
    accept:'application/json',
  });
  expect(result).not.toHaveProperty('apiSecret');
  expect(result).not.toHaveProperty('paymentId');
 });
 it('recognizes partial cancellation without revocation',async()=>{
  const fetchImpl=fakeFetch({
    ...PAYMENT,status:'PARTIAL_CANCELLED',
    amount:{paid:8900,cancelled:3000},
    cancellations:[{...PAYMENT.cancellations[0],totalAmount:3000}],
  });
  const r=await run({...ORIGINAL,fetchImpl});
  expect(r.kind).toBe('partial_cancel_shape_observed');
  expect(r.entitlementRevocationAuthorized).toBe(false);
 });
 it.each([301,302,400,403,429,500,503])('rejects unexpected HTTP %i without exposing upstream response',async status=>{
  const fetchImpl=fakeFetch({sensitive:'private'},status);
  await expect(run({...ORIGINAL,fetchImpl})).rejects.toThrow('readback unavailable');
 });
 it('rejects response content-type mismatch',async()=>{
  const fetchImpl=fakeFetch(PAYMENT,200,'text/html');
  await expect(run({...ORIGINAL,fetchImpl})).rejects.toThrow('unavailable');
 });
 it('rejects oversized body before parsing',async()=>{
  const fetchImpl=fakeFetch({large:'x'.repeat(270000)});
  await expect(run({...ORIGINAL,fetchImpl})).rejects.toThrow('unavailable');
 });
 it('rejects malformed original trusted identifiers before using network',async()=>{
  const fetchImpl=fakeFetch();
  await expect(run({...ORIGINAL,providerPaymentId:'bad\r\nHost:attacker',fetchImpl}))
   .rejects.toThrow('Invalid internal');
  expect(fetchImpl).not.toHaveBeenCalled();
 });
 it('rejects invalid/undersized secret before calling the PSP',async()=>{
  const fetchImpl=fakeFetch();
  await expect(run({...ORIGINAL,apiSecret:'short',fetchImpl})).rejects.toThrow('Invalid internal');
  expect(fetchImpl).not.toHaveBeenCalled();
 });
 it('does not silently match a different provider transaction',async()=>{
  const fetchImpl=fakeFetch({...PAYMENT,transactionId:'different-tx'});
  const result=await run({...ORIGINAL,fetchImpl});
  expect(result.kind).toBe('inconsistent_or_unrecognized');
  expect(result.entitlementRevocationAuthorized).toBe(false);
 });
});
