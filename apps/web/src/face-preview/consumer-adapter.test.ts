import { describe, expect, it, vi } from 'vitest';
import {
  FACE_PREVIEW_CONSUMER_CONTRACT_VERSION_V1,
  openFacePreviewConsumerSessionV1,
  type FacePreviewConsumerConfigV1,
} from './consumer-adapter.js';

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

const attemptAuthority = Object.freeze({
  consumesUpstreamNeutralObservationOnly: true,
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

const receipt = Object.freeze({
  sourceContractVersion: 'FE011-HOST-SAFE-BROWSER-PREVIEW-ATTEMPT-v1',
  sourceConsumerProjectionSchemaVersion: 'fe003-consumer-safe-preview-output-v1',
  providerRunRefOmitted: true,
  canonicalAssetDigestOmitted: true,
  fe004ExecutionReceiptOmitted: true,
  rawInternalErrorsOmitted: true,
  rawProviderPayloadOmitted: true,
  rawGeometryOmitted: true,
  jsonSafePlainDataOnly: true,
});

function readySession(analyze = vi.fn(), close = vi.fn()) {
  return {
    schemaVersion: 'fe023-digest-bound-product-preview-session-v1',
    artifactVersion: '0.1.0',
    contractVersion: 'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1',
    sessionState: 'digest_bound_product_direct_blob_session_only',
    compositionReceipt: {
      sourceRuntimeAssetContractVersion: 'FE022-DIGEST-BOUND-MEDIAPIPE-MODEL-RUNTIME-v1',
      sourceReusableSessionContractVersion: 'FE017-REUSABLE-PRODUCT-SAFE-BROWSER-PREVIEW-SESSION-v1',
      digestBoundRuntimeFactoryCreatedInternally: true,
      modelDigestRequiredBeforeRuntimeReady: true,
      runtimeFactoryExposed: false,
      hostAssetRefsExposed: false,
      modelDigestExposed: false,
      lowerLevelAnalysisRequestSchemaHidden: true,
      innerSessionExposed: false,
      productSafeAttemptResultPreserved: true,
      productSafeCloseResultPreserved: true,
    },
    authorityBoundary: authority,
    analyze,
    close,
  };
}

function config(open: (value: unknown) => Promise<unknown>): FacePreviewConsumerConfigV1 {
  return {
    schemaVersion: 'myeongha-face-preview-consumer-config-v1',
    engineModule: {
      FE023_CONTRACT_VERSION:
        'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1',
      openDigestBoundProductPreviewSessionFE023: open,
    },
    assets: {
      schemaVersion: 'fe022-digest-bound-mediapipe-model-config-v1',
      wasmRoot: '/vendor/mediapipe/wasm',
      modelAssetPath: '/models/face_landmarker.task',
      modelAssetSha256: 'a'.repeat(64),
    },
  };
}

describe('FE026 face preview consumer adapter', () => {
  it('opens FE023 with exact digest-bound config and exposes neutral preview only', async () => {
    const analyze = vi.fn().mockResolvedValue({
      schemaVersion: 'fe017-product-safe-preview-attempt-success-v1',
      artifactVersion: '0.1.0',
      contractVersion: 'FE017-REUSABLE-PRODUCT-SAFE-BROWSER-PREVIEW-SESSION-v1',
      status: 'ok',
      preview: {
        metrics: [
          {
            regionKey: 'eye_pair',
            metricRef: 'eye.span',
            value: 0.42,
            unit: 'ratio',
          },
        ],
        regions: [
          { regionKey: 'eye_pair', state: 'available', unavailableSurfaces: [] },
          { regionKey: 'cheek_mid_face', state: 'available', unavailableSurfaces: [] },
          { regionKey: 'mouth_lips', state: 'available', unavailableSurfaces: [] },
          { regionKey: 'chin_lower_face', state: 'available', unavailableSurfaces: [] },
        ],
      },
      transportReceipt: receipt,
      authorityBoundary: attemptAuthority,
    });
    const close = vi.fn().mockResolvedValue({ status: 'closed' });
    const open = vi.fn().mockResolvedValue({
      schemaVersion: 'fe023-digest-bound-product-preview-open-success-v1',
      artifactVersion: '0.1.0',
      contractVersion: 'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1',
      status: 'ready',
      session: readySession(analyze, close),
      authorityBoundary: authority,
    });

    const opened = await openFacePreviewConsumerSessionV1(config(open));
    expect(open).toHaveBeenCalledWith({
      schemaVersion: 'fe023-digest-bound-product-preview-config-v1',
      assets: {
        schemaVersion: 'fe022-digest-bound-mediapipe-model-config-v1',
        wasmRoot: '/vendor/mediapipe/wasm',
        modelAssetPath: '/models/face_landmarker.task',
        modelAssetSha256: 'a'.repeat(64),
      },
    });
    expect(opened.status).toBe('ready');
    if (opened.status !== 'ready') throw new Error('expected ready');

    const result = await opened.session.analyze(new Blob(['face'], { type: 'image/png' }));
    expect(result).toEqual({
      schemaVersion: 'myeongha-face-preview-consumer-attempt-v1',
      contractVersion: FACE_PREVIEW_CONSUMER_CONTRACT_VERSION_V1,
      status: 'ok',
      preview: {
        metrics: [
          {
            regionKey: 'eye_pair',
            metricRef: 'eye.span',
            value: 0.42,
            unit: 'ratio',
          },
        ],
        regions: [
          { regionKey: 'eye_pair', state: 'available', unavailableSurfaces: [] },
          { regionKey: 'cheek_mid_face', state: 'available', unavailableSurfaces: [] },
          { regionKey: 'mouth_lips', state: 'available', unavailableSurfaces: [] },
          { regionKey: 'chin_lower_face', state: 'available', unavailableSurfaces: [] },
        ],
      },
      boundary: {
        neutralObservationOnly: true,
        rawImagePersisted: false,
        biometricEmbeddingCreated: false,
        rawGeometryExposed: false,
        providerTraceExposed: false,
        interpretationIssued: false,
        classificationIssued: false,
        rankingIssued: false,
        productionAuthorityIssued: false,
        commerceAuthorityIssued: false,
      },
    });
    expect(await opened.session.close()).toEqual({ status: 'closed' });

    const serialized = JSON.stringify(opened);
    expect(serialized).not.toContain('/vendor/mediapipe/wasm');
    expect(serialized).not.toContain('/models/face_landmarker.task');
    expect(serialized).not.toContain('a'.repeat(64));
    expect(serialized).not.toContain('transportReceipt');
    expect(serialized).not.toContain('providerRunRef');
  });

  it('preserves bounded upstream rejection without leaking details', async () => {
    const open = vi.fn().mockResolvedValue({
      schemaVersion: 'fe023-digest-bound-product-preview-open-rejected-v1',
      artifactVersion: '0.1.0',
      contractVersion: 'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1',
      status: 'rejected',
      rejection: { code: 'BROWSER_CAPABILITY_UNAVAILABLE', stage: 'ingress' },
      authorityBoundary: authority,
    });
    const result = await openFacePreviewConsumerSessionV1(config(open));
    expect(result).toMatchObject({
      status: 'rejected',
      rejection: { code: 'BROWSER_CAPABILITY_UNAVAILABLE', stage: 'ingress' },
    });
  });

  it('fails closed on module drift, malformed attempts, and widened session data', async () => {
    const invalidModule = config(vi.fn());
    invalidModule.engineModule.FE023_CONTRACT_VERSION = 'wrong';
    expect(await openFacePreviewConsumerSessionV1(invalidModule)).toMatchObject({
      status: 'rejected',
      rejection: { code: 'INVALID_CONFIGURATION', stage: 'open' },
    });

    const analyze = vi.fn().mockResolvedValue({
      schemaVersion: 'fe017-product-safe-preview-attempt-success-v1',
      artifactVersion: '0.1.0',
      contractVersion: 'FE017-REUSABLE-PRODUCT-SAFE-BROWSER-PREVIEW-SESSION-v1',
      status: 'ok',
      preview: { metrics: [], regions: [] },
      transportReceipt: receipt,
      authorityBoundary: attemptAuthority,
      providerRunRef: 'leak',
    });
    const openMalformed = vi.fn().mockResolvedValue({
      schemaVersion: 'fe023-digest-bound-product-preview-open-success-v1',
      artifactVersion: '0.1.0',
      contractVersion: 'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1',
      status: 'ready',
      session: readySession(analyze, vi.fn().mockResolvedValue({ status: 'closed' })),
      authorityBoundary: authority,
    });
    const opened = await openFacePreviewConsumerSessionV1(config(openMalformed));
    expect(opened.status).toBe('ready');
    if (opened.status !== 'ready') throw new Error('expected ready');
    expect(await opened.session.analyze(new Blob(['face']))).toMatchObject({
      status: 'rejected',
      rejection: { code: 'ENGINE_CONTRACT_MISMATCH', stage: 'analysis' },
    });

    const widenedSession = readySession();
    const openWidened = vi.fn().mockResolvedValue({
      schemaVersion: 'fe023-digest-bound-product-preview-open-success-v1',
      artifactVersion: '0.1.0',
      contractVersion: 'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1',
      status: 'ready',
      session: { ...widenedSession, modelAssetSha256: 'leak' },
      authorityBoundary: authority,
    });
    expect(await openFacePreviewConsumerSessionV1(config(openWidened))).toMatchObject({
      status: 'rejected',
      rejection: { code: 'ENGINE_CONTRACT_MISMATCH', stage: 'open' },
    });
  });

  it('rejects non-Blob ingress and normalizes thrown engine failures', async () => {
    const analyze = vi.fn().mockRejectedValue(new Error('secret runtime failure'));
    const open = vi.fn().mockResolvedValue({
      schemaVersion: 'fe023-digest-bound-product-preview-open-success-v1',
      artifactVersion: '0.1.0',
      contractVersion: 'FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1',
      status: 'ready',
      session: readySession(analyze, vi.fn().mockRejectedValue(new Error('close secret'))),
      authorityBoundary: authority,
    });
    const opened = await openFacePreviewConsumerSessionV1(config(open));
    if (opened.status !== 'ready') throw new Error('expected ready');

    expect(await opened.session.analyze({} as Blob)).toMatchObject({
      status: 'rejected',
      rejection: { code: 'INVALID_IMAGE_INPUT', stage: 'ingress' },
    });
    expect(await opened.session.analyze(new Blob(['face']))).toMatchObject({
      status: 'rejected',
      rejection: { code: 'ENGINE_RUNTIME_FAILED', stage: 'analysis' },
    });
    expect(await opened.session.close()).toEqual({
      status: 'rejected',
      rejection: { code: 'ENGINE_RUNTIME_FAILED', stage: 'lifecycle' },
    });
  });
});
