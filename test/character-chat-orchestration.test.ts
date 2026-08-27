import { describe, expect, it } from 'vitest';
import type { CharacterContentDefinition } from '../packages/character-content/src/index.js';
import {
  CharacterChatTurnOrchestrationError,
  InMemoryCharacterChatCommitPortV1,
  runMockCharacterChatTurn,
  StaticMockCharacterRendererProviderV1,
  type CharacterRuntimeContextAssemblyInputV1,
} from '../apps/api/src/index.js';
import { hashProtectedSajuTextV1 } from '../packages/domain/src/index.js';
import { DEV_CHARACTER_CONTENT_BUNDLE } from '../packages/test-fixtures/src/index.js';

const allowedCapability = {
  needsSaju: true,
  characterCapabilityAllowed: true,
  userConsentAllowed: true,
  sajuDomainAvailability: 'available' as const,
  worldStateAllowed: true,
  entitlementAllowed: true,
  contentPolicyAllowed: true,
  clientCapabilityAllowed: true,
};

function authoredCharacter(): CharacterContentDefinition {
  const base = DEV_CHARACTER_CONTENT_BUNDLE.characters[0]!;
  return {
    ...base,
    displayName: 'Orchestration Test Representative',
    deityProxyLabel: 'orchestration_witness',
    shortDescriptor: 'test-only authored character',
    personalityTraits: ['observant'],
    flaws: ['overchecks continuity'],
    values: ['truth'],
    emotionIds: ['neutral', 'serious'],
    animationCueIds: ['idle', 'look_aside'],
    capabilities: [
      {
        domain: 'career',
        role: 'secondary',
        canInitiate: true,
        capabilityVersion: 'cap-v1',
      },
    ],
    canon: {
      worldRole: 'record witness',
      origin: 'record hall',
      apparentAgeBand: 'adult',
      deityBond: {
        deityId: 'deity-orchestration-test',
        representationRole: 'witness',
        oath: 'Keep governed records intact.',
        acceptedDoctrine: ['Records require provenance.'],
        resistedDoctrine: ['Records do not replace the person.'],
      },
      worldview: {
        coreValues: ['truth'],
        humanTheory: 'People are more than one record.',
        agencyTheory: 'People can act after understanding a record.',
        truthTheory: 'A claim keeps its source boundary.',
      },
      psychology: {
        desire: 'Keep interpretation and relationship distinct.',
        fear: 'Turning records into control.',
        flaw: 'Can become overly formal around uncertainty.',
        contradiction: 'Protects intimacy by keeping strict boundaries.',
        hiddenMotivation: 'Wants a relationship that survives truthful limits.',
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
        empathyStyle: 'attentive',
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
          ruleKey: 'ask_context',
          triggerKey: 'needs_context',
          priority: 100,
          preferredResponse: 'Ask for current-life context.',
          avoid: [],
        },
      ],
    },
    sajuProfile: {
      profileVersion: 'saju-profile-v1',
      attentionAxes: ['continuity'],
      followUpQuestionStrategies: ['chronology'],
      framingStyle: 'record_first',
      uncertaintyResponseStyle: 'preserve_uncertainty',
      insufficientEvidenceResponseStyle: 'state_limit',
      referralBehavior: {
        maySuggestAnotherCharacter: false,
        conditions: [],
      },
      safeFraming: {
        schemaVersion: 'v1',
        catalogVersion: 'orchestration-safe-framing-v1',
        before: [
          {
            key: 'record_first',
            text: '기록부터 보겠습니다.',
            purpose: 'record_transition',
          },
        ],
        after: [
          {
            key: 'ask_current_context',
            text: '지금 현실에서는 어떤 부분이 가장 걸립니까?',
            purpose: 'current_life_question',
          },
        ],
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
          priority: 100,
          when: { trustBands: ['high'], recentEventKeys: ['RETURN_VISIT'] },
          mode: {
            distance: 'familiar',
            questionDepth: 'deep',
            selfDisclosure: 'selective',
            humorIntensity: 'low',
            directness: 'high',
            memoryReferenceFrequency: 'medium',
            nicknameBehavior: 'personal',
            conflictSensitivity: 'medium',
          },
        },
      ],
    },
    developmentPlaceholder: undefined as never,
  };
}

function protectedText(
  readingRef: string,
  segmentId: string,
  sourceRef: string,
  text: string,
) {
  return {
    segmentId,
    sourceReadingRef: readingRef,
    sourceRef,
    contentHash: hashProtectedSajuTextV1(text),
    text,
  };
}

function contextInput(): CharacterRuntimeContextAssemblyInputV1 {
  const character = authoredCharacter();
  const readingRef = 'reading-orchestration-1';
  return {
    character,
    contentBundleId: 'bundle-orchestration-v1',
    relationshipState: {
      closeness: 40,
      trust: 80,
      friction: 10,
      stage: 'familiar',
      revision: 4,
      policyVersion: 'relationship-policy-v1',
    },
    recentRelationshipEventKeys: ['RETURN_VISIT'],
    relationshipProjectionPolicy: {
      version: 'relationship-render-v1',
      closeness: { lowMax: 20, mediumMax: 60 },
      trust: { lowMax: 20, mediumMax: 60 },
      friction: { lowMax: 20, mediumMax: 60 },
    },
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
    grantedMemories: [],
    recentMessages: ['요즘 회사를 그만둘까 고민 중이야.'],
    saju: {
      readingRef,
      domain: 'career',
      coverageState: 'complete',
      protectedSegments: [
        protectedText(
          readingRef,
          'career-block-1',
          'product-block:career:0',
          '검증된 사주 블록입니다.',
        ),
      ],
      disclosures: [
        protectedText(
          readingRef,
          'career-disclosure-1',
          'product-disclosure:career:0',
          '현재 현실과의 연결은 사용자 확인이 필요합니다.',
        ),
      ],
      ambiguity: ['birth_time_window'],
    },
  };
}

function validDraft() {
  return {
    schemaVersion: 'v1',
    framingBeforeKey: 'record_first',
    framingAfterKey: 'ask_current_context',
    emotion: 'serious',
    animationCue: 'look_aside',
    memoryProposals: [],
    relationshipEventProposals: ['COMPLETED_READING'],
    suggestedActions: [{ actionKey: 'open_records' }],
  };
}

describe('mock Character Chat Turn orchestration', () => {
  it('runs gate -> context -> keyed safe renderer -> guard -> commit -> delivery in order', () => {
    const renderer = new StaticMockCharacterRendererProviderV1(validDraft());
    const commitPort = new InMemoryCharacterChatCommitPortV1();

    const result = runMockCharacterChatTurn({
      turnId: 'turn-1',
      attemptId: 'attempt-1',
      capability: allowedCapability,
      contextInput: contextInput(),
      allowedSuggestedActionKeys: ['open_records'],
      renderer,
      commitPort,
    });

    expect(result.status).toBe('delivered');
    if (result.status !== 'delivered') throw new Error('Expected delivered result.');
    expect(result.stateTrace).toEqual([
      'received',
      'planned',
      'context_ready',
      'generated',
      'validated',
      'committed',
      'delivered',
    ]);
    expect(result.envelope.framingBefore).toBe('기록부터 보겠습니다.');
    expect(result.envelope.framingAfter).toBe(
      '지금 현실에서는 어떤 부분이 가장 걸립니까?',
    );
    expect(result.replayedCommittedTurn).toBe(false);
    expect(renderer.callCount).toBe(1);
    expect(commitPort.committedCount).toBe(1);
    expect(result.envelope.protectedSajuSegments[0]?.text).toBe('검증된 사주 블록입니다.');
    expect(result.envelope.protectedSajuDisclosures[0]?.sourceRef).toBe(
      'product-disclosure:career:0',
    );
    expect(result.envelope.calculationAmbiguity).toEqual(['birth_time_window']);
  });

  it('replays an already committed logical turn without regenerating', () => {
    const renderer = new StaticMockCharacterRendererProviderV1(validDraft());
    const commitPort = new InMemoryCharacterChatCommitPortV1();
    const base = {
      turnId: 'turn-replay',
      capability: allowedCapability,
      contextInput: contextInput(),
      allowedSuggestedActionKeys: ['open_records'],
      renderer,
      commitPort,
    } as const;

    const first = runMockCharacterChatTurn({ ...base, attemptId: 'attempt-1' });
    const replay = runMockCharacterChatTurn({ ...base, attemptId: 'attempt-2' });

    expect(first.status).toBe('delivered');
    expect(replay.status).toBe('delivered');
    if (first.status !== 'delivered' || replay.status !== 'delivered') {
      throw new Error('Expected delivered results.');
    }
    expect(renderer.callCount).toBe(1);
    expect(commitPort.committedCount).toBe(1);
    expect(replay.replayedCommittedTurn).toBe(true);
    expect(replay.stateTrace).toEqual(['committed', 'delivered']);
    expect(replay.commitReceipt).toEqual(first.commitReceipt);
    expect(replay.envelope).toEqual(first.envelope);
  });

  it('never calls the provider or commit port when capability is denied', () => {
    const renderer = new StaticMockCharacterRendererProviderV1(validDraft());
    const commitPort = new InMemoryCharacterChatCommitPortV1();

    const result = runMockCharacterChatTurn({
      turnId: 'turn-denied',
      attemptId: 'attempt-1',
      capability: {
        ...allowedCapability,
        userConsentAllowed: false,
      },
      contextInput: contextInput(),
      allowedSuggestedActionKeys: ['open_records'],
      renderer,
      commitPort,
    });

    expect(result).toEqual({
      status: 'denied',
      reason: 'USER_CONSENT_DENIED',
      lastState: 'planned',
      stateTrace: ['received', 'planned'],
    });
    expect(renderer.callCount).toBe(0);
    expect(commitPort.committedCount).toBe(0);
  });

  it('rejects Capability Gate / context coverage mismatch before provider invocation', () => {
    const renderer = new StaticMockCharacterRendererProviderV1(validDraft());
    const commitPort = new InMemoryCharacterChatCommitPortV1();
    const input = contextInput();

    expect(() =>
      runMockCharacterChatTurn({
        turnId: 'turn-coverage-mismatch',
        attemptId: 'attempt-1',
        capability: {
          ...allowedCapability,
          sajuDomainAvailability: 'partial',
        },
        contextInput: input,
        allowedSuggestedActionKeys: ['open_records'],
        renderer,
        commitPort,
      }),
    ).toThrow(CharacterChatTurnOrchestrationError);

    try {
      runMockCharacterChatTurn({
        turnId: 'turn-coverage-mismatch-2',
        attemptId: 'attempt-1',
        capability: {
          ...allowedCapability,
          sajuDomainAvailability: 'partial',
        },
        contextInput: input,
        allowedSuggestedActionKeys: ['open_records'],
        renderer,
        commitPort,
      });
    } catch (error) {
      expect(error).toMatchObject({ stage: 'context', lastState: 'planned' });
    }
    expect(renderer.callCount).toBe(0);
    expect(commitPort.committedCount).toBe(0);
  });

  it('never invokes provider when policy-filtered context assembly rejects a wrong grant', () => {
    const renderer = new StaticMockCharacterRendererProviderV1(validDraft());
    const commitPort = new InMemoryCharacterChatCommitPortV1();
    const input = contextInput();

    expect(() =>
      runMockCharacterChatTurn({
        turnId: 'turn-bad-grant',
        attemptId: 'attempt-1',
        capability: allowedCapability,
        contextInput: {
          ...input,
          grantedLifeFacts: [
            {
              ...input.grantedLifeFacts[0]!,
              granteeCharacterId: 'char-other',
            },
          ],
        },
        allowedSuggestedActionKeys: ['open_records'],
        renderer,
        commitPort,
      }),
    ).toThrow(/not scoped to the active character/u);
    expect(renderer.callCount).toBe(0);
    expect(commitPort.committedCount).toBe(0);
  });

  it('rejects provider-authored free framing on a Saju-bearing turn', () => {
    const renderer = new StaticMockCharacterRendererProviderV1({
      ...validDraft(),
      framingBefore: '제가 이 사주를 다시 해석해보겠습니다.',
    });
    const commitPort = new InMemoryCharacterChatCommitPortV1();

    expect(() =>
      runMockCharacterChatTurn({
        turnId: 'turn-free-saju-framing',
        attemptId: 'attempt-1',
        capability: allowedCapability,
        contextInput: contextInput(),
        allowedSuggestedActionKeys: ['open_records'],
        renderer,
        commitPort,
      }),
    ).toThrow(/unexpected field: framingBefore/u);
    expect(commitPort.committedCount).toBe(0);
  });

  it('never commits or reveals provider output that injects protected Saju material', () => {
    const renderer = new StaticMockCharacterRendererProviderV1({
      ...validDraft(),
      protectedSajuSegments: [{ segmentId: 'fake', text: '모델이 만든 사주 문장' }],
    });
    const commitPort = new InMemoryCharacterChatCommitPortV1();

    try {
      runMockCharacterChatTurn({
        turnId: 'turn-guard-fail',
        attemptId: 'attempt-1',
        capability: allowedCapability,
        contextInput: contextInput(),
        allowedSuggestedActionKeys: ['open_records'],
        renderer,
        commitPort,
      });
      throw new Error('Expected orchestration failure.');
    } catch (error) {
      expect(error).toBeInstanceOf(CharacterChatTurnOrchestrationError);
      expect(error).toMatchObject({ stage: 'validate', lastState: 'generated' });
    }
    expect(renderer.callCount).toBe(1);
    expect(commitPort.committedCount).toBe(0);
  });

  it('reports renderer failure at context_ready without attempting commit', () => {
    const renderer = new StaticMockCharacterRendererProviderV1(() => {
      throw new Error('synthetic provider outage');
    });
    const commitPort = new InMemoryCharacterChatCommitPortV1();

    try {
      runMockCharacterChatTurn({
        turnId: 'turn-render-fail',
        attemptId: 'attempt-1',
        capability: allowedCapability,
        contextInput: contextInput(),
        allowedSuggestedActionKeys: ['open_records'],
        renderer,
        commitPort,
      });
      throw new Error('Expected orchestration failure.');
    } catch (error) {
      expect(error).toBeInstanceOf(CharacterChatTurnOrchestrationError);
      expect(error).toMatchObject({ stage: 'render', lastState: 'context_ready' });
    }
    expect(renderer.callCount).toBe(1);
    expect(commitPort.committedCount).toBe(0);
  });
});
