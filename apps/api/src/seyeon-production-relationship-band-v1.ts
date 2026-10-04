import type { RelationshipStateBand } from '../../../packages/character-content/src/schema.js';
import {
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
  validateSeyeonProductionRelationshipRuntimeStateV1,
  type SeyeonProductionRelationshipRuntimeStateV1,
} from '../../../packages/domain/src/index.js';
import type { SeyeonRelationshipBandProjectionV1 } from './seyeon-production-relationship-read-v1.js';

export const SEYEON_PRODUCTION_RELATIONSHIP_BAND_PROJECTION_VERSION_V1 =
  'seyeon-production-relationship-band-projection-v1' as const;

export const SEYEON_PRODUCTION_RELATIONSHIP_BAND_PROJECTION_AUTHORITY_V1 =
  Object.freeze({
    authority: 'derived_from_production_relationship_policy_v1',
    sourcePolicyVersion:
      PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.payload.policyVersion,
    sourcePolicyContentHash:
      PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.contentHash,
    closenessMediumFloor:
      PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.payload.stageGates
        .S2_REGULAR.scoreFloor.closeness,
    closenessHighFloor:
      PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.payload.stageGates
        .S3_OPENED.scoreFloor.closeness,
    trustMediumFloor:
      PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.payload.stageGates
        .S2_REGULAR.scoreFloor.trust,
    trustHighFloor:
      PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.payload.stageGates
        .S3_OPENED.scoreFloor.trust,
    frictionSource: 'current_condition',
  } as const);

function scoreBand(
  value: number,
  mediumFloor: number,
  highFloor: number,
): RelationshipStateBand {
  if (value >= highFloor) return 'high';
  if (value >= mediumFloor) return 'medium';
  return 'low';
}

function frictionBand(
  condition: SeyeonProductionRelationshipRuntimeStateV1['currentCondition'],
): RelationshipStateBand {
  switch (condition) {
    case 'STABLE':
      return 'low';
    case 'RESOLVED_RECENTLY':
      return 'medium';
    case 'OPEN_CONFLICT':
      return 'high';
  }
}

export function projectSeyeonProductionRelationshipBandsV1(
  input: SeyeonProductionRelationshipRuntimeStateV1,
): SeyeonRelationshipBandProjectionV1 {
  const state = validateSeyeonProductionRelationshipRuntimeStateV1(input);
  const authority =
    SEYEON_PRODUCTION_RELATIONSHIP_BAND_PROJECTION_AUTHORITY_V1;

  return Object.freeze({
    closenessBand: scoreBand(
      state.closeness,
      authority.closenessMediumFloor,
      authority.closenessHighFloor,
    ),
    trustBand: scoreBand(
      state.trust,
      authority.trustMediumFloor,
      authority.trustHighFloor,
    ),
    frictionBand: frictionBand(state.currentCondition),
  });
}
