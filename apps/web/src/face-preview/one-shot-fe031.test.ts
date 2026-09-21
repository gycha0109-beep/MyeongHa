import { describe, expect, it, vi } from 'vitest';
import {
  FACE_PREVIEW_ONE_SHOT_VERSION_FE031,
  runFacePreviewOneShotFE031,
} from './one-shot-fe031.js';
import type {
  FacePreviewConsumerOpenResultV1,
} from './consumer-adapter.js';

const boundary = Object.freeze({
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

const sourceBlob = new Blob([new ArrayBuffer(8)], { type: 'image/jpeg' });
const canonicalBlob = new Blob([new ArrayBuffer(4)], { type: 'image/jpeg' });

function readyOpen(
  analyze: ReturnType<typeof vi.fn>,
  close: ReturnType<typeof vi.fn>,
): FacePreviewConsumerOpenResultV1 {
  return {
    schemaVersion: 'myeongha-face-preview-consumer-open-v1',
    contractVersion: 'MHA-FACE-PREVIEW-CONSUMER-FE023-v1',
    status: 'ready',
    session: {
      schemaVersion: 'myeongha-face-preview-consumer-session-v1',
      contractVersion: 'MHA-FACE-PREVIEW-CONSUMER-FE023-v1',
      sessionState: 'neutral_face_preview_only',
      boundary,
      analyze,
      close,
    },
    boundary,
  };
}

function intakeReady() {
  return {
    schemaVersion: 'myeongha-face-preview-image-intake-result-v1' as const,
    contractVersion: 'MHA-FACE-PREVIEW-IMAGE-INTAKE-FE030-v1' as const,
    status: 'ready' as const,
    image: canonicalBlob,
    receipt: {
      sourceMime: 'image/jpeg' as const,
      sourceBytes: 8,
      decodedWidth: 100,
      decodedHeight: 100,
      canonicalMime: 'image/jpeg' as const,
      canonicalBytes: 4,
      canonicalWidth: 100,
      canonicalHeight: 100,
      orientationAppliedDuringDecode: true as const,
      metadataPreserved: false as const,
      rawInputPersisted: false as const,
      identityEmbeddingCreated: false as const,
    },
  };
}

describe('FE031 one-shot Face Preview controller', () => {
  it('sanitizes first, analyzes only canonical bytes, closes, and returns neutral preview', async () => {
    const sanitize = vi.fn().mockResolvedValue(intakeReady());
    const analyze = vi.fn().mockResolvedValue({
      schemaVersion: 'myeongha-face-preview-consumer-attempt-v1',
      contractVersion: 'MHA-FACE-PREVIEW-CONSUMER-FE023-v1',
      status: 'ok',
      preview: {
        metrics: [{
          regionKey: 'eye_pair',
          metricRef: 'eye.span',
          value: 0.42,
          unit: 'ratio',
        }],
        regions: [
          { regionKey: 'eye_pair', state: 'available', unavailableSurfaces: [] },
          { regionKey: 'cheek_mid_face', state: 'available', unavailableSurfaces: [] },
          { regionKey: 'mouth_lips', state: 'available', unavailableSurfaces: [] },
          { regionKey: 'chin_lower_face', state: 'available', unavailableSurfaces: [] },
        ],
      },
      boundary,
    });
    const close = vi.fn().mockResolvedValue({ status: 'closed' });
    const bootstrap = vi.fn().mockResolvedValue(readyOpen(analyze, close));
    const loadEngineModule = vi.fn();

    const result = await runFacePreviewOneShotFE031({
      schemaVersion: 'myeongha-face-preview-one-shot-input-v1',
      blob: sourceBlob,
      loadEngineModule,
    }, { sanitize, bootstrap });

    expect(FACE_PREVIEW_ONE_SHOT_VERSION_FE031)
      .toBe('MHA-FACE-PREVIEW-ONE-SHOT-FE031-v1');
    expect(sanitize).toHaveBeenCalledWith({
      schemaVersion: 'myeongha-face-preview-image-intake-input-v1',
      blob: sourceBlob,
    });
    expect(analyze).toHaveBeenCalledWith(canonicalBlob);
    expect(analyze).not.toHaveBeenCalledWith(sourceBlob);
    expect(close).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'ok',
      preview: {
        metrics: [{ metricRef: 'eye.span', value: 0.42 }],
      },
      lifecycle: {
        metadataStrippedBeforeAnalysis: true,
        rawInputPersisted: false,
        canonicalImagePersisted: false,
        identityEmbeddingCreated: false,
        sessionClosed: true,
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('modelAsset');
    expect(serialized).not.toContain('providerRunRef');
    expect(serialized).not.toContain('geometry');
  });

  it('stops before runtime bootstrap when intake rejects', async () => {
    const bootstrap = vi.fn();
    const result = await runFacePreviewOneShotFE031({
      schemaVersion: 'myeongha-face-preview-one-shot-input-v1',
      blob: sourceBlob,
      loadEngineModule: vi.fn(),
    }, {
      sanitize: vi.fn().mockResolvedValue({
        schemaVersion: 'myeongha-face-preview-image-intake-result-v1',
        contractVersion: 'MHA-FACE-PREVIEW-IMAGE-INTAKE-FE030-v1',
        status: 'rejected',
        rejection: { code: 'IMAGE_SIGNATURE_MISMATCH', stage: 'intake' },
      }),
      bootstrap,
    });

    expect(result).toMatchObject({
      status: 'rejected',
      rejection: { code: 'IMAGE_SIGNATURE_MISMATCH', stage: 'intake' },
    });
    expect(bootstrap).not.toHaveBeenCalled();
  });

  it('preserves bounded open/analysis rejection and still closes ready sessions', async () => {
    const openRejected: FacePreviewConsumerOpenResultV1 = {
      schemaVersion: 'myeongha-face-preview-consumer-open-v1',
      contractVersion: 'MHA-FACE-PREVIEW-CONSUMER-FE023-v1',
      status: 'rejected',
      rejection: { code: 'ENGINE_CONTRACT_MISMATCH', stage: 'open' },
      boundary,
    };
    const rejectedOpen = await runFacePreviewOneShotFE031({
      schemaVersion: 'myeongha-face-preview-one-shot-input-v1',
      blob: sourceBlob,
      loadEngineModule: vi.fn(),
    }, {
      sanitize: vi.fn().mockResolvedValue(intakeReady()),
      bootstrap: vi.fn().mockResolvedValue(openRejected),
    });
    expect(rejectedOpen).toMatchObject({
      status: 'rejected',
      rejection: { code: 'ENGINE_CONTRACT_MISMATCH', stage: 'open' },
    });

    const close = vi.fn().mockResolvedValue({ status: 'closed' });
    const analysisRejected = await runFacePreviewOneShotFE031({
      schemaVersion: 'myeongha-face-preview-one-shot-input-v1',
      blob: sourceBlob,
      loadEngineModule: vi.fn(),
    }, {
      sanitize: vi.fn().mockResolvedValue(intakeReady()),
      bootstrap: vi.fn().mockResolvedValue(readyOpen(
        vi.fn().mockResolvedValue({
          schemaVersion: 'myeongha-face-preview-consumer-attempt-v1',
          contractVersion: 'MHA-FACE-PREVIEW-CONSUMER-FE023-v1',
          status: 'rejected',
          rejection: { code: 'NO_FACE_DETECTED', stage: 'analysis' },
          boundary,
        }),
        close,
      )),
    });
    expect(analysisRejected).toMatchObject({
      status: 'rejected',
      rejection: { code: 'NO_FACE_DETECTED', stage: 'analysis' },
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('fails closed when session cleanup fails and leaks no raw error', async () => {
    const close = vi.fn().mockRejectedValue(new Error('cleanup secret'));
    const result = await runFacePreviewOneShotFE031({
      schemaVersion: 'myeongha-face-preview-one-shot-input-v1',
      blob: sourceBlob,
      loadEngineModule: vi.fn(),
    }, {
      sanitize: vi.fn().mockResolvedValue(intakeReady()),
      bootstrap: vi.fn().mockResolvedValue(readyOpen(
        vi.fn().mockResolvedValue({
          schemaVersion: 'myeongha-face-preview-consumer-attempt-v1',
          contractVersion: 'MHA-FACE-PREVIEW-CONSUMER-FE023-v1',
          status: 'ok',
          preview: { metrics: [], regions: [] },
          boundary,
        }),
        close,
      )),
    });
    expect(result).toMatchObject({
      status: 'rejected',
      rejection: { code: 'SESSION_CLOSE_FAILED', stage: 'lifecycle' },
    });
    expect(JSON.stringify(result)).not.toContain('cleanup secret');
  });
});
