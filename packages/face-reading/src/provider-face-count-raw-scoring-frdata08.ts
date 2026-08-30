import type {
  MentonDatasetProviderFaceCandidateObservationReportFRData06V1,
} from './provider-face-candidate-observations-frdata06.js';
import {
  validateIndependentFaceGroundTruthDatasetFRData07,
  type FacePresenceDatasetPartitionFRData07V1,
  type IndependentFaceGroundTruthDatasetFRData07V1,
  type IndependentHumanFaceCountLabelFRData07V1,
} from './independent-face-ground-truth-frdata07.js';
import { FaceAuthorityValidationError } from './validation.js';

export type ProviderFaceCandidateClassFRData08V1 =
  | 'zero_provider_candidates'
  | 'one_provider_candidate';

export interface FaceCountRawScoringProtocolFRData08V1 {
  readonly groundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1';
  readonly providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1';
  readonly scoringUnit: 'annotation_provider_pair';
  readonly joinKeys: readonly ['captureRef', 'canonicalAssetDigest'];
  readonly requiredPartitions: readonly ['calibration', 'holdout'];
  readonly providerCandidateCountDomain: readonly [0, 1];
  readonly zeroCandidateClass: 'zero_provider_candidates';
  readonly oneCandidateClass: 'one_provider_candidate';
  readonly captureConsensusLabelDerived: false;
  readonly annotatorVotesCollapsed: false;
  readonly indeterminateLabelIncludedAsOwnRawRow: true;
  readonly indeterminateLabelMayBeCoerced: false;
  readonly providerCandidateCountInterpretedAsHumanFaceCount: false;
  readonly truePositiveFalsePositiveTerminologyAuthorized: false;
  readonly sensitivitySpecificityComputationAuthorized: false;
  readonly providerDecisionThresholdDefined: false;
  readonly interAnnotatorAgreementThresholdDefined: false;
  readonly acceptableFalsePositiveRateDefined: false;
  readonly acceptableFalseNegativeRateDefined: false;
  readonly holdoutMayTuneLabels: false;
  readonly holdoutMayTuneDecisionThresholds: false;
}

export interface HumanLabelCountsFRData08V1 {
  readonly zeroHumanFaces: number;
  readonly oneHumanFace: number;
  readonly multipleHumanFaces: number;
  readonly indeterminate: number;
}

export interface CaptureRawJoinFRData08V1 {
  readonly captureRef: string;
  readonly partition: FacePresenceDatasetPartitionFRData07V1;
  readonly canonicalAssetDigest: string;
  readonly providerFaceCandidateCount: 0 | 1;
  readonly providerClass: ProviderFaceCandidateClassFRData08V1;
  readonly annotationCount: number;
  readonly humanLabelCounts: HumanLabelCountsFRData08V1;
  readonly annotatorDisagreementObserved: boolean;
}

export interface AnnotationProviderRawPairFRData08V1 {
  readonly captureRef: string;
  readonly partition: FacePresenceDatasetPartitionFRData07V1;
  readonly canonicalAssetDigest: string;
  readonly annotatorRef: string;
  readonly annotationSessionRef: string;
  readonly humanLabel: IndependentHumanFaceCountLabelFRData07V1;
  readonly providerFaceCandidateCount: 0 | 1;
  readonly providerClass: ProviderFaceCandidateClassFRData08V1;
}

export interface HumanLabelProviderCrossTabRowFRData08V1 {
  readonly humanLabel: IndependentHumanFaceCountLabelFRData07V1;
  readonly zeroProviderCandidates: number;
  readonly oneProviderCandidate: number;
  readonly totalAnnotations: number;
}

export interface PartitionRawScoringSummaryFRData08V1 {
  readonly partition: FacePresenceDatasetPartitionFRData07V1;
  readonly captureCount: number;
  readonly annotationPairCount: number;
  readonly capturesWithAnnotatorDisagreement: number;
  readonly crossTab: readonly HumanLabelProviderCrossTabRowFRData08V1[];
}

export interface ProviderFaceCountRawScoringReportFRData08V1 {
  readonly schemaVersion: 'fr-data08-provider-face-count-raw-scoring-v1';
  readonly datasetRef: string;
  readonly groundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1';
  readonly providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1';
  readonly annotationLedgerDigest: string;
  readonly captureCount: number;
  readonly annotationPairCount: number;
  readonly captureJoins: readonly CaptureRawJoinFRData08V1[];
  readonly annotationProviderPairs: readonly AnnotationProviderRawPairFRData08V1[];
  readonly partitionSummaries: readonly [
    PartitionRawScoringSummaryFRData08V1,
    PartitionRawScoringSummaryFRData08V1,
  ];
  readonly exactCaptureRefSetMatched: true;
  readonly exactAssetDigestJoinVerified: true;
  readonly frozenAnnotationLedgerRequired: true;
  readonly annotationLedgerFrozenBeforeProviderScoringVerified: true;
  readonly providerObservationCoverageVerified: true;
  readonly rawAnnotationProviderJoinPerformed: true;
  readonly rawPartitionCrossTabComputed: true;
  readonly upstreamProviderReportCanonicalReconstructionPerformed: false;
  readonly providerRunIdentityBindingVerified: false;
  readonly captureConsensusLabelDerived: false;
  readonly interAnnotatorGroundTruthAuthorityValidated: false;
  readonly providerDetectionConstructValidityValidated: false;
  readonly providerFaceCandidateHumanIdentityValidated: false;
  readonly singleHumanFaceVerified: false;
  readonly facePresenceVerified: false;
  readonly classificationMetricsComputed: false;
  readonly sensitivityComputed: false;
  readonly specificityComputed: false;
  readonly falsePositiveRateComputed: false;
  readonly falseNegativeRateComputed: false;
  readonly calibrationThresholdsDefined: false;
  readonly providerCandidateDecisionThresholdDefined: false;
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

export interface ProviderFaceCountRawScoringAuthorityFRData08V1 {
  readonly schemaVersion: 'fr-data08-v1';
  readonly authorityRef: 'authority.face.provider_face_count_raw_scoring.frdata08';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'raw_scoring_contract_defined_no_reviewed_empirical_validation';
  readonly protocol: FaceCountRawScoringProtocolFRData08V1;
  readonly authorityBoundary: {
    readonly rawCrossTabMeansConstructValidityValidated: false;
    readonly rawCrossTabMeansGroundTruthAuthorityValidated: false;
    readonly captureConsensusLabelDerived: false;
    readonly providerCandidateCountMayDefineHumanFaceCount: false;
    readonly providerRunIdentityBindingVerified: false;
    readonly upstreamProviderReportCanonicalReconstructionPerformed: false;
    readonly nearDuplicatePartitionLeakageValidated: false;
    readonly classificationMetricsAuthorized: false;
    readonly holdoutMayTuneThresholds: false;
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

export const PROVIDER_FACE_COUNT_RAW_SCORING_AUTHORITY_FRDATA08:
ProviderFaceCountRawScoringAuthorityFRData08V1 = Object.freeze({
  schemaVersion: 'fr-data08-v1' as const,
  authorityRef: 'authority.face.provider_face_count_raw_scoring.frdata08' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'raw_scoring_contract_defined_no_reviewed_empirical_validation' as const,
  protocol: Object.freeze({
    groundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1' as const,
    providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1' as const,
    scoringUnit: 'annotation_provider_pair' as const,
    joinKeys: Object.freeze(['captureRef', 'canonicalAssetDigest'] as const),
    requiredPartitions: Object.freeze(['calibration', 'holdout'] as const),
    providerCandidateCountDomain: Object.freeze([0, 1] as const),
    zeroCandidateClass: 'zero_provider_candidates' as const,
    oneCandidateClass: 'one_provider_candidate' as const,
    captureConsensusLabelDerived: false as const,
    annotatorVotesCollapsed: false as const,
    indeterminateLabelIncludedAsOwnRawRow: true as const,
    indeterminateLabelMayBeCoerced: false as const,
    providerCandidateCountInterpretedAsHumanFaceCount: false as const,
    truePositiveFalsePositiveTerminologyAuthorized: false as const,
    sensitivitySpecificityComputationAuthorized: false as const,
    providerDecisionThresholdDefined: false as const,
    interAnnotatorAgreementThresholdDefined: false as const,
    acceptableFalsePositiveRateDefined: false as const,
    acceptableFalseNegativeRateDefined: false as const,
    holdoutMayTuneLabels: false as const,
    holdoutMayTuneDecisionThresholds: false as const,
  }),
  authorityBoundary: Object.freeze({
    rawCrossTabMeansConstructValidityValidated: false as const,
    rawCrossTabMeansGroundTruthAuthorityValidated: false as const,
    captureConsensusLabelDerived: false as const,
    providerCandidateCountMayDefineHumanFaceCount: false as const,
    providerRunIdentityBindingVerified: false as const,
    upstreamProviderReportCanonicalReconstructionPerformed: false as const,
    nearDuplicatePartitionLeakageValidated: false as const,
    classificationMetricsAuthorized: false as const,
    holdoutMayTuneThresholds: false as const,
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
  throw new FaceAuthorityValidationError(`FR-DATA-08 ${message}`);
}

function nonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be non-empty.`);
  return value;
}

function canonicalSha256(value: string, label: string): string {
  if (!SHA256.test(value)) fail(`${label} must use canonical lowercase sha256:<64-hex> form.`);
  return value;
}

function nonNegativeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} must be a non-negative safe integer.`);
  return value;
}

function providerClass(value: number, captureRef: string): ProviderFaceCandidateClassFRData08V1 {
  const count = nonNegativeSafeInteger(value, `${captureRef}.faceCandidateCount`);
  if (count === 0) return 'zero_provider_candidates';
  if (count === 1) return 'one_provider_candidate';
  return fail(`capture ${captureRef} provider candidate count ${count} exceeds the preregistered 0/1 domain from numFaces=1.`);
}

function emptyHumanLabelCounts(): HumanLabelCountsFRData08V1 {
  return {
    zeroHumanFaces: 0,
    oneHumanFace: 0,
    multipleHumanFaces: 0,
    indeterminate: 0,
  };
}

function incrementHumanLabelCount(
  counts: HumanLabelCountsFRData08V1,
  label: IndependentHumanFaceCountLabelFRData07V1,
): HumanLabelCountsFRData08V1 {
  return {
    zeroHumanFaces: counts.zeroHumanFaces + (label === 'zero_human_faces' ? 1 : 0),
    oneHumanFace: counts.oneHumanFace + (label === 'one_human_face' ? 1 : 0),
    multipleHumanFaces: counts.multipleHumanFaces + (label === 'multiple_human_faces' ? 1 : 0),
    indeterminate: counts.indeterminate + (label === 'indeterminate' ? 1 : 0),
  };
}

function validateAuthority(): ProviderFaceCountRawScoringAuthorityFRData08V1 {
  const authority = PROVIDER_FACE_COUNT_RAW_SCORING_AUTHORITY_FRDATA08;
  const protocol = authority.protocol;
  if (
    authority.schemaVersion !== 'fr-data08-v1' ||
    authority.authorityRef !== 'authority.face.provider_face_count_raw_scoring.frdata08' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'raw_scoring_contract_defined_no_reviewed_empirical_validation' ||
    protocol.groundTruthSchemaRef !== 'fr-data07-independent-face-ground-truth-v1' ||
    protocol.providerObservationSchemaRef !== 'fr-data06-provider-face-candidate-observation-v1' ||
    protocol.scoringUnit !== 'annotation_provider_pair' ||
    protocol.joinKeys.length !== 2 || protocol.joinKeys[0] !== 'captureRef' || protocol.joinKeys[1] !== 'canonicalAssetDigest' ||
    protocol.providerCandidateCountDomain.length !== 2 || protocol.providerCandidateCountDomain[0] !== 0 || protocol.providerCandidateCountDomain[1] !== 1 ||
    protocol.captureConsensusLabelDerived !== false || protocol.annotatorVotesCollapsed !== false ||
    protocol.indeterminateLabelIncludedAsOwnRawRow !== true || protocol.indeterminateLabelMayBeCoerced !== false ||
    protocol.providerCandidateCountInterpretedAsHumanFaceCount !== false ||
    protocol.truePositiveFalsePositiveTerminologyAuthorized !== false ||
    protocol.sensitivitySpecificityComputationAuthorized !== false ||
    protocol.providerDecisionThresholdDefined !== false || protocol.interAnnotatorAgreementThresholdDefined !== false ||
    protocol.acceptableFalsePositiveRateDefined !== false || protocol.acceptableFalseNegativeRateDefined !== false ||
    protocol.holdoutMayTuneLabels !== false || protocol.holdoutMayTuneDecisionThresholds !== false
  ) fail('authority/protocol drift.');
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) fail('authority boundary must remain fully fail-closed.');
  return authority;
}

function validateProviderReportForRawJoin(
  report: MentonDatasetProviderFaceCandidateObservationReportFRData06V1,
): MentonDatasetProviderFaceCandidateObservationReportFRData06V1 {
  if (report.schemaVersion !== 'fr-data06-provider-face-candidate-observation-v1') fail('provider report schema drift.');
  nonEmpty(report.datasetRef, 'providerReport.datasetRef');
  if (!Array.isArray(report.captureObservations) || report.captureCount !== report.captureObservations.length) {
    fail('provider report capture count must match capture observations.');
  }
  if (new Set(report.captureObservations.map((entry) => entry.captureRef)).size !== report.captureObservations.length) {
    fail('provider report capture refs must be unique.');
  }
  if (
    report.providerProvenance.runningMode !== 'IMAGE' || report.providerProvenance.numFaces !== 1 ||
    report.providerProvenance.runtimePackageName !== '@mediapipe/tasks-vision' || report.providerProvenance.runtimePackageVersion !== '0.10.35' ||
    report.providerProvenance.rawProviderResponsePersisted !== false || report.providerProvenance.rawProviderCoordinatesPersisted !== false ||
    report.rasterIdentityReconfirmedBeforeProviderRun !== true || report.mediaPipeRuntimeExecuted !== true ||
    report.providerFaceCandidateCountObserved !== true || report.providerLandmarkPayloadSummaryObserved !== true
  ) fail('provider report runtime/evidence boundary drift.');
  if (
    report.providerDetectionConstructValidityValidated !== false ||
    report.providerFaceCandidateHumanIdentityValidated !== false ||
    report.singleHumanFaceVerified !== false || report.facePresenceVerified !== false ||
    report.captureQualityAuthorityValidated !== false || report.empiricalScoringPerformed !== false ||
    report.calibrationThresholdsDefined !== false || report.fr35PointToContourRelationValidated !== false ||
    report.traditionalDigeEquivalenceValidated !== false || report.fr36VerticalReferencePromoted !== false ||
    report.productionThreeDivisionsMetricAllowed !== false || report.productionF1Allowed !== false ||
    report.productionF6Allowed !== false || report.researchCandidateAdmitted !== false ||
    report.productionGeometryAuthorized !== false
  ) fail('provider report contains unauthorized authority promotion.');

  for (const entry of report.captureObservations) {
    nonEmpty(entry.captureRef, 'provider captureRef');
    nonEmpty(entry.relativeAssetPath, `${entry.captureRef}.relativeAssetPath`);
    canonicalSha256(entry.actualDigest, `${entry.captureRef}.actualDigest`);
    canonicalSha256(entry.rasterSha256, `${entry.captureRef}.rasterSha256`);
    const classification = providerClass(entry.faceCandidateCount, entry.captureRef);
    if ((classification === 'zero_provider_candidates' && entry.candidateSummaries.length !== 0) ||
        (classification === 'one_provider_candidate' && entry.candidateSummaries.length !== 1)) {
      fail(`capture ${entry.captureRef} candidate summary count must match provider candidate count.`);
    }
    if (entry.faceBlendshapeCount !== 0 || entry.facialTransformationMatrixCount !== 0) {
      fail(`capture ${entry.captureRef} disabled provider outputs must remain empty.`);
    }
  }
  return report;
}

function buildPartitionSummary(
  partition: FacePresenceDatasetPartitionFRData07V1,
  captures: readonly CaptureRawJoinFRData08V1[],
  pairs: readonly AnnotationProviderRawPairFRData08V1[],
): PartitionRawScoringSummaryFRData08V1 {
  const partitionCaptures = captures.filter((capture) => capture.partition === partition);
  const partitionPairs = pairs.filter((pair) => pair.partition === partition);
  const rows = LABELS.map((label) => {
    const labelPairs = partitionPairs.filter((pair) => pair.humanLabel === label);
    const zeroProviderCandidates = labelPairs.filter((pair) => pair.providerClass === 'zero_provider_candidates').length;
    const oneProviderCandidate = labelPairs.filter((pair) => pair.providerClass === 'one_provider_candidate').length;
    return Object.freeze({
      humanLabel: label,
      zeroProviderCandidates,
      oneProviderCandidate,
      totalAnnotations: labelPairs.length,
    });
  });
  return Object.freeze({
    partition,
    captureCount: partitionCaptures.length,
    annotationPairCount: partitionPairs.length,
    capturesWithAnnotatorDisagreement: partitionCaptures.filter((capture) => capture.annotatorDisagreementObserved).length,
    crossTab: Object.freeze(rows),
  });
}

export function buildProviderFaceCountRawScoringReportFRData08(
  groundTruthDataset: IndependentFaceGroundTruthDatasetFRData07V1,
  providerReport: MentonDatasetProviderFaceCandidateObservationReportFRData06V1,
): ProviderFaceCountRawScoringReportFRData08V1 {
  validateAuthority();
  validateIndependentFaceGroundTruthDatasetFRData07(groundTruthDataset);
  validateProviderReportForRawJoin(providerReport);

  if (!groundTruthDataset.annotationLedgerFrozen || groundTruthDataset.annotationLedgerDigest === null ||
      groundTruthDataset.annotationLedgerFrozenAt === null || groundTruthDataset.providerRunsExecutedAfterFreeze !== true) {
    fail('raw scoring requires a frozen FR-DATA-07 annotation ledger and provider runs recorded after freeze.');
  }
  if (groundTruthDataset.datasetRef !== providerReport.datasetRef) fail('ground-truth and provider datasetRef must match exactly.');
  if (groundTruthDataset.captures.length === 0) fail('raw scoring requires at least one capture.');
  if (!groundTruthDataset.captures.some((capture) => capture.partition === 'calibration') ||
      !groundTruthDataset.captures.some((capture) => capture.partition === 'holdout')) {
    fail('raw scoring requires both calibration and holdout partitions.');
  }

  const providerByRef = new Map(providerReport.captureObservations.map((entry) => [entry.captureRef, entry] as const));
  const groundTruthRefs = new Set(groundTruthDataset.captures.map((capture) => capture.captureRef));
  if (providerByRef.size !== groundTruthRefs.size || [...providerByRef.keys()].some((captureRef) => !groundTruthRefs.has(captureRef))) {
    fail('provider observation capture-ref set must exactly match FR-DATA-07 capture-ref set.');
  }

  const captureJoins = groundTruthDataset.captures.map((capture) => {
    const provider = providerByRef.get(capture.captureRef);
    if (provider === undefined) fail(`missing provider observation for ${capture.captureRef}.`);
    if (canonicalSha256(provider.actualDigest, `${capture.captureRef}.provider.actualDigest`) !==
        canonicalSha256(capture.canonicalAssetDigest, `${capture.captureRef}.canonicalAssetDigest`)) {
      fail(`capture ${capture.captureRef} exact asset digest does not match between FR-DATA-07 and FR-DATA-06.`);
    }
    const annotations = groundTruthDataset.annotations.filter((annotation) => annotation.captureRef === capture.captureRef);
    if (annotations.length === 0) fail(`capture ${capture.captureRef} has no independent annotation to join.`);
    let humanLabelCounts = emptyHumanLabelCounts();
    for (const annotation of annotations) humanLabelCounts = incrementHumanLabelCount(humanLabelCounts, annotation.label);
    const distinctLabels = new Set(annotations.map((annotation) => annotation.label));
    const providerClassification = providerClass(provider.faceCandidateCount, capture.captureRef);
    return Object.freeze({
      captureRef: capture.captureRef,
      partition: capture.partition,
      canonicalAssetDigest: capture.canonicalAssetDigest,
      providerFaceCandidateCount: provider.faceCandidateCount as 0 | 1,
      providerClass: providerClassification,
      annotationCount: annotations.length,
      humanLabelCounts: Object.freeze(humanLabelCounts),
      annotatorDisagreementObserved: distinctLabels.size > 1,
    });
  });

  const captureJoinByRef = new Map(captureJoins.map((entry) => [entry.captureRef, entry] as const));
  const annotationProviderPairs = groundTruthDataset.annotations.map((annotation) => {
    const capture = captureJoinByRef.get(annotation.captureRef);
    if (capture === undefined) fail(`annotation references capture without raw join ${annotation.captureRef}.`);
    return Object.freeze({
      captureRef: annotation.captureRef,
      partition: capture.partition,
      canonicalAssetDigest: capture.canonicalAssetDigest,
      annotatorRef: annotation.annotatorRef,
      annotationSessionRef: annotation.annotationSessionRef,
      humanLabel: annotation.label,
      providerFaceCandidateCount: capture.providerFaceCandidateCount,
      providerClass: capture.providerClass,
    });
  });

  const calibration = buildPartitionSummary('calibration', captureJoins, annotationProviderPairs);
  const holdout = buildPartitionSummary('holdout', captureJoins, annotationProviderPairs);

  return Object.freeze({
    schemaVersion: 'fr-data08-provider-face-count-raw-scoring-v1' as const,
    datasetRef: groundTruthDataset.datasetRef,
    groundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1' as const,
    providerObservationSchemaRef: 'fr-data06-provider-face-candidate-observation-v1' as const,
    annotationLedgerDigest: groundTruthDataset.annotationLedgerDigest,
    captureCount: captureJoins.length,
    annotationPairCount: annotationProviderPairs.length,
    captureJoins: Object.freeze(captureJoins),
    annotationProviderPairs: Object.freeze(annotationProviderPairs),
    partitionSummaries: Object.freeze([calibration, holdout] as const),
    exactCaptureRefSetMatched: true as const,
    exactAssetDigestJoinVerified: true as const,
    frozenAnnotationLedgerRequired: true as const,
    annotationLedgerFrozenBeforeProviderScoringVerified: true as const,
    providerObservationCoverageVerified: true as const,
    rawAnnotationProviderJoinPerformed: true as const,
    rawPartitionCrossTabComputed: true as const,
    upstreamProviderReportCanonicalReconstructionPerformed: false as const,
    providerRunIdentityBindingVerified: false as const,
    captureConsensusLabelDerived: false as const,
    interAnnotatorGroundTruthAuthorityValidated: false as const,
    providerDetectionConstructValidityValidated: false as const,
    providerFaceCandidateHumanIdentityValidated: false as const,
    singleHumanFaceVerified: false as const,
    facePresenceVerified: false as const,
    classificationMetricsComputed: false as const,
    sensitivityComputed: false as const,
    specificityComputed: false as const,
    falsePositiveRateComputed: false as const,
    falseNegativeRateComputed: false as const,
    calibrationThresholdsDefined: false as const,
    providerCandidateDecisionThresholdDefined: false as const,
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

export function assertProviderFaceCountRawScoringReadyForPromotionFRData08(): never {
  validateAuthority();
  return fail(
    'raw annotation-provider joins and partition cross-tabs are descriptive evidence only; without reviewed inter-annotator ground-truth authority, provider-run identity binding, near-duplicate leakage review, preregistered acceptance criteria, and real empirical validation they cannot promote face presence, single-human-face validity, capture quality, anatomy, traditional semantics, or production geometry.',
  );
}
