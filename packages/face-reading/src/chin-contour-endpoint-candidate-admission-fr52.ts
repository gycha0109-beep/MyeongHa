import {
  CHIN_INFERIOR_CONTOUR_SCOPE_AUTHORITY_FR51,
  validateChinInferiorContourScopeAuthorityFR51,
} from './chin-inferior-contour-scope-adjudication-fr51.js';
import {
  deriveCentralChinInferiorSparseScaffoldFR50,
  type IndependentCentralChinScaffoldAnnotationFR50V1,
} from './provider-independent-chin-contour-geometry-fr50.js';
import type { NormalizedPoint2DV1 } from './neutral-observation-schema-fr15.js';
import { FaceAuthorityValidationError } from './validation.js';

export type ChinContourEndpointCandidateKeyFR52V1 =
  | 'bilateral_menton_side'
  | 'bilateral_soft_tissue_mental_tubercle'
  | 'bilateral_mental_tubercle_anterior_reference';

export type ChinContourEndpointEvidenceScopeFR52V1 =
  | 'three_dimensional_soft_tissue_facial_landmark'
  | 'three_dimensional_soft_tissue_chin_region_landmark'
  | 'craniofacial_soft_tissue_thickness_reference_landmark';

export interface ChinContourEndpointEvidenceFR52V1 {
  readonly evidenceId: string;
  readonly candidateKey: ChinContourEndpointCandidateKeyFR52V1;
  readonly title: string;
  readonly year: number;
  readonly sourceRef: string;
  readonly evidenceScope: ChinContourEndpointEvidenceScopeFR52V1;
  readonly reviewedObservation: string;
  readonly supports: {
    readonly bilateralLandmarkAvailable: boolean;
    readonly chinRegionAssociation: boolean;
    readonly explicitOperationalDefinitionAvailable: boolean;
    readonly providerIndependentConstructionAvailable: boolean;
    readonly centralInferiorScopeCompatibility: boolean;
  };
  readonly doesNotSupport: readonly string[];
}

export interface ChinContourEndpointCandidateAdmissionFR52V1 {
  readonly candidateKey: ChinContourEndpointCandidateKeyFR52V1;
  readonly admissionState:
    | 'admitted_reproducible_scope_compatible_research_candidate'
    | 'admitted_chin_region_candidate_exact_surface_definition_missing'
    | 'admitted_non_equivalent_lateral_bulge_reference_only';
  readonly evidenceRefs: readonly string[];
  readonly softTissueSurfaceLandmark: boolean;
  readonly explicitOperationalDefinitionAvailable: boolean;
  readonly scopeCompatibleWithFR51: boolean;
  readonly researchAcquisitionExecutable: boolean;
  readonly exactFR35EndpointEstablished: false;
  readonly traditionalDigeEdgeEstablished: false;
  readonly providerBindingEstablished: false;
  readonly productionEndpointAuthorized: false;
}

export interface MentonSideEndpointCandidatePairFR52V1 {
  readonly algorithmRef: 'algorithm.research.chin_inferior.menton_side_endpoint_candidate_pair.fr52@0.1.0';
  readonly selectedScopeClass: 'central_inferior_soft_tissue_chin_boundary';
  readonly candidateKey: 'bilateral_menton_side';
  readonly leftCandidate: NormalizedPoint2DV1;
  readonly inferiorMidlineAnchor: NormalizedPoint2DV1;
  readonly rightCandidate: NormalizedPoint2DV1;
  readonly sourceDefinitionRef: 'DOI:10.1186/s12903-022-02179-1';
  readonly candidateDefinition: 'vertical_through_each_cheilion_reaches_lowest_point_of_chin';
  readonly acquisitionPriority: 'highest_currently_operationalized_research_candidate';
  readonly exactFR35EndpointPairAuthorized: false;
  readonly denseCurveAuthorized: false;
  readonly providerMappingAuthorized: false;
  readonly traditionalDigeEdgeAuthorized: false;
  readonly productionGeometryAuthorized: false;
}

export interface ChinContourEndpointCandidateAuthorityFR52V1 {
  readonly schemaVersion: 'fr52-v1';
  readonly authorityRef: 'authority.face.chin_contour_endpoint_candidate_admission.fr52';
  readonly authorityVersion: '0.1.1';
  readonly authorityState: 'endpoint_candidate_families_admitted_menton_side_operationally_prioritized_final_endpoint_selection_blocked';
  readonly upstreamFR51Ref: string;
  readonly selectedScopeClass: 'central_inferior_soft_tissue_chin_boundary';
  readonly evidence: readonly ChinContourEndpointEvidenceFR52V1[];
  readonly candidateAdmissions: readonly ChinContourEndpointCandidateAdmissionFR52V1[];
  readonly researchAcquisitionPriority: 'bilateral_menton_side';
  readonly finalEndpointSelection: null;
  readonly endpointSelectionRule: null;
  readonly endpointEquivalenceTolerance: null;
  readonly mentalTubercleSurfaceDefinitionRule: null;
  readonly authorityBoundary: {
    readonly researchPriorityMeansFinalEndpointAuthority: false;
    readonly mentonSideMeansExactFR35Endpoint: false;
    readonly mentonSideMeansTraditionalDigeEdge: false;
    readonly softTissueMentalTubercleMeansMentonSide: false;
    readonly softTissueMentalTubercleMeansExactFR35Endpoint: false;
    readonly mentalTubercleAnteriorMeansSoftTissueMentalTubercle: false;
    readonly mentalTubercleAnteriorMeansInferiorContourEndpoint: false;
    readonly bonyOrFSTTReferenceMeansSurfaceLandmark: false;
    readonly candidateFamilyInterchangeabilityAllowed: false;
    readonly providerFaceOvalEndpointBindingAuthorized: false;
    readonly providerIndexAuthoritySupplied: false;
    readonly exactLateralEndpointsAuthorized: false;
    readonly denseContinuousCurveAuthorized: false;
    readonly interpolationAuthorized: false;
    readonly smoothingAuthorized: false;
    readonly canonicalImage2DExtractionAuthorized: false;
    readonly traditionalSemanticProjectionAllowed: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
    readonly productionGeometryAuthorized: false;
  };
}

export interface ChinContourEndpointCandidateReadinessFR52V1 {
  readonly endpointCandidateEvidenceReady: true;
  readonly mentonSideOperationalResearchCandidateReady: true;
  readonly softTissueMentalTubercleChinRegionCandidateReady: true;
  readonly mentalTubercleAnteriorComparisonReferenceReady: true;
  readonly candidateFamiliesSeparated: true;
  readonly finalEndpointSelectionReady: false;
  readonly exactEndpointRuleReady: false;
  readonly denseContinuousCurveReady: false;
  readonly providerMappingReady: false;
  readonly productionGeometryReady: false;
  readonly nextRequiredEvidence: readonly string[];
}

const FR51_REF = `${CHIN_INFERIOR_CONTOUR_SCOPE_AUTHORITY_FR51.authorityRef}@${CHIN_INFERIOR_CONTOUR_SCOPE_AUTHORITY_FR51.authorityVersion}`;

const EVIDENCE: readonly ChinContourEndpointEvidenceFR52V1[] = Object.freeze([
  Object.freeze({
    evidenceId: 'evidence.fr52.zupan_2022_bilateral_menton_side',
    candidateKey: 'bilateral_menton_side' as const,
    title: 'An evaluation of three-dimensional facial changes after surgically assisted rapid maxillary expansion (SARME): an observational study',
    year: 2022,
    sourceRef: 'DOI:10.1186/s12903-022-02179-1',
    evidenceScope: 'three_dimensional_soft_tissue_facial_landmark' as const,
    reviewedObservation: 'The 3D facial landmark protocol defines left and right Menton-side as the point where the vertical through the corresponding Cheilion reaches the lowest point of the chin. It separately defines midline Menton and bilateral Gonion.',
    supports: Object.freeze({
      bilateralLandmarkAvailable: true,
      chinRegionAssociation: true,
      explicitOperationalDefinitionAvailable: true,
      providerIndependentConstructionAvailable: true,
      centralInferiorScopeCompatibility: true,
    }),
    doesNotSupport: Object.freeze([
      'The study does not state that Menton-side is the anatomical endpoint of MyeongHa FR-35 neutral.face.chin_inferior_contour.',
      'The Cheilion-vertical construction does not establish traditional 地閣 boundaries, MediaPipe topology, interpolation, or a dense contour.',
      'The 3D facial-scan definition is not automatically a validated canonical-image 2D endpoint extraction rule.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr52.zhang_2023_soft_tissue_mental_tubercle_chin_region',
    candidateKey: 'bilateral_soft_tissue_mental_tubercle' as const,
    title: 'Subjective evaluation of facial asymmetry with three-dimensional simulated images among the orthodontists and laypersons: a cross-sectional study',
    year: 2023,
    sourceRef: 'DOI:10.1186/s12903-023-03167-9',
    evidenceScope: 'three_dimensional_soft_tissue_chin_region_landmark' as const,
    reviewedObservation: 'The 3D study labels soft-tissue mental tubercle (Mt) as a manipulated chin landmark while soft-tissue Gonion represents mandible, Cheilion represents lip, and zygion represents cheek. This supports chin-region association only.',
    supports: Object.freeze({
      bilateralLandmarkAvailable: true,
      chinRegionAssociation: true,
      explicitOperationalDefinitionAvailable: false,
      providerIndependentConstructionAvailable: false,
      centralInferiorScopeCompatibility: false,
    }),
    doesNotSupport: Object.freeze([
      'The article does not provide a sufficiently explicit surface-landmark definition for independent reproduction.',
      'Chin-region association does not establish membership on the FR-51 central inferior boundary.',
      'The paper does not state that soft-tissue Mt is an inferior-contour endpoint or that it equals Menton-side.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr52.zhang_2024_soft_tissue_mental_tubercle_wireframe',
    candidateKey: 'bilateral_soft_tissue_mental_tubercle' as const,
    title: 'Preliminary evaluation of chin symmetry with three dimentional soft tissue spatial angle wireframe template',
    year: 2024,
    sourceRef: 'DOI:10.19723/j.issn.1671-167X.2024.01.017',
    evidenceScope: 'three_dimensional_soft_tissue_chin_region_landmark' as const,
    reviewedObservation: 'The 3D facial-scan wireframe study uses soft-tissue mental tubercle (Mt) as a chin-region landmark and obtains landmarks through MeshMonk registration, but the reviewed text does not publish an independently reproducible Mt surface definition.',
    supports: Object.freeze({
      bilateralLandmarkAvailable: true,
      chinRegionAssociation: true,
      explicitOperationalDefinitionAvailable: false,
      providerIndependentConstructionAvailable: false,
      centralInferiorScopeCompatibility: false,
    }),
    doesNotSupport: Object.freeze([
      'Automatic MeshMonk landmark determination does not supply an independent anatomical definition of soft-tissue Mt.',
      'The study does not define Mt as a point on, or endpoint of, the FR-51 inferior chin boundary.',
      'Reported asymmetry recognition performance is not imported as an endpoint-validation threshold.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr52.mental_tubercle_anterior_lateral_bulge_reference',
    candidateKey: 'bilateral_mental_tubercle_anterior_reference' as const,
    title: 'Craniofacial soft-tissue thickness landmark definition lineage — mental tubercle anterior',
    year: 2006,
    sourceRef: 'De Greef et al. landmark lineage; definition corroborated in later FSTT studies',
    evidenceScope: 'craniofacial_soft_tissue_thickness_reference_landmark' as const,
    reviewedObservation: 'Mental-tubercle-anterior is repeatedly defined as the most prominent point on the lateral bulge of the chin mound. This is a reproducible lateral-chin comparison reference, not a demonstrated facial-surface inferior-contour endpoint.',
    supports: Object.freeze({
      bilateralLandmarkAvailable: true,
      chinRegionAssociation: true,
      explicitOperationalDefinitionAvailable: true,
      providerIndependentConstructionAvailable: true,
      centralInferiorScopeCompatibility: false,
    }),
    doesNotSupport: Object.freeze([
      'Mental tubercle anterior is not established as equivalent to the soft-tissue Mt used in 3D facial-asymmetry studies.',
      'A lateral chin-mound prominence is not established as a point on the inferior chin boundary.',
      'The definition does not authorize a canonical 2D surface endpoint or provider binding.',
    ]),
  }),
]);

const ADMISSIONS: readonly ChinContourEndpointCandidateAdmissionFR52V1[] = Object.freeze([
  Object.freeze({
    candidateKey: 'bilateral_menton_side' as const,
    admissionState: 'admitted_reproducible_scope_compatible_research_candidate' as const,
    evidenceRefs: Object.freeze(['evidence.fr52.zupan_2022_bilateral_menton_side']),
    softTissueSurfaceLandmark: true,
    explicitOperationalDefinitionAvailable: true,
    scopeCompatibleWithFR51: true,
    researchAcquisitionExecutable: true,
    exactFR35EndpointEstablished: false as const,
    traditionalDigeEdgeEstablished: false as const,
    providerBindingEstablished: false as const,
    productionEndpointAuthorized: false as const,
  }),
  Object.freeze({
    candidateKey: 'bilateral_soft_tissue_mental_tubercle' as const,
    admissionState: 'admitted_chin_region_candidate_exact_surface_definition_missing' as const,
    evidenceRefs: Object.freeze([
      'evidence.fr52.zhang_2023_soft_tissue_mental_tubercle_chin_region',
      'evidence.fr52.zhang_2024_soft_tissue_mental_tubercle_wireframe',
    ]),
    softTissueSurfaceLandmark: true,
    explicitOperationalDefinitionAvailable: false,
    scopeCompatibleWithFR51: false,
    researchAcquisitionExecutable: false,
    exactFR35EndpointEstablished: false as const,
    traditionalDigeEdgeEstablished: false as const,
    providerBindingEstablished: false as const,
    productionEndpointAuthorized: false as const,
  }),
  Object.freeze({
    candidateKey: 'bilateral_mental_tubercle_anterior_reference' as const,
    admissionState: 'admitted_non_equivalent_lateral_bulge_reference_only' as const,
    evidenceRefs: Object.freeze(['evidence.fr52.mental_tubercle_anterior_lateral_bulge_reference']),
    softTissueSurfaceLandmark: false,
    explicitOperationalDefinitionAvailable: true,
    scopeCompatibleWithFR51: false,
    researchAcquisitionExecutable: false,
    exactFR35EndpointEstablished: false as const,
    traditionalDigeEdgeEstablished: false as const,
    providerBindingEstablished: false as const,
    productionEndpointAuthorized: false as const,
  }),
]);

export const CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52: ChinContourEndpointCandidateAuthorityFR52V1 = Object.freeze({
  schemaVersion: 'fr52-v1' as const,
  authorityRef: 'authority.face.chin_contour_endpoint_candidate_admission.fr52' as const,
  authorityVersion: '0.1.1' as const,
  authorityState: 'endpoint_candidate_families_admitted_menton_side_operationally_prioritized_final_endpoint_selection_blocked' as const,
  upstreamFR51Ref: FR51_REF,
  selectedScopeClass: 'central_inferior_soft_tissue_chin_boundary' as const,
  evidence: EVIDENCE,
  candidateAdmissions: ADMISSIONS,
  researchAcquisitionPriority: 'bilateral_menton_side' as const,
  finalEndpointSelection: null,
  endpointSelectionRule: null,
  endpointEquivalenceTolerance: null,
  mentalTubercleSurfaceDefinitionRule: null,
  authorityBoundary: Object.freeze({
    researchPriorityMeansFinalEndpointAuthority: false as const,
    mentonSideMeansExactFR35Endpoint: false as const,
    mentonSideMeansTraditionalDigeEdge: false as const,
    softTissueMentalTubercleMeansMentonSide: false as const,
    softTissueMentalTubercleMeansExactFR35Endpoint: false as const,
    mentalTubercleAnteriorMeansSoftTissueMentalTubercle: false as const,
    mentalTubercleAnteriorMeansInferiorContourEndpoint: false as const,
    bonyOrFSTTReferenceMeansSurfaceLandmark: false as const,
    candidateFamilyInterchangeabilityAllowed: false as const,
    providerFaceOvalEndpointBindingAuthorized: false as const,
    providerIndexAuthoritySupplied: false as const,
    exactLateralEndpointsAuthorized: false as const,
    denseContinuousCurveAuthorized: false as const,
    interpolationAuthorized: false as const,
    smoothingAuthorized: false as const,
    canonicalImage2DExtractionAuthorized: false as const,
    traditionalSemanticProjectionAllowed: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
    productionGeometryAuthorized: false as const,
  }),
});

const EXPECTED_CANDIDATE_ORDER: readonly ChinContourEndpointCandidateKeyFR52V1[] = Object.freeze([
  'bilateral_menton_side',
  'bilateral_soft_tissue_mental_tubercle',
  'bilateral_mental_tubercle_anterior_reference',
]);

function sameSequence(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

export function validateChinContourEndpointCandidateAuthorityFR52(
  authority: ChinContourEndpointCandidateAuthorityFR52V1 = CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52,
): ChinContourEndpointCandidateAuthorityFR52V1 {
  validateChinInferiorContourScopeAuthorityFR51();
  if (
    authority.schemaVersion !== 'fr52-v1' ||
    authority.authorityRef !== 'authority.face.chin_contour_endpoint_candidate_admission.fr52' ||
    authority.authorityVersion !== '0.1.1' ||
    authority.authorityState !== 'endpoint_candidate_families_admitted_menton_side_operationally_prioritized_final_endpoint_selection_blocked' ||
    authority.upstreamFR51Ref !== FR51_REF ||
    authority.selectedScopeClass !== 'central_inferior_soft_tissue_chin_boundary'
  ) {
    throw new FaceAuthorityValidationError('FR-52 authority identity/upstream/scope drift.');
  }
  if (authority.evidence.length !== 4 || authority.candidateAdmissions.length !== 3) {
    throw new FaceAuthorityValidationError('FR-52 requires four evidence records and three distinct candidate admissions.');
  }
  if (!sameSequence(authority.candidateAdmissions.map((entry) => entry.candidateKey), EXPECTED_CANDIDATE_ORDER)) {
    throw new FaceAuthorityValidationError('FR-52 candidate admission order/coverage drift.');
  }
  if (authority.evidence.some((entry) => entry.doesNotSupport.length === 0)) {
    throw new FaceAuthorityValidationError('FR-52 every evidence record must preserve explicit limitations.');
  }
  const mentonSide = authority.candidateAdmissions[0]!;
  if (
    mentonSide.admissionState !== 'admitted_reproducible_scope_compatible_research_candidate' ||
    mentonSide.softTissueSurfaceLandmark !== true ||
    mentonSide.explicitOperationalDefinitionAvailable !== true ||
    mentonSide.scopeCompatibleWithFR51 !== true ||
    mentonSide.researchAcquisitionExecutable !== true
  ) {
    throw new FaceAuthorityValidationError('FR-52 Menton-side candidate admission drift.');
  }
  const softTissueMt = authority.candidateAdmissions[1]!;
  if (
    softTissueMt.admissionState !== 'admitted_chin_region_candidate_exact_surface_definition_missing' ||
    softTissueMt.softTissueSurfaceLandmark !== true ||
    softTissueMt.explicitOperationalDefinitionAvailable !== false ||
    softTissueMt.scopeCompatibleWithFR51 !== false ||
    softTissueMt.researchAcquisitionExecutable !== false
  ) {
    throw new FaceAuthorityValidationError('FR-52 soft-tissue mental-tubercle candidate boundary drift.');
  }
  const mta = authority.candidateAdmissions[2]!;
  if (
    mta.admissionState !== 'admitted_non_equivalent_lateral_bulge_reference_only' ||
    mta.softTissueSurfaceLandmark !== false ||
    mta.explicitOperationalDefinitionAvailable !== true ||
    mta.scopeCompatibleWithFR51 !== false ||
    mta.researchAcquisitionExecutable !== false
  ) {
    throw new FaceAuthorityValidationError('FR-52 mental-tubercle-anterior comparison-reference boundary drift.');
  }
  const softTissueEvidence = authority.evidence.filter((entry) => entry.candidateKey === 'bilateral_soft_tissue_mental_tubercle');
  if (
    softTissueEvidence.length !== 2 ||
    softTissueEvidence.some((entry) => entry.supports.centralInferiorScopeCompatibility !== false)
  ) {
    throw new FaceAuthorityValidationError('FR-52 soft-tissue Mt chin-region evidence must not imply FR-51 inferior-boundary compatibility.');
  }
  for (const candidate of authority.candidateAdmissions) {
    if (
      candidate.exactFR35EndpointEstablished !== false ||
      candidate.traditionalDigeEdgeEstablished !== false ||
      candidate.providerBindingEstablished !== false ||
      candidate.productionEndpointAuthorized !== false
    ) {
      throw new FaceAuthorityValidationError(`FR-52 candidate must remain non-authoritative: ${candidate.candidateKey}`);
    }
  }
  if (
    authority.researchAcquisitionPriority !== 'bilateral_menton_side' ||
    authority.finalEndpointSelection !== null ||
    authority.endpointSelectionRule !== null ||
    authority.endpointEquivalenceTolerance !== null ||
    authority.mentalTubercleSurfaceDefinitionRule !== null
  ) {
    throw new FaceAuthorityValidationError('FR-52 must keep final endpoint selection/rule/tolerance and Mt surface definition unresolved.');
  }
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-52 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function deriveMentonSideEndpointCandidatePairFR52(
  annotation: IndependentCentralChinScaffoldAnnotationFR50V1,
): MentonSideEndpointCandidatePairFR52V1 {
  validateChinContourEndpointCandidateAuthorityFR52();
  const scaffold = deriveCentralChinInferiorSparseScaffoldFR50(annotation);
  return Object.freeze({
    algorithmRef: 'algorithm.research.chin_inferior.menton_side_endpoint_candidate_pair.fr52@0.1.0' as const,
    selectedScopeClass: 'central_inferior_soft_tissue_chin_boundary' as const,
    candidateKey: 'bilateral_menton_side' as const,
    leftCandidate: scaffold.geometry.points[0],
    inferiorMidlineAnchor: scaffold.geometry.points[1],
    rightCandidate: scaffold.geometry.points[2],
    sourceDefinitionRef: 'DOI:10.1186/s12903-022-02179-1' as const,
    candidateDefinition: 'vertical_through_each_cheilion_reaches_lowest_point_of_chin' as const,
    acquisitionPriority: 'highest_currently_operationalized_research_candidate' as const,
    exactFR35EndpointPairAuthorized: false as const,
    denseCurveAuthorized: false as const,
    providerMappingAuthorized: false as const,
    traditionalDigeEdgeAuthorized: false as const,
    productionGeometryAuthorized: false as const,
  });
}

export function assessChinContourEndpointCandidateReadinessFR52(): ChinContourEndpointCandidateReadinessFR52V1 {
  validateChinContourEndpointCandidateAuthorityFR52();
  return Object.freeze({
    endpointCandidateEvidenceReady: true as const,
    mentonSideOperationalResearchCandidateReady: true as const,
    softTissueMentalTubercleChinRegionCandidateReady: true as const,
    mentalTubercleAnteriorComparisonReferenceReady: true as const,
    candidateFamiliesSeparated: true as const,
    finalEndpointSelectionReady: false as const,
    exactEndpointRuleReady: false as const,
    denseContinuousCurveReady: false as const,
    providerMappingReady: false as const,
    productionGeometryReady: false as const,
    nextRequiredEvidence: Object.freeze([
      'Locate a peer-reviewed or standard anthropometric source that explicitly defines the soft-tissue mental tubercle surface landmark before it can be compared geometrically with Menton-side.',
      'Treat chin-region usage as insufficient for FR-51 inferior-boundary membership until that membership is directly supported.',
      'Acquire provider-blind bilateral Menton-side annotations under the existing Zupan definition and, only if a reproducible soft-tissue Mt definition is found, paired Mt annotations on the same captures.',
      'Keep mental-tubercle-anterior/FSTT landmarks separate from soft-tissue-surface Mt unless an explicit cross-representation mapping is independently validated.',
    ]),
  });
}

export function assertChinContourEndpointsReadyForProductionFR52(): never {
  validateChinContourEndpointCandidateAuthorityFR52();
  throw new FaceAuthorityValidationError(
    'FR-52 admits and separates endpoint candidate families only; final endpoint selection, exact endpoint rule, dense contour, provider mapping, traditional equivalence, and production geometry remain blocked.',
  );
}
