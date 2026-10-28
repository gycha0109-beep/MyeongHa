import {describe,it,expect} from 'vitest';
import {ANALYTICS_RETENTION_SECONDS_V1} from './admin-operating-policy-v1.js';
import {createAdminAnalyticsConsentRuntimeV1,type AdminAnalyticsConsentStoreV1} from './admin-analytics-consent-v1.js';
import {withAdminAnalyticsDeletionV1} from './admin-analytics-maintenance-v1.js';
import {deriveAdminAnalyticsReferenceV1,type AdminAnalyticsStoredEventV1,type AdminAnalyticsCollectionPolicyV1} from './admin-analytics-pipeline-v1.js';
import type {PostgresAccountDeletionWorkerPortsV1} from './postgres-account-deletion-worker.js';
const now=new Date('2026-10-27T12:00:00Z'),origin='https://service.test',secret='synthetic-local-consent-secret-at-least32';
const subject='123e4567-e89b-42d3-a456-426614174000';
const policy:AdminAnalyticsCollectionPolicyV1={enabled:true,approvalRef:'owner-20261027',policyVersion:'product-analytics-180d-v1',retentionSeconds:ANALYTICS_RETENTION_SECONDS_V1,deletionBindingVerified:true,validVisitPolicyVersion:'bound-test-admission-v1',approvedEvents:['PRODUCT_VIEWED']};
function harness(enabled=true){
 const granted=new Set<string>(),events=new Map<string,AdminAnalyticsStoredEventV1>();let calls=0;let activeSubject:string|null=subject;
 const store:AdminAnalyticsConsentStoreV1={async bindConsent(c){calls++;granted.add(c.visitorRef);},async isConsentActive(c){calls++;return granted.has(c.visitorRef);},
 async append(e){calls++;events.set(e.eventId,e);return'inserted';},async eraseVisitor(ref){calls++;granted.delete(ref);for(const[id,event]of events)if(event.anonymousOrSubjectRef===ref)events.delete(id);},async eraseSubject(){calls++;granted.clear();events.clear();},async purgeExpired(){calls++;return 0;}};
 const runtime=createAdminAnalyticsConsentRuntimeV1({origin,secret,store,policy,enabled,allowRequest:async()=>true,resolveActiveSubject:async()=>activeSubject,admitVisitor:async()=>true,now:()=>now});
 const post=(path:string,body:unknown,cookie?:string,context?:string)=>new Request(origin+'/api/analytics/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(context?{'X-MyeongHa-Analytics-Session':context}:{})},body:JSON.stringify(body)});
 return{runtime,events,store,post,calls:()=>calls,subject(value:string|null){activeSubject=value;}};
}
describe('explicit consent and fixed 180-day retention',()=>{
 it('does no consent/identity/storage work before explicit activation',async()=>{
  const h=harness(false);expect((await h.runtime.handleRequest(h.post('consent',{decision:'grant'}))).status).toBe(503);expect(h.calls()).toBe(0);
 });
 it('issues a protected receipt only after an explicit grant, collects within it and withdraws despite disabled collection',async()=>{
  const h=harness();const response=await h.runtime.handleRequest(h.post('consent',{decision:'grant'}));expect(response.status).toBe(200);
  const data=await response.json() as {consent:{visitorRef:string;expiresAt:string}};const cookie=response.headers.get('set-cookie')!;
  expect(data.consent).not.toHaveProperty('sessionRef');
  expect(cookie).toContain('Secure; HttpOnly; SameSite=Strict');expect(cookie).not.toContain(subject);expect(Date.parse(data.consent.expiresAt)-now.getTime()).toBe(180*86400_000);
  const sessionResponse=await h.runtime.handleRequest(h.post('session',{},cookie));const session=await sessionResponse.json();
  const second=await(await h.runtime.handleRequest(h.post('session',{},cookie))).json();expect(second.sessionRef).not.toBe(session.sessionRef);expect(sessionResponse.headers.has('set-cookie')).toBe(false);
  const event={eventId:subject,eventName:'PRODUCT_VIEWED',eventSchemaVersion:'admin-analytics-pipeline-v1',occurredAt:now.toISOString(),anonymousOrSubjectRef:data.consent.visitorRef,sessionRef:session.sessionRef,client:'web',payload:{pageKey:'product'}};
  expect((await h.runtime.handleRequest(h.post('events',event,cookie))).status).toBe(403);
  expect((await h.runtime.handleRequest(h.post('events',event,cookie,session.sessionContext))).status).toBe(200);expect(h.events.get(subject)?.expiresAt).toBe(data.consent.expiresAt);
  expect((await h.runtime.handleRequest(h.post('events',{...event,sessionRef:second.sessionRef},cookie,session.sessionContext))).status).toBe(403);
  h.subject(null);expect((await h.runtime.handleRequest(h.post('events',{...event,eventId:'123e4567-e89b-42d3-a456-426614174001'},cookie,session.sessionContext))).status).toBe(403);
  const disabled=createAdminAnalyticsConsentRuntimeV1({origin,secret,store:h.store,policy,enabled:false,allowRequest:async()=>true,resolveActiveSubject:async()=>null,admitVisitor:async()=>false,now:()=>now});
  const revoked=await disabled.handleRequest(h.post('withdraw',{},cookie));expect(revoked.status).toBe(200);expect(revoked.headers.get('set-cookie')).toContain('Max-Age=0');expect(h.events.size).toBe(0);
  h.subject(subject);expect((await h.runtime.handleRequest(h.post('events',event,cookie,session.sessionContext))).status).toBe(403);
 });
 it('restores only a server-signed and still active consent, never grants by status polling',async()=>{
  const h=harness();
  expect((await h.runtime.handleRequest(h.post('consent',{decision:'status'}))).status).toBe(403);
  expect(h.calls()).toBe(0);
  const grant=await h.runtime.handleRequest(h.post('consent',{decision:'grant'}));
  const cookie=grant.headers.get('set-cookie')!;
  const restored=await h.runtime.handleRequest(h.post('consent',{decision:'status'},cookie));
  expect(restored.status).toBe(200);
  const body=await restored.json() as {code:string;consent:Record<string,unknown>};
  expect(body.code).toBe('ANALYTICS_CONSENT_ACTIVE');
  expect(body.consent).toMatchObject({granted:true,version:'product-analytics-consent-180d-v1'});
  expect(body.consent).not.toHaveProperty('sessionRef');
  expect(restored.headers.has('set-cookie')).toBe(false);
  h.subject(null);
  expect((await h.runtime.handleRequest(h.post('consent',{decision:'status'},cookie))).status).toBe(403);
  h.subject(subject);
  await h.store.eraseVisitor(body.consent.visitorRef as string);
  expect((await h.runtime.handleRequest(h.post('consent',{decision:'status'},cookie))).status).toBe(403);
  expect((await h.runtime.handleRequest(h.post('consent',{decision:'status',visitorRef:'caller'}))).status).toBe(400);
 });
 it('rejects forged receipts, client identity/consent assertions and over-retained events',async()=>{
  const h=harness();expect((await h.runtime.handleRequest(h.post('consent',{decision:'grant',extra:true}))).status).toBe(400);
  const r=await h.runtime.handleRequest(h.post('consent',{decision:'grant'}));const cookie=r.headers.get('set-cookie')!;const value=(await r.json()).consent;
  const session=await(await h.runtime.handleRequest(h.post('session',{},cookie))).json();
  const e={eventId:subject,eventName:'PRODUCT_VIEWED',eventSchemaVersion:'admin-analytics-pipeline-v1',occurredAt:new Date(now.getTime()-180*86400_000).toISOString(),anonymousOrSubjectRef:value.visitorRef,sessionRef:session.sessionRef,client:'web',payload:{}};
  expect((await h.runtime.handleRequest(h.post('events',e,cookie,session.sessionContext))).status).toBe(400);expect(h.events.size).toBe(0);
  expect(await h.runtime.consent.resolve(h.post('events',{},cookie.replace('=','=.')))).toBeNull();
 });
 it('erases subject linkage before finalization and completion and refuses false completion on erasure failure',async()=>{
  const h=harness();const calls:string[]=[];
  const original={dbFinalizerPort:{async finalizeDatabase(){calls.push('finalize');return{finalized:true,replayed:false,authMappingPresent:true};}},completionPort:{async completeDeletion(){calls.push('complete');return{completed:true,replayed:false,completedAt:now.toISOString()};}}} as unknown as PostgresAccountDeletionWorkerPortsV1;
  const store={...h.store,async eraseSubject(ref:string){calls.push(ref);}};
  const wrapped=withAdminAnalyticsDeletionV1({ports:original,store,secret});const command={subjectId:subject,deletionJobId:subject,lockOwner:'claimed-worker'};
  await wrapped.dbFinalizerPort.finalizeDatabase(command);await wrapped.completionPort.completeDeletion(command);
  const ref=deriveAdminAnalyticsReferenceV1(secret,'subject',subject);expect(calls).toEqual([ref,'finalize',ref,'complete']);
  const blocked=withAdminAnalyticsDeletionV1({ports:original,store:{...h.store,async eraseSubject(){throw Error('erase down');}},secret});
  await expect(blocked.completionPort.completeDeletion(command)).rejects.toThrow('erase down');expect(calls.filter(c=>c==='complete')).toHaveLength(1);
 });
});
