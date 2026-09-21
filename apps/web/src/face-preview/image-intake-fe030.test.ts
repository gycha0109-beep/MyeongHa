import { describe, expect, it, vi } from 'vitest';
import {
  FACE_PREVIEW_CANONICAL_MIME_FE030,
  FACE_PREVIEW_IMAGE_INTAKE_VERSION_FE030,
  FACE_PREVIEW_MAX_INPUT_BYTES_FE030,
  sanitizeFacePreviewImageFE030,
  type FacePreviewImageIntakePlatformFE030,
} from './image-intake-fe030.js';

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);

function imageBlob(
  bytes: Uint8Array = jpegBytes,
  type = 'image/jpeg',
): Blob {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type });
}

function platform(
  width = 3024,
  height = 4032,
): FacePreviewImageIntakePlatformFE030 {
  return {
    decode: vi.fn().mockResolvedValue({
      width,
      height,
      source: {} as CanvasImageSource,
      close: vi.fn(),
    }),
    reencode: vi.fn().mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3])], {
        type: FACE_PREVIEW_CANONICAL_MIME_FE030,
      }),
    ),
  };
}

describe('FE030 Face Preview image intake', () => {
  it('validates signature, strips metadata through canonical re-encode, and bounds the long edge', async () => {
    const p = platform();
    const source = imageBlob();
    const result = await sanitizeFacePreviewImageFE030({
      schemaVersion: 'myeongha-face-preview-image-intake-input-v1',
      blob: source,
    }, p);

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready');

    expect(FACE_PREVIEW_IMAGE_INTAKE_VERSION_FE030)
      .toBe('MHA-FACE-PREVIEW-IMAGE-INTAKE-FE030-v1');
    expect(p.decode).toHaveBeenCalledWith(source);
    expect(p.reencode).toHaveBeenCalledWith(
      expect.objectContaining({ width: 3024, height: 4032 }),
      3024,
      4032,
    );
    expect(result.image).not.toBe(source);
    expect(result.receipt).toMatchObject({
      sourceMime: 'image/jpeg',
      decodedWidth: 3024,
      decodedHeight: 4032,
      canonicalMime: 'image/jpeg',
      canonicalWidth: 3024,
      canonicalHeight: 4032,
      orientationAppliedDuringDecode: true,
      metadataPreserved: false,
      rawInputPersisted: false,
      identityEmbeddingCreated: false,
    });
    expect(JSON.stringify(result)).not.toContain('exif');
  });

  it('downscales only when the canonical edge bound is exceeded', async () => {
    const p = platform(6000, 3000);
    const result = await sanitizeFacePreviewImageFE030({
      schemaVersion: 'myeongha-face-preview-image-intake-input-v1',
      blob: imageBlob(),
    }, p);
    expect(result.status).toBe('ready');
    expect(p.reencode).toHaveBeenCalledWith(
      expect.anything(),
      4096,
      2048,
    );
  });

  it.each([
    ['image/png', jpegBytes, 'IMAGE_SIGNATURE_MISMATCH'],
    ['image/jpeg', pngBytes, 'IMAGE_SIGNATURE_MISMATCH'],
    ['image/gif', new Uint8Array([0x47, 0x49, 0x46]), 'UNSUPPORTED_IMAGE_TYPE'],
  ])('fails closed on MIME/signature mismatch', async (type, bytes, code) => {
    const result = await sanitizeFacePreviewImageFE030({
      schemaVersion: 'myeongha-face-preview-image-intake-input-v1',
      blob: imageBlob(bytes, type),
    }, platform());
    expect(result).toMatchObject({
      status: 'rejected',
      rejection: { code, stage: 'intake' },
    });
  });

  it('rejects oversized byte and pixel inputs before analysis', async () => {
    const oversized = new Blob(
      [new ArrayBuffer(FACE_PREVIEW_MAX_INPUT_BYTES_FE030 + 1)],
      { type: 'image/jpeg' },
    );
    expect(await sanitizeFacePreviewImageFE030({
      schemaVersion: 'myeongha-face-preview-image-intake-input-v1',
      blob: oversized,
    }, platform())).toMatchObject({
      status: 'rejected',
      rejection: { code: 'IMAGE_TOO_LARGE' },
    });

    const p = platform(6000, 5000);
    const result = await sanitizeFacePreviewImageFE030({
      schemaVersion: 'myeongha-face-preview-image-intake-input-v1',
      blob: imageBlob(),
    }, p);
    expect(result).toMatchObject({
      status: 'rejected',
      rejection: { code: 'IMAGE_PIXEL_LIMIT_EXCEEDED' },
    });
    expect(p.reencode).not.toHaveBeenCalled();
  });

  it('normalizes decode/re-encode/browser capability failures without raw errors', async () => {
    const decodeFailure: FacePreviewImageIntakePlatformFE030 = {
      decode: vi.fn().mockRejectedValue(new Error('decoder secret')),
      reencode: vi.fn(),
    };
    const decoded = await sanitizeFacePreviewImageFE030({
      schemaVersion: 'myeongha-face-preview-image-intake-input-v1',
      blob: imageBlob(),
    }, decodeFailure);
    expect(decoded).toMatchObject({
      status: 'rejected',
      rejection: { code: 'IMAGE_DECODE_FAILED' },
    });
    expect(JSON.stringify(decoded)).not.toContain('decoder secret');

    const reencodeFailure = platform();
    vi.mocked(reencodeFailure.reencode)
      .mockRejectedValue(new Error('canvas secret'));
    const encoded = await sanitizeFacePreviewImageFE030({
      schemaVersion: 'myeongha-face-preview-image-intake-input-v1',
      blob: imageBlob(),
    }, reencodeFailure);
    expect(encoded).toMatchObject({
      status: 'rejected',
      rejection: { code: 'CANONICAL_REENCODE_FAILED' },
    });
    expect(JSON.stringify(encoded)).not.toContain('canvas secret');

    expect(await sanitizeFacePreviewImageFE030({
      schemaVersion: 'myeongha-face-preview-image-intake-input-v1',
      blob: imageBlob(),
    }, null)).toMatchObject({
      status: 'rejected',
      rejection: { code: 'BROWSER_CAPABILITY_UNAVAILABLE' },
    });
  });
});