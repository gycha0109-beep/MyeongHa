import { describe, expect, it } from 'vitest';

import { assembleSeyeonRuntimeContextV2 } from '../packages/domain/src/seyeon-runtime-context-v2.js';
import {
  guardSeyeonTurnInterpretationV2,
  SeyeonTurnInterpretationErrorV2,
} from '../packages/domain/src/seyeon-turn-interpreter-v2.js';

function context() {
  return assembleSeyeonRuntimeContextV2({
    relationship: {
      stageKey: 'attached',
      closenessBand: 'high',
      trustBand: 'high',
      frictionBand: 'low',
      revision: 12,
      policyVersion: 'relationship-policy-v1',
    },
    recentMessages: [
      {
        messageId: 'message-current',
        role: 'user',
        text: '지난번에 제가 고른 A, 기억나요?',
      },
    ],
    retrievedMemories: [
      {
        memoryId: 'memory-choice',
        kind: 'memory',
        claimKind: 'fact',
        summary: '사용자가 이전에 A를 직접 선택했다.',
        sourceRef: 'turn:184/message:901',
        relevance: 0.95,
        salience: 0.8,
      },
    ],
    focuses: ['choice', 'memory', 'intimacy'],
  });
}

function validDraft() {
  return {
    schemaVersion: 'seyeon-turn-interpretation-v2',
    userMove: 'remembered_seyeon_detail',
    notice: {
      summary: '사용자가 이전 선택을 현재 대화에 다시 연결했다.',
      evidenceRefs: ['message-current', 'turn:184/message:901'],
    },
    immediateWant: {
      key: 'continue_promise',
      summary: '이전 대화를 자연스럽게 이어가고 싶다.',
    },
    tension: {
      key: 'remember_vs_memory_showoff',
      summary: '기억을 쓰되 기억력을 과시하지 않는다.',
    },
    chosenAction: {
      key: 'remember_naturally',
      rationale: '현재 선택에 필요한 과거 사실만 짧게 연결한다.',
    },
    expressionState: 'baseline',
    reveal: {
      level: 'familiar',
      triggerRef: 'message-current',
      supportingHistoryRefs: [],
    },
    memoryRefsUsed: ['memory-choice'],
  };
}

describe('Se-yeon turn interpreter v2 guard', () => {
  it('accepts a source-backed interpretation packet', () => {
    const guarded = guardSeyeonTurnInterpretationV2({
      rawOutput: validDraft(),
      context: context(),
    });

    expect(guarded.chosenAction.key).toBe('remember_naturally');
    expect(guarded.memoryRefsUsed).toEqual(['memory-choice']);
    expect(guarded.notice.evidenceRefs).toContain('turn:184/message:901');
  });

  it('rejects fake callback evidence that is absent from assembled context', () => {
    const draft = validDraft();
    draft.notice.evidenceRefs = ['turn:999'];

    expect(() =>
      guardSeyeonTurnInterpretationV2({
        rawOutput: draft,
        context: context(),
      }),
    ).toThrow(SeyeonTurnInterpretationErrorV2);
  });

  it('rejects remember_naturally when no retrieved memory is actually used', () => {
    const draft = validDraft();
    draft.memoryRefsUsed = [];

    expect(() =>
      guardSeyeonTurnInterpretationV2({
        rawOutput: draft,
        context: context(),
      }),
    ).toThrow(/remember_naturally/);
  });

  it('requires supporting history for attached reveal', () => {
    const draft = validDraft();
    draft.reveal.level = 'attached';

    expect(() =>
      guardSeyeonTurnInterpretationV2({
        rawOutput: draft,
        context: context(),
      }),
    ).toThrow(/supporting relationship history/);
  });

  it('allows deep trust only with high trust and supporting history', () => {
    const draft = validDraft();
    draft.reveal = {
      level: 'deep_trust',
      triggerRef: 'message-current',
      supportingHistoryRefs: ['turn:184/message:901'],
    };

    expect(
      guardSeyeonTurnInterpretationV2({
        rawOutput: draft,
        context: context(),
      }).reveal.level,
    ).toBe('deep_trust');

    const lowTrustContext = assembleSeyeonRuntimeContextV2({
      relationship: {
        stageKey: 'familiar',
        closenessBand: 'high',
        trustBand: 'medium',
        frictionBand: 'low',
        revision: 4,
        policyVersion: 'relationship-policy-v1',
      },
      recentMessages: context().recentConversation,
      retrievedMemories: context().retrievedMemories,
      focuses: ['intimacy', 'memory'],
    });

    expect(() =>
      guardSeyeonTurnInterpretationV2({
        rawOutput: draft,
        context: lowTrustContext,
      }),
    ).toThrow(/deep_trust/);
  });

  it('does not permit jealousy as a public/familiar default expression', () => {
    const draft = validDraft();
    draft.expressionState = 'jealous';

    expect(() =>
      guardSeyeonTurnInterpretationV2({
        rawOutput: draft,
        context: context(),
      }),
    ).toThrow(/jealous expression/);
  });
});
