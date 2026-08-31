import { createHash } from 'node:crypto';
import {
  CENTRAL_CHIN_EXTERNAL_PROVENANCE_VERIFICATION_AUTHORITY_FR59,
  verifyCentralChinExternalProvenanceArtifactsFR59,
  type CentralChinExternalProvenanceVerificationInputFR59V1,
} from './central-chin-external-provenance-verification-fr59.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface CentralChinExternalTrustEvidenceCandidateArtifactFR60V1 {
  readonly artifactRef: string;
  readonly evidenceKindRef: string;
  readonly declaredDigest: string;
  readonly bytes: Uint8Array;
  readonly claimedIssuerRef: string | null;
  readonly claimedSubjectRef: string | null;
}

export interface CentralChinExternalTrustEvidenceCandidateInputFR60V1 {
  readonly schemaVersion: 'fr60-central-chin-external-trust-evidence-candidate-input-v1';
  readonly fr59VerificationInput: CentralChinExternalProvenanceVerificationInputFR59V1;
  readonly evidenceBundleRef: string;
  readonly evidenceArtifacts: readonly CentralChinExternalTrustEvidenceCandidateArtifactFR60V1[];
  readonly frozenAt: string;
}

export interface FrozenCentralChinExternalTrustEvidenceCandidateArtifactFR60V1 {
  readonly artifactRef: string;
  readonly evidenceKindRef: string;
  readonly artifactDigest: string;
  readonly claimedIssuerRef: string | null;
  readonly claimedSubjectRef: string | null;
}

export interface FrozenCentralChinExternalTrustEvidenceCandidateBundleFR60V1 {
  readonly schemaVersion: 'fr60-central-chin-external-trust-evidence-candidate-bundle-v1';
  readonly algorithmRef: 'algorithm.research.chin_inferior.central_chin_external_trust_evidence_candidate_freeze.fr60@0.1.0';
  readonly evidenceBundleRef: string;
  readonly provenanceRef: string;
  readonly fr58ProvenanceDigest: string;
  readonly datasetRef: string;
  readonly datasetDigest: string;
  readonly signerKeyRef: string;
  readonly signerPublicKeySpkiDigest: string;
  readonly signaturePayloadDigest: string;
  readonly fr59AllRecordedArtifactByteIdentitiesVerified: true;
  readonly fr59CryptographicSignatureMathematicallyVerified: true;
  readonly evidenceArtifacts: readonly FrozenCentralChinExternalTrustEvidenceCandidateArtifactFR60V1[];
  readonly candidateEvidenceArtifactCount: number;
  readonly frozenAt: string;
  readonly candidateEvidenceBundleCanonicalizationAlgorithm: 'sort_candidate_artifacts_by_artifact_ref_json_v1';
  readonly candidateEvidenceBundleDigestAlgorithm: 'sha256';
  readonly candidateEvidenceBundleDigestScope: 'fr59_cryptographic_coordinates_and_exact_candidate_trust_evidence_byte_digests_with_claim_metadata';
  readonly candidateEvidenceBundleDigest: string;
  readonly candidateEvidenceBytesVerifiedAtIntake: true;
  readonly candidateEvidenceBundleFrozen: true;
  readonly frozenArtifactRetainsCandidateEvidenceBytes: false;
  readonly frozenArtifactRetainsSignerPublicKeyPem: false;
  readonly fr59MechanicalVerificationPerformedAtIntake: true;
  readonly fr59MechanicalVerificationReperformedByFrozenVerifier: false;
  readonly candidateMetadataClaimsExternallyAuthenticated: false;
  readonly signerKeyTrustEstablished: false;
  readonly pinnedExternalTrustRootAvailable: false;
  readonly externalGovernanceIdentityVerified: false;
  readonly reviewerCredentialVerified: false;
  readonly trustedTimestampAuthorityVerified: false;
  readonly artifactSemanticContentsExternallyVerified: false;
  readonly externalAcquisitionProvenanceAuthenticated: false;
  readonly realDatasetEstablished: false;
  readonly empiricalValidationAuthorized: false;
  readonly membershipThresholdAuthorized: false;
  readonly endpointSelectionAuthorized: false;
  readonly providerMappingAuthorized: false;
  readonly traditionalDigeEquivalenceAuthorized: false;
  readonly productionGeometryAuthorized: false;
}

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const FR59_REF = `${CENTRAL_CHIN_EXTERNAL_PROVENANCE_VERIFICATION_AUTHORITY_FR59.authorityRef}@${CENTRAL_CHIN_EXTERNAL_PROVENANCE_VERIFICATION_AUTHORITY_FR59.authorityVersion}`;
const INPUT_KEYS = Object.freeze(['schemaVersion', 'fr59VerificationInput', 'evidenceBundleRef', 'evidenceArtifacts', 'frozenAt']);
const ARTIFACT_KEYS = Object.freeze(['artifactRef', 'evidenceKindRef', 'declaredDigest', 'bytes', 'claimedIssuerRef', 'claimedSubjectRef']);
const FROZEN_ARTIFACT_KEYS = Object.freeze(['artifactRef', 'evidenceKindRef', 'artifactDigest', 'claimedIssuerRef', 'claimedSubjectRef']);

export const CENTRAL_CHIN_EXTERNAL_TRUST_EVIDENCE_INTAKE_AUTHORITY_FR60 = Object.freeze({
  schemaVersion: 'fr60-v1' as const,
  authorityRef: 'authority.face.central_chin_external_trust_evidence_intake.fr60' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'external_trust_evidence_candidate_intake_contract_defined_exact_bytes_frozen_no_external_trust_established' as const,
  upstreamFR59Ref: FR59_REF,
  protocol: Object.freeze({
    protocolRef: 'protocol.face.chin_inferior.central_chin_external_trust_evidence_intake.fr60@0.1.0' as const,
    exactFR59MechanicalVerificationRequiredAtIntake: true as const,
    exactFR59SignerKeyRefBindingRequired: true as const,
    exactFR59SignerPublicKeySpkiDigestBindingRequired: true as const,
    exactFR59SignaturePayloadDigestBindingRequired: true as const,
    exactFR58ProvenanceDigestBindingRequired: true as const,
    candidateEvidenceArtifactBytesRequiredAtIntake: true as const,
    candidateEvidenceDeclaredDigestExactMatchRequired: true as const,
    candidateEvidenceArtifactRefUniqueRequired: true as const,
    candidateEvidenceInputOrderDefinesBundleIdentity: false as const,
    candidateEvidenceBundleCanonicalizationAlgorithm: 'sort_candidate_artifacts_by_artifact_ref_json_v1' as const,
    candidateEvidenceBundleDigestAlgorithm: 'sha256' as const,
    candidateEvidenceBundleDigestScope: 'fr59_cryptographic_coordinates_and_exact_candidate_trust_evidence_byte_digests_with_claim_metadata' as const,
    frozenArtifactRetainsCandidateEvidenceBytes: false as const,
    frozenArtifactRetainsSignerPublicKeyPem: false as const,
    frozenVerifierReperformsFR59MechanicalVerification: false as const,
    candidateMetadataClaimsAuthenticatedByThisSlice: false as const,
    signerKeyTrustEstablishedByThisSlice: false as const,
    pinnedExternalTrustRootDefinedByThisSlice: false as const,
    externalGovernanceIdentityVerifiedByThisSlice: false as const,
    reviewerCredentialVerifiedByThisSlice: false as const,
    trustedTimestampAuthorityVerifiedByThisSlice: false as const,
    artifactSemanticContentExternallyVerifiedByThisSlice: false as const,
    minimumCandidateArtifactsForTrustSufficiency: null,
    requiredReviewerCredential: null,
    acceptedTrustRootType: null,
    trustedTimestampMechanism: null,
    externalTrustAcceptanceCriterion: null,
    partitionAllocationRule: null,
    calibrationFraction: null,
    minimumPairs: null,
    minimumSubjects: null,
    membershipThreshold: null,
    anchorAgreementTolerance: null,
    endpointSelectionRule: null,
    empiricalAcceptanceCriterion: null,
  }),
  authorityBoundary: Object.freeze({
    candidateEvidenceByteDigestMatchMeansClaimTrue: false as const,
    candidateEvidenceBundleFreezeMeansSignerKeyTrusted: false as const,
    trustRootCandidateArtifactMeansPinnedExternalTrustRoot: false as const,
    claimedIssuerRefMeansIssuerIdentityVerified: false as const,
    claimedSubjectRefMeansSubjectIdentityVerified: false as const,
    governanceEvidenceCandidateMeansGovernanceIdentityVerified: false as const,
    credentialEvidenceCandidateMeansReviewerCredentialVerified: false as const,
    timestampEvidenceCandidateMeansTrustedTimestampAuthorityVerified: false as const,
    fr59MathematicalSignatureMeansTrustedSigner: false as const,
    exactFR59BindingMeansExternalProvenanceAuthenticated: false as const,
    frozenTrustEvidenceCandidateBundleMeansRealDatasetEstablished: false as const,
    candidateEvidenceBundleDigestMeansEmpiricalValidity: false as const,
    candidateEvidenceBundleDigestMeansReviewedReferenceStandard: false as const,
    calibrationPartitionMeansThresholdAuthority: false as const,
    holdoutPartitionMeansValidationPassed: false as const,
    providerMappingAuthorized: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    empiricalValidationAuthorized: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
    productionGeometryAuthorized: false as const,
  }),
});

function fail(message: string): never {
  throw new FaceAuthorityValidationError(`FR-60 ${message}`);
}

function nonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be non-empty.`);
  return value;
}

function optionalNonEmpty(value: string | null, label: string): string | null {
  if (value === null) return null;
  return nonEmpty(value, label);
}

function canonicalSha256(value: string, label: string): string {
  if (!SHA256.test(value)) fail(`${label} must use canonical lowercase sha256:<64-hex> form.`);
  return value;
}

function canonicalTimestamp(value: string, label: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    fail(`${label} must use canonical ISO-8601 UTC millisecond form.`);
  }
  return value;
}

function lexicalCompare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function assertExactKeys(value: object, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(lexicalCompare);
  const canonicalExpected = [...expected].sort(lexicalCompare);
  if (actual.length !== canonicalExpected.length || actual.some((key, index) => key !== canonicalExpected[index])) {
    fail(`${label} must contain exactly the declared contract fields; undeclared trust/authority flags are forbidden.`);
  }
}

function canonicalJson(value: unknown, path: string): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`${path} contains a non-finite number.`);
    return JSON.stringify(value);
  }
  if (typeof value === 'object') {
    if (Array.isArray(value)) return `[${value.map((entry, index) => canonicalJson(entry, `${path}[${index}]`)).join(',')}]`;
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
  return fail(`${path} contains a non-JSON value.`);
}

function deepFreezeJson<T>(value: T, path: string): T {
  const cloned = JSON.parse(canonicalJson(value, path)) as T;
  const freeze = (entry: unknown): unknown => {
    if (entry === null || typeof entry !== 'object') return entry;
    if (Array.isArray(entry)) {
      entry.forEach(freeze);
      return Object.freeze(entry);
    }
    Object.values(entry as Record<string, unknown>).forEach(freeze);
    return Object.freeze(entry);
  };
  return freeze(cloned) as T;
}

function digestBytes(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function compareArtifacts(
  left: Pick<FrozenCentralChinExternalTrustEvidenceCandidateArtifactFR60V1, 'artifactRef'>,
  right: Pick<FrozenCentralChinExternalTrustEvidenceCandidateArtifactFR60V1, 'artifactRef'>,
): number {
  return lexicalCompare(left.artifactRef, right.artifactRef);
}

function digestMaterial(
  bundle: Omit<FrozenCentralChinExternalTrustEvidenceCandidateBundleFR60V1, 'candidateEvidenceBundleDigest'>,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schemaVersion: bundle.schemaVersion,
    algorithmRef: bundle.algorithmRef,
    evidenceBundleRef: bundle.evidenceBundleRef,
    provenanceRef: bundle.provenanceRef,
    fr58ProvenanceDigest: bundle.fr58ProvenanceDigest,
    datasetRef: bundle.datasetRef,
    datasetDigest: bundle.datasetDigest,
    signerKeyRef: bundle.signerKeyRef,
    signerPublicKeySpkiDigest: bundle.signerPublicKeySpkiDigest,
    signaturePayloadDigest: bundle.signaturePayloadDigest,
    fr59AllRecordedArtifactByteIdentitiesVerified: bundle.fr59AllRecordedArtifactByteIdentitiesVerified,
    fr59CryptographicSignatureMathematicallyVerified: bundle.fr59CryptographicSignatureMathematicallyVerified,
    evidenceArtifacts: bundle.evidenceArtifacts,
    candidateEvidenceArtifactCount: bundle.candidateEvidenceArtifactCount,
    frozenAt: bundle.frozenAt,
    candidateEvidenceBundleCanonicalizationAlgorithm: bundle.candidateEvidenceBundleCanonicalizationAlgorithm,
    candidateEvidenceBundleDigestAlgorithm: bundle.candidateEvidenceBundleDigestAlgorithm,
    candidateEvidenceBundleDigestScope: bundle.candidateEvidenceBundleDigestScope,
    candidateEvidenceBytesVerifiedAtIntake: bundle.candidateEvidenceBytesVerifiedAtIntake,
    candidateEvidenceBundleFrozen: bundle.candidateEvidenceBundleFrozen,
    frozenArtifactRetainsCandidateEvidenceBytes: bundle.frozenArtifactRetainsCandidateEvidenceBytes,
    frozenArtifactRetainsSignerPublicKeyPem: bundle.frozenArtifactRetainsSignerPublicKeyPem,
    fr59MechanicalVerificationPerformedAtIntake: bundle.fr59MechanicalVerificationPerformedAtIntake,
    fr59MechanicalVerificationReperformedByFrozenVerifier: bundle.fr59MechanicalVerificationReperformedByFrozenVerifier,
    candidateMetadataClaimsExternallyAuthenticated: bundle.candidateMetadataClaimsExternallyAuthenticated,
    signerKeyTrustEstablished: bundle.signerKeyTrustEstablished,
    pinnedExternalTrustRootAvailable: bundle.pinnedExternalTrustRootAvailable,
    externalGovernanceIdentityVerified: bundle.externalGovernanceIdentityVerified,
    reviewerCredentialVerified: bundle.reviewerCredentialVerified,
    trustedTimestampAuthorityVerified: bundle.trustedTimestampAuthorityVerified,
    artifactSemanticContentsExternallyVerified: bundle.artifactSemanticContentsExternallyVerified,
    externalAcquisitionProvenanceAuthenticated: bundle.externalAcquisitionProvenanceAuthenticated,
    realDatasetEstablished: bundle.realDatasetEstablished,
    empiricalValidationAuthorized: bundle.empiricalValidationAuthorized,
    membershipThresholdAuthorized: bundle.membershipThresholdAuthorized,
    endpointSelectionAuthorized: bundle.endpointSelectionAuthorized,
    providerMappingAuthorized: bundle.providerMappingAuthorized,
    traditionalDigeEquivalenceAuthorized: bundle.traditionalDigeEquivalenceAuthorized,
    productionGeometryAuthorized: bundle.productionGeometryAuthorized,
  });
}

function computeBundleDigest(
  bundle: Omit<FrozenCentralChinExternalTrustEvidenceCandidateBundleFR60V1, 'candidateEvidenceBundleDigest'>,
): string {
  return digestBytes(Buffer.from(canonicalJson(digestMaterial(bundle), 'fr60CandidateTrustEvidenceBundle'), 'utf8'));
}

export function computeCentralChinExternalTrustEvidenceCandidateArtifactDigestFR60(bytes: Uint8Array): string {
  return digestBytes(bytes);
}

export function validateCentralChinExternalTrustEvidenceIntakeAuthorityFR60(
  authority = CENTRAL_CHIN_EXTERNAL_TRUST_EVIDENCE_INTAKE_AUTHORITY_FR60,
) {
  if (
    CENTRAL_CHIN_EXTERNAL_PROVENANCE_VERIFICATION_AUTHORITY_FR59.authorityState !==
      'external_provenance_byte_and_signature_verification_contract_defined_no_pinned_external_trust_root' ||
    CENTRAL_CHIN_EXTERNAL_PROVENANCE_VERIFICATION_AUTHORITY_FR59.protocol.productionSignatureAlgorithm !== null ||
    CENTRAL_CHIN_EXTERNAL_PROVENANCE_VERIFICATION_AUTHORITY_FR59.protocol.signerKeyTrustEstablishedByThisSlice !== false ||
    CENTRAL_CHIN_EXTERNAL_PROVENANCE_VERIFICATION_AUTHORITY_FR59.protocol.pinnedExternalTrustRootDefinedByThisSlice !== false
  ) fail('FR-59 upstream trust boundary drift.');
  if (
    authority.schemaVersion !== 'fr60-v1' ||
    authority.authorityRef !== 'authority.face.central_chin_external_trust_evidence_intake.fr60' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'external_trust_evidence_candidate_intake_contract_defined_exact_bytes_frozen_no_external_trust_established' ||
    authority.upstreamFR59Ref !== FR59_REF
  ) fail('authority identity drift.');
  if (
    !authority.protocol.exactFR59MechanicalVerificationRequiredAtIntake ||
    !authority.protocol.exactFR59SignerKeyRefBindingRequired ||
    !authority.protocol.exactFR59SignerPublicKeySpkiDigestBindingRequired ||
    !authority.protocol.exactFR59SignaturePayloadDigestBindingRequired ||
    !authority.protocol.exactFR58ProvenanceDigestBindingRequired ||
    !authority.protocol.candidateEvidenceArtifactBytesRequiredAtIntake ||
    !authority.protocol.candidateEvidenceDeclaredDigestExactMatchRequired ||
    !authority.protocol.candidateEvidenceArtifactRefUniqueRequired ||
    authority.protocol.candidateEvidenceInputOrderDefinesBundleIdentity !== false ||
    authority.protocol.frozenArtifactRetainsCandidateEvidenceBytes !== false ||
    authority.protocol.frozenArtifactRetainsSignerPublicKeyPem !== false ||
    authority.protocol.frozenVerifierReperformsFR59MechanicalVerification !== false ||
    authority.protocol.candidateMetadataClaimsAuthenticatedByThisSlice !== false ||
    authority.protocol.signerKeyTrustEstablishedByThisSlice !== false ||
    authority.protocol.pinnedExternalTrustRootDefinedByThisSlice !== false ||
    authority.protocol.externalGovernanceIdentityVerifiedByThisSlice !== false ||
    authority.protocol.reviewerCredentialVerifiedByThisSlice !== false ||
    authority.protocol.trustedTimestampAuthorityVerifiedByThisSlice !== false ||
    authority.protocol.artifactSemanticContentExternallyVerifiedByThisSlice !== false
  ) fail('protocol boundary drift.');
  for (const value of [
    authority.protocol.minimumCandidateArtifactsForTrustSufficiency,
    authority.protocol.requiredReviewerCredential,
    authority.protocol.acceptedTrustRootType,
    authority.protocol.trustedTimestampMechanism,
    authority.protocol.externalTrustAcceptanceCriterion,
    authority.protocol.partitionAllocationRule,
    authority.protocol.calibrationFraction,
    authority.protocol.minimumPairs,
    authority.protocol.minimumSubjects,
    authority.protocol.membershipThreshold,
    authority.protocol.anchorAgreementTolerance,
    authority.protocol.endpointSelectionRule,
    authority.protocol.empiricalAcceptanceCriterion,
  ]) {
    if (value !== null) fail('trust/empirical policy values must remain unresolved null values.');
  }
  if (!Object.values(authority.authorityBoundary).every((value) => value === false)) {
    fail('authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function freezeCentralChinExternalTrustEvidenceCandidateBundleFR60(
  input: CentralChinExternalTrustEvidenceCandidateInputFR60V1,
): FrozenCentralChinExternalTrustEvidenceCandidateBundleFR60V1 {
  validateCentralChinExternalTrustEvidenceIntakeAuthorityFR60();
  assertExactKeys(input as unknown as object, INPUT_KEYS, 'input');
  if (input.schemaVersion !== 'fr60-central-chin-external-trust-evidence-candidate-input-v1') fail('input schema drift.');

  const fr59 = verifyCentralChinExternalProvenanceArtifactsFR59(input.fr59VerificationInput);
  if (
    fr59.allRecordedArtifactByteIdentitiesVerified !== true ||
    fr59.cryptographicSignatureMathematicallyVerified !== true ||
    fr59.signerKeyTrustEstablished !== false ||
    fr59.externalGovernanceIdentityVerified !== false ||
    fr59.externalAcquisitionProvenanceAuthenticated !== false ||
    fr59.realDatasetEstablished !== false ||
    fr59.productionGeometryAuthorized !== false
  ) fail('FR-59 report boundary drift.');

  nonEmpty(input.evidenceBundleRef, 'evidenceBundleRef');
  canonicalTimestamp(input.frozenAt, 'frozenAt');
  if (!Array.isArray(input.evidenceArtifacts) || input.evidenceArtifacts.length === 0) {
    fail('evidenceArtifacts must contain at least one candidate artifact for an intake/freeze event; this is not a trust-sufficiency threshold.');
  }

  const seenRefs = new Set<string>();
  const normalizedArtifacts = input.evidenceArtifacts.map((artifact, index) => {
    assertExactKeys(artifact as unknown as object, ARTIFACT_KEYS, `evidenceArtifacts[${index}]`);
    nonEmpty(artifact.artifactRef, `evidenceArtifacts[${index}].artifactRef`);
    nonEmpty(artifact.evidenceKindRef, `evidenceArtifacts[${index}].evidenceKindRef`);
    canonicalSha256(artifact.declaredDigest, `evidenceArtifacts[${index}].declaredDigest`);
    optionalNonEmpty(artifact.claimedIssuerRef, `evidenceArtifacts[${index}].claimedIssuerRef`);
    optionalNonEmpty(artifact.claimedSubjectRef, `evidenceArtifacts[${index}].claimedSubjectRef`);
    if (!(artifact.bytes instanceof Uint8Array)) fail(`evidenceArtifacts[${index}].bytes must be Uint8Array.`);
    if (seenRefs.has(artifact.artifactRef)) fail(`candidate evidence artifactRef ${artifact.artifactRef} must be unique.`);
    seenRefs.add(artifact.artifactRef);
    const observedDigest = digestBytes(artifact.bytes);
    if (observedDigest !== artifact.declaredDigest) fail(`candidate evidence artifact ${artifact.artifactRef} byte digest mismatch.`);
    return deepFreezeJson<FrozenCentralChinExternalTrustEvidenceCandidateArtifactFR60V1>({
      artifactRef: artifact.artifactRef,
      evidenceKindRef: artifact.evidenceKindRef,
      artifactDigest: observedDigest,
      claimedIssuerRef: artifact.claimedIssuerRef,
      claimedSubjectRef: artifact.claimedSubjectRef,
    }, `evidenceArtifacts[${index}]`);
  }).sort(compareArtifacts);

  const withoutDigest: Omit<FrozenCentralChinExternalTrustEvidenceCandidateBundleFR60V1, 'candidateEvidenceBundleDigest'> = {
    schemaVersion: 'fr60-central-chin-external-trust-evidence-candidate-bundle-v1',
    algorithmRef: 'algorithm.research.chin_inferior.central_chin_external_trust_evidence_candidate_freeze.fr60@0.1.0',
    evidenceBundleRef: input.evidenceBundleRef,
    provenanceRef: fr59.provenanceRef,
    fr58ProvenanceDigest: fr59.fr58ProvenanceDigest,
    datasetRef: fr59.datasetRef,
    datasetDigest: fr59.datasetDigest,
    signerKeyRef: input.fr59VerificationInput.signerKeyRef,
    signerPublicKeySpkiDigest: fr59.signerPublicKeySpkiDigest,
    signaturePayloadDigest: fr59.signaturePayloadDigest,
    fr59AllRecordedArtifactByteIdentitiesVerified: true,
    fr59CryptographicSignatureMathematicallyVerified: true,
    evidenceArtifacts: Object.freeze(normalizedArtifacts),
    candidateEvidenceArtifactCount: normalizedArtifacts.length,
    frozenAt: input.frozenAt,
    candidateEvidenceBundleCanonicalizationAlgorithm: 'sort_candidate_artifacts_by_artifact_ref_json_v1',
    candidateEvidenceBundleDigestAlgorithm: 'sha256',
    candidateEvidenceBundleDigestScope: 'fr59_cryptographic_coordinates_and_exact_candidate_trust_evidence_byte_digests_with_claim_metadata',
    candidateEvidenceBytesVerifiedAtIntake: true,
    candidateEvidenceBundleFrozen: true,
    frozenArtifactRetainsCandidateEvidenceBytes: false,
    frozenArtifactRetainsSignerPublicKeyPem: false,
    fr59MechanicalVerificationPerformedAtIntake: true,
    fr59MechanicalVerificationReperformedByFrozenVerifier: false,
    candidateMetadataClaimsExternallyAuthenticated: false,
    signerKeyTrustEstablished: false,
    pinnedExternalTrustRootAvailable: false,
    externalGovernanceIdentityVerified: false,
    reviewerCredentialVerified: false,
    trustedTimestampAuthorityVerified: false,
    artifactSemanticContentsExternallyVerified: false,
    externalAcquisitionProvenanceAuthenticated: false,
    realDatasetEstablished: false,
    empiricalValidationAuthorized: false,
    membershipThresholdAuthorized: false,
    endpointSelectionAuthorized: false,
    providerMappingAuthorized: false,
    traditionalDigeEquivalenceAuthorized: false,
    productionGeometryAuthorized: false,
  };

  const frozen = Object.freeze({
    ...withoutDigest,
    candidateEvidenceBundleDigest: computeBundleDigest(withoutDigest),
  });
  return verifyFrozenCentralChinExternalTrustEvidenceCandidateBundleFR60(frozen);
}

export function verifyFrozenCentralChinExternalTrustEvidenceCandidateBundleFR60(
  bundle: FrozenCentralChinExternalTrustEvidenceCandidateBundleFR60V1,
): FrozenCentralChinExternalTrustEvidenceCandidateBundleFR60V1 {
  validateCentralChinExternalTrustEvidenceIntakeAuthorityFR60();
  if (
    bundle.schemaVersion !== 'fr60-central-chin-external-trust-evidence-candidate-bundle-v1' ||
    bundle.algorithmRef !== 'algorithm.research.chin_inferior.central_chin_external_trust_evidence_candidate_freeze.fr60@0.1.0'
  ) fail('frozen bundle identity drift.');
  nonEmpty(bundle.evidenceBundleRef, 'evidenceBundleRef');
  nonEmpty(bundle.provenanceRef, 'provenanceRef');
  canonicalSha256(bundle.fr58ProvenanceDigest, 'fr58ProvenanceDigest');
  nonEmpty(bundle.datasetRef, 'datasetRef');
  canonicalSha256(bundle.datasetDigest, 'datasetDigest');
  nonEmpty(bundle.signerKeyRef, 'signerKeyRef');
  canonicalSha256(bundle.signerPublicKeySpkiDigest, 'signerPublicKeySpkiDigest');
  canonicalSha256(bundle.signaturePayloadDigest, 'signaturePayloadDigest');
  canonicalTimestamp(bundle.frozenAt, 'frozenAt');
  canonicalSha256(bundle.candidateEvidenceBundleDigest, 'candidateEvidenceBundleDigest');

  const { candidateEvidenceBundleDigest: _ignoredDigest, ...withoutDigestForShape } = bundle;
  assertExactKeys(
    bundle as unknown as object,
    [...Object.keys(digestMaterial(withoutDigestForShape)), 'candidateEvidenceBundleDigest'],
    'frozen bundle',
  );

  if (!Array.isArray(bundle.evidenceArtifacts) || bundle.evidenceArtifacts.length === 0) fail('frozen evidenceArtifacts must be non-empty.');
  if (bundle.candidateEvidenceArtifactCount !== bundle.evidenceArtifacts.length) fail('candidateEvidenceArtifactCount mismatch.');
  const seenRefs = new Set<string>();
  for (let index = 0; index < bundle.evidenceArtifacts.length; index += 1) {
    const artifact = bundle.evidenceArtifacts[index];
    assertExactKeys(artifact as unknown as object, FROZEN_ARTIFACT_KEYS, `evidenceArtifacts[${index}]`);
    nonEmpty(artifact.artifactRef, `evidenceArtifacts[${index}].artifactRef`);
    nonEmpty(artifact.evidenceKindRef, `evidenceArtifacts[${index}].evidenceKindRef`);
    canonicalSha256(artifact.artifactDigest, `evidenceArtifacts[${index}].artifactDigest`);
    optionalNonEmpty(artifact.claimedIssuerRef, `evidenceArtifacts[${index}].claimedIssuerRef`);
    optionalNonEmpty(artifact.claimedSubjectRef, `evidenceArtifacts[${index}].claimedSubjectRef`);
    if (seenRefs.has(artifact.artifactRef)) fail(`frozen candidate evidence artifactRef ${artifact.artifactRef} must be unique.`);
    seenRefs.add(artifact.artifactRef);
    if (index > 0 && compareArtifacts(bundle.evidenceArtifacts[index - 1], artifact) >= 0) {
      fail('frozen evidenceArtifacts must remain in canonical artifactRef order.');
    }
  }

  if (
    bundle.fr59AllRecordedArtifactByteIdentitiesVerified !== true ||
    bundle.fr59CryptographicSignatureMathematicallyVerified !== true ||
    bundle.candidateEvidenceBytesVerifiedAtIntake !== true ||
    bundle.candidateEvidenceBundleFrozen !== true ||
    bundle.frozenArtifactRetainsCandidateEvidenceBytes !== false ||
    bundle.frozenArtifactRetainsSignerPublicKeyPem !== false ||
    bundle.fr59MechanicalVerificationPerformedAtIntake !== true ||
    bundle.fr59MechanicalVerificationReperformedByFrozenVerifier !== false ||
    bundle.candidateMetadataClaimsExternallyAuthenticated !== false ||
    bundle.signerKeyTrustEstablished !== false ||
    bundle.pinnedExternalTrustRootAvailable !== false ||
    bundle.externalGovernanceIdentityVerified !== false ||
    bundle.reviewerCredentialVerified !== false ||
    bundle.trustedTimestampAuthorityVerified !== false ||
    bundle.artifactSemanticContentsExternallyVerified !== false ||
    bundle.externalAcquisitionProvenanceAuthenticated !== false ||
    bundle.realDatasetEstablished !== false ||
    bundle.empiricalValidationAuthorized !== false ||
    bundle.membershipThresholdAuthorized !== false ||
    bundle.endpointSelectionAuthorized !== false ||
    bundle.providerMappingAuthorized !== false ||
    bundle.traditionalDigeEquivalenceAuthorized !== false ||
    bundle.productionGeometryAuthorized !== false
  ) fail('frozen bundle authority boundary drift.');

  if (
    bundle.candidateEvidenceBundleCanonicalizationAlgorithm !== 'sort_candidate_artifacts_by_artifact_ref_json_v1' ||
    bundle.candidateEvidenceBundleDigestAlgorithm !== 'sha256' ||
    bundle.candidateEvidenceBundleDigestScope !== 'fr59_cryptographic_coordinates_and_exact_candidate_trust_evidence_byte_digests_with_claim_metadata'
  ) fail('frozen bundle digest contract drift.');

  if (computeBundleDigest(withoutDigestForShape) !== bundle.candidateEvidenceBundleDigest) fail('candidateEvidenceBundleDigest mismatch.');
  return bundle;
}

export function assessCentralChinExternalTrustEvidenceReadinessFR60(
  bundle: FrozenCentralChinExternalTrustEvidenceCandidateBundleFR60V1 | null,
) {
  validateCentralChinExternalTrustEvidenceIntakeAuthorityFR60();
  const shared = {
    trustEvidenceCandidateIntakeProtocolReady: true as const,
    exactFR59MechanicalVerificationAtIntakeGuardReady: true as const,
    candidateEvidenceByteIdentityGuardReady: true as const,
    deterministicCandidateEvidenceFreezeGuardReady: true as const,
    externalTrustEstablished: false as const,
    externalAcquisitionProvenanceAuthenticated: false as const,
    realPairedEvidenceDatasetEstablished: false as const,
    empiricalValidationReady: false as const,
    membershipThresholdReady: false as const,
    endpointSelectionReady: false as const,
    providerMappingReady: false as const,
    productionGeometryReady: false as const,
  };
  if (bundle === null) {
    return Object.freeze({
      ...shared,
      candidateEvidenceBundlePresent: false,
      candidateEvidenceBytesVerifiedAtIntake: false,
      blockers: Object.freeze([
        'candidate_external_trust_evidence_bundle_missing',
        'signer_key_trust_not_established',
        'pinned_external_trust_root_missing',
        'external_governance_identity_not_verified',
        'reviewer_credentials_not_verified',
        'trusted_timestamp_authority_not_verified',
        'artifact_semantic_contents_not_externally_verified',
        'real_paired_evidence_not_authenticated',
        'empirical_acceptance_rules_unreviewed',
      ]),
    });
  }
  verifyFrozenCentralChinExternalTrustEvidenceCandidateBundleFR60(bundle);
  return Object.freeze({
    ...shared,
    candidateEvidenceBundlePresent: true,
    candidateEvidenceBytesVerifiedAtIntake: true,
    blockers: Object.freeze([
      'candidate_evidence_is_not_authenticated_trust',
      'signer_key_trust_not_established',
      'pinned_external_trust_root_missing',
      'external_governance_identity_not_verified',
      'reviewer_credentials_not_verified',
      'trusted_timestamp_authority_not_verified',
      'artifact_semantic_contents_not_externally_verified',
      'real_paired_evidence_not_authenticated',
      'empirical_acceptance_rules_unreviewed',
    ]),
  });
}

export function assertCentralChinExternalTrustEvidenceReadyForProductionFR60(): never {
  validateCentralChinExternalTrustEvidenceIntakeAuthorityFR60();
  throw new FaceAuthorityValidationError(
    'FR-60 verifies and freezes candidate external trust-evidence bytes bound to FR-59 cryptographic coordinates only; signer-key trust, pinned trust roots, governance/reviewer identity, credentials, trusted timestamps, semantic evidence truth, authenticated external provenance, real dataset status, empirical thresholds, endpoint selection, provider mapping, traditional equivalence, and production geometry remain blocked.',
  );
}
