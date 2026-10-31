// Watchtower-Track: security
// G0/G3: direct Node only, disposable DB, exactly one first User/Assistant pair.
// A generic History, a Fetch proxy and all Production mounts remain DENY.
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';

const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const PATH=new RegExp('^/api/chat/('+UUID+')/original-pair/('+UUID+')$','iu');
const QUERY=`select
  user_message_id::text as "userMessageId",user_text as "userText",
  assistant_message_id::text as "assistantMessageId",assistant_text as "assistantText"
  from seyeon_private.qry_seyeon_first_original_dialogue_pair_s0_v1(
    $1::uuid,$2::uuid,$3::uuid)`;

export const SEYEON_FIRST_ORIGINAL_DIALOGUE_PAIR_NODE_S0_V1=Object.freeze({
  method:'GET',
  productionMounted:false,
  supportsFetchProxy:false,
  scope:'one_first_original_member_user_and_assistant',
  requiresCurrentOriginalGrant:true,
  allowedDatabase:'disposable_s0_only',
} as const);

type Pair=Readonly<{
  userMessageId:unknown;userText:unknown;
  assistantMessageId:unknown;assistantText:unknown;
}>;

function isDisposable(name:unknown):boolean {
  return name==='myeongha_seyeon_security_s0_test' ||
    (process.env.CI==='true' && process.env.GITHUB_ACTIONS==='true' &&
      process.env.DB_SUITE==='postgres17' && typeof name==='string' &&
      /^myeongha_ci_case_[0-9]+$/u.test(name));
}

function refuse(response:ServerResponse,status:number,code:string):void {
  if(response.headersSent||response.writableEnded||response.destroyed){
    if(!response.destroyed)response.destroy();
    return;
  }
  response.statusCode=status;
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Content-Type','application/json; charset=utf-8');
  if(status===405)response.setHeader('Allow','GET');
  response.end(JSON.stringify({ok:false,error:{code,retryable:false}}));
}

export interface SeyeonFirstOriginalDialoguePairNodeS0InputV1 {
  readonly incoming:IncomingMessage;
  readonly response:ServerResponse;
  readonly pool:PostgresSubjectPoolV1;
  readonly identityEvidenceVerifier:IdentityEvidenceVerificationPortV1;
  readonly requestId?:string;
}

/** The owner DB validates BOTH original messages and exact historical Grant.
 * Protected JSON is handed to the Node socket before releasing the DB locks.
 * Node 'finish' is not proof of delivery through a separate HTTP proxy.
 */
export async function handleSeyeonFirstOriginalDialoguePairNodeS0V1(
  input:SeyeonFirstOriginalDialoguePairNodeS0InputV1,
):Promise<'pair_sent'|'pair_withheld'|'preflight_denied'>{
  const {incoming,response}=input;
  const requestId=input.requestId??randomUUID();
  const controller=new AbortController();
  const abort=()=>{
    if(!controller.signal.aborted)controller.abort();
    if(!response.destroyed)response.destroy();
  };
  const disconnect=()=>{if(!response.writableFinished)abort();};
  incoming.once('aborted',abort);
  response.once('close',disconnect);
  const timeout=setTimeout(abort,5_000);
  let attempted=false;
  try{
    if(!incoming.socket||incoming.socket!==response.socket||
       response.headersSent||response.writableEnded||response.destroyed||
       typeof incoming.url!=='string'||!incoming.url.startsWith('/')||
       incoming.url.startsWith('//')||
       Buffer.byteLength(incoming.url,'utf8')>256||
       !/^[a-zA-Z0-9_-]{1,128}$/u.test(requestId)){
      refuse(response,503,'SEYEON_ORIGINAL_PAIR_HOLD');
      return 'preflight_denied';
    }
    if(incoming.method!=='GET'){
      refuse(response,405,'METHOD_NOT_ALLOWED');
      return 'preflight_denied';
    }
    if(incoming.headers['content-length']!==undefined||
       incoming.headers['transfer-encoding']!==undefined){
      refuse(response,400,'INVALID_REQUEST');
      return 'preflight_denied';
    }
    const url=new URL(incoming.url,'https://myeongha.internal');
    const match=url.search===''&&url.hash==='' ? PATH.exec(url.pathname) : null;
    if(!match||!match[1]||!match[2]){
      refuse(response,404,'NOT_FOUND');
      return 'preflight_denied';
    }
    // Stable identifiers remain narrowed inside the asynchronous DB callback.
    const threadId=match[1];
    const assistantMessageId=match[2];
    const headers=new Headers();
    for(const [key,value] of Object.entries(incoming.headers)){
      if(Array.isArray(value)){for(const item of value)headers.append(key,item);}
      else if(typeof value==='string')headers.set(key,value);
    }
    const request=new Request('https://myeongha.internal'+incoming.url,{
      method:'GET',headers,signal:controller.signal,
    });
    const evidence=await input.identityEvidenceVerifier.verifyRequestIdentity(request);
    if(controller.signal.aborted)return 'pair_withheld';
    if(evidence===null){
      refuse(response,401,'AUTH_REQUIRED');
      return 'preflight_denied';
    }
    if(evidence.kind!=='member'){
      refuse(response,403,'MEMBER_REQUIRED');
      return 'preflight_denied';
    }
    let sent=false;
    await executePostgresSubjectTransactionV1({
      pool:input.pool,
      verifiedEvidence:evidence,
      execute:async({client,resolvedSubject})=>{
        if(controller.signal.aborted||resolvedSubject.subjectKind!=='member'){
          throw Error('Original pair Member unavailable');
        }
        const db=await client.query<{dbName:unknown}>(
          'select current_database() as "dbName"',
        );
        if(db.rows.length!==1||!isDisposable(db.rows[0]?.dbName)){
          throw Error('Original pair requires disposable DB');
        }
        await client.query("SET LOCAL lock_timeout = '2000ms'");
        await client.query("SET LOCAL statement_timeout = '5000ms'");
        const result=await client.query<Pair>(QUERY,[
          resolvedSubject.subjectId,threadId,assistantMessageId,
        ]);
        if(controller.signal.aborted||result.rows.length>1){
          throw Error('Original pair source unavailable');
        }
        const row=result.rows[0];
        const valid=row!==undefined &&
          typeof row.userMessageId==='string' && row.userMessageId.length===36 &&
          typeof row.assistantMessageId==='string' && row.assistantMessageId.toLowerCase()===assistantMessageId.toLowerCase() &&
          typeof row.userText==='string' && row.userText.trim()!=='' &&
          typeof row.assistantText==='string' && row.assistantText.trim()!=='' &&
          Buffer.byteLength(row.userText,'utf8')<=8_000 &&
          Buffer.byteLength(row.assistantText,'utf8')<=65_536;
        const payload=Buffer.from(JSON.stringify(valid ? {
          ok:true,
          data:{threadId,userMessageId:row.userMessageId,
            userText:row.userText,assistantMessageId:row.assistantMessageId,
            assistantText:row.assistantText},
          meta:{apiContractVersion:'v0.9',requestId,
            serverTime:new Date().toISOString()},
        }:{
          ok:false,error:{code:'SEYEON_ORIGINAL_PAIR_HOLD',retryable:false},
        }),'utf8');
        if(payload.byteLength>78_000||controller.signal.aborted)throw Error('Invalid original pair payload');
        attempted=true;
        await new Promise<void>((resolve,reject)=>{
          let finished=false;
          const clean=()=>{
            response.off('finish',done);
            response.off('close',failed);
            response.off('error',failed);
            controller.signal.removeEventListener('abort',failed);
          };
          const done=()=>{finished=true;clean();resolve();};
          const failed=()=>{if(finished)return;clean();reject(Error('Protected pair socket aborted'));};
          response.once('finish',done);
          response.once('close',failed);
          response.once('error',failed);
          controller.signal.addEventListener('abort',failed,{once:true});
          try{
            if(controller.signal.aborted||response.headersSent||response.destroyed)throw Error('Replay no longer writable');
            response.statusCode=valid?200:503;
            response.setHeader('Content-Type','application/json; charset=utf-8');
            response.setHeader('Content-Length',String(payload.byteLength));
            response.setHeader('Cache-Control','no-store, no-transform');
            response.setHeader('Content-Encoding','identity');
            response.setHeader('X-Content-Type-Options','nosniff');
            response.end(payload);
          }catch{failed();}
        });
        if(controller.signal.aborted)throw Error('Original pair aborted after finish');
        sent=valid;
      },
    });
    return sent?'pair_sent':'pair_withheld';
  }catch{
    if(!attempted&&!controller.signal.aborted)refuse(response,503,'SEYEON_ORIGINAL_PAIR_HOLD');
    else if(attempted&&!response.writableFinished&&!response.destroyed)response.destroy();
    return 'pair_withheld';
  }finally{
    clearTimeout(timeout);
    incoming.off('aborted',abort);
    response.off('close',disconnect);
  }
}
