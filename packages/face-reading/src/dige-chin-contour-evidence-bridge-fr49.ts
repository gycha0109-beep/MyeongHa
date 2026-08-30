import {
  MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33,
  validateMayiThreeDivisionsBoundaryAuthorityFR33,
} from './mayi-three-divisions-boundary-variants-fr33.js';
import {
  THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35,
  validateThreeDivisionsNeutralSurfaceExtensionAuthorityFR35,
} from './three-divisions-neutral-surface-extension-fr35.js';
import {
  THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36,
  validateThreeDivisionsVerticalReferenceDerivationAuthorityFR36,
} from './three-divisions-vertical-reference-derivations-fr36.js';
import {
  CHIN_INFERIOR_NEUTRAL_VALIDATION_AUTHORITY_FR46,
  validateChinInferiorNeutralValidationAuthorityFR46,
  type ChinInferiorIndependentAnnotationFR46V1,
} from './chin-inferior-neutral-validation-fr46.js';
import { FaceAuthorityValidationError } from './validation.js';

export type DigeChinEvidenceLineageFR49V1 =
  | 'traditional_face_reading'
  | 'historical_anatomical_terminology'
  | 'modern_soft_tissue_anthropometry';

export interface DigeChinEvidenceFR49V1 {
  readonly evidenceId: string;
  readonly lineage: DigeChinEvidenceLineageFR49V1;
  readonly title: string;
  readonly sourceRef: string;
  readonly reviewedObservation: string;
  readonly supports: {
    readonly digeAsChinRegion: boolean;
    readonly lowerThreeDivisionsTerminatesAtDige: boolean;
    readonly softTissueMentonDefinedFromChinContour: boolean;
    readonly softTissueMentonInferiorMidlineOrMidpoint: boolean;
  };
  readonly doesNotSupport: readonly string[];
}

export interface DigeChinContourRelationFR49V1 {
  readonly traditionalAnchorRef: 'dige';
  readonly neutralSurfaceRef: 'neutral.face.chin_inferior_contour';
  readonly neutralPointTarget: 'soft_tissue_menton';
  readonly traditionalDigeChinRegionSupported: true;
  readonly traditionalDigeIsSinglePunctualLandmarkEstablished: false;
  readonly historicalDigeBoneChinTerminologySupported: true;
  readonly softTissueMentonDefinedFromChinContourSupported: true;
  readonly softTissueMentonInferiorMidlineOrMidpointSupported: true;
  readonly conceptualPointFromContourDefinitionAvailable: true;
  readonly fr35NeutralChinContourTargetClassExternallyGrounded: true;
  readonly fr35ExactContourGeometryEstablished: false;
  readonly pointMaySubstituteForWholeContour: false;
  readonly traditionalDigeEqualsSoftTissueMenton: false;
  readonly providerFaceOvalEqualsSoftTissueChinContour: false;
  readonly fr45InferiorExtremumEqualsSoftTissueMenton: false;
}

export interface DigeLowerBoundaryResearchCandidateFR49V1 {
  readonly algorithmRef: 'algorithm.research.dige_lower_boundary.from_independent_soft_tissue_menton.fr49@0.1.0';
  readonly traditionalAnchorRef: 'dige';
  readonly neutralPointTarget: 'soft_tissue_menton';
  readonly coordinateFrame: 'normalized_image_2d';
  readonly verticalCoordinateY: number;
  readonly candidateState: 'neutral_research_boundary_candidate_not_traditional_equivalence';
  readonly derivedFromProviderOutput: false;
  readonly providerMappingAuthorized: false;
  readonly traditionalDigePointEquivalenceAuthorized: false;
  readonly fr35WholeContourSubstitutionAuthorized: false;
  readonly productionGeometryAuthorized: false;
}

export interface DigeChinContourEvidenceBridgeAuthorityFR49V1 {
  readonly schemaVersion: 'fr49-v1';
  readonly authorityRef: 'authority.face.dige_chin_contour_evidence_bridge.fr49';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'dige_chin_region_and_menton_contour_relation_supported_exact_equivalence_and_provider_mapping_blocked';
  readonly upstreamFR33Ref: string;
  readonly upstreamFR35Ref: string;
  readonly upstreamFR36Ref: string;
  readonly upstreamFR46Ref: string;
  readonly evidence: readonly DigeChinEvidenceFR49V1[];
  readonly relation: DigeChinContourRelationFR49V1;
  readonly researchBoundaryAlgorithmRef: 'algorithm.research.dige_lower_boundary.from_independent_soft_tissue_menton.fr49@0.1.0';
  readonly authorityBoundary: {
    readonly traditionalDigeEqualsSoftTissueMenton: false;
    readonly traditionalDigeIsSinglePointEstablished: false;
    readonly mentonPointMeansFR35WholeContour: false;
    readonly providerFaceOvalMeansReviewedChinContour: false;
    readonly providerIndex152MeansMenton: false;
    readonly fr45CandidateMeansMenton: false;
    readonly sourceVariantSelectionAllowed: false;
    readonly providerMappingAuthorized: false;
    readonly anatomicalLandmarkAuthorityValidatedForProvider: false;
    readonly traditionalSemanticProjectionAllowed: false;
    readonly fr36VerticalReferencePromoted: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
    readonly productionGeometryAuthorized: false;
  };
}

export interface DigeChinContourEvidenceBridgeReadinessFR49V1 {
  readonly traditionalDigeChinRegionEvidenceReady: true;
  readonly lowerThreeDivisionsDigeTerminationEvidenceReady: true;
  readonly softTissueMentonContourDefinitionReady: true;
  readonly conceptualPointFromContourRelationReady: true;
  readonly neutralResearchBoundaryCandidateAlgorithmReady: true;
  readonly fr35ExactContourGeometryReady: false;
  readonly providerMappingReady: false;
  readonly traditionalDigePointEquivalenceReady: false;
  readonly fr36ProductionVerticalReferenceReady: false;
  readonly productionGeometryReady: false;
  readonly nextRequiredEvidence: readonly string[];
}

const FR33_REF = `${MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33.authorityRef}@${MAYI_THREE_DIVISIONS_BOUNDARY_AUTHORITY_FR33.authorityVersion}`;
const FR35_REF = `${THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35.authorityRef}@${THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35.authorityVersion}`;
const FR36_REF = `${THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36.authorityRef}@${THREE_DIVISIONS_VERTICAL_REFERENCE_DERIVATION_AUTHORITY_FR36.authorityVersion}`;
const FR46_REF = `${CHIN_INFERIOR_NEUTRAL_VALIDATION_AUTHORITY_FR46.authorityRef}@${CHIN_INFERIOR_NEUTRAL_VALIDATION_AUTHORITY_FR46.authorityVersion}`;

const EVIDENCE: readonly DigeChinEvidenceFR49V1[] = Object.freeze([
  Object.freeze({
    evidenceId: 'evidence.fr49.mayi_nlc_three_divisions_dige_termination',
    lineage: 'traditional_face_reading' as const,
    title: '麻衣相法 卷一 — 三才三停',
    sourceRef: 'witness.mayi_xiangfa.nlc_1925_v1:scan-page-36',
    reviewedObservation: 'The scan-checked contiguous face formula records 眉至準頭為中停 and 準至地閣為下停, preserving 地閣 as the lower-division terminal anchor in that witness.',
    supports: Object.freeze({
      digeAsChinRegion: false,
      lowerThreeDivisionsTerminatesAtDige: true,
      softTissueMentonDefinedFromChinContour: false,
      softTissueMentonInferiorMidlineOrMidpoint: false,
    }),
    doesNotSupport: Object.freeze([
      'It does not define 地閣 as a single anatomical point.',
      'It does not select this transmitted three-division variant over the other FR-33 variant.',
      'It does not provide provider landmarks or modern anatomical equivalence.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr49.shenxiang_quanbian_ke_is_dige',
    lineage: 'traditional_face_reading' as const,
    title: '神相全編 / 石室神異賦 transmitted text',
    sourceRef: 'https://zh.wikisource.org/zh/欽定古今圖書集成/博物彙編/藝術典/第636卷',
    reviewedObservation: 'The transmitted face-reading text states 頦為地閣, supporting 地閣 at the traditional chin-region level rather than defining a modern punctual landmark.',
    supports: Object.freeze({
      digeAsChinRegion: true,
      lowerThreeDivisionsTerminatesAtDige: false,
      softTissueMentonDefinedFromChinContour: false,
      softTissueMentonInferiorMidlineOrMidpoint: false,
    }),
    doesNotSupport: Object.freeze([
      '頦 is treated as a traditional facial region/part; the passage does not identify soft-tissue Menton.',
      'It does not define an image-coordinate extraction algorithm.',
      'It does not authorize a MediaPipe correspondence.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr49.yizong_jinjian_dige_bone_ke_chin',
    lineage: 'historical_anatomical_terminology' as const,
    title: '御纂醫宗金鑒 — 正骨心法要旨 — 地閣骨',
    sourceRef: 'https://ctext.org/wiki.pl?chapter=882017&if=en',
    reviewedObservation: 'The historical medical text records 地閣骨 as 又名頦 and 俗名下巴骨, independently locating the 地閣 terminology in the chin/lower-jaw anatomical region.',
    supports: Object.freeze({
      digeAsChinRegion: true,
      lowerThreeDivisionsTerminatesAtDige: false,
      softTissueMentonDefinedFromChinContour: false,
      softTissueMentonInferiorMidlineOrMidpoint: false,
    }),
    doesNotSupport: Object.freeze([
      'This is bony historical anatomy terminology, not proof that traditional soft-tissue 地閣 equals Menton.',
      'It does not define the FR-35 soft-tissue contour geometry.',
      'It does not authorize provider landmarks.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr49.soft_tissue_menton_chin_contour_2014',
    lineage: 'modern_soft_tissue_anthropometry' as const,
    title: 'Three-dimensional evaluation of the relationship between jaw divergence and facial soft tissue dimensions',
    sourceRef: 'PMID:24559507',
    reviewedObservation: 'The published landmark definition identifies soft-tissue Menton as the most inferior midpoint on the soft-tissue contour of the chin.',
    supports: Object.freeze({
      digeAsChinRegion: false,
      lowerThreeDivisionsTerminatesAtDige: false,
      softTissueMentonDefinedFromChinContour: true,
      softTissueMentonInferiorMidlineOrMidpoint: true,
    }),
    doesNotSupport: Object.freeze([
      'The definition does not establish traditional 地閣 equivalence.',
      'The definition does not map MediaPipe FACE_OVAL or index 152 to Menton.',
      'A point definition does not allow the point to substitute for the entire FR-35 curve.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr49.soft_tissue_menton_chin_contour_2024',
    lineage: 'modern_soft_tissue_anthropometry' as const,
    title: 'Validity and Reliability of New Three-Dimensional Reference Systems for Soft Tissue Analysis Using Non-Ionizing Three-Dimensional Imaging',
    sourceRef: 'DOI:10.3390/app14125307',
    reviewedObservation: 'The face-scan landmark table defines soft-tissue Menton as the most inferior midpoint on the soft-tissue contour of the chin, at the level of the 3D hard-tissue Menton landmark.',
    supports: Object.freeze({
      digeAsChinRegion: false,
      lowerThreeDivisionsTerminatesAtDige: false,
      softTissueMentonDefinedFromChinContour: true,
      softTissueMentonInferiorMidlineOrMidpoint: true,
    }),
    doesNotSupport: Object.freeze([
      'The 3D definition does not establish a 2D provider-index mapping.',
      'It does not establish traditional 地閣 equivalence.',
      'It does not define a MyeongHa calibration threshold.',
    ]),
  }),
]);

const RELATION: DigeChinContourRelationFR49V1 = Object.freeze({
  traditionalAnchorRef: 'dige' as const,
  neutralSurfaceRef: 'neutral.face.chin_inferior_contour' as const,
  neutralPointTarget: 'soft_tissue_menton' as const,
  traditionalDigeChinRegionSupported: true as const,
  traditionalDigeIsSinglePunctualLandmarkEstablished: false as const,
  historicalDigeBoneChinTerminologySupported: true as const,
  softTissueMentonDefinedFromChinContourSupported: true as const,
  softTissueMentonInferiorMidlineOrMidpointSupported: true as const,
  conceptualPointFromContourDefinitionAvailable: true as const,
  fr35NeutralChinContourTargetClassExternallyGrounded: true as const,
  fr35ExactContourGeometryEstablished: false as const,
  pointMaySubstituteForWholeContour: false as const,
  traditionalDigeEqualsSoftTissueMenton: false as const,
  providerFaceOvalEqualsSoftTissueChinContour: false as const,
  fr45InferiorExtremumEqualsSoftTissueMenton: false as const,
});

export const DIGE_CHIN_CONTOUR_EVIDENCE_BRIDGE_AUTHORITY_FR49: DigeChinContourEvidenceBridgeAuthorityFR49V1 = Object.freeze({
  schemaVersion: 'fr49-v1' as const,
  authorityRef: 'authority.face.dige_chin_contour_evidence_bridge.fr49' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'dige_chin_region_and_menton_contour_relation_supported_exact_equivalence_and_provider_mapping_blocked' as const,
  upstreamFR33Ref: FR33_REF,
  upstreamFR35Ref: FR35_REF,
  upstreamFR36Ref: FR36_REF,
  upstreamFR46Ref: FR46_REF,
  evidence: EVIDENCE,
  relation: RELATION,
  researchBoundaryAlgorithmRef: 'algorithm.research.dige_lower_boundary.from_independent_soft_tissue_menton.fr49@0.1.0' as const,
  authorityBoundary: Object.freeze({
    traditionalDigeEqualsSoftTissueMenton: false as const,
    traditionalDigeIsSinglePointEstablished: false as const,
    mentonPointMeansFR35WholeContour: false as const,
    providerFaceOvalMeansReviewedChinContour: false as const,
    providerIndex152MeansMenton: false as const,
    fr45CandidateMeansMenton: false as const,
    sourceVariantSelectionAllowed: false as const,
    providerMappingAuthorized: false as const,
    anatomicalLandmarkAuthorityValidatedForProvider: false as const,
    traditionalSemanticProjectionAllowed: false as const,
    fr36VerticalReferencePromoted: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
    productionGeometryAuthorized: false as const,
  }),
});

const EXPECTED_EVIDENCE_IDS = Object.freeze([
  'evidence.fr49.mayi_nlc_three_divisions_dige_termination',
  'evidence.fr49.shenxiang_quanbian_ke_is_dige',
  'evidence.fr49.yizong_jinjian_dige_bone_ke_chin',
  'evidence.fr49.soft_tissue_menton_chin_contour_2014',
  'evidence.fr49.soft_tissue_menton_chin_contour_2024',
]);

function validateNormalizedCoordinate(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new FaceAuthorityValidationError(`FR-49 ${label} must be a finite normalized coordinate in [0, 1].`);
  }
}

export function validateDigeChinContourEvidenceBridgeAuthorityFR49(
  authority: DigeChinContourEvidenceBridgeAuthorityFR49V1 = DIGE_CHIN_CONTOUR_EVIDENCE_BRIDGE_AUTHORITY_FR49,
): DigeChinContourEvidenceBridgeAuthorityFR49V1 {
  validateMayiThreeDivisionsBoundaryAuthorityFR33();
  validateThreeDivisionsNeutralSurfaceExtensionAuthorityFR35();
  validateThreeDivisionsVerticalReferenceDerivationAuthorityFR36();
  validateChinInferiorNeutralValidationAuthorityFR46();

  if (
    authority.schemaVersion !== 'fr49-v1' ||
    authority.authorityRef !== 'authority.face.dige_chin_contour_evidence_bridge.fr49' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'dige_chin_region_and_menton_contour_relation_supported_exact_equivalence_and_provider_mapping_blocked'
  ) {
    throw new FaceAuthorityValidationError('FR-49 authority identity/state drift.');
  }
  if (
    authority.upstreamFR33Ref !== FR33_REF ||
    authority.upstreamFR35Ref !== FR35_REF ||
    authority.upstreamFR36Ref !== FR36_REF ||
    authority.upstreamFR46Ref !== FR46_REF
  ) {
    throw new FaceAuthorityValidationError('FR-49 upstream authority pin drift.');
  }
  if (
    authority.evidence.length !== EXPECTED_EVIDENCE_IDS.length ||
    !authority.evidence.every((entry, index) => entry.evidenceId === EXPECTED_EVIDENCE_IDS[index])
  ) {
    throw new FaceAuthorityValidationError('FR-49 evidence inventory/order drift.');
  }

  const relation = authority.relation;
  if (
    relation.traditionalAnchorRef !== 'dige' ||
    relation.neutralSurfaceRef !== 'neutral.face.chin_inferior_contour' ||
    relation.neutralPointTarget !== 'soft_tissue_menton' ||
    relation.traditionalDigeChinRegionSupported !== true ||
    relation.traditionalDigeIsSinglePunctualLandmarkEstablished !== false ||
    relation.historicalDigeBoneChinTerminologySupported !== true ||
    relation.softTissueMentonDefinedFromChinContourSupported !== true ||
    relation.softTissueMentonInferiorMidlineOrMidpointSupported !== true ||
    relation.conceptualPointFromContourDefinitionAvailable !== true ||
    relation.fr35NeutralChinContourTargetClassExternallyGrounded !== true ||
    relation.fr35ExactContourGeometryEstablished !== false ||
    relation.pointMaySubstituteForWholeContour !== false ||
    relation.traditionalDigeEqualsSoftTissueMenton !== false ||
    relation.providerFaceOvalEqualsSoftTissueChinContour !== false ||
    relation.fr45InferiorExtremumEqualsSoftTissueMenton !== false
  ) {
    throw new FaceAuthorityValidationError('FR-49 point/contour/traditional relation boundary drift.');
  }
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-49 authority boundary must remain fail-closed.');
  }
  return authority;
}

export function deriveDigeLowerBoundaryResearchCandidateFromIndependentMentonFR49(
  annotation: ChinInferiorIndependentAnnotationFR46V1,
): DigeLowerBoundaryResearchCandidateFR49V1 {
  validateDigeChinContourEvidenceBridgeAuthorityFR49();
  if (
    annotation.targetName !== 'soft_tissue_menton' ||
    annotation.providerOutputVisibleDuringAnnotation !== false ||
    annotation.annotationFrozenBeforeProviderScoring !== true ||
    annotation.subjectId.trim().length === 0 ||
    annotation.captureId.trim().length === 0 ||
    annotation.annotatorId.trim().length === 0
  ) {
    throw new FaceAuthorityValidationError('FR-49 requires a frozen provider-blind independent soft-tissue Menton observation.');
  }
  validateNormalizedCoordinate(annotation.x, 'annotation.x');
  validateNormalizedCoordinate(annotation.y, 'annotation.y');

  return Object.freeze({
    algorithmRef: 'algorithm.research.dige_lower_boundary.from_independent_soft_tissue_menton.fr49@0.1.0' as const,
    traditionalAnchorRef: 'dige' as const,
    neutralPointTarget: 'soft_tissue_menton' as const,
    coordinateFrame: 'normalized_image_2d' as const,
    verticalCoordinateY: annotation.y,
    candidateState: 'neutral_research_boundary_candidate_not_traditional_equivalence' as const,
    derivedFromProviderOutput: false as const,
    providerMappingAuthorized: false as const,
    traditionalDigePointEquivalenceAuthorized: false as const,
    fr35WholeContourSubstitutionAuthorized: false as const,
    productionGeometryAuthorized: false as const,
  });
}

export function assessDigeChinContourEvidenceBridgeReadinessFR49(): DigeChinContourEvidenceBridgeReadinessFR49V1 {
  validateDigeChinContourEvidenceBridgeAuthorityFR49();
  return Object.freeze({
    traditionalDigeChinRegionEvidenceReady: true as const,
    lowerThreeDivisionsDigeTerminationEvidenceReady: true as const,
    softTissueMentonContourDefinitionReady: true as const,
    conceptualPointFromContourRelationReady: true as const,
    neutralResearchBoundaryCandidateAlgorithmReady: true as const,
    fr35ExactContourGeometryReady: false as const,
    providerMappingReady: false as const,
    traditionalDigePointEquivalenceReady: false as const,
    fr36ProductionVerticalReferenceReady: false as const,
    productionGeometryReady: false as const,
    nextRequiredEvidence: Object.freeze([
      'A provider-independent reviewed geometry for the full neutral.face.chin_inferior_contour curve, not merely its Menton point.',
      'Independent validation of any provider candidate against frozen soft-tissue Menton observations before provider mapping.',
      'A separate operationalization decision establishing how the traditional chin-region 地閣 becomes a punctual vertical boundary, without claiming textual identity.',
      'Three-division source-variant selection remains separate and unresolved under FR-33.',
    ]),
  });
}

export function assertDigeChinContourEvidenceBridgeReadyForProductionFR49(): never {
  validateDigeChinContourEvidenceBridgeAuthorityFR49();
  throw new FaceAuthorityValidationError(
    'FR-49 supports a dige/chin region bridge and a Menton-from-chin-contour research relation only; exact traditional-point equivalence, provider mapping, FR-35 full-contour geometry, and production Three Divisions remain blocked.',
  );
}
