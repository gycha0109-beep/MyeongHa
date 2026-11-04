// Real PG17/HTTP/receipt path; synthetic identities and output, no inference.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {canonicalJson} from '../packages/domain/src/index.js';
import {createSeyeonAttemptZeroPersonalProofV1} from '../apps/api/src/seyeon-attempt-zero-personal-proof-v1.js';
import {selectSeyeonExactModelPersonalSourcesV1} from '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';
import {executePostgresSubjectTransactionV1,type PostgresSubjectPoolV1} from '../apps/api/src/postgres-subject-execution.js';
import {handleSeyeonFirstPositiveMemoryFetchV1,handleSeyeonPositiveReplyReceiptV1} from '../apps/api/src/seyeon-first-positive-memory-fetch-delivery-v1.js';
import {recoverSeyeonUnissuedZeroReplyV1} from '../apps/api/src/seyeon-unissued-zero-reply-recovery-v1.js';
import {MyeongHaApiClientV1,sendSeyeonChatTurnV1} from '../packages/api-client/src/index.js';

const enabled=process.env.SEYEON_SECURITY_S0_REAL_PG==='1';
const read=(file:string)=>readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/\r\n/gu,'\n');
const operation=(name:string)=>read('scripts/operations/seyeon-security-s0/'+name);
const uuid=(part:number,n:number)=>`a8${part}0000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const hash=(value:unknown)=>'sha256:v1:'+createHash('sha256').update(canonicalJson(value)).digest('hex');

describe.skipIf(!enabled)('PG17 first issuance recovery with preserved abandoned User',()=>{
  let pool:Pool;
  let subjectPool:PostgresSubjectPoolV1;
  beforeAll(async()=>{
    const db=process.env.PGDATABASE??'';
    if(!['localhost','127.0.0.1','::1'].includes(process.env.PGHOST??'')||
       !(db==='myeongha_seyeon_receipt_recovery_test'||
         (process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true'&&process.env.DB_SUITE==='postgres17'&&/^myeongha_ci_case_[0-9]+$/u.test(db))))
      throw Error('Receipt tests require the named disposable local PG database.');
    pool=new Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT??5432),
      user:'postgres',database:db,password:process.env.PGPASSWORD,ssl:false,max:4,statement_timeout:5000});
    subjectPool=pool as unknown as PostgresSubjectPoolV1;
    // Install the unchanged existing G1 functional rewrite blocks in the
    // scratch bootstrap-superuser DB. Managed Production operator membership
    // is not simulated here; operation 25 below is tested in its entirety.
    for(const [file,block] of [
      ['production-17-zero-source-selection-census-pin-20261101.sql','replace'],
      ['production-18-zero-source-current-user-pin-20261101.sql','change'],
    ]){
      const source=operation(file!);
      const begin=source.indexOf('do $'+block+'$');
      const end=source.indexOf('$'+block+'$;',begin)+block!.length+4;
      if(begin<0||end<begin)throw Error('Existing G1 functional source unavailable');
      await pool.query(source.slice(begin,end));
    }
    await pool.query(operation('16-zero-source-http-receipt-issuer.sql'));
    await pool.query('grant execute on function seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text) to myeongha_api_executor');
  },30000);
  afterAll(async()=>{await pool?.end();});

  async function prepare(n:number,oldState='abandoned'){
    const subject=uuid(11,n),thread=uuid(14,n),turn=uuid(16,n),attempt=uuid(17,n),user=uuid(18,n);
    const evidence={kind:'member' as const,verifiedAuthUserId:uuid(10,n)};
    const text='Synthetic first hello';
    const baseline=read('test/db/seyeon_first_zero_locked_reveal_disposable_pg17.sql')
      .replace(/^\\set.*$/gmu,'').replaceAll('000000000001',String(n).padStart(12,'0'))
      .replaceAll('first-zero-test-v1','receipt-recovery-'+n).replaceAll('first-zero-test-release','receipt-recovery-release-'+n)
      .replaceAll('first-zero-disposable-v1',uuid(30,n))
      .replaceAll("repeat('a',64)","'"+createHash('sha256').update('receipt-content-'+n).digest('hex')+"'");
    const start=baseline.indexOf('select public.cmd_mark_seyeon_chat_context_ready_pinned_v1(');
    const end=baseline.indexOf('\n);\nCOMMIT;',start)+'\n);'.length;
    if(start<0||end<start)throw Error('Original PG fixture Pin phase unavailable');
    const client=await pool.connect();
    try{
      await client.query(baseline.slice(0,start));
      await client.query('select public.cmd_mark_seyeon_chat_context_ready_pinned_v1($1,$2,$3,$4::jsonb)',[
        subject,turn,attempt,JSON.stringify({
          zeroProof:createSeyeonAttemptZeroPersonalProofV1({subjectId:subject,threadId:thread,turnId:turn,attemptId:attempt,
            context:{version:'seyeon-production-context-v1',retrievedMemories:[],personalRecordAdmissions:[],personalRecordProjectionCandidates:[]}}),
          exactModelSourceSelection:selectSeyeonExactModelPersonalSourcesV1({retrievedMemories:[],sourceCandidates:[],
            requiredPersonalRecordCount:0,recentMessages:[{messageId:user,role:'user',text}],currentUserMessageId:user}),
        })]);
      await client.query(baseline.slice(end));
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    // Synthetic failed-record fixture only; retain its real table constraints.
    await pool.query(`insert into public.chat_turns(id,thread_id,subject_id,client_turn_id,request_hash,request_contract_version,
      request_snapshot_jsonb,resolved_content_release_id,resolved_content_bundle_id,state,revision,next_attempt_no,created_at,updated_at)
      select $2,thread_id,subject_id,$3,'sha256:v1:'||repeat('9',64),request_contract_version,
        '{}'::jsonb,resolved_content_release_id,resolved_content_bundle_id,$4,0,1,created_at-interval '1 day',created_at
      from public.chat_turns where id=$1`,[turn,uuid(36,n),uuid(37,n),oldState]);
    await pool.query(`insert into public.conversation_messages(id,thread_id,subject_id,turn_id,sequence_no,sender_type,body_text,message_payload_jsonb,
        message_schema_version,content_hash,created_at)
      select $3,thread_id,subject_id,$2,3,'user','Abandoned synthetic greeting','{}'::jsonb,'v1',
        'sha256:v1:'||repeat('8',64),created_at-interval '1 day' from public.chat_turns where id=$1`,
      [turn,uuid(36,n),uuid(38,n)]);
    const run=<T>(action:Parameters<typeof executePostgresSubjectTransactionV1<T>>[0]['execute'])=>
      executePostgresSubjectTransactionV1({pool:subjectPool,verifiedEvidence:evidence,execute:action});
    return {subject,thread,turn,attempt,evidence,text,run};
  }

  it('reproduces the old three-row denial, then returns the original HTTP reply without running the model',async()=>{
    const f=await prepare(90);
    const denied=await f.run(({client})=>client.query(`select * from public.cmd_issue_seyeon_zero_source_first_reply_v1(
      $1,$2,$3,$4,$5,$6,$7,$8,decode(repeat('a',64),'hex'))`,[
      f.subject,f.thread,f.turn,f.attempt,uuid(18,90),uuid(19,90),uuid(23,90),uuid(30,90)]));
    expect(denied.rows).toHaveLength(0);
    await pool.query(operation('production-25-unissued-zero-receipt-recovery-20261103.sql'));
    await pool.query(operation('production-27-g0-committed-followup-receipt-20261105.sql'));
    const runtime=vi.fn(async()=>{throw Error('A committed reply must never invoke inference.');});
    const recover=()=>recoverSeyeonUnissuedZeroReplyV1({pool:subjectPool,verifiedEvidence:f.evidence,threadId:f.thread,
      text:f.text,signal:new AbortController().signal,requestId:'repeat',serverTime:new Date().toISOString()});
    const calls:string[]=[];
    const client=new MyeongHaApiClientV1({origin:'https://receipt.test',fetchImpl:async(url,init)=>{
      const request=new Request(String(url),init);
      calls.push(new URL(request.url).pathname);
      if(request.url.endsWith('/turns')){
        const response=await handleSeyeonFirstPositiveMemoryFetchV1({request,
          requestId:'synthetic-recovery',serverTime:new Date().toISOString(),pool:subjectPool,
          identityEvidenceVerifier:{verifyRequestIdentity:async()=>f.evidence},runtime:{run:runtime},zeroSourceFirstReplyApproved:true});
        expect(response.status).toBe(200);
        expect(await recover()).toBeNull();
        return response;
      }
      return handleSeyeonPositiveReplyReceiptV1({pool:subjectPool,requestId:'synthetic-ack',request});
    }});
    const reply=await sendSeyeonChatTurnV1(client,'synthetic-member',f.thread,
      {clientTurnId:uuid(39,90),text:f.text},{requireDeliveryReceipt:true});
    expect(reply).toMatchObject({turnId:f.turn,assistantMessageId:uuid(19,90),replayed:false,
      assistantText:'DB_LOCKED_ZERO_SOURCE_SYNTHETIC_OK'});
    expect(reply).not.toHaveProperty('deliveryReceipt');
    expect(runtime).not.toHaveBeenCalled();
    expect(calls).toEqual([`/api/chat/${f.thread}/turns`,`/api/chat/delivery-receipts/${f.attempt}`]);
    expect((await pool.query('select count(*)::int as n from public.conversation_messages where thread_id=$1',[f.thread])).rows[0].n).toBe(3);
    expect((await pool.query('select state from public.chat_turns where id=$1',[f.turn])).rows[0].state).toBe('delivered');
    expect(await recover()).toBeNull();
  },30000);


  it('permits a verified zero-source assistant as previous-turn context without broadening table grants',async()=>{
    // The preceding test already delivered the first zero-source reply.
    const subject=uuid(11,90),thread=uuid(14,90);
    const oldTurn=uuid(16,90),nextTurn=uuid(46,90),nextUser=uuid(48,90);
    await pool.query(
      "insert into public.chat_turns(id,thread_id,subject_id,client_turn_id,request_hash,request_contract_version,request_snapshot_jsonb,resolved_content_release_id,resolved_content_bundle_id,state,revision,next_attempt_no,created_at,updated_at) "+
      "select $2,thread_id,subject_id,$3,'sha256:v1:'||repeat('3',64),request_contract_version,'{}'::jsonb,resolved_content_release_id,resolved_content_bundle_id,'received',0,1,clock_timestamp(),clock_timestamp() from public.chat_turns where id=$1",
      [oldTurn,nextTurn,uuid(47,90)]);
    await pool.query(
      "insert into public.conversation_messages(id,thread_id,subject_id,turn_id,sequence_no,sender_type,body_text,message_payload_jsonb,message_schema_version,content_hash,created_at) "+
      "select $2,thread_id,subject_id,$3,4,'user','Synthetic continued hello','{}'::jsonb,'v1','sha256:v1:'||repeat('4',64),clock_timestamp() from public.chat_turns where id=$1",
      [oldTurn,nextUser,nextTurn]);
    const context=()=>executePostgresSubjectTransactionV1({
      pool:subjectPool,
      verifiedEvidence:{kind:'member' as const,verifiedAuthUserId:uuid(10,90)},
      execute:({client,resolvedSubject})=>client.query<{messageId:string;senderType:string}>(
        'select message_id::text as "messageId",sender_type as "senderType" from public.qry_seyeon_g0_current_source_recent_messages_v1($1::uuid,$2::uuid,$3::uuid,10)',
        [resolvedSubject.subjectId,thread,nextUser]),
    });
    await expect(context()).rejects.toMatchObject({code:'42501'});
    await pool.query(operation('production-26-g0-followup-original-lineage-20261103.sql'));
    const result=await context();
    expect(result.rows.map(x=>x.senderType)).toEqual(['user','character','user']);
    expect(result.rows.at(-1)?.messageId).toBe(nextUser);
    const {rows:[acl]}=await pool.query(
      "select has_table_privilege('myeongha_seyeon_chat_runtime_owner','public.conversation_messages','UPDATE') as can_update, "+
      "has_function_privilege('anon','seyeon_private.lock_g0_original_message_v1(uuid,uuid,uuid,text)','EXECUTE') as anon_lock, "+
      "has_function_privilege('myeongha_seyeon_chat_runtime_owner','seyeon_private.lock_g0_original_message_v1(uuid,uuid,uuid,text)','EXECUTE') as owner_lock");
    expect(acl).toEqual({can_update:false,anon_lock:false,owner_lock:true});
    const holder=await pool.connect(),writer=await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SET LOCAL ROLE myeongha_api_executor');
      await holder.query('select subject_id from public.begin_member_subject_context_v1($1::uuid)',[uuid(10,90)]);
      await holder.query('select message_id from public.qry_seyeon_g0_current_source_recent_messages_v1($1::uuid,$2::uuid,$3::uuid,10)',[subject,thread,nextUser]);
      await writer.query('BEGIN');
      await writer.query("SET LOCAL lock_timeout='250ms'");
      await expect(writer.query('update public.conversation_messages set body_text=body_text where id=$1',[uuid(18,90)]))
        .rejects.toMatchObject({code:'55P03'});
    } finally {
      await writer.query('ROLLBACK').catch(()=>undefined);
      await holder.query('ROLLBACK').catch(()=>undefined);
      writer.release();holder.release();
    }
  },30000);

  it('rejects active failed history and changed source text, and never issues a receipt for them',async()=>{
    const f=await prepare(91,'failed_retryable');
    const base={pool:subjectPool,verifiedEvidence:f.evidence,threadId:f.thread,signal:new AbortController().signal,
      requestId:'negative',serverTime:new Date().toISOString()};
    expect(await recoverSeyeonUnissuedZeroReplyV1({...base,text:'Different synthetic user message'})).toBeNull();
    await expect(recoverSeyeonUnissuedZeroReplyV1({...base,text:f.text}))
      .rejects.toMatchObject({constraint:'seyeon_unissued_reply_source_denied'});
    expect((await pool.query('select seyeon_positive_delivery_issued_at as issued from public.chat_turn_attempts where id=$1',[f.attempt])).rows[0].issued).toBeNull();
    await expect(recoverSeyeonUnissuedZeroReplyV1({...base,text:f.text,threadId:uuid(14,90)})).rejects.toThrow();
  },30000);
});
