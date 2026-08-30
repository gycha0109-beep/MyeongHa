import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_HUMAN_REFERENCE_REVIEW_ATTESTATION_AUTHORITY_FRDATA15,
  assertExternalHumanReferenceReviewAttestationReadyForPromotionFRData15,
  buildExternalHumanReferenceReviewAttestationReportFRData15,
  buildHumanReferenceReviewPackageFRData15,
  computeHumanReferenceReviewPackageDigestFRData15,
  computeIndependentFaceAdjudicationLedgerDigestFRData10,
  deriveIndependentAnnotationRefFRData10,
  validateHumanReferenceReviewPackageFRData15,
  type ExternalHumanReferenceReviewAttestationFRData15V1,
  type IndependentFaceAdjudicationDatasetFRData10V1,
  type IndependentFaceCountAdjudicationFRData10V1,
  type IndependentFaceCountAnnotationFRData07V1,
  type IndependentFaceGroundTruthDatasetFRData07V1,
} from '../packages/face-reading/src/index.js';

const digest = (char: string) => `sha256:${char.repeat(64)}`;

const fixtures = [
  {
    captureRef: 'review-zero',
    char: 'a',
    partition: 'calibration',
    annotation: 'zero_human_faces',
    outcome: 'zero_human_faces',
  },
  {
    captureRef: 'review-one',
    char: 'b',
    partition: 'calibration',
    annotation: 'one_human_face',
    outcome: 'one_human_face',
  },
  {
    captureRef: 'review-multiple',
    char: 'c',
    partition: 'holdout',
    annotation: 'multiple_human_faces',
    outcome: 'multiple_human_faces',
  },
  {
    captureRef: 'review-indeterminate',
    char: 'd',
    partition: 'calibration',
    annotation: 'indeterminate',
    outcome: 'indeterminate',
  },
  {
    captureRef: 'review-unresolved',
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
    datasetRef: 'dataset:fr-data15-contract-fixture',
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

function attestation(
  reviewPackageDigest: string,
): ExternalHumanReferenceReviewAttestationFRData15V1 {
  return {
    schemaVersion: 'fr-data15-external-human-reference-review-attestation-v1',
    attestationRef: 'external-review:fixture-001',
    reviewPackageDigest,
    reviewerRef: 'external-reviewer:fixture-001',
    reviewerRole: 'independent-human-reference-reviewer',
    reviewerOrganizationRef: 'organization:fixture-review-body',
    reviewEvidenceBundleDigest: digest('7'),
    reviewStatementArtifactDigest: digest('8'),
    detachedSignatureArtifactDigest: digest('9'),
    signerKeyRef: 'signer-key:fixture-001',
    reviewedAt: '2026-01-01T00:40:00.000Z',
    declaredDecision: 'approve_reference_candidate_set',
    reviewerIndependenceDeclared: true,
    reviewedConstructDefinition: true,
    reviewedCompleteReferenceCandidateAdmissionSet: true,
    reviewedPreservedNonScoringOutcomes: true,
    reviewedCanonicalCaptureAssets: true,
    reviewedFrozenIndependentAnnotations: true,
    reviewedFrozenAdjudications: true,
    providerOutputVisibleDuringReview: false,
    providerPerformanceVisibleDuringReview: false,
    providerThresholdsVisibleDuringReview: false,
    providerEvidenceUsedToReachDecision: false,
    automaticDecisionRuleUsed: false,
    syntheticFixtureUsedAsEmpiricalEvidence: false,
  };
}

describe('FR-DATA-15 external human reference review attestation', () => {
  it('builds a deterministic human-only review package bound to FR-DATA-14 evidence', () => {
    const truth = groundTruth();
    const adjudicated = adjudicationDataset(truth);
    const first = buildHumanReferenceReviewPackageFRData15(truth, adjudicated);
    const second = buildHumanReferenceReviewPackageFRData15(truth, adjudicated);

    expect(first).toEqual(second);
    expect(first.reviewPackageDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(first.admissionSetDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(first.providerEvidenceIncluded).toBe(false);
    expect(first.providerPerformanceIncluded).toBe(false);
    expect(first.providerThresholdsIncluded).toBe(false);
    expect(first.captureCount).toBe(5);
    expect(first.admittedReferenceCandidateCount).toBe(3);
    expect(first.preservedNonScoringIndeterminateCount).toBe(1);
    expect(first.preservedNonScoringUnresolvedCount).toBe(1);
  });

  it('changes the package digest when the human admission set changes', () => {
    const truth = groundTruth();
    const firstAdjudicated = adjudicationDataset(truth);
    const first = buildHumanReferenceReviewPackageFRData15(truth, firstAdjudicated);
    const changedBase: IndependentFaceAdjudicationDatasetFRData10V1 = {
      ...firstAdjudicated,
      adjudications: firstAdjudicated.adjudications.map((entry, index) => index === 0 ? {
        ...entry,
        outcome: 'one_human_face',
      } : entry),
      adjudicationLedgerDigest: null,
    };
    const changed: IndependentFaceAdjudicationDatasetFRData10V1 = {
      ...changedBase,
      adjudicationLedgerDigest: computeIndependentFaceAdjudicationLedgerDigestFRData10(changedBase),
    };
    const second = buildHumanReferenceReviewPackageFRData15(truth, changed);

    expect(second.admissionSetDigest).not.toBe(first.admissionSetDigest);
    expect(second.reviewPackageDigest).not.toBe(first.reviewPackageDigest);
  });

  it('validates the canonical package digest and rejects mutated package content', () => {
    const truth = groundTruth();
    const reviewPackage = buildHumanReferenceReviewPackageFRData15(truth, adjudicationDataset(truth));
    const { reviewPackageDigest: _ignored, ...content } = reviewPackage;

    expect(computeHumanReferenceReviewPackageDigestFRData15(content)).toBe(reviewPackage.reviewPackageDigest);
    expect(validateHumanReferenceReviewPackageFRData15(reviewPackage)).toBe(reviewPackage);
    expect(() => validateHumanReferenceReviewPackageFRData15({
      ...reviewPackage,
      captureCount: reviewPackage.captureCount + 1,
    })).toThrow(/capture-count partition|package digest/u);
  });

  it('records an exact-package-bound declared review decision without authenticating external review', () => {
    const truth = groundTruth();
    const adjudicated = adjudicationDataset(truth);
    const reviewPackage = buildHumanReferenceReviewPackageFRData15(truth, adjudicated);
    const result = buildExternalHumanReferenceReviewAttestationReportFRData15(
      truth,
      adjudicated,
      attestation(reviewPackage.reviewPackageDigest),
    );

    expect(result.declaredDecision).toBe('approve_reference_candidate_set');
    expect(result.exactReviewPackageBindingVerified).toBe(true);
    expect(result.exactConstructDefinitionBindingVerified).toBe(true);
    expect(result.exactAnnotationLedgerBindingVerified).toBe(true);
    expect(result.exactAdjudicationLedgerBindingVerified).toBe(true);
    expect(result.exactAdmissionSetBindingVerified).toBe(true);
    expect(result.reviewScopeDeclarationComplete).toBe(true);
    expect(result.providerBlindReviewDeclarationRecorded).toBe(true);
    expect(result.declaredExternalReviewAttestationRecorded).toBe(true);
    expect(result.externalReviewerIdentityVerified).toBe(false);
    expect(result.reviewerCredentialVerified).toBe(false);
    expect(result.cryptographicSignatureVerified).toBe(false);
    expect(result.signerKeyTrustEstablished).toBe(false);
    expect(result.pinnedExternalTrustRootAvailable).toBe(false);
    expect(result.externalReviewAuthenticityValidated).toBe(false);
    expect(result.externalConstructReviewCompleted).toBe(false);
    expect(result.externalReferenceStandardReviewCompleted).toBe(false);
    expect(result.reviewedHumanReferenceStandardAuthorityValidated).toBe(false);
  });

  it('rejects an attestation bound to any other review package digest', () => {
    const truth = groundTruth();
    const adjudicated = adjudicationDataset(truth);

    expect(() => buildExternalHumanReferenceReviewAttestationReportFRData15(
      truth,
      adjudicated,
      attestation(digest('6')),
    )).toThrow(/exact canonical FR-DATA-15 review package digest/u);
  });

  it('rejects provider-visible or provider-influenced external review declarations', () => {
    const truth = groundTruth();
    const adjudicated = adjudicationDataset(truth);
    const reviewPackage = buildHumanReferenceReviewPackageFRData15(truth, adjudicated);
    const valid = attestation(reviewPackage.reviewPackageDigest);
    const changed = {
      ...valid,
      providerPerformanceVisibleDuringReview: true,
    } as unknown as ExternalHumanReferenceReviewAttestationFRData15V1;

    expect(() => buildExternalHumanReferenceReviewAttestationReportFRData15(
      truth,
      adjudicated,
      changed,
    )).toThrow(/provider-blindness/u);
  });

  it('requires the declared external reviewer ref to be separate from human evidence actors', () => {
    const truth = groundTruth();
    const adjudicated = adjudicationDataset(truth);
    const reviewPackage = buildHumanReferenceReviewPackageFRData15(truth, adjudicated);
    const valid = attestation(reviewPackage.reviewPackageDigest);
    const changed: ExternalHumanReferenceReviewAttestationFRData15V1 = {
      ...valid,
      reviewerRef: truth.annotations[0]!.annotatorRef,
    };

    expect(() => buildExternalHumanReferenceReviewAttestationReportFRData15(
      truth,
      adjudicated,
      changed,
    )).toThrow(/distinct from all original annotator and adjudicator refs/u);
  });

  it('rejects a review timestamp that predates the frozen adjudication ledger', () => {
    const truth = groundTruth();
    const adjudicated = adjudicationDataset(truth);
    const reviewPackage = buildHumanReferenceReviewPackageFRData15(truth, adjudicated);
    const valid = attestation(reviewPackage.reviewPackageDigest);
    const changed: ExternalHumanReferenceReviewAttestationFRData15V1 = {
      ...valid,
      reviewedAt: '2026-01-01T00:25:00.000Z',
    };

    expect(() => buildExternalHumanReferenceReviewAttestationReportFRData15(
      truth,
      adjudicated,
      changed,
    )).toThrow(/cannot precede the frozen adjudication ledger/u);
  });

  it('requires canonical evidence, statement, and detached-signature artifact digests', () => {
    const truth = groundTruth();
    const adjudicated = adjudicationDataset(truth);
    const reviewPackage = buildHumanReferenceReviewPackageFRData15(truth, adjudicated);
    const valid = attestation(reviewPackage.reviewPackageDigest);
    const changed: ExternalHumanReferenceReviewAttestationFRData15V1 = {
      ...valid,
      detachedSignatureArtifactDigest: 'sha256:NOT-CANONICAL',
    };

    expect(() => buildExternalHumanReferenceReviewAttestationReportFRData15(
      truth,
      adjudicated,
      changed,
    )).toThrow(/detachedSignatureArtifactDigest must use canonical/u);
  });

  it('does not invent reviewer minima, credential rules, signature algorithms, or acceptance thresholds', () => {
    const protocol = EXTERNAL_HUMAN_REFERENCE_REVIEW_ATTESTATION_AUTHORITY_FRDATA15.protocol;

    expect(protocol.minimumExternalReviewers).toBeNull();
    expect(protocol.requiredReviewerCredential).toBeNull();
    expect(protocol.allowedSignatureAlgorithm).toBeNull();
    expect(protocol.externalReviewAcceptanceThreshold).toBeNull();
    expect(protocol.signatureCryptographicVerificationPerformedByThisSlice).toBe(false);
    expect(protocol.signerKeyTrustEstablishedByThisSlice).toBe(false);
    expect(protocol.pinnedExternalTrustRootDefinedByThisSlice).toBe(false);
    expect(protocol.classificationMetricsAuthorized).toBe(false);
  });

  it('keeps every semantic/performance/production authority boundary fail-closed', () => {
    const truth = groundTruth();
    const adjudicated = adjudicationDataset(truth);
    const reviewPackage = buildHumanReferenceReviewPackageFRData15(truth, adjudicated);
    const result = buildExternalHumanReferenceReviewAttestationReportFRData15(
      truth,
      adjudicated,
      attestation(reviewPackage.reviewPackageDigest),
    );

    expect(result.truePositiveFalsePositiveTerminologyAuthorized).toBe(false);
    expect(result.confusionMatrixAuthorized).toBe(false);
    expect(result.classificationMetricsAuthorized).toBe(false);
    expect(result.classificationMetricsComputed).toBe(false);
    expect(result.providerDecisionThresholdDefined).toBe(false);
    expect(result.captureQualityAuthorityValidated).toBe(false);
    expect(result.anatomicalLandmarkAuthorityValidated).toBe(false);
    expect(result.traditionalSemanticAuthorityValidated).toBe(false);
    expect(result.productionGeometryAuthorized).toBe(false);
    expect(Object.values(
      EXTERNAL_HUMAN_REFERENCE_REVIEW_ATTESTATION_AUTHORITY_FRDATA15.authorityBoundary,
    ).every((value) => value === false)).toBe(true);
  });

  it('keeps promotion fail-closed', () => {
    expect(() => assertExternalHumanReferenceReviewAttestationReadyForPromotionFRData15())
      .toThrow(/FR-DATA-15/u);
  });
});
