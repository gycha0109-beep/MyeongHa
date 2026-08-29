import { describe, expect, it } from 'vitest';
import {
  FACELAB_NEUTRAL_BINDING_PROFILE_FR14,
  MAYI_THREE_DIVISIONS_BOUNDARY_VARIANTS_FR33,
  MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_AUTHORITY_FR34,
  MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_REQUIREMENTS_FR34,
  NEUTRAL_DERIVATION_REGISTRY_FR17,
  assertMayiThreeDivisionsNeutralOperationalizationReadyFR34,
  assessMayiThreeDivisionsNeutralAnchorReadinessFR34,
  validateMayiThreeDivisionsNeutralAnchorAuthorityFR34,
  type MayiThreeDivisionsNeutralAnchorAuthorityFR34V1,
} from '../packages/face-reading/src/index.js';

describe('FR-34 Mayi Three Divisions neutral anchor requirements', () => {
  it('validates the provider-independent requirement authority', () => {
    expect(() => validateMayiThreeDivisionsNeutralAnchorAuthorityFR34()).not.toThrow();
  });

  it('covers all seven traditional anchors without selecting either FR-33 variant', () => {
    expect(MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_REQUIREMENTS_FR34.map((entry) => entry.traditionalAnchorRef)).toEqual([
      'hairline', 'brow', 'yintang', 'shangen', 'zhuntou', 'renzhong', 'dige',
    ]);
    expect(MAYI_THREE_DIVISIONS_BOUNDARY_VARIANTS_FR33.map((entry) => entry.variantId)).toEqual([
      'mayi_sancai_noncontiguous',
      'mayi_face_contiguous',
    ]);
    expect(MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_AUTHORITY_FR34.authorityBoundary.sourceVariantSelectionAllowed).toBe(false);
  });

  it('preserves the two source topologies instead of collapsing them into one universal map', () => {
    const spans = MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_AUTHORITY_FR34.variantSpanRequirements.map((entry) => [
      entry.variantId,
      entry.section,
      entry.fromTraditionalAnchor,
      entry.toTraditionalAnchor,
    ]);
    expect(spans).toEqual([
      ['mayi_sancai_noncontiguous', 'upper', 'hairline', 'yintang'],
      ['mayi_sancai_noncontiguous', 'middle', 'shangen', 'zhuntou'],
      ['mayi_sancai_noncontiguous', 'lower', 'renzhong', 'dige'],
      ['mayi_face_contiguous', 'upper', 'hairline', 'brow'],
      ['mayi_face_contiguous', 'middle', 'brow', 'zhuntou'],
      ['mayi_face_contiguous', 'lower', 'zhuntou', 'dige'],
    ]);
  });

  it('uses FR-14/FR-17 only as neutral dependencies and never as traditional equivalence authority', () => {
    const fr14Anchors = new Set(FACELAB_NEUTRAL_BINDING_PROFILE_FR14.bindings.map((entry) => entry.anchorRef));
    const fr17Refs = new Set(NEUTRAL_DERIVATION_REGISTRY_FR17.definitions.map((entry) => entry.derivationId));
    for (const requirement of MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_REQUIREMENTS_FR34) {
      expect(requirement.traditionalNeutralEquivalenceState).toBe('unreviewed_not_authorized');
      expect(requirement.providerLandmarkRefs).toEqual([]);
      expect(requirement.productionBindingAllowed).toBe(false);
      requirement.existingNeutralAnchorDependencyRefs.forEach((ref) => expect(fr14Anchors.has(ref)).toBe(true));
      requirement.existingDerivationDependencyRefs.forEach((ref) => expect(fr17Refs.has(ref)).toBe(true));
    }
  });

  it('does not silently equate 印堂 with brow_midline or 準頭 with nose provider geometry', () => {
    const yintang = MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_REQUIREMENTS_FR34.find((entry) => entry.traditionalAnchorRef === 'yintang')!;
    const zhuntou = MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_REQUIREMENTS_FR34.find((entry) => entry.traditionalAnchorRef === 'zhuntou')!;
    expect(yintang.existingNeutralAnchorDependencyRefs).toEqual(['brow_midline']);
    expect(yintang.requirementState).toBe('blocked_traditional_neutral_equivalence');
    expect(zhuntou.existingNeutralAnchorDependencyRefs).toEqual(['nose']);
    expect(zhuntou.requirementState).toBe('blocked_existing_derivation_dependency');
    expect(yintang.neutralRequirementRef).not.toBe('brow_midline');
    expect(zhuntou.neutralRequirementRef).not.toBe('nose');
  });

  it('reports the currently missing neutral surfaces and keeps production closed', () => {
    const readiness = assessMayiThreeDivisionsNeutralAnchorReadinessFR34();
    expect(readiness.providerIndependentRequirementsComplete).toBe(true);
    expect(readiness.sourceVariantCoverageComplete).toBe(true);
    expect(readiness.existingFR14ContractPreserved).toBe(true);
    expect(readiness.executableExistingDerivationRefs).toEqual([]);
    expect(readiness.missingNeutralSurfaceAnchorRefs).toEqual(['hairline', 'renzhong', 'dige']);
    expect(readiness.traditionalNeutralEquivalenceReady).toBe(false);
    expect(readiness.neutralOperationalizationReady).toBe(false);
    expect(readiness.productionMetricReady).toBe(false);
    expect(readiness.productionF1Ready).toBe(false);
    expect(readiness.productionF6Ready).toBe(false);
  });

  it('fails closed if a provider landmark index is injected', () => {
    const requirements = MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_AUTHORITY_FR34.requirements.map((entry, index) =>
      index === 0 ? { ...entry, providerLandmarkRefs: [10] } : entry,
    );
    const invalid = {
      ...MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_AUTHORITY_FR34,
      requirements,
    } as unknown as MayiThreeDivisionsNeutralAnchorAuthorityFR34V1;
    expect(() => validateMayiThreeDivisionsNeutralAnchorAuthorityFR34(invalid)).toThrow(/cannot promote hairline/u);
  });

  it('fails closed if any authority boundary shortcut is enabled', () => {
    const invalid = {
      ...MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_AUTHORITY_FR34,
      authorityBoundary: {
        ...MAYI_THREE_DIVISIONS_NEUTRAL_ANCHOR_AUTHORITY_FR34.authorityBoundary,
        directTraditionalToNeutralEquivalenceAllowed: true,
      },
    } as unknown as MayiThreeDivisionsNeutralAnchorAuthorityFR34V1;
    expect(() => validateMayiThreeDivisionsNeutralAnchorAuthorityFR34(invalid)).toThrow(/fully fail-closed/u);
  });

  it('refuses production operationalization until the next reviewed derivation/binding slice', () => {
    expect(() => assertMayiThreeDivisionsNeutralOperationalizationReadyFR34()).toThrow(
      /requirements only; reviewed neutral operationalization and production metrics remain blocked/u,
    );
  });
});
