import { describe, expect, it } from 'vitest';
import {
  FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0,
  FACE_CALIBRATION_EVIDENCE_RESEARCH_V0,
  FACE_FR3_METHOD_REFS_V0,
  FaceAuthorityValidationError,
  authorizeFaceCalibration,
  classifyNoseBridgeStraightness,
  computeNoseBridgeCenterlineDeviation,
  type FaceAuthorityRegistry,
  type FaceCalibrationAuthorization,
  type FaceCalibrationDefinition,
  type FaceCalibrationEvidenceRegistry,
  type FaceCalibrationValidationContext,
  type NeutralFaceGeometryProvenance,
} from '../packages/face-reading/src/index.js';

const metricRef = 'neutral.nose.bridge.centerline_rms_deviation@0.1.0';
const criterionId = 'criterion.discernment.bridge_straight';
const sourceRef = 'passage.shenxiang.five_officers.discernment';
const repeatEvidenceRef = 'evidence.nose_bridge.repeat_capture@1.0.0';
const expertEvidenceRef = 'evidence.nose_bridge.blinded_expert@1.0.0';
const selectionEvidenceRef = 'evidence.nose_bridge.threshold_selection@1.0.0';
const selectionMethodRef = 'method.threshold-selection.test-only-v1';
const calibrationDatasetVersion = 'test-only-complete-calibration-v1';

const provenance: NeutralFaceGeometryProvenance = {
  observationContractVersion: 'neutral-face-observation-v0',
  extractorVersion: 'synthetic-authorization-test-v1',
  modelVersion: 'none',
  coordinateFrame: 'pose_normalized_face_2d',
  poseCompensated: true,
  sourceLandmarkRefs: ['fixture:p0', 'fixture:p1', 'fixture:p2'],
};

function promotedAuthority(): FaceAuthorityRegistry {
  return {
    ...FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0,
    passages: FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0.passages.map((passage) =>
      passage.passageId === sourceRef
        ? { ...passage, verificationStatus: 'scan_checked' as const }
        : passage,
    ),
    methodologies: FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0.methodologies.map((methodology) =>
      `${methodology.methodologyId}@${methodology.version}` === FACE_FR3_METHOD_REFS_V0.shenxiangFiveOfficers
        ? { ...methodology, reviewStatus: 'production_authorized' as const }
        : methodology,
    ),
  };
}

function completeEvidence(threshold = 0.02): FaceCalibrationEvidenceRegistry {
  return {
    ...FACE_CALIBRATION_EVIDENCE_RESEARCH_V0,
    evidence: [
      ...FACE_CALIBRATION_EVIDENCE_RESEARCH_V0.evidence,
      {
        evidenceId: 'evidence.nose_bridge.repeat_capture',
        version: '1.0.0',
        evidenceClass: 'repeat_capture_stability',
        metricRefs: [metricRef],
        criterionRefs: [criterionId],
        datasetVersion: 'repeat-capture-v1',
        provenanceRefs: ['dataset:repeat-capture-v1'],
        participantPolicy: 'consented_pseudonymous',
        status: 'reviewed',
      },
      {
        evidenceId: 'evidence.nose_bridge.blinded_expert',
        version: '1.0.0',
        evidenceClass: 'blinded_expert_operationalization',
        metricRefs: [metricRef],
        criterionRefs: [criterionId],
        datasetVersion: 'expert-label-v1',
        provenanceRefs: ['dataset:expert-label-v1'],
        participantPolicy: 'consented_pseudonymous',
        reviewProtocolRef: 'protocol.blinded-bridge-straight-v1',
        status: 'reviewed',
      },
      {
        evidenceId: 'evidence.nose_bridge.threshold_selection',
        version: '1.0.0',
        evidenceClass: 'threshold_selection_result',
        metricRefs: [metricRef],
        criterionRefs: [criterionId],
        datasetVersion: calibrationDatasetVersion,
        provenanceRefs: ['artifact:test-only-threshold-selection-v1'],
        participantPolicy: 'consented_pseudonymous',
        selectionResult: {
          selectionMethodRef,
          calibrationDatasetVersion,
          decisionRule: { kind: 'max_inclusive', threshold },
          inputEvidenceRefs: [repeatEvidenceRef, expertEvidenceRef],
          evaluationProtocolRef: 'protocol.test-only-threshold-evaluation-v1',
        },
        status: 'reviewed',
      },
    ],
  };
}

function validationContext(threshold = 0.02): FaceCalibrationValidationContext {
  return {
    faceAuthorityRegistry: promotedAuthority(),
    calibrationEvidenceRegistry: completeEvidence(threshold),
    knownNeutralMetricRefs: new Set([metricRef]),
    knownCriterionIds: new Set([criterionId]),
  };
}

function productionCalibration(threshold = 0.02): FaceCalibrationDefinition {
  return {
    calibrationId: 'calibration.nose.bridge.straight',
    version: '1.0.0-test-only',
    metricRef,
    criterionId,
    methodologyRef: FACE_FR3_METHOD_REFS_V0.shenxiangFiveOfficers,
    traditionalSourceRefs: [sourceRef],
    calibrationEvidenceRefs: [
      'evidence.nose_bridge.synthetic_discriminating@0.1.0',
      repeatEvidenceRef,
      expertEvidenceRef,
      selectionEvidenceRef,
    ],
    calibrationDatasetVersion,
    selectionMethodRef,
    decisionRule: { kind: 'max_inclusive', threshold },
    status: 'production_authorized',
  };
}

function bridgeMetric(offset: number) {
  return computeNoseBridgeCenterlineDeviation({
    provenance,
    centerlinePoints: [
      { x: 0, y: 0 },
      { x: offset, y: 0.5 },
      { x: 0, y: 1 },
    ],
  });
}

describe('FR-5 issued calibration authorization', () => {
  it('classifies only after the full calibration authority issues an authorization', () => {
    const authorization = authorizeFaceCalibration(productionCalibration(0.02), validationContext(0.02));

    expect(classifyNoseBridgeStraightness(bridgeMetric(0.01), authorization)).toMatchObject({
      criterionId,
      state: 'met',
      calibrationApplied: true,
    });
    expect(classifyNoseBridgeStraightness(bridgeMetric(0.03), authorization)).toMatchObject({
      criterionId,
      state: 'not_met',
      calibrationApplied: true,
    });
  });

  it('rejects a structurally identical but forged authorization object at runtime', () => {
    const issued = authorizeFaceCalibration(productionCalibration(), validationContext());
    const forged: FaceCalibrationAuthorization = { ...issued };

    expect(() => classifyNoseBridgeStraightness(bridgeMetric(0.01), forged)).toThrow(/was not issued/u);
  });

  it('snapshots and freezes threshold authority so post-issuance mutation cannot change classification', () => {
    const calibration = productionCalibration(0.02);
    const authorization = authorizeFaceCalibration(calibration, validationContext(0.02));
    const mutableRule = calibration.decisionRule as { kind: 'max_inclusive'; threshold: number };
    mutableRule.threshold = 0.5;
    (calibration.calibrationEvidenceRefs as string[]).push('evidence.forged-after-issuance@1.0.0');

    expect(authorization.decisionRule).toEqual({ kind: 'max_inclusive', threshold: 0.02 });
    expect(authorization.calibrationEvidenceRefs).not.toContain('evidence.forged-after-issuance@1.0.0');
    expect(Object.isFrozen(authorization.decisionRule)).toBe(true);
    expect(Object.isFrozen(authorization.calibrationEvidenceRefs)).toBe(true);
    expect(classifyNoseBridgeStraightness(bridgeMetric(0.03), authorization).state).toBe('not_met');
  });

  it('refuses authorization when the calibration threshold does not match selection evidence', () => {
    expect(() => authorizeFaceCalibration(productionCalibration(0.03), validationContext(0.02))).toThrow(
      /decisionRule does not match threshold selection evidence/u,
    );
  });

  it('refuses to issue authorization for research-only calibration', () => {
    const researchCalibration: FaceCalibrationDefinition = {
      ...productionCalibration(),
      status: 'research',
    };

    expect(() => authorizeFaceCalibration(researchCalibration, validationContext())).toThrow(
      FaceAuthorityValidationError,
    );
  });
});