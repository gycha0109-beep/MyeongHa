// Watchtower-Track: security
// UC-06 S0 direct Node-only GET. No production or proxy route mounts this.
// Fetch identity is verified before current DB-owner pending-proposal authority.
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { sendSeyeonPendingPlannerProposalNodeS0V1 } from
  './seyeon-planner-pending-proposal-node-reveal-s0-v1.js';

const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const ROUTE=new RegExp('^/api/chat/('+UUID+')/planner-proposals/('+UUID+')$','iu');

export const SEYEON_PLANNER_PENDING_PROPOSAL_NODE_HTTP_S0_V1=Object.freeze({
  method:'GET',
  route:'/api/chat/:threadId/planner-proposals/:assistantMessageId',
  productionMounted:false,
  supportsFetchProxy:false,
  requiresMember:true,
} as const);

export interface HandleSeyeonPendingPlannerNodeHttpS0InputV1 {
  readonly incoming:IncomingMessage;
  readonly response:ServerResponse;
  readonly pool:PostgresSubjectPoolV1;
  readonly identityEvidenceVerifier:IdentityEvidenceVerificationPortV1;
  readonly requestId?:string;
}

function refuse(response:ServerResponse,status:number,code:string):void{
  if(response.headersSent||response.writableEnded||response.destroyed){
    if(!response.destroyed)response.destroy();
    return;
  }
  const body=Buffer.from(JSON.stringify({
    ok:false,error:{code,retryable:false},
  }),'utf8');
  response.statusCode=status;
  response.setHeader('Content-Type','application/json; charset=utf-8');
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  if(status===405)response.setHeader('Allow','GET');
  response.end(body);
}

export async function handleSeyeonPendingPlannerNodeHttpS0V1(
  input:HandleSeyeonPendingPlannerNodeHttpS0InputV1,
):Promise<'proposal_sent'|'proposal_withheld'|'preflight_denied'>{
  const {incoming,response}=input;
  const requestId=input.requestId??randomUUID();
  const abort=new AbortController();
  const onDisconnect=()=>{if(!response.writableFinished)abort.abort();};
  incoming.once('aborted',onDisconnect);
  response.once('close',onDisconnect);
  try{
    if(!incoming.socket || incoming.socket!==response.socket ||
       response.headersSent || response.writableEnded || response.destroyed ||
       !/^[a-zA-Z0-9_-]{1,128}$/u.test(requestId) ||
       typeof incoming.url!=='string' ||
       Buffer.byteLength(incoming.url,'utf8')>256 ||
       !incoming.url.startsWith('/') || incoming.url.startsWith('//')){
      refuse(response,503,'SEYEON_PLANNER_PENDING_REVEAL_UNAVAILABLE');
      return 'preflight_denied';
    }
    if(incoming.method!=='GET'){
      refuse(response,405,'METHOD_NOT_ALLOWED');
      return 'preflight_denied';
    }
    if(incoming.headers['transfer-encoding']!==undefined ||
       incoming.headers['content-length']!==undefined){
      refuse(response,400,'INVALID_REQUEST');
      return 'preflight_denied';
    }
    const url=new URL(incoming.url,'https://myeongha.internal');
    const match=url.search===''&&url.hash==='' ? ROUTE.exec(url.pathname) : null;
    if(match===null||match[1]===undefined||match[2]===undefined){
      refuse(response,404,'NOT_FOUND');
      return 'preflight_denied';
    }
    const headers=new Headers();
    for(const [key,value] of Object.entries(incoming.headers)){
      if(Array.isArray(value)){for(const part of value)headers.append(key,part);}
      else if(typeof value==='string')headers.set(key,value);
    }
    const request=new Request('https://myeongha.internal'+incoming.url,{
      method:'GET',headers,signal:abort.signal,
    });
    const evidence=await input.identityEvidenceVerifier.verifyRequestIdentity(request);
    if(abort.signal.aborted||response.destroyed)return 'proposal_withheld';
    if(evidence===null){
      refuse(response,401,'AUTH_REQUIRED');
      return 'preflight_denied';
    }
    if(evidence.kind!=='member'){
      refuse(response,403,'MEMBER_REQUIRED');
      return 'preflight_denied';
    }
    return await sendSeyeonPendingPlannerProposalNodeS0V1({
      pool:input.pool,verifiedEvidence:evidence,response,
      requestSignal:abort.signal,
      serverThreadId:match[1],serverAssistantMessageId:match[2],
      requestId,
    });
  }catch{
    refuse(response,503,'SEYEON_PLANNER_PENDING_REVEAL_UNAVAILABLE');
    return 'proposal_withheld';
  }finally{
    incoming.off('aborted',onDisconnect);
    response.off('close',onDisconnect);
  }
}
