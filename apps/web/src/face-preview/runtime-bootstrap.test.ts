import { describe, expect, it, vi } from 'vitest';
import {
  FACE_PREVIEW_RUNTIME_BOOTSTRAP_VERSION_V1,
  bootstrapFacePreviewRuntimeV1,
} from './runtime-bootstrap.js';

const authority = Object.freeze({
  composesExistingDigestBoundProductSafeContractsOnly: true,
  performsResearchDecision: false,
  performsValidationDecision: false,
  classificationIssued: false,
  scoreIssued: false,
  rankIssued: false,
  traditionalInterpretationIssued: false,
  physiognomyClaimIssued: false,
  fortuneClaimIssued: false,
  productionActivated: false,
  commerceActivated: false,
});

const runtimeConfig = Object.freeze({
  schemaVersion: 'myeongha-face-preview-runtime-config-v1',
  contractVersion: 'FE027-FACE-PREVIEW-RUNTIME-ASSETS-v1',
  assets: {
    schemaVersion: 'fe022-digest-bound-mediapipe-model-config-v1',
    wasmRoot: '/face-preview/mediapipe/0.10.35/wasm',
    modelAssetPath: '/face-preview/models/face_landmarker.float16.v1.task',
    modelAssetSha256:
      '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
  },
  verification: {
    modelBytesVerifiedAtBuild: true,
    wasmBytesVerifiedAtBuild: true,
    userImageBytesIncluded: false,
  },
});

function fetchOk(payload: unknown = runtimeConfig) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('FE029 Face Preview runtime bootstrap', () => {
  it('fetches only the same-origin FE027 runtime config and opens FE026 with exact assets', async () => {
    const open = vi.fn().mockResolvedValue({
      schemaVersion: 'fe023-digest-bound-product-preview-open-rejected-v1',
      artifactVersion: '0.1.0',
      contractVersion: 'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1',
      status: 'rejected',
      rejection: {
        code: 'BROWSER_CAPABILITY_UNAVAILABLE',
        stage: 'ingress',
      },
      authorityBoundary: authority,
    });
    const fetchImpl = fetchOk();

    const result = await bootstrapFacePreviewRuntimeV1({
      schemaVersion: 'myeongha-face-preview-runtime-bootstrap-input-v1',
      fetchImpl,
      loadEngineModule: vi.fn().mockResolvedValue({
        FE023_CONTRACT_VERSION:
          'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1',
        openDigestBoundProductPreviewSessionFE023: open,
      }),
    });

    expect(FACE_PREVIEW_RUNTIME_BOOTSTRAP_VERSION_V1)
      .toBe('MHA-FACE-PREVIEW-RUNTIME-BOOTSTRAP-v1');
    expect(fetchImpl).toHaveBeenCalledWith('/face-preview/runtime-assets.json', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'force-cache',
      redirect: 'error',
    });
    expect(open).toHaveBeenCalledWith({
      schemaVersion: 'fe023-digest-bound-product-preview-config-v1',
      assets: runtimeConfig.assets,
    });
    expect(result).toMatchObject({
      status: 'rejected',
      rejection: {
        code: 'BROWSER_CAPABILITY_UNAVAILABLE',
        stage: 'ingress',
      },
    });
  });

  it('fails closed when runtime config drifts or contains unverified bytes', async () => {
    const loadEngineModule = vi.fn();
    const widened = {
      ...runtimeConfig,
      verification: {
        ...runtimeConfig.verification,
        wasmBytesVerifiedAtBuild: false,
      },
    };
    const result = await bootstrapFacePreviewRuntimeV1({
      schemaVersion: 'myeongha-face-preview-runtime-bootstrap-input-v1',
      fetchImpl: fetchOk(widened),
      loadEngineModule,
    });
    expect(result).toMatchObject({
      status: 'rejected',
      rejection: { code: 'ENGINE_CONTRACT_MISMATCH', stage: 'open' },
    });
    expect(loadEngineModule).not.toHaveBeenCalled();
  });

  it('fails closed on fetch, JSON, and module-loader failures without raw error leakage', async () => {
    const fetchFailure = vi.fn().mockRejectedValue(new Error('network secret'));
    const fetchResult = await bootstrapFacePreviewRuntimeV1({
      schemaVersion: 'myeongha-face-preview-runtime-bootstrap-input-v1',
      fetchImpl: fetchFailure,
      loadEngineModule: vi.fn(),
    });
    expect(fetchResult).toMatchObject({
      status: 'rejected',
      rejection: { code: 'ENGINE_INITIALIZATION_FAILED', stage: 'open' },
    });
    expect(JSON.stringify(fetchResult)).not.toContain('network secret');

    const badJson = vi.fn().mockResolvedValue(
      new Response('{', { status: 200 }),
    );
    expect(await bootstrapFacePreviewRuntimeV1({
      schemaVersion: 'myeongha-face-preview-runtime-bootstrap-input-v1',
      fetchImpl: badJson,
      loadEngineModule: vi.fn(),
    })).toMatchObject({
      status: 'rejected',
      rejection: { code: 'ENGINE_CONTRACT_MISMATCH', stage: 'open' },
    });

    const loaderFailure = await bootstrapFacePreviewRuntimeV1({
      schemaVersion: 'myeongha-face-preview-runtime-bootstrap-input-v1',
      fetchImpl: fetchOk(),
      loadEngineModule: vi.fn().mockRejectedValue(new Error('module secret')),
    });
    expect(loaderFailure).toMatchObject({
      status: 'rejected',
      rejection: { code: 'ENGINE_INITIALIZATION_FAILED', stage: 'open' },
    });
    expect(JSON.stringify(loaderFailure)).not.toContain('module secret');
  });

  it('rejects widened FE023 open envelopes before FE026 consumption', async () => {
    const result = await bootstrapFacePreviewRuntimeV1({
      schemaVersion: 'myeongha-face-preview-runtime-bootstrap-input-v1',
      fetchImpl: fetchOk(),
      loadEngineModule: vi.fn().mockResolvedValue({
        FE023_CONTRACT_VERSION:
          'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1',
        openDigestBoundProductPreviewSessionFE023: vi.fn().mockResolvedValue({
          schemaVersion: 'fe023-digest-bound-product-preview-open-rejected-v1',
          artifactVersion: '0.1.0',
          contractVersion:
            'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1',
          status: 'rejected',
          rejection: { code: 'NO_FACE_DETECTED', stage: 'analysis' },
          authorityBoundary: authority,
          providerRunRef: 'leak',
        }),
      }),
    });
    expect(result).toMatchObject({
      status: 'rejected',
      rejection: { code: 'ENGINE_CONTRACT_MISMATCH', stage: 'open' },
    });
    expect(JSON.stringify(result)).not.toContain('providerRunRef');
  });
});
