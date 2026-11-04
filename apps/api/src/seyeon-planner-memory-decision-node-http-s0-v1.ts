// Watchtower-Track: security
// UC-07 isolated direct Node HTTP. Not mounted in Vercel/Workers/Production.
// An explicit Member choice is committed only against a disposable S0 DB.
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { handleSeyeonPlannerMemoryDecisionRequestV1 } from './seyeon-planner-memory-decision-http-v1.js';
import { readSeyeonPendingPlannerMemoryDecisionSourceV1 } from './postgres-seyeon-planner-memory-decision-source-v1.js';
import { commitSeyeonPlannerMemoryDecisionS0V1 } from './seyeon-planner-memory-decision-commit-v1.js';

const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const PATH=new RegExp('^/api/memory/proposals/('+UUID+')/decision$','iu');
const MAX_REQUEST_PATH_BYTES=256;
const MAX_BODY_BYTES=144;
const MAX_RESPONSE_BYTES=2_048;

export const SEYEON_PLANNER_DECISION_NODE_S0_HTTP_V1=Object.freeze({
  method:'POST',
  path:'/api/memory/proposals/:id/decision',
  productionMounted:false,
  supportsFetchProxy:false,
  permittedDatabase:'disposable_S0_only',
  restoresPastProposals:false,
} as const);

function isDisposable(name:unknown):boolean{
  return name==='myeongha_seyeon_security_s0_test' ||
    (process.env.CI==='true' && process.env.GITHUB_ACTIONS==='true' &&
     process.env.DB_SUITE==='postgres17' && typeof name==='string' &&
     /^myeongha_ci_case_[0-9]+$/u.test(name));
}

function deny(response:ServerResponse,status:number,code:string):void{
  if(response.headersSent||response.writableEnded||response.destroyed){
    if(!response.destroyed)response.destroy();
    return;
  }
  const bytes=Buffer.from(JSON.stringify({
    ok:false,error:{code,retryable:false},
  }),'utf8');
  response.statusCode=status;
  response.setHeader('Content-Type','application/json; charset=utf-8');
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  if(status===405)response.setHeader('Allow','POST');
  response.end(bytes);
}

export interface HandleSeyeonPlannerDecisionNodeHttpS0InputV1 {
  readonly incoming:IncomingMessage;
  readonly response:ServerResponse;
  readonly pool:PostgresSubjectPoolV1;
  readonly identityEvidenceVerifier:IdentityEvidenceVerificationPortV1;
  readonly requestId?:string;
  readonly serverTime?:string;
}

/**
 * The DB authority check is IN THE SAME Member transaction that locks the
 * pending proposal and commits its resolution. It cannot be satisfied by a
 * request flag, model response, environment toggle, or separate preflight.
 * The generic decision handler still has its default DENY if not composed.
 */
export async function handleSeyeonPlannerDecisionNodeHttpS0V1(
  input:HandleSeyeonPlannerDecisionNodeHttpS0InputV1,
):Promise<'decision_sent'|'decision_held'>{
  const {incoming,response}=input;
  const requestId=input.requestId??randomUUID();
  const serverTime=input.serverTime??new Date().toISOString();
  const controller=new AbortController();
  const onAbort=()=>{if(!controller.signal.aborted)controller.abort();};
  const onResponseClose=()=>{if(!response.writableFinished)onAbort();};
  incoming.once('aborted',onAbort);
  response.once('close',onResponseClose);
  try{
    if(!incoming.socket||incoming.socket!==response.socket ||
       response.headersSent||response.writableEnded||response.destroyed||
       typeof incoming.url!=='string'||!incoming.url.startsWith('/')||
       incoming.url.startsWith('//')||
       Buffer.byteLength(incoming.url,'utf8')>MAX_REQUEST_PATH_BYTES||
       !/^[a-zA-Z0-9_-]{1,128}$/u.test(requestId)||
       !Number.isFinite(Date.parse(serverTime))||
       new Date(serverTime).toISOString()!==serverTime){
      deny(response,503,'SEYEON_MEMORY_DECISION_AUTHORITY_UNAVAILABLE');
      return 'decision_held';
    }
    if(incoming.method!=='POST'){
      deny(response,405,'METHOD_NOT_ALLOWED');
      return 'decision_held';
    }
    const url=new URL(incoming.url,'https://myeongha.internal');
    if(url.search!==''||url.hash!==''||!PATH.test(url.pathname)){
      deny(response,404,'NOT_FOUND');
      return 'decision_held';
    }
    const length=incoming.headers['content-length'];
    if(incoming.headers['transfer-encoding']!==undefined &&
       length!==undefined){
      deny(response,400,'INVALID_REQUEST');
      return 'decision_held';
    }
    if(length!==undefined&&(!/^(0|[1-9][0-9]*)$/u.test(length)||
        Number(length)>MAX_BODY_BYTES)){
      deny(response,400,'INVALID_REQUEST');
      return 'decision_held';
    }
    const headers=new Headers();
    for(const [key,value] of Object.entries(incoming.headers)){
      if(Array.isArray(value)){
        for(const part of value)headers.append(key,part);
      }else if(typeof value==='string')headers.set(key,value);
    }
    const request=new Request('https://myeongha.internal'+incoming.url,{
      method:'POST',headers,signal:controller.signal,
      body:Readable.toWeb(incoming) as ReadableStream<Uint8Array>,
      duplex:'half',
    } as RequestInit & {duplex:'half'});

    const result=await handleSeyeonPlannerMemoryDecisionRequestV1({
      request,requestId,serverTime,pool:input.pool,
      identityEvidenceVerifier:input.identityEvidenceVerifier,
      // The actual source loader enforces the exact disposable database
      // INSIDE the same transaction as the Owner decision.
      approvedDecisionWrites:()=>true,
      loadVerifiedPlannerSource:async(args)=>{
        const db=await args.client.query<{dbName:unknown}>(
          'select current_database() as "dbName"',
        );
        if(db.rows.length!==1||!isDisposable(db.rows[0]?.dbName)){
          throw Error('S0 decision requires a disposable database');
        }
        await args.client.query("SET LOCAL lock_timeout = '2000ms'");
        await args.client.query("SET LOCAL statement_timeout = '5000ms'");
        return readSeyeonPendingPlannerMemoryDecisionSourceV1(args);
      },
      commitDecision:commitSeyeonPlannerMemoryDecisionS0V1,
    });
    if(controller.signal.aborted||response.destroyed)return 'decision_held';
    if(![200,400,401,403,404,405,503].includes(result.status)||
       result.headers.get('cache-control')!=='no-store'){
      throw Error('Unsupported decision response');
    }
    const bytes=Buffer.from(await result.arrayBuffer());
    if(bytes.length>MAX_RESPONSE_BYTES)throw Error('Decision response too large');
    if(controller.signal.aborted||response.headersSent||response.writableEnded||
       response.destroyed)return 'decision_held';
    response.statusCode=result.status;
    response.setHeader('Content-Type','application/json; charset=utf-8');
    response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    response.end(bytes);
    return result.status===200?'decision_sent':'decision_held';
  }catch{
    deny(response,503,'SEYEON_MEMORY_DECISION_AUTHORITY_UNAVAILABLE');
    return 'decision_held';
  }finally{
    incoming.off('aborted',onAbort);
    response.off('close',onResponseClose);
  }
}
