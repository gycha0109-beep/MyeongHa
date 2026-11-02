// Exercises the real adapter on a disposable loopback database only.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createAdminAnalyticsPostgresEventStoreV1,createAdminAnalyticsPipelineReadPortV1} from '../../../dist/apps/api/src/admin-analytics-pipeline-postgres-v1.js';
const url=new URL(process.env.MYEONGHA_ADMIN_TEST_DATABASE_URL??'about:blank');
if(url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||url.pathname!=='/myeongha_admin_disposable'||url.username!=='myeongha_admin_reader'||url.search||url.hash)throw Error('Only the disposable loopback analytics fixture is allowed.');
const read=new pg.Pool({connectionString:url.href,max:1});url.username='myeongha_analytics_writer';
const writer=new pg.Pool({connectionString:url.href,max:1});
const store=createAdminAnalyticsPostgresEventStoreV1(writer);
const ref='av_'+randomUUID().replaceAll('-','').repeat(2),subject='ah_'+randomUUID().replaceAll('-','').repeat(2);
const now=new Date(),expires=new Date(now.getTime()+3600_000).toISOString();
const consent={visitorRef:ref,sessionRef:'as_'+'a'.repeat(64),version:'local-test-v1',granted:true,expiresAt:expires,validVisitor:true};
const event={eventId:randomUUID(),eventName:'PRODUCT_VIEWED',eventSchemaVersion:'admin-analytics-pipeline-v1',occurredAt:now.toISOString(),anonymousOrSubjectRef:ref,sessionRef:consent.sessionRef,client:'web',payload:{productKey:'local-test'},authority:'client_intent',consentVersion:consent.version,policyVersion:'local-test-v1',validVisitor:true,paidPurchase:null,expiresAt:expires};
try{
 await store.bindConsent(consent,'local-test-v1',subject);
 assert.equal(await store.append(event),'inserted');assert.equal(await store.append(event),'replayed');
 await assert.rejects(store.append({...event,payload:{productKey:'conflict'}}),/Conflicting/);
 const date=now.toISOString().slice(0,10);
 const dashboard=await createAdminAnalyticsPipelineReadPortV1({pool:read}).read({from:date,to:date,grain:'day',campaignKey:null});
 assert.equal(dashboard.collectionStatus,'disabled');assert(dashboard.analytics.metrics.every(m=>m.value===null));
 const observed=await createAdminAnalyticsPipelineReadPortV1({pool:read,collection:{enabled:true,approvalRef:'local-only-fixture',policyVersion:'local-test-v1',retentionSeconds:180*86400,deletionBindingVerified:true,validVisitPolicyVersion:'local-only-fixture',approvedEvents:['PRODUCT_VIEWED']},
   coverage:{from:date+'T00:00:00Z',through:new Date(Date.parse(date+'T00:00:00Z')+86400_000).toISOString(),events:['PRODUCT_VIEWED']}}).read({from:date,to:date,grain:'day',campaignKey:null});
 assert.equal(observed.collectionStatus,'source_covered');assert.equal(observed.analytics.metrics.find(m=>m.key==='visitors').value,1);
 assert(observed.analytics.series.some(row=>row.productKey==='local-test'&&row.visitors===1));
 await assert.rejects(read.query('DELETE FROM myeongha_admin_analytics.events_v1 WHERE false'),error=>error.code==='42501');
 await store.eraseVisitor(ref);await assert.rejects(store.append({...event,eventId:randomUUID()}),/consent/);
 assert.equal((await writer.query('SELECT count(*)::int AS n FROM myeongha_admin_analytics.events_v1 WHERE visitor_ref=$1',[ref])).rows[0].n,0);
 await store.eraseSubject(subject);
 assert.equal((await writer.query('SELECT count(*)::int AS n FROM myeongha_admin_analytics.consents_v1 WHERE visitor_ref=$1',[ref])).rows[0].n,0);
 const second={...consent,version:'local-test-v2'};await store.bindConsent(second,'local-test-v1',subject);
 await store.append({...event,eventId:randomUUID(),consentVersion:second.version});
 assert.equal(await store.purgeExpired(new Date(now.getTime()+7200_000).toISOString()),2); // one event and its expired consent
 console.log('PASS analytics PostgreSQL insert/replay/conflict/withdrawal/subject erasure/TTL/reader denial; actual stored cohort dashboard measured while disabled source stays unmeasured.');
}finally{await store.eraseSubject(subject);await writer.end();await read.end();}
