import { describe, expect, it } from 'vitest';
import {
  CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52,
  SOFT_TISSUE_MENTAL_TUBERCLE_DEFINITION_AUTHORITY_FR53,
  assessSoftTissueMentalTubercleDefinitionReadinessFR53,
  assertSoftTissueMentalTubercleAcquisitionReadyFR53,
  validateSoftTissueMentalTubercleDefinitionAuthorityFR53,
  type SoftTissueMentalTubercleDefinitionAuthorityFR53V1,
} from '../packages/face-reading/src/index.js';

describe('FR-53 soft-tissue mental tubercle definition gap', () => {
  it('requires the corrected FR-52 soft-tissue Mt boundary', () => {
    const softTissueMt = CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52.candidateAdmissions.find(
      (entry) => entry.candidateKey === 'bilateral_soft_tissue_mental_tubercle',
    );
    expect(CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52.authorityVersion).toBe('0.1.1');
    expect(softTissueMt).toBeDefined();
    expect(softTissueMt!.scopeCompatibleWithFR51).toBe(false);
    expect(softTissueMt!.researchAcquisitionExecutable).toBe(false);
  });

  it('corroborates direct facial-surface soft-tissue Mt usage in two reviewed 3D studies without inventing a definition', () => {
    const authority = validateSoftTissueMentalTubercleDefinitionAuthorityFR53();
    const direct = authority.reviewedEvidence.filter((entry) => entry.supports.softTissueMentalTubercleSurfaceUsage);
    expect(authority).toBe(SOFT_TISSUE_MENTAL_TUBERCLE_DEFINITION_AUTHORITY_FR53);
    expect(authority.surfaceUsageCorroborated).toBe(true);
    expect(authority.bilateralChinRegionAssociationCorroborated).toBe(true);
    expect(authority.explicitSurfaceDefinitionAvailable).toBe(false);
    expect(direct).toHaveLength(2);
    expect(direct.every((entry) => entry.evidenceScope === 'three_dimensional_facial_surface_usage')).toBe(true);
    expect(authority.reviewedEvidence.every((entry) => entry.supports.explicitIndependentlyReproducibleSurfaceDefinition === false)).toBe(true);
  });

  it('keeps Langstaff mental-tubercle-labelled surface catalogue adjacent rather than construct-equivalent', () => {
    const adjacent = SOFT_TISSUE_MENTAL_TUBERCLE_DEFINITION_AUTHORITY_FR53.reviewedEvidence.find(
      (entry) => entry.evidenceScope === 'adjacent_three_dimensional_facial_surface_catalog',
    );
    expect(adjacent).toBeDefined();
    expect(adjacent!.supports.softTissueMentalTubercleSurfaceUsage).toBe(false);
    expect(SOFT_TISSUE_MENTAL_TUBERCLE_DEFINITION_AUTHORITY_FR53.authorityBoundary.adjacentMentalTubercleCatalogMeansSoftTissueMt).toBe(false);
  });

  it('keeps chin-region association separate from FR-51 inferior-boundary membership', () => {
    const authority = SOFT_TISSUE_MENTAL_TUBERCLE_DEFINITION_AUTHORITY_FR53;
    expect(authority.fr51InferiorBoundaryMembershipEstablished).toBe(false);
    expect(authority.reviewedEvidence.every((entry) => entry.supports.fr51InferiorBoundaryMembership === false)).toBe(true);
    expect(authority.authorityBoundary.chinRegionMeansFR51InferiorBoundaryMembership).toBe(false);
  });

  it('does not copy the mental-tubercle-anterior FSTT definition onto facial-surface soft-tissue Mt', () => {
    const fstt = SOFT_TISSUE_MENTAL_TUBERCLE_DEFINITION_AUTHORITY_FR53.reviewedEvidence.find(
      (entry) => entry.evidenceScope === 'craniofacial_fstt_anatomical_reference',
    );
    expect(fstt).toBeDefined();
    expect(fstt!.supports.softTissueMentalTubercleSurfaceUsage).toBe(false);
    expect(fstt!.supports.equivalenceToMentalTubercleAnterior).toBe(false);
    expect(SOFT_TISSUE_MENTAL_TUBERCLE_DEFINITION_AUTHORITY_FR53.equivalenceToMentalTubercleAnteriorEstablished).toBe(false);
    expect(SOFT_TISSUE_MENTAL_TUBERCLE_DEFINITION_AUTHORITY_FR53.crossRepresentationMappingAvailable).toBe(false);
  });

  it('does not treat FaceGen or MeshMonk output as anatomical definition authority', () => {
    const boundary = SOFT_TISSUE_MENTAL_TUBERCLE_DEFINITION_AUTHORITY_FR53.authorityBoundary;
    expect(boundary.faceGenTemplateMeansAnatomicalDefinition).toBe(false);
    expect(boundary.meshMonkOutputMeansAnatomicalDefinition).toBe(false);
    expect(boundary.surfaceUsageMeansExplicitDefinition).toBe(false);
  });

  it('keeps all operational rules and tolerances unresolved', () => {
    const authority = SOFT_TISSUE_MENTAL_TUBERCLE_DEFINITION_AUTHORITY_FR53;
    expect(authority.softTissueMentalTubercleSurfaceDefinitionRule).toBeNull();
    expect(authority.crossRepresentationMappingRule).toBeNull();
    expect(authority.endpointSelectionRule).toBeNull();
    expect(authority.endpointEquivalenceTolerance).toBeNull();
    expect(authority.researchAcquisitionExecutable).toBe(false);
    expect(authority.candidateGeometryComparisonExecutable).toBe(false);
  });

  it('rejects mutation that turns surface usage into an explicit definition', () => {
    const mutated = {
      ...SOFT_TISSUE_MENTAL_TUBERCLE_DEFINITION_AUTHORITY_FR53,
      explicitSurfaceDefinitionAvailable: true,
    } as unknown as SoftTissueMentalTubercleDefinitionAuthorityFR53V1;
    expect(() => validateSoftTissueMentalTubercleDefinitionAuthorityFR53(mutated)).toThrow(/gap adjudication drift/u);
  });

  it('rejects mutation that claims FR-51 inferior-boundary membership', () => {
    const mutated = {
      ...SOFT_TISSUE_MENTAL_TUBERCLE_DEFINITION_AUTHORITY_FR53,
      fr51InferiorBoundaryMembershipEstablished: true,
    } as unknown as SoftTissueMentalTubercleDefinitionAuthorityFR53V1;
    expect(() => validateSoftTissueMentalTubercleDefinitionAuthorityFR53(mutated)).toThrow(/gap adjudication drift/u);
  });

  it('keeps Mt acquisition, candidate comparison, endpoint selection and production blocked', () => {
    const readiness = assessSoftTissueMentalTubercleDefinitionReadinessFR53();
    expect(readiness.surfaceUsageEvidenceReady).toBe(true);
    expect(readiness.bilateralChinRegionAssociationReady).toBe(true);
    expect(readiness.reviewedCorpusGapAdjudicated).toBe(true);
    expect(readiness.explicitSurfaceDefinitionReady).toBe(false);
    expect(readiness.fr51InferiorBoundaryMembershipReady).toBe(false);
    expect(readiness.crossRepresentationMappingReady).toBe(false);
    expect(readiness.pairedMtAnnotationReady).toBe(false);
    expect(readiness.mentonSideComparisonReady).toBe(false);
    expect(readiness.finalEndpointSelectionReady).toBe(false);
    expect(readiness.productionGeometryReady).toBe(false);
    expect(Object.values(SOFT_TISSUE_MENTAL_TUBERCLE_DEFINITION_AUTHORITY_FR53.authorityBoundary).every((value) => value === false)).toBe(true);
    expect(() => assertSoftTissueMentalTubercleAcquisitionReadyFR53()).toThrow(/Mt acquisition\/comparison remains blocked/u);
  });
});
