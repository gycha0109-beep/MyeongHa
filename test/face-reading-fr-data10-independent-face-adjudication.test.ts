import { describe, expect, it } from 'vitest';
import {
  INDEPENDENT_FACE_ADJUDICATION_AUTHORITY_FRDATA10,
  assertIndependentFaceAdjudicationReadyForPromotionFRData10,
  buildIndependentFaceAdjudicationReportFRData10,
  computeIndependentFaceAdjudicationLedgerDigestFRData10,
  deriveIndependentAnnotationRefFRData10,
  type IndependentFaceAdjudicationDatasetFRData10V1,
  type IndependentFaceCountAdjudicationFRData10V1,
  type IndependentFaceCountAnnotationFRData07V1,
  type IndependentFaceGroundTruthDatasetFRData07V1,
} from '../packages/face-reading/src/index.js';

const digest = (char: string) => `sha256:${char.repeat(64)}`;

type HumanLabel = IndependentFaceCountAnnotationFRData07V1['label'];

function annotation(
  captureRef: string,
  char: string,
  annotatorRef: string,
  session: string,
  label: HumanLabel,
): IndependentFaceCountAnnotationFRData07V1 {
  return {
    captureRef,
    annotatorRef,
    annotationSessionRef: session,
    observedAssetDigest: digest(char),
    label,
    annotatedAt: '2026-01-01T00:00:00.000Z',
    providerOutputVisibleDuringAnnotation: false,
    providerCandidateCountVisibleDuringAnnotation: false,
    providerLandmarksVisibleDuringAnnotation: false,
    providerResultShapeVisibleDuringAnnotation: false,
    providerOutputUsedToChooseLabel: false,
    subjectIdentityInferred: false,
    annotationFrozenBeforeProviderScoring: true,
  };
}

function groundTruth(): IndependentFaceGroundTruthDatasetFRData07V1 {
  return {
    schemaVersion: 'fr-data07-independent-face-ground-truth-v1',
    datasetRef: 'dataset:fr-data10-contract-fixture',
    providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1',
    captures: [
      {
        captureRef: 'c0', partition: 'calibration', canonicalAssetDigest: digest('a'),
        sourceProvenanceRef: 'source:c0', sourceInstanceRef: 'instance:c0',
        providerRunRef: null, providerRunStartedAt: null, providerRunExecutedAfterAnnotationFreeze: false,
      },
      {
        captureRef: 'c1', partition: 'calibration', canonicalAssetDigest: digest('b'),
        sourceProvenanceRef: 'source:c1', sourceInstanceRef: 'instance:c1',
        providerRunRef: null, providerRunStartedAt: null, providerRunExecutedAfterAnnotationFreeze: false,
      },
      {
        captureRef: 'c2', partition: 'holdout', canonicalAssetDigest: digest('c'),
        sourceProvenanceRef: 'source:c2', sourceInstanceRef: 'instance:c2',
        providerRunRef: null, providerRunStartedAt: null, providerRunExecutedAfterAnnotationFreeze: false,
      },
    ],
    annotations: [
      annotation('c0', 'a', 'annotator:a0', 'session:a0', 'zero_human_faces'),
      annotation('c0', 'a', 'annotator:a1', 'session:a1', 'zero_human_faces'),
      annotation('c1', 'b', 'annotator:b0', 'session:b0', 'one_human_face'),
      annotation('c1', 'b', 'annotator:b1', 'session:b1', 'multiple_human_faces'),
      annotation('c2', 'c', 'annotator:c0', 'session:c0', 'one_human_face'),
      annotation('c2', 'c', 'annotator:c1', 'session:c1', 'one_human_face'),
    ],
    annotationLedgerFrozen: true,
    annotationLedgerDigest: digest('e'),
    annotationLedgerFrozenAt: '2026-01-01T00:10:00.000Z',
    providerRunsExecutedAfterFreeze: false,
  };
}

function adjudication(
  truth: IndependentFaceGroundTruthDatasetFRData07V1,
  captureRef: string,
  char: string,
  outcome: IndependentFaceCountAdjudicationFRData10V1['outcome'],
): IndependentFaceCountAdjudicationFRData10V1 {
  return {
    captureRef,
    adjudicatorRef: `adjudicator:${captureRef}`,
    adjudicationSessionRef: `adjudication-session:${captureRef}`,
    observedAssetDigest: digest(char),
    reviewedAnnotationRefs: truth.annotations
      .filter((entry) => entry.captureRef === captureRef)
      .map(deriveIndependentAnnotationRefFRData10),
    outcome,
    adjudicatedAt: '2026-01-01T00:20:00.000Z',
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
  };
}

function adjudicationDataset(truth: IndependentFaceGroundTruthDatasetFRData07V1): IndependentFaceAdjudicationDatasetFRData10V1 {
  const base: IndependentFaceAdjudicationDatasetFRData10V1 = {
    schemaVersion: 'fr-data10-independent-face-count-adjudication-v1',
    datasetRef: truth.datasetRef,
    upstreamGroundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1',
    upstreamAnnotationLedgerDigest: truth.annotationLedgerDigest!,
    adjudications: [
      adjudication(truth, 'c0', 'a', 'zero_human_faces'),
      adjudication(truth, 'c1', 'b', 'unresolved'),
      adjudication(truth, 'c2', 'c', 'one_human_face'),
    ],
    adjudicationLedgerFrozen: true,
    adjudicationLedgerDigest: null,
    adjudicationLedgerFrozenAt: '2026-01-01T00:30:00.000Z',
  };
  return {
    ...base,
    adjudicationLedgerDigest: computeIndependentFaceAdjudicationLedgerDigestFRData10(base),
  };
}

function rehash(dataset: IndependentFaceAdjudicationDatasetFRData10V1): IndependentFaceAdjudicationDatasetFRData10V1 {
  const withoutDigest = { ...dataset, adjudicationLedgerDigest: null } as IndependentFaceAdjudicationDatasetFRData10V1;
  return { ...withoutDigest, adjudicationLedgerDigest: computeIndependentFaceAdjudicationLedgerDigestFRData10(withoutDigest) };
}

describe('FR-DATA-10 independent human face-count adjudication', () => {
  it('records explicit provider-blind human adjudication while preserving unresolved disagreement', () => {
    const truth = groundTruth();
    const report = buildIndependentFaceAdjudicationReportFRData10(truth, adjudicationDataset(truth));

    expect(report.schemaVersion).toBe('fr-data10-independent-face-count-adjudication-report-v1');
    expect(report.captureCount).toBe(3);
    expect(report.resolvedCaptureCount).toBe(2);
    expect(report.unresolvedCaptureCount).toBe(1);
    expect(report.outcomeCounts.unresolved).toBe(1);
    expect(report.captureSummaries.find((entry) => entry.captureRef === 'c1')?.annotatorDisagreementObserved).toBe(true);
    expect(report.captureSummaries.find((entry) => entry.captureRef === 'c1')?.unresolved).toBe(true);
    expect(report.exactIndependentAnnotationReviewSetCoverageVerified).toBe(true);
    expect(report.providerBlindAdjudicationRecordedForEveryCapture).toBe(true);
    expect(report.independentAdjudicatorSeparationRecordedForEveryCapture).toBe(true);
    expect(report.captureConsensusGroundTruthAuthorityValidated).toBe(false);
    expect(report.interAnnotatorGroundTruthAuthorityValidated).toBe(false);
    expect(report.classificationMetricsComputed).toBe(false);
    expect(report.productionGeometryAuthorized).toBe(false);
  });

  it('requires explicit human adjudication even when independent annotators already agree', () => {
    const truth = groundTruth();
    const dataset = adjudicationDataset(truth);
    const changed = rehash({ ...dataset, adjudications: dataset.adjudications.filter((entry) => entry.captureRef !== 'c0') });
    expect(() => buildIndependentFaceAdjudicationReportFRData10(truth, changed)).toThrow(/exactly one adjudication record/);
  });

  it('rejects omission of any independent annotation from the recorded review set', () => {
    const truth = groundTruth();
    const dataset = adjudicationDataset(truth);
    const changed = rehash({
      ...dataset,
      adjudications: dataset.adjudications.map((entry) => entry.captureRef === 'c1'
        ? { ...entry, reviewedAnnotationRefs: entry.reviewedAnnotationRefs.slice(0, 1) }
        : entry),
    });
    expect(() => buildIndependentFaceAdjudicationReportFRData10(truth, changed)).toThrow(/exact complete independent annotation set/);
  });

  it('rejects an adjudicator who was an original independent annotator', () => {
    const truth = groundTruth();
    const dataset = adjudicationDataset(truth);
    const changed = rehash({
      ...dataset,
      adjudications: dataset.adjudications.map((entry) => entry.captureRef === 'c0'
        ? { ...entry, adjudicatorRef: 'annotator:a0' }
        : entry),
    });
    expect(() => buildIndependentFaceAdjudicationReportFRData10(truth, changed)).toThrow(/distinct from every original annotator/);
  });

  it('rejects provider output visibility during adjudication', () => {
    const truth = groundTruth();
    const dataset = adjudicationDataset(truth);
    const changed = rehash({
      ...dataset,
      adjudications: dataset.adjudications.map((entry) => entry.captureRef === 'c0'
        ? { ...entry, providerOutputVisibleDuringAdjudication: true as false }
        : entry),
    });
    expect(() => buildIndependentFaceAdjudicationReportFRData10(truth, changed)).toThrow(/provider-blind human adjudication/);
  });

  it('rejects automatic majority-vote or annotation-count resolution', () => {
    const truth = groundTruth();
    const dataset = adjudicationDataset(truth);
    const changed = rehash({
      ...dataset,
      adjudications: dataset.adjudications.map((entry) => entry.captureRef === 'c1'
        ? { ...entry, automaticMajorityRuleApplied: true as false }
        : entry),
    });
    expect(() => buildIndependentFaceAdjudicationReportFRData10(truth, changed)).toThrow(/provider-blind human adjudication/);
  });

  it('rejects revealing calibration or holdout partition during adjudication', () => {
    const truth = groundTruth();
    const dataset = adjudicationDataset(truth);
    const changed = rehash({
      ...dataset,
      adjudications: dataset.adjudications.map((entry) => entry.captureRef === 'c2'
        ? { ...entry, datasetPartitionVisibleDuringAdjudication: true as false }
        : entry),
    });
    expect(() => buildIndependentFaceAdjudicationReportFRData10(truth, changed)).toThrow(/provider-blind human adjudication/);
  });

  it('rejects upstream FR-DATA-07 annotation-ledger digest drift', () => {
    const truth = groundTruth();
    const dataset = adjudicationDataset(truth);
    const changed = rehash({ ...dataset, upstreamAnnotationLedgerDigest: digest('f') });
    expect(() => buildIndependentFaceAdjudicationReportFRData10(truth, changed)).toThrow(/exactly match FR-DATA-07/);
  });

  it('rejects canonical adjudication-ledger digest drift', () => {
    const truth = groundTruth();
    const dataset = adjudicationDataset(truth);
    expect(() => buildIndependentFaceAdjudicationReportFRData10(truth, { ...dataset, adjudicationLedgerDigest: digest('9') })).toThrow(/does not match the canonical/);
  });

  it('rejects adjudications recorded after the declared ledger freeze', () => {
    const truth = groundTruth();
    const dataset = adjudicationDataset(truth);
    const changed = rehash({
      ...dataset,
      adjudications: dataset.adjudications.map((entry) => entry.captureRef === 'c2'
        ? { ...entry, adjudicatedAt: '2026-01-01T00:31:00.000Z' }
        : entry),
    });
    expect(() => buildIndependentFaceAdjudicationReportFRData10(truth, changed)).toThrow(/cannot freeze before/);
  });

  it('refuses to emit a report from an unfrozen adjudication ledger', () => {
    const truth = groundTruth();
    const dataset = adjudicationDataset(truth);
    const changed: IndependentFaceAdjudicationDatasetFRData10V1 = {
      ...dataset,
      adjudicationLedgerFrozen: false,
      adjudicationLedgerDigest: null,
      adjudicationLedgerFrozenAt: null,
    };
    expect(() => buildIndependentFaceAdjudicationReportFRData10(truth, changed)).toThrow(/must be frozen/);
  });

  it('keeps all empirical thresholds and semantic authority fail-closed', () => {
    const authority = INDEPENDENT_FACE_ADJUDICATION_AUTHORITY_FRDATA10;
    expect(authority.protocol.minimumIndependentAnnotatorsPerCapture).toBeNull();
    expect(authority.protocol.minimumAdjudicatorsPerCapture).toBeNull();
    expect(authority.protocol.interAnnotatorAgreementThreshold).toBeNull();
    expect(authority.protocol.adjudicationDecisionThreshold).toBeNull();
    expect(authority.protocol.automaticMajorityRuleAllowed).toBe(false);
    expect(authority.protocol.automaticUnanimityRuleAllowed).toBe(false);
    expect(authority.protocol.annotationCountRuleAllowed).toBe(false);
    expect(Object.values(authority.authorityBoundary).every((value) => value === false)).toBe(true);
  });

  it('always blocks empirical, semantic, or production promotion', () => {
    expect(() => assertIndependentFaceAdjudicationReadyForPromotionFRData10()).toThrow(/do not establish reviewed ground-truth authority/);
  });
});
