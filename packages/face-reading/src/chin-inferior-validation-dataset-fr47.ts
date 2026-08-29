import {
  CHIN_INFERIOR_NEUTRAL_VALIDATION_AUTHORITY_FR46,
  validateChinInferiorIndependentAnnotationFR46,
  validateChinInferiorNeutralValidationAuthorityFR46,
} from './chin-inferior-neutral-validation-fr46.js';
import { FaceAuthorityValidationError } from './validation.js';

export type MentonDatasetPartitionFR47V1 = 'calibration' | 'holdout';

export type MentonCaptureStratumFR47V1 =
  | 'neutral_frontal_baseline'
  | 'repeat_neutral_capture'
  | 'pose_yaw_perturbation'
  | 'pose_pitch_perturbation'
  | 'pose_roll_perturbation';

export type MentonPoseAxisFR47V1 = 'yaw' | 'pitch' | 'roll';

export interface MentonValidationDatasetProtocolFR47V1 {
  readonly annotationProtocolRef: 'protocol.face.chin_inferior.soft_tissue_menton_annotation.fr46@0.1.0';
  readonly requiredPartitions: readonly ['calibration', 'holdout'];
  readonly subjectLevelPartitionRequired: true;
  readonly subjectMayAppearInMultiplePartitions: false;
  readonly requiredCaptureStrata: readonly [
    'neutral_frontal_baseline',
    'repeat_neutral_capture',
    'pose_yaw_perturbation',
    'pose_pitch_perturbation',
    'pose_roll_perturbation',
  ];
  readonly sameSubjectLinkageRequired: true;
  readonly distinctPhysicalCaptureIdentityRequired: true;
  readonly immutableAssetDigestRequired: true;
  readonly captureTimestampRequired: true;
  readonly imageDimensionsRequired: true;
  readonly deviceReferenceRequired: true;
  readonly neutralExpressionRequired: true;
  readonly headPositionInstructionRequired: true;
  readonly poseAxisAndSignedDegreesRequiredForPoseStrata: true;
  readonly providerBlindAnnotationRequired: true;
  readonly annotationFreezeBeforeProviderRunRequired: true;
  readonly providerIndexMayDefineGroundTruth: false;
  readonly fr45ObservedIndex152MayDefineGroundTruth: false;
  readonly minimumSubjects: null;
  readonly minimumCapturesPerStratum: null;
  readonly minimumIndependentAnnotatorsPerCapture: null;
  readonly maximumPointError: null;
  readonly repeatabilityErrorThreshold: null;
  readonly poseErrorThreshold: null;
  readonly allowedPoseMagnitudeDegrees: null;
}

export interface MentonValidationSubjectFR47V1 {
  readonly subjectRef: string;
  readonly independentSubject: true;
  readonly partition: MentonDatasetPartitionFR47V1;
}

export interface MentonValidationCaptureFR47V1 {
  readonly captureRef: string;
  readonly subjectRef: string;
  readonly stratum: MentonCaptureStratumFR47V1;
  readonly canonicalAssetDigest: string;
  readonly capturedAt: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly deviceRef: string;
  readonly physicalCaptureInstanceRef: string;
  readonly neutralExpressionApplied: true;
  readonly headPositionInstructionApplied: true;
  readonly poseAxis: MentonPoseAxisFR47V1 | null;
  readonly poseDegrees: number | null;
  readonly groundTruthLockedBeforeProviderRun: true;
  readonly providerRunRef: string | null;
  readonly providerRunExecutedAfterGroundTruthLock: boolean;
}

export interface MentonIndependentAnnotationRecordFR47V1 {
  readonly captureRef: string;
  readonly annotatorRef: string;
  readonly targetName: 'soft_tissue_menton';
  readonly x: number;
  readonly y: number;
  readonly providerOutputVisibleDuringAnnotation: false;
  readonly annotationFrozenBeforeProviderScoring: true;
}

export interface MentonValidationDatasetFR47V1 {
  readonly schemaVersion: 'fr47-dataset-v1';
  readonly datasetRef: string;
  readonly subjects: readonly MentonValidationSubjectFR47V1[];
  readonly captures: readonly MentonValidationCaptureFR47V1[];
  readonly annotations: readonly MentonIndependentAnnotationRecordFR47V1[];
  readonly groundTruthFrozen: boolean;
  readonly providerRunsExecutedAfterFreeze: boolean;
}

export interface MentonValidationDatasetReadinessFR47V1 {
  readonly protocolDefined: true;
  readonly validationDatasetPresent: boolean;
  readonly calibrationPartitionPresent: boolean;
  readonly holdoutPartitionPresent: boolean;
  readonly allSubjectsHaveRequiredCaptureStrata: boolean;
  readonly distinctRepeatedPhysicalCaptureEvidencePresentForEverySubject: boolean;
  readonly allPoseAxesLabeledForEverySubject: boolean;
  readonly independentMentonAnnotationPresentForEveryCapture: boolean;
  readonly groundTruthFrozenBeforeProviderRun: boolean;
  readonly providerOutputPresentForEveryCapture: boolean;
  readonly providerCandidateToMentonMappingValidated: false;
  readonly repeatedCaptureRepeatabilityValidated: false;
  readonly poseStabilityValidated: false;
  readonly calibrationThresholdsDefined: false;
  readonly fr35PointToContourRelationValidated: false;
  readonly traditionalDigeEquivalenceValidated: false;
  readonly researchCandidateAdmitted: false;
  readonly productionGeometryAuthorized: false;
  readonly blockers: readonly string[];
}

export interface MentonValidationDatasetAuthorityFR47V1 {
  readonly schemaVersion: 'fr47-v1';
  readonly authorityRef: 'authority.face.menton_validation_dataset_contract.fr47';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'dataset_contract_defined_no_reviewed_dataset';
  readonly upstreamFR46Ref: string;
  readonly protocol: MentonValidationDatasetProtocolFR47V1;
  readonly evaluationDimensions: readonly [
    'provider_candidate_to_menton_error',
    'repeated_physical_capture_repeatability',
    'yaw_stability',
    'pitch_stability',
    'roll_stability',
    'calibration_holdout_generalization',
  ];
  readonly authorityBoundary: {
    readonly datasetContractMeansDatasetExists: false;
    readonly datasetPresenceMeansProviderMappingValidated: false;
    readonly calibrationPartitionMayDefineHoldoutThresholdPostHoc: false;
    readonly holdoutPartitionMayBeUsedToTuneThresholds: false;
    readonly providerIndexMayDefineGroundTruth: false;
    readonly observedIndex152MayDefineMenton: false;
    readonly repeatedInferenceOnOneImageMayCountAsPhysicalRepeatCapture: false;
    readonly unlabeledPoseMaySatisfyPoseEvidence: false;
    readonly poseMagnitudeBoundMayBeInventedBeforeReview: false;
    readonly pointErrorThresholdMayBeInventedBeforeReview: false;
    readonly mentonPointMaySubstituteForFR35Contour: false;
    readonly traditionalDigeEquivalenceAuthorized: false;
    readonly fr36VerticalReferencePromoted: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
}

const FR46_REF = `${CHIN_INFERIOR_NEUTRAL_VALIDATION_AUTHORITY_FR46.authorityRef}@${CHIN_INFERIOR_NEUTRAL_VALIDATION_AUTHORITY_FR46.authorityVersion}`;

const REQUIRED_STRATA = Object.freeze([
  'neutral_frontal_baseline',
  'repeat_neutral_capture',
  'pose_yaw_perturbation',
  'pose_pitch_perturbation',
  'pose_roll_perturbation',
] as const);

export const MENTON_VALIDATION_DATASET_AUTHORITY_FR47: MentonValidationDatasetAuthorityFR47V1 = Object.freeze({
  schemaVersion: 'fr47-v1' as const,
  authorityRef: 'authority.face.menton_validation_dataset_contract.fr47' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'dataset_contract_defined_no_reviewed_dataset' as const,
  upstreamFR46Ref: FR46_REF,
  protocol: Object.freeze({
    annotationProtocolRef: 'protocol.face.chin_inferior.soft_tissue_menton_annotation.fr46@0.1.0' as const,
    requiredPartitions: Object.freeze(['calibration', 'holdout'] as const),
    subjectLevelPartitionRequired: true as const,
    subjectMayAppearInMultiplePartitions: false as const,
    requiredCaptureStrata: REQUIRED_STRATA,
    sameSubjectLinkageRequired: true as const,
    distinctPhysicalCaptureIdentityRequired: true as const,
    immutableAssetDigestRequired: true as const,
    captureTimestampRequired: true as const,
    imageDimensionsRequired: true as const,
    deviceReferenceRequired: true as const,
    neutralExpressionRequired: true as const,
    headPositionInstructionRequired: true as const,
    poseAxisAndSignedDegreesRequiredForPoseStrata: true as const,
    providerBlindAnnotationRequired: true as const,
    annotationFreezeBeforeProviderRunRequired: true as const,
    providerIndexMayDefineGroundTruth: false as const,
    fr45ObservedIndex152MayDefineGroundTruth: false as const,
    minimumSubjects: null,
    minimumCapturesPerStratum: null,
    minimumIndependentAnnotatorsPerCapture: null,
    maximumPointError: null,
    repeatabilityErrorThreshold: null,
    poseErrorThreshold: null,
    allowedPoseMagnitudeDegrees: null,
  }),
  evaluationDimensions: Object.freeze([
    'provider_candidate_to_menton_error',
    'repeated_physical_capture_repeatability',
    'yaw_stability',
    'pitch_stability',
    'roll_stability',
    'calibration_holdout_generalization',
  ] as const),
  authorityBoundary: Object.freeze({
    datasetContractMeansDatasetExists: false as const,
    datasetPresenceMeansProviderMappingValidated: false as const,
    calibrationPartitionMayDefineHoldoutThresholdPostHoc: false as const,
    holdoutPartitionMayBeUsedToTuneThresholds: false as const,
    providerIndexMayDefineGroundTruth: false as const,
    observedIndex152MayDefineMenton: false as const,
    repeatedInferenceOnOneImageMayCountAsPhysicalRepeatCapture: false as const,
    unlabeledPoseMaySatisfyPoseEvidence: false as const,
    poseMagnitudeBoundMayBeInventedBeforeReview: false as const,
    pointErrorThresholdMayBeInventedBeforeReview: false as const,
    mentonPointMaySubstituteForFR35Contour: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    fr36VerticalReferencePromoted: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
});

function nonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FaceAuthorityValidationError(`FR-47 ${label} must be non-empty.`);
  }
  return value;
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new FaceAuthorityValidationError(`FR-47 ${label} must be unique.`);
}

function validatePose(capture: MentonValidationCaptureFR47V1): void {
  const expectedAxis: MentonPoseAxisFR47V1 | null =
    capture.stratum === 'pose_yaw_perturbation' ? 'yaw' :
      capture.stratum === 'pose_pitch_perturbation' ? 'pitch' :
        capture.stratum === 'pose_roll_perturbation' ? 'roll' : null;
  if (expectedAxis === null) {
    if (capture.poseAxis !== null || capture.poseDegrees !== null) {
      throw new FaceAuthorityValidationError(`FR-47 non-pose capture ${capture.captureRef} cannot carry pose perturbation values.`);
    }
    return;
  }
  if (capture.poseAxis !== expectedAxis || !Number.isFinite(capture.poseDegrees) || capture.poseDegrees === 0) {
    throw new FaceAuthorityValidationError(`FR-47 pose capture ${capture.captureRef} requires labeled non-zero signed ${expectedAxis} degrees.`);
  }
}

export function validateMentonValidationDatasetAuthorityFR47(
  authority: MentonValidationDatasetAuthorityFR47V1 = MENTON_VALIDATION_DATASET_AUTHORITY_FR47,
): MentonValidationDatasetAuthorityFR47V1 {
  validateChinInferiorNeutralValidationAuthorityFR46();
  if (authority.schemaVersion !== 'fr47-v1' || authority.authorityRef !== 'authority.face.menton_validation_dataset_contract.fr47' ||
      authority.authorityVersion !== '0.1.0' || authority.authorityState !== 'dataset_contract_defined_no_reviewed_dataset' ||
      authority.upstreamFR46Ref !== FR46_REF) {
    throw new FaceAuthorityValidationError('FR-47 identity/upstream authority drift.');
  }
  const protocol = authority.protocol;
  if (protocol.annotationProtocolRef !== CHIN_INFERIOR_NEUTRAL_VALIDATION_AUTHORITY_FR46.annotationProtocol.protocolRef ||
      protocol.requiredPartitions[0] !== 'calibration' || protocol.requiredPartitions[1] !== 'holdout' ||
      protocol.subjectLevelPartitionRequired !== true || protocol.subjectMayAppearInMultiplePartitions !== false ||
      protocol.sameSubjectLinkageRequired !== true || protocol.distinctPhysicalCaptureIdentityRequired !== true ||
      protocol.immutableAssetDigestRequired !== true || protocol.captureTimestampRequired !== true ||
      protocol.imageDimensionsRequired !== true || protocol.deviceReferenceRequired !== true ||
      protocol.neutralExpressionRequired !== true || protocol.headPositionInstructionRequired !== true ||
      protocol.poseAxisAndSignedDegreesRequiredForPoseStrata !== true || protocol.providerBlindAnnotationRequired !== true ||
      protocol.annotationFreezeBeforeProviderRunRequired !== true || protocol.providerIndexMayDefineGroundTruth !== false ||
      protocol.fr45ObservedIndex152MayDefineGroundTruth !== false || protocol.requiredCaptureStrata.length !== REQUIRED_STRATA.length ||
      protocol.requiredCaptureStrata.some((stratum, index) => stratum !== REQUIRED_STRATA[index])) {
    throw new FaceAuthorityValidationError('FR-47 dataset protocol drift.');
  }
  for (const threshold of [
    protocol.minimumSubjects,
    protocol.minimumCapturesPerStratum,
    protocol.minimumIndependentAnnotatorsPerCapture,
    protocol.maximumPointError,
    protocol.repeatabilityErrorThreshold,
    protocol.poseErrorThreshold,
    protocol.allowedPoseMagnitudeDegrees,
  ]) {
    if (threshold !== null) throw new FaceAuthorityValidationError('FR-47 empirical counts/thresholds must remain unset before dataset review.');
  }
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-47 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function validateMentonValidationDatasetFR47(
  dataset: MentonValidationDatasetFR47V1,
): MentonValidationDatasetFR47V1 {
  validateMentonValidationDatasetAuthorityFR47();
  if (dataset.schemaVersion !== 'fr47-dataset-v1') throw new FaceAuthorityValidationError('FR-47 dataset schema drift.');
  nonEmpty(dataset.datasetRef, 'datasetRef');
  unique(dataset.subjects.map((subject) => subject.subjectRef), 'subject refs');
  unique(dataset.captures.map((capture) => capture.captureRef), 'capture refs');
  unique(dataset.captures.map((capture) => capture.physicalCaptureInstanceRef), 'physical capture instance refs');
  unique(dataset.annotations.map((annotation) => `${annotation.captureRef}::${annotation.annotatorRef}`), 'capture/annotator annotation pairs');

  const subjectRefs = new Set(dataset.subjects.map((subject) => subject.subjectRef));
  const captureRefs = new Set(dataset.captures.map((capture) => capture.captureRef));
  for (const subject of dataset.subjects) {
    nonEmpty(subject.subjectRef, 'subjectRef');
    if (subject.independentSubject !== true || !['calibration', 'holdout'].includes(subject.partition)) {
      throw new FaceAuthorityValidationError(`FR-47 subject ${subject.subjectRef} identity/partition drift.`);
    }
  }
  for (const capture of dataset.captures) {
    nonEmpty(capture.captureRef, 'captureRef');
    if (!subjectRefs.has(capture.subjectRef)) throw new FaceAuthorityValidationError(`FR-47 capture ${capture.captureRef} references unknown subject.`);
    nonEmpty(capture.canonicalAssetDigest, 'canonicalAssetDigest');
    nonEmpty(capture.capturedAt, 'capturedAt');
    nonEmpty(capture.deviceRef, 'deviceRef');
    nonEmpty(capture.physicalCaptureInstanceRef, 'physicalCaptureInstanceRef');
    if (!Number.isFinite(Date.parse(capture.capturedAt))) throw new FaceAuthorityValidationError(`FR-47 capture ${capture.captureRef} requires a parseable timestamp.`);
    if (!Number.isInteger(capture.imageWidth) || capture.imageWidth <= 0 || !Number.isInteger(capture.imageHeight) || capture.imageHeight <= 0) {
      throw new FaceAuthorityValidationError(`FR-47 capture ${capture.captureRef} requires positive integer image dimensions.`);
    }
    if (capture.neutralExpressionApplied !== true || capture.headPositionInstructionApplied !== true || capture.groundTruthLockedBeforeProviderRun !== true) {
      throw new FaceAuthorityValidationError(`FR-47 capture ${capture.captureRef} must preserve neutral/head-position instructions and annotation freeze ordering.`);
    }
    validatePose(capture);
    if (capture.providerRunRef === null && capture.providerRunExecutedAfterGroundTruthLock !== false) {
      throw new FaceAuthorityValidationError(`FR-47 capture ${capture.captureRef} cannot claim provider execution without a providerRunRef.`);
    }
    if (capture.providerRunRef !== null) {
      nonEmpty(capture.providerRunRef, 'providerRunRef');
      if (capture.providerRunExecutedAfterGroundTruthLock !== true) {
        throw new FaceAuthorityValidationError(`FR-47 capture ${capture.captureRef} provider run must occur after ground-truth lock.`);
      }
    }
  }
  for (const annotation of dataset.annotations) {
    if (!captureRefs.has(annotation.captureRef)) throw new FaceAuthorityValidationError(`FR-47 annotation references unknown capture ${annotation.captureRef}.`);
    validateChinInferiorIndependentAnnotationFR46({
      subjectId: dataset.captures.find((capture) => capture.captureRef === annotation.captureRef)!.subjectRef,
      captureId: annotation.captureRef,
      annotatorId: annotation.annotatorRef,
      targetName: annotation.targetName,
      x: annotation.x,
      y: annotation.y,
      providerOutputVisibleDuringAnnotation: annotation.providerOutputVisibleDuringAnnotation,
      annotationFrozenBeforeProviderScoring: annotation.annotationFrozenBeforeProviderScoring,
    });
  }
  if (dataset.providerRunsExecutedAfterFreeze === true) {
    if (dataset.groundTruthFrozen !== true || dataset.captures.some((capture) => capture.providerRunRef === null || capture.providerRunExecutedAfterGroundTruthLock !== true)) {
      throw new FaceAuthorityValidationError('FR-47 providerRunsExecutedAfterFreeze requires frozen ground truth and a post-freeze provider run for every capture.');
    }
    if (dataset.captures.some((capture) => !dataset.annotations.some((annotation) => annotation.captureRef === capture.captureRef))) {
      throw new FaceAuthorityValidationError('FR-47 provider runs cannot precede independent annotation coverage for any capture.');
    }
  } else if (dataset.captures.some((capture) => capture.providerRunRef !== null || capture.providerRunExecutedAfterGroundTruthLock !== false)) {
    throw new FaceAuthorityValidationError('FR-47 dataset-level provider-run state must agree with per-capture provider-run state.');
  }
  return dataset;
}

export function assessMentonValidationDatasetReadinessFR47(
  dataset: MentonValidationDatasetFR47V1 | null,
): MentonValidationDatasetReadinessFR47V1 {
  validateMentonValidationDatasetAuthorityFR47();
  if (dataset === null) {
    return Object.freeze({
      protocolDefined: true as const,
      validationDatasetPresent: false,
      calibrationPartitionPresent: false,
      holdoutPartitionPresent: false,
      allSubjectsHaveRequiredCaptureStrata: false,
      distinctRepeatedPhysicalCaptureEvidencePresentForEverySubject: false,
      allPoseAxesLabeledForEverySubject: false,
      independentMentonAnnotationPresentForEveryCapture: false,
      groundTruthFrozenBeforeProviderRun: false,
      providerOutputPresentForEveryCapture: false,
      providerCandidateToMentonMappingValidated: false as const,
      repeatedCaptureRepeatabilityValidated: false as const,
      poseStabilityValidated: false as const,
      calibrationThresholdsDefined: false as const,
      fr35PointToContourRelationValidated: false as const,
      traditionalDigeEquivalenceValidated: false as const,
      researchCandidateAdmitted: false as const,
      productionGeometryAuthorized: false as const,
      blockers: Object.freeze([
        'validation_dataset_missing',
        'calibration_partition_missing',
        'holdout_partition_missing',
        'required_capture_strata_missing',
        'independent_menton_annotations_missing',
        'provider_outputs_missing',
        'calibration_thresholds_unreviewed',
      ]),
    });
  }

  validateMentonValidationDatasetFR47(dataset);
  const calibrationPartitionPresent = dataset.subjects.some((subject) => subject.partition === 'calibration');
  const holdoutPartitionPresent = dataset.subjects.some((subject) => subject.partition === 'holdout');
  const allSubjectsHaveRequiredCaptureStrata = dataset.subjects.length > 0 && dataset.subjects.every((subject) => {
    const strata = new Set(dataset.captures.filter((capture) => capture.subjectRef === subject.subjectRef).map((capture) => capture.stratum));
    return REQUIRED_STRATA.every((stratum) => strata.has(stratum));
  });
  const distinctRepeatedPhysicalCaptureEvidencePresentForEverySubject = dataset.subjects.length > 0 && dataset.subjects.every((subject) => {
    const captures = dataset.captures.filter((capture) => capture.subjectRef === subject.subjectRef);
    const baseline = captures.find((capture) => capture.stratum === 'neutral_frontal_baseline');
    const repeat = captures.find((capture) => capture.stratum === 'repeat_neutral_capture');
    return baseline !== undefined && repeat !== undefined && baseline.physicalCaptureInstanceRef !== repeat.physicalCaptureInstanceRef;
  });
  const allPoseAxesLabeledForEverySubject = dataset.subjects.length > 0 && dataset.subjects.every((subject) => {
    const captures = dataset.captures.filter((capture) => capture.subjectRef === subject.subjectRef);
    return (['yaw', 'pitch', 'roll'] as const).every((axis) => captures.some((capture) => capture.poseAxis === axis && Number.isFinite(capture.poseDegrees)));
  });
  const independentMentonAnnotationPresentForEveryCapture = dataset.captures.length > 0 && dataset.captures.every((capture) =>
    dataset.annotations.some((annotation) => annotation.captureRef === capture.captureRef && annotation.providerOutputVisibleDuringAnnotation === false && annotation.annotationFrozenBeforeProviderScoring === true),
  );
  const groundTruthFrozenBeforeProviderRun = dataset.groundTruthFrozen === true && dataset.captures.every((capture) => capture.groundTruthLockedBeforeProviderRun === true);
  const providerOutputPresentForEveryCapture = dataset.providerRunsExecutedAfterFreeze === true && dataset.captures.length > 0 &&
    dataset.captures.every((capture) => capture.providerRunRef !== null && capture.providerRunExecutedAfterGroundTruthLock === true);

  const blockers = [
    ...(calibrationPartitionPresent ? [] : ['calibration_partition_missing']),
    ...(holdoutPartitionPresent ? [] : ['holdout_partition_missing']),
    ...(allSubjectsHaveRequiredCaptureStrata ? [] : ['required_capture_strata_incomplete']),
    ...(distinctRepeatedPhysicalCaptureEvidencePresentForEverySubject ? [] : ['distinct_repeat_capture_evidence_incomplete']),
    ...(allPoseAxesLabeledForEverySubject ? [] : ['pose_axis_evidence_incomplete']),
    ...(independentMentonAnnotationPresentForEveryCapture ? [] : ['independent_menton_annotation_coverage_incomplete']),
    ...(groundTruthFrozenBeforeProviderRun ? [] : ['ground_truth_freeze_order_unproven']),
    ...(providerOutputPresentForEveryCapture ? [] : ['provider_output_coverage_incomplete']),
    'provider_candidate_to_menton_mapping_not_yet_scored',
    'repeatability_not_yet_scored',
    'pose_stability_not_yet_scored',
    'calibration_thresholds_unreviewed',
    'fr35_point_to_contour_relation_unreviewed',
    'traditional_dige_equivalence_unreviewed',
  ];
  return Object.freeze({
    protocolDefined: true as const,
    validationDatasetPresent: true,
    calibrationPartitionPresent,
    holdoutPartitionPresent,
    allSubjectsHaveRequiredCaptureStrata,
    distinctRepeatedPhysicalCaptureEvidencePresentForEverySubject,
    allPoseAxesLabeledForEverySubject,
    independentMentonAnnotationPresentForEveryCapture,
    groundTruthFrozenBeforeProviderRun,
    providerOutputPresentForEveryCapture,
    providerCandidateToMentonMappingValidated: false as const,
    repeatedCaptureRepeatabilityValidated: false as const,
    poseStabilityValidated: false as const,
    calibrationThresholdsDefined: false as const,
    fr35PointToContourRelationValidated: false as const,
    traditionalDigeEquivalenceValidated: false as const,
    researchCandidateAdmitted: false as const,
    productionGeometryAuthorized: false as const,
    blockers: Object.freeze(blockers),
  });
}

export function assertMentonValidationDatasetReadyForProductionFR47(): never {
  validateMentonValidationDatasetAuthorityFR47();
  throw new FaceAuthorityValidationError('FR-47 defines a provider-blind multi-subject validation dataset contract only; no reviewed dataset, calibration thresholds, FR-35 contour relation, 地閣 equivalence, or production geometry is authorized.');
}
