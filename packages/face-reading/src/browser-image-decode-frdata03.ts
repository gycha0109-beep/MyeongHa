import {
  validateMentonDatasetIntakeManifestFRData01,
  type MentonDatasetIntakeManifestFRData01V1,
  type MentonDatasetIntakeReportFRData01V1,
} from './menton-dataset-intake-frdata01.js';
import type { MentonDatasetImageDimensionReportFRData02V1 } from './image-byte-dimensions-frdata02.js';
import { FaceAuthorityValidationError } from './validation.js';

export type BrowserImageDecodeStatusFRData03V1 = 'decoded' | 'load_error' | 'decode_error';

export interface BrowserImageDecodeEvidenceFRData03V1 {
  readonly captureRef: string;
  readonly relativeAssetPath: string;
  readonly actualDigest: string;
  readonly status: BrowserImageDecodeStatusFRData03V1;
  readonly loadEventObserved: boolean;
  readonly decodePromiseResolved: boolean;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly errorCode: string | null;
}

export interface BrowserDecoderProvenanceFRData03V1 {
  readonly protocol: 'chrome_devtools_protocol';
  readonly decodePrimitive: 'html_image_element_load_plus_decode';
  readonly browserProduct: string;
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

export interface MentonDatasetBrowserDecodeVerificationFRData03V1 {
  readonly captureRef: string;
  readonly relativeAssetPath: string;
  readonly actualDigest: string;
  readonly encodedWidth: number;
  readonly encodedHeight: number;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly loadEventObserved: true;
  readonly decodePromiseResolved: true;
  readonly decodedDimensionsMatchEncodedDimensions: true;
}

export interface MentonDatasetBrowserImageDecodeReportFRData03V1 {
  readonly schemaVersion: 'fr-data03-browser-image-decode-v1';
  readonly datasetRef: string;
  readonly captureCount: number;
  readonly browserDecoderProvenance: BrowserDecoderProvenanceFRData03V1;
  readonly captureVerifications: readonly MentonDatasetBrowserDecodeVerificationFRData03V1[];
  readonly frData01IntakeVerified: true;
  readonly imageByteHeaderStructureVerified: true;
  readonly imageDimensionsVerifiedAgainstBytes: true;
  readonly browserNativeDecodeVerified: true;
  readonly imageDecodabilityVerified: true;
  readonly decodedNaturalDimensionsMatchEncodedDimensions: true;
  readonly pixelContentIntegrityVerified: false;
  readonly facePresenceVerified: false;
  readonly fullFaceFramingValidityVerified: false;
  readonly neutralExpressionValidityVerified: false;
  readonly naturalHeadPositionValidityVerified: false;
  readonly lightingAdequacyVerified: false;
  readonly blurThresholdPassVerified: false;
  readonly occlusionValidityVerified: false;
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
  throw new FaceAuthorityValidationError(`FR-DATA-03 ${message}`);
}

function nonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be non-empty.`);
  return value;
}

function canonicalSha256(value: string, label: string): string {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) fail(`${label} must use canonical lowercase sha256:<64-hex> form.`);
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) fail(`${label} must be a positive integer.`);
  return value;
}

function validateIntakePrerequisite(
  manifest: MentonDatasetIntakeManifestFRData01V1,
  report: MentonDatasetIntakeReportFRData01V1,
): void {
  if (
    report.schemaVersion !== 'fr-data01-intake-report-v1' ||
    report.datasetRef !== manifest.dataset.datasetRef ||
    report.captureCount !== manifest.dataset.captures.length ||
    report.verifiedAssetCount !== manifest.dataset.captures.length ||
    report.datasetStructureValidated !== true ||
    report.assetCoverageComplete !== true ||
    report.assetDigestsVerified !== true ||
    report.assetContentSignaturesVerified !== true ||
    report.assetPathsConfinedToDeclaredRoot !== true
  ) fail('FR-DATA-01 intake prerequisite is not fully verified for this exact dataset.');
  if (report.imageDecodabilityVerified !== false || report.imageDimensionsVerifiedAgainstBytes !== false) {
    fail('FR-DATA-01 prerequisite report contains an unauthorized downstream promotion.');
  }
}

function validateDimensionPrerequisite(
  manifest: MentonDatasetIntakeManifestFRData01V1,
  report: MentonDatasetImageDimensionReportFRData02V1,
): void {
  if (
    report.schemaVersion !== 'fr-data02-image-dimensions-v1' ||
    report.datasetRef !== manifest.dataset.datasetRef ||
    report.captureCount !== manifest.dataset.captures.length ||
    report.captureVerifications.length !== manifest.dataset.captures.length ||
    report.imageByteHeaderStructureVerified !== true ||
    report.imageDimensionsVerifiedAgainstBytes !== true
  ) fail('FR-DATA-02 byte-derived dimension prerequisite is not fully verified for this exact dataset.');
  if (report.imageDecodabilityVerified !== false || report.pixelContentIntegrityVerified !== false) {
    fail('FR-DATA-02 prerequisite report contains an unauthorized downstream promotion.');
  }
}

function validateBrowserProvenance(provenance: BrowserDecoderProvenanceFRData03V1): void {
  if (provenance.protocol !== 'chrome_devtools_protocol' || provenance.decodePrimitive !== 'html_image_element_load_plus_decode') {
    fail('browser decoder provenance must identify the Chrome DevTools Protocol and HTMLImageElement load+decode primitive.');
  }
  nonEmpty(provenance.browserProduct, 'browserProduct');
  nonEmpty(provenance.browserVersion, 'browserVersion');
  nonEmpty(provenance.platform, 'platform');
  if (!Number.isFinite(Date.parse(provenance.verificationTimestamp))) fail('verificationTimestamp must be parseable.');
  let pageUrl: URL;
  try {
    pageUrl = new URL(provenance.pageUrl);
  } catch {
    fail('pageUrl must be an absolute URL.');
  }
  if (pageUrl.protocol !== 'http:' || pageUrl.hostname !== '127.0.0.1') {
    fail('browser decode page must be served from the local 127.0.0.1 HTTP verifier.');
  }
  if (pageUrl.origin !== provenance.pageOrigin) fail('pageOrigin must exactly match pageUrl origin.');
  if (provenance.pageReadyState !== 'interactive' && provenance.pageReadyState !== 'complete') {
    fail('pageReadyState must be interactive or complete.');
  }
  if (provenance.deterministicReplay !== true) fail('browser decode evidence must replay deterministically within the same browser run.');
}

export function buildMentonDatasetBrowserImageDecodeReportFRData03(
  manifest: MentonDatasetIntakeManifestFRData01V1,
  intakeReport: MentonDatasetIntakeReportFRData01V1,
  dimensionReport: MentonDatasetImageDimensionReportFRData02V1,
  browserDecoderProvenance: BrowserDecoderProvenanceFRData03V1,
  evidence: readonly BrowserImageDecodeEvidenceFRData03V1[],
): MentonDatasetBrowserImageDecodeReportFRData03V1 {
  validateMentonDatasetIntakeManifestFRData01(manifest);
  validateIntakePrerequisite(manifest, intakeReport);
  validateDimensionPrerequisite(manifest, dimensionReport);
  validateBrowserProvenance(browserDecoderProvenance);

  if (new Set(evidence.map((entry) => entry.captureRef)).size !== evidence.length) {
    fail('browser decode evidence capture refs must be unique.');
  }
  if (evidence.length !== manifest.dataset.captures.length) {
    fail('browser decode evidence count must exactly equal the FR-47 capture count.');
  }

  const expectedCaptureRefs = new Set(manifest.dataset.captures.map((capture) => capture.captureRef));
  for (const entry of evidence) {
    if (!expectedCaptureRefs.has(entry.captureRef)) fail(`browser decode evidence references unknown capture ${entry.captureRef}.`);
  }

  const captureVerifications = manifest.dataset.captures.map((capture) => {
    const binding = manifest.assets.find((asset) => asset.captureRef === capture.captureRef);
    if (!binding) fail(`capture ${capture.captureRef} is missing its FR-DATA-01 asset binding.`);
    const dimension = dimensionReport.captureVerifications.find((entry) => entry.captureRef === capture.captureRef);
    if (!dimension) fail(`capture ${capture.captureRef} is missing its FR-DATA-02 dimension verification.`);
    const entry = evidence.find((candidate) => candidate.captureRef === capture.captureRef);
    if (!entry) fail(`capture ${capture.captureRef} is missing browser decode evidence.`);
    if (entry.relativeAssetPath !== binding.relativeAssetPath || dimension.relativeAssetPath !== binding.relativeAssetPath) {
      fail(`capture ${capture.captureRef} path drifted across FR-DATA-01/02/03.`);
    }
    canonicalSha256(entry.actualDigest, `capture ${capture.captureRef} actualDigest`);
    if (entry.actualDigest !== capture.canonicalAssetDigest) {
      fail(`capture ${capture.captureRef} browser evidence digest does not match the FR-47 canonical asset digest.`);
    }
    if (entry.status !== 'decoded') {
      fail(`capture ${capture.captureRef} browser decoder failed closed with status ${entry.status}${entry.errorCode ? ` (${entry.errorCode})` : ''}.`);
    }
    if (entry.loadEventObserved !== true || entry.decodePromiseResolved !== true) {
      fail(`capture ${capture.captureRef} requires both browser load success and HTMLImageElement.decode() resolution.`);
    }
    positiveInteger(entry.naturalWidth, `capture ${capture.captureRef} naturalWidth`);
    positiveInteger(entry.naturalHeight, `capture ${capture.captureRef} naturalHeight`);
    if (entry.naturalWidth !== dimension.encodedWidth || entry.naturalHeight !== dimension.encodedHeight) {
      fail(
        `capture ${capture.captureRef} browser decoded dimensions ${entry.naturalWidth}x${entry.naturalHeight} ` +
        `do not match FR-DATA-02 encoded dimensions ${dimension.encodedWidth}x${dimension.encodedHeight}.`,
      );
    }
    return Object.freeze({
      captureRef: capture.captureRef,
      relativeAssetPath: binding.relativeAssetPath,
      actualDigest: entry.actualDigest,
      encodedWidth: dimension.encodedWidth,
      encodedHeight: dimension.encodedHeight,
      naturalWidth: entry.naturalWidth,
      naturalHeight: entry.naturalHeight,
      loadEventObserved: true as const,
      decodePromiseResolved: true as const,
      decodedDimensionsMatchEncodedDimensions: true as const,
    });
  });

  return Object.freeze({
    schemaVersion: 'fr-data03-browser-image-decode-v1' as const,
    datasetRef: manifest.dataset.datasetRef,
    captureCount: manifest.dataset.captures.length,
    browserDecoderProvenance: Object.freeze({ ...browserDecoderProvenance }),
    captureVerifications: Object.freeze(captureVerifications),
    frData01IntakeVerified: true as const,
    imageByteHeaderStructureVerified: true as const,
    imageDimensionsVerifiedAgainstBytes: true as const,
    browserNativeDecodeVerified: true as const,
    imageDecodabilityVerified: true as const,
    decodedNaturalDimensionsMatchEncodedDimensions: true as const,
    pixelContentIntegrityVerified: false as const,
    facePresenceVerified: false as const,
    fullFaceFramingValidityVerified: false as const,
    neutralExpressionValidityVerified: false as const,
    naturalHeadPositionValidityVerified: false as const,
    lightingAdequacyVerified: false as const,
    blurThresholdPassVerified: false as const,
    occlusionValidityVerified: false as const,
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

export function assertMentonDatasetBrowserDecodeReadyForProductionFRData03(): never {
  throw new FaceAuthorityValidationError(
    'FR-DATA-03 proves only exact-asset browser decodability and decoded dimensions in the recorded browser runtime; ' +
    'it does not authorize face/capture quality, Menton correctness, provider mapping, FR-35 contour binding, 地閣 equivalence, ' +
    'FR-36 promotion, Three Divisions, F1, F6, or production geometry.',
  );
}
