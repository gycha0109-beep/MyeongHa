import { describe, expect, it } from 'vitest';

import { compileSeyeonBiblePrototypeContextV1 } from '../../character-content/src/seyeon-bible-prototype-v1.js';
import {
  CHARACTER_CONTEXT_COMPOSITION_PROTOTYPE_STATUS_V0_1,
  composeSeyeonCharacterContextPrototypeV0_1,
} from './character-context-composition-prototype-v0.1.js';
import type { CharacterRuntimeContextV1 } from './character-runtime-context.js';

function runtimeContext(characterId = 'seyeon'): CharacterRuntimeContextV1 {
  return {
    schemaVersion: 'v1',
    characterId,
    contentBundleId: 'bundle-research-v1',
    contentVersion: 'character-content-v1',
    speech: { style: 'soft' },
    voiceAuthority: {},
    canon: { identity: { displayName: '세연' } },
    persona: { communication: { politenessStyle: 'friendly_polite' } },
    behavior: { hardProhibitions: [] },
    sajuProfile: {},
    relationship: {
      schemaVersion: 'v1',
      relationshipRevision: 7,
      relationshipPolicyVersion: 'relationship-policy-fixture-v1',
      projectionPolicyVersion: 'relationship-render-fixture-v1',
      stageKey: 'familiar',
      closenessBand: 'medium',
      trustBand: 'medium',
      frictionBand: 'low',
      recentEventKeys: [],
      behaviorVersion: 'behavior-fixture-v1',
      matchedBehaviorRuleKey: null,
      mode: {
        distance: 'familiar',
        questionDepth: 'medium',
        humorIntensity: 'medium',
        directness: 'medium',
        memoryReferenceFrequency: 'medium',
        nicknameBehavior: 'familiar',
        conflictSensitivity: 'medium',
      },
    },
    rendererPolicy: {
      allowedEmotionIds: ['neutral'],
      allowedAnimationCueIds: [],
    },
    worldRelations: [],
    lifeFacts: [
      {
        factId: 'fact-1',
        factType: 'fixture',
        schemaVersion: 'v1',
        value: { value: 'granted only' },
        grantId: 'grant-fact-1',
        granteeCharacterId: characterId,
      },
    ],
    memories: [
      {
        memoryItemId: 'memory-1',
        memoryType: 'fixture',
        schemaVersion: 'v1',
        content: { summary: 'authorized durable memory' },
        grantId: 'grant-memory-1',
        granteeCharacterId: characterId,
      },
    ],
    recentMessages: ['runtime recent message'],
    saju: null,
  } as unknown as CharacterRuntimeContextV1;
}

describe('Character Context Composition prototype v0.1', () => {
  it('is research-only and owns no relationship, memory, Saju, or provider authority', () => {
    expect(CHARACTER_CONTEXT_COMPOSITION_PROTOTYPE_STATUS_V0_1).toEqual({
      authority: 'research_experiment_only',
      productionRuntime: false,
      relationshipMutationAuthority: false,
      memoryMutationAuthority: false,
      sajuSemanticAuthority: false,
      providerSelection: false,
    });
  });

  it('keeps immutable authoring, relationship projection, durable grants, and session continuity in separate lanes', () => {
    const bibleContext = compileSeyeonBiblePrototypeContextV1({
      userMessage: '왜, 질투해?',
      disclosureScope: 'familiar',
      recentDialogue: [
        { role: 'user', text: '요즘 백헌이랑 얘기 많이 했어.' },
        { role: 'assistant', text: '뭐가 그렇게 재밌었어요?' },
      ],
    });
    const context = composeSeyeonCharacterContextPrototypeV0_1({
      runtimeContext: runtimeContext(),
      bibleContext,
    });

    expect(context.characterAuthority.characterId).toBe('seyeon');
    expect(context.relationshipProjection.relationshipRevision).toBe(7);
    expect(context.durableGrantedContext.memories[0]?.memoryItemId).toBe('memory-1');
    expect(context.sessionContext.runtimeRecentMessages).toEqual(['runtime recent message']);
    expect(context.sessionContext.roleAwareRecentDialogue).toHaveLength(2);
    expect(context.selectedBibleTraits.map((trait) => trait.id)).toContain(
      'other_character_jealousy',
    );
  });

  it('keeps expression recency bounded to traits actually selected for this turn', () => {
    const bibleContext = compileSeyeonBiblePrototypeContextV1({
      userMessage: '왜, 질투해?',
      disclosureScope: 'familiar',
    });
    const context = composeSeyeonCharacterContextPrototypeV0_1({
      runtimeContext: runtimeContext(),
      bibleContext,
      recentlyExpressedTraitIds: [
        'not-selected',
        'other_character_jealousy',
        'other_character_jealousy',
      ],
    });

    expect(context.expressionRecency.recentlyExpressedSelectedTraitIds).toEqual([
      'other_character_jealousy',
    ]);
  });

  it('does not convert session dialogue into durable memory', () => {
    const bibleContext = compileSeyeonBiblePrototypeContextV1({
      userMessage: '그때 기억나?',
      disclosureScope: 'familiar',
      recentDialogue: [
        { role: 'user', text: '사실 네가 사랑한다고 했잖아.' },
      ],
    });
    const context = composeSeyeonCharacterContextPrototypeV0_1({
      runtimeContext: runtimeContext(),
      bibleContext,
    });

    expect(context.sessionContext.roleAwareRecentDialogue[0]?.text).toContain('사랑한다고');
    expect(
      context.durableGrantedContext.memories
        .map((memory) => JSON.stringify(memory.content))
        .join('\n'),
    ).not.toContain('사랑한다고');
  });

  it('consumes relationship projection without deriving a replacement relationship state', () => {
    const runtime = runtimeContext();
    const context = composeSeyeonCharacterContextPrototypeV0_1({
      runtimeContext: runtime,
      bibleContext: compileSeyeonBiblePrototypeContextV1({
        userMessage: '오늘 뭐 하지?',
        disclosureScope: 'public',
      }),
    });

    expect(context.relationshipProjection).toBe(runtime.relationship);
    expect(context.status.relationshipMutationAuthority).toBe(false);
  });

  it('rejects a non-Seyeon runtime from the Seyeon-specific prototype', () => {
    expect(() =>
      composeSeyeonCharacterContextPrototypeV0_1({
        runtimeContext: runtimeContext('baekheon'),
        bibleContext: compileSeyeonBiblePrototypeContextV1({
          userMessage: '오늘 뭐 하지?',
          disclosureScope: 'public',
        }),
      }),
    ).toThrow('runtimeContext.characterId=seyeon');
  });
});
