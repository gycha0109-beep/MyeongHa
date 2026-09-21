import { describe, expect, it, vi } from 'vitest';
import {
  FACE_PREVIEW_MODEL_SHA256_FE028,
  FACE_PREVIEW_RUNTIME_CONFIG_PATH_FE028,
  createFacePreviewConsumerConfigFE028,
  loadFacePreviewRuntimeAssetsFE028,
} from './runtime-config-fe028.js';

const runtimeConfig = Object.freeze({
  schemaVersion: 'myeongha-face-preview-runtime-config-v1',
  contractVersion: 'FE027-FACE-PREVIEW-RUNTIME-ASSETS-v1',
  assets: {
    schemaVersion: 'fe022-digest-bound-mediapipe-model-config-v1',
    wasmRoot: '/face-preview/mediapipe/0.10.35/wasm',
    modelAssetPath: '/face-preview/models/face_landmarker.float16.v1.task',
    modelAssetSha256: FACE_PREVIEW_MODEL_SHA256_FE028,
  },
  verification: {
    modelBytesVerifiedAtBuild: true,
    wasmBytesVerifiedAtBuild: true,
    userImageBytesIncluded: false,
  },
});

function response(value: unknown, ok = true): Response {
  return {
    ok,
    json: vi.fn().mockResolvedValue(value),
  } as unknown as Response;
}

describe('FE028 production runtime config', () => {
  it('loads only the exact same-origin FE027 runtime config', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(runtimeConfig));
    await expect(loadFacePreviewRuntimeAssetsFE028(fetchImpl)).resolves.toEqual(
      runtimeConfig.assets,
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      FACE_PREVIEW_RUNTIME_CONFIG_PATH_FE028,
      { cache: 'no-store', credentials: 'same-origin' },
    );
  });

  it('builds the bounded FE026 consumer config without widening assets', async () => {
    const engineModule = {
      FE023_CONTRACT_VERSION:
        'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1',
      openDigestBoundProductPreviewSessionFE023: vi.fn(),
    };
    const config = await createFacePreviewConsumerConfigFE028(
      engineModule,
      vi.fn().mockResolvedValue(response(runtimeConfig)),
    );
    expect(config).toEqual({
      schemaVersion: 'myeongha-face-preview-consumer-config-v1',
      engineModule,
      assets: runtimeConfig.assets,
    });
    expect(JSON.stringify(config)).not.toContain('verification');
  });

  it.each([
    {
      ...runtimeConfig,
      assets: { ...runtimeConfig.assets, wasmRoot: 'https://cdn.example/wasm' },
    },
    {
      ...runtimeConfig,
      assets: { ...runtimeConfig.assets, modelAssetSha256: '0'.repeat(64) },
    },
    {
      ...runtimeConfig,
      verification: {
        ...runtimeConfig.verification,
        wasmBytesVerifiedAtBuild: false,
      },
    },
    { ...runtimeConfig, unexpected: true },
  ])('fails closed on runtime config drift', async (value) => {
    await expect(
      loadFacePreviewRuntimeAssetsFE028(
        vi.fn().mockResolvedValue(response(value)),
      ),
    ).rejects.toThrow('FE028_RUNTIME_CONFIG_INVALID');
  });

  it('normalizes transport and JSON failures', async () => {
    await expect(
      loadFacePreviewRuntimeAssetsFE028(
        vi.fn().mockRejectedValue(new Error('network secret')),
      ),
    ).rejects.toThrow('FE028_RUNTIME_CONFIG_FETCH_FAILED');

    await expect(
      loadFacePreviewRuntimeAssetsFE028(
        vi.fn().mockResolvedValue(response({}, false)),
      ),
    ).rejects.toThrow('FE028_RUNTIME_CONFIG_FETCH_FAILED');

    const invalidJson = {
      ok: true,
      json: vi.fn().mockRejectedValue(new Error('parse secret')),
    } as unknown as Response;
    await expect(
      loadFacePreviewRuntimeAssetsFE028(
        vi.fn().mockResolvedValue(invalidJson),
      ),
    ).rejects.toThrow('FE028_RUNTIME_CONFIG_INVALID');
  });
});
