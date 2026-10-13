import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { canonicalJson } from '../packages/domain/src/index.js';
import { selectSeyeonExactModelPersonalSourcesV1 } from
  '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';
import {
  createOpenAiSeyeonStructuredProviderV1,
} from '../apps/api/src/openai-seyeon-structured-provider-v1.js';
import type { SeyeonStructuredProviderRequestV2 } from
  '../apps/api/src/seyeon-character-runtime-v2.js';

const ENABLED=process.env.CI==='true' &&
  process.env.SEYEON_POSITIVE_GRANT_REAL_PG==='1' &&
  process.env.PGHOST==='localhost' &&
  process.env.PGDATABASE==='myeongha_seyeon_positive_pin_candidate_test';
const pool=ENABLED ? new Pool({
  max:8,connectionTimeoutMillis:5000,statement_timeout:12000,
}) : null;
const SUBJECT='d2000000-0000-4000-8000-000000000001';
const RELEASE='d3100000-0000-4000-8000-000000000001';
const BUNDLE='d3000000-0000-4000-8000-000000000001';
const HASH='sha256:v1:'+ 'f'.repeat(64);

function ids(n:number) {
  const two=String(n).padStart(12,'0');
  return Object.freeze({
    subjectId:SUBJECT,
    threadId:'d4000000-0000-4000-8000-'+two,
    turnId:'d7000000-0000-4000-8000-'+two,
    attemptId:'d7200000-0000-4000-8000-'+two,
    messageId:'d7100000-0000-4000-8000-'+two,
    participantId:'d4100000-0000-4000-8000-'+two,
    memoryId:'d5000000-0000-4000-8000-'+two,
    grantId:'d6000000-0000-4000-8000-'+two,
  });
}
type Fixture=ReturnType<typeof ids> & Readonly<{selectionDigest:string}>;
function sha(value:unknown):string {
  return 'sha256:v1:'+
    createHash('sha256').update(canonicalJson(value)).digest('hex');
}
function wireSha(body:string):string {
  return 'sha256:utf8:v1:'+
    createHash('sha256').update(new TextEncoder().encode(body)).digest('hex');
}

async function withClient<T>(action:(client:PoolClient)=>Promise<T>):Promise<T> {
  if(!pool) throw new Error('Disposable PostgreSQL is required');
  const client=await pool.connect();
  try{return await action(client);}
  finally{client.release();}
}
async function setExecutor(client:PoolClient) {
  await client.query('SET LOCAL ROLE myeongha_api_executor');
  await client.query("select set_config('myeongha.subject_id',$1,true)",[SUBJECT]);
}

async function prepare(n:number):Promise<Fixture> {
  const id=ids(n);
  const memory={
    kind:'memory' as const,
    memoryId:'memory:'+id.memoryId,
    claimKind:'fact' as const,
    summary:'Disposable synthetic original Grant '+n,
    sourceRef:'memory:'+id.memoryId+':grant:'+id.grantId,
    relevance:.8,salience:.5,
  };
  const source={
    recordKind:'memory' as const,
    recordId:id.memoryId,grantId:id.grantId,
    recordType:'shared_detail',schemaVersion:'memory-v1',
    projectedMemoryId:memory.memoryId,
    rawRecordDigest:sha({synthetic:n,notDbAuthority:true}),
    projectedMemoryDigest:sha(memory),
    permitsAtomicCommit:false as const,
    permitsHttpReveal:false as const,
  };
  const selection=selectSeyeonExactModelPersonalSourcesV1({
    retrievedMemories:[memory],sourceCandidates:[source],
  });
  const clientTurnId='offline-g1-g2-'+n;
  await withClient(async client=>{
    await client.query('BEGIN');
    try{
      await client.query(`
        insert into public.memory_items(
          id,subject_id,memory_type,schema_version,content_jsonb,source_kind,
          created_by_character_id,revoked_at,created_at
        ) values($1,$2,'shared_detail','memory-v1',$3::jsonb,
          'user_approved','seyeon',null,clock_timestamp())`,
        [id.memoryId,SUBJECT,JSON.stringify({synthetic:n,content:'not-real-personal-data'})]);
      await client.query(`
        insert into public.record_access_grants(
          id,subject_id,life_fact_id,memory_item_id,
          grantee_character_id,grant_reason,granted_at,revoked_at
        ) values($1,$2,null,$3,'seyeon','user_choice',clock_timestamp(),null)`,
        [id.grantId,SUBJECT,id.memoryId]);
      await client.query(`
        insert into public.conversation_threads(
          id,subject_id,thread_type,status,title,active_content_release_id,
          active_content_bundle_id,content_revision,next_sequence_no,
          created_at,updated_at
        ) values($1,$2,'single_character','active',
          'offline-g1-g2-receipt', $3,$4,0,1,clock_timestamp(),clock_timestamp())`,
        [id.threadId,SUBJECT,RELEASE,BUNDLE]);
      await client.query(`
        insert into public.conversation_thread_characters(
          id,thread_id,character_id,content_bundle_id,role,joined_at
        ) values($1,$2,'seyeon',$3,'primary',
          clock_timestamp()-interval '1 minute')`,
        [id.participantId,id.threadId,BUNDLE]);
      await client.query(`
        select * from public.cmd_receive_chat_turn_v1(
          $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::jsonb,
          $7::uuid,$8::uuid,$9::uuid,$10::uuid,$11::text,
          $12::jsonb,$13::text)`,
        [SUBJECT,id.threadId,clientTurnId,
         'sha256:v1:offline-g1-g2-'+n,'chat-request-v1',
         JSON.stringify({
           clientTurnId,text:'offline synthetic only',
           clientCapability:'0.0.1-dev',
         }),RELEASE,BUNDLE,id.turnId,id.messageId,
         'offline synthetic only',null,'sha256:v1:offline-user-'+n]);
      await client.query(`
        select * from public.cmd_allocate_chat_turn_attempt_v1(
          $1::uuid,$2::uuid,$3::uuid,$4::text)`,
        [SUBJECT,id.turnId,id.attemptId,'seyeon-production-chat-planner-v1']);
      await setExecutor(client);
      const p=await client.query<{pinned:boolean}>(`
        select seyeon_positive_candidate.pin_source_set_r1(
          $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,$6::text
        ) as pinned`,[SUBJECT,id.threadId,id.turnId,id.attemptId,
          JSON.stringify([{recordId:id.memoryId,grantId:id.grantId}]),
          selection.selectedSourcesDigest]);
      expect(p.rows[0]?.pinned).toBe(true);
      const legacy=await client.query<{pinned:boolean}>(`
        select seyeon_positive_candidate.pin_before_model_v1(
          $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid
        ) as pinned`,[SUBJECT,id.threadId,id.turnId,id.attemptId,
          id.memoryId,id.grantId]);
      expect(legacy.rows[0]?.pinned).toBe(true);
      await client.query('COMMIT'); // Guarantee Pin is durable BEFORE fetch.
    }catch(error){
      await client.query('ROLLBACK');
      throw error;
    }
  });
  return Object.freeze({...id,selectionDigest:selection.selectedSourcesDigest});
}

function request(purpose:SeyeonStructuredProviderRequestV2['purpose'], id:Fixture):
  SeyeonStructuredProviderRequestV2 {
  return {
    contractVersion:'seyeon-structured-provider-v2',
    purpose,
    instructions:'Server owned synthetic '+purpose,
    input:{
      userText:'합성 현재 발화',
      memorySourceRef:'memory:'+id.memoryId+':grant:'+id.grantId,
      attemptId:id.attemptId,
    },
    responseSchema:{
      type:'object',additionalProperties:false,
      required:['accepted'],
      properties:{accepted:{type:'boolean'}},
    },
  };
}

async function currentClaim(
  fixture:Fixture,stage:SeyeonStructuredProviderRequestV2,
  callId:string,body:string,
):Promise<Record<string,unknown>|null> {
  return withClient(async client=>{
    await client.query('BEGIN');
    try{
      await setExecutor(client);
      const result=await client.query<{receipt:Record<string,unknown>|null}>(`
        select seyeon_positive_candidate.claim_owner_dispatch_r2(
          $1::uuid,$2::uuid,$3::uuid,$4::uuid,
          $5::text,$6::uuid,$7::text,$8::text
        ) as receipt`,[SUBJECT,fixture.threadId,fixture.turnId,
          fixture.attemptId,stage.purpose,callId,sha(stage),body]);
      await client.query('COMMIT'); // No model dispatch before DB commit.
      return result.rows[0]?.receipt??null;
    }catch(error){await client.query('ROLLBACK');throw error;}
  });
}

async function expectLockWait(label:string) {
  for(let n=0;n<100;n++){
    const count=await withClient(async c=>c.query<{count:string}>(`
      select count(*)::text as count
      from pg_catalog.pg_stat_activity
      where application_name=$1 and wait_event_type='Lock'`,[label]));
    if(count.rows[0]?.count==='1')return;
    await new Promise<void>(resolve=>setTimeout(resolve,30));
  }
  throw new Error('No independent PostgreSQL lock wait: '+label);
}

describe.skipIf(!ENABLED)('Seyeon G1 Owner-style dispatch + G2 revoke/commit (disposable PostgreSQL)',()=>{
  afterAll(async()=>{await pool?.end();});

  it('commits DB-original-Grant stage receipts before each real Adapter fake-fetch, rejects replay/order',async()=>{
    const id=await prepare(5);
    const admitted=new Map<string,string>();
    const fetchImpl=vi.fn(async (_url:string,init:RequestInit)=>{
      const callId=new Headers(init.headers).get('x-client-request-id');
      expect(typeof callId).toBe('string');
      const body=String(init.body);
      expect(admitted.get(callId!)).toBe(body);
      // This is a DIFFERENT DB connection: the receipt has committed.
      const proof=await withClient(c=>c.query<{count:string}>(`
        select count(*)::text as count
        from seyeon_positive_candidate.provider_stage_receipts_r2
        where call_id=$1::uuid`,[callId]));
      expect(proof.rows[0]?.count).toBe('1');
      admitted.delete(callId!);
      return Response.json({
        status:'completed',output:[{type:'message',content:[
          {type:'output_text',text:'{"accepted":true}'},
        ]}],
      });
    });
    let active:SeyeonStructuredProviderRequestV2|null=null;
    const provider=createOpenAiSeyeonStructuredProviderV1({
      apiKey:'sk-offline-not-a-paid-provider-credential-123456',
      model:'offline-model',fetchImpl,
      meteredBeforeDispatch:async(meta,body)=>{
        const stage=active;
        if(!stage || meta.purpose!==stage.purpose ||
          JSON.parse(body).input[0].content[0].text!==JSON.stringify(stage.input)){
          throw new Error('Native context changed before G1 DB admission');
        }
        const receipt=await currentClaim(id,stage,meta.callId,body);
        if(!receipt || receipt.attemptId!==id.attemptId ||
          receipt.purpose!==meta.purpose ||
          receipt.callId!==meta.callId ||
          receipt.selectedSourcesDigest!==id.selectionDigest ||
          receipt.originalRecordId!==id.memoryId ||
          receipt.originalGrantId!==id.grantId ||
          receipt.wireByteLength!==new TextEncoder().encode(body).byteLength ||
          receipt.wireDigest!==wireSha(body)){
          throw new Error('DB did not grant the exact stage/byte receipt');
        }
        admitted.set(meta.callId,body);
      },
    });
    // No reviewer may be sent before either classification.
    active=request('semantic_review',id);
    await expect(provider.generate(active)).rejects.toMatchObject({
      code:'PRE_DISPATCH_REJECTED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    for(const stage of [
      'integrity_classification','disclosure_classification',
      'turn_interpretation','dialogue_render','semantic_review',
    ] as const){
      active=request(stage,id);
      expect(await provider.generate(active)).toEqual({accepted:true});
    }
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(admitted.size).toBe(0);
    const rows=await withClient(c=>c.query<{count:string}>(`
      select count(*)::text as count from
        seyeon_positive_candidate.provider_stage_receipts_r2
      where attempt_id=$1::uuid`,[id.attemptId]));
    expect(rows.rows[0]?.count).toBe('5');
    active=request('turn_interpretation',id);
    await expect(provider.generate(active)).rejects.toMatchObject({
      code:'PRE_DISPATCH_REJECTED',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it('G2 revoke-first: real Subject lock forces commit to wait then HOLD',async()=>{
    const id=await prepare(6);
    await withClient(async revoke=>{
      await withClient(async commit=>{
        await revoke.query('BEGIN');
        await revoke.query('select id from public.subjects where id=$1 for update',[SUBJECT]);
        await revoke.query(
          'update public.record_access_grants set revoked_at=clock_timestamp() where id=$1',
          [id.grantId]);
        await commit.query("SET application_name='seyeon_g2_revoke_first_waiter'");
        await commit.query('BEGIN');
        await setExecutor(commit);
        const pending=commit.query<{committed:boolean}>(`
          select seyeon_positive_candidate.commit_original_grant_locked_r2(
            $1::uuid,$2::uuid,$3::text
          ) as committed`,[SUBJECT,id.attemptId,'synthetic receipt only']);
        try{
          await expectLockWait('seyeon_g2_revoke_first_waiter');
          await revoke.query('COMMIT');
          const result=await pending;
          expect(result.rows[0]?.committed).toBe(false);
          await commit.query('COMMIT');
        }finally{
          await revoke.query('ROLLBACK').catch(()=>undefined);
          await commit.query('ROLLBACK').catch(()=>undefined);
        }
      });
    });
    const result=await withClient(c=>c.query<{state:string}>(`
      select state from seyeon_positive_candidate.attempt_source_pins
      where attempt_id=$1`,[id.attemptId]));
    expect(result.rows[0]?.state).toBe('pinned');
  });

  it('G2 commit-first: Grant revoke waits; later current-rights Reveal is denied',async()=>{
    const id=await prepare(7);
    await withClient(async commit=>{
      await withClient(async revoke=>{
        await commit.query("SET application_name='seyeon_g2_commit_holder'");
        await commit.query('BEGIN');
        await setExecutor(commit);
        const answer=await commit.query<{committed:boolean}>(`
          select seyeon_positive_candidate.commit_original_grant_locked_r2(
            $1::uuid,$2::uuid,$3::text
          ) as committed`,[SUBJECT,id.attemptId,'synthetic committed no public output']);
        expect(answer.rows[0]?.committed).toBe(true);
        await revoke.query("SET application_name='seyeon_g2_late_revoke_waiter'");
        await revoke.query('BEGIN');
        const pending=(async()=>{
          await revoke.query('select id from public.subjects where id=$1 for update',[SUBJECT]);
          await revoke.query(
            'update public.record_access_grants set revoked_at=clock_timestamp() where id=$1',
            [id.grantId]);
          await revoke.query('COMMIT');
        })();
        try{
          await expectLockWait('seyeon_g2_late_revoke_waiter');
          await commit.query('COMMIT');
          await pending;
        }finally{
          await commit.query('ROLLBACK').catch(()=>undefined);
          await revoke.query('ROLLBACK').catch(()=>undefined);
        }
      });
    });
    const held=await withClient(async c=>{
      await c.query('BEGIN');
      try{
        await setExecutor(c);
        const q=await c.query<{text:string|null}>(`
          select seyeon_positive_candidate.reveal_test_v1(
            $1::uuid,$2::uuid
          ) as text`,[SUBJECT,id.attemptId]);
        await c.query('COMMIT');
        return q.rows[0]?.text;
      }catch(e){await c.query('ROLLBACK');throw e;}
    });
    expect(held).toBeNull();
  });
});
