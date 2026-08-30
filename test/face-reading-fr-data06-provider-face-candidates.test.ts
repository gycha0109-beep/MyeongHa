import { describe, expect, it } from 'vitest';
import {
  FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL,
  MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27,
  assertMentonDatasetFacePresenceReadyForPromotionFRData06,
  buildMentonDatasetBrowserImageDecodeReportFRData03,
  buildMentonDatasetBrowserPixelEvidenceReportFRData04,
  buildMentonDatasetCaptureQualityRawObservationReportFRData05,
  buildMentonDatasetImageDimensionReportFRData02,
  buildMentonDatasetIntakeReportFRData01,
  buildMentonDatasetProviderFaceCandidateObservationReportFRData06,
  type BrowserDecoderProvenanceFRData03V1,
  type BrowserImageDecodeEvidenceFRData03V1,
  type BrowserPixelRasterEvidenceFRData04V1,
  type BrowserPixelRasterProvenanceFRData04V1,
  type CaptureQualityRawEvidenceFRData05V1,
  type CaptureQualityRawMeasurementProvenanceFRData05V1,
  type MentonDatasetCaptureQualityRawObservationReportFRData05V1,
  type MentonDatasetImageDimensionEvidenceFRData02V1,
  type MentonDatasetIntakeManifestFRData01V1,
  type ProviderFaceCandidateEvidenceFRData06V1,
  type ProviderFaceCandidateRuntimeProvenanceFRData06V1,
} from '../packages/face-reading/src/index.js';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const RASTER_DIGEST = `sha256:${'b'.repeat(64)}`;

function manifest(): MentonDatasetIntakeManifestFRData01V1 {
  return {
    schemaVersion: 'fr-data01-intake-v1',
    dataset: {
      schemaVersion: 'fr47-dataset-v1',
      datasetRef: 'dataset.fr-data06.unit-contract',
      subjects: [{ subjectRef: 'subject-calibration', independentSubject: true, partition: 'calibration' }],
      captures: [{
        captureRef: 'capture-baseline',
        subjectRef: 'subject-calibration',
        stratum: 'neutral_frontal_baseline',
        canonicalAssetDigest: DIGEST,
        capturedAt: '2026-08-30T03:00:00Z',
        imageWidth: 2,
        imageHeight: 2,
        deviceRef: 'unit-contract-device',
        physicalCaptureInstanceRef: 'physical-baseline',
        neutralExpressionApplied: true,
        headPositionInstructionApplied: true,
        poseAxis: null,
        poseDegrees: null,
        groundTruthLockedBeforeProviderRun: true,
        providerRunRef: null,
        providerRunExecutedAfterGroundTruthLock: false,
      }],
      annotations: [{
        captureRef: 'capture-baseline',
        annotatorRef: 'unit-contract-annotator',
        targetName: 'soft_tissue_menton',
        x: 0.5,
        y: 0.75,
        providerOutputVisibleDuringAnnotation: false,
        annotationFrozenBeforeProviderScoring: true,
      }],
      groundTruthFrozen: false,
      providerRunsExecutedAfterFreeze: false,
    },
    assets: [{ captureRef: 'capture-baseline', relativeAssetPath: 'subject-calibration/baseline.png' }],
  };
}

function decoderProvenance(): BrowserDecoderProvenanceFRData03V1 {
  return {
    protocol: 'chrome_devtools_protocol',
    decodePrimitive: 'html_image_element_load_plus_decode',
    browserProduct: 'Google Chrome',
    browserVersion: 'Google Chrome 151.0.0.0',
    platform: 'Linux x86_64',
    runnerOS: 'Linux',
    runnerArch: 'X64',
    githubRunId: 'unit-contract-only',
    githubRunAttempt: '1',
    githubSha: 'not-runtime-evidence',
    verificationTimestamp: '2026-08-30T03:00:00Z',
    pageUrl: 'http://127.0.0.1:41000/fr-data04.html',
    pageOrigin: 'http://127.0.0.1:41000',
    pageReadyState: 'complete',
    deterministicReplay: true,
  };
}

function rasterProvenance(): BrowserPixelRasterProvenanceFRData04V1 {
  const decode = decoderProvenance();
  return {
    protocol: 'chrome_devtools_protocol',
    rasterPrimitive: 'canvas_2d_draw_image_get_image_data',
    browserProduct: decode.browserProduct,
    browserVersion: decode.browserVersion,
    platform: decode.platform,
    runnerOS: decode.runnerOS,
    runnerArch: decode.runnerArch,
    githubRunId: decode.githubRunId,
    githubRunAttempt: decode.githubRunAttempt,
    githubSha: decode.githubSha,
    verificationTimestamp: decode.verificationTimestamp,
    pageUrl: decode.pageUrl,
    pageOrigin: decode.pageOrigin,
    pageReadyState: decode.pageReadyState,
    deterministicReplay: true,
  };
}

function measurementProvenance(): CaptureQualityRawMeasurementProvenanceFRData05V1 {
  const raster = rasterProvenance();
  return {
    protocol: 'chrome_devtools_protocol',
    measurementPrimitive: 'canvas_rgba_integer_rgb_sum_neighbors_spatial_moments',
    browserProduct: raster.browserProduct,
    browserVersion: raster.browserVersion,
    platform: raster.platform,
    runnerOS: raster.runnerOS,
    runnerArch: raster.runnerArch,
    githubRunId: raster.githubRunId,
    githubRunAttempt: raster.githubRunAttempt,
    githubSha: raster.githubSha,
    verificationTimestamp: '2026-08-30T03:01:00Z',
    pageUrl: 'http://127.0.0.1:42000/fr-data05.html',
    pageOrigin: 'http://127.0.0.1:42000',
    pageReadyState: 'complete',
    deterministicReplay: true,
    rasterIdentityReconfirmedBySha256: true,
    numericRepresentation: 'javascript_safe_integer',
  };
}

function qualityEvidence(): CaptureQualityRawEvidenceFRData05V1 {
  return {
    captureRef: 'capture-baseline',
    relativeAssetPath: 'subject-calibration/baseline.png',
    actualDigest: DIGEST,
    rasterSha256: RASTER_DIGEST,
    status: 'measured',
    rasterWidth: 2,
    rasterHeight: 2,
    pixelCount: 4,
    alphaAllOpaque: true,
    rgbIntensity: {
      min: 60,
      max: 150,
      sum: 420,
      sumSquares: 48600,
      exactBlackPixelCount: 0,
      exactWhitePixelCount: 0,
      anyChannelZeroPixelCount: 0,
      anyChannelFullScalePixelCount: 0,
    },
    adjacentIntensityDifferences: {
      horizontal: { pairCount: 2, absoluteDifferenceSum: 60, squaredDifferenceSum: 1800 },
      vertical: { pairCount: 2, absoluteDifferenceSum: 120, squaredDifferenceSum: 7200 },
    },
    spatialIntensityMoments: { xIndexWeightedSum: 240, yIndexWeightedSum: 270 },
    errorCode: null,
  };
}

function prerequisites() {
  const input = manifest();
  const intake = buildMentonDatasetIntakeReportFRData01(input, [{
    captureRef: 'capture-baseline',
    relativeAssetPath: 'subject-calibration/baseline.png',
    actualDigest: DIGEST,
    byteLength: 86,
    contentSignature: 'image/png',
  }]);
  const dimensionEvidence: readonly MentonDatasetImageDimensionEvidenceFRData02V1[] = [{
    captureRef: 'capture-baseline',
    relativeAssetPath: 'subject-calibration/baseline.png',
    contentSignature: 'image/png',
    parserVariant: 'png_ihdr',
    width: 2,
    height: 2,
  }];
  const dimensions = buildMentonDatasetImageDimensionReportFRData02(input, dimensionEvidence);
  const decodeEvidence: readonly BrowserImageDecodeEvidenceFRData03V1[] = [{
    captureRef: 'capture-baseline',
    relativeAssetPath: 'subject-calibration/baseline.png',
    actualDigest: DIGEST,
    status: 'decoded',
    loadEventObserved: true,
    decodePromiseResolved: true,
    naturalWidth: 2,
    naturalHeight: 2,
    errorCode: null,
  }];
  const decode = buildMentonDatasetBrowserImageDecodeReportFRData03(
    input,
    intake,
    dimensions,
    decoderProvenance(),
    decodeEvidence,
  );
  const rasterEvidence: readonly BrowserPixelRasterEvidenceFRData04V1[] = [{
    captureRef: 'capture-baseline',
    relativeAssetPath: 'subject-calibration/baseline.png',
    actualDigest: DIGEST,
    status: 'rasterized',
    canvasDrawSucceeded: true,
    imageDataReadbackSucceeded: true,
    rasterWidth: 2,
    rasterHeight: 2,
    pixelCount: 4,
    rgbaByteLength: 16,
    rasterSha256: RASTER_DIGEST,
    red: { min: 10, max: 40, sum: 100 },
    green: { min: 20, max: 50, sum: 140 },
    blue: { min: 30, max: 60, sum: 180 },
    alpha: {
      min: 255,
      max: 255,
      sum: 1020,
      transparentPixelCount: 0,
      partialAlphaPixelCount: 0,
      opaquePixelCount: 4,
    },
    errorCode: null,
  }];
  const pixels = buildMentonDatasetBrowserPixelEvidenceReportFRData04(
    input,
    intake,
    dimensions,
    decode,
    rasterProvenance(),
    rasterEvidence,
  );
  const quality = buildMentonDatasetCaptureQualityRawObservationReportFRData05(
    input,
    intake,
    dimensions,
    pixels,
    measurementProvenance(),
    [qualityEvidence()],
  );
  return { input, intake, dimensions, pixels, quality };
}

function providerProvenance(
  overrides: Partial<ProviderFaceCandidateRuntimeProvenanceFRData06V1> = {},
): ProviderFaceCandidateRuntimeProvenanceFRData06V1 {
  const verified = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27;
  return {
    protocol: 'chrome_devtools_protocol',
    providerRuntime: 'mediapipe_tasks_vision_face_landmarker',
    runtimePackageName: verified.runtimePackageName,
    runtimePackageVersion: verified.runtimePackageVersion,
    packageBundleDigest: verified.installedPackageAssets.packageBundleDigest,
    wasmFiles: verified.installedPackageAssets.wasmFiles,
    modelAssetRef: FR26_MEDIAPIPE_FACE_LANDMARKER_MODEL,
    modelDigest: verified.model.independentByteDigest,
    modelByteLength: verified.model.byteLength,
    runningMode: 'IMAGE',
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
    sourceImagePrimitive: 'html_image_element_after_decode',
    rasterReconfirmationPrimitive: 'canvas_2d_get_image_data_sha256_before_provider_detect',
    browserProduct: 'Google Chrome',
    browserVersion: 'Google Chrome 151.0.0.0',
    platform: 'Linux x86_64',
    runnerOS: 'Linux',
    runnerArch: 'X64',
    githubRunId: 'unit-contract-only',
    githubRunAttempt: '1',
    githubSha: 'not-runtime-evidence',
    verificationTimestamp: '2026-08-30T03:02:00Z',
    pageUrl: 'http://127.0.0.1:43000/fr-data06.html',
    pageOrigin: 'http://127.0.0.1:43000',
    pageReadyState: 'complete',
    deterministicSummaryReplay: true,
    rawProviderResponsePersisted: false,
    rawProviderCoordinatesPersisted: false,
    ...overrides,
  };
}

function providerEvidence(
  overrides: Partial<ProviderFaceCandidateEvidenceFRData06V1> = {},
): ProviderFaceCandidateEvidenceFRData06V1 {
  return {
    captureRef: 'capture-baseline',
    relativeAssetPath: 'subject-calibration/baseline.png',
    actualDigest: DIGEST,
    rasterSha256: RASTER_DIGEST,
    status: 'observed',
    rasterIdentityReconfirmedBeforeProviderRun: true,
    providerResultRootFieldSet: ['faceBlendshapes', 'faceLandmarks', 'facialTransformationMatrixes'],
    faceCandidateCount: 0,
    candidateSummaries: [],
    faceBlendshapeCount: 0,
    facialTransformationMatrixCount: 0,
    errorCode: null,
    ...overrides,
  };
}

function build(
  qualityOverride?: MentonDatasetCaptureQualityRawObservationReportFRData05V1,
  evidence: ProviderFaceCandidateEvidenceFRData06V1 = providerEvidence(),
  provenance: ProviderFaceCandidateRuntimeProvenanceFRData06V1 = providerProvenance(),
) {
  const prerequisitesValue = prerequisites();
  return buildMentonDatasetProviderFaceCandidateObservationReportFRData06(
    prerequisitesValue.input,
    prerequisitesValue.intake,
    prerequisitesValue.dimensions,
    prerequisitesValue.pixels,
    qualityOverride ?? prerequisitesValue.quality,
    provenance,
    [evidence],
  );
}

describe('FR-DATA-06 provider face-candidate observation contract', () => {
  it('admits a zero-candidate provider result while keeping face-presence authority closed', () => {
    const report = build();
    expect(report.frData05CaptureQualityRawObservationVerified).toBe(true);
    expect(report.rasterIdentityReconfirmedBeforeProviderRun).toBe(true);
    expect(report.mediaPipeRuntimeExecuted).toBe(true);
    expect(report.providerFaceCandidateCountObserved).toBe(true);
    expect(report.captureObservations[0]?.faceCandidateCount).toBe(0);
    expect(report.facePresenceVerified).toBe(false);
    expect(report.singleHumanFaceVerified).toBe(false);
    expect(report.mediaPipeInferenceCorrectnessVerified).toBe(false);
    expect(report.productionGeometryAuthorized).toBe(false);
  });

  it('records one provider candidate without promoting it to a verified human face', () => {
    const report = build(undefined, providerEvidence({
      faceCandidateCount: 1,
      candidateSummaries: [{
        providerCandidateOrdinal: 0,
        landmarkCount: 478,
        landmarkFieldSet: ['visibility', 'x', 'y', 'z'],
        allXFiniteNormalized: true,
        allYFiniteNormalized: true,
        allZFinite: true,
        allVisibilityFiniteWhenPresent: true,
      }],
    }));
    expect(report.captureObservations[0]?.faceCandidateCount).toBe(1);
    expect(report.captureObservations[0]?.candidateSummaries[0]?.landmarkCount).toBe(478);
    expect(report.providerFaceCandidateHumanIdentityValidated).toBe(false);
    expect(report.facePresenceVerified).toBe(false);
  });

  it('rejects a drifted or authority-promoted FR-DATA-05 prerequisite', () => {
    const { quality } = prerequisites();
    const promoted = { ...quality, facePresenceVerified: true } as unknown as MentonDatasetCaptureQualityRawObservationReportFRData05V1;
    expect(() => build(promoted)).toThrow(/FR-DATA-05 prerequisite must be the exact canonical report/);
  });

  it('rejects raster identity drift before the provider run', () => {
    expect(() => build(undefined, providerEvidence({
      rasterSha256: `sha256:${'c'.repeat(64)}`,
    }))).toThrow(/raster identity drifted from FR-DATA-05/);
  });

  it('rejects runtime package or model provenance drift', () => {
    expect(() => build(undefined, providerEvidence(), providerProvenance({
      modelDigest: `sha256:${'d'.repeat(64)}`,
    }))).toThrow(/model identity must match/);
  });

  it('rejects a provider candidate count above the configured numFaces bound', () => {
    expect(() => build(undefined, providerEvidence({
      faceCandidateCount: 2,
      candidateSummaries: [],
    }))).toThrow(/faceCandidateCount exceeds configured provider numFaces/);
  });

  it('rejects malformed landmark payload summaries', () => {
    expect(() => build(undefined, providerEvidence({
      faceCandidateCount: 1,
      candidateSummaries: [{
        providerCandidateOrdinal: 0,
        landmarkCount: 478,
        landmarkFieldSet: ['x', 'y', 'z'],
        allXFiniteNormalized: true,
        allYFiniteNormalized: true,
        allZFinite: true,
        allVisibilityFiniteWhenPresent: true,
      }],
    }))).toThrow(/landmarkFieldSet mismatch/);
  });

  it('rejects outputs that were configured off', () => {
    expect(() => build(undefined, providerEvidence({
      faceBlendshapeCount: 1,
    }))).toThrow(/disabled provider outputs must remain empty/);
  });

  it('never promotes provider face-candidate observations directly to face-presence authority', () => {
    expect(() => assertMentonDatasetFacePresenceReadyForPromotionFRData06()).toThrow(
      /provider faceLandmarks candidate counts and landmark-payload summaries/,
    );
  });
});
