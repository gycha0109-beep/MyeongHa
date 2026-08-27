import { describe, expect, it } from 'vitest';
import {
  FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0,
  FACE_EVIDENCE_REPORT_RESEARCH_DIRECTION_V0,
  FACE_SOURCE_CORROBORATION_RESEARCH_V0,
  validateFaceHoldoutEvaluationReport,
  validateFaceRepeatabilityReport,
  validateFaceReviewerReliabilityReport,
  validateSourceCorroborationRegistry,
  type FaceHoldoutEvaluationReport,
  type FaceRepeatabilityReport,
  type FaceReportAuthorityContext,
  type FaceReviewerReliabilityReport,
  type SourceCorroborationRegistry,
} from '../packages/face-reading/src/index.js';

const studyRef = 'study.face.nose_bridge.straight@0.3.0';
const metricRef = 'neutral.nose.bridge.centerline_rms_deviation@0.1.0';
const labelingProtocolRef = 'label.shenxiang.discernment.bridge_straight@0.3.0';
const calibrationRef = 'calibration.nose.bridge.straight@1.0.0-test-only';

function context(reviewedAcceptancePolicyRefs: readonly string[] = []): FaceReportAuthorityContext {
  return {
    knownStudyRefs: new Set([studyRef]),
    knownMetricRefs: new Set([metricRef]),
    knownLabelingProtocolRefs: new Set([labelingProtocolRef]),
    knownCalibrationRefs: new Set([calibrationRef]),
    reviewedAcceptancePolicyRefs: new Set(reviewedAcceptancePolicyRefs),
  };
}

function repeatability(): FaceRepeatabilityReport {
  return {
    reportId: 'report.nose_bridge.repeatability.test',
    version: '1.0.0-test-only',
    studyRef,
    metricRef,
    partition: 'selection',
    manifestRef: 'manifest:test-selection-v1',
    participantCount: 20,
    acceptedObservationCount: 80,
    statistic: {
      family: 'icc',
      model: 'two_way_mixed_effects',
      measurementType: 'single_measurement',
      definition: 'absolute_agreement',
      estimate: 0.84,
      confidenceLevel: 0.95,
      ciLower: 0.71,
      ciUpper: 0.92,
      methodRef: 'method:icc-absolute-agreement-test-v1',
    },
    provenanceRefs: ['artifact:repeatability-test-v1'],
    acceptanceDecision: null,
    status: 'reviewed',
  };
}

function reviewerReliability(): FaceReviewerReliabilityReport {
  return {
    reportId: 'report.nose_bridge.reviewer_reliability.test',
    version: '1.0.0-test-only',
    studyRef,
    labelingProtocolRef,
    partition: 'selection',
    labelDatasetRef: 'labels:test-selection-v1',
    itemCount: 40,
    reviewerCount: 3,
    abstainHandling: 'treated_as_missing_for_reliability_statistic',
    statistic: {
      family: 'krippendorff_alpha',
      levelOfMeasurement: 'nominal',
      estimate: 0.78,
      confidenceLevel: 0.95,
      ciLower: 0.66,
      ciUpper: 0.88,
      bootstrapReplicates: 1000,
      methodRef: 'method:krippendorff-alpha-bootstrap-test-v1',
    },
    provenanceRefs: ['artifact:reviewer-reliability-test-v1'],
    acceptanceDecision: null,
    status: 'reviewed',
  };
}

function holdout(): FaceHoldoutEvaluationReport {
  return {
    reportId: 'report.nose_bridge.holdout.test',
    version: '1.0.0-test-only',
    studyRef,
    calibrationRef,
    partition: 'holdout',
    manifestRef: 'manifest:test-holdout-v1',
    labelDatasetRef: 'labels:test-holdout-v1',
    participantCount: 10,
    evaluatedItemCount: 20,
    excludedNoConsensusCount: 2,
    confusion: {
      truePositive: 8,
      trueNegative: 8,
      falsePositive: 2,
      falseNegative: 2,
    },
    metrics: {
      sensitivity: 0.8,
      specificity: 0.8,
      balancedAccuracy: 0.8,
    },
    thresholdValueExposed: false,
    selectionLabelsConsumed: false,
    provenanceRefs: ['artifact:holdout-test-v1'],
    acceptanceDecision: null,
    status: 'reviewed',
  };
}

describe('FR-7 source transmission corroboration', () => {
  it('accepts corroboration while preserving the direct-source promotion barrier', () => {
    const directRefs = new Set(FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0.passages.map((passage) => passage.passageId));
    expect(() => validateSourceCorroborationRegistry(FACE_SOURCE_CORROBORATION_RESEARCH_V0, directRefs)).not.toThrow();
    expect(FACE_SOURCE_CORROBORATION_RESEARCH_V0.entries[0]).toMatchObject({
      targetPassageRef: 'passage.shenxiang.five_officers.discernment',
      relation: 'transmits',
      verificationStatus: 'indexed_transcription',
      mayPromoteDirectSource: false,
      status: 'research',
    });
  });

  it('rejects production promotion from indexed transcription alone', () => {
    const entry = FACE_SOURCE_CORROBORATION_RESEARCH_V0.entries[0]!;
    const invalid: SourceCorroborationRegistry = {
      ...FACE_SOURCE_CORROBORATION_RESEARCH_V0,
      entries: [{ ...entry, status: 'production_authorized' }],
    };
    const directRefs = new Set(FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0.passages.map((passage) => passage.passageId));
    expect(() => validateSourceCorroborationRegistry(invalid, directRefs)).toThrow(/scan_page_checked/u);
  });

  it('does not alter direct passage verification status', () => {
    const direct = FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0.passages.find(
      (passage) => passage.passageId === 'passage.shenxiang.five_officers.discernment',
    );
    expect(direct?.verificationStatus).toBe('unverified_ocr');
  });
});

describe('FR-7 repeatability and reviewer reliability reports', () => {
  it('validates research/reviewed reports without inventing acceptance cutoffs', () => {
    expect(() => validateFaceRepeatabilityReport(repeatability(), context())).not.toThrow();
    expect(() => validateFaceReviewerReliabilityReport(reviewerReliability(), context())).not.toThrow();
    expect(FACE_EVIDENCE_REPORT_RESEARCH_DIRECTION_V0.repeatability.acceptanceCutoff).toBeNull();
    expect(FACE_EVIDENCE_REPORT_RESEARCH_DIRECTION_V0.reviewerReliability.acceptanceCutoff).toBeNull();
  });

  it('rejects repeatability report on holdout by construction', () => {
    const invalid = { ...repeatability(), partition: 'holdout' } as unknown as FaceRepeatabilityReport;
    expect(() => validateFaceRepeatabilityReport(invalid, context())).toThrow(/selection partition/u);
  });

  it('requires confidence intervals to contain the estimate', () => {
    const invalid: FaceReviewerReliabilityReport = {
      ...reviewerReliability(),
      statistic: { ...reviewerReliability().statistic, estimate: 0.78, ciLower: 0.8, ciUpper: 0.9 },
    };
    expect(() => validateFaceReviewerReliabilityReport(invalid, context())).toThrow(/ciLower <= estimate/u);
  });

  it('cannot attach a pass/fail decision without a separately reviewed policy', () => {
    const invalid: FaceRepeatabilityReport = {
      ...repeatability(),
      acceptanceDecision: { policyRef: 'policy.repeatability.magic-v1', state: 'met' },
    };
    expect(() => validateFaceRepeatabilityReport(invalid, context())).toThrow(/unreviewed\/unknown policy/u);

    const valid: FaceRepeatabilityReport = {
      ...repeatability(),
      acceptanceDecision: { policyRef: 'policy.repeatability.reviewed-v1', state: 'met' },
    };
    expect(() => validateFaceRepeatabilityReport(valid, context(['policy.repeatability.reviewed-v1']))).not.toThrow();
  });
});

describe('FR-7 holdout evaluation report', () => {
  it('validates a threshold-hidden holdout-only result', () => {
    expect(() => validateFaceHoldoutEvaluationReport(holdout(), context())).not.toThrow();
  });

  it('rejects raw threshold exposure or selection-label reuse', () => {
    const thresholdLeaked = { ...holdout(), thresholdValueExposed: true } as unknown as FaceHoldoutEvaluationReport;
    expect(() => validateFaceHoldoutEvaluationReport(thresholdLeaked, context())).toThrow(/must not expose raw threshold/u);

    const selectionLeak = { ...holdout(), selectionLabelsConsumed: true } as unknown as FaceHoldoutEvaluationReport;
    expect(() => validateFaceHoldoutEvaluationReport(selectionLeak, context())).toThrow(/must not consume selection labels/u);
  });

  it('requires confusion counts and balanced accuracy to be internally consistent', () => {
    const badCount: FaceHoldoutEvaluationReport = {
      ...holdout(),
      confusion: { ...holdout().confusion, falsePositive: 3 },
    };
    expect(() => validateFaceHoldoutEvaluationReport(badCount, context())).toThrow(/confusion counts/u);

    const badBalanced: FaceHoldoutEvaluationReport = {
      ...holdout(),
      metrics: { ...holdout().metrics, balancedAccuracy: 0.9 },
    };
    expect(() => validateFaceHoldoutEvaluationReport(badBalanced, context())).toThrow(/must equal mean/u);
  });
});
