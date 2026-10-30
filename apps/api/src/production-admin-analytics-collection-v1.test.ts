import { describe, expect, it } from 'vitest';
import { createProductionAdminAnalyticsCollectionV1 } from './production-admin-analytics-collection-v1.js';
import type { AdminAnalyticsCollectionPolicyV1 } from './admin-analytics-pipeline-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const ORIGIN='https://myeongha.gycha0109.workers.dev';
const SUBJECT='123e4567-e89b-42d3-a456-426614174000';
const READING='123e4567-e89b-42d3-a456-426614174001';
const POLICY:AdminAnalyticsCollectionPolicyV1={
  enabled:true,approvalRef:'owner-approval-20261029',
  policyVersion:'product-analytics-180d-v1',
  retentionSeconds:180*86400,
  deletionBindingVerified:true,
  validVisitPolicyVersion:'valid-visit-defined-v1',
  approvedEvents:['PAGE_VIEWED','READING_COMPLETED'],
};
function createFixture(){
  const queries:string[]=[];
  const readerQueries:string[]=[];
  let now=new Date('2026-10-29T12:00:00.000Z');
  const writerPool:PostgresSubjectPoolV1={
    async connect(){return {
      async query<Row>(sql:string,values?:readonly unknown[]){
        queries.push(sql);
        if(sql.includes('SELECT current_user::text AS role'))return {rows:[{role:'myeongha_analytics_writer'}] as Row[]};
        if(sql.includes('SELECT true AS active'))return {rows:[{active:true}] as Row[]};
        if(sql.includes('INSERT INTO myeongha_admin_analytics.consents_v1'))return {rows:[{visitorRef:values?.[0]}] as Row[]};
        if(sql.includes('SELECT version,expires_at::text AS "expiresAt"'))
          return {rows:[{version:'product-analytics-consent-180d-v1',expiresAt:'2027-04-27T12:00:00.000Z'}] as Row[]};
        if(sql.includes('INSERT INTO myeongha_admin_analytics.events_v1'))
          return {rows:[{eventId:'123e4567-e89b-42d3-a456-426614174002'}] as Row[]};
        return {rows:[] as Row[]};
      }, release(){},
    };},
  };
  const readerPool:PostgresSubjectPoolV1={
    async connect(){return {
      async query<Row>(sql:string){
        readerQueries.push(sql);
        if(sql.includes('SELECT current_user::text AS "currentUser"'))
          return {rows:[{currentUser:'myeongha_admin_reader'}] as Row[]};
        if(sql.includes('FROM public.readings r')){
          return {rows:[{readingId:READING,subjectId:SUBJECT,
            completedAt:'2026-10-29T12:01:00.000Z'}] as Row[]};
        }
        return {rows:[] as Row[]};
      },release(){},
    };},
  };
  const request=(path:string,body:string,cookie?:string,sessionContext?:string)=>new Request(
    ORIGIN+path,{method:'POST',headers:{
      Origin:ORIGIN,'Content-Type':'application/json',
      ...(cookie===undefined?{}:{Cookie:cookie}),
      ...(sessionContext===undefined?{}:{'X-MyeongHa-Analytics-Session':sessionContext}),
    },body},
  );
  const base={
    origin:ORIGIN,secret:'analytics-test-secret-'.padEnd(48,'x'),
    writerPool,sourceReaderPool:readerPool,policy:POLICY,
    allowRequest:async()=>true,
    resolveActiveSubject:async()=>SUBJECT,
    admitVisitor:async()=>true,
    now:()=>now,
  };
  return{base,queries,readerQueries,request,advance:()=>{now=new Date('2026-10-29T12:02:00.000Z');}};
}

describe('Production opt-in analytics composition',()=>{
  it('is disabled without explicit activation and makes no DB calls',async()=>{
    const f=createFixture();
    const runtime=createProductionAdminAnalyticsCollectionV1(f.base);
    expect(runtime.status).toBe('disabled');
    expect('verifiedReading' in runtime).toBe(false);
    const result=await runtime.handleRequest(f.request('/api/analytics/consent','{"decision":"grant"}'));
    expect(result.status).toBe(503);
    expect((await result.json() as {code:string}).code).toBe('ANALYTICS_COLLECTION_DISABLED');
    expect(f.queries).toHaveLength(0);
    expect(f.readerQueries).toHaveLength(0);
  });

  it('only composes verified domain sources when approved policy and activation both hold',async()=>{
    const f=createFixture();
    const runtime=createProductionAdminAnalyticsCollectionV1({
      ...f.base,collectionEnabled:true,retentionMaintenanceReady:true,
    });
    expect(runtime.status).toBe('configured_source_unverified');
    expect(runtime.verifiedReading).toBeDefined();
    expect(runtime.verifiedPurchase).toBeDefined();
    expect(runtime.verifiedBirth).toBeDefined();
    const absentConsent=await runtime.handleRequest(f.request('/api/analytics/session','{}'));
    expect(absentConsent.status).toBe(403);
    const granted=await runtime.handleRequest(f.request('/api/analytics/consent','{"decision":"grant"}'));
    expect(granted.status).toBe(200);
    const cookie=granted.headers.get('Set-Cookie')!.split(';')[0]!;
    expect(cookie).toMatch(/^__Host-myeongha_analytics_consent=/);
    const session=await runtime.handleRequest(f.request('/api/analytics/session','{}',cookie));
    expect(session.status).toBe(200);
    const body=await session.json() as {sessionContext:string};
    f.advance();
    const verified=await runtime.verifiedReading!.record(
      f.request('/api/readings','{}',cookie,body.sessionContext),READING,
    );
    expect(verified).toBe('inserted');
    expect(f.readerQueries.some(s=>s.includes('FROM public.readings r'))).toBe(true);
    expect(f.queries.some(s=>s.includes('INSERT INTO myeongha_admin_analytics.events_v1'))).toBe(true);
  });

  it('fails closed on shared DB privilege scope and unapproved policy',async()=>{
    const f=createFixture();
    expect(()=>createProductionAdminAnalyticsCollectionV1({
      ...f.base,writerPool:f.base.sourceReaderPool,
    })).toThrow('separate database pools');
    const noPurge=createProductionAdminAnalyticsCollectionV1({
      ...f.base,collectionEnabled:true,
    });
    expect(noPurge.status).toBe('disabled');
    expect('verifiedReading' in noPurge).toBe(false);
    const runtime=createProductionAdminAnalyticsCollectionV1({
      ...f.base,collectionEnabled:true,retentionMaintenanceReady:true,
      policy:{...POLICY,deletionBindingVerified:false},
    });
    expect(runtime.status).toBe('disabled');
    expect('verifiedPurchase' in runtime).toBe(false);
    const result=await runtime.handleRequest(f.request('/api/analytics/events','{}'));
    expect(result.status).toBe(503);
    expect(f.queries).toHaveLength(0);
  });
});
