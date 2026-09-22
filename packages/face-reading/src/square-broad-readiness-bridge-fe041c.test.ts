import { describe, expect, it } from 'vitest';
import {
  FACE_SQUARE_BROAD_READINESS_BRIDGE_VERSION_FE041C,
  FACE_SQUARE_BROAD_READINESS_SOURCE_FE041C,
  assessCurrentPinnedSquareBroadReadinessFE041C,
  isIssuedSquareBroadReadinessAdmissionFE041C,
  loadSquareBroadReadinessFE041C,
} from './square-broad-readiness-bridge-fe041c.js';
import { createFaceInterpretationShellFE038 } from './interpretation-shell-fe038.js';

function clone<T>(value: T): any {
  return JSON.parse(JSON.stringify(value));
}

describe('FE041C square-broad operationalization readiness consumer', () => {
  it('pins the FE041B readiness export from the validated immutable FE041D superseding handoff', () => {
    expect(FACE_SQUARE_BROAD_READINESS_BRIDGE_VERSION_FE041C)
      .toBe('MHA-FACE-SQUARE-BROAD-READINESS-BRIDGE-FE041C-v1');
    expect(FACE_SQUARE_BROAD_READINESS_SOURCE_FE041C).toEqual({
      repository: 'gycha0109-beep/Saju',
      validatedDistributionCommit:
        '66a98e15d27d2aa7dfb6d09df27bee57c137b1c5',
      materializedCommit:
        '37f3728996992144eaa60b083334e466ae648b98',
      distributionPath:
        'distribution/face-reading/fe041d/myeongha-face-reading-0.0.0.tgz',
      artifactSha256:
        'f306515639aef5366308018ec3374f35ee1c20c35adb107ee140381ee6c8cd6d',
      sourcePath:
        'packages/face-reading/src/square-broad-operationalization-readiness-fe041b.ts',
      sourceBlobSha:
        '29ac70f28bb8da609ff6950ae9eb1c78aaa35ab6',
      packageSubpath:
        '@myeongha/face-reading/square-broad-operationalization-readiness-fe041b',
      upstreamContractVersion:
        'FE041B-SQUARE-BROAD-OPERATIONALIZATION-READINESS-v1',
    });

    expect(assessCurrentPinnedSquareBroadReadinessFE041C()).toMatchObject({
      status: 'ready',
      reason: 'upstream_readiness_export_available',
      boundary: {
        runtimeValidationStillRequired: true,
        operationalizationAuthorityIssued: false,
        traditionalBindingAuthorityIssued: false,
        numericThresholdAuthorityIssued: false,
        classificationIssued: false,
        productionInterpretationAuthorityIssued: false,
      },
    });
  });

  it('admits reviewed methodology authority while keeping operationalization blocked', async () => {
    const result = await loadSquareBroadReadinessFE041C();
    expect(result).toMatchObject({
      status: 'admitted',
      state:
        'reviewed_methodology_authority_admitted_operationalization_blocked',
      criterionRef: 'criterion.intake.square_broad',
      sourceConcept: '方大',
      sourcePassageRef:
        'passage.shenxiang.five_officers.intake.nlc_1925',
      reviewedMethodologyRef:
        'method.shenxiang.five_officers.intake_criteria@0.3.0',
      canonicalInputMetricRefs: [],
      boundary: {
        upstreamReadinessIssued: true,
        sourcePassageScanChecked: true,
        reviewedMethodologyAuthorityPresent: true,
        canonicalMetricBindingAuthorized: false,
        constructValidityEstablished: false,
        empiricalSemanticEvidenceAdmitted: false,
        calibrationAuthorityIssued: false,
        numericThresholdAuthorityIssued: false,
        classificationBandsIssued: false,
        deterministicCriterionStateIssued: false,
        ruleAuthorityIssued: false,
        structuredClaimIssued: false,
        narrativeAuthorityIssued: false,
        productionSemanticExecutionAuthorized: false,
      },
    });
    expect(isIssuedSquareBroadReadinessAdmissionFE041C(result)).toBe(true);
  });

  it('does not accept a structurally forged readiness admission', async () => {
    const result = await loadSquareBroadReadinessFE041C();
    expect(result.status).toBe('admitted');
    if (result.status !== 'admitted') throw new Error('FE041C fixture');
    expect(isIssuedSquareBroadReadinessAdmissionFE041C(clone(result)))
      .toBe(false);
  });

  it('keeps the unresolved mapping frontier explicit', async () => {
    const result = await loadSquareBroadReadinessFE041C();
    expect(result.status).toBe('admitted');
    if (result.status !== 'admitted') throw new Error('FE041C fixture');

    expect(result.canonicalInputMetricRefs).toEqual([]);
    expect(result.blockers).toEqual([
      'canonical_metric_to_traditional_construct_binding_not_authorized',
      'construct_validity_not_established',
      'empirical_semantic_evidence_not_admitted',
      'calibration_authority_not_issued',
      'numeric_threshold_not_authorized',
    ]);
    expect(result.nextFrontier)
      .toBe('source_grounded_canonical_metric_mapping_evidence_before_calibration');
  });

  it('does not unlock the FE038 interpretation shell', () => {
    const shell = createFaceInterpretationShellFE038({
      schemaVersion: 'myeongha-face-neutral-observation-ref-v1',
      observationRef: 'fe041c.square-broad.observation',
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
