// Watchtower-Track: security
// HTTP receipt barrier: COMMIT issuance before exposing a Fetch Response.
import { createHash, randomBytes } from 'node:crypto';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import { preflightSeyeonChatTurnSendRequestV1 } from './chat-turn-send-http.js';
import { executePostgresSubjectTransactionV1, type PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { ProductionSeyeonChatRuntimeV1 } from './production-seyeon-chat-runtime-v1.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const SEYEON_POSITIVE_DELIVERY_RECEIPT_HEADER_V1='x-myeongha-delivery-receipt';
export const SEYEON_POSITIVE_DELIVERY_RECEIPT_PROTOCOL_V1='v1';
const ISSUE_RPC='public.cmd_issue_seyeon_positive_first_reply_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea)';
const PIN_RPC='public.cmd_mark_seyeon_positive_context_ready_pinned_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text)';
const COMMIT_RPC='public.cmd_commit_seyeon_positive_chat_turn_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text)';
const ACK_RPC='seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)';
const REQUEST_REVOKE_RPC='seyeon_private.cmd_request_seyeon_memory_revoke_v1(uuid,uuid)';

export function holdSeyeonReceiptHttpV1(requestId: string): Response {
  return Response.json({ok:false,error:{code:'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',
    messageKey:'chat.secure_reveal_unavailable',retryable:false},
    meta:{apiContractVersion:'v0.9',requestId}},
  {status:503,headers:{'Cache-Control':'no-store'}});
}

/** No metered runtime is invoked unless all receipt and withdrawal RPCs exist. */
export async function handleSeyeonFirstPositiveMemoryFetchV1(input: Readonly<{
  request: Request; requestId: string; serverTime: string;
  identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  pool: PostgresSubjectPoolV1;
  runtime: Pick<ProductionSeyeonChatRuntimeV1,'run'>;
}>): Promise<Response> {
  const held=()=>holdSeyeonReceiptHttpV1(input.requestId);
  try {
    const preflight=await preflightSeyeonChatTurnSendRequestV1(input);
    if(preflight.kind==='denied')return preflight.response;
    if(input.request.headers.get(SEYEON_POSITIVE_DELIVERY_RECEIPT_HEADER_V1)!=='v1' ||
       input.request.signal.aborted)return held();
    // Receipt HTTP requires G1/G2 and its own issuer, never EXECUTE on the
    // old Node sender. Production leaves that unreceipted RPC revoked.
    await executePostgresSubjectTransactionV1({pool:input.pool,
      verifiedEvidence:preflight.verifiedEvidence,execute:async({client})=>{
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
      }});
    if(input.request.signal.aborted)return held();
    const result=await input.runtime.run({verifiedEvidence:preflight.verifiedEvidence,
      threadId:preflight.threadId,clientTurnId:preflight.clientTurnId,text:preflight.text});
    const e=result.execution;
    if(e.disposition!=='executed'||e.receivedTurn.userText!==preflight.text||
       e.receivedTurn.replayed||e.receivedTurn.turnState!=='received'||
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
    const body=await executePostgresSubjectTransactionV1({pool:input.pool,
      verifiedEvidence:preflight.verifiedEvidence,execute:async({client,resolvedSubject})=>{
        if(resolvedSubject.subjectKind!=='member'||resolvedSubject.subjectId!==result.subjectId||
           input.request.signal.aborted)throw Error('Original Subject unavailable');
        const r=await client.query<{assistantText:unknown}>(`select assistant_text as "assistantText"
          from public.cmd_issue_seyeon_positive_first_reply_v1(
            $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,$8::text,$9::bytea)`,[
          resolvedSubject.subjectId,preflight.threadId,e.committedTurn.turnId,e.committedTurn.attemptId,
          e.receivedTurn.userMessageId,e.committedTurn.assistantMessageId,
          e.committedTurn.postTurnOutboxEventId,preflight.clientTurnId,receiptHash]);
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
  }catch{return held();}
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
