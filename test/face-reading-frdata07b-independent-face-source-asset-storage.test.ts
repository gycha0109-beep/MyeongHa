import { describe, expect, it } from 'vitest';
import {
  INDEPENDENT_FACE_SOURCE_ASSET_STORAGE_AUTHORITY_FRDATA07B,
  assertIndependentFaceSourceAssetStorageReadyForEmpiricalAdmissionFRData07B,
  bindIndependentFaceSourceAssetStorageFRData07B,
  computeIndependentFaceSourceAssetDigestFRData07A,
  freezeIndependentFaceSourceAssetRecordFRData07A,
  freezeIndependentFaceSourceAssetStorageReceiptFRData07B,
  freezeIndependentFaceSourceAssetStorageRetrievalVerificationFRData07B,
  validateIndependentFaceSourceAssetStorageAuthorityFRData07B,
  verifyFrozenIndependentFaceSourceAssetStorageReceiptFRData07B,
  verifyFrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07B,
  type FrozenIndependentFaceSourceAssetRecordFRData07AV1,
  type FrozenIndependentFaceSourceAssetStorageReceiptFRData07BV1,
  type FrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07BV1,
  type IndependentFaceSourceAssetIntakeInputFRData07AV1,
  type IndependentFaceSourceAssetStorageReceiptInputFRData07BV1,
  type IndependentFaceSourceAssetStorageRetrievalInputFRData07BV1,
} from '../packages/face-reading/src/index.js';

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  bytes[16] = (width >>> 24) & 0xff;
  bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff;
  bytes[19] = width & 0xff;
  bytes[20] = (height >>> 24) & 0xff;
  bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff;
  bytes[23] = height & 0xff;
  bytes.set([8, 2, 0, 0, 0], 24);
  return bytes;
}

function sourceInput(captureRef = 'capture-frdata07b-001', bytes = png(2, 3)): IndependentFaceSourceAssetIntakeInputFRData07AV1 {
  return {
    schemaVersion: 'fr-data07a-independent-face-source-asset-intake-v1',
    acquisitionRef: `acquisition-${captureRef}`,
    captureRef,
    sourceProvenanceRef: `provenance-${captureRef}`,
    sourceInstanceRef: `source-instance-${captureRef}`,
    sourcePageUrl: `https://example.invalid/source/${captureRef}`,
    sourcePageRevisionRef: `revision-${captureRef}`,
    sourceAssetUrl: `https://example.invalid/assets/${captureRef}.png`,
    declaredCanonicalAssetDigest: computeIndependentFaceSourceAssetDigestFRData07A(bytes),
    bytes,
    sourceReportedWidth: bytes[19]!,
    sourceReportedHeight: bytes[23]!,
    rightsBasisText: 'Synthetic fixture only; no legal adjudication.',
    rightsEvidenceRefs: [`rights-${captureRef}`],
    rightsReviewState: 'source_rights_basis_recorded_not_legally_adjudicated',
    knownUseRestrictionNotes: [],
    privacySubjectRiskNotes: ['Synthetic fixture only; no real privacy authority.'],
    derivativeOfSourceInstanceRef: null,
    acquiredAt: '2026-08-31T10:00:00.000Z',
  };
}

function sourceRecord(captureRef = 'capture-frdata07b-001', bytes = png(2, 3)): FrozenIndependentFaceSourceAssetRecordFRData07AV1 {
  return freezeIndependentFaceSourceAssetRecordFRData07A(sourceInput(captureRef, bytes));
}

function receiptInput(record: FrozenIndependentFaceSourceAssetRecordFRData07AV1, suffix = '001'):
IndependentFaceSourceAssetStorageReceiptInputFRData07BV1 {
  return {
    schemaVersion: 'fr-data07b-independent-face-source-asset-storage-receipt-input-v1',
    storageReceiptRef: `storage-receipt-${suffix}`,
    acquisitionRef: record.acquisitionRef,
    captureRef: record.captureRef,
    sourceAssetRecordDigest: record.recordDigest,
    canonicalAssetDigest: record.canonicalAssetDigest,
    byteLength: record.byteLength,
    storageProviderRef: 'storage-provider-contract-fixture',
    storageNamespaceRef: 'storage-namespace-contract-fixture',
    storageObjectRef: `storage-object-${suffix}`,
    storageVersionRef: `storage-version-${suffix}`,
    retentionAttestation: 'bytes_declared_retained_in_controlled_research_storage',
    storedAt: '2026-08-31T10:01:00.000Z',
  };
}

function receipt(record: FrozenIndependentFaceSourceAssetRecordFRData07AV1, suffix = '001'):
FrozenIndependentFaceSourceAssetStorageReceiptFRData07BV1 {
  return freezeIndependentFaceSourceAssetStorageReceiptFRData07B(record, receiptInput(record, suffix));
}

function retrievalInput(
  record: FrozenIndependentFaceSourceAssetRecordFRData07AV1,
  frozenReceipt: FrozenIndependentFaceSourceAssetStorageReceiptFRData07BV1,
  bytes = png(2, 3),
  suffix = '001',
): IndependentFaceSourceAssetStorageRetrievalInputFRData07BV1 {
  return {
    schemaVersion: 'fr-data07b-independent-face-source-asset-storage-retrieval-input-v1',
    retrievalVerificationRef: `retrieval-verification-${suffix}`,
    storageReceiptRef: frozenReceipt.storageReceiptRef,
    sourceAssetRecordDigest: record.recordDigest,
    retrievalMechanismRef: 'contract-fixture-readback',
    retrievedAt: '2026-08-31T10:02:00.000Z',
    retrievedBytes: bytes,
  };
}

function retrieval(
  record: FrozenIndependentFaceSourceAssetRecordFRData07AV1,
  frozenReceipt: FrozenIndependentFaceSourceAssetStorageReceiptFRData07BV1,
  bytes = png(2, 3),
  suffix = '001',
): FrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07BV1 {
  return freezeIndependentFaceSourceAssetStorageRetrievalVerificationFRData07B(
    record,
    frozenReceipt,
    retrievalInput(record, frozenReceipt, bytes, suffix),
  );
}

function mutableClone<T>(value: T): T {
  return structuredClone(value);
}

describe('FR-DATA-07B independent face source-asset controlled research storage', () => {
  it('defines research-evidence storage plumbing without production or empirical authority', () => {
    const authority = validateIndependentFaceSourceAssetStorageAuthorityFRData07B();
    expect(authority).toBe(INDEPENDENT_FACE_SOURCE_ASSET_STORAGE_AUTHORITY_FRDATA07B);
    expect(authority.protocol.exactFRData07ARecordVerificationRequired).toBe(true);
    expect(authority.protocol.exactReceiptBindingToFRData07ARequired).toBe(true);
    expect(authority.protocol.receiptRetainsRawBytes).toBe(false);
    expect(authority.protocol.retrievalVerificationRequiresProvidedBytes).toBe(true);
    expect(authority.protocol.retrievalDigestMustMatchFRData07ACanonicalDigest).toBe(true);
    expect(authority.protocol.retrievalByteLengthMustMatchFRData07A).toBe(true);
    expect(authority.protocol.retrievalTimestampMustNotPrecedeStorageTimestamp).toBe(true);
    expect(authority.protocol.productionRuntimeImageRetentionAuthorized).toBe(false);
    expect(authority.protocol.storageBackendTrustPolicy).toBeNull();
    expect(authority.protocol.minimumRetentionDuration).toBeNull();
    expect(authority.protocol.encryptionAtRestRequirement).toBeNull();
    expect(authority.protocol.storageImmutabilityRequirement).toBeNull();
    expect(authority.protocol.acceptedStorageBackend).toBeNull();
    expect(authority.protocol.empiricalAdmissionCriterion).toBeNull();
    expect(Object.values(authority.authorityBoundary).every((value) => value === false)).toBe(true);
  });

  it('freezes an exact FR-DATA-07A-bound storage receipt without embedding raw bytes', () => {
    const record = sourceRecord();
    const frozen = receipt(record);
    expect(frozen.sourceAssetRecordDigest).toBe(record.recordDigest);
    expect(frozen.canonicalAssetDigest).toBe(record.canonicalAssetDigest);
    expect(frozen.byteLength).toBe(record.byteLength);
    expect(frozen.storageScope).toBe('research_evidence_only');
    expect(frozen.exactFRData07ARecordBindingVerified).toBe(true);
    expect(frozen.rawBytesEmbeddedInReceipt).toBe(false);
    expect(frozen.storedBytesRetrievalReverifiedByReceipt).toBe(false);
    expect(frozen.productionRuntimeImageRetentionAuthorized).toBe(false);
    expect('bytes' in frozen).toBe(false);
    expect(verifyFrozenIndependentFaceSourceAssetStorageReceiptFRData07B(record, frozen)).toBe(frozen);
  });

  it('rejects storage receipt binding drift from FR-DATA-07A', () => {
    const record = sourceRecord();
    const base = receiptInput(record);
    expect(() => freezeIndependentFaceSourceAssetStorageReceiptFRData07B(record, {
      ...base,
      canonicalAssetDigest: `sha256:${'0'.repeat(64)}`,
    })).toThrow(/canonicalAssetDigest does not match/u);
    expect(() => freezeIndependentFaceSourceAssetStorageReceiptFRData07B(record, {
      ...base,
      sourceAssetRecordDigest: `sha256:${'1'.repeat(64)}`,
    })).toThrow(/sourceAssetRecordDigest does not match/u);
    expect(() => freezeIndependentFaceSourceAssetStorageReceiptFRData07B(record, {
      ...base,
      byteLength: record.byteLength + 1,
    })).toThrow(/byteLength does not match/u);
  });

  it('rejects storage timestamps that precede source acquisition', () => {
    const record = sourceRecord();
    expect(() => freezeIndependentFaceSourceAssetStorageReceiptFRData07B(record, {
      ...receiptInput(record),
      storedAt: '2026-08-31T09:59:59.999Z',
    })).toThrow(/cannot precede/u);
  });

  it('rejects undeclared authority fields in receipt input and persisted receipt', () => {
    const record = sourceRecord();
    const smuggledInput = { ...receiptInput(record), empiricalAdmissionAuthorized: true } as unknown as IndependentFaceSourceAssetStorageReceiptInputFRData07BV1;
    expect(() => freezeIndependentFaceSourceAssetStorageReceiptFRData07B(record, smuggledInput)).toThrow(/undeclared field empiricalAdmissionAuthorized/u);
    const smuggledReceipt = { ...receipt(record), trusted: true } as unknown as FrozenIndependentFaceSourceAssetStorageReceiptFRData07BV1;
    expect(() => verifyFrozenIndependentFaceSourceAssetStorageReceiptFRData07B(record, smuggledReceipt)).toThrow(/undeclared field trusted/u);
  });

  it('re-hashes supplied retrieval bytes and requires exact canonical digest and byte length', () => {
    const bytes = png(2, 3);
    const record = sourceRecord('capture-frdata07b-retrieval', bytes);
    const frozenReceipt = receipt(record, 'retrieval');
    const verification = retrieval(record, frozenReceipt, bytes, 'retrieval');
    expect(verification.retrievedByteDigest).toBe(record.canonicalAssetDigest);
    expect(verification.retrievedByteLength).toBe(record.byteLength);
    expect(verification.exactCanonicalDigestMatch).toBe(true);
    expect(verification.exactByteLengthMatch).toBe(true);
    expect(verification.retrievalCandidateBytesDigestReverified).toBe(true);
    expect(verification.retrievedBytesEmbeddedInVerificationRecord).toBe(false);
    expect(verification.providedRetrievalBytesProvenToOriginateFromDeclaredStorageObject).toBe(false);
    expect('retrievedBytes' in verification).toBe(false);
    expect(verifyFrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07B(record, frozenReceipt, verification)).toBe(verification);
  });

  it('rejects altered retrieval bytes', () => {
    const bytes = png(2, 3);
    const record = sourceRecord('capture-frdata07b-altered', bytes);
    const frozenReceipt = receipt(record, 'altered');
    expect(() => retrieval(record, frozenReceipt, png(4, 5), 'altered')).toThrow(/retrieved byte digest does not match/u);
  });

  it('rejects retrieval verification timestamps that precede storage', () => {
    const record = sourceRecord();
    const frozenReceipt = receipt(record);
    expect(() => freezeIndependentFaceSourceAssetStorageRetrievalVerificationFRData07B(record, frozenReceipt, {
      ...retrievalInput(record, frozenReceipt),
      retrievedAt: '2026-08-31T10:00:59.999Z',
    })).toThrow(/cannot precede storedAt/u);
  });

  it('rejects undeclared fields and persisted authority escalation in retrieval evidence', () => {
    const bytes = png(2, 3);
    const record = sourceRecord('capture-frdata07b-smuggle', bytes);
    const frozenReceipt = receipt(record, 'smuggle');
    const smuggledInput = {
      ...retrievalInput(record, frozenReceipt, bytes, 'smuggle'),
      storageBackendIntegrityIndependentlyAudited: true,
    } as unknown as IndependentFaceSourceAssetStorageRetrievalInputFRData07BV1;
    expect(() => freezeIndependentFaceSourceAssetStorageRetrievalVerificationFRData07B(record, frozenReceipt, smuggledInput)).toThrow(/undeclared field storageBackendIntegrityIndependentlyAudited/u);

    const unknownPersistedField = {
      ...retrieval(record, frozenReceipt, bytes, 'smuggle'),
      trustEscalation: true,
    } as unknown as FrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07BV1;
    expect(() => verifyFrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07B(record, frozenReceipt, unknownPersistedField)).toThrow(/undeclared field trustEscalation/u);

    const authorityEscalation = {
      ...retrieval(record, frozenReceipt, bytes, 'smuggle'),
      empiricalAdmissionAuthorized: true,
    } as unknown as FrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07BV1;
    expect(() => verifyFrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07B(record, frozenReceipt, authorityEscalation)).toThrow(/authority boundary drift/u);
  });

  it('detects deterministic receipt and verification metadata tampering', () => {
    const bytes = png(2, 3);
    const record = sourceRecord('capture-frdata07b-tamper', bytes);
    const frozenReceipt = receipt(record, 'tamper');
    const verification = retrieval(record, frozenReceipt, bytes, 'tamper');
    expect(receipt(record, 'tamper').receiptDigest).toBe(frozenReceipt.receiptDigest);
    expect(retrieval(record, frozenReceipt, bytes, 'tamper').verificationDigest).toBe(verification.verificationDigest);

    const tamperedReceipt = mutableClone(frozenReceipt) as unknown as { storageObjectRef: string } & FrozenIndependentFaceSourceAssetStorageReceiptFRData07BV1;
    tamperedReceipt.storageObjectRef = 'different-storage-object';
    expect(() => verifyFrozenIndependentFaceSourceAssetStorageReceiptFRData07B(record, tamperedReceipt)).toThrow(/metadata digest mismatch/u);

    const tamperedVerification = mutableClone(verification) as unknown as { retrievalMechanismRef: string } & FrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07BV1;
    tamperedVerification.retrievalMechanismRef = 'different-mechanism';
    expect(() => verifyFrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07B(record, frozenReceipt, tamperedVerification)).toThrow(/metadata digest mismatch/u);
  });

  it('requires exact one-to-one receipt and retrieval coverage and unique storage coordinates', () => {
    const bytesA = png(2, 3);
    const bytesB = png(4, 5);
    const recordA = sourceRecord('capture-frdata07b-a', bytesA);
    const recordB = sourceRecord('capture-frdata07b-b', bytesB);
    const receiptA = receipt(recordA, 'a');
    const receiptB = receipt(recordB, 'b');
    const verificationA = retrieval(recordA, receiptA, bytesA, 'a');
    const verificationB = retrieval(recordB, receiptB, bytesB, 'b');

    const report = bindIndependentFaceSourceAssetStorageFRData07B(
      [recordA, recordB],
      [receiptA, receiptB],
      [verificationA, verificationB],
    );
    expect(report.sourceAssetRecordCoverageComplete).toBe(true);
    expect(report.exactStorageReceiptBindingVerified).toBe(true);
    expect(report.exactRetrievalVerificationBindingVerified).toBe(true);
    expect(report.allProvidedRetrievalBytesMatchCanonicalDigests).toBe(true);
    expect(report.declaredStorageOriginExternallyAuthenticated).toBe(false);
    expect(report.empiricalAdmissionAuthorized).toBe(false);
    expect(report.productionRuntimeImageRetentionAuthorized).toBe(false);

    expect(() => bindIndependentFaceSourceAssetStorageFRData07B(
      [recordA, recordB],
      [receiptA],
      [verificationA, verificationB],
    )).toThrow(/coverage must exactly match/u);

    const duplicateCoordinateReceiptB = freezeIndependentFaceSourceAssetStorageReceiptFRData07B(recordB, {
      ...receiptInput(recordB, 'b2'),
      storageProviderRef: receiptA.storageProviderRef,
      storageNamespaceRef: receiptA.storageNamespaceRef,
      storageObjectRef: receiptA.storageObjectRef,
      storageVersionRef: receiptA.storageVersionRef,
    });
    const verificationB2 = retrieval(recordB, duplicateCoordinateReceiptB, bytesB, 'b2');
    expect(() => bindIndependentFaceSourceAssetStorageFRData07B(
      [recordA, recordB],
      [receiptA, duplicateCoordinateReceiptB],
      [verificationA, verificationB2],
    )).toThrow(/storage coordinates must be unique/u);
  });

  it('keeps storage provenance, legal/privacy, labeling, provider, and production claims fail-closed', () => {
    const bytes = png(2, 3);
    const record = sourceRecord('capture-frdata07b-boundary', bytes);
    const frozenReceipt = receipt(record, 'boundary');
    const verification = retrieval(record, frozenReceipt, bytes, 'boundary');
    expect(frozenReceipt.storageProviderIdentityExternallyAuthenticated).toBe(false);
    expect(frozenReceipt.storageBackendIntegrityIndependentlyAudited).toBe(false);
    expect(frozenReceipt.storageObjectImmutabilityExternallyVerified).toBe(false);
    expect(frozenReceipt.retentionDurationExternallyGuaranteed).toBe(false);
    expect(frozenReceipt.rightsLegallyAdjudicated).toBe(false);
    expect(frozenReceipt.privacySubjectRiskIndependentlyAdjudicated).toBe(false);
    expect(frozenReceipt.humanFaceCountLabelEstablished).toBe(false);
    expect(frozenReceipt.partitionAssignmentAuthorized).toBe(false);
    expect(verification.providedRetrievalBytesProvenToOriginateFromDeclaredStorageObject).toBe(false);
    expect(verification.sourceTransportAuthenticated).toBe(false);
    expect(verification.empiricalAdmissionAuthorized).toBe(false);
    expect(verification.providerScoringAuthorized).toBe(false);
    expect(verification.productionGeometryAuthorized).toBe(false);
  });

  it('always blocks empirical admission from FR-DATA-07B alone', () => {
    expect(() => assertIndependentFaceSourceAssetStorageReadyForEmpiricalAdmissionFRData07B()).toThrow(/do not authorize empirical admission/u);
  });
});
