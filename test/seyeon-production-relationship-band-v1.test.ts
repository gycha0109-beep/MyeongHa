import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
} from '../packages/domain/src/index.js';
import {
  SEYEON_PRODUCTION_RELATIONSHIP_BAND_PROJECTION_AUTHORITY_V1,
  projectSeyeonProductionRelationshipBandsV1,
} from '../apps/api/src/seyeon-production-relationship-band-v1.js';

function state(input: {
  closeness: number;
  trust: number;
  friction?: number;
  condition: 'STABLE' | 'RESOLVED_RECENTLY' | 'OPEN_CONFLICT';
}) {
  return {
    stateId: '11111111-1111-4111-8111-111111111111',
    subjectId: '22222222-2222-4222-8222-222222222222',
    characterId: 'seyeon' as const,
    closeness: input.closeness,
    trust: input.trust,
    friction: input.friction ?? 0,
    attainedStage: 'S2_REGULAR' as const,
    currentCandidateStage: 'S2_REGULAR' as const,
    currentCondition: input.condition,
    policyVersion: PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.payload.policyVersion,
    policyContentHash: PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.contentHash,
    policyStateSchemaVersion: 'relationship-policy-state-v1',
    policyStateJsonb: {},
    revision: 7,
    lastInteractionAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
  };
}

describe('Se-yeon Production relationship band projection V1', () => {
  it('derives closeness and trust boundaries from the frozen Production stage gates', () => {
    expect(SEYEON_PRODUCTION_RELATIONSHIP_BAND_PROJECTION_AUTHORITY_V1)
      .toEqual(expect.objectContaining({
        sourcePolicyContentHash:
          PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.contentHash,
        closenessMediumFloor: 25,
        closenessHighFloor: 55,
        trustMediumFloor: 20,
        trustHighFloor: 50,
      }));

    expect(projectSeyeonProductionRelationshipBandsV1(state({
      closeness: 24,
      trust: 19,
      condition: 'STABLE',
    }))).toEqual({
      closenessBand: 'low',
      trustBand: 'low',
      frictionBand: 'low',
    });

    expect(projectSeyeonProductionRelationshipBandsV1(state({
      closeness: 25,
      trust: 20,
      condition: 'STABLE',
    }))).toEqual({
      closenessBand: 'medium',
      trustBand: 'medium',
      frictionBand: 'low',
    });

    expect(projectSeyeonProductionRelationshipBandsV1(state({
      closeness: 55,
      trust: 50,
      condition: 'STABLE',
    }))).toEqual({
      closenessBand: 'high',
      trustBand: 'high',
      frictionBand: 'low',
    });
  });

  it('derives friction band from authoritative relationship condition instead of invented score thresholds', () => {
    expect(projectSeyeonProductionRelationshipBandsV1(state({
      closeness: 30,
      trust: 30,
      friction: 99,
      condition: 'STABLE',
    })).frictionBand).toBe('low');

    expect(projectSeyeonProductionRelationshipBandsV1(state({
      closeness: 30,
      trust: 30,
      friction: 0,
      condition: 'RESOLVED_RECENTLY',
    })).frictionBand).toBe('medium');

    expect(projectSeyeonProductionRelationshipBandsV1(state({
      closeness: 30,
      trust: 30,
      friction: 1,
      condition: 'OPEN_CONFLICT',
    })).frictionBand).toBe('high');
  });
});
