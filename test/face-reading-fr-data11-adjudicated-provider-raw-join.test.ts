import { describe, expect, it } from 'vitest';
import {
  ADJUDICATED_PROVIDER_RAW_JOIN_AUTHORITY_FRDATA11,
  assertAdjudicatedProviderRawJoinReadyForPromotionFRData11,
  buildAdjudicatedProviderRawJoinReportFRData11,
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

type HumanLabel = IndependentFaceCountAnnotationFRData07V1['label'];
type Outcome = IndependentFaceCountAdjudicationFRData10V1['outcome'];

const fixtures = [
  { captureRef: 'c0', char: 'a', partition: 'calibration', annotation: 'zero_human_faces', outcome: 'zero_human_faces', providerCount: 0 },
  { captureRef: 'c1', char: 'b', partition: 'calibration', annotation: 'one_human_face', outcome: 'one_human_face', providerCount: 1 },
  { captureRef: 'c2', char: 'c', partition: 'calibration', annotation: 'multiple_human_faces', outcome: 'multiple_human_faces', providerCount: 1 },
  { captureRef: 'c3', char: 'd', partition: 'holdout', annotation: 'indeterminate', outcome: 'indeterminate', providerCount: 0 },
  { captureRef: 'c4', char: 'e', partition: 'holdout', annotation: 'one_human_face', outcome: 'unresolved', providerCount: 1 },
] as const;

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
    datasetRef: 'dataset:fr-data11-contract-fixture',
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
      providerRunStartedAt: `2026-01-01T00:${String(20 + index).padStart(2, '0')}:00.000Z`,
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

describe('FR-DATA-11 adjudicated outcome × provider raw evidence join', () => {
  it('joins every frozen adjudication outcome to the exact provider observation and emits only a raw cross-tab', () => {
    const provider = providerReport();
    const truth = groundTruth(provider);
    const adjudications = adjudicationDataset(truth);
    const report = buildAdjudicatedProviderRawJoinReportFRData11(truth, adjudications, provider);

    expect(report.schemaVersion).toBe('fr-data11-adjudicated-provider-raw-join-v1');
    expect(report.captureCount).toBe(5);
    expect(report.rows).toHaveLength(5);
    expect(report.exactProviderRunBindingVerified).toBe(true);
    expect(report.frozenAdjudicationLedgerRequiredBeforeJoin).toBe(true);
    expect(report.rawCrossTabComputed).toBe(true);
    expect(report.crossTab).toEqual([
      { adjudicationOutcome: 'zero_human_faces', zeroProviderCandidates: 1, oneProviderCandidate: 0, total: 1 },
      { adjudicationOutcome: 'one_human_face', zeroProviderCandidates: 0, oneProviderCandidate: 1, total: 1 },
      { adjudicationOutcome: 'multiple_human_faces', zeroProviderCandidates: 0, oneProviderCandidate: 1, total: 1 },
      { adjudicationOutcome: 'indeterminate', zeroProviderCandidates: 1, oneProviderCandidate: 0, total: 1 },
      { adjudicationOutcome: 'unresolved', zeroProviderCandidates: 0, oneProviderCandidate: 1, total: 1 },
    ]);
    expect(report.classificationMetricsComputed).toBe(false);
    expect(report.truePositiveFalsePositiveTerminologyAuthorized).toBe(false);
    expect(report.metricEligibilityPolicyDefined).toBe(false);
  });

  it('preserves indeterminate and unresolved as first-class evidence rows', () => {
    const provider = providerReport();
    const truth = groundTruth(provider);
    const report = buildAdjudicatedProviderRawJoinReportFRData11(truth, adjudicationDataset(truth), provider);
    expect(report.rows.find((entry) => entry.captureRef === 'c3')?.adjudicationOutcome).toBe('indeterminate');
    expect(report.rows.find((entry) => entry.captureRef === 'c4')?.adjudicationOutcome).toBe('unresolved');
    expect(report.indeterminatePreserved).toBe(true);
    expect(report.unresolvedPreserved).toBe(true);
  });

  it('rejects an unfrozen FR-DATA-10 adjudication ledger', () => {
    const provider = providerReport();
    const truth = groundTruth(provider);
    const adjudications = adjudicationDataset(truth);
    const changed: IndependentFaceAdjudicationDatasetFRData10V1 = {
      ...adjudications,
      adjudicationLedgerFrozen: false,
      adjudicationLedgerDigest: null,
      adjudicationLedgerFrozenAt: null,
    };
    expect(() => buildAdjudicatedProviderRawJoinReportFRData11(truth, changed, provider)).toThrow(/must be frozen/);
  });

  it('rejects provider-run identity drift before performing the adjudicated join', () => {
    const provider = providerReport();
    const truth = groundTruth(provider);
    const changed = {
      ...truth,
      captures: truth.captures.map((entry) => entry.captureRef === 'c1'
        ? { ...entry, providerRunRef: 'provider-run:drift' }
        : entry),
    } as IndependentFaceGroundTruthDatasetFRData07V1;
    expect(() => buildAdjudicatedProviderRawJoinReportFRData11(changed, adjudicationDataset(changed), provider)).toThrow(/exact FR-DATA-06 report instance/);
  });

  it('keeps raw cross-tab semantics distinct from a confusion matrix or human-face-count claim', () => {
    const authority = ADJUDICATED_PROVIDER_RAW_JOIN_AUTHORITY_FRDATA11;
    expect(authority.protocol.providerCandidateCountMayBeInterpretedAsHumanFaceCount).toBe(false);
    expect(authority.protocol.truePositiveFalsePositiveTerminologyAuthorized).toBe(false);
    expect(authority.protocol.classificationMetricsAuthorized).toBe(false);
    expect(authority.protocol.metricEligibilityPolicyDefined).toBe(false);
    expect(authority.authorityBoundary.rawCrossTabMayBeCalledConfusionMatrix).toBe(false);
    expect(Object.values(authority.authorityBoundary).every((value) => value === false)).toBe(true);
  });

  it('leaves all semantic, empirical, and production promotion blocked', () => {
    const provider = providerReport();
    const truth = groundTruth(provider);
    const report = buildAdjudicatedProviderRawJoinReportFRData11(truth, adjudicationDataset(truth), provider);
    expect(report.captureConsensusGroundTruthAuthorityValidated).toBe(false);
    expect(report.interAnnotatorGroundTruthAuthorityValidated).toBe(false);
    expect(report.providerDetectionConstructValidityValidated).toBe(false);
    expect(report.externalProviderExecutionIdentityVerified).toBe(false);
    expect(report.reviewedEmpiricalValidationCompleted).toBe(false);
    expect(report.anatomicalLandmarkAuthorityValidated).toBe(false);
    expect(report.traditionalSemanticAuthorityValidated).toBe(false);
    expect(report.productionGeometryAuthorized).toBe(false);
  });

  it('always blocks metric, semantic, or production promotion', () => {
    expect(() => assertAdjudicatedProviderRawJoinReadyForPromotionFRData11()).toThrow(/evidence organization only/);
  });
});
