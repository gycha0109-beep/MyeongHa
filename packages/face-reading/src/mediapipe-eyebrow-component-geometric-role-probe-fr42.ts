import {
  inspectMediaPipePublishedEyebrowComponentsFR39,
  validateMediaPipePublishedEyebrowComponentDecompositionAuthorityFR39,
  type PublishedEyebrowComponentEvidenceFR39V1,
  type PublishedEyebrowTopologySymbolFR39V1,
} from './mediapipe-published-eyebrow-component-decomposition-fr39.js';
import {
  EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41,
  validateEyebrowNeutralAnatomicalAdmissionAuthorityFR41,
} from './eyebrow-neutral-anatomical-evidence-admission-fr41.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface NormalizedFaceLandmarkFR42V1 {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
  readonly visibility?: number;
}

export type EyebrowImageVerticalOrderFR42V1 =
  | 'component_1_image_upper'
  | 'component_2_image_upper'
  | 'aggregate_y_tie';

export interface EyebrowComponentVerticalMeasurementFR42V1 {
  readonly serializationOrdinal: 1 | 2;
  readonly providerVertexIndices: readonly number[];
  readonly meanNormalizedY: number;
  readonly medianNormalizedY: number;
  readonly minNormalizedY: number;
  readonly maxNormalizedY: number;
}

export interface EyebrowSideVerticalSignalFR42V1 {
  readonly topologySymbol: PublishedEyebrowTopologySymbolFR39V1;
  readonly coordinateFrame: 'normalized_image_top_left_origin';
  readonly measurements: readonly [
    EyebrowComponentVerticalMeasurementFR42V1,
    EyebrowComponentVerticalMeasurementFR42V1,
  ];
  readonly aggregateVerticalOrder: EyebrowImageVerticalOrderFR42V1;
  readonly absoluteMeanYDelta: number;
  readonly anatomicalBoundaryRoleAssigned: false;
  readonly componentCorrespondenceAuthorized: false;
}

export interface EyebrowComponentGeometricRoleProbeFR42V1 {
  readonly schemaVersion: 'fr42-probe-v1';
  readonly left: EyebrowSideVerticalSignalFR42V1;
  readonly right: EyebrowSideVerticalSignalFR42V1;
  readonly bothSidesProduceNonTieImageVerticalSignal: boolean;
  readonly bothSidesShareSameOrdinalImageUpperSignal: boolean;
  readonly providerComponentRoleMappingAuthorized: false;
  readonly researchCandidateAdmitted: false;
  readonly productionGeometryAuthorized: false;
}

export interface EyebrowComponentGeometricRoleProbeAuthorityFR42V1 {
  readonly schemaVersion: 'fr42-authority-v1';
  readonly authorityRef: 'authority.face.eyebrow_component_geometric_role_probe.fr42';
  readonly authorityVersion: '0.1.0';
  readonly authorityState: 'runtime_probe_defined_single_fixture_insufficient';
  readonly packageName: '@mediapipe/tasks-vision';
  readonly packageVersion: '0.10.35';
  readonly upstreamFR41Ref: string;
  readonly coordinateEvidence: {
    readonly normalizedXYRange: '[0,1]';
    readonly imageOrigin: 'top_left';
    readonly smallerYMeansImageUpper: true;
    readonly evidenceScope: 'image_coordinate_interpretation_only';
  };
  readonly experimentContract: {
    readonly exactProviderTopologyRequired: true;
    readonly twoReplayDeterminismRequired: true;
    readonly leftAndRightMeasuredIndependently: true;
    readonly aggregateStatistic: 'mean_normalized_y_per_provider_component';
    readonly noCalibrationThresholdInvented: true;
    readonly minimumIndependentSubjectsForRoleAdmission: null;
    readonly currentFixtureCount: 1;
  };
  readonly admissionBoundary: {
    readonly imageUpperMeansAnatomicalUpperBoundary: false;
    readonly singleFixtureSignalMeansProviderRoleMapping: false;
    readonly sameOrdinalSignalAcrossBothSidesMeansSerializationSemanticAuthority: false;
    readonly meanYStatisticMeansPointwiseCorrespondence: false;
    readonly providerIndexMeansAnatomicalLandmarkAuthority: false;
    readonly runtimeProbeMayPromoteFR41ProviderMappingGate: false;
    readonly researchCandidateAdmissionAllowed: false;
    readonly browMidlineAlgorithmAuthorized: false;
    readonly productionThreeDivisionsMetricAllowed: false;
    readonly productionF1Allowed: false;
    readonly productionF6Allowed: false;
  };
}

const FR41_REF = `${EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41.authorityRef}@${EYEBROW_NEUTRAL_ANATOMICAL_ADMISSION_AUTHORITY_FR41.authorityVersion}`;

export const EYEBROW_COMPONENT_GEOMETRIC_ROLE_PROBE_AUTHORITY_FR42: EyebrowComponentGeometricRoleProbeAuthorityFR42V1 = Object.freeze({
  schemaVersion: 'fr42-authority-v1' as const,
  authorityRef: 'authority.face.eyebrow_component_geometric_role_probe.fr42' as const,
  authorityVersion: '0.1.0' as const,
  authorityState: 'runtime_probe_defined_single_fixture_insufficient' as const,
  packageName: '@mediapipe/tasks-vision' as const,
  packageVersion: '0.10.35' as const,
  upstreamFR41Ref: FR41_REF,
  coordinateEvidence: Object.freeze({
    normalizedXYRange: '[0,1]' as const,
    imageOrigin: 'top_left' as const,
    smallerYMeansImageUpper: true as const,
    evidenceScope: 'image_coordinate_interpretation_only' as const,
  }),
  experimentContract: Object.freeze({
    exactProviderTopologyRequired: true as const,
    twoReplayDeterminismRequired: true as const,
    leftAndRightMeasuredIndependently: true as const,
    aggregateStatistic: 'mean_normalized_y_per_provider_component' as const,
    noCalibrationThresholdInvented: true as const,
    minimumIndependentSubjectsForRoleAdmission: null,
    currentFixtureCount: 1 as const,
  }),
  admissionBoundary: Object.freeze({
    imageUpperMeansAnatomicalUpperBoundary: false as const,
    singleFixtureSignalMeansProviderRoleMapping: false as const,
    sameOrdinalSignalAcrossBothSidesMeansSerializationSemanticAuthority: false as const,
    meanYStatisticMeansPointwiseCorrespondence: false as const,
    providerIndexMeansAnatomicalLandmarkAuthority: false as const,
    runtimeProbeMayPromoteFR41ProviderMappingGate: false as const,
    researchCandidateAdmissionAllowed: false as const,
    browMidlineAlgorithmAuthorized: false as const,
    productionThreeDivisionsMetricAllowed: false as const,
    productionF1Allowed: false as const,
    productionF6Allowed: false as const,
  }),
});

function finiteNormalized(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new FaceAuthorityValidationError(`FR-42 ${label} must be a finite normalized coordinate in [0,1].`);
  }
  return value;
}

function componentVertexIndices(component: PublishedEyebrowComponentEvidenceFR39V1): readonly number[] {
  const indices = [...new Set(component.providerEdgeEvidence.flatMap((edge) => [edge.start, edge.end]))].sort((a, b) => a - b);
  if (indices.length !== 5) throw new FaceAuthorityValidationError('FR-42 provider eyebrow component must contain exactly five unique vertices.');
  return Object.freeze(indices);
}

function measureComponent(
  component: PublishedEyebrowComponentEvidenceFR39V1,
  landmarks: readonly NormalizedFaceLandmarkFR42V1[],
): EyebrowComponentVerticalMeasurementFR42V1 {
  const indices = componentVertexIndices(component);
  const ys = indices.map((index) => {
    const landmark = landmarks[index];
    if (!landmark) throw new FaceAuthorityValidationError(`FR-42 missing provider landmark index ${index}.`);
    finiteNormalized(landmark.x, `landmark ${index} x`);
    return finiteNormalized(landmark.y, `landmark ${index} y`);
  });
  const sortedY = [...ys].sort((a, b) => a - b);
  const mean = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  return Object.freeze({
    serializationOrdinal: component.serializationOrdinal,
    providerVertexIndices: indices,
    meanNormalizedY: mean,
    medianNormalizedY: sortedY[2]!,
    minNormalizedY: sortedY[0]!,
    maxNormalizedY: sortedY[sortedY.length - 1]!,
  });
}

function inspectSide(
  topologySymbol: PublishedEyebrowTopologySymbolFR39V1,
  components: readonly [PublishedEyebrowComponentEvidenceFR39V1, PublishedEyebrowComponentEvidenceFR39V1],
  landmarks: readonly NormalizedFaceLandmarkFR42V1[],
): EyebrowSideVerticalSignalFR42V1 {
  const measurements = Object.freeze([
    measureComponent(components[0], landmarks),
    measureComponent(components[1], landmarks),
  ]) as unknown as readonly [EyebrowComponentVerticalMeasurementFR42V1, EyebrowComponentVerticalMeasurementFR42V1];
  const delta = measurements[0].meanNormalizedY - measurements[1].meanNormalizedY;
  const aggregateVerticalOrder: EyebrowImageVerticalOrderFR42V1 =
    delta < 0 ? 'component_1_image_upper' : delta > 0 ? 'component_2_image_upper' : 'aggregate_y_tie';
  return Object.freeze({
    topologySymbol,
    coordinateFrame: 'normalized_image_top_left_origin' as const,
    measurements,
    aggregateVerticalOrder,
    absoluteMeanYDelta: Math.abs(delta),
    anatomicalBoundaryRoleAssigned: false as const,
    componentCorrespondenceAuthorized: false as const,
  });
}

export function inspectMediaPipeEyebrowComponentVerticalSignalFR42(
  faceLandmarkerRuntimeClass: object,
  landmarks: readonly NormalizedFaceLandmarkFR42V1[],
): EyebrowComponentGeometricRoleProbeFR42V1 {
  validateMediaPipePublishedEyebrowComponentDecompositionAuthorityFR39();
  validateEyebrowNeutralAnatomicalAdmissionAuthorityFR41();
  if (!Array.isArray(landmarks) || landmarks.length === 0) throw new FaceAuthorityValidationError('FR-42 requires one detected face landmark array.');
  const decomposition = inspectMediaPipePublishedEyebrowComponentsFR39(faceLandmarkerRuntimeClass);
  const left = inspectSide(decomposition.left.topologySymbol, decomposition.left.components, landmarks);
  const right = inspectSide(decomposition.right.topologySymbol, decomposition.right.components, landmarks);
  const nonTie = left.aggregateVerticalOrder !== 'aggregate_y_tie' && right.aggregateVerticalOrder !== 'aggregate_y_tie';
  const sameOrdinal = nonTie && left.aggregateVerticalOrder === right.aggregateVerticalOrder;
  return Object.freeze({
    schemaVersion: 'fr42-probe-v1' as const,
    left,
    right,
    bothSidesProduceNonTieImageVerticalSignal: nonTie,
    bothSidesShareSameOrdinalImageUpperSignal: sameOrdinal,
    providerComponentRoleMappingAuthorized: false as const,
    researchCandidateAdmitted: false as const,
    productionGeometryAuthorized: false as const,
  });
}

export function validateEyebrowComponentGeometricRoleProbeAuthorityFR42(
  authority: EyebrowComponentGeometricRoleProbeAuthorityFR42V1 = EYEBROW_COMPONENT_GEOMETRIC_ROLE_PROBE_AUTHORITY_FR42,
): EyebrowComponentGeometricRoleProbeAuthorityFR42V1 {
  validateEyebrowNeutralAnatomicalAdmissionAuthorityFR41();
  if (
    authority.schemaVersion !== 'fr42-authority-v1' ||
    authority.authorityRef !== 'authority.face.eyebrow_component_geometric_role_probe.fr42' ||
    authority.authorityVersion !== '0.1.0' ||
    authority.authorityState !== 'runtime_probe_defined_single_fixture_insufficient' ||
    authority.packageName !== '@mediapipe/tasks-vision' ||
    authority.packageVersion !== '0.10.35' ||
    authority.upstreamFR41Ref !== FR41_REF
  ) throw new FaceAuthorityValidationError('FR-42 authority identity/upstream pin drift.');
  if (
    authority.coordinateEvidence.normalizedXYRange !== '[0,1]' ||
    authority.coordinateEvidence.imageOrigin !== 'top_left' ||
    authority.coordinateEvidence.smallerYMeansImageUpper !== true ||
    authority.coordinateEvidence.evidenceScope !== 'image_coordinate_interpretation_only'
  ) throw new FaceAuthorityValidationError('FR-42 coordinate evidence contract drift.');
  if (
    authority.experimentContract.currentFixtureCount !== 1 ||
    authority.experimentContract.minimumIndependentSubjectsForRoleAdmission !== null ||
    authority.experimentContract.noCalibrationThresholdInvented !== true ||
    authority.experimentContract.aggregateStatistic !== 'mean_normalized_y_per_provider_component'
  ) throw new FaceAuthorityValidationError('FR-42 experiment must remain a single-fixture, threshold-free probe.');
  if (Object.values(authority.admissionBoundary).some((value) => value !== false)) {
    throw new FaceAuthorityValidationError('FR-42 admission boundary must remain fully fail-closed.');
  }
  return authority;
}

export function assertEyebrowProviderComponentRoleMappingReadyFR42(
  authority: EyebrowComponentGeometricRoleProbeAuthorityFR42V1 = EYEBROW_COMPONENT_GEOMETRIC_ROLE_PROBE_AUTHORITY_FR42,
): never {
  validateEyebrowComponentGeometricRoleProbeAuthorityFR42(authority);
  throw new FaceAuthorityValidationError('FR-42 single-fixture image-space vertical signal cannot authorize provider-component anatomical role mapping.');
}
