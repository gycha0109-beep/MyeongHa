import { describe, expect, it } from 'vitest';
import {
  assertMentonDatasetBrowserDecodeReadyForProductionFRData03,
  buildMentonDatasetBrowserImageDecodeReportFRData03,
  buildMentonDatasetImageDimensionReportFRData02,
  buildMentonDatasetIntakeReportFRData01,
  type BrowserDecoderProvenanceFRData03V1,
  type BrowserImageDecodeEvidenceFRData03V1,
  type MentonDatasetImageDimensionEvidenceFRData02V1,
  type MentonDatasetIntakeManifestFRData01V1,
} from '../packages/face-reading/src/index.js';

const DIGEST = `sha256:${'a'.repeat(64)}`;

function manifest(): MentonDatasetIntakeManifestFRData01V1 {
  return {
    schemaVersion: 'fr-data01-intake-v1',
    dataset: {
      schemaVersion: 'fr47-dataset-v1',
      datasetRef: 'dataset.fr-data03.unit-contract',
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

function prerequisites() {
  const input = manifest();
  const intake = buildMentonDatasetIntakeReportFRData01(input, [{
    captureRef: 'capture-baseline',
    relativeAssetPath: 'subject-calibration/baseline.png',
    actualDigest: DIGEST,
    byteLength: 70,
    contentSignature: 'image/png',
  }]);
  const dimensions: readonly MentonDatasetImageDimensionEvidenceFRData02V1[] = [{
    captureRef: 'capture-baseline',
    relativeAssetPath: 'subject-calibration/baseline.png',
    contentSignature: 'image/png',
    parserVariant: 'png_ihdr',
    width: 2,
    height: 2,
  }];
  const dimensionReport = buildMentonDatasetImageDimensionReportFRData02(input, dimensions);
  return { input, intake, dimensionReport };
}

function provenance(): BrowserDecoderProvenanceFRData03V1 {
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
    pageUrl: 'http://127.0.0.1:41000/fr-data03.html',
    pageOrigin: 'http://127.0.0.1:41000',
    pageReadyState: 'complete',
    deterministicReplay: true,
  };
}

function decodedEvidence(overrides: Partial<BrowserImageDecodeEvidenceFRData03V1> = {}): BrowserImageDecodeEvidenceFRData03V1 {
  return {
    captureRef: 'capture-baseline',
    relativeAssetPath: 'subject-calibration/baseline.png',
    actualDigest: DIGEST,
    status: 'decoded',
    loadEventObserved: true,
    decodePromiseResolved: true,
    naturalWidth: 2,
    naturalHeight: 2,
    errorCode: null,
    ...overrides,
  };
}

describe('FR-DATA-03 browser image decode contract', () => {
  it('admits exact browser decode evidence only while keeping all facial/semantic authority closed', () => {
    const { input, intake, dimensionReport } = prerequisites();
    const report = buildMentonDatasetBrowserImageDecodeReportFRData03(
      input,
      intake,
      dimensionReport,
      provenance(),
      [decodedEvidence()],
    );
    expect(report.frData01IntakeVerified).toBe(true);
    expect(report.imageByteHeaderStructureVerified).toBe(true);
    expect(report.imageDimensionsVerifiedAgainstBytes).toBe(true);
    expect(report.browserNativeDecodeVerified).toBe(true);
    expect(report.imageDecodabilityVerified).toBe(true);
    expect(report.decodedNaturalDimensionsMatchEncodedDimensions).toBe(true);
    expect(report.captureVerifications[0]).toMatchObject({
      captureRef: 'capture-baseline', actualDigest: DIGEST,
      encodedWidth: 2, encodedHeight: 2, naturalWidth: 2, naturalHeight: 2,
      loadEventObserved: true, decodePromiseResolved: true,
      decodedDimensionsMatchEncodedDimensions: true,
    });
    expect(report.pixelContentIntegrityVerified).toBe(false);
    expect(report.facePresenceVerified).toBe(false);
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

  it('refuses FR-DATA-03 admission when FR-DATA-01 or FR-DATA-02 prerequisites are not exact', () => {
    const { input, intake, dimensionReport } = prerequisites();
    const badIntake = { ...intake, assetDigestsVerified: false } as unknown as typeof intake;
    expect(() => buildMentonDatasetBrowserImageDecodeReportFRData03(input, badIntake, dimensionReport, provenance(), [decodedEvidence()]))
      .toThrow(/FR-DATA-01 intake prerequisite/);
    const badDimensions = { ...dimensionReport, imageDimensionsVerifiedAgainstBytes: false } as unknown as typeof dimensionReport;
    expect(() => buildMentonDatasetBrowserImageDecodeReportFRData03(input, intake, badDimensions, provenance(), [decodedEvidence()]))
      .toThrow(/FR-DATA-02 byte-derived dimension prerequisite/);
  });

  it('fails closed on browser load/decode failure and zero natural dimensions', () => {
    const { input, intake, dimensionReport } = prerequisites();
    expect(() => buildMentonDatasetBrowserImageDecodeReportFRData03(
      input, intake, dimensionReport, provenance(),
      [decodedEvidence({ status: 'load_error', loadEventObserved: false, decodePromiseResolved: false, naturalWidth: 0, naturalHeight: 0, errorCode: 'image_error_event' })],
    )).toThrow(/browser decoder failed closed/);
    expect(() => buildMentonDatasetBrowserImageDecodeReportFRData03(
      input, intake, dimensionReport, provenance(), [decodedEvidence({ naturalWidth: 0 })],
    )).toThrow(/naturalWidth must be a positive integer/);
  });

  it('requires exact natural-dimension equality with FR-DATA-02', () => {
    const { input, intake, dimensionReport } = prerequisites();
    expect(() => buildMentonDatasetBrowserImageDecodeReportFRData03(
      input, intake, dimensionReport, provenance(), [decodedEvidence({ naturalWidth: 3 })],
    )).toThrow(/do not match FR-DATA-02 encoded dimensions 2x2/);
  });

  it('rejects missing, duplicate, and unknown capture evidence', () => {
    const { input, intake, dimensionReport } = prerequisites();
    expect(() => buildMentonDatasetBrowserImageDecodeReportFRData03(input, intake, dimensionReport, provenance(), []))
      .toThrow(/count must exactly equal/);
    expect(() => buildMentonDatasetBrowserImageDecodeReportFRData03(
      input, intake, dimensionReport, provenance(), [decodedEvidence(), decodedEvidence()],
    )).toThrow(/capture refs must be unique/);
    expect(() => buildMentonDatasetBrowserImageDecodeReportFRData03(
      input, intake, dimensionReport, provenance(), [decodedEvidence({ captureRef: 'capture-unknown' })],
    )).toThrow(/unknown capture capture-unknown/);
  });

  it('binds browser evidence to exact capture path and asset digest', () => {
    const { input, intake, dimensionReport } = prerequisites();
    expect(() => buildMentonDatasetBrowserImageDecodeReportFRData03(
      input, intake, dimensionReport, provenance(), [decodedEvidence({ relativeAssetPath: 'other.png' })],
    )).toThrow(/path drifted/);
    expect(() => buildMentonDatasetBrowserImageDecodeReportFRData03(
      input, intake, dimensionReport, provenance(), [decodedEvidence({ actualDigest: `sha256:${'b'.repeat(64)}` })],
    )).toThrow(/does not match the FR-47 canonical asset digest/);
  });

  it('requires deterministic local browser provenance and blocks production promotion', () => {
    const { input, intake, dimensionReport } = prerequisites();
    const badProvenance = { ...provenance(), deterministicReplay: false } as unknown as BrowserDecoderProvenanceFRData03V1;
    expect(() => buildMentonDatasetBrowserImageDecodeReportFRData03(input, intake, dimensionReport, badProvenance, [decodedEvidence()]))
      .toThrow(/replay deterministically/);
    expect(() => assertMentonDatasetBrowserDecodeReadyForProductionFRData03()).toThrow(/does not authorize/);
  });
});
