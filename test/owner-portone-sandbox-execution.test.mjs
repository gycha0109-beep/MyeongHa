// Watchtower-Track: commerce-payment
// Execute the real console with isolated DOM/transport seams. No real PSP or DB.
import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import * as guards from '../apps/web/owner-portone-sandbox-contract.js';

const ID='11111111-1111-4111-8111-111111111111';
const source=readFileSync(new URL('../apps/web/owner-portone-sandbox.js',import.meta.url),'utf8')
 .replace(/import \{getActiveBearer\} from '\.\/product-auth\.js';/u,'')
 .replace(/import \{[\s\S]*?\} from '\.\/owner-portone-sandbox-contract\.js';/u,'');

async function consoleFixture({sdkFails=false,sdkMissing=false,hint,storedAttempt=false}={}){
 const elements=new Map();
 const stored=new Map(storedAttempt?[['myeongha.ownerKcpSandboxAttempt.v1',ID]]:[]);
 const sdk={requestPayment:vi.fn(async()=>hint)};
 const sandbox={...guards,crypto:webcrypto,window:{},
  getActiveBearer:async()=>({kind:'member',token:'isolated-fixture-only'}),
  sessionStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},
 };
 const scripts=[];
 sandbox.document={
  getElementById(id){
   if(!elements.has(id))elements.set(id,{textContent:'',disabled:true,addEventListener(){}});
   return elements.get(id);
  },
  createElement:()=>({}),
  head:{appendChild(el){scripts.push(el);queueMicrotask(()=>{
   if(sdkFails)el.onerror();
   else {if(!sdkMissing)sandbox.window.PortOne=sdk;el.onload();}
  });}},
 };
 sandbox.fetch=vi.fn(async path=>{
  let data;
  if(path==='/api/me/credits')data={isOwnerAdmin:true,creditExempt:true};
  else if(path.endsWith('/test-prepare'))data={purchaseIntentId:ID,paymentAttemptId:ID,
   providerRequestId:'mha_pa_'+'b'.repeat(32),status:'created',replayed:false,
   environment:'sandbox',productionCreditsIssued:false};
  else if(path.endsWith('/test-checkout'))data={paymentAttemptId:ID,environment:'sandbox',checkout:{
   storeId:'store-d9211773-4c6a-4736-9be7-c828405238bc',
   channelKey:'channel-key-d8049c19-c6e9-4729-8da1-ff6a1ab23100',
   paymentId:'mha_pa_'+'b'.repeat(32),orderName:'명하 채팅 크레딧 300개',
   totalAmount:1900,currency:'CURRENCY_KRW',payMethod:'CARD',
   products:[{id:'myeongha-chat-credits-300-v1',name:'명하 채팅 크레딧 300개',amount:1900,quantity:1}],
  }};
  else if(path.endsWith('/test-verify'))data={paymentAttemptId:ID,environment:'sandbox',
   providerVerifiedPaid:true,receiptPersisted:true,receiptId:ID,providerEventId:ID,
   replayed:true,productionCreditsIssued:false};
  else throw Error('Unexpected fixture request');
  return {ok:true,json:async()=>({ok:true,data})};
 });
 const client=runInNewContext(source+'\n;({beginTest,checkExisting})',sandbox);
 await vi.waitFor(()=>expect(elements.get('owner-test-pay').disabled).toBe(false));
 return {client,fetch:sandbox.fetch,scripts,sdk,elements,stored};
}

describe('Owner sandbox console SDK/Attempt execution ordering',()=>{
 it.each([{sdkFails:true},{sdkMissing:true}])('creates no Attempt on SDK failure %j',async options=>{
  const f=await consoleFixture(options);
  await f.client.beginTest();
  expect(f.fetch.mock.calls.map(([p])=>p)).toEqual(['/api/me/credits']);
  expect(f.scripts.map(s=>s.src)).toEqual(['/owner-portone-sdk-v2.js']);
  expect(f.sdk.requestPayment).not.toHaveBeenCalled();
  expect(f.elements.get('owner-test-diagnostic').textContent).toContain('포트원 SDK 로딩');
  expect(f.elements.get('owner-test-pay').disabled).toBe(false);
 });
 it('deduplicates concurrent clicks and verifies the original Attempt after an untrusted callback',async()=>{
  const f=await consoleFixture({hint:{paymentId:'untrusted-callback-id'}});
  await Promise.all([f.client.beginTest(),f.client.beginTest()]);
  expect(f.scripts).toHaveLength(1);
  expect(f.sdk.requestPayment).toHaveBeenCalledOnce();
  expect(f.fetch.mock.calls.map(([p])=>p)).toEqual(['/api/me/credits',
   '/api/me/credits/portone/test-prepare','/api/me/credits/portone/test-checkout',
   '/api/me/credits/portone/test-verify']);
  expect(JSON.parse(f.fetch.mock.calls.at(-1)[1].body)).toEqual({paymentAttemptId:ID});
  expect(f.elements.get('owner-test-receipt').textContent).toContain('(재확인)');
  expect(f.elements.get('owner-test-status').textContent).toContain('운영 크레딧은 지급되지 않았습니다');
 });
 it('retains the Attempt for server recheck after a sanitized SDK error',async()=>{
  const f=await consoleFixture({hint:{code:'PAY_PROCESS_CANCELED',message:'cancelled'}});
  await f.client.beginTest();
  expect(f.fetch.mock.calls.some(([p])=>p.endsWith('/test-verify'))).toBe(false);
  expect(f.elements.get('owner-test-diagnostic').textContent).toContain('PAY_PROCESS_CANCELED');
  await f.client.checkExisting();
  expect(JSON.parse(f.fetch.mock.calls.at(-1)[1].body)).toEqual({paymentAttemptId:ID});
 });
 it('rechecks the remembered Attempt after reload without creating another payment',async()=>{
  const f=await consoleFixture({storedAttempt:true});
  await f.client.checkExisting();
  await f.client.checkExisting();
  expect(f.scripts).toHaveLength(0);
  expect(f.fetch.mock.calls.map(([p])=>p)).toEqual(['/api/me/credits',
   '/api/me/credits/portone/test-verify','/api/me/credits/portone/test-verify']);
 });
});
