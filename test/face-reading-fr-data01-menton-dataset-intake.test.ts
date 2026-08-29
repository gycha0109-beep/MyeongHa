import { describe, expect, it } from 'vitest';
import {
  buildMentonDatasetIntakeReportFRData01,
  validateMentonDatasetIntakeManifestFRData01,
  validateMentonDatasetRelativeAssetPathFRData01,
  type MentonDatasetIntakeManifestFRData01V1,
  type MentonDatasetVerifiedAssetFRData01V1,
  type MentonValidationDatasetFR47V1,
} from '../packages/face-reading/src/index.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;

function dataset(includeRepeat = false, repeatDigest = DIGEST_B): MentonValidationDatasetFR47V1 {
  return {
    schemaVersion: 'fr47-dataset-v1',
    datasetRef: 'dataset.fr-data01.unit',
    subjects: [
      { subjectRef: 'subject-calibration', independentSubject: true, partition: 'calibration' },
    ],
    captures: [
      {
        captureRef: 'capture-baseline',
        subjectRef: 'subject-calibration',
        stratum: 'neutral_frontal_baseline',
        canonicalAssetDigest: DIGEST_A,
        capturedAt: '2026-08-29T12:00:00Z',
        imageWidth: 1080,
        imageHeight: 1440,
        deviceRef: 'device-unit',
        physicalCaptureInstanceRef: 'physical-baseline',
        neutralExpressionApplied: true,
        headPositionInstructionApplied: true,
        poseAxis: null,
        poseDegrees: null,
        groundTruthLockedBeforeProviderRun: true,
        providerRunRef: null,
        providerRunExecutedAfterGroundTruthLock: false,
      },
      ...(includeRepeat ? [{
        captureRef: 'capture-repeat',
        subjectRef: 'subject-calibration',
        stratum: 'repeat_neutral_capture' as const,
        canonicalAssetDigest: repeatDigest,
        capturedAt: '2026-08-29T12:01:00Z',
        imageWidth: 1080,
        imageHeight: 1440,
        deviceRef: 'device-unit',
        physicalCaptureInstanceRef: 'physical-repeat',
        neutralExpressionApplied: true as const,
        headPositionInstructionApplied: true as const,
        poseAxis: null,
        poseDegrees: null,
        groundTruthLockedBeforeProviderRun: true as const,
        providerRunRef: null,
        providerRunExecutedAfterGroundTruthLock: false,
      }] : []),
    ],
    annotations: [
      {
        captureRef: 'capture-baseline',
        annotatorRef: 'annotator-a',
        targetName: 'soft_tissue_menton',
        x: 0.5,
        y: 0.75,
        providerOutputVisibleDuringAnnotation: false,
        annotationFrozenBeforeProviderScoring: true,
      },
      ...(includeRepeat ? [{
        captureRef: 'capture-repeat',
        annotatorRef: 'annotator-a',
        targetName: 'soft_tissue_menton' as const,
        x: 0.501,
        y: 0.751,
        providerOutputVisibleDuringAnnotation: false as const,
        annotationFrozenBeforeProviderScoring: true as const,
      }] : []),
    ],
    groundTruthFrozen: false,
    providerRunsExecutedAfterFreeze: false,
  };
}

function manifest(includeRepeat = false, repeatDigest = DIGEST_B): MentonDatasetIntakeManifestFRData01V1 {
  return {
    schemaVersion: 'fr-data01-intake-v1',
    dataset: dataset(includeRepeat, repeatDigest),
    assets: [
      { captureRef: 'capture-baseline', relativeAssetPath: 'subject-calibration/baseline.png' },
      ...(includeRepeat ? [{ captureRef: 'capture-repeat', relativeAssetPath: 'subject-calibration/repeat.jpg' }] : []),
    ],
  };
}

describe('FR-DATA-01 Menton dataset intake', () => {
  it('validates exact capture-to-asset coverage while preserving FR-47 fail-closed readiness', () => {
    const input = validateMentonDatasetIntakeManifestFRData01(manifest());
    const verified: readonly MentonDatasetVerifiedAssetFRData01V1[] = [{
      captureRef: 'capture-baseline',
      relativeAssetPath: 'subject-calibration/baseline.png',
      actualDigest: DIGEST_A,
      byteLength: 128,
      contentSignature: 'image/png',
    }];
    const report = buildMentonDatasetIntakeReportFRData01(input, verified);
    expect(report.datasetStructureValidated).toBe(true);
    expect(report.assetCoverageComplete).toBe(true);
    expect(report.assetDigestsVerified).toBe(true);
    expect(report.assetContentSignaturesVerified).toBe(true);
    expect(report.imageDecodabilityVerified).toBe(false);
    expect(report.imageDimensionsVerifiedAgainstBytes).toBe(false);
    expect(report.fr47Readiness.validationDatasetPresent).toBe(true);
    expect(report.fr47Readiness.allSubjectsHaveRequiredCaptureStrata).toBe(false);
    expect(report.empiricalScoringPerformed).toBe(false);
    expect(report.providerCandidateToMentonMappingValidated).toBe(false);
    expect(report.productionGeometryAuthorized).toBe(false);
  });

  it('rejects absolute, traversal, backslash, and ambiguous asset paths', () => {
    expect(() => validateMentonDatasetRelativeAssetPathFRData01('/tmp/capture.png')).toThrow(/root-relative POSIX/);
    expect(() => validateMentonDatasetRelativeAssetPathFRData01('../capture.png')).toThrow(/parent traversal/);
    expect(() => validateMentonDatasetRelativeAssetPathFRData01('subject/../capture.png')).toThrow(/parent traversal/);
    expect(() => validateMentonDatasetRelativeAssetPathFRData01('subject\\capture.png')).toThrow(/root-relative POSIX/);
    expect(() => validateMentonDatasetRelativeAssetPathFRData01('subject//capture.png')).toThrow(/empty, dot, or parent/);
  });

  it('rejects missing, duplicate, or unknown asset bindings', () => {
    const missing = { ...manifest(), assets: [] } as MentonDatasetIntakeManifestFRData01V1;
    expect(() => validateMentonDatasetIntakeManifestFRData01(missing)).toThrow(/exactly one asset binding/);

    const duplicate = {
      ...manifest(),
      assets: [
        { captureRef: 'capture-baseline', relativeAssetPath: 'a.png' },
        { captureRef: 'capture-baseline', relativeAssetPath: 'b.png' },
      ],
    } as MentonDatasetIntakeManifestFRData01V1;
    expect(() => validateMentonDatasetIntakeManifestFRData01(duplicate)).toThrow(/asset capture refs must be unique/);

    const unknown = {
      ...manifest(),
      assets: [{ captureRef: 'capture-unknown', relativeAssetPath: 'unknown.png' }],
    } as MentonDatasetIntakeManifestFRData01V1;
    expect(() => validateMentonDatasetIntakeManifestFRData01(unknown)).toThrow(/unknown capture/);
  });

  it('rejects digest mismatch, non-image signatures, and zero-length asset evidence', () => {
    const input = manifest();
    const base = {
      captureRef: 'capture-baseline',
      relativeAssetPath: 'subject-calibration/baseline.png',
      actualDigest: DIGEST_A,
      byteLength: 128,
      contentSignature: 'image/png' as const,
    };
    expect(() => buildMentonDatasetIntakeReportFRData01(input, [{ ...base, actualDigest: DIGEST_B }])).toThrow(/digest mismatch/);
    expect(() => buildMentonDatasetIntakeReportFRData01(input, [{ ...base, byteLength: 0 }])).toThrow(/positive byte length/);
    expect(() => buildMentonDatasetIntakeReportFRData01(input, [{ ...base, contentSignature: 'text/plain' as never }])).toThrow(/recognized image content signature/);
  });

  it('rejects byte-identical assets reused across distinct physical captures', () => {
    const input = manifest(true, DIGEST_A);
    const verified: readonly MentonDatasetVerifiedAssetFRData01V1[] = [
      {
        captureRef: 'capture-baseline',
        relativeAssetPath: 'subject-calibration/baseline.png',
        actualDigest: DIGEST_A,
        byteLength: 128,
        contentSignature: 'image/png',
      },
      {
        captureRef: 'capture-repeat',
        relativeAssetPath: 'subject-calibration/repeat.jpg',
        actualDigest: DIGEST_A,
        byteLength: 128,
        contentSignature: 'image/jpeg',
      },
    ];
    expect(() => buildMentonDatasetIntakeReportFRData01(input, verified)).toThrow(/cannot reuse byte-identical asset digests/);
  });
});
