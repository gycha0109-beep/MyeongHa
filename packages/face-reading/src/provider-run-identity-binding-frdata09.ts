import { createHash } from 'node:crypto';
import type {
  MentonDatasetProviderFaceCandidateObservationReportFRData06V1,
} from './provider-face-candidate-observations-frdata06.js';
import type {
  IndependentFaceGroundTruthDatasetFRData07V1,
} from './independent-face-ground-truth-frdata07.js';
import { buildProviderFaceCountRawScoringReportFRData08 } from './provider-face-count-raw-scoring-frdata08.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface ProviderRunIdentityBindingProtocolFRData09V1 {
  readonly groundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1';
  readonly providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1';
  readonly rawJoinSchemaRef: 'fr-data08-provider-face-count-raw-scoring-v1';
  readonly reportCanonicalizationAlgorithm: 'sorted_object_keys_preserve_array_order_json_v1';
  readonly reportDigestAlgorithm: 'sha256';
  readonly providerRunRefPrefix: 'frdata06-report-instance';
  readonly providerRunRefLocator: 'report_digest_plus_capture_ref';
  readonly exactDatasetRefMatchRequired: true;
  readonly exactCaptureRefSetMatchRequired: true;
  readonly exactAssetDigestMatchRequired: true;
  readonly frozenAnnotationLedgerRequired: true;
  readonly providerRunsAfterAnnotationFreezeRequired: true;
  readonly providerRunStartMustNotExceedReportVerificationTimestamp: true;
  readonly providerRunRefMayBeInferredFromGithubRunId: false;
  readonly providerRunRefMayBeInferredFromTimestamp: false;
  readonly reportDigestMeansExternalProcessIdentity: false;
  readonly reportDigestMeansProviderConstructValidity: false;
  readonly reportDigestMeansHumanFaceIdentity: false;
}

export interface ProviderRunCaptureBindingFRData09V1 {
  readonly captureRef: string;
  readonly canonicalAssetDigest: string;
  readonly providerRasterSha256: string;
  readonly providerRunRef: string;
  readonly expectedProviderRunRef: string;
  readonly providerRunStartedAt: string;
  readonly providerReportVerificationTimestamp: string;
  readonly exactProviderRunRefMatched: true;
  readonly exactAssetDigestMatched: true;
  readonly providerRunStartedAtNotAfterReportVerification: true;
}

export interface ProviderRunIdentityBindingReportFRData09V1 {
  readonly schemaVersion: 'fr-data09-provider-run-identity-binding-v1';
  readonly datasetRef: string;
  readonly groundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1';
  readonly providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1';
  readonly rawJoinSchemaRef: 'fr-data08-provider-face-count-raw-scoring-v1';
  readonly annotationLedgerDigest: string;
  readonly providerReportDigest: string;
  readonly providerReportCanonicalizationAlgorithm: 'sorted_object_keys_preserve_array_order_json_v1';
  readonly providerReportDigestAlgorithm: 'sha256';
  readonly captureCount: number;
  readonly captureBindings: readonly ProviderRunCaptureBindingFRData09V1[];
  readonly exactDatasetRefMatched: true;
  readonly exactCaptureRefSetMatched: true;
  readonly exactAssetDigestJoinVerified: true;
  readonly frozenAnnotationLedgerVerified: true;
  readonly annotationLedgerFrozenBeforeProviderScoringVerified: true;
  readonly providerRunRefToExactReportInstanceBindingVerified: true;
  readonly providerRunRefToExactCaptureObservationBindingVerified: true;
  readonly providerRunStartTemporalConsistencyVerified: true;
  readonly providerReportCanonicalContentDigestComputed: true;
  readonly upstreamProviderReportCanonicalReconstructionPerformed: false;
  readonly externalProviderExecutionIdentityVerified: false;
  readonly githubRunIdentityExternallyVerified: false;
  readonly providerRunStartTimestampExternallyVerified: false;
  readonly providerDetectionConstructValidityValidated: false;
  readonly providerFaceCandidateHumanIdentityValidated: false;
  readonly singleHumanFaceVerified: false;
  readonly facePresenceVerified: false;
  readonly captureConsensusLabelDerived: false;
  readonly interAnnotatorGroundTruthAuthorityValidated: false;
  readonly classificationMetricsComputed: false;
  readonly calibrationThresholdsDefined: false;
  readonly holdoutUsedForTuning: false;
  readonly nearDuplicatePartitionLeakageValidated: false;
  readonly reviewedEmpiricalValidationCompleted: false;
  readonly captureQualityAuthorityValidated: false;
  readonly anatomicalLandmarkAuthorityValidated: false;
  readonly traditionalSemanticAuthorityValidated: false;
  readonly fr35PointToContourRelationValidated: false;
  readonly traditionalDigeEquivalenceValidated: false;
  readonly fr36VerticalReferencePromoted: false;
  readonly productionThreeDivisionsMetricAllowed: false;
  readonly productionF1Allowed: false;
  readonly productionF6Allowed: false;
  readonly researchCandidateAdmitted: false;
  readonly productionGeometryAuthorized: false;
}

export interface ProviderRunIdentityBindingAuthorityFRData09V1 {
  readonly schemaVersion: 'fr-data09-v1';
  readonly authorityRef: 'authority.face.provider_run_identity_binding.frdata09';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'report_instance_binding_defined_no_external_execution_attestation';
  readonly protocol: ProviderRunIdentityBindingProtocolFRData09V1;
  readonly authorityBoundary: {
    readonly reportInstanceBindingMeansExternalProcessIdentityVerified: false;
    readonly reportInstanceBindingMeansProviderConstructValidityValidated: false;
    readonly reportInstanceBindingMeansHumanFaceIdentityValidated: false;
    readonly reportInstanceBindingMeansGroundTruthAuthorityValidated: false;
    readonly reportInstanceBindingMayAuthorizeClassificationMetrics: false;
    readonly reportInstanceBindingMayAuthorizeThresholds: false;
    readonly githubMetadataInsideReportMeansExternallyVerifiedRunIdentity: false;
    readonly timestampConsistencyMeansExternallyVerifiedRunStart: false;
    readonly facePresenceVerified: false;
    readonly singleHumanFaceVerified: false;
    readonly captureQualityAuthorityValidated: false;
    readonly anatomicalLandmarkAuthorityValidated: false;
    readonly traditionalSemanticAuthorityValidated: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
}

const SHA256 = /^sha256:[0-9a-f]{64}$/u;

export const PROVIDER_RUN_IDENTITY_BINDING_AUTHORITY_FRDATA09:
ProviderRunIdentityBindingAuthorityFRData09V1 = Object.freeze({
  schemaVersion: 'fr-data09-v1' as const,
  authorityRef: 'authority.face.provider_run_identity_binding.frdata09' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'report_instance_binding_defined_no_external_execution_attestation' as const,
  protocol: Object.freeze({
    groundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1' as const,
    providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1' as const,
    rawJoinSchemaRef: 'fr-data08-provider-face-count-raw-scoring-v1' as const,
    reportCanonicalizationAlgorithm: 'sorted_object_keys_preserve_array_order_json_v1' as const,
    reportDigestAlgorithm: 'sha256' as const,
    providerRunRefPrefix: 'frdata06-report-instance' as const,
    providerRunRefLocator: 'report_digest_plus_capture_ref' as const,
    exactDatasetRefMatchRequired: true as const,
    exactCaptureRefSetMatchRequired: true as const,
    exactAssetDigestMatchRequired: true as const,
    frozenAnnotationLedgerRequired: true as const,
    providerRunsAfterAnnotationFreezeRequired: true as const,
    providerRunStartMustNotExceedReportVerificationTimestamp: true as const,
    providerRunRefMayBeInferredFromGithubRunId: false as const,
    providerRunRefMayBeInferredFromTimestamp: false as const,
    reportDigestMeansExternalProcessIdentity: false as const,
    reportDigestMeansProviderConstructValidity: false as const,
    reportDigestMeansHumanFaceIdentity: false as const,
  }),
  authorityBoundary: Object.freeze({
    reportInstanceBindingMeansExternalProcessIdentityVerified: false as const,
    reportInstanceBindingMeansProviderConstructValidityValidated: false as const,
    reportInstanceBindingMeansHumanFaceIdentityValidated: false as const,
    reportInstanceBindingMeansGroundTruthAuthorityValidated: false as const,
    reportInstanceBindingMayAuthorizeClassificationMetrics: false as const,
    reportInstanceBindingMayAuthorizeThresholds: false as const,
    githubMetadataInsideReportMeansExternallyVerifiedRunIdentity: false as const,
    timestampConsistencyMeansExternallyVerifiedRunStart: false as const,
    facePresenceVerified: false as const,
    singleHumanFaceVerified: false as const,
    captureQualityAuthorityValidated: false as const,
    anatomicalLandmarkAuthorityValidated: false as const,
    traditionalSemanticAuthorityValidated: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
});

function fail(message: string): never {
  throw new FaceAuthorityValidationError(`FR-DATA-09 ${message}`);
}

function canonicalSha256(value: string, label: string): string {
  if (!SHA256.test(value)) fail(`${label} must use canonical lowercase sha256:<64-hex> form.`);
  return value;
}

function parseTimestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(`${label} must be a parseable timestamp.`);
  return parsed;
}

function canonicalJson(value: unknown, path: string): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) fail(`${path} contains a non-finite number.`);
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((entry, index) => canonicalJson(entry, `${path}[${index}]`)).join(',')}]`;
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) fail(`${path} must contain JSON-compatible plain objects only.`);
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort((left, right) => left.localeCompare(right));
      return `{${keys.map((key) => {
        const child = record[key];
        if (child === undefined) fail(`${path}.${key} cannot be undefined.`);
        return `${JSON.stringify(key)}:${canonicalJson(child, `${path}.${key}`)}`;
      }).join(',')}}`;
    }
    default:
      return fail(`${path} contains a non-JSON value.`);
  }
}

function validateAuthority(): ProviderRunIdentityBindingAuthorityFRData09V1 {
  const authority = PROVIDER_RUN_IDENTITY_BINDING_AUTHORITY_FRDATA09;
  const protocol = authority.protocol;
  if (
    authority.schemaVersion !== 'fr-data09-v1' ||
    authority.authorityRef !== 'authority.face.provider_run_identity_binding.frdata09' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'report_instance_binding_defined_no_external_execution_attestation' ||
    protocol.groundTruthSchemaRef !== 'fr-data07-independent-face-ground-truth-v1' ||
    protocol.providerObservationSchemaRef !== 'fr-data06-provider-face-candidate-observation-v1' ||
    protocol.rawJoinSchemaRef !== 'fr-data08-provider-face-count-raw-scoring-v1' ||
    protocol.reportCanonicalizationAlgorithm !== 'sorted_object_keys_preserve_array_order_json_v1' ||
    protocol.reportDigestAlgorithm !== 'sha256' ||
    protocol.providerRunRefPrefix !== 'frdata06-report-instance' ||
    protocol.providerRunRefLocator !== 'report_digest_plus_capture_ref' ||
    protocol.exactDatasetRefMatchRequired !== true ||
    protocol.exactCaptureRefSetMatchRequired !== true ||
    protocol.exactAssetDigestMatchRequired !== true ||
    protocol.frozenAnnotationLedgerRequired !== true ||
    protocol.providerRunsAfterAnnotationFreezeRequired !== true ||
    protocol.providerRunStartMustNotExceedReportVerificationTimestamp !== true ||
    protocol.providerRunRefMayBeInferredFromGithubRunId !== false ||
    protocol.providerRunRefMayBeInferredFromTimestamp !== false ||
    protocol.reportDigestMeansExternalProcessIdentity !== false ||
    protocol.reportDigestMeansProviderConstructValidity !== false ||
    protocol.reportDigestMeansHumanFaceIdentity !== false
  ) fail('authority/protocol drift.');

  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    fail('authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function computeProviderReportCanonicalDigestFRData09(
  providerReport: MentonDatasetProviderFaceCandidateObservationReportFRData06V1,
): string {
  validateAuthority();
  const serialized = canonicalJson(providerReport, 'providerReport');
  return `sha256:${createHash('sha256').update(serialized, 'utf8').digest('hex')}`;
}

export function deriveProviderRunRefForCaptureFRData09(
  providerReport: MentonDatasetProviderFaceCandidateObservationReportFRData06V1,
  captureRef: string,
): string {
  if (typeof captureRef !== 'string' || captureRef.trim().length === 0) fail('captureRef must be non-empty.');
  const digest = computeProviderReportCanonicalDigestFRData09(providerReport);
  return `${PROVIDER_RUN_IDENTITY_BINDING_AUTHORITY_FRDATA09.protocol.providerRunRefPrefix}:${digest}:capture:${encodeURIComponent(captureRef)}`;
}

export function buildProviderRunIdentityBindingReportFRData09(
  groundTruthDataset: IndependentFaceGroundTruthDatasetFRData07V1,
  providerReport: MentonDatasetProviderFaceCandidateObservationReportFRData06V1,
): ProviderRunIdentityBindingReportFRData09V1 {
  validateAuthority();

  const rawJoin = buildProviderFaceCountRawScoringReportFRData08(groundTruthDataset, providerReport);
  if (rawJoin.rawAnnotationProviderJoinPerformed !== true || rawJoin.exactCaptureRefSetMatched !== true ||
      rawJoin.exactAssetDigestJoinVerified !== true || rawJoin.frozenAnnotationLedgerRequired !== true ||
      rawJoin.annotationLedgerFrozenBeforeProviderScoringVerified !== true) {
    fail('FR-DATA-08 exact join/freeze prerequisite is incomplete.');
  }

  if (groundTruthDataset.annotationLedgerDigest === null) fail('frozen annotation ledger digest is required.');
  canonicalSha256(groundTruthDataset.annotationLedgerDigest, 'annotationLedgerDigest');

  const providerReportDigest = computeProviderReportCanonicalDigestFRData09(providerReport);
  canonicalSha256(providerReportDigest, 'providerReportDigest');
  const verificationTimestamp = providerReport.providerProvenance.verificationTimestamp;
  const verificationTime = parseTimestamp(verificationTimestamp, 'providerReport.providerProvenance.verificationTimestamp');

  const providerByCapture = new Map(providerReport.captureObservations.map((entry) => [entry.captureRef, entry] as const));
  const captureBindings = groundTruthDataset.captures.map((capture) => {
    const provider = providerByCapture.get(capture.captureRef);
    if (provider === undefined) fail(`missing provider observation for ${capture.captureRef}.`);
    if (provider.actualDigest !== capture.canonicalAssetDigest) {
      fail(`capture ${capture.captureRef} exact asset digest drifted after FR-DATA-08 prerequisite validation.`);
    }
    if (capture.providerRunRef === null || capture.providerRunStartedAt === null) {
      fail(`capture ${capture.captureRef} provider run identity metadata is required.`);
    }

    const expectedProviderRunRef = `${PROVIDER_RUN_IDENTITY_BINDING_AUTHORITY_FRDATA09.protocol.providerRunRefPrefix}:${providerReportDigest}:capture:${encodeURIComponent(capture.captureRef)}`;
    if (capture.providerRunRef !== expectedProviderRunRef) {
      fail(`capture ${capture.captureRef} providerRunRef does not bind to the exact FR-DATA-06 report instance/capture observation.`);
    }

    const startedAt = parseTimestamp(capture.providerRunStartedAt, `${capture.captureRef}.providerRunStartedAt`);
    if (startedAt > verificationTime) {
      fail(`capture ${capture.captureRef} providerRunStartedAt cannot be later than the FR-DATA-06 report verification timestamp.`);
    }

    return Object.freeze({
      captureRef: capture.captureRef,
      canonicalAssetDigest: capture.canonicalAssetDigest,
      providerRasterSha256: canonicalSha256(provider.rasterSha256, `${capture.captureRef}.providerRasterSha256`),
      providerRunRef: capture.providerRunRef,
      expectedProviderRunRef,
      providerRunStartedAt: capture.providerRunStartedAt,
      providerReportVerificationTimestamp: verificationTimestamp,
      exactProviderRunRefMatched: true as const,
      exactAssetDigestMatched: true as const,
      providerRunStartedAtNotAfterReportVerification: true as const,
    });
  });

  return Object.freeze({
    schemaVersion: 'fr-data09-provider-run-identity-binding-v1' as const,
    datasetRef: groundTruthDataset.datasetRef,
    groundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1' as const,
    providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1' as const,
    rawJoinSchemaRef: 'fr-data08-provider-face-count-raw-scoring-v1' as const,
    annotationLedgerDigest: groundTruthDataset.annotationLedgerDigest,
    providerReportDigest,
    providerReportCanonicalizationAlgorithm: 'sorted_object_keys_preserve_array_order_json_v1' as const,
    providerReportDigestAlgorithm: 'sha256' as const,
    captureCount: captureBindings.length,
    captureBindings: Object.freeze(captureBindings),
    exactDatasetRefMatched: true as const,
    exactCaptureRefSetMatched: true as const,
    exactAssetDigestJoinVerified: true as const,
    frozenAnnotationLedgerVerified: true as const,
    annotationLedgerFrozenBeforeProviderScoringVerified: true as const,
    providerRunRefToExactReportInstanceBindingVerified: true as const,
    providerRunRefToExactCaptureObservationBindingVerified: true as const,
    providerRunStartTemporalConsistencyVerified: true as const,
    providerReportCanonicalContentDigestComputed: true as const,
    upstreamProviderReportCanonicalReconstructionPerformed: false as const,
    externalProviderExecutionIdentityVerified: false as const,
    githubRunIdentityExternallyVerified: false as const,
    providerRunStartTimestampExternallyVerified: false as const,
    providerDetectionConstructValidityValidated: false as const,
    providerFaceCandidateHumanIdentityValidated: false as const,
    singleHumanFaceVerified: false as const,
    facePresenceVerified: false as const,
    captureConsensusLabelDerived: false as const,
    interAnnotatorGroundTruthAuthorityValidated: false as const,
    classificationMetricsComputed: false as const,
    calibrationThresholdsDefined: false as const,
    holdoutUsedForTuning: false as const,
    nearDuplicatePartitionLeakageValidated: false as const,
    reviewedEmpiricalValidationCompleted: false as const,
    captureQualityAuthorityValidated: false as const,
    anatomicalLandmarkAuthorityValidated: false as const,
    traditionalSemanticAuthorityValidated: false as const,
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

export function assertProviderRunIdentityBindingReadyForPromotionFRData09(): never {
  validateAuthority();
  return fail(
    'exact FR-DATA-07 providerRunRef to FR-DATA-06 report-instance/capture-observation binding proves evidence identity only; it does not externally attest the provider process, validate human-face constructs, resolve annotator disagreement, define thresholds, authorize classification metrics, or promote capture quality, anatomy, traditional semantics, or production geometry.',
  );
}
