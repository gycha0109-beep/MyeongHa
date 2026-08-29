import { describe, expect, it } from 'vitest';
import {
  buildMentonDatasetImageDimensionReportFRData02,
  inspectImageByteDimensionsFRData02,
  type MentonDatasetImageDimensionEvidenceFRData02V1,
  type MentonDatasetIntakeManifestFRData01V1,
} from '../packages/face-reading/src/index.js';

function writeU16BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function writeU16LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeU24LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
}

function writeU32BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeU32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  [...value].forEach((char, index) => { bytes[offset + index] = char.charCodeAt(0); });
}

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  writeU32BE(bytes, 8, 13);
  writeAscii(bytes, 12, 'IHDR');
  writeU32BE(bytes, 16, width);
  writeU32BE(bytes, 20, height);
  return bytes;
}

function jpegSof(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(23);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  writeU16BE(bytes, 7, height);
  writeU16BE(bytes, 9, width);
  bytes[11] = 0x03;
  bytes.set([0x01,0x11,0x00,0x02,0x11,0x00,0x03,0x11,0x00], 12);
  bytes.set([0xff, 0xd9], 21);
  return bytes;
}

function webpVp8x(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  writeAscii(bytes, 0, 'RIFF');
  writeU32LE(bytes, 4, 22);
  writeAscii(bytes, 8, 'WEBP');
  writeAscii(bytes, 12, 'VP8X');
  writeU32LE(bytes, 16, 10);
  writeU24LE(bytes, 24, width - 1);
  writeU24LE(bytes, 27, height - 1);
  return bytes;
}

function webpVp8l(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(26);
  writeAscii(bytes, 0, 'RIFF');
  writeU32LE(bytes, 4, 18);
  writeAscii(bytes, 8, 'WEBP');
  writeAscii(bytes, 12, 'VP8L');
  writeU32LE(bytes, 16, 5);
  const w = width - 1;
  const h = height - 1;
  bytes[20] = 0x2f;
  bytes[21] = w & 0xff;
  bytes[22] = ((w >>> 8) & 0x3f) | ((h & 0x03) << 6);
  bytes[23] = (h >>> 2) & 0xff;
  bytes[24] = (h >>> 10) & 0x0f;
  return bytes;
}

function webpVp8(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  writeAscii(bytes, 0, 'RIFF');
  writeU32LE(bytes, 4, 22);
  writeAscii(bytes, 8, 'WEBP');
  writeAscii(bytes, 12, 'VP8 ');
  writeU32LE(bytes, 16, 10);
  bytes.set([0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a], 20);
  writeU16LE(bytes, 26, width);
  writeU16LE(bytes, 28, height);
  return bytes;
}

function manifest(width = 1080, height = 1440): MentonDatasetIntakeManifestFRData01V1 {
  return {
    schemaVersion: 'fr-data01-intake-v1',
    dataset: {
      schemaVersion: 'fr47-dataset-v1',
      datasetRef: 'dataset.fr-data02.unit',
      subjects: [{ subjectRef: 'subject-calibration', independentSubject: true, partition: 'calibration' }],
      captures: [{
        captureRef: 'capture-baseline',
        subjectRef: 'subject-calibration',
        stratum: 'neutral_frontal_baseline',
        canonicalAssetDigest: `sha256:${'a'.repeat(64)}`,
        capturedAt: '2026-08-29T12:00:00Z',
        imageWidth: width,
        imageHeight: height,
        deviceRef: 'device-unit',
        physicalCaptureInstanceRef: 'physical-baseline',
        neutralExpressionApplied: true,
        headPositionInstructionApplied: true,
        poseAxis: null,
        poseDegrees: null,
        groundTruthLockedBeforeProviderRun: true,
        providerRunRef: null,
        providerRunExecutedAfterGroundTruthLock: false,
      }],
      annotations: [{
        captureRef: 'capture-baseline',
        annotatorRef: 'annotator-a',
        targetName: 'soft_tissue_menton',
        x: 0.5,
        y: 0.75,
        providerOutputVisibleDuringAnnotation: false,
        annotationFrozenBeforeProviderScoring: true,
      }],
      groundTruthFrozen: false,
      providerRunsExecutedAfterFreeze: false,
    },
    assets: [{ captureRef: 'capture-baseline', relativeAssetPath: 'subject-calibration/baseline.png' }],
  };
}

describe('FR-DATA-02 encoded image dimension verification', () => {
  it('reads PNG IHDR dimensions without claiming full decode', () => {
    expect(inspectImageByteDimensionsFRData02(pngHeader(1080, 1440))).toEqual({
      contentSignature: 'image/png', parserVariant: 'png_ihdr', width: 1080, height: 1440,
    });
  });

  it('reads JPEG SOF dimensions', () => {
    expect(inspectImageByteDimensionsFRData02(jpegSof(640, 480))).toEqual({
      contentSignature: 'image/jpeg', parserVariant: 'jpeg_sof', width: 640, height: 480,
    });
  });

  it('reads WebP VP8X, VP8L, and VP8 dimensions', () => {
    expect(inspectImageByteDimensionsFRData02(webpVp8x(800, 600))).toEqual({
      contentSignature: 'image/webp', parserVariant: 'webp_vp8x', width: 800, height: 600,
    });
    expect(inspectImageByteDimensionsFRData02(webpVp8l(321, 222))).toEqual({
      contentSignature: 'image/webp', parserVariant: 'webp_vp8l', width: 321, height: 222,
    });
    expect(inspectImageByteDimensionsFRData02(webpVp8(320, 240))).toEqual({
      contentSignature: 'image/webp', parserVariant: 'webp_vp8', width: 320, height: 240,
    });
  });

  it('fails closed on truncated or structurally unsupported image headers', () => {
    expect(() => inspectImageByteDimensionsFRData02(new Uint8Array([0x89,0x50,0x4e,0x47]))).toThrow(/unsupported image byte signature|truncated/);
    const badJpeg = new Uint8Array([0xff,0xd8,0xff,0xda,0x00,0x02]);
    expect(() => inspectImageByteDimensionsFRData02(badJpeg)).toThrow(/SOS before a supported SOF/);
    const badWebp = webpVp8x(100, 100).slice(0, 25);
    expect(() => inspectImageByteDimensionsFRData02(badWebp)).toThrow(/truncated/);
  });

  it('requires exact manifest-to-byte dimension equality and keeps semantic authority closed', () => {
    const input = manifest();
    const evidence: readonly MentonDatasetImageDimensionEvidenceFRData02V1[] = [{
      captureRef: 'capture-baseline',
      relativeAssetPath: 'subject-calibration/baseline.png',
      ...inspectImageByteDimensionsFRData02(pngHeader(1080, 1440)),
    }];
    const report = buildMentonDatasetImageDimensionReportFRData02(input, evidence);
    expect(report.imageByteHeaderStructureVerified).toBe(true);
    expect(report.imageDimensionsVerifiedAgainstBytes).toBe(true);
    expect(report.captureVerifications[0]?.dimensionsMatch).toBe(true);
    expect(report.imageDecodabilityVerified).toBe(false);
    expect(report.pixelContentIntegrityVerified).toBe(false);
    expect(report.empiricalScoringPerformed).toBe(false);
    expect(report.providerCandidateToMentonMappingValidated).toBe(false);
    expect(report.productionGeometryAuthorized).toBe(false);

    const mismatch: readonly MentonDatasetImageDimensionEvidenceFRData02V1[] = [{
      ...evidence[0]!,
      width: 1079,
    }];
    expect(() => buildMentonDatasetImageDimensionReportFRData02(input, mismatch)).toThrow(/do not match manifest 1080x1440/);
  });

  it('rejects missing capture coverage or path drift in dimension evidence', () => {
    const input = manifest();
    expect(() => buildMentonDatasetImageDimensionReportFRData02(input, [])).toThrow(/count must exactly equal/);
    const evidence: readonly MentonDatasetImageDimensionEvidenceFRData02V1[] = [{
      captureRef: 'capture-baseline',
      relativeAssetPath: 'other/baseline.png',
      ...inspectImageByteDimensionsFRData02(pngHeader(1080, 1440)),
    }];
    expect(() => buildMentonDatasetImageDimensionReportFRData02(input, evidence)).toThrow(/path differs/);
  });
});
