import { describe, expect, it } from 'vitest';
import {
  PROVIDER_FACE_COUNT_RAW_SCORING_AUTHORITY_FRDATA08,
  assertProviderFaceCountRawScoringReadyForPromotionFRData08,
  buildProviderFaceCountRawScoringReportFRData08,
  type IndependentFaceGroundTruthDatasetFRData07V1,
  type MentonDatasetProviderFaceCandidateObservationReportFRData06V1,
} from '../packages/face-reading/src/index.js';

const digest = (char: string) => `sha256:${char.repeat(64)}`;

function capture(
  captureRef: string,
  partition: 'calibration' | 'holdout',
  char: string,
) {
  return {
    captureRef,
    partition,
    canonicalAssetDigest: digest(char),
    sourceProvenanceRef: `source:${captureRef}`,
    sourceInstanceRef: `source-instance:${captureRef}`,
    providerRunRef: `provider-run:${captureRef}`,
    providerRunStartedAt: '2026-01-01T00:20:00.000Z',
    providerRunExecutedAfterAnnotationFreeze: true,
  } as const;
}

function annotation(
  captureRef: string,
  annotatorRef: string,
  char: string,
  label: 'zero_human_faces' | 'one_human_face' | 'multiple_human_faces' | 'indeterminate',
) {
  return {
    captureRef,
    annotatorRef,
    annotationSessionRef: `session:${captureRef}:${annotatorRef}`,
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
  } as const;
}

function groundTruth(): IndependentFaceGroundTruthDatasetFRData07V1 {
  return {
    schemaVersion: 'fr-data07-independent-face-ground-truth-v1',
    datasetRef: 'dataset:fr-data08-contract-fixture',
    providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1',
    captures: [
      capture('c0', 'calibration', 'a'),
      capture('c1', 'calibration', 'b'),
      capture('c2', 'holdout', 'c'),
      capture('c3', 'holdout', 'd'),
    ],
    annotations: [
      annotation('c0', 'ann-a', 'a', 'zero_human_faces'),
      annotation('c1', 'ann-a', 'b', 'one_human_face'),
      annotation('c1', 'ann-b', 'b', 'multiple_human_faces'),
      annotation('c2', 'ann-a', 'c', 'multiple_human_faces'),
      annotation('c3', 'ann-a', 'd', 'indeterminate'),
    ],
    annotationLedgerFrozen: true,
    annotationLedgerDigest: digest('e'),
    annotationLedgerFrozenAt: '2026-01-01T00:10:00.000Z',
    providerRunsExecutedAfterFreeze: true,
  };
}

function candidateSummary() {
  return {
    providerCandidateOrdinal: 0,
    landmarkCount: 478,
    landmarkFieldSet: ['visibility', 'x', 'y', 'z'],
    allXFiniteNormalized: true,
    allYFiniteNormalized: true,
    allZFinite: true,
    allVisibilityFiniteWhenPresent: true,
  } as const;
}

function providerObservation(captureRef: string, char: string, count: 0 | 1) {
  return {
    captureRef,
    relativeAssetPath: `fixtures/${captureRef}.png`,
    actualDigest: digest(char),
    rasterSha256: digest(char === 'f' ? '0' : char),
    faceCandidateCount: count,
    candidateSummaries: count === 1 ? [candidateSummary()] : [],
    faceBlendshapeCount: 0,
    facialTransformationMatrixCount: 0,
  } as const;
}

function providerReport(): MentonDatasetProviderFaceCandidateObservationReportFRData06V1 {
  return {
    schemaVersion: 'fr-data06-provider-face-candidate-observation-v1',
    datasetRef: 'dataset:fr-data08-contract-fixture',
    captureCount: 4,
    providerProvenance: {
      runningMode: 'IMAGE',
      numFaces: 1,
      runtimePackageName: '@mediapipe/tasks-vision',
      runtimePackageVersion: '0.10.35',
      rawProviderResponsePersisted: false,
      rawProviderCoordinatesPersisted: false,
    },
    captureObservations: [
      providerObservation('c0', 'a', 0),
      providerObservation('c1', 'b', 1),
      providerObservation('c2', 'c', 1),
      providerObservation('c3', 'd', 0),
    ],
    rasterIdentityReconfirmedBeforeProviderRun: true,
    mediaPipeRuntimeExecuted: true,
    providerFaceCandidateCountObserved: true,
    providerLandmarkPayloadSummaryObserved: true,
    providerDetectionConstructValidityValidated: false,
    providerFaceCandidateHumanIdentityValidated: false,
    singleHumanFaceVerified: false,
    facePresenceVerified: false,
    captureQualityAuthorityValidated: false,
    empiricalScoringPerformed: false,
    calibrationThresholdsDefined: false,
    fr35PointToContourRelationValidated: false,
    traditionalDigeEquivalenceValidated: false,
    fr36VerticalReferencePromoted: false,
    productionThreeDivisionsMetricAllowed: false,
    productionF1Allowed: false,
    productionF6Allowed: false,
    researchCandidateAdmitted: false,
    productionGeometryAuthorized: false,
  } as unknown as MentonDatasetProviderFaceCandidateObservationReportFRData06V1;
}

describe('FR-DATA-08 provider face-count raw scoring', () => {
  it('joins frozen independent annotations to provider observations without collapsing disagreement', () => {
    const report = buildProviderFaceCountRawScoringReportFRData08(groundTruth(), providerReport());

    expect(report.schemaVersion).toBe('fr-data08-provider-face-count-raw-scoring-v1');
    expect(report.captureCount).toBe(4);
    expect(report.annotationPairCount).toBe(5);
    expect(report.captureJoins.find((entry) => entry.captureRef === 'c1')).toMatchObject({
      annotationCount: 2,
      humanLabelCounts: {
        zeroHumanFaces: 0,
        oneHumanFace: 1,
        multipleHumanFaces: 1,
        indeterminate: 0,
      },
      annotatorDisagreementObserved: true,
      providerFaceCandidateCount: 1,
      providerClass: 'one_provider_candidate',
    });

    const [calibration, holdout] = report.partitionSummaries;
    expect(calibration).toMatchObject({
      partition: 'calibration',
      captureCount: 2,
      annotationPairCount: 3,
      capturesWithAnnotatorDisagreement: 1,
    });
    expect(calibration.crossTab).toEqual([
      { humanLabel: 'zero_human_faces', zeroProviderCandidates: 1, oneProviderCandidate: 0, totalAnnotations: 1 },
      { humanLabel: 'one_human_face', zeroProviderCandidates: 0, oneProviderCandidate: 1, totalAnnotations: 1 },
      { humanLabel: 'multiple_human_faces', zeroProviderCandidates: 0, oneProviderCandidate: 1, totalAnnotations: 1 },
      { humanLabel: 'indeterminate', zeroProviderCandidates: 0, oneProviderCandidate: 0, totalAnnotations: 0 },
    ]);
    expect(holdout.crossTab).toEqual([
      { humanLabel: 'zero_human_faces', zeroProviderCandidates: 0, oneProviderCandidate: 0, totalAnnotations: 0 },
      { humanLabel: 'one_human_face', zeroProviderCandidates: 0, oneProviderCandidate: 0, totalAnnotations: 0 },
      { humanLabel: 'multiple_human_faces', zeroProviderCandidates: 0, oneProviderCandidate: 1, totalAnnotations: 1 },
      { humanLabel: 'indeterminate', zeroProviderCandidates: 1, oneProviderCandidate: 0, totalAnnotations: 1 },
    ]);

    expect(report.captureConsensusLabelDerived).toBe(false);
    expect(report.interAnnotatorGroundTruthAuthorityValidated).toBe(false);
    expect(report.classificationMetricsComputed).toBe(false);
    expect(report.sensitivityComputed).toBe(false);
    expect(report.specificityComputed).toBe(false);
    expect(report.falsePositiveRateComputed).toBe(false);
    expect(report.falseNegativeRateComputed).toBe(false);
    expect(report.holdoutUsedForTuning).toBe(false);
    expect(report.providerRunIdentityBindingVerified).toBe(false);
    expect(report.nearDuplicatePartitionLeakageValidated).toBe(false);
    expect(report.facePresenceVerified).toBe(false);
    expect(report.singleHumanFaceVerified).toBe(false);
    expect(report.productionGeometryAuthorized).toBe(false);
  });

  it('keeps every empirical threshold and metric authority unset in the preregistered authority', () => {
    const protocol = PROVIDER_FACE_COUNT_RAW_SCORING_AUTHORITY_FRDATA08.protocol;
    expect(protocol.scoringUnit).toBe('annotation_provider_pair');
    expect(protocol.captureConsensusLabelDerived).toBe(false);
    expect(protocol.annotatorVotesCollapsed).toBe(false);
    expect(protocol.indeterminateLabelIncludedAsOwnRawRow).toBe(true);
    expect(protocol.providerDecisionThresholdDefined).toBe(false);
    expect(protocol.interAnnotatorAgreementThresholdDefined).toBe(false);
    expect(protocol.acceptableFalsePositiveRateDefined).toBe(false);
    expect(protocol.acceptableFalseNegativeRateDefined).toBe(false);
    expect(protocol.truePositiveFalsePositiveTerminologyAuthorized).toBe(false);
    expect(protocol.sensitivitySpecificityComputationAuthorized).toBe(false);
  });

  it('rejects datasetRef drift', () => {
    const provider = { ...providerReport(), datasetRef: 'dataset:other' };
    expect(() => buildProviderFaceCountRawScoringReportFRData08(groundTruth(), provider)).toThrow(/datasetRef/);
  });

  it('rejects provider capture-set drift', () => {
    const provider = providerReport();
    const changed = {
      ...provider,
      captureCount: 3,
      captureObservations: provider.captureObservations.slice(0, 3),
    } as MentonDatasetProviderFaceCandidateObservationReportFRData06V1;
    expect(() => buildProviderFaceCountRawScoringReportFRData08(groundTruth(), changed)).toThrow(/capture-ref set/);
  });

  it('rejects exact asset-digest drift at the join boundary', () => {
    const provider = providerReport();
    const changed = {
      ...provider,
      captureObservations: provider.captureObservations.map((entry) =>
        entry.captureRef === 'c2' ? { ...entry, actualDigest: digest('f') } : entry,
      ),
    } as MentonDatasetProviderFaceCandidateObservationReportFRData06V1;
    expect(() => buildProviderFaceCountRawScoringReportFRData08(groundTruth(), changed)).toThrow(/exact asset digest/);
  });

  it('rejects missing independent annotation coverage instead of silently dropping captures', () => {
    const truth = groundTruth();
    const changed = {
      ...truth,
      annotations: truth.annotations.filter((entry) => entry.captureRef !== 'c3'),
    } as IndependentFaceGroundTruthDatasetFRData07V1;
    expect(() => buildProviderFaceCountRawScoringReportFRData08(changed, providerReport())).toThrow(/no independent annotation/);
  });

  it('rejects provider candidate counts outside the pinned numFaces=1 domain', () => {
    const provider = providerReport();
    const changed = {
      ...provider,
      captureObservations: provider.captureObservations.map((entry) =>
        entry.captureRef === 'c0'
          ? { ...entry, faceCandidateCount: 2, candidateSummaries: [candidateSummary(), candidateSummary()] }
          : entry,
      ),
    } as unknown as MentonDatasetProviderFaceCandidateObservationReportFRData06V1;
    expect(() => buildProviderFaceCountRawScoringReportFRData08(groundTruth(), changed)).toThrow(/exceeds the preregistered 0\/1 domain/);
  });

  it('rejects upstream face-presence authority promotion', () => {
    const changed = {
      ...providerReport(),
      facePresenceVerified: true,
    } as unknown as MentonDatasetProviderFaceCandidateObservationReportFRData06V1;
    expect(() => buildProviderFaceCountRawScoringReportFRData08(groundTruth(), changed)).toThrow(/unauthorized authority promotion/);
  });

  it('rejects an unfrozen annotation ledger before any raw scoring', () => {
    const truth = groundTruth();
    const changed = {
      ...truth,
      annotationLedgerFrozen: false,
      annotationLedgerDigest: null,
      annotationLedgerFrozenAt: null,
      providerRunsExecutedAfterFreeze: false,
      captures: truth.captures.map((entry) => ({
        ...entry,
        providerRunRef: null,
        providerRunStartedAt: null,
        providerRunExecutedAfterAnnotationFreeze: false,
      })),
    } as IndependentFaceGroundTruthDatasetFRData07V1;
    expect(() => buildProviderFaceCountRawScoringReportFRData08(changed, providerReport())).toThrow(/frozen FR-DATA-07 annotation ledger/);
  });

  it('always blocks production or semantic promotion', () => {
    expect(() => assertProviderFaceCountRawScoringReadyForPromotionFRData08()).toThrow(/descriptive evidence only/);
  });
});