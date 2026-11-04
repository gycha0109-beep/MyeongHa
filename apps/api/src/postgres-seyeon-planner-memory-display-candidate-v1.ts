// Watchtower-Track: security
// S0 internal proposal inspector. This deliberately does NOT return a
// browser-compatible memoryProposal object. G3 HTTP Reveal/replay still HOLD.
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTROL=/[\u0000-\u001f\u007f]/u;
const SQL=`
select proposal_id::text as "proposalId",
       subject_id::text as "subjectId",
       thread_id::text as "threadId",
       assistant_message_id::text as "assistantMessageId",
       proposal_kind as "proposalKind",summary
from seyeon_private.qry_pending_seyeon_planner_display_candidate_v1(
  $1::uuid,$2::uuid,$3::uuid
)`.trim();

export const SEYEON_PLANNER_MEMORY_DISPLAY_CANDIDATE_V1=Object.freeze({
  dbFunction:'seyeon_private.qry_pending_seyeon_planner_display_candidate_v1',
  productionMounted:false,
  ordinaryApiExecuteGranted:false,
  defaultAdmission:'DENY',
  httpDisclosureAuthorized:false,
  browserCompatible:false,
} as const);

export class SeyeonPlannerDisplayCandidateHoldV1 extends Error {
  readonly code='SEYEON_PLANNER_DISPLAY_CANDIDATE_HOLD' as const;
  constructor(){
    super('Current-rights G3 Reveal is not authorized by a Planner candidate.');
    this.name='SeyeonPlannerDisplayCandidateHoldV1';
  }
}

export interface InternalSeyeonPlannerDisplayCandidateV1 {
  readonly sourceAuthority:'db_owner_planner_inspection_only';
  readonly disclosureAuthorized:false;
  readonly subjectId:string;
  readonly threadId:string;
  readonly assistantMessageId:string;
  readonly proposalId:string;
  readonly proposalKind:'memory';
  readonly summary:string;
}

/** Internal S0 inspection only. The caller MUST already have the same
 * canonical Member subject transaction as the underlying owner RPC. Do
 * not project this value to HTTP, Chat/Replay, model or browser code.
 */
export async function inspectSeyeonPlannerDisplayCandidateS0V1(input: Readonly<{
  client:PostgresTransactionQueryV1;
  canonicalMemberSubjectId:string;
  threadId:string;
  assistantMessageId:string;
  approvedInternalS0Inspection?:()=>boolean|Promise<boolean>;
}>):Promise<Readonly<InternalSeyeonPlannerDisplayCandidateV1>|null> {
  const {canonicalMemberSubjectId,threadId,assistantMessageId}=input;
  if(!UUID.test(canonicalMemberSubjectId)||!UUID.test(threadId)||
     !UUID.test(assistantMessageId)||!input.client||
     typeof input.client.query!=='function') {
    throw new SeyeonPlannerDisplayCandidateHoldV1();
  }
  let allowed=false;
  try{
    allowed=input.approvedInternalS0Inspection!==undefined &&
      (await input.approvedInternalS0Inspection())===true;
  }catch{
    allowed=false;
  }
  if(!allowed)throw new SeyeonPlannerDisplayCandidateHoldV1();

  const result=await input.client.query<{
    proposalId:unknown;
    subjectId:unknown;
    threadId:unknown;
    assistantMessageId:unknown;
    proposalKind:unknown;
    summary:unknown;
  }>(SQL,[canonicalMemberSubjectId,threadId,assistantMessageId]);
  if(result.rows.length===0)return null;
  const row=result.rows[0];
  if(result.rows.length!==1||row===undefined||
     typeof row.proposalId!=='string'||!UUID.test(row.proposalId)||
     row.subjectId!==canonicalMemberSubjectId||
     row.threadId!==threadId||
     row.assistantMessageId!==assistantMessageId||
     row.proposalKind!=='memory'||
     typeof row.summary!=='string'||row.summary.length<1||
     row.summary.length>4000||row.summary.trim()!==row.summary||
     CONTROL.test(row.summary)) {
    throw new SeyeonPlannerDisplayCandidateHoldV1();
  }
  return Object.freeze({
    sourceAuthority:'db_owner_planner_inspection_only' as const,
    disclosureAuthorized:false as const,
    subjectId:canonicalMemberSubjectId,threadId,assistantMessageId,
    proposalId:row.proposalId,
    proposalKind:'memory' as const,
    summary:row.summary,
  });
}
