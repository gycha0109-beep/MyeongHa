import {
  isIssuedCanonicalFaceMetricRegistryAdmissionFE040A,
  type FaceCanonicalMetricRegistryAdmissionFE040A,
  type FaceCanonicalMetricUnitFE040A,
  type FaceCanonicalRegionKeyFE040A,
} from './metric-registry-bridge-fe040a.js';

export const FACE_STATIC_OBSERVATION_ALLOWLIST_VERSION_FE040A =
  'MHA-FACE-STATIC-OBSERVATION-ALLOWLIST-FE040A-v1' as const;

export const FACE_STATIC_OBSERVATION_ALLOWLIST_FE040A = Object.freeze({
  schemaVersion: 'myeongha-face-static-observation-allowlist-v1' as const,
  contractVersion: FACE_STATIC_OBSERVATION_ALLOWLIST_VERSION_FE040A,
  allowedSurfaceKinds: Object.freeze([
    'neutral_metric',
    'region_availability',
  ] as const),
  boundary: Object.freeze({
    staticNeutralObservationOnly: true as const,
    dynamicAppearanceAllowed: false as const,
    colorAppearanceAllowed: false as const,
    rawGeometryAllowed: false as const,
    rawLandmarkAllowed: false as const,
    rawImageAllowed: false as const,
    identityMaterialAllowed: false as const,
    embeddingAllowed: false as const,
    userAccountDataAllowed: false as const,
    traditionalBindingAuthorityIssued: false as const,
    thresholdAuthorityIssued: false as const,
    classificationAuthorityIssued: false as const,
    scoreAuthorityIssued: false as const,
    rankingAuthorityIssued: false as const,
    narrativeAuthorityIssued: false as const,
  }),
});

export interface FaceStaticNeutralMetricValueFE040A {
  readonly regionKey: FaceCanonicalRegionKeyFE040A;
  readonly metricRef: string;
  readonly value: number;
  readonly unit: FaceCanonicalMetricUnitFE040A;
}

export interface FaceStaticRegionAvailabilityFE040A {
  readonly regionKey: FaceCanonicalRegionKeyFE040A;
  readonly state: 'available' | 'partial';
  readonly unavailableSurfaces: readonly string[];
}

export interface FaceStaticObservationEnvelopeFE040A {
  readonly schemaVersion: 'myeongha-face-static-observation-envelope-v1';
  readonly registryRef: string;
  readonly metrics: readonly FaceStaticNeutralMetricValueFE040A[];
  readonly regions: readonly FaceStaticRegionAvailabilityFE040A[];
}

export interface FaceStaticObservationAdmissionFE040A {
  readonly schemaVersion: 'myeongha-face-static-observation-admission-v1';
  readonly contractVersion: typeof FACE_STATIC_OBSERVATION_ALLOWLIST_VERSION_FE040A;
  readonly status: 'admitted';
  readonly registryRef: string;
  readonly observation: FaceStaticObservationEnvelopeFE040A;
  readonly boundary: Readonly<{
    staticNeutralObservationOnly: true;
    operationalizationAuthorityIssued: false;
    traditionalBindingAuthorityIssued: false;
    thresholdAuthorityIssued: false;
    classificationAuthorityIssued: false;
    scoreAuthorityIssued: false;
    rankingAuthorityIssued: false;
    structuredClaimIssued: false;
    narrativeAuthorityIssued: false;
    productionInterpretationAuthorityIssued: false;
  }>;
}

export interface FaceStaticObservationRejectedFE040A {
  readonly schemaVersion: 'myeongha-face-static-observation-admission-v1';
  readonly contractVersion: typeof FACE_STATIC_OBSERVATION_ALLOWLIST_VERSION_FE040A;
  readonly status: 'rejected';
  readonly reason:
    | 'registry_not_admitted'
    | 'invalid_shape'
    | 'region_contract_violation'
    | 'metric_registry_violation'
    | 'metric_availability_violation';
}

export type FaceStaticObservationAdmissionResultFE040A =
  | FaceStaticObservationAdmissionFE040A
  | FaceStaticObservationRejectedFE040A;

const TOP_LEVEL_KEYS = [
  'schemaVersion',
  'registryRef',
  'metrics',
  'regions',
] as const;
const METRIC_KEYS = ['regionKey', 'metricRef', 'value', 'unit'] as const;
const REGION_KEYS = ['regionKey', 'state', 'unavailableSurfaces'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length &&
    keys.every((key) => allowed.includes(key));
}

function rejected(
  reason: FaceStaticObservationRejectedFE040A['reason'],
): FaceStaticObservationRejectedFE040A {
  return Object.freeze({
    schemaVersion: 'myeongha-face-static-observation-admission-v1' as const,
    contractVersion: FACE_STATIC_OBSERVATION_ALLOWLIST_VERSION_FE040A,
    status: 'rejected' as const,
    reason,
  });
}

export function isFaceStaticObservationEnvelopeShapeFE040A(
  value: unknown,
): value is FaceStaticObservationEnvelopeFE040A {
  if (
    !isRecord(value) ||
    !exactKeys(value, TOP_LEVEL_KEYS) ||
    value.schemaVersion !== 'myeongha-face-static-observation-envelope-v1' ||
    typeof value.registryRef !== 'string' ||
    value.registryRef.length === 0 ||
    !Array.isArray(value.metrics) ||
    !Array.isArray(value.regions)
  ) {
    return false;
  }

  if (
    !value.metrics.every((metric) =>
      isRecord(metric) &&
      exactKeys(metric, METRIC_KEYS) &&
      typeof metric.regionKey === 'string' &&
      typeof metric.metricRef === 'string' &&
      metric.metricRef.length > 0 &&
      typeof metric.value === 'number' &&
      Number.isFinite(metric.value) &&
      typeof metric.unit === 'string'
    )
  ) {
    return false;
  }

  return value.regions.every((region) =>
    isRecord(region) &&
    exactKeys(region, REGION_KEYS) &&
    typeof region.regionKey === 'string' &&
    (region.state === 'available' || region.state === 'partial') &&
    Array.isArray(region.unavailableSurfaces) &&
    region.unavailableSurfaces.every(
      (surface) => typeof surface === 'string',
    )
  );
}

function freezeObservation(
  value: FaceStaticObservationEnvelopeFE040A,
): FaceStaticObservationEnvelopeFE040A {
  return Object.freeze({
    schemaVersion: 'myeongha-face-static-observation-envelope-v1' as const,
    registryRef: value.registryRef,
    metrics: Object.freeze(
      value.metrics.map((metric) =>
        Object.freeze({
          regionKey: metric.regionKey,
          metricRef: metric.metricRef,
          value: metric.value,
          unit: metric.unit,
        }),
      ),
    ),
    regions: Object.freeze(
      value.regions.map((region) =>
        Object.freeze({
          regionKey: region.regionKey,
          state: region.state,
          unavailableSurfaces: Object.freeze([
            ...region.unavailableSurfaces,
          ]),
        }),
      ),
    ),
  });
}

function validateAgainstRegistry(
  registry: FaceCanonicalMetricRegistryAdmissionFE040A,
  observation: FaceStaticObservationEnvelopeFE040A,
): FaceStaticObservationRejectedFE040A['reason'] | null {
  if (observation.registryRef !== registry.registryRef) {
    return 'metric_registry_violation';
  }

  if (
    observation.regions.length !== registry.regions.length ||
    observation.regions.some(
      (region, index) =>
        region.regionKey !== registry.regions[index]?.regionKey,
    )
  ) {
    return 'region_contract_violation';
  }

  const regionByKey = new Map(
    observation.regions.map((region) => [region.regionKey, region] as const),
  );

  for (const [index, region] of observation.regions.entries()) {
    const definition = registry.regions[index];
    if (!definition) return 'region_contract_violation';

    const unavailable = [...region.unavailableSurfaces];
    if (
      new Set(unavailable).size !== unavailable.length ||
      unavailable.some(
        (surface) =>
          !definition.allowedUnavailableSurfaces.includes(surface),
      ) ||
      unavailable.some(
        (surface, surfaceIndex) =>
          surfaceIndex > 0 &&
          unavailable[surfaceIndex - 1]!.localeCompare(surface) > 0,
      )
    ) {
      return 'region_contract_violation';
    }

    const expectedState = unavailable.length === 0 ? 'available' : 'partial';
    if (region.state !== expectedState) {
      return 'region_contract_violation';
    }
  }

  const definitionByRef = new Map(
    registry.metrics.map((metric) => [metric.metricRef, metric] as const),
  );
  const seen = new Set<string>();

  for (const metric of observation.metrics) {
    if (seen.has(metric.metricRef)) return 'metric_registry_violation';
    seen.add(metric.metricRef);

    const definition = definitionByRef.get(metric.metricRef);
    if (
      !definition ||
      metric.regionKey !== definition.regionKey ||
      metric.unit !== definition.unit
    ) {
      return 'metric_registry_violation';
    }
  }

  for (const definition of registry.metrics) {
    const present = seen.has(definition.metricRef);
    if (definition.presence === 'required') {
      if (!present) return 'metric_availability_violation';
      continue;
    }

    if (definition.unavailableSurfaceRef === null) {
      return 'metric_registry_violation';
    }
    const region = regionByKey.get(definition.regionKey);
    if (!region) return 'region_contract_violation';
    const unavailable = region.unavailableSurfaces.includes(
      definition.unavailableSurfaceRef,
    );
    if (unavailable === present) {
      return 'metric_availability_violation';
    }
  }

  return null;
}

export function admitFaceStaticObservationFE040A(
  registryAdmission: unknown,
  value: unknown,
): FaceStaticObservationAdmissionResultFE040A {
  if (
    !isIssuedCanonicalFaceMetricRegistryAdmissionFE040A(registryAdmission)
  ) {
    return rejected('registry_not_admitted');
  }

  if (!isFaceStaticObservationEnvelopeShapeFE040A(value)) {
    return rejected('invalid_shape');
  }

  const violation = validateAgainstRegistry(registryAdmission, value);
  if (violation) return rejected(violation);

  return Object.freeze({
    schemaVersion: 'myeongha-face-static-observation-admission-v1' as const,
    contractVersion: FACE_STATIC_OBSERVATION_ALLOWLIST_VERSION_FE040A,
    status: 'admitted' as const,
    registryRef: registryAdmission.registryRef,
    observation: freezeObservation(value),
    boundary: Object.freeze({
      staticNeutralObservationOnly: true as const,
      operationalizationAuthorityIssued: false as const,
      traditionalBindingAuthorityIssued: false as const,
      thresholdAuthorityIssued: false as const,
      classificationAuthorityIssued: false as const,
      scoreAuthorityIssued: false as const,
      rankingAuthorityIssued: false as const,
      structuredClaimIssued: false as const,
      narrativeAuthorityIssued: false as const,
      productionInterpretationAuthorityIssued: false as const,
    }),
  });
}
