import { describe, expect, it } from 'vitest';
import type { CharacterContentDefinition } from '../packages/character-content/src/index.js';
import {
  assembleCharacterRuntimeContext,
  hashProtectedSajuTextV1,
  projectCharacterRelationshipBehavior,
  type RelationshipRenderingProjectionPolicyV1,
} from '../packages/domain/src/index.js';
import { DEV_CHARACTER_CONTENT_BUNDLE } from '../packages/test-fixtures/src/index.js';

const projectionPolicy: RelationshipRenderingProjectionPolicyV1 = {
  version: 'relationship-render-v1',
  closeness: { lowMax: 20, mediumMax: 60 },
  trust: { lowMax: 20, mediumMax: 60 },
  friction: { lowMax: 20, mediumMax: 60 },
};

function authoredCharacter(): CharacterContentDefinition {
  const base = DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!;
  return {
    ...base,
    displayName: 'Runtime Test Representative',
    deityProxyLabel: 'runtime_witness',
    shortDescriptor: 'runtime test only',
    personalityTraits: ['observant'],
    flaws: ['overchecks continuity'],
    values: ['truth'],
    emotionIds: ['neutral', 'serious'],
    animationCueIds: ['idle'],
    canon: {
      worldRole: 'record witness',
      origin: 'record hall',
      apparentAgeBand: 'adult',
      deityBond: {
        deityId: 'deity-runtime-test',
        representationRole: 'witness',
        oath: 'Keep the record intact.',
        acceptedDoctrine: ['Records matter.'],
        resistedDoctrine: ['Records do not own people.'],
      },
      worldview: {
        coreValues: ['truth'],
        humanTheory: 'People repeat and revise themselves.',
        agencyTheory: 'People can act on what they learn.',
        truthTheory: 'Claims need provenance.',
      },
      psychology: {
        desire: 'Understand continuity.',
        fear: 'Confusing preservation with control.',
        flaw: 'Overchecks continuity.',
        contradiction: 'Questions change in order to protect it.',
        hiddenMotivation: 'Wants to see change survive memory.',
      },
    },
    persona: {
      communication: {
        register: 'measured',
        sentenceRhythm: 'short',
        verbosity: 'medium',
        humorStyle: 'dry',
        metaphorStyle: 'records',
        profanityIntensity: 'none',
        politenessStyle: 'reserved',
      },
      cognition: {
        thinkingTempo: 'slow',
        ambiguityTolerance: 'high',
        conclusionStyle: 'evidence_first',
        contradictionSensitivity: 'high',
      },
      questioning: {
        preferredStrategies: ['chronology'],
        avoidedStrategies: ['forced_binary'],
        followUpDepth: 'deep',
      },
      emotion: {
        expressiveness: 'restrained',
        empathyStyle: 'recall',
        angerStyle: 'precise',
        embarrassmentStyle: 'deflect',
      },
      conflict: {
        confrontationStyle: 'direct',
        apologyStyle: 'specific',
        withdrawalStyle: 'temporary',
      },
      intimacy: {
        pace: 'slow',
        selfDisclosure: 'selective',
        boundaryStyle: 'clear',
        attachmentExpression: 'remembering',
      },
    },
    behavior: {
      policyVersion: 'behavior-v1',
      questionPriorities: ['chronology'],
      supportPriorities: ['witness'],
      rules: [
        {
          ruleKey: 'repeat_pattern',
          triggerKey: 'repeat_pattern',
          priority: 100,
          preferredResponse: 'Ask what repeated.',
          avoid: [],
        },
      ],
    },
    sajuProfile: {
      profileVersion: 'saju-profile-v1',
      attentionAxes: ['continuity'],
      followUpQuestionStrategies: ['chronology'],
      framingStyle: 'record_first',
      uncertaintyResponseStyle: 'preserve',
      insufficientEvidenceResponseStyle: 'state_limit',
      referralBehavior: {
        maySuggestAnotherCharacter: false,
        conditions: [],
      },
    },
    relationshipBehavior: {
      behaviorVersion: 'relationship-behavior-v1',
      defaultMode: {
        distance: 'reserved',
        questionDepth: 'medium',
        selfDisclosure: 'low',
        humorIntensity: 'low',
        directness: 'medium',
        memoryReferenceFrequency: 'low',
        nicknameBehavior: 'formal',
        conflictSensitivity: 'medium',
      },
      rules: [
        {
          ruleKey: 'trusted_return',
          priority: 200,
          when: { trustBands: ['high'], recentEventKeys: ['RETURN_VISIT'] },
          mode: {
            distance: 'close',
            questionDepth: 'deep',
            selfDisclosure: 'medium',
            humorIntensity: 'medium',
            directness: 'high',
            memoryReferenceFrequency: 'high',
            nicknameBehavior: 'personal',
            conflictSensitivity: 'medium',
          },
        },
        {
          ruleKey: 'trusted_only',
          priority: 100,
          when: { trustBands: ['high'] },
          mode: {
            distance: 'familiar',
            questionDepth: 'deep',
            selfDisclosure: 'low',
            humorIntensity: 'low',
            directness: 'medium',
            memoryReferenceFrequency: 'medium',
            nicknameBehavior: 'familiar',
            conflictSensitivity: 'medium',
          },
        },
      ],
    },
    capabilities: [
      {
        domain: 'career',
        role: 'secondary',
        canInitiate: true,
        capabilityVersion: 'cap-v1',
      },
    ],
    developmentPlaceholder: undefined as never,
  };
}

function runtimeInput(character = authoredCharacter()) {
  return {
    character,
    contentBundleId: 'bundle-runtime-v1',
    relationshipState: {
      closeness: 50,
      trust: 80,
      friction: 10,
      stage: 'familiar',
      revision: 7,
      policyVersion: 'relationship-policy-v1',
    },
    recentRelationshipEventKeys: ['RETURN_VISIT'] as const,
    relationshipProjectionPolicy: projectionPolicy,
    worldRelations: [],
    grantedLifeFacts: [
      {
        factId: 'fact-1',
        factType: 'employment_status',
        schemaVersion: 'v1',
        value: { state: 'employed' },
        grantId: 'grant-fact-1',
        granteeCharacterId: character.characterId,
      },
    ],
    grantedMemories: [
      {
        memoryItemId: 'memory-1',
        memoryType: 'conversation_recall',
        schemaVersion: 'v1',
        content: { summary: 'considered leaving a job' },
        grantId: 'grant-memory-1',
        granteeCharacterId: character.characterId,
      },
    ],
    recentMessages: ['요즘 회사를 그만둘까 고민 중이야.'],
  };
}

function protectedText(readingRef: string, segmentId: string, sourceRef: string, text: string) {
  return {
    segmentId,
    sourceReadingRef: readingRef,
    sourceRef,
    contentHash: hashProtectedSajuTextV1(text),
    text,
  };
}

describe('character relationship rendering projection', () => {
  it('uses explicit priority when multiple behavior rules match', () => {
    const character = authoredCharacter();
    const projection = projectCharacterRelationshipBehavior({
      state: runtimeInput(character).relationshipState,
      recentEventKeys: ['RETURN_VISIT'],
      projectionPolicy,
      behavior: character.relationshipBehavior!,
    });

    expect(projection.trustBand).toBe('high');
    expect(projection.matchedBehaviorRuleKey).toBe('trusted_return');
    expect(projection.mode.distance).toBe('close');
  });

  it('falls back to the character default without mutating relationship state', () => {
    const character = authoredCharacter();
    const state = { ...runtimeInput(character).relationshipState, trust: 10, revision: 11 };
    const projection = projectCharacterRelationshipBehavior({
      state,
      recentEventKeys: [],
      projectionPolicy,
      behavior: character.relationshipBehavior!,
    });

    expect(projection.matchedBehaviorRuleKey).toBeNull();
    expect(projection.mode.distance).toBe('reserved');
    expect(state.revision).toBe(11);
  });
});

describe('CharacterRuntimeContext assembly', () => {
  it('assembles only explicitly scoped records and provenance-pinned protected Saju text', () => {
    const input = runtimeInput();
    const readingRef = 'reading-1';
    const segment = protectedText(
      readingRef,
      'segment-1',
      'product-block:career:0',
      '검증된 사주 블록 원문',
    );
    const disclosure = protectedText(
      readingRef,
      'disclosure-1',
      'product-disclosure:career:0',
      '이 블록의 범위를 넘겨 해석하지 않는다.',
    );
    const context = assembleCharacterRuntimeContext({
      ...input,
      saju: {
        readingRef,
        domain: 'career',
        coverageState: 'complete',
        protectedSegments: [segment],
        disclosures: [disclosure],
        ambiguity: ['birth_time_window'],
      },
    });

    expect(context.characterId).toBe(input.character.characterId);
    expect(context.lifeFacts).toHaveLength(1);
    expect(context.memories).toHaveLength(1);
    expect(context.saju?.protectedSegments[0]).toEqual(segment);
    expect(context.saju?.disclosures[0]).toEqual(disclosure);
    expect(context.saju?.ambiguity).toEqual(['birth_time_window']);
    expect(context.saju?.capability.role).toBe('secondary');
    expect(context.relationship.matchedBehaviorRuleKey).toBe('trusted_return');
    expect(context.rendererPolicy.allowedEmotionIds).toEqual(['neutral', 'serious']);
  });

  it('rejects a record grant belonging to another character', () => {
    const input = runtimeInput();
    expect(() =>
      assembleCharacterRuntimeContext({
        ...input,
        grantedMemories: [
          {
            ...input.grantedMemories[0]!,
            granteeCharacterId: 'char-other',
          },
        ],
      }),
    ).toThrow(/not scoped to the active character/u);
  });

  it('rejects Saju context for a domain the character cannot consume', () => {
    const input = runtimeInput();
    const readingRef = 'reading-2';
    expect(() =>
      assembleCharacterRuntimeContext({
        ...input,
        saju: {
          readingRef,
          domain: 'wealth',
          coverageState: 'complete',
          protectedSegments: [
            protectedText(readingRef, 'segment-2', 'product-block:wealth:0', 'test'),
          ],
          disclosures: [],
          ambiguity: [],
        },
      }),
    ).toThrow(/no capability/u);
  });

  it('fails closed when insufficient coverage carries protected semantic content', () => {
    const input = runtimeInput();
    const readingRef = 'reading-3';
    expect(() =>
      assembleCharacterRuntimeContext({
        ...input,
        saju: {
          readingRef,
          domain: 'career',
          coverageState: 'insufficient',
          protectedSegments: [
            protectedText(readingRef, 'segment-3', 'product-block:career:0', 'must not reveal'),
          ],
          disclosures: [],
          ambiguity: [],
        },
      }),
    ).toThrow(/Insufficient Saju coverage/u);
  });

  it('rejects protected text with a mismatched reading provenance ref', () => {
    const input = runtimeInput();
    const readingRef = 'reading-4';
    const segment = protectedText(
      'different-reading',
      'segment-4',
      'product-block:career:0',
      'governed text',
    );
    expect(() =>
      assembleCharacterRuntimeContext({
        ...input,
        saju: {
          readingRef,
          domain: 'career',
          coverageState: 'complete',
          protectedSegments: [segment],
          disclosures: [],
          ambiguity: [],
        },
      }),
    ).toThrow(/sourceReadingRef must match/u);
  });

  it('rejects protected text whose content hash does not match', () => {
    const input = runtimeInput();
    const readingRef = 'reading-5';
    expect(() =>
      assembleCharacterRuntimeContext({
        ...input,
        saju: {
          readingRef,
          domain: 'career',
          coverageState: 'complete',
          protectedSegments: [
            {
              ...protectedText(readingRef, 'segment-5', 'product-block:career:0', 'governed text'),
              contentHash: 'sha256:v1:deadbeef',
            },
          ],
          disclosures: [],
          ambiguity: [],
        },
      }),
    ).toThrow(/contentHash does not match/u);
  });

  it('rejects development placeholders from the authored runtime', () => {
    const placeholder = DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!;
    const input = runtimeInput(placeholder);
    expect(() => assembleCharacterRuntimeContext(input)).toThrow(/Development placeholder/u);
  });
});
