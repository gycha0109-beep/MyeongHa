import { describe, expect, it } from 'vitest';
import {
  CHIN_INFERIOR_CONTOUR_SCOPE_AUTHORITY_FR51,
  assessChinInferiorContourScopeReadinessFR51,
  assertChinInferiorContourScopeReadyForProductionFR51,
  deriveScopeCompatibleCentralChinScaffoldFR51,
  validateChinInferiorContourScopeAuthorityFR51,
  type ChinInferiorContourScopeAuthorityFR51V1,
  type IndependentCentralChinScaffoldAnnotationFR50V1,
} from '../packages/face-reading/src/index.js';

function annotation(): IndependentCentralChinScaffoldAnnotationFR50V1 {
  return {
    schemaVersion: 'fr50-independent-central-chin-scaffold-v1',
    subjectId: 'subject-fr51-001',
    captureId: 'capture-fr51-001',
    annotatorId: 'annotator-fr51-001',
    coordinateFrame: 'normalized_image_2d',
    leftCheilion: { x: 0.34, y: 0.61 },
    leftMentonSide: { x: 0.34, y: 0.82 },
    softTissueMenton: { x: 0.5, y: 0.85 },
    rightMentonSide: { x: 0.66, y: 0.82 },
    rightCheilion: { x: 0.66, y: 0.61 },
    providerOutputVisibleDuringAnnotation: false,
    annotationFrozenBeforeProviderScoring: true,
    traditionalLabelVisibleDuringAnnotation: false,
  };
}

describe('FR-51 chin inferior contour scope adjudication', () => {
  it('selects the central inferior soft-tissue chin boundary as the FR-35 anatomical scope class', () => {
    const authority = validateChinInferiorContourScopeAuthorityFR51();
    expect(authority).toBe(CHIN_INFERIOR_CONTOUR_SCOPE_AUTHORITY_FR51);
    expect(authority.scopeDecision.selectedScopeClass).toBe('central_inferior_soft_tissue_chin_boundary');
    expect(authority.scopeDecision.selectionState).toBe('scope_class_selected_exact_curve_geometry_pending');
    expect(authority.scopeDecision.traditionalConsumerScopeEvidenceSufficient).toBe(true);
    expect(authority.scopeDecision.modernNeutralScopeCompatibilityEvidenceSufficient).toBe(true);
  });

  it('preserves the traditional evidence that 地閣 is centered on 頦 while bilateral/lateral lower-face areas are separately named', () => {
    const evidence = CHIN_INFERIOR_CONTOUR_SCOPE_AUTHORITY_FR51.evidence;
    expect(evidence).toHaveLength(6);
    expect(evidence[0]?.supports.digeCenteredOnKeChin).toBe(true);
    expect(evidence[1]?.supports.digeLocatedBelowChengjiangWithinYiKeChinArea).toBe(true);
    expect(evidence[1]?.supports.bilateralYiOrLateralLowerFaceTreatedSeparately).toBe(true);
    expect(evidence[2]?.supports.bilateralYiOrLateralLowerFaceTreatedSeparately).toBe(true);
    expect(evidence[3]?.supports.historicalDigeKeChinTerminology).toBe(true);
  });

  it('uses modern morphometrics to distinguish a central Menton-side scaffold from broader lower-jawline constructs', () => {
    const evidence = CHIN_INFERIOR_CONTOUR_SCOPE_AUTHORITY_FR51.evidence;
    expect(evidence[4]?.supports.centralMentonSideScaffoldDistinctFromGonion).toBe(true);
    expect(evidence[5]?.supports.broaderLowerJawlineOperationalizationDistinct).toBe(true);
    const decision = CHIN_INFERIOR_CONTOUR_SCOPE_AUTHORITY_FR51.scopeDecision;
    expect(decision.broaderOtobasionToMentonLowerJawlineRejectedAsFR35ConsumerScope).toBe(true);
    expect(decision.mandibularAngleGonionRejectedAsRequiredFR35Endpoint).toBe(true);
    expect(decision.softTissueMentonRequiredAsInferiorMidlineAnchor).toBe(true);
  });

  it('admits the FR-50 Menton-side scaffold only as scope-compatible research geometry', () => {
    const candidate = deriveScopeCompatibleCentralChinScaffoldFR51(annotation());
    expect(candidate.selectedScopeClass).toBe('central_inferior_soft_tissue_chin_boundary');
    expect(candidate.geometry.kind).toBe('curve');
    expect(candidate.geometry.points).toEqual([
      { x: 0.34, y: 0.82 },
      { x: 0.5, y: 0.85 },
      { x: 0.66, y: 0.82 },
    ]);
    expect(candidate.pointOrder).toEqual(['left_menton_side', 'soft_tissue_menton', 'right_menton_side']);
    expect(candidate.compatibilityState).toBe('compatible_with_selected_scope_class_not_exact_lateral_endpoints_or_dense_curve');
    expect(candidate.exactFR35CurveAuthorized).toBe(false);
    expect(candidate.exactLateralEndpointsAuthorized).toBe(false);
    expect(candidate.providerMappingAuthorized).toBe(false);
    expect(candidate.traditionalDigeEquivalenceAuthorized).toBe(false);
    expect(candidate.productionGeometryAuthorized).toBe(false);
  });

  it('inherits FR-50 provider-blind and frozen annotation requirements', () => {
    const base = annotation();
    expect(() => deriveScopeCompatibleCentralChinScaffoldFR51({
      ...base,
      providerOutputVisibleDuringAnnotation: true as false,
    })).toThrow(/provider-blind traditional-label-blind independent scaffold annotation/u);
    expect(() => deriveScopeCompatibleCentralChinScaffoldFR51({
      ...base,
      annotationFrozenBeforeProviderScoring: false as true,
    })).toThrow(/provider-blind traditional-label-blind independent scaffold annotation/u);
    expect(() => deriveScopeCompatibleCentralChinScaffoldFR51({
      ...base,
      softTissueMenton: { x: 0.5, y: 1.1 },
    })).toThrow(/finite normalized coordinates/u);
  });

  it('does not invent exact endpoints, interpolation, smoothing, provider subset, sample minimum, or contour tolerance', () => {
    const protocol = CHIN_INFERIOR_CONTOUR_SCOPE_AUTHORITY_FR51.researchProtocol;
    expect(protocol.endpointSelectionRule).toBeNull();
    expect(protocol.interpolationMethod).toBeNull();
    expect(protocol.smoothingMethod).toBeNull();
    expect(protocol.providerSubsetRule).toBeNull();
    expect(protocol.minimumSubjectCount).toBeNull();
    expect(protocol.maximumAllowedContourError).toBeNull();
  });

  it('rejects any attempt to widen the selected scope class through authority mutation', () => {
    const mutated = {
      ...CHIN_INFERIOR_CONTOUR_SCOPE_AUTHORITY_FR51,
      scopeDecision: {
        ...CHIN_INFERIOR_CONTOUR_SCOPE_AUTHORITY_FR51.scopeDecision,
        selectedScopeClass: 'broader_lower_jawline',
      },
    } as unknown as ChinInferiorContourScopeAuthorityFR51V1;
    expect(() => validateChinInferiorContourScopeAuthorityFR51(mutated)).toThrow(/scope adjudication boundary drift/u);
  });

  it('opens only scope-class readiness while exact geometry, provider mapping, traditional equivalence, and production stay blocked', () => {
    const readiness = assessChinInferiorContourScopeReadinessFR51();
    expect(readiness.traditionalConsumerScopeEvidenceReady).toBe(true);
    expect(readiness.modernNeutralScopeCompatibilityEvidenceReady).toBe(true);
    expect(readiness.fr35AnatomicalScopeClassReady).toBe(true);
    expect(readiness.selectedCentralInferiorChinScopeReady).toBe(true);
    expect(readiness.fr50SparseScaffoldScopeCompatibilityReady).toBe(true);
    expect(readiness.exactLateralEndpointRuleReady).toBe(false);
    expect(readiness.denseContinuousCurveReady).toBe(false);
    expect(readiness.canonicalImage2DExtractionReady).toBe(false);
    expect(readiness.providerMappingReady).toBe(false);
    expect(readiness.traditionalDigeCurveEquivalenceReady).toBe(false);
    expect(readiness.productionGeometryReady).toBe(false);
    expect(Object.values(CHIN_INFERIOR_CONTOUR_SCOPE_AUTHORITY_FR51.authorityBoundary).every((value) => value === false)).toBe(true);
    expect(() => assertChinInferiorContourScopeReadyForProductionFR51()).toThrow(/exact endpoints, dense curve geometry/u);
  });
});
