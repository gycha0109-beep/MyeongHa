import { describe, expect, it } from 'vitest';

import {
  MOBILE_FACE_MEDIA_MAX_BYTES_V1,
  normalizeMobileFaceMediaAssetV1,
} from '../apps/mobile/src/platform/media/mobile-face-media.js';

describe('mobile Face media boundary', () => {
  it('projects only the fields needed for ephemeral preview', () => {
    const asset = normalizeMobileFaceMediaAssetV1(
      {
        uri: 'file:///tmp/face.jpg',
        width: 1200,
        height: 1600,
        type: 'image',
        mimeType: 'image/jpeg',
        fileSize: 2_000_000,
      },
      'library',
    );

    expect(asset).toEqual({
      uri: 'file:///tmp/face.jpg',
      width: 1200,
      height: 1600,
      mimeType: 'image/jpeg',
      fileSize: 2_000_000,
      source: 'library',
    });
    expect(asset).not.toHaveProperty('assetId');
    expect(asset).not.toHaveProperty('fileName');
    expect(asset).not.toHaveProperty('exif');
    expect(asset).not.toHaveProperty('base64');
  });

  it('rejects oversized and explicitly unsupported image formats', () => {
    expect(() =>
      normalizeMobileFaceMediaAssetV1(
        {
          uri: 'file:///tmp/large.jpg',
          width: 100,
          height: 100,
          type: 'image',
          mimeType: 'image/jpeg',
          fileSize: MOBILE_FACE_MEDIA_MAX_BYTES_V1 + 1,
        },
        'library',
      ),
    ).toThrow('asset_too_large');

    expect(() =>
      normalizeMobileFaceMediaAssetV1(
        {
          uri: 'file:///tmp/gif.gif',
          width: 100,
          height: 100,
          type: 'image',
          mimeType: 'image/gif',
          fileSize: 1000,
        },
        'library',
      ),
    ).toThrow('unsupported_mime_type');
  });

  it('accepts absent MIME/file-size metadata but still requires a valid image projection', () => {
    expect(
      normalizeMobileFaceMediaAssetV1(
        {
          uri: 'file:///tmp/camera.jpg',
          width: 1000,
          height: 1000,
          type: 'image',
        },
        'camera',
      ),
    ).toMatchObject({
      mimeType: null,
      fileSize: null,
      source: 'camera',
    });
  });
});
