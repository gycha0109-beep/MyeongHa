// Watchtower-Track: character-memory
// Disposable CI PostgreSQL only: real v2/v1/core Chat Commit and BOTH outboxes.
import { afterAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';

const enabled=process.env.CI==='true' &&
  process.env.SEYEON_POSITIVE_GRANT_REAL_PG==='1' &&
  process.env.PGHOST==='localhost' &&
  process.env.PGDATABASE==='myeongha_seyeon_positive_pin_candidate_test';
const pool=enabled?new Pool({
  max:8,connectionTimeoutMillis:5000,statement_timeout:15000,
}):null;
const subject='d2000000-0000-4000-8000-000000000001';
const bundle='d3000000-0000-4000-8000-000000000001';
const release='d3100000-0000-4000-8000-000000000001';
const body='시험용 세연 답변입니다.';
const contentHash='sha256:v1:'+'b'.repeat(64);

function ids(n:number) {
  const tail=String(n).padStart(12,'0');
  return {
    thread:'d4000000-0000-4000-8000-'+tail,
    turn:'d7000000-0000-4000-8000-'+tail,
    attempt:'d7200000-0000-4000-8000-'+tail,
    userMessage:'d7100000-0000-4000-8000-'+tail,
    participant:'d4100000-0000-4000-8000-'+tail,
    memory:'d5000000-0000-4000-8000-'+tail,
    grant:'d6000000-0000-4000-8000-'+tail,
    rendererLog:'d8100000-0000-4000-8000-'+tail,
    guardLog:'d8200000-0000-4000-8000-'+tail,
    assistantMessage:'d8300000-0000-4000-8000-'+tail,
    chatOutbox:'d8400000-0000-4000-8000-'+tail,
    postOutbox:'d8500000-0000-4000-8000-'+tail,
    selectionDigest:'sha256:v1:'+String(n).padStart(64,'0'),
  };
}
type Fixture=ReturnType<typeof ids>&{rawDigest:string};
async function clientAction<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T> {
  if(!pool)throw Error('Requires named disposable CI PostgreSQL');
  const c=await pool.connect();
  try{return await fn(c);}finally{c.release();}
}
async function executor(c:PoolClient) {
  await c.query('SET LOCAL ROLE myeongha_api_executor');
  await c.query("select set_config('myeongha.subject_id',$1,true)",[subject]);
}
async function transaction<T>(
  action:(c:PoolClient)=>Promise<T>,api=false,
):Promise<T> {
  return clientAction(async c=>{
    await c.query('BEGIN');
    try{
      if(api)await executor(c);
      const result=await action(c);
      await c.query('COMMIT');
      return result;
    }catch(err){await c.query('ROLLBACK');throw err;}
  });
}

async function prepare(n:number):Promise<Fixture> {
  const id=ids(n);
  await transaction(async c=>{
    await c.query(
      "insert into public.memory_items(id,subject_id,memory_type,schema_version,content_jsonb,source_kind,created_by_character_id,revoked_at,created_at) values($1,$2,'shared_detail','memory-v1',$3::jsonb,'user_approved','seyeon',null,clock_timestamp())",
      [id.memory,subject,JSON.stringify({fixture:n,synthetic:true})],
    );
    await c.query(
      "insert into public.record_access_grants(id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at) values($1,$2,null,$3,'seyeon','user_choice',clock_timestamp(),null)",
      [id.grant,subject,id.memory],
    );
    await c.query(
      "insert into public.conversation_threads(id,subject_id,thread_type,status,title,active_content_release_id,active_content_bundle_id,content_revision,next_sequence_no,created_at,updated_at) values($1,$2,'single_character','active','g2-real-v2-disposable',$3,$4,0,1,clock_timestamp(),clock_timestamp())",
      [id.thread,subject,release,bundle],
    );
    await c.query(
      "insert into public.conversation_thread_characters(id,thread_id,character_id,content_bundle_id,role,joined_at) values($1,$2,'seyeon',$3,'primary',clock_timestamp()-interval '1 minute')",
      [id.participant,id.thread,bundle],
    );
    const turnKey='g2-real-v2-'+n;
    await c.query(
      "select * from public.cmd_receive_chat_turn_v1($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::jsonb,$7::uuid,$8::uuid,$9::uuid,$10::uuid,$11::text,$12::jsonb,$13::text)",
      [subject,id.thread,turnKey,'sha256:v1:synthetic-'+n,
       'chat-request-v1',JSON.stringify({
         clientTurnId:turnKey,text:'합성 대화',clientCapability:'0.0.1-dev',
       }),release,bundle,id.turn,id.userMessage,'합성 대화',
       null,'sha256:v1:synthetic-user-'+n],
    );
    await c.query(
      'select * from public.cmd_allocate_chat_turn_attempt_v1($1::uuid,$2::uuid,$3::uuid,$4::text)',
      [subject,id.turn,id.attempt,'seyeon-production-chat-planner-v1'],
    );
  });
  // G1 R4: DB owns BOTH immutable original SourceSet+Grant and the real
  // core context_ready transition in the same SQL transaction.
  const g1=await transaction(async c=>{
    return c.query<{receipt:{
      attemptId:string;contextReady:boolean;selectedSourcesDigest:string;
    }}>(
      'select seyeon_positive_candidate.pin_and_context_ready_r4($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,$6::text) as receipt',
      [subject,id.thread,id.turn,id.attempt,
       JSON.stringify([{recordId:id.memory,grantId:id.grant}]),
       id.selectionDigest],
    );
  },true);
  expect(g1.rows[0]?.receipt).toMatchObject({
    attemptId:id.attempt,contextReady:true,
    selectedSourcesDigest:id.selectionDigest,
  });
  const edge=await clientAction(c=>c.query<{pg_payload_digest:string}>(
    'select pg_payload_digest from seyeon_positive_candidate.source_edges_r1 where attempt_id=$1::uuid and ordinal=0',
    [id.attempt],
  ));
  expect(edge.rows).toHaveLength(1);
  return {...id,rawDigest:edge.rows[0]!.pg_payload_digest};
}
function proof(id:Fixture) {
  return {
    schemaVersion:'offline-positive-original-source-proof-r3',
    recordId:id.memory,originalGrantId:id.grant,
    selectedSourcesDigest:id.selectionDigest,
    pgPayloadDigest:id.rawDigest,
  };
}
async function stage(id:Fixture,validationProof:Record<string,unknown>) {
  await transaction(async c=>{
    const generated=await c.query<{ok:boolean}>(
      'select public.cmd_persist_seyeon_chat_generated_runtime_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,$7::text,$8::text,$9::text,$10::jsonb,$11::text,$12::text,$13::jsonb) as ok',
      [subject,id.turn,id.attempt,id.participant,id.rendererLog,
       'offline','offline-model','offline-renderer-r3',body,
       JSON.stringify({text:body}),'chat-character-message-v1',contentHash,'[]'],
    );
    expect(generated.rows[0]?.ok).toBe(false);
    const validated=await c.query<{ok:boolean}>(
      'select public.cmd_persist_seyeon_chat_validated_runtime_v1($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::text,$7::text,$8::text,$9::jsonb,$10::jsonb) as ok',
      [subject,id.turn,id.attempt,id.guardLog,'offline','offline-model',
       'offline-output-guard-r3',contentHash,
       JSON.stringify({passed:true,personalRecordProvenance:validationProof}),'[]'],
    );
    expect(validated.rows[0]?.ok).toBe(false);
  },true);
}
async function actualCommit(c:PoolClient,id:Fixture) {
  return c.query<{receipt:Record<string,unknown>}>(
    'select seyeon_positive_candidate.commit_actual_v2_r3($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::jsonb,$9::text,$10::text) as receipt',
    [subject,id.thread,id.turn,id.attempt,id.assistantMessage,
     id.chatOutbox,id.postOutbox,JSON.stringify({
       schemaVersion:'seyeon-post-turn-analysis-snapshot-v1',
       turnId:id.turn,assistantMessageId:id.assistantMessage,
       userMessageId:id.userMessage,
     }),'sha256:v1:synthetic-post-turn-hash',id.selectionDigest],
  );
}
async function saved(id:Fixture) {
  return clientAction(async c=>{
    const r=await c.query<{
      messages:string;outboxes:string;admissions:string;
      attempt_state:string;turn_state:string;
    }>(
      'select (select count(*)::text from public.conversation_messages m where m.turn_id=$1::uuid and m.sender_type=\'character\') as messages,'+
      ' (select count(*)::text from public.outbox_events o where o.aggregate_type=\'chat_turn\' and o.aggregate_id=$1::text and o.event_type in (\'CHAT_TURN_COMMITTED\',\'SEYEON_POST_TURN_ANALYSIS_REQUESTED\')) as outboxes,'+
      ' (select count(*)::text from seyeon_positive_candidate.actual_v2_commit_admissions_r3 a where a.attempt_id=$2::uuid) as admissions,'+
      ' (select a.state from public.chat_turn_attempts a where a.id=$2::uuid) as attempt_state,'+
      ' (select t.state from public.chat_turns t where t.id=$1::uuid) as turn_state',
      [id.turn,id.attempt],
    );
    return r.rows[0]!;
  });
}
async function waitForLock(label:string) {
  for(let n=0;n<100;n++){
    const q=await clientAction(c=>c.query<{count:string}>(
      "select count(*)::text as count from pg_catalog.pg_stat_activity where application_name=$1 and wait_event_type='Lock'",
      [label],
    ));
    if(q.rows[0]?.count==='1')return;
    await new Promise<void>(resolve=>setTimeout(resolve,30));
  }
  throw Error('No actual independent PostgreSQL lock wait: '+label);
}

describe.skipIf(!enabled)('G2 actual v2/v1/core and both Outboxes, disposable-only',()=>{
  afterAll(async()=>{await pool?.end();});

  it('real v2 commits one assistant message and two outboxes with original Grant in one DB transaction',async()=>{
    const id=await prepare(21);
    await stage(id,proof(id));
    expect(await saved(id)).toMatchObject({
      messages:'0',outboxes:'0',attempt_state:'validated',
    });
    const r=await transaction(c=>actualCommit(c,id),true);
    expect(r.rows[0]?.receipt).toMatchObject({
      turnId:id.turn,attemptId:id.attempt,
      assistantMessageId:id.assistantMessage,
      postTurnOutboxEventId:id.postOutbox,replayed:false,
    });
    expect(await saved(id)).toMatchObject({
      messages:'1',outboxes:'2',admissions:'1',
      attempt_state:'committed',turn_state:'committed',
    });
    const e=await clientAction(c=>c.query<{body_text:string;event_type:string}>(
      'select m.body_text,o.event_type from public.conversation_messages m join public.outbox_events o on o.aggregate_id=m.turn_id::text where m.id=$1::uuid order by o.event_type',
      [id.assistantMessage],
    ));
    expect(e.rows.map(v=>v.event_type)).toEqual([
      'CHAT_TURN_COMMITTED','SEYEON_POST_TURN_ANALYSIS_REQUESTED',
    ]);
    expect(e.rows.every(v=>v.body_text===body)).toBe(true);
  });

  it('original revoked Grant aborts real v2, assistant, both outboxes and admission',async()=>{
    const id=await prepare(22);
    await stage(id,proof(id));
    await clientAction(c=>c.query(
      'update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',
      [id.grant],
    ));
    await expect(transaction(c=>actualCommit(c,id),true)).rejects.toMatchObject({
      constraint:'seyeon_offline_r3_original_grant_revoked',
    });
    expect(await saved(id)).toMatchObject({
      messages:'0',outboxes:'0',admissions:'0',
      attempt_state:'validated',turn_state:'validated',
    });
  });

  it('forged / changed validation provenance aborts real v2 atomically',async()=>{
    const id=await prepare(23);
    await stage(id,{
      ...proof(id),originalGrantId:'d6000000-0000-4000-8000-000000000099',
    });
    await expect(transaction(c=>actualCommit(c,id),true)).rejects.toMatchObject({
      constraint:'seyeon_offline_r3_unbound_validation',
    });
    expect(await saved(id)).toMatchObject({
      messages:'0',outboxes:'0',admissions:'0',
      attempt_state:'validated',turn_state:'validated',
    });
  });

  it('a freshly regranted ID cannot authorize the old pinned Attempt',async()=>{
    const id=await prepare(26);
    await stage(id,proof(id));
    await transaction(async c=>{
      await c.query(
        'update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',
        [id.grant],
      );
      await c.query(
        "insert into public.record_access_grants(id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at) values($1,$2,null,$3,'seyeon','user_choice',clock_timestamp(),null)",
        ['d6000000-0000-4000-8000-000000000126',subject,id.memory],
      );
    });
    await expect(transaction(c=>actualCommit(c,id),true)).rejects.toMatchObject({
      constraint:'seyeon_offline_r3_original_grant_revoked',
    });
    expect(await saved(id)).toMatchObject({
      messages:'0',outboxes:'0',admissions:'0',
      attempt_state:'validated',turn_state:'validated',
    });
  });

  it('a late second-Outbox ID collision rolls back real v2 message, first Outbox and admission',async()=>{
    const id=await prepare(27);
    await stage(id,proof(id));
    // Owner fixture reserves only the POST-turn event ID against a different
    // aggregate, so the core first Chat Outbox insert is not pre-blocked.
    await transaction(async c=>{
      await c.query(
        "insert into public.outbox_events(id,aggregate_type,aggregate_id,event_type,event_schema_version,dedupe_key,payload_jsonb,status,attempt_count,available_at,created_at) values($1::uuid,'chat_turn',$2::text,'CHAT_TURN_COMMITTED','v1','synthetic-id-collision-r3','{}'::jsonb,'pending',0,clock_timestamp(),clock_timestamp())",
        [id.postOutbox,'offline-unrelated-fixture-27'],
      );
    });
    await expect(transaction(c=>actualCommit(c,id),true)).rejects.toMatchObject({
      code:'23505',constraint:'outbox_events_pkey',
    });
    expect(await saved(id)).toMatchObject({
      messages:'0',outboxes:'0',admissions:'0',
      attempt_state:'validated',turn_state:'validated',
    });
    const preserved=await clientAction(c=>c.query<{aggregate_id:string}>(
      'select aggregate_id from public.outbox_events where id=$1::uuid',
      [id.postOutbox],
    ));
    expect(preserved.rows[0]?.aggregate_id).toBe('offline-unrelated-fixture-27');
  });

  it('revoke-first: real G2 Commit waits for Subject then refuses all writes',async()=>{
    const id=await prepare(24);
    await stage(id,proof(id));
    await clientAction(revoker=>clientAction(async committer=>{
      await revoker.query('BEGIN');
      await revoker.query(
        'select id from public.subjects where id=$1::uuid for update',[subject],
      );
      await revoker.query(
        'update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',
        [id.grant],
      );
      await committer.query("SET application_name='seyeon_r3_revoke_first'");
      await committer.query('BEGIN');
      await executor(committer);
      const pending=actualCommit(committer,id).then(()=>false,(e:unknown)=>{
        return (e as {constraint?:string}).constraint===
          'seyeon_offline_r3_original_grant_revoked';
      });
      try{
        await waitForLock('seyeon_r3_revoke_first');
        await revoker.query('COMMIT');
        expect(await pending).toBe(true);
      }finally{
        await committer.query('ROLLBACK').catch(()=>undefined);
        await revoker.query('ROLLBACK').catch(()=>undefined);
      }
    }));
    expect(await saved(id)).toMatchObject({
      messages:'0',outboxes:'0',admissions:'0',
      attempt_state:'validated',
    });
  });

  it('commit-first: revoke waits for real v2 COMMIT, then original rights end',async()=>{
    const id=await prepare(25);
    await stage(id,proof(id));
    await clientAction(committer=>clientAction(async revoker=>{
      await committer.query("SET application_name='seyeon_r3_commit_first'");
      await committer.query('BEGIN');
      await executor(committer);
      const r=await actualCommit(committer,id);
      expect(r.rows[0]?.receipt.replayed).toBe(false);
      await revoker.query("SET application_name='seyeon_r3_revoke_waiter'");
      await revoker.query('BEGIN');
      const pending=(async()=>{
        await revoker.query(
          'select id from public.subjects where id=$1::uuid for update',[subject],
        );
        await revoker.query(
          'update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',
          [id.grant],
        );
        await revoker.query('COMMIT');
      })();
      try{
        await waitForLock('seyeon_r3_revoke_waiter');
        await committer.query('COMMIT');
        await pending;
      }finally{
        await committer.query('ROLLBACK').catch(()=>undefined);
        await revoker.query('ROLLBACK').catch(()=>undefined);
      }
    }));
    expect(await saved(id)).toMatchObject({
      messages:'1',outboxes:'2',admissions:'1',
      attempt_state:'committed',turn_state:'committed',
    });
    const grant=await clientAction(c=>c.query<{revoked_at:Date|null}>(
      'select revoked_at from public.record_access_grants where id=$1::uuid',
      [id.grant],
    ));
    expect(grant.rows[0]?.revoked_at).not.toBeNull();
    // Stored bytes are NOT user Reveal authority. G3 replay/current-rights
    // remains closed and needs its own DB-owned reader.
  });
});
