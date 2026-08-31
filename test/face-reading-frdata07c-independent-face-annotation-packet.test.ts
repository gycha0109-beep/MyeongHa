import { describe, expect, it } from 'vitest';
import {
  INDEPENDENT_FACE_ANNOTATION_PACKET_AUTHORITY_FRDATA07C,
  assertIndependentFaceAnnotationPacketReadyForEmpiricalAdmissionFRData07C,
  computeIndependentFaceSourceAssetDigestFRData07A,
  freezeIndependentFaceAnnotationPacketFRData07C,
  freezeIndependentFaceAnnotationPacketItemBindingFRData07C,
  freezeIndependentFaceSourceAssetRecordFRData07A,
  freezeIndependentFaceSourceAssetStorageReceiptFRData07B,
  freezeIndependentFaceSourceAssetStorageRetrievalVerificationFRData07B,
  validateIndependentFaceAnnotationPacketAuthorityFRData07C,
  verifyFrozenIndependentFaceAnnotationPacketFRData07C,
  verifyIndependentFaceAnnotationPacketAssetBytesFRData07C,
  type FrozenIndependentFaceAnnotationPacketFRData07CV1,
  type FrozenIndependentFaceSourceAssetRecordFRData07AV1,
  type FrozenIndependentFaceSourceAssetStorageReceiptFRData07BV1,
  type FrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07BV1,
  type IndependentFaceAnnotationPacketItemInputFRData07CV1,
  type IndependentFaceSourceAssetIntakeInputFRData07AV1,
} from '../packages/face-reading/src/index.js';

function png(width: number, height: number, marker = 0): Uint8Array {
  const bytes = new Uint8Array(34);
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
  bytes[33] = marker;
  return bytes;
}

function sourceInput(captureRef: string, bytes: Uint8Array): IndependentFaceSourceAssetIntakeInputFRData07AV1 {
  return {
    schemaVersion: 'fr-data07a-independent-face-source-asset-intake-v1',
    acquisitionRef: `acquisition-${captureRef}`,
    captureRef,
    sourceProvenanceRef: `secret-provenance-${captureRef}`,
    sourceInstanceRef: `secret-source-instance-${captureRef}`,
    sourcePageUrl: `https://example.invalid/secret/${captureRef}`,
    sourcePageRevisionRef: `secret-revision-${captureRef}`,
    sourceAssetUrl: `https://example.invalid/secret-assets/${captureRef}.png`,
    declaredCanonicalAssetDigest: computeIndependentFaceSourceAssetDigestFRData07A(bytes),
    bytes,
    sourceReportedWidth: bytes[19]!,
    sourceReportedHeight: bytes[23]!,
    rightsBasisText: `secret-rights-${captureRef}`,
    rightsEvidenceRefs: [`https://example.invalid/secret-rights/${captureRef}`],
    rightsReviewState: 'source_rights_basis_recorded_not_legally_adjudicated',
    knownUseRestrictionNotes: [`secret-restriction-${captureRef}`],
    privacySubjectRiskNotes: [`secret-privacy-${captureRef}`],
    derivativeOfSourceInstanceRef: null,
    acquiredAt: '2026-08-31T10:00:00.000Z',
  };
}

function evidence(captureRef: string, bytes: Uint8Array, suffix: string): {
  record: FrozenIndependentFaceSourceAssetRecordFRData07AV1;
  receipt: FrozenIndependentFaceSourceAssetStorageReceiptFRData07BV1;
  retrieval: FrozenIndependentFaceSourceAssetStorageRetrievalVerificationFRData07BV1;
} {
  const record = freezeIndependentFaceSourceAssetRecordFRData07A(sourceInput(captureRef, bytes));
  const receipt = freezeIndependentFaceSourceAssetStorageReceiptFRData07B(record, {
    schemaVersion: 'fr-data07b-independent-face-source-asset-storage-receipt-input-v1',
    storageReceiptRef: `storage-receipt-${suffix}`,
    acquisitionRef: record.acquisitionRef,
    captureRef: record.captureRef,
    sourceAssetRecordDigest: record.recordDigest,
    canonicalAssetDigest: record.canonicalAssetDigest,
    byteLength: record.byteLength,
    storageProviderRef: 'secret-storage-provider',
    storageNamespaceRef: 'secret-storage-namespace',
    storageObjectRef: `secret-storage-object-${suffix}`,
    storageVersionRef: `secret-storage-version-${suffix}`,
    retentionAttestation: 'bytes_declared_retained_in_controlled_research_storage',
    storedAt: '2026-08-31T10:01:00.000Z',
  });
  const retrieval = freezeIndependentFaceSourceAssetStorageRetrievalVerificationFRData07B(record, receipt, {
    schemaVersion: 'fr-data07b-independent-face-source-asset-storage-retrieval-input-v1',
    retrievalVerificationRef: `retrieval-${suffix}`,
    storageReceiptRef: receipt.storageReceiptRef,
    sourceAssetRecordDigest: record.recordDigest,
    retrievalMechanismRef: 'secret-retrieval-mechanism',
    retrievedAt: '2026-08-31T10:02:00.000Z',
    retrievedBytes: bytes,
  });
  return { record, receipt, retrieval };
}

function binding(captureRef: string, bytes: Uint8Array, suffix: string, packetRef = 'frdata07c-test-packet') {
  const { record, receipt, retrieval } = evidence(captureRef, bytes, suffix);
  return freezeIndependentFaceAnnotationPacketItemBindingFRData07C(record, receipt, retrieval, {
    schemaVersion: 'fr-data07c-independent-face-annotation-packet-item-input-v1',
    packetRef,
    canonicalAssetBytes: bytes,
  });
}

function mutableClone<T>(value: T): T {
  return structuredClone(value);
}

const sourceEvidenceManifestDigest = `sha256:${'a'.repeat(64)}`;

describe('FR-DATA-07C provider-blind human annotation packet', () => {
  it('defines exact-byte packet preparation without human, partition, empirical, provider, or production authority', () => {
    const authority = validateIndependentFaceAnnotationPacketAuthorityFRData07C();
    expect(authority).toBe(INDEPENDENT_FACE_ANNOTATION_PACKET_AUTHORITY_FRDATA07C);
    expect(authority.protocol.packetMayTransformCanonicalAssetBytes).toBe(false);
    expect(authority.protocol.annotatorFacingSourceMetadataAllowed).toBe(false);
    expect(authority.protocol.annotatorFacingPartitionAllowed).toBe(false);
    expect(authority.protocol.annotatorFacingProviderEvidenceAllowed).toBe(false);
    expect(authority.protocol.annotatorFacingSuggestedLabelAllowed).toBe(false);
    expect(authority.protocol.annotatorFacingExistingAnnotationsAllowed).toBe(false);
    expect(authority.protocol.minimumPacketItemsForEmpiricalAdmission).toBeNull();
    expect(authority.protocol.minimumIndependentAnnotatorsPerCapture).toBeNull();
    expect(authority.protocol.partitionAssignmentRule).toBeNull();
    expect(authority.protocol.humanAnnotationAcceptanceCriterion).toBeNull();
    expect(authority.protocol.empiricalAdmissionCriterion).toBeNull();
    expect(Object.values(authority.authorityBoundary).every((value) => value === false)).toBe(true);
  });

  it('binds exact canonical bytes to a deterministic opaque packet item without embedding bytes', () => {
    const bytes = png(2, 3, 1);
    const frozen = binding('capture-secret-001', bytes, '001');
    expect(frozen.itemRef).toMatch(/^item-[0-9a-f]{64}$/u);
    expect(frozen.packetAssetPath).toBe(`assets/${frozen.itemRef}.png`);
    expect(frozen.canonicalAssetBytesRehashedForPacket).toBe(true);
    expect(frozen.exactCanonicalAssetDigestMatch).toBe(true);
    expect(frozen.exactCanonicalByteLengthMatch).toBe(true);
    expect(frozen.exactCanonicalAssetBytesPreserved).toBe(true);
    expect(frozen.rawBytesEmbeddedInBindingRecord).toBe(false);
    expect(frozen.humanFaceCountLabelEstablished).toBe(false);
    expect(frozen.partitionAssignmentAuthorized).toBe(false);
    expect(frozen.providerScoringAuthorized).toBe(false);
    expect('canonicalAssetBytes' in frozen).toBe(false);
    expect(verifyIndependentFaceAnnotationPacketAssetBytesFRData07C(frozen, bytes)).toBe(true);
  });

  it('rejects changed packet bytes even when upstream metadata is otherwise valid', () => {
    const original = png(2, 3, 1);
    const changed = png(2, 3, 2);
    const { record, receipt, retrieval } = evidence('capture-secret-changed', original, 'changed');
    expect(() => freezeIndependentFaceAnnotationPacketItemBindingFRData07C(record, receipt, retrieval, {
      schemaVersion: 'fr-data07c-independent-face-annotation-packet-item-input-v1',
      packetRef: 'frdata07c-test-packet',
      canonicalAssetBytes: changed,
    })).toThrow(/packet candidate byte digest does not match/u);
  });

  it('rejects label, partition, or provider authority smuggling into item preparation input', () => {
    const bytes = png(2, 3, 3);
    const { record, receipt, retrieval } = evidence('capture-secret-smuggle', bytes, 'smuggle');
    const base: IndependentFaceAnnotationPacketItemInputFRData07CV1 = {
      schemaVersion: 'fr-data07c-independent-face-annotation-packet-item-input-v1',
      packetRef: 'frdata07c-test-packet',
      canonicalAssetBytes: bytes,
    };
    for (const extra of [
      { label: 'one_human_face' },
      { partition: 'calibration' },
      { providerCandidateCount: 1 },
      { empiricalAdmissionAuthorized: true },
    ]) {
      expect(() => freezeIndependentFaceAnnotationPacketItemBindingFRData07C(
        record,
        receipt,
        retrieval,
        { ...base, ...extra } as unknown as IndependentFaceAnnotationPacketItemInputFRData07CV1,
      )).toThrow(/undeclared field/u);
    }
  });

  it('produces a minimal annotator-facing manifest with no source, capture, digest, partition, provider evidence, or prior-label leakage', () => {
    const first = binding('capture-secret-001', png(2, 3, 1), '001');
    const second = binding('capture-secret-002', png(4, 5, 2), '002');
    const packet = freezeIndependentFaceAnnotationPacketFRData07C(
      'frdata07c-test-packet',
      sourceEvidenceManifestDigest,
      [first, second],
    );
    const serialized = JSON.stringify(packet.annotatorManifest);
    expect(Object.keys(packet.annotatorManifest)).toEqual([
      'schemaVersion', 'packetRef', 'taskConstruct', 'labelVocabulary', 'instructions', 'items',
    ]);
    expect(serialized).not.toContain('capture-secret');
    expect(serialized).not.toContain('example.invalid');
    expect(serialized).not.toContain('secret-provenance');
    expect(serialized).not.toContain('secret-rights');
    expect(serialized).not.toContain('secret-storage');
    expect(serialized).not.toContain('sha256:');
    expect(serialized).not.toContain('partition');
    expect(serialized).not.toContain('sourcePage');
    for (const forbiddenEvidenceField of [
      'providerOutput',
      'providerCandidateCount',
      'providerRunRef',
      'providerLandmarks',
      'providerResultShape',
      'annotatorRef',
      'annotationSessionRef',
      'observedAssetDigest',
      'annotatedAt',
      'annotationFrozenBefore',
      'suggestedLabel',
      'humanFaceCountLabel',
    ]) expect(serialized).not.toContain(forbiddenEvidenceField);
    expect(serialized).not.toContain('one_human_face\"}');
    expect(packet.annotationResponsesIncluded).toBe(false);
    expect(packet.humanAnnotationEstablished).toBe(false);
    expect(packet.annotationLedgerFrozen).toBe(false);
  });

  it('is deterministic under item input order while preserving packet-local opaque bindings', () => {
    const packetRef = 'frdata07c-order-packet';
    const first = binding('capture-order-001', png(2, 3, 1), 'order-001', packetRef);
    const second = binding('capture-order-002', png(4, 5, 2), 'order-002', packetRef);
    const a = freezeIndependentFaceAnnotationPacketFRData07C(packetRef, sourceEvidenceManifestDigest, [first, second]);
    const b = freezeIndependentFaceAnnotationPacketFRData07C(packetRef, sourceEvidenceManifestDigest, [second, first]);
    expect(a.packetDigest).toBe(b.packetDigest);
    expect(a.annotatorManifestDigest).toBe(b.annotatorManifestDigest);
    expect(a.itemBindings.map((item) => item.itemRef)).toEqual(b.itemBindings.map((item) => item.itemRef));
  });

  it('rejects duplicate canonical assets in one packet rather than presenting one exact image as multiple evidence items', () => {
    const bytes = png(2, 3, 8);
    const first = binding('capture-duplicate-001', bytes, 'duplicate-001');
    const second = binding('capture-duplicate-002', bytes, 'duplicate-002');
    expect(() => freezeIndependentFaceAnnotationPacketFRData07C(
      'frdata07c-test-packet',
      sourceEvidenceManifestDigest,
      [first, second],
    )).toThrow(/duplicate itemRef|duplicate canonicalAssetDigest/u);
  });

  it('detects frozen packet and annotator-manifest tampering', () => {
    const first = binding('capture-tamper-001', png(2, 3, 4), 'tamper-001');
    const packet = freezeIndependentFaceAnnotationPacketFRData07C('frdata07c-test-packet', sourceEvidenceManifestDigest, [first]);
    expect(verifyFrozenIndependentFaceAnnotationPacketFRData07C(packet)).toBe(packet);

    const tamperedManifest = mutableClone(packet) as unknown as {
      annotatorManifest: { packetRef: string };
    } & FrozenIndependentFaceAnnotationPacketFRData07CV1;
    tamperedManifest.annotatorManifest.packetRef = 'different-packet';
    expect(() => verifyFrozenIndependentFaceAnnotationPacketFRData07C(tamperedManifest)).toThrow(/packetRef mismatch|content\/order drift|digest mismatch/u);

    const escalated = {
      ...mutableClone(packet),
      empiricalAdmissionAuthorized: true,
    } as unknown as FrozenIndependentFaceAnnotationPacketFRData07CV1;
    expect(() => verifyFrozenIndependentFaceAnnotationPacketFRData07C(escalated)).toThrow(/authority\/blindness boundary drift/u);
  });

  it('does not claim that opaque wrapper metadata proves actual human blindness or embedded metadata absence', () => {
    const authority = validateIndependentFaceAnnotationPacketAuthorityFRData07C();
    expect(authority.authorityBoundary.opaqueItemRefMeansAnnotatorWasActuallyBlind).toBe(false);
    expect(authority.authorityBoundary.wrapperMetadataExclusionMeansEmbeddedAssetMetadataAbsent).toBe(false);
    expect(authority.protocol.embeddedAssetMetadataMayBeSanitizedByChangingCanonicalBytes).toBe(false);
    expect(authority.protocol.controlledDeliverySurfaceMustHideEmbeddedAssetMetadata).toBe(true);
  });

  it('always blocks empirical admission from packet preparation alone', () => {
    expect(() => assertIndependentFaceAnnotationPacketReadyForEmpiricalAdmissionFRData07C()).toThrow(/cannot authorize empirical admission/u);
  });
});
