import { describe, expect, it } from 'vitest';
import {
  HUMAN_FACE_CONSTRUCT_REFERENCE_ADMISSION_AUTHORITY_FRDATA14,
  assertHumanFaceConstructReferenceAdmissionReadyForPromotionFRData14,
  buildHumanFaceConstructReferenceAdmissionReportFRData14,
  computeHumanFaceConstructDefinitionDigestFRData14,
  computeIndependentFaceAdjudicationLedgerDigestFRData10,
  deriveIndependentAnnotationRefFRData10,
  type IndependentFaceAdjudicationDatasetFRData10V1,
  type IndependentFaceCountAdjudicationFRData10V1,
  type IndependentFaceCountAnnotationFRData07V1,
  type IndependentFaceGroundTruthDatasetFRData07V1,
} from '../packages/face-reading/src/index.js';

const digest = (char: string) => `sha256:${char.repeat(64)}`;

const fixtures = [
  {
    captureRef: 'construct-zero',
    char: 'a',
    partition: 'calibration',
    annotation: 'zero_human_faces',
    outcome: 'zero_human_faces',
  },
  {
    captureRef: 'construct-one',
    char: 'b',
    partition: 'calibration',
    annotation: 'one_human_face',
    outcome: 'one_human_face',
  },
  {
    captureRef: 'construct-multiple',
    char: 'c',
    partition: 'holdout',
    annotation: 'multiple_human_faces',
    outcome: 'multiple_human_faces',
  },
  {
    captureRef: 'construct-indeterminate',
    char: 'd',
    partition: 'calibration',
    annotation: 'indeterminate',
    outcome: 'indeterminate',
  },
  {
    captureRef: 'construct-unresolved',
    char: 'e',
    partition: 'holdout',
    annotation: 'one_human_face',
    outcome: 'unresolved',
  },
] as const;

type HumanLabel = IndependentFaceCountAnnotationFRData07V1['label'];
type Outcome = IndependentFaceCountAdjudicationFRData10V1['outcome'];

function annotation(
  captureRef: string,
  char: string,
  label: HumanLabel,
): IndependentFaceCountAnnotationFRData07V1 {
  return {
    captureRef,
    annotatorRef: `annotator:${captureRef}`,
    annotationSessionRef: `annotation-session:${captureRef}`,
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
    datasetRef: 'dataset:fr-data14-contract-fixture',
    providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1',
    captures: fixtures.map((fixture) => ({
      captureRef: fixture.captureRef,
      partition: fixture.partition,
      canonicalAssetDigest: digest(fixture.char),
      sourceProvenanceRef: `source:${fixture.captureRef}`,
      sourceInstanceRef: `instance:${fixture.captureRef}`,
      providerRunRef: null,
      providerRunStartedAt: null,
      providerRunExecutedAfterAnnotationFreeze: false,
    })),
    annotations: fixtures.map((fixture) => annotation(
      fixture.captureRef,
      fixture.char,
      fixture.annotation,
    )),
    annotationLedgerFrozen: true,
    annotationLedgerDigest: digest('f'),
    annotationLedgerFrozenAt: '2026-01-01T00:10:00.000Z',
    providerRunsExecutedAfterFreeze: false,
  };
}

function adjudication(
  truth: IndependentFaceGroundTruthDatasetFRData07V1,
  captureRef: string,
  char: string,
  outcome: Outcome,
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

function adjudicationDataset(
  truth: IndependentFaceGroundTruthDatasetFRData07V1,
): IndependentFaceAdjudicationDatasetFRData10V1 {
  const base: IndependentFaceAdjudicationDatasetFRData10V1 = {
    schemaVersion: 'fr-data10-independent-face-count-adjudication-v1',
    datasetRef: truth.datasetRef,
    upstreamGroundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1',
    upstreamAnnotationLedgerDigest: truth.annotationLedgerDigest!,
    adjudications: fixtures.map((fixture) => adjudication(
      truth,
      fixture.captureRef,
      fixture.char,
      fixture.outcome,
    )),
    adjudicationLedgerFrozen: true,
    adjudicationLedgerDigest: null,
    adjudicationLedgerFrozenAt: '2026-01-01T00:30:00.000Z',
  };

  return {
    ...base,
    adjudicationLedgerDigest: computeIndependentFaceAdjudicationLedgerDigestFRData10(base),
  };
}

function report() {
  const truth = groundTruth();
  return buildHumanFaceConstructReferenceAdmissionReportFRData14(
    truth,
    adjudicationDataset(truth),
  );
}

describe('FR-DATA-14 human construct and reference-candidate admission', () => {
  it('freezes categorical human face-count state from the existing FR-DATA-07/10 human vocabulary', () => {
    const authority = HUMAN_FACE_CONSTRUCT_REFERENCE_ADMISSION_AUTHORITY_FRDATA14;
    const result = report();

    expect(authority.definition.targetConstruct).toBe('categorical_human_face_count_state');
    expect(authority.definition.sourceGroundTruthLabelVocabulary).toEqual([
      'zero_human_faces',
      'one_human_face',
      'multiple_human_faces',
      'indeterminate',
    ]);
    expect(authority.definition.sourceAdjudicationOutcomeVocabulary).toEqual([
      'zero_human_faces',
      'one_human_face',
      'multiple_human_faces',
      'indeterminate',
      'unresolved',
    ]);
    expect(result.categoricalHumanFaceCountConstructDefined).toBe(true);
    expect(result.constructDefinitionFrozenInAuthorityVersion).toBe(true);
    expect(result.targetConstructDerivedFromExistingHumanLabelAuthority).toBe(true);
    expect(result.constructDefinitionDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(result.constructDefinitionDigest).toBe(computeHumanFaceConstructDefinitionDigestFRData14());
  });

  it('admits only resolved categorical outcomes as reference candidates', () => {
    const result = report();
    const byRef = new Map(result.admissions.map((entry) => [entry.captureRef, entry] as const));

    expect(result.captureCount).toBe(5);
    expect(result.admittedReferenceCandidateCount).toBe(3);
    expect(byRef.get('construct-zero')).toMatchObject({
      admissionState: 'admitted_reference_candidate',
      scoringReferenceClass: 'zero_human_faces',
    });
    expect(byRef.get('construct-one')).toMatchObject({
      admissionState: 'admitted_reference_candidate',
      scoringReferenceClass: 'one_human_face',
    });
    expect(byRef.get('construct-multiple')).toMatchObject({
      admissionState: 'admitted_reference_candidate',
      scoringReferenceClass: 'multiple_human_faces',
    });
  });

  it('preserves indeterminate and unresolved outcomes as explicit non-scoring evidence', () => {
    const result = report();
    const byRef = new Map(result.admissions.map((entry) => [entry.captureRef, entry] as const));

    expect(result.preservedNonScoringIndeterminateCount).toBe(1);
    expect(result.preservedNonScoringUnresolvedCount).toBe(1);
    expect(byRef.get('construct-indeterminate')).toMatchObject({
      admissionState: 'preserved_non_scoring_indeterminate',
      scoringReferenceClass: null,
    });
    expect(byRef.get('construct-unresolved')).toMatchObject({
      admissionState: 'preserved_non_scoring_unresolved',
      scoringReferenceClass: null,
    });
    expect(result.indeterminatePreservedAsNonScoringEvidence).toBe(true);
    expect(result.unresolvedPreservedAsNonScoringEvidence).toBe(true);
  });

  it('does not convert the multiple-face category into an exact numeric face count', () => {
    const authority = HUMAN_FACE_CONSTRUCT_REFERENCE_ADMISSION_AUTHORITY_FRDATA14;
    const result = report();

    expect(authority.definition.multipleHumanFacesMeansExactNumericCount).toBe(false);
    expect(authority.definition.exactNumericHumanFaceCountRepresented).toBe(false);
    expect(authority.protocol.multipleHumanFacesMayBeConvertedToExactNumericCount).toBe(false);
    expect(result.exactNumericHumanFaceCountRepresented).toBe(false);
  });

  it('defines no binary presence, exact-single, or provider-output projection', () => {
    const authority = HUMAN_FACE_CONSTRUCT_REFERENCE_ADMISSION_AUTHORITY_FRDATA14;
    const result = report();

    expect(authority.definition.binaryFacePresenceProjectionDefined).toBe(false);
    expect(authority.definition.exactSingleHumanFaceProjectionDefined).toBe(false);
    expect(authority.definition.providerOutputMappingDefined).toBe(false);
    expect(authority.protocol.binaryPresenceProjectionMayBeInvented).toBe(false);
    expect(authority.protocol.exactSingleProjectionMayBeInvented).toBe(false);
    expect(result.binaryFacePresenceProjectionDefined).toBe(false);
    expect(result.exactSingleHumanFaceProjectionDefined).toBe(false);
    expect(result.providerOutputMappingDefined).toBe(false);
  });

  it('can build the human construct admission report without any provider run present', () => {
    const truth = groundTruth();
    expect(truth.providerRunsExecutedAfterFreeze).toBe(false);
    expect(truth.captures.every((capture) => capture.providerRunRef === null)).toBe(true);

    const result = buildHumanFaceConstructReferenceAdmissionReportFRData14(
      truth,
      adjudicationDataset(truth),
    );

    expect(result.providerEvidenceConsumedToDefineConstruct).toBe(false);
    expect(result.providerDetectionConstructValidityValidated).toBe(false);
    expect(result.providerFaceCandidateHumanIdentityValidated).toBe(false);
  });

  it('inherits exact complete annotation review and provider-blind adjudication requirements', () => {
    const truth = groundTruth();
    const valid = adjudicationDataset(truth);
    const first = valid.adjudications[0]!;
    const changed: IndependentFaceAdjudicationDatasetFRData10V1 = {
      ...valid,
      adjudications: [
        {
          ...first,
          reviewedAnnotationRefs: [],
        },
        ...valid.adjudications.slice(1),
      ],
    };

    expect(() => buildHumanFaceConstructReferenceAdmissionReportFRData14(truth, changed))
      .toThrow(/exact complete independent annotation set/u);
  });

  it('rejects provider-visible adjudication through the upstream human authority gate', () => {
    const truth = groundTruth();
    const valid = adjudicationDataset(truth);
    const first = valid.adjudications[0]!;
    const changed = {
      ...valid,
      adjudications: [
        {
          ...first,
          providerOutputVisibleDuringAdjudication: true,
        },
        ...valid.adjudications.slice(1),
      ],
    } as unknown as IndependentFaceAdjudicationDatasetFRData10V1;

    expect(() => buildHumanFaceConstructReferenceAdmissionReportFRData14(truth, changed))
      .toThrow(/provider-blind human adjudication requirements/u);
  });

  it('does not promote reference candidates into reviewed ground-truth authority or metrics', () => {
    const authority = HUMAN_FACE_CONSTRUCT_REFERENCE_ADMISSION_AUTHORITY_FRDATA14;
    const result = report();

    expect(result.referenceCandidateAdmissionRecorded).toBe(true);
    expect(result.reviewedHumanReferenceStandardAuthorityValidated).toBe(false);
    expect(result.externalConstructReviewCompleted).toBe(false);
    expect(result.externalReferenceStandardReviewCompleted).toBe(false);
    expect(result.truePositiveFalsePositiveTerminologyAuthorized).toBe(false);
    expect(result.confusionMatrixAuthorized).toBe(false);
    expect(result.classificationMetricsAuthorized).toBe(false);
    expect(result.classificationMetricsComputed).toBe(false);
    expect(Object.values(authority.authorityBoundary).every((value) => value === false)).toBe(true);
  });

  it('does not invent empirical minima, agreement thresholds, or admission thresholds', () => {
    const protocol = HUMAN_FACE_CONSTRUCT_REFERENCE_ADMISSION_AUTHORITY_FRDATA14.protocol;

    expect(protocol.minimumReferenceCaptures).toBeNull();
    expect(protocol.minimumIndependentAnnotators).toBeNull();
    expect(protocol.minimumAdjudicators).toBeNull();
    expect(protocol.interAnnotatorAgreementThreshold).toBeNull();
    expect(protocol.referenceAdmissionThreshold).toBeNull();
    expect(protocol.classificationMetricsAuthorized).toBe(false);
  });

  it('keeps promotion fail-closed', () => {
    expect(() => assertHumanFaceConstructReferenceAdmissionReadyForPromotionFRData14())
      .toThrow(/FR-DATA-14/u);
  });
});
