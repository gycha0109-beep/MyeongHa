export const FACE_PREVIEW_ENGINE_DELIVERY_VERSION_FE033 =
  'MHA-FACE-PREVIEW-ENGINE-DELIVERY-FE033-v1' as const;

const EXPECTED_FE023_CONTRACT =
  'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1' as const;

export interface FacePreviewEngineModuleFE033 {
  readonly FE023_CONTRACT_VERSION: typeof EXPECTED_FE023_CONTRACT;
  readonly openDigestBoundProductPreviewSessionFE023: (...args: never[]) => unknown;
}

let cachedEngineModule: Promise<FacePreviewEngineModuleFE033> | null = null;

function projectEngineModule(module: unknown): FacePreviewEngineModuleFE033 {
  if (module === null || typeof module !== 'object') {
    throw new Error('FACE_PREVIEW_ENGINE_MODULE_INVALID');
  }

  const candidate = module as Record<string, unknown>;
  if (
    candidate.FE023_CONTRACT_VERSION !== EXPECTED_FE023_CONTRACT ||
    typeof candidate.openDigestBoundProductPreviewSessionFE023 !== 'function'
  ) {
    throw new Error('FACE_PREVIEW_ENGINE_CONTRACT_MISMATCH');
  }

  return Object.freeze({
    FE023_CONTRACT_VERSION: EXPECTED_FE023_CONTRACT,
    openDigestBoundProductPreviewSessionFE023:
      candidate.openDigestBoundProductPreviewSessionFE023 as (
        ...args: never[]
      ) => unknown,
  });
}

export function loadFacePreviewEngineFE033(): Promise<FacePreviewEngineModuleFE033> {
  cachedEngineModule ??= import('@myeongha/face-reading/preview-engine').then(
    projectEngineModule,
  );
  return cachedEngineModule;
}
