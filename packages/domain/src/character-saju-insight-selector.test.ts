import { describe, expect, it } from 'vitest';

import type { CharacterRuntimeContextWithGroundingV1 } from './character-saju-grounding-admission.js';
import {
  SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
  SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
  SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
} from './character-saju-grounding-admission.js';
import type { CharacterPerspectiveProfileV1 } from './character-saju-perspective.js';
import { CHARACTER_PERSPECTIVE_SCHEMA_VERSION_V1 } from './character-saju-perspective.js';
import {
  admitCharacterSajuGroundingBundleViewV1,
  hashCharacterSajuGroundingBundleMaterialV1,
  selectCharacterInsightsV1,
  type CharacterGroundingUnitViewV1,
  type CharacterSajuGroundingBundleViewV1,
} from './character-saju-insight-selector.js';

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
    canonicalMeaning: `canonical meaning ${hex}`,
    sourceBlockRefs: [`sections.0.blocks.${hex}`],
    requiredCompanionUnitRefs: [],
    requiredDisclosureRefs: [],
    realizationPolicyRef: 'bounded_semantic_paraphrase_v1',
    ...overrides,
  };
}

function makeBundle(
  units: readonly CharacterGroundingUnitViewV1[],
): CharacterSajuGroundingBundleViewV1 {
  const withoutHash = {
    schemaVersion: SAJU_CHARACTER_GROUNDING_SCHEMA_VERSION_V1,
    groundingProjectionVersion: SAJU_CHARACTER_GROUNDING_PROJECTION_VERSION_V1,
    axisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
    readingRef: 'reading-001',
    productResponseVersion: 'product-reading-response-v1',
    engineVersion: 'saju-engine-v1',
    readingDomain: 'general' as const,
    sourceResponseHash: SOURCE_HASH,
    units,
    disclosures: [],
    ambiguities: [],
  };
  return {
    ...withoutHash,
    groundingHash: hashCharacterSajuGroundingBundleMaterialV1(withoutHash),
  };
}

function makePerspective(input?: {
  readonly attentionOrder?: CharacterPerspectiveProfileV1['attentionOrder'];
  readonly maxPrimaryUnits?: number;
  readonly maxSupportingUnits?: number;
  readonly maxTensionUnits?: number;
  readonly maxLimitationUnits?: number;
  readonly avoidSameAxisRepetition?: boolean;
}): CharacterPerspectiveProfileV1 {
  const attentionOrder = input?.attentionOrder ?? ['work', 'relationship', 'wealth'];
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
      maxPrimaryUnits: input?.maxPrimaryUnits ?? 2,
      maxSupportingUnits: input?.maxSupportingUnits ?? 1,
      maxTensionUnits: input?.maxTensionUnits ?? 1,
      maxLimitationUnits: input?.maxLimitationUnits ?? 1,
      avoidSameAxisRepetition: input?.avoidSameAxisRepetition ?? true,
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
  input?: { readonly capabilityDomain?: 'general' | 'career'; readonly withoutGroundingRef?: boolean },
): CharacterRuntimeContextWithGroundingV1 {
  return {
    characterId: 'fixture-character',
    contentVersion: 'fixture-content-v1',
    sajuProfile: { profileVersion: 'fixture-saju-profile-v1' },
    saju: {
      domain: 'general',
      capability: {
        domain: input?.capabilityDomain ?? 'general',
        role: 'primary',
        canInitiate: true,
        capabilityVersion: 'fixture-capability-v1',
      },
      groundingRef:
        input?.withoutGroundingRef === true
          ? null
          : {
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

function select(
  bundle: CharacterSajuGroundingBundleViewV1,
  perspective = makePerspective(),
  context = makeContext(bundle),
) {
  return selectCharacterInsightsV1({
    context,
    grounding: bundle,
    perspective,
    requestedDomain: 'general',
  });
}

describe('Character Saju grounding bundle view admission', () => {
  it('admits only a bundle whose body matches the admitted Saju grounding hash', () => {
    const bundle = makeBundle([makeUnit('1')]);
    const context = makeContext(bundle);
    const admitted = admitCharacterSajuGroundingBundleViewV1({
      candidate: bundle,
      expectedRef: context.saju!.groundingRef!,
    });
    expect(admitted.groundingHash).toBe(bundle.groundingHash);
    expect(Object.isFrozen(admitted.units)).toBe(true);

    const tampered = {
      ...bundle,
      units: [{ ...bundle.units[0]!, canonicalMeaning: 'tampered meaning' }],
    };
    expect(() =>
      admitCharacterSajuGroundingBundleViewV1({
        candidate: tampered,
        expectedRef: context.saju!.groundingRef!,
      }),
    ).toThrow('bundle hash does not match bundle content');
  });

  it('rejects raw Product/ClaimGraph material at the bundle boundary', () => {
    const bundle = makeBundle([makeUnit('1')]);
    const context = makeContext(bundle);
    expect(() =>
      admitCharacterSajuGroundingBundleViewV1({
        candidate: { ...bundle, productReadingResponse: { state: 'delivered' } },
        expectedRef: context.saju!.groundingRef!,
      }),
    ).toThrow('unexpected field: productReadingResponse');
  });
});

describe('deterministic Character Insight Selector', () => {
  it('keeps source selection identity separate from character attention ordering', () => {
    const work = makeUnit('1', { axis: 'work', narrativeRole: 'primary' });
    const relationship = makeUnit('2', {
      axis: 'relationship',
      narrativeRole: 'primary',
    });
    const wealth = makeUnit('3', { axis: 'wealth', narrativeRole: 'supporting' });
    const bundle = makeBundle([work, relationship, wealth]);
    const perspective = makePerspective({
      attentionOrder: ['relationship', 'work', 'wealth'],
      maxPrimaryUnits: 2,
      maxSupportingUnits: 1,
    });

    const result = select(bundle, perspective);
    expect(result.selectedUnitIds).toEqual([work.unitId, relationship.unitId, wealth.unitId]);
    expect(result.orderedUnitIds).toEqual([relationship.unitId, work.unitId, wealth.unitId]);
  });

  it('suppresses optional repetition on the same axis', () => {
    const firstWork = makeUnit('1', { axis: 'work' });
    const secondWork = makeUnit('2', { axis: 'work' });
    const relationship = makeUnit('3', { axis: 'relationship' });
    const bundle = makeBundle([firstWork, secondWork, relationship]);
    const result = select(
      bundle,
      makePerspective({ maxPrimaryUnits: 3, maxSupportingUnits: 0 }),
    );

    expect(result.selectedUnitIds).toEqual([firstWork.unitId, relationship.unitId]);
    const omitted = result.selectionReasons.find((item) => item.unitId === secondWork.unitId);
    expect(omitted?.codes).toContain('same_axis_deduplicated');
  });

  it('preserves at least one available tension and limitation even on a repeated axis', () => {
    const primary = makeUnit('1', { axis: 'work', narrativeRole: 'primary' });
    const tension = makeUnit('2', { axis: 'work', narrativeRole: 'tension' });
    const limitation = makeUnit('3', {
      axis: 'work',
      narrativeRole: 'limitation',
      realizationPolicyRef: 'protected_only_v1',
    });
    const bundle = makeBundle([primary, tension, limitation]);
    const result = select(
      bundle,
      makePerspective({
        maxPrimaryUnits: 1,
        maxSupportingUnits: 0,
        maxTensionUnits: 1,
        maxLimitationUnits: 1,
      }),
    );

    expect(result.selectedUnitIds).toEqual([primary.unitId, tension.unitId, limitation.unitId]);
    expect(
      result.selectionReasons.find((item) => item.unitId === tension.unitId)?.codes,
    ).toContain('selected_required_tension');
    expect(
      result.selectionReasons.find((item) => item.unitId === limitation.unitId)?.codes,
    ).toContain('selected_required_limitation');
  });

  it('does not admit protected-only material as an ordinary semantic unit', () => {
    const protectedPrimary = makeUnit('1', {
      axis: 'work',
      narrativeRole: 'primary',
      realizationPolicyRef: 'protected_only_v1',
    });
    const limitation = makeUnit('2', {
      axis: 'relationship',
      narrativeRole: 'limitation',
      realizationPolicyRef: 'protected_only_v1',
    });
    const bundle = makeBundle([protectedPrimary, limitation]);
    const result = select(
      bundle,
      makePerspective({ maxPrimaryUnits: 1, maxSupportingUnits: 0, maxTensionUnits: 0 }),
    );

    expect(result.selectedUnitIds).toEqual([limitation.unitId]);
    expect(
      result.selectionReasons.find((item) => item.unitId === protectedPrimary.unitId)?.codes,
    ).toContain('protected_only_non_limitation');
  });

  it('fails closed when the requested domain is not admitted by Character capability', () => {
    const bundle = makeBundle([makeUnit('1')]);
    expect(() =>
      select(bundle, makePerspective(), makeContext(bundle, { capabilityDomain: 'career' })),
    ).toThrow('not admitted by the active Character capability');
  });

  it('keeps Mode A fallback when no grounding identity is admitted', () => {
    const bundle = makeBundle([makeUnit('1')]);
    expect(() =>
      select(bundle, makePerspective(), makeContext(bundle, { withoutGroundingRef: true })),
    ).toThrow('use protected fallback otherwise');
  });

  it('is deterministic for the same grounding and perspective', () => {
    const bundle = makeBundle([
      makeUnit('1', { axis: 'work' }),
      makeUnit('2', { axis: 'relationship' }),
      makeUnit('3', { axis: 'wealth', narrativeRole: 'supporting' }),
    ]);
    const perspective = makePerspective({ attentionOrder: ['wealth', 'relationship', 'work'] });
    expect(select(bundle, perspective)).toEqual(select(bundle, perspective));
  });
});
