import { describe, expect, it } from 'vitest';
import {
  guardSeyeonTurnInterpretationV2,
  SEYEON_TURN_INTERPRETATION_SCHEMA_VERSION_V2,
} from '../packages/domain/src/seyeon-turn-interpreter-v2.js';
import type { SeyeonRuntimeContextV2 } from '../packages/domain/src/seyeon-runtime-context-v2.js';

const current = '11111111-1111-4111-8111-111111111111';
const context = {
  recentConversation: [{ messageId: current, role: 'user', text: '안녕하세요.' }],
  retrievedMemories: [],
  relationship: null,
  disclosure: { decision: null },
  behaviorPolicy: {
    interactionDepth: 'public_first_contact',
    lowIntensityExpressionPolicy: 'runtime_clamp_baseline_or_playful',
  },
  actionPolicy: {
    allowedActionKeys: ['approach', 'activate', 'tease', 'invite', 'admit_boundary', 'accept_care'],
    allowedExpressionStates: ['baseline', 'energized', 'playful', 'embarrassed', 'caring'],
  },
} as unknown as SeyeonRuntimeContextV2;
const interpretation = {
  schemaVersion: SEYEON_TURN_INTERPRETATION_SCHEMA_VERSION_V2,
  userMove: 'neutral_or_other',
  notice: { summary: '상대가 인사를 했다.', evidenceRefs: [current] },
  immediateWant: { key: 'break_awkwardness', summary: '세연도 인사하고 싶다.' },
  tension: { key: 'none_material', summary: '특별한 갈등은 없다.' },
  chosenAction: { key: 'approach', rationale: '먼저 인사한다.' },
  expressionState: 'baseline',
  reveal: { level: 'public', triggerRef: null, supportingHistoryRefs: [] },
  memoryRefsUsed: [],
};

describe('Se-yeon interpreter server-owned action boundary', () => {
  it('allows a compatible character-owned first-contact action', () => {
    expect(guardSeyeonTurnInterpretationV2({
      context, rawOutput: interpretation,
    }).chosenAction.key).toBe('approach');
  });

  it('rejects an existing action key forbidden by the current working context', () => {
    expect(() => guardSeyeonTurnInterpretationV2({
      context,
      rawOutput: {
        ...interpretation,
        chosenAction: { key: 'care_practically', rationale: '상황과 무관한 과도한 돌봄을 선택한다.' },
      },
    })).toThrow('chosenAction is not admitted');
  });

  it('rejects a valid vocabulary emotion that public first contact does not admit', () => {
    expect(() => guardSeyeonTurnInterpretationV2({
      context,
      rawOutput: { ...interpretation, expressionState: 'jealous' },
    })).toThrow('expressionState is not admitted');
  });

  it('keeps the existing low-intensity emotional clamp before authorization', () => {
    const result = guardSeyeonTurnInterpretationV2({
      context,
      rawOutput: {
        ...interpretation,
        userMove: 'low_intensity_state_share',
        expressionState: 'angry',
      },
    });
    expect(result.expressionState).toBe('baseline');
  });
});
