import {
  EYEBROW_INDEPENDENT_ROLE_VALIDATION_PROTOCOL_AUTHORITY_FR43,
  validateEyebrowIndependentRoleValidationProtocolAuthorityFR43,
  validateEyebrowRoleValidationDatasetFR43,
  type EyebrowCaptureStratumFR43V1,
  type EyebrowRoleValidationDatasetFR43V1,
} from './eyebrow-independent-role-validation-protocol-fr43.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface EyebrowNormalizedPointFR44V1 {
  readonly x: number;
  readonly y: number;
}

export interface EyebrowProviderComponentCurveFR44V1 {
  readonly serializationOrdinal: 1 | 2;
  readonly points: readonly EyebrowNormalizedPointFR44V1[];
}

export interface EyebrowIndependentRimCurveEvidenceFR44V1 {
  readonly annotatorRef: string;
  readonly upperRimPoints: readonly EyebrowNormalizedPointFR44V1[];
  readonly lowerRimPoints: readonly EyebrowNormalizedPointFR44V1[];
  readonly providerComponentsHiddenDuringAnnotation: true;
}

export interface EyebrowSideRoleScoringInputFR44V1 {
  readonly side: 'provider_left' | 'provider_right';
  readonly providerComponents: readonly [
    EyebrowProviderComponentCurveFR44V1,
    EyebrowProviderComponentCurveFR44V1,
  ];
  readonly independentGroundTruth: EyebrowIndependentRimCurveEvidenceFR44V1;
}

export interface EyebrowCaptureRoleScoringInputFR44V1 {
  readonly captureRef: string;
  readonly left: EyebrowSideRoleScoringInputFR44V1;
  readonly right: EyebrowSideRoleScoringInputFR44V1;
}

export type EyebrowObservedRoleAssignmentFR44V1 =
  | 'component_1_upper_component_2_lower'
  | 'component_2_upper_component_1_lower'
  | 'assignment_tie';

export interface EyebrowSideDistanceMatrixFR44V1 {
  readonly component1ToUpper: number;
  readonly component1ToLower: number;
  readonly component2ToUpper: number;
  readonly component2ToLower: number;
}

export interface EyebrowSideRoleScoreFR44V1 {
  readonly side: 'provider_left' | 'provider_right';
  readonly metric: 'symmetric_mean_nearest_neighbor_l2_normalized_xy';
  readonly distanceMatrix: EyebrowSideDistanceMatrixFR44V1;
  readonly component1UpperAssignmentCost: number;
  readonly component2UpperAssignmentCost: number;
  readonly absoluteAssignmentCostMargin: number;
  readonly observedBestAssignment: EyebrowObservedRoleAssignmentFR44V1;
  readonly acceptanceThresholdApplied: false;
  readonly anatomicalRoleMappingAuthorized: false;
}

export interface EyebrowCaptureRoleScoreFR44V1 {
  readonly captureRef: string;
  readonly stratum: EyebrowCaptureStratumFR43V1;
  readonly left: EyebrowSideRoleScoreFR44V1;
  readonly right: EyebrowSideRoleScoreFR44V1;
  readonly bilateralObservedAssignmentConcordant: boolean;
  readonly mappingPassFailDecision: null;
}

export interface EyebrowRoleScoringSummaryFR44V1 {
  readonly captureCount: number;
  readonly scoredSideCount: number;
  readonly assignmentCounts: Readonly<Record<EyebrowObservedRoleAssignmentFR44V1, number>>;
  readonly bilateralConcordantCaptureCount: number;
  readonly bilateralDiscordantOrTieCaptureCount: number;
  readonly perStratumCaptureCounts: Readonly<Record<EyebrowCaptureStratumFR43V1, number>>;
  readonly mappingAccuracy: null;
  readonly repeatabilityError: null;
  readonly poseError: null;
  readonly expressionError: null;
  readonly calibrationThresholdsDefined: false;
  readonly providerComponentRoleMappingValidated: false;
}

export interface EyebrowRoleScoringReportFR44V1 {
  readonly schemaVersion: 'fr44-report-v1';
  readonly datasetRef: string;
  readonly scoringRuleRef: string;
  readonly captureScores: readonly EyebrowCaptureRoleScoreFR44V1[];
  readonly summary: EyebrowRoleScoringSummaryFR44V1;
  readonly researchCandidateAdmitted: false;
  readonly productionGeometryAuthorized: false;
}

export interface EyebrowPreregisteredRoleScoringAuthorityFR44V1 {
  readonly schemaVersion: 'fr44-v1';
  readonly authorityRef: 'authority.face.eyebrow_preregistered_role_scoring.fr44';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'scoring_rule_preregistered_acceptance_thresholds_unset';
  readonly upstreamFR43Ref: string;
  readonly metricContract: {
    readonly coordinateSpace: 'normalized_image_xy';
    readonly pointDistance: 'euclidean_l2';
    readonly directedCurveDistance: 'mean_nearest_neighbor';
    readonly symmetricCurveDistance: 'mean_of_two_directed_mean_nearest_neighbor_distances';
    readonly assignmentRule: 'minimum_total_two_curve_cost';
    readonly exactCostTieMeansAmbiguous: true;
    readonly imageVerticalOrderUsed: false;
    readonly providerSerializationOrderUsedAsGroundTruth: false;
  };
  readonly preregisteredOutputs: readonly [
    'per_side_four_way_distance_matrix',
    'two_assignment_total_costs',
    'absolute_assignment_cost_margin',
    'observed_best_assignment',
    'bilateral_assignment_concordance',
    'capture_stratum_counts',
  ];
  readonly acceptanceThresholds: {
    readonly minimumAssignmentCostMargin: null;
    readonly mappingAccuracy: null;
    readonly bilateralConcordance: null;
    readonly repeatabilityError: null;
    readonly poseError: null;
    readonly expressionError: null;
  };
  readonly authorityBoundary: {
    readonly scoringRuleMeansMappingValidated: false;
    readonly lowestCostAssignmentMeansAnatomicalAuthority: false;
    readonly fr42ImageUpperSignalMayEnterScoringFormula: false;
    readonly providerOrdinalMayEnterGroundTruth: false;
    readonly postHocThresholdSelectionAllowed: false;
    readonly mappingPassFailDecisionAllowedWithoutReviewedThresholds: false;
    readonly providerComponentRoleMappingAuthorized: false;
    readonly neutralBrowGeometryAuthorized: false;
    readonly browMidlineAlgorithmAuthorized: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
}

const FR43_REF = `${EYEBROW_INDEPENDENT_ROLE_VALIDATION_PROTOCOL_AUTHORITY_FR43.authorityRef}@${EYEBROW_INDEPENDENT_ROLE_VALIDATION_PROTOCOL_AUTHORITY_FR43.authorityVersion}`;
const FR44_RULE_REF = 'scoring.face.eyebrow_provider_component_role.fr44@0.1.0';

export const EYEBROW_PREREGISTERED_ROLE_SCORING_AUTHORITY_FR44:
EyebrowPreregisteredRoleScoringAuthorityFR44V1 = Object.freeze({
  schemaVersion: 'fr44-v1' as const,
  authorityRef: 'authority.face.eyebrow_preregistered_role_scoring.fr44' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'scoring_rule_preregistered_acceptance_thresholds_unset' as const,
  upstreamFR43Ref: FR43_REF,
  metricContract: Object.freeze({
    coordinateSpace: 'normalized_image_xy' as const,
    pointDistance: 'euclidean_l2' as const,
    directedCurveDistance: 'mean_nearest_neighbor' as const,
    symmetricCurveDistance: 'mean_of_two_directed_mean_nearest_neighbor_distances' as const,
    assignmentRule: 'minimum_total_two_curve_cost' as const,
    exactCostTieMeansAmbiguous: true as const,
    imageVerticalOrderUsed: false as const,
    providerSerializationOrderUsedAsGroundTruth: false as const,
  }),
  preregisteredOutputs: Object.freeze([
    'per_side_four_way_distance_matrix',
    'two_assignment_total_costs',
    'absolute_assignment_cost_margin',
    'observed_best_assignment',
    'bilateral_assignment_concordance',
    'capture_stratum_counts',
  ] as const),
  acceptanceThresholds: Object.freeze({
    minimumAssignmentCostMargin: null,
    mappingAccuracy: null,
    bilateralConcordance: null,
    repeatabilityError: null,
    poseError: null,
    expressionError: null,
  }),
  authorityBoundary: Object.freeze({
    scoringRuleMeansMappingValidated: false as const,
    lowestCostAssignmentMeansAnatomicalAuthority: false as const,
    fr42ImageUpperSignalMayEnterScoringFormula: false as const,
    providerOrdinalMayEnterGroundTruth: false as const,
    postHocThresholdSelectionAllowed: false as const,
    mappingPassFailDecisionAllowedWithoutReviewedThresholds: false as const,
    providerComponentRoleMappingAuthorized: false as const,
    neutralBrowGeometryAuthorized: false as const,
    browMidlineAlgorithmAuthorized: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
});

function requireNonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FaceAuthorityValidationError(`FR-44 ${label} must be non-empty.`);
  }
  return value;
}

function validatePoint(point: EyebrowNormalizedPointFR44V1, label: string): EyebrowNormalizedPointFR44V1 {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
    throw new FaceAuthorityValidationError(`FR-44 ${label} must be finite normalized image coordinates in [0,1].`);
  }
  return point;
}

function validateCurve(points: readonly EyebrowNormalizedPointFR44V1[], label: string): readonly EyebrowNormalizedPointFR44V1[] {
  if (!Array.isArray(points) || points.length < 2) {
    throw new FaceAuthorityValidationError(`FR-44 ${label} requires at least two points.`);
  }
  points.forEach((point, index) => validatePoint(point, `${label}[${index}]`));
  return points;
}

function pointDistance(a: EyebrowNormalizedPointFR44V1, b: EyebrowNormalizedPointFR44V1): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function directedMeanNearestNeighborDistance(
  from: readonly EyebrowNormalizedPointFR44V1[],
  to: readonly EyebrowNormalizedPointFR44V1[],
): number {
  const total = from.reduce((sum, point) => {
    const nearest = Math.min(...to.map((candidate) => pointDistance(point, candidate)));
    return sum + nearest;
  }, 0);
  return total / from.length;
}

export function symmetricMeanNearestNeighborDistanceFR44(
  first: readonly EyebrowNormalizedPointFR44V1[],
  second: readonly EyebrowNormalizedPointFR44V1[],
): number {
  validateCurve(first, 'first curve');
  validateCurve(second, 'second curve');
  return (
    directedMeanNearestNeighborDistance(first, second) +
    directedMeanNearestNeighborDistance(second, first)
  ) / 2;
}

function validateSideInput(side: EyebrowSideRoleScoringInputFR44V1): EyebrowSideRoleScoringInputFR44V1 {
  if (side.side !== 'provider_left' && side.side !== 'provider_right') {
    throw new FaceAuthorityValidationError('FR-44 side label drift.');
  }
  if (side.providerComponents.length !== 2 || side.providerComponents[0].serializationOrdinal !== 1 || side.providerComponents[1].serializationOrdinal !== 2) {
    throw new FaceAuthorityValidationError(`FR-44 ${side.side} requires provider components in explicit ordinal 1/2 slots; ordinal is an identifier only.`);
  }
  validateCurve(side.providerComponents[0].points, `${side.side} component 1`);
  validateCurve(side.providerComponents[1].points, `${side.side} component 2`);
  requireNonEmpty(side.independentGroundTruth.annotatorRef, `${side.side} annotatorRef`);
  if (side.independentGroundTruth.providerComponentsHiddenDuringAnnotation !== true) {
    throw new FaceAuthorityValidationError(`FR-44 ${side.side} ground truth must remain blinded to provider components.`);
  }
  validateCurve(side.independentGroundTruth.upperRimPoints, `${side.side} upper rim`);
  validateCurve(side.independentGroundTruth.lowerRimPoints, `${side.side} lower rim`);
  return side;
}

export function scoreEyebrowSideRoleAssignmentFR44(
  input: EyebrowSideRoleScoringInputFR44V1,
): EyebrowSideRoleScoreFR44V1 {
  validateEyebrowPreregisteredRoleScoringAuthorityFR44();
  validateSideInput(input);
  const component1 = input.providerComponents[0].points;
  const component2 = input.providerComponents[1].points;
  const upper = input.independentGroundTruth.upperRimPoints;
  const lower = input.independentGroundTruth.lowerRimPoints;
  const distanceMatrix = Object.freeze({
    component1ToUpper: symmetricMeanNearestNeighborDistanceFR44(component1, upper),
    component1ToLower: symmetricMeanNearestNeighborDistanceFR44(component1, lower),
    component2ToUpper: symmetricMeanNearestNeighborDistanceFR44(component2, upper),
    component2ToLower: symmetricMeanNearestNeighborDistanceFR44(component2, lower),
  });
  const component1UpperAssignmentCost = distanceMatrix.component1ToUpper + distanceMatrix.component2ToLower;
  const component2UpperAssignmentCost = distanceMatrix.component2ToUpper + distanceMatrix.component1ToLower;
  const observedBestAssignment: EyebrowObservedRoleAssignmentFR44V1 =
    component1UpperAssignmentCost < component2UpperAssignmentCost
      ? 'component_1_upper_component_2_lower'
      : component2UpperAssignmentCost < component1UpperAssignmentCost
        ? 'component_2_upper_component_1_lower'
        : 'assignment_tie';
  return Object.freeze({
    side: input.side,
    metric: 'symmetric_mean_nearest_neighbor_l2_normalized_xy' as const,
    distanceMatrix,
    component1UpperAssignmentCost,
    component2UpperAssignmentCost,
    absoluteAssignmentCostMargin: Math.abs(component1UpperAssignmentCost - component2UpperAssignmentCost),
    observedBestAssignment,
    acceptanceThresholdApplied: false as const,
    anatomicalRoleMappingAuthorized: false as const,
  });
}

export function validateEyebrowPreregisteredRoleScoringAuthorityFR44(
  authority: EyebrowPreregisteredRoleScoringAuthorityFR44V1 = EYEBROW_PREREGISTERED_ROLE_SCORING_AUTHORITY_FR44,
): EyebrowPreregisteredRoleScoringAuthorityFR44V1 {
  validateEyebrowIndependentRoleValidationProtocolAuthorityFR43();
  if (
    authority.schemaVersion !== 'fr44-v1' ||
    authority.authorityRef !== 'authority.face.eyebrow_preregistered_role_scoring.fr44' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'scoring_rule_preregistered_acceptance_thresholds_unset' ||
    authority.upstreamFR43Ref !== FR43_REF
  ) throw new FaceAuthorityValidationError('FR-44 authority identity/upstream pin drift.');
  if (
    authority.metricContract.coordinateSpace !== 'normalized_image_xy' ||
    authority.metricContract.pointDistance !== 'euclidean_l2' ||
    authority.metricContract.directedCurveDistance !== 'mean_nearest_neighbor' ||
    authority.metricContract.symmetricCurveDistance !== 'mean_of_two_directed_mean_nearest_neighbor_distances' ||
    authority.metricContract.assignmentRule !== 'minimum_total_two_curve_cost' ||
    authority.metricContract.exactCostTieMeansAmbiguous !== true ||
    authority.metricContract.imageVerticalOrderUsed !== false ||
    authority.metricContract.providerSerializationOrderUsedAsGroundTruth !== false
  ) throw new FaceAuthorityValidationError('FR-44 metric contract drift.');
  if (Object.values(authority.acceptanceThresholds).some((value) => value !== null)) {
    throw new FaceAuthorityValidationError('FR-44 acceptance thresholds must remain unset before reviewed calibration evidence.');
  }
  if (Object.values(authority.authorityBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-44 authority boundary must remain fully fail-closed.');
  }
  return authority;
}

function ensureDatasetGroundTruthAnnotator(
  dataset: EyebrowRoleValidationDatasetFR43V1,
  captureRef: string,
  annotatorRef: string,
): void {
  const matching = dataset.groundTruthRecords.some((record) =>
    record.captureRef === captureRef &&
    record.annotatorRef === annotatorRef &&
    record.blindedToProviderComponents === true &&
    record.providerSerializationOrderUsedAsGroundTruth === false,
  );
  if (!matching) {
    throw new FaceAuthorityValidationError(`FR-44 ${captureRef} scoring evidence lacks a matching provider-blinded FR-43 ground-truth annotator record.`);
  }
}

function emptyAssignmentCounts(): Record<EyebrowObservedRoleAssignmentFR44V1, number> {
  return {
    component_1_upper_component_2_lower: 0,
    component_2_upper_component_1_lower: 0,
    assignment_tie: 0,
  };
}

function emptyStratumCounts(): Record<EyebrowCaptureStratumFR43V1, number> {
  return {
    neutral_frontal_baseline: 0,
    repeat_neutral_capture: 0,
    pose_perturbation: 0,
    expression_perturbation: 0,
  };
}

export function buildEyebrowRoleScoringReportFR44(
  dataset: EyebrowRoleValidationDatasetFR43V1,
  scoringInputs: readonly EyebrowCaptureRoleScoringInputFR44V1[],
): EyebrowRoleScoringReportFR44V1 {
  validateEyebrowPreregisteredRoleScoringAuthorityFR44();
  validateEyebrowRoleValidationDatasetFR43(dataset);
  if (dataset.groundTruthFrozen !== true || dataset.providerRunsExecutedAfterFreeze !== true) {
    throw new FaceAuthorityValidationError('FR-44 scoring requires FR-43 ground truth frozen before provider execution.');
  }
  if (scoringInputs.length !== dataset.captures.length) {
    throw new FaceAuthorityValidationError('FR-44 requires exactly one scoring input per FR-43 capture.');
  }
  const captureRefs = scoringInputs.map((input) => input.captureRef);
  if (new Set(captureRefs).size !== captureRefs.length) {
    throw new FaceAuthorityValidationError('FR-44 scoring capture refs must be unique.');
  }
  const datasetCaptureRefs = [...dataset.captures.map((capture) => capture.captureRef)].sort();
  const scoringCaptureRefs = [...captureRefs].sort();
  if (JSON.stringify(datasetCaptureRefs) !== JSON.stringify(scoringCaptureRefs)) {
    throw new FaceAuthorityValidationError('FR-44 scoring capture refs must exactly match the FR-43 dataset captures.');
  }

  const assignmentCounts = emptyAssignmentCounts();
  const perStratumCaptureCounts = emptyStratumCounts();
  let bilateralConcordantCaptureCount = 0;
  const captureScores = scoringInputs.map((input): EyebrowCaptureRoleScoreFR44V1 => {
    requireNonEmpty(input.captureRef, 'captureRef');
    if (input.left.side !== 'provider_left' || input.right.side !== 'provider_right') {
      throw new FaceAuthorityValidationError(`FR-44 ${input.captureRef} must preserve explicit provider-left/provider-right scoring slots.`);
    }
    ensureDatasetGroundTruthAnnotator(dataset, input.captureRef, input.left.independentGroundTruth.annotatorRef);
    ensureDatasetGroundTruthAnnotator(dataset, input.captureRef, input.right.independentGroundTruth.annotatorRef);
    const capture = dataset.captures.find((candidate) => candidate.captureRef === input.captureRef)!;
    const left = scoreEyebrowSideRoleAssignmentFR44(input.left);
    const right = scoreEyebrowSideRoleAssignmentFR44(input.right);
    assignmentCounts[left.observedBestAssignment] += 1;
    assignmentCounts[right.observedBestAssignment] += 1;
    perStratumCaptureCounts[capture.stratum] += 1;
    const bilateralObservedAssignmentConcordant =
      left.observedBestAssignment !== 'assignment_tie' &&
      left.observedBestAssignment === right.observedBestAssignment;
    if (bilateralObservedAssignmentConcordant) bilateralConcordantCaptureCount += 1;
    return Object.freeze({
      captureRef: input.captureRef,
      stratum: capture.stratum,
      left,
      right,
      bilateralObservedAssignmentConcordant,
      mappingPassFailDecision: null,
    });
  });

  const summary: EyebrowRoleScoringSummaryFR44V1 = Object.freeze({
    captureCount: captureScores.length,
    scoredSideCount: captureScores.length * 2,
    assignmentCounts: Object.freeze({ ...assignmentCounts }),
    bilateralConcordantCaptureCount,
    bilateralDiscordantOrTieCaptureCount: captureScores.length - bilateralConcordantCaptureCount,
    perStratumCaptureCounts: Object.freeze({ ...perStratumCaptureCounts }),
    mappingAccuracy: null,
    repeatabilityError: null,
    poseError: null,
    expressionError: null,
    calibrationThresholdsDefined: false as const,
    providerComponentRoleMappingValidated: false as const,
  });
  return Object.freeze({
    schemaVersion: 'fr44-report-v1' as const,
    datasetRef: dataset.datasetRef,
    scoringRuleRef: FR44_RULE_REF,
    captureScores: Object.freeze(captureScores),
    summary,
    researchCandidateAdmitted: false as const,
    productionGeometryAuthorized: false as const,
  });
}

export function assertEyebrowProviderRoleScoringProductionReadyFR44(): never {
  validateEyebrowPreregisteredRoleScoringAuthorityFR44();
  throw new FaceAuthorityValidationError('FR-44 preregisters an observational scoring rule only; reviewed calibration thresholds and validation evidence are still absent.');
}
