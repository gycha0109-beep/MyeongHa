import type { IndependentFaceGroundTruthDatasetFRData07V1 } from './independent-face-ground-truth-frdata07.js';
import type { IndependentFaceAdjudicationDatasetFRData10V1 } from './independent-face-adjudication-frdata10.js';
import type { MentonDatasetProviderFaceCandidateObservationReportFRData06V1 } from './provider-face-candidate-observations-frdata06.js';
import {
  buildAdjudicatedProviderRawJoinReportFRData11,
  type AdjudicatedProviderRawCrossTabRowFRData11V1,
} from './adjudicated-provider-raw-join-frdata11.js';
import { FaceAuthorityValidationError } from './validation.js';

export type MetricEligibilityBlockerFRData12V1 =
  | 'reviewed_capture_ground_truth_authority'
  | 'provider_detection_construct_validity'
  | 'provider_candidate_human_identity'
  | 'explicit_human_outcome_metric_roles'
  | 'explicit_provider_output_metric_roles'
  | 'explicit_outcome_exclusion_policy'
  | 'explicit_metric_denominator_policy'
  | 'evaluation_policy_frozen_before_holdout_inspection';

export interface MetricEligibilityReadinessProtocolFRData12V1 {
  readonly rawJoinSchemaRef: 'fr-data11-adjudicated-provider-raw-join-v1';
  readonly assessmentUnit: 'frdata11_raw_join_report';
  readonly exactRawJoinRequired: true;
  readonly frozenAdjudicationLedgerRequired: true;
  readonly exactProviderRunBindingRequired: true;
  readonly rawCrossTabMustRemainNonConfusionMatrix: true;
  readonly frData12MayAssignMetricRoles: false;
  readonly positiveNegativeMappingMayBeInferredFromOutcomeNames: false;
  readonly zeroHumanFacesMayBeAssumedNegative: false;
  readonly oneHumanFaceMayBeAssumedPositive: false;
  readonly multipleHumanFacesMayBeCollapsedIntoBinaryClass: false;
  readonly indeterminateMayBeAutoExcluded: false;
  readonly unresolvedMayBeAutoExcluded: false;
  readonly zeroProviderCandidatesMayBeAssumedNegative: false;
  readonly oneProviderCandidateMayBeAssumedPositive: false;
  readonly calibrationPerformanceMayDefineEvaluationSemantics: false;
  readonly holdoutPerformanceMayDefineOrTuneEvaluationSemantics: false;
  readonly reviewedGroundTruthAuthorityRequiredForMetricAuthorization: true;
  readonly providerDetectionConstructValidityRequiredForMetricAuthorization: true;
  readonly providerCandidateHumanIdentityRequiredForMetricAuthorization: true;
  readonly explicitHumanOutcomeMetricRolePolicyRequired: true;
  readonly explicitProviderOutputMetricRolePolicyRequired: true;
  readonly explicitOutcomeExclusionPolicyRequired: true;
  readonly explicitMetricDenominatorPolicyRequired: true;
  readonly evaluationPolicyFreezeBeforeHoldoutInspectionRequired: true;
  readonly minimumEvaluationSampleSize: null;
  readonly minimumPerClassSampleSize: null;
  readonly acceptanceThreshold: null;
  readonly binaryDecisionThreshold: null;
  readonly classificationMetricsAuthorized: false;
}

export interface MetricEligibilityReadinessReportFRData12V1 {
  readonly schemaVersion: 'fr-data12-metric-eligibility-readiness-v1';
  readonly datasetRef: string;
  readonly upstreamRawJoinSchemaRef: 'fr-data11-adjudicated-provider-raw-join-v1';
  readonly providerReportDigest: string;
  readonly adjudicationLedgerDigest: string;
  readonly captureCount: number;
  readonly upstreamRawCrossTab: readonly AdjudicatedProviderRawCrossTabRowFRData11V1[];
  readonly rawJoinVerified: true;
  readonly frozenAdjudicationLedgerVerified: true;
  readonly exactProviderRunBindingVerified: true;
  readonly rawCrossTabPreservedAsNonConfusionMatrix: true;
  readonly indeterminatePreserved: true;
  readonly unresolvedPreserved: true;
  readonly metricReadinessState: 'blocked_missing_reviewed_semantic_and_empirical_authority';
  readonly blockedPrerequisites: readonly MetricEligibilityBlockerFRData12V1[];
  readonly reviewedCaptureGroundTruthAuthorityValidated: false;
  readonly interAnnotatorGroundTruthAuthorityValidated: false;
  readonly providerDetectionConstructValidityValidated: false;
  readonly providerCandidateHumanIdentityValidated: false;
  readonly humanOutcomeMetricRolePolicyDefined: false;
  readonly providerOutputMetricRolePolicyDefined: false;
  readonly outcomeExclusionPolicyDefined: false;
  readonly metricDenominatorPolicyDefined: false;
  readonly evaluationPolicyFrozenBeforeHoldoutInspection: false;
  readonly binaryHumanPositiveOutcome: null;
  readonly binaryHumanNegativeOutcome: null;
  readonly binaryProviderPositiveBucket: null;
  readonly binaryProviderNegativeBucket: null;
  readonly excludedHumanOutcomes: null;
  readonly multiclassHumanOutcomeMappingRef: null;
  readonly metricDenominatorPolicyRef: null;
  readonly truePositiveFalsePositiveTerminologyAuthorized: false;
  readonly confusionMatrixAuthorized: false;
  readonly classificationMetricsAuthorized: false;
  readonly classificationMetricsComputed: false;
  readonly sensitivityComputed: false;
  readonly specificityComputed: false;
  readonly accuracyComputed: false;
  readonly precisionComputed: false;
  readonly recallComputed: false;
  readonly fScoreComputed: false;
  readonly rocAucComputed: false;
  readonly providerDecisionThresholdDefined: false;
  readonly calibrationThresholdsDefined: false;
  readonly holdoutUsedForTuning: false;
  readonly nearDuplicatePartitionLeakageValidated: false;
  readonly reviewedEmpiricalValidationCompleted: false;
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

export interface MetricEligibilityReadinessAuthorityFRData12V1 {
  readonly schemaVersion: 'fr-data12-v1';
  readonly authorityRef: 'authority.face.metric_eligibility_readiness.frdata12';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'prerequisite_contract_defined_metric_semantics_blocked';
  readonly protocol: MetricEligibilityReadinessProtocolFRData12V1;
  readonly authorityBoundary: {
    readonly readinessAssessmentMeansMetricPolicyDefined: false;
    readonly readinessAssessmentMeansGroundTruthAuthorityValidated: false;
    readonly rawOutcomeNameMayDefinePositiveNegativeRole: false;
    readonly providerBucketNameMayDefinePositiveNegativeRole: false;
    readonly indeterminateMayBeExcludedWithoutExplicitPolicy: false;
    readonly unresolvedMayBeExcludedWithoutExplicitPolicy: false;
    readonly calibrationDataMayDefineMetricSemantics: false;
    readonly holdoutDataMayDefineMetricSemantics: false;
    readonly rawCrossTabMayBeCalledConfusionMatrix: false;
    readonly readinessAssessmentMayAuthorizeClassificationMetrics: false;
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

const BLOCKERS = Object.freeze([
  'reviewed_capture_ground_truth_authority',
  'provider_detection_construct_validity',
  'provider_candidate_human_identity',
  'explicit_human_outcome_metric_roles',
  'explicit_provider_output_metric_roles',
  'explicit_outcome_exclusion_policy',
  'explicit_metric_denominator_policy',
  'evaluation_policy_frozen_before_holdout_inspection',
] as const satisfies readonly MetricEligibilityBlockerFRData12V1[]);

export const METRIC_ELIGIBILITY_READINESS_AUTHORITY_FRDATA12:
MetricEligibilityReadinessAuthorityFRData12V1 = Object.freeze({
  schemaVersion: 'fr-data12-v1' as const,
  authorityRef: 'authority.face.metric_eligibility_readiness.frdata12' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'prerequisite_contract_defined_metric_semantics_blocked' as const,
  protocol: Object.freeze({
    rawJoinSchemaRef: 'fr-data11-adjudicated-provider-raw-join-v1' as const,
    assessmentUnit: 'frdata11_raw_join_report' as const,
    exactRawJoinRequired: true as const,
    frozenAdjudicationLedgerRequired: true as const,
    exactProviderRunBindingRequired: true as const,
    rawCrossTabMustRemainNonConfusionMatrix: true as const,
    frData12MayAssignMetricRoles: false as const,
    positiveNegativeMappingMayBeInferredFromOutcomeNames: false as const,
    zeroHumanFacesMayBeAssumedNegative: false as const,
    oneHumanFaceMayBeAssumedPositive: false as const,
    multipleHumanFacesMayBeCollapsedIntoBinaryClass: false as const,
    indeterminateMayBeAutoExcluded: false as const,
    unresolvedMayBeAutoExcluded: false as const,
    zeroProviderCandidatesMayBeAssumedNegative: false as const,
    oneProviderCandidateMayBeAssumedPositive: false as const,
    calibrationPerformanceMayDefineEvaluationSemantics: false as const,
    holdoutPerformanceMayDefineOrTuneEvaluationSemantics: false as const,
    reviewedGroundTruthAuthorityRequiredForMetricAuthorization: true as const,
    providerDetectionConstructValidityRequiredForMetricAuthorization: true as const,
    providerCandidateHumanIdentityRequiredForMetricAuthorization: true as const,
    explicitHumanOutcomeMetricRolePolicyRequired: true as const,
    explicitProviderOutputMetricRolePolicyRequired: true as const,
    explicitOutcomeExclusionPolicyRequired: true as const,
    explicitMetricDenominatorPolicyRequired: true as const,
    evaluationPolicyFreezeBeforeHoldoutInspectionRequired: true as const,
    minimumEvaluationSampleSize: null,
    minimumPerClassSampleSize: null,
    acceptanceThreshold: null,
    binaryDecisionThreshold: null,
    classificationMetricsAuthorized: false as const,
  }),
  authorityBoundary: Object.freeze({
    readinessAssessmentMeansMetricPolicyDefined: false as const,
    readinessAssessmentMeansGroundTruthAuthorityValidated: false as const,
    rawOutcomeNameMayDefinePositiveNegativeRole: false as const,
    providerBucketNameMayDefinePositiveNegativeRole: false as const,
    indeterminateMayBeExcludedWithoutExplicitPolicy: false as const,
    unresolvedMayBeExcludedWithoutExplicitPolicy: false as const,
    calibrationDataMayDefineMetricSemantics: false as const,
    holdoutDataMayDefineMetricSemantics: false as const,
    rawCrossTabMayBeCalledConfusionMatrix: false as const,
    readinessAssessmentMayAuthorizeClassificationMetrics: false as const,
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
  throw new FaceAuthorityValidationError(`FR-DATA-12 ${message}`);
}

function validateAuthority(): MetricEligibilityReadinessAuthorityFRData12V1 {
  const authority = METRIC_ELIGIBILITY_READINESS_AUTHORITY_FRDATA12;
  const protocol = authority.protocol;
  if (
    authority.schemaVersion !== 'fr-data12-v1' ||
    authority.authorityRef !== 'authority.face.metric_eligibility_readiness.frdata12' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'prerequisite_contract_defined_metric_semantics_blocked' ||
    protocol.rawJoinSchemaRef !== 'fr-data11-adjudicated-provider-raw-join-v1' ||
    protocol.assessmentUnit !== 'frdata11_raw_join_report' ||
    protocol.exactRawJoinRequired !== true ||
    protocol.frozenAdjudicationLedgerRequired !== true ||
    protocol.exactProviderRunBindingRequired !== true ||
    protocol.rawCrossTabMustRemainNonConfusionMatrix !== true ||
    protocol.frData12MayAssignMetricRoles !== false ||
    protocol.positiveNegativeMappingMayBeInferredFromOutcomeNames !== false ||
    protocol.zeroHumanFacesMayBeAssumedNegative !== false ||
    protocol.oneHumanFaceMayBeAssumedPositive !== false ||
    protocol.multipleHumanFacesMayBeCollapsedIntoBinaryClass !== false ||
    protocol.indeterminateMayBeAutoExcluded !== false ||
    protocol.unresolvedMayBeAutoExcluded !== false ||
    protocol.zeroProviderCandidatesMayBeAssumedNegative !== false ||
    protocol.oneProviderCandidateMayBeAssumedPositive !== false ||
    protocol.calibrationPerformanceMayDefineEvaluationSemantics !== false ||
    protocol.holdoutPerformanceMayDefineOrTuneEvaluationSemantics !== false ||
    protocol.reviewedGroundTruthAuthorityRequiredForMetricAuthorization !== true ||
    protocol.providerDetectionConstructValidityRequiredForMetricAuthorization !== true ||
    protocol.providerCandidateHumanIdentityRequiredForMetricAuthorization !== true ||
    protocol.explicitHumanOutcomeMetricRolePolicyRequired !== true ||
    protocol.explicitProviderOutputMetricRolePolicyRequired !== true ||
    protocol.explicitOutcomeExclusionPolicyRequired !== true ||
    protocol.explicitMetricDenominatorPolicyRequired !== true ||
    protocol.evaluationPolicyFreezeBeforeHoldoutInspectionRequired !== true ||
    protocol.minimumEvaluationSampleSize !== null ||
    protocol.minimumPerClassSampleSize !== null ||
    protocol.acceptanceThreshold !== null ||
    protocol.binaryDecisionThreshold !== null ||
    protocol.classificationMetricsAuthorized !== false
  ) fail('authority/protocol drift.');

  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    fail('authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function buildMetricEligibilityReadinessReportFRData12(
  groundTruthDataset: IndependentFaceGroundTruthDatasetFRData07V1,
  adjudicationDataset: IndependentFaceAdjudicationDatasetFRData10V1,
  providerReport: MentonDatasetProviderFaceCandidateObservationReportFRData06V1,
): MetricEligibilityReadinessReportFRData12V1 {
  validateAuthority();
  const rawJoin = buildAdjudicatedProviderRawJoinReportFRData11(
    groundTruthDataset,
    adjudicationDataset,
    providerReport,
  );

  if (
    rawJoin.schemaVersion !== 'fr-data11-adjudicated-provider-raw-join-v1' ||
    rawJoin.exactDatasetRefMatched !== true ||
    rawJoin.exactCaptureRefSetMatched !== true ||
    rawJoin.exactAssetDigestJoinVerified !== true ||
    rawJoin.exactProviderRunBindingVerified !== true ||
    rawJoin.frozenAdjudicationLedgerRequiredBeforeJoin !== true ||
    rawJoin.adjudicatedOutcomeProviderRawJoinPerformed !== true ||
    rawJoin.rawCrossTabComputed !== true ||
    rawJoin.indeterminatePreserved !== true ||
    rawJoin.unresolvedPreserved !== true
  ) fail('FR-DATA-11 exact raw-join prerequisites are incomplete.');

  if (
    rawJoin.captureConsensusGroundTruthAuthorityValidated !== false ||
    rawJoin.interAnnotatorGroundTruthAuthorityValidated !== false ||
    rawJoin.providerDetectionConstructValidityValidated !== false ||
    rawJoin.providerFaceCandidateHumanIdentityValidated !== false ||
    rawJoin.truePositiveFalsePositiveTerminologyAuthorized !== false ||
    rawJoin.classificationMetricsComputed !== false ||
    rawJoin.metricEligibilityPolicyDefined !== false ||
    rawJoin.providerDecisionThresholdDefined !== false ||
    rawJoin.calibrationThresholdsDefined !== false ||
    rawJoin.holdoutUsedForTuning !== false
  ) fail('FR-DATA-11 semantic/metric authority must remain fail-closed before FR-DATA-12 readiness assessment.');

  if (rawJoin.crossTab.length !== 5) fail('FR-DATA-11 raw cross-tab must preserve all five adjudication outcomes.');

  return Object.freeze({
    schemaVersion: 'fr-data12-metric-eligibility-readiness-v1' as const,
    datasetRef: rawJoin.datasetRef,
    upstreamRawJoinSchemaRef: 'fr-data11-adjudicated-provider-raw-join-v1' as const,
    providerReportDigest: rawJoin.providerReportDigest,
    adjudicationLedgerDigest: rawJoin.adjudicationLedgerDigest,
    captureCount: rawJoin.captureCount,
    upstreamRawCrossTab: Object.freeze(rawJoin.crossTab.map((row) => Object.freeze({ ...row }))),
    rawJoinVerified: true as const,
    frozenAdjudicationLedgerVerified: true as const,
    exactProviderRunBindingVerified: true as const,
    rawCrossTabPreservedAsNonConfusionMatrix: true as const,
    indeterminatePreserved: true as const,
    unresolvedPreserved: true as const,
    metricReadinessState: 'blocked_missing_reviewed_semantic_and_empirical_authority' as const,
    blockedPrerequisites: BLOCKERS,
    reviewedCaptureGroundTruthAuthorityValidated: false as const,
    interAnnotatorGroundTruthAuthorityValidated: false as const,
    providerDetectionConstructValidityValidated: false as const,
    providerCandidateHumanIdentityValidated: false as const,
    humanOutcomeMetricRolePolicyDefined: false as const,
    providerOutputMetricRolePolicyDefined: false as const,
    outcomeExclusionPolicyDefined: false as const,
    metricDenominatorPolicyDefined: false as const,
    evaluationPolicyFrozenBeforeHoldoutInspection: false as const,
    binaryHumanPositiveOutcome: null,
    binaryHumanNegativeOutcome: null,
    binaryProviderPositiveBucket: null,
    binaryProviderNegativeBucket: null,
    excludedHumanOutcomes: null,
    multiclassHumanOutcomeMappingRef: null,
    metricDenominatorPolicyRef: null,
    truePositiveFalsePositiveTerminologyAuthorized: false as const,
    confusionMatrixAuthorized: false as const,
    classificationMetricsAuthorized: false as const,
    classificationMetricsComputed: false as const,
    sensitivityComputed: false as const,
    specificityComputed: false as const,
    accuracyComputed: false as const,
    precisionComputed: false as const,
    recallComputed: false as const,
    fScoreComputed: false as const,
    rocAucComputed: false as const,
    providerDecisionThresholdDefined: false as const,
    calibrationThresholdsDefined: false as const,
    holdoutUsedForTuning: false as const,
    nearDuplicatePartitionLeakageValidated: false as const,
    reviewedEmpiricalValidationCompleted: false as const,
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

export function assertMetricEligibilityReadyForPromotionFRData12(): never {
  validateAuthority();
  return fail(
    'FR-DATA-12 only records why metric semantics are blocked. It does not define positive/negative roles, exclusions, denominators, reviewed ground-truth authority, provider construct validity, classification metrics, thresholds, anatomy, traditional semantics, or production geometry.',
  );
}
