import {
  CHIN_INFERIOR_CONTOUR_SCOPE_AUTHORITY_FR51,
  validateChinInferiorContourScopeAuthorityFR51,
} from './chin-inferior-contour-scope-adjudication-fr51.js';
import {
  CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52,
  validateChinContourEndpointCandidateAuthorityFR52,
} from './chin-contour-endpoint-candidate-admission-fr52.js';
import type { NormalizedPoint2DV1 } from './neutral-observation-schema-fr15.js';
import { FaceAuthorityValidationError } from './validation.js';

export type CentralChinReferenceTraceEvidenceScopeFR54V1 =
  | 'three_dimensional_surface_curve_representation'
  | 'central_chin_landmark_protocol'
  | 'independent_geometric_corroboration_non_equivalent_nomenclature';

export interface CentralChinReferenceTraceEvidenceFR54V1 {
  readonly evidenceId: string;
  readonly title: string;
  readonly year: number;
  readonly sourceRef: string;
  readonly evidenceScope: CentralChinReferenceTraceEvidenceScopeFR54V1;
  readonly reviewedObservation: string;
  readonly supports: {
    readonly facialSurfaceCurveCanBeRepresentedByOrderedPoints: boolean;
    readonly softTissueMentonInferiorMidlineAnchor: boolean;
    readonly bilateralMentonSideCandidateDefinition: boolean;
    readonly independentCentralInferiorChinConstructionCorroborated: boolean;
    readonly centralChinDistinctFromBroaderMandibularAngle: boolean;
  };
  readonly doesNotSupport: readonly string[];
}

export interface CentralChinInferiorReferenceTraceAnnotationFR54V1 {
  readonly schemaVersion: 'fr54-provider-blind-central-chin-reference-trace-v1';
  readonly subjectId: string;
  readonly captureId: string;
  readonly annotatorId: string;
  readonly coordinateFrame: 'normalized_image_2d';
  readonly captureView: 'frontal_en_face';
  readonly expression: 'neutral';
  readonly traceOrder: 'raw_annotator_draw_order';
  readonly tracePoints: readonly NormalizedPoint2DV1[];
  readonly mentonTracePointIndex: number;
  readonly visibleCoverageOnBothSidesOfMentonAttested: true;
  readonly lateralExtentState: 'annotation_coverage_extent_non_authoritative';
  readonly providerOutputVisibleDuringTraceAnnotation: false;
  readonly traditionalLabelVisibleDuringTraceAnnotation: false;
  readonly mentonSideCandidateVisibleDuringTraceAnnotation: false;
  readonly softTissueMentalTubercleCandidateVisibleDuringTraceAnnotation: false;
  readonly traceFrozenBeforeCandidateAnnotationOrComparison: true;
  readonly fullLowerJawlineIntentionallyTraced: false;
  readonly gonionOrOtobasionUsedAsTraceEndpoint: false;
  readonly traceEndpointsAssertedAsFR35Endpoints: false;
}

export interface FrozenCentralChinInferiorReferenceTraceFR54V1 {
  readonly algorithmRef: 'algorithm.research.chin_inferior.provider_blind_reference_trace.fr54@0.1.0';
  readonly selectedScopeClass: 'central_inferior_soft_tissue_chin_boundary';
  readonly referenceRole: 'provider_blind_reference_trace_candidate_not_reference_standard';
  readonly coordinateFrame: 'normalized_image_2d';
  readonly geometry: {
    readonly kind: 'raw_polyline';
    readonly points: readonly NormalizedPoint2DV1[];
  };
  readonly traceOrder: 'raw_annotator_draw_order';
  readonly mentonTracePointIndex: number;
  readonly softTissueMentonAnchor: NormalizedPoint2DV1;
  readonly visibleCoverageOnBothSidesOfMentonAttested: true;
  readonly lateralExtentState: 'annotation_coverage_extent_non_authoritative';
  readonly rawAnnotationOrderPreserved: true;
  readonly endpointAuthority: false;
  readonly denseContinuousCurveAuthority: false;
  readonly mentonSideMembershipScoringAuthorized: false;
  readonly distanceToleranceAuthorized: false;
  readonly providerMappingAuthorized: false;
  readonly traditionalDigeEquivalenceAuthorized: false;
  readonly referenceStandardAuthorized: false;
  readonly productionGeometryAuthorized: false;
}

export interface CentralChinReferenceTraceAuthorityFR54V1 {
  readonly schemaVersion: 'fr54-v1';
  readonly authorityRef: 'authority.face.central_chin_inferior_reference_trace_protocol.fr54';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'provider_blind_reference_trace_protocol_defined_raw_trace_acquisition_allowed_endpoint_membership_scoring_blocked';
  readonly upstreamFR51Ref: string;
  readonly upstreamFR52Ref: string;
  readonly selectedScopeClass: 'central_inferior_soft_tissue_chin_boundary';
  readonly evidence: readonly CentralChinReferenceTraceEvidenceFR54V1[];
  readonly protocol: {
    readonly protocolRef: 'protocol.face.chin_inferior.provider_blind_reference_trace.fr54@0.1.0';
    readonly targetObservation: 'visible_central_inferior_soft_tissue_chin_boundary_segment';
    readonly requiredMidlineAnchor: 'soft_tissue_menton';
    readonly traceRepresentation: 'raw_ordered_polyline';
    readonly traceOrderMeaning: 'raw_annotator_draw_order_preserved_not_anatomical_direction';
    readonly coverageInstruction: 'trace_visible_central_inferior_chin_boundary_segment_with_observed_coverage_on_both_sides_of_menton_without_endpoint_claim';
    readonly firstAndLastPointMeaning: 'annotation_coverage_extent_only_not_anatomical_endpoint';
    readonly candidateBlindRequired: true;
    readonly providerBlindRequired: true;
    readonly traditionalLabelBlindRequired: true;
    readonly freezeBeforeCandidateAnnotationOrComparisonRequired: true;
    readonly fullLowerJawlineContinuationForbidden: true;
    readonly gonionOrOtobasionEndpointUseForbidden: true;
    readonly tracePointDensityRule: null;
    readonly lateralExtentSelectionRule: null;
    readonly endpointSelectionRule: null;
    readonly interpolationMethod: null;
    readonly smoothingMethod: null;
    readonly membershipDistanceTolerance: null;
    readonly minimumAnnotators: null;
    readonly minimumSubjects: null;
    readonly consensusRule: null;
  };
  readonly authorityBoundary: {
    readonly rawDrawOrderMeansAnatomicalLeftRightOrder: false;
    readonly mentonInteriorIndexMeansGeometricSideMembership: false;
    readonly traceCoverageEndpointsMeanFR35Endpoints: false;
    readonly rawPolylineMeansDenseContinuousAnatomicalCurve: false;
    readonly rawTraceMeansReviewedReferenceStandard: false;
    readonly mentonSideCandidateMayInfluenceReferenceTrace: false;
    readonly softTissueMtCandidateMayInfluenceReferenceTrace: false;
    readonly broaderLowerJawlineMaySubstituteForCentralChinTrace: false;
    readonly gonionOrOtobasionMayDefineTraceEndpoint: false;
    readonly providerOutputMayInfluenceReferenceTrace: false;
    readonly traditionalDigeLabelMayInfluenceReferenceTrace: false;
    readonly skominaNomenclatureMeansZupanLandmarkEquivalence: false;
    readonly interpolationAuthorized: false;
    readonly smoothingAuthorized: false;
    readonly membershipDistanceToleranceAvailable: false;
    readonly mentonSideMembershipScoringAuthorized: false;
    readonly providerMappingAuthorized: false;
    readonly traditionalDigeEquivalenceAuthorized: false;
    readonly empiricalValidationAuthorized: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
    readonly productionGeometryAuthorized: false;
  };
}

export interface CentralChinReferenceTraceReadinessFR54V1 {
  readonly anatomicalScopeReady: true;
  readonly providerBlindReferenceTraceProtocolReady: true;
  readonly rawTraceResearchAcquisitionReady: true;
  readonly mentonAnchorContractReady: true;
  readonly candidateSeparationReady: true;
  readonly empiricalReferenceTraceDatasetPresent: false;
  readonly reviewedReferenceStandardReady: false;
  readonly mentonSideMembershipScoringReady: false;
  readonly endpointSelectionReady: false;
  readonly providerMappingReady: false;
  readonly productionGeometryReady: false;
  readonly nextRequiredEvidence: readonly string[];
}

const FR51_REF = `${CHIN_INFERIOR_CONTOUR_SCOPE_AUTHORITY_FR51.authorityRef}@${CHIN_INFERIOR_CONTOUR_SCOPE_AUTHORITY_FR51.authorityVersion}`;
const FR52_REF = `${CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52.authorityRef}@${CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52.authorityVersion}`;

const EVIDENCE: readonly CentralChinReferenceTraceEvidenceFR54V1[] = Object.freeze([
  Object.freeze({
    evidenceId: 'evidence.fr54.windhager_2019_ordered_lower_jawline_curve',
    title: 'Facial aging trajectories: A common shape pattern in male and female faces is disrupted after menopause',
    year: 2019,
    sourceRef: 'DOI:10.1002/ajpa.23878',
    evidenceScope: 'three_dimensional_surface_curve_representation' as const,
    reviewedObservation: 'The 3D morphometric protocol represents lower-jawline facial-surface curves with ordered sliding semilandmarks. FR-54 imports only the representational fact that a facial-surface curve observation can be preserved as an ordered point sequence; the cited lower-jawline scope is broader than FR-51.',
    supports: Object.freeze({
      facialSurfaceCurveCanBeRepresentedByOrderedPoints: true,
      softTissueMentonInferiorMidlineAnchor: false,
      bilateralMentonSideCandidateDefinition: false,
      independentCentralInferiorChinConstructionCorroborated: false,
      centralChinDistinctFromBroaderMandibularAngle: false,
    }),
    doesNotSupport: Object.freeze([
      'Five sliding semilandmarks are study-specific and are not imported as an FR-54 trace density or point-count rule.',
      'The full Otobasion-inferius-to-Menton lower jawline does not define the narrower FR-51 central-inferior chin scope.',
      'This evidence record does not independently establish the FR-54 Menton anchor definition.',
      'Sliding semilandmarks do not authorize interpolation, smoothing, canonical 2D projection, provider mapping, or endpoint selection.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr54.zupan_2022_menton_and_menton_side',
    title: 'An evaluation of three-dimensional facial changes after surgically assisted rapid maxillary expansion (SARME): an observational study',
    year: 2022,
    sourceRef: 'DOI:10.1186/s12903-022-02179-1',
    evidenceScope: 'central_chin_landmark_protocol' as const,
    reviewedObservation: 'The 3D facial-landmark protocol explicitly defines midline Menton as the most inferior midpoint of the chin and bilateral Menton-side as the points where verticals through the corresponding Cheilion reach the lowest point of the chin; bilateral Gonion is defined separately. FR-54 uses the independently authorized Menton anchor while keeping Menton-side hidden as a later candidate.',
    supports: Object.freeze({
      facialSurfaceCurveCanBeRepresentedByOrderedPoints: false,
      softTissueMentonInferiorMidlineAnchor: true,
      bilateralMentonSideCandidateDefinition: true,
      independentCentralInferiorChinConstructionCorroborated: true,
      centralChinDistinctFromBroaderMandibularAngle: true,
    }),
    doesNotSupport: Object.freeze([
      'Menton-side is not used to decide where the FR-54 reference trace begins or ends.',
      'The study does not define a dense central-inferior chin boundary or an FR-35 endpoint rule.',
      'The study does not authorize a canonical-image 2D endpoint extraction rule, MediaPipe mapping, or traditional 地閣 mapping.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr54.skomina_2024_independent_geometric_corroboration',
    title: 'Stereophotometric facial changes in edentulous older adults after rehabilitation with complete dentures',
    year: 2024,
    sourceRef: 'DOI:10.1111/ger.12774; PMID:38988093; PMCID:PMC11870634; Version of Record online 2024-07-10, issue 2025-03',
    evidenceScope: 'independent_geometric_corroboration_non_equivalent_nomenclature' as const,
    reviewedObservation: 'An independent 3D facial-surface protocol defines bilateral Menton (meL/meR) where verticals through Cheilion reach the lowest point of the chin, a midline Gnathion (gn) as the most inferior point on the soft-tissue contour of the chin, and separate bilateral Gonion. This corroborates the central-inferior chin geometric construction family, but FR-54 does not rename Gnathion as Zupan Menton or Menton L/R as Zupan Menton-side.',
    supports: Object.freeze({
      facialSurfaceCurveCanBeRepresentedByOrderedPoints: false,
      softTissueMentonInferiorMidlineAnchor: false,
      bilateralMentonSideCandidateDefinition: false,
      independentCentralInferiorChinConstructionCorroborated: true,
      centralChinDistinctFromBroaderMandibularAngle: true,
    }),
    doesNotSupport: Object.freeze([
      'Study-specific Gnathion terminology is not normalized into Zupan soft-tissue Menton authority.',
      'Study-specific bilateral Menton terminology is not normalized into Zupan Menton-side authority.',
      'Similar geometric descriptions do not establish cross-study landmark-name equivalence.',
      'The bilateral points are not asserted to be FR-35 endpoints, and no empirical distance tolerance is imported.',
    ]),
  }),
]);

export const CENTRAL_CHIN_REFERENCE_TRACE_AUTHORITY_FR54: CentralChinReferenceTraceAuthorityFR54V1 = Object.freeze({
  schemaVersion: 'fr54-v1' as const,
  authorityRef: 'authority.face.central_chin_inferior_reference_trace_protocol.fr54' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'provider_blind_reference_trace_protocol_defined_raw_trace_acquisition_allowed_endpoint_membership_scoring_blocked' as const,
  upstreamFR51Ref: FR51_REF,
  upstreamFR52Ref: FR52_REF,
  selectedScopeClass: 'central_inferior_soft_tissue_chin_boundary' as const,
  evidence: EVIDENCE,
  protocol: Object.freeze({
    protocolRef: 'protocol.face.chin_inferior.provider_blind_reference_trace.fr54@0.1.0' as const,
    targetObservation: 'visible_central_inferior_soft_tissue_chin_boundary_segment' as const,
    requiredMidlineAnchor: 'soft_tissue_menton' as const,
    traceRepresentation: 'raw_ordered_polyline' as const,
    traceOrderMeaning: 'raw_annotator_draw_order_preserved_not_anatomical_direction' as const,
    coverageInstruction: 'trace_visible_central_inferior_chin_boundary_segment_with_observed_coverage_on_both_sides_of_menton_without_endpoint_claim' as const,
    firstAndLastPointMeaning: 'annotation_coverage_extent_only_not_anatomical_endpoint' as const,
    candidateBlindRequired: true as const,
    providerBlindRequired: true as const,
    traditionalLabelBlindRequired: true as const,
    freezeBeforeCandidateAnnotationOrComparisonRequired: true as const,
    fullLowerJawlineContinuationForbidden: true as const,
    gonionOrOtobasionEndpointUseForbidden: true as const,
    tracePointDensityRule: null,
    lateralExtentSelectionRule: null,
    endpointSelectionRule: null,
    interpolationMethod: null,
    smoothingMethod: null,
    membershipDistanceTolerance: null,
    minimumAnnotators: null,
    minimumSubjects: null,
    consensusRule: null,
  }),
  authorityBoundary: Object.freeze({
    rawDrawOrderMeansAnatomicalLeftRightOrder: false as const,
    mentonInteriorIndexMeansGeometricSideMembership: false as const,
    traceCoverageEndpointsMeanFR35Endpoints: false as const,
    rawPolylineMeansDenseContinuousAnatomicalCurve: false as const,
    rawTraceMeansReviewedReferenceStandard: false as const,
    mentonSideCandidateMayInfluenceReferenceTrace: false as const,
    softTissueMtCandidateMayInfluenceReferenceTrace: false as const,
    broaderLowerJawlineMaySubstituteForCentralChinTrace: false as const,
    gonionOrOtobasionMayDefineTraceEndpoint: false as const,
    providerOutputMayInfluenceReferenceTrace: false as const,
    traditionalDigeLabelMayInfluenceReferenceTrace: false as const,
    skominaNomenclatureMeansZupanLandmarkEquivalence: false as const,
    interpolationAuthorized: false as const,
    smoothingAuthorized: false as const,
    membershipDistanceToleranceAvailable: false as const,
    mentonSideMembershipScoringAuthorized: false as const,
    providerMappingAuthorized: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    empiricalValidationAuthorized: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
    productionGeometryAuthorized: false as const,
  }),
});

function validateNormalizedPoint(point: NormalizedPoint2DV1, context: string): void {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < 0 ||
    point.x > 1 ||
    point.y < 0 ||
    point.y > 1
  ) {
    throw new FaceAuthorityValidationError(`FR-54 ${context} must be a finite normalized image point.`);
  }
}

export function validateCentralChinReferenceTraceAuthorityFR54(
  authority: CentralChinReferenceTraceAuthorityFR54V1 = CENTRAL_CHIN_REFERENCE_TRACE_AUTHORITY_FR54,
): CentralChinReferenceTraceAuthorityFR54V1 {
  const fr51 = validateChinInferiorContourScopeAuthorityFR51();
  const fr52 = validateChinContourEndpointCandidateAuthorityFR52();
  if (
    fr51.scopeDecision.selectedScopeClass !== 'central_inferior_soft_tissue_chin_boundary' ||
    fr52.researchAcquisitionPriority !== 'bilateral_menton_side' ||
    fr52.finalEndpointSelection !== null
  ) {
    throw new FaceAuthorityValidationError('FR-54 requires FR-51 central scope and FR-52 non-final Menton-side candidate state.');
  }
  if (
    authority.schemaVersion !== 'fr54-v1' ||
    authority.authorityRef !== 'authority.face.central_chin_inferior_reference_trace_protocol.fr54' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'provider_blind_reference_trace_protocol_defined_raw_trace_acquisition_allowed_endpoint_membership_scoring_blocked' ||
    authority.upstreamFR51Ref !== FR51_REF ||
    authority.upstreamFR52Ref !== FR52_REF ||
    authority.selectedScopeClass !== 'central_inferior_soft_tissue_chin_boundary'
  ) {
    throw new FaceAuthorityValidationError('FR-54 authority identity/upstream/scope drift.');
  }
  if (authority.evidence.length !== 3 || authority.evidence.some((entry) => entry.doesNotSupport.length === 0)) {
    throw new FaceAuthorityValidationError('FR-54 requires three bounded evidence records with explicit limitations.');
  }
  const windhager = authority.evidence.find((entry) => entry.evidenceId === 'evidence.fr54.windhager_2019_ordered_lower_jawline_curve');
  const zupan = authority.evidence.find((entry) => entry.evidenceId === 'evidence.fr54.zupan_2022_menton_and_menton_side');
  const skomina = authority.evidence.find((entry) => entry.evidenceId === 'evidence.fr54.skomina_2024_independent_geometric_corroboration');
  if (
    !windhager || !windhager.supports.facialSurfaceCurveCanBeRepresentedByOrderedPoints ||
    windhager.supports.softTissueMentonInferiorMidlineAnchor || windhager.supports.bilateralMentonSideCandidateDefinition
  ) {
    throw new FaceAuthorityValidationError('FR-54 Windhager evidence must remain curve-representation-only for this slice.');
  }
  if (
    !zupan || !zupan.supports.softTissueMentonInferiorMidlineAnchor || !zupan.supports.bilateralMentonSideCandidateDefinition ||
    !zupan.supports.independentCentralInferiorChinConstructionCorroborated || !zupan.supports.centralChinDistinctFromBroaderMandibularAngle
  ) {
    throw new FaceAuthorityValidationError('FR-54 Zupan evidence must carry the exact Menton/Menton-side definitions used by the upstream authority.');
  }
  if (
    !skomina || skomina.evidenceScope !== 'independent_geometric_corroboration_non_equivalent_nomenclature' ||
    skomina.supports.softTissueMentonInferiorMidlineAnchor || skomina.supports.bilateralMentonSideCandidateDefinition ||
    !skomina.supports.independentCentralInferiorChinConstructionCorroborated || !skomina.supports.centralChinDistinctFromBroaderMandibularAngle
  ) {
    throw new FaceAuthorityValidationError('FR-54 Skomina evidence must remain geometric corroboration without Zupan nomenclature equivalence.');
  }
  const protocol = authority.protocol;
  if (
    protocol.targetObservation !== 'visible_central_inferior_soft_tissue_chin_boundary_segment' ||
    protocol.requiredMidlineAnchor !== 'soft_tissue_menton' ||
    protocol.traceRepresentation !== 'raw_ordered_polyline' ||
    protocol.traceOrderMeaning !== 'raw_annotator_draw_order_preserved_not_anatomical_direction' ||
    protocol.firstAndLastPointMeaning !== 'annotation_coverage_extent_only_not_anatomical_endpoint' ||
    !protocol.candidateBlindRequired ||
    !protocol.providerBlindRequired ||
    !protocol.traditionalLabelBlindRequired ||
    !protocol.freezeBeforeCandidateAnnotationOrComparisonRequired ||
    !protocol.fullLowerJawlineContinuationForbidden ||
    !protocol.gonionOrOtobasionEndpointUseForbidden
  ) {
    throw new FaceAuthorityValidationError('FR-54 reference-trace protocol boundary drift.');
  }
  if (
    protocol.tracePointDensityRule !== null ||
    protocol.lateralExtentSelectionRule !== null ||
    protocol.endpointSelectionRule !== null ||
    protocol.interpolationMethod !== null ||
    protocol.smoothingMethod !== null ||
    protocol.membershipDistanceTolerance !== null ||
    protocol.minimumAnnotators !== null ||
    protocol.minimumSubjects !== null ||
    protocol.consensusRule !== null
  ) {
    throw new FaceAuthorityValidationError('FR-54 must not invent trace density, lateral extent, endpoint, smoothing, tolerance, staffing, or consensus rules.');
  }
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-54 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function validateCentralChinInferiorReferenceTraceAnnotationFR54(
  annotation: CentralChinInferiorReferenceTraceAnnotationFR54V1,
): CentralChinInferiorReferenceTraceAnnotationFR54V1 {
  validateCentralChinReferenceTraceAuthorityFR54();
  if (!annotation.subjectId.trim() || !annotation.captureId.trim() || !annotation.annotatorId.trim()) {
    throw new FaceAuthorityValidationError('FR-54 subject/capture/annotator identifiers must be non-empty.');
  }
  if (
    annotation.schemaVersion !== 'fr54-provider-blind-central-chin-reference-trace-v1' ||
    annotation.coordinateFrame !== 'normalized_image_2d' ||
    annotation.captureView !== 'frontal_en_face' ||
    annotation.expression !== 'neutral' ||
    annotation.traceOrder !== 'raw_annotator_draw_order' ||
    annotation.visibleCoverageOnBothSidesOfMentonAttested !== true ||
    annotation.lateralExtentState !== 'annotation_coverage_extent_non_authoritative'
  ) {
    throw new FaceAuthorityValidationError('FR-54 annotation identity/capture/trace-state drift.');
  }
  if (annotation.tracePoints.length < 3) {
    throw new FaceAuthorityValidationError('FR-54 raw trace structurally requires an interior Menton vertex and at least two additional observed coverage points.');
  }
  annotation.tracePoints.forEach((point, index) => validateNormalizedPoint(point, `trace point ${index}`));
  if (
    !Number.isInteger(annotation.mentonTracePointIndex) ||
    annotation.mentonTracePointIndex <= 0 ||
    annotation.mentonTracePointIndex >= annotation.tracePoints.length - 1
  ) {
    throw new FaceAuthorityValidationError('FR-54 Menton trace vertex must be an interior raw-polyline point; index position alone does not establish anatomical side membership.');
  }
  for (let index = 1; index < annotation.tracePoints.length; index += 1) {
    const previous = annotation.tracePoints[index - 1]!;
    const current = annotation.tracePoints[index]!;
    if (previous.x === current.x && previous.y === current.y) {
      throw new FaceAuthorityValidationError('FR-54 consecutive raw trace points must not be exact duplicates.');
    }
  }
  if (
    annotation.providerOutputVisibleDuringTraceAnnotation !== false ||
    annotation.traditionalLabelVisibleDuringTraceAnnotation !== false ||
    annotation.mentonSideCandidateVisibleDuringTraceAnnotation !== false ||
    annotation.softTissueMentalTubercleCandidateVisibleDuringTraceAnnotation !== false ||
    annotation.traceFrozenBeforeCandidateAnnotationOrComparison !== true ||
    annotation.fullLowerJawlineIntentionallyTraced !== false ||
    annotation.gonionOrOtobasionUsedAsTraceEndpoint !== false ||
    annotation.traceEndpointsAssertedAsFR35Endpoints !== false
  ) {
    throw new FaceAuthorityValidationError('FR-54 annotation must remain provider/traditional/candidate blind, central-scope-only, frozen, and endpoint-non-authoritative.');
  }
  return annotation;
}

export function freezeCentralChinInferiorReferenceTraceFR54(
  annotation: CentralChinInferiorReferenceTraceAnnotationFR54V1,
): FrozenCentralChinInferiorReferenceTraceFR54V1 {
  validateCentralChinInferiorReferenceTraceAnnotationFR54(annotation);
  const points = Object.freeze(annotation.tracePoints.map((point) => Object.freeze({ x: point.x, y: point.y })));
  return Object.freeze({
    algorithmRef: 'algorithm.research.chin_inferior.provider_blind_reference_trace.fr54@0.1.0' as const,
    selectedScopeClass: 'central_inferior_soft_tissue_chin_boundary' as const,
    referenceRole: 'provider_blind_reference_trace_candidate_not_reference_standard' as const,
    coordinateFrame: 'normalized_image_2d' as const,
    geometry: Object.freeze({ kind: 'raw_polyline' as const, points }),
    traceOrder: 'raw_annotator_draw_order' as const,
    mentonTracePointIndex: annotation.mentonTracePointIndex,
    softTissueMentonAnchor: points[annotation.mentonTracePointIndex]!,
    visibleCoverageOnBothSidesOfMentonAttested: true as const,
    lateralExtentState: 'annotation_coverage_extent_non_authoritative' as const,
    rawAnnotationOrderPreserved: true as const,
    endpointAuthority: false as const,
    denseContinuousCurveAuthority: false as const,
    mentonSideMembershipScoringAuthorized: false as const,
    distanceToleranceAuthorized: false as const,
    providerMappingAuthorized: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    referenceStandardAuthorized: false as const,
    productionGeometryAuthorized: false as const,
  });
}

export function assessCentralChinReferenceTraceReadinessFR54(): CentralChinReferenceTraceReadinessFR54V1 {
  validateCentralChinReferenceTraceAuthorityFR54();
  return Object.freeze({
    anatomicalScopeReady: true as const,
    providerBlindReferenceTraceProtocolReady: true as const,
    rawTraceResearchAcquisitionReady: true as const,
    mentonAnchorContractReady: true as const,
    candidateSeparationReady: true as const,
    empiricalReferenceTraceDatasetPresent: false as const,
    reviewedReferenceStandardReady: false as const,
    mentonSideMembershipScoringReady: false as const,
    endpointSelectionReady: false as const,
    providerMappingReady: false as const,
    productionGeometryReady: false as const,
    nextRequiredEvidence: Object.freeze([
      'Acquire real provider-blind, traditional-label-blind, candidate-blind central-inferior chin raw traces under this contract and freeze them before any Menton-side candidate overlay or comparison.',
      'Preserve raw annotator draw order and annotation coverage extents; do not reinterpret draw order as anatomical laterality or first/last trace points as anatomical FR-35 endpoints.',
      'After real traces exist, define a separate raw candidate-to-trace join that reports geometry without inventing a distance tolerance or membership threshold.',
      'Do not promote any candidate to an FR-35 endpoint until endpoint selection receives independent evidence beyond trace coverage and candidate proximity.',
    ]),
  });
}

export function assertCentralChinReferenceTraceReadyForProductionFR54(): never {
  validateCentralChinReferenceTraceAuthorityFR54();
  throw new FaceAuthorityValidationError(
    'FR-54 defines provider-blind raw reference-trace acquisition only; reviewed reference standard, candidate membership scoring, endpoint selection, provider mapping, traditional equivalence, and production geometry remain blocked.',
  );
}
