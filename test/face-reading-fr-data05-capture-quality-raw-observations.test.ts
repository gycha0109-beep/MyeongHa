import { describe, expect, it } from 'vitest';
import {
  assertMentonDatasetCaptureQualityReadyForPromotionFRData05,
  buildMentonDatasetBrowserImageDecodeReportFRData03,
  buildMentonDatasetBrowserPixelEvidenceReportFRData04,
  buildMentonDatasetCaptureQualityRawObservationReportFRData05,
  buildMentonDatasetImageDimensionReportFRData02,
  buildMentonDatasetIntakeReportFRData01,
  type BrowserDecoderProvenanceFRData03V1,
  type BrowserImageDecodeEvidenceFRData03V1,
  type BrowserPixelRasterEvidenceFRData04V1,
  type BrowserPixelRasterProvenanceFRData04V1,
  type CaptureQualityRawEvidenceFRData05V1,
  type CaptureQualityRawMeasurementProvenanceFRData05V1,
  type MentonDatasetImageDimensionEvidenceFRData02V1,
  type MentonDatasetIntakeManifestFRData01V1,
} from '../packages/face-reading/src/index.js';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const RASTER_DIGEST = `sha256:${'b'.repeat(64)}`;

function manifest(): MentonDatasetIntakeManifestFRData01V1 {
  return {
    schemaVersion: 'fr-data01-intake-v1',
    dataset: {
      schemaVersion: 'fr47-dataset-v1',
      datasetRef: 'dataset.fr-data05.unit-contract',
      subjects: [{ subjectRef: 'subject-calibration', independentSubject: true, partition: 'calibration' }],
      captures: [{
        captureRef: 'capture-baseline',
        subjectRef: 'subject-calibration',
        stratum: 'neutral_frontal_baseline',
        canonicalAssetDigest: DIGEST,
        capturedAt: '2026-08-30T02:00:00Z',
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
    platform: 'linux',
    runnerOS: 'Linux',
    runnerArch: 'X64',
    githubRunId: 'unit-contract-only',
    githubRunAttempt: '1',
    githubSha: 'not-runtime-evidence',
    verificationTimestamp: '2026-08-30T02:00:00Z',
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

function measurementProvenance(
  overrides: Partial<CaptureQualityRawMeasurementProvenanceFRData05V1> = {},
): CaptureQualityRawMeasurementProvenanceFRData05V1 {
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
    verificationTimestamp: '2026-08-30T02:01:00Z',
    pageUrl: 'http://127.0.0.1:42000/fr-data05.html',
    pageOrigin: 'http://127.0.0.1:42000',
    pageReadyState: 'complete',
    deterministicReplay: true,
    rasterIdentityReconfirmedBySha256: true,
    numericRepresentation: 'javascript_safe_integer',
    ...overrides,
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
  return { input, intake, dimensions, pixels };
}

function qualityEvidence(
  overrides: Partial<CaptureQualityRawEvidenceFRData05V1> = {},
): CaptureQualityRawEvidenceFRData05V1 {
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
    ...overrides,
  };
}

describe('FR-DATA-05 capture-quality raw observation contract', () => {
  it('admits threshold-free raw measurements while keeping all quality and semantic authority closed', () => {
    const { input, intake, dimensions, pixels } = prerequisites();
    const report = buildMentonDatasetCaptureQualityRawObservationReportFRData05(
      input,
      intake,
      dimensions,
      pixels,
      measurementProvenance(),
      [qualityEvidence()],
    );

    expect(report.frData04PixelRasterEvidenceVerified).toBe(true);
    expect(report.rasterIdentityReconfirmed).toBe(true);
    expect(report.thresholdFreeCaptureQualityInputsObserved).toBe(true);
    expect(report.rgbIntensityRawEvidenceObserved).toBe(true);
    expect(report.adjacentIntensityDifferenceRawEvidenceObserved).toBe(true);
    expect(report.spatialIntensityMomentRawEvidenceObserved).toBe(true);
    expect(report.captureObservations[0]).toMatchObject({
      captureRef: 'capture-baseline',
      rasterSha256: RASTER_DIGEST,
      rasterWidth: 2,
      rasterHeight: 2,
      pixelCount: 4,
      alphaAllOpaque: true,
    });

    expect(report.facePresenceVerified).toBe(false);
    expect(report.fullFaceFramingValidityVerified).toBe(false);
    expect(report.naturalHeadPositionValidityVerified).toBe(false);
    expect(report.sharpnessMetricValidated).toBe(false);
    expect(report.exposureMetricValidated).toBe(false);
    expect(report.lightingMetricValidated).toBe(false);
    expect(report.exposureAdequacyVerified).toBe(false);
    expect(report.lightingAdequacyVerified).toBe(false);
    expect(report.blurThresholdPassVerified).toBe(false);
    expect(report.occlusionValidityVerified).toBe(false);
    expect(report.captureQualityMetricConstructValidityValidated).toBe(false);
    expect(report.captureQualityThresholdsDefined).toBe(false);
    expect(report.captureQualityAuthorityValidated).toBe(false);
    expect(report.providerCandidateToMentonMappingValidated).toBe(false);
    expect(report.fr35PointToContourRelationValidated).toBe(false);
    expect(report.traditionalDigeEquivalenceValidated).toBe(false);
    expect(report.fr36VerticalReferencePromoted).toBe(false);
    expect(report.productionThreeDivisionsMetricAllowed).toBe(false);
    expect(report.productionF1Allowed).toBe(false);
    expect(report.productionF6Allowed).toBe(false);
    expect(report.productionGeometryAuthorized).toBe(false);
  });

  it('revalidates FR-DATA-04 and rejects unauthorized downstream promotion', () => {
    const { input, intake, dimensions, pixels } = prerequisites();
    const promoted = { ...pixels, facePresenceVerified: true } as unknown as typeof pixels;
    expect(() => buildMentonDatasetCaptureQualityRawObservationReportFRData05(
      input, intake, dimensions, promoted, measurementProvenance(), [qualityEvidence()],
    )).toThrow(/FR-DATA-04 prerequisite contains unauthorized downstream promotion: facePresenceVerified/);
  });

  it('requires exact FR-DATA-04 path, digest, raster identity, dimensions, and alpha state', () => {
    const { input, intake, dimensions, pixels } = prerequisites();
    expect(() => buildMentonDatasetCaptureQualityRawObservationReportFRData05(
      input, intake, dimensions, pixels, measurementProvenance(), [qualityEvidence({ relativeAssetPath: 'other.png' })],
    )).toThrow(/path drifted from FR-DATA-04/);
    expect(() => buildMentonDatasetCaptureQualityRawObservationReportFRData05(
      input, intake, dimensions, pixels, measurementProvenance(), [qualityEvidence({ rasterSha256: `sha256:${'c'.repeat(64)}` })],
    )).toThrow(/raster identity was not reconfirmed/);
    expect(() => buildMentonDatasetCaptureQualityRawObservationReportFRData05(
      input, intake, dimensions, pixels, measurementProvenance(), [qualityEvidence({ rasterWidth: 3 })],
    )).toThrow(/dimensions\/count must exactly match FR-DATA-04/);
    expect(() => buildMentonDatasetCaptureQualityRawObservationReportFRData05(
      input, intake, dimensions, pixels, measurementProvenance(), [qualityEvidence({ alphaAllOpaque: false })],
    )).toThrow(/alphaAllOpaque must exactly reflect FR-DATA-04/);
  });

  it('fails closed on measurement error and malformed intensity aggregates', () => {
    const { input, intake, dimensions, pixels } = prerequisites();
    expect(() => buildMentonDatasetCaptureQualityRawObservationReportFRData05(
      input,
      intake,
      dimensions,
      pixels,
      measurementProvenance(),
      [qualityEvidence({ status: 'measurement_error', errorCode: 'readback_failed' })],
    )).toThrow(/raw measurement failed closed/);
    expect(() => buildMentonDatasetCaptureQualityRawObservationReportFRData05(
      input,
      intake,
      dimensions,
      pixels,
      measurementProvenance(),
      [qualityEvidence({
        rgbIntensity: {
          min: 60,
          max: 150,
          sum: 1000,
          sumSquares: 48600,
          exactBlackPixelCount: 0,
          exactWhitePixelCount: 0,
          anyChannelZeroPixelCount: 0,
          anyChannelFullScalePixelCount: 0,
        },
      })],
    )).toThrow(/rgb intensity sum is inconsistent/);
  });

  it('binds channel saturation occupancy to FR-DATA-04 channel extrema', () => {
    const { input, intake, dimensions, pixels } = prerequisites();
    expect(() => buildMentonDatasetCaptureQualityRawObservationReportFRData05(
      input, intake, dimensions, pixels, measurementProvenance(), [qualityEvidence({
        rgbIntensity: {
          min: 60,
          max: 150,
          sum: 420,
          sumSquares: 48600,
          exactBlackPixelCount: 0,
          exactWhitePixelCount: 0,
          anyChannelZeroPixelCount: 1,
          anyChannelFullScalePixelCount: 0,
        },
      })],
    )).toThrow(/any-channel-zero occupancy must exactly agree with FR-DATA-04 channel minima/);
  });

  it('requires exact adjacency cardinality and bounded threshold-free difference aggregates', () => {
    const { input, intake, dimensions, pixels } = prerequisites();
    const badPairCount = qualityEvidence({
      adjacentIntensityDifferences: {
        horizontal: { pairCount: 3, absoluteDifferenceSum: 60, squaredDifferenceSum: 1800 },
        vertical: { pairCount: 2, absoluteDifferenceSum: 120, squaredDifferenceSum: 7200 },
      },
    });
    expect(() => buildMentonDatasetCaptureQualityRawObservationReportFRData05(
      input, intake, dimensions, pixels, measurementProvenance(), [badPairCount],
    )).toThrow(/horizontal pairCount must exactly equal raster adjacency count/);
  });

  it('bounds spatial intensity moments without introducing a quality threshold', () => {
    const { input, intake, dimensions, pixels } = prerequisites();
    expect(() => buildMentonDatasetCaptureQualityRawObservationReportFRData05(
      input,
      intake,
      dimensions,
      pixels,
      measurementProvenance(),
      [qualityEvidence({ spatialIntensityMoments: { xIndexWeightedSum: 421, yIndexWeightedSum: 270 } })],
    )).toThrow(/xIndexWeightedSum exceeds mathematical maximum/);
  });

  it('rejects duplicate, missing, and unknown capture-quality evidence', () => {
    const { input, intake, dimensions, pixels } = prerequisites();
    expect(() => buildMentonDatasetCaptureQualityRawObservationReportFRData05(
      input, intake, dimensions, pixels, measurementProvenance(), [],
    )).toThrow(/count must exactly equal FR-DATA-04 capture count/);
    expect(() => buildMentonDatasetCaptureQualityRawObservationReportFRData05(
      input, intake, dimensions, pixels, measurementProvenance(), [qualityEvidence(), qualityEvidence()],
    )).toThrow(/capture refs must be unique/);
    expect(() => buildMentonDatasetCaptureQualityRawObservationReportFRData05(
      input,
      intake,
      dimensions,
      pixels,
      measurementProvenance(),
      [qualityEvidence({ captureRef: 'capture-unknown' })],
    )).toThrow(/unknown capture capture-unknown/);
  });

  it('binds measurement provenance to the FR-DATA-04 browser binary and keeps promotion fail-closed', () => {
    const { input, intake, dimensions, pixels } = prerequisites();
    expect(() => buildMentonDatasetCaptureQualityRawObservationReportFRData05(
      input,
      intake,
      dimensions,
      pixels,
      measurementProvenance({ browserVersion: 'Google Chrome 152.0.0.0' }),
      [qualityEvidence()],
    )).toThrow(/browserVersion must exactly match FR-DATA-04/);
    expect(() => assertMentonDatasetCaptureQualityReadyForPromotionFRData05())
      .toThrow(/do not authorize sharpness, exposure, lighting, face presence/);
  });
});
