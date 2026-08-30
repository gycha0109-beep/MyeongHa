import {
  buildMentonDatasetCaptureQualityRawObservationReportFRData05,
  type CaptureQualityRawEvidenceFRData05V1,
  type MentonDatasetCaptureQualityRawObservationReportFRData05V1,
} from './capture-quality-raw-observations-frdata05.js';
import {
  MEDIAPIPE_FACE_LANDMARKER_RUNTIME_EVIDENCE_FR26,
} from './mediapipe-face-landmarker-runtime-fr26.js';
import {
  MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27,
  validateMediaPipeRealRuntimeVerificationEvidenceFR27,
  type MediaPipeRuntimeFileDigestFR27V1,
} from './mediapipe-real-runtime-evidence-fr27.js';
import type { MentonDatasetImageDimensionReportFRData02V1 } from './image-byte-dimensions-frdata02.js';
import type {
  MentonDatasetIntakeManifestFRData01V1,
  MentonDatasetIntakeReportFRData01V1,
} from './menton-dataset-intake-frdata01.js';
import type { MentonDatasetBrowserPixelEvidenceReportFRData04V1 } from './browser-pixel-evidence-frdata04.js';
import { FaceAuthorityValidationError } from './validation.js';

export type ProviderFaceCandidateObservationStatusFRData06V1 = 'observed' | 'provider_error';

export interface ProviderFaceCandidateLandmarkSummaryFRData06V1 {
  readonly providerCandidateOrdinal: number;
  readonly landmarkCount: number;
  readonly landmarkFieldSet: readonly string[];
  readonly allXFiniteNormalized: boolean;
  readonly allYFiniteNormalized: boolean;
  readonly allZFinite: boolean;
  readonly allVisibilityFiniteWhenPresent: boolean;
}

export interface ProviderFaceCandidateEvidenceFRData06V1 {
  readonly captureRef: string;
  readonly relativeAssetPath: string;
  readonly actualDigest: string;
  readonly rasterSha256: string;
  readonly status: ProviderFaceCandidateObservationStatusFRData06V1;
  readonly rasterIdentityReconfirmedBeforeProviderRun: boolean;
  readonly providerResultRootFieldSet: readonly string[] | null;
  readonly faceCandidateCount: number | null;
  readonly candidateSummaries: readonly ProviderFaceCandidateLandmarkSummaryFRData06V1[] | null;
  readonly faceBlendshapeCount: number | null;
  readonly facialTransformationMatrixCount: number | null;
  readonly errorCode: string | null;
}

export interface ProviderFaceCandidateRuntimeProvenanceFRData06V1 {
  readonly protocol: 'chrome_devtools_protocol';
  readonly providerRuntime: 'mediapipe_tasks_vision_face_landmarker';
  readonly runtimePackageName: '@mediapipe/tasks-vision';
  readonly runtimePackageVersion: '0.10.35';
  readonly packageBundleDigest: string;
  readonly wasmFiles: readonly MediaPipeRuntimeFileDigestFR27V1[];
  readonly modelAssetRef: string;
  readonly modelDigest: string;
  readonly modelByteLength: number;
  readonly runningMode: 'IMAGE';
  readonly numFaces: 1;
  readonly outputFaceBlendshapes: false;
  readonly outputFacialTransformationMatrixes: false;
  readonly sourceImagePrimitive: 'html_image_element_after_decode';
  readonly rasterReconfirmationPrimitive: 'canvas_2d_get_image_data_sha256_before_provider_detect';
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
  readonly deterministicSummaryReplay: true;
  readonly rawProviderResponsePersisted: false;
  readonly rawProviderCoordinatesPersisted: false;
}

export interface MentonDatasetProviderFaceCandidateObservationFRData06V1 {
  readonly captureRef: string;
  readonly relativeAssetPath: string;
  readonly actualDigest: string;
  readonly rasterSha256: string;
  readonly faceCandidateCount: number;
  readonly candidateSummaries: readonly ProviderFaceCandidateLandmarkSummaryFRData06V1[];
  readonly faceBlendshapeCount: number;
  readonly facialTransformationMatrixCount: number;
}

export interface MentonDatasetProviderFaceCandidateObservationReportFRData06V1 {
  readonly schemaVersion: 'fr-data06-provider-face-candidate-observation-v1';
  readonly datasetRef: string;
  readonly captureCount: number;
  readonly providerProvenance: ProviderFaceCandidateRuntimeProvenanceFRData06V1;
  readonly captureObservations: readonly MentonDatasetProviderFaceCandidateObservationFRData06V1[];
  readonly frData01IntakeVerified: true;
  readonly imageDimensionsVerifiedAgainstBytes: true;
  readonly imageDecodabilityVerified: true;
  readonly browserRasterReadbackVerified: true;
  readonly frData04PixelRasterEvidenceVerified: true;
  readonly frData05CaptureQualityRawObservationVerified: true;
  readonly rasterIdentityReconfirmedBeforeProviderRun: true;
  readonly mediaPipeRuntimeExecuted: true;
  readonly providerResultShapeObserved: true;
  readonly providerFaceCandidateCountObserved: true;
  readonly providerLandmarkPayloadSummaryObserved: true;
  readonly rawProviderResponsePersisted: false;
  readonly rawProviderCoordinatesPersisted: false;
  readonly pixelContentIntegrityVerified: false;
  readonly providerDetectionConstructValidityValidated: false;
  readonly providerFaceCandidateHumanIdentityValidated: false;
  readonly singleHumanFaceVerified: false;
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
  readonly providerConformanceVerified: false;
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

const ROOT_RESULT_FIELDS = Object.freeze([
  'faceBlendshapes',
  'faceLandmarks',
  'facialTransformationMatrixes',
] as const);
const LANDMARK_FIELDS = Object.freeze(['visibility', 'x', 'y', 'z'] as const);
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const PROVENANCE_KEYS = new Set([
  'protocol',
  'providerRuntime',
  'runtimePackageName',
  'runtimePackageVersion',
  'packageBundleDigest',
  'wasmFiles',
  'modelAssetRef',
  'modelDigest',
  'modelByteLength',
  'runningMode',
  'numFaces',
  'outputFaceBlendshapes',
  'outputFacialTransformationMatrixes',
  'sourceImagePrimitive',
  'rasterReconfirmationPrimitive',
  'browserProduct',
  'browserVersion',
  'platform',
  'runnerOS',
  'runnerArch',
  'githubRunId',
  'githubRunAttempt',
  'githubSha',
  'verificationTimestamp',
  'pageUrl',
  'pageOrigin',
  'pageReadyState',
  'deterministicSummaryReplay',
  'rawProviderResponsePersisted',
  'rawProviderCoordinatesPersisted',
]);
const EVIDENCE_KEYS = new Set([
  'captureRef',
  'relativeAssetPath',
  'actualDigest',
  'rasterSha256',
  'status',
  'rasterIdentityReconfirmedBeforeProviderRun',
  'providerResultRootFieldSet',
  'faceCandidateCount',
  'candidateSummaries',
  'faceBlendshapeCount',
  'facialTransformationMatrixCount',
  'errorCode',
]);
const CANDIDATE_KEYS = new Set([
  'providerCandidateOrdinal',
  'landmarkCount',
  'landmarkFieldSet',
  'allXFiniteNormalized',
  'allYFiniteNormalized',
  'allZFinite',
  'allVisibilityFiniteWhenPresent',
]);

function fail(message: string): never {
  throw new FaceAuthorityValidationError(`FR-DATA-06 ${message}`);
}

function exactKeys(value: object, allowed: ReadonlySet<string>, label: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) fail(`${label} contains unauthorized field: ${unexpected}.`);
}

function canonicalSha256(value: string, label: string): string {
  if (!SHA256.test(value)) fail(`${label} must use canonical lowercase sha256:<64-hex> form.`);
  return value;
}

function nonNegativeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} must be a non-negative safe integer.`);
  return value;
}

function positiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${label} must be a positive safe integer.`);
  return value;
}

function exactStringArray(actual: readonly string[], expected: readonly string[], label: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    fail(`${label} mismatch.`);
  }
}

function exactWasmSet(actual: readonly MediaPipeRuntimeFileDigestFR27V1[]): void {
  const expected = [...MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27.installedPackageAssets.wasmFiles]
    .sort((left, right) => left.file.localeCompare(right.file));
  const normalized = [...actual].sort((left, right) => left.file.localeCompare(right.file));
  if (normalized.length !== expected.length) fail('provider provenance WASM file count mismatch.');
  normalized.forEach((entry, index) => {
    const wanted = expected[index];
    if (wanted === undefined) fail('provider provenance WASM expectation is incomplete.');
    if (entry.file !== wanted.file || canonicalSha256(entry.digest, `providerProvenance.wasmFiles[${index}].digest`) !== wanted.digest) {
      fail(`provider provenance WASM digest mismatch for ${entry.file}.`);
    }
  });
}

function validateLocalPage(provenance: ProviderFaceCandidateRuntimeProvenanceFRData06V1): void {
  let page: URL;
  let origin: URL;
  try {
    page = new URL(provenance.pageUrl);
    origin = new URL(provenance.pageOrigin);
  } catch {
    return fail('provider provenance page URL/origin must be valid URLs.');
  }
  if (
    page.protocol !== 'http:' ||
    page.hostname !== '127.0.0.1' ||
    origin.protocol !== 'http:' ||
    origin.hostname !== '127.0.0.1' ||
    page.origin !== origin.origin ||
    provenance.pageOrigin !== origin.origin
  ) {
    fail('provider provenance must remain bound to the local 127.0.0.1 browser harness origin.');
  }
}

function qualityEvidenceFromReport(
  report: MentonDatasetCaptureQualityRawObservationReportFRData05V1,
): readonly CaptureQualityRawEvidenceFRData05V1[] {
  return Object.freeze(report.captureObservations.map((entry) => Object.freeze({
    captureRef: entry.captureRef,
    relativeAssetPath: entry.relativeAssetPath,
    actualDigest: entry.actualDigest,
    rasterSha256: entry.rasterSha256,
    status: 'measured' as const,
    rasterWidth: entry.rasterWidth,
    rasterHeight: entry.rasterHeight,
    pixelCount: entry.pixelCount,
    alphaAllOpaque: entry.alphaAllOpaque,
    rgbIntensity: entry.rgbIntensity,
    adjacentIntensityDifferences: entry.adjacentIntensityDifferences,
    spatialIntensityMoments: entry.spatialIntensityMoments,
    errorCode: null,
  })));
}

function validateQualityPrerequisite(
  manifest: MentonDatasetIntakeManifestFRData01V1,
  intakeReport: MentonDatasetIntakeReportFRData01V1,
  dimensionReport: MentonDatasetImageDimensionReportFRData02V1,
  pixelReport: MentonDatasetBrowserPixelEvidenceReportFRData04V1,
  qualityReport: MentonDatasetCaptureQualityRawObservationReportFRData05V1,
): MentonDatasetCaptureQualityRawObservationReportFRData05V1 {
  const canonical = buildMentonDatasetCaptureQualityRawObservationReportFRData05(
    manifest,
    intakeReport,
    dimensionReport,
    pixelReport,
    qualityReport.measurementProvenance,
    qualityEvidenceFromReport(qualityReport),
  );
  if (JSON.stringify(canonical) !== JSON.stringify(qualityReport)) {
    fail('FR-DATA-05 prerequisite must be the exact canonical report; drift or claim promotion is not accepted.');
  }
  return canonical;
}

function validateProviderProvenance(
  provenance: ProviderFaceCandidateRuntimeProvenanceFRData06V1,
): ProviderFaceCandidateRuntimeProvenanceFRData06V1 {
  if (typeof provenance !== 'object' || provenance === null) fail('provider provenance must be an object.');
  exactKeys(provenance, PROVENANCE_KEYS, 'provider provenance');
  validateMediaPipeRealRuntimeVerificationEvidenceFR27();

  const runtime = MEDIAPIPE_FACE_LANDMARKER_RUNTIME_EVIDENCE_FR26;
  const verified = MEDIAPIPE_REAL_RUNTIME_VERIFICATION_EVIDENCE_FR27;
  if (
    provenance.protocol !== 'chrome_devtools_protocol' ||
    provenance.providerRuntime !== 'mediapipe_tasks_vision_face_landmarker' ||
    provenance.runtimePackageName !== runtime.runtimePackageName ||
    provenance.runtimePackageVersion !== runtime.runtimePackageVersion
  ) {
    fail('provider provenance runtime identity must exactly match the pinned FR-26 runtime.');
  }
  if (canonicalSha256(provenance.packageBundleDigest, 'providerProvenance.packageBundleDigest') !== verified.installedPackageAssets.packageBundleDigest) {
    fail('provider provenance package bundle digest must match FR-27 installed package evidence.');
  }
  exactWasmSet(provenance.wasmFiles);
  if (
    provenance.modelAssetRef !== runtime.model.assetRef ||
    canonicalSha256(provenance.modelDigest, 'providerProvenance.modelDigest') !== verified.model.independentByteDigest ||
    provenance.modelByteLength !== verified.model.byteLength
  ) {
    fail('provider provenance model identity must match the FR-27 independently hashed model bytes.');
  }
  if (
    provenance.runningMode !== runtime.runningMode ||
    provenance.numFaces !== runtime.numFaces ||
    provenance.outputFaceBlendshapes !== runtime.outputFaceBlendshapes ||
    provenance.outputFacialTransformationMatrixes !== runtime.outputFacialTransformationMatrixes
  ) {
    fail('provider provenance runtime options must remain pinned to the FR-26 bounded single-image path.');
  }
  if (
    provenance.sourceImagePrimitive !== 'html_image_element_after_decode' ||
    provenance.rasterReconfirmationPrimitive !== 'canvas_2d_get_image_data_sha256_before_provider_detect' ||
    provenance.deterministicSummaryReplay !== true ||
    provenance.rawProviderResponsePersisted !== false ||
    provenance.rawProviderCoordinatesPersisted !== false
  ) {
    fail('provider provenance cannot weaken raster reconfirmation, replay, or raw-response/coordinate non-persistence.');
  }
  if (provenance.browserProduct !== 'Google Chrome' && provenance.browserProduct !== 'Chromium') {
    fail('provider provenance browser product is unsupported.');
  }
  if (typeof provenance.browserVersion !== 'string' || provenance.browserVersion.length < 1) fail('provider provenance browserVersion is required.');
  if (typeof provenance.platform !== 'string' || provenance.platform.length < 1) fail('provider provenance platform is required.');
  if (provenance.pageReadyState !== 'interactive' && provenance.pageReadyState !== 'complete') fail('provider provenance pageReadyState is unsupported.');
  if (!Number.isFinite(Date.parse(provenance.verificationTimestamp))) fail('provider provenance verificationTimestamp must be parseable.');
  validateLocalPage(provenance);
  return Object.freeze({
    ...provenance,
    wasmFiles: Object.freeze(provenance.wasmFiles.map((entry) => Object.freeze({ ...entry }))),
  });
}

function validateCandidate(
  candidate: ProviderFaceCandidateLandmarkSummaryFRData06V1,
  index: number,
  captureRef: string,
): ProviderFaceCandidateLandmarkSummaryFRData06V1 {
  if (typeof candidate !== 'object' || candidate === null) fail(`capture ${captureRef} provider candidate ${index} must be an object.`);
  exactKeys(candidate, CANDIDATE_KEYS, `capture ${captureRef} provider candidate ${index}`);
  const ordinal = nonNegativeSafeInteger(candidate.providerCandidateOrdinal, `${captureRef}.candidate[${index}].providerCandidateOrdinal`);
  if (ordinal !== index) fail(`capture ${captureRef} provider candidate ordinals must preserve provider array order.`);
  const landmarkCount = positiveSafeInteger(candidate.landmarkCount, `${captureRef}.candidate[${index}].landmarkCount`);
  if (!Array.isArray(candidate.landmarkFieldSet)) fail(`capture ${captureRef} provider candidate ${index} landmarkFieldSet must be an array.`);
  exactStringArray(candidate.landmarkFieldSet, LANDMARK_FIELDS, `${captureRef}.candidate[${index}].landmarkFieldSet`);
  if (
    candidate.allXFiniteNormalized !== true ||
    candidate.allYFiniteNormalized !== true ||
    candidate.allZFinite !== true ||
    candidate.allVisibilityFiniteWhenPresent !== true
  ) {
    fail(`capture ${captureRef} provider candidate ${index} landmark numeric-shape summary failed closed.`);
  }
  return Object.freeze({
    providerCandidateOrdinal: ordinal,
    landmarkCount,
    landmarkFieldSet: LANDMARK_FIELDS,
    allXFiniteNormalized: true,
    allYFiniteNormalized: true,
    allZFinite: true,
    allVisibilityFiniteWhenPresent: true,
  });
}

export function buildMentonDatasetProviderFaceCandidateObservationReportFRData06(
  manifest: MentonDatasetIntakeManifestFRData01V1,
  intakeReport: MentonDatasetIntakeReportFRData01V1,
  dimensionReport: MentonDatasetImageDimensionReportFRData02V1,
  pixelReport: MentonDatasetBrowserPixelEvidenceReportFRData04V1,
  qualityReport: MentonDatasetCaptureQualityRawObservationReportFRData05V1,
  providerProvenance: ProviderFaceCandidateRuntimeProvenanceFRData06V1,
  evidence: readonly ProviderFaceCandidateEvidenceFRData06V1[],
): MentonDatasetProviderFaceCandidateObservationReportFRData06V1 {
  const canonicalQuality = validateQualityPrerequisite(
    manifest,
    intakeReport,
    dimensionReport,
    pixelReport,
    qualityReport,
  );
  const provenance = validateProviderProvenance(providerProvenance);

  if (!Array.isArray(evidence)) fail('provider face-candidate evidence must be an array.');
  if (new Set(evidence.map((entry) => entry.captureRef)).size !== evidence.length) {
    fail('provider face-candidate evidence capture refs must be unique.');
  }
  if (evidence.length !== canonicalQuality.captureObservations.length) {
    fail('provider face-candidate evidence count must exactly equal FR-DATA-05 capture count.');
  }
  const expectedRefs = new Set(canonicalQuality.captureObservations.map((entry) => entry.captureRef));
  for (const entry of evidence) {
    if (!expectedRefs.has(entry.captureRef)) fail(`provider face-candidate evidence references unknown capture ${entry.captureRef}.`);
  }

  const captureObservations = canonicalQuality.captureObservations.map((quality) => {
    const entry = evidence.find((candidate) => candidate.captureRef === quality.captureRef);
    if (entry === undefined) fail(`missing provider face-candidate evidence for ${quality.captureRef}.`);
    if (typeof entry !== 'object' || entry === null) fail(`capture ${quality.captureRef} provider evidence must be an object.`);
    exactKeys(entry, EVIDENCE_KEYS, `capture ${quality.captureRef} provider evidence`);
    if (entry.relativeAssetPath !== quality.relativeAssetPath) fail(`capture ${quality.captureRef} path drifted from FR-DATA-05.`);
    if (canonicalSha256(entry.actualDigest, `${quality.captureRef}.actualDigest`) !== quality.actualDigest) {
      fail(`capture ${quality.captureRef} asset digest drifted from FR-DATA-05.`);
    }
    if (canonicalSha256(entry.rasterSha256, `${quality.captureRef}.rasterSha256`) !== quality.rasterSha256) {
      fail(`capture ${quality.captureRef} raster identity drifted from FR-DATA-05.`);
    }
    if (
      entry.status !== 'observed' ||
      entry.errorCode !== null ||
      entry.rasterIdentityReconfirmedBeforeProviderRun !== true
    ) {
      fail(`capture ${quality.captureRef} provider observation failed closed with status ${entry.status}.`);
    }
    if (!Array.isArray(entry.providerResultRootFieldSet)) fail(`capture ${quality.captureRef} provider result root field set is required.`);
    exactStringArray(entry.providerResultRootFieldSet, ROOT_RESULT_FIELDS, `${quality.captureRef}.providerResultRootFieldSet`);

    if (entry.faceCandidateCount === null) fail(`capture ${quality.captureRef} faceCandidateCount is required.`);
    const candidateCount = nonNegativeSafeInteger(entry.faceCandidateCount, `${quality.captureRef}.faceCandidateCount`);
    if (candidateCount > MEDIAPIPE_FACE_LANDMARKER_RUNTIME_EVIDENCE_FR26.numFaces) {
      fail(`capture ${quality.captureRef} faceCandidateCount exceeds configured provider numFaces.`);
    }
    if (!Array.isArray(entry.candidateSummaries)) fail(`capture ${quality.captureRef} candidateSummaries are required.`);
    if (entry.candidateSummaries.length !== candidateCount) {
      fail(`capture ${quality.captureRef} candidate summary count must equal provider faceCandidateCount.`);
    }
    const candidateSummaries = Object.freeze(entry.candidateSummaries.map((candidate, index) => (
      validateCandidate(candidate, index, quality.captureRef)
    )));

    if (entry.faceBlendshapeCount === null || entry.facialTransformationMatrixCount === null) {
      fail(`capture ${quality.captureRef} provider disabled-output counts are required.`);
    }
    const faceBlendshapeCount = nonNegativeSafeInteger(entry.faceBlendshapeCount, `${quality.captureRef}.faceBlendshapeCount`);
    const facialTransformationMatrixCount = nonNegativeSafeInteger(
      entry.facialTransformationMatrixCount,
      `${quality.captureRef}.facialTransformationMatrixCount`,
    );
    if (faceBlendshapeCount !== 0 || facialTransformationMatrixCount !== 0) {
      fail(`capture ${quality.captureRef} disabled provider outputs must remain empty.`);
    }

    return Object.freeze({
      captureRef: quality.captureRef,
      relativeAssetPath: quality.relativeAssetPath,
      actualDigest: quality.actualDigest,
      rasterSha256: quality.rasterSha256,
      faceCandidateCount: candidateCount,
      candidateSummaries,
      faceBlendshapeCount,
      facialTransformationMatrixCount,
    });
  });

  return Object.freeze({
    schemaVersion: 'fr-data06-provider-face-candidate-observation-v1',
    datasetRef: manifest.dataset.datasetRef,
    captureCount: captureObservations.length,
    providerProvenance: provenance,
    captureObservations: Object.freeze(captureObservations),
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
  });
}

export function assertMentonDatasetFacePresenceReadyForPromotionFRData06(): never {
  return fail(
    'provider faceLandmarks candidate counts and landmark-payload summaries are provider-output observations only; they do not validate human-face presence, single-face identity, framing, capture quality, anatomical landmarks, traditional semantics, or production geometry.',
  );
}
