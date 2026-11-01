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
import {buildSeyeonTurnInterpreterRequestV2} from '../apps/api/src/seyeon-character-runtime-v2.js';
import {createOpenAiSeyeonStructuredProviderV1} from '../apps/api/src/openai-seyeon-structured-provider-v1.js';
import {attestSeyeonR35OfflineWireAfterDbPinV1} from '../apps/api/src/seyeon-r35-offline-actual-provider-wire-pin-v1.js';
import {
  reserveSeyeonR26OfflineGovernedWireV1,
  SeyeonR26OfflineG4HoldV1,
  type SeyeonR26OfflineG4ReceiptV1,
} from '../apps/api/src/seyeon-r26-offline-governed-wire-reservation-v1.js';
import type {SeyeonAiGovernorAdmissionV1} from '../apps/api/src/postgres-seyeon-ai-cost-ledger-v1.js';

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
    // A stale G1/Wire receipt is not enough once the SECOND original Grant
    // was revoked between attestation and the new G4 DB reservation.
    await pool.query(
      'update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',
      [second.grantId],
    );
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
    expect(remaining.rows[0]?.occupied).toBe('1524');
  });
});
