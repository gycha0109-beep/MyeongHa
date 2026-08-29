import {
  scoreFaceOvalInferiorExtremumAgainstMentonFR46,
  validateChinInferiorNeutralValidationAuthorityFR46,
} from './chin-inferior-neutral-validation-fr46.js';
import {
  MENTON_VALIDATION_DATASET_AUTHORITY_FR47,
  assessMentonValidationDatasetReadinessFR47,
  validateMentonValidationDatasetAuthorityFR47,
  validateMentonValidationDatasetFR47,
  type MentonCaptureStratumFR47V1,
  type MentonDatasetPartitionFR47V1,
  type MentonPoseAxisFR47V1,
  type MentonValidationDatasetFR47V1,
} from './chin-inferior-validation-dataset-fr47.js';
import type { MediaPipeFaceOvalInferiorExtremumEvidenceFR45V1 } from './mediapipe-face-oval-inferior-extremum-fr45.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface MentonProviderCandidateRecordFR48V1 {
  readonly captureRef: string;
  readonly providerRunRef: string;
  readonly candidate: MediaPipeFaceOvalInferiorExtremumEvidenceFR45V1;
}

export interface MentonCaptureScoreFR48V1 {
  readonly captureRef: string;
  readonly subjectRef: string;
  readonly partition: MentonDatasetPartitionFR47V1;
  readonly stratum: MentonCaptureStratumFR47V1;
  readonly annotationCount: number;
  readonly annotationDistances: readonly number[];
  readonly meanMentonPointError: number;
  readonly maxMentonPointError: number;
  readonly observedProviderLandmarkIndex: number;
  readonly providerIndexSemanticAuthority: false;
  readonly acceptanceThresholdApplied: false;
  readonly mappingPassFailDecision: null;
}

export interface MentonRepeatabilityScoreFR48V1 {
  readonly subjectRef: string;
  readonly partition: MentonDatasetPartitionFR47V1;
  readonly baselineCaptureRef: string;
  readonly repeatCaptureRef: string;
  readonly candidatePointDisplacement: number;
  readonly absoluteMeanMentonErrorDelta: number;
  readonly acceptanceThresholdApplied: false;
  readonly repeatabilityPassFailDecision: null;
}

export interface MentonPoseScoreFR48V1 {
  readonly subjectRef: string;
  readonly partition: MentonDatasetPartitionFR47V1;
  readonly captureRef: string;
  readonly poseAxis: MentonPoseAxisFR47V1;
  readonly signedPoseDegrees: number;
  readonly meanMentonPointError: number;
  readonly acceptanceThresholdApplied: false;
  readonly posePassFailDecision: null;
}

export interface MentonPartitionSummaryFR48V1 {
  readonly partition: MentonDatasetPartitionFR47V1;
  readonly subjectCount: number;
  readonly captureCount: number;
  readonly meanCaptureMentonPointError: number;
  readonly medianCaptureMentonPointError: number;
  readonly maxCaptureMentonPointError: number;
  readonly meanRepeatCandidateDisplacement: number;
  readonly maxRepeatCandidateDisplacement: number;
  readonly meanAbsoluteRepeatMentonErrorDelta: number;
  readonly poseMeanMentonPointError: Readonly<Record<MentonPoseAxisFR47V1, number>>;
}

export interface MentonPreregisteredScoringReportFR48V1 {
  readonly schemaVersion: 'fr48-report-v1';
  readonly datasetRef: string;
  readonly scoringRuleRef: 'scoring.face.menton_provider_candidate.fr48@0.1.0';
  readonly captureScores: readonly MentonCaptureScoreFR48V1[];
  readonly repeatabilityScores: readonly MentonRepeatabilityScoreFR48V1[];
  readonly poseScores: readonly MentonPoseScoreFR48V1[];
  readonly calibrationSummary: MentonPartitionSummaryFR48V1;
  readonly holdoutSummary: MentonPartitionSummaryFR48V1;
  readonly thresholdProposalGenerated: false;
  readonly holdoutUsedForThresholdTuning: false;
  readonly mappingPassFailDecision: null;
  readonly repeatabilityPassFailDecision: null;
  readonly poseStabilityPassFailDecision: null;
  readonly providerCandidateToMentonMappingValidated: false;
  readonly researchCandidateAdmitted: false;
  readonly productionGeometryAuthorized: false;
}

export interface MentonPreregisteredScoringAuthorityFR48V1 {
  readonly schemaVersion: 'fr48-v1';
  readonly authorityRef: 'authority.face.menton_preregistered_scoring_calibration.fr48';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'scoring_preregistered_thresholds_unset_no_reviewed_results';
  readonly upstreamFR47Ref: string;
  readonly scoringRuleRef: 'scoring.face.menton_provider_candidate.fr48@0.1.0';
  readonly metricContract: {
    readonly candidateToMentonPointError: 'normalized_euclidean_l2_per_independent_annotation';
    readonly perCaptureAnnotationAggregation: 'mean_and_max';
    readonly repeatabilityCandidateMetric: 'baseline_to_repeat_candidate_point_l2';
    readonly repeatabilityMentonMetric: 'absolute_delta_of_capture_mean_menton_error';
    readonly poseMetric: 'candidate_to_menton_mean_error_per_labeled_pose_capture';
    readonly partitionReporting: 'calibration_and_holdout_reported_separately';
    readonly calibrationMayInformThresholdProposalOnlyAfterReview: true;
    readonly holdoutMayTuneThresholds: false;
    readonly providerIndexUsedAsGroundTruth: false;
    readonly observedIndex152UsedAsGroundTruth: false;
  };
  readonly preregisteredOutputs: readonly [
    'per_annotation_candidate_to_menton_distance',
    'per_capture_mean_and_max_menton_error',
    'per_subject_physical_repeat_candidate_displacement',
    'per_subject_physical_repeat_menton_error_delta',
    'per_axis_pose_menton_error',
    'separate_calibration_summary',
    'separate_holdout_summary',
  ];
  readonly acceptanceThresholds: {
    readonly maximumMeanMentonPointError: null;
    readonly maximumCaptureMentonPointError: null;
    readonly maximumRepeatCandidateDisplacement: null;
    readonly maximumRepeatMentonErrorDelta: null;
    readonly maximumPoseMentonError: null;
    readonly minimumHoldoutSubjectCount: null;
  };
  readonly authorityBoundary: {
    readonly preregisteredScoringMeansProviderMappingValidated: false;
    readonly descriptiveErrorMeansPassFailDecision: false;
    readonly calibrationResultsMayAutoDefineThresholds: false;
    readonly holdoutResultsMayTuneThresholds: false;
    readonly postHocMetricSubstitutionAllowed: false;
    readonly providerIndexMayDefineMentonGroundTruth: false;
    readonly observedIndex152MayDefineMenton: false;
    readonly completeSyntheticDatasetMeansReviewedEvidence: false;
    readonly repeatabilityScoreMeansRepeatabilityValidated: false;
    readonly poseScoreMeansPoseStabilityValidated: false;
    readonly mentonPointMaySubstituteForFR35Contour: false;
    readonly traditionalDigeEquivalenceAuthorized: false;
    readonly fr36VerticalReferencePromoted: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
}

const FR47_REF = `${MENTON_VALIDATION_DATASET_AUTHORITY_FR47.authorityRef}@${MENTON_VALIDATION_DATASET_AUTHORITY_FR47.authorityVersion}`;
const SCORING_RULE_REF = 'scoring.face.menton_provider_candidate.fr48@0.1.0' as const;

export const MENTON_PREREGISTERED_SCORING_AUTHORITY_FR48: MentonPreregisteredScoringAuthorityFR48V1 = Object.freeze({
  schemaVersion: 'fr48-v1' as const,
  authorityRef: 'authority.face.menton_preregistered_scoring_calibration.fr48' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'scoring_preregistered_thresholds_unset_no_reviewed_results' as const,
  upstreamFR47Ref: FR47_REF,
  scoringRuleRef: SCORING_RULE_REF,
  metricContract: Object.freeze({
    candidateToMentonPointError: 'normalized_euclidean_l2_per_independent_annotation' as const,
    perCaptureAnnotationAggregation: 'mean_and_max' as const,
    repeatabilityCandidateMetric: 'baseline_to_repeat_candidate_point_l2' as const,
    repeatabilityMentonMetric: 'absolute_delta_of_capture_mean_menton_error' as const,
    poseMetric: 'candidate_to_menton_mean_error_per_labeled_pose_capture' as const,
    partitionReporting: 'calibration_and_holdout_reported_separately' as const,
    calibrationMayInformThresholdProposalOnlyAfterReview: true as const,
    holdoutMayTuneThresholds: false as const,
    providerIndexUsedAsGroundTruth: false as const,
    observedIndex152UsedAsGroundTruth: false as const,
  }),
  preregisteredOutputs: Object.freeze([
    'per_annotation_candidate_to_menton_distance',
    'per_capture_mean_and_max_menton_error',
    'per_subject_physical_repeat_candidate_displacement',
    'per_subject_physical_repeat_menton_error_delta',
    'per_axis_pose_menton_error',
    'separate_calibration_summary',
    'separate_holdout_summary',
  ] as const),
  acceptanceThresholds: Object.freeze({
    maximumMeanMentonPointError: null,
    maximumCaptureMentonPointError: null,
    maximumRepeatCandidateDisplacement: null,
    maximumRepeatMentonErrorDelta: null,
    maximumPoseMentonError: null,
    minimumHoldoutSubjectCount: null,
  }),
  authorityBoundary: Object.freeze({
    preregisteredScoringMeansProviderMappingValidated: false as const,
    descriptiveErrorMeansPassFailDecision: false as const,
    calibrationResultsMayAutoDefineThresholds: false as const,
    holdoutResultsMayTuneThresholds: false as const,
    postHocMetricSubstitutionAllowed: false as const,
    providerIndexMayDefineMentonGroundTruth: false as const,
    observedIndex152MayDefineMenton: false as const,
    completeSyntheticDatasetMeansReviewedEvidence: false as const,
    repeatabilityScoreMeansRepeatabilityValidated: false as const,
    poseScoreMeansPoseStabilityValidated: false as const,
    mentonPointMaySubstituteForFR35Contour: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    fr36VerticalReferencePromoted: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
});

function requireNonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FaceAuthorityValidationError(`FR-48 ${label} must be non-empty.`);
  }
  return value;
}

function mean(values: readonly number[], label: string): number {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new FaceAuthorityValidationError(`FR-48 ${label} requires at least one finite value.`);
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[], label: string): number {
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new FaceAuthorityValidationError(`FR-48 ${label} requires at least one finite value.`);
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function pointDistance(
  first: Readonly<{ x: number; y: number }>,
  second: Readonly<{ x: number; y: number }>,
): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function validateMentonPreregisteredScoringAuthorityFR48(
  authority: MentonPreregisteredScoringAuthorityFR48V1 = MENTON_PREREGISTERED_SCORING_AUTHORITY_FR48,
): MentonPreregisteredScoringAuthorityFR48V1 {
  validateChinInferiorNeutralValidationAuthorityFR46();
  validateMentonValidationDatasetAuthorityFR47();
  if (
    authority.schemaVersion !== 'fr48-v1' ||
    authority.authorityRef !== 'authority.face.menton_preregistered_scoring_calibration.fr48' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'scoring_preregistered_thresholds_unset_no_reviewed_results' ||
    authority.upstreamFR47Ref !== FR47_REF ||
    authority.scoringRuleRef !== SCORING_RULE_REF
  ) throw new FaceAuthorityValidationError('FR-48 identity/upstream authority drift.');
  if (
    authority.metricContract.candidateToMentonPointError !== 'normalized_euclidean_l2_per_independent_annotation' ||
    authority.metricContract.perCaptureAnnotationAggregation !== 'mean_and_max' ||
    authority.metricContract.repeatabilityCandidateMetric !== 'baseline_to_repeat_candidate_point_l2' ||
    authority.metricContract.repeatabilityMentonMetric !== 'absolute_delta_of_capture_mean_menton_error' ||
    authority.metricContract.poseMetric !== 'candidate_to_menton_mean_error_per_labeled_pose_capture' ||
    authority.metricContract.partitionReporting !== 'calibration_and_holdout_reported_separately' ||
    authority.metricContract.calibrationMayInformThresholdProposalOnlyAfterReview !== true ||
    authority.metricContract.holdoutMayTuneThresholds !== false ||
    authority.metricContract.providerIndexUsedAsGroundTruth !== false ||
    authority.metricContract.observedIndex152UsedAsGroundTruth !== false
  ) throw new FaceAuthorityValidationError('FR-48 metric contract drift.');
  if (Object.values(authority.acceptanceThresholds).some((value) => value !== null)) {
    throw new FaceAuthorityValidationError('FR-48 acceptance thresholds must remain unset before reviewed empirical calibration evidence.');
  }
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-48 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

function requireStructurallyScoreableDataset(dataset: MentonValidationDatasetFR47V1): void {
  validateMentonValidationDatasetFR47(dataset);
  const readiness = assessMentonValidationDatasetReadinessFR47(dataset);
  const required = [
    readiness.calibrationPartitionPresent,
    readiness.holdoutPartitionPresent,
    readiness.allSubjectsHaveRequiredCaptureStrata,
    readiness.distinctRepeatedPhysicalCaptureEvidencePresentForEverySubject,
    readiness.allPoseAxesLabeledForEverySubject,
    readiness.independentMentonAnnotationPresentForEveryCapture,
    readiness.groundTruthFrozenBeforeProviderRun,
    readiness.providerOutputPresentForEveryCapture,
  ];
  if (required.some((value) => value !== true)) {
    throw new FaceAuthorityValidationError('FR-48 scoring requires a structurally complete FR-47 dataset with frozen annotations and provider output for every capture.');
  }
}

function candidatePoint(record: MentonProviderCandidateRecordFR48V1): Readonly<{ x: number; y: number }> {
  const point = record.candidate.selectedPoint;
  if (record.candidate.state !== 'unique_image_inferior_extremum' || point === null) {
    throw new FaceAuthorityValidationError(`FR-48 capture ${record.captureRef} requires a unique FR-45 provider candidate point.`);
  }
  return point;
}

function summarizePartition(
  partition: MentonDatasetPartitionFR47V1,
  dataset: MentonValidationDatasetFR47V1,
  captureScores: readonly MentonCaptureScoreFR48V1[],
  repeatabilityScores: readonly MentonRepeatabilityScoreFR48V1[],
  poseScores: readonly MentonPoseScoreFR48V1[],
): MentonPartitionSummaryFR48V1 {
  const subjectRefs = new Set(dataset.subjects.filter((subject) => subject.partition === partition).map((subject) => subject.subjectRef));
  const captures = captureScores.filter((score) => score.partition === partition);
  const repeats = repeatabilityScores.filter((score) => score.partition === partition);
  const poses = poseScores.filter((score) => score.partition === partition);
  if (subjectRefs.size === 0 || captures.length === 0 || repeats.length === 0) {
    throw new FaceAuthorityValidationError(`FR-48 ${partition} partition must contain subjects, scored captures, and repeatability pairs.`);
  }
  const captureErrors = captures.map((score) => score.meanMentonPointError);
  const repeatDisplacements = repeats.map((score) => score.candidatePointDisplacement);
  const repeatErrorDeltas = repeats.map((score) => score.absoluteMeanMentonErrorDelta);
  const poseMeanMentonPointError = Object.freeze(Object.fromEntries((['yaw', 'pitch', 'roll'] as const).map((axis) => {
    const axisErrors = poses.filter((score) => score.poseAxis === axis).map((score) => score.meanMentonPointError);
    return [axis, mean(axisErrors, `${partition} ${axis} pose errors`)];
  })) as Record<MentonPoseAxisFR47V1, number>);
  return Object.freeze({
    partition,
    subjectCount: subjectRefs.size,
    captureCount: captures.length,
    meanCaptureMentonPointError: mean(captureErrors, `${partition} capture errors`),
    medianCaptureMentonPointError: median(captureErrors, `${partition} capture errors`),
    maxCaptureMentonPointError: Math.max(...captureErrors),
    meanRepeatCandidateDisplacement: mean(repeatDisplacements, `${partition} repeat displacements`),
    maxRepeatCandidateDisplacement: Math.max(...repeatDisplacements),
    meanAbsoluteRepeatMentonErrorDelta: mean(repeatErrorDeltas, `${partition} repeat error deltas`),
    poseMeanMentonPointError,
  });
}

export function buildMentonPreregisteredScoringReportFR48(
  dataset: MentonValidationDatasetFR47V1,
  providerCandidates: readonly MentonProviderCandidateRecordFR48V1[],
): MentonPreregisteredScoringReportFR48V1 {
  validateMentonPreregisteredScoringAuthorityFR48();
  requireStructurallyScoreableDataset(dataset);
  if (providerCandidates.length !== dataset.captures.length) {
    throw new FaceAuthorityValidationError('FR-48 requires exactly one provider candidate record for every FR-47 capture.');
  }
  const candidateRefs = providerCandidates.map((record) => record.captureRef);
  if (new Set(candidateRefs).size !== candidateRefs.length) {
    throw new FaceAuthorityValidationError('FR-48 provider candidate capture refs must be unique.');
  }
  const candidateByCapture = new Map(providerCandidates.map((record) => [record.captureRef, record] as const));
  const subjectByRef = new Map(dataset.subjects.map((subject) => [subject.subjectRef, subject] as const));
  const captureScoreByRef = new Map<string, MentonCaptureScoreFR48V1>();

  const captureScores = dataset.captures.map((capture): MentonCaptureScoreFR48V1 => {
    const record = candidateByCapture.get(capture.captureRef);
    if (!record) throw new FaceAuthorityValidationError(`FR-48 missing provider candidate for capture ${capture.captureRef}.`);
    requireNonEmpty(record.providerRunRef, 'providerRunRef');
    if (capture.providerRunRef === null || record.providerRunRef !== capture.providerRunRef) {
      throw new FaceAuthorityValidationError(`FR-48 providerRunRef mismatch for capture ${capture.captureRef}.`);
    }
    const subject = subjectByRef.get(capture.subjectRef);
    if (!subject) throw new FaceAuthorityValidationError(`FR-48 unknown subject ${capture.subjectRef}.`);
    const annotations = dataset.annotations.filter((annotation) => annotation.captureRef === capture.captureRef);
    if (annotations.length === 0) throw new FaceAuthorityValidationError(`FR-48 capture ${capture.captureRef} has no independent Menton annotation.`);
    const distances = annotations.map((annotation) => scoreFaceOvalInferiorExtremumAgainstMentonFR46(record.candidate, {
      subjectId: capture.subjectRef,
      captureId: capture.captureRef,
      annotatorId: annotation.annotatorRef,
      targetName: annotation.targetName,
      x: annotation.x,
      y: annotation.y,
      providerOutputVisibleDuringAnnotation: annotation.providerOutputVisibleDuringAnnotation,
      annotationFrozenBeforeProviderScoring: annotation.annotationFrozenBeforeProviderScoring,
    }).normalizedEuclideanDistance);
    const selectedIndex = record.candidate.selectedProviderLandmarkIndex;
    if (!Number.isInteger(selectedIndex)) {
      throw new FaceAuthorityValidationError(`FR-48 capture ${capture.captureRef} requires an observed provider landmark index as evidence provenance only.`);
    }
    const score = Object.freeze({
      captureRef: capture.captureRef,
      subjectRef: capture.subjectRef,
      partition: subject.partition,
      stratum: capture.stratum,
      annotationCount: distances.length,
      annotationDistances: Object.freeze(distances),
      meanMentonPointError: mean(distances, `${capture.captureRef} annotation distances`),
      maxMentonPointError: Math.max(...distances),
      observedProviderLandmarkIndex: selectedIndex as number,
      providerIndexSemanticAuthority: false as const,
      acceptanceThresholdApplied: false as const,
      mappingPassFailDecision: null,
    });
    captureScoreByRef.set(capture.captureRef, score);
    return score;
  });

  const repeatabilityScores = dataset.subjects.map((subject): MentonRepeatabilityScoreFR48V1 => {
    const captures = dataset.captures.filter((capture) => capture.subjectRef === subject.subjectRef);
    const baseline = captures.find((capture) => capture.stratum === 'neutral_frontal_baseline');
    const repeat = captures.find((capture) => capture.stratum === 'repeat_neutral_capture');
    if (!baseline || !repeat) throw new FaceAuthorityValidationError(`FR-48 subject ${subject.subjectRef} lacks baseline/repeat captures.`);
    const baselineCandidate = candidateByCapture.get(baseline.captureRef)!;
    const repeatCandidate = candidateByCapture.get(repeat.captureRef)!;
    const baselineScore = captureScoreByRef.get(baseline.captureRef)!;
    const repeatScore = captureScoreByRef.get(repeat.captureRef)!;
    return Object.freeze({
      subjectRef: subject.subjectRef,
      partition: subject.partition,
      baselineCaptureRef: baseline.captureRef,
      repeatCaptureRef: repeat.captureRef,
      candidatePointDisplacement: pointDistance(candidatePoint(baselineCandidate), candidatePoint(repeatCandidate)),
      absoluteMeanMentonErrorDelta: Math.abs(baselineScore.meanMentonPointError - repeatScore.meanMentonPointError),
      acceptanceThresholdApplied: false as const,
      repeatabilityPassFailDecision: null,
    });
  });

  const poseScores = dataset.captures.filter((capture) => capture.poseAxis !== null).map((capture): MentonPoseScoreFR48V1 => {
    const subject = subjectByRef.get(capture.subjectRef)!;
    const captureScore = captureScoreByRef.get(capture.captureRef)!;
    if (capture.poseAxis === null || !Number.isFinite(capture.poseDegrees)) {
      throw new FaceAuthorityValidationError(`FR-48 pose capture ${capture.captureRef} lacks reviewed FR-47 pose labeling.`);
    }
    return Object.freeze({
      subjectRef: capture.subjectRef,
      partition: subject.partition,
      captureRef: capture.captureRef,
      poseAxis: capture.poseAxis,
      signedPoseDegrees: capture.poseDegrees as number,
      meanMentonPointError: captureScore.meanMentonPointError,
      acceptanceThresholdApplied: false as const,
      posePassFailDecision: null,
    });
  });

  const calibrationSummary = summarizePartition('calibration', dataset, captureScores, repeatabilityScores, poseScores);
  const holdoutSummary = summarizePartition('holdout', dataset, captureScores, repeatabilityScores, poseScores);

  return Object.freeze({
    schemaVersion: 'fr48-report-v1' as const,
    datasetRef: dataset.datasetRef,
    scoringRuleRef: SCORING_RULE_REF,
    captureScores: Object.freeze(captureScores),
    repeatabilityScores: Object.freeze(repeatabilityScores),
    poseScores: Object.freeze(poseScores),
    calibrationSummary,
    holdoutSummary,
    thresholdProposalGenerated: false as const,
    holdoutUsedForThresholdTuning: false as const,
    mappingPassFailDecision: null,
    repeatabilityPassFailDecision: null,
    poseStabilityPassFailDecision: null,
    providerCandidateToMentonMappingValidated: false as const,
    researchCandidateAdmitted: false as const,
    productionGeometryAuthorized: false as const,
  });
}

export function assertMentonScoringReadyForProductionFR48(): never {
  validateMentonPreregisteredScoringAuthorityFR48();
  throw new FaceAuthorityValidationError('FR-48 preregisters descriptive Menton scoring only; reviewed empirical thresholds, holdout validation, FR-35 point-to-contour relation, 地閣 equivalence, FR-36, Three Divisions, F1, and F6 remain blocked.');
}
