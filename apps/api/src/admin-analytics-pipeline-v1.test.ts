import { describe, expect, it } from 'vitest';
import { ADMIN_ANALYTICS_EVENT_REGISTRY_V1 } from './admin-analytics-read-v1.js';
import {
  ADMIN_ANALYTICS_EXTENSION_EVENTS_V1,ADMIN_ANALYTICS_PIPELINE_VERSION_V1,
  aggregateAdminAnalyticsEventsV1,adminAnalyticsBucketV1,createAdminAnalyticsCollectorV1,
  deriveAdminAnalyticsReferenceV1,parseAdminAnalyticsEnvelopeV1,parseAdminAnalyticsPeriodV1,recordVerifiedAdminAnalyticsEventV1,
  type AdminAnalyticsCollectionPolicyV1,type AdminAnalyticsEnvelopeV1,type AdminAnalyticsStoredEventV1,type AdminAnalyticsEventStoreV1,
} from './admin-analytics-pipeline-v1.js';
import { ADMIN_ANALYTICS_FINANCIAL_SQL_V1,createAdminAnalyticsPipelineReadPortV1 } from './admin-analytics-pipeline-postgres-v1.js';
import { createAdminAnalyticsDashboardHttpHandlerV1 } from './admin-analytics-pipeline-http-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

const now=new Date('2026-10-27T12:00:00Z');
const visitor='av_'+'a'.repeat(64),other='av_'+'b'.repeat(64),session='as_'+'a'.repeat(64),purchase='ap_'+'c'.repeat(64);
const policy:AdminAnalyticsCollectionPolicyV1={enabled:true,approvalRef:'test-only-approval',policyVersion:'test-policy-v1',retentionSeconds:180*86400,
  deletionBindingVerified:true,validVisitPolicyVersion:'test-visit-rule',approvedEvents:[...ADMIN_ANALYTICS_EVENT_REGISTRY_V1,...ADMIN_ANALYTICS_EXTENSION_EVENTS_V1],approvedCampaignKeys:['beta-1'],approvedChannelKeys:['social']};
const consent={visitorRef:visitor,sessionRef:session,version:'test-consent-v1',granted:true,expiresAt:'2026-10-27T13:00:00Z',validVisitor:true};
let serial=1;
function envelope(eventName:AdminAnalyticsEnvelopeV1['eventName']='PRODUCT_VIEWED',payload:AdminAnalyticsEnvelopeV1['payload']={}):AdminAnalyticsEnvelopeV1 {
  return {eventId:'123e4567-e89b-42d3-a456-'+String(serial++).padStart(12,'0'),eventName,eventSchemaVersion:ADMIN_ANALYTICS_PIPELINE_VERSION_V1,
    occurredAt:'2026-10-27T11:30:00Z',anonymousOrSubjectRef:visitor,sessionRef:session,client:'web',payload};
}
function event(name:AdminAnalyticsEnvelopeV1['eventName'],options:Partial<AdminAnalyticsStoredEventV1>={}):AdminAnalyticsStoredEventV1 {
  return {...envelope(name),authority:'client_intent',consentVersion:consent.version,policyVersion:policy.policyVersion,validVisitor:true,paidPurchase:null,expiresAt:'2026-10-28T12:00:00Z',...options};
}
const period=()=>parseAdminAnalyticsPeriodV1(new URL('https://admin.test/api/admin/analytics-dashboard?from=2026-10-21&to=2026-10-27&grain=week'));
function memoryStore(){const events=new Map<string,AdminAnalyticsStoredEventV1>();const erased:string[]=[];const store:AdminAnalyticsEventStoreV1={
  async append(event){const prior=events.get(event.eventId);if(prior&&JSON.stringify(prior)!==JSON.stringify(event))throw Error('Conflict');if(prior)return'replayed';events.set(event.eventId,event);return'inserted';},
  async eraseVisitor(ref){erased.push(ref);for(const [id,e]of events)if(e.anonymousOrSubjectRef===ref)events.delete(id);},
  async eraseSubject(){events.clear();},async purgeExpired(at){let removed=0;for(const[id,e]of events)if(Date.parse(e.expiresAt)<=Date.parse(at)){events.delete(id);removed++;}return removed;}};return{events,erased,store};}
const request=(body:unknown,path='/api/analytics/events')=>new Request('https://service.test'+path,{method:'POST',headers:{Origin:'https://service.test','Content-Type':'application/json'},body:JSON.stringify(body)});

describe('analytics collection safety and source authority',()=>{
  it('does not touch identity or storage when policy is absent',async()=>{
    const m=memoryStore();let resolves=0;const handler=createAdminAnalyticsCollectorV1({consent:{async resolve(){resolves++;return consent;},async withdraw(){return[];}},store:m.store});
    expect((await handler(request(envelope()))).status).toBe(503);expect(resolves).toBe(0);expect(m.events.size).toBe(0);
  });
  it('rejects raw identifiers, PII, unregistered campaigns, unknown schemas and forged server conversions',async()=>{
    for(const raw of [{...envelope(),anonymousOrSubjectRef:'raw-auth-id'},envelope('PRODUCT_VIEWED',{campaignKey:'unknown-ad'}),
      {...envelope(),payload:{birthDate:'2000-01-01'}},{...envelope(),eventSchemaVersion:'future-v2'}]){
      expect(()=>parseAdminAnalyticsEnvelopeV1(raw,policy)).toThrow();
    }
    const m=memoryStore();const handler=createAdminAnalyticsCollectorV1({policy,store:m.store,now:()=>now,consent:{async resolve(){return consent;},async withdraw(){return[];}}});
    expect((await handler(request(envelope('READING_PURCHASED',{purchaseRef:purchase})))).status).toBe(403);expect(m.events.size).toBe(0);
  });
  it('accepts consent-bound events idempotently and rejects conflicting event IDs',async()=>{
    const m=memoryStore();const handler=createAdminAnalyticsCollectorV1({policy,store:m.store,now:()=>now,consent:{async resolve(){return consent;},async withdraw(){return[visitor];}}});
    const body=envelope('PRODUCT_VIEWED',{productKey:'standard.love_relationship',campaignKey:'beta-1',channelKey:'social'});
    expect(await(await handler(request(body))).json()).toEqual({code:'ANALYTICS_RECORDED'});
    expect(await(await handler(request(body))).json()).toEqual({code:'ANALYTICS_REPLAYED'});
    expect((await handler(request({...body,payload:{productKey:'other'}}))).status).toBe(400);expect(m.events.size).toBe(1);
    expect((await handler(request({},'/api/analytics/withdraw'))).status).toBe(200);expect(m.events.size).toBe(0);expect(m.erased).toEqual([visitor]);
  });
  it('does not record denied, expired or cross-session consent',async()=>{
    for(const invalid of [{...consent,granted:false},{...consent,expiresAt:'2026-10-27T11:59:59Z'},{...consent,sessionRef:'as_'+'b'.repeat(64)}]){
      const m=memoryStore();const handler=createAdminAnalyticsCollectorV1({policy,store:m.store,now:()=>now,consent:{async resolve(){return invalid;},async withdraw(){return[];}}});
      expect((await handler(request(envelope()))).status).toBe(403);expect(m.events.size).toBe(0);
    }
  });
  it('requires domain confirmation for server purchases, with bounded retention and pseudonymous references',async()=>{
    const m=memoryStore();const event={...envelope('READING_PURCHASED',{purchaseRef:purchase}),client:'server'};
    const input={event,policy,consent,store:m.store,now};
    await expect(recordVerifiedAdminAnalyticsEventV1({...input,verifyDomainEvidence:async()=>null})).rejects.toThrow('evidence');
    await expect(recordVerifiedAdminAnalyticsEventV1({...input,verifyDomainEvidence:async()=>({paidPurchase:true})})).resolves.toBe('inserted');
    expect([...m.events.values()][0]).toMatchObject({authority:'server_verified',paidPurchase:true,expiresAt:'2026-10-27T13:00:00.000Z'});
    const ref=deriveAdminAnalyticsReferenceV1('test-only-secret-which-is-at-least-32-bytes','visitor','raw-member-id');
    expect(ref).toMatch(/^av_[a-f0-9]{64}$/u);expect(ref).not.toContain('raw-member-id');
    expect(deriveAdminAnalyticsReferenceV1('test-only-secret-which-is-at-least-32-bytes','purchase','raw-member-id')).not.toBe(ref);
  });
});

describe('cohort and financial measurement boundaries',()=>{
  it('keeps missing observation coverage null instead of pretending there were zero visitors',()=>{
    const result=aggregateAdminAnalyticsEventsV1([],period(),null,now);expect(result.metrics.every(row=>row.value===null&&row.status==='unmeasured')).toBe(true);
  });
  it('deduplicates server purchases, rejects client conversions and counts refund/complaint people once',()=>{
    const viewed=event('PRODUCT_VIEWED',{payload:{productKey:'standard.love_relationship'}});
    const paid=event('READING_PURCHASED',{client:'server',authority:'server_verified',paidPurchase:true,payload:{purchaseRef:purchase}});
    const events=[viewed,event('PRODUCT_VIEWED',{anonymousOrSubjectRef:other}),paid,paid,
      event('READING_PURCHASED',{anonymousOrSubjectRef:other,paidPurchase:true,payload:{purchaseRef:'ap_'+'f'.repeat(64)}}),
      event('REFUND_COMPLETED',{client:'server',authority:'server_verified',payload:{purchaseRef:purchase}}),
      event('MAJOR_COMPLAINT_RECORDED',{client:'server',authority:'server_verified',payload:{purchaseRef:purchase}}),
      event('SATISFACTION_SUBMITTED',{payload:{purchaseRef:purchase,score:4}}),
      event('SATISFACTION_SUBMITTED',{anonymousOrSubjectRef:other,payload:{purchaseRef:purchase,score:1}})];
    const result=aggregateAdminAnalyticsEventsV1(events,period(),{from:'2026-10-21T00:00:00Z',through:'2026-10-28T00:00:00Z',events:policy.approvedEvents},now);
    expect(result.metrics.find(row=>row.key==='purchase_conversion')).toMatchObject({numerator:1,denominator:2,value:50});
    expect(result.metrics.find(row=>row.key==='refund_complaint_rate')).toMatchObject({numerator:1,denominator:1,value:100});
    expect(result.metrics.find(row=>row.key==='satisfaction')).toMatchObject({numerator:4,denominator:1,value:4});
    expect(()=>aggregateAdminAnalyticsEventsV1([paid,{...paid,paidPurchase:false}],period(),null,now)).toThrow('Conflicting');
  });
  it('bounds periods and uses Monday UTC weeks and month starts',()=>{
    expect(adminAnalyticsBucketV1('2026-10-25T23:59:59Z','week')).toBe('2026-10-19');
    expect(adminAnalyticsBucketV1('2026-10-27T01:00:00Z','month')).toBe('2026-10-01');
    expect(parseAdminAnalyticsPeriodV1(new URL('https://admin.test/?from=2026-05-01&to=2026-10-27')).from).toBe('2026-05-01');
    expect(()=>parseAdminAnalyticsPeriodV1(new URL('https://admin.test/?from=2026-04-30&to=2026-10-27'))).toThrow();
    for(const query of ['from=2026-01-01&to=2026-10-27','from=2026-02-30&to=2026-03-01','from=2026-10-21&to=2026-10-27&grain=year','from=2026-10-21&to=2026-10-27&campaignKey=one&campaignKey=two']){
      expect(()=>parseAdminAnalyticsPeriodV1(new URL('https://admin.test/?'+query))).toThrow();
    }
  });
  it('reads actual server-verified monetary facts even when visitor tracking is disabled',async()=>{
    const seen:{sql:string;values:readonly unknown[]|undefined}[]=[];
    const pool:PostgresSubjectPoolV1={async connect(){return {async query<Row=Record<string,unknown>>(sql:string,values?:readonly unknown[]){seen.push({sql,values});return{rows:(sql.startsWith('SELECT current_user')?[{currentUser:'myeongha_admin_reader'}]:sql===ADMIN_ANALYTICS_FINANCIAL_SQL_V1?[{period:'2026-10-26',productKey:'standard.love_relationship',currency:'KRW',verifiedReceipts:'1',receiptOwners:'1',verifiedAmountMinor:'8900',moneyMissing:'0'}]:[]) as unknown as Row[]};},release(){}};}};
    const result=await createAdminAnalyticsPipelineReadPortV1({pool,now:()=>now}).read(period());
    expect(result.collectionStatus).toBe('disabled');expect(result.finance[0]?.verifiedAmountMinor).toBe('8900');expect(result.analytics.metrics.every(row=>row.value===null)).toBe(true);
    expect(seen.find(row=>row.sql===ADMIN_ANALYTICS_FINANCIAL_SQL_V1)?.values).toEqual(['2026-10-21','2026-10-27','week',501]);
    expect(seen.some(row=>row.sql.includes('myeongha_admin_analytics.events_v1'))).toBe(false);
    expect(ADMIN_ANALYTICS_FINANCIAL_SQL_V1).not.toMatch(/verified_payload_jsonb|external_transaction_id|offer_snapshot_jsonb/iu);
  });
  it('denies non-Owner or failed audit before returning a dashboard',async()=>{
    let reads=0;const make=(owner:boolean,auditWorks:boolean)=>createAdminAnalyticsDashboardHttpHandlerV1({auth:{async verifyOwner(){return owner?{authUserId:'123e4567-e89b-42d3-a456-426614174000'}:null;}},audit:{async append(){if(!auditWorks)throw Error('audit down');}},reads:{async read(){reads++;throw Error('No DB');}}});
    const req=()=>new Request('https://admin.test/api/admin/analytics-dashboard?from=2026-10-21&to=2026-10-27');
    expect((await make(false,true)(req())).status).toBe(403);expect(reads).toBe(0);
    expect((await make(true,false)(req())).status).toBe(503);
  });
});
