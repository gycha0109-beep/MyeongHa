import { describe, expect, it } from 'vitest';
import {
  EYEBROW_INDEPENDENT_ROLE_VALIDATION_PROTOCOL_AUTHORITY_FR43,
  assessEyebrowRoleValidationReadinessFR43,
  assertEyebrowProviderComponentRoleMappingReadyFR43,
  validateEyebrowIndependentRoleValidationProtocolAuthorityFR43,
  validateEyebrowRoleValidationDatasetFR43,
  type EyebrowRoleValidationDatasetFR43V1,
} from '../packages/face-reading/src/index.js';

function validDataset(): EyebrowRoleValidationDatasetFR43V1 {
  return {
    schemaVersion: 'fr43-dataset-v1',
    datasetRef: 'dataset.fr43.fixture.alpha',
    subjects: [
      { subjectRef: 'subject.alpha', independentSubject: true },
    ],
    captures: [
      {
        captureRef: 'capture.alpha.baseline',
        subjectRef: 'subject.alpha',
        stratum: 'neutral_frontal_baseline',
        canonicalAssetDigest: 'sha256:baseline',
        capturedAt: '2026-08-29T00:00:00Z',
        imageWidth: 640,
        imageHeight: 640,
        deviceRef: 'device.fixture',
        neutralInstructionApplied: true,
        poseLabel: null,
        expressionLabel: null,
        groundTruthLockedBeforeProviderRun: true,
        providerComponentRolePrediction: null,
      },
      {
        captureRef: 'capture.alpha.repeat',
        subjectRef: 'subject.alpha',
        stratum: 'repeat_neutral_capture',
        canonicalAssetDigest: 'sha256:repeat',
        capturedAt: '2026-08-29T00:01:00Z',
        imageWidth: 640,
        imageHeight: 640,
        deviceRef: 'device.fixture',
        neutralInstructionApplied: true,
        poseLabel: null,
        expressionLabel: null,
        groundTruthLockedBeforeProviderRun: true,
        providerComponentRolePrediction: null,
      },
      {
        captureRef: 'capture.alpha.pose',
        subjectRef: 'subject.alpha',
        stratum: 'pose_perturbation',
        canonicalAssetDigest: 'sha256:pose',
        capturedAt: '2026-08-29T00:02:00Z',
        imageWidth: 640,
        imageHeight: 640,
        deviceRef: 'device.fixture',
        neutralInstructionApplied: false,
        poseLabel: 'yaw_positive',
        expressionLabel: null,
        groundTruthLockedBeforeProviderRun: true,
        providerComponentRolePrediction: null,
      },
      {
        captureRef: 'capture.alpha.expression',
        subjectRef: 'subject.alpha',
        stratum: 'expression_perturbation',
        canonicalAssetDigest: 'sha256:expression',
        capturedAt: '2026-08-29T00:03:00Z',
        imageWidth: 640,
        imageHeight: 640,
        deviceRef: 'device.fixture',
        neutralInstructionApplied: false,
        poseLabel: null,
        expressionLabel: 'brow_raise',
        groundTruthLockedBeforeProviderRun: true,
        providerComponentRolePrediction: null,
      },
    ],
    groundTruthRecords: [
      'capture.alpha.baseline',
      'capture.alpha.repeat',
      'capture.alpha.pose',
      'capture.alpha.expression',
    ].map((captureRef) => ({
      captureRef,
      annotatorRef: 'annotator.alpha',
      blindedToProviderComponents: true as const,
      upperRimAnnotationRef: `${captureRef}:upper`,
      lowerRimAnnotationRef: `${captureRef}:lower`,
      medialEndpointAnnotationRef: `${captureRef}:medial`,
      lateralEndpointAnnotationRef: `${captureRef}:lateral`,
      providerSerializationOrderUsedAsGroundTruth: false as const,
    })),
    groundTruthFrozen: true,
    providerRunsExecutedAfterFreeze: true,
  };
}

describe('FR-43 independent eyebrow component-role validation protocol', () => {
  it('defines a provider-blinded annotation and controlled-capture protocol without inventing thresholds', () => {
    expect(() => validateEyebrowIndependentRoleValidationProtocolAuthorityFR43()).not.toThrow();
    const authority = EYEBROW_INDEPENDENT_ROLE_VALIDATION_PROTOCOL_AUTHORITY_FR43;
    expect(authority.authorityState).toBe('protocol_defined_no_validation_dataset');
    expect(authority.independentAnnotationProtocol.annotatorSeesProviderComponentIndices).toBe(false);
    expect(authority.independentAnnotationProtocol.annotatorSeesProviderPredictedRole).toBe(false);
    expect(authority.independentAnnotationProtocol.providerOutputGeneratedAfterGroundTruthLock).toBe(true);
    expect(authority.independentAnnotationProtocol.providerSerializationOrderMayDefineGroundTruth).toBe(false);
    expect(authority.controlledCaptureProtocol.requiredStrata).toEqual([
      'neutral_frontal_baseline',
      'repeat_neutral_capture',
      'pose_perturbation',
      'expression_perturbation',
    ]);
    expect(Object.values(authority.acceptanceThresholds).every((value) => value === null)).toBe(true);
    expect(Object.values(authority.authorityBoundary).every((value) => value === false)).toBe(true);
  });

  it('keeps readiness fail-closed when no validation dataset exists', () => {
    const readiness = assessEyebrowRoleValidationReadinessFR43(null);
    expect(readiness.protocolDefined).toBe(true);
    expect(readiness.validationDatasetPresent).toBe(false);
    expect(readiness.providerComponentRoleMappingValidated).toBe(false);
    expect(readiness.calibrationThresholdsDefined).toBe(false);
    expect(readiness.researchCandidateAdmitted).toBe(false);
    expect(readiness.blockers).toContain('validation_dataset_missing');
  });

  it('accepts a structurally complete blinded fixture manifest but still does not validate mapping', () => {
    const dataset = validDataset();
    expect(() => validateEyebrowRoleValidationDatasetFR43(dataset)).not.toThrow();
    const readiness = assessEyebrowRoleValidationReadinessFR43(dataset);
    expect(readiness.validationDatasetPresent).toBe(true);
    expect(readiness.allRequiredCaptureStrataPresent).toBe(true);
    expect(readiness.repeatedNeutralCaptureEvidencePresent).toBe(true);
    expect(readiness.independentGroundTruthPresentForEveryCapture).toBe(true);
    expect(readiness.groundTruthFrozenBeforeProviderRun).toBe(true);
    expect(readiness.providerComponentRoleMappingValidated).toBe(false);
    expect(readiness.leftRightMappingReproducibilityValidated).toBe(false);
    expect(readiness.poseStabilityValidated).toBe(false);
    expect(readiness.expressionStabilityValidated).toBe(false);
    expect(readiness.repeatabilityValidated).toBe(false);
    expect(readiness.calibrationThresholdsDefined).toBe(false);
    expect(readiness.blockers).toContain('provider_component_role_mapping_not_yet_scored');
  });

  it('rejects provider-informed ground truth', () => {
    const dataset = validDataset();
    const first = dataset.groundTruthRecords[0]!;
    const contaminated: EyebrowRoleValidationDatasetFR43V1 = {
      ...dataset,
      groundTruthRecords: [
        { ...first, blindedToProviderComponents: false as true },
        ...dataset.groundTruthRecords.slice(1),
      ],
    };
    expect(() => validateEyebrowRoleValidationDatasetFR43(contaminated)).toThrow(/not provider-blinded/u);
  });

  it('rejects missing pose/expression labels and invalid freeze ordering', () => {
    const dataset = validDataset();
    const invalidPose: EyebrowRoleValidationDatasetFR43V1 = {
      ...dataset,
      captures: dataset.captures.map((capture) =>
        capture.stratum === 'pose_perturbation' ? { ...capture, poseLabel: null } : capture,
      ),
    };
    expect(() => validateEyebrowRoleValidationDatasetFR43(invalidPose)).toThrow(/requires a pose label/u);

    const invalidFreeze: EyebrowRoleValidationDatasetFR43V1 = {
      ...dataset,
      captures: dataset.captures.map((capture, index) =>
        index === 0 ? { ...capture, groundTruthLockedBeforeProviderRun: false as true } : capture,
      ),
    };
    expect(() => validateEyebrowRoleValidationDatasetFR43(invalidFreeze)).toThrow(/lock ground truth before provider execution/u);
  });

  it('refuses provider-component role readiness from protocol definition alone', () => {
    expect(() => assertEyebrowProviderComponentRoleMappingReadyFR43()).toThrow(/no reviewed validation dataset or calibration thresholds/u);
  });
});
