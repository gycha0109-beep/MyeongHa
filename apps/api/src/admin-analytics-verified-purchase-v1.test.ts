import {describe,expect,it} from 'vitest';
import {ADMIN_ANALYTICS_FINANCIAL_SQL_V1,createAdminAnalyticsPostgresEventStoreV1} from './admin-analytics-pipeline-postgres-v1.js';
import {createAdminAnalyticsVerifiedPurchaseAdapterV1,ADMIN_ANALYTICS_VERIFIED_PURCHASE_SQL_V1} from './admin-analytics-verified-purchase-v1.js';
import {ADMIN_ANALYTICS_PIPELINE_VERSION_V1,type AdminAnalyticsStoredEventV1,type AdminAnalyticsCollectionPolicyV1} from './admin-analytics-pipeline-v1.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';

const RECEIPT='123e4567-e89b-42d3-a456-426614174031',SUBJECT='123e4567-e89b-42d3-a456-426614174032';
const VISITOR='av_'+'a'.repeat(64),SESSION='as_'+'b'.repeat(64);
const now=new Date('2026-10-28T08:00:00.000Z');
const consent={visitorRef:VISITOR,sessionRef:SESSION,version:'consent-1',granted:true,validVisitor:true,expiresAt:'2026-11-01T00:00:00.000Z'};
const policy:AdminAnalyticsCollectionPolicyV1={enabled:true,approvalRef:'test-only',policyVersion:'policy-1',retentionSeconds:15552000,
  deletionBindingVerified:true,validVisitPolicyVersion:'test-visit',approvedEvents:['READING_PURCHASED']};
const row={receiptId:RECEIPT,subjectId:SUBJECT,verifiedAt:'2026-10-28T07:00:00.000Z',amountMinor:'8900',productKey:'standard.love_relationship'};
function harness(source:typeof row | null=row, activeConsent=true, options:{subject?:string|null;enable?:boolean}={}) {
  const sql:string[]=[];const args:(readonly unknown[]|undefined)[]=[];const events=new Map<string,AdminAnalyticsStoredEventV1>();
  const pool:PostgresSubjectPoolV1={async connect(){return{async query<T=Record<string,unknown>>(query:string,values?:readonly unknown[]){
    sql.push(query);args.push(values);
    return {rows: (query.startsWith('SELECT current_user')?[{currentUser:'myeongha_admin_reader'}]:
      query===ADMIN_ANALYTICS_VERIFIED_PURCHASE_SQL_V1?(source?[source]:[]):[]) as unknown as T[]};
  },release(){}};}};
  const adapter=createAdminAnalyticsVerifiedPurchaseAdapterV1({
    pool,policy:{...policy,enabled:options.enable??true},secret:'a-trusted-secret-at-least-thirty-two-bytes',
    consent:{async resolve(){return consent;},async withdraw(){return[];}},
    resolveActiveSubject:async()=>options.subject===undefined?SUBJECT:options.subject,
    store:{
      async isSubjectConsentActive(){return activeConsent;},
      async append(event){const previous=events.get(event.eventId);if(previous&&JSON.stringify(previous)!==JSON.stringify(event))throw Error('Conflicting event');if(previous)return'replayed';events.set(event.eventId,event);return'inserted';},
      async eraseVisitor(){},async eraseSubject(){},async purgeExpired(){return 0;},
    },now:()=>now,
  });
  return{adapter,sql,args,events};
}
const request=()=>new Request('https://service.test/internal/server-verified-purchase');
describe('consented verified Reading purchase bridge',()=>{
  it('records an actual reading receipt with deterministic server verification and no user-provided funnel amount',async()=>{
    const h=harness();
    expect(await h.adapter.record(request(),RECEIPT)).toBe('inserted');
    expect(await h.adapter.record(request(),RECEIPT)).toBe('replayed');
    expect(h.events.size).toBe(1);
    const saved=[...h.events.values()][0]!;
    expect(saved).toMatchObject({eventName:'READING_PURCHASED',eventSchemaVersion:ADMIN_ANALYTICS_PIPELINE_VERSION_V1,
      occurredAt:row.verifiedAt,authority:'server_verified',paidPurchase:true,client:'server',anonymousOrSubjectRef:VISITOR});
    expect(saved.payload.purchaseRef).toMatch(/^ap_[a-f0-9]{64}$/u);
    expect(saved.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(h.sql.filter(q=>q===ADMIN_ANALYTICS_VERIFIED_PURCHASE_SQL_V1)).toHaveLength(2);
    expect(h.args.filter((_,i)=>h.sql[i]===ADMIN_ANALYTICS_VERIFIED_PURCHASE_SQL_V1)).toEqual([[RECEIPT,SUBJECT],[RECEIPT,SUBJECT]]);
    expect(ADMIN_ANALYTICS_VERIFIED_PURCHASE_SQL_V1).toContain("p.product_type='reading'");
    expect(ADMIN_ANALYTICS_VERIFIED_PURCHASE_SQL_V1).toContain("r.verification_status='verified'");
    expect(ADMIN_ANALYTICS_VERIFIED_PURCHASE_SQL_V1).not.toMatch(/verified_payload_jsonb|external_transaction_id|offer_snapshot_jsonb/iu);
  });
  it('refuses checkout intent, unverified source, different owner, or missing active consent',async()=>{
    for(const h of [harness(null),harness({...row,amountMinor:'0'}),harness({...row,subjectId:'123e4567-e89b-42d3-a456-426614174044'}),
      harness(row,false),harness(row,true,{subject:null}),harness(row,true,{enable:false})]){
      await expect(h.adapter.record(request(),RECEIPT)).rejects.toThrow();
      expect(h.events.size).toBe(0);
    }
  });
  it('requires the receipt verification time to be within the active consent period, never retroactively paid',async()=>{
    const h=harness({...row,verifiedAt:'2026-10-28T09:00:00Z'});
    await expect(h.adapter.record(request(),RECEIPT)).rejects.toThrow('verification time');
    const g=harness({...row,verifiedAt:'2026-04-01T09:00:00Z'});
    await expect(g.adapter.record(request(),RECEIPT)).rejects.toThrow();
  });
  it('checks durable Member/visitor/policy linkage AND consent grant timing from the private writer',async()=>{
    const queries:string[]=[];
    const pool:PostgresSubjectPoolV1={async connect(){return{async query<T=Record<string,unknown>>(sql:string){
      queries.push(sql);
      return{rows:(sql.includes('SELECT current_user')?[{role:'myeongha_analytics_writer'}]:
        sql.includes('subject_link_ref=$4')?[{active:true}]:[]) as unknown as T[]};
    },release(){}};}};
    const store=createAdminAnalyticsPostgresEventStoreV1(pool);
    expect(await store.isSubjectConsentActive({visitorRef:VISITOR,consentVersion:consent.version,policyVersion:policy.policyVersion,
      subjectLinkRef:'ah_'+'f'.repeat(64),occurredAt:row.verifiedAt})).toBe(true);
    const query=queries.find(x=>x.includes('subject_link_ref=$4'))!;
    expect(query).toContain('granted_at<=$5::timestamptz');
    expect(query).toContain('withdrawn_at IS NULL');
    expect(query).toContain('expires_at>CURRENT_TIMESTAMP');
    expect(ADMIN_ANALYTICS_FINANCIAL_SQL_V1).toContain("r.verification_status='verified'");
  });
});
