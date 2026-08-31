import { createHash, createPublicKey, verify as verifySignature, type KeyObject } from 'node:crypto';
import {
  CENTRAL_CHIN_PAIRED_ACQUISITION_PROVENANCE_AUTHORITY_FR58,
  verifyFrozenCentralChinPairedAcquisitionProvenanceFR58,
  type FrozenCentralChinPairedAcquisitionProvenanceFR58V1,
} from './central-chin-paired-acquisition-provenance-fr58.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface CentralChinPairAcquisitionEvidenceArtifactFR59V1 {
  readonly acquisitionEventRef: string;
  readonly acquisitionEvidenceBytes: Uint8Array;
}

export interface CentralChinExternalProvenanceVerificationInputFR59V1 {
  readonly schemaVersion: 'fr59-central-chin-external-provenance-verification-input-v1';
  readonly provenance: FrozenCentralChinPairedAcquisitionProvenanceFR58V1;
  readonly pairAcquisitionEvidenceArtifacts: readonly CentralChinPairAcquisitionEvidenceArtifactFR59V1[];
  readonly acquisitionEvidenceBundleBytes: Uint8Array;
  readonly acquisitionStatementArtifactBytes: Uint8Array;
  readonly partitionFreezeStatementArtifactBytes: Uint8Array;
  readonly datasetFreezeStatementArtifactBytes: Uint8Array;
  readonly detachedSignatureBytes: Uint8Array;
  readonly signerKeyRef: string;
  readonly signerPublicKeyPem: string;
  readonly declaredSignerPublicKeySpkiDigest: string;
}

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const FR58_REF = `${CENTRAL_CHIN_PAIRED_ACQUISITION_PROVENANCE_AUTHORITY_FR58.authorityRef}@${CENTRAL_CHIN_PAIRED_ACQUISITION_PROVENANCE_AUTHORITY_FR58.authorityVersion}`;
const SIGNATURE_SCOPE = 'fr58_substantive_provenance_excluding_detached_signature_artifact_digest_and_fr58_provenance_digest' as const;

export const CENTRAL_CHIN_EXTERNAL_PROVENANCE_VERIFICATION_AUTHORITY_FR59 = Object.freeze({
  schemaVersion: 'fr59-v1' as const,
  authorityRef: 'authority.face.central_chin_external_provenance_verification.fr59' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'external_provenance_byte_and_signature_verification_contract_defined_no_pinned_external_trust_root' as const,
  upstreamFR58Ref: FR58_REF,
  protocol: Object.freeze({
    protocolRef: 'protocol.face.chin_inferior.central_chin_external_provenance_verification.fr59@0.1.0' as const,
    exactFrozenFR58ProvenanceVerificationRequired: true as const,
    exactPairAcquisitionEvidenceArtifactCoverageRequired: true as const,
    pairAcquisitionEvidenceByteDigestVerificationRequired: true as const,
    recordedArtifactByteDigestVerificationRequired: true as const,
    detachedSignatureArtifactByteDigestVerificationRequired: true as const,
    signerKeyRefExactMatchRequired: true as const,
    signerPublicKeySpkiDigestSelfConsistencyRequired: true as const,
    researchSignatureVerificationPrimitive: 'ed25519_node_crypto_v1' as const,
    productionSignatureAlgorithm: null,
    signaturePayloadCanonicalizationAlgorithm: 'sorted_object_keys_preserve_array_order_json_v1' as const,
    signaturePayloadDigestAlgorithm: 'sha256' as const,
    signaturePayloadScope: SIGNATURE_SCOPE,
    signaturePayloadIncludesFR55Outcome: false as const,
    signaturePayloadExcludesDetachedSignatureArtifactDigest: true as const,
    signaturePayloadExcludesFR58ProvenanceDigest: true as const,
    externalGovernanceIdentityVerifiedByThisSlice: false as const,
    artifactSemanticContentExternallyVerifiedByThisSlice: false as const,
    signerKeyTrustEstablishedByThisSlice: false as const,
    pinnedExternalTrustRootDefinedByThisSlice: false as const,
    provenanceTimestampExternallyVerifiedByThisSlice: false as const,
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
    artifactByteDigestMatchMeansSemanticContentVerified: false as const,
    artifactByteDigestMatchMeansExternalGovernanceIdentityVerified: false as const,
    mathematicalSignatureValidityMeansTrustedSignerIdentity: false as const,
    mathematicalSignatureValidityMeansGovernanceIdentityVerified: false as const,
    mathematicalSignatureValidityMeansExternalProvenanceAuthenticated: false as const,
    suppliedPublicKeyMeansPinnedTrustRoot: false as const,
    suppliedSignerKeyRefMeansTrustedKeyBinding: false as const,
    signedTimestampClaimMeansExternallyTimestamped: false as const,
    researchEd25519PrimitiveMeansProductionSignatureAlgorithmAuthorized: false as const,
    exactFR58VerificationMeansRealDatasetEstablished: false as const,
    byteAndSignatureVerificationMeansEmpiricalValidity: false as const,
    byteAndSignatureVerificationMeansReviewedReferenceStandard: false as const,
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
  throw new FaceAuthorityValidationError(`FR-59 ${message}`);
}

function nonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be non-empty.`);
}

function canonicalSha256(value: string, label: string): void {
  if (!SHA256.test(value)) fail(`${label} must use canonical lowercase sha256:<64-hex> form.`);
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
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => {
      const child = record[key];
      if (child === undefined) fail(`${path}.${key} cannot be undefined.`);
      return `${JSON.stringify(key)}:${canonicalJson(child, `${path}.${key}`)}`;
    }).join(',')}}`;
  }
  return fail(`${path} contains a non-JSON value.`);
}

function digestBytes(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function assertByteDigest(bytes: Uint8Array, expectedDigest: string, label: string): void {
  canonicalSha256(expectedDigest, label);
  if (digestBytes(bytes) !== expectedDigest) fail(`${label} byte digest mismatch.`);
}

function signaturePayload(provenance: FrozenCentralChinPairedAcquisitionProvenanceFR58V1): Readonly<Record<string, unknown>> {
  verifyFrozenCentralChinPairedAcquisitionProvenanceFR58(provenance);
  return Object.freeze({
    schemaVersion: 'fr59-central-chin-external-provenance-signature-payload-v1',
    fr58SchemaVersion: provenance.schemaVersion,
    fr58AlgorithmRef: provenance.algorithmRef,
    provenanceRef: provenance.provenanceRef,
    acquisitionProcedureRef: provenance.acquisitionProcedureRef,
    governanceAuthorityRef: provenance.governanceAuthorityRef,
    datasetRef: provenance.datasetRef,
    datasetDigest: provenance.datasetDigest,
    pairEvents: provenance.pairEvents,
    partitionAssignmentFrozenAt: provenance.partitionAssignmentFrozenAt,
    datasetFrozenAt: provenance.datasetFrozenAt,
    fr55OutcomeFirstInspectedAt: provenance.fr55OutcomeFirstInspectedAt,
    partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: provenance.partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested,
    datasetMembershipFrozenBeforeFR55OutcomeInspectionAttested: provenance.datasetMembershipFrozenBeforeFR55OutcomeInspectionAttested,
    fr55OutcomeVisibleBeforePartitionAndMembershipFreeze: provenance.fr55OutcomeVisibleBeforePartitionAndMembershipFreeze,
    acquisitionEvidenceBundleDigest: provenance.acquisitionEvidenceBundleDigest,
    acquisitionStatementArtifactDigest: provenance.acquisitionStatementArtifactDigest,
    partitionFreezeStatementArtifactDigest: provenance.partitionFreezeStatementArtifactDigest,
    datasetFreezeStatementArtifactDigest: provenance.datasetFreezeStatementArtifactDigest,
    signerKeyRef: provenance.signerKeyRef,
    researchSignatureVerificationPrimitive: 'ed25519_node_crypto_v1',
  });
}

export function buildCentralChinExternalProvenanceSignaturePayloadBytesFR59(
  provenance: FrozenCentralChinPairedAcquisitionProvenanceFR58V1,
): Uint8Array {
  validateCentralChinExternalProvenanceVerificationAuthorityFR59();
  return Buffer.from(canonicalJson(signaturePayload(provenance), 'fr59SignaturePayload'), 'utf8');
}

export function computeCentralChinExternalProvenanceSignaturePayloadDigestFR59(
  provenance: FrozenCentralChinPairedAcquisitionProvenanceFR58V1,
): string {
  return digestBytes(buildCentralChinExternalProvenanceSignaturePayloadBytesFR59(provenance));
}

export function computeCentralChinExternalProvenanceArtifactDigestFR59(bytes: Uint8Array): string {
  return digestBytes(bytes);
}

export function validateCentralChinExternalProvenanceVerificationAuthorityFR59(
  authority = CENTRAL_CHIN_EXTERNAL_PROVENANCE_VERIFICATION_AUTHORITY_FR59,
) {
  if (
    CENTRAL_CHIN_PAIRED_ACQUISITION_PROVENANCE_AUTHORITY_FR58.authorityState !== 'paired_acquisition_provenance_contract_defined_exact_fr57_binding_outcome_blind_freeze_attested_no_authenticated_external_provenance' ||
    CENTRAL_CHIN_PAIRED_ACQUISITION_PROVENANCE_AUTHORITY_FR58.protocol.provenanceDigestIncludesFR55Outcome !== false
  ) fail('FR-58 upstream provenance authority boundary drift.');
  if (
    authority.schemaVersion !== 'fr59-v1' ||
    authority.authorityRef !== 'authority.face.central_chin_external_provenance_verification.fr59' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'external_provenance_byte_and_signature_verification_contract_defined_no_pinned_external_trust_root' ||
    authority.upstreamFR58Ref !== FR58_REF
  ) fail('authority identity drift.');
  if (
    !authority.protocol.exactFrozenFR58ProvenanceVerificationRequired ||
    !authority.protocol.exactPairAcquisitionEvidenceArtifactCoverageRequired ||
    !authority.protocol.pairAcquisitionEvidenceByteDigestVerificationRequired ||
    !authority.protocol.recordedArtifactByteDigestVerificationRequired ||
    !authority.protocol.detachedSignatureArtifactByteDigestVerificationRequired ||
    !authority.protocol.signerKeyRefExactMatchRequired ||
    !authority.protocol.signerPublicKeySpkiDigestSelfConsistencyRequired ||
    authority.protocol.researchSignatureVerificationPrimitive !== 'ed25519_node_crypto_v1' ||
    authority.protocol.productionSignatureAlgorithm !== null ||
    authority.protocol.signaturePayloadIncludesFR55Outcome !== false ||
    authority.protocol.signaturePayloadExcludesDetachedSignatureArtifactDigest !== true ||
    authority.protocol.signaturePayloadExcludesFR58ProvenanceDigest !== true ||
    authority.protocol.externalGovernanceIdentityVerifiedByThisSlice !== false ||
    authority.protocol.artifactSemanticContentExternallyVerifiedByThisSlice !== false ||
    authority.protocol.signerKeyTrustEstablishedByThisSlice !== false ||
    authority.protocol.pinnedExternalTrustRootDefinedByThisSlice !== false ||
    authority.protocol.provenanceTimestampExternallyVerifiedByThisSlice !== false
  ) fail('protocol boundary drift.');
  for (const value of [
    authority.protocol.partitionAllocationRule,
    authority.protocol.calibrationFraction,
    authority.protocol.minimumPairs,
    authority.protocol.minimumSubjects,
    authority.protocol.membershipThreshold,
    authority.protocol.anchorAgreementTolerance,
    authority.protocol.endpointSelectionRule,
    authority.protocol.empiricalAcceptanceCriterion,
  ]) {
    if (value !== null) fail('empirical parameters must remain unresolved null values.');
  }
  if (!Object.values(authority.authorityBoundary).every((value) => value === false)) fail('authority boundary must remain fully fail-closed.');
  return authority;
}

export function verifyCentralChinExternalProvenanceArtifactsFR59(input: CentralChinExternalProvenanceVerificationInputFR59V1) {
  validateCentralChinExternalProvenanceVerificationAuthorityFR59();
  if (input.schemaVersion !== 'fr59-central-chin-external-provenance-verification-input-v1') fail('verification input schema drift.');
  const provenance = verifyFrozenCentralChinPairedAcquisitionProvenanceFR58(input.provenance);

  if (input.pairAcquisitionEvidenceArtifacts.length !== provenance.pairEvents.length) {
    fail('pair acquisition evidence artifacts must cover every FR-58 acquisition event exactly once.');
  }
  const pairArtifacts = new Map<string, CentralChinPairAcquisitionEvidenceArtifactFR59V1>();
  for (const artifact of input.pairAcquisitionEvidenceArtifacts) {
    nonEmpty(artifact.acquisitionEventRef, 'pairAcquisitionEvidenceArtifact.acquisitionEventRef');
    if (pairArtifacts.has(artifact.acquisitionEventRef)) fail(`pair acquisition evidence artifact ${artifact.acquisitionEventRef} must be unique.`);
    pairArtifacts.set(artifact.acquisitionEventRef, artifact);
  }
  for (const event of provenance.pairEvents) {
    const artifact = pairArtifacts.get(event.acquisitionEventRef);
    if (!artifact) fail(`missing pair acquisition evidence artifact for ${event.acquisitionEventRef}.`);
    assertByteDigest(artifact.acquisitionEvidenceBytes, event.acquisitionEvidenceDigest, `pair acquisition evidence ${event.acquisitionEventRef}`);
  }

  assertByteDigest(input.acquisitionEvidenceBundleBytes, provenance.acquisitionEvidenceBundleDigest, 'acquisitionEvidenceBundleDigest');
  assertByteDigest(input.acquisitionStatementArtifactBytes, provenance.acquisitionStatementArtifactDigest, 'acquisitionStatementArtifactDigest');
  assertByteDigest(input.partitionFreezeStatementArtifactBytes, provenance.partitionFreezeStatementArtifactDigest, 'partitionFreezeStatementArtifactDigest');
  assertByteDigest(input.datasetFreezeStatementArtifactBytes, provenance.datasetFreezeStatementArtifactDigest, 'datasetFreezeStatementArtifactDigest');
  assertByteDigest(input.detachedSignatureBytes, provenance.detachedSignatureArtifactDigest, 'detachedSignatureArtifactDigest');

  nonEmpty(input.signerKeyRef, 'signerKeyRef');
  if (input.signerKeyRef !== provenance.signerKeyRef) fail('signerKeyRef must exactly match the FR-58 recorded signerKeyRef.');
  canonicalSha256(input.declaredSignerPublicKeySpkiDigest, 'declaredSignerPublicKeySpkiDigest');
  nonEmpty(input.signerPublicKeyPem, 'signerPublicKeyPem');

  let publicKey: KeyObject;
  try {
    publicKey = createPublicKey(input.signerPublicKeyPem);
  } catch {
    return fail('signerPublicKeyPem must parse as a public key.');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') fail('research signature verification primitive requires an Ed25519 public key.');
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  if (typeof spki === 'string') fail('Ed25519 public key SPKI export must be binary DER.');
  const signerPublicKeySpkiDigest = digestBytes(spki);
  if (signerPublicKeySpkiDigest !== input.declaredSignerPublicKeySpkiDigest) {
    fail('declared signer public-key SPKI digest does not match supplied public-key bytes.');
  }

  const payloadBytes = buildCentralChinExternalProvenanceSignaturePayloadBytesFR59(provenance);
  if (!verifySignature(null, payloadBytes, publicKey, input.detachedSignatureBytes)) {
    fail('detached Ed25519 signature does not verify over the canonical FR-59 signature payload.');
  }

  return Object.freeze({
    schemaVersion: 'fr59-central-chin-external-provenance-verification-report-v1' as const,
    algorithmRef: 'algorithm.research.chin_inferior.central_chin_external_provenance_verification.fr59@0.1.0' as const,
    provenanceRef: provenance.provenanceRef,
    fr58ProvenanceDigest: provenance.provenanceDigest,
    datasetRef: provenance.datasetRef,
    datasetDigest: provenance.datasetDigest,
    exactFrozenFR58ProvenanceVerified: true as const,
    pairAcquisitionEvidenceArtifactCount: provenance.pairEvents.length,
    pairAcquisitionEvidenceByteIdentitiesVerified: true as const,
    acquisitionEvidenceBundleByteIdentityVerified: true as const,
    acquisitionStatementArtifactByteIdentityVerified: true as const,
    partitionFreezeStatementArtifactByteIdentityVerified: true as const,
    datasetFreezeStatementArtifactByteIdentityVerified: true as const,
    detachedSignatureArtifactByteIdentityVerified: true as const,
    allRecordedArtifactByteIdentitiesVerified: true as const,
    signerKeyRefExactMatchVerified: true as const,
    suppliedSignerPublicKeyTypeVerified: 'ed25519' as const,
    signerPublicKeySpkiDigest,
    declaredSignerPublicKeySpkiDigestExactMatchVerified: true as const,
    signaturePayloadCanonicalizationAlgorithm: 'sorted_object_keys_preserve_array_order_json_v1' as const,
    signaturePayloadDigestAlgorithm: 'sha256' as const,
    signaturePayloadScope: SIGNATURE_SCOPE,
    signaturePayloadDigest: digestBytes(payloadBytes),
    signaturePayloadIncludesFR55Outcome: false as const,
    signaturePayloadExcludesDetachedSignatureArtifactDigest: true as const,
    signaturePayloadExcludesFR58ProvenanceDigest: true as const,
    researchSignatureVerificationPrimitive: 'ed25519_node_crypto_v1' as const,
    cryptographicSignatureMathematicallyVerified: true as const,
    artifactByteIdentityMeansSemanticContentExternallyVerified: false as const,
    mathematicalSignatureValidityMeansTrustedSignerIdentity: false as const,
    mathematicalSignatureValidityMeansGovernanceIdentityVerified: false as const,
    suppliedPublicKeyMeansPinnedTrustRoot: false as const,
    researchEd25519PrimitiveMeansProductionSignatureAlgorithmAuthorized: false as const,
    externalGovernanceIdentityVerified: false as const,
    artifactSemanticContentsExternallyVerified: false as const,
    acquisitionEvidenceBundleSemanticContentExternallyVerified: false as const,
    signerKeyTrustEstablished: false as const,
    pinnedExternalTrustRootAvailable: false as const,
    provenanceTimestampExternallyVerified: false as const,
    externalAcquisitionProvenanceAuthenticated: false as const,
    realDatasetEstablished: false as const,
    empiricalValidationAuthorized: false as const,
    membershipThresholdAuthorized: false as const,
    endpointSelectionAuthorized: false as const,
    providerMappingAuthorized: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    productionGeometryAuthorized: false as const,
  });
}

export function assessCentralChinExternalProvenanceVerificationReadinessFR59(
  report: ReturnType<typeof verifyCentralChinExternalProvenanceArtifactsFR59> | null,
) {
  validateCentralChinExternalProvenanceVerificationAuthorityFR59();
  const shared = {
    byteAndSignatureVerificationProtocolReady: true as const,
    exactFR58VerificationGuardReady: true as const,
    artifactByteIdentityGuardReady: true as const,
    mathematicalSignatureVerificationGuardReady: true as const,
    externalAcquisitionProvenanceAuthenticated: false as const,
    realPairedEvidenceDatasetEstablished: false as const,
    empiricalValidationReady: false as const,
    membershipThresholdReady: false as const,
    endpointSelectionReady: false as const,
    providerMappingReady: false as const,
    productionGeometryReady: false as const,
  };
  if (report === null) {
    return Object.freeze({
      ...shared,
      verificationReportPresent: false,
      artifactByteIdentityVerified: false,
      mathematicalSignatureVerified: false,
      blockers: Object.freeze([
        'external_provenance_verification_report_missing',
        'recorded_artifact_byte_identity_not_verified',
        'detached_signature_math_not_verified',
        'external_governance_identity_not_verified',
        'signer_key_trust_not_established',
        'pinned_external_trust_root_missing',
        'provenance_timestamps_not_externally_verified',
        'artifact_semantic_contents_not_externally_verified',
        'real_paired_evidence_not_authenticated',
        'empirical_acceptance_rules_unreviewed',
      ]),
    });
  }
  if (
    report.exactFrozenFR58ProvenanceVerified !== true ||
    report.pairAcquisitionEvidenceByteIdentitiesVerified !== true ||
    report.allRecordedArtifactByteIdentitiesVerified !== true ||
    report.cryptographicSignatureMathematicallyVerified !== true ||
    report.externalAcquisitionProvenanceAuthenticated !== false ||
    report.realDatasetEstablished !== false ||
    report.productionGeometryAuthorized !== false
  ) fail('verification report boundary drift.');
  return Object.freeze({
    ...shared,
    verificationReportPresent: true,
    artifactByteIdentityVerified: true,
    mathematicalSignatureVerified: true,
    blockers: Object.freeze([
      'external_governance_identity_not_verified',
      'signer_key_trust_not_established',
      'pinned_external_trust_root_missing',
      'provenance_timestamps_not_externally_verified',
      'artifact_semantic_contents_not_externally_verified',
      'real_paired_evidence_not_authenticated',
      'empirical_acceptance_rules_unreviewed',
    ]),
  });
}

export function assertCentralChinExternalProvenanceReadyForProductionFR59(): never {
  validateCentralChinExternalProvenanceVerificationAuthorityFR59();
  throw new FaceAuthorityValidationError(
    'FR-59 verifies recorded artifact byte identity and detached Ed25519 signature mathematics only; trusted signer/governance identity, pinned external trust root, timestamp authenticity, semantic evidence contents, real dataset status, empirical thresholds, endpoint selection, provider mapping, traditional equivalence, and production geometry remain blocked.',
  );
}
