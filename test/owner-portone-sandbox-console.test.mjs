// Watchtower-Track: commerce-payment
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {
 requireOwnerSandboxWalletV1,requireOwnerSandboxPreparedV1,
 requireOwnerSandboxCheckoutV1,requireOwnerSandboxServerPaidV1,
} from '../apps/web/owner-portone-sandbox-contract.js';

const ID='11111111-1111-4111-8111-111111111111';
const offer={
 storeId:'store-d9211773-4c6a-4736-9be7-c828405238bc',
 channelKey:'channel-key-d8049c19-c6e9-4729-8da1-ff6a1ab23100',
 paymentId:'mha_pa_'+'b'.repeat(32),
 orderName:'명하 채팅 크레딧 300개',totalAmount:1900,currency:'CURRENCY_KRW',
 payMethod:'CARD',
 products:[{id:'myeongha-chat-credits-300-v1',
  name:'명하 채팅 크레딧 300개',amount:1900,quantity:1}],
};
const envelope={ok:true,data:{paymentAttemptId:ID,environment:'sandbox',checkout:offer}};
describe('Owner KCP TEST console: no browser monetary authority',()=>{
 it('refuses Guest, ordinary Member and purported Owner lacking credit exemption',()=>{
  for(const data of [{isOwnerAdmin:false,creditExempt:false},
   {isOwnerAdmin:true,creditExempt:false},
   {isOwnerAdmin:false,creditExempt:true}]){
   expect(()=>requireOwnerSandboxWalletV1({ok:true,data})).toThrow();
  }
  expect(requireOwnerSandboxWalletV1({ok:true,data:{
   isOwnerAdmin:true,creditExempt:true,
  }})).toBe(true);
 });
 it('requires canonical server-issued sandbox Attempt and no credit mint',()=>{
  expect(requireOwnerSandboxPreparedV1({ok:true,data:{
   purchaseIntentId:ID,paymentAttemptId:ID,
   providerRequestId:offer.paymentId,status:'created',replayed:false,
   environment:'sandbox',productionCreditsIssued:false,
  }})).toEqual({paymentAttemptId:ID});
  for(const change of [{environment:'production'},{productionCreditsIssued:true},
    {providerRequestId:'mha_pa_'+'b'.repeat(64)},
    {status:'handed_off'},{paymentAttemptId:'invalid'}]){
   expect(()=>requireOwnerSandboxPreparedV1({ok:true,data:{
    purchaseIntentId:ID,paymentAttemptId:ID,providerRequestId:offer.paymentId,
    status:'created',replayed:false,environment:'sandbox',
    productionCreditsIssued:false,...change,
   }})).toThrow();
  }
 });
 it('fixes payment ID, one product, quantity, and exact currency/amount for SDK',()=>{
  expect(requireOwnerSandboxCheckoutV1(envelope,ID)).toEqual(offer);
  for(const modifications of [
   {totalAmount:1901},{currency:'CURRENCY_USD'},{payMethod:'EASY_PAY'},
   {paymentId:'mha_pa_'+'b'.repeat(64)}, {V2_API_Secret:'forged'},
   {products:[]},{products:[{...offer.products[0],quantity:300}]},
   {products:[{...offer.products[0],id:'other-product'}]},
  ]){
    expect(()=>requireOwnerSandboxCheckoutV1({
      ok:true,data:{...envelope.data,checkout:{...offer,...modifications}},
    },ID)).toThrow();
  }
  expect(()=>requireOwnerSandboxCheckoutV1(envelope,
   '22222222-2222-4222-8222-222222222222')).toThrow();
 });
 it('treats only PSP verified PAID as paid, never grants wallet credits',()=>{
   const base={paymentAttemptId:ID,environment:'sandbox',
     providerVerifiedPaid:true,receiptPersisted:false,productionCreditsIssued:false};
   expect(requireOwnerSandboxServerPaidV1({ok:true,data:base},ID)).toEqual({
     verified:true,receiptPersisted:false,productionCreditsIssued:false,
   });
   for(const modify of [
     {providerVerifiedPaid:false},{receiptPersisted:true},
     {productionCreditsIssued:true},{environment:'production'},
   ])expect(()=>requireOwnerSandboxServerPaidV1({ok:true,data:{
     ...base,...modify,
   }},ID)).toThrow();
   const paid={...base,receiptPersisted:true,
     receiptId:ID,providerEventId:ID,replayed:false};
   expect(requireOwnerSandboxServerPaidV1({ok:true,data:paid},ID))
     .toEqual({verified:true,receiptPersisted:true,receiptId:ID,
       replayed:false,productionCreditsIssued:false});
   expect(()=>requireOwnerSandboxServerPaidV1({ok:true,data:{
     ...paid,productionCreditsIssued:true,
   }},ID)).toThrow();
   expect(()=>requireOwnerSandboxServerPaidV1({ok:true,data:{
     ...paid,receiptId:'forged',
   }},ID)).toThrow();
 });
 it('isolates CDN CSP to one Owner test HTML route, without broad SPA relaxation',()=>{
   const worker=readFileSync(new URL('../cloudflare/myeongha-worker.mjs',import.meta.url),'utf8');
   const page=readFileSync(new URL('../apps/web/owner-portone-sandbox.html',import.meta.url),'utf8');
   const client=readFileSync(new URL('../apps/web/owner-portone-sandbox.js',import.meta.url),'utf8');
   expect(worker).toContain("url.pathname === '/owner-portone-sandbox.html'");
   expect(worker).toContain("script-src 'self' https://cdn.portone.io");
   expect(page).toContain('owner-portone-sandbox.js');
   expect(client).toContain("await serverRequest('/api/me/credits')");
   expect(client).toContain("requireOwnerSandboxWalletV1(data)");
   expect(client).toContain('crypto.getRandomValues(b)');
   expect(client).toContain("sdk.requestPayment(checkout)");
   expect(client).toContain("el.src='/owner-portone-sdk-v2.js'");
   expect(client).not.toContain("el.src='https://cdn.portone.io");
   expect(worker).toContain("isOwnerPortOneSdkRequestV1(request,url)");
   expect(worker).toContain("serveOwnerPortOneSdkV1()");
   expect(client.indexOf("const sdk=await loadPortOneSdk()"))
     .toBeLessThan(client.indexOf("serverRequest('/api/me/credits/portone/test-prepare'"));
   expect(client).toContain("el.async=true");
   expect(client).not.toContain("el.crossOrigin=");
   expect(client).not.toContain("el.setAttribute('crossorigin'");
   expect(page).not.toContain('crossorigin=');
   expect(client).not.toContain('window.location.search');
   expect(page).toContain('owner-test-diagnostic');
   expect(client).toContain("phase='sdk_request'");
   expect(client).toContain("showDiagnostic('sdk_request',hint)");
   expect(client).toContain("DIAGNOSTIC.textContent");
   expect(client).toContain("서버 결제상태 확인 필요");
   expect(client).toContain('safeSdkMessage');
   expect(client).toContain("if(phase==='sdk_load'||phase==='sdk_request'||phase==='verify')releaseRetryToken()");
   expect(client).toContain('A remembered Attempt must be verified as-is');
   expect(client).not.toContain('JSON.stringify(hint)');
 });
});
