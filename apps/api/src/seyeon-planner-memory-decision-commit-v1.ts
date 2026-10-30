// Watchtower-Track: security
// Reuse EXISTING S0 DB owner acceptance + explicit Se-yeon Grant in the
// already-verified Member transaction. No extra DML privileges or schema.
import { randomUUID } from 'node:crypto';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import { acceptSeyeonPrivateConversationRecallProposalV1 } from
  './postgres-seyeon-private-memory-proposal-accept-v1.js';
import { createSeyeonOwnedOriginalGrantV1 } from
  './postgres-seyeon-owned-original-grant-v1.js';
import type {
  PlannerMemoryDecisionPlanV1,
  PlannerMemoryChoiceV1,
} from './seyeon-planner-memory-decision-v1.js';

export const SEYEON_PLANNER_DECISION_S0_DB_V1 = Object.freeze({
  scope:'one-accepted-conversation_recall/v1-memory-one-seyeon-grant',
  defaultEnabled:false,
  handles:['character_only','current_characters-single-seyeon'] as const,
  unsupported:['life_fact','multi_character','session_only','discard'] as const,
} as const);

/** Only within the same Owner-approved transaction, with the source Proposal
 * already locked and validated as DB-authored by the Dialogue Planner.
 * The caller MUST NOT commit the transaction if either command throws.
 */
export async function commitSeyeonSingleCharacterPlannerGrantDecisionV1(input: Readonly<{
  client: PostgresTransactionQueryV1;
  canonicalMemberSubjectId: string;
  plan: Readonly<PlannerMemoryDecisionPlanV1>;
}>): Promise<Readonly<{
  proposalId: string;
  decision: PlannerMemoryChoiceV1;
  status: 'resolved';
  persisted: true;
  grantCount: 1;
  payloadPurged: false;
}>> {
  const { client,canonicalMemberSubjectId,plan }=input;
  if (!['character_only','current_characters'].includes(plan.choice) ||
      plan.resolution.resolution!=='accept_long_term' ||
      plan.resolution.durableRecord?.kind!=='memory' ||
      plan.expectedGrantCount!==1 ||
      plan.requiresPayloadErasure ||
      plan.resolution.grants.length!==1 ||
      plan.resolution.grants[0]?.granteeCharacterId!=='seyeon') {
    throw new Error('S0 only supports exactly one Se-yeon Memory Grant.');
  }
  const memoryItemId=randomUUID();
  const grantId=randomUUID();
  const accepted=await acceptSeyeonPrivateConversationRecallProposalV1(client,{
    subjectId:canonicalMemberSubjectId,
    proposalId:plan.proposalId,
    memoryItemId,
    grantChoice:{mode:'private'},
  });
  if(accepted.grantCount!==0 || accepted.memoryItemId!==memoryItemId) {
    throw Error('Private acceptance did not match the exact newly issued record.');
  }
  const granted=await createSeyeonOwnedOriginalGrantV1(client,{
    subjectId:canonicalMemberSubjectId,memoryItemId,grantId,
    grantChoice:{mode:'character_only',characterId:'seyeon'},
  });
  if(granted.grantId!==grantId || granted.memoryItemId!==memoryItemId ||
     granted.characterId!=='seyeon' || granted.replayed!==false) {
    throw Error('Original Se-yeon Grant was not confirmed.');
  }
  return Object.freeze({
    proposalId:plan.proposalId,decision:plan.choice,
    status:'resolved' as const,persisted:true as const,
    grantCount:1 as const,payloadPurged:false as const,
  });
}
