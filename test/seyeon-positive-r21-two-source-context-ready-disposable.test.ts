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
import {
  buildSeyeonTurnInterpreterRequestV2,
  SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
  type SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';
import {
  createOpenAiSeyeonStructuredProviderV1,
  type SeyeonUnverifiedTransportOutputReceiptV1,
} from '../apps/api/src/openai-seyeon-structured-provider-v1.js';
import {attestSeyeonR35OfflineWireAfterDbPinV1} from '../apps/api/src/seyeon-r35-offline-actual-provider-wire-pin-v1.js';
import {
  reserveSeyeonR26OfflineGovernedWireV1,
  SeyeonR26OfflineG4HoldV1,
  type SeyeonR26OfflineG4ReceiptV1,
} from '../apps/api/src/seyeon-r26-offline-governed-wire-reservation-v1.js';
import type {SeyeonAiGovernorAdmissionV1} from '../apps/api/src/postgres-seyeon-ai-cost-ledger-v1.js';
import {createSeyeonAiCostEventV1} from '../apps/api/src/seyeon-ai-usage-cost-v1.js';
import {
  reserveSeyeonR32OfflineFiveStageV1,
  SeyeonR32OfflineFiveStageHoldV1,
  SEYEON_R32_SYNTHETIC_STAGE_INSTRUCTIONS_V1,
  SEYEON_R32_SYNTHETIC_STAGE_SCHEMA_V1,
  type SeyeonR32OfflineStageReceiptV1,
} from '../apps/api/src/seyeon-r32-offline-five-stage-governed-cost-v1.js';
import {
  buildSeyeonR37SyntheticStageObservationV1,
  recordSeyeonR37SyntheticStageObservationV1,
  SeyeonR37OfflineSyntheticResultHoldV1,
  type SeyeonR37OfflineSyntheticResultV1,
} from '../apps/api/src/seyeon-r37-offline-synthetic-stage-result-v1.js';
import {
  exerciseSeyeonR38NegativeRealGuardsV1,
} from '../apps/api/src/seyeon-r38-offline-guard-rejection-probes-v1.js';
import {
  recordSeyeonR38OfflineNegativeGuardProbeV1,
  SeyeonR38OfflineNegativeEvidenceHoldV1,
} from '../apps/api/src/seyeon-r38-offline-guard-negative-db-v1.js';
import {
  recordSeyeonR40UnverifiedMockTransportV1,
  SeyeonR40OfflineUnverifiedTransportHoldV1,
} from '../apps/api/src/seyeon-r40-offline-unverified-transport-db-v1.js';
import {buildSeyeonR41LocalGuardFixtureV1}
  from '../apps/api/src/seyeon-r41-offline-actual-guard-fixture-v1.js';
import {
  recordSeyeonR41LocalFixtureWitnessV1,
  SeyeonR41OfflineFixtureDatabaseHoldV1,
} from '../apps/api/src/seyeon-r41-offline-guard-fixture-db-v1.js';

/** Strictly fake transport: NOT a Provider response or Guard PASS. */
function r40SyntheticStubTransport(
  receipt:SeyeonR32OfflineStageReceiptV1,
  structuredText='{"ok":true}',
):SeyeonUnverifiedTransportOutputReceiptV1{
  const sha=(x:string)=>'sha256:wire-utf8:v1:'+
    createHash('sha256').update(x,'utf8').digest('hex');
  return Object.freeze({
    schemaVersion:'seyeon-unverified-transport-output-receipt-r39',
    originKind:'unverified_transport_bytes_only',
    callId:receipt.callId,purpose:receipt.purpose,
    providerKey:'openai-responses',modelKey:'seyeon-r35-offline',
    responseId:'resp_r40_synthetic_stage_'+receipt.stageIndex+
      '_'+receipt.callId.replace(/-/gu,''),
    responseBodyDigest:sha(JSON.stringify({
      synthetic:true,stage:receipt.stageIndex,
      receipt:'unverified_mock_only',callId:receipt.callId,
    })),
    structuredOutputDigest:sha(structuredText),
    providerOutputVerified:false,outputGuardVerified:false,
    permitsAtomicCommit:false,permitsHttpReveal:false,
  });
}

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
async function modelSources(origins:readonly {recordId:string;grantId:string}[]=[first,second]){
  if(!pool)throw Error('R21 disposable PostgreSQL only');
  if(origins.length!==2)throw Error('R21 two originals required');
  const raw=await pool.query<{id:string;content_jsonb:unknown}>(
    'select id::text as id,content_jsonb from public.memory_items where id=any($1::uuid[])',
    [origins.map(s=>s.recordId)],
  );
  if(raw.rows.length!==2)throw Error('Two synthetic originals required');
  const payload=new Map(raw.rows.map(r=>[r.id,r.content_jsonb]));
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

/** R33 actual two-session PG lock race: inspect the other backend, not JS timing. */
async function r33WaitForDbLock(label:string):Promise<void>{
  if(!pool)throw Error('R33 disposable PG required');
  for(let tries=0;tries<100;tries++){
    const r=await pool.query<{n:string}>(
      "select count(*)::text as n from pg_catalog.pg_stat_activity where application_name=$1 and wait_event_type='Lock'",
      [label],
    );
    if(r.rows[0]?.n==='1')return;
    await new Promise<void>(resolve=>setTimeout(resolve,25));
  }
  throw Error('R33 expected an independently blocked PostgreSQL session: '+label);
}
async function r33Prepare(n:number,firstOrdinal:number){
  if(!pool)throw Error('R33 disposable PG required');
  const originals=[firstOrdinal,firstOrdinal+1].map(x=>{
    const suffix=String(x).padStart(12,'0');
    return {
      recordId:'d5000000-0000-4000-8000-'+suffix,
      grantId:'d6000000-0000-4000-8000-'+suffix,
    };
  });
  await tx(async c=>{
    for(let i=0;i<originals.length;i++){
      const o=originals[i]!;
      await c.query(
        "insert into public.memory_items(id,subject_id,memory_type,schema_version,content_jsonb,source_kind,created_by_character_id,revoked_at,created_at) values($1,$2,'shared_detail','memory-v1',$3::jsonb,'user_approved','seyeon',null,clock_timestamp())",
        [o.recordId,subject,JSON.stringify({synthetic:true,r33:n,ordinal:i})],
      );
      await c.query(
        "insert into public.record_access_grants(id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at) values($1,$2,null,$3,'seyeon','user_choice',clock_timestamp(),null)",
        [o.grantId,subject,o.recordId],
      );
    }
  });
  const id=await createTurn(n);
  const source=await modelSources(originals);
  await persistSeyeonR20OfflineDigestBoundPinV1({
    pool:scopedPool,
    verifiedEvidence:{
      kind:'member',verifiedAuthUserId:'d1000000-0000-4000-8000-000000000001',
    },
    threadId:id.thread,turnId:id.turn,attemptId:id.attempt,
    ...source,twoOriginalContextReady:true,
  });
  return {id,source,originals};
}
async function r33NativeWire(stage:'integrity_classification'|'disclosure_classification',
  selectionDigest:string,previousWireDigest:string|null){
  const request:SeyeonStructuredProviderRequestV2={
    contractVersion:SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
    purpose:stage,
    instructions:SEYEON_R32_SYNTHETIC_STAGE_INSTRUCTIONS_V1,
    input:{
      fixture:true,purpose:stage,
      selectedSourcesDigest:selectionDigest,priorNativeWireDigest:previousWireDigest,
    },
    responseSchema:SEYEON_R32_SYNTHETIC_STAGE_SCHEMA_V1,
  };
  let callId='';let body='';let fetchCount=0;
  const adapter=createOpenAiSeyeonStructuredProviderV1({
    apiKey:'offline-r33-not-a-real-secret',model:'seyeon-r35-offline',
    maxOutputTokens:256,
    meteredBeforeDispatch:async(call,wire)=>{
      callId=call.callId;body=wire;
      throw Error('R33_NO_NETWORK_AUTHORIZATION');
    },
    fetchImpl:async()=>{fetchCount++;throw Error('R33_FORBIDDEN_NETWORK');},
  });
  await expect(adapter.generate(request)).rejects.toMatchObject({
    code:'PRE_DISPATCH_REJECTED',
  });
  expect(fetchCount).toBe(0);
  if(!callId||!body)throw Error('R33 native adapter never generated wire');
  return {callId,body,requestDigest:hash(request)};
}
const R33_STAGE_START_SQL=`
select seyeon_positive_candidate.claim_governed_stage_r32(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,'integrity_classification',
  $5::uuid,$6::text,$7::text,$8::text,$9::text,
  'offline-r32-test-v1','offline-r32-price-v1',500::bigint
) as receipt
`.trim();

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
  it('R30: two DB-owned originals seal five ordered ACTUAL native stage bodies with zero fetch',async()=>{
    if(!pool)throw Error('disposable PostgreSQL required');
    const a=await createTurn(759);
    const source=await modelSources();
    await persistSeyeonR20OfflineDigestBoundPinV1({
      pool:scopedPool,
      verifiedEvidence:{kind:'member',verifiedAuthUserId:'d1000000-0000-4000-8000-000000000001'},
      threadId:a.thread,turnId:a.turn,attemptId:a.attempt,
      ...source,twoOriginalContextReady:true,
    });
    const stages=['integrity_classification','disclosure_classification',
      'turn_interpretation','dialogue_render','semantic_review'] as const;
    type Stage=typeof stages[number];
    const requests=new Map<Stage,SeyeonStructuredProviderRequestV2>();
    for(const stage of stages){
      requests.set(stage,stage==='turn_interpretation'
        ?buildSeyeonTurnInterpreterRequestV2(source.finalModelContext)
        :{
          contractVersion:SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
          purpose:stage,
          instructions:'Synthetic test-only prompt: no additional private sources and no real model dispatch.',
          input:{synthetic:true,sourceSelectionDigest:source.selection.selectedSourcesDigest,
            modelContextDigest:hash(source.finalModelContext),stage},
          responseSchema:{
            type:'object',additionalProperties:false,
            properties:{ok:{type:'boolean'}},required:['ok'],
          },
        });
    }
    let fetches=0;
    const receipts:{
      stage:string;index:number;callId:string;wireDigest:string;
      previous:string|null;body:string;
    }[]=[];
    const sendStage=async(stage:Stage)=>{
      const request=requests.get(stage);
      if(!request)throw Error('stage request fixture missing');
      const client=createOpenAiSeyeonStructuredProviderV1({
        model:'seyeon-r35-offline',apiKey:'offline-r30-no-real-provider',
        maxOutputTokens:256,
        fetchImpl:async()=>{fetches++;throw Error('FORBIDDEN_PROVIDER_FETCH');},
        meteredBeforeDispatch:async(meta,body)=>{
          const claimed=await tx(c=>c.query<{receipt:{
            attemptId:string;stageIndex:number;purpose:string;
            callId:string;sourceCount:number;nativeWireDigest:string;
            selectedSourcesDigest:string;previousWireDigest:string|null;
            permitsProvider:boolean;permitsAtomicCommit:boolean;
            permitsHttpReveal:boolean;
          }}>(
            'select seyeon_positive_candidate.claim_two_original_stage_wire_r30($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::text,$8::text,$9::text) as receipt',
            [subject,a.thread,a.turn,a.attempt,stage,meta.callId,
             source.selection.selectedSourcesDigest,hash(request),body],
          ),true);
          const receipt=claimed.rows[0]?.receipt;
          if(!receipt)throw Error('R30 DB owner did not seal actual provider body');
          expect(receipt).toMatchObject({
            attemptId:a.attempt,purpose:stage,callId:meta.callId,
            sourceCount:2,
            selectedSourcesDigest:source.selection.selectedSourcesDigest,
            nativeWireDigest:'sha256:wire-utf8:v1:'+
              createHash('sha256').update(body,'utf8').digest('hex'),
            permitsProvider:false,permitsAtomicCommit:false,permitsHttpReveal:false,
          });
          receipts.push({
            stage,index:receipt.stageIndex,callId:receipt.callId,
            wireDigest:receipt.nativeWireDigest,
            previous:receipt.previousWireDigest,body,
          });
          // Mandatory offline fence: DB stage admission cannot dispatch.
          throw Error('R30 synthetic DB receipt is not Provider authorization');
        },
      });
      await expect(client.generate(request)).rejects.toThrow();
    };
    await sendStage('semantic_review');
    expect(fetches).toBe(0);
    expect(receipts).toHaveLength(0);
    for(const stage of stages)await sendStage(stage);
    expect(receipts.map(x=>x.index)).toEqual([0,1,2,3,4]);
    expect(receipts.map(x=>x.stage)).toEqual([...stages]);
    expect(receipts[0]?.previous).toBeNull();
    for(let i=1;i<5;i++)
      expect(receipts[i]?.previous).toBe(receipts[i-1]?.wireDigest);
    expect(fetches).toBe(0);
    const rows=await pool.query<{
      stage_index:number;purpose:string;native_wire_digest:string;
      previous_wire_digest:string|null;
    }>(
      'select stage_index,purpose,native_wire_digest,previous_wire_digest from seyeon_positive_candidate.native_stage_lineage_r30 where attempt_id=$1::uuid order by stage_index',
      [a.attempt],
    );
    expect(rows.rows).toHaveLength(5);
    expect(rows.rows.map(x=>x.native_wire_digest)).toEqual(
      receipts.map(x=>x.wireDigest),
    );
    expect(await state(a)).toMatchObject({
      turnState:'context_ready',parents:'1',edges:'2',firstPins:'1',
    });
    await expect(tx(c=>c.query(
      'select seyeon_positive_candidate.claim_two_original_stage_wire_r30($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::text,$8::text,$9::text)',
      [subject,a.thread,a.turn,a.attempt,'semantic_review',
       receipts[4]!.callId,source.selection.selectedSourcesDigest,
       hash(requests.get('semantic_review')),receipts[4]!.body],
    ),true)).rejects.toMatchObject({constraint:'seyeon_r30_duplicate_stage'});
    // All five synthetic pre-dispatch receipts still do NOT authorize
    // a cost-ungoverned reply/commit. G2 needs exact R28 cost+settlement.
    expect(await pool.query<{count:string}>(
      'select count(*)::text as count from public.seyeon_ai_call_cost_events where attempt_id=$1::uuid',
      [a.attempt],
    )).toMatchObject({rows:[{count:'0'}]});
    // Real G2 cannot treat five stage-wire receipts as a Cost Governor
    // reservation. Verify the deliberate R30-only Attempt cannot commit.
    const suffix=a.turn.slice(-12);
    await tx(async c=>{
      const generated=await c.query<{ok:boolean}>(
        'select public.cmd_persist_seyeon_chat_generated_runtime_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::text,$8::text,$9::text,$10::jsonb,$11::text,$12::text,$13::jsonb) as ok',
        [subject,a.turn,a.attempt,a.participant,
         'd8100000-0000-4000-8000-'+suffix,
         'offline','offline-model','offline-stage-r30','synthetic stage only',
         JSON.stringify({text:'synthetic stage only'}),
         'chat-character-message-v1','sha256:v1:'+'b'.repeat(64),'[]'],
      );
      expect(generated.rows[0]?.ok).toBe(false);
      const edges=await c.query<{
        recordId:string;grantId:string;pgPayloadDigest:string;
      }>(
        'select memory_id::text as "recordId",original_grant_id::text as "grantId",pg_payload_digest as "pgPayloadDigest" from seyeon_positive_candidate.source_edges_r1 where attempt_id=$1::uuid order by ordinal',
        [a.attempt],
      );
      expect(edges.rows).toHaveLength(2);
      const validated=await c.query<{ok:boolean}>(
        'select public.cmd_persist_seyeon_chat_validated_runtime_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,$7::text,$8::text,$9::jsonb,$10::jsonb) as ok',
        [subject,a.turn,a.attempt,
         'd8200000-0000-4000-8000-'+suffix,
         'offline','offline-model','offline-r30-guard',
         'sha256:v1:'+'b'.repeat(64),
         JSON.stringify({passed:true,personalRecordProvenance:{
           schemaVersion:'offline-positive-two-original-source-proof-r25',
           selectedSourcesDigest:source.selection.selectedSourcesDigest,
           sources:edges.rows.map(e=>({
             recordId:e.recordId,originalGrantId:e.grantId,
             pgPayloadDigest:e.pgPayloadDigest,
           })),
         }}),'[]'],
      );
      expect(validated.rows[0]?.ok).toBe(false);
    },true);
    await expect(tx(c=>c.query(
      'select seyeon_positive_candidate.commit_actual_v2_r3($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::jsonb,$9::text,$10::text)',
      [subject,a.thread,a.turn,a.attempt,
       'd8300000-0000-4000-8000-'+suffix,
       'd8400000-0000-4000-8000-'+suffix,
       'd8500000-0000-4000-8000-'+suffix,
       JSON.stringify({
         schemaVersion:'seyeon-post-turn-analysis-snapshot-v1',
         turnId:a.turn,
         assistantMessageId:'d8300000-0000-4000-8000-'+suffix,
         userMessageId:a.user,
       }),
       'sha256:v1:synthetic-stage-only-r30',
       source.selection.selectedSourcesDigest],
    ),true)).rejects.toMatchObject({
      constraint:'seyeon_offline_r28_governed_cost_missing_wire_seal',
    });
    expect(fetches).toBe(0);
  },30000);
  it('R26: real G1 two-original digest and native wire -> atomic governed reservation; fetch stays blocked',async()=>{
    if(!pool)throw Error('disposable PostgreSQL required');
    const id=await createTurn(756);
    const source=await modelSources();
    const policy:SeyeonAiGovernorAdmissionV1['policy']={
      policyVersion:'offline-r26-test-v1',
      providerKey:'openai-responses',modelKey:'seyeon-r35-offline',
      priceQuote:{
        priceVersion:'offline-r26-rate-v1',
        providerKey:'openai-responses',modelKey:'seyeon-r35-offline',
        inputMicroUsdPerMillion:1_000_000,
        cachedInputMicroUsdPerMillion:250_000,
        outputMicroUsdPerMillion:4_000_000,
      },
      allowedPurposes:['turn_interpretation'],
      contextWindowTokens:4096,maximumInputTokens:1000,
      maximumOutputTokens:256,maximumSerializedRequestBytes:65_536,
    };
    await pool.query(
      "insert into public.seyeon_ai_governor_model_policies_v1(provider_key,model_key,policy_version,price_version,allowed_purposes,context_window_tokens,maximum_input_tokens,maximum_output_tokens,maximum_serialized_request_bytes,input_micro_usd_per_million,cached_input_micro_usd_per_million,output_micro_usd_per_million,is_active) values ($1,$2,$3,$4,array['turn_interpretation']::text[],4096,1000,256,65536,1000000,250000,4000000,true)",
      ['openai-responses','seyeon-r35-offline','offline-r26-test-v1','offline-r26-rate-v1'],
    );
    await pool.query(
      "insert into public.seyeon_ai_governor_daily_budgets_v1(bucket_utc_date,global_limit_micro_usd,subject_limit_micro_usd) values ((clock_timestamp() at time zone 'UTC')::date,50000,20000)",
    );
    const governor:SeyeonAiGovernorAdmissionV1={
      policy,
      certifiedInputTokenUpperBound:(_request,bytes,body)=>{
        if(bytes!==Buffer.byteLength(body,'utf8'))throw Error('invalid exact bytes');
        return 500; // synthetic offline certified-count fixture, not production proof
      },
    };
    const pinInput={
      pool:scopedPool,
      verifiedEvidence:{kind:'member' as const,verifiedAuthUserId:'d1000000-0000-4000-8000-000000000001'},
      threadId:id.thread,turnId:id.turn,attemptId:id.attempt,
      ...source,twoOriginalContextReady:true as const,
    };
    let fetchCount=0;
    const observed:SeyeonR26OfflineG4ReceiptV1[]=[];
    const captured:Parameters<typeof reserveSeyeonR26OfflineGovernedWireV1>[0][]=[];
    const provider=createOpenAiSeyeonStructuredProviderV1({
      model:'seyeon-r35-offline',apiKey:'never-network-disposable-r26',
      maxOutputTokens:256,
      fetchImpl:async()=>{fetchCount++;throw Error('PROVIDER_SEND_FORBIDDEN');},
      meteredBeforeDispatch:async(call,requestBody)=>{
        const wireAttestation=await attestSeyeonR35OfflineWireAfterDbPinV1({
          pinInput,call,requestBody,enforcedOutputTokens:256,
        });
        const proof={pinInput,wireAttestation,call,requestBody,governor};
        captured.push(proof);
        observed.push(await reserveSeyeonR26OfflineGovernedWireV1(proof));
        throw new SeyeonR26OfflineG4HoldV1(); // deliberate no-network fence
      },
    });
    await expect(provider.generate(buildSeyeonTurnInterpreterRequestV2(
      source.finalModelContext,
    ))).rejects.toMatchObject({code:'PRE_DISPATCH_REJECTED'});
    expect(fetchCount).toBe(0);
    expect(observed[0]).toMatchObject({
      status:'disposable_governed_reservation_committed_without_dispatch',
      selectedSourcesDigest:source.selection.selectedSourcesDigest,
      inputCeilingTokens:500,outputCeilingTokens:256,
      reservedMicroUsd:'1524',
      permitsProvider:false,permitsAtomicCommit:false,permitsHttpReveal:false,
    });
    expect(await state(id)).toMatchObject({
      turnState:'context_ready',parents:'1',edges:'2',firstPins:'1',
    });
    const receipt=observed[0];
    const beforeDispatch=captured[0];
    if(!receipt||!beforeDispatch)throw Error('G4 offline receipt absent');
    const row=await pool.query<{
      lifecycle_state:string;governor_ceiling_micro_usd:string;
      governor_input_bound_tokens:string;governor_output_cap_tokens:string;
    }>(
      'select lifecycle_state,governor_ceiling_micro_usd::text,governor_input_bound_tokens::text,governor_output_cap_tokens::text from public.seyeon_ai_call_cost_events where call_id=$1::uuid',
      [receipt.callId],
    );
    expect(row.rows).toMatchObject([{
      lifecycle_state:'started',governor_ceiling_micro_usd:'1524',
      governor_input_bound_tokens:'500',governor_output_cap_tokens:'256',
    }]);
    // R28's immutable DB record must correspond to the SAME governed cost
    // row and both original edges. No full model/private bytes are stored.
    const seals=await pool.query<{
      source_count:number;selected_sources_digest:string;
      final_model_context_digest:string;native_wire_digest:string;
      input_ceiling_tokens:string;output_ceiling_tokens:string;
      reserved_micro_usd:string;purpose:string;
    }>(
      'select source_count,selected_sources_digest,final_model_context_digest,native_wire_digest,input_ceiling_tokens::text,output_ceiling_tokens::text,reserved_micro_usd::text,purpose from seyeon_positive_candidate.governed_wire_reservations_r28 where call_id=$1::uuid',
      [receipt.callId],
    );
    expect(seals.rows).toMatchObject([{
      source_count:2,selected_sources_digest:source.selection.selectedSourcesDigest,
      final_model_context_digest:hash(source.finalModelContext),
      native_wire_digest:receipt.wireBodyDigest,
      input_ceiling_tokens:'500',output_ceiling_tokens:'256',
      reserved_micro_usd:'1524',purpose:'turn_interpretation',
    }]);
    const acl=await tx(c=>c.query<{canRead:boolean;canWrite:boolean}>(
      'select has_table_privilege(current_user,$1::text,\'SELECT\') as "canRead",has_table_privilege(current_user,$1::text,\'INSERT\') as "canWrite"',
      ['seyeon_positive_candidate.governed_wire_reservations_r28'],
    ),true);
    expect(acl.rows).toMatchObject([{canRead:false,canWrite:false}]);
    await expect(pool.query(
      'update seyeon_positive_candidate.governed_wire_reservations_r28 set reserved_micro_usd=1 where call_id=$1::uuid',
      [receipt.callId],
    )).rejects.toMatchObject({code:'23514'});

    // Even with a valid G1 SourceSet and a committed G4 reservation, the
    // actual G2 Owner cannot treat a NEVER-SENT request as successful usage.
    const syntheticBody='r28 denied before Provider result';
    const idSuffix=id.turn.slice(-12);
    await tx(async client=>{
      const generated=await client.query<{ok:boolean}>(
        'select public.cmd_persist_seyeon_chat_generated_runtime_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::text,$8::text,$9::text,$10::jsonb,$11::text,$12::text,$13::jsonb) as ok',
        [subject,id.turn,id.attempt,id.participant,'d8100000-0000-4000-8000-'+idSuffix,
         'offline','offline-model','offline-renderer-r28',syntheticBody,
         JSON.stringify({text:syntheticBody}),'chat-character-message-v1',
         'sha256:v1:'+'b'.repeat(64),'[]'],
      );
      expect(generated.rows[0]?.ok).toBe(false);
      const proofRows=await client.query<{
        memory_id:string;original_grant_id:string;pg_payload_digest:string;
      }>(
        'select memory_id::text,original_grant_id::text,pg_payload_digest from seyeon_positive_candidate.source_edges_r1 where attempt_id=$1::uuid order by ordinal',
        [id.attempt],
      );
      expect(proofRows.rows).toHaveLength(2);
      const verifiedProof={
        schemaVersion:'offline-positive-two-original-source-proof-r25',
        selectedSourcesDigest:source.selection.selectedSourcesDigest,
        sources:proofRows.rows.map(r=>({
          recordId:r.memory_id,originalGrantId:r.original_grant_id,
          pgPayloadDigest:r.pg_payload_digest,
        })),
      };
      const validated=await client.query<{ok:boolean}>(
        'select public.cmd_persist_seyeon_chat_validated_runtime_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,$7::text,$8::text,$9::jsonb,$10::jsonb) as ok',
        [subject,id.turn,id.attempt,'d8200000-0000-4000-8000-'+idSuffix,
         'offline','offline-model','offline-output-guard-r28',
         'sha256:v1:'+'b'.repeat(64),
         JSON.stringify({passed:true,personalRecordProvenance:verifiedProof}),'[]'],
      );
      expect(validated.rows[0]?.ok).toBe(false);
    },true);
    await expect(tx(c=>c.query(
      'select seyeon_positive_candidate.commit_actual_v2_r3($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::jsonb,$9::text,$10::text) as receipt',
      [subject,id.thread,id.turn,id.attempt,
       'd8300000-0000-4000-8000-'+idSuffix,
       'd8400000-0000-4000-8000-'+idSuffix,
       'd8500000-0000-4000-8000-'+idSuffix,
       JSON.stringify({
         schemaVersion:'seyeon-post-turn-analysis-snapshot-v1',
         turnId:id.turn,assistantMessageId:'d8300000-0000-4000-8000-'+idSuffix,
         userMessageId:id.user,
       }),
       'sha256:v1:synthetic-post-turn-r28',
       source.selection.selectedSourcesDigest],
    ),true)).rejects.toMatchObject({
      constraint:'seyeon_offline_r28_governed_cost_unsettled',
    });
    const withheld=await pool.query<{messages:string;outboxes:string;admissions:string}>(
      "select (select count(*)::text from public.conversation_messages where turn_id=$1::uuid and sender_type='character') as messages,"+
      " (select count(*)::text from public.outbox_events where aggregate_type='chat_turn' and aggregate_id=$1::text and event_type in ('CHAT_TURN_COMMITTED','SEYEON_POST_TURN_ANALYSIS_REQUESTED')) as outboxes,"+
      " (select count(*)::text from seyeon_positive_candidate.actual_v2_commit_admissions_r3 where attempt_id=$2::uuid) as admissions",
      [id.turn,id.attempt],
    );
    expect(withheld.rows[0]).toMatchObject({
      messages:'0',outboxes:'0',admissions:'0',
    });
    // Same Call ID must not claim a second reservation/Provider dispatch.
    await expect(reserveSeyeonR26OfflineGovernedWireV1(beforeDispatch))
      .rejects.toBeInstanceOf(SeyeonR26OfflineG4HoldV1);
    const budget=await pool.query<{occupied_micro_usd:string}>(
      "select occupied_micro_usd::text from public.seyeon_ai_governor_daily_budgets_v1 where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date",
    );
    expect(budget.rows[0]?.occupied_micro_usd).toBe('1524');
    // Forged cap or missing independent certification cannot reach Governor.
    await expect(reserveSeyeonR26OfflineGovernedWireV1({
      ...beforeDispatch,
      governor:{...governor,policy:{...policy,maximumOutputTokens:257}},
    })).rejects.toBeInstanceOf(SeyeonR26OfflineG4HoldV1);
    await expect(reserveSeyeonR26OfflineGovernedWireV1({
      ...beforeDispatch,
      governor:{policy,certifiedInputTokenUpperBound:()=>null},
    })).rejects.toBeInstanceOf(SeyeonR26OfflineG4HoldV1);
    expect(fetchCount).toBe(0);
    // Actual DB budget exhaustion AFTER an authentic two-original Pin prevents
    // the next native Provider call; no fake zero-cost or retry authorization.
    const deniedTurn=await createTurn(757);
    const deniedPin={
      ...pinInput,threadId:deniedTurn.thread,turnId:deniedTurn.turn,
      attemptId:deniedTurn.attempt,
    };
    await pool.query(
      "update public.seyeon_ai_governor_daily_budgets_v1 set global_limit_micro_usd=1524 where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date",
    );
    try{
      const deniedProvider=createOpenAiSeyeonStructuredProviderV1({
        model:'seyeon-r35-offline',apiKey:'offline-r26-never-send',
        maxOutputTokens:256,
        fetchImpl:async()=>{fetchCount++;throw Error('FORBIDDEN_NETWORK');},
        meteredBeforeDispatch:async(call,requestBody)=>{
          const attested=await attestSeyeonR35OfflineWireAfterDbPinV1({
            pinInput:deniedPin,call,requestBody,enforcedOutputTokens:256,
          });
          await reserveSeyeonR26OfflineGovernedWireV1({
            pinInput:deniedPin,wireAttestation:attested,call,requestBody,governor,
          });
          throw new SeyeonR26OfflineG4HoldV1();
        },
      });
      await expect(deniedProvider.generate(buildSeyeonTurnInterpreterRequestV2(
        source.finalModelContext,
      ))).rejects.toMatchObject({code:'PRE_DISPATCH_REJECTED'});
      expect(fetchCount).toBe(0);
      expect(await state(deniedTurn)).toMatchObject({
        turnState:'context_ready',parents:'1',edges:'2',firstPins:'1',
      });
      const deniedLedger=await pool.query<{count:string}>(
        'select count(*)::text as count from public.seyeon_ai_call_cost_events where attempt_id=$1::uuid',
        [deniedTurn.attempt],
      );
      expect(deniedLedger.rows[0]?.count).toBe('0');
      const total=await pool.query<{occupied:string}>(
        "select occupied_micro_usd::text as occupied from public.seyeon_ai_governor_daily_budgets_v1 where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date",
      );
      expect(total.rows[0]?.occupied).toBe('1524');
    }finally{
      await pool.query(
        "update public.seyeon_ai_governor_daily_budgets_v1 set global_limit_micro_usd=50000 where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date",
      );
    }
    // Bypassing the server's wire seal via the legacy Cost Start RPC is
    // insufficient even if the DB accepts a bounded synthetic reservation.
    const unsealed=await createTurn(758);
    await candidate(unsealed,[first,second]);
    const unsealedCall='d9000000-0000-4000-8000-000000000758';
    await tx(async client=>{
      const start=await client.query<{call_id:string}>(
        'select * from public.cmd_governed_start_seyeon_ai_call_v1($1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid,$6::text,$7::text,$8::text,$9::text,$10::text,$11::bigint,$12::bigint,$13::bigint)',
        [subject,unsealed.turn,unsealed.attempt,'chat',unsealedCall,
         'turn_interpretation','openai-responses','seyeon-r35-offline',
         'offline-r26-test-v1','offline-r26-rate-v1',500,256,2048],
      );
      expect(start.rows).toMatchObject([{call_id:unsealedCall}]);
      const tail=unsealed.turn.slice(-12);
      const generated=await client.query<{ok:boolean}>(
        'select public.cmd_persist_seyeon_chat_generated_runtime_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::text,$8::text,$9::text,$10::jsonb,$11::text,$12::text,$13::jsonb) as ok',
        [subject,unsealed.turn,unsealed.attempt,unsealed.participant,
         'd8100000-0000-4000-8000-'+tail,'offline','offline-model',
         'offline-renderer-r28','synthetic unsealed',
         JSON.stringify({text:'synthetic unsealed'}),
         'chat-character-message-v1','sha256:v1:'+'b'.repeat(64),'[]'],
      );
      expect(generated.rows[0]?.ok).toBe(false);
      const edge=await client.query<{
        recordId:string;grantId:string;digest:string;
      }>(
        'select memory_id::text as "recordId",original_grant_id::text as "grantId",pg_payload_digest as digest from seyeon_positive_candidate.source_edges_r1 where attempt_id=$1::uuid order by ordinal',
        [unsealed.attempt],
      );
      expect(edge.rows).toHaveLength(2);
      const proof={
        schemaVersion:'offline-positive-two-original-source-proof-r25',
        selectedSourcesDigest:unsealed.selection,
        sources:edge.rows.map(e=>({
          recordId:e.recordId,originalGrantId:e.grantId,pgPayloadDigest:e.digest,
        })),
      };
      const validated=await client.query<{ok:boolean}>(
        'select public.cmd_persist_seyeon_chat_validated_runtime_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,$7::text,$8::text,$9::jsonb,$10::jsonb) as ok',
        [subject,unsealed.turn,unsealed.attempt,
         'd8200000-0000-4000-8000-'+tail,'offline','offline-model',
         'offline-output-guard-r28','sha256:v1:'+'b'.repeat(64),
         JSON.stringify({passed:true,personalRecordProvenance:proof}),'[]'],
      );
      expect(validated.rows[0]?.ok).toBe(false);
    },true);
    const suffix=unsealed.turn.slice(-12);
    await expect(tx(c=>c.query(
      'select seyeon_positive_candidate.commit_actual_v2_r3($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::jsonb,$9::text,$10::text)',
      [subject,unsealed.thread,unsealed.turn,unsealed.attempt,
       'd8300000-0000-4000-8000-'+suffix,
       'd8400000-0000-4000-8000-'+suffix,
       'd8500000-0000-4000-8000-'+suffix,
       JSON.stringify({
         schemaVersion:'seyeon-post-turn-analysis-snapshot-v1',
         turnId:unsealed.turn,
         assistantMessageId:'d8300000-0000-4000-8000-'+suffix,
         userMessageId:unsealed.user,
       }),
       'sha256:v1:synthetic-unsealed-r28',unsealed.selection],
    ),true)).rejects.toMatchObject({
      constraint:'seyeon_offline_r28_governed_cost_missing_wire_seal',
    });
    const noCommit=await pool.query<{count:string}>(
      "select count(*)::text as count from public.conversation_messages where turn_id=$1::uuid and sender_type='character'",
      [unsealed.turn],
    );
    expect(noCommit.rows[0]?.count).toBe('0');

    // The old real DB Worker is exercised with a SYNTHETIC, never-sent
    // Provider usage event. This only proves the ledger accounting chain;
    // a simulated settlement is NEVER authority for a real model reply.
    const syntheticOutcome=createSeyeonAiCostEventV1({
      callId:receipt.callId,purpose:'turn_interpretation',
      providerKey:'openai-responses',modelKey:'seyeon-r35-offline',
      outcome:'response_received',httpStatus:200,elapsedMs:8,
      usage:{
        inputTokens:100,outputTokens:50,cachedInputTokens:0,reasoningTokens:0,
      },
      price:policy.priceQuote,
    });
    expect(syntheticOutcome).toMatchObject({
      costStatus:'estimated',estimatedCostMicroUsd:300,
      invoiceReconciled:false,
    });
    await tx(async client=>{
      await client.query("select set_config('myeongha.subject_id',$1,true)",[subject]);
      const stored=await client.query<{call_id:string;replayed:boolean}>(
        'select * from public.cmd_store_seyeon_provider_receipt_v1($1::uuid,$2::uuid,$3::uuid,$4::text,$5::jsonb)',
        [subject,id.turn,id.attempt,'chat',JSON.stringify(syntheticOutcome)],
      );
      expect(stored.rows).toMatchObject([{call_id:receipt.callId,replayed:false}]);
    });
    const claimed=await tx(c=>c.query<{call_id:string;claim_token:string}>(
      'select call_id::text,claim_token::text from public.cmd_claim_seyeon_provider_receipt_v1()',
    ));
    expect(claimed.rows).toHaveLength(1);
    expect(claimed.rows[0]?.call_id).toBe(receipt.callId);
    const token=claimed.rows[0]?.claim_token;
    if(!token)throw Error('synthetic settlement worker lease missing');
    await tx(async c=>{
      await c.query("select set_config('myeongha.subject_id',$1,true)",[subject]);
      const settled=await c.query<{
        call_id:string;replayed:boolean;occupied_micro_usd:string;
        over_ceiling:boolean;
      }>(
        'select call_id::text,replayed,occupied_micro_usd::text,over_ceiling from public.cmd_governed_settle_seyeon_ai_call_v1($1::uuid,$2::uuid,$3::uuid,$4::text,$5::jsonb)',
        [subject,id.turn,id.attempt,'chat',JSON.stringify(syntheticOutcome)],
      );
      expect(settled.rows).toMatchObject([{
        call_id:receipt.callId,replayed:false,occupied_micro_usd:'300',
        over_ceiling:false,
      }]);
    });
    const acked=await tx(c=>c.query<{acknowledged:boolean}>(
      'select public.cmd_ack_seyeon_provider_receipt_v1($1::uuid,$2::uuid) as acknowledged',
      [receipt.callId,token],
    ));
    expect(acked.rows[0]?.acknowledged).toBe(true);
    // G2 still MUST refuse a purported successful single interpreter call.
    // It cannot establish the complete approved, provenance-preserving
    // Preflight + Interpreter + Renderer + Reviewer lineage.
    await expect(tx(c=>c.query(
      'select seyeon_positive_candidate.commit_actual_v2_r3($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::jsonb,$9::text,$10::text)',
      [subject,id.thread,id.turn,id.attempt,
       'd8300000-0000-4000-8000-'+idSuffix,
       'd8400000-0000-4000-8000-'+idSuffix,
       'd8500000-0000-4000-8000-'+idSuffix,
       JSON.stringify({
         schemaVersion:'seyeon-post-turn-analysis-snapshot-v1',
         turnId:id.turn,
         assistantMessageId:'d8300000-0000-4000-8000-'+idSuffix,
         userMessageId:id.user,
       }),
       'sha256:v1:synthetic-r29-post-turn-hash',
       source.selection.selectedSourcesDigest],
    ),true)).rejects.toMatchObject({
      constraint:'seyeon_offline_r30_native_stage_lineage_incomplete',
    });
    const stillNoOutputs=await pool.query<{messages:string;admissions:string}>(
      "select (select count(*)::text from public.conversation_messages where turn_id=$1::uuid and sender_type='character') as messages,"+
      " (select count(*)::text from seyeon_positive_candidate.actual_v2_commit_admissions_r3 where attempt_id=$2::uuid) as admissions",
      [id.turn,id.attempt],
    );
    expect(stillNoOutputs.rows[0]).toMatchObject({
      messages:'0',admissions:'0',
    });
    expect(fetchCount).toBe(0);

    // A deletion of cost/Provider evidence must NEVER erase the governed
    // Attempt marker, which would silently reopen legacy positive G2.
    await pool.query(
      'delete from public.seyeon_ai_call_cost_events where call_id=$1::uuid',
      [receipt.callId],
    );
    const surviving=await pool.query<{markers:string;ledger:string;queue:string}>(
      'select (select count(*)::text from seyeon_positive_candidate.governed_wire_reservations_r28 where call_id=$1::uuid) as markers,'+
      ' (select count(*)::text from public.seyeon_ai_call_cost_events where call_id=$1::uuid) as ledger,'+
      ' (select count(*)::text from public.seyeon_ai_provider_receipt_queue_v1 where call_id=$1::uuid) as queue',
      [receipt.callId],
    );
    expect(surviving.rows).toMatchObject([{markers:'1',ledger:'0',queue:'0'}]);
    await expect(tx(c=>c.query(
      'select seyeon_positive_candidate.commit_actual_v2_r3($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::jsonb,$9::text,$10::text)',
      [subject,id.thread,id.turn,id.attempt,
       'd8300000-0000-4000-8000-'+idSuffix,
       'd8400000-0000-4000-8000-'+idSuffix,
       'd8500000-0000-4000-8000-'+idSuffix,
       JSON.stringify({
         schemaVersion:'seyeon-post-turn-analysis-snapshot-v1',
         turnId:id.turn,
         assistantMessageId:'d8300000-0000-4000-8000-'+idSuffix,
         userMessageId:id.user,
       }),
       'sha256:v1:synthetic-ledger-deleted-r29',
       source.selection.selectedSourcesDigest],
    ),true)).rejects.toMatchObject({
      constraint:'seyeon_offline_r28_governed_cost_unsettled',
    });

    // A stale G1/Wire receipt is not enough once the SECOND original Grant
    // was revoked between attestation and the new G4 DB reservation.
    await pool.query(
      'update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',
      [second.grantId],
    );
    // The genuine DB settlement ledger does not extend a revoked Memory.
    // G2 must re-lock both ORIGINAL Grants, even after receipt ACK.
    await expect(tx(c=>c.query(
      'select seyeon_positive_candidate.commit_actual_v2_r3($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::jsonb,$9::text,$10::text)',
      [subject,id.thread,id.turn,id.attempt,
       'd8300000-0000-4000-8000-'+idSuffix,
       'd8400000-0000-4000-8000-'+idSuffix,
       'd8500000-0000-4000-8000-'+idSuffix,
       JSON.stringify({
         schemaVersion:'seyeon-post-turn-analysis-snapshot-v1',
         turnId:id.turn,assistantMessageId:'d8300000-0000-4000-8000-'+idSuffix,
         userMessageId:id.user,
       }),
       'sha256:v1:synthetic-revoked-after-settle-r29',
       source.selection.selectedSourcesDigest],
    ),true)).rejects.toMatchObject({
      constraint:'seyeon_offline_r25_original_grant_revoked',
    });
    const staleId='d9000000-0000-4000-8000-000000000026';
    await expect(reserveSeyeonR26OfflineGovernedWireV1({
      ...beforeDispatch,call:{...beforeDispatch.call,callId:staleId},
    })).rejects.toBeInstanceOf(SeyeonR26OfflineG4HoldV1);
    const leaked=await pool.query<{count:string}>(
      'select count(*)::text as count from public.seyeon_ai_call_cost_events where call_id=$1::uuid',
      [staleId],
    );
    expect(leaked.rows[0]?.count).toBe('0');
    const remaining=await pool.query<{occupied:string}>(
      "select occupied_micro_usd::text as occupied from public.seyeon_ai_governor_daily_budgets_v1 where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date",
    );
    // One explicitly SYNTHETIC outcome reduced only its own reserved
    // balance to 300; the other unsealed/unsent start still retains 1,524.
    expect(remaining.rows[0]?.occupied).toBe('1824');
  },30000);
  it('R32/R35: DB rejects ten unpinned Interpreter source mutations, then settles five synthetic stages with G2 HOLD',async()=>{
    if(!pool)throw Error('R32 requires disposable PostgreSQL');
    // These two fresh originals are independent of the R26 revoked fixture.
    const originals=[
      {recordId:'d5000000-0000-4000-8000-000000000003',
       grantId:'d6000000-0000-4000-8000-000000000003'},
      {recordId:'d5000000-0000-4000-8000-000000000004',
       grantId:'d6000000-0000-4000-8000-000000000004'},
    ];
    await tx(async client=>{
      for(let i=0;i<originals.length;i++){
        const o=originals[i]!;
        await client.query(
          "insert into public.memory_items(id,subject_id,memory_type,schema_version,content_jsonb,source_kind,created_by_character_id,revoked_at,created_at) values($1,$2,'shared_detail','memory-v1',$3::jsonb,'user_approved','seyeon',null,clock_timestamp())",
          [o.recordId,subject,JSON.stringify({synthetic:true,r32:i})],
        );
        await client.query(
          "insert into public.record_access_grants(id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at) values($1,$2,null,$3,'seyeon','user_choice',clock_timestamp(),null)",
          [o.grantId,subject,o.recordId],
        );
      }
    });
    const a=await createTurn(760);
    const source=await modelSources(originals);
    const pinInput={
      pool:scopedPool,
      verifiedEvidence:{kind:'member' as const,
        verifiedAuthUserId:'d1000000-0000-4000-8000-000000000001'},
      threadId:a.thread,turnId:a.turn,attemptId:a.attempt,
      ...source,twoOriginalContextReady:true as const,
    };
    await persistSeyeonR20OfflineDigestBoundPinV1(pinInput);
    const purposes=['integrity_classification','disclosure_classification',
      'turn_interpretation','dialogue_render','semantic_review'] as const;
    const policy:SeyeonAiGovernorAdmissionV1['policy']={
      policyVersion:'offline-r32-test-v1',providerKey:'openai-responses',
      modelKey:'seyeon-r35-offline',
      priceQuote:{
        priceVersion:'offline-r32-price-v1',providerKey:'openai-responses',
        modelKey:'seyeon-r35-offline',inputMicroUsdPerMillion:1000000,
        cachedInputMicroUsdPerMillion:250000,outputMicroUsdPerMillion:4000000,
      },
      allowedPurposes:[...purposes],contextWindowTokens:4096,
      maximumInputTokens:1000,maximumOutputTokens:256,
      maximumSerializedRequestBytes:65536,
    };
    const governor:SeyeonAiGovernorAdmissionV1={
      policy,
      certifiedInputTokenUpperBound:(_request,bytes,body)=>{
        if(bytes!==Buffer.byteLength(body,'utf8'))
          throw Error('R32 fake certification saw different wire bytes');
        return 500; // isolated synthetic bound, not an official tokenizer
      },
    };
    await pool.query(
      "insert into public.seyeon_ai_governor_model_policies_v1(provider_key,model_key,policy_version,price_version,allowed_purposes,context_window_tokens,maximum_input_tokens,maximum_output_tokens,maximum_serialized_request_bytes,input_micro_usd_per_million,cached_input_micro_usd_per_million,output_micro_usd_per_million,is_active) values ($1,$2,$3,$4,$5::text[],4096,1000,256,65536,1000000,250000,4000000,true)",
      [policy.providerKey,policy.modelKey,policy.policyVersion,
       policy.priceQuote.priceVersion,[...purposes]],
    );
    const used:SeyeonR32OfflineStageReceiptV1[]=[];
    const observed:SeyeonR37OfflineSyntheticResultV1[]=[];
    // Actual authored guards execute on INVALID non-private local fixtures.
    // A negative probe is never a Provider response or passing validation.
    const probes=exerciseSeyeonR38NegativeRealGuardsV1(
      source.finalModelContext,
    );
    expect(probes).toHaveLength(4);
    const rejectedCases:string[]=[];
    let fetches=0;
    for(const purpose of purposes){
      const request:SeyeonStructuredProviderRequestV2=
        purpose==='turn_interpretation'
          ?buildSeyeonTurnInterpreterRequestV2(source.finalModelContext)
          :{
            contractVersion:SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
            purpose,
            instructions:SEYEON_R32_SYNTHETIC_STAGE_INSTRUCTIONS_V1,
            input:{
              fixture:true,purpose,
              selectedSourcesDigest:source.selection.selectedSourcesDigest,
              priorNativeWireDigest:used.length===0?null:used[used.length-1]?.nativeWireDigest,
            },
            responseSchema:SEYEON_R32_SYNTHETIC_STAGE_SCHEMA_V1,
          };
      const client=createOpenAiSeyeonStructuredProviderV1({
        apiKey:'no-network-r32-synthetic-only',model:'seyeon-r35-offline',
        maxOutputTokens:256,
        fetchImpl:async()=>{fetches++;throw Error('R32_NETWORK_FORBIDDEN');},
        meteredBeforeDispatch:async(call,requestBody)=>{
          if(purpose==='turn_interpretation'){
            // R35 independent DB protection: the Node wrapper has validated
            // the real Context, but direct SQL must reject every derived
            // source mutation BEFORE the Interpreter is cost-reserved.
            const native=JSON.parse(requestBody) as {
              input:{role:string;content:{type:string;text:string}[]}[];
            };
            const originalInput=JSON.parse(
              native.input[0]!.content[0]!.text,
            ) as Record<string,unknown>;
            const baseline=originalInput.context as Record<string,unknown>;
            const memories=baseline.retrievedMemories as
              readonly Record<string,unknown>[];
            const refs=originalInput.allowedReferenceVocabulary as
              Record<string,unknown>;
            const disclosure=baseline.disclosure as Record<string,unknown>;
            const integrity=baseline.integrity as Record<string,unknown>;
            const variants:readonly Record<string,unknown>[]=[
              {...originalInput,context:{...baseline,
                recentConversation:[{
                  messageId:'d7100000-0000-4000-8000-000000000001',
                  role:'assistant',text:'unverified prior assistant answer',
                }],
              }},
              {...originalInput,context:{...baseline,
                relationship:{relationshipStage:'forged_history'},
              }},
              {...originalInput,context:{...baseline,
                integrity:{...integrity,governedPreflightApplied:true},
              }},
              {...originalInput,context:{...baseline,
                disclosure:{...disclosure,
                  retrievedSources:[{sourceRef:'unverified-derived-private'}]},
              }},
              {...originalInput,context:{...baseline,
                retrievedMemories:[
                  memories[0],
                  {...memories[1],sourceRef:'memory:forged:grant:replacement'},
                ],
              }},
              {...originalInput,context:{...baseline,
                retrievedMemories:[
                  {...memories[0],summary:'unverified old relationship text'},
                  memories[1],
                ],
              }},
              {...originalInput,allowedReferenceVocabulary:{
                ...refs,historySourceRefs:['relationship-event:forged'],
              }},
              {...originalInput,context:{...baseline,
                relationshipSemantics:{historyRevision:999},
              }},
              {...originalInput,context:{...baseline,
                retrievedMemories:[
                  ...memories,
                  {kind:'relationship_event',memoryId:'relationship-event:fake',
                   sourceRef:'relationship-event:fake',summary:'fabricated',
                   relevance:1,salience:1,claimKind:'fact'},
                ],
              }},
              {...originalInput,context:{...baseline,
                behaviorPolicy:{
                  ...(baseline.behaviorPolicy as Record<string,unknown>),
                  injectedPriorAssistantMemory:'private-derived-data',
                },
              }},
            ];
            const reservedBefore=await pool!.query<{stage_count:string;cost_count:string}>(
              "select (select count(*)::text from seyeon_positive_candidate.native_stage_lineage_r30 where attempt_id=$1::uuid) as stage_count,"+
              " (select count(*)::text from public.seyeon_ai_call_cost_events where attempt_id=$1::uuid) as cost_count",
              [a.attempt],
            );
            expect(reservedBefore.rows).toMatchObject([{
              stage_count:'2',cost_count:'2',
            }]);
            for(const mutatedInput of variants){
              const mutatedWire=JSON.stringify({
                ...native,input:[{
                  role:'user',content:[{
                    type:'input_text',text:JSON.stringify(mutatedInput),
                  }],
                }],
              });
              await expect(tx(c=>c.query(
                'select seyeon_positive_candidate.claim_governed_stage_r32($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::text,$8::text,$9::text,$10::text,$11::text,$12::text,$13::bigint) as receipt',
                [subject,a.thread,a.turn,a.attempt,purpose,call.callId,
                 source.selection.selectedSourcesDigest,
                 hash(source.finalModelContext),hash(request),
                 mutatedWire,policy.policyVersion,
                 policy.priceQuote.priceVersion,500],
              ),true)).rejects.toMatchObject({
                code:'23514',
                constraint:'seyeon_r35_unpinned_derived_interpreter_context',
              });
            }
            // R36 independent DB-authored source: a forged (but otherwise
            // structurally correct) Character/Schema/instruction cannot
            // borrow original Memory/Grant authority to charge the model.
            const rawNative=native as unknown as Record<string,unknown>;
            const rawText=rawNative.text as {
              format:{
                type:string;name:string;strict:boolean;
                schema:Record<string,unknown>;
              };
            };
            const staticVariants:readonly Record<string,unknown>[]=[
              {...rawNative,instructions:String(rawNative.instructions)+' HIDDEN_UNAPPROVED_INSTRUCTION'},
              {...rawNative,text:{format:{
                ...rawText.format,
                schema:{...rawText.format.schema,
                  properties:{unauthorizedPrivateOutput:{type:'string'}},
                },
              }}},
              {...rawNative,input:[{
                role:'user',content:[{
                  type:'input_text',text:JSON.stringify({
                    ...originalInput,context:{...baseline,
                      character:{
                        ...(baseline.character as Record<string,unknown>),
                        sourceBibleBlobSha:'forged-character-git-blob',
                      },
                    },
                  }),
                }],
              }]},
              {...rawNative,input:[{
                role:'user',content:[{
                  type:'input_text',text:JSON.stringify({
                    ...originalInput,context:{...baseline,
                      bibleSlices:[...(baseline.bibleSlices as unknown[]),
                        {id:'forged-private-slice',sourceSections:[],
                         runtimePurpose:'unauthorized',invariants:[]}],
                    },
                  }),
                }],
              }]},
              {...rawNative,input:[{
                role:'user',content:[{
                  type:'input_text',text:JSON.stringify({
                    ...originalInput,context:{...baseline,
                      authorityBoundaries:{
                        ...(baseline.authorityBoundaries as Record<string,unknown>),
                        assistantOutputNeverAuthority:false,
                      },
                    },
                  }),
                }],
              }]},
              {...rawNative,input:[{
                role:'user',content:[{
                  type:'input_text',text:JSON.stringify({
                    ...originalInput,context:{...baseline,
                      actionPolicy:{
                        ...(baseline.actionPolicy as Record<string,unknown>),
                        unauthorizedPrivateAction:'allowed',
                      },
                    },
                  }),
                }],
              }]},
              {...rawNative,input:[{
                role:'user',content:[{
                  type:'input_text',text:JSON.stringify({
                    ...originalInput,
                    allowedInterpretationVocabulary:{
                      ...(originalInput.allowedInterpretationVocabulary as Record<string,unknown>),
                      unauthorizedPrivateLevel:['secret'],
                    },
                  }),
                }],
              }]},
              {...rawNative,input:[{
                role:'user',content:[{
                  type:'input_text',text:JSON.stringify({
                    ...originalInput,context:{...baseline,
                      schemaVersion:'unapproved-runtime-version',
                    },
                  }),
                }],
              }]},
            ];
            for(const forged of staticVariants){
              await expect(tx(c=>c.query(
                'select seyeon_positive_candidate.claim_governed_stage_r32($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::text,$8::text,$9::text,$10::text,$11::text,$12::text,$13::bigint) as receipt',
                [subject,a.thread,a.turn,a.attempt,purpose,call.callId,
                 source.selection.selectedSourcesDigest,
                 hash(source.finalModelContext),hash(request),
                 JSON.stringify(forged),policy.policyVersion,
                 policy.priceQuote.priceVersion,500],
              ),true)).rejects.toMatchObject({
                code:'23514',
                constraint:'seyeon_r36_static_authority_manifest_mismatch',
              });
            }
            const reservedAfter=await pool!.query<{stage_count:string;cost_count:string}>(
              "select (select count(*)::text from seyeon_positive_candidate.native_stage_lineage_r30 where attempt_id=$1::uuid) as stage_count,"+
              " (select count(*)::text from public.seyeon_ai_call_cost_events where attempt_id=$1::uuid) as cost_count",
              [a.attempt],
            );
            expect(reservedAfter.rows).toEqual(reservedBefore.rows);
          }
          const reserved=await reserveSeyeonR32OfflineFiveStageV1({
            pinInput,request,call,requestBody,governor,
          });
          used.push(reserved);
          // This can only record the fact that NO real Provider output was
          // observed; the R37 owner must refuse fake verified outcomes.
          if(reserved.stageIndex===0){
            const legit=buildSeyeonR37SyntheticStageObservationV1(reserved);
            const fakes=[
              {...legit,providerDispatched:true},
              {...legit,outputGuardVerified:true},
              {...legit,result:{kind:'provider_output',verified:true}},
              {...legit,callId:'d9990000-0000-4000-8000-000000000999'},
              {...legit,nativeWireDigest:'sha256:wire-utf8:v1:'+'a'.repeat(64)},
            ];
            for(const fake of fakes){
              await expect(tx(c=>c.query(
                'select seyeon_positive_candidate.record_synthetic_stage_result_r37($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::jsonb) as receipt',
                [subject,a.thread,a.turn,a.attempt,
                 reserved.purpose,reserved.callId,JSON.stringify(fake)],
              ),true)).rejects.toMatchObject({
                code:'23514',constraint:'seyeon_r37_synthetic_result_authority_forged',
              });
            }
            // Stage 1 cannot reserve an additional budget before Stage 0
            // has a local observation, even with a valid real native wire.
            const early=await r33NativeWire(
              'disclosure_classification',
              source.selection.selectedSourcesDigest,reserved.nativeWireDigest,
            );
            await expect(tx(c=>c.query(
              'select seyeon_positive_candidate.claim_governed_stage_r32($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::text,$8::text,$9::text,$10::text,$11::text,$12::text,$13::bigint) as receipt',
              [subject,a.thread,a.turn,a.attempt,'disclosure_classification',
               early.callId,source.selection.selectedSourcesDigest,
               hash(source.finalModelContext),early.requestDigest,early.body,
               policy.policyVersion,policy.priceQuote.priceVersion,500],
            ),true)).rejects.toMatchObject({
              code:'23514',constraint:'seyeon_r37_previous_local_stage_outcome_missing',
            });
            const denied=await pool!.query<{stage_count:string;cost_count:string}>(
              "select (select count(*)::text from seyeon_positive_candidate.native_stage_lineage_r30 where attempt_id=$1::uuid) as stage_count,"+
              " (select count(*)::text from public.seyeon_ai_call_cost_events where attempt_id=$1::uuid) as cost_count",
              [a.attempt],
            );
            expect(denied.rows).toMatchObject([{stage_count:'1',cost_count:'1'}]);
          }
          observed.push(await recordSeyeonR37SyntheticStageObservationV1({
            pinInput,reservation:reserved,
          }));
          if(reserved.stageIndex===0){
            await expect(recordSeyeonR37SyntheticStageObservationV1({
              pinInput,reservation:reserved,
            })).rejects.toBeInstanceOf(SeyeonR37OfflineSyntheticResultHoldV1);
          }
          const localGuardCases=probes.filter(
            probe=>probe.stagePurpose===reserved.purpose,
          );
          for(const probe of localGuardCases){
            if(probe.caseKey==='interpretation_unknown_reference'){
              // A restricted Executor cannot label a successful review as
              // one of the four negative guard cases or bind another Stage.
              await expect(tx(c=>c.query(
                'select seyeon_positive_candidate.record_guard_negative_probe_r38($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::integer,$7::text,$8::uuid,$9::text,$10::text,$11::text) as receipt',
                [subject,a.thread,a.turn,a.attempt,'semantic_review_passed',
                 reserved.stageIndex,reserved.purpose,reserved.callId,
                 reserved.nativeWireDigest,probe.actualGuardName,
                 probe.candidateDigest],
              ),true)).rejects.toMatchObject({
                code:'23514',
                constraint:'seyeon_r38_negative_probe_scope_forged',
              });
            }
            const result=await recordSeyeonR38OfflineNegativeGuardProbeV1({
              pinInput,reservation:reserved,probe,
            });
            expect(result).toMatchObject({
              caseKey:probe.caseKey,
              verdict:'rejected',providerDispatched:false,
              outputGuardVerified:false,
              permitsAtomicCommit:false,permitsHttpReveal:false,
            });
            rejectedCases.push(result.caseKey);
            if(probe.caseKey==='interpretation_unknown_reference'){
              await expect(recordSeyeonR38OfflineNegativeGuardProbeV1({
                pinInput,reservation:reserved,probe,
              })).rejects.toBeInstanceOf(
                SeyeonR38OfflineNegativeEvidenceHoldV1,
              );
            }
          }
          throw new SeyeonR32OfflineFiveStageHoldV1();
        },
      });
      await expect(client.generate(request)).rejects.toMatchObject({
        code:'PRE_DISPATCH_REJECTED',
      });
      expect(fetches).toBe(0);
    }
    expect(used.map(r=>r.stageIndex)).toEqual([0,1,2,3,4]);
    expect(observed.map(r=>r.stageIndex)).toEqual([0,1,2,3,4]);
    expect(rejectedCases).toEqual([
      'interpretation_unknown_reference',
      'renderer_unapproved_private_source',
      'semantic_review_hash_mismatch',
      'semantic_review_rejected',
    ]);
    expect(observed.every(r=>r.providerDispatched===false
      &&r.providerOutputVerified===false
      &&r.outputGuardVerified===false
      &&r.permitsAtomicCommit===false
      &&r.permitsHttpReveal===false)).toBe(true);
    expect(used.every(r=>r.reservedMicroUsd==='1524')).toBe(true);
    expect(used.map(r=>r.interpreterContextSealed)).toEqual([
      false,false,true,false,false,
    ]);
    const results=await pool.query<{
      stage_index:number;call_id:string;origin_kind:string;
      provider_dispatched:boolean;provider_output_verified:boolean;
      output_guard_verified:boolean;synthetic_payload_digest:string;
    }>(
      'select stage_index,call_id::text,origin_kind,provider_dispatched,provider_output_verified,output_guard_verified,synthetic_payload_digest from seyeon_positive_candidate.synthetic_stage_results_r37 where attempt_id=$1::uuid order by stage_index',
      [a.attempt],
    );
    expect(results.rows).toHaveLength(5);
    expect(results.rows.map(r=>r.call_id)).toEqual(used.map(r=>r.callId));
    expect(results.rows.every(r=>r.origin_kind==='local_synthetic_no_provider'
      &&r.provider_dispatched===false&&r.provider_output_verified===false
      &&r.output_guard_verified===false
      &&/^sha256:pg-jsonb:v1:[0-9a-f]{64}$/u.test(
        r.synthetic_payload_digest,
      ))).toBe(true);
    await expect(pool.query(
      "update seyeon_positive_candidate.synthetic_stage_results_r37 set provider_output_verified=true where attempt_id=$1::uuid and stage_index=0",
      [a.attempt],
    )).rejects.toMatchObject({
      code:'23514',constraint:'offline_source_set_immutable',
    });
    await expect(tx(c=>c.query(
      'select * from seyeon_positive_candidate.synthetic_stage_results_r37 where attempt_id=$1::uuid',
      [a.attempt],
    ),true)).rejects.toMatchObject({code:'42501'});
    await expect(tx(c=>c.query(
      'delete from seyeon_positive_candidate.synthetic_stage_results_r37 where attempt_id=$1::uuid',
      [a.attempt],
    ),true)).rejects.toMatchObject({code:'42501'});
    const guardRows=await pool.query<{
      case_key:string;verdict:string;origin_kind:string;
      provider_dispatched:boolean;output_guard_verified:boolean;
    }>(
      'select case_key,verdict,origin_kind,provider_dispatched,output_guard_verified from seyeon_positive_candidate.guard_negative_probes_r38 where attempt_id=$1::uuid order by case_key',
      [a.attempt],
    );
    expect(guardRows.rows).toHaveLength(4);
    expect(guardRows.rows.every(r=>r.verdict==='rejected'
      &&r.origin_kind==='local_invalid_fixture_not_provider_output'
      &&r.provider_dispatched===false
      &&r.output_guard_verified===false)).toBe(true);
    await expect(pool.query(
      "update seyeon_positive_candidate.guard_negative_probes_r38 set verdict='passed' where attempt_id=$1::uuid",
      [a.attempt],
    )).rejects.toMatchObject({
      code:'23514',constraint:'offline_source_set_immutable',
    });
    await expect(tx(c=>c.query(
      'select * from seyeon_positive_candidate.guard_negative_probes_r38 where attempt_id=$1::uuid',
      [a.attempt],
    ),true)).rejects.toMatchObject({code:'42501'});
    const ledger=await pool.query<{
      purpose:string;call_id:string;governor_ceiling_micro_usd:string;
      lifecycle_state:string;
    }>(
      'select purpose,call_id::text,governor_ceiling_micro_usd::text,lifecycle_state from public.seyeon_ai_call_cost_events where attempt_id=$1::uuid order by purpose',
      [a.attempt],
    );
    expect(ledger.rows).toHaveLength(5);
    expect(ledger.rows.every(row=>row.lifecycle_state==='started'
      &&row.governor_ceiling_micro_usd==='1524')).toBe(true);
    const stageRows=await pool.query<{call_id:string;purpose:string}>(
      'select call_id::text,purpose from seyeon_positive_candidate.native_stage_lineage_r30 where attempt_id=$1::uuid order by stage_index',
      [a.attempt],
    );
    expect(stageRows.rows.map(row=>row.call_id)).toEqual(used.map(x=>x.callId));
    const interpreterSeal=await pool.query<{native_wire_digest:string}>(
      'select native_wire_digest from seyeon_positive_candidate.governed_wire_reservations_r28 where attempt_id=$1::uuid',
      [a.attempt],
    );
    expect(interpreterSeal.rows).toMatchObject([{
      native_wire_digest:used[2]!.nativeWireDigest,
    }]);
    // Stage 0,1,2,3,4 were NOT sent: unknown costs reserve full ceilings.
    // G2 cannot commit from original pin or reservation alone.
    const suffix=a.turn.slice(-12);
    await tx(async client=>{
      const generated=await client.query<{ok:boolean}>(
        'select public.cmd_persist_seyeon_chat_generated_runtime_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::text,$8::text,$9::text,$10::jsonb,$11::text,$12::text,$13::jsonb) as ok',
        [subject,a.turn,a.attempt,a.participant,
         'd8100000-0000-4000-8000-'+suffix,'offline','offline-model',
         'offline-r32-render','synthetic five-stage reply',
         JSON.stringify({text:'synthetic five-stage reply'}),
         'chat-character-message-v1','sha256:v1:'+'b'.repeat(64),'[]'],
      );
      expect(generated.rows[0]?.ok).toBe(false);
      const originalsFromDb=await client.query<{
        recordId:string;originalGrantId:string;pgPayloadDigest:string;
      }>(
        'select memory_id::text as "recordId",original_grant_id::text as "originalGrantId",pg_payload_digest as "pgPayloadDigest" from seyeon_positive_candidate.source_edges_r1 where attempt_id=$1::uuid order by ordinal',
        [a.attempt],
      );
      expect(originalsFromDb.rows).toHaveLength(2);
      const proof={
        schemaVersion:'offline-positive-two-original-source-proof-r25',
        selectedSourcesDigest:source.selection.selectedSourcesDigest,
        sources:originalsFromDb.rows,
      };
      const validated=await client.query<{ok:boolean}>(
        'select public.cmd_persist_seyeon_chat_validated_runtime_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,$7::text,$8::text,$9::jsonb,$10::jsonb) as ok',
        [subject,a.turn,a.attempt,
         'd8200000-0000-4000-8000-'+suffix,'offline','offline-model',
         'offline-r32-output','sha256:v1:'+'b'.repeat(64),
         JSON.stringify({passed:true,personalRecordProvenance:proof}),'[]'],
      );
      expect(validated.rows[0]?.ok).toBe(false);
    },true);
    const tryCommit=()=>tx(client=>client.query(
      'select seyeon_positive_candidate.commit_actual_v2_r3($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::jsonb,$9::text,$10::text)',
      [subject,a.thread,a.turn,a.attempt,
       'd8300000-0000-4000-8000-'+suffix,
       'd8400000-0000-4000-8000-'+suffix,
       'd8500000-0000-4000-8000-'+suffix,
       JSON.stringify({
         schemaVersion:'seyeon-post-turn-analysis-snapshot-v1',
         turnId:a.turn,
         assistantMessageId:'d8300000-0000-4000-8000-'+suffix,
         userMessageId:a.user,
       }),
       'sha256:v1:r32-synthetic-never-dispatched',
       source.selection.selectedSourcesDigest],
    ),true);
    await expect(tryCommit()).rejects.toMatchObject({
      constraint:'seyeon_offline_r28_governed_cost_unsettled',
    });
    // R40: a fake output digest MUST NOT bypass unsettled Governor Cost.
    // The exact same originally pinned Call, native request and two Grants
    // are deliberately tested before synthetic queue settlement.
    const stub0=r40SyntheticStubTransport(used[0]!);
    await expect(tx(c=>c.query(
      'select seyeon_positive_candidate.record_unverified_transport_r40($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::integer,$6::uuid,$7::text,$8::jsonb) as receipt',
      [subject,a.thread,a.turn,a.attempt,0,used[0]!.callId,
       used[0]!.nativeWireDigest,JSON.stringify(stub0)],
    ),true)).rejects.toMatchObject({
      code:'23514',constraint:'seyeon_r40_governed_cost_not_settled',
    });
    const beforeStub=await pool.query<{n:string}>(
      'select count(*)::text as n from seyeon_positive_candidate.unverified_transport_lineage_r40 where attempt_id=$1::uuid',
      [a.attempt],
    );
    expect(beforeStub.rows).toEqual([{n:'0'}]);
    // Explicit SYNTHETIC Provider receipts only, with no actual network.
    // Verify the existing worker claim, settlement and ACK for all five.
    for(const v of used){
      const event=createSeyeonAiCostEventV1({
        callId:v.callId,purpose:v.purpose,providerKey:'openai-responses',
        modelKey:'seyeon-r35-offline',outcome:'response_received',
        httpStatus:200,elapsedMs:7,
        usage:{
          inputTokens:100,outputTokens:50,
          cachedInputTokens:0,reasoningTokens:0,
        },
        price:policy.priceQuote,
      });
      expect(event.estimatedCostMicroUsd).toBe(300);
      await tx(async client=>{
        await client.query("select set_config('myeongha.subject_id',$1,true)",[subject]);
        const stored=await client.query<{call_id:string;replayed:boolean}>(
          'select * from public.cmd_store_seyeon_provider_receipt_v1($1::uuid,$2::uuid,$3::uuid,$4::text,$5::jsonb)',
          [subject,a.turn,a.attempt,'chat',JSON.stringify(event)],
        );
        expect(stored.rows).toMatchObject([{call_id:v.callId,replayed:false}]);
      });
      const claim=await tx(client=>client.query<{
        call_id:string;claim_token:string;
      }>(
        'select call_id::text,claim_token::text from public.cmd_claim_seyeon_provider_receipt_v1()',
      ));
      expect(claim.rows[0]?.call_id).toBe(v.callId);
      const token=claim.rows[0]?.claim_token;
      if(!token)throw Error('R32 receipt worker lease missing');
      await tx(async client=>{
        await client.query("select set_config('myeongha.subject_id',$1,true)",[subject]);
        const settled=await client.query<{
          call_id:string;occupied_micro_usd:string;over_ceiling:boolean;
        }>(
          'select call_id::text,occupied_micro_usd::text,over_ceiling from public.cmd_governed_settle_seyeon_ai_call_v1($1::uuid,$2::uuid,$3::uuid,$4::text,$5::jsonb)',
          [subject,a.turn,a.attempt,'chat',JSON.stringify(event)],
        );
        expect(settled.rows).toMatchObject([{
          call_id:v.callId,occupied_micro_usd:'300',over_ceiling:false,
        }]);
      });
      const ack=await tx(client=>client.query<{acknowledged:boolean}>(
        'select public.cmd_ack_seyeon_provider_receipt_v1($1::uuid,$2::uuid) as acknowledged',
        [v.callId,token],
      ));
      expect(ack.rows).toMatchObject([{acknowledged:true}]);
    }
    const allSettled=await pool.query<{count:string}>(
      "select count(*)::text as count from public.seyeon_ai_call_cost_events where attempt_id=$1::uuid and lifecycle_state='settled' and cost_status='estimated'",
      [a.attempt],
    );
    expect(allSettled.rows[0]?.count).toBe('5');
    await expect(tryCommit()).rejects.toMatchObject({
      constraint:'seyeon_offline_r40_unverified_transport_lineage_missing',
    });
    // R40: these receipts are SHA-only local mock transports, not actual
    // provider responses. Even a fully settled Cost + valid native wire is
    // insufficient to prove any Model/Output Guard authorization.
    const mockRecorded=[];
    const guardedFixture=buildSeyeonR41LocalGuardFixtureV1(
      source.finalModelContext,
    );
    const authoredOutputTexts=[
      '{"ok":true}','{"ok":true}',
      guardedFixture.interpretationText,
      guardedFixture.rendererText,
      guardedFixture.semanticReviewText,
    ];
    for(const v of used){
      const transport=r40SyntheticStubTransport(
        v,authoredOutputTexts[v.stageIndex]!,
      );
      if(v.stageIndex===0){
        const forged={...transport,providerOutputVerified:true};
        await expect(tx(c=>c.query(
          'select seyeon_positive_candidate.record_unverified_transport_r40($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::integer,$6::uuid,$7::text,$8::jsonb) as receipt',
          [subject,a.thread,a.turn,a.attempt,v.stageIndex,v.callId,
           v.nativeWireDigest,JSON.stringify(forged)],
        ),true)).rejects.toMatchObject({
          code:'23514',constraint:'seyeon_r40_transport_authority_forged',
        });
        await expect(tx(c=>c.query(
          'select seyeon_positive_candidate.record_unverified_transport_r40($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::integer,$6::uuid,$7::text,$8::jsonb) as receipt',
          [subject,a.thread,a.turn,a.attempt,v.stageIndex,v.callId,
           'sha256:wire-utf8:v1:'+'0'.repeat(64),
           JSON.stringify(transport)],
        ),true)).rejects.toMatchObject({
          code:'23514',constraint:'seyeon_r40_stage_wire_unbound',
        });
        await expect(recordSeyeonR40UnverifiedMockTransportV1({
          pinInput,reservation:v,
          transport:{...transport,responseId:'resp_real_unverified_source'},
        })).rejects.toBeInstanceOf(
          SeyeonR40OfflineUnverifiedTransportHoldV1,
        );
      }
      const recorded=await recordSeyeonR40UnverifiedMockTransportV1({
        pinInput,reservation:v,transport,
      });
      expect(recorded).toMatchObject({
        attemptId:a.attempt,callId:v.callId,
        stageIndex:v.stageIndex,purpose:v.purpose,
        nativeWireDigest:v.nativeWireDigest,
        responseId:transport.responseId,
        responseBodyDigest:transport.responseBodyDigest,
        structuredOutputDigest:transport.structuredOutputDigest,
        providerOutputVerified:false,outputGuardVerified:false,
        permitsAtomicCommit:false,permitsHttpReveal:false,
      });
      mockRecorded.push(recorded);
      if(v.stageIndex===0){
        await expect(recordSeyeonR40UnverifiedMockTransportV1({
          pinInput,reservation:v,transport,
        })).rejects.toBeInstanceOf(
          SeyeonR40OfflineUnverifiedTransportHoldV1,
        );
      }
    }
    expect(mockRecorded).toHaveLength(5);
    const r40Rows=await pool.query<{
      stage_index:number;call_id:string;origin_kind:string;
      provider_output_verified:boolean;output_guard_verified:boolean;
      response_body_digest:string;structured_output_digest:string;
    }>(
      'select stage_index,call_id::text,origin_kind,provider_output_verified,output_guard_verified,response_body_digest,structured_output_digest from seyeon_positive_candidate.unverified_transport_lineage_r40 where attempt_id=$1::uuid order by stage_index',
      [a.attempt],
    );
    expect(r40Rows.rows).toHaveLength(5);
    expect(r40Rows.rows.map(row=>row.call_id)).toEqual(
      used.map(v=>v.callId),
    );
    expect(r40Rows.rows.every(row=>
      row.origin_kind==='local_stub_transport_unverified'
      &&row.provider_output_verified===false
      &&row.output_guard_verified===false
      &&/^sha256:wire-utf8:v1:[0-9a-f]{64}$/u.test(
        row.response_body_digest,
      )&&/^sha256:wire-utf8:v1:[0-9a-f]{64}$/u.test(
        row.structured_output_digest,
      )
    )).toBe(true);
    await expect(pool.query(
      "update seyeon_positive_candidate.unverified_transport_lineage_r40 set provider_output_verified=true where attempt_id=$1::uuid",
      [a.attempt],
    )).rejects.toMatchObject({
      code:'23514',constraint:'offline_source_set_immutable',
    });
    await expect(tx(c=>c.query(
      'select * from seyeon_positive_candidate.unverified_transport_lineage_r40 where attempt_id=$1::uuid',
      [a.attempt],
    ),true)).rejects.toMatchObject({code:'42501'});
    await expect(tx(c=>c.query(
      'delete from seyeon_positive_candidate.unverified_transport_lineage_r40 where attempt_id=$1::uuid',
      [a.attempt],
    ),true)).rejects.toMatchObject({code:'42501'});
    await expect(tryCommit()).rejects.toMatchObject({
      constraint:'seyeon_offline_r28_complete_provider_lineage_not_approved',
    });
    // One missing MOCK transport digest is independently diagnosed.
    await pool.query(
      'delete from seyeon_positive_candidate.unverified_transport_lineage_r40 where attempt_id=$1::uuid and stage_index=4',
      [a.attempt],
    );
    await expect(tryCommit()).rejects.toMatchObject({
      constraint:'seyeon_offline_r40_unverified_transport_lineage_missing',
    });
    // Negative-only real guard probes cannot replace actual Provider output.
    // A deleted probe is a missing evidence chain, not a positive PASS.
    await pool.query(
      "delete from seyeon_positive_candidate.guard_negative_probes_r38 where attempt_id=$1::uuid and case_key='semantic_review_rejected'",
      [a.attempt],
    );
    await expect(tryCommit()).rejects.toMatchObject({
      constraint:'seyeon_offline_r38_negative_guard_probe_missing',
    });
    // Deleting an observation under the scratch DB owner simulates lost
    // local evidence. API executors cannot DELETE this table; a privacy
    // cascade remains legal. G2 MUST notice the missing Stage-4 outcome.
    await pool.query(
      'delete from seyeon_positive_candidate.synthetic_stage_results_r37 where attempt_id=$1::uuid and stage_index=4',
      [a.attempt],
    );
    await expect(tryCommit()).rejects.toMatchObject({
      constraint:'seyeon_offline_r37_stage_result_lineage_incomplete',
    });
    const neverCommitted=await pool.query<{
      messages:string;outboxes:string;admissions:string;
    }>(
      "select (select count(*)::text from public.conversation_messages where turn_id=$1::uuid and sender_type='character') as messages,"+
      " (select count(*)::text from public.outbox_events where aggregate_id=$1::text and event_type in ('CHAT_TURN_COMMITTED','SEYEON_POST_TURN_ANALYSIS_REQUESTED')) as outboxes,"+
      " (select count(*)::text from seyeon_positive_candidate.actual_v2_commit_admissions_r3 where attempt_id=$2::uuid) as admissions",
      [a.turn,a.attempt],
    );
    expect(neverCommitted.rows[0]).toMatchObject({
      messages:'0',outboxes:'0',admissions:'0',
    });
    expect(fetches).toBe(0);
  },120000);

  it('R32: exhausted DB budget rolls back both the stage marker and governed cost',async()=>{
    if(!pool)throw Error('R32 disposable budget test only');
    const a=await createTurn(761);
    const originals=[
      {recordId:'d5000000-0000-4000-8000-000000000003',
       grantId:'d6000000-0000-4000-8000-000000000003'},
      {recordId:'d5000000-0000-4000-8000-000000000004',
       grantId:'d6000000-0000-4000-8000-000000000004'},
    ];
    const source=await modelSources(originals);
    const pinInput={
      pool:scopedPool,
      verifiedEvidence:{kind:'member' as const,
        verifiedAuthUserId:'d1000000-0000-4000-8000-000000000001'},
      threadId:a.thread,turnId:a.turn,attemptId:a.attempt,
      ...source,twoOriginalContextReady:true as const,
    };
    await persistSeyeonR20OfflineDigestBoundPinV1(pinInput);
    const purpose='integrity_classification' as const;
    const request:SeyeonStructuredProviderRequestV2={
      contractVersion:SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
      purpose,
      instructions:SEYEON_R32_SYNTHETIC_STAGE_INSTRUCTIONS_V1,
      input:{
        fixture:true,purpose,
        selectedSourcesDigest:source.selection.selectedSourcesDigest,
        priorNativeWireDigest:null,
      },
      responseSchema:SEYEON_R32_SYNTHETIC_STAGE_SCHEMA_V1,
    };
    const purposes=['integrity_classification','disclosure_classification',
      'turn_interpretation','dialogue_render','semantic_review'] as const;
    const governor:SeyeonAiGovernorAdmissionV1={
      policy:{
        policyVersion:'offline-r32-test-v1',
        providerKey:'openai-responses',modelKey:'seyeon-r35-offline',
        priceQuote:{
          priceVersion:'offline-r32-price-v1',
          providerKey:'openai-responses',modelKey:'seyeon-r35-offline',
          inputMicroUsdPerMillion:1000000,
          cachedInputMicroUsdPerMillion:250000,
          outputMicroUsdPerMillion:4000000,
        },
        allowedPurposes:[...purposes],contextWindowTokens:4096,
        maximumInputTokens:1000,maximumOutputTokens:256,
        maximumSerializedRequestBytes:65536,
      },
      certifiedInputTokenUpperBound:()=>500,
    };
    let fetches=0;
    const reservations:SeyeonR32OfflineStageReceiptV1[]=[];
    const sender=()=>createOpenAiSeyeonStructuredProviderV1({
      apiKey:'never-send-r32-budget',model:'seyeon-r35-offline',
      maxOutputTokens:256,
      fetchImpl:async()=>{fetches++;throw Error('NETWORK_NEVER_ALLOWED');},
      meteredBeforeDispatch:async(call,requestBody)=>{
        reservations.push(await reserveSeyeonR32OfflineFiveStageV1({
          pinInput,request,call,requestBody,governor,
        }));
        throw new SeyeonR32OfflineFiveStageHoldV1();
      },
    });
    const initial=await pool.query<{occupied:string}>(
      "select occupied_micro_usd::text as occupied from public.seyeon_ai_governor_daily_budgets_v1 where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date",
    );
    expect(initial.rows).toHaveLength(1);
    await pool.query(
      "update public.seyeon_ai_governor_daily_budgets_v1 set global_limit_micro_usd=occupied_micro_usd where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date",
    );
    try{
      await expect(sender().generate(request)).rejects.toMatchObject({
        code:'PRE_DISPATCH_REJECTED',
      });
      expect(fetches).toBe(0);
      expect(reservations).toHaveLength(0);
      const rolledBack=await pool.query<{stage_count:string;cost_count:string}>(
        "select (select count(*)::text from seyeon_positive_candidate.native_stage_lineage_r30 where attempt_id=$1::uuid) as stage_count,"+
        " (select count(*)::text from public.seyeon_ai_call_cost_events where attempt_id=$1::uuid) as cost_count",
        [a.attempt],
      );
      expect(rolledBack.rows).toMatchObject([{
        stage_count:'0',cost_count:'0',
      }]);
      const now=await pool.query<{occupied:string}>(
        "select occupied_micro_usd::text as occupied from public.seyeon_ai_governor_daily_budgets_v1 where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date",
      );
      expect(now.rows[0]?.occupied).toBe(initial.rows[0]?.occupied);
    }finally{
      await pool.query(
        "update public.seyeon_ai_governor_daily_budgets_v1 set global_limit_micro_usd=50000 where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date",
      );
    }
    await expect(sender().generate(request)).rejects.toMatchObject({
      code:'PRE_DISPATCH_REJECTED',
    });
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({
      stageIndex:0,purpose:'integrity_classification',
      reservedMicroUsd:'1524',permitsProvider:false,
    });
    expect(fetches).toBe(0);
    // Repeated stage cannot reserve twice, even with a NEW native Call ID.
    await expect(sender().generate(request)).rejects.toMatchObject({
      code:'PRE_DISPATCH_REJECTED',
    });
    const final=await pool.query<{stage_count:string;cost_count:string}>(
      "select (select count(*)::text from seyeon_positive_candidate.native_stage_lineage_r30 where attempt_id=$1::uuid) as stage_count,"+
      " (select count(*)::text from public.seyeon_ai_call_cost_events where attempt_id=$1::uuid) as cost_count",
      [a.attempt],
    );
    expect(final.rows).toMatchObject([{stage_count:'1',cost_count:'1'}]);
    expect(fetches).toBe(0);
  },30000);


  it('R33 revoke-first: independent DB Subject lock blocks Cost Start, then denies original and reserves zero',async()=>{
    if(!pool)throw Error('R33 scratch CI PG only');
    const {id,source,originals}=await r33Prepare(762,5);
    const {callId,body,requestDigest}=await r33NativeWire(
      'integrity_classification',source.selection.selectedSourcesDigest,null,
    );
    const args=[
      subject,id.thread,id.turn,id.attempt,callId,
      source.selection.selectedSourcesDigest,hash(source.finalModelContext),
      requestDigest,body,
    ];
    const start=await pool.query<{occupied:string}>(
      "select occupied_micro_usd::text as occupied from public.seyeon_ai_governor_daily_budgets_v1 where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date",
    );
    expect(start.rows).toHaveLength(1);
    const revoker=await pool.connect();
    const claimant=await pool.connect();
    try{
      await revoker.query('BEGIN');
      await revoker.query('select id from public.subjects where id=$1::uuid for update',[subject]);
      await revoker.query(
        'update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',
        [originals[1]!.grantId],
      );
      await claimant.query("SET application_name='seyeon_r33_revoke_first_cost_waiter'");
      await claimant.query('BEGIN');
      await claimant.query('SET LOCAL ROLE myeongha_api_executor');
      await claimant.query("select set_config('myeongha.subject_id',$1,true)",[subject]);
      const admission=claimant.query(R33_STAGE_START_SQL,args).then(
        result=>({kind:'success' as const,result}),
        error=>({kind:'error' as const,error}),
      );
      await r33WaitForDbLock('seyeon_r33_revoke_first_cost_waiter');
      await revoker.query('COMMIT');
      const outcome=await admission;
      expect(outcome.kind).toBe('error');
      if(outcome.kind==='error')
        expect(outcome.error).toMatchObject({
          code:'23514',constraint:'seyeon_r30_original_grant_revoked',
        });
      await claimant.query('ROLLBACK');
    }finally{
      await revoker.query('ROLLBACK').catch(()=>undefined);
      await claimant.query('ROLLBACK').catch(()=>undefined);
      await claimant.query("RESET application_name").catch(()=>undefined);
      revoker.release();claimant.release();
    }
    const rows=await pool.query<{stages:string;calls:string;budget:string}>(
      "select (select count(*)::text from seyeon_positive_candidate.native_stage_lineage_r30 where attempt_id=$1::uuid) as stages,"+
      " (select count(*)::text from public.seyeon_ai_call_cost_events where attempt_id=$1::uuid) as calls,"+
      " (select occupied_micro_usd::text from public.seyeon_ai_governor_daily_budgets_v1 where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date) as budget",
      [id.attempt],
    );
    expect(rows.rows[0]).toMatchObject({
      stages:'0',calls:'0',budget:start.rows[0]!.occupied,
    });
    expect(await state(id)).toMatchObject({
      turnState:'context_ready',parents:'1',edges:'2',firstPins:'1',
    });
  },30000);

  it('R33 reserve-first: revoke waits for actual budget+stage COMMIT; later stage cannot use stale Grant',async()=>{
    if(!pool)throw Error('R33 scratch CI PG only');
    const {id,source,originals}=await r33Prepare(763,7);
    const {callId,body,requestDigest}=await r33NativeWire(
      'integrity_classification',source.selection.selectedSourcesDigest,null,
    );
    const start=await pool.query<{occupied:string}>(
      "select occupied_micro_usd::text as occupied from public.seyeon_ai_governor_daily_budgets_v1 where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date",
    );
    expect(start.rows).toHaveLength(1);
    const claimant=await pool.connect();
    const revoker=await pool.connect();
    try{
      await claimant.query('BEGIN');
      await claimant.query('SET LOCAL ROLE myeongha_api_executor');
      await claimant.query("select set_config('myeongha.subject_id',$1,true)",[subject]);
      const admitted=await claimant.query<{receipt:{
        callId:string;stageIndex:number;reservedMicroUsd:string;
        permitsProvider:boolean;
      }}>(R33_STAGE_START_SQL,[
        subject,id.thread,id.turn,id.attempt,callId,
        source.selection.selectedSourcesDigest,hash(source.finalModelContext),
        requestDigest,body,
      ]);
      expect(admitted.rows[0]?.receipt).toMatchObject({
        callId,stageIndex:0,reservedMicroUsd:'1524',permitsProvider:false,
      });
      await revoker.query("SET application_name='seyeon_r33_reserve_first_revoke_waiter'");
      await revoker.query('BEGIN');
      const revocation=(async()=>{
        await revoker.query('select id from public.subjects where id=$1::uuid for update',[subject]);
        await revoker.query(
          'update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',
          [originals[1]!.grantId],
        );
        await revoker.query('COMMIT');
      })();
      await r33WaitForDbLock('seyeon_r33_reserve_first_revoke_waiter');
      await claimant.query('COMMIT');
      await revocation;
    }finally{
      await claimant.query('ROLLBACK').catch(()=>undefined);
      await revoker.query('ROLLBACK').catch(()=>undefined);
      await revoker.query("RESET application_name").catch(()=>undefined);
      claimant.release();revoker.release();
    }
    const rows=await pool.query<{stages:string;calls:string;budget:string}>(
      "select (select count(*)::text from seyeon_positive_candidate.native_stage_lineage_r30 where attempt_id=$1::uuid) as stages,"+
      " (select count(*)::text from public.seyeon_ai_call_cost_events where attempt_id=$1::uuid) as calls,"+
      " (select occupied_micro_usd::text from public.seyeon_ai_governor_daily_budgets_v1 where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date) as budget",
      [id.attempt],
    );
    expect(rows.rows[0]).toMatchObject({
      stages:'1',calls:'1',
      budget:String(BigInt(start.rows[0]!.occupied)+1524n),
    });
    // A reservation was valid BEFORE revocation, but that cannot permit
    // even a synthetic local outcome AFTER the exact Grant was revoked.
    const synthetic={
      schemaVersion:'seyeon-r37-synthetic-stage-result-v1',
      attemptId:id.attempt,stageIndex:0,
      purpose:'integrity_classification',callId,
      nativeWireDigest:'sha256:wire-utf8:v1:'+
        createHash('sha256').update(body,'utf8').digest('hex'),
      providerDispatched:false,outputGuardVerified:false,
      result:{kind:'no_provider_output',verified:false},
    };
    await expect(tx(c=>c.query(
      'select seyeon_positive_candidate.record_synthetic_stage_result_r37($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::jsonb) as receipt',
      [subject,id.thread,id.turn,id.attempt,
       'integrity_classification',callId,JSON.stringify(synthetic)],
    ),true)).rejects.toMatchObject({
      code:'23514',constraint:'seyeon_r37_original_grant_revoked',
    });
    const noOutput=await pool.query<{n:string}>(
      'select count(*)::text as n from seyeon_positive_candidate.synthetic_stage_results_r37 where attempt_id=$1::uuid',
      [id.attempt],
    );
    expect(noOutput.rows).toEqual([{n:'0'}]);
    // R40 must also refuse a delayed output fingerprint after exact Grant
    // revocation, before any cost/response identity can be promoted.
    const revokedTransport={
      schemaVersion:'seyeon-unverified-transport-output-receipt-r39',
      originKind:'unverified_transport_bytes_only',
      callId,purpose:'integrity_classification',
      providerKey:'openai-responses',modelKey:'seyeon-r35-offline',
      responseId:'resp_r40_synthetic_revoked_000',
      responseBodyDigest:'sha256:wire-utf8:v1:'+'1'.repeat(64),
      structuredOutputDigest:'sha256:wire-utf8:v1:'+'2'.repeat(64),
      providerOutputVerified:false,outputGuardVerified:false,
      permitsAtomicCommit:false,permitsHttpReveal:false,
    };
    await expect(tx(c=>c.query(
      'select seyeon_positive_candidate.record_unverified_transport_r40($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::integer,$6::uuid,$7::text,$8::jsonb) as receipt',
      [subject,id.thread,id.turn,id.attempt,0,callId,
       'sha256:wire-utf8:v1:'+
        createHash('sha256').update(body,'utf8').digest('hex'),
       JSON.stringify(revokedTransport)],
    ),true)).rejects.toMatchObject({
      code:'23514',constraint:'seyeon_r40_original_grant_revoked',
    });
    const r40NeverRecorded=await pool.query<{n:string}>(
      'select count(*)::text as n from seyeon_positive_candidate.unverified_transport_lineage_r40 where attempt_id=$1::uuid',
      [id.attempt],
    );
    expect(r40NeverRecorded.rows).toEqual([{n:'0'}]);
    const next=await r33NativeWire('disclosure_classification',
      source.selection.selectedSourcesDigest,
      'sha256:wire-utf8:v1:'+createHash('sha256').update(body,'utf8').digest('hex'),
    );
    // Same Owner, independently new Call ID. NO new paid reservation after
    // the second ORIGINAL Grant was revoked, even though stage 0 once passed.
    await expect(tx(c=>c.query(
      'select seyeon_positive_candidate.claim_governed_stage_r32($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::text,$8::text,$9::text,$10::text,$11::text,$12::text,$13::bigint) as receipt',
      [subject,id.thread,id.turn,id.attempt,'disclosure_classification',
       next.callId,source.selection.selectedSourcesDigest,
       hash(source.finalModelContext),next.requestDigest,next.body,
       'offline-r32-test-v1','offline-r32-price-v1',500],
    ),true)).rejects.toMatchObject({
      code:'23514',constraint:'seyeon_r30_original_grant_revoked',
    });
    // An unrelated newly issued Grant to the SAME Memory does not revive
    // the exact revoked original Grant already pinned by this Attempt.
    const replacementGrant='d6000000-0000-4000-8000-000000000009';
    await pool.query(
      "insert into public.record_access_grants(id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at) values($1,$2,null,$3,'seyeon','user_choice',clock_timestamp(),null)",
      [replacementGrant,subject,originals[1]!.recordId],
    );
    await expect(tx(c=>c.query(
      'select seyeon_positive_candidate.claim_governed_stage_r32($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::text,$8::text,$9::text,$10::text,$11::text,$12::text,$13::bigint) as receipt',
      [subject,id.thread,id.turn,id.attempt,'disclosure_classification',
       next.callId,source.selection.selectedSourcesDigest,
       hash(source.finalModelContext),next.requestDigest,next.body,
       'offline-r32-test-v1','offline-r32-price-v1',500],
    ),true)).rejects.toMatchObject({
      code:'23514',constraint:'seyeon_r30_original_grant_revoked',
    });
    const final=await pool.query<{stages:string;calls:string;budget:string}>(
      "select (select count(*)::text from seyeon_positive_candidate.native_stage_lineage_r30 where attempt_id=$1::uuid) as stages,"+
      " (select count(*)::text from public.seyeon_ai_call_cost_events where attempt_id=$1::uuid) as calls,"+
      " (select occupied_micro_usd::text from public.seyeon_ai_governor_daily_budgets_v1 where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date) as budget",
      [id.attempt],
    );
    expect(final.rows[0]).toEqual(rows.rows[0]);
  },30000);


  it('R34: direct DB governed stage rejects injected instructions, schema, nested private payload and wrong predecessor',async()=>{
    if(!pool)throw Error('R34 disposable DB only');
    // Use fresh original IDs; old Grant replacements never authorize this Attempt.
    const {id,source}=await r33Prepare(764,920);
    const native=await r33NativeWire(
      'integrity_classification',source.selection.selectedSourcesDigest,null,
    );
    const original=JSON.parse(native.body) as {
      instructions:string;
      input:{role:string;content:{type:string;text:string}[]}[];
      text:{format:{
        type:string;name:string;strict:boolean;schema:Record<string,unknown>;
      }};
    };
    const expectedSelection=source.selection.selectedSourcesDigest;
    const mutated=[
      JSON.stringify({...original,
        instructions:original.instructions+' UNAPPROVED_PRIVATE_SOURCE_INSTRUCTIONS'}),
      JSON.stringify({...original,text:{format:{
        ...original.text.format,
        schema:{...original.text.format.schema,
          properties:{ok:{type:'boolean'},privateOutput:{type:'string'}},
          required:['ok','privateOutput'],
        },
      }}}),
      JSON.stringify({...original,input:[{
        role:'user',content:[{
          type:'input_text',
          text:JSON.stringify({
            fixture:true,purpose:'integrity_classification',
            selectedSourcesDigest:expectedSelection,
            priorNativeWireDigest:null,
            unapprovedDerivedPrivateText:'DO_NOT_ADMIT',
          }),
        }],
      }]}),
      JSON.stringify({...original,input:[{
        role:'user',content:[{
          type:'input_text',
          text:JSON.stringify({
            fixture:false,purpose:'integrity_classification',
            selectedSourcesDigest:expectedSelection,
            priorNativeWireDigest:null, // false cannot masquerade as a synthetic fixture
          }),
        }],
      }]}),
    ];
    const dbStart=(purpose:string,callId:string,wire:string,nativeDigest:string)=>
      tx(c=>c.query(
        'select seyeon_positive_candidate.claim_governed_stage_r32($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::text,$8::text,$9::text,$10::text,$11::text,$12::text,$13::bigint) as receipt',
        [subject,id.thread,id.turn,id.attempt,purpose,callId,
         expectedSelection,hash(source.finalModelContext),
         nativeDigest,wire,'offline-r32-test-v1','offline-r32-price-v1',500],
      ),true);
    const budgetBefore=await pool.query<{occupied:string}>(
      "select occupied_micro_usd::text as occupied from public.seyeon_ai_governor_daily_budgets_v1 where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date",
    );
    expect(budgetBefore.rows).toHaveLength(1);
    for(const wire of mutated){
      await expect(dbStart('integrity_classification',
        native.callId,wire,native.requestDigest)).rejects.toMatchObject({
        code:'23514',constraint:'seyeon_r34_synthetic_stage_contract_mismatch',
      });
    }
    const untouched=await pool.query<{stages:string;costs:string;budget:string}>(
      "select (select count(*)::text from seyeon_positive_candidate.native_stage_lineage_r30 where attempt_id=$1::uuid) as stages,"+
      " (select count(*)::text from public.seyeon_ai_call_cost_events where attempt_id=$1::uuid) as costs,"+
      " (select occupied_micro_usd::text from public.seyeon_ai_governor_daily_budgets_v1 where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date) as budget",
      [id.attempt],
    );
    expect(untouched.rows[0]).toMatchObject({
      stages:'0',costs:'0',budget:budgetBefore.rows[0]!.occupied,
    });
    // The exact native body (and same Call ID) can enter the existing
    // DB cost governor. This is a reservation only, never a sent request.
    const accepted=await dbStart('integrity_classification',
      native.callId,native.body,native.requestDigest);
    expect(accepted.rows[0]?.receipt).toMatchObject({
      stageIndex:0,purpose:'integrity_classification',
      reservedMicroUsd:'1524',
      permitsProvider:false,permitsAtomicCommit:false,permitsHttpReveal:false,
    });
    const wrongPrevious=await r33NativeWire(
      'disclosure_classification',expectedSelection,
      'sha256:wire-utf8:v1:'+'0'.repeat(64),
    );
    await expect(dbStart('disclosure_classification',
      wrongPrevious.callId,wrongPrevious.body,wrongPrevious.requestDigest
    )).rejects.toMatchObject({
      code:'23514',constraint:'seyeon_r34_synthetic_stage_contract_mismatch',
    });
    const final=await pool.query<{stages:string;costs:string;budget:string}>(
      "select (select count(*)::text from seyeon_positive_candidate.native_stage_lineage_r30 where attempt_id=$1::uuid) as stages,"+
      " (select count(*)::text from public.seyeon_ai_call_cost_events where attempt_id=$1::uuid) as costs,"+
      " (select occupied_micro_usd::text from public.seyeon_ai_governor_daily_budgets_v1 where bucket_utc_date=(clock_timestamp() at time zone 'UTC')::date) as budget",
      [id.attempt],
    );
    expect(final.rows[0]).toMatchObject({
      stages:'1',costs:'1',
      budget:String(BigInt(budgetBefore.rows[0]!.occupied)+1524n),
    });
  },30000);

});
