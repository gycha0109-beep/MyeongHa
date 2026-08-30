import { describe, expect, it } from 'vitest';
import {
  CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52,
  assessChinContourEndpointCandidateReadinessFR52,
  assertChinContourEndpointsReadyForProductionFR52,
  deriveMentonSideEndpointCandidatePairFR52,
  validateChinContourEndpointCandidateAuthorityFR52,
  type ChinContourEndpointCandidateAuthorityFR52V1,
  type IndependentCentralChinScaffoldAnnotationFR50V1,
} from '../packages/face-reading/src/index.js';

function annotation(): IndependentCentralChinScaffoldAnnotationFR50V1 {
  return {
    schemaVersion: 'fr50-independent-central-chin-scaffold-v1',
    subjectId: 'subject-fr52-001',
    captureId: 'capture-fr52-001',
    annotatorId: 'annotator-fr52-001',
    coordinateFrame: 'normalized_image_2d',
    leftCheilion: { x: 0.34, y: 0.61 },
    leftMentonSide: { x: 0.34, y: 0.82 },
    softTissueMenton: { x: 0.5, y: 0.85 },
    rightMentonSide: { x: 0.66, y: 0.82 },
    rightCheilion: { x: 0.66, y: 0.61 },
    providerOutputVisibleDuringAnnotation: false,
    annotationFrozenBeforeProviderScoring: true,
    traditionalLabelVisibleDuringAnnotation: false,
  };
}

describe('FR-52 chin contour endpoint candidate admission', () => {
  it('admits three distinct endpoint candidate families without selecting a final endpoint pair', () => {
    const authority = validateChinContourEndpointCandidateAuthorityFR52();
    expect(authority).toBe(CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52);
    expect(authority.candidateAdmissions.map((entry) => entry.candidateKey)).toEqual([
      'bilateral_menton_side',
      'bilateral_soft_tissue_mental_tubercle',
      'bilateral_mental_tubercle_anterior_reference',
    ]);
    expect(authority.finalEndpointSelection).toBeNull();
    expect(authority.endpointSelectionRule).toBeNull();
  });

  it('prioritizes Menton-side for research acquisition because its bilateral rule is explicit and executable', () => {
    const authority = CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52;
    const mentonSide = authority.candidateAdmissions[0]!;
    expect(authority.researchAcquisitionPriority).toBe('bilateral_menton_side');
    expect(mentonSide.admissionState).toBe('admitted_reproducible_scope_compatible_research_candidate');
    expect(mentonSide.softTissueSurfaceLandmark).toBe(true);
    expect(mentonSide.explicitOperationalDefinitionAvailable).toBe(true);
    expect(mentonSide.scopeCompatibleWithFR51).toBe(true);
    expect(mentonSide.researchAcquisitionExecutable).toBe(true);
    expect(mentonSide.exactFR35EndpointEstablished).toBe(false);
  });

  it('keeps soft-tissue mental tubercle as a chin-region candidate until an exact surface definition is sourced', () => {
    const candidate = CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52.candidateAdmissions[1]!;
    expect(candidate.candidateKey).toBe('bilateral_soft_tissue_mental_tubercle');
    expect(candidate.admissionState).toBe('admitted_chin_region_candidate_exact_surface_definition_missing');
    expect(candidate.softTissueSurfaceLandmark).toBe(true);
    expect(candidate.explicitOperationalDefinitionAvailable).toBe(false);
    expect(candidate.scopeCompatibleWithFR51).toBe(true);
    expect(candidate.researchAcquisitionExecutable).toBe(false);
    expect(candidate.exactFR35EndpointEstablished).toBe(false);
  });

  it('keeps mental-tubercle-anterior as a non-equivalent lateral-bulge comparison reference only', () => {
    const candidate = CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52.candidateAdmissions[2]!;
    expect(candidate.candidateKey).toBe('bilateral_mental_tubercle_anterior_reference');
    expect(candidate.admissionState).toBe('admitted_non_equivalent_lateral_bulge_reference_only');
    expect(candidate.softTissueSurfaceLandmark).toBe(false);
    expect(candidate.explicitOperationalDefinitionAvailable).toBe(true);
    expect(candidate.scopeCompatibleWithFR51).toBe(false);
    expect(candidate.researchAcquisitionExecutable).toBe(false);
  });

  it('derives only a Menton-side endpoint candidate pair from a frozen provider-blind FR-50 annotation', () => {
    const candidate = deriveMentonSideEndpointCandidatePairFR52(annotation());
    expect(candidate.candidateKey).toBe('bilateral_menton_side');
    expect(candidate.leftCandidate).toEqual({ x: 0.34, y: 0.82 });
    expect(candidate.inferiorMidlineAnchor).toEqual({ x: 0.5, y: 0.85 });
    expect(candidate.rightCandidate).toEqual({ x: 0.66, y: 0.82 });
    expect(candidate.candidateDefinition).toBe('vertical_through_each_cheilion_reaches_lowest_point_of_chin');
    expect(candidate.acquisitionPriority).toBe('highest_currently_operationalized_research_candidate');
    expect(candidate.exactFR35EndpointPairAuthorized).toBe(false);
    expect(candidate.denseCurveAuthorized).toBe(false);
    expect(candidate.providerMappingAuthorized).toBe(false);
    expect(candidate.traditionalDigeEdgeAuthorized).toBe(false);
    expect(candidate.productionGeometryAuthorized).toBe(false);
  });

  it('inherits the provider-blind frozen annotation boundary from FR-50', () => {
    const base = annotation();
    expect(() => deriveMentonSideEndpointCandidatePairFR52({
      ...base,
      providerOutputVisibleDuringAnnotation: true as false,
    })).toThrow(/provider-blind traditional-label-blind independent scaffold annotation/u);
    expect(() => deriveMentonSideEndpointCandidatePairFR52({
      ...base,
      annotationFrozenBeforeProviderScoring: false as true,
    })).toThrow(/provider-blind traditional-label-blind independent scaffold annotation/u);
  });

  it('does not invent endpoint-selection tolerances or a soft-tissue Mt surface rule', () => {
    const authority = CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52;
    expect(authority.finalEndpointSelection).toBeNull();
    expect(authority.endpointSelectionRule).toBeNull();
    expect(authority.endpointEquivalenceTolerance).toBeNull();
    expect(authority.mentalTubercleSurfaceDefinitionRule).toBeNull();
  });

  it('rejects mutation that silently turns research priority into endpoint authority', () => {
    const mutated = {
      ...CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52,
      finalEndpointSelection: 'bilateral_menton_side',
    } as unknown as ChinContourEndpointCandidateAuthorityFR52V1;
    expect(() => validateChinContourEndpointCandidateAuthorityFR52(mutated)).toThrow(/keep final endpoint selection/u);
  });

  it('keeps every candidate and downstream geometry/semantic/production gate fail-closed', () => {
    const readiness = assessChinContourEndpointCandidateReadinessFR52();
    expect(readiness.endpointCandidateEvidenceReady).toBe(true);
    expect(readiness.mentonSideOperationalResearchCandidateReady).toBe(true);
    expect(readiness.softTissueMentalTubercleChinRegionCandidateReady).toBe(true);
    expect(readiness.mentalTubercleAnteriorComparisonReferenceReady).toBe(true);
    expect(readiness.candidateFamiliesSeparated).toBe(true);
    expect(readiness.finalEndpointSelectionReady).toBe(false);
    expect(readiness.exactEndpointRuleReady).toBe(false);
    expect(readiness.denseContinuousCurveReady).toBe(false);
    expect(readiness.providerMappingReady).toBe(false);
    expect(readiness.productionGeometryReady).toBe(false);
    expect(Object.values(CHIN_CONTOUR_ENDPOINT_CANDIDATE_AUTHORITY_FR52.authorityBoundary).every((value) => value === false)).toBe(true);
    expect(() => assertChinContourEndpointsReadyForProductionFR52()).toThrow(/final endpoint selection/u);
  });
});
