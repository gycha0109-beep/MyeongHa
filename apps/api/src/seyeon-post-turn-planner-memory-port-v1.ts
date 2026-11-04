// Watchtower-Track: security
// Adapter for the existing post-turn claim, with no browser/HTTP fact input.
// In Production, source authority remains OFF-only and model/DB admission
// remains DENY until the original G0/G4 contract is approved.
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 }
  from './subject-identity-resolver.js';
import type { SeyeonStructuredProviderPortV2 }
  from './seyeon-character-runtime-v2.js';
import type { SeyeonPostTurnPlannerMemoryPortV1 }
  from './seyeon-post-turn-analysis-worker-v1.js';
import { runSeyeonPostTurnPlannerMemoryV1 }
  from './seyeon-post-turn-planner-memory-proposal-v1.js';

export const SEYEON_POST_TURN_MEMORY_PORT_V1 = Object.freeze({
  installedInWorker: true,
  sourceTextAdmission: 'EXISTING_POST_TURN_OWNER_AUTHORITY_ONLY',
  productionModelAndDbAdmission: 'DENY',
  createsDurableMemoryOrGrant: false,
} as const);

/**
 * Trusted application composition binds the authenticated Member and
 * governed Provider. Neither a browser request nor an unverified snapshot
 * can choose a Subject, Provider, or Proposal ID.
 */
export function createSeyeonPostTurnPlannerMemoryPortV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  governedProvider: SeyeonStructuredProviderPortV2;
  /** Internal release gate. Absent for Production while G0/G4 HOLD. */
  approvedModelAndDbStage?: () => boolean | Promise<boolean>;
}>): SeyeonPostTurnPlannerMemoryPortV1 {
  return Object.freeze({
    propose: async ({ committedTurn }: Parameters<SeyeonPostTurnPlannerMemoryPortV1['propose']>[0]) => {
      // The underlying runner independently derives canonical Member Subject
      // inside its DB transaction and re-verifies exact original source rows.
      return runSeyeonPostTurnPlannerMemoryV1({
        pool: input.pool,
        verifiedEvidence: input.verifiedEvidence,
        committedTurn,
        governedProvider: input.governedProvider,
        ...(input.approvedModelAndDbStage === undefined
          ? {} : {approvedModelAndDbStage: input.approvedModelAndDbStage}),
      });
    },
  });
}
