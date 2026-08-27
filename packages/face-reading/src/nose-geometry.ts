import { FaceAuthorityValidationError } from './validation.js';

export type NeutralFaceCoordinateFrame = 'pose_normalized_face_2d';

export interface NeutralFacePoint2D {
  readonly x: number;
  readonly y: number;
}

export interface NeutralFaceGeometryProvenance {
  readonly observationContractVersion: string;
  readonly extractorVersion: string;
  readonly modelVersion: string;
  readonly coordinateFrame: NeutralFaceCoordinateFrame;
  readonly poseCompensated: boolean;
  readonly sourceLandmarkRefs: readonly string[];
}

export interface NoseBridgeGeometryInput {
  readonly provenance: NeutralFaceGeometryProvenance;
  readonly centerlinePoints: readonly NeutralFacePoint2D[];
}

export interface NoseTipContourGeometryInput {
  readonly provenance: NeutralFaceGeometryProvenance;
  readonly contourPoints: readonly NeutralFacePoint2D[];
}

export interface NeutralGeometryMetricResult {
  readonly metricKey: string;
  readonly metricVersion: string;
  readonly value: number;
  readonly unit: 'ratio';
  readonly coordinateFrame: NeutralFaceCoordinateFrame;
  readonly classificationApplied: false;
  readonly calibrationApplied: false;
  readonly sourceLandmarkRefs: readonly string[];
}

export interface NeutralFaceGeometryMetricDefinition {
  readonly metricKey: string;
  readonly version: string;
  readonly region: 'nose';
  readonly coordinateFrame: NeutralFaceCoordinateFrame;
  readonly requiredSemanticInputs: readonly string[];
  readonly formula: string;
  readonly unit: 'ratio';
  readonly interpretationBoundary: string;
}

export const FR4_NOSE_NEUTRAL_METRICS_V0: readonly NeutralFaceGeometryMetricDefinition[] = [
  {
    metricKey: 'neutral.nose.bridge.centerline_rms_deviation',
    version: '0.1.0',
    region: 'nose',
    coordinateFrame: 'pose_normalized_face_2d',
    requiredSemanticInputs: ['ordered_nose_bridge_centerline_points'],
    formula: 'RMS(perpendicular distance of interior centerline points from endpoint axis) / endpoint axis length',
    unit: 'ratio',
    interpretationBoundary: 'Continuous observation metric only. It does not classify 梁柱端直 or any physiognomy state.',
  },
  {
    metricKey: 'neutral.nose.tip.contour_circularity',
    version: '0.1.0',
    region: 'nose',
    coordinateFrame: 'pose_normalized_face_2d',
    requiredSemanticInputs: ['ordered_closed_nose_tip_contour_points'],
    formula: '4*pi*polygon_area/(polygon_perimeter^2)',
    unit: 'ratio',
    interpretationBoundary: 'Continuous contour metric only. It does not classify 準圓庫起, fullness, wealth, or 官成.',
  },
];

function finitePoint(point: NeutralFacePoint2D, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new FaceAuthorityValidationError(`${label} must contain finite x/y coordinates.`);
  }
}

function assertPoseNormalized(provenance: NeutralFaceGeometryProvenance): void {
  if (provenance.coordinateFrame !== 'pose_normalized_face_2d') {
    throw new FaceAuthorityValidationError(`Unsupported neutral face coordinate frame: ${provenance.coordinateFrame}`);
  }
  if (!provenance.poseCompensated) {
    throw new FaceAuthorityValidationError('FR-4 nose geometry requires pose-compensated observations.');
  }
  if (provenance.sourceLandmarkRefs.length === 0) {
    throw new FaceAuthorityValidationError('FR-4 nose geometry requires sourceLandmarkRefs provenance.');
  }
}

function distance(a: NeutralFacePoint2D, b: NeutralFacePoint2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function perpendicularDistanceToAxis(
  point: NeutralFacePoint2D,
  start: NeutralFacePoint2D,
  end: NeutralFacePoint2D,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const axisLength = Math.hypot(dx, dy);
  if (axisLength === 0) {
    throw new FaceAuthorityValidationError('Nose bridge endpoint axis must have non-zero length.');
  }
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / axisLength;
}

export function computeNoseBridgeCenterlineDeviation(
  input: NoseBridgeGeometryInput,
): NeutralGeometryMetricResult {
  assertPoseNormalized(input.provenance);
  if (input.centerlinePoints.length < 3) {
    throw new FaceAuthorityValidationError('Nose bridge centerline requires at least 3 ordered points.');
  }
  input.centerlinePoints.forEach((point, index) => finitePoint(point, `centerlinePoints[${index}]`));

  const start = input.centerlinePoints[0]!;
  const end = input.centerlinePoints.at(-1)!;
  const axisLength = distance(start, end);
  if (axisLength === 0) {
    throw new FaceAuthorityValidationError('Nose bridge endpoint axis must have non-zero length.');
  }

  const interior = input.centerlinePoints.slice(1, -1);
  const meanSquared = interior.reduce((sum, point) => {
    const normalized = perpendicularDistanceToAxis(point, start, end) / axisLength;
    return sum + normalized * normalized;
  }, 0) / interior.length;

  return {
    metricKey: 'neutral.nose.bridge.centerline_rms_deviation',
    metricVersion: '0.1.0',
    value: Math.sqrt(meanSquared),
    unit: 'ratio',
    coordinateFrame: input.provenance.coordinateFrame,
    classificationApplied: false,
    calibrationApplied: false,
    sourceLandmarkRefs: input.provenance.sourceLandmarkRefs,
  };
}

function polygonArea(points: readonly NeutralFacePoint2D[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
}

function polygonPerimeter(points: readonly NeutralFacePoint2D[]): number {
  let perimeter = 0;
  for (let index = 0; index < points.length; index += 1) {
    perimeter += distance(points[index]!, points[(index + 1) % points.length]!);
  }
  return perimeter;
}

function orientation(a: NeutralFacePoint2D, b: NeutralFacePoint2D, c: NeutralFacePoint2D): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function segmentsIntersect(
  a: NeutralFacePoint2D,
  b: NeutralFacePoint2D,
  c: NeutralFacePoint2D,
  d: NeutralFacePoint2D,
): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function assertSimplePolygon(points: readonly NeutralFacePoint2D[]): void {
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      const adjacent =
        first === second ||
        firstNext === second ||
        secondNext === first ||
        (first === 0 && secondNext === 0);
      if (adjacent) continue;
      if (segmentsIntersect(points[first]!, points[firstNext]!, points[second]!, points[secondNext]!)) {
        throw new FaceAuthorityValidationError('Nose-tip contour must be an ordered non-self-intersecting polygon.');
      }
    }
  }
}

export function computeNoseTipContourCircularity(
  input: NoseTipContourGeometryInput,
): NeutralGeometryMetricResult {
  assertPoseNormalized(input.provenance);
  if (input.contourPoints.length < 6) {
    throw new FaceAuthorityValidationError('Nose-tip contour requires at least 6 ordered points.');
  }
  input.contourPoints.forEach((point, index) => finitePoint(point, `contourPoints[${index}]`));
  assertSimplePolygon(input.contourPoints);

  const area = polygonArea(input.contourPoints);
  const perimeter = polygonPerimeter(input.contourPoints);
  if (area <= 0 || perimeter <= 0) {
    throw new FaceAuthorityValidationError('Nose-tip contour requires positive polygon area and perimeter.');
  }

  const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
  if (!Number.isFinite(circularity) || circularity <= 0 || circularity > 1.000000001) {
    throw new FaceAuthorityValidationError(`Nose-tip contour produced invalid circularity=${circularity}.`);
  }

  return {
    metricKey: 'neutral.nose.tip.contour_circularity',
    metricVersion: '0.1.0',
    value: circularity,
    unit: 'ratio',
    coordinateFrame: input.provenance.coordinateFrame,
    classificationApplied: false,
    calibrationApplied: false,
    sourceLandmarkRefs: input.provenance.sourceLandmarkRefs,
  };
}

export interface NoseCriterionCalibrationDefinition {
  readonly calibrationId: string;
  readonly metricRef: string;
  readonly criterionId: 'criterion.discernment.bridge_straight' | 'criterion.discernment.tip_round_full';
  readonly evidenceRefs: readonly string[];
  readonly calibrationDatasetVersion: string;
  readonly thresholdPolicy: unknown;
  readonly status: 'research' | 'reviewed' | 'production_authorized';
}

export function assertNoseCriterionCalibrationReady(
  calibration: NoseCriterionCalibrationDefinition | undefined,
): asserts calibration is NoseCriterionCalibrationDefinition & { readonly status: 'production_authorized' } {
  if (calibration === undefined) {
    throw new FaceAuthorityValidationError('Nose criterion classification is blocked until an explicit calibration definition exists.');
  }
  if (calibration.status !== 'production_authorized') {
    throw new FaceAuthorityValidationError(
      `Nose criterion classification is blocked: calibration ${calibration.calibrationId} status=${calibration.status}.`,
    );
  }
  if (calibration.evidenceRefs.length === 0 || calibration.calibrationDatasetVersion.trim().length === 0) {
    throw new FaceAuthorityValidationError('Production nose calibration requires evidenceRefs and calibrationDatasetVersion.');
  }
}

export const MEDIAPIPE_FACE_LANDMARKER_FR4_CANDIDATE_V0 = Object.freeze({
  provider: 'google_mediapipe_face_landmarker',
  taskOutputLandmarkCount: 478,
  taskOutputIncludesTransformationMatrices: true,
  taskDocumentationLastUpdatedUtc: '2026-08-17',
  legacyCanonicalGeometryLandmarkCount: 468,
  semanticAnchorBindingStatus: 'unresolved' as const,
  productionBindingAllowed: false,
  reason:
    'Current Face Landmarker output and legacy canonical geometry documentation use different published landmark counts; provider landmark indices are not promoted to MyeongHa semantic nose anchors without a versioned adapter review.',
});
