import { describe, expect, it } from 'vitest';
import {
  FACE_PREVIEW_ENGINE_LOADER_VERSION_FE032,
  loadVendoredFacePreviewEngineFE032,
  runVendoredFacePreviewOneShotFE032,
} from './engine-loader-fe032.js';

describe('FE032 vendored Face Preview engine loader', () => {
  it('loads only the accepted FE023 public contract', async () => {
    const engine = await loadVendoredFacePreviewEngineFE032();
    expect(FACE_PREVIEW_ENGINE_LOADER_VERSION_FE032)
      .toBe('MHA-FACE-PREVIEW-ENGINE-LOADER-FE032-v1');
    expect(Object.keys(engine).sort()).toEqual([
      'FE023_CONTRACT_VERSION',
      'openDigestBoundProductPreviewSessionFE023',
    ]);
    expect(engine.FE023_CONTRACT_VERSION)
      .toBe('FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1');
    expect(typeof engine.openDigestBoundProductPreviewSessionFE023)
      .toBe('function');
    expect(typeof runVendoredFacePreviewOneShotFE032).toBe('function');
  });
});