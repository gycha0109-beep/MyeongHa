import {
  CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52,
  validateChinContourEndpointCandidateAuthorityFR52,
} from './chin-contour-endpoint-candidate-admission-fr52.js';
import { FaceAuthorityValidationError } from './validation.js';

export type SoftTissueMentalTubercleEvidenceScopeFR53V1 =
  | 'three_dimensional_facial_surface_usage'
  | 'adjacent_three_dimensional_facial_surface_catalog'
  | 'craniofacial_fstt_anatomical_reference';

export interface SoftTissueMentalTubercleEvidenceFR53V1 {
  readonly evidenceId: string;
  readonly title: string;
  readonly year: number;
  readonly sourceRef: string;
  readonly evidenceScope: SoftTissueMentalTubercleEvidenceScopeFR53V1;
  readonly reviewedObservation: string;
  readonly supports: {
    readonly softTissueMentalTubercleSurfaceUsage: boolean;
    readonly bilateralChinRegionAssociation: boolean;
    readonly explicitIndependentlyReproducibleSurfaceDefinition: boolean;
    readonly fr51InferiorBoundaryMembership: boolean;
    readonly equivalenceToMentonSide: boolean;
    readonly equivalenceToMentalTubercleAnterior: boolean;
  };
  readonly doesNotSupport: readonly string[];
}

export interface SoftTissueMentalTubercleDefinitionAuthorityFR53V1 {
  readonly schemaVersion: 'fr53-v1';
  readonly authorityRef: 'authority.face.soft_tissue_mental_tubercle_definition_gap.fr53';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'surface_usage_corroborated_explicit_definition_not_found_fr51_scope_compatibility_not_established';
  readonly upstreamFR52Ref: string;
  readonly reviewedEvidence: readonly SoftTissueMentalTubercleEvidenceFR53V1[];
  readonly surfaceUsageCorroborated: true;
  readonly bilateralChinRegionAssociationCorroborated: true;
  readonly explicitSurfaceDefinitionAvailable: false;
  readonly fr51InferiorBoundaryMembershipEstablished: false;
  readonly equivalenceToMentonSideEstablished: false;
  readonly equivalenceToMentalTubercleAnteriorEstablished: false;
  readonly crossRepresentationMappingAvailable: false;
  readonly researchAcquisitionExecutable: false;
  readonly candidateGeometryComparisonExecutable: false;
  readonly softTissueMentalTubercleSurfaceDefinitionRule: null;
  readonly crossRepresentationMappingRule: null;
  readonly endpointSelectionRule: null;
  readonly endpointEquivalenceTolerance: null;
  readonly authorityBoundary: {
    readonly surfaceUsageMeansExplicitDefinition: false;
    readonly chinRegionMeansFR51InferiorBoundaryMembership: false;
    readonly meshMonkOutputMeansAnatomicalDefinition: false;
    readonly faceGenTemplateMeansAnatomicalDefinition: false;
    readonly adjacentMentalTubercleCatalogMeansSoftTissueMt: false;
    readonly mentalTubercleAnteriorMeansSoftTissueMentalTubercle: false;
    readonly bonyMentalTubercleMeansSoftTissueMentalTubercle: false;
    readonly softTissueMentalTubercleMeansMentonSide: false;
    readonly softTissueMentalTubercleMeansExactFR35Endpoint: false;
    readonly providerMappingAuthorized: false;
    readonly canonicalImage2DExtractionAuthorized: false;
    readonly traditionalDigeEquivalenceAuthorized: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
    readonly productionGeometryAuthorized: false;
  };
}

export interface SoftTissueMentalTubercleDefinitionReadinessFR53V1 {
  readonly surfaceUsageEvidenceReady: true;
  readonly bilateralChinRegionAssociationReady: true;
  readonly reviewedCorpusGapAdjudicated: true;
  readonly explicitSurfaceDefinitionReady: false;
  readonly fr51InferiorBoundaryMembershipReady: false;
  readonly crossRepresentationMappingReady: false;
  readonly pairedMtAnnotationReady: false;
  readonly mentonSideComparisonReady: false;
  readonly finalEndpointSelectionReady: false;
  readonly productionGeometryReady: false;
  readonly nextRequiredEvidence: readonly string[];
}

const FR52_REF = `${CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52.authorityRef}@${CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52.authorityVersion}`;

const EVIDENCE: readonly SoftTissueMentalTubercleEvidenceFR53V1[] = Object.freeze([
  Object.freeze({
    evidenceId: 'evidence.fr53.zhang_2023_surface_usage',
    title: 'Subjective evaluation of facial asymmetry with three-dimensional simulated images among the orthodontists and laypersons: a cross-sectional study',
    year: 2023,
    sourceRef: 'DOI:10.1186/s12903-023-03167-9',
    evidenceScope: 'three_dimensional_facial_surface_usage' as const,
    reviewedObservation: 'A FaceGen-based three-dimensional symmetric face uses soft-tissue mental tubercle (Mt) as the manipulated chin landmark and distinguishes it from soft-tissue Gonion, Cheilion and zygion. The article demonstrates surface usage and chin-region association but does not state an independently reproducible anatomical surface rule for locating Mt.',
    supports: Object.freeze({
      softTissueMentalTubercleSurfaceUsage: true,
      bilateralChinRegionAssociation: true,
      explicitIndependentlyReproducibleSurfaceDefinition: false,
      fr51InferiorBoundaryMembership: false,
      equivalenceToMentonSide: false,
      equivalenceToMentalTubercleAnterior: false,
    }),
    doesNotSupport: Object.freeze([
      'FaceGen preset/template semantics are not an anatomical definition authority.',
      'Manipulating an Mt region does not establish that Mt lies on the FR-51 central inferior chin boundary.',
      'The study does not establish Mt == Menton-side or Mt == mental-tubercle-anterior.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr53.lv_2024_meshmonk_surface_usage',
    title: 'Preliminary evaluation of chin symmetry with three dimentional soft tissue spatial angle wireframe template',
    year: 2024,
    sourceRef: 'DOI:10.19723/j.issn.1671-167X.2024.01.017',
    evidenceScope: 'three_dimensional_facial_surface_usage' as const,
    reviewedObservation: 'Bellus 3D facial scans are processed and nine soft-tissue landmarks including Mt are automatically obtained through MeshMonk non-rigid registration. Mt is then displaced in three dimensions for chin-asymmetry analysis. The reviewed article names and uses Mt on a facial-surface pipeline but does not publish a standalone anatomical surface definition that can be reproduced independently of its registration/template process.',
    supports: Object.freeze({
      softTissueMentalTubercleSurfaceUsage: true,
      bilateralChinRegionAssociation: true,
      explicitIndependentlyReproducibleSurfaceDefinition: false,
      fr51InferiorBoundaryMembership: false,
      equivalenceToMentonSide: false,
      equivalenceToMentalTubercleAnterior: false,
    }),
    doesNotSupport: Object.freeze([
      'Automatic MeshMonk landmark output is evidence of a computational landmark pipeline, not an anatomical definition.',
      'The article does not specify Mt as an inferior-boundary point or endpoint.',
      'The article does not supply a provider-independent construction rule for Mt.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr53.langstaff_2016_adjacent_mental_tubercle_surface_catalog',
    title: 'Three-dimensional facial scan catalogue using protrusion of mental tubercle',
    year: 2016,
    sourceRef: 'University of Edinburgh thesis, Langstaff 2016, section 5.2.3 and table 5.3',
    evidenceScope: 'adjacent_three_dimensional_facial_surface_catalog' as const,
    reviewedObservation: 'Thirty-two landmarks are placed on facial scan surfaces, including bilateral protrusion of mental tubercle. This corroborates use of a mental-tubercle-labelled surface landmark, but the source does not call it soft-tissue Mt in the Zhang/Lü construct and the listed description is effectively tautological.',
    supports: Object.freeze({
      softTissueMentalTubercleSurfaceUsage: false,
      bilateralChinRegionAssociation: true,
      explicitIndependentlyReproducibleSurfaceDefinition: false,
      fr51InferiorBoundaryMembership: false,
      equivalenceToMentonSide: false,
      equivalenceToMentalTubercleAnterior: false,
    }),
    doesNotSupport: Object.freeze([
      'A mental-tubercle-labelled facial-surface catalogue entry is not proof that its construct equals soft-tissue Mt from the 3D asymmetry studies.',
      'The tautological wording does not define how to locate the point from neutral anatomy.',
      'The catalogue does not establish FR-51 inferior-boundary membership or equivalence to mental-tubercle-anterior.',
    ]),
  }),
  Object.freeze({
    evidenceId: 'evidence.fr53.mental_tubercle_anterior_fstt_reference',
    title: 'Mental tubercle anterior definition in craniofacial soft-tissue-thickness landmark lineage',
    year: 2006,
    sourceRef: 'De Greef et al. lineage; corroborated by later peer-reviewed FSTT studies',
    evidenceScope: 'craniofacial_fstt_anatomical_reference' as const,
    reviewedObservation: 'Mental tubercle anterior is repeatedly defined as the most prominent point on the lateral bulge of the chin mound. This is the strongest explicit nearby definition found, but the reviewed sources do not prove that this FSTT/anatomical reference is the same construct as the soft-tissue Mt used by the 3D facial-surface studies.',
    supports: Object.freeze({
      softTissueMentalTubercleSurfaceUsage: false,
      bilateralChinRegionAssociation: true,
      explicitIndependentlyReproducibleSurfaceDefinition: false,
      fr51InferiorBoundaryMembership: false,
      equivalenceToMentonSide: false,
      equivalenceToMentalTubercleAnterior: false,
    }),
    doesNotSupport: Object.freeze([
      'The explicit mental-tubercle-anterior definition cannot be copied onto soft-tissue Mt without a cross-representation equivalence source.',
      'Lateral chin-mound prominence is not established as an inferior-boundary point.',
      'The FSTT landmark lineage does not authorize a MediaPipe/provider mapping.',
    ]),
  }),
]);

export const SOFT_TISSUE_MENTAL_TUBERCLE_DEFINITION_AUTHORITY_FR53: SoftTissueMentalTubercleDefinitionAuthorityFR53V1 = Object.freeze({
  schemaVersion: 'fr53-v1' as const,
  authorityRef: 'authority.face.soft_tissue_mental_tubercle_definition_gap.fr53' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'surface_usage_corroborated_explicit_definition_not_found_fr51_scope_compatibility_not_established' as const,
  upstreamFR52Ref: FR52_REF,
  reviewedEvidence: EVIDENCE,
  surfaceUsageCorroborated: true as const,
  bilateralChinRegionAssociationCorroborated: true as const,
  explicitSurfaceDefinitionAvailable: false as const,
  fr51InferiorBoundaryMembershipEstablished: false as const,
  equivalenceToMentonSideEstablished: false as const,
  equivalenceToMentalTubercleAnteriorEstablished: false as const,
  crossRepresentationMappingAvailable: false as const,
  researchAcquisitionExecutable: false as const,
  candidateGeometryComparisonExecutable: false as const,
  softTissueMentalTubercleSurfaceDefinitionRule: null,
  crossRepresentationMappingRule: null,
  endpointSelectionRule: null,
  endpointEquivalenceTolerance: null,
  authorityBoundary: Object.freeze({
    surfaceUsageMeansExplicitDefinition: false as const,
    chinRegionMeansFR51InferiorBoundaryMembership: false as const,
    meshMonkOutputMeansAnatomicalDefinition: false as const,
    faceGenTemplateMeansAnatomicalDefinition: false as const,
    adjacentMentalTubercleCatalogMeansSoftTissueMt: false as const,
    mentalTubercleAnteriorMeansSoftTissueMentalTubercle: false as const,
    bonyMentalTubercleMeansSoftTissueMentalTubercle: false as const,
    softTissueMentalTubercleMeansMentonSide: false as const,
    softTissueMentalTubercleMeansExactFR35Endpoint: false as const,
    providerMappingAuthorized: false as const,
    canonicalImage2DExtractionAuthorized: false as const,
    traditionalDigeEquivalenceAuthorized: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
    productionGeometryAuthorized: false as const,
  }),
});

export function validateSoftTissueMentalTubercleDefinitionAuthorityFR53(
  authority: SoftTissueMentalTubercleDefinitionAuthorityFR53V1 = SOFT_TISSUE_MENTAL_TUBERCLE_DEFINITION_AUTHORITY_FR53,
): SoftTissueMentalTubercleDefinitionAuthorityFR53V1 {
  const fr52 = validateChinContourEndpointCandidateAuthorityFR52();
  const softTissueMt = fr52.candidateAdmissions.find((entry) => entry.candidateKey === 'bilateral_soft_tissue_mental_tubercle');
  if (!softTissueMt || softTissueMt.scopeCompatibleWithFR51 !== false || softTissueMt.researchAcquisitionExecutable !== false) {
    throw new FaceAuthorityValidationError('FR-53 requires corrected FR-52 soft-tissue Mt scope/acquisition boundary.');
  }
  if (
    authority.schemaVersion !== 'fr53-v1' ||
    authority.authorityRef !== 'authority.face.soft_tissue_mental_tubercle_definition_gap.fr53' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'surface_usage_corroborated_explicit_definition_not_found_fr51_scope_compatibility_not_established' ||
    authority.upstreamFR52Ref !== FR52_REF
  ) {
    throw new FaceAuthorityValidationError('FR-53 authority identity/upstream drift.');
  }
  if (authority.reviewedEvidence.length !== 4 || authority.reviewedEvidence.some((entry) => entry.doesNotSupport.length === 0)) {
    throw new FaceAuthorityValidationError('FR-53 requires four bounded evidence records with explicit limitations.');
  }
  const directSurfaceUsage = authority.reviewedEvidence.filter((entry) => entry.supports.softTissueMentalTubercleSurfaceUsage);
  if (
    directSurfaceUsage.length !== 2 ||
    directSurfaceUsage.some((entry) => entry.evidenceScope !== 'three_dimensional_facial_surface_usage')
  ) {
    throw new FaceAuthorityValidationError('FR-53 requires exactly two reviewed direct soft-tissue Mt facial-surface usage records.');
  }
  const adjacentCatalog = authority.reviewedEvidence.find((entry) => entry.evidenceScope === 'adjacent_three_dimensional_facial_surface_catalog');
  if (!adjacentCatalog || adjacentCatalog.supports.softTissueMentalTubercleSurfaceUsage !== false) {
    throw new FaceAuthorityValidationError('FR-53 adjacent mental-tubercle surface catalogue must not be promoted to soft-tissue Mt construct evidence.');
  }
  if (
    authority.reviewedEvidence.some((entry) =>
      entry.supports.explicitIndependentlyReproducibleSurfaceDefinition ||
      entry.supports.fr51InferiorBoundaryMembership ||
      entry.supports.equivalenceToMentonSide ||
      entry.supports.equivalenceToMentalTubercleAnterior
    )
  ) {
    throw new FaceAuthorityValidationError('FR-53 evidence must not silently resolve the Mt definition/mapping/endpoint gaps.');
  }
  if (
    authority.surfaceUsageCorroborated !== true ||
    authority.bilateralChinRegionAssociationCorroborated !== true ||
    authority.explicitSurfaceDefinitionAvailable !== false ||
    authority.fr51InferiorBoundaryMembershipEstablished !== false ||
    authority.equivalenceToMentonSideEstablished !== false ||
    authority.equivalenceToMentalTubercleAnteriorEstablished !== false ||
    authority.crossRepresentationMappingAvailable !== false ||
    authority.researchAcquisitionExecutable !== false ||
    authority.candidateGeometryComparisonExecutable !== false
  ) {
    throw new FaceAuthorityValidationError('FR-53 reviewed-corpus gap adjudication drift.');
  }
  if (
    authority.softTissueMentalTubercleSurfaceDefinitionRule !== null ||
    authority.crossRepresentationMappingRule !== null ||
    authority.endpointSelectionRule !== null ||
    authority.endpointEquivalenceTolerance !== null
  ) {
    throw new FaceAuthorityValidationError('FR-53 must not invent Mt definition, mapping, endpoint rule, or tolerance.');
  }
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-53 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

export function assessSoftTissueMentalTubercleDefinitionReadinessFR53(): SoftTissueMentalTubercleDefinitionReadinessFR53V1 {
  validateSoftTissueMentalTubercleDefinitionAuthorityFR53();
  return Object.freeze({
    surfaceUsageEvidenceReady: true as const,
    bilateralChinRegionAssociationReady: true as const,
    reviewedCorpusGapAdjudicated: true as const,
    explicitSurfaceDefinitionReady: false as const,
    fr51InferiorBoundaryMembershipReady: false as const,
    crossRepresentationMappingReady: false as const,
    pairedMtAnnotationReady: false as const,
    mentonSideComparisonReady: false as const,
    finalEndpointSelectionReady: false as const,
    productionGeometryReady: false as const,
    nextRequiredEvidence: Object.freeze([
      'Find a peer-reviewed anthropometric standard or primary landmark protocol that explicitly defines how bilateral soft-tissue mental tubercle is located on a facial surface.',
      'Alternatively, find a direct validation/mapping source proving the facial-surface soft-tissue Mt construct is equivalent to a separately defined mental-tubercle-anterior surface/anatomical reference.',
      'Require direct evidence that any proposed Mt point lies on the FR-51 central inferior soft-tissue chin boundary before treating it as an endpoint candidate for that boundary.',
      'Until one of those evidence hops is satisfied, do not collect paired Mt annotations, compare Mt against Menton-side, or bind Mt to MediaPipe/provider coordinates.',
    ]),
  });
}

export function assertSoftTissueMentalTubercleAcquisitionReadyFR53(): never {
  validateSoftTissueMentalTubercleDefinitionAuthorityFR53();
  throw new FaceAuthorityValidationError(
    'FR-53 confirms facial-surface soft-tissue Mt usage but no independently reproducible surface definition or FR-51 inferior-boundary membership; Mt acquisition/comparison remains blocked.',
  );
}
