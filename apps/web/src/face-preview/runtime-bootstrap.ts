import {
  FACE_PREVIEW_CONSUMER_CONTRACT_VERSION_V1,
  openFacePreviewConsumerSessionV1,
  type FacePreviewConsumerConfigV1,
  type FacePreviewConsumerOpenResultV1,
  type FacePreviewEngineModuleV1,
} from './consumer-adapter.js';

export const FACE_PREVIEW_RUNTIME_BOOTSTRAP_VERSION_V1 =
  'MHA-FACE-PREVIEW-RUNTIME-BOOTSTRAP-v1' as const;

const FE023_CONTRACT_VERSION =
  'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1' as const;
const FE027_CONTRACT_VERSION =
  'FE027-FACE-PREVIEW-RUNTIME-ASSETS-v1' as const;
const RUNTIME_CONFIG_PATH = '/face-preview/runtime-assets.json' as const;
const EXPECTED_WASM_ROOT = '/face-preview/mediapipe/0.10.35/wasm' as const;
const EXPECTED_MODEL_PATH =
  '/face-preview/models/face_landmarker.float16.v1.task' as const;
const EXPECTED_MODEL_SHA256 =
  '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff' as const;

export interface FacePreviewRuntimeBootstrapInputV1 {
  readonly schemaVersion: 'myeongha-face-preview-runtime-bootstrap-input-v1';
  readonly loadEngineModule: () => Promise<unknown>;
  readonly fetchImpl?: typeof fetch;
}

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

function rejected(
  code: 'INVALID_CONFIGURATION' | 'ENGINE_INITIALIZATION_FAILED' | 'ENGINE_CONTRACT_MISMATCH',
): FacePreviewConsumerOpenResultV1 {
  return Object.freeze({
    schemaVersion: 'myeongha-face-preview-consumer-open-v1' as const,
    contractVersion: FACE_PREVIEW_CONSUMER_CONTRACT_VERSION_V1,
    status: 'rejected' as const,
    rejection: Object.freeze({
      code,
      stage: 'open' as const,
    }),
    boundary: Object.freeze({
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
    }),
  });
}

function parseRuntimeAssets(value: unknown): FacePreviewConsumerConfigV1['assets'] | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['schemaVersion', 'contractVersion', 'assets', 'verification']) ||
    value.schemaVersion !== 'myeongha-face-preview-runtime-config-v1' ||
    value.contractVersion !== FE027_CONTRACT_VERSION ||
    !isRecord(value.assets) ||
    !exactKeys(value.assets, [
      'schemaVersion',
      'wasmRoot',
      'modelAssetPath',
      'modelAssetSha256',
    ]) ||
    value.assets.schemaVersion !== 'fe022-digest-bound-mediapipe-model-config-v1' ||
    value.assets.wasmRoot !== EXPECTED_WASM_ROOT ||
    value.assets.modelAssetPath !== EXPECTED_MODEL_PATH ||
    value.assets.modelAssetSha256 !== EXPECTED_MODEL_SHA256 ||
    !isRecord(value.verification) ||
    !exactKeys(value.verification, [
      'modelBytesVerifiedAtBuild',
      'wasmBytesVerifiedAtBuild',
      'userImageBytesIncluded',
    ]) ||
    value.verification.modelBytesVerifiedAtBuild !== true ||
    value.verification.wasmBytesVerifiedAtBuild !== true ||
    value.verification.userImageBytesIncluded !== false
  ) {
    return null;
  }

  return Object.freeze({
    schemaVersion: 'fe022-digest-bound-mediapipe-model-config-v1' as const,
    wasmRoot: EXPECTED_WASM_ROOT,
    modelAssetPath: EXPECTED_MODEL_PATH,
    modelAssetSha256: EXPECTED_MODEL_SHA256,
  });
}

function validFe023AuthorityBoundary(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = [
    'composesExistingDigestBoundProductSafeContractsOnly',
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
    value.composesExistingDigestBoundProductSafeContractsOnly === true &&
    keys
      .filter((key) => key !== 'composesExistingDigestBoundProductSafeContractsOnly')
      .every((key) => value[key] === false);
}

function validFe023OpenEnvelope(value: unknown): boolean {
  if (
    !isRecord(value) ||
    value.artifactVersion !== '0.1.0' ||
    value.contractVersion !== FE023_CONTRACT_VERSION ||
    !validFe023AuthorityBoundary(value.authorityBoundary)
  ) {
    return false;
  }

  if (value.status === 'ready') {
    return (
      exactKeys(value, [
        'schemaVersion',
        'artifactVersion',
        'contractVersion',
        'status',
        'session',
        'authorityBoundary',
      ]) &&
      value.schemaVersion === 'fe023-digest-bound-product-preview-open-success-v1'
    );
  }

  return (
    value.status === 'rejected' &&
    exactKeys(value, [
      'schemaVersion',
      'artifactVersion',
      'contractVersion',
      'status',
      'rejection',
      'authorityBoundary',
    ]) &&
    value.schemaVersion === 'fe023-digest-bound-product-preview-open-rejected-v1'
  );
}

function wrapStrictEngineModule(value: unknown): FacePreviewEngineModuleV1 | null {
  if (
    !isRecord(value) ||
    value.FE023_CONTRACT_VERSION !== FE023_CONTRACT_VERSION ||
    typeof value.openDigestBoundProductPreviewSessionFE023 !== 'function'
  ) {
    return null;
  }

  const open = value.openDigestBoundProductPreviewSessionFE023 as (
    config: unknown,
  ) => Promise<unknown>;

  return Object.freeze({
    FE023_CONTRACT_VERSION,
    async openDigestBoundProductPreviewSessionFE023(config: unknown): Promise<unknown> {
      const result = await open(config);
      return validFe023OpenEnvelope(result)
        ? result
        : Object.freeze({
            contractVersion: FE023_CONTRACT_VERSION,
            status: 'contract_mismatch',
          });
    },
  });
}

export async function bootstrapFacePreviewRuntimeV1(
  input: FacePreviewRuntimeBootstrapInputV1,
): Promise<FacePreviewConsumerOpenResultV1> {
  if (
    !isRecord(input) ||
    !exactKeys(input, input.fetchImpl === undefined
      ? ['schemaVersion', 'loadEngineModule']
      : ['schemaVersion', 'loadEngineModule', 'fetchImpl']) ||
    input.schemaVersion !== 'myeongha-face-preview-runtime-bootstrap-input-v1' ||
    typeof input.loadEngineModule !== 'function' ||
    (input.fetchImpl !== undefined && typeof input.fetchImpl !== 'function')
  ) {
    return rejected('INVALID_CONFIGURATION');
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(RUNTIME_CONFIG_PATH, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'force-cache',
      redirect: 'error',
    });
  } catch {
    return rejected('ENGINE_INITIALIZATION_FAILED');
  }

  if (!response.ok) {
    return rejected('ENGINE_INITIALIZATION_FAILED');
  }

  let runtimePayload: unknown;
  try {
    runtimePayload = await response.json();
  } catch {
    return rejected('ENGINE_CONTRACT_MISMATCH');
  }
  const assets = parseRuntimeAssets(runtimePayload);
  if (assets === null) {
    return rejected('ENGINE_CONTRACT_MISMATCH');
  }

  let loadedModule: unknown;
  try {
    loadedModule = await input.loadEngineModule();
  } catch {
    return rejected('ENGINE_INITIALIZATION_FAILED');
  }
  const engineModule = wrapStrictEngineModule(loadedModule);
  if (engineModule === null) {
    return rejected('ENGINE_CONTRACT_MISMATCH');
  }

  return openFacePreviewConsumerSessionV1({
    schemaVersion: 'myeongha-face-preview-consumer-config-v1',
    engineModule,
    assets,
  });
}
