import { describe, expect, it } from 'vitest';

import {
  projectSeyeonRelationshipRuntimeOverlayV2,
} from '../packages/domain/src/seyeon-relationship-runtime-overlay-v2.js';
import {
  assembleSeyeonRuntimeContextV2,
} from '../packages/domain/src/seyeon-runtime-context-v2.js';

function shadow(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'seyeon-relationship-state-shadow-v2',
    authority: 'experimental_shadow_not_production_authority',
    characterId: 'seyeon',
    attainedStage: 'S4_SPECIAL',
    currentCandidateStage: 'S4_SPECIAL',
    currentCondition: 'OPEN_CONFLICT',
    behaviorAccess: 'RESTRICTED_BY_CONFLICT',
    unresolvedEpisodeIds: ['episode:conflict'],
    causalEventIds: ['event:conflict'],
    ...overrides,
  };
}

function relationship() {
  return {
    stageKey: 'deep_trust',
    closenessBand: 'high' as const,
    trustBand: 'high' as const,
    frictionBand: 'medium' as const,
    revision: 31,
    policyVersion: 'relationship-policy-v1',
  };
}

describe('Se-yeon bounded relationship runtime overlay v2', () => {
  it('projects only present behavior semantics and drops experimental stage/history internals', () => {
    const overlay = projectSeyeonRelationshipRuntimeOverlayV2(shadow());

    expect(overlay).toEqual({
      schemaVersion: 'seyeon-relationship-runtime-overlay-v2',
      authority: 'experimental_behavior_overlay_not_relationship_authority',
      source: {
        schemaVersion: 'seyeon-relationship-state-shadow-v2',
        authority: 'experimental_shadow_not_production_authority',
      },
      characterId: 'seyeon',
      currentCondition: 'OPEN_CONFLICT',
      behaviorAccess: 'RESTRICTED_BY_CONFLICT',
      constraints: {
        mayOverrideRelationshipState: false,
        mayOverrideRelationshipBands: false,
        mayUnlockDisclosure: false,
        mayCreateCharacterFact: false,
        mayCreateSharedHistory: false,
        mayCreateRelationshipEvent: false,
        mayMutateRelationshipState: false,
        mayAppendDurableMemory: false,
      },
    });

    expect('attainedStage' in overlay).toBe(false);
    expect('currentCandidateStage' in overlay).toBe(false);
    expect('unresolvedEpisodeIds' in overlay).toBe(false);
    expect('causalEventIds' in overlay).toBe(false);
    expect(JSON.stringify(overlay)).not.toContain('episode:conflict');
    expect(JSON.stringify(overlay)).not.toContain('event:conflict');
  });

  it.each([
    ['STABLE', 'STAGE_ALIGNED'],
    ['OPEN_CONFLICT', 'RESTRICTED_BY_CONFLICT'],
    ['RESOLVED_RECENTLY', 'CAUTIOUS_AFTER_REPAIR'],
  ] as const)('preserves bounded condition/access pair %s / %s', (currentCondition, behaviorAccess) => {
    const overlay = projectSeyeonRelationshipRuntimeOverlayV2(
      shadow({ currentCondition, behaviorAccess }),
    );
    expect(overlay.currentCondition).toBe(currentCondition);
    expect(overlay.behaviorAccess).toBe(behaviorAccess);
  });

  it('rejects a shadow that tries to present itself as production authority', () => {
    expect(() =>
      projectSeyeonRelationshipRuntimeOverlayV2(
        shadow({ authority: 'production_relationship_authority' }),
      ),
    ).toThrow(/experimental\/non-production/);
  });

  it('rejects stale/unknown shadow schema instead of guessing semantics', () => {
    expect(() =>
      projectSeyeonRelationshipRuntimeOverlayV2(
        shadow({ schemaVersion: 'seyeon-relationship-state-shadow-v1' }),
      ),
    ).toThrow(/schemaVersion/);
  });

  it('rejects another Character shadow', () => {
    expect(() =>
      projectSeyeonRelationshipRuntimeOverlayV2(
        shadow({ characterId: 'other-character' }),
      ),
    ).toThrow(/Se-yeon/);
  });

  it('rejects unknown condition or behavior values rather than inventing a mapping', () => {
    expect(() =>
      projectSeyeonRelationshipRuntimeOverlayV2(
        shadow({ currentCondition: 'SECRETLY_DATING' }),
      ),
    ).toThrow(/currentCondition/);
    expect(() =>
      projectSeyeonRelationshipRuntimeOverlayV2(
        shadow({ behaviorAccess: 'UNLOCK_ALL_PRIVATE_CONTENT' }),
      ),
    ).toThrow(/behaviorAccess/);
  });

  it('admits the bounded overlay beside relationship state without overwriting it', () => {
    const baseline = relationship();
    const overlay = projectSeyeonRelationshipRuntimeOverlayV2(shadow());
    const context = assembleSeyeonRuntimeContextV2({
      relationship: baseline,
      relationshipSemantics: overlay,
      recentMessages: [],
      retrievedMemories: [],
      disclosure: { decision: null, retrievedSources: [] },
    });

    expect(context.relationship).toEqual(baseline);
    expect(context.relationshipSemantics?.currentCondition).toBe('OPEN_CONFLICT');
    expect(context.relationshipSemantics?.behaviorAccess).toBe(
      'RESTRICTED_BY_CONFLICT',
    );
    expect(context.relationship?.stageKey).toBe('deep_trust');
    expect(context.relationship?.trustBand).toBe('high');
  });

  it('does not allow experimental semantics to create a relationship context', () => {
    const overlay = projectSeyeonRelationshipRuntimeOverlayV2(shadow());

    expect(() =>
      assembleSeyeonRuntimeContextV2({
        relationship: null,
        relationshipSemantics: overlay,
        recentMessages: [],
        retrievedMemories: [],
        disclosure: { decision: null, retrievedSources: [] },
      }),
    ).toThrow(/cannot create a relationship context/);
  });

  it('rejects any forged authority capability on an otherwise shaped overlay', () => {
    const overlay = projectSeyeonRelationshipRuntimeOverlayV2(shadow());
    const forged = {
      ...overlay,
      constraints: {
        ...overlay.constraints,
        mayUnlockDisclosure: true,
      },
    };

    expect(() =>
      assembleSeyeonRuntimeContextV2({
        relationship: relationship(),
        relationshipSemantics: forged as never,
        recentMessages: [],
        retrievedMemories: [],
        disclosure: { decision: null, retrievedSources: [] },
      }),
    ).toThrow(/cannot gain runtime authority/);
  });
});
