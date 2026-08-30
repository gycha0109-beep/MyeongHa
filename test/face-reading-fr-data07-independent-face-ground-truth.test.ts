import { describe, expect, it } from 'vitest';
import {
  INDEPENDENT_FACE_GROUND_TRUTH_AUTHORITY_FRDATA07,
  assessIndependentFaceGroundTruthReadinessFRData07,
  assertIndependentFaceGroundTruthReadyForPromotionFRData07,
  validateIndependentFaceGroundTruthAuthorityFRData07,
  validateIndependentFaceGroundTruthDatasetFRData07,
  type IndependentFaceCountAnnotationFRData07V1,
  type IndependentFaceGroundTruthDatasetFRData07V1,
  type IndependentFaceValidationCaptureFRData07V1,
} from '../packages/face-reading/src/index.js';

const D0 = `sha256:${'0'.repeat(64)}`;
const D1 = `sha256:${'1'.repeat(64)}`;
const D2 = `sha256:${'2'.repeat(64)}`;
const D3 = `sha256:${'3'.repeat(64)}`;
const LEDGER = `sha256:${'a'.repeat(64)}`;

function capture(
  captureRef: string,
  partition: 'calibration' | 'holdout',
  digest: string,
  providerRunRef: string | null = `${captureRef}-provider-run`,
): IndependentFaceValidationCaptureFRData07V1 {
  return {
    captureRef,
    partition,
    canonicalAssetDigest: digest,
    sourceProvenanceRef: `source-${captureRef}`,
    sourceInstanceRef: `instance-${captureRef}`,
    providerRunRef,
    providerRunStartedAt: providerRunRef === null ? null : '2026-08-30T00:10:00.000Z',
    providerRunExecutedAfterAnnotationFreeze: providerRunRef === null ? false : true,
  };
}

function annotation(
  captureRef: string,
  digest: string,
  label: IndependentFaceCountAnnotationFRData07V1['label'],
): IndependentFaceCountAnnotationFRData07V1 {
  return {
    captureRef,
    annotatorRef: `annotator-${captureRef}`,
    annotationSessionRef: `session-${captureRef}`,
    observedAssetDigest: digest,
    label,
    annotatedAt: '2026-08-30T00:05:00.000Z',
    providerOutputVisibleDuringAnnotation: false,
    providerCandidateCountVisibleDuringAnnotation: false,
    providerLandmarksVisibleDuringAnnotation: false,
    providerResultShapeVisibleDuringAnnotation: false,
    providerOutputUsedToChooseLabel: false,
    subjectIdentityInferred: false,
    annotationFrozenBeforeProviderScoring: true,
  };
}

function validDataset(): IndependentFaceGroundTruthDatasetFRData07V1 {
  return {
    schemaVersion: 'fr-data07-independent-face-ground-truth-v1',
    datasetRef: 'dataset.frdata07.selftest',
    providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1',
    captures: [
      capture('capture-zero', 'calibration', D0),
      capture('capture-one', 'calibration', D1),
      capture('capture-multiple', 'holdout', D2),
      capture('capture-indeterminate', 'holdout', D3),
    ],
    annotations: [
      annotation('capture-zero', D0, 'zero_human_faces'),
      annotation('capture-one', D1, 'one_human_face'),
      annotation('capture-multiple', D2, 'multiple_human_faces'),
      annotation('capture-indeterminate', D3, 'indeterminate'),
    ],
    annotationLedgerFrozen: true,
    annotationLedgerDigest: LEDGER,
    annotationLedgerFrozenAt: '2026-08-30T00:09:00.000Z',
    providerRunsExecutedAfterFreeze: true,
  };
}

describe('FR-DATA-07 independent face ground truth protocol', () => {
  it('keeps all empirical thresholds unset and all promotion authority closed', () => {
    expect(validateIndependentFaceGroundTruthAuthorityFRData07()).toBe(INDEPENDENT_FACE_GROUND_TRUTH_AUTHORITY_FRDATA07);
    expect(INDEPENDENT_FACE_GROUND_TRUTH_AUTHORITY_FRDATA07.protocol.minimumCapturesPerPartition).toBeNull();
    expect(INDEPENDENT_FACE_GROUND_TRUTH_AUTHORITY_FRDATA07.protocol.minimumIndependentAnnotatorsPerCapture).toBeNull();
    expect(INDEPENDENT_FACE_GROUND_TRUTH_AUTHORITY_FRDATA07.protocol.providerCandidateDecisionThreshold).toBeNull();
    expect(Object.values(INDEPENDENT_FACE_GROUND_TRUTH_AUTHORITY_FRDATA07.authorityBoundary).every((value) => value === false)).toBe(true);
  });

  it('reports the missing real validation dataset without promoting provider output', () => {
    const readiness = assessIndependentFaceGroundTruthReadinessFRData07(null);
    expect(readiness.protocolDefined).toBe(true);
    expect(readiness.validationDatasetPresent).toBe(false);
    expect(readiness.facePresenceVerified).toBe(false);
    expect(readiness.singleHumanFaceVerified).toBe(false);
    expect(readiness.empiricalScoringPerformed).toBe(false);
    expect(readiness.blockers).toContain('validation_dataset_missing');
  });

  it('accepts a structurally complete provider-blind frozen ledger while authority remains closed', () => {
    const dataset = validDataset();
    expect(validateIndependentFaceGroundTruthDatasetFRData07(dataset)).toBe(dataset);
    const readiness = assessIndependentFaceGroundTruthReadinessFRData07(dataset);
    expect(readiness.calibrationPartitionPresent).toBe(true);
    expect(readiness.holdoutPartitionPresent).toBe(true);
    expect(readiness.zeroHumanFaceLabelPresent).toBe(true);
    expect(readiness.oneHumanFaceLabelPresent).toBe(true);
    expect(readiness.multipleHumanFaceLabelPresent).toBe(true);
    expect(readiness.independentAnnotationPresentForEveryCapture).toBe(true);
    expect(readiness.providerBlindAnnotationRecordedForEveryAnnotation).toBe(true);
    expect(readiness.annotationLedgerFrozenBeforeProviderRun).toBe(true);
    expect(readiness.providerOutputPresentForEveryCapture).toBe(true);
    expect(readiness.crossPartitionExactAssetLeakageAbsent).toBe(true);
    expect(readiness.providerDetectionConstructValidityValidated).toBe(false);
    expect(readiness.facePresenceVerified).toBe(false);
    expect(readiness.singleHumanFaceVerified).toBe(false);
    expect(readiness.blockers).toContain('inter_annotator_ground_truth_authority_unreviewed');
    expect(readiness.blockers).toContain('near_duplicate_partition_leakage_not_yet_validated');
  });

  it('rejects the exact same asset digest crossing calibration and holdout', () => {
    const dataset = validDataset();
    const bad: IndependentFaceGroundTruthDatasetFRData07V1 = {
      ...dataset,
      captures: dataset.captures.map((entry) => entry.captureRef === 'capture-multiple'
        ? { ...entry, canonicalAssetDigest: D0 }
        : entry),
      annotations: dataset.annotations.map((entry) => entry.captureRef === 'capture-multiple'
        ? { ...entry, observedAssetDigest: D0 }
        : entry),
    };
    expect(() => validateIndependentFaceGroundTruthDatasetFRData07(bad)).toThrow(/across calibration and holdout partitions/u);
  });

  it('rejects annotation asset-digest drift', () => {
    const dataset = validDataset();
    const bad: IndependentFaceGroundTruthDatasetFRData07V1 = {
      ...dataset,
      annotations: dataset.annotations.map((entry) => entry.captureRef === 'capture-one'
        ? { ...entry, observedAssetDigest: D2 }
        : entry),
    };
    expect(() => validateIndependentFaceGroundTruthDatasetFRData07(bad)).toThrow(/annotation asset digest drift/u);
  });

  it('rejects any record that exposes provider output during annotation', () => {
    const dataset = validDataset();
    const bad = {
      ...dataset,
      annotations: dataset.annotations.map((entry) => entry.captureRef === 'capture-one'
        ? { ...entry, providerOutputVisibleDuringAnnotation: true }
        : entry),
    } as unknown as IndependentFaceGroundTruthDatasetFRData07V1;
    expect(() => validateIndependentFaceGroundTruthDatasetFRData07(bad)).toThrow(/violates provider-blind independent-label requirements/u);
  });

  it('rejects provider scoring that starts before annotation-ledger freeze', () => {
    const dataset = validDataset();
    const bad: IndependentFaceGroundTruthDatasetFRData07V1 = {
      ...dataset,
      captures: dataset.captures.map((entry) => entry.captureRef === 'capture-one'
        ? { ...entry, providerRunStartedAt: '2026-08-30T00:08:59.000Z' }
        : entry),
    };
    expect(() => validateIndependentFaceGroundTruthDatasetFRData07(bad)).toThrow(/start at or after the annotation-ledger freeze/u);
  });

  it('does not permit a protocol-only promotion', () => {
    expect(() => assertIndependentFaceGroundTruthReadyForPromotionFRData07()).toThrow(/validation protocol only/u);
  });
});
