import {
  validateMentonDatasetIntakeManifestFRData01,
  type MentonDatasetAssetContentSignatureFRData01V1,
  type MentonDatasetIntakeManifestFRData01V1,
} from './menton-dataset-intake-frdata01.js';
import { FaceAuthorityValidationError } from './validation.js';

export type ImageDimensionParserVariantFRData02V1 =
  | 'png_ihdr'
  | 'jpeg_sof'
  | 'webp_vp8x'
  | 'webp_vp8l'
  | 'webp_vp8';

export interface ImageByteDimensionsFRData02V1 {
  readonly contentSignature: MentonDatasetAssetContentSignatureFRData01V1;
  readonly parserVariant: ImageDimensionParserVariantFRData02V1;
  readonly width: number;
  readonly height: number;
}

export interface MentonDatasetImageDimensionEvidenceFRData02V1 extends ImageByteDimensionsFRData02V1 {
  readonly captureRef: string;
  readonly relativeAssetPath: string;
}

export interface MentonDatasetCaptureDimensionVerificationFRData02V1 {
  readonly captureRef: string;
  readonly relativeAssetPath: string;
  readonly contentSignature: MentonDatasetAssetContentSignatureFRData01V1;
  readonly parserVariant: ImageDimensionParserVariantFRData02V1;
  readonly manifestWidth: number;
  readonly manifestHeight: number;
  readonly encodedWidth: number;
  readonly encodedHeight: number;
  readonly dimensionsMatch: true;
}

export interface MentonDatasetImageDimensionReportFRData02V1 {
  readonly schemaVersion: 'fr-data02-image-dimensions-v1';
  readonly datasetRef: string;
  readonly captureCount: number;
  readonly captureVerifications: readonly MentonDatasetCaptureDimensionVerificationFRData02V1[];
  readonly imageByteHeaderStructureVerified: true;
  readonly imageDimensionsVerifiedAgainstBytes: true;
  readonly imageDecodabilityVerified: false;
  readonly pixelContentIntegrityVerified: false;
  readonly empiricalScoringPerformed: false;
  readonly providerCandidateToMentonMappingValidated: false;
  readonly repeatedCaptureRepeatabilityValidated: false;
  readonly poseStabilityValidated: false;
  readonly calibrationThresholdsDefined: false;
  readonly fr35PointToContourRelationValidated: false;
  readonly traditionalDigeEquivalenceValidated: false;
  readonly researchCandidateAdmitted: false;
  readonly productionGeometryAuthorized: false;
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

function fail(message: string): never {
  throw new FaceAuthorityValidationError(`FR-DATA-02 ${message}`);
}

function requireRange(bytes: Uint8Array, offset: number, length: number, label: string): void {
  if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0 || offset + length > bytes.length) {
    fail(`${label} is truncated or outside the available byte range.`);
  }
}

function u16be(bytes: Uint8Array, offset: number): number {
  requireRange(bytes, offset, 2, 'u16be field');
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function u16le(bytes: Uint8Array, offset: number): number {
  requireRange(bytes, offset, 2, 'u16le field');
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function u24le(bytes: Uint8Array, offset: number): number {
  requireRange(bytes, offset, 3, 'u24le field');
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

function u32be(bytes: Uint8Array, offset: number): number {
  requireRange(bytes, offset, 4, 'u32be field');
  return (
    bytes[offset]! * 0x1000000 +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  ) >>> 0;
}

function u32le(bytes: Uint8Array, offset: number): number {
  requireRange(bytes, offset, 4, 'u32le field');
  return (
    bytes[offset]! +
    (bytes[offset + 1]! << 8) +
    (bytes[offset + 2]! << 16) +
    bytes[offset + 3]! * 0x1000000
  ) >>> 0;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  requireRange(bytes, offset, length, 'ASCII field');
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function exactPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return bytes.length >= prefix.length && prefix.every((value, index) => bytes[index] === value);
}

function positiveDimensions(width: number, height: number, label: string): { width: number; height: number } {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    fail(`${label} exposes invalid non-positive encoded dimensions ${width}x${height}.`);
  }
  return { width, height };
}

function inspectPngDimensions(bytes: Uint8Array): ImageByteDimensionsFRData02V1 {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
  if (!exactPrefix(bytes, signature)) fail('PNG signature mismatch.');
  requireRange(bytes, 8, 16, 'PNG IHDR header');
  const chunkLength = u32be(bytes, 8);
  if (chunkLength !== 13 || ascii(bytes, 12, 4) !== 'IHDR') {
    fail('PNG must expose a canonical 13-byte IHDR as the first chunk.');
  }
  const { width, height } = positiveDimensions(u32be(bytes, 16), u32be(bytes, 20), 'PNG IHDR');
  return Object.freeze({
    contentSignature: 'image/png' as const,
    parserVariant: 'png_ihdr' as const,
    width,
    height,
  });
}

function inspectJpegDimensions(bytes: Uint8Array): ImageByteDimensionsFRData02V1 {
  if (!exactPrefix(bytes, [0xff, 0xd8])) fail('JPEG SOI signature mismatch.');
  let offset = 2;
  while (offset < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++]!;

    if (marker === 0x00) continue;
    if (marker === 0xd9) break;
    if (marker === 0xda) fail('JPEG reached SOS before a supported SOF dimension segment.');
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;

    requireRange(bytes, offset, 2, 'JPEG segment length');
    const segmentLength = u16be(bytes, offset);
    if (segmentLength < 2) fail(`JPEG marker 0x${marker.toString(16)} has invalid segment length.`);
    const payloadStart = offset + 2;
    const segmentEnd = offset + segmentLength;
    if (segmentEnd > bytes.length) fail(`JPEG marker 0x${marker.toString(16)} segment is truncated.`);

    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 7) fail('JPEG SOF segment is too short to contain encoded dimensions.');
      requireRange(bytes, payloadStart, 5, 'JPEG SOF dimensions');
      const { width, height } = positiveDimensions(
        u16be(bytes, payloadStart + 3),
        u16be(bytes, payloadStart + 1),
        'JPEG SOF',
      );
      return Object.freeze({
        contentSignature: 'image/jpeg' as const,
        parserVariant: 'jpeg_sof' as const,
        width,
        height,
      });
    }

    offset = segmentEnd;
  }
  fail('JPEG contains no supported SOF dimension segment before end-of-image.');
}

function inspectWebpDimensions(bytes: Uint8Array): ImageByteDimensionsFRData02V1 {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') fail('WebP RIFF/WEBP signature mismatch.');
  requireRange(bytes, 4, 8, 'WebP RIFF header');
  const declaredEnd = u32le(bytes, 4) + 8;
  if (declaredEnd > bytes.length) fail('WebP RIFF container is truncated relative to its declared size.');
  if (declaredEnd < 20) fail('WebP RIFF container is too short to contain an image chunk.');

  let offset = 12;
  while (offset + 8 <= declaredEnd) {
    const fourcc = ascii(bytes, offset, 4);
    const chunkSize = u32le(bytes, offset + 4);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + chunkSize;
    if (payloadEnd > declaredEnd) fail(`WebP ${fourcc} chunk is truncated.`);

    if (fourcc === 'VP8X') {
      if (chunkSize < 10) fail('WebP VP8X chunk is too short for canvas dimensions.');
      const { width, height } = positiveDimensions(
        u24le(bytes, payloadStart + 4) + 1,
        u24le(bytes, payloadStart + 7) + 1,
        'WebP VP8X',
      );
      return Object.freeze({
        contentSignature: 'image/webp' as const,
        parserVariant: 'webp_vp8x' as const,
        width,
        height,
      });
    }

    if (fourcc === 'VP8L') {
      if (chunkSize < 5) fail('WebP VP8L chunk is too short for dimensions.');
      requireRange(bytes, payloadStart, 5, 'WebP VP8L header');
      if (bytes[payloadStart] !== 0x2f) fail('WebP VP8L signature byte mismatch.');
      const b1 = bytes[payloadStart + 1]!;
      const b2 = bytes[payloadStart + 2]!;
      const b3 = bytes[payloadStart + 3]!;
      const b4 = bytes[payloadStart + 4]!;
      const { width, height } = positiveDimensions(
        1 + (((b2 & 0x3f) << 8) | b1),
        1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
        'WebP VP8L',
      );
      return Object.freeze({
        contentSignature: 'image/webp' as const,
        parserVariant: 'webp_vp8l' as const,
        width,
        height,
      });
    }

    if (fourcc === 'VP8 ') {
      if (chunkSize < 10) fail('WebP VP8 chunk is too short for frame dimensions.');
      requireRange(bytes, payloadStart, 10, 'WebP VP8 frame header');
      if (bytes[payloadStart + 3] !== 0x9d || bytes[payloadStart + 4] !== 0x01 || bytes[payloadStart + 5] !== 0x2a) {
        fail('WebP VP8 frame start code mismatch.');
      }
      const { width, height } = positiveDimensions(
        u16le(bytes, payloadStart + 6) & 0x3fff,
        u16le(bytes, payloadStart + 8) & 0x3fff,
        'WebP VP8',
      );
      return Object.freeze({
        contentSignature: 'image/webp' as const,
        parserVariant: 'webp_vp8' as const,
        width,
        height,
      });
    }

    offset = payloadEnd + (chunkSize % 2);
  }
  fail('WebP contains no supported VP8X, VP8L, or VP8 image dimension chunk.');
}

export function inspectImageByteDimensionsFRData02(bytes: Uint8Array): ImageByteDimensionsFRData02V1 {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) fail('image bytes must be a non-empty Uint8Array.');
  if (exactPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return inspectPngDimensions(bytes);
  if (exactPrefix(bytes, [0xff, 0xd8])) return inspectJpegDimensions(bytes);
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return inspectWebpDimensions(bytes);
  fail('unsupported image byte signature; expected PNG, JPEG, or WebP.');
}

export function buildMentonDatasetImageDimensionReportFRData02(
  manifest: MentonDatasetIntakeManifestFRData01V1,
  evidence: readonly MentonDatasetImageDimensionEvidenceFRData02V1[],
): MentonDatasetImageDimensionReportFRData02V1 {
  validateMentonDatasetIntakeManifestFRData01(manifest);
  if (evidence.length !== manifest.dataset.captures.length) {
    fail('dimension evidence count must exactly equal the FR-47 capture count.');
  }
  const captureRefs = evidence.map((entry) => entry.captureRef);
  if (new Set(captureRefs).size !== captureRefs.length) fail('dimension evidence capture refs must be unique.');

  const captureVerifications = manifest.dataset.captures.map((capture) => {
    const binding = manifest.assets.find((asset) => asset.captureRef === capture.captureRef)!;
    const entry = evidence.find((candidate) => candidate.captureRef === capture.captureRef);
    if (!entry) fail(`capture ${capture.captureRef} is missing image dimension evidence.`);
    if (entry.relativeAssetPath !== binding.relativeAssetPath) {
      fail(`capture ${capture.captureRef} dimension evidence path differs from its FR-DATA-01 binding.`);
    }
    positiveDimensions(entry.width, entry.height, `capture ${capture.captureRef}`);
    if (entry.width !== capture.imageWidth || entry.height !== capture.imageHeight) {
      fail(`capture ${capture.captureRef} encoded dimensions ${entry.width}x${entry.height} do not match manifest ${capture.imageWidth}x${capture.imageHeight}.`);
    }
    return Object.freeze({
      captureRef: capture.captureRef,
      relativeAssetPath: entry.relativeAssetPath,
      contentSignature: entry.contentSignature,
      parserVariant: entry.parserVariant,
      manifestWidth: capture.imageWidth,
      manifestHeight: capture.imageHeight,
      encodedWidth: entry.width,
      encodedHeight: entry.height,
      dimensionsMatch: true as const,
    });
  });

  return Object.freeze({
    schemaVersion: 'fr-data02-image-dimensions-v1' as const,
    datasetRef: manifest.dataset.datasetRef,
    captureCount: manifest.dataset.captures.length,
    captureVerifications: Object.freeze(captureVerifications),
    imageByteHeaderStructureVerified: true as const,
    imageDimensionsVerifiedAgainstBytes: true as const,
    imageDecodabilityVerified: false as const,
    pixelContentIntegrityVerified: false as const,
    empiricalScoringPerformed: false as const,
    providerCandidateToMentonMappingValidated: false as const,
    repeatedCaptureRepeatabilityValidated: false as const,
    poseStabilityValidated: false as const,
    calibrationThresholdsDefined: false as const,
    fr35PointToContourRelationValidated: false as const,
    traditionalDigeEquivalenceValidated: false as const,
    researchCandidateAdmitted: false as const,
    productionGeometryAuthorized: false as const,
  });
}
