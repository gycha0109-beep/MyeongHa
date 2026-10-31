// Watchtower-Track: security
// G3 S0 disposable-only replay of ONE previously delivered first Se-yeon
// assistant message through a direct Node socket and current original Grant.
// No Vercel/Workers Fetch proxy, general History, streaming or public mount.
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import { sendSeyeonNodeOriginalGrantResponseV1 } from
  './seyeon-node-original-grant-send-boundary-v1.js';

const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const PATH=new RegExp('^/api/chat/('+UUID+')/original-replay/('+UUID+')$','iu');
const REPLAY_SQL=`
select assistant_text as "assistantText"
from seyeon_private.qry_seyeon_first_original_assistant_replay_s0_v1(
  $1::uuid,$2::uuid,$3::uuid
)`.trim();

export const SEYEON_FIRST_ORIGINAL_ASSISTANT_REPLAY_NODE_S0_V1=Object.freeze({
  method:'GET',
  productionMounted:false,
  allowedDatabase:'disposable_s0_only',
  usesCurrentOriginalGrant:true,
  changesGrant:false,
  historicalScope:'one_previously_delivered_first_assistant',
  supportsFetchProxy:false,
} as const);

function disposableDb(value:unknown):boolean{
  return value==='myeongha_seyeon_security_s0_test' ||
    (process.env.CI==='true' && process.env.GITHUB_ACTIONS==='true' &&
      process.env.DB_SUITE==='postgres17' && typeof value==='string' &&
      /^myeongha_ci_case_[0-9]+$/u.test(value));
}

function reject(response:ServerResponse,status:number,code:string):void{
  if(response.headersSent||response.writableEnded||response.destroyed){
    if(!response.destroyed)response.destroy();
    return;
  }
  response.statusCode=status;
  response.setHeader('Cache-Control','no-store');
  response.setHeader('Content-Type','application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options','nosniff');
  if(status===405)response.setHeader('Allow','GET');
  response.end(JSON.stringify({ok:false,error:{code,retryable:false}}));
}

export interface HandleSeyeonFirstOriginalAssistantReplayNodeS0InputV1 {
  readonly incoming:IncomingMessage;
  readonly response:ServerResponse;
  readonly identityEvidenceVerifier:IdentityEvidenceVerificationPortV1;
  readonly pool:PostgresSubjectPoolV1;
  readonly requestId?:string;
}

/**
 * Every GET starts a fresh canonical-Member DB transaction; Owner SQL
 * rechecks original immutable Attempt, exact historical Grant and current
 * Record, then retains the locked transaction THROUGH Node 'finish'.
 * Current regrants never authorize historical Attempts.
 */
export async function handleSeyeonFirstOriginalAssistantReplayNodeS0V1(
  input:HandleSeyeonFirstOriginalAssistantReplayNodeS0InputV1,
):Promise<'assistant_sent'|'reveal_held'|'preflight_denied'>{
  const {incoming,response}=input;
  const requestId=input.requestId??randomUUID();
  const controller=new AbortController();
  const abort=()=>{if(!controller.signal.aborted)controller.abort();};
  const close=()=>{if(!response.writableFinished)abort();};
  incoming.once('aborted',abort);
  response.once('close',close);
  try{
    if(!incoming.socket||incoming.socket!==response.socket||
      response.headersSent||response.writableEnded||response.destroyed||
      typeof incoming.url!=='string'||!incoming.url.startsWith('/')||
      incoming.url.startsWith('//')||
      Buffer.byteLength(incoming.url,'utf8')>256||
      !/^[a-zA-Z0-9_-]{1,128}$/u.test(requestId)){
      reject(response,503,'SEYEON_ORIGINAL_REPLAY_HOLD');
      return 'preflight_denied';
    }
    if(incoming.method!=='GET'){
      reject(response,405,'METHOD_NOT_ALLOWED');
      return 'preflight_denied';
    }
    if(incoming.headers['content-length']!==undefined||
       incoming.headers['transfer-encoding']!==undefined){
      reject(response,400,'INVALID_REQUEST');
      return 'preflight_denied';
    }
    const url=new URL(incoming.url,'https://myeongha.internal');
    const match=url.search===''&&url.hash===''?PATH.exec(url.pathname):null;
    if(match===null||match[1]===undefined||match[2]===undefined){
      reject(response,404,'NOT_FOUND');
      return 'preflight_denied';
    }
    const headers=new Headers();
    for(const [key,value] of Object.entries(incoming.headers)){
      if(Array.isArray(value)){
        for(const part of value)headers.append(key,part);
      }else if(typeof value==='string')headers.set(key,value);
    }
    const req=new Request('https://myeongha.internal'+incoming.url,{
      method:'GET',headers,signal:controller.signal,
    });
    const evidence=await input.identityEvidenceVerifier.verifyRequestIdentity(req);
    if(controller.signal.aborted||response.destroyed)return 'reveal_held';
    if(evidence===null){
      reject(response,401,'AUTH_REQUIRED');
      return 'preflight_denied';
    }
    if(evidence.kind!=='member'){
      reject(response,403,'MEMBER_REQUIRED');
      return 'preflight_denied';
    }
    const withLockedOriginalGrant=async({signal,deliver}:{
      signal:AbortSignal;
      deliver:(authorizedAssistantText:string|null)=>Promise<void>;
    })=>{
      if(signal.aborted)throw Error('Aborted protected replay');
      await executePostgresSubjectTransactionV1({
        pool:input.pool,verifiedEvidence:evidence,
        execute:async({resolvedSubject,client})=>{
          if(signal.aborted||resolvedSubject.subjectKind!=='member'){
            throw Error('Replay Member authority unavailable');
          }
          const db=await client.query<{dbName:unknown}>(
            'select current_database() as "dbName"',
          );
          if(db.rows.length!==1||!disposableDb(db.rows[0]?.dbName)){
            throw Error('Replay requires the exact disposable database');
          }
          await client.query("SET LOCAL lock_timeout = '2000ms'");
          await client.query("SET LOCAL statement_timeout = '5000ms'");
          const answer=await client.query<{assistantText:unknown}>(REPLAY_SQL,[
            resolvedSubject.subjectId,match[1],match[2],
          ]);
          if(signal.aborted||answer.rows.length>1){
            throw Error('Ambiguous or aborted current-rights replay');
          }
          const result=answer.rows[0]?.assistantText;
          const text=answer.rows.length===0?null:
            typeof result==='string' && result.trim()!=='' &&
            Buffer.byteLength(result,'utf8')<=65_536?result:null;
          await deliver(text);
          if(signal.aborted)throw Error('Replay canceled during handoff');
        },
      });
    };
    return await sendSeyeonNodeOriginalGrantResponseV1({
      response,requestSignal:controller.signal,withLockedOriginalGrant,
    });
  }catch{
    reject(response,503,'SEYEON_ORIGINAL_REPLAY_HOLD');
    return 'reveal_held';
  }finally{
    incoming.off('aborted',abort);
    response.off('close',close);
  }
}
