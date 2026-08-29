import {
  buildMentonDatasetBrowserImageDecodeReportFRData03,
  type BrowserImageDecodeEvidenceFRData03V1,
  type MentonDatasetBrowserImageDecodeReportFRData03V1,
} from './browser-image-decode-frdata03.js';
import type { MentonDatasetImageDimensionReportFRData02V1 } from './image-byte-dimensions-frdata02.js';
import type {
  MentonDatasetIntakeManifestFRData01V1,
  MentonDatasetIntakeReportFRData01V1,
} from './menton-dataset-intake-frdata01.js';
import { FaceAuthorityValidationError } from './validation.js';

export type BrowserPixelRasterStatusFRData04V1 =
  | 'rasterized'
  | 'draw_error'
  | 'readback_error'
  | 'digest_error';

export interface BrowserPixelChannelSummaryFRData04V1 {
  readonly min: number;
  readonly max: number;
  readonly sum: number;
}

export interface BrowserPixelAlphaSummaryFRData04V1 extends BrowserPixelChannelSummaryFRData04V1 {
  readonly transparentPixelCount: number;
  readonly partialAlphaPixelCount: number;
  readonly opaquePixelCount: number;
}

export interface BrowserPixelRasterEvidenceFRData04V1 {
  readonly captureRef: string;
  readonly relativeAssetPath: string;
  readonly actualDigest: string;
  readonly status: BrowserPixelRasterStatusFRData04V1;
  readonly canvasDrawSucceeded: boolean;
  readonly imageDataReadbackSucceeded: boolean;
  readonly rasterWidth: number;
  readonly rasterHeight: number;
  readonly pixelCount: number;
  readonly rgbaByteLength: number;
  readonly rasterSha256: string | null;
  readonly red: BrowserPixelChannelSummaryFRData04V1 | null;
  readonly green: BrowserPixelChannelSummaryFRData04V1 | null;
  readonly blue: BrowserPixelChannelSummaryFRData04V1 | null;
  readonly alpha: BrowserPixelAlphaSummaryFRData04V1 | null;
  readonly errorCode: string | null;
}

export interface BrowserPixelRasterProvenanceFRData04V1 {
  readonly protocol: 'chrome_devtools_protocol';
  readonly rasterPrimitive: 'canvas_2d_draw_image_get_image_data';
  readonly browserProduct: 'Google Chrome' | 'Chromium';
  readonly browserVersion: string;
  readonly platform: string;
  readonly runnerOS: string | null;
  readonly runnerArch: string | null;
  readonly githubRunId: string | null;
  readonly githubRunAttempt: string | null;
  readonly githubSha: string | null;
  readonly verificationTimestamp: string;
  readonly pageUrl: string;
  readonly pageOrigin: string;
  readonly pageReadyState: 'interactive' | 'complete';
  readonly deterministicReplay: true;
}

export interface MentonDatasetPixelRasterObservationFRData04V1 {
  readonly captureRef: string;
  readonly relativeAssetPath: string;
  readonly actualDigest: string;
  readonly rasterWidth: number;
  readonly rasterHeight: number;
  readonly pixelCount: number;
  readonly rgbaByteLength: number;
  readonly rasterSha256: string;
  readonly red: BrowserPixelChannelSummaryFRData04V1;
  readonly green: BrowserPixelChannelSummaryFRData04V1;
  readonly blue: BrowserPixelChannelSummaryFRData04V1;
  readonly alpha: BrowserPixelAlphaSummaryFRData04V1;
  readonly canvasDrawSucceeded: true;
  readonly imageDataReadbackSucceeded: true;
}

export interface MentonDatasetBrowserPixelEvidenceReportFRData04V1 {
  readonly schemaVersion: 'fr-data04-browser-pixel-evidence-v1';
  readonly datasetRef: string;
  readonly captureCount: number;
  readonly browserRasterProvenance: BrowserPixelRasterProvenanceFRData04V1;
  readonly captureObservations: readonly MentonDatasetPixelRasterObservationFRData04V1[];
  readonly frData01IntakeVerified: true;
  readonly imageDimensionsVerifiedAgainstBytes: true;
  readonly imageDecodabilityVerified: true;
  readonly frData03BrowserDecodeVerified: true;
  readonly browserRasterReadbackVerified: true;
  readonly decodedRasterSha256Observed: true;
  readonly thresholdFreePixelStatisticsObserved: true;
  readonly pixelContentIntegrityVerified: false;
  readonly facePresenceVerified: false;
  readonly fullFaceFramingValidityVerified: false;
  readonly neutralExpressionValidityVerified: false;
  readonly naturalHeadPositionValidityVerified: false;
  readonly lightingAdequacyVerified: false;
  readonly blurThresholdPassVerified: false;
  readonly occlusionValidityVerified: false;
  readonly captureQualityThresholdsDefined: false;
  readonly captureQualityAuthorityValidated: false;
  readonly mentonAnnotationCorrectnessVerified: false;
  readonly mediaPipeInferenceCorrectnessVerified: false;
  readonly empiricalScoringPerformed: false;
  readonly providerCandidateToMentonMappingValidated: false;
  readonly repeatedCaptureRepeatabilityValidated: false;
  readonly poseStabilityValidated: false;
  readonly calibrationThresholdsDefined: false;
  readonly fr35PointToContourRelationValidated: false;
  readonly traditionalDigeEquivalenceValidated: false;
  readonly fr36VerticalReferencePromoted: false;
  readonly productionThreeDivisionsMetricAllowed: false;
  readonly productionF1Allowed: false;
  readonly productionF6Allowed: false;
  readonly researchCandidateAdmitted: false;
  readonly productionGeometryAuthorized: false;
}

function fail(message: string): never {
  throw new FaceAuthorityValidationError(`FR-DATA-04 ${message}`);
}

function canonicalSha256(value: string, label: string): string {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) fail(`${label} must use canonical lowercase sha256:<64-hex> form.`);
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${label} must be a positive safe integer.`);
  return value;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} must be a non-negative safe integer.`);
  return value;
}

function exactDecodeEvidence(
  report: MentonDatasetBrowserImageDecodeReportFRData03V1,
): readonly BrowserImageDecodeEvidenceFRData03V1[] {
  return report.captureVerifications.map((entry) => Object.freeze({
    captureRef: entry.captureRef,
    relativeAssetPath: entry.relativeAssetPath,
    actualDigest: entry.actualDigest,
    status: 'decoded' as const,
    loadEventObserved: entry.loadEventObserved,
    decodePromiseResolved: entry.decodePromiseResolved,
    naturalWidth: entry.naturalWidth,
    naturalHeight: entry.naturalHeight,
    errorCode: null,
  }));
}

const MUST_REMAIN_FALSE_FRDATA03 = [
  'pixelContentIntegrityVerified',
  'facePresenceVerified',
  'fullFaceFramingValidityVerified',
  'neutralExpressionValidityVerified',
  'naturalHeadPositionValidityVerified',
  'lightingAdequacyVerified',
  'blurThresholdPassVerified',
  'occlusionValidityVerified',
  'captureQualityAuthorityValidated',
  'mentonAnnotationCorrectnessVerified',
  'mediaPipeInferenceCorrectnessVerified',
  'empiricalScoringPerformed',
  'providerCandidateToMentonMappingValidated',
  'repeatedCaptureRepeatabilityValidated',
  'poseStabilityValidated',
  'calibrationThresholdsDefined',
  'fr35PointToContourRelationValidated',
  'traditionalDigeEquivalenceValidated',
  'fr36VerticalReferencePromoted',
  'productionThreeDivisionsMetricAllowed',
  'productionF1Allowed',
  'productionF6Allowed',
  'researchCandidateAdmitted',
  'productionGeometryAuthorized',
] as const satisfies readonly (keyof MentonDatasetBrowserImageDecodeReportFRData03V1)[];

function validateDecodePrerequisite(
  manifest: MentonDatasetIntakeManifestFRData01V1,
  intakeReport: MentonDatasetIntakeReportFRData01V1,
  dimensionReport: MentonDatasetImageDimensionReportFRData02V1,
  decodeReport: MentonDatasetBrowserImageDecodeReportFRData03V1,
): MentonDatasetBrowserImageDecodeReportFRData03V1 {
  if (
    decodeReport.schemaVersion !== 'fr-data03-browser-image-decode-v1' ||
    decodeReport.datasetRef !== manifest.dataset.datasetRef ||
    decodeReport.captureCount !== manifest.dataset.captures.length ||
    decodeReport.frData01IntakeVerified !== true ||
    decodeReport.imageByteHeaderStructureVerified !== true ||
    decodeReport.imageDimensionsVerifiedAgainstBytes !== true ||
    decodeReport.browserNativeDecodeVerified !== true ||
    decodeReport.imageDecodabilityVerified !== true ||
    decodeReport.decodedNaturalDimensionsMatchEncodedDimensions !== true
  ) fail('FR-DATA-03 prerequisite is not fully verified for this exact dataset.');

  for (const key of MUST_REMAIN_FALSE_FRDATA03) {
    if (decodeReport[key] !== false) fail(`FR-DATA-03 prerequisite contains unauthorized downstream promotion: ${key}.`);
  }

  const canonical = buildMentonDatasetBrowserImageDecodeReportFRData03(
    manifest,
    intakeReport,
    dimensionReport,
    decodeReport.browserDecoderProvenance,
    exactDecodeEvidence(decodeReport),
  );
  if (canonical.captureVerifications.length !== decodeReport.captureVerifications.length) {
    fail('FR-DATA-03 prerequisite capture verification count drift.');
  }
  for (let index = 0; index < canonical.captureVerifications.length; index += 1) {
    const expected = canonical.captureVerifications[index];
    const actual = decodeReport.captureVerifications[index];
    if (expected === undefined || actual === undefined) {
      fail(`FR-DATA-03 prerequisite capture verification missing at index ${index}.`);
    }
    if (
      actual.captureRef !== expected.captureRef ||
      actual.relativeAssetPath !== expected.relativeAssetPath ||
      actual.actualDigest !== expected.actualDigest ||
      actual.encodedWidth !== expected.encodedWidth ||
      actual.encodedHeight !== expected.encodedHeight ||
      actual.naturalWidth !== expected.naturalWidth ||
      actual.naturalHeight !== expected.naturalHeight ||
      actual.loadEventObserved !== true ||
      actual.decodePromiseResolved !== true ||
      actual.decodedDimensionsMatchEncodedDimensions !== true
    ) fail(`FR-DATA-03 prerequisite capture verification drift at ${expected.captureRef}.`);
  }
  return canonical;
}

function validateRasterProvenance(
  provenance: BrowserPixelRasterProvenanceFRData04V1,
  decodeReport: MentonDatasetBrowserImageDecodeReportFRData03V1,
): void {
  if (
    provenance.protocol !== 'chrome_devtools_protocol' ||
    provenance.rasterPrimitive !== 'canvas_2d_draw_image_get_image_data'
  ) fail('browser raster provenance must identify CDP and Canvas 2D drawImage/getImageData.');
  const decode = decodeReport.browserDecoderProvenance;
  const exactPairs: readonly [unknown, unknown, string][] = [
    [provenance.browserProduct, decode.browserProduct, 'browserProduct'],
    [provenance.browserVersion, decode.browserVersion, 'browserVersion'],
    [provenance.platform, decode.platform, 'platform'],
    [provenance.runnerOS, decode.runnerOS, 'runnerOS'],
    [provenance.runnerArch, decode.runnerArch, 'runnerArch'],
    [provenance.githubRunId, decode.githubRunId, 'githubRunId'],
    [provenance.githubRunAttempt, decode.githubRunAttempt, 'githubRunAttempt'],
    [provenance.githubSha, decode.githubSha, 'githubSha'],
    [provenance.verificationTimestamp, decode.verificationTimestamp, 'verificationTimestamp'],
    [provenance.pageUrl, decode.pageUrl, 'pageUrl'],
    [provenance.pageOrigin, decode.pageOrigin, 'pageOrigin'],
    [provenance.pageReadyState, decode.pageReadyState, 'pageReadyState'],
  ];
  for (const [actual, expected, label] of exactPairs) {
    if (actual !== expected) fail(`browser raster provenance ${label} must exactly match the FR-DATA-03 browser run.`);
  }
  if (provenance.deterministicReplay !== true || decode.deterministicReplay !== true) {
    fail('browser raster and decode evidence must both replay deterministically.');
  }
}

function validateChannel(
  summary: BrowserPixelChannelSummaryFRData04V1 | null,
  pixelCount: number,
  label: string,
): BrowserPixelChannelSummaryFRData04V1 {
  if (summary === null || typeof summary !== 'object') fail(`${label} channel summary is required.`);
  const min = nonNegativeInteger(summary.min, `${label}.min`);
  const max = nonNegativeInteger(summary.max, `${label}.max`);
  const sum = nonNegativeInteger(summary.sum, `${label}.sum`);
  if (min > 255 || max > 255 || min > max) fail(`${label} channel min/max must satisfy 0 <= min <= max <= 255.`);
  const minimumPossibleSum = min === max ? min * pixelCount : min * (pixelCount - 1) + max;
  const maximumPossibleSum = min === max ? max * pixelCount : max * (pixelCount - 1) + min;
  if (sum < minimumPossibleSum || sum > maximumPossibleSum) {
    fail(`${label} channel sum is inconsistent with its observed min/max and pixel count.`);
  }
  return Object.freeze({ min, max, sum });
}

function validateAlpha(
  summary: BrowserPixelAlphaSummaryFRData04V1 | null,
  pixelCount: number,
): BrowserPixelAlphaSummaryFRData04V1 {
  const base = validateChannel(summary, pixelCount, 'alpha');
  if (summary === null) fail('alpha channel summary is required.');
  const transparentPixelCount = nonNegativeInteger(summary.transparentPixelCount, 'alpha.transparentPixelCount');
  const partialAlphaPixelCount = nonNegativeInteger(summary.partialAlphaPixelCount, 'alpha.partialAlphaPixelCount');
  const opaquePixelCount = nonNegativeInteger(summary.opaquePixelCount, 'alpha.opaquePixelCount');
  if (transparentPixelCount + partialAlphaPixelCount + opaquePixelCount !== pixelCount) {
    fail('alpha occupancy counts must exactly partition the raster pixel count.');
  }
  if ((transparentPixelCount > 0) !== (base.min === 0)) {
    fail('alpha transparent occupancy must exactly agree with the observed alpha minimum.');
  }
  if ((opaquePixelCount > 0) !== (base.max === 255)) {
    fail('alpha opaque occupancy must exactly agree with the observed alpha maximum.');
  }
  if (partialAlphaPixelCount > 0 && (base.min === 255 || base.max === 0)) {
    fail('alpha partial occupancy contradicts the observed alpha range.');
  }
  return Object.freeze({
    ...base,
    transparentPixelCount,
    partialAlphaPixelCount,
    opaquePixelCount,
  });
}

export function buildMentonDatasetBrowserPixelEvidenceReportFRData04(
  manifest: MentonDatasetIntakeManifestFRData01V1,
  intakeReport: MentonDatasetIntakeReportFRData01V1,
  dimensionReport: MentonDatasetImageDimensionReportFRData02V1,
  decodeReport: MentonDatasetBrowserImageDecodeReportFRData03V1,
  browserRasterProvenance: BrowserPixelRasterProvenanceFRData04V1,
  evidence: readonly BrowserPixelRasterEvidenceFRData04V1[],
): MentonDatasetBrowserPixelEvidenceReportFRData04V1 {
  const canonicalDecode = validateDecodePrerequisite(manifest, intakeReport, dimensionReport, decodeReport);
  validateRasterProvenance(browserRasterProvenance, canonicalDecode);

  if (new Set(evidence.map((entry) => entry.captureRef)).size !== evidence.length) {
    fail('browser raster evidence capture refs must be unique.');
  }
  if (evidence.length !== canonicalDecode.captureVerifications.length) {
    fail('browser raster evidence count must exactly equal the FR-DATA-03 capture count.');
  }

  const expectedRefs = new Set(canonicalDecode.captureVerifications.map((entry) => entry.captureRef));
  for (const entry of evidence) {
    if (!expectedRefs.has(entry.captureRef)) fail(`browser raster evidence references unknown capture ${entry.captureRef}.`);
  }

  const captureObservations = canonicalDecode.captureVerifications.map((decode) => {
    const entry = evidence.find((candidate) => candidate.captureRef === decode.captureRef);
    if (!entry) fail(`capture ${decode.captureRef} is missing browser raster evidence.`);
    if (entry.relativeAssetPath !== decode.relativeAssetPath) fail(`capture ${decode.captureRef} path drifted from FR-DATA-03.`);
    canonicalSha256(entry.actualDigest, `capture ${decode.captureRef} actualDigest`);
    if (entry.actualDigest !== decode.actualDigest) fail(`capture ${decode.captureRef} asset digest drifted from FR-DATA-03.`);
    if (entry.status !== 'rasterized') {
      fail(`capture ${decode.captureRef} browser rasterization failed closed with status ${entry.status}${entry.errorCode ? ` (${entry.errorCode})` : ''}.`);
    }
    if (entry.canvasDrawSucceeded !== true || entry.imageDataReadbackSucceeded !== true) {
      fail(`capture ${decode.captureRef} requires successful Canvas drawImage and getImageData readback.`);
    }
    const rasterWidth = positiveInteger(entry.rasterWidth, `capture ${decode.captureRef} rasterWidth`);
    const rasterHeight = positiveInteger(entry.rasterHeight, `capture ${decode.captureRef} rasterHeight`);
    if (rasterWidth !== decode.naturalWidth || rasterHeight !== decode.naturalHeight) {
      fail(`capture ${decode.captureRef} raster dimensions must exactly equal FR-DATA-03 natural dimensions.`);
    }
    const expectedPixelCount = rasterWidth * rasterHeight;
    if (!Number.isSafeInteger(expectedPixelCount)) fail(`capture ${decode.captureRef} raster area exceeds safe integer range.`);
    const pixelCount = positiveInteger(entry.pixelCount, `capture ${decode.captureRef} pixelCount`);
    if (pixelCount !== expectedPixelCount) fail(`capture ${decode.captureRef} pixelCount must equal rasterWidth * rasterHeight.`);
    const expectedRgbaByteLength = pixelCount * 4;
    if (!Number.isSafeInteger(expectedRgbaByteLength)) fail(`capture ${decode.captureRef} RGBA byte length exceeds safe integer range.`);
    const rgbaByteLength = positiveInteger(entry.rgbaByteLength, `capture ${decode.captureRef} rgbaByteLength`);
    if (rgbaByteLength !== expectedRgbaByteLength) fail(`capture ${decode.captureRef} RGBA byte length must equal pixelCount * 4.`);
    if (entry.rasterSha256 === null) fail(`capture ${decode.captureRef} raster SHA-256 is required.`);
    const rasterSha256 = canonicalSha256(entry.rasterSha256, `capture ${decode.captureRef} rasterSha256`);
    const red = validateChannel(entry.red, pixelCount, `capture ${decode.captureRef}.red`);
    const green = validateChannel(entry.green, pixelCount, `capture ${decode.captureRef}.green`);
    const blue = validateChannel(entry.blue, pixelCount, `capture ${decode.captureRef}.blue`);
    const alpha = validateAlpha(entry.alpha, pixelCount);
    return Object.freeze({
      captureRef: decode.captureRef,
      relativeAssetPath: decode.relativeAssetPath,
      actualDigest: decode.actualDigest,
      rasterWidth,
      rasterHeight,
      pixelCount,
      rgbaByteLength,
      rasterSha256,
      red,
      green,
      blue,
      alpha,
      canvasDrawSucceeded: true as const,
      imageDataReadbackSucceeded: true as const,
    });
  });

  return Object.freeze({
    schemaVersion: 'fr-data04-browser-pixel-evidence-v1' as const,
    datasetRef: manifest.dataset.datasetRef,
    captureCount: canonicalDecode.captureCount,
    browserRasterProvenance: Object.freeze({ ...browserRasterProvenance }),
    captureObservations: Object.freeze(captureObservations),
    frData01IntakeVerified: true as const,
    imageDimensionsVerifiedAgainstBytes: true as const,
    imageDecodabilityVerified: true as const,
    frData03BrowserDecodeVerified: true as const,
    browserRasterReadbackVerified: true as const,
    decodedRasterSha256Observed: true as const,
    thresholdFreePixelStatisticsObserved: true as const,
    pixelContentIntegrityVerified: false as const,
    facePresenceVerified: false as const,
    fullFaceFramingValidityVerified: false as const,
    neutralExpressionValidityVerified: false as const,
    naturalHeadPositionValidityVerified: false as const,
    lightingAdequacyVerified: false as const,
    blurThresholdPassVerified: false as const,
    occlusionValidityVerified: false as const,
    captureQualityThresholdsDefined: false as const,
    captureQualityAuthorityValidated: false as const,
    mentonAnnotationCorrectnessVerified: false as const,
    mediaPipeInferenceCorrectnessVerified: false as const,
    empiricalScoringPerformed: false as const,
    providerCandidateToMentonMappingValidated: false as const,
    repeatedCaptureRepeatabilityValidated: false as const,
    poseStabilityValidated: false as const,
    calibrationThresholdsDefined: false as const,
    fr35PointToContourRelationValidated: false as const,
    traditionalDigeEquivalenceValidated: false as const,
    fr36VerticalReferencePromoted: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
    researchCandidateAdmitted: false as const,
    productionGeometryAuthorized: false as const,
  });
}

export function assertMentonDatasetPixelEvidenceReadyForCaptureQualityPromotionFRData04(): never {
  fail(
    'browser raster readback and threshold-free pixel statistics do not authorize face presence, framing, pose, expression, lighting, blur, occlusion, capture-quality, anatomical, traditional, or production promotion.',
  );
}
