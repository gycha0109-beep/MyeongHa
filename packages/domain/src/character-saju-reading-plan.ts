import { createHash } from 'node:crypto';

import type { SajuDomain } from '../../contracts/src/index.js';
import type { CharacterRuntimeContextWithGroundingV1 } from './character-saju-grounding-admission.js';
import type { CharacterPerspectiveProfileV1 } from './character-saju-perspective.js';
import {
  CHARACTER_INSIGHT_SELECTION_SCHEMA_VERSION_V1,
  admitCharacterSajuGroundingBundleViewV1,
  selectCharacterInsightsV1,
  type CharacterGroundingUnitViewV1,
  type CharacterInsightSelectionV1,
} from './character-saju-insight-selector.js';
import { canonicalJson } from './registry.js';

export const CHARACTER_READING_PLAN_SCHEMA_VERSION_V1 =
  'myeongha-character-reading-plan-v1' as const;
export const CHARACTER_READING_PLAN_DECISION_SCHEMA_VERSION_V1 =
  'myeongha-character-reading-plan-decision-v1' as const;

export type CharacterReadingSemanticPurposeV1 =
  | 'lead'
  | 'expand'
  | 'contrast'
  | 'caution';

export type CharacterReadingBeatV1 =
  | {
      readonly kind: 'semantic_realization';
      readonly unitRefs: readonly string[];
      readonly purpose: CharacterReadingSemanticPurposeV1;
    }
  | {
      readonly kind: 'character_reaction';
      readonly allowedSourceUnitRefs: readonly string[];
    }
  | {
      readonly kind: 'follow_up_question';
      readonly sourceUnitRefs: readonly string[];
      readonly questionStrategy: string;
    }
  | {
      readonly kind: 'protected_disclosure';
      readonly disclosureRef: string;
    };

export interface CharacterReadingPerspectiveRefV1 {
  readonly characterId: string;
  readonly perspectiveVersion: string;
  readonly sourceContentVersion: string;
  readonly sourceSajuProfileVersion: string;
  readonly profileHash: string;
}

export interface CharacterReadingRelationshipProjectionRefV1 {
  readonly schemaVersion: 'v1';
  readonly relationshipRevision: number;
  readonly relationshipPolicyVersion: string;
  readonly projectionPolicyVersion: string;
  readonly behaviorVersion: string;
  readonly projectionHash: string;
}

export interface CharacterReadingPlanV1 {
  readonly schemaVersion: typeof CHARACTER_READING_PLAN_SCHEMA_VERSION_V1;
  readonly planId: string;
  readonly characterId: string;
  readonly readingRef: string;
  readonly requestedDomain: SajuDomain;
  readonly perspectiveProfileRef: CharacterReadingPerspectiveRefV1;
  readonly relationshipProjectionRef: CharacterReadingRelationshipProjectionRefV1;
  readonly insightSelectionSchemaVersion: typeof CHARACTER_INSIGHT_SELECTION_SCHEMA_VERSION_V1;
  readonly beats: readonly CharacterReadingBeatV1[];
}

export interface CharacterReadingProtectedFallbackV1 {
  readonly schemaVersion: typeof CHARACTER_READING_PLAN_DECISION_SCHEMA_VERSION_V1;
  readonly mode: 'protected_fallback';
  readonly characterId: string;
  readonly readingRef: string;
  readonly requestedDomain: SajuDomain;
  readonly reason: 'selected_unit_requires_protected_rendering';
  readonly protectedUnitRefs: readonly string[];
}

export type CharacterReadingPlanDecisionV1 =
  | {
      readonly schemaVersion: typeof CHARACTER_READING_PLAN_DECISION_SCHEMA_VERSION_V1;
      readonly mode: 'character_plan';
      readonly selection: CharacterInsightSelectionV1;
      readonly plan: CharacterReadingPlanV1;
    }
  | {
      readonly schemaVersion: typeof CHARACTER_READING_PLAN_DECISION_SCHEMA_VERSION_V1;
      readonly mode: 'protected_fallback';
      readonly selection: CharacterInsightSelectionV1;
      readonly fallback: CharacterReadingProtectedFallbackV1;
    };

export class CharacterReadingPlanErrorV1 extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterReadingPlanErrorV1';
  }
}

function sha256Json(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function freezeRefs(refs: readonly string[]): readonly string[] {
  return Object.freeze([...refs]);
}

function perspectiveRef(
  perspective: CharacterPerspectiveProfileV1,
): CharacterReadingPerspectiveRefV1 {
  return Object.freeze({
    characterId: perspective.characterId,
    perspectiveVersion: perspective.perspectiveVersion,
    sourceContentVersion: perspective.sourceContentVersion,
    sourceSajuProfileVersion: perspective.sourceSajuProfileVersion,
    profileHash: sha256Json(perspective),
  });
}

function relationshipRef(
  context: CharacterRuntimeContextWithGroundingV1,
): CharacterReadingRelationshipProjectionRefV1 {
  return Object.freeze({
    schemaVersion: 'v1',
    relationshipRevision: context.relationship.relationshipRevision,
    relationshipPolicyVersion: context.relationship.relationshipPolicyVersion,
    projectionPolicyVersion: context.relationship.projectionPolicyVersion,
    behaviorVersion: context.relationship.behaviorVersion,
    projectionHash: sha256Json(context.relationship),
  });
}

function purposeForUnit(
  unit: CharacterGroundingUnitViewV1,
  position: number,
): CharacterReadingSemanticPurposeV1 {
  if (position === 0) return 'lead';
  switch (unit.narrativeRole) {
    case 'primary':
    case 'supporting':
      return 'expand';
    case 'tension':
      return 'contrast';
    case 'limitation':
      return 'caution';
  }
}

function firstAuthoredQuestionStrategy(
  context: CharacterRuntimeContextWithGroundingV1,
): string | null {
  for (const raw of context.sajuProfile.followUpQuestionStrategies) {
    const strategy = raw.trim();
    if (strategy.length > 0) return strategy;
  }
  return null;
}

function hasSafeFramingPurpose(
  context: CharacterRuntimeContextWithGroundingV1,
  collection: 'before' | 'after',
  purpose:
    | 'record_transition'
    | 'current_life_question'
    | 'uncertainty_transition'
    | 'relationship_transition',
): boolean {
  const catalog = context.sajuProfile.safeFraming;
  return catalog?.[collection].some((entry) => entry.purpose === purpose) ?? false;
}

function selectedUnitsInPlanOrder(input: {
  readonly selection: CharacterInsightSelectionV1;
  readonly units: readonly CharacterGroundingUnitViewV1[];
}): readonly CharacterGroundingUnitViewV1[] {
  const byId = new Map(input.units.map((unit) => [unit.unitId, unit]));
  if (new Set(input.selection.orderedUnitIds).size !== input.selection.orderedUnitIds.length) {
    throw new CharacterReadingPlanErrorV1(
      'Character insight selection orderedUnitIds must not contain duplicates.',
    );
  }
  if (
    input.selection.orderedUnitIds.length !== input.selection.selectedUnitIds.length ||
    input.selection.orderedUnitIds.some((unitId) => !input.selection.selectedUnitIds.includes(unitId))
  ) {
    throw new CharacterReadingPlanErrorV1(
      'Character insight selection orderedUnitIds must contain exactly the selected units.',
    );
  }
  return Object.freeze(
    input.selection.orderedUnitIds.map((unitId) => {
      const unit = byId.get(unitId);
      if (unit === undefined) {
        throw new CharacterReadingPlanErrorV1(
          `Character insight selection references unknown grounding unit: ${unitId}.`,
        );
      }
      return unit;
    }),
  );
}

function protectedDisclosureRefs(input: {
  readonly selectedUnits: readonly CharacterGroundingUnitViewV1[];
  readonly disclosureOrder: readonly string[];
}): readonly string[] {
  const required = new Set(
    input.selectedUnits.flatMap((unit) => [...unit.requiredDisclosureRefs]),
  );
  return Object.freeze(input.disclosureOrder.filter((ref) => required.has(ref)));
}

function shouldScheduleReaction(input: {
  readonly context: CharacterRuntimeContextWithGroundingV1;
  readonly selectedUnits: readonly CharacterGroundingUnitViewV1[];
}): boolean {
  const hasUncertainty = input.selectedUnits.some(
    (unit) => unit.narrativeRole === 'limitation' || unit.ambiguityRef !== undefined,
  );
  if (
    hasUncertainty &&
    hasSafeFramingPurpose(input.context, 'after', 'uncertainty_transition')
  ) {
    return true;
  }
  const domain = input.context.saju?.domain;
  return (
    (domain === 'relationship' || domain === 'compatibility') &&
    hasSafeFramingPurpose(input.context, 'after', 'relationship_transition')
  );
}

function planBeats(input: {
  readonly context: CharacterRuntimeContextWithGroundingV1;
  readonly selectedUnits: readonly CharacterGroundingUnitViewV1[];
  readonly disclosureRefs: readonly string[];
}): readonly CharacterReadingBeatV1[] {
  const orderedUnitRefs = freezeRefs(input.selectedUnits.map((unit) => unit.unitId));
  const beats: CharacterReadingBeatV1[] = input.selectedUnits.map((unit, index) =>
    Object.freeze({
      kind: 'semantic_realization' as const,
      unitRefs: Object.freeze([unit.unitId]),
      purpose: purposeForUnit(unit, index),
    }),
  );

  for (const disclosureRef of input.disclosureRefs) {
    beats.push(Object.freeze({ kind: 'protected_disclosure' as const, disclosureRef }));
  }

  if (
    orderedUnitRefs.length > 0 &&
    shouldScheduleReaction({ context: input.context, selectedUnits: input.selectedUnits })
  ) {
    beats.push(
      Object.freeze({
        kind: 'character_reaction' as const,
        allowedSourceUnitRefs: orderedUnitRefs,
      }),
    );
  }

  const questionStrategy = firstAuthoredQuestionStrategy(input.context);
  if (
    questionStrategy !== null &&
    orderedUnitRefs.length > 0 &&
    hasSafeFramingPurpose(input.context, 'before', 'current_life_question')
  ) {
    beats.push(
      Object.freeze({
        kind: 'follow_up_question' as const,
        sourceUnitRefs: orderedUnitRefs,
        questionStrategy,
      }),
    );
  }

  return Object.freeze(beats);
}

function assertLimitationPreservation(input: {
  readonly selectedUnits: readonly CharacterGroundingUnitViewV1[];
  readonly beats: readonly CharacterReadingBeatV1[];
}): void {
  const selectedLimitationRefs = input.selectedUnits
    .filter((unit) => unit.narrativeRole === 'limitation' || unit.ambiguityRef !== undefined)
    .map((unit) => unit.unitId);
  if (selectedLimitationRefs.length === 0) return;

  const cautionRefs = new Set(
    input.beats
      .filter(
        (beat): beat is Extract<CharacterReadingBeatV1, { kind: 'semantic_realization' }> =>
          beat.kind === 'semantic_realization' && beat.purpose === 'caution',
      )
      .flatMap((beat) => [...beat.unitRefs]),
  );
  const firstBeat = input.beats.find(
    (beat): beat is Extract<CharacterReadingBeatV1, { kind: 'semantic_realization' }> =>
      beat.kind === 'semantic_realization',
  );
  for (const limitationRef of selectedLimitationRefs) {
    if (cautionRefs.has(limitationRef)) continue;
    if (firstBeat?.purpose === 'lead' && firstBeat.unitRefs.includes(limitationRef)) continue;
    throw new CharacterReadingPlanErrorV1(
      `Selected limitation unit is missing a caution/lead semantic beat: ${limitationRef}.`,
    );
  }
}

export function buildCharacterReadingPlanDecisionV1(input: {
  readonly context: CharacterRuntimeContextWithGroundingV1;
  readonly grounding: unknown;
  readonly perspective: CharacterPerspectiveProfileV1;
  readonly requestedDomain: SajuDomain;
}): CharacterReadingPlanDecisionV1 {
  const selection = selectCharacterInsightsV1(input);
  const groundingRef = input.context.saju?.groundingRef ?? null;
  if (groundingRef === null) {
    throw new CharacterReadingPlanErrorV1(
      'Character Reading Plan requires an admitted grounding identity.',
    );
  }
  const grounding = admitCharacterSajuGroundingBundleViewV1({
    candidate: input.grounding,
    expectedRef: groundingRef,
  });
  if (
    selection.characterId !== input.context.characterId ||
    selection.readingRef !== grounding.readingRef ||
    selection.requestedDomain !== input.requestedDomain ||
    selection.perspectiveVersion !== input.perspective.perspectiveVersion
  ) {
    throw new CharacterReadingPlanErrorV1(
      'Character insight selection identity does not match the active reading plan inputs.',
    );
  }

  const selectedUnits = selectedUnitsInPlanOrder({ selection, units: grounding.units });
  const protectedUnits = selectedUnits.filter(
    (unit) => unit.realizationPolicyRef === 'protected_only_v1',
  );
  if (protectedUnits.length > 0) {
    const fallback = Object.freeze({
      schemaVersion: CHARACTER_READING_PLAN_DECISION_SCHEMA_VERSION_V1,
      mode: 'protected_fallback' as const,
      characterId: input.context.characterId,
      readingRef: grounding.readingRef,
      requestedDomain: input.requestedDomain,
      reason: 'selected_unit_requires_protected_rendering' as const,
      protectedUnitRefs: freezeRefs(protectedUnits.map((unit) => unit.unitId)),
    });
    return Object.freeze({
      schemaVersion: CHARACTER_READING_PLAN_DECISION_SCHEMA_VERSION_V1,
      mode: 'protected_fallback' as const,
      selection,
      fallback,
    });
  }

  const disclosureRefs = protectedDisclosureRefs({
    selectedUnits,
    disclosureOrder: grounding.disclosures.map((disclosure) => disclosure.disclosureRef),
  });
  const beats = planBeats({
    context: input.context,
    selectedUnits,
    disclosureRefs,
  });
  assertLimitationPreservation({ selectedUnits, beats });

  const profileRef = perspectiveRef(input.perspective);
  const relationshipProjectionRef = relationshipRef(input.context);
  const withoutPlanId = {
    schemaVersion: CHARACTER_READING_PLAN_SCHEMA_VERSION_V1,
    characterId: input.context.characterId,
    readingRef: grounding.readingRef,
    requestedDomain: input.requestedDomain,
    perspectiveProfileRef: profileRef,
    relationshipProjectionRef,
    insightSelectionSchemaVersion: CHARACTER_INSIGHT_SELECTION_SCHEMA_VERSION_V1,
    beats,
  } as const;
  const plan = Object.freeze({
    ...withoutPlanId,
    planId: `character_reading_plan_${sha256Json(withoutPlanId).slice(0, 24)}`,
  }) satisfies CharacterReadingPlanV1;

  return Object.freeze({
    schemaVersion: CHARACTER_READING_PLAN_DECISION_SCHEMA_VERSION_V1,
    mode: 'character_plan' as const,
    selection,
    plan,
  });
}
