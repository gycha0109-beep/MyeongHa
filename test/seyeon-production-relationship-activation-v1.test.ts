import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
  projectSeyeonProductionRelationshipRuntimeOverlayV1,
} from '../packages/domain/src/index.js';
import {
  resolveSeyeonProductionRelationshipActivationV1,
} from '../apps/api/src/seyeon-production-relationship-activation-v1.js';

const overlay = projectSeyeonProductionRelationshipRuntimeOverlayV1({
  stateId: '11111111-1111-4111-8111-111111111111',
  subjectId: '22222222-2222-4222-8222-222222222222',
  characterId: 'seyeon',
  closeness: 80,
  trust: 76,
  friction: 5,
  attainedStage: 'S4_SPECIAL',
  currentCandidateStage: 'S4_SPECIAL',
  currentCondition: 'STABLE',
  policyVersion: 'relationship-policy-v1',
  policyContentHash: PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.contentHash,
  policyStateSchemaVersion: 'relationship-policy-state-v1',
  policyStateJsonb: {},
  revision: 44,
  lastInteractionAt: null,
  updatedAt: '2026-09-28T04:00:00.000Z',
});

const binding = {
  version: 'seyeon-production-relationship-read-v1' as const,
  relationshipRevisionUsedForTurn: 44,
  relationship: {
    stageKey: 'S4_SPECIAL',
    closenessBand: 'high' as const,
    trustBand: 'high' as const,
    frictionBand: 'low' as const,
    revision: 44,
    policyVersion: 'relationship-policy-v1',
  },
  relationshipSemantics: overlay,
  freshness: 'CURRENT' as const,
};

describe('Se-yeon Production relationship activation V1', () => {
  it('keeps OFF fully inactive', () => {
    expect(
      resolveSeyeonProductionRelationshipActivationV1({
        mode: 'OFF',
        turnBinding: binding,
      }),
    ).toMatchObject({
      admissionEnabled: false,
      productionWriteEnabled: false,
      behaviorShadowEnabled: false,
      behaviorLiveEnabled: false,
      appliedRelationshipSemantics: null,
    });
  });

  it('keeps WRITE_DARK writing without changing live behavior', () => {
    expect(
      resolveSeyeonProductionRelationshipActivationV1({
        mode: 'WRITE_DARK',
        turnBinding: binding,
      }),
    ).toMatchObject({
      admissionEnabled: true,
      productionWriteEnabled: true,
      behaviorShadowEnabled: false,
      behaviorLiveEnabled: false,
      appliedRelationshipSemantics: null,
      shadowRelationshipSemantics: null,
    });
  });

  it('keeps BEHAVIOR_SHADOW writes active while exposing only a shadow overlay', () => {
    const result = resolveSeyeonProductionRelationshipActivationV1({
      mode: 'BEHAVIOR_SHADOW',
      turnBinding: binding,
    });

    expect(result.productionWriteEnabled).toBe(true);
    expect(result.behaviorShadowEnabled).toBe(true);
    expect(result.behaviorLiveEnabled).toBe(false);
    expect(result.appliedRelationshipSemantics).toBeNull();
    expect(result.shadowRelationshipSemantics).toBe(overlay);
  });

  it('applies the Production overlay only in LIVE', () => {
    const result = resolveSeyeonProductionRelationshipActivationV1({
      mode: 'LIVE',
      turnBinding: binding,
    });

    expect(result.productionWriteEnabled).toBe(true);
    expect(result.behaviorLiveEnabled).toBe(true);
    expect(result.appliedRelationshipSemantics).toBe(overlay);
    expect(result.shadowRelationshipSemantics).toBeNull();
  });
});
