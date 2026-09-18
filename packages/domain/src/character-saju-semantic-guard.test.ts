import { describe, expect, it } from 'vitest';

import {
  SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
  type CharacterRuntimeContextWithGroundingV1,
} from './character-saju-grounding-admission.js';
import {
  CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1,
  type CharacterPerspectiveProfileV1,
} from './character-saju-perspective.js';
import {
  hashCharacterSajuGroundingBundleMaterialV1,
  type CharacterGroundingUnitViewV1,
  type CharacterSajuGroundingBundleViewV1,
} from './character-saju-insight-selector.js';
import { renderCharacterSajuBoundedExactCoreV1 } from './character-saju-bounded-renderer.js';
import { guardCharacterSajuSemanticPreservationV1 } from './character-saju-semantic-guard.js';

const SOURCE_HASH = 'a'.repeat(64);

function unitId(hex: string): string {
  return `grounding_unit_${hex.repeat(24)}`;
}

function makeUnit(
  hex: string,
  overrides: Partial<CharacterGroundingUnitViewV1> = {},
): CharacterGroundingUnitViewV1 {
  return {
    unitId: unitId(hex),
    domain: 'general',
    axis: 'work',
    narrativeRole: 'primary',
    semanticKey: `semantic-${hex}`,
    canonicalMeaning: `source canonical meaning ${hex}`,
    sourceBlockRefs: [`sections.0.blocks.${hex}`],
    requiredCompanionUnitRefs: [],
    requiredDisclosureRefs: [],
    realizationPolicyRef: 'bounded_semantic_paraphrase_v1',
    ...overrides,
  };
}

function makeBundle(input: {
  readonly units: readonly CharacterGroundingUnitViewV1[];
  readonly disclosures?: CharacterSajuGroundingBundleViewV1['disclosures'];
  readonly ambiguities?: CharacterSajuGroundingBundleViewV1['ambiguities'];
}): CharacterSajuGroundingBundleViewV1 {
  const withoutHash = {
    schemaVersion: SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    groundingProjectionVersion: SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    axisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    readingRef: 'reading-001',
    productResponseVersion: 'product-reading-response-v1',
    engineVersion: 'saju-engine-v1',
    readingDomain: 'general' as const,
    sourceResponseHash: SOURCE_HASH,
    units: input.units,
    disclosures: input.disclosures ?? [],
    ambiguities: input.ambiguities ?? [],
  };
  return {
    ...withoutHash,
    groundingHash: hashCharacterSajuGroundingBundleMaterialV1(withoutHash),
  };
}

function makePerspective(
  attentionOrder: CharacterPerspectiveProfileV1['attentionOrder'] = ['work', 'relationship'],
): CharacterPerspectiveProfileV1 {
  return {
    schemaVersion: CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1,
    perspectiveVersion: 'fixture-perspective-v1',
    characterId: 'fixture-character',
    sourceContentVersion: 'fixture-content-v1',
    sourceSajuProfileVersion: 'fixture-saju-profile-v1',
    groundingAxisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    attentionBindings: attentionOrder.map((axis) => ({
      authoredAttentionAxis: axis,
      groundingAxis: axis,
    })),
    attentionOrder,
    preferredNarrativeRoles: ['primary', 'supporting', 'tension', 'limitation'],
    selection: {
      maxPrimaryUnits: 2,
      maxSupportingUnits: 1,
      maxTensionUnits: 1,
      maxLimitationUnits: 1,
      avoidSameAxisRepetition: true,
    },
    interpretationBehavior: {
      contradictionHandling: 'lead_with_it',
      uncertaintyHandling: 'state_directly',
      adviceStyle: 'action_first',
    },
    deliveryAuthority: {
      speech: 'published_character_speech',
      communication: 'published_character_persona_communication',
      relationship: 'active_relationship_projection',
    },
  };
}

function makeContext(
  bundle: CharacterSajuGroundingBundleViewV1,
  input: { readonly withQuestion?: boolean } = {},
): CharacterRuntimeContextWithGroundingV1 {
  const speech = {
    register: 'fixture register',
    sentenceRhythm: 'fixture rhythm',
    directness: 'medium',
    warmth: 'medium',
    profanity: 'none',
    forbiddenBehaviors: [],
  } as const;
  const communication = {
    register: 'fixture register',
    sentenceRhythm: 'fixture rhythm',
    verbosity: 'medium',
    humorStyle: 'none',
    metaphorStyle: 'none',
    profanityIntensity: 'none',
    politenessStyle: 'respectful',
  } as const;
  const before = [
    {
      key: 'fixture_record_transition',
      text: 'fixture record transition',
      purpose: 'record_transition' as const,
    },
    ...(input.withQuestion === false
      ? []
      : [
          {
            key: 'fixture_current_life_question',
            text: 'fixture current-life question',
            purpose: 'current_life_question' as const,
          },
        ]),
  ];

  return {
    schemaVersion: 'v1',
    characterId: 'fixture-character',
    contentBundleId: 'fixture-bundle-v1',
    contentVersion: 'fixture-content-v1',
    speech,
    voiceAuthority: {
      characterId: 'fixture-character',
      surface: 'saju_product',
      source: 'published_character_content',
      contentVersion: 'fixture-content-v1',
      speech,
      communication,
    },
    canon: {},
    persona: { communication },
    behavior: {},
    sajuProfile: {
      profileVersion: 'fixture-saju-profile-v1',
      attentionAxes: ['work', 'relationship'],
      followUpQuestionStrategies: ['authored_strategy'],
      safeFraming: {
        schemaVersion: 'v1',
        catalogVersion: 'fixture-safe-framing-v1',
        before,
        after: [
          {
            key: 'fixture_uncertainty_transition',
            text: 'fixture uncertainty transition',
            purpose: 'uncertainty_transition',
          },
          {
            key: 'fixture_relationship_transition',
            text: 'fixture relationship transition',
            purpose: 'relationship_transition',
          },
        ],
      },
    },
    relationship: {
      schemaVersion: 'v1',
      relationshipRevision: 7,
      relationshipPolicyVersion: 'relationship-policy-v1',
      projectionPolicyVersion: 'relationship-projection-v1',
      behaviorVersion: 'relationship-behavior-v1',
      matchedBehaviorRuleKey: null,
      stageKey: 'acquainted',
      closenessBand: 'medium',
      trustBand: 'medium',
      frictionBand: 'low',
      recentEventKeys: [],
      mode: {},
    },
    rendererPolicy: { allowedEmotionIds: [], allowedAnimationCueIds: [] },
    worldRelations: [],
    lifeFacts: [],
    memories: [],
    recentMessages: [],
    saju: {
      readingRef: bundle.readingRef,
      domain: 'general',
      coverageState: 'complete',
      protectedSegments: [],
      disclosures: [],
      ambiguity: [],
      capability: {
        domain: 'general',
        role: 'primary',
        canInitiate: true,
        capabilityVersion: 'fixture-capability-v1',
      },
      groundingRef: {
        schemaVersion: bundle.schemaVersion,
        groundingProjectionVersion: bundle.groundingProjectionVersion,
        axisRegistryVersion: bundle.axisRegistryVersion,
        readingRef: bundle.readingRef,
        productResponseVersion: bundle.productResponseVersion,
        engineVersion: bundle.engineVersion,
        readingDomain: bundle.readingDomain,
        sourceResponseHash: bundle.sourceResponseHash,
        groundingHash: bundle.groundingHash,
      },
    },
  } as unknown as CharacterRuntimeContextWithGroundingV1;
}

function expectedUtterance(
  bundle: CharacterSajuGroundingBundleViewV1,
  context = makeContext(bundle),
  perspective = makePerspective(),
) {
  const result = renderCharacterSajuBoundedExactCoreV1({
    context,
    grounding: bundle,
    perspective,
    requestedDomain: 'general',
  });
  if (result.mode !== 'bounded_exact_core') throw new Error('expected bounded render');
  return result.utterance;
}

function guard(input: {
  readonly bundle: CharacterSajuGroundingBundleViewV1;
  readonly candidate: unknown;
  readonly context?: CharacterRuntimeContextWithGroundingV1;
  readonly perspective?: CharacterPerspectiveProfileV1;
}) {
  const context = input.context ?? makeContext(input.bundle);
  const perspective = input.perspective ?? makePerspective();
  return guardCharacterSajuSemanticPreservationV1({
    candidate: input.candidate,
    context,
    grounding: input.bundle,
    perspective,
    requestedDomain: 'general',
  });
}

describe('Character Saju semantic preservation guard v1', () => {
  it('accepts the deterministic exact-core renderer output and returns server-owned utterance', () => {
    const bundle = makeBundle({ units: [makeUnit('1'), makeUnit('2', { axis: 'relationship' })] });
    const context = makeContext(bundle);
    const perspective = makePerspective();
    const candidate = expectedUtterance(bundle, context, perspective);
    const result = guard({ bundle, context, perspective, candidate });

    expect(result.mode).toBe('accepted');
    if (result.mode !== 'accepted') throw new Error('expected accepted result');
    expect(result.validationState).toBe('semantic_validated');
    expect(result.utterance).toEqual(candidate);
    expect(result.evidence.validatedUnitIds).toEqual(candidate.renderedUnitIds);
  });

  it('rejects semantic text mutation instead of trying to judge free paraphrase equivalence', () => {
    const bundle = makeBundle({ units: [makeUnit('1')] });
    const candidate = expectedUtterance(bundle);
    const segments = candidate.segments.map((segment) =>
      segment.kind === 'semantic_realization'
        ? { ...segment, text: '30대에 반드시 큰돈을 법니다.' }
        : segment,
    );
    const result = guard({ bundle, candidate: { ...candidate, segments } });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.failures.map((item) => item.code)).toContain('EXACT_CORE_TEXT_MISMATCH');
  });

  it('rejects an added segment as an added claim surface', () => {
    const bundle = makeBundle({ units: [makeUnit('1')] });
    const candidate = expectedUtterance(bundle);
    const semantic = candidate.segments.find((segment) => segment.kind === 'semantic_realization');
    if (semantic === undefined) throw new Error('fixture needs semantic segment');
    const result = guard({
      bundle,
      candidate: { ...candidate, segments: [...candidate.segments, semantic] },
    });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.failures.map((item) => item.code)).toContain('ADDED_CLAIM');
  });

  it('rejects omission of a selected semantic unit', () => {
    const bundle = makeBundle({ units: [makeUnit('1')] });
    const context = makeContext(bundle, { withQuestion: false });
    const candidate = expectedUtterance(bundle, context);
    const result = guard({ bundle, context, candidate: { ...candidate, renderedUnitIds: [], segments: [] } });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.failures.map((item) => item.code)).toContain('MISSING_SELECTED_UNIT');
  });

  it('rejects mutation of an exact protected disclosure', () => {
    const disclosureRef = 'grounding_disclosure_fixture';
    const unit = makeUnit('1', { requiredDisclosureRefs: [disclosureRef] });
    const bundle = makeBundle({
      units: [unit],
      disclosures: [
        {
          disclosureRef,
          type: 'scope_limitation',
          text: 'source disclosure text',
          sourceDisclosureIndex: 0,
        },
      ],
    });
    const candidate = expectedUtterance(bundle);
    const segments = candidate.segments.map((segment) =>
      segment.kind === 'protected_disclosure'
        ? { ...segment, text: 'mutated disclosure' }
        : segment,
    );
    const result = guard({ bundle, candidate: { ...candidate, segments } });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.failures.map((item) => item.code)).toContain('PROTECTED_DISCLOSURE_MUTATED');
  });

  it('rejects Character framing that is not the exact authored safe framing', () => {
    const bundle = makeBundle({ units: [makeUnit('1')] });
    const candidate = expectedUtterance(bundle);
    const segments = candidate.segments.map((segment) =>
      segment.kind === 'follow_up_question'
        ? { ...segment, text: 'invented Character question' }
        : segment,
    );
    const result = guard({ bundle, candidate: { ...candidate, segments } });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.failures.map((item) => item.code)).toContain('UNAUTHORED_CHARACTER_FRAMING');
  });

  it('fails closed when a source qualifier exists but exact-core has no approved visible qualifier realization', () => {
    const bundle = makeBundle({
      units: [makeUnit('1', { qualifiers: ['조건에 따라 강도가 달라질 수 있습니다.'] })],
    });
    const candidate = expectedUtterance(bundle);
    const result = guard({ bundle, candidate });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: 'DROPPED_QUALIFIER', unitRef: unitId('1') }),
    );
  });

  it('propagates protected-only material to Mode A without attempting semantic validation', () => {
    const bundle = makeBundle({
      units: [
        makeUnit('1'),
        makeUnit('2', {
          axis: 'relationship',
          narrativeRole: 'limitation',
          realizationPolicyRef: 'protected_only_v1',
        }),
      ],
    });
    const result = guard({ bundle, candidate: {} });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.reason).toBe('renderer_protected_fallback');
    expect(result.failures).toEqual([]);
  });

  it('is deterministic for the same candidate and authoritative inputs', () => {
    const bundle = makeBundle({ units: [makeUnit('1')] });
    const candidate = expectedUtterance(bundle);
    expect(guard({ bundle, candidate })).toEqual(guard({ bundle, candidate }));
  });
});
