import { describe, expect, it } from 'vitest';
import {
  EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41,
  assertEyebrowResearchCandidateAdmissionFR41,
  assessEyebrowNeutralAnatomicalAdmissionReadinessFR41,
  validateEyebrowNeutralAnatomicalAdmissionAuthorityFR41,
  type EyebrowNeutralAnatomicalAdmissionAuthorityFR41V1,
} from '../packages/face-reading/src/index.js';

describe('FR-41 eyebrow neutral anatomical evidence admission', () => {
  it('pins three peer-reviewed neutral eyebrow geometry evidence records', () => {
    const evidence = EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41.evidence;
    expect(evidence.map((entry) => [entry.year, entry.doi, entry.pmcid])).toEqual([
      [2014, '10.1186/1471-2342-14-35', 'PMC4205300'],
      [2019, '10.1002/ajpa.23878', 'PMC6771603'],
      [2025, '10.1038/s41598-025-09714-4', 'PMC12234795'],
    ]);
    for (const entry of evidence) {
      expect(entry.providerComponentMappingSupplied).toBe(false);
      expect(entry.providerIndexAuthoritySupplied).toBe(false);
      expect(entry.traditionalPhysiognomyAuthoritySupplied).toBe(false);
      expect(entry.limitations.length).toBeGreaterThan(0);
    }
  });

  it('recognizes external anatomical support for medial/lateral endpoints and upper/lower boundary curves', () => {
    const boundaryEvidence = EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41.evidence.filter(
      (entry) => entry.geometryClaims.upperEyebrowCurveDefined && entry.geometryClaims.lowerEyebrowCurveDefined,
    );
    expect(boundaryEvidence).toHaveLength(2);
    expect(boundaryEvidence.every((entry) => entry.geometryClaims.medialEyebrowEndpointDefined)).toBe(true);
    expect(boundaryEvidence.every((entry) => entry.geometryClaims.lateralEyebrowEndpointDefined)).toBe(true);
  });

  it('satisfies only the external target-model gate and keeps all provider/runtime gates blocked', () => {
    expect(() => validateEyebrowNeutralAnatomicalAdmissionAuthorityFR41()).not.toThrow();
    const gates = EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41.admissionGates;
    expect(gates[0]).toMatchObject({ gateId: 'external_neutral_target_model', state: 'satisfied' });
    expect(gates.slice(1).every((gate) => gate.state === 'blocked')).toBe(true);
    expect(gates.map((gate) => gate.gateId)).toEqual([
      'external_neutral_target_model',
      'provider_component_role_mapping',
      'left_right_mapping_reproducibility',
      'component_endpoint_correspondence',
      'controlled_capture_protocol',
      'pose_stability',
      'expression_stability',
      'repeated_capture_repeatability',
      'calibration_error_thresholds',
      'deterministic_algorithm_spec',
    ]);
  });

  it('keeps every FR-40 candidate unadmitted and algorithm-free', () => {
    const assessments = EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41.candidateAssessments;
    expect(assessments.map((entry) => [entry.candidateClass, entry.targetSupport])).toEqual([
      ['single_provider_component_curve', 'insufficient_for_component_selection'],
      ['paired_provider_components_region', 'partial_boundary_model_support'],
      ['correspondence_derived_centerline', 'no_direct_centerline_support'],
    ]);
    for (const assessment of assessments) {
      expect(assessment.algorithmRef).toBeNull();
      expect(assessment.researchCandidateAdmitted).toBe(false);
      expect(assessment.reviewed).toBe(false);
      expect(assessment.blockers.length).toBeGreaterThan(0);
    }
  });

  it('does not convert upper/lower literature semantics into MediaPipe component semantics', () => {
    const boundary = EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41.authorityBoundary;
    expect(boundary.literatureBoundaryModelMeansMediaPipeComponentMapping).toBe(false);
    expect(boundary.sourceOrderMeansUpperLowerRole).toBe(false);
    expect(boundary.providerIndexMeansAnatomicalLandmarkAuthority).toBe(false);
    expect(boundary.upperLowerBoundaryEvidenceMeansClosedRegionAlgorithm).toBe(false);
    expect(boundary.upperLowerBoundaryEvidenceMeansCenterlineAlgorithm).toBe(false);
  });

  it('rejects provider component mapping promotion without new mapping evidence', () => {
    const invalid = {
      ...EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41,
      admissionGates: EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41.admissionGates.map((gate) =>
        gate.gateId === 'provider_component_role_mapping' ? { ...gate, state: 'satisfied' as const } : gate,
      ),
    } as EyebrowNeutralAnatomicalAdmissionAuthorityFR41V1;
    expect(() => validateEyebrowNeutralAnatomicalAdmissionAuthorityFR41(invalid)).toThrow(
      /only the external neutral target-model gate may be satisfied/u,
    );
  });

  it('rejects literature evidence acquiring provider index or traditional semantic authority', () => {
    const invalid = {
      ...EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41,
      evidence: EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41.evidence.map((entry, index) =>
        index === 0 ? { ...entry, providerIndexAuthoritySupplied: true } : entry,
      ),
    } as unknown as EyebrowNeutralAnatomicalAdmissionAuthorityFR41V1;
    expect(() => validateEyebrowNeutralAnatomicalAdmissionAuthorityFR41(invalid)).toThrow(
      /cannot acquire provider\/traditional authority/u,
    );
  });

  it('reports target evidence progress while preserving zero admitted candidates', () => {
    const readiness = assessEyebrowNeutralAnatomicalAdmissionReadinessFR41();
    expect(readiness.externalTargetModelEvidenceReady).toBe(true);
    expect(readiness.providerComponentRoleMappingReady).toBe(false);
    expect(readiness.allAdmissionGatesSatisfied).toBe(false);
    expect(readiness.admittedResearchCandidates).toBe(0);
    expect(readiness.reviewedCandidates).toBe(0);
    expect(readiness.nextRequiredGate).toBe('provider_component_role_mapping');
    expect(readiness.productionGeometryReady).toBe(false);
  });

  it('refuses research-candidate admission until the remaining gates are actually satisfied', () => {
    expect(() => assertEyebrowResearchCandidateAdmissionFR41()).toThrow(
      /no research candidate is admitted/u,
    );
  });
});
