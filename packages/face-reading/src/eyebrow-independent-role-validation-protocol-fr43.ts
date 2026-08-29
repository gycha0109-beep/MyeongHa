import {
  EYEBROW_COMPONENT_GEOMETRIC_ROLE_PROBE_AUTHORITY_FR42,
  validateEyebrowComponentGeometricRoleProbeAuthorityFR42,
} from './mediapipe-eyebrow-component-geometric-role-probe-fr42.js';
import {
  EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41,
  validateEyebrowNeutralAnatomicalAdmissionAuthorityFR41,
} from './eyebrow-neutral-anatomical-evidence-admission-fr41.js';
import { FaceAuthorityValidationError } from './validation.js';

export type EyebrowRoleGroundTruthLabelFR43V1 = 'anatomical_upper_rim' | 'anatomical_lower_rim';
export type EyebrowCaptureStratumFR43V1 =
  | 'neutral_frontal_baseline'
  | 'pose_perturbation'
  | 'expression_perturbation'
  | 'repeat_neutral_capture';

export interface EyebrowIndependentAnnotationProtocolFR43V1 {
  readonly annotationTarget: 'upper_lower_eyebrow_rims_with_medial_lateral_endpoints';
  readonly sourceEvidenceRefs: readonly string[];
  readonly annotatorSeesProviderComponentIndices: false;
  readonly annotatorSeesProviderPredictedRole: false;
  readonly providerOutputGeneratedAfterGroundTruthLock: true;
  readonly providerSerializationOrderMayDefineGroundTruth: false;
  readonly groundTruthLabels: readonly [
    'anatomical_upper_rim',
    'anatomical_lower_rim',
  ];
  readonly adjudicationRequiredForDisagreement: true;
  readonly interAnnotatorAgreementThreshold: null;
}

export interface EyebrowControlledCaptureProtocolFR43V1 {
  readonly requiredStrata: readonly [
    'neutral_frontal_baseline',
    'repeat_neutral_capture',
    'pose_perturbation',
    'expression_perturbation',
  ];
  readonly sameSubjectLinkageRequired: true;
  readonly immutableAssetDigestRequired: true;
  readonly captureTimestampRequired: true;
  readonly imageDimensionsRequired: true;
  readonly deviceReferenceRequired: true;
  readonly neutralInstructionRequired: true;
  readonly posePerturbationMustBeLabeled: true;
  readonly expressionPerturbationMustBeLabeled: true;
  readonly minimumSubjects: null;
  readonly minimumCapturesPerStratum: null;
}

export interface EyebrowValidationSubjectFR43V1 {
  readonly subjectRef: string;
  readonly independentSubject: true;
}

export interface EyebrowValidationCaptureFR43V1 {
  readonly captureRef: string;
  readonly subjectRef: string;
  readonly stratum: EyebrowCaptureStratumFR43V1;
  readonly canonicalAssetDigest: string;
  readonly capturedAt: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly deviceRef: string;
  readonly neutralInstructionApplied: boolean;
  readonly poseLabel: string | null;
  readonly expressionLabel: string | null;
  readonly groundTruthLockedBeforeProviderRun: true;
  readonly providerComponentRolePrediction: null | Readonly<{
    leftImageUpperOrdinal: 1 | 2;
    rightImageUpperOrdinal: 1 | 2;
  }>;
}

export interface EyebrowIndependentGroundTruthRecordFR43V1 {
  readonly captureRef: string;
  readonly annotatorRef: string;
  readonly blindedToProviderComponents: true;
  readonly upperRimAnnotationRef: string;
  readonly lowerRimAnnotationRef: string;
  readonly medialEndpointAnnotationRef: string;
  readonly lateralEndpointAnnotationRef: string;
  readonly providerSerializationOrderUsedAsGroundTruth: false;
}

export interface EyebrowRoleValidationDatasetFR43V1 {
  readonly schemaVersion: 'fr43-dataset-v1';
  readonly datasetRef: string;
  readonly subjects: readonly EyebrowValidationSubjectFR43V1[];
  readonly captures: readonly EyebrowValidationCaptureFR43V1[];
  readonly groundTruthRecords: readonly EyebrowIndependentGroundTruthRecordFR43V1[];
  readonly groundTruthFrozen: boolean;
  readonly providerRunsExecutedAfterFreeze: boolean;
}

export interface EyebrowRoleValidationReadinessFR43V1 {
  readonly protocolDefined: true;
  readonly independentGroundTruthProtocolDefined: true;
  readonly controlledCaptureProtocolDefined: true;
  readonly validationDatasetPresent: boolean;
  readonly allRequiredCaptureStrataPresent: boolean;
  readonly repeatedNeutralCaptureEvidencePresent: boolean;
  readonly independentGroundTruthPresentForEveryCapture: boolean;
  readonly groundTruthFrozenBeforeProviderRun: boolean;
  readonly providerComponentRoleMappingValidated: false;
  readonly leftRightMappingReproducibilityValidated: false;
  readonly poseStabilityValidated: false;
  readonly expressionStabilityValidated: false;
  readonly repeatabilityValidated: false;
  readonly calibrationThresholdsDefined: false;
  readonly researchCandidateAdmitted: false;
  readonly blockers: readonly string[];
}

export interface EyebrowIndependentRoleValidationProtocolAuthorityFR43V1 {
  readonly schemaVersion: 'fr43-v1';
  readonly authorityRef: 'authority.face.eyebrow_independent_role_validation_protocol.fr43';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'protocol_defined_no_validation_dataset';
  readonly upstreamFR42Ref: string;
  readonly upstreamFR41Ref: string;
  readonly independentAnnotationProtocol: EyebrowIndependentAnnotationProtocolFR43V1;
  readonly controlledCaptureProtocol: EyebrowControlledCaptureProtocolFR43V1;
  readonly evaluationDimensions: readonly [
    'provider_component_role_mapping',
    'left_right_mapping_reproducibility',
    'repeated_capture_repeatability',
    'pose_stability',
    'expression_stability',
    'calibration_error_thresholds',
  ];
  readonly acceptanceThresholds: {
    readonly providerRoleAccuracy: null;
    readonly leftRightAgreement: null;
    readonly repeatabilityError: null;
    readonly poseError: null;
    readonly expressionError: null;
  };
  readonly authorityBoundary: {
    readonly fr42ImageUpperSignalMayDefineGroundTruth: false;
    readonly providerSerializationOrderMayDefineGroundTruth: false;
    readonly protocolDefinitionMeansMappingValidated: false;
    readonly singleAnnotatorRecordMeansGroundTruthAuthority: false;
    readonly unlabeledPoseCaptureMaySatisfyPoseGate: false;
    readonly unlabeledExpressionCaptureMaySatisfyExpressionGate: false;
    readonly thresholdMayBeInventedBeforeDatasetReview: false;
    readonly providerComponentRoleMappingAuthorized: false;
    readonly neutralBrowGeometryAuthorized: false;
    readonly browMidlineAlgorithmAuthorized: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
}

const FR42_REF = `${EYEBROW_COMPONENT_GEOMETRIC_ROLE_PROBE_AUTHORITY_FR42.authorityRef}@${EYEBROW_COMPONENT_GEOMETRIC_ROLE_PROBE_AUTHORITY_FR42.authorityVersion}`;
const FR41_REF = `${EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41.authorityRef}@${EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41.authorityVersion}`;

const FR41_GROUND_TRUTH_EVIDENCE_REFS = Object.freeze([
  'evidence.fr41.fagertun_2014_3d_landmark_variability',
  'evidence.fr41.windhager_2019_upper_lower_brow_rims',
  'evidence.fr41.kleisner_2025_facedig_brow_curves',
] as const);

export const EYEBROW_INDEPENDENT_ROLE_VALIDATION_PROTOCOL_AUTHORITY_FR43:
EyebrowIndependentRoleValidationProtocolAuthorityFR43V1 = Object.freeze({
  schemaVersion: 'fr43-v1' as const,
  authorityRef: 'authority.face.eyebrow_independent_role_validation_protocol.fr43' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'protocol_defined_no_validation_dataset' as const,
  upstreamFR42Ref: FR42_REF,
  upstreamFR41Ref: FR41_REF,
  independentAnnotationProtocol: Object.freeze({
    annotationTarget: 'upper_lower_eyebrow_rims_with_medial_lateral_endpoints' as const,
    sourceEvidenceRefs: FR41_GROUND_TRUTH_EVIDENCE_REFS,
    annotatorSeesProviderComponentIndices: false as const,
    annotatorSeesProviderPredictedRole: false as const,
    providerOutputGeneratedAfterGroundTruthLock: true as const,
    providerSerializationOrderMayDefineGroundTruth: false as const,
    groundTruthLabels: Object.freeze(['anatomical_upper_rim', 'anatomical_lower_rim'] as const),
    adjudicationRequiredForDisagreement: true as const,
    interAnnotatorAgreementThreshold: null,
  }),
  controlledCaptureProtocol: Object.freeze({
    requiredStrata: Object.freeze([
      'neutral_frontal_baseline',
      'repeat_neutral_capture',
      'pose_perturbation',
      'expression_perturbation',
    ] as const),
    sameSubjectLinkageRequired: true as const,
    immutableAssetDigestRequired: true as const,
    captureTimestampRequired: true as const,
    imageDimensionsRequired: true as const,
    deviceReferenceRequired: true as const,
    neutralInstructionRequired: true as const,
    posePerturbationMustBeLabeled: true as const,
    expressionPerturbationMustBeLabeled: true as const,
    minimumSubjects: null,
    minimumCapturesPerStratum: null,
  }),
  evaluationDimensions: Object.freeze([
    'provider_component_role_mapping',
    'left_right_mapping_reproducibility',
    'repeated_capture_repeatability',
    'pose_stability',
    'expression_stability',
    'calibration_error_thresholds',
  ] as const),
  acceptanceThresholds: Object.freeze({
    providerRoleAccuracy: null,
    leftRightAgreement: null,
    repeatabilityError: null,
    poseError: null,
    expressionError: null,
  }),
  authorityBoundary: Object.freeze({
    fr42ImageUpperSignalMayDefineGroundTruth: false as const,
    providerSerializationOrderMayDefineGroundTruth: false as const,
    protocolDefinitionMeansMappingValidated: false as const,
    singleAnnotatorRecordMeansGroundTruthAuthority: false as const,
    unlabeledPoseCaptureMaySatisfyPoseGate: false as const,
    unlabeledExpressionCaptureMaySatisfyExpressionGate: false as const,
    thresholdMayBeInventedBeforeDatasetReview: false as const,
    providerComponentRoleMappingAuthorized: false as const,
    neutralBrowGeometryAuthorized: false as const,
    browMidlineAlgorithmAuthorized: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
});

function nonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FaceAuthorityValidationError(`FR-43 ${label} must be non-empty.`);
  }
  return value;
}

function uniqueStrings(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new FaceAuthorityValidationError(`FR-43 ${label} must be unique.`);
  }
}

export function validateEyebrowIndependentRoleValidationProtocolAuthorityFR43(
  authority: EyebrowIndependentRoleValidationProtocolAuthorityFR43V1 = EYEBROW_INDEPENDENT_ROLE_VALIDATION_PROTOCOL_AUTHORITY_FR43,
): EyebrowIndependentRoleValidationProtocolAuthorityFR43V1 {
  validateEyebrowComponentGeometricRoleProbeAuthorityFR42();
  validateEyebrowNeutralAnatomicalAdmissionAuthorityFR41();
  if (
    authority.schemaVersion !== 'fr43-v1' ||
    authority.authorityRef !== 'authority.face.eyebrow_independent_role_validation_protocol.fr43' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'protocol_defined_no_validation_dataset' ||
    authority.upstreamFR42Ref !== FR42_REF ||
    authority.upstreamFR41Ref !== FR41_REF
  ) throw new FaceAuthorityValidationError('FR-43 authority identity/upstream pin drift.');

  const annotation = authority.independentAnnotationProtocol;
  if (
    annotation.annotationTarget !== 'upper_lower_eyebrow_rims_with_medial_lateral_endpoints' ||
    annotation.annotatorSeesProviderComponentIndices !== false ||
    annotation.annotatorSeesProviderPredictedRole !== false ||
    annotation.providerOutputGeneratedAfterGroundTruthLock !== true ||
    annotation.providerSerializationOrderMayDefineGroundTruth !== false ||
    annotation.adjudicationRequiredForDisagreement !== true ||
    annotation.interAnnotatorAgreementThreshold !== null ||
    annotation.groundTruthLabels[0] !== 'anatomical_upper_rim' ||
    annotation.groundTruthLabels[1] !== 'anatomical_lower_rim'
  ) throw new FaceAuthorityValidationError('FR-43 independent annotation protocol drift.');
  if (annotation.sourceEvidenceRefs.length !== 3 || annotation.sourceEvidenceRefs.some((ref) => !FR41_GROUND_TRUTH_EVIDENCE_REFS.includes(ref as typeof FR41_GROUND_TRUTH_EVIDENCE_REFS[number]))) {
    throw new FaceAuthorityValidationError('FR-43 annotation protocol must remain pinned to reviewed FR-41 neutral evidence.');
  }

  const capture = authority.controlledCaptureProtocol;
  if (
    capture.minimumSubjects !== null ||
    capture.minimumCapturesPerStratum !== null ||
    capture.sameSubjectLinkageRequired !== true ||
    capture.immutableAssetDigestRequired !== true ||
    capture.captureTimestampRequired !== true ||
    capture.imageDimensionsRequired !== true ||
    capture.deviceReferenceRequired !== true ||
    capture.neutralInstructionRequired !== true ||
    capture.posePerturbationMustBeLabeled !== true ||
    capture.expressionPerturbationMustBeLabeled !== true
  ) throw new FaceAuthorityValidationError('FR-43 controlled capture protocol drift.');
  const requiredStrata = new Set<EyebrowCaptureStratumFR43V1>(capture.requiredStrata);
  for (const stratum of ['neutral_frontal_baseline', 'repeat_neutral_capture', 'pose_perturbation', 'expression_perturbation'] as const) {
    if (!requiredStrata.has(stratum)) throw new FaceAuthorityValidationError(`FR-43 missing required capture stratum ${stratum}.`);
  }
  if (Object.values(authority.acceptanceThresholds).some((value) => value !== null)) {
    throw new FaceAuthorityValidationError('FR-43 acceptance thresholds must remain unset before dataset review.');
  }
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-43 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function validateEyebrowRoleValidationDatasetFR43(
  dataset: EyebrowRoleValidationDatasetFR43V1,
): EyebrowRoleValidationDatasetFR43V1 {
  validateEyebrowIndependentRoleValidationProtocolAuthorityFR43();
  if (dataset.schemaVersion !== 'fr43-dataset-v1') throw new FaceAuthorityValidationError('FR-43 dataset schema drift.');
  nonEmpty(dataset.datasetRef, 'datasetRef');
  uniqueStrings(dataset.subjects.map((subject) => subject.subjectRef), 'subject refs');
  uniqueStrings(dataset.captures.map((capture) => capture.captureRef), 'capture refs');
  const subjectRefs = new Set(dataset.subjects.map((subject) => subject.subjectRef));
  const captureRefs = new Set(dataset.captures.map((capture) => capture.captureRef));
  if (dataset.subjects.some((subject) => subject.independentSubject !== true || subject.subjectRef.trim().length === 0)) {
    throw new FaceAuthorityValidationError('FR-43 subjects must be independently identified and non-empty.');
  }
  for (const capture of dataset.captures) {
    nonEmpty(capture.captureRef, 'captureRef');
    if (!subjectRefs.has(capture.subjectRef)) throw new FaceAuthorityValidationError(`FR-43 capture ${capture.captureRef} references unknown subject.`);
    nonEmpty(capture.canonicalAssetDigest, 'canonicalAssetDigest');
    nonEmpty(capture.capturedAt, 'capturedAt');
    nonEmpty(capture.deviceRef, 'deviceRef');
    if (!Number.isInteger(capture.imageWidth) || capture.imageWidth <= 0 || !Number.isInteger(capture.imageHeight) || capture.imageHeight <= 0) {
      throw new FaceAuthorityValidationError(`FR-43 capture ${capture.captureRef} requires positive integer image dimensions.`);
    }
    if (capture.stratum === 'pose_perturbation' && (!capture.poseLabel || capture.poseLabel.trim().length === 0)) {
      throw new FaceAuthorityValidationError(`FR-43 pose capture ${capture.captureRef} requires a pose label.`);
    }
    if (capture.stratum === 'expression_perturbation' && (!capture.expressionLabel || capture.expressionLabel.trim().length === 0)) {
      throw new FaceAuthorityValidationError(`FR-43 expression capture ${capture.captureRef} requires an expression label.`);
    }
    if ((capture.stratum === 'neutral_frontal_baseline' || capture.stratum === 'repeat_neutral_capture') && capture.neutralInstructionApplied !== true) {
      throw new FaceAuthorityValidationError(`FR-43 neutral capture ${capture.captureRef} requires neutral instruction attestation.`);
    }
    if (capture.groundTruthLockedBeforeProviderRun !== true) {
      throw new FaceAuthorityValidationError(`FR-43 capture ${capture.captureRef} must lock ground truth before provider execution.`);
    }
  }

  const recordsByCapture = new Map<string, EyebrowIndependentGroundTruthRecordFR43V1[]>();
  for (const record of dataset.groundTruthRecords) {
    if (!captureRefs.has(record.captureRef)) throw new FaceAuthorityValidationError(`FR-43 ground truth references unknown capture ${record.captureRef}.`);
    nonEmpty(record.annotatorRef, 'annotatorRef');
    nonEmpty(record.upperRimAnnotationRef, 'upperRimAnnotationRef');
    nonEmpty(record.lowerRimAnnotationRef, 'lowerRimAnnotationRef');
    nonEmpty(record.medialEndpointAnnotationRef, 'medialEndpointAnnotationRef');
    nonEmpty(record.lateralEndpointAnnotationRef, 'lateralEndpointAnnotationRef');
    if (record.blindedToProviderComponents !== true || record.providerSerializationOrderUsedAsGroundTruth !== false) {
      throw new FaceAuthorityValidationError(`FR-43 ground truth for ${record.captureRef} is not provider-blinded.`);
    }
    const records = recordsByCapture.get(record.captureRef) ?? [];
    records.push(record);
    recordsByCapture.set(record.captureRef, records);
  }
  for (const capture of dataset.captures) {
    if ((recordsByCapture.get(capture.captureRef) ?? []).length === 0) {
      throw new FaceAuthorityValidationError(`FR-43 capture ${capture.captureRef} has no independent ground truth record.`);
    }
  }
  return dataset;
}

export function assessEyebrowRoleValidationReadinessFR43(
  dataset: EyebrowRoleValidationDatasetFR43V1 | null,
): EyebrowRoleValidationReadinessFR43V1 {
  validateEyebrowIndependentRoleValidationProtocolAuthorityFR43();
  if (dataset === null) {
    return Object.freeze({
      protocolDefined: true as const,
      independentGroundTruthProtocolDefined: true as const,
      controlledCaptureProtocolDefined: true as const,
      validationDatasetPresent: false,
      allRequiredCaptureStrataPresent: false,
      repeatedNeutralCaptureEvidencePresent: false,
      independentGroundTruthPresentForEveryCapture: false,
      groundTruthFrozenBeforeProviderRun: false,
      providerComponentRoleMappingValidated: false as const,
      leftRightMappingReproducibilityValidated: false as const,
      poseStabilityValidated: false as const,
      expressionStabilityValidated: false as const,
      repeatabilityValidated: false as const,
      calibrationThresholdsDefined: false as const,
      researchCandidateAdmitted: false as const,
      blockers: Object.freeze([
        'validation_dataset_missing',
        'independent_ground_truth_dataset_missing',
        'capture_strata_evidence_missing',
        'calibration_thresholds_unreviewed',
      ]),
    });
  }

  validateEyebrowRoleValidationDatasetFR43(dataset);
  const strata = new Set(dataset.captures.map((capture) => capture.stratum));
  const allRequiredCaptureStrataPresent = EYEBROW_INDEPENDENT_ROLE_VALIDATION_PROTOCOL_AUTHORITY_FR43.controlledCaptureProtocol.requiredStrata.every((stratum) => strata.has(stratum));
  const repeatedNeutralCaptureEvidencePresent = dataset.subjects.some((subject) => {
    const subjectCaptures = dataset.captures.filter((capture) => capture.subjectRef === subject.subjectRef);
    return subjectCaptures.some((capture) => capture.stratum === 'neutral_frontal_baseline') &&
      subjectCaptures.some((capture) => capture.stratum === 'repeat_neutral_capture');
  });
  const independentGroundTruthPresentForEveryCapture = dataset.captures.every((capture) =>
    dataset.groundTruthRecords.some((record) => record.captureRef === capture.captureRef && record.blindedToProviderComponents === true),
  );
  const groundTruthFrozenBeforeProviderRun = dataset.groundTruthFrozen === true &&
    dataset.providerRunsExecutedAfterFreeze === true &&
    dataset.captures.every((capture) => capture.groundTruthLockedBeforeProviderRun === true);
  const blockers = [
    ...(allRequiredCaptureStrataPresent ? [] : ['required_capture_strata_incomplete']),
    ...(repeatedNeutralCaptureEvidencePresent ? [] : ['repeated_neutral_capture_missing']),
    ...(independentGroundTruthPresentForEveryCapture ? [] : ['independent_ground_truth_incomplete']),
    ...(groundTruthFrozenBeforeProviderRun ? [] : ['ground_truth_freeze_order_unproven']),
    'provider_component_role_mapping_not_yet_scored',
    'left_right_mapping_reproducibility_not_yet_scored',
    'pose_stability_not_yet_scored',
    'expression_stability_not_yet_scored',
    'repeatability_not_yet_scored',
    'calibration_thresholds_unreviewed',
  ];
  return Object.freeze({
    protocolDefined: true as const,
    independentGroundTruthProtocolDefined: true as const,
    controlledCaptureProtocolDefined: true as const,
    validationDatasetPresent: true,
    allRequiredCaptureStrataPresent,
    repeatedNeutralCaptureEvidencePresent,
    independentGroundTruthPresentForEveryCapture,
    groundTruthFrozenBeforeProviderRun,
    providerComponentRoleMappingValidated: false as const,
    leftRightMappingReproducibilityValidated: false as const,
    poseStabilityValidated: false as const,
    expressionStabilityValidated: false as const,
    repeatabilityValidated: false as const,
    calibrationThresholdsDefined: false as const,
    researchCandidateAdmitted: false as const,
    blockers: Object.freeze(blockers),
  });
}

export function assertEyebrowProviderComponentRoleMappingReadyFR43(): never {
  validateEyebrowIndependentRoleValidationProtocolAuthorityFR43();
  throw new FaceAuthorityValidationError('FR-43 defines the independent validation protocol but has no reviewed validation dataset or calibration thresholds.');
}
