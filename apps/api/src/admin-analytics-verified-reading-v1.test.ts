import {describe,expect,it} from 'vitest';
import {createAdminAnalyticsVerifiedReadingAdapterV1,ADMIN_ANALYTICS_VERIFIED_READING_SQL_V1} from './admin-analytics-verified-reading-v1.js';
import type {AdminAnalyticsStoredEventV1,AdminAnalyticsCollectionPolicyV1} from './admin-analytics-pipeline-v1.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';

const READING='123e4567-e89b-42d3-a456-426614174040',SUBJECT='123e4567-e89b-42d3-a456-426614174041';
const VISITOR='av_'+'a'.repeat(64),SESSION='as_'+'b'.repeat(64),now=new Date('2026-10-28T10:00:00Z');
const completedAt='2026-10-28T09:00:00Z';
const policy:AdminAnalyticsCollectionPolicyV1={enabled:true,approvalRef:'test-only',policyVersion:'policy-v1',
  retentionSeconds:15552000,deletionBindingVerified:true,validVisitPolicyVersion:'test-visit',approvedEvents:['READING_COMPLETED']};
const consent={visitorRef:VISITOR,sessionRef:SESSION,version:'consent-v1',granted:true,validVisitor:true,expiresAt:'2026-11-01T00:00:00Z'};
function make(source:{readingId:string;subjectId:string;completedAt:string}|null={readingId:READING,subjectId:SUBJECT,completedAt},
  activeConsent=true,subject:string|null=SUBJECT){
  const events=new Map<string,AdminAnalyticsStoredEventV1>();const statements:string[]=[];const args:(readonly unknown[]|undefined)[]=[];
  const pool:PostgresSubjectPoolV1={async connect(){return{async query<T=Record<string,unknown>>(sql:string,values?:readonly unknown[]){
    statements.push(sql);args.push(values);
    return{rows:(sql.startsWith('SELECT current_user')?[{currentUser:'myeongha_admin_reader'}]:
      sql===ADMIN_ANALYTICS_VERIFIED_READING_SQL_V1?(source?[source]:[]):[]) as unknown as T[]};
  },release(){}};}};
  const adapter=createAdminAnalyticsVerifiedReadingAdapterV1({pool,policy,secret:'test-secret-long-enough-to-be-accepted-for-ref',
    consent:{async resolve(){return consent;},async withdraw(){return[];}},resolveActiveSubject:async()=>subject,now:()=>now,
    store:{async isSubjectConsentActive(){return activeConsent;},async append(e){const prior=events.get(e.eventId);
      if(prior&&JSON.stringify(prior)!==JSON.stringify(e))throw Error('event identity conflict');
      if(prior)return'replayed';events.set(e.eventId,e);return'inserted';},
      async eraseVisitor(){},async eraseSubject(){},async purgeExpired(){return 0;}}});
  return{adapter,events,statements,args};
}
const request=()=>new Request('https://service.test/internal/reading-completed');
describe('authoritative Reading-completed analytic signal',()=>{
  it('stores only completed and committed Reading with stable dedupe identity',async()=>{
    const h=make();
    expect(await h.adapter.record(request(),READING)).toBe('inserted');
    expect(await h.adapter.record(request(),READING)).toBe('replayed');
    expect(h.events.size).toBe(1);
    const event=[...h.events.values()][0]!;
    expect(event).toMatchObject({eventName:'READING_COMPLETED',occurredAt:'2026-10-28T09:00:00.000Z',
      authority:'server_verified',paidPurchase:null,client:'server',payload:{}});
    expect(h.args.filter((_,i)=>h.statements[i]===ADMIN_ANALYTICS_VERIFIED_READING_SQL_V1)).toEqual([[READING,SUBJECT],[READING,SUBJECT]]);
    expect(ADMIN_ANALYTICS_VERIFIED_READING_SQL_V1).toContain("r.execution_status='succeeded'");
    expect(ADMIN_ANALYTICS_VERIFIED_READING_SQL_V1).toContain("a.state='succeeded'");
    expect(ADMIN_ANALYTICS_VERIFIED_READING_SQL_V1).toContain('a.id=r.committed_execution_attempt_id');
    expect(ADMIN_ANALYTICS_VERIFIED_READING_SQL_V1).not.toMatch(/response_snapshot_jsonb|birth_|source_birth_input_hash/iu);
  });
  it('fails closed when success evidence, consent or owner correlation is absent',async()=>{
    for(const h of [make(null),make(undefined as never,false),make(undefined as never,true,null),
      make({readingId:READING,subjectId:'123e4567-e89b-42d3-a456-426614174042',completedAt}),
      make({readingId:READING,subjectId:SUBJECT,completedAt:'2026-10-28T11:00:00Z'})]){
      await expect(h.adapter.record(request(),READING)).rejects.toThrow();
      expect(h.events.size).toBe(0);
    }
  });
});
