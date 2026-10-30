import {describe,expect,it} from 'vitest';
import {createAdminAnalyticsVerifiedBirthAdapterV1,ADMIN_ANALYTICS_VERIFIED_BIRTH_SQL_V1} from './admin-analytics-verified-birth-v1.js';
import type {AdminAnalyticsCollectionPolicyV1,AdminAnalyticsStoredEventV1} from './admin-analytics-pipeline-v1.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';
const REV='123e4567-e89b-42d3-a456-426614174050',OWNER='123e4567-e89b-42d3-a456-426614174051';
const VISITOR='av_'+'f'.repeat(64),SESSION='as_'+'e'.repeat(64),now=new Date('2026-10-28T10:00:00Z');
const policy:AdminAnalyticsCollectionPolicyV1={enabled:true,approvalRef:'test-only',policyVersion:'policy-1',
  retentionSeconds:15552000,deletionBindingVerified:true,validVisitPolicyVersion:'test-visit',approvedEvents:['BIRTH_RECORD_COMPLETED']};
const consent={visitorRef:VISITOR,sessionRef:SESSION,version:'consent-1',granted:true,validVisitor:true,expiresAt:'2026-11-01T00:00:00Z'};
const base={revisionId:REV,subjectId:OWNER,createdAt:'2026-10-28T09:00:00Z'};
function harness(source:typeof base|null=base,valid=true,owner:string|null=OWNER){
 const events=new Map<string,AdminAnalyticsStoredEventV1>();const sql:string[]=[];
 const pool:PostgresSubjectPoolV1={async connect(){return{async query<T=Record<string,unknown>>(query:string){
  sql.push(query);return{rows:(query.startsWith('SELECT current_user')?[{currentUser:'myeongha_admin_reader'}]:
    query===ADMIN_ANALYTICS_VERIFIED_BIRTH_SQL_V1?(source?[source]:[]):[]) as unknown as T[]};
 },release(){}};}};
 const adapter=createAdminAnalyticsVerifiedBirthAdapterV1({pool,policy,secret:'test-secret-long-enough-for-analytics-refs',
  consent:{async resolve(){return consent;},async withdraw(){return[];}},resolveActiveSubject:async()=>owner,now:()=>now,
  store:{async isSubjectConsentActive(){return valid;},async append(e){const previous=events.get(e.eventId);
    if(previous&&JSON.stringify(previous)!==JSON.stringify(e))throw Error('collision');
    if(previous)return'replayed';events.set(e.eventId,e);return'inserted';},
    async eraseVisitor(){},async eraseSubject(){},async purgeExpired(){return 0;}}});
 return{adapter,events,sql};
}
const req=()=>new Request('https://service.test/internal/self-birth-saved');
describe('consented self birth-record completion evidence',()=>{
 it('only records persisted, current self revision without leaking birth inputs',async()=>{
  const h=harness();expect(await h.adapter.record(req(),REV)).toBe('inserted');
  expect(await h.adapter.record(req(),REV)).toBe('replayed');
  expect([...h.events.values()][0]).toMatchObject({eventName:'BIRTH_RECORD_COMPLETED',paidPurchase:null,payload:{},authority:'server_verified'});
  expect(ADMIN_ANALYTICS_VERIFIED_BIRTH_SQL_V1).toContain("p.profile_kind='self'");
  expect(ADMIN_ANALYTICS_VERIFIED_BIRTH_SQL_V1).toContain('p.current_revision_id=v.id');
  expect(ADMIN_ANALYTICS_VERIFIED_BIRTH_SQL_V1).not.toMatch(/birth_date|birth_time|input_hash|calendar_type|sex\b/iu);
 });
 it('rejects unsaved, foreign, future, or pre-consent birth revisions',async()=>{
  for(const h of [harness(null),harness(base,false),harness(base,true,null),harness({...base,subjectId:'123e4567-e89b-42d3-a456-426614174052'}),
    harness({...base,createdAt:'2026-10-28T11:00:00Z'})]){
   await expect(h.adapter.record(req(),REV)).rejects.toThrow();expect(h.events.size).toBe(0);
  }
 });
});
