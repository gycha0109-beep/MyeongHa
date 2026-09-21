import type {
  FacePreviewConsumerConfigV1,
  FacePreviewEngineModuleV1,
} from './consumer-adapter.js';

export const FACE_PREVIEW_RUNTIME_BUILD_CONTRACT_VERSION_FE028 =
  'FE028-FACE-PREVIEW-PRODUCTION-BUILD-v1' as const;

export const FACE_PREVIEW_RUNTIME_CONFIG_PATH_FE028 =
  '/face-preview/runtime-assets.json' as const;

export const FACE_PREVIEW_MODEL_SHA256_FE028 =
  '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff' as const;

const EXPECTED_WASM_ROOT = '/face-preview/mediapipe/0.10.35/wasm';
const EXPECTED_MODEL_PATH =
  '/face-preview/models/face_landmarker.float16.v1.task';

type RuntimeAssets = FacePreviewConsumerConfigV1['assets'];

interface RuntimeConfigDocument {
  readonly schemaVersion: 'myeongha-face-preview-runtime-config-v1';
  readonly contractVersion: 'FE027-FACE-PREVIEW-RUNTIME-ASSETS-v1';
  readonly assets: RuntimeAssets;
  readonly verification: {
    readonly modelBytesVerifiedAtBuild: true;
    readonly wasmBytesVerifiedAtBuild: true;
    readonly userImageBytesIncluded: false;
  };
}

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

function parseRuntimeConfig(value: unknown): RuntimeConfigDocument | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'schemaVersion',
      'contractVersion',
      'assets',
      'verification',
    ]) ||
    value.schemaVersion !== 'myeongha-face-preview-runtime-config-v1' ||
    value.contractVersion !== 'FE027-FACE-PREVIEW-RUNTIME-ASSETS-v1' ||
    !isRecord(value.assets) ||
    !exactKeys(value.assets, [
      'schemaVersion',
      'wasmRoot',
      'modelAssetPath',
      'modelAssetSha256',
    ]) ||
    value.assets.schemaVersion !==
      'fe022-digest-bound-mediapipe-model-config-v1' ||
    value.assets.wasmRoot !== EXPECTED_WASM_ROOT ||
    value.assets.modelAssetPath !== EXPECTED_MODEL_PATH ||
    value.assets.modelAssetSha256 !== FACE_PREVIEW_MODEL_SHA256_FE028 ||
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
    schemaVersion: 'myeongha-face-preview-runtime-config-v1' as const,
    contractVersion: 'FE027-FACE-PREVIEW-RUNTIME-ASSETS-v1' as const,
    assets: Object.freeze({
      schemaVersion:
        'fe022-digest-bound-mediapipe-model-config-v1' as const,
      wasmRoot: EXPECTED_WASM_ROOT,
      modelAssetPath: EXPECTED_MODEL_PATH,
      modelAssetSha256: FACE_PREVIEW_MODEL_SHA256_FE028,
    }),
    verification: Object.freeze({
      modelBytesVerifiedAtBuild: true as const,
      wasmBytesVerifiedAtBuild: true as const,
      userImageBytesIncluded: false as const,
    }),
  });
}

export async function loadFacePreviewRuntimeAssetsFE028(
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<RuntimeAssets> {
  if (typeof fetchImpl !== 'function') {
    throw new Error('FE028_RUNTIME_CONFIG_FETCH_UNAVAILABLE');
  }

  let response: Response;
  try {
    response = await fetchImpl(FACE_PREVIEW_RUNTIME_CONFIG_PATH_FE028, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('FE028_RUNTIME_CONFIG_FETCH_FAILED');
  }

  if (!response.ok) {
    throw new Error('FE028_RUNTIME_CONFIG_FETCH_FAILED');
  }

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error('FE028_RUNTIME_CONFIG_INVALID');
  }

  const parsed = parseRuntimeConfig(value);
  if (parsed === null) {
    throw new Error('FE028_RUNTIME_CONFIG_INVALID');
  }

  return parsed.assets;
}

export async function createFacePreviewConsumerConfigFE028(
  engineModule: FacePreviewEngineModuleV1,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<FacePreviewConsumerConfigV1> {
  const assets = await loadFacePreviewRuntimeAssetsFE028(fetchImpl);
  return Object.freeze({
    schemaVersion: 'myeongha-face-preview-consumer-config-v1' as const,
    engineModule,
    assets,
  });
}
