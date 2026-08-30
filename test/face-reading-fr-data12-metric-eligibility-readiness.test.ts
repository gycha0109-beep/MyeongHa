import { describe, expect, it } from 'vitest';
import {
  METRIC_ELIGIBILITY_READINESS_AUTHORITY_FRDATA12,
  assertMetricEligibilityReadyForPromotionFRData12,
  buildMetricEligibilityReadinessReportFRData12,
  computeIndependentFaceAdjudicationLedgerDigestFRData10,
  deriveIndependentAnnotationRefFRData10,
  deriveProviderRunRefForCaptureFRData09,
  type IndependentFaceAdjudicationDatasetFRData10V1,
  type IndependentFaceCountAdjudicationFRData10V1,
  type IndependentFaceCountAnnotationFRData07V1,
  type IndependentFaceGroundTruthDatasetFRData07V1,
  type MentonDatasetProviderFaceCandidateObservationReportFRData06V1,
} from '../packages/face-reading/src/index.js';

const digest = (char: string) => `sha256:${char.repeat(64)}`;

const fixtures = [
  { captureRef: 'c0', char: 'a', partition: 'calibration', annotation: 'indeterminate', outcome: 'indeterminate', providerCount: 0 },
  { captureRef: 'c1', char: 'b', partition: 'holdout', annotation: 'one_human_face', outcome: 'unresolved', providerCount: 1 },
] as const;

type HumanLabel = IndependentFaceCountAnnotationFRData07V1['label'];
type Outcome = IndependentFaceCountAdjudicationFRData10V1['outcome'];

function candidateSummary() {
  return {
    providerCandidateOrdinal: 0,
    landmarkCount: 478,
    landmarkFieldSet: ['visibility', 'x', 'y', 'z'],
    allXFiniteNormalized: true,
    allYFiniteNormalized: true,
    allZFinite: true,
    allVisibilityFiniteWhenPresent: true,
  } as const;
}

function providerReport(): MentonDatasetProviderFaceCandidateObservationReportFRData06V1 {
  return {
    schemaVersion: 'fr-data06-provider-face-candidate-observation-v1',
    datasetRef: 'dataset:fr-data12-contract-fixture',
    captureCount: fixtures.length,
    providerProvenance: {
      protocol: 'chrome_devtools_protocol',
      providerRuntime: 'mediapipe_tasks_vision_face_landmarker',
      runtimePackageName: '@mediapipe/tasks-vision',
      runtimePackageVersion: '0.10.35',
      packageBundleDigest: digest('1'),
      wasmFiles: [],
      modelAssetRef: 'model:test',
      modelDigest: digest('2'),
      modelByteLength: 1,
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      sourceImagePrimitive: 'html_image_element_after_decode',
      rasterReconfirmationPrimitive: 'canvas_2d_get_image_data_sha256_before_provider_detect',
      browserProduct: 'Google Chrome',
      browserVersion: '151.0.0.0',
      platform: 'linux',
      runnerOS: 'Linux',
      runnerArch: 'X64',
      githubRunId: '123',
      githubRunAttempt: '1',
      githubSha: 'a'.repeat(40),
      verificationTimestamp: '2026-01-01T00:30:00.000Z',
      pageUrl: 'http://127.0.0.1:3000/',
      pageOrigin: 'http://127.0.0.1:3000',
      pageReadyState: 'complete',
      deterministicSummaryReplay: true,
      rawProviderResponsePersisted: false,
      rawProviderCoordinatesPersisted: false,
    },
    captureObservations: fixtures.map((fixture) => ({
      captureRef: fixture.captureRef,
      relativeAssetPath: `fixtures/${fixture.captureRef}.png`,
      actualDigest: digest(fixture.char),
      rasterSha256: digest(fixture.char),
      faceCandidateCount: fixture.providerCount,
      candidateSummaries: fixture.providerCount === 1 ? [candidateSummary()] : [],
      faceBlendshapeCount: 0,
      facialTransformationMatrixCount: 0,
    })),
    frData01IntakeVerified: true,
    imageDimensionsVerifiedAgainstBytes: true,
    imageDecodabilityVerified: true,
    browserRasterReadbackVerified: true,
    frData04PixelRasterEvidenceVerified: true,
    frData05CaptureQualityRawObservationVerified: true,
    rasterIdentityReconfirmedBeforeProviderRun: true,
    mediaPipeRuntimeExecuted: true,
    providerResultShapeObserved: true,
    providerFaceCandidateCountObserved: true,
    providerLandmarkPayloadSummaryObserved: true,
    rawProviderResponsePersisted: false,
    rawProviderCoordinatesPersisted: false,
    pixelContentIntegrityVerified: false,
    providerDetectionConstructValidityValidated: false,
    providerFaceCandidateHumanIdentityValidated: false,
    singleHumanFaceVerified: false,
    facePresenceVerified: false,
    fullFaceFramingValidityVerified: false,
    neutralExpressionValidityVerified: false,
    naturalHeadPositionValidityVerified: false,
    sharpnessMetricValidated: false,
    exposureMetricValidated: false,
    lightingMetricValidated: false,
    exposureAdequacyVerified: false,
    lightingAdequacyVerified: false,
    blurThresholdPassVerified: false,
    occlusionValidityVerified: false,
    captureQualityMetricConstructValidityValidated: false,
    captureQualityThresholdsDefined: false,
    captureQualityAuthorityValidated: false,
    mentonAnnotationCorrectnessVerified: false,
    mediaPipeInferenceCorrectnessVerified: false,
    providerConformanceVerified: false,
    empiricalScoringPerformed: false,
    providerCandidateToMentonMappingValidated: false,
    repeatedCaptureRepeatabilityValidated: false,
    poseStabilityValidated: false,
    calibrationThresholdsDefined: false,
    fr35PointToContourRelationValidated: false,
    traditionalDigeEquivalenceValidated: false,
    fr36VerticalReferencePromoted: false,
    productionThreeDivisionsMetricAllowed: false,
    productionF1Allowed: false,
    productionF6Allowed: false,
    researchCandidateAdmitted: false,
    productionGeometryAuthorized: false,
  } as MentonDatasetProviderFaceCandidateObservationReportFRData06V1;
}

function annotation(captureRef: string, char: string, label: HumanLabel): IndependentFaceCountAnnotationFRData07V1 {
  return {
    captureRef,
    annotatorRef: `annotator:${captureRef}`,
    annotationSessionRef: `annotation-session:${captureRef}`,
    observedAssetDigest: digest(char),
    label,
    annotatedAt: '2026-01-01T00:00:00.000Z',
    providerOutputVisibleDuringAnnotation: false,
    providerCandidateCountVisibleDuringAnnotation: false,
    providerLandmarksVisibleDuringAnnotation: false,
    providerResultShapeVisibleDuringAnnotation: false,
    providerOutputUsedToChooseLabel: false,
    subjectIdentityInferred: false,
    annotationFrozenBeforeProviderScoring: true,
  };
}

function groundTruth(provider: MentonDatasetProviderFaceCandidateObservationReportFRData06V1): IndependentFaceGroundTruthDatasetFRData07V1 {
  return {
    schemaVersion: 'fr-data07-independent-face-ground-truth-v1',
    datasetRef: provider.datasetRef,
    providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1',
    captures: fixtures.map((fixture, index) => ({
      captureRef: fixture.captureRef,
      partition: fixture.partition,
      canonicalAssetDigest: digest(fixture.char),
      sourceProvenanceRef: `source:${fixture.captureRef}`,
      sourceInstanceRef: `instance:${fixture.captureRef}`,
      providerRunRef: deriveProviderRunRefForCaptureFRData09(provider, fixture.captureRef),
      providerRunStartedAt: `2026-01-01T00:${20 + index}:00.000Z`,
      providerRunExecutedAfterAnnotationFreeze: true,
    })),
    annotations: fixtures.map((fixture) => annotation(fixture.captureRef, fixture.char, fixture.annotation)),
    annotationLedgerFrozen: true,
    annotationLedgerDigest: digest('f'),
    annotationLedgerFrozenAt: '2026-01-01T00:10:00.000Z',
    providerRunsExecutedAfterFreeze: true,
  };
}

function adjudication(
  truth: IndependentFaceGroundTruthDatasetFRData07V1,
  captureRef: string,
  char: string,
  outcome: Outcome,
): IndependentFaceCountAdjudicationFRData10V1 {
  return {
    captureRef,
    adjudicatorRef: `adjudicator:${captureRef}`,
    adjudicationSessionRef: `adjudication-session:${captureRef}`,
    observedAssetDigest: digest(char),
    reviewedAnnotationRefs: truth.annotations
      .filter((entry) => entry.captureRef === captureRef)
      .map(deriveIndependentAnnotationRefFRData10),
    outcome,
    adjudicatedAt: '2026-01-01T00:40:00.000Z',
    independentAnnotationsVisibleDuringAdjudication: true,
    providerOutputVisibleDuringAdjudication: false,
    providerCandidateCountVisibleDuringAdjudication: false,
    providerLandmarksVisibleDuringAdjudication: false,
    providerResultShapeVisibleDuringAdjudication: false,
    providerRunIdentityVisibleDuringAdjudication: false,
    rawProviderScoringVisibleDuringAdjudication: false,
    providerRunBindingVisibleDuringAdjudication: false,
    datasetPartitionVisibleDuringAdjudication: false,
    providerOutputUsedToChooseOutcome: false,
    holdoutProviderBehaviorUsedToChooseOutcome: false,
    originalIndependentAnnotationsModified: false,
    automaticMajorityRuleApplied: false,
    automaticUnanimityRuleApplied: false,
    annotationCountRuleApplied: false,
    adjudicatorWasOriginalAnnotator: false,
    outcomeChosenByHumanAdjudicator: true,
    subjectIdentityInferred: false,
  };
}

function adjudicationDataset(truth: IndependentFaceGroundTruthDatasetFRData07V1): IndependentFaceAdjudicationDatasetFRData10V1 {
  const base: IndependentFaceAdjudicationDatasetFRData10V1 = {
    schemaVersion: 'fr-data10-independent-face-count-adjudication-v1',
    datasetRef: truth.datasetRef,
    upstreamGroundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1',
    upstreamAnnotationLedgerDigest: truth.annotationLedgerDigest!,
    adjudications: fixtures.map((fixture) => adjudication(truth, fixture.captureRef, fixture.char, fixture.outcome)),
    adjudicationLedgerFrozen: true,
    adjudicationLedgerDigest: null,
    adjudicationLedgerFrozenAt: '2026-01-01T00:50:00.000Z',
  };
  return {
    ...base,
    adjudicationLedgerDigest: computeIndependentFaceAdjudicationLedgerDigestFRData10(base),
  };
}

describe('FR-DATA-12 metric eligibility readiness', () => {
  it('records a blocked readiness assessment without inventing evaluation semantics', () => {
    const provider = providerReport();
    const truth = groundTruth(provider);
    const report = buildMetricEligibilityReadinessReportFRData12(truth, adjudicationDataset(truth), provider);

    expect(report.schemaVersion).toBe('fr-data12-metric-eligibility-readiness-v1');
    expect(report.metricReadinessState).toBe('blocked_missing_reviewed_semantic_and_empirical_authority');
    expect(report.rawJoinVerified).toBe(true);
    expect(report.exactProviderRunBindingVerified).toBe(true);
    expect(report.upstreamRawCrossTab).toHaveLength(5);
    expect(report.upstreamRawCrossTab.find((row) => row.adjudicationOutcome === 'indeterminate')?.total).toBe(1);
    expect(report.upstreamRawCrossTab.find((row) => row.adjudicationOutcome === 'unresolved')?.total).toBe(1);
    expect(report.holdoutOutcomeProviderPairingMaterialized).toBe(true);
    expect(report.currentHoldoutEligibleAsFuturePolicyPreregisteredConfirmatoryHoldout).toBe(false);
    expect(report.newUnseenHoldoutRequiredAfterPolicyFreezeForConfirmatoryMetrics).toBe(true);
    expect(report.classificationMetricsAuthorized).toBe(false);
    expect(report.confusionMatrixAuthorized).toBe(false);
  });

  it('keeps every binary role, exclusion policy, and denominator policy undefined', () => {
    const provider = providerReport();
    const truth = groundTruth(provider);
    const report = buildMetricEligibilityReadinessReportFRData12(truth, adjudicationDataset(truth), provider);

    expect(report.binaryHumanPositiveOutcome).toBeNull();
    expect(report.binaryHumanNegativeOutcome).toBeNull();
    expect(report.binaryProviderPositiveBucket).toBeNull();
    expect(report.binaryProviderNegativeBucket).toBeNull();
    expect(report.excludedHumanOutcomes).toBeNull();
    expect(report.multiclassHumanOutcomeMappingRef).toBeNull();
    expect(report.metricDenominatorPolicyRef).toBeNull();
    expect(report.humanOutcomeMetricRolePolicyDefined).toBe(false);
    expect(report.providerOutputMetricRolePolicyDefined).toBe(false);
    expect(report.outcomeExclusionPolicyDefined).toBe(false);
    expect(report.metricDenominatorPolicyDefined).toBe(false);
  });

  it('enumerates the unresolved prerequisites instead of silently satisfying them', () => {
    const provider = providerReport();
    const truth = groundTruth(provider);
    const report = buildMetricEligibilityReadinessReportFRData12(truth, adjudicationDataset(truth), provider);

    expect(report.blockedPrerequisites).toEqual([
      'reviewed_capture_ground_truth_authority',
      'provider_detection_construct_validity',
      'provider_candidate_human_identity',
      'explicit_human_outcome_metric_roles',
      'explicit_provider_output_metric_roles',
      'explicit_outcome_exclusion_policy',
      'explicit_metric_denominator_policy',
      'evaluation_policy_frozen_before_holdout_inspection',
      'new_unseen_holdout_after_policy_freeze',
    ]);
    expect(report.reviewedCaptureGroundTruthAuthorityValidated).toBe(false);
    expect(report.providerDetectionConstructValidityValidated).toBe(false);
    expect(report.providerCandidateHumanIdentityValidated).toBe(false);
    expect(report.evaluationPolicyFrozenBeforeHoldoutInspection).toBe(false);
  });

  it('forbids semantic inference from label names, provider buckets, or observed performance', () => {
    const protocol = METRIC_ELIGIBILITY_READINESS_AUTHORITY_FRDATA12.protocol;
    expect(protocol.positiveNegativeMappingMayBeInferredFromOutcomeNames).toBe(false);
    expect(protocol.zeroHumanFacesMayBeAssumedNegative).toBe(false);
    expect(protocol.oneHumanFaceMayBeAssumedPositive).toBe(false);
    expect(protocol.multipleHumanFacesMayBeCollapsedIntoBinaryClass).toBe(false);
    expect(protocol.indeterminateMayBeAutoExcluded).toBe(false);
    expect(protocol.unresolvedMayBeAutoExcluded).toBe(false);
    expect(protocol.zeroProviderCandidatesMayBeAssumedNegative).toBe(false);
    expect(protocol.oneProviderCandidateMayBeAssumedPositive).toBe(false);
    expect(protocol.calibrationPerformanceMayDefineEvaluationSemantics).toBe(false);
    expect(protocol.holdoutPerformanceMayDefineOrTuneEvaluationSemantics).toBe(false);
    expect(protocol.frData11MaterializesHoldoutOutcomeProviderPairing).toBe(true);
    expect(protocol.materializedHoldoutMayServeAsFuturePreregisteredConfirmatoryHoldout).toBe(false);
    expect(protocol.newUnseenHoldoutRequiredAfterPolicyFreezeForConfirmatoryMetrics).toBe(true);
  });

  it('does not invent sample-size, acceptance, or decision thresholds', () => {
    const protocol = METRIC_ELIGIBILITY_READINESS_AUTHORITY_FRDATA12.protocol;
    expect(protocol.minimumEvaluationSampleSize).toBeNull();
    expect(protocol.minimumPerClassSampleSize).toBeNull();
    expect(protocol.acceptanceThreshold).toBeNull();
    expect(protocol.binaryDecisionThreshold).toBeNull();
    expect(Object.values(METRIC_ELIGIBILITY_READINESS_AUTHORITY_FRDATA12.authorityBoundary).every((value) => value === false)).toBe(true);
  });

  it('inherits exact provider-run binding failure instead of assessing drifted evidence', () => {
    const provider = providerReport();
    const truth = groundTruth(provider);
    const changed = {
      ...truth,
      captures: truth.captures.map((entry) => entry.captureRef === 'c1'
        ? { ...entry, providerRunRef: 'provider-run:drift' }
        : entry),
    } as IndependentFaceGroundTruthDatasetFRData07V1;

    expect(() => buildMetricEligibilityReadinessReportFRData12(changed, adjudicationDataset(changed), provider))
      .toThrow(/exact FR-DATA-06 report instance/);
  });

  it('keeps empirical, semantic, and production promotion blocked', () => {
    const provider = providerReport();
    const truth = groundTruth(provider);
    const report = buildMetricEligibilityReadinessReportFRData12(truth, adjudicationDataset(truth), provider);
    expect(report.classificationMetricsComputed).toBe(false);
    expect(report.reviewedEmpiricalValidationCompleted).toBe(false);
    expect(report.anatomicalLandmarkAuthorityValidated).toBe(false);
    expect(report.traditionalSemanticAuthorityValidated).toBe(false);
    expect(report.productionGeometryAuthorized).toBe(false);
    expect(() => assertMetricEligibilityReadyForPromotionFRData12()).toThrow(/only records why metric semantics are blocked/);
  });
});
