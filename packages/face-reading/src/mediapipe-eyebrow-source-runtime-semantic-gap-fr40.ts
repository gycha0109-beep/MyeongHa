import {
  MEDIAPIPE_PUBLISHED_EYEBROW_COMPONENT_DECOMPOSITION_AUTHORITY_FR39,
  inspectMediaPipePublishedEyebrowComponentsFR39,
  validateMediaPipePublishedEyebrowComponentDecompositionAuthorityFR39,
} from './mediapipe-published-eyebrow-component-decomposition-fr39.js';
import { FaceAuthorityValidationError } from './validation.js';

export type EyebrowSideFR40V1 = 'left' | 'right';
export type EyebrowNeutralRepresentationCandidateClassFR40V1 =
  | 'single_provider_component_curve'
  | 'paired_provider_components_region'
  | 'correspondence_derived_centerline';

export interface MediaPipeExactSourceWitnessFR40V1 {
  readonly repository: 'google-ai-edge/mediapipe';
  readonly ref: 'v0.10.35';
  readonly path: string;
  readonly blobSha: string;
  readonly sourceReviewState: 'exact_tag_source_checked';
}

export interface MediaPipeEyebrowSourceSemanticObservationFR40V1 {
  readonly side: EyebrowSideFR40V1;
  readonly exportedSymbol: 'FACE_LANDMARKS_LEFT_EYEBROW' | 'FACE_LANDMARKS_RIGHT_EYEBROW';
  readonly exactSourceEdgePairs: readonly (readonly [number, number])[];
  readonly sourceCommentScope: 'whole_eyebrow_only';
  readonly publicStaticApiDocScope: 'whole_eyebrow_only';
  readonly componentSpecificNamedSymbolsFound: false;
  readonly componentSpecificAnatomicalLabelsFound: false;
  readonly componentOrderingSemanticsFound: false;
  readonly neutralCurveSemanticsFound: false;
}

export interface EyebrowNeutralRepresentationCandidateFR40V1 {
  readonly candidateId: string;
  readonly candidateClass: EyebrowNeutralRepresentationCandidateClassFR40V1;
  readonly intendedOutputGeometry: 'curve' | 'region';
  readonly algorithmRef: null;
  readonly admissionState:
    | 'blocked_source_component_role_unresolved'
    | 'blocked_region_boundary_correspondence_unresolved'
    | 'blocked_cross_component_correspondence_unresolved';
  readonly requiredEvidenceKeys: readonly string[];
  readonly forbiddenShortcutRefs: readonly string[];
  readonly researchCandidateAdmitted: false;
  readonly reviewed: false;
}

export interface MediaPipeEyebrowSourceRuntimeSemanticGapAuthorityFR40V1 {
  readonly schemaVersion: 'fr40-v1';
  readonly authorityRef: 'authority.face.mediapipe_eyebrow_source_runtime_semantic_gap.fr40';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'exact_source_runtime_attested_component_semantics_absent';
  readonly packageName: '@mediapipe/tasks-vision';
  readonly packageVersion: '0.10.35';
  readonly fr39AuthorityRef: string;
  readonly sourceWitnesses: readonly [
    MediaPipeExactSourceWitnessFR40V1,
    MediaPipeExactSourceWitnessFR40V1,
  ];
  readonly semanticObservations: readonly [
    MediaPipeEyebrowSourceSemanticObservationFR40V1,
    MediaPipeEyebrowSourceSemanticObservationFR40V1,
  ];
  readonly candidates: readonly EyebrowNeutralRepresentationCandidateFR40V1[];
  readonly authorityBoundary: {
    readonly exactSourceEdgePairMeansNeutralLandmarkAuthority: false;
    readonly sourceOrderMeansComponentPriority: false;
    readonly firstFourEdgesMeanPreferredNeutralCurve: false;
    readonly secondFourEdgesMeanPreferredNeutralCurve: false;
    readonly disconnectedPathsMeanUpperLowerBoundaries: false;
    readonly disconnectedPathsMeanInnerOuterBoundaries: false;
    readonly indexwiseCrossComponentCorrespondenceAllowed: false;
    readonly endpointBridgingAllowed: false;
    readonly candidateAdmissionWithoutExternalNeutralEvidenceAllowed: false;
    readonly neutralBrowCurveAlgorithmAuthorized: false;
    readonly browMidlineAlgorithmAuthorized: false;
    readonly productionMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
}

export interface MediaPipeEyebrowSourceRuntimeSemanticGapReadinessFR40V1 {
  readonly exactTagSourceReviewed: true;
  readonly exactSourceRuntimeEdgeAgreement: true;
  readonly wholeEyebrowSymbolSemanticsConfirmed: true;
  readonly componentSpecificSourceSemanticsAvailable: false;
  readonly admittedNeutralRepresentationCandidates: 0;
  readonly neutralBrowCurveReady: false;
  readonly browMidlineReady: false;
  readonly productionMetricReady: false;
  readonly nextEvidenceRequirements: readonly string[];
}

const FR39_REF = `${MEDIAPIPE_PUBLISHED_EYEBROW_COMPONENT_DECOMPOSITION_AUTHORITY_FR39.authorityRef}@${MEDIAPIPE_PUBLISHED_EYEBROW_COMPONENT_DECOMPOSITION_AUTHORITY_FR39.authorityVersion}`;

const CONNECTION_SOURCE: MediaPipeExactSourceWitnessFR40V1 = Object.freeze({
  repository: 'google-ai-edge/mediapipe' as const,
  ref: 'v0.10.35' as const,
  path: 'mediapipe/tasks/web/vision/face_landmarker/face_landmarks_connections.ts',
  blobSha: '644de9d8c7cd90880d92b2393b4913fa93ace927',
  sourceReviewState: 'exact_tag_source_checked' as const,
});

const PUBLIC_API_SOURCE: MediaPipeExactSourceWitnessFR40V1 = Object.freeze({
  repository: 'google-ai-edge/mediapipe' as const,
  ref: 'v0.10.35' as const,
  path: 'mediapipe/tasks/web/vision/face_landmarker/face_landmarker.ts',
  blobSha: '6d9b2f713345fb576301f40c3d520829ab5f23be',
  sourceReviewState: 'exact_tag_source_checked' as const,
});

const LEFT_SOURCE_EDGES = Object.freeze([
  Object.freeze([276, 283] as const),
  Object.freeze([283, 282] as const),
  Object.freeze([282, 295] as const),
  Object.freeze([295, 285] as const),
  Object.freeze([300, 293] as const),
  Object.freeze([293, 334] as const),
  Object.freeze([334, 296] as const),
  Object.freeze([296, 336] as const),
] as const);

const RIGHT_SOURCE_EDGES = Object.freeze([
  Object.freeze([46, 53] as const),
  Object.freeze([53, 52] as const),
  Object.freeze([52, 65] as const),
  Object.freeze([65, 55] as const),
  Object.freeze([70, 63] as const),
  Object.freeze([63, 105] as const),
  Object.freeze([105, 66] as const),
  Object.freeze([66, 107] as const),
] as const);

const OBSERVATIONS: readonly [
  MediaPipeEyebrowSourceSemanticObservationFR40V1,
  MediaPipeEyebrowSourceSemanticObservationFR40V1,
] = Object.freeze([
  Object.freeze({
    side: 'left' as const,
    exportedSymbol: 'FACE_LANDMARKS_LEFT_EYEBROW' as const,
    exactSourceEdgePairs: LEFT_SOURCE_EDGES,
    sourceCommentScope: 'whole_eyebrow_only' as const,
    publicStaticApiDocScope: 'whole_eyebrow_only' as const,
    componentSpecificNamedSymbolsFound: false as const,
    componentSpecificAnatomicalLabelsFound: false as const,
    componentOrderingSemanticsFound: false as const,
    neutralCurveSemanticsFound: false as const,
  }),
  Object.freeze({
    side: 'right' as const,
    exportedSymbol: 'FACE_LANDMARKS_RIGHT_EYEBROW' as const,
    exactSourceEdgePairs: RIGHT_SOURCE_EDGES,
    sourceCommentScope: 'whole_eyebrow_only' as const,
    publicStaticApiDocScope: 'whole_eyebrow_only' as const,
    componentSpecificNamedSymbolsFound: false as const,
    componentSpecificAnatomicalLabelsFound: false as const,
    componentOrderingSemanticsFound: false as const,
    neutralCurveSemanticsFound: false as const,
  }),
]) as unknown as readonly [
  MediaPipeEyebrowSourceSemanticObservationFR40V1,
  MediaPipeEyebrowSourceSemanticObservationFR40V1,
];

const CANDIDATES: readonly EyebrowNeutralRepresentationCandidateFR40V1[] = Object.freeze([
  Object.freeze({
    candidateId: 'candidate.fr40.eyebrow.single_provider_component_curve',
    candidateClass: 'single_provider_component_curve' as const,
    intendedOutputGeometry: 'curve' as const,
    algorithmRef: null,
    admissionState: 'blocked_source_component_role_unresolved' as const,
    requiredEvidenceKeys: Object.freeze([
      'external_neutral_anatomical_role_mapping',
      'component_role_reproducibility_across_left_right',
      'pose_stability',
      'expression_stability',
      'capture_repeatability',
      'calibration_fixture_set',
    ]),
    forbiddenShortcutRefs: Object.freeze(['first_chain_only', 'second_chain_only']),
    researchCandidateAdmitted: false as const,
    reviewed: false as const,
  }),
  Object.freeze({
    candidateId: 'candidate.fr40.eyebrow.paired_provider_components_region',
    candidateClass: 'paired_provider_components_region' as const,
    intendedOutputGeometry: 'region' as const,
    algorithmRef: null,
    admissionState: 'blocked_region_boundary_correspondence_unresolved' as const,
    requiredEvidenceKeys: Object.freeze([
      'external_neutral_anatomical_role_mapping',
      'component_pair_boundary_interpretation',
      'endpoint_correspondence_authority',
      'region_closure_rule',
      'pose_stability',
      'expression_stability',
      'capture_repeatability',
      'calibration_fixture_set',
    ]),
    forbiddenShortcutRefs: Object.freeze(['bridge_disconnected_chains', 'hand_drawn_polygon']),
    researchCandidateAdmitted: false as const,
    reviewed: false as const,
  }),
  Object.freeze({
    candidateId: 'candidate.fr40.eyebrow.correspondence_derived_centerline',
    candidateClass: 'correspondence_derived_centerline' as const,
    intendedOutputGeometry: 'curve' as const,
    algorithmRef: null,
    admissionState: 'blocked_cross_component_correspondence_unresolved' as const,
    requiredEvidenceKeys: Object.freeze([
      'external_neutral_anatomical_role_mapping',
      'cross_component_correspondence_authority',
      'centerline_formula_spec',
      'pose_stability',
      'expression_stability',
      'capture_repeatability',
      'calibration_fixture_set',
    ]),
    forbiddenShortcutRefs: Object.freeze([
      'pointwise_average_without_correspondence_authority',
      'bezier_smoothing',
    ]),
    researchCandidateAdmitted: false as const,
    reviewed: false as const,
  }),
]);

export const MEDIAPIPE_EYEBROW_SOURCE_RUNTIME_SEMANTIC_GAP_AUTHORITY_FR40:
MediaPipeEyebrowSourceRuntimeSemanticGapAuthorityFR40V1 = Object.freeze({
  schemaVersion: 'fr40-v1' as const,
  authorityRef: 'authority.face.mediapipe_eyebrow_source_runtime_semantic_gap.fr40' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'exact_source_runtime_attested_component_semantics_absent' as const,
  packageName: '@mediapipe/tasks-vision' as const,
  packageVersion: '0.10.35' as const,
  fr39AuthorityRef: FR39_REF,
  sourceWitnesses: Object.freeze([CONNECTION_SOURCE, PUBLIC_API_SOURCE]) as unknown as readonly [
    MediaPipeExactSourceWitnessFR40V1,
    MediaPipeExactSourceWitnessFR40V1,
  ],
  semanticObservations: OBSERVATIONS,
  candidates: CANDIDATES,
  authorityBoundary: Object.freeze({
    exactSourceEdgePairMeansNeutralLandmarkAuthority: false as const,
    sourceOrderMeansComponentPriority: false as const,
    firstFourEdgesMeanPreferredNeutralCurve: false as const,
    secondFourEdgesMeanPreferredNeutralCurve: false as const,
    disconnectedPathsMeanUpperLowerBoundaries: false as const,
    disconnectedPathsMeanInnerOuterBoundaries: false as const,
    indexwiseCrossComponentCorrespondenceAllowed: false as const,
    endpointBridgingAllowed: false as const,
    candidateAdmissionWithoutExternalNeutralEvidenceAllowed: false as const,
    neutralBrowCurveAlgorithmAuthorized: false as const,
    browMidlineAlgorithmAuthorized: false as const,
    productionMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
});

interface RuntimeEdgeFR40V1 {
  readonly start: number;
  readonly end: number;
}

function isRuntimeEdge(value: unknown): value is RuntimeEdgeFR40V1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Number.isInteger(record.start) && Number.isInteger(record.end);
}

function assertRuntimeEdgeSequenceMatchesSource(
  runtimeClass: object,
  observation: MediaPipeEyebrowSourceSemanticObservationFR40V1,
): void {
  const runtimeEdges = Reflect.get(runtimeClass, observation.exportedSymbol) as unknown;
  if (!Array.isArray(runtimeEdges) || runtimeEdges.length !== observation.exactSourceEdgePairs.length || !runtimeEdges.every(isRuntimeEdge)) {
    throw new FaceAuthorityValidationError(`FR-40 runtime/source edge surface mismatch: ${observation.exportedSymbol}`);
  }
  runtimeEdges.forEach((edge, index) => {
    const expected = observation.exactSourceEdgePairs[index];
    if (expected === undefined || edge.start !== expected[0] || edge.end !== expected[1]) {
      throw new FaceAuthorityValidationError(
        `FR-40 exact source/runtime edge mismatch for ${observation.exportedSymbol} at ${index}.`,
      );
    }
  });
}

export function inspectMediaPipeEyebrowExactSourceRuntimeAgreementFR40(
  faceLandmarkerRuntimeClass: object,
): Readonly<{
  leftExactAgreement: true;
  rightExactAgreement: true;
  componentSemanticsResolvedByMediaPipeSource: false;
}> {
  inspectMediaPipePublishedEyebrowComponentsFR39(faceLandmarkerRuntimeClass);
  OBSERVATIONS.forEach((observation) => assertRuntimeEdgeSequenceMatchesSource(faceLandmarkerRuntimeClass, observation));
  return Object.freeze({
    leftExactAgreement: true as const,
    rightExactAgreement: true as const,
    componentSemanticsResolvedByMediaPipeSource: false as const,
  });
}

export function validateMediaPipeEyebrowSourceRuntimeSemanticGapAuthorityFR40(
  authority: MediaPipeEyebrowSourceRuntimeSemanticGapAuthorityFR40V1 = MEDIAPIPE_EYEBROW_SOURCE_RUNTIME_SEMANTIC_GAP_AUTHORITY_FR40,
): MediaPipeEyebrowSourceRuntimeSemanticGapAuthorityFR40V1 {
  validateMediaPipePublishedEyebrowComponentDecompositionAuthorityFR39();
  if (
    authority.schemaVersion !== 'fr40-v1' ||
    authority.authorityRef !== 'authority.face.mediapipe_eyebrow_source_runtime_semantic_gap.fr40' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'exact_source_runtime_attested_component_semantics_absent' ||
    authority.packageName !== '@mediapipe/tasks-vision' ||
    authority.packageVersion !== '0.10.35' ||
    authority.fr39AuthorityRef !== FR39_REF
  ) {
    throw new FaceAuthorityValidationError('FR-40 authority identity/package/upstream pin drift.');
  }
  if (authority.sourceWitnesses.length !== 2 ||
      authority.sourceWitnesses[0].blobSha !== '644de9d8c7cd90880d92b2393b4913fa93ace927' ||
      authority.sourceWitnesses[1].blobSha !== '6d9b2f713345fb576301f40c3d520829ab5f23be' ||
      authority.sourceWitnesses.some((witness) => witness.repository !== 'google-ai-edge/mediapipe' ||
        witness.ref !== 'v0.10.35' || witness.sourceReviewState !== 'exact_tag_source_checked')) {
    throw new FaceAuthorityValidationError('FR-40 exact MediaPipe source witness pin drift.');
  }
  if (authority.semanticObservations.length !== 2) {
    throw new FaceAuthorityValidationError('FR-40 must preserve exactly left/right whole-eyebrow source observations.');
  }
  authority.semanticObservations.forEach((observation, index) => {
    const expected = OBSERVATIONS[index]!;
    if (observation.side !== expected.side || observation.exportedSymbol !== expected.exportedSymbol ||
        observation.sourceCommentScope !== 'whole_eyebrow_only' ||
        observation.publicStaticApiDocScope !== 'whole_eyebrow_only' ||
        observation.componentSpecificNamedSymbolsFound !== false ||
        observation.componentSpecificAnatomicalLabelsFound !== false ||
        observation.componentOrderingSemanticsFound !== false || observation.neutralCurveSemanticsFound !== false ||
        observation.exactSourceEdgePairs.length !== 8 ||
        observation.exactSourceEdgePairs.some((pair, edgeIndex) => {
          const expectedPair = expected.exactSourceEdgePairs[edgeIndex];
          return expectedPair === undefined || pair[0] !== expectedPair[0] || pair[1] !== expectedPair[1];
        })) {
      throw new FaceAuthorityValidationError(`FR-40 exact source semantic observation drift: ${observation.side}`);
    }
  });

  const expectedCandidateClasses: readonly EyebrowNeutralRepresentationCandidateClassFR40V1[] = [
    'single_provider_component_curve',
    'paired_provider_components_region',
    'correspondence_derived_centerline',
  ];
  if (authority.candidates.length !== expectedCandidateClasses.length) {
    throw new FaceAuthorityValidationError('FR-40 candidate admission matrix must preserve all three bounded candidate classes.');
  }
  authority.candidates.forEach((candidate, index) => {
    if (candidate.candidateClass !== expectedCandidateClasses[index] || candidate.algorithmRef !== null ||
        candidate.requiredEvidenceKeys.length === 0 || candidate.forbiddenShortcutRefs.length === 0 ||
        candidate.researchCandidateAdmitted !== false || candidate.reviewed !== false) {
      throw new FaceAuthorityValidationError(`FR-40 candidate cannot be promoted without external neutral evidence: ${candidate.candidateId}`);
    }
  });
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-40 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function assessMediaPipeEyebrowSourceRuntimeSemanticGapReadinessFR40(
  runtimeAgreement: Readonly<{
    leftExactAgreement: true;
    rightExactAgreement: true;
    componentSemanticsResolvedByMediaPipeSource: false;
  }>,
  authority: MediaPipeEyebrowSourceRuntimeSemanticGapAuthorityFR40V1 = MEDIAPIPE_EYEBROW_SOURCE_RUNTIME_SEMANTIC_GAP_AUTHORITY_FR40,
): MediaPipeEyebrowSourceRuntimeSemanticGapReadinessFR40V1 {
  validateMediaPipeEyebrowSourceRuntimeSemanticGapAuthorityFR40(authority);
  if (!runtimeAgreement.leftExactAgreement || !runtimeAgreement.rightExactAgreement ||
      runtimeAgreement.componentSemanticsResolvedByMediaPipeSource !== false) {
    throw new FaceAuthorityValidationError('FR-40 source/runtime agreement evidence mismatch.');
  }
  const admitted = authority.candidates.filter((candidate) => candidate.researchCandidateAdmitted).length;
  if (admitted !== 0) throw new FaceAuthorityValidationError('FR-40 cannot admit a neutral brow representation candidate yet.');
  return Object.freeze({
    exactTagSourceReviewed: true as const,
    exactSourceRuntimeEdgeAgreement: true as const,
    wholeEyebrowSymbolSemanticsConfirmed: true as const,
    componentSpecificSourceSemanticsAvailable: false as const,
    admittedNeutralRepresentationCandidates: 0 as const,
    neutralBrowCurveReady: false as const,
    browMidlineReady: false as const,
    productionMetricReady: false as const,
    nextEvidenceRequirements: Object.freeze([
      'External neutral/anatomical evidence must assign a reproducible role to one or both provider components without relying on serialization order.',
      'Any paired-component representation requires explicit endpoint/cross-component correspondence authority rather than indexwise pairing.',
      'Any candidate must define deterministic geometry and pass pose, expression, repeated-capture, left/right, and calibration stability gates.',
      'Only after those gates may FR-17 move a brow derivation from blocked_unresolved to research_candidate; reviewed/production remains a later gate.',
    ]),
  });
}

export function assertEyebrowNeutralRepresentationCandidateAdmittedFR40(
  authority: MediaPipeEyebrowSourceRuntimeSemanticGapAuthorityFR40V1 = MEDIAPIPE_EYEBROW_SOURCE_RUNTIME_SEMANTIC_GAP_AUTHORITY_FR40,
): never {
  validateMediaPipeEyebrowSourceRuntimeSemanticGapAuthorityFR40(authority);
  throw new FaceAuthorityValidationError(
    'FR-40 exact source/runtime agreement does not supply component-level neutral semantics; no eyebrow neutral representation candidate is admitted.',
  );
}
