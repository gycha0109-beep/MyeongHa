import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
  assembleSeyeonRuntimeContextV2,
  projectSeyeonProductionRelationshipRuntimeOverlayV1,
  type SeyeonProductionRelationshipRuntimeStateV1,
} from '../packages/domain/src/index.js';
import {
  SeyeonProductionRelationshipReadErrorV1,
  readSeyeonProductionRelationshipTurnBindingV1,
} from '../apps/api/src/seyeon-production-relationship-read-v1.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';

function state(
  overrides: Partial<SeyeonProductionRelationshipRuntimeStateV1> = {},
): SeyeonProductionRelationshipRuntimeStateV1 {
  return Object.freeze({
    stateId: '22222222-2222-4222-8222-222222222222',
    subjectId: SUBJECT_ID,
    characterId: 'seyeon',
    closeness: 72,
    trust: 68,
    friction: 21,
    attainedStage: 'S3_OPENED',
    currentCandidateStage: 'S3_OPENED',
    currentCondition: 'OPEN_CONFLICT',
    policyVersion: 'relationship-policy-v1',
    policyContentHash: PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.contentHash,
    policyStateSchemaVersion: 'relationship-policy-state-v1',
    policyStateJsonb: Object.freeze({
      evaluatedEventCount: 12,
      behaviorAccess: 'RESTRICTED_BY_CONFLICT',
    }),
    revision: 12,
    lastInteractionAt: '2026-09-28T03:00:00.000Z',
    updatedAt: '2026-09-28T03:00:01.000Z',
    ...overrides,
  });
}

describe('Se-yeon Production relationship runtime V1', () => {
  it('derives conflict-restricted behavior access from the frozen Production policy', () => {
    const overlay = projectSeyeonProductionRelationshipRuntimeOverlayV1(
      state(),
    );

    expect(overlay.source).toMatchObject({
      relationshipRevision: 12,
      attainedStage: 'S3_OPENED',
      currentCandidateStage: 'S3_OPENED',
      policyVersion: 'relationship-policy-v1',
    });
    expect(overlay.currentCondition).toBe('OPEN_CONFLICT');
    expect(overlay.behaviorAccess).toBe('RESTRICTED_BY_CONFLICT');
    expect(overlay.constraints).toEqual({
      mayOverrideRelationshipState: true,
      mayOverrideRelationshipBands: false,
      mayUnlockDisclosure: false,
      mayCreateCharacterFact: false,
      mayCreateSharedHistory: false,
      mayCreateRelationshipEvent: false,
      mayMutateRelationshipState: false,
      mayAppendDurableMemory: false,
    });
  });

  it('returns an empty turn binding without inventing a baseline relationship', async () => {
    const result = await readSeyeonProductionRelationshipTurnBindingV1({
      resolvedSubjectId: SUBJECT_ID,
      bandProjection: null,
      authorityPort: {
        readCurrent: () => [],
      },
    });

    expect(result).toEqual({
      version: 'seyeon-production-relationship-read-v1',
      relationshipRevisionUsedForTurn: null,
      relationship: null,
      relationshipSemantics: null,
      freshness: 'EMPTY',
    });
  });

  it('pins the exact Production revision/stage/policy while preserving governed bands', async () => {
    const result = await readSeyeonProductionRelationshipTurnBindingV1({
      resolvedSubjectId: SUBJECT_ID,
      bandProjection: {
        closenessBand: 'high',
        trustBand: 'medium',
        frictionBand: 'low',
      },
      authorityPort: {
        readCurrent: () => [state()],
      },
    });

    expect(result.relationshipRevisionUsedForTurn).toBe(12);
    expect(result.relationship).toEqual({
      stageKey: 'S3_OPENED',
      closenessBand: 'high',
      trustBand: 'medium',
      frictionBand: 'low',
      revision: 12,
      policyVersion: 'relationship-policy-v1',
    });
    expect(result.relationshipSemantics?.behaviorAccess).toBe(
      'RESTRICTED_BY_CONFLICT',
    );
  });

  it('fails closed when Production state exists but no governed band projection is available', async () => {
    await expect(
      readSeyeonProductionRelationshipTurnBindingV1({
        resolvedSubjectId: SUBJECT_ID,
        bandProjection: null,
        authorityPort: {
          readCurrent: () => [state()],
        },
      }),
    ).rejects.toBeInstanceOf(SeyeonProductionRelationshipReadErrorV1);
  });

  it('admits a Production overlay into Se-yeon context only at the exact pinned revision/stage/policy', () => {
    const runtimeState = state({
      currentCondition: 'RESOLVED_RECENTLY',
      revision: 15,
    });
    const overlay =
      projectSeyeonProductionRelationshipRuntimeOverlayV1(runtimeState);

    const context = assembleSeyeonRuntimeContextV2({
      relationship: {
        stageKey: runtimeState.attainedStage,
        closenessBand: 'high',
        trustBand: 'high',
        frictionBand: 'medium',
        revision: 15,
        policyVersion: runtimeState.policyVersion,
      },
      relationshipSemantics: overlay,
      recentMessages: [],
      disclosure: { decision: null, retrievedSources: [] },
      retrievedMemories: [],
    });

    expect(context.relationshipSemantics?.authority).toBe(
      'production_relationship_behavior_authority_v1',
    );
    expect(context.relationshipSemantics?.behaviorAccess).toBe(
      'CAUTIOUS_AFTER_REPAIR',
    );
    expect(context.relationshipSemantics?.constraints.mayUnlockDisclosure).toBe(
      false,
    );

    expect(() =>
      assembleSeyeonRuntimeContextV2({
        relationship: {
          stageKey: runtimeState.attainedStage,
          closenessBand: 'high',
          trustBand: 'high',
          frictionBand: 'medium',
          revision: 14,
          policyVersion: runtimeState.policyVersion,
        },
        relationshipSemantics: overlay,
        recentMessages: [],
        disclosure: { decision: null, retrievedSources: [] },
        retrievedMemories: [],
      }),
    ).toThrow(/exact relationship revision\/stage\/policy/i);
  });

  it('does not convert S4_SPECIAL into disclosure authority or romance authority', () => {
    const overlay = projectSeyeonProductionRelationshipRuntimeOverlayV1(
      state({
        attainedStage: 'S4_SPECIAL',
        currentCandidateStage: 'S4_SPECIAL',
        currentCondition: 'STABLE',
      }),
    );

    expect(overlay.source.attainedStage).toBe('S4_SPECIAL');
    expect(overlay.constraints.mayUnlockDisclosure).toBe(false);
    expect(overlay.constraints.mayCreateCharacterFact).toBe(false);
    expect(overlay.constraints.mayCreateSharedHistory).toBe(false);
  });
});
