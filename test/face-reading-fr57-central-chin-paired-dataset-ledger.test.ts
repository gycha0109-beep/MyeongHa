import { describe, expect, it } from 'vitest';
import {
  CENTRAL_CHIN_PAIRED_DATASET_AUTHORITY_FR57,
  assessCentralChinPairedDatasetReadinessFR57,
  assertCentralChinPairedDatasetReadyForProductionFR57,
  computeCentralChinPairedDatasetDigestFR57,
  computeCentralChinSourceAssetDigestFR56,
  freezeCentralChinPairedDatasetLedgerFR57,
  freezeCentralChinPairedEvidenceRecordFR56,
  validateCentralChinPairedDatasetAuthorityFR57,
  validateCentralChinPairedDatasetManifestFR57,
  verifyFrozenCentralChinPairedDatasetLedgerFR57,
  type CentralChinInferiorReferenceTraceAnnotationFR54V1,
  type CentralChinPairedDatasetAuthorityFR57V1,
  type CentralChinPairedDatasetManifestFR57V1,
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
  traceAnnotator?: string;
  candidateAnnotator?: string;
  minute?: number;
}): FrozenCentralChinPairedEvidenceRecordFR56V1 {
  const minute = options.minute ?? 0;
  const bytes = new TextEncoder().encode(options.assetLabel);
  const digest = computeCentralChinSourceAssetDigestFR56(bytes);
  return freezeCentralChinPairedEvidenceRecordFR56({
    schemaVersion: 'fr56-central-chin-paired-evidence-intake-v1',
    pairRef: options.pairRef,
    canonicalAssetDigest: digest,
    traceObservedAssetDigest: digest,
    mentonSideObservedAssetDigest: digest,
    traceAnnotation: traceAnnotation(options.subjectId, options.captureId, options.traceAnnotator ?? `${options.pairRef}-trace`),
    traceFrozenAt: `2026-08-31T01:${String(minute).padStart(2, '0')}:00.000Z`,
    mentonSideAnnotation: mentonSideAnnotation(options.subjectId, options.captureId, options.candidateAnnotator ?? `${options.pairRef}-candidate`),
    mentonSideAnnotationFrozenAt: `2026-08-31T01:${String(minute + 1).padStart(2, '0')}:00.000Z`,
    pairedAt: `2026-08-31T01:${String(minute + 2).padStart(2, '0')}:00.000Z`,
    traceFrozenBeforeCandidateAnnotationAttested: true,
    pairingPerformedAfterBothAnnotationsFrozenAttested: true,
  }, bytes);
}

function baseManifest(): CentralChinPairedDatasetManifestFR57V1 {
  return {
    schemaVersion: 'fr57-central-chin-paired-dataset-manifest-v1',
    datasetRef: 'dataset-fr57-001',
    entries: [
      {
        partition: 'calibration',
        record: pairRecord({
          pairRef: 'pair-fr57-cal-001',
          subjectId: 'subject-fr57-cal-001',
          captureId: 'capture-fr57-cal-001',
          assetLabel: 'asset-fr57-cal-001',
          minute: 0,
        }),
      },
      {
        partition: 'holdout',
        record: pairRecord({
          pairRef: 'pair-fr57-holdout-001',
          subjectId: 'subject-fr57-holdout-001',
          captureId: 'capture-fr57-holdout-001',
          assetLabel: 'asset-fr57-holdout-001',
          minute: 10,
        }),
      },
    ],
    datasetFrozenAt: '2026-08-31T02:00:00.000Z',
    partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: true,
    fr55OutcomeVisibleDuringPartitionAssignment: false,
    datasetFrozenAfterAllPairRecordsAttested: true,
  };
}

describe('FR-57 central chin paired dataset ledger', () => {
  it('defines leakage guards while all empirical allocation and scoring parameters remain unresolved', () => {
    const authority = validateCentralChinPairedDatasetAuthorityFR57();
    expect(authority).toBe(CENTRAL_CHIN_PAIRED_DATASET_AUTHORITY_FR57);
    expect(authority.protocol.subjectLevelPartitionIsolationRequired).toBe(true);
    expect(authority.protocol.canonicalAssetPartitionIsolationRequired).toBe(true);
    expect(authority.protocol.canonicalAssetMayRepeatWithinSamePartition).toBe(true);
    expect(authority.protocol.partitionAllocationRule).toBeNull();
    expect(authority.protocol.calibrationFraction).toBeNull();
    expect(authority.protocol.minimumPairs).toBeNull();
    expect(authority.protocol.minimumSubjects).toBeNull();
    expect(authority.protocol.membershipThreshold).toBeNull();
    expect(authority.protocol.anchorAgreementTolerance).toBeNull();
    expect(authority.protocol.endpointSelectionRule).toBeNull();
    expect(authority.protocol.empiricalAcceptanceCriterion).toBeNull();
    expect(authority.protocol.datasetDigestIncludesFR55Outcome).toBe(false);
    expect(Object.values(authority.authorityBoundary).every((value) => value === false)).toBe(true);
  });

  it('freezes deterministic descriptive counts without empirical promotion', () => {
    const ledger = freezeCentralChinPairedDatasetLedgerFR57(baseManifest());
    expect(ledger.pairCount).toBe(2);
    expect(ledger.subjectCount).toBe(2);
    expect(ledger.canonicalAssetCount).toBe(2);
    expect(ledger.calibrationPairCount).toBe(1);
    expect(ledger.holdoutPairCount).toBe(1);
    expect(ledger.calibrationSubjectCount).toBe(1);
    expect(ledger.holdoutSubjectCount).toBe(1);
    expect(ledger.datasetDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(ledger.datasetDigestIncludesFR55Outcome).toBe(false);
    expect(ledger.realDatasetEstablished).toBe(false);
    expect(ledger.empiricalValidationAuthorized).toBe(false);
    expect(verifyFrozenCentralChinPairedDatasetLedgerFR57(ledger)).toBe(ledger);
  });

  it('rejects subject leakage across calibration and holdout', () => {
    const manifest = baseManifest();
    const leaked = pairRecord({
      pairRef: 'pair-fr57-subject-leak',
      subjectId: manifest.entries[0]!.record.subjectId,
      captureId: 'capture-fr57-subject-leak',
      assetLabel: 'asset-fr57-subject-leak',
      minute: 20,
    });
    expect(() => validateCentralChinPairedDatasetManifestFR57({
      ...manifest,
      entries: [manifest.entries[0]!, { partition: 'holdout', record: leaked }],
    })).toThrow(/cannot cross calibration\/holdout partitions/u);
  });

  it('rejects exact asset leakage across partitions', () => {
    const calibration = pairRecord({
      pairRef: 'pair-fr57-asset-cal',
      subjectId: 'subject-fr57-asset-cal',
      captureId: 'capture-fr57-asset-cal',
      assetLabel: 'asset-fr57-cross-partition',
      minute: 0,
    });
    const holdout = pairRecord({
      pairRef: 'pair-fr57-asset-holdout',
      subjectId: 'subject-fr57-asset-holdout',
      captureId: 'capture-fr57-asset-holdout',
      assetLabel: 'asset-fr57-cross-partition',
      minute: 10,
    });
    expect(() => validateCentralChinPairedDatasetManifestFR57({
      ...baseManifest(),
      entries: [
        { partition: 'calibration', record: calibration },
        { partition: 'holdout', record: holdout },
      ],
    })).toThrow(/canonical asset .* cannot cross calibration\/holdout partitions/u);
  });

  it('allows same-asset same-partition multi-annotation when identity is consistent', () => {
    const first = pairRecord({
      pairRef: 'pair-fr57-rater-a',
      subjectId: 'subject-fr57-repeat',
      captureId: 'capture-fr57-repeat',
      assetLabel: 'asset-fr57-repeat',
      traceAnnotator: 'trace-rater-a',
      candidateAnnotator: 'candidate-rater-a',
      minute: 0,
    });
    const second = pairRecord({
      pairRef: 'pair-fr57-rater-b',
      subjectId: 'subject-fr57-repeat',
      captureId: 'capture-fr57-repeat',
      assetLabel: 'asset-fr57-repeat',
      traceAnnotator: 'trace-rater-b',
      candidateAnnotator: 'candidate-rater-b',
      minute: 10,
    });
    const manifest: CentralChinPairedDatasetManifestFR57V1 = {
      ...baseManifest(),
      entries: [
        { partition: 'calibration', record: first },
        { partition: 'calibration', record: second },
      ],
    };
    expect(validateCentralChinPairedDatasetManifestFR57(manifest)).toBe(manifest);
    const ledger = freezeCentralChinPairedDatasetLedgerFR57(manifest);
    expect(ledger.pairCount).toBe(2);
    expect(ledger.subjectCount).toBe(1);
    expect(ledger.canonicalAssetCount).toBe(1);
    expect(CENTRAL_CHIN_PAIRED_DATASET_AUTHORITY_FR57.authorityBoundary.samePartitionAssetReuseMeansIndependentGroundTruth).toBe(false);
  });

  it('rejects one asset digest mapped to multiple subject/capture identities', () => {
    const first = pairRecord({
      pairRef: 'pair-fr57-identity-a',
      subjectId: 'subject-fr57-identity-a',
      captureId: 'capture-fr57-identity-a',
      assetLabel: 'asset-fr57-identity-conflict',
      minute: 0,
    });
    const second = pairRecord({
      pairRef: 'pair-fr57-identity-b',
      subjectId: 'subject-fr57-identity-b',
      captureId: 'capture-fr57-identity-b',
      assetLabel: 'asset-fr57-identity-conflict',
      minute: 10,
    });
    expect(() => validateCentralChinPairedDatasetManifestFR57({
      ...baseManifest(),
      entries: [
        { partition: 'calibration', record: first },
        { partition: 'calibration', record: second },
      ],
    })).toThrow(/cannot map to multiple subject\/capture identities/u);
  });

  it('rejects one subject/capture identity mapped to different asset bytes', () => {
    const first = pairRecord({
      pairRef: 'pair-fr57-capture-a',
      subjectId: 'subject-fr57-capture',
      captureId: 'capture-fr57-capture',
      assetLabel: 'asset-fr57-capture-a',
      minute: 0,
    });
    const second = pairRecord({
      pairRef: 'pair-fr57-capture-b',
      subjectId: 'subject-fr57-capture',
      captureId: 'capture-fr57-capture',
      assetLabel: 'asset-fr57-capture-b',
      minute: 10,
    });
    expect(() => validateCentralChinPairedDatasetManifestFR57({
      ...baseManifest(),
      entries: [
        { partition: 'calibration', record: first },
        { partition: 'calibration', record: second },
      ],
    })).toThrow(/cannot map to multiple canonical assets/u);
  });

  it('rejects duplicate pairedRecordDigest and pairRef', () => {
    const manifest = baseManifest();
    const record = manifest.entries[0]!.record;
    expect(() => validateCentralChinPairedDatasetManifestFR57({
      ...manifest,
      entries: [
        { partition: 'calibration', record },
        { partition: 'calibration', record },
      ],
    })).toThrow(/pairedRecordDigest .* cannot appear more than once/u);

    const sameRef = pairRecord({
      pairRef: record.pairRef,
      subjectId: 'subject-fr57-new',
      captureId: 'capture-fr57-new',
      assetLabel: 'asset-fr57-new',
      minute: 20,
    });
    expect(() => validateCentralChinPairedDatasetManifestFR57({
      ...manifest,
      entries: [
        { partition: 'calibration', record },
        { partition: 'calibration', record: sameRef },
      ],
    })).toThrow(/pairRef .* cannot appear more than once/u);
  });

  it('requires explicit pre-FR55 outcome-blind partition and post-pair dataset-freeze attestations', () => {
    const manifest = baseManifest();
    expect(() => validateCentralChinPairedDatasetManifestFR57({
      ...manifest,
      fr55OutcomeVisibleDuringPartitionAssignment: true as false,
    })).toThrow(/FR-55-outcome-blind/u);
    expect(() => validateCentralChinPairedDatasetManifestFR57({
      ...manifest,
      partitionAssignmentFrozenBeforeFR55OutcomeInspectionAttested: false as true,
    })).toThrow(/FR-55-outcome-blind/u);
    expect(() => validateCentralChinPairedDatasetManifestFR57({
      ...manifest,
      datasetFrozenAfterAllPairRecordsAttested: false as true,
    })).toThrow(/dataset freeze after all pair records/u);
    expect(CENTRAL_CHIN_PAIRED_DATASET_AUTHORITY_FR57.authorityBoundary.partitionFreezeAttestationMeansExternallyVerifiedOutcomeBlindness).toBe(false);
  });

  it('rejects dataset freeze timestamps preceding any constituent pair', () => {
    expect(() => validateCentralChinPairedDatasetManifestFR57({
      ...baseManifest(),
      datasetFrozenAt: '2026-08-31T01:00:00.000Z',
    })).toThrow(/datasetFrozenAt cannot precede paired record/u);
    expect(CENTRAL_CHIN_PAIRED_DATASET_AUTHORITY_FR57.authorityBoundary.datasetTimestampMeansCryptographicChronologyProof).toBe(false);
  });

  it('makes digest input-order independent but partition sensitive', () => {
    const manifest = baseManifest();
    const reversed: CentralChinPairedDatasetManifestFR57V1 = {
      ...manifest,
      entries: [...manifest.entries].reverse(),
    };
    expect(computeCentralChinPairedDatasetDigestFR57(reversed)).toBe(computeCentralChinPairedDatasetDigestFR57(manifest));

    const allHoldout: CentralChinPairedDatasetManifestFR57V1 = {
      ...manifest,
      entries: manifest.entries.map((entry) => ({ ...entry, partition: 'holdout' as const })),
    };
    expect(validateCentralChinPairedDatasetManifestFR57(allHoldout)).toBe(allHoldout);
    expect(computeCentralChinPairedDatasetDigestFR57(allHoldout)).not.toBe(computeCentralChinPairedDatasetDigestFR57(manifest));
  });

  it('rejects non-canonical persisted ledger entry order even though digest input order is normalized', () => {
    const ledger = freezeCentralChinPairedDatasetLedgerFR57(baseManifest());
    const reversed = {
      ...ledger,
      entries: [...ledger.entries].reverse(),
    } as unknown as FrozenCentralChinPairedDatasetLedgerFR57V1;
    expect(() => verifyFrozenCentralChinPairedDatasetLedgerFR57(reversed)).toThrow(/not in canonical order/u);
  });

  it('detects frozen metadata mutation through digest recomputation', () => {
    const ledger = freezeCentralChinPairedDatasetLedgerFR57(baseManifest());
    const mutated = {
      ...ledger,
      datasetFrozenAt: '2026-08-31T03:00:00.000Z',
    } as unknown as FrozenCentralChinPairedDatasetLedgerFR57V1;
    expect(() => verifyFrozenCentralChinPairedDatasetLedgerFR57(mutated)).toThrow(/datasetDigest does not match frozen ledger content/u);
  });

  it('reports structural readiness without treating synthetic fixtures as empirical evidence', () => {
    const missing = assessCentralChinPairedDatasetReadinessFR57(null);
    expect(missing.datasetLedgerPresent).toBe(false);
    expect(missing.realPairedEvidenceDatasetEstablished).toBe(false);

    const ready = assessCentralChinPairedDatasetReadinessFR57(baseManifest());
    expect(ready.datasetLedgerPresent).toBe(true);
    expect(ready.bothPartitionsPresent).toBe(true);
    expect(ready.outcomeBlindPartitionFreezeAttested).toBe(true);
    expect(ready.datasetFreezeAfterAllPairRecordsAttested).toBe(true);
    expect(ready.externalOutcomeBlindnessAttestationPresent).toBe(false);
    expect(ready.realPairedEvidenceDatasetEstablished).toBe(false);
    expect(ready.empiricalValidationReady).toBe(false);
    expect(ready.membershipThresholdReady).toBe(false);
    expect(ready.endpointSelectionReady).toBe(false);
    expect(ready.providerMappingReady).toBe(false);
    expect(ready.productionGeometryReady).toBe(false);
    expect(() => assertCentralChinPairedDatasetReadyForProductionFR57()).toThrow(/leakage-guarded FR-56 paired-record partition ledger only/u);
  });

  it('rejects authority mutations that invent empirical numbers', () => {
    const ratioMutation = {
      ...CENTRAL_CHIN_PAIRED_DATASET_AUTHORITY_FR57,
      protocol: { ...CENTRAL_CHIN_PAIRED_DATASET_AUTHORITY_FR57.protocol, calibrationFraction: 0.8 },
    } as unknown as CentralChinPairedDatasetAuthorityFR57V1;
    expect(() => validateCentralChinPairedDatasetAuthorityFR57(ratioMutation)).toThrow(/must remain unresolved/u);

    const thresholdMutation = {
      ...CENTRAL_CHIN_PAIRED_DATASET_AUTHORITY_FR57,
      protocol: { ...CENTRAL_CHIN_PAIRED_DATASET_AUTHORITY_FR57.protocol, membershipThreshold: 0.01 },
    } as unknown as CentralChinPairedDatasetAuthorityFR57V1;
    expect(() => validateCentralChinPairedDatasetAuthorityFR57(thresholdMutation)).toThrow(/must remain unresolved/u);
  });
});
