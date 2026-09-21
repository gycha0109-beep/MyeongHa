export const FACE_PREVIEW_CONSUMER_CONTRACT_VERSION_V1 =
  'MHA-FACE-PREVIEW-CONSUMER-FE023-v1' as const;

const FE023_CONTRACT_VERSION =
  'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1' as const;
const FE017_CONTRACT_VERSION =
  'FE017-REUSABLE-PRODUCT-SAFE-BROWSER-PREVIEW-SESSION-v1' as const;
const FE011_CONTRACT_VERSION =
  'FE011-HOST-SAFE-BROWSER-PREVIEW-ATTEMPT-v1' as const;

const REGION_ORDER = [
  'eye_pair',
  'cheek_mid_face',
  'mouth_lips',
  'chin_lower_face',
] as const;

const REJECTION_CODES = [
  'INVALID_CONFIGURATION',
  'INVALID_IMAGE_INPUT',
  'UNSUPPORTED_IMAGE_TYPE',
  'BROWSER_CAPABILITY_UNAVAILABLE',
  'IMAGE_DIGEST_FAILED',
  'IMAGE_DECODE_FAILED',
  'NO_FACE_DETECTED',
  'INVALID_PROVIDER_GEOMETRY',
  'ENGINE_INITIALIZATION_FAILED',
  'ENGINE_RUNTIME_FAILED',
  'SESSION_CLOSED',
  'ENGINE_CONTRACT_MISMATCH',
] as const;

const REJECTION_STAGES = ['open', 'ingress', 'analysis', 'lifecycle'] as const;

export type FacePreviewRegionKeyV1 = (typeof REGION_ORDER)[number];
export type FacePreviewRejectionCodeV1 = (typeof REJECTION_CODES)[number];
export type FacePreviewRejectionStageV1 = (typeof REJECTION_STAGES)[number];

export interface FacePreviewNeutralMetricV1 {
  readonly regionKey: FacePreviewRegionKeyV1;
  readonly metricRef: string;
  readonly value: number;
  readonly unit: 'ratio' | 'degree' | 'radian';
}

export interface FacePreviewRegionAvailabilityV1 {
  readonly regionKey: FacePreviewRegionKeyV1;
  readonly state: 'available' | 'partial';
  readonly unavailableSurfaces: readonly string[];
}

export interface FacePreviewConsumerBoundaryV1 {
  readonly neutralObservationOnly: true;
  readonly rawImagePersisted: false;
  readonly biometricEmbeddingCreated: false;
  readonly rawGeometryExposed: false;
  readonly providerTraceExposed: false;
  readonly interpretationIssued: false;
  readonly classificationIssued: false;
  readonly rankingIssued: false;
  readonly productionAuthorityIssued: false;
  readonly commerceAuthorityIssued: false;
}

export interface FacePreviewConsumerAttemptSuccessV1 {
  readonly schemaVersion: 'myeongha-face-preview-consumer-attempt-v1';
  readonly contractVersion: typeof FACE_PREVIEW_CONSUMER_CONTRACT_VERSION_V1;
  readonly status: 'ok';
  readonly preview: {
    readonly metrics: readonly FacePreviewNeutralMetricV1[];
    readonly regions: readonly FacePreviewRegionAvailabilityV1[];
  };
  readonly boundary: FacePreviewConsumerBoundaryV1;
}

export interface FacePreviewConsumerAttemptRejectedV1 {
  readonly schemaVersion: 'myeongha-face-preview-consumer-attempt-v1';
  readonly contractVersion: typeof FACE_PREVIEW_CONSUMER_CONTRACT_VERSION_V1;
  readonly status: 'rejected';
  readonly rejection: {
    readonly code: FacePreviewRejectionCodeV1;
    readonly stage: FacePreviewRejectionStageV1;
  };
  readonly boundary: FacePreviewConsumerBoundaryV1;
}

export type FacePreviewConsumerAttemptV1 =
  | FacePreviewConsumerAttemptSuccessV1
  | FacePreviewConsumerAttemptRejectedV1;

export type FacePreviewConsumerCloseResultV1 =
  | Readonly<{ status: 'closed' }>
  | Readonly<{
      status: 'rejected';
      rejection: {
        readonly code: FacePreviewRejectionCodeV1;
        readonly stage: FacePreviewRejectionStageV1;
      };
    }>;

export interface FacePreviewConsumerSessionV1 {
  readonly schemaVersion: 'myeongha-face-preview-consumer-session-v1';
  readonly contractVersion: typeof FACE_PREVIEW_CONSUMER_CONTRACT_VERSION_V1;
  readonly sessionState: 'neutral_face_preview_only';
  readonly boundary: FacePreviewConsumerBoundaryV1;
  readonly analyze: (blob: Blob) => Promise<FacePreviewConsumerAttemptV1>;
  readonly close: () => Promise<FacePreviewConsumerCloseResultV1>;
}

export interface FacePreviewEngineModuleV1 {
  readonly FE023_CONTRACT_VERSION: string;
  readonly openDigestBoundProductPreviewSessionFE023: (
    config: unknown,
  ) => Promise<unknown>;
}

export interface FacePreviewConsumerConfigV1 {
  readonly schemaVersion: 'myeongha-face-preview-consumer-config-v1';
  readonly engineModule: FacePreviewEngineModuleV1;
  readonly assets: {
    readonly schemaVersion: 'fe022-digest-bound-mediapipe-model-config-v1';
    readonly wasmRoot: string;
    readonly modelAssetPath: string;
    readonly modelAssetSha256: string;
  };
}

export type FacePreviewConsumerOpenResultV1 =
  | Readonly<{
      schemaVersion: 'myeongha-face-preview-consumer-open-v1';
      contractVersion: typeof FACE_PREVIEW_CONSUMER_CONTRACT_VERSION_V1;
      status: 'ready';
      session: FacePreviewConsumerSessionV1;
      boundary: FacePreviewConsumerBoundaryV1;
    }>
  | Readonly<{
      schemaVersion: 'myeongha-face-preview-consumer-open-v1';
      contractVersion: typeof FACE_PREVIEW_CONSUMER_CONTRACT_VERSION_V1;
      status: 'rejected';
      rejection: {
        readonly code: FacePreviewRejectionCodeV1;
        readonly stage: FacePreviewRejectionStageV1;
      };
      boundary: FacePreviewConsumerBoundaryV1;
    }>;

const BOUNDARY: FacePreviewConsumerBoundaryV1 = Object.freeze({
  neutralObservationOnly: true as const,
  rawImagePersisted: false as const,
  biometricEmbeddingCreated: false as const,
  rawGeometryExposed: false as const,
  providerTraceExposed: false as const,
  interpretationIssued: false as const,
  classificationIssued: false as const,
  rankingIssued: false as const,
  productionAuthorityIssued: false as const,
  commerceAuthorityIssued: false as const,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

function isRejectionCode(value: unknown): value is FacePreviewRejectionCodeV1 {
  return typeof value === 'string' &&
    (REJECTION_CODES as readonly string[]).includes(value);
}

function isRejectionStage(value: unknown): value is FacePreviewRejectionStageV1 {
  return typeof value === 'string' &&
    (REJECTION_STAGES as readonly string[]).includes(value);
}

function rejection(
  code: FacePreviewRejectionCodeV1,
  stage: FacePreviewRejectionStageV1,
): FacePreviewConsumerAttemptRejectedV1 {
  return Object.freeze({
    schemaVersion: 'myeongha-face-preview-consumer-attempt-v1' as const,
    contractVersion: FACE_PREVIEW_CONSUMER_CONTRACT_VERSION_V1,
    status: 'rejected' as const,
    rejection: Object.freeze({ code, stage }),
    boundary: BOUNDARY,
  });
}

function openRejected(
  code: FacePreviewRejectionCodeV1,
  stage: FacePreviewRejectionStageV1,
): FacePreviewConsumerOpenResultV1 {
  return Object.freeze({
    schemaVersion: 'myeongha-face-preview-consumer-open-v1' as const,
    contractVersion: FACE_PREVIEW_CONSUMER_CONTRACT_VERSION_V1,
    status: 'rejected' as const,
    rejection: Object.freeze({ code, stage }),
    boundary: BOUNDARY,
  });
}

function parseRejection(
  value: unknown,
): Readonly<{
  code: FacePreviewRejectionCodeV1;
  stage: FacePreviewRejectionStageV1;
}> | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['code', 'stage']) ||
    !isRejectionCode(value.code) ||
    value.code === 'ENGINE_CONTRACT_MISMATCH' ||
    !isRejectionStage(value.stage)
  ) {
    return null;
  }
  return Object.freeze({ code: value.code, stage: value.stage });
}

function validAuthorityBoundary(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = [
    'consumesUpstreamNeutralObservationOnly',
    'performsResearchDecision',
    'performsValidationDecision',
    'classificationIssued',
    'scoreIssued',
    'rankIssued',
    'traditionalInterpretationIssued',
    'physiognomyClaimIssued',
    'fortuneClaimIssued',
    'productionActivated',
    'commerceActivated',
  ] as const;
  return exactKeys(value, keys) &&
    value.consumesUpstreamNeutralObservationOnly === true &&
    keys
      .filter((key) => key !== 'consumesUpstreamNeutralObservationOnly')
      .every((key) => value[key] === false);
}

function validTransportReceipt(value: unknown, success: boolean): boolean {
  if (!isRecord(value)) return false;
  const keys = [
    'sourceContractVersion',
    'sourceConsumerProjectionSchemaVersion',
    'providerRunRefOmitted',
    'canonicalAssetDigestOmitted',
    'fe004ExecutionReceiptOmitted',
    'rawInternalErrorsOmitted',
    'rawProviderPayloadOmitted',
    'rawGeometryOmitted',
    'jsonSafePlainDataOnly',
  ] as const;
  return exactKeys(value, keys) &&
    value.sourceContractVersion === FE011_CONTRACT_VERSION &&
    value.sourceConsumerProjectionSchemaVersion ===
      (success ? 'fe003-consumer-safe-preview-output-v1' : null) &&
    keys
      .filter((key) =>
        !['sourceContractVersion', 'sourceConsumerProjectionSchemaVersion'].includes(key),
      )
      .every((key) => value[key] === true);
}

function parseMetric(value: unknown): FacePreviewNeutralMetricV1 | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['regionKey', 'metricRef', 'value', 'unit']) ||
    typeof value.regionKey !== 'string' ||
    !(REGION_ORDER as readonly string[]).includes(value.regionKey) ||
    typeof value.metricRef !== 'string' ||
    value.metricRef.trim().length === 0 ||
    typeof value.value !== 'number' ||
    !Number.isFinite(value.value) ||
    typeof value.unit !== 'string' ||
    !['ratio', 'degree', 'radian'].includes(value.unit)
  ) {
    return null;
  }
  return Object.freeze({
    regionKey: value.regionKey as FacePreviewRegionKeyV1,
    metricRef: value.metricRef,
    value: value.value,
    unit: value.unit as FacePreviewNeutralMetricV1['unit'],
  });
}

function parseRegion(value: unknown): FacePreviewRegionAvailabilityV1 | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['regionKey', 'state', 'unavailableSurfaces']) ||
    typeof value.regionKey !== 'string' ||
    !(REGION_ORDER as readonly string[]).includes(value.regionKey) ||
    (value.state !== 'available' && value.state !== 'partial') ||
    !Array.isArray(value.unavailableSurfaces) ||
    !value.unavailableSurfaces.every((entry) => typeof entry === 'string') ||
    new Set(value.unavailableSurfaces).size !== value.unavailableSurfaces.length ||
    value.state !== (value.unavailableSurfaces.length === 0 ? 'available' : 'partial')
  ) {
    return null;
  }
  return Object.freeze({
    regionKey: value.regionKey as FacePreviewRegionKeyV1,
    state: value.state,
    unavailableSurfaces: Object.freeze([...value.unavailableSurfaces]),
  });
}

function projectAttempt(value: unknown): FacePreviewConsumerAttemptV1 {
  if (
    !isRecord(value) ||
    value.artifactVersion !== '0.1.0' ||
    value.contractVersion !== FE017_CONTRACT_VERSION ||
    !validAuthorityBoundary(value.authorityBoundary)
  ) {
    return rejection('ENGINE_CONTRACT_MISMATCH', 'analysis');
  }

  if (value.status === 'rejected') {
    if (
      !exactKeys(value, [
        'schemaVersion',
        'artifactVersion',
        'contractVersion',
        'status',
        'rejection',
        'transportReceipt',
        'authorityBoundary',
      ]) ||
      value.schemaVersion !== 'fe017-product-safe-preview-attempt-rejected-v1' ||
      !validTransportReceipt(value.transportReceipt, false)
    ) {
      return rejection('ENGINE_CONTRACT_MISMATCH', 'analysis');
    }
    const parsed = parseRejection(value.rejection);
    return parsed === null
      ? rejection('ENGINE_CONTRACT_MISMATCH', 'analysis')
      : rejection(parsed.code, parsed.stage);
  }

  if (
    value.status !== 'ok' ||
    !exactKeys(value, [
      'schemaVersion',
      'artifactVersion',
      'contractVersion',
      'status',
      'preview',
      'transportReceipt',
      'authorityBoundary',
    ]) ||
    value.schemaVersion !== 'fe017-product-safe-preview-attempt-success-v1' ||
    !validTransportReceipt(value.transportReceipt, true) ||
    !isRecord(value.preview) ||
    !exactKeys(value.preview, ['metrics', 'regions']) ||
    !Array.isArray(value.preview.metrics) ||
    !Array.isArray(value.preview.regions)
  ) {
    return rejection('ENGINE_CONTRACT_MISMATCH', 'analysis');
  }

  const metrics = value.preview.metrics.map(parseMetric);
  const regions = value.preview.regions.map(parseRegion);
  if (
    metrics.some((entry) => entry === null) ||
    regions.some((entry) => entry === null) ||
    new Set(metrics.map((entry) => entry?.metricRef)).size !== metrics.length ||
    regions.length !== REGION_ORDER.length ||
    regions.some((entry, index) => entry?.regionKey !== REGION_ORDER[index])
  ) {
    return rejection('ENGINE_CONTRACT_MISMATCH', 'analysis');
  }

  return Object.freeze({
    schemaVersion: 'myeongha-face-preview-consumer-attempt-v1' as const,
    contractVersion: FACE_PREVIEW_CONSUMER_CONTRACT_VERSION_V1,
    status: 'ok' as const,
    preview: Object.freeze({
      metrics: Object.freeze(metrics as FacePreviewNeutralMetricV1[]),
      regions: Object.freeze(regions as FacePreviewRegionAvailabilityV1[]),
    }),
    boundary: BOUNDARY,
  });
}

function wrapSession(inner: Record<string, unknown>): FacePreviewConsumerSessionV1 {
  const analyze = inner.analyze as (blob: Blob) => Promise<unknown>;
  const close = inner.close as () => Promise<unknown>;

  return Object.freeze({
    schemaVersion: 'myeongha-face-preview-consumer-session-v1' as const,
    contractVersion: FACE_PREVIEW_CONSUMER_CONTRACT_VERSION_V1,
    sessionState: 'neutral_face_preview_only' as const,
    boundary: BOUNDARY,
    async analyze(blob: Blob): Promise<FacePreviewConsumerAttemptV1> {
      if (!(blob instanceof Blob)) {
        return rejection('INVALID_IMAGE_INPUT', 'ingress');
      }
      try {
        return projectAttempt(await analyze(blob));
      } catch {
        return rejection('ENGINE_RUNTIME_FAILED', 'analysis');
      }
    },
    async close(): Promise<FacePreviewConsumerCloseResultV1> {
      try {
        const result = await close();
        if (isRecord(result) && exactKeys(result, ['status']) && result.status === 'closed') {
          return Object.freeze({ status: 'closed' as const });
        }
        if (
          isRecord(result) &&
          exactKeys(result, ['status', 'rejection']) &&
          result.status === 'rejected'
        ) {
          const parsed = parseRejection(result.rejection);
          if (parsed !== null) {
            return Object.freeze({
              status: 'rejected' as const,
              rejection: parsed,
            });
          }
        }
        return Object.freeze({
          status: 'rejected' as const,
          rejection: Object.freeze({
            code: 'ENGINE_CONTRACT_MISMATCH' as const,
            stage: 'lifecycle' as const,
          }),
        });
      } catch {
        return Object.freeze({
          status: 'rejected' as const,
          rejection: Object.freeze({
            code: 'ENGINE_RUNTIME_FAILED' as const,
            stage: 'lifecycle' as const,
          }),
        });
      }
    },
  });
}

function validFe023Session(value: unknown): value is Record<string, unknown> {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'schemaVersion',
      'artifactVersion',
      'contractVersion',
      'sessionState',
      'compositionReceipt',
      'authorityBoundary',
      'analyze',
      'close',
    ]) ||
    value.schemaVersion !== 'fe023-digest-bound-product-preview-session-v1' ||
    value.artifactVersion !== '0.1.0' ||
    value.contractVersion !== FE023_CONTRACT_VERSION ||
    value.sessionState !== 'digest_bound_product_direct_blob_session_only' ||
    typeof value.analyze !== 'function' ||
    typeof value.close !== 'function' ||
    !isRecord(value.compositionReceipt) ||
    !isRecord(value.authorityBoundary)
  ) {
    return false;
  }

  return (
    value.compositionReceipt.modelDigestRequiredBeforeRuntimeReady === true &&
    value.compositionReceipt.runtimeFactoryExposed === false &&
    value.compositionReceipt.hostAssetRefsExposed === false &&
    value.compositionReceipt.modelDigestExposed === false &&
    value.compositionReceipt.lowerLevelAnalysisRequestSchemaHidden === true &&
    value.compositionReceipt.innerSessionExposed === false &&
    value.authorityBoundary.composesExistingDigestBoundProductSafeContractsOnly === true &&
    Object.entries(value.authorityBoundary)
      .filter(([key]) => key !== 'composesExistingDigestBoundProductSafeContractsOnly')
      .every(([, entry]) => entry === false)
  );
}

export async function openFacePreviewConsumerSessionV1(
  config: FacePreviewConsumerConfigV1,
): Promise<FacePreviewConsumerOpenResultV1> {
  if (
    !isRecord(config) ||
    !exactKeys(config, ['schemaVersion', 'engineModule', 'assets']) ||
    config.schemaVersion !== 'myeongha-face-preview-consumer-config-v1' ||
    !isRecord(config.engineModule) ||
    config.engineModule.FE023_CONTRACT_VERSION !== FE023_CONTRACT_VERSION ||
    typeof config.engineModule.openDigestBoundProductPreviewSessionFE023 !== 'function' ||
    !isRecord(config.assets) ||
    !exactKeys(config.assets, [
      'schemaVersion',
      'wasmRoot',
      'modelAssetPath',
      'modelAssetSha256',
    ]) ||
    config.assets.schemaVersion !== 'fe022-digest-bound-mediapipe-model-config-v1' ||
    typeof config.assets.wasmRoot !== 'string' ||
    typeof config.assets.modelAssetPath !== 'string' ||
    typeof config.assets.modelAssetSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(config.assets.modelAssetSha256)
  ) {
    return openRejected('INVALID_CONFIGURATION', 'open');
  }

  let opened: unknown;
  try {
    opened = await config.engineModule.openDigestBoundProductPreviewSessionFE023({
      schemaVersion: 'fe023-digest-bound-product-preview-config-v1',
      assets: {
        schemaVersion: config.assets.schemaVersion,
        wasmRoot: config.assets.wasmRoot,
        modelAssetPath: config.assets.modelAssetPath,
        modelAssetSha256: config.assets.modelAssetSha256,
      },
    });
  } catch {
    return openRejected('ENGINE_RUNTIME_FAILED', 'open');
  }

  if (!isRecord(opened) || opened.contractVersion !== FE023_CONTRACT_VERSION) {
    return openRejected('ENGINE_CONTRACT_MISMATCH', 'open');
  }

  if (opened.status === 'rejected') {
    const parsed = parseRejection(opened.rejection);
    return parsed === null
      ? openRejected('ENGINE_CONTRACT_MISMATCH', 'open')
      : openRejected(parsed.code, parsed.stage);
  }

  if (
    opened.status !== 'ready' ||
    opened.schemaVersion !== 'fe023-digest-bound-product-preview-open-success-v1' ||
    opened.artifactVersion !== '0.1.0' ||
    !validFe023Session(opened.session)
  ) {
    return openRejected('ENGINE_CONTRACT_MISMATCH', 'open');
  }

  return Object.freeze({
    schemaVersion: 'myeongha-face-preview-consumer-open-v1' as const,
    contractVersion: FACE_PREVIEW_CONSUMER_CONTRACT_VERSION_V1,
    status: 'ready' as const,
    session: wrapSession(opened.session),
    boundary: BOUNDARY,
  });
}
