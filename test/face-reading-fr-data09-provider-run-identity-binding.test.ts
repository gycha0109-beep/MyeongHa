import { describe, expect, it } from 'vitest';
import {
  PROVIDER_RUN_IDENTITY_BINDING_AUTHORITY_FRDATA09,
  assertProviderRunIdentityBindingReadyForPromotionFRData09,
  buildProviderRunIdentityBindingReportFRData09,
  computeProviderReportCanonicalDigestFRData09,
  deriveProviderRunRefForCaptureFRData09,
  type IndependentFaceGroundTruthDatasetFRData07V1,
  type MentonDatasetProviderFaceCandidateObservationReportFRData06V1,
} from '../packages/face-reading/src/index.js';

const digest = (char: string) => `sha256:${char.repeat(64)}`;

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

function providerObservation(captureRef: string, char: string, count: 0 | 1) {
  return {
    captureRef,
    relativeAssetPath: `fixtures/${captureRef}.png`,
    actualDigest: digest(char),
    rasterSha256: digest(char),
    faceCandidateCount: count,
    candidateSummaries: count === 1 ? [candidateSummary()] : [],
    faceBlendshapeCount: 0,
    facialTransformationMatrixCount: 0,
  } as const;
}

function providerReport(): MentonDatasetProviderFaceCandidateObservationReportFRData06V1 {
  return {
    schemaVersion: 'fr-data06-provider-face-candidate-observation-v1',
    datasetRef: 'dataset:fr-data09-contract-fixture',
    captureCount: 2,
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
    captureObservations: [providerObservation('c0', 'a', 0), providerObservation('c1', 'b', 1)],
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

function annotation(captureRef: string, char: string, label: 'zero_human_faces' | 'one_human_face') {
  return {
    captureRef,
    annotatorRef: `annotator:${captureRef}`,
    annotationSessionRef: `session:${captureRef}`,
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
  } as const;
}

function groundTruth(report: MentonDatasetProviderFaceCandidateObservationReportFRData06V1): IndependentFaceGroundTruthDatasetFRData07V1 {
  return {
    schemaVersion: 'fr-data07-independent-face-ground-truth-v1',
    datasetRef: report.datasetRef,
    providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1',
    captures: [
      {
        captureRef: 'c0', partition: 'calibration', canonicalAssetDigest: digest('a'),
        sourceProvenanceRef: 'source:c0', sourceInstanceRef: 'instance:c0',
        providerRunRef: deriveProviderRunRefForCaptureFRData09(report, 'c0'),
        providerRunStartedAt: '2026-01-01T00:20:00.000Z', providerRunExecutedAfterAnnotationFreeze: true,
      },
      {
        captureRef: 'c1', partition: 'holdout', canonicalAssetDigest: digest('b'),
        sourceProvenanceRef: 'source:c1', sourceInstanceRef: 'instance:c1',
        providerRunRef: deriveProviderRunRefForCaptureFRData09(report, 'c1'),
        providerRunStartedAt: '2026-01-01T00:21:00.000Z', providerRunExecutedAfterAnnotationFreeze: true,
      },
    ],
    annotations: [annotation('c0', 'a', 'zero_human_faces'), annotation('c1', 'b', 'one_human_face')],
    annotationLedgerFrozen: true,
    annotationLedgerDigest: digest('e'),
    annotationLedgerFrozenAt: '2026-01-01T00:10:00.000Z',
    providerRunsExecutedAfterFreeze: true,
  };
}

describe('FR-DATA-09 provider run identity binding', () => {
  it('binds every FR-DATA-07 providerRunRef to the exact FR-DATA-06 report instance and capture observation', () => {
    const provider = providerReport();
    const report = buildProviderRunIdentityBindingReportFRData09(groundTruth(provider), provider);

    expect(report.schemaVersion).toBe('fr-data09-provider-run-identity-binding-v1');
    expect(report.captureCount).toBe(2);
    expect(report.providerReportDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(report.captureBindings.every((entry) => entry.exactProviderRunRefMatched)).toBe(true);
    expect(report.captureBindings.every((entry) => entry.exactAssetDigestMatched)).toBe(true);
    expect(report.providerRunRefToExactReportInstanceBindingVerified).toBe(true);
    expect(report.providerRunRefToExactCaptureObservationBindingVerified).toBe(true);
    expect(report.providerRunStartTemporalConsistencyVerified).toBe(true);
    expect(report.externalProviderExecutionIdentityVerified).toBe(false);
    expect(report.githubRunIdentityExternallyVerified).toBe(false);
    expect(report.providerRunStartTimestampExternallyVerified).toBe(false);
    expect(report.providerDetectionConstructValidityValidated).toBe(false);
    expect(report.facePresenceVerified).toBe(false);
    expect(report.productionGeometryAuthorized).toBe(false);
  });

  it('canonicalizes object key order before hashing while preserving report content', () => {
    const provider = providerReport();
    const reordered = Object.fromEntries(Object.entries(provider).reverse()) as unknown as MentonDatasetProviderFaceCandidateObservationReportFRData06V1;
    expect(computeProviderReportCanonicalDigestFRData09(reordered)).toBe(computeProviderReportCanonicalDigestFRData09(provider));
  });

  it('changes the report digest and capture run ref when report content changes', () => {
    const provider = providerReport();
    const changed = {
      ...provider,
      providerProvenance: { ...provider.providerProvenance, verificationTimestamp: '2026-01-01T00:31:00.000Z' },
    };
    expect(computeProviderReportCanonicalDigestFRData09(changed)).not.toBe(computeProviderReportCanonicalDigestFRData09(provider));
    expect(deriveProviderRunRefForCaptureFRData09(changed, 'c0')).not.toBe(deriveProviderRunRefForCaptureFRData09(provider, 'c0'));
  });

  it('uses captureRef as an explicit locator within the same exact report instance', () => {
    const provider = providerReport();
    expect(deriveProviderRunRefForCaptureFRData09(provider, 'c0')).not.toBe(deriveProviderRunRefForCaptureFRData09(provider, 'c1'));
  });

  it('rejects an arbitrary FR-DATA-07 providerRunRef even when capture/digest joins match', () => {
    const provider = providerReport();
    const truth = groundTruth(provider);
    const changed = {
      ...truth,
      captures: truth.captures.map((entry) => entry.captureRef === 'c0' ? { ...entry, providerRunRef: 'provider-run:arbitrary' } : entry),
    } as IndependentFaceGroundTruthDatasetFRData07V1;
    expect(() => buildProviderRunIdentityBindingReportFRData09(changed, provider)).toThrow(/exact FR-DATA-06 report instance/);
  });

  it('rejects providerRunStartedAt later than the report verification timestamp', () => {
    const provider = providerReport();
    const truth = groundTruth(provider);
    const changed = {
      ...truth,
      captures: truth.captures.map((entry) => entry.captureRef === 'c1' ? { ...entry, providerRunStartedAt: '2026-01-01T00:31:00.000Z' } : entry),
    } as IndependentFaceGroundTruthDatasetFRData07V1;
    expect(() => buildProviderRunIdentityBindingReportFRData09(changed, provider)).toThrow(/cannot be later/);
  });

  it('keeps external execution and semantic authority explicitly fail-closed', () => {
    const protocol = PROVIDER_RUN_IDENTITY_BINDING_AUTHORITY_FRDATA09.protocol;
    expect(protocol.providerRunRefMayBeInferredFromGithubRunId).toBe(false);
    expect(protocol.providerRunRefMayBeInferredFromTimestamp).toBe(false);
    expect(protocol.reportDigestMeansExternalProcessIdentity).toBe(false);
    expect(Object.values(PROVIDER_RUN_IDENTITY_BINDING_AUTHORITY_FRDATA09.authorityBoundary).every((value) => value === false)).toBe(true);
  });

  it('always blocks semantic or production promotion', () => {
    expect(() => assertProviderRunIdentityBindingReadyForPromotionFRData09()).toThrow(/evidence identity only/);
  });
});
