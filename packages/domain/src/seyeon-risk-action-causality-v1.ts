import type { SeyeonRuntimeContextV2 } from './seyeon-runtime-context-v2.js';
import type { SeyeonTurnInterpretationV2 } from './seyeon-turn-interpreter-v2.js';

export const SEYEON_RISK_ACTION_CAUSALITY_VERSION_V1 =
  'seyeon-risk-action-causality-v1' as const;

export const SEYEON_RISK_ACTION_KINDS_V1 = Object.freeze([
  'NONE',
  'OVER_CARE',
  'DELAYED_HURT_RESPONSE',
  'JEALOUS_PROBE',
  'VULNERABLE_SELF_DISCLOSURE',
] as const);

export type SeyeonRiskActionKindV1 =
  (typeof SEYEON_RISK_ACTION_KINDS_V1)[number];

export interface SeyeonRiskActionCausalityDecisionV1 {
  readonly schemaVersion: typeof SEYEON_RISK_ACTION_CAUSALITY_VERSION_V1;
  readonly characterId: 'seyeon';
  readonly riskKind: SeyeonRiskActionKindV1;
  readonly result: 'NOT_RISK_BEARING' | 'ADMIT';
  readonly evidence: Readonly<{
    readonly authoredTraitSections: readonly ['R5.5', 'R14.5'];
    readonly currentTriggerRef: string | null;
    readonly currentUserMove: SeyeonTurnInterpretationV2['userMove'];
    readonly immediateWant: SeyeonTurnInterpretationV2['immediateWant']['key'];
    readonly tension: SeyeonTurnInterpretationV2['tension']['key'];
    readonly relationshipRevision: number | null;
    readonly relationshipPolicyVersion: string | null;
    readonly currentCondition:
      | SeyeonRuntimeContextV2['relationshipSemantics']['currentCondition']
      | null;
    readonly behaviorAccess:
      | SeyeonRuntimeContextV2['relationshipSemantics']['behaviorAccess']
      | null;
    readonly authorizedSharedHistoryRefs: readonly string[];
  }>;
  readonly constraints: Readonly<{
    readonly scoreOnlyCausalityForbidden: true;
    readonly overlayAloneCannotCauseAction: true;
    readonly userClaimCannotBecomeHistoryEvidence: true;
    readonly assistantOutputCannotBecomeHistoryEvidence: true;
    readonly engagementOptimizationCannotJustifyRisk: true;
    readonly mayCreateRelationshipEvent: false;
    readonly mayMutateRelationshipState: false;
    readonly mayAppendDurableMemory: false;
  }>;
}

export class SeyeonRiskActionCausalityErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonRiskActionCausalityErrorV1';
  }
}

function classifyRiskKind(
  interpretation: SeyeonTurnInterpretationV2,
): SeyeonRiskActionKindV1 {
  if (interpretation.expressionState === 'jealous') {
    return 'JEALOUS_PROBE';
  }

  if (
    interpretation.chosenAction.key === 'self_disclose' &&
    interpretation.expressionState === 'vulnerable'
  ) {
    return 'VULNERABLE_SELF_DISCLOSURE';
  }

  if (
    (interpretation.chosenAction.key === 'narrow_choices' ||
      interpretation.chosenAction.key === 'care_practically') &&
    (interpretation.tension.key === 'help_vs_user_agency' ||
      interpretation.tension.key === 'solve_vs_overstep')
  ) {
    return 'OVER_CARE';
  }

  if (
    (interpretation.chosenAction.key === 'give_space' ||
      interpretation.chosenAction.key === 'admit_boundary') &&
    (interpretation.expressionState === 'hurt' ||
      interpretation.expressionState === 'sulking' ||
      interpretation.expressionState === 'angry') &&
    interpretation.tension.key === 'felt_okay_vs_delayed_hurt'
  ) {
    return 'DELAYED_HURT_RESPONSE';
  }

  return 'NONE';
}

function currentUserMessageRef(context: SeyeonRuntimeContextV2): string | null {
  for (let index = context.recentConversation.length - 1; index >= 0; index -= 1) {
    const message = context.recentConversation[index];
    if (message?.role === 'user') return message.messageId;
  }
  return null;
}

function authorizedSharedHistoryRefs(input: {
  readonly context: SeyeonRuntimeContextV2;
  readonly interpretation: SeyeonTurnInterpretationV2;
}): readonly string[] {
  const referencedSourceRefs = new Set<string>([
    ...input.interpretation.notice.evidenceRefs,
    ...input.interpretation.reveal.supportingHistoryRefs,
  ]);

  const usedMemoryIds = new Set(input.interpretation.memoryRefsUsed);
  for (const memory of input.context.retrievedMemories) {
    if (usedMemoryIds.has(memory.memoryId)) {
      referencedSourceRefs.add(memory.sourceRef);
    }
  }

  return Object.freeze(
    input.context.retrievedMemories
      .filter(
        (memory) =>
          memory.kind === 'relationship_event' &&
          memory.claimKind === 'fact' &&
          memory.causalAuthority === 'authorized_shared_history' &&
          referencedSourceRefs.has(memory.sourceRef),
      )
      .map((memory) => memory.sourceRef)
      .filter((sourceRef, index, all) => all.indexOf(sourceRef) === index),
  );
}

function decision(input: {
  readonly riskKind: SeyeonRiskActionKindV1;
  readonly result: 'NOT_RISK_BEARING' | 'ADMIT';
  readonly context: SeyeonRuntimeContextV2;
  readonly interpretation: SeyeonTurnInterpretationV2;
  readonly currentTriggerRef: string | null;
  readonly historyRefs: readonly string[];
}): SeyeonRiskActionCausalityDecisionV1 {
  return Object.freeze({
    schemaVersion: SEYEON_RISK_ACTION_CAUSALITY_VERSION_V1,
    characterId: 'seyeon' as const,
    riskKind: input.riskKind,
    result: input.result,
    evidence: Object.freeze({
      authoredTraitSections: Object.freeze(['R5.5', 'R14.5'] as const),
      currentTriggerRef: input.currentTriggerRef,
      currentUserMove: input.interpretation.userMove,
      immediateWant: input.interpretation.immediateWant.key,
      tension: input.interpretation.tension.key,
      relationshipRevision: input.context.relationship?.revision ?? null,
      relationshipPolicyVersion: input.context.relationship?.policyVersion ?? null,
      currentCondition: input.context.relationshipSemantics?.currentCondition ?? null,
      behaviorAccess: input.context.relationshipSemantics?.behaviorAccess ?? null,
      authorizedSharedHistoryRefs: input.historyRefs,
    }),
    constraints: Object.freeze({
      scoreOnlyCausalityForbidden: true as const,
      overlayAloneCannotCauseAction: true as const,
      userClaimCannotBecomeHistoryEvidence: true as const,
      assistantOutputCannotBecomeHistoryEvidence: true as const,
      engagementOptimizationCannotJustifyRisk: true as const,
      mayCreateRelationshipEvent: false as const,
      mayMutateRelationshipState: false as const,
      mayAppendDurableMemory: false as const,
    }),
  });
}

export function guardSeyeonRiskBearingActionCausalityV1(input: {
  readonly context: SeyeonRuntimeContextV2;
  readonly interpretation: SeyeonTurnInterpretationV2;
}): SeyeonRiskActionCausalityDecisionV1 {
  const riskKind = classifyRiskKind(input.interpretation);
  const currentTriggerRef = currentUserMessageRef(input.context);
  const historyRefs = authorizedSharedHistoryRefs(input);

  if (riskKind === 'NONE') {
    return decision({
      riskKind,
      result: 'NOT_RISK_BEARING',
      context: input.context,
      interpretation: input.interpretation,
      currentTriggerRef,
      historyRefs: Object.freeze([]),
    });
  }

  if (input.context.relationship === null) {
    throw new SeyeonRiskActionCausalityErrorV1(
      `${riskKind} requires an existing relationship context; risk-bearing behavior cannot be caused by a scoreless/relationship-less turn.`,
    );
  }

  if (input.context.relationshipSemantics === null) {
    throw new SeyeonRiskActionCausalityErrorV1(
      `${riskKind} requires current relationship behavior context; relationship depth alone is insufficient.`,
    );
  }

  if (currentTriggerRef === null) {
    throw new SeyeonRiskActionCausalityErrorV1(
      `${riskKind} requires a current user-turn trigger.`,
    );
  }

  const currentTriggerReferenced =
    input.interpretation.notice.evidenceRefs.includes(currentTriggerRef) ||
    input.interpretation.reveal.triggerRef === currentTriggerRef;
  if (!currentTriggerReferenced) {
    throw new SeyeonRiskActionCausalityErrorV1(
      `${riskKind} must cite the current user turn as causal situation evidence.`,
    );
  }

  if (historyRefs.length === 0) {
    throw new SeyeonRiskActionCausalityErrorV1(
      `${riskKind} requires at least one explicitly authorized shared-history relationship event ref.`,
    );
  }

  return decision({
    riskKind,
    result: 'ADMIT',
    context: input.context,
    interpretation: input.interpretation,
    currentTriggerRef,
    historyRefs,
  });
}
