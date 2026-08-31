import { describe, expect, it } from 'vitest';
import {
  CENTRAL_CHIN_PAIRED_ACQUISITION_PROVENANCE_AUTHORITY_FR58,
  assessCentralChinPairedAcquisitionProvenanceReadinessFR58,
  assertCentralChinPairedAcquisitionProvenanceReadyForProductionFR58,
  computeCentralChinPairedAcquisitionProvenanceDigestFR58,
  computeCentralChinSourceAssetDigestFR56,
  freezeCentralChinPairedAcquisitionProvenanceFR58,
  freezeCentralChinPairedDatasetLedgerFR57,
  freezeCentralChinPairedEvidenceRecordFR56,
  validateCentralChinPairedAcquisitionProvenanceAuthorityFR58,
  validateCentralChinPairedAcquisitionProvenanceManifestFR58,
  verifyFrozenCentralChinPairedAcquisitionProvenanceFR58,
  type CentralChinInferiorReferenceTraceAnnotationFR54V1,
  type CentralChinPairedAcquisitionProvenanceAuthorityFR58V1,
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

function digest(label: string): string {
  return computeCentralChinSourceAssetDigestFR56(new TextEncoder().encode(label));
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
    datasetRef: 'dataset-fr58-001',
    entries: [
      {
        partition: 'calibration',
        record: pairRecord({ pairRef: 'pair-fr58-cal-001', subjectId: 'subject-fr58-cal-001', captureId: 'capture-fr58-cal-001', assetLabel: 'asset-fr58-cal-001', minute: 0 }),
      },
      {
        partition: 'holdout',
        record: pairRecord({ pairRef: 'pair-fr58-holdout-001', subjectId: 'subject-fr58-holdout-001', captureId: 'capture-fr58-holdout-001', assetLabel: 'asset-fr58-holdout-001', minute: 10 }),
      },
    ],
    datasetFrozenAt: '2026-08-31T02:00:00.000Z',
    partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: true,
    fr55OutcomeVisibleDuringPartitionAssignment: false,
    datasetFrozenAfterAllPairRecordsAttested: true,
  };
  return freezeCentralChinPairedDatasetLedgerFR57(manifest);
}

function baseManifest(): CentralChinPairedAcquisitionProvenanceManifestFR58V1 {
  const ledger = baseLedger();
  return {
    schemaVersion: 'fr58-central-chin-paired-acquisition-provenance-manifest-v1',
    provenanceRef: 'provenance-fr58-001',
    acquisitionProcedureRef: 'procedure.central_chin.real_pair_acquisition.v1',
    governanceAuthorityRef: 'governance.external.research.operator.placeholder',
    ledger,
    pairEvents: ledger.entries.map((entry, index) => ({
      pairRef: entry.pairRef,
      pairedRecordDigest: entry.pairedRecordDigest,
      partition: entry.partition,
      canonicalAssetDigest: entry.canonicalAssetDigest,
      acquisitionEventRef: `acquisition-event-fr58-${index + 1}`,
      acquisitionEvidenceDigest: digest(`acquisition-evidence-fr58-${index + 1}`),
      acquiredAt: `2026-08-31T01:${20 + index}:00.000Z`,
    })),
    partitionAssignmentFrozenAt: '2026-08-31T01:30:00.000Z',
    fr55OutcomeFirstInspectedAt: '2026-08-31T02:10:00.000Z',
    partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: true,
    datasetMembershipFrozenBeforeFR55OutcomeInspectionAttested: true,
    fr55OutcomeVisibleBeforePartitionAndMembershipFreeze: false,
    acquisitionEvidenceBundleDigest: digest('fr58-acquisition-bundle'),
    acquisitionStatementArtifactDigest: digest('fr58-acquisition-statement'),
    partitionFreezeStatementArtifactDigest: digest('fr58-partition-freeze-statement'),
    datasetFreezeStatementArtifactDigest: digest('fr58-dataset-freeze-statement'),
    detachedSignatureArtifactDigest: digest('fr58-detached-signature'),
    signerKeyRef: 'signer-key-fr58-placeholder',
  };
}

describe('FR-58 central chin paired acquisition provenance', () => {
  it('defines exact FR-57 binding and chronology guards while empirical parameters remain unresolved', () => {
    const authority = validateCentralChinPairedAcquisitionProvenanceAuthorityFR58();
    expect(authority).toBe(CENTRAL_CHIN_PAIRED_ACQUISITION_PROVENANCE_AUTHORITY_FR58);
    expect(authority.protocol.exactFrozenFR57LedgerVerificationRequired).toBe(true);
    expect(authority.protocol.oneAcquisitionEventPerFR57PairRequired).toBe(true);
    expect(authority.protocol.exactPairIdentityBindingRequired).toBe(true);
    expect(authority.protocol.provenanceDigestIncludesFR55Outcome).toBe(false);
    expect(authority.protocol.partitionAllocationRule).toBeNull();
    expect(authority.protocol.calibrationFraction).toBeNull();
    expect(authority.protocol.minimumPairs).toBeNull();
    expect(authority.protocol.minimumSubjects).toBeNull();
    expect(authority.protocol.membershipThreshold).toBeNull();
    expect(authority.protocol.anchorAgreementTolerance).toBeNull();
    expect(authority.protocol.endpointSelectionRule).toBeNull();
    expect(authority.protocol.empiricalAcceptanceCriterion).toBeNull();
    expect(Object.values(authority.authorityBoundary).every((value) => value === false)).toBe(true);
  });

  it('freezes deterministic provenance exactly bound to the verified FR-57 ledger without empirical promotion', () => {
    const manifest = baseManifest();
    const frozen = freezeCentralChinPairedAcquisitionProvenanceFR58(manifest);
    expect(frozen.datasetRef).toBe(manifest.ledger.datasetRef);
    expect(frozen.datasetDigest).toBe(manifest.ledger.datasetDigest);
    expect(frozen.pairEventCount).toBe(manifest.ledger.entries.length);
    expect(frozen.provenanceDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(frozen.provenanceDigestIncludesFR55Outcome).toBe(false);
    expect(frozen.externalAcquisitionProvenanceAuthenticated).toBe(false);
    expect(frozen.realDatasetEstablished).toBe(false);
    expect(frozen.empiricalValidationAuthorized).toBe(false);
    expect(verifyFrozenCentralChinPairedAcquisitionProvenanceFR58(frozen)).toBe(frozen);
  });

  it('requires exact one-to-one acquisition coverage of every FR-57 pair', () => {
    const manifest = baseManifest();
    expect(() => validateCentralChinPairedAcquisitionProvenanceManifestFR58({
      ...manifest,
      pairEvents: manifest.pairEvents.slice(0, 1),
    })).toThrow(/exactly one acquisition event per FR-57 ledger pair/u);
  });

  it('rejects pair identity drift against the frozen FR-57 ledger', () => {
    const manifest = baseManifest();
    const first = manifest.pairEvents[0]!;
    expect(() => validateCentralChinPairedAcquisitionProvenanceManifestFR58({
      ...manifest,
      pairEvents: [{ ...first, canonicalAssetDigest: digest('wrong-asset') }, ...manifest.pairEvents.slice(1)],
    })).toThrow(/must exactly bind pairedRecordDigest, partition, and canonicalAssetDigest/u);
  });

  it('rejects duplicate acquisition event references while allowing a shared batch evidence artifact', () => {
    const manifest = baseManifest();
    const first = manifest.pairEvents[0]!;
    const second = manifest.pairEvents[1]!;
    expect(() => validateCentralChinPairedAcquisitionProvenanceManifestFR58({
      ...manifest,
      pairEvents: [first, { ...second, acquisitionEventRef: first.acquisitionEventRef }],
    })).toThrow(/acquisitionEventRef .* must be unique/u);
    const sharedEvidence = {
      ...manifest,
      pairEvents: [first, { ...second, acquisitionEvidenceDigest: first.acquisitionEvidenceDigest }],
    };
    expect(validateCentralChinPairedAcquisitionProvenanceManifestFR58(sharedEvidence)).toBe(sharedEvidence);
  });

  it('enforces FR56 pair freeze <= acquisition <= partition freeze <= dataset freeze', () => {
    const manifest = baseManifest();
    const first = manifest.pairEvents[0]!;
    expect(() => validateCentralChinPairedAcquisitionProvenanceManifestFR58({
      ...manifest,
      pairEvents: [{ ...first, acquiredAt: '2026-08-31T00:59:00.000Z' }, ...manifest.pairEvents.slice(1)],
    })).toThrow(/cannot be acquired before its FR-56 pair freeze/u);
    expect(() => validateCentralChinPairedAcquisitionProvenanceManifestFR58({
      ...manifest,
      pairEvents: [{ ...first, acquiredAt: '2026-08-31T01:31:00.000Z' }, ...manifest.pairEvents.slice(1)],
    })).toThrow(/cannot be acquired after partition assignment freeze/u);
    expect(() => validateCentralChinPairedAcquisitionProvenanceManifestFR58({
      ...manifest,
      partitionAssignmentFrozenAt: '2026-08-31T02:01:00.000Z',
    })).toThrow(/partition assignment freeze cannot occur after the FR-57 dataset freeze/u);
  });

  it('rejects FR-55 outcome inspection preceding completed dataset membership freeze', () => {
    expect(() => validateCentralChinPairedAcquisitionProvenanceManifestFR58({
      ...baseManifest(),
      fr55OutcomeFirstInspectedAt: '2026-08-31T01:59:59.000Z',
    })).toThrow(/FR-55 outcome inspection cannot precede completed dataset membership freeze/u);
  });

  it('binds optional first FR-55 inspection chronology into provenance identity without including outcome values', () => {
    const manifest = baseManifest();
    const laterInspection = { ...manifest, fr55OutcomeFirstInspectedAt: '2026-08-31T02:11:00.000Z' };
    expect(computeCentralChinPairedAcquisitionProvenanceDigestFR58(laterInspection)).not.toBe(
      computeCentralChinPairedAcquisitionProvenanceDigestFR58(manifest),
    );
    expect(CENTRAL_CHIN_PAIRED_ACQUISITION_PROVENANCE_AUTHORITY_FR58.protocol.provenanceDigestIncludesFR55Outcome).toBe(false);
  });

  it('accepts an uninspected dataset while preserving required blindness attestations', () => {
    const manifest = { ...baseManifest(), fr55OutcomeFirstInspectedAt: null };
    expect(validateCentralChinPairedAcquisitionProvenanceManifestFR58(manifest)).toBe(manifest);
  });

  it('requires explicit outcome-blind partition and membership freeze attestations', () => {
    const manifest = baseManifest();
    expect(() => validateCentralChinPairedAcquisitionProvenanceManifestFR58({
      ...manifest,
      partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: false as true,
    })).toThrow(/outcome-blind partition and dataset-membership freeze attestations/u);
    expect(() => validateCentralChinPairedAcquisitionProvenanceManifestFR58({
      ...manifest,
      datasetMembershipFrozenBeforeFR55OutcomeInspectionAttested: false as true,
    })).toThrow(/outcome-blind partition and dataset-membership freeze attestations/u);
    expect(() => validateCentralChinPairedAcquisitionProvenanceManifestFR58({
      ...manifest,
      fr55OutcomeVisibleBeforePartitionAndMembershipFreeze: true as false,
    })).toThrow(/outcome-blind partition and dataset-membership freeze attestations/u);
  });

  it('normalizes caller pair-event order but rejects reordered frozen artifact representation', () => {
    const manifest = baseManifest();
    const reversed = { ...manifest, pairEvents: [...manifest.pairEvents].reverse() };
    expect(computeCentralChinPairedAcquisitionProvenanceDigestFR58(reversed)).toBe(
      computeCentralChinPairedAcquisitionProvenanceDigestFR58(manifest),
    );
    const frozen = freezeCentralChinPairedAcquisitionProvenanceFR58(manifest);
    const tampered = {
      ...frozen,
      pairEvents: [...frozen.pairEvents].reverse(),
    } as FrozenCentralChinPairedAcquisitionProvenanceFR58V1;
    expect(() => verifyFrozenCentralChinPairedAcquisitionProvenanceFR58(tampered)).toThrow(/content or digest drift/u);
  });

  it('changes provenance identity when evidence artifacts change without treating them as authenticated', () => {
    const manifest = baseManifest();
    const changed = {
      ...manifest,
      acquisitionStatementArtifactDigest: digest('fr58-acquisition-statement-changed'),
    };
    expect(computeCentralChinPairedAcquisitionProvenanceDigestFR58(changed)).not.toBe(
      computeCentralChinPairedAcquisitionProvenanceDigestFR58(manifest),
    );
    const frozen = freezeCentralChinPairedAcquisitionProvenanceFR58(changed);
    expect(frozen.externalGovernanceIdentityVerified).toBe(false);
    expect(frozen.acquisitionEvidenceBundleContentExternallyVerified).toBe(false);
    expect(frozen.cryptographicSignatureVerified).toBe(false);
    expect(frozen.signerKeyTrustEstablished).toBe(false);
    expect(frozen.provenanceTimestampExternallyVerified).toBe(false);
    expect(frozen.externalAcquisitionProvenanceAuthenticated).toBe(false);
  });

  it('reports structural provenance readiness while preserving external-authentication and empirical blockers', () => {
    const missing = assessCentralChinPairedAcquisitionProvenanceReadinessFR58(null);
    expect(missing.provenanceManifestPresent).toBe(false);
    expect(missing.blockers).toContain('acquisition_provenance_manifest_missing');

    const ready = assessCentralChinPairedAcquisitionProvenanceReadinessFR58(baseManifest());
    expect(ready.provenanceManifestPresent).toBe(true);
    expect(ready.pairCoveragePresent).toBe(true);
    expect(ready.outcomeBlindFreezeAttested).toBe(true);
    expect(ready.externalAcquisitionProvenanceAuthenticated).toBe(false);
    expect(ready.realPairedEvidenceDatasetEstablished).toBe(false);
    expect(ready.blockers).toContain('real_paired_evidence_not_authenticated');
    expect(ready.blockers).toContain('empirical_acceptance_rules_unreviewed');
  });

  it('fails closed for production and rejects authority promotion', () => {
    expect(() => assertCentralChinPairedAcquisitionProvenanceReadyForProductionFR58()).toThrow(/remain blocked/u);
    const promoted = {
      ...CENTRAL_CHIN_PAIRED_ACQUISITION_PROVENANCE_AUTHORITY_FR58,
      protocol: {
        ...CENTRAL_CHIN_PAIRED_ACQUISITION_PROVENANCE_AUTHORITY_FR58.protocol,
        membershipThreshold: 0.01,
      },
    } as unknown as CentralChinPairedAcquisitionProvenanceAuthorityFR58V1;
    expect(() => validateCentralChinPairedAcquisitionProvenanceAuthorityFR58(promoted)).toThrow(/empirical parameters must remain unresolved/u);
  });
});
