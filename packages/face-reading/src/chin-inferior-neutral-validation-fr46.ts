import {
  MEDIAPIPE_FACE_OVAL_INFERIOR_EXTREMUM_AUTHORITY_FR45,
  type MediaPipeFaceOvalInferiorExtremumEvidenceFR45V1,
  validateMediaPipeFaceOvalInferiorExtremumAuthorityFR45,
} from './mediapipe-face-oval-inferior-extremum-fr45.js';
import {
  THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35,
  validateThreeDivisionsNeutralSurfaceExtensionAuthorityFR35,
} from './three-divisions-neutral-surface-extension-fr35.js';
import {
  THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36,
  validateThreeDivisionsVerticalReferenceDerivationAuthorityFR36,
} from './three-divisions-vertical-reference-derivations-fr36.js';
import { FaceAuthorityValidationError } from './validation.js';

export type ChinInferiorExternalEvidenceScopeFR46V1 =
  | 'frontal_photogrammetry'
  | 'three_dimensional_stereophotogrammetry';

export interface ChinInferiorExternalNeutralEvidenceFR46V1 {
  readonly evidenceId: string;
  readonly title: string;
  readonly year: number;
  readonly doi: string;
  readonly pmcid: string;
  readonly sourceScope: ChinInferiorExternalEvidenceScopeFR46V1;
  readonly reviewedObservation: string;
  readonly targetClaims: {
    readonly softTissueMentonDefined: true;
    readonly inferiorChinPointDefined: true;
    readonly midsagittalOrMidlineDefined: true;
    readonly frontalOr3DNeutralGeometryUsable: true;
  };
  readonly mediaPipeMappingSupplied: false;
  readonly providerIndexAuthoritySupplied: false;
  readonly fr35ContourDefinitionSupplied: false;
  readonly traditionalDigeAuthoritySupplied: false;
  readonly limitations: readonly string[];
}

export type ChinInferiorAdmissionGateStateFR46V1 = 'satisfied' | 'blocked';

export interface ChinInferiorAdmissionGateFR46V1 {
  readonly gateId:
    | 'external_soft_tissue_menton_target'
    | 'provider_candidate_to_menton_mapping'
    | 'provider_candidate_midline_stability'
    | 'controlled_multi_subject_capture'
    | 'repeated_capture_repeatability'
    | 'pose_stability'
    | 'calibration_error_thresholds'
    | 'fr35_point_to_contour_relation'
    | 'traditional_dige_equivalence';
  readonly state: ChinInferiorAdmissionGateStateFR46V1;
  readonly evidenceRefs: readonly string[];
  readonly rationale: string;
}

export interface ChinInferiorIndependentAnnotationProtocolFR46V1 {
  readonly protocolRef: 'protocol.face.chin_inferior.soft_tissue_menton_annotation.fr46@0.1.0';
  readonly targetName: 'soft_tissue_menton';
  readonly targetDefinition: 'most_inferior_midline_point_of_soft_tissue_chin';
  readonly coordinateFrame: 'normalized_image_2d';
  readonly captureView: 'frontal_en_face';
  readonly expression: 'neutral';
  readonly headPosition: 'natural_or_protocol_neutral';
  readonly annotatorProviderBlindRequired: true;
  readonly annotationFrozenBeforeProviderScoringRequired: true;
  readonly providerLandmarkIndicesVisibleToAnnotator: false;
  readonly providerFaceOvalVisibleToAnnotator: false;
  readonly fr45ExtremumVisibleToAnnotator: false;
  readonly traditionalLabelVisibleToAnnotator: false;
  readonly minimumSubjectCount: null;
  readonly maximumAllowedError: null;
  readonly repeatabilityThreshold: null;
  readonly poseThreshold: null;
}

export interface ChinInferiorIndependentAnnotationFR46V1 {
  readonly subjectId: string;
  readonly captureId: string;
  readonly annotatorId: string;
  readonly targetName: 'soft_tissue_menton';
  readonly x: number;
  readonly y: number;
  readonly providerOutputVisibleDuringAnnotation: false;
  readonly annotationFrozenBeforeProviderScoring: true;
}

export interface ChinInferiorProviderCandidateScoreFR46V1 {
  readonly scoringRef: 'algorithm.validation.chin_inferior.menton_point_distance.fr46@0.1.0';
  readonly coordinateFrame: 'normalized_image_2d';
  readonly candidateAlgorithmRef: 'algorithm.neutral.face_oval.image_inferior_extremum.fr45@0.1.0';
  readonly targetName: 'soft_tissue_menton';
  readonly normalizedEuclideanDistance: number;
  readonly passThreshold: null;
  readonly passed: null;
  readonly mappingValidated: false;
  readonly fr35ContourBindingAuthorized: false;
  readonly traditionalDigeEquivalenceAuthorized: false;
  readonly productionGeometryAuthorized: false;
}

export interface ChinInferiorPointContourRelationFR46V1 {
  readonly pointTarget: 'soft_tissue_menton';
  readonly fr35SurfaceId: 'neutral.face.chin_inferior_contour';
  readonly relationState: 'blocked_contour_membership_and_derivation_rule_unreviewed';
  readonly pointMaySubstituteForContour: false;
  readonly extremumOfProviderFaceOvalMeansExtremumOfReviewedChinContour: false;
  readonly reviewedContourMembershipRuleAvailable: false;
  readonly reviewedPointFromContourDerivationAvailable: false;
}

export interface ChinInferiorNeutralValidationAuthorityFR46V1 {
  readonly schemaVersion: 'fr46-v1';
  readonly authorityRef: 'authority.face.chin_inferior_neutral_validation.fr46';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'soft_tissue_menton_target_supported_provider_mapping_and_contour_binding_blocked';
  readonly upstreamFR35Ref: string;
  readonly upstreamFR36Ref: string;
  readonly upstreamFR45Ref: string;
  readonly evidence: readonly ChinInferiorExternalNeutralEvidenceFR46V1[];
  readonly annotationProtocol: ChinInferiorIndependentAnnotationProtocolFR46V1;
  readonly admissionGates: readonly ChinInferiorAdmissionGateFR46V1[];
  readonly pointContourRelation: ChinInferiorPointContourRelationFR46V1;
  readonly authorityBoundary: {
    readonly softTissueMentonDefinitionMeansMediaPipeMapping: false;
    readonly observedProviderIndex152MeansMenton: false;
    readonly faceOvalInferiorExtremumMeansMentonWithoutValidation: false;
    readonly mentonPointMeansFR35Contour: false;
    readonly mentonPointMeansTraditionalDige: false;
    readonly singleFixtureEvidenceMeansGeneralizedGeometry: false;
    readonly scoringDistanceMeansValidationWithoutThreshold: false;
    readonly traditionalSemanticProjectionAllowed: false;
    readonly fr36VerticalReferencePromoted: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
}

export interface ChinInferiorNeutralValidationReadinessFR46V1 {
  readonly externalSoftTissueMentonTargetReady: true;
  readonly independentAnnotationProtocolReady: true;
  readonly providerCandidateScoringAlgorithmReady: true;
  readonly providerCandidateToMentonMappingReady: false;
  readonly fr35PointToContourRelationReady: false;
  readonly traditionalDigeEquivalenceReady: false;
  readonly fr36VerticalReferenceReady: false;
  readonly productionGeometryReady: false;
  readonly nextRequiredEvidence: readonly string[];
}

const FR35_REF = `${THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35.authorityRef}@${THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35.authorityVersion}`;
const FR36_REF = `${THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36.authorityRef}@${THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36.authorityVersion}`;
const FR45_REF = `${MEDIAPIPE_FACE_OVAL_INFERIOR_EXTREMUM_AUTHORITY_FR45.authorityRef}@${MEDIAPIPE_FACE_OVAL_INFERIOR_EXTREMUM_AUTHORITY_FR45.authorityVersion}`;

const EVIDENCE: readonly ChinInferiorExternalNeutralEvidenceFR46V1[] = Object.freeze([
  Object.freeze({
    evidenceId: 'evidence.fr46.negi_chitra_2019_soft_tissue_menton',
    title: 'Photogrammetric reliability of frontal facial photographs with radiographs and anthropometric measurements',
    year: 2019,
    doi: '10.1016/j.jobcr.2019.06.011',
    pmcid: 'PMC6593212',
    sourceScope: 'frontal_photogrammetry' as const,
    reviewedObservation: 'The frontal-photogrammetry protocol defines soft-tissue Menton (Me′) as the most inferior point of the soft-tissue chin in the midsagittal plane and reports N′–Me′ among the measurements reliable across photographic, cephalometric, and anthropometric methods.',
    targetClaims: Object.freeze({
      softTissueMentonDefined: true as const,
      inferiorChinPointDefined: true as const,
      midsagittalOrMidlineDefined: true as const,
      frontalOr3DNeutralGeometryUsable: true as const,
    }),
    mediaPipeMappingSupplied: false as const,
    providerIndexAuthoritySupplied: false as const,
    fr35ContourDefinitionSupplied: false as const,
    traditionalDigeAuthoritySupplied: false as const,
    limitations: Object.freeze([
      'The study evaluates human-identified frontal soft-tissue landmarks, not MediaPipe topology or provider-index semantics.',
      'The sampled population was 300 Indian adults aged 18–25, so it cannot by itself establish population-generalized calibration thresholds for MyeongHa.',
      'The authors conclude that only a limited subset of photographic parameters is reliable; the paper does not authorize an automated provider mapping.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr46.zhang_2024_3d_soft_tissue_menton',
    title: 'Three-dimensional analysis of hard and soft tissue changes in skeletal class II patients with high mandibular plane angle undergoing surgery',
    year: 2024,
    doi: '10.1038/s41598-024-51322-1',
    pmcid: 'PMC10827781',
    sourceScope: 'three_dimensional_stereophotogrammetry' as const,
    reviewedObservation: 'The 3D soft-tissue landmark protocol defines Menton′ (Me′) as the lowest point on the midline of the chin, supporting an independent soft-tissue inferior-midline target in stereophotogrammetric geometry.',
    targetClaims: Object.freeze({
      softTissueMentonDefined: true as const,
      inferiorChinPointDefined: true as const,
      midsagittalOrMidlineDefined: true as const,
      frontalOr3DNeutralGeometryUsable: true as const,
    }),
    mediaPipeMappingSupplied: false as const,
    providerIndexAuthoritySupplied: false as const,
    fr35ContourDefinitionSupplied: false as const,
    traditionalDigeAuthoritySupplied: false as const,
    limitations: Object.freeze([
      'The study is a clinical skeletal-Class-II surgical cohort and does not establish general-population calibration thresholds.',
      'Its 3D landmark identity cannot be transferred to a 2D MediaPipe index or face-oval component without explicit cross-representation validation.',
      'The source defines a point landmark and does not define the FR-35 chin_inferior_contour curve contract.',
    ]),
  }),
]);

const ANNOTATION_PROTOCOL: ChinInferiorIndependentAnnotationProtocolFR46V1 = Object.freeze({
  protocolRef: 'protocol.face.chin_inferior.soft_tissue_menton_annotation.fr46@0.1.0' as const,
  targetName: 'soft_tissue_menton' as const,
  targetDefinition: 'most_inferior_midline_point_of_soft_tissue_chin' as const,
  coordinateFrame: 'normalized_image_2d' as const,
  captureView: 'frontal_en_face' as const,
  expression: 'neutral' as const,
  headPosition: 'natural_or_protocol_neutral' as const,
  annotatorProviderBlindRequired: true as const,
  annotationFrozenBeforeProviderScoringRequired: true as const,
  providerLandmarkIndicesVisibleToAnnotator: false as const,
  providerFaceOvalVisibleToAnnotator: false as const,
  fr45ExtremumVisibleToAnnotator: false as const,
  traditionalLabelVisibleToAnnotator: false as const,
  minimumSubjectCount: null,
  maximumAllowedError: null,
  repeatabilityThreshold: null,
  poseThreshold: null,
});

const GATE_IDS: readonly ChinInferiorAdmissionGateFR46V1['gateId'][] = Object.freeze([
  'external_soft_tissue_menton_target',
  'provider_candidate_to_menton_mapping',
  'provider_candidate_midline_stability',
  'controlled_multi_subject_capture',
  'repeated_capture_repeatability',
  'pose_stability',
  'calibration_error_thresholds',
  'fr35_point_to_contour_relation',
  'traditional_dige_equivalence',
]);

const GATES: readonly ChinInferiorAdmissionGateFR46V1[] = Object.freeze([
  Object.freeze({ gateId: GATE_IDS[0]!, state: 'satisfied' as const, evidenceRefs: Object.freeze(EVIDENCE.map((entry) => entry.evidenceId)), rationale: 'Independent frontal-photogrammetry and 3D-stereophotogrammetry literature both define a neutral soft-tissue inferior-midline chin point (Me′).' }),
  Object.freeze({ gateId: GATE_IDS[1]!, state: 'blocked' as const, evidenceRefs: Object.freeze([FR45_REF]), rationale: 'FR-45 proves provider-neutral inferior-extremum extraction but no independent blinded dataset compares that candidate against annotated soft-tissue Menton.' }),
  Object.freeze({ gateId: GATE_IDS[2]!, state: 'blocked' as const, evidenceRefs: Object.freeze([]), rationale: 'No multi-subject evidence establishes that the face-oval image-y extremum remains sufficiently close to the independently annotated facial midline target.' }),
  Object.freeze({ gateId: GATE_IDS[3]!, state: 'blocked' as const, evidenceRefs: Object.freeze([]), rationale: 'FR-45 has one pinned fixture only; a reviewed multi-subject controlled-capture dataset has not been supplied.' }),
  Object.freeze({ gateId: GATE_IDS[4]!, state: 'blocked' as const, evidenceRefs: Object.freeze([]), rationale: 'Two deterministic inferences on one image do not establish repeated physical-capture repeatability.' }),
  Object.freeze({ gateId: GATE_IDS[5]!, state: 'blocked' as const, evidenceRefs: Object.freeze([]), rationale: 'No reviewed yaw/pitch/roll perturbation distribution exists for the FR-45 candidate against independent Me′ annotations.' }),
  Object.freeze({ gateId: GATE_IDS[6]!, state: 'blocked' as const, evidenceRefs: Object.freeze([]), rationale: 'No reviewed error distribution exists, so FR-46 does not invent a maximum normalized point-distance or pass threshold.' }),
  Object.freeze({ gateId: GATE_IDS[7]!, state: 'blocked' as const, evidenceRefs: Object.freeze([FR35_REF]), rationale: 'External evidence supports a Menton point; FR-35 requires a chin inferior contour curve. No reviewed membership or point-from-contour derivation rule connects them.' }),
  Object.freeze({ gateId: GATE_IDS[8]!, state: 'blocked' as const, evidenceRefs: Object.freeze([FR36_REF]), rationale: 'Neutral soft-tissue Menton evidence does not by itself establish equivalence to the traditional 地閣 anchor or select a 三停 source variant.' }),
]);

const POINT_CONTOUR_RELATION: ChinInferiorPointContourRelationFR46V1 = Object.freeze({
  pointTarget: 'soft_tissue_menton' as const,
  fr35SurfaceId: 'neutral.face.chin_inferior_contour' as const,
  relationState: 'blocked_contour_membership_and_derivation_rule_unreviewed' as const,
  pointMaySubstituteForContour: false as const,
  extremumOfProviderFaceOvalMeansExtremumOfReviewedChinContour: false as const,
  reviewedContourMembershipRuleAvailable: false as const,
  reviewedPointFromContourDerivationAvailable: false as const,
});

export const CHIN_INFERIOR_NEUTRAL_VALIDATION_AUTHORITY_FR46: ChinInferiorNeutralValidationAuthorityFR46V1 = Object.freeze({
  schemaVersion: 'fr46-v1' as const,
  authorityRef: 'authority.face.chin_inferior_neutral_validation.fr46' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'soft_tissue_menton_target_supported_provider_mapping_and_contour_binding_blocked' as const,
  upstreamFR35Ref: FR35_REF,
  upstreamFR36Ref: FR36_REF,
  upstreamFR45Ref: FR45_REF,
  evidence: EVIDENCE,
  annotationProtocol: ANNOTATION_PROTOCOL,
  admissionGates: GATES,
  pointContourRelation: POINT_CONTOUR_RELATION,
  authorityBoundary: Object.freeze({
    softTissueMentonDefinitionMeansMediaPipeMapping: false as const,
    observedProviderIndex152MeansMenton: false as const,
    faceOvalInferiorExtremumMeansMentonWithoutValidation: false as const,
    mentonPointMeansFR35Contour: false as const,
    mentonPointMeansTraditionalDige: false as const,
    singleFixtureEvidenceMeansGeneralizedGeometry: false as const,
    scoringDistanceMeansValidationWithoutThreshold: false as const,
    traditionalSemanticProjectionAllowed: false as const,
    fr36VerticalReferencePromoted: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
});

function assertNormalizedCoordinate(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new FaceAuthorityValidationError(`FR-46 ${label} must be a finite normalized image coordinate in [0,1].`);
  }
}

export function validateChinInferiorIndependentAnnotationFR46(
  annotation: ChinInferiorIndependentAnnotationFR46V1,
): ChinInferiorIndependentAnnotationFR46V1 {
  if (annotation.subjectId.trim().length === 0 || annotation.captureId.trim().length === 0 || annotation.annotatorId.trim().length === 0) {
    throw new FaceAuthorityValidationError('FR-46 independent annotation identity fields must be non-empty.');
  }
  if (annotation.targetName !== 'soft_tissue_menton' || annotation.providerOutputVisibleDuringAnnotation !== false ||
      annotation.annotationFrozenBeforeProviderScoring !== true) {
    throw new FaceAuthorityValidationError('FR-46 annotation must remain provider-blinded and frozen before provider scoring.');
  }
  assertNormalizedCoordinate(annotation.x, 'annotation.x');
  assertNormalizedCoordinate(annotation.y, 'annotation.y');
  return annotation;
}

export function scoreFaceOvalInferiorExtremumAgainstMentonFR46(
  candidate: MediaPipeFaceOvalInferiorExtremumEvidenceFR45V1,
  annotation: ChinInferiorIndependentAnnotationFR46V1,
): ChinInferiorProviderCandidateScoreFR46V1 {
  validateMediaPipeFaceOvalInferiorExtremumAuthorityFR45();
  validateChinInferiorIndependentAnnotationFR46(annotation);
  if (candidate.state !== 'unique_image_inferior_extremum' || candidate.selectedPoint === null ||
      candidate.algorithmRef !== 'algorithm.neutral.face_oval.image_inferior_extremum.fr45@0.1.0' ||
      candidate.providerIndexSemanticAuthority !== false || candidate.chinInferiorContourBindingAuthorized !== false ||
      candidate.traditionalDigeEquivalenceAuthorized !== false || candidate.fr36VerticalReferencePromoted !== false ||
      candidate.productionGeometryAuthorized !== false) {
    throw new FaceAuthorityValidationError('FR-46 scoring requires a unique fail-closed FR-45 provider-neutral candidate.');
  }
  assertNormalizedCoordinate(candidate.selectedPoint.x, 'candidate.x');
  assertNormalizedCoordinate(candidate.selectedPoint.y, 'candidate.y');
  const normalizedEuclideanDistance = Math.hypot(candidate.selectedPoint.x - annotation.x, candidate.selectedPoint.y - annotation.y);
  return Object.freeze({
    scoringRef: 'algorithm.validation.chin_inferior.menton_point_distance.fr46@0.1.0' as const,
    coordinateFrame: 'normalized_image_2d' as const,
    candidateAlgorithmRef: 'algorithm.neutral.face_oval.image_inferior_extremum.fr45@0.1.0' as const,
    targetName: 'soft_tissue_menton' as const,
    normalizedEuclideanDistance,
    passThreshold: null,
    passed: null,
    mappingValidated: false as const,
    fr35ContourBindingAuthorized: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    productionGeometryAuthorized: false as const,
  });
}

export function validateChinInferiorNeutralValidationAuthorityFR46(
  authority: ChinInferiorNeutralValidationAuthorityFR46V1 = CHIN_INFERIOR_NEUTRAL_VALIDATION_AUTHORITY_FR46,
): ChinInferiorNeutralValidationAuthorityFR46V1 {
  validateThreeDivisionsNeutralSurfaceExtensionAuthorityFR35();
  validateThreeDivisionsVerticalReferenceDerivationAuthorityFR36();
  validateMediaPipeFaceOvalInferiorExtremumAuthorityFR45();
  if (authority.schemaVersion !== 'fr46-v1' || authority.authorityRef !== 'authority.face.chin_inferior_neutral_validation.fr46' ||
      authority.authorityVersion !== '0.1.0' || authority.authorityState !== 'soft_tissue_menton_target_supported_provider_mapping_and_contour_binding_blocked' ||
      authority.upstreamFR35Ref !== FR35_REF || authority.upstreamFR36Ref !== FR36_REF || authority.upstreamFR45Ref !== FR45_REF) {
    throw new FaceAuthorityValidationError('FR-46 identity/upstream authority drift.');
  }

  const expectedEvidence = [
    ['evidence.fr46.negi_chitra_2019_soft_tissue_menton', 2019, '10.1016/j.jobcr.2019.06.011', 'PMC6593212', 'frontal_photogrammetry'],
    ['evidence.fr46.zhang_2024_3d_soft_tissue_menton', 2024, '10.1038/s41598-024-51322-1', 'PMC10827781', 'three_dimensional_stereophotogrammetry'],
  ] as const;
  if (authority.evidence.length !== expectedEvidence.length) {
    throw new FaceAuthorityValidationError('FR-46 must preserve exactly two reviewed independent neutral evidence records.');
  }
  authority.evidence.forEach((evidence, index) => {
    const expected = expectedEvidence[index]!;
    if (evidence.evidenceId !== expected[0] || evidence.year !== expected[1] || evidence.doi !== expected[2] ||
        evidence.pmcid !== expected[3] || evidence.sourceScope !== expected[4] || evidence.title.trim().length === 0 ||
        evidence.reviewedObservation.trim().length === 0 || evidence.limitations.length === 0 ||
        !Object.values(evidence.targetClaims).every((value) => value === true) || evidence.mediaPipeMappingSupplied !== false ||
        evidence.providerIndexAuthoritySupplied !== false || evidence.fr35ContourDefinitionSupplied !== false ||
        evidence.traditionalDigeAuthoritySupplied !== false) {
      throw new FaceAuthorityValidationError(`FR-46 external evidence drift: ${evidence.evidenceId}`);
    }
  });

  const protocol = authority.annotationProtocol;
  if (protocol.protocolRef !== 'protocol.face.chin_inferior.soft_tissue_menton_annotation.fr46@0.1.0' ||
      protocol.targetName !== 'soft_tissue_menton' || protocol.targetDefinition !== 'most_inferior_midline_point_of_soft_tissue_chin' ||
      protocol.coordinateFrame !== 'normalized_image_2d' || protocol.captureView !== 'frontal_en_face' || protocol.expression !== 'neutral' ||
      protocol.headPosition !== 'natural_or_protocol_neutral' || protocol.annotatorProviderBlindRequired !== true ||
      protocol.annotationFrozenBeforeProviderScoringRequired !== true || protocol.providerLandmarkIndicesVisibleToAnnotator !== false ||
      protocol.providerFaceOvalVisibleToAnnotator !== false || protocol.fr45ExtremumVisibleToAnnotator !== false ||
      protocol.traditionalLabelVisibleToAnnotator !== false || protocol.minimumSubjectCount !== null ||
      protocol.maximumAllowedError !== null || protocol.repeatabilityThreshold !== null || protocol.poseThreshold !== null) {
    throw new FaceAuthorityValidationError('FR-46 independent annotation protocol drift or invented threshold.');
  }

  if (authority.admissionGates.length !== GATE_IDS.length ||
      authority.admissionGates.some((gate, index) => gate.gateId !== GATE_IDS[index]) ||
      authority.admissionGates[0]?.state !== 'satisfied' || authority.admissionGates.slice(1).some((gate) => gate.state !== 'blocked')) {
    throw new FaceAuthorityValidationError('FR-46 only the external soft-tissue Menton target gate may be satisfied.');
  }

  const relation = authority.pointContourRelation;
  if (relation.pointTarget !== 'soft_tissue_menton' || relation.fr35SurfaceId !== 'neutral.face.chin_inferior_contour' ||
      relation.relationState !== 'blocked_contour_membership_and_derivation_rule_unreviewed' || relation.pointMaySubstituteForContour !== false ||
      relation.extremumOfProviderFaceOvalMeansExtremumOfReviewedChinContour !== false ||
      relation.reviewedContourMembershipRuleAvailable !== false || relation.reviewedPointFromContourDerivationAvailable !== false) {
    throw new FaceAuthorityValidationError('FR-46 point-to-contour relation must remain fail-closed.');
  }
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-46 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function assessChinInferiorNeutralValidationReadinessFR46(
  authority: ChinInferiorNeutralValidationAuthorityFR46V1 = CHIN_INFERIOR_NEUTRAL_VALIDATION_AUTHORITY_FR46,
): ChinInferiorNeutralValidationReadinessFR46V1 {
  validateChinInferiorNeutralValidationAuthorityFR46(authority);
  return Object.freeze({
    externalSoftTissueMentonTargetReady: true as const,
    independentAnnotationProtocolReady: true as const,
    providerCandidateScoringAlgorithmReady: true as const,
    providerCandidateToMentonMappingReady: false as const,
    fr35PointToContourRelationReady: false as const,
    traditionalDigeEquivalenceReady: false as const,
    fr36VerticalReferenceReady: false as const,
    productionGeometryReady: false as const,
    nextRequiredEvidence: Object.freeze([
      'provider-blinded multi-subject frontal neutral captures with independently frozen soft-tissue Menton annotations',
      'repeated physical captures and bounded pose perturbations to estimate candidate-to-Menton error distributions',
      'reviewed calibration thresholds chosen from held-out validation evidence rather than the FR-45 single fixture',
      'reviewed geometric relation between the soft-tissue Menton point and FR-35 neutral.face.chin_inferior_contour before any contour binding',
      'separate traditional-neutral equivalence review before any 地閣 or 三停 promotion',
    ]),
  });
}

export function assertChinInferiorProductionReadyFR46(): never {
  validateChinInferiorNeutralValidationAuthorityFR46();
  throw new FaceAuthorityValidationError(
    'FR-46 supports an independent soft-tissue Menton target and provider-blinded scoring protocol only; provider mapping, FR-35 contour relation, 地閣 equivalence, FR-36, Three Divisions, F1, and F6 remain blocked.',
  );
}
