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
    disclosure: { decision: null, retrievedSources: [] },
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
      supportingHistoryRefs: [] as string[],
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
      disclosure: { decision: null, retrievedSources: [] },
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

  it('keeps a mild first-contact state share active instead of defaulting to caretaker behavior', () => {
    const firstContact = assembleSeyeonRuntimeContextV2({
      relationship: null,
      recentMessages: [
        {
          messageId: 'message-current',
          role: 'user',
          text: '오늘은 별일 없었는데 조금 피곤하네요.',
        },
      ],
      disclosure: { decision: null, retrievedSources: [] },
      retrievedMemories: [],
      focuses: ['care', 'expression'],
    });

    const accepted = guardSeyeonTurnInterpretationV2({
      context: firstContact,
      rawOutput: {
        schemaVersion: 'seyeon-turn-interpretation-v2',
        userMove: 'low_intensity_state_share',
        notice: {
          summary: '도움 요청 없이 가벼운 피로를 공유했다.',
          evidenceRefs: ['message-current'],
        },
        immediateWant: {
          key: 'stay_without_interrogation',
          summary: '피로를 키우지 않고 가볍게 대화를 이어가고 싶다.',
        },
        tension: {
          key: 'help_vs_user_agency',
          summary: '챙김으로 과장하지 않고 현재 상태를 그대로 받아들인다.',
        },
        chosenAction: {
          key: 'approach',
          rationale: '짧게 받아들이고 세연 쪽에서 다음 대화의 움직임을 만든다.',
        },
        expressionState: 'baseline',
        reveal: {
          level: 'public',
          triggerRef: 'message-current',
          supportingHistoryRefs: [],
        },
        memoryRefsUsed: [],
      },
    });

    expect(accepted.userMove).toBe('low_intensity_state_share');
    expect(accepted.chosenAction.key).toBe('approach');
    expect(accepted.expressionState).toBe('baseline');

    expect(() =>
      guardSeyeonTurnInterpretationV2({
        context: firstContact,
        rawOutput: {
          ...accepted,
          chosenAction: {
            key: 'give_space',
            rationale: '쉬도록 권하고 대화를 사용자의 선택에 맡긴다.',
          },
        },
      }),
    ).toThrow(/low-intensity state share/);

    expect(() =>
      guardSeyeonTurnInterpretationV2({
        context: firstContact,
        rawOutput: {
          ...accepted,
          expressionState: 'caring',
        },
      }),
    ).toThrow(/baseline or playful/);
  });

  it('requires a Se-yeon-owned present desire when the user directly asks what she wants', () => {
    const firstContact = assembleSeyeonRuntimeContextV2({
      relationship: null,
      recentMessages: [
        {
          messageId: 'message-current',
          role: 'user',
          text: '세연 씨는 지금 뭐 하고 싶어요?',
        },
      ],
      disclosure: { decision: null, retrievedSources: [] },
      retrievedMemories: [],
      focuses: ['intimacy', 'expression'],
    });

    const accepted = guardSeyeonTurnInterpretationV2({
      context: firstContact,
      rawOutput: {
        schemaVersion: 'seyeon-turn-interpretation-v2',
        userMove: 'asked_seyeon_current_want',
        notice: {
          summary: '사용자가 세연의 현재 욕구를 직접 물었다.',
          evidenceRefs: ['message-current'],
        },
        immediateWant: {
          key: 'disclose_desire',
          summary: '지금 하고 싶은 일을 세연 쪽에서 먼저 말하고 싶다.',
        },
        tension: {
          key: 'approach_vs_self_disclosure',
          summary: '자기 욕구를 말하되 첫 만남의 거리는 지킨다.',
        },
        chosenAction: {
          key: 'invite',
          rationale: '세연의 현재 선호를 하나 말한 뒤 사용자를 그 활동에 초대한다.',
        },
        expressionState: 'playful',
        reveal: {
          level: 'public',
          triggerRef: 'message-current',
          supportingHistoryRefs: [],
        },
        memoryRefsUsed: [],
      },
    });

    expect(accepted.userMove).toBe('asked_seyeon_current_want');
    expect(accepted.immediateWant.key).toBe('disclose_desire');
    expect(accepted.chosenAction.key).toBe('invite');

    expect(() =>
      guardSeyeonTurnInterpretationV2({
        context: firstContact,
        rawOutput: {
          ...accepted,
          immediateWant: {
            key: 'create_next_step',
            summary: '대화 진행만 만들고 싶다.',
          },
          chosenAction: {
            key: 'activate',
            rationale: '다음 대화 장치를 만든다.',
          },
        },
      }),
    ).toThrow(/current want/);
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