import {
  assertServerPreparedStandardChatGroundingV2,
  type CharacterStandardChatGroundingV2,
} from './character-standard-reading-chat-grounding-v2.js';

export const STANDARD_READER_SOURCE_CLOSURE_VERSION_V1 =
  'myeongha-standard-reader-source-closure-v1' as const;

export type CharacterStandardReaderSourceClosureDecisionV1 =
  | Readonly<{
      mode: 'closed';
      selectedUnitIds: readonly string[];
      requiredDisclosureRefs: readonly string[];
      requiredAmbiguityRefs: readonly string[];
      protectedOnly: boolean;
    }>
  | Readonly<{
      mode: 'hold';
      reason: 'focus_unavailable' | 'unit_limit_exceeded';
    }>;

export class CharacterStandardReaderSourceClosureErrorV1 extends Error {
  constructor(readonly code: 'SOURCE_MISMATCH') {
    super('Saju-owned official Reader source closure is inconsistent.');
    this.name = 'CharacterStandardReaderSourceClosureErrorV1';
  }
}

function sourceMismatch(): never {
  throw new CharacterStandardReaderSourceClosureErrorV1('SOURCE_MISMATCH');
}

/**
 * RR-02: source-owned V1 Unit/Companion/Disclosure/Ambiguity closure.
 *
 * A successful Saju projection may have multiple independent roots. A caller
 * must supply the root already admitted by the first-question/Scene selector;
 * this helper neither classifies intent nor chooses the semantic focus.
 *
 * All bundle-level disclosures and calculation ambiguities are obligations,
 * even when a particular Unit does not directly reference them. Saju V1 may
 * project calculation ambiguity from calculationSummary without attaching its
 * reference to any one narrative Unit. Dropping those notices would silently
 * promote a conditional reading to an unconditional assertion.
 *
 * Never use the decision as source proof in isolation. A caller must retain
 * the exact server-minted grounding, current scope, and final DB recheck.
 */
export function closeCharacterStandardReaderSourceFocusV1(input: Readonly<{
  grounded: CharacterStandardChatGroundingV2;
  rootUnitId: string;
}>): CharacterStandardReaderSourceClosureDecisionV1 {
  assertServerPreparedStandardChatGroundingV2(input.grounded);

  const bundle = input.grounded.grounding;
  const scope = input.grounded.scope;
  if (bundle.readingDomain !== scope.sajuDomain ||
      bundle.readingRef !== scope.readingId ||
      input.grounded.context.saju.groundingRef.groundingHash !== bundle.groundingHash ||
      bundle.units.some(unit => unit.domain !== bundle.readingDomain)) sourceMismatch();

  const byId = new Map(bundle.units.map(unit => [unit.unitId, unit]));
  if (byId.size !== bundle.units.length) sourceMismatch();
  if (typeof input.rootUnitId !== 'string' || !byId.has(input.rootUnitId)) {
    return Object.freeze({ mode: 'hold' as const, reason: 'focus_unavailable' as const });
  }

  const selected = new Set<string>();
  const visit = (id: string): void => {
    if (selected.has(id)) return;
    const unit = byId.get(id);
    if (!unit || unit.sourceBlockRefs.length === 0) sourceMismatch();
    selected.add(id);
    for (const companion of unit.requiredCompanionUnitRefs) visit(companion);
  };
  visit(input.rootUnitId);

  if (selected.size > 12) {
    return Object.freeze({ mode: 'hold' as const, reason: 'unit_limit_exceeded' as const });
  }

  const chosen = bundle.units.filter(unit => selected.has(unit.unitId));
  const allDisclosureRefs = new Set(bundle.disclosures.map(disclosure => disclosure.disclosureRef));
  const allAmbiguityRefs = new Set(bundle.ambiguities.map(ambiguity => ambiguity.ambiguityRef));
  if (allDisclosureRefs.size !== bundle.disclosures.length ||
      allAmbiguityRefs.size !== bundle.ambiguities.length) sourceMismatch();

  for (const unit of chosen) {
    if (unit.requiredDisclosureRefs.some(ref => !allDisclosureRefs.has(ref)) ||
        (unit.ambiguityRef !== undefined && !allAmbiguityRefs.has(unit.ambiguityRef))) {
      sourceMismatch();
    }
  }

  // Entire official Reading source-level restrictions, not only Unit-linked
  // requirements, must survive narrowing to a single focus.
  const requiredDisclosureRefs = Object.freeze(bundle.disclosures.map(d => d.disclosureRef));
  const requiredAmbiguityRefs = Object.freeze(bundle.ambiguities.map(a => a.ambiguityRef));

  return Object.freeze({
    mode: 'closed' as const,
    selectedUnitIds: Object.freeze(chosen.map(unit => unit.unitId)),
    requiredDisclosureRefs,
    requiredAmbiguityRefs,
    protectedOnly: requiredAmbiguityRefs.length > 0 ||
      chosen.some(unit =>
        unit.realizationPolicyRef === 'protected_only_v1' ||
        (unit.qualifiers?.length ?? 0) > 0 ||
        unit.ambiguityRef !== undefined),
  });
}
