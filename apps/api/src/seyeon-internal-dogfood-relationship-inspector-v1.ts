import {
  replayProductionRelationshipHistoryV1,
  type ProductionRelationshipBehaviorAccessV1,
  type ProductionRelationshipConditionV1,
  type ProductionRelationshipEventKindV1,
  type ProductionRelationshipStageV1,
} from '../../../packages/domain/src/index.js';
import type {
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import {
  projectSeyeonProductionRelationshipBandsV1,
} from './seyeon-production-relationship-band-v1.js';
import type {
  SeyeonProductionContextReadAuthorityPortV1,
} from './seyeon-production-context-read-v1.js';
import {
  readSeyeonProductionRelationshipTurnBindingV1,
  type SeyeonProductionRelationshipReadAuthorityPortV1,
} from './seyeon-production-relationship-read-v1.js';
import {
  createSeyeonProductionSubjectTransactionRunnerV1,
} from './seyeon-production-subject-transaction-v1.js';
import {
  createSeyeonProductionTransactionalPortsV1,
} from './seyeon-production-transactional-ports-v1.js';
import type {
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';

export const SEYEON_INTERNAL_DOGFOOD_RELATIONSHIP_INSPECTOR_VERSION_V1 =
  'seyeon-internal-dogfood-relationship-inspector-v1' as const;

export interface SeyeonInternalDogfoodRelationshipInspectionV1 {
  readonly version:
    typeof SEYEON_INTERNAL_DOGFOOD_RELATIONSHIP_INSPECTOR_VERSION_V1;
  readonly subjectId: string;
  readonly relationship:
    | Readonly<{
        readonly revision: number;
        readonly attainedStage: ProductionRelationshipStageV1;
        readonly currentCandidateStage: ProductionRelationshipStageV1;
        readonly currentCondition: ProductionRelationshipConditionV1;
        readonly behaviorAccess: ProductionRelationshipBehaviorAccessV1;
        readonly closenessBand: 'low' | 'medium' | 'high';
        readonly trustBand: 'low' | 'medium' | 'high';
        readonly frictionBand: 'low' | 'medium' | 'high';
      }>
    | null;
  readonly activeEventKinds:
    readonly ProductionRelationshipEventKindV1[];
  readonly activeEventIds: readonly string[];
}

export interface SeyeonInternalDogfoodRelationshipInspectorV1 {
  inspect(input: {
    readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  }): Promise<SeyeonInternalDogfoodRelationshipInspectionV1>;
}

export async function inspectSeyeonInternalDogfoodRelationshipV1(input: {
  readonly subjectId: string;
  readonly relationshipReadPort:
    SeyeonProductionRelationshipReadAuthorityPortV1;
  readonly contextReadPort:
    SeyeonProductionContextReadAuthorityPortV1;
}): Promise<SeyeonInternalDogfoodRelationshipInspectionV1> {
  const binding =
    await readSeyeonProductionRelationshipTurnBindingV1({
      resolvedSubjectId: input.subjectId,
      authorityPort: input.relationshipReadPort,
      bandProjector: Object.freeze({
        project: projectSeyeonProductionRelationshipBandsV1,
      }),
    });

  const revision =
    binding.relationshipRevisionUsedForTurn ?? 0;
  const history = await input.contextReadPort.readRelationshipHistory({
    subjectId: input.subjectId,
    characterId: 'seyeon',
    throughRevision: revision,
  });
  const replay = replayProductionRelationshipHistoryV1(history);

  if (replay.physicalRevision !== revision) {
    throw new Error(
      'Dogfood relationship inspection history does not match the current Production revision.',
    );
  }

  if (binding.relationship === null) {
    if (revision !== 0 || replay.activeEvents.length !== 0) {
      throw new Error(
        'Empty dogfood relationship binding disagrees with Production history.',
      );
    }
    return Object.freeze({
      version:
        SEYEON_INTERNAL_DOGFOOD_RELATIONSHIP_INSPECTOR_VERSION_V1,
      subjectId: input.subjectId,
      relationship: null,
      activeEventKinds: Object.freeze([]),
      activeEventIds: Object.freeze([]),
    });
  }

  const semantics = binding.relationshipSemantics;
  if (semantics === null) {
    throw new Error(
      'Current Production relationship is missing its behavior overlay.',
    );
  }

  return Object.freeze({
    version:
      SEYEON_INTERNAL_DOGFOOD_RELATIONSHIP_INSPECTOR_VERSION_V1,
    subjectId: input.subjectId,
    relationship: Object.freeze({
      revision: binding.relationship.revision,
      attainedStage: semantics.source.attainedStage,
      currentCandidateStage:
        semantics.source.currentCandidateStage,
      currentCondition: semantics.currentCondition,
      behaviorAccess: semantics.behaviorAccess,
      closenessBand: binding.relationship.closenessBand,
      trustBand: binding.relationship.trustBand,
      frictionBand: binding.relationship.frictionBand,
    }),
    activeEventKinds: Object.freeze(
      replay.activeEvents.map((event) => event.eventKind),
    ),
    activeEventIds: Object.freeze(
      replay.activeEvents.map((event) => event.eventId),
    ),
  });
}

export function createProductionSeyeonInternalDogfoodRelationshipInspectorV1(
  input: {
    readonly pool: PostgresSubjectPoolV1;
  },
): SeyeonInternalDogfoodRelationshipInspectorV1 {
  return Object.freeze({
    async inspect(request) {
      const runner =
        createSeyeonProductionSubjectTransactionRunnerV1({
          pool: input.pool,
          verifiedEvidence: request.verifiedEvidence,
        });
      const resolved = await runner.resolveSubject();
      const ports = createSeyeonProductionTransactionalPortsV1({
        subjectId: resolved.subjectId,
        runner,
      });

      return await inspectSeyeonInternalDogfoodRelationshipV1({
        subjectId: resolved.subjectId,
        relationshipReadPort: ports.relationshipRead,
        contextReadPort: ports.contextRead,
      });
    },
  });
}
