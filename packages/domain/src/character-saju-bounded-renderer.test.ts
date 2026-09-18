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
    ambiguities: [],
  };
  return {
    ...withoutHash,
    groundingHash: hashCharacterSajuGroundingBundleMaterialV1(withoutHash),
  };
}

function makePerspective(input: {
  readonly characterId?: string;
  readonly attentionOrder?: CharacterPerspectiveProfileV1['attentionOrder'];
} = {}): CharacterPerspectiveProfileV1 {
  const attentionOrder = input.attentionOrder ?? ['work', 'relationship'];
  return {
    schemaVersion: CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1,
    perspectiveVersion: 'fixture-perspective-v1',
    characterId: input.characterId ?? 'fixture-character',
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
  input: {
    readonly characterId?: string;
    readonly currentLifeQuestion?: string;
    readonly uncertaintyTransition?: string;
  } = {},
): CharacterRuntimeContextWithGroundingV1 {
  const characterId = input.characterId ?? 'fixture-character';
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

  return {
    schemaVersion: 'v1',
    characterId,
    contentBundleId: 'fixture-bundle-v1',
    contentVersion: 'fixture-content-v1',
    speech,
    voiceAuthority: {
      characterId,
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
        before: [
          {
            key: 'fixture_record_transition',
            text: 'fixture record transition',
            purpose: 'record_transition',
          },
          {
            key: 'fixture_current_life_question',
            text: input.currentLifeQuestion ?? 'fixture current-life question',
            purpose: 'current_life_question',
          },
        ],
        after: [
          {
            key: 'fixture_uncertainty_transition',
            text: input.uncertaintyTransition ?? 'fixture uncertainty transition',
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
    rendererPolicy: {
      allowedEmotionIds: [],
      allowedAnimationCueIds: [],
    },
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

function render(input: {
  readonly bundle: CharacterSajuGroundingBundleViewV1;
  readonly context?: CharacterRuntimeContextWithGroundingV1;
  readonly perspective?: CharacterPerspectiveProfileV1;
}) {
  const context = input.context ?? makeContext(input.bundle);
  const perspective = input.perspective ?? makePerspective({ characterId: context.characterId });
  return renderCharacterSajuBoundedExactCoreV1({
    context,
    grounding: input.bundle,
    perspective,
    requestedDomain: 'general',
  });
}

describe('bounded exact-core Character Saju renderer', () => {
  it('renders every selected Saju meaning exactly and keeps source unit lineage', () => {
    const work = makeUnit('1', { axis: 'work' });
    const relationship = makeUnit('2', { axis: 'relationship' });
    const bundle = makeBundle({ units: [work, relationship] });
    const result = render({ bundle });

    expect(result.mode).toBe('bounded_exact_core');
    if (result.mode !== 'bounded_exact_core') throw new Error('expected bounded render');
    const semantic = result.utterance.segments.filter(
      (segment) => segment.kind === 'semantic_realization',
    );
    expect(semantic.map((segment) => segment.text)).toEqual([
      work.canonicalMeaning,
      relationship.canonicalMeaning,
    ]);
    expect(semantic.map((segment) => segment.sourceUnitRefs)).toEqual([
      [work.unitId],
      [relationship.unitId],
    ]);
    expect(result.utterance.renderedUnitIds).toEqual([work.unitId, relationship.unitId]);
  });

  it('changes Character organization without changing the shared Saju meanings', () => {
    const work = makeUnit('1', { axis: 'work' });
    const relationship = makeUnit('2', { axis: 'relationship' });
    const bundle = makeBundle({ units: [work, relationship] });

    const workFirst = render({
      bundle,
      perspective: makePerspective({ attentionOrder: ['work', 'relationship'] }),
    });
    const relationshipFirst = render({
      bundle,
      perspective: makePerspective({ attentionOrder: ['relationship', 'work'] }),
    });
    if (workFirst.mode !== 'bounded_exact_core' || relationshipFirst.mode !== 'bounded_exact_core') {
      throw new Error('expected bounded renders');
    }

    const semanticTexts = (result: typeof workFirst) =>
      result.utterance.segments
        .filter((segment) => segment.kind === 'semantic_realization')
        .map((segment) => segment.text);
    expect(semanticTexts(workFirst)).toEqual([work.canonicalMeaning, relationship.canonicalMeaning]);
    expect(semanticTexts(relationshipFirst)).toEqual([
      relationship.canonicalMeaning,
      work.canonicalMeaning,
    ]);
    expect(new Set(semanticTexts(workFirst))).toEqual(new Set(semanticTexts(relationshipFirst)));
  });

  it('uses exact Character-authored current-life framing for follow-up while keeping Saju text unchanged', () => {
    const unit = makeUnit('1');
    const bundle = makeBundle({ units: [unit] });
    const firstContext = makeContext(bundle, {
      characterId: 'character-a',
      currentLifeQuestion: 'A character authored follow-up.',
    });
    const secondContext = makeContext(bundle, {
      characterId: 'character-b',
      currentLifeQuestion: 'B character authored follow-up.',
    });
    const first = render({
      bundle,
      context: firstContext,
      perspective: makePerspective({ characterId: 'character-a' }),
    });
    const second = render({
      bundle,
      context: secondContext,
      perspective: makePerspective({ characterId: 'character-b' }),
    });
    if (first.mode !== 'bounded_exact_core' || second.mode !== 'bounded_exact_core') {
      throw new Error('expected bounded renders');
    }

    expect(
      first.utterance.segments.find((segment) => segment.kind === 'semantic_realization')?.text,
    ).toBe(unit.canonicalMeaning);
    expect(
      second.utterance.segments.find((segment) => segment.kind === 'semantic_realization')?.text,
    ).toBe(unit.canonicalMeaning);
    expect(
      first.utterance.segments.find((segment) => segment.kind === 'follow_up_question')?.text,
    ).toBe('A character authored follow-up.');
    expect(
      second.utterance.segments.find((segment) => segment.kind === 'follow_up_question')?.text,
    ).toBe('B character authored follow-up.');
  });

  it('uses exact authored uncertainty framing when a bounded limitation is selected', () => {
    const primary = makeUnit('1', { axis: 'work', narrativeRole: 'primary' });
    const limitation = makeUnit('2', {
      axis: 'relationship',
      narrativeRole: 'limitation',
    });
    const bundle = makeBundle({ units: [primary, limitation] });
    const context = makeContext(bundle, { uncertaintyTransition: 'authored uncertainty text' });
    const result = render({ bundle, context });
    if (result.mode !== 'bounded_exact_core') throw new Error('expected bounded render');

    const reaction = result.utterance.segments.find(
      (segment) => segment.kind === 'character_reaction',
    );
    expect(reaction?.text).toBe('authored uncertainty text');
    expect(reaction?.sourceUnitRefs).toEqual([primary.unitId, limitation.unitId]);
  });

  it('preserves protected disclosure text exactly', () => {
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
    const result = render({ bundle });
    if (result.mode !== 'bounded_exact_core') throw new Error('expected bounded render');

    expect(
      result.utterance.segments.find((segment) => segment.kind === 'protected_disclosure'),
    ).toEqual({
      kind: 'protected_disclosure',
      text: 'source disclosure text',
      disclosureRef,
    });
  });

  it('passes protected-only selected material to explicit Mode A fallback', () => {
    const primary = makeUnit('1', { axis: 'work' });
    const protectedLimitation = makeUnit('2', {
      axis: 'relationship',
      narrativeRole: 'limitation',
      realizationPolicyRef: 'protected_only_v1',
    });
    const bundle = makeBundle({ units: [primary, protectedLimitation] });
    const result = render({ bundle });

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected fallback');
    expect(result.validationState).toBe('fallback_used');
    expect(result.planDecision.fallback.protectedUnitRefs).toEqual([protectedLimitation.unitId]);
  });

  it('fails closed when Saju voice authority is not the exact active Character authority', () => {
    const bundle = makeBundle({ units: [makeUnit('1')] });
    const context = makeContext(bundle);
    const invalidContext = {
      ...context,
      voiceAuthority: {
        ...context.voiceAuthority,
        speech: { ...context.speech },
      },
    } as CharacterRuntimeContextWithGroundingV1;

    expect(() => render({ bundle, context: invalidContext })).toThrow(
      'must use the exact published Character speech object',
    );
  });

  it('is deterministic for the same source grounding, Character context, and perspective', () => {
    const bundle = makeBundle({
      units: [makeUnit('1', { axis: 'work' }), makeUnit('2', { axis: 'relationship' })],
    });
    const context = makeContext(bundle);
    const perspective = makePerspective();
    expect(render({ bundle, context, perspective })).toEqual(
      render({ bundle, context, perspective }),
    );
  });
});
