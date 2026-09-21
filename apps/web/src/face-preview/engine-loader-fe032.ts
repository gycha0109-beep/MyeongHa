import type { FacePreviewEngineModuleV1 } from './consumer-adapter.js';
import {
  runFacePreviewOneShotFE031,
  type FacePreviewOneShotResultFE031,
} from './one-shot-fe031.js';

export const FACE_PREVIEW_ENGINE_LOADER_VERSION_FE032 =
  'MHA-FACE-PREVIEW-ENGINE-LOADER-FE032-v1' as const;

const FE023_CONTRACT_VERSION =
  'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1' as const;

export async function loadVendoredFacePreviewEngineFE032():
Promise<FacePreviewEngineModuleV1> {
  const module = await import('@myeongha/face-reading/preview-engine');
  if (
    module.FE023_CONTRACT_VERSION !== FE023_CONTRACT_VERSION ||
    typeof module.openDigestBoundProductPreviewSessionFE023 !== 'function'
  ) {
    throw new Error('FE032_ENGINE_CONTRACT_MISMATCH');
  }

  return Object.freeze({
    FE023_CONTRACT_VERSION,
    openDigestBoundProductPreviewSessionFE023:
      module.openDigestBoundProductPreviewSessionFE023,
  });
}

export async function runVendoredFacePreviewOneShotFE032(
  blob: Blob,
  fetchImpl?: typeof fetch,
): Promise<FacePreviewOneShotResultFE031> {
  return runFacePreviewOneShotFE031(
    fetchImpl === undefined
      ? {
          schemaVersion: 'myeongha-face-preview-one-shot-input-v1',
          blob,
          loadEngineModule: loadVendoredFacePreviewEngineFE032,
        }
      : {
          schemaVersion: 'myeongha-face-preview-one-shot-input-v1',
          blob,
          loadEngineModule: loadVendoredFacePreviewEngineFE032,
          fetchImpl,
        },
  );
}
