// Watchtower-Track: security
// R21: real PostgreSQL, exact named disposable clone, synthetic sources only.
import {afterAll, describe, expect, it} from 'vitest';
import {Pool, type PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {canonicalJson} from '../packages/domain/src/index.js';
import {assembleSeyeonRuntimeContextV2, type SeyeonRetrievedMemoryV2} from '../packages/domain/src/seyeon-runtime-context-v2.js';
import {selectSeyeonExactModelPersonalSourcesV1} from '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';
import type {SeyeonPersonalRecordProjectionCandidateV1} from '../apps/api/src/seyeon-production-context-v1.js';
import type {SeyeonR21OfflineDerivedSourceEnvelopeV1} from '../apps/api/src/seyeon-r21-offline-derived-source-closure-v1.js';
import type {PostgresSubjectPoolV1} from '../apps/api/src/postgres-subject-execution.js';
import {persistSeyeonR20OfflineDigestBoundPinV1, SeyeonR20OfflineDigestHoldV1} from '../apps/api/src/seyeon-positive-raw-projection-digest-bind-r20-candidate.js';

const enabled=process.env.CI==='true' &&
  process.env.SEYEON_POSITIVE_GRANT_REAL_PG==='1' &&
  process.env.PGHOST==='localhost' &&
  process.env.PGUSER==='postgres' &&
  process.env.PGDATABASE==='myeongha_seyeon_positive_pin_candidate_test';
const pool=enabled?new Pool({max:3,connectionTimeoutMillis:5000}):null;
const subject='d2000000-0000-4000-8000-000000000001';
const bundle='d3000000-0000-4000-8000-000000000001';
const release='d3100000-0000-4000-8000-000000000001';
const first={
  recordId:'d5000000-0000-4000-8000-000000000001',
  grantId:'d6000000-0000-4000-8000-000000000001',
};
const second={
  recordId:'d5000000-0000-4000-8000-000000000002',
  grantId:'d6000000-0000-4000-8000-000000000002',
};
function ids(n:number){
  const tail=String(n).padStart(12,'0');
  return {
    thread:'d4000000-0000-4000-8000-'+tail,
    participant:'d4100000-0000-4000-8000-'+tail,
    turn:'d7000000-0000-4000-8000-'+tail,
    attempt:'d7200000-0000-4000-8000-'+tail,
    user:'d7100000-0000-4000-8000-'+tail,
    selection:'sha256:v1:'+String(n).padStart(64,'0'),
  };
}
type Fixture=ReturnType<typeof ids>;
async function tx<T>(fn:(c:PoolClient)=>Promise<T>,executor=false):Promise<T>{
  if(!pool)throw Error('R21 requires only disposable CI PostgreSQL');
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    if(executor){
      await c.query('SET LOCAL ROLE myeongha_api_executor');
      await c.query("select set_config('myeongha.subject_id',$1,true)",[subject]);
    }
    const result=await fn(c);
    await c.query('COMMIT');
    return result;
  }catch(e){
    await c.query('ROLLBACK').catch(()=>undefined);
    throw e;
  }finally{c.release();}
}
async function createTurn(n:number):Promise<Fixture>{
  const a=ids(n),key='r21-two-sources-'+n;
  await tx(async c=>{
    await c.query(
      "insert into public.conversation_threads(id,subject_id,thread_type,status,title,active_content_release_id,active_content_bundle_id,content_revision,next_sequence_no,created_at,updated_at) values ($1::uuid,$2::uuid,'single_character','active','r21-two-synthetic-sources',$3::uuid,$4::uuid,0,1,clock_timestamp(),clock_timestamp())",
      [a.thread,subject,release,bundle],
    );
    await c.query(
      "insert into public.conversation_thread_characters(id,thread_id,character_id,content_bundle_id,role,joined_at) values($1::uuid,$2::uuid,'seyeon',$3::uuid,'primary',clock_timestamp()-interval '1 minute')",
      [a.participant,a.thread,bundle],
    );
    await c.query(
      "select * from public.cmd_receive_chat_turn_v1($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::jsonb,$7::uuid,$8::uuid,$9::uuid,$10::uuid,$11::text,$12::jsonb,$13::text)",
      [subject,a.thread,key,'sha256:v1:synthetic-r21-'+n,'chat-request-v1',
        JSON.stringify({clientTurnId:key,text:'synthetic r21 only',
          clientCapability:'0.0.1-dev'}),
        release,bundle,a.turn,a.user,'synthetic r21 only',null,
        'sha256:v1:synthetic-r21-message-'+n],
    );
    await c.query(
      'select * from public.cmd_allocate_chat_turn_attempt_v1($1::uuid,$2::uuid,$3::uuid,$4::text)',
      [subject,a.turn,a.attempt,'seyeon-production-chat-planner-v1'],
    );
  });
  return a;
}
async function candidate(a:Fixture,sources:readonly {
  recordId:string;grantId:string
}[]){
  return tx(async c=>{
    const q=await c.query<{receipt:{
      originalSourceCount:number;contextReady:boolean;
      permitsProvider:boolean;permitsAtomicCommit:boolean;
      permitsHttpReveal:boolean;selectedSourcesDigest:string;
    }}>(
      'select seyeon_positive_candidate.pin_two_and_context_ready_r21($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,$6::text) as receipt',
      [subject,a.thread,a.turn,a.attempt,JSON.stringify(sources),a.selection],
    );
    return q.rows[0]?.receipt;
  },true);
}
async function state(a:Fixture){
  return tx(async c=>{
    const q=await c.query<{
      turnState:string;parents:string;edges:string;firstPins:string;
    }>(
      "select (select state from public.chat_turns where id=$1::uuid) as \"turnState\", "+
      "(select count(*)::text from seyeon_positive_candidate.source_sets_r1 where attempt_id=$2::uuid) as parents, "+
      "(select count(*)::text from seyeon_positive_candidate.source_edges_r1 where attempt_id=$2::uuid) as edges, "+
      "(select count(*)::text from seyeon_positive_candidate.attempt_source_pins where attempt_id=$2::uuid) as \"firstPins\"",
      [a.turn,a.attempt],
    );
    return q.rows[0];
  });
}
const hash=(x:unknown)=>'sha256:v1:'+createHash('sha256')
  .update(canonicalJson(x)).digest('hex');
const scopedPool:PostgresSubjectPoolV1={
  async connect(){
    if(!pool)throw Error('R21 disposable PostgreSQL only');
    const c=await pool.connect();
    return {
      async query<Row>(sql:string,params?:readonly unknown[]){
        const result=await c.query(sql,params===undefined?[]:[...params]);
        return {rows:result.rows as Row[]};
      },
      release(error?:unknown){c.release(error instanceof Error?error:undefined);},
    };
  },
};
async function modelSources(){
  if(!pool)throw Error('R21 disposable PostgreSQL only');
  const raw=await pool.query<{id:string;content_jsonb:unknown}>(
    'select id::text as id,content_jsonb from public.memory_items where id=any($1::uuid[])',
    [[first.recordId,second.recordId]],
  );
  if(raw.rows.length!==2)throw Error('Two synthetic originals required');
  const payload=new Map(raw.rows.map(r=>[r.id,r.content_jsonb]));
  const origins=[first,second] as const;
  const memories:readonly SeyeonRetrievedMemoryV2[]=origins.map((o,i)=>({
    kind:'memory',memoryId:'memory:'+o.recordId,
    sourceRef:'memory:'+o.recordId+':grant:'+o.grantId,
    claimKind:'fact',summary:'synthetic model projection '+i,
    relevance:0.9-i*0.1,salience:0.8,
  }));
  const candidates:readonly SeyeonPersonalRecordProjectionCandidateV1[]=
    origins.map((o,i)=>({
      recordKind:'memory',recordId:o.recordId,grantId:o.grantId,
      recordType:'shared_detail',schemaVersion:'memory-v1',
      projectedMemoryId:memories[i]!.memoryId,
      rawRecordDigest:hash({
        kind:'memory',recordId:o.recordId,grantId:o.grantId,
        recordType:'shared_detail',schemaVersion:'memory-v1',
        payload:payload.get(o.recordId),
      }),
      projectedMemoryDigest:hash(memories[i]),
      permitsAtomicCommit:false,permitsHttpReveal:false,
    }));
  const selection=selectSeyeonExactModelPersonalSourcesV1({
    retrievedMemories:memories,sourceCandidates:candidates,
  });
  const envelope:SeyeonR21OfflineDerivedSourceEnvelopeV1={
    version:'seyeon-r21-offline-derived-source-closure-v1',
    sourceSnapshot:{
      version:'seyeon-production-context-v1',
      retrievedMemories:memories,
      personalRecordProjectionCandidates:candidates,
      personalRecordAdmissions:candidates.map(c=>({
        recordId:c.recordId,recordKind:c.recordKind,recordType:c.recordType,
        schemaVersion:c.schemaVersion,reason:'ADMITTED' as const,
      })),
      recentMessages:[],relationshipHistoryRecords:[],
      activeRelationshipEventCount:0,historyThroughRevision:0,
      relationshipRevisionUsedForTurn:null,
    },
    preflightState:'not_run',disclosureRetrievedPrivateSources:[],
    readerDerivedSources:[],workerDerivedSources:[],externalToolPrivateSources:[],
  };
  const finalModelContext=assembleSeyeonRuntimeContextV2({
    relationship:null,relationshipSemantics:null,recentMessages:[],
    retrievedMemories:memories,integrityDecisions:[],
    governedPreflightApplied:false,disclosure:{decision:null,retrievedSources:[]},
  });
  return {retrievedMemories:memories,sourceCandidates:candidates,
    sourceEnvelope:envelope,selection,finalModelContext};
}
describe.skipIf(!enabled)('R21 exact TWO original Grants before REAL core ContextReady',()=>{
  afterAll(async()=>{await pool?.end();});
  it('atomically pins two locked originals, marks context ready, denies Provider/Commit/Reveal',async()=>{
    const a=await createTurn(751);
    const result=await candidate(a,[first,second]);
    expect(result).toMatchObject({
      selectedSourcesDigest:a.selection,
      originalSourceCount:2,contextReady:true,
      permitsProvider:false,permitsAtomicCommit:false,permitsHttpReveal:false,
    });
    expect(await state(a)).toMatchObject({
      turnState:'context_ready',parents:'1',edges:'2',firstPins:'1',
    });
    await expect(candidate(a,[first,second])).rejects.toThrow();
  });
  it('R20 model-selected two originals -> R21 real ContextReady in one DB transaction',async()=>{
    const id=await createTurn(754);
    const source=await modelSources();
    const receipt=await persistSeyeonR20OfflineDigestBoundPinV1({
      pool:scopedPool,
      verifiedEvidence:{kind:'member',verifiedAuthUserId:'d1000000-0000-4000-8000-000000000001'},
      threadId:id.thread,turnId:id.turn,attemptId:id.attempt,
      ...source,twoOriginalContextReady:true,
    });
    expect(receipt).toMatchObject({
      selectedPersonalRecordCount:2,contextReady:true,
      selectedSourcesDigest:source.selection.selectedSourcesDigest,
      finalModelContextDigest:hash(source.finalModelContext),
      permitsProvider:false,permitsAtomicCommit:false,permitsHttpReveal:false,
    });
    expect(await state(id)).toMatchObject({
      turnState:'context_ready',parents:'1',edges:'2',firstPins:'1',
    });
    const wrong=await createTurn(755);
    // Validly recomputed outer manifest cannot authorize an altered original.
    const changedCandidates=source.sourceCandidates.map((c,i)=>i===1?{
      ...c,rawRecordDigest:'sha256:v1:'+'0'.repeat(64),
    }:c);
    const changedSelection=selectSeyeonExactModelPersonalSourcesV1({
      retrievedMemories:source.retrievedMemories,sourceCandidates:changedCandidates,
    });
    const altered={
      ...source,sourceCandidates:changedCandidates,selection:changedSelection,
      sourceEnvelope:{
        ...source.sourceEnvelope,
        sourceSnapshot:{...source.sourceEnvelope.sourceSnapshot,
          personalRecordProjectionCandidates:changedCandidates},
      },
    };
    await expect(persistSeyeonR20OfflineDigestBoundPinV1({
      pool:scopedPool,
      verifiedEvidence:{kind:'member',verifiedAuthUserId:'d1000000-0000-4000-8000-000000000001'},
      threadId:wrong.thread,turnId:wrong.turn,attemptId:wrong.attempt,
      ...altered,twoOriginalContextReady:true,
    })).rejects.toBeInstanceOf(SeyeonR20OfflineDigestHoldV1);
    expect(await state(wrong)).toMatchObject({
      turnState:'planned',parents:'0',edges:'0',firstPins:'0',
    });
  });
  it('rejects a replaced second Grant and rolls back all parent/edge/context writes',async()=>{
    const a=await createTurn(752);
    await expect(candidate(a,[first,{
      ...second,grantId:'d6000000-0000-4000-8000-000000000099',
    }])).rejects.toThrow();
    expect(await state(a)).toMatchObject({
      turnState:'planned',parents:'0',edges:'0',firstPins:'0',
    });
  });
  it('rejects missing or duplicate sources before ContextReady',async()=>{
    const a=await createTurn(753);
    await expect(candidate(a,[first])).rejects.toThrow();
    await expect(candidate(a,[first,first])).rejects.toThrow();
    expect(await state(a)).toMatchObject({
      turnState:'planned',parents:'0',edges:'0',firstPins:'0',
    });
  });
});
