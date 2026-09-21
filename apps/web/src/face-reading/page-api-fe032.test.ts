import { describe, expect, it, vi } from 'vitest';
import {
  createPhysiognomyPageApiFE032,
  PHYSIOGNOMY_PAGE_API_VERSION_FE032,
} from './page-api-fe032.js';

const blob = new Blob([new ArrayBuffer(8)], { type: 'image/jpeg' });

describe('FE032 physiognomy page API', () => {
  it('projects FE031 success into observation readiness without metrics', async () => {
    const runOneShot = vi.fn().mockResolvedValue({
      schemaVersion: 'myeongha-face-preview-one-shot-result-v1',
      contractVersion: 'MHA-FACE-PREVIEW-ONE-SHOT-FE031-v1',
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
          { regionKey: 'cheek_mid_face', state: 'partial', unavailableSurfaces: ['left'] },
          { regionKey: 'mouth_lips', state: 'available', unavailableSurfaces: [] },
          { regionKey: 'chin_lower_face', state: 'available', unavailableSurfaces: [] },
        ],
      },
      lifecycle: {
        metadataStrippedBeforeAnalysis: true,
        rawInputPersisted: false,
        canonicalImagePersisted: false,
        identityEmbeddingCreated: false,
        sessionClosed: true,
      },
    });

    const api = createPhysiognomyPageApiFE032({
      loadEngineModule: vi.fn(),
      runOneShot,
    });
    const result = await api.analyze(blob);

    expect(PHYSIOGNOMY_PAGE_API_VERSION_FE032)
      .toBe('MHA-PHYSIOGNOMY-PAGE-API-FE032-v1');
    expect(result).toEqual({
      schemaVersion: 'myeongha-physiognomy-page-analysis-v1',
      contractVersion: PHYSIOGNOMY_PAGE_API_VERSION_FE032,
      status: 'ready',
      observation: {
        availableRegions: 3,
        partialRegions: 1,
        totalRegions: 4,
      },
      privacy: {
        rawInputPersisted: false,
        canonicalImagePersisted: false,
        identityEmbeddingCreated: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain('eye.span');
    expect(JSON.stringify(result)).not.toContain('0.42');
  });

  it.each([
    ['IMAGE_SIGNATURE_MISMATCH', 'intake', 'image'],
    ['NO_FACE_DETECTED', 'analysis', 'face'],
    ['ENGINE_INITIALIZATION_FAILED', 'open', 'engine'],
    ['SESSION_CLOSE_FAILED', 'lifecycle', 'lifecycle'],
  ])('maps bounded rejection to UI reason only', async (code, stage, reason) => {
    const api = createPhysiognomyPageApiFE032({
      loadEngineModule: vi.fn(),
      runOneShot: vi.fn().mockResolvedValue({
        schemaVersion: 'myeongha-face-preview-one-shot-result-v1',
        contractVersion: 'MHA-FACE-PREVIEW-ONE-SHOT-FE031-v1',
        status: 'rejected',
        rejection: { code, stage },
        lifecycle: {
          rawInputPersisted: false,
          canonicalImagePersisted: false,
          identityEmbeddingCreated: false,
        },
      }),
    });
    await expect(api.analyze(blob)).resolves.toMatchObject({
      status: 'rejected',
      reason,
    });
  });

  it('rejects empty input before FE031', async () => {
    const runOneShot = vi.fn();
    const api = createPhysiognomyPageApiFE032({
      loadEngineModule: vi.fn(),
      runOneShot,
    });
    await expect(
      api.analyze(new Blob([], { type: 'image/jpeg' })),
    ).resolves.toMatchObject({ status: 'rejected', reason: 'image' });
    expect(runOneShot).not.toHaveBeenCalled();
  });
});
