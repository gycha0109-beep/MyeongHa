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
    // The disposable DB must reflect the installed multi-turn G0 source
    // authority before proving a second-turn receipt. In particular, the
    // earlier 18-only fixture explicitly DENIES nonempty recent-history pins.
    // Apply the unchanged 19 and 22 function rewrites in dependency order;
    // their production-only operator role choreography is not simulated here.
    for(const [file,block] of [
      ['production-17-zero-source-selection-census-pin-20261101.sql','replace'],
      ['production-18-zero-source-current-user-pin-20261101.sql','change'],
      ['production-19-zero-source-verified-history-pin-20261101.sql','rewrite'],
      ['production-22-ignore-abandoned-g0-history-20261102.sql','patch'],
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
    // Operation 26 creates the postgres-owned protected original-message lock.
    // Production 28 fails closed unless that dependency is already installed.
    await pool.query(operation('production-26-g0-followup-original-lineage-20261103.sql'));
    await pool.query(operation('production-27-g0-committed-followup-receipt-20261105.sql'));
    await pool.query(operation('production-28-g0-followup-owner-original-user-lock-20261105.sql'));
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
    // Original-source lock-only operation 26 is installed once above,
    // before the follow-up issuer and this guarded history read.
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


  it('delivers the original second-turn G0 Assistant with zero inference and one receipt ACK',async()=>{
    const subject=uuid(11,90),thread=uuid(14,90),turn=uuid(46,90);
    const attempt=uuid(49,90),user=uuid(48,90);
    const assistant=uuid(50,90),generated=uuid(51,90),guard=uuid(52,90);
    const outbox=uuid(53,90),generatedText='DB_LOCKED_G0_FOLLOWUP_SYNTHETIC_OK';
    const currentText='Synthetic continued hello';
    const evidence={kind:'member' as const,verifiedAuthUserId:uuid(10,90)};
    const execute=(action:Parameters<typeof executePostgresSubjectTransactionV1>[0]['execute'])=>
      executePostgresSubjectTransactionV1({pool:subjectPool,verifiedEvidence:evidence,execute:action});

    // Attempt allocation belongs to the trusted DB runtime operator; the
    // HTTP executor has no direct EXECUTE grant on this internal mutation.
    const allocator=await pool.connect();
    try {
      await allocator.query('BEGIN');
      await allocator.query('select set_config($1,$2,true)', ['myeongha.subject_id',subject]);
      const allocated=await allocator.query('select * from public.cmd_allocate_chat_turn_attempt_v1($1::uuid,$2::uuid,$3::uuid,$4::text)',
        [subject,turn,attempt,'seyeon-production-chat-planner-v1']);
      expect(allocated.rows.length).toBeGreaterThan(0);
      await allocator.query('COMMIT');
    }catch(error){await allocator.query('ROLLBACK');throw error;}finally{allocator.release();}
    const recentMessages=[
      {messageId:uuid(18,90),role:'user' as const,text:'Synthetic first hello'},
      {messageId:uuid(19,90),role:'assistant' as const,text:'DB_LOCKED_ZERO_SOURCE_SYNTHETIC_OK'},
      {messageId:user,role:'user' as const,text:currentText},
    ];
    const zeroProof=createSeyeonAttemptZeroPersonalProofV1({
      subjectId:subject,threadId:thread,turnId:turn,attemptId:attempt,
      context:{version:'seyeon-production-context-v1',retrievedMemories:[],
        personalRecordAdmissions:[],personalRecordProjectionCandidates:[]},
    });
    const selected=selectSeyeonExactModelPersonalSourcesV1({
      retrievedMemories:[],sourceCandidates:[],requiredPersonalRecordCount:0,
      recentMessages,currentUserMessageId:user,
    });
    expect(selected.selectedUnpinnedRecentSources).toHaveLength(2);
    await execute(({client})=>client.query(
      'select public.cmd_mark_seyeon_chat_context_ready_pinned_v1($1::uuid,$2::uuid,$3::uuid,$4::jsonb)',
      [subject,turn,attempt,JSON.stringify({zeroProof,exactModelSourceSelection:selected})],
    ));

    const actor=await pool.connect();
    try {
      await actor.query('BEGIN');
      await actor.query('select set_config($1,$2,true)', ['myeongha.subject_id',subject]);
      await actor.query('update public.conversation_threads set next_sequence_no=5 where id=$1 and subject_id=$2',[thread,subject]);
      const log=(id:string,stage:string,output:unknown)=>actor.query(
        `insert into public.ai_execution_logs(
          id,subject_id,turn_id,turn_attempt_id,stage,provider,model,prompt_version,
          content_release_id,content_bundle_id,character_id,input_ref_jsonb,
          output_ref_jsonb,status,created_at)
          select $1::uuid,t.subject_id,t.id,$2::uuid,$3,'synthetic','offline','synthetic-v1',
            t.resolved_content_release_id,t.resolved_content_bundle_id,'seyeon','{}'::jsonb,
            $4::jsonb,'success',now()
          from public.chat_turns t where t.id=$5::uuid`,
        [id,attempt,stage,JSON.stringify(output),turn]);
      await log(generated,'renderer',{});
      await actor.query(
        'select public.cmd_mark_chat_turn_generated_v1($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb)',
        [subject,turn,attempt,generated,'synthetic-v1',uuid(15,90),generatedText,
         JSON.stringify({text:generatedText}),'v1','sha256:v1:'+'1'.repeat(64),JSON.stringify([])],
      );
      await log(guard,'output_guard',{generatedContentHash:'sha256:v1:'+'1'.repeat(64)});
      await actor.query(
        'select public.cmd_validate_chat_turn_attempt_v1($1,$2,$3,$4,$5,$6::jsonb,$7,$8)',
        [subject,turn,attempt,guard,'synthetic-output-guard-v1',
          JSON.stringify({passed:true,personalRecordProvenance:zeroProof}),true,'failed_final'],
      );
      const commit=await actor.query(
        'select * from public.cmd_commit_seyeon_chat_turn_runtime_v2($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',
        [subject,thread,turn,attempt,assistant,uuid(54,90),outbox,
         JSON.stringify({schemaVersion:'seyeon-post-turn-analysis-snapshot-v1',
           turnId:turn,userMessageId:user,assistantMessageId:assistant}),
         'sha256:v1:'+'2'.repeat(64)]);
      expect(commit.rows).toHaveLength(1);
      await actor.query('COMMIT');
    }catch(error){await actor.query('ROLLBACK');throw error;}finally{actor.release();}

    const {rows:[before]}=await pool.query(
      'select state,delivered_at from public.chat_turns where id=$1',[turn]);
    expect(before).toEqual({state:'committed',delivered_at:null});
    const {rows:[original]}=await pool.query(
      'select seyeon_positive_delivery_issued_at as issued, seyeon_positive_delivery_received_at as received from public.chat_turn_attempts where id=$1',[attempt]);
    expect(original).toEqual({issued:null,received:null});
    // Assert the synthetic fixture matches each DB-owned receipt source gate.
    // Only boolean results are reported; never expose any original message text.
    const {rows:[sourceGates]}=await pool.query<Record<string,boolean>>(`
      with target as (
        select t.subject_id,t.thread_id,t.id turn_id,t.client_turn_id,
          u.id user_id,u.body_text user_body,u.sequence_no user_seq,
          m.id assistant_id,m.body_text assistant_body,
          a.seyeon_personal_source_pin_jsonb pin,a.generated_body_text generated_body,
          a.planner_version,a.validation_result_jsonb validation,
          a.seyeon_personal_source_pinned_at,a.seyeon_positive_delivery_issued_at
        from public.chat_turns t
        join public.chat_turn_attempts a on a.id=t.committed_attempt_id
        join public.conversation_messages u on u.turn_id=t.id and u.sender_type='user'
        join public.conversation_messages m on m.id=a.committed_message_id
        where t.id=$1::uuid and t.state='committed'
      ), history as (
        select m.id,m.sender_type,m.body_text,m.sequence_no
        from public.conversation_messages m
        join public.chat_turns prior on prior.id=m.turn_id
        where m.subject_id=$2::uuid and m.thread_id=$3::uuid
          and m.sequence_no<(select user_seq from target)
          and prior.state='delivered' and prior.delivered_at is not null
          and prior.committed_at is not null and prior.committed_attempt_id is not null
        order by m.sequence_no desc limit 2
      ), matched as (
        select v.ordinality,v.value item,h.id,h.sender_type,h.body_text
        from target t cross join lateral
          jsonb_array_elements(t.pin#>'{exactModelSourceSelection,selectedUnpinnedRecentSources}')
          with ordinality v(value,ordinality)
        left join history h on h.id::text=v.value->>'messageId'
      )
      select
        (select count(*) from public.conversation_messages where turn_id=$1::uuid)=2 as "exactMessages",
        (select count(*) from public.outbox_events where aggregate_type='chat_turn'
          and aggregate_id=$1::text and event_type='SEYEON_POST_TURN_ANALYSIS_REQUESTED'
          and dedupe_key='seyeon-post-turn-v1')=1 as "exactOutbox",
        (select count(*) from public.outbox_events where id=$4::uuid
          and aggregate_type='chat_turn' and aggregate_id=$1::text
          and event_type='SEYEON_POST_TURN_ANALYSIS_REQUESTED'
          and event_schema_version='v1'
          and dedupe_key='seyeon-post-turn-v1'
          and payload_jsonb->>'schemaVersion'='seyeon-post-turn-analysis-request-v1'
          and payload_jsonb->>'subjectId'=$2::text
          and payload_jsonb->>'characterId'='seyeon'
          and payload_jsonb->>'turnId'=$1::text
          and payload_jsonb->>'attemptId'=$5::text
          and payload_jsonb->>'userMessageId'=(select user_id::text from target)
          and payload_jsonb->>'assistantMessageId'=(select assistant_id::text from target)
          and payload_jsonb->'snapshot'->>'schemaVersion'='seyeon-post-turn-analysis-snapshot-v1'
          and payload_jsonb->'snapshot'->>'turnId'=$1::text
          and payload_jsonb->'snapshot'->>'userMessageId'=(select user_id::text from target)
          and payload_jsonb->'snapshot'->>'assistantMessageId'=(select assistant_id::text from target)
          and payload_jsonb->>'snapshotHash'~'^sha256:v1:[a-f0-9]{64}$')=1 as "outboxProvenance",
        (select planner_version='seyeon-production-chat-planner-v1'
          and validation->'passed'='true'::jsonb
          and validation->'personalRecordProvenance'=pin->'zeroProof'
          and seyeon_personal_source_pinned_at is not null
          and seyeon_positive_delivery_issued_at is null
          and generated_body=assistant_body from target) as "committedProvenance",
        (select jsonb_typeof(pin)='object'
          and (select count(*) from jsonb_object_keys(pin))=2
          and pin#>>'{zeroProof,recordState}'='explicit_zero_admitted'
          and pin#>'{zeroProof,records}'='[]'::jsonb
          and pin#>'{exactModelSourceSelection,selectedMemoryCount}'='0'::jsonb
          and pin#>'{exactModelSourceSelection,selectedPersonalRecordCount}'='0'::jsonb
          and pin#>'{exactModelSourceSelection,selectedSources}'='[]'::jsonb
          and pin#>'{exactModelSourceSelection,selectedUnpinnedDerivedSources}'='[]'::jsonb
          and pin#>>'{exactModelSourceSelection,selectedCurrentUserSource,messageId}'=user_id::text
          and pin#>'{exactModelSourceSelection,selectedCurrentUserSource,persistedBeforeModel}'='false'::jsonb
          and pin#>>'{exactModelSourceSelection,selectedCurrentUserSource,selectedModelMessageDigest}'=
            'sha256:v1:'||encode(sha256(convert_to(
              '{"messageId":'||to_json(user_id::text)::text||
              ',"role":"user","text":'||to_json(btrim(user_body))::text||'}','UTF8')),'hex')
          from target) as "selectionProvenance",
        (select count(*) from history)=2 as "historyLength",
        (select count(*)=2 from matched) as "historySelectionLength",
        (select bool_and(item->>'role'=case sender_type when 'user' then 'user' else 'assistant' end
          and item->>'selectedModelMessageDigest'=
            'sha256:v1:'||encode(sha256(convert_to(
              '{"messageId":'||to_json(id::text)::text||
              ',"role":'||to_json(item->>'role')::text||
              ',"text":'||to_json(btrim(body_text))::text||'}','UTF8')),'hex')
          ) from matched) as "historyExactDigests",
        (select count(*) from public.relationship_events where subject_id=$2::uuid and character_id='seyeon')=0 as "noRelationshipEvents",
        (select count(*) from public.relationship_event_records where subject_id=$2::uuid and character_id='seyeon')=0 as "noRelationshipRecords",
        (select count(*) from public.relationship_history_entries where subject_id=$2::uuid and character_id='seyeon')=0 as "noRelationshipHistory"
    `,[turn,subject,thread,outbox,attempt]);
    expect(sourceGates).toBeDefined();
    expect(Object.fromEntries(Object.entries(sourceGates!).filter(([,ok])=>ok!==true))).toEqual({});
    const model=vi.fn(async()=>{throw Error('A stored Assistant must never invoke the provider');});
    const client=new MyeongHaApiClientV1({origin:'https://receipt.test',
      fetchImpl:async(url,init)=>{
        const request=new Request(String(url),init);
        if(request.url.endsWith('/turns')){
          const response=await handleSeyeonFirstPositiveMemoryFetchV1({
            request,requestId:'synthetic-g0-followup',serverTime:new Date().toISOString(),
            pool:subjectPool,identityEvidenceVerifier:{verifyRequestIdentity:async()=>evidence},
            runtime:{run:model},zeroSourceFirstReplyApproved:true,
          });
          expect(response.status).toBe(200);
          return response;
        }
        return handleSeyeonPositiveReplyReceiptV1({request,pool:subjectPool,requestId:'synthetic-g0-ack'});
      }});
    const reply=await sendSeyeonChatTurnV1(client,'synthetic-member',thread,
      {clientTurnId:uuid(55,90),text:currentText},{requireDeliveryReceipt:true});
    expect(reply).toMatchObject({turnId:turn,assistantMessageId:assistant,
      assistantText:generatedText,replayed:false});
    expect(reply).not.toHaveProperty('deliveryReceipt');
    expect(model).not.toHaveBeenCalled();
    expect((await pool.query('select state from public.chat_turns where id=$1',[turn])).rows[0].state)
      .toBe('delivered');
    const after=await pool.query(
      'select seyeon_positive_delivery_issued_at as issued, seyeon_positive_delivery_received_at as received from public.chat_turn_attempts where id=$1',[attempt]);
    expect(after.rows[0]?.issued).not.toBeNull();
    expect(after.rows[0]?.received).not.toBeNull();
    expect(await recoverSeyeonUnissuedZeroReplyV1({
      pool:subjectPool,verifiedEvidence:evidence,threadId:thread,text:currentText,
      signal:new AbortController().signal,requestId:'no-replay',serverTime:new Date().toISOString(),
    })).toBeNull();
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
