import type { ReviewStatus } from './contracts.js';
import { FaceAuthorityValidationError } from './validation.js';

export type FaceEvidencePartition = 'selection' | 'holdout';

export interface FaceReportAcceptanceDecision {
  readonly policyRef: string;
  readonly state: 'met' | 'not_met';
}

export interface FaceReportAuthorityContext {
  readonly knownStudyRefs: ReadonlySet<string>;
  readonly knownMetricRefs: ReadonlySet<string>;
  readonly knownLabelingProtocolRefs: ReadonlySet<string>;
  readonly knownCalibrationRefs: ReadonlySet<string>;
  readonly reviewedAcceptancePolicyRefs: ReadonlySet<string>;
}

export interface FaceRepeatabilityReport {
  readonly reportId: string;
  readonly version: string;
  readonly studyRef: string;
  readonly metricRef: string;
  readonly partition: 'selection';
  readonly manifestRef: string;
  readonly participantCount: number;
  readonly acceptedObservationCount: number;
  readonly statistic: {
    readonly family: 'icc';
    readonly model: 'two_way_mixed_effects';
    readonly measurementType: 'single_measurement';
    readonly definition: 'absolute_agreement';
    readonly estimate: number;
    readonly confidenceLevel: number;
    readonly ciLower: number;
    readonly ciUpper: number;
    readonly methodRef: string;
  };
  readonly provenanceRefs: readonly string[];
  readonly acceptanceDecision: FaceReportAcceptanceDecision | null;
  readonly status: ReviewStatus;
}

export interface FaceReviewerReliabilityReport {
  readonly reportId: string;
  readonly version: string;
  readonly studyRef: string;
  readonly labelingProtocolRef: string;
  readonly partition: 'selection';
  readonly labelDatasetRef: string;
  readonly itemCount: number;
  readonly reviewerCount: number;
  readonly abstainHandling: 'treated_as_missing_for_reliability_statistic';
  readonly statistic: {
    readonly family: 'krippendorff_alpha';
    readonly levelOfMeasurement: 'nominal';
    readonly estimate: number;
    readonly confidenceLevel: number;
    readonly ciLower: number;
    readonly ciUpper: number;
    readonly bootstrapReplicates: number;
    readonly methodRef: string;
  };
  readonly provenanceRefs: readonly string[];
  readonly acceptanceDecision: FaceReportAcceptanceDecision | null;
  readonly status: ReviewStatus;
}

export interface FaceHoldoutEvaluationReport {
  readonly reportId: string;
  readonly version: string;
  readonly studyRef: string;
  readonly calibrationRef: string;
  readonly partition: 'holdout';
  readonly manifestRef: string;
  readonly labelDatasetRef: string;
  readonly participantCount: number;
  readonly evaluatedItemCount: number;
  readonly excludedNoConsensusCount: number;
  readonly confusion: {
    readonly truePositive: number;
    readonly trueNegative: number;
    readonly falsePositive: number;
    readonly falseNegative: number;
  };
  readonly metrics: {
    readonly sensitivity: number;
    readonly specificity: number;
    readonly balancedAccuracy: number;
  };
  readonly thresholdValueExposed: false;
  readonly selectionLabelsConsumed: false;
  readonly provenanceRefs: readonly string[];
  readonly acceptanceDecision: FaceReportAcceptanceDecision | null;
  readonly status: ReviewStatus;
}

const STABLE_KEY = /^[a-z0-9][a-z0-9._:-]{0,191}$/u;

function stableKey(value: string, path: string): void {
  if (!STABLE_KEY.test(value)) {
    throw new FaceAuthorityValidationError(`${path} must be a stable authority key.`);
  }
}

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) {
    throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
  }
}

function positiveInteger(value: number, path: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new FaceAuthorityValidationError(`${path} must be a positive integer.`);
  }
}

function nonNegativeInteger(value: number, path: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new FaceAuthorityValidationError(`${path} must be a non-negative integer.`);
  }
}

function unitInterval(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new FaceAuthorityValidationError(`${path} must be finite in [0,1].`);
  }
}

function confidenceInterval(
  estimate: number,
  lower: number,
  upper: number,
  confidenceLevel: number,
  path: string,
  range: readonly [number, number],
): void {
  const [min, max] = range;
  for (const [value, label] of [[estimate, 'estimate'], [lower, 'ciLower'], [upper, 'ciUpper']] as const) {
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new FaceAuthorityValidationError(`${path}.${label} must be finite in [${min},${max}].`);
    }
  }
  if (lower > estimate || estimate > upper) {
    throw new FaceAuthorityValidationError(`${path} requires ciLower <= estimate <= ciUpper.`);
  }
  if (!Number.isFinite(confidenceLevel) || confidenceLevel <= 0 || confidenceLevel >= 1) {
    throw new FaceAuthorityValidationError(`${path}.confidenceLevel must be in (0,1).`);
  }
}

function uniqueNonEmpty(values: readonly string[], path: string): void {
  if (values.length === 0) throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
  const seen = new Set<string>();
  for (const value of values) {
    nonEmpty(value, path);
    if (seen.has(value)) throw new FaceAuthorityValidationError(`${path} contains duplicate ref: ${value}`);
    seen.add(value);
  }
}

function validateAcceptanceDecision(
  decision: FaceReportAcceptanceDecision | null,
  status: ReviewStatus,
  context: FaceReportAuthorityContext,
  path: string,
): void {
  if (decision === null) {
    if (status === 'production_authorized') {
      throw new FaceAuthorityValidationError(`${path} production-authorized report requires an acceptance decision.`);
    }
    return;
  }
  nonEmpty(decision.policyRef, `${path}.acceptanceDecision.policyRef`);
  if (!context.reviewedAcceptancePolicyRefs.has(decision.policyRef)) {
    throw new FaceAuthorityValidationError(
      `${path} acceptance decision references unreviewed/unknown policy ${decision.policyRef}.`,
    );
  }
}

export function validateFaceRepeatabilityReport(
  report: FaceRepeatabilityReport,
  context: FaceReportAuthorityContext,
): void {
  stableKey(report.reportId, 'repeatabilityReport.reportId');
  nonEmpty(report.version, `${report.reportId}.version`);
  if (!context.knownStudyRefs.has(report.studyRef)) throw new FaceAuthorityValidationError(`${report.reportId} references unknown study.`);
  if (!context.knownMetricRefs.has(report.metricRef)) throw new FaceAuthorityValidationError(`${report.reportId} references unknown metric.`);
  if (report.partition !== 'selection') throw new FaceAuthorityValidationError(`${report.reportId} repeatability evidence must use selection partition.`);
  nonEmpty(report.manifestRef, `${report.reportId}.manifestRef`);
  positiveInteger(report.participantCount, `${report.reportId}.participantCount`);
  positiveInteger(report.acceptedObservationCount, `${report.reportId}.acceptedObservationCount`);
  if (report.acceptedObservationCount < report.participantCount * 2) {
    throw new FaceAuthorityValidationError(`${report.reportId} requires repeated accepted observations per participant.`);
  }
  confidenceInterval(
    report.statistic.estimate,
    report.statistic.ciLower,
    report.statistic.ciUpper,
    report.statistic.confidenceLevel,
    `${report.reportId}.statistic`,
    [-1, 1],
  );
  nonEmpty(report.statistic.methodRef, `${report.reportId}.statistic.methodRef`);
  uniqueNonEmpty(report.provenanceRefs, `${report.reportId}.provenanceRefs`);
  validateAcceptanceDecision(report.acceptanceDecision, report.status, context, report.reportId);
}

export function validateFaceReviewerReliabilityReport(
  report: FaceReviewerReliabilityReport,
  context: FaceReportAuthorityContext,
): void {
  stableKey(report.reportId, 'reviewerReliabilityReport.reportId');
  nonEmpty(report.version, `${report.reportId}.version`);
  if (!context.knownStudyRefs.has(report.studyRef)) throw new FaceAuthorityValidationError(`${report.reportId} references unknown study.`);
  if (!context.knownLabelingProtocolRefs.has(report.labelingProtocolRef)) {
    throw new FaceAuthorityValidationError(`${report.reportId} references unknown labeling protocol.`);
  }
  if (report.partition !== 'selection') throw new FaceAuthorityValidationError(`${report.reportId} reviewer reliability must use selection partition.`);
  nonEmpty(report.labelDatasetRef, `${report.reportId}.labelDatasetRef`);
  positiveInteger(report.itemCount, `${report.reportId}.itemCount`);
  if (!Number.isInteger(report.reviewerCount) || report.reviewerCount < 2) {
    throw new FaceAuthorityValidationError(`${report.reportId}.reviewerCount must be an integer >= 2.`);
  }
  confidenceInterval(
    report.statistic.estimate,
    report.statistic.ciLower,
    report.statistic.ciUpper,
    report.statistic.confidenceLevel,
    `${report.reportId}.statistic`,
    [-1, 1],
  );
  if (!Number.isInteger(report.statistic.bootstrapReplicates) || report.statistic.bootstrapReplicates < 1) {
    throw new FaceAuthorityValidationError(`${report.reportId}.statistic.bootstrapReplicates must be positive.`);
  }
  nonEmpty(report.statistic.methodRef, `${report.reportId}.statistic.methodRef`);
  uniqueNonEmpty(report.provenanceRefs, `${report.reportId}.provenanceRefs`);
  validateAcceptanceDecision(report.acceptanceDecision, report.status, context, report.reportId);
}

export function validateFaceHoldoutEvaluationReport(
  report: FaceHoldoutEvaluationReport,
  context: FaceReportAuthorityContext,
): void {
  stableKey(report.reportId, 'holdoutEvaluationReport.reportId');
  nonEmpty(report.version, `${report.reportId}.version`);
  if (!context.knownStudyRefs.has(report.studyRef)) throw new FaceAuthorityValidationError(`${report.reportId} references unknown study.`);
  if (!context.knownCalibrationRefs.has(report.calibrationRef)) throw new FaceAuthorityValidationError(`${report.reportId} references unknown calibration.`);
  if (report.partition !== 'holdout') throw new FaceAuthorityValidationError(`${report.reportId} final evaluation must use holdout partition.`);
  if (report.thresholdValueExposed !== false) throw new FaceAuthorityValidationError(`${report.reportId} must not expose raw threshold value.`);
  if (report.selectionLabelsConsumed !== false) throw new FaceAuthorityValidationError(`${report.reportId} must not consume selection labels as holdout evaluation authority.`);
  nonEmpty(report.manifestRef, `${report.reportId}.manifestRef`);
  nonEmpty(report.labelDatasetRef, `${report.reportId}.labelDatasetRef`);
  positiveInteger(report.participantCount, `${report.reportId}.participantCount`);
  positiveInteger(report.evaluatedItemCount, `${report.reportId}.evaluatedItemCount`);
  if (report.participantCount > report.evaluatedItemCount) {
    throw new FaceAuthorityValidationError(`${report.reportId}.participantCount cannot exceed evaluatedItemCount.`);
  }
  nonNegativeInteger(report.excludedNoConsensusCount, `${report.reportId}.excludedNoConsensusCount`);
  for (const [key, value] of Object.entries(report.confusion)) nonNegativeInteger(value, `${report.reportId}.confusion.${key}`);
  const confusionCount = report.confusion.truePositive + report.confusion.trueNegative + report.confusion.falsePositive + report.confusion.falseNegative;
  if (confusionCount !== report.evaluatedItemCount) {
    throw new FaceAuthorityValidationError(`${report.reportId} confusion counts must equal evaluatedItemCount.`);
  }
  unitInterval(report.metrics.sensitivity, `${report.reportId}.metrics.sensitivity`);
  unitInterval(report.metrics.specificity, `${report.reportId}.metrics.specificity`);
  unitInterval(report.metrics.balancedAccuracy, `${report.reportId}.metrics.balancedAccuracy`);

  const actualPositive = report.confusion.truePositive + report.confusion.falseNegative;
  const actualNegative = report.confusion.trueNegative + report.confusion.falsePositive;
  if (actualPositive === 0 || actualNegative === 0) {
    throw new FaceAuthorityValidationError(`${report.reportId} holdout evaluation requires both positive and negative reference items.`);
  }
  const expectedSensitivity = report.confusion.truePositive / actualPositive;
  const expectedSpecificity = report.confusion.trueNegative / actualNegative;
  if (Math.abs(report.metrics.sensitivity - expectedSensitivity) > 1e-12) {
    throw new FaceAuthorityValidationError(`${report.reportId}.metrics.sensitivity must match confusion counts.`);
  }
  if (Math.abs(report.metrics.specificity - expectedSpecificity) > 1e-12) {
    throw new FaceAuthorityValidationError(`${report.reportId}.metrics.specificity must match confusion counts.`);
  }
  const expectedBalanced = (expectedSensitivity + expectedSpecificity) / 2;
  if (Math.abs(report.metrics.balancedAccuracy - expectedBalanced) > 1e-12) {
    throw new FaceAuthorityValidationError(`${report.reportId}.metrics.balancedAccuracy must equal mean(sensitivity,specificity).`);
  }
  uniqueNonEmpty(report.provenanceRefs, `${report.reportId}.provenanceRefs`);
  validateAcceptanceDecision(report.acceptanceDecision, report.status, context, report.reportId);
}

export const FACE_EVIDENCE_REPORT_RESEARCH_DIRECTION_V0 = Object.freeze({
  repeatability: {
    statisticFamily: 'icc',
    model: 'two_way_mixed_effects',
    measurementType: 'single_measurement',
    definition: 'absolute_agreement',
    acceptanceCutoff: null,
  },
  reviewerReliability: {
    statisticFamily: 'krippendorff_alpha',
    levelOfMeasurement: 'nominal',
    abstainHandling: 'treated_as_missing_for_reliability_statistic',
    acceptanceCutoff: null,
  },
  finalEvaluation: {
    partition: 'holdout',
    metrics: ['sensitivity', 'specificity', 'balanced_accuracy'],
    acceptanceCutoff: null,
  },
});