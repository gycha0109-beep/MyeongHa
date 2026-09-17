import type { SajuDomain } from '../../contracts/src/index.js';
import type { CharacterRuntimeContextWithGroundingV1 } from './character-saju-grounding-admission.js';
import type { CharacterPerspectiveProfileV1 } from './character-saju-perspective.js';
import {
  admitCharacterSajuGroundingBundleViewV1,
  type CharacterGroundingUnitViewV1,
} from './character-saju-insight-selector.js';
import {
  renderCharacterSajuBoundedExactCoreV1,
  type CharacterSajuBoundedRenderDecisionV1,
  type CharacterSajuUtteranceSegmentV1,
  type CharacterSajuUtteranceV1,
} from './character-saju-bounded-renderer.js';

export const CHARACTER_SAJU_SEMANTIC_GUARD_VERSION_V1 =
  'myeongha-character-saju-semantic-guard-v1' as const;

export const CHARACTER_SAJU_SEMANTIC_GUARD_FAILURE_CODES_V1 = Object.freeze([
  'STRUCTURE_MISMATCH',
  'ADDED_CLAIM',
  'MISSING_SELECTED_UNIT',
  'UNSELECTED_SOURCE_UNIT',
  'EXACT_CORE_TEXT_MISMATCH',
  'DROPPED_QUALIFIER',
  'AMBIGUITY_FLATTENED',
  'PROTECTED_DISCLOSURE_MISSING',
  'PROTECTED_DISCLOSURE_MUTATED',
  'UNAUTHORED_CHARACTER_FRAMING',
] as const);

export type CharacterSajuSemanticGuardFailureCodeV1 =
  (typeof CHARACTER_SAJU_SEMANTIC_GUARD_FAILURE_CODES_V1)[number];

export interface CharacterSajuSemanticGuardFailureV1 {
  readonly code: CharacterSajuSemanticGuardFailureCodeV1;
  readonly detail: string;
  readonly segmentIndex?: number;
  readonly unitRef?: string;
  readonly disclosureRef?: string;
}

export interface CharacterSajuSemanticGuardEvidenceV1 {
  readonly exactCore: true;
  readonly characterId: string;
  readonly readingRef: string;
  readonly readingPlanRef: string;
  readonly validatedUnitIds: readonly string[];
  readonly validatedDisclosureRefs: readonly string[];
}

export type CharacterSajuSemanticGuardDecisionV1 =
  | {
      readonly mode: 'accepted';
      readonly guardVersion: typeof CHARACTER_SAJU_SEMANTIC_GUARD_VERSION_V1;
      readonly validationState: 'semantic_validated';
      readonly utterance: CharacterSajuUtteranceV1;
      readonly evidence: CharacterSajuSemanticGuardEvidenceV1;
    }
  | {
      readonly mode: 'protected_fallback';
      readonly guardVersion: typeof CHARACTER_SAJU_SEMANTIC_GUARD_VERSION_V1;
      readonly validationState: 'fallback_used';
      readonly reason: 'renderer_protected_fallback' | 'semantic_guard_failed';
      readonly failures: readonly CharacterSajuSemanticGuardFailureV1[];
      readonly rendererDecision: CharacterSajuBoundedRenderDecisionV1;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failure(
  code: CharacterSajuSemanticGuardFailureCodeV1,
  detail: string,
  extra: Pick<CharacterSajuSemanticGuardFailureV1, 'segmentIndex' | 'unitRef' | 'disclosureRef'> = {},
): CharacterSajuSemanticGuardFailureV1 {
  return Object.freeze({ code, detail, ...extra });
}

function stringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null;
  return value as readonly string[];
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function selectedUnits(
  unitIds: readonly string[],
  units: readonly CharacterGroundingUnitViewV1[],
): readonly CharacterGroundingUnitViewV1[] {
  const byId = new Map(units.map((unit) => [unit.unitId, unit]));
  return Object.freeze(
    unitIds.map((unitId) => {
      const unit = byId.get(unitId);
      if (unit === undefined) throw new TypeError(`Selected Saju unit is missing: ${unitId}.`);
      return unit;
    }),
  );
}

function compareSemanticSegment(input: {
  readonly raw: Record<string, unknown>;
  readonly expected: Extract<CharacterSajuUtteranceSegmentV1, { kind: 'semantic_realization' }>;
  readonly selected: ReadonlySet<string>;
  readonly index: number;
}): readonly CharacterSajuSemanticGuardFailureV1[] {
  const failures: CharacterSajuSemanticGuardFailureV1[] = [];
  const refs = stringArray(input.raw.sourceUnitRefs);
  if (refs === null || refs.length === 0) {
    failures.push(failure('STRUCTURE_MISMATCH', 'semantic_realization requires sourceUnitRefs.', { segmentIndex: input.index }));
    return failures;
  }
  for (const ref of refs) {
    if (!input.selected.has(ref)) {
      failures.push(failure('UNSELECTED_SOURCE_UNIT', 'Semantic segment references a unit that was not selected by the reading plan.', { segmentIndex: input.index, unitRef: ref }));
    }
  }
  if (!sameStrings(refs, input.expected.sourceUnitRefs)) {
    failures.push(failure('STRUCTURE_MISMATCH', 'Semantic segment sourceUnitRefs do not match the deterministic reading plan.', { segmentIndex: input.index }));
  }
  if (input.raw.text !== input.expected.text) {
    failures.push(failure('EXACT_CORE_TEXT_MISMATCH', 'Exact-core semantic text must equal the source canonicalMeaning exactly.', { segmentIndex: input.index, unitRef: input.expected.sourceUnitRefs[0] }));
  }
  if (input.raw.purpose !== input.expected.purpose) {
    failures.push(failure('STRUCTURE_MISMATCH', 'Semantic segment purpose does not match the reading plan.', { segmentIndex: input.index }));
  }
  return failures;
}

function compareFramingSegment(input: {
  readonly raw: Record<string, unknown>;
  readonly expected: Extract<CharacterSajuUtteranceSegmentV1, { kind: 'character_reaction' | 'follow_up_question' }>;
  readonly selected: ReadonlySet<string>;
  readonly index: number;
}): readonly CharacterSajuSemanticGuardFailureV1[] {
  const failures: CharacterSajuSemanticGuardFailureV1[] = [];
  const refs = stringArray(input.raw.sourceUnitRefs);
  if (refs === null || refs.length === 0) {
    failures.push(failure('STRUCTURE_MISMATCH', 'Character framing segment requires sourceUnitRefs.', { segmentIndex: input.index }));
    return failures;
  }
  for (const ref of refs) {
    if (!input.selected.has(ref)) {
      failures.push(failure('UNSELECTED_SOURCE_UNIT', 'Character framing references a unit that was not selected by the reading plan.', { segmentIndex: input.index, unitRef: ref }));
    }
  }
  if (!sameStrings(refs, input.expected.sourceUnitRefs)) {
    failures.push(failure('STRUCTURE_MISMATCH', 'Character framing sourceUnitRefs do not match the deterministic renderer.', { segmentIndex: input.index }));
  }
  if (input.raw.text !== input.expected.text || input.raw.framingKey !== input.expected.framingKey) {
    failures.push(failure('UNAUTHORED_CHARACTER_FRAMING', 'Character framing must be the exact published safe-framing entry selected by the renderer.', { segmentIndex: input.index }));
  }
  if (
    input.expected.kind === 'follow_up_question' &&
    input.raw.questionStrategy !== input.expected.questionStrategy
  ) {
    failures.push(failure('UNAUTHORED_CHARACTER_FRAMING', 'Follow-up strategy must match the authored Character strategy selected by the plan.', { segmentIndex: input.index }));
  }
  return failures;
}

function compareDisclosureSegment(input: {
  readonly raw: Record<string, unknown>;
  readonly expected: Extract<CharacterSajuUtteranceSegmentV1, { kind: 'protected_disclosure' }>;
  readonly index: number;
}): readonly CharacterSajuSemanticGuardFailureV1[] {
  const failures: CharacterSajuSemanticGuardFailureV1[] = [];
  if (input.raw.disclosureRef !== input.expected.disclosureRef) {
    failures.push(failure('PROTECTED_DISCLOSURE_MISSING', 'Protected disclosure ref does not match the required source disclosure.', { segmentIndex: input.index, disclosureRef: input.expected.disclosureRef }));
  }
  if (input.raw.text !== input.expected.text) {
    failures.push(failure('PROTECTED_DISCLOSURE_MUTATED', 'Protected disclosure text must remain byte-for-byte equal to the source disclosure.', { segmentIndex: input.index, disclosureRef: input.expected.disclosureRef }));
  }
  return failures;
}

function compareSegments(input: {
  readonly candidate: unknown;
  readonly expected: CharacterSajuUtteranceV1;
  readonly selectedUnitIds: readonly string[];
}): readonly CharacterSajuSemanticGuardFailureV1[] {
  if (!isRecord(input.candidate) || !Array.isArray(input.candidate.segments)) {
    return Object.freeze([failure('STRUCTURE_MISMATCH', 'Character Saju utterance must contain a segments array.')]);
  }
  const failures: CharacterSajuSemanticGuardFailureV1[] = [];
  const rawSegments = input.candidate.segments;
  const expectedSegments = input.expected.segments;
  const selected = new Set(input.selectedUnitIds);

  if (rawSegments.length > expectedSegments.length) {
    failures.push(failure('ADDED_CLAIM', 'Character output contains additional segments not present in the deterministic reading plan.'));
  }
  if (rawSegments.length < expectedSegments.length) {
    const missing = expectedSegments.slice(rawSegments.length);
    for (const segment of missing) {
      if (segment.kind === 'semantic_realization') {
        failures.push(failure('MISSING_SELECTED_UNIT', 'Character output omitted a selected semantic unit.', { unitRef: segment.sourceUnitRefs[0] }));
      } else if (segment.kind === 'protected_disclosure') {
        failures.push(failure('PROTECTED_DISCLOSURE_MISSING', 'Character output omitted a required protected disclosure.', { disclosureRef: segment.disclosureRef }));
      } else {
        failures.push(failure('STRUCTURE_MISMATCH', 'Character output omitted a planned Character framing segment.'));
      }
    }
  }

  const length = Math.min(rawSegments.length, expectedSegments.length);
  for (let index = 0; index < length; index += 1) {
    const raw = rawSegments[index];
    const expected = expectedSegments[index]!;
    if (!isRecord(raw) || raw.kind !== expected.kind) {
      failures.push(failure('STRUCTURE_MISMATCH', 'Character segment kind/order does not match the deterministic reading plan.', { segmentIndex: index }));
      continue;
    }
    switch (expected.kind) {
      case 'semantic_realization':
        failures.push(...compareSemanticSegment({ raw, expected, selected, index }));
        break;
      case 'character_reaction':
      case 'follow_up_question':
        failures.push(...compareFramingSegment({ raw, expected, selected, index }));
        break;
      case 'protected_disclosure':
        failures.push(...compareDisclosureSegment({ raw, expected, index }));
        break;
    }
  }
  return Object.freeze(failures);
}

function compareIdentity(
  candidate: unknown,
  expected: CharacterSajuUtteranceV1,
): readonly CharacterSajuSemanticGuardFailureV1[] {
  if (!isRecord(candidate)) {
    return Object.freeze([failure('STRUCTURE_MISMATCH', 'Character Saju utterance must be an object.')]);
  }
  const failures: CharacterSajuSemanticGuardFailureV1[] = [];
  const expectedFields: readonly [string, unknown][] = [
    ['schemaVersion', expected.schemaVersion],
    ['rendererVersion', expected.rendererVersion],
    ['characterId', expected.characterId],
    ['readingRef', expected.readingRef],
    ['readingPlanRef', expected.readingPlanRef],
    ['requestedDomain', expected.requestedDomain],
  ];
  for (const [field, expectedValue] of expectedFields) {
    if (candidate[field] !== expectedValue) {
      failures.push(failure('STRUCTURE_MISMATCH', `Character Saju utterance ${field} does not match deterministic renderer identity.`));
    }
  }
  const renderedUnitIds = stringArray(candidate.renderedUnitIds);
  if (renderedUnitIds === null) {
    failures.push(failure('STRUCTURE_MISMATCH', 'renderedUnitIds must be a string array.'));
  } else if (!sameStrings(renderedUnitIds, expected.renderedUnitIds)) {
    const expectedSet = new Set(expected.renderedUnitIds);
    for (const unitId of renderedUnitIds) {
      if (!expectedSet.has(unitId)) {
        failures.push(failure('UNSELECTED_SOURCE_UNIT', 'renderedUnitIds contains a unit outside the selected set.', { unitRef: unitId }));
      }
    }
    for (const unitId of expected.renderedUnitIds) {
      if (!renderedUnitIds.includes(unitId)) {
        failures.push(failure('MISSING_SELECTED_UNIT', 'renderedUnitIds omitted a selected source unit.', { unitRef: unitId }));
      }
    }
  }
  return Object.freeze(failures);
}

export function guardCharacterSajuSemanticPreservationV1(input: {
  readonly candidate: unknown;
  readonly context: CharacterRuntimeContextWithGroundingV1;
  readonly grounding: unknown;
  readonly perspective: CharacterPerspectiveProfileV1;
  readonly requestedDomain: SajuDomain;
}): CharacterSajuSemanticGuardDecisionV1 {
  const rendererDecision = renderCharacterSajuBoundedExactCoreV1({
    context: input.context,
    grounding: input.grounding,
    perspective: input.perspective,
    requestedDomain: input.requestedDomain,
  });
  if (rendererDecision.mode === 'protected_fallback') {
    return Object.freeze({
      mode: 'protected_fallback' as const,
      guardVersion: CHARACTER_SAJU_SEMANTIC_GUARD_VERSION_V1,
      validationState: 'fallback_used' as const,
      reason: 'renderer_protected_fallback' as const,
      failures: Object.freeze([]),
      rendererDecision,
    });
  }

  const groundingRef = input.context.saju?.groundingRef ?? null;
  if (groundingRef === null) throw new TypeError('Semantic guard requires admitted grounding identity.');
  const grounding = admitCharacterSajuGroundingBundleViewV1({
    candidate: input.grounding,
    expectedRef: groundingRef,
  });
  const selected = selectedUnits(rendererDecision.planDecision.selection.selectedUnitIds, grounding.units);
  const failures: CharacterSajuSemanticGuardFailureV1[] = [
    ...compareIdentity(input.candidate, rendererDecision.utterance),
    ...compareSegments({
      candidate: input.candidate,
      expected: rendererDecision.utterance,
      selectedUnitIds: rendererDecision.planDecision.selection.selectedUnitIds,
    }),
  ];

  for (const unit of selected) {
    if ((unit.qualifiers?.length ?? 0) > 0) {
      failures.push(failure('DROPPED_QUALIFIER', 'Exact-core renderer has no approved visible qualifier realization; fail closed until source-approved realization support exists.', { unitRef: unit.unitId }));
    }
    if (unit.ambiguityRef !== undefined) {
      const hasUncertaintySurface = rendererDecision.utterance.segments.some(
        (segment) =>
          segment.kind === 'character_reaction' && segment.sourceUnitRefs.includes(unit.unitId),
      );
      if (!hasUncertaintySurface) {
        failures.push(failure('AMBIGUITY_FLATTENED', 'A selected ambiguous unit requires an explicit uncertainty surface.', { unitRef: unit.unitId }));
      }
    }
  }

  if (failures.length > 0) {
    return Object.freeze({
      mode: 'protected_fallback' as const,
      guardVersion: CHARACTER_SAJU_SEMANTIC_GUARD_VERSION_V1,
      validationState: 'fallback_used' as const,
      reason: 'semantic_guard_failed' as const,
      failures: Object.freeze(failures),
      rendererDecision,
    });
  }

  const disclosureRefs = rendererDecision.utterance.segments
    .filter(
      (segment): segment is Extract<CharacterSajuUtteranceSegmentV1, { kind: 'protected_disclosure' }> =>
        segment.kind === 'protected_disclosure',
    )
    .map((segment) => segment.disclosureRef);
  return Object.freeze({
    mode: 'accepted' as const,
    guardVersion: CHARACTER_SAJU_SEMANTIC_GUARD_VERSION_V1,
    validationState: 'semantic_validated' as const,
    utterance: rendererDecision.utterance,
    evidence: Object.freeze({
      exactCore: true as const,
      characterId: rendererDecision.utterance.characterId,
      readingRef: rendererDecision.utterance.readingRef,
      readingPlanRef: rendererDecision.utterance.readingPlanRef,
      validatedUnitIds: Object.freeze([...rendererDecision.utterance.renderedUnitIds]),
      validatedDisclosureRefs: Object.freeze(disclosureRefs),
    }),
  });
}
