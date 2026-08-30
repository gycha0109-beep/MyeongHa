import { describe, expect, it } from 'vitest';
import {
  PROVIDER_INDEPENDENT_CHIN_CONTOUR_GEOMETRY_AUTHORITY_FR50,
  assessProviderIndependentChinContourGeometryReadinessFR50,
  assertProviderIndependentChinContourGeometryReadyForProductionFR50,
  deriveCentralChinInferiorSparseScaffoldFR50,
  validateProviderIndependentChinContourGeometryAuthorityFR50,
  type IndependentCentralChinScaffoldAnnotationFR50V1,
} from '../packages/face-reading/src/index.js';

function annotation(): IndependentCentralChinScaffoldAnnotationFR50V1 {
  return {
    schemaVersion: 'fr50-independent-central-chin-scaffold-v1',
    subjectId: 'subject-fr50-001',
    captureId: 'capture-fr50-001',
    annotatorId: 'annotator-fr50-001',
    coordinateFrame: 'normalized_image_2d',
    leftCheilion: { x: 0.35, y: 0.61 },
    leftMentonSide: { x: 0.35, y: 0.81 },
    softTissueMenton: { x: 0.5, y: 0.84 },
    rightMentonSide: { x: 0.65, y: 0.81 },
    rightCheilion: { x: 0.65, y: 0.61 },
    providerOutputVisibleDuringAnnotation: false,
    annotationFrozenBeforeProviderScoring: true,
    traditionalLabelVisibleDuringAnnotation: false,
  };
}

describe('FR-50 provider-independent chin contour geometry', () => {
  it('admits three distinct provider-independent contour operationalization families without collapsing them', () => {
    const authority = validateProviderIndependentChinContourGeometryAuthorityFR50();
    expect(authority).toBe(PROVIDER_INDEPENDENT_CHIN_CONTOUR_GEOMETRY_AUTHORITY_FR50);
    expect(authority.evidence).toHaveLength(3);
    expect(authority.evidence.map((entry) => entry.sourceScope)).toEqual([
      'three_dimensional_surface_curve_semilandmarks',
      'three_dimensional_frontal_chin_scaffold',
      'three_dimensional_lower_face_contour_sampling',
    ]);
    expect(authority.relation.multipleOperationalizationFamiliesMustRemainDistinct).toBe(true);
  });

  it('records evidence for a lower-jawline curve, plane-sampled contour, and bilateral central-chin scaffold', () => {
    const relation = PROVIDER_INDEPENDENT_CHIN_CONTOUR_GEOMETRY_AUTHORITY_FR50.relation;
    expect(relation.providerIndependentContourOperationalizationEvidenceAvailable).toBe(true);
    expect(relation.lowerJawlineSurfaceCurveRepresentationSupported).toBe(true);
    expect(relation.lowerFaceContourSamplingAcrossPredefinedPlanesSupported).toBe(true);
    expect(relation.centralChinBilateralScaffoldSupported).toBe(true);
    expect(relation.softTissueMentonIsInferiorChinBoundaryMemberSupported).toBe(true);
  });

  it('does not claim any reviewed operationalization equals the unresolved FR-35 curve', () => {
    const relation = PROVIDER_INDEPENDENT_CHIN_CONTOUR_GEOMETRY_AUTHORITY_FR50.relation;
    expect(relation.fr35ExactChinInferiorContourScopeEstablished).toBe(false);
    expect(relation.fr35ExactContourGeometryEstablished).toBe(false);
    expect(relation.citedLowerJawlineCurveEqualsFR35ChinInferiorContour).toBe(false);
    expect(relation.citedPlaneSampledContourEqualsFR35ChinInferiorContour).toBe(false);
    expect(relation.sparseCentralScaffoldEqualsFullContour).toBe(false);
    expect(relation.canonicalImage2DProjectionRuleEstablished).toBe(false);
  });

  it('derives only the sparse left-menton-side -> Menton -> right-menton-side research scaffold', () => {
    const candidate = deriveCentralChinInferiorSparseScaffoldFR50(annotation());
    expect(candidate.geometry.kind).toBe('curve');
    expect(candidate.geometry.points).toEqual([
      { x: 0.35, y: 0.81 },
      { x: 0.5, y: 0.84 },
      { x: 0.65, y: 0.81 },
    ]);
    expect(candidate.pointOrder).toEqual(['left_menton_side', 'soft_tissue_menton', 'right_menton_side']);
    expect(candidate.cheilionVerticalDefinitionPreservedAsAnnotationInstruction).toBe(true);
    expect(candidate.cheilionVerticalDefinitionMachineVerified).toBe(false);
    expect(candidate.interpolationAuthorized).toBe(false);
    expect(candidate.smoothingAuthorized).toBe(false);
    expect(candidate.fullFR35ContourBindingAuthorized).toBe(false);
    expect(candidate.providerMappingAuthorized).toBe(false);
    expect(candidate.traditionalDigeEquivalenceAuthorized).toBe(false);
    expect(candidate.productionGeometryAuthorized).toBe(false);
  });

  it('rejects provider-visible, unfrozen, traditional-label-visible, or malformed annotations', () => {
    const base = annotation();
    expect(() => deriveCentralChinInferiorSparseScaffoldFR50({
      ...base,
      providerOutputVisibleDuringAnnotation: true as false,
    })).toThrow(/provider-blind traditional-label-blind independent scaffold annotation/u);
    expect(() => deriveCentralChinInferiorSparseScaffoldFR50({
      ...base,
      annotationFrozenBeforeProviderScoring: false as true,
    })).toThrow(/provider-blind traditional-label-blind independent scaffold annotation/u);
    expect(() => deriveCentralChinInferiorSparseScaffoldFR50({
      ...base,
      traditionalLabelVisibleDuringAnnotation: true as false,
    })).toThrow(/provider-blind traditional-label-blind independent scaffold annotation/u);
    expect(() => deriveCentralChinInferiorSparseScaffoldFR50({
      ...base,
      softTissueMenton: { x: 0.5, y: 1.01 },
    })).toThrow(/finite normalized coordinates/u);
  });

  it('does not invent sample minimums, geometric tolerances, interpolation, or smoothing', () => {
    const protocol = PROVIDER_INDEPENDENT_CHIN_CONTOUR_GEOMETRY_AUTHORITY_FR50.researchScaffoldProtocol;
    expect(protocol.minimumSubjectCount).toBeNull();
    expect(protocol.pointAlignmentTolerance).toBeNull();
    expect(protocol.interpolationMethod).toBeNull();
    expect(protocol.smoothingMethod).toBeNull();
  });

  it('opens research acquisition while every provider/traditional/production authority stays fail-closed', () => {
    const readiness = assessProviderIndependentChinContourGeometryReadinessFR50();
    expect(readiness.providerIndependentContourEvidenceReady).toBe(true);
    expect(readiness.lowerJawlineSurfaceCurveEvidenceReady).toBe(true);
    expect(readiness.lowerFacePlaneSampledContourEvidenceReady).toBe(true);
    expect(readiness.centralChinSparseScaffoldProtocolReady).toBe(true);
    expect(readiness.fr35ExactContourScopeReady).toBe(false);
    expect(readiness.fr35ExactContourGeometryReady).toBe(false);
    expect(readiness.canonicalImage2DProjectionReady).toBe(false);
    expect(readiness.providerMappingReady).toBe(false);
    expect(readiness.productionGeometryReady).toBe(false);
    expect(Object.values(PROVIDER_INDEPENDENT_CHIN_CONTOUR_GEOMETRY_AUTHORITY_FR50.authorityBoundary).every((value) => value === false)).toBe(true);
    expect(() => assertProviderIndependentChinContourGeometryReadyForProductionFR50()).toThrow(/production geometry remain blocked/u);
  });
});
