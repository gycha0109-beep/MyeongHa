export const MOBILE_FACE_MEDIA_MAX_BYTES_V1 = 16 * 1024 * 1024;

export const MOBILE_FACE_MEDIA_MIME_TYPES_V1 = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
] as const);

export type MobileFaceMediaMimeTypeV1 =
  (typeof MOBILE_FACE_MEDIA_MIME_TYPES_V1)[number];

export type MobileFaceMediaSourceV1 = 'camera' | 'library';

export interface MobileFaceMediaAssetV1 {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: MobileFaceMediaMimeTypeV1 | null;
  readonly fileSize: number | null;
  readonly source: MobileFaceMediaSourceV1;
}

export interface RawMobileFaceMediaAssetV1 {
  readonly uri: unknown;
  readonly width: unknown;
  readonly height: unknown;
  readonly type?: unknown;
  readonly mimeType?: unknown;
  readonly fileSize?: unknown;
}

export type MobileFaceMediaPickerResultV1 =
  | Readonly<{ kind: 'selected'; asset: MobileFaceMediaAssetV1 }>
  | Readonly<{ kind: 'cancelled' }>
  | Readonly<{ kind: 'permission_denied' }>
  | Readonly<{ kind: 'invalid_asset'; reason: string }>;

const MIME_SET = new Set<string>(MOBILE_FACE_MEDIA_MIME_TYPES_V1);

function normalizeMimeType(value: unknown): MobileFaceMediaMimeTypeV1 | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !MIME_SET.has(value)) {
    throw new Error('unsupported_mime_type');
  }
  return value as MobileFaceMediaMimeTypeV1;
}

function normalizeFileSize(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error('invalid_file_size');
  }
  const size = Number(value);
  if (size > MOBILE_FACE_MEDIA_MAX_BYTES_V1) {
    throw new Error('asset_too_large');
  }
  return size;
}

export function normalizeMobileFaceMediaAssetV1(
  asset: RawMobileFaceMediaAssetV1,
  source: MobileFaceMediaSourceV1,
): MobileFaceMediaAssetV1 {
  if (typeof asset.uri !== 'string' || asset.uri.trim().length === 0) {
    throw new Error('invalid_uri');
  }
  if (
    typeof asset.width !== 'number' ||
    !Number.isSafeInteger(asset.width) ||
    asset.width <= 0 ||
    typeof asset.height !== 'number' ||
    !Number.isSafeInteger(asset.height) ||
    asset.height <= 0
  ) {
    throw new Error('invalid_dimensions');
  }
  if (asset.type !== undefined && asset.type !== null && asset.type !== 'image') {
    throw new Error('unsupported_media_type');
  }

  return Object.freeze({
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    mimeType: normalizeMimeType(asset.mimeType),
    fileSize: normalizeFileSize(asset.fileSize),
    source,
  });
}
