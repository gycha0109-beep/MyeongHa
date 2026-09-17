import { describe, expect, it } from 'vitest';

import {
  SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
  type CharacterRuntimeContextWithGroundingV1,
} from './character-saju-grounding-admission.js';
import type { CharacterPerspectiveProfileV1 } from './character-saju-perspective.js';
import { CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1 } from './character-saju-perspective.js';
import {
  hashCharacterSajuGroundingBundleMaterialV1,
  type CharacterGroundingUnitViewV1,
  type CharacterSajuGroundingBundleViewV1,
} from './character-saju-insight-selector.js';
import { buildCharacterReadingPlanDecisionV1 } from './character-saju-reading-plan.js';

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
    canonicalMeaning: `source meaning ${hex}`,
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

function makePerspective(
  attentionOrder: CharacterPerspectiveProfileV1['attentionOrder'] = ['relationship', 'work'],
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
  followUpQuestionStrategies: readonly string[] = ['ask_tradeoff', 'ask_boundary'],
): CharacterRuntimeContextWithGroundingV1 {
  return {
    schemaVersion: 'v1',
    characterId: 'fixture-character',
    contentVersion: 'fixture-content-v1',
    sajuProfile: {
      profileVersion: 'fixture-saju-profile-v1',
      followUpQuestionStrategies,
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

function build(
  bundle: CharacterSajuGroundingBundleViewV1,
  perspective = makePerspective(),
  context = makeContext(bundle),
) {
  return buildCharacterReadingPlanDecisionV1({
    context,
    grounding: bundle,
    perspective,
    requestedDomain: 'general',
  });
}

describe('CharacterReadingPlanV1', () => {
  it('builds a deterministic text-free plan from the selector order', () => {
    const work = makeUnit('1', { axis: 'work', narrativeRole: 'primary' });
    const relationship = makeUnit('2', {
      axis: 'relationship',
      narrativeRole: 'tension',
    });
    const bundle = makeBundle({ units: [work, relationship] });

    const first = build(bundle);
    const second = build(bundle);
    expect(first).toEqual(second);
    expect(first.mode).toBe('character_plan');
    if (first.mode !== 'character_plan') throw new Error('expected character plan');

    expect(first.plan.planId).toMatch(/^character_reading_plan_[0-9a-f]{24}$/u);
    const semanticBeats = first.plan.beats.filter(
      (beat) => beat.kind === 'semantic_realization',
    );
    expect(semanticBeats.map((beat) => beat.unitRefs[0])).toEqual([
      relationship.unitId,
      work.unitId,
    ]);
    expect(semanticBeats.map((beat) => beat.purpose)).toEqual(['lead', 'expand']);
    expect(JSON.stringify(first.plan)).not.toContain('source meaning');
  });

  it('pins the exact perspective and relationship projections used by the plan', () => {
    const bundle = makeBundle({ units: [makeUnit('1')] });
    const result = build(bundle);
    if (result.mode !== 'character_plan') throw new Error('expected character plan');

    expect(result.plan.perspectiveProfileRef).toMatchObject({
      characterId: 'fixture-character',
      perspectiveVersion: 'fixture-perspective-v1',
      sourceContentVersion: 'fixture-content-v1',
      sourceSajuProfileVersion: 'fixture-saju-profile-v1',
    });
    expect(result.plan.perspectiveProfileRef.profileHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.plan.relationshipProjectionRef).toMatchObject({
      relationshipRevision: 7,
      relationshipPolicyVersion: 'relationship-policy-v1',
      projectionPolicyVersion: 'relationship-projection-v1',
      behaviorVersion: 'relationship-behavior-v1',
    });
    expect(result.plan.relationshipProjectionRef.projectionHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('preserves required protected disclosures exactly once', () => {
    const disclosureRef = 'grounding_disclosure_fixture';
    const unit = makeUnit('1', { requiredDisclosureRefs: [disclosureRef] });
    const bundle = makeBundle({
      units: [unit],
      disclosures: [
        {
          disclosureRef,
          type: 'scope_limitation',
          text: 'source disclosure',
          sourceDisclosureIndex: 0,
        },
      ],
    });
    const result = build(bundle);
    if (result.mode !== 'character_plan') throw new Error('expected character plan');

    expect(
      result.plan.beats.filter((beat) => beat.kind === 'protected_disclosure'),
    ).toEqual([{ kind: 'protected_disclosure', disclosureRef }]);
  });

  it('uses only an authored follow-up question strategy and never writes question text', () => {
    const bundle = makeBundle({ units: [makeUnit('1')] });
    const result = build(bundle, makePerspective(), makeContext(bundle, ['authored_strategy']));
    if (result.mode !== 'character_plan') throw new Error('expected character plan');

    const question = result.plan.beats.find((beat) => beat.kind === 'follow_up_question');
    expect(question).toEqual({
      kind: 'follow_up_question',
      sourceUnitRefs: [unitId('1')],
      questionStrategy: 'authored_strategy',
    });
    expect(question).not.toHaveProperty('text');
  });

  it('emits explicit Mode A fallback instead of paraphrasing a protected-only selected unit', () => {
    const primary = makeUnit('1', { axis: 'work', narrativeRole: 'primary' });
    const protectedLimitation = makeUnit('2', {
      axis: 'relationship',
      narrativeRole: 'limitation',
      realizationPolicyRef: 'protected_only_v1',
    });
    const bundle = makeBundle({ units: [primary, protectedLimitation] });
    const result = build(bundle);

    expect(result.mode).toBe('protected_fallback');
    if (result.mode !== 'protected_fallback') throw new Error('expected protected fallback');
    expect(result.fallback.reason).toBe('selected_unit_requires_protected_rendering');
    expect(result.fallback.protectedUnitRefs).toEqual([protectedLimitation.unitId]);
    expect(result).not.toHaveProperty('plan');
  });

  it('lets perspective organization change order without changing the Saju source units', () => {
    const work = makeUnit('1', { axis: 'work' });
    const relationship = makeUnit('2', { axis: 'relationship' });
    const bundle = makeBundle({ units: [work, relationship] });

    const relationshipFirst = build(bundle, makePerspective(['relationship', 'work']));
    const workFirst = build(bundle, makePerspective(['work', 'relationship']));
    if (relationshipFirst.mode !== 'character_plan' || workFirst.mode !== 'character_plan') {
      throw new Error('expected character plans');
    }

    expect(relationshipFirst.selection.selectedUnitIds).toEqual(workFirst.selection.selectedUnitIds);
    expect(relationshipFirst.selection.orderedUnitIds).toEqual([relationship.unitId, work.unitId]);
    expect(workFirst.selection.orderedUnitIds).toEqual([work.unitId, relationship.unitId]);
  });
});
