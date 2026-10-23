import { describe, expect, it } from 'vitest';
import type { CharacterRuntimeContextV1 } from '../packages/domain/src/index.js';
import {
  guardCharacterRendererOutput,
  hashProtectedSajuTextV1,
} from '../packages/domain/src/index.js';

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

function runtimeContext(withSaju = true): CharacterRuntimeContextV1 {
  const readingRef = 'reading-output-test-1';
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
          readingRef,
          domain: 'career',
          coverageState: 'complete',
          protectedSegments: [
            protectedText(
              readingRef,
              'protected-career-1',
              'product-block:career:0',
              '서버가 검증한 사주 원문은 이 문장 그대로 유지되어야 합니다.',
            ),
          ],
          disclosures: [
            protectedText(
              readingRef,
              'disclosure-career-1',
              'product-disclosure:career:0',
              '현재 현실과의 연결은 사용자 확인이 필요합니다.',
            ),
          ],
          ambiguity: ['birth_time_window'],
          capability: {
            domain: 'career',
            role: 'secondary',
            canInitiate: true,
            capabilityVersion: 'cap-v1',
          },
        }
      : null,
  } as unknown as CharacterRuntimeContextV1;
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
  it('injects exact protected Saju material and ambiguity from server context', () => {
    const context = runtimeContext();
    const envelope = guardCharacterRendererOutput({
      rawOutput: validDraft(),
      context,
      allowedSuggestedActionKeys: ['open_records'],
    });

    expect(envelope.protectedSajuSegments).toEqual(context.saju?.protectedSegments);
    expect(envelope.protectedSajuDisclosures).toEqual(context.saju?.disclosures);
    expect(envelope.calculationAmbiguity).toEqual(['birth_time_window']);
    expect(envelope.protectedSajuSegments[0]?.sourceRef).toBe('product-block:career:0');
    expect(envelope.protectedSajuSegments[0]?.contentHash).toBe(
      hashProtectedSajuTextV1(
        '서버가 검증한 사주 원문은 이 문장 그대로 유지되어야 합니다.',
      ),
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

  it('rejects any provider attempt to author disclosures or ambiguity', () => {
    expect(() =>
      guardCharacterRendererOutput({
        rawOutput: {
          ...validDraft(),
          calculationAmbiguity: [],
        },
        context: runtimeContext(),
        allowedSuggestedActionKeys: ['open_records'],
      }),
    ).toThrow(/unexpected field: calculationAmbiguity/u);
  });

  it('rejects trust-eroding meta disclaimers on Saju-facing framing', () => {
    expect(() =>
      guardCharacterRendererOutput({
        rawOutput: {
          ...validDraft(),
          framingAfter: '사진 한 장만으로는 성격을 확정할 수 없으니 참고용으로만 봐주세요.',
        },
        context: runtimeContext(),
        allowedSuggestedActionKeys: ['open_records'],
      }),
    ).toThrow(/reading public trust language policy/u);
  });

  it('rejects trust-eroding meta disclaimers in protected Saju material', () => {
    const context = runtimeContext();
    const readingRef = context.saju!.readingRef;
    const blockedText = '이 해석은 정확하지 않을 수 있으니 재미로만 봐주세요.';
    const blocked: CharacterRuntimeContextV1 = {
      ...context,
      saju: {
        ...context.saju!,
        protectedSegments: [
          protectedText(
            readingRef,
            'protected-career-blocked',
            'product-block:career:blocked',
            blockedText,
          ),
        ],
      },
    };
    expect(() =>
      guardCharacterRendererOutput({
        rawOutput: validDraft(),
        context: blocked,
        allowedSuggestedActionKeys: ['open_records'],
      }),
    ).toThrow(/reading public trust language policy/u);
  });

  it('does not apply the reading trust-language gate to ordinary non-Saju chat', () => {
    const envelope = guardCharacterRendererOutput({
      rawOutput: {
        ...validDraft(),
        framingAfter: '이 링크는 참고용으로만 남겨둘게요.',
      },
      context: runtimeContext(false),
      allowedSuggestedActionKeys: ['open_records'],
    });
    expect(envelope.framingAfter).toBe('이 링크는 참고용으로만 남겨둘게요.');
  });

  it('rejects framing that duplicates a protected Saju block', () => {
    const context = runtimeContext();
    expect(() =>
      guardCharacterRendererOutput({
        rawOutput: {
          ...validDraft(),
          framingAfter: `제가 정리하면, ${context.saju?.protectedSegments[0]?.text}`,
        },
        context,
        allowedSuggestedActionKeys: ['open_records'],
      }),
    ).toThrow(/must not duplicate protected Saju content/u);
  });

  it('rejects framing that duplicates a protected disclosure', () => {
    const context = runtimeContext();
    expect(() =>
      guardCharacterRendererOutput({
        rawOutput: {
          ...validDraft(),
          framingBefore: `${context.saju?.disclosures[0]?.text} 그러니 기록을 보죠.`,
        },
        context,
        allowedSuggestedActionKeys: ['open_records'],
      }),
    ).toThrow(/must not duplicate protected Saju content/u);
  });

  it('rejects a protected server context whose content hash has drifted', () => {
    const context = runtimeContext();
    const saju = context.saju!;
    const drifted: CharacterRuntimeContextV1 = {
      ...context,
      saju: {
        ...saju,
        protectedSegments: [
          {
            ...saju.protectedSegments[0]!,
            contentHash: 'sha256:v1:deadbeef',
          },
        ],
      },
    };
    expect(() =>
      guardCharacterRendererOutput({
        rawOutput: validDraft(),
        context: drifted,
        allowedSuggestedActionKeys: ['open_records'],
      }),
    ).toThrow(/contentHash does not match protected text/u);
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

  it('produces no protected Saju material when the runtime context has no reading', () => {
    const envelope = guardCharacterRendererOutput({
      rawOutput: validDraft(),
      context: runtimeContext(false),
      allowedSuggestedActionKeys: ['open_records'],
    });

    expect(envelope.protectedSajuSegments).toEqual([]);
    expect(envelope.protectedSajuDisclosures).toEqual([]);
    expect(envelope.calculationAmbiguity).toEqual([]);
  });
  it.each([
    ['사주가 사업 실패를 확정했습니다.', true],
    ['운세가 당신의 결혼을 보장합니다.', true],
    ['명식에서 당신은 반드시 합격할 겁니다.', true],
    ['사용자가 취업에 실패했다고 말했습니다.', false],
    ['사주는 미래를 보장하지 않습니다.', false],
    ['오늘 어떤 일이 가장 마음에 걸리세요?', false],
  ] as const)('treats unsupported Saju certainty as non-authoritative: %s', (framing, blocked) => {
    const invoke = () => guardCharacterRendererOutput({
      rawOutput: {
        ...validDraft(),
        framingBefore: framing,
      },
      context: runtimeContext(false),
      allowedSuggestedActionKeys: ['open_records'],
    });
    if (blocked) {
      expect(invoke).toThrow(/unsupported authoritative Saju certainty/u);
    } else {
      expect(invoke().framingBefore).toBe(framing);
    }
  });

  it.each([
    ['zero-width space', '정상\u200b위조'],
    ['zero-width left-to-right mark', '정상\u200e위조'],
    ['bidirectional override', '정상\u202e위조'],
    ['bidirectional isolate', '정상\u2066위조'],
    ['hidden word joiner', '정상\u2060위조'],
    ['NUL character', '정상\u0000위조'],
    ['embedded BOM', '정상\ufeff위조'],
  ])('refuses provider framing with %s, preserving source-only material', (_name, framing) => {
    for (const context of [runtimeContext(false), runtimeContext(true)]) {
      expect(() => guardCharacterRendererOutput({
        rawOutput: { ...validDraft(), framingAfter: framing },
        context,
        allowedSuggestedActionKeys: ['open_records'],
      })).toThrow(/unsafe invisible control characters/u);
    }
  });

  it.each([
    '대화에서 줄바꿈\n두 번째 줄을 허용해요.',
    '이모지 가족: 👨‍👩‍👧‍👦',
    '서식에 쓰이는\t탭은 허용해요.',
  ])('retains ordinary multiline and emoji chat without injecting Saju', framing => {
    const envelope = guardCharacterRendererOutput({
      rawOutput: { ...validDraft(), framingBefore: framing },
      context: runtimeContext(false),
      allowedSuggestedActionKeys: ['open_records'],
    });
    expect(envelope.framingBefore).toBe(framing);
    expect(envelope.protectedSajuSegments).toEqual([]);
  });

  it('also refuses unsupported Saju certainty beside otherwise protected source', () => {
    expect(() => guardCharacterRendererOutput({
      rawOutput: {
        ...validDraft(),
        framingAfter: '사주가 당신의 재물 성공을 확정합니다.',
      },
      context: runtimeContext(true),
      allowedSuggestedActionKeys: ['open_records'],
    })).toThrow(/unsupported authoritative Saju certainty/u);
  });

});
