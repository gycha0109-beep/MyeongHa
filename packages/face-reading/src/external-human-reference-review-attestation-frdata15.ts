import { createHash } from 'node:crypto';
import type { IndependentFaceGroundTruthDatasetFRData07V1 } from './independent-face-ground-truth-frdata07.js';
import type { IndependentFaceAdjudicationDatasetFRData10V1 } from './independent-face-adjudication-frdata10.js';
import {
  HUMAN_FACE_CONSTRUCT_REFERENCE_ADMISSION_AUTHORITY_FRDATA14,
  buildHumanFaceConstructReferenceAdmissionReportFRData14,
  computeHumanFaceConstructDefinitionDigestFRData14,
  type HumanFaceConstructReferenceAdmissionReportFRData14V1,
} from './human-face-construct-reference-admission-frdata14.js';
import { FaceAuthorityValidationError } from './validation.js';

export type ExternalHumanReferenceReviewDecisionFRData15V1 =
  | 'approve_reference_candidate_set'
  | 'changes_required'
  | 'reject_reference_candidate_set'
  | 'unable_to_conclude';

export interface HumanReferenceReviewPackageFRData15V1 {
  readonly schemaVersion: 'fr-data15-human-reference-review-package-v1';
  readonly upstreamReferenceAdmissionSchemaRef: 'fr-data14-human-face-construct-reference-admission-v1';
  readonly datasetRef: string;
  readonly constructRef: 'construct.face.categorical_human_face_count_state.frdata14';
  readonly constructVersion: '0.1.0';
  readonly constructDefinitionDigest: string;
  readonly upstreamAnnotationLedgerDigest: string;
  readonly upstreamAdjudicationLedgerDigest: string;
  readonly admissionSetDigest: string;
  readonly captureCount: number;
  readonly admittedReferenceCandidateCount: number;
  readonly preservedNonScoringIndeterminateCount: number;
  readonly preservedNonScoringUnresolvedCount: number;
  readonly providerEvidenceIncluded: false;
  readonly providerPerformanceIncluded: false;
  readonly providerThresholdsIncluded: false;
  readonly packageCanonicalizationAlgorithm: 'sorted_object_keys_preserve_array_order_json_v1';
  readonly packageDigestAlgorithm: 'sha256';
  readonly reviewPackageDigest: string;
}

export interface ExternalHumanReferenceReviewAttestationFRData15V1 {
  readonly schemaVersion: 'fr-data15-external-human-reference-review-attestation-v1';
  readonly attestationRef: string;
  readonly reviewPackageDigest: string;
  readonly reviewerRef: string;
  readonly reviewerRole: string;
  readonly reviewerOrganizationRef: string | null;
  readonly reviewEvidenceBundleDigest: string;
  readonly reviewStatementArtifactDigest: string;
  readonly detachedSignatureArtifactDigest: string;
  readonly signerKeyRef: string;
  readonly reviewedAt: string;
  readonly declaredDecision: ExternalHumanReferenceReviewDecisionFRData15V1;
  readonly reviewerIndependenceDeclared: true;
  readonly reviewedConstructDefinition: true;
  readonly reviewedCompleteReferenceCandidateAdmissionSet: true;
  readonly reviewedPreservedNonScoringOutcomes: true;
  readonly reviewedCanonicalCaptureAssets: true;
  readonly reviewedFrozenIndependentAnnotations: true;
  readonly reviewedFrozenAdjudications: true;
  readonly providerOutputVisibleDuringReview: false;
  readonly providerPerformanceVisibleDuringReview: false;
  readonly providerThresholdsVisibleDuringReview: false;
  readonly providerEvidenceUsedToReachDecision: false;
  readonly automaticDecisionRuleUsed: false;
  readonly syntheticFixtureUsedAsEmpiricalEvidence: false;
}

export interface ExternalHumanReferenceReviewAttestationReportFRData15V1 {
  readonly schemaVersion: 'fr-data15-external-human-reference-review-attestation-report-v1';
  readonly datasetRef: string;
  readonly constructRef: 'construct.face.categorical_human_face_count_state.frdata14';
  readonly constructDefinitionDigest: string;
  readonly upstreamAnnotationLedgerDigest: string;
  readonly upstreamAdjudicationLedgerDigest: string;
  readonly admissionSetDigest: string;
  readonly reviewPackageDigest: string;
  readonly attestationRef: string;
  readonly reviewerRef: string;
  readonly reviewerRole: string;
  readonly reviewerOrganizationRef: string | null;
  readonly reviewEvidenceBundleDigest: string;
  readonly reviewStatementArtifactDigest: string;
  readonly detachedSignatureArtifactDigest: string;
  readonly signerKeyRef: string;
  readonly reviewedAt: string;
  readonly declaredDecision: ExternalHumanReferenceReviewDecisionFRData15V1;
  readonly exactReviewPackageBindingVerified: true;
  readonly exactConstructDefinitionBindingVerified: true;
  readonly exactAnnotationLedgerBindingVerified: true;
  readonly exactAdjudicationLedgerBindingVerified: true;
  readonly exactAdmissionSetBindingVerified: true;
  readonly reviewScopeDeclarationComplete: true;
  readonly providerBlindReviewDeclarationRecorded: true;
  readonly reviewerRefDistinctFromHumanEvidenceActorsRecorded: true;
  readonly reviewTimestampRecordConsistencyVerified: true;
  readonly evidenceBundleDigestRecorded: true;
  readonly reviewStatementArtifactDigestRecorded: true;
  readonly detachedSignatureArtifactDigestRecorded: true;
  readonly signerKeyRefRecorded: true;
  readonly declaredExternalReviewAttestationRecorded: true;
  readonly externalReviewerIdentityVerified: false;
  readonly reviewerCredentialVerified: false;
  readonly cryptographicSignatureVerified: false;
  readonly signerKeyTrustEstablished: false;
  readonly pinnedExternalTrustRootAvailable: false;
  readonly reviewEvidenceBundleContentExternallyVerified: false;
  readonly reviewTimestampExternallyVerified: false;
  readonly externalReviewAuthenticityValidated: false;
  readonly externalConstructReviewCompleted: false;
  readonly externalReferenceStandardReviewCompleted: false;
  readonly reviewedHumanReferenceStandardAuthorityValidated: false;
  readonly captureConsensusGroundTruthAuthorityValidated: false;
  readonly interAnnotatorGroundTruthAuthorityValidated: false;
  readonly providerDetectionConstructValidityValidated: false;
  readonly providerFaceCandidateHumanIdentityValidated: false;
  readonly facePresenceVerified: false;
  readonly singleHumanFaceVerified: false;
  readonly truePositiveFalsePositiveTerminologyAuthorized: false;
  readonly confusionMatrixAuthorized: false;
  readonly classificationMetricsAuthorized: false;
  readonly classificationMetricsComputed: false;
  readonly providerDecisionThresholdDefined: false;
  readonly reviewedEmpiricalValidationCompleted: false;
  readonly nearDuplicatePartitionLeakageValidated: false;
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

export interface ExternalHumanReferenceReviewAttestationAuthorityFRData15V1 {
  readonly schemaVersion: 'fr-data15-v1';
  readonly authorityRef: 'authority.face.external_human_reference_review_attestation.frdata15';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'external_review_attestation_contract_defined_no_authenticated_external_review';
  readonly protocol: {
    readonly upstreamReferenceAdmissionAuthorityRef: 'authority.face.human_construct_reference_candidate_admission.frdata14';
    readonly upstreamReferenceAdmissionSchemaRef: 'fr-data14-human-face-construct-reference-admission-v1';
    readonly reviewPackageCanonicalizationAlgorithm: 'sorted_object_keys_preserve_array_order_json_v1';
    readonly reviewPackageDigestAlgorithm: 'sha256';
    readonly exactConstructDefinitionDigestRequired: true;
    readonly exactAnnotationLedgerDigestRequired: true;
    readonly exactAdjudicationLedgerDigestRequired: true;
    readonly exactAdmissionSetRequired: true;
    readonly reviewPackageMayContainProviderEvidence: false;
    readonly reviewPackageMayContainProviderPerformance: false;
    readonly reviewPackageMayContainProviderThresholds: false;
    readonly reviewerRefDistinctFromHumanEvidenceActorsRequired: true;
    readonly reviewerIndependenceDeclarationRequired: true;
    readonly constructDefinitionReviewRequired: true;
    readonly completeReferenceCandidateAdmissionSetReviewRequired: true;
    readonly preservedNonScoringOutcomeReviewRequired: true;
    readonly canonicalCaptureAssetReviewDeclaredRequired: true;
    readonly frozenIndependentAnnotationReviewDeclaredRequired: true;
    readonly frozenAdjudicationReviewDeclaredRequired: true;
    readonly providerBlindExternalReviewRequired: true;
    readonly providerOutputVisibleDuringReview: false;
    readonly providerPerformanceVisibleDuringReview: false;
    readonly providerThresholdsVisibleDuringReview: false;
    readonly providerEvidenceMayInfluenceExternalReviewDecision: false;
    readonly reviewTimestampMustNotPrecedeAdjudicationFreeze: true;
    readonly reviewEvidenceBundleDigestRequired: true;
    readonly reviewStatementArtifactDigestRequired: true;
    readonly detachedSignatureArtifactDigestRequired: true;
    readonly signerKeyRefRequired: true;
    readonly signatureCryptographicVerificationPerformedByThisSlice: false;
    readonly signerKeyTrustEstablishedByThisSlice: false;
    readonly pinnedExternalTrustRootDefinedByThisSlice: false;
    readonly reviewerIdentityVerifiedByThisSlice: false;
    readonly reviewEvidenceBundleContentVerifiedByThisSlice: false;
    readonly declaredApprovalMeansReviewedReferenceStandardAuthority: false;
    readonly declaredApprovalMeansExternalReviewAuthenticityValidated: false;
    readonly automaticApprovalAllowed: false;
    readonly syntheticFixturesMayValidateExternalReviewAuthenticity: false;
    readonly minimumExternalReviewers: null;
    readonly requiredReviewerCredential: null;
    readonly allowedSignatureAlgorithm: null;
    readonly externalReviewAcceptanceThreshold: null;
    readonly classificationMetricsAuthorized: false;
  };
  readonly authorityBoundary: {
    readonly recordedReviewerRefMeansVerifiedReviewerIdentity: false;
    readonly recordedReviewerRoleMeansVerifiedCredential: false;
    readonly recordedSignatureArtifactMeansCryptographicallyVerifiedSignature: false;
    readonly recordedSignerKeyRefMeansTrustedSignerKey: false;
    readonly exactPackageBindingMeansExternalReviewAuthenticityValidated: false;
    readonly declaredApprovalMeansExternalConstructReviewCompleted: false;
    readonly declaredApprovalMeansExternalReferenceStandardReviewCompleted: false;
    readonly declaredApprovalMeansReviewedHumanReferenceStandardAuthorityValidated: false;
    readonly externalReviewAttestationMayAuthorizeClassificationMetrics: false;
    readonly externalReviewAttestationMayAuthorizeProviderThresholds: false;
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
const REVIEW_DECISIONS = Object.freeze([
  'approve_reference_candidate_set',
  'changes_required',
  'reject_reference_candidate_set',
  'unable_to_conclude',
] as const);

export const EXTERNAL_HUMAN_REFERENCE_REVIEW_ATTESTATION_AUTHORITY_FRDATA15:
ExternalHumanReferenceReviewAttestationAuthorityFRData15V1 = Object.freeze({
  schemaVersion: 'fr-data15-v1' as const,
  authorityRef: 'authority.face.external_human_reference_review_attestation.frdata15' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'external_review_attestation_contract_defined_no_authenticated_external_review' as const,
  protocol: Object.freeze({
    upstreamReferenceAdmissionAuthorityRef: 'authority.face.human_construct_reference_candidate_admission.frdata14' as const,
    upstreamReferenceAdmissionSchemaRef: 'fr-data14-human-face-construct-reference-admission-v1' as const,
    reviewPackageCanonicalizationAlgorithm: 'sorted_object_keys_preserve_array_order_json_v1' as const,
    reviewPackageDigestAlgorithm: 'sha256' as const,
    exactConstructDefinitionDigestRequired: true as const,
    exactAnnotationLedgerDigestRequired: true as const,
    exactAdjudicationLedgerDigestRequired: true as const,
    exactAdmissionSetRequired: true as const,
    reviewPackageMayContainProviderEvidence: false as const,
    reviewPackageMayContainProviderPerformance: false as const,
    reviewPackageMayContainProviderThresholds: false as const,
    reviewerRefDistinctFromHumanEvidenceActorsRequired: true as const,
    reviewerIndependenceDeclarationRequired: true as const,
    constructDefinitionReviewRequired: true as const,
    completeReferenceCandidateAdmissionSetReviewRequired: true as const,
    preservedNonScoringOutcomeReviewRequired: true as const,
    canonicalCaptureAssetReviewDeclaredRequired: true as const,
    frozenIndependentAnnotationReviewDeclaredRequired: true as const,
    frozenAdjudicationReviewDeclaredRequired: true as const,
    providerBlindExternalReviewRequired: true as const,
    providerOutputVisibleDuringReview: false as const,
    providerPerformanceVisibleDuringReview: false as const,
    providerThresholdsVisibleDuringReview: false as const,
    providerEvidenceMayInfluenceExternalReviewDecision: false as const,
    reviewTimestampMustNotPrecedeAdjudicationFreeze: true as const,
    reviewEvidenceBundleDigestRequired: true as const,
    reviewStatementArtifactDigestRequired: true as const,
    detachedSignatureArtifactDigestRequired: true as const,
    signerKeyRefRequired: true as const,
    signatureCryptographicVerificationPerformedByThisSlice: false as const,
    signerKeyTrustEstablishedByThisSlice: false as const,
    pinnedExternalTrustRootDefinedByThisSlice: false as const,
    reviewerIdentityVerifiedByThisSlice: false as const,
    reviewEvidenceBundleContentVerifiedByThisSlice: false as const,
    declaredApprovalMeansReviewedReferenceStandardAuthority: false as const,
    declaredApprovalMeansExternalReviewAuthenticityValidated: false as const,
    automaticApprovalAllowed: false as const,
    syntheticFixturesMayValidateExternalReviewAuthenticity: false as const,
    minimumExternalReviewers: null,
    requiredReviewerCredential: null,
    allowedSignatureAlgorithm: null,
    externalReviewAcceptanceThreshold: null,
    classificationMetricsAuthorized: false as const,
  }),
  authorityBoundary: Object.freeze({
    recordedReviewerRefMeansVerifiedReviewerIdentity: false as const,
    recordedReviewerRoleMeansVerifiedCredential: false as const,
    recordedSignatureArtifactMeansCryptographicallyVerifiedSignature: false as const,
    recordedSignerKeyRefMeansTrustedSignerKey: false as const,
    exactPackageBindingMeansExternalReviewAuthenticityValidated: false as const,
    declaredApprovalMeansExternalConstructReviewCompleted: false as const,
    declaredApprovalMeansExternalReferenceStandardReviewCompleted: false as const,
    declaredApprovalMeansReviewedHumanReferenceStandardAuthorityValidated: false as const,
    externalReviewAttestationMayAuthorizeClassificationMetrics: false as const,
    externalReviewAttestationMayAuthorizeProviderThresholds: false as const,
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
  throw new FaceAuthorityValidationError(`FR-DATA-15 ${message}`);
}

function nonEmpty(value: string, label: string): string {
  if (value.trim().length === 0) fail(`${label} must be non-empty.`);
  return value;
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

function lexicalCompare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
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
      const keys = Object.keys(record).sort(lexicalCompare);
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

function sha256Canonical(value: unknown, path: string): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value, path), 'utf8').digest('hex')}`;
}

function validateReviewDecision(value: string): asserts value is ExternalHumanReferenceReviewDecisionFRData15V1 {
  if (!(REVIEW_DECISIONS as readonly string[]).includes(value)) fail(`unsupported declared review decision: ${value}.`);
}

export function validateExternalHumanReferenceReviewAttestationAuthorityFRData15(
  authority: ExternalHumanReferenceReviewAttestationAuthorityFRData15V1 = EXTERNAL_HUMAN_REFERENCE_REVIEW_ATTESTATION_AUTHORITY_FRDATA15,
): ExternalHumanReferenceReviewAttestationAuthorityFRData15V1 {
  if (
    authority.schemaVersion !== 'fr-data15-v1' ||
    authority.authorityRef !== 'authority.face.external_human_reference_review_attestation.frdata15' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'external_review_attestation_contract_defined_no_authenticated_external_review'
  ) fail('authority identity/state drift.');

  const protocol = authority.protocol;
  if (
    protocol.upstreamReferenceAdmissionAuthorityRef !== HUMAN_FACE_CONSTRUCT_REFERENCE_ADMISSION_AUTHORITY_FRDATA14.authorityRef ||
    protocol.upstreamReferenceAdmissionSchemaRef !== 'fr-data14-human-face-construct-reference-admission-v1' ||
    protocol.reviewPackageCanonicalizationAlgorithm !== 'sorted_object_keys_preserve_array_order_json_v1' ||
    protocol.reviewPackageDigestAlgorithm !== 'sha256' ||
    protocol.exactConstructDefinitionDigestRequired !== true ||
    protocol.exactAnnotationLedgerDigestRequired !== true ||
    protocol.exactAdjudicationLedgerDigestRequired !== true ||
    protocol.exactAdmissionSetRequired !== true ||
    protocol.reviewPackageMayContainProviderEvidence !== false ||
    protocol.reviewPackageMayContainProviderPerformance !== false ||
    protocol.reviewPackageMayContainProviderThresholds !== false ||
    protocol.reviewerRefDistinctFromHumanEvidenceActorsRequired !== true ||
    protocol.reviewerIndependenceDeclarationRequired !== true ||
    protocol.constructDefinitionReviewRequired !== true ||
    protocol.completeReferenceCandidateAdmissionSetReviewRequired !== true ||
    protocol.preservedNonScoringOutcomeReviewRequired !== true ||
    protocol.canonicalCaptureAssetReviewDeclaredRequired !== true ||
    protocol.frozenIndependentAnnotationReviewDeclaredRequired !== true ||
    protocol.frozenAdjudicationReviewDeclaredRequired !== true ||
    protocol.providerBlindExternalReviewRequired !== true ||
    protocol.providerOutputVisibleDuringReview !== false ||
    protocol.providerPerformanceVisibleDuringReview !== false ||
    protocol.providerThresholdsVisibleDuringReview !== false ||
    protocol.providerEvidenceMayInfluenceExternalReviewDecision !== false ||
    protocol.reviewTimestampMustNotPrecedeAdjudicationFreeze !== true ||
    protocol.reviewEvidenceBundleDigestRequired !== true ||
    protocol.reviewStatementArtifactDigestRequired !== true ||
    protocol.detachedSignatureArtifactDigestRequired !== true ||
    protocol.signerKeyRefRequired !== true ||
    protocol.signatureCryptographicVerificationPerformedByThisSlice !== false ||
    protocol.signerKeyTrustEstablishedByThisSlice !== false ||
    protocol.pinnedExternalTrustRootDefinedByThisSlice !== false ||
    protocol.reviewerIdentityVerifiedByThisSlice !== false ||
    protocol.reviewEvidenceBundleContentVerifiedByThisSlice !== false ||
    protocol.declaredApprovalMeansReviewedReferenceStandardAuthority !== false ||
    protocol.declaredApprovalMeansExternalReviewAuthenticityValidated !== false ||
    protocol.automaticApprovalAllowed !== false ||
    protocol.syntheticFixturesMayValidateExternalReviewAuthenticity !== false ||
    protocol.classificationMetricsAuthorized !== false
  ) fail('protocol authority boundary drift.');

  if (
    protocol.minimumExternalReviewers !== null ||
    protocol.requiredReviewerCredential !== null ||
    protocol.allowedSignatureAlgorithm !== null ||
    protocol.externalReviewAcceptanceThreshold !== null
  ) fail('external reviewer minima, credential policy, signature algorithm policy, and acceptance thresholds must remain unset.');

  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    fail('authority boundary must remain fully fail-closed.');
  }

  return authority;
}

function admissionProjection(report: HumanFaceConstructReferenceAdmissionReportFRData14V1): unknown {
  return report.admissions
    .map((entry) => ({
      captureRef: entry.captureRef,
      partition: entry.partition,
      canonicalAssetDigest: entry.canonicalAssetDigest,
      adjudicationOutcome: entry.adjudicationOutcome,
      admissionState: entry.admissionState,
      scoringReferenceClass: entry.scoringReferenceClass,
    }))
    .sort((left, right) => lexicalCompare(left.captureRef, right.captureRef));
}

export function computeHumanReferenceAdmissionSetDigestFRData15(
  report: HumanFaceConstructReferenceAdmissionReportFRData14V1,
): string {
  validateExternalHumanReferenceReviewAttestationAuthorityFRData15();
  return sha256Canonical(admissionProjection(report), 'referenceAdmissionSet');
}

export function computeHumanReferenceReviewPackageDigestFRData15(
  value: Omit<HumanReferenceReviewPackageFRData15V1, 'reviewPackageDigest'>,
): string {
  validateExternalHumanReferenceReviewAttestationAuthorityFRData15();
  return sha256Canonical(value, 'humanReferenceReviewPackage');
}

export function buildHumanReferenceReviewPackageFRData15(
  groundTruthDataset: IndependentFaceGroundTruthDatasetFRData07V1,
  adjudicationDataset: IndependentFaceAdjudicationDatasetFRData10V1,
): HumanReferenceReviewPackageFRData15V1 {
  validateExternalHumanReferenceReviewAttestationAuthorityFRData15();
  const upstream = buildHumanFaceConstructReferenceAdmissionReportFRData14(
    groundTruthDataset,
    adjudicationDataset,
  );

  if (
    upstream.schemaVersion !== 'fr-data14-human-face-construct-reference-admission-v1' ||
    upstream.constructDefinitionDigest !== computeHumanFaceConstructDefinitionDigestFRData14() ||
    upstream.providerEvidenceConsumedToDefineConstruct !== false ||
    upstream.providerOutputMappingDefined !== false ||
    upstream.reviewedHumanReferenceStandardAuthorityValidated !== false ||
    upstream.externalConstructReviewCompleted !== false ||
    upstream.externalReferenceStandardReviewCompleted !== false ||
    upstream.classificationMetricsAuthorized !== false ||
    upstream.classificationMetricsComputed !== false ||
    upstream.providerDecisionThresholdDefined !== false
  ) fail('FR-DATA-14 reference-admission boundary is not intact.');

  canonicalSha256(upstream.constructDefinitionDigest, 'constructDefinitionDigest');
  canonicalSha256(upstream.upstreamAnnotationLedgerDigest, 'upstreamAnnotationLedgerDigest');
  canonicalSha256(upstream.upstreamAdjudicationLedgerDigest, 'upstreamAdjudicationLedgerDigest');
  const admissionSetDigest = computeHumanReferenceAdmissionSetDigestFRData15(upstream);

  const content = Object.freeze({
    schemaVersion: 'fr-data15-human-reference-review-package-v1' as const,
    upstreamReferenceAdmissionSchemaRef: 'fr-data14-human-face-construct-reference-admission-v1' as const,
    datasetRef: upstream.datasetRef,
    constructRef: upstream.constructRef,
    constructVersion: '0.1.0' as const,
    constructDefinitionDigest: upstream.constructDefinitionDigest,
    upstreamAnnotationLedgerDigest: upstream.upstreamAnnotationLedgerDigest,
    upstreamAdjudicationLedgerDigest: upstream.upstreamAdjudicationLedgerDigest,
    admissionSetDigest,
    captureCount: upstream.captureCount,
    admittedReferenceCandidateCount: upstream.admittedReferenceCandidateCount,
    preservedNonScoringIndeterminateCount: upstream.preservedNonScoringIndeterminateCount,
    preservedNonScoringUnresolvedCount: upstream.preservedNonScoringUnresolvedCount,
    providerEvidenceIncluded: false as const,
    providerPerformanceIncluded: false as const,
    providerThresholdsIncluded: false as const,
    packageCanonicalizationAlgorithm: 'sorted_object_keys_preserve_array_order_json_v1' as const,
    packageDigestAlgorithm: 'sha256' as const,
  });

  return Object.freeze({
    ...content,
    reviewPackageDigest: computeHumanReferenceReviewPackageDigestFRData15(content),
  });
}

export function validateHumanReferenceReviewPackageFRData15(
  reviewPackage: HumanReferenceReviewPackageFRData15V1,
): HumanReferenceReviewPackageFRData15V1 {
  validateExternalHumanReferenceReviewAttestationAuthorityFRData15();
  if (
    reviewPackage.schemaVersion !== 'fr-data15-human-reference-review-package-v1' ||
    reviewPackage.upstreamReferenceAdmissionSchemaRef !== 'fr-data14-human-face-construct-reference-admission-v1' ||
    reviewPackage.constructRef !== 'construct.face.categorical_human_face_count_state.frdata14' ||
    reviewPackage.constructVersion !== '0.1.0' ||
    reviewPackage.packageCanonicalizationAlgorithm !== 'sorted_object_keys_preserve_array_order_json_v1' ||
    reviewPackage.packageDigestAlgorithm !== 'sha256' ||
    reviewPackage.providerEvidenceIncluded !== false ||
    reviewPackage.providerPerformanceIncluded !== false ||
    reviewPackage.providerThresholdsIncluded !== false
  ) fail('review package identity/boundary drift.');

  nonEmpty(reviewPackage.datasetRef, 'reviewPackage.datasetRef');
  canonicalSha256(reviewPackage.constructDefinitionDigest, 'reviewPackage.constructDefinitionDigest');
  canonicalSha256(reviewPackage.upstreamAnnotationLedgerDigest, 'reviewPackage.upstreamAnnotationLedgerDigest');
  canonicalSha256(reviewPackage.upstreamAdjudicationLedgerDigest, 'reviewPackage.upstreamAdjudicationLedgerDigest');
  canonicalSha256(reviewPackage.admissionSetDigest, 'reviewPackage.admissionSetDigest');
  canonicalSha256(reviewPackage.reviewPackageDigest, 'reviewPackage.reviewPackageDigest');
  if (reviewPackage.constructDefinitionDigest !== computeHumanFaceConstructDefinitionDigestFRData14()) {
    fail('review package construct-definition digest must exactly match the current frozen FR-DATA-14 definition.');
  }

  for (const [label, value] of [
    ['captureCount', reviewPackage.captureCount],
    ['admittedReferenceCandidateCount', reviewPackage.admittedReferenceCandidateCount],
    ['preservedNonScoringIndeterminateCount', reviewPackage.preservedNonScoringIndeterminateCount],
    ['preservedNonScoringUnresolvedCount', reviewPackage.preservedNonScoringUnresolvedCount],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) fail(`reviewPackage.${label} must be a non-negative integer.`);
  }

  if (
    reviewPackage.admittedReferenceCandidateCount +
    reviewPackage.preservedNonScoringIndeterminateCount +
    reviewPackage.preservedNonScoringUnresolvedCount !== reviewPackage.captureCount
  ) fail('review package capture-count partition does not reconcile.');

  const { reviewPackageDigest: _ignored, ...content } = reviewPackage;
  const expectedDigest = computeHumanReferenceReviewPackageDigestFRData15(content);
  if (reviewPackage.reviewPackageDigest !== expectedDigest) fail('review package digest does not match canonical package content.');

  return reviewPackage;
}

export function validateExternalHumanReferenceReviewAttestationFRData15(
  reviewPackage: HumanReferenceReviewPackageFRData15V1,
  groundTruthDataset: IndependentFaceGroundTruthDatasetFRData07V1,
  adjudicationDataset: IndependentFaceAdjudicationDatasetFRData10V1,
  attestation: ExternalHumanReferenceReviewAttestationFRData15V1,
): ExternalHumanReferenceReviewAttestationFRData15V1 {
  validateHumanReferenceReviewPackageFRData15(reviewPackage);
  const expectedReviewPackage = buildHumanReferenceReviewPackageFRData15(
    groundTruthDataset,
    adjudicationDataset,
  );
  if (reviewPackage.reviewPackageDigest !== expectedReviewPackage.reviewPackageDigest) {
    fail('supplied review package must exactly match the package recomputed from the supplied FR-DATA-07/10 evidence.');
  }

  if (attestation.schemaVersion !== 'fr-data15-external-human-reference-review-attestation-v1') {
    fail('attestation schema drift.');
  }
  nonEmpty(attestation.attestationRef, 'attestation.attestationRef');
  nonEmpty(attestation.reviewerRef, 'attestation.reviewerRef');
  nonEmpty(attestation.reviewerRole, 'attestation.reviewerRole');
  if (attestation.reviewerOrganizationRef !== null) nonEmpty(attestation.reviewerOrganizationRef, 'attestation.reviewerOrganizationRef');
  nonEmpty(attestation.signerKeyRef, 'attestation.signerKeyRef');
  canonicalSha256(attestation.reviewPackageDigest, 'attestation.reviewPackageDigest');
  canonicalSha256(attestation.reviewEvidenceBundleDigest, 'attestation.reviewEvidenceBundleDigest');
  canonicalSha256(attestation.reviewStatementArtifactDigest, 'attestation.reviewStatementArtifactDigest');
  canonicalSha256(attestation.detachedSignatureArtifactDigest, 'attestation.detachedSignatureArtifactDigest');
  validateReviewDecision(attestation.declaredDecision);
  const reviewedAt = parseTimestamp(attestation.reviewedAt, 'attestation.reviewedAt');

  if (attestation.reviewPackageDigest !== reviewPackage.reviewPackageDigest) {
    fail('attestation must bind to the exact canonical FR-DATA-15 review package digest.');
  }

  if (
    attestation.reviewerIndependenceDeclared !== true ||
    attestation.reviewedConstructDefinition !== true ||
    attestation.reviewedCompleteReferenceCandidateAdmissionSet !== true ||
    attestation.reviewedPreservedNonScoringOutcomes !== true ||
    attestation.reviewedCanonicalCaptureAssets !== true ||
    attestation.reviewedFrozenIndependentAnnotations !== true ||
    attestation.reviewedFrozenAdjudications !== true ||
    attestation.providerOutputVisibleDuringReview !== false ||
    attestation.providerPerformanceVisibleDuringReview !== false ||
    attestation.providerThresholdsVisibleDuringReview !== false ||
    attestation.providerEvidenceUsedToReachDecision !== false ||
    attestation.automaticDecisionRuleUsed !== false ||
    attestation.syntheticFixtureUsedAsEmpiricalEvidence !== false
  ) fail('external review attestation violates review-scope or provider-blindness requirements.');

  const humanEvidenceActorRefs = new Set([
    ...groundTruthDataset.annotations.map((entry) => entry.annotatorRef),
    ...adjudicationDataset.adjudications.map((entry) => entry.adjudicatorRef),
  ]);
  if (humanEvidenceActorRefs.has(attestation.reviewerRef)) {
    fail('reviewerRef must be distinct from all original annotator and adjudicator refs.');
  }

  if (!adjudicationDataset.adjudicationLedgerFrozen || adjudicationDataset.adjudicationLedgerFrozenAt === null) {
    fail('FR-DATA-10 adjudication ledger must be frozen before external review attestation.');
  }
  const adjudicationFrozenAt = parseTimestamp(
    adjudicationDataset.adjudicationLedgerFrozenAt,
    'adjudicationDataset.adjudicationLedgerFrozenAt',
  );
  if (reviewedAt < adjudicationFrozenAt) {
    fail('external review timestamp cannot precede the frozen adjudication ledger timestamp.');
  }

  return attestation;
}

export function buildExternalHumanReferenceReviewAttestationReportFRData15(
  groundTruthDataset: IndependentFaceGroundTruthDatasetFRData07V1,
  adjudicationDataset: IndependentFaceAdjudicationDatasetFRData10V1,
  attestation: ExternalHumanReferenceReviewAttestationFRData15V1,
): ExternalHumanReferenceReviewAttestationReportFRData15V1 {
  const reviewPackage = buildHumanReferenceReviewPackageFRData15(
    groundTruthDataset,
    adjudicationDataset,
  );
  validateExternalHumanReferenceReviewAttestationFRData15(
    reviewPackage,
    groundTruthDataset,
    adjudicationDataset,
    attestation,
  );

  return Object.freeze({
    schemaVersion: 'fr-data15-external-human-reference-review-attestation-report-v1' as const,
    datasetRef: reviewPackage.datasetRef,
    constructRef: reviewPackage.constructRef,
    constructDefinitionDigest: reviewPackage.constructDefinitionDigest,
    upstreamAnnotationLedgerDigest: reviewPackage.upstreamAnnotationLedgerDigest,
    upstreamAdjudicationLedgerDigest: reviewPackage.upstreamAdjudicationLedgerDigest,
    admissionSetDigest: reviewPackage.admissionSetDigest,
    reviewPackageDigest: reviewPackage.reviewPackageDigest,
    attestationRef: attestation.attestationRef,
    reviewerRef: attestation.reviewerRef,
    reviewerRole: attestation.reviewerRole,
    reviewerOrganizationRef: attestation.reviewerOrganizationRef,
    reviewEvidenceBundleDigest: attestation.reviewEvidenceBundleDigest,
    reviewStatementArtifactDigest: attestation.reviewStatementArtifactDigest,
    detachedSignatureArtifactDigest: attestation.detachedSignatureArtifactDigest,
    signerKeyRef: attestation.signerKeyRef,
    reviewedAt: attestation.reviewedAt,
    declaredDecision: attestation.declaredDecision,
    exactReviewPackageBindingVerified: true as const,
    exactConstructDefinitionBindingVerified: true as const,
    exactAnnotationLedgerBindingVerified: true as const,
    exactAdjudicationLedgerBindingVerified: true as const,
    exactAdmissionSetBindingVerified: true as const,
    reviewScopeDeclarationComplete: true as const,
    providerBlindReviewDeclarationRecorded: true as const,
    reviewerRefDistinctFromHumanEvidenceActorsRecorded: true as const,
    reviewTimestampRecordConsistencyVerified: true as const,
    evidenceBundleDigestRecorded: true as const,
    reviewStatementArtifactDigestRecorded: true as const,
    detachedSignatureArtifactDigestRecorded: true as const,
    signerKeyRefRecorded: true as const,
    declaredExternalReviewAttestationRecorded: true as const,
    externalReviewerIdentityVerified: false as const,
    reviewerCredentialVerified: false as const,
    cryptographicSignatureVerified: false as const,
    signerKeyTrustEstablished: false as const,
    pinnedExternalTrustRootAvailable: false as const,
    reviewEvidenceBundleContentExternallyVerified: false as const,
    reviewTimestampExternallyVerified: false as const,
    externalReviewAuthenticityValidated: false as const,
    externalConstructReviewCompleted: false as const,
    externalReferenceStandardReviewCompleted: false as const,
    reviewedHumanReferenceStandardAuthorityValidated: false as const,
    captureConsensusGroundTruthAuthorityValidated: false as const,
    interAnnotatorGroundTruthAuthorityValidated: false as const,
    providerDetectionConstructValidityValidated: false as const,
    providerFaceCandidateHumanIdentityValidated: false as const,
    facePresenceVerified: false as const,
    singleHumanFaceVerified: false as const,
    truePositiveFalsePositiveTerminologyAuthorized: false as const,
    confusionMatrixAuthorized: false as const,
    classificationMetricsAuthorized: false as const,
    classificationMetricsComputed: false as const,
    providerDecisionThresholdDefined: false as const,
    reviewedEmpiricalValidationCompleted: false as const,
    nearDuplicatePartitionLeakageValidated: false as const,
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

export function assertExternalHumanReferenceReviewAttestationReadyForPromotionFRData15(): never {
  validateExternalHumanReferenceReviewAttestationAuthorityFRData15();
  return fail(
    'FR-DATA-15 records exact-package-bound external-review declarations and artifact digests only. It does not authenticate reviewer identity or credentials, cryptographically verify a signature, establish signer-key trust, validate evidence-bundle contents, complete external construct/reference-standard review authority, authorize provider metrics, or promote capture quality, anatomy, traditional semantics, or production geometry.',
  );
}
