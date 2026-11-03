// Watchtower-Track: security
// HTTP receipt barrier: COMMIT issuance before exposing a Fetch Response.
import { createHash, randomBytes } from 'node:crypto';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import { preflightSeyeonChatTurnSendRequestV1 } from './chat-turn-send-http.js';
import { createSeyeonCloudflareStaticPreflightDenialV1 } from './seyeon-cloudflare-offline-reveal-fence-v1.js';
import {assertSeyeonZeroSourceHttpReceiptReadyV1, SEYEON_ZERO_FIRST_RECEIPT_ISSUER_V1} from './seyeon-zero-source-http-receipt-ready-v1.js';
import { executePostgresSubjectTransactionV1, type PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { ProductionSeyeonChatRuntimeV1 } from './production-seyeon-chat-runtime-v1.js';
import { recoverSeyeonUnissuedZeroReplyV1 } from './seyeon-unissued-zero-reply-recovery-v1.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const SEYEON_POSITIVE_DELIVERY_RECEIPT_HEADER_V1='x-myeongha-delivery-receipt';
export const SEYEON_POSITIVE_DELIVERY_RECEIPT_PROTOCOL_V1='v1';
const ISSUE_RPC='public.cmd_issue_seyeon_positive_first_reply_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea)';
const PIN_RPC='public.cmd_mark_seyeon_positive_context_ready_pinned_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text)';
const COMMIT_RPC='public.cmd_commit_seyeon_positive_chat_turn_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text)';
const ACK_RPC='seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)';
const REQUEST_REVOKE_RPC='seyeon_private.cmd_request_seyeon_memory_revoke_v1(uuid,uuid)';
const G0_RECENT_RPC='public.qry_seyeon_g0_current_source_recent_messages_v1(uuid,uuid,uuid,integer)';
const G0_HISTORY_RPC='public.qry_seyeon_g0_current_source_relationship_history_v1(uuid,text,bigint)';
const G0_USER_RPC='seyeon_private.assert_current_original_member_user_message_v1(uuid,uuid,uuid)';
const G0_ASSISTANT_RPC='seyeon_private.assert_current_original_assistant_lineage_v1(uuid,uuid,uuid)';
const RECOVER_FAILED_USER_RPC='public.qry_seyeon_recover_exact_failed_user_turn_v1(uuid,uuid,text)';
const SUPERSEDE_FAILED_USER_RPC='public.cmd_seyeon_supersede_stale_failed_turn_v1(uuid,uuid,text)';
const EXPLICIT_SUPERSEDE_HEADER='X-MyeongHa-Seyeon-Explicit-Supersede';

/**
 * Run after subject authentication but BEFORE a new logical turn is inserted.
 * A missing original-lineage guard must not create failed_retryable turns that
 * obstruct subsequent sends. This is a readiness check, not a bypass.
 */
export async function assertSeyeonG0OriginalLineageReadyV1(client: Readonly<{
  query(sql: string, values?: unknown[]): Promise<{rows: readonly unknown[]}> | {rows: readonly unknown[]};
}>): Promise<void> {
  const result=await client.query(`select count(*)=4 as ready
    from pg_catalog.pg_proc p
    where p.oid in(to_regprocedure($1),to_regprocedure($2),
                   to_regprocedure($3),to_regprocedure($4))
      and p.prosecdef
      and pg_catalog.pg_get_userbyid(p.proowner)='myeongha_seyeon_chat_runtime_owner'
      and (
        (p.oid in(to_regprocedure($1),to_regprocedure($2))
         and has_function_privilege(current_user,p.oid,'EXECUTE'))
        or
        (p.oid in(to_regprocedure($3),to_regprocedure($4))
         and not has_function_privilege(current_user,p.oid,'EXECUTE'))
      )
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not has_function_privilege('service_role',p.oid,'EXECUTE')`,
    [G0_RECENT_RPC,G0_HISTORY_RPC,G0_USER_RPC,G0_ASSISTANT_RPC]);
  if(result.rows.length!==1 || (result.rows[0] as {ready?:unknown}|undefined)?.ready!==true) {
    console.error('MYEONGHA_SEYEON_G0_READINESS_HOLD');
    throw new Error('Original-lineage context authority is not installed or approved.');
  }
}

/** Only the exact DB-owned in-flight error is safe to disclose as a static 409.
 * Every other failed security, source, model, or receipt step remains 503.
 */
export function classifySeyeonFirstPositiveMemoryFailureV1(error: unknown, requestId: string): Response {
  if (error !== null && typeof error === 'object' &&
      (error as {code?:unknown}).code === 'P0001' &&
      (error as {constraint?:unknown}).constraint === 'cmd_chat_receive_turn_in_flight') {
    return createSeyeonCloudflareStaticPreflightDenialV1({kind:'turn_in_flight',requestId});
  }
  return holdSeyeonReceiptHttpV1(requestId);
}

/** A new attempt may recover the same original failed User turn, never replay a delivered Assistant. */
export function isSeyeonFirstReceiptEligibleReceiveV1(received: Readonly<{
  turnState: string; replayed: boolean;
}>): boolean {
  return (received.turnState==='received' && received.replayed===false) ||
    (received.turnState==='failed_retryable' && received.replayed===true);
}

export function holdSeyeonReceiptHttpV1(requestId: string): Response {
  return Response.json({ok:false,error:{code:'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',
    messageKey:'chat.secure_reveal_unavailable',retryable:false},
    meta:{apiContractVersion:'v0.9',requestId}},
  {status:503,headers:{'Cache-Control':'no-store'}});
}

/** Server-defined categories only; never log SQL, parameters or exception text. */
export function seyeonFirstReplyFailureMetadataV1(error: unknown) {
  const value=typeof error==='object'&&error!==null ? error as {code?:unknown;constraint?:unknown}:{};
  const sqlState=['23514','23505','42501','55P03','40001','40P01','53300','57014','08001','08006']
    .find(code=>code===value.code)??null;
  const sqlConstraint=['seyeon_unissued_reply_invalid','seyeon_unissued_reply_not_recoverable',
    'seyeon_unissued_reply_source_denied'].find(code=>code===value.constraint)??null;
  return {sqlState,sqlConstraint};
}

/** No metered runtime is invoked unless all receipt and withdrawal RPCs exist. */
export async function handleSeyeonFirstPositiveMemoryFetchV1(input: Readonly<{
  request: Request; requestId: string; serverTime: string;
  identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  pool: PostgresSubjectPoolV1;
  runtime: Pick<ProductionSeyeonChatRuntimeV1,'run'>;
  /** Server policy only; never selected by a browser parameter. */
  zeroSourceFirstReplyApproved?: true;
}>): Promise<Response> {
  const held=()=>holdSeyeonReceiptHttpV1(input.requestId);
  let stage: 'preflight'|'receipt_readiness'|'unissued_recovery'|'failed_turn_reconciliation'|'model_execution'|'receipt_issuer'='preflight';
  try {
    const preflight=await preflightSeyeonChatTurnSendRequestV1(input);
    if(preflight.kind==='denied')return preflight.response;
    if(input.request.headers.get(SEYEON_POSITIVE_DELIVERY_RECEIPT_HEADER_V1)!=='v1' ||
       input.request.signal.aborted)return held();
    const zeroSource=input.zeroSourceFirstReplyApproved===true;
    const supersedeHeader=input.request.headers.get(EXPLICIT_SUPERSEDE_HEADER);
    if(supersedeHeader!==null &&
       (supersedeHeader!=='v1'||!zeroSource))return held();
    // Receipt HTTP requires G1/G2 and its own issuer, never EXECUTE on the
    // old Node sender. Production leaves that unreceipted RPC revoked.
    stage='receipt_readiness';
    await executePostgresSubjectTransactionV1({pool:input.pool,
      verifiedEvidence:preflight.verifiedEvidence,execute:async({client})=>{
        if(zeroSource){
          await assertSeyeonZeroSourceHttpReceiptReadyV1(client);
          await assertSeyeonG0OriginalLineageReadyV1(client);
          return;
        }
        const r=await client.query<{ready:boolean}>(`select count(*)=5 as ready
          from pg_catalog.pg_proc p where p.oid in(to_regprocedure($1),to_regprocedure($2),to_regprocedure($3),
            to_regprocedure($4),to_regprocedure($5))
          and p.prosecdef and (
            (p.oid in(to_regprocedure($1),to_regprocedure($2),to_regprocedure($3))
             and pg_catalog.pg_get_userbyid(p.proowner)='postgres' and 'row_security=off'=any(p.proconfig))
            or (p.oid in(to_regprocedure($4),to_regprocedure($5))
             and pg_catalog.pg_get_userbyid(p.proowner)='myeongha_seyeon_chat_runtime_owner'))
          and has_function_privilege(current_user,p.oid,'EXECUTE')
          and not has_function_privilege('anon',p.oid,'EXECUTE')
          and not has_function_privilege('authenticated',p.oid,'EXECUTE')
          and not has_function_privilege('service_role',p.oid,'EXECUTE')`,[ISSUE_RPC,ACK_RPC,REQUEST_REVOKE_RPC,PIN_RPC,COMMIT_RPC]);
        if(r.rows.length!==1||r.rows[0]?.ready!==true)throw Error('Receipt authority unavailable');
        await assertSeyeonG0OriginalLineageReadyV1(client);
      }});
    if(input.request.signal.aborted)return held();

    if(zeroSource){
      stage='unissued_recovery';
      const recovered=await recoverSeyeonUnissuedZeroReplyV1({pool:input.pool,
        verifiedEvidence:preflight.verifiedEvidence,threadId:preflight.threadId,
        text:preflight.text,signal:input.request.signal,requestId:input.requestId,serverTime:input.serverTime});
      if(input.request.signal.aborted)return held();
      if(recovered!==null)return new Response(recovered,{headers:{
        'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, no-transform','Content-Encoding':'identity'}});
    }

    // A browser may have lost its sessionStorage clientTurnId. Recover only
    // the exact prior failed, uncommitted User text under the SAME verified
    // canonical Subject and Se-yeon thread. Never rewrite a different message,
    // fabricate a client Turn ID or reveal previous transcript material.
    let executionClientTurnId=preflight.clientTurnId;
    if(zeroSource){
      stage='failed_turn_reconciliation';
      const recovered=await executePostgresSubjectTransactionV1({
        pool:input.pool,verifiedEvidence:preflight.verifiedEvidence,
        execute:async({client,resolvedSubject})=>{
          if(resolvedSubject.subjectKind!=='member')throw Error('Member required for recovery');
          const readiness=await client.query<{ready:boolean}>(`select count(*)=1 as ready
            from pg_catalog.pg_proc p
            where p.oid=to_regprocedure($1) and p.prosecdef
              and pg_catalog.pg_get_userbyid(p.proowner)='myeongha_seyeon_chat_runtime_owner'
              and has_function_privilege(current_user,p.oid,'EXECUTE')
              and not has_function_privilege('anon',p.oid,'EXECUTE')
              and not has_function_privilege('authenticated',p.oid,'EXECUTE')
              and not has_function_privilege('service_role',p.oid,'EXECUTE')`,
            [RECOVER_FAILED_USER_RPC]);
          if(readiness.rows.length!==1||readiness.rows[0]?.ready!==true)
            throw Error('Exact previous-User recovery authority not installed');
          const r=await client.query<{clientTurnId:unknown}>(`select
            public.qry_seyeon_recover_exact_failed_user_turn_v1(
              $1::uuid,$2::uuid,$3::text) as "clientTurnId"`,
            [resolvedSubject.subjectId,preflight.threadId,preflight.text]);
          if(r.rows.length!==1)throw Error('Ambiguous original User recovery');
          const id=r.rows[0]?.clientTurnId;
          if(id===null)return null;
          if(typeof id!=='string'||!UUID.test(id))throw Error('Invalid DB-owned client turn');
          return id;
        },
      });
      if(recovered!==null)executionClientTurnId=recovered;
      // A new message cannot inherit the old User text or identity.
      // Only a separate, explicit browser confirmation authorizes replacing
      // an unrelated terminal-failed Turn with a new User message.
      if(recovered===null && supersedeHeader==='v1'){
        stage='failed_turn_reconciliation';
        const superseded=await executePostgresSubjectTransactionV1({
          pool:input.pool,verifiedEvidence:preflight.verifiedEvidence,
          execute:async({client,resolvedSubject})=>{
            if(resolvedSubject.subjectKind!=='member')throw Error('Member required');
            const check=await client.query<{ready:boolean}>(`select count(*)=1 as ready
              from pg_catalog.pg_proc p where p.oid=to_regprocedure($1)
                and p.prosecdef
                and pg_catalog.pg_get_userbyid(p.proowner)='myeongha_seyeon_chat_runtime_owner'
                and has_function_privilege(current_user,p.oid,'EXECUTE')
                and not has_function_privilege('anon',p.oid,'EXECUTE')
                and not has_function_privilege('authenticated',p.oid,'EXECUTE')
                and not has_function_privilege('service_role',p.oid,'EXECUTE')`,
              [SUPERSEDE_FAILED_USER_RPC]);
            if(check.rows.length!==1||check.rows[0]?.ready!==true)
              throw Error('Explicit failed-turn supersede authority unavailable');
            const r=await client.query<{superseded:boolean}>(`select
              public.cmd_seyeon_supersede_stale_failed_turn_v1(
                $1::uuid,$2::uuid,$3::text) as "superseded"`,
              [resolvedSubject.subjectId,preflight.threadId,preflight.text]);
            return r.rows.length===1 && r.rows[0]?.superseded===true;
          },
        });
        if(!superseded)return createSeyeonCloudflareStaticPreflightDenialV1({
          kind:'turn_in_flight',requestId:input.requestId,
        });
      }
    }
    if(input.request.signal.aborted)return held();
    stage='model_execution';
    const result=await input.runtime.run({verifiedEvidence:preflight.verifiedEvidence,
      threadId:preflight.threadId,clientTurnId:executionClientTurnId,text:preflight.text});
    const e=result.execution;
    // A fresh response may be generated for the SAME durable clientTurnId
    // after its previous attempt failed before Commit. That receive is an
    // idempotent replay of the User row, NOT a replay of any Assistant text.
    // An already committed/delivered reply remains non-revealable here.
    const eligibleReceive=isSeyeonFirstReceiptEligibleReceiveV1(e.receivedTurn);
    if(e.disposition!=='executed'||e.receivedTurn.userText!==preflight.text||
       !eligibleReceive||
       e.receivedTurn.committedTurn!==null||e.attempt.replayed||
       e.receivedTurn.turnId!==e.committedTurn.turnId||
       e.attempt.attemptId!==e.committedTurn.attemptId||e.committedTurn.replayed||
       result.threadBinding.threadId!==preflight.threadId||
       result.threadBinding.participantCharacterIds.length!==1||
       result.threadBinding.participantCharacterIds[0]!=='seyeon'||
       !UUID.test(e.receivedTurn.threadCharacterId)||
       !Number.isSafeInteger(e.committedTurn.sequenceNo)||e.committedTurn.sequenceNo<1||
       ![result.subjectId,e.committedTurn.turnId,e.committedTurn.attemptId,
          e.receivedTurn.userMessageId,e.committedTurn.assistantMessageId,
          e.committedTurn.postTurnOutboxEventId].every(x=>typeof x==='string'&&UUID.test(x))||
       input.request.signal.aborted)return held();
    const challenge=randomBytes(32).toString('hex');
    const receiptHash=createHash('sha256').update(challenge,'utf8').digest();
    stage='receipt_issuer';
    const body=await executePostgresSubjectTransactionV1({pool:input.pool,
      verifiedEvidence:preflight.verifiedEvidence,execute:async({client,resolvedSubject})=>{
        if(resolvedSubject.subjectKind!=='member'||resolvedSubject.subjectId!==result.subjectId||
           input.request.signal.aborted)throw Error('Original Subject unavailable');
        const r=await client.query<{assistantText:unknown}>(`select assistant_text as "assistantText"
          from ${zeroSource ? SEYEON_ZERO_FIRST_RECEIPT_ISSUER_V1 : 'public.cmd_issue_seyeon_positive_first_reply_v1'}(
            $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::text,$9::bytea)`,[
          resolvedSubject.subjectId,preflight.threadId,e.committedTurn.turnId,e.committedTurn.attemptId,
          e.receivedTurn.userMessageId,e.committedTurn.assistantMessageId,
          e.committedTurn.postTurnOutboxEventId,executionClientTurnId,receiptHash]);
        const text=r.rows.length===1?r.rows[0]?.assistantText:null;
        if(typeof text!=='string'||text.trim()===''||Buffer.byteLength(text,'utf8')>65_536||
           input.request.signal.aborted)throw Error('Original response unavailable');
        // Serialize before COMMIT, expose only after a definite COMMIT ACK.
        // The secret challenge follows ALL protected text in the JSON bytes.
        return JSON.stringify({ok:true,data:{turnId:e.committedTurn.turnId,
          assistantMessageId:e.committedTurn.assistantMessageId,assistantText:text,
          sequenceNo:e.committedTurn.sequenceNo,replayed:false,
          deliveryReceipt:{attemptId:e.committedTurn.attemptId,challenge}},
          meta:{apiContractVersion:'v0.9',requestId:input.requestId,serverTime:input.serverTime}});
      }});
    // A crash/abort AFTER COMMIT leaves durable pending issuance. No release,
    // expiry, automatic replay or false successful withdrawal is permitted.
    if(input.request.signal.aborted)return held();
    return new Response(body,{headers:{'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store, no-transform','Content-Encoding':'identity'}});
  }catch(error){
    // Security-safe operational diagnosis: never log source text, IDs,
    // provider payload, credentials, raw error messages, or model responses.
    console.error('MYEONGHA_SEYEON_FIRST_REPLY_STAGE_HOLD',stage);
    console.error('MYEONGHA_SEYEON_FIRST_REPLY_DIAGNOSTIC '+JSON.stringify({
      stage,...seyeonFirstReplyFailureMetadataV1(error),
    }));
    return classifySeyeonFirstPositiveMemoryFailureV1(error,input.requestId);
  }
}

/** Capability-only receipt. Returns no identity, source, grant or reply text. */
export async function handleSeyeonPositiveReplyReceiptV1(input: Readonly<{
  request:Request;pool:PostgresSubjectPoolV1;requestId:string;
}>):Promise<Response>{
  const url=new URL(input.request.url);
  const match=/^\/api\/chat\/delivery-receipts\/([a-f0-9-]+)$/u.exec(url.pathname);
  const fail=(status:number)=>Response.json({ok:false,error:{code:'INVALID_DELIVERY_RECEIPT',retryable:false}},
    {status,headers:{'Cache-Control':'no-store'}});
  if(!match||!UUID.test(match[1]??'')||url.search!=='')return fail(404);
  if(input.request.method!=='POST')return new Response(null,{status:405,
    headers:{Allow:'POST','Cache-Control':'no-store'}});
  if(input.request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return fail(400);
  // A locked or otherwise unreadable request stream is invalid input, not
  // an unhandled Worker failure. No Subject DB call is allowed on this path.
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  try{reader=input.request.body?.getReader();}catch{return fail(400);}
  if(!reader)return fail(400);
  let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Body deadline')),1000);});
  let data:unknown;
  try{
    const chunks:Uint8Array[]=[];let bytes=0;
    for(;;){const c=await Promise.race([reader.read(),deadline]);if(c.done)break;
      bytes+=c.value.byteLength;if(bytes>160)throw Error('Receipt body too large');chunks.push(c.value);}
    const body=new Uint8Array(bytes);let offset=0;
    for(const c of chunks){body.set(c,offset);offset+=c.length;}
    data=JSON.parse(new TextDecoder().decode(body));
  }catch{return fail(400);}finally{
    if(timer!==undefined)clearTimeout(timer);
    // Cleanup is best effort: throwing cancel/release implementations must not
    // replace the safe rejection or turn a valid proof into a raw HTTP error.
    try{void reader.cancel().catch(()=>undefined);}catch{}
    try{reader.releaseLock();}catch{}
  }
  if(typeof data!=='object'||data===null||Array.isArray(data)||
     Object.keys(data).length!==1||!('proof'in data)||typeof data.proof!=='string'||
     !/^[a-f0-9]{64}$/u.test(data.proof))return fail(400);
  let client:Awaited<ReturnType<PostgresSubjectPoolV1['connect']>>|undefined;
  let discard:unknown;
  try{
    client=await input.pool.connect();
    await client.query('BEGIN');await client.query('SET LOCAL ROLE myeongha_api_executor');
    const r=await client.query<{accepted:boolean}>(`select seyeon_private.cmd_ack_seyeon_positive_reply_v1(
      $1::uuid,$2::text) as accepted`,[match[1],data.proof]);
    if(r.rows.length!==1||r.rows[0]?.accepted!==true)throw Error('Receipt not accepted');
    await client.query('COMMIT');
    return Response.json({ok:true,data:{accepted:true}}, {headers:{'Cache-Control':'no-store'}});
  }catch{
    try{await client?.query('ROLLBACK');}catch(error){discard=error;}
    return fail(503);
  }finally{client?.release(discard);}
}
