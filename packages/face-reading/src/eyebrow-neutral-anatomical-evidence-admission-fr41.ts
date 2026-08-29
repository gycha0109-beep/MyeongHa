import {
  MEDIAPIPE_EYEBROW_SOURCE_RUNTIME_SEMANTIC_GAP_AUTHORITY_FR40,
  validateMediaPipeEyebrowSourceRuntimeSemanticGapAuthorityFR40,
  type EyebrowNeutralRepresentationCandidateClassFR40V1,
} from './mediapipe-eyebrow-source-runtime-semantic-gap-fr40.js';
import { FaceAuthorityValidationError } from './validation.js';

export type EyebrowExternalEvidenceScopeFR41V1 = 'neutral_facial_anthropometry' | 'geometric_morphometrics';
export type EyebrowAdmissionGateStateFR41V1 = 'satisfied' | 'blocked';
export type EyebrowTargetSupportFR41V1 =
  | 'insufficient_for_component_selection'
  | 'partial_boundary_model_support'
  | 'no_direct_centerline_support';

export interface EyebrowExternalNeutralEvidenceFR41V1 {
  readonly evidenceId: string;
  readonly title: string;
  readonly year: number;
  readonly doi: string;
  readonly pmcid: string | null;
  readonly sourceScope: EyebrowExternalEvidenceScopeFR41V1;
  readonly reviewedObservation: string;
  readonly geometryClaims: {
    readonly medialEyebrowEndpointDefined: boolean;
    readonly lateralEyebrowEndpointDefined: boolean;
    readonly upperEyebrowCurveDefined: boolean;
    readonly lowerEyebrowCurveDefined: boolean;
    readonly lowerEyebrowMarginSamplingDefined: boolean;
  };
  readonly providerComponentMappingSupplied: false;
  readonly providerIndexAuthoritySupplied: false;
  readonly traditionalPhysiognomyAuthoritySupplied: false;
  readonly limitations: readonly string[];
}

export interface EyebrowCandidateAdmissionAssessmentFR41V1 {
  readonly candidateClass: EyebrowNeutralRepresentationCandidateClassFR40V1;
  readonly targetSupport: EyebrowTargetSupportFR41V1;
  readonly algorithmRef: null;
  readonly researchCandidateAdmitted: false;
  readonly reviewed: false;
  readonly blockers: readonly string[];
}

export interface EyebrowNeutralAdmissionGateFR41V1 {
  readonly gateId:
    | 'external_neutral_target_model'
    | 'provider_component_role_mapping'
    | 'left_right_mapping_reproducibility'
    | 'component_endpoint_correspondence'
    | 'controlled_capture_protocol'
    | 'pose_stability'
    | 'expression_stability'
    | 'repeated_capture_repeatability'
    | 'calibration_error_thresholds'
    | 'deterministic_algorithm_spec';
  readonly state: EyebrowAdmissionGateStateFR41V1;
  readonly evidenceRefs: readonly string[];
  readonly rationale: string;
}

export interface EyebrowNeutralAnatomicalAdmissionAuthorityFR41V1 {
  readonly schemaVersion: 'fr41-v1';
  readonly authorityRef: 'authority.face.eyebrow_neutral_anatomical_admission.fr41';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'external_target_model_supported_provider_mapping_blocked';
  readonly upstreamFR40Ref: string;
  readonly evidence: readonly EyebrowExternalNeutralEvidenceFR41V1[];
  readonly admissionGates: readonly EyebrowNeutralAdmissionGateFR41V1[];
  readonly candidateAssessments: readonly EyebrowCandidateAdmissionAssessmentFR41V1[];
  readonly authorityBoundary: {
    readonly literatureBoundaryModelMeansMediaPipeComponentMapping: false;
    readonly sourceOrderMeansUpperLowerRole: false;
    readonly providerIndexMeansAnatomicalLandmarkAuthority: false;
    readonly aestheticNormativeStudyMayDefineNeutralGeometry: false;
    readonly upperLowerBoundaryEvidenceMeansClosedRegionAlgorithm: false;
    readonly upperLowerBoundaryEvidenceMeansCenterlineAlgorithm: false;
    readonly researchCandidateAdmissionWithBlockedGateAllowed: false;
    readonly traditionalSemanticProjectionAllowed: false;
    readonly browMidlineAlgorithmAuthorized: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
}

const FR40_REF = `${MEDIAPIPE_EYEBROW_SOURCE_RUNTIME_SEMANTIC_GAP_AUTHORITY_FR40.authorityRef}@${MEDIAPIPE_EYEBROW_SOURCE_RUNTIME_SEMANTIC_GAP_AUTHORITY_FR40.authorityVersion}`;

const EVIDENCE: readonly EyebrowExternalNeutralEvidenceFR41V1[] = Object.freeze([
  Object.freeze({
    evidenceId: 'evidence.fr41.fagertun_2014_3d_landmark_variability',
    title: '3D facial landmarks: Inter-operator variability of manual annotation',
    year: 2014,
    doi: '10.1186/1471-2342-14-35',
    pmcid: 'PMC4205300',
    sourceScope: 'neutral_facial_anthropometry' as const,
    reviewedObservation: 'The study defines medial and lateral eyebrow anatomical landmarks and additional eyebrow pseudo-landmarks, while also measuring operator variability of facial landmark annotation.',
    geometryClaims: Object.freeze({
      medialEyebrowEndpointDefined: true,
      lateralEyebrowEndpointDefined: true,
      upperEyebrowCurveDefined: false,
      lowerEyebrowCurveDefined: false,
      lowerEyebrowMarginSamplingDefined: false,
    }),
    providerComponentMappingSupplied: false as const,
    providerIndexAuthoritySupplied: false as const,
    traditionalPhysiognomyAuthoritySupplied: false as const,
    limitations: Object.freeze([
      'The source defines human-annotated anatomical/pseudo-landmarks, not MediaPipe topology semantics.',
      'Eyebrow landmarks were among the more variable manually annotated facial points, so this source cannot by itself satisfy automated repeatability or calibration gates.',
      'The sampled population was Scandinavian/Caucasian, limiting population-generalized calibration claims.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr41.windhager_2019_upper_lower_brow_rims',
    title: 'Facial aging trajectories: A common shape pattern in male and female faces is disrupted after menopause',
    year: 2019,
    doi: '10.1002/ajpa.23878',
    pmcid: 'PMC6771603',
    sourceScope: 'geometric_morphometrics' as const,
    reviewedObservation: 'The landmark protocol defines Superciliare mediale/laterale and separate sliding landmarks along the lower and upper eyebrow rims.',
    geometryClaims: Object.freeze({
      medialEyebrowEndpointDefined: true,
      lateralEyebrowEndpointDefined: true,
      upperEyebrowCurveDefined: true,
      lowerEyebrowCurveDefined: true,
      lowerEyebrowMarginSamplingDefined: true,
    }),
    providerComponentMappingSupplied: false as const,
    providerIndexAuthoritySupplied: false as const,
    traditionalPhysiognomyAuthoritySupplied: false as const,
    limitations: Object.freeze([
      'The protocol establishes an anatomical target representation, not a mapping from MediaPipe disconnected eyebrow components to upper/lower rims.',
      'Sliding landmark direction/order in the paper is part of its morphometric protocol and must not be transferred to provider serialization order.',
      'The source does not define MyeongHa capture thresholds, runtime repeatability thresholds, or a production algorithm.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr41.kleisner_2025_facedig_brow_curves',
    title: 'FACEDIG automated tool for placing landmarks on facial portraits for geometric morphometrics users',
    year: 2025,
    doi: '10.1038/s41598-025-09714-4',
    pmcid: 'PMC12234795',
    sourceScope: 'geometric_morphometrics' as const,
    reviewedObservation: 'The automated 2D en-face protocol defines Superciliare laterale/mediale plus regularly spaced semilandmarks on separate eyebrow upper and lower curves.',
    geometryClaims: Object.freeze({
      medialEyebrowEndpointDefined: true,
      lateralEyebrowEndpointDefined: true,
      upperEyebrowCurveDefined: true,
      lowerEyebrowCurveDefined: true,
      lowerEyebrowMarginSamplingDefined: true,
    }),
    providerComponentMappingSupplied: false as const,
    providerIndexAuthoritySupplied: false as const,
    traditionalPhysiognomyAuthoritySupplied: false as const,
    limitations: Object.freeze([
      'FaceDig is a separate learned landmarking system; its landmark identities cannot be assigned to MediaPipe indices without an explicit cross-provider validation study.',
      'The paper recommends standardized images and inspection, so its reliability result does not substitute for MyeongHa controlled-capture and runtime calibration evidence.',
      'The source is neutral morphometrics evidence only and carries no traditional physiognomy semantic authority.',
    ]),
  }),
]);

const GATES: readonly EyebrowNeutralAdmissionGateFR41V1[] = Object.freeze([
  Object.freeze({
    gateId: 'external_neutral_target_model' as const,
    state: 'satisfied' as const,
    evidenceRefs: Object.freeze(EVIDENCE.map((entry) => entry.evidenceId)),
    rationale: 'Multiple peer-reviewed facial anthropometry/morphometrics protocols independently support medial/lateral eyebrow endpoints and boundary-curve representations.',
  }),
  Object.freeze({
    gateId: 'provider_component_role_mapping' as const,
    state: 'blocked' as const,
    evidenceRefs: Object.freeze([FR40_REF]),
    rationale: 'Neither exact MediaPipe source nor external literature maps the first/second disconnected provider components to upper/lower anatomical eyebrow boundaries.',
  }),
  Object.freeze({
    gateId: 'left_right_mapping_reproducibility' as const,
    state: 'blocked' as const,
    evidenceRefs: Object.freeze([]),
    rationale: 'No reviewed MyeongHa experiment demonstrates the same provider-component role mapping on both sides across subjects.',
  }),
  Object.freeze({
    gateId: 'component_endpoint_correspondence' as const,
    state: 'blocked' as const,
    evidenceRefs: Object.freeze([]),
    rationale: 'No authority establishes cross-component endpoint or pointwise correspondence for region closure or centerline derivation.',
  }),
  Object.freeze({
    gateId: 'controlled_capture_protocol' as const,
    state: 'blocked' as const,
    evidenceRefs: Object.freeze([]),
    rationale: 'External protocols motivate standardized capture but do not establish the exact MyeongHa eyebrow capture fixture and acceptance criteria.',
  }),
  Object.freeze({ gateId: 'pose_stability' as const, state: 'blocked' as const, evidenceRefs: Object.freeze([]), rationale: 'No reviewed pose-perturbation error distribution exists for the candidate geometry.' }),
  Object.freeze({ gateId: 'expression_stability' as const, state: 'blocked' as const, evidenceRefs: Object.freeze([]), rationale: 'No reviewed neutral-versus-expression perturbation evidence exists for the candidate geometry.' }),
  Object.freeze({ gateId: 'repeated_capture_repeatability' as const, state: 'blocked' as const, evidenceRefs: Object.freeze([]), rationale: 'No repeated-capture error distribution or acceptance threshold exists for the candidate geometry.' }),
  Object.freeze({ gateId: 'calibration_error_thresholds' as const, state: 'blocked' as const, evidenceRefs: Object.freeze([]), rationale: 'No reviewed fixture set and quantitative error thresholds authorize the candidate geometry.' }),
  Object.freeze({ gateId: 'deterministic_algorithm_spec' as const, state: 'blocked' as const, evidenceRefs: Object.freeze([]), rationale: 'Provider-to-neutral geometry mapping and correspondence remain unresolved, so no deterministic algorithmRef may be assigned.' }),
]);

const ASSESSMENTS: readonly EyebrowCandidateAdmissionAssessmentFR41V1[] = Object.freeze([
  Object.freeze({
    candidateClass: 'single_provider_component_curve' as const,
    targetSupport: 'insufficient_for_component_selection' as const,
    algorithmRef: null,
    researchCandidateAdmitted: false as const,
    reviewed: false as const,
    blockers: Object.freeze(['provider_component_role_mapping', 'left_right_mapping_reproducibility', 'pose_stability', 'expression_stability', 'repeated_capture_repeatability', 'calibration_error_thresholds', 'deterministic_algorithm_spec']),
  }),
  Object.freeze({
    candidateClass: 'paired_provider_components_region' as const,
    targetSupport: 'partial_boundary_model_support' as const,
    algorithmRef: null,
    researchCandidateAdmitted: false as const,
    reviewed: false as const,
    blockers: Object.freeze(['provider_component_role_mapping', 'component_endpoint_correspondence', 'controlled_capture_protocol', 'pose_stability', 'expression_stability', 'repeated_capture_repeatability', 'calibration_error_thresholds', 'deterministic_algorithm_spec']),
  }),
  Object.freeze({
    candidateClass: 'correspondence_derived_centerline' as const,
    targetSupport: 'no_direct_centerline_support' as const,
    algorithmRef: null,
    researchCandidateAdmitted: false as const,
    reviewed: false as const,
    blockers: Object.freeze(['provider_component_role_mapping', 'component_endpoint_correspondence', 'controlled_capture_protocol', 'pose_stability', 'expression_stability', 'repeated_capture_repeatability', 'calibration_error_thresholds', 'deterministic_algorithm_spec']),
  }),
]);

export const EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41: EyebrowNeutralAnatomicalAdmissionAuthorityFR41V1 = Object.freeze({
  schemaVersion: 'fr41-v1' as const,
  authorityRef: 'authority.face.eyebrow_neutral_anatomical_admission.fr41' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'external_target_model_supported_provider_mapping_blocked' as const,
  upstreamFR40Ref: FR40_REF,
  evidence: EVIDENCE,
  admissionGates: GATES,
  candidateAssessments: ASSESSMENTS,
  authorityBoundary: Object.freeze({
    literatureBoundaryModelMeansMediaPipeComponentMapping: false as const,
    sourceOrderMeansUpperLowerRole: false as const,
    providerIndexMeansAnatomicalLandmarkAuthority: false as const,
    aestheticNormativeStudyMayDefineNeutralGeometry: false as const,
    upperLowerBoundaryEvidenceMeansClosedRegionAlgorithm: false as const,
    upperLowerBoundaryEvidenceMeansCenterlineAlgorithm: false as const,
    researchCandidateAdmissionWithBlockedGateAllowed: false as const,
    traditionalSemanticProjectionAllowed: false as const,
    browMidlineAlgorithmAuthorized: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
});

export interface EyebrowNeutralAnatomicalAdmissionReadinessFR41V1 {
  readonly externalTargetModelEvidenceReady: true;
  readonly providerComponentRoleMappingReady: false;
  readonly allAdmissionGatesSatisfied: false;
  readonly admittedResearchCandidates: 0;
  readonly reviewedCandidates: 0;
  readonly nextRequiredGate: 'provider_component_role_mapping';
  readonly productionGeometryReady: false;
}

export function validateEyebrowNeutralAnatomicalAdmissionAuthorityFR41(
  authority: EyebrowNeutralAnatomicalAdmissionAuthorityFR41V1 = EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41,
): EyebrowNeutralAnatomicalAdmissionAuthorityFR41V1 {
  validateMediaPipeEyebrowSourceRuntimeSemanticGapAuthorityFR40();
  if (authority.schemaVersion !== 'fr41-v1' || authority.authorityRef !== 'authority.face.eyebrow_neutral_anatomical_admission.fr41' || authority.authorityVersion !== '0.1.0' || authority.authorityState !== 'external_target_model_supported_provider_mapping_blocked' || authority.upstreamFR40Ref !== FR40_REF) {
    throw new FaceAuthorityValidationError('FR-41 identity/upstream authority drift.');
  }
  if (authority.evidence.length !== 3) throw new FaceAuthorityValidationError('FR-41 must preserve exactly three reviewed external neutral evidence records.');
  const evidenceIds = new Set<string>();
  for (const evidence of authority.evidence) {
    if (evidenceIds.has(evidence.evidenceId) || evidence.title.trim().length === 0 || evidence.doi.trim().length === 0 || evidence.limitations.length === 0) {
      throw new FaceAuthorityValidationError(`FR-41 invalid or duplicate external evidence: ${evidence.evidenceId}`);
    }
    evidenceIds.add(evidence.evidenceId);
    if (evidence.providerComponentMappingSupplied !== false || evidence.providerIndexAuthoritySupplied !== false || evidence.traditionalPhysiognomyAuthoritySupplied !== false) {
      throw new FaceAuthorityValidationError(`FR-41 external literature cannot acquire provider/traditional authority: ${evidence.evidenceId}`);
    }
  }
  if (!authority.evidence.some((evidence) => evidence.geometryClaims.upperEyebrowCurveDefined && evidence.geometryClaims.lowerEyebrowCurveDefined && evidence.geometryClaims.medialEyebrowEndpointDefined && evidence.geometryClaims.lateralEyebrowEndpointDefined)) {
    throw new FaceAuthorityValidationError('FR-41 external target model requires reviewed upper/lower eyebrow boundary evidence with medial/lateral endpoints.');
  }
  const expectedGateIds = GATES.map((gate) => gate.gateId);
  if (authority.admissionGates.length !== expectedGateIds.length || authority.admissionGates.some((gate, index) => gate.gateId !== expectedGateIds[index])) {
    throw new FaceAuthorityValidationError('FR-41 admission gate set/order drift.');
  }
  const externalGate = authority.admissionGates[0];
  if (externalGate?.state !== 'satisfied' || authority.admissionGates.slice(1).some((gate) => gate.state !== 'blocked')) {
    throw new FaceAuthorityValidationError('FR-41 only the external neutral target-model gate may be satisfied in this slice.');
  }
  const fr40CandidateClasses = MEDIAPIPE_EYEBROW_SOURCE_RUNTIME_SEMANTIC_GAP_AUTHORITY_FR40.candidates.map((candidate) => candidate.candidateClass);
  if (authority.candidateAssessments.length !== fr40CandidateClasses.length) throw new FaceAuthorityValidationError('FR-41 candidate assessment coverage drift.');
  authority.candidateAssessments.forEach((assessment, index) => {
    if (assessment.candidateClass !== fr40CandidateClasses[index] || assessment.algorithmRef !== null || assessment.researchCandidateAdmitted !== false || assessment.reviewed !== false || assessment.blockers.length === 0) {
      throw new FaceAuthorityValidationError(`FR-41 candidate cannot be admitted while required gates are blocked: ${assessment.candidateClass}`);
    }
  });
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) throw new FaceAuthorityValidationError('FR-41 authority boundary must remain fully fail-closed.');
  return authority;
}

export function assessEyebrowNeutralAnatomicalAdmissionReadinessFR41(
  authority: EyebrowNeutralAnatomicalAdmissionAuthorityFR41V1 = EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41,
): EyebrowNeutralAnatomicalAdmissionReadinessFR41V1 {
  validateEyebrowNeutralAnatomicalAdmissionAuthorityFR41(authority);
  if (authority.admissionGates.every((gate) => gate.state === 'satisfied')) throw new FaceAuthorityValidationError('FR-41 unexpectedly reports all admission gates satisfied.');
  if (authority.candidateAssessments.some((candidate) => candidate.researchCandidateAdmitted || candidate.reviewed || candidate.algorithmRef !== null)) throw new FaceAuthorityValidationError('FR-41 cannot promote an eyebrow candidate in this slice.');
  return Object.freeze({
    externalTargetModelEvidenceReady: true as const,
    providerComponentRoleMappingReady: false as const,
    allAdmissionGatesSatisfied: false as const,
    admittedResearchCandidates: 0 as const,
    reviewedCandidates: 0 as const,
    nextRequiredGate: 'provider_component_role_mapping' as const,
    productionGeometryReady: false as const,
  });
}

export function assertEyebrowResearchCandidateAdmissionFR41(
  authority: EyebrowNeutralAnatomicalAdmissionAuthorityFR41V1 = EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41,
): never {
  validateEyebrowNeutralAnatomicalAdmissionAuthorityFR41(authority);
  throw new FaceAuthorityValidationError('FR-41 external eyebrow target-model evidence does not map MediaPipe provider components; no research candidate is admitted.');
}
