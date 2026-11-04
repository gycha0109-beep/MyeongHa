// Watchtower-Track: security
// UC-06 S0: direct Node socket only, never mounted on a public/Vercel route.
// The sole disclosed content is the DB-owned *pending proposal summary*.
// It is NOT prior chat, a personal Memory/Grant, or a G3 production approval.
import type { ServerResponse } from 'node:http';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import { inspectSeyeonPlannerDisplayCandidateS0V1 } from
  './postgres-seyeon-planner-memory-display-candidate-v1.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_DEADLINE_MS=10_000;
const MAX_JSON_BYTES=24_000;

export const SEYEON_PLANNER_PENDING_PROPOSAL_NODE_S0_V1=Object.freeze({
  productionMounted:false,
  allowsFetchProxy:false,
  allowsChatHistory:false,
  supportsReplay:'fresh_DB_current_pending_only',
  httpTransport:'direct_node_socket',
  modelAndGrantActivation:false,
} as const);

export class SeyeonPlannerPendingNodeRevealHoldV1 extends Error {
  readonly code='SEYEON_PLANNER_PENDING_NODE_REVEAL_HOLD' as const;
  constructor() {
    super('Isolated Member-owned pending Planner proposal is unavailable.');
    this.name='SeyeonPlannerPendingNodeRevealHoldV1';
  }
}

export interface SeyeonPendingProposalNodeS0InputV1 {
  readonly response:ServerResponse;
  readonly requestSignal:AbortSignal;
  readonly pool:PostgresSubjectPoolV1;
  /** Verified by the hosting server, never submitted in the HTTP body. */
  readonly verifiedEvidence:VerifiedSubjectIdentityEvidenceV1;
  readonly serverThreadId:string;
  readonly serverAssistantMessageId:string;
  readonly requestId:string;
  readonly deadlineMs?:number;
}

const ERROR_BODY=Buffer.from(JSON.stringify({
  ok:false,error:{code:'SEYEON_PLANNER_PENDING_REVEAL_UNAVAILABLE',retryable:false},
}),'utf8');

function disposableDb(name:unknown):boolean {
  return name==='myeongha_seyeon_security_s0_test' ||
    (process.env.CI==='true' && process.env.GITHUB_ACTIONS==='true' &&
      process.env.DB_SUITE==='postgres17' && typeof name==='string' &&
      /^myeongha_ci_case_[0-9]+$/u.test(name));
}

function safeSend(response:ServerResponse,body:Buffer,status:number):void{
  response.statusCode=status;
  response.setHeader('Content-Type','application/json; charset=utf-8');
  response.setHeader('Cache-Control','no-store, no-transform');
  response.setHeader('Content-Encoding','identity');
  response.setHeader('X-Content-Type-Options','nosniff');
  response.end(body);
}

/**
 * Every invocation, including a repeat request, resolves the current Member
 * and locks the exact DB-owned pending proposal and original assistant source.
 * The transaction stays open until Node 'finish' (OS handoff), serializing
 * competing discard/consent/expiry. This does NOT prove final proxy arrival.
 */
export async function sendSeyeonPendingPlannerProposalNodeS0V1(
  input:SeyeonPendingProposalNodeS0InputV1,
):Promise<'proposal_sent'|'proposal_withheld'> {
  const {response,requestSignal}=input;
  const deadlineMs=input.deadlineMs??5_000;
  if (!response || response.headersSent || response.writableEnded ||
      response.destroyed || requestSignal?.aborted ||
      !Number.isSafeInteger(deadlineMs) || deadlineMs<100 ||
      deadlineMs>MAX_DEADLINE_MS ||
      input.verifiedEvidence?.kind!=='member' ||
      !UUID.test(input.verifiedEvidence.verifiedAuthUserId) ||
      !UUID.test(input.serverThreadId) ||
      !UUID.test(input.serverAssistantMessageId) ||
      !/^[a-zA-Z0-9_-]{1,128}$/u.test(input.requestId)) {
    if(response && !response.destroyed)response.destroy();
    throw new SeyeonPlannerPendingNodeRevealHoldV1();
  }

  let attempted=false;
  const controller=new AbortController();
  const abort=()=>{
    if(!controller.signal.aborted)controller.abort();
    if(!response.destroyed)response.destroy();
  };
  const onClose=()=>{if(!response.writableFinished)abort();};
  response.on('close',onClose);
  requestSignal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,deadlineMs);
  try{
    let outcome:'proposal_sent'|'proposal_withheld'='proposal_withheld';
    await executePostgresSubjectTransactionV1({
      pool:input.pool,
      verifiedEvidence:input.verifiedEvidence,
      execute:async({resolvedSubject,client})=>{
        if(controller.signal.aborted||resolvedSubject.subjectKind!=='member'){
          throw new SeyeonPlannerPendingNodeRevealHoldV1();
        }
        const db=await client.query<{dbName:unknown}>(
          'select current_database() as "dbName"',
        );
        if(db.rows.length!==1||!disposableDb(db.rows[0]?.dbName)){
          throw new SeyeonPlannerPendingNodeRevealHoldV1();
        }
        await client.query("SET LOCAL lock_timeout = '2000ms'");
        await client.query("SET LOCAL statement_timeout = '5000ms'");
        const found=await inspectSeyeonPlannerDisplayCandidateS0V1({
          client,canonicalMemberSubjectId:resolvedSubject.subjectId,
          threadId:input.serverThreadId,
          assistantMessageId:input.serverAssistantMessageId,
          approvedInternalS0Inspection:()=>true,
        });
        if(controller.signal.aborted)throw new SeyeonPlannerPendingNodeRevealHoldV1();
        const payload=found===null?ERROR_BODY:Buffer.from(JSON.stringify({
          ok:true,
          data:{
            threadId:found.threadId,
            assistantMessageId:found.assistantMessageId,
            memoryProposal:{
              sourceAuthority:'server_dialogue_planner',
              characterId:'seyeon',
              proposalId:found.proposalId,
              proposalKind:found.proposalKind,
              proposalState:'pending',
              summary:found.summary,
            },
          },
          meta:{apiContractVersion:'v0.9',requestId:input.requestId},
        }),'utf8');
        if(payload.length>MAX_JSON_BYTES){
          throw new SeyeonPlannerPendingNodeRevealHoldV1();
        }
        await new Promise<void>((resolve,reject)=>{
          let finished=false;
          const cleanup=()=>{
            response.off('finish',onFinish);
            response.off('close',onFailure);
            response.off('error',onFailure);
            controller.signal.removeEventListener('abort',onFailure);
          };
          const onFinish=()=>{finished=true;cleanup();resolve();};
          const onFailure=()=>{if(finished)return;cleanup();
            reject(new SeyeonPlannerPendingNodeRevealHoldV1());};
          response.once('finish',onFinish);
          response.once('close',onFailure);
          response.once('error',onFailure);
          controller.signal.addEventListener('abort',onFailure,{once:true});
          try{
            if(controller.signal.aborted||response.destroyed||response.headersSent){
              throw new SeyeonPlannerPendingNodeRevealHoldV1();
            }
            attempted=true;
            safeSend(response,payload,found===null?503:200);
          }catch{onFailure();}
        });
        if(controller.signal.aborted)throw new SeyeonPlannerPendingNodeRevealHoldV1();
        outcome=found===null?'proposal_withheld':'proposal_sent';
      },
    });
    return outcome;
  }catch{
    if(!attempted&&!controller.signal.aborted&&!response.headersSent &&
       !response.writableEnded&&!response.destroyed){
      attempted=true;
      try{safeSend(response,ERROR_BODY,503);}catch{response.destroy();}
    }else if(attempted&&!response.writableFinished&&!response.destroyed){
      response.destroy();
    }
    return 'proposal_withheld';
  }finally{
    clearTimeout(timer);
    response.off('close',onClose);
    requestSignal.removeEventListener('abort',abort);
  }
}
