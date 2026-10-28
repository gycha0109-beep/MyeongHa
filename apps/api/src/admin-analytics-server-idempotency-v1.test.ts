import {describe,expect,it} from 'vitest';
import {createAdminAnalyticsPostgresEventStoreV1} from './admin-analytics-pipeline-postgres-v1.js';
import type {AdminAnalyticsStoredEventV1} from './admin-analytics-pipeline-v1.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';

const ID='123e4567-e89b-42d3-a456-426614174081';
const VISITOR='av_'+'a'.repeat(64),SESSION1='as_'+'1'.repeat(64),SESSION2='as_'+'2'.repeat(64);
const REF='ap_'+'d'.repeat(64);
function record(partial:Partial<AdminAnalyticsStoredEventV1>={}):AdminAnalyticsStoredEventV1{
  return{eventId:ID,eventName:'READING_PURCHASED',eventSchemaVersion:'admin-analytics-pipeline-v1',
    occurredAt:'2026-10-28T08:00:00.000Z',anonymousOrSubjectRef:VISITOR,sessionRef:SESSION1,
    client:'server',payload:{productKey:'reading.product',purchaseRef:REF},
    authority:'server_verified',consentVersion:'consent-v1',policyVersion:'policy-v1',
    validVisitor:true,paidPurchase:true,expiresAt:'2026-11-01T00:00:00.000Z',...partial};
}
function harness(){
  const writes:Array<readonly unknown[]>=[],commits:string[]=[];
  let persisted:string|null=null;
  const pool:PostgresSubjectPoolV1={async connect(){return{
    async query<Row=Record<string,unknown>>(sql:string,values?:readonly unknown[]){
      if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'){commits.push(sql);return{rows:[] as Row[]};}
      if(sql.startsWith('SELECT current_user::text AS role'))return{rows:[{role:'myeongha_analytics_writer'}] as unknown as Row[]};
      if(sql.includes('SELECT version,expires_at::text AS "expiresAt"'))return{rows:[{version:'consent-v1',expiresAt:'2026-11-01T00:00:00Z'}] as unknown as Row[]};
      if(sql.includes('INSERT INTO myeongha_admin_analytics.events_v1')){
        if(!values||values.length!==20)throw Error('missing stored provenance');
        writes.push(values);
        if(persisted!==null)return{rows:[] as Row[]};
        persisted=String(values[19]);
        return{rows:[{eventId:ID}] as unknown as Row[]};
      }
      if(sql.includes('SELECT event_fingerprint AS fingerprint'))return{rows:[{fingerprint:persisted}] as unknown as Row[]};
      throw Error('Unexpected store SQL: '+sql);
    },release(){},
  }}};
  return{store:createAdminAnalyticsPostgresEventStoreV1(pool),writes,commits};
}
describe('source-verified analytics idempotency across sessions',()=>{
  it('replays the same verified source across tabs without changing its original session attribution',async()=>{
    const h=harness();
    expect(await h.store.append(record())).toBe('inserted');
    expect(await h.store.append(record({sessionRef:SESSION2}))).toBe('replayed');
    expect(h.writes.map(row=>row[4])).toEqual([SESSION1,SESSION2]);
    expect(h.writes[0]?.[19]).toBe(h.writes[1]?.[19]);
    expect(h.commits.filter(x=>x==='COMMIT')).toHaveLength(2);
  });
  it('rejects a different visitor or immutable purchase evidence for the same ID',async()=>{
    const h=harness();
    await h.store.append(record());
    await expect(h.store.append(record({anonymousOrSubjectRef:'av_'+'f'.repeat(64)})))
      .rejects.toThrow('Conflicting analytics event identity');
    await expect(h.store.append(record({payload:{productKey:'reading.product',purchaseRef:'ap_'+'e'.repeat(64)}})))
      .rejects.toThrow('Conflicting analytics event identity');
    expect(h.commits.filter(x=>x==='ROLLBACK')).toHaveLength(2);
  });
  it('keeps client event replay session-bound even with a reused event ID',async()=>{
    const h=harness();
    const client=record({eventName:'PRODUCT_VIEWED',client:'web',authority:'client_intent',paidPurchase:null,payload:{productKey:'reading.product'}});
    expect(await h.store.append(client)).toBe('inserted');
    await expect(h.store.append({...client,sessionRef:SESSION2})).rejects.toThrow('Conflicting analytics event identity');
  });
});