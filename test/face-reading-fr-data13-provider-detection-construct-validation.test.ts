import { describe, expect, it } from 'vitest';
import {
  PROVIDER_DETECTION_CONSTRUCT_VALIDATION_AUTHORITY_FRDATA13,
  assertProviderDetectionConstructValidationReadyForPromotionFRData13,
  buildProviderDetectionConstructValidationReadinessReportFRData13,
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
  {
    captureRef: 'construct-c0',
    char: 'a',
    partition: 'calibration',
    annotation: 'indeterminate',
    outcome: 'indeterminate',
    providerCount: 0,
  },
  {
    captureRef: 'construct-c1',
    char: 'b',
    partition: 'holdout',
    annotation: 'one_human_face',
    outcome: 'unresolved',
    providerCount: 1,
  },
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
    datasetRef: 'dataset:fr-data13-contract-fixture',
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

function annotation(
  captureRef: string,
  char: string,
  label: HumanLabel,
): IndependentFaceCountAnnotationFRData07V1 {
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

function groundTruth(
  provider: MentonDatasetProviderFaceCandidateObservationReportFRData06V1,
): IndependentFaceGroundTruthDatasetFRData07V1 {
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
    annotations: fixtures.map((fixture) => annotation(
      fixture.captureRef,
      fixture.char,
      fixture.annotation,
    )),
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

function adjudicationDataset(
  truth: IndependentFaceGroundTruthDatasetFRData07V1,
): IndependentFaceAdjudicationDatasetFRData10V1 {
  const base: IndependentFaceAdjudicationDatasetFRData10V1 = {
    schemaVersion: 'fr-data10-independent-face-count-adjudication-v1',
    datasetRef: truth.datasetRef,
    upstreamGroundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1',
    upstreamAnnotationLedgerDigest: truth.annotationLedgerDigest!,
    adjudications: fixtures.map((fixture) => adjudication(
      truth,
      fixture.captureRef,
      fixture.char,
      fixture.outcome,
    )),
    adjudicationLedgerFrozen: true,
    adjudicationLedgerDigest: null,
    adjudicationLedgerFrozenAt: '2026-01-01T00:50:00.000Z',
  };

  return {
    ...base,
    adjudicationLedgerDigest: computeIndependentFaceAdjudicationLedgerDigestFRData10(base),
  };
}

function report() {
  const provider = providerReport();
  const truth = groundTruth(provider);
  return buildProviderDetectionConstructValidationReadinessReportFRData13(
    truth,
    adjudicationDataset(truth),
    provider,
  );
}

describe('FR-DATA-13 provider detection construct validation protocol', () => {
  it('records the configured 0..1 provider candidate domain without turning it into human-face semantics', () => {
    const result = report();

    expect(result.schemaVersion).toBe('fr-data13-provider-detection-construct-validation-readiness-v1');
    expect(result.configuredNumFaces).toBe(1);
    expect(result.configuredProviderCandidateCountRange).toEqual([0, 1]);
    expect(result.observedProviderCandidateCountValues).toEqual([0, 1]);
    expect(result.exactMultipleHumanFaceCountRepresentableByCandidateCountAloneUnderNumFacesOne).toBe(false);
    expect(result.exactHumanFaceCountConstructClaimableFromCandidateCountAlone).toBe(false);
    expect(result.providerDetectionConstructValidityValidated).toBe(false);
    expect(result.providerFaceCandidateHumanIdentityValidated).toBe(false);
  });

  it('does not silently choose face-presence, exact-single-face, or exact-count as the target construct', () => {
    const result = report();

    expect(result.constructTargetDefined).toBe(false);
    expect(result.binaryFacePresenceConstructSelected).toBe(false);
    expect(result.exactSingleHumanFaceConstructSelected).toBe(false);
    expect(result.exactHumanFaceCountConstructSelected).toBe(false);
    expect(result.captureDomainScopeDefined).toBe(false);
    expect(result.outOfScopeOutcomeHandlingPolicyDefined).toBe(false);
    expect(result.constructValidationProtocolFrozenBeforeProviderOutputInspection).toBe(false);
  });

  it('preserves the FR-DATA-12 holdout non-retroactivity boundary for construct validation', () => {
    const result = report();

    expect(result.currentHoldoutOutcomeProviderPairingAlreadyMaterialized).toBe(true);
    expect(result.currentHoldoutEligibleAsFuturePreregisteredConstructValidationHoldout).toBe(false);
    expect(result.newUnseenValidationDatasetRequiredAfterProtocolFreeze).toBe(true);
    expect(PROVIDER_DETECTION_CONSTRUCT_VALIDATION_AUTHORITY_FRDATA13.protocol.currentFRData11HoldoutMayServeAsFuturePreregisteredConstructValidationHoldout).toBe(false);
    expect(PROVIDER_DETECTION_CONSTRUCT_VALIDATION_AUTHORITY_FRDATA13.protocol.newUnseenValidationDatasetRequiredAfterProtocolFreeze).toBe(true);
  });

  it('enumerates unresolved construct-validation evidence rather than manufacturing validity', () => {
    const result = report();

    expect(result.blockedPrerequisites).toEqual([
      'explicit_construct_target_definition',
      'reviewed_human_reference_standard_authority',
      'capture_domain_scope_definition',
      'out_of_scope_outcome_handling_policy',
      'construct_validation_protocol_freeze_before_provider_output_inspection',
      'new_unseen_construct_validation_dataset_after_protocol_freeze',
      'near_duplicate_partition_leakage_control',
      'acceptance_criteria_defined_before_validation_data_inspection',
      'provider_candidate_human_identity_validation_evidence',
      'external_construct_review_completed',
    ]);
    expect(result.reviewedHumanReferenceStandardAuthorityValidated).toBe(false);
    expect(result.newUnseenConstructValidationDatasetPresent).toBe(false);
    expect(result.nearDuplicatePartitionLeakageControlValidated).toBe(false);
    expect(result.acceptanceCriteriaDefinedBeforeValidationDataInspection).toBe(false);
    expect(result.externalConstructReviewCompleted).toBe(false);
  });

  it('forbids inference from provider candidate counts and silent outcome coercion', () => {
    const protocol = PROVIDER_DETECTION_CONSTRUCT_VALIDATION_AUTHORITY_FRDATA13.protocol;

    expect(protocol.providerCandidateCountMayDefineHumanFaceCount).toBe(false);
    expect(protocol.zeroProviderCandidatesMeansNoHumanFace).toBe(false);
    expect(protocol.oneProviderCandidateMeansOneHumanFace).toBe(false);
    expect(protocol.binaryFacePresenceTaskMayBeAssumed).toBe(false);
    expect(protocol.exactSingleHumanFaceTaskMayBeAssumed).toBe(false);
    expect(protocol.exactHumanFaceCountTaskMayBeAssumed).toBe(false);
    expect(protocol.indeterminateMayBeSilentlyExcluded).toBe(false);
    expect(protocol.unresolvedMayBeSilentlyExcluded).toBe(false);
    expect(protocol.multipleHumanFacesMayBeSilentlyCollapsed).toBe(false);
    expect(protocol.humanReferenceMustFreezeBeforeProviderOutcomeComparison).toBe(true);
  });

  it('does not invent empirical minima or acceptance thresholds', () => {
    const protocol = PROVIDER_DETECTION_CONSTRUCT_VALIDATION_AUTHORITY_FRDATA13.protocol;

    expect(protocol.minimumValidationCaptures).toBeNull();
    expect(protocol.minimumCapturesPerConstructStratum).toBeNull();
    expect(protocol.minimumIndependentReviewers).toBeNull();
    expect(protocol.acceptanceThreshold).toBeNull();
    expect(protocol.acceptableFalsePositiveRate).toBeNull();
    expect(protocol.acceptableFalseNegativeRate).toBeNull();
    expect(protocol.classificationMetricsAuthorized).toBe(false);
    expect(protocol.providerDetectionConstructValidityAuthorized).toBe(false);
    expect(Object.values(PROVIDER_DETECTION_CONSTRUCT_VALIDATION_AUTHORITY_FRDATA13.authorityBoundary)
      .every((value) => value === false)).toBe(true);
  });

  it('inherits upstream evidence drift instead of assessing a detached provider report', () => {
    const provider = providerReport();
    const truth = groundTruth(provider);
    const changed = {
      ...truth,
      captures: truth.captures.map((entry) => entry.captureRef === 'construct-c1'
        ? { ...entry, providerRunRef: 'provider-run:drift' }
        : entry),
    } as IndependentFaceGroundTruthDatasetFRData07V1;

    expect(() => buildProviderDetectionConstructValidationReadinessReportFRData13(
      changed,
      adjudicationDataset(changed),
      provider,
    )).toThrow(/exact FR-DATA-06 report instance/);
  });

  it('keeps metric, semantic, anatomical, and production promotion blocked', () => {
    const result = report();

    expect(result.truePositiveFalsePositiveTerminologyAuthorized).toBe(false);
    expect(result.confusionMatrixAuthorized).toBe(false);
    expect(result.classificationMetricsAuthorized).toBe(false);
    expect(result.classificationMetricsComputed).toBe(false);
    expect(result.reviewedEmpiricalValidationCompleted).toBe(false);
    expect(result.anatomicalLandmarkAuthorityValidated).toBe(false);
    expect(result.traditionalSemanticAuthorityValidated).toBe(false);
    expect(result.productionGeometryAuthorized).toBe(false);
    expect(() => assertProviderDetectionConstructValidationReadyForPromotionFRData13())
      .toThrow(/construct-validation protocol\/readiness boundary/);
  });
});
