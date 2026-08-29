import { describe, expect, it } from 'vitest';
import {
  MENTON_PREREGISTERED_SCORING_AUTHORITY_FR48,
  assertMentonScoringReadyForProductionFR48,
  buildMentonPreregisteredScoringReportFR48,
  validateMentonPreregisteredScoringAuthorityFR48,
  type MediaPipeFaceOvalInferiorExtremumEvidenceFR45V1,
  type MentonIndependentAnnotationRecordFR47V1,
  type MentonProviderCandidateRecordFR48V1,
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
  const annotations: readonly MentonIndependentAnnotationRecordFR47V1[] = captures.flatMap((item, index) => [
    {
      captureRef: item.captureRef,
      annotatorRef: `annotator-a-${index}`,
      targetName: 'soft_tissue_menton',
      x: 0.5 + index * 0.001,
      y: 0.75 + index * 0.001,
      providerOutputVisibleDuringAnnotation: false,
      annotationFrozenBeforeProviderScoring: true,
    },
    {
      captureRef: item.captureRef,
      annotatorRef: `annotator-b-${index}`,
      targetName: 'soft_tissue_menton',
      x: 0.502 + index * 0.001,
      y: 0.752 + index * 0.001,
      providerOutputVisibleDuringAnnotation: false,
      annotationFrozenBeforeProviderScoring: true,
    },
  ]);
  return {
    schemaVersion: 'fr47-dataset-v1',
    datasetRef: 'dataset.menton.synthetic.fr48',
    subjects,
    captures,
    annotations,
    groundTruthFrozen: true,
    providerRunsExecutedAfterFreeze: true,
  };
}

function candidate(x: number, y: number, index = 152): MediaPipeFaceOvalInferiorExtremumEvidenceFR45V1 {
  return {
    state: 'unique_image_inferior_extremum',
    algorithmRef: 'algorithm.neutral.face_oval.image_inferior_extremum.fr45@0.1.0',
    coordinateFrame: 'normalized_image_2d',
    axis: 'y',
    selectionRule: 'maximum_normalized_image_y_over_exact_face_oval_vertices',
    maxY: y,
    tiedProviderLandmarkIndices: [index],
    selectedProviderLandmarkIndex: index,
    selectedPoint: { x, y },
    providerIndexSemanticAuthority: false,
    chinInferiorContourBindingAuthorized: false,
    traditionalDigeEquivalenceAuthorized: false,
    fr36VerticalReferencePromoted: false,
    productionGeometryAuthorized: false,
  };
}

function candidates(dataset: MentonValidationDatasetFR47V1): readonly MentonProviderCandidateRecordFR48V1[] {
  return dataset.captures.map((captureItem, index) => ({
    captureRef: captureItem.captureRef,
    providerRunRef: captureItem.providerRunRef!,
    candidate: candidate(0.501 + index * 0.001, 0.751 + index * 0.001),
  }));
}

describe('FR-48 preregistered Menton scoring/calibration contract', () => {
  it('pins descriptive metrics while keeping all acceptance thresholds unset', () => {
    const authority = validateMentonPreregisteredScoringAuthorityFR48();
    expect(authority.authorityState).toBe('scoring_preregistered_thresholds_unset_no_reviewed_results');
    expect(authority.metricContract.candidateToMentonPointError).toBe('normalized_euclidean_l2_per_independent_annotation');
    expect(authority.metricContract.partitionReporting).toBe('calibration_and_holdout_reported_separately');
    expect(authority.metricContract.holdoutMayTuneThresholds).toBe(false);
    expect(Object.values(authority.acceptanceThresholds)).toEqual(Array(6).fill(null));
    expect(Object.values(authority.authorityBoundary)).toEqual(Array(16).fill(false));
  });

  it('builds deterministic descriptive capture/repeat/pose summaries without producing pass-fail authority', () => {
    const dataset = completeDataset();
    const report = buildMentonPreregisteredScoringReportFR48(dataset, candidates(dataset));
    expect(report.captureScores).toHaveLength(10);
    expect(report.repeatabilityScores).toHaveLength(2);
    expect(report.poseScores).toHaveLength(6);
    expect(report.calibrationSummary.subjectCount).toBe(1);
    expect(report.holdoutSummary.subjectCount).toBe(1);
    expect(report.calibrationSummary.captureCount).toBe(5);
    expect(report.holdoutSummary.captureCount).toBe(5);
    expect(report.captureScores.every((score) => score.annotationCount === 2)).toBe(true);
    expect(report.captureScores.every((score) => score.meanMentonPointError > 0)).toBe(true);
    expect(report.captureScores.every((score) => score.providerIndexSemanticAuthority === false)).toBe(true);
    expect(report.captureScores.every((score) => score.mappingPassFailDecision === null)).toBe(true);
    expect(report.repeatabilityScores.every((score) => score.repeatabilityPassFailDecision === null)).toBe(true);
    expect(report.poseScores.every((score) => score.posePassFailDecision === null)).toBe(true);
    expect(report.thresholdProposalGenerated).toBe(false);
    expect(report.holdoutUsedForThresholdTuning).toBe(false);
    expect(report.providerCandidateToMentonMappingValidated).toBe(false);
    expect(report.researchCandidateAdmitted).toBe(false);
    expect(report.productionGeometryAuthorized).toBe(false);
  });

  it('keeps calibration and holdout summaries independent', () => {
    const dataset = completeDataset();
    const providerCandidates = [...candidates(dataset)];
    const holdoutIndex = dataset.captures.findIndex((captureItem) => captureItem.subjectRef === 'subject-holdout' && captureItem.stratum === 'neutral_frontal_baseline');
    providerCandidates[holdoutIndex] = {
      ...providerCandidates[holdoutIndex]!,
      candidate: candidate(0.9, 0.9, 377),
    };
    const report = buildMentonPreregisteredScoringReportFR48(dataset, providerCandidates);
    expect(report.holdoutSummary.maxCaptureMentonPointError).toBeGreaterThan(report.calibrationSummary.maxCaptureMentonPointError);
    expect(report.thresholdProposalGenerated).toBe(false);
    expect(report.mappingPassFailDecision).toBeNull();
  });

  it('rejects provider-run mismatch and missing candidate coverage', () => {
    const dataset = completeDataset();
    const providerCandidates = [...candidates(dataset)];
    providerCandidates[0] = { ...providerCandidates[0]!, providerRunRef: 'wrong-run' };
    expect(() => buildMentonPreregisteredScoringReportFR48(dataset, providerCandidates)).toThrow(/providerRunRef mismatch/);
    expect(() => buildMentonPreregisteredScoringReportFR48(dataset, candidates(dataset).slice(1))).toThrow(/exactly one provider candidate record/);
  });

  it('rejects ambiguous FR-45 candidates rather than silently selecting an index', () => {
    const dataset = completeDataset();
    const providerCandidates = [...candidates(dataset)];
    providerCandidates[0] = {
      ...providerCandidates[0]!,
      candidate: {
        ...providerCandidates[0]!.candidate,
        state: 'ambiguous_exact_tie',
        tiedProviderLandmarkIndices: [152, 148],
        selectedProviderLandmarkIndex: null,
        selectedPoint: null,
      },
    };
    expect(() => buildMentonPreregisteredScoringReportFR48(dataset, providerCandidates)).toThrow(/unique fail-closed FR-45 provider-neutral candidate/);
  });

  it('never promotes scoring into FR-35, traditional 地閣, FR-36, Three Divisions, F1, or F6 production authority', () => {
    expect(MENTON_PREREGISTERED_SCORING_AUTHORITY_FR48.authorityBoundary.mentonPointMaySubstituteForFR35Contour).toBe(false);
    expect(MENTON_PREREGISTERED_SCORING_AUTHORITY_FR48.authorityBoundary.traditionalDigeEquivalenceAuthorized).toBe(false);
    expect(MENTON_PREREGISTERED_SCORING_AUTHORITY_FR48.authorityBoundary.fr36VerticalReferencePromoted).toBe(false);
    expect(() => assertMentonScoringReadyForProductionFR48()).toThrow(/reviewed empirical thresholds.*holdout validation.*FR-35 point-to-contour relation.*地閣 equivalence.*FR-36.*Three Divisions.*F1.*F6/);
  });
});
