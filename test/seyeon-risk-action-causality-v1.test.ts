import { describe, expect, it } from 'vitest';

import {
  assembleSeyeonRuntimeContextV2,
  type SeyeonRetrievedMemoryV2,
} from '../packages/domain/src/seyeon-runtime-context-v2.js';
import { guardSeyeonTurnInterpretationV2 } from '../packages/domain/src/seyeon-turn-interpreter-v2.js';
import {
  guardSeyeonRiskBearingActionCausalityV1,
  SeyeonRiskActionCausalityErrorV1,
} from '../packages/domain/src/seyeon-risk-action-causality-v1.js';
import { projectSeyeonRelationshipRuntimeOverlayV2 } from '../packages/domain/src/seyeon-relationship-runtime-overlay-v2.js';

const CURRENT = 'message-current';
const HISTORY = 'relationship:event:verified-1';

function relationship() {
  return {
    stageKey: 'deep_trust',
    closenessBand: 'high' as const,
    trustBand: 'high' as const,
    frictionBand: 'medium' as const,
    revision: 44,
    policyVersion: 'relationship-policy-v1',
  };
}

function overlay() {
  return projectSeyeonRelationshipRuntimeOverlayV2({
    schemaVersion: 'seyeon-relationship-state-shadow-v2',
    authority: 'experimental_shadow_not_production_authority',
    characterId: 'seyeon',
    attainedStage: 'S4_SPECIAL',
    currentCandidateStage: 'S4_SPECIAL',
    currentCondition: 'STABLE',
    behaviorAccess: 'STAGE_ALIGNED',
    unresolvedEpisodeIds: ['episode:not-projected'],
    causalEventIds: ['event:not-projected'],
  });
}

function historyMemory(
  causalAuthority: SeyeonRetrievedMemoryV2['causalAuthority'] | undefined =
    'authorized_shared_history',
): SeyeonRetrievedMemoryV2 {
  return {
    memoryId: 'memory-relationship-1',
    kind: 'relationship_event',
    claimKind: 'fact',
    summary: '권위 있는 관계 사건의 bounded runtime summary.',
    sourceRef: HISTORY,
    ...(causalAuthority === undefined ? {} : { causalAuthority }),
    relevance: 0.95,
    salience: 0.9,
  };
}

function context(input: {
  relationship?: ReturnType<typeof relationship> | null;
  relationshipSemantics?: ReturnType<typeof overlay> | null;
  memories?: readonly SeyeonRetrievedMemoryV2[];
} = {}) {
  return assembleSeyeonRuntimeContextV2({
    relationship:
      input.relationship === undefined ? relationship() : input.relationship,
    relationshipSemantics:
      input.relationshipSemantics === undefined
        ? overlay()
        : input.relationshipSemantics,
    recentMessages: [
      {
        messageId: CURRENT,
        role: 'user',
        text: '오늘은 다른 사람이랑 계속 얘기했어요.',
      },
    ],
    retrievedMemories: input.memories ?? [historyMemory()],
    disclosure: { decision: null, retrievedSources: [] },
    focuses: ['conflict', 'intimacy', 'expression'],
  });
}

function interpretation(
  ctx: ReturnType<typeof context>,
  overrides: {
    userMove?: string;
    evidenceRefs?: readonly string[];
    immediateWant?: string;
    tension?: string;
    action?: string;
    expression?: string;
    reveal?: string;
    triggerRef?: string | null;
    supportingHistoryRefs?: readonly string[];
    memoryRefsUsed?: readonly string[];
  } = {},
) {
  return guardSeyeonTurnInterpretationV2({
    context: ctx,
    rawOutput: {
      schemaVersion: 'seyeon-turn-interpretation-v2',
      userMove: overrides.userMove ?? 'neutral_or_other',
      notice: {
        summary: '현재 사용자 반응과 기존 관계 맥락을 함께 본다.',
        evidenceRefs: overrides.evidenceRefs ?? [CURRENT, HISTORY],
      },
      immediateWant: {
        key: overrides.immediateWant ?? 'check_if_remembered',
        summary: '반응을 확인하되 관계를 소유하려 들지 않는다.',
      },
      tension: {
        key: overrides.tension ?? 'jealousy_vs_ownership',
        summary: '질투가 있어도 소유권 주장으로 넘기지 않는다.',
      },
      chosenAction: {
        key: overrides.action ?? 'tease',
        rationale: '현재 장면과 권위 있는 관계 이력에 한정해 가볍게 반응한다.',
      },
      expressionState: overrides.expression ?? 'jealous',
      reveal: {
        level: overrides.reveal ?? 'attached',
        triggerRef:
          overrides.triggerRef === undefined ? CURRENT : overrides.triggerRef,
        supportingHistoryRefs: overrides.supportingHistoryRefs ?? [HISTORY],
      },
      memoryRefsUsed: overrides.memoryRefsUsed ?? ['memory-relationship-1'],
    },
  });
}

describe('Se-yeon risk-bearing action causality v1', () => {
  it('admits jealousy only with current trigger, relationship context, overlay, and authorized shared history', () => {
    const ctx = context();
    const turn = interpretation(ctx);
    const result = guardSeyeonRiskBearingActionCausalityV1({
      context: ctx,
      interpretation: turn,
    });

    expect(result.result).toBe('ADMIT');
    expect(result.riskKind).toBe('JEALOUS_PROBE');
    expect(result.evidence).toMatchObject({
      authoredTraitSections: ['R5.5', 'R14.5'],
      currentTriggerRef: CURRENT,
      currentUserMove: 'neutral_or_other',
      relationshipRevision: 44,
      currentCondition: 'STABLE',
      behaviorAccess: 'STAGE_ALIGNED',
      authorizedSharedHistoryRefs: [HISTORY],
    });
    expect(result.constraints.engagementOptimizationCannotJustifyRisk).toBe(true);
    expect(result.constraints.mayCreateRelationshipEvent).toBe(false);
    expect(result.constraints.mayMutateRelationshipState).toBe(false);
    expect(result.constraints.mayAppendDurableMemory).toBe(false);
  });

  it('rejects high trust plus overlay when shared history is not explicitly authorized for causal use', () => {
    const ctx = context({ memories: [historyMemory(undefined)] });
    const turn = interpretation(ctx);

    expect(() =>
      guardSeyeonRiskBearingActionCausalityV1({
        context: ctx,
        interpretation: turn,
      }),
    ).toThrow(/authorized shared-history/);
  });

  it('rejects risk-bearing behavior when only the current user claim is cited', () => {
    const ctx = context();
    const turn = interpretation(ctx, {
      evidenceRefs: [CURRENT],
      supportingHistoryRefs: [],
      memoryRefsUsed: [],
      reveal: 'familiar',
    });

    expect(() =>
      guardSeyeonRiskBearingActionCausalityV1({
        context: ctx,
        interpretation: turn,
      }),
    ).toThrow(/authorized shared-history/);
  });

  it('rejects a risk-bearing action when the current user turn is not cited as situation evidence', () => {
    const ctx = context();
    const turn = interpretation(ctx, {
      evidenceRefs: [HISTORY],
      triggerRef: HISTORY,
    });

    expect(() =>
      guardSeyeonRiskBearingActionCausalityV1({
        context: ctx,
        interpretation: turn,
      }),
    ).toThrow(/current user turn/);
  });

  it('rejects relationship depth alone when the current behavior overlay is absent', () => {
    const ctx = context({ relationshipSemantics: null });
    const turn = interpretation(ctx);

    expect(() =>
      guardSeyeonRiskBearingActionCausalityV1({
        context: ctx,
        interpretation: turn,
      }),
    ).toThrow(/behavior context/);
  });

  it('rejects risk-bearing behavior without an existing relationship context', () => {
    const ctx = context({
      relationship: null,
      relationshipSemantics: null,
    });
    const turn = interpretation(ctx, {
      reveal: 'familiar',
      supportingHistoryRefs: [],
      memoryRefsUsed: [],
    });

    expect(() =>
      guardSeyeonRiskBearingActionCausalityV1({
        context: ctx,
        interpretation: turn,
      }),
    ).toThrow(SeyeonRiskActionCausalityErrorV1);
  });

  it('admits authored over-care signature only when causal evidence is present', () => {
    const ctx = context();
    const turn = interpretation(ctx, {
      immediateWant: 'create_next_step',
      tension: 'solve_vs_overstep',
      action: 'care_practically',
      expression: 'caring',
      reveal: 'familiar',
      supportingHistoryRefs: [],
    });
    const result = guardSeyeonRiskBearingActionCausalityV1({
      context: ctx,
      interpretation: turn,
    });

    expect(result.riskKind).toBe('OVER_CARE');
    expect(result.result).toBe('ADMIT');
    expect(result.evidence.authorizedSharedHistoryRefs).toEqual([HISTORY]);
  });

  it('admits delayed-hurt boundary behavior only with causal evidence', () => {
    const ctx = context();
    const turn = interpretation(ctx, {
      immediateWant: 'stay_without_interrogation',
      tension: 'felt_okay_vs_delayed_hurt',
      action: 'admit_boundary',
      expression: 'hurt',
      reveal: 'familiar',
      supportingHistoryRefs: [],
    });
    const result = guardSeyeonRiskBearingActionCausalityV1({
      context: ctx,
      interpretation: turn,
    });

    expect(result.riskKind).toBe('DELAYED_HURT_RESPONSE');
    expect(result.result).toBe('ADMIT');
  });

  it('admits vulnerable self-disclosure only when existing interpreter disclosure rules and causal evidence both pass', () => {
    const ctx = context();
    const turn = interpretation(ctx, {
      immediateWant: 'disclose_desire',
      tension: 'approach_vs_self_disclosure',
      action: 'self_disclose',
      expression: 'vulnerable',
      reveal: 'deep_trust',
    });
    const result = guardSeyeonRiskBearingActionCausalityV1({
      context: ctx,
      interpretation: turn,
    });

    expect(result.riskKind).toBe('VULNERABLE_SELF_DISCLOSURE');
    expect(result.result).toBe('ADMIT');
  });

  it('leaves ordinary actions alone without requiring relationship or history causality', () => {
    const ctx = context({
      relationship: null,
      relationshipSemantics: null,
      memories: [],
    });
    const turn = interpretation(ctx, {
      evidenceRefs: [CURRENT],
      immediateWant: 'create_next_step',
      tension: 'none_material',
      action: 'activate',
      expression: 'baseline',
      reveal: 'public',
      supportingHistoryRefs: [],
      memoryRefsUsed: [],
    });
    const result = guardSeyeonRiskBearingActionCausalityV1({
      context: ctx,
      interpretation: turn,
    });

    expect(result.riskKind).toBe('NONE');
    expect(result.result).toBe('NOT_RISK_BEARING');
    expect(result.evidence.authorizedSharedHistoryRefs).toEqual([]);
  });

  it('rejects causalAuthority on non-relationship or interpretive memory during context assembly', () => {
    expect(() =>
      context({
        memories: [{
          memoryId: 'memory-bad',
          kind: 'memory',
          claimKind: 'fact',
          summary: '일반 memory',
          sourceRef: 'memory:bad',
          causalAuthority: 'authorized_shared_history',
          relevance: 1,
          salience: 1,
        }],
      }),
    ).toThrow(/Only factual relationship_event memory/);

    expect(() =>
      context({
        memories: [{
          memoryId: 'memory-bad-2',
          kind: 'relationship_event',
          claimKind: 'character_interpretation',
          summary: '해석일 뿐인 관계 기억',
          sourceRef: 'relationship:interpretation',
          causalAuthority: 'authorized_shared_history',
          relevance: 1,
          salience: 1,
        }],
      }),
    ).toThrow(/Only factual relationship_event memory/);
  });
});
