import { createHash } from 'node:crypto';
import {
  CENTRAL_CHIN_PAIRED_DATASET_AUTHORITY_FR57,
  verifyFrozenCentralChinPairedDatasetLedgerFR57,
  type CentralChinPairedDatasetPartitionFR57V1,
  type FrozenCentralChinPairedDatasetLedgerFR57V1,
} from './central-chin-paired-dataset-ledger-fr57.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface CentralChinPairAcquisitionEventFR58V1 {
  readonly pairRef: string;
  readonly pairedRecordDigest: string;
  readonly partition: CentralChinPairedDatasetPartitionFR57V1;
  readonly canonicalAssetDigest: string;
  readonly acquisitionEventRef: string;
  readonly acquisitionEvidenceDigest: string;
  readonly acquiredAt: string;
}

export interface CentralChinPairedAcquisitionProvenanceManifestFR58V1 {
  readonly schemaVersion: 'fr58-central-chin-paired-acquisition-provenance-manifest-v1';
  readonly provenanceRef: string;
  readonly acquisitionProcedureRef: string;
  readonly governanceAuthorityRef: string;
  readonly ledger: FrozenCentralChinPairedDatasetLedgerFR57V1;
  readonly pairEvents: readonly CentralChinPairAcquisitionEventFR58V1[];
  readonly partitionAssignmentFrozenAt: string;
  readonly fr55OutcomeFirstInspectedAt: string | null;
  readonly partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: true;
  readonly datasetMembershipFrozenBeforeFR55OutcomeInspectionAttested: true;
  readonly fr55OutcomeVisibleBeforePartitionAndMembershipFreeze: false;
  readonly acquisitionEvidenceBundleDigest: string;
  readonly acquisitionStatementArtifactDigest: string;
  readonly partitionFreezeStatementArtifactDigest: string;
  readonly datasetFreezeStatementArtifactDigest: string;
  readonly detachedSignatureArtifactDigest: string;
  readonly signerKeyRef: string;
}

export interface FrozenCentralChinPairAcquisitionEventFR58V1 extends CentralChinPairAcquisitionEventFR58V1 {}

export interface FrozenCentralChinPairedAcquisitionProvenanceFR58V1 {
  readonly schemaVersion: 'fr58-central-chin-paired-acquisition-provenance-v1';
  readonly algorithmRef: 'algorithm.research.chin_inferior.central_chin_paired_acquisition_provenance_freeze.fr58@0.1.0';
  readonly provenanceRef: string;
  readonly acquisitionProcedureRef: string;
  readonly governanceAuthorityRef: string;
  readonly ledger: FrozenCentralChinPairedDatasetLedgerFR57V1;
  readonly datasetRef: string;
  readonly datasetDigest: string;
  readonly pairEvents: readonly FrozenCentralChinPairAcquisitionEventFR58V1[];
  readonly pairEventCount: number;
  readonly partitionAssignmentFrozenAt: string;
  readonly datasetFrozenAt: string;
  readonly fr55OutcomeFirstInspectedAt: string | null;
  readonly partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: true;
  readonly datasetMembershipFrozenBeforeFR55OutcomeInspectionAttested: true;
  readonly fr55OutcomeVisibleBeforePartitionAndMembershipFreeze: false;
  readonly acquisitionEvidenceBundleDigest: string;
  readonly acquisitionStatementArtifactDigest: string;
  readonly partitionFreezeStatementArtifactDigest: string;
  readonly datasetFreezeStatementArtifactDigest: string;
  readonly detachedSignatureArtifactDigest: string;
  readonly signerKeyRef: string;
  readonly exactFR57LedgerBindingVerified: true;
  readonly exactPairCoverageVerified: true;
  readonly exactPairIdentityBindingVerified: true;
  readonly acquisitionChronologyConsistencyVerified: true;
  readonly outcomeBlindFreezeAttestationsRecorded: true;
  readonly provenanceCanonicalizationAlgorithm: 'sort_pair_events_by_paired_record_digest_then_partition_then_pair_ref_json_v1';
  readonly provenanceDigestAlgorithm: 'sha256';
  readonly provenanceDigestScope: 'exact_fr57_dataset_pair_acquisition_and_freeze_attestation_metadata_excluding_fr55_outcomes';
  readonly provenanceDigest: string;
  readonly provenanceDigestIncludesFR55Outcome: false;
  readonly inputPairEventOrderDefinesProvenanceIdentity: false;
  readonly provenanceProofState: 'externally_declared_artifacts_recorded_not_authenticated';
  readonly externalGovernanceIdentityVerified: false;
  readonly acquisitionEvidenceBundleContentExternallyVerified: false;
  readonly cryptographicSignatureVerified: false;
  readonly signerKeyTrustEstablished: false;
  readonly provenanceTimestampExternallyVerified: false;
  readonly externalAcquisitionProvenanceAuthenticated: false;
  readonly realDatasetEstablished: false;
  readonly empiricalValidationAuthorized: false;
  readonly membershipThresholdAuthorized: false;
  readonly endpointSelectionAuthorized: false;
  readonly providerMappingAuthorized: false;
  readonly traditionalDigeEquivalenceAuthorized: false;
  readonly productionGeometryAuthorized: false;
}

export interface CentralChinPairedAcquisitionProvenanceAuthorityFR58V1 {
  readonly schemaVersion: 'fr58-v1';
  readonly authorityRef: 'authority.face.central_chin_paired_acquisition_provenance.fr58';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'paired_acquisition_provenance_contract_defined_exact_fr57_binding_outcome_blind_freeze_attested_no_authenticated_external_provenance';
  readonly upstreamFR57Ref: string;
  readonly protocol: {
    readonly protocolRef: 'protocol.face.chin_inferior.central_chin_paired_acquisition_provenance.fr58@0.1.0';
    readonly exactFrozenFR57LedgerVerificationRequired: true;
    readonly oneAcquisitionEventPerFR57PairRequired: true;
    readonly exactPairIdentityBindingRequired: true;
    readonly canonicalTimestampFormat: 'iso_8601_utc_millisecond';
    readonly chronologyRule: 'fr56_paired_at_lte_acquired_at_lte_partition_frozen_at_lte_dataset_frozen_at_lte_optional_first_fr55_outcome_inspection_at';
    readonly partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttestationRequired: true;
    readonly datasetMembershipFrozenBeforeFR55OutcomeInspectionAttestationRequired: true;
    readonly fr55OutcomeVisibleBeforePartitionAndMembershipFreezeRequired: false;
    readonly acquisitionEvidenceBundleDigestRequired: true;
    readonly acquisitionStatementArtifactDigestRequired: true;
    readonly partitionFreezeStatementArtifactDigestRequired: true;
    readonly datasetFreezeStatementArtifactDigestRequired: true;
    readonly detachedSignatureArtifactDigestRequired: true;
    readonly signerKeyRefRequired: true;
    readonly externalGovernanceIdentityVerifiedByThisSlice: false;
    readonly acquisitionEvidenceBundleContentVerifiedByThisSlice: false;
    readonly cryptographicSignatureVerifiedByThisSlice: false;
    readonly signerKeyTrustEstablishedByThisSlice: false;
    readonly pinnedExternalTrustRootDefinedByThisSlice: false;
    readonly provenanceTimestampExternallyVerifiedByThisSlice: false;
    readonly provenanceCanonicalizationAlgorithm: 'sort_pair_events_by_paired_record_digest_then_partition_then_pair_ref_json_v1';
    readonly provenanceDigestAlgorithm: 'sha256';
    readonly provenanceDigestScope: 'exact_fr57_dataset_pair_acquisition_and_freeze_attestation_metadata_excluding_fr55_outcomes';
    readonly provenanceDigestIncludesFR55Outcome: false;
    readonly partitionAllocationRule: null;
    readonly calibrationFraction: null;
    readonly minimumPairs: null;
    readonly minimumSubjects: null;
    readonly membershipThreshold: null;
    readonly anchorAgreementTolerance: null;
    readonly endpointSelectionRule: null;
    readonly empiricalAcceptanceCriterion: null;
  };
  readonly authorityBoundary: {
    readonly recordedAcquisitionEventMeansRealCaptureExternallyVerified: false;
    readonly recordedEvidenceBundleMeansEvidenceContentsExternallyVerified: false;
    readonly recordedGovernanceAuthorityRefMeansVerifiedGovernanceIdentity: false;
    readonly recordedSignatureArtifactMeansCryptographicallyVerifiedSignature: false;
    readonly recordedSignerKeyRefMeansTrustedSignerKey: false;
    readonly timestampOrderMeansCryptographicChronologyProof: false;
    readonly freezeAttestationMeansExternallyVerifiedOutcomeBlindness: false;
    readonly exactFR57BindingMeansRealDatasetEstablished: false;
    readonly exactFR57BindingMeansEmpiricalValidity: false;
    readonly provenanceDigestMeansEmpiricalValidity: false;
    readonly provenanceDigestMeansReviewedReferenceStandard: false;
    readonly calibrationPartitionMeansThresholdAuthority: false;
    readonly holdoutPartitionMeansValidationPassed: false;
    readonly providerMappingAuthorized: false;
    readonly traditionalDigeEquivalenceAuthorized: false;
    readonly empiricalValidationAuthorized: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
    readonly productionGeometryAuthorized: false;
  };
}

export interface CentralChinPairedAcquisitionProvenanceReadinessFR58V1 {
  readonly acquisitionProvenanceProtocolReady: true;
  readonly exactFR57LedgerBindingGuardReady: true;
  readonly exactPairCoverageGuardReady: true;
  readonly acquisitionChronologyGuardReady: true;
  readonly outcomeBlindFreezeAttestationGuardReady: true;
  readonly provenanceManifestPresent: boolean;
  readonly pairCoveragePresent: boolean;
  readonly outcomeBlindFreezeAttested: boolean;
  readonly externalAcquisitionProvenanceAuthenticated: false;
  readonly realPairedEvidenceDatasetEstablished: false;
  readonly empiricalValidationReady: false;
  readonly membershipThresholdReady: false;
  readonly endpointSelectionReady: false;
  readonly providerMappingReady: false;
  readonly productionGeometryReady: false;
  readonly blockers: readonly string[];
}

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const FR57_REF = `${CENTRAL_CHIN_PAIRED_DATASET_AUTHORITY_FR57.authorityRef}@${CENTRAL_CHIN_PAIRED_DATASET_AUTHORITY_FR57.authorityVersion}`;

export const CENTRAL_CHIN_PAIRED_ACQUISITION_PROVENANCE_AUTHORITY_FR58: CentralChinPairedAcquisitionProvenanceAuthorityFR58V1 = Object.freeze({
  schemaVersion: 'fr58-v1',
  authorityRef: 'authority.face.central_chin_paired_acquisition_provenance.fr58',
  authorityVersion: '0.1.0',
  authorityState: 'paired_acquisition_provenance_contract_defined_exact_fr57_binding_outcome_blind_freeze_attested_no_authenticated_external_provenance',
  upstreamFR57Ref: FR57_REF,
  protocol: Object.freeze({
    protocolRef: 'protocol.face.chin_inferior.central_chin_paired_acquisition_provenance.fr58@0.1.0',
    exactFrozenFR57LedgerVerificationRequired: true,
    oneAcquisitionEventPerFR57PairRequired: true,
    exactPairIdentityBindingRequired: true,
    canonicalTimestampFormat: 'iso_8601_utc_millisecond',
    chronologyRule: 'fr56_paired_at_lte_acquired_at_lte_partition_frozen_at_lte_dataset_frozen_at_lte_optional_first_fr55_outcome_inspection_at',
    partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttestationRequired: true,
    datasetMembershipFrozenBeforeFR55OutcomeInspectionAttestationRequired: true,
    fr55OutcomeVisibleBeforePartitionAndMembershipFreezeRequired: false,
    acquisitionEvidenceBundleDigestRequired: true,
    acquisitionStatementArtifactDigestRequired: true,
    partitionFreezeStatementArtifactDigestRequired: true,
    datasetFreezeStatementArtifactDigestRequired: true,
    detachedSignatureArtifactDigestRequired: true,
    signerKeyRefRequired: true,
    externalGovernanceIdentityVerifiedByThisSlice: false,
    acquisitionEvidenceBundleContentVerifiedByThisSlice: false,
    cryptographicSignatureVerifiedByThisSlice: false,
    signerKeyTrustEstablishedByThisSlice: false,
    pinnedExternalTrustRootDefinedByThisSlice: false,
    provenanceTimestampExternallyVerifiedByThisSlice: false,
    provenanceCanonicalizationAlgorithm: 'sort_pair_events_by_paired_record_digest_then_partition_then_pair_ref_json_v1',
    provenanceDigestAlgorithm: 'sha256',
    provenanceDigestScope: 'exact_fr57_dataset_pair_acquisition_and_freeze_attestation_metadata_excluding_fr55_outcomes',
    provenanceDigestIncludesFR55Outcome: false,
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
    recordedAcquisitionEventMeansRealCaptureExternallyVerified: false,
    recordedEvidenceBundleMeansEvidenceContentsExternallyVerified: false,
    recordedGovernanceAuthorityRefMeansVerifiedGovernanceIdentity: false,
    recordedSignatureArtifactMeansCryptographicallyVerifiedSignature: false,
    recordedSignerKeyRefMeansTrustedSignerKey: false,
    timestampOrderMeansCryptographicChronologyProof: false,
    freezeAttestationMeansExternallyVerifiedOutcomeBlindness: false,
    exactFR57BindingMeansRealDatasetEstablished: false,
    exactFR57BindingMeansEmpiricalValidity: false,
    provenanceDigestMeansEmpiricalValidity: false,
    provenanceDigestMeansReviewedReferenceStandard: false,
    calibrationPartitionMeansThresholdAuthority: false,
    holdoutPartitionMeansValidationPassed: false,
    providerMappingAuthorized: false,
    traditionalDigeEquivalenceAuthorized: false,
    empiricalValidationAuthorized: false,
    productionThreeDivisionsMetricAllowed: false,
    productionF1Allowed: false,
    productionF6Allowed: false,
    productionGeometryAuthorized: false,
  }),
});

function fail(message: string): never {
  throw new FaceAuthorityValidationError(`FR-58 ${message}`);
}

function nonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be non-empty.`);
  return value;
}

function canonicalSha256(value: string, label: string): string {
  if (!SHA256.test(value)) fail(`${label} must use canonical lowercase sha256:<64-hex> form.`);
  return value;
}

function canonicalTimestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    fail(`${label} must use canonical ISO-8601 UTC millisecond form.`);
  }
  return parsed;
}

function lexicalCompare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
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

function comparePairEventIdentity(left: CentralChinPairAcquisitionEventFR58V1, right: CentralChinPairAcquisitionEventFR58V1): number {
  const digestOrder = lexicalCompare(left.pairedRecordDigest, right.pairedRecordDigest);
  if (digestOrder !== 0) return digestOrder;
  const partitionOrder = lexicalCompare(left.partition, right.partition);
  if (partitionOrder !== 0) return partitionOrder;
  return lexicalCompare(left.pairRef, right.pairRef);
}

function normalizedPairEvents(manifest: CentralChinPairedAcquisitionProvenanceManifestFR58V1): readonly CentralChinPairAcquisitionEventFR58V1[] {
  return Object.freeze([...manifest.pairEvents].sort(comparePairEventIdentity).map((event) => deepFreezeJson(event, 'pairEvent')));
}

function provenanceDigestContent(manifest: CentralChinPairedAcquisitionProvenanceManifestFR58V1): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schemaVersion: 'fr58-central-chin-paired-acquisition-provenance-digest-content-v1',
    provenanceRef: manifest.provenanceRef,
    acquisitionProcedureRef: manifest.acquisitionProcedureRef,
    governanceAuthorityRef: manifest.governanceAuthorityRef,
    datasetRef: manifest.ledger.datasetRef,
    datasetDigest: manifest.ledger.datasetDigest,
    pairEvents: normalizedPairEvents(manifest),
    partitionAssignmentFrozenAt: manifest.partitionAssignmentFrozenAt,
    datasetFrozenAt: manifest.ledger.datasetFrozenAt,
    fr55OutcomeFirstInspectedAt: manifest.fr55OutcomeFirstInspectedAt,
    partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: manifest.partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested,
    datasetMembershipFrozenBeforeFR55OutcomeInspectionAttested: manifest.datasetMembershipFrozenBeforeFR55OutcomeInspectionAttested,
    fr55OutcomeVisibleBeforePartitionAndMembershipFreeze: manifest.fr55OutcomeVisibleBeforePartitionAndMembershipFreeze,
    acquisitionEvidenceBundleDigest: manifest.acquisitionEvidenceBundleDigest,
    acquisitionStatementArtifactDigest: manifest.acquisitionStatementArtifactDigest,
    partitionFreezeStatementArtifactDigest: manifest.partitionFreezeStatementArtifactDigest,
    datasetFreezeStatementArtifactDigest: manifest.datasetFreezeStatementArtifactDigest,
    detachedSignatureArtifactDigest: manifest.detachedSignatureArtifactDigest,
    signerKeyRef: manifest.signerKeyRef,
  });
}

export function validateCentralChinPairedAcquisitionProvenanceAuthorityFR58(
  authority: CentralChinPairedAcquisitionProvenanceAuthorityFR58V1 = CENTRAL_CHIN_PAIRED_ACQUISITION_PROVENANCE_AUTHORITY_FR58,
): CentralChinPairedAcquisitionProvenanceAuthorityFR58V1 {
  if (
    CENTRAL_CHIN_PAIRED_DATASET_AUTHORITY_FR57.authorityState !== 'paired_dataset_partition_ledger_defined_subject_asset_leakage_blocked_outcome_blindness_attested' ||
    CENTRAL_CHIN_PAIRED_DATASET_AUTHORITY_FR57.protocol.datasetDigestIncludesFR55Outcome !== false
  ) fail('FR-57 upstream dataset identity boundary drift.');
  if (
    authority.schemaVersion !== 'fr58-v1' ||
    authority.authorityRef !== 'authority.face.central_chin_paired_acquisition_provenance.fr58' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'paired_acquisition_provenance_contract_defined_exact_fr57_binding_outcome_blind_freeze_attested_no_authenticated_external_provenance' ||
    authority.upstreamFR57Ref !== FR57_REF
  ) fail('authority identity drift.');
  if (
    !authority.protocol.exactFrozenFR57LedgerVerificationRequired ||
    !authority.protocol.oneAcquisitionEventPerFR57PairRequired ||
    !authority.protocol.exactPairIdentityBindingRequired ||
    !authority.protocol.partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttestationRequired ||
    !authority.protocol.datasetMembershipFrozenBeforeFR55OutcomeInspectionAttestationRequired ||
    authority.protocol.fr55OutcomeVisibleBeforePartitionAndMembershipFreezeRequired !== false ||
    !authority.protocol.acquisitionEvidenceBundleDigestRequired ||
    !authority.protocol.acquisitionStatementArtifactDigestRequired ||
    !authority.protocol.partitionFreezeStatementArtifactDigestRequired ||
    !authority.protocol.datasetFreezeStatementArtifactDigestRequired ||
    !authority.protocol.detachedSignatureArtifactDigestRequired ||
    !authority.protocol.signerKeyRefRequired ||
    authority.protocol.externalGovernanceIdentityVerifiedByThisSlice !== false ||
    authority.protocol.acquisitionEvidenceBundleContentVerifiedByThisSlice !== false ||
    authority.protocol.cryptographicSignatureVerifiedByThisSlice !== false ||
    authority.protocol.signerKeyTrustEstablishedByThisSlice !== false ||
    authority.protocol.pinnedExternalTrustRootDefinedByThisSlice !== false ||
    authority.protocol.provenanceTimestampExternallyVerifiedByThisSlice !== false ||
    authority.protocol.provenanceDigestIncludesFR55Outcome !== false
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
  if (!Object.values(authority.authorityBoundary).every((value) => value === false)) {
    fail('authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function validateCentralChinPairedAcquisitionProvenanceManifestFR58(
  manifest: CentralChinPairedAcquisitionProvenanceManifestFR58V1,
): CentralChinPairedAcquisitionProvenanceManifestFR58V1 {
  validateCentralChinPairedAcquisitionProvenanceAuthorityFR58();
  if (manifest.schemaVersion !== 'fr58-central-chin-paired-acquisition-provenance-manifest-v1') fail('provenance manifest schema drift.');
  nonEmpty(manifest.provenanceRef, 'provenanceRef');
  nonEmpty(manifest.acquisitionProcedureRef, 'acquisitionProcedureRef');
  nonEmpty(manifest.governanceAuthorityRef, 'governanceAuthorityRef');
  nonEmpty(manifest.signerKeyRef, 'signerKeyRef');
  canonicalSha256(manifest.acquisitionEvidenceBundleDigest, 'acquisitionEvidenceBundleDigest');
  canonicalSha256(manifest.acquisitionStatementArtifactDigest, 'acquisitionStatementArtifactDigest');
  canonicalSha256(manifest.partitionFreezeStatementArtifactDigest, 'partitionFreezeStatementArtifactDigest');
  canonicalSha256(manifest.datasetFreezeStatementArtifactDigest, 'datasetFreezeStatementArtifactDigest');
  canonicalSha256(manifest.detachedSignatureArtifactDigest, 'detachedSignatureArtifactDigest');

  verifyFrozenCentralChinPairedDatasetLedgerFR57(manifest.ledger);
  if (
    manifest.ledger.partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested !== true ||
    manifest.ledger.fr55OutcomeVisibleDuringPartitionAssignment !== false ||
    manifest.ledger.datasetFrozenAfterAllPairRecordsAttested !== true ||
    manifest.ledger.datasetDigestIncludesFR55Outcome !== false
  ) fail('FR-57 ledger must preserve outcome-blind partition and post-pair dataset freeze boundaries.');

  if (
    manifest.partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested !== true ||
    manifest.datasetMembershipFrozenBeforeFR55OutcomeInspectionAttested !== true ||
    manifest.fr55OutcomeVisibleBeforePartitionAndMembershipFreeze !== false
  ) fail('outcome-blind partition and dataset-membership freeze attestations are required.');

  const partitionFrozenMs = canonicalTimestamp(manifest.partitionAssignmentFrozenAt, 'partitionAssignmentFrozenAt');
  const datasetFrozenMs = canonicalTimestamp(manifest.ledger.datasetFrozenAt, 'ledger.datasetFrozenAt');
  if (partitionFrozenMs > datasetFrozenMs) fail('partition assignment freeze cannot occur after the FR-57 dataset freeze.');
  if (manifest.fr55OutcomeFirstInspectedAt !== null) {
    const firstInspectionMs = canonicalTimestamp(manifest.fr55OutcomeFirstInspectedAt, 'fr55OutcomeFirstInspectedAt');
    if (firstInspectionMs < datasetFrozenMs) fail('FR-55 outcome inspection cannot precede completed dataset membership freeze.');
  }

  if (manifest.pairEvents.length !== manifest.ledger.entries.length) {
    fail('requires exactly one acquisition event per FR-57 ledger pair.');
  }
  const pairRefs = new Set<string>();
  const recordDigests = new Set<string>();
  const acquisitionEventRefs = new Set<string>();
  for (const event of manifest.pairEvents) {
    nonEmpty(event.pairRef, 'pairEvent.pairRef');
    canonicalSha256(event.pairedRecordDigest, `pairEvent ${event.pairRef} pairedRecordDigest`);
    canonicalSha256(event.canonicalAssetDigest, `pairEvent ${event.pairRef} canonicalAssetDigest`);
    nonEmpty(event.acquisitionEventRef, `pairEvent ${event.pairRef} acquisitionEventRef`);
    canonicalSha256(event.acquisitionEvidenceDigest, `pairEvent ${event.pairRef} acquisitionEvidenceDigest`);
    const acquiredMs = canonicalTimestamp(event.acquiredAt, `pairEvent ${event.pairRef} acquiredAt`);
    if (pairRefs.has(event.pairRef)) fail(`pairRef ${event.pairRef} cannot appear more than once in acquisition provenance.`);
    if (recordDigests.has(event.pairedRecordDigest)) fail(`pairedRecordDigest ${event.pairedRecordDigest} cannot appear more than once in acquisition provenance.`);
    if (acquisitionEventRefs.has(event.acquisitionEventRef)) fail(`acquisitionEventRef ${event.acquisitionEventRef} must be unique.`);
    pairRefs.add(event.pairRef);
    recordDigests.add(event.pairedRecordDigest);
    acquisitionEventRefs.add(event.acquisitionEventRef);

    const ledgerEntry = manifest.ledger.entries.find((entry) => entry.pairRef === event.pairRef);
    if (!ledgerEntry) fail(`pair event ${event.pairRef} does not bind an FR-57 ledger pair.`);
    if (
      ledgerEntry.pairedRecordDigest !== event.pairedRecordDigest ||
      ledgerEntry.partition !== event.partition ||
      ledgerEntry.canonicalAssetDigest !== event.canonicalAssetDigest
    ) fail(`pair event ${event.pairRef} must exactly bind pairedRecordDigest, partition, and canonicalAssetDigest.`);
    const pairedMs = canonicalTimestamp(ledgerEntry.record.pairedAt, `ledger pair ${event.pairRef} pairedAt`);
    if (acquiredMs < pairedMs) fail(`pair event ${event.pairRef} cannot be acquired before its FR-56 pair freeze.`);
    if (acquiredMs > partitionFrozenMs) fail(`pair event ${event.pairRef} cannot be acquired after partition assignment freeze.`);
  }
  for (const entry of manifest.ledger.entries) {
    if (!pairRefs.has(entry.pairRef) || !recordDigests.has(entry.pairedRecordDigest)) {
      fail(`FR-57 ledger pair ${entry.pairRef} is missing exact acquisition provenance coverage.`);
    }
  }
  return manifest;
}

export function computeCentralChinPairedAcquisitionProvenanceDigestFR58(
  manifest: CentralChinPairedAcquisitionProvenanceManifestFR58V1,
): string {
  validateCentralChinPairedAcquisitionProvenanceManifestFR58(manifest);
  return `sha256:${createHash('sha256').update(canonicalJson(provenanceDigestContent(manifest), 'provenanceDigestContent'), 'utf8').digest('hex')}`;
}

export function freezeCentralChinPairedAcquisitionProvenanceFR58(
  manifest: CentralChinPairedAcquisitionProvenanceManifestFR58V1,
): FrozenCentralChinPairedAcquisitionProvenanceFR58V1 {
  validateCentralChinPairedAcquisitionProvenanceManifestFR58(manifest);
  const provenanceDigest = computeCentralChinPairedAcquisitionProvenanceDigestFR58(manifest);
  return deepFreezeJson({
    schemaVersion: 'fr58-central-chin-paired-acquisition-provenance-v1' as const,
    algorithmRef: 'algorithm.research.chin_inferior.central_chin_paired_acquisition_provenance_freeze.fr58@0.1.0' as const,
    provenanceRef: manifest.provenanceRef,
    acquisitionProcedureRef: manifest.acquisitionProcedureRef,
    governanceAuthorityRef: manifest.governanceAuthorityRef,
    ledger: manifest.ledger,
    datasetRef: manifest.ledger.datasetRef,
    datasetDigest: manifest.ledger.datasetDigest,
    pairEvents: normalizedPairEvents(manifest),
    pairEventCount: manifest.pairEvents.length,
    partitionAssignmentFrozenAt: manifest.partitionAssignmentFrozenAt,
    datasetFrozenAt: manifest.ledger.datasetFrozenAt,
    fr55OutcomeFirstInspectedAt: manifest.fr55OutcomeFirstInspectedAt,
    partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: true as const,
    datasetMembershipFrozenBeforeFR55OutcomeInspectionAttested: true as const,
    fr55OutcomeVisibleBeforePartitionAndMembershipFreeze: false as const,
    acquisitionEvidenceBundleDigest: manifest.acquisitionEvidenceBundleDigest,
    acquisitionStatementArtifactDigest: manifest.acquisitionStatementArtifactDigest,
    partitionFreezeStatementArtifactDigest: manifest.partitionFreezeStatementArtifactDigest,
    datasetFreezeStatementArtifactDigest: manifest.datasetFreezeStatementArtifactDigest,
    detachedSignatureArtifactDigest: manifest.detachedSignatureArtifactDigest,
    signerKeyRef: manifest.signerKeyRef,
    exactFR57LedgerBindingVerified: true as const,
    exactPairCoverageVerified: true as const,
    exactPairIdentityBindingVerified: true as const,
    acquisitionChronologyConsistencyVerified: true as const,
    outcomeBlindFreezeAttestationsRecorded: true as const,
    provenanceCanonicalizationAlgorithm: 'sort_pair_events_by_paired_record_digest_then_partition_then_pair_ref_json_v1' as const,
    provenanceDigestAlgorithm: 'sha256' as const,
    provenanceDigestScope: 'exact_fr57_dataset_pair_acquisition_and_freeze_attestation_metadata_excluding_fr55_outcomes' as const,
    provenanceDigest,
    provenanceDigestIncludesFR55Outcome: false as const,
    inputPairEventOrderDefinesProvenanceIdentity: false as const,
    provenanceProofState: 'externally_declared_artifacts_recorded_not_authenticated' as const,
    externalGovernanceIdentityVerified: false as const,
    acquisitionEvidenceBundleContentExternallyVerified: false as const,
    cryptographicSignatureVerified: false as const,
    signerKeyTrustEstablished: false as const,
    provenanceTimestampExternallyVerified: false as const,
    externalAcquisitionProvenanceAuthenticated: false as const,
    realDatasetEstablished: false as const,
    empiricalValidationAuthorized: false as const,
    membershipThresholdAuthorized: false as const,
    endpointSelectionAuthorized: false as const,
    providerMappingAuthorized: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    productionGeometryAuthorized: false as const,
  }, 'frozenFR58Provenance');
}

export function verifyFrozenCentralChinPairedAcquisitionProvenanceFR58(
  provenance: FrozenCentralChinPairedAcquisitionProvenanceFR58V1,
): FrozenCentralChinPairedAcquisitionProvenanceFR58V1 {
  validateCentralChinPairedAcquisitionProvenanceAuthorityFR58();
  if (
    provenance.schemaVersion !== 'fr58-central-chin-paired-acquisition-provenance-v1' ||
    provenance.algorithmRef !== 'algorithm.research.chin_inferior.central_chin_paired_acquisition_provenance_freeze.fr58@0.1.0'
  ) fail('frozen provenance identity drift.');
  const rebuilt = freezeCentralChinPairedAcquisitionProvenanceFR58({
    schemaVersion: 'fr58-central-chin-paired-acquisition-provenance-manifest-v1',
    provenanceRef: provenance.provenanceRef,
    acquisitionProcedureRef: provenance.acquisitionProcedureRef,
    governanceAuthorityRef: provenance.governanceAuthorityRef,
    ledger: provenance.ledger,
    pairEvents: provenance.pairEvents,
    partitionAssignmentFrozenAt: provenance.partitionAssignmentFrozenAt,
    fr55OutcomeFirstInspectedAt: provenance.fr55OutcomeFirstInspectedAt,
    partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: provenance.partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested,
    datasetMembershipFrozenBeforeFR55OutcomeInspectionAttested: provenance.datasetMembershipFrozenBeforeFR55OutcomeInspectionAttested,
    fr55OutcomeVisibleBeforePartitionAndMembershipFreeze: provenance.fr55OutcomeVisibleBeforePartitionAndMembershipFreeze,
    acquisitionEvidenceBundleDigest: provenance.acquisitionEvidenceBundleDigest,
    acquisitionStatementArtifactDigest: provenance.acquisitionStatementArtifactDigest,
    partitionFreezeStatementArtifactDigest: provenance.partitionFreezeStatementArtifactDigest,
    datasetFreezeStatementArtifactDigest: provenance.datasetFreezeStatementArtifactDigest,
    detachedSignatureArtifactDigest: provenance.detachedSignatureArtifactDigest,
    signerKeyRef: provenance.signerKeyRef,
  });
  if (canonicalJson(rebuilt, 'rebuiltFR58Provenance') !== canonicalJson(provenance, 'frozenFR58Provenance')) {
    fail('frozen provenance content or digest drift.');
  }
  return provenance;
}

export function assessCentralChinPairedAcquisitionProvenanceReadinessFR58(
  manifest: CentralChinPairedAcquisitionProvenanceManifestFR58V1 | null,
): CentralChinPairedAcquisitionProvenanceReadinessFR58V1 {
  validateCentralChinPairedAcquisitionProvenanceAuthorityFR58();
  if (manifest === null) {
    return Object.freeze({
      acquisitionProvenanceProtocolReady: true,
      exactFR57LedgerBindingGuardReady: true,
      exactPairCoverageGuardReady: true,
      acquisitionChronologyGuardReady: true,
      outcomeBlindFreezeAttestationGuardReady: true,
      provenanceManifestPresent: false,
      pairCoveragePresent: false,
      outcomeBlindFreezeAttested: false,
      externalAcquisitionProvenanceAuthenticated: false,
      realPairedEvidenceDatasetEstablished: false,
      empiricalValidationReady: false,
      membershipThresholdReady: false,
      endpointSelectionReady: false,
      providerMappingReady: false,
      productionGeometryReady: false,
      blockers: Object.freeze([
        'acquisition_provenance_manifest_missing',
        'pair_acquisition_coverage_missing',
        'outcome_blind_partition_and_membership_freeze_attestation_missing',
        'external_governance_identity_not_verified',
        'cryptographic_attestation_signature_not_verified',
        'provenance_timestamps_not_externally_verified',
        'real_paired_evidence_not_authenticated',
        'empirical_acceptance_rules_unreviewed',
      ]),
    });
  }
  validateCentralChinPairedAcquisitionProvenanceManifestFR58(manifest);
  return Object.freeze({
    acquisitionProvenanceProtocolReady: true,
    exactFR57LedgerBindingGuardReady: true,
    exactPairCoverageGuardReady: true,
    acquisitionChronologyGuardReady: true,
    outcomeBlindFreezeAttestationGuardReady: true,
    provenanceManifestPresent: true,
    pairCoveragePresent: manifest.pairEvents.length === manifest.ledger.entries.length,
    outcomeBlindFreezeAttested: true,
    externalAcquisitionProvenanceAuthenticated: false,
    realPairedEvidenceDatasetEstablished: false,
    empiricalValidationReady: false,
    membershipThresholdReady: false,
    endpointSelectionReady: false,
    providerMappingReady: false,
    productionGeometryReady: false,
    blockers: Object.freeze([
      'external_governance_identity_not_verified',
      'acquisition_evidence_bundle_content_not_externally_verified',
      'cryptographic_attestation_signature_not_verified',
      'signer_key_trust_not_established',
      'provenance_timestamps_not_externally_verified',
      'real_paired_evidence_not_authenticated',
      'empirical_acceptance_rules_unreviewed',
    ]),
  });
}

export function assertCentralChinPairedAcquisitionProvenanceReadyForProductionFR58(): never {
  validateCentralChinPairedAcquisitionProvenanceAuthorityFR58();
  throw new FaceAuthorityValidationError(
    'FR-58 records exact FR-57-bound acquisition/freeze provenance declarations only; external governance identity, artifact contents, signature/key trust, chronology authenticity, real dataset status, empirical thresholds, endpoint selection, provider mapping, traditional equivalence, and production geometry remain blocked.',
  );
}
