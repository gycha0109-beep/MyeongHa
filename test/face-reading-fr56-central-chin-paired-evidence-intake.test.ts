import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CENTRAL_CHIN_PAIRED_EVIDENCE_INTAKE_AUTHORITY_FR56,
  assessCentralChinPairedEvidenceIntakeReadinessFR56,
  assertCentralChinPairedEvidenceReadyForProductionFR56,
  buildCentralChinPairedEvidenceIntakeReportFR56,
  computeCentralChinPairedEvidenceRecordDigestFR56,
  computeCentralChinSourceAssetDigestFR56,
  freezeCentralChinPairedEvidenceRecordFR56,
  validateCentralChinPairedEvidenceIntakeAuthorityFR56,
  validateCentralChinPairedEvidenceIntakeFR56,
  verifyFrozenCentralChinPairedEvidenceRecordFR56,
  type CentralChinInferiorReferenceTraceAnnotationFR54V1,
  type CentralChinPairedEvidenceIntakeAuthorityFR56V1,
  type CentralChinPairedEvidenceIntakeFR56V1,
  type FrozenCentralChinPairedEvidenceRecordFR56V1,
  type IndependentCentralChinScaffoldAnnotationFR50V1,
} from '../packages/face-reading/src/index.js';

const ASSET_BYTES = new TextEncoder().encode('synthetic-fr56-source-asset-bytes');
const ASSET_DIGEST = `sha256:${createHash('sha256').update(ASSET_BYTES).digest('hex')}`;
const OTHER_ASSET_DIGEST = `sha256:${createHash('sha256').update('other-annotation-asset').digest('hex')}`;

function traceAnnotation(): CentralChinInferiorReferenceTraceAnnotationFR54V1 {
  return {
    schemaVersion: 'fr54-provider-blind-central-chin-reference-trace-v1',
    subjectId: 'subject-fr56-001',
    captureId: 'capture-fr56-001',
    annotatorId: 'trace-annotator-fr56-001',
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

function mentonSideAnnotation(): IndependentCentralChinScaffoldAnnotationFR50V1 {
  return {
    schemaVersion: 'fr50-independent-central-chin-scaffold-v1',
    subjectId: 'subject-fr56-001',
    captureId: 'capture-fr56-001',
    annotatorId: 'candidate-annotator-fr56-001',
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

function intake(): CentralChinPairedEvidenceIntakeFR56V1 {
  return {
    schemaVersion: 'fr56-central-chin-paired-evidence-intake-v1',
    pairRef: 'pair-fr56-001',
    canonicalAssetDigest: ASSET_DIGEST,
    traceObservedAssetDigest: ASSET_DIGEST,
    mentonSideObservedAssetDigest: ASSET_DIGEST,
    traceAnnotation: traceAnnotation(),
    traceFrozenAt: '2026-08-31T01:00:00.000Z',
    mentonSideAnnotation: mentonSideAnnotation(),
    mentonSideAnnotationFrozenAt: '2026-08-31T01:05:00.000Z',
    pairedAt: '2026-08-31T01:10:00.000Z',
    traceFrozenBeforeCandidateAnnotationAttested: true,
    pairingPerformedAfterBothAnnotationsFrozenAttested: true,
  };
}

describe('FR-56 central chin paired evidence intake and freeze', () => {
  it('keeps empirical counts, thresholds, endpoint rules, and all stronger authority unresolved', () => {
    const authority = validateCentralChinPairedEvidenceIntakeAuthorityFR56();
    expect(authority).toBe(CENTRAL_CHIN_PAIRED_EVIDENCE_INTAKE_AUTHORITY_FR56);
    expect(authority.protocol.perAnnotationObservedAssetDigestRequired).toBe(true);
    expect(authority.protocol.exactObservedAssetDigestMatchRequired).toBe(true);
    expect(authority.protocol.minimumPairs).toBeNull();
    expect(authority.protocol.minimumSubjects).toBeNull();
    expect(authority.protocol.membershipThreshold).toBeNull();
    expect(authority.protocol.anchorAgreementTolerance).toBeNull();
    expect(authority.protocol.endpointSelectionRule).toBeNull();
    expect(authority.protocol.empiricalAcceptanceCriterion).toBeNull();
    expect(authority.protocol.distinctAnnotatorsRequired).toBeNull();
    expect(Object.values(authority.authorityBoundary).every((value) => value === false)).toBe(true);
  });

  it('computes the canonical source asset digest from the provided bytes', () => {
    expect(computeCentralChinSourceAssetDigestFR56(ASSET_BYTES)).toBe(ASSET_DIGEST);
    expect(() => computeCentralChinSourceAssetDigestFR56(new Uint8Array())).toThrow(/non-empty Uint8Array/u);
  });

  it('requires both annotation-declared observed digests to equal the canonical intake asset digest', () => {
    const base = intake();
    expect(() => validateCentralChinPairedEvidenceIntakeFR56({
      ...base,
      traceObservedAssetDigest: OTHER_ASSET_DIGEST,
    })).toThrow(/annotation-observed asset digests must exactly match canonicalAssetDigest/u);
    expect(() => validateCentralChinPairedEvidenceIntakeFR56({
      ...base,
      mentonSideObservedAssetDigest: OTHER_ASSET_DIGEST,
    })).toThrow(/annotation-observed asset digests must exactly match canonicalAssetDigest/u);
  });

  it('freezes one exact same-capture pair only after annotation-declared digests and provided bytes converge on one digest', () => {
    const record = freezeCentralChinPairedEvidenceRecordFR56(intake(), ASSET_BYTES);
    expect(record.subjectId).toBe('subject-fr56-001');
    expect(record.captureId).toBe('capture-fr56-001');
    expect(record.canonicalAssetDigest).toBe(ASSET_DIGEST);
    expect(record.traceObservedAssetDigest).toBe(ASSET_DIGEST);
    expect(record.mentonSideObservedAssetDigest).toBe(ASSET_DIGEST);
    expect(record.assetByteLength).toBe(ASSET_BYTES.byteLength);
    expect(record.assetDigestVerifiedAgainstProvidedBytes).toBe(true);
    expect(record.exactObservedAssetDigestMatchVerified).toBe(true);
    expect(record.observedDigestBindingProofState).toBe('annotation_declared_digests_match_intake_bytes_not_externally_attested_history');
    expect(record.rawAssetBytesRetained).toBe(false);
    expect(record.rawAssetRetentionPolicy).toBe('ephemeral_digest_then_discard');
    expect(record.exactSubjectCaptureMatchVerified).toBe(true);
    expect(record.timestampOrderConsistencyVerified).toBe(true);
    expect(record.chronologyProofState).toBe('attested_and_timestamp_consistent_not_cryptographically_proven');
    expect(record.pairedRecordDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(record.derivedJoinIncludedInPairedRecordDigest).toBe(false);
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.traceAnnotation)).toBe(true);
    expect(Object.isFrozen(record.traceAnnotation.tracePoints)).toBe(true);
    expect(Object.isFrozen(record.mentonSideAnnotation)).toBe(true);
  });

  it('rejects asset bytes that do not match the declared canonical digest', () => {
    const differentBytes = new TextEncoder().encode('different-fr56-asset');
    expect(() => freezeCentralChinPairedEvidenceRecordFR56(intake(), differentBytes)).toThrow(/do not match canonicalAssetDigest/u);
  });

  it('rejects cross-subject or cross-capture source annotation pairs before a record is frozen', () => {
    const base = intake();
    expect(() => validateCentralChinPairedEvidenceIntakeFR56({
      ...base,
      mentonSideAnnotation: { ...base.mentonSideAnnotation, subjectId: 'other-subject' },
    })).toThrow(/same subjectId and captureId/u);
    expect(() => validateCentralChinPairedEvidenceIntakeFR56({
      ...base,
      mentonSideAnnotation: { ...base.mentonSideAnnotation, captureId: 'other-capture' },
    })).toThrow(/same subjectId and captureId/u);
  });

  it('rejects timestamp metadata that contradicts trace-freeze -> candidate-freeze -> pairing order', () => {
    const base = intake();
    expect(() => validateCentralChinPairedEvidenceIntakeFR56({
      ...base,
      traceFrozenAt: '2026-08-31T01:06:00.000Z',
    })).toThrow(/timestamps contradict/u);
    expect(() => validateCentralChinPairedEvidenceIntakeFR56({
      ...base,
      pairedAt: '2026-08-31T01:04:00.000Z',
    })).toThrow(/timestamps contradict/u);
  });

  it('requires canonical ISO UTC millisecond timestamps but does not upgrade them to chronology proof', () => {
    const base = intake();
    expect(() => validateCentralChinPairedEvidenceIntakeFR56({
      ...base,
      traceFrozenAt: '2026-08-31T01:00:00Z',
    })).toThrow(/canonical ISO-8601 UTC millisecond/u);
    expect(CENTRAL_CHIN_PAIRED_EVIDENCE_INTAKE_AUTHORITY_FR56.authorityBoundary.timestampConsistencyMeansCryptographicChronologyProof).toBe(false);
    expect(CENTRAL_CHIN_PAIRED_EVIDENCE_INTAKE_AUTHORITY_FR56.authorityBoundary.freezeAttestationMeansExternallyVerifiedChronology).toBe(false);
  });

  it('does not upgrade observed-digest equality into externally verified annotation-to-asset history', () => {
    const authority = CENTRAL_CHIN_PAIRED_EVIDENCE_INTAKE_AUTHORITY_FR56;
    expect(authority.authorityBoundary.observedAssetDigestEqualityMeansExternallyVerifiedAnnotationAssetHistory).toBe(false);
    const readiness = assessCentralChinPairedEvidenceIntakeReadinessFR56();
    expect(readiness.perAnnotationObservedAssetDigestBindingReady).toBe(true);
    expect(readiness.externalAnnotationAssetHistoryAttestationPresent).toBe(false);
  });

  it('does not invent a distinct-annotator requirement', () => {
    const base = intake();
    const sameAnnotator = {
      ...base,
      mentonSideAnnotation: {
        ...base.mentonSideAnnotation,
        annotatorId: base.traceAnnotation.annotatorId,
      },
    };
    const record = freezeCentralChinPairedEvidenceRecordFR56(sameAnnotator, ASSET_BYTES);
    expect(record.traceAnnotation.annotatorId).toBe(record.mentonSideAnnotation.annotatorId);
    expect(CENTRAL_CHIN_PAIRED_EVIDENCE_INTAKE_AUTHORITY_FR56.protocol.distinctAnnotatorsRequired).toBeNull();
    expect(CENTRAL_CHIN_PAIRED_EVIDENCE_INTAKE_AUTHORITY_FR56.authorityBoundary.sameCapturePairMeansDistinctAnnotators).toBe(false);
  });

  it('produces a deterministic canonical pair digest, including observed asset digests and preserving raw trace array order', () => {
    const base = intake();
    const first = computeCentralChinPairedEvidenceRecordDigestFR56(base, ASSET_BYTES.byteLength);
    const second = computeCentralChinPairedEvidenceRecordDigestFR56({ ...base }, ASSET_BYTES.byteLength);
    expect(first).toBe(second);

    const reversedTrace: CentralChinInferiorReferenceTraceAnnotationFR54V1 = {
      ...base.traceAnnotation,
      tracePoints: [...base.traceAnnotation.tracePoints].reverse(),
      mentonTracePointIndex: 2,
    };
    const reversed = computeCentralChinPairedEvidenceRecordDigestFR56({
      ...base,
      traceAnnotation: reversedTrace,
    }, ASSET_BYTES.byteLength);
    expect(reversed).not.toBe(first);
  });

  it('detects persisted source-content mutation through the paired record digest', () => {
    const record = freezeCentralChinPairedEvidenceRecordFR56(intake(), ASSET_BYTES);
    expect(verifyFrozenCentralChinPairedEvidenceRecordFR56(record)).toBe(record);

    const mutated = {
      ...record,
      traceAnnotation: {
        ...record.traceAnnotation,
        tracePoints: record.traceAnnotation.tracePoints.map((point, index) => (
          index === 0 ? { x: point.x + 0.01, y: point.y } : point
        )),
      },
    } as unknown as FrozenCentralChinPairedEvidenceRecordFR56V1;
    expect(() => verifyFrozenCentralChinPairedEvidenceRecordFR56(mutated)).toThrow(/pairedRecordDigest does not match frozen source content/u);
  });

  it('detects persisted observed-asset-digest mutation before accepting the frozen record', () => {
    const record = freezeCentralChinPairedEvidenceRecordFR56(intake(), ASSET_BYTES);
    const mutated = {
      ...record,
      traceObservedAssetDigest: OTHER_ASSET_DIGEST,
    } as unknown as FrozenCentralChinPairedEvidenceRecordFR56V1;
    expect(() => verifyFrozenCentralChinPairedEvidenceRecordFR56(mutated)).toThrow(/annotation-observed asset digests must exactly match canonicalAssetDigest/u);
  });

  it('derives FR-55 raw geometry only after source freeze and keeps the derived join outside the pair digest', () => {
    const report = buildCentralChinPairedEvidenceIntakeReportFR56(intake(), ASSET_BYTES);
    expect(report.sourceRecordFrozenBeforeDerivedJoinReportReturned).toBe(true);
    expect(report.rawJoinDerivedFromExactFrozenSourceContent).toBe(true);
    expect(report.rawJoinMayMutateSourceRecord).toBe(false);
    expect(report.rawJoinIncludedInPairedRecordDigest).toBe(false);
    expect(report.rawJoin.subjectId).toBe(report.record.subjectId);
    expect(report.rawJoin.captureId).toBe(report.record.captureId);
    expect(report.rawJoin.membershipThreshold).toBeNull();
    expect(report.rawJoin.endpointSelectionRule).toBeNull();
    expect(report.rawJoin.leftCandidate.membershipDecision).toBeNull();
    expect(report.rawJoin.leftCandidate.endpointDecision).toBeNull();
    expect(report.empiricalScoringPerformed).toBe(false);
    expect(report.membershipThresholdDefined).toBe(false);
    expect(report.endpointSelectionPerformed).toBe(false);
  });

  it('rejects authority mutation that turns paired evidence into a post-hoc threshold source', () => {
    const mutated = {
      ...CENTRAL_CHIN_PAIRED_EVIDENCE_INTAKE_AUTHORITY_FR56,
      protocol: {
        ...CENTRAL_CHIN_PAIRED_EVIDENCE_INTAKE_AUTHORITY_FR56.protocol,
        membershipThreshold: 0.01,
      },
    } as unknown as CentralChinPairedEvidenceIntakeAuthorityFR56V1;
    expect(() => validateCentralChinPairedEvidenceIntakeAuthorityFR56(mutated)).toThrow(/must remain unresolved/u);
  });

  it('reports infrastructure readiness while real paired data and all stronger claims remain blocked', () => {
    const readiness = assessCentralChinPairedEvidenceIntakeReadinessFR56();
    expect(readiness.pairedIntakeProtocolReady).toBe(true);
    expect(readiness.sourceAssetByteDigestVerificationReady).toBe(true);
    expect(readiness.perAnnotationObservedAssetDigestBindingReady).toBe(true);
    expect(readiness.canonicalPairedRecordDigestReady).toBe(true);
    expect(readiness.sameCaptureSourceBindingReady).toBe(true);
    expect(readiness.freezeMetadataConsistencyCheckReady).toBe(true);
    expect(readiness.thresholdFreeRawJoinReady).toBe(true);
    expect(readiness.realPairedEvidenceDatasetPresent).toBe(false);
    expect(readiness.externalAnnotationAssetHistoryAttestationPresent).toBe(false);
    expect(readiness.externalChronologyAttestationPresent).toBe(false);
    expect(readiness.reviewedReferenceStandardReady).toBe(false);
    expect(readiness.empiricalValidationReady).toBe(false);
    expect(readiness.endpointSelectionReady).toBe(false);
    expect(readiness.providerMappingReady).toBe(false);
    expect(readiness.productionGeometryReady).toBe(false);
    expect(() => assertCentralChinPairedEvidenceReadyForProductionFR56()).toThrow(/annotation-declared asset digests/u);
  });
});
