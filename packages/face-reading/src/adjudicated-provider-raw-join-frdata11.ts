import type { IndependentFaceGroundTruthDatasetFRData07V1 } from './independent-face-ground-truth-frdata07.js';
import type {
  IndependentFaceAdjudicationDatasetFRData10V1,
  IndependentFaceAdjudicationOutcomeFRData10V1,
} from './independent-face-adjudication-frdata10.js';
import { buildIndependentFaceAdjudicationReportFRData10 } from './independent-face-adjudication-frdata10.js';
import type { MentonDatasetProviderFaceCandidateObservationReportFRData06V1 } from './provider-face-candidate-observations-frdata06.js';
import { buildProviderRunIdentityBindingReportFRData09 } from './provider-run-identity-binding-frdata09.js';
import { FaceAuthorityValidationError } from './validation.js';

export type ProviderCandidateCountBucketFRData11V1 =
  | 'zero_provider_candidates'
  | 'one_provider_candidate';

export interface AdjudicatedProviderRawJoinProtocolFRData11V1 {
  readonly groundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1';
  readonly providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1';
  readonly providerRunBindingSchemaRef: 'fr-data09-provider-run-identity-binding-v1';
  readonly adjudicationDatasetSchemaRef: 'fr-data10-independent-face-count-adjudication-v1';
  readonly adjudicationReportSchemaRef: 'fr-data10-independent-face-count-adjudication-report-v1';
  readonly joinUnit: 'capture_adjudication_provider_observation';
  readonly exactDatasetRefMatchRequired: true;
  readonly exactCaptureRefSetMatchRequired: true;
  readonly exactAssetDigestMatchRequired: true;
  readonly exactProviderRunBindingRequired: true;
  readonly frozenAdjudicationLedgerRequired: true;
  readonly providerCandidateCountDomain: readonly [0, 1];
  readonly zeroProviderCandidatesBucket: 'zero_provider_candidates';
  readonly oneProviderCandidateBucket: 'one_provider_candidate';
  readonly adjudicationOutcomeVocabulary: readonly [
    'zero_human_faces',
    'one_human_face',
    'multiple_human_faces',
    'indeterminate',
    'unresolved',
  ];
  readonly indeterminateMustRemainDistinct: true;
  readonly unresolvedMustRemainDistinct: true;
  readonly unresolvedMayBeDropped: false;
  readonly indeterminateMayBeDropped: false;
  readonly rawCrossTabMayBeComputed: true;
  readonly captureConsensusGroundTruthMayBeInferred: false;
  readonly providerCandidateCountMayBeInterpretedAsHumanFaceCount: false;
  readonly truePositiveFalsePositiveTerminologyAuthorized: false;
  readonly classificationMetricsAuthorized: false;
  readonly metricEligibilityPolicyDefined: false;
  readonly providerDecisionThresholdDefined: false;
  readonly calibrationThresholdDefined: false;
  readonly holdoutMayTuneEvaluationPolicy: false;
}

export interface AdjudicatedProviderRawJoinRowFRData11V1 {
  readonly captureRef: string;
  readonly partition: 'calibration' | 'holdout';
  readonly canonicalAssetDigest: string;
  readonly adjudicationOutcome: IndependentFaceAdjudicationOutcomeFRData10V1;
  readonly providerCandidateCount: 0 | 1;
  readonly providerCandidateCountBucket: ProviderCandidateCountBucketFRData11V1;
  readonly providerRunRef: string;
  readonly providerReportDigest: string;
  readonly adjudicationLedgerDigest: string;
  readonly exactAssetDigestMatched: true;
  readonly exactProviderRunBindingMatched: true;
  readonly frozenAdjudicationLedgerBound: true;
}

export interface AdjudicatedProviderRawCrossTabRowFRData11V1 {
  readonly adjudicationOutcome: IndependentFaceAdjudicationOutcomeFRData10V1;
  readonly zeroProviderCandidates: number;
  readonly oneProviderCandidate: number;
  readonly total: number;
}

export interface AdjudicatedProviderRawJoinReportFRData11V1 {
  readonly schemaVersion: 'fr-data11-adjudicated-provider-raw-join-v1';
  readonly datasetRef: string;
  readonly providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1';
  readonly providerRunBindingSchemaRef: 'fr-data09-provider-run-identity-binding-v1';
  readonly adjudicationDatasetSchemaRef: 'fr-data10-independent-face-count-adjudication-v1';
  readonly adjudicationReportSchemaRef: 'fr-data10-independent-face-count-adjudication-report-v1';
  readonly providerReportDigest: string;
  readonly adjudicationLedgerDigest: string;
  readonly captureCount: number;
  readonly rows: readonly AdjudicatedProviderRawJoinRowFRData11V1[];
  readonly crossTab: readonly AdjudicatedProviderRawCrossTabRowFRData11V1[];
  readonly exactDatasetRefMatched: true;
  readonly exactCaptureRefSetMatched: true;
  readonly exactAssetDigestJoinVerified: true;
  readonly exactProviderRunBindingVerified: true;
  readonly frozenAdjudicationLedgerRequiredBeforeJoin: true;
  readonly adjudicatedOutcomeProviderRawJoinPerformed: true;
  readonly rawCrossTabComputed: true;
  readonly indeterminatePreserved: true;
  readonly unresolvedPreserved: true;
  readonly captureConsensusGroundTruthAuthorityValidated: false;
  readonly interAnnotatorGroundTruthAuthorityValidated: false;
  readonly providerDetectionConstructValidityValidated: false;
  readonly providerFaceCandidateHumanIdentityValidated: false;
  readonly facePresenceVerified: false;
  readonly singleHumanFaceVerified: false;
  readonly truePositiveFalsePositiveTerminologyAuthorized: false;
  readonly classificationMetricsComputed: false;
  readonly sensitivityComputed: false;
  readonly specificityComputed: false;
  readonly accuracyComputed: false;
  readonly precisionComputed: false;
  readonly recallComputed: false;
  readonly fScoreComputed: false;
  readonly rocAucComputed: false;
  readonly metricEligibilityPolicyDefined: false;
  readonly providerDecisionThresholdDefined: false;
  readonly calibrationThresholdsDefined: false;
  readonly holdoutUsedForTuning: false;
  readonly nearDuplicatePartitionLeakageValidated: false;
  readonly reviewedEmpiricalValidationCompleted: false;
  readonly externalProviderExecutionIdentityVerified: false;
  readonly captureQualityAuthorityValidated: false;
  readonly anatomicalLandmarkAuthorityValidated: false;
  readonly traditionalSemanticAuthorityValidated: false;
  readonly fr35PointToContourRelationValidated: false;
  readonly traditionalDigeEquivalenceValidated: false;
  readonly fr36VerticalReferencePromoted: false;
  readonly productionThreeDivisionsMetricAllowed: false;
  readonly productionF1Allowed: false;
  readonly productionF6Allowed: false;
  readonly researchCandidateAdmitted: false;
  readonly productionGeometryAuthorized: false;
}

export interface AdjudicatedProviderRawJoinAuthorityFRData11V1 {
  readonly schemaVersion: 'fr-data11-v1';
  readonly authorityRef: 'authority.face.adjudicated_provider_raw_join.frdata11';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'raw_join_contract_defined_no_metric_or_ground_truth_authority';
  readonly protocol: AdjudicatedProviderRawJoinProtocolFRData11V1;
  readonly authorityBoundary: {
    readonly rawJoinMeansGroundTruthAuthorityValidated: false;
    readonly rawCrossTabMeansGroundTruthAuthorityValidated: false;
    readonly adjudicatedOutcomeMeansReviewedEmpiricalGroundTruthAuthority: false;
    readonly providerCandidateCountMeansHumanFaceCount: false;
    readonly rawCrossTabMayBeCalledConfusionMatrix: false;
    readonly rawCrossTabMayAuthorizeClassificationMetrics: false;
    readonly unresolvedMayBeExcludedWithoutPolicy: false;
    readonly indeterminateMayBeExcludedWithoutPolicy: false;
    readonly providerRunBindingMeansExternalExecutionIdentityVerified: false;
    readonly facePresenceVerified: false;
    readonly singleHumanFaceVerified: false;
    readonly captureQualityAuthorityValidated: false;
    readonly anatomicalLandmarkAuthorityValidated: false;
    readonly traditionalSemanticAuthorityValidated: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
}

const OUTCOMES = Object.freeze([
  'zero_human_faces',
  'one_human_face',
  'multiple_human_faces',
  'indeterminate',
  'unresolved',
] as const);

export const ADJUDICATED_PROVIDER_RAW_JOIN_AUTHORITY_FRDATA11:
AdjudicatedProviderRawJoinAuthorityFRData11V1 = Object.freeze({
  schemaVersion: 'fr-data11-v1' as const,
  authorityRef: 'authority.face.adjudicated_provider_raw_join.frdata11' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'raw_join_contract_defined_no_metric_or_ground_truth_authority' as const,
  protocol: Object.freeze({
    groundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1' as const,
    providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1' as const,
    providerRunBindingSchemaRef: 'fr-data09-provider-run-identity-binding-v1' as const,
    adjudicationDatasetSchemaRef: 'fr-data10-independent-face-count-adjudication-v1' as const,
    adjudicationReportSchemaRef: 'fr-data10-independent-face-count-adjudication-report-v1' as const,
    joinUnit: 'capture_adjudication_provider_observation' as const,
    exactDatasetRefMatchRequired: true as const,
    exactCaptureRefSetMatchRequired: true as const,
    exactAssetDigestMatchRequired: true as const,
    exactProviderRunBindingRequired: true as const,
    frozenAdjudicationLedgerRequired: true as const,
    providerCandidateCountDomain: Object.freeze([0, 1] as const),
    zeroProviderCandidatesBucket: 'zero_provider_candidates' as const,
    oneProviderCandidateBucket: 'one_provider_candidate' as const,
    adjudicationOutcomeVocabulary: OUTCOMES,
    indeterminateMustRemainDistinct: true as const,
    unresolvedMustRemainDistinct: true as const,
    unresolvedMayBeDropped: false as const,
    indeterminateMayBeDropped: false as const,
    rawCrossTabMayBeComputed: true as const,
    captureConsensusGroundTruthMayBeInferred: false as const,
    providerCandidateCountMayBeInterpretedAsHumanFaceCount: false as const,
    truePositiveFalsePositiveTerminologyAuthorized: false as const,
    classificationMetricsAuthorized: false as const,
    metricEligibilityPolicyDefined: false as const,
    providerDecisionThresholdDefined: false as const,
    calibrationThresholdDefined: false as const,
    holdoutMayTuneEvaluationPolicy: false as const,
  }),
  authorityBoundary: Object.freeze({
    rawJoinMeansGroundTruthAuthorityValidated: false as const,
    rawCrossTabMeansGroundTruthAuthorityValidated: false as const,
    adjudicatedOutcomeMeansReviewedEmpiricalGroundTruthAuthority: false as const,
    providerCandidateCountMeansHumanFaceCount: false as const,
    rawCrossTabMayBeCalledConfusionMatrix: false as const,
    rawCrossTabMayAuthorizeClassificationMetrics: false as const,
    unresolvedMayBeExcludedWithoutPolicy: false as const,
    indeterminateMayBeExcludedWithoutPolicy: false as const,
    providerRunBindingMeansExternalExecutionIdentityVerified: false as const,
    facePresenceVerified: false as const,
    singleHumanFaceVerified: false as const,
    captureQualityAuthorityValidated: false as const,
    anatomicalLandmarkAuthorityValidated: false as const,
    traditionalSemanticAuthorityValidated: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
});

function fail(message: string): never {
  throw new FaceAuthorityValidationError(`FR-DATA-11 ${message}`);
}

function validateAuthority(): AdjudicatedProviderRawJoinAuthorityFRData11V1 {
  const authority = ADJUDICATED_PROVIDER_RAW_JOIN_AUTHORITY_FRDATA11;
  const protocol = authority.protocol;
  if (
    authority.schemaVersion !== 'fr-data11-v1' ||
    authority.authorityRef !== 'authority.face.adjudicated_provider_raw_join.frdata11' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'raw_join_contract_defined_no_metric_or_ground_truth_authority' ||
    protocol.groundTruthSchemaRef !== 'fr-data07-independent-face-ground-truth-v1' ||
    protocol.providerObservationSchemaRef !== 'fr-data06-provider-face-candidate-observation-v1' ||
    protocol.providerRunBindingSchemaRef !== 'fr-data09-provider-run-identity-binding-v1' ||
    protocol.adjudicationDatasetSchemaRef !== 'fr-data10-independent-face-count-adjudication-v1' ||
    protocol.adjudicationReportSchemaRef !== 'fr-data10-independent-face-count-adjudication-report-v1' ||
    protocol.joinUnit !== 'capture_adjudication_provider_observation' ||
    protocol.exactDatasetRefMatchRequired !== true ||
    protocol.exactCaptureRefSetMatchRequired !== true ||
    protocol.exactAssetDigestMatchRequired !== true ||
    protocol.exactProviderRunBindingRequired !== true ||
    protocol.frozenAdjudicationLedgerRequired !== true ||
    protocol.providerCandidateCountDomain.length !== 2 ||
    protocol.providerCandidateCountDomain[0] !== 0 ||
    protocol.providerCandidateCountDomain[1] !== 1 ||
    protocol.zeroProviderCandidatesBucket !== 'zero_provider_candidates' ||
    protocol.oneProviderCandidateBucket !== 'one_provider_candidate' ||
    protocol.adjudicationOutcomeVocabulary.length !== OUTCOMES.length ||
    protocol.adjudicationOutcomeVocabulary.some((value, index) => value !== OUTCOMES[index]) ||
    protocol.indeterminateMustRemainDistinct !== true ||
    protocol.unresolvedMustRemainDistinct !== true ||
    protocol.unresolvedMayBeDropped !== false ||
    protocol.indeterminateMayBeDropped !== false ||
    protocol.rawCrossTabMayBeComputed !== true ||
    protocol.captureConsensusGroundTruthMayBeInferred !== false ||
    protocol.providerCandidateCountMayBeInterpretedAsHumanFaceCount !== false ||
    protocol.truePositiveFalsePositiveTerminologyAuthorized !== false ||
    protocol.classificationMetricsAuthorized !== false ||
    protocol.metricEligibilityPolicyDefined !== false ||
    protocol.providerDecisionThresholdDefined !== false ||
    protocol.calibrationThresholdDefined !== false ||
    protocol.holdoutMayTuneEvaluationPolicy !== false
  ) fail('authority/protocol drift.');
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    fail('authority boundary must remain fully fail-closed.');
  }
  return authority;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

function providerBucket(count: number): { readonly count: 0 | 1; readonly bucket: ProviderCandidateCountBucketFRData11V1 } {
  if (count === 0) return { count: 0, bucket: 'zero_provider_candidates' };
  if (count === 1) return { count: 1, bucket: 'one_provider_candidate' };
  return fail('provider candidate count must remain in the FR-DATA-06 numFaces=1 domain 0..1.');
}

export function buildAdjudicatedProviderRawJoinReportFRData11(
  groundTruthDataset: IndependentFaceGroundTruthDatasetFRData07V1,
  adjudicationDataset: IndependentFaceAdjudicationDatasetFRData10V1,
  providerReport: MentonDatasetProviderFaceCandidateObservationReportFRData06V1,
): AdjudicatedProviderRawJoinReportFRData11V1 {
  validateAuthority();

  const adjudicationReport = buildIndependentFaceAdjudicationReportFRData10(groundTruthDataset, adjudicationDataset);
  const providerBindingReport = buildProviderRunIdentityBindingReportFRData09(groundTruthDataset, providerReport);

  if (adjudicationReport.datasetRef !== groundTruthDataset.datasetRef || providerBindingReport.datasetRef !== groundTruthDataset.datasetRef ||
      providerReport.datasetRef !== groundTruthDataset.datasetRef || adjudicationDataset.datasetRef !== groundTruthDataset.datasetRef) {
    fail('all upstream datasetRef values must match exactly.');
  }
  if (adjudicationReport.adjudicationLedgerDigest !== adjudicationDataset.adjudicationLedgerDigest ||
      adjudicationDataset.adjudicationLedgerDigest === null || !adjudicationDataset.adjudicationLedgerFrozen) {
    fail('a frozen exact FR-DATA-10 adjudication ledger is required before raw join.');
  }
  const adjudicationLedgerDigest = adjudicationDataset.adjudicationLedgerDigest;
  if (
    adjudicationReport.exactCaptureAdjudicationCoverageVerified !== true ||
    adjudicationReport.exactIndependentAnnotationReviewSetCoverageVerified !== true ||
    adjudicationReport.providerBlindAdjudicationRecordedForEveryCapture !== true ||
    providerBindingReport.exactCaptureRefSetMatched !== true ||
    providerBindingReport.exactAssetDigestJoinVerified !== true ||
    providerBindingReport.providerRunRefToExactReportInstanceBindingVerified !== true ||
    providerBindingReport.providerRunRefToExactCaptureObservationBindingVerified !== true
  ) fail('FR-DATA-09/10 exact binding prerequisites are incomplete.');

  const expectedCaptureRefs = groundTruthDataset.captures.map((entry) => entry.captureRef);
  if (!sameStringSet(providerReport.captureObservations.map((entry) => entry.captureRef), expectedCaptureRefs) ||
      !sameStringSet(adjudicationDataset.adjudications.map((entry) => entry.captureRef), expectedCaptureRefs) ||
      !sameStringSet(providerBindingReport.captureBindings.map((entry) => entry.captureRef), expectedCaptureRefs)) {
    fail('provider/adjudication/binding capture sets must exactly match FR-DATA-07.');
  }

  const providerByCapture = new Map(providerReport.captureObservations.map((entry) => [entry.captureRef, entry] as const));
  const adjudicationByCapture = new Map(adjudicationDataset.adjudications.map((entry) => [entry.captureRef, entry] as const));
  const bindingByCapture = new Map(providerBindingReport.captureBindings.map((entry) => [entry.captureRef, entry] as const));

  const rows = groundTruthDataset.captures.map((capture) => {
    const provider = providerByCapture.get(capture.captureRef);
    const adjudication = adjudicationByCapture.get(capture.captureRef);
    const binding = bindingByCapture.get(capture.captureRef);
    if (provider === undefined || adjudication === undefined || binding === undefined) {
      fail(`capture ${capture.captureRef} is missing one or more validated upstream records.`);
    }
    if (provider.actualDigest !== capture.canonicalAssetDigest || adjudication.observedAssetDigest !== capture.canonicalAssetDigest ||
        binding.canonicalAssetDigest !== capture.canonicalAssetDigest) {
      fail(`capture ${capture.captureRef} exact asset digest mismatch.`);
    }
    if (capture.providerRunRef === null || binding.providerRunRef !== capture.providerRunRef ||
        binding.expectedProviderRunRef !== capture.providerRunRef) {
      fail(`capture ${capture.captureRef} provider run binding mismatch.`);
    }
    const normalized = providerBucket(provider.faceCandidateCount);
    return Object.freeze({
      captureRef: capture.captureRef,
      partition: capture.partition,
      canonicalAssetDigest: capture.canonicalAssetDigest,
      adjudicationOutcome: adjudication.outcome,
      providerCandidateCount: normalized.count,
      providerCandidateCountBucket: normalized.bucket,
      providerRunRef: capture.providerRunRef,
      providerReportDigest: providerBindingReport.providerReportDigest,
      adjudicationLedgerDigest,
      exactAssetDigestMatched: true as const,
      exactProviderRunBindingMatched: true as const,
      frozenAdjudicationLedgerBound: true as const,
    });
  });

  const counts = new Map<IndependentFaceAdjudicationOutcomeFRData10V1, { zero: number; one: number }>(
    OUTCOMES.map((outcome) => [outcome, { zero: 0, one: 0 }] as const),
  );
  for (const row of rows) {
    const cell = counts.get(row.adjudicationOutcome);
    if (cell === undefined) fail(`unsupported adjudication outcome ${row.adjudicationOutcome}.`);
    if (row.providerCandidateCount === 0) cell.zero += 1;
    else cell.one += 1;
  }
  const crossTab = OUTCOMES.map((outcome) => {
    const cell = counts.get(outcome);
    if (cell === undefined) fail(`missing raw cross-tab cell for ${outcome}.`);
    return Object.freeze({
      adjudicationOutcome: outcome,
      zeroProviderCandidates: cell.zero,
      oneProviderCandidate: cell.one,
      total: cell.zero + cell.one,
    });
  });

  return Object.freeze({
    schemaVersion: 'fr-data11-adjudicated-provider-raw-join-v1' as const,
    datasetRef: groundTruthDataset.datasetRef,
    providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1' as const,
    providerRunBindingSchemaRef: 'fr-data09-provider-run-identity-binding-v1' as const,
    adjudicationDatasetSchemaRef: 'fr-data10-independent-face-count-adjudication-v1' as const,
    adjudicationReportSchemaRef: 'fr-data10-independent-face-count-adjudication-report-v1' as const,
    providerReportDigest: providerBindingReport.providerReportDigest,
    adjudicationLedgerDigest,
    captureCount: rows.length,
    rows: Object.freeze(rows),
    crossTab: Object.freeze(crossTab),
    exactDatasetRefMatched: true as const,
    exactCaptureRefSetMatched: true as const,
    exactAssetDigestJoinVerified: true as const,
    exactProviderRunBindingVerified: true as const,
    frozenAdjudicationLedgerRequiredBeforeJoin: true as const,
    adjudicatedOutcomeProviderRawJoinPerformed: true as const,
    rawCrossTabComputed: true as const,
    indeterminatePreserved: true as const,
    unresolvedPreserved: true as const,
    captureConsensusGroundTruthAuthorityValidated: false as const,
    interAnnotatorGroundTruthAuthorityValidated: false as const,
    providerDetectionConstructValidityValidated: false as const,
    providerFaceCandidateHumanIdentityValidated: false as const,
    facePresenceVerified: false as const,
    singleHumanFaceVerified: false as const,
    truePositiveFalsePositiveTerminologyAuthorized: false as const,
    classificationMetricsComputed: false as const,
    sensitivityComputed: false as const,
    specificityComputed: false as const,
    accuracyComputed: false as const,
    precisionComputed: false as const,
    recallComputed: false as const,
    fScoreComputed: false as const,
    rocAucComputed: false as const,
    metricEligibilityPolicyDefined: false as const,
    providerDecisionThresholdDefined: false as const,
    calibrationThresholdsDefined: false as const,
    holdoutUsedForTuning: false as const,
    nearDuplicatePartitionLeakageValidated: false as const,
    reviewedEmpiricalValidationCompleted: false as const,
    externalProviderExecutionIdentityVerified: false as const,
    captureQualityAuthorityValidated: false as const,
    anatomicalLandmarkAuthorityValidated: false as const,
    traditionalSemanticAuthorityValidated: false as const,
    fr35PointToContourRelationValidated: false as const,
    traditionalDigeEquivalenceValidated: false as const,
    fr36VerticalReferencePromoted: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
    researchCandidateAdmitted: false as const,
    productionGeometryAuthorized: false as const,
  });
}

export function assertAdjudicatedProviderRawJoinReadyForPromotionFRData11(): never {
  validateAuthority();
  return fail(
    'a frozen adjudication-to-provider raw join and raw cross-tab are evidence organization only; without reviewed ground-truth authority and an explicit metric-eligibility policy they do not authorize confusion-matrix terminology, classification metrics, thresholds, anatomy, traditional semantics, or production geometry.',
  );
}
