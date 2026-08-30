import { createHash } from 'node:crypto';
import type {
  IndependentFaceGroundTruthDatasetFRData07V1,
  IndependentHumanFaceCountLabelFRData07V1,
} from './independent-face-ground-truth-frdata07.js';
import { INDEPENDENT_FACE_GROUND_TRUTH_AUTHORITY_FRDATA07 } from './independent-face-ground-truth-frdata07.js';
import type {
  IndependentFaceAdjudicationDatasetFRData10V1,
  IndependentFaceAdjudicationOutcomeFRData10V1,
} from './independent-face-adjudication-frdata10.js';
import {
  INDEPENDENT_FACE_ADJUDICATION_AUTHORITY_FRDATA10,
  buildIndependentFaceAdjudicationReportFRData10,
} from './independent-face-adjudication-frdata10.js';
import { PROVIDER_DETECTION_CONSTRUCT_VALIDATION_AUTHORITY_FRDATA13 } from './provider-detection-construct-validation-frdata13.js';
import { FaceAuthorityValidationError } from './validation.js';

export type HumanFaceCountScoringReferenceClassFRData14V1 =
  | 'zero_human_faces'
  | 'one_human_face'
  | 'multiple_human_faces';

export type HumanFaceReferenceCandidateAdmissionStateFRData14V1 =
  | 'admitted_reference_candidate'
  | 'preserved_non_scoring_indeterminate'
  | 'preserved_non_scoring_unresolved';

export interface HumanFaceConstructDefinitionFRData14V1 {
  readonly schemaVersion: 'fr-data14-human-face-construct-definition-v1';
  readonly constructRef: 'construct.face.categorical_human_face_count_state.frdata14';
  readonly constructVersion: '0.1.0';
  readonly targetConstruct: 'categorical_human_face_count_state';
  readonly sourceGroundTruthAuthorityRef: 'authority.face.independent_face_ground_truth_protocol.frdata07';
  readonly sourceAdjudicationAuthorityRef: 'authority.face.independent_face_count_adjudication.frdata10';
  readonly sourceGroundTruthLabelVocabulary: readonly [
    'zero_human_faces',
    'one_human_face',
    'multiple_human_faces',
    'indeterminate',
  ];
  readonly sourceAdjudicationOutcomeVocabulary: readonly [
    'zero_human_faces',
    'one_human_face',
    'multiple_human_faces',
    'indeterminate',
    'unresolved',
  ];
  readonly scoringReferenceClasses: readonly [
    'zero_human_faces',
    'one_human_face',
    'multiple_human_faces',
  ];
  readonly preservedNonScoringOutcomes: readonly ['indeterminate', 'unresolved'];
  readonly multipleHumanFacesMeansExactNumericCount: false;
  readonly exactNumericHumanFaceCountRepresented: false;
  readonly binaryFacePresenceProjectionDefined: false;
  readonly exactSingleHumanFaceProjectionDefined: false;
  readonly providerOutputMappingDefined: false;
  readonly providerDecisionThresholdDefined: false;
}

export interface HumanFaceConstructReferenceAdmissionProtocolFRData14V1 {
  readonly upstreamConstructValidationAuthorityRef: 'authority.face.provider_detection_construct_validation_protocol.frdata13';
  readonly targetConstructMustComeFromExistingHumanLabelAuthority: true;
  readonly targetConstructMayBeInferredFromProviderOutput: false;
  readonly providerOutputMayDefineHumanReferenceClass: false;
  readonly providerCandidateCountMayDefineHumanReferenceClass: false;
  readonly providerPerformanceMayChangeHumanReferenceClass: false;
  readonly frozenGroundTruthLedgerRequired: true;
  readonly frozenAdjudicationLedgerRequired: true;
  readonly exactCompleteIndependentAnnotationReviewRequired: true;
  readonly providerBlindHumanAdjudicationRequired: true;
  readonly independentAdjudicatorSeparationRequired: true;
  readonly resolvedCategoricalOutcomeMayEnterReferenceCandidateSet: true;
  readonly referenceCandidateMeansReviewedReferenceStandardAuthority: false;
  readonly indeterminateMustBePreservedAsNonScoringEvidence: true;
  readonly unresolvedMustBePreservedAsNonScoringEvidence: true;
  readonly indeterminateMayBeSilentlyExcluded: false;
  readonly unresolvedMayBeSilentlyExcluded: false;
  readonly multipleHumanFacesMayBeConvertedToExactNumericCount: false;
  readonly binaryPresenceProjectionMayBeInvented: false;
  readonly exactSingleProjectionMayBeInvented: false;
  readonly existingProviderOutputsMayValidateConstructDefinition: false;
  readonly futureConstructValidationDatasetMustBeUnseenAfterDefinitionFreeze: true;
  readonly externalConstructReviewRequiredForReviewedAuthority: true;
  readonly externalReferenceStandardReviewRequiredForReviewedAuthority: true;
  readonly syntheticFixturesMayValidateReferenceStandardAuthority: false;
  readonly minimumReferenceCaptures: null;
  readonly minimumIndependentAnnotators: null;
  readonly minimumAdjudicators: null;
  readonly interAnnotatorAgreementThreshold: null;
  readonly referenceAdmissionThreshold: null;
  readonly classificationMetricsAuthorized: false;
}

export interface HumanFaceReferenceCandidateAdmissionFRData14V1 {
  readonly captureRef: string;
  readonly partition: 'calibration' | 'holdout';
  readonly canonicalAssetDigest: string;
  readonly adjudicationOutcome: IndependentFaceAdjudicationOutcomeFRData10V1;
  readonly admissionState: HumanFaceReferenceCandidateAdmissionStateFRData14V1;
  readonly scoringReferenceClass: HumanFaceCountScoringReferenceClassFRData14V1 | null;
  readonly exactIndependentAnnotationReviewSetMatched: true;
  readonly providerBlindHumanAdjudicationRecorded: true;
  readonly independentAdjudicatorSeparationRecorded: true;
  readonly reviewedReferenceStandardAuthorityValidated: false;
}

export interface HumanFaceConstructReferenceAdmissionReportFRData14V1 {
  readonly schemaVersion: 'fr-data14-human-face-construct-reference-admission-v1';
  readonly datasetRef: string;
  readonly constructRef: 'construct.face.categorical_human_face_count_state.frdata14';
  readonly constructVersion: '0.1.0';
  readonly constructDefinitionDigest: string;
  readonly targetConstruct: 'categorical_human_face_count_state';
  readonly upstreamGroundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1';
  readonly upstreamAdjudicationSchemaRef: 'fr-data10-independent-face-count-adjudication-v1';
  readonly upstreamAnnotationLedgerDigest: string;
  readonly upstreamAdjudicationLedgerDigest: string;
  readonly captureCount: number;
  readonly admittedReferenceCandidateCount: number;
  readonly preservedNonScoringIndeterminateCount: number;
  readonly preservedNonScoringUnresolvedCount: number;
  readonly admissions: readonly HumanFaceReferenceCandidateAdmissionFRData14V1[];
  readonly categoricalHumanFaceCountConstructDefined: true;
  readonly constructDefinitionFrozenInAuthorityVersion: true;
  readonly targetConstructDerivedFromExistingHumanLabelAuthority: true;
  readonly exactNumericHumanFaceCountRepresented: false;
  readonly binaryFacePresenceProjectionDefined: false;
  readonly exactSingleHumanFaceProjectionDefined: false;
  readonly providerEvidenceConsumedToDefineConstruct: false;
  readonly providerOutputMappingDefined: false;
  readonly referenceCandidateAdmissionRecorded: true;
  readonly indeterminatePreservedAsNonScoringEvidence: true;
  readonly unresolvedPreservedAsNonScoringEvidence: true;
  readonly reviewedHumanReferenceStandardAuthorityValidated: false;
  readonly externalConstructReviewCompleted: false;
  readonly externalReferenceStandardReviewCompleted: false;
  readonly providerDetectionConstructValidityValidated: false;
  readonly providerFaceCandidateHumanIdentityValidated: false;
  readonly facePresenceVerified: false;
  readonly singleHumanFaceVerified: false;
  readonly truePositiveFalsePositiveTerminologyAuthorized: false;
  readonly confusionMatrixAuthorized: false;
  readonly classificationMetricsAuthorized: false;
  readonly classificationMetricsComputed: false;
  readonly providerDecisionThresholdDefined: false;
  readonly reviewedEmpiricalValidationCompleted: false;
  readonly nearDuplicatePartitionLeakageValidated: false;
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

export interface HumanFaceConstructReferenceAdmissionAuthorityFRData14V1 {
  readonly schemaVersion: 'fr-data14-v1';
  readonly authorityRef: 'authority.face.human_construct_reference_candidate_admission.frdata14';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'categorical_construct_defined_reference_candidate_admission_only_no_reviewed_reference_authority';
  readonly definition: HumanFaceConstructDefinitionFRData14V1;
  readonly protocol: HumanFaceConstructReferenceAdmissionProtocolFRData14V1;
  readonly authorityBoundary: {
    readonly frozenDefinitionMeansExternallyReviewedConstruct: false;
    readonly categoricalHumanOutcomeMeansExactNumericFaceCount: false;
    readonly referenceCandidateMeansGroundTruthAuthorityValidated: false;
    readonly providerBlindAdjudicationMeansGroundTruthAuthorityValidated: false;
    readonly binaryFacePresenceProjectionAuthorized: false;
    readonly exactSingleHumanFaceProjectionAuthorized: false;
    readonly providerOutputMappingAuthorized: false;
    readonly existingProviderOutputsMeanConstructValidityValidated: false;
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

const HUMAN_LABELS = Object.freeze([
  'zero_human_faces',
  'one_human_face',
  'multiple_human_faces',
  'indeterminate',
] as const);

const ADJUDICATION_OUTCOMES = Object.freeze([
  'zero_human_faces',
  'one_human_face',
  'multiple_human_faces',
  'indeterminate',
  'unresolved',
] as const);

const SCORING_REFERENCE_CLASSES = Object.freeze([
  'zero_human_faces',
  'one_human_face',
  'multiple_human_faces',
] as const);

const PRESERVED_NON_SCORING_OUTCOMES = Object.freeze(['indeterminate', 'unresolved'] as const);
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

const DEFINITION: HumanFaceConstructDefinitionFRData14V1 = Object.freeze({
  schemaVersion: 'fr-data14-human-face-construct-definition-v1' as const,
  constructRef: 'construct.face.categorical_human_face_count_state.frdata14' as const,
  constructVersion: '0.1.0' as const,
  targetConstruct: 'categorical_human_face_count_state' as const,
  sourceGroundTruthAuthorityRef: 'authority.face.independent_face_ground_truth_protocol.frdata07' as const,
  sourceAdjudicationAuthorityRef: 'authority.face.independent_face_count_adjudication.frdata10' as const,
  sourceGroundTruthLabelVocabulary: HUMAN_LABELS,
  sourceAdjudicationOutcomeVocabulary: ADJUDICATION_OUTCOMES,
  scoringReferenceClasses: SCORING_REFERENCE_CLASSES,
  preservedNonScoringOutcomes: PRESERVED_NON_SCORING_OUTCOMES,
  multipleHumanFacesMeansExactNumericCount: false as const,
  exactNumericHumanFaceCountRepresented: false as const,
  binaryFacePresenceProjectionDefined: false as const,
  exactSingleHumanFaceProjectionDefined: false as const,
  providerOutputMappingDefined: false as const,
  providerDecisionThresholdDefined: false as const,
});

export const HUMAN_FACE_CONSTRUCT_REFERENCE_ADMISSION_AUTHORITY_FRDATA14:
HumanFaceConstructReferenceAdmissionAuthorityFRData14V1 = Object.freeze({
  schemaVersion: 'fr-data14-v1' as const,
  authorityRef: 'authority.face.human_construct_reference_candidate_admission.frdata14' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'categorical_construct_defined_reference_candidate_admission_only_no_reviewed_reference_authority' as const,
  definition: DEFINITION,
  protocol: Object.freeze({
    upstreamConstructValidationAuthorityRef: 'authority.face.provider_detection_construct_validation_protocol.frdata13' as const,
    targetConstructMustComeFromExistingHumanLabelAuthority: true as const,
    targetConstructMayBeInferredFromProviderOutput: false as const,
    providerOutputMayDefineHumanReferenceClass: false as const,
    providerCandidateCountMayDefineHumanReferenceClass: false as const,
    providerPerformanceMayChangeHumanReferenceClass: false as const,
    frozenGroundTruthLedgerRequired: true as const,
    frozenAdjudicationLedgerRequired: true as const,
    exactCompleteIndependentAnnotationReviewRequired: true as const,
    providerBlindHumanAdjudicationRequired: true as const,
    independentAdjudicatorSeparationRequired: true as const,
    resolvedCategoricalOutcomeMayEnterReferenceCandidateSet: true as const,
    referenceCandidateMeansReviewedReferenceStandardAuthority: false as const,
    indeterminateMustBePreservedAsNonScoringEvidence: true as const,
    unresolvedMustBePreservedAsNonScoringEvidence: true as const,
    indeterminateMayBeSilentlyExcluded: false as const,
    unresolvedMayBeSilentlyExcluded: false as const,
    multipleHumanFacesMayBeConvertedToExactNumericCount: false as const,
    binaryPresenceProjectionMayBeInvented: false as const,
    exactSingleProjectionMayBeInvented: false as const,
    existingProviderOutputsMayValidateConstructDefinition: false as const,
    futureConstructValidationDatasetMustBeUnseenAfterDefinitionFreeze: true as const,
    externalConstructReviewRequiredForReviewedAuthority: true as const,
    externalReferenceStandardReviewRequiredForReviewedAuthority: true as const,
    syntheticFixturesMayValidateReferenceStandardAuthority: false as const,
    minimumReferenceCaptures: null,
    minimumIndependentAnnotators: null,
    minimumAdjudicators: null,
    interAnnotatorAgreementThreshold: null,
    referenceAdmissionThreshold: null,
    classificationMetricsAuthorized: false as const,
  }),
  authorityBoundary: Object.freeze({
    frozenDefinitionMeansExternallyReviewedConstruct: false as const,
    categoricalHumanOutcomeMeansExactNumericFaceCount: false as const,
    referenceCandidateMeansGroundTruthAuthorityValidated: false as const,
    providerBlindAdjudicationMeansGroundTruthAuthorityValidated: false as const,
    binaryFacePresenceProjectionAuthorized: false as const,
    exactSingleHumanFaceProjectionAuthorized: false as const,
    providerOutputMappingAuthorized: false as const,
    existingProviderOutputsMeanConstructValidityValidated: false as const,
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
  throw new FaceAuthorityValidationError(`FR-DATA-14 ${message}`);
}

function lexicalCompare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalJson(value: unknown, path: string): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) fail(`${path} contains a non-finite number.`);
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((entry, index) => canonicalJson(entry, `${path}[${index}]`)).join(',')}]`;
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) fail(`${path} must contain JSON-compatible plain objects only.`);
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort(lexicalCompare);
      return `{${keys.map((key) => {
        const child = record[key];
        if (child === undefined) fail(`${path}.${key} cannot be undefined.`);
        return `${JSON.stringify(key)}:${canonicalJson(child, `${path}.${key}`)}`;
      }).join(',')}}`;
    }
    default:
      return fail(`${path} contains a non-JSON value.`);
  }
}

function sameOrdered(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function canonicalSha256(value: string, label: string): string {
  if (!SHA256.test(value)) fail(`${label} must use canonical lowercase sha256:<64-hex> form.`);
  return value;
}

export function validateHumanFaceConstructReferenceAdmissionAuthorityFRData14(
  authority: HumanFaceConstructReferenceAdmissionAuthorityFRData14V1 = HUMAN_FACE_CONSTRUCT_REFERENCE_ADMISSION_AUTHORITY_FRDATA14,
): HumanFaceConstructReferenceAdmissionAuthorityFRData14V1 {
  if (
    authority.schemaVersion !== 'fr-data14-v1' ||
    authority.authorityRef !== 'authority.face.human_construct_reference_candidate_admission.frdata14' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'categorical_construct_defined_reference_candidate_admission_only_no_reviewed_reference_authority'
  ) fail('authority identity/state drift.');

  const definition = authority.definition;
  if (
    definition.schemaVersion !== 'fr-data14-human-face-construct-definition-v1' ||
    definition.constructRef !== 'construct.face.categorical_human_face_count_state.frdata14' ||
    definition.constructVersion !== '0.1.0' ||
    definition.targetConstruct !== 'categorical_human_face_count_state' ||
    definition.sourceGroundTruthAuthorityRef !== INDEPENDENT_FACE_GROUND_TRUTH_AUTHORITY_FRDATA07.authorityRef ||
    definition.sourceAdjudicationAuthorityRef !== INDEPENDENT_FACE_ADJUDICATION_AUTHORITY_FRDATA10.authorityRef ||
    !sameOrdered(definition.sourceGroundTruthLabelVocabulary, HUMAN_LABELS) ||
    !sameOrdered(definition.sourceAdjudicationOutcomeVocabulary, ADJUDICATION_OUTCOMES) ||
    !sameOrdered(definition.scoringReferenceClasses, SCORING_REFERENCE_CLASSES) ||
    !sameOrdered(definition.preservedNonScoringOutcomes, PRESERVED_NON_SCORING_OUTCOMES) ||
    definition.multipleHumanFacesMeansExactNumericCount !== false ||
    definition.exactNumericHumanFaceCountRepresented !== false ||
    definition.binaryFacePresenceProjectionDefined !== false ||
    definition.exactSingleHumanFaceProjectionDefined !== false ||
    definition.providerOutputMappingDefined !== false ||
    definition.providerDecisionThresholdDefined !== false
  ) fail('construct definition drift.');

  const protocol = authority.protocol;
  if (
    protocol.upstreamConstructValidationAuthorityRef !== PROVIDER_DETECTION_CONSTRUCT_VALIDATION_AUTHORITY_FRDATA13.authorityRef ||
    protocol.targetConstructMustComeFromExistingHumanLabelAuthority !== true ||
    protocol.targetConstructMayBeInferredFromProviderOutput !== false ||
    protocol.providerOutputMayDefineHumanReferenceClass !== false ||
    protocol.providerCandidateCountMayDefineHumanReferenceClass !== false ||
    protocol.providerPerformanceMayChangeHumanReferenceClass !== false ||
    protocol.frozenGroundTruthLedgerRequired !== true ||
    protocol.frozenAdjudicationLedgerRequired !== true ||
    protocol.exactCompleteIndependentAnnotationReviewRequired !== true ||
    protocol.providerBlindHumanAdjudicationRequired !== true ||
    protocol.independentAdjudicatorSeparationRequired !== true ||
    protocol.resolvedCategoricalOutcomeMayEnterReferenceCandidateSet !== true ||
    protocol.referenceCandidateMeansReviewedReferenceStandardAuthority !== false ||
    protocol.indeterminateMustBePreservedAsNonScoringEvidence !== true ||
    protocol.unresolvedMustBePreservedAsNonScoringEvidence !== true ||
    protocol.indeterminateMayBeSilentlyExcluded !== false ||
    protocol.unresolvedMayBeSilentlyExcluded !== false ||
    protocol.multipleHumanFacesMayBeConvertedToExactNumericCount !== false ||
    protocol.binaryPresenceProjectionMayBeInvented !== false ||
    protocol.exactSingleProjectionMayBeInvented !== false ||
    protocol.existingProviderOutputsMayValidateConstructDefinition !== false ||
    protocol.futureConstructValidationDatasetMustBeUnseenAfterDefinitionFreeze !== true ||
    protocol.externalConstructReviewRequiredForReviewedAuthority !== true ||
    protocol.externalReferenceStandardReviewRequiredForReviewedAuthority !== true ||
    protocol.syntheticFixturesMayValidateReferenceStandardAuthority !== false ||
    protocol.classificationMetricsAuthorized !== false
  ) fail('protocol authority boundary drift.');

  if (
    protocol.minimumReferenceCaptures !== null ||
    protocol.minimumIndependentAnnotators !== null ||
    protocol.minimumAdjudicators !== null ||
    protocol.interAnnotatorAgreementThreshold !== null ||
    protocol.referenceAdmissionThreshold !== null
  ) fail('empirical minima and admission thresholds must remain unset.');

  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    fail('authority boundary must remain fully fail-closed.');
  }

  if (
    INDEPENDENT_FACE_GROUND_TRUTH_AUTHORITY_FRDATA07.protocol.labelVocabulary.some((value, index) => value !== HUMAN_LABELS[index]) ||
    INDEPENDENT_FACE_ADJUDICATION_AUTHORITY_FRDATA10.protocol.outcomeVocabulary.some((value, index) => value !== ADJUDICATION_OUTCOMES[index]) ||
    PROVIDER_DETECTION_CONSTRUCT_VALIDATION_AUTHORITY_FRDATA13.protocol.targetConstructMustBeDefinedBeforeScoring !== true ||
    PROVIDER_DETECTION_CONSTRUCT_VALIDATION_AUTHORITY_FRDATA13.protocol.targetConstructMayBeInferredFromProviderOutput !== false
  ) fail('upstream human-label or construct-validation authority drift.');

  return authority;
}

export function computeHumanFaceConstructDefinitionDigestFRData14(): string {
  validateHumanFaceConstructReferenceAdmissionAuthorityFRData14();
  const serialized = canonicalJson(HUMAN_FACE_CONSTRUCT_REFERENCE_ADMISSION_AUTHORITY_FRDATA14.definition, 'constructDefinition');
  return `sha256:${createHash('sha256').update(serialized, 'utf8').digest('hex')}`;
}

function admissionForOutcome(
  outcome: IndependentFaceAdjudicationOutcomeFRData10V1,
): Pick<HumanFaceReferenceCandidateAdmissionFRData14V1, 'admissionState' | 'scoringReferenceClass'> {
  if ((SCORING_REFERENCE_CLASSES as readonly string[]).includes(outcome)) {
    return {
      admissionState: 'admitted_reference_candidate',
      scoringReferenceClass: outcome as HumanFaceCountScoringReferenceClassFRData14V1,
    };
  }
  if (outcome === 'indeterminate') {
    return {
      admissionState: 'preserved_non_scoring_indeterminate',
      scoringReferenceClass: null,
    };
  }
  if (outcome === 'unresolved') {
    return {
      admissionState: 'preserved_non_scoring_unresolved',
      scoringReferenceClass: null,
    };
  }
  return fail(`unsupported adjudication outcome: ${String(outcome)}.`);
}

export function buildHumanFaceConstructReferenceAdmissionReportFRData14(
  groundTruthDataset: IndependentFaceGroundTruthDatasetFRData07V1,
  adjudicationDataset: IndependentFaceAdjudicationDatasetFRData10V1,
): HumanFaceConstructReferenceAdmissionReportFRData14V1 {
  validateHumanFaceConstructReferenceAdmissionAuthorityFRData14();
  const adjudicationReport = buildIndependentFaceAdjudicationReportFRData10(
    groundTruthDataset,
    adjudicationDataset,
  );

  if (
    adjudicationReport.schemaVersion !== 'fr-data10-independent-face-count-adjudication-report-v1' ||
    adjudicationReport.upstreamAnnotationLedgerBindingVerified !== true ||
    adjudicationReport.exactCaptureAdjudicationCoverageVerified !== true ||
    adjudicationReport.exactIndependentAnnotationReviewSetCoverageVerified !== true ||
    adjudicationReport.providerBlindAdjudicationRecordedForEveryCapture !== true ||
    adjudicationReport.independentAdjudicatorSeparationRecordedForEveryCapture !== true ||
    adjudicationReport.adjudicationLedgerFrozenVerified !== true ||
    adjudicationReport.adjudicationLedgerContentDigestVerified !== true ||
    adjudicationReport.captureConsensusGroundTruthAuthorityValidated !== false ||
    adjudicationReport.interAnnotatorGroundTruthAuthorityValidated !== false ||
    adjudicationReport.providerDetectionConstructValidityValidated !== false ||
    adjudicationReport.providerFaceCandidateHumanIdentityValidated !== false
  ) fail('FR-DATA-10 human adjudication boundary is not intact.');

  canonicalSha256(adjudicationReport.upstreamAnnotationLedgerDigest, 'upstreamAnnotationLedgerDigest');
  canonicalSha256(adjudicationReport.adjudicationLedgerDigest, 'adjudicationLedgerDigest');

  const admissions = adjudicationReport.captureSummaries.map((summary) => {
    const admission = admissionForOutcome(summary.adjudicationOutcome);
    return Object.freeze({
      captureRef: summary.captureRef,
      partition: summary.partition,
      canonicalAssetDigest: summary.canonicalAssetDigest,
      adjudicationOutcome: summary.adjudicationOutcome,
      admissionState: admission.admissionState,
      scoringReferenceClass: admission.scoringReferenceClass,
      exactIndependentAnnotationReviewSetMatched: true as const,
      providerBlindHumanAdjudicationRecorded: true as const,
      independentAdjudicatorSeparationRecorded: true as const,
      reviewedReferenceStandardAuthorityValidated: false as const,
    });
  });

  const admittedReferenceCandidateCount = admissions.filter((entry) =>
    entry.admissionState === 'admitted_reference_candidate').length;
  const preservedNonScoringIndeterminateCount = admissions.filter((entry) =>
    entry.admissionState === 'preserved_non_scoring_indeterminate').length;
  const preservedNonScoringUnresolvedCount = admissions.filter((entry) =>
    entry.admissionState === 'preserved_non_scoring_unresolved').length;

  return Object.freeze({
    schemaVersion: 'fr-data14-human-face-construct-reference-admission-v1' as const,
    datasetRef: adjudicationReport.datasetRef,
    constructRef: DEFINITION.constructRef,
    constructVersion: DEFINITION.constructVersion,
    constructDefinitionDigest: computeHumanFaceConstructDefinitionDigestFRData14(),
    targetConstruct: DEFINITION.targetConstruct,
    upstreamGroundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1' as const,
    upstreamAdjudicationSchemaRef: 'fr-data10-independent-face-count-adjudication-v1' as const,
    upstreamAnnotationLedgerDigest: adjudicationReport.upstreamAnnotationLedgerDigest,
    upstreamAdjudicationLedgerDigest: adjudicationReport.adjudicationLedgerDigest,
    captureCount: admissions.length,
    admittedReferenceCandidateCount,
    preservedNonScoringIndeterminateCount,
    preservedNonScoringUnresolvedCount,
    admissions: Object.freeze(admissions),
    categoricalHumanFaceCountConstructDefined: true as const,
    constructDefinitionFrozenInAuthorityVersion: true as const,
    targetConstructDerivedFromExistingHumanLabelAuthority: true as const,
    exactNumericHumanFaceCountRepresented: false as const,
    binaryFacePresenceProjectionDefined: false as const,
    exactSingleHumanFaceProjectionDefined: false as const,
    providerEvidenceConsumedToDefineConstruct: false as const,
    providerOutputMappingDefined: false as const,
    referenceCandidateAdmissionRecorded: true as const,
    indeterminatePreservedAsNonScoringEvidence: true as const,
    unresolvedPreservedAsNonScoringEvidence: true as const,
    reviewedHumanReferenceStandardAuthorityValidated: false as const,
    externalConstructReviewCompleted: false as const,
    externalReferenceStandardReviewCompleted: false as const,
    providerDetectionConstructValidityValidated: false as const,
    providerFaceCandidateHumanIdentityValidated: false as const,
    facePresenceVerified: false as const,
    singleHumanFaceVerified: false as const,
    truePositiveFalsePositiveTerminologyAuthorized: false as const,
    confusionMatrixAuthorized: false as const,
    classificationMetricsAuthorized: false as const,
    classificationMetricsComputed: false as const,
    providerDecisionThresholdDefined: false as const,
    reviewedEmpiricalValidationCompleted: false as const,
    nearDuplicatePartitionLeakageValidated: false as const,
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

export function assertHumanFaceConstructReferenceAdmissionReadyForPromotionFRData14(): never {
  validateHumanFaceConstructReferenceAdmissionAuthorityFRData14();
  return fail(
    'FR-DATA-14 freezes only the categorical human face-count construct and reference-candidate admission rule derived from FR-DATA-07/10. It does not establish exact numeric face count, binary presence, exact-single-face projection, reviewed ground-truth authority, provider mapping, construct validity, classification metrics, capture-quality authority, anatomy, traditional semantics, or production geometry.',
  );
}
