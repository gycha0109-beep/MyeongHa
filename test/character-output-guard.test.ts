import { describe, expect, it } from 'vitest';
import type { CharacterRuntimeContextV1 } from '../packages/domain/src/index.js';
import { guardCharacterRendererOutput } from '../packages/domain/src/index.js';

function runtimeContext(withSaju = true): CharacterRuntimeContextV1 {
  return {
    schemaVersion: 'v1',
    characterId: 'char-output-test',
    contentBundleId: 'bundle-output-test-v1',
    contentVersion: 'content-v1',
    canon: {
      worldRole: 'record witness',
      origin: 'record hall',
      apparentAgeBand: 'adult',
      deityBond: {
        deityId: 'deity-output-test',
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
    },
    relationship: {
      schemaVersion: 'v1',
      relationshipRevision: 3,
      relationshipPolicyVersion: 'relationship-policy-v1',
      projectionPolicyVersion: 'relationship-render-v1',
      stageKey: 'familiar',
      closenessBand: 'medium',
      trustBand: 'high',
      frictionBand: 'low',
      recentEventKeys: ['RETURN_VISIT'],
      behaviorVersion: 'relationship-behavior-v1',
      matchedBehaviorRuleKey: 'trusted_return',
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
    rendererPolicy: {
      allowedEmotionIds: ['neutral', 'serious'],
      allowedAnimationCueIds: ['idle', 'look_aside'],
    },
    worldRelations: [],
    lifeFacts: [],
    memories: [],
    recentMessages: ['요즘 회사를 그만둘까 고민 중이야.'],
    saju: withSaju
      ? {
          readingRef: 'reading-output-test-1',
          domain: 'career',
          coverageState: 'complete',
          protectedSegments: [
            {
              segmentId: 'protected-career-1',
              text: '서버가 검증한 사주 원문은 이 문장 그대로 유지되어야 합니다.',
            },
          ],
          disclosures: ['현재 현실과의 연결은 사용자 확인이 필요합니다.'],
          ambiguity: [],
          capability: {
            domain: 'career',
            role: 'secondary',
            canInitiate: true,
            capabilityVersion: 'cap-v1',
          },
        }
      : null,
  };
}

function validDraft(): Record<string, unknown> {
  return {
    schemaVersion: 'v1',
    framingBefore: '기록부터 보겠습니다.',
    framingAfter: '지금 현실에서는 어떤 부분이 가장 걸립니까?',
    emotion: 'serious',
    animationCue: 'look_aside',
    memoryProposals: [
      {
        proposalKind: 'life_fact',
        recordType: 'employment_status',
        schemaVersion: 'v1',
        proposedValue: { state: 'employed' },
        proposalDedupeKey: 'proposal-1',
      },
    ],
    relationshipEventProposals: ['COMPLETED_READING'],
    suggestedActions: [{ actionKey: 'open_records' }],
  };
}

describe('Character Output Guard', () => {
  it('injects the exact protected Saju segment from server context', () => {
    const context = runtimeContext();
    const envelope = guardCharacterRendererOutput({
      rawOutput: validDraft(),
      context,
      allowedSuggestedActionKeys: ['open_records'],
    });

    expect(envelope.protectedSajuSegments).toEqual(context.saju?.protectedSegments);
    expect(envelope.protectedSajuSegments[0]?.text).toBe(
      '서버가 검증한 사주 원문은 이 문장 그대로 유지되어야 합니다.',
    );
    expect(envelope.framingBefore).toBe('기록부터 보겠습니다.');
    expect(envelope.framingAfter).toContain('지금 현실');
  });

  it('rejects any provider attempt to author protected Saju segments', () => {
    expect(() =>
      guardCharacterRendererOutput({
        rawOutput: {
          ...validDraft(),
          protectedSajuSegments: [
            { segmentId: 'fake', text: '모델이 바꾼 사주 해석' },
          ],
        },
        context: runtimeContext(),
        allowedSuggestedActionKeys: ['open_records'],
      }),
    ).toThrow(/unexpected field: protectedSajuSegments/u);
  });

  it('rejects an emotion outside the content-pinned allowlist', () => {
    expect(() =>
      guardCharacterRendererOutput({
        rawOutput: { ...validDraft(), emotion: 'divine_revelation' },
        context: runtimeContext(),
        allowedSuggestedActionKeys: ['open_records'],
      }),
    ).toThrow(/emotion is not allowed/u);
  });

  it('rejects an animation cue outside the content-pinned allowlist', () => {
    expect(() =>
      guardCharacterRendererOutput({
        rawOutput: { ...validDraft(), animationCue: 'unlock_secret_form' },
        context: runtimeContext(),
        allowedSuggestedActionKeys: ['open_records'],
      }),
    ).toThrow(/animationCue is not allowed/u);
  });

  it('rejects an unknown relationship event instead of mutating state', () => {
    expect(() =>
      guardCharacterRendererOutput({
        rawOutput: {
          ...validDraft(),
          relationshipEventProposals: ['TRUST_PLUS_20'],
        },
        context: runtimeContext(),
        allowedSuggestedActionKeys: ['open_records'],
      }),
    ).toThrow(/unknown event/u);
  });

  it('rejects a suggested action outside the server allowlist', () => {
    expect(() =>
      guardCharacterRendererOutput({
        rawOutput: {
          ...validDraft(),
          suggestedActions: [{ actionKey: 'grant_entitlement' }],
        },
        context: runtimeContext(),
        allowedSuggestedActionKeys: ['open_records'],
      }),
    ).toThrow(/actionKey is not allowed/u);
  });

  it('rejects a non-JSON memory proposal payload', () => {
    expect(() =>
      guardCharacterRendererOutput({
        rawOutput: {
          ...validDraft(),
          memoryProposals: [
            {
              proposalKind: 'memory',
              recordType: 'conversation_recall',
              schemaVersion: 'v1',
              proposedValue: () => 'not-json',
              proposalDedupeKey: 'proposal-bad-json',
            },
          ],
        },
        context: runtimeContext(),
        allowedSuggestedActionKeys: ['open_records'],
      }),
    ).toThrow(/must be JSON-compatible/u);
  });

  it('produces no protected Saju segment when the runtime context has no reading', () => {
    const envelope = guardCharacterRendererOutput({
      rawOutput: validDraft(),
      context: runtimeContext(false),
      allowedSuggestedActionKeys: ['open_records'],
    });

    expect(envelope.protectedSajuSegments).toEqual([]);
  });
});
