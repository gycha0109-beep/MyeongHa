import { describe, expect, it } from 'vitest';
import {
  computeNoseBridgeCenterlineDeviation,
  computeNoseTipContourCircularity,
  type NeutralFaceGeometryProvenance,
  type NeutralFacePoint2D,
} from '../packages/face-reading/src/index.js';

const provenance: NeutralFaceGeometryProvenance = {
  observationContractVersion: 'neutral-face-observation-v0',
  extractorVersion: 'synthetic-discriminating-v1',
  modelVersion: 'none',
  coordinateFrame: 'pose_normalized_face_2d',
  poseCompensated: true,
  sourceLandmarkRefs: ['fixture:p0', 'fixture:p1', 'fixture:p2'],
};

function bridge(offset: number): readonly NeutralFacePoint2D[] {
  return [
    { x: 0, y: 0 },
    { x: offset, y: 0.5 },
    { x: 0, y: 1 },
  ];
}

function ellipse(rx: number, ry: number, count = 64): readonly NeutralFacePoint2D[] {
  return Array.from({ length: count }, (_, index) => {
    const theta = (2 * Math.PI * index) / count;
    return { x: rx * Math.cos(theta), y: ry * Math.sin(theta) };
  });
}

describe('FR-4 discriminating synthetic fixtures', () => {
  it('orders bridge deviation monotonically without assigning a traditional class', () => {
    const straight = computeNoseBridgeCenterlineDeviation({ provenance, centerlinePoints: bridge(0) });
    const mild = computeNoseBridgeCenterlineDeviation({ provenance, centerlinePoints: bridge(0.03) });
    const stronger = computeNoseBridgeCenterlineDeviation({ provenance, centerlinePoints: bridge(0.1) });

    expect(straight.value).toBeLessThan(mild.value);
    expect(mild.value).toBeLessThan(stronger.value);
    expect([straight, mild, stronger].every((result) => result.classificationApplied === false)).toBe(true);
  });

  it('is mirror-symmetric for equal left/right bridge displacement', () => {
    const left = computeNoseBridgeCenterlineDeviation({ provenance, centerlinePoints: bridge(-0.07) });
    const right = computeNoseBridgeCenterlineDeviation({ provenance, centerlinePoints: bridge(0.07) });

    expect(left.value).toBeCloseTo(right.value, 12);
  });

  it('distinguishes a circular contour from an elongated contour without calling either 準圓庫起', () => {
    const circular = computeNoseTipContourCircularity({ provenance, contourPoints: ellipse(1, 1) });
    const elongated = computeNoseTipContourCircularity({ provenance, contourPoints: ellipse(2, 0.5) });

    expect(circular.value).toBeGreaterThan(elongated.value);
    expect(circular.classificationApplied).toBe(false);
    expect(elongated.classificationApplied).toBe(false);
  });
});
