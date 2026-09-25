import { describe, expect, it } from 'vitest';

import {
  evaluateCharacterDisclosurePreflightV2,
  assembleSeyeonRuntimeContextV2,
  buildSeyeonRendererPacketV2,
  guardSeyeonTurnInterpretationV2,
  admitSeyeonRendererDraftV2,
} from '../packages/domain/src/index.js';
import type { CharacterFactAuthorityEntryV1 } from '../packages/character-content/src/character-fact-authority-v1.js';

function relationship() {
  return {
    stageKey: 'deep_trust',
    closenessBand: 'high' as const,
    trustBand: 'high' as const,
    frictionBand: 'low' as const,
    revision: 22,
    policyVersion: 'relationship-policy-v1',
  };
}

function baseMemory() {
  return {
    memoryId: 'event-shared-history',
    kind: 'relationship_event' as const,
    claimKind: 'fact' as const,
    summary: '두 사람 사이에 관련된 신뢰 사건이 실제로 있었다.',
    sourceRef: 'event:shared-history',
    relevance: 0.95,
    salience: 0.95,
  };
}

function authority(
  sourceAuthority: CharacterFactAuthorityEntryV1['sourceAuthority'],
): CharacterFactAuthorityEntryV1 {
  const authoritative = sourceAuthority === 'CANON' || sourceAuthority === 'SOFT_CANON';
  return {
    factKey: 'past_romance.existence',
    sourceAuthority,
    characterKnowledge: authoritative ? 'KNOWN' : 'NOT_APPLICABLE',
    disclosureDefault: authoritative ? 'FAMILIAR' : 'NOT_APPLICABLE',
    sourceSection: 'J4',
    closureNote: 'runtime test fixture',
  };
}

function source() {
  return {
    topicKey: 'past_romance_detail' as const,
    factKey: 'past_romance.existence',
    allowedDepth: 'deep' as const,
    previouslyDisclosedDepth: 'none' as const,
    sourceRef: 'bible:J4',
  };
}

describe('Se-yeon disclosure runtime v2 integration', () => {
  it('keeps blocked private content out of the assembled model context', () => {
    const decision = evaluateCharacterDisclosurePreflightV2({
      characterId: 'seyeon',
      topicKey: 'past_romance_detail',
      source: source(),
      factAuthority: authority('CANON'),
      relationship: {
        gate: 'PUBLIC',
        trustBand: 'low',
        relevantSharedHistoryRefs: [],
      },
      questionContext: 'casual_curiosity',
    });

    expect(() =>
      assembleSeyeonRuntimeContextV2({
        relationship: null,
        recentMessages: [
          {
            messageId: 'question',
            role: 'user',
            text: '전남친 얘기 해줘요.',
          },
        ],
        retrievedMemories: [],
        disclosure: {
          decision,
          retrievedSources: [
            {
              topicKey: 'past_romance_detail',
              factKey: 'past_romance.existence',
              depth: 'deep',
              sourceRef: 'bible:J4',
              content: 'blocked private biography',
            },
          ],
        },
      }),
    ).toThrow(/must not enter runtime context/);
  });

  it('rejects self_disclose when V2 chose a boundary/deflection path', () => {
    const decision = evaluateCharacterDisclosurePreflightV2({
      characterId: 'seyeon',
      topicKey: 'past_romance_detail',
      source: source(),
      factAuthority: authority('CANON'),
      relationship: {
        gate: 'PUBLIC',
        trustBand: 'low',
        relevantSharedHistoryRefs: [],
      },
      questionContext: 'casual_curiosity',
    });
    const context = assembleSeyeonRuntimeContextV2({
      relationship: null,
      recentMessages: [
        {
          messageId: 'question',
          role: 'user',
          text: '전남친 얘기 해줘요.',
        },
      ],
      retrievedMemories: [],
      disclosure: { decision, retrievedSources: [] },
      focuses: ['intimacy'],
    });

    expect(() =>
      guardSeyeonTurnInterpretationV2({
        context,
        rawOutput: {
          schemaVersion: 'seyeon-turn-interpretation-v2',
          userMove: 'neutral_or_other',
          notice: {
            summary: '개인적인 과거 연애 질문이 들어왔다.',
            evidenceRefs: ['question'],
          },
          immediateWant: {
            key: 'disclose_desire',
            summary: '질문에 반응한다.',
          },
          tension: {
            key: 'approach_vs_self_disclosure',
            summary: '친근함과 사생활 공개는 다르다.',
          },
          chosenAction: {
            key: 'self_disclose',
            rationale: '잘못된 공개 시도',
          },
          expressionState: 'baseline',
          reveal: {
            level: 'public',
            triggerRef: 'question',
            supportingHistoryRefs: [],
          },
          memoryRefsUsed: [],
        },
      }),
    ).toThrow(/cannot choose self_disclose/);
  });

  it('allows only V2 source-backed private content after an ALLOW preflight', () => {
    const decision = evaluateCharacterDisclosurePreflightV2({
      characterId: 'seyeon',
      topicKey: 'past_romance_detail',
      source: source(),
      factAuthority: authority('CANON'),
      relationship: {
        gate: 'DEEP_TRUST',
        trustBand: 'high',
        relevantSharedHistoryRefs: ['event:shared-history'],
      },
      questionContext: 'relationship_relevant',
    });
    const context = assembleSeyeonRuntimeContextV2({
      relationship: relationship(),
      recentMessages: [
        {
          messageId: 'question',
          role: 'user',
          text: '그때 경험이 지금 관계에도 영향을 줘요?',
        },
      ],
      retrievedMemories: [baseMemory()],
      disclosure: {
        decision,
        retrievedSources: [
          {
            topicKey: 'past_romance_detail',
            factKey: 'past_romance.existence',
            depth: 'deep',
            sourceRef: 'bible:J4',
            content: 'authoritative private source slice',
          },
        ],
      },
      focuses: ['intimacy', 'memory'],
    });
    const interpretation = guardSeyeonTurnInterpretationV2({
      context,
      rawOutput: {
        schemaVersion: 'seyeon-turn-interpretation-v2',
        userMove: 'direct_importance_expression',
        notice: {
          summary: '현재 관계와 연결된 개인사 질문이다.',
          evidenceRefs: ['question', 'event:shared-history'],
        },
        immediateWant: {
          key: 'disclose_desire',
          summary: '현재 관계에 필요한 만큼 직접 말한다.',
        },
        tension: {
          key: 'approach_vs_self_disclosure',
          summary: '가까워지고 싶지만 자기 이야기는 여전히 어렵다.',
        },
        chosenAction: {
          key: 'self_disclose',
          rationale: '높은 trust와 관련 history, 현재 trigger가 모두 있다.',
        },
        expressionState: 'vulnerable',
        reveal: {
          level: 'deep_trust',
          triggerRef: 'question',
          supportingHistoryRefs: ['event:shared-history'],
        },
        memoryRefsUsed: [],
      },
    });
    const packet = buildSeyeonRendererPacketV2({ context, interpretation });
    const draft = admitSeyeonRendererDraftV2({
      packet,
      rawOutput: {
        schemaVersion: 'seyeon-renderer-draft-v2',
        utterance: '그 얘기는 지금은 조금 해도 될 것 같아요.',
        expressionState: 'vulnerable',
        revealLevel: 'deep_trust',
        memoryRefsMentioned: [],
        privateSourceRefsMentioned: ['bible:J4'],
        disclosureSliceIds: ['R11_relationship_reveal'],
      },
    });

    expect(packet.disclosure.decision?.result).toBe('ALLOW');
    expect(draft.privateSourceRefsMentioned).toEqual(['bible:J4']);
  });

  it('keeps AUTHOR_UNDEFINED content out of context as AUTHORITY_ABSTAIN', () => {
    const decision = evaluateCharacterDisclosurePreflightV2({
      characterId: 'seyeon',
      topicKey: 'past_romance_detail',
      source: source(),
      factAuthority: authority('AUTHOR_UNDEFINED'),
      relationship: {
        gate: 'DEEP_TRUST',
        trustBand: 'high',
        relevantSharedHistoryRefs: ['event:shared-history'],
      },
      questionContext: 'continuation',
    });

    const context = assembleSeyeonRuntimeContextV2({
      relationship: relationship(),
      recentMessages: [],
      retrievedMemories: [baseMemory()],
      disclosure: { decision, retrievedSources: [] },
    });

    expect(context.disclosure.decision?.result).toBe('AUTHORITY_ABSTAIN');
    expect(context.disclosure.retrievedSources).toEqual([]);
  });
});
