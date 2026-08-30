import {
  THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35,
  validateThreeDivisionsNeutralSurfaceExtensionAuthorityFR35,
} from './three-divisions-neutral-surface-extension-fr35.js';
import {
  DIGE_CHIN_CONTOUR_EVIDENCE_BRIDGE_AUTHORITY_FR49,
  validateDigeChinContourEvidenceBridgeAuthorityFR49,
} from './dige-chin-contour-evidence-bridge-fr49.js';
import type { NormalizedPoint2DV1 } from './neutral-observation-schema-fr15.js';
import { FaceAuthorityValidationError } from './validation.js';

export type ProviderIndependentChinContourEvidenceScopeFR50V1 =
  | 'three_dimensional_surface_curve_semilandmarks'
  | 'three_dimensional_lower_face_contour_sampling'
  | 'three_dimensional_frontal_chin_scaffold';

export interface ProviderIndependentChinContourEvidenceFR50V1 {
  readonly evidenceId: string;
  readonly title: string;
  readonly year: number;
  readonly doi: string;
  readonly pmid: string;
  readonly pmcid: string;
  readonly sourceScope: ProviderIndependentChinContourEvidenceScopeFR50V1;
  readonly reviewedObservation: string;
  readonly supports: {
    readonly lowerJawlineSurfaceCurveRepresentation: boolean;
    readonly lowerFaceSoftTissueContourSampling: boolean;
    readonly bilateralMentonSideLandmarks: boolean;
    readonly midlineMentonOnInferiorChinBoundary: boolean;
  };
  readonly doesNotSupport: readonly string[];
}

export interface ProviderIndependentChinContourGeometryRelationFR50V1 {
  readonly fr35SurfaceRef: 'neutral.face.chin_inferior_contour';
  readonly providerIndependentContourOperationalizationEvidenceAvailable: true;
  readonly lowerJawlineSurfaceCurveRepresentationSupported: true;
  readonly lowerFaceContourSamplingAcrossPredefinedPlanesSupported: true;
  readonly centralChinBilateralScaffoldSupported: true;
  readonly softTissueMentonIsInferiorChinBoundaryMemberSupported: true;
  readonly multipleOperationalizationFamiliesMustRemainDistinct: true;
  readonly fr35ExactChinInferiorContourScopeEstablished: false;
  readonly fr35ExactContourGeometryEstablished: false;
  readonly citedLowerJawlineCurveEqualsFR35ChinInferiorContour: false;
  readonly citedPlaneSampledContourEqualsFR35ChinInferiorContour: false;
  readonly sparseCentralScaffoldEqualsFullContour: false;
  readonly canonicalImage2DProjectionRuleEstablished: false;
  readonly authoritativePointCountEstablished: false;
  readonly authoritativeInterpolationRuleEstablished: false;
  readonly authoritativeSmoothingRuleEstablished: false;
  readonly imageOnlyMandibularBoneReferenceAvailable: false;
}

export interface IndependentCentralChinScaffoldAnnotationFR50V1 {
  readonly schemaVersion: 'fr50-independent-central-chin-scaffold-v1';
  readonly subjectId: string;
  readonly captureId: string;
  readonly annotatorId: string;
  readonly coordinateFrame: 'normalized_image_2d';
  readonly leftCheilion: NormalizedPoint2DV1;
  readonly leftMentonSide: NormalizedPoint2DV1;
  readonly softTissueMenton: NormalizedPoint2DV1;
  readonly rightMentonSide: NormalizedPoint2DV1;
  readonly rightCheilion: NormalizedPoint2DV1;
  readonly providerOutputVisibleDuringAnnotation: false;
  readonly annotationFrozenBeforeProviderScoring: true;
  readonly traditionalLabelVisibleDuringAnnotation: false;
}

export interface CentralChinInferiorSparseScaffoldFR50V1 {
  readonly algorithmRef: 'algorithm.research.chin_inferior.central_sparse_scaffold.fr50@0.1.0';
  readonly coordinateFrame: 'normalized_image_2d';
  readonly geometry: {
    readonly kind: 'curve';
    readonly points: readonly [NormalizedPoint2DV1, NormalizedPoint2DV1, NormalizedPoint2DV1];
  };
  readonly pointOrder: readonly ['left_menton_side', 'soft_tissue_menton', 'right_menton_side'];
  readonly candidateState: 'provider_independent_sparse_central_chin_scaffold_not_full_fr35_contour';
  readonly sourceOperationalizationRef: 'DOI:10.1186/s12903-022-02179-1';
  readonly cheilionVerticalDefinitionPreservedAsAnnotationInstruction: true;
  readonly cheilionVerticalDefinitionMachineVerified: false;
  readonly interpolationAuthorized: false;
  readonly smoothingAuthorized: false;
  readonly fullFR35ContourBindingAuthorized: false;
  readonly providerMappingAuthorized: false;
  readonly traditionalDigeEquivalenceAuthorized: false;
  readonly productionGeometryAuthorized: false;
}

export interface ProviderIndependentChinContourGeometryAuthorityFR50V1 {
  readonly schemaVersion: 'fr50-v1';
  readonly authorityRef: 'authority.face.provider_independent_chin_contour_geometry.fr50';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'provider_independent_contour_operationalizations_supported_exact_fr35_2d_curve_binding_blocked';
  readonly upstreamFR35Ref: string;
  readonly upstreamFR49Ref: string;
  readonly evidence: readonly ProviderIndependentChinContourEvidenceFR50V1[];
  readonly relation: ProviderIndependentChinContourGeometryRelationFR50V1;
  readonly researchScaffoldProtocol: {
    readonly protocolRef: 'protocol.face.chin_inferior.central_sparse_scaffold.fr50@0.1.0';
    readonly sourceDefinitionRef: 'DOI:10.1186/s12903-022-02179-1';
    readonly leftMentonSideDefinition: 'point_where_vertical_through_left_cheilion_reaches_lowest_point_of_chin';
    readonly mentonDefinition: 'most_inferior_midline_point_of_soft_tissue_chin';
    readonly rightMentonSideDefinition: 'point_where_vertical_through_right_cheilion_reaches_lowest_point_of_chin';
    readonly captureView: 'frontal_en_face';
    readonly expression: 'neutral';
    readonly annotatorProviderBlindRequired: true;
    readonly annotationFrozenBeforeProviderScoringRequired: true;
    readonly minimumSubjectCount: null;
    readonly pointAlignmentTolerance: null;
    readonly interpolationMethod: null;
    readonly smoothingMethod: null;
  };
  readonly authorityBoundary: {
    readonly fr35ExactContourScopeSelected: false;
    readonly sparseScaffoldMeansFullContour: false;
    readonly lowerJawlineCurveMeansChinInferiorContour: false;
    readonly boneReferencedContourMeansImageOnlyContour: false;
    readonly threeDimensionalSurfaceMeansCanonicalImage2D: false;
    readonly providerFaceOvalMeansReviewedChinContour: false;
    readonly providerIndex152MeansMenton: false;
    readonly authoritativePointCountAvailable: false;
    readonly interpolationAuthorized: false;
    readonly smoothingAuthorized: false;
    readonly empiricalToleranceAvailable: false;
    readonly traditionalDigeEquivalenceAuthorized: false;
    readonly traditionalSemanticProjectionAllowed: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
    readonly productionGeometryAuthorized: false;
  };
}

export interface ProviderIndependentChinContourGeometryReadinessFR50V1 {
  readonly providerIndependentContourEvidenceReady: true;
  readonly lowerJawlineSurfaceCurveEvidenceReady: true;
  readonly lowerFacePlaneSampledContourEvidenceReady: true;
  readonly centralChinSparseScaffoldProtocolReady: true;
  readonly fr35ExactContourScopeReady: false;
  readonly fr35ExactContourGeometryReady: false;
  readonly canonicalImage2DProjectionReady: false;
  readonly providerMappingReady: false;
  readonly productionGeometryReady: false;
  readonly nextRequiredEvidence: readonly string[];
}

const FR35_REF = `${THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35.authorityRef}@${THREE_DIVISIONS_NEUTRAL_SURFACE_EXTENSION_AUTHORITY_FR35.authorityVersion}`;
const FR49_REF = `${DIGE_CHIN_CONTOUR_EVIDENCE_BRIDGE_AUTHORITY_FR49.authorityRef}@${DIGE_CHIN_CONTOUR_EVIDENCE_BRIDGE_AUTHORITY_FR49.authorityVersion}`;

const EVIDENCE: readonly ProviderIndependentChinContourEvidenceFR50V1[] = Object.freeze([
  Object.freeze({
    evidenceId: 'evidence.fr50.windhager_2019_lower_jawline_curve_semilandmarks',
    title: 'Facial aging trajectories: A common shape pattern in male and female faces is disrupted after menopause',
    year: 2019,
    doi: '10.1002/ajpa.23878',
    pmid: '31189026',
    pmcid: 'PMC6771603',
    sourceScope: 'three_dimensional_surface_curve_semilandmarks' as const,
    reviewedObservation: 'The 3D facial geometric-morphometric scheme represents each lower jawline with five sliding semilandmarks between Otobasion inferius and Menton, placed along the lower border of the mandible. This is direct evidence that a provider-independent facial-surface lower-jawline curve can be operationalized with curve semilandmarks.',
    supports: Object.freeze({
      lowerJawlineSurfaceCurveRepresentation: true,
      lowerFaceSoftTissueContourSampling: false,
      bilateralMentonSideLandmarks: false,
      midlineMentonOnInferiorChinBoundary: true,
    }),
    doesNotSupport: Object.freeze([
      'The study-specific choice of five sliding semilandmarks is not treated as a universal point count for MyeongHa.',
      'The lower jawline from Otobasion inferius to Menton is broader than the unresolved FR-35 chin_inferior_contour scope.',
      'A 3D facial-surface curve does not define a canonical 2D image projection or a provider topology mapping.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr50.zupan_2022_menton_side_scaffold',
    title: 'An evaluation of three-dimensional facial changes after surgically assisted rapid maxillary expansion (SARME): an observational study',
    year: 2022,
    doi: '10.1186/s12903-022-02179-1',
    pmid: '35501780',
    pmcid: 'PMC9063160',
    sourceScope: 'three_dimensional_frontal_chin_scaffold' as const,
    reviewedObservation: 'The 3D facial-scan landmark protocol defines bilateral Menton-side points as the points where the vertical through each Cheilion reaches the lowest point of the chin, alongside a midline Menton defined as the most inferior midpoint of the chin. These landmarks provide a provider-independent sparse central-inferior chin scaffold.',
    supports: Object.freeze({
      lowerJawlineSurfaceCurveRepresentation: false,
      lowerFaceSoftTissueContourSampling: false,
      bilateralMentonSideLandmarks: true,
      midlineMentonOnInferiorChinBoundary: true,
    }),
    doesNotSupport: Object.freeze([
      'Three landmarks do not constitute a reviewed dense or continuous chin contour.',
      'The paper does not prescribe interpolation, smoothing, image-normalized tolerance, or automated extraction.',
      'The paper does not bind these landmarks to MediaPipe FACE_OVAL or to traditional 地閣.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr50.chen_2024_lower_face_soft_tissue_contour_sampling',
    title: 'Facial asymmetry outcome of orthognathic surgery in mild craniofacial microsomia compared to non-syndromic class II asymmetry',
    year: 2024,
    doi: '10.1007/s00784-024-05899-6',
    pmid: '39196436',
    pmcid: 'PMC11358178',
    sourceScope: 'three_dimensional_lower_face_contour_sampling' as const,
    reviewedObservation: 'The lower-face contour protocol creates predefined sagittal planes and assigns bilateral soft-tissue contour points where the soft-tissue surface intersects the mandibular lower border. The cited study therefore demonstrates an explicit provider-independent sampling construction for lower-face soft-tissue contour geometry.',
    supports: Object.freeze({
      lowerJawlineSurfaceCurveRepresentation: false,
      lowerFaceSoftTissueContourSampling: true,
      bilateralMentonSideLandmarks: false,
      midlineMentonOnInferiorChinBoundary: false,
    }),
    doesNotSupport: Object.freeze([
      'The construction depends on skeletal reference landmarks and the mandibular lower border, so it is not an image-only runtime rule.',
      'Its sampled bilateral lower-face contour is not automatically identical to the narrower FR-35 chin_inferior_contour slot.',
      'Its plane locations and sampled point counts are study-specific and are not promoted into MyeongHa thresholds or universal geometry.',
    ]),
  }),
]);

const RELATION: ProviderIndependentChinContourGeometryRelationFR50V1 = Object.freeze({
  fr35SurfaceRef: 'neutral.face.chin_inferior_contour' as const,
  providerIndependentContourOperationalizationEvidenceAvailable: true as const,
  lowerJawlineSurfaceCurveRepresentationSupported: true as const,
  lowerFaceContourSamplingAcrossPredefinedPlanesSupported: true as const,
  centralChinBilateralScaffoldSupported: true as const,
  softTissueMentonIsInferiorChinBoundaryMemberSupported: true as const,
  multipleOperationalizationFamiliesMustRemainDistinct: true as const,
  fr35ExactChinInferiorContourScopeEstablished: false as const,
  fr35ExactContourGeometryEstablished: false as const,
  citedLowerJawlineCurveEqualsFR35ChinInferiorContour: false as const,
  citedPlaneSampledContourEqualsFR35ChinInferiorContour: false as const,
  sparseCentralScaffoldEqualsFullContour: false as const,
  canonicalImage2DProjectionRuleEstablished: false as const,
  authoritativePointCountEstablished: false as const,
  authoritativeInterpolationRuleEstablished: false as const,
  authoritativeSmoothingRuleEstablished: false as const,
  imageOnlyMandibularBoneReferenceAvailable: false as const,
});

export const PROVIDER_INDEPENDENT_CHIN_CONTOUR_GEOMETRY_AUTHORITY_FR50: ProviderIndependentChinContourGeometryAuthorityFR50V1 = Object.freeze({
  schemaVersion: 'fr50-v1' as const,
  authorityRef: 'authority.face.provider_independent_chin_contour_geometry.fr50' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'provider_independent_contour_operationalizations_supported_exact_fr35_2d_curve_binding_blocked' as const,
  upstreamFR35Ref: FR35_REF,
  upstreamFR49Ref: FR49_REF,
  evidence: EVIDENCE,
  relation: RELATION,
  researchScaffoldProtocol: Object.freeze({
    protocolRef: 'protocol.face.chin_inferior.central_sparse_scaffold.fr50@0.1.0' as const,
    sourceDefinitionRef: 'DOI:10.1186/s12903-022-02179-1' as const,
    leftMentonSideDefinition: 'point_where_vertical_through_left_cheilion_reaches_lowest_point_of_chin' as const,
    mentonDefinition: 'most_inferior_midline_point_of_soft_tissue_chin' as const,
    rightMentonSideDefinition: 'point_where_vertical_through_right_cheilion_reaches_lowest_point_of_chin' as const,
    captureView: 'frontal_en_face' as const,
    expression: 'neutral' as const,
    annotatorProviderBlindRequired: true as const,
    annotationFrozenBeforeProviderScoringRequired: true as const,
    minimumSubjectCount: null,
    pointAlignmentTolerance: null,
    interpolationMethod: null,
    smoothingMethod: null,
  }),
  authorityBoundary: Object.freeze({
    fr35ExactContourScopeSelected: false as const,
    sparseScaffoldMeansFullContour: false as const,
    lowerJawlineCurveMeansChinInferiorContour: false as const,
    boneReferencedContourMeansImageOnlyContour: false as const,
    threeDimensionalSurfaceMeansCanonicalImage2D: false as const,
    providerFaceOvalMeansReviewedChinContour: false as const,
    providerIndex152MeansMenton: false as const,
    authoritativePointCountAvailable: false as const,
    interpolationAuthorized: false as const,
    smoothingAuthorized: false as const,
    empiricalToleranceAvailable: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    traditionalSemanticProjectionAllowed: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
    productionGeometryAuthorized: false as const,
  }),
});

function validatePoint(point: NormalizedPoint2DV1, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
    throw new FaceAuthorityValidationError(`FR-50 ${label} must contain finite normalized coordinates in [0, 1].`);
  }
}

function nonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new FaceAuthorityValidationError(`FR-50 ${label} must be non-empty.`);
}

export function validateProviderIndependentChinContourGeometryAuthorityFR50(
  authority: ProviderIndependentChinContourGeometryAuthorityFR50V1 = PROVIDER_INDEPENDENT_CHIN_CONTOUR_GEOMETRY_AUTHORITY_FR50,
): ProviderIndependentChinContourGeometryAuthorityFR50V1 {
  validateThreeDivisionsNeutralSurfaceExtensionAuthorityFR35();
  validateDigeChinContourEvidenceBridgeAuthorityFR49();

  if (
    authority.schemaVersion !== 'fr50-v1' ||
    authority.authorityRef !== 'authority.face.provider_independent_chin_contour_geometry.fr50' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'provider_independent_contour_operationalizations_supported_exact_fr35_2d_curve_binding_blocked'
  ) {
    throw new FaceAuthorityValidationError('FR-50 authority identity/state drift.');
  }
  if (authority.upstreamFR35Ref !== FR35_REF || authority.upstreamFR49Ref !== FR49_REF) {
    throw new FaceAuthorityValidationError('FR-50 upstream authority pin drift.');
  }
  if (authority.evidence.length !== 3) {
    throw new FaceAuthorityValidationError('FR-50 requires exactly three reviewed contour-operationalization evidence records.');
  }
  const relation = authority.relation;
  if (
    relation.providerIndependentContourOperationalizationEvidenceAvailable !== true ||
    relation.lowerJawlineSurfaceCurveRepresentationSupported !== true ||
    relation.lowerFaceContourSamplingAcrossPredefinedPlanesSupported !== true ||
    relation.centralChinBilateralScaffoldSupported !== true ||
    relation.softTissueMentonIsInferiorChinBoundaryMemberSupported !== true ||
    relation.multipleOperationalizationFamiliesMustRemainDistinct !== true ||
    relation.fr35ExactChinInferiorContourScopeEstablished !== false ||
    relation.fr35ExactContourGeometryEstablished !== false ||
    relation.citedLowerJawlineCurveEqualsFR35ChinInferiorContour !== false ||
    relation.citedPlaneSampledContourEqualsFR35ChinInferiorContour !== false ||
    relation.sparseCentralScaffoldEqualsFullContour !== false ||
    relation.canonicalImage2DProjectionRuleEstablished !== false ||
    relation.authoritativePointCountEstablished !== false ||
    relation.authoritativeInterpolationRuleEstablished !== false ||
    relation.authoritativeSmoothingRuleEstablished !== false ||
    relation.imageOnlyMandibularBoneReferenceAvailable !== false
  ) {
    throw new FaceAuthorityValidationError('FR-50 contour-family separation or FR-35 binding boundary drift.');
  }
  const protocol = authority.researchScaffoldProtocol;
  if (
    protocol.minimumSubjectCount !== null ||
    protocol.pointAlignmentTolerance !== null ||
    protocol.interpolationMethod !== null ||
    protocol.smoothingMethod !== null
  ) {
    throw new FaceAuthorityValidationError('FR-50 must not invent sample minimums, alignment tolerances, interpolation, or smoothing methods.');
  }
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-50 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function deriveCentralChinInferiorSparseScaffoldFR50(
  annotation: IndependentCentralChinScaffoldAnnotationFR50V1,
): CentralChinInferiorSparseScaffoldFR50V1 {
  validateProviderIndependentChinContourGeometryAuthorityFR50();
  if (
    annotation.schemaVersion !== 'fr50-independent-central-chin-scaffold-v1' ||
    annotation.coordinateFrame !== 'normalized_image_2d' ||
    annotation.providerOutputVisibleDuringAnnotation !== false ||
    annotation.annotationFrozenBeforeProviderScoring !== true ||
    annotation.traditionalLabelVisibleDuringAnnotation !== false
  ) {
    throw new FaceAuthorityValidationError('FR-50 requires a frozen provider-blind traditional-label-blind independent scaffold annotation.');
  }
  nonEmpty(annotation.subjectId, 'subjectId');
  nonEmpty(annotation.captureId, 'captureId');
  nonEmpty(annotation.annotatorId, 'annotatorId');
  validatePoint(annotation.leftCheilion, 'leftCheilion');
  validatePoint(annotation.leftMentonSide, 'leftMentonSide');
  validatePoint(annotation.softTissueMenton, 'softTissueMenton');
  validatePoint(annotation.rightMentonSide, 'rightMentonSide');
  validatePoint(annotation.rightCheilion, 'rightCheilion');

  const points = Object.freeze([
    Object.freeze({ x: annotation.leftMentonSide.x, y: annotation.leftMentonSide.y }),
    Object.freeze({ x: annotation.softTissueMenton.x, y: annotation.softTissueMenton.y }),
    Object.freeze({ x: annotation.rightMentonSide.x, y: annotation.rightMentonSide.y }),
  ]) as unknown as readonly [NormalizedPoint2DV1, NormalizedPoint2DV1, NormalizedPoint2DV1];

  return Object.freeze({
    algorithmRef: 'algorithm.research.chin_inferior.central_sparse_scaffold.fr50@0.1.0' as const,
    coordinateFrame: 'normalized_image_2d' as const,
    geometry: Object.freeze({ kind: 'curve' as const, points }),
    pointOrder: Object.freeze(['left_menton_side', 'soft_tissue_menton', 'right_menton_side'] as const),
    candidateState: 'provider_independent_sparse_central_chin_scaffold_not_full_fr35_contour' as const,
    sourceOperationalizationRef: 'DOI:10.1186/s12903-022-02179-1' as const,
    cheilionVerticalDefinitionPreservedAsAnnotationInstruction: true as const,
    cheilionVerticalDefinitionMachineVerified: false as const,
    interpolationAuthorized: false as const,
    smoothingAuthorized: false as const,
    fullFR35ContourBindingAuthorized: false as const,
    providerMappingAuthorized: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    productionGeometryAuthorized: false as const,
  });
}

export function assessProviderIndependentChinContourGeometryReadinessFR50(): ProviderIndependentChinContourGeometryReadinessFR50V1 {
  validateProviderIndependentChinContourGeometryAuthorityFR50();
  return Object.freeze({
    providerIndependentContourEvidenceReady: true as const,
    lowerJawlineSurfaceCurveEvidenceReady: true as const,
    lowerFacePlaneSampledContourEvidenceReady: true as const,
    centralChinSparseScaffoldProtocolReady: true as const,
    fr35ExactContourScopeReady: false as const,
    fr35ExactContourGeometryReady: false as const,
    canonicalImage2DProjectionReady: false as const,
    providerMappingReady: false as const,
    productionGeometryReady: false as const,
    nextRequiredEvidence: Object.freeze([
      'Select and justify the exact anatomical scope of FR-35 neutral.face.chin_inferior_contour: central chin inferior boundary versus broader lower jawline; the cited operationalization families cannot be silently collapsed.',
      'Acquire real provider-blind frozen annotations or 3D surface traces for the selected contour scope across multiple captures before empirical geometry authority is considered.',
      'If 3D contour evidence is projected into canonical_image_normalized_2d, define and validate the projection rule independently rather than assuming 3D-to-2D equivalence.',
      'Only after a neutral reference curve/scaffold is frozen may any MediaPipe FACE_OVAL subset or point be scored against it; provider mapping remains separate.',
    ]),
  });
}

export function assertProviderIndependentChinContourGeometryReadyForProductionFR50(): never {
  validateProviderIndependentChinContourGeometryAuthorityFR50();
  throw new FaceAuthorityValidationError(
    'FR-50 establishes provider-independent contour operationalization families and a sparse research scaffold only; exact FR-35 contour scope, dense geometry, canonical 2D projection, provider mapping, and production geometry remain blocked.',
  );
}
