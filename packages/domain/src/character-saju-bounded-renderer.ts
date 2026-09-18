import type { SajuDomain } from '../../contracts/src/index.js';
import {
  assertCharacterSajuVoiceRuntimeInvariantV1,
} from './character-saju-safe-renderer.js';
import type { CharacterRuntimeContextWithGroundingV1 } from './character-saju-grounding-admission.js';
import type { CharacterPerspectiveProfileV1 } from './character-saju-perspective.js';
import {
  admitCharacterSajuGroundingBundleViewV1,
  type CharacterGroundingUnitViewV1,
} from './character-saju-insight-selector.js';
import {
  buildCharacterReadingPlanDecisionV1,
  type CharacterReadingPlanDecisionV1,
  type CharacterReadingSemanticPurposeV1,
} from './character-saju-reading-plan.js';
import { canonicalJson } from './registry.js';
import { createHash } from 'node:crypto';

export const CHARACTER_SAJU_BOUNDED_RENDERER_VERSION_V1 =
  'myeongha-character-saju-bounded-renderer-v1' as const;
export const CHARACTER_SAJU_UTTERANCE_SCHEMA_VERSION_V1 =
  'myeongha-character-saju-utterance-v1' as const;

export type CharacterSajuUtteranceSegmentV1 =
  | {
      readonly kind: 'semantic_realization';
      readonly text: string;
      readonly sourceUnitRefs: readonly string[];
      readonly purpose: CharacterReadingSemanticPurposeV1;
    }
  | {
      readonly kind: 'character_reaction';
      readonly text: string;
      readonly sourceUnitRefs: readonly string[];
      readonly framingKey: string;
    }
  | {
      readonly kind: 'follow_up_question';
      readonly text: string;
      readonly sourceUnitRefs: readonly string[];
      readonly questionStrategy: string;
      readonly framingKey: string;
    }
  | {
      readonly kind: 'protected_disclosure';
      readonly text: string;
      readonly disclosureRef: string;
    };

export interface CharacterSajuUtteranceV1 {
  readonly schemaVersion: typeof CHARACTER_SAJU_UTTERANCE_SCHEMA_VERSION_V1;
  readonly utteranceId: string;
  readonly rendererVersion: typeof CHARACTER_SAJU_BOUNDED_RENDERER_VERSION_V1;
  readonly characterId: string;
  readonly readingRef: string;
  readonly readingPlanRef: string;
  readonly requestedDomain: SajuDomain;
  readonly renderedUnitIds: readonly string[];
  readonly segments: readonly CharacterSajuUtteranceSegmentV1[];
}

export type CharacterSajuBoundedRenderDecisionV1 =
  | {
      readonly mode: 'bounded_exact_core';
      readonly rendererVersion: typeof CHARACTER_SAJU_BOUNDED_RENDERER_VERSION_V1;
      readonly validationState: 'template_validated';
      readonly planDecision: Extract<CharacterReadingPlanDecisionV1, { mode: 'character_plan' }>;
      readonly utterance: CharacterSajuUtteranceV1;
    }
  | {
      readonly mode: 'protected_fallback';
      readonly rendererVersion: typeof CHARACTER_SAJU_BOUNDED_RENDERER_VERSION_V1;
      readonly validationState: 'fallback_used';
      readonly planDecision: Extract<CharacterReadingPlanDecisionV1, { mode: 'protected_fallback' }>;
    };

export class CharacterSajuBoundedRendererErrorV1 extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterSajuBoundedRendererErrorV1';
  }
}

function sha256Json(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function resolveSafeFramingByPurpose(input: {
  readonly context: CharacterRuntimeContextWithGroundingV1;
  readonly collection: 'before' | 'after';
  readonly purpose:
    | 'record_transition'
    | 'current_life_question'
    | 'uncertainty_transition'
    | 'relationship_transition';
}): { readonly key: string; readonly text: string } {
  const catalog = input.context.sajuProfile.safeFraming;
  if (catalog === undefined || catalog.schemaVersion !== 'v1') {
    throw new CharacterSajuBoundedRendererErrorV1(
      'Bounded Saju renderer requires a content-pinned safe framing catalog.',
    );
  }
  const matches = catalog[input.collection].filter((entry) => entry.purpose === input.purpose);
  if (matches.length !== 1) {
    throw new CharacterSajuBoundedRendererErrorV1(
      `Expected exactly one authored ${input.purpose} safe framing entry.`,
    );
  }
  const match = matches[0]!;
  return Object.freeze({ key: match.key, text: match.text });
}

function requireSelectedUnit(input: {
  readonly unitId: string;
  readonly selected: ReadonlySet<string>;
  readonly byId: ReadonlyMap<string, CharacterGroundingUnitViewV1>;
}): CharacterGroundingUnitViewV1 {
  if (!input.selected.has(input.unitId)) {
    throw new CharacterSajuBoundedRendererErrorV1(
      `Reading plan references an unselected Saju unit: ${input.unitId}.`,
    );
  }
  const unit = input.byId.get(input.unitId);
  if (unit === undefined) {
    throw new CharacterSajuBoundedRendererErrorV1(
      `Reading plan references an unknown Saju unit: ${input.unitId}.`,
    );
  }
  return unit;
}

function validateSourceUnitRefs(input: {
  readonly refs: readonly string[];
  readonly selected: ReadonlySet<string>;
  readonly byId: ReadonlyMap<string, CharacterGroundingUnitViewV1>;
}): readonly CharacterGroundingUnitViewV1[] {
  if (input.refs.length === 0 || new Set(input.refs).size !== input.refs.length) {
    throw new CharacterSajuBoundedRendererErrorV1(
      'Character renderer sourceUnitRefs must be non-empty and unique.',
    );
  }
  return Object.freeze(
    input.refs.map((unitId) =>
      requireSelectedUnit({ unitId, selected: input.selected, byId: input.byId }),
    ),
  );
}

function realizationText(unit: CharacterGroundingUnitViewV1): string {
  if (unit.realizationPolicyRef === 'protected_only_v1') {
    throw new CharacterSajuBoundedRendererErrorV1(
      `Protected-only Saju unit cannot enter bounded Character realization: ${unit.unitId}.`,
    );
  }
  // CSR-07 bootstrap is deliberately exact-core. Until the Saju source publishes
  // approved realization templates, Character runtime may organize the meaning but
  // may not freely paraphrase it.
  return unit.canonicalMeaning;
}

function reactionFraming(input: {
  readonly context: CharacterRuntimeContextWithGroundingV1;
  readonly units: readonly CharacterGroundingUnitViewV1[];
  readonly requestedDomain: SajuDomain;
}): { readonly key: string; readonly text: string } {
  const needsUncertainty = input.units.some(
    (unit) => unit.narrativeRole === 'limitation' || unit.ambiguityRef !== undefined,
  );
  if (needsUncertainty) {
    return resolveSafeFramingByPurpose({
      context: input.context,
      collection: 'after',
      purpose: 'uncertainty_transition',
    });
  }
  if (input.requestedDomain === 'relationship' || input.requestedDomain === 'compatibility') {
    return resolveSafeFramingByPurpose({
      context: input.context,
      collection: 'after',
      purpose: 'relationship_transition',
    });
  }
  throw new CharacterSajuBoundedRendererErrorV1(
    'Character reaction beat has no source-authored framing for this reading state.',
  );
}

function assertRenderedUnitCoverage(input: {
  readonly selectedUnitIds: readonly string[];
  readonly renderedUnitIds: readonly string[];
}): void {
  if (new Set(input.renderedUnitIds).size !== input.renderedUnitIds.length) {
    throw new CharacterSajuBoundedRendererErrorV1(
      'Each selected Saju unit must be rendered at most once.',
    );
  }
  const selected = new Set(input.selectedUnitIds);
  const rendered = new Set(input.renderedUnitIds);
  if (
    selected.size !== rendered.size ||
    [...selected].some((unitId) => !rendered.has(unitId))
  ) {
    throw new CharacterSajuBoundedRendererErrorV1(
      'Every selected Saju unit must be rendered exactly once.',
    );
  }
}

export function renderCharacterSajuBoundedExactCoreV1(input: {
  readonly context: CharacterRuntimeContextWithGroundingV1;
  readonly grounding: unknown;
  readonly perspective: CharacterPerspectiveProfileV1;
  readonly requestedDomain: SajuDomain;
}): CharacterSajuBoundedRenderDecisionV1 {
  assertCharacterSajuVoiceRuntimeInvariantV1(input.context);

  const planDecision = buildCharacterReadingPlanDecisionV1(input);
  if (planDecision.mode === 'protected_fallback') {
    return Object.freeze({
      mode: 'protected_fallback' as const,
      rendererVersion: CHARACTER_SAJU_BOUNDED_RENDERER_VERSION_V1,
      validationState: 'fallback_used' as const,
      planDecision,
    });
  }

  const groundingRef = input.context.saju?.groundingRef ?? null;
  if (groundingRef === null) {
    throw new CharacterSajuBoundedRendererErrorV1(
      'Bounded Saju renderer requires an admitted grounding identity.',
    );
  }
  const grounding = admitCharacterSajuGroundingBundleViewV1({
    candidate: input.grounding,
    expectedRef: groundingRef,
  });
  const selected = new Set(planDecision.selection.selectedUnitIds);
  const byId = new Map(grounding.units.map((unit) => [unit.unitId, unit]));
  const disclosureByRef = new Map(
    grounding.disclosures.map((disclosure) => [disclosure.disclosureRef, disclosure]),
  );
  const segments: CharacterSajuUtteranceSegmentV1[] = [];
  const renderedUnitIds: string[] = [];

  for (const beat of planDecision.plan.beats) {
    switch (beat.kind) {
      case 'semantic_realization': {
        if (beat.unitRefs.length !== 1) {
          throw new CharacterSajuBoundedRendererErrorV1(
            'CSR-07 semantic realization beat must reference exactly one Saju unit.',
          );
        }
        const unit = requireSelectedUnit({
          unitId: beat.unitRefs[0]!,
          selected,
          byId,
        });
        renderedUnitIds.push(unit.unitId);
        segments.push(
          Object.freeze({
            kind: 'semantic_realization' as const,
            text: realizationText(unit),
            sourceUnitRefs: Object.freeze([unit.unitId]),
            purpose: beat.purpose,
          }),
        );
        break;
      }
      case 'character_reaction': {
        const units = validateSourceUnitRefs({
          refs: beat.allowedSourceUnitRefs,
          selected,
          byId,
        });
        const framing = reactionFraming({
          context: input.context,
          units,
          requestedDomain: input.requestedDomain,
        });
        segments.push(
          Object.freeze({
            kind: 'character_reaction' as const,
            text: framing.text,
            sourceUnitRefs: Object.freeze([...beat.allowedSourceUnitRefs]),
            framingKey: framing.key,
          }),
        );
        break;
      }
      case 'follow_up_question': {
        validateSourceUnitRefs({ refs: beat.sourceUnitRefs, selected, byId });
        if (!input.context.sajuProfile.followUpQuestionStrategies.includes(beat.questionStrategy)) {
          throw new CharacterSajuBoundedRendererErrorV1(
            'Reading plan follow-up strategy is not authored for the active Character.',
          );
        }
        const framing = resolveSafeFramingByPurpose({
          context: input.context,
          collection: 'before',
          purpose: 'current_life_question',
        });
        segments.push(
          Object.freeze({
            kind: 'follow_up_question' as const,
            text: framing.text,
            sourceUnitRefs: Object.freeze([...beat.sourceUnitRefs]),
            questionStrategy: beat.questionStrategy,
            framingKey: framing.key,
          }),
        );
        break;
      }
      case 'protected_disclosure': {
        const disclosure = disclosureByRef.get(beat.disclosureRef);
        if (disclosure === undefined) {
          throw new CharacterSajuBoundedRendererErrorV1(
            `Reading plan references unknown protected disclosure: ${beat.disclosureRef}.`,
          );
        }
        segments.push(
          Object.freeze({
            kind: 'protected_disclosure' as const,
            text: disclosure.text,
            disclosureRef: disclosure.disclosureRef,
          }),
        );
        break;
      }
    }
  }

  assertRenderedUnitCoverage({
    selectedUnitIds: planDecision.selection.selectedUnitIds,
    renderedUnitIds,
  });

  const withoutId = {
    schemaVersion: CHARACTER_SAJU_UTTERANCE_SCHEMA_VERSION_V1,
    rendererVersion: CHARACTER_SAJU_BOUNDED_RENDERER_VERSION_V1,
    characterId: input.context.characterId,
    readingRef: grounding.readingRef,
    readingPlanRef: planDecision.plan.planId,
    requestedDomain: input.requestedDomain,
    renderedUnitIds: Object.freeze([...renderedUnitIds]),
    segments: Object.freeze(segments),
  } as const;
  const utterance = Object.freeze({
    ...withoutId,
    utteranceId: `character_saju_utterance_${sha256Json(withoutId).slice(0, 24)}`,
  }) satisfies CharacterSajuUtteranceV1;

  return Object.freeze({
    mode: 'bounded_exact_core' as const,
    rendererVersion: CHARACTER_SAJU_BOUNDED_RENDERER_VERSION_V1,
    validationState: 'template_validated' as const,
    planDecision,
    utterance,
  });
}
