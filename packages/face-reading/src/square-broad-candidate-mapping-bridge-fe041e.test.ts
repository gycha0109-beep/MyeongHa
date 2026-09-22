import { describe, expect, it } from 'vitest';
import { createFaceInterpretationShellFE038 } from './interpretation-shell-fe038.js';
import {
  FACE_SQUARE_BROAD_CANDIDATE_MAPPING_BRIDGE_VERSION_FE041E,
  FACE_SQUARE_BROAD_CANDIDATE_MAPPING_SOURCE_FE041E,
  assessCurrentPinnedSquareBroadCandidateMappingFE041E,
  isIssuedSquareBroadCandidateMappingAdmissionFE041E,
  loadSquareBroadCandidateMappingFE041E,
} from './square-broad-candidate-mapping-bridge-fe041e.js';

describe('FE041E square-broad candidate metric mapping consumer', () => {
  it('pins the immutable FE041D handoff', () => {
    expect(FACE_SQUARE_BROAD_CANDIDATE_MAPPING_BRIDGE_VERSION_FE041E)
      .toBe('MHA-FACE-SQUARE-BROAD-CANDIDATE-MAPPING-BRIDGE-FE041E-v1');
    expect(FACE_SQUARE_BROAD_CANDIDATE_MAPPING_SOURCE_FE041E).toMatchObject({
      validatedBranchCommit: '66a98e15d27d2aa7dfb6d09df27bee57c137b1c5',
      materializedCommit: '37f3728996992144eaa60b083334e466ae648b98',
      artifactSha256: 'f306515639aef5366308018ec3374f35ee1c20c35adb107ee140381ee6c8cd6d',
      sourceBlobSha: 'ef59a55fa0371f0ca2f52ae84f10532bf9c40a3a',
      upstreamContractVersion:
        'FE041D-SQUARE-BROAD-CANDIDATE-METRIC-MAPPING-READINESS-v1',
    });
    expect(assessCurrentPinnedSquareBroadCandidateMappingFE041E()).toMatchObject({
      status: 'ready',
      boundary: {
        runtimeValidationStillRequired: true,
        candidateCanonicalizationAuthorized: false,
        traditionalBindingAuthorityIssued: false,
        calibrationAuthorityIssued: false,
        productionInterpretationAuthorityIssued: false,
      },
    });
  });

  it('admits candidate existence while proving exact canonical intersection remains zero', async () => {
    const result = await loadSquareBroadCandidateMappingFE041E();
    expect(result).toMatchObject({
      status: 'admitted',
      state:
        'source_grounded_candidate_metrics_admitted_canonical_mapping_blocked',
      criterionRef: 'criterion.intake.square_broad',
      sourceConcept: '方大',
      canonicalRegistryMetricCount: 13,
      canonicalRegistryIntersection: [],
      canonicalInputMetricRefs: [],
      operationalizationCandidateCreationAuthorized: false,
      boundary: {
        upstreamCandidateMappingReadinessIssued: true,
        canonicalRegistryAdmissionIssued: true,
        reviewedMethodologyReadinessIssued: true,
        sourceGroundedCandidateMetricsExist: true,
        candidateCanonicalizationAuthorized: false,
        canonicalMetricBindingAuthorized: false,
        traditionalFangBindingAuthorized: false,
        constructValidityEstablished: false,
        empiricalSemanticEvidenceAdmitted: false,
        calibrationAuthorityIssued: false,
        numericThresholdAuthorityIssued: false,
        deterministicCriterionStateIssued: false,
        structuredClaimIssued: false,
        narrativeAuthorityIssued: false,
        productionSemanticExecutionAuthorized: false,
      },
    });
    if (result.status !== 'admitted') throw new Error('FE041E fixture');
    expect(result.candidateMetricRefs).toEqual([
      'neutral.mouth.contour_set.horizontal_reflection_nearest_set_residual_ratio@0.1.0',
      'neutral.mouth.contour_set.orthogonal_edge_orientation_concentration@0.1.0',
      'neutral.mouth.contour_set.turning_angle_concentration_index@0.1.0',
    ]);
    expect(isIssuedSquareBroadCandidateMappingAdmissionFE041E(result)).toBe(true);
  });

  it('does not accept a structural clone as an issued admission', async () => {
    const result = await loadSquareBroadCandidateMappingFE041E();
    expect(result.status).toBe('admitted');
    if (result.status !== 'admitted') throw new Error('FE041E fixture');
    expect(
      isIssuedSquareBroadCandidateMappingAdmissionFE041E(
        JSON.parse(JSON.stringify(result)),
      ),
    ).toBe(false);
  });

  it('keeps the interpretation shell locked', () => {
    const shell = createFaceInterpretationShellFE038({
      schemaVersion: 'myeongha-face-neutral-observation-ref-v1',
      observationRef: 'fe041e.square-broad.observation',
      sourceContractVersion: 'MHA-FACE-PREVIEW-ONE-SHOT-FE031-v1',
      sourceProjectionSchemaVersion:
        'myeongha-face-preview-one-shot-result-v1',
      metricCount: 13,
      regionCount: 4,
    });
    expect(shell.criterion.state).toBe('not_admitted');
    expect(shell.claims).toEqual([]);
    expect(shell.narrative.allowed).toBe(false);
  });
});
