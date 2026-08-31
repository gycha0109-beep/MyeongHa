import {
  CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52,
  deriveMentonSideEndpointCandidatePairFR52,
  validateChinContourEndpointCandidateAuthorityFR52,
  type MentonSideEndpointCandidatePairFR52V1,
} from './chin-contour-endpoint-candidate-admission-fr52.js';
import type { IndependentCentralChinScaffoldAnnotationFR50V1 } from './provider-independent-chin-contour-geometry-fr50.js';
import {
  CENTRAL_CHIN_REFERENCE_TRACE_AUTHORITY_FR54,
  freezeCentralChinInferiorReferenceTraceFR54,
  validateCentralChinInferiorReferenceTraceAnnotationFR54,
  validateCentralChinReferenceTraceAuthorityFR54,
  type CentralChinInferiorReferenceTraceAnnotationFR54V1,
  type FrozenCentralChinInferiorReferenceTraceFR54V1,
} from './central-chin-reference-trace-protocol-fr54.js';
import type { NormalizedPoint2DV1 } from './neutral-observation-schema-fr15.js';
import { FaceAuthorityValidationError } from './validation.js';

export type RawPolylineProjectionLocationFR55V1 =
  | 'segment_start_vertex'
  | 'segment_interior'
  | 'segment_end_vertex';

export interface RawPolylineSegmentProjectionFR55V1 {
  readonly rawSegmentStartIndex: number;
  readonly rawSegmentEndIndex: number;
  readonly projectionParameterT: number;
  readonly projectionLocation: RawPolylineProjectionLocationFR55V1;
  readonly closestPoint: NormalizedPoint2DV1;
  readonly squaredDistance: number;
  readonly distance: number;
  readonly segmentIndexMeaning: 'raw_draw_order_segment_index_not_anatomical_side';
  readonly coverageBoundaryContactMeansAnatomicalEndpoint: false;
}

export interface MentonSideCandidateTraceDistanceFR55V1 {
  readonly candidateRole: 'left_menton_side' | 'right_menton_side';
  readonly candidatePoint: NormalizedPoint2DV1;
  readonly minimumSquaredDistance: number;
  readonly minimumDistance: number;
  readonly closestProjections: readonly RawPolylineSegmentProjectionFR55V1[];
  readonly exactTiePolicy: 'preserve_all_exact_minimum_segment_projections';
  readonly interpretation: 'raw_geometric_distance_only_no_membership_or_endpoint_inference';
  readonly membershipDecision: null;
  readonly endpointDecision: null;
}

export interface MidlineAnchorOffsetFR55V1 {
  readonly referenceTraceMenton: NormalizedPoint2DV1;
  readonly candidateAnnotationMenton: NormalizedPoint2DV1;
  readonly squaredDistance: number;
  readonly distance: number;
  readonly interpretation: 'cross_annotation_midline_anchor_offset_only_no_agreement_threshold';
  readonly agreementDecision: null;
}

export interface MentonSideReferenceTraceRawJoinFR55V1 {
  readonly algorithmRef: 'algorithm.research.chin_inferior.menton_side_reference_trace_raw_join.fr55@0.1.0';
  readonly subjectId: string;
  readonly captureId: string;
  readonly referenceTraceAnnotatorId: string;
  readonly mentonSideAnnotatorId: string;
  readonly identityBinding: 'subject_and_capture_exact_match_verified';
  readonly selectedScopeClass: 'central_inferior_soft_tissue_chin_boundary';
  readonly referenceTraceRole: FrozenCentralChinInferiorReferenceTraceFR54V1['referenceRole'];
  readonly referenceTraceAlgorithmRef: FrozenCentralChinInferiorReferenceTraceFR54V1['algorithmRef'];
  readonly candidateAlgorithmRef: MentonSideEndpointCandidatePairFR52V1['algorithmRef'];
  readonly coordinateFrame: 'normalized_image_2d';
  readonly leftCandidate: MentonSideCandidateTraceDistanceFR55V1;
  readonly rightCandidate: MentonSideCandidateTraceDistanceFR55V1;
  readonly midlineAnchorOffset: MidlineAnchorOffsetFR55V1;
  readonly resultState: 'threshold_free_raw_geometry_join_no_membership_or_endpoint_decision';
  readonly membershipThreshold: null;
  readonly anchorAgreementTolerance: null;
  readonly endpointSelectionRule: null;
  readonly candidateEquivalenceTolerance: null;
  readonly referenceStandardAuthorized: false;
  readonly endpointAuthority: false;
  readonly providerMappingAuthorized: false;
  readonly traditionalDigeEquivalenceAuthorized: false;
  readonly empiricalValidationAuthorized: false;
  readonly productionGeometryAuthorized: false;
}

export interface MentonSideReferenceTraceRawJoinAuthorityFR55V1 {
  readonly schemaVersion: 'fr55-v1';
  readonly authorityRef: 'authority.face.menton_side_reference_trace_raw_join.fr55';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'threshold_free_raw_candidate_to_trace_geometry_join_defined_membership_endpoint_and_production_authority_blocked';
  readonly upstreamFR52Ref: string;
  readonly upstreamFR54Ref: string;
  readonly joinProtocol: {
    readonly protocolRef: 'protocol.face.chin_inferior.menton_side_reference_trace_raw_join.fr55@0.1.0';
    readonly identityBinding: 'subject_and_capture_exact_match_required';
    readonly referenceTraceSource: 'fr54_provider_blind_frozen_raw_polyline';
    readonly candidateSource: 'fr52_bilateral_menton_side_derived_from_fr50_independent_annotation';
    readonly geometryOperation: 'closest_point_on_raw_polyline_by_clamped_euclidean_segment_projection';
    readonly distanceUnit: 'normalized_image_coordinate_euclidean_distance';
    readonly exactTiePolicy: 'preserve_all_exact_minimum_segment_projections';
    readonly traceSegmentIndexMeaning: 'raw_draw_order_segment_index_not_anatomical_side';
    readonly referenceCoverageEndpointMeaning: 'annotation_coverage_only_not_anatomical_endpoint';
    readonly freezeOrderSource: 'fr54_contract_attestation_not_cryptographic_chronology_proof';
    readonly membershipThreshold: null;
    readonly anchorAgreementTolerance: null;
    readonly endpointSelectionRule: null;
    readonly candidateEquivalenceTolerance: null;
    readonly interpolationMethod: null;
    readonly smoothingMethod: null;
    readonly empiricalAcceptanceCriterion: null;
  };
  readonly authorityBoundary: {
    readonly rawDistanceMeansTraceMembership: false;
    readonly zeroDistanceMeansFR35Endpoint: false;
    readonly nearestProjectionMeansAnatomicalEndpoint: false;
    readonly rawSegmentIndexMeansAnatomicalLaterality: false;
    readonly traceCoverageBoundaryMeansAnatomicalEndpoint: false;
    readonly candidateLeftRightLabelDefinesTraceDirection: false;
    readonly crossAnnotationMentonOffsetMeansAgreementOrDisagreement: false;
    readonly normalizedImageDistanceMeansPhysicalDistance: false;
    readonly exactTieResolutionMayUseIndexPriority: false;
    readonly fr54ReferenceTraceMeansReviewedReferenceStandard: false;
    readonly attestedFreezeOrderMeansCryptographicChronologyProof: false;
    readonly raw2DJoinMeansCanonicalImage2DExtraction: false;
    readonly mentonSideMeansExactFR35Endpoint: false;
    readonly providerMappingAuthorized: false;
    readonly traditionalDigeEquivalenceAuthorized: false;
    readonly empiricalValidationAuthorized: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
    readonly productionGeometryAuthorized: false;
  };
}

export interface MentonSideReferenceTraceRawJoinReadinessFR55V1 {
  readonly sameCaptureIdentityBindingReady: true;
  readonly thresholdFreeDistanceComputationReady: true;
  readonly exactTiePreservationReady: true;
  readonly rawJoinResearchExecutionReady: true;
  readonly realReferenceTraceDatasetPresent: false;
  readonly realPairedJoinDatasetPresent: false;
  readonly reviewedReferenceStandardReady: false;
  readonly membershipDecisionReady: false;
  readonly endpointSelectionReady: false;
  readonly providerMappingReady: false;
  readonly productionGeometryReady: false;
  readonly nextRequiredEvidence: readonly string[];
}

const FR52_REF = `${CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52.authorityRef}@${CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52.authorityVersion}`;
const FR54_REF = `${CENTRAL_CHIN_REFERENCE_TRACE_AUTHORITY_FR54.authorityRef}@${CENTRAL_CHIN_REFERENCE_TRACE_AUTHORITY_FR54.authorityVersion}`;

export const MENTON_SIDE_REFERENCE_TRACE_RAW_JOIN_AUTHORITY_FR55: MentonSideReferenceTraceRawJoinAuthorityFR55V1 = Object.freeze({
  schemaVersion: 'fr55-v1' as const,
  authorityRef: 'authority.face.menton_side_reference_trace_raw_join.fr55' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'threshold_free_raw_candidate_to_trace_geometry_join_defined_membership_endpoint_and_production_authority_blocked' as const,
  upstreamFR52Ref: FR52_REF,
  upstreamFR54Ref: FR54_REF,
  joinProtocol: Object.freeze({
    protocolRef: 'protocol.face.chin_inferior.menton_side_reference_trace_raw_join.fr55@0.1.0' as const,
    identityBinding: 'subject_and_capture_exact_match_required' as const,
    referenceTraceSource: 'fr54_provider_blind_frozen_raw_polyline' as const,
    candidateSource: 'fr52_bilateral_menton_side_derived_from_fr50_independent_annotation' as const,
    geometryOperation: 'closest_point_on_raw_polyline_by_clamped_euclidean_segment_projection' as const,
    distanceUnit: 'normalized_image_coordinate_euclidean_distance' as const,
    exactTiePolicy: 'preserve_all_exact_minimum_segment_projections' as const,
    traceSegmentIndexMeaning: 'raw_draw_order_segment_index_not_anatomical_side' as const,
    referenceCoverageEndpointMeaning: 'annotation_coverage_only_not_anatomical_endpoint' as const,
    freezeOrderSource: 'fr54_contract_attestation_not_cryptographic_chronology_proof' as const,
    membershipThreshold: null,
    anchorAgreementTolerance: null,
    endpointSelectionRule: null,
    candidateEquivalenceTolerance: null,
    interpolationMethod: null,
    smoothingMethod: null,
    empiricalAcceptanceCriterion: null,
  }),
  authorityBoundary: Object.freeze({
    rawDistanceMeansTraceMembership: false as const,
    zeroDistanceMeansFR35Endpoint: false as const,
    nearestProjectionMeansAnatomicalEndpoint: false as const,
    rawSegmentIndexMeansAnatomicalLaterality: false as const,
    traceCoverageBoundaryMeansAnatomicalEndpoint: false as const,
    candidateLeftRightLabelDefinesTraceDirection: false as const,
    crossAnnotationMentonOffsetMeansAgreementOrDisagreement: false as const,
    normalizedImageDistanceMeansPhysicalDistance: false as const,
    exactTieResolutionMayUseIndexPriority: false as const,
    fr54ReferenceTraceMeansReviewedReferenceStandard: false as const,
    attestedFreezeOrderMeansCryptographicChronologyProof: false as const,
    raw2DJoinMeansCanonicalImage2DExtraction: false as const,
    mentonSideMeansExactFR35Endpoint: false as const,
    providerMappingAuthorized: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    empiricalValidationAuthorized: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
    productionGeometryAuthorized: false as const,
  }),
});

function squaredDistance(a: NormalizedPoint2DV1, b: NormalizedPoint2DV1): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function projectPointToRawSegment(
  point: NormalizedPoint2DV1,
  start: NormalizedPoint2DV1,
  end: NormalizedPoint2DV1,
  rawSegmentStartIndex: number,
): RawPolylineSegmentProjectionFR55V1 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!(lengthSquared > 0) || !Number.isFinite(lengthSquared)) {
    throw new FaceAuthorityValidationError('FR-55 cannot project onto a degenerate raw trace segment.');
  }
  const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const projectionParameterT = Math.max(0, Math.min(1, rawT));
  const closestPoint = Object.freeze({
    x: start.x + projectionParameterT * dx,
    y: start.y + projectionParameterT * dy,
  });
  const projectionSquaredDistance = squaredDistance(point, closestPoint);
  return Object.freeze({
    rawSegmentStartIndex,
    rawSegmentEndIndex: rawSegmentStartIndex + 1,
    projectionParameterT,
    projectionLocation: projectionParameterT === 0
      ? 'segment_start_vertex' as const
      : projectionParameterT === 1
        ? 'segment_end_vertex' as const
        : 'segment_interior' as const,
    closestPoint,
    squaredDistance: projectionSquaredDistance,
    distance: Math.sqrt(projectionSquaredDistance),
    segmentIndexMeaning: 'raw_draw_order_segment_index_not_anatomical_side' as const,
    coverageBoundaryContactMeansAnatomicalEndpoint: false as const,
  });
}

function candidateDistanceToRawPolyline(
  candidateRole: 'left_menton_side' | 'right_menton_side',
  candidatePoint: NormalizedPoint2DV1,
  tracePoints: readonly NormalizedPoint2DV1[],
): MentonSideCandidateTraceDistanceFR55V1 {
  if (tracePoints.length < 2) {
    throw new FaceAuthorityValidationError('FR-55 raw trace requires at least one non-degenerate segment.');
  }
  const projections: RawPolylineSegmentProjectionFR55V1[] = [];
  for (let index = 0; index < tracePoints.length - 1; index += 1) {
    projections.push(projectPointToRawSegment(candidatePoint, tracePoints[index]!, tracePoints[index + 1]!, index));
  }
  const minimumSquaredDistance = Math.min(...projections.map((entry) => entry.squaredDistance));
  const closestProjections = Object.freeze(projections.filter((entry) => entry.squaredDistance === minimumSquaredDistance));
  if (closestProjections.length === 0 || !Number.isFinite(minimumSquaredDistance)) {
    throw new FaceAuthorityValidationError('FR-55 failed to derive a finite exact minimum raw-polyline distance.');
  }
  return Object.freeze({
    candidateRole,
    candidatePoint: Object.freeze({ x: candidatePoint.x, y: candidatePoint.y }),
    minimumSquaredDistance,
    minimumDistance: Math.sqrt(minimumSquaredDistance),
    closestProjections,
    exactTiePolicy: 'preserve_all_exact_minimum_segment_projections' as const,
    interpretation: 'raw_geometric_distance_only_no_membership_or_endpoint_inference' as const,
    membershipDecision: null,
    endpointDecision: null,
  });
}

export function validateMentonSideReferenceTraceRawJoinAuthorityFR55(
  authority: MentonSideReferenceTraceRawJoinAuthorityFR55V1 = MENTON_SIDE_REFERENCE_TRACE_RAW_JOIN_AUTHORITY_FR55,
): MentonSideReferenceTraceRawJoinAuthorityFR55V1 {
  const fr52 = validateChinContourEndpointCandidateAuthorityFR52();
  const fr54 = validateCentralChinReferenceTraceAuthorityFR54();
  if (
    fr52.researchAcquisitionPriority !== 'bilateral_menton_side' ||
    fr52.finalEndpointSelection !== null ||
    fr54.selectedScopeClass !== 'central_inferior_soft_tissue_chin_boundary' ||
    !fr54.protocol.candidateBlindRequired ||
    !fr54.protocol.freezeBeforeCandidateAnnotationOrComparisonRequired
  ) {
    throw new FaceAuthorityValidationError('FR-55 requires FR-52 non-final Menton-side candidate state and FR-54 candidate-blind frozen reference-trace protocol.');
  }
  if (
    authority.schemaVersion !== 'fr55-v1' ||
    authority.authorityRef !== 'authority.face.menton_side_reference_trace_raw_join.fr55' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'threshold_free_raw_candidate_to_trace_geometry_join_defined_membership_endpoint_and_production_authority_blocked' ||
    authority.upstreamFR52Ref !== FR52_REF ||
    authority.upstreamFR54Ref !== FR54_REF
  ) {
    throw new FaceAuthorityValidationError('FR-55 authority identity/upstream drift.');
  }
  const protocol = authority.joinProtocol;
  if (
    protocol.identityBinding !== 'subject_and_capture_exact_match_required' ||
    protocol.geometryOperation !== 'closest_point_on_raw_polyline_by_clamped_euclidean_segment_projection' ||
    protocol.distanceUnit !== 'normalized_image_coordinate_euclidean_distance' ||
    protocol.exactTiePolicy !== 'preserve_all_exact_minimum_segment_projections' ||
    protocol.traceSegmentIndexMeaning !== 'raw_draw_order_segment_index_not_anatomical_side' ||
    protocol.referenceCoverageEndpointMeaning !== 'annotation_coverage_only_not_anatomical_endpoint' ||
    protocol.freezeOrderSource !== 'fr54_contract_attestation_not_cryptographic_chronology_proof'
  ) {
    throw new FaceAuthorityValidationError('FR-55 raw join protocol drift.');
  }
  if (
    protocol.membershipThreshold !== null ||
    protocol.anchorAgreementTolerance !== null ||
    protocol.endpointSelectionRule !== null ||
    protocol.candidateEquivalenceTolerance !== null ||
    protocol.interpolationMethod !== null ||
    protocol.smoothingMethod !== null ||
    protocol.empiricalAcceptanceCriterion !== null
  ) {
    throw new FaceAuthorityValidationError('FR-55 must not invent membership, anchor agreement, endpoint, equivalence, interpolation, smoothing, or empirical acceptance rules.');
  }
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-55 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function joinMentonSideCandidatesToReferenceTraceFR55(input: {
  readonly referenceTraceAnnotation: CentralChinInferiorReferenceTraceAnnotationFR54V1;
  readonly mentonSideAnnotation: IndependentCentralChinScaffoldAnnotationFR50V1;
}): MentonSideReferenceTraceRawJoinFR55V1 {
  validateMentonSideReferenceTraceRawJoinAuthorityFR55();
  validateCentralChinInferiorReferenceTraceAnnotationFR54(input.referenceTraceAnnotation);
  if (
    input.referenceTraceAnnotation.subjectId !== input.mentonSideAnnotation.subjectId ||
    input.referenceTraceAnnotation.captureId !== input.mentonSideAnnotation.captureId
  ) {
    throw new FaceAuthorityValidationError('FR-55 requires exact subjectId and captureId identity match before candidate-to-trace geometry may be joined.');
  }
  const frozenTrace = freezeCentralChinInferiorReferenceTraceFR54(input.referenceTraceAnnotation);
  const candidatePair = deriveMentonSideEndpointCandidatePairFR52(input.mentonSideAnnotation);
  const anchorSquaredDistance = squaredDistance(
    frozenTrace.softTissueMentonAnchor,
    candidatePair.inferiorMidlineAnchor,
  );
  return Object.freeze({
    algorithmRef: 'algorithm.research.chin_inferior.menton_side_reference_trace_raw_join.fr55@0.1.0' as const,
    subjectId: input.referenceTraceAnnotation.subjectId,
    captureId: input.referenceTraceAnnotation.captureId,
    referenceTraceAnnotatorId: input.referenceTraceAnnotation.annotatorId,
    mentonSideAnnotatorId: input.mentonSideAnnotation.annotatorId,
    identityBinding: 'subject_and_capture_exact_match_verified' as const,
    selectedScopeClass: 'central_inferior_soft_tissue_chin_boundary' as const,
    referenceTraceRole: frozenTrace.referenceRole,
    referenceTraceAlgorithmRef: frozenTrace.algorithmRef,
    candidateAlgorithmRef: candidatePair.algorithmRef,
    coordinateFrame: 'normalized_image_2d' as const,
    leftCandidate: candidateDistanceToRawPolyline('left_menton_side', candidatePair.leftCandidate, frozenTrace.geometry.points),
    rightCandidate: candidateDistanceToRawPolyline('right_menton_side', candidatePair.rightCandidate, frozenTrace.geometry.points),
    midlineAnchorOffset: Object.freeze({
      referenceTraceMenton: frozenTrace.softTissueMentonAnchor,
      candidateAnnotationMenton: candidatePair.inferiorMidlineAnchor,
      squaredDistance: anchorSquaredDistance,
      distance: Math.sqrt(anchorSquaredDistance),
      interpretation: 'cross_annotation_midline_anchor_offset_only_no_agreement_threshold' as const,
      agreementDecision: null,
    }),
    resultState: 'threshold_free_raw_geometry_join_no_membership_or_endpoint_decision' as const,
    membershipThreshold: null,
    anchorAgreementTolerance: null,
    endpointSelectionRule: null,
    candidateEquivalenceTolerance: null,
    referenceStandardAuthorized: false as const,
    endpointAuthority: false as const,
    providerMappingAuthorized: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    empiricalValidationAuthorized: false as const,
    productionGeometryAuthorized: false as const,
  });
}

export function assessMentonSideReferenceTraceRawJoinReadinessFR55(): MentonSideReferenceTraceRawJoinReadinessFR55V1 {
  validateMentonSideReferenceTraceRawJoinAuthorityFR55();
  return Object.freeze({
    sameCaptureIdentityBindingReady: true as const,
    thresholdFreeDistanceComputationReady: true as const,
    exactTiePreservationReady: true as const,
    rawJoinResearchExecutionReady: true as const,
    realReferenceTraceDatasetPresent: false as const,
    realPairedJoinDatasetPresent: false as const,
    reviewedReferenceStandardReady: false as const,
    membershipDecisionReady: false as const,
    endpointSelectionReady: false as const,
    providerMappingReady: false as const,
    productionGeometryReady: false as const,
    nextRequiredEvidence: Object.freeze([
      'Acquire real FR-54 provider/traditional/candidate-blind raw reference traces and independent FR-50/52 Menton-side annotations on exactly matched subject/capture identities.',
      'Run this raw join and preserve distances, exact ties, segment indices, and midline-anchor offsets without converting them into membership or agreement classes.',
      'Establish any future tolerance or endpoint-selection criterion from independent evidence or preregistered empirical validation rather than from the observed comparison results themselves.',
      'Keep raw trace coverage endpoints, provider topology, traditional 地閣 semantics, and production geometry outside the candidate-distance calculation.',
    ]),
  });
}

export function assertMentonSideReferenceTraceJoinReadyForProductionFR55(): never {
  validateMentonSideReferenceTraceRawJoinAuthorityFR55();
  throw new FaceAuthorityValidationError(
    'FR-55 authorizes threshold-free raw candidate-to-trace geometry only; reference-standard status, membership decisions, endpoint selection, provider mapping, traditional equivalence, empirical validation, and production geometry remain blocked.',
  );
}
