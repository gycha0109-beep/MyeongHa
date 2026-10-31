// Watchtower-Track: security
// Disposable CI PostgreSQL only: real v2/v1/core Chat Commit and BOTH outboxes.
import { afterAll, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolveMeDispatchTargetForTestV1, toCanonicalMeRequestForTestV1 } from '../api/me.js';
import { Pool, type PoolClient } from 'pg';
import { handleSeyeonChatTurnSendRequestV1 } from '../apps/api/src/chat-turn-send-http.js';
import { sendSeyeonNodeOriginalGrantResponseV1 } from '../apps/api/src/seyeon-node-original-grant-send-boundary-v1.js';
import { createSeyeonOriginalGrantPgSendAdapterV1 } from '../apps/api/src/seyeon-original-grant-pg-send-adapter-v1.js';
import {
  sendSeyeonR24OfflineG3V1,
  SeyeonR24OfflineG3HoldV1,
} from '../apps/api/src/seyeon-r24-offline-committed-node-reveal-v1.js';
import type {
  SeyeonR23OfflineG2CommitReceiptV1,
} from '../apps/api/src/seyeon-g2-atomic-exact-final-source-commit-r23-candidate.js';

import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

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


// Test-only Subject resolver fixture: canonical Subject is fixed by the named
// disposable PG setup. All original Grant/Record/Attempt/Message rights are
// still checked by the REAL database function, under the REAL API role.
const offlineMemberId='d2010000-0000-4000-8000-000000000001';
const offlineOriginalGrantPgPool:PostgresSubjectPoolV1={
  async connect(){
    if(!pool)throw Error('Requires named disposable PostgreSQL');
    const c=await pool.connect();
    return {
      async query<Row>(sql:string, values?:readonly unknown[]){
        if(sql.includes('public.begin_member_subject_context_v1')) {
          if(values?.[0]!==offlineMemberId)throw Error('Unexpected offline member');
          return {rows:[{subjectId:subject,subjectKind:'member'}] as unknown as readonly Row[]};
        }
        if(sql.includes('public.assert_myeongha_subject_context_v1')){
          await c.query("select set_config('myeongha.subject_id',$1,true)",[subject]);
          return {rows:[]};
        }
        const r=await c.query(sql,values===undefined?[]:[...values]);
        return {rows:r.rows as readonly Row[]};
      },
      release(error?:unknown){
        c.release(error instanceof Error?error:undefined);
      },
    };
  },
};

async function prepare(n:number,pin=true):Promise<Fixture> {
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
  if(!pin)return {...id,rawDigest:''};
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
async function g1Pin(c:PoolClient,id:Fixture) {
  return c.query<{receipt:Record<string,unknown>}>(
    'select seyeon_positive_candidate.pin_and_context_ready_r4($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,$6::text) as receipt',
    [subject,id.thread,id.turn,id.attempt,
     JSON.stringify([{recordId:id.memory,grantId:id.grant}]),
     id.selectionDigest],
  );
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
  for(let n=0;n<160;n++){
    const q=await clientAction(c=>c.query<{count:string}>(
      "select count(*)::text as count from pg_catalog.pg_stat_activity where application_name=$1 and wait_event_type='Lock'",
      [label],
    ));
    if(q.rows[0]?.count==='1')return;
    await new Promise<void>(resolve=>setTimeout(resolve,30));
  }
  throw Error('No actual independent PostgreSQL lock wait: '+label);
}


async function committed(n:number):Promise<Fixture>{
 const id=await prepare(n);
 await stage(id,proof(id));
 const result=await transaction(c=>actualCommit(c,id),true);
 expect(result.rows[0]?.receipt).toMatchObject({attemptId:id.attempt,replayed:false});
 return id;
}
async function reveal(id:Fixture):Promise<string|null>{
 const r=await transaction(c=>c.query<{answer:string|null}>(
  'select seyeon_positive_candidate.reveal_actual_v2_r5($1::uuid,$2::uuid,$3::uuid) as answer',
  [subject,id.thread,id.turn],
 ),true);
 return r.rows[0]?.answer??null;
}
// R25 uses the real R5 original-rights owner proof, then consumes the
// original Turn under FOR UPDATE before Node socket finish/Tx COMMIT.
async function firstOnceR25(c:PoolClient,id:Fixture) {
  const q=await c.query<{answer:string|null}>(
    'select seyeon_positive_candidate.reveal_first_once_r25($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::text) as answer',
    [subject,id.thread,id.turn,id.attempt,id.assistantMessage,
     id.userMessage,id.postOutbox,'g2-real-v2-'+Number(id.turn.slice(-12))],
  );
  return q.rows[0]?.answer??null;
}

async function http(id:Fixture,override?:Partial<Fixture>):Promise<string|null>{
 const loc={...id,...override};
 const r=await transaction(c=>c.query<{answer:string|null}>(
  'select seyeon_positive_candidate.reveal_http_r5($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) as answer',
  [subject,loc.thread,loc.turn,loc.attempt,loc.assistantMessage],
 ),true);
 return r.rows[0]?.answer??null;
}
async function history(id:Fixture){
 return transaction(c=>c.query<{
  message_id:string;sequence_no:string;sender_type:string;
  character_id:string|null;body_text:string|null;message_payload_jsonb:unknown;
 }>(
  'select * from seyeon_positive_candidate.read_authorized_page_r5($1::uuid,$2::uuid,$3::bigint,$4::integer)',
  [subject,id.thread,0,20],
 ),true);
}

type R9HttpHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

async function withR9Loopback(
  handler: R9HttpHandler,
  check: (origin: string) => Promise<void>,
): Promise<void> {
  const server = createServer((request, response) => {
    void handler(request, response).catch(error => {
      // Ensure the test fails on route/assertion defects rather than hanging
      // forever on the fetch side.
      if (!response.headersSent) response.statusCode = 500;
      response.end('r9-loopback-error:' + String(error));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  try {
    await check('http://127.0.0.1:' + (server.address() as AddressInfo).port);
  } finally {
    await new Promise<void>(resolve => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
}

async function r9ReadBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function r9WriteResponse(outgoing: ServerResponse, result: Response): Promise<void> {
  outgoing.statusCode = result.status;
  result.headers.forEach((value, name) => outgoing.setHeader(name, value));
  outgoing.end(Buffer.from(await result.arrayBuffer()));
}

describe.skipIf(!enabled)('R5 disposable actual-v2 current-rights first/replay/history',()=>{
 afterAll(async()=>{await pool?.end();});
 it('committed real v2: owner first/replay and page read only exact authorized body; no payload leak',async()=>{
  const id=await committed(71);
  expect(await reveal(id)).toBe(body);
  expect(await http(id)).toBe(body);
  expect(await http(id)).toBe(body); // replay checks CURRENT Grant, not stored proof
  const page=(await history(id)).rows;
  expect(page.some(x=>x.sender_type==='character'&&x.body_text===body)).toBe(true);
  expect(page.every(x=>x.message_payload_jsonb==null)).toBe(true);
  expect(page.some(x=>x.sender_type==='user')).toBe(true);
 });
 it('forged message/attempt and wrong thread never reveal even with valid Grant',async()=>{
  const id=await committed(72);
  expect(await http(id,{attempt:'d7200000-0000-4000-8000-000000000099'})).toBeNull();
  expect(await http(id,{assistantMessage:'d8300000-0000-4000-8000-000000000099'})).toBeNull();
  expect(await http(id,{thread:'d4000000-0000-4000-8000-000000000099'})).toBeNull();
  expect(await reveal(id)).toBe(body);
 });
 it('revoke and different regrant must HOLD both replay and whole history page',async()=>{
  const id=await committed(73);
  expect(await http(id)).toBe(body);
  await transaction(async c=>{
    await c.query('update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',[id.grant]);
    await c.query(
      "insert into public.record_access_grants(id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at) values($1::uuid,$2::uuid,null,$3::uuid,'seyeon','user_choice',clock_timestamp(),null)",
      ['d6000000-0000-4000-8000-000000000143',subject,id.memory],
    );
  });
  expect(await reveal(id)).toBeNull();
  expect(await http(id)).toBeNull();
  await expect(history(id)).rejects.toMatchObject({constraint:'seyeon_offline_r5_page_held'});
 });
 it('denies redacted stored generated message and fails closed on history',async()=>{
  const id=await committed(74);
  await clientAction(c=>c.query(
    'update public.conversation_messages set redacted_at=clock_timestamp(), redaction_reason=\'conversation_delete\' where id=$1::uuid',
    [id.assistantMessage],
  ));
  expect(await reveal(id)).toBeNull();
  expect(await http(id)).toBeNull();
  const rows=(await history(id)).rows;
  expect(rows.every(x=>x.body_text!==body)).toBe(true);
  expect(rows.every(x=>x.message_payload_jsonb==null)).toBe(true);
 });
 it('revoke-first independent PostgreSQL session blocks owner read until revoke COMMIT and reveals zero',async()=>{
  const id=await committed(75);
  await clientAction(revoker=>clientAction(async reader=>{
   await revoker.query('BEGIN');
   try{
    await revoker.query('select id from public.subjects where id=$1::uuid for update',[subject]);
    await revoker.query('update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',[id.grant]);
    await reader.query('BEGIN');
    await executor(reader);
    await reader.query("set local application_name='seyeon-r5-read-after-revoke'");
    const pending=reader.query<{answer:string|null}>(
     'select seyeon_positive_candidate.reveal_http_r5($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) as answer',
     [subject,id.thread,id.turn,id.attempt,id.assistantMessage]);
    await waitForLock('seyeon-r5-read-after-revoke');
    await revoker.query('COMMIT');
    expect((await pending).rows[0]?.answer).toBeNull();
    await reader.query('COMMIT');
   }finally{
    await revoker.query('ROLLBACK').catch(()=>undefined);
    await reader.query('ROLLBACK').catch(()=>undefined);
   }
  }));
 });
 it('R7 real PG stale read: revoke after DB COMMIT while HTTP identity is pending never releases buffered assistant bytes',async()=>{
  const id=await committed(77);
  // Positive read is legitimate only at its own SQL COMMIT linearization
  // point. The text can remain in application memory after a later revoke.
  const staleAuthorizedBytes=await http(id);
  expect(staleAuthorizedBytes).toBe(body);
  let releaseIdentity!:()=>void;
  const pendingIdentity=new Promise<void>(resolve=>{releaseIdentity=resolve;});
  let attemptedRuntimeCalls=0;
  const pendingHttp=handleSeyeonChatTurnSendRequestV1({
    request:new Request('https://myeongha.internal/api/chat/'+id.thread+'/turns',{
      method:'POST',
      headers:{authorization:'Bearer synthetic-member', 'content-type':'application/json'},
      body:JSON.stringify({
        clientTurnId:'423e4567-e89b-42d3-a456-426614174077',
        text:'합성 대화',
      }),
    }),
    requestId:'r7-late-transport-after-revoke',
    serverTime:'2026-10-18T00:00:00.000Z',
    identityEvidenceVerifier:{
      verifyRequestIdentity:async()=>{
        await pendingIdentity;
        return Object.freeze({kind:'member' as const,verifiedAuthUserId:'synthetic-member'});
      },
    },
    runtime:{run:async()=>{
      attemptedRuntimeCalls+=1;
      // An accidentally connected legacy replay would use stale bytes.
      return {execution:{disposition:'committed_replay',assistantText:staleAuthorizedBytes}} as never;
    }},
  });
  // The HTTP request is already alive but its Member lookup has not returned.
  await transaction(async c=>{
    await c.query(
      'update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',
      [id.grant],
    );
  });
  // A fresh real DB read denies. The previously buffered bytes have NOT
  // disappeared, so DB COMMIT alone cannot prove safe late HTTP delivery.
  expect(await http(id)).toBeNull();
  expect(staleAuthorizedBytes).toBe(body);
  releaseIdentity();
  const response=await pendingHttp;
  const wire=await response.text();
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(JSON.parse(wire).error).toMatchObject({
    code:'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',
    retryable:false,
  });
  expect(attemptedRuntimeCalls).toBe(0);
  expect(wire).not.toContain(body);
  expect(wire).not.toContain(id.assistantMessage);
  expect(wire).not.toContain(id.attempt);
 });

 it('reader-first holds Subject lock until read COMMIT; later revoke prevents every fresh replay',async()=>{
  const id=await committed(76);
  await clientAction(reader=>clientAction(async revoker=>{
    await reader.query('BEGIN');
    try{
      await executor(reader);
      const first=await reader.query<{answer:string|null}>(
        'select seyeon_positive_candidate.reveal_http_r5($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) as answer',
        [subject,id.thread,id.turn,id.attempt,id.assistantMessage]);
      expect(first.rows[0]?.answer).toBe(body);
      await revoker.query('BEGIN');
      await revoker.query("set local application_name='seyeon-r5-revoke-after-read'");
      const pending=revoker.query('select id from public.subjects where id=$1::uuid for update',[subject]);
      await waitForLock('seyeon-r5-revoke-after-read');
      await reader.query('COMMIT');
      await pending;
      await revoker.query('update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',[id.grant]);
      await revoker.query('COMMIT');
    }finally{
      await reader.query('ROLLBACK').catch(()=>undefined);
      await revoker.query('ROLLBACK').catch(()=>undefined);
    }
  }));
  expect(await http(id)).toBeNull();
  await expect(history(id)).rejects.toMatchObject({constraint:'seyeon_offline_r5_page_held'});
 });

  it.each([
    { route: 'rewrite', fixture: 78 },
    { route: 'direct-alias', fixture: 79 },
  ])('R9 actual PostgreSQL revoke after authorized DB read but before real HTTP send: $route still returns 503 without assistant bytes', async ({ route, fixture }) => {
    const id = await committed(fixture);
    // Authoritative original Grant, original Record, and attempt are genuinely
    // checked by the disposable DB. This successful SELECT is NOT a send permit.
    const staleText = await http(id);
    expect(staleText).toBe(body);

    let ready!: () => void;
    let allowSend!: () => void;
    const responsePrepared = new Promise<void>(resolve => { ready = resolve; });
    const sendGate = new Promise<void>(resolve => { allowSend = resolve; });
    let runtimeCalls = 0;
    await withR9Loopback(async (incoming, outgoing) => {
      const rawBody = await r9ReadBody(incoming);
      const source = new Request('http://127.0.0.1' + incoming.url, {
        method: 'POST',
        headers: {
          authorization: String(incoming.headers.authorization ?? ''),
          'content-type': 'application/json',
          'x-seyeon-reveal-authorized': String(incoming.headers['x-seyeon-reveal-authorized'] ?? ''),
        },
        body: rawBody,
      });
      const target = resolveMeDispatchTargetForTestV1(source);
      expect(target).toMatchObject({ kind: 'chat-turn-send', threadId: id.thread });
      const canonical = toCanonicalMeRequestForTestV1(source, target ?? undefined);
      const held = await handleSeyeonChatTurnSendRequestV1({
        request: canonical,
        requestId: 'r9-real-pg-delayed-send-' + route,
        serverTime: '2026-10-18T00:00:00.000Z',
        identityEvidenceVerifier: {
          verifyRequestIdentity: async () => Object.freeze({
            kind: 'member' as const, verifiedAuthUserId: 'r9-offline-synthetic',
          }),
        },
        runtime: {
          run: async () => {
            ++runtimeCalls;
            return {
              execution: { disposition: 'committed_replay', assistantText: staleText },
            } as never;
          },
        },
      });
      ready(); // Web Response prepared; no HTTP headers or bytes yet.
      await sendGate;
      await r9WriteResponse(outgoing, held);
    }, async origin => {
      const path = route === 'rewrite'
        ? '/api/me?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id=' + id.thread
        : '/api/chat/' + id.thread + '/turns?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id=' + id.thread;
      const pending = fetch(origin + path, {
        method: 'POST',
        headers: {
          authorization: 'Bearer r9-synthetic',
          'content-type': 'application/json',
          'x-seyeon-reveal-authorized': 'true',
        },
        body: JSON.stringify({
          clientTurnId: '423e4567-e89b-42d3-a456-426614174078', text: '합성 요청',
        }),
      });
      try {
        await responsePrepared;
        // Real PostgreSQL revoke COMMIT between response construction (V-like)
        // and network socket write (S). Regrant is NOT permitted to rescue it.
        await transaction(c => c.query(
          'update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',
          [id.grant],
        ));
        expect(await http(id)).toBeNull();
        await expect(history(id)).rejects.toMatchObject({ constraint: 'seyeon_offline_r5_page_held' });
        // Product-approved separation: revoke future use/reveal, but DO NOT
        // secretly delete the historical stored conversation on mere revoke.
        const retained = await saved(id);
        expect(retained.messages).toBe('1');
        expect(retained.admissions).toBe('1');
        expect(retained.turn_state).toBe('committed');
        expect(staleText).toBe(body); // bytes survive in application memory
        allowSend();
        const received = await pending;
        const wire = await received.text();
        expect(received.status).toBe(503);
        expect(received.headers.get('cache-control')).toBe('no-store');
        expect(received.headers.get('content-type')).not.toContain('text/event-stream');
        expect(wire).toContain('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
        expect(wire).not.toContain(staleText);
        expect(wire).not.toContain(id.grant);
        expect(wire).not.toContain(id.assistantMessage);
        expect(runtimeCalls).toBe(0);

        // Revocation must also block a second request for the same logical
        // turn; neither replay nor a caller-supplied "authorized" header
        // restores an old original Grant after the first failed HTTP send.
        const repeated = await fetch(origin + path, {
          method: 'POST',
          headers: {
            authorization: 'Bearer r9-synthetic',
            'content-type': 'application/json',
            'x-seyeon-reveal-authorized': 'true',
          },
          body: JSON.stringify({
            clientTurnId: '423e4567-e89b-42d3-a456-426614174078', text: '합성 요청',
          }),
        });
        const repeatWire = await repeated.text();
        expect(repeated.status).toBe(503);
        expect(repeated.headers.get('cache-control')).toBe('no-store');
        expect(repeatWire).not.toContain(staleText);
        expect(runtimeCalls).toBe(0);
      } finally {
        allowSend();
      }
    });
  });

  it('R9 actual PostgreSQL stale-read counterexample: synthetic unsafe HTTP buffer sends after the original Grant is revoked', async () => {
    const id = await committed(80);
    let prepared!: () => void;
    let releaseSocket!: () => void;
    const responsePrepared = new Promise<void>(resolve => { prepared = resolve; });
    const sendGate = new Promise<void>(resolve => { releaseSocket = resolve; });

    await withR9Loopback(async (request, response) => {
      await r9ReadBody(request);
      // Intentionally UNSAFE synthetic bridge, never used by Production routing.
      // Proves that a successful real DB SELECT doesn't govern HTTP wire timing.
      const original = await http(id);
      expect(original).toBe(body);
      const buffered = Response.json({ assistantText: original });
      prepared();
      await sendGate;
      await r9WriteResponse(response, buffered);
    }, async origin => {
      const pending = fetch(origin + '/unsafe-synthetic-only', {
        method: 'POST', body: 'synthetic',
      });
      try {
        await responsePrepared;
        await transaction(c => c.query(
          'update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',
          [id.grant],
        ));
        expect(await http(id)).toBeNull(); // current rights correctly rejected
        releaseSocket();
        const received = await pending;
        const wire = await received.text();
        expect(received.status).toBe(200);
        expect(wire).toContain(body); // deliberate counterexample, not G3 success
      } finally {
        releaseSocket();
      }
    });
  });


  it('R24 real G2 committed receipt to Node G3: first only; replay closes socket without DB read even after regrant', async () => {
    const id=await committed(83); // Existing R3 actual v2 with 2 Outboxes.
    const g2Receipt:SeyeonR23OfflineG2CommitReceiptV1={
      status:'disposable_atomic_v2_committed',
      turnId:id.turn,attemptId:id.attempt,
      assistantMessageId:id.assistantMessage,
      postTurnOutboxEventId:id.postOutbox,
      replayed:false,permitsProvider:false,permitsHttpReveal:false,
    };
    const result=async(purpose:'first'|'committed_replay',expected:'assistant_sent'|'reveal_held')=>{
      let observed:{status:number;cache:string|null;wire:string}|null=null;
      let replayDbConnections=0;
      await withR9Loopback(async(req,response)=>{
        await r9ReadBody(req);
        const attempt=sendSeyeonR24OfflineG3V1({
          receipt:g2Receipt,
          pool:purpose==='committed_replay'?{
            async connect(){
              replayDbConnections++;
              throw Error('Replay must never open a protected DB read');
            },
          }:offlineOriginalGrantPgPool,
          verifiedEvidence:{kind:'member',verifiedAuthUserId:offlineMemberId},
          threadId:id.thread,response,
          requestSignal:new AbortController().signal,
          purpose,deadlineMs:9_000,
          metadata:{
            turnId:id.turn,assistantMessageId:id.assistantMessage,
            sequenceNo:2,replayed:purpose==='committed_replay',
            requestId:'r24-synthetic-'+purpose,
            serverTime:'2026-10-19T00:00:00.000Z',
          },
        });
        if(purpose==='committed_replay'){
          await expect(attempt).rejects.toThrow(/Replayed Seyeon turns/u);
          expect(response.destroyed).toBe(true);
        }else{
          expect(await attempt).toBe(expected);
        }
      },async origin=>{
        const request=fetch(origin+'/r24-offline-g2-to-g3',{
          method:'POST',body:'synthetic-only',
        });
        if(purpose==='committed_replay'){
          await expect(request).rejects.toThrow();
          return;
        }
        const received=await request;
        observed={
          status:received.status,
          cache:received.headers.get('cache-control'),
          wire:await received.text(),
        };
      });
      expect(replayDbConnections).toBe(0);
      if(purpose==='committed_replay')return {status:0,cache:null,wire:''};
      if(observed===null)throw Error('R24 missing Node loopback delivery');
      return observed as {status:number;cache:string|null;wire:string};
    };
    const first=await result('first','assistant_sent');
    expect(first.status).toBe(200);
    expect(first.cache).toBe('no-store');
    expect(first.wire).toContain(body);
    expect(first.wire).toContain('"replayed":false');
    const replay=await result('committed_replay','reveal_held');
    expect(replay).toEqual({status:0,cache:null,wire:''});
    await transaction(async c=>{
      await c.query('update public.record_access_grants set revoked_at=clock_timestamp() where id=$1::uuid',[id.grant]);
      await c.query(
        "insert into public.record_access_grants(id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at) values($1::uuid,$2::uuid,null,$3::uuid,'seyeon','user_choice',clock_timestamp(),null)",
        ['d6000000-0000-4000-8000-000000000183',subject,id.memory],
      );
    });
    const denied=await result('committed_replay','reveal_held');
    expect(denied).toEqual({status:0,cache:null,wire:''});
    await expect(history(id)).rejects.toMatchObject({
      constraint:'seyeon_offline_r5_page_held',
    });
    expect(await saved(id)).toMatchObject({
      messages:'1',outboxes:'2',admissions:'1',
    });

    // Invalid post-Commit metadata must not even connect to PostgreSQL or
    // write socket headers. Client-forged G2 receipts grant NO authority.
    await withR9Loopback(async(req,response)=>{
      await r9ReadBody(req);
      let attemptedConnections=0;
      await expect(sendSeyeonR24OfflineG3V1({
        receipt:{...g2Receipt,assistantMessageId:'d8300000-0000-4000-8000-000000000099'},
        pool:{connect:async()=>{
          attemptedConnections++;
          throw Error('must never open DB for malformed G2 receipt');
        }},
        verifiedEvidence:{kind:'member',verifiedAuthUserId:offlineMemberId},
        threadId:id.thread,response,
        requestSignal:new AbortController().signal,
        purpose:'first',
        metadata:{
          turnId:id.turn,assistantMessageId:id.assistantMessage,
          sequenceNo:2,replayed:false,requestId:'r24-forged',
          serverTime:'2026-10-19T00:00:00.000Z',
        },
      })).rejects.toBeInstanceOf(SeyeonR24OfflineG3HoldV1);
      expect(attemptedConnections).toBe(0);
      expect(response.headersSent).toBe(false);
      response.statusCode=503;
      response.setHeader('cache-control','no-store');
      response.end('R24_OFFLINE_HOLD');
    },async origin=>{
      const r=await fetch(origin+'/r24-forged',{method:'POST',body:'synthetic'});
      expect(r.status).toBe(503);
      expect(await r.text()).toBe('R24_OFFLINE_HOLD');
    });
  });

  it('R10 send-first: real PG original-rights lock covers Node socket finish before revoke DB COMMIT', async () => {
    const id = await committed(81);
    const events: string[] = [];
    let authorized!: () => void;
    let permitSocket!: () => void;
    const authorizedAndHeld = new Promise<void>(resolve => { authorized = resolve; });
    const sendGate = new Promise<void>(resolve => { permitSocket = resolve; });
    let socketWrites = 0;

    await withR9Loopback(async (request, response) => {
      await r9ReadBody(request);
      // Candidate-only direct Node bridge: unlike Web Response construction,
      // the actual HTTP send occurs before releasing this DB transaction's
      // original Subject/Grant SHARE locks.
      const outcome = await sendSeyeonNodeOriginalGrantResponseV1({
        response,
        requestSignal: new AbortController().signal,
        deadlineMs: 9_000,
        withLockedOriginalGrant: async ({ signal, deliver }) => {
          const lockedRead = createSeyeonOriginalGrantPgSendAdapterV1({
            pool: offlineOriginalGrantPgPool,
            verifiedEvidence: {kind:'member',verifiedAuthUserId:offlineMemberId},
            threadId:id.thread,turnId:id.turn,
            committedAttemptId:id.attempt,
            committedAssistantMessageId:id.assistantMessage,
          });
          await lockedRead({
            signal,
            deliver: async value => {
              expect(value).toBe(body);
              authorized();
              await sendGate;
              // REAL original Grant locks remain in the R13 transaction until
              // R11's Node socket finish. No untrusted Subject/Attempt override.
              await deliver(value);
              socketWrites += 1;
              events.push('S:node-finish');
            },
          });
        },
      });
      expect(outcome).toBe('assistant_sent');
    }, async origin => {
      const pendingResponse = fetch(origin + '/r10-db-locked-send-first', {
        method: 'POST', body: 'synthetic offline only',
      });
      try {
        await authorizedAndHeld;
        await clientAction(async revoker => {
          await revoker.query('BEGIN');
          try {
            await revoker.query("set local application_name='seyeon-r10-revoke-after-sender'");
            // Exercise the ACTUAL Memory Grant revoke RPC. It must acquire
            // Subject FOR UPDATE itself, not a test-only manual lock.
            const pendingRevoke = revoker.query<{
              revoked_grant_count: number;
            }>(
              'select revoked_grant_count from public.cmd_revoke_memory_character_grant_v1($1::uuid,$2::uuid,$3::text)',
              [subject, id.memory, 'seyeon'],
            );
            await waitForLock('seyeon-r10-revoke-after-sender');
            expect(events).toEqual([]);
            permitSocket();
            const revoked = await pendingRevoke;
            expect(revoked.rows[0]?.revoked_grant_count).toBe(1);
            await revoker.query('COMMIT'); // R; ACK would follow this.
            events.push('R:committed');
          } finally {
            await revoker.query('ROLLBACK').catch(() => undefined);
          }
        });
        const received = await pendingResponse;
        expect(received.status).toBe(200);
        expect(received.headers.get('cache-control')).toBe('no-store');
        expect(await received.text()).toContain(body);
        expect(events).toEqual(['S:node-finish', 'R:committed']);
        expect(socketWrites).toBe(1);
      } finally {
        permitSocket();
      }
    });

    // Once revocation commits, every new current-rights check denies. The
    // historical message stays stored but cannot be re-disclosed by R5.
    expect(await http(id)).toBeNull();
    await expect(history(id)).rejects.toMatchObject({
      constraint: 'seyeon_offline_r5_page_held',
    });
    expect((await saved(id)).messages).toBe('1');
  });

  it('R10 revoke-first: independent PG revoke blocks HTTP authorization, releases 503 only', async () => {
    const id = await committed(82);
    let socketWrites = 0;
    let startedRead!: () => void;
    const readStarted = new Promise<void>(resolve => { startedRead = resolve; });

    await clientAction(async revoker => {
      await revoker.query('BEGIN');
      try {
        // Same production-source SECURITY INVOKER revoke RPC; it obtains the
        // Subject update lock and changes ONLY the original Se-yeon Grant.
        const revoked = await revoker.query<{
          revoked_grant_count: number;
        }>(
          'select revoked_grant_count from public.cmd_revoke_memory_character_grant_v1($1::uuid,$2::uuid,$3::text)',
          [subject, id.memory, 'seyeon'],
        );
        expect(revoked.rows[0]?.revoked_grant_count).toBe(1);
        await withR9Loopback(async (request, response) => {
          await r9ReadBody(request);
          const outcome = await sendSeyeonNodeOriginalGrantResponseV1({
            response,
            requestSignal: new AbortController().signal,
            deadlineMs: 9_000,
            withLockedOriginalGrant: async ({ deliver }) => transaction(async reader => {
              await reader.query("set local application_name='seyeon-r10-wait-for-revoke'");
              startedRead();
              const current = await reader.query<{ answer: string | null }>(
                'select seyeon_positive_candidate.reveal_http_r5($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) as answer',
                [subject, id.thread, id.turn, id.attempt, id.assistantMessage],
              );
              expect(current.rows[0]?.answer).toBeNull();
              await deliver(null);
              socketWrites += 1;
            }, true),
          });
          expect(outcome).toBe('reveal_held');
        }, async origin => {
          const pendingResponse = fetch(origin + '/r10-db-locked-revoke-first', {
            method: 'POST', body: 'synthetic offline only',
          });
          await readStarted;
          await waitForLock('seyeon-r10-wait-for-revoke');
          // In this ordering the original Grant is already revoked before
          // the second session can make its current-rights decision.
          await revoker.query('COMMIT');
          const received = await pendingResponse;
          const bytes = await received.text();
          expect(received.status).toBe(503);
          expect(received.headers.get('cache-control')).toBe('no-store');
          expect(bytes).not.toContain(body);
          expect(bytes).toContain('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
        });
      } finally {
        await revoker.query('ROLLBACK').catch(() => undefined);
      }
    });
    expect(socketWrites).toBe(1); // One denied HTTP error, zero private bodies.
    expect(await http(id)).toBeNull();
    await expect(history(id)).rejects.toMatchObject({
      constraint: 'seyeon_offline_r5_page_held',
    });
    expect((await saved(id)).messages).toBe('1');
  });


  it('R25 REAL PG two senders: first original Node socket consumes Turn once; second waits and cannot reveal',async()=>{
    const id=await committed(93);
    let firstLocked!:()=>void;
    let allowNodeFinish!:()=>void;
    const firstHasDbRights=new Promise<void>(resolve=>{firstLocked=resolve;});
    const allowSend=new Promise<void>(resolve=>{allowNodeFinish=resolve;});
    const events:string[]=[];
    await withR9Loopback(async(request,response)=>{
      await r9ReadBody(request);
      const outcome=await sendSeyeonNodeOriginalGrantResponseV1({
        response,requestSignal:new AbortController().signal,
        deadlineMs:9_000,
        withLockedOriginalGrant:async({signal,deliver})=>{
          await transaction(async c=>{
            const text=await firstOnceR25(c,id);
            expect(text).toBe(body);
            firstLocked();
            await allowSend;
            if(signal.aborted)throw Error('R25 first sender aborted');
            await deliver(text);
            events.push('first-node-finish');
            if(signal.aborted)throw Error('R25 first sender aborted after finish');
          },true);
          events.push('first-db-commit');
        },
      });
      expect(outcome).toBe('assistant_sent');
    },async origin=>{
      const pending=fetch(origin+'/r25-first-one-shot',{
        method:'POST',body:'disposable R25 private Memory only',
      });
      try{
        await firstHasDbRights;
        await clientAction(async other=>{
          await other.query('BEGIN');
          try{
            await executor(other);
            await other.query("set local application_name='seyeon-r25-second-first-send'");
            const competing=firstOnceR25(other,id);
            await waitForLock('seyeon-r25-second-first-send');
            expect(events).toEqual([]);
            // A THIRD independent PostgreSQL session now tries the real
            // original Memory revoke while A holds the send authority.
            // It must not COMMIT revocation before A's Node 'finish'.
            await clientAction(async revoker=>{
              await revoker.query('BEGIN');
              try{
                await revoker.query("set local application_name='seyeon-r25-revoke-after-first-send'");
                const revoking=revoker.query<{revoked_grant_count:number}>(
                  'select revoked_grant_count from public.cmd_revoke_memory_character_grant_v1($1::uuid,$2::uuid,$3::text)',
                  [subject,id.memory,'seyeon'],
                );
                await waitForLock('seyeon-r25-revoke-after-first-send');
                expect(events).toEqual([]);
                allowNodeFinish();
                // B was already queued on the exclusive Turn lock. After
                // A commits delivered, B can only read NULL and releases its
                // Subject SHARE, allowing revoke to finish afterwards.
                expect(await competing).toBeNull();
                await other.query('COMMIT');
                const revoked=await revoking;
                expect(revoked.rows[0]?.revoked_grant_count).toBe(1);
                await revoker.query('COMMIT');
                events.push('revoke-committed');
              }finally{
                await revoker.query('ROLLBACK').catch(()=>undefined);
              }
            });
          }finally{
            await other.query('ROLLBACK').catch(()=>undefined);
          }
        });
        const response=await pending;
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.text()).toContain(body);
        expect(events).toEqual(['first-node-finish','first-db-commit','revoke-committed']);
      }finally{
        allowNodeFinish();
      }
    });
    expect((await saved(id)).turn_state).toBe('delivered');
    expect(await transaction(c=>firstOnceR25(c,id),true)).toBeNull();
    expect((await saved(id)).messages).toBe('1');
    expect((await saved(id)).outboxes).toBe('2');
    // A future use of that once-valid Memory Grant is revoked and cannot
    // create another independent positive response after delivery.
    expect(await http(id)).toBeNull();
  });

  it('R25 REAL PG revoke-first blocks Node first send before private bytes and preserves unused Turn',async()=>{
    const id=await committed(95);
    let readStarted!:()=>void;
    const started=new Promise<void>(resolve=>{readStarted=resolve;});

    await clientAction(async revoker=>{
      await revoker.query('BEGIN');
      try{
        const revoke=await revoker.query<{revoked_grant_count:number}>(
          'select revoked_grant_count from public.cmd_revoke_memory_character_grant_v1($1::uuid,$2::uuid,$3::text)',
          [subject,id.memory,'seyeon'],
        );
        expect(revoke.rows[0]?.revoked_grant_count).toBe(1);

        await withR9Loopback(async(request,response)=>{
          await r9ReadBody(request);
          const outcome=await sendSeyeonNodeOriginalGrantResponseV1({
            response,requestSignal:new AbortController().signal,
            deadlineMs:9_000,
            withLockedOriginalGrant:async({deliver})=>transaction(async reader=>{
              await reader.query("set local application_name='seyeon-r25-revoke-first'");
              readStarted();
              const reply=await firstOnceR25(reader,id);
              expect(reply).toBeNull();
              await deliver(null);
            },true),
          });
          expect(outcome).toBe('reveal_held');
        },async origin=>{
          const pending=fetch(origin+'/r25-revoke-first',{
            method:'POST',body:'disposable R25 revocation race only',
          });
          await started;
          await waitForLock('seyeon-r25-revoke-first');
          await revoker.query('COMMIT');
          const response=await pending;
          const wire=await response.text();
          expect(response.status).toBe(503);
          expect(response.headers.get('cache-control')).toBe('no-store');
          expect(wire).not.toContain(body);
          expect(wire).toContain('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
        });
      }finally{
        await revoker.query('ROLLBACK').catch(()=>undefined);
      }
    });
    expect((await saved(id)).turn_state).toBe('committed');
    expect(await transaction(c=>firstOnceR25(c,id),true)).toBeNull();
    expect((await saved(id)).messages).toBe('1');
  });

  it('R25 failed send rolls back consumed Turn so a later original first send can retry once',async()=>{
    const id=await committed(94);
    // Same real Turn/Attempt/Assistant but forged G2 original receipt locator:
    // do not consume a legitimate first Reply on false G2 evidence.
    expect(await transaction(c=>firstOnceR25(c,{
      ...id,userMessage:ids(96).userMessage,
    }),true)).toBeNull();
    expect(await transaction(c=>firstOnceR25(c,{
      ...id,postOutbox:ids(96).postOutbox,
    }),true)).toBeNull();
    expect((await saved(id)).turn_state).toBe('committed');
    await expect(transaction(async c=>{
      expect(await firstOnceR25(c,id)).toBe(body);
      // Synthetic socket failure before finish: DB delivery transition
      // must not survive an uncommitted/rolled-back original-rights Tx.
      throw Error('R25 simulated socket disconnect before Node finish');
    },true)).rejects.toThrow('R25 simulated socket disconnect');
    expect((await saved(id)).turn_state).toBe('committed');
    expect(await transaction(c=>firstOnceR25(c,id),true)).toBe(body);
    expect((await saved(id)).turn_state).toBe('delivered');
    expect(await transaction(c=>firstOnceR25(c,id),true)).toBeNull();
  });

});
