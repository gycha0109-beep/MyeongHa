import { FaceAuthorityValidationError } from './validation.js';

export type FacePresenceDatasetPartitionFRData07V1 = 'calibration' | 'holdout';

export type IndependentHumanFaceCountLabelFRData07V1 =
  | 'zero_human_faces'
  | 'one_human_face'
  | 'multiple_human_faces'
  | 'indeterminate';

export interface IndependentFaceGroundTruthProtocolFRData07V1 {
  readonly providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1';
  readonly requiredPartitions: readonly ['calibration', 'holdout'];
  readonly partitionAssignedBeforeProviderScoringRequired: true;
  readonly canonicalAssetDigestMayAppearInMultiplePartitions: false;
  readonly providerBlindAnnotationRequired: true;
  readonly providerCandidateCountVisibleDuringAnnotation: false;
  readonly providerLandmarksVisibleDuringAnnotation: false;
  readonly providerResultShapeVisibleDuringAnnotation: false;
  readonly providerOutputMayDefineHumanFaceCountLabel: false;
  readonly annotationLedgerFreezeBeforeProviderScoringRequired: true;
  readonly holdoutMayTuneLabels: false;
  readonly holdoutMayTuneDecisionThresholds: false;
  readonly labelVocabulary: readonly [
    'zero_human_faces',
    'one_human_face',
    'multiple_human_faces',
    'indeterminate',
  ];
  readonly requiredEvaluationLabels: readonly [
    'zero_human_faces',
    'one_human_face',
    'multiple_human_faces',
  ];
  readonly indeterminateLabelMayBeForcedIntoBinaryClass: false;
  readonly subjectIdentityInferenceRequired: false;
  readonly minimumCapturesPerPartition: null;
  readonly minimumCapturesPerEvaluationLabel: null;
  readonly minimumIndependentAnnotatorsPerCapture: null;
  readonly interAnnotatorAgreementThreshold: null;
  readonly providerCandidateDecisionThreshold: null;
  readonly acceptableFalsePositiveRate: null;
  readonly acceptableFalseNegativeRate: null;
}

export interface IndependentFaceValidationCaptureFRData07V1 {
  readonly captureRef: string;
  readonly partition: FacePresenceDatasetPartitionFRData07V1;
  readonly canonicalAssetDigest: string;
  readonly sourceProvenanceRef: string;
  readonly sourceInstanceRef: string;
  readonly providerRunRef: string | null;
  readonly providerRunStartedAt: string | null;
  readonly providerRunExecutedAfterAnnotationFreeze: boolean;
}

export interface IndependentFaceCountAnnotationFRData07V1 {
  readonly captureRef: string;
  readonly annotatorRef: string;
  readonly annotationSessionRef: string;
  readonly observedAssetDigest: string;
  readonly label: IndependentHumanFaceCountLabelFRData07V1;
  readonly annotatedAt: string;
  readonly providerOutputVisibleDuringAnnotation: false;
  readonly providerCandidateCountVisibleDuringAnnotation: false;
  readonly providerLandmarksVisibleDuringAnnotation: false;
  readonly providerResultShapeVisibleDuringAnnotation: false;
  readonly providerOutputUsedToChooseLabel: false;
  readonly subjectIdentityInferred: false;
  readonly annotationFrozenBeforeProviderScoring: true;
}

export interface IndependentFaceGroundTruthDatasetFRData07V1 {
  readonly schemaVersion: 'fr-data07-independent-face-ground-truth-v1';
  readonly datasetRef: string;
  readonly providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1';
  readonly captures: readonly IndependentFaceValidationCaptureFRData07V1[];
  readonly annotations: readonly IndependentFaceCountAnnotationFRData07V1[];
  readonly annotationLedgerFrozen: boolean;
  readonly annotationLedgerDigest: string | null;
  readonly annotationLedgerFrozenAt: string | null;
  readonly providerRunsExecutedAfterFreeze: boolean;
}

export interface IndependentFaceGroundTruthReadinessFRData07V1 {
  readonly protocolDefined: true;
  readonly validationDatasetPresent: boolean;
  readonly calibrationPartitionPresent: boolean;
  readonly holdoutPartitionPresent: boolean;
  readonly zeroHumanFaceLabelPresent: boolean;
  readonly oneHumanFaceLabelPresent: boolean;
  readonly multipleHumanFaceLabelPresent: boolean;
  readonly independentAnnotationPresentForEveryCapture: boolean;
  readonly providerBlindAnnotationRecordedForEveryAnnotation: boolean;
  readonly annotationLedgerFrozenBeforeProviderRun: boolean;
  readonly providerOutputPresentForEveryCapture: boolean;
  readonly crossPartitionExactAssetLeakageAbsent: boolean;
  readonly providerDetectionConstructValidityValidated: false;
  readonly providerFaceCandidateHumanIdentityValidated: false;
  readonly singleHumanFaceVerified: false;
  readonly facePresenceVerified: false;
  readonly calibrationThresholdsDefined: false;
  readonly providerCandidateDecisionThresholdDefined: false;
  readonly empiricalScoringPerformed: false;
  readonly researchCandidateAdmitted: false;
  readonly productionGeometryAuthorized: false;
  readonly blockers: readonly string[];
}

export interface IndependentFaceGroundTruthAuthorityFRData07V1 {
  readonly schemaVersion: 'fr-data07-v1';
  readonly authorityRef: 'authority.face.independent_face_ground_truth_protocol.frdata07';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'protocol_defined_no_reviewed_validation_dataset';
  readonly upstreamProviderObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1';
  readonly protocol: IndependentFaceGroundTruthProtocolFRData07V1;
  readonly evaluationDimensions: readonly [
    'human_face_presence_construct_validity',
    'single_human_face_construct_validity',
    'zero_face_false_positive_behavior',
    'multiple_face_single_subject_behavior',
    'calibration_holdout_generalization',
  ];
  readonly authorityBoundary: {
    readonly protocolDefinitionMeansValidationCompleted: false;
    readonly annotationPresenceMeansGroundTruthAuthorityValidated: false;
    readonly singleAnnotatorLabelMeansGroundTruthAuthorityValidated: false;
    readonly providerCandidateCountMayDefineHumanFaceCount: false;
    readonly oneProviderCandidateMeansOneHumanFace: false;
    readonly zeroProviderCandidatesMeansNoHumanFace: false;
    readonly holdoutMayTuneThresholds: false;
    readonly exactAssetSeparationMeansNearDuplicateLeakageExcluded: false;
    readonly indeterminateMayBeSilentlyCoerced: false;
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

const SHA256 = /^sha256:[0-9a-f]{64}$/u;

const LABELS = Object.freeze([
  'zero_human_faces',
  'one_human_face',
  'multiple_human_faces',
  'indeterminate',
] as const);

const REQUIRED_EVALUATION_LABELS = Object.freeze([
  'zero_human_faces',
  'one_human_face',
  'multiple_human_faces',
] as const);

export const INDEPENDENT_FACE_GROUND_TRUTH_AUTHORITY_FRDATA07:
IndependentFaceGroundTruthAuthorityFRData07V1 = Object.freeze({
  schemaVersion: 'fr-data07-v1' as const,
  authorityRef: 'authority.face.independent_face_ground_truth_protocol.frdata07' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'protocol_defined_no_reviewed_validation_dataset' as const,
  upstreamProviderObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1' as const,
  protocol: Object.freeze({
    providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1' as const,
    requiredPartitions: Object.freeze(['calibration', 'holdout'] as const),
    partitionAssignedBeforeProviderScoringRequired: true as const,
    canonicalAssetDigestMayAppearInMultiplePartitions: false as const,
    providerBlindAnnotationRequired: true as const,
    providerCandidateCountVisibleDuringAnnotation: false as const,
    providerLandmarksVisibleDuringAnnotation: false as const,
    providerResultShapeVisibleDuringAnnotation: false as const,
    providerOutputMayDefineHumanFaceCountLabel: false as const,
    annotationLedgerFreezeBeforeProviderScoringRequired: true as const,
    holdoutMayTuneLabels: false as const,
    holdoutMayTuneDecisionThresholds: false as const,
    labelVocabulary: LABELS,
    requiredEvaluationLabels: REQUIRED_EVALUATION_LABELS,
    indeterminateLabelMayBeForcedIntoBinaryClass: false as const,
    subjectIdentityInferenceRequired: false as const,
    minimumCapturesPerPartition: null,
    minimumCapturesPerEvaluationLabel: null,
    minimumIndependentAnnotatorsPerCapture: null,
    interAnnotatorAgreementThreshold: null,
    providerCandidateDecisionThreshold: null,
    acceptableFalsePositiveRate: null,
    acceptableFalseNegativeRate: null,
  }),
  evaluationDimensions: Object.freeze([
    'human_face_presence_construct_validity',
    'single_human_face_construct_validity',
    'zero_face_false_positive_behavior',
    'multiple_face_single_subject_behavior',
    'calibration_holdout_generalization',
  ] as const),
  authorityBoundary: Object.freeze({
    protocolDefinitionMeansValidationCompleted: false as const,
    annotationPresenceMeansGroundTruthAuthorityValidated: false as const,
    singleAnnotatorLabelMeansGroundTruthAuthorityValidated: false as const,
    providerCandidateCountMayDefineHumanFaceCount: false as const,
    oneProviderCandidateMeansOneHumanFace: false as const,
    zeroProviderCandidatesMeansNoHumanFace: false as const,
    holdoutMayTuneThresholds: false as const,
    exactAssetSeparationMeansNearDuplicateLeakageExcluded: false as const,
    indeterminateMayBeSilentlyCoerced: false as const,
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
  throw new FaceAuthorityValidationError(`FR-DATA-07 ${message}`);
}

function nonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be non-empty.`);
  return value;
}

function canonicalSha256(value: string, label: string): string {
  if (!SHA256.test(value)) fail(`${label} must use canonical lowercase sha256:<64-hex> form.`);
  return value;
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} must be unique.`);
}

function parseTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail(`${label} must be a parseable timestamp.`);
  return timestamp;
}

function validateLabel(value: string, label: string): asserts value is IndependentHumanFaceCountLabelFRData07V1 {
  if (!(LABELS as readonly string[]).includes(value)) fail(`${label} is unsupported.`);
}

export function validateIndependentFaceGroundTruthAuthorityFRData07(
  authority: IndependentFaceGroundTruthAuthorityFRData07V1 = INDEPENDENT_FACE_GROUND_TRUTH_AUTHORITY_FRDATA07,
): IndependentFaceGroundTruthAuthorityFRData07V1 {
  if (
    authority.schemaVersion !== 'fr-data07-v1' ||
    authority.authorityRef !== 'authority.face.independent_face_ground_truth_protocol.frdata07' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'protocol_defined_no_reviewed_validation_dataset' ||
    authority.upstreamProviderObservationSchemaRef !== 'fr-data06-provider-face-candidate-observation-v1'
  ) fail('authority identity/upstream schema drift.');

  const protocol = authority.protocol;
  if (
    protocol.providerObservationSchemaRef !== 'fr-data06-provider-face-candidate-observation-v1' ||
    protocol.requiredPartitions.length !== 2 || protocol.requiredPartitions[0] !== 'calibration' || protocol.requiredPartitions[1] !== 'holdout' ||
    protocol.partitionAssignedBeforeProviderScoringRequired !== true ||
    protocol.canonicalAssetDigestMayAppearInMultiplePartitions !== false ||
    protocol.providerBlindAnnotationRequired !== true ||
    protocol.providerCandidateCountVisibleDuringAnnotation !== false ||
    protocol.providerLandmarksVisibleDuringAnnotation !== false ||
    protocol.providerResultShapeVisibleDuringAnnotation !== false ||
    protocol.providerOutputMayDefineHumanFaceCountLabel !== false ||
    protocol.annotationLedgerFreezeBeforeProviderScoringRequired !== true ||
    protocol.holdoutMayTuneLabels !== false || protocol.holdoutMayTuneDecisionThresholds !== false ||
    protocol.indeterminateLabelMayBeForcedIntoBinaryClass !== false ||
    protocol.subjectIdentityInferenceRequired !== false
  ) fail('protocol authority boundary drift.');

  if (
    protocol.labelVocabulary.length !== LABELS.length ||
    protocol.labelVocabulary.some((value, index) => value !== LABELS[index]) ||
    protocol.requiredEvaluationLabels.length !== REQUIRED_EVALUATION_LABELS.length ||
    protocol.requiredEvaluationLabels.some((value, index) => value !== REQUIRED_EVALUATION_LABELS[index])
  ) fail('label vocabulary/evaluation labels drift.');

  for (const threshold of [
    protocol.minimumCapturesPerPartition,
    protocol.minimumCapturesPerEvaluationLabel,
    protocol.minimumIndependentAnnotatorsPerCapture,
    protocol.interAnnotatorAgreementThreshold,
    protocol.providerCandidateDecisionThreshold,
    protocol.acceptableFalsePositiveRate,
    protocol.acceptableFalseNegativeRate,
  ]) {
    if (threshold !== null) fail('empirical counts, agreement limits, decision thresholds, and error-rate limits must remain unset before reviewed data.');
  }

  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    fail('authority boundary must remain fully fail-closed.');
  }

  return authority;
}

export function validateIndependentFaceGroundTruthDatasetFRData07(
  dataset: IndependentFaceGroundTruthDatasetFRData07V1,
): IndependentFaceGroundTruthDatasetFRData07V1 {
  validateIndependentFaceGroundTruthAuthorityFRData07();
  if (dataset.schemaVersion !== 'fr-data07-independent-face-ground-truth-v1') fail('dataset schema drift.');
  if (dataset.providerObservationSchemaRef !== 'fr-data06-provider-face-candidate-observation-v1') fail('dataset provider observation schema drift.');
  nonEmpty(dataset.datasetRef, 'datasetRef');
  if (!Array.isArray(dataset.captures) || !Array.isArray(dataset.annotations)) fail('captures and annotations must be arrays.');

  unique(dataset.captures.map((capture) => capture.captureRef), 'capture refs');
  unique(dataset.captures.map((capture) => capture.sourceInstanceRef), 'source instance refs');
  unique(dataset.annotations.map((annotation) => `${annotation.captureRef}::${annotation.annotatorRef}`), 'capture/annotator annotation pairs');
  unique(dataset.annotations.map((annotation) => annotation.annotationSessionRef), 'annotation session refs');

  const captureByRef = new Map(dataset.captures.map((capture) => [capture.captureRef, capture] as const));
  const digestPartitions = new Map<string, FacePresenceDatasetPartitionFRData07V1>();

  for (const capture of dataset.captures) {
    nonEmpty(capture.captureRef, 'captureRef');
    nonEmpty(capture.sourceProvenanceRef, `${capture.captureRef}.sourceProvenanceRef`);
    nonEmpty(capture.sourceInstanceRef, `${capture.captureRef}.sourceInstanceRef`);
    canonicalSha256(capture.canonicalAssetDigest, `${capture.captureRef}.canonicalAssetDigest`);
    if (capture.partition !== 'calibration' && capture.partition !== 'holdout') fail(`capture ${capture.captureRef} partition is unsupported.`);

    const priorPartition = digestPartitions.get(capture.canonicalAssetDigest);
    if (priorPartition !== undefined && priorPartition !== capture.partition) {
      fail(`canonical asset digest ${capture.canonicalAssetDigest} appears across calibration and holdout partitions.`);
    }
    digestPartitions.set(capture.canonicalAssetDigest, capture.partition);

    if (capture.providerRunRef === null) {
      if (capture.providerRunStartedAt !== null || capture.providerRunExecutedAfterAnnotationFreeze !== false) {
        fail(`capture ${capture.captureRef} provider-run null state is inconsistent.`);
      }
    } else {
      nonEmpty(capture.providerRunRef, `${capture.captureRef}.providerRunRef`);
      if (capture.providerRunStartedAt === null) fail(`capture ${capture.captureRef} providerRunStartedAt is required when providerRunRef is present.`);
      parseTimestamp(capture.providerRunStartedAt, `${capture.captureRef}.providerRunStartedAt`);
      if (capture.providerRunExecutedAfterAnnotationFreeze !== true) fail(`capture ${capture.captureRef} provider run must be explicitly post-freeze.`);
    }
  }

  for (const annotation of dataset.annotations) {
    nonEmpty(annotation.captureRef, 'annotation.captureRef');
    nonEmpty(annotation.annotatorRef, `${annotation.captureRef}.annotatorRef`);
    nonEmpty(annotation.annotationSessionRef, `${annotation.captureRef}.annotationSessionRef`);
    const capture = captureByRef.get(annotation.captureRef);
    if (capture === undefined) fail(`annotation references unknown capture ${annotation.captureRef}.`);
    if (canonicalSha256(annotation.observedAssetDigest, `${annotation.captureRef}.observedAssetDigest`) !== capture.canonicalAssetDigest) {
      fail(`annotation asset digest drift for ${annotation.captureRef}.`);
    }
    validateLabel(annotation.label, `${annotation.captureRef}.label`);
    parseTimestamp(annotation.annotatedAt, `${annotation.captureRef}.annotatedAt`);
    if (
      annotation.providerOutputVisibleDuringAnnotation !== false ||
      annotation.providerCandidateCountVisibleDuringAnnotation !== false ||
      annotation.providerLandmarksVisibleDuringAnnotation !== false ||
      annotation.providerResultShapeVisibleDuringAnnotation !== false ||
      annotation.providerOutputUsedToChooseLabel !== false ||
      annotation.subjectIdentityInferred !== false ||
      annotation.annotationFrozenBeforeProviderScoring !== true
    ) fail(`annotation ${annotation.captureRef}/${annotation.annotatorRef} violates provider-blind independent-label requirements.`);
  }

  if (dataset.annotationLedgerFrozen) {
    if (dataset.annotationLedgerDigest === null || dataset.annotationLedgerFrozenAt === null) {
      fail('frozen annotation ledger requires digest and frozen timestamp.');
    }
    canonicalSha256(dataset.annotationLedgerDigest, 'annotationLedgerDigest');
    const frozenAt = parseTimestamp(dataset.annotationLedgerFrozenAt, 'annotationLedgerFrozenAt');
    if (dataset.annotations.some((annotation) => parseTimestamp(annotation.annotatedAt, `${annotation.captureRef}.annotatedAt`) > frozenAt)) {
      fail('annotation ledger cannot freeze before one of its included annotations was recorded.');
    }
  } else if (dataset.annotationLedgerDigest !== null || dataset.annotationLedgerFrozenAt !== null) {
    fail('unfrozen annotation ledger cannot carry a freeze digest or timestamp.');
  }

  if (dataset.providerRunsExecutedAfterFreeze) {
    if (!dataset.annotationLedgerFrozen || dataset.annotationLedgerFrozenAt === null) {
      fail('provider runs require a frozen annotation ledger first.');
    }
    const frozenAt = parseTimestamp(dataset.annotationLedgerFrozenAt, 'annotationLedgerFrozenAt');
    if (dataset.captures.length === 0 || dataset.captures.some((capture) => {
      if (capture.providerRunRef === null || capture.providerRunStartedAt === null || capture.providerRunExecutedAfterAnnotationFreeze !== true) return true;
      return parseTimestamp(capture.providerRunStartedAt, `${capture.captureRef}.providerRunStartedAt`) < frozenAt;
    })) fail('every provider run must be present and start at or after the annotation-ledger freeze.');
  } else if (dataset.captures.some((capture) => capture.providerRunRef !== null || capture.providerRunStartedAt !== null || capture.providerRunExecutedAfterAnnotationFreeze !== false)) {
    fail('dataset-level provider-run state must agree with per-capture provider-run state.');
  }

  return dataset;
}

export function assessIndependentFaceGroundTruthReadinessFRData07(
  dataset: IndependentFaceGroundTruthDatasetFRData07V1 | null,
): IndependentFaceGroundTruthReadinessFRData07V1 {
  validateIndependentFaceGroundTruthAuthorityFRData07();
  if (dataset === null) {
    return Object.freeze({
      protocolDefined: true as const,
      validationDatasetPresent: false,
      calibrationPartitionPresent: false,
      holdoutPartitionPresent: false,
      zeroHumanFaceLabelPresent: false,
      oneHumanFaceLabelPresent: false,
      multipleHumanFaceLabelPresent: false,
      independentAnnotationPresentForEveryCapture: false,
      providerBlindAnnotationRecordedForEveryAnnotation: false,
      annotationLedgerFrozenBeforeProviderRun: false,
      providerOutputPresentForEveryCapture: false,
      crossPartitionExactAssetLeakageAbsent: false,
      providerDetectionConstructValidityValidated: false as const,
      providerFaceCandidateHumanIdentityValidated: false as const,
      singleHumanFaceVerified: false as const,
      facePresenceVerified: false as const,
      calibrationThresholdsDefined: false as const,
      providerCandidateDecisionThresholdDefined: false as const,
      empiricalScoringPerformed: false as const,
      researchCandidateAdmitted: false as const,
      productionGeometryAuthorized: false as const,
      blockers: Object.freeze([
        'validation_dataset_missing',
        'calibration_partition_missing',
        'holdout_partition_missing',
        'zero_human_face_labels_missing',
        'one_human_face_labels_missing',
        'multiple_human_face_labels_missing',
        'independent_annotation_coverage_missing',
        'annotation_ledger_freeze_order_unproven',
        'provider_outputs_missing',
        'empirical_scoring_not_performed',
        'decision_thresholds_unreviewed',
      ]),
    });
  }

  validateIndependentFaceGroundTruthDatasetFRData07(dataset);
  const calibrationPartitionPresent = dataset.captures.some((capture) => capture.partition === 'calibration');
  const holdoutPartitionPresent = dataset.captures.some((capture) => capture.partition === 'holdout');
  const labels = new Set(dataset.annotations.map((annotation) => annotation.label));
  const zeroHumanFaceLabelPresent = labels.has('zero_human_faces');
  const oneHumanFaceLabelPresent = labels.has('one_human_face');
  const multipleHumanFaceLabelPresent = labels.has('multiple_human_faces');
  const independentAnnotationPresentForEveryCapture = dataset.captures.length > 0 && dataset.captures.every((capture) =>
    dataset.annotations.some((annotation) => annotation.captureRef === capture.captureRef),
  );
  const providerBlindAnnotationRecordedForEveryAnnotation = dataset.annotations.length > 0 && dataset.annotations.every((annotation) =>
    annotation.providerOutputVisibleDuringAnnotation === false &&
    annotation.providerCandidateCountVisibleDuringAnnotation === false &&
    annotation.providerLandmarksVisibleDuringAnnotation === false &&
    annotation.providerResultShapeVisibleDuringAnnotation === false &&
    annotation.providerOutputUsedToChooseLabel === false &&
    annotation.subjectIdentityInferred === false &&
    annotation.annotationFrozenBeforeProviderScoring === true,
  );
  const annotationLedgerFrozenBeforeProviderRun = dataset.annotationLedgerFrozen === true && dataset.annotationLedgerFrozenAt !== null &&
    (dataset.providerRunsExecutedAfterFreeze === false || dataset.captures.every((capture) => capture.providerRunExecutedAfterAnnotationFreeze === true));
  const providerOutputPresentForEveryCapture = dataset.providerRunsExecutedAfterFreeze === true && dataset.captures.length > 0 &&
    dataset.captures.every((capture) => capture.providerRunRef !== null && capture.providerRunStartedAt !== null && capture.providerRunExecutedAfterAnnotationFreeze === true);
  const digestPartitionSets = new Map<string, Set<FacePresenceDatasetPartitionFRData07V1>>();
  for (const capture of dataset.captures) {
    const set = digestPartitionSets.get(capture.canonicalAssetDigest) ?? new Set<FacePresenceDatasetPartitionFRData07V1>();
    set.add(capture.partition);
    digestPartitionSets.set(capture.canonicalAssetDigest, set);
  }
  const crossPartitionExactAssetLeakageAbsent = [...digestPartitionSets.values()].every((set) => set.size === 1);

  const blockers = [
    ...(calibrationPartitionPresent ? [] : ['calibration_partition_missing']),
    ...(holdoutPartitionPresent ? [] : ['holdout_partition_missing']),
    ...(zeroHumanFaceLabelPresent ? [] : ['zero_human_face_labels_missing']),
    ...(oneHumanFaceLabelPresent ? [] : ['one_human_face_labels_missing']),
    ...(multipleHumanFaceLabelPresent ? [] : ['multiple_human_face_labels_missing']),
    ...(independentAnnotationPresentForEveryCapture ? [] : ['independent_annotation_coverage_incomplete']),
    ...(providerBlindAnnotationRecordedForEveryAnnotation ? [] : ['provider_blindness_evidence_incomplete']),
    ...(annotationLedgerFrozenBeforeProviderRun ? [] : ['annotation_ledger_freeze_order_unproven']),
    ...(providerOutputPresentForEveryCapture ? [] : ['provider_output_coverage_incomplete']),
    ...(crossPartitionExactAssetLeakageAbsent ? [] : ['cross_partition_exact_asset_leakage_detected']),
    'inter_annotator_ground_truth_authority_unreviewed',
    'provider_detection_construct_validity_not_yet_scored',
    'single_human_face_construct_validity_not_yet_scored',
    'near_duplicate_partition_leakage_not_yet_validated',
    'decision_thresholds_unreviewed',
  ];

  return Object.freeze({
    protocolDefined: true as const,
    validationDatasetPresent: true,
    calibrationPartitionPresent,
    holdoutPartitionPresent,
    zeroHumanFaceLabelPresent,
    oneHumanFaceLabelPresent,
    multipleHumanFaceLabelPresent,
    independentAnnotationPresentForEveryCapture,
    providerBlindAnnotationRecordedForEveryAnnotation,
    annotationLedgerFrozenBeforeProviderRun,
    providerOutputPresentForEveryCapture,
    crossPartitionExactAssetLeakageAbsent,
    providerDetectionConstructValidityValidated: false as const,
    providerFaceCandidateHumanIdentityValidated: false as const,
    singleHumanFaceVerified: false as const,
    facePresenceVerified: false as const,
    calibrationThresholdsDefined: false as const,
    providerCandidateDecisionThresholdDefined: false as const,
    empiricalScoringPerformed: false as const,
    researchCandidateAdmitted: false as const,
    productionGeometryAuthorized: false as const,
    blockers: Object.freeze(blockers),
  });
}

export function assertIndependentFaceGroundTruthReadyForPromotionFRData07(): never {
  validateIndependentFaceGroundTruthAuthorityFRData07();
  return fail(
    'provider-blind human face-count labels and freeze-order evidence define a validation protocol only; they do not validate provider detection construct validity, human-face presence, single-human-face identity, capture quality, anatomy, traditional semantics, or production geometry.',
  );
}
