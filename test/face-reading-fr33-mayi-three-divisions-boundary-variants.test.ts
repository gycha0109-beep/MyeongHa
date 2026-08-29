import { describe, expect, it } from 'vitest';
import {
  MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33,
  assessMayiThreeDivisionsBoundaryReadinessFR33,
  assertMayiThreeDivisionsBoundarySelectionReadyFR33,
  validateMayiThreeDivisionsBoundaryAuthorityFR33,
} from '../packages/face-reading/src/index.js';

describe('FR-33 Mayi Three Divisions boundary variant authority', () => {
  it('preserves six exact scan-checked clauses instead of operationalizing the legacy ellipsized composite passage', () => {
    const authority = validateMayiThreeDivisionsBoundaryAuthorityFR33();
    expect(authority.authorityState).toBe('scan_checked_multiple_boundary_variants_unresolved');
    expect(authority.legacyCompositePassageRef).toBe('passage.mayi.sancai_three_divisions.boundaries');
    expect(authority.legacyCompositeOperationalizationAllowed).toBe(false);
    expect(authority.clauses.map((entry) => ({
      id: entry.passage.passageId,
      page: entry.passage.scanPage,
      text: entry.passage.originalText,
      variant: entry.variantId,
      section: entry.section,
      from: entry.fromTraditionalAnchor,
      to: entry.toTraditionalAnchor,
    }))).toEqual([
      { id: 'passage.mayi.sancai_three_divisions.variant_a.upper', page: 35, text: '三停者髮際至印堂為上停', variant: 'mayi_sancai_noncontiguous', section: 'upper', from: 'hairline', to: 'yintang' },
      { id: 'passage.mayi.sancai_three_divisions.variant_a.middle', page: 35, text: '自山根至準頭為中停', variant: 'mayi_sancai_noncontiguous', section: 'middle', from: 'shangen', to: 'zhuntou' },
      { id: 'passage.mayi.sancai_three_divisions.variant_a.lower', page: 35, text: '自人中至地閣為下停', variant: 'mayi_sancai_noncontiguous', section: 'lower', from: 'renzhong', to: 'dige' },
      { id: 'passage.mayi.sancai_three_divisions.variant_b.upper', page: 35, text: '自髮際至眉為上停', variant: 'mayi_face_contiguous', section: 'upper', from: 'hairline', to: 'brow' },
      { id: 'passage.mayi.sancai_three_divisions.variant_b.middle', page: 36, text: '眉至準頭為中停', variant: 'mayi_face_contiguous', section: 'middle', from: 'brow', to: 'zhuntou' },
      { id: 'passage.mayi.sancai_three_divisions.variant_b.lower', page: 36, text: '準至地閣為下停', variant: 'mayi_face_contiguous', section: 'lower', from: 'zhuntou', to: 'dige' },
    ]);
  });

  it('keeps the two source formulations as different methodology-owned map candidates', () => {
    const authority = MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33;
    expect(authority.variants).toHaveLength(2);
    expect(authority.variants[0]).toMatchObject({
      variantId: 'mayi_sancai_noncontiguous',
      continuity: 'non_contiguous_source_formula',
      spans: [
        { section: 'upper', fromTraditionalAnchor: 'hairline', toTraditionalAnchor: 'yintang' },
        { section: 'middle', fromTraditionalAnchor: 'shangen', toTraditionalAnchor: 'zhuntou' },
        { section: 'lower', fromTraditionalAnchor: 'renzhong', toTraditionalAnchor: 'dige' },
      ],
    });
    expect(authority.variants[1]).toMatchObject({
      variantId: 'mayi_face_contiguous',
      continuity: 'contiguous_face_formula',
      spans: [
        { section: 'upper', fromTraditionalAnchor: 'hairline', toTraditionalAnchor: 'brow' },
        { section: 'middle', fromTraditionalAnchor: 'brow', toTraditionalAnchor: 'zhuntou' },
        { section: 'lower', fromTraditionalAnchor: 'zhuntou', toTraditionalAnchor: 'dige' },
      ],
    });
  });

  it('fails closed until one boundary formulation has an explicit reviewed selection policy', () => {
    const authority = MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33;
    expect(authority.selectionPolicy).toEqual({
      status: 'unresolved',
      selectedVariantId: null,
      productionRegionMapAllowed: false,
      productionMetricAllowed: false,
      productionF1Allowed: false,
      productionF6Allowed: false,
    });
    expect(() => assertMayiThreeDivisionsBoundarySelectionReadyFR33()).toThrow(/selection is unresolved/u);

    const readiness = assessMayiThreeDivisionsBoundaryReadinessFR33();
    expect(readiness.scanCheckedBoundaryClausesReady).toBe(true);
    expect(readiness.multipleBoundaryVariantsPreserved).toBe(true);
    expect(readiness.singleBoundaryVariantSelected).toBe(false);
    expect(readiness.productionRegionMapReady).toBe(false);
    expect(readiness.productionMetricReady).toBe(false);
    expect(readiness.productionF1Ready).toBe(false);
    expect(readiness.productionF6Ready).toBe(false);
  });

  it('does not invent a 三停平等 tolerance or provider landmark authority', () => {
    const authority = MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33;
    expect(authority.calibrationBoundary).toEqual({
      nearEqualTolerance: null,
      nearEqualClassificationAllowed: false,
    });
    expect(authority.observationBoundary).toEqual({
      neutralAnchorOperationalizationReady: false,
      providerLandmarkIndexAuthorityAllowed: false,
      crossMethodBoundaryNormalizationAllowed: false,
    });
  });

  it('rejects silently selecting a boundary variant while FR-33 remains unresolved', () => {
    const authority = MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33;
    expect(() => validateMayiThreeDivisionsBoundaryAuthorityFR33({
      ...authority,
      selectionPolicy: {
        ...authority.selectionPolicy,
        selectedVariantId: 'mayi_face_contiguous',
      },
    } as never)).toThrow(/selection must remain unresolved/u);
  });

  it('rejects changing a scan-checked clause or normalizing its traditional anchors', () => {
    const authority = MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33;
    const changedText = authority.clauses.map((entry, index) => index === 0
      ? { ...entry, passage: { ...entry.passage, originalText: '自髮際至眉為上停' } }
      : entry);
    expect(() => validateMayiThreeDivisionsBoundaryAuthorityFR33({ ...authority, clauses: changedText } as never))
      .toThrow(/clause drift/u);

    const changedVariant = authority.variants.map((variant, index) => index === 0
      ? {
          ...variant,
          spans: variant.spans.map((span, spanIndex) => spanIndex === 0
            ? { ...span, toTraditionalAnchor: 'brow' }
            : span),
        }
      : variant);
    expect(() => validateMayiThreeDivisionsBoundaryAuthorityFR33({ ...authority, variants: changedVariant } as never))
      .toThrow(/normalization is unauthorized/u);
  });

  it('rejects using the legacy composite, arbitrary tolerance, or provider indices as a production shortcut', () => {
    const authority = MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33;
    expect(() => validateMayiThreeDivisionsBoundaryAuthorityFR33({
      ...authority,
      legacyCompositeOperationalizationAllowed: true,
    } as never)).toThrow(/cannot authorize operationalization/u);
    expect(() => validateMayiThreeDivisionsBoundaryAuthorityFR33({
      ...authority,
      calibrationBoundary: { nearEqualTolerance: 0.05, nearEqualClassificationAllowed: true },
    } as never)).toThrow(/numeric tolerance/u);
    expect(() => validateMayiThreeDivisionsBoundaryAuthorityFR33({
      ...authority,
      observationBoundary: { ...authority.observationBoundary, providerLandmarkIndexAuthorityAllowed: true },
    } as never)).toThrow(/neutral\/provider authority/u);
  });
});
