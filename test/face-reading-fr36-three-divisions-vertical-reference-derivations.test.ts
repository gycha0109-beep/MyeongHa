import { describe, expect, it } from 'vitest';
import {
  THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36,
  THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_CONTRACTS_FR36,
  assertThreeDivisionsVerticalReferenceDerivationsReadyFR36,
  assessThreeDivisionsVerticalReferenceDerivationReadinessFR36,
  validateThreeDivisionsVerticalReferenceDerivationAuthorityFR36,
  type ThreeDivisionsVerticalReferenceDerivationAuthorityFR36V1,
} from '../packages/face-reading/src/index.js';

describe('FR-36 Three Divisions vertical-reference derivation contracts', () => {
  it('validates seven provider-independent vertical-reference contracts', () => {
    expect(() => validateThreeDivisionsVerticalReferenceDerivationAuthorityFR36()).not.toThrow();
    expect(THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_CONTRACTS_FR36.map((entry) => entry.traditionalAnchorRef)).toEqual([
      'hairline', 'brow', 'yintang', 'shangen', 'zhuntou', 'renzhong', 'dige',
    ]);
  });

  it('keeps every output as a neutral normalized y-coordinate contract', () => {
    for (const entry of THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_CONTRACTS_FR36) {
      expect(entry.outputClass).toBe('normalized_vertical_coordinate');
      expect(entry.outputCoordinateFrame).toBe('canonical_image_normalized_2d');
      expect(entry.outputAxis).toBe('y');
      expect(entry.algorithmRef).toBeNull();
      expect(entry.formulaSpec).toBeNull();
      expect(entry.providerLandmarkRefs).toEqual([]);
      expect(entry.calibrationRefs).toEqual([]);
      expect(entry.traditionalNeutralEquivalenceAuthorized).toBe(false);
      expect(entry.sourceVariantSelectionAuthorized).toBe(false);
      expect(entry.productionUseAllowed).toBe(false);
    }
  });

  it('uses existing FR-17 blockers for brow/interbrow/nose dependencies', () => {
    const byAnchor = new Map(THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_CONTRACTS_FR36.map((entry) => [entry.traditionalAnchorRef, entry] as const));
    expect(byAnchor.get('brow')?.upstreamNeutralDerivationRefs).toEqual([
      'derivation.neutral.left_brow_curve.pending',
      'derivation.neutral.right_brow_curve.pending',
    ]);
    expect(byAnchor.get('yintang')?.upstreamNeutralDerivationRefs).toEqual(['derivation.neutral.brow_midline.pending']);
    expect(byAnchor.get('shangen')?.upstreamNeutralDerivationRefs).toEqual(['derivation.neutral.nose_region.pending']);
    expect(byAnchor.get('zhuntou')?.upstreamNeutralDerivationRefs).toEqual(['derivation.neutral.nose_region.pending']);
    for (const anchor of ['brow', 'yintang', 'shangen', 'zhuntou'] as const) {
      expect(byAnchor.get(anchor)?.reviewState).toBe('blocked_existing_neutral_derivation_and_algorithm');
    }
  });

  it('uses FR-35 extension surfaces for hairline/philtrum/chin without claiming provider binding', () => {
    const byAnchor = new Map(THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_CONTRACTS_FR36.map((entry) => [entry.traditionalAnchorRef, entry] as const));
    expect(byAnchor.get('hairline')?.inputSlots).toEqual(['neutral.face.hairline_boundary']);
    expect(byAnchor.get('renzhong')?.inputSlots).toEqual(['neutral.face.philtrum_region']);
    expect(byAnchor.get('dige')?.inputSlots).toEqual(['neutral.face.chin_inferior_contour']);
    for (const anchor of ['hairline', 'renzhong', 'dige'] as const) {
      expect(byAnchor.get(anchor)?.reviewState).toBe('blocked_extension_surface_binding_and_algorithm');
      expect(byAnchor.get(anchor)?.upstreamNeutralDerivationRefs).toEqual([]);
    }
  });

  it('reports the exact current upstream blockers and no executable FR-36 derivation', () => {
    const readiness = assessThreeDivisionsVerticalReferenceDerivationReadinessFR36();
    expect(readiness.contractCoverageComplete).toBe(true);
    expect(readiness.allSevenFR34RequirementsCovered).toBe(true);
    expect(readiness.algorithmsReviewed).toBe(false);
    expect(readiness.executableDerivationRefs).toEqual([]);
    expect(readiness.blockedByExistingNeutralDerivationRefs).toEqual([
      'derivation.neutral.left_brow_curve.pending',
      'derivation.neutral.right_brow_curve.pending',
      'derivation.neutral.brow_midline.pending',
      'derivation.neutral.nose_region.pending',
    ]);
    expect(readiness.blockedByExtensionSurfaceSlots).toEqual([
      'neutral.face.hairline_boundary',
      'neutral.face.philtrum_region',
      'neutral.face.chin_inferior_contour',
    ]);
    expect(readiness.providerLandmarkAuthorityUsed).toBe(false);
    expect(readiness.productionMetricReady).toBe(false);
  });

  it('fails closed if an unreviewed formula is injected', () => {
    const contracts = THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36.contracts.map((entry, index) =>
      index === 0 ? { ...entry, formulaSpec: 'min_y(hairline_boundary)' } : entry,
    );
    const invalid = {
      ...THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36,
      contracts,
    } as unknown as ThreeDivisionsVerticalReferenceDerivationAuthorityFR36V1;
    expect(() => validateThreeDivisionsVerticalReferenceDerivationAuthorityFR36(invalid)).toThrow(/cannot invent or promote/u);
  });

  it('fails closed if a provider landmark index is injected', () => {
    const contracts = THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36.contracts.map((entry, index) =>
      index === 4 ? { ...entry, providerLandmarkRefs: [1] } : entry,
    );
    const invalid = {
      ...THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36,
      contracts,
    } as unknown as ThreeDivisionsVerticalReferenceDerivationAuthorityFR36V1;
    expect(() => validateThreeDivisionsVerticalReferenceDerivationAuthorityFR36(invalid)).toThrow(/cannot invent or promote/u);
  });

  it('refuses Three Divisions metric promotion until derivation algorithms are reviewed', () => {
    expect(() => assertThreeDivisionsVerticalReferenceDerivationsReadyFR36()).toThrow(
      /reviewed algorithms\/provider bindings are absent; Three Divisions metrics remain blocked/u,
    );
  });
});
