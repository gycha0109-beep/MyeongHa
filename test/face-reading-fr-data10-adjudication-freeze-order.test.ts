import { describe, expect, it } from 'vitest';
import {
  buildIndependentFaceAdjudicationReportFRData10,
  computeIndependentFaceAdjudicationLedgerDigestFRData10,
  deriveIndependentAnnotationRefFRData10,
  type IndependentFaceAdjudicationDatasetFRData10V1,
  type IndependentFaceGroundTruthDatasetFRData07V1,
} from '../packages/face-reading/src/index.js';

const digest = (char: string) => `sha256:${char.repeat(64)}`;

function truth(): IndependentFaceGroundTruthDatasetFRData07V1 {
  return {
    schemaVersion: 'fr-data07-independent-face-ground-truth-v1',
    datasetRef: 'dataset:fr-data10-freeze-order',
    providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1',
    captures: [{
      captureRef: 'c0',
      partition: 'calibration',
      canonicalAssetDigest: digest('a'),
      sourceProvenanceRef: 'source:c0',
      sourceInstanceRef: 'instance:c0',
      providerRunRef: null,
      providerRunStartedAt: null,
      providerRunExecutedAfterAnnotationFreeze: false,
    }],
    annotations: [{
      captureRef: 'c0',
      annotatorRef: 'annotator:0',
      annotationSessionRef: 'annotation-session:0',
      observedAssetDigest: digest('a'),
      label: 'one_human_face',
      annotatedAt: '2026-01-01T00:00:00.000Z',
      providerOutputVisibleDuringAnnotation: false,
      providerCandidateCountVisibleDuringAnnotation: false,
      providerLandmarksVisibleDuringAnnotation: false,
      providerResultShapeVisibleDuringAnnotation: false,
      providerOutputUsedToChooseLabel: false,
      subjectIdentityInferred: false,
      annotationFrozenBeforeProviderScoring: true,
    }],
    annotationLedgerFrozen: true,
    annotationLedgerDigest: digest('e'),
    annotationLedgerFrozenAt: '2026-01-01T00:10:00.000Z',
    providerRunsExecutedAfterFreeze: false,
  };
}

function adjudicationDataset(
  groundTruth: IndependentFaceGroundTruthDatasetFRData07V1,
  adjudicatedAt: string,
): IndependentFaceAdjudicationDatasetFRData10V1 {
  const base: IndependentFaceAdjudicationDatasetFRData10V1 = {
    schemaVersion: 'fr-data10-independent-face-count-adjudication-v1',
    datasetRef: groundTruth.datasetRef,
    upstreamGroundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1',
    upstreamAnnotationLedgerDigest: groundTruth.annotationLedgerDigest!,
    adjudications: [{
      captureRef: 'c0',
      adjudicatorRef: 'adjudicator:0',
      adjudicationSessionRef: 'adjudication-session:0',
      observedAssetDigest: digest('a'),
      reviewedAnnotationRefs: groundTruth.annotations.map(deriveIndependentAnnotationRefFRData10),
      outcome: 'one_human_face',
      adjudicatedAt,
      independentAnnotationsVisibleDuringAdjudication: true,
      providerOutputVisibleDuringAdjudication: false,
      providerCandidateCountVisibleDuringAdjudication: false,
      providerLandmarksVisibleDuringAdjudication: false,
      providerResultShapeVisibleDuringAdjudication: false,
      providerRunIdentityVisibleDuringAdjudication: false,
      rawProviderScoringVisibleDuringAdjudication: false,
      providerRunBindingVisibleDuringAdjudication: false,
      datasetPartitionVisibleDuringAdjudication: false,
      providerOutputUsedToChooseOutcome: false,
      holdoutProviderBehaviorUsedToChooseOutcome: false,
      originalIndependentAnnotationsModified: false,
      automaticMajorityRuleApplied: false,
      automaticUnanimityRuleApplied: false,
      annotationCountRuleApplied: false,
      adjudicatorWasOriginalAnnotator: false,
      outcomeChosenByHumanAdjudicator: true,
      subjectIdentityInferred: false,
    }],
    adjudicationLedgerFrozen: true,
    adjudicationLedgerDigest: null,
    adjudicationLedgerFrozenAt: '2026-01-01T00:20:00.000Z',
  };
  return {
    ...base,
    adjudicationLedgerDigest: computeIndependentFaceAdjudicationLedgerDigestFRData10(base),
  };
}

describe('FR-DATA-10 adjudication freeze ordering', () => {
  it('records adjudication only after the complete FR-DATA-07 annotation ledger was frozen', () => {
    const groundTruth = truth();
    const report = buildIndependentFaceAdjudicationReportFRData10(
      groundTruth,
      adjudicationDataset(groundTruth, '2026-01-01T00:11:00.000Z'),
    );
    expect(report.adjudicationAfterGroundTruthLedgerFreezeVerified).toBe(true);
  });

  it('rejects an adjudication timestamp that precedes the FR-DATA-07 ledger freeze', () => {
    const groundTruth = truth();
    expect(() => buildIndependentFaceAdjudicationReportFRData10(
      groundTruth,
      adjudicationDataset(groundTruth, '2026-01-01T00:09:00.000Z'),
    )).toThrow(/cannot precede the frozen FR-DATA-07 annotation ledger/);
  });
});
