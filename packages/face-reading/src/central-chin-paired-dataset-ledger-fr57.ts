import { createHash } from 'node:crypto';
import {
  CENTRAL_CHIN_PAIRED_EVIDENCE_INTAKE_AUTHORITY_FR56,
  verifyFrozenCentralChinPairedEvidenceRecordFR56,
  type FrozenCentralChinPairedEvidenceRecordFR56V1,
} from './central-chin-paired-evidence-intake-fr56.js';
import { FaceAuthorityValidationError } from './validation.js';

export type CentralChinPairedDatasetPartitionFR57V1 = 'calibration' | 'holdout';

export interface CentralChinPairedDatasetEntryFR57V1 {
  readonly partition: CentralChinPairedDatasetPartitionFR57V1;
  readonly record: FrozenCentralChinPairedEvidenceRecordFR56V1;
}

export interface CentralChinPairedDatasetManifestFR57V1 {
  readonly schemaVersion: 'fr57-central-chin-paired-dataset-manifest-v1';
  readonly datasetRef: string;
  readonly entries: readonly CentralChinPairedDatasetEntryFR57V1[];
  readonly datasetFrozenAt: string;
  readonly partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: true;
  readonly fr55OutcomeVisibleDuringPartitionAssignment: false;
  readonly datasetFrozenAfterAllPairRecordsAttested: true;
}

export interface FrozenCentralChinPairedDatasetEntryFR57V1 {
  readonly partition: CentralChinPairedDatasetPartitionFR57V1;
  readonly pairRef: string;
  readonly pairedRecordDigest: string;
  readonly subjectId: string;
  readonly captureId: string;
  readonly canonicalAssetDigest: string;
  readonly record: FrozenCentralChinPairedEvidenceRecordFR56V1;
}

export interface FrozenCentralChinPairedDatasetLedgerFR57V1 {
  readonly schemaVersion: 'fr57-central-chin-paired-dataset-ledger-v1';
  readonly algorithmRef: 'algorithm.research.chin_inferior.central_chin_paired_dataset_freeze.fr57@0.1.0';
  readonly datasetRef: string;
  readonly datasetFrozenAt: string;
  readonly entries: readonly FrozenCentralChinPairedDatasetEntryFR57V1[];
  readonly pairCount: number;
  readonly subjectCount: number;
  readonly canonicalAssetCount: number;
  readonly calibrationPairCount: number;
  readonly holdoutPairCount: number;
  readonly calibrationSubjectCount: number;
  readonly holdoutSubjectCount: number;
  readonly pairDigestUniquenessVerified: true;
  readonly pairRefUniquenessVerified: true;
  readonly subjectPartitionIsolationVerified: true;
  readonly canonicalAssetPartitionIsolationVerified: true;
  readonly assetToSubjectCaptureIdentityConsistencyVerified: true;
  readonly subjectCaptureToCanonicalAssetConsistencyVerified: true;
  readonly partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: true;
  readonly fr55OutcomeVisibleDuringPartitionAssignment: false;
  readonly datasetFrozenAfterAllPairRecordsAttested: true;
  readonly partitionBlindnessProofState: 'attested_not_externally_verified';
  readonly datasetFreezeAfterAllPairRecordsPairedVerified: true;
  readonly datasetCanonicalizationAlgorithm: 'sort_ledger_entries_by_paired_record_digest_then_partition_json_v1';
  readonly datasetDigestAlgorithm: 'sha256';
  readonly datasetDigestScope: 'verified_fr56_record_identity_partition_and_dataset_freeze_metadata_excluding_fr55_outcomes';
  readonly datasetDigest: string;
  readonly datasetDigestIncludesFR55Outcome: false;
  readonly inputEntryOrderDefinesDatasetIdentity: false;
  readonly resultState: 'fr56_pair_dataset_ledger_frozen_subject_and_asset_partition_leakage_blocked_no_empirical_validation';
  readonly realDatasetEstablished: false;
  readonly empiricalValidationAuthorized: false;
  readonly membershipThresholdAuthorized: false;
  readonly endpointSelectionAuthorized: false;
  readonly providerMappingAuthorized: false;
  readonly traditionalDigeEquivalenceAuthorized: false;
  readonly productionGeometryAuthorized: false;
}

export interface CentralChinPairedDatasetAuthorityFR57V1 {
  readonly schemaVersion: 'fr57-v1';
  readonly authorityRef: 'authority.face.central_chin_paired_dataset_ledger.fr57';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'paired_dataset_partition_ledger_defined_subject_asset_leakage_blocked_outcome_blindness_attested';
  readonly upstreamFR56Ref: string;
  readonly protocol: {
    readonly protocolRef: 'protocol.face.chin_inferior.central_chin_paired_dataset_ledger.fr57@0.1.0';
    readonly requiredPartitionLabels: readonly ['calibration', 'holdout'];
    readonly subjectLevelPartitionIsolationRequired: true;
    readonly canonicalAssetPartitionIsolationRequired: true;
    readonly pairedRecordDigestUniqueRequired: true;
    readonly pairRefUniqueRequired: true;
    readonly canonicalAssetMayRepeatWithinSamePartition: true;
    readonly canonicalAssetMustMapToOneSubjectCaptureIdentity: true;
    readonly subjectCaptureMustMapToOneCanonicalAssetDigest: true;
    readonly partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttestationRequired: true;
    readonly fr55OutcomeVisibleDuringPartitionAssignmentRequired: false;
    readonly datasetFrozenAfterAllPairRecordsAttestationRequired: true;
    readonly datasetFreezeAfterAllPairRecordsPairedRequired: true;
    readonly canonicalTimestampFormat: 'iso_8601_utc_millisecond';
    readonly partitionBlindnessProofSource: 'manifest_attestation_not_externally_verified_event_history';
    readonly partitionAllocationRule: null;
    readonly calibrationFraction: null;
    readonly minimumPairs: null;
    readonly minimumSubjects: null;
    readonly membershipThreshold: null;
    readonly anchorAgreementTolerance: null;
    readonly endpointSelectionRule: null;
    readonly empiricalAcceptanceCriterion: null;
    readonly datasetCanonicalizationAlgorithm: 'sort_ledger_entries_by_paired_record_digest_then_partition_json_v1';
    readonly datasetDigestAlgorithm: 'sha256';
    readonly datasetDigestScope: 'verified_fr56_record_identity_partition_and_dataset_freeze_metadata_excluding_fr55_outcomes';
    readonly datasetDigestIncludesFR55Outcome: false;
  };
  readonly authorityBoundary: {
    readonly datasetContractMeansRealDatasetExists: false;
    readonly nonEmptyLedgerMeansRealDatasetEstablished: false;
    readonly partitionFreezeAttestationMeansExternallyVerifiedOutcomeBlindness: false;
    readonly datasetTimestampMeansCryptographicChronologyProof: false;
    readonly samePartitionAssetReuseMeansIndependentGroundTruth: false;
    readonly samePartitionAssetReuseMeansIndependentCapture: false;
    readonly samePartitionAssetReuseMeansIndependentSubject: false;
    readonly calibrationPartitionMeansThresholdAuthority: false;
    readonly holdoutPartitionMeansValidationPassed: false;
    readonly partitionMembershipMeansEmpiricalValidity: false;
    readonly datasetDigestMeansEmpiricalValidity: false;
    readonly datasetDigestMeansReviewedReferenceStandard: false;
    readonly fr55OutcomeMayDefinePartitionAssignment: false;
    readonly fr55RawJoinDistanceMeansTraceMembership: false;
    readonly fr55RawJoinZeroDistanceMeansFR35Endpoint: false;
    readonly providerMappingAuthorized: false;
    readonly traditionalDigeEquivalenceAuthorized: false;
    readonly empiricalValidationAuthorized: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
    readonly productionGeometryAuthorized: false;
  };
}

export interface CentralChinPairedDatasetReadinessFR57V1 {
  readonly datasetLedgerProtocolReady: true;
  readonly subjectPartitionLeakageGuardReady: true;
  readonly assetPartitionLeakageGuardReady: true;
  readonly assetIdentityConsistencyGuardReady: true;
  readonly deterministicDatasetDigestReady: true;
  readonly datasetLedgerPresent: boolean;
  readonly calibrationPartitionPresent: boolean;
  readonly holdoutPartitionPresent: boolean;
  readonly bothPartitionsPresent: boolean;
  readonly outcomeBlindPartitionFreezeAttested: boolean;
  readonly datasetFreezeAfterAllPairRecordsAttested: boolean;
  readonly externalOutcomeBlindnessAttestationPresent: false;
  readonly realPairedEvidenceDatasetEstablished: false;
  readonly empiricalValidationReady: false;
  readonly membershipThresholdReady: false;
  readonly endpointSelectionReady: false;
  readonly providerMappingReady: false;
  readonly productionGeometryReady: false;
  readonly blockers: readonly string[];
}

const FR56_REF = `${CENTRAL_CHIN_PAIRED_EVIDENCE_INTAKE_AUTHORITY_FR56.authorityRef}@${CENTRAL_CHIN_PAIRED_EVIDENCE_INTAKE_AUTHORITY_FR56.authorityVersion}`;

export const CENTRAL_CHIN_PAIRED_DATASET_AUTHORITY_FR57: CentralChinPairedDatasetAuthorityFR57V1 = Object.freeze({
  schemaVersion: 'fr57-v1',
  authorityRef: 'authority.face.central_chin_paired_dataset_ledger.fr57',
  authorityVersion: '0.1.0',
  authorityState: 'paired_dataset_partition_ledger_defined_subject_asset_leakage_blocked_outcome_blindness_attested',
  upstreamFR56Ref: FR56_REF,
  protocol: Object.freeze({
    protocolRef: 'protocol.face.chin_inferior.central_chin_paired_dataset_ledger.fr57@0.1.0',
    requiredPartitionLabels: Object.freeze(['calibration', 'holdout'] as const),
    subjectLevelPartitionIsolationRequired: true,
    canonicalAssetPartitionIsolationRequired: true,
    pairedRecordDigestUniqueRequired: true,
    pairRefUniqueRequired: true,
    canonicalAssetMayRepeatWithinSamePartition: true,
    canonicalAssetMustMapToOneSubjectCaptureIdentity: true,
    subjectCaptureMustMapToOneCanonicalAssetDigest: true,
    partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttestationRequired: true,
    fr55OutcomeVisibleDuringPartitionAssignmentRequired: false,
    datasetFrozenAfterAllPairRecordsAttestationRequired: true,
    datasetFreezeAfterAllPairRecordsPairedRequired: true,
    canonicalTimestampFormat: 'iso_8601_utc_millisecond',
    partitionBlindnessProofSource: 'manifest_attestation_not_externally_verified_event_history',
    partitionAllocationRule: null,
    calibrationFraction: null,
    minimumPairs: null,
    minimumSubjects: null,
    membershipThreshold: null,
    anchorAgreementTolerance: null,
    endpointSelectionRule: null,
    empiricalAcceptanceCriterion: null,
    datasetCanonicalizationAlgorithm: 'sort_ledger_entries_by_paired_record_digest_then_partition_json_v1',
    datasetDigestAlgorithm: 'sha256',
    datasetDigestScope: 'verified_fr56_record_identity_partition_and_dataset_freeze_metadata_excluding_fr55_outcomes',
    datasetDigestIncludesFR55Outcome: false,
  }),
  authorityBoundary: Object.freeze({
    datasetContractMeansRealDatasetExists: false,
    nonEmptyLedgerMeansRealDatasetEstablished: false,
    partitionFreezeAttestationMeansExternallyVerifiedOutcomeBlindness: false,
    datasetTimestampMeansCryptographicChronologyProof: false,
    samePartitionAssetReuseMeansIndependentGroundTruth: false,
    samePartitionAssetReuseMeansIndependentCapture: false,
    samePartitionAssetReuseMeansIndependentSubject: false,
    calibrationPartitionMeansThresholdAuthority: false,
    holdoutPartitionMeansValidationPassed: false,
    partitionMembershipMeansEmpiricalValidity: false,
    datasetDigestMeansEmpiricalValidity: false,
    datasetDigestMeansReviewedReferenceStandard: false,
    fr55OutcomeMayDefinePartitionAssignment: false,
    fr55RawJoinDistanceMeansTraceMembership: false,
    fr55RawJoinZeroDistanceMeansFR35Endpoint: false,
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
  throw new FaceAuthorityValidationError(`FR-57 ${message}`);
}

function nonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be non-empty.`);
  return value;
}

function canonicalTimestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    fail(`${label} must use canonical ISO-8601 UTC millisecond form.`);
  }
  return parsed;
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
    const keys = Object.keys(record).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
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

function compareEntryIdentity(
  left: Pick<FrozenCentralChinPairedDatasetEntryFR57V1, 'pairedRecordDigest' | 'partition'>,
  right: Pick<FrozenCentralChinPairedDatasetEntryFR57V1, 'pairedRecordDigest' | 'partition'>,
): number {
  if (left.pairedRecordDigest < right.pairedRecordDigest) return -1;
  if (left.pairedRecordDigest > right.pairedRecordDigest) return 1;
  return left.partition < right.partition ? -1 : left.partition > right.partition ? 1 : 0;
}

function normalizedDigestEntries(manifest: CentralChinPairedDatasetManifestFR57V1): readonly Readonly<Record<string, string>>[] {
  return Object.freeze(manifest.entries.map((entry) => Object.freeze({
    partition: entry.partition,
    pairRef: entry.record.pairRef,
    pairedRecordDigest: entry.record.pairedRecordDigest,
    subjectId: entry.record.subjectId,
    captureId: entry.record.captureId,
    canonicalAssetDigest: entry.record.canonicalAssetDigest,
  })).sort(compareEntryIdentity));
}

function datasetDigestContent(manifest: CentralChinPairedDatasetManifestFR57V1): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schemaVersion: 'fr57-central-chin-paired-dataset-digest-content-v1',
    datasetRef: manifest.datasetRef,
    datasetFrozenAt: manifest.datasetFrozenAt,
    partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: manifest.partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested,
    fr55OutcomeVisibleDuringPartitionAssignment: manifest.fr55OutcomeVisibleDuringPartitionAssignment,
    datasetFrozenAfterAllPairRecordsAttested: manifest.datasetFrozenAfterAllPairRecordsAttested,
    entries: normalizedDigestEntries(manifest),
  });
}

export function validateCentralChinPairedDatasetAuthorityFR57(
  authority: CentralChinPairedDatasetAuthorityFR57V1 = CENTRAL_CHIN_PAIRED_DATASET_AUTHORITY_FR57,
): CentralChinPairedDatasetAuthorityFR57V1 {
  if (
    CENTRAL_CHIN_PAIRED_EVIDENCE_INTAKE_AUTHORITY_FR56.authorityState !== 'paired_observation_intake_and_canonical_record_freeze_defined_no_empirical_validation' ||
    CENTRAL_CHIN_PAIRED_EVIDENCE_INTAKE_AUTHORITY_FR56.protocol.pairedRecordDigestIncludesDerivedJoin !== false
  ) fail('FR-56 upstream paired-source identity boundary drift.');
  if (
    authority.schemaVersion !== 'fr57-v1' ||
    authority.authorityRef !== 'authority.face.central_chin_paired_dataset_ledger.fr57' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'paired_dataset_partition_ledger_defined_subject_asset_leakage_blocked_outcome_blindness_attested' ||
    authority.upstreamFR56Ref !== FR56_REF
  ) fail('authority identity/upstream drift.');
  const protocol = authority.protocol;
  if (
    protocol.requiredPartitionLabels[0] !== 'calibration' ||
    protocol.requiredPartitionLabels[1] !== 'holdout' ||
    protocol.subjectLevelPartitionIsolationRequired !== true ||
    protocol.canonicalAssetPartitionIsolationRequired !== true ||
    protocol.pairedRecordDigestUniqueRequired !== true ||
    protocol.pairRefUniqueRequired !== true ||
    protocol.canonicalAssetMayRepeatWithinSamePartition !== true ||
    protocol.canonicalAssetMustMapToOneSubjectCaptureIdentity !== true ||
    protocol.subjectCaptureMustMapToOneCanonicalAssetDigest !== true ||
    protocol.partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttestationRequired !== true ||
    protocol.fr55OutcomeVisibleDuringPartitionAssignmentRequired !== false ||
    protocol.datasetFrozenAfterAllPairRecordsAttestationRequired !== true ||
    protocol.datasetFreezeAfterAllPairRecordsPairedRequired !== true ||
    protocol.canonicalTimestampFormat !== 'iso_8601_utc_millisecond' ||
    protocol.partitionBlindnessProofSource !== 'manifest_attestation_not_externally_verified_event_history' ||
    protocol.datasetCanonicalizationAlgorithm !== 'sort_ledger_entries_by_paired_record_digest_then_partition_json_v1' ||
    protocol.datasetDigestAlgorithm !== 'sha256' ||
    protocol.datasetDigestScope !== 'verified_fr56_record_identity_partition_and_dataset_freeze_metadata_excluding_fr55_outcomes' ||
    protocol.datasetDigestIncludesFR55Outcome !== false
  ) fail('paired dataset protocol drift.');
  for (const unresolved of [
    protocol.partitionAllocationRule,
    protocol.calibrationFraction,
    protocol.minimumPairs,
    protocol.minimumSubjects,
    protocol.membershipThreshold,
    protocol.anchorAgreementTolerance,
    protocol.endpointSelectionRule,
    protocol.empiricalAcceptanceCriterion,
  ]) {
    if (unresolved !== null) fail('allocation ratios, empirical counts, thresholds, tolerances, endpoint rules, and acceptance criteria must remain unresolved.');
  }
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    fail('authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function validateCentralChinPairedDatasetManifestFR57(
  manifest: CentralChinPairedDatasetManifestFR57V1,
): CentralChinPairedDatasetManifestFR57V1 {
  validateCentralChinPairedDatasetAuthorityFR57();
  if (manifest.schemaVersion !== 'fr57-central-chin-paired-dataset-manifest-v1') fail('dataset manifest schema drift.');
  nonEmpty(manifest.datasetRef, 'datasetRef');
  const frozenAt = canonicalTimestamp(manifest.datasetFrozenAt, 'datasetFrozenAt');
  if (
    manifest.partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested !== true ||
    manifest.fr55OutcomeVisibleDuringPartitionAssignment !== false
  ) fail('partition assignment must remain FR-55-outcome-blind by explicit attestation.');
  if (manifest.datasetFrozenAfterAllPairRecordsAttested !== true) {
    fail('dataset freeze after all pair records must be explicitly attested.');
  }

  const pairDigests = new Set<string>();
  const pairRefs = new Set<string>();
  const subjectPartitions = new Map<string, CentralChinPairedDatasetPartitionFR57V1>();
  const assetPartitions = new Map<string, CentralChinPairedDatasetPartitionFR57V1>();
  const assetIdentity = new Map<string, string>();
  const subjectCaptureAsset = new Map<string, string>();

  for (const entry of manifest.entries) {
    if (entry.partition !== 'calibration' && entry.partition !== 'holdout') fail('entry partition must be calibration or holdout.');
    const record = verifyFrozenCentralChinPairedEvidenceRecordFR56(entry.record);
    if (canonicalTimestamp(record.pairedAt, `pair ${record.pairRef} pairedAt`) > frozenAt) {
      fail(`datasetFrozenAt cannot precede paired record ${record.pairRef}.`);
    }
    if (pairDigests.has(record.pairedRecordDigest)) fail(`pairedRecordDigest ${record.pairedRecordDigest} cannot appear more than once.`);
    if (pairRefs.has(record.pairRef)) fail(`pairRef ${record.pairRef} cannot appear more than once.`);
    pairDigests.add(record.pairedRecordDigest);
    pairRefs.add(record.pairRef);

    const subjectPartition = subjectPartitions.get(record.subjectId);
    if (subjectPartition !== undefined && subjectPartition !== entry.partition) {
      fail(`subject ${record.subjectId} cannot cross calibration/holdout partitions.`);
    }
    subjectPartitions.set(record.subjectId, entry.partition);

    const assetPartition = assetPartitions.get(record.canonicalAssetDigest);
    if (assetPartition !== undefined && assetPartition !== entry.partition) {
      fail(`canonical asset ${record.canonicalAssetDigest} cannot cross calibration/holdout partitions.`);
    }
    assetPartitions.set(record.canonicalAssetDigest, entry.partition);

    const identity = JSON.stringify([record.subjectId, record.captureId]);
    const priorIdentity = assetIdentity.get(record.canonicalAssetDigest);
    if (priorIdentity !== undefined && priorIdentity !== identity) {
      fail(`canonical asset ${record.canonicalAssetDigest} cannot map to multiple subject/capture identities.`);
    }
    assetIdentity.set(record.canonicalAssetDigest, identity);

    const priorAsset = subjectCaptureAsset.get(identity);
    if (priorAsset !== undefined && priorAsset !== record.canonicalAssetDigest) {
      fail(`subject/capture identity ${identity} cannot map to multiple canonical assets.`);
    }
    subjectCaptureAsset.set(identity, record.canonicalAssetDigest);
  }
  return manifest;
}

export function computeCentralChinPairedDatasetDigestFR57(
  manifest: CentralChinPairedDatasetManifestFR57V1,
): string {
  validateCentralChinPairedDatasetManifestFR57(manifest);
  const serialized = canonicalJson(datasetDigestContent(manifest), 'datasetDigestContent');
  return `sha256:${createHash('sha256').update(serialized, 'utf8').digest('hex')}`;
}

export function freezeCentralChinPairedDatasetLedgerFR57(
  manifest: CentralChinPairedDatasetManifestFR57V1,
): FrozenCentralChinPairedDatasetLedgerFR57V1 {
  validateCentralChinPairedDatasetManifestFR57(manifest);
  const datasetDigest = computeCentralChinPairedDatasetDigestFR57(manifest);
  const entries = Object.freeze([...manifest.entries].sort((left, right) => compareEntryIdentity({
    pairedRecordDigest: left.record.pairedRecordDigest,
    partition: left.partition,
  }, {
    pairedRecordDigest: right.record.pairedRecordDigest,
    partition: right.partition,
  })).map((entry) => Object.freeze({
    partition: entry.partition,
    pairRef: entry.record.pairRef,
    pairedRecordDigest: entry.record.pairedRecordDigest,
    subjectId: entry.record.subjectId,
    captureId: entry.record.captureId,
    canonicalAssetDigest: entry.record.canonicalAssetDigest,
    record: deepFreezeJson(entry.record, `pairRecord.${entry.record.pairRef}`),
  })));
  const subjectPartitions = new Map<string, CentralChinPairedDatasetPartitionFR57V1>();
  entries.forEach((entry) => subjectPartitions.set(entry.subjectId, entry.partition));
  return Object.freeze({
    schemaVersion: 'fr57-central-chin-paired-dataset-ledger-v1',
    algorithmRef: 'algorithm.research.chin_inferior.central_chin_paired_dataset_freeze.fr57@0.1.0',
    datasetRef: manifest.datasetRef,
    datasetFrozenAt: manifest.datasetFrozenAt,
    entries,
    pairCount: entries.length,
    subjectCount: new Set(entries.map((entry) => entry.subjectId)).size,
    canonicalAssetCount: new Set(entries.map((entry) => entry.canonicalAssetDigest)).size,
    calibrationPairCount: entries.filter((entry) => entry.partition === 'calibration').length,
    holdoutPairCount: entries.filter((entry) => entry.partition === 'holdout').length,
    calibrationSubjectCount: [...subjectPartitions.values()].filter((partition) => partition === 'calibration').length,
    holdoutSubjectCount: [...subjectPartitions.values()].filter((partition) => partition === 'holdout').length,
    pairDigestUniquenessVerified: true,
    pairRefUniquenessVerified: true,
    subjectPartitionIsolationVerified: true,
    canonicalAssetPartitionIsolationVerified: true,
    assetToSubjectCaptureIdentityConsistencyVerified: true,
    subjectCaptureToCanonicalAssetConsistencyVerified: true,
    partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: true,
    fr55OutcomeVisibleDuringPartitionAssignment: false,
    datasetFrozenAfterAllPairRecordsAttested: true,
    partitionBlindnessProofState: 'attested_not_externally_verified',
    datasetFreezeAfterAllPairRecordsPairedVerified: true,
    datasetCanonicalizationAlgorithm: 'sort_ledger_entries_by_paired_record_digest_then_partition_json_v1',
    datasetDigestAlgorithm: 'sha256',
    datasetDigestScope: 'verified_fr56_record_identity_partition_and_dataset_freeze_metadata_excluding_fr55_outcomes',
    datasetDigest,
    datasetDigestIncludesFR55Outcome: false,
    inputEntryOrderDefinesDatasetIdentity: false,
    resultState: 'fr56_pair_dataset_ledger_frozen_subject_and_asset_partition_leakage_blocked_no_empirical_validation',
    realDatasetEstablished: false,
    empiricalValidationAuthorized: false,
    membershipThresholdAuthorized: false,
    endpointSelectionAuthorized: false,
    providerMappingAuthorized: false,
    traditionalDigeEquivalenceAuthorized: false,
    productionGeometryAuthorized: false,
  });
}

export function verifyFrozenCentralChinPairedDatasetLedgerFR57(
  ledger: FrozenCentralChinPairedDatasetLedgerFR57V1,
): FrozenCentralChinPairedDatasetLedgerFR57V1 {
  validateCentralChinPairedDatasetAuthorityFR57();
  if (
    ledger.schemaVersion !== 'fr57-central-chin-paired-dataset-ledger-v1' ||
    ledger.algorithmRef !== 'algorithm.research.chin_inferior.central_chin_paired_dataset_freeze.fr57@0.1.0' ||
    ledger.pairDigestUniquenessVerified !== true ||
    ledger.pairRefUniquenessVerified !== true ||
    ledger.subjectPartitionIsolationVerified !== true ||
    ledger.canonicalAssetPartitionIsolationVerified !== true ||
    ledger.assetToSubjectCaptureIdentityConsistencyVerified !== true ||
    ledger.subjectCaptureToCanonicalAssetConsistencyVerified !== true ||
    ledger.partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested !== true ||
    ledger.fr55OutcomeVisibleDuringPartitionAssignment !== false ||
    ledger.datasetFrozenAfterAllPairRecordsAttested !== true ||
    ledger.partitionBlindnessProofState !== 'attested_not_externally_verified' ||
    ledger.datasetFreezeAfterAllPairRecordsPairedVerified !== true ||
    ledger.datasetCanonicalizationAlgorithm !== 'sort_ledger_entries_by_paired_record_digest_then_partition_json_v1' ||
    ledger.datasetDigestAlgorithm !== 'sha256' ||
    ledger.datasetDigestScope !== 'verified_fr56_record_identity_partition_and_dataset_freeze_metadata_excluding_fr55_outcomes' ||
    ledger.datasetDigestIncludesFR55Outcome !== false ||
    ledger.inputEntryOrderDefinesDatasetIdentity !== false ||
    ledger.resultState !== 'fr56_pair_dataset_ledger_frozen_subject_and_asset_partition_leakage_blocked_no_empirical_validation'
  ) fail('frozen dataset ledger identity/state drift.');
  if (
    ledger.realDatasetEstablished !== false ||
    ledger.empiricalValidationAuthorized !== false ||
    ledger.membershipThresholdAuthorized !== false ||
    ledger.endpointSelectionAuthorized !== false ||
    ledger.providerMappingAuthorized !== false ||
    ledger.traditionalDigeEquivalenceAuthorized !== false ||
    ledger.productionGeometryAuthorized !== false
  ) fail('frozen dataset ledger authority boundary drift.');

  const canonicalEntries = [...ledger.entries].sort(compareEntryIdentity);
  if (canonicalEntries.some((entry, index) => entry.pairedRecordDigest !== ledger.entries[index]?.pairedRecordDigest || entry.partition !== ledger.entries[index]?.partition)) {
    fail('frozen dataset ledger entries are not in canonical order.');
  }
  for (const entry of ledger.entries) {
    if (
      entry.pairRef !== entry.record.pairRef ||
      entry.pairedRecordDigest !== entry.record.pairedRecordDigest ||
      entry.subjectId !== entry.record.subjectId ||
      entry.captureId !== entry.record.captureId ||
      entry.canonicalAssetDigest !== entry.record.canonicalAssetDigest
    ) fail(`ledger entry ${entry.pairRef} summary fields do not match its FR-56 source record.`);
  }

  const manifest: CentralChinPairedDatasetManifestFR57V1 = {
    schemaVersion: 'fr57-central-chin-paired-dataset-manifest-v1',
    datasetRef: ledger.datasetRef,
    entries: ledger.entries.map((entry) => ({ partition: entry.partition, record: entry.record })),
    datasetFrozenAt: ledger.datasetFrozenAt,
    partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: true,
    fr55OutcomeVisibleDuringPartitionAssignment: false,
    datasetFrozenAfterAllPairRecordsAttested: true,
  };
  validateCentralChinPairedDatasetManifestFR57(manifest);
  if (ledger.datasetDigest !== computeCentralChinPairedDatasetDigestFR57(manifest)) {
    fail('datasetDigest does not match frozen ledger content.');
  }
  if (
    ledger.pairCount !== ledger.entries.length ||
    ledger.subjectCount !== new Set(ledger.entries.map((entry) => entry.subjectId)).size ||
    ledger.canonicalAssetCount !== new Set(ledger.entries.map((entry) => entry.canonicalAssetDigest)).size ||
    ledger.calibrationPairCount !== ledger.entries.filter((entry) => entry.partition === 'calibration').length ||
    ledger.holdoutPairCount !== ledger.entries.filter((entry) => entry.partition === 'holdout').length
  ) fail('frozen dataset ledger descriptive counts drift.');
  const subjectPartitions = new Map<string, CentralChinPairedDatasetPartitionFR57V1>();
  ledger.entries.forEach((entry) => subjectPartitions.set(entry.subjectId, entry.partition));
  if (
    ledger.calibrationSubjectCount !== [...subjectPartitions.values()].filter((partition) => partition === 'calibration').length ||
    ledger.holdoutSubjectCount !== [...subjectPartitions.values()].filter((partition) => partition === 'holdout').length
  ) fail('frozen dataset ledger subject partition counts drift.');
  return ledger;
}

export function assessCentralChinPairedDatasetReadinessFR57(
  manifest: CentralChinPairedDatasetManifestFR57V1 | null,
): CentralChinPairedDatasetReadinessFR57V1 {
  validateCentralChinPairedDatasetAuthorityFR57();
  if (manifest === null) {
    return Object.freeze({
      datasetLedgerProtocolReady: true,
      subjectPartitionLeakageGuardReady: true,
      assetPartitionLeakageGuardReady: true,
      assetIdentityConsistencyGuardReady: true,
      deterministicDatasetDigestReady: true,
      datasetLedgerPresent: false,
      calibrationPartitionPresent: false,
      holdoutPartitionPresent: false,
      bothPartitionsPresent: false,
      outcomeBlindPartitionFreezeAttested: false,
      datasetFreezeAfterAllPairRecordsAttested: false,
      externalOutcomeBlindnessAttestationPresent: false,
      realPairedEvidenceDatasetEstablished: false,
      empiricalValidationReady: false,
      membershipThresholdReady: false,
      endpointSelectionReady: false,
      providerMappingReady: false,
      productionGeometryReady: false,
      blockers: Object.freeze([
        'paired_dataset_ledger_missing',
        'calibration_partition_missing',
        'holdout_partition_missing',
        'outcome_blind_partition_freeze_attestation_missing',
        'dataset_freeze_after_all_pair_records_attestation_missing',
        'real_paired_evidence_not_established',
        'empirical_acceptance_rules_unreviewed',
      ]),
    });
  }
  validateCentralChinPairedDatasetManifestFR57(manifest);
  const datasetLedgerPresent = manifest.entries.length > 0;
  const calibrationPartitionPresent = manifest.entries.some((entry) => entry.partition === 'calibration');
  const holdoutPartitionPresent = manifest.entries.some((entry) => entry.partition === 'holdout');
  return Object.freeze({
    datasetLedgerProtocolReady: true,
    subjectPartitionLeakageGuardReady: true,
    assetPartitionLeakageGuardReady: true,
    assetIdentityConsistencyGuardReady: true,
    deterministicDatasetDigestReady: true,
    datasetLedgerPresent,
    calibrationPartitionPresent,
    holdoutPartitionPresent,
    bothPartitionsPresent: calibrationPartitionPresent && holdoutPartitionPresent,
    outcomeBlindPartitionFreezeAttested: true,
    datasetFreezeAfterAllPairRecordsAttested: true,
    externalOutcomeBlindnessAttestationPresent: false,
    realPairedEvidenceDatasetEstablished: false,
    empiricalValidationReady: false,
    membershipThresholdReady: false,
    endpointSelectionReady: false,
    providerMappingReady: false,
    productionGeometryReady: false,
    blockers: Object.freeze([
      ...(datasetLedgerPresent ? [] : ['paired_dataset_ledger_empty']),
      ...(calibrationPartitionPresent ? [] : ['calibration_partition_missing']),
      ...(holdoutPartitionPresent ? [] : ['holdout_partition_missing']),
      'outcome_blindness_only_attested_not_externally_verified',
      'dataset_freeze_chronology_only_structurally_verified_not_cryptographic',
      'real_paired_evidence_not_established',
      'empirical_acceptance_rules_unreviewed',
    ]),
  });
}

export function assertCentralChinPairedDatasetReadyForProductionFR57(): never {
  validateCentralChinPairedDatasetAuthorityFR57();
  throw new FaceAuthorityValidationError(
    'FR-57 freezes a leakage-guarded FR-56 paired-record partition ledger only; real dataset status, externally verified outcome blindness, empirical thresholds, endpoint selection, provider mapping, traditional equivalence, and production geometry remain blocked.',
  );
}
