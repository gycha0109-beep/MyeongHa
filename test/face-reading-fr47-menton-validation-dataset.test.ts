import { describe, expect, it } from 'vitest';
import {
  MENTON_VALIDATION_DATASET_AUTHORITY_FR47,
  assertMentonValidationDatasetReadyForProductionFR47,
  assessMentonValidationDatasetReadinessFR47,
  validateMentonValidationDatasetAuthorityFR47,
  validateMentonValidationDatasetFR47,
  type MentonIndependentAnnotationRecordFR47V1,
  type MentonValidationCaptureFR47V1,
  type MentonValidationDatasetFR47V1,
  type MentonValidationSubjectFR47V1,
} from '../packages/face-reading/src/index.js';

const STRATA = [
  'neutral_frontal_baseline',
  'repeat_neutral_capture',
  'pose_yaw_perturbation',
  'pose_pitch_perturbation',
  'pose_roll_perturbation',
] as const;

function capture(subjectRef: string, stratum: typeof STRATA[number], ordinal: number): MentonValidationCaptureFR47V1 {
  const poseAxis = stratum === 'pose_yaw_perturbation' ? 'yaw' :
    stratum === 'pose_pitch_perturbation' ? 'pitch' :
      stratum === 'pose_roll_perturbation' ? 'roll' : null;
  const poseDegrees = poseAxis === 'yaw' ? 10 : poseAxis === 'pitch' ? -8 : poseAxis === 'roll' ? 6 : null;
  const captureRef = `${subjectRef}-${stratum}`;
  return {
    captureRef,
    subjectRef,
    stratum,
    canonicalAssetDigest: `sha256:${subjectRef}-${ordinal}`,
    capturedAt: `2026-08-29T12:${String(ordinal).padStart(2, '0')}:00Z`,
    imageWidth: 1080,
    imageHeight: 1440,
    deviceRef: 'device-test-01',
    physicalCaptureInstanceRef: `physical-${subjectRef}-${ordinal}`,
    neutralExpressionApplied: true,
    headPositionInstructionApplied: true,
    poseAxis,
    poseDegrees,
    groundTruthLockedBeforeProviderRun: true,
    providerRunRef: `provider-run-${captureRef}`,
    providerRunExecutedAfterGroundTruthLock: true,
  };
}

function completeDataset(): MentonValidationDatasetFR47V1 {
  const subjects: readonly MentonValidationSubjectFR47V1[] = [
    { subjectRef: 'subject-calibration', independentSubject: true, partition: 'calibration' },
    { subjectRef: 'subject-holdout', independentSubject: true, partition: 'holdout' },
  ];
  const captures = subjects.flatMap((subject, subjectIndex) =>
    STRATA.map((stratum, stratumIndex) => capture(subject.subjectRef, stratum, subjectIndex * 10 + stratumIndex)),
  );
  const annotations: readonly MentonIndependentAnnotationRecordFR47V1[] = captures.map((item, index) => ({
    captureRef: item.captureRef,
    annotatorRef: `annotator-${index % 2}`,
    targetName: 'soft_tissue_menton',
    x: 0.5 + index * 0.001,
    y: 0.75 + index * 0.001,
    providerOutputVisibleDuringAnnotation: false,
    annotationFrozenBeforeProviderScoring: true,
  }));
  return {
    schemaVersion: 'fr47-dataset-v1',
    datasetRef: 'dataset.menton.synthetic.complete',
    subjects,
    captures,
    annotations,
    groundTruthFrozen: true,
    providerRunsExecutedAfterFreeze: true,
  };
}

describe('FR-47 provider-blind Menton validation dataset contract', () => {
  it('defines subject-level calibration/holdout and five required physical-capture strata without inventing thresholds', () => {
    const authority = validateMentonValidationDatasetAuthorityFR47();
    expect(authority.authorityState).toBe('dataset_contract_defined_no_reviewed_dataset');
    expect(authority.protocol.requiredPartitions).toEqual(['calibration', 'holdout']);
    expect(authority.protocol.subjectLevelPartitionRequired).toBe(true);
    expect(authority.protocol.subjectMayAppearInMultiplePartitions).toBe(false);
    expect(authority.protocol.requiredCaptureStrata).toEqual(STRATA);
    expect(authority.protocol.providerIndexMayDefineGroundTruth).toBe(false);
    expect(authority.protocol.fr45ObservedIndex152MayDefineGroundTruth).toBe(false);
    expect([
      authority.protocol.minimumSubjects,
      authority.protocol.minimumCapturesPerStratum,
      authority.protocol.minimumIndependentAnnotatorsPerCapture,
      authority.protocol.maximumPointError,
      authority.protocol.repeatabilityErrorThreshold,
      authority.protocol.poseErrorThreshold,
      authority.protocol.allowedPoseMagnitudeDegrees,
    ]).toEqual(Array(7).fill(null));
    expect(Object.values(authority.authorityBoundary)).toEqual(Array(16).fill(false));
  });

  it('reports a missing dataset without promoting any FR-46 gate', () => {
    const readiness = assessMentonValidationDatasetReadinessFR47(null);
    expect(readiness.protocolDefined).toBe(true);
    expect(readiness.validationDatasetPresent).toBe(false);
    expect(readiness.providerCandidateToMentonMappingValidated).toBe(false);
    expect(readiness.calibrationThresholdsDefined).toBe(false);
    expect(readiness.fr35PointToContourRelationValidated).toBe(false);
    expect(readiness.traditionalDigeEquivalenceValidated).toBe(false);
    expect(readiness.productionGeometryAuthorized).toBe(false);
    expect(readiness.blockers).toContain('validation_dataset_missing');
  });

  it('accepts a structurally complete synthetic dataset but still refuses mapping/stability/calibration authority', () => {
    const dataset = validateMentonValidationDatasetFR47(completeDataset());
    expect(dataset.captures).toHaveLength(10);
    expect(dataset.annotations).toHaveLength(10);

    const readiness = assessMentonValidationDatasetReadinessFR47(dataset);
    expect(readiness.validationDatasetPresent).toBe(true);
    expect(readiness.calibrationPartitionPresent).toBe(true);
    expect(readiness.holdoutPartitionPresent).toBe(true);
    expect(readiness.allSubjectsHaveRequiredCaptureStrata).toBe(true);
    expect(readiness.distinctRepeatedPhysicalCaptureEvidencePresentForEverySubject).toBe(true);
    expect(readiness.allPoseAxesLabeledForEverySubject).toBe(true);
    expect(readiness.independentMentonAnnotationPresentForEveryCapture).toBe(true);
    expect(readiness.groundTruthFrozenBeforeProviderRun).toBe(true);
    expect(readiness.providerOutputPresentForEveryCapture).toBe(true);
    expect(readiness.providerCandidateToMentonMappingValidated).toBe(false);
    expect(readiness.repeatedCaptureRepeatabilityValidated).toBe(false);
    expect(readiness.poseStabilityValidated).toBe(false);
    expect(readiness.calibrationThresholdsDefined).toBe(false);
    expect(readiness.researchCandidateAdmitted).toBe(false);
    expect(readiness.productionGeometryAuthorized).toBe(false);
    expect(readiness.blockers).toEqual([
      'provider_candidate_to_menton_mapping_not_yet_scored',
      'repeatability_not_yet_scored',
      'pose_stability_not_yet_scored',
      'calibration_thresholds_unreviewed',
      'fr35_point_to_contour_relation_unreviewed',
      'traditional_dige_equivalence_unreviewed',
    ]);
  });

  it('rejects a fake repeat that reuses the same physical capture identity', () => {
    const dataset = completeDataset();
    const captures = [...dataset.captures];
    const baselineIndex = captures.findIndex((item) => item.subjectRef === 'subject-calibration' && item.stratum === 'neutral_frontal_baseline');
    const repeatIndex = captures.findIndex((item) => item.subjectRef === 'subject-calibration' && item.stratum === 'repeat_neutral_capture');
    captures[repeatIndex] = { ...captures[repeatIndex]!, physicalCaptureInstanceRef: captures[baselineIndex]!.physicalCaptureInstanceRef };
    expect(() => validateMentonValidationDatasetFR47({ ...dataset, captures })).toThrow(/physical capture instance refs must be unique/);
  });

  it('rejects unlabeled pose perturbations and provider-run ordering drift', () => {
    const dataset = completeDataset();
    const captures = [...dataset.captures];
    const yawIndex = captures.findIndex((item) => item.stratum === 'pose_yaw_perturbation');
    captures[yawIndex] = { ...captures[yawIndex]!, poseDegrees: null } as unknown as MentonValidationCaptureFR47V1;
    expect(() => validateMentonValidationDatasetFR47({ ...dataset, captures })).toThrow(/requires labeled non-zero signed yaw degrees/);

    const providerDrift = [...dataset.captures];
    providerDrift[0] = { ...providerDrift[0]!, providerRunExecutedAfterGroundTruthLock: false };
    expect(() => validateMentonValidationDatasetFR47({ ...dataset, captures: providerDrift })).toThrow(/provider run must occur after ground-truth lock/);
  });

  it('rejects provider-visible annotation and missing annotation before claimed provider execution', () => {
    const dataset = completeDataset();
    const annotations = [...dataset.annotations];
    annotations[0] = { ...annotations[0]!, providerOutputVisibleDuringAnnotation: true } as unknown as MentonIndependentAnnotationRecordFR47V1;
    expect(() => validateMentonValidationDatasetFR47({ ...dataset, annotations })).toThrow(/provider-blinded/);

    expect(() => validateMentonValidationDatasetFR47({ ...dataset, annotations: dataset.annotations.slice(1) })).toThrow(/cannot precede independent annotation coverage/);
  });

  it('keeps production geometry fail-closed even after a structurally complete dataset', () => {
    expect(MENTON_VALIDATION_DATASET_AUTHORITY_FR47.authorityBoundary.observedIndex152MayDefineMenton).toBe(false);
    expect(MENTON_VALIDATION_DATASET_AUTHORITY_FR47.authorityBoundary.mentonPointMaySubstituteForFR35Contour).toBe(false);
    expect(() => assertMentonValidationDatasetReadyForProductionFR47()).toThrow(/no reviewed dataset.*calibration thresholds.*FR-35 contour relation.*地閣 equivalence/);
  });
});
