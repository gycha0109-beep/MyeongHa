import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { describe, expect, it } from 'vitest';
import {
  EYEBROW_COMPONENT_GEOMETRIC_ROLE_PROBE_AUTHORITY_FR42,
  assertEyebrowProviderComponentRoleMappingReadyFR42,
  inspectMediaPipeEyebrowComponentVerticalSignalFR42,
  validateEyebrowComponentGeometricRoleProbeAuthorityFR42,
  type NormalizedFaceLandmarkFR42V1,
} from '../packages/face-reading/src/index.js';

function syntheticFace(): NormalizedFaceLandmarkFR42V1[] {
  const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const lowerOrdinal1 = [276, 283, 282, 295, 285, 46, 53, 52, 65, 55];
  const upperOrdinal2 = [300, 293, 334, 296, 336, 70, 63, 105, 66, 107];
  lowerOrdinal1.forEach((index, offset) => {
    landmarks[index] = { x: 0.2 + offset * 0.01, y: 0.42 + (offset % 5) * 0.002, z: 0 };
  });
  upperOrdinal2.forEach((index, offset) => {
    landmarks[index] = { x: 0.2 + offset * 0.01, y: 0.38 + (offset % 5) * 0.002, z: 0 };
  });
  return landmarks;
}

describe('FR-42 eyebrow component geometric role probe', () => {
  it('pins the successful single-fixture discovery without promoting authority', () => {
    expect(() => validateEyebrowComponentGeometricRoleProbeAuthorityFR42()).not.toThrow();
    const authority = EYEBROW_COMPONENT_GEOMETRIC_ROLE_PROBE_AUTHORITY_FR42;
    expect(authority.authorityState).toBe('single_fixture_runtime_signal_observed_mapping_unreviewed');
    expect(authority.experimentContract.currentFixtureCount).toBe(1);
    expect(authority.experimentContract.minimumIndependentSubjectsForRoleAdmission).toBeNull();
    expect(authority.experimentContract.noCalibrationThresholdInvented).toBe(true);
    expect(authority.discoveryEvidence).toMatchObject({
      evidenceLevel: 'single_fixture_runtime_signal',
      workflowRunId: 33256613542,
      discoveryHeadCommit: '28ca9ee6e28313ef06368534f988abdb1b5a2eca',
      deterministicReplay: true,
      faceCount: 1,
      landmarkCount: 478,
      leftAggregateVerticalOrder: 'component_2_image_upper',
      rightAggregateVerticalOrder: 'component_2_image_upper',
      providerComponentRoleMappingAuthorized: false,
    });
    expect(authority.discoveryEvidence.leftMeanYDelta).toBeCloseTo(0.012352740764617953, 15);
    expect(authority.discoveryEvidence.rightMeanYDelta).toBeCloseTo(0.011790221929550149, 15);
    expect(Object.values(authority.admissionBoundary).every((value) => value === false)).toBe(true);
  });

  it('measures exact published provider components without assigning anatomy', () => {
    const probe = inspectMediaPipeEyebrowComponentVerticalSignalFR42(FaceLandmarker, syntheticFace());
    expect(probe.left.measurements.map((entry) => entry.providerVertexIndices)).toEqual([
      [276, 282, 283, 285, 295],
      [293, 296, 300, 334, 336],
    ]);
    expect(probe.right.measurements.map((entry) => entry.providerVertexIndices)).toEqual([
      [46, 52, 53, 55, 65],
      [63, 66, 70, 105, 107],
    ]);
    expect(probe.left.aggregateVerticalOrder).toBe('component_2_image_upper');
    expect(probe.right.aggregateVerticalOrder).toBe('component_2_image_upper');
    expect(probe.bothSidesProduceNonTieImageVerticalSignal).toBe(true);
    expect(probe.bothSidesShareSameOrdinalImageUpperSignal).toBe(true);
    expect(probe.providerComponentRoleMappingAuthorized).toBe(false);
    expect(probe.researchCandidateAdmitted).toBe(false);
    expect(probe.productionGeometryAuthorized).toBe(false);
  });

  it('uses normalized image y only as an aggregate image-space statistic', () => {
    const probe = inspectMediaPipeEyebrowComponentVerticalSignalFR42(FaceLandmarker, syntheticFace());
    for (const side of [probe.left, probe.right]) {
      expect(side.coordinateFrame).toBe('normalized_image_top_left_origin');
      expect(side.measurements[1].meanNormalizedY).toBeLessThan(side.measurements[0].meanNormalizedY);
      expect(side.absoluteMeanYDelta).toBeGreaterThan(0);
      expect(side.anatomicalBoundaryRoleAssigned).toBe(false);
      expect(side.componentCorrespondenceAuthorized).toBe(false);
    }
  });

  it('does not invent a threshold when aggregate mean y is tied', () => {
    const landmarks = syntheticFace();
    const allEyebrowIndices = [276, 283, 282, 295, 285, 300, 293, 334, 296, 336, 46, 53, 52, 65, 55, 70, 63, 105, 66, 107];
    allEyebrowIndices.forEach((index) => {
      landmarks[index] = { x: 0.5, y: 0.4, z: 0 };
    });
    const probe = inspectMediaPipeEyebrowComponentVerticalSignalFR42(FaceLandmarker, landmarks);
    expect(probe.left.aggregateVerticalOrder).toBe('aggregate_y_tie');
    expect(probe.right.aggregateVerticalOrder).toBe('aggregate_y_tie');
    expect(probe.bothSidesProduceNonTieImageVerticalSignal).toBe(false);
  });

  it('rejects missing or invalid provider coordinates', () => {
    expect(() => inspectMediaPipeEyebrowComponentVerticalSignalFR42(FaceLandmarker, [])).toThrow(/requires one detected face/u);
    const landmarks = syntheticFace();
    landmarks[276] = { x: 0.3, y: Number.NaN, z: 0 };
    expect(() => inspectMediaPipeEyebrowComponentVerticalSignalFR42(FaceLandmarker, landmarks)).toThrow(/finite normalized coordinate/u);
  });

  it('refuses provider-component anatomical role admission from this probe', () => {
    expect(() => assertEyebrowProviderComponentRoleMappingReadyFR42()).toThrow(/single-fixture image-space vertical signal cannot authorize/u);
  });
});
