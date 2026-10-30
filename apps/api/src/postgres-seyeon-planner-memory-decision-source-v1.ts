// Watchtower-Track: security
// DB-owned pending Dialogue Planner provenance reader; no raw source, text,
// Memory content, or Grant returned to the HTTP layer.
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import type { DbVerifiedPlannerCandidateV1 } from './seyeon-planner-memory-decision-v1.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SQL=`select
  proposal_id::text as "proposalId",
  proposal_kind as "proposalKind",
  subject_id::text as "subjectId",
  character_id as "characterId",
  current_character_ids as "currentCharacterIds"
from seyeon_private.qry_seyeon_pending_planner_memory_decision_v1(
  $1::uuid,$2::uuid
)`;

export const SEYEON_PLANNER_DECISION_SOURCE_DB_V1=Object.freeze({
  dbFunction:'seyeon_private.qry_seyeon_pending_planner_memory_decision_v1',
  publicApiExecuteGranted:false,
  modelPersonalContextEnabled:false,
  productionMounted:false,
} as const);

export class SeyeonPlannerDecisionSourceHoldV1 extends Error {
  readonly code='SEYEON_PLANNER_DECISION_SOURCE_UNAVAILABLE' as const;
  constructor() {
    super('The DB-owned pending Planner candidate is not available.');
    this.name='SeyeonPlannerDecisionSourceHoldV1';
  }
}

/** Must be called inside the same canonical Member DB transaction as the
 * final decision. The SQL Owner locks Subject -> Proposal -> source rows,
 * and the default ordinary API role cannot execute this until approval.
 */
export async function readSeyeonPendingPlannerMemoryDecisionSourceV1(input:Readonly<{
  client:PostgresTransactionQueryV1;
  canonicalMemberSubjectId:string;
  proposalId:string;
}>):Promise<Readonly<{
  candidate:DbVerifiedPlannerCandidateV1;
  currentEligibleCharacterIds:readonly string[];
}>>{
  if(!UUID.test(input.canonicalMemberSubjectId)||!UUID.test(input.proposalId)) {
    throw new SeyeonPlannerDecisionSourceHoldV1();
  }
  const response=await input.client.query<{
    proposalId:unknown;proposalKind:unknown;subjectId:unknown;
    characterId:unknown;currentCharacterIds:unknown;
  }>(SQL,[input.canonicalMemberSubjectId,input.proposalId]);
  const row=response.rows[0];
  if(response.rows.length!==1 || row?.proposalId!==input.proposalId ||
     row.subjectId!==input.canonicalMemberSubjectId ||
     row.characterId!=='seyeon' || row.proposalKind!=='memory' ||
     !Array.isArray(row.currentCharacterIds) ||
     row.currentCharacterIds.length!==1 ||
     row.currentCharacterIds[0]!=='seyeon') {
    throw new SeyeonPlannerDecisionSourceHoldV1();
  }
  return Object.freeze({
    candidate:Object.freeze({
      proposalId:input.proposalId,
      proposalKind:'memory' as const,
      sourceAuthority:'db_verified_dialogue_planner' as const,
      characterId:'seyeon' as const,status:'pending' as const,
      subjectId:input.canonicalMemberSubjectId,
      sourceTurnCommitted:true as const,
      sourceCharacterMessageVerified:true as const,
    }),
    currentEligibleCharacterIds:Object.freeze(['seyeon']),
  });
}
