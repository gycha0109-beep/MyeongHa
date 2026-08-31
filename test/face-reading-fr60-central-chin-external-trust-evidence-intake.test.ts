import { generateKeyPairSync, sign as signMessage, type KeyObject } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CENTRAL_CHIN_EXTERNAL_TRUST_EVIDENCE_INTAKE_AUTHORITY_FR60,
  assessCentralChinExternalTrustEvidenceReadinessFR60,
  assertCentralChinExternalTrustEvidenceReadyForProductionFR60,
  buildCentralChinExternalProvenanceSignaturePayloadBytesFR59,
  computeCentralChinExternalProvenanceArtifactDigestFR59,
  computeCentralChinExternalTrustEvidenceCandidateArtifactDigestFR60,
  computeCentralChinSourceAssetDigestFR56,
  freezeCentralChinExternalTrustEvidenceCandidateBundleFR60,
  freezeCentralChinPairedAcquisitionProvenanceFR58,
  freezeCentralChinPairedDatasetLedgerFR57,
  freezeCentralChinPairedEvidenceRecordFR56,
  validateCentralChinExternalTrustEvidenceIntakeAuthorityFR60,
  verifyFrozenCentralChinExternalTrustEvidenceCandidateBundleFR60,
  type CentralChinExternalProvenanceVerificationInputFR59V1,
  type CentralChinExternalTrustEvidenceCandidateInputFR60V1,
  type CentralChinInferiorReferenceTraceAnnotationFR54V1,
  type CentralChinPairedAcquisitionProvenanceManifestFR58V1,
  type CentralChinPairedDatasetManifestFR57V1,
  type FrozenCentralChinExternalTrustEvidenceCandidateBundleFR60V1,
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
    datasetRef: 'dataset-fr60-001',
    entries: [
      {
        partition: 'calibration',
        record: pairRecord({ pairRef: 'pair-fr60-cal-001', subjectId: 'subject-fr60-cal-001', captureId: 'capture-fr60-cal-001', assetLabel: 'asset-fr60-cal-001', minute: 0 }),
      },
      {
        partition: 'holdout',
        record: pairRecord({ pairRef: 'pair-fr60-holdout-001', subjectId: 'subject-fr60-holdout-001', captureId: 'capture-fr60-holdout-001', assetLabel: 'asset-fr60-holdout-001', minute: 10 }),
      },
    ],
    datasetFrozenAt: '2026-08-31T02:00:00.000Z',
    partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: true,
    fr55OutcomeVisibleDuringPartitionAssignment: false,
    datasetFrozenAfterAllPairRecordsAttested: true,
  };
  return freezeCentralChinPairedDatasetLedgerFR57(manifest);
}

const acquisitionEvidenceBundleBytes = new TextEncoder().encode('fr60 synthetic acquisition evidence bundle');
const acquisitionStatementArtifactBytes = new TextEncoder().encode('fr60 synthetic acquisition statement');
const partitionFreezeStatementArtifactBytes = new TextEncoder().encode('fr60 synthetic partition freeze statement');
const datasetFreezeStatementArtifactBytes = new TextEncoder().encode('fr60 synthetic dataset freeze statement');

function pairEvidenceBytes(index: number): Uint8Array {
  return new TextEncoder().encode(`fr60 synthetic acquisition-event evidence ${index + 1}`);
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
    provenanceRef: 'provenance-fr60-001',
    acquisitionProcedureRef: 'procedure.central_chin.synthetic_pair_acquisition.fr60_fixture',
    governanceAuthorityRef: 'governance.synthetic.fr60.fixture_not_external_authority',
    ledger,
    pairEvents: ledger.entries.map((entry, index) => ({
      pairRef: entry.pairRef,
      pairedRecordDigest: entry.pairedRecordDigest,
      partition: entry.partition,
      canonicalAssetDigest: entry.canonicalAssetDigest,
      acquisitionEventRef: `acquisition-event-fr60-${index + 1}`,
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
    signerKeyRef: 'signer-key-fr60-synthetic-fixture',
  };
}

function publicKeyMaterial(publicKey: KeyObject): { pem: string; spkiDigest: string } {
  const pemValue = publicKey.export({ type: 'spki', format: 'pem' });
  const pem = typeof pemValue === 'string' ? pemValue : pemValue.toString('utf8');
  const der = publicKey.export({ type: 'spki', format: 'der' });
  if (typeof der === 'string') throw new Error('unexpected string SPKI export');
  return { pem, spkiDigest: computeCentralChinExternalProvenanceArtifactDigestFR59(der) };
}

function buildFR59Input(): CentralChinExternalProvenanceVerificationInputFR59V1 {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const key = publicKeyMaterial(publicKey);
  const placeholderManifest = baseFR58Manifest(`sha256:${'0'.repeat(64)}`);
  const placeholderProvenance = freezeCentralChinPairedAcquisitionProvenanceFR58(placeholderManifest);
  const detachedSignatureBytes = signMessage(null, buildCentralChinExternalProvenanceSignaturePayloadBytesFR59(placeholderProvenance), privateKey);
  const provenance = freezeCentralChinPairedAcquisitionProvenanceFR58({
    ...placeholderManifest,
    detachedSignatureArtifactDigest: computeCentralChinExternalProvenanceArtifactDigestFR59(detachedSignatureBytes),
  });
  return {
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
  };
}

const signerIdentityBytes = new TextEncoder().encode('fr60 synthetic signer identity claim; not authenticated');
const keyProvenanceBytes = new TextEncoder().encode('fr60 synthetic key provenance claim; not authenticated');
const rootCandidateBytes = new TextEncoder().encode('fr60 synthetic trust-root candidate; not trusted');

function baseInput(artifactOrder: readonly (0 | 1 | 2)[] = [0, 1, 2]): CentralChinExternalTrustEvidenceCandidateInputFR60V1 {
  const candidates = [
    {
      artifactRef: 'trust-evidence-fr60-signer-identity',
      evidenceKindRef: 'evidence.kind.signer_identity_claim.synthetic_fixture',
      declaredDigest: computeCentralChinExternalTrustEvidenceCandidateArtifactDigestFR60(signerIdentityBytes),
      bytes: signerIdentityBytes,
      claimedIssuerRef: 'issuer.synthetic.fr60.not_verified',
      claimedSubjectRef: 'subject.synthetic.signer.fr60.not_verified',
    },
    {
      artifactRef: 'trust-evidence-fr60-key-provenance',
      evidenceKindRef: 'evidence.kind.signer_key_provenance_claim.synthetic_fixture',
      declaredDigest: computeCentralChinExternalTrustEvidenceCandidateArtifactDigestFR60(keyProvenanceBytes),
      bytes: keyProvenanceBytes,
      claimedIssuerRef: 'issuer.synthetic.fr60.not_verified',
      claimedSubjectRef: 'subject.synthetic.signer-key.fr60.not_verified',
    },
    {
      artifactRef: 'trust-evidence-fr60-root-candidate',
      evidenceKindRef: 'evidence.kind.trust_root_candidate.synthetic_fixture',
      declaredDigest: computeCentralChinExternalTrustEvidenceCandidateArtifactDigestFR60(rootCandidateBytes),
      bytes: rootCandidateBytes,
      claimedIssuerRef: null,
      claimedSubjectRef: 'subject.synthetic.trust-root.fr60.not_verified',
    },
  ] as const;
  return {
    schemaVersion: 'fr60-central-chin-external-trust-evidence-candidate-input-v1',
    fr59VerificationInput: buildFR59Input(),
    evidenceBundleRef: 'trust-evidence-bundle-fr60-synthetic-001',
    evidenceArtifacts: artifactOrder.map((index) => candidates[index]),
    frozenAt: '2026-08-31T03:00:00.000Z',
  };
}

function mutableClone<T>(value: T): T {
  return structuredClone(value);
}

describe('FR-60 central chin external trust-evidence candidate intake/freeze', () => {
  it('defines candidate-byte intake only while every external trust and production boundary stays fail-closed', () => {
    const authority = validateCentralChinExternalTrustEvidenceIntakeAuthorityFR60();
    expect(authority).toBe(CENTRAL_CHIN_EXTERNAL_TRUST_EVIDENCE_INTAKE_AUTHORITY_FR60);
    expect(authority.protocol.exactFR59MechanicalVerificationRequiredAtIntake).toBe(true);
    expect(authority.protocol.candidateEvidenceDeclaredDigestExactMatchRequired).toBe(true);
    expect(authority.protocol.candidateEvidenceArtifactRefUniqueRequired).toBe(true);
    expect(authority.protocol.candidateEvidenceInputOrderDefinesBundleIdentity).toBe(false);
    expect(authority.protocol.frozenArtifactRetainsCandidateEvidenceBytes).toBe(false);
    expect(authority.protocol.frozenArtifactRetainsSignerPublicKeyPem).toBe(false);
    expect(authority.protocol.frozenVerifierReperformsFR59MechanicalVerification).toBe(false);
    expect(authority.protocol.minimumCandidateArtifactsForTrustSufficiency).toBeNull();
    expect(authority.protocol.requiredReviewerCredential).toBeNull();
    expect(authority.protocol.acceptedTrustRootType).toBeNull();
    expect(authority.protocol.trustedTimestampMechanism).toBeNull();
    expect(authority.protocol.externalTrustAcceptanceCriterion).toBeNull();
    expect(Object.values(authority.authorityBoundary).every((value) => value === false)).toBe(true);
  });

  it('re-executes FR-59, verifies exact candidate bytes, freezes only digests/claims, and does not establish trust', () => {
    const input = baseInput();
    const bundle = freezeCentralChinExternalTrustEvidenceCandidateBundleFR60(input);
    expect(bundle.fr59AllRecordedArtifactByteIdentitiesVerified).toBe(true);
    expect(bundle.fr59CryptographicSignatureMathematicallyVerified).toBe(true);
    expect(bundle.candidateEvidenceBytesVerifiedAtIntake).toBe(true);
    expect(bundle.candidateEvidenceBundleFrozen).toBe(true);
    expect(bundle.candidateEvidenceArtifactCount).toBe(3);
    expect(bundle.candidateEvidenceBundleDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(bundle.evidenceArtifacts.map((artifact) => artifact.artifactRef)).toEqual([
      'trust-evidence-fr60-key-provenance',
      'trust-evidence-fr60-root-candidate',
      'trust-evidence-fr60-signer-identity',
    ]);
    expect('bytes' in bundle.evidenceArtifacts[0]!).toBe(false);
    expect('signerPublicKeyPem' in bundle).toBe(false);
    expect(bundle.fr59MechanicalVerificationPerformedAtIntake).toBe(true);
    expect(bundle.fr59MechanicalVerificationReperformedByFrozenVerifier).toBe(false);
    expect(bundle.candidateMetadataClaimsExternallyAuthenticated).toBe(false);
    expect(bundle.signerKeyTrustEstablished).toBe(false);
    expect(bundle.pinnedExternalTrustRootAvailable).toBe(false);
    expect(bundle.externalGovernanceIdentityVerified).toBe(false);
    expect(bundle.reviewerCredentialVerified).toBe(false);
    expect(bundle.trustedTimestampAuthorityVerified).toBe(false);
    expect(bundle.externalAcquisitionProvenanceAuthenticated).toBe(false);
    expect(bundle.realDatasetEstablished).toBe(false);
    expect(bundle.productionGeometryAuthorized).toBe(false);
  });

  it('makes candidate input order irrelevant to the frozen bundle identity', () => {
    const first = baseInput([0, 1, 2]);
    const second = { ...baseInput([2, 0, 1]), fr59VerificationInput: first.fr59VerificationInput };
    const a = freezeCentralChinExternalTrustEvidenceCandidateBundleFR60(first);
    const b = freezeCentralChinExternalTrustEvidenceCandidateBundleFR60(second);
    expect(b.evidenceArtifacts).toEqual(a.evidenceArtifacts);
    expect(b.candidateEvidenceBundleDigest).toBe(a.candidateEvidenceBundleDigest);
  });

  it('rejects candidate evidence bytes that do not match the declared digest', () => {
    const input = baseInput();
    const cloned = mutableClone(input);
    const bad: CentralChinExternalTrustEvidenceCandidateInputFR60V1 = {
      ...cloned,
      evidenceArtifacts: cloned.evidenceArtifacts.map((artifact, index) => index === 0
        ? { ...artifact, bytes: new TextEncoder().encode('tampered candidate evidence') }
        : artifact),
    };
    expect(() => freezeCentralChinExternalTrustEvidenceCandidateBundleFR60(bad)).toThrow(/byte digest mismatch/u);
  });

  it('rejects duplicate candidate artifact refs without inventing digest independence rules', () => {
    const input = baseInput();
    const cloned = mutableClone(input);
    const bad: CentralChinExternalTrustEvidenceCandidateInputFR60V1 = {
      ...cloned,
      evidenceArtifacts: cloned.evidenceArtifacts.map((artifact, index) => index === 1
        ? { ...artifact, artifactRef: cloned.evidenceArtifacts[0]!.artifactRef }
        : artifact),
    };
    expect(() => freezeCentralChinExternalTrustEvidenceCandidateBundleFR60(bad)).toThrow(/artifactRef .* unique/u);
  });

  it('allows shared bytes across distinct candidate refs because byte reuse is not evidence independence', () => {
    const input = baseInput();
    const shared = signerIdentityBytes;
    const digest = computeCentralChinExternalTrustEvidenceCandidateArtifactDigestFR60(shared);
    const adjusted: CentralChinExternalTrustEvidenceCandidateInputFR60V1 = {
      ...input,
      evidenceArtifacts: input.evidenceArtifacts.map((artifact, index) => index === 1 ? { ...artifact, bytes: shared, declaredDigest: digest } : artifact),
    };
    const bundle = freezeCentralChinExternalTrustEvidenceCandidateBundleFR60(adjusted);
    const keyEvidence = bundle.evidenceArtifacts.find((artifact) => artifact.artifactRef === 'trust-evidence-fr60-key-provenance');
    const signerEvidence = bundle.evidenceArtifacts.find((artifact) => artifact.artifactRef === 'trust-evidence-fr60-signer-identity');
    expect(keyEvidence?.artifactDigest).toBe(signerEvidence?.artifactDigest);
    expect(bundle.signerKeyTrustEstablished).toBe(false);
  });

  it('rejects undeclared caller-controlled trust fields at the top level', () => {
    const input = baseInput();
    const bad = { ...input, trusted: true } as unknown as CentralChinExternalTrustEvidenceCandidateInputFR60V1;
    expect(() => freezeCentralChinExternalTrustEvidenceCandidateBundleFR60(bad)).toThrow(/undeclared trust\/authority flags are forbidden/u);
  });

  it('rejects undeclared caller-controlled trust fields inside an evidence artifact', () => {
    const input = baseInput();
    const bad = {
      ...input,
      evidenceArtifacts: input.evidenceArtifacts.map((artifact, index) => index === 0 ? { ...artifact, trustedReviewer: true } : artifact),
    } as unknown as CentralChinExternalTrustEvidenceCandidateInputFR60V1;
    expect(() => freezeCentralChinExternalTrustEvidenceCandidateBundleFR60(bad)).toThrow(/undeclared trust\/authority flags are forbidden/u);
  });

  it('fails before freezing candidate evidence when the supplied FR-59 key material no longer matches its declared SPKI digest', () => {
    const input = baseInput();
    const replacement = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
    const bad: CentralChinExternalTrustEvidenceCandidateInputFR60V1 = {
      ...input,
      fr59VerificationInput: {
        ...input.fr59VerificationInput,
        signerPublicKeyPem: typeof replacement === 'string' ? replacement : replacement.toString('utf8'),
      },
    };
    expect(() => freezeCentralChinExternalTrustEvidenceCandidateBundleFR60(bad)).toThrow(/SPKI digest/u);
  });

  it('does not promote arbitrary claimed issuer or subject refs to authenticated identity', () => {
    const input = baseInput();
    const exaggerated: CentralChinExternalTrustEvidenceCandidateInputFR60V1 = {
      ...input,
      evidenceArtifacts: input.evidenceArtifacts.map((artifact) => ({
        ...artifact,
        claimedIssuerRef: 'claimed.world_root_authority.this_string_is_not_authentication',
        claimedSubjectRef: 'claimed.trusted_signer.this_string_is_not_authentication',
      })),
    };
    const bundle = freezeCentralChinExternalTrustEvidenceCandidateBundleFR60(exaggerated);
    expect(bundle.candidateMetadataClaimsExternallyAuthenticated).toBe(false);
    expect(bundle.signerKeyTrustEstablished).toBe(false);
    expect(bundle.externalGovernanceIdentityVerified).toBe(false);
  });

  it('rejects persisted frozen-bundle metadata tampering by digest mismatch', () => {
    const bundle = freezeCentralChinExternalTrustEvidenceCandidateBundleFR60(baseInput());
    const tampered = mutableClone(bundle) as FrozenCentralChinExternalTrustEvidenceCandidateBundleFR60V1;
    (tampered.evidenceArtifacts[0] as { claimedIssuerRef: string | null }).claimedIssuerRef = 'issuer.tampered';
    expect(() => verifyFrozenCentralChinExternalTrustEvidenceCandidateBundleFR60(tampered)).toThrow(/candidateEvidenceBundleDigest mismatch/u);
  });

  it('rejects reordered persisted artifacts even when the old bundle digest is retained', () => {
    const bundle = freezeCentralChinExternalTrustEvidenceCandidateBundleFR60(baseInput());
    const tampered = mutableClone(bundle) as FrozenCentralChinExternalTrustEvidenceCandidateBundleFR60V1;
    (tampered as { evidenceArtifacts: typeof tampered.evidenceArtifacts }).evidenceArtifacts = [...tampered.evidenceArtifacts].reverse();
    expect(() => verifyFrozenCentralChinExternalTrustEvidenceCandidateBundleFR60(tampered)).toThrow(/canonical artifactRef order/u);
  });

  it('rejects undeclared authority fields added to a persisted frozen bundle', () => {
    const bundle = freezeCentralChinExternalTrustEvidenceCandidateBundleFR60(baseInput());
    const bad = { ...mutableClone(bundle), trusted: true } as unknown as FrozenCentralChinExternalTrustEvidenceCandidateBundleFR60V1;
    expect(() => verifyFrozenCentralChinExternalTrustEvidenceCandidateBundleFR60(bad)).toThrow(/undeclared trust\/authority flags are forbidden/u);
  });

  it('keeps readiness research-only and the production gate unconditionally fail-closed', () => {
    const missing = assessCentralChinExternalTrustEvidenceReadinessFR60(null);
    expect(missing.candidateEvidenceBundlePresent).toBe(false);
    expect(missing.externalTrustEstablished).toBe(false);
    expect(missing.blockers).toContain('candidate_external_trust_evidence_bundle_missing');

    const bundle = freezeCentralChinExternalTrustEvidenceCandidateBundleFR60(baseInput());
    const ready = assessCentralChinExternalTrustEvidenceReadinessFR60(bundle);
    expect(ready.candidateEvidenceBundlePresent).toBe(true);
    expect(ready.candidateEvidenceBytesVerifiedAtIntake).toBe(true);
    expect(ready.externalTrustEstablished).toBe(false);
    expect(ready.realPairedEvidenceDatasetEstablished).toBe(false);
    expect(ready.productionGeometryReady).toBe(false);
    expect(ready.blockers).toContain('candidate_evidence_is_not_authenticated_trust');
    expect(() => assertCentralChinExternalTrustEvidenceReadyForProductionFR60()).toThrow(/remain blocked/u);
  });
});
