import { describe, expect, it } from 'vitest';
import {
  CHIN_INFERIOR_NEUTRAL_VALIDATION_AUTHORITY_FR46,
  assertChinInferiorProductionReadyFR46,
  assessChinInferiorNeutralValidationReadinessFR46,
  scoreFaceOvalInferiorExtremumAgainstMentonFR46,
  validateChinInferiorIndependentAnnotationFR46,
  validateChinInferiorNeutralValidationAuthorityFR46,
  type ChinInferiorIndependentAnnotationFR46V1,
  type MediaPipeFaceOvalInferiorExtremumEvidenceFR45V1,
} from '../packages/face-reading/src/index.js';

function validAnnotation(): ChinInferiorIndependentAnnotationFR46V1 {
  return {
    subjectId: 'subject-001',
    captureId: 'capture-001',
    annotatorId: 'annotator-a',
    targetName: 'soft_tissue_menton',
    x: 0.53,
    y: 0.76,
    providerOutputVisibleDuringAnnotation: false,
    annotationFrozenBeforeProviderScoring: true,
  };
}

function validCandidate(): MediaPipeFaceOvalInferiorExtremumEvidenceFR45V1 {
  return {
    state: 'unique_image_inferior_extremum',
    algorithmRef: 'algorithm.neutral.face_oval.image_inferior_extremum.fr45@0.1.0',
    coordinateFrame: 'normalized_image_2d',
    axis: 'y',
    selectionRule: 'maximum_normalized_image_y_over_exact_face_oval_vertices',
    maxY: 0.8,
    tiedProviderLandmarkIndices: [377],
    selectedProviderLandmarkIndex: 377,
    selectedPoint: { x: 0.5, y: 0.8 },
    providerIndexSemanticAuthority: false,
    chinInferiorContourBindingAuthorized: false,
    traditionalDigeEquivalenceAuthorized: false,
    fr36VerticalReferencePromoted: false,
    productionGeometryAuthorized: false,
  };
}

describe('FR-46 soft-tissue Menton neutral validation protocol', () => {
  it('pins two independent neutral evidence records while refusing provider/traditional authority', () => {
    const authority = validateChinInferiorNeutralValidationAuthorityFR46();
    expect(authority.authorityState).toBe('soft_tissue_menton_target_supported_provider_mapping_and_contour_binding_blocked');
    expect(authority.evidence).toHaveLength(2);
    expect(authority.evidence.map((entry) => [entry.year, entry.doi, entry.pmcid])).toEqual([
      [2019, '10.1016/j.jobcr.2019.06.011', 'PMC6593212'],
      [2024, '10.1038/s41598-024-51322-1', 'PMC10827781'],
    ]);
    for (const evidence of authority.evidence) {
      expect(Object.values(evidence.targetClaims)).toEqual(Array(4).fill(true));
      expect(evidence.mediaPipeMappingSupplied).toBe(false);
      expect(evidence.providerIndexAuthoritySupplied).toBe(false);
      expect(evidence.fr35ContourDefinitionSupplied).toBe(false);
      expect(evidence.traditionalDigeAuthoritySupplied).toBe(false);
      expect(evidence.limitations.length).toBeGreaterThan(0);
    }
    expect(Object.values(authority.authorityBoundary)).toEqual(Array(12).fill(false));
  });

  it('satisfies only the external Menton target gate and keeps all mapping/calibration gates blocked', () => {
    const gates = CHIN_INFERIOR_NEUTRAL_VALIDATION_AUTHORITY_FR46.admissionGates;
    expect(gates.map((gate) => gate.gateId)).toEqual([
      'external_soft_tissue_menton_target',
      'provider_candidate_to_menton_mapping',
      'provider_candidate_midline_stability',
      'controlled_multi_subject_capture',
      'repeated_capture_repeatability',
      'pose_stability',
      'calibration_error_thresholds',
      'fr35_point_to_contour_relation',
      'traditional_dige_equivalence',
    ]);
    expect(gates[0]?.state).toBe('satisfied');
    expect(gates.slice(1).every((gate) => gate.state === 'blocked')).toBe(true);
    expect(CHIN_INFERIOR_NEUTRAL_VALIDATION_AUTHORITY_FR46.annotationProtocol.minimumSubjectCount).toBeNull();
    expect(CHIN_INFERIOR_NEUTRAL_VALIDATION_AUTHORITY_FR46.annotationProtocol.maximumAllowedError).toBeNull();
    expect(CHIN_INFERIOR_NEUTRAL_VALIDATION_AUTHORITY_FR46.annotationProtocol.repeatabilityThreshold).toBeNull();
    expect(CHIN_INFERIOR_NEUTRAL_VALIDATION_AUTHORITY_FR46.annotationProtocol.poseThreshold).toBeNull();
  });

  it('accepts only provider-blinded frozen normalized annotations', () => {
    expect(validateChinInferiorIndependentAnnotationFR46(validAnnotation())).toEqual(validAnnotation());

    const providerVisible = {
      ...validAnnotation(),
      providerOutputVisibleDuringAnnotation: true,
    } as unknown as ChinInferiorIndependentAnnotationFR46V1;
    expect(() => validateChinInferiorIndependentAnnotationFR46(providerVisible)).toThrow(/provider-blinded/);

    const notFrozen = {
      ...validAnnotation(),
      annotationFrozenBeforeProviderScoring: false,
    } as unknown as ChinInferiorIndependentAnnotationFR46V1;
    expect(() => validateChinInferiorIndependentAnnotationFR46(notFrozen)).toThrow(/provider-blinded/);

    const outOfRange = { ...validAnnotation(), y: 1.01 };
    expect(() => validateChinInferiorIndependentAnnotationFR46(outOfRange)).toThrow(/normalized image coordinate/);
  });

  it('scores FR-45 candidate against frozen Menton annotation without inventing a pass threshold', () => {
    const score = scoreFaceOvalInferiorExtremumAgainstMentonFR46(validCandidate(), validAnnotation());
    expect(score.normalizedEuclideanDistance).toBeCloseTo(0.05, 12);
    expect(score.passThreshold).toBeNull();
    expect(score.passed).toBeNull();
    expect(score.mappingValidated).toBe(false);
    expect(score.fr35ContourBindingAuthorized).toBe(false);
    expect(score.traditionalDigeEquivalenceAuthorized).toBe(false);
    expect(score.productionGeometryAuthorized).toBe(false);
  });

  it('rejects ambiguous or authority-promoted FR-45 candidates', () => {
    const ambiguous = {
      ...validCandidate(),
      state: 'ambiguous_exact_tie',
      selectedProviderLandmarkIndex: null,
      selectedPoint: null,
      tiedProviderLandmarkIndices: [152, 377],
    } as unknown as MediaPipeFaceOvalInferiorExtremumEvidenceFR45V1;
    expect(() => scoreFaceOvalInferiorExtremumAgainstMentonFR46(ambiguous, validAnnotation())).toThrow(/unique fail-closed FR-45/);

    const promoted = {
      ...validCandidate(),
      chinInferiorContourBindingAuthorized: true,
    } as unknown as MediaPipeFaceOvalInferiorExtremumEvidenceFR45V1;
    expect(() => scoreFaceOvalInferiorExtremumAgainstMentonFR46(promoted, validAnnotation())).toThrow(/unique fail-closed FR-45/);
  });

  it('keeps the point-to-contour relation explicitly unreviewed', () => {
    expect(CHIN_INFERIOR_NEUTRAL_VALIDATION_AUTHORITY_FR46.pointContourRelation).toEqual({
      pointTarget: 'soft_tissue_menton',
      fr35SurfaceId: 'neutral.face.chin_inferior_contour',
      relationState: 'blocked_contour_membership_and_derivation_rule_unreviewed',
      pointMaySubstituteForContour: false,
      extremumOfProviderFaceOvalMeansExtremumOfReviewedChinContour: false,
      reviewedContourMembershipRuleAvailable: false,
      reviewedPointFromContourDerivationAvailable: false,
    });
  });

  it('reports only target/scoring readiness and refuses all production promotion', () => {
    const readiness = assessChinInferiorNeutralValidationReadinessFR46();
    expect(readiness.externalSoftTissueMentonTargetReady).toBe(true);
    expect(readiness.independentAnnotationProtocolReady).toBe(true);
    expect(readiness.providerCandidateScoringAlgorithmReady).toBe(true);
    expect(readiness.providerCandidateToMentonMappingReady).toBe(false);
    expect(readiness.fr35PointToContourRelationReady).toBe(false);
    expect(readiness.traditionalDigeEquivalenceReady).toBe(false);
    expect(readiness.fr36VerticalReferenceReady).toBe(false);
    expect(readiness.productionGeometryReady).toBe(false);
    expect(readiness.nextRequiredEvidence).toHaveLength(5);
    expect(() => assertChinInferiorProductionReadyFR46()).toThrow(/provider mapping.*FR-35 contour relation.*地閣.*remain blocked/);
  });
});
