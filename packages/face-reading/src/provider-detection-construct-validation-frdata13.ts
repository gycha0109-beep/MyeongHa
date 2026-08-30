import type { IndependentFaceGroundTruthDatasetFRData07V1 } from './independent-face-ground-truth-frdata07.js';
import type { IndependentFaceAdjudicationDatasetFRData10V1 } from './independent-face-adjudication-frdata10.js';
import type { MentonDatasetProviderFaceCandidateObservationReportFRData06V1 } from './provider-face-candidate-observations-frdata06.js';
import { buildMetricEligibilityReadinessReportFRData12 } from './metric-eligibility-readiness-frdata12.js';
import { FaceAuthorityValidationError } from './validation.js';

export type ProviderDetectionConstructValidationBlockerFRData13V1 =
  | 'explicit_construct_target_definition'
  | 'reviewed_human_reference_standard_authority'
  | 'capture_domain_scope_definition'
  | 'out_of_scope_outcome_handling_policy'
  | 'construct_validation_protocol_freeze_before_provider_output_inspection'
  | 'new_unseen_construct_validation_dataset_after_protocol_freeze'
  | 'near_duplicate_partition_leakage_control'
  | 'acceptance_criteria_defined_before_validation_data_inspection'
  | 'provider_candidate_human_identity_validation_evidence'
  | 'external_construct_review_completed';

export interface ProviderDetectionConstructValidationProtocolFRData13V1 {
  readonly upstreamMetricReadinessSchemaRef: 'fr-data12-metric-eligibility-readiness-v1';
  readonly providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1';
  readonly providerRuntime: 'mediapipe_tasks_vision_face_landmarker';
  readonly providerRuntimePackageName: '@mediapipe/tasks-vision';
  readonly providerRuntimePackageVersion: '0.10.35';
  readonly configuredNumFaces: 1;
  readonly configuredProviderCandidateCountRange: readonly [0, 1];
  readonly providerCandidateCountIsProviderConstructOnly: true;
  readonly providerCandidateCountMayDefineHumanFaceCount: false;
  readonly zeroProviderCandidatesMeansNoHumanFace: false;
  readonly oneProviderCandidateMeansOneHumanFace: false;
  readonly exactMultipleHumanFaceCountRepresentableByCandidateCountAloneUnderNumFacesOne: false;
  readonly exactHumanFaceCountConstructMayBeClaimedFromCandidateCountAlone: false;
  readonly targetConstructMustBeDefinedBeforeScoring: true;
  readonly targetConstructMayBeInferredFromProviderOutput: false;
  readonly binaryFacePresenceTaskMayBeAssumed: false;
  readonly exactSingleHumanFaceTaskMayBeAssumed: false;
  readonly exactHumanFaceCountTaskMayBeAssumed: false;
  readonly captureDomainMustBeDefinedBeforeValidationDataInspection: true;
  readonly outcomeHandlingMustBeDefinedBeforeValidationDataInspection: true;
  readonly indeterminateMayBeSilentlyExcluded: false;
  readonly unresolvedMayBeSilentlyExcluded: false;
  readonly multipleHumanFacesMayBeSilentlyCollapsed: false;
  readonly reviewedHumanReferenceStandardRequired: true;
  readonly providerBlindHumanReferenceRequired: true;
  readonly humanReferenceMustFreezeBeforeProviderOutcomeComparison: true;
  readonly providerRuntimeAndModelIdentityMustFreezeBeforeValidation: true;
  readonly currentFRData11HoldoutAlreadyMaterialized: true;
  readonly currentFRData11HoldoutMayServeAsFuturePreregisteredConstructValidationHoldout: false;
  readonly newUnseenValidationDatasetRequiredAfterProtocolFreeze: true;
  readonly nearDuplicateLeakageControlRequired: true;
  readonly acceptanceCriteriaMustBeDefinedBeforeValidationDataInspection: true;
  readonly acceptanceCriteriaMayBeDerivedFromObservedProviderPerformance: false;
  readonly externalConstructReviewRequiredForPromotion: true;
  readonly syntheticFixturesMayValidateProviderConstruct: false;
  readonly minimumValidationCaptures: null;
  readonly minimumCapturesPerConstructStratum: null;
  readonly minimumIndependentReviewers: null;
  readonly acceptanceThreshold: null;
  readonly acceptableFalsePositiveRate: null;
  readonly acceptableFalseNegativeRate: null;
  readonly classificationMetricsAuthorized: false;
  readonly providerDetectionConstructValidityAuthorized: false;
}

export interface ProviderDetectionConstructValidationReadinessReportFRData13V1 {
  readonly schemaVersion: 'fr-data13-provider-detection-construct-validation-readiness-v1';
  readonly datasetRef: string;
  readonly upstreamMetricReadinessSchemaRef: 'fr-data12-metric-eligibility-readiness-v1';
  readonly providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1';
  readonly providerReportDigest: string;
  readonly adjudicationLedgerDigest: string;
  readonly providerRuntimePackageVersion: '0.10.35';
  readonly providerModelDigest: string;
  readonly configuredNumFaces: 1;
  readonly configuredProviderCandidateCountRange: readonly [0, 1];
  readonly observedProviderCandidateCountValues: readonly (0 | 1)[];
  readonly exactProviderRunBindingVerified: true;
  readonly frozenHumanAnnotationAndAdjudicationChainRecorded: true;
  readonly currentHoldoutOutcomeProviderPairingAlreadyMaterialized: true;
  readonly currentHoldoutEligibleAsFuturePreregisteredConstructValidationHoldout: false;
  readonly newUnseenValidationDatasetRequiredAfterProtocolFreeze: true;
  readonly exactMultipleHumanFaceCountRepresentableByCandidateCountAloneUnderNumFacesOne: false;
  readonly exactHumanFaceCountConstructClaimableFromCandidateCountAlone: false;
  readonly constructReadinessState: 'blocked_missing_construct_definition_and_reviewed_empirical_validation';
  readonly blockedPrerequisites: readonly ProviderDetectionConstructValidationBlockerFRData13V1[];
  readonly constructTargetDefined: false;
  readonly binaryFacePresenceConstructSelected: false;
  readonly exactSingleHumanFaceConstructSelected: false;
  readonly exactHumanFaceCountConstructSelected: false;
  readonly captureDomainScopeDefined: false;
  readonly outOfScopeOutcomeHandlingPolicyDefined: false;
  readonly reviewedHumanReferenceStandardAuthorityValidated: false;
  readonly constructValidationProtocolFrozenBeforeProviderOutputInspection: false;
  readonly newUnseenConstructValidationDatasetPresent: false;
  readonly nearDuplicatePartitionLeakageControlValidated: false;
  readonly acceptanceCriteriaDefinedBeforeValidationDataInspection: false;
  readonly externalConstructReviewCompleted: false;
  readonly providerDetectionConstructValidityValidated: false;
  readonly providerFaceCandidateHumanIdentityValidated: false;
  readonly facePresenceVerified: false;
  readonly singleHumanFaceVerified: false;
  readonly truePositiveFalsePositiveTerminologyAuthorized: false;
  readonly confusionMatrixAuthorized: false;
  readonly classificationMetricsAuthorized: false;
  readonly classificationMetricsComputed: false;
  readonly providerDecisionThresholdDefined: false;
  readonly calibrationThresholdsDefined: false;
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

export interface ProviderDetectionConstructValidationAuthorityFRData13V1 {
  readonly schemaVersion: 'fr-data13-v1';
  readonly authorityRef: 'authority.face.provider_detection_construct_validation_protocol.frdata13';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'construct_validation_protocol_defined_no_reviewed_empirical_validation';
  readonly protocol: ProviderDetectionConstructValidationProtocolFRData13V1;
  readonly authorityBoundary: {
    readonly protocolDefinitionMeansConstructValidityValidated: false;
    readonly providerCandidateCountMeansHumanFaceCount: false;
    readonly zeroProviderCandidatesMeansNoHumanFace: false;
    readonly oneProviderCandidateMeansOneHumanFace: false;
    readonly configuredNumFacesOneMeansSingleHumanFaceVerified: false;
    readonly binaryFacePresenceConstructMayBeAssumed: false;
    readonly exactSingleHumanFaceConstructMayBeAssumed: false;
    readonly exactHumanFaceCountConstructMayBeAssumed: false;
    readonly existingMaterializedHoldoutMayBeRequalifiedAsPreregisteredConstructValidationEvidence: false;
    readonly providerBlindAnnotationChainMeansReviewedReferenceAuthorityValidated: false;
    readonly syntheticFixturesMeanConstructValidityValidated: false;
    readonly classificationMetricsAuthorized: false;
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

const CONFIGURED_CANDIDATE_RANGE = Object.freeze([0, 1] as const);

const BLOCKERS = Object.freeze([
  'explicit_construct_target_definition',
  'reviewed_human_reference_standard_authority',
  'capture_domain_scope_definition',
  'out_of_scope_outcome_handling_policy',
  'construct_validation_protocol_freeze_before_provider_output_inspection',
  'new_unseen_construct_validation_dataset_after_protocol_freeze',
  'near_duplicate_partition_leakage_control',
  'acceptance_criteria_defined_before_validation_data_inspection',
  'provider_candidate_human_identity_validation_evidence',
  'external_construct_review_completed',
] as const satisfies readonly ProviderDetectionConstructValidationBlockerFRData13V1[]);

export const PROVIDER_DETECTION_CONSTRUCT_VALIDATION_AUTHORITY_FRDATA13:
ProviderDetectionConstructValidationAuthorityFRData13V1 = Object.freeze({
  schemaVersion: 'fr-data13-v1' as const,
  authorityRef: 'authority.face.provider_detection_construct_validation_protocol.frdata13' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'construct_validation_protocol_defined_no_reviewed_empirical_validation' as const,
  protocol: Object.freeze({
    upstreamMetricReadinessSchemaRef: 'fr-data12-metric-eligibility-readiness-v1' as const,
    providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1' as const,
    providerRuntime: 'mediapipe_tasks_vision_face_landmarker' as const,
    providerRuntimePackageName: '@mediapipe/tasks-vision' as const,
    providerRuntimePackageVersion: '0.10.35' as const,
    configuredNumFaces: 1 as const,
    configuredProviderCandidateCountRange: CONFIGURED_CANDIDATE_RANGE,
    providerCandidateCountIsProviderConstructOnly: true as const,
    providerCandidateCountMayDefineHumanFaceCount: false as const,
    zeroProviderCandidatesMeansNoHumanFace: false as const,
    oneProviderCandidateMeansOneHumanFace: false as const,
    exactMultipleHumanFaceCountRepresentableByCandidateCountAloneUnderNumFacesOne: false as const,
    exactHumanFaceCountConstructMayBeClaimedFromCandidateCountAlone: false as const,
    targetConstructMustBeDefinedBeforeScoring: true as const,
    targetConstructMayBeInferredFromProviderOutput: false as const,
    binaryFacePresenceTaskMayBeAssumed: false as const,
    exactSingleHumanFaceTaskMayBeAssumed: false as const,
    exactHumanFaceCountTaskMayBeAssumed: false as const,
    captureDomainMustBeDefinedBeforeValidationDataInspection: true as const,
    outcomeHandlingMustBeDefinedBeforeValidationDataInspection: true as const,
    indeterminateMayBeSilentlyExcluded: false as const,
    unresolvedMayBeSilentlyExcluded: false as const,
    multipleHumanFacesMayBeSilentlyCollapsed: false as const,
    reviewedHumanReferenceStandardRequired: true as const,
    providerBlindHumanReferenceRequired: true as const,
    humanReferenceMustFreezeBeforeProviderOutcomeComparison: true as const,
    providerRuntimeAndModelIdentityMustFreezeBeforeValidation: true as const,
    currentFRData11HoldoutAlreadyMaterialized: true as const,
    currentFRData11HoldoutMayServeAsFuturePreregisteredConstructValidationHoldout: false as const,
    newUnseenValidationDatasetRequiredAfterProtocolFreeze: true as const,
    nearDuplicateLeakageControlRequired: true as const,
    acceptanceCriteriaMustBeDefinedBeforeValidationDataInspection: true as const,
    acceptanceCriteriaMayBeDerivedFromObservedProviderPerformance: false as const,
    externalConstructReviewRequiredForPromotion: true as const,
    syntheticFixturesMayValidateProviderConstruct: false as const,
    minimumValidationCaptures: null,
    minimumCapturesPerConstructStratum: null,
    minimumIndependentReviewers: null,
    acceptanceThreshold: null,
    acceptableFalsePositiveRate: null,
    acceptableFalseNegativeRate: null,
    classificationMetricsAuthorized: false as const,
    providerDetectionConstructValidityAuthorized: false as const,
  }),
  authorityBoundary: Object.freeze({
    protocolDefinitionMeansConstructValidityValidated: false as const,
    providerCandidateCountMeansHumanFaceCount: false as const,
    zeroProviderCandidatesMeansNoHumanFace: false as const,
    oneProviderCandidateMeansOneHumanFace: false as const,
    configuredNumFacesOneMeansSingleHumanFaceVerified: false as const,
    binaryFacePresenceConstructMayBeAssumed: false as const,
    exactSingleHumanFaceConstructMayBeAssumed: false as const,
    exactHumanFaceCountConstructMayBeAssumed: false as const,
    existingMaterializedHoldoutMayBeRequalifiedAsPreregisteredConstructValidationEvidence: false as const,
    providerBlindAnnotationChainMeansReviewedReferenceAuthorityValidated: false as const,
    syntheticFixturesMeanConstructValidityValidated: false as const,
    classificationMetricsAuthorized: false as const,
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
  throw new FaceAuthorityValidationError(`FR-DATA-13 ${message}`);
}

function validateAuthority(): ProviderDetectionConstructValidationAuthorityFRData13V1 {
  const authority = PROVIDER_DETECTION_CONSTRUCT_VALIDATION_AUTHORITY_FRDATA13;
  const protocol = authority.protocol;
  if (
    authority.schemaVersion !== 'fr-data13-v1' ||
    authority.authorityRef !== 'authority.face.provider_detection_construct_validation_protocol.frdata13' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'construct_validation_protocol_defined_no_reviewed_empirical_validation' ||
    protocol.upstreamMetricReadinessSchemaRef !== 'fr-data12-metric-eligibility-readiness-v1' ||
    protocol.providerObservationSchemaRef !== 'fr-data06-provider-face-candidate-observation-v1' ||
    protocol.providerRuntime !== 'mediapipe_tasks_vision_face_landmarker' ||
    protocol.providerRuntimePackageName !== '@mediapipe/tasks-vision' ||
    protocol.providerRuntimePackageVersion !== '0.10.35' ||
    protocol.configuredNumFaces !== 1 ||
    protocol.configuredProviderCandidateCountRange.length !== 2 ||
    protocol.configuredProviderCandidateCountRange[0] !== 0 ||
    protocol.configuredProviderCandidateCountRange[1] !== 1 ||
    protocol.providerCandidateCountIsProviderConstructOnly !== true ||
    protocol.providerCandidateCountMayDefineHumanFaceCount !== false ||
    protocol.zeroProviderCandidatesMeansNoHumanFace !== false ||
    protocol.oneProviderCandidateMeansOneHumanFace !== false ||
    protocol.exactMultipleHumanFaceCountRepresentableByCandidateCountAloneUnderNumFacesOne !== false ||
    protocol.exactHumanFaceCountConstructMayBeClaimedFromCandidateCountAlone !== false ||
    protocol.targetConstructMustBeDefinedBeforeScoring !== true ||
    protocol.targetConstructMayBeInferredFromProviderOutput !== false ||
    protocol.binaryFacePresenceTaskMayBeAssumed !== false ||
    protocol.exactSingleHumanFaceTaskMayBeAssumed !== false ||
    protocol.exactHumanFaceCountTaskMayBeAssumed !== false ||
    protocol.captureDomainMustBeDefinedBeforeValidationDataInspection !== true ||
    protocol.outcomeHandlingMustBeDefinedBeforeValidationDataInspection !== true ||
    protocol.indeterminateMayBeSilentlyExcluded !== false ||
    protocol.unresolvedMayBeSilentlyExcluded !== false ||
    protocol.multipleHumanFacesMayBeSilentlyCollapsed !== false ||
    protocol.reviewedHumanReferenceStandardRequired !== true ||
    protocol.providerBlindHumanReferenceRequired !== true ||
    protocol.humanReferenceMustFreezeBeforeProviderOutcomeComparison !== true ||
    protocol.providerRuntimeAndModelIdentityMustFreezeBeforeValidation !== true ||
    protocol.currentFRData11HoldoutAlreadyMaterialized !== true ||
    protocol.currentFRData11HoldoutMayServeAsFuturePreregisteredConstructValidationHoldout !== false ||
    protocol.newUnseenValidationDatasetRequiredAfterProtocolFreeze !== true ||
    protocol.nearDuplicateLeakageControlRequired !== true ||
    protocol.acceptanceCriteriaMustBeDefinedBeforeValidationDataInspection !== true ||
    protocol.acceptanceCriteriaMayBeDerivedFromObservedProviderPerformance !== false ||
    protocol.externalConstructReviewRequiredForPromotion !== true ||
    protocol.syntheticFixturesMayValidateProviderConstruct !== false ||
    protocol.minimumValidationCaptures !== null ||
    protocol.minimumCapturesPerConstructStratum !== null ||
    protocol.minimumIndependentReviewers !== null ||
    protocol.acceptanceThreshold !== null ||
    protocol.acceptableFalsePositiveRate !== null ||
    protocol.acceptableFalseNegativeRate !== null ||
    protocol.classificationMetricsAuthorized !== false ||
    protocol.providerDetectionConstructValidityAuthorized !== false
  ) fail('authority/protocol drift.');

  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    fail('authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function buildProviderDetectionConstructValidationReadinessReportFRData13(
  groundTruthDataset: IndependentFaceGroundTruthDatasetFRData07V1,
  adjudicationDataset: IndependentFaceAdjudicationDatasetFRData10V1,
  providerReport: MentonDatasetProviderFaceCandidateObservationReportFRData06V1,
): ProviderDetectionConstructValidationReadinessReportFRData13V1 {
  validateAuthority();

  const metricReadiness = buildMetricEligibilityReadinessReportFRData12(
    groundTruthDataset,
    adjudicationDataset,
    providerReport,
  );

  if (
    metricReadiness.schemaVersion !== 'fr-data12-metric-eligibility-readiness-v1' ||
    metricReadiness.rawJoinVerified !== true ||
    metricReadiness.frozenAdjudicationLedgerVerified !== true ||
    metricReadiness.exactProviderRunBindingVerified !== true ||
    metricReadiness.holdoutOutcomeProviderPairingMaterialized !== true ||
    metricReadiness.currentHoldoutEligibleAsFuturePolicyPreregisteredConfirmatoryHoldout !== false ||
    metricReadiness.newUnseenHoldoutRequiredAfterPolicyFreezeForConfirmatoryMetrics !== true ||
    metricReadiness.reviewedCaptureGroundTruthAuthorityValidated !== false ||
    metricReadiness.providerDetectionConstructValidityValidated !== false ||
    metricReadiness.providerCandidateHumanIdentityValidated !== false ||
    metricReadiness.classificationMetricsAuthorized !== false ||
    metricReadiness.classificationMetricsComputed !== false
  ) fail('FR-DATA-12 readiness boundary is not intact.');

  const provenance = providerReport.providerProvenance;
  if (
    providerReport.schemaVersion !== 'fr-data06-provider-face-candidate-observation-v1' ||
    provenance.providerRuntime !== 'mediapipe_tasks_vision_face_landmarker' ||
    provenance.runtimePackageName !== '@mediapipe/tasks-vision' ||
    provenance.runtimePackageVersion !== '0.10.35' ||
    provenance.numFaces !== 1
  ) fail('provider runtime identity/configuration drift.');

  const observedProviderCandidateCountValues = [...new Set(
    providerReport.captureObservations.map((entry) => entry.faceCandidateCount),
  )].sort((left, right) => left - right);

  if (observedProviderCandidateCountValues.some((value) => value !== 0 && value !== 1)) {
    fail('provider candidate-count observations exceed the configured 0..1 domain.');
  }

  return Object.freeze({
    schemaVersion: 'fr-data13-provider-detection-construct-validation-readiness-v1' as const,
    datasetRef: metricReadiness.datasetRef,
    upstreamMetricReadinessSchemaRef: 'fr-data12-metric-eligibility-readiness-v1' as const,
    providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1' as const,
    providerReportDigest: metricReadiness.providerReportDigest,
    adjudicationLedgerDigest: metricReadiness.adjudicationLedgerDigest,
    providerRuntimePackageVersion: '0.10.35' as const,
    providerModelDigest: provenance.modelDigest,
    configuredNumFaces: 1 as const,
    configuredProviderCandidateCountRange: CONFIGURED_CANDIDATE_RANGE,
    observedProviderCandidateCountValues: Object.freeze(
      observedProviderCandidateCountValues as (0 | 1)[],
    ),
    exactProviderRunBindingVerified: true as const,
    frozenHumanAnnotationAndAdjudicationChainRecorded: true as const,
    currentHoldoutOutcomeProviderPairingAlreadyMaterialized: true as const,
    currentHoldoutEligibleAsFuturePreregisteredConstructValidationHoldout: false as const,
    newUnseenValidationDatasetRequiredAfterProtocolFreeze: true as const,
    exactMultipleHumanFaceCountRepresentableByCandidateCountAloneUnderNumFacesOne: false as const,
    exactHumanFaceCountConstructClaimableFromCandidateCountAlone: false as const,
    constructReadinessState: 'blocked_missing_construct_definition_and_reviewed_empirical_validation' as const,
    blockedPrerequisites: BLOCKERS,
    constructTargetDefined: false as const,
    binaryFacePresenceConstructSelected: false as const,
    exactSingleHumanFaceConstructSelected: false as const,
    exactHumanFaceCountConstructSelected: false as const,
    captureDomainScopeDefined: false as const,
    outOfScopeOutcomeHandlingPolicyDefined: false as const,
    reviewedHumanReferenceStandardAuthorityValidated: false as const,
    constructValidationProtocolFrozenBeforeProviderOutputInspection: false as const,
    newUnseenConstructValidationDatasetPresent: false as const,
    nearDuplicatePartitionLeakageControlValidated: false as const,
    acceptanceCriteriaDefinedBeforeValidationDataInspection: false as const,
    externalConstructReviewCompleted: false as const,
    providerDetectionConstructValidityValidated: false as const,
    providerFaceCandidateHumanIdentityValidated: false as const,
    facePresenceVerified: false as const,
    singleHumanFaceVerified: false as const,
    truePositiveFalsePositiveTerminologyAuthorized: false as const,
    confusionMatrixAuthorized: false as const,
    classificationMetricsAuthorized: false as const,
    classificationMetricsComputed: false as const,
    providerDecisionThresholdDefined: false as const,
    calibrationThresholdsDefined: false as const,
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

export function assertProviderDetectionConstructValidationReadyForPromotionFRData13(): never {
  validateAuthority();
  return fail(
    'FR-DATA-13 defines only the construct-validation protocol/readiness boundary. It does not select a human-face task, validate provider candidate identity, establish a reviewed reference standard, authorize retrospective holdout reuse, define empirical acceptance criteria, compute classification metrics, or authorize anatomy/traditional/production promotion.',
  );
}
