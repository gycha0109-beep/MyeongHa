import { describe, expect, it } from 'vitest';
import {
  FACE_PREVIEW_ENGINE_DELIVERY_VERSION_FE033,
  loadFacePreviewEngineFE033,
} from './engine-loader-fe033.js';

describe('FE033 face preview engine delivery', () => {
  it('loads the pinned public preview-engine entry and projects only FE023', async () => {
    expect(FACE_PREVIEW_ENGINE_DELIVERY_VERSION_FE033)
      .toBe('MHA-FACE-PREVIEW-ENGINE-DELIVERY-FE033-v1');

    const first = await loadFacePreviewEngineFE033();
    const second = await loadFacePreviewEngineFE033();

    expect(second).toBe(first);
    expect(first.FE023_CONTRACT_VERSION)
      .toBe('FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1');
    expect(typeof first.openDigestBoundProductPreviewSessionFE023).toBe('function');
    expect(Object.keys(first).sort()).toEqual([
      'FE023_CONTRACT_VERSION',
      'openDigestBoundProductPreviewSessionFE023',
    ]);
  });
});
