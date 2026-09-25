import { describe, expect, it } from 'vitest';

import { assembleSeyeonRuntimeContextV2 } from '../packages/domain/src/seyeon-runtime-context-v2.js';
import {
  buildSeyeonRendererPacketV2,
  guardSeyeonRendererOutputV2,
  hashSeyeonRendererUtteranceV2,
  SeyeonRendererGuardErrorV2,
} from '../packages/domain/src/seyeon-renderer-v2.js';
import { guardSeyeonTurnInterpretationV2 } from '../packages/domain/src/seyeon-turn-interpreter-v2.js';

function runtimeContext() {
  return assembleSeyeonRuntimeContextV2({
    relationship: {
      stageKey: 'familiar',
      closenessBand: 'medium',
      trustBand: 'medium',
      frictionBand: 'low',
      revision: 8,
      policyVersion: 'relationship-policy-v1',
    },
    recentMessages: [
      {
        messageId: 'message-current',
        role: 'user',
        text: '지난번에 제가 A 좋아한다고 했던 거 기억나요?',
      },
    ],
    disclosure: { decision: null, retrievedSources: [] },
    retrievedMemories: [
      {
        memoryId: 'memory-a',
        kind: 'memory',
        claimKind: 'fact',
        summary: '사용자는 A를 좋아한다고 직접 말했다.',
        sourceRef: 'turn:184/message:901',
        relevance: 0.98,
        salience: 0.72,
      },
      {
        memoryId: 'memory-unused',
        kind: 'memory',
        claimKind: 'fact',
        summary: '사용자는 다른 대화에서 C를 언급했다.',
        sourceRef: 'turn:160/message:800',
        relevance: 0.2,
        salience: 0.3,
      },
    ],
    focuses: ['memory', 'intimacy', 'expression'],
  });
}

function interpretation() {
  const context = runtimeContext();
  return {
    context,
    interpretation: guardSeyeonTurnInterpretationV2({
      context,
      rawOutput: {
        schemaVersion: 'seyeon-turn-interpretation-v2',
        userMove: 'remembered_seyeon_detail',
        notice: {
          summary: '사용자가 이전 취향을 현재 대화에 다시 연결했다.',
          evidenceRefs: ['message-current', 'turn:184/message:901'],
        },
        immediateWant: {
          key: 'continue_promise',
          summary: '기억을 과시하지 않고 자연스럽게 이어가고 싶다.',
        },
        tension: {
          key: 'remember_vs_memory_showoff',
          summary: '기억은 사용하되 기록 조회처럼 말하지 않는다.',
        },
        chosenAction: {
          key: 'remember_naturally',
          rationale: '현재 질문에 필요한 과거 취향만 짧게 반영한다.',
        },
        expressionState: 'baseline',
        reveal: {
          level: 'familiar',
          triggerRef: 'message-current',
          supportingHistoryRefs: [],
        },
        memoryRefsUsed: ['memory-a'],
      },
    }),
  };
}

function passingReview(utterance: string) {
  return {
    schemaVersion: 'seyeon-semantic-review-v2' as const,
    reviewedUtteranceHash: hashSeyeonRendererUtteranceV2(utterance),
    failureCodes: [] as const,
    evidence: [] as const,
  };
}

describe('Se-yeon renderer packet and guard v2', () => {
  it('passes only memory evidence selected by the guarded turn interpretation', () => {
    const prepared = interpretation();
    const packet = buildSeyeonRendererPacketV2(prepared);

    expect(packet.memoryEvidence.map((memory) => memory.memoryId)).toEqual([
      'memory-a',
    ]);
    expect(packet.outputPolicy.memoryCallbackRequiresBoundEvidence).toBe(true);
    expect(packet.authorityBoundaries.legacyProjectionFieldsAreNonAuthoritative).toBe(true);
    expect(packet.outputPolicy.legacyProjectionFieldsNeverTruthAuthority).toBe(true);
    expect(packet.integrity.unverifiedClaimsMayEnterAsFacts).toBe(false);
  });

  it('accepts a renderer draft only when expression, reveal, memory, and semantic review all bind', () => {
    const prepared = interpretation();
    const packet = buildSeyeonRendererPacketV2(prepared);
    const utterance = '네. A 쪽이 더 좋다고 하셨죠. 지금도 그쪽이 더 끌리세요?';

    const envelope = guardSeyeonRendererOutputV2({
      packet,
      rawOutput: {
        schemaVersion: 'seyeon-renderer-draft-v2',
        utterance,
        expressionState: 'baseline',
        revealLevel: 'familiar',
        memoryRefsMentioned: ['memory-a'],
        privateSourceRefsMentioned: [],
        disclosureSliceIds: [],
      },
      semanticReview: passingReview(utterance),
    });

    expect(envelope.utterance).toBe(utterance);
    expect(envelope.memoryRefsMentioned).toEqual(['memory-a']);
    expect(envelope.revealLevel).toBe('familiar');
  });

  it('rejects a renderer callback to memory that the interpreter did not authorize', () => {
    const prepared = interpretation();
    const packet = buildSeyeonRendererPacketV2(prepared);
    const utterance = '전에 C 얘기도 하셨죠.';

    expect(() =>
      guardSeyeonRendererOutputV2({
        packet,
        rawOutput: {
          schemaVersion: 'seyeon-renderer-draft-v2',
          utterance,
          expressionState: 'baseline',
          revealLevel: 'familiar',
          memoryRefsMentioned: ['memory-unused'],
          privateSourceRefsMentioned: [],
          disclosureSliceIds: [],
        },
        semanticReview: passingReview(utterance),
      }),
    ).toThrow(/not authorized/);
  });

  it('rejects renderer-side escalation of expression or relationship reveal', () => {
    const prepared = interpretation();
    const packet = buildSeyeonRendererPacketV2(prepared);
    const utterance = '사실 계속 기다렸어요.';

    expect(() =>
      guardSeyeonRendererOutputV2({
        packet,
        rawOutput: {
          schemaVersion: 'seyeon-renderer-draft-v2',
          utterance,
          expressionState: 'vulnerable',
          revealLevel: 'deep_trust',
          memoryRefsMentioned: [],
          privateSourceRefsMentioned: [],
          disclosureSliceIds: [],
        },
        semanticReview: passingReview(utterance),
      }),
    ).toThrow(/expressionState/);
  });

  it('rejects a semantic review that is bound to different text', () => {
    const prepared = interpretation();
    const packet = buildSeyeonRendererPacketV2(prepared);
    const utterance = '네, 기억나요.';

    expect(() =>
      guardSeyeonRendererOutputV2({
        packet,
        rawOutput: {
          schemaVersion: 'seyeon-renderer-draft-v2',
          utterance,
          expressionState: 'baseline',
          revealLevel: 'familiar',
          memoryRefsMentioned: ['memory-a'],
          privateSourceRefsMentioned: [],
          disclosureSliceIds: [],
        },
        semanticReview: passingReview('다른 문장입니다.'),
      }),
    ).toThrow(/not bound/);
  });

  it('rejects user-agency or canon failures reported by the semantic reviewer', () => {
    const prepared = interpretation();
    const packet = buildSeyeonRendererPacketV2(prepared);
    const utterance = '사실 속으로는 제가 정해주길 바라고 계시잖아요.';

    expect(() =>
      guardSeyeonRendererOutputV2({
        packet,
        rawOutput: {
          schemaVersion: 'seyeon-renderer-draft-v2',
          utterance,
          expressionState: 'baseline',
          revealLevel: 'familiar',
          memoryRefsMentioned: [],
          privateSourceRefsMentioned: [],
          disclosureSliceIds: [],
        },
        semanticReview: {
          schemaVersion: 'seyeon-semantic-review-v2',
          reviewedUtteranceHash: hashSeyeonRendererUtteranceV2(utterance),
          failureCodes: ['USER_AGENCY_CANONIZATION'],
          evidence: [
            {
              code: 'USER_AGENCY_CANONIZATION',
              excerpt: '속으로는 ... 바라고 계시잖아요',
              reason: '사용자의 숨은 의도를 사실로 확정했다.',
            },
          ],
        },
      }),
    ).toThrow(SeyeonRendererGuardErrorV2);
  });

  it('does not allow renderer-authored disclosure without a guarded self_disclose action', () => {
    const prepared = interpretation();
    const packet = buildSeyeonRendererPacketV2(prepared);
    const utterance = '그건 저도 조금 그래요.';

    expect(() =>
      guardSeyeonRendererOutputV2({
        packet,
        rawOutput: {
          schemaVersion: 'seyeon-renderer-draft-v2',
          utterance,
          expressionState: 'baseline',
          revealLevel: 'familiar',
          memoryRefsMentioned: [],
          privateSourceRefsMentioned: [],
          disclosureSliceIds: ['G_affection_intimacy'],
        },
        semanticReview: passingReview(utterance),
      }),
    ).toThrow(/self_disclose/);
  });
});