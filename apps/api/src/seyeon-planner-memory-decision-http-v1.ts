// Watchtower-Track: security
// UC-07 decision endpoint, configured only by reviewed server authorities.
// The public runtime is unmounted and default DENY while G0/SRC-25/G3/G6
// remain unapproved. The browser never submits a candidate fact or Grant list.
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import {
  planSeyeonPlannerMemoryDecisionV1,
  type DbVerifiedPlannerCandidateV1,
  type PlannerMemoryChoiceV1,
  type PlannerMemoryDecisionPlanV1,
} from './seyeon-planner-memory-decision-v1.js';

export const SEYEON_PLANNER_MEMORY_DECISION_HTTP_V1 = Object.freeze({
  routeTemplate: '/api/memory/proposals/:id/decision',
  method: 'POST',
  defaultDbWriteAdmission: 'DENY',
  publicRouteMounted: false,
  productionPersonalDataEnabled: false,
} as const);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PATH = /^\/api\/memory\/proposals\/([^/]+)\/decision$/u;
const MAX_BYTES = 144;
const MODES = ['session_only','character_only','current_characters','discard'];

type VerifiedPlannerDecisionSourceV1 = Readonly<{
  candidate: DbVerifiedPlannerCandidateV1;
  currentEligibleCharacterIds: readonly string[];
}>;

type CommittedPlannerDecisionV1 = Readonly<{
  proposalId: string;
  decision: PlannerMemoryChoiceV1;
  status: 'resolved';
  persisted: boolean;
  grantCount: number;
  /** True only when original pending Proposal payload was purged in DB. */
  payloadPurged: boolean;
}>;

export interface HandleSeyeonPlannerMemoryDecisionInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly pool: PostgresSubjectPoolV1;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly approvedDecisionWrites?: () => boolean | Promise<boolean>;
  /** Must lock the DB pending Proposal + exact original Character message
   * and return a current participant set inside this same transaction.
   * Model output, HTTP JSON and browser 'server' labels are not sufficient.
   */
  readonly loadVerifiedPlannerSource?: (input: Readonly<{
    client: PostgresTransactionQueryV1;
    canonicalMemberSubjectId: string;
    proposalId: string;
  }>) => Promise<VerifiedPlannerDecisionSourceV1>;
  /** Must atomically resolve the locked proposal and write exactly the
   * records/grants prescribed by the plan, or erase its durable payload.
   * Do not grant API callers direct DML or trust HTTP-supplied character IDs.
   */
  readonly commitDecision?: (input: Readonly<{
    client: PostgresTransactionQueryV1;
    canonicalMemberSubjectId: string;
    plan: Readonly<PlannerMemoryDecisionPlanV1>;
  }>) => Promise<CommittedPlannerDecisionV1>;
}

function reject(status: number, requestId: string, code: string): Response {
  return Response.json({
    ok: false, error: { code, retryable: false },
    meta: { apiContractVersion: 'v0.9', requestId },
  }, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function parseChoice(request: Request): Promise<PlannerMemoryChoiceV1 | null> {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get('content-type')??'') ||
      request.body === null) return null;
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try { reader = request.body.getReader(); } catch { return null; }
  const parts: Uint8Array[] = [];
  let total=0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, rejectDeadline) => {
    timeout=setTimeout(()=>rejectDeadline(Error('Body read deadline')),1500);
  });
  try {
    while(true) {
      if(request.signal.aborted) return null;
      const next=await Promise.race([reader.read(),deadline]);
      if(next.done) break;
      if(!(next.value instanceof Uint8Array)) return null;
      total+=next.value.byteLength;
      if(total>MAX_BYTES) return null;
      parts.push(next.value);
    }
    const bytes=new Uint8Array(total);
    let offset=0;
    for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
    const raw:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!raw || typeof raw!=='object' || Array.isArray(raw)) return null;
    const body=raw as Record<string,unknown>;
    if(Object.keys(body).length!==1 || !Object.hasOwn(body,'choice') ||
       !body.choice || typeof body.choice!=='object' || Array.isArray(body.choice)) return null;
    const choice=body.choice as Record<string,unknown>;
    if(choice.mode==='character_only') {
      return Object.keys(choice).length===2 && choice.characterId==='seyeon'
        ? 'character_only' : null;
    }
    return Object.keys(choice).length===1 && typeof choice.mode==='string' &&
      MODES.includes(choice.mode) ? choice.mode as PlannerMemoryChoiceV1 : null;
  }catch{return null;}
  finally{
    if(timeout!==undefined) clearTimeout(timeout);
    try{void reader.cancel().catch(()=>undefined);}catch{}
    try{reader.releaseLock();}catch{}
  }
}

function exactCommittedReceipt(
  value: CommittedPlannerDecisionV1,
  plan: PlannerMemoryDecisionPlanV1,
): boolean {
  return value && value.proposalId===plan.proposalId &&
    value.decision===plan.choice && value.status==='resolved' &&
    value.persisted===(plan.resolution.durableRecord!==null) &&
    value.grantCount===plan.expectedGrantCount &&
    value.payloadPurged===plan.requiresPayloadErasure &&
    !Object.hasOwn(value,'grantId') && !Object.hasOwn(value,'personalContent');
}

export async function handleSeyeonPlannerMemoryDecisionRequestV1(
  input: HandleSeyeonPlannerMemoryDecisionInputV1,
): Promise<Response> {
  if(typeof input.requestId!=='string' || !input.requestId.trim() ||
     !Number.isFinite(Date.parse(input.serverTime))) {
    throw Error('Invalid server request metadata');
  }
  const { request, requestId }=input;
  const url=new URL(request.url);
  const match=url.search===''&&url.hash===''?PATH.exec(url.pathname):null;
  const proposalId=match?.[1];
  if(!proposalId||!UUID.test(proposalId)) return reject(404,requestId,'NOT_FOUND');
  if(request.method!=='POST') return new Response(null,{status:405,headers:{
    Allow:'POST','Cache-Control':'no-store',
  }});
  const choice=await parseChoice(request);
  if(choice===null) return reject(400,requestId,'INVALID_REQUEST');
  let evidence;
  try { evidence=await input.identityEvidenceVerifier.verifyRequestIdentity(request); }
  catch { return reject(401,requestId,'AUTH_REQUIRED'); }
  if(evidence===null) return reject(401,requestId,'AUTH_REQUIRED');
  if(evidence.kind!=='member') return reject(403,requestId,'MEMBER_REQUIRED');

  let approved=false;
  try {approved=input.approvedDecisionWrites!==undefined &&
    await input.approvedDecisionWrites()===true;}catch{}
  if(!approved || !input.loadVerifiedPlannerSource || !input.commitDecision ||
     request.signal.aborted) {
    return reject(503,requestId,'SEYEON_MEMORY_DECISION_AUTHORITY_UNAVAILABLE');
  }

  try {
    const receipt=await executePostgresSubjectTransactionV1({
      pool:input.pool,verifiedEvidence:evidence,
      execute:async({resolvedSubject,client})=>{
        if(resolvedSubject.subjectKind!=='member') throw Error('Member required');
        const source=await input.loadVerifiedPlannerSource!({
          client,canonicalMemberSubjectId:resolvedSubject.subjectId,proposalId,
        });
        const plan=planSeyeonPlannerMemoryDecisionV1({
          candidate:source.candidate,
          canonicalMemberSubjectId:resolvedSubject.subjectId,
          choice,
          currentEligibleCharacterIds:source.currentEligibleCharacterIds,
        });
        const applied=await input.commitDecision!({
          client,canonicalMemberSubjectId:resolvedSubject.subjectId,plan,
        });
        if(!exactCommittedReceipt(applied,plan)) throw Error('Unverified DB decision');
        return applied;
      },
    });
    return Response.json({
      ok:true,
      data:{
        proposalId:receipt.proposalId,decision:receipt.decision,
        status:'resolved',persisted:receipt.persisted,grantCount:receipt.grantCount,
      },
      meta:{apiContractVersion:'v0.9',requestId,serverTime:input.serverTime},
    },{status:200,headers:{'Cache-Control':'no-store'}});
  }catch{
    return reject(503,requestId,'SEYEON_MEMORY_DECISION_AUTHORITY_UNAVAILABLE');
  }
}
