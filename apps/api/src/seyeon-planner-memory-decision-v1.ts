// Watchtower-Track: security
// UC-06/07 translates the Member's four choices through the existing domain
// Memory Resolution authority. This is NOT a browser-owned proposal producer.
import { resolveMemoryProposal,
  type MemoryResolutionPlan } from '../../../packages/domain/src/memory-resolution.js';

export type PlannerMemoryChoiceV1 =
  | 'session_only' | 'character_only' | 'current_characters' | 'discard';

export interface DbVerifiedPlannerCandidateV1 {
  readonly proposalId: string;
  readonly proposalKind: 'memory' | 'life_fact';
  readonly sourceAuthority: 'db_verified_dialogue_planner';
  readonly characterId: 'seyeon';
  readonly status: 'pending';
  readonly subjectId: string;
  readonly sourceTurnCommitted: true;
  readonly sourceCharacterMessageVerified: true;
}

export interface PlannerMemoryDecisionPlanV1 {
  readonly choice: PlannerMemoryChoiceV1;
  readonly proposalId: string;
  readonly resolution: MemoryResolutionPlan;
  readonly requiresPayloadErasure: boolean;
  readonly expectedGrantCount: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CHOICES = Object.freeze(['session_only','character_only','current_characters','discard']);

export class PlannerMemoryDecisionHoldV1 extends Error {
  readonly code = 'SEYEON_PLANNER_MEMORY_DECISION_HOLD' as const;
  constructor() {
    super('A DB-verified Planner proposal and explicit Member decision are required.');
    this.name = 'PlannerMemoryDecisionHoldV1';
  }
}

/**
 * The caller must obtain the candidate under a DB owner transaction and lock
 * its pending row. Passing HTTP summary, arbitrary model content or guessed
 * source IDs here is not source authority.
 */
export function planSeyeonPlannerMemoryDecisionV1(input: Readonly<{
  readonly candidate: DbVerifiedPlannerCandidateV1;
  readonly canonicalMemberSubjectId: string;
  readonly choice: PlannerMemoryChoiceV1;
  /** DB-verified current participants snapshot, never HTTP-supplied IDs. */
  readonly currentEligibleCharacterIds: readonly string[];
}>): Readonly<PlannerMemoryDecisionPlanV1> {
  const { candidate, canonicalMemberSubjectId, choice, currentEligibleCharacterIds } = input;
  if (!candidate || candidate.sourceAuthority !== 'db_verified_dialogue_planner' ||
      candidate.characterId !== 'seyeon' || candidate.status !== 'pending' ||
      !['memory','life_fact'].includes(candidate.proposalKind) ||
      candidate.sourceTurnCommitted !== true ||
      candidate.sourceCharacterMessageVerified !== true ||
      !UUID.test(candidate.proposalId) ||
      !UUID.test(candidate.subjectId) ||
      candidate.subjectId !== canonicalMemberSubjectId ||
      !CHOICES.includes(choice) ||
      !Array.isArray(currentEligibleCharacterIds) ||
      currentEligibleCharacterIds.some(x=>typeof x !== 'string' ||
        !/^[a-z][a-z0-9_-]{1,63}$/u.test(x)) ||
      new Set(currentEligibleCharacterIds).size !== currentEligibleCharacterIds.length) {
    throw new PlannerMemoryDecisionHoldV1();
  }
  if (choice === 'current_characters' &&
      (currentEligibleCharacterIds.length === 0 ||
       !currentEligibleCharacterIds.includes('seyeon'))) {
    throw new PlannerMemoryDecisionHoldV1();
  }
  const resolution = resolveMemoryProposal({
    proposalKind: candidate.proposalKind,
    resolution: choice === 'session_only' ? 'session_only'
      : choice === 'discard' ? 'reject' : 'accept_long_term',
    ...(choice === 'character_only'
      ? { grantChoice: { mode: 'character_only' as const, characterId: 'seyeon' } }
      : choice === 'current_characters'
        ? { grantChoice: { mode: 'current_characters' as const } }
        : {}),
    currentEligibleCharacterIds,
  });
  if (resolution.resolution === 'accept_long_term' &&
      (resolution.durableRecord === null || resolution.grants.length === 0)) {
    throw new PlannerMemoryDecisionHoldV1();
  }
  return Object.freeze({
    choice,
    proposalId: candidate.proposalId,
    resolution,
    requiresPayloadErasure: resolution.proposalPayloadDirective === 'must_not_remain_long_term_authority',
    expectedGrantCount: resolution.grants.length,
  });
}
