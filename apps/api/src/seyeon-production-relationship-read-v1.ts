import type { RelationshipStateBand } from '../../../packages/character-content/src/schema.js';
import {
  projectSeyeonProductionRelationshipRuntimeOverlayV1,
  validateSeyeonProductionRelationshipRuntimeStateV1,
  type SeyeonProductionRelationshipRuntimeOverlayV1,
  type SeyeonProductionRelationshipRuntimeStateV1,
  type SeyeonRelationshipContextV2,
} from '../../../packages/domain/src/index.js';

type Awaitable<T> = T | Promise<T>;

export const SEYEON_PRODUCTION_RELATIONSHIP_READ_VERSION_V1 =
  'seyeon-production-relationship-read-v1' as const;

export interface SeyeonProductionRelationshipReadAuthorityPortV1 {
  readCurrent(input: {
    readonly subjectId: string;
    readonly characterId: 'seyeon';
  }): Awaitable<readonly SeyeonProductionRelationshipRuntimeStateV1[]>;
}

export interface SeyeonRelationshipBandProjectionV1 {
  readonly closenessBand: RelationshipStateBand;
  readonly trustBand: RelationshipStateBand;
  readonly frictionBand: RelationshipStateBand;
}

export interface SeyeonProductionRelationshipTurnBindingV1 {
  readonly version: typeof SEYEON_PRODUCTION_RELATIONSHIP_READ_VERSION_V1;
  readonly relationshipRevisionUsedForTurn: number | null;
  readonly relationship: SeyeonRelationshipContextV2 | null;
  readonly relationshipSemantics:
    | SeyeonProductionRelationshipRuntimeOverlayV1
    | null;
  readonly freshness: 'EMPTY' | 'CURRENT';
}

export class SeyeonProductionRelationshipReadErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonProductionRelationshipReadErrorV1';
  }
}

function validateBand(
  value: RelationshipStateBand,
  path: string,
): RelationshipStateBand {
  if (!(['low', 'medium', 'high'] as const).includes(value)) {
    throw new SeyeonProductionRelationshipReadErrorV1(
      path + ' is outside the governed relationship band vocabulary.',
    );
  }
  return value;
}

export async function readSeyeonProductionRelationshipTurnBindingV1(input: {
  readonly resolvedSubjectId: string;
  readonly bandProjection: SeyeonRelationshipBandProjectionV1 | null;
  readonly authorityPort: SeyeonProductionRelationshipReadAuthorityPortV1;
}): Promise<SeyeonProductionRelationshipTurnBindingV1> {
  const subjectId = input.resolvedSubjectId.trim();
  if (subjectId.length === 0) {
    throw new SeyeonProductionRelationshipReadErrorV1(
      'Resolved Subject id is required.',
    );
  }

  const rows = await input.authorityPort.readCurrent({
    subjectId,
    characterId: 'seyeon',
  });

  if (rows.length > 1) {
    throw new SeyeonProductionRelationshipReadErrorV1(
      'Production relationship read returned more than one current Se-yeon projection.',
    );
  }
  const row = rows[0];
  if (row === undefined) {
    return Object.freeze({
      version: SEYEON_PRODUCTION_RELATIONSHIP_READ_VERSION_V1,
      relationshipRevisionUsedForTurn: null,
      relationship: null,
      relationshipSemantics: null,
      freshness: 'EMPTY' as const,
    });
  }

  const state = validateSeyeonProductionRelationshipRuntimeStateV1(row);
  if (state.subjectId !== subjectId) {
    throw new SeyeonProductionRelationshipReadErrorV1(
      'Production relationship read returned a different Subject identity.',
    );
  }
  if (input.bandProjection === null) {
    throw new SeyeonProductionRelationshipReadErrorV1(
      'Production relationship exists but governed relationship band projection is unavailable.',
    );
  }

  const relationship = Object.freeze({
    stageKey: state.attainedStage,
    closenessBand: validateBand(
      input.bandProjection.closenessBand,
      'closenessBand',
    ),
    trustBand: validateBand(input.bandProjection.trustBand, 'trustBand'),
    frictionBand: validateBand(
      input.bandProjection.frictionBand,
      'frictionBand',
    ),
    revision: state.revision,
    policyVersion: state.policyVersion,
  });

  return Object.freeze({
    version: SEYEON_PRODUCTION_RELATIONSHIP_READ_VERSION_V1,
    relationshipRevisionUsedForTurn: state.revision,
    relationship,
    relationshipSemantics:
      projectSeyeonProductionRelationshipRuntimeOverlayV1(state),
    freshness: 'CURRENT' as const,
  });
}
