import { describe, expect, it } from 'vitest';
import {
  assertMentonDatasetPixelEvidenceReadyForCaptureQualityPromotionFRData04,
  buildMentonDatasetBrowserImageDecodeReportFRData03,
  buildMentonDatasetBrowserPixelEvidenceReportFRData04,
  buildMentonDatasetImageDimensionReportFRData02,
  buildMentonDatasetIntakeReportFRData01,
  type BrowserDecoderProvenanceFRData03V1,
  type BrowserImageDecodeEvidenceFRData03V1,
  type BrowserPixelRasterEvidenceFRData04V1,
  type BrowserPixelRasterProvenanceFRData04V1,
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
      datasetRef: 'dataset.fr-data04.unit-contract',
      subjects: [{ subjectRef: 'subject-calibration', independentSubject: true, partition: 'calibration' }],
      captures: [{
        captureRef: 'capture-baseline',
        subjectRef: 'subject-calibration',
        stratum: 'neutral_frontal_baseline',
        canonicalAssetDigest: DIGEST,
        capturedAt: '2026-08-30T00:00:00Z',
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
    verificationTimestamp: '2026-08-30T00:00:00Z',
    pageUrl: 'http://127.0.0.1:41000/fr-data04.html',
    pageOrigin: 'http://127.0.0.1:41000',
    pageReadyState: 'complete',
    deterministicReplay: true,
  };
}

function rasterProvenance(overrides: Partial<BrowserPixelRasterProvenanceFRData04V1> = {}): BrowserPixelRasterProvenanceFRData04V1 {
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
  return { input, intake, dimensions, decode };
}

function rasterEvidence(overrides: Partial<BrowserPixelRasterEvidenceFRData04V1> = {}): BrowserPixelRasterEvidenceFRData04V1 {
  return {
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
    ...overrides,
  };
}

describe('FR-DATA-04 browser pixel evidence contract', () => {
  it('admits exact raster readback evidence while keeping capture-quality and semantic authority closed', () => {
    const { input, intake, dimensions, decode } = prerequisites();
    const report = buildMentonDatasetBrowserPixelEvidenceReportFRData04(
      input,
      intake,
      dimensions,
      decode,
      rasterProvenance(),
      [rasterEvidence()],
    );

    expect(report.frData03BrowserDecodeVerified).toBe(true);
    expect(report.browserRasterReadbackVerified).toBe(true);
    expect(report.decodedRasterSha256Observed).toBe(true);
    expect(report.thresholdFreePixelStatisticsObserved).toBe(true);
    expect(report.captureObservations[0]).toMatchObject({
      captureRef: 'capture-baseline',
      actualDigest: DIGEST,
      rasterWidth: 2,
      rasterHeight: 2,
      pixelCount: 4,
      rgbaByteLength: 16,
      rasterSha256: RASTER_DIGEST,
      canvasDrawSucceeded: true,
      imageDataReadbackSucceeded: true,
    });

    expect(report.pixelContentIntegrityVerified).toBe(false);
    expect(report.facePresenceVerified).toBe(false);
    expect(report.fullFaceFramingValidityVerified).toBe(false);
    expect(report.neutralExpressionValidityVerified).toBe(false);
    expect(report.naturalHeadPositionValidityVerified).toBe(false);
    expect(report.lightingAdequacyVerified).toBe(false);
    expect(report.blurThresholdPassVerified).toBe(false);
    expect(report.occlusionValidityVerified).toBe(false);
    expect(report.captureQualityThresholdsDefined).toBe(false);
    expect(report.captureQualityAuthorityValidated).toBe(false);
    expect(report.mentonAnnotationCorrectnessVerified).toBe(false);
    expect(report.mediaPipeInferenceCorrectnessVerified).toBe(false);
    expect(report.providerCandidateToMentonMappingValidated).toBe(false);
    expect(report.repeatedCaptureRepeatabilityValidated).toBe(false);
    expect(report.poseStabilityValidated).toBe(false);
    expect(report.calibrationThresholdsDefined).toBe(false);
    expect(report.fr35PointToContourRelationValidated).toBe(false);
    expect(report.traditionalDigeEquivalenceValidated).toBe(false);
    expect(report.fr36VerticalReferencePromoted).toBe(false);
    expect(report.productionThreeDivisionsMetricAllowed).toBe(false);
    expect(report.productionF1Allowed).toBe(false);
    expect(report.productionF6Allowed).toBe(false);
    expect(report.productionGeometryAuthorized).toBe(false);
  });

  it('requires an exact FR-DATA-03 prerequisite with no unauthorized downstream promotion', () => {
    const { input, intake, dimensions, decode } = prerequisites();
    const incomplete = { ...decode, imageDecodabilityVerified: false } as unknown as typeof decode;
    expect(() => buildMentonDatasetBrowserPixelEvidenceReportFRData04(
      input, intake, dimensions, incomplete, rasterProvenance(), [rasterEvidence()],
    )).toThrow(/FR-DATA-03 prerequisite is not fully verified/);

    const promoted = { ...decode, facePresenceVerified: true } as unknown as typeof decode;
    expect(() => buildMentonDatasetBrowserPixelEvidenceReportFRData04(
      input, intake, dimensions, promoted, rasterProvenance(), [rasterEvidence()],
    )).toThrow(/unauthorized downstream promotion: facePresenceVerified/);
  });

  it('binds raster evidence to exact FR-DATA-03 capture path, digest, and natural dimensions', () => {
    const { input, intake, dimensions, decode } = prerequisites();
    expect(() => buildMentonDatasetBrowserPixelEvidenceReportFRData04(
      input, intake, dimensions, decode, rasterProvenance(), [rasterEvidence({ relativeAssetPath: 'other.png' })],
    )).toThrow(/path drifted from FR-DATA-03/);
    expect(() => buildMentonDatasetBrowserPixelEvidenceReportFRData04(
      input, intake, dimensions, decode, rasterProvenance(), [rasterEvidence({ actualDigest: `sha256:${'c'.repeat(64)}` })],
    )).toThrow(/asset digest drifted from FR-DATA-03/);
    expect(() => buildMentonDatasetBrowserPixelEvidenceReportFRData04(
      input, intake, dimensions, decode, rasterProvenance(), [rasterEvidence({ rasterWidth: 3 })],
    )).toThrow(/raster dimensions must exactly equal/);
  });

  it('fails closed on rasterization/readback failure, malformed raster digest, and byte-count drift', () => {
    const { input, intake, dimensions, decode } = prerequisites();
    expect(() => buildMentonDatasetBrowserPixelEvidenceReportFRData04(
      input, intake, dimensions, decode, rasterProvenance(), [rasterEvidence({
        status: 'readback_error',
        imageDataReadbackSucceeded: false,
        rasterSha256: null,
        red: null,
        green: null,
        blue: null,
        alpha: null,
        errorCode: 'get_image_data_failed',
      })],
    )).toThrow(/failed closed with status readback_error/);
    expect(() => buildMentonDatasetBrowserPixelEvidenceReportFRData04(
      input, intake, dimensions, decode, rasterProvenance(), [rasterEvidence({ rasterSha256: 'sha256:not-a-digest' })],
    )).toThrow(/rasterSha256 must use canonical/);
    expect(() => buildMentonDatasetBrowserPixelEvidenceReportFRData04(
      input, intake, dimensions, decode, rasterProvenance(), [rasterEvidence({ rgbaByteLength: 12 })],
    )).toThrow(/RGBA byte length must equal/);
  });

  it('requires exact threshold-free channel summaries and alpha occupancy partitioning', () => {
    const { input, intake, dimensions, decode } = prerequisites();
    expect(() => buildMentonDatasetBrowserPixelEvidenceReportFRData04(
      input, intake, dimensions, decode, rasterProvenance(), [rasterEvidence({ red: { min: 10, max: 20, sum: 100 } })],
    )).toThrow(/red channel sum is inconsistent/);
    expect(() => buildMentonDatasetBrowserPixelEvidenceReportFRData04(
      input, intake, dimensions, decode, rasterProvenance(), [rasterEvidence({
        alpha: {
          min: 255,
          max: 255,
          sum: 1020,
          transparentPixelCount: 0,
          partialAlphaPixelCount: 0,
          opaquePixelCount: 3,
        },
      })],
    )).toThrow(/alpha occupancy counts must exactly partition/);
  });

  it('rejects missing, duplicate, and unknown raster evidence', () => {
    const { input, intake, dimensions, decode } = prerequisites();
    expect(() => buildMentonDatasetBrowserPixelEvidenceReportFRData04(
      input, intake, dimensions, decode, rasterProvenance(), [],
    )).toThrow(/count must exactly equal/);
    expect(() => buildMentonDatasetBrowserPixelEvidenceReportFRData04(
      input, intake, dimensions, decode, rasterProvenance(), [rasterEvidence(), rasterEvidence()],
    )).toThrow(/capture refs must be unique/);
    expect(() => buildMentonDatasetBrowserPixelEvidenceReportFRData04(
      input, intake, dimensions, decode, rasterProvenance(), [rasterEvidence({ captureRef: 'capture-unknown' })],
    )).toThrow(/unknown capture capture-unknown/);
  });

  it('requires the pixel readback to come from the exact same deterministic browser run as FR-DATA-03', () => {
    const { input, intake, dimensions, decode } = prerequisites();
    expect(() => buildMentonDatasetBrowserPixelEvidenceReportFRData04(
      input,
      intake,
      dimensions,
      decode,
      rasterProvenance({ browserVersion: 'Google Chrome 152.0.0.0' }),
      [rasterEvidence()],
    )).toThrow(/browserVersion must exactly match the FR-DATA-03 browser run/);
    expect(() => assertMentonDatasetPixelEvidenceReadyForCaptureQualityPromotionFRData04())
      .toThrow(/do not authorize face presence, framing, pose, expression, lighting, blur, occlusion, capture-quality/);
  });
});
