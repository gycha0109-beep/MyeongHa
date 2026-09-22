export const FACE_METRIC_REGISTRY_BRIDGE_VERSION_FE040A =
  'MHA-FACE-METRIC-REGISTRY-BRIDGE-FE040A-v1' as const;

export const FACE_CANONICAL_METRIC_REGISTRY_SOURCE_FE040A = Object.freeze({
  repository: 'gycha0109-beep/Saju' as const,
  sourceCommit: '0f7de13b18a9dd9966074f371cbfd9554490f0ef' as const,
  sourcePath:
    'packages/face-reading/src/product-neutral-observation-contract-fe035b.ts' as const,
  sourceBlobSha: 'c9ed7dfb347144759694056e89d571c433d4dfc8' as const,
  contractVersion:
    'FE035B-PRODUCT-NEUTRAL-OBSERVATION-CONTRACT-v1' as const,
  packageSubpath:
    '@myeongha/face-reading/product-neutral-observation-contract-fe035b' as const,
  metricCount: 13 as const,
  requiredMetricCount: 8 as const,
  conditionalMetricCount: 5 as const,
});

export const FACE_CURRENT_PINNED_ARTIFACT_FE040A = Object.freeze({
  distributionCommit: '8b49d4e03e35ef5447f0f2873ff2b8737bd36110' as const,
  distributionPath:
    'distribution/face-reading/fe041b/myeongha-face-reading-0.0.0.tgz' as const,
  artifactSha256:
    '170dc999e0cb01e3e9a38c59a9a510170def54d7055c3b988eabb1330d68620e' as const,
  publicExportPath: './preview-engine' as const,
  canonicalRegistryExportPath:
    './product-neutral-observation-contract-fe035b' as const,
  canonicalRegistryExported: true as const,
});

const REGION_KEYS = [
  'eye_pair',
  'cheek_mid_face',
  'mouth_lips',
  'chin_lower_face',
] as const;
const METRIC_UNITS = ['ratio', 'degree', 'radian'] as const;
const METRIC_PRESENCE = ['required', 'conditional'] as const;

export type FaceCanonicalRegionKeyFE040A = (typeof REGION_KEYS)[number];
export type FaceCanonicalMetricUnitFE040A = (typeof METRIC_UNITS)[number];
export type FaceCanonicalMetricPresenceFE040A =
  (typeof METRIC_PRESENCE)[number];

export interface FaceCanonicalMetricDefinitionFE040A {
  readonly metricRef: string;
  readonly regionKey: FaceCanonicalRegionKeyFE040A;
  readonly unit: FaceCanonicalMetricUnitFE040A;
  readonly presence: FaceCanonicalMetricPresenceFE040A;
  readonly unavailableSurfaceRef: string | null;
  readonly sourceModuleRef: string;
  readonly semanticBoundary: Readonly<{
    traditionalBindingAuthorized: false;
    thresholdAuthorized: false;
    calibrationAuthorized: false;
    classificationAuthorized: false;
    scoreAuthorized: false;
    rankingAuthorized: false;
  }>;
}

export interface FaceCanonicalRegionDefinitionFE040A {
  readonly regionKey: FaceCanonicalRegionKeyFE040A;
  readonly allowedUnavailableSurfaces: readonly string[];
}

export interface FaceCanonicalMetricRegistryAdmissionFE040A {
  readonly schemaVersion: 'myeongha-face-canonical-metric-registry-admission-v1';
  readonly contractVersion: typeof FACE_METRIC_REGISTRY_BRIDGE_VERSION_FE040A;
  readonly status: 'admitted';
  readonly registryState: 'canonical_upstream_registry_admitted';
  readonly registryRef: string;
  readonly upstreamContractVersion:
    'FE035B-PRODUCT-NEUTRAL-OBSERVATION-CONTRACT-v1';
  readonly registrySha256: string;
  readonly regions: readonly FaceCanonicalRegionDefinitionFE040A[];
  readonly metrics: readonly FaceCanonicalMetricDefinitionFE040A[];
  readonly metricCount: 13;
  readonly requiredMetricCount: 8;
  readonly conditionalMetricCount: 5;
  readonly boundary: Readonly<{
    upstreamOwnsMetricAuthority: true;
    localMetricDefinitionAuthorityIssued: false;
    traditionalBindingAuthorityIssued: false;
    thresholdAuthorityIssued: false;
    calibrationAuthorityIssued: false;
    classificationAuthorityIssued: false;
    scoreAuthorityIssued: false;
    rankingAuthorityIssued: false;
    narrativeAuthorityIssued: false;
    productionInterpretationAuthorityIssued: false;
  }>;
}

export interface FaceCanonicalMetricRegistryBlockedFE040A {
  readonly schemaVersion: 'myeongha-face-canonical-metric-registry-admission-v1';
  readonly contractVersion: typeof FACE_METRIC_REGISTRY_BRIDGE_VERSION_FE040A;
  readonly status: 'blocked';
  readonly reason:
    | 'canonical_registry_export_unavailable'
    | 'canonical_registry_contract_invalid'
    | 'canonical_registry_fingerprint_unavailable';
  readonly requiredSource: typeof FACE_CANONICAL_METRIC_REGISTRY_SOURCE_FE040A;
  readonly currentArtifact: typeof FACE_CURRENT_PINNED_ARTIFACT_FE040A;
  readonly boundary: Readonly<{
    upstreamOwnsMetricAuthority: true;
    localMetricDefinitionAuthorityIssued: false;
    staticObservationAdmissionIssued: false;
    operationalizationAuthorityIssued: false;
    traditionalBindingAuthorityIssued: false;
    productionInterpretationAuthorityIssued: false;
  }>;
}

export type FaceCanonicalMetricRegistryLoadResultFE040A =
  | FaceCanonicalMetricRegistryAdmissionFE040A
  | FaceCanonicalMetricRegistryBlockedFE040A;

const ISSUED_CANONICAL_REGISTRIES = new WeakSet<object>();

class RegistryContractError extends Error {}

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

function isRegionKey(value: unknown): value is FaceCanonicalRegionKeyFE040A {
  return typeof value === 'string' &&
    (REGION_KEYS as readonly string[]).includes(value);
}

function isMetricUnit(value: unknown): value is FaceCanonicalMetricUnitFE040A {
  return typeof value === 'string' &&
    (METRIC_UNITS as readonly string[]).includes(value);
}

function isMetricPresence(
  value: unknown,
): value is FaceCanonicalMetricPresenceFE040A {
  return typeof value === 'string' &&
    (METRIC_PRESENCE as readonly string[]).includes(value);
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string');
}

function isClosedMetricBoundary(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'traditionalBindingAuthorized',
      'thresholdAuthorized',
      'calibrationAuthorized',
      'classificationAuthorized',
      'scoreAuthorized',
      'rankingAuthorized',
    ])
  ) {
    return false;
  }
  return Object.values(value).every((entry) => entry === false);
}

function validMetric(
  value: unknown,
): value is FaceCanonicalMetricDefinitionFE040A {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'metricRef',
      'regionKey',
      'unit',
      'presence',
      'unavailableSurfaceRef',
      'sourceModuleRef',
      'semanticBoundary',
    ])
  ) {
    return false;
  }

  return isNonEmptyText(value.metricRef) &&
    isRegionKey(value.regionKey) &&
    isMetricUnit(value.unit) &&
    isMetricPresence(value.presence) &&
    (
      value.unavailableSurfaceRef === null ||
      isNonEmptyText(value.unavailableSurfaceRef)
    ) &&
    isNonEmptyText(value.sourceModuleRef) &&
    isClosedMetricBoundary(value.semanticBoundary) &&
    (
      value.presence === 'required'
        ? value.unavailableSurfaceRef === null
        : value.unavailableSurfaceRef !== null
    );
}

function validRegion(
  value: unknown,
): value is FaceCanonicalRegionDefinitionFE040A {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['regionKey', 'allowedUnavailableSurfaces'])
  ) {
    return false;
  }

  return isRegionKey(value.regionKey) &&
    isStringArray(value.allowedUnavailableSurfaces) &&
    new Set(value.allowedUnavailableSurfaces).size ===
      value.allowedUnavailableSurfaces.length;
}

function assertContractShape(value: unknown): {
  regions: FaceCanonicalRegionDefinitionFE040A[];
  metrics: FaceCanonicalMetricDefinitionFE040A[];
} {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'schemaVersion',
      'contractVersion',
      'surfaceState',
      'regions',
      'metrics',
      'authorityBoundary',
      'evolutionPolicy',
    ]) ||
    value.schemaVersion !== 'fe035b-product-neutral-observation-contract-v1' ||
    value.contractVersion !==
      FACE_CANONICAL_METRIC_REGISTRY_SOURCE_FE040A.contractVersion ||
    value.surfaceState !== 'frozen_current_product_neutral_observation_v1' ||
    !Array.isArray(value.regions) ||
    !Array.isArray(value.metrics) ||
    !isRecord(value.authorityBoundary) ||
    !isRecord(value.evolutionPolicy)
  ) {
    throw new RegistryContractError('FE040A_CANONICAL_REGISTRY_SHAPE_INVALID');
  }

  const regions = value.regions;
  const metrics = value.metrics;

  if (
    regions.length !== REGION_KEYS.length ||
    !regions.every(validRegion) ||
    !regions.every(
      (region, index) => region.regionKey === REGION_KEYS[index],
    )
  ) {
    throw new RegistryContractError('FE040A_CANONICAL_REGION_DRIFT');
  }

  if (
    metrics.length !==
      FACE_CANONICAL_METRIC_REGISTRY_SOURCE_FE040A.metricCount ||
    !metrics.every(validMetric)
  ) {
    throw new RegistryContractError('FE040A_CANONICAL_METRIC_DRIFT');
  }

  const refs = metrics.map((metric) => metric.metricRef);
  if (new Set(refs).size !== refs.length) {
    throw new RegistryContractError('FE040A_CANONICAL_METRIC_DUPLICATE');
  }

  const requiredCount = metrics.filter(
    (metric) => metric.presence === 'required',
  ).length;
  const conditionalCount = metrics.filter(
    (metric) => metric.presence === 'conditional',
  ).length;
  if (
    requiredCount !==
      FACE_CANONICAL_METRIC_REGISTRY_SOURCE_FE040A.requiredMetricCount ||
    conditionalCount !==
      FACE_CANONICAL_METRIC_REGISTRY_SOURCE_FE040A.conditionalMetricCount
  ) {
    throw new RegistryContractError('FE040A_CANONICAL_PRESENCE_DRIFT');
  }

  for (const metric of metrics) {
    if (
      metric.presence === 'conditional' &&
      !regions
        .find((region) => region.regionKey === metric.regionKey)
        ?.allowedUnavailableSurfaces.includes(
          metric.unavailableSurfaceRef as string,
        )
    ) {
      throw new RegistryContractError(
        'FE040A_CANONICAL_UNAVAILABLE_SURFACE_DRIFT',
      );
    }
  }

  if (
    !exactKeys(value.authorityBoundary, [
      'freezesExistingNeutralObservationSurface',
      'issuesTraditionalBindingAuthority',
      'issuesThresholdAuthority',
      'issuesCalibrationAuthority',
      'issuesClassificationAuthority',
      'issuesScoreAuthority',
      'issuesRankingAuthority',
      'issuesNarrativeAuthority',
      'exposesRawGeometry',
      'exposesProviderTrace',
      'widensPreviewEnginePublicExport',
    ]) ||
    value.authorityBoundary.freezesExistingNeutralObservationSurface !== true ||
    Object.entries(value.authorityBoundary)
      .filter(([key]) => key !== 'freezesExistingNeutralObservationSurface')
      .some(([, entry]) => entry !== false)
  ) {
    throw new RegistryContractError('FE040A_CANONICAL_AUTHORITY_WIDENED');
  }

  if (
    !exactKeys(value.evolutionPolicy, [
      'mutateV1InPlace',
      'newNeutralMetricRequiresNewContractVersion',
      'semanticAuthorityMayBeInferredFromRegistryMembership',
    ]) ||
    value.evolutionPolicy.mutateV1InPlace !== false ||
    value.evolutionPolicy.newNeutralMetricRequiresNewContractVersion !== true ||
    value.evolutionPolicy.semanticAuthorityMayBeInferredFromRegistryMembership !==
      false
  ) {
    throw new RegistryContractError('FE040A_CANONICAL_EVOLUTION_DRIFT');
  }

  return {
    regions: regions.map((region) => ({
      regionKey: region.regionKey,
      allowedUnavailableSurfaces: [...region.allowedUnavailableSurfaces],
    })),
    metrics: metrics.map((metric) => ({
      metricRef: metric.metricRef,
      regionKey: metric.regionKey,
      unit: metric.unit,
      presence: metric.presence,
      unavailableSurfaceRef: metric.unavailableSurfaceRef,
      sourceModuleRef: metric.sourceModuleRef,
      semanticBoundary: {
        traditionalBindingAuthorized: false,
        thresholdAuthorized: false,
        calibrationAuthorized: false,
        classificationAuthorized: false,
        scoreAuthorized: false,
        rankingAuthorized: false,
      },
    })),
  };
}

function freezeRegions(
  regions: readonly FaceCanonicalRegionDefinitionFE040A[],
): readonly FaceCanonicalRegionDefinitionFE040A[] {
  return Object.freeze(
    regions.map((region) =>
      Object.freeze({
        regionKey: region.regionKey,
        allowedUnavailableSurfaces: Object.freeze([
          ...region.allowedUnavailableSurfaces,
        ]),
      }),
    ),
  );
}

function freezeMetrics(
  metrics: readonly FaceCanonicalMetricDefinitionFE040A[],
): readonly FaceCanonicalMetricDefinitionFE040A[] {
  return Object.freeze(
    metrics.map((metric) =>
      Object.freeze({
        metricRef: metric.metricRef,
        regionKey: metric.regionKey,
        unit: metric.unit,
        presence: metric.presence,
        unavailableSurfaceRef: metric.unavailableSurfaceRef,
        sourceModuleRef: metric.sourceModuleRef,
        semanticBoundary: Object.freeze({
          traditionalBindingAuthorized: false as const,
          thresholdAuthorized: false as const,
          calibrationAuthorized: false as const,
          classificationAuthorized: false as const,
          scoreAuthorized: false as const,
          rankingAuthorized: false as const,
        }),
      }),
    ),
  );
}

async function sha256Hex(value: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function blocked(
  reason: FaceCanonicalMetricRegistryBlockedFE040A['reason'],
): FaceCanonicalMetricRegistryBlockedFE040A {
  return Object.freeze({
    schemaVersion:
      'myeongha-face-canonical-metric-registry-admission-v1' as const,
    contractVersion: FACE_METRIC_REGISTRY_BRIDGE_VERSION_FE040A,
    status: 'blocked' as const,
    reason,
    requiredSource: FACE_CANONICAL_METRIC_REGISTRY_SOURCE_FE040A,
    currentArtifact: FACE_CURRENT_PINNED_ARTIFACT_FE040A,
    boundary: Object.freeze({
      upstreamOwnsMetricAuthority: true as const,
      localMetricDefinitionAuthorityIssued: false as const,
      staticObservationAdmissionIssued: false as const,
      operationalizationAuthorityIssued: false as const,
      traditionalBindingAuthorityIssued: false as const,
      productionInterpretationAuthorityIssued: false as const,
    }),
  });
}

async function projectCanonicalRegistryModule(
  moduleValue: unknown,
): Promise<FaceCanonicalMetricRegistryLoadResultFE040A> {
  if (!isRecord(moduleValue)) {
    return blocked('canonical_registry_contract_invalid');
  }

  const assertContract =
    moduleValue.assertProductNeutralObservationContractFE035B;
  const contract =
    moduleValue.FE035B_PRODUCT_NEUTRAL_OBSERVATION_CONTRACT;
  if (
    moduleValue.FE035B_PRODUCT_NEUTRAL_OBSERVATION_CONTRACT_VERSION !==
      FACE_CANONICAL_METRIC_REGISTRY_SOURCE_FE040A.contractVersion ||
    typeof assertContract !== 'function'
  ) {
    return blocked('canonical_registry_contract_invalid');
  }

  try {
    (assertContract as (value: unknown) => void)(contract);
    const projected = assertContractShape(contract);
    const fingerprintMaterial = JSON.stringify({
      source: FACE_CANONICAL_METRIC_REGISTRY_SOURCE_FE040A,
      contract,
    });
    const registrySha256 = await sha256Hex(fingerprintMaterial);
    if (!registrySha256) {
      return blocked('canonical_registry_fingerprint_unavailable');
    }

    const admission = Object.freeze({
      schemaVersion:
        'myeongha-face-canonical-metric-registry-admission-v1' as const,
      contractVersion: FACE_METRIC_REGISTRY_BRIDGE_VERSION_FE040A,
      status: 'admitted' as const,
      registryState: 'canonical_upstream_registry_admitted' as const,
      registryRef:
        `face-neutral-registry:${FACE_CANONICAL_METRIC_REGISTRY_SOURCE_FE040A.sourceCommit}:${registrySha256}`,
      upstreamContractVersion:
        FACE_CANONICAL_METRIC_REGISTRY_SOURCE_FE040A.contractVersion,
      registrySha256,
      regions: freezeRegions(projected.regions),
      metrics: freezeMetrics(projected.metrics),
      metricCount: 13 as const,
      requiredMetricCount: 8 as const,
      conditionalMetricCount: 5 as const,
      boundary: Object.freeze({
        upstreamOwnsMetricAuthority: true as const,
        localMetricDefinitionAuthorityIssued: false as const,
        traditionalBindingAuthorityIssued: false as const,
        thresholdAuthorityIssued: false as const,
        calibrationAuthorityIssued: false as const,
        classificationAuthorityIssued: false as const,
        scoreAuthorityIssued: false as const,
        rankingAuthorityIssued: false as const,
        narrativeAuthorityIssued: false as const,
        productionInterpretationAuthorityIssued: false as const,
      }),
    });

    ISSUED_CANONICAL_REGISTRIES.add(admission);
    return admission;
  } catch {
    return blocked('canonical_registry_contract_invalid');
  }
}

export interface FaceCanonicalMetricRegistryArtifactReadyFE040B {
  readonly schemaVersion: 'myeongha-face-canonical-metric-registry-artifact-readiness-v1';
  readonly status: 'ready';
  readonly reason: 'canonical_registry_export_available';
  readonly currentArtifact: typeof FACE_CURRENT_PINNED_ARTIFACT_FE040A;
  readonly requiredSource: typeof FACE_CANONICAL_METRIC_REGISTRY_SOURCE_FE040A;
  readonly boundary: Readonly<{
    registryAdmissionStillRequiresRuntimeValidation: true;
    localMetricDefinitionAuthorityIssued: false;
    operationalizationAuthorityIssued: false;
    traditionalBindingAuthorityIssued: false;
    productionInterpretationAuthorityIssued: false;
  }>;
}

export function assessCurrentPinnedFaceMetricRegistryFE040A():
  FaceCanonicalMetricRegistryArtifactReadyFE040B {
  return Object.freeze({
    schemaVersion:
      'myeongha-face-canonical-metric-registry-artifact-readiness-v1' as const,
    status: 'ready' as const,
    reason: 'canonical_registry_export_available' as const,
    currentArtifact: FACE_CURRENT_PINNED_ARTIFACT_FE040A,
    requiredSource: FACE_CANONICAL_METRIC_REGISTRY_SOURCE_FE040A,
    boundary: Object.freeze({
      registryAdmissionStillRequiresRuntimeValidation: true as const,
      localMetricDefinitionAuthorityIssued: false as const,
      operationalizationAuthorityIssued: false as const,
      traditionalBindingAuthorityIssued: false as const,
      productionInterpretationAuthorityIssued: false as const,
    }),
  });
}

export async function loadCanonicalFaceMetricRegistryFE040A():
  Promise<FaceCanonicalMetricRegistryLoadResultFE040A> {
  const specifier =
    FACE_CANONICAL_METRIC_REGISTRY_SOURCE_FE040A.packageSubpath;
  try {
    const moduleValue = await import(/* @vite-ignore */ specifier);
    return await projectCanonicalRegistryModule(moduleValue);
  } catch {
    return blocked('canonical_registry_export_unavailable');
  }
}

export function isIssuedCanonicalFaceMetricRegistryAdmissionFE040A(
  value: unknown,
): value is FaceCanonicalMetricRegistryAdmissionFE040A {
  return isRecord(value) && ISSUED_CANONICAL_REGISTRIES.has(value);
}
