import {
  buildMentonDatasetBrowserImageDecodeReportFRData03,
  type BrowserDecoderProvenanceFRData03V1,
  type BrowserImageDecodeEvidenceFRData03V1,
} from './browser-image-decode-frdata03.js';
import {
  buildMentonDatasetBrowserPixelEvidenceReportFRData04,
  type BrowserPixelRasterEvidenceFRData04V1,
  type MentonDatasetBrowserPixelEvidenceReportFRData04V1,
} from './browser-pixel-evidence-frdata04.js';
import type { MentonDatasetImageDimensionReportFRData02V1 } from './image-byte-dimensions-frdata02.js';
import type {
  MentonDatasetIntakeManifestFRData01V1,
  MentonDatasetIntakeReportFRData01V1,
} from './menton-dataset-intake-frdata01.js';
import { FaceAuthorityValidationError } from './validation.js';

export type CaptureQualityRawMeasurementStatusFRData05V1 = 'measured' | 'measurement_error';

export interface RgbIntensitySummaryFRData05V1 {
  readonly min: number;
  readonly max: number;
  readonly sum: number;
  readonly sumSquares: number;
  readonly exactBlackPixelCount: number;
  readonly exactWhitePixelCount: number;
  readonly anyChannelZeroPixelCount: number;
  readonly anyChannelFullScalePixelCount: number;
}

export interface AdjacentIntensityDifferenceAxisFRData05V1 {
  readonly pairCount: number;
  readonly absoluteDifferenceSum: number;
  readonly squaredDifferenceSum: number;
}

export interface AdjacentIntensityDifferenceSummaryFRData05V1 {
  readonly horizontal: AdjacentIntensityDifferenceAxisFRData05V1;
  readonly vertical: AdjacentIntensityDifferenceAxisFRData05V1;
}

export interface SpatialIntensityMomentSummaryFRData05V1 {
  readonly xIndexWeightedSum: number;
  readonly yIndexWeightedSum: number;
}

export interface CaptureQualityRawEvidenceFRData05V1 {
  readonly captureRef: string;
  readonly relativeAssetPath: string;
  readonly actualDigest: string;
  readonly rasterSha256: string;
  readonly status: CaptureQualityRawMeasurementStatusFRData05V1;
  readonly rasterWidth: number;
  readonly rasterHeight: number;
  readonly pixelCount: number;
  readonly alphaAllOpaque: boolean;
  readonly rgbIntensity: RgbIntensitySummaryFRData05V1 | null;
  readonly adjacentIntensityDifferences: AdjacentIntensityDifferenceSummaryFRData05V1 | null;
  readonly spatialIntensityMoments: SpatialIntensityMomentSummaryFRData05V1 | null;
  readonly errorCode: string | null;
}

export interface CaptureQualityRawMeasurementProvenanceFRData05V1 {
  readonly protocol: 'chrome_devtools_protocol';
  readonly measurementPrimitive: 'canvas_rgba_integer_rgb_sum_neighbors_spatial_moments';
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
  readonly rasterIdentityReconfirmedBySha256: true;
  readonly numericRepresentation: 'javascript_safe_integer';
}

export interface MentonDatasetCaptureQualityRawObservationFRData05V1 {
  readonly captureRef: string;
  readonly relativeAssetPath: string;
  readonly actualDigest: string;
  readonly rasterSha256: string;
  readonly rasterWidth: number;
  readonly rasterHeight: number;
  readonly pixelCount: number;
  readonly alphaAllOpaque: boolean;
  readonly rgbIntensity: RgbIntensitySummaryFRData05V1;
  readonly adjacentIntensityDifferences: AdjacentIntensityDifferenceSummaryFRData05V1;
  readonly spatialIntensityMoments: SpatialIntensityMomentSummaryFRData05V1;
}

export interface MentonDatasetCaptureQualityRawObservationReportFRData05V1 {
  readonly schemaVersion: 'fr-data05-capture-quality-raw-observation-v1';
  readonly datasetRef: string;
  readonly captureCount: number;
  readonly measurementProvenance: CaptureQualityRawMeasurementProvenanceFRData05V1;
  readonly captureObservations: readonly MentonDatasetCaptureQualityRawObservationFRData05V1[];
  readonly frData01IntakeVerified: true;
  readonly imageDimensionsVerifiedAgainstBytes: true;
  readonly imageDecodabilityVerified: true;
  readonly browserRasterReadbackVerified: true;
  readonly frData04PixelRasterEvidenceVerified: true;
  readonly rasterIdentityReconfirmed: true;
  readonly thresholdFreeCaptureQualityInputsObserved: true;
  readonly rgbIntensityRawEvidenceObserved: true;
  readonly adjacentIntensityDifferenceRawEvidenceObserved: true;
  readonly spatialIntensityMomentRawEvidenceObserved: true;
  readonly pixelContentIntegrityVerified: false;
  readonly facePresenceVerified: false;
  readonly fullFaceFramingValidityVerified: false;
  readonly neutralExpressionValidityVerified: false;
  readonly naturalHeadPositionValidityVerified: false;
  readonly sharpnessMetricValidated: false;
  readonly exposureMetricValidated: false;
  readonly lightingMetricValidated: false;
  readonly exposureAdequacyVerified: false;
  readonly lightingAdequacyVerified: false;
  readonly blurThresholdPassVerified: false;
  readonly occlusionValidityVerified: false;
  readonly captureQualityMetricConstructValidityValidated: false;
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
  throw new FaceAuthorityValidationError(`FR-DATA-05 ${message}`);
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

function safeProduct(values: readonly number[], label: string): number {
  let result = 1;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0) fail(`${label} factors must be non-negative safe integers.`);
    result *= value;
    if (!Number.isSafeInteger(result)) fail(`${label} exceeds exact JavaScript safe-integer range.`);
  }
  return result;
}

const MUST_REMAIN_FALSE_FRDATA04 = [
  'pixelContentIntegrityVerified',
  'facePresenceVerified',
  'fullFaceFramingValidityVerified',
  'neutralExpressionValidityVerified',
  'naturalHeadPositionValidityVerified',
  'lightingAdequacyVerified',
  'blurThresholdPassVerified',
  'occlusionValidityVerified',
  'captureQualityThresholdsDefined',
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
] as const satisfies readonly (keyof MentonDatasetBrowserPixelEvidenceReportFRData04V1)[];

function decodeProvenanceFromPixelReport(
  report: MentonDatasetBrowserPixelEvidenceReportFRData04V1,
): BrowserDecoderProvenanceFRData03V1 {
  const source = report.browserRasterProvenance;
  return Object.freeze({
    protocol: source.protocol,
    decodePrimitive: 'html_image_element_load_plus_decode',
    browserProduct: source.browserProduct,
    browserVersion: source.browserVersion,
    platform: source.platform,
    runnerOS: source.runnerOS,
    runnerArch: source.runnerArch,
    githubRunId: source.githubRunId,
    githubRunAttempt: source.githubRunAttempt,
    githubSha: source.githubSha,
    verificationTimestamp: source.verificationTimestamp,
    pageUrl: source.pageUrl,
    pageOrigin: source.pageOrigin,
    pageReadyState: source.pageReadyState,
    deterministicReplay: true,
  });
}

function decodeEvidenceFromPixelReport(
  report: MentonDatasetBrowserPixelEvidenceReportFRData04V1,
): readonly BrowserImageDecodeEvidenceFRData03V1[] {
  return report.captureObservations.map((entry) => Object.freeze({
    captureRef: entry.captureRef,
    relativeAssetPath: entry.relativeAssetPath,
    actualDigest: entry.actualDigest,
    status: 'decoded' as const,
    loadEventObserved: true,
    decodePromiseResolved: true,
    naturalWidth: entry.rasterWidth,
    naturalHeight: entry.rasterHeight,
    errorCode: null,
  }));
}

function rasterEvidenceFromPixelReport(
  report: MentonDatasetBrowserPixelEvidenceReportFRData04V1,
): readonly BrowserPixelRasterEvidenceFRData04V1[] {
  return report.captureObservations.map((entry) => Object.freeze({
    captureRef: entry.captureRef,
    relativeAssetPath: entry.relativeAssetPath,
    actualDigest: entry.actualDigest,
    status: 'rasterized' as const,
    canvasDrawSucceeded: true,
    imageDataReadbackSucceeded: true,
    rasterWidth: entry.rasterWidth,
    rasterHeight: entry.rasterHeight,
    pixelCount: entry.pixelCount,
    rgbaByteLength: entry.rgbaByteLength,
    rasterSha256: entry.rasterSha256,
    red: entry.red,
    green: entry.green,
    blue: entry.blue,
    alpha: entry.alpha,
    errorCode: null,
  }));
}

function validatePixelPrerequisite(
  manifest: MentonDatasetIntakeManifestFRData01V1,
  intakeReport: MentonDatasetIntakeReportFRData01V1,
  dimensionReport: MentonDatasetImageDimensionReportFRData02V1,
  pixelReport: MentonDatasetBrowserPixelEvidenceReportFRData04V1,
): MentonDatasetBrowserPixelEvidenceReportFRData04V1 {
  if (
    pixelReport.schemaVersion !== 'fr-data04-browser-pixel-evidence-v1' ||
    pixelReport.datasetRef !== manifest.dataset.datasetRef ||
    pixelReport.captureCount !== manifest.dataset.captures.length ||
    pixelReport.frData01IntakeVerified !== true ||
    pixelReport.imageDimensionsVerifiedAgainstBytes !== true ||
    pixelReport.imageDecodabilityVerified !== true ||
    pixelReport.frData03BrowserDecodeVerified !== true ||
    pixelReport.browserRasterReadbackVerified !== true ||
    pixelReport.decodedRasterSha256Observed !== true ||
    pixelReport.thresholdFreePixelStatisticsObserved !== true
  ) fail('FR-DATA-04 prerequisite is not fully verified for this exact dataset.');

  for (const key of MUST_REMAIN_FALSE_FRDATA04) {
    if (pixelReport[key] !== false) fail(`FR-DATA-04 prerequisite contains unauthorized downstream promotion: ${key}.`);
  }

  const decodeReport = buildMentonDatasetBrowserImageDecodeReportFRData03(
    manifest,
    intakeReport,
    dimensionReport,
    decodeProvenanceFromPixelReport(pixelReport),
    decodeEvidenceFromPixelReport(pixelReport),
  );
  const canonical = buildMentonDatasetBrowserPixelEvidenceReportFRData04(
    manifest,
    intakeReport,
    dimensionReport,
    decodeReport,
    pixelReport.browserRasterProvenance,
    rasterEvidenceFromPixelReport(pixelReport),
  );

  if (canonical.captureObservations.length !== pixelReport.captureObservations.length) {
    fail('FR-DATA-04 prerequisite capture observation count drift.');
  }
  for (let index = 0; index < canonical.captureObservations.length; index += 1) {
    const expected = canonical.captureObservations[index];
    const actual = pixelReport.captureObservations[index];
    if (expected === undefined || actual === undefined) fail(`FR-DATA-04 prerequisite capture observation missing at index ${index}.`);
    if (
      actual.captureRef !== expected.captureRef ||
      actual.relativeAssetPath !== expected.relativeAssetPath ||
      actual.actualDigest !== expected.actualDigest ||
      actual.rasterWidth !== expected.rasterWidth ||
      actual.rasterHeight !== expected.rasterHeight ||
      actual.pixelCount !== expected.pixelCount ||
      actual.rgbaByteLength !== expected.rgbaByteLength ||
      actual.rasterSha256 !== expected.rasterSha256 ||
      actual.canvasDrawSucceeded !== true ||
      actual.imageDataReadbackSucceeded !== true
    ) fail(`FR-DATA-04 prerequisite capture observation drift at ${expected.captureRef}.`);
  }
  return canonical;
}

function validateMeasurementProvenance(
  provenance: CaptureQualityRawMeasurementProvenanceFRData05V1,
  pixelReport: MentonDatasetBrowserPixelEvidenceReportFRData04V1,
): void {
  if (
    provenance.protocol !== 'chrome_devtools_protocol' ||
    provenance.measurementPrimitive !== 'canvas_rgba_integer_rgb_sum_neighbors_spatial_moments' ||
    provenance.deterministicReplay !== true ||
    provenance.rasterIdentityReconfirmedBySha256 !== true ||
    provenance.numericRepresentation !== 'javascript_safe_integer'
  ) fail('measurement provenance must identify the deterministic threshold-free browser integer measurement primitive.');

  const raster = pixelReport.browserRasterProvenance;
  const exactPairs: readonly [unknown, unknown, string][] = [
    [provenance.browserProduct, raster.browserProduct, 'browserProduct'],
    [provenance.browserVersion, raster.browserVersion, 'browserVersion'],
    [provenance.platform, raster.platform, 'platform'],
    [provenance.runnerOS, raster.runnerOS, 'runnerOS'],
    [provenance.runnerArch, raster.runnerArch, 'runnerArch'],
    [provenance.githubRunId, raster.githubRunId, 'githubRunId'],
    [provenance.githubRunAttempt, raster.githubRunAttempt, 'githubRunAttempt'],
    [provenance.githubSha, raster.githubSha, 'githubSha'],
  ];
  for (const [actual, expected, label] of exactPairs) {
    if (actual !== expected) fail(`measurement provenance ${label} must exactly match FR-DATA-04.`);
  }
  if (!/^https?:\/\/127\.0\.0\.1:\d+\//.test(provenance.pageUrl)) fail('measurement pageUrl must be loopback-local.');
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(provenance.pageOrigin)) fail('measurement pageOrigin must be loopback-local HTTP origin.');
  if (!provenance.pageUrl.startsWith(`${provenance.pageOrigin}/`)) fail('measurement pageUrl must belong to measurement pageOrigin.');
  if (provenance.pageReadyState !== 'interactive' && provenance.pageReadyState !== 'complete') {
    fail('measurement pageReadyState must be interactive or complete.');
  }
  if (Number.isNaN(Date.parse(provenance.verificationTimestamp))) fail('measurement verificationTimestamp must be parseable ISO time evidence.');
}

function validateRgbIntensity(
  summary: RgbIntensitySummaryFRData05V1 | null,
  pixelCount: number,
  captureRef: string,
  anyChannelZeroExpected: boolean,
  anyChannelFullScaleExpected: boolean,
): RgbIntensitySummaryFRData05V1 {
  if (summary === null || typeof summary !== 'object') fail(`capture ${captureRef} rgbIntensity summary is required.`);
  const min = nonNegativeInteger(summary.min, `${captureRef}.rgbIntensity.min`);
  const max = nonNegativeInteger(summary.max, `${captureRef}.rgbIntensity.max`);
  const sum = nonNegativeInteger(summary.sum, `${captureRef}.rgbIntensity.sum`);
  const sumSquares = nonNegativeInteger(summary.sumSquares, `${captureRef}.rgbIntensity.sumSquares`);
  if (min > 765 || max > 765 || min > max) fail(`capture ${captureRef} rgb intensity min/max must satisfy 0 <= min <= max <= 765.`);
  const minimumPossibleSum = min === max ? min * pixelCount : min * (pixelCount - 1) + max;
  const maximumPossibleSum = min === max ? max * pixelCount : max * (pixelCount - 1) + min;
  if (!Number.isSafeInteger(minimumPossibleSum) || !Number.isSafeInteger(maximumPossibleSum)) {
    fail(`capture ${captureRef} rgb intensity aggregate exceeds exact JavaScript safe-integer range.`);
  }
  if (sum < minimumPossibleSum || sum > maximumPossibleSum) fail(`capture ${captureRef} rgb intensity sum is inconsistent with min/max and pixel count.`);
  const minimumPossibleSquareSum = min === max
    ? safeProduct([pixelCount, min, min], `${captureRef}.rgbIntensity.minimumSquareSum`)
    : safeProduct([pixelCount - 1, min, min], `${captureRef}.rgbIntensity.minimumSquareBody`) + max * max;
  const maximumPossibleSquareSum = min === max
    ? safeProduct([pixelCount, max, max], `${captureRef}.rgbIntensity.maximumSquareSum`)
    : safeProduct([pixelCount - 1, max, max], `${captureRef}.rgbIntensity.maximumSquareBody`) + min * min;
  if (!Number.isSafeInteger(minimumPossibleSquareSum) || !Number.isSafeInteger(maximumPossibleSquareSum)) {
    fail(`capture ${captureRef} rgb intensity square aggregates exceed exact JavaScript safe-integer range.`);
  }
  if (sumSquares < minimumPossibleSquareSum || sumSquares > maximumPossibleSquareSum) {
    fail(`capture ${captureRef} rgb intensity sumSquares is inconsistent with min/max and pixel count.`);
  }

  const exactBlackPixelCount = nonNegativeInteger(summary.exactBlackPixelCount, `${captureRef}.rgbIntensity.exactBlackPixelCount`);
  const exactWhitePixelCount = nonNegativeInteger(summary.exactWhitePixelCount, `${captureRef}.rgbIntensity.exactWhitePixelCount`);
  const anyChannelZeroPixelCount = nonNegativeInteger(summary.anyChannelZeroPixelCount, `${captureRef}.rgbIntensity.anyChannelZeroPixelCount`);
  const anyChannelFullScalePixelCount = nonNegativeInteger(summary.anyChannelFullScalePixelCount, `${captureRef}.rgbIntensity.anyChannelFullScalePixelCount`);
  for (const [count, label] of [
    [exactBlackPixelCount, 'exactBlackPixelCount'],
    [exactWhitePixelCount, 'exactWhitePixelCount'],
    [anyChannelZeroPixelCount, 'anyChannelZeroPixelCount'],
    [anyChannelFullScalePixelCount, 'anyChannelFullScalePixelCount'],
  ] as const) {
    if (count > pixelCount) fail(`capture ${captureRef} ${label} cannot exceed pixelCount.`);
  }
  if (exactBlackPixelCount > anyChannelZeroPixelCount) fail(`capture ${captureRef} exact-black count cannot exceed any-channel-zero count.`);
  if (exactWhitePixelCount > anyChannelFullScalePixelCount) fail(`capture ${captureRef} exact-white count cannot exceed any-channel-full-scale count.`);
  if ((exactBlackPixelCount > 0) !== (min === 0)) fail(`capture ${captureRef} exact-black occupancy must exactly agree with intensity minimum.`);
  if ((exactWhitePixelCount > 0) !== (max === 765)) fail(`capture ${captureRef} exact-white occupancy must exactly agree with intensity maximum.`);
  if ((anyChannelZeroPixelCount > 0) !== anyChannelZeroExpected) {
    fail(`capture ${captureRef} any-channel-zero occupancy must exactly agree with FR-DATA-04 channel minima.`);
  }
  if ((anyChannelFullScalePixelCount > 0) !== anyChannelFullScaleExpected) {
    fail(`capture ${captureRef} any-channel-full-scale occupancy must exactly agree with FR-DATA-04 channel maxima.`);
  }

  return Object.freeze({
    min,
    max,
    sum,
    sumSquares,
    exactBlackPixelCount,
    exactWhitePixelCount,
    anyChannelZeroPixelCount,
    anyChannelFullScalePixelCount,
  });
}

function validateAxisDifferences(
  axis: AdjacentIntensityDifferenceAxisFRData05V1,
  expectedPairCount: number,
  captureRef: string,
  label: 'horizontal' | 'vertical',
): AdjacentIntensityDifferenceAxisFRData05V1 {
  if (axis === null || typeof axis !== 'object') fail(`capture ${captureRef} ${label} adjacent-difference summary is required.`);
  const pairCount = nonNegativeInteger(axis.pairCount, `${captureRef}.${label}.pairCount`);
  if (pairCount !== expectedPairCount) fail(`capture ${captureRef} ${label} pairCount must exactly equal raster adjacency count.`);
  const absoluteDifferenceSum = nonNegativeInteger(axis.absoluteDifferenceSum, `${captureRef}.${label}.absoluteDifferenceSum`);
  const squaredDifferenceSum = nonNegativeInteger(axis.squaredDifferenceSum, `${captureRef}.${label}.squaredDifferenceSum`);
  const maxAbs = safeProduct([pairCount, 765], `${captureRef}.${label}.maxAbs`);
  const maxSquared = safeProduct([pairCount, 765, 765], `${captureRef}.${label}.maxSquared`);
  if (absoluteDifferenceSum > maxAbs) fail(`capture ${captureRef} ${label} absoluteDifferenceSum exceeds mathematical maximum.`);
  if (squaredDifferenceSum > maxSquared) fail(`capture ${captureRef} ${label} squaredDifferenceSum exceeds mathematical maximum.`);
  if (squaredDifferenceSum < absoluteDifferenceSum) {
    fail(`capture ${captureRef} ${label} squaredDifferenceSum cannot be below absoluteDifferenceSum for integer differences.`);
  }
  if (squaredDifferenceSum > safeProduct([absoluteDifferenceSum, 765], `${captureRef}.${label}.differenceCouplingMax`)) {
    fail(`capture ${captureRef} ${label} squaredDifferenceSum is inconsistent with absoluteDifferenceSum.`);
  }
  if (pairCount === 0 && (absoluteDifferenceSum !== 0 || squaredDifferenceSum !== 0)) {
    fail(`capture ${captureRef} ${label} zero-pair adjacency must have zero aggregate differences.`);
  }
  return Object.freeze({ pairCount, absoluteDifferenceSum, squaredDifferenceSum });
}

function validateSpatialMoments(
  summary: SpatialIntensityMomentSummaryFRData05V1 | null,
  width: number,
  height: number,
  intensitySum: number,
  captureRef: string,
): SpatialIntensityMomentSummaryFRData05V1 {
  if (summary === null || typeof summary !== 'object') fail(`capture ${captureRef} spatialIntensityMoments summary is required.`);
  const xIndexWeightedSum = nonNegativeInteger(summary.xIndexWeightedSum, `${captureRef}.spatial.xIndexWeightedSum`);
  const yIndexWeightedSum = nonNegativeInteger(summary.yIndexWeightedSum, `${captureRef}.spatial.yIndexWeightedSum`);
  const maxX = safeProduct([Math.max(0, width - 1), intensitySum], `${captureRef}.spatial.maxX`);
  const maxY = safeProduct([Math.max(0, height - 1), intensitySum], `${captureRef}.spatial.maxY`);
  if (xIndexWeightedSum > maxX) fail(`capture ${captureRef} xIndexWeightedSum exceeds mathematical maximum.`);
  if (yIndexWeightedSum > maxY) fail(`capture ${captureRef} yIndexWeightedSum exceeds mathematical maximum.`);
  if (intensitySum === 0 && (xIndexWeightedSum !== 0 || yIndexWeightedSum !== 0)) {
    fail(`capture ${captureRef} zero total intensity requires zero spatial moments.`);
  }
  return Object.freeze({ xIndexWeightedSum, yIndexWeightedSum });
}

export function buildMentonDatasetCaptureQualityRawObservationReportFRData05(
  manifest: MentonDatasetIntakeManifestFRData01V1,
  intakeReport: MentonDatasetIntakeReportFRData01V1,
  dimensionReport: MentonDatasetImageDimensionReportFRData02V1,
  pixelReport: MentonDatasetBrowserPixelEvidenceReportFRData04V1,
  measurementProvenance: CaptureQualityRawMeasurementProvenanceFRData05V1,
  evidence: readonly CaptureQualityRawEvidenceFRData05V1[],
): MentonDatasetCaptureQualityRawObservationReportFRData05V1 {
  const canonicalPixel = validatePixelPrerequisite(manifest, intakeReport, dimensionReport, pixelReport);
  validateMeasurementProvenance(measurementProvenance, canonicalPixel);

  if (new Set(evidence.map((entry) => entry.captureRef)).size !== evidence.length) {
    fail('capture-quality raw evidence capture refs must be unique.');
  }
  if (evidence.length !== canonicalPixel.captureObservations.length) {
    fail('capture-quality raw evidence count must exactly equal FR-DATA-04 capture count.');
  }
  const expectedRefs = new Set(canonicalPixel.captureObservations.map((entry) => entry.captureRef));
  for (const entry of evidence) {
    if (!expectedRefs.has(entry.captureRef)) fail(`capture-quality raw evidence references unknown capture ${entry.captureRef}.`);
  }

  const captureObservations = canonicalPixel.captureObservations.map((pixel) => {
    const entry = evidence.find((candidate) => candidate.captureRef === pixel.captureRef);
    if (entry === undefined) fail(`missing capture-quality raw evidence for ${pixel.captureRef}.`);
    if (entry.relativeAssetPath !== pixel.relativeAssetPath) fail(`capture ${pixel.captureRef} path drifted from FR-DATA-04.`);
    if (canonicalSha256(entry.actualDigest, `${pixel.captureRef}.actualDigest`) !== pixel.actualDigest) {
      fail(`capture ${pixel.captureRef} asset digest drifted from FR-DATA-04.`);
    }
    if (canonicalSha256(entry.rasterSha256, `${pixel.captureRef}.rasterSha256`) !== pixel.rasterSha256) {
      fail(`capture ${pixel.captureRef} raster identity was not reconfirmed against FR-DATA-04.`);
    }
    if (entry.status !== 'measured' || entry.errorCode !== null) fail(`capture ${pixel.captureRef} raw measurement failed closed with status ${entry.status}.`);

    const width = positiveInteger(entry.rasterWidth, `${pixel.captureRef}.rasterWidth`);
    const height = positiveInteger(entry.rasterHeight, `${pixel.captureRef}.rasterHeight`);
    const pixelCount = positiveInteger(entry.pixelCount, `${pixel.captureRef}.pixelCount`);
    if (width !== pixel.rasterWidth || height !== pixel.rasterHeight || pixelCount !== pixel.pixelCount) {
      fail(`capture ${pixel.captureRef} raw measurement dimensions/count must exactly match FR-DATA-04.`);
    }
    const exactPixelCount = safeProduct([width, height], `${pixel.captureRef}.pixelCount`);
    if (pixelCount !== exactPixelCount) fail(`capture ${pixel.captureRef} pixelCount must equal width * height.`);
    safeProduct([pixelCount, 765, 765], `${pixel.captureRef}.measurementAggregateCapacity`);
    safeProduct([pixelCount, 765, Math.max(width - 1, height - 1)], `${pixel.captureRef}.spatialAggregateCapacity`);

    const expectedAlphaAllOpaque = pixel.alpha.opaquePixelCount === pixel.pixelCount;
    if (entry.alphaAllOpaque !== expectedAlphaAllOpaque) fail(`capture ${pixel.captureRef} alphaAllOpaque must exactly reflect FR-DATA-04 alpha occupancy.`);

    const rgbIntensity = validateRgbIntensity(
      entry.rgbIntensity,
      pixelCount,
      pixel.captureRef,
      pixel.red.min === 0 || pixel.green.min === 0 || pixel.blue.min === 0,
      pixel.red.max === 255 || pixel.green.max === 255 || pixel.blue.max === 255,
    );
    const adjacent = entry.adjacentIntensityDifferences;
    if (adjacent === null || typeof adjacent !== 'object') fail(`capture ${pixel.captureRef} adjacentIntensityDifferences summary is required.`);
    const horizontalPairCount = safeProduct([height, Math.max(0, width - 1)], `${pixel.captureRef}.horizontalPairCount`);
    const verticalPairCount = safeProduct([width, Math.max(0, height - 1)], `${pixel.captureRef}.verticalPairCount`);
    const horizontal = validateAxisDifferences(adjacent.horizontal, horizontalPairCount, pixel.captureRef, 'horizontal');
    const vertical = validateAxisDifferences(adjacent.vertical, verticalPairCount, pixel.captureRef, 'vertical');
    const spatialIntensityMoments = validateSpatialMoments(
      entry.spatialIntensityMoments,
      width,
      height,
      rgbIntensity.sum,
      pixel.captureRef,
    );

    return Object.freeze({
      captureRef: pixel.captureRef,
      relativeAssetPath: pixel.relativeAssetPath,
      actualDigest: pixel.actualDigest,
      rasterSha256: pixel.rasterSha256,
      rasterWidth: width,
      rasterHeight: height,
      pixelCount,
      alphaAllOpaque: entry.alphaAllOpaque,
      rgbIntensity,
      adjacentIntensityDifferences: Object.freeze({ horizontal, vertical }),
      spatialIntensityMoments,
    });
  });

  return Object.freeze({
    schemaVersion: 'fr-data05-capture-quality-raw-observation-v1',
    datasetRef: manifest.dataset.datasetRef,
    captureCount: captureObservations.length,
    measurementProvenance: Object.freeze({ ...measurementProvenance }),
    captureObservations: Object.freeze(captureObservations),
    frData01IntakeVerified: true,
    imageDimensionsVerifiedAgainstBytes: true,
    imageDecodabilityVerified: true,
    browserRasterReadbackVerified: true,
    frData04PixelRasterEvidenceVerified: true,
    rasterIdentityReconfirmed: true,
    thresholdFreeCaptureQualityInputsObserved: true,
    rgbIntensityRawEvidenceObserved: true,
    adjacentIntensityDifferenceRawEvidenceObserved: true,
    spatialIntensityMomentRawEvidenceObserved: true,
    pixelContentIntegrityVerified: false,
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
  });
}

export function assertMentonDatasetCaptureQualityReadyForPromotionFRData05(): never {
  return fail(
    'raw RGB intensity, adjacent-difference, and spatial-moment observations do not authorize sharpness, exposure, lighting, face presence, framing, pose, occlusion, Menton/provider mapping, traditional equivalence, or production geometry; calibrated construct validation and thresholds remain required.',
  );
}
