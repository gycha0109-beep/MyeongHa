import { createHash } from 'node:crypto';
import type {
  IndependentFaceCountAnnotationFRData07V1,
  IndependentFaceGroundTruthDatasetFRData07V1,
  IndependentHumanFaceCountLabelFRData07V1,
} from './independent-face-ground-truth-frdata07.js';
import { validateIndependentFaceGroundTruthDatasetFRData07 } from './independent-face-ground-truth-frdata07.js';
import { FaceAuthorityValidationError } from './validation.js';

export type IndependentFaceAdjudicationOutcomeFRData10V1 =
  | IndependentHumanFaceCountLabelFRData07V1
  | 'unresolved';

export interface IndependentFaceAdjudicationProtocolFRData10V1 {
  readonly groundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1';
  readonly outcomeVocabulary: readonly [
    'zero_human_faces',
    'one_human_face',
    'multiple_human_faces',
    'indeterminate',
    'unresolved',
  ];
  readonly exactlyOneAdjudicationRecordPerCaptureRequired: true;
  readonly allIndependentAnnotationsForCaptureMustBeReviewed: true;
  readonly independentAnnotationsVisibleDuringAdjudication: true;
  readonly adjudicatorDistinctFromOriginalAnnotatorsRequired: true;
  readonly providerBlindAdjudicationRequired: true;
  readonly providerOutputVisibleDuringAdjudication: false;
  readonly providerCandidateCountVisibleDuringAdjudication: false;
  readonly providerLandmarksVisibleDuringAdjudication: false;
  readonly providerResultShapeVisibleDuringAdjudication: false;
  readonly providerRunIdentityVisibleDuringAdjudication: false;
  readonly rawProviderScoringVisibleDuringAdjudication: false;
  readonly providerRunBindingVisibleDuringAdjudication: false;
  readonly datasetPartitionVisibleDuringAdjudication: false;
  readonly providerOutputMayDefineAdjudicationOutcome: false;
  readonly holdoutProviderBehaviorMayInfluenceAdjudication: false;
  readonly originalIndependentAnnotationsMayBeModified: false;
  readonly automaticMajorityRuleAllowed: false;
  readonly automaticUnanimityRuleAllowed: false;
  readonly annotationCountRuleAllowed: false;
  readonly unresolvedOutcomeMustBePreserved: true;
  readonly unresolvedOutcomeMayBeSilentlyCoerced: false;
  readonly indeterminateOutcomeMayBeSilentlyCoerced: false;
  readonly adjudicationAfterGroundTruthLedgerFreezeRequired: true;
  readonly adjudicationLedgerFreezeBeforeAdjudicatedProviderScoringRequired: true;
  readonly minimumIndependentAnnotatorsPerCapture: null;
  readonly minimumAdjudicatorsPerCapture: null;
  readonly interAnnotatorAgreementThreshold: null;
  readonly adjudicationDecisionThreshold: null;
}

export interface IndependentFaceCountAdjudicationFRData10V1 {
  readonly captureRef: string;
  readonly adjudicatorRef: string;
  readonly adjudicationSessionRef: string;
  readonly observedAssetDigest: string;
  readonly reviewedAnnotationRefs: readonly string[];
  readonly outcome: IndependentFaceAdjudicationOutcomeFRData10V1;
  readonly adjudicatedAt: string;
  readonly independentAnnotationsVisibleDuringAdjudication: true;
  readonly providerOutputVisibleDuringAdjudication: false;
  readonly providerCandidateCountVisibleDuringAdjudication: false;
  readonly providerLandmarksVisibleDuringAdjudication: false;
  readonly providerResultShapeVisibleDuringAdjudication: false;
  readonly providerRunIdentityVisibleDuringAdjudication: false;
  readonly rawProviderScoringVisibleDuringAdjudication: false;
  readonly providerRunBindingVisibleDuringAdjudication: false;
  readonly datasetPartitionVisibleDuringAdjudication: false;
  readonly providerOutputUsedToChooseOutcome: false;
  readonly holdoutProviderBehaviorUsedToChooseOutcome: false;
  readonly originalIndependentAnnotationsModified: false;
  readonly automaticMajorityRuleApplied: false;
  readonly automaticUnanimityRuleApplied: false;
  readonly annotationCountRuleApplied: false;
  readonly adjudicatorWasOriginalAnnotator: false;
  readonly outcomeChosenByHumanAdjudicator: true;
  readonly subjectIdentityInferred: false;
}

export interface IndependentFaceAdjudicationDatasetFRData10V1 {
  readonly schemaVersion: 'fr-data10-independent-face-count-adjudication-v1';
  readonly datasetRef: string;
  readonly upstreamGroundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1';
  readonly upstreamAnnotationLedgerDigest: string;
  readonly adjudications: readonly IndependentFaceCountAdjudicationFRData10V1[];
  readonly adjudicationLedgerFrozen: boolean;
  readonly adjudicationLedgerDigest: string | null;
  readonly adjudicationLedgerFrozenAt: string | null;
}

export interface IndependentFaceAdjudicationCaptureSummaryFRData10V1 {
  readonly captureRef: string;
  readonly partition: 'calibration' | 'holdout';
  readonly canonicalAssetDigest: string;
  readonly independentAnnotationCount: number;
  readonly independentAnnotationLabels: readonly IndependentHumanFaceCountLabelFRData07V1[];
  readonly annotatorDisagreementObserved: boolean;
  readonly adjudicatorRef: string;
  readonly adjudicationOutcome: IndependentFaceAdjudicationOutcomeFRData10V1;
  readonly unresolved: boolean;
  readonly exactIndependentAnnotationReviewSetMatched: true;
  readonly providerBlindAdjudicationRecorded: true;
  readonly independentAdjudicatorSeparationRecorded: true;
}

export interface IndependentFaceAdjudicationReportFRData10V1 {
  readonly schemaVersion: 'fr-data10-independent-face-count-adjudication-report-v1';
  readonly datasetRef: string;
  readonly upstreamGroundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1';
  readonly upstreamAnnotationLedgerDigest: string;
  readonly adjudicationLedgerDigest: string;
  readonly captureCount: number;
  readonly resolvedCaptureCount: number;
  readonly unresolvedCaptureCount: number;
  readonly outcomeCounts: Readonly<Record<IndependentFaceAdjudicationOutcomeFRData10V1, number>>;
  readonly captureSummaries: readonly IndependentFaceAdjudicationCaptureSummaryFRData10V1[];
  readonly upstreamAnnotationLedgerBindingVerified: true;
  readonly adjudicationAfterGroundTruthLedgerFreezeVerified: true;
  readonly exactCaptureAdjudicationCoverageVerified: true;
  readonly exactIndependentAnnotationReviewSetCoverageVerified: true;
  readonly providerBlindAdjudicationRecordedForEveryCapture: true;
  readonly independentAdjudicatorSeparationRecordedForEveryCapture: true;
  readonly originalIndependentAnnotationsPreserved: true;
  readonly automaticMajorityRuleAbsent: true;
  readonly automaticUnanimityRuleAbsent: true;
  readonly annotationCountRuleAbsent: true;
  readonly unresolvedOutcomePreserved: true;
  readonly adjudicationLedgerFrozenVerified: true;
  readonly adjudicationLedgerContentDigestVerified: true;
  readonly adjudicatedProviderScoringPerformed: false;
  readonly captureConsensusGroundTruthAuthorityValidated: false;
  readonly interAnnotatorGroundTruthAuthorityValidated: false;
  readonly providerDetectionConstructValidityValidated: false;
  readonly providerFaceCandidateHumanIdentityValidated: false;
  readonly singleHumanFaceVerified: false;
  readonly facePresenceVerified: false;
  readonly classificationMetricsComputed: false;
  readonly calibrationThresholdsDefined: false;
  readonly providerDecisionThresholdDefined: false;
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

export interface IndependentFaceAdjudicationAuthorityFRData10V1 {
  readonly schemaVersion: 'fr-data10-v1';
  readonly authorityRef: 'authority.face.independent_face_count_adjudication.frdata10';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'adjudication_contract_defined_no_reviewed_empirical_validation';
  readonly protocol: IndependentFaceAdjudicationProtocolFRData10V1;
  readonly authorityBoundary: {
    readonly adjudicationRecordMeansGroundTruthAuthorityValidated: false;
    readonly frozenAdjudicationLedgerMeansGroundTruthAuthorityValidated: false;
    readonly resolvedOutcomeMeansProviderConstructValidityValidated: false;
    readonly unanimousIndependentAnnotationsMayBypassHumanAdjudication: false;
    readonly majorityIndependentAnnotationsMayDefineGroundTruth: false;
    readonly unresolvedMayBeDroppedFromEvaluationEvidence: false;
    readonly providerOutputMayResolveHumanAnnotationDisagreement: false;
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
const OUTCOMES = Object.freeze([
  'zero_human_faces',
  'one_human_face',
  'multiple_human_faces',
  'indeterminate',
  'unresolved',
] as const);

export const INDEPENDENT_FACE_ADJUDICATION_AUTHORITY_FRDATA10:
IndependentFaceAdjudicationAuthorityFRData10V1 = Object.freeze({
  schemaVersion: 'fr-data10-v1' as const,
  authorityRef: 'authority.face.independent_face_count_adjudication.frdata10' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'adjudication_contract_defined_no_reviewed_empirical_validation' as const,
  protocol: Object.freeze({
    groundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1' as const,
    outcomeVocabulary: OUTCOMES,
    exactlyOneAdjudicationRecordPerCaptureRequired: true as const,
    allIndependentAnnotationsForCaptureMustBeReviewed: true as const,
    independentAnnotationsVisibleDuringAdjudication: true as const,
    adjudicatorDistinctFromOriginalAnnotatorsRequired: true as const,
    providerBlindAdjudicationRequired: true as const,
    providerOutputVisibleDuringAdjudication: false as const,
    providerCandidateCountVisibleDuringAdjudication: false as const,
    providerLandmarksVisibleDuringAdjudication: false as const,
    providerResultShapeVisibleDuringAdjudication: false as const,
    providerRunIdentityVisibleDuringAdjudication: false as const,
    rawProviderScoringVisibleDuringAdjudication: false as const,
    providerRunBindingVisibleDuringAdjudication: false as const,
    datasetPartitionVisibleDuringAdjudication: false as const,
    providerOutputMayDefineAdjudicationOutcome: false as const,
    holdoutProviderBehaviorMayInfluenceAdjudication: false as const,
    originalIndependentAnnotationsMayBeModified: false as const,
    automaticMajorityRuleAllowed: false as const,
    automaticUnanimityRuleAllowed: false as const,
    annotationCountRuleAllowed: false as const,
    unresolvedOutcomeMustBePreserved: true as const,
    unresolvedOutcomeMayBeSilentlyCoerced: false as const,
    indeterminateOutcomeMayBeSilentlyCoerced: false as const,
    adjudicationAfterGroundTruthLedgerFreezeRequired: true as const,
    adjudicationLedgerFreezeBeforeAdjudicatedProviderScoringRequired: true as const,
    minimumIndependentAnnotatorsPerCapture: null,
    minimumAdjudicatorsPerCapture: null,
    interAnnotatorAgreementThreshold: null,
    adjudicationDecisionThreshold: null,
  }),
  authorityBoundary: Object.freeze({
    adjudicationRecordMeansGroundTruthAuthorityValidated: false as const,
    frozenAdjudicationLedgerMeansGroundTruthAuthorityValidated: false as const,
    resolvedOutcomeMeansProviderConstructValidityValidated: false as const,
    unanimousIndependentAnnotationsMayBypassHumanAdjudication: false as const,
    majorityIndependentAnnotationsMayDefineGroundTruth: false as const,
    unresolvedMayBeDroppedFromEvaluationEvidence: false as const,
    providerOutputMayResolveHumanAnnotationDisagreement: false as const,
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
  throw new FaceAuthorityValidationError(`FR-DATA-10 ${message}`);
}

function nonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${label} must be non-empty.`);
  return value;
}

function canonicalSha256(value: string, label: string): string {
  if (!SHA256.test(value)) fail(`${label} must use canonical lowercase sha256:<64-hex> form.`);
  return value;
}

function parseTimestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(`${label} must be a parseable timestamp.`);
  return parsed;
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} must be unique.`);
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

function validateOutcome(value: string, label: string): asserts value is IndependentFaceAdjudicationOutcomeFRData10V1 {
  if (!(OUTCOMES as readonly string[]).includes(value)) fail(`${label} is unsupported.`);
}

function sameStringSet(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  const left = [...actual].sort(lexicalCompare);
  const right = [...expected].sort(lexicalCompare);
  return left.every((value, index) => value === right[index]);
}

export function deriveIndependentAnnotationRefFRData10(
  annotation: IndependentFaceCountAnnotationFRData07V1,
): string {
  return `frdata07-annotation:capture:${encodeURIComponent(annotation.captureRef)}:annotator:${encodeURIComponent(annotation.annotatorRef)}:session:${encodeURIComponent(annotation.annotationSessionRef)}`;
}

export function validateIndependentFaceAdjudicationAuthorityFRData10(
  authority: IndependentFaceAdjudicationAuthorityFRData10V1 = INDEPENDENT_FACE_ADJUDICATION_AUTHORITY_FRDATA10,
): IndependentFaceAdjudicationAuthorityFRData10V1 {
  if (
    authority.schemaVersion !== 'fr-data10-v1' ||
    authority.authorityRef !== 'authority.face.independent_face_count_adjudication.frdata10' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'adjudication_contract_defined_no_reviewed_empirical_validation'
  ) fail('authority identity/state drift.');

  const protocol = authority.protocol;
  if (
    protocol.groundTruthSchemaRef !== 'fr-data07-independent-face-ground-truth-v1' ||
    protocol.outcomeVocabulary.length !== OUTCOMES.length ||
    protocol.outcomeVocabulary.some((value, index) => value !== OUTCOMES[index]) ||
    protocol.exactlyOneAdjudicationRecordPerCaptureRequired !== true ||
    protocol.allIndependentAnnotationsForCaptureMustBeReviewed !== true ||
    protocol.independentAnnotationsVisibleDuringAdjudication !== true ||
    protocol.adjudicatorDistinctFromOriginalAnnotatorsRequired !== true ||
    protocol.providerBlindAdjudicationRequired !== true ||
    protocol.providerOutputVisibleDuringAdjudication !== false ||
    protocol.providerCandidateCountVisibleDuringAdjudication !== false ||
    protocol.providerLandmarksVisibleDuringAdjudication !== false ||
    protocol.providerResultShapeVisibleDuringAdjudication !== false ||
    protocol.providerRunIdentityVisibleDuringAdjudication !== false ||
    protocol.rawProviderScoringVisibleDuringAdjudication !== false ||
    protocol.providerRunBindingVisibleDuringAdjudication !== false ||
    protocol.datasetPartitionVisibleDuringAdjudication !== false ||
    protocol.providerOutputMayDefineAdjudicationOutcome !== false ||
    protocol.holdoutProviderBehaviorMayInfluenceAdjudication !== false ||
    protocol.originalIndependentAnnotationsMayBeModified !== false ||
    protocol.automaticMajorityRuleAllowed !== false ||
    protocol.automaticUnanimityRuleAllowed !== false ||
    protocol.annotationCountRuleAllowed !== false ||
    protocol.unresolvedOutcomeMustBePreserved !== true ||
    protocol.unresolvedOutcomeMayBeSilentlyCoerced !== false ||
    protocol.indeterminateOutcomeMayBeSilentlyCoerced !== false ||
    protocol.adjudicationAfterGroundTruthLedgerFreezeRequired !== true ||
    protocol.adjudicationLedgerFreezeBeforeAdjudicatedProviderScoringRequired !== true
  ) fail('protocol authority boundary drift.');

  if (
    protocol.minimumIndependentAnnotatorsPerCapture !== null ||
    protocol.minimumAdjudicatorsPerCapture !== null ||
    protocol.interAnnotatorAgreementThreshold !== null ||
    protocol.adjudicationDecisionThreshold !== null
  ) fail('empirical annotator minima, agreement thresholds, and adjudication thresholds must remain unset.');

  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    fail('authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function computeIndependentFaceAdjudicationLedgerDigestFRData10(
  dataset: IndependentFaceAdjudicationDatasetFRData10V1,
): string {
  validateIndependentFaceAdjudicationAuthorityFRData10();
  const projection = {
    schemaVersion: dataset.schemaVersion,
    datasetRef: dataset.datasetRef,
    upstreamGroundTruthSchemaRef: dataset.upstreamGroundTruthSchemaRef,
    upstreamAnnotationLedgerDigest: dataset.upstreamAnnotationLedgerDigest,
    adjudications: dataset.adjudications,
    adjudicationLedgerFrozen: dataset.adjudicationLedgerFrozen,
    adjudicationLedgerFrozenAt: dataset.adjudicationLedgerFrozenAt,
  };
  const serialized = canonicalJson(projection, 'adjudicationLedger');
  return `sha256:${createHash('sha256').update(serialized, 'utf8').digest('hex')}`;
}

export function validateIndependentFaceAdjudicationDatasetFRData10(
  groundTruthDataset: IndependentFaceGroundTruthDatasetFRData07V1,
  dataset: IndependentFaceAdjudicationDatasetFRData10V1,
): IndependentFaceAdjudicationDatasetFRData10V1 {
  validateIndependentFaceAdjudicationAuthorityFRData10();
  validateIndependentFaceGroundTruthDatasetFRData07(groundTruthDataset);

  if (dataset.schemaVersion !== 'fr-data10-independent-face-count-adjudication-v1') fail('dataset schema drift.');
  if (dataset.upstreamGroundTruthSchemaRef !== 'fr-data07-independent-face-ground-truth-v1') fail('upstream ground-truth schema drift.');
  if (dataset.datasetRef !== groundTruthDataset.datasetRef) fail('datasetRef must exactly match FR-DATA-07.');
  if (
    !groundTruthDataset.annotationLedgerFrozen ||
    groundTruthDataset.annotationLedgerDigest === null ||
    groundTruthDataset.annotationLedgerFrozenAt === null
  ) {
    fail('FR-DATA-07 annotation ledger must be frozen with digest and timestamp before adjudication can bind to it.');
  }
  canonicalSha256(groundTruthDataset.annotationLedgerDigest, 'groundTruth.annotationLedgerDigest');
  const groundTruthLedgerFrozenAt = parseTimestamp(groundTruthDataset.annotationLedgerFrozenAt, 'groundTruth.annotationLedgerFrozenAt');
  if (dataset.upstreamAnnotationLedgerDigest !== groundTruthDataset.annotationLedgerDigest) {
    fail('upstream annotation ledger digest must exactly match FR-DATA-07.');
  }
  canonicalSha256(dataset.upstreamAnnotationLedgerDigest, 'upstreamAnnotationLedgerDigest');
  if (!Array.isArray(dataset.adjudications)) fail('adjudications must be an array.');
  if (groundTruthDataset.captures.length === 0) fail('at least one FR-DATA-07 capture is required for adjudication.');

  unique(dataset.adjudications.map((entry) => entry.captureRef), 'adjudication capture refs');
  unique(dataset.adjudications.map((entry) => entry.adjudicationSessionRef), 'adjudication session refs');

  const expectedCaptureRefs = groundTruthDataset.captures.map((capture) => capture.captureRef);
  const actualCaptureRefs = dataset.adjudications.map((entry) => entry.captureRef);
  if (!sameStringSet(actualCaptureRefs, expectedCaptureRefs)) {
    fail('exactly one adjudication record is required for every FR-DATA-07 capture.');
  }

  const captureByRef = new Map(groundTruthDataset.captures.map((capture) => [capture.captureRef, capture] as const));
  const annotationsByCapture = new Map<string, IndependentFaceCountAnnotationFRData07V1[]>();
  for (const annotation of groundTruthDataset.annotations) {
    const existing = annotationsByCapture.get(annotation.captureRef) ?? [];
    existing.push(annotation);
    annotationsByCapture.set(annotation.captureRef, existing);
  }

  for (const entry of dataset.adjudications) {
    nonEmpty(entry.captureRef, 'adjudication.captureRef');
    nonEmpty(entry.adjudicatorRef, `${entry.captureRef}.adjudicatorRef`);
    nonEmpty(entry.adjudicationSessionRef, `${entry.captureRef}.adjudicationSessionRef`);
    const capture = captureByRef.get(entry.captureRef);
    if (capture === undefined) fail(`adjudication references unknown capture ${entry.captureRef}.`);
    if (canonicalSha256(entry.observedAssetDigest, `${entry.captureRef}.observedAssetDigest`) !== capture.canonicalAssetDigest) {
      fail(`adjudication asset digest drift for ${entry.captureRef}.`);
    }
    validateOutcome(entry.outcome, `${entry.captureRef}.outcome`);
    const adjudicatedAt = parseTimestamp(entry.adjudicatedAt, `${entry.captureRef}.adjudicatedAt`);
    if (adjudicatedAt < groundTruthLedgerFrozenAt) {
      fail(`capture ${entry.captureRef} adjudication cannot precede the frozen FR-DATA-07 annotation ledger.`);
    }

    const sourceAnnotations = annotationsByCapture.get(entry.captureRef) ?? [];
    if (sourceAnnotations.length === 0) fail(`capture ${entry.captureRef} has no independent annotations to adjudicate.`);
    const expectedAnnotationRefs = sourceAnnotations.map(deriveIndependentAnnotationRefFRData10);
    unique(entry.reviewedAnnotationRefs, `${entry.captureRef}.reviewedAnnotationRefs`);
    if (!sameStringSet(entry.reviewedAnnotationRefs, expectedAnnotationRefs)) {
      fail(`capture ${entry.captureRef} must record review of the exact complete independent annotation set.`);
    }
    const originalAnnotators = new Set(sourceAnnotations.map((annotation) => annotation.annotatorRef));
    if (originalAnnotators.has(entry.adjudicatorRef) || entry.adjudicatorWasOriginalAnnotator !== false) {
      fail(`capture ${entry.captureRef} adjudicator must be distinct from every original annotator.`);
    }

    if (
      entry.independentAnnotationsVisibleDuringAdjudication !== true ||
      entry.providerOutputVisibleDuringAdjudication !== false ||
      entry.providerCandidateCountVisibleDuringAdjudication !== false ||
      entry.providerLandmarksVisibleDuringAdjudication !== false ||
      entry.providerResultShapeVisibleDuringAdjudication !== false ||
      entry.providerRunIdentityVisibleDuringAdjudication !== false ||
      entry.rawProviderScoringVisibleDuringAdjudication !== false ||
      entry.providerRunBindingVisibleDuringAdjudication !== false ||
      entry.datasetPartitionVisibleDuringAdjudication !== false ||
      entry.providerOutputUsedToChooseOutcome !== false ||
      entry.holdoutProviderBehaviorUsedToChooseOutcome !== false ||
      entry.originalIndependentAnnotationsModified !== false ||
      entry.automaticMajorityRuleApplied !== false ||
      entry.automaticUnanimityRuleApplied !== false ||
      entry.annotationCountRuleApplied !== false ||
      entry.outcomeChosenByHumanAdjudicator !== true ||
      entry.subjectIdentityInferred !== false
    ) fail(`adjudication ${entry.captureRef}/${entry.adjudicatorRef} violates provider-blind human adjudication requirements.`);
  }

  if (dataset.adjudicationLedgerFrozen) {
    if (dataset.adjudicationLedgerDigest === null || dataset.adjudicationLedgerFrozenAt === null) {
      fail('frozen adjudication ledger requires digest and frozen timestamp.');
    }
    canonicalSha256(dataset.adjudicationLedgerDigest, 'adjudicationLedgerDigest');
    const frozenAt = parseTimestamp(dataset.adjudicationLedgerFrozenAt, 'adjudicationLedgerFrozenAt');
    if (dataset.adjudications.some((entry) => parseTimestamp(entry.adjudicatedAt, `${entry.captureRef}.adjudicatedAt`) > frozenAt)) {
      fail('adjudication ledger cannot freeze before one of its included adjudications was recorded.');
    }
    const expectedDigest = computeIndependentFaceAdjudicationLedgerDigestFRData10(dataset);
    if (dataset.adjudicationLedgerDigest !== expectedDigest) {
      fail('adjudication ledger digest does not match the canonical FR-DATA-10 ledger content.');
    }
  } else if (dataset.adjudicationLedgerDigest !== null || dataset.adjudicationLedgerFrozenAt !== null) {
    fail('unfrozen adjudication ledger cannot carry a freeze digest or timestamp.');
  }

  return dataset;
}

export function buildIndependentFaceAdjudicationReportFRData10(
  groundTruthDataset: IndependentFaceGroundTruthDatasetFRData07V1,
  adjudicationDataset: IndependentFaceAdjudicationDatasetFRData10V1,
): IndependentFaceAdjudicationReportFRData10V1 {
  validateIndependentFaceAdjudicationDatasetFRData10(groundTruthDataset, adjudicationDataset);
  if (!adjudicationDataset.adjudicationLedgerFrozen || adjudicationDataset.adjudicationLedgerDigest === null) {
    fail('adjudication ledger must be frozen before an FR-DATA-10 report can be emitted.');
  }

  const annotationsByCapture = new Map<string, IndependentFaceCountAnnotationFRData07V1[]>();
  for (const annotation of groundTruthDataset.annotations) {
    const existing = annotationsByCapture.get(annotation.captureRef) ?? [];
    existing.push(annotation);
    annotationsByCapture.set(annotation.captureRef, existing);
  }
  const adjudicationByCapture = new Map(adjudicationDataset.adjudications.map((entry) => [entry.captureRef, entry] as const));

  const captureSummaries = groundTruthDataset.captures.map((capture) => {
    const sourceAnnotations = annotationsByCapture.get(capture.captureRef) ?? [];
    const adjudication = adjudicationByCapture.get(capture.captureRef);
    if (adjudication === undefined) fail(`missing validated adjudication for ${capture.captureRef}.`);
    const independentAnnotationLabels = sourceAnnotations.map((entry) => entry.label);
    return Object.freeze({
      captureRef: capture.captureRef,
      partition: capture.partition,
      canonicalAssetDigest: capture.canonicalAssetDigest,
      independentAnnotationCount: sourceAnnotations.length,
      independentAnnotationLabels: Object.freeze(independentAnnotationLabels),
      annotatorDisagreementObserved: new Set(independentAnnotationLabels).size > 1,
      adjudicatorRef: adjudication.adjudicatorRef,
      adjudicationOutcome: adjudication.outcome,
      unresolved: adjudication.outcome === 'unresolved',
      exactIndependentAnnotationReviewSetMatched: true as const,
      providerBlindAdjudicationRecorded: true as const,
      independentAdjudicatorSeparationRecorded: true as const,
    });
  });

  const outcomeCounts: Record<IndependentFaceAdjudicationOutcomeFRData10V1, number> = {
    zero_human_faces: 0,
    one_human_face: 0,
    multiple_human_faces: 0,
    indeterminate: 0,
    unresolved: 0,
  };
  for (const entry of adjudicationDataset.adjudications) outcomeCounts[entry.outcome] += 1;
  const unresolvedCaptureCount = outcomeCounts.unresolved;

  return Object.freeze({
    schemaVersion: 'fr-data10-independent-face-count-adjudication-report-v1' as const,
    datasetRef: groundTruthDataset.datasetRef,
    upstreamGroundTruthSchemaRef: 'fr-data07-independent-face-ground-truth-v1' as const,
    upstreamAnnotationLedgerDigest: adjudicationDataset.upstreamAnnotationLedgerDigest,
    adjudicationLedgerDigest: adjudicationDataset.adjudicationLedgerDigest,
    captureCount: groundTruthDataset.captures.length,
    resolvedCaptureCount: groundTruthDataset.captures.length - unresolvedCaptureCount,
    unresolvedCaptureCount,
    outcomeCounts: Object.freeze(outcomeCounts),
    captureSummaries: Object.freeze(captureSummaries),
    upstreamAnnotationLedgerBindingVerified: true as const,
    adjudicationAfterGroundTruthLedgerFreezeVerified: true as const,
    exactCaptureAdjudicationCoverageVerified: true as const,
    exactIndependentAnnotationReviewSetCoverageVerified: true as const,
    providerBlindAdjudicationRecordedForEveryCapture: true as const,
    independentAdjudicatorSeparationRecordedForEveryCapture: true as const,
    originalIndependentAnnotationsPreserved: true as const,
    automaticMajorityRuleAbsent: true as const,
    automaticUnanimityRuleAbsent: true as const,
    annotationCountRuleAbsent: true as const,
    unresolvedOutcomePreserved: true as const,
    adjudicationLedgerFrozenVerified: true as const,
    adjudicationLedgerContentDigestVerified: true as const,
    adjudicatedProviderScoringPerformed: false as const,
    captureConsensusGroundTruthAuthorityValidated: false as const,
    interAnnotatorGroundTruthAuthorityValidated: false as const,
    providerDetectionConstructValidityValidated: false as const,
    providerFaceCandidateHumanIdentityValidated: false as const,
    singleHumanFaceVerified: false as const,
    facePresenceVerified: false as const,
    classificationMetricsComputed: false as const,
    calibrationThresholdsDefined: false as const,
    providerDecisionThresholdDefined: false as const,
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

export function assertIndependentFaceAdjudicationReadyForPromotionFRData10(): never {
  validateIndependentFaceAdjudicationAuthorityFRData10();
  return fail(
    'provider-blind adjudication records and a frozen adjudication ledger preserve human review evidence only; they do not establish reviewed ground-truth authority, provider construct validity, classification metrics, thresholds, anatomy, traditional semantics, or production geometry.',
  );
}
