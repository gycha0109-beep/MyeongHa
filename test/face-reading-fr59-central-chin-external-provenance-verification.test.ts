import { generateKeyPairSync, sign as signMessage, type KeyObject } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CENTRAL_CHIN_EXTERNAL_PROVENANCE_VERIFICATION_AUTHORITY_FR59,
  assessCentralChinExternalProvenanceVerificationReadinessFR59,
  assertCentralChinExternalProvenanceReadyForProductionFR59,
  buildCentralChinExternalProvenanceSignaturePayloadBytesFR59,
  computeCentralChinExternalProvenanceArtifactDigestFR59,
  computeCentralChinExternalProvenanceSignaturePayloadDigestFR59,
  computeCentralChinSourceAssetDigestFR56,
  freezeCentralChinPairedAcquisitionProvenanceFR58,
  freezeCentralChinPairedDatasetLedgerFR57,
  freezeCentralChinPairedEvidenceRecordFR56,
  validateCentralChinExternalProvenanceVerificationAuthorityFR59,
  verifyCentralChinExternalProvenanceArtifactsFR59,
  type CentralChinExternalProvenanceVerificationInputFR59V1,
  type CentralChinInferiorReferenceTraceAnnotationFR54V1,
  type CentralChinPairedAcquisitionProvenanceManifestFR58V1,
  type CentralChinPairedDatasetManifestFR57V1,
  type FrozenCentralChinPairedAcquisitionProvenanceFR58V1,
  type FrozenCentralChinPairedDatasetLedgerFR57V1,
  type FrozenCentralChinPairedEvidenceRecordFR56V1,
  type IndependentCentralChinScaffoldAnnotationFR50V1,
} from '../packages/face-reading/src/index.js';

function traceAnnotation(subjectId: string, captureId: string, annotatorId: string): CentralChinInferiorReferenceTraceAnnotationFR54V1 {
  return {
    schemaVersion: 'fr54-provider-blind-central-chin-reference-trace-v1',
    subjectId,
    captureId,
    annotatorId,
    coordinateFrame: 'normalized_image_2d',
    captureView: 'frontal_en_face',
    expression: 'neutral',
    traceOrder: 'raw_annotator_draw_order',
    tracePoints: [
      { x: 0.30, y: 0.80 },
      { x: 0.34, y: 0.82 },
      { x: 0.50, y: 0.85 },
      { x: 0.66, y: 0.82 },
      { x: 0.70, y: 0.80 },
    ],
    mentonTracePointIndex: 2,
    visibleCoverageOnBothSidesOfMentonAttested: true,
    lateralExtentState: 'annotation_coverage_extent_non_authoritative',
    providerOutputVisibleDuringTraceAnnotation: false,
    traditionalLabelVisibleDuringTraceAnnotation: false,
    mentonSideCandidateVisibleDuringTraceAnnotation: false,
    softTissueMentalTubercleCandidateVisibleDuringTraceAnnotation: false,
    traceFrozenBeforeCandidateAnnotationOrComparison: true,
    fullLowerJawlineIntentionallyTraced: false,
    gonionOrOtobasionUsedAsTraceEndpoint: false,
    traceEndpointsAssertedAsFR35Endpoints: false,
  };
}

function mentonSideAnnotation(subjectId: string, captureId: string, annotatorId: string): IndependentCentralChinScaffoldAnnotationFR50V1 {
  return {
    schemaVersion: 'fr50-independent-central-chin-scaffold-v1',
    subjectId,
    captureId,
    annotatorId,
    coordinateFrame: 'normalized_image_2d',
    leftCheilion: { x: 0.34, y: 0.61 },
    leftMentonSide: { x: 0.34, y: 0.82 },
    softTissueMenton: { x: 0.50, y: 0.84 },
    rightMentonSide: { x: 0.66, y: 0.82 },
    rightCheilion: { x: 0.66, y: 0.61 },
    providerOutputVisibleDuringAnnotation: false,
    annotationFrozenBeforeProviderScoring: true,
    traditionalLabelVisibleDuringAnnotation: false,
  };
}

function pairRecord(options: {
  pairRef: string;
  subjectId: string;
  captureId: string;
  assetLabel: string;
  minute: number;
}): FrozenCentralChinPairedEvidenceRecordFR56V1 {
  const bytes = new TextEncoder().encode(options.assetLabel);
  const assetDigest = computeCentralChinSourceAssetDigestFR56(bytes);
  return freezeCentralChinPairedEvidenceRecordFR56({
    schemaVersion: 'fr56-central-chin-paired-evidence-intake-v1',
    pairRef: options.pairRef,
    canonicalAssetDigest: assetDigest,
    traceObservedAssetDigest: assetDigest,
    mentonSideObservedAssetDigest: assetDigest,
    traceAnnotation: traceAnnotation(options.subjectId, options.captureId, `${options.pairRef}-trace`),
    traceFrozenAt: `2026-08-31T01:${String(options.minute).padStart(2, '0')}:00.000Z`,
    mentonSideAnnotation: mentonSideAnnotation(options.subjectId, options.captureId, `${options.pairRef}-candidate`),
    mentonSideAnnotationFrozenAt: `2026-08-31T01:${String(options.minute + 1).padStart(2, '0')}:00.000Z`,
    pairedAt: `2026-08-31T01:${String(options.minute + 2).padStart(2, '0')}:00.000Z`,
    traceFrozenBeforeCandidateAnnotationAttested: true,
    pairingPerformedAfterBothAnnotationsFrozenAttested: true,
  }, bytes);
}

function baseLedger(): FrozenCentralChinPairedDatasetLedgerFR57V1 {
  const manifest: CentralChinPairedDatasetManifestFR57V1 = {
    schemaVersion: 'fr57-central-chin-paired-dataset-manifest-v1',
    datasetRef: 'dataset-fr59-001',
    entries: [
      {
        partition: 'calibration',
        record: pairRecord({ pairRef: 'pair-fr59-cal-001', subjectId: 'subject-fr59-cal-001', captureId: 'capture-fr59-cal-001', assetLabel: 'asset-fr59-cal-001', minute: 0 }),
      },
      {
        partition: 'holdout',
        record: pairRecord({ pairRef: 'pair-fr59-holdout-001', subjectId: 'subject-fr59-holdout-001', captureId: 'capture-fr59-holdout-001', assetLabel: 'asset-fr59-holdout-001', minute: 10 }),
      },
    ],
    datasetFrozenAt: '2026-08-31T02:00:00.000Z',
    partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: true,
    fr55OutcomeVisibleDuringPartitionAssignment: false,
    datasetFrozenAfterAllPairRecordsAttested: true,
  };
  return freezeCentralChinPairedDatasetLedgerFR57(manifest);
}

const acquisitionEvidenceBundleBytes = new TextEncoder().encode('fr59 synthetic acquisition evidence bundle');
const acquisitionStatementArtifactBytes = new TextEncoder().encode('fr59 synthetic acquisition statement');
const partitionFreezeStatementArtifactBytes = new TextEncoder().encode('fr59 synthetic partition freeze statement');
const datasetFreezeStatementArtifactBytes = new TextEncoder().encode('fr59 synthetic dataset freeze statement');

function pairEvidenceBytes(index: number): Uint8Array {
  return new TextEncoder().encode(`fr59 synthetic acquisition-event evidence ${index + 1}`);
}

function pairEvidenceBytesForEventRef(acquisitionEventRef: string): Uint8Array {
  const match = /-(\d+)$/u.exec(acquisitionEventRef);
  if (!match) throw new Error(`unexpected acquisitionEventRef: ${acquisitionEventRef}`);
  return pairEvidenceBytes(Number(match[1]) - 1);
}

function baseFR58Manifest(detachedSignatureArtifactDigest: string): CentralChinPairedAcquisitionProvenanceManifestFR58V1 {
  const ledger = baseLedger();
  return {
    schemaVersion: 'fr58-central-chin-paired-acquisition-provenance-manifest-v1',
    provenanceRef: 'provenance-fr59-001',
    acquisitionProcedureRef: 'procedure.central_chin.synthetic_pair_acquisition.fr59_fixture',
    governanceAuthorityRef: 'governance.synthetic.fr59.fixture_not_external_authority',
    ledger,
    pairEvents: ledger.entries.map((entry, index) => ({
      pairRef: entry.pairRef,
      pairedRecordDigest: entry.pairedRecordDigest,
      partition: entry.partition,
      canonicalAssetDigest: entry.canonicalAssetDigest,
      acquisitionEventRef: `acquisition-event-fr59-${index + 1}`,
      acquisitionEvidenceDigest: computeCentralChinExternalProvenanceArtifactDigestFR59(pairEvidenceBytes(index)),
      acquiredAt: `2026-08-31T01:${20 + index}:00.000Z`,
    })),
    partitionAssignmentFrozenAt: '2026-08-31T01:30:00.000Z',
    fr55OutcomeFirstInspectedAt: '2026-08-31T02:10:00.000Z',
    partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: true,
    datasetMembershipFrozenBeforeFR55OutcomeInspectionAttested: true,
    fr55OutcomeVisibleBeforePartitionAndMembershipFreeze: false,
    acquisitionEvidenceBundleDigest: computeCentralChinExternalProvenanceArtifactDigestFR59(acquisitionEvidenceBundleBytes),
    acquisitionStatementArtifactDigest: computeCentralChinExternalProvenanceArtifactDigestFR59(acquisitionStatementArtifactBytes),
    partitionFreezeStatementArtifactDigest: computeCentralChinExternalProvenanceArtifactDigestFR59(partitionFreezeStatementArtifactBytes),
    datasetFreezeStatementArtifactDigest: computeCentralChinExternalProvenanceArtifactDigestFR59(datasetFreezeStatementArtifactBytes),
    detachedSignatureArtifactDigest,
    signerKeyRef: 'signer-key-fr59-synthetic-fixture',
  };
}

function publicKeyMaterial(publicKey: KeyObject): { pem: string; spkiDigest: string } {
  const pemValue = publicKey.export({ type: 'spki', format: 'pem' });
  const pem = typeof pemValue === 'string' ? pemValue : pemValue.toString('utf8');
  const der = publicKey.export({ type: 'spki', format: 'der' });
  if (typeof der === 'string') throw new Error('unexpected string SPKI export');
  return { pem, spkiDigest: computeCentralChinExternalProvenanceArtifactDigestFR59(der) };
}

function buildSignedFixture(): {
  placeholderProvenance: FrozenCentralChinPairedAcquisitionProvenanceFR58V1;
  provenance: FrozenCentralChinPairedAcquisitionProvenanceFR58V1;
  input: CentralChinExternalProvenanceVerificationInputFR59V1;
} {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const key = publicKeyMaterial(publicKey);
  const placeholderManifest = baseFR58Manifest(`sha256:${'0'.repeat(64)}`);
  const placeholderProvenance = freezeCentralChinPairedAcquisitionProvenanceFR58(placeholderManifest);
  const signaturePayload = buildCentralChinExternalProvenanceSignaturePayloadBytesFR59(placeholderProvenance);
  const detachedSignatureBytes = signMessage(null, signaturePayload, privateKey);
  const provenance = freezeCentralChinPairedAcquisitionProvenanceFR58({
    ...placeholderManifest,
    detachedSignatureArtifactDigest: computeCentralChinExternalProvenanceArtifactDigestFR59(detachedSignatureBytes),
  });
  return {
    placeholderProvenance,
    provenance,
    input: {
      schemaVersion: 'fr59-central-chin-external-provenance-verification-input-v1',
      provenance,
      pairAcquisitionEvidenceArtifacts: provenance.pairEvents.map((event) => ({
        acquisitionEventRef: event.acquisitionEventRef,
        acquisitionEvidenceBytes: pairEvidenceBytesForEventRef(event.acquisitionEventRef),
      })),
      acquisitionEvidenceBundleBytes,
      acquisitionStatementArtifactBytes,
      partitionFreezeStatementArtifactBytes,
      datasetFreezeStatementArtifactBytes,
      detachedSignatureBytes,
      signerKeyRef: provenance.signerKeyRef,
      signerPublicKeyPem: key.pem,
      declaredSignerPublicKeySpkiDigest: key.spkiDigest,
    },
  };
}

describe('FR-59 central chin external provenance byte and signature verification', () => {
  it('defines a mechanical byte/signature verification contract while all external trust and empirical promotion remains blocked', () => {
    const authority = validateCentralChinExternalProvenanceVerificationAuthorityFR59();
    expect(authority).toBe(CENTRAL_CHIN_EXTERNAL_PROVENANCE_VERIFICATION_AUTHORITY_FR59);
    expect(authority.protocol.exactFrozenFR58ProvenanceVerificationRequired).toBe(true);
    expect(authority.protocol.exactPairAcquisitionEvidenceArtifactCoverageRequired).toBe(true);
    expect(authority.protocol.pairAcquisitionEvidenceByteDigestVerificationRequired).toBe(true);
    expect(authority.protocol.recordedArtifactByteDigestVerificationRequired).toBe(true);
    expect(authority.protocol.detachedSignatureArtifactByteDigestVerificationRequired).toBe(true);
    expect(authority.protocol.researchSignatureVerificationPrimitive).toBe('ed25519_node_crypto_v1');
    expect(authority.protocol.productionSignatureAlgorithm).toBeNull();
    expect(authority.protocol.signaturePayloadExcludesDetachedSignatureArtifactDigest).toBe(true);
    expect(authority.protocol.signaturePayloadExcludesFR58ProvenanceDigest).toBe(true);
    expect(authority.protocol.signaturePayloadIncludesFR55Outcome).toBe(false);
    expect(authority.protocol.membershipThreshold).toBeNull();
    expect(authority.protocol.anchorAgreementTolerance).toBeNull();
    expect(authority.protocol.endpointSelectionRule).toBeNull();
    expect(authority.protocol.empiricalAcceptanceCriterion).toBeNull();
    expect(Object.values(authority.authorityBoundary).every((value) => value === false)).toBe(true);
  });

  it('verifies exact recorded artifact bytes and detached Ed25519 signature mathematics without establishing signer trust or a real dataset', () => {
    const fixture = buildSignedFixture();
    const report = verifyCentralChinExternalProvenanceArtifactsFR59(fixture.input);
    expect(report.exactFrozenFR58ProvenanceVerified).toBe(true);
    expect(report.pairAcquisitionEvidenceArtifactCount).toBe(fixture.provenance.pairEvents.length);
    expect(report.pairAcquisitionEvidenceByteIdentitiesVerified).toBe(true);
    expect(report.allRecordedArtifactByteIdentitiesVerified).toBe(true);
    expect(report.detachedSignatureArtifactByteIdentityVerified).toBe(true);
    expect(report.signerKeyRefExactMatchVerified).toBe(true);
    expect(report.suppliedSignerPublicKeyTypeVerified).toBe('ed25519');
    expect(report.declaredSignerPublicKeySpkiDigestExactMatchVerified).toBe(true);
    expect(report.cryptographicSignatureMathematicallyVerified).toBe(true);
    expect(report.signaturePayloadDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(report.signerKeyTrustEstablished).toBe(false);
    expect(report.externalGovernanceIdentityVerified).toBe(false);
    expect(report.provenanceTimestampExternallyVerified).toBe(false);
    expect(report.externalAcquisitionProvenanceAuthenticated).toBe(false);
    expect(report.realDatasetEstablished).toBe(false);
    expect(report.empiricalValidationAuthorized).toBe(false);
    expect(report.productionGeometryAuthorized).toBe(false);
  });

  it('breaks the FR-58 signature circularity by excluding detachedSignatureArtifactDigest and FR-58 provenanceDigest from the signed projection', () => {
    const fixture = buildSignedFixture();
    expect(fixture.placeholderProvenance.provenanceDigest).not.toBe(fixture.provenance.provenanceDigest);
    expect(fixture.placeholderProvenance.detachedSignatureArtifactDigest).not.toBe(fixture.provenance.detachedSignatureArtifactDigest);
    expect(computeCentralChinExternalProvenanceSignaturePayloadDigestFR59(fixture.placeholderProvenance)).toBe(
      computeCentralChinExternalProvenanceSignaturePayloadDigestFR59(fixture.provenance),
    );
    expect(Array.from(buildCentralChinExternalProvenanceSignaturePayloadBytesFR59(fixture.placeholderProvenance))).toEqual(
      Array.from(buildCentralChinExternalProvenanceSignaturePayloadBytesFR59(fixture.provenance)),
    );
  });

  it('still binds substantive artifact identities into the signed payload', () => {
    const fixture = buildSignedFixture();
    const changed = freezeCentralChinPairedAcquisitionProvenanceFR58({
      ...baseFR58Manifest(fixture.provenance.detachedSignatureArtifactDigest),
      acquisitionStatementArtifactDigest: computeCentralChinExternalProvenanceArtifactDigestFR59(
        new TextEncoder().encode('different acquisition statement bytes'),
      ),
    });
    expect(computeCentralChinExternalProvenanceSignaturePayloadDigestFR59(changed)).not.toBe(
      computeCentralChinExternalProvenanceSignaturePayloadDigestFR59(fixture.provenance),
    );
  });

  it('requires exact pair-level acquisition evidence coverage and verifies every pair evidence digest against actual bytes', () => {
    const fixture = buildSignedFixture();
    expect(() => verifyCentralChinExternalProvenanceArtifactsFR59({
      ...fixture.input,
      pairAcquisitionEvidenceArtifacts: fixture.input.pairAcquisitionEvidenceArtifacts.slice(0, 1),
    })).toThrow(/must cover every FR-58 acquisition event exactly once/u);

    const first = fixture.input.pairAcquisitionEvidenceArtifacts[0]!;
    const second = fixture.input.pairAcquisitionEvidenceArtifacts[1]!;
    expect(() => verifyCentralChinExternalProvenanceArtifactsFR59({
      ...fixture.input,
      pairAcquisitionEvidenceArtifacts: [first, { ...second, acquisitionEventRef: first.acquisitionEventRef }],
    })).toThrow(/must be unique/u);

    expect(() => verifyCentralChinExternalProvenanceArtifactsFR59({
      ...fixture.input,
      pairAcquisitionEvidenceArtifacts: [
        { ...first, acquisitionEvidenceBytes: new TextEncoder().encode('tampered pair evidence') },
        second,
      ],
    })).toThrow(/pair acquisition evidence .* byte digest mismatch/u);
  });

  it('rejects any recorded artifact byte mismatch before signature promotion', () => {
    const fixture = buildSignedFixture();
    expect(() => verifyCentralChinExternalProvenanceArtifactsFR59({
      ...fixture.input,
      acquisitionEvidenceBundleBytes: new TextEncoder().encode('tampered bundle'),
    })).toThrow(/acquisitionEvidenceBundleDigest byte digest mismatch/u);
  });

  it('rejects detached signature artifact byte mismatch against the exact FR-58 record', () => {
    const fixture = buildSignedFixture();
    const tampered = Uint8Array.from(fixture.input.detachedSignatureBytes);
    tampered[0] = (tampered[0] ?? 0) ^ 1;
    expect(() => verifyCentralChinExternalProvenanceArtifactsFR59({ ...fixture.input, detachedSignatureBytes: tampered }))
      .toThrow(/detachedSignatureArtifactDigest byte digest mismatch/u);
  });

  it('rejects a mathematically invalid signature even when the FR-58 signature-artifact digest matches those exact invalid bytes', () => {
    const fixture = buildSignedFixture();
    const invalidSignature = Uint8Array.from(fixture.input.detachedSignatureBytes);
    invalidSignature[1] = (invalidSignature[1] ?? 0) ^ 1;
    const provenance = freezeCentralChinPairedAcquisitionProvenanceFR58({
      ...baseFR58Manifest(computeCentralChinExternalProvenanceArtifactDigestFR59(invalidSignature)),
    });
    expect(() => verifyCentralChinExternalProvenanceArtifactsFR59({
      ...fixture.input,
      provenance,
      detachedSignatureBytes: invalidSignature,
      signerKeyRef: provenance.signerKeyRef,
    })).toThrow(/signature does not verify/u);
  });

  it('rejects signer-key reference drift and public-key SPKI declaration drift', () => {
    const fixture = buildSignedFixture();
    expect(() => verifyCentralChinExternalProvenanceArtifactsFR59({ ...fixture.input, signerKeyRef: 'other-key-ref' }))
      .toThrow(/signerKeyRef must exactly match/u);
    expect(() => verifyCentralChinExternalProvenanceArtifactsFR59({
      ...fixture.input,
      declaredSignerPublicKeySpkiDigest: `sha256:${'f'.repeat(64)}`,
    })).toThrow(/SPKI digest does not match/u);
  });

  it('rejects a non-Ed25519 public key because the algorithm is only the explicitly scoped FR-59 research verification primitive', () => {
    const fixture = buildSignedFixture();
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const key = publicKeyMaterial(publicKey);
    expect(() => verifyCentralChinExternalProvenanceArtifactsFR59({
      ...fixture.input,
      signerPublicKeyPem: key.pem,
      declaredSignerPublicKeySpkiDigest: key.spkiDigest,
    })).toThrow(/requires an Ed25519 public key/u);
  });

  it('does not treat a different supplied Ed25519 key as trusted merely because its self-declared SPKI digest is internally consistent', () => {
    const fixture = buildSignedFixture();
    const { publicKey } = generateKeyPairSync('ed25519');
    const key = publicKeyMaterial(publicKey);
    expect(() => verifyCentralChinExternalProvenanceArtifactsFR59({
      ...fixture.input,
      signerPublicKeyPem: key.pem,
      declaredSignerPublicKeySpkiDigest: key.spkiDigest,
    })).toThrow(/signature does not verify/u);
  });

  it('reports mechanical verification readiness separately from external authentication and production readiness', () => {
    const missing = assessCentralChinExternalProvenanceVerificationReadinessFR59(null);
    expect(missing.verificationReportPresent).toBe(false);
    expect(missing.blockers).toContain('recorded_artifact_byte_identity_not_verified');
    expect(missing.blockers).toContain('detached_signature_math_not_verified');

    const fixture = buildSignedFixture();
    const report = verifyCentralChinExternalProvenanceArtifactsFR59(fixture.input);
    const readiness = assessCentralChinExternalProvenanceVerificationReadinessFR59(report);
    expect(readiness.verificationReportPresent).toBe(true);
    expect(readiness.artifactByteIdentityVerified).toBe(true);
    expect(readiness.mathematicalSignatureVerified).toBe(true);
    expect(readiness.externalAcquisitionProvenanceAuthenticated).toBe(false);
    expect(readiness.realPairedEvidenceDatasetEstablished).toBe(false);
    expect(readiness.blockers).toContain('signer_key_trust_not_established');
    expect(readiness.blockers).toContain('pinned_external_trust_root_missing');
    expect(readiness.blockers).toContain('artifact_semantic_contents_not_externally_verified');
  });

  it('keeps production geometry fail-closed even after synthetic byte/signature verification passes', () => {
    const fixture = buildSignedFixture();
    const report = verifyCentralChinExternalProvenanceArtifactsFR59(fixture.input);
    expect(report.productionGeometryAuthorized).toBe(false);
    expect(() => assertCentralChinExternalProvenanceReadyForProductionFR59()).toThrow(/trusted signer\/governance identity/u);
  });
});
