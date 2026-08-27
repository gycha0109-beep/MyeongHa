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

function completeEvidence(): FaceCalibrationEvidenceRegistry {
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
        participantPolicy: 'consented_deidentified',
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
        participantPolicy: 'consented_deidentified',
        reviewProtocolRef: 'protocol.blinded-bridge-straight-v1',
        status: 'reviewed',
      },
    ],
  };
}

function validationContext(): FaceCalibrationValidationContext {
  return {
    faceAuthorityRegistry: promotedAuthority(),
    calibrationEvidenceRegistry: completeEvidence(),
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
      'evidence.nose_bridge.repeat_capture@1.0.0',
      'evidence.nose_bridge.blinded_expert@1.0.0',
    ],
    calibrationDatasetVersion: 'test-only-complete-calibration-v1',
    selectionMethodRef: 'method.threshold-selection.test-only-v1',
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
    const authorization = authorizeFaceCalibration(productionCalibration(0.02), validationContext());

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
