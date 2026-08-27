import {
  validateFaceCalibrationDefinition,
  type FaceCalibrationDecisionRule,
  type FaceCalibrationDefinition,
  type FaceCalibrationValidationContext,
} from './calibration-authority.js';
import { FaceAuthorityValidationError } from './validation.js';

const ISSUED_CALIBRATION_AUTHORIZATIONS = new WeakSet<object>();

export interface FaceCalibrationAuthorization {
  readonly calibrationRef: string;
  readonly metricRef: string;
  readonly criterionId: string;
  readonly methodologyRef: string;
  readonly decisionRule: FaceCalibrationDecisionRule;
  readonly calibrationDatasetVersion: string;
  readonly selectionMethodRef: string;
  readonly calibrationEvidenceRefs: readonly string[];
  readonly status: 'production_authorized';
}

function snapshotDecisionRule(rule: FaceCalibrationDecisionRule): FaceCalibrationDecisionRule {
  switch (rule.kind) {
    case 'max_inclusive':
    case 'min_inclusive':
      return Object.freeze({ kind: rule.kind, threshold: rule.threshold });
    case 'between_inclusive':
      return Object.freeze({ kind: rule.kind, min: rule.min, max: rule.max });
  }
}

export function authorizeFaceCalibration(
  calibration: FaceCalibrationDefinition,
  context: FaceCalibrationValidationContext,
): FaceCalibrationAuthorization {
  validateFaceCalibrationDefinition(calibration, context);
  if (calibration.status !== 'production_authorized') {
    throw new FaceAuthorityValidationError(
      `Calibration ${calibration.calibrationId}@${calibration.version} is not production_authorized.`,
    );
  }
  if (calibration.decisionRule === null) {
    throw new FaceAuthorityValidationError(
      `Calibration ${calibration.calibrationId}@${calibration.version} has no decisionRule.`,
    );
  }

  const authorization: FaceCalibrationAuthorization = Object.freeze({
    calibrationRef: `${calibration.calibrationId}@${calibration.version}`,
    metricRef: calibration.metricRef,
    criterionId: calibration.criterionId,
    methodologyRef: calibration.methodologyRef,
    decisionRule: snapshotDecisionRule(calibration.decisionRule),
    calibrationDatasetVersion: calibration.calibrationDatasetVersion,
    selectionMethodRef: calibration.selectionMethodRef,
    calibrationEvidenceRefs: Object.freeze([...calibration.calibrationEvidenceRefs]),
    status: 'production_authorized',
  });
  ISSUED_CALIBRATION_AUTHORIZATIONS.add(authorization);
  return authorization;
}

export function assertIssuedFaceCalibrationAuthorization(
  authorization: FaceCalibrationAuthorization,
): void {
  if (!ISSUED_CALIBRATION_AUTHORIZATIONS.has(authorization)) {
    throw new FaceAuthorityValidationError(
      `Calibration authorization ${authorization.calibrationRef} was not issued by the active calibration authority.`,
    );
  }
}
