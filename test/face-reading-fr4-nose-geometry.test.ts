import { describe, expect, it } from 'vitest';
import {
  FR4_NOSE_NEUTRAL_METRICS_V0,
  MEDIAPIPE_FACE_LANDMARKER_FR4_CANDIDATE_V0,
  NOSE_TIP_TRADITIONAL_BINDING_V0,
  FaceAuthorityValidationError,
  assertNoseBridgeCalibrationReady,
  computeNoseBridgeCenterlineDeviation,
  computeNoseTipContourCircularity,
  type NeutralFaceGeometryProvenance,
  type NeutralFacePoint2D,
} from '../packages/face-reading/src/index.js';

const provenance: NeutralFaceGeometryProvenance = {
  observationContractVersion: 'neutral-face-observation-v0',
  extractorVersion: 'synthetic-test-extractor-v1',
  modelVersion: 'synthetic-test-model-v1',
  coordinateFrame: 'pose_normalized_face_2d',
  poseCompensated: true,
  sourceLandmarkRefs: ['synthetic:p0', 'synthetic:p1', 'synthetic:p2'],
};

function regularPolygon(count: number, radius: number): readonly NeutralFacePoint2D[] {
  return Array.from({ length: count }, (_, index) => {
    const theta = (Math.PI * 2 * index) / count;
    return { x: Math.cos(theta) * radius, y: Math.sin(theta) * radius };
  });
}

describe('FR-4 neutral nose bridge geometry', () => {
  it('returns zero for an exactly straight ordered bridge centerline', () => {
    const result = computeNoseBridgeCenterlineDeviation({
      provenance,
      centerlinePoints: [
        { x: 0, y: 0 },
        { x: 0, y: 0.5 },
        { x: 0, y: 1 },
      ],
    });

    expect(result.metricKey).toBe('neutral.nose.bridge.centerline_rms_deviation');
    expect(result.value).toBe(0);
    expect(result.classificationApplied).toBe(false);
    expect(result.calibrationApplied).toBe(false);
  });

  it('produces a positive continuous deviation without classifying straight/not-straight', () => {
    const result = computeNoseBridgeCenterlineDeviation({
      provenance,
      centerlinePoints: [
        { x: 0, y: 0 },
        { x: 0.1, y: 0.5 },
        { x: 0, y: 1 },
      ],
    });

    expect(result.value).toBeCloseTo(0.1, 12);
    expect(result.classificationApplied).toBe(false);
  });

  it('is invariant to uniform coordinate scale', () => {
    const first = computeNoseBridgeCenterlineDeviation({
      provenance,
      centerlinePoints: [
        { x: 0, y: 0 },
        { x: 0.1, y: 0.5 },
        { x: 0, y: 1 },
      ],
    });
    const second = computeNoseBridgeCenterlineDeviation({
      provenance,
      centerlinePoints: [
        { x: 0, y: 0 },
        { x: 1, y: 5 },
        { x: 0, y: 10 },
      ],
    });

    expect(second.value).toBeCloseTo(first.value, 12);
  });

  it('rejects non-pose-normalized or provenance-free input', () => {
    expect(() =>
      computeNoseBridgeCenterlineDeviation({
        provenance: { ...provenance, poseCompensated: false },
        centerlinePoints: [{ x: 0, y: 0 }, { x: 0, y: 0.5 }, { x: 0, y: 1 }],
      }),
    ).toThrow(/pose-compensated/u);

    expect(() =>
      computeNoseBridgeCenterlineDeviation({
        provenance: { ...provenance, sourceLandmarkRefs: [] },
        centerlinePoints: [{ x: 0, y: 0 }, { x: 0, y: 0.5 }, { x: 0, y: 1 }],
      }),
    ).toThrow(/sourceLandmarkRefs/u);
  });
});

describe('FR-4 neutral nose-tip contour geometry', () => {
  it('computes a scale-invariant circularity metric for an ordered simple contour', () => {
    const first = computeNoseTipContourCircularity({ provenance, contourPoints: regularPolygon(64, 1) });
    const second = computeNoseTipContourCircularity({ provenance, contourPoints: regularPolygon(64, 10) });

    expect(first.metricKey).toBe('neutral.nose.tip.contour_circularity');
    expect(first.value).toBeGreaterThan(0.99);
    expect(first.value).toBeLessThanOrEqual(1);
    expect(second.value).toBeCloseTo(first.value, 12);
    expect(first.classificationApplied).toBe(false);
  });

  it('rejects insufficient, degenerate, and duplicate-closure contours', () => {
    expect(() =>
      computeNoseTipContourCircularity({
        provenance,
        contourPoints: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
      }),
    ).toThrow(/at least 6/u);

    expect(() =>
      computeNoseTipContourCircularity({
        provenance,
        contourPoints: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
          { x: 3, y: 0 },
          { x: 4, y: 0 },
          { x: 5, y: 0 },
        ],
      }),
    ).toThrow(/positive polygon area/u);

    const contour = regularPolygon(6, 1);
    expect(() =>
      computeNoseTipContourCircularity({
        provenance,
        contourPoints: [...contour, contour[0]!],
      }),
    ).toThrow(/must not repeat vertices/u);
  });
});

describe('FR-4 calibration and provider binding gates', () => {
  it('registers neutral metrics as observation measurements rather than physiognomy classifications', () => {
    expect(FR4_NOSE_NEUTRAL_METRICS_V0).toHaveLength(2);
    expect(FR4_NOSE_NEUTRAL_METRICS_V0.every((metric) => metric.metricKey.startsWith('neutral.nose.'))).toBe(true);
    expect(FR4_NOSE_NEUTRAL_METRICS_V0.some((metric) => metric.interpretationBoundary.includes('does not classify'))).toBe(true);
  });

  it('blocks bridge criterion classification until an explicit production calibration exists', () => {
    expect(() => assertNoseBridgeCalibrationReady(undefined)).toThrow(/explicit calibration/u);
    expect(() =>
      assertNoseBridgeCalibrationReady({
        calibrationId: 'calibration.nose.bridge.research_v0',
        metricRef: 'neutral.nose.bridge.centerline_rms_deviation@0.1.0',
        criterionId: 'criterion.discernment.bridge_straight',
        evidenceRefs: ['fixture-set.synthetic-nose-v0'],
        calibrationDatasetVersion: 'synthetic-nose-v0',
        thresholdPolicy: { kind: 'max_inclusive', maxRmsDeviation: 0.02 },
        status: 'research',
      }),
    ).toThrow(/status=research/u);
  });

  it('refuses to calibrate 準圓庫起 from 2D circularity alone', () => {
    expect(NOSE_TIP_TRADITIONAL_BINDING_V0).toMatchObject({
      criterionId: 'criterion.discernment.tip_round_full',
      bindingStatus: 'blocked_under_observed',
      calibrationAllowed: false,
    });
    expect(NOSE_TIP_TRADITIONAL_BINDING_V0.missingEvidenceDimensions).toEqual([
      'tip_fullness',
      'tip_projection_or_depth',
    ]);
  });

  it('keeps the current MediaPipe provider-index binding unresolved', () => {
    expect(MEDIAPIPE_FACE_LANDMARKER_FR4_CANDIDATE_V0).toMatchObject({
      taskOutputLandmarkCount: 478,
      legacyCanonicalGeometryLandmarkCount: 468,
      semanticAnchorBindingStatus: 'unresolved',
      productionBindingAllowed: false,
    });
  });

  it('rejects non-finite geometry rather than allowing provider garbage to become evidence', () => {
    expect(() =>
      computeNoseBridgeCenterlineDeviation({
        provenance,
        centerlinePoints: [
          { x: 0, y: 0 },
          { x: Number.NaN, y: 0.5 },
          { x: 0, y: 1 },
        ],
      }),
    ).toThrow(FaceAuthorityValidationError);
  });
});
