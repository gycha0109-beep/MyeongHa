import {describe,it,expect} from 'vitest';
import {initializeMyeonghaAnalyticsV1} from '../apps/web/admin-analytics-collector.js';
import {createAdminAnalyticsConsentRuntimeV1} from '../apps/api/src/admin-analytics-consent-v1.ts';

const origin='https://consent.example.test';
const policy={enabled:true,approved:true,approvalRef:'test-owner-approval',policyVersion:'test-policy-v1',
 retentionSeconds:180*86400,deletionBindingVerified:true,validVisitPolicyVersion:'test-visit-v1',
 approvedEvents:['PAGE_VIEWED']};
const deferred=()=>Promise.withResolvers();
function harness(){
 const grants=new Set(),events=new Map(),calls=[];let cookie='',rejectWithdrawal=false;
 const firstHeaders=deferred(),grantStored=deferred();let wait=true;
 const store={
  async bindConsent(consent){grants.add(consent.visitorRef);},
  async isConsentActive(consent){return grants.has(consent.visitorRef);},
  async append(event){events.set(event.eventId,event);return'inserted';},
  async eraseVisitor(ref){grants.delete(ref);for(const [id,event]of events)if(event.anonymousOrSubjectRef===ref)events.delete(id);},
  async eraseSubject(){grants.clear();events.clear();},async purgeExpired(){return 0;},
 };
 const server=createAdminAnalyticsConsentRuntimeV1({origin,secret:'synthetic-consent-test-secret-long-enough',store,
  policy,enabled:true,allowRequest:async()=>true,resolveActiveSubject:async()=>null,admitVisitor:async()=>true});
 const fetchImpl=async(path,options)=>{
  calls.push(path);
  if(path.endsWith('/withdraw')&&rejectWithdrawal)return Response.json({code:'ANALYTICS_WITHDRAWAL_INCOMPLETE'},{status:503});
  const response=await server.handleRequest(new Request(origin+path,{...options,
   headers:{...options.headers,Origin:origin,...(cookie?{Cookie:cookie}:{})}}));
  if(path.endsWith('/consent')&&JSON.parse(options.body).decision==='grant'&&wait){
   wait=false;grantStored.resolve();await firstHeaders.promise;
  }
  // Model the browser installing HttpOnly cookies when response headers arrive.
  const setCookie=response.headers.get('set-cookie');
  if(setCookie)cookie=setCookie.includes('Max-Age=0')?'':setCookie.split(';')[0];
  return response;
 };
 return {grants,events,calls,fetchImpl,grantStored:grantStored.promise,
  finishGrant:()=>firstHeaders.resolve(),rejectWithdrawal:value=>{rejectWithdrawal=value;},cookie:()=>cookie};
}
function locks(){
 let tail=Promise.resolve();const names=[];
 return {names,request(name,options,callback){names.push(name);expect(options.signal).toBeInstanceOf(AbortSignal);
  const next=tail.then(callback);tail=next.catch(()=>undefined);return next;}};
}
describe('browser consent cookie and durable server withdrawal ordering',()=>{
 it('erases a committed grant even when its response arrives after the user clicks withdraw',async()=>{
  const h=harness(),collector=initializeMyeonghaAnalyticsV1({enabled:true,policy,fetchImpl:h.fetchImpl});
  const grant=collector.grantConsent();await h.grantStored;
  expect(h.grants.size).toBe(1);expect(h.cookie()).toBe('');
  const withdrawal=collector.withdraw();
  const repeatedWithdrawal=collector.withdraw();
  expect(await collector.grantConsent()).toEqual({status:'withdrawal_pending'});
  expect(await collector.restoreConsent()).toEqual({status:'withdrawal_pending'});
  expect(await collector.track('PAGE_VIEWED',{pageKey:'test'})).toEqual({status:'consent_required'});
  expect(h.calls).toEqual(['/api/analytics/consent']);
  h.finishGrant();
  expect(await grant).toEqual({status:'cancelled'});
  expect(await withdrawal).toEqual({status:'withdrawn'});
  expect(await repeatedWithdrawal).toEqual({status:'withdrawn'});
  expect(h.grants.size).toBe(0);expect(h.events.size).toBe(0);expect(h.cookie()).toBe('');
  expect(h.calls).toEqual(['/api/analytics/consent','/api/analytics/withdraw']);
 });
 it('uses one origin-scoped lock for grant and withdrawal in separate tabs',async()=>{
  const h=harness(),lockManager=locks();
  const first=initializeMyeonghaAnalyticsV1({enabled:true,policy,fetchImpl:h.fetchImpl,lockManager});
  const other=initializeMyeonghaAnalyticsV1({enabled:true,policy,fetchImpl:h.fetchImpl,lockManager});
  const grant=first.grantConsent();await h.grantStored;
  const withdrawal=other.withdraw();await Promise.resolve();
  expect(h.calls).toEqual(['/api/analytics/consent']);
  h.finishGrant();await grant;
  expect(await withdrawal).toEqual({status:'withdrawn'});
  expect(h.grants.size).toBe(0);expect(h.cookie()).toBe('');
  expect(new Set(lockManager.names).size).toBe(1);expect(lockManager.names.length).toBeGreaterThanOrEqual(2);
  // A different tab may retain local context, but the server ledger revokes it.
  expect(await first.track('PAGE_VIEWED',{pageKey:'test'})).not.toMatchObject({status:'recorded'});
  expect(h.events.size).toBe(0);
 });
 it('keeps collection blocked after failed server erasure until an explicit successful retry',async()=>{
  const h=harness(),collector=initializeMyeonghaAnalyticsV1({enabled:true,policy,fetchImpl:h.fetchImpl});
  const grant=collector.grantConsent();await h.grantStored;h.finishGrant();await grant;
  h.rejectWithdrawal(true);
  expect(await collector.withdraw()).toEqual({status:'withdrawal_pending'});
  expect(await collector.grantConsent()).toEqual({status:'withdrawal_pending'});
  expect(await collector.startSession()).toEqual({status:'withdrawal_pending'});
  expect(collector.setConsent({granted:true})).toBe(false);
  h.rejectWithdrawal(false);
  expect(await collector.withdraw()).toEqual({status:'withdrawn'});
  expect(h.grants.size).toBe(0);expect(h.cookie()).toBe('');
 });
});
