import { createHash } from 'node:crypto';
import {
  computeIndependentFaceSourceAssetDigestFRData07A,
  verifyFrozenIndependentFaceSourceAssetRecordFRData07A,
  type FrozenIndependentFaceSourceAssetRecordFRData07AV1,
} from './independent-face-source-asset-intake-frdata07a.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface IndependentFaceSourceAssetStorageReceiptInputFRData07BV1 {
  readonly schemaVersion: 'fr-data07b-independent-face-source-asset-storage-receipt-input-v1';
  readonly storageReceiptRef: string;
  readonly acquisitionRef: string;
  readonly captureRef: string;
  readonly sourceAssetRecordDigest: string;
  readonly canonicalAssetDigest: string;
  readonly byteLength: number;
  readonly storageProviderRef: string;
  readonly storageNamespaceRef: string;
  readonly storageObjectRef: string;
  readonly storageVersionRef: string | null;
  readonly retentionAttestation: 'bytes_declared_retained_in_controlled_research_storage';
  readonly storedAt: string;
}

export interface FrozenIndependentFaceSourceAssetStorageReceiptFRData07BV1 {
  readonly schemaVersion: 'fr-data07b-independent-face-source-asset-storage-receipt-v1';
  readonly storageReceiptRef: string;
  readonly acquisitionRef: string;
  readonly captureRef: string;
  readonly sourceAssetRecordDigest: string;
  readonly canonicalAssetDigest: string;
  readonly byteLength: number;
  readonly storageProviderRef: string;
  readonly storageNamespaceRef: string;
  readonly storageObjectRef: string;
  readonly storageVersionRef: string | null;
  readonly retentionAttestation: 'bytes_declared_retained_in_controlled_research_storage';
  readonly storedAt: string;
  readonly storageScope: 'research_evidence_only';
  readonly exactFRData07ARecordBindingVerified: true;
  readonly storageReceiptRecorded: true;
  readonly rawBytesEmbeddedInReceipt: false;
  readonly storedBytesRetrievalReverifiedByReceipt: false;
  readonly storageProviderIdentityExternallyAuthenticated: false;
  readonly storageBackendIntegrityIndependentlyAudited: false;
  readonly storageObjectImmutabilityExternallyVerified: false;
  readonly retentionDurationExternallyGuaranteed: false;
  readonly productionRuntimeImageRetentionAuthorized: false;
  readonly rightsLegallyAdjudicated: false;
  readonly privacySubjectRiskIndependentlyAdjudicated: false;
  readonly humanFaceCountLabelEstablished: false;
  readonly partitionAssignmentAuthorized: false;
  readonly empiricalAdmissionAuthorized: false;
  readonly providerScoringAuthorized: false;
  readonly productionGeometryAuthorized: false;
  readonly authorityState: 'controlled_research_storage_receipt_recorded_exact_frdata07a_binding_no_storage_backend_authentication';
  readonly receiptDigest: string;
}

export interface IndependentFaceSourceAssetStorageRetrievalInputFRData07BV1 {
  readonly schemaVersion: 'fr-data07b-independent-face-source-asset-storage-retrieval-input-v1';
  readonly retrievalVerificationRef: string;
  readonly storageReceiptRef: string;
  readonly sourceAssetRecordDigest: string;
  readonly retrievalMechanismRef: string;
  readonly retrievedAt: string;
  readonly retrievedBytes: Uint8Array;
}

export interface FrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07BV1 {
  readonly schemaVersion: 'fr-data07b-independent-face-source-asset-storage-retrieval-verification-v1';
  readonly retrievalVerificationRef: string;
  readonly storageReceiptRef: string;
  readonly acquisitionRef: string;
  readonly captureRef: string;
  readonly sourceAssetRecordDigest: string;
  readonly canonicalAssetDigest: string;
  readonly expectedByteLength: number;
  readonly retrievalMechanismRef: string;
  readonly retrievedAt: string;
  readonly retrievedByteDigest: string;
  readonly retrievedByteLength: number;
  readonly exactCanonicalDigestMatch: true;
  readonly exactByteLengthMatch: true;
  readonly retrievalCandidateBytesDigestReverified: true;
  readonly retrievedBytesEmbeddedInVerificationRecord: false;
  readonly providedRetrievalBytesProvenToOriginateFromDeclaredStorageObject: false;
  readonly storageProviderIdentityExternallyAuthenticated: false;
  readonly storageBackendIntegrityIndependentlyAudited: false;
  readonly storageObjectImmutabilityExternallyVerified: false;
  readonly sourceTransportAuthenticated: false;
  readonly rightsLegallyAdjudicated: false;
  readonly privacySubjectRiskIndependentlyAdjudicated: false;
  readonly humanFaceCountLabelEstablished: false;
  readonly partitionAssignmentAuthorized: false;
  readonly empiricalAdmissionAuthorized: false;
  readonly providerScoringAuthorized: false;
  readonly productionGeometryAuthorized: false;
  readonly authorityState: 'provided_retrieval_bytes_digest_reverified_against_frdata07a_no_declared_storage_origin_authentication';
  readonly verificationDigest: string;
}

export interface IndependentFaceSourceAssetStorageBindingReportFRData07BV1 {
  readonly schemaVersion: 'fr-data07b-independent-face-source-asset-storage-binding-report-v1';
  readonly sourceAssetRecordCount: number;
  readonly storageReceiptCount: number;
  readonly retrievalVerificationCount: number;
  readonly sourceAssetRecordCoverageComplete: true;
  readonly exactStorageReceiptBindingVerified: true;
  readonly exactRetrievalVerificationBindingVerified: true;
  readonly allProvidedRetrievalBytesMatchCanonicalDigests: true;
  readonly allProvidedRetrievalByteLengthsMatch: true;
  readonly declaredStorageOriginExternallyAuthenticated: false;
  readonly storageBackendIntegrityIndependentlyAudited: false;
  readonly storageObjectImmutabilityExternallyVerified: false;
  readonly productionRuntimeImageRetentionAuthorized: false;
  readonly empiricalAdmissionAuthorized: false;
  readonly providerScoringAuthorized: false;
  readonly productionGeometryAuthorized: false;
}

export interface IndependentFaceSourceAssetStorageAuthorityFRData07BV1 {
  readonly schemaVersion: 'fr-data07b-v1';
  readonly authorityRef: 'authority.face.independent_face_source_asset_storage.frdata07b';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'controlled_research_storage_receipt_and_retrieval_reverification_contract_defined_no_real_asset_admission';
  readonly upstreamSourceAssetSchemaRef: 'fr-data07a-independent-face-source-asset-record-v1';
  readonly protocol: {
    readonly exactFRData07ARecordVerificationRequired: true;
    readonly exactReceiptBindingToFRData07ARequired: true;
    readonly opaqueStorageCoordinatesRequired: true;
    readonly receiptRetainsRawBytes: false;
    readonly retrievalVerificationRequiresProvidedBytes: true;
    readonly retrievalDigestMustMatchFRData07ACanonicalDigest: true;
    readonly retrievalByteLengthMustMatchFRData07A: true;
    readonly retrievalTimestampMustNotPrecedeStorageTimestamp: true;
    readonly retrievalVerificationRetainsRawBytes: false;
    readonly productionRuntimeImageRetentionAuthorized: false;
    readonly storageBackendTrustPolicy: null;
    readonly minimumRetentionDuration: null;
    readonly encryptionAtRestRequirement: null;
    readonly storageImmutabilityRequirement: null;
    readonly acceptedStorageBackend: null;
    readonly empiricalAdmissionCriterion: null;
  };
  readonly authorityBoundary: {
    readonly storageReceiptMeansBytesExistInDeclaredBackend: false;
    readonly retentionAttestationMeansRetentionExternallyVerified: false;
    readonly storageProviderRefMeansProviderIdentityVerified: false;
    readonly storageObjectRefMeansObjectImmutable: false;
    readonly storageVersionRefMeansObjectImmutable: false;
    readonly providedRetrievalBytesProvenToOriginateFromDeclaredStorage: false;
    readonly retrievalDigestMatchMeansSourceTransportAuthenticated: false;
    readonly retrievalDigestMatchMeansSourceURLProvenanceAuthenticated: false;
    readonly storageReceiptMeansRightsLegallyAdjudicated: false;
    readonly storageReceiptMeansPrivacyClearance: false;
    readonly retrievalVerificationMeansHumanFaceCountLabelEstablished: false;
    readonly storageEvidenceMayAssignCalibrationOrHoldout: false;
    readonly storageEvidenceMayDefineProviderOutcome: false;
    readonly storageEvidenceMeansEmpiricalAdmissionAuthorized: false;
    readonly storageEvidenceMeansProviderScoringAuthorized: false;
    readonly storageEvidenceMeansProductionImageRetentionAuthorized: false;
    readonly storageEvidenceMeansProductionGeometryAuthorized: false;
  };
}

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const RECEIPT_INPUT_KEYS = Object.freeze([
  'schemaVersion', 'storageReceiptRef', 'acquisitionRef', 'captureRef', 'sourceAssetRecordDigest',
  'canonicalAssetDigest', 'byteLength', 'storageProviderRef', 'storageNamespaceRef', 'storageObjectRef',
  'storageVersionRef', 'retentionAttestation', 'storedAt',
] as const);
const RECEIPT_KEYS = Object.freeze([
  'schemaVersion', 'storageReceiptRef', 'acquisitionRef', 'captureRef', 'sourceAssetRecordDigest',
  'canonicalAssetDigest', 'byteLength', 'storageProviderRef', 'storageNamespaceRef', 'storageObjectRef',
  'storageVersionRef', 'retentionAttestation', 'storedAt', 'storageScope', 'exactFRData07ARecordBindingVerified',
  'storageReceiptRecorded', 'rawBytesEmbeddedInReceipt', 'storedBytesRetrievalReverifiedByReceipt',
  'storageProviderIdentityExternallyAuthenticated', 'storageBackendIntegrityIndependentlyAudited',
  'storageObjectImmutabilityExternallyVerified', 'retentionDurationExternallyGuaranteed',
  'productionRuntimeImageRetentionAuthorized', 'rightsLegallyAdjudicated',
  'privacySubjectRiskIndependentlyAdjudicated', 'humanFaceCountLabelEstablished', 'partitionAssignmentAuthorized',
  'empiricalAdmissionAuthorized', 'providerScoringAuthorized', 'productionGeometryAuthorized', 'authorityState',
  'receiptDigest',
] as const);
const RETRIEVAL_INPUT_KEYS = Object.freeze([
  'schemaVersion', 'retrievalVerificationRef', 'storageReceiptRef', 'sourceAssetRecordDigest',
  'retrievalMechanismRef', 'retrievedAt', 'retrievedBytes',
] as const);
const RETRIEVAL_KEYS = Object.freeze([
  'schemaVersion', 'retrievalVerificationRef', 'storageReceiptRef', 'acquisitionRef', 'captureRef',
  'sourceAssetRecordDigest', 'canonicalAssetDigest', 'expectedByteLength', 'retrievalMechanismRef', 'retrievedAt',
  'retrievedByteDigest', 'retrievedByteLength', 'exactCanonicalDigestMatch', 'exactByteLengthMatch',
  'retrievalCandidateBytesDigestReverified', 'retrievedBytesEmbeddedInVerificationRecord',
  'providedRetrievalBytesProvenToOriginateFromDeclaredStorageObject', 'storageProviderIdentityExternallyAuthenticated',
  'storageBackendIntegrityIndependentlyAudited', 'storageObjectImmutabilityExternallyVerified',
  'sourceTransportAuthenticated', 'rightsLegallyAdjudicated', 'privacySubjectRiskIndependentlyAdjudicated',
  'humanFaceCountLabelEstablished', 'partitionAssignmentAuthorized', 'empiricalAdmissionAuthorized',
  'providerScoringAuthorized', 'productionGeometryAuthorized', 'authorityState', 'verificationDigest',
] as const);

export const INDEPENDENT_FACE_SOURCE_ASSET_STORAGE_AUTHORITY_FRDATA07B:
IndependentFaceSourceAssetStorageAuthorityFRData07BV1 = Object.freeze({
  schemaVersion: 'fr-data07b-v1',
  authorityRef: 'authority.face.independent_face_source_asset_storage.frdata07b',
  authorityVersion: '0.1.0',
  authorityState: 'controlled_research_storage_receipt_and_retrieval_reverification_contract_defined_no_real_asset_admission',
  upstreamSourceAssetSchemaRef: 'fr-data07a-independent-face-source-asset-record-v1',
  protocol: Object.freeze({
    exactFRData07ARecordVerificationRequired: true,
    exactReceiptBindingToFRData07ARequired: true,
    opaqueStorageCoordinatesRequired: true,
    receiptRetainsRawBytes: false,
    retrievalVerificationRequiresProvidedBytes: true,
    retrievalDigestMustMatchFRData07ACanonicalDigest: true,
    retrievalByteLengthMustMatchFRData07A: true,
    retrievalTimestampMustNotPrecedeStorageTimestamp: true,
    retrievalVerificationRetainsRawBytes: false,
    productionRuntimeImageRetentionAuthorized: false,
    storageBackendTrustPolicy: null,
    minimumRetentionDuration: null,
    encryptionAtRestRequirement: null,
    storageImmutabilityRequirement: null,
    acceptedStorageBackend: null,
    empiricalAdmissionCriterion: null,
  }),
  authorityBoundary: Object.freeze({
    storageReceiptMeansBytesExistInDeclaredBackend: false,
    retentionAttestationMeansRetentionExternallyVerified: false,
    storageProviderRefMeansProviderIdentityVerified: false,
    storageObjectRefMeansObjectImmutable: false,
    storageVersionRefMeansObjectImmutable: false,
    providedRetrievalBytesProvenToOriginateFromDeclaredStorage: false,
    retrievalDigestMatchMeansSourceTransportAuthenticated: false,
    retrievalDigestMatchMeansSourceURLProvenanceAuthenticated: false,
    storageReceiptMeansRightsLegallyAdjudicated: false,
    storageReceiptMeansPrivacyClearance: false,
    retrievalVerificationMeansHumanFaceCountLabelEstablished: false,
    storageEvidenceMayAssignCalibrationOrHoldout: false,
    storageEvidenceMayDefineProviderOutcome: false,
    storageEvidenceMeansEmpiricalAdmissionAuthorized: false,
    storageEvidenceMeansProviderScoringAuthorized: false,
    storageEvidenceMeansProductionImageRetentionAuthorized: false,
    storageEvidenceMeansProductionGeometryAuthorized: false,
  }),
});

function fail(message: string): never {
  throw new FaceAuthorityValidationError(`FR-DATA-07B ${message}`);
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
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) fail(`${label} must use canonical ISO-8601 UTC millisecond form.`);
  return value;
}

function rejectUnknownKeys(value: object, allowedKeys: readonly string[], label: string): void {
  const allowed = new Set<string>(allowedKeys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label} contains undeclared field ${key}.`);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(object).sort()) {
      const child = object[key];
      if (child === undefined) fail('metadata cannot contain undefined values.');
      normalized[key] = canonicalize(child);
    }
    return normalized;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) fail('metadata cannot contain non-finite numbers.');
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    fail('metadata must be JSON-compatible.');
  }
  return value;
}

function metadataDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex')}`;
}

function storageCoordinate(receipt: Pick<
FrozenIndependentFaceSourceAssetStorageReceiptFRData07BV1,
'storageProviderRef' | 'storageNamespaceRef' | 'storageObjectRef' | 'storageVersionRef'
>): string {
  return [receipt.storageProviderRef, receipt.storageNamespaceRef, receipt.storageObjectRef, receipt.storageVersionRef ?? ''].join('\u0000');
}

export function validateIndependentFaceSourceAssetStorageAuthorityFRData07B(
  authority: IndependentFaceSourceAssetStorageAuthorityFRData07BV1 = INDEPENDENT_FACE_SOURCE_ASSET_STORAGE_AUTHORITY_FRDATA07B,
): IndependentFaceSourceAssetStorageAuthorityFRData07BV1 {
  if (
    authority.schemaVersion !== 'fr-data07b-v1' ||
    authority.authorityRef !== 'authority.face.independent_face_source_asset_storage.frdata07b' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'controlled_research_storage_receipt_and_retrieval_reverification_contract_defined_no_real_asset_admission' ||
    authority.upstreamSourceAssetSchemaRef !== 'fr-data07a-independent-face-source-asset-record-v1'
  ) fail('authority identity/upstream schema drift.');
  const protocol = authority.protocol;
  if (
    protocol.exactFRData07ARecordVerificationRequired !== true ||
    protocol.exactReceiptBindingToFRData07ARequired !== true ||
    protocol.opaqueStorageCoordinatesRequired !== true ||
    protocol.receiptRetainsRawBytes !== false ||
    protocol.retrievalVerificationRequiresProvidedBytes !== true ||
    protocol.retrievalDigestMustMatchFRData07ACanonicalDigest !== true ||
    protocol.retrievalByteLengthMustMatchFRData07A !== true ||
    protocol.retrievalTimestampMustNotPrecedeStorageTimestamp !== true ||
    protocol.retrievalVerificationRetainsRawBytes !== false ||
    protocol.productionRuntimeImageRetentionAuthorized !== false
  ) fail('protocol authority boundary drift.');
  if (
    protocol.storageBackendTrustPolicy !== null ||
    protocol.minimumRetentionDuration !== null ||
    protocol.encryptionAtRestRequirement !== null ||
    protocol.storageImmutabilityRequirement !== null ||
    protocol.acceptedStorageBackend !== null ||
    protocol.empiricalAdmissionCriterion !== null
  ) fail('storage/empirical governance criteria must remain unset before governing evidence exists.');
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) fail('authority boundary must remain fully fail-closed.');
  return authority;
}

export function freezeIndependentFaceSourceAssetStorageReceiptFRData07B(
  sourceRecord: FrozenIndependentFaceSourceAssetRecordFRData07AV1,
  input: IndependentFaceSourceAssetStorageReceiptInputFRData07BV1,
): FrozenIndependentFaceSourceAssetStorageReceiptFRData07BV1 {
  validateIndependentFaceSourceAssetStorageAuthorityFRData07B();
  verifyFrozenIndependentFaceSourceAssetRecordFRData07A(sourceRecord);
  rejectUnknownKeys(input, RECEIPT_INPUT_KEYS, 'storage receipt input');
  if (input.schemaVersion !== 'fr-data07b-independent-face-source-asset-storage-receipt-input-v1') fail('storage receipt input schema drift.');
  nonEmpty(input.storageReceiptRef, 'storageReceiptRef');
  nonEmpty(input.acquisitionRef, 'acquisitionRef');
  nonEmpty(input.captureRef, 'captureRef');
  canonicalSha256(input.sourceAssetRecordDigest, 'sourceAssetRecordDigest');
  canonicalSha256(input.canonicalAssetDigest, 'canonicalAssetDigest');
  if (!Number.isInteger(input.byteLength) || input.byteLength <= 0) fail('byteLength must be a positive integer.');
  nonEmpty(input.storageProviderRef, 'storageProviderRef');
  nonEmpty(input.storageNamespaceRef, 'storageNamespaceRef');
  nonEmpty(input.storageObjectRef, 'storageObjectRef');
  optionalNonEmpty(input.storageVersionRef, 'storageVersionRef');
  if (input.retentionAttestation !== 'bytes_declared_retained_in_controlled_research_storage') fail('retentionAttestation is unsupported.');
  canonicalTimestamp(input.storedAt, 'storedAt');

  if (input.acquisitionRef !== sourceRecord.acquisitionRef) fail('acquisitionRef does not match FR-DATA-07A record.');
  if (input.captureRef !== sourceRecord.captureRef) fail('captureRef does not match FR-DATA-07A record.');
  if (input.sourceAssetRecordDigest !== sourceRecord.recordDigest) fail('sourceAssetRecordDigest does not match FR-DATA-07A record.');
  if (input.canonicalAssetDigest !== sourceRecord.canonicalAssetDigest) fail('canonicalAssetDigest does not match FR-DATA-07A record.');
  if (input.byteLength !== sourceRecord.byteLength) fail('byteLength does not match FR-DATA-07A record.');
  if (Date.parse(input.storedAt) < Date.parse(sourceRecord.acquiredAt)) fail('storedAt cannot precede FR-DATA-07A acquiredAt.');

  const material = {
    schemaVersion: 'fr-data07b-independent-face-source-asset-storage-receipt-v1' as const,
    storageReceiptRef: input.storageReceiptRef,
    acquisitionRef: input.acquisitionRef,
    captureRef: input.captureRef,
    sourceAssetRecordDigest: input.sourceAssetRecordDigest,
    canonicalAssetDigest: input.canonicalAssetDigest,
    byteLength: input.byteLength,
    storageProviderRef: input.storageProviderRef,
    storageNamespaceRef: input.storageNamespaceRef,
    storageObjectRef: input.storageObjectRef,
    storageVersionRef: input.storageVersionRef,
    retentionAttestation: input.retentionAttestation,
    storedAt: input.storedAt,
    storageScope: 'research_evidence_only' as const,
    exactFRData07ARecordBindingVerified: true as const,
    storageReceiptRecorded: true as const,
    rawBytesEmbeddedInReceipt: false as const,
    storedBytesRetrievalReverifiedByReceipt: false as const,
    storageProviderIdentityExternallyAuthenticated: false as const,
    storageBackendIntegrityIndependentlyAudited: false as const,
    storageObjectImmutabilityExternallyVerified: false as const,
    retentionDurationExternallyGuaranteed: false as const,
    productionRuntimeImageRetentionAuthorized: false as const,
    rightsLegallyAdjudicated: false as const,
    privacySubjectRiskIndependentlyAdjudicated: false as const,
    humanFaceCountLabelEstablished: false as const,
    partitionAssignmentAuthorized: false as const,
    empiricalAdmissionAuthorized: false as const,
    providerScoringAuthorized: false as const,
    productionGeometryAuthorized: false as const,
    authorityState: 'controlled_research_storage_receipt_recorded_exact_frdata07a_binding_no_storage_backend_authentication' as const,
  };
  return Object.freeze({ ...material, receiptDigest: metadataDigest(material) });
}

export function verifyFrozenIndependentFaceSourceAssetStorageReceiptFRData07B(
  sourceRecord: FrozenIndependentFaceSourceAssetRecordFRData07AV1,
  receipt: FrozenIndependentFaceSourceAssetStorageReceiptFRData07BV1,
): FrozenIndependentFaceSourceAssetStorageReceiptFRData07BV1 {
  validateIndependentFaceSourceAssetStorageAuthorityFRData07B();
  verifyFrozenIndependentFaceSourceAssetRecordFRData07A(sourceRecord);
  rejectUnknownKeys(receipt, RECEIPT_KEYS, 'frozen storage receipt');
  if (receipt.schemaVersion !== 'fr-data07b-independent-face-source-asset-storage-receipt-v1') fail('frozen storage receipt schema drift.');
  nonEmpty(receipt.storageReceiptRef, 'receipt.storageReceiptRef');
  nonEmpty(receipt.storageProviderRef, 'receipt.storageProviderRef');
  nonEmpty(receipt.storageNamespaceRef, 'receipt.storageNamespaceRef');
  nonEmpty(receipt.storageObjectRef, 'receipt.storageObjectRef');
  optionalNonEmpty(receipt.storageVersionRef, 'receipt.storageVersionRef');
  canonicalSha256(receipt.sourceAssetRecordDigest, 'receipt.sourceAssetRecordDigest');
  canonicalSha256(receipt.canonicalAssetDigest, 'receipt.canonicalAssetDigest');
  canonicalSha256(receipt.receiptDigest, 'receipt.receiptDigest');
  canonicalTimestamp(receipt.storedAt, 'receipt.storedAt');
  if (!Number.isInteger(receipt.byteLength) || receipt.byteLength <= 0) fail('receipt.byteLength must be a positive integer.');
  if (receipt.acquisitionRef !== sourceRecord.acquisitionRef || receipt.captureRef !== sourceRecord.captureRef ||
      receipt.sourceAssetRecordDigest !== sourceRecord.recordDigest || receipt.canonicalAssetDigest !== sourceRecord.canonicalAssetDigest ||
      receipt.byteLength !== sourceRecord.byteLength) fail('frozen storage receipt exact FR-DATA-07A binding drift.');
  if (Date.parse(receipt.storedAt) < Date.parse(sourceRecord.acquiredAt)) fail('receipt.storedAt cannot precede FR-DATA-07A acquiredAt.');
  if (
    receipt.retentionAttestation !== 'bytes_declared_retained_in_controlled_research_storage' ||
    receipt.storageScope !== 'research_evidence_only' ||
    receipt.exactFRData07ARecordBindingVerified !== true ||
    receipt.storageReceiptRecorded !== true ||
    receipt.rawBytesEmbeddedInReceipt !== false ||
    receipt.storedBytesRetrievalReverifiedByReceipt !== false ||
    receipt.storageProviderIdentityExternallyAuthenticated !== false ||
    receipt.storageBackendIntegrityIndependentlyAudited !== false ||
    receipt.storageObjectImmutabilityExternallyVerified !== false ||
    receipt.retentionDurationExternallyGuaranteed !== false ||
    receipt.productionRuntimeImageRetentionAuthorized !== false ||
    receipt.rightsLegallyAdjudicated !== false ||
    receipt.privacySubjectRiskIndependentlyAdjudicated !== false ||
    receipt.humanFaceCountLabelEstablished !== false ||
    receipt.partitionAssignmentAuthorized !== false ||
    receipt.empiricalAdmissionAuthorized !== false ||
    receipt.providerScoringAuthorized !== false ||
    receipt.productionGeometryAuthorized !== false ||
    receipt.authorityState !== 'controlled_research_storage_receipt_recorded_exact_frdata07a_binding_no_storage_backend_authentication'
  ) fail('frozen storage receipt authority boundary drift.');
  const { receiptDigest, ...material } = receipt;
  if (metadataDigest(material) !== receiptDigest) fail('frozen storage receipt metadata digest mismatch.');
  return receipt;
}

export function freezeIndependentFaceSourceAssetStorageRetrievalVerificationFRData07B(
  sourceRecord: FrozenIndependentFaceSourceAssetRecordFRData07AV1,
  receipt: FrozenIndependentFaceSourceAssetStorageReceiptFRData07BV1,
  input: IndependentFaceSourceAssetStorageRetrievalInputFRData07BV1,
): FrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07BV1 {
  verifyFrozenIndependentFaceSourceAssetStorageReceiptFRData07B(sourceRecord, receipt);
  rejectUnknownKeys(input, RETRIEVAL_INPUT_KEYS, 'storage retrieval input');
  if (input.schemaVersion !== 'fr-data07b-independent-face-source-asset-storage-retrieval-input-v1') fail('storage retrieval input schema drift.');
  nonEmpty(input.retrievalVerificationRef, 'retrievalVerificationRef');
  nonEmpty(input.storageReceiptRef, 'storageReceiptRef');
  canonicalSha256(input.sourceAssetRecordDigest, 'sourceAssetRecordDigest');
  nonEmpty(input.retrievalMechanismRef, 'retrievalMechanismRef');
  canonicalTimestamp(input.retrievedAt, 'retrievedAt');
  if (!(input.retrievedBytes instanceof Uint8Array) || input.retrievedBytes.length === 0) fail('retrievedBytes must be a non-empty Uint8Array.');
  if (input.storageReceiptRef !== receipt.storageReceiptRef) fail('storageReceiptRef does not match frozen storage receipt.');
  if (input.sourceAssetRecordDigest !== sourceRecord.recordDigest) fail('sourceAssetRecordDigest does not match FR-DATA-07A record.');
  if (Date.parse(input.retrievedAt) < Date.parse(receipt.storedAt)) fail('retrievedAt cannot precede storedAt.');

  const retrievedDigest = computeIndependentFaceSourceAssetDigestFRData07A(input.retrievedBytes);
  if (retrievedDigest !== sourceRecord.canonicalAssetDigest) fail('retrieved byte digest does not match FR-DATA-07A canonical asset digest.');
  if (input.retrievedBytes.length !== sourceRecord.byteLength) fail('retrieved byte length does not match FR-DATA-07A byte length.');

  const material = {
    schemaVersion: 'fr-data07b-independent-face-source-asset-storage-retrieval-verification-v1' as const,
    retrievalVerificationRef: input.retrievalVerificationRef,
    storageReceiptRef: receipt.storageReceiptRef,
    acquisitionRef: sourceRecord.acquisitionRef,
    captureRef: sourceRecord.captureRef,
    sourceAssetRecordDigest: sourceRecord.recordDigest,
    canonicalAssetDigest: sourceRecord.canonicalAssetDigest,
    expectedByteLength: sourceRecord.byteLength,
    retrievalMechanismRef: input.retrievalMechanismRef,
    retrievedAt: input.retrievedAt,
    retrievedByteDigest: retrievedDigest,
    retrievedByteLength: input.retrievedBytes.length,
    exactCanonicalDigestMatch: true as const,
    exactByteLengthMatch: true as const,
    retrievalCandidateBytesDigestReverified: true as const,
    retrievedBytesEmbeddedInVerificationRecord: false as const,
    providedRetrievalBytesProvenToOriginateFromDeclaredStorageObject: false as const,
    storageProviderIdentityExternallyAuthenticated: false as const,
    storageBackendIntegrityIndependentlyAudited: false as const,
    storageObjectImmutabilityExternallyVerified: false as const,
    sourceTransportAuthenticated: false as const,
    rightsLegallyAdjudicated: false as const,
    privacySubjectRiskIndependentlyAdjudicated: false as const,
    humanFaceCountLabelEstablished: false as const,
    partitionAssignmentAuthorized: false as const,
    empiricalAdmissionAuthorized: false as const,
    providerScoringAuthorized: false as const,
    productionGeometryAuthorized: false as const,
    authorityState: 'provided_retrieval_bytes_digest_reverified_against_frdata07a_no_declared_storage_origin_authentication' as const,
  };
  return Object.freeze({ ...material, verificationDigest: metadataDigest(material) });
}

export function verifyFrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07B(
  sourceRecord: FrozenIndependentFaceSourceAssetRecordFRData07AV1,
  receipt: FrozenIndependentFaceSourceAssetStorageReceiptFRData07BV1,
  verification: FrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07BV1,
): FrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07BV1 {
  verifyFrozenIndependentFaceSourceAssetStorageReceiptFRData07B(sourceRecord, receipt);
  rejectUnknownKeys(verification, RETRIEVAL_KEYS, 'frozen storage retrieval verification');
  if (verification.schemaVersion !== 'fr-data07b-independent-face-source-asset-storage-retrieval-verification-v1') fail('frozen storage retrieval verification schema drift.');
  nonEmpty(verification.retrievalVerificationRef, 'verification.retrievalVerificationRef');
  nonEmpty(verification.retrievalMechanismRef, 'verification.retrievalMechanismRef');
  canonicalSha256(verification.sourceAssetRecordDigest, 'verification.sourceAssetRecordDigest');
  canonicalSha256(verification.canonicalAssetDigest, 'verification.canonicalAssetDigest');
  canonicalSha256(verification.retrievedByteDigest, 'verification.retrievedByteDigest');
  canonicalSha256(verification.verificationDigest, 'verification.verificationDigest');
  canonicalTimestamp(verification.retrievedAt, 'verification.retrievedAt');
  if (verification.storageReceiptRef !== receipt.storageReceiptRef || verification.acquisitionRef !== sourceRecord.acquisitionRef ||
      verification.captureRef !== sourceRecord.captureRef || verification.sourceAssetRecordDigest !== sourceRecord.recordDigest ||
      verification.canonicalAssetDigest !== sourceRecord.canonicalAssetDigest || verification.expectedByteLength !== sourceRecord.byteLength ||
      verification.retrievedByteDigest !== sourceRecord.canonicalAssetDigest || verification.retrievedByteLength !== sourceRecord.byteLength) {
    fail('frozen storage retrieval verification exact binding drift.');
  }
  if (Date.parse(verification.retrievedAt) < Date.parse(receipt.storedAt)) fail('verification.retrievedAt cannot precede storedAt.');
  if (
    verification.exactCanonicalDigestMatch !== true ||
    verification.exactByteLengthMatch !== true ||
    verification.retrievalCandidateBytesDigestReverified !== true ||
    verification.retrievedBytesEmbeddedInVerificationRecord !== false ||
    verification.providedRetrievalBytesProvenToOriginateFromDeclaredStorageObject !== false ||
    verification.storageProviderIdentityExternallyAuthenticated !== false ||
    verification.storageBackendIntegrityIndependentlyAudited !== false ||
    verification.storageObjectImmutabilityExternallyVerified !== false ||
    verification.sourceTransportAuthenticated !== false ||
    verification.rightsLegallyAdjudicated !== false ||
    verification.privacySubjectRiskIndependentlyAdjudicated !== false ||
    verification.humanFaceCountLabelEstablished !== false ||
    verification.partitionAssignmentAuthorized !== false ||
    verification.empiricalAdmissionAuthorized !== false ||
    verification.providerScoringAuthorized !== false ||
    verification.productionGeometryAuthorized !== false ||
    verification.authorityState !== 'provided_retrieval_bytes_digest_reverified_against_frdata07a_no_declared_storage_origin_authentication'
  ) fail('frozen storage retrieval verification authority boundary drift.');
  const { verificationDigest, ...material } = verification;
  if (metadataDigest(material) !== verificationDigest) fail('frozen storage retrieval verification metadata digest mismatch.');
  return verification;
}

export function bindIndependentFaceSourceAssetStorageFRData07B(
  sourceRecords: readonly FrozenIndependentFaceSourceAssetRecordFRData07AV1[],
  receipts: readonly FrozenIndependentFaceSourceAssetStorageReceiptFRData07BV1[],
  verifications: readonly FrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07BV1[],
): IndependentFaceSourceAssetStorageBindingReportFRData07BV1 {
  if (!Array.isArray(sourceRecords) || !Array.isArray(receipts) || !Array.isArray(verifications)) fail('storage binding inputs must be arrays.');
  if (sourceRecords.length === 0) fail('storage binding requires at least one source asset record.');
  if (receipts.length !== sourceRecords.length || verifications.length !== sourceRecords.length) fail('storage receipt and retrieval verification coverage must exactly match source asset record count.');
  const sourceRecordDigests = sourceRecords.map((record) => record.recordDigest);
  const captureRefs = sourceRecords.map((record) => record.captureRef);
  const receiptRefs = receipts.map((receipt) => receipt.storageReceiptRef);
  const verificationRefs = verifications.map((verification) => verification.retrievalVerificationRef);
  const storageCoordinates = receipts.map(storageCoordinate);
  if (new Set(sourceRecordDigests).size !== sourceRecordDigests.length) fail('source asset record digests must be unique for storage binding.');
  if (new Set(captureRefs).size !== captureRefs.length) fail('source asset capture refs must be unique for storage binding.');
  if (new Set(receiptRefs).size !== receiptRefs.length) fail('storageReceiptRefs must be unique.');
  if (new Set(verificationRefs).size !== verificationRefs.length) fail('retrievalVerificationRefs must be unique.');
  if (new Set(storageCoordinates).size !== storageCoordinates.length) fail('exact storage coordinates must be unique across source asset records.');

  for (const sourceRecord of sourceRecords) {
    verifyFrozenIndependentFaceSourceAssetRecordFRData07A(sourceRecord);
    const receipt = receipts.find((candidate) => candidate.sourceAssetRecordDigest === sourceRecord.recordDigest && candidate.captureRef === sourceRecord.captureRef);
    if (!receipt) fail(`source asset record ${sourceRecord.recordDigest} is missing its storage receipt.`);
    verifyFrozenIndependentFaceSourceAssetStorageReceiptFRData07B(sourceRecord, receipt);
    const verification = verifications.find((candidate) => candidate.storageReceiptRef === receipt.storageReceiptRef);
    if (!verification) fail(`storage receipt ${receipt.storageReceiptRef} is missing its retrieval verification.`);
    verifyFrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07B(sourceRecord, receipt, verification);
  }

  return Object.freeze({
    schemaVersion: 'fr-data07b-independent-face-source-asset-storage-binding-report-v1' as const,
    sourceAssetRecordCount: sourceRecords.length,
    storageReceiptCount: receipts.length,
    retrievalVerificationCount: verifications.length,
    sourceAssetRecordCoverageComplete: true as const,
    exactStorageReceiptBindingVerified: true as const,
    exactRetrievalVerificationBindingVerified: true as const,
    allProvidedRetrievalBytesMatchCanonicalDigests: true as const,
    allProvidedRetrievalByteLengthsMatch: true as const,
    declaredStorageOriginExternallyAuthenticated: false as const,
    storageBackendIntegrityIndependentlyAudited: false as const,
    storageObjectImmutabilityExternallyVerified: false as const,
    productionRuntimeImageRetentionAuthorized: false as const,
    empiricalAdmissionAuthorized: false as const,
    providerScoringAuthorized: false as const,
    productionGeometryAuthorized: false as const,
  });
}

export function assertIndependentFaceSourceAssetStorageReadyForEmpiricalAdmissionFRData07B(): never {
  validateIndependentFaceSourceAssetStorageAuthorityFRData07B();
  fail('storage receipt and supplied-byte retrieval re-verification do not authorize empirical admission; real controlled-storage retention, human annotation, adjudication, and later evidence admission remain required.');
}
