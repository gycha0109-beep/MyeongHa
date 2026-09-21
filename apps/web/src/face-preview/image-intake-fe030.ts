export const FACE_PREVIEW_IMAGE_INTAKE_VERSION_FE030 =
  'MHA-FACE-PREVIEW-IMAGE-INTAKE-FE030-v1' as const;

export const FACE_PREVIEW_MAX_INPUT_BYTES_FE030 = 16 * 1024 * 1024;
export const FACE_PREVIEW_MAX_DECODED_PIXELS_FE030 = 24_000_000;
export const FACE_PREVIEW_MAX_CANONICAL_EDGE_FE030 = 4096;
export const FACE_PREVIEW_CANONICAL_MIME_FE030 = 'image/jpeg' as const;
export const FACE_PREVIEW_CANONICAL_JPEG_QUALITY_FE030 = 0.95;

const INPUT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type FacePreviewInputMimeFE030 = (typeof INPUT_MIME_TYPES)[number];

export type FacePreviewImageIntakeRejectionCodeFE030 =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_IMAGE_TYPE'
  | 'IMAGE_SIGNATURE_MISMATCH'
  | 'IMAGE_TOO_LARGE'
  | 'BROWSER_CAPABILITY_UNAVAILABLE'
  | 'IMAGE_DECODE_FAILED'
  | 'IMAGE_PIXEL_LIMIT_EXCEEDED'
  | 'CANONICAL_REENCODE_FAILED';

export interface FacePreviewImageIntakeInputFE030 {
  readonly schemaVersion: 'myeongha-face-preview-image-intake-input-v1';
  readonly blob: Blob;
}

export interface FacePreviewDecodedImageFE030 {
  readonly width: number;
  readonly height: number;
  readonly source: CanvasImageSource;
  readonly close: () => void;
}

export interface FacePreviewImageIntakePlatformFE030 {
  readonly decode: (blob: Blob) => Promise<FacePreviewDecodedImageFE030>;
  readonly reencode: (
    image: FacePreviewDecodedImageFE030,
    width: number,
    height: number,
  ) => Promise<Blob>;
}

export interface FacePreviewImageIntakeReceiptFE030 {
  readonly sourceMime: FacePreviewInputMimeFE030;
  readonly sourceBytes: number;
  readonly decodedWidth: number;
  readonly decodedHeight: number;
  readonly canonicalMime: typeof FACE_PREVIEW_CANONICAL_MIME_FE030;
  readonly canonicalBytes: number;
  readonly canonicalWidth: number;
  readonly canonicalHeight: number;
  readonly orientationAppliedDuringDecode: true;
  readonly metadataPreserved: false;
  readonly rawInputPersisted: false;
  readonly identityEmbeddingCreated: false;
}

export type FacePreviewImageIntakeResultFE030 =
  | Readonly<{
      schemaVersion: 'myeongha-face-preview-image-intake-result-v1';
      contractVersion: typeof FACE_PREVIEW_IMAGE_INTAKE_VERSION_FE030;
      status: 'ready';
      image: Blob;
      receipt: FacePreviewImageIntakeReceiptFE030;
    }>
  | Readonly<{
      schemaVersion: 'myeongha-face-preview-image-intake-result-v1';
      contractVersion: typeof FACE_PREVIEW_IMAGE_INTAKE_VERSION_FE030;
      status: 'rejected';
      rejection: Readonly<{
        code: FacePreviewImageIntakeRejectionCodeFE030;
        stage: 'intake';
      }>;
    }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length &&
    keys.every((key) => allowed.includes(key));
}

function rejected(
  code: FacePreviewImageIntakeRejectionCodeFE030,
): FacePreviewImageIntakeResultFE030 {
  return Object.freeze({
    schemaVersion: 'myeongha-face-preview-image-intake-result-v1' as const,
    contractVersion: FACE_PREVIEW_IMAGE_INTAKE_VERSION_FE030,
    status: 'rejected' as const,
    rejection: Object.freeze({
      code,
      stage: 'intake' as const,
    }),
  });
}

function isSupportedMime(value: string): value is FacePreviewInputMimeFE030 {
  return (INPUT_MIME_TYPES as readonly string[]).includes(value);
}

function signatureMatches(
  mime: FacePreviewInputMimeFE030,
  bytes: Uint8Array,
): boolean {
  if (mime === 'image/jpeg') {
    return bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff;
  }
  if (mime === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length &&
      signature.every((byte, index) => bytes[index] === byte);
  }
  return bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
}

function canonicalDimensions(
  width: number,
  height: number,
): Readonly<{ width: number; height: number }> {
  const longest = Math.max(width, height);
  if (longest <= FACE_PREVIEW_MAX_CANONICAL_EDGE_FE030) {
    return Object.freeze({ width, height });
  }
  const scale = FACE_PREVIEW_MAX_CANONICAL_EDGE_FE030 / longest;
  return Object.freeze({
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  });
}

function browserPlatform(): FacePreviewImageIntakePlatformFE030 | null {
  if (
    typeof globalThis.createImageBitmap !== 'function' ||
    typeof document === 'undefined' ||
    typeof document.createElement !== 'function'
  ) {
    return null;
  }

  return Object.freeze({
    async decode(blob: Blob): Promise<FacePreviewDecodedImageFE030> {
      const bitmap = await globalThis.createImageBitmap(blob, {
        imageOrientation: 'from-image',
      });
      return Object.freeze({
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        close: () => bitmap.close(),
      });
    },
    async reencode(
      image: FacePreviewDecodedImageFE030,
      width: number,
      height: number,
    ): Promise<Blob> {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context === null) {
        throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
      }
      context.drawImage(image.source, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(
          resolve,
          FACE_PREVIEW_CANONICAL_MIME_FE030,
          FACE_PREVIEW_CANONICAL_JPEG_QUALITY_FE030,
        );
      });
      if (blob === null) {
        throw new Error('CANVAS_REENCODE_FAILED');
      }
      return blob;
    },
  });
}

export async function sanitizeFacePreviewImageFE030(
  input: FacePreviewImageIntakeInputFE030,
  platform: FacePreviewImageIntakePlatformFE030 | null = browserPlatform(),
): Promise<FacePreviewImageIntakeResultFE030> {
  if (
    !isRecord(input) ||
    !exactKeys(input, ['schemaVersion', 'blob']) ||
    input.schemaVersion !== 'myeongha-face-preview-image-intake-input-v1' ||
    !(input.blob instanceof Blob) ||
    input.blob.size <= 0
  ) {
    return rejected('INVALID_INPUT');
  }

  if (!isSupportedMime(input.blob.type)) {
    return rejected('UNSUPPORTED_IMAGE_TYPE');
  }
  if (input.blob.size > FACE_PREVIEW_MAX_INPUT_BYTES_FE030) {
    return rejected('IMAGE_TOO_LARGE');
  }

  let signature: Uint8Array;
  try {
    signature = new Uint8Array(
      await input.blob.slice(0, 16).arrayBuffer(),
    );
  } catch {
    return rejected('INVALID_INPUT');
  }
  if (!signatureMatches(input.blob.type, signature)) {
    return rejected('IMAGE_SIGNATURE_MISMATCH');
  }

  if (platform === null) {
    return rejected('BROWSER_CAPABILITY_UNAVAILABLE');
  }

  let decoded: FacePreviewDecodedImageFE030;
  try {
    decoded = await platform.decode(input.blob);
  } catch {
    return rejected('IMAGE_DECODE_FAILED');
  }

  try {
    if (
      !Number.isSafeInteger(decoded.width) ||
      !Number.isSafeInteger(decoded.height) ||
      decoded.width <= 0 ||
      decoded.height <= 0
    ) {
      return rejected('IMAGE_DECODE_FAILED');
    }

    const pixels = decoded.width * decoded.height;
    if (
      !Number.isSafeInteger(pixels) ||
      pixels > FACE_PREVIEW_MAX_DECODED_PIXELS_FE030
    ) {
      return rejected('IMAGE_PIXEL_LIMIT_EXCEEDED');
    }

    const dimensions = canonicalDimensions(decoded.width, decoded.height);
    let canonical: Blob;
    try {
      canonical = await platform.reencode(
        decoded,
        dimensions.width,
        dimensions.height,
      );
    } catch {
      return rejected('CANONICAL_REENCODE_FAILED');
    }

    if (
      !(canonical instanceof Blob) ||
      canonical.size <= 0 ||
      canonical.type !== FACE_PREVIEW_CANONICAL_MIME_FE030
    ) {
      return rejected('CANONICAL_REENCODE_FAILED');
    }

    return Object.freeze({
      schemaVersion: 'myeongha-face-preview-image-intake-result-v1' as const,
      contractVersion: FACE_PREVIEW_IMAGE_INTAKE_VERSION_FE030,
      status: 'ready' as const,
      image: canonical,
      receipt: Object.freeze({
        sourceMime: input.blob.type,
        sourceBytes: input.blob.size,
        decodedWidth: decoded.width,
        decodedHeight: decoded.height,
        canonicalMime: FACE_PREVIEW_CANONICAL_MIME_FE030,
        canonicalBytes: canonical.size,
        canonicalWidth: dimensions.width,
        canonicalHeight: dimensions.height,
        orientationAppliedDuringDecode: true as const,
        metadataPreserved: false as const,
        rawInputPersisted: false as const,
        identityEmbeddingCreated: false as const,
      }),
    });
  } finally {
    try {
      decoded.close();
    } catch {
      // Cleanup failure does not widen the product result or retain a reference.
    }
  }
}
