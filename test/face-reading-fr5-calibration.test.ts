import { describe, expect, it } from 'vitest';
import {
  FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0,
  FACE_CALIBRATION_EVIDENCE_RESEARCH_V0,
  FACE_FR3_METHOD_REFS_V0,
  FaceAuthorityValidationError,
  validateFaceCalibrationDefinition,
  validateFaceCalibrationEvidenceRegistry,
  type FaceAuthorityRegistry,
  type FaceCalibrationDefinition,
  type FaceCalibrationEvidenceRegistry,
  type FaceCalibrationValidationContext,
} from '../packages/face-reading/src/index.js';

const metricRef = 'neutral.nose.bridge.centerline_rms_deviation@0.1.0';
const criterionId = 'criterion.discernment.bridge_straight';
const sourceRef = 'passage.shenxiang.five_officers.discernment';

function context(input?: {
  faceAuthorityRegistry?: FaceAuthorityRegistry;
  calibrationEvidenceRegistry?: FaceCalibrationEvidenceRegistry;
}): FaceCalibrationValidationContext {
  return {
    faceAuthorityRegistry: input?.faceAuthorityRegistry ?? FACE_AUTHORITY_FR3_RESEARCH_REGISTRY_V0,
    calibrationEvidenceRegistry: input?.calibrationEvidenceRegistry ?? FACE_CALIBRATION_EVIDENCE_RESEARCH_V0,
    knownNeutralMetricRefs: new Set([metricRef]),
    knownCriterionIds: new Set([criterionId]),
  };
}

function productionCalibration(): FaceCalibrationDefinition {
  return {
    calibrationId: 'calibration.nose.bridge.straight',
    version: '1.0.0-test-fixture',
    metricRef,
    criterionId,
    methodologyRef: FACE_FR3_METHOD_REFS_V0.shenxiangFiveOfficers,
    traditionalSourceRefs: [sourceRef],
    calibrationEvidenceRefs: ['evidence.nose_bridge.synthetic_discriminating@0.1.0'],
    calibrationDatasetVersion: 'test-only-nose-bridge-calibration-v1',
    selectionMethodRef: 'method.threshold-selection.test-only-blinded-consensus-v1',
    decisionRule: { kind: 'max_inclusive', threshold: 0.02 },
    status: 'production_authorized',
  };
}

function promoteTraditionalAuthority(): FaceAuthorityRegistry {
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

function withHumanEvidence(classes: readonly ('repeat_capture_stability' | 'blinded_expert_operationalization')[]): FaceCalibrationEvidenceRegistry {
  return {
    ...FACE_CALIBRATION_EVIDENCE_RESEARCH_V0,
    evidence: [
      ...FACE_CALIBRATION_EVIDENCE_RESEARCH_V0.evidence,
      ...classes.map((evidenceClass) => ({
        evidenceId:
          evidenceClass === 'repeat_capture_stability'
            ? 'evidence.nose_bridge.repeat_capture'
            : 'evidence.nose_bridge.blinded_expert',
        version: '1.0.0',
        evidenceClass,
        metricRefs: [metricRef],
        criterionRefs: [criterionId],
        datasetVersion: `${evidenceClass}-v1`,
        provenanceRefs: [`dataset:${evidenceClass}-v1`],
        participantPolicy: 'consented_deidentified' as const,
        ...(evidenceClass === 'blinded_expert_operationalization'
          ? { reviewProtocolRef: 'protocol.blinded-bridge-straight-v1' }
          : {}),
        status: 'reviewed' as const,
      })),
    ],
  };
}

describe('FR-5 calibration evidence authority', () => {
  it('accepts the reviewed synthetic metric fixture registry', () => {
    expect(() => validateFaceCalibrationEvidenceRegistry(FACE_CALIBRATION_EVIDENCE_RESEARCH_V0)).not.toThrow();
  });

  it('rejects human calibration evidence without consented/deidentified policy', () => {
    const invalid: FaceCalibrationEvidenceRegistry = {
      registryId: 'calibration-evidence.invalid',
      version: '1.0.0',
      evidence: [
        {
          evidenceId: 'evidence.invalid.repeat_capture',
          version: '1.0.0',
          evidenceClass: 'repeat_capture_stability',
          metricRefs: [metricRef],
          criterionRefs: [criterionId],
          datasetVersion: 'invalid-v1',
          provenanceRefs: ['dataset:invalid-v1'],
          participantPolicy: 'no_human_subjects',
          status: 'reviewed',
        },
      ],
    };

    expect(() => validateFaceCalibrationEvidenceRegistry(invalid)).toThrow(/consented_deidentified/u);
  });

  it('rejects duplicate refs inside evidence definitions', () => {
    const invalid: FaceCalibrationEvidenceRegistry = {
      registryId: 'calibration-evidence.invalid-duplicate-ref',
      version: '1.0.0',
      evidence: [
        {
          evidenceId: 'evidence.invalid.duplicate-ref',
          version: '1.0.0',
          evidenceClass: 'synthetic_metric_fixture',
          metricRefs: [metricRef, metricRef],
          criterionRefs: [criterionId],
          datasetVersion: 'invalid-duplicate-v1',
          provenanceRefs: ['fixture:a'],
          participantPolicy: 'no_human_subjects',
          status: 'reviewed',
        },
      ],
    };

    expect(() => validateFaceCalibrationEvidenceRegistry(invalid)).toThrow(/duplicate ref/u);
  });

  it('rejects unknown neutral metrics before calibration logic runs', () => {
    const calibration = { ...productionCalibration(), metricRef: 'neutral.nose.magic_score@1.0.0' };
    expect(() => validateFaceCalibrationDefinition(calibration, context())).toThrow(/metricRef references unknown key/u);
  });

  it('rejects duplicate traditional source refs and calibration evidence refs', () => {
    const duplicateSource: FaceCalibrationDefinition = {
      ...productionCalibration(),
      traditionalSourceRefs: [sourceRef, sourceRef],
    };
    expect(() => validateFaceCalibrationDefinition(duplicateSource, context())).toThrow(/traditionalSourceRefs contains duplicate ref/u);

    const duplicateEvidence: FaceCalibrationDefinition = {
      ...productionCalibration(),
      calibrationEvidenceRefs: [
        'evidence.nose_bridge.synthetic_discriminating@0.1.0',
        'evidence.nose_bridge.synthetic_discriminating@0.1.0',
      ],
    };
    expect(() => validateFaceCalibrationDefinition(duplicateEvidence, context())).toThrow(/calibrationEvidenceRefs contains duplicate ref/u);
  });

  it('rejects metric-incompatible bridge decision rules including negative RMS thresholds', () => {
    const negativeThreshold: FaceCalibrationDefinition = {
      ...productionCalibration(),
      decisionRule: { kind: 'max_inclusive', threshold: -0.001 },
    };
    expect(() => validateFaceCalibrationDefinition(negativeThreshold, context())).toThrow(/must be >= 0/u);

    const wrongDirection: FaceCalibrationDefinition = {
      ...productionCalibration(),
      decisionRule: { kind: 'min_inclusive', threshold: 0.02 },
    };
    expect(() => validateFaceCalibrationDefinition(wrongDirection, context())).toThrow(/must use max_inclusive/u);
  });

  it('blocks production calibration while traditional methodology is still research-only', () => {
    expect(() => validateFaceCalibrationDefinition(productionCalibration(), context())).toThrow(
      /production-authorized methodology/u,
    );
  });

  it('does not allow a reviewed synthetic fixture to substitute for repeat-capture evidence', () => {
    const calibration = productionCalibration();
    expect(() =>
      validateFaceCalibrationDefinition(
        calibration,
        context({ faceAuthorityRegistry: promoteTraditionalAuthority() }),
      ),
    ).toThrow(/repeat_capture_stability/u);
  });

  it('still requires blinded expert operationalization after repeat-capture stability is present', () => {
    const evidenceRegistry = withHumanEvidence(['repeat_capture_stability']);
    const calibration = {
      ...productionCalibration(),
      calibrationEvidenceRefs: [
        'evidence.nose_bridge.synthetic_discriminating@0.1.0',
        'evidence.nose_bridge.repeat_capture@1.0.0',
      ],
    };

    expect(() =>
      validateFaceCalibrationDefinition(
        calibration,
        context({
          faceAuthorityRegistry: promoteTraditionalAuthority(),
          calibrationEvidenceRegistry: evidenceRegistry,
        }),
      ),
    ).toThrow(/blinded_expert_operationalization/u);
  });

  it('accepts a structurally complete production calibration only after both empirical evidence classes exist', () => {
    const evidenceRegistry = withHumanEvidence([
      'repeat_capture_stability',
      'blinded_expert_operationalization',
    ]);
    const calibration = {
      ...productionCalibration(),
      calibrationEvidenceRefs: [
        'evidence.nose_bridge.synthetic_discriminating@0.1.0',
        'evidence.nose_bridge.repeat_capture@1.0.0',
        'evidence.nose_bridge.blinded_expert@1.0.0',
      ],
    };

    expect(() =>
      validateFaceCalibrationDefinition(
        calibration,
        context({
          faceAuthorityRegistry: promoteTraditionalAuthority(),
          calibrationEvidenceRegistry: evidenceRegistry,
        }),
      ),
    ).not.toThrow();
  });

  it('requires a decision rule for production but does not provide a threshold in the seed registry', () => {
    const evidenceRegistry = withHumanEvidence([
      'repeat_capture_stability',
      'blinded_expert_operationalization',
    ]);
    const calibration = {
      ...productionCalibration(),
      decisionRule: null,
      calibrationEvidenceRefs: [
        'evidence.nose_bridge.repeat_capture@1.0.0',
        'evidence.nose_bridge.blinded_expert@1.0.0',
      ],
    };

    expect(() =>
      validateFaceCalibrationDefinition(
        calibration,
        context({
          faceAuthorityRegistry: promoteTraditionalAuthority(),
          calibrationEvidenceRegistry: evidenceRegistry,
        }),
      ),
    ).toThrow(/requires decisionRule/u);

    expect(FACE_CALIBRATION_EVIDENCE_RESEARCH_V0.evidence).toHaveLength(1);
    expect(FACE_CALIBRATION_EVIDENCE_RESEARCH_V0.evidence[0]?.evidenceClass).toBe('synthetic_metric_fixture');
  });

  it('keeps arbitrary calibration data from bypassing explicit evidence references', () => {
    const calibration = {
      ...productionCalibration(),
      calibrationEvidenceRefs: ['evidence.unknown@1.0.0'],
    };
    expect(() => validateFaceCalibrationDefinition(calibration, context())).toThrow(FaceAuthorityValidationError);
  });
});
