// Watchtower-Track: security
// G1 stage claims against REAL OpenAI adapter request bytes, but NEVER network.
import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { canonicalJson } from '../packages/domain/src/index.js';
import { createOpenAiSeyeonStructuredProviderV1 } from '../apps/api/src/openai-seyeon-structured-provider-v1.js';
import {
  SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
  type SeyeonStructuredProviderRequestV2,
} from '../apps/api/src/seyeon-character-runtime-v2.js';

const enabled=process.env.CI==='true' &&
  process.env.SEYEON_POSITIVE_GRANT_REAL_PG==='1' &&
  process.env.PGHOST==='localhost' &&
  process.env.PGDATABASE==='myeongha_seyeon_positive_pin_candidate_test';
const pool=enabled?new Pool({max:5,connectionTimeoutMillis:5000,statement_timeout:12000}):null;
const subject='d2000000-0000-4000-8000-000000000001';
const release='d3100000-0000-4000-8000-000000000001';
const bundle='d3000000-0000-4000-8000-000000000001';
const sha=(bytes:string)=>createHash('sha256').update(bytes,'utf8').digest('hex');
function ids(n:number){
  const v=String(n).padStart(12,'0');
  return {thread:'d4000000-0000-4000-8000-'+v,
    participant:'d4100000-0000-4000-8000-'+v,
    userMessage:'d7100000-0000-4000-8000-'+v,
    turn:'d7000000-0000-4000-8000-'+v,
    attempt:'d7200000-0000-4000-8000-'+v,
    memory:'d5000000-0000-4000-8000-'+v,
    grant:'d6000000-0000-4000-8000-'+v,
    selection:'sha256:v1:'+String(n).padStart(64,'0'),
  };
}
type Fixture=ReturnType<typeof ids>;
async function transaction<T>(fn:(c:PoolClient)=>Promise<T>,asExecutor=false):Promise<T>{
  if(!pool)throw Error('Scratch PG only');
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    if(asExecutor){
      await c.query('SET LOCAL ROLE myeongha_api_executor');
      await c.query("select set_config('myeongha.subject_id',$1,true)",[subject]);
    }
    const value=await fn(c);
    await c.query('COMMIT');
    return value;
  }catch(err){await c.query('ROLLBACK').catch(()=>undefined);throw err;}
  finally{c.release();}
}
async function prepare(n:number):Promise<Fixture>{
  const id=ids(n);
  await transaction(async c=>{
    await c.query(
      "insert into public.memory_items(id,subject_id,memory_type,schema_version,content_jsonb,source_kind,created_by_character_id,revoked_at,created_at) values($1,$2,'shared_detail','memory-v1',$3::jsonb,'user_approved','seyeon',null,clock_timestamp())",
      [id.memory,subject,JSON.stringify({kind:'synthetic-only',fixture:n})]);
    await c.query(
      "insert into public.record_access_grants(id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at) values($1,$2,null,$3,'seyeon','user_choice',clock_timestamp(),null)",
      [id.grant,subject,id.memory]);
    await c.query(
      "insert into public.conversation_threads(id,subject_id,thread_type,status,title,active_content_release_id,active_content_bundle_id,content_revision,next_sequence_no,created_at,updated_at) values($1,$2,'single_character','active','r4-stage-wire-scratch',$3,$4,0,1,clock_timestamp(),clock_timestamp())",
      [id.thread,subject,release,bundle]);
    await c.query(
      "insert into public.conversation_thread_characters(id,thread_id,character_id,content_bundle_id,role,joined_at) values($1,$2,'seyeon',$3,'primary',clock_timestamp()-interval '1 minute')",
      [id.participant,id.thread,bundle]);
    await c.query(
      'select * from public.cmd_receive_chat_turn_v1($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::jsonb,$7::uuid,$8::uuid,$9::uuid,$10::uuid,$11::text,$12::jsonb,$13::text)',
      [subject,id.thread,'r4-stage-'+n,'sha256:v1:synthetic-r4-'+n,'chat-request-v1',
       JSON.stringify({clientTurnId:'r4-stage-'+n,text:'synthetic-only',clientCapability:'0.0.1-dev'}),
       release,bundle,id.turn,id.userMessage,'synthetic-only',null,'sha256:v1:synthetic-r4-user-'+n]);
    await c.query('select * from public.cmd_allocate_chat_turn_attempt_v1($1::uuid,$2::uuid,$3::uuid,$4::text)',
      [subject,id.turn,id.attempt,'seyeon-production-chat-planner-v1']);
  });
  const pinned=await transaction(async c=>{
    const q=await c.query<{ok:boolean}>(
      'select seyeon_positive_candidate.pin_source_set_r1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,$6::text) as ok',
      [subject,id.thread,id.turn,id.attempt,JSON.stringify([{recordId:id.memory,grantId:id.grant}]),id.selection]);
    return q.rows[0]?.ok;
  },true);
  expect(pinned).toBe(true);
  return id;
}
const stages=['integrity_classification','disclosure_classification',
  'turn_interpretation','dialogue_render','semantic_review'] as const;
type Stage=typeof stages[number];
function request(purpose:Stage,id:Fixture):SeyeonStructuredProviderRequestV2{
  return {contractVersion:SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
    purpose,instructions:'Synthetic authority test only. No user data.',
    input:{attemptId:id.attempt,sourceId:id.memory,synthetic:true},
    responseSchema:{type:'object',additionalProperties:false,
      properties:{ok:{type:'boolean'}},required:['ok']}};
}
type Receipt={attemptId:string;purpose:string;callId:string;
  wireDigest:string;wireByteLength:number;originalRecordId:string;
  originalGrantId:string;selectedSourcesDigest:string;pgPayloadDigest:string};
async function stage(id:Fixture,purpose:Stage){
  const native=request(purpose,id);
  let fetches=0;let receipt:Receipt|null=null;let actualWire:string|null=null;
  const provider=createOpenAiSeyeonStructuredProviderV1({
    apiKey:'sk-test-only-not-an-actual-secret-000000000000',
    model:'offline-model',
    meteredBeforeDispatch:async (meta,body)=>{
      receipt=await transaction(async c=>{
        const q=await c.query<{receipt:Receipt|null}>(
          'select seyeon_positive_candidate.claim_owner_dispatch_r2($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::text,$8::text) as receipt',
          [subject,id.thread,id.turn,id.attempt,purpose,meta.callId,
            'sha256:v1:'+sha(canonicalJson(native)),body]);
        return q.rows[0]?.receipt??null;
      },true);
      if(!receipt)throw Error('DB original Grant or stage order denied');
    },
    fetchImpl:async (_url,init)=>{
      fetches++;
      actualWire=String(init.body);
      return new Response('{"error":"simulated provider unavailable"}',
        {status:503,headers:{'content-type':'application/json'}});
    },
  });
  // Successful DB admission still hits only the fake provider and rejects the
  // synthetic 503. No network, no model cost, no production HTTP response.
  await expect(provider.generate(native)).rejects.toThrow();
  return {fetches,receipt,actualWire};
}
async function receipts(id:Fixture){
  return transaction(async c=>{
    const q=await c.query<{purpose:string;raw_wire_digest:string;wire_byte_length:number;
      original_grant_id:string;pg_payload_digest:string}>(
      'select purpose,raw_wire_digest,wire_byte_length,original_grant_id::text,pg_payload_digest from seyeon_positive_candidate.provider_stage_receipts_r2 where attempt_id=$1::uuid order by admitted_at,purpose',
      [id.attempt]);
    return q.rows;
  });
}
describe.skipIf(!enabled)('R4 DB Original Grant attests real provider adapter UTF-8 bytes (scratch only)',()=>{
  afterAll(async()=>{await pool?.end();});
  it('seals all five real adapter native stages with DB-computed exact wire digest and stage ancestry',async()=>{
    const id=await prepare(41);
    for(const purpose of stages){
      const v=await stage(id,purpose);
      expect(v.fetches).toBe(1);
      expect(v.receipt).toMatchObject({purpose,attemptId:id.attempt,
        originalRecordId:id.memory,originalGrantId:id.grant,selectedSourcesDigest:id.selection});
      expect(v.actualWire).not.toBeNull();
      expect(v.receipt?.wireDigest).toBe('sha256:utf8:v1:'+sha(v.actualWire!));
      expect(v.receipt?.wireByteLength).toBe(new TextEncoder().encode(v.actualWire!).byteLength);
    }
    const saved=await receipts(id);
    expect(saved.map(x=>x.purpose).sort()).toEqual([...stages].sort());
    expect(saved.every(x=>x.original_grant_id===id.grant &&
      /^sha256:pg-jsonb:v1:[a-f0-9]{64}$/.test(x.pg_payload_digest))).toBe(true);
    // A duplicate dispatch cannot reuse an earlier DB stage decision.
    expect((await stage(id,'semantic_review')).fetches).toBe(0);
    expect(await receipts(id)).toHaveLength(5);
  });
  it('rejects skipped stages before even the fake fetch, without minting any receipt',async()=>{
    const id=await prepare(42);
    expect((await stage(id,'turn_interpretation')).fetches).toBe(0);
    expect((await stage(id,'dialogue_render')).fetches).toBe(0);
    expect((await stage(id,'semantic_review')).fetches).toBe(0);
    expect(await receipts(id)).toHaveLength(0);
    expect((await stage(id,'integrity_classification')).fetches).toBe(1);
    expect((await stage(id,'turn_interpretation')).fetches).toBe(0);
    expect(await receipts(id)).toHaveLength(1);
  });
  it('revoked original Grant and replacement Grant cannot authorize first wire stage',async()=>{
    const id=await prepare(43);
    await transaction(async c=>{
      await c.query('update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',[id.grant]);
      await c.query(
        "insert into public.record_access_grants(id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at) values($1,$2,null,$3,'seyeon','user_choice',clock_timestamp(),null)",
        ['d6000000-0000-4000-8000-000000000044',subject,id.memory]);
    });
    const denied=await stage(id,'integrity_classification');
    expect(denied.fetches).toBe(0);
    expect(denied.receipt).toBeNull();
    expect(await receipts(id)).toHaveLength(0);
  });
});
